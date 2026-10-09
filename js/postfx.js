/* LUNC Battlefield v10 — lightweight post-processing for Three r128 (original code)
 *
 * Scene → (MSAA or plain) HDR-ish target → dual-filter bloom mip chain →
 * one composite pass: bloom add, linear→sRGB, vignette, colour grade, FXAA-lite, dither.
 *
 * Scene materials keep ACES tone mapping (no program recompiles when toggled). Hot FX use
 * toneMapped:false + additive blending, so they exceed 1.0 in a half-float target and bloom.
 *
 * Tiers come from quality presets: postFxHooks { bloom, aa, levels, strength }.
 * LOW = off (direct render, identical to v9). Disable anytime with ?postfx=0.
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};

  var VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
  ].join('\n');

  // Soft-knee bright pass + 4-tap box downsample
  var PREFILTER = [
    'uniform sampler2D tMap; uniform vec2 texel; uniform float threshold; uniform float knee;',
    'varying vec2 vUv;',
    'vec3 pf(vec3 c){ float br = max(c.r, max(c.g, c.b));',
    '  float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee); rq = (rq * rq) / (4.0 * knee + 1e-4);',
    '  float w = max(rq, br - threshold) / max(br, 1e-4); return c * w; }',
    'void main(){',
    '  vec3 a = texture2D(tMap, vUv + texel * vec2(-1.0,-1.0)).rgb;',
    '  vec3 b = texture2D(tMap, vUv + texel * vec2( 1.0,-1.0)).rgb;',
    '  vec3 c = texture2D(tMap, vUv + texel * vec2(-1.0, 1.0)).rgb;',
    '  vec3 d = texture2D(tMap, vUv + texel * vec2( 1.0, 1.0)).rgb;',
    '  vec3 col = pf((a + b + c + d) * 0.25);',
    '  gl_FragColor = vec4(min(col, vec3(16.0)), 1.0); }'
  ].join('\n');

  // Dual-Kawase downsample
  var DOWN = [
    'uniform sampler2D tMap; uniform vec2 texel; varying vec2 vUv;',
    'void main(){',
    '  vec3 s = texture2D(tMap, vUv).rgb * 4.0;',
    '  s += texture2D(tMap, vUv - texel).rgb;',
    '  s += texture2D(tMap, vUv + texel).rgb;',
    '  s += texture2D(tMap, vUv + vec2(texel.x, -texel.y)).rgb;',
    '  s += texture2D(tMap, vUv - vec2(texel.x, -texel.y)).rgb;',
    '  gl_FragColor = vec4(s / 8.0, 1.0); }'
  ].join('\n');

  // Dual-Kawase upsample (tent) + add the finer level
  var UP = [
    'uniform sampler2D tMap; uniform sampler2D tAdd; uniform vec2 texel; uniform float radius; varying vec2 vUv;',
    'void main(){',
    '  vec2 o = texel * radius;',
    '  vec3 s = texture2D(tMap, vUv + vec2(-o.x * 2.0, 0.0)).rgb;',
    '  s += texture2D(tMap, vUv + vec2(-o.x, o.y)).rgb * 2.0;',
    '  s += texture2D(tMap, vUv + vec2(0.0, o.y * 2.0)).rgb;',
    '  s += texture2D(tMap, vUv + vec2(o.x, o.y)).rgb * 2.0;',
    '  s += texture2D(tMap, vUv + vec2(o.x * 2.0, 0.0)).rgb;',
    '  s += texture2D(tMap, vUv + vec2(o.x, -o.y)).rgb * 2.0;',
    '  s += texture2D(tMap, vUv + vec2(0.0, -o.y * 2.0)).rgb;',
    '  s += texture2D(tMap, vUv + vec2(-o.x, -o.y)).rgb * 2.0;',
    '  gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb, 1.0); }'
  ].join('\n');

  var COMPOSITE = [
    'uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 texel;',
    'uniform float bloomStrength; uniform float useBloom; uniform float useFxaa;',
    'uniform float vignette; uniform float saturation; uniform float contrast; uniform float time;',
    'uniform vec3 lift; uniform vec3 gain; uniform float flash;',
    'varying vec2 vUv;',
    'vec3 toSRGB(vec3 c){ c = max(c, vec3(0.0));',
    '  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(vec3(0.0031308), c)); }',
    'float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }',
    'vec3 fetch(vec2 uv){ return texture2D(tScene, uv).rgb; }',
    'vec3 fxaa(vec2 uv){',
    '  vec3 rgbM = fetch(uv);',
    '  vec3 rgbNW = fetch(uv + vec2(-1.0,-1.0) * texel); vec3 rgbNE = fetch(uv + vec2(1.0,-1.0) * texel);',
    '  vec3 rgbSW = fetch(uv + vec2(-1.0, 1.0) * texel); vec3 rgbSE = fetch(uv + vec2(1.0, 1.0) * texel);',
    '  float lM = luma(toSRGB(min(rgbM, vec3(1.0)))); float lNW = luma(toSRGB(min(rgbNW, vec3(1.0))));',
    '  float lNE = luma(toSRGB(min(rgbNE, vec3(1.0)))); float lSW = luma(toSRGB(min(rgbSW, vec3(1.0))));',
    '  float lSE = luma(toSRGB(min(rgbSE, vec3(1.0))));',
    '  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));',
    '  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));',
    '  if (lMax - lMin < max(0.0312, lMax * 0.125)) return rgbM;',
    '  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));',
    '  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0/128.0);',
    '  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);',
    '  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * texel;',
    '  vec3 a = 0.5 * (fetch(uv + dir * (1.0/3.0 - 0.5)) + fetch(uv + dir * (2.0/3.0 - 0.5)));',
    '  vec3 b = a * 0.5 + 0.25 * (fetch(uv - dir * 0.5) + fetch(uv + dir * 0.5));',
    '  float lB = luma(toSRGB(min(b, vec3(1.0))));',
    '  return (lB < lMin || lB > lMax) ? a : b; }',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }',
    'void main(){',
    '  vec3 col = useFxaa > 0.5 ? fxaa(vUv) : fetch(vUv);',
    '  if (useBloom > 0.5) col += texture2D(tBloom, vUv).rgb * bloomStrength;',
    '  col += flash * vec3(1.0, 0.92, 0.75);',
    // soft shoulder for HDR FX above 1 (scene itself is already ACES-mapped)
    '  col = col / (1.0 + max(col - 1.0, 0.0) * 0.6);',
    '  col = col * gain + lift * (1.0 - col);',
    '  vec3 c = toSRGB(col);',
    '  float l = luma(c);',
    '  c = mix(vec3(l), c, saturation);',
    '  c = (c - 0.5) * contrast + 0.5;',
    '  vec2 q = vUv - 0.5; float v = 1.0 - dot(q, q) * vignette;',
    '  c *= clamp(v, 0.0, 1.0);',
    '  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;',
    '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }'
  ].join('\n');

  var THREE = null, renderer = null;
  var quadScene = null, quadCam = null, quad = null;
  var mats = {};
  var sceneRT = null, mips = [], upRTs = [];
  var w = 0, h = 0;
  var active = false;
  var cfg = { bloom: false, aa: 'fxaa', levels: 4, strength: 0.65, threshold: 0.82, msaa: 0 };
  var hdrType = null;
  var disabled = false;
  var lastError = null;
  var flashAmt = 0;
  var tmpSize = null;
  var t0 = performance.now();

  function urlDisabled() {
    try { return new URLSearchParams(location.search).get('postfx') === '0'; } catch (_) { return false; }
  }

  function shader(frag, uniforms) {
    return new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: VERT, fragmentShader: frag,
      depthTest: false, depthWrite: false, toneMapped: false
    });
  }

  function pickType() {
    if (hdrType != null) return hdrType;
    hdrType = THREE.UnsignedByteType;
    try {
      var caps = renderer.capabilities;
      var ext = renderer.extensions;
      var half = (caps.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'))) ||
        (!caps.isWebGL2 && ext.has('OES_texture_half_float') && ext.has('EXT_color_buffer_half_float'));
      if (half) hdrType = THREE.HalfFloatType;
    } catch (_) {}
    return hdrType;
  }

  function makeRT(rw, rh, depth, samples) {
    var opts = {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: pickType(),
      depthBuffer: !!depth, stencilBuffer: false
    };
    var rt;
    if (samples && THREE.WebGLMultisampleRenderTarget && renderer.capabilities.isWebGL2) {
      rt = new THREE.WebGLMultisampleRenderTarget(rw, rh, opts);
      rt.samples = samples;
    } else {
      rt = new THREE.WebGLRenderTarget(rw, rh, opts);
    }
    rt.texture.generateMipmaps = false;
    return rt;
  }

  function disposeTargets() {
    if (sceneRT) sceneRT.dispose();
    sceneRT = null;
    mips.forEach(function (r) { r.dispose(); });
    upRTs.forEach(function (r) { r.dispose(); });
    mips = []; upRTs = [];
  }

  function buildTargets() {
    disposeTargets();
    sceneRT = makeRT(w, h, true, cfg.aa === 'msaa' ? (cfg.msaa || 4) : 0);
    if (!cfg.bloom) return;
    var mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
    for (var i = 0; i < cfg.levels; i++) {
      mips.push(makeRT(mw, mh, false, 0));
      if (i < cfg.levels - 1) upRTs.push(makeRT(mw, mh, false, 0));
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
    }
  }

  function verifyTarget() {
    // If the half-float target is incomplete on this GPU, fall back to 8-bit once.
    try {
      var gl = renderer.getContext();
      renderer.setRenderTarget(sceneRT);
      var st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      renderer.setRenderTarget(null);
      if (st !== gl.FRAMEBUFFER_COMPLETE && hdrType !== THREE.UnsignedByteType) {
        hdrType = THREE.UnsignedByteType;
        buildTargets();
      }
    } catch (e) { lastError = String(e && e.message || e); }
  }

  function ensureSize() {
    if (!tmpSize) tmpSize = new THREE.Vector2();
    renderer.getDrawingBufferSize(tmpSize);
    var nw = Math.max(1, tmpSize.x | 0), nh = Math.max(1, tmpSize.y | 0);
    if (nw !== w || nh !== h || !sceneRT) {
      w = nw; h = nh;
      buildTargets();
      verifyTarget();
    }
  }

  function init(opts) {
    THREE = opts.THREE || global.THREE;
    renderer = opts.renderer;
    disabled = urlDisabled();
    quadScene = new THREE.Scene();
    quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    quad = new THREE.Mesh(geo, null);
    quad.frustumCulled = false;
    quadScene.add(quad);
    mats.pre = shader(PREFILTER, { tMap: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0.82 }, knee: { value: 0.35 } });
    mats.down = shader(DOWN, { tMap: { value: null }, texel: { value: new THREE.Vector2() } });
    mats.up = shader(UP, { tMap: { value: null }, tAdd: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1.0 } });
    mats.comp = shader(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, texel: { value: new THREE.Vector2() },
      bloomStrength: { value: 0.65 }, useBloom: { value: 0 }, useFxaa: { value: 1 },
      vignette: { value: 0.9 }, saturation: { value: 1.18 }, contrast: { value: 1.12 }, time: { value: 0 },
      lift: { value: new THREE.Vector3(0.012, 0.014, 0.022) }, gain: { value: new THREE.Vector3(1.02, 1.0, 0.97) },
      flash: { value: 0 }
    });
    global.addEventListener('lunc-quality-change', function (e) {
      try { configureFromPreset(e && e.detail && e.detail.preset); } catch (_) {}
    });
    try {
      if (LB.quality && LB.quality.getEffectivePreset) configureFromPreset(LB.quality.getEffectivePreset());
    } catch (_) {}
    return api;
  }

  function configureFromPreset(p) {
    var hooks = (p && p.postFxHooks) || {};
    var want = !!(hooks.bloom || (hooks.aa && hooks.aa !== 'none')) && !disabled;
    var next = {
      bloom: !!hooks.bloom,
      aa: hooks.aa || 'none',
      levels: hooks.levels || 4,
      strength: hooks.strength != null ? hooks.strength : 0.65,
      threshold: hooks.threshold != null ? hooks.threshold : 0.82,
      msaa: hooks.msaa || 4
    };
    var rebuild = next.bloom !== cfg.bloom || next.aa !== cfg.aa || next.levels !== cfg.levels;
    cfg = next;
    active = want;
    if (!active) { disposeTargets(); w = h = 0; return; }
    if (rebuild) { w = h = 0; }
  }

  function blit(mat, target) {
    quad.material = mat;
    renderer.setRenderTarget(target);
    renderer.render(quadScene, quadCam);
  }

  function render(scene, camera) {
    if (!active) { renderer.render(scene, camera); return; }
    try {
      ensureSize();
      var info = renderer.info;
      var prevAuto = info.autoReset;
      info.autoReset = false;
      info.reset();
      var prevTM = renderer.toneMapping;

      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);

      // post passes: no tone mapping on fullscreen shaders (they are toneMapped:false anyway)
      if (cfg.bloom && mips.length) {
        mats.pre.uniforms.tMap.value = sceneRT.texture;
        mats.pre.uniforms.texel.value.set(1 / w, 1 / h);
        mats.pre.uniforms.threshold.value = cfg.threshold;
        blit(mats.pre, mips[0]);
        for (var i = 1; i < mips.length; i++) {
          mats.down.uniforms.tMap.value = mips[i - 1].texture;
          mats.down.uniforms.texel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
          blit(mats.down, mips[i]);
        }
        var src = mips[mips.length - 1];
        for (var j = mips.length - 2; j >= 0; j--) {
          var dst = upRTs[j];
          if (dst.width !== mips[j].width) dst.setSize(mips[j].width, mips[j].height);
          mats.up.uniforms.tMap.value = src.texture;
          mats.up.uniforms.tAdd.value = mips[j].texture;
          mats.up.uniforms.texel.value.set(1 / src.width, 1 / src.height);
          blit(mats.up, dst);
          src = dst;
        }
        mats.comp.uniforms.tBloom.value = src.texture;
      }
      var cu = mats.comp.uniforms;
      cu.tScene.value = sceneRT.texture;
      cu.texel.value.set(1 / w, 1 / h);
      cu.useBloom.value = (cfg.bloom && mips.length) ? 1 : 0;
      cu.bloomStrength.value = cfg.strength;
      cu.useFxaa.value = cfg.aa === 'fxaa' ? 1 : 0;
      cu.time.value = ((performance.now() - t0) * 0.001) % 100;
      flashAmt *= 0.86;
      if (flashAmt < 0.002) flashAmt = 0;
      cu.flash.value = flashAmt;
      blit(mats.comp, null);
      renderer.toneMapping = prevTM;
      info.autoReset = prevAuto;
    } catch (e) {
      lastError = String(e && e.message || e);
      console.warn('[LUNCBattle.postfx] disabled after error', e);
      active = false; disabled = true;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    }
  }

  /** Brief full-screen warm flash (big detonations / player strikes). */
  function pulse(amount) { flashAmt = Math.min(0.18, flashAmt + (amount || 0.08)); }

  function getState() {
    return {
      active: active, bloom: cfg.bloom, aa: cfg.aa, levels: cfg.levels,
      hdr: hdrType === (THREE && THREE.HalfFloatType), size: w + 'x' + h, disabled: disabled, error: lastError
    };
  }

  var api = { init: init, render: render, pulse: pulse, isActive: function () { return active; }, getState: getState, configure: configureFromPreset };
  LB.postfx = api;
})(window);
