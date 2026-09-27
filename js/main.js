// Bootstrap: build the delta, turn scroll into story time and a camera, run one render loop.
import { SEED, GLOBE } from './story.js';
import { buildDelta } from './delta.js';
import { buildField } from './field.js';
import { createTerrain } from './gl.js';
import { createOverlay } from './overlay.js';
import { createScenes } from './scenes.js';
import { spring, calendarLabel, smoothstep } from './timeline.js';
import { createHud } from './hud.js';
import { createBands } from './bands.js';
import { createScrubber } from './scrubber.js';
import { createPointer } from './pointer.js';
import { runIntro } from './intro.js';
import { formatMars } from './mars.js';
import { createGovernor } from './governor.js';

const root = document.documentElement;
const reduced =
  matchMedia('(prefers-reduced-motion: reduce)').matches ||
  new URLSearchParams(location.search).get('motion') === 'reduce';
if (reduced) root.classList.add('reduced');

export const geo = buildDelta(SEED);
const overlay = createOverlay(document.getElementById('overlay'), geo);
let terrain = null;
export const scenes = createScenes({ geo });

export const state = {
  cam: { x: 0, y: 1230, h: 1900 }, T: 1, band: 0, bandFrom: 0, bandMix: 1,
  lens: { x: -999, y: -999, r: 90, on: false }, time: 0, dim: 0, planet: 0, tilt: 0, globe: null, intro: 1,
  reduced, hover: null, lit: null, focus: null, focusPoint: null, labelSub: '',
};
export const tickers = [];
const vel = { x: 0, y: 0, h: 0, T: 0, dim: 0, z: 0 };
let zoomOut = null; // sprung progress along the pull-back to orbit, while on that path

let quality = matchMedia('(pointer: coarse)').matches || innerWidth < 700 ? 0.6 : 1;
let dirty = true; // something outside the frame loop changed (resize, terrain ready)

function resize() {
  const dpr = devicePixelRatio || 1;
  overlay.resize(innerWidth, innerHeight, dpr);
  if (terrain) terrain.resize(innerWidth, innerHeight, dpr, quality);
  scenes.measure();
  dirty = true;
}
addEventListener('resize', resize, { passive: true });
new ResizeObserver(() => scenes.measure()).observe(document.body);
document.fonts?.ready.then(() => scenes.measure());
resize();

// Start on the right frame (no fly-in from the default camera after a reload mid-page).
{
  const t = scenes.target(innerWidth, innerHeight);
  Object.assign(state.cam, t.cam);
  state.T = t.T; state.dim = t.dim;
}

// How far out in orbit the camera is: derived from the zoom, so every layer agrees.
function orbit(z) {
  state.tilt = scenes.tiltAt(z ?? scenes.zFor(state.cam.h, innerWidth, innerHeight));
  state.planet = smoothstep(4000, 40000, state.cam.h);
  state.globe = state.planet > 0.001 ? { cx: GLOBE.cx, cy: GLOBE.cy, R: GLOBE.R, tilt: state.tilt } : null;
}

// The terrain (field build + shader compile) waits until after the first frames, so the text and
// the channels paint at once and the terrain fades in behind them.
const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
later(() => {
  terrain = createTerrain(document.getElementById('terrain'), buildField(geo, SEED), geo);
  if (terrain) terrain.resize(innerWidth, innerHeight, devicePixelRatio || 1, quality);
  else root.classList.add('no-webgl');
  dirty = true;
}, { timeout: 400 });

// Quality governor (js/governor.js), judged against this display's own pace.
const gov = createGovernor({
  start: quality,
  onChange(q) {
    quality = q;
    terrain.resize(innerWidth, innerHeight, devicePixelRatio || 1, quality);
    dirty = true;
  },
});
function governor(ms) {
  if (!terrain || reduced) return;
  gov.sample(ms);
}

// Draw only when something moved. Otherwise the clouds, pulses and dashes tick at ~30 fps, and
// with reduced motion nothing redraws at all.
const seen = {};
function changed() {
  const now = [state.cam.x, state.cam.y, state.cam.h, state.T, state.dim, state.tilt, state.bandMix, state.band,
    state.intro, state.lens.on ? state.lens.x : -1, state.lens.y, state.hover, state.lit];
  let moved = false;
  for (let i = 0; i < now.length; i++) {
    const a = now[i], b = seen[i];
    if (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > 1e-4 * (1 + Math.abs(a)) : a !== b) moved = true;
    seen[i] = a;
  }
  return moved;
}

