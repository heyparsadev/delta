// What the light draws, in the object's own space: the card centred at the origin in the z = 0
// plane, in the SDF's units (the card is 2 × 1.7 wide). Pure module; lines.js uploads the result.
import { mulberry32 } from '../rng.js';

// A rounded rectangle as a closed polyline (its last point is its first), clockwise from the left
// end of the top edge.
export function roundRect(w, h, r, seg = 8, z = 0) {
  const arcs = [
    [w - r, h - r, Math.PI / 2, 0],
    [w - r, -h + r, 0, -Math.PI / 2],
    [-w + r, -h + r, -Math.PI / 2, -Math.PI],
    [-w + r, h - r, Math.PI, Math.PI / 2],
  ];
  const pts = [[-w + r, h, z]];
  for (const [cx, cy, a0, a1] of arcs) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), z]);
    }
  }
  return pts;
}

// A straight stroke, optionally bowed sideways like a line drawn by hand.
export function stroke(x0, y0, x1, y1, { n = 14, bow = 0, z = 0 } = {}) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(t * Math.PI) * bow;
    pts.push([x0 + dx * t + nx * s, y0 + dy * t + ny * s, z]);
  }
  return pts;
}

const chip = (w, h, j) => roundRect(0.26, 0.2, 0.05, 4).map(([x, y, z]) => [x - w * 0.6 + j(0.02), y + h * 0.2, z]);

// The first draft, by hand: four overshooting strokes, a chip, a line for the code, and the square
// post it lived in (IranSpoti lived on Instagram).
export function sketchCard(w, h, seed = 2019) {
  const rand = mulberry32(seed);
  const j = (a) => (rand() - 0.5) * a;
  const o = 0.14;
  const sq = w * 1.15;
  return [
    stroke(-w - o, h + j(0.05), w + o, h + j(0.05), { bow: j(0.08) }),
    stroke(w + j(0.05), h + o, w + j(0.05), -h - o, { bow: j(0.08) }),
    stroke(w + o, -h + j(0.05), -w - o, -h + j(0.05), { bow: j(0.08) }),
    stroke(-w + j(0.05), -h - o, -w + j(0.05), h + o, { bow: j(0.08) }),
    chip(w, h, j),
    stroke(-w * 0.72, -h * 0.42, w * 0.2, -h * 0.42 + j(0.04), { bow: j(0.03) }),
    [[-sq, sq, -0.02], [sq, sq, -0.02], [sq, -sq, -0.02], [-sq, -sq, -0.02], [-sq, sq, -0.02]],
  ];
}

// The corrected draft: the real outline, the chip and the code line, with no post around it now.
export function cardDraft(w, h, r) {
  const none = () => 0;
  return [roundRect(w, h, r, 10), chip(w, h, none), stroke(-w * 0.72, -h * 0.42, w * 0.2, -h * 0.42)];
}

const arc = (cx, cy, r, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + (a1 - a0) * (i / n);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a), 0];
});

// The plan: extension lines past each edge, dimension lines with end ticks, centre marks and the
// corner radius.
export function blueprint(w, h, r) {
  const e = 0.55, d = 0.32, t = 0.07;
  return [
    [[-w - e, h, 0], [w + e, h, 0]],
    [[-w - e, -h, 0], [w + e, -h, 0]],
    [[-w, h + e, 0], [-w, -h - e, 0]],
    [[w, h + e, 0], [w, -h - e, 0]],
    [[-w, h + d, 0], [w, h + d, 0]], [[-w, h + d - t, 0], [-w, h + d + t, 0]], [[w, h + d - t, 0], [w, h + d + t, 0]],
    [[-w - d, -h, 0], [-w - d, h, 0]], [[-w - d - t, h, 0], [-w - d + t, h, 0]], [[-w - d - t, -h, 0], [-w - d + t, -h, 0]],
    [[-0.18, 0, 0], [0.18, 0, 0]], [[0, -0.18, 0], [0, 0.18, 0]],
    arc(w - r, h - r, r * 1.9, 0.12, 1.45),
    [[w - r, h - r, 0], [w - r + r * 1.9 * Math.cos(0.78), h - r + r * 1.9 * Math.sin(0.78), 0]],
  ];
}

