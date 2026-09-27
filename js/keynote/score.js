// The object's film: keyframes cued to the words. Pure module.
// A keyframe names a cue (its start, or its end with a trailing ">"), optionally shifted by `offset`
// words, and patches the state. stateAt(P) holds each state, then eases into the next one over the
// next keyframe's `lead` words, so a move lands exactly on its cue.
import { easeInOut, lerp, clamp } from '../timeline.js';

// Every field the stage and the line layers read. Units as in the SDF: the card is 2 × boxW wide,
// the object sits at the origin and the floor at y = -1.35.
export const BASE = {
  // the camera, orbiting its target
  tx: 0, ty: 0, tz: 0, camYaw: 0, camPitch: 0.12, camDist: 9, camFov: 30,
  // on narrow screens, how much closer than usual the camera may come (a tall mirror can fill the band)
  phoneFit: 1,
  // the object
  // spin: how much the object sways in time while the reader pauses (0 holds it still, so every
  // pose is the score's); turns themselves are keyframes on objYaw
  objX: 0, objY: 0, objZ: 0, objYaw: 0, objPitch: 0, objRoll: 0, objScale: 1, spin: 0,
  solid: 0, wBox: 1, wPrism: 0, wSphere: 0,
  boxW: 1.7, boxH: 1.07, boxD: 0.045, boxR: 0.13, prismSide: 1.25, prismDepth: 0.7, sphereR: 1.1,
  layers: 0, layerGap: 0.16, layerHi: -1, layerHiI: 0, layerAll: 0, layerSpan: 0,
  // more forms: the fan of cards, copies along x, the two small prisms
  fan: 0, rep: 1, repGap: 0, sat: 0,
  // The card's face is glass and its rim titanium: the shader splits them by position.
  mGlass: 1, mMetal: 0, mMirror: 0, mDark: 0, fog: 0, edge: 0, rim: 1, mPlanet: 0, backdrop: 0,
  // the light: where it rests, and how far it follows the pen instead (pen), and which pen (penB)
  lightX: 0, lightY: -1.12, lightZ: 0, lightI: 0, lightR: 0.07, warmth: 0.55, pen: 0, penB: 0,
  // stage and post; fieldTurn turns the thousand points (radians a second, the one motion kept in time)
  floor: 1, exposure: 1, bloom: 0.9, fieldTurn: 0,
  // line layers: reveal (0 to 1) and alpha
  draftA: 0, draftAAlpha: 0, draftB: 0, draftBAlpha: 0, blue: 0, blueAlpha: 0, grid: 0,
  // the light breathing (HelpFinity) and settling into the thousand (One more thing)
  breathe: 0, settle: 0,
  // Sibkade: the chain of recommendations, the light waiting at the stack's edge
  chain: 0, chainT: 0, wait: 0, waitT: 0,
  // HelpFinity: marks at the mirror's edges (mix: gathered), the ring, fifty points on it
  marks: 0, marksIn: 0, ring: 0, ringA: 0, ringR: 1, fifty: 0,
  // Barayand: arrows and their resultant, the beams, the judge's two points, the orbit, the two
  // assistants lit in turn (-1 left, 1 right), the radar
  arrows: 0, arrowsA: 0, resultant: 0, resultantA: 0,
  beamIn: 0, beamOut: 0, beamsA: 0, spread: 0, jitter: 0, wave: 0, noticed: 0, missed: 0,
  orbit: 0, satHi: 0, radar: 0, radarP: 0, radarA: 0,
  // Playground: the six lights (out of the light, gathered back, which one is in focus), the saves,
  // the sheets' writing, the tree of life, the benchmark grid and the race
  // (sixDim dims the lights not in focus; sixHold hides the one in focus while its form stands there)
  six: 0, sixOut: 0, sixIn: 0, sixFocus: 0, sixDim: 0, sixHold: 0, saves: 0, saveBack: 0, sheetText: 0,
  lineage: 0, branches: 0, treeA: 0, tips: 0, bench: 0, benchA: 0, race: 0, raceT: 0,
  // About: five beams become one; One more thing: the thousand
  conf: 0, confOut: 0, confA: 0, field: 0, fieldA: 0,
};

