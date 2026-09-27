// GLSL ES 1.0 sources. One scene from street level to orbit: the map is the surface of a large
// planet seen orthographically, so zooming out reveals the curve of the Earth with no cut.

export const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform vec3 uCam;        // image-plane centre (x, y) and world units per render pixel
uniform float uT;
uniform float uTime;
uniform float uMotion;
uniform sampler2D uField;
uniform vec4 uFieldRect;
uniform vec3 uBand;       // from, to, mix
uniform vec4 uLens;       // x, y (render px, GL origin), radius, on
uniform float uLensBand;
uniform float uDim;
uniform float uIntro;
uniform vec4 uLobe;       // x, y, rx, grown ry
uniform float uPaleoT;
uniform vec2 uFocus;
uniform vec2 uCenter;     // where the planet touches the map: the middle of the delta
uniform float uR;         // planet radius in world units
uniform vec2 uTilt;       // cos, sin of the tilt that carries the delta up toward the limb
uniform vec2 uCoastEdge;  // coastline y where the field ends, left and right

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = ROT * p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = ROT * p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.875;
}

struct Pal { vec3 soilA, soilB, vegA, vegB, deep, shelf, plume, lake, paleo, cloud; };

Pal palette(float b) {
  Pal p;
  if (b < 0.5) {            // natural 4-3-2
    p.soilA = vec3(0.15, 0.12, 0.09);  p.soilB = vec3(0.52, 0.43, 0.3);
    p.vegA = vec3(0.08, 0.16, 0.09);   p.vegB = vec3(0.27, 0.38, 0.18);
    p.deep = vec3(0.012, 0.05, 0.085); p.shelf = vec3(0.04, 0.2, 0.24);
    p.plume = vec3(0.36, 0.5, 0.42);   p.lake = vec3(0.03, 0.12, 0.16);
    p.paleo = vec3(0.52, 0.45, 0.32);  p.cloud = vec3(0.92, 0.94, 0.95);
  } else if (b < 1.5) {     // colour infrared 5-4-3: vegetation reads red
    p.soilA = vec3(0.16, 0.2, 0.22);   p.soilB = vec3(0.46, 0.52, 0.55);
    p.vegA = vec3(0.34, 0.03, 0.08);   p.vegB = vec3(0.86, 0.22, 0.29);
    p.deep = vec3(0.004, 0.008, 0.018); p.shelf = vec3(0.015, 0.04, 0.08);
    p.plume = vec3(0.1, 0.4, 0.52);    p.lake = vec3(0.015, 0.03, 0.07);
    p.paleo = vec3(0.98, 0.34, 0.4);   p.cloud = vec3(0.96, 0.96, 0.97);
  } else {                  // short-wave infrared 7-6-4
    p.soilA = vec3(0.26, 0.12, 0.18);  p.soilB = vec3(0.8, 0.46, 0.24);
    p.vegA = vec3(0.05, 0.22, 0.11);   p.vegB = vec3(0.18, 0.54, 0.29);
    p.deep = vec3(0.006, 0.01, 0.04);  p.shelf = vec3(0.025, 0.045, 0.15);
    p.plume = vec3(0.2, 0.22, 0.46);   p.lake = vec3(0.015, 0.025, 0.1);
    p.paleo = vec3(0.98, 0.62, 0.34);  p.cloud = vec3(0.9, 0.92, 1.0);
  }
  return p;
}

// Beyond the sides of the field the coastline keeps going, wandering, instead of running flat.
float sideCoast(float x) {
  float edge = x < 0.0 ? uCoastEdge.x : uCoastEdge.y;
  float wander = 1700.0 + 3200.0 * (fbm3(vec2(x * 0.00006, 3.7)) - 0.5) + 700.0 * (fbm3(vec2(x * 0.0004, 5.3)) - 0.5)
    + 90.0 * (fbm3(vec2(x * 0.0021, 9.1)) - 0.5);
  return mix(edge, wander, smoothstep(0.0, 2500.0, abs(x) - 800.0));
}

// The planet's large-scale surface, shared by the close-up map and the view from orbit, so pulling
// back never turns land into sea: coast is signed land in world units (positive on land), side is 0
// inside the river's field and 1 beyond it, green and soil are the regional cover and tone.
struct S { float coast, side, green, soil; };

struct F { float soil, grain, veg, wet, creek, lake, paleo, land, depth, plume, cloud, shadow, relief, green; };

