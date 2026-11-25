/* LUNC Battlefield v11.3 — military medics (cosmetic; never changes army counts or the frontline). ?medics=0 disables.
 * - A few infantry per side are medics (white med pack with a red cross), scaled by army size and tier.
 * - Near-miss blasts leave some soldiers WOUNDED (downed + slow crawl) → a 'medic' request on the AI bus ("Medic!").
 * - Requests are prioritised: officers first, then oldest. Nearest free medic runs over (side-steps fire/gas zones),
 *   kneels, treats (~2 s), the soldier gets up and returns to its slot.
 * - The dead: two free medics form a stretcher team, pick up a settled ragdoll body, carry it to the casualty
 *   collection point (CCP) behind their lines and lay it down there; it stays (js/fx/persist.js).
 * - Medics can be hit too (their task is dropped and the body/wounded is released for someone else).
 * Driven from battle-engine drawFrame (after the sim step) so the overrides win; frozen while paused.
 * v12.0.66 Casualty care (realism checklist, Combat behavior: "medic ranges"; ?casualty=0, also off with ?medics=0):
 * - Triage: each wound is MINOR (field dressing 2.2 s) or SERIOUS (tourniquet + dressing ~5 s, "9-line" MEDEVAC call);
 *   closer to the blast → more likely serious. Serious casualties wait longer before they walk it off.
 * - Response range 30 m (was 45 m). A casualty in the danger zone (an enemy within 14 m with line of sight) gets covering smoke first:
 *   a v12.0.65 smoke screen between it and the nearest enemy (one per side every 20 s), and the medic holds ~2.5 s.
 * - Casualty drag: in the danger zone the medic drags the casualty ~6 m back toward its own lines (1.1 m/s) before treating.
 * - CCP: each side's casualty collection point gets an aid tent + CCP sign (MEDIUM+; LOW / phones: sign only).
 * v12.0.67 CASEVAC (realism checklist, Combat behavior; ?casevac=0, also off with ?casualty=0 / ?medics=0):
 * - A treated SERIOUS casualty no longer just stands up: it is evacuated to its side's CCP.
 * - Litter team: if a second free medic is within 30 m, the pair carry it on a folding pole litter (casualty lying at ~0.85 m)
 *   at 1.6 m/s to a bed slot beside the aid tent. Otherwise the casualty limps back alone (0.9 m/s, leaning forward).
 * - At the CCP it lies on its bed slot ~20 s ("treated at CCP"), then gets up and walks back to its slot in the line.
 * - A litter bearer that gets hit sets the casualty down where it is; it asks for a litter again (limps after ~12 s). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('medics') !== '0';
  var care = enabled && qs.get('casualty') !== '0';   // v12.0.66 casualty care
  var casevac = care && qs.get('casevac') !== '0';    // v12.0.67 CASEVAC
  var EVAC_SPEED = 1.6, LIMP_SPEED = 0.9, RTL_SPEED = 1.4, CCP_REST = 20, MDV_WAIT = 150, BEDS = 6, bedUse = { '-1': [], '1': [] }, noLitter = { '-1': false, '1': false }, litters = [], litterMat = null, poleMat = null;
  var RANGE = care ? 30 : 45, DANGER = 14, DRAG = 6, smokeT = { '-1': 0, '1': 0 }, ccp = null, simNow = 0;
  var E = function () { return LB.engine; };
  var CAP = { LOW: 2, MEDIUM: 4, HIGH: 7, ULTRA: 9 };
  var medics = { '-1': [], '1': [] }, requests = [], ccpCount = { '-1': 0, '1': 0 };
  var stats = { medics: 0, wounded: 0, treated: 0, carried: 0, medicsHit: 0, requests: 0, ms: 0, minor: 0, serious: 0, smoked: 0, dragged: 0, ccp: 0, evacuated: 0, limped: 0, atCcp: 0, ccpDone: 0, evacNow: 0, setDown: 0, rtl: 0, dustoff: 0 };
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
        if (!inf(u) || ud.medic || ud.aiRank != null || ud.rdDown || ud.wounded || ud.evac) continue;
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
      if (!inf(u) || ud.rdDown || ud.wounded || ud.evac) continue;
      var dx = u.position.x - x, dz = u.position.z - z; if (dx * dx + dz * dz > R2) continue;
      if (ud.medic) { var mt = findMedic(u); if (mt && mt.st !== 'idle' && Math.random() < 0.35) { dropTask(mt); stats.medicsHit++; say(ud.side, tag(u) + ': "Medic down! Need another medic!"', true); } continue; }
      if (Math.random() > 0.22) continue;
      wound(u, care && Math.random() < 0.25 + 0.45 * (1 - Math.sqrt(dx * dx + dz * dz) / R), now); made++;
    }
  }
  function wound(u, serious, now) {
    var ud = u.userData;
    ud.wounded = { x: u.position.x, z: u.position.z, t0: now, yaw: u.rotation.y, medic: null, sev: care ? (serious ? 'serious' : 'minor') : null };
    requests.push({ u: u, side: ud.side, t: now, officer: ud.aiRank != null || !!serious });
    stats.requests++; if (care) stats[serious ? 'serious' : 'minor']++;
    say(ud.side, tag(u) + (serious ? ': "Medic! I\'m hit bad!"' : ': "Medic!"'));
  }
  /** v12.0.66: nearest enemy within DANGER m that can see (x, z) (js/theaters/los.js: hills, walls, bunkers, smoke) → {x, z, d} or null. */
  function threat(side, x, z) {
    var A = E().getArmies(), L = side < 0 ? A.bears : A.bulls, near = [], R2 = DANGER * DANGER;
    for (var i = 0; i < L.length; i++) { var u = L[i], ud = u.userData; if (!u.parent || !ud || ud.rdDown || ud.air) continue; var dx = u.position.x - x, dz = u.position.z - z, d2 = dx * dx + dz * dz; if (d2 < R2) near.push({ u: u, d2: d2 }); }
    near.sort(function (a, b) { return a.d2 - b.d2; });
    var los = LB.los && LB.los.isEnabled && LB.los.isEnabled() ? LB.los : null;
    for (var k = 0; k < near.length && k < 8; k++) {
      var p = near[k].u.position;
      if (los) { try { if (!los.trace(p.x, p.z, x, z).ok) continue; } catch (_) {} }
      return { x: p.x, z: p.z, d: Math.sqrt(near[k].d2) };
    }
    return null;
  }
  function findMedic(u) { var l = medics[u.userData.side] || []; for (var i = 0; i < l.length; i++) if (l[i].u === u) return l[i]; return null; }
  function dropTask(m) {
    var t = m.task;
    if (t && t.kind === 'treat' && t.u.userData.wounded) { t.u.userData.wounded.medic = null; requests.push({ u: t.u, side: t.u.userData.side, t: performance.now(), officer: false }); }
    if (t && t.kind === 'carry') {
      if (t.body.carried && LB.ragdoll) LB.ragdoll.layDown(t.body); else if (LB.ragdoll) LB.ragdoll.claim(t.body, false);
      if (m.partner) { m.partner.st = 'idle'; m.partner.task = null; m.partner.partner = null; resetPose(m.partner.u); }
    }
    if (t && t.kind === 'evac') setDown(t, m);
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
      if (!best || bd > RANGE) continue;
      best.st = 'go'; best.task = { kind: 'treat', u: r.u }; r.u.userData.wounded.medic = best;
      if (care) { var th = threat(r.side, r.u.position.x, r.u.position.z); if (th) best.task.danger = th; }
      say(r.side, (r.officer ? (r.u.userData.aiRank != null ? 'Officer down! ' : 'Urgent casualty! ') : '') + tag(best.u) + ': "Man down, moving to assist."', r.officer);
    }
    if (casevac) dispatchEvac();
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
      if (m.st === 'go') {
        var dg = care && t.danger;
        // v12.0.66 covering smoke: once the medic is close, screen the casualty from the nearest enemy and hold for it to build
        if (dg && !t.smoked && Math.hypot(w.x - u.position.x, w.z - u.position.z) < 14) {
          t.smoked = true;
          if (LB.smoke && LB.smoke.isEnabled() && now > smokeT[ud.side]) {
            var th = threat(ud.side, w.x, w.z) || t.danger;
            if (LB.smoke.screen(w.x, w.z, th.x, th.z, ud.side, 'medic')) { smokeT[ud.side] = now + 20000; stats.smoked++; m.st = 'hold'; m.t = 0; say(ud.side, tag(u) + ': "Popping smoke, moving!"', true); return; }
          }
        }
        if (moveTo(u, w.x + (dg ? ud.side * 0.9 : 0.5), w.z, dg ? 3.6 : 3.2, dt)) {
          if (dg) { m.st = 'drag'; m.t = 0; t.dx = w.x + ud.side * DRAG; t.dz = w.z; } else { m.st = 'treat'; m.t = 0; }
        }
      }
      else if (m.st === 'hold') { m.t += dt; pin(u); u.rotation.x = 0.35; if (m.t > 2.5) { m.st = 'go'; u.rotation.x = 0; } }
      else if (m.st === 'drag') {
        // walk backwards toward own lines; the casualty slides along in front of the medic (drag strap)
        var fwd = Math.atan2(w.x - u.position.x, w.z - u.position.z);
        var done = moveTo(u, t.dx + ud.side * 0.9, t.dz, 1.1, dt);
        u.rotation.y = fwd; u.rotation.x = 0.3;
        var S = pin(u); w.x = S.x - ud.side * 0.9; w.z = S.z; w.yaw = fwd + Math.PI;
        if (done || (m.t += dt) > 9) { stats.dragged++; m.st = 'treat'; m.t = 0; u.rotation.x = 0; }
      }
      else if (m.st === 'treat') {
        m.t += dt; pin(u); u.rotation.x = 0.45;                 // kneel
        u.position.y = E().terrainHeight(u.position.x, u.position.z) - 0.25;
        u.rotation.y = Math.atan2(w.x - u.position.x, w.z - u.position.z);
        if (LB.heavyFx && Math.random() < dt * 3) LB.heavyFx.puff({ kind: 'flash', x: w.x, y: E().terrainHeight(w.x, w.z) + 0.6, z: w.z, vy: 0.8, size: 0.35, grow: 0.2, life: 0.6, color: 0x9dffb0, opacity: 0.8 });
        var serious = w.sev === 'serious';
        if (serious && !t.called && m.t > 1) { t.called = true; say(ud.side, tag(u) + ': "Tourniquet on. Nine-line follows: one urgent, litter."', true); }
        if (m.t > (serious ? 5 : 2.2)) {
          var cu = t.u, cx = w.x, cz = w.z, cyaw = w.yaw;
          cu.userData.wounded = null; resetPose(cu); stats.treated++;
          m.st = 'idle'; m.task = null; resetPose(u);
          if (serious && casevac) { startEvac(m, cu, cx, cz, cyaw); return; }
          if (Math.random() < 0.4) say(ud.side, tag(u) + (serious ? ': "Bleeding controlled — he\'s stable."' : ': "Patched up — back in the fight."'));
        }
      }
      return;
    }
    if (t.kind === 'evac') { tickEvacTeam(m, t, dt); return; }
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
      if (now - w.t0 > (w.sev === 'serious' ? 50000 : 30000) && !w.medic) { u.userData.wounded = null; resetPose(u); }    // walks it off
    }
    stats.wounded = n;
    if (casevac) tickEvac(all, dt);
  }

  // ---- v12.0.67 CASEVAC ---------------------------------------------------------------------------------------
  function freeMedic(m) { return m.st === 'idle' && !m.u.userData.rdDown && !m.u.userData.wounded && m.u.parent; }
  /** Bed slot k beside the side's aid tent (tent sits at rear + side*0.3, z -7.5). Casualties use Euler order YXZ while lying
   * so the body (origin at the feet) runs along the yaw heading: yaw 0 → body toward -z. */
  function bedPos(side, k) { return { x: rear(side) + side * (4.9 + (k % 3) * 0.95), z: -8.2 + Math.floor(k / 3) * 2.6 }; }   // head end; the cot runs 1.85 m toward -z
  function takeBed(side) {
    var use = bedUse[side];
    for (var k = 0; k < BEDS; k++) if (!use[k]) { use[k] = true; return k; }
    return Math.floor(Math.random() * BEDS);            // all full: share a slot (overflow lies beside it)
  }
  function freeBed(side, k) { if (k != null) bedUse[side][k] = false; }
  function makeLitter() {
    var e = E(), THREE = e.THREE;
    if (!litterMat) { litterMat = new THREE.MeshStandardMaterial({ color: 0x232818, roughness: 1, metalness: 0 }); poleMat = new THREE.MeshStandardMaterial({ color: 0x6b6f62, roughness: 0.5, metalness: 0.6 }); }
    var g = new THREE.Group(); g.name = 'casevac-litter';
    var bed = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 1.85), litterMat); g.add(bed);
    for (var s = -1; s <= 1; s += 2) { var pl = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 2.3), poleMat); pl.position.set(s * 0.29, 0.01, 0); g.add(pl); }
    if (tierName() !== 'LOW' && !e.mobile) for (var j = -1; j <= 1; j += 2) { var st = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.04), poleMat); st.position.set(0, -0.03, j * 0.8); g.add(st); }
    g.traverse(function (o) { if (o.isMesh) o.castShadow = tierName() !== 'LOW'; });
    e.scene.add(g); litters.push(g); return g;
  }
  function dropLitter(g) { if (!g) return; if (g.parent) g.parent.remove(g); var i = litters.indexOf(g); if (i >= 0) litters.splice(i, 1); }
  /** Treatment done on a SERIOUS casualty: form a litter team with a second free medic within RANGE, else it limps. */
  function startEvac(m, cu, x, z, yaw) {
    var side = cu.userData.side, bed = takeBed(side), best = null, bd = 1e9;
    (medics[side] || []).forEach(function (o) { if (o === m || !freeMedic(o) || noLitter[side]) return; var d = Math.hypot(o.u.position.x - x, o.u.position.z - z); if (d < bd) { bd = d; best = o; } });
    cu.userData.evac = { mode: 'litter', x: x, z: z, yaw: yaw, bed: bed, t: 0, t0: simClock() };
    if (best && bd <= RANGE) {
      var task = { kind: 'evac', u: cu, side: side, lead: m, picked: false, bed: bed };
      m.st = 'wait'; m.task = task; m.partner = best; best.st = 'go'; best.task = task; best.partner = m;
      cu.userData.evac.team = task;
      say(side, tag(m.u) + ': "Need a litter here — one urgent to the CCP."', true);
    } else { cu.userData.evac.mode = 'limp'; stats.limped++; say(side, tag(m.u) + ': "No litter free — he\'s walking to the CCP."'); }
  }
  function casevacCots() { return !(tierName() === 'LOW' || (E() && E().mobile)); }
  var OWNED = { board: 1, aboard: 1, hosp: 1, rtdWait: 1, rtdBoard: 1 };
  /** v12.0.68: put an urgent casualty that reached the CCP on the MEDEVAC manifest (js/theaters/medevac.js). */
  function toMedevac(u) { var MV = LB.medevac; if (!MV || !MV.isEnabled() || !MV.request(u)) return false; stats.dustoff++; say(u.userData.side, 'CCP: "Nine-line sent — one urgent, litter. Requesting dustoff."'); return true; }
  function simClock() { return Math.max(performance.now(), simNow); }
  /** Bearer hit / task dropped mid-carry: set the casualty down where it is and ask again. */
  function setDown(t, m) {
    var cu = t.u, ev = cu.userData.evac;
    dropLitter(t.litter); t.litter = null;
    var other = m === t.lead ? m.partner : t.lead;
    if (other && other.task === t) { other.st = 'idle'; other.task = null; other.partner = null; resetPose(other.u); }
    if (ev && ev.team === t) { ev.team = null; ev.mode = 'wait'; ev.t = 0; stats.setDown++; say(t.side, tag(cu) + ': "Bearer down! Casualty on the ground, need another litter!"', true); }
  }
  /** Casualties waiting for a litter (bearer hit): two free medics within RANGE re-form a team; after ~12 s it limps. */
  function dispatchEvac() {
    var A = E().getArmies(), all = A.bulls.concat(A.bears);
    for (var i = 0; i < all.length; i++) {
      var cu = all[i], ev = cu.userData && cu.userData.evac; if (!ev || ev.mode !== 'wait') continue;
      var side = cu.userData.side, free = (medics[side] || []).filter(freeMedic);
      free.sort(function (a, b) { return Math.hypot(a.u.position.x - ev.x, a.u.position.z - ev.z) - Math.hypot(b.u.position.x - ev.x, b.u.position.z - ev.z); });
      if (free.length >= 2 && Math.hypot(free[1].u.position.x - ev.x, free[1].u.position.z - ev.z) <= RANGE) {
        var task = { kind: 'evac', u: cu, side: side, lead: free[0], picked: false, bed: ev.bed };
        free[0].st = free[1].st = 'go'; free[0].task = free[1].task = task; free[0].partner = free[1]; free[1].partner = free[0];
        ev.team = task; ev.mode = 'litter';
        say(side, tag(free[0].u) + ': "Litter team moving, one urgent to the CCP."');
      } else if (ev.t > 12) { ev.mode = 'limp'; stats.limped++; }
    }
  }
  /** Litter team medic: both bearers close on the casualty, then the lead carries it to its bed slot; the partner follows 2 m behind. */
  function tickEvacTeam(m, t, dt) {
    var cu = t.u, ev = cu.userData.evac;
    if (!ev || ev.team !== t || cu.userData.rdDown || !cu.parent) { dropLitter(t.litter); t.litter = null; m.st = 'idle'; m.task = null; m.partner = null; resetPose(m.u); return; }
    var side = t.side;
    if (!t.picked) {
      var off = m === t.lead ? 1.0 : -1.0;
      if (m.st === 'go' && moveTo(m.u, ev.x, ev.z + off, 3.0, dt)) m.st = 'wait';
      if (m.st === 'wait') { pin(m.u); m.u.rotation.x = 0.4; }
      if (m === t.lead && m.st === 'wait' && m.partner && m.partner.st === 'wait') {
        t.picked = true; m.st = m.partner.st = 'litter'; m.u.rotation.x = m.partner.u.rotation.x = 0;
        stats.evacuated++; t.litter = makeLitter();
        say(side, tag(m.u) + ': "Litter team moving, one urgent to the CCP."', true);
      }
      return;
    }
    if (m !== t.lead) return;                                // the lead drives the pair
    var p2 = m.partner, bp = bedPos(side, t.bed);
    var arrived = moveTo(m.u, bp.x, bp.z + 0.7, EVAC_SPEED, dt);
    var yaw = m.u.rotation.y;
    if (p2) { var S2 = pin(p2.u); S2.x = p2.u.position.x = m.u.position.x - Math.sin(yaw) * 2.0; S2.z = p2.u.position.z = m.u.position.z - Math.cos(yaw) * 2.0; p2.u.position.y = E().terrainHeight(p2.u.position.x, p2.u.position.z); p2.u.rotation.y = yaw; }
    var mx = p2 ? (m.u.position.x + p2.u.position.x) / 2 : m.u.position.x, mz = p2 ? (m.u.position.z + p2.u.position.z) / 2 : m.u.position.z;
    ev.x = mx + Math.sin(yaw) * 0.88; ev.z = mz + Math.cos(yaw) * 0.88; ev.yaw = yaw;   // feet toward the lead, centred on the litter
    if (t.litter) { t.litter.position.set(mx, E().terrainHeight(mx, mz) + 0.78, mz); t.litter.rotation.set(0, yaw, 0); }
    if (arrived) {
      dropLitter(t.litter); t.litter = null;
      ev.team = null; ev.mode = 'ccp'; ev.t = 0; ev.x = bp.x; ev.z = bp.z; ev.yaw = 0; ev.mdv = toMedevac(cu);
      say(side, tag(m.u) + ': "Casualty at the CCP."');
      m.st = 'idle'; m.task = null; resetPose(m.u); if (p2) { p2.st = 'idle'; p2.task = null; p2.partner = null; resetPose(p2.u); } m.partner = null;
    }
  }
  /** Per-frame pose/position of every casualty in CASEVAC (overrides the engine's slot steering). */
  function tickEvac(all, dt) {
    var nNow = 0, nCcp = 0, e = E();
    for (var i = 0; i < all.length; i++) {
      var u = all[i], ud = u.userData, ev = ud && ud.evac; if (!ev) continue;
      if (ud.rdDown || !u.parent) { var tm = ev.team; ud.evac = null; if (tm) { dropLitter(tm.litter); [tm.lead, tm.lead && tm.lead.partner].forEach(function (q) { if (q && q.task === tm) { q.st = 'idle'; q.task = null; q.partner = null; resetPose(q.u); } }); } freeBed(ud.side, ev.bed); u.rotation.order = 'XYZ'; continue; }
      nNow++; ev.t += dt;
      if (ev.mode === 'limp') {
        var bp = bedPos(ud.side, ev.bed), dx = bp.x - ev.x, dz = bp.z - ev.z, d = Math.hypot(dx, dz);
        if (d < 0.5) { ev.mode = 'ccp'; ev.t = 0; ev.x = bp.x; ev.z = bp.z; ev.yaw = 0; ev.mdv = toMedevac(u); }
        else {
          var gait = 0.55 + 0.45 * Math.abs(Math.sin(ev.t * 3.2));            // uneven step: favours the injured leg
          var st = Math.min(d, LIMP_SPEED * gait / 0.837 * dt); ev.x += dx / d * st; ev.z += dz / d * st; ev.yaw = Math.atan2(dx, dz);
          u.position.set(ev.x, e.terrainHeight(ev.x, ev.z) - 0.04 * gait, ev.z);
          u.rotation.order = 'YXZ'; u.rotation.set(0.2, ev.yaw, 0.06 * Math.sin(ev.t * 3.2));
          ud.facing = ev.yaw; ud.mpos = null;
          continue;
        }
      }
      if (OWNED[ev.mode]) { if (ev.bed != null) { freeBed(ud.side, ev.bed); ev.bed = null; } continue; }   // v12.0.68: js/theaters/medevac.js drives these
      if (ev.mode === 'rtl') {   // v12.0.68 return to the line at a walk (the engine's slot approach would dash ~40 m/s)
        var sx = e.getFrontlineX() + ud.side * ((ud.home && ud.home.depth != null) ? ud.home.depth : 7.8), rdx = sx - ev.x;
        if (Math.abs(rdx) < 1.2) { ud.evac = null; u.rotation.order = 'XYZ'; resetPose(u); stats.rtl++; continue; }
        var rs = Math.min(Math.abs(rdx), RTL_SPEED * dt) * Math.sign(rdx); ev.x += rs; ev.yaw = rdx > 0 ? Math.PI / 2 : -Math.PI / 2;
        u.position.set(ev.x, e.terrainHeight(ev.x, ev.z), ev.z); u.rotation.order = 'YXZ'; u.rotation.set(0.05, ev.yaw, 0); ud.facing = ev.yaw; ud.mpos = null;
        continue;
      }
      if (ev.mode === 'ccp') {
        nCcp++;
        u.position.set(ev.x, e.terrainHeight(ev.x, ev.z - 0.88) + (casevacCots() ? 0.3 : 0.14), ev.z);
        u.rotation.order = 'YXZ'; u.rotation.set(-Math.PI / 2 + 0.05, ev.yaw, 0);
        if (!ev.board && ev.t > (ev.mdv ? MDV_WAIT : CCP_REST)) { freeBed(ud.side, ev.bed); ev.bed = null; ev.mode = 'rtl'; ev.mdv = false; ev.t = 0; stats.ccpDone++; if (Math.random() < 0.5) say(ud.side, tag(u) + ': "Treated at the CCP — returning to the line."'); }
        continue;
      }
      // waiting for / riding the litter
      var lift = ev.team && ev.team.picked ? 0.85 : 0.12;
      u.position.set(ev.x, e.terrainHeight(ev.x, ev.z) + lift, ev.z);
      u.rotation.order = 'YXZ'; u.rotation.set(-Math.PI / 2 + 0.05, ev.yaw, 0);
    }
    stats.evacNow = nNow; stats.atCcp = nCcp;
  }

  /** v12.0.66: casualty collection point at each side's rear — aid tent (MEDIUM+) and a CCP sign. */
  function buildCCP() {
    var e = E(), THREE = e && e.THREE; if (!THREE || !e.scene) return;
    var lite = tierName() === 'LOW' || e.mobile; ccp = new THREE.Group(); ccp.name = 'ccp-points';
    var canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64; var c = canvas.getContext('2d');
    c.fillStyle = '#f1efe6'; c.fillRect(0, 0, 128, 64); c.fillStyle = '#c62026'; c.fillRect(8, 22, 30, 10); c.fillRect(18, 12, 10, 30);
    c.fillStyle = '#1d211c'; c.font = 'bold 30px sans-serif'; c.fillText('CCP', 46, 44); c.strokeStyle = '#1d211c'; c.lineWidth = 4; c.strokeRect(2, 2, 124, 60);
    var signTex = new THREE.CanvasTexture(canvas), signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.8 });
    var post = new THREE.MeshStandardMaterial({ color: 0x5b4a36, roughness: 0.95 }), canvasMat = new THREE.MeshStandardMaterial({ color: 0x4e5236, roughness: 0.95, side: THREE.DoubleSide });
    var litter = new THREE.MeshStandardMaterial({ color: 0x343d2a, roughness: 0.9 });
    var cotMat = new THREE.MeshStandardMaterial({ color: 0x1e2316, roughness: 1, metalness: 0 }), cotRail = new THREE.MeshStandardMaterial({ color: 0x4d5046, roughness: 0.55, metalness: 0.5 });   // v12.0.67 field cots
    [-1, 1].forEach(function (side) {
      var g = new THREE.Group(), x = rear(side) + side * 2.5, z = -7.5;
      g.position.set(x, e.terrainHeight(x, z), z);
      var sp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), post); sp.position.set(0, 0.8, 0); g.add(sp);
      var sg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.04), signMat); sg.position.set(0, 1.45, 0.06); sg.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(sg);
      if (!lite) {   // GP-small style aid tent (~4 x 3 m, ridge 2.2 m) + two folded litters
        var tent = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 4, 3, 1, true, Math.PI), canvasMat); tent.rotation.x = Math.PI / 2; tent.position.set(-side * 2.2, 0.8, 0); g.add(tent);
        var flap = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.4), signMat); flap.position.set(-side * 2.2, 0.95, 2.02); g.add(flap);
        for (var k = 0; k < 2; k++) { var L = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 2.0), litter); L.position.set(side * 0.9 + k * 0.7 * side, 0.05 + k * 0.06, 1.2); g.add(L); }
        if (casevac) for (var b = 0; b < BEDS; b++) {   // v12.0.67: folding field cots (canvas on two steel rails) at the CASEVAC bed slots
          var bp = bedPos(side, b), cot = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 1.85), cotMat), cy = e.terrainHeight(bp.x, bp.z - 0.88) - g.position.y;
          cot.position.set(bp.x - x, cy + 0.2, bp.z - 0.88 - z); cot.name = 'ccp-cot'; g.add(cot);
          for (var r = -1; r <= 1; r += 2) { var rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 1.95), cotRail); rail.position.set(bp.x - x + r * 0.29, cy + 0.11, bp.z - 0.88 - z); g.add(rail); }
        }
      }
      g.traverse(function (o) { if (o.isMesh) { o.castShadow = !lite; o.receiveShadow = true; } });
      ccp.add(g); stats.ccp++;
    });
    e.scene.add(ccp);
  }
  function update() {
    if (!enabled) return;
    var e = E(); if (!e) return;
    var now = performance.now(), dt = Math.min(0.5, (now - (lastT || now)) / 1000); lastT = now;
    if (care && !ccp && e.scene && e.THREE) { try { buildCCP(); } catch (err) { ccp = 1; console.warn('[medics] ccp', err); } }
    if (casevac && LB.medevac && LB.medevac.ensure) LB.medevac.ensure();
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive())) return;
    tick(dt, now);
  }
  function tick(dt, now) {
    var e = E();
    var t0 = performance.now(), A = e.getArmies();
    if (now > assignT) { assignT = now + 2000; assign(A); }
    if (now > dispatchT) { dispatchT = now + 500; dispatch(); }
    tickWounded(A, dt, now);
    [-1, 1].forEach(function (s) { medics[s].forEach(function (m) { tickMedic(m, dt, now); }); });
    if (casevac && LB.medevac && LB.medevac.tick) { try { LB.medevac.tick(dt); } catch (err) { if (!tick._mvErr) { tick._mvErr = 1; console.warn('[medevac]', err); } } }
    stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1;
  }
  function reset() {
    [-1, 1].forEach(function (s) { medics[s].forEach(function (m) { if (m.st !== 'idle') dropTask(m); }); });
    if (LB.medevac && LB.medevac.reset) try { LB.medevac.reset(); } catch (_) {}
    requests.length = 0; ccpCount[-1] = ccpCount[1] = 0; bedUse[-1] = []; bedUse[1] = []; litters.slice().forEach(dropLitter);
    try { var A = E().getArmies(); A.bulls.concat(A.bears).forEach(function (u) { if (u.userData && (u.userData.wounded || u.userData.evac)) { u.userData.wounded = null; u.userData.evac = null; u.rotation.order = 'XYZ'; resetPose(u); } }); } catch (_) {}
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
  LB.medics = { update: update, reset: reset, isEnabled: function () { return enabled; }, careEnabled: function () { return care; }, casevacEnabled: function () { return casevac; },
    _evacOf: function (u) { var ev = u && u.userData.evac; return ev ? { mode: ev.mode, x: ev.x, z: ev.z, picked: !!(ev.team && ev.team.picked), bed: ev.bed, t: ev.t, litters: litters.length, y: u.position.y - E().terrainHeight(u.position.x, u.position.z) } : null; },
    _noLitter: function (side, b) { noLitter[side] = !!b; },
    _hitBearer: function (u) { var ev = u && u.userData.evac; if (!ev || !ev.team) return false; var m = ev.team.lead; dropTask(m); stats.medicsHit++; return true; },
    // test hooks (v12.0.66): wound a given unit, step the medic sim with a fixed dt, read a medic's state
    _wound: function (u, serious) { if (enabled && u && u.userData && !u.userData.wounded) wound(u, serious, simClock()); return !!(u && u.userData.wounded); },
    _step: function (sec) { var e = E(); if (!e) return; var t0 = Math.max(performance.now(), simNow); for (var t = 0; t < sec - 1e-6; t += 0.1) tick(0.1, t0 + t * 1000); simNow = t0 + sec * 1000; },
    _medicOf: function (u) { var w = u && u.userData.wounded; return w && w.medic ? { st: w.medic.st, danger: !!(w.medic.task && w.medic.task.danger), x: w.medic.u.position.x, z: w.medic.u.position.z } : null; },
    _medics: function (side) { return (medics[side] || []).map(function (m) { return m.u; }); },
    getStats: function () {
      var busy = 0; [-1, 1].forEach(function (s) { medics[s].forEach(function (m) { if (m.st !== 'idle') busy++; }); });
      return Object.assign({ busy: busy, queue: requests.length, tier: tierName() }, stats);
    },
    _debug: function () { return [-1, 1].map(function (s) { return medics[s].map(function (m) { return m.st + (m.task ? ':' + m.task.kind : ''); }); }); } };
})(window);
