// The stage: one WebGL 1 canvas behind the page. Each frame the SDF scene renders into an offscreen
// buffer at an adaptive scale with a sub-pixel jitter, line and point layers add their light on top,
// the result blends into a history (temporal anti-aliasing), bloom runs at quarter size, and a
// composite pass writes the screen. A lost context falls back to the CSS light and rebuilds on
// restore, as on Delta.
import { VERT, SCENE, SCENE_UNIFORMS } from './sdf.js';
import { BRIGHT, BLUR, COMPOSITE, RESOLVE } from './post.js';

export const FLOOR_Y = -1.35;
// Outer and inner march steps for quality tiers 0, 1 and 2.
const STEPS = [[56, 0], [84, 28], [110, 40]];
// Eight sub-pixel offsets (Halton 2, 3), in pixels of the scene buffer.
const halton = (i, b) => { let f = 1, r = 0; for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; };
const JITTER = Array.from({ length: 8 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5]);
const SETTLE_FRAMES = 30;
const TAA = !new URLSearchParams(location.search).has('taa') || new URLSearchParams(location.search).get('taa') !== '0';

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.warn('[stage] shader:', gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

function program(gl, fs, uniforms) {
  const v = compile(gl, gl.VERTEX_SHADER, VERT);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    console.warn('[stage] link:', gl.getProgramInfoLog(prog));
    return null;
  }
  const u = {};
  for (const n of uniforms) u[n] = gl.getUniformLocation(prog, n);
  return { prog, u };
}

function makeTarget(gl, w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}

