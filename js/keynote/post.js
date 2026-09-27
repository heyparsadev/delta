// GLSL for the post passes: a bright pass into the bloom buffer, a separable blur, and the composite.
// The scene buffer stores colour tone-compressed (c / (1 + c)); dec() undoes it, capped so that one
// saturated pixel cannot blow up the bloom.
const DEC = 'vec3 dec(vec3 c) { return c / max(vec3(0.08), 1.0 - c); }';
// The history is stored as a square root, which gives the dark end sixteen times the precision: in 8 bits a
// plain history gets stuck one step above black, and the tone curve makes that step visible.
const HIST = 'vec3 hist(vec3 e) { return e * e; }';

export const BRIGHT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
${DEC}
${HIST}
void main() {
  vec3 c = dec(hist(texture2D(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb))
         + dec(hist(texture2D(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb))
         + dec(hist(texture2D(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb))
         + dec(hist(texture2D(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb));
  vec3 b = max(c * 0.25 - 1.1, 0.0);
  gl_FragColor = vec4(b / (1.0 + b), 1.0);
}`;

export const BLUR = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb * 0.227027;
  c += texture2D(uTex, vUv + uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(uTex, vUv - uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(uTex, vUv + uDir * 3.2307692).rgb * 0.0702703;
  c += texture2D(uTex, vUv - uDir * 3.2307692).rgb * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

// Temporal anti-aliasing: the new (jittered) frame blends into the history, and the history is first
// clamped to the new frame's neighbourhood, so what moves does not smear. The buffers stay
// tone-compressed, which also tames fireflies; half a step of changing noise keeps the 8-bit history
// from freezing into a pattern.
export const RESOLVE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uCur;
uniform sampler2D uHist;
uniform vec2 uTexel;
uniform float uAlpha;
uniform float uFrame;
${HIST}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec3 c = texture2D(uCur, vUv).rgb;
  vec3 a = texture2D(uCur, vUv + vec2(uTexel.x, 0.0)).rgb;
  vec3 b = texture2D(uCur, vUv - vec2(uTexel.x, 0.0)).rgb;
  vec3 d = texture2D(uCur, vUv + vec2(0.0, uTexel.y)).rgb;
  vec3 e = texture2D(uCur, vUv - vec2(0.0, uTexel.y)).rgb;
  vec3 lo = min(c, min(min(a, b), min(d, e)));
  vec3 hi = max(c, max(max(a, b), max(d, e)));
  vec3 h = clamp(hist(texture2D(uHist, vUv).rgb), lo, hi);
  float n = ign(gl_FragCoord.xy + mod(uFrame, 64.0) * 5.588238) - 0.5;
  gl_FragColor = vec4(sqrt(max(mix(h, c, uAlpha), 0.0)) + n / 255.0, 1.0);
}`;

export const COMPOSITE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uBloomAmt;
uniform float uGrain;
uniform float uVignette;
uniform float uCA;
${DEC}
${HIST}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// Interleaved gradient noise: stable at any pixel coordinate, unlike a sin() hash.
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  // A trace of chromatic aberration towards the edges (high tier only).
  vec2 q0 = vUv - 0.5;
  vec2 off = q0 * dot(q0, q0) * uCA;
  vec3 s = uCA > 0.0
    ? vec3(dec(hist(texture2D(uScene, vUv + off).rgb)).r, dec(hist(texture2D(uScene, vUv).rgb)).g, dec(hist(texture2D(uScene, vUv - off).rgb)).b)
    : dec(hist(texture2D(uScene, vUv).rgb));
  vec3 c = s + dec(texture2D(uBloom, vUv).rgb) * uBloomAmt;
  c = aces(c);
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVignette * dot(q, q) * 1.8;
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  // Film grain after the tone curve, scaled by brightness, so pure black stays black.
  c += (ign(gl_FragCoord.xy + floor(fract(uTime * 7.31) * 64.0) * 5.588238) - 0.5) * uGrain * (0.03 + c);
  gl_FragColor = vec4(c, 1.0);
}`;
