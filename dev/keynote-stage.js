// Stage harness: the keynote renderer with the object's parameters on sliders.
import { createStage } from '../js/keynote/stage.js';
import { makeCamera, rotation, transpose3 } from '../js/keynote/camera.js';
import { createLines } from '../js/keynote/lines.js';
import { measure, sketchCard, cardDraft, blueprint, gridLines } from '../js/keynote/layouts.js';

export const S = {
  tx: 0, ty: 0, tz: 0, camYaw: 0, camPitch: 0.12, camDist: 7.4, camFov: 30,
  objX: 0, objY: 0, objZ: 0, objYaw: -0.42, objPitch: 0.1, objRoll: 0, objScale: 1, spin: 0.05,
  solid: 1, wBox: 1, wPrism: 0, wSphere: 0, boxW: 1.7, boxH: 1.07, boxD: 0.045, boxR: 0.13,
  prismSide: 1.25, prismDepth: 0.7, sphereR: 1.1, layers: 0, layerGap: 0.16, layerHi: -1, layerHiI: 0,
  mGlass: 1, mMetal: 0, mMirror: 0, mDark: 0, fog: 0, edge: 0, rim: 1, mPlanet: 0, backdrop: 0,
  layerAll: 0, layerSpan: 0, fan: 0, rep: 1, repGap: 0, sat: 0,
  lightX: 0, lightY: 0, lightZ: 0, lightI: 1.15, lightR: 0.085, warmth: 0.55,
  floor: 1, exposure: 1, bloom: 0.9, quality: 1,
};
export const CONTROLS = [
  ['objYaw', -3.2, 3.2], ['objPitch', -1.6, 1.6], ['camYaw', -1.6, 1.6], ['camPitch', -0.1, 1.2], ['camDist', 3, 14],
  ['solid', 0, 1], ['wBox', 0, 1], ['wPrism', 0, 1], ['wSphere', 0, 1],
  ['mGlass', 0, 1], ['mMetal', 0, 1], ['mMirror', 0, 1], ['mDark', 0, 1], ['fog', 0, 1], ['edge', 0, 1],
  ['layers', 0, 1], ['layerHi', -1, 11], ['layerHiI', 0, 2],
  ['lightI', 0, 3], ['lightR', 0.02, 0.3], ['lightY', -1.3, 1.3], ['lightZ', -1, 1], ['warmth', 0, 1],
  ['exposure', 0.3, 2], ['bloom', 0, 2], ['spin', 0, 0.6], ['quality', 0.5, 1],
  ['fan', 0, 1], ['rep', 1, 3], ['repGap', 0, 2], ['sat', 0, 1], ['layerAll', 0, 1], ['layerSpan', 0, 4],
  ['rim', 0, 1], ['mPlanet', 0, 1], ['backdrop', 0, 1], ['boxW', 0.3, 2], ['boxH', 0.3, 2.2], ['boxD', 0.01, 0.2],
  ['boxR', 0.02, 0.5], ['sphereR', 0.3, 1.5], ['lightX', -2, 2],
];
// Any field can come from the query string (?fan=1&camDist=12), so dev/shoot.mjs can photograph a form.
for (const [k, v] of new URLSearchParams(location.search)) if (k in S && v !== '' && !Number.isNaN(+v)) S[k] = +v;

const panel = document.getElementById('panel');
const info = document.createElement('pre');
export function addControls(list) {
  for (const [key, min, max] of list) {
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'range', min, max, step: (max - min) / 400, value: S[key] });
    const out = document.createElement('output');
    out.textContent = (+S[key]).toFixed(2);
    input.oninput = () => { S[key] = +input.value; out.textContent = S[key].toFixed(2); if (key === 'quality') resize(); };
    label.append(key, input, out);
    panel.insertBefore(label, info);
  }
}
panel.append(info);
addControls(CONTROLS);

export const stage = createStage(document.getElementById('stage'));
if (!stage) info.textContent = 'WebGL with highp is not available here.';
const coarse = matchMedia('(pointer: coarse)').matches;
function resize() { stage?.resize(innerWidth, innerHeight, devicePixelRatio || 1, S.quality, coarse); }
addEventListener('resize', resize);
resize();