// A fine grid behind the card, in its plane.
export function gridLines(half, step, z = -0.04) {
  const n = Math.round((2 * half) / step);
  const out = [];
  for (let i = 0; i <= n; i++) {
    const v = -half + i * step;
    out.push([[v, -half, z], [v, half, z]], [[-half, v, z], [half, v, z]]);
  }
  return out;
}

// Cumulative lengths, so a reveal fraction maps to a point along the whole drawing. The pen lifts
// between lines, so the gaps between them do not count. With `parallel`, every line reveals at once,
// each from its own start.
export function measure(lines, { parallel = false } = {}) {
  if (parallel) {
    const cum = lines.map((line) => {
      let s = 0;
      const c = line.map((p, i) => (i > 0 ? (s += Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1], p[2] - line[i - 1][2])) : 0));
      return c.map((v) => v / (s || 1));
    });
    return { lines, cum, total: 1, parallel: true };
  }
  let total = 0;
  const cum = lines.map((line) => line.map((p, i) => {
    if (i > 0) total += Math.hypot(p[0] - line[i - 1][0], p[1] - line[i - 1][1], p[2] - line[i - 1][2]);
    return total;
  }));
  return { lines, cum, total: total || 1 };
}

// Where the pen is, a fraction s of the way along the drawing.
export function pointAt(geom, s) {
  const target = Math.max(0, Math.min(1, s)) * geom.total;
  const lastLine = geom.lines.length - 1;
  for (let k = 0; k <= lastLine; k++) {
    const line = geom.lines[k], cum = geom.cum[k];
    for (let i = 1; i < line.length; i++) {
      if (target <= cum[i] || (k === lastLine && i === line.length - 1)) {
        const seg = cum[i] - cum[i - 1];
        const t = seg > 0 ? Math.max(0, Math.min(1, (target - cum[i - 1]) / seg)) : 1;
        const a = line[i - 1], b = line[i];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
    }
  }
  return geom.lines[0][0].slice();
}

// ---- Plan 2: the other forms ----

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Barayand's five models, in spectral order (Apple's dark-mode system colours), and the Playground's
// six lights in project order: Bargasht, ApplyBot, Apsis (Mars, red), The Descent (white), Persian LLM
// Eval, the plugins. The row sits in world space above the floor.
export const FIVE = [[1, 0.27, 0.23], [1, 0.84, 0.04], [0.19, 0.82, 0.35], [0.04, 0.52, 1], [0.75, 0.35, 0.95]];
export const SIX = [FIVE[1], FIVE[2], FIVE[0], [1, 1, 1], FIVE[3], FIVE[4]];
export const SIX_X = [-5.5, -3.3, -1.1, 1.1, 3.3, 5.5];
export const SIX_Y = -0.85;

// A circle from the top, clockwise, closed (n + 1 points); onRing gives n points on it.
export function ring(r, n = 96, z = 0) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = Math.PI / 2 - (2 * Math.PI * i) / n;
    return [r * Math.cos(a), r * Math.sin(a), z];
  });
}
export const onRing = (r, n, z = 0) => ring(r, n, z).slice(0, n);

// Vectors added tip to tail, each a shaft and a two-stroke head, in the five colours (a single vector,
// the resultant, is white).
export const ARROWS = [[0.95, 0.3], [0.75, 0.72], [0.2, 0.9], [0.85, -0.25], [0.55, 0.5]];
export function arrows(vecs, start, head = 0.12) {
  const lines = [], colors = [];
  let p = [start[0], start[1]];
  vecs.forEach((v, i) => {
    const q = [p[0] + v[0], p[1] + v[1]];
    const l = Math.hypot(v[0], v[1]) || 1, ux = v[0] / l, uy = v[1] / l;
    const c = Math.cos(0.45), s = Math.sin(0.45);
    const back = (sx) => [q[0] - head * (ux * c - sx * uy * s), q[1] - head * (uy * c + sx * ux * s), 0];
    lines.push([[p[0], p[1], 0], [q[0], q[1], 0]], [back(1), [q[0], q[1], 0], back(-1)]);
    const col = vecs.length === 1 ? [1, 1, 1] : FIVE[i % 5];
    colors.push(col, col);
    p = q;
  });
  return { lines, colors };
}

