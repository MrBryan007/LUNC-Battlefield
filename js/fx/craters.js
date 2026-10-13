/* LUNC Battlefield v12 — persistent terrain damage / craters (three.js r128, visual only).
 *
 * Tiers (read live from LUNCBattle.quality.getEffectiveName()):
 *   HIGH / ULTRA : CPU vertex displacement of the terrain mesh (bowl + raised rim, accumulating, clamped)
 *                  + dynamic damage texture (1024²) blended into terrain.ground via onBeforeCompile.
 *   MEDIUM       : damage texture only (512²), no deformation → terrainHeight unchanged.
 *   LOW          : pooled multiply-blended decal quads (one InstancedMesh, cap 60) that fade out.
 * Accumulation lives in a heightfield aligned 1:1 with the terrain vertex grid, so the mesh and
 * terrainHeight() agree exactly. Session-persistent; optional slow decay (DECAY_PER_S, default 0).
 *
 * Contract: graphics only. The market frontline / price mapping is NOT driven by this; frontline math only
 * reads prices. Units/props that sample terrainHeight() each frame follow the deformed ground automatically
 * (terrain.js consults LUNCBattle.craters.offsetAt). Static props placed at load do not move.
 *
 * Public API (LUNCBattle.craters):
 *   impact(x, z, scale, opts?)     → queue a hit. opts.mode: 'player' | 'ambient' | 'scorch'; default = current mode
 *   withMode(mode, fn)             → run fn with a default mode (commander wraps its booms with 'player';
 *                                    EMP / flare wrap with 'scorch' = light scorch, no crater)
 *   offsetAt(x, z)                 → current lowering (positive = down; negative = rim). 0 below HIGH.
 *   heightAt(x, z)                 → terrainHeight incl. damage (alias of LUNCBattle.terrain.terrainHeight)
 *   getStats(), reset()
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle || (global.LUNCBattle = {});

  var CAPS = {
    opsPerFrame: 3,        // deformation ops applied per frame
    queueMax: 32,          // pending ops; oldest ambient dropped first
    maxDepth: 0.9,         // world units below base
    maxRim: 0.32,          // world units above base
    texUploadMs: 90,       // min interval between damage-texture uploads
    decals: 60,            // LOW pool
    decalLife: 45          // seconds
  };
  var DECAY_PER_S = 0;     // e.g. 0.002 → craters relax ~0.1 per minute
  var TEX = { HIGH: 1024, ULTRA: 1024, MEDIUM: 512 };

  var THREE = null, ground = null, geo = null, pos = null, nor = null;
  var vx = 0, vz = 0, x0 = 0, z0 = 0, dx = 1, dz = 1, W = 138, D = 82;
  var base = null, off = null;       // Float32Array per vertex
  var queue = [], mode = 'ambient';
  var deformOn = false, texOn = false, decalOn = false, tierName = '';
  var canvas = null, ctx = null, tex = null, texDirty = false, texT = 0, texSize = 0;
  var uniforms = { dmgMap: { value: null }, dmgOn: { value: 0 } };
  var decals = null, decalData = [], decalNext = 0;
  var dirty = null;                  // {ix0, ix1, iz0, iz1}
  var stats = { impacts: 0, deformOps: 0, dropped: 0, scorchOnly: 0, decals: 0, tier: '', normalUpdates: 0 };
  var ready = false;

  function q() { return LB.quality && LB.quality.getEffectiveName ? LB.quality.getEffectiveName() : 'HIGH'; }

  // ------------------------------------------------------------- grid helpers
  function offsetAt(x, z) {
    if (!deformOn || !off) return 0;
    var fx = (x - x0) / dx, fz = (z - z0) / dz;
    if (fx < 0 || fz < 0 || fx > vx - 1 || fz > vz - 1) return 0;
    var ix = Math.floor(fx), iz = Math.floor(fz);
    var tx = fx - ix, tz = fz - iz;
    var ix1 = Math.min(vx - 1, ix + 1), iz1 = Math.min(vz - 1, iz + 1);
    var a = off[iz * vx + ix], b = off[iz * vx + ix1], c = off[iz1 * vx + ix], d = off[iz1 * vx + ix1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  function markDirty(ix0, ix1, iz0, iz1) {
    if (!dirty) dirty = { ix0: ix0, ix1: ix1, iz0: iz0, iz1: iz1 };
    else {
      dirty.ix0 = Math.min(dirty.ix0, ix0); dirty.ix1 = Math.max(dirty.ix1, ix1);
      dirty.iz0 = Math.min(dirty.iz0, iz0); dirty.iz1 = Math.max(dirty.iz1, iz1);
    }
  }

  function deform(op) {
    var r = op.r, depth = op.depth;
    // overlap widens the rim: existing depth at centre → up to +40% radius
    var existing = Math.max(0, offsetAtRaw(op.x, op.z));
    var rimR = r * (1.1 + 0.4 * Math.min(1, existing / CAPS.maxDepth));
    var reach = rimR + r * 0.6;
    var lo = toIdx(op.x - reach, op.z - reach), hi = toIdx(op.x + reach, op.z + reach);
    var ax0 = Math.max(0, Math.min(lo.ix, hi.ix) - 1), ax1 = Math.min(vx - 1, Math.max(lo.ix, hi.ix) + 1);
    var az0 = Math.max(0, Math.min(lo.iz, hi.iz) - 1), az1 = Math.min(vz - 1, Math.max(lo.iz, hi.iz) + 1);
    for (var iz = az0; iz <= az1; iz++) {
      for (var ix = ax0; ix <= ax1; ix++) {
        var i = iz * vx + ix;
        var px = x0 + ix * dx, pz = z0 + iz * dz;
        var ddx = px - op.x, ddz = pz - op.z;
        var t = Math.sqrt(ddx * ddx + ddz * ddz) / r;
        var delta = 0;
        if (t < 1) delta += depth * (1 - t * t);                                     // bowl
        var rt = (t * r - rimR) / (r * 0.28);
        delta -= depth * 0.38 * Math.exp(-rt * rt);                                  // rim (negative = raise)
        if (!delta) continue;
        var v = off[i] + delta;
        off[i] = v > CAPS.maxDepth ? CAPS.maxDepth : (v < -CAPS.maxRim ? -CAPS.maxRim : v);
      }
    }
    markDirty(ax0, ax1, az0, az1);
    stats.deformOps++;
  }
  function offsetAtRaw(x, z) { var s = deformOn; deformOn = true; var v = offsetAt(x, z); deformOn = s; return v; }
  function toIdx(x, z) { return { ix: Math.round((x - x0) / dx), iz: Math.round((z - z0) / dz) }; }

  /** Apply offsets for a vertex rect and recompute normals only there (central differences). */
  function flushGeometry() {
    if (!dirty) return;
    var d = dirty; dirty = null;
    var ix, iz, i;
    for (iz = d.iz0; iz <= d.iz1; iz++) for (ix = d.ix0; ix <= d.ix1; ix++) {
      i = iz * vx + ix; pos.setY(i, base[i] - (deformOn ? off[i] : 0));
    }
    var nx0 = Math.max(0, d.ix0 - 1), nx1 = Math.min(vx - 1, d.ix1 + 1);
    var nz0 = Math.max(0, d.iz0 - 1), nz1 = Math.min(vz - 1, d.iz1 + 1);
    var sx = 2 * Math.abs(dx), sz = 2 * Math.abs(dz);
    for (iz = nz0; iz <= nz1; iz++) for (ix = nx0; ix <= nx1; ix++) {
      i = iz * vx + ix;
      var hl = pos.getY(iz * vx + Math.max(0, ix - 1)), hr = pos.getY(iz * vx + Math.min(vx - 1, ix + 1));
      var hd = pos.getY(Math.max(0, iz - 1) * vx + ix), hu = pos.getY(Math.min(vz - 1, iz + 1) * vx + ix);
      var gx = (hr - hl) / sx * Math.sign(dx), gz = (hu - hd) / sz * Math.sign(dz);
      var len = Math.sqrt(gx * gx + 1 + gz * gz);
      nor.setXYZ(i, -gx / len, 1 / len, -gz / len);
    }
    // contiguous row range → one partial upload per attribute
    var start = nz0 * vx, count = (nz1 - nz0 + 1) * vx;
    pos.updateRange.offset = start * 3; pos.updateRange.count = count * 3; pos.needsUpdate = true;
    nor.updateRange.offset = start * 3; nor.updateRange.count = count * 3; nor.needsUpdate = true;
    geo.computeBoundingSphere();
    stats.normalUpdates++;
  }

  // ------------------------------------------------------------- damage texture
  function ensureTexture(size) {
    if (texSize === size && tex) return;
    var old = canvas;
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
    if (old) ctx.drawImage(old, 0, 0, size, size);   // keep history across tier switches
    if (tex) tex.dispose();
    tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    uniforms.dmgMap.value = tex;
    texSize = size;
  }
  function paint(x, z, r, strength, scorchOnly) {
    if (!ctx) return;
    var u = (x + W / 2) / W * texSize, v = (z + D / 2) / D * texSize;
    var pr = r * 1.6 / W * texSize;
    ctx.globalCompositeOperation = 'multiply';
    var g = ctx.createRadialGradient(u, v, 0, u, v, pr);
    var a = Math.min(1, strength);
    if (scorchOnly) {
      g.addColorStop(0, 'rgba(70,66,58,' + (0.45 * a) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      g.addColorStop(0, 'rgba(18,14,10,' + (0.9 * a) + ')');        // charred bowl
      g.addColorStop(0.45, 'rgba(62,44,28,' + (0.7 * a) + ')');
      g.addColorStop(0.72, 'rgba(120,88,56,' + (0.4 * a) + ')');   // turned-up dirt on the rim
      g.addColorStop(1, 'rgba(255,255,255,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(u, v, pr, 0, Math.PI * 2); ctx.fill();
    texDirty = true;
  }

  function patchMaterial(mat) {
    if (!mat || mat.userData.v12Craters) return;
    mat.userData.v12Craters = true;
    var prev = mat.onBeforeCompile;
    mat.onBeforeCompile = function (shader, r) {
      if (prev) prev.call(this, shader, r);
      shader.uniforms.dmgMap = uniforms.dmgMap;
      shader.uniforms.dmgOn = uniforms.dmgOn;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vDmgUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDmgUv = vec2((position.x + ' + (W / 2).toFixed(1) + ') / ' + W.toFixed(1) + ', (position.z + ' + (D / 2).toFixed(1) + ') / ' + D.toFixed(1) + ');');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D dmgMap;\nuniform float dmgOn;\nvarying vec2 vDmgUv;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (dmgOn > 0.5) { vec3 dmg = texture2D(dmgMap, vDmgUv).rgb; diffuseColor.rgb *= dmg; }');
    };
    mat.customProgramCacheKey = function () { return 'v12craters'; };
    mat.needsUpdate = true;
  }

  // ------------------------------------------------------------- LOW decals
  function ensureDecals(scene) {
    if (decals) return;
    var g = new THREE.CircleGeometry(1, 14); g.rotateX(-Math.PI / 2);
    var m = new THREE.MeshBasicMaterial({
      // v12.0.5: normal alpha blending. MultiplyBlending × the soft-dot map turned the dot's transparent edge (rgb 0)
      // into solid black discs on LOW ("black ground patches"). Fade is now done by shrinking + darkening toward the ground tone.
      color: 0x2a2117, alphaMap: LB.proctex && LB.proctex.blobMask ? LB.proctex.blobMask(THREE) : null,   // opaque grayscale mask (softDot's rgb is 1 to the edge)
      transparent: true, opacity: 0.62, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false
    });
    decals = new THREE.InstancedMesh(g, m, CAPS.decals);
    decals.count = 0; decals.frustumCulled = false; decals.renderOrder = 1; decals.name = 'v12-crater-decals';
    decals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (var i = 0; i < CAPS.decals; i++) decalData.push({ life: 0, s: 0, dark: 0 });
    var c = new THREE.Color(1, 1, 1);
    for (var j = 0; j < CAPS.decals; j++) decals.setColorAt(j, c);
    scene.add(decals);
  }
  var _m4 = null, _c = null;
  function addDecal(x, z, r, dark) {
    var i = decalNext; decalNext = (decalNext + 1) % CAPS.decals;
    var d = decalData[i]; d.life = CAPS.decalLife; d.dark = dark;
    var y = (LB.terrain && LB.terrain.terrainHeight ? LB.terrain.terrainHeight(x, z) : 0) + 0.05;
    d.x = x; d.y = y; d.z = z; d.r = r;
    _m4.makeScale(r * 1.4, 1, r * 1.4).setPosition(x, y, z);
    decals.setMatrixAt(i, _m4);
    decals.count = Math.max(decals.count, i + 1);
    decals.instanceMatrix.needsUpdate = true;
    stats.decals = decals.count;
  }
  function tickDecals(dt) {
    if (!decals) return;
    var any = false;
    for (var i = 0; i < decals.count; i++) {
      var d = decalData[i];
      if (d.life <= 0) continue;
      d.life -= dt;
      var k = Math.max(0, Math.min(1, d.life / (CAPS.decalLife * 0.4)));    // fade during the last 40 %
      var v = 0.55 + 0.45 * Math.min(1, d.dark), sc = d.r * 1.4 * (0.25 + 0.75 * k);   // darker = deeper scar; shrink to fade
      _c.setRGB(v, v, v);
      decals.setColorAt(i, _c);
      if (d.r) { _m4.makeScale(k > 0 ? sc : 0.0001, 1, k > 0 ? sc : 0.0001).setPosition(d.x, d.y, d.z); decals.setMatrixAt(i, _m4); decals.instanceMatrix.needsUpdate = true; }
      any = true;
    }
    if (any && decals.instanceColor) decals.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------- public
  function impact(x, z, scale, opts) {
    if (!ready) return false;
    var m = (opts && opts.mode) || mode;
    var TH = global.LUNCBattle && global.LUNCBattle.theaters;
    if (TH && TH.isWater && TH.isWater(x, z)) { if (TH.splash) TH.splash(x, z, scale); return true; }   // v12: water = splash, no crater
    scale = Math.max(0.2, Math.min(3.5, scale || 1));
    var r = 0.8 + 1.0 * scale;
    stats.impacts++;
    if (m === 'scorch') stats.scorchOnly++;
    if (decalOn) { addDecal(x, z, r * (m === 'scorch' ? 0.7 : 1), m === 'scorch' ? 0.35 : (m === 'player' ? 0.75 : 0.55)); return true; }
    if (texOn) paint(x, z, r, m === 'player' ? 1 : (m === 'scorch' ? 0.7 : 0.55), m === 'scorch');
    if (deformOn && m !== 'scorch') {
      var depth = 0.16 * scale * (m === 'player' ? 1 : 0.35);
      if (queue.length >= CAPS.queueMax) {
        var k = -1; for (var j = 0; j < queue.length; j++) if (queue[j].mode !== 'player') { k = j; break; }
        queue.splice(k >= 0 ? k : 0, 1); stats.dropped++;
      }
      queue.push({ x: x, z: z, r: r, depth: depth, mode: m });
    }
    return true;
  }

  function applyTier() {
    var t = q();
    if (t === tierName) return;
    var wasDeform = deformOn;
    tierName = t; stats.tier = t;
    deformOn = t === 'HIGH' || t === 'ULTRA';
    texOn = !!TEX[t];
    decalOn = !texOn;
    if (texOn) { ensureTexture(TEX[t]); patchMaterial(ground.material); }
    uniforms.dmgOn.value = texOn ? 1 : 0;
    if (decals) decals.visible = decalOn;
    if (wasDeform !== deformOn) markDirty(0, vx - 1, 0, vz - 1);   // apply / revert accumulated deformation once
  }

  var lastT = 0;
  function update() {
    if (!ready) return;
    var now = performance.now(), dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0; lastT = now;
    applyTier();
    var n = Math.min(CAPS.opsPerFrame, queue.length);
    for (var i = 0; i < n; i++) deform(queue.shift());
    if (DECAY_PER_S > 0 && deformOn && dt) {
      var k = DECAY_PER_S * dt;
      for (var j = 0; j < off.length; j++) if (off[j]) off[j] = Math.abs(off[j]) < k ? 0 : off[j] - Math.sign(off[j]) * k;
      markDirty(0, vx - 1, 0, vz - 1);
    }
    flushGeometry();
    if (texDirty && tex && now - texT > CAPS.texUploadMs) { tex.needsUpdate = true; texDirty = false; texT = now; }
    if (decalOn) tickDecals(dt);
  }

  function init(o) {
    if (ready || !o || !o.THREE || !o.ground) return;
    THREE = o.THREE; ground = o.ground; geo = ground.geometry;
    pos = geo.attributes.position; nor = geo.attributes.normal;
    if (!nor) { geo.computeVertexNormals(); nor = geo.attributes.normal; }
    var p = geo.parameters || {};
    W = p.width || 138; D = p.height || 82;
    vx = (p.widthSegments || 160) + 1; vz = (p.heightSegments || 90) + 1;
    if (vx * vz !== pos.count) { console.warn('[craters] unexpected terrain grid; disabled'); return; }
    x0 = pos.getX(0); z0 = pos.getZ(0); dx = pos.getX(1) - x0; dz = pos.getZ(vx) - z0;
    base = new Float32Array(pos.count); off = new Float32Array(pos.count);
    for (var i = 0; i < pos.count; i++) base[i] = pos.getY(i);
    pos.setUsage(THREE.DynamicDrawUsage); nor.setUsage(THREE.DynamicDrawUsage);
    _m4 = new THREE.Matrix4(); _c = new THREE.Color();
    ensureDecals(o.scene);
    ready = true;
    applyTier();
  }

  function withMode(m, fn) { var prev = mode; mode = m; try { return fn(); } finally { mode = prev; } }

  LB.craters = {
    init: init, update: update, impact: impact, withMode: withMode, offsetAt: offsetAt,
    heightAt: function (x, z) { return LB.terrain && LB.terrain.terrainHeight ? LB.terrain.terrainHeight(x, z) : -offsetAt(x, z); },
    isReady: function () { return ready; },
    reset: function () { if (!ready) return; off.fill(0); queue.length = 0; markDirty(0, vx - 1, 0, vz - 1); if (ctx) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, texSize, texSize); texDirty = true; } },
    getStats: function () { var s = Object.assign({}, stats); s.queue = queue.length; s.deform = deformOn; s.texture = texOn ? texSize : 0; s.decalMode = decalOn; s.grid = vx + 'x' + vz; return s; },
    CAPS: CAPS
  };
})(window);
