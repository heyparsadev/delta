// The influence field: a small RGBA texture for the terrain shader. Pure module.
// R moisture (land) / sediment plume (sea) · G arrival time · B paleochannel · A sea (0 land … 1 deep)
import { WORLD, makeCoast } from './delta.js';

const SPREAD = 0.0012; // story time per world unit: wetness spreads slower than the river grows (~0.0005)

function boxBlur(src, W, H, r, passes = 3) {
  let a = Float32Array.from(src);
  const b = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < H; j++) {
      const row = j * W;
      let acc = a[row] * (r + 1);
      for (let i = 1; i <= r; i++) acc += a[row + (i < W ? i : W - 1)];
      for (let i = 0; i < W; i++) {
        b[row + i] = acc * inv;
        const add = i + r + 1 < W ? i + r + 1 : W - 1;
        const sub = i - r > 0 ? i - r : 0;
        acc += a[row + add] - a[row + sub];
      }
    }
    for (let i = 0; i < W; i++) {
      let acc = b[i] * (r + 1);
      for (let j = 1; j <= r; j++) acc += b[(j < H ? j : H - 1) * W + i];
      for (let j = 0; j < H; j++) {
        a[j * W + i] = acc * inv;
        const add = j + r + 1 < H ? j + r + 1 : H - 1;
        const sub = j - r > 0 ? j - r : 0;
        acc += b[add * W + i] - b[sub * W + i];
      }
    }
  }
  return a;
}

// Two-pass chamfer: arrival spreads outward from the channels, getting later with distance.
function propagate(arr, W, H, step) {
  const diag = step * Math.SQRT2;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      let v = arr[k], c;
      if (i > 0 && (c = arr[k - 1] + step) < v) v = c;
      if (j > 0) {
        if ((c = arr[k - W] + step) < v) v = c;
        if (i > 0 && (c = arr[k - W - 1] + diag) < v) v = c;
        if (i < W - 1 && (c = arr[k - W + 1] + diag) < v) v = c;
      }
      arr[k] = v;
    }
  }
  for (let j = H - 1; j >= 0; j--) {
    for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i;
      let v = arr[k], c;
      if (i < W - 1 && (c = arr[k + 1] + step) < v) v = c;
      if (j < H - 1) {
        if ((c = arr[k + W] + step) < v) v = c;
        if (i < W - 1 && (c = arr[k + W + 1] + diag) < v) v = c;
        if (i > 0 && (c = arr[k + W - 1] + diag) < v) v = c;
      }
      arr[k] = v;
    }
  }
}

export function buildField(geo, seed, W = 256, H = 512) {
  const cell = (WORLD.x1 - WORLD.x0) / W; // square cells: 6.25 world units
  const N = W * H;
  const mask = new Float32Array(N);
  const arrival = new Float32Array(N).fill(1);
  const paleo = new Float32Array(N);
  const coast = makeCoast(seed);

  // Stamp a disc: mode 0 = channel (moisture + arrival), 1 = plume, 2 = paleochannel.
  // Written without callbacks because it runs ~100k times on page load.
  function stamp(x, y, radius, t, mode) {
    const cx = (x - WORLD.x0) / cell, cy = (y - WORLD.y0) / cell, r = radius / cell, r2 = r * r;
    const i0 = Math.max(0, Math.floor(cx - r)), i1 = Math.min(W - 1, Math.ceil(cx + r));
    const j0 = Math.max(0, Math.floor(cy - r)), j1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const k = j * W + i;
        const f = 1 - Math.sqrt(d2) / r;
        if (mode === 2) {
          const v = f * 1.6 > 1 ? 1 : f * 1.6;
          if (v > paleo[k]) paleo[k] = v;
          continue;
        }
        const v = mode === 0 ? 0.55 + 0.45 * f : 0.85 * f;
        if (v > mask[k]) mask[k] = v;
        if (t < arrival[k]) arrival[k] = t;
      }
    }
  }

  for (const c of geo.channels) {
    if (c.kind === 'refill') continue; // shares HelpFinity's bed
    const pts = c.pts;
    // Samples are ~2.3 units apart and cells are 6.25, so every other sample is plenty.
    for (let n = 0; n < pts.length; n += 2) {
      const p = pts[n];
      stamp(p.x, p.y, p.w * 1.6 + 7, p.t, 0);
      if (c.id === 'helpfinity') stamp(p.x, p.y, 8, 0, 2);
    }
  }
  // Sediment plumes spreading from each mouth and from the tip of the Barayand lobe.
  for (const m of geo.mouths) stamp(m.x, m.y + 18, m.id === 'barayand' ? 110 : 64, m.t, 1);
  for (const l of geo.lobes) stamp(l.x, l.y + l.ry, 150, l.t1, 1);

  propagate(arrival, W, H, SPREAD * cell);

  const sea = new Float32Array(N);
  for (let i = 0; i < W; i++) {
    const cy = coast(WORLD.x0 + (i + 0.5) * cell);
    for (let j = 0; j < H; j++) sea[j * W + i] = WORLD.y0 + (j + 0.5) * cell > cy ? 1 : 0;
  }
  const seaSoft = boxBlur(sea, W, H, 12);
  const wetLand = boxBlur(mask, W, H, 2);
  const wetSea = boxBlur(mask, W, H, 7);
  const paleoSoft = boxBlur(paleo, W, H, 1, 2);

  const data = new Uint8ClampedArray(N * 4);
  for (let k = 0; k < N; k++) {
    const s = Math.min(1, Math.max(0, (seaSoft[k] - 0.35) / 0.3));
    const m = Math.min(1, wetLand[k] * 1.25) * (1 - s) + Math.min(1, wetSea[k] * 1.6) * s;
    data[k * 4] = Math.round(m * 255);
    data[k * 4 + 1] = Math.round(Math.min(1, arrival[k]) * 255);
    data[k * 4 + 2] = Math.round(Math.min(1, paleoSoft[k]) * 255);
    data[k * 4 + 3] = Math.round(seaSoft[k] * 255);
  }
  return { width: W, height: H, data, rect: [WORLD.x0, WORLD.y0, WORLD.x1 - WORLD.x0, WORLD.y1 - WORLD.y0] };
}

export function sampleField(field, x, y) {
  const [x0, y0, w, h] = field.rect;
  const i = Math.min(field.width - 1, Math.max(0, Math.floor(((x - x0) / w) * field.width)));
  const j = Math.min(field.height - 1, Math.max(0, Math.floor(((y - y0) / h) * field.height)));
  const k = (j * field.width + i) * 4;
  const d = field.data;
  return { r: d[k] / 255, g: d[k + 1] / 255, b: d[k + 2] / 255, a: d[k + 3] / 255 };
}
