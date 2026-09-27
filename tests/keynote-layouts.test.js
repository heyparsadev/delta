import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundRect, stroke, sketchCard, cardDraft, blueprint, gridLines, measure, pointAt } from '../js/keynote/layouts.js';
import { buildStrips, STRIP_FLOATS } from '../js/keynote/lines.js';
import { buildPoints, POINT_FLOATS } from '../js/keynote/points.js';

const close = (a, b, eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);
const sdRoundRect = ([x, y], w, h, r) => {
  const qx = Math.abs(x) - w + r, qy = Math.abs(y) - h + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
};

test('roundRect traces the card outline and closes on itself', () => {
  const pts = roundRect(1.7, 1.07, 0.13, 8);
  for (const p of pts) assert.ok(Math.abs(sdRoundRect(p, 1.7, 1.07, 0.13)) < 1e-9);
  assert.ok(close(pts[0], pts[pts.length - 1]));
  assert.ok(Math.abs(Math.max(...pts.map((p) => p[0])) - 1.7) < 1e-9);
  assert.ok(Math.abs(Math.min(...pts.map((p) => p[1])) + 1.07) < 1e-9);
});

test('measure and pointAt walk the drawing from its first point to its last', () => {
  const g = measure([stroke(0, 0, 2, 0, { n: 4 }), stroke(0, 1, 0, 3, { n: 2 })]);
  assert.equal(g.total, 4);
  assert.ok(close(pointAt(g, 0), [0, 0, 0]));
  assert.ok(close(pointAt(g, 0.25), [1, 0, 0]));
  assert.ok(close(pointAt(g, 0.75), [0, 2, 0]));
  assert.ok(close(pointAt(g, 1), [0, 3, 0]));
  assert.ok(close(pointAt(g, 7), [0, 3, 0]));
});

test('the sketch is the same on every visit', () => {
  assert.deepEqual(sketchCard(1.7, 1.07), sketchCard(1.7, 1.07));
  assert.notDeepEqual(sketchCard(1.7, 1.07, 1), sketchCard(1.7, 1.07, 2));
});

test('the draft follows the card outline; the blueprint and grid have their parts', () => {
  assert.equal(cardDraft(1.7, 1.07, 0.13)[0].length, roundRect(1.7, 1.07, 0.13, 10).length);
  assert.equal(blueprint(1.7, 1.07, 0.13).length, 14);
  assert.equal(gridLines(1, 0.5).length, 10);
});

test('buildStrips makes two vertices per point and two triangles per segment', () => {
  const g = measure([stroke(0, 0, 1, 0, { n: 3 }), stroke(0, 1, 1, 1, { n: 1 })]);
  const { verts, idx } = buildStrips(g);
  assert.equal(verts.length, (4 + 2) * 2 * STRIP_FLOATS);
  assert.equal(idx.length, (3 + 1) * 6);
  assert.equal(verts[10], 0);
  assert.equal(verts[(verts.length / STRIP_FLOATS - 1) * STRIP_FLOATS + 10], 1);
});

test('buildStrips carries each line’s colour on its vertices, white by default', () => {
  const g = { ...measure([stroke(0, 0, 1, 0, { n: 1 }), stroke(0, 1, 1, 1, { n: 1 })]), colors: [[1, 0, 0]] };
  const { verts } = buildStrips(g);
  assert.equal(STRIP_FLOATS, 14);
  assert.deepEqual([...verts.slice(11, 14)], [1, 0, 0]);
  assert.deepEqual([...verts.slice(4 * 14 + 11, 4 * 14 + 14)], [1, 1, 1]);
});

test('a parallel measure reveals every line from its own start', () => {
  const g = measure([stroke(0, 0, 2, 0, { n: 2 }), stroke(0, 1, 0, 2, { n: 1 })], { parallel: true });
  const { verts } = buildStrips(g);
  const along = (v) => verts[v * STRIP_FLOATS + 10];
  assert.deepEqual([along(0), along(2), along(4), along(6), along(8)], [0, 0.5, 1, 0, 1]);
});

