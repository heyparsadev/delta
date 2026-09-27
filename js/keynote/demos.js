// The demos step through their cues. A demo shows from its data-from cue until its data-until cue (or
// the end of its beat); its children with data-at switch on at their cue, and a data-type child is
// typed word by word over that cue's hold. Where a demo sits on the stage is the director's job.
import { splitText } from './captions.js';

function wrapWords(el) {
  const words = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!/\S/.test(node.nodeValue)) continue;
    const frag = document.createDocumentFragment();
    for (const part of splitText(node.nodeValue)) {
      if (!part.word) { frag.append(part.text); continue; }
      const w = Object.assign(document.createElement('span'), { className: 'w', textContent: part.text });
      frag.append(w);
      words.push(w);
    }
    node.replaceWith(frag);
  }
  return words;
}

export function prepareDemos(beats, track) {
  const list = [];
  beats.forEach((b, i) => {
    const tb = track.beats[i];
    for (const el of b.el.querySelectorAll('.demo')) {
      const at = (id, fallback) => { const c = id && track.cue(id); return c ? c.start : fallback; };
      const steps = [...el.querySelectorAll('[data-at]')].map((s) => {
        const c = track.cue(s.dataset.at);
        return { el: s, at: c.start, hold: c.hold, words: s.hasAttribute('data-type') ? wrapWords(s) : null, on: false, u: -1 };
      });
      list.push({ el, name: el.dataset.demo, beat: i, from: at(el.dataset.from, tb.start), until: at(el.dataset.until, tb.end), steps, on: false });
    }
  });
  return list;
}

export function updateDemos(list, loc, P) {
  for (const d of list) {
    const on = loc.index === d.beat && P >= d.from && P < d.until;
    if (on !== d.on) { d.el.classList.toggle('is-on', on); d.on = on; }
    if (!on) continue;
    for (const s of d.steps) {
      const sOn = P >= s.at;
      if (sOn !== s.on) { s.el.classList.toggle('is-on', sOn); s.on = sOn; }
      if (s.words) {
        const u = Math.max(0, Math.min(1, (P - s.at) / Math.max(1, s.hold))) * s.words.length;
        if (u === s.u) continue;
        s.words.forEach((w, k) => { w.style.opacity = String(Math.max(0, Math.min(1, u - k))); });
        s.u = u;
      }
    }
  }
}
