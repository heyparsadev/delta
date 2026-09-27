// Shared by the content tests: reading files and turning HTML and Markdown into comparable text.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const read = (p) => readFileSync(join(root, p), 'utf8');
export const exists = (p) => existsSync(join(root, p));

// Every file with the extension under dir, at any depth, as root-relative paths.
export function listDeep(dir, ext) {
  if (!exists(dir)) return [];
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) return listDeep(rel, ext);
    return name.endsWith(ext) ? [rel] : [];
  });
}

export const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿‌]/;
const PERSIAN_PAREN = /\s*\([^)]*[؀-ۿ][^)]*\)/g;

export function htmlText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}
export const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

// Publishable copy from a content file: everything before the private notes, minus meta headings,
// the unused "Homepage card" blocks and the Persian parentheticals.
export function publishable(md) {
  const out = [];
  let skip = false;
  for (const block of md.split(/\n\s*\n/)) {
    const b = block.trim();
    if (!b) continue;
    if (/^## Notes \(not for publishing\)/.test(b)) break;
    if (/^## Homepage card/.test(b)) { skip = true; continue; }
    if (skip && (/^## /.test(b) || b === '---')) skip = false;
    if (skip) continue;
    if (/^# /.test(b) || b === '---' || /^## Hero \(site top\)/.test(b)) continue;
    for (const line of b.split('\n')) {
      const clean = line.replace(/^#+\s*/, '').replace(/\*+/g, '').replace(PERSIAN_PAREN, '').trim();
      if (clean) out.push(clean);
    }
  }
  return out;
}

export const CONTENT = ['about', 'iranspoti', 'sibkade', 'helpfinity', 'barayand', 'playground'];
export const EXTRA = [
  'One more thing',
  'In March 2023, a week after GPT-4, a thousand people signed a letter asking to pause training bigger models. I remember thinking they were killjoys. Three years later, I’m one of them.',
];

// The source notes in content/ stay private and are not in the public repository. The tests that
// compare the pages with them skip when they are absent (NO_NOTES is the reason, or false).
export const NO_NOTES = exists('content/about.md') ? false : 'the private source notes (content/) are not in this copy';
// Words and figures from the notes that must never ship, kept beside them in content/.
export const privateGuard = () =>
  exists('content/private-guard.json') ? JSON.parse(read('content/private-guard.json')) : { words: [], numbers: [] };

// Every line of final copy, in content-file order, then the approved extras.
export function copyLines() {
  const out = [];
  for (const name of CONTENT) for (const line of publishable(read(`content/${name}.md`))) out.push({ name, line });
  for (const line of EXTRA) out.push({ name: 'extra', line });
  return out;
}