test('buildPoints packs position, start, size, colour and reveal order', () => {
  const buf = buildPoints({ pts: [[1, 2, 3], [4, 5, 6]], from: [[0, 0, 0], [1, 1, 1]], size: [0.1, 0.2], colors: [[1, 0, 0]], order: [0.5, 0.25] });
  assert.equal(POINT_FLOATS, 11);
  assert.equal(buf.length, 22);
  assert.deepEqual([...buf.slice(0, 11)].map((x) => +x.toFixed(3)), [1, 2, 3, 0, 0, 0, 0.1, 1, 0, 0, 0.5]);
  assert.deepEqual([...buf.slice(11, 22)].map((x) => +x.toFixed(3)), [4, 5, 6, 1, 1, 1, 0.2, 1, 1, 1, 0.25]);
});

test('buildPoints defaults: from = pts, one size for all, white, in index order', () => {
  const buf = buildPoints({ pts: [[1, 0, 0], [2, 0, 0]], size: 0.05 });
  assert.deepEqual([...buf.slice(3, 6)], [1, 0, 0]);
  assert.equal(+buf[6].toFixed(3), 0.05);
  assert.equal(buf[10], 0);
  assert.equal(buf[21], 0.5);
});

import { FIVE, SIX, SIX_X, ring, onRing, arrows, beams, PRISM_R, confluence, radar, fanCentres, chainPoint,
  savesAt, sheetText, SHEET, treeOfLife, grid300, raceAt, RACE_ROW, field1000, orbitAt, edgeMarks, waitPass } from '../js/keynote/layouts.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test('palettes: five model colours, six Playground lights, one row', () => {
  assert.equal(FIVE.length, 5);
  assert.equal(SIX.length, 6);
  assert.deepEqual(SIX[3], [1, 1, 1]);
  assert.equal(SIX_X.length, 6);
});

test('ring closes at the top and keeps its radius', () => {
  const r = ring(1.5, 48);
  assert.equal(r.length, 49);
  assert.ok(near(r[0][0], 0) && near(r[0][1], 1.5));
  assert.ok(r.every((p) => near(Math.hypot(p[0], p[1]), 1.5)));
  assert.ok(near(r[48][0], r[0][0]) && near(r[48][1], r[0][1]));
  assert.equal(onRing(1, 50).length, 50);
});

test('arrows add tip to tail', () => {
  const v = [[1, 0], [0, 1], [-0.5, 0.5]];
  const a = arrows(v, [0, 0]);
  assert.equal(a.lines.length, 6);
  const lastShaft = a.lines[4];
  assert.ok(near(lastShaft[lastShaft.length - 1][0], 0.5) && near(lastShaft[lastShaft.length - 1][1], 1.5));
  assert.deepEqual(a.colors[0], FIVE[0]);
  assert.deepEqual(arrows([[1, 1]], [0, 0]).colors[0], [1, 1, 1]);
});

test('beams: white enters the left face, five leave the right face, apart only with spread', () => {
  const k = Math.sqrt(3);
  const A = [-PRISM_R, -PRISM_R / k], B = [PRISM_R, -PRISM_R / k], C = [0, (2 * PRISM_R) / k];
  const onLine = (p, a, b) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / dist2(a, b);
  const b0 = beams({ spread: 0, jitter: 0, wave: 0, time: 0 });
  assert.ok(onLine(b0.hit, A, C) < 1e-6, 'hits the left face');
  assert.ok(onLine(b0.exit, B, C) < 1e-6, 'leaves through the right face');
  const e = b0.entry[b0.entry.length - 1];
  assert.ok(near(e[0], b0.exit[0]) && near(e[1], b0.exit[1]));
  assert.equal(b0.out.length, 5);
  for (const line of b0.out) assert.deepEqual(line, b0.out[0]);
  const b1 = beams({ spread: 1, jitter: 0, wave: 0, time: 0 });
  const ang = b1.out.map((l) => Math.atan2(l[23][1] - l[0][1], l[23][0] - l[0][0]));
  for (let i = 1; i < 5; i++) assert.ok(ang[i] < ang[i - 1], 'each colour bends more than the last');
  assert.ok(b1.out.every((l) => near(l[0][0], b1.exit[0]) && near(l[0][1], b1.exit[1])));
});

