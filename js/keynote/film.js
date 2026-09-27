// The Watch film: the keynote laid out in seconds. Captions are hidden while it plays, so the words
// between cues run quickly, and each cue holds as long as its slide takes to read. Pure module.
import { easeInOut } from '../timeline.js';

const HOLD = { title: 1.9, sheet: 3, stage: 1.1, heading: 1.25, line: 0.75, long: 0.85, stat: 0.68,
  qa: 1.3, ask: 1.2, answer: 1.5, belief: 1.7, omt: 2.4, intro: 1.6, cue: 0.55 };
const PER_CHAR = { sheet: 0.004 };

// A slide's kind, from its classes. The page and the tests both use this.
export function slideKind(classes) {
  const has = (c) => classes.includes(c);
  if (has('sheet')) return 'sheet';
  for (const k of ['title', 'stat', 'qa', 'stage', 'ask', 'answer', 'belief', 'omt', 'intro']) if (has(k)) return k;
  if (has('heading') || has('heading-block')) return 'heading';
  if (has('line')) return has('long') ? 'long' : 'line';
  return 'cue';
}

// Seconds a cue holds, by the kind of slide it shows and how long its text is.
export function holdFor({ kind = 'cue', chars = 0 }) {
  return Math.min((HOLD[kind] ?? HOLD.cue) + chars * (PER_CHAR[kind] ?? 0.011), kind === 'sheet' ? 5.5 : 3.2);
}
const runFor = (words) => (words > 0 ? 0.1 + words * 0.006 : 0);

export function buildFilm(track, metaOf) {
  const segs = [];
  let t = 0, p = 0;
  const add = (p1, dur, hold) => {
    if (dur <= 0) return;
    segs.push({ t0: t, t1: t + dur, p0: p, p1, hold });
    t += dur;
    p = p1;
  };
  for (const b of track.beats) {
    for (const c of b.cues) {
      add(c.start, runFor(c.start - p), false);
      add(c.end, holdFor(metaOf(c.id)), true);
    }
  }
  add(track.length, runFor(track.length - p), false);
  return { segs, length: t };
}

// Holds move through their words at an even pace (a stat counts, a sheet crawls); runs ease.
export function filmAt(film, t) {
  if (t <= 0) return film.segs[0]?.p0 ?? 0;
  const s = film.segs.find((x) => t < x.t1) ?? film.segs[film.segs.length - 1];
  const u = Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0)));
  return s.p0 + (s.p1 - s.p0) * (s.hold ? u : easeInOut(u));
}

export function timeAt(film, P) {
  const s = film.segs.find((x) => P < x.p1) ?? film.segs[film.segs.length - 1];
  if (!s) return 0;
  const target = Math.min(1, Math.max(0, (P - s.p0) / Math.max(1e-9, s.p1 - s.p0)));
  let u = target;
  if (!s.hold) { // invert the easing by bisection
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) { u = (lo + hi) / 2; if (easeInOut(u) < target) lo = u; else hi = u; }
  }
  return s.t0 + u * (s.t1 - s.t0);
}
