// Scroll → story state: measures the .step elements and turns scroll position into T and a camera.
import { SCENES, GLOBE } from './story.js';
import { channelById, pointAt } from './delta.js';
import { locate, scrollForT, mixCam, lerp, smoothstep, easeInOut, clamp } from './timeline.js';

const byId = Object.fromEntries(SCENES.map((s) => [s.id, s]));

export function createScenes({ geo }) {
  const els = [...document.querySelectorAll('.step')];
  let steps = [];
  let active = null;

  function measure() {
    // Read every panel height first, then write, so layout is computed once rather than per step.
    const heights = els.map((el) => el.querySelector(':scope > .panel')?.offsetHeight);
    els.forEach((el, i) => { if (heights[i] !== undefined) el.style.setProperty('--h', `${heights[i]}px`); });
    const y = scrollY;
    steps = els.map((el) => {
      const r = el.getBoundingClientRect();
      const sceneEl = el.closest('[data-scene]');
      return {
        el, top: r.top + y, height: Math.max(1, r.height),
        t0: +el.dataset.t0, t1: +el.dataset.t1, shot: el.dataset.shot,
        side: el.dataset.side || 'left', scene: sceneEl ? sceneEl.dataset.scene : null,
      };
    });
  }

  const clampToChannel = (pts, T) => clamp(T, pts[0].t, pts[pts.length - 1].t);
  const front = (id, T) => { const pts = channelById(geo, id).pts; return pointAt(pts, clampToChannel(pts, T)); };
  const middle = (id, T) => { const pts = channelById(geo, id).pts; return pointAt(pts, lerp(pts[0].t, clampToChannel(pts, T), 0.5)); };

  // Keep a minimum world width visible on narrow screens.
  const fit = (h, minWidth, vw, vh) => Math.max(h, (minWidth * vh) / vw);

  function overview(vw, vh) {
    const h = fit(1900, 1500, vw, vh);
    // On wide screens the title sits bottom-left, so the delta moves right of centre.
    return { x: vw >= 900 ? -0.14 * vw * (h / vh) : 0, y: 1230, h };
  }

  function offset(c, side, vw, vh) {
    const s = c.h / vh;
    if (vw >= 900) return { x: c.x + (side === 'left' ? -1 : 1) * 0.17 * vw * s, y: c.y, h: c.h };
    return { x: c.x, y: c.y + 0.16 * c.h, h: c.h };
  }

  const groundCam = (vw, vh) => ({ x: 0, y: 2420, h: fit(1700, 1300, vw, vh) });
  const orbitH = (vw, vh) => fit(GLOBE.R * 1.6, GLOBE.R * 2.15, vw, vh);

  const tiltAt = (z) => GLOBE.tilt * smoothstep(0.35, 1, z);
  const zFor = (h, vw, vh) => {
    const h0 = groundCam(vw, vh).h, h1 = orbitH(vw, vh);
    return clamp((Math.log(h) - Math.log(h0)) / (Math.log(h1) - Math.log(h0)), 0, 1);
  };

  // From the calm sea to orbit in one move, steered by where the delta sits on screen (yD, as a
  // fraction of the height): it first slides down to the middle while the whole delta comes into
  // view, then, as it shrinks, the horizon descends from the top and settles just above it.
  function globeCam(z, vw, vh) {
    const g = groundCam(vw, vh);
    const h1 = orbitH(vw, vh);
    const h = Math.exp(lerp(Math.log(g.h), Math.log(h1), z));
    const yD0 = 0.5 + (GLOBE.cy - g.y) / g.h;
    const yD1 = 0.68 + (GLOBE.R / h1) * (1 - Math.sin(GLOBE.tilt)); // the limb's top ends at 68%
    const yD = z < 0.3 ? lerp(yD0, 0.45, smoothstep(0, 0.3, z)) : lerp(0.45, yD1, smoothstep(0.3, 1, z));
    const sy = yD + (GLOBE.R / h) * Math.sin(tiltAt(z)); // the planet's centre, below the tilted delta
    return { x: 0, y: GLOBE.cy - (sy - 0.5) * h, h };
  }

  const oxbow = geo.oxbow.pts.reduce((a, p) => ({ x: a.x + p.x / geo.oxbow.pts.length, y: a.y + p.y / geo.oxbow.pts.length }), { x: 0, y: 0 });

  function sceneCam(scene, T, side, vw, vh) {
    if (scene.focus === 'front') return offset({ x: 20, y: 1610, h: fit(scene.zoom, 1350, vw, vh) }, side, vw, vh);
    const f = front(scene.focus, T), m = middle(scene.focus, T);
    const h = fit(scene.zoom, scene.zoom * 0.75, vw, vh);
    let x = lerp(f.x, m.x, scene.frame), y = lerp(f.y, m.y, scene.frame);
    if (scene.id === 'iranspoti') {
      // As the cutoff nears, frame the gooseneck so the viewer sees it close.
      const k = smoothstep(0.05, 0.1, T) * 0.85;
      x = lerp(x, oxbow.x, k);
      y = lerp(y, oxbow.y, k);
    }
    return offset({ x, y: y + h * 0.06, h }, side, vw, vh);
  }

  function setActive(step, p) {
    if (active !== step) {
      if (active) active.el.classList.remove('is-active');
      step.el.classList.add('is-active');
      active = step;
    }
  }

  function target(vw, vh) {
    const hit = locate(steps, scrollY + vh * 0.5);
    if (!hit) return { cam: overview(vw, vh), T: 1, dim: 0, focus: null, focusPoint: null, scene: null, step: null, p: 0 };
    const { step, p, T } = hit;
    setActive(step, p);
    let cam, z, dim = 0, focus = null, focusPoint = null;
    const scene = step.scene ? byId[step.scene] : null;
    switch (step.shot) {
      case 'hero':
        cam = overview(vw, vh);
        focusPoint = { x: 0, y: 1350 };
        break;
      case 'rewind':
        cam = mixCam(overview(vw, vh), sceneCam(byId.iranspoti, 0, 'left', vw, vh), easeInOut(p));
        break;
      case 'follow':
      case 'front':
        cam = sceneCam(scene, T, step.side, vw, vh);
        focus = scene.focus === 'front' ? null : scene.focus;
        focusPoint = focus ? front(focus, T) : { x: cam.x, y: cam.y };
        break;
      case 'ground':
        // Out over the calm sea: only the delta front shows at the top edge.
        z = 0;
        dim = 0.55;
        break;
      case 'finale':
        z = smoothstep(0, 0.66, p);
        dim = lerp(0.55, 0.12, smoothstep(0, 0.25, p));
        break;
      case 'uplink':
        z = 1;
        dim = 0.3;
        break;
      default:
        cam = overview(vw, vh);
    }
    if (z !== undefined) cam = globeCam(z, vw, vh);
    return { cam, z, T, dim, focus, focusPoint, scene, step, p };
  }

  function scrollToT(T) {
    window.scrollTo({ top: scrollForT(steps, T, innerHeight * 0.5), behavior: 'instant' });
  }

  return { measure, target, scrollToT, globeCam, zFor, tiltAt, steps: () => steps };
}