export const SCORE = [
  // Title card: the light alone, resting just above the floor.
  { at: 'top', lightI: 0.85 },
  // Cold open: it brightens and the camera eases in.
  { at: 'open', lightI: 1.25, camDist: 8.4, ty: 0.1, lead: 10 },
  { at: 'open-six', camDist: 7.6, lightY: -0.7, lead: 8 },
  { at: 'open-early', camDist: 7, lightY: -0.25, lead: 8 },
  // IranSpoti: the light becomes a pen and sketches a card inside a square post.
  { at: 'i1', pen: 1, draftAAlpha: 1, lightI: 1, lightR: 0.05, camDist: 13, camYaw: -0.22, camPitch: 0.16, ty: 0, lead: 8 },
  { at: 'i1>', draftA: 1, lead: 14 },
  // "A year of trial and error": the sketch fades while a corrected draft is drawn over it.
  { at: 'i1-trial', draftAAlpha: 0.28, draftBAlpha: 1, penB: 1, lead: 3 },
  { at: 'i1-trial>', draftB: 1, draftAAlpha: 0, lead: 8 },
  // "It became the plan for one": dimensions and a grid turn the draft into a blueprint, and the
  // light settles into the middle of the card.
  { at: 'i2', blueAlpha: 1, blue: 0.35, pen: 0, lightX: 0, lightY: 0, lightZ: 0, lead: 6 },
  { at: 'i2-plan', blue: 1, grid: 1, camYaw: 0.12, camPitch: 0.22, lead: 6 },
  { at: 'i2-plan>', camYaw: 0.26, camDist: 12.5, lead: 10 },
  // Sibkade: the plan fills with material, titanium and glass, with the light inside it.
  { at: 's1-intro', solid: 1, edge: 0.7, blueAlpha: 0.3, grid: 0.25, draftBAlpha: 0.4, lightI: 1.15, lightR: 0.085, lead: 9 },
  { at: 's1', edge: 0, blueAlpha: 0, grid: 0, draftBAlpha: 0, camYaw: 0, camPitch: 0.1, objYaw: -0.42, objPitch: 0.1, spin: 0.05, lead: 8 },
  { at: 's1>', camDist: 12, lead: 12 },
  // S2 "Getting the business started": a macro pass along the card's edge. The card holds still, the
  // camera comes close to its right edge and travels down it.
  { at: 's2', spin: 0, objYaw: -0.5, objPitch: 0, camDist: 4.6, camYaw: 0.42, camPitch: 0.04, tx: 1.49, ty: 0.5, tz: 0.815, lead: 10 },
  { at: 's2>', offset: 30, ty: -0.45, camYaw: 0.55, lead: 30 },
  // S3 "Ten thousand a year": the card fans out into a flowing stack, then gathers back into one.
  { at: 's3', camDist: 16, camYaw: 0, camPitch: 0.16, tx: 0.45, ty: -0.15, tz: 0, objYaw: -0.3, fan: 1, lead: 10 },
  { at: 's3>', offset: 14, fan: 0, tx: 0, camDist: 13.5, spin: 0.05, lead: 14 },
  // S4: the code appears on the card in a single frame (the demo); for the VIP tier the card turns black.
  { at: 's4', objYaw: -0.28, camDist: 11, ty: 0, lead: 8 },
  { at: 's4-instant', spin: 0, objYaw: -0.22, lead: 4 },
  { at: 's4-vip', mGlass: 0, mDark: 1, lightZ: 0.6, lightY: 0.12, lead: 6 },
  // S5: glass again. "Someone they trust recommended us": the card fans out, and a small light passes
  // from card to card along the chain.
  { at: 's5', mGlass: 1, mDark: 0, lightZ: 0, lightY: 0, spin: 0.05, lead: 6 },
  { at: 's5-trust', fan: 1, chain: 1, chainT: 0, spin: 0, objYaw: -0.25, camDist: 16, camPitch: 0.16, tx: 0.45, lead: 6 },
  { at: 's5-name', chainT: 1, lead: 17 },
  { at: 's5-name>', fan: 0, chain: 0, camDist: 12, camPitch: 0.1, tx: 0, spin: 0.04, lead: 6 },
  // S6: the card opens into an exploded view of twelve layers as the numbers count.
  { at: 's6', spin: 0, camYaw: 0.75, camPitch: 0.32, camDist: 12.5, objYaw: -0.35, layers: 0.15, lead: 10 },
  { at: 's6-systems', layers: 0.45 },
  { at: 's6-weeks', layers: 0.6 },
  { at: 's6-code', layers: 0.8 },
  { at: 's6-tests', layers: 1 },
  { at: 's6-live', layerAll: 0.55, lead: 4 },
  // S7: each of the four questions lights one layer.
  { at: 's7-code', layerAll: 0.08, layerHiI: 1, layerHi: 10 },
  { at: 's7-pay', layerHi: 7 },
  { at: 's7-login', layerHi: 4 },
  { at: 's7-reply', layerHi: 1 },
  // S8: the lowest layers light.
  { at: 's8', layerHi: 0.5, layerSpan: 1.5, layerHiI: 1.1, camPitch: 0.05, ty: -0.4 },
  // S9: the support desk, orbiting.
  { at: 's9', layerHi: 6, layerSpan: 1, camYaw: 0.95, camPitch: 0.2, ty: -0.1 },
  { at: 's9-context', camYaw: 1.1 },
  // S10: a small light waits at the edge of the stack, then passes.
  { at: 's10', wait: 1, waitT: 0.5, layerHiI: 0.4, lead: 10 },
  { at: 's10>', waitT: 1, lead: 4 },
  // S11: the layers close back into one card.
  { at: 's11', layerHi: -1, layerHiI: 0, layerAll: 0, layerSpan: 0, wait: 0, layers: 0.5, camYaw: 0.4, ty: -0.1, lead: 8 },
  { at: 's11-zero', layers: 0.2 },
  { at: 's11-measured', layers: 0, camYaw: 0, camPitch: 0.1, ty: 0, objYaw: -0.3, spin: 0.04, lead: 8 },
  // H1 HelpFinity: the card stands upright, grows into a tall pane and its face turns to mirror; the
  // light comes out in front of it.
  { at: 'h1', spin: 0, boxW: 0.95, boxH: 1.95, boxD: 0.05, boxR: 0.16, objYaw: 0.35, objPitch: 0, objY: 0.7, mGlass: 0, mMirror: 1,
    camDist: 13.5, camYaw: 0, camPitch: 0.1, ty: 0.6, lightX: 0.9, lightY: 0.9, lightZ: 1.4, lead: 12 },
  // "Almost never in their own": the light sees itself in the mirror.
  { at: 'h1-own', lightX: 0.45, lightZ: 1.1, objYaw: 0.25, camYaw: -0.1, lightI: 1.4, lead: 8 },
  // "Breathing exercises": the light breathes, on a four-second cycle.
  { at: 'h1-breath', breathe: 1, lead: 4 },
  // H2: the mirror fogs over.
  { at: 'h2', breathe: 0, fog: 0.3, lightI: 1.1 },
  { at: 'h2-first', fog: 0.7 },
  { at: 'h2-proto', fog: 1 },
  // H3 Mind Mirror: the fog clears and the mirror shrinks to a phone, facing us; the demo runs on it.
  { at: 'h3', fog: 0, boxW: 0.5, boxH: 1.03, boxD: 0.04, boxR: 0.2, objYaw: 0, objY: 0, camYaw: 0, camPitch: 0.06, camDist: 6.4, ty: 0,
    lightX: -0.95, lightY: 0.95, lightZ: 1.1, lightI: 0.9, phoneFit: 0.55, lead: 10 },
  // "Over time": marks gather at the mirror's edges.
  { at: 'h3-time', marks: 1, marksIn: 1, lead: 4 },
  // "Deliberately not therapy": a thin ring closes around the mirror.
  { at: 'h3-not', ring: 1, ringA: 1, ringR: 1, camDist: 7.6, lead: 6 },
  // "Fifty people": fifty points on the ring.
  { at: 'h3-fifty', fifty: 1, lead: 5 },
  // B1 Barayand: while "Introducing" holds (Mind Mirror has left the glass), the ring and the marks go and
  // the mirror folds into a triangular glass prism with the light inside. The prism holds still from here
  // on: the beams live in its plane.
  { at: 'b1-intro>', phoneFit: 1, ring: 0, marks: 0, marksIn: 0, fifty: 0, wBox: 0, wPrism: 1, mMirror: 0, mGlass: 1, edge: 0.22, objYaw: 0.3, objPitch: 0,
    camYaw: 0.2, camPitch: 0.1, camDist: 12, ty: 0.25, lightX: 0, lightY: 0.15, lightZ: 0, lightI: 1.2, lead: 10 },
  // "A resultant": five arrows add tip to tail, and a white one closes the shape.
  { at: 'b1-resultant', arrows: 1, arrowsA: 1, resultantA: 1, lead: 3 },
  { at: 'b1-resultant>', resultant: 1, lead: 5 },
  // "You send a question": the arrows undraw and a white beam enters the prism.
  { at: 'b1-ask', arrows: 0, resultant: 0, beamsA: 1, beamIn: 1, lead: 6 },
  // "A panel": it splits into five colours (Newton's first prism).
  { at: 'b1-panel', beamOut: 1, spread: 0.6, lead: 5 },
  // The judge: where they agree (they overlap), where they diverge (they spread), what only one of them
  // noticed (one beam lights a point the others pass), what all of them missed (a dark point, circled).
  { at: 'b1-agree', spread: 0.15 },
  { at: 'b1-diverge', spread: 1 },
  { at: 'b1-one', noticed: 1 },
  { at: 'b1-missed', missed: 1, noticed: 0.3 },
  // "One grounded answer": the five recombine into one white beam.
  { at: 'b1-answer', spread: 0, missed: 0, noticed: 0, lightI: 1.5, lead: 6 },
  // B2: every model is confidently wrong sometimes, so the beams jitter; then the jitter locks into one
  // coherent wave.
  { at: 'b2', spread: 0.7, jitter: 1, lightI: 1.2 },
  { at: 'b2-noise', jitter: 0.6 },
  { at: 'b2-signal', jitter: 0, wave: 1, spread: 0.2, lead: 6 },
  // B3: the beams undraw; seven small lights orbit the prism; two small prisms settle on top, and each
  // assistant lights in turn.
  { at: 'b3', beamOut: 0, beamIn: 0, wave: 0, spread: 0, camDist: 12.5, camPitch: 0.18, lead: 5 },
  { at: 'b3', offset: 6, beamsA: 0, lead: 4 },
  { at: 'b3-summer', orbit: 1 },
  { at: 'b3-two', sat: 1, orbit: 0.5, lead: 6 },
  { at: 'b3-hambonyan', satHi: -1 },
  { at: 'b3-hamfekr', satHi: 1 },
  // B4: ten axes open around the prism like a radar chart; a shared yardstick.
  { at: 'b4-axes', orbit: 0, satHi: 0, radar: 1, radarA: 1, lead: 4 },
  { at: 'b4-yard', radarP: 1 },
  // B5: the prism alone in the light.
  { at: 'b5', radar: 0, radarP: 0, sat: 0, lightI: 1.3, camDist: 11 },
  { at: 'b5', offset: 4, radarA: 0, lead: 4 },
  // P0 Playground: the prism shrinks into the light, and six small lights come out of it and line up
  // above the floor.
  { at: 'p0', objScale: 0.15, solid: 0, edge: 0, six: 1, sixOut: 0, lightI: 0.8, lead: 10 },
  { at: 'p0-none', sixOut: 1, camDist: 20, tx: 0.6, ty: -0.45, camYaw: 0, camPitch: 0.14, lightX: 1.1, lightY: -0.85, lightI: 0.3, lead: 5 },
  // P1 Bargasht: the camera travels to the first light; the saves fall into it; one comes back out.
  { at: 'p1', tx: -5.5, ty: -0.45, camDist: 9, camPitch: 0.1, lightX: -5.5, objX: -5.5, objY: -0.85, objScale: 1, sixFocus: 0, sixDim: 1, lead: 10 },
  { at: 'p1-return', saves: 1, lead: 20 },
  { at: 'p1-return>', saveBack: 1, lead: 5 },
  // P2 ApplyBot: two glass sheets bloom from the second light, separate, and write themselves line by line.
  { at: 'p2', saves: 0, saveBack: 0, tx: -3.3, lightX: -3.3, sixFocus: 1, objX: -3.3, objY: -0.2, objYaw: 0, objScale: 1, solid: 1,
    wPrism: 0, wBox: 1, mGlass: 1, rim: 0, rep: 2, repGap: 0, boxW: 0.62, boxH: 0.88, boxD: 0.02, boxR: 0.05, lead: 10 },
  { at: 'p2>', repGap: 1.56, lead: 8 },
  { at: 'p2-first', sheetText: 1, lead: 27 },
  { at: 'p2-first>', objScale: 0.15, solid: 0, repGap: 0, sheetText: 0, lead: 6 },
  // P3 Apsis: the light becomes Mars.
  { at: 'p3', rep: 1, tx: -1.1, lightX: -1.1, lightI: 0.05, sixFocus: 2, sixHold: 1, objX: -1.1, objY: -0.1, wBox: 0, wSphere: 1,
    sphereR: 1, mGlass: 0, mPlanet: 1, rim: 1, objScale: 1, solid: 1, lead: 10 },
  { at: 'p3-time>', objScale: 0.15, solid: 0, sixHold: 0, lightI: 0.3, lead: 6 },
  // P4 The Descent: branches merge into one glowing dot; 3.8 billion years back to the root; then the
  // camera pulls back and it is one lit tip among millions.
  { at: 'p4', tx: 1.1, ty: -0.3, camDist: 7, lightX: 1.1, sixFocus: 3, objX: 1.1, objY: -0.85, objScale: 1, lineage: 0.4, branches: 0.2, treeA: 1, lead: 10 },
  { at: 'p4-years', lineage: 1, branches: 0.6, ty: 0.9, camDist: 9.5, tx: 1.6, lead: 8 },
  { at: 'p4-tip', branches: 1, tips: 1, camDist: 15, ty: 0.7, tx: 1.1, lead: 10 },
  { at: 'p4-tip>', lineage: 0, branches: 0, tips: 0, camDist: 9, ty: -0.3, lead: 8 },
  // P5 Persian LLM Eval: a 10 × 30 grid lights row by row; on one row a small light overtakes a large one.
  { at: 'p5', treeA: 0, tx: 3.3, ty: 0, camDist: 10.5, lightX: 3.3, sixFocus: 4, objX: 3.3, objY: 0.1, objScale: 0.9, benchA: 1, bench: 0.1, lead: 10 },
  { at: 'p5-items', bench: 0.5 },
  { at: 'p5-tracks', bench: 1 },
  { at: 'p5-lost', race: 1, raceT: 0, lead: 3 },
  { at: 'p5-lost>', raceT: 1, lead: 9 },
  { at: 'p5-lost>', offset: 6, bench: 0, race: 0, lead: 6 },
  { at: 'p5-lost>', offset: 9, objScale: 0.15, benchA: 0, camDist: 9, lead: 3 },
  // P6 the plugins: while the title holds, the camera travels to the last light and three glass tiles
  // bloom from it; the third bends the stage behind it.
  { at: 'p6>', tx: 5.5, lightX: 5.5, sixFocus: 5, objX: 5.5, objY: 0, wSphere: 0, mPlanet: 0, wBox: 1, mGlass: 1,
    rim: 0, rep: 3, repGap: 0, boxW: 0.5, boxH: 0.5, boxD: 0.1, boxR: 0.2, objScale: 1, solid: 1, lead: 12 },
  { at: 'p6-venture', repGap: 1.3, lead: 5 },
  { at: 'p6-glass', backdrop: 1, camDist: 8.4, tx: 5.8, lead: 6 },
  // A0 About: the tiles collapse into their light, and the six lights gather back into one.
  { at: 'a0', sixIn: 1, sixDim: 0, backdrop: 0, repGap: 0, objScale: 0.15, solid: 0, tx: 0, ty: 1.1, camDist: 14, camYaw: 0,
    camPitch: 0.1, lightX: 0, lightY: -0.6, lightZ: 0, lightI: 1.2, lead: 10 },
  { at: 'a0>', six: 0, rep: 1, objX: 0, objY: -0.6, objScale: 1, lead: 6 },
  // A1 "Disagreement between models is signal": five beams become one.
  { at: 'a1', confA: 1, conf: 1, lead: 6 },
  { at: 'a1>', confOut: 1, lead: 5 },
  // A2 "Restraint builds trust": the Mind Mirror ring, then the Apsis planet.
  { at: 'a2', conf: 0, confOut: 0, lead: 5 },
  { at: 'a2-bot', confA: 0, ring: 1, ringA: 1, ringR: 0.45, lead: 4 },
  { at: 'a2-clock', ring: 0, wBox: 0, wSphere: 1, mPlanet: 1, mGlass: 0, sphereR: 0.5, solid: 1, lightI: 0.1, lead: 4 },
  // A3 "Measure it, or you don't know it": the 300 points, and the small light overtakes again.
  { at: 'a3', ringA: 0, sphereR: 0.05, solid: 0, lightI: 0.6, objY: -0.5, objScale: 0.8, bench: 1, benchA: 0.5, lead: 6 },
  { at: 'a3-worse', race: 1, raceT: 0, lead: 3 },
  { at: 'a3-worse>', raceT: 1, lead: 8 },
  // A4 the timeline, A5, A6 the tech specs: the light rests low and dims.
  { at: 'a4', bench: 0, race: 0, mPlanet: 0, sphereR: 1, objScale: 1, lightI: 0.6, lightY: -1.12, ty: 0.4, lead: 6 },
  { at: 'a4', offset: 8, benchA: 0, lead: 4 },
  { at: 'a5', lightI: 0.9 },
  { at: 'a6', lightI: 0.35 },
  // F1 One more thing: the stage empties and only the light remains.
  { at: 'f1', lightI: 1.4, lightX: 0, lightY: -0.7, camDist: 8, tx: 0, ty: 0, camYaw: 0, camPitch: 0.1, lead: 10 },
  // F2: a thousand faint points appear, one per signature. The light stays apart, then drifts into the
  // field and settles as one of the thousand.
  { at: 'f2-thousand', fieldA: 1, objX: 0, objY: 1.15, camDist: 11, ty: 1.05, lightI: 1.2, lead: 6 },
  { at: 'f2-killjoys', field: 1, lightX: -3.6, lightY: 1.4, lead: 20 },
  { at: 'f2-one>', settle: 1, lead: 14 },
  // T1 Thank you: the field turns very slowly.
  { at: 't1', fieldTurn: 0.03, camDist: 12, lead: 8 },
];