// The prism's faces: an equilateral triangle, apex up, as the SDF draws it (half side 1.18 plus its
// rounded edge of 0.07).
export const PRISM_R = 1.18 + 0.07 * Math.sqrt(3);
const IOR = 1.47;
const norm2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
// Snell's law; N faces against I; null on total internal reflection.
function refract2(I, N, eta) {
  const d = N[0] * I[0] + N[1] * I[1];
  const k = 1 - eta * eta * (1 - d * d);
  if (k < 0) return null;
  const s = eta * d + Math.sqrt(k);
  return [eta * I[0] - s * N[0], eta * I[1] - s * N[1]];
}
function rayHit(p, d, a, b) {
  const e = [b[0] - a[0], b[1] - a[1]], w = [a[0] - p[0], a[1] - p[1]];
  const den = d[0] * e[1] - d[1] * e[0];
  return (w[0] * e[1] - w[1] * e[0]) / den;
}

// Newton's prism: one white beam enters the left face and leaves the right face as five. Their index
// spreads with `spread`, so at 0 the five lie on top of each other and add up to white. `jitter`
// wobbles each beam on its own; `wave` bends all five by one shared sine.
export function beams({ spread = 0, jitter = 0, wave = 0, time = 0, len = 4.2 } = {}) {
  const k = Math.sqrt(3), r = PRISM_R;
  const A = [-r, -r / k], B = [r, -r / k], C = [0, (2 * r) / k];
  const hit = [A[0] + (C[0] - A[0]) * 0.42, A[1] + (C[1] - A[1]) * 0.42];
  const d0 = norm2([1, 0.2]);
  const nL = norm2([-(C[1] - A[1]), C[0] - A[0]]);
  const nR = norm2([C[1] - B[1], -(C[0] - B[0])]);
  const d1 = norm2(refract2(d0, nL, 1 / IOR));
  const t1 = rayHit(hit, d1, B, C);
  const exit = [hit[0] + d1[0] * t1, hit[1] + d1[1] * t1];
  const src = [hit[0] - d0[0] * 5.5, hit[1] - d0[1] * 5.5];
  const entry = [[src[0], src[1], 0], [hit[0], hit[1], 0], [exit[0], exit[1], 0]];
  const out = [];
  for (let i = 0; i < 5; i++) {
    const T = norm2(refract2(d1, [-nR[0], -nR[1]], IOR + (i - 2) * 0.05 * spread) ?? d1);
    const side = [-T[1], T[0]];
    const line = [];
    for (let j = 0; j < 24; j++) {
      const s = j / 23, x = s * len;
      const jit = jitter * 0.14 * s * (Math.sin(time * 5.3 + i * 1.7 + x * 3.1) * 0.6 + Math.sin(time * 8.9 + i * 2.9 - x * 5.3) * 0.4);
      const wav = wave * 0.12 * Math.min(1, s * 3) * Math.sin(x * 4.2 - time * 3.2);
      line.push([exit[0] + T[0] * x + side[0] * (jit + wav), exit[1] + T[1] * x + side[1] * (jit + wav), 0]);
    }
    out.push(line);
  }
  return { entry, out, exit, hit };
}

// Five beams meeting in the light, and the one that leaves it.
export function confluence({ spread = 0.55, len = 3.2 } = {}) {
  const inward = FIVE.map((_, i) => [[-len, (i - 2) * spread, 0], [-len * 0.5, (i - 2) * spread * 0.42, 0], [0, 0, 0]]);
  return { inward, outward: [[0, 0, 0], [len, 0, 0]] };
}

// Ten axes around the prism like a radar chart, two webs, and a profile.
const PROFILE = [0.82, 0.64, 0.9, 0.7, 0.58, 0.86, 0.74, 0.68, 0.92, 0.6];
export function radar({ n = 10, r = 1.9 } = {}) {
  const at = (i, rr) => { const a = Math.PI / 2 - (2 * Math.PI * i) / n; return [rr * Math.cos(a), rr * Math.sin(a), 0]; };
  const poly = (f) => Array.from({ length: n + 1 }, (_, i) => at(i % n, f(i % n)));
  return {
    axes: Array.from({ length: n }, (_, i) => [[0, 0, 0], at(i, r)]),
    web: [poly(() => r / 2), poly(() => r)],
    profile: poly((i) => r * PROFILE[i % PROFILE.length]),
  };
}