// The close-up surface: soil, relief, wetness from the river field, sea, local weather.
F fields(vec2 w, float fp, S sh) {
  F f;
  vec4 t = texture2D(uField, (w - uFieldRect.xy) / uFieldRect.zw);
  float side = sh.side;
  t.r *= 1.0 - side;
  t.b *= 1.0 - side;
  float cn = fbm3(w * 0.018) - 0.5;
  float landField = 1.0 - smoothstep(0.47, 0.53, t.a + cn * 0.22);
  float landSide = smoothstep(-max(6.0, fp), max(6.0, fp), sh.coast - cn * 70.0);
  vec2 lq = (w - uLobe.xy) / vec2(uLobe.z, max(uLobe.w, 1.0));
  float lobe = step(uLobe.y, w.y) * step(1.0, uLobe.w) * (1.0 - smoothstep(0.85, 1.0, length(lq) + cn * 0.5));
  f.land = max(mix(landField, landSide, side), lobe);
  float wetT = smoothstep(t.g, t.g + 0.03, uT);
  float plain = smoothstep(500.0, 1200.0, w.y);
  float coastal = mix(smoothstep(0.02, 0.4, t.a), smoothstep(-500.0, 0.0, -sh.coast), side);
  float mx = w.x / 760.0;
  float marsh = plain * coastal * smoothstep(0.35, 0.7, uT) * exp(-mx * mx);
  f.wet = max(t.r * wetT, marsh * 0.6 * f.land);
  float offshore = smoothstep(0.0, 1400.0, mix(w.y - 1650.0, -sh.coast, side));
  f.depth = mix(smoothstep(0.5, 1.0, t.a) * (0.35 + 0.65 * offshore), offshore, side);
  f.plume = (1.0 - f.land) * t.r * wetT;
  f.paleo = t.b * smoothstep(uPaleoT, uPaleoT + 0.03, uT);
  float h0 = fbm(w * 0.0035);
  float hx = fbm((w + vec2(6.0, 0.0)) * 0.0035);
  float hy = fbm((w + vec2(0.0, 6.0)) * 0.0035);
  float shade = clamp(0.5 + (hx - h0) * 14.0 - (hy - h0) * 9.0, 0.0, 1.0);
  f.relief = mix(shade, 0.5, plain * 0.85);
  f.soil = clamp(sh.soil + (h0 - 0.5) * 0.5 + (fbm3(w * 0.012 + 7.0) - 0.5) * 0.25, 0.0, 1.0);
  f.green = sh.green;
  float fine = 1.0 - smoothstep(1.8, 5.0, fp); // fine detail fades before it can alias
  f.grain = mix(0.5, vnoise(w * 0.35) * 0.6 + vnoise(w * 0.09) * 0.4, fine);
  float rid = 1.0 - abs(fbm3(w * 0.045 + 31.0) * 2.0 - 1.0);
  f.grain = mix(f.grain, f.grain * 0.7 + rid * 0.45, 0.6 * fine);
  f.veg = clamp(fbm3(w * 0.022 + 3.0) * 1.2 - 0.1, 0.0, 1.0);
  float cr = abs(fbm3(w * 0.011 + 5.3) - 0.5);
  f.creek = (1.0 - smoothstep(0.0, 0.03, cr)) * smoothstep(0.3, 0.75, f.wet) * plain * fine;
  f.lake = smoothstep(0.66, 0.69, fbm3(w * 0.014 + 21.0)) * smoothstep(0.3, 0.6, f.wet) * plain;
  vec2 wind = vec2(9.0, 4.0) * uTime * uMotion;
  float viewH = uCam.z * uRes.y;
  float clear = smoothstep(viewH * 0.14, viewH * 0.45, length(w - uFocus));
  float local = 1.0 - smoothstep(2.2, 4.5, fp); // weather this small is gone before it turns to speckle
  f.cloud = smoothstep(0.66, 0.78, fbm((w + wind) * 0.0024 + 40.0)) * 0.92 * clear * local;
  f.shadow = smoothstep(0.66, 0.78, fbm((w + wind + vec2(-60.0, -95.0)) * 0.0024 + 40.0)) * clear * local;
  return f;
}

