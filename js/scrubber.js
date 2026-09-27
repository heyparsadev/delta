// The time scrubber: 2019 → 2026 with year ticks and scene markers. An ARIA slider.
import { SCENES } from './story.js';
import { tForMonth, calendar, calendarLabel, clamp } from './timeline.js';

const MAJOR = [2019, 2020, 2023, 2026];

export function createScrubber({ onSeek }) {
  const track = document.querySelector('.scrub-track');
  if (!track) return { update() {} };
  const ticks = track.querySelector('.scrub-ticks');
  const bar = track.closest('.scrubber');

  for (let y = 2019; y <= 2026; y++) {
    const tick = document.createElement('i');
    tick.className = MAJOR.includes(y) ? 'scrub-tick major' : 'scrub-tick';
    tick.style.left = `${tForMonth(y, 1) * 100}%`;
    if (MAJOR.includes(y)) {
      const label = document.createElement('span');
      label.textContent = String(y);
      tick.append(label);
    }
    ticks.append(tick);
  }
  const markers = SCENES.map((sc) => {
    const m = document.createElement('i');
    m.className = 'scrub-scene';
    m.style.left = `${sc.t0 * 100}%`;
    m.title = `${String(sc.n).padStart(2, '0')} · ${sc.name}`;
    ticks.append(m);
    return m;
  });

  let current = 1, aim = 1; // shown time, and the time the page is heading to
  let dragging = false;
  const fromEvent = (e) => {
    const r = track.getBoundingClientRect();
    return clamp((e.clientX - r.left) / r.width, 0, 1);
  };
  track.addEventListener('pointerdown', (e) => {
    dragging = true;
    track.setPointerCapture(e.pointerId);
    bar.classList.add('is-dragging');
    onSeek(fromEvent(e));
  });
  track.addEventListener('pointermove', (e) => { if (dragging) onSeek(fromEvent(e)); });
  const stop = () => { dragging = false; bar.classList.remove('is-dragging'); };
  track.addEventListener('pointerup', stop);
  track.addEventListener('pointercancel', stop);

  // Arrow keys move one calendar month (Shift: six), counted from where the scroll is heading.
  const monthStep = (from, n) => {
    const c = calendar(from);
    const m = c.year * 12 + (c.month - 1) + n;
    return tForMonth(Math.floor(m / 12), (m % 12) + 1);
  };
  track.addEventListener('keydown', (e) => {
    const n = e.shiftKey ? 6 : 1;
    let t = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') t = monthStep(aim, n);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') t = monthStep(aim, -n);
    else if (e.key === 'Home') t = 0;
    else if (e.key === 'End') t = 1;
    else if (e.key === 'PageDown') t = (SCENES.find((s) => s.t0 > aim + 1e-3) || SCENES[SCENES.length - 1]).t0;
    else if (e.key === 'PageUp') t = ([...SCENES].reverse().find((s) => s.t0 < aim - 1e-3) || SCENES[0]).t0;
    if (t === null) return;
    e.preventDefault();
    e.stopPropagation();
    aim = clamp(t, 0, 1);
    onSeek(aim);
  });

  let lastText = '';
  function update(T, sceneId, targetT = T) {
    current = clamp(T, 0, 1);
    if (!track.matches(':focus')) aim = clamp(targetT, 0, 1);
    track.style.setProperty('--s', current.toFixed(4));
    const sc = SCENES.find((s) => s.id === sceneId);
    const text = sc ? `${calendarLabel(T)}, ${sc.name}` : calendarLabel(T);
    if (text !== lastText) {
      track.setAttribute('aria-valuenow', String(Math.round(current * 1000)));
      track.setAttribute('aria-valuetext', text);
      markers.forEach((m, i) => m.classList.toggle('is-current', SCENES[i].id === sceneId));
      lastText = text;
    }
  }
  return { update };
}
