// Real-time screenshots of the keynote through headless Chrome's DevTools protocol (no packages).
// The browser pane and virtual-time headless shots both miss frames of a rAF-driven page; this waits
// in real time. Needs `npm start` running and Google Chrome installed. Chrome runs with a throwaway
// profile in the system temp folder, never the user's own.
// Usage: node dev/shoot.mjs <outDir> <width>x<height>[@dpr] name=query ...  (name.jpg for a JPEG)
//   e.g. node dev/shoot.mjs /tmp/shots 1440x900@2 sibkade=p=198 sketch=cue=i1
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [outDir, size, ...shots] = process.argv.slice(2);
const [, w, h, dpr = '1'] = size.match(/^(\d+)x(\d+)(?:@([\d.]+))?$/);
mkdirSync(outDir, { recursive: true });

// A fresh throwaway profile per run: a second Chrome on a profile in use would hand off to the first.
const profile = join(tmpdir(), `heyparsa-shoot-${process.pid}`);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--use-angle=metal', '--enable-gpu', '--remote-debugging-port=9333', `--window-size=${w},${h}`, 'about:blank',
], { stdio: 'ignore', detached: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    // The page's warnings and errors, so a shot also checks the console.
    if (msg.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(msg.params.type)) {
      console.log(`  console.${msg.params.type}:`, msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') console.log('  exception:', msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  });
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: +dpr, mobile: +w < 700 });
  for (const shot of shots) {
    const cut = shot.indexOf('=');
    const name = shot.slice(0, cut), query = shot.slice(cut + 1);
    // A query starting with / is a full path (the stage harness, say); anything else is keynote.html's query.
    await send('Page.navigate', { url: query.startsWith('/') ? `http://localhost:8137${query}` : `http://localhost:8137/keynote.html?${query}` });
    await sleep(+(process.env.SHOOT_WAIT || 3500)); // real time: fonts, the stage, the springs and the slide transitions settle
    // SHOOT_CSS adds a style to the page before the capture (the Open Graph image hides the controls).
    if (process.env.SHOOT_CSS) {
      await send('Runtime.evaluate', { expression: `document.head.append(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(process.env.SHOOT_CSS)} }))` });
      await sleep(600);
    }
    const probe = await send('Runtime.evaluate', { expression: "JSON.stringify({ y: scrollY, h: innerHeight, docH: document.documentElement.scrollHeight, beat: document.querySelector('.frame.is-active')?.parentElement.dataset.beat, url: location.search })" });
    console.log(name, probe.result?.result?.value);
    // A name ending in .jpg gives a JPEG (quality 90), for the Open Graph image.
    const jpeg = name.endsWith('.jpg');
    const res = await send('Page.captureScreenshot', jpeg ? { format: 'jpeg', quality: 90 } : { format: 'png' });
    writeFileSync(join(outDir, jpeg ? name : `${name}.png`), Buffer.from(res.result.data, 'base64'));
    console.log(jpeg ? name : `${name}.png`);
  }
  ws.close();
} finally {
  try { process.kill(-chrome.pid); } catch { chrome.kill(); }
  await new Promise((r) => setTimeout(r, 300));
  rmSync(profile, { recursive: true, force: true });
}
