// Slides: the one for the newest cue is on. Stats count up, lit names sweep and tall sheets crawl
// while their own cue holds, so scrolling back plays them in reverse.
import { easeInOut } from '../timeline.js';

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const overflow = new WeakMap();

export function prepareSlides(beat, tb) {
  const els = [...beat.el.querySelectorAll('.frame [data-cue]:not(.cue)')];
  const byCue = new Map(els.map((el) => [el.dataset.cue, el]));
  const forCue = [];
  const owner = [];
  let el = null;
  let own = -1;
  tb.cues.forEach((c, k) => {
    if (byCue.has(c.id)) { el = byCue.get(c.id); own = k; }
    forCue.push(el);
    owner.push(own);
  });
  return { tb, els, forCue, owner, on: null };
}

// How far each tall sheet has to crawl to show its last line. Call after layout changes.
export function measureSheets(list, viewH) {
  for (const s of list) {
    for (const el of s.els) {
      if (el.classList.contains('sheet')) overflow.set(el, Math.max(0, el.offsetTop + el.scrollHeight - viewH * 0.9));
    }
  }
}

// Shows the right slide and returns its layout: 'left', 'right' or 'center'.
export function updateSlides(s, loc, reduced) {
  const k = loc.cue;
  const el = k >= 0 ? s.forCue[k] : null;
  if (el !== s.on) {
    s.on?.classList.remove('is-on');
    el?.classList.add('is-on');
    s.on = el;
  }
  if (!el) return 'center';
  const c = s.tb.cues[s.owner[k]];
  const t = c.hold > 0 ? Math.min(1, Math.max(0, (loc.local - (c.start - s.tb.start)) / c.hold)) : 1;
  const p = reduced ? 1 : easeInOut(Math.min(1, t * 1.3));
  const num = el.querySelector('[data-count]');
  if (num) num.textContent = fmt(+num.dataset.count * p);
  const lit = el.querySelector('.lit');
  if (lit) lit.style.setProperty('--sweep', p.toFixed(3));
  const o = overflow.get(el);
  if (o) el.style.setProperty('--crawl', `${(-o * t).toFixed(1)}px`);
  return el.dataset.layout || 'center';
}
