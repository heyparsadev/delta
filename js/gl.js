// WebGL 1 terrain renderer: one full-screen triangle, one field texture.
// Survives a lost context: the page falls back to the plain background, then rebuilds on restore.
import { VERT, FRAG } from './shaders.js';
import { GLOBE } from './story.js';

const UNIFORMS = ['uRes', 'uCam', 'uT', 'uTime', 'uMotion', 'uField', 'uFieldRect', 'uBand', 'uLens',
  'uLensBand', 'uDim', 'uIntro', 'uLobe', 'uPaleoT', 'uFocus', 'uCenter', 'uR', 'uTilt', 'uCoastEdge'];

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.warn('[terrain] shader:', gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function link(gl) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    console.warn('[terrain] link:', gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

export function createTerrain(canvas, field, geo) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false });
  } catch {
    gl = null;
  }
  if (!gl) return null;

  const root = document.documentElement;
  const lobe = geo.lobes[0];
  const paleoT = geo.channels.find((c) => c.id === 'helpfinity').dryAt;
  let U = null;
  let ready = false;

  // Everything that lives on the GPU; runs again after a context restore.
  function init() {
    const prog = link(gl);
    if (!prog) return false;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.width, field.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    U = {};
    for (const name of UNIFORMS) U[name] = gl.getUniformLocation(prog, name);
    gl.uniform1i(U.uField, 0);
    gl.uniform4f(U.uFieldRect, field.rect[0], field.rect[1], field.rect[2], field.rect[3]);
    gl.uniform1f(U.uPaleoT, paleoT);
    gl.uniform2f(U.uCenter, GLOBE.cx, GLOBE.cy);
    gl.uniform1f(U.uR, GLOBE.R);
    gl.uniform2f(U.uCoastEdge, geo.coastEdge[0], geo.coastEdge[1]);
    gl.viewport(0, 0, canvas.width, canvas.height);
    return true;
  }

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // ask the browser to give it back
    ready = false;
    root.classList.add('no-webgl');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    ready = init();
    if (ready) root.classList.remove('no-webgl');
  });

  ready = init();
  if (!ready) return null;

  let scale = 1;

  function resize(cssW, cssH, dpr, quality = 1) {
    scale = Math.min(1.5, dpr || 1) * quality; // soft terrain does not need full retina density
    canvas.width = Math.max(1, Math.round(cssW * scale));
    canvas.height = Math.max(1, Math.round(cssH * scale));
    if (ready) gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(st) {
    if (!ready) return;
    const W = canvas.width, H = canvas.height;
    gl.uniform2f(U.uRes, W, H);
    gl.uniform3f(U.uCam, st.cam.x, st.cam.y, st.cam.h / H);
    gl.uniform1f(U.uT, st.T);
    gl.uniform1f(U.uTime, st.time);
    gl.uniform1f(U.uMotion, st.reduced ? 0 : 1);
    gl.uniform3f(U.uBand, st.bandFrom ?? st.band, st.band, st.bandMix ?? 1);
    const lens = st.lens || { x: 0, y: 0, r: 0, on: false };
    gl.uniform4f(U.uLens, lens.x * scale, H - lens.y * scale, lens.r * scale, lens.on ? 1 : 0);
    gl.uniform1f(U.uLensBand, (st.band + 1) % 3);
    gl.uniform1f(U.uDim, st.dim || 0);
    gl.uniform1f(U.uIntro, st.intro ?? 1);
    gl.uniform4f(U.uLobe, lobe.x, lobe.y, lobe.rx, lobe.ry * smooth(lobe.t0, lobe.t1, st.T));
    const fp = st.focusPoint || st.cam;
    gl.uniform2f(U.uFocus, fp.x, fp.y);
    gl.uniform2f(U.uTilt, Math.cos(st.tilt || 0), Math.sin(st.tilt || 0));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return { resize, render, get scale() { return scale; } };
}
