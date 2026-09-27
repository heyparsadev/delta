import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitText } from '../js/keynote/captions.js';
import { countWords } from '../js/keynote/describe.js';

test('wrapping a text node keeps every character and finds the words describe() counts', () => {
  for (const s of ['', '  ', 'one', ' one  two ', 'It never became ', ': 300 questions', 'the customer’s — “account”\n']) {
    const parts = splitText(s);
    assert.equal(parts.map((p) => p.text).join(''), s);
    assert.equal(parts.filter((p) => p.word).length, countWords(s));
  }
});
