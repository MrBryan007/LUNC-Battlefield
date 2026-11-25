/* LUNC Battlefield v12.0.68 — MEDEVAC ("Dustoff"): helicopter lift of urgent casualties from the CCP (SIMULATED, cosmetic).
 * Realism checklist, Combat behavior — the open item after v12.0.67 CASEVAC. Never touches market data, army counts,
 * the frontline or data-truth labels: casualties stay in their army the whole time and return to duty afterwards.
 * - Each side keeps one UH-60-style MEDEVAC helicopter (olive, red-cross panels, 4-blade main rotor, tail rotor; ~0.8 of a
 *   real Black Hawk so it reads next to the 1.8 m soldiers) on a Role 2 field-hospital pad behind its HQ.
 * - Each CCP gets an HLZ (cleared dirt circle + orange VS-17 marker panel) a few metres to its rear.
 * - An urgent (SERIOUS) casualty that reaches its CCP cot is put on the manifest. The helo spools up ("Dustoff inbound"),
 *   climbs to ~25 m AGL, cruises at ~24 m/s, decelerates on a constant-deceleration approach, flares nose-up and lands;
 *   a CCP medic pops green smoke to mark the HLZ; rotor downwash kicks up dust (MEDIUM+).
 * - Flight medic + crew chief dismount, carry each patient from its cot to the cabin on a litter (max 2 per lift), the
 *   helo lifts off and flies to the hospital. Patients rest on ward cots ~40 s, then return to duty on the next sortie
 *   back to the HLZ, dismount there and walk back to the line (js/ai/medics.js 'rtl').
 * Kill switch: ?medevac=0 (also off with ?casevac=0 / ?casualty=0 / ?medics=0). Driven from js/ai/medics.js tick(). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = ['medevac', 'casevac', 'casualty', 'medics'].every(function (k) { return qs.get(k) !== '0'; });
  var E = function () { return LB.engine; };
  var S = 0.8, AGL = 25, VMAX = 24, DECEL = 2.2, ACC = 2.6, VZ = 5, TURN = 0.6, MAX_LOAD = 2, WARD_T = 40, CREW_V = 3.0, LITTER_V = 1.6, WAIT_MAX = 150;
  var H = {}, built = false, stats = { sorties: 0, lifted: 0, rtd: 0, landings: 0, smoke: 0, onboard: 0, ward: 0, manifest: 0 };
  var manifest = { '-1': [], '1': [] }, ward = { '-1': [], '1': [] }, mats = null;
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function lite() { var e = E(); return tierName() === 'LOW' || (e && e.mobile); }
  function hlz(side) { return { x: side * 56, z: -9 }; }
  function hosp(side) { return { x: side * 132, z: 22 }; }
  function say(side, text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: side, type: 'medic', text: text }); } catch (_) {} }
  function call(side) { return 'DUSTOFF ' + (side < 0 ? '2-1' : '6-4'); }

  // ---- models --------------------------------------------------------------------------------------------------
  function M() {
    if (mats) return mats;
    var T = E().THREE;
    mats = {
      hull: new T.MeshStandardMaterial({ color: 0x3b4230, roughness: 0.7, metalness: 0.25 }),
      dark: new T.MeshStandardMaterial({ color: 0x1d201a, roughness: 0.6, metalness: 0.4 }),
      glass: new T.MeshStandardMaterial({ color: 0x1c2a30, roughness: 0.15, metalness: 0.6 }),
      white: new T.MeshStandardMaterial({ color: 0xe9e7df, roughness: 0.8 }),
      red: new T.MeshBasicMaterial({ color: 0xc4161c }),
      blade: new T.MeshStandardMaterial({ color: 0x23251f, roughness: 0.5, metalness: 0.3 }),
      disc: new T.MeshBasicMaterial({ color: 0x2a2c26, transparent: true, opacity: 0.18, depthWrite: false, side: T.DoubleSide }),
      suit: new T.MeshStandardMaterial({ color: 0x5c6243, roughness: 0.95 }),
      helmet: new T.MeshStandardMaterial({ color: 0x3a3f2e, roughness: 0.5, metalness: 0.2 }),
      dirt: new T.MeshStandardMaterial({ color: 0x6d5a40, roughness: 1, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      panel: new T.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.8, emissive: 0x3a1000, polygonOffset: true, polygonOffsetFactor: -3 }),
      pad: new T.MeshStandardMaterial({ color: 0x55585a, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }),
      tent: new T.MeshStandardMaterial({ color: 0x4e5236, roughness: 0.95, side: T.DoubleSide }),
      cot: new T.MeshStandardMaterial({ color: 0x1e2316, roughness: 1 }),
      litter: new T.MeshStandardMaterial({ color: 0x232818, roughness: 1 })
    };
    return mats;
  }
  function box(w, h, d, m, x, y, z, parent) { var T = E().THREE, o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); if (parent) parent.add(o); return o; }
  function crossDecal(parent, x, y, z, ry, s) {   // red cross on a white square
    var g = new (E().THREE).Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
    box(0.9 * s, 0.9 * s, 0.02, M().white, 0, 0, 0, g); box(0.7 * s, 0.2 * s, 0.03, M().red, 0, 0, 0.005, g); box(0.2 * s, 0.7 * s, 0.03, M().red, 0, 0, 0.005, g);
    return g;
  }
  /** UH-60-style helicopter, nose toward local +z. Real: fuselage ~15.3 m, rotor Ø 16.4 m, height 5.1 m; built at scale S. */
  function buildHeli() {
    var T = E().THREE, m = M(), g = new T.Group(), body = new T.Group(); g.add(body); body.scale.setScalar(S); g.name = 'medevac-heli';
    box(2.3, 1.9, 6.0, m.hull, 0, 1.75, 0.6, body);                        // cabin
    var nose = box(2.0, 1.5, 2.2, m.hull, 0, 1.6, 4.6, body); nose.rotation.x = 0.12;
    box(1.9, 0.9, 1.4, m.glass, 0, 2.15, 4.4, body);                        // cockpit glazing
    box(1.6, 0.7, 3.2, m.hull, 0, 2.95, 0.4, body);                         // engine deck
    var boom = box(0.75, 0.75, 7.6, m.hull, 0, 2.25, -6.0, body); boom.rotation.x = -0.05;
    var fin = box(0.22, 2.4, 1.3, m.hull, 0, 3.2, -9.6, body); fin.rotation.x = -0.35;
    box(3.6, 0.08, 0.9, m.hull, 0, 2.2, -9.0, body);                         // stabilator
    [-1, 1].forEach(function (s) {                                          // wheels / sponsons
      box(0.25, 0.7, 0.25, m.dark, s * 1.15, 0.45, 2.6, body); box(0.3, 0.5, 0.5, m.dark, s * 1.15, 0.25, 2.6, body);
      box(0.9, 0.45, 2.2, m.hull, s * 1.5, 1.4, 0.5, body);                  // ESSS stub / step
      crossDecal(body, s * 1.16, 1.9, 0.9, s * Math.PI / 2, 1.1);           // cabin doors
    });
    box(0.22, 0.4, 0.3, m.dark, 0, 1.2, -9.6, body);                         // tail wheel
    crossDecal(body, 0, 2.6, 5.75, 0, 0.8);                                  // nose
    var mast = box(0.3, 0.5, 0.3, m.dark, 0, 3.5, 0.6, body);
    var rotor = new T.Group(); rotor.position.set(0, 3.8, 0.6); body.add(rotor);
    for (var i = 0; i < 4; i++) { var bl = box(0.5, 0.05, 8.2, m.blade, 0, 0, 4.1, null); var arm = new T.Group(); arm.rotation.y = i * Math.PI / 2; bl.rotation.z = 0.02; arm.add(bl); rotor.add(arm); }
    var disc = new T.Mesh(new T.CircleGeometry(8.2, 28), m.disc); disc.rotation.x = -Math.PI / 2; disc.visible = false; rotor.add(disc);
    var trotor = new T.Group(); trotor.position.set(0.25, 3.9, -9.8); body.add(trotor);
    for (var j = 0; j < 4; j++) { var tb = box(0.04, 1.6, 0.22, m.blade, 0, 0.8, 0, null); var ta = new T.Group(); ta.rotation.x = j * Math.PI / 2; ta.add(tb); trotor.add(ta); }
    g.traverse(function (o) { if (o.isMesh && o !== disc) { o.castShadow = !lite(); o.receiveShadow = false; } });
    g.userData = { body: body, rotor: rotor, disc: disc, trotor: trotor };
    return g;
  }
  function buildCrew() {
    var T = E().THREE, m = M(), g = new T.Group(); g.name = 'medevac-crew';
    box(0.42, 0.62, 0.26, m.suit, 0, 1.15, 0, g); box(0.38, 0.8, 0.22, m.suit, 0, 0.42, 0, g);
    var h = new T.Mesh(new T.SphereGeometry(0.15, 10, 8), m.helmet); h.position.set(0, 1.62, 0); g.add(h);
    box(0.25, 0.06, 0.14, m.glass, 0, 1.62, 0.12, g);
    var arm = crossDecal(g, -0.22, 1.25, 0, -Math.PI / 2, 0.16); arm.scale.x = 0.9;
    g.visible = false; E().scene.add(g); return g;
  }
  function buildLitter() {
    var T = E().THREE, g = new T.Group(); g.name = 'medevac-litter';
    box(0.56, 0.03, 1.85, M().litter, 0, 0, 0, g); box(0.04, 0.04, 2.3, M().dark, -0.29, 0.01, 0, g); box(0.04, 0.04, 2.3, M().dark, 0.29, 0.01, 0, g);
    g.visible = false; E().scene.add(g); return g;
  }
  function buildSites() {
    var e = E(), T = e.THREE, m = M();
    [-1, 1].forEach(function (side) {
      // HLZ beside the CCP: cleared circle + VS-17 panel
      var z = hlz(side), g = new T.Group(); g.name = 'medevac-hlz'; g.position.set(z.x, e.terrainHeight(z.x, z.z) + 0.03, z.z);
      var c = new T.Mesh(new T.CircleGeometry(7.5, 28), m.dirt); c.rotation.x = -Math.PI / 2; g.add(c);
      var p = new T.Mesh(new T.PlaneGeometry(1.8, 0.7), m.panel); p.rotation.x = -Math.PI / 2; p.position.set(-side * 5.5, 0.04, 4.5); g.add(p);
      e.scene.add(g);
      // Role 2 field hospital: H pad, ward cots, tents (MEDIUM+)
      var h = hosp(side), hg = new T.Group(); hg.name = 'medevac-hospital'; hg.position.set(h.x, e.terrainHeight(h.x, h.z) + 0.03, h.z);
      var pad = new T.Mesh(new T.CircleGeometry(8, 32), m.pad); pad.rotation.x = -Math.PI / 2; hg.add(pad);
      var hw = new T.Group(); hw.position.y = 0.05; hg.add(hw);
      box(0.7, 0.02, 5, m.white, -1.6, 0, 0, hw); box(0.7, 0.02, 5, m.white, 1.6, 0, 0, hw); box(3.2, 0.02, 0.7, m.white, 0, 0, 0, hw);
      for (var k = 0; k < 6; k++) { var cp = wardPos(side, k); var cot = box(0.6, 0.06, 1.85, m.cot, cp.x - h.x, 0.25, cp.z - 0.88 - h.z, hg); cot.name = 'medevac-ward-cot'; }
      if (!lite()) for (var t = 0; t < 2; t++) {
        var tent = new T.Mesh(new T.CylinderGeometry(2.2, 2.2, 7, 3, 1, true, Math.PI), m.tent); tent.rotation.x = Math.PI / 2;
        tent.position.set(side * (13 + t * 5), 1.1, -10); hg.add(tent);
        crossDecal(hg, side * (13 + t * 5), 2.4, -6.45, 0, 1.2);
      }
      hg.traverse(function (o) { if (o.isMesh) { o.receiveShadow = true; o.castShadow = !lite() && o.geometry.type !== 'CircleGeometry'; } });
      e.scene.add(hg);
      var heli = buildHeli(); e.scene.add(heli);
      var hs = H[side] = { side: side, g: heli, st: 'pad', t: 0, x: h.x, y: 0, z: h.z, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, v: 0, vy: 0, pitch: 0, roll: 0, rpm: 0,
        dest: null, aboard: [], crew: [buildCrew(), buildCrew()], litter: buildLitter(), job: null, smoked: false, cool: 0, dustT: 0 };
      hs.y = e.terrainHeight(h.x, h.z);
      place(hs);
    });
    built = true;
  }
  function wardPos(side, k) { var h = hosp(side); return { x: h.x + side * (9 + (k % 3) * 1.0), z: h.z + 4 + Math.floor(k / 3) * 2.6 }; }

  // ---- flight model --------------------------------------------------------------------------------------------
  function place(h) {
    var g = h.g; g.position.set(h.x, h.y, h.z); g.rotation.order = 'YXZ'; g.rotation.set(h.pitch, h.yaw, h.roll);
    var ud = g.userData; ud.rotor.rotation.y += h.rpm * 0.45; ud.trotor.rotation.x += h.rpm * 0.9;
    ud.disc.visible = h.rpm > 0.6 && !lite();
  }
  /** Fly toward (tx, tz) and land; returns true once on the ground there. */
  function fly(h, tx, tz, dt) {
    var e = E(), dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz), gy = e.terrainHeight(h.x, h.z);
    // heading: turn toward the target (rate-limited) while it is more than a few metres away
    if (d > 4) { var want = Math.atan2(dx, dz), dy = Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw)), turn = Math.max(-TURN * dt, Math.min(TURN * dt, dy)); h.yaw += turn; h.om = turn / dt; } else h.om = 0;
    var agl = h.y - gy, aligned = Math.cos(Math.atan2(dx, dz) - h.yaw) > 0.7;
    // speed: accelerate to cruise once airborne and aligned; constant-deceleration approach (v = sqrt(2·a·d))
    var vt = agl < 4 ? 0 : Math.min(VMAX, Math.sqrt(2 * DECEL * Math.max(0, d - 1.5)));
    if (!aligned && d > 6) vt = Math.min(vt, 6);
    var dv = Math.max(-DECEL * 1.4 * dt, Math.min(ACC * dt, vt - h.v)); h.v += dv;
    var step = Math.min(d, h.v * dt); if (d > 1e-3) { h.x += Math.sin(h.yaw) * step * (aligned || d < 6 ? 1 : 0.6); h.z += Math.cos(h.yaw) * step * (aligned || d < 6 ? 1 : 0.6); }
    if (d < 6 && d > 0.05) { h.x += dx / d * Math.min(d, 1.2 * dt); h.z += dz / d * Math.min(d, 1.2 * dt); }   // hover-taxi onto the spot
    // altitude: climb out to AGL, glide down on approach (1.5 m + 0.5·d), touch down slowly
    var at = d > 1.2 ? Math.min(AGL, 1.5 + d * 0.5) : 0, vyT = Math.max(-VZ, Math.min(VZ, (at - agl) * 0.9));
    if (at === 0) vyT = Math.max(-1.0, vyT);
    h.vy += (vyT - h.vy) * Math.min(1, dt * 2); h.y = Math.max(gy, h.y + h.vy * dt);
    // attitude: nose down to accelerate, nose up in the flare; bank into turns
    var pT = Math.max(-0.26, Math.min(0.2, dv / Math.max(dt, 1e-3) * 0.07 + h.v * 0.003));
    h.pitch += (pT - h.pitch) * Math.min(1, dt * 2.5);
    var rT = Math.max(-0.4, Math.min(0.4, -(h.om || 0) * h.v * 0.05));
    h.roll += (rT - h.roll) * Math.min(1, dt * 2);
    if (h.y - gy < 0.05 && d < 1.3) { h.y = gy; h.v = 0; h.vy = 0; h.pitch *= 0.5; h.roll *= 0.5; return true; }
    return false;
  }
  function downwash(h, dt) {
    if (lite() || !LB.heavyFx) return;
    var e = E(), agl = h.y - e.terrainHeight(h.x, h.z); if (agl > 14 || h.rpm < 0.7) return;
    h.dustT -= dt; if (h.dustT > 0) return; h.dustT = 0.09;
    var a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 4, k = 1 - agl / 14;
    LB.heavyFx.puff({ kind: 'dust', x: h.x + Math.cos(a) * r, y: e.terrainHeight(h.x, h.z) + 0.4, z: h.z + Math.sin(a) * r, vx: Math.cos(a) * 5 * k, vz: Math.sin(a) * 5 * k, vy: 0.4, size: 2.2, grow: 1.4, life: 1.8, color: 0xb59d78, opacity: 0.45 * k, drag: 0.93 });
  }
  function greenSmoke(side) {
    var z = hlz(side), e = E(); if (!LB.heavyFx) return;
    for (var i = 0; i < 6; i++) LB.heavyFx.puff({ kind: 'smoke', x: z.x - side * 5 + (Math.random() - 0.5) * 0.6, y: e.terrainHeight(z.x, z.z) + 0.4, z: z.z + 3.5, vy: 0.9 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 0.4, size: 1.0, grow: 1.6, life: 5 + Math.random() * 2, color: 0x58c46a, opacity: 0.6, delay: i * 0.35, drag: 0.98 });
  }

  // ---- patients ------------------------------------------------------------------------------------------------
  /** Called by medics.js when an urgent casualty reaches its CCP cot. Returns true when it is on the manifest. */
  function request(u) {
    if (!enabled || !built) return false;
    var side = u.userData.side; if (manifest[side].indexOf(u) < 0) manifest[side].push(u);
    return true;
  }
  function valid(u) { return u && u.parent && u.userData && !u.userData.rdDown && u.userData.evac; }
  function waiting(side) { manifest[side] = manifest[side].filter(function (u) { return valid(u) && u.userData.evac.mdv && (u.userData.evac.mode === 'ccp' || u.userData.evac.mode === 'board'); }); return manifest[side]; }
  function rtdReady(side) { return ward[side].filter(function (w) { return valid(w.u) && w.t > WARD_T; }); }
  function setPose(u, x, y, z, yaw, lying) { u.position.set(x, y, z); u.rotation.order = 'YXZ'; u.rotation.set(lying ? -Math.PI / 2 + 0.05 : 0, yaw, 0); u.userData.mpos = null; }
  function cabin(h, k, lying) {    // a seat / litter position inside the cabin (hidden by the hull)
    var c = Math.cos(h.yaw), s = Math.sin(h.yaw), lx = (k % 2 ? 0.45 : -0.45) * S, lz = (lying ? 0.9 : 0.4 + 0.4 * Math.floor(k / 2)) * S;
    return { x: h.x + c * lx + s * lz, y: h.y + 1.0 * S, z: h.z - s * lx + c * lz };
  }
  function door(h, side) {   // ground point beside the cabin door, on the side facing the CCP
    var c = Math.cos(h.yaw), s = Math.sin(h.yaw), lx = 2.4 * (side < 0 ? 1 : -1);
    return { x: h.x + c * lx + s * 0.5 * S, z: h.z - s * lx + c * 0.5 * S };
  }
  function walk(o, tx, tz, v, dt) {   // o = {x, z, yaw}; returns true on arrival
    var dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz); if (d < 0.25) return true;
    var st = Math.min(d, v * dt); o.x += dx / d * st; o.z += dz / d * st; o.yaw = Math.atan2(dx, dz); return false;
  }

  // ---- per-side state machine ----------------------------------------------------------------------------------
  function tickSide(h, dt) {
    var e = E(), side = h.side, z = hlz(side), hp = hosp(side);
    h.t += dt; h.cool -= dt;
    var flying = h.st === 'toHlz' || h.st === 'toHosp';
    h.rpm += ((h.st === 'pad' ? 0 : flying || h.st === 'spool' || h.st === 'spoolH' ? 1 : 0.8) - h.rpm) * Math.min(1, dt * (h.st === 'pad' ? 0.35 : 0.8));
    if (h.st === 'pad') {
      // ward: patients recover, then wait for a ride back
      var need = waiting(side).length > 0, rtd = rtdReady(side);
      if (h.cool <= 0 && (need || rtd.length)) {
        h.st = 'spool'; h.t = 0; stats.sorties++; h.smoked = false;
        rtd.slice(0, 4).forEach(function (w) { ward[side].splice(ward[side].indexOf(w), 1); w.u.userData.evac.mode = 'rtdBoard'; h.aboard.push({ u: w.u, rtd: true, boarded: false }); });
        say(side, call(side) + ': "Lifting for the HLZ' + (need ? ', one urgent pickup' : ', returning ' + rtd.length + ' to duty') + '."');
      }
    } else if (h.st === 'spool') {
      boardRtd(h, dt);
      if (h.t > 3.5 && h.aboard.every(function (a) { return a.boarded; })) { h.st = 'toHlz'; h.t = 0; }
    } else if (h.st === 'toHlz') {
      var d = Math.hypot(z.x - h.x, z.z - h.z);
      if (!h.smoked && d < 70) { h.smoked = true; stats.smoke++; greenSmoke(side); say(side, 'CCP: "' + call(side) + ', smoke is out." ' + call(side) + ': "I see green smoke."'); }
      if (fly(h, z.x, z.z, dt)) { h.st = 'ground'; h.t = 0; stats.landings++; h.job = null; dismountRtd(h); }
    } else if (h.st === 'ground') {
      loadPatients(h, dt);
      if (!h.job && h.t > 6 && (h.aboard.length >= MAX_LOAD || !waiting(side).filter(free).length)) { crewHide(h); h.st = 'spoolH'; h.t = 0; }
    } else if (h.st === 'spoolH') {
      if (h.t > 2) { h.st = 'toHosp'; h.t = 0; if (h.aboard.length) say(side, call(side) + ': "Wheels up, ' + h.aboard.length + ' urgent aboard, ten minutes to the Role 2."'); }
    } else if (h.st === 'toHosp') {
      if (fly(h, hp.x, hp.z, dt)) {
        h.st = 'pad'; h.t = 0; h.cool = 6;
        h.aboard.forEach(function (a, k) {
          var ev = a.u.userData.evac; if (!ev) return; var wp = wardPos(side, ward[side].length % 6);
          ev.mode = 'hosp'; ev.x = wp.x; ev.z = wp.z; ward[side].push({ u: a.u, t: 0 }); stats.lifted++;
        });
        h.aboard = [];
      }
    }
    // passengers ride inside the cabin
    h.aboard.forEach(function (a, k) { if (a.boarded && valid(a.u)) { var p = cabin(h, k, !a.rtd); setPose(a.u, p.x, p.y, p.z, h.yaw, !a.rtd); } });
    ward[side] = ward[side].filter(function (w) { return valid(w.u); });
    ward[side].forEach(function (w, k) {
      w.t += dt; var ev = w.u.userData.evac;
      if (w.t <= WARD_T) setPose(w.u, ev.x, e.terrainHeight(ev.x, ev.z) + 0.3, ev.z, 0, true);
      else { var p = { x: hp.x + side * 6, z: hp.z - 3 + (k % 4) * 1.2 }; setPose(w.u, p.x, e.terrainHeight(p.x, p.z), p.z, -side * Math.PI / 2, false); ev.mode = 'rtdWait'; }
    });
    downwash(h, dt);
    place(h);
  }
  function free(u) { return !u.userData.evac.board; }
  function boardRtd(h, dt) {
    var e = E(), dp = door(h, -h.side);
    h.aboard.forEach(function (a) {
      if (a.boarded || !valid(a.u)) { a.boarded = true; return; }
      var o = a.w || (a.w = { x: a.u.position.x, z: a.u.position.z, yaw: 0 });
      if (walk(o, dp.x, dp.z, 1.6, dt)) { a.boarded = true; a.u.userData.evac.mode = 'aboard'; return; }
      setPose(a.u, o.x, e.terrainHeight(o.x, o.z), o.z, o.yaw, false);
    });
  }
  function dismountRtd(h) {
    var dp = door(h, h.side), keep = [];
    h.aboard.forEach(function (a) {
      if (!a.rtd) { keep.push(a); return; }
      if (!valid(a.u)) return;
      var ev = a.u.userData.evac; ev.mode = 'rtl'; ev.x = dp.x + (Math.random() - 0.5); ev.z = dp.z + (Math.random() - 0.5); ev.t = 0; ev.mdv = false; ev.board = false; stats.rtd++;
    });
    h.aboard = keep;
    if (stats.rtd && Math.random() < 0.6) say(h.side, call(h.side) + ': "Return-to-duty soldiers off at the HLZ."');
  }
  function crewHide(h) { h.crew.forEach(function (c) { c.visible = false; }); h.litter.visible = false; }
  /** Flight medic + crew chief: door → cot → lift → carry back on the litter → load. */
  function loadPatients(h, dt) {
    var e = E(), side = h.side, dp = door(h, side), j = h.job, c0 = h.crew[0], c1 = h.crew[1];
    if (!j) {
      if (h.aboard.length >= MAX_LOAD) return;
      var u = waiting(side).filter(free)[0]; if (!u) return;
      u.userData.evac.board = true;
      j = h.job = { u: u, st: 'out', a: { x: dp.x, z: dp.z + 0.6, yaw: 0 }, b: { x: dp.x, z: dp.z - 0.6, yaw: 0 }, t: 0 };
      c0.visible = c1.visible = true;
      say(side, call(side) + ' medic: "Moving to the casualty."');
    }
    var ev = valid(j.u) ? j.u.userData.evac : null;
    if (!ev) { h.job = null; h.litter.visible = false; return; }
    j.t += dt;
    if (j.st === 'out') {
      var dn = walk(j.a, ev.x, ev.z + 0.4, CREW_V, dt), dn2 = walk(j.b, ev.x, ev.z - 2.2, CREW_V, dt);
      if (dn && dn2) { j.st = 'lift'; j.t = 0; ev.mode = 'board'; }
    } else if (j.st === 'lift') {
      if (j.t > 1.5) { j.st = 'carry'; j.t = 0; h.litter.visible = true; }
    } else if (j.st === 'carry') {
      var arrived = walk(j.a, dp.x, dp.z, LITTER_V, dt), yaw = j.a.yaw;
      j.b.x = j.a.x - Math.sin(yaw) * 2.0; j.b.z = j.a.z - Math.cos(yaw) * 2.0; j.b.yaw = yaw;
      var mx = (j.a.x + j.b.x) / 2, mz = (j.a.z + j.b.z) / 2;
      h.litter.position.set(mx, e.terrainHeight(mx, mz) + 0.78, mz); h.litter.rotation.set(0, yaw, 0);
      ev.x = mx + Math.sin(yaw) * 0.88; ev.z = mz + Math.cos(yaw) * 0.88; ev.yaw = yaw;
      setPose(j.u, ev.x, e.terrainHeight(ev.x, ev.z) + 0.85, ev.z, yaw, true);
      if (arrived) {
        h.litter.visible = false; ev.mode = 'aboard'; h.aboard.push({ u: j.u, rtd: false, boarded: true });
        manifest[side].splice(manifest[side].indexOf(j.u), 1); h.job = null;
        j.a = { x: dp.x, z: dp.z, yaw: 0 };
      }
    }
    if (h.job) [[c0, j.a], [c1, j.b]].forEach(function (p) { p[0].position.set(p[1].x, e.terrainHeight(p[1].x, p[1].z), p[1].z); p[0].rotation.y = p[1].yaw; });
    else crewHide(h);
  }

  function tick(dt) {
    if (!enabled) return;
    var e = E(); if (!e || !e.scene || !e.THREE) return;
    if (!built) { try { buildSites(); } catch (err) { built = true; enabled = false; console.warn('[medevac]', err); return; } }
    [-1, 1].forEach(function (s) { if (H[s]) tickSide(H[s], dt); });
    stats.onboard = (H[-1] ? H[-1].aboard.length : 0) + (H[1] ? H[1].aboard.length : 0);
    stats.ward = ward[-1].length + ward[1].length; stats.manifest = manifest[-1].length + manifest[1].length;
  }
  function ensure() { var e = E(); if (enabled && !built && e && e.scene && e.THREE) { try { buildSites(); } catch (err) { built = true; enabled = false; console.warn('[medevac]', err); } } }
  function reset() {
    [-1, 1].forEach(function (s) {
      manifest[s] = []; ward[s] = []; var h = H[s]; if (!h) return;
      h.aboard = []; h.job = null; crewHide(h); var hp = hosp(s); h.st = 'pad'; h.x = hp.x; h.z = hp.z; h.y = E().terrainHeight(hp.x, hp.z); h.v = h.vy = h.pitch = h.roll = 0; place(h);
    });
  }
  LB.medevac = { isEnabled: function () { return enabled; }, request: request, tick: tick, ensure: ensure, reset: reset, hlz: hlz, hosp: hosp,
    getStats: function () { return Object.assign({ st: { bulls: H[-1] ? H[-1].st : null, bears: H[1] ? H[1].st : null } }, stats); },
    _heli: function (side) { var h = H[side]; return h ? { st: h.st, x: h.x, y: h.y, z: h.z, agl: h.y - E().terrainHeight(h.x, h.z), v: h.v, pitch: h.pitch, roll: h.roll, rpm: h.rpm, aboard: h.aboard.length, job: h.job ? h.job.st : null } : null; },
    _ward: function (side) { return ward[side].map(function (w) { return { t: w.t, mode: w.u.userData.evac && w.u.userData.evac.mode }; }); } };
})(window);
