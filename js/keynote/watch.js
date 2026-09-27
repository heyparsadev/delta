// Watch: plays the keynote as a film by scrolling the page itself. A wheel, touch, key or pointer drag
// pauses it, and so does hiding the tab or a scroll it did not make. It stops at the end.
import { filmAt, timeAt } from './film.js';

export function createWatch({ film, position, jump, onChange }) {
  let playing = false, t = 0, last = 0, ownY = null;
  const set = (on) => {
    if (on === playing) return;
    playing = on;
    onChange(on);
  };
  function play() {
    t = timeAt(film, position());
    if (t >= film.length - 0.1) t = 0;
    last = performance.now();
    ownY = null;
    set(true);
  }
  const pause = () => set(false);
  function tick(now) {
    if (!playing) return;
    t = Math.min(film.length, t + Math.min(0.1, (now - last) / 1000));
    last = now;
    ownY = jump(filmAt(film, t));
    if (t >= film.length) pause();
  }

  const stop = () => { if (playing) pause(); };
  addEventListener('wheel', stop, { passive: true });
  addEventListener('touchstart', stop, { passive: true });
  // Buttons and links handle their own keys (Enter on Pause must not pause and then play again).
  addEventListener('keydown', (e) => { if (!e.target.closest?.('button, a') && !e.metaKey && !e.ctrlKey && !e.altKey) stop(); });
  let down = null;
  addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  addEventListener('pointermove', (e) => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) stop(); });
  addEventListener('pointerup', () => { down = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  addEventListener('scroll', () => { if (playing && ownY !== null && Math.abs(scrollY - ownY) > 3) stop(); }, { passive: true });

  return { play, pause, toggle: () => (playing ? pause() : play()), tick, get playing() { return playing; } };
}
