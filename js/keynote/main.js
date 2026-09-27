// Keynote bootstrap. Scroll becomes a position in words. The words drive the slides and captions
// exactly; the score turns the same position into the object's state, which the stage renders.
import { readBeats, sizeBeats } from './beats.js';
import { buildTrack, locate, fromScroll, toScroll, WORDS_PER_VIEWPORT } from './track.js';
import { prepareCaption, revealCaption } from './captions.js';
import { prepareSlides, updateSlides, measureSheets } from './slides.js';
import { applyGreeting } from './greeting.js';
import { BASE, SCORE, resolveScore, stateAt, snapAt } from './score.js';
import { makeCamera, rotation, transpose3, apply3 } from './camera.js';
import { createStage } from './stage.js';
import { createLines } from './lines.js';
import { createPoints } from './points.js';
import { createDirector } from './director.js';
import { prepareDemos, updateDemos } from './demos.js';
import { buildFilm, slideKind } from './film.js';
import { createWatch } from './watch.js';
import { createChapters } from './chapters.js';
import { createGovernor } from '../governor.js';
import { spring, easeInOut } from '../timeline.js';

const root = document.documentElement;
// kn-boot holds transitions off while the page switches from the transcript to the keynote, or every
// frame would fade out from full opacity at once, all of them on top of each other.
root.classList.add('kn', 'kn-boot');
requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('kn-boot')));
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('motion') === 'reduce';
if (reduced) root.classList.add('reduced');
const coarse = matchMedia('(pointer: coarse)').matches;

// ---- Words ----
const beats = readBeats();
const track = buildTrack(beats);
const captions = beats.map((b) => (b.caption ? prepareCaption(b.caption) : null));
beats.forEach((b, i) => {
  const cap = captions[i];
  if (cap && cap.words.length !== b.words) console.warn(`[keynote] ${b.id}: ${cap.words.length} words wrapped, ${b.words} counted`);
});
const slides = beats.map((b, i) => prepareSlides(b, track.beats[i]));
const demos = prepareDemos(beats, track);
applyGreeting(document.querySelector('[data-greeting]'), new Date().getHours());

// The large viewport height stays put while phone toolbars come and go, so beats do not resize under
// the reader's thumb.
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100lvh;visibility:hidden;pointer-events:none';
document.body.append(probe);
const view = { px: 1, top0: 0, w: 0, h: 0 };
const position = () => fromScroll(scrollY, view.top0, view.px, track.length);
const jump = (P) => scrollTo(0, toScroll(P, view.top0, view.px));
function layout() {
  view.w = innerWidth;
  view.h = probe.offsetHeight || innerHeight;
  view.px = view.h / WORDS_PER_VIEWPORT;
  sizeBeats(beats, track, view.px);
  view.top0 = beats[0].el.getBoundingClientRect().top + scrollY;
  measureSheets(slides, innerHeight);
}
layout();

// Where to start: ?cue=<id> or ?p=<position> (for checking frames), a hash, or where the reader was.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
{
  let saved = null;
  try { saved = sessionStorage.getItem('kn.p'); } catch { saved = null; }
  const cue = params.get('cue') && track.cue(params.get('cue'));
  if (cue) jump(cue.start + 0.5);
  else if (params.has('p')) jump(+params.get('p'));
  else if (location.hash) goTo(decodeURIComponent(location.hash.slice(1)));
  else if (saved !== null) jump(+saved);
}
addEventListener('pagehide', () => { try { sessionStorage.setItem('kn.p', String(position())); } catch { /* private mode */ } });

addEventListener('resize', () => {
  if (innerWidth === view.w && Math.abs(probe.offsetHeight - view.h) < 2) return;
  const P = position();
  layout();
  jump(P);
  resizeStage();
}, { passive: true });
document.fonts?.ready.then(() => measureSheets(slides, innerHeight));

let active = -1;
// Keyboard focus that lands in a hidden frame brings its beat on screen.
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('.beat');
  const b = el ? track.beats[beats.findIndex((x) => x.el === el)] : null;
  const P = position();
  if (b && (P < b.start || P >= b.end)) jump(b.start + 0.1);
});

// In-page links land exactly on their beat. A native anchor jump rounds to whole pixels and can
// stop a hair short, in the beat before.
function goTo(id, { focus = false } = {}) {
  const el = id && document.getElementById(id);
  const beat = el && (el.closest('.beat') || el.querySelector('.beat'));
  const i = beat ? beats.findIndex((b) => b.el === beat) : -1;
  if (i < 0) return false;
  jump(track.beats[i].start + 0.1);
  const h = focus && beats[i].frame.querySelector('h1, h2, h3');
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  return true;
}
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const id = decodeURIComponent(a.getAttribute('href').slice(1));
  if (goTo(id, { focus: true })) {
    e.preventDefault();
    history.pushState(null, '', `#${id}`);
  }
});
addEventListener('hashchange', () => goTo(decodeURIComponent(location.hash.slice(1))));
// The browser scrolls to the fragment itself once the page has loaded, which would undo the landing.
if (location.hash && !params.has('cue') && !params.has('p')) {
  addEventListener('load', () => goTo(decodeURIComponent(location.hash.slice(1))), { once: true });
}

