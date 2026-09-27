import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDelta, makeCoast, pointAt, indexAt, channelById, grownLines, WORLD } from '../js/delta.js';
import { SEED, TIMES, PROJECTS, STATIONS } from '../js/story.js';

const geo = buildDelta(SEED);
const coast = makeCoast(SEED);
const ch = (id) => channelById(geo, id);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('geometry is deterministic for the seed', () => {
  assert.equal(JSON.stringify(buildDelta(SEED)), JSON.stringify(geo));
});

test('every story channel exists', () => {
  const ids = geo.channels.map((c) => c.id);
  for (const id of ['iranspoti', 'sibkade', 'helpfinity', 'mindmirror', 'barayand',
    'braid-0', 'braid-1', 'braid-2', 'braid-3', 'braid-4', ...PROJECTS.map((p) => p.id)]) {
    assert.ok(ids.includes(id), id);
  }
});

test('samples are ordered in time, have width, stay in the world', () => {
  for (const c of geo.channels) {
    assert.ok(c.pts.length > 8, `${c.id} has samples`);
    for (let i = 0; i < c.pts.length; i++) {
      const p = c.pts[i];
      assert.ok(p.w > 0, `${c.id} width`);
      assert.ok(p.x > WORLD.x0 && p.x < WORLD.x1 && p.y > WORLD.y0 && p.y < WORLD.y1, `${c.id} bounds`);
      if (i) assert.ok(p.t >= c.pts[i - 1].t, `${c.id} time order at ${i}`);
    }
  }
});

test('IranSpoti flows into Sibkade at the cutoff', () => {
  const a = ch('iranspoti').pts.at(-1), b = ch('sibkade').pts[0];
  assert.ok(dist(a, b) < 1e-6);
  assert.equal(a.t, TIMES.cutoff);
  assert.equal(b.t, TIMES.stem[0]);
  assert.ok(Math.abs(ch('sibkade').pts.at(-1).t - TIMES.stem[1]) < 1e-9);
});

test('the oxbow neck is narrow but open', () => {
  const { i, j } = ch('iranspoti').cut;
  const pts = ch('iranspoti').pts;
  const neck = dist(pts[i], pts[j]);
  assert.ok(neck > 3 && neck < 30, `neck ${neck.toFixed(1)}`);
  assert.ok(j - i > 30, 'loop is long');
  assert.equal(geo.oxbow.pts.length, j - i + 1);
});

test('the braid splits from and rejoins the Barayand centerline', () => {
  const b = ch('barayand');
  const [i0, i1] = b.skip;
  for (let k = 0; k < 5; k++) {
    const th = ch(`braid-${k}`).pts;
    assert.ok(dist(th[0], b.pts[i0]) < 1.5, `thread ${k} split`);
    assert.ok(dist(th.at(-1), b.pts[i1]) < 1.5, `thread ${k} rejoin`);
    assert.ok(Math.abs(th[0].t - TIMES.braid[0]) < 0.01 && Math.abs(th.at(-1).t - TIMES.braid[1]) < 0.01);
  }
});

test('HelpFinity dries, Mind Mirror refills', () => {
  assert.ok(Math.abs(ch('helpfinity').pts.at(-1).t - TIMES.helpfinityEnd) < 1e-9);
  assert.equal(ch('helpfinity').dryAt, TIMES.helpfinityEnd);
  const mm = ch('mindmirror').pts;
  assert.ok(Math.abs(mm[0].t - TIMES.coda[0]) < 1e-9 && Math.abs(mm.at(-1).t - TIMES.coda[1]) < 1e-9);
});

test('project mouths sit on the coast', () => {
  for (const p of PROJECTS) {
    const m = geo.mouths.find((x) => x.id === p.id);
    assert.ok(m, p.id);
    assert.ok(Math.abs(m.y - coast(m.x)) < 8, `${p.id} mouth off the coast`);
  }
});

test('stations lie on the main stem', () => {
  const stem = ch('sibkade').pts;
  for (const s of STATIONS) {
    const g = geo.stations.find((x) => x.id === s.id);
    assert.ok(dist(g, pointAt(stem, s.t)) < 1e-6, s.id);
  }
});

test('branches keep clear of the main stem', () => {
  const stem = ch('sibkade').pts;
  for (const id of ['helpfinity', 'barayand']) {
    const pts = ch(id).pts;
    for (let i = 0; i < pts.length; i++) {
      if (dist(pts[i], pts[0]) < 60) continue;
      let best = Infinity;
      for (const s of stem) best = Math.min(best, dist(pts[i], s));
      assert.ok(best > 18, `${id} sample ${i} is ${best.toFixed(1)} from the stem`);
    }
  }
});

test('pointAt and indexAt', () => {
  const pts = [{ x: 0, y: 0, t: 0, w: 1 }, { x: 10, y: 0, t: 1, w: 3 }];
  assert.equal(indexAt(pts, -1), -1);
  assert.equal(indexAt(pts, 0.5), 0);
  assert.equal(indexAt(pts, 2), 1);
  const p = pointAt(pts, 0.25);
  assert.equal(p.x, 2.5);
  assert.equal(p.w, 1.5);
});

test('grownLines: nothing before the start, a front while growing, none when complete', () => {
  const b = ch('barayand');
  assert.deepEqual(grownLines(b, TIMES.barayand - 0.01), { lines: [], front: null });
  const growing = grownLines(b, TIMES.barayand + 0.01);
  assert.ok(growing.front && growing.lines.length === 1);
  assert.equal(grownLines(ch('sibkade'), 1).front, null);
});

test('grownLines: after the cutoff the neck joins the ends of the loop', () => {
  const ir = ch('iranspoti');
  const g = grownLines(ir, 0.2);
  assert.equal(g.front, null);
  assert.equal(g.lines.length, 1);
  assert.equal(g.lines[0].length, ir.pts.length - (ir.cut.j - ir.cut.i - 1));
  assert.equal(grownLines(ir, TIMES.cutoff - 0.001).lines[0].length > g.lines[0].length, true);
});

test('grownLines: the centreline pauses inside the braid and resumes after it', () => {
  const b = ch('barayand');
  const inside = grownLines(b, (TIMES.braid[0] + TIMES.braid[1]) / 2);
  assert.equal(inside.front, null);
  assert.equal(inside.lines.length, 1);
  assert.equal(grownLines(b, 0.85).lines.length, 2);
});