test('confluence: five meet at the origin, one leaves', () => {
  const c = confluence({});
  assert.equal(c.inward.length, 5);
  assert.ok(c.inward.every((l) => near(l[l.length - 1][0], 0) && near(l[l.length - 1][1], 0)));
  assert.ok(near(c.outward[0][0], 0) && c.outward[c.outward.length - 1][0] > 0);
});

test('radar: ten axes, two webs and a profile', () => {
  const r = radar({});
  assert.equal(r.axes.length, 10);
  assert.equal(r.web.length, 2);
  assert.equal(r.profile.length, 11);
});

test('the fan opens symmetrically from one card', () => {
  const shut = fanCentres({ fan: 0 });
  assert.ok(shut.every((c) => c.every((v) => near(v, 0))));
  const open = fanCentres({ fan: 1 });
  assert.equal(open.length, 7);
  for (let i = 0; i < 7; i++) assert.ok(near(open[i][0], -open[6 - i][0]) && near(open[i][1], open[6 - i][1]));
  assert.ok(near(open[3][0], 0) && near(open[3][1], 0));
  const start = chainPoint({ fan: 1 }, 0), end = chainPoint({ fan: 1 }, 1);
  assert.ok(near(start[0], open[0][0]) && near(end[0], open[6][0]));
});

test('saves fall into the light, and one comes back', () => {
  const up = savesAt(0, 0), down = savesAt(1, 0), back = savesAt(1, 1);
  assert.equal(up.length, 5);
  assert.ok(up.every((s) => s.o > 0.99 && s.p[1] > 1));
  assert.ok(down.every((s) => s.o < 0.01));
  assert.ok(back[3].o > 0.99 && back.filter((s, i) => i !== 3).every((s) => s.o < 0.01));
});

test('the sheets write line by line on both sheets', () => {
  const lines = sheetText(SHEET);
  assert.equal(lines.length, 22);
  assert.ok(lines[0][0][0] < 0 && lines[1][0][0] > 0, 'alternating sheets');
});

test('the tree of life: 256 tips, ours at the origin, one lineage up to the root', () => {
  const t = treeOfLife({});
  assert.equal(t.tips.length, 256);
  assert.ok(t.tips[t.ours].every((v) => Math.abs(v) < 1e-9));
  const end = t.lineage[t.lineage.length - 1];
  assert.ok(near(end[0], t.root[0]) && near(end[1], t.root[1]));
  assert.ok(t.root[1] > 2, 'the root is above the tips');
  assert.equal(t.branches.length, 502);
  assert.deepEqual(treeOfLife({}), t);
});

test('the benchmark grid has 300 points in 10 rows, lit row by row', () => {
  const g = grid300({});
  assert.equal(g.pts.length, 300);
  assert.equal(new Set(g.pts.map((p) => p[1].toFixed(6))).size, 10);
  for (let i = 1; i < 300; i++) assert.ok(g.order[i] > g.order[i - 1]);
  const a = raceAt(0, {}), b = raceAt(1, {});
  assert.ok(a.small[0] < a.big[0] && b.small[0] > b.big[0]);
  assert.ok(near(a.small[1], g.pts[RACE_ROW * 30][1]));
});

test('the field has a thousand points and a place for the light', () => {
  const f = field1000({});
  assert.equal(f.pts.length, 1000);
  assert.ok(f.slot >= 0 && f.slot < 1000);
  assert.ok(f.pts.every((p) => { const r = Math.hypot(...p); return r > 3.4 * 0.85 && r < 3.4 * 1.15; }));
  assert.deepEqual(field1000({}), f);
  assert.equal(new Set(f.order).size, 1000);
});

test('orbits, marks and the waiting light', () => {
  assert.equal(orbitAt(0, {}).length, 7);
  const m = edgeMarks({ w: 0.5, h: 1 });
  assert.equal(m.pts.length, 36);
  assert.equal(m.from.length, 36);
  const edge = waitPass(0.5, { d: 1.2 }), inside = waitPass(1, { d: 1.2 });
  assert.ok(near(edge[2], 1.2) && inside.every((v) => near(v, 0)));
});
