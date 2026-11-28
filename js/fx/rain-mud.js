/* LUNC Battlefield v12.0.57 — Rain and mud on the armies (realism checklist, Materials: "no wet/muddy variation by weather").
 *
 * Cosmetic only (game/visual layer). Never touches market data, the price→X mapping, the frontline math, army counts,
 * combat or data-truth labels.
 *  - Owns two slow weather-wear levels, driven by Settings → WORLD weather:
 *      wet: soaks in over ~20 s of rain and dries over ~60 s (fog keeps a light damp ~15 %);
 *      mud: builds over ~90 s of rain, then cakes (wet brown → dry tan) and flakes off over ~4 min once it stops.
 *    Both feed one shared uniform object in the v12.0.14 camo shader (LUNCBattle.armyRealism.setWear): wet paint and
 *    fabric go darker and glossy; mud climbs from the tracks / boots with noisy splashes above the band. No per-material
 *    work, so it also runs on LOW / phones (flat camo path).
 *  - MEDIUM+: moving MBTs and SPGs near the camera throw brown mud spray off their running gear while the ground is wet.
 *  - Puddles: standing water in low, flat ground on both sides of the line (local minima of the terrain, never on
 *    the beach or the HQ / airbase pads). They fill after the ground is soaked, shrink as it dries, and ripple with
 *    rain drops on HIGH+. One instanced draw call for puddles and one for ripples; none on LOW / phones.
 * Kill switch: ?mud=0 (also off with ?realism=0). API: LUNCBattle.rainMud.getState().
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('mud') !== '0' && qs.get('realism') !== '0';

  var CAPS = { LOW: { puddles: 0, ripples: 0, spray: 0 }, MEDIUM: { puddles: 28, ripples: 0, spray: 0.5 }, HIGH: { puddles: 44, ripples: 90, spray: 1 }, ULTRA: { puddles: 60, ripples: 140, spray: 1 } };
  var LAND = { minX: -196, maxX: 196, minZ: -86, maxZ: 46 };
  var SPRAY_NEAR = 85;

  var THREE = null, pMesh = null, rMesh = null, pMat = null, rMat = null, capT = '', cap = CAPS.HIGH;
  var wet = 0, mud = 0, dry = 0, fill = 0, last = 0, tierAcc = 0, sprayAcc = 0, ripAcc = 0, uiAcc = 0, forced = null;
  var spots = [], ripples = [], rHead = 0;
  var state = { enabled: enabled, ready: false, tier: '', weather: 'clear', wet: 0, mud: 0, dry: 0, fill: 0, puddles: 0, ripples: 0, sprays: 0, sprayVehicles: 0, armyWear: false };
  var _m = null, _q = null, _p = null, _s = null, _c = null, _e = null;

  function E() { return LB.engine; }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function tierName() { try { var t = LB.quality.getEffectiveName(); if (E().mobile) t = 'LOW'; return CAPS[t] ? t : 'HIGH'; } catch (_) { return 'HIGH'; } }
  function weather() { try { return LB.v12extras.getOptions().weather || 'clear'; } catch (_) { return 'clear'; } }
  function det(i, s) { var x = Math.sin((i + 1.31) * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ---------------------------------------------------------------- puddle sites: low, flat, inland ground
  function findSpots(n) {
    var out = [], tries = 0, i = 0;
    while (out.length < n && tries < n * 40) {
      tries++; i++;
      var x = LAND.minX + det(i, 1) * (LAND.maxX - LAND.minX), z = LAND.minZ + det(i, 2) * (LAND.maxZ - LAND.minZ);
      if (Math.abs(x) > 180 && z < -15) continue;            // HQ / airbase pads
      var h = H(x, z), d = 2.2, hx = H(x + d, z), hX = H(x - d, z), hz = H(x, z + d), hZ = H(x, z - d);
      var slope = Math.max(Math.abs(hx - hX), Math.abs(hz - hZ)) / (2 * d);
      if (slope > 0.07) continue;                             // ~4°: water won't stand on a slope
      var rim = (hx + hX + hz + hZ) / 4 - h;                   // > 0 means a dip
      if (rim < -0.02 && tries < n * 30) continue;            // prefer dips; accept flat ground late
      var ok = true;
      for (var k = 0; k < out.length; k++) { var o = out[k]; if ((o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) < 64) { ok = false; break; } }
      if (!ok) continue;
      out.push({ x: x, z: z, y: h + 0.045 + Math.max(0, rim) * 0.4, r: 1.3 + det(i, 3) * 2.6, sx: 0.65 + det(i, 4) * 0.7, yaw: det(i, 5) * Math.PI, lag: det(i, 6) * 0.35 });
    }
    return out;
  }

  function softTex(ring) {
    try {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64; var g = cv.getContext('2d');
      var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      if (ring) { grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.72, 'rgba(255,255,255,0)'); grd.addColorStop(0.86, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
      else { grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.62, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.86, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    } catch (_) { return null; }
  }

  function build() {
    var e = E(); THREE = e.THREE;
    _m = new THREE.Matrix4(); _q = new THREE.Quaternion(); _p = new THREE.Vector3(); _s = new THREE.Vector3(); _c = new THREE.Color(); _e = new THREE.Euler();
    state.ready = true;
    alloc(tierName());
  }
  function alloc(t) {
    var e = E(); capT = t; cap = CAPS[t]; state.tier = t;
    if (pMesh) { e.scene.remove(pMesh); pMesh.dispose && pMesh.dispose(); pMesh = null; }
    if (rMesh) { e.scene.remove(rMesh); rMesh.dispose && rMesh.dispose(); rMesh = null; }
    spots = cap.puddles ? findSpots(cap.puddles) : []; ripples = []; rHead = 0;
    if (spots.length) {
      var g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2);
      // standing water: dark, very smooth, a bit metallic so it picks up the sky / sun highlight; alpha from a soft disc
      pMat = pMat || new THREE.MeshStandardMaterial({ color: 0x161c20, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0, alphaMap: softTex(false), depthWrite: false, envMapIntensity: 0.7,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      pMat.name = 'rainMud.puddle';
      pMesh = new THREE.InstancedMesh(g, pMat, spots.length); pMesh.name = 'rainPuddles'; pMesh.frustumCulled = false; pMesh.renderOrder = 2; pMesh.receiveShadow = false; pMesh.castShadow = false;
      pMesh.instanceMatrix.setUsage && pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      e.scene.add(pMesh); placePuddles();
    }
    if (cap.ripples && spots.length) {
      var rg = new THREE.PlaneGeometry(1, 1); rg.rotateX(-Math.PI / 2);
      rMat = rMat || new THREE.MeshBasicMaterial({ color: 0xffffff, map: softTex(true), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
        polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
      rMat.name = 'rainMud.ripple';
      rMesh = new THREE.InstancedMesh(rg, rMat, cap.ripples); rMesh.name = 'rainRipples'; rMesh.frustumCulled = false; rMesh.renderOrder = 3;
      rMesh.instanceMatrix.setUsage && rMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      rMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap.ripples * 3), 3);
      rMesh.count = 0; e.scene.add(rMesh);
    }
    state.puddles = spots.length;
  }
  function placePuddles() {
    if (!pMesh) return;
    var vis = 0;
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i], f = clamp01((fill - s.lag) / (1 - s.lag)), r = s.r * Math.sqrt(f);
      if (r < 0.05) { _m.makeScale(0, 0, 0); } else { vis++; _e.set(0, s.yaw, 0); _q.setFromEuler(_e); _p.set(s.x, s.y, s.z); _s.set(r, 1, r * s.sx); _m.compose(_p, _q, _s); }
      pMesh.setMatrixAt(i, _m);
    }
    pMesh.instanceMatrix.needsUpdate = true;
    pMat.opacity = 0.55 + 0.35 * clamp01(fill * 1.5);
    pMesh.visible = vis > 0;
    state.puddlesVisible = vis;
  }

  // ---------------------------------------------------------------- ripples (HIGH+): rain drops on standing water
  function tickRipples(dt, raining) {
    if (!rMesh) return;
    if (raining && fill > 0.15) {
      ripAcc += dt * 60;   // ~60 drops a second spread over the visible puddles
      while (ripAcc >= 1) {
        ripAcc -= 1; var s = spots[(Math.random() * spots.length) | 0], f = clamp01((fill - s.lag) / (1 - s.lag)), r = s.r * Math.sqrt(f);
        if (r < 0.3) continue;
        var a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * r * 0.8;
        ripples[rHead] = { x: s.x + Math.cos(a) * d, z: s.z + Math.sin(a) * d * s.sx, y: s.y + 0.01, t: 0, life: 0.55 + Math.random() * 0.3 };
        rHead = (rHead + 1) % cap.ripples;
      }
    }
    var n = 0;
    for (var i = 0; i < cap.ripples; i++) {
      var k = ripples[i];
      if (!k) { _m.makeScale(0, 0, 0); rMesh.setMatrixAt(i, _m); continue; }
      k.t += dt; var u = k.t / k.life;
      if (u >= 1) { ripples[i] = null; _m.makeScale(0, 0, 0); rMesh.setMatrixAt(i, _m); continue; }
      var sz = 0.08 + u * 0.55; _m.makeScale(sz, 1, sz); _m.setPosition(k.x, k.y, k.z); rMesh.setMatrixAt(i, _m);
      var b = 0.4 * (1 - u); _c.setRGB(b, b * 1.02, b * 1.06); rMesh.setColorAt ? rMesh.setColorAt(i, _c) : rMesh.instanceColor.setXYZ(i, _c.r, _c.g, _c.b);
      n++;
    }
    rMesh.count = cap.ripples; rMesh.instanceMatrix.needsUpdate = true; rMesh.instanceColor.needsUpdate = true; rMesh.visible = n > 0;
    state.ripples = n;
  }

  // ---------------------------------------------------------------- mud spray off moving vehicles (MEDIUM+)
  function tickSpray(dt) {
    var F = LB.heavyFx, e = E(); if (!F || !F.puff || !cap.spray || wet < 0.35 || !e.getArmies) { state.sprayVehicles = 0; return; }
    sprayAcc += dt; if (sprayAcc < 0.12) return; var step = sprayAcc; sprayAcc = 0;
    var A = e.getArmies(), f = e.controls && e.controls.target ? e.controls.target : e.camera.position, near2 = SPRAY_NEAR * SPRAY_NEAR, n = 0, budget = Math.round(14 * cap.spray);
    [A.bulls, A.bears].forEach(function (list) {
      if (!list) return;
      for (var i = 0; i < list.length && budget > 0; i++) {
        var u = list[i], ud = u.userData, t = ud.utype != null ? ud.utype : ud.type;
        if (t !== 1 && t !== 2) continue;
        var p = u.position, mp = ud._mudP;
        ud._mudP = { x: p.x, z: p.z };
        if (!mp || ud.wreckUntil || !u.visible) continue;
        var dx = p.x - f.x, dz = p.z - f.z; if (dx * dx + dz * dz > near2) continue;
        var v = Math.hypot(p.x - mp.x, p.z - mp.z) / step;
        if (v < 0.6 || v > 15) continue;
        n++;
        if (Math.random() > cap.spray * Math.min(1, v / 3) * wet) continue;
        budget--;
        var yaw = Math.atan2(p.x - mp.x, p.z - mp.z), side = Math.random() < 0.5 ? -1 : 1, half = t === 1 ? 1.1 : 0.65;
        var bx = p.x - Math.sin(yaw) * 1.6 + Math.cos(yaw) * half * side, bz = p.z - Math.cos(yaw) * 1.6 - Math.sin(yaw) * half * side;
        F.puff({ kind: 'dust', x: bx, y: H(bx, bz) + 0.35, z: bz, vx: -Math.sin(yaw) * 1.4, vy: 1.6 + Math.random() * 1.2, vz: -Math.cos(yaw) * 1.4, size: 0.28, grow: 1.4, life: 0.6, color: dry > 0.6 ? 0x6b5a44 : 0x3d2f22, opacity: 0.7, drag: 0.9 });
        state.sprays++;
      }
    });
    state.sprayVehicles = n;
  }

  // ---------------------------------------------------------------- wear model
  function tickWear(dt) {
    var w = forced ? forced.weather : weather(), rain = w === 'rain';
    state.weather = w;
    var wT = rain ? 1 : w === 'fog' ? 0.15 : 0;
    wet += (wT - wet) * Math.min(1, dt / (wT > wet ? 20 : 60));
    if (Math.abs(wT - wet) < 0.002) wet = wT;
    if (rain) { mud = Math.min(1, mud + dt / 90); dry = Math.max(0, dry - dt / 8); }
    else { if (wet < 0.35) dry = Math.min(1, dry + dt / 40); if (dry > 0.5) mud = Math.max(0, mud - dt / 240); }
    // standing water: fills once the ground is soaked, then shrinks slowly
    var fT = rain && wet > 0.6 ? 1 : 0;
    fill += (fT - fill) * Math.min(1, dt / (fT ? 40 : 120)); if (fill < 0.003 && !fT) fill = 0;
    var AR = LB.armyRealism;
    if (AR && AR.setWear) { AR.setWear(wet, mud, dry); state.armyWear = true; }
    return rain;
  }

  function update() {
    if (!enabled) return;
    var e = E(); if (!e || !e.THREE || !e.scene) return;
    if (!state.ready) { try { build(); } catch (err) { enabled = false; state.enabled = false; console.warn('[rain-mud]', err); return; } }
    var now = performance.now(), dt = Math.min(0.25, (now - (last || now)) / 1000); last = now;
    if (e.isPaused && e.isPaused()) return;
    tierAcc += dt; if (tierAcc > 2) { tierAcc = 0; var t = tierName(); if (t !== capT) alloc(t); }
    var rain = tickWear(dt);
    placePuddles();
    tickRipples(dt, rain);
    tickSpray(dt);
    state.wet = +wet.toFixed(3); state.mud = +mud.toFixed(3); state.dry = +dry.toFixed(3); state.fill = +fill.toFixed(3);
  }

  LB.rainMud = {
    version: 'v12.0.57', isEnabled: function () { return enabled; }, update: update,
    getState: function () { return Object.assign({}, state); },
    /** 0..1 levels for other UI (weather panel). */
    levels: function () { return { wet: wet, mud: mud, dry: dry, fill: fill }; },
    // test hooks: jump the wear model (simulates `sec` seconds of the given weather in 0.25 s steps), or set levels directly
    _soak: function (w, sec) { forced = { weather: w }; for (var t = 0; t < sec; t += 0.25) tickWear(0.25); forced = null; placePuddles(); return LB.rainMud.levels(); },
    _set: function (a, b, c, d) { wet = clamp01(a); mud = clamp01(b); dry = clamp01(c); fill = clamp01(d == null ? fill : d); if (LB.armyRealism && LB.armyRealism.setWear) LB.armyRealism.setWear(wet, mud, dry); placePuddles(); return LB.rainMud.levels(); }
  };
})(window);
