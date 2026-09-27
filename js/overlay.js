// Canvas 2D layer: channels, growth fronts, oxbow, stations, mouths, front label and the lens.
import { pointAt, grownLines } from './delta.js';
import { LABELS, PROJECTS } from './story.js';

const TAU = Math.PI * 2;
const CHUNK = 14;
const MONO = '500 10.5px "Martian Mono", ui-monospace, Menlo, monospace';
const PROJECT_IDS = new Set(PROJECTS.map((p) => p.id));
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const OVERLAY_BANDS = [
  { core: '#dffaff', glow: 'rgb(110, 215, 255)', glowAlpha: 0.3, front: '127, 227, 255', dry: 'rgba(222, 196, 146, 0.55)',
    lake: 'rgba(38, 104, 124, 0.92)', shore: 'rgba(200, 245, 255, 0.45)', ink: '#e8eef2', dim: 'rgba(232, 238, 242, 0.6)',
    paleo: 'rgba(255, 214, 150, 0.9)' },
  { core: '#e2e9ff', glow: 'rgb(86, 132, 255)', glowAlpha: 0.36, front: '150, 180, 255', dry: 'rgba(255, 120, 130, 0.62)',
    lake: 'rgba(8, 16, 36, 0.95)', shore: 'rgba(170, 190, 255, 0.5)', ink: '#f1f4f6', dim: 'rgba(241, 244, 246, 0.6)',
    paleo: 'rgba(255, 92, 110, 0.95)' },
  { core: '#f1e8ff', glow: 'rgb(168, 128, 255)', glowAlpha: 0.34, front: '200, 170, 255', dry: 'rgba(255, 190, 120, 0.6)',
    lake: 'rgba(10, 14, 46, 0.95)', shore: 'rgba(210, 190, 255, 0.5)', ink: '#f1f4f6', dim: 'rgba(241, 244, 246, 0.6)',
    paleo: 'rgba(255, 176, 96, 0.95)' },
];

