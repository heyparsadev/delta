// The director: from the sprung state to what the stage draws and where the demos sit. It places the
// light, sets every line and point layer, rebuilds the few layers that move, and pins the DOM labels
// to the object. Everything here reads the state; nothing here keeps time of its own.
import {
  measure, sketchCard, cardDraft, blueprint, gridLines, pointAt, FIVE, SIX, SIX_X, SIX_Y, ARROWS, arrows, beams,
  confluence, radar, ring, onRing, sheetText, SHEET, treeOfLife, grid300, raceAt, field1000, orbitAt, edgeMarks,
  waitPass, chainPoint, savesAt,
} from './layouts.js';
import { planeTransform, pointTransform, pinPlane, pinPoint } from './labels.js';
import { rotation, transpose3, apply3 } from './camera.js';
import { formatMars } from '../mars.js';

const WARM = [1, 0.9, 0.78];
const BLUE = [0.5, 0.74, 1];
const WHITE = [1, 1, 1];
const COOL = [0.78, 0.84, 1];
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Geometry that never changes. The card's drawings use the card's own proportions (score.js BASE).
const CARD = { w: 1.7, h: 1.07, r: 0.13 };
export const GEOM = {
  draftA: measure(sketchCard(CARD.w, CARD.h)),
  draftB: measure(cardDraft(CARD.w, CARD.h, CARD.r)),
};
const START = [-1.9, -0.95];
const SUM = ARROWS.reduce((a, v) => [a[0] + v[0], a[1] + v[1]], [0, 0]);
const ARROW_G = arrows(ARROWS, START);
const RESULT_G = arrows([SUM], START);
const CONF = confluence();
const RADAR = radar();
const TREE = treeOfLife();
const BENCH = grid300();
const FIELD = field1000();
const MARKS = edgeMarks({ w: 0.5, h: 1.03 });
export const BEAM_LEN = 2.7;
const WIDE = beams({ spread: 1, len: BEAM_LEN });
const NOTICED = WIDE.out[2][15];
const MISSED = WIDE.out[3][17].map((v, i) => (v + WIDE.out[4][17][i]) / 2);
const GATHER = [0, -0.6, 0];

export function setupLayers(lines, points) {
  lines.set('draftA', GEOM.draftA);
  lines.set('draftB', GEOM.draftB);
  lines.set('blue', measure(blueprint(CARD.w, CARD.h, CARD.r)));
  lines.set('grid', measure(gridLines(2.2, 0.2)));
  lines.set('arrows', { ...measure(ARROW_G.lines), colors: ARROW_G.colors });
  lines.set('resultant', measure(RESULT_G.lines));
  lines.set('missed', measure([ring(0.17, 40).map((p) => [p[0] + MISSED[0], p[1] + MISSED[1], 0])]));
  lines.set('confIn', { ...measure(CONF.inward, { parallel: true }), colors: FIVE });
  lines.set('confOut', measure([CONF.outward]));
  lines.set('radarAxes', measure([...RADAR.axes, ...RADAR.web], { parallel: true }));
  lines.set('radarProfile', measure([RADAR.profile]));
  lines.set('sheetText', measure(sheetText(SHEET)));
  lines.set('lineage', measure([TREE.lineage]));
  lines.set('branches', measure(TREE.branches));
  points.set('marks', { pts: MARKS.pts, from: MARKS.from, size: 0.011 });
  points.set('noticed', { pts: [NOTICED], size: 0.05 });
  points.set('missedDot', { pts: [MISSED], size: 0.03 });
  points.set('tips', { pts: TREE.tips, size: 0.0075 });
  points.set('bench', { pts: BENCH.pts, order: BENCH.order, size: 0.022 });
  points.set('field', { pts: FIELD.pts, order: FIELD.order, size: FIELD.pts.map((_, i) => (i === FIELD.slot ? 0 : 0.016)) });
}

// The thousand points turn on their own, slowly, around the object's place: their own frame.
export function fieldFrame(s, angle) {
  const R = rotation(angle, 0.12, 0);
  return { R, rotT: transpose3(R), at: [s.objX, s.objY, s.objZ], scale: 0.7 };
}
const inFrame = (fr, p) => { const r = apply3(fr.R, p); return [r[0] * fr.scale + fr.at[0], r[1] * fr.scale + fr.at[1], r[2] * fr.scale + fr.at[2]]; };