vec3 compose(F f, Pal P, float lens) {
  vec3 soil = mix(P.soilA, P.soilB, f.soil) * (0.82 + 0.36 * f.grain) * (0.62 + 0.76 * f.relief);
  vec3 veg = mix(P.vegA, P.vegB, f.veg) * (0.9 + 0.2 * f.grain) * (0.85 + 0.3 * f.relief);
  vec3 col = mix(soil, veg, smoothstep(0.05, 0.45, f.wet));
  col = mix(col, mix(P.vegA, P.vegB, 0.55) * (0.9 + 0.2 * f.grain) * (0.85 + 0.3 * f.relief), f.green * 0.85);
  col = mix(col, P.paleo, f.paleo * (0.18 + 0.8 * lens));
  col = mix(col, P.lake, max(f.lake, f.creek * 0.7));
  vec3 sea = mix(P.shelf, P.deep, f.depth);
  sea = mix(sea, P.plume, clamp(f.plume * 1.1, 0.0, 0.9));
  col = mix(sea, col, f.land);
  col *= 1.0 - f.shadow * 0.32;
  return mix(col, P.cloud, f.cloud);
}

float hash3(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash3(i), b = hash3(i + vec3(1.0, 0.0, 0.0)), c = hash3(i + vec3(0.0, 1.0, 0.0)), d = hash3(i + vec3(1.0, 1.0, 0.0));
  float e = hash3(i + vec3(0.0, 0.0, 1.0)), g = hash3(i + vec3(1.0, 0.0, 1.0)), h = hash3(i + vec3(0.0, 1.0, 1.0)), k = hash3(i + vec3(1.0));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(h, k, u.x), u.y), u.z);
}
float fbm3d(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.02 + 7.3; a *= 0.5; }
  return s / 0.9375;
}

// Signed land in world units (positive on land): the map's own coastline, plus continents that grow
// out of six octaves of noise away from the delta. The noise is placed so the delta sits on the south
// coast of one of them, with open sea to the south. The octaves stop as soon as the rest can no longer
// turn land into sea or change the shade of the shelf, so inland and far out at sea it costs less.
float continent(vec2 w, vec3 pd, float d, float fp) {
  float u = (sideCoast(w.x) - w.y) / 9000.0;
  float s = 9000.0 * u / sqrt(1.0 + u * u); // the coastline's pull fades far inland and far out at sea
  float wild = smoothstep(3000.0, 25000.0, d);
  if (wild <= 0.0) return s;
  float k = wild * 90000.0 / 0.984375;
  float land = max(40.0, fp * 1.5) + 40.0; // beyond this the coast and its jitter are all land
  float rest = 0.984375, a = 0.5;
  vec3 p = pd * 2.2 + vec3(11.19, 6.39, 41.83);
  s -= 0.5 * wild * 90000.0;
  for (int i = 0; i < 6; i++) {
    s += k * a * vnoise3(p);
    rest -= a;
    if (s > land || s + k * rest < -1500.0) break;
    p = p * 2.02 + 7.3;
    a *= 0.5;
  }
  return s + 0.5 * k * rest;
}

// One geography for every altitude. Near the delta the coast is the map's own; farther out it bends
// into continents, and the delta's region stays arid while forests start far from it.
S surface(vec3 pd, vec2 w, float fp) {
  S sh;
  vec2 q = abs(w - uFieldRect.xy - 0.5 * uFieldRect.zw) - 0.5 * uFieldRect.zw;
  sh.side = smoothstep(0.0, 600.0, max(q.x, q.y));
  float d = length(w - uCenter);
  sh.coast = continent(w, pd, d, fp);
  // Regional soil tone: haze softens it with altitude, and it evens out before it can alias.
  float mott = mix(1.25, 0.55, smoothstep(8.0, 40.0, fp)) * (1.0 - smoothstep(60.0, 200.0, fp));
  sh.soil = 0.505 + (fbm3(w * 0.0011 + 13.0) - 0.5) * mott;
  float region = smoothstep(4000.0, 30000.0, d);
  if (region > 0.0) sh.soil += region * (vnoise3(pd * 3.3 + 2.0) * 0.67 + vnoise3(pd * 6.7 + 9.3) * 0.33 - 0.5);
  sh.green = 0.0;
  float far = smoothstep(15000.0, 45000.0, d);
  if (far > 0.0) sh.green = far * smoothstep(0.42, 0.64, fbm3d(pd * 6.0 + 9.0));
  return sh;
}

struct G { float land, veg, soil, ice, sea, cloud; };

