import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marsSolDate, marsTime, formatMars } from '../js/mars.js';

const SOL_MS = 88775244.147; // one mean solar day on Mars

test('MSD matches the Mars24 reference epoch', () => {
  assert.ok(Math.abs(marsSolDate(Date.UTC(2000, 0, 6)) - 44795.9998) < 1e-3);
});

test('one sol later is exactly one MSD later', () => {
  const t = Date.UTC(2026, 8, 23, 12);
  assert.ok(Math.abs(marsSolDate(t + SOL_MS) - marsSolDate(t) - 1) < 1e-6);
});

test('MTC is a valid clock reading', () => {
  const r = marsTime(Date.UTC(2026, 8, 23, 12));
  assert.ok(r.h >= 0 && r.h < 24 && r.m >= 0 && r.m < 60 && r.s >= 0 && r.s < 60);
  assert.ok(r.sol > 54000 && r.sol < 54600, `sol ${r.sol}`);
});

test('formatMars pads and groups', () => {
  const f = formatMars(Date.UTC(2026, 8, 23, 12));
  assert.match(f.time, /^\d{2}:\d{2}:\d{2}$/);
  assert.match(f.sol, /^\d{2},\d{3}$/);
});