// Where the light is, and how bright: its resting place, or the tip of the pen drawing the draft, or
// its slot in the field; and its breath.
export function lightAt(s, env, field = fieldFrame(s, 0)) {
  const pen = clamp01(s.pen), penB = clamp01(s.penB);
  let p = [s.lightX, s.lightY, s.lightZ];
  if (pen > 0) {
    const a = env.world(pointAt(GEOM.draftA, s.draftA)), b = env.world(pointAt(GEOM.draftB, s.draftB));
    p = p.map((r, i) => r + (a[i] + (b[i] - a[i]) * penB - r) * pen);
  }
  const settle = clamp01(s.settle);
  if (settle > 0) p = mix3(p, inFrame(field, FIELD.pts[FIELD.slot]), ease(settle));
  const b = env.reduced ? 0 : s.breathe * Math.sin((env.time * 2 * Math.PI) / 4);
  return { p, i: s.lightI * (1 + 0.35 * b) * (1 - 0.6 * settle), r: s.lightR * (1 + 0.12 * b) * (1 - 0.45 * settle) };
}

// The bounding sphere the shader marches inside, in world units.
export function boundOf(s) {
  let r = 0.05;
  if (s.wBox > 0.01) {
    r = Math.max(r, Math.hypot(s.boxW, s.boxH) + 0.12 + s.layers * s.layerGap * 6.5 + s.fan * 1.6
      + (Math.round(s.rep) - 1) * 0.5 * s.repGap);
  }
  if (s.wPrism > 0.01) r = Math.max(r, s.prismSide * 1.25 + s.prismDepth);
  if (s.sat > 0.01) r = Math.max(r, Math.hypot(0.95, 1.85 + (1 - s.sat) * 1.4));
  if (s.wSphere > 0.01) r = Math.max(r, s.sphereR * 1.05);
  return r * s.objScale;
}

