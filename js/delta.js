// River geometry grown from the story. Pure module, deterministic for a seed.
import { mulberry32, fbm1, rangeOf } from './rng.js';
import { TIMES, PROJECTS, STATIONS } from './story.js';

const TAU = Math.PI * 2;
export const WORLD = { x0: -800, y0: -200, x1: 800, y1: 3000 };
export const COAST_Y = 1700;
const STEM_MOUTH_X = -60;
const BARAYAND_MOUTH_X = 300;
// IranSpoti's meanders: tuned so the last big bend forms a gooseneck with an open, narrow neck.
export const IRAN = { length: 750, wavelength: 260, peak: 1.15 };

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function makeCoast(seed) {
  const n1 = fbm1(seed + 7, 4);
  const n2 = fbm1(seed + 19, 3);
  return (x) =>
    COAST_Y +
    70 * Math.exp(-(((x - STEM_MOUTH_X) / 230) ** 2)) +
    40 * n1(x / 320 + 10) +
    16 * n2(x / 110 + 40) -
    0.00018 * x * x;
}

// ---------- sampling helpers ----------

function arcLengths(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return L;
}

function resample(pts, ds) {
  const L = arcLengths(pts);
  const total = L[L.length - 1];
  const n = Math.max(2, Math.round(total / ds) + 1);
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    while (j < L.length - 2 && L[j + 1] < s) j++;
    const f = (s - L[j]) / (L[j + 1] - L[j] || 1);
    out.push({ x: pts[j].x + (pts[j + 1].x - pts[j].x) * f, y: pts[j].y + (pts[j + 1].y - pts[j].y) * f });
  }
  return out;
}

function catmullRom(ctrl, perSeg = 24) {
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const out = [];
  for (let i = 0; i < P.length - 3; i++) {
    const p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3];
    for (let k = 0; k < perSeg; k++) {
      const u = k / perSeg, u2 = u * u, u3 = u2 * u;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
      });
    }
  }
  const last = ctrl[ctrl.length - 1];
  out.push({ x: last.x, y: last.y });
  return out;
}

// Direction angle follows a sine of arc length: theta(s) = heading + omega * sin(phase(s)).
function sineCurve({ x, y, heading, length, ds, wavelength, omega, jitter, phase0 = 0 }) {
  const pts = [{ x, y }];
  let phase = phase0;
  for (let s = 0; s < length; s += ds) {
    const u = s / length;
    const th = heading + omega(u) * Math.sin(phase) + (jitter ? jitter(s) : 0);
    x += Math.cos(th) * ds;
    y += Math.sin(th) * ds;
    phase += (TAU * ds) / wavelength(u);
    pts.push({ x, y });
  }
  return pts;
}

// Scale about the start so the end reaches target.y, then shear so it reaches target.x.
function fitEnd(pts, target) {
  const a = pts[0], b = pts[pts.length - 1];
  const k = (target.y - a.y) / (b.y - a.y);
  const scaled = pts.map((p) => ({ x: a.x + (p.x - a.x) * k, y: a.y + (p.y - a.y) * k }));
  const e = scaled[scaled.length - 1];
  const dy = e.y - a.y || 1;
  const shift = target.x - e.x;
  return scaled.map((p) => ({ x: p.x + shift * ((p.y - a.y) / dy), y: p.y }));
}

function timed(pts, t0, t1, width) {
  const L = arcLengths(pts);
  const total = L[L.length - 1] || 1;
  return pts.map((p, i) => {
    const u = L[i] / total;
    return { x: p.x, y: p.y, t: t0 + (t1 - t0) * u, w: width(u) };
  });
}

function timedKnots(pts, knots, width) {
  const L = arcLengths(pts);
  const total = L[L.length - 1] || 1;
  return pts.map((p, i) => {
    let k = 0;
    while (k < knots.length - 2 && i > knots[k + 1].i) k++;
    const a = knots[k], b = knots[k + 1];
    const f = Math.min(1, Math.max(0, (L[i] - L[a.i]) / (L[b.i] - L[a.i] || 1)));
    return { x: p.x, y: p.y, t: a.t + (b.t - a.t) * f, w: width(L[i] / total) };
  });
}

