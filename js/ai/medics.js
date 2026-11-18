/* LUNC Battlefield v11.3 — military medics (cosmetic; never changes army counts or the frontline). ?medics=0 disables.
 * - A few infantry per side are medics (white med pack with a red cross), scaled by army size and tier.
 * - Near-miss blasts leave some soldiers WOUNDED (downed + slow crawl) → a 'medic' request on the AI bus ("Medic!").
 * - Requests are prioritised: officers first, then oldest. Nearest free medic runs over (side-steps fire/gas zones),
 *   kneels, treats (~2 s), the soldier gets up and returns to its slot.
 * - The dead: two free medics form a stretcher team, pick up a settled ragdoll body, carry it to the casualty
 *   collection point (CCP) behind their lines and lay it down there; it stays (js/fx/persist.js).
 * - Medics can be hit too (their task is dropped and the body/wounded is released for someone else).
 * Driven from battle-engine drawFrame (after the sim step) so the overrides win; frozen while paused. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('medics') !== '0';
  var E = function () { return LB.engine; };
  var CAP = { LOW: 2, MEDIUM: 4, HIGH: 7, ULTRA: 9 };
  var medics = { '-1': [], '1': [] }, requests = [], ccpCount = { '-1': 0, '1': 0 };
  var stats = { medics: 0, wounded: 0, treated: 0, carried: 0, medicsHit: 0, requests: 0, ms: 0 };
  var lastT = 0, assignT = 0, dispatchT = 0, radioT = { '-1': 0, '1': 0 }, markGeo = null, markMat = null, crossMat = null;
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function rear(side) { return side * 38; }
  function say(side, text, force) {
    var now = performance.now();
    if (!force && now < radioT[side]) return;
    radioT[side] = now + 3500;
    if (LB.ai && LB.ai.send) try { LB.ai.send({ side: side, type: 'medic', text: text }); } catch (_) {}
  }
  function tag(u) { return (u.userData.side < 0 ? 'BULL' : 'BEAR') + '-' + ((u.userData.index | 0) % 100); }

  function marker(THREE) {
    if (!markGeo) {
      markGeo = new THREE.BoxGeometry(0.26, 0.2, 0.12);
      markMat = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 });
      crossMat = new THREE.MeshBasicMaterial({ color: 0xd8282a });
    }
    var g = new THREE.Group();
    var bag = new THREE.Mesh(markGeo, markMat);
    var c1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.125), crossMat), c2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.125), crossMat);
    c1.position.z = c2.position.z = 0.003; g.add(bag, c1, c2);
    var band = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8), markMat); band.position.set(0.24, -0.1, 0.06); g.add(band);
    g.position.set(0, 1.15, -0.16); g.name = 'medic-mark'; g.scale.setScalar(1.6);
    return g;
  }
  function inf(u) { var ud = u.userData; return ud && (ud.type | 0) === 0 && !ud.air && u.parent; }

  function assign(A) {
    var THREE = E().THREE, cap = CAP[tierName()] || 4;
    [-1, 1].forEach(function (side) {
      var army = side < 0 ? A.bulls : A.bears, list = medics[side];
      for (var i = list.length - 1; i >= 0; i--) if (!list[i].u.parent) list.splice(i, 1);
      var n = 0; for (var k = 0; k < army.length; k++) if (inf(army[k])) n++;
      var want = Math.max(n ? 1 : 0, Math.min(cap, Math.round(n * 0.05)));
      for (var j = 0; j < army.length && list.length < want; j++) {
        var u = army[j], ud = u.userData;
        if (!inf(u) || ud.medic || ud.aiRank != null || ud.rdDown || ud.wounded) continue;
        ud.medic = true; var m = marker(THREE); u.add(m); ud.medicMark = m;
        list.push({ u: u, st: 'idle', t: 0, task: null, partner: null });
      }
    });
    stats.medics = medics[-1].length + medics[1].length;
  }

  function onBlast(x, z, power) {
    if (!enabled || power < 0.6) return;
    var A = E().getArmies(), list = A.bulls.concat(A.bears), R = 1.4 + power * 1.8, R2 = R * R, now = performance.now();
    var maxNew = tierName() === 'LOW' ? 1 : 3, made = 0;
    for (var i = 0; i < list.length && made < maxNew; i++) {
      var u = list[i], ud = u.userData;
      if (!inf(u) || ud.rdDown || ud.wounded) continue;
      var dx = u.position.x - x, dz = u.position.z - z; if (dx * dx + dz * dz > R2) continue;
      if (ud.medic) { var mt = findMedic(u); if (mt && mt.st !== 'idle' && Math.random() < 0.35) { dropTask(mt); stats.medicsHit++; say(ud.side, tag(u) + ': "Medic down! Need another medic!"', true); } continue; }
      if (Math.random() > 0.22) continue;
      ud.wounded = { x: u.position.x, z: u.position.z, t0: now, yaw: u.rotation.y, medic: null };
      requests.push({ u: u, side: ud.side, t: now, officer: ud.aiRank != null });
      stats.requests++; made++;
      say(ud.side, tag(u) + ': "Medic!"');
    }
  }
  function findMedic(u) { var l = medics[u.userData.side] || []; for (var i = 0; i < l.length; i++) if (l[i].u === u) return l[i]; return null; }
  function dropTask(m) {
    var t = m.task;
    if (t && t.kind === 'treat' && t.u.userData.wounded) { t.u.userData.wounded.medic = null; requests.push({ u: t.u, side: t.u.userData.side, t: performance.now(), officer: false }); }
    if (t && t.kind === 'carry') {
      if (t.body.carried && LB.ragdoll) LB.ragdoll.layDown(t.body); else if (LB.ragdoll) LB.ragdoll.claim(t.body, false);
      if (m.partner) { m.partner.st = 'idle'; m.partner.task = null; m.partner.partner = null; resetPose(m.partner.u); }
    }
    m.st = 'idle'; m.task = null; m.partner = null; resetPose(m.u);
  }
  function resetPose(u) { u.rotation.x = 0; u.rotation.z = 0; u.userData.mpos = null; }

  function zoneBlock(x, z) {
    var Z = LB.heavyFx && LB.heavyFx.getZones ? LB.heavyFx.getZones() : [];
    for (var i = 0; i < Z.length; i++) {
      var o = Z[i], cx = o.x, cz = o.z, r = (o.r || 1) + 0.8;
      if (o.line) { var t = Math.max(0, Math.min(1, ((x - o.line.x0) * (o.line.x1 - o.line.x0) + (z - o.line.z0) * (o.line.z1 - o.line.z0)) / (Math.pow(o.line.x1 - o.line.x0, 2) + Math.pow(o.line.z1 - o.line.z0, 2) || 1))); cx = o.line.x0 + (o.line.x1 - o.line.x0) * t; cz = o.line.z0 + (o.line.z1 - o.line.z0) * t; }
      if (cx == null) continue;
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < r * r) return { x: cx, z: cz };
    }
    return null;
  }
  /** Move u toward (tx,tz); returns true on arrival. Side-steps active fire/gas zones. */
  // Own position state: the engine's slot steering would otherwise pull the medic back every frame.
  function pin(u) {
    var s = u.userData.mpos || (u.userData.mpos = { x: u.position.x, z: u.position.z });
    u.position.x = s.x; u.position.z = s.z; u.position.y = E().terrainHeight(s.x, s.z);
    return s;
  }
  function moveTo(u, tx, tz, speed, dt) {
    var S = pin(u);
    var dx = tx - u.position.x, dz = tz - u.position.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.5) return true;
    var step = Math.min(d, speed * dt), nx = dx / d, nz = dz / d;
    var px = u.position.x + nx * step * 4, pz = u.position.z + nz * step * 4;
    var b = zoneBlock(px, pz);
    if (b && Math.hypot(tx - b.x, tz - b.z) > 1.5) { var sx = -nz, sz = nx; if ((u.position.x - b.x) * sx + (u.position.z - b.z) * sz < 0) { sx = -sx; sz = -sz; } nx = nx * 0.3 + sx; nz = nz * 0.3 + sz; var l = Math.hypot(nx, nz); nx /= l; nz /= l; }
    u.position.x += nx * step; u.position.z += nz * step; S.x = u.position.x; S.z = u.position.z;
    u.position.y = E().terrainHeight(u.position.x, u.position.z);
    u.rotation.y = Math.atan2(nx, nz);
    u.userData.facing = u.rotation.y;
    return false;
  }

  function dispatch() {
    requests = requests.filter(function (r) { var w = r.u.userData.wounded; return w && !w.medic && !r.u.userData.rdDown && r.u.parent; });
    requests.sort(function (a, b) { return (b.officer - a.officer) || (a.t - b.t); });
    for (var i = 0; i < requests.length; i++) {
      var r = requests[i], best = null, bd = 1e9;
      (medics[r.side] || []).forEach(function (m) {
        if (m.st !== 'idle' || m.u.userData.rdDown || m.u.userData.wounded) return;
        var d = Math.hypot(m.u.position.x - r.u.position.x, m.u.position.z - r.u.position.z); if (d < bd) { bd = d; best = m; }
      });
      if (!best || bd > 45) continue;
      best.st = 'go'; best.task = { kind: 'treat', u: r.u }; r.u.userData.wounded.medic = best;
      say(r.side, (r.officer ? 'Officer down! ' : '') + tag(best.u) + ': "Man down, moving to assist."', r.officer);
    }
    // stretcher teams for the dead
    var bodies = LB.ragdoll && LB.ragdoll.getBodies ? LB.ragdoll.getBodies() : [];
    for (var b = 0; b < bodies.length; b++) {
      var body = bodies[b], side = body.u && body.u.userData ? body.u.userData.side : 0;
      if (!side) continue;
      var free = (medics[side] || []).filter(function (m) { return m.st === 'idle' && !m.u.userData.rdDown && !m.u.userData.wounded; });
      if (free.length < 2) continue;
      var p = body.g.userData.p[2];
      free.sort(function (a, c) { return Math.hypot(a.u.position.x - p.x, a.u.position.z - p.z) - Math.hypot(c.u.position.x - p.x, c.u.position.z - p.z); });
      var m1 = free[0], m2 = free[1];
      if (Math.hypot(m1.u.position.x - p.x, m1.u.position.z - p.z) > 40) continue;
      LB.ragdoll.claim(body, true);
      var task = { kind: 'carry', body: body, side: side, picked: false, slot: ccpCount[side]++ };
      m1.st = m2.st = 'go'; m1.task = m2.task = task; m1.partner = m2; m2.partner = m1; task.lead = m1;
      say(side, tag(m1.u) + ': "Stretcher team moving."');
    }
  }

  function tickMedic(m, dt, now) {
    var u = m.u, ud = u.userData, t = m.task;
    if (ud.rdDown || !u.parent || ud.wounded) { if (m.st !== 'idle') { stats.medicsHit++; dropTask(m); } return; }
    if (m.st === 'idle' || !t) return;
    if (t.kind === 'treat') {
      var w = t.u.userData.wounded;
      if (!w || t.u.userData.rdDown) { dropTask(m); return; }
      if (m.st === 'go') { if (moveTo(u, w.x + 0.5, w.z, 3.2, dt)) { m.st = 'treat'; m.t = 0; } }
      else if (m.st === 'treat') {
        m.t += dt; pin(u); u.rotation.x = 0.45;                 // kneel
        u.position.y = E().terrainHeight(u.position.x, u.position.z) - 0.25;
        u.rotation.y = Math.atan2(w.x - u.position.x, w.z - u.position.z);
        if (LB.heavyFx && Math.random() < dt * 3) LB.heavyFx.puff({ kind: 'flash', x: w.x, y: E().terrainHeight(w.x, w.z) + 0.6, z: w.z, vy: 0.8, size: 0.35, grow: 0.2, life: 0.6, color: 0x9dffb0, opacity: 0.8 });
        if (m.t > 2.2) {
          t.u.userData.wounded = null; resetPose(t.u); stats.treated++;
          if (Math.random() < 0.4) say(ud.side, tag(u) + ': "Patched up — back in the fight."');
          m.st = 'idle'; m.task = null; resetPose(u);
        }
      }
      return;
    }
    if (t.kind === 'carry') {
      var body = t.body, bp = body.g.userData.p[2];
      if (!t.picked) {
        var off = m === t.lead ? 0.7 : -0.7;
        if (m.st === 'go' && moveTo(u, bp.x + off, bp.z, 3.0, dt)) m.st = 'wait';
        if (m.st === 'wait') pin(u);
        if (m === t.lead && m.st === 'wait' && m.partner && m.partner.st === 'wait') { t.picked = true; m.st = m.partner.st = 'carry'; stats.carried++; }
        return;
      }
      if (m !== t.lead) return;                                 // lead drives the pair
      var p2 = m.partner, tz = (t.slot % 8) * 1.1 - 4, tx = rear(t.side) + t.side * Math.floor(t.slot / 8) * 1.4;
      var arrived = moveTo(u, tx, tz, 2.1, dt);
      if (p2) { var yaw = u.rotation.y; var S2 = pin(p2.u); S2.x = p2.u.position.x = u.position.x - Math.sin(yaw) * 1.6; S2.z = p2.u.position.z = u.position.z - Math.cos(yaw) * 1.6; p2.u.position.y = E().terrainHeight(p2.u.position.x, p2.u.position.z); p2.u.rotation.y = yaw; }
      var mx = p2 ? (u.position.x + p2.u.position.x) / 2 : u.position.x, mz = p2 ? (u.position.z + p2.u.position.z) / 2 : u.position.z;
      LB.ragdoll.carry(body, mx, E().terrainHeight(mx, mz) + 0.85, mz);
      if (arrived) {
        LB.ragdoll.layDown(body);
        m.st = 'idle'; m.task = null; resetPose(u); if (p2) { p2.st = 'idle'; p2.task = null; p2.partner = null; resetPose(p2.u); } m.partner = null;
      }
    }
  }

  function tickWounded(A, dt, now) {
    var all = A.bulls.concat(A.bears), n = 0;
    for (var i = 0; i < all.length; i++) {
      var u = all[i], w = u.userData && u.userData.wounded; if (!w) continue;
      if (u.userData.rdDown || !u.parent) { u.userData.wounded = null; continue; }
      n++;
      if (!w.medic || w.medic.st === 'go') { w.x += (u.userData.side || 0) * 0.12 * dt; }   // slow crawl toward own rear
      u.position.set(w.x, E().terrainHeight(w.x, w.z) + 0.12, w.z);
      u.rotation.set(-1.35, w.yaw, 0);
      if (now - w.t0 > 30000 && !w.medic) { u.userData.wounded = null; resetPose(u); }    // walks it off
    }
    stats.wounded = n;
  }

  function update() {
    if (!enabled) return;
    var e = E(); if (!e) return;
    var now = performance.now(), dt = Math.min(0.5, (now - (lastT || now)) / 1000); lastT = now;
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive())) return;
    var t0 = now, A = e.getArmies();
    if (now > assignT) { assignT = now + 2000; assign(A); }
    if (now > dispatchT) { dispatchT = now + 500; dispatch(); }
    tickWounded(A, dt, now);
    [-1, 1].forEach(function (s) { medics[s].forEach(function (m) { tickMedic(m, dt, now); }); });
    stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1;
  }
  function reset() {
    [-1, 1].forEach(function (s) { medics[s].forEach(function (m) { if (m.st !== 'idle') dropTask(m); }); });
    requests.length = 0; ccpCount[-1] = ccpCount[1] = 0;
    try { var A = E().getArmies(); A.bulls.concat(A.bears).forEach(function (u) { if (u.userData && u.userData.wounded) { u.userData.wounded = null; resetPose(u); } }); } catch (_) {}
  }
  function boot() {
    var e = E(); if (!e || !e.effects || !e.effects.createExplosion) { setTimeout(boot, 500); return; }
    if (!enabled) return;
    var orig = e.effects.createExplosion;
    e.effects.createExplosion = function (x, z, color, power) {
      var r = orig.apply(this, arguments);
      try { onBlast(x, z, power == null ? 1 : power); } catch (err) { console.warn('[medics]', err); }
      return r;
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  LB.medics = { update: update, reset: reset, isEnabled: function () { return enabled; },
    getStats: function () {
      var busy = 0; [-1, 1].forEach(function (s) { medics[s].forEach(function (m) { if (m.st !== 'idle') busy++; }); });
      return Object.assign({ busy: busy, queue: requests.length, tier: tierName() }, stats);
    },
    _debug: function () { return [-1, 1].map(function (s) { return medics[s].map(function (m) { return m.st + (m.task ? ':' + m.task.kind : ''); }); }); } };
})(window);