export const hud = createHud();
const bands = createBands(state);
const scrubber = createScrubber({ onSeek: (T) => scenes.scrollToT(T) });
tickers.push((st, target, dt) => {
  bands.tick(dt);
  hud.update(st, target);
  scrubber.update(st.T, target.scene && target.scene.id, target.T);
});

const NAV = ['top', 'iranspoti', 'sibkade', 'helpfinity', 'sibkade-2026', 'barayand', 'playground',
  'about', 'one-more-thing', 'contact'].map((id) => document.getElementById(id));
addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable], .scrub-track, .bands')) return;
  const k = e.key.toLowerCase();
  if (k === 'b') { bands.next(); return; }
  const dir = k === 'arrowright' || k === 'j' ? 1 : k === 'arrowleft' || k === 'k' ? -1 : 0;
  if (!dir) return;
  e.preventDefault();
  const y = scrollY;
  const tops = NAV.map((el) => el.getBoundingClientRect().top + y);
  let i = -1;
  if (dir > 0) i = tops.findIndex((t) => t > y + 8);
  else for (let j = tops.length - 1; j >= 0; j--) if (tops[j] < y - 8) { i = j; break; }
  if (i >= 0) NAV[i].scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
});

const pointer = createPointer({
  geo, state, hud,
  onPick: (id) => document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }),
});
tickers.push((st) => pointer.tick(st));

const intro = runIntro(state, { reduced });
tickers.unshift((st, target, dt) => intro.tick(dt));

const mars = document.querySelector('[data-mars]');
if (mars) {
  const time = mars.querySelector('[data-mars-time]');
  const sol = mars.querySelector('[data-mars-sol]');
  const tickMars = () => {
    const f = formatMars(Date.now());
    time.textContent = f.time;
    sol.textContent = f.sol;
  };
  tickMars();
  mars.hidden = false;
  setInterval(tickMars, 1000);
}

let last = performance.now();
let lastDraw = 0, movedBefore = false;
const finale = document.getElementById('one-more-thing');
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Browsers pause requestAnimationFrame in background tabs, so nothing renders while hidden.
  const target = scenes.target(innerWidth, innerHeight);
  if (target.z !== undefined) {
    // On the pull-back one number drives zoom, framing and tilt together, so they never drift apart.
    if (zoomOut === null) { zoomOut = scenes.zFor(state.cam.h, innerWidth, innerHeight); vel.z = 0; }
    if (reduced) zoomOut = target.z;
    else [zoomOut, vel.z] = spring(zoomOut, vel.z, target.z, dt, 4.5);
    Object.assign(state.cam, scenes.globeCam(zoomOut, innerWidth, innerHeight));
    vel.x = vel.y = vel.h = 0;
    if (reduced) state.dim = target.dim;
    else [state.dim, vel.dim] = spring(state.dim, vel.dim, target.dim, dt, 6);
    state.T = target.T;
  } else if (reduced) {
    zoomOut = null;
    Object.assign(state.cam, target.cam);
    state.T = target.T; state.dim = target.dim;
  } else {
    zoomOut = null;
    [state.cam.x, vel.x] = spring(state.cam.x, vel.x, target.cam.x, dt, 5.5);
    [state.cam.y, vel.y] = spring(state.cam.y, vel.y, target.cam.y, dt, 5.5);
    let lh = Math.log(state.cam.h);
    [lh, vel.h] = spring(lh, vel.h, Math.log(target.cam.h), dt, 5);
    state.cam.h = Math.exp(lh);
    [state.T, vel.T] = spring(state.T, vel.T, target.T, dt, 9);
    [state.dim, vel.dim] = spring(state.dim, vel.dim, target.dim, dt, 6);
  }
  orbit(zoomOut);
  // The words follow the camera, not the scrollbar: they arrive once the delta has become small.
  const z = zoomOut ?? 0;
  finale.classList.toggle('is-omt', z > 0.37);
  finale.classList.toggle('is-body', z > 0.64);
  state.time = now / 1000;
  state.focus = target.focus;
  state.focusPoint = target.focusPoint;
  state.labelSub = calendarLabel(state.T);
  for (const fn of tickers) fn(state, target, dt);
  const moved = changed();
  if (!moved) movedBefore = false;
  if (moved || dirty || (!reduced && now - lastDraw > 32)) {
    if (terrain) terrain.render(state);
    overlay.draw(state);
    if (moved && movedBefore) governor(now - lastDraw); // only back-to-back frames say anything about pace
    movedBefore = moved;
    lastDraw = now;
    dirty = false;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
