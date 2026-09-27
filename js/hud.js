// Instrument readouts: UTC clock, scene, calendar date and grid coordinates.
import { calendarLabel } from './timeline.js';

const SHOTS = { hero: 'Overview', rewind: 'Rewind', ground: 'Ground truth', finale: 'One more thing', uplink: 'Uplink' };
const pad = (n) => String(n).padStart(2, '0');
const coord = (v) => (v < 0 ? '−' : '+') + (Math.abs(v) / 100).toFixed(2).padStart(5, '0');

export function createHud(root = document) {
  const el = (k) => root.querySelector(`[data-hud="${k}"]`);
  const utc = el('utc'), scene = el('scene'), grid = el('grid'), date = el('date'), alt = el('alt');
  const seen = { scene: '', date: '', grid: '', alt: '' };
  const put = (node, key, value) => {
    if (node && seen[key] !== value) { node.textContent = value; seen[key] = value; }
  };

  function clock() {
    const d = new Date();
    if (utc) utc.textContent = `UTC ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  clock();
  setInterval(clock, 1000);

  function update(state, target) {
    const s = target.scene
      ? `Scene ${pad(target.scene.n)}/06 · ${target.scene.name}`
      : SHOTS[target.step && target.step.shot] || 'Overview';
    put(scene, 'scene', s);
    put(date, 'date', calendarLabel(state.T));
    // 705 km (Landsat's orbit) at the overview; the pull-back to the finale climbs to ~GEO.
    put(alt, 'alt', `ALT ${Math.round((705 * state.cam.h) / 1900).toLocaleString('en-US')} KM`);
  }

  function setGrid(x, y) {
    put(grid, 'grid', `Grid ${coord(x)} · ${coord(y)}`);
  }

  return { update, setGrid };
}
