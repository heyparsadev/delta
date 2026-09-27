// Reads the beats from the page with the same token rules as tests/helpers/keynote-html.js, and sizes
// them so the scroll length follows the words.
import { describe } from './describe.js';

const CAPTION_HOLD = 4;
const SLIDE_HOLD = 10;
const num = (v) => (v === undefined ? undefined : +v);

function captionTokens(p) {
  const tokens = [];
  (function walk(node) {
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) tokens.push({ text: n.nodeValue });
      else if (n.nodeType === Node.ELEMENT_NODE) {
        if (n.classList.contains('cue')) tokens.push({ cue: n.dataset.cue, hold: num(n.dataset.hold) });
        else if (n.classList.contains('s')) {
          tokens.push({ sentence: 'start', echo: n.classList.contains('echo') });
          walk(n);
          tokens.push({ sentence: 'end' });
        } else walk(n);
      }
    }
  })(p);
  return tokens;
}

export function readBeats(root = document) {
  return [...root.querySelectorAll('.beat')].map((el) => {
    const caption = el.querySelector('.caption');
    const tokens = caption
      ? captionTokens(caption)
      : [...el.querySelectorAll('.frame [data-cue]')].map((n) => ({ cue: n.dataset.cue, hold: num(n.dataset.hold) }));
    return {
      el, id: el.dataset.beat, frame: el.querySelector('.frame'), caption,
      kind: el.dataset.kind || (caption ? 'caption' : 'slides'),
      tail: num(el.dataset.tail),
      ...describe(tokens, caption ? CAPTION_HOLD : SLIDE_HOLD),
    };
  });
}

export function sizeBeats(beats, track, px) {
  beats.forEach((b, i) => { b.el.style.height = `${(track.beats[i].length * px).toFixed(2)}px`; });
}
