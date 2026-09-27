// Coordinated Mars Time. Pure module.
// MSD per Allison & McEwen (2000), as used by NASA GISS Mars24.

const TT_MINUS_UTC = 69.184; // seconds: TAI-UTC (37 s since 2017) + 32.184 s

export function marsSolDate(ms) {
  const jdUT = ms / 86400000 + 2440587.5;
  const jdTT = jdUT + TT_MINUS_UTC / 86400;
  return (jdTT - 2451545.0 - 4.5) / 1.027491252 + 44796.0 - 0.00096;
}

export function marsTime(ms) {
  const msd = marsSolDate(ms);
  const hours = (((msd % 1) + 1) % 1) * 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  const s = Math.floor(((hours - h) * 60 - m) * 60);
  return { sol: Math.floor(msd), h, m, s };
}

const pad = (n) => String(n).padStart(2, '0');

export function formatMars(ms) {
  const r = marsTime(ms);
  return { time: `${pad(r.h)}:${pad(r.m)}:${pad(r.s)}`, sol: r.sol.toLocaleString('en-US') };
}
