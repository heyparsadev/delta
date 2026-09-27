// The reticle, the sensor lens and hover labels over the map. Touch: tap to open, hold for the lens.
import { LABELS, PROJECTS } from './story.js';
import { buildIndex, hitAt } from './hittest.js';

const RADIUS = 90;
const HOLD_MS = 380;
const TAP_MS = 300;
const TEXTY = 'a, button, input, select, textarea, .panel, .hud > *, .scrubber, .hero-copy, .ground-copy, .finale-copy, .uplink-copy';

export function createPointer({ geo, state, hud, onPick }) {
  const root = document.documentElement;
  const reticle = document.querySelector('.reticle');
  const label = reticle.querySelector('.reticle-label');
  const fine = matchMedia('(pointer: fine)').matches;
  const projectEls = [...document.querySelectorAll('.project[data-project]')];
  const projectIds = new Set(PROJECTS.map((p) => p.id));
  const index = buildIndex(geo, projectIds);

  let px = -999, py = -999, over = false, holding = false, holdTimer = 0, hovered = null;
  let recheck = false, down = null;
  const onMap = (target) => !(target instanceof Element) || !target.closest(TEXTY);

  // Screen → world through the flat map (the pointer is off while the planet is showing).
  const worldAt = (x, y) => {
    const s = state.cam.h / innerHeight;
    return { x: state.cam.x + (x - innerWidth / 2) * s, y: state.cam.y + (y - innerHeight / 2) * s, s };
  };
  const pick = (x, y) => {
    const w = worldAt(x, y);
    return hitAt(index, w.x, w.y, 18 * w.s, state.T);
  };

  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      if (holding) { px = e.clientX; py = e.clientY; }
      return;
    }
    px = e.clientX; py = e.clientY;
    over = onMap(e.target);
  }, { passive: true });
  root.addEventListener('mouseleave', () => { over = false; });
  addEventListener('blur', () => { over = false; });
  // Content can scroll under a still mouse; look again at what is under it.
  addEventListener('scroll', () => { recheck = true; if (!holding) clearTimeout(holdTimer); }, { passive: true });

  addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !onMap(e.target)) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { holding = true; over = true; px = down.x; py = down.y; }, HOLD_MS);
  }, { passive: true });
  addEventListener('pointerup', (e) => {
    clearTimeout(holdTimer);
    if (holding) { holding = false; over = false; down = null; return; }
    // A short, still tap on the map opens whatever channel or mouth is under it.
    if (down && e.pointerType === 'touch' && performance.now() - down.t < TAP_MS &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10 && onMap(e.target) && state.planet < 0.05) {
      const id = pick(e.clientX, e.clientY);
      if (id && LABELS[id]) onPick(LABELS[id].anchor || LABELS[id].scene);
    }
    down = null;
  });
  addEventListener('pointercancel', () => { clearTimeout(holdTimer); holding = false; down = null; });

  addEventListener('click', (e) => {
    if (!fine || !over || !hovered || !onMap(e.target)) return;
    const l = LABELS[hovered];
    if (l) onPick(l.anchor || l.scene);
  });

  for (const el of projectEls) {
    const id = el.dataset.project;
    const on = () => { state.lit = id; };
    const off = () => { if (state.lit === id) state.lit = null; };
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointerleave', off);
    el.addEventListener('focusin', on);
    el.addEventListener('focusout', off);
  }

  let lastLabel = null, lastLit = null;
  function showLabel(id) {
    if (id === lastLabel) return;
    lastLabel = id;
    if (!id || !LABELS[id]) { label.replaceChildren(); return; }
    const b = document.createElement('b');
    b.textContent = LABELS[id].name;
    const i = document.createElement('i');
    i.textContent = LABELS[id].meta;
    label.replaceChildren(b, i);
  }

  function syncLit(st) {
    const lit = st.lit || (st.hover && projectIds.has(st.hover) ? st.hover : null);
    if (lit === lastLit) return;
    lastLit = lit;
    for (const el of projectEls) el.classList.toggle('is-lit', el.dataset.project === lit);
  }

  function tick(st) {
    if (recheck && fine && px > -999) {
      const el = document.elementFromPoint(px, py);
      over = !!el && onMap(el);
      recheck = false;
    }
    const active = over && (fine || holding) && st.planet < 0.05 && st.dim < 0.3;
    root.classList.toggle('map-cursor', active && fine);
    reticle.hidden = !active;
    st.lens.on = active;
    st.lens.x = px; st.lens.y = py; st.lens.r = RADIUS;
    if (!active) {
      hovered = null;
      st.hover = null;
      showLabel(null);
      syncLit(st);
      return;
    }
    reticle.style.setProperty('--x', `${px}px`);
    reticle.style.setProperty('--y', `${py}px`);
    reticle.style.setProperty('--r', `${RADIUS}px`);
    const w = worldAt(px, py);
    hud.setGrid(w.x, w.y);
    hovered = hitAt(index, w.x, w.y, 18 * w.s, st.T);
    st.hover = hovered;
    showLabel(hovered);
    syncLit(st);
  }

  return { tick };
}
