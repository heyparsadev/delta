// Captions: every word gets its own span (the text itself is unchanged), then the words light up in
// order as the keynote position moves, one sentence at a time.
import { sentenceAt } from './describe.js';

// One text node → its words and the spaces between them, every character kept. Pure, for the tests;
// the word rule is the same as countWords() in describe.js.
export function splitText(text) {
  return text.split(/(\s+)/).filter(Boolean).map((part) => ({ text: part, word: !/^\s+$/.test(part) }));
}

export function prepareCaption(p) {
  const words = [];
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!/\S/.test(node.nodeValue)) continue;
    const frag = document.createDocumentFragment();
    for (const part of splitText(node.nodeValue)) {
      if (!part.word) { frag.append(part.text); continue; }
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = part.text;
      frag.append(w);
      words.push(w);
    }
    node.replaceWith(frag);
  }
  return { el: p, words, sentenceEls: [...p.querySelectorAll('.s')], shown: -1, lit: 0 };
}

// u: words revealed, fractional. desc: the beat's { sentences }. With `whole`, the current sentence
// appears at once (reduced motion).
export function revealCaption(cap, desc, u, { whole = false } = {}) {
  const si = sentenceAt(desc.sentences, u);
  if (si !== cap.shown) {
    if (cap.shown >= 0) cap.sentenceEls[cap.shown].classList.remove('is-on');
    if (si >= 0 && !desc.sentences[si].echo) cap.sentenceEls[si].classList.add('is-on');
    cap.shown = si;
  }
  const upto = whole && si >= 0 ? desc.sentences[si].end : u;
  const lo = Math.max(0, Math.floor(Math.min(cap.lit, upto)) - 1);
  const hi = Math.min(cap.words.length, Math.ceil(Math.max(cap.lit, upto)) + 1);
  for (let i = lo; i < hi; i++) cap.words[i].style.opacity = String(Math.max(0, Math.min(1, upto - i)));
  cap.lit = upto;
}
