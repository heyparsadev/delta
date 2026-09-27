// Seeded randomness and 1-D noise. Pure module.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rangeOf = (rand, a, b) => a + (b - a) * rand();

const SIZE = 512;

// Smooth value noise on a seeded lattice, in [-1, 1].
export function noise1(seed) {
  const rand = mulberry32(seed);
  const lattice = new Float64Array(SIZE);
  for (let i = 0; i < SIZE; i++) lattice[i] = rand() * 2 - 1;
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = lattice[((i % SIZE) + SIZE) % SIZE];
    const b = lattice[(((i + 1) % SIZE) + SIZE) % SIZE];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

// Fractal sum of noise1 octaves, normalised back to [-1, 1].
export function fbm1(seed, octaves = 4) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(noise1(seed + o * 101));
  return (x) => {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * layers[o](x * freq + o * 17.3);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };
}
