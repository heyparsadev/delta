import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homography, applyH, cssMatrix, planeTransform, pointTransform } from '../js/keynote/labels.js';
import { makeCamera, project, toPixels, rotation, apply3 } from '../js/keynote/camera.js';

const close = (a, b, eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('homography takes four points exactly to four points', () => {
  const src = [[0, 0], [300, 0], [300, 200], [0, 200]];
  const dst = [[10, 20], [420, 60], [380, 330], [30, 250]];
  const H = homography(src, dst);
  assert.equal(H.length, 9);
  src.forEach((p, i) => assert.ok(close(applyH(H, p), dst[i], 1e-6)));
  assert.match(cssMatrix(H), /^matrix3d\(([-\d.e]+,){15}[-\d.e]+\)$/);
});

test('a plane pin lands where the camera projects the surface, and knows its facing', () => {
  const cam = makeCamera({ tx: 0, ty: 0, tz: 0, yaw: 0.3, pitch: 0.15, dist: 8, fov: 30 }, 1.6);
  const R = rotation(0.5, 0.1, 0);
  const at = (x, y) => apply3(R, [x, y, 0.05]);
  const corners = [at(-1.7, 1.07), at(1.7, 1.07), at(1.7, -1.07), at(-1.7, -1.07)];
  const t = planeTransform(cam, corners, 1440, 900, 428, 270);
  assert.ok(t.ok && t.facing);
  const c = toPixels(project(cam, at(0, 0)), 1440, 900);
  assert.ok(close(applyH(t.H, [214, 135]), [c.x, c.y], 1e-4), 'the centre of the element is the centre of the face');
  const back = planeTransform(cam, corners.map((p) => apply3(rotation(Math.PI, 0, 0), p)), 1440, 900, 428, 270);
  assert.equal(back.facing, false);
});

test('a point pin follows the projection and scales with distance', () => {
  const cam = makeCamera({ tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, dist: 10, fov: 30 }, 1.6);
  const a = pointTransform(cam, [0, 0, 0], 1440, 900, 10);
  assert.ok(a.ok && Math.abs(a.x - 720) < 1e-6 && Math.abs(a.y - 450) < 1e-6 && Math.abs(a.s - 1) < 1e-9);
  const b = pointTransform(cam, [0, 0, 5], 1440, 900, 10);
  assert.ok(Math.abs(b.s - 2) < 1e-9);
  assert.equal(pointTransform(cam, [0, 0, 20], 1440, 900).ok, false);
});
