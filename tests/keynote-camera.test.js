import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCamera, project, ray, rotation, transpose3, apply3, toPixels } from '../js/keynote/camera.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const closeVec = (a, b, eps = 1e-9) => a.every((v, i) => close(v, b[i], eps));
const CAM = { tx: 0.3, ty: -0.2, tz: 0.1, yaw: 0.4, pitch: 0.2, dist: 8, fov: 30, shiftX: 0.25, shiftY: -0.1 };

test('the target lands on the lens shift, at the orbit distance', () => {
  const cam = makeCamera(CAM, 16 / 9);
  const p = project(cam, [CAM.tx, CAM.ty, CAM.tz]);
  assert.ok(close(p.x, 0.25) && close(p.y, -0.1) && close(p.z, 8) && p.ok);
});

test('ray() inverts project(): a pixel’s ray passes through the point it shows', () => {
  const cam = makeCamera(CAM, 1.5);
  for (const q of [[1, 0.5, -2], [-1.2, -0.8, 0.4], [0, 1, 1]]) {
    const p = project(cam, q);
    const d = ray(cam, p.x, p.y);
    const v = [q[0] - cam.pos[0], q[1] - cam.pos[1], q[2] - cam.pos[2]];
    const l = Math.hypot(...v);
    assert.ok(close(d[0] * v[0] / l + d[1] * v[1] / l + d[2] * v[2] / l, 1));
  }
});

test('yaw 0 and pitch 0 look from +z towards -z; points behind the camera are not ok', () => {
  const cam = makeCamera({ tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, dist: 5, fov: 30 }, 1);
  assert.ok(closeVec(cam.pos, [0, 0, 5]));
  assert.ok(closeVec(cam.fwd, [0, 0, -1]));
  assert.ok(closeVec(cam.right, [1, 0, 0]));
  assert.equal(project(cam, [0, 0, 10]).ok, false);
  const px = toPixels(project(cam, [0, 0, 0]), 800, 600);
  assert.ok(close(px.x, 400) && close(px.y, 300));
});

test('rotation is orthonormal and its transpose undoes it', () => {
  const R = rotation(0.7, -0.3, 0.2);
  const v = [0.3, -1.2, 2];
  assert.ok(closeVec(apply3(transpose3(R), apply3(R, v)), v, 1e-12));
  assert.ok(closeVec(apply3(rotation(Math.PI / 2, 0, 0), [1, 0, 0]), [0, 0, -1], 1e-12));
  assert.ok(closeVec(rotation(0, 0, 0), [1, 0, 0, 0, 1, 0, 0, 0, 1]));
});