// The fanned cards' centres, with the same math as sdFan in the shader.
export function fanCentres({ n = 7, step = 0.13, pivot = 2.2, dz = 0.12, fan = 0 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i - (n - 1) / 2) * step * fan;
    return [pivot * Math.sin(a), pivot * Math.cos(a) - pivot, (i - (n - 1) / 2) * dz * fan];
  });
}
// A small light hopping from card to card, just in front of their faces.
export function chainPoint(o, t) {
  const c = fanCentres(o), n = c.length;
  const u = clamp01(t) * (n - 1), i = Math.min(n - 2, Math.floor(u)), f = u - i;
  const p = lerp3(c[i], c[i + 1], f);
  return [p[0], p[1] + Math.sin(Math.PI * f) * 0.25, p[2] + 0.1];
}

// Bargasht: five saves fall into the light one after another and fade as they enter; `back` brings
// one ("book pages") back out.
const SAVE_FROM = [[-1.6, 1.7, 0.3], [-0.8, 2.15, -0.2], [0, 1.6, 0.4], [0.8, 2.2, 0], [1.6, 1.8, -0.3]];
const SAVE_BACK = [1.1, 0.9, 0.3];
export function savesAt(fall, back) {
  return SAVE_FROM.map((p0, i) => {
    const t = ease(clamp01(fall * 1.6 - i * 0.15));
    let p = p0.map((v) => v * (1 - t));
    let o = 1 - smooth(0.75, 1, t), s = 1 - 0.6 * t;
    if (i === 3 && back > 0) {
      const b = ease(clamp01(back));
      p = SAVE_BACK.map((v) => v * b);
      o = Math.max(o, smooth(0, 0.3, back));
      s = 0.4 + 0.6 * b;
    }
    return { p, o, s };
  });
}

// ApplyBot's two sheets (copies at x = ±gap/2) and the writing on their fronts: a heading and ten body
// lines each, alternating sheet by sheet so both write at once.
export const SHEET = { w: 0.62, h: 0.88, gap: 1.56, depth: 0.02 };
export function sheetText({ w, h, gap, depth } = SHEET, seed = 2026) {
  const rand = mulberry32(seed);
  const z = depth + 0.004, x0 = -w * 0.78, tw = w * 1.56;
  const rows = [[h * 0.72, 0.55]];
  for (let k = 0; k < 10; k++) rows.push([h * 0.46 - k * 0.12, 0.55 + rand() * 0.45]);
  const out = [];
  for (const [y, len] of rows) {
    for (const cx of [-gap / 2, gap / 2]) out.push(stroke(cx + x0, y, cx + x0 + tw * len, y, { n: 6, z }));
  }
  return out;
}

// The Descent: a binary tree of life with 256 tips on one row and the root 2.6 above them, placed so
// our tip (the glowing dot) is at the origin. The lineage runs from our tip up to the root; the other
// branches are drawn from child to parent, in the order they join our lineage (nearest first).
export function treeOfLife({ depth = 8, seed = 38 } = {}) {
  const rand = mulberry32(seed);
  const n = 2 ** depth, W = 5.2, H = 2.6, ours = 97;
  const levels = [];
  levels[depth] = Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * (W / n) + (rand() - 0.5) * (W / n) * 0.3, 0]);
  for (let L = depth - 1; L >= 0; L--) {
    const kids = levels[L + 1];
    levels[L] = Array.from({ length: kids.length / 2 }, (_, j) => [(kids[2 * j][0] + kids[2 * j + 1][0]) / 2 + (rand() - 0.5) * 0.04, ((depth - L) / depth) * H]);
  }
  const o = levels[depth][ours];
  const P = (L, j) => [levels[L][j][0] - o[0], levels[L][j][1] - o[1], 0];
  const edge = (L, j) => {
    const a = P(L, j), b = P(L - 1, j >> 1);
    return Array.from({ length: 6 }, (_, k) => { const t = k / 5; return [a[0] + (b[0] - a[0]) * smooth(0, 1, t), a[1] + (b[1] - a[1]) * t, 0]; });
  };
  const lineage = [];
  for (let L = depth, j = ours; L >= 1; L--, j >>= 1) lineage.push(...edge(L, j).slice(lineage.length ? 1 : 0));
  const branches = [];
  const subtree = (L, j) => {
    if (L < depth) { subtree(L + 1, 2 * j); subtree(L + 1, 2 * j + 1); }
    branches.push(edge(L, j));
  };
  for (let L = depth, j = ours; L >= 1; L--, j >>= 1) subtree(L, j ^ 1);
  return { lineage, branches, tips: levels[depth].map((_, i) => P(depth, i)), ours, root: P(0, 0) };
}

