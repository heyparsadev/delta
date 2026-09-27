import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdFor, buildFilm, filmAt, timeAt, slideKind } from '../js/keynote/film.js';
import { buildTrack } from '../js/keynote/track.js';
import { read } from './helpers/copy.js';
import { beatsFromHtml } from './helpers/keynote-html.js';

const beats = beatsFromHtml(read('keynote.html'));
const track = buildTrack(beats);
const slides = new Map(beats.flatMap((b) => b.slides.map((s) => [s.cue, s])));
const metaOf = (id) => slides.get(id) ?? { kind: 'cue', chars: 0 };
const film = buildFilm(track, metaOf);

test('slide kinds come from their classes', () => {
  assert.equal(slideKind(['slide', 'title']), 'title');
  assert.equal(slideKind(['slide', 'line', 'long']), 'long');
  assert.equal(slideKind(['slide', 'line']), 'line');
  assert.equal(slideKind(['sheet', 'specs']), 'sheet');
  assert.equal(slideKind(['slide', 'heading-block']), 'heading');
  assert.equal(slideKind(['slide', 'stage', 'greeting']), 'stage');
  assert.ok(beats.flatMap((b) => b.slides).every((s) => s.kind !== 'cue' && s.chars > 0), 'every slide has a kind and text');
});

test('titles hold longest, stats shortest, and a longer line holds longer', () => {
  assert.ok(holdFor({ kind: 'title', chars: 40 }) > holdFor({ kind: 'line', chars: 40 }));
  assert.ok(holdFor({ kind: 'stat', chars: 20 }) < holdFor({ kind: 'line', chars: 20 }));
  assert.ok(holdFor({ kind: 'line', chars: 60 }) > holdFor({ kind: 'line', chars: 10 }));
});

test('every cue is scheduled once, in order', () => {
  const cues = track.beats.flatMap((b) => b.cues);
  const holds = film.segs.filter((s) => s.hold);
  assert.equal(holds.length, cues.length);
  holds.forEach((s, i) => { assert.equal(s.p0, cues[i].start); assert.equal(s.p1, cues[i].end); });
});

test('the film runs about three minutes and ends on the last word', () => {
  assert.ok(film.length >= 150 && film.length <= 210, `${film.length.toFixed(0)} s`);
  assert.equal(filmAt(film, film.length), track.length);
  assert.equal(filmAt(film, 0), 0);
});

test('the film never runs backwards, and time and position agree', () => {
  let prev = 0;
  for (let t = 0; t <= film.length; t += 0.05) {
    const P = filmAt(film, t);
    assert.ok(P >= prev - 1e-9);
    prev = P;
  }
  for (const P of [0, 12.5, 400, 1287, 2000, track.length]) assert.ok(Math.abs(filmAt(film, timeAt(film, P)) - P) < 0.05, `P ${P}`);
});
