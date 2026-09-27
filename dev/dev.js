import { SEED, SCENES, GLOBE } from '../js/story.js';
import { buildDelta, channelById, pointAt } from '../js/delta.js';
import { createOverlay } from '../js/overlay.js';
import { calendarLabel, smoothstep } from '../js/timeline.js';

const $ = (id) => document.getElementById(id);
const t0 = performance.now();
const geo = buildDelta(SEED);
const tGeo = performance.now() - t0;
const overlay = createOverlay($('overlay'), geo);

let terrain = null;
let tField = 0;
try {
  const { buildField } = await import('../js/field.js');
  const { createTerrain } = await import('../js/gl.js');
  const f0 = performance.now();
  const field = buildField(geo, SEED);
  tField = performance.now() - f0;
  terrain = createTerrain($('terrain'), field, geo);
} catch (err) {
  console.info('terrain not available yet:', err.message);
}

const shots = [{ id: 'overview', name: 'Overview', h: 1900 }, ...SCENES.map((s) => ({ id: s.id, name: `${s.n} ${s.name}`, h: s.zoom }))];
for (const s of shots) $('shot').add(new Option(s.name, s.id));
$('shot').onchange = () => { $('H').value = shots.find((s) => s.id === $('shot').value).h; };

const mouse = { x: -999, y: -999 };
addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

function camera(T) {
  const id = $('shot').value;
  const h = +$('H').value;
  const scene = SCENES.find((s) => s.id === id);
  if (!scene) return { x: 0, y: 1250, h };
  if (scene.focus === 'front') return { x: 0, y: 1640, h };
  const p = pointAt(channelById(geo, scene.focus).pts, T);
  return { x: p.x, y: p.y, h };
}

function resize() {
  const dpr = devicePixelRatio || 1;
  overlay.resize(innerWidth, innerHeight, dpr);
  if (terrain) terrain.resize(innerWidth, innerHeight, dpr, 1);
}
addEventListener('resize', resize);
resize();

let frames = 0, last = performance.now(), fps = 0;
function frame(now) {
  if ($('play').checked) $('T').value = ((+$('T').value + 0.0006) % 1).toFixed(4);
  const T = +$('T').value;
  const scene = SCENES.find((s) => s.id === $('shot').value);
  const state = {
    cam: camera(T), T, band: +$('band').value, bandFrom: +$('band').value, bandMix: 1,
    lens: { x: mouse.x, y: mouse.y, r: 90, on: $('lens').checked },
    time: now / 1000, dim: +$('dim').value, intro: 1, reduced: false,
    tilt: +$('planet').value, planet: smoothstep(4000, 40000, +$('H').value),
    globe: { cx: GLOBE.cx, cy: GLOBE.cy, R: GLOBE.R, tilt: +$('planet').value },
    hover: null, lit: null, focus: scene && scene.focus !== 'front' ? scene.focus : null, labelSub: calendarLabel(T),
  };
  if (terrain) terrain.render(state);
  overlay.draw(state);
  $('Tv').value = `${T.toFixed(3)} · ${calendarLabel(T)}`;
  $('Hv').value = $('H').value;
  frames++;
  if (now - last > 500) { fps = Math.round((frames * 1000) / (now - last)); frames = 0; last = now; }
  $('stats').textContent = `geo ${tGeo.toFixed(1)} ms · field ${tField.toFixed(1)} ms · ${fps} fps${terrain ? '' : ' · no terrain'}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
