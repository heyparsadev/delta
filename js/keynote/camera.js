// The stage camera. Pure module: the SDF shader and the line renderer build their rays and
// projections from these same numbers, so lines sit exactly on the surfaces the shader draws.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// s: { tx, ty, tz, yaw, pitch, dist, fov (degrees), shiftX, shiftY }. The camera orbits its target;
// yaw 0 and pitch 0 look from +z towards -z. The shift moves the picture in NDC, like a lens shift,
// so the object can sit beside a slide without the perspective turning.
export function makeCamera(s, aspect) {
  const pitch = Math.max(-1.45, Math.min(1.45, s.pitch));
  const cp = Math.cos(pitch);
  const target = [s.tx, s.ty, s.tz];
  const pos = [s.tx + s.dist * cp * Math.sin(s.yaw), s.ty + s.dist * Math.sin(pitch), s.tz + s.dist * cp * Math.cos(s.yaw)];
  const fwd = norm(sub(target, pos));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  return {
    pos, target, fwd, right, up, aspect,
    tanHalf: Math.tan(((s.fov || 30) * Math.PI) / 360),
    shiftX: s.shiftX || 0, shiftY: s.shiftY || 0,
  };
}

// World point → NDC ({ x, y } in -1…1 across the view), view depth z, and ok = in front of the camera.
export function project(cam, p) {
  const d = sub(p, cam.pos);
  const z = dot(d, cam.fwd);
  return {
    x: dot(d, cam.right) / (z * cam.tanHalf * cam.aspect) + cam.shiftX,
    y: dot(d, cam.up) / (z * cam.tanHalf) + cam.shiftY,
    z,
    ok: z > 0.05,
  };
}

export const toPixels = (ndc, w, h) => ({ x: (ndc.x * 0.5 + 0.5) * w, y: (0.5 - ndc.y * 0.5) * h });

// The ray through an NDC point: the inverse of project(), and what the SDF shader computes per pixel.
export function ray(cam, nx, ny) {
  const x = (nx - cam.shiftX) * cam.tanHalf * cam.aspect;
  const y = (ny - cam.shiftY) * cam.tanHalf;
  return norm([
    cam.fwd[0] + cam.right[0] * x + cam.up[0] * y,
    cam.fwd[1] + cam.right[1] * x + cam.up[1] * y,
    cam.fwd[2] + cam.right[2] * x + cam.up[2] * y,
  ]);
}

// Object rotation R = Ry(yaw) · Rx(pitch) · Rz(roll), row-major 3×3. Its transpose is its inverse.
export function rotation(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  return [
    cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
    cx * sz, cx * cz, -sx,
    -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx,
  ];
}
export const transpose3 = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const apply3 = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
