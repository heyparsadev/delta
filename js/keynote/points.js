// Glowing points in the scene buffer: a soft core and an optional halo, sized in world units so they
// shrink with distance, drawn with the stage camera and blended like the lines. A point can travel from
// `from` to its place (mix), and appear in its reveal order.
export const POINT_FLOATS = 11;
const WHITE = [1, 1, 1];
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Pure, for the tests. geom: { pts, from?, size (one number or one per point), colors? (per point; a
// missing entry is white), order? (0 to 1; index order by default) }.
export function buildPoints(geom) {
  const n = geom.pts.length;
  const out = new Float32Array(n * POINT_FLOATS);
  for (let i = 0; i < n; i++) {
    const p = geom.pts[i], f = geom.from?.[i] ?? p, c = geom.colors?.[i] ?? WHITE;
    const size = Array.isArray(geom.size) ? geom.size[i] : geom.size;
    out.set([p[0], p[1], p[2], f[0], f[1], f[2], size, c[0], c[1], c[2], geom.order?.[i] ?? i / n], i * POINT_FLOATS);
  }
  return out;
}

const VS = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aFrom;
attribute float aSize;
attribute vec3 aColor;
attribute float aOrder;
uniform vec3 uCamPos;
uniform vec3 uCamFwd;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec4 uLens;
uniform mat3 uRot;
uniform vec4 uObj;
uniform vec2 uRes;
uniform float uMix;
uniform float uReveal;
uniform float uMaxSize;
varying vec3 vColor;
varying float vShow;
void main() {
  vec3 w = uRot * (mix(aFrom, aPos, uMix) * uObj.w) + uObj.xyz;
  vec3 d = w - uCamPos;
  float z = dot(d, uCamFwd);
  vShow = clamp((uReveal * 1.02 - aOrder) * 50.0, 0.0, 1.0);
  if (z < 0.05 || vShow <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  gl_Position = vec4(dot(d, uCamRight) / (z * uLens.x * uLens.y) + uLens.z, dot(d, uCamUp) / (z * uLens.x) + uLens.w, 0.0, 1.0);
  // The sprite spans three radii each side, room for the halo. Points smaller than a pixel dim
  // instead of shrinking further, so they never shimmer.
  float r = aSize * uObj.w / (z * uLens.x) * uRes.y * 0.5;
  gl_PointSize = clamp(r * 6.0, 3.0, uMaxSize);
  vColor = aColor * min(1.0, r / 0.8);
}`;

const FS = `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGlow;
varying vec3 vColor;
varying float vShow;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(q, q) * 9.0; // squared distance, in point radii
  float core = exp(-d2 * 2.2);
  float halo = uGlow / (1.0 + d2 * 2.5) * (1.0 - smoothstep(4.0, 9.0, d2));
  gl_FragColor = vec4(min(uColor * vColor * (core + halo) * vShow * uAlpha, vec3(0.95)), 1.0);
}`;

const ATTRS = ['aPos', 'aFrom', 'aSize', 'aColor', 'aOrder'];
const UNIFORMS = ['uCamPos', 'uCamFwd', 'uCamRight', 'uCamUp', 'uLens', 'uRot', 'uObj', 'uRes', 'uMix', 'uReveal',
  'uMaxSize', 'uColor', 'uAlpha', 'uGlow'];

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.warn('[points] shader:', gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export function createPoints(gl) {
  let prog = null;
  let U = {};
  let maxSize = 64;
  const geoms = new Map(); // kept, so a restored context can rebuild the buffers
  const bufs = new Map();

  function upload(id, geom, usage = gl.STATIC_DRAW) {
    const data = buildPoints(geom);
    const old = bufs.get(id);
    if (old && old.floats === data.length) {
      gl.bindBuffer(gl.ARRAY_BUFFER, old.vb);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      return;
    }
    if (old) gl.deleteBuffer(old.vb);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    bufs.set(id, { vb, count: geom.pts.length, floats: data.length });
  }

  function init(context) {
    gl = context;
    prog = null;
    bufs.clear();
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    ATTRS.forEach((name, i) => gl.bindAttribLocation(p, i, name));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (!gl.isContextLost()) console.warn('[points] link:', gl.getProgramInfoLog(p));
      return;
    }
    prog = p;
    U = {};
    for (const n of UNIFORMS) U[n] = gl.getUniformLocation(prog, n);
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    maxSize = range ? Math.min(range[1], 256) : 64;
    for (const [id, geom] of geoms) upload(id, geom);
  }

  function draw(f, w, h) {
    if (!prog || !f.points) return;
    const cam = f.cam, s = f.state, o = f.obj ?? [s.objX, s.objY, s.objZ];
    gl.useProgram(prog);
    gl.uniform3fv(U.uCamPos, cam.pos);
    gl.uniform3fv(U.uCamFwd, cam.fwd);
    gl.uniform3fv(U.uCamRight, cam.right);
    gl.uniform3fv(U.uCamUp, cam.up);
    gl.uniform4f(U.uLens, cam.tanHalf, cam.aspect, cam.shiftX, cam.shiftY);
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uMaxSize, maxSize);
    for (let i = 0; i < ATTRS.length; i++) gl.enableVertexAttribArray(i);
    const stride = POINT_FLOATS * 4;
    for (const [id, L] of Object.entries(f.points)) {
      const b = bufs.get(id);
      if (!b || !(L.alpha > 0.002)) continue;
      // rotT is Rᵀ in row-major order, which WebGL reads column-major as R itself: object to world. A
      // layer can bring its own frame instead (the turning field), or live in world space.
      const fr = L.frame;
      gl.uniformMatrix3fv(U.uRot, false, fr ? fr.rotT : L.world ? IDENTITY : f.rotT);
      if (fr) gl.uniform4f(U.uObj, fr.at[0], fr.at[1], fr.at[2], fr.scale);
      else if (L.world) gl.uniform4f(U.uObj, 0, 0, 0, 1);
      else gl.uniform4f(U.uObj, o[0], o[1], o[2], s.objScale);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vb);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
      gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 28);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 40);
      gl.uniform1f(U.uAlpha, L.alpha);
      gl.uniform1f(U.uReveal, L.reveal ?? 1);
      gl.uniform1f(U.uMix, L.mix ?? 1);
      gl.uniform3fv(U.uColor, L.color ?? WHITE);
      gl.uniform1f(U.uGlow, L.glow ?? 0);
      gl.drawArrays(gl.POINTS, 0, b.count);
    }
    for (let i = 1; i < ATTRS.length; i++) gl.disableVertexAttribArray(i);
  }

  init(gl);
  return {
    set(id, geom) { geoms.set(id, geom); if (prog) upload(id, geom); },
    update(id, geom) { geoms.set(id, geom); if (prog) upload(id, geom, gl.DYNAMIC_DRAW); },
    draw,
    restore: init,
  };
}
