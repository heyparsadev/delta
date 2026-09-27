import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendar, calendarLabel, tForMonth, locate, scrollForT, mixCam, spring, smoothstep } from '../js/timeline.js';

test('calendar hits every anchor', () => {
  assert.deepEqual(calendar(0), { year: 2019, month: 1 });
  assert.deepEqual(calendar(0.12), { year: 2020, month: 1 });
  assert.deepEqual(calendar(0.38), { year: 2023, month: 1 });
  assert.deepEqual(calendar(0.72), { year: 2026, month: 6 });
  assert.deepEqual(calendar(1), { year: 2026, month: 9 });
  assert.equal(calendarLabel(0.72), 'Jun 2026');
  assert.equal(calendar(0.25).year, 2021);
});

test('tForMonth inverts calendar', () => {
  assert.equal(tForMonth(2019, 1), 0);
  assert.ok(Math.abs(tForMonth(2023, 1) - 0.38) < 1e-9);
  assert.ok(Math.abs(tForMonth(2026, 6) - 0.72) < 1e-9);
  for (const [y, m] of [[2019, 7], [2021, 3], [2024, 11], [2026, 2], [2026, 8]]) {
    assert.deepEqual(calendar(tForMonth(y, m)), { year: y, month: m });
  }
});

const STEPS = [
  { top: 0, height: 100, t0: 1, t1: 1 },
  { top: 100, height: 200, t0: 1, t1: 0 },
  { top: 300, height: 100, t0: 0, t1: 0.5 },
  { top: 400, height: 100, t0: 0.5, t1: 1 },
];

test('locate finds the step under the probe and interpolates T', () => {
  assert.equal(locate(STEPS, 50).index, 0);
  assert.equal(locate(STEPS, 50).T, 1);
  const r = locate(STEPS, 200);
  assert.equal(r.index, 1);
  assert.equal(r.p, 0.5);
  assert.equal(r.T, 0.5);
  assert.equal(locate(STEPS, 350).T, 0.25);
  assert.equal(locate(STEPS, -10).index, 0);
  const end = locate(STEPS, 9999);
  assert.equal(end.index, 3);
  assert.equal(end.T, 1);
});

test('scrollForT uses only forward steps and round-trips with locate', () => {
  assert.equal(scrollForT(STEPS, 0.25, 50), 300);
  for (const T of [0, 0.1, 0.5, 0.77, 1]) {
    const y = scrollForT(STEPS, T, 50);
    assert.ok(Math.abs(locate(STEPS, y + 50).T - T) < 1e-9, `T=${T}`);
  }
});

test('mixCam interpolates height in log space', () => {
  const c = mixCam({ x: 0, y: 0, h: 100 }, { x: 10, y: 20, h: 10000 }, 0.5);
  assert.equal(c.x, 5);
  assert.equal(c.y, 10);
  assert.ok(Math.abs(c.h - 1000) < 1e-6);
});

test('spring settles without overshoot', () => {
  let x = 0, v = 0;
  for (let i = 0; i < 180; i++) {
    [x, v] = spring(x, v, 1, 1 / 60, 8);
    assert.ok(x <= 1 + 1e-9);
  }
  assert.ok(Math.abs(x - 1) < 1e-3);
});

test('smoothstep clamps', () => {
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
});