// The planet as seen from orbit: the same land, cover and soil as the close-up map, without the detail.
G globeFields(vec3 pd, vec2 w, float fp, S sh) {
  G g;
  vec4 t = texture2D(uField, (w - uFieldRect.xy) / uFieldRect.zw);
  float e = max(40.0, fp * 1.5);
  g.land = mix(1.0 - smoothstep(0.47, 0.53, t.a), smoothstep(-e, e, sh.coast), sh.side);
  g.veg = sh.green;
  g.soil = clamp(sh.soil, 0.0, 1.0);
  g.ice = smoothstep(0.93, 0.975, abs(dot(pd, vec3(0.0, -0.866, 0.5)))); // the delta sits near 30°N
  g.sea = fbm3d(pd * 4.0 + 5.0);
  g.cloud = smoothstep(0.56, 0.76, fbm3d(pd * 3.4 + vec3(uTime * 0.003 * uMotion, 2.0, 0.0))) * smoothstep(9.0, 40.0, fp);
  return g;
}

vec3 composeG(G g, Pal P) {
  vec3 ground = mix(mix(P.soilA, P.soilB, g.soil), mix(P.vegA, P.vegB, 0.55), g.veg * 0.85);
  ground = mix(ground, vec3(0.88, 0.91, 0.94), g.ice);
  vec3 sea = mix(P.shelf * 0.8, P.deep * 1.5, 0.55 + 0.45 * g.sea); // from orbit the open ocean reads navy
  return mix(mix(sea, ground, g.land), P.cloud, g.cloud * 0.85);
}

vec3 stars(vec2 frag) {
  vec2 sc = floor(frag / uRes.y * 1100.0); // tied to the screen, not the render scale, so stars hold still
  return vec3(step(0.9988, hash(sc)) * (0.25 + 0.75 * hash(sc + 3.1)));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float fp = uCam.z;
  vec2 wi = uCam.xy + (frag - 0.5 * uRes) * vec2(1.0, -1.0) * fp;
  vec2 u = (wi - uCenter) / uR;
  float rr = length(u);
  vec3 sun = normalize(vec3(-0.4, -0.55, 0.73));
  vec3 col;
  if (rr < 1.0) {
    // View-space normal, then undo the tilt to reach the delta's own frame (x east, y south, z up).
    vec3 pv = vec3(u, sqrt(1.0 - rr * rr));
    vec3 pd = vec3(pv.x, pv.y * uTilt.x + pv.z * uTilt.y, pv.z * uTilt.x - pv.y * uTilt.y);
    float lxy = length(pd.xy);
    // Unroll the sphere back onto the map (azimuthal equidistant): flat when zoomed in.
    vec2 w = uCenter + (lxy > 1e-7 ? pd.xy * (atan(lxy, pd.z) / lxy) * uR : vec2(0.0));
    S sh = surface(pd, w, fp);
    float orbit = smoothstep(7.0, 32.0, fp);
    vec3 near = vec3(0.0), far = vec3(0.0);
    if (orbit < 0.999) {
      F f = fields(w, fp, sh);
      near = mix(compose(f, palette(uBand.x), 0.0), compose(f, palette(uBand.y), 0.0), uBand.z);
      if (uLens.w > 0.5) {
        float m = 1.0 - smoothstep(uLens.z - 1.5, uLens.z, length(frag - uLens.xy));
        if (m > 0.0) near = mix(near, compose(f, palette(uLensBand), 1.0), m);
      }
    }
    if (orbit > 0.001) {
      G g = globeFields(pd, w, fp, sh);
      far = mix(composeG(g, palette(uBand.x)), composeG(g, palette(uBand.y)), uBand.z);
    }
    col = mix(near, far, orbit);
    float lit = clamp(dot(pv, sun) / sun.z, 0.0, 1.15); // exactly 1 where the delta faces up
    col *= 0.04 + 0.96 * lit;
    col = mix(col, vec3(0.32, 0.58, 1.0) * (0.2 + 0.8 * min(lit, 1.0)), smoothstep(0.78, 1.0, rr) * 0.5);
  } else {
    col = stars(frag) * smoothstep(10.0, 45.0, fp);
  }
  float rimLit = clamp(dot(normalize(vec3(u, 0.2)), sun) * 0.9 + 0.3, 0.0, 1.0);
  col += vec3(0.28, 0.58, 1.0) * exp(-abs(rr - 1.0) * 60.0) * 0.9 * rimLit;
  vec2 v = frag / uRes - 0.5;
  col *= 1.0 - dot(v, v) * 0.6;
  col *= 1.0 - uDim;
  float fromTop = uRes.y - frag.y;
  float line = uIntro * uRes.y * 1.02;
  col *= step(fromTop, line);
  col += vec3(0.45, 0.85, 1.0) * exp(-abs(fromTop - line) * 0.08) * (1.0 - step(0.999, uIntro)) * 0.8;
  gl_FragColor = vec4(col, 1.0);
}
`;
