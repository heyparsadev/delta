// The keynote as one line of positions, measured in words. Pure module.
// A beat is { id, words, cues: [{ id, at, hold }], tail }: its caption has `words` words, each cue
// sits before word `at` and holds for `hold` words, and `tail` words of rest follow the end.
import { clamp } from '../timeline.js';

export const TAIL = 3;
export const WORDS_PER_VIEWPORT = 25;

export function buildTrack(beats) {
  const out = [];
  const byCue = new Map();
  let start = 0;
  beats.forEach((b, index) => {
    const sorted = b.cues.map((c, i) => ({ ...c, i })).sort((a, c) => a.at - c.at || a.i - c.i);
    let held = 0;
    const cues = sorted.map((c) => {
      const s = start + c.at + held;
      held += c.hold;
      if (byCue.has(c.id)) throw new Error(`duplicate cue "${c.id}"`);
      const r = { id: c.id, at: c.at, hold: c.hold, start: s, end: s + c.hold, beat: index };
      byCue.set(c.id, r);
      return r;
    });
    const tail = b.tail ?? TAIL;
    const length = b.words + held + tail;
    out.push({ id: b.id, index, start, length, end: start + length, words: b.words, cues, tail });
    start += length;
  });
  return { beats: out, length: start, cue: (id) => byCue.get(id) };
}

// Where position P falls: the beat, the words revealed (u, fractional) and the newest cue reached,
// with the progress through its hold (cueP; 1 once the hold is over).
export function locate(track, P) {
  const { beats } = track;
  const p = clamp(P, 0, track.length);
  let i = beats.findIndex((b) => p < b.end);
  if (i < 0) i = beats.length - 1;
  const beat = beats[i];
  const local = p - beat.start;
  let pos = 0, w = 0, cue = -1, cueP = 0;
  for (let k = 0; k < beat.cues.length; k++) {
    const c = beat.cues[k];
    const run = c.at - w;
    if (local < pos + run) return { index: i, beat, local, u: w + (local - pos), cue, cueP };
    pos += run;
    w = c.at;
    cue = k;
    if (local < pos + c.hold) return { index: i, beat, local, u: w, cue, cueP: (local - pos) / c.hold };
    pos += c.hold;
    cueP = 1;
  }
  return { index: i, beat, local, u: Math.min(beat.words, w + (local - pos)), cue, cueP };
}

export const toScroll = (P, top0, px) => top0 + P * px;
export const fromScroll = (y, top0, px, length) => clamp((y - top0) / px, 0, length);