// Persian LLM Eval: 300 items in 10 tracks. Rows light one after another, each from left to right.
export const RACE_ROW = 6;
export function grid300({ cols = 30, rows = 10, w = 3.4, h = 1.6 } = {}) {
  const pts = [], order = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push([-w / 2 + (c * w) / (cols - 1), h / 2 - (r * h) / (rows - 1), 0]);
      order.push((r + (c / cols) * 0.9) / rows);
    }
  }
  return { pts, order };
}
// On one row, a small light starts behind a large one and passes it at t ≈ 0.62.
export function raceAt(t, { w = 3.4, h = 1.6 } = {}) {
  const y = h / 2 - (RACE_ROW * h) / 9, u = clamp01(t);
  return { big: [-w / 2 + w * (0.1 + 0.6 * u), y, 0.02], small: [-w / 2 + w * (0.02 + 0.9 * Math.pow(u, 1.4)), y, 0.02] };
}

// One more thing: a thousand points on a shell, one per signature, appearing in a random order, and
// the slot near the front right where the light settles as one of them.
export function field1000({ n = 1000, r = 3.4, seed = 2023 } = {}) {
  const rand = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, rad = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
    const k = r * (1 + (rand() - 0.5) * 0.24);
    pts.push([Math.cos(th) * rad * k, y * k, Math.sin(th) * rad * k]);
  }
  const keys = pts.map(() => rand());
  const rank = keys.map((_, i) => i).sort((a, b) => keys[a] - keys[b]);
  const order = new Array(n);
  rank.forEach((idx, k) => { order[idx] = k / n; });
  const t = [0.45, 0.2, 0.87], tl = Math.hypot(...t);
  let slot = 0, best = -2;
  pts.forEach((p, i) => { const d = (p[0] * t[0] + p[1] * t[1] + p[2] * t[2]) / (Math.hypot(...p) * tl); if (d > best) { best = d; slot = i; } });
  return { pts, order, slot };
}

// Barayand's seven features, orbiting on a tilted ellipse.
export function orbitAt(t, { n = 7, rx = 2.3, rz = 0.9, y = 0.15, tilt = 0.22 } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const a = t * 0.6 + (i * 2 * Math.PI) / n, x = rx * Math.cos(a);
    return [x * Math.cos(tilt), y + x * Math.sin(tilt), rz * Math.sin(a)];
  });
}

// Marks just outside a rectangle's edges (the patterns Mind Mirror remembers), and where they come from.
export function edgeMarks({ w, h, n = 36, seed = 7 }) {
  const rand = mulberry32(seed);
  const L = 4 * (w + h), pts = [], from = [];
  for (let i = 0; i < n; i++) {
    let s = ((i + rand() * 0.6) / n) * L;
    let p;
    if (s < 2 * w) p = [-w + s, h + 0.07];
    else if ((s -= 2 * w) < 2 * h) p = [w + 0.07, h - s];
    else if ((s -= 2 * h) < 2 * w) p = [w - s, -h - 0.07];
    else { s -= 2 * w; p = [-w - 0.07, -h + s]; }
    pts.push([p[0], p[1], 0.02]);
    from.push([p[0] * 2.2 + (rand() - 0.5) * 0.4, p[1] * 2.2 + (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.6]);
  }
  return { pts, from };
}

// Sibkade's support desk: a small light arrives along the stack's axis, waits just outside its top
// layer (d is how far that is), then passes into it.
export function waitPass(t, { d }) {
  const far = [0.35, 0.3, d + 2.4], edge = [0.2, 0.1, d], home = [0, 0, 0];
  if (t < 0.35) return lerp3(far, edge, ease(clamp01(t / 0.35)));
  if (t < 0.7) return edge;
  return lerp3(edge, home, ease(clamp01((t - 0.7) / 0.3)));
}