// Keyframes → absolute positions and full states, checked against the page's cues.
export function resolveScore(score, track, base = BASE) {
  let state = { ...base };
  const frames = [{ p: 0, lead: 0, state }];
  for (const k of score) {
    const end = k.at.endsWith('>');
    const id = end ? k.at.slice(0, -1) : k.at;
    const cue = track.cue(id);
    if (!cue) throw new Error(`score: unknown cue "${id}"`);
    const { at, lead = 4, offset = 0, ...patch } = k;
    for (const key of Object.keys(patch)) if (!(key in base)) throw new Error(`score: unknown field "${key}"`);
    const p = (end ? cue.end : cue.start) + offset;
    if (p < frames[frames.length - 1].p) throw new Error(`score: "${at}" comes before the keyframe above it`);
    state = { ...state, ...patch };
    frames.push({ p, lead, state });
  }
  return frames;
}

export function stateAt(frames, P) {
  let i = frames.length - 1;
  while (i > 0 && frames[i].p > P) i--;
  const a = frames[i];
  const b = frames[i + 1];
  if (!b) return a.state;
  const t0 = Math.max(a.p, b.p - b.lead);
  if (P <= t0) return a.state;
  const t = easeInOut(clamp((P - t0) / (b.p - t0), 0, 1));
  const out = {};
  for (const key in b.state) out[key] = lerp(a.state[key], b.state[key], t);
  return out;
}

// The state as it stands at the last keyframe reached. Reduced motion shows this, so the object
// changes only when a cue lands instead of moving with the scroll.
export function snapAt(frames, P) {
  let i = frames.length - 1;
  while (i > 0 && frames[i].p > P) i--;
  return frames[i].state;
}

