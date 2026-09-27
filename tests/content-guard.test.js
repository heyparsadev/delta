import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, listDeep, htmlText, norm, copyLines, ARABIC, NO_NOTES, privateGuard } from './helpers/copy.js';

// The shipped pages. `sibkade` lists each page's Sibkade sections, which must never mention Claude.
const PAGES = [
  { file: 'index.html', sibkade: ['sibkade', 'sibkade-2026'] },
  { file: 'keynote.html', sibkade: ['sibkade'] },
];
const shipped = () => [...PAGES.map((p) => p.file), ...listDeep('css', '.css'), ...listDeep('js', '.js'), ...listDeep('assets', '.svg')];

// The private words and figures live beside the notes in content/, so this file names none of them.
const PRIVATE = privateGuard();
const WORDS = ['not for publishing', 'untitled folder', '/users/', ...PRIVATE.words];
const NUMBERS = PRIVATE.numbers;
const ALLOW = new Set([
  'https://barayand.io', 'https://bargasht.barayand.io',
  'https://github.com/heyparsadev/persian-llm-eval', 'https://github.com/heyparsadev',
  'https://x.com/parsakzn', 'https://t.me/parsa_notes',
  'https://www.linkedin.com/in/parsa-kharazmian-2507a4223/', 'mailto:me@heyparsa.com',
  'https://delta-bay-sigma.vercel.app/', 'https://delta-bay-sigma.vercel.app/keynote', 'https://delta-bay-sigma.vercel.app/assets/og.jpg',
  'https://delta-bay-sigma.vercel.app/assets/og-keynote.jpg',
]);

for (const page of PAGES) {
  test(`${page.file}: every line of final copy appears verbatim`, { skip: NO_NOTES }, () => {
    const text = norm(htmlText(read(page.file)));
    const missing = copyLines()
      .filter(({ line }) => !text.includes(norm(line)))
      .map(({ name, line }) => `${name}: ${line.slice(0, 80)}`);
    assert.deepEqual(missing, []);
  });

  test(`${page.file}: none of the private numbers show`, { skip: NO_NOTES }, () => {
    const visible = htmlText(read(page.file));
    for (const n of NUMBERS) assert.ok(!visible.includes(n), `${page.file} shows "${n}"`);
  });

  test(`${page.file}: the Sibkade sections never mention Claude`, () => {
    const html = read(page.file);
    for (const id of page.sibkade) {
      const m = html.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`));
      assert.ok(m, `section #${id} exists`);
      assert.ok(!/claude/i.test(m[0]), `#${id} mentions Claude`);
    }
  });

  test(`${page.file}: external links only go to approved destinations`, () => {
    const urls = [...read(page.file).matchAll(/(?:href|content|src)="((?:https?:|mailto:)[^"]+)"/g)].map((m) => m[1]);
    for (const u of urls) assert.ok(ALLOW.has(u), `unexpected external URL ${u}`);
  });

  test(`${page.file}: every in-page link has a target`, () => {
    const html = read(page.file);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const [, id] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.has(id), `#${id} missing`);
  });
}

test('no Persian script anywhere in shipped files', () => {
  for (const f of shipped()) {
    const hit = read(f).match(ARABIC);
    assert.equal(hit, null, `${f} contains ${hit && JSON.stringify(hit[0])}`);
  }
});

test('private notes never ship', () => {
  for (const f of shipped()) {
    const text = read(f).toLowerCase();
    for (const w of WORDS) assert.ok(!text.includes(w), `${f} contains "${w}"`);
  }
});

test('no CDN or other remote resources in CSS and JS', () => {
  for (const f of [...listDeep('css', '.css'), ...listDeep('js', '.js')]) {
    const urls = (read(f).match(/https?:\/\/[^\s'")]+/g) || []).filter((u) => !u.startsWith('http://www.w3.org/2000/svg'));
    assert.deepEqual(urls, [], `${f} references ${urls.join(', ')}`);
  }
});
