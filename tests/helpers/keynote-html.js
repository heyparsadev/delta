// Reads keynote.html the way js/keynote/beats.js reads the DOM, by plain string scanning, so the
// tests build the same track the page builds.
import { describe } from '../../js/keynote/describe.js';
import { slideKind } from '../../js/keynote/film.js';
import { htmlText, norm } from './copy.js';

export const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : undefined; };
const hasClass = (tag, cls) => new RegExp(`\\sclass="(?:[^"]*\\s)?${cls}(?:\\s[^"]*)?"`).test(tag);
const num = (v) => (v === undefined ? undefined : +v);
const CUED = /<[a-z0-9]+\s[^>]*data-cue="([^"]+)"[^>]*>/g;

function captionTokens(inner) {
  const tokens = [];
  const stack = [];
  for (const [piece] of inner.matchAll(/<[^>]+>|[^<]+/g)) {
    if (!piece.startsWith('<')) { tokens.push({ text: decode(piece) }); continue; }
    if (piece.startsWith('</')) { if (stack.pop() === 's') tokens.push({ sentence: 'end' }); continue; }
    if (/^<span\b/.test(piece) && hasClass(piece, 'cue')) {
      tokens.push({ cue: attr(piece, 'data-cue'), hold: num(attr(piece, 'data-hold')) });
      stack.push('cue');
    } else if (/^<span\b/.test(piece) && hasClass(piece, 's')) {
      tokens.push({ sentence: 'start', echo: hasClass(piece, 'echo') });
      stack.push('s');
    } else stack.push('other');
  }
  return tokens;
}

// The texts of a caption's echo sentences (the ones a slide already shows word for word).
function echoSentences(inner) {
  const out = [];
  const stack = [];
  let buf = null;
  for (const [piece] of inner.matchAll(/<[^>]+>|[^<]+/g)) {
    if (!piece.startsWith('<')) { if (buf !== null) buf += decode(piece); continue; }
    if (piece.startsWith('</')) { if (stack.pop() === 'echo') { out.push(buf); buf = null; } continue; }
    if (/^<span\b/.test(piece) && hasClass(piece, 's')) {
      const echo = hasClass(piece, 'echo');
      stack.push(echo ? 'echo' : 's');
      if (echo) buf = '';
    } else stack.push('other');
  }
  return out;
}

// The text inside the element whose opening tag starts at `at`, up to its matching close tag.
function innerText(chunk, at) {
  const re = /<(\/?)([a-z0-9]+)[^>]*?(\/?)>/g;
  re.lastIndex = at;
  let depth = 0, m, start = -1;
  while ((m = re.exec(chunk))) {
    if (m[3]) continue; // self-closing
    if (!m[1]) { if (depth++ === 0) start = re.lastIndex; } else if (--depth === 0) return decode(htmlText(chunk.slice(start, m.index))).replace(/\s+/g, ' ').trim();
  }
  return '';
}
const classesOf = (tag) => (attr(tag, 'class') || '').split(/\s+/);

export function beatsFromHtml(html) {
  const body = html.slice(html.indexOf('<main'));
  return body.split(/(?=<div class="beat")/).slice(1).map((chunk) => {
    const open = chunk.match(/^<div class="beat"[^>]*>/)[0];
    const cap = chunk.match(/<p class="caption">([\s\S]*?)<\/p>/);
    const cued = [...chunk.matchAll(CUED)].filter((m) => !hasClass(m[0], 'cue'));
    const tokens = cap
      ? captionTokens(cap[1])
      : cued.map((m) => ({ cue: m[1], hold: num(attr(m[0], 'data-hold')) }));
    return {
      id: attr(open, 'data-beat'),
      kind: attr(open, 'data-kind') || (cap ? 'caption' : 'slides'),
      tail: num(attr(open, 'data-tail')),
      ...describe(tokens, cap ? 4 : 10),
      slides: cued.map((m) => ({ cue: m[1], layout: attr(m[0], 'data-layout') || 'center', kind: slideKind(classesOf(m[0])), chars: innerText(chunk, m.index).length })),
      caption: cap ? cap[1] : null,
      echoes: cap ? echoSentences(cap[1]) : [],
      shown: norm(htmlText(cap ? chunk.replace(cap[0], ' ') : chunk)),
    };
  });
}
