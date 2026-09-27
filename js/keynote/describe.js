// A beat's caption as data: how many words it has, where its cues sit and where each sentence
// starts and ends. Pure module; the page (beats.js) and the tests feed it the same tokens.
//
// Tokens, in document order:
//   { text }                      a text node
//   { cue, hold }                 a cue marker (hold in words)
//   { sentence: 'start', echo }   a sentence opens
//   { sentence: 'end' }           it closes
//
// A word is a run of non-space characters inside one text node. The page wraps words by the same
// rule, so cue positions agree between the tests and the browser.

export const countWords = (s) => (s.match(/\S+/g) || []).length;

export function describe(tokens, defaultHold = 4) {
  let words = 0;
  let open = null;
  const cues = [];
  const sentences = [];
  for (const t of tokens) {
    if (t.text !== undefined) words += countWords(t.text);
    else if (t.cue !== undefined) cues.push({ id: t.cue, at: words, hold: t.hold ?? defaultHold });
    else if (t.sentence === 'start') open = { start: words, echo: !!t.echo };
    else if (t.sentence === 'end' && open) {
      sentences.push({ start: open.start, end: words, echo: open.echo });
      open = null;
    }
  }
  return { words, cues, sentences };
}

// The sentence to show at reveal position u (words revealed, fractional): the one holding the newest
// word that has begun to appear, so a finished sentence stays up until the next one starts.
export function sentenceAt(sentences, u) {
  const k = Math.ceil(u) - 1;
  if (k < 0) return -1;
  for (let i = sentences.length - 1; i >= 0; i--) if (k >= sentences[i].start) return i;
  return -1;
}
