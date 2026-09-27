import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, SCORE, resolveScore, stateAt, snapAt } from '../js/keynote/score.js';
import { buildTrack } from '../js/keynote/track.js';
import { read } from './helpers/copy.js';
import { beatsFromHtml } from './helpers/keynote-html.js';

const TOY = buildTrack([{ id: 'a', words: 20, cues: [{ id: 'x', at: 0, hold: 4 }, { id: 'y', at: 10, hold: 4 }], tail: 0 }]);

test('stateAt holds each state, then eases into the next over its lead', () => {
  const frames = resolveScore([{ at: 'x', lightI: 1 }, { at: 'y', lightI: 3, lead: 4 }], TOY, { lightI: 0 });
  assert.equal(stateAt(frames, 0).lightI, 1);
  assert.equal(stateAt(frames, 10).lightI, 1);
  assert.equal(stateAt(frames, 12).lightI, 2);
  assert.equal(stateAt(frames, 14).lightI, 3);
  assert.equal(stateAt(frames, 99).lightI, 3);
});

test('snapAt changes only when a keyframe lands (reduced motion)', () => {
  const frames = resolveScore([{ at: 'x', lightI: 1 }, { at: 'y', lightI: 3, lead: 4 }], TOY, { lightI: 0 });
  assert.equal(snapAt(frames, 0).lightI, 1);
  assert.equal(snapAt(frames, 13.9).lightI, 1);
  assert.equal(snapAt(frames, 14).lightI, 3);
});

test('">" cues the end of a hold, and offset shifts a keyframe', () => {
  const frames = resolveScore([{ at: 'x>', lightI: 1, lead: 0 }, { at: 'y', offset: 2, lightI: 2, lead: 0 }], TOY, { lightI: 0 });
  assert.equal(frames[1].p, 4);
  assert.equal(frames[2].p, 16);
});

test('the score refuses unknown cues, unknown fields and keyframes out of order', () => {
  assert.throws(() => resolveScore([{ at: 'nope', lightI: 1 }], TOY, { lightI: 0 }), /unknown cue "nope"/);
  assert.throws(() => resolveScore([{ at: 'x', glow: 1 }], TOY, { lightI: 0 }), /unknown field "glow"/);
  assert.throws(() => resolveScore([{ at: 'y', lightI: 1 }, { at: 'x', lightI: 2 }], TOY, { lightI: 0 }), /comes before/);
});

const track = buildTrack(beatsFromHtml(read('keynote.html')));

test('the keynote score resolves against the page', () => {
  assert.doesNotThrow(() => resolveScore(SCORE, track));
});

test('no cuts: sampled densely, no field of the object ever jumps', () => {
  const frames = resolveScore(SCORE, track);
  const keys = Object.keys(BASE);
  let prev = stateAt(frames, 0);
  const lo = { ...prev }, hi = { ...prev };
  const step = Object.fromEntries(keys.map((k) => [k, 0]));
  for (let P = 0.25; P <= track.length; P += 0.25) {
    const s = stateAt(frames, P);
    for (const k of keys) {
      lo[k] = Math.min(lo[k], s[k]);
      hi[k] = Math.max(hi[k], s[k]);
      step[k] = Math.max(step[k], Math.abs(s[k] - prev[k]));
    }
    prev = s;
  }
  // A move that takes fewer than about two words reads as a cut.
  const jumps = keys.filter((k) => hi[k] > lo[k] && step[k] > 0.35 * (hi[k] - lo[k]));
  assert.deepEqual(jumps.map((k) => `${k}: step ${step[k].toFixed(3)} of range ${(hi[k] - lo[k]).toFixed(3)}`), []);
});

test('the number of copies changes only while they lie on top of each other', () => {
  const frames = resolveScore(SCORE, track);
  for (let P = 0; P <= track.length; P += 0.25) {
    const s = stateAt(frames, P);
    if (Math.abs(s.rep - Math.round(s.rep)) > 1e-6) assert.ok(s.repGap < 1e-6, `P ${P}: rep ${s.rep} with gap ${s.repGap}`);
  }
});