export function createDirector({ lines, points }) {
  if (lines && points) setupLayers(lines, points);
  const keys = {};
  let fieldAngle = 0;
  // Rebuilds a moving layer only when what it depends on changed.
  const changed = (id, key) => { if (keys[id] === key) return false; keys[id] = key; return true; };
  const f4 = (...v) => v.map((x) => x.toFixed(4)).join();

  const light = (s, env) => lightAt(s, env, fieldFrame(s, fieldAngle));

  function frame(s, env) {
    const t = env.reduced ? 0 : env.time;
    let animating = false;
    if (s.fieldA > 0.002 && s.fieldTurn > 1e-4 && !env.reduced) { fieldAngle += s.fieldTurn * env.dt; animating = true; }
    else if (s.fieldA <= 0.002) fieldAngle = 0;
    if (lines && s.beamsA > 0.002) {
      const moving = !env.reduced && (s.jitter > 0.001 || s.wave > 0.001);
      animating ||= moving;
      if (changed('beams', moving ? `t${t}` : f4(s.spread, s.jitter, s.wave))) {
        const b = beams({ spread: s.spread, jitter: s.jitter, wave: s.wave, time: t, len: BEAM_LEN });
        lines.update('beamIn', measure([b.entry]));
        lines.update('beams', { ...measure(b.out, { parallel: true }), colors: FIVE });
      }
    }
    if (lines && s.ringA > 0.002 && changed('ring', f4(s.ringR))) {
      lines.update('ring', measure([ring(1.35 * s.ringR)]));
      points.update('fifty', { pts: onRing(1.35 * s.ringR, 50), size: 0.014 });
    }
    if (points) {
      if (s.orbit > 0.002) {
        animating ||= !env.reduced;
        points.update('orbit', { pts: orbitAt(t), size: 0.028 });
      }
      if (s.sat > 0.002 && changed('sat', f4(s.sat, s.satHi))) {
        const y = 1.5 + (1 - s.sat) * 1.4 - 0.05;
        const lit = (side) => 0.45 + 1.1 * Math.max(0, side * s.satHi);
        points.update('satLights', { pts: [[-0.62, y, 0], [0.62, y, 0]], size: 0.03, colors: [WARM.map((c) => c * lit(-1)), WARM.map((c) => c * lit(1))] });
      }
      if (s.six > 0.002 && changed('six', f4(s.sixOut, s.sixIn, s.sixFocus, s.sixDim, s.sixHold))) {
        const out = ease(clamp01(s.sixOut)), back = ease(clamp01(s.sixIn));
        const pts = SIX_X.map((x) => mix3(mix3([0, 0.15, 0], [x, SIX_Y, 0], out), GATHER, back));
        // The light in focus glows (unless its form stands in its place); the others dim while it does.
        const colors = SIX.map((c, i) => {
          const f = Math.max(0, 1 - Math.abs(i - s.sixFocus)) * s.sixDim;
          const k = (1 - 0.65 * s.sixDim + f * 0.65) * (1 + 1.2 * f) * (1 - f * s.sixHold);
          return c.map((v) => v * k);
        });
        points.update('six', { pts, size: 0.045, colors });
      }
      if (s.chain > 0.002 && changed('chain', f4(s.fan, s.chainT))) points.update('chain', { pts: [chainPoint({ fan: s.fan }, s.chainT)], size: 0.035 });
      if (s.wait > 0.002 && changed('wait', f4(s.waitT, s.layers))) {
        // Just outside the top layer of the exploded stack.
        const d = 5.5 * ((s.boxD * 2) / 12 + s.layerGap * s.layers) + 0.32;
        points.update('wait', { pts: [waitPass(s.waitT, { d })], size: 0.04 });
      }
      if (s.race > 0.002 && changed('race', f4(s.raceT))) {
        const r = raceAt(s.raceT);
        points.update('race', { pts: [r.big, r.small], size: [0.07, 0.034], colors: [[0.55, 0.6, 0.72], [1.3, 1.3, 1.3]] });
      }
    }
    if (s.breathe > 0.002) animating ||= !env.reduced;

    const pen = clamp01(s.pen), penB = clamp01(s.penB);
    return {
      bound: boundOf(s),
      animating,
      lines: {
        draftA: { alpha: s.draftAAlpha, reveal: s.draftA, tip: pen * (1 - penB), color: WARM, width: 1.5 },
        draftB: { alpha: s.draftBAlpha, reveal: s.draftB, tip: pen * penB, color: WARM, width: 1.5 },
        blue: { alpha: s.blueAlpha, reveal: s.blue, tip: 0, color: BLUE, width: 1.1 },
        grid: { alpha: s.grid * 0.3, reveal: 1, tip: 0, color: BLUE, width: 0.8 },
        arrows: { alpha: s.arrowsA, reveal: s.arrows, tip: 0.6, color: WHITE, width: 1.7 },
        resultant: { alpha: s.resultantA, reveal: s.resultant, tip: 0.9, color: WHITE, width: 2.3 },
        beamIn: { alpha: s.beamsA, reveal: s.beamIn, tip: 0.9, color: WHITE, width: 2.2 },
        beams: { alpha: s.beamsA, reveal: s.beamOut, tip: 0.5, color: WHITE, width: 2 },
        missed: { alpha: s.missed > 0.002 ? 0.8 : 0, reveal: s.missed, tip: 0, color: WHITE, width: 1 },
        confIn: { alpha: s.confA, reveal: s.conf, tip: 0.6, color: WHITE, width: 2 },
        confOut: { alpha: s.confA, reveal: s.confOut, tip: 0.9, color: WHITE, width: 2.3 },
        radarAxes: { alpha: s.radarA * 0.55, reveal: s.radar, tip: 0, color: COOL, width: 0.9 },
        radarProfile: { alpha: s.radarA, reveal: s.radarP, tip: 0.7, color: WARM, width: 1.6 },
        ring: { alpha: s.ringA, reveal: s.ring, tip: 0.7, color: WARM, width: 1.2 },
        sheetText: { alpha: s.sheetText > 0.002 ? 0.75 : 0, reveal: s.sheetText, tip: 0.6, color: COOL, width: 1.3 },
        lineage: { alpha: s.treeA, reveal: s.lineage, tip: 1, color: WARM, width: 1.8 },
        branches: { alpha: s.treeA * 0.65, reveal: s.branches, tip: 0.3, color: COOL, width: 0.9 },
      },
      points: {
        marks: { alpha: s.marks * 0.85, mix: s.marksIn, color: [1, 0.86, 0.62], glow: 0.12 },
        fifty: { alpha: s.fifty > 0.002 ? 1 : 0, reveal: s.fifty, color: WARM, glow: 0.3 },
        noticed: { alpha: s.noticed, color: WHITE, glow: 1.2 },
        missedDot: { alpha: s.missed * 0.4, color: [0.6, 0.6, 0.66] },
        orbit: { alpha: s.orbit, color: WHITE, glow: 0.8 },
        satLights: { alpha: s.sat, color: WHITE, glow: 0.9 },
        six: { alpha: s.six, color: WHITE, glow: 1, world: true },
        chain: { alpha: s.chain, color: WARM, glow: 1 },
        wait: { alpha: s.wait, color: WARM, glow: 1 },
        tips: { alpha: s.tips * 0.7, color: COOL },
        bench: { alpha: s.benchA, reveal: s.bench, color: WARM, glow: 0.3 },
        race: { alpha: s.race, color: WHITE, glow: 1 },
        field: { alpha: s.fieldA, reveal: s.field, color: COOL, glow: 0.2, frame: fieldFrame(s, fieldAngle) },
      },
    };
  }

  // The demos' DOM, pinned to the object. Only demos that are on get pinned. A face label goes on
  // whichever face is towards the camera, so it always reads the right way round.
  let marsSecond = -1;
  function pinFace(el, s, env, x, ew, eh) {
    const z = s.boxD + 0.002, w = s.boxW, h = s.boxH;
    const front = planeTransform(env.cam, [[x - w, h, z], [x + w, h, z], [x + w, -h, z], [x - w, -h, z]].map(env.world), env.W, env.H, ew, eh);
    pinPlane(el, front.ok && !front.facing
      ? planeTransform(env.cam, [[x + w, h, -z], [x - w, h, -z], [x - w, -h, -z], [x + w, -h, -z]].map(env.world), env.W, env.H, ew, eh)
      : front);
  }
  const PIN = {
    code(el, s, env) { pinFace(el, s, env, 0, 428, 270); },
    'mind-mirror'(el, s, env) { pinFace(el, s, env, 0, 300, 620); },
    saves(el, s, env) {
      const at = savesAt(s.saves, s.saveBack);
      [...el.children].forEach((li, i) => {
        const t = pointTransform(env.cam, env.world(at[i].p), env.W, env.H, env.dist);
        if (t.ok) t.s *= at[i].s;
        pinPoint(li, t);
        li.style.opacity = at[i].o.toFixed(3);
      });
    },
    sheets(el, s, env) {
      const [a, b, submit] = el.children, g = s.repGap / 2;
      pinPoint(a, pointTransform(env.cam, env.world([-g - s.boxW, s.boxH + 0.17, 0]), env.W, env.H, env.dist), false, 'left');
      pinPoint(b, pointTransform(env.cam, env.world([g - s.boxW, s.boxH + 0.17, 0]), env.W, env.H, env.dist), false, 'left');
      pinPoint(submit, pointTransform(env.cam, env.world([g, -s.boxH - 0.24, 0]), env.W, env.H, env.dist), false);
    },
    mars(el, s, env) {
      const top = [s.objX + env.drag[0], s.objY + env.drag[1] + s.sphereR * s.objScale + 0.34, s.objZ];
      pinPoint(el, pointTransform(env.cam, top, env.W, env.H, env.dist), false);
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== marsSecond) {
        marsSecond = sec;
        const m = formatMars(Date.now());
        el.querySelector('[data-mars-time]').textContent = m.time;
        el.querySelector('[data-mars-sol]').textContent = m.sol;
      }
      if (env.handle) {
        const c = pointTransform(env.cam, [s.objX + env.drag[0], s.objY + env.drag[1], s.objZ], env.W, env.H, env.dist);
        if (c.ok) {
          const r = (s.sphereR * s.objScale * env.H) / (2 * env.cam.tanHalf * env.dist) * c.s;
          env.handle.style.width = env.handle.style.height = `${(2 * r).toFixed(0)}px`;
          env.handle.style.transform = `translate(${(c.x - r).toFixed(1)}px, ${(c.y - r).toFixed(1)}px)`;
        }
      }
    },
    tiles(el, s, env) { [...el.children].forEach((li, i) => pinFace(li, s, env, (i - 1) * s.repGap, 220, 220)); },
  };
  function pins(s, env, demos) {
    for (const d of demos) if (d.on) PIN[d.name]?.(d.el, s, env);
  }

  return { frame, pins, light };
}
