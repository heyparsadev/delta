import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDelta, channelById } from '../js/delta.js';
import { buildIndex, hitAt } from '../js/hittest.js';
import { SEED, PROJECTS, TIMES } from '../js/story.js';

const geo = buildDelta(SEED);
const index = buildIndex(geo, new Set(PROJECTS.map((p) => p.id)));
const ch = (id) => channelById(geo, id);
const mid = (pts) => pts[Math.floor(pts.length / 2)];

test('a point on the main stem reads Sibkade', () => {
  const p = mid(ch('sibkade').pts);
  assert.equal(hitAt(index, p.x, p.y, 10, 1), 'sibkade');
});

test('nothing answers before the water arrives', () => {
  const p = ch('sibkade').pts.find((q) => q.t >= 0.5);
  assert.equal(hitAt(index, p.x, p.y, 3, 0.2), null);
});

test('the refilled bed answers as Mind Mirror, the dry rest as HelpFinity', () => {
  const p = mid(ch('mindmirror').pts);
  assert.equal(hitAt(index, p.x, p.y, 6, TIMES.coda[1] + 0.01), 'mindmirror');
  assert.equal(hitAt(index, p.x, p.y, 6, TIMES.coda[0] - 0.01), 'helpfinity');
  const tail = ch('helpfinity').pts.at(-5);
  assert.equal(hitAt(index, tail.x, tail.y, 3, 1), 'helpfinity');
});

test('the IranSpoti loop becomes the oxbow at the cutoff', () => {
  const ir = ch('iranspoti');
  const p = ir.pts[Math.floor((ir.cut.i + ir.cut.j) / 2)];
  assert.equal(hitAt(index, p.x, p.y, 3, TIMES.cutoff - 0.001), 'iranspoti');
  assert.equal(hitAt(index, p.x, p.y, 3, TIMES.cutoff + 0.01), 'oxbow');
});

test('a mouth hotspot wins once its channel has reached the sea', () => {
  const m = geo.mouths.find((q) => q.id === 'apsis');
  assert.equal(hitAt(index, m.x, m.y, 12, 1), 'apsis');
  assert.notEqual(hitAt(index, m.x, m.y, 12, m.t - 0.01), 'apsis');
});

test('braid threads answer as the braid', () => {
  const p = mid(ch('braid-2').pts);
  assert.equal(hitAt(index, p.x, p.y, 3, 1), 'braid');
});