export const extra = { lines: {} }; // task 9 fills this with line layers
let spin = 0, last = performance.now(), frames = 0, acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  spin += S.spin * dt;
  if (stage) {
    const cam = makeCamera({ tx: S.tx, ty: S.ty, tz: S.tz, yaw: S.camYaw, pitch: S.camPitch, dist: S.camDist, fov: S.camFov }, innerWidth / innerHeight);
    const R = rotation(S.objYaw + spin, S.objPitch, S.objRoll);
    stage.render({ state: S, cam, time: now / 1000, rot: R, rotT: transpose3(R), light: [S.lightX, S.lightY, S.lightZ], bound: 2.6 + S.fan * 1.6 + (S.rep - 1) * S.repGap, reduced: false, lines: extra.lines, motion: 0 });
    frames++;
    acc += dt;
    if (acc > 0.5) {
      const i = stage.info;
      info.textContent = `${(frames / acc).toFixed(0)} fps · scene ${i.scene} · tier ${i.tier}`;
      frames = 0;
      acc = 0;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// A magnifier: a nearest-neighbour crop of the WebGL canvas, copied right after each render (before
// the browser composites, so no preserveDrawingBuffer is needed). zx, zy pick the spot; zoom the size.
Object.assign(S, { zx: 0.14, zy: 0.5, zoom: 0 });
addControls([['zoom', 0, 1], ['zx', 0, 1], ['zy', 0, 1]]);
const lens = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
lens.style.cssText = 'position:fixed;left:12px;bottom:12px;width:256px;height:256px;border:1px solid #444;image-rendering:pixelated;z-index:10;display:none';
document.body.append(lens);
const lctx = lens.getContext('2d');
const glCanvas = document.getElementById('stage');
const renderStage = stage && stage.render;
if (stage) {
  stage.render = (f) => {
    renderStage(f);
    lens.style.display = S.zoom > 0 ? 'block' : 'none';
    if (S.zoom <= 0) return;
    const size = Math.round(16 + (1 - S.zoom) * 240);
    const sx = Math.round(S.zx * glCanvas.width - size / 2), sy = Math.round(S.zy * glCanvas.height - size / 2);
    lctx.imageSmoothingEnabled = false;
    lctx.clearRect(0, 0, 256, 256);
    lctx.drawImage(glCanvas, sx, sy, size, size, 0, 0, 256, 256);
  };
}

// Line layers: the sketch, the corrected draft, the blueprint and its grid.
Object.assign(S, { draftA: 1, draftAAlpha: 0, draftB: 1, draftBAlpha: 0, blue: 1, blueAlpha: 0, grid: 0 });
addControls([['draftA', 0, 1], ['draftAAlpha', 0, 1], ['draftB', 0, 1], ['draftBAlpha', 0, 1], ['blue', 0, 1], ['blueAlpha', 0, 1], ['grid', 0, 1]]);
if (stage) {
  const lines = createLines(stage.gl);
  lines.set('draftA', measure(sketchCard(S.boxW, S.boxH)));
  lines.set('draftB', measure(cardDraft(S.boxW, S.boxH, S.boxR)));
  lines.set('blue', measure(blueprint(S.boxW, S.boxH, S.boxR)));
  lines.set('grid', measure(gridLines(2.2, 0.2)));
  stage.addLayer(lines);
}
const WARM = [1, 0.9, 0.78], BLUE = [0.5, 0.74, 1];
(function tick() {
  extra.lines = {
    draftA: { alpha: S.draftAAlpha, reveal: S.draftA, tip: 1, color: WARM, width: 1.5 },
    draftB: { alpha: S.draftBAlpha, reveal: S.draftB, tip: 1, color: WARM, width: 1.5 },
    blue: { alpha: S.blueAlpha, reveal: S.blue, tip: 0, color: BLUE, width: 1.1 },
    grid: { alpha: S.grid * 0.3, reveal: 1, tip: 0, color: BLUE, width: 0.8 },
  };
  requestAnimationFrame(tick);
})();