export function createStage(canvas) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  if (!hp || hp.precision < 16) return null; // the SDF needs highp in fragment shaders

  const root = document.documentElement;
  const layers = [];
  let ready = false;
  let quad = null;
  let P = {};
  let T = {};
  let css = { w: 1, h: 1 }, dpr = 1, quality = 1, coarse = false, tier = 2;
  let reset = true, frameNo = 0, settle = 0;

  function sizeTargets() {
    canvas.width = Math.max(1, Math.round(css.w * Math.min(dpr, 2)));
    canvas.height = Math.max(1, Math.round(css.h * Math.min(dpr, 2)));
    // The scene's density follows quality, capped by a pixel budget (smaller on touch devices).
    let k = Math.min(dpr, 1.5) * quality * (coarse ? 0.9 : 1);
    const budget = coarse ? 5.5e5 : 2.2e6;
    const px = css.w * css.h * k * k;
    if (px > budget) k *= Math.sqrt(budget / px);
    const sw = Math.max(1, Math.round(css.w * k));
    const sh = Math.max(1, Math.round(css.h * k));
    if (!T.scene || T.scene.w !== sw || T.scene.h !== sh) {
      for (const t of Object.values(T)) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      const bw = Math.max(1, Math.round(sw / 4)), bh = Math.max(1, Math.round(sh / 4));
      T = {
        scene: makeTarget(gl, sw, sh), histA: makeTarget(gl, sw, sh), histB: makeTarget(gl, sw, sh),
        bloomA: makeTarget(gl, bw, bh), bloomB: makeTarget(gl, bw, bh),
      };
      reset = true;
    }
    tier = quality >= 0.85 ? 2 : quality >= 0.62 ? 1 : 0;
  }

  function init() {
    P = {
      scene: program(gl, SCENE, SCENE_UNIFORMS),
      bright: program(gl, BRIGHT, ['uTex', 'uTexel']),
      blur: program(gl, BLUR, ['uTex', 'uDir']),
      comp: program(gl, COMPOSITE, ['uScene', 'uBloom', 'uRes', 'uTime', 'uBloomAmt', 'uGrain', 'uVignette', 'uCA']),
      resolve: program(gl, RESOLVE, ['uCur', 'uHist', 'uTexel', 'uAlpha', 'uFrame']),
    };
    if (!P.scene || !P.bright || !P.blur || !P.comp || !P.resolve) return false;
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    T = {};
    sizeTargets();
    for (const l of layers) l.restore(gl);
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

  function bindQuad() {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }
  function use(target, p) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
    gl.useProgram(p.prog);
  }
  function tex(unit, t, loc) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform1i(loc, unit);
  }

  function render(f) {
    if (!ready) return;
    const s = f.state, U = P.scene.u;
    // Temporal AA only when the caller says how much is moving; the history converges while little does.
    const taa = TAA && typeof f.motion === 'number';
    const motion = taa ? f.motion : 1;
    settle = motion < 0.02 ? Math.max(0, settle - 1) : SETTLE_FRAMES;
    const [jx, jy] = taa ? JITTER[frameNo++ % JITTER.length] : [0, 0];
    const cam = { ...f.cam, shiftX: f.cam.shiftX + (2 * jx) / T.scene.w, shiftY: f.cam.shiftY + (2 * jy) / T.scene.h };
    f = { ...f, cam };
    gl.disable(gl.BLEND);
    bindQuad();
    use(T.scene, P.scene);
    gl.uniform2f(U.uRes, T.scene.w, T.scene.h);
    gl.uniform3fv(U.uCamPos, cam.pos);
    gl.uniform3fv(U.uCamFwd, cam.fwd);
    gl.uniform3fv(U.uCamRight, cam.right);
    gl.uniform3fv(U.uCamUp, cam.up);
    gl.uniform4f(U.uLens, cam.tanHalf, cam.aspect, cam.shiftX, cam.shiftY);
    gl.uniform1f(U.uTime, f.time);
    // f.rot is row-major; WebGL reads matrices column-major, so the shader sees its transpose, which
    // for a rotation is the inverse the SDF wants (world to object).
    gl.uniformMatrix3fv(U.uRotInv, false, f.rot);
    const o = f.obj ?? [s.objX, s.objY, s.objZ];
    gl.uniform4f(U.uObj, o[0], o[1], o[2], s.objScale);
    gl.uniform1f(U.uBound, f.bound);
    gl.uniform4f(U.uShape, s.wBox, s.wPrism, s.wSphere, s.solid);
    gl.uniform4f(U.uBox, s.boxW, s.boxH, s.boxD, s.boxR);
    gl.uniform3f(U.uPrism, s.prismSide, s.prismDepth, 0.07);
    gl.uniform1f(U.uSphere, s.sphereR);
    gl.uniform4f(U.uLayers, s.layers, s.layerGap, s.layerHi, s.layerHiI);
    gl.uniform4f(U.uMat, s.mGlass, s.mMetal, s.mMirror, s.mDark);
    gl.uniform4f(U.uMat2, s.fog, s.layerAll, s.edge, s.layerSpan);
    gl.uniform4f(U.uMat3, s.mPlanet, s.rim, s.backdrop, s.rep > 2.5 ? s.repGap : 0);
    gl.uniform4f(U.uFan, s.fan, 7, 0.13, 2.2);
    gl.uniform2f(U.uRep, s.rep, s.repGap);
    gl.uniform4f(U.uSat, s.sat, 0.3, 0.62, 1.5);
    gl.uniform4f(U.uLight, f.light[0], f.light[1], f.light[2], f.lightI ?? s.lightI);
    gl.uniform4f(U.uLight2, f.lightR ?? s.lightR, s.warmth, 0, 0);
    gl.uniform4f(U.uStage, FLOOR_Y, s.floor, s.exposure, tier);
    gl.uniform2f(U.uSteps, STEPS[tier][0], STEPS[tier][1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Line layers add their light into the same buffer, screen-blended: in the compressed buffer that
    // adds light and saturates smoothly instead of clipping where lines cross.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
    for (const l of layers) l.draw(f, T.scene.w, T.scene.h, T.scene.w / css.w);
    gl.disable(gl.BLEND);

    // Blend into the history; a reset (new size, first frame) takes the new frame alone.
    bindQuad();
    const hist = T.histA, out = T.histB;
    use(out, P.resolve);
    tex(0, T.scene, P.resolve.u.uCur);
    tex(1, hist, P.resolve.u.uHist);
    gl.uniform2f(P.resolve.u.uTexel, 1 / T.scene.w, 1 / T.scene.h);
    gl.uniform1f(P.resolve.u.uAlpha, reset || !taa ? 1 : Math.min(1, Math.max(0.1, 0.1 + 0.9 * motion)));
    gl.uniform1f(P.resolve.u.uFrame, frameNo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    reset = false;
    T.histA = out;
    T.histB = hist;
    const img = out;

    // Bloom at quarter size: a bright pass, then a horizontal and a vertical blur.
    use(T.bloomA, P.bright);
    tex(0, img, P.bright.u.uTex);
    gl.uniform2f(P.bright.u.uTexel, 1 / T.scene.w, 1 / T.scene.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    use(T.bloomB, P.blur);
    tex(0, T.bloomA, P.blur.u.uTex);
    gl.uniform2f(P.blur.u.uDir, 1 / T.bloomA.w, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    use(T.bloomA, P.blur);
    tex(0, T.bloomB, P.blur.u.uTex);
    gl.uniform2f(P.blur.u.uDir, 0, 1 / T.bloomA.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Composite to the screen.
    use(null, P.comp);
    tex(0, img, P.comp.u.uScene);
    tex(1, T.bloomA, P.comp.u.uBloom);
    gl.uniform2f(P.comp.u.uRes, canvas.width, canvas.height);
    gl.uniform1f(P.comp.u.uTime, f.time);
    gl.uniform1f(P.comp.u.uBloomAmt, s.bloom);
    gl.uniform1f(P.comp.u.uGrain, f.reduced ? 0 : 0.045);
    gl.uniform1f(P.comp.u.uVignette, 0.35);
    gl.uniform1f(P.comp.u.uCA, tier === 2 ? 0.012 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  ready = init();
  if (!ready) return null;
  return {
    gl,
    resize(w, h, ratio, q, isCoarse) {
      css = { w: Math.max(1, w), h: Math.max(1, h) };
      dpr = ratio || 1;
      quality = q;
      coarse = !!isCoarse;
      if (ready) sizeTargets();
    },
    render,
    reset() { reset = true; },
    get settling() { return settle > 0; },
    addLayer(l) { layers.push(l); },
    get tier() { return tier; },
    get info() { return { scene: T.scene ? `${T.scene.w}x${T.scene.h}` : '-', tier, quality }; },
    // For checking in the browser: RGBA bytes at (x, y) of a named target (y from the bottom).
    peek(name, x, y) {
      const t = T[name];
      if (!t) return null;
      const px = new Uint8Array(4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.readPixels(Math.round(x * t.w), Math.round(y * t.h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return [...px];
    },
  };
}
