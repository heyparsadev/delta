import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, htmlText, norm, copyLines, NO_NOTES } from './helpers/copy.js';
import { beatsFromHtml, decode } from './helpers/keynote-html.js';
import { buildTrack, WORDS_PER_VIEWPORT } from '../js/keynote/track.js';

const html = read('keynote.html');
const beats = beatsFromHtml(html);

// Spec §7: the only words on the Keynote that are not Parsa's copy. The last three are the link
// labels of URLs that are already on the allowlist.
const APPROVED = [
  'Good morning.', 'Good afternoon.', 'Good evening.', 'Introducing', 'Thank you.', 'About', 'Tech specs',
  'Watch', 'Play', 'Pause', 'Replay', 'Chapters', 'or scroll', 'Skip to About', 'Email', '© 2026 Parsa Kharazmian',
  '12', '11', '1 in 2', '3 in 10', '300', '10',
  'Barayand →', 'Mind Mirror →', 'Apsis →', 'Persian LLM Eval →',
  'On Mars now', 'MTC · Sol',
  '7KQ4-MX2P-9DLA-3VRE', 'Should I raise prices this year?', 'Agreement score 0.72',
  'Translated from Persian',
  'I messed up one slide in the meeting. I always ruin presentations, and now everyone thinks I’m useless.',
  'Overgeneralization', 'Mind reading', 'Labeling',
  'One slide went wrong in one meeting. That is a mistake, not a verdict on you.',
  'What would you say to a friend who told you this?',
  'Submit', 'CV', 'Statement of purpose',
  'bargasht.barayand.io', 'github.com/heyparsadev/persian-llm-eval', 'github.com/heyparsadev',
  // The section's own name, from the title of content/playground.md (a meta heading, so not counted
  // as copy) and a chapter name in spec §4.
  'Playground',
];

test('every caption is exactly one paragraph of the copy, and none repeats', { skip: NO_NOTES }, () => {
  const lines = new Set(copyLines().map(({ line }) => norm(line)));
  const seen = new Set();
  for (const b of beats.filter((x) => x.caption !== null)) {
    const text = norm(htmlText(b.caption));
    assert.ok(lines.has(text), `beat ${b.id}: caption is not one copy paragraph: "${text.slice(0, 90)}"`);
    assert.ok(!seen.has(text), `beat ${b.id}: caption repeats another beat`);
    seen.add(text);
  }
});

test('only approved words: every visible run of text is copy or on the approved list', { skip: NO_NOTES }, () => {
  const lines = copyLines().map(({ line }) => norm(line));
  const approved = APPROVED.map(norm);
  const ok = (s) => { const n = norm(s); return !n || lines.some((l) => l.includes(n)) || approved.some((a) => a.includes(n)); };
  const body = html.slice(html.indexOf('<body')).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  const runs = body.split(/<[^>]+>/).map(decode).filter((r) => !ok(r));
  const attrs = [...body.matchAll(/\s(?:aria-label|title|alt|placeholder|data-say-[a-z-]+)="([^"]*)"/g)]
    .map((m) => decode(m[1])).filter((v) => !ok(v));
  assert.deepEqual([...runs.map((r) => r.trim()), ...attrs], []);
});

test('cues are unique, and every slide of a caption beat has its marker in the caption', () => {
  assert.doesNotThrow(() => buildTrack(beats));
  for (const b of beats.filter((x) => x.caption !== null)) {
    const ids = new Set(b.cues.map((c) => c.id));
    for (const s of b.slides) assert.ok(ids.has(s.cue), `beat ${b.id}: slide "${s.cue}" has no cue marker`);
  }
});

test('a sentence marked echo is one the beat’s slides already show word for word', () => {
  for (const b of beats) {
    for (const e of b.echoes) assert.ok(b.shown.includes(norm(e)), `beat ${b.id}: "${e}" is marked echo, but no slide shows it`);
  }
});

test('beats have unique ids, known layouts, and the keynote runs a sensible length', () => {
  const ids = beats.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const b of beats) for (const s of b.slides) assert.ok(['left', 'right', 'center'].includes(s.layout), `${b.id}/${s.cue}: ${s.layout}`);
  const viewports = buildTrack(beats).length / WORDS_PER_VIEWPORT;
  assert.ok(viewports > 60 && viewports < 170, `${viewports.toFixed(0)} viewport heights`);
});

test('every demo step names a cue of its own beat', () => {
  let steps = 0;
  for (const chunk of html.slice(html.indexOf('<main')).split(/(?=<div class="beat")/).slice(1)) {
    const id = chunk.match(/data-beat="([^"]+)"/)[1];
    const beat = beats.find((b) => b.id === id);
    const cues = new Set(beat.cues.map((c) => c.id));
    for (const [, name, cue] of chunk.matchAll(/data-(from|until|at)="([^"]+)"/g)) {
      steps++;
      if (name === 'until' && !cues.has(cue)) {
        // A demo may run until a cue of a later beat.
        assert.ok(beats.some((b) => b.cues.some((c) => c.id === cue)), `beat ${id}: data-until="${cue}" is not a cue`);
      } else assert.ok(cues.has(cue), `beat ${id}: data-${name}="${cue}" is not one of its cues`);
    }
  }
  assert.ok(steps >= 12, `only ${steps} demo steps`);
});
