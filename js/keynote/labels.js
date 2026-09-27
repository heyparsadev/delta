// DOM labels pinned to the stage. A point pin floats a label at a 3D position; a plane pin maps an
// element onto a quad in 3D with a projective transform (CSS matrix3d), so it reads as printed on the
// surface. The math is pure; pinPoint and pinPlane write the styles.
import { project, toPixels } from './camera.js';

// Gaussian elimination with partial pivoting, for the 8 × 8 system below.
function solve(A, b) {
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

// The projective map (3 × 3, row-major, h33 = 1) that takes src[i] to dst[i].
export function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return [...solve(A, b), 1];
}
export function applyH(H, [x, y]) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}
export const cssMatrix = (H) => `matrix3d(${[H[0], H[3], 0, H[6], H[1], H[4], 0, H[7], 0, 0, 1, 0, H[2], H[5], 0, H[8]]
  .map((v) => +v.toPrecision(8)).join(',')})`;

// corners: the world positions of the element's top-left, top-right, bottom-right and bottom-left.
// facing: the quad winds clockwise on screen, so its front is towards the camera.
export function planeTransform(cam, corners, W, H, ew, eh) {
  const pr = corners.map((c) => project(cam, c));
  if (pr.some((p) => !p.ok)) return { ok: false };
  const px = pr.map((p) => { const q = toPixels(p, W, H); return [q.x, q.y]; });
  let area = 0;
  for (let i = 0; i < 4; i++) { const a = px[i], b = px[(i + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
  const Hm = homography([[0, 0], [ew, 0], [ew, eh], [0, eh]], px);
  return { ok: true, facing: area > 0, H: Hm, css: cssMatrix(Hm) };
}
// ref: the depth at which the label shows at its own size.
export function pointTransform(cam, p, W, H, ref = 10) {
  const q = project(cam, p);
  if (!q.ok) return { ok: false };
  const s = toPixels(q, W, H);
  return { ok: true, x: s.x, y: s.y, s: ref / q.z };
}

export function pinPlane(el, t) {
  const on = t.ok && t.facing;
  el.style.visibility = on ? '' : 'hidden';
  if (on) el.style.transform = t.css;
}
// anchor: 'center' centres the label on the point; 'left' starts it there.
export function pinPoint(el, t, scale = true, anchor = 'center') {
  el.style.visibility = t.ok ? '' : 'hidden';
  if (t.ok) el.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) translate(${anchor === 'left' ? '0' : '-50%'}, -50%)${scale ? ` scale(${t.s.toFixed(3)})` : ''}`;
}
