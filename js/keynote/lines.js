// Glowing lines in the scene buffer: polylines widened in screen space and drawn additively with the
// stage camera and the object's transform (or in world space). A reveal draws them like a pen, with a
// bright tip. Each line can carry its own colour; layers that move are rebuilt with update().
const VS = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aAlong;
attribute vec3 aColor;
uniform vec3 uCamPos;
uniform vec3 uCamFwd;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec4 uLens;
uniform mat3 uRot;
uniform vec4 uObj;
uniform vec2 uRes;
uniform float uWidth;
varying float vSide;
varying float vAlong;
varying vec3 vColor;
vec3 ndc(vec3 p) {
  vec3 w = uRot * (p * uObj.w) + uObj.xyz;
  vec3 d = w - uCamPos;
  float z = max(dot(d, uCamFwd), 1e-3);
  return vec3(dot(d, uCamRight) / (z * uLens.x * uLens.y) + uLens.z, dot(d, uCamUp) / (z * uLens.x) + uLens.w, z);
}
void main() {
  vec3 c = ndc(aPos);
  vec3 a = ndc(aPrev);
  vec3 b = ndc(aNext);
  vec2 dir = (b.xy - a.xy) * uRes;
  dir = length(dir) > 1e-6 ? normalize(dir) : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  vec2 pos = c.xy + n * aSide * uWidth / uRes;
  gl_Position = vec4(pos * c.z, 0.0, c.z);
  vSide = aSide;
  vAlong = aAlong;
  vColor = aColor;
}`;

const FS = `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uReveal;
uniform float uTip;
varying float vSide;
varying float vAlong;
varying vec3 vColor;
void main() {
  float core = exp(-vSide * vSide * 3.0);
  float shown = uReveal >= 0.999 ? 1.0 : 1.0 - smoothstep(uReveal - 0.003, uReveal + 0.003, vAlong);
  float tip = exp(-pow((vAlong - uReveal) * 60.0, 2.0)) * uTip;
  // The scene buffer is tone-compressed (c / (1 + c)), so a line's core stays near 0.55 (about 1.2 in
  // real terms) and only the pen tip goes brighter; overlaps saturate through screen blending.
  gl_FragColor = vec4(uColor * vColor * min(core * (shown * 0.55 + tip * 0.8) * uAlpha, 0.92), 1.0);
}`;

const ATTRS = ['aPos', 'aPrev', 'aNext', 'aSide', 'aAlong', 'aColor'];
const UNIFORMS = ['uCamPos', 'uCamFwd', 'uCamRight', 'uCamUp', 'uLens', 'uRot', 'uObj', 'uRes', 'uWidth', 'uColor', 'uAlpha', 'uReveal', 'uTip'];
export const STRIP_FLOATS = 14;
const FLOATS = STRIP_FLOATS;
const WHITE = [1, 1, 1];
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Two vertices per point (one on each side) and two triangles per segment. `along` is the point's
// distance along the whole drawing (or along its own line, when measured in parallel), from 0 to 1,
// and each vertex carries its line's colour. Pure, for the tests.
export function buildStrips(geom) {
  const count = geom.lines.reduce((n, l) => n + l.length, 0);
  const verts = new Float32Array(count * 2 * FLOATS);
  const idx = [];
  let v = 0, base = 0;
  geom.lines.forEach((line, k) => {
    const n = line.length;
    const c = geom.colors?.[k] ?? WHITE;
    for (let i = 0; i < n; i++) {
      const p = line[i], a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
      const along = geom.cum[k][i] / geom.total;
      for (const side of [-1, 1]) {
        verts.set([p[0], p[1], p[2], a[0], a[1], a[2], b[0], b[1], b[2], side, along, c[0], c[1], c[2]], v);
        v += FLOATS;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const q = base + i * 2;
      idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
    base += n * 2;
  });
  return { verts, idx: new Uint16Array(idx) };
}

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.warn('[lines] shader:', gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export function createLines(gl) {
  let prog = null;
  let U = {};
  const geoms = new Map(); // kept, so a restored context can rebuild the buffers
  const bufs = new Map();

  function upload(id, geom, usage = gl.STATIC_DRAW) {
    const { verts, idx } = buildStrips(geom);
    const old = bufs.get(id);
    if (old && old.verts === verts.length && old.count === idx.length) {
      gl.bindBuffer(gl.ARRAY_BUFFER, old.vb);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, old.ib);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, idx);
      return;
    }
    if (old) { gl.deleteBuffer(old.vb); gl.deleteBuffer(old.ib); }
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, usage);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, usage);
    bufs.set(id, { vb, ib, count: idx.length, verts: verts.length });
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
      if (!gl.isContextLost()) console.warn('[lines] link:', gl.getProgramInfoLog(p));
      return;
    }
    prog = p;
    U = {};
    for (const n of UNIFORMS) U[n] = gl.getUniformLocation(prog, n);
    for (const [id, geom] of geoms) upload(id, geom);
  }

  function draw(f, w, h, pxScale) {
    if (!prog || !f.lines) return;
    const cam = f.cam, s = f.state, o = f.obj ?? [s.objX, s.objY, s.objZ];
    gl.useProgram(prog);
    gl.uniform3fv(U.uCamPos, cam.pos);
    gl.uniform3fv(U.uCamFwd, cam.fwd);
    gl.uniform3fv(U.uCamRight, cam.right);
    gl.uniform3fv(U.uCamUp, cam.up);
    gl.uniform4f(U.uLens, cam.tanHalf, cam.aspect, cam.shiftX, cam.shiftY);
    gl.uniform2f(U.uRes, w, h);
    for (let i = 0; i < ATTRS.length; i++) gl.enableVertexAttribArray(i);
    const stride = FLOATS * 4;
    for (const [id, L] of Object.entries(f.lines)) {
      const b = bufs.get(id);
      if (!b || !(L.alpha > 0.002)) continue;
      // rotT is Rᵀ in row-major order, which WebGL reads column-major as R itself: object to world.
      // rotT is Rᵀ in row-major order, which WebGL reads column-major as R itself: object to world. A
      // layer can bring its own frame instead (the turning field), or live in world space.
      const fr = L.frame;
      gl.uniformMatrix3fv(U.uRot, false, fr ? fr.rotT : L.world ? IDENTITY : f.rotT);
      if (fr) gl.uniform4f(U.uObj, fr.at[0], fr.at[1], fr.at[2], fr.scale);
      else if (L.world) gl.uniform4f(U.uObj, 0, 0, 0, 1);
      else gl.uniform4f(U.uObj, o[0], o[1], o[2], s.objScale);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.vb);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.ib);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 24);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 36);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 40);
      gl.vertexAttribPointer(5, 3, gl.FLOAT, false, stride, 44);
      gl.uniform1f(U.uWidth, L.width * pxScale);
      gl.uniform3fv(U.uColor, L.color);
      gl.uniform1f(U.uAlpha, L.alpha);
      gl.uniform1f(U.uReveal, L.reveal);
      gl.uniform1f(U.uTip, L.tip || 0);
      gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
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
