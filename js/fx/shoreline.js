/* LUNC Battlefield v12.0.38 — Sea surface: whitecaps, rolling breakers and wet sand (realism checklist: sea, terrain,
 * materials). Hooked from js/theaters/theaters.js buildOcean() through LB.shoreline.patch().
 *  - Whitecaps: foam on the crests of the ocean shader's own wave function, broken up by drifting value noise, more in
 *    rain. Shallow water near the beach shades lighter and greener; deep water stays dark. (Crest foam needs the
 *    displaced MEDIUM+ ocean; LOW / phones keep the shallow-water shading.)
 *  - Breakers: the old flat pulsing strip is replaced by a surf band where sets of foam lines roll in toward the beach,
 *    break up along the shore, churn at the waterline and wash up the sand and back (swash).
 *  - Wet sand: a darker, glossier band along the waterline that follows the swash; rain wets the whole beach.
 * Cosmetic only: never touches market data, armies, the front or data-truth labels.
 * Kill switch: ?shore=0 (also off with ?realism=0 or ?seaair=0). API: LB.shoreline.getState(). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('shore') !== '0' && qs.get('realism') !== '0' && qs.get('seaair') !== '0';
  var U = { uShT: { value: 0 }, uShRain: { value: 0 }, uShWaves: { value: 0 } };
  var state = { enabled: enabled, patched: false, waves: false, ocean: false, breakers: false, sand: false, rain: 0, shore: 62, errors: 0 };
  var surf = null;

  var NOISE = [
    'float shHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float shNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(shHash(i), shHash(i + vec2(1.0, 0.0)), f.x), mix(shHash(i + vec2(0.0, 1.0)), shHash(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float shFbm(vec2 p) { return shNoise(p) * 0.6 + shNoise(p * 2.13 + 7.1) * 0.3 + shNoise(p * 4.7 + 3.3) * 0.1; }'
  ].join('\n');
  function head(sh, extra) {
    sh.uniforms.uShT = U.uShT; sh.uniforms.uShRain = U.uShRain; sh.uniforms.uShWaves = U.uShWaves;
    sh.vertexShader = 'varying vec3 vShW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vShW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform float uShT;\nuniform float uShRain;\nuniform float uShWaves;\nvarying vec3 vShW;\n' + NOISE + '\n' + (extra || '') + sh.fragmentShader;
  }
  function chain(m, key, fn) {
    var prev = m.onBeforeCompile;
    m.onBeforeCompile = function (sh, r) { if (prev) prev.call(this, sh, r); try { fn(sh); } catch (e) { state.errors++; console.warn('[shoreline]', e); } };
    var pk = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : null;
    m.customProgramCacheKey = function () { return (pk ? pk() : '') + '|' + key; };
    m.needsUpdate = true;
  }
  function swashGLSL(S) {   // how far up the sand (m) the current swash reaches at world x
    return 'float shSwash(float x) { return 1.6 + 1.3 * sin(uShT * 0.62 + shNoise(vec2(x * 0.045, 1.7)) * 6.28) + 0.4 * sin(uShT * 1.37 + x * 0.11); }\n';
  }

  function patchOcean(m, S, oz) {
    chain(m, 'shore-ocean', function (sh) {
      head(sh, swashGLSL(S));
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', ' transformed.y *= smoothstep(0.0, 12.0, position.z + ' + oz.toFixed(1) + ' - ' + S.toFixed(1) + ');\n#include <project_vertex>');
      var mix = [
        '#include <color_fragment>',
        ' float shD = vShW.z - ' + S.toFixed(1) + ';',
        ' float shShallow = 1.0 - smoothstep(0.0, 46.0, shD);',
        ' diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.19, 0.17), shShallow * 0.6);',
        ' float shLx = vShW.x, shLz = vShW.z - ' + oz.toFixed(1) + ';',
        ' float shW = (sin(shLx * 0.09 + uShT * 1.1) * 0.35 + sin(shLz * 0.13 + uShT * 0.8) * 0.25) / 0.6 * smoothstep(0.0, 12.0, shD);',
        ' float shN = shFbm(vec2(vShW.x * 0.24 + uShT * 0.08, vShW.z * 0.3 - uShT * 0.05));',
        ' float shCap = uShWaves * smoothstep(0.6 - uShRain * 0.25, 0.97, shW) * smoothstep(0.5 - uShRain * 0.12, 0.8, shN);',
        ' shCap *= 0.7 * (1.0 - smoothstep(180.0, 320.0, shD));',
        ' float shFoam = clamp(shCap, 0.0, 1.0);',
        ' diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.80, 0.83, 0.84), shFoam);'
      ].join('\n');
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', mix)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.85, shFoam);');
    });
    state.ocean = true;
  }
  function patchSand(m, S) {
    chain(m, 'shore-sand', function (sh) {
      head(sh, swashGLSL(S));
      var wet = [
        '#include <color_fragment>',
        ' float shD = vShW.z - ' + S.toFixed(1) + ';',
        ' float shReach = shSwash(vShW.x);',
        ' float shN2 = shNoise(vec2(vShW.x * 0.2, 3.0)) * 0.8;',
        ' float shWet = 1.0 - smoothstep(2.2 + shN2, 3.8 + shN2, -shD);',   // the band the sea always keeps damp
        ' shWet = max(shWet, 1.0 - smoothstep(shReach - 0.3, shReach + 0.6, -shD));',   // where the swash just ran up
        ' shWet = clamp(max(shWet, uShRain * 0.65) * step(-14.0, shD) * (1.0 - step(6.0, shD)), 0.0, 1.0);',
        ' diffuseColor.rgb *= mix(1.0, 0.45, shWet);'
      ].join('\n');
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', wet)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.62, shWet);');
    });
    state.sand = true;
  }
  function buildSurf(THREE, parent, S, width, oz, waves) {
    var g = new THREE.PlaneGeometry(width, 22, waves ? 160 : 1, waves ? 22 : 1); g.rotateX(-Math.PI / 2);
    var m = new THREE.MeshBasicMaterial({ color: 0xf4f7f7, transparent: true, opacity: 1, depthWrite: false });
    m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
    chain(m, 'shore-surf', function (sh) {
      head(sh, swashGLSL(S));
      // ride the same swell as the ocean on the water side, sit just above the sand on the beach side
      sh.vertexShader = 'uniform float uShT;\nuniform float uShWaves;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        ' vec4 shWp = modelMatrix * vec4(transformed, 1.0);',
        ' float shWd = shWp.z - ' + S.toFixed(1) + ';',
        ' float shWv = uShWaves * smoothstep(0.0, 12.0, shWd) * (sin(shWp.x * 0.09 + uShT * 1.1) * 0.35 + sin((shWp.z - ' + oz.toFixed(1) + ') * 0.13 + uShT * 0.8) * 0.25);',
        ' float shWy = -0.35 + shWv + 0.05;',
        ' transformed.y += mix(-0.27, max(shWy, -0.27), smoothstep(-0.5, 1.5, shWd)) - modelMatrix[3].y;'
      ].join('\n'));
      var mask = [
        '#include <color_fragment>',
        ' float shD = vShW.z - ' + S.toFixed(1) + ';',
        ' float shX = vShW.x;',
        // rolling foam lines: sets move toward the shore (f constant → d shrinks as time grows), stronger as they break
        ' float shF = fract(shD / 5.2 + uShT * 0.21 + shNoise(vec2(shX * 0.02, 0.3)) * 0.6);',
        ' float shLine = smoothstep(0.0, 0.05, shF) * (1.0 - smoothstep(0.05, 0.28 + 0.1 * shNoise(vec2(shX * 0.3, shD)), shF));',
        ' float shBreak = shFbm(vec2(shX * 0.16 + uShT * 0.03, shD * 0.35 - uShT * 0.5));',
        ' float shAmp = smoothstep(17.0, 3.5, shD) * smoothstep(-0.2, 0.8, shD);',
        ' float shRoll = shLine * shAmp * smoothstep(0.3, 0.62, shBreak + shAmp * 0.25);',
        ' float shTrail = (1.0 - smoothstep(0.0, 0.6, shF)) * shAmp * 0.35 * smoothstep(0.45, 0.8, shBreak);',
        // churn at the waterline
        ' float shChurn = smoothstep(2.8, 0.2, shD) * smoothstep(-0.6, 0.1, shD) * (0.45 + 0.55 * shFbm(vec2(shX * 0.35 - uShT * 0.2, shD * 0.8 + uShT * 0.6)));',
        // swash: a thin bright edge that slides up the sand and back, with a faint film behind it
        ' float shR = shSwash(shX), shE = -shD;',
        ' float shEdge = (1.0 - smoothstep(0.0, 0.2, abs(shE - shR))) * step(0.0, shE) * (0.25 + 0.3 * shNoise(vec2(shX * 0.8, uShT)));',
        ' float shFilm = step(0.0, shE) * (1.0 - smoothstep(shR - 0.2, shR, shE)) * 0.07;',
        ' float shA = clamp(max(max(shRoll + shTrail, shChurn), max(shEdge, shFilm)), 0.0, 1.0);',
        ' shA *= smoothstep(-6.5, -4.5, shD) * (1.0 - smoothstep(15.5, 17.5, shD));',
        ' diffuseColor.a *= shA * 0.88;'
      ].join('\n');
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', mask);
    });
    surf = new THREE.Mesh(g, m); surf.name = 'v12-surf'; surf.position.set(0, 0, S + 5); surf.renderOrder = 2; parent.add(surf);
    state.breakers = true; return surf;
  }

  /** o: { THREE, root, ocean, beach, foam, shore, oceanZ, waves, width } */
  function patch(o) {
    if (!enabled || state.patched || !o || !o.THREE) return false;
    try {
      state.shore = o.shore; state.waves = !!o.waves; U.uShWaves.value = o.waves ? 1 : 0;
      if (o.ocean && o.ocean.material) patchOcean(o.ocean.material, o.shore, o.oceanZ);
      if (o.beach && o.beach.material) { o.beach.material = o.beach.material.clone(); patchSand(o.beach.material, o.shore); }
      buildSurf(o.THREE, o.root, o.shore, o.width, o.oceanZ, o.waves);
      if (o.foam) o.foam.visible = false;   // the old pulsing strip
      state.patched = true; return true;
    } catch (e) { state.errors++; console.warn('[shoreline] patch', e); return false; }
  }
  function rainy() { try { return LB.v12extras.getOptions().weather === 'rain'; } catch (_) { return false; } }
  /** t: the ocean shader's own time (so crests line up with the displaced waves), dt for the rain fade */
  function update(t, dt) {
    if (!state.patched) return;
    U.uShT.value = t;
    var want = rainy() ? 1 : 0; U.uShRain.value += (want - U.uShRain.value) * Math.min(1, (dt || 0) * 0.6);
    state.rain = Math.round(U.uShRain.value * 100) / 100;
  }
  LB.shoreline = { version: 'v12.0.38', isEnabled: function () { return enabled; }, patch: patch, update: update,
    getState: function () { return Object.assign({}, state); }, _surf: function () { return surf; } };
})(window);
