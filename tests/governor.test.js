import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor } from '../js/governor.js';

const feed = (gov, n, interval) => { for (let i = 0; i < n; i++) gov.sample(interval(i)); };
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('frames at the display’s pace keep full quality', () => {
  const gov = createGovernor({ start: 1 });
  feed(gov, 2000, () => 16.7);
  assert.equal(gov.quality, 1);
});

test('a steady 30 Hz display is not mistaken for a slow GPU', () => {
  const gov = createGovernor({ start: 1 });
  feed(gov, 2000, () => 33.3);
  assert.equal(gov.quality, 1);
});

test('slow frames lower quality; it climbs back once frames keep up', () => {
  const changes = [];
  const gov = createGovernor({ start: 1, onChange: (q) => changes.push(q) });
  feed(gov, 240, (i) => (i % 10 < 3 ? 16.7 : 30));
  assert.ok(near(gov.quality, 0.85));
  assert.equal(changes.length, 1);
  feed(gov, 1200, () => 16.7);
  assert.equal(gov.quality, 1);
  assert.equal(changes.length, 3);
});

test('quality never drops below the floor', () => {
  const gov = createGovernor({ start: 1, min: 0.5 });
  feed(gov, 6000, (i) => (i % 10 < 3 ? 16.7 : 40));
  assert.ok(near(gov.quality, 0.5));
});