export function createOverlay(canvas, geo) {
  const ctx = canvas.getContext('2d');
  // Glow is painted opaque on its own layer and added once, so overlapping strokes never stack into beads.
  const glowCanvas = document.createElement('canvas');
  const gctx = glowCanvas.getContext('2d');
  const helpfinity = geo.channels.find((c) => c.id === 'helpfinity');
  let vw = 1, vh = 1, dpr = 1;
  let st = null, s = 1, base = 1;
  let G = null, gcos = 1, gsin = 0;
  let px = 0, py = 0;

  // World point → screen (writes px, py). Zoomed out, points ride the planet's surface: the same
  // orthographic sphere and tilt the terrain shader uses, so channels stay on their land.
  function pos(p) {
    let x = p.x, y = p.y;
    if (G) {
      const ax = (x - G.cx) / G.R, ay = (y - G.cy) / G.R;
      const th = Math.sqrt(ax * ax + ay * ay);
      const k = th > 1e-9 ? Math.sin(th) / th : 1;
      x = G.cx + G.R * ax * k;
      y = G.cy + G.R * (ay * k * gcos - Math.cos(th) * gsin);
    }
    px = (x - st.cam.x) / s + vw / 2;
    py = (y - st.cam.y) / s + vh / 2;
  }
  const onScreen = (ax, ay, bx, by, pad) =>
    !(Math.max(ax, bx) < -pad || Math.min(ax, bx) > vw + pad || Math.max(ay, by) < -pad || Math.min(ay, by) > vh + pad);

  let gscale = 1; // the glow is soft, so half resolution is plenty
  function resize(w, h, ratio) {
    vw = w; vh = h; dpr = Math.min(2, ratio || 1);
    gscale = dpr * 0.5;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    glowCanvas.width = Math.round(w * gscale);
    glowCanvas.height = Math.round(h * gscale);
  }

  function strokeLines(c, lines, color, mul, add, minW) {
    c.strokeStyle = color;
    for (const line of lines) {
      for (let k = 0; k < line.length - 1; k += CHUNK) {
        const end = Math.min(line.length - 1, k + CHUNK);
        pos(line[k]);
        const ax = px, ay = py;
        pos(line[end]);
        if (!onScreen(ax, ay, px, py, 90)) continue;
        c.lineWidth = Math.max(minW, (line[(k + end) >> 1].w / s) * mul + add);
        c.beginPath();
        c.moveTo(ax, ay);
        for (let i = k + 1; i <= end; i++) {
          pos(line[i]);
          c.lineTo(px, py);
        }
        c.stroke();
      }
    }
  }

  function tracePolygon(pts) {
    ctx.beginPath();
    pos(pts[0]);
    ctx.moveTo(px, py);
    for (let i = 1; i < pts.length; i++) {
      pos(pts[i]);
      ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function layer(P, lens) {
    const T = st.T;
    const ox = geo.oxbow;
    if (T >= ox.t) {
      ctx.globalAlpha = base * smooth(ox.t, ox.t + 0.012, T);
      tracePolygon(ox.pts);
      ctx.fillStyle = P.lake;
      ctx.fill();
      ctx.lineWidth = lens ? 1.6 : 1;
      ctx.strokeStyle = lens ? P.paleo : P.shore;
      ctx.stroke();
    }
    if (helpfinity && T > helpfinity.dryAt) {
      ctx.globalAlpha = base * smooth(helpfinity.dryAt, helpfinity.dryAt + 0.02, T);
      ctx.setLineDash(lens ? [] : [3, 5]);
      strokeLines(ctx, [helpfinity.pts], lens ? P.paleo : P.dry, lens ? 1.2 : 0.7, lens ? 1.4 : 0.3, 1);
      ctx.setLineDash([]);
    }

    const drawn = [];
    const iran = geo.channels[0];
    if (iran.cut && T >= iran.cut.t && T < iran.cut.t + 0.012) {
      // Just after the cutoff the loop's water drains while the oxbow lake fills.
      const loop = iran.pts.slice(iran.cut.i, iran.cut.j + 1);
      drawn.push({ ch: iran, lines: [loop], front: null, alpha: 1 - smooth(iran.cut.t, iran.cut.t + 0.012, T), hot: false });
    }
    for (const ch of geo.channels) {
      const g = grownLines(ch, T);
      if (!g.lines.length && !g.front) continue;
      const alpha = ch.dryAt ? 1 - smooth(ch.dryAt, ch.dryAt + 0.02, T) : 1;
      if (alpha <= 0.01) continue;
      drawn.push({ ch, ...g, alpha, hot: st.hover === ch.label || st.lit === ch.id });
    }

    gctx.setTransform(gscale, 0, 0, gscale, 0, 0);
    gctx.clearRect(0, 0, vw, vh);
    gctx.lineCap = 'round';
    gctx.lineJoin = 'round';
    for (const d of drawn) {
      gctx.globalAlpha = d.alpha;
      strokeLines(gctx, d.lines, P.glow, d.hot ? 3.6 : 2.6, 4, 2);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = base * P.glowAlpha;
    ctx.drawImage(glowCanvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    for (const d of drawn) {
      ctx.globalAlpha = base * d.alpha;
      if (d.ch.kind === 'refill') {
        ctx.setLineDash([9, 7]);
        ctx.lineDashOffset = st.reduced ? 0 : -st.time * 22;
      }
      strokeLines(ctx, d.lines, P.core, d.hot ? 1.5 : 1, d.hot ? 0.8 : 0, 0.9);
      ctx.setLineDash([]);
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const d of drawn) {
      if (!d.front) continue;
      pos(d.front);
      const x = px, y = py;
      if (!onScreen(x, y, x, y, 30)) continue;
      const r = 10 + (st.reduced ? 0 : 2.5 * Math.sin(st.time * 3 + d.front.x * 0.05));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${P.front}, 0.95)`);
      g.addColorStop(0.35, `rgba(${P.front}, 0.32)`);
      g.addColorStop(1, `rgba(${P.front}, 0)`);
      ctx.globalAlpha = base * d.alpha;
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = base;
  }

  function text(str, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function marks(P) {
    const T = st.T;
    ctx.font = MONO;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px';
    ctx.lineWidth = 1;
    if (s > 3) return; // from high up, markers would only clutter the lit delta
    for (const g of geo.stations) {
      if (T < g.t) continue;
      pos(g);
      const x = px, y = py;
      if (!onScreen(x, y, x, y, 40)) continue;
      const L = 11;
      ctx.strokeStyle = 'rgba(255, 179, 107, 0.95)';
      ctx.beginPath();
      ctx.moveTo(x - g.nx * L, y - g.ny * L);
      ctx.lineTo(x + g.nx * L, y + g.ny * L);
      ctx.stroke();
      if (s < 1.7) text(g.id, x + g.nx * (L + 6) - 6, y + g.ny * (L + 6) + 4, 'rgba(255, 179, 107, 0.95)');
    }
    for (const m of geo.mouths) {
      if (!PROJECT_IDS.has(m.id) || T < m.t) continue;
      pos(m);
      const x = px, y = py;
      if (!onScreen(x, y, x, y, 30)) continue;
      const lit = st.lit === m.id || st.hover === m.id;
      ctx.strokeStyle = lit ? P.ink : P.dim;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, TAU);
      ctx.stroke();
      if (lit) {
        const pulse = st.reduced ? 0 : (st.time * 1.4) % 1;
        ctx.globalAlpha = base * (1 - pulse);
        ctx.beginPath();
        ctx.arc(x, y, 6 + pulse * 14, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = base;
      }
      if (lit || s < 1.1) text(LABELS[m.id].name.toUpperCase(), x + 10, y + 18, lit ? P.ink : P.dim);
    }
  }

  function frontLabel(P) {
    const ch = st.focus && geo.channels.find((c) => c.id === st.focus);
    if (!ch || st.T < ch.pts[0].t) return;
    pos(pointAt(ch.pts, Math.min(st.T, ch.pts[ch.pts.length - 1].t)));
    const x = px, y = py;
    if (!onScreen(x, y, x, y, 0)) return;
    const title = (LABELS[ch.label] || LABELS[ch.id] || { name: ch.id }).name.toUpperCase();
    ctx.font = MONO;
    const w = Math.max(ctx.measureText(title).width, ctx.measureText(st.labelSub || '').width);
    const dir = x + 60 + w > vw - 24 ? -1 : 1;
    const lx = x + dir * 30, ly = y - 34;
    ctx.strokeStyle = P.dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + dir * 4, y - 4);
    ctx.lineTo(lx, ly);
    ctx.lineTo(lx + dir * 14, ly);
    ctx.stroke();
    const tx = dir > 0 ? lx + 20 : lx - 20 - w;
    text(title, tx, ly + 4, P.ink);
    if (st.labelSub) text(st.labelSub.toUpperCase(), tx, ly + 19, P.dim);
  }

  function draw(state) {
    st = state;
    s = st.cam.h / vh;
    G = st.globe || null;
    if (G) { gcos = Math.cos(G.tilt); gsin = Math.sin(G.tilt); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);
    base = 1 - 0.8 * st.dim;
    const intro = st.intro ?? 1;
    if (base <= 0.01 || intro <= 0) return;
    ctx.save();
    if (intro < 1) {
      // During the downlink only the rows above the scan line exist yet.
      ctx.beginPath();
      ctx.rect(0, 0, vw, vh * intro * 1.02);
      ctx.clip();
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const P = OVERLAY_BANDS[st.band] || OVERLAY_BANDS[0];
    layer(P, false);
    if (st.lens && st.lens.on) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(st.lens.x, st.lens.y, st.lens.r, 0, TAU);
      ctx.clip();
      ctx.clearRect(0, 0, vw, vh);
      layer(OVERLAY_BANDS[(st.band + 1) % 3], true);
      ctx.restore();
    }
    ctx.globalAlpha = base;
    marks(P);
    frontLabel(P);
    if (G && s > 12) beacon(P);
    ctx.restore();
  }

  // From orbit the whole delta is a few pixels: mark it as one lit point on the planet.
  function beacon(P) {
    pos({ x: G.cx, y: G.cy - 150 });
    const k = Math.min(1, (s - 12) / 30);
    const r = 9 + (st.reduced ? 0 : 3 * Math.sin(st.time * 2.2));
    const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
    g.addColorStop(0, `rgba(${P.front}, ${0.9 * k})`);
    g.addColorStop(0.25, `rgba(${P.front}, ${0.35 * k})`);
    g.addColorStop(1, `rgba(${P.front}, 0)`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
    ctx.globalCompositeOperation = 'source-over';
  }

  return { resize, draw };
}
