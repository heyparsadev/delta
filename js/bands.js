// Landsat band combinations: 0 natural 4·3·2, 1 infrared 5·4·3, 2 SWIR 7·6·4.
const KEY = 'hp.band';
const FADE = 0.45; // seconds

function read() {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v === 1 || v === 2 ? v : 0;
  } catch {
    return 0;
  }
}
function write(v) {
  try { localStorage.setItem(KEY, String(v)); } catch { /* storage blocked: fine */ }
}

export function createBands(state, root = document) {
  const buttons = [...root.querySelectorAll('.bands [data-band]')];

  function sync() {
    for (const b of buttons) {
      const on = Number(b.dataset.band) === state.band;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }

  function set(i) {
    const v = ((i % 3) + 3) % 3;
    if (v === state.band) return;
    state.bandFrom = state.band;
    state.band = v;
    state.bandMix = state.reduced ? 1 : 0;
    write(v);
    sync();
  }

  function tick(dt) {
    if (state.bandMix < 1) state.bandMix = Math.min(1, state.bandMix + dt / FADE);
  }

  for (const b of buttons) b.addEventListener('click', () => set(Number(b.dataset.band)));
  root.querySelector('.bands')?.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    set(state.band + d);
    buttons[state.band].focus();
  });

  state.band = state.bandFrom = read();
  state.bandMix = 1;
  sync();
  return { set, next: () => set(state.band + 1), tick };
}
