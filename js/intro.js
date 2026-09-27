// The downlink: the first frame arrives line by line, once per session. Any input skips it.
const KEY = 'hp.downlink';
const DURATION = 1.7; // seconds of scan
const HOLD = 0.4; // seconds of "acquiring signal" before the scan starts

export function runIntro(state, { reduced }) {
  const root = document.documentElement;
  const el = document.querySelector('.downlink');
  let seen = false;
  try { seen = sessionStorage.getItem(KEY) === '1'; } catch { /* storage blocked */ }
  if (!el || seen || reduced || scrollY > innerHeight * 0.5) {
    state.intro = 1;
    return { tick() {} };
  }

  let t = -HOLD;
  let done = false;
  const events = ['keydown', 'pointerdown', 'wheel', 'touchmove'];
  function finish() {
    if (done) return;
    done = true;
    state.intro = 1;
    el.hidden = true;
    root.classList.remove('intro-on');
    try { sessionStorage.setItem(KEY, '1'); } catch { /* storage blocked */ }
    for (const ev of events) removeEventListener(ev, finish);
  }
  for (const ev of events) addEventListener(ev, finish, { passive: true });

  state.intro = 0;
  el.hidden = false;
  root.classList.add('intro-on');

  return {
    tick(dt) {
      if (done) return;
      t += dt;
      const x = Math.max(0, Math.min(1, t / DURATION));
      state.intro = 1 - Math.pow(1 - x, 2); // ease out: fast start, settling finish
      if (t >= DURATION) finish();
    },
  };
}
