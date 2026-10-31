/* LUNC Battlefield v12.0.20 — submarine warfare: sonar & ASW (v12.1: deepen the basic v12.0 subs). Game/sim layer.
 * Takes over the v12.0 ambush subs (js/theaters/extras.js) and gives both navies a hunter-killer fight under the waves:
 *  · own procedural attack-sub hull (round hull, tapered bow/stern, sail + sail planes, cruciform tail, shrouded
 *    propulsor, faction stripe); periscope/mast raised only at periscope depth with a small feather wake
 *  · tactics: patrol deep & quiet → stalk the nearest enemy surface ship → periscope depth for a firing solution →
 *    wire-guided heavyweight torpedo (18 m/s, 14 s run) → go deep and sprint away (noisy) → patrol; 4 torpedoes, then reload
 *  · sonar: every sailing enemy warship listens (destroyers best). Range grows with the sub's noise (quiet 18 m,
 *    sprinting ~42 m; a raised periscope adds a 45 m radar/visual sighting). Rain = sea noise ×0.8. A weak contact
 *    makes a destroyer go active: an expanding ping ring on the water + ping/echo sound, firm out to 55 m
 *  · ASW: a destroyer with a firm contact fires an ASROC-style lightweight torpedo (14–50 m) or a depth-charge pattern
 *    (< 14 m). Hits depend on contact quality; underwater blasts throw up white water. Damaged subs emergency-blow to
 *    the surface; at 0 hp they break up (bubbles + oil slick) and a replacement arrives 60 s later
 *  · torpedo defence: a ship that hears a torpedo calls it on the radio and may stream a decoy that seduces it (~35 %)
 *  · Commander: Map → WAR SYSTEMS · ASW (sonar ping now, send your sub to the camera point = J), tactical-map SSN
 *    symbols (enemy only while held as a sonar contact) and ping rings
 * Never alters price, armies, the frontline or data labels (SIMULATED). ?asw=0 (or ?theaters=0) → v12.0 ambush subs. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('asw') !== '0' && qs.get('theaters') !== '0';
  var E = function () { return LB.engine; }, TH = function () { return LB.theaters; };
  var NAVAL_Z = 135, Z_MIN = 74, Z_MAX = 222, X_MAX = 168, DEEP = -6, PD = -1.15, SURF = -0.35;
  var V = { patrol: 2.0, stalk: 3.2, attack: 1.4, evade: 6.5, reload: 4.5, blow: 1.4, hunt: 3.6 };
  var TORPS = 4, RELOAD_S = 30, RESPAWN_S = 60, TORP_V = 18, TORP_RUN = 14, PING_R = 55, PING_CD = 20, HUNT_S = 60;
  var CALLS = { '-1': 'Sea Wolf', '1': 'Kraken' }, SONAR = { '-1': 'Hammer', '1': 'Anvil' };
  var THREE = null, ready = false, last = 0, subs = [], torps = [], wpns = [], rings = [], slicks = [], el = {}, uiT = 0, sonT = 0;
  var contacts = { '-1': null, '1': null };   // what each side's sonar holds on the ENEMY sub: { q, x, z, t, firm }
  var cmd = { ping: 0, hunt: 0 }, sayT = {};
  var stats = { pings: 0, contacts: 0, torps: 0, torpHits: 0, decoys: 0, asroc: 0, dc: 0, aswHits: 0, kills: 0, blows: 0, cmdPings: 0, cmdHunts: 0, last: '' };
  var low = function () { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bear' ? 1 : -1; } catch (_) { return -1; } }
  function weather() { try { return LB.v12extras.getOptions().weather; } catch (_) { return 'clear'; } }
  function sonarMult() { return weather() === 'rain' ? 0.8 : 1; }               // rain on the surface = sea noise
  function eyeMult() { var w = weather(); return w === 'fog' ? 0.6 : w === 'rain' ? 0.8 : 1; }
  function grid(x, z) { try { return LB.tacmap && LB.tacmap.gridRef ? LB.tacmap.gridRef(x, z) : Math.round(x) + ',' + Math.round(z); } catch (_) { return Math.round(x) + ',' + Math.round(z); } }
  function fx() { return LB.heavyFx; }
  function ships() { try { return TH()._ships() || []; } catch (_) { return []; } }
  function radio(side, cs, text, pri, key, gap) {
    if (key) { var now = performance.now(); if (sayT[key] && now - sayT[key] < (gap || 15000)) return; sayT[key] = now; }
    if (!LB.voice || !LB.voice.say) return;
    var own = side === playerSide();
    try { LB.voice.say({ pri: pri != null ? pri : (own ? 2 : 1), side: side, callsign: cs, text: text, intercepted: !own, tag: 'SIMULATED' }); } catch (_) {}
  }
  function col(hex) { var c = new THREE.Color(hex); if (c.convertSRGBToLinear) c.convertSRGBToLinear(); return c; }
  function camDist(x, z) { try { var p = E().camera.position; return Math.hypot(p.x - x, p.z - z, p.y); } catch (_) { return 100; } }

  // ------------------------------------------------------------------ hull
  var GEO = null, MAT = null;
  function buildModel(side) {
    if (!GEO) {
      GEO = { hull: new THREE.CylinderGeometry(0.62, 0.62, 6.4, 14), bow: new THREE.SphereGeometry(0.62, 14, 10, 0, 6.2832, 0, Math.PI / 2),
        stern: new THREE.ConeGeometry(0.62, 2.6, 14), box: new THREE.BoxGeometry(1, 1, 1), shroud: new THREE.CylinderGeometry(0.3, 0.26, 0.42, 12, 1, true),
        mast: new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), torp: new THREE.CylinderGeometry(0.11, 0.11, 1.5, 8), ring: new THREE.RingGeometry(0.86, 1, 48),
        slick: new THREE.CircleGeometry(1, 20), decoy: new THREE.SphereGeometry(0.18, 6, 4) };
      GEO.hull.rotateX(Math.PI / 2); GEO.bow.rotateX(Math.PI / 2); GEO.stern.rotateX(-Math.PI / 2); GEO.shroud.rotateX(Math.PI / 2); GEO.torp.rotateX(Math.PI / 2);
      GEO.ring.rotateX(-Math.PI / 2); GEO.slick.rotateX(-Math.PI / 2);
      MAT = { hull: new THREE.MeshStandardMaterial({ color: col(0x1e2326), roughness: 0.42, metalness: 0.15 }),   // anechoic-tile black, slight sheen
        sail: new THREE.MeshStandardMaterial({ color: col(0x262b2f), roughness: 0.5, metalness: 0.12 }),
        bull: new THREE.MeshStandardMaterial({ color: col(0x3fae6a), roughness: 0.6 }), bear: new THREE.MeshStandardMaterial({ color: col(0xc8574b), roughness: 0.6 }),
        torp: new THREE.MeshStandardMaterial({ color: col(0x2a2f33), roughness: 0.4, metalness: 0.5 }), decoy: new THREE.MeshBasicMaterial({ color: 0xd8e2e6 }) };
    }
    var g = new THREE.Group(); g.name = 'asw-sub';
    function m(geo, mat, x, y, z, sx, sy, sz) { var o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (sx != null) o.scale.set(sx, sy, sz); g.add(o); return o; }
    m(GEO.hull, MAT.hull, 0, 0, 0);                              // pressure hull (nose → +Z)
    m(GEO.bow, MAT.hull, 0, 0, 3.2, 1, 1, 1.25);                 // rounded bow
    m(GEO.stern, MAT.hull, 0, 0, -4.5);                          // tapered stern
    m(GEO.box, MAT.sail, 0, 0.95, 1.5, 0.42, 1.0, 1.7);          // sail (fin)
    m(GEO.box, MAT.sail, 0, 1.15, 1.75, 1.7, 0.05, 0.42);        // sail planes
    m(GEO.box, side < 0 ? MAT.bull : MAT.bear, 0, 1.2, 0.9, 0.44, 0.12, 0.3);   // faction stripe on the sail
    m(GEO.box, MAT.sail, 0, 0, -5.0, 0.05, 1.7, 0.6);            // cruciform tail: rudders
    m(GEO.box, MAT.sail, 0, 0, -5.0, 1.7, 0.05, 0.6);            //                  stern planes
    m(GEO.shroud, MAT.sail, 0, 0, -5.75);                        // shrouded propulsor (pump-jet)
    var mast = m(GEO.mast, MAT.sail, 0, 1.45, 1.9); mast.name = 'asw-periscope';
    g.traverse(function (o) { o.castShadow = false; });
    return { g: g, mast: mast };
  }

  // ------------------------------------------------------------------ setup
  function build() {
    var ex = LB.v12extras; if (!ex || !ex._subList) return false;
    var raw = ex._subList(); if (!raw || !raw.length) return false;
    THREE = E().THREE;
    raw.forEach(function (S) {
      S.ctl = true;                                           // extras.js stops its v12.0 ambush loop for this sub
      S.g.children.forEach(function (c) { c.visible = false; });
      var M = buildModel(S.side); S.g.add(M.g);
      var B = { S: S, g: S.g, M: M, side: S.side, cs: CALLS[String(S.side)], x: S.x, z: clamp(S.z, Z_MIN, Z_MAX), y: DEEP, hd: S.side < 0 ? Math.PI / 2 : -Math.PI / 2,
        v: V.patrol, st: 'patrol', t: rnd(12, 25), hp: 100, torps: TORPS, goal: null, tgt: null, decoyCd: 0, hunt: null, pinged: 0 };
      newPatrol(B); subs.push(B);
    });
    for (var i = 0; i < (low() ? 3 : 6); i++) {
      var rm = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      rm.visible = false; rm.name = 'asw-ping'; rm.renderOrder = 3; E().scene.add(rm); rings.push({ m: rm, t: 9, x: 0, z: 0, side: 0 });
    }
    buildUi();
    global.addEventListener('keydown', function (e) {
      if (!enabled || !ready) return;
      if (e.target && (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyJ') commandHunt();
    });
    return true;
  }

  // ------------------------------------------------------------------ sub tactics
  function newPatrol(B) { B.goal = { x: -B.side * rnd(30, 150), z: NAVAL_Z + rnd(-34, 44) }; }
  function enemyShips(side) { return ships().filter(function (s) { return s.side !== side && s.st === 'sail'; }); }
  function nearestTarget(B, x, z, maxD) {
    var best = null, bd = maxD || 1e9; enemyShips(B.side).forEach(function (s) { var d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }); return best;
  }
  function setSt(B, st, t) { B.st = st; B.t = t != null ? t : 0; }
  function tickSub(B, dt) {
    var F = fx();
    B.decoyCd = Math.max(0, B.decoyCd - dt); B.pinged = Math.max(0, B.pinged - dt);
    if (B.st === 'dead') { B.t -= dt; if (B.t <= 0) respawn(B); return; }
    if (B.st === 'sunk') {
      B.t += dt; B.y -= dt * 1.1; B.g.rotation.x = Math.min(0.5, B.t * 0.06);
      if (F && Math.random() < dt * (low() ? 3 : 7)) F.puff({ kind: 'dust', x: B.x + rnd(-2, 2), y: 0.05, z: B.z + rnd(-2, 2), size: 0.4, grow: 1.4, life: 1.4, color: 0xf2f6f8, opacity: 0.6 });
      pose(B); if (B.t > 10) { setSt(B, 'dead', RESPAWN_S); B.g.visible = false; }
      return;
    }
    var want = DEEP, sp = V.patrol, tx = B.goal ? B.goal.x : B.x, tz = B.goal ? B.goal.z : B.z;
    if (B.hunt && performance.now() > B.hunt.until) B.hunt = null;
    if (B.st === 'blow') {                                    // emergency surface after heavy damage
      want = SURF; sp = V.blow; B.t -= dt; tx = B.x + Math.sin(B.hd) * 10; tz = B.z + Math.cos(B.hd) * 10;
      if (F && Math.random() < dt * 4) F.puff({ kind: 'dust', x: B.x + rnd(-2, 2), y: 0.1, z: B.z + rnd(-2, 2), size: 0.7, grow: 1.6, life: 1.2, color: 0xffffff, opacity: 0.6 });
      if (B.t <= 0) { B.hp = Math.max(B.hp, 50); setSt(B, 'evade', 14); radio(B.side, B.cs, B.cs + ', damage control complete. Diving, making turns for flank speed.', null, 'blow' + B.side, 8000); }
    } else if (B.st === 'reload') {
      sp = V.reload; tx = B.side * 160; tz = 205;
      B.t -= dt; if (B.t <= 0 && Math.hypot(tx - B.x, tz - B.z) < 30) { B.torps = TORPS; setSt(B, 'patrol', rnd(6, 14)); newPatrol(B); radio(B.side, B.cs, B.cs + ', tubes reloaded, ' + TORPS + ' fish. Returning to patrol.', 1, 'rl' + B.side, 8000); }
    } else if (B.st === 'evade') {
      sp = V.evade; B.t -= dt;
      if (B.tgt) { var ax = B.x - B.tgt.x, az = B.z - B.tgt.z, al = Math.hypot(ax, az) || 1; tx = B.x + ax / al * 30; tz = B.z + az / al * 30; } else if (B.goal) { tx = B.goal.x; tz = B.goal.z; }
      if (B.t <= 0) { B.tgt = null; if (B.torps <= 0) { setSt(B, 'reload', RELOAD_S); radio(B.side, B.cs, B.cs + ', tubes empty. Clearing datum to reload.', 1, 'empty' + B.side, 10000); } else { setSt(B, 'patrol', rnd(10, 22)); newPatrol(B); } }
    } else if (B.st === 'attack') {
      want = PD; sp = V.attack; B.t -= dt;
      if (!B.tgt || B.tgt.st !== 'sail') { B.tgt = nearestTarget(B, B.x, B.z, 70); if (!B.tgt) { setSt(B, 'patrol', 6); newPatrol(B); } }
      if (B.tgt) { tx = B.tgt.x; tz = B.tgt.z; }
      if (F && B.y > -1.6 && Math.random() < dt * (low() ? 2 : 5)) F.puff({ kind: 'dust', x: B.x + Math.sin(B.hd) * 1.9, y: 0.05, z: B.z + Math.cos(B.hd) * 1.9, size: 0.35, grow: 1.3, life: 0.9, color: 0xffffff, opacity: 0.55 });   // periscope feather
      if (B.t <= 0 && B.tgt) { if (B.y > -1.6 || B.t < -4) { fireTorp(B, B.tgt); setSt(B, 'evade', rnd(14, 20)); } }
    } else {                                                  // patrol / stalk
      if (B.hunt) { tx = B.hunt.x; tz = B.hunt.z; sp = V.hunt; }
      var near = B.torps > 0 ? nearestTarget(B, B.hunt ? B.hunt.x : B.x, B.hunt ? B.hunt.z : B.z, B.hunt ? 70 : 90) : null;
      B.t -= dt;
      if (near && B.t <= 0) {
        B.st = 'stalk'; B.tgt = near; sp = V.stalk;
        var bx = near.z > B.z ? -1 : 1; tx = near.x + (near.dir || 1) * 14; tz = near.z + bx * 30;   // set up ahead and abeam of the target
        if (Math.hypot(near.x - B.x, near.z - B.z) < 42) { setSt(B, 'attack', rnd(4, 6)); radio(B.side, B.cs, B.cs + ', up periscope. Target bearing steady, solution set.', null, 'pd' + B.side, 12000); }
      } else if (!B.hunt) {
        B.st = 'patrol';
        if (!B.goal || Math.hypot(tx - B.x, tz - B.z) < 8) { newPatrol(B); tx = B.goal.x; tz = B.goal.z; }
      }
    }
    // pinged hard or under attack → evade (and a noisemaker if one is ready)
    if (B.pinged > 0 && (B.st === 'patrol' || B.st === 'stalk')) { setSt(B, 'evade', rnd(10, 16)); B.tgt = B.tgt || nearestTarget(B, B.x, B.z, 80); noisemaker(B); }
    steer(B, Math.atan2(tx - B.x, tz - B.z), sp, dt);
    B.y += clamp(want - B.y, -1.2 * dt, 1.2 * dt);
    pose(B);
  }
  function steer(B, hdDes, v, dt) {
    var dh = wrap(hdDes - B.hd), turn = clamp(dh, -0.38 * dt, 0.38 * dt);
    B.hd = wrap(B.hd + turn); B.v += (v - B.v) * Math.min(1, dt * 0.35);   // a heavy hull: slow to accelerate
    var nx = B.x + Math.sin(B.hd) * B.v * dt, nz = B.z + Math.cos(B.hd) * B.v * dt;
    if (nz < Z_MIN) { nz = Z_MIN; B.hd = wrap(B.hd + 0.6 * dt); } if (nz > Z_MAX) nz = Z_MAX;
    B.x = clamp(nx, -X_MAX, X_MAX); B.z = nz; B.roll = clamp(-turn / Math.max(1e-4, dt) * 0.25, -0.12, 0.12);
  }
  function pose(B) {
    B.g.position.set(B.x, B.y, B.z); B.S.x = B.x; B.S.z = B.z;
    B.g.rotation.order = 'YXZ'; B.g.rotation.y = B.hd; B.g.rotation.z = B.roll || 0; if (B.st !== 'sunk') B.g.rotation.x = 0;
    B.M.mast.visible = B.st === 'attack' && B.y > -1.8;
    B.S.st = B.y > -2 ? 'periscope' : 'deep';                 // extras.js / fow read this
  }
  function noisemaker(B) {
    if (B.decoyCd > 0) return false;
    B.decoyCd = 40; stats.decoys++;
    var F = fx(); if (F) for (var i = 0; i < (low() ? 2 : 5); i++) F.puff({ kind: 'dust', x: B.x - Math.sin(B.hd) * 3 + rnd(-1, 1), y: 0.05, z: B.z - Math.cos(B.hd) * 3 + rnd(-1, 1), size: 0.5, grow: 1.6, life: 2.2, color: 0xeef6f8, opacity: 0.5 });   // noisemaker fizz
    var c = contacts[String(-B.side)]; if (c) { c.q *= 0.45; c.x += rnd(-12, 12); c.z += rnd(-12, 12); }
    radio(B.side, B.cs, B.cs + ', launching noisemaker. Going deep.', null, 'nm' + B.side, 10000);
    return true;
  }
  function respawn(B) {
    B.hp = 100; B.torps = TORPS; B.x = B.side * 160; B.z = 205; B.y = DEEP; B.hd = -B.side * Math.PI / 2; B.v = V.patrol; B.tgt = null; B.hunt = null;
    B.g.visible = true; B.g.rotation.set(0, 0, 0); setSt(B, 'patrol', rnd(15, 25)); newPatrol(B);
    radio(B.side, B.cs, 'New boat on station. ' + B.cs + ' has the patrol box.', 1);
  }
  function damage(B, dmg, why) {
    if (B.st === 'sunk' || B.st === 'dead') return;
    B.hp -= dmg; stats.aswHits++;
    if (B.hp <= 0) {
      B.hp = 0; setSt(B, 'sunk', 0); stats.kills++; stats.lastKill = why;
      var c = contacts[String(-B.side)]; if (c) c.q = 0;
      radio(-B.side, SONAR[String(-B.side)] + ' sonar', 'Conn, sonar: breaking-up noises on the contact. Submarine destroyed.', 2);
      radio(B.side, B.cs, B.cs + ' is going down. Flooding in all compartments.', 1);
      oilSlick(B.x, B.z);
    } else if (B.hp <= 35 && B.st !== 'blow') {
      setSt(B, 'blow', 25); stats.blows++;
      radio(B.side, B.cs, B.cs + ', emergency blow! Surfacing.', null, 'eb' + B.side, 6000);
    } else if (B.st !== 'blow') { setSt(B, 'evade', rnd(12, 18)); noisemaker(B); }
  }
  function oilSlick(x, z) {
    var m = new THREE.Mesh(GEO.slick, new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.55, depthWrite: false }));
    m.position.set(x, 0.12, z); m.scale.setScalar(2); m.renderOrder = 2; m.name = 'asw-slick'; E().scene.add(m); slicks.push({ m: m, t: 0 });
    if (slicks.length > 3) { var o = slicks.shift(); E().scene.remove(o.m); o.m.material.dispose(); }
  }

  // ------------------------------------------------------------------ heavyweight torpedoes (sub → ship)
  function fireTorp(B, tgt) {
    if (B.torps <= 0 || !tgt) return false;
    B.torps--; stats.torps++;
    var m = new THREE.Mesh(GEO.torp, MAT.torp); m.name = 'asw-torpedo'; m.position.set(B.x, -0.6, B.z); E().scene.add(m);
    torps.push({ m: m, x: B.x + Math.sin(B.hd) * 3.5, z: B.z + Math.cos(B.hd) * 3.5, hd: B.hd, t: 0, tgt: tgt, side: B.side, cs: B.cs, wakeT: 0, heard: false, decoy: null });
    radio(B.side, B.cs, B.cs + ', fire one. Unit is running, wire is good.', null, 'f1' + B.side, 6000);
    var c = contacts[String(-B.side)]; hear(-B.side, B.x, B.z, 0.45);   // the launch transient gives the boat away
    return true;
  }
  function tickTorps(dt) {
    var F = fx(), lo = low();
    for (var i = torps.length - 1; i >= 0; i--) {
      var T = torps[i]; T.t += dt;
      var aim = T.decoy || (T.tgt.st === 'sail' ? T.tgt : null);
      if (!aim || T.t > TORP_RUN) { kill(i, false, T.decoy ? 'decoy' : 'run'); continue; }
      var dx = aim.x - T.x, dz = aim.z - T.z, d = Math.hypot(dx, dz);
      var hdDes = Math.atan2(dx, dz), turn = clamp(wrap(hdDes - T.hd), -1.1 * dt, 1.1 * dt); T.hd = wrap(T.hd + turn);
      T.x += Math.sin(T.hd) * TORP_V * dt; T.z += Math.cos(T.hd) * TORP_V * dt;
      T.m.position.set(T.x, -0.6, T.z); T.m.rotation.y = T.hd;
      T.wakeT -= dt; if (F && T.wakeT <= 0) { T.wakeT = lo ? 0.16 : 0.08; F.puff({ kind: 'dust', x: T.x, y: 0.05, z: T.z, size: 0.55, grow: 1.6, life: 1.8, color: 0xffffff, opacity: 0.6 }); }
      if (!T.heard && d < 60) {                               // target sonar hears the torpedo
        T.heard = true; radio(T.tgt.side, SONAR[String(T.tgt.side)] + ' sonar', 'Torpedo in the water! Bearing ' + bearing(T.tgt, T) + ', closing.', T.tgt.side === playerSide() ? 3 : 1, 'tiw' + T.tgt.side, 5000);
        hear(T.tgt.side, T.x - Math.sin(T.hd) * TORP_V * T.t * 0.8, T.z - Math.cos(T.hd) * TORP_V * T.t * 0.8, 0.25);   // back-plot toward the launch point
      }
      if (!T.decoy && T.heard && d < 26 && !T.decoyTried) {
        T.decoyTried = true;
        if (Math.random() < 0.35) { T.decoy = { x: T.tgt.x - Math.sin(T.hd) * 8 + rnd(-4, 4), z: T.tgt.z - Math.cos(T.hd) * 8 + rnd(-4, 4), st: 'sail' }; stats.decoysShip = (stats.decoysShip || 0) + 1; decoyFx(T.decoy); radio(T.tgt.side, SONAR[String(T.tgt.side)], 'Decoy streamed. Torpedo is turning toward it.', null, 'dc' + T.tgt.side, 5000); }
      }
      if (d < 2.2) { kill(i, !T.decoy, T.decoy ? 'decoy' : 'hit'); continue; }
    }
  }
  function decoyFx(dc) { var m = new THREE.Mesh(GEO.decoy, MAT.decoy); m.position.set(dc.x, 0.1, dc.z); E().scene.add(m); dc.m = m; setTimeout(function () { E().scene.remove(m); }, 9000); }
  function kill(i, hit, why) {
    var T = torps[i], F = fx(); E().scene.remove(T.m); torps.splice(i, 1);
    if (hit) {
      stats.torpHits++;
      try { TH().onStrike(T.tgt.x, T.tgt.z, 1.6); TH().splash(T.tgt.x, T.tgt.z, 2.4); } catch (_) {}
      if (F) { F.puff({ kind: 'dust', x: T.tgt.x, y: 1, z: T.tgt.z, vy: 5, size: 4, grow: 5, life: 2.4, color: 0xf2f8fa, opacity: 0.85 }); F.puff({ kind: 'fire', x: T.tgt.x, y: 1.5, z: T.tgt.z, size: 2.4, grow: 1.6, life: 0.9, color: 0xffa040, opacity: 0.9 }); }
      if (LB.sfx && LB.sfx.explosion) try { LB.sfx.explosion(1.2, null, { x: T.tgt.x, y: 0.5, z: T.tgt.z }); } catch (_) {}
      radio(T.side, T.cs, T.cs + ', hit! Explosion on the bearing of the target.', null, 'th' + T.side, 6000);
    } else if (why === 'decoy') { try { TH().splash(T.x, T.z, 1.2); } catch (_) {} stats.seduced = (stats.seduced || 0) + 1; }
    else stats.torpMiss = (stats.torpMiss || 0) + 1;
  }
  function bearing(from, to) { var b = Math.round((Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI + 360) % 360); return ('00' + b).slice(-3); }

  // ------------------------------------------------------------------ sonar
  function hear(side, x, z, dq, cap) {   // side = the listening side; adds to its contact on the enemy sub (cap: passive-only ceiling)
    var k = String(side), c = contacts[k], now = performance.now();
    if (!c || c.q <= 0.02) { c = contacts[k] = { q: 0, x: x, z: z, t: now, firm: false, said: 0 }; stats.contacts++; }
    var err = (1 - Math.min(1, c.q + dq)) * 9;
    c.x += (x + rnd(-err, err) - c.x) * 0.6; c.z += (z + rnd(-err, err) - c.z) * 0.6; c.q = Math.max(c.q, Math.min(cap == null ? 1 : cap, c.q + dq)); c.t = now;
    if (!c.firm && c.q > 0.6) { c.firm = true; radio(side, SONAR[k] + ' sonar', 'Conn, sonar: contact classified submarine, grid ' + grid(c.x, c.z) + '. Firm.', null, 'firm' + k, 15000); }
    else if (c.q < 0.6 && now - c.said > 25000) { c.said = now; radio(side, SONAR[k] + ' sonar', 'Conn, sonar: new contact, submerged, possible submarine, grid ' + grid(c.x, c.z) + '.', null, 'new' + k, 20000); }
  }
  function sonarTick(dt) {   // 1 Hz
    var sm = sonarMult(), em = eyeMult(), all = ships();
    subs.forEach(function (B) {
      if (B.st === 'dead' || B.st === 'sunk') return;
      var lis = -B.side, k = String(lis), noise = clamp(B.v / V.evade, 0.25, 1), heard = 0;
      // passive sonar alone only gives a bearing-and-rough-range track (q ≤ 0.55, below "firm") on a quiet boat; it takes
      // an active ping (or a noisy, sprinting / surfaced / periscope-depth boat) to firm it up into a fire-control solution
      var cap = (noise > 0.7 || B.y > -2 || B.st === 'blow') ? 1 : 0.55;
      all.forEach(function (s) {
        if (s.side !== lis || s.st !== 'sail') return;
        var d = Math.hypot(s.x - B.x, s.z - B.z), k2 = s.kind === 'destroyer' ? 1 : 0.55;
        var R = (14 + 28 * noise) * sm * k2; if (B.y > -2) R = Math.max(R, 45 * em);   // a raised mast is seen on radar / by lookouts
        if (B.st === 'blow') R = 80;
        if (d < R) heard = Math.max(heard, 0.05 + 0.15 * (1 - d / R));   // a contact builds over several seconds of listening
        // active sonar: a destroyer holding a weak contact goes active
        if (s.kind === 'destroyer' && (s._pingCd = (s._pingCd || rnd(2, 8)) - 1) <= 0) {
          var c = contacts[k]; if (c && c.q > 0.12 && c.q < 0.6 && Math.hypot(s.x - c.x, s.z - c.z) < PING_R + 10) { ping(s); s._pingCd = rnd(12, 20); }
        }
      });
      if (heard > 0) hear(lis, B.x, B.z, heard, cap);
    });
    ['-1', '1'].forEach(function (k) { var c = contacts[k]; if (!c) return; if (performance.now() - c.t > 1500) c.q = Math.max(0, c.q - 0.07); if (c.q < 0.45) c.firm = false; if (c.q <= 0.02) contacts[k] = null; });
    aswTick();
  }
  function ping(s) {
    stats.pings++;
    var R = null; for (var i = 0; i < rings.length; i++) if (rings[i].t >= 1.8) { R = rings[i]; break; }
    if (R) { R.t = 0; R.x = s.x; R.z = s.z; R.side = s.side; R.m.position.set(s.x, 0.42, s.z); R.m.visible = true; R.m.material.color.setHex(s.side < 0 ? 0x9ff0c8 : 0xffc2b8); }
    if (LB.sfx && LB.sfx.sonar) try { LB.sfx.sonar(camDist(s.x, s.z)); } catch (_) {}
    subs.forEach(function (B) {
      if (B.side === s.side || B.st === 'dead' || B.st === 'sunk') return;
      var d = Math.hypot(B.x - s.x, B.z - s.z);
      var PR = PING_R * sonarMult(); if (d < PR) { hear(s.side, B.x, B.z, 0.35 + 0.45 * (1 - d / PR)); B.pinged = 4; radio(B.side, B.cs, B.cs + ', we\'ve been pinged. Active sonar, close aboard.', null, 'pg' + B.side, 15000); }
    });
  }
  function aswTick() {   // destroyers with a firm contact attack it
    var all = ships();
    ['-1', '1'].forEach(function (k) {
      var side = +k, c = contacts[k]; if (!c || c.q < 0.6) return;
      all.forEach(function (s) {
        if (s.side !== side || s.st !== 'sail' || s.kind !== 'destroyer') return;
        s._aswCd = (s._aswCd || rnd(1, 4)) - 1; if (s._aswCd > 0) return;
        var d = Math.hypot(s.x - c.x, s.z - c.z); if (d > 50) return;
        s._aswCd = rnd(9, 15);
        if (d > 14) asroc(s, c); else depthCharges(s, c);
      });
    });
  }
  function enemySubOf(side) { for (var i = 0; i < subs.length; i++) if (subs[i].side !== side) return subs[i]; return null; }
  function asroc(s, c) {   // rocket-thrown lightweight torpedo: ballistic arc to the contact, splash, short homing run
    stats.asroc++;
    var m = new THREE.Mesh(GEO.torp, MAT.torp); m.name = 'asw-asroc'; m.scale.setScalar(0.7); E().scene.add(m);
    var err = (1 - c.q) * 7;
    wpns.push({ k: 'asroc', m: m, x0: s.x, z0: s.z, x1: c.x + rnd(-err, err), z1: c.z + rnd(-err, err), t: 0, dur: 2.6, side: s.side, ph: 'air' });
    radio(s.side, SONAR[String(s.side)] + ' ASW', 'Weapon away, ASROC on the contact, grid ' + grid(c.x, c.z) + '.', null, 'asr' + s.side, 9000);
  }
  function depthCharges(s, c) {
    stats.dc++;
    var hd = Math.atan2(c.x - s.x, c.z - s.z);
    for (var i = 0; i < 4; i++) { var ox = (i % 2 ? 1 : -1) * rnd(2, 4), oz = (i - 1.5) * 3; wpns.push({ k: 'dc', x: c.x + Math.cos(hd) * ox + Math.sin(hd) * oz, z: c.z - Math.sin(hd) * ox + Math.cos(hd) * oz, t: -i * 0.35, dur: 2.4, side: s.side }); }
    radio(s.side, SONAR[String(s.side)] + ' ASW', 'Depth charges, pattern away.', null, 'dcp' + s.side, 9000);
  }
  function tickWpns(dt) {
    var F = fx();
    for (var i = wpns.length - 1; i >= 0; i--) {
      var W = wpns[i]; W.t += dt; if (W.t < 0) continue;
      if (W.k === 'asroc') {
        if (W.ph === 'air') {
          var k = Math.min(1, W.t / W.dur), x = W.x0 + (W.x1 - W.x0) * k, z = W.z0 + (W.z1 - W.z0) * k, y = 2 + Math.sin(Math.PI * k) * 16;
          W.m.position.set(x, y, z); W.m.lookAt(W.x1, 0, W.z1);
          if (F && !low() && Math.random() < 0.7) F.puff({ kind: 'smoke', x: x, y: y, z: z, size: 0.4, grow: 1.5, life: 1.2, color: 0xdedbd4, opacity: 0.45 });
          if (k >= 1) { W.ph = 'run'; W.t = 0; W.x = W.x1; W.z = W.z1; W.hd = Math.random() * 6.28; try { TH().splash(W.x, W.z, 0.6); } catch (_) {} }
        } else {   // lightweight torpedo search: acquire within 16 m, then home for up to 8 s
          var B = enemySubOf(W.side), alive = B && B.st !== 'dead' && B.st !== 'sunk', d = alive ? Math.hypot(B.x - W.x, B.z - W.z) : 1e9;
          if (alive && d < 16 && !W.acq) {   // the target hears the seeker go active: noisemaker, and the seeker may chase it
            W.acq = true;
            if (noisemaker(B) && Math.random() < 0.5) { W.decoy = { x: B.x - Math.sin(B.hd) * 6 + rnd(-3, 3), z: B.z - Math.cos(B.hd) * 6 + rnd(-3, 3) }; stats.aswSeduced = (stats.aswSeduced || 0) + 1; }
            if (B.st === 'patrol' || B.st === 'stalk') { setSt(B, 'evade', rnd(10, 16)); B.tgt = nearestTarget(B, B.x, B.z, 80); }
          }
          if (W.decoy) { var dx = W.decoy.x - W.x, dz = W.decoy.z - W.z; W.hd = wrap(W.hd + clamp(wrap(Math.atan2(dx, dz) - W.hd), -2 * dt, 2 * dt)); if (Math.hypot(dx, dz) < 2) { uwBlast(W.x, W.z, 0.6); stats.aswMiss = (stats.aswMiss || 0) + 1; dropW(i); continue; } }
          else if (alive && d < 16) W.hd = wrap(W.hd + clamp(wrap(Math.atan2(B.x - W.x, B.z - W.z) - W.hd), -2 * dt, 2 * dt)); else W.hd += dt * 0.9;   // circle search
          W.x += Math.sin(W.hd) * 14 * dt; W.z += Math.cos(W.hd) * 14 * dt; W.m.position.set(W.x, -1, W.z); W.m.rotation.set(0, W.hd, 0);
          if (alive && !W.decoy && d < 2.2) { uwBlast(W.x, W.z, 1); damage(B, rnd(30, 45), 'asroc'); dropW(i); continue; }
          if (W.t > 8) { stats.aswMiss = (stats.aswMiss || 0) + 1; dropW(i); continue; }
        }
      } else if (W.k === 'dc' && W.t >= W.dur) {
        uwBlast(W.x, W.z, 0.8);
        var S2 = enemySubOf(W.side); if (S2 && S2.st !== 'dead' && S2.st !== 'sunk') { var dd = Math.hypot(S2.x - W.x, S2.z - W.z), dep = S2.y < -4 ? 0.8 : 1; if (dd < 6) damage(S2, 34 * (1 - dd / 6) * dep + 4, 'depth charges'); }
        wpns.splice(i, 1);
      }
    }
  }
  function dropW(i) { var W = wpns[i]; if (W.m) E().scene.remove(W.m); wpns.splice(i, 1); }
  function uwBlast(x, z, p) {
    var F = fx(); try { TH().splash(x, z, 1.6 * p); } catch (_) {}
    if (F) { F.puff({ kind: 'dust', x: x, y: 0.4, z: z, vy: 7 * p, size: 2.6 * p, grow: 2.4, life: 2.2, color: 0xf4f9fb, opacity: 0.85 }); if (!low()) F.puff({ kind: 'dust', x: x, y: 0.1, z: z, size: 4 * p, grow: 2.2, life: 3, color: 0xcfe6ea, opacity: 0.5 }); }
    if (LB.sfx && LB.sfx.explosion) try { LB.sfx.explosion(0.5 * p, null, { x: x, y: 0, z: z }); } catch (_) {}
  }
  function tickRings(dt) {
    for (var i = 0; i < rings.length; i++) {
      var R = rings[i]; if (R.t >= 1.8) continue; R.t += dt;
      var k = Math.min(1, R.t / 1.6); R.m.scale.setScalar(2 + k * (PING_R - 2)); R.m.material.opacity = 0.55 * (1 - k);
      if (R.t >= 1.8) R.m.visible = false;
    }
    for (var j = 0; j < slicks.length; j++) { var S = slicks[j]; S.t += dt; S.m.scale.setScalar(2 + Math.min(10, S.t * 0.35)); S.m.material.opacity = Math.max(0, 0.55 - S.t / 120); }
  }
  function visTick() {   // fog-of-war: enemy subs only show when surfaced/at periscope depth near friendly eyes or held firm
    var spec = true; try { spec = LB.v12extras.getOptions().spectator; } catch (_) {}
    var own = playerSide();
    subs.forEach(function (B) {
      if (B.st === 'dead') { B.g.visible = false; return; }
      if (spec || B.side === own) { B.g.visible = true; return; }
      var c = contacts[String(own)]; B.g.visible = B.y > -2 || !!(c && c.firm);
    });
  }

  // ------------------------------------------------------------------ Commander
  function ownSub() { var s = playerSide(); for (var i = 0; i < subs.length; i++) if (subs[i].side === s) return subs[i]; return null; }
  function commandPing() {
    if (!ready) return note('ASW not ready', false);
    if (cmd.ping > 0) return note('Sonar ping ready in ' + Math.ceil(cmd.ping) + ' s', false);
    var side = playerSide(), dd = ships().filter(function (s) { return s.side === side && s.st === 'sail' && s.kind === 'destroyer'; });
    if (!dd.length) return note('No destroyer afloat to go active', false);
    cmd.ping = PING_CD; stats.cmdPings++;
    var c0 = contacts[String(side)] ? contacts[String(side)].q : 0;
    dd.forEach(ping);
    var c1 = contacts[String(side)] ? contacts[String(side)].q : 0;
    return note(c1 > c0 + 0.3 ? 'Active sonar: contact firm at ' + grid(contacts[String(side)].x, contacts[String(side)].z) : 'Active sonar: no submarine inside ' + PING_R + ' m', true);
  }
  function commandHunt(x, z) {
    if (!ready) return note('ASW not ready', false);
    if (cmd.hunt > 0) return note('Sub orders ready in ' + Math.ceil(cmd.hunt) + ' s', false);
    var B = ownSub(); if (!B || B.st === 'dead' || B.st === 'sunk') return note('Your submarine is lost — a new boat is on the way', false);
    if (x == null) { var T = E().getCameraTarget(); x = T.x; z = T.z; }
    x = clamp(x, -X_MAX, X_MAX); z = clamp(z, Z_MIN + 4, Z_MAX - 4);
    if (!(TH().isWater && TH().isWater(x, z))) z = Math.max(z, NAVAL_Z - 30);
    B.hunt = { x: x, z: z, until: performance.now() + HUNT_S * 1000 }; if (B.st === 'patrol' || B.st === 'stalk') { B.st = 'patrol'; B.t = 0; }
    cmd.hunt = 10; stats.cmdHunts++;
    radio(B.side, B.cs, B.cs + ', aye. Proceeding to grid ' + grid(x, z) + ' to hunt.', 2);
    if (LB.tacmap && LB.tacmap.ping) try { LB.tacmap.ping(x, z); } catch (_) {}
    return note(B.cs + ' hunting at ' + grid(x, z), true);
  }
  function note(txt, ok) { stats.last = txt; if (el.note) el.note.textContent = txt; renderUi(); return { ok: ok, text: txt }; }

  // ------------------------------------------------------------------ UI (Map → WAR SYSTEMS · ASW)
  function buildUi() {
    var p = doc.createElement('div'); p.id = 'aswPanel'; p.className = 'supply-panel asw-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · SUBMARINES &amp; ASW <span class="qual sim">SIMULATED</span></div>' +
      '<div class="inv-status" id="aswStatus"></div>' +
      '<div class="econ-actions">' +
      '<button type="button" id="aswPing">Sonar ping<small>your destroyers go active</small></button>' +
      '<button type="button" id="aswHunt">Sub: hunt here<small>camera point · J</small></button>' +
      '</div>' +
      '<div class="sup-row"><span id="aswNote" class="sup-status"></span></div>' +
      '<div class="th-note">Subs hunt deep and quiet, come to periscope depth to fire, then sprint away. Destroyers listen on sonar, go active on a weak contact and attack firm ones with ASROC or depth charges. Game layer only — never moves the front. ?asw=0 turns it off.</div>';
    el.p = p; el.status = p.querySelector('#aswStatus'); el.note = p.querySelector('#aswNote');
    p.querySelector('#aswPing').addEventListener('click', function () { commandPing(); });
    p.querySelector('#aswHunt').addEventListener('click', function () { commandHunt(); });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('wxPanel') || doc.getElementById('uavPanel') || doc.getElementById('invasionPanel') || doc.getElementById('supplyPanel');
    var p = el.p; if (!p) return;
    if (anchor && anchor.parentNode) {
      if (p.parentNode !== anchor.parentNode || p.previousSibling !== anchor) anchor.parentNode.insertBefore(p, anchor.nextSibling);
      p.classList.toggle('floating', anchor.classList.contains('floating')); p.hidden = anchor.hidden;
    } else if (!p.parentNode) { var host = doc.querySelector('#sheet-map .sheet-body'); (host || doc.body).appendChild(p); }
  }
  var ST = { patrol: 'PATROL (DEEP)', stalk: 'STALKING', attack: 'PERISCOPE DEPTH', evade: 'EVADING', reload: 'RELOADING', blow: 'SURFACED — DAMAGED', sunk: 'LOST', dead: 'REPLACING' };
  function renderUi() {
    if (!el.status) return;
    var side = playerSide(), B = ownSub(), c = contacts[String(side)], e = contacts[String(-side)];
    var h = B ? '<div><b>' + B.cs + '</b> · ' + ST[B.st] + (B.st === 'dead' ? ' · ' + Math.ceil(B.t) + ' s' : ' · hull ' + Math.ceil(B.hp) + '% · ' + B.torps + ' torpedoes') + (B.hunt ? ' · YOUR ORDERS' : '') + '</div>' : '';
    h += '<div>Sonar: ' + (c ? (c.firm ? 'FIRM' : 'WEAK') + ' contact, grid ' + grid(c.x, c.z) + ' (' + Math.round(c.q * 100) + '%)' : 'no contact') + (e && e.q > 0.4 ? ' · enemy is tracking your boat' : '') + '</div>';
    h += '<div>Torpedoes ' + stats.torps + ' (hits ' + stats.torpHits + ') · pings ' + stats.pings + ' · ASW attacks ' + (stats.asroc + stats.dc) + ' · subs sunk ' + stats.kills + '</div>';
    el.status.innerHTML = h;
  }

  // ------------------------------------------------------------------ tick
  function update() {
    if (!enabled) return;
    var th = TH(); if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { if (!build()) return; ready = true; } catch (err) { enabled = false; console.warn('[asw] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused && e.isPaused()) return;
    if (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive()) return;
    step(dt);
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; placeUi(); renderUi(); }
  }
  function step(dt) {
    cmd.ping = Math.max(0, cmd.ping - dt); cmd.hunt = Math.max(0, cmd.hunt - dt);
    for (var i = 0; i < subs.length; i++) tickSub(subs[i], dt);
    tickTorps(dt); tickWpns(dt); tickRings(dt);
    sonT -= dt; if (sonT <= 0) { sonT = 1; sonarTick(1); visTick(); }
  }

  LB.asw = {
    version: 'v12.0.20', isEnabled: function () { return enabled && ready; }, update: update,
    ping: commandPing, hunt: commandHunt,
    list: function () { return subs.map(function (B) { return { side: B.side, cs: B.cs, st: B.st, x: B.x, y: +B.y.toFixed(2), z: B.z, hd: B.hd, hp: Math.round(B.hp), torps: B.torps, visible: B.g.visible, hunt: !!B.hunt }; }); },
    contact: function (side) { var c = contacts[String(side == null ? playerSide() : side)]; return c ? { q: +c.q.toFixed(2), x: c.x, z: c.z, firm: c.firm } : null; },
    pings: function () { return rings.filter(function (R) { return R.t < 1.8; }).map(function (R) { return { x: R.x, z: R.z, r: 2 + Math.min(1, R.t / 1.6) * (PING_R - 2), side: R.side, k: R.t / 1.8 }; }); },
    torpedoes: function () { return torps.map(function (T) { return { x: T.x, z: T.z, side: T.side, decoy: !!T.decoy }; }); },
    getStats: function () { return Object.assign({ live: torps.length, wpns: wpns.length, cmdPingCd: +cmd.ping.toFixed(1) }, stats); },
    // test hooks
    _step: function (sec) { if (!ready) return false; for (var t = 0; t < sec; t += 0.05) step(0.05); renderUi(); return true; },
    _place: function (i, x, z, st, y) { var B = subs[i || 0]; if (!B) return false; B.x = x; B.z = z; if (y != null) B.y = y; if (st) setSt(B, st, st === 'attack' ? 0.2 : 0); if (st === 'patrol') B.t = 99; B.v = st === 'evade' ? V.evade : V.patrol; pose(B); return true; },
    _clearContacts: function () { contacts['-1'] = null; contacts['1'] = null; torps.slice().forEach(function () { kill(0, false, 'test'); }); return true; },
    _subs: function () { return subs; }, _damage: function (i, n) { var B = subs[i || 0]; if (!B) return false; damage(B, n, 'test'); return B.st; },
    _fire: function (i) { var B = subs[i || 0]; if (!B) return false; var t = nearestTarget(B, B.x, B.z); return fireTorp(B, t); },
    _resetCd: function () { cmd.ping = 0; cmd.hunt = 0; ships().forEach(function (s) { s._aswCd = -1; s._pingCd = -1; }); }
  };
})(window);
