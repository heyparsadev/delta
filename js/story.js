// The story of the pass, as data. Pure module: safe to import in Node.
// Story time T runs from 0 (the source, January 2019) to 1 (the sea, September 2026).

export const SEED = 20190101;

// Calendar anchors; months are interpolated linearly between them.
export const ANCHORS = [
  { t: 0, year: 2019, month: 1 },
  { t: 0.12, year: 2020, month: 1 },
  { t: 0.38, year: 2023, month: 1 },
  { t: 0.5, year: 2025, month: 10 },
  { t: 0.55, year: 2026, month: 1 },
  { t: 0.72, year: 2026, month: 6 },
  { t: 1, year: 2026, month: 9 },
];

// Moments that shape the river.
export const TIMES = {
  cutoff: 0.115, // IranSpoti's last meander is cut off; the river continues as Sibkade
  stem: [0.115, 0.9], // Sibkade from the cutoff to the sea
  apex: 0.38, // HelpFinity splits off
  helpfinityEnd: 0.5, // HelpFinity dries
  coda: [0.55, 0.575], // Mind Mirror: water returns to the old channel
  barayand: 0.72, // Barayand splits off
  braid: [0.745, 0.8], // five threads, then one
  barayandCoast: 0.84, // Barayand reaches the sea
  barayandTip: 0.92, // and keeps building its lobe
  lobe: [0.83, 0.92],
};

// The planet under the map: it touches the map at the middle of the delta. From orbit, the finale
// tilts it so the delta rides up toward the lit limb.
export const GLOBE = { cx: 0, cy: 1500, R: 60000, tilt: 1.1 };

// Camera per scene: `focus` is the channel the camera follows, `zoom` the visible world height,
// `frame` how far the camera leans from the growth front toward the channel's middle.
export const SCENES = [
  { id: 'iranspoti', n: 1, name: 'IranSpoti', t0: 0, t1: 0.12, focus: 'iranspoti', zoom: 560, frame: 0.35 },
  { id: 'sibkade', n: 2, name: 'Sibkade', t0: 0.12, t1: 0.38, focus: 'sibkade', zoom: 760, frame: 0 },
  { id: 'helpfinity', n: 3, name: 'HelpFinity', t0: 0.38, t1: 0.58, focus: 'helpfinity', zoom: 900, frame: 0.55 },
  { id: 'sibkade-2026', n: 4, name: 'Sibkade', t0: 0.58, t1: 0.72, focus: 'sibkade', zoom: 820, frame: 0 },
  { id: 'barayand', n: 5, name: 'Barayand', t0: 0.72, t1: 0.86, focus: 'barayand', zoom: 780, frame: 0.35 },
  { id: 'playground', n: 6, name: 'Playground', t0: 0.86, t1: 1, focus: 'front', zoom: 1300, frame: 1 },
];

export function sceneAt(T) {
  return SCENES.find((s) => T >= s.t0 && T < s.t1) || SCENES[SCENES.length - 1];
}

// Gauge stations on the main stem, one per Sibkade sub-section.
export const STATIONS = [
  { id: 'S1', t: 0.205, name: 'Getting the business started' },
  { id: 'S2', t: 0.295, name: 'Making the experience worth recommending' },
  { id: 'S3', t: 0.585, name: 'Staying close to the product' },
  { id: 'S4', t: 0.635, name: 'Giving the team better support tools' },
  { id: 'S5', t: 0.68, name: 'Understanding the business as it grows' },
];

// Weekend projects: distributaries at the delta front. `at` is the parent's story time at the
// branch point; `mouthX` where each one meets the sea.
export const PROJECTS = [
  { id: 'bargasht', name: 'Bargasht', meta: '2026 · live', parent: 'barayand', at: 0.815, mouthX: 140, t0: 0.895, t1: 0.925 },
  { id: 'applybot', name: 'ApplyBot', meta: '2026', parent: 'sibkade', at: 0.6, mouthX: -470, t0: 0.905, t1: 0.93 },
  { id: 'apsis', name: 'Apsis', meta: '2026 · iOS', parent: 'sibkade', at: 0.65, mouthX: -350, t0: 0.93, t1: 0.955 },
  { id: 'the-descent', name: 'The Descent', meta: '2026 · web', parent: 'sibkade', at: 0.7, mouthX: -225, t0: 0.94, t1: 0.965 },
  { id: 'persian-llm-eval', name: 'Persian LLM Eval', meta: '2026 · open source', parent: 'barayand', at: 0.81, mouthX: 410, t0: 0.965, t1: 0.98 },
  { id: 'claude-code-plugins', name: 'Claude Code plugins', meta: '2026 · open source', parent: 'barayand', at: 0.728, mouthX: 500, t0: 0.9825, t1: 1 },
];

// Hover labels for story channels (projects add theirs from PROJECTS).
export const LABELS = {
  iranspoti: { name: 'IranSpoti', meta: 'Founder · 2019–2020', scene: 'iranspoti' },
  oxbow: { name: 'Oxbow lake', meta: 'IranSpoti · cut off 2020', scene: 'iranspoti' },
  sibkade: { name: 'Sibkade', meta: 'Founder & CEO · 2020–present', scene: 'sibkade' },
  helpfinity: { name: 'HelpFinity', meta: 'Founder · 2023–2025', scene: 'helpfinity' },
  mindmirror: { name: 'Mind Mirror', meta: 'Coda · 2026', scene: 'helpfinity', anchor: 'mind-mirror' },
  barayand: { name: 'Barayand', meta: 'Founder · 2026–present', scene: 'barayand' },
  braid: { name: 'Barayand', meta: 'Panel → judge → one answer', scene: 'barayand' },
};
for (const p of PROJECTS) LABELS[p.id] = { name: p.name, meta: p.meta, scene: 'playground', anchor: p.id };
