// Time and camera math. Pure module.
import { ANCHORS } from './story.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export function smoothstep(a, b, x) {
  const t = clamp(invLerp(a, b, x), 0, 1);
  return t * t * (3 - 2 * t);
}
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthIndex = (a) => a.year * 12 + (a.month - 1);

export function calendar(T) {
  const t = clamp(T, 0, 1);
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i], b = ANCHORS[i + 1];
    if (t <= b.t) {
      const m = Math.round(lerp(monthIndex(a), monthIndex(b), invLerp(a.t, b.t, t)));
      return { year: Math.floor(m / 12), month: (m % 12) + 1 };
    }
  }
  const z = ANCHORS[ANCHORS.length - 1];
  return { year: z.year, month: z.month };
}

export function calendarLabel(T) {
  const c = calendar(T);
  return `${MONTHS[c.month - 1]} ${c.year}`;
}

export function tForMonth(year, month) {
  const target = year * 12 + (month - 1);
  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const a = ANCHORS[i], b = ANCHORS[i + 1];
    const ma = monthIndex(a), mb = monthIndex(b);
    if (target >= ma && target <= mb) return lerp(a.t, b.t, invLerp(ma, mb, target));
  }
  return target < monthIndex(ANCHORS[0]) ? 0 : 1;
}

// steps: [{ top, height, t0, t1, ... }] in document order.
export function locate(steps, probeY) {
  if (!steps.length) return null;
  let index = steps.length - 1;
  for (let i = 0; i < steps.length; i++) {
    if (probeY < steps[i].top + steps[i].height) { index = i; break; }
  }
  const step = steps[index];
  const p = clamp((probeY - step.top) / step.height, 0, 1);
  return { index, step, p, T: lerp(step.t0, step.t1, p) };
}

// Scroll position that puts story time T on the probe line, using forward (t1 > t0) steps only.
export function scrollForT(steps, T, probeOffset) {
  const forward = steps.filter((s) => s.t1 > s.t0);
  if (!forward.length) return 0;
  const t = clamp(T, forward[0].t0, forward[forward.length - 1].t1);
  const step = forward.find((s) => t >= s.t0 && t <= s.t1) || forward[forward.length - 1];
  return step.top + invLerp(step.t0, step.t1, t) * step.height - probeOffset;
}

export function mixCam(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: Math.exp(lerp(Math.log(a.h), Math.log(b.h), t)) };
}

// Critically damped spring, exact step. Returns [position, velocity].
export function spring(x, v, target, dt, omega) {
  const d = x - target;
  const e = Math.exp(-omega * dt);
  const nx = (d + (v + omega * d) * dt) * e;
  const nv = (v - omega * (v + omega * d) * dt) * e;
  return [target + nx, nv];
}
