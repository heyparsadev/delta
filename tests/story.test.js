import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, STATIONS, PROJECTS, TIMES, sceneAt } from '../js/story.js';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

function stepsOf(id) {
  const m = html.match(new RegExp(`<section id="${id}" class="scene"[\\s\\S]*?</section>`));
  assert.ok(m, `scene #${id} in index.html`);
  return [...m[0].matchAll(/data-t0="([\d.]+)" data-t1="([\d.]+)"/g)].map((s) => [+s[1], +s[2]]);
}

test('HTML steps tile each scene exactly', () => {
  for (const s of SCENES) {
    const steps = stepsOf(s.id);
    assert.ok(steps.length >= 1);
    assert.equal(steps[0][0], s.t0, `${s.id} starts at t0`);
    assert.equal(steps[steps.length - 1][1], s.t1, `${s.id} ends at t1`);
    for (let i = 1; i < steps.length; i++) assert.equal(steps[i][0], steps[i - 1][1], `${s.id} step ${i} contiguous`);
  }
  for (let i = 1; i < SCENES.length; i++) assert.equal(SCENES[i].t0, SCENES[i - 1].t1);
  assert.equal(SCENES[0].t0, 0);
  assert.equal(SCENES[SCENES.length - 1].t1, 1);
});

test('stations and projects fall inside their scenes', () => {
  const range = (id) => SCENES.find((s) => s.id === id);
  for (const st of STATIONS) {
    const scene = ['S1', 'S2'].includes(st.id) ? range('sibkade') : range('sibkade-2026');
    assert.ok(st.t > scene.t0 && st.t < scene.t1, st.id);
  }
  const pg = range('playground');
  for (const p of PROJECTS) {
    assert.ok(p.t0 >= pg.t0 && p.t1 <= pg.t1 && p.t0 < p.t1, p.id);
    assert.ok(html.includes(`id="${p.id}"`), `#${p.id} exists`);
  }
});

test('river moments line up with scene boundaries', () => {
  assert.equal(TIMES.apex, range('helpfinity').t0);
  assert.equal(TIMES.barayand, range('barayand').t0);
  assert.ok(TIMES.cutoff < range('iranspoti').t1);
  assert.ok(TIMES.helpfinityEnd < TIMES.coda[0]);
  assert.equal(sceneAt(0.5).id, 'helpfinity');
  assert.equal(sceneAt(1).id, 'playground');
  function range(id) { return SCENES.find((s) => s.id === id); }
});
