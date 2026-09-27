// Which story channel is under a point, at a given story time. Pure module.

const CELL = 40;

function segDist2(x, y, s) {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const l2 = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
  const qx = s.ax + dx * u - x, qy = s.ay + dy * u - y;
  return qx * qx + qy * qy;
}

// A grid of channel segments in world units. Segments the braid replaces are left out, and the
// loop that becomes the oxbow remembers when it was cut off.
export function buildIndex(geo, projectIds) {
  const grid = new Map();
  for (const ch of geo.channels) {
    const pts = ch.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      if (ch.skip && i >= ch.skip[0] && i < ch.skip[1]) continue;
      const a = pts[i], b = pts[i + 1];
      const inLoop = ch.cut && i >= ch.cut.i && i < ch.cut.j;
      const seg = { ax: a.x, ay: a.y, bx: b.x, by: b.y, t: a.t, id: ch.label, cutT: inLoop ? ch.cut.t : null };
      const key = `${Math.floor((a.x + b.x) / 2 / CELL)},${Math.floor((a.y + b.y) / 2 / CELL)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(seg);
    }
  }
  const mouths = geo.mouths.filter((m) => projectIds.has(m.id));
  return { grid, mouths };
}

// The label key under (wx, wy) within `radius` world units, or null. Mouth hotspots win over
// channels. On a tie the channel listed later wins, so a refill drawn over its old bed
// (Mind Mirror over HelpFinity) is the one that answers.
export function hitAt(index, wx, wy, radius, T) {
  for (const m of index.mouths) if (m.t <= T && Math.hypot(m.x - wx, m.y - wy) < radius) return m.id;
  const cx = Math.floor(wx / CELL), cy = Math.floor(wy / CELL), r = Math.ceil(radius / CELL);
  let best = null, bd = radius * radius;
  for (let j = cy - r; j <= cy + r; j++) {
    for (let i = cx - r; i <= cx + r; i++) {
      const cell = index.grid.get(`${i},${j}`);
      if (!cell) continue;
      for (const s of cell) {
        if (s.t > T) continue;
        const d = segDist2(wx, wy, s);
        if (d <= bd) { bd = d; best = s; }
      }
    }
  }
  if (!best) return null;
  if (best.cutT !== null) return T >= best.cutT ? 'oxbow' : 'iranspoti';
  return best.id;
}
