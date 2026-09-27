import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDelta, channelById } from '../js/delta.js';
import { buildField, sampleField } from '../js/field.js';
import { SEED } from '../js/story.js';

const geo = buildDelta(SEED);
const field = buildField(geo, SEED);

test('field has the documented shape', () => {
  assert.equal(field.width, 256);
  assert.equal(field.height, 512);
  assert.equal(field.data.length, 256 * 512 * 4);
  assert.deepEqual(field.rect, [-800, -200, 1600, 3200]);
});

test('water arrives at the source first', () => {
  assert.ok(sampleField(field, 0, 0).g < 0.02);
  const stem = channelById(geo, 'sibkade').pts;
  const mid = stem[Math.floor(stem.length / 2)];
  const g = sampleField(field, mid.x, mid.y).g;
  assert.ok(Math.abs(g - mid.t) < 0.03, `arrival ${g} vs ${mid.t}`);
});

test('moisture follows the channels', () => {
  const stem = channelById(geo, 'sibkade').pts;
  const p = stem[Math.floor(stem.length / 3)];
  assert.ok(sampleField(field, p.x, p.y).r > 0.3);
  assert.equal(sampleField(field, -790, -190).r, 0);
});

test('land and sea', () => {
  assert.ok(sampleField(field, 0, 500).a < 0.1);
  assert.ok(sampleField(field, 0, 2800).a > 0.9);
});

test('the HelpFinity bed is marked as paleochannel', () => {
  const hf = channelById(geo, 'helpfinity').pts;
  const p = hf[Math.floor(hf.length / 2)];
  assert.ok(sampleField(field, p.x, p.y).b > 0.3);
  assert.equal(sampleField(field, 700, 300).b, 0);
});
