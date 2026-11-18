/* LUNC Battlefield v11.3 — real-time damage states + flying debris (game FX only).
 *
 * Debris: one InstancedMesh pool of shards (per-instance colour), ballistic arcs with spin, bounces on the
 * (crater-aware) terrainHeight(), smoke trail on large pieces, settle, fade after ~10 s.
 * Tier caps: ULTRA 300 · HIGH 180 · MEDIUM 80 · LOW 20 (simple shards, no trails); hard pool 300.
 * Damage states (cosmetic HP, never army size): vehicles/artillery/aircraft 100 HP →
 *   DAMAGED (<65: smoke) → HEAVY (<30: fire + smoke) → DESTROYED (≤0: turret pops, burning husk stays ~14 s and
 *   sinks; the market-driven unit "reinforces" afterwards — it is hidden by scale while the husk burns).
 * Buildings: DAMAGED / CRITICAL overlays + missing chunks (hidden child meshes) + DESTROYED (squashed rubble,
 *   fire) — restored on session reset or after 90 s.
 * Ticked from commander.tick(dt) → frozen on pause; reset() on session end.
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var E = function () { return LB.engine; };
  var CAPS = { LOW: 20, MEDIUM: 80, HIGH: 180, ULTRA: 300 }, POOL = 300;
  var THREE = null, scene = null, im = null, pieces = [], free = [];
  var turretPool = [], turrets = [];
  var damaged = [];       // units with active damage state
  var wrecks = [];        // { mesh, t, u }
  var bdmg = [];          // damaged buildings
  var stats = { spawned: 0, active: 0, wrecks: 0, destroyed: 0, buildingHits: 0 };
  var _m, _q, _e, _s, _c, _pv;
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function cap() { return CAPS[tierName()] || 80; }
  function lowTier() { return tierName() === 'LOW'; }

  function ensure() {
    if (im) return true;
    var e = E(); if (!e || !e.THREE) return false;
    THREE = e.THREE; scene = e.scene;
    var g = new THREE.BoxGeometry(1, 1, 1);
    var mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.25 });
    im = new THREE.InstancedMesh(g, mat, POOL);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true; im.count = POOL; im.name = 'v113-debris';
    _m = new THREE.Matrix4(); _q = new THREE.Quaternion(); _e = new THREE.Euler(); _s = new THREE.Vector3(); _pv = new THREE.Vector3(); _c = new THREE.Color();
    var zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (var i = 0; i < POOL; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, _c.setHex(0x555555)); free.push(i); pieces.push(null); }
    scene.add(im);
    return true;
  }

  /** Burst of shards. o: {x,y,z, n, power, palette:[hex], size, up, spread, trail} */
  function burst(o) {
    if (!ensure()) return 0;
    var c = cap(), active = POOL - free.length;
    var n = Math.min(o.n | 0, c - active, free.length);
    if (lowTier()) n = Math.min(n, 4);
    var pal = o.palette || [0x3d3f3a, 0x5a5d55, 0x2a2b28];
    for (var i = 0; i < n; i++) {
      var id = free.pop();
      var a = Math.random() * Math.PI * 2, sp = (o.spread || 3) * (0.4 + Math.random()) * Math.sqrt(o.power || 1);
      var sz = (o.size || 0.28) * (0.5 + Math.random() * 1.1);
      pieces[id] = {
        x: o.x + (Math.random() - 0.5) * 0.6, y: o.y + 0.2 + Math.random() * 0.4, z: o.z + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: (o.up || 5) * (0.55 + Math.random() * 0.7) * Math.min(2.2, Math.sqrt(o.power || 1)),
        rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 10, wz: (Math.random() - 0.5) * 14,
        sx: sz * (0.6 + Math.random()), sy: sz * (0.3 + Math.random() * 0.6), sz: sz * (0.6 + Math.random()),
        t: 0, life: 9 + Math.random() * 3, rest: false, trail: !lowTier() && (o.trail || sz > 0.4), trailT: 0, bounces: 0
      };
      var col = pal[(Math.random() * pal.length) | 0]; pieces[id].col = col;
      im.setColorAt(id, _c.setHex(col));
      stats.spawned++;
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    return n;
  }

  function popTurret(u, color) {
    if (!ensure() || lowTier()) return;
    var t = turretPool.pop();
    if (!t) {
      t = new THREE.Group();
      var m = new THREE.MeshStandardMaterial({ color: 0x3a3d36, roughness: 0.7, metalness: 0.4 });
      var dome = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.32, 8), m);
      var gun = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 6), m); gun.rotation.z = Math.PI / 2; gun.position.set(0.7, 0.04, 0);
      t.add(dome, gun); t.userData.mat = m;
    }
    t.userData.mat.color.setHex(color || 0x3a3d36);
    var p = u.position;
    t.position.set(p.x, p.y + 0.9, p.z); t.visible = true; t.scale.setScalar(1.25);
    t.userData.v = { vx: (Math.random() - 0.5) * 3, vy: 7 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, wx: (Math.random() - 0.5) * 8, wz: (Math.random() - 0.5) * 8, t: 0, rest: false };
    scene.add(t); turrets.push(t);
  }

  function wreckMesh(u) {
    var g = new THREE.Group();
    var m = new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 0.95, metalness: 0.1, emissive: 0x2a0d00, emissiveIntensity: 0.6 });
    var type = u.userData.type | 0;
    var hull = new THREE.Mesh(new THREE.BoxGeometry(type === 2 ? 1.4 : 1.9, 0.55, 1.1), m);
    hull.position.y = 0.3; hull.rotation.z = (Math.random() - 0.5) * 0.25; g.add(hull);
    if (type === 2) { var b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), m); b.rotation.z = 1.2; b.position.set(0.3, 0.7, 0); g.add(b); }
    g.position.copy(u.position); g.rotation.y = u.rotation.y + (Math.random() - 0.5) * 0.6;
    g.userData.mat = m;
    return g;
  }

  function isVehicle(u) { var t = u.userData.type | 0; return t >= 1 && t <= 4; }

  /** Damage one unit (ground vehicles / artillery / aircraft). Infantry are left to ragdoll.js. */
  function hitUnit(u, power, fromX, fromZ) {
    if (!u || !u.userData || !isVehicle(u) || u.userData.wreckUntil) return;
    var ud = u.userData;
    if (ud.dmgHp == null) ud.dmgHp = 100;
    var before = ud.dmgHp;
    ud.dmgHp -= 22 * power * (0.8 + Math.random() * 0.4);
    var air = ud.type === 3 || ud.type === 4;
    var pal = air ? [0x50565a, 0x6b6f62, 0x2a2b28] : [0x3d4436, 0x56604c, 0x2a2b28, 0x1d1f21];
    burst({ x: u.position.x, y: u.position.y + 0.4, z: u.position.z, n: Math.round(3 + power * 4), power: power, palette: pal, size: 0.22 });
    if (ud.dmgHp <= 0) destroy(u, power);
    else if (before >= 65 && ud.dmgHp < 65 || before >= 30 && ud.dmgHp < 30) { if (damaged.indexOf(u) < 0) damaged.push(u); }
  }

  function destroy(u, power) {
    var ud = u.userData, air = ud.type === 3 || ud.type === 4;
    stats.destroyed++;
    var p = u.position;
    burst({ x: p.x, y: p.y + 0.5, z: p.z, n: Math.round(10 + power * 10), power: power * 1.4, size: air ? 0.35 : 0.3, up: 7, spread: 4, trail: true,
      palette: air ? [0x50565a, 0x6b6f62, 0x8a8f94, 0x2a2b28] : [0x3d4436, 0x56604c, 0x2a2b28, 0x1d1f21, 0x6b5a3a] });
    if (ud.type === 1) popTurret(u);
    var dur = 14;
    ud.wreckUntil = performance.now() + dur * 1000;
    ud._dmgScale = u.scale.x || 1;
    if (!air) {
      var w = wreckMesh(u); scene.add(w);
      wrecks.push({ mesh: w, t: 0, dur: dur, u: u });
      if (LB.heavyFx) LB.heavyFx.zone({ kind: 'fire', x: p.x, z: p.z, r: 0.9, dur: dur * 0.6 });
    } else if (LB.persist) {
      var gx = p.x + (Math.random() - 0.5) * 3, gz = p.z + (Math.random() - 0.5) * 3;
      LB.persist.addWreck({ x: gx, z: gz, rotY: Math.random() * 6.28, sx: 2.2, sy: 0.35, sz: 0.7, color: 0x2a2b2c, tilt: 0.2 });
      if (LB.heavyFx) LB.heavyFx.zone({ kind: 'fire', x: gx, z: gz, r: 0.8, dur: 6 });
    }
    if (air && LB.heavyFx) {
      // aircraft: falling smoke trail of wing / rotor chunks
      for (var i = 0; i < 6; i++) LB.heavyFx.puff({ kind: 'smoke', x: p.x, y: p.y - i * 0.6, z: p.z, vy: -1.5, size: 1.2, grow: 1.5, life: 2.5, color: 0x2a2826, opacity: 0.5, delay: i * 0.12 });
    }
    u.scale.setScalar(0.001);
    var k = damaged.indexOf(u); if (k >= 0) damaged.splice(k, 1);
    stats.wrecks = wrecks.length;
  }

  function restoreUnit(u) {
    var ud = u.userData;
    ud.wreckUntil = 0; ud.dmgHp = 100;
    if (u.scale.x < 0.01) u.scale.setScalar(ud._dmgScale || 1);
  }

  // ------------------------------------------------------------ buildings
  var buildingsCache = null;
  function buildings() {
    if (buildingsCache) return buildingsCache;
    var out = [];
    E().scene.traverse(function (o) { if (o.userData && o.userData.kind && o.userData.damageState && o.isObject3D && o.type === 'Group') out.push(o); });
    buildingsCache = out;
    return out;
  }
  function setBState(b, s) {
    var ud = b.userData; ud.damageState = s;
    if (ud.damagedMesh) ud.damagedMesh.visible = s !== 'HEALTHY';
    if (ud.criticalMesh) ud.criticalMesh.visible = s === 'CRITICAL' || s === 'DESTROYED';
  }
  function hideChunks(b, frac) {
    var meshes = [];
    b.traverse(function (o) { if (o.isMesh && o.visible && o !== b.userData.damagedMesh && o !== b.userData.criticalMesh && !(o.userData && o.userData.v12Skin)) meshes.push(o); });
    var n = Math.floor(meshes.length * frac);
    b.userData.dmgHidden = b.userData.dmgHidden || [];
    for (var i = 0; i < n; i++) { var m = meshes[(Math.random() * meshes.length) | 0]; if (m.visible) { m.visible = false; b.userData.dmgHidden.push(m); } }
  }
  function hitBuildings(x, z, power) {
    var r = 2.5 + power * 1.8;
    buildings().forEach(function (b) {
      var p = new THREE.Vector3(); b.getWorldPosition(p);
      var dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz > r * r) return;
      var ud = b.userData;
      ud.dmgHp = (ud.dmgHp == null ? 100 : ud.dmgHp) - 18 * power;
      stats.buildingHits++;
      burst({ x: p.x, y: p.y + 1.2, z: p.z, n: Math.round(4 + power * 5), power: power, size: 0.32, up: 6, palette: [0x8b8478, 0xa59f92, 0x5d574c, 0x6e5636] });
      var s = ud.dmgHp <= 0 ? 'DESTROYED' : ud.dmgHp < 35 ? 'CRITICAL' : ud.dmgHp < 70 ? 'DAMAGED' : 'HEALTHY';
      if (s !== ud.damageState) {
        setBState(b, s);
        if (s === 'DAMAGED') hideChunks(b, 0.12);
        else if (s === 'CRITICAL') { hideChunks(b, 0.2); if (LB.heavyFx) LB.heavyFx.zone({ kind: 'fire', x: p.x, z: p.z, r: 1.2, dur: 12 }); }
        else if (s === 'DESTROYED') {
          ud._dmgScaleY = ud._dmgScaleY || b.scale.y; b.scale.y = ud._dmgScaleY * 0.45; ud.destroyedAt = performance.now();
          if (LB.heavyFx) LB.heavyFx.zone({ kind: 'fire', x: p.x, z: p.z, r: 1.6, dur: 20 });
        }
        if (bdmg.indexOf(b) < 0) bdmg.push(b);
      }
    });
  }
  function restoreBuilding(b) {
    var ud = b.userData;
    (ud.dmgHidden || []).forEach(function (m) { m.visible = true; }); ud.dmgHidden = [];
    if (ud._dmgScaleY) b.scale.y = ud._dmgScaleY;
    ud.dmgHp = 100; ud.destroyedAt = 0; setBState(b, 'HEALTHY');
  }

  /** Area blast from a player weapon: buildings + aircraft in radius + ground debris. */
  function blast(x, z, power, opts) {
    if (!ensure()) return;
    opts = opts || {};
    var e = E(), y = e.terrainHeight(x, z);
    burst({ x: x, y: y, z: z, n: Math.round(power * (opts.debrisMul || 3)), power: power, size: 0.2, up: 4 + power, spread: 2 + power, palette: [0x5c4a32, 0x6a5740, 0x3a2f22] });
    hitBuildings(x, z, power);
    if (power >= 1.2) {
      var A = e.getArmies(), all = A.bulls.concat(A.bears), r = 2 + power * 1.6;
      for (var i = 0; i < all.length; i++) {
        var u = all[i]; if (!u.userData || !(u.userData.type === 3 || u.userData.type === 4)) continue;
        var dx = u.position.x - x, dz = u.position.z - z;
        if (dx * dx + dz * dz < r * r && (opts.air || power >= 2)) hitUnit(u, power * 0.7, x, z);
      }
    }
  }

  // ------------------------------------------------------------ tick
  var emitT = 0;
  function update(dt) {
    if (!im || !dt) return;
    var e = E(), th = e.terrainHeight, now = performance.now();
    var activeN = 0;
    for (var i = 0; i < POOL; i++) {
      var p = pieces[i]; if (!p) continue;
      activeN++;
      p.t += dt;
      if (!p.rest) {
        p.vy -= 18 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
        var gy = th(p.x, p.z) + p.sy * 0.5;
        if (p.y < gy) {
          p.y = gy;
          if (Math.abs(p.vy) > 2 && p.bounces < 3) { p.vy = -p.vy * 0.35; p.vx *= 0.55; p.vz *= 0.55; p.wx *= 0.5; p.wz *= 0.5; p.bounces++; }
          else { p.rest = true; p.rx = Math.round(p.rx / (Math.PI / 2)) * (Math.PI / 2); p.rz = Math.round(p.rz / (Math.PI / 2)) * (Math.PI / 2); }
        }
        if (p.trail && LB.heavyFx && (p.trailT -= dt) <= 0) { p.trailT = 0.09; LB.heavyFx.puff({ kind: 'smoke', x: p.x, y: p.y, z: p.z, size: 0.35, grow: 1.4, life: 0.9, color: 0x3a3632, opacity: 0.35 }); }
      }
      // v11.3 persistence: a settled piece is frozen into the static batch (no fade, no more per-frame work)
      var P = LB.persist;
      if (P && p.rest && p.t > 1.2) {
        _e.set(p.rx, p.ry, p.rz); _q.setFromEuler(_e); _s.set(p.sx, p.sy, p.sz);
        _m.compose(_pv.set(p.x, p.y, p.z), _q, _s);
        P.addDebris(_m, p.col);
        pieces[i] = null; free.push(i); _m.makeScale(0, 0, 0); im.setMatrixAt(i, _m); continue;
      }
      var fade = p.t > p.life - 1.5 ? Math.max(0, (p.life - p.t) / 1.5) : 1;
      _e.set(p.rx, p.ry, p.rz); _q.setFromEuler(_e); _s.set(p.sx * fade, p.sy * fade, p.sz * fade);
      _m.compose(_pv.set(p.x, p.y - (1 - fade) * 0.2, p.z), _q, _s);
      im.setMatrixAt(i, _m);
      if (p.t >= p.life) { pieces[i] = null; free.push(i); _m.makeScale(0, 0, 0); im.setMatrixAt(i, _m); }
    }
    im.instanceMatrix.needsUpdate = true;
    stats.active = activeN;
    // turrets
    for (var ti = turrets.length - 1; ti >= 0; ti--) {
      var t = turrets[ti], v = t.userData.v; v.t += dt;
      if (!v.rest) {
        v.vy -= 18 * dt; t.position.x += v.vx * dt; t.position.y += v.vy * dt; t.position.z += v.vz * dt;
        t.rotation.x += v.wx * dt; t.rotation.z += v.wz * dt;
        var g2 = th(t.position.x, t.position.z) + 0.15;
        if (t.position.y < g2) { t.position.y = g2; if (v.vy < -3) { v.vy *= -0.3; v.vx *= 0.5; v.vz *= 0.5; } else v.rest = true; }
        if (LB.heavyFx && Math.random() < 0.5) LB.heavyFx.puff({ kind: 'smoke', x: t.position.x, y: t.position.y, z: t.position.z, size: 0.5, grow: 1.4, life: 1.1, color: 0x2e2a26, opacity: 0.4 });
      }
      if (v.rest && v.t > 2.5 && LB.persist) {   // freeze the popped turret into the debris batch
        t.updateMatrixWorld(true); _m.copy(t.matrixWorld); _m.scale(_pv.set(0.9, 0.35, 0.9)); LB.persist.addDebris(_m, 0x2c2e29);
        scene.remove(t); turrets.splice(ti, 1); turretPool.push(t); continue;
      }
      if (v.t > 11) { t.position.y -= dt * 0.4; if (v.t > 13) { scene.remove(t); turrets.splice(ti, 1); turretPool.push(t); } }
    }
    // wrecks: burn, then sink; unit reinforces after
    for (var wi = wrecks.length - 1; wi >= 0; wi--) {
      var w = wrecks[wi]; w.t += dt;
      w.mesh.userData.mat.emissiveIntensity = Math.max(0, 0.6 - w.t * 0.05) * (0.8 + Math.random() * 0.3);
      if (!LB.persist && w.t > w.dur - 3) w.mesh.position.y -= dt * 0.35;
      if (w.t >= w.dur && LB.persist) {   // burnt out → permanent husk in the static wreck batch, unit reinforces
        var ty = w.u.userData.type | 0;
        LB.persist.addWreck({ x: w.mesh.position.x, z: w.mesh.position.z, rotY: w.mesh.rotation.y, sx: ty === 2 ? 1.4 : 1.9, sy: 0.55, sz: 1.1, tilt: (Math.random() - 0.5) * 0.15 });
        scene.remove(w.mesh); w.mesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); restoreUnit(w.u); wrecks.splice(wi, 1); continue;
      }
      if (w.t >= w.dur) { scene.remove(w.mesh); w.mesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); restoreUnit(w.u); wrecks.splice(wi, 1); }
    }
    stats.wrecks = wrecks.length;
    // airborne wreck restore + damage emitters (smoke / fire on DAMAGED / HEAVY), 4 Hz
    emitT -= dt;
    if (emitT <= 0) {
      emitT = 0.25;
      var A = e.getArmies(), all = A.bulls.concat(A.bears);
      for (var k = 0; k < all.length; k++) { var u = all[k]; if (u.userData && u.userData.wreckUntil && now > u.userData.wreckUntil && (u.userData.type === 3 || u.userData.type === 4)) restoreUnit(u); }
      for (var d = damaged.length - 1; d >= 0; d--) {
        var du = damaged[d];
        if (!du.parent || du.userData.wreckUntil || du.userData.dmgHp >= 65) { damaged.splice(d, 1); continue; }
        if (!LB.heavyFx) continue;
        var py = du.position.y + 0.9;
        LB.heavyFx.puff({ kind: 'smoke', x: du.position.x, y: py, z: du.position.z, vy: 1.4, size: 0.6, grow: 1.6, life: 1.8, color: du.userData.dmgHp < 30 ? 0x1f1d1b : 0x5a5650, opacity: 0.45 });
        if (du.userData.dmgHp < 30) LB.heavyFx.puff({ kind: 'fire', x: du.position.x, y: py - 0.3, z: du.position.z, vy: 1.2, size: 0.5, grow: 0.3, life: 0.5, color: 0xff7a1a, opacity: 0.8, flicker: true });
      }
      for (var bi = bdmg.length - 1; bi >= 0; bi--) { var b = bdmg[bi]; if (!LB.persist && b.userData.destroyedAt && now - b.userData.destroyedAt > 90000) { restoreBuilding(b); bdmg.splice(bi, 1); } }
    }
  }

  function reset() {
    if (!im) return;
    for (var i = 0; i < POOL; i++) if (pieces[i]) { pieces[i] = null; free.push(i); _m.makeScale(0, 0, 0); im.setMatrixAt(i, _m); }
    im.instanceMatrix.needsUpdate = true;
    turrets.forEach(function (t) { scene.remove(t); turretPool.push(t); }); turrets.length = 0;
    wrecks.forEach(function (w) { scene.remove(w.mesh); restoreUnit(w.u); }); wrecks.length = 0;
    damaged.length = 0;
    bdmg.forEach(restoreBuilding); bdmg.length = 0;
    if (LB.persist) LB.persist.reset();
    try { var A = E().getArmies(); A.bulls.concat(A.bears).forEach(function (u) { if (u.userData && u.userData.wreckUntil) restoreUnit(u); if (u.userData) u.userData.dmgHp = 100; }); } catch (_) {}
  }

  LB.damage = { hitUnit: hitUnit, blast: blast, burst: burst, update: update, reset: reset, CAPS: CAPS,
    getStats: function () { return Object.assign({ cap: cap(), free: free.length, turrets: turrets.length, damagedUnits: damaged.length, damagedBuildings: bdmg.length }, stats); } };
})(window);
