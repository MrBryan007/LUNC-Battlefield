/* LUNC Battlefield — soldier casualty FX (v11.2-ai Phase 1). Cosmetic only.
 * Hooks every explosion (Commander strikes incl. Moon Shot via boom(), plus battle-engine
 * unit fire / liquidation blasts) by wrapping engine.effects.createExplosion.
 * Tiers: ULTRA/HIGH Verlet ragdoll (8 particles, distance constraints, terrain ground, sleep)
 *        MEDIUM rigid tumble (spin + ballistic arc + bounce) into a baked death pose
 *        LOW    none (existing knockback only)
 * A "downed" unit is hidden (zero scale → its v11 instance collapses) for the corpse lifetime,
 * then reappears at its rear slot as a reinforcement. Army counts/market logic are untouched.
 */
(function (window) {
  'use strict';
  var LB = window.LUNCBattle = window.LUNCBattle || {};
  var qs = new URLSearchParams(window.location.search);
  var enabled = qs.get('ragdoll') !== '0';
  var CAPS = { LOW: 0, MEDIUM: 12, HIGH: 24, ULTRA: 40 };
  var CORPSE_MAX = 48, LIFE_MIN = 8, LIFE_MAX = 15, SINK = 1.5;
  function E() { return LB.engine; }
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (e) { return 'MEDIUM'; } }

  // particle layout: 0 head 1 chest 2 pelvis 3 lHand 4 rHand 5 lFoot 6 rFoot 7 neckless knee-mid
  var REST = [[0, 1.55, 0], [0, 1.2, 0], [0, 0.85, 0], [-0.32, 1.0, 0], [0.32, 1.0, 0], [-0.14, 0.02, 0], [0.14, 0.02, 0], [0, 0.45, 0]];
  var LINKS = [[0, 1], [1, 2], [1, 3], [1, 4], [2, 7], [7, 5], [7, 6], [3, 2], [4, 2], [5, 6], [0, 2]];
  var BONES = [[0, 1], [1, 2], [1, 3], [1, 4], [7, 5], [7, 6], [2, 7]]; // drawn segments
  var pool = [], active = [], geo = null, headGeo = null;
  var stats = { spawned: 0, active: 0, corpses: 0, skipped: 0 };

  function makeProxy() {
    var THREE = E().THREE;
    if (!geo) { geo = new THREE.BoxGeometry(0.14, 1, 0.14); geo.translate(0, 0.5, 0); headGeo = new THREE.SphereGeometry(0.13, 8, 6); }
    var g = new THREE.Group(); g.userData.segs = [];
    for (var i = 0; i < BONES.length; i++) { var m = new THREE.Mesh(geo, null); g.add(m); g.userData.segs.push(m); }
    g.userData.head = new THREE.Mesh(headGeo, null); g.add(g.userData.head);
    g.userData.p = REST.map(function () { return new THREE.Vector3(); });
    g.userData.o = REST.map(function () { return new THREE.Vector3(); });
    g.userData.len = LINKS.map(function (l) { var a = REST[l[0]], b = REST[l[1]]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); });
    return g;
  }
  function acquire() { return pool.pop() || makeProxy(); }
  function release(r) { E().scene.remove(r.g); pool.push(r.g); }

  var _up, _dir;
  function orientSeg(m, a, b) {
    var THREE = E().THREE; _up = _up || new THREE.Vector3(0, 1, 0); _dir = _dir || new THREE.Vector3();
    _dir.subVectors(b, a); var L = _dir.length() || 1e-4; m.position.copy(a);
    m.quaternion.setFromUnitVectors(_up, _dir.multiplyScalar(1 / L)); m.scale.set(1, L, 1);
  }

  function spawn(u, bx, bz, power, mode) {
    var e = E(), THREE = e.THREE, g = acquire(), ud = g.userData;
    var col = u.userData.side < 0 ? e.bullColor() : e.bearColor();
    if (!ud.mat) ud.mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05, transparent: true });
    var m = ud.mat; m.color.setHex(col);
    ud.segs.forEach(function (s) { s.material = m; }); ud.head.material = m;
    var px = u.position.x, pz = u.position.z, py = e.terrainHeight(px, pz);
    var dx = px - bx, dz = pz - bz, d = Math.hypot(dx, dz) || 0.01; dx /= d; dz /= d;
    var imp = Math.min(6.5, (2.5 + power * 3) / (0.6 + d * 0.5));
    var yaw = u.userData.facing || 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
    g.position.set(0, 0, 0); g.rotation.set(0, 0, 0);
    for (var i = 0; i < REST.length; i++) {
      var r = REST[i], lx = r[0] * cy, lz = -r[0] * sy;
      ud.p[i].set(px + lx, py + r[1], pz + lz);
      var k = (r[1] / 1.55);  // upper body flies more → tumble
      ud.o[i].copy(ud.p[i]).sub(new THREE.Vector3(dx * imp * k, imp * 0.55 * (0.6 + k) + 1.2, dz * imp * k).multiplyScalar(1 / 60));
    }
    var rec = { g: g, u: u, mode: mode, t: 0, sleep: 0, life: LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN), alpha: 1,
      // MEDIUM tumble state
      vx: dx * imp * 0.5, vy: 2 + power * 2, vz: dz * imp * 0.5, spin: (Math.random() < 0.5 ? -1 : 1) * (4 + imp), pose: Math.floor(Math.random() * 3) };
    if (mode === 'tumble') { layoutPose(g, 0); g.position.set(px, py, pz); g.rotation.y = yaw; }
    m.opacity = 1; e.scene.add(g); active.push(rec);
    // hide the soldier for the corpse lifetime (v11 instance collapses with the zero matrix)
    u.userData.rdDown = rec; u.userData._rdScale = u.scale.x || 1; u.scale.setScalar(0.0001);
    if (LB.ai && LB.ai.onOfficerDown && u.userData.aiRank != null) LB.ai.onOfficerDown(u);
    stats.spawned++;
  }
  // baked death poses for the MEDIUM tumble (local, unit at origin)
  var POSES = [
    [[0, 0.12, 1.5], [0, 0.12, 1.15], [0, 0.12, 0.8], [-0.5, 0.1, 1.3], [0.45, 0.1, 1.0], [-0.2, 0.08, 0], [0.25, 0.08, 0.05], [0, 0.1, 0.4]],
    [[0.2, 0.15, -1.4], [0.1, 0.15, -1.05], [0, 0.13, -0.7], [-0.4, 0.1, -1.4], [0.6, 0.1, -0.9], [-0.15, 0.1, 0.1], [0.3, 0.3, -0.1], [0, 0.15, -0.3]],
    [[1.3, 0.14, 0.3], [0.95, 0.15, 0.2], [0.6, 0.14, 0], [1.0, 0.1, 0.6], [1.1, 0.1, -0.3], [-0.2, 0.1, 0.2], [-0.15, 0.1, -0.2], [0.2, 0.12, 0]]
  ];
  function layoutPose(g, which) {
    var THREE = E().THREE, P = POSES[which].map(function (a) { return new THREE.Vector3(a[0], a[1], a[2]); });
    for (var i = 0; i < BONES.length; i++) orientSeg(g.userData.segs[i], P[BONES[i][0]], P[BONES[i][1]]);
    g.userData.head.position.copy(P[0]);
  }

  function stepVerlet(rec, dt) {
    var e = E(), ud = rec.g.userData, p = ud.p, o = ud.o, g = 9.8 * dt * dt, moved = 0;
    for (var i = 0; i < p.length; i++) {
      var vx = (p[i].x - o[i].x) * 0.985, vy = (p[i].y - o[i].y) * 0.985, vz = (p[i].z - o[i].z) * 0.985;
      o[i].copy(p[i]); p[i].x += vx; p[i].y += vy - g; p[i].z += vz;
      moved += Math.abs(vx) + Math.abs(vy) + Math.abs(vz);
    }
    for (var it = 0; it < 4; it++) {
      for (var l = 0; l < LINKS.length; l++) {
        var a = p[LINKS[l][0]], b = p[LINKS[l][1]], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-4, f = (d - ud.len[l]) / d * 0.5;
        a.x += dx * f; a.y += dy * f; a.z += dz * f; b.x -= dx * f; b.y -= dy * f; b.z -= dz * f;
      }
      for (var j = 0; j < p.length; j++) {
        var gy = e.terrainHeight(p[j].x, p[j].z) + 0.07;
        if (p[j].y < gy) { p[j].y = gy; o[j].x = p[j].x - (p[j].x - o[j].x) * 0.6; o[j].z = p[j].z - (p[j].z - o[j].z) * 0.6; }
      }
    }
    for (var s = 0; s < BONES.length; s++) orientSeg(ud.segs[s], p[BONES[s][0]], p[BONES[s][1]]);
    ud.head.position.copy(p[0]);
    return moved;
  }
  function stepTumble(rec, dt) {
    var e = E(), g = rec.g, gy = e.terrainHeight(g.position.x, g.position.z);
    rec.vy -= 9.8 * dt; g.position.x += rec.vx * dt; g.position.y += rec.vy * dt; g.position.z += rec.vz * dt;
    g.rotation.x += rec.spin * dt * 0.6;
    if (g.position.y <= gy) {
      g.position.y = gy; if (Math.abs(rec.vy) > 1.2) { rec.vy *= -0.3; rec.vx *= 0.5; rec.vz *= 0.5; rec.spin *= 0.4; }
      else { rec.vy = 0; rec.vx = rec.vz = 0; rec.spin = 0; g.rotation.x = 0; g.rotation.z = 0; layoutPose(g, rec.pose); return 0; }
    }
    return 1;
  }

  var last = 0;
  function loop() {
    requestAnimationFrame(loop);
    var e = E(), t = performance.now() * 0.001, dt = Math.min(0.25, t - (last || t)); last = t;
    if (!e || !active.length) return;
    if (e.isPaused && e.isPaused()) return;
    // fixed 60 Hz sub-steps (max 8/frame) so slow devices don't get slow-motion bodies
    var steps = Math.min(8, Math.round(dt * 60)), h = 1 / 60;
    for (var i = active.length - 1; i >= 0; i--) {
      var r = active[i]; r.t += dt;
      for (var k0 = 0; k0 < steps && r.sleep < 0.6; k0++) {
        var mv = r.mode === 'verlet' ? stepVerlet(r, h) : stepTumble(r, h);
        r.sleep = mv < 0.02 ? r.sleep + h : 0;
      }
      if (r.t > r.life) {   // sink + fade, then back to pool
        var k = (r.t - r.life) / SINK; r.g.position.y -= dt * 0.25; r.g.userData.segs[0].material.opacity = Math.max(0, 1 - k);
        if (k >= 1) { finish(r); active.splice(i, 1); }
      }
    }
    stats.active = active.filter(function (r) { return r.sleep < 0.6; }).length; stats.corpses = active.length;
  }
  function finish(r) {
    release(r); r.g.userData.segs[0].material.opacity = 1;
    var u = r.u, ud = u.userData;
    if (ud.rdDown === r) {
      ud.rdDown = null; u.scale.setScalar(ud._rdScale || 1);
      // reinforcement: re-enter from the rear slot; engine steering walks it back to the front
      if (ud.home && u.parent) { u.position.x = (ud.home.x || u.position.x) + (ud.side || 0) * 6; }
    }
  }

  function onExplosion(x, z, power) {
    if (!enabled) return;
    var tn = tierName(), cap = CAPS[tn] || 0;
    if (LB.ai && LB.ai.reportBlast) try { LB.ai.reportBlast(x, z, power); } catch (e) {}
    if (!cap || power < 0.6) return;
    var e = E(), A = e.getArmies(), R = 0.9 + power * 1.3, R2 = R * R, killP = Math.min(0.9, 0.25 + power * 0.3);
    var list = A.bulls.concat(A.bears), mode = (tn === 'HIGH' || tn === 'ULTRA') ? 'verlet' : 'tumble';
    for (var i = 0; i < list.length; i++) {
      var u = list[i], ud = u.userData;
      if (!ud || (ud.type | 0) !== 0 || ud.air || ud.rdDown || !u.parent) continue;
      var dx = u.position.x - x, dz = u.position.z - z; if (dx * dx + dz * dz > R2) continue;
      if (Math.random() > killP) continue;
      var awake = active.filter(function (r) { return r.sleep < 0.6; }).length;
      if (awake >= cap) { stats.skipped++; break; }
      if (active.length >= CORPSE_MAX) { finish(active[0]); active.shift(); }   // hard corpse cap: recycle oldest
      spawn(u, x, z, power, mode);
    }
  }

  function boot() {
    var e = E(); if (!e || !e.effects || !e.effects.createExplosion) { setTimeout(boot, 400); return; }
    var orig = e.effects.createExplosion;
    e.effects.createExplosion = function (x, z, color, power, isBurn) {
      var r = orig.apply(this, arguments);
      try { onExplosion(x, z, power == null ? 1 : power); } catch (err) { if (!boot._w) { boot._w = 1; console.warn('[ragdoll]', err); } }
      return r;
    };
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  LB.ragdoll = {
    version: 'v11.2-ai-p1', CAPS: CAPS,
    setEnabled: function (v) { enabled = !!v; if (!enabled) { active.forEach(finish); active.length = 0; } },
    clear: function () { active.forEach(finish); active.length = 0; },
    // direct casualty (sniper hit etc.); respects tier caps
    kill: function (u, fromX, fromZ, power) {
      var tn = tierName(), cap = CAPS[tn] || 0; if (!enabled || !cap || !u || !u.userData || u.userData.rdDown) return false;
      if (active.length >= CORPSE_MAX) { finish(active[0]); active.shift(); }
      spawn(u, fromX, fromZ, power || 0.8, (tn === 'HIGH' || tn === 'ULTRA') ? 'verlet' : 'tumble'); return true;
    },
    debugBlast: function (x, z, p) { onExplosion(x, z, p || 1.5); },
    getStats: function () { return Object.assign({ pool: pool.length, tier: tierName() }, stats); },
    _debug: function () { return active.map(function (r) { var p = r.g.userData.p; return { mode: r.mode, t: +r.t.toFixed(2), head: +(p[0].y - E().terrainHeight(p[0].x, p[0].z)).toFixed(2), foot: +(p[5].y - E().terrainHeight(p[5].x, p[5].z)).toFixed(2), sleep: +r.sleep.toFixed(2) }; }); }
  };
})(window);
