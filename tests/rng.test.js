import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, noise1, fbm1, rangeOf } from '../js/rng.js';

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('noise1 is smooth, bounded and seeded', () => {
  const n = noise1(7), m = noise1(7);
  let prev = n(0);
  for (let x = 0; x < 50; x += 0.01) {
    const v = n(x);
    assert.equal(v, m(x));
    assert.ok(v >= -1 && v <= 1);
    assert.ok(Math.abs(v - prev) < 0.05, `jump at ${x}`);
    prev = v;
  }
  assert.ok(Number.isFinite(n(-12.5)));
});

test('fbm1 stays in [-1, 1]', () => {
  const f = fbm1(3, 5);
  for (let x = -100; x < 100; x += 0.37) {
    const v = f(x);
    assert.ok(v >= -1 && v <= 1);
  }
});

test('rangeOf maps into [a, b)', () => {
  const r = mulberry32(9);
  for (let i = 0; i < 200; i++) {
    const v = rangeOf(r, -3, 5);
    assert.ok(v >= -3 && v < 5);
  }
});