function nearestIndex(pts, q) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i].x - q.x) ** 2 + (pts[i].y - q.y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function findNeck(pts, from, to, minGap, maxGap) {
  let best = null;
  for (let i = from; i < to; i++) {
    for (let j = i + minGap; j < Math.min(to, i + maxGap); j++) {
      const d = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      if (!best || d < best.d) best = { i, j, d };
    }
  }
  return best;
}

function clearance(pts, other, near) {
  let best = Infinity;
  const o = pts[0];
  for (const p of pts) {
    if (Math.hypot(p.x - o.x, p.y - o.y) < near) continue;
    for (const q of other) {
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

// ---------- public sampling API ----------

export function indexAt(pts, T) {
  if (T < pts[0].t) return -1;
  let lo = 0, hi = pts.length - 1;
  if (T >= pts[hi].t) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= T) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function pointAt(pts, T) {
  const i = indexAt(pts, T);
  if (i < 0) return { ...pts[0], i: 0 };
  if (i >= pts.length - 1) return { ...pts[pts.length - 1], i: pts.length - 1 };
  const a = pts[i], b = pts[i + 1];
  const f = (T - a.t) / (b.t - a.t || 1);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: T, w: a.w + (b.w - a.w) * f, i };
}

export function headingAt(pts, i) {
  const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function normalAt(pts, i) {
  const h = headingAt(pts, i);
  return { x: -Math.sin(h), y: Math.cos(h) };
}

export const channelById = (geo, id) => geo.channels.find((c) => c.id === id);

// What of a channel exists at time T: connected polylines (arrays of samples) and the growth
// front, or null when the channel is complete. After the cutoff the loop is skipped and the neck
// joins its two ends; inside a braid the centreline pauses while the threads carry the water.
export function grownLines(ch, T) {
  const pts = ch.pts;
  const last = indexAt(pts, T);
  if (last < 0) return { lines: [], front: null };
  let front = T < pts[pts.length - 1].t ? pointAt(pts, T) : null;
  let lines;
  if (ch.cut && T >= ch.cut.t) {
    const { i, j } = ch.cut;
    lines = [last >= j ? pts.slice(0, i + 1).concat(pts.slice(j, last + 1)) : pts.slice(0, Math.min(last, i) + 1)];
  } else if (ch.skip) {
    const [a, b] = ch.skip;
    lines = [pts.slice(0, Math.min(last, a) + 1)];
    if (last >= b) lines.push(pts.slice(b, last + 1));
    else if (last >= a) front = null;
  } else {
    lines = [pts.slice(0, last + 1)];
  }
  if (front) lines[lines.length - 1].push(front);
  return { lines: lines.filter((l) => l.length > 1), front };
}

// ---------- the delta ----------

function sineBranch({ seed, from, heading, side, length, wavelength, omega, ds }) {
  const jit = fbm1(seed, 3);
  const raw = sineCurve({
    x: from.x, y: from.y, heading, length, ds,
    wavelength: () => wavelength,
    omega: () => side * omega,
    jitter: (s) => 0.16 * jit(s / 200),
  });
  return resample(raw, ds);
}

function branchClear(opts, avoid) {
  let turn = opts.turn;
  let pts = null;
  for (let tries = 0; tries < 8; tries++) {
    pts = sineBranch({ ...opts, heading: opts.baseHeading + opts.side * turn });
    if (clearance(pts, avoid, 60) > 24) break;
    turn += 0.1;
  }
  return pts;
}

function braid(center, i0, i1, rand) {
  const seg = center.slice(i0, i1 + 1);
  const L = arcLengths(seg);
  const total = L[L.length - 1] || 1;
  const t0 = seg[0].t, t1 = seg[seg.length - 1].t;
  const threads = [];
  for (let k = 0; k < 5; k++) {
    const base = (k - 2) / 2;
    const freq = 0.9 + rand() * 0.9;
    const phase = rand() * TAU;
    const amp = 9 + rand() * 7;
    const pts = seg.map((p, j) => {
      const v = L[j] / total;
      const env = Math.pow(Math.sin(Math.PI * v), 0.85);
      const off = env * (base * 30 + amp * Math.sin(TAU * freq * v + phase));
      const n = normalAt(seg, j);
      return { x: p.x + n.x * off, y: p.y + n.y * off, t: t0 + (t1 - t0) * v, w: 1.7 };
    });
    threads.push({ id: `braid-${k}`, label: 'braid', kind: 'braid', pts });
  }
  return threads;
}

export function buildDelta(seed) {
  const rand = mulberry32(seed);
  const coast = makeCoast(seed);

  // 1a. IranSpoti: a young river that meanders harder and harder until one bend nearly closes.
  const jitI = fbm1(seed + 3, 3);
  const rawI = sineCurve({
    x: 0, y: 0, heading: Math.PI / 2, length: IRAN.length, ds: 2,
    wavelength: () => IRAN.wavelength,
    omega: (u) => 0.9 + IRAN.peak * smooth(0.2, 0.62, u) - (IRAN.peak - 0.1) * smooth(0.84, 1, u),
    jitter: (s) => 0.16 * (jitI(s / 240) - jitI(0)),
  });
  const iranPts = resample(fitEnd(rawI, { x: 20, y: 430 }), 2.2);

  // 1b. Sibkade: the same river, calmer, all the way to the sea. Its first heading matches.
  const W0 = 1.15;
  const endHeading = headingAt(iranPts, iranPts.length - 1);
  const phase0 = Math.asin(Math.max(-1, Math.min(1, angleDiff(endHeading, Math.PI / 2) / W0)));
  const jitS = fbm1(seed + 5, 3);
  const last = iranPts[iranPts.length - 1];
  const rawS = sineCurve({
    x: last.x, y: last.y, heading: Math.PI / 2, length: 2300, ds: 2, phase0,
    wavelength: (u) => 320 + 220 * u,
    omega: (u) => W0 - 0.6 * u,
    jitter: (s) => 0.18 * (jitS(s / 300) - jitS(0)),
  });
  const stemMouth = { x: STEM_MOUTH_X, y: coast(STEM_MOUTH_X) + 6 };
  const iranspoti = timed(iranPts, 0, TIMES.cutoff, (u) => 2.2 + 0.8 * u);
  // Barayand splits 62% of the way down the stem, leaving room for its braid and lobe.
  const stemPts = resample(fitEnd(rawS, stemMouth), 2.2);
  const SL = arcLengths(stemPts);
  const kB = SL.findIndex((s) => s >= SL[SL.length - 1] * 0.62);
  const sibkade = timedKnots(
    stemPts,
    [{ i: 0, t: TIMES.stem[0] }, { i: kB, t: TIMES.barayand }, { i: stemPts.length - 1, t: TIMES.stem[1] }],
    (u) => 3.2 + 5.8 * smooth(0, 0.85, u),
  );

  const neck = findNeck(iranspoti, Math.floor(iranspoti.length * 0.35), iranspoti.length - 4, 30, 220);
  const cut = { i: neck.i, j: neck.j, t: TIMES.cutoff };
  const oxbow = { pts: iranspoti.slice(neck.i, neck.j + 1).map(({ x, y }) => ({ x, y })), t: TIMES.cutoff };

  // 2. HelpFinity: the first distributary, which dries; Mind Mirror refills part of it.
  const apex = pointAt(sibkade, TIMES.apex);
  const hfPts = branchClear(
    { seed: seed + 11, from: apex, baseHeading: headingAt(sibkade, apex.i), side: 1, turn: 0.62,
      length: 560, wavelength: 190, omega: 0.8, ds: 2.4 },
    sibkade,
  );
  const helpfinity = timed(hfPts, TIMES.apex, TIMES.helpfinityEnd, (u) => 3 - 1.9 * u);
  const HL = arcLengths(helpfinity);
  const refillEnd = HL.findIndex((s) => s >= HL[HL.length - 1] * 0.55);
  const mindmirror = timed(helpfinity.slice(0, refillEnd + 1), TIMES.coda[0], TIMES.coda[1], () => 1.05);

  // 3. Barayand: a smooth branch to its own mouth, then onward through its growing lobe.
  const b0 = pointAt(sibkade, TIMES.barayand);
  const bm = { x: BARAYAND_MOUTH_X, y: coast(BARAYAND_MOUTH_X) };
  const tip = { x: bm.x + 16, y: bm.y + 150 };
  const w1 = rangeOf(rand, -34, 34), w2 = rangeOf(rand, -22, 22);
  const barayandPath = (turn) => {
    const hb = headingAt(sibkade, b0.i) - turn;
    const c1 = { x: b0.x + Math.cos(hb) * 95, y: b0.y + Math.sin(hb) * 95 };
    const dx = bm.x - c1.x, dy = bm.y - c1.y, dl = Math.hypot(dx, dy);
    const nx = -dy / dl, ny = dx / dl;
    const c2 = { x: c1.x + dx * 0.38 + nx * w1, y: c1.y + dy * 0.38 + ny * w1 };
    const c3 = { x: c1.x + dx * 0.72 + nx * w2, y: c1.y + dy * 0.72 + ny * w2 };
    return resample(catmullRom([{ x: b0.x, y: b0.y }, c1, c2, c3, bm, tip]), 2.4);
  };
  let turn = 0.66;
  let bpts = barayandPath(turn);
  for (let tries = 0; tries < 8 && clearance(bpts, sibkade, 60) <= 24; tries++) bpts = barayandPath((turn += 0.1));
  const mi = nearestIndex(bpts, bm);
  const barayand = timedKnots(
    bpts,
    [{ i: 0, t: TIMES.barayand }, { i: mi, t: TIMES.barayandCoast }, { i: bpts.length - 1, t: TIMES.barayandTip }],
    (u) => 3.4 + 3.2 * u,
  );
  const i0 = indexAt(barayand, TIMES.braid[0]);
  const i1 = indexAt(barayand, TIMES.braid[1]);
  const threads = braid(barayand, i0, i1, mulberry32(seed + 23));

  // 4. Weekend projects: distributaries fanning out to the delta front.
  const parents = { sibkade, barayand };
  const projects = PROJECTS.map((p) => {
    const par = parents[p.parent];
    const a = pointAt(par, p.at);
    const h = headingAt(par, a.i);
    const m = { x: p.mouthX, y: coast(p.mouthX) + 3 };
    const toward = Math.atan2(m.y - a.y, m.x - a.x);
    const h1 = h + 0.35 * angleDiff(toward, h);
    const q1 = { x: a.x + Math.cos(h1) * 70, y: a.y + Math.sin(h1) * 70 };
    const ex = m.x - q1.x, ey = m.y - q1.y, el = Math.hypot(ex, ey) || 1;
    const j = rangeOf(rand, -26, 26);
    const q2 = { x: q1.x + ex * 0.5 - (ey / el) * j, y: q1.y + ey * 0.5 + (ex / el) * j };
    const base = resample(catmullRom([{ x: a.x, y: a.y }, q1, q2, m]), 2.4);
    // A gentle meander that vanishes at both ends, so the branch point and the mouth stay put.
    const amp = rangeOf(rand, 5, 12), wl = rangeOf(rand, 80, 140), ph = rand() * TAU;
    const BL = arcLengths(base), total = BL[BL.length - 1];
    const pts = base.map((q, i) => {
      const off = Math.sin((Math.PI * BL[i]) / total) * amp * Math.sin((TAU * BL[i]) / wl + ph);
      const n = normalAt(base, i);
      return { x: q.x + n.x * off, y: q.y + n.y * off };
    });
    return { id: p.id, label: p.id, kind: 'distributary', pts: timed(pts, p.t0, p.t1, (u) => 1.9 - 0.7 * u) };
  });

  const stations = STATIONS.map((s) => {
    const p = pointAt(sibkade, s.t);
    const n = normalAt(sibkade, p.i);
    return { ...s, x: p.x, y: p.y, nx: n.x, ny: n.y };
  });

  const end = (pts) => pts[pts.length - 1];
  const mouths = [
    ...projects.map((c) => ({ id: c.id, x: end(c.pts).x, y: end(c.pts).y, t: end(c.pts).t })),
    { id: 'sibkade', x: end(sibkade).x, y: end(sibkade).y, t: TIMES.stem[1] },
    { id: 'barayand', x: barayand[mi].x, y: barayand[mi].y, t: TIMES.barayandCoast },
  ];
  const lobes = [{ id: 'barayand', x: bm.x, y: bm.y - 8, rx: 140, ry: 165, t0: TIMES.lobe[0], t1: TIMES.lobe[1] }];

  const channels = [
    { id: 'iranspoti', label: 'iranspoti', kind: 'river', pts: iranspoti, cut },
    { id: 'sibkade', label: 'sibkade', kind: 'river', pts: sibkade },
    { id: 'helpfinity', label: 'helpfinity', kind: 'river', pts: helpfinity, dryAt: TIMES.helpfinityEnd },
    { id: 'mindmirror', label: 'mindmirror', kind: 'refill', pts: mindmirror },
    { id: 'barayand', label: 'barayand', kind: 'river', pts: barayand, skip: [i0, i1] },
    ...threads,
    ...projects,
  ];

  const coastEdge = [coast(WORLD.x0), coast(WORLD.x1)];
  return { seed, channels, oxbow, stations, mouths, lobes, coastEdge };
}