const progress = document.querySelector('.ch-progress span');
const chapterOf = beats.map((b) => b.el.closest('[data-chapter]')?.id ?? null);

// ---- Watch: the keynote as a film of about three minutes ----
const slideOf = new Map();
beats.forEach((b) => b.frame.querySelectorAll('[data-cue]:not(.cue)').forEach((el) => slideOf.set(el.dataset.cue, el)));
const film = buildFilm(track, (id) => {
  const el = slideOf.get(id);
  return el ? { kind: slideKind([...el.classList]), chars: el.textContent.replace(/\s+/g, ' ').trim().length } : { kind: 'cue', chars: 0 };
});
const watchBtn = document.querySelector('[data-watch]');
let chapters = null;
const watch = createWatch({
  film, position,
  jump: (P) => { jump(P); return scrollY; },
  onChange(on) {
    root.classList.toggle('watching', on);
    chapters?.setPlaying(on);
  },
});
chapters = createChapters(document.querySelector('.chapters'), { onPlay: () => watch.toggle() });
if (watchBtn) {
  watchBtn.hidden = false;
  watchBtn.addEventListener('click', () => watch.play());
}

// ---- Stage ----
let stage = null;
// Without a stage the director still pins the demos (the camera math needs no WebGL).
let director = createDirector({});
// ?q=<0.5–1> pins the quality (for measuring a tier); otherwise the governor adapts it.
const pinned = params.has('q') ? Math.max(0.5, Math.min(1, +params.get('q') || 1)) : null;
let quality = pinned ?? (coarse || innerWidth < 700 ? 0.85 : 1);
const gov = createGovernor({ start: quality, onChange(q) { if (pinned === null) { quality = q; resizeStage(); } } });
function resizeStage() { stage?.resize(innerWidth, view.h, devicePixelRatio || 1, quality, coarse); }
if (params.has('nowebgl')) root.classList.add('no-webgl');
else {
  // After the first frames, so the words paint at once and the stage fades in behind them.
  const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
  later(() => {
    stage = createStage(document.getElementById('stage'));
    if (!stage) { root.classList.add('no-webgl'); return; }
    const lines = createLines(stage.gl);
    const points = createPoints(stage.gl);
    stage.addLayer(lines);
    stage.addLayer(points);
    director = createDirector({ lines, points });
    if (debug) window.__kn = { stage, sim };
    resizeStage();
  }, { timeout: 500 });
}

// ---- The object, sprung. Text is never sprung: it follows the scroll exactly. ----
const frames = resolveScore(SCORE, track);
const sim = { ...(reduced ? snapAt(frames, position()) : stateAt(frames, position())) };
const vel = Object.fromEntries(Object.keys(BASE).map((k) => [k, 0]));
const shift = { x: 0, y: 0, vx: 0, vy: 0 };
const light = { p: null, v: [0, 0, 0] };
const OMEGA = 5.5;
let dragTurn = 0, planetTurn = 0;
// The fields that change the object's outline, for the motion estimate.
const SHAPE = ['boxW', 'boxH', 'boxD', 'boxR', 'layers', 'fan', 'repGap', 'sat', 'objScale', 'sphereR', 'wBox', 'wPrism', 'wSphere', 'solid'];

// Apsis: the planet can be dragged, and lags behind the pointer as if it had mass.
const drag = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, held: false, id: null, px: 0, py: 0, scale: 0.01 };
const marsDemo = demos.find((d) => d.name === 'mars');
const handle = marsDemo ? Object.assign(document.createElement('div'), { className: 'mars-drag' }) : null;
if (handle) {
  marsDemo.el.closest('.frame').append(handle);
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('pointerdown', (e) => {
    drag.held = true; drag.id = e.pointerId; drag.px = e.clientX; drag.py = e.clientY;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag.held || e.pointerId !== drag.id) return;
    drag.tx = Math.max(-1.6, Math.min(1.6, (e.clientX - drag.px) * drag.scale));
    drag.ty = Math.max(-0.9, Math.min(0.9, -(e.clientY - drag.py) * drag.scale));
  });
  const release = () => { drag.held = false; drag.tx = 0; drag.ty = 0; };
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);
}

