import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, countWords, sentenceAt } from '../js/keynote/describe.js';
import { buildTrack, locate, toScroll, fromScroll } from '../js/keynote/track.js';

test('countWords counts runs of non-space characters', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords('   '), 0);
  assert.equal(countWords('one two  three'), 3);
  assert.equal(countWords(': 300 questions'), 3);
});

test('describe places cues before the next word and closes sentences', () => {
  const d = describe([
    { cue: 'a', hold: 6 },
    { sentence: 'start' }, { text: 'It never became ' }, { cue: 'b' }, { text: 'a company.' }, { sentence: 'end' },
    { text: ' ' },
    { sentence: 'start', echo: true }, { text: 'It became the plan for one.' }, { sentence: 'end' },
  ]);
  assert.equal(d.words, 11);
  assert.deepEqual(d.cues, [{ id: 'a', at: 0, hold: 6 }, { id: 'b', at: 3, hold: 4 }]);
  assert.deepEqual(d.sentences, [{ start: 0, end: 5, echo: false }, { start: 5, end: 11, echo: true }]);
});

test('sentenceAt keeps a finished sentence up until the next one begins', () => {
  const s = [{ start: 0, end: 5 }, { start: 5, end: 11 }];
  assert.equal(sentenceAt(s, 0), -1);
  assert.equal(sentenceAt(s, 0.2), 0);
  assert.equal(sentenceAt(s, 5), 0);
  assert.equal(sentenceAt(s, 5.01), 1);
  assert.equal(sentenceAt(s, 11), 1);
  assert.equal(sentenceAt([], 3), -1);
});

const BEATS = [
  { id: 'a', words: 10, cues: [{ id: 'a0', at: 0, hold: 4 }, { id: 'a1', at: 6, hold: 2 }], tail: 3 },
  { id: 'b', words: 0, cues: [{ id: 'b0', at: 0, hold: 5 }, { id: 'b1', at: 0, hold: 5 }], tail: 0 },
];

test('buildTrack lays beats end to end, holds included', () => {
  const t = buildTrack(BEATS);
  assert.equal(t.length, 29);
  assert.deepEqual(t.beats.map((b) => [b.start, b.length]), [[0, 19], [19, 10]]);
  assert.deepEqual([t.cue('a1').start, t.cue('a1').end], [10, 12]);
  assert.deepEqual([t.cue('b0').start, t.cue('b1').start, t.cue('b1').end], [19, 24, 29]);
  assert.equal(t.cue('nope'), undefined);
});

test('buildTrack refuses duplicate cues', () => {
  const dup = [{ id: 'x', words: 2, cues: [{ id: 'c', at: 0, hold: 1 }, { id: 'c', at: 1, hold: 1 }] }];
  assert.throws(() => buildTrack(dup), /duplicate cue "c"/);
});

test('locate pauses the words during holds and walks them between cues', () => {
  const t = buildTrack(BEATS);
  const at = (P) => { const r = locate(t, P); return [r.index, r.cue, +r.cueP.toFixed(3), +r.u.toFixed(3)]; };
  assert.deepEqual(at(0), [0, 0, 0, 0]);
  assert.deepEqual(at(2), [0, 0, 0.5, 0]);
  assert.deepEqual(at(7), [0, 0, 1, 3]);
  assert.deepEqual(at(10), [0, 1, 0, 6]);
  assert.deepEqual(at(12.5), [0, 1, 1, 6.5]);
  assert.deepEqual(at(17), [0, 1, 1, 10]);
  assert.deepEqual(at(19), [1, 0, 0, 0]);
  assert.deepEqual(at(25), [1, 1, 0.2, 0]);
  assert.deepEqual(at(99), [1, 1, 1, 0]);
  assert.deepEqual(at(-5), [0, 0, 0, 0]);
});

test('scroll and position convert both ways', () => {
  assert.equal(toScroll(10, 100, 4), 140);
  assert.equal(fromScroll(140, 100, 4, 29), 10);
  assert.equal(fromScroll(0, 100, 4, 29), 0);
  assert.equal(fromScroll(99999, 100, 4, 29), 29);
});
