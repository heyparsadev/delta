// GLSL for the stage: the full-screen vertex shader and the SDF scene (object, studio, floor, the
// light). Units: the card is 2 × 1.7 wide; the floor sits at FLOOR_Y (stage.js).
export const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const SCENE_UNIFORMS = ['uRes', 'uCamPos', 'uCamFwd', 'uCamRight', 'uCamUp', 'uLens', 'uTime', 'uRotInv',
  'uObj', 'uBound', 'uShape', 'uBox', 'uPrism', 'uSphere', 'uLayers', 'uMat', 'uMat2', 'uLight', 'uLight2',
  'uStage', 'uSteps', 'uFan', 'uRep', 'uSat', 'uMat3'];

export const SCENE = `
precision highp float;
varying vec2 vUv;

uniform vec2 uRes;
uniform vec3 uCamPos;
uniform vec3 uCamFwd;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec4 uLens;      // tan(fov/2), aspect, shift x, shift y
uniform float uTime;
uniform mat3 uRotInv;    // world to object
uniform vec4 uObj;       // position, scale
uniform float uBound;    // bounding sphere radius, world units
uniform vec4 uShape;     // weights: box, prism, sphere; w: surface opacity
uniform vec4 uBox;       // half width, half height, half depth, corner radius
uniform vec3 uPrism;     // half side, half depth, edge radius
uniform float uSphere;   // radius
uniform vec4 uLayers;    // exploded (0-1), gap, highlighted layer, highlight strength
uniform vec4 uMat;       // glass, titanium, mirror, black
uniform vec4 uMat2;      // fog, glow on every layer, edge glow, layers the highlight covers
uniform vec4 uLight;     // position, intensity
uniform vec4 uLight2;    // radius, warmth
uniform vec4 uStage;     // floor height, floor amount, exposure, quality tier (0, 1, 2)
uniform vec2 uSteps;     // march steps: outer, inner
uniform vec4 uFan;       // fanned cards: amount, cards, angle step, pivot distance
uniform vec2 uRep;       // copies along x, spacing
uniform vec4 uSat;       // satellites: amount, half side, x offset, height
uniform vec4 uMat3;      // planet, titanium rim amount, backdrop, backdrop centre (x, object space)

const float N_LAYERS = 12.0;

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
// A 2D distance extruded to half depth h, with its edges rounded by r.
float extrude(float d2, float z, float h, float r) {
  vec2 w = vec2(d2 + r, abs(z) - h + r);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - r;
}
// Equilateral triangle, apex up, half side r (after Inigo Quilez).
float sdTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

float sdCard(vec3 p) {
  // The rim is almost fully rounded, so its highlight spans a few pixels instead of less than one.
  return extrude(sdRoundRect(p.xy, uBox.xy, uBox.w), p.z, uBox.z, uBox.z * 0.9);
}
float layerPitch() {
  float t = uBox.z * 2.0 / N_LAYERS;
  return mix(t, t + uLayers.y, uLayers.x);
}
float layerAt(float z) {
  return clamp(floor(z / layerPitch() + N_LAYERS * 0.5), 0.0, N_LAYERS - 1.0);
}
// The card as twelve plates: stacked they are the card; exploded they spread along its normal.
float sdLayers(vec3 p) {
  float t = uBox.z * 2.0 / N_LAYERS;
  float h = mix(t, 0.018, uLayers.x) * 0.5;
  float pitch = layerPitch();
  float d2 = sdRoundRect(p.xy, uBox.xy, uBox.w);
  float i0 = layerAt(p.z);
  float d = 1e3;
  for (int k = -1; k <= 1; k++) {
    float i = clamp(i0 + float(k), 0.0, N_LAYERS - 1.0);
    float z = (i - (N_LAYERS - 1.0) * 0.5) * pitch;
    d = min(d, extrude(d2, p.z - z, h, min(h, 0.008)));
  }
  return d;
}
float sdPrism(vec3 p) {
  float r = uPrism.z;
  return extrude(sdTri(p.xy, uPrism.x - r) - r, p.z, uPrism.y, r);
}

// The card fanned like a hand of cards around a pivot below it, each a little behind the last.
// Returns the point in the frame of the nearest card.
vec3 fanLocal(vec3 p) {
  float step = uFan.z * uFan.x, n = uFan.y;
  vec2 q = p.xy + vec2(0.0, uFan.w);
  float i0 = clamp(floor(atan(q.x, q.y) / step + n * 0.5), 0.0, n - 1.0);
  vec3 best = p;
  float bd = 1e3;
  for (int k = -1; k <= 1; k++) {
    float i = clamp(i0 + float(k), 0.0, n - 1.0);
    float a = (i - (n - 1.0) * 0.5) * step, c = cos(a), s = sin(a);
    vec3 pc = vec3(c * q.x - s * q.y, s * q.x + c * q.y - uFan.w, p.z - (i - (n - 1.0) * 0.5) * 0.12 * uFan.x);
    float d = sdCard(pc);
    if (d < bd) { bd = d; best = pc; }
  }
  return best;
}
// Copies along x (the two sheets, the three tiles): fold space onto the nearest copy.
vec3 repLocal(vec3 p) {
  if (uRep.x < 1.5 || uRep.y < 1e-3) return p;
  float n = floor(uRep.x + 0.5);
  float i = clamp(floor(p.x / uRep.y + n * 0.5), 0.0, n - 1.0);
  p.x -= (i - (n - 1.0) * 0.5) * uRep.y;
  return p;
}
vec3 cardLocal(vec3 p) {
  p = repLocal(p);
  return uFan.x > 0.001 ? fanLocal(p) : p;
}
// Two small prisms (the assistants) that descend and settle either side of the prism's apex.
float sdSatellites(vec3 p) {
  float h = uSat.y * (0.25 + 0.75 * uSat.x);
  vec3 q = vec3(abs(p.x) - uSat.z, p.y - uSat.w - (1.0 - uSat.x) * 1.4, p.z);
  return extrude(sdTri(q.xy, h - 0.02) - 0.02, q.z, h * 0.6, 0.02);
}

vec3 toObject(vec3 pw) { return uRotInv * (pw - uObj.xyz) / uObj.w; }

// At most two shapes carry weight at a time; their distances blend, which morphs one into the other.
float sdObject(vec3 pw) {
  vec3 p = toObject(pw);
  float d = 0.0;
  float w = 0.0;
  if (uShape.x > 0.001) { d += uShape.x * (uLayers.x > 0.001 ? sdLayers(p) : sdCard(cardLocal(p))); w += uShape.x; }
  if (uShape.y > 0.001) { d += uShape.y * sdPrism(p); w += uShape.y; }
  if (uShape.z > 0.001) { d += uShape.z * (length(p) - uSphere); w += uShape.z; }
  d = w > 0.0 ? d / w : 1e3;
  if (uSat.x > 0.001) d = min(d, sdSatellites(p));
  return d * uObj.w;
}

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(0.0012, -0.0012);
  return normalize(e.xyy * sdObject(p + e.xyy) + e.yyx * sdObject(p + e.yyx) +
                   e.yxy * sdObject(p + e.yxy) + e.xxx * sdObject(p + e.xxx));
}

bool sphereHit(vec3 ro, vec3 rd, vec3 c, float r, out float t0, out float t1) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + r * r;
  t0 = 0.0;
  t1 = -1.0;
  if (h < 0.0) return false;
  h = sqrt(h);
  t0 = -b - h;
  t1 = -b + h;
  return t1 > 0.0;
}

float march(vec3 ro, vec3 rd, float t, float tmax, out bool hit) {
  hit = false;
  for (int i = 0; i < 120; i++) {
    if (float(i) >= uSteps.x) break;
    float d = sdObject(ro + rd * t);
    if (d < 0.0005 * (1.0 + t)) { hit = true; break; }
    t += d * 0.9;
    if (t > tmax) break;
  }
  return t;
}

// From just inside the surface, how far a ray travels before it leaves the object.
float insideLength(vec3 p, vec3 rd) {
  if (uShape.x > 0.999 && uLayers.x < 0.001 && uFan.x < 0.001 && uSat.x < 0.001) {
    // The flat card: leave through the opposite face, exactly.
    vec3 po = toObject(p);
    vec3 dirO = uRotInv * rd;
    float t = (sign(dirO.z) * uBox.z - po.z) / (abs(dirO.z) > 1e-4 ? dirO.z : 1e-4);
    return clamp(t, 0.0, 4.0) * uObj.w;
  }
  float t = 0.004;
  for (int i = 0; i < 48; i++) {
    if (float(i) >= uSteps.y) break;
    float d = -sdObject(p + rd * t);
    if (d < 0.0005) break;
    t += max(d, 0.003);
  }
  return t;
}

// The studio, seen only in reflections: a large soft light above, two tall strips at the sides and a
// faint fill above the camera. Looking straight into it shows black.
float panel(vec2 p, vec2 c, vec2 hs, float soft) {
  vec2 q = abs(p - c) - hs;
  return 1.0 - smoothstep(0.0, soft, max(q.x, q.y));
}
vec3 studio(vec3 d, float rough) {
  float soft = mix(0.04, 0.5, rough);
  float az = atan(d.x, d.z);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec3 c = vec3(1.0, 0.97, 0.93) * 1.5 * smoothstep(0.62 - soft, 0.94, d.y);
  c += vec3(0.92, 0.96, 1.0) * 2.6 * panel(vec2(az, el), vec2(1.72, 0.2), vec2(0.07, 0.62), soft);
  c += vec3(0.92, 0.96, 1.0) * 2.2 * panel(vec2(az, el), vec2(-1.72, 0.2), vec2(0.07, 0.62), soft);
  // Two thin strips in front of the object, left and right of the camera: the clean lines that run
  // across glass faces as they turn.
  c += vec3(1.0, 0.98, 0.95) * 4.0 * panel(vec2(az, el), vec2(0.92, 0.1), vec2(0.05, 0.7), soft);
  c += vec3(1.0, 0.98, 0.95) * 3.0 * panel(vec2(az, el), vec2(-0.92, 0.1), vec2(0.05, 0.7), soft);
  // A faint fill from the front, with no edges to show.
  c += vec3(0.08) * smoothstep(-0.2, 0.8, d.z) * smoothstep(-0.4, 0.7, d.y);
  return c * mix(1.0, 0.55, rough);
}

vec3 lightColor() { return mix(vec3(1.0), vec3(1.0, 0.85, 0.66), uLight2.y); }

// The light as seen along a ray segment: a tight core and a wide halo.
vec3 glowAlong(vec3 ro, vec3 rd, float tmax) {
  float t = clamp(dot(uLight.xyz - ro, rd), 0.0, tmax);
  float h = length(ro + rd * t - uLight.xyz);
  float r = uLight2.x;
  float core = exp(-(h * h) / (r * r * 0.18));
  float halo = r * r / (h * h + r * r) * 0.22;
  return lightColor() * uLight.w * (core + halo);
}

// A plane of fine dots behind the object (object space z = -0.9), for the Liquid Glass tiles: seen
// directly, and bent by the glass in front of it. Dots smaller than a pixel fade instead of aliasing.
vec3 backdropAlong(vec3 ro, vec3 rd) {
  if (uMat3.z < 0.001) return vec3(0.0);
  vec3 o = toObject(ro), d = uRotInv * rd;
  if (d.z > -1e-4) return vec3(0.0);
  float t = (-0.9 - o.z) / d.z;
  if (t < 0.0) return vec3(0.0);
  vec2 q = (o + d * t).xy;
  float r = length(fract(q / 0.15) - 0.5) * 0.15;
  float fp = (length(ro - uCamPos) + t * uObj.w) * uLens.x * 2.0 / uRes.y / uObj.w;
  float a = (1.0 - smoothstep(0.012 - fp, 0.012 + fp, r)) * 0.012 / max(0.012, fp);
  vec2 c = q - vec2(uMat3.w, 0.0);
  return vec3(0.75, 0.8, 0.9) * a * exp(-dot(c, c) * 0.9) * uMat3.z * 0.55;
}

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise3(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
// Mars, in the object's frame so it turns with the object: rust plains, darker highlands, polar caps,
// lit from one side, with a thin warm rim of atmosphere.
vec3 shadePlanet(vec3 p, vec3 rd, vec3 n) {
  vec3 q = normalize(toObject(p));
  float h = fbm3(q * 3.1);
  vec3 alb = mix(vec3(0.42, 0.17, 0.08), vec3(0.74, 0.39, 0.2), smoothstep(0.3, 0.7, h));
  alb = mix(alb, vec3(0.24, 0.1, 0.06), smoothstep(0.52, 0.7, fbm3(q * 1.6 + 5.3)) * 0.7);
  alb = mix(alb, vec3(0.9, 0.88, 0.86), smoothstep(0.87, 0.95, abs(q.y) + (h - 0.5) * 0.08));
  vec3 sun = normalize(vec3(-0.62, 0.38, 0.69));
  float rim = pow(1.0 - clamp(-dot(rd, n), 0.0, 1.0), 3.0);
  return alb * (max(dot(n, sun), 0.0) * 1.5 + 0.02) + vec3(1.0, 0.5, 0.3) * rim * 0.4 * smoothstep(-0.2, 0.5, dot(n, sun));
}

vec3 shadeMetal(vec3 p, vec3 rd, vec3 n, vec3 f0, float rough) {
  vec3 r = reflect(rd, n);
  float c = clamp(1.0 + dot(rd, n), 0.0, 1.0);
  vec3 F = f0 + (1.0 - f0) * pow(c, 5.0);
  vec3 L = uLight.xyz - p;
  float dl = length(L);
  float spec = pow(max(dot(r, L / dl), 0.0), mix(420.0, 36.0, rough)) * 2.0 / (1.0 + dl * dl);
  return F * (studio(r, rough) + lightColor() * uLight.w * spec + glowAlong(p + n * 0.003, r, 6.0));
}

const float IOR = 1.47;
// Leaving the glass, more light reflects back in as the exit grows grazing, up to total internal
// reflection; fading by the exit's Fresnel term avoids a hard edge where that begins. On the high tier
// red leaves with a slightly lower index and blue with a higher one: dispersion.
vec3 exitLight(vec3 pe, vec3 ne, vec3 ti) {
  vec3 to = refract(ti, -ne, IOR);
  if (dot(to, to) < 1e-4) return vec3(0.0);
  float Fe = 0.04 + 0.96 * pow(1.0 - abs(dot(to, ne)), 5.0);
  vec3 c = studio(to, 0.05) * 0.9;
  if (uStage.w > 1.5) {
    vec3 tr = refract(ti, -ne, IOR - 0.018), tb = refract(ti, -ne, IOR + 0.018);
    c.r = dot(tr, tr) > 1e-4 ? studio(tr, 0.05).r * 0.9 : 0.0;
    c.b = dot(tb, tb) > 1e-4 ? studio(tb, 0.05).b * 0.9 : 0.0;
  }
  c += glowAlong(pe + ne * 0.003, to, 6.0) * 0.8 + backdropAlong(pe, to);
  return c * (1.0 - Fe);
}

vec3 shadeGlass(vec3 p, vec3 rd, vec3 n) {
  const float ior = IOR;
  float c = clamp(1.0 + dot(rd, n), 0.0, 1.0);
  float F = 0.04 + 0.96 * pow(c, 5.0);
  vec3 r = reflect(rd, n);
  vec3 refl = studio(r, 0.02) + glowAlong(p + n * 0.003, r, 6.0) * 0.6;
  vec3 ti = refract(rd, n, 1.0 / ior);
  vec3 trans;
  if (uStage.w > 0.5) {
    vec3 pi = p - n * 0.003;
    float len = insideLength(pi, ti);
    vec3 pe = pi + ti * len;
    vec3 outer = exitLight(pe, normalAt(pe), ti);
    vec3 absorb = exp(-len * vec3(0.32, 0.2, 0.16));
    trans = outer * absorb + glowAlong(pi, ti, len) * 1.6;
  } else {
    trans = studio(ti, 0.12) * 0.8 + glowAlong(p, ti, 3.0) + backdropAlong(p, ti);
  }
  return mix(trans, refl, F);
}

vec3 shadeSurface(vec3 p, vec3 rd, vec3 n) {
  vec3 po = cardLocal(toObject(p));
  // Specular anti-aliasing: when the rounded rim is only a few pixels across, a sharp highlight on it
  // is thinner than a pixel and breaks into dashes, so the titanium grows rougher as the rim shrinks.
  float pixel = length(p - uCamPos) * uLens.x * 2.0 / uRes.y;
  float rimPx = uBox.z * 0.9 * uObj.w / pixel;
  float tiRough = mix(0.95, 0.5, smoothstep(1.5, 7.0, rimPx));
  float rect = sdRoundRect(po.xy, uBox.xy, uBox.w);
  // On the card, glass fills the face and titanium takes the rim.
  float face = mix(1.0, smoothstep(0.05, 0.085, -rect), uShape.x * uMat3.y);
  float g = uMat.x * face;
  float m = uMat.y + uMat.x * (1.0 - face);
  float wsum = g + m + uMat.z + uMat.w + uMat3.x + 1e-4;
  vec3 col = vec3(0.0);
  if (g > 0.001) col += g * shadeGlass(p, rd, n);
  if (m > 0.001) col += m * shadeMetal(p, rd, n, vec3(0.8, 0.79, 0.77), tiRough);
  if (uMat.z > 0.001) {
    // The mirror; fog blurs it and lifts it towards grey.
    vec3 mc = shadeMetal(p, rd, n, vec3(0.96), uMat2.x * 0.7);
    col += uMat.z * mix(mc, vec3(0.085, 0.088, 0.092) + mc * 0.1, uMat2.x * 0.9);
  }
  if (uMat3.x > 0.001) col += uMat3.x * shadePlanet(p, rd, n);
  if (uMat.w > 0.001) col += uMat.w * shadeMetal(p, rd, n, vec3(0.045), 0.2);
  col /= wsum;
  // Edge light along the outline: the card's rectangle, or the prism's triangle.
  float outline = mix(rect, sdTri(po.xy, uPrism.x - uPrism.z) - uPrism.z, uShape.y);
  col += uMat2.z * (1.0 - smoothstep(0.0, 0.03, abs(outline))) * mix(vec3(0.72, 0.86, 1.0), vec3(1.0, 0.97, 0.92), uShape.y) * 1.8;
  if (uLayers.x > 0.001 && uLayers.w + uMat2.y > 0.001) {
    // Lit layers: one band of them (highlight, span) while the others dim, and a glow on every layer.
    float band = 1.0 - smoothstep(0.0, max(uMat2.w, 0.5) + 0.5, abs(layerAt(po.z) - uLayers.z));
    col *= 1.0 - 0.6 * min(uLayers.w, 1.0) * (1.0 - band);
    col += (uMat2.y + uLayers.w * band * 1.8) * vec3(1.0, 0.86, 0.66) * 0.8;
  }
  return col;
}

// A glossy black floor: the light's reflection and pool, and on the higher tiers the object's.
vec3 shadeFloor(vec3 ro, vec3 rd, float tf) {
  vec3 p = ro + rd * tf;
  float F = 0.02 + 0.3 * pow(1.0 - clamp(-rd.y, 0.0, 1.0), 5.0);
  vec3 r = reflect(rd, vec3(0.0, 1.0, 0.0));
  vec3 col = glowAlong(p, r, 8.0);
  float t0, t1;
  if (uStage.w > 0.5 && uShape.w > 0.001 && sphereHit(p, r, uObj.xyz, uBound, t0, t1)) {
    bool hit;
    float t = march(p + vec3(0.0, 0.002, 0.0), r, max(t0, 0.0), t1, hit);
    if (hit) {
      vec3 q = p + r * t, nq = normalAt(q);
      // A planet shows its own colour in the floor; everything else, the studio it reflects.
      col += mix(studio(reflect(r, nq), 0.6) * 0.25, shadePlanet(q, r, nq) * 0.3, uMat3.x) * uShape.w;
    }
  }
  col *= F * 2.2;
  vec3 L = uLight.xyz - p;
  float dl = length(L);
  col += lightColor() * uLight.w * 0.05 * max(L.y / dl, 0.0) / (0.2 + dl * dl);
  return col * exp(-length(p.xz - uObj.xz) * 0.16);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamFwd + uCamRight * ((ndc.x - uLens.z) * uLens.x * uLens.y) + uCamUp * ((ndc.y - uLens.w) * uLens.x));
  vec3 ro = uCamPos;
  float tf = rd.y < -1e-4 ? (uStage.x - ro.y) / rd.y : 1e9;
  vec3 glow = glowAlong(ro, rd, min(tf, 80.0));
  vec3 floorCol = tf < 1e8 ? shadeFloor(ro, rd, tf) * uStage.y : vec3(0.0);
  floorCol += backdropAlong(ro, rd);
  vec3 col = floorCol + glow;
  float t0, t1;
  if (uShape.w > 0.001 && sphereHit(ro, rd, uObj.xyz, uBound, t0, t1)) {
    bool hit;
    float t = march(ro, rd, max(t0, 0.0), min(t1, tf), hit);
    if (hit) {
      vec3 p = ro + rd * t;
      vec3 surf = shadeSurface(p, rd, normalAt(p));
      // The light shows in front of the surface only when it is outside the object and nearer the
      // camera than the surface; inside, it is seen through the glass (shadeGlass) and nowhere else.
      bool lightFirst = sdObject(uLight.xyz) > 0.0 && length(uLight.xyz - ro) < t;
      vec3 behind = floorCol + (lightFirst ? vec3(0.0) : glow);
      col = (lightFirst ? glow : vec3(0.0)) + mix(behind, surf, uShape.w);
    }
  }
  col *= uStage.z;
  // Half a step of noise so the dark gradients do not band in the 8-bit buffer.
  float n8 = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  gl_FragColor = vec4(col / (1.0 + col) + n8 / 255.0, 1.0);
}`;