const debug = params.has('debug') ? document.body.appendChild(Object.assign(document.createElement('pre'), { className: 'debug' })) : null;
const dts = [];

let lastP = -1, side = 'center', last = performance.now(), lastDraw = 0, movedLast = false;
let prevView = null;
// The object's own position in the words. It follows the words, except after a jump (a chapter link,
// Replay, a key, the scrollbar), when it sweeps from where it was to where the words are in under a
// second: a fast-forward through every state in between, not a cut. A scroll during the sweep
// retargets it. With reduced motion there is no sweep; the object snaps, as it does at cues.
let objP = position(), ff = null;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  watch.tick(now);
  const P = position();
  if (!reduced && !watch.playing && !ff && Math.abs(P - objP) > 40) ff = { from: objP, t0: now, dur: Math.min(0.9, 0.35 + Math.abs(P - objP) / 2500) };
  if (ff && !reduced) {
    const u = (now - ff.t0) / 1000 / ff.dur;
    if (u >= 1) { ff = null; objP = P; } else objP = ff.from + (P - ff.from) * easeInOut(u);
  } else { ff = null; objP = P; }
  const loc = locate(track, P);
  const scrolled = P !== lastP;
  if (scrolled) {
    if (loc.index !== active) {
      beats[active]?.frame.classList.remove('is-active');
      beats[loc.index].frame.classList.add('is-active');
      chapters.setChapter(chapterOf[loc.index]);
      active = loc.index;
    }
    const cap = captions[loc.index];
    if (cap) revealCaption(cap, beats[loc.index], loc.u, { whole: reduced });
    side = updateSlides(slides[loc.index], loc, reduced);
    updateDemos(demos, loc, P);
    handle?.classList.toggle('is-on', !!marsDemo?.on);
    progress?.style.setProperty('--progress', (P / track.length).toFixed(4));
    lastP = P;
  }

  // The object: eased keyframes, then springs. With reduced motion it holds each keyframe's state and
  // changes only when a cue lands, in a fifth of a second, instead of travelling with the scroll.
  const target = reduced ? snapAt(frames, objP) : stateAt(frames, objP);
  let moving = scrolled || !!ff;
  for (const k in target) {
    [sim[k], vel[k]] = spring(sim[k], vel[k], target[k], dt, reduced ? 22 : ff ? 14 : OMEGA);
    if (Math.abs(vel[k]) > 1e-4) moving = true;
  }
  // The object takes the side the slide leaves free (on phones it sits a little low, under the slide).
  const wide = innerWidth >= 900;
  const sx = wide ? (side === 'left' ? 0.42 : side === 'right' ? -0.42 : 0) : 0;
  const sy = wide ? 0 : -0.14;
  if (reduced) { shift.x = sx; shift.y = sy; }
  else {
    [shift.x, shift.vx] = spring(shift.x, shift.vx, sx, dt, 4);
    [shift.y, shift.vy] = spring(shift.y, shift.vy, sy, dt, 4);
    if (Math.abs(shift.vx) + Math.abs(shift.vy) > 1e-4) moving = true;
  }
  // The object turns where the score turns it (objYaw keyframes); while the score lets it, it also sways
  // a little in time, so it stays alive while the reader pauses. Mars turns on its own: that turn is
  // the planet's alone and never moves the layers drawn in the object's space. No idle motion with
  // reduced motion.
  const spinning = !reduced && Math.abs(sim.spin) > 1e-3;
  const sway = spinning ? sim.spin * 3.2 * (1 - sim.mPlanet) * Math.sin((now / 1000) * 0.45) : 0;
  if (!reduced && sim.mPlanet > 0.5 && sim.solid > 0.02) planetTurn += dt * 0.12;
  else if (sim.solid <= 0.02 || sim.mPlanet <= 0.5) planetTurn = 0;
  // The dragged planet follows the pointer late, then swings back to rest, turning as it goes.
  if (drag.held || Math.abs(drag.x) + Math.abs(drag.y) + Math.abs(drag.vx) + Math.abs(drag.vy) + Math.abs(dragTurn) > 1e-5) {
    const w = drag.held ? 3.2 : 6;
    [drag.x, drag.vx] = spring(drag.x, drag.vx, drag.tx, dt, w);
    [drag.y, drag.vy] = spring(drag.y, drag.vy, drag.ty, dt, w);
    dragTurn = reduced ? 0 : (dragTurn + drag.vx * 0.8 * dt) * Math.exp(-dt * (drag.held ? 0 : 1.5));
    moving = true;
  }

  const drawNeeded = stage || demos.some((d) => d.on);
  if (drawNeeded) {
    // The score's distances frame the object beside the slide on a wide screen. Narrower than 3:2 the
    // camera steps back so it keeps that share of the width. In the narrow layout it sits alone in the
    // middle band, between the slide above and the caption below: at least 1.5 times back, and on a
    // phone sized to about half the width.
    const aspect = innerWidth / view.h;
    const fit = innerWidth < 900 ? Math.max(1.5, 1.05 / aspect) * sim.phoneFit : Math.max(1, 1.5 / aspect);
    const dist = sim.camDist * fit;
    const cam = makeCamera({ tx: sim.tx, ty: sim.ty, tz: sim.tz, yaw: sim.camYaw, pitch: sim.camPitch, dist, fov: sim.camFov, shiftX: shift.x, shiftY: shift.y }, aspect);
    const R = rotation(sim.objYaw + sway, sim.objPitch, sim.objRoll);
    const Rs = planetTurn || dragTurn ? rotation(sim.objYaw + sway + planetTurn + dragTurn, sim.objPitch, sim.objRoll) : R;
    const ox = sim.objX + drag.x, oy = sim.objY + drag.y;
    const world = (p) => {
      const r = apply3(R, p);
      return [r[0] * sim.objScale + ox, r[1] * sim.objScale + oy, r[2] * sim.objScale + sim.objZ];
    };
    drag.scale = (2 * dist * cam.tanHalf) / view.h;
    const env = { cam, R, world, time: now / 1000, dt, reduced, W: innerWidth, H: view.h, dist, drag: [drag.x, drag.y], handle };
    // The light rests where the score puts it, or rides the tip of the draft being drawn. Its own
    // spring lets it glide between strokes, like a pen lifting.
    const L = director.light(sim, env);
    if (!light.p || reduced) light.p = L.p;
    else for (let i = 0; i < 3; i++) [light.p[i], light.v[i]] = spring(light.p[i], light.v[i], L.p[i], dt, 14);
    const d = director.frame(sim, env);
    // How far things move on screen this frame, in scene pixels: temporal AA trusts its history less
    // the more they move.
    // Shape changes count too (the card growing into a mirror moves its edges as much as a camera move).
    const view3 = [...cam.pos, ...cam.target, sim.objYaw + sway + planetTurn + dragTurn, sim.objPitch, ox, oy, ...light.p,
      ...SHAPE.map((k) => sim[k])];
    let motion = 1;
    if (prevView) {
      let shape = 0;
      for (let i = 13; i < view3.length; i++) shape += Math.abs(view3[i] - prevView[i]);
      const dc = Math.hypot(view3[0] - prevView[0], view3[1] - prevView[1], view3[2] - prevView[2])
        + Math.hypot(view3[3] - prevView[3], view3[4] - prevView[4], view3[5] - prevView[5])
        + (Math.abs(view3[6] - prevView[6]) + Math.abs(view3[7] - prevView[7])) * d.bound
        + Math.hypot(view3[8] - prevView[8], view3[9] - prevView[9])
        + Math.hypot(view3[10] - prevView[10], view3[11] - prevView[11], view3[12] - prevView[12])
        + shape * 1.5;
      motion = Math.min(1, ((dc / dist) * (view.h * (devicePixelRatio || 1) * 0.5) / cam.tanHalf) / 6);
    }
    const turning = spinning || planetTurn > 0;
    if (stage && (moving || d.animating && now - lastDraw > 15 || (turning && now - lastDraw > 32) || stage.settling || now - lastDraw > 500)) {
      stage.render({
        state: sim, cam, time: now / 1000, rot: Rs, rotT: transpose3(R), light: light.p, lightI: L.i, lightR: L.r,
        bound: d.bound, reduced, lines: d.lines, points: d.points, motion,
        obj: [ox, oy, sim.objZ],
      });
      prevView = view3;
      // Only back-to-back frames drawn at full rate say anything about the display's pace.
      if (moving && movedLast && !reduced) gov.sample(now - lastDraw);
      movedLast = moving;
      lastDraw = now;
    } else movedLast = false;
    director.pins(sim, env, demos);
  }

  if (debug) {
    dts.push(dt);
    if (dts.length > 60) dts.shift();
    const fps = dts.length / dts.reduce((a, b) => a + b, 0);
    const c = loc.cue >= 0 ? loc.beat.cues[loc.cue] : null;
    debug.textContent = `P ${P.toFixed(1)} / ${track.length}  obj ${objP.toFixed(1)}\nbeat ${loc.beat.id}  cue ${c ? c.id : '-'} ${loc.cueP.toFixed(2)}\n`
      + `${fps.toFixed(0)} fps  q ${quality.toFixed(2)}  ${stage ? `${stage.info.scene} tier ${stage.tier}` : 'no stage'}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
