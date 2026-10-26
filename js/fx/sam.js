/* LUNC Battlefield v12.0.37 — SAM sites: radar-guided surface-to-air missiles. Theater FX only (SIMULATED).
 *
 * Each side gets a SAM battery north of its airbase (MEDIUM and up add a second one behind the HQ):
 *  - a search radar that rotates, a fire-control (engagement) radar that slews onto its target, and a launcher truck
 *    with 4 canisters that elevates and traverses.
 *  - Cycle: search (~240 m) → track + lock (~2 s, longer in rain / fog / night via the wxCombat 'aa' modifier) → launch →
 *    shoot-look-shoot (6 s between rounds, 4 rounds, then a 25 s reload). A cyber hack on AA takes the radars down.
 *  - Missile: boost to ~120 m/s, proportional navigation (N 3.5) with a turn-rate limit, burn-out and drag, self-destruct
 *    at ~6.5 s. Proximity fuze ~5 m, lethal inside ~2.5 m, fragment damage on the jets' hit points (J.hp, shared with
 *    v12.0.34 flak): a damaged jet trails smoke and breaks off for home, at 0 it goes down.
 *  - The target defends: radar warning ("mud spike"), a beam turn to notch the radar, and chaff. Chaff or a good notch
 *    can break the lock; the missile then flies on unguided.
 * API: sam.update(dt) (called from theaters.update), sam.getState(), sam._sites(), sam._missiles(), sam._last().
 * Never touches market data, armies, the front or data-truth labels. Kill switch: ?sam=0. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('sam') !== '0';
  var BASE_X = 205, BASE_Z = -55;   // js/theaters/theaters.js airbase centres
  var SEARCH = 240, RMAX = 200, RMIN = 25, AMIN = 5, LOCK = 2.0, GAP = 6, ROUNDS = 4, RELOAD = 25;
  var VMAX = 120, NAV = 3.5, TURN = 1.9, LIFE = 6.5, PROX = 5, LETHAL = 2.5, REACH = 9;
  var CAP = { LOW: 4, MEDIUM: 6, HIGH: 8, ULTRA: 10 };
  var THREE = null, root = null, built = false, sites = [], missiles = [], lastBurst = null, mats = {};
  var stats = { sites: 0, locks: 0, launched: 0, guided: 0, prox: 0, selfDestruct: 0, hits: 0, damaged: 0, kills: 0, rtb: 0,
    chaff: 0, notched: 0, lostLock: 0, inFlight: 0, dropped: 0, jammed: 0 };

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function E() { return LB.engine || null; }
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function phone() { var e = E(); return global.innerWidth < 760 || !!(e && e.mobile); }
  function lowFx() { return phone() || tier() === 'LOW'; }
  function F() { return LB.heavyFx || null; }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function WXM(side) { try { return LB.wxCombat && LB.wxCombat.isEnabled() ? LB.wxCombat.mod('aa', side) : 1; } catch (_) { return 1; } }
  function OFF(side) { try { return !!(LB.wxCombat && LB.wxCombat.isEnabled() && LB.wxCombat.offline(side, 'aa')); } catch (_) { return false; } }
  function jets() { try { return LB.theaters && LB.theaters._jets ? LB.theaters._jets() : []; } catch (_) { return []; } }
  function airborne(J) { var s = J.st; return (s === 'cruise' || s === 'fight' || s === 'rtb') && J.y > AMIN && (!J.g || J.g.visible !== false); }
  function mySide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function cs(J) { return (J._ao && J._ao.cs) || ((J.side < 0 ? 'Viper ' : 'Raptor ') + (1 + (J.slot || 0))); }
  function radio(side, callsign, text, pri) {
    if (!LB.voice || !LB.voice.say || side !== mySide()) return;
    try { LB.voice.say({ pri: pri || 1, side: side, callsign: callsign, text: text, intercepted: false, tag: 'SIMULATED' }); } catch (_) {}
  }
  function camDist(x, y, z) { try { var c = E().camera.position; return Math.hypot(c.x - x, c.y - y, c.z - z); } catch (_) { return 100; } }
  function mat(name, o) {
    if (mats[name]) return mats[name];
    var SA = LB.seaAir; if (SA && SA.fixColor) try { o = SA.fixColor(o); } catch (_) {}
    return (mats[name] = new THREE.MeshStandardMaterial(o));
  }
  var geos = {};
  function box(m, x, y, z, sx, sy, sz, p) { var o = new THREE.Mesh(geos.box, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = !lowFx(); p.add(o); return o; }
  function cyl(m, x, y, z, r, h, p) { var o = new THREE.Mesh(geos.cyl, m); o.position.set(x, y, z); o.scale.set(r * 2, h, r * 2); p.add(o); return o; }

  // ---------------------------------------------------------------- build
  function buildSite(side, x, z, name) {
    var y = H(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.name = 'sam-' + name; root.add(g);
    var camo = mat('camo' + side, { color: side < 0 ? 0x4d5a3a : 0x6e6650, roughness: 0.85 });
    var dark = mat('dark', { color: 0x26292b, roughness: 0.7, metalness: 0.3 }), steel = mat('steel', { color: 0x5d6461, roughness: 0.55, metalness: 0.45 });
    var pad = mat('pad', { color: 0x6f6a5d, roughness: 0.95 }), sand = mat('sandbag', { color: 0x8a7c5c, roughness: 1 });
    var panel = mat('panel', { color: 0x4a5452, roughness: 0.55, metalness: 0.35 }), canis = mat('canister' + side, { color: side < 0 ? 0x56633f : 0x777058, roughness: 0.7 });
    box(pad, 0, 0.05, 0, 26, 0.1, 18, g);                                       // gravel revetment pad
    for (var b = 0; b < 3; b++) box(sand, -9 + b * 9, 0.4, -8.4, 7.4, 0.8, 0.8, g);   // sandbag berm, north side
    box(sand, -12.6, 0.45, 0, 0.9, 0.9, 15, g); box(sand, 12.6, 0.45, 0, 0.9, 0.9, 15, g);
    // search radar: trailer + rotating antenna (open lattice read as a thin slab)
    var sr = new THREE.Group(); sr.position.set(-7, 0, 3); g.add(sr);
    box(camo, 0, 0.8, 0, 2.2, 1.0, 4.2, sr); box(dark, 0, 0.35, 1.4, 2.3, 0.5, 0.5, sr); box(dark, 0, 0.35, -1.4, 2.3, 0.5, 0.5, sr);
    cyl(steel, 0, 2.1, 0, 0.18, 1.6, sr);
    var sAnt = new THREE.Group(); sAnt.position.y = 3.0; sr.add(sAnt);
    box(panel, 0, 0.5, 0, 3.8, 0.95, 0.16, sAnt); for (var rb = -1; rb <= 1; rb++) box(steel, rb * 1.2, 0.5, 0.1, 0.08, 0.95, 0.1, sAnt); box(steel, 0, 0, -0.25, 0.3, 0.3, 0.6, sAnt);
    // fire-control radar: truck + flat phased-array face that slews and tilts
    var fc = new THREE.Group(); fc.position.set(0, 0, 4); g.add(fc);
    box(camo, 0, 0.9, 0, 2.3, 1.2, 5, fc); box(camo, 0, 1.4, 2.2, 2.3, 1.0, 1.4, fc);
    for (var w = -1; w <= 1; w++) { box(dark, 1.2, 0.4, w * 1.6, 0.3, 0.8, 0.8, fc); box(dark, -1.2, 0.4, w * 1.6, 0.3, 0.8, 0.8, fc); }
    var fcYaw = new THREE.Group(); fcYaw.position.set(0, 1.6, -1); fc.add(fcYaw);
    var fcTilt = new THREE.Group(); fcTilt.position.y = 0.4; fcYaw.add(fcTilt);
    box(panel, 0, 1.0, 0, 2.6, 2.4, 0.25, fcTilt); box(steel, 0, 1.0, -0.2, 0.6, 0.6, 0.3, fcTilt);
    // launcher: truck + turntable + elevating 4-canister box
    var ln = new THREE.Group(); ln.position.set(7, 0, 0); g.add(ln);
    box(camo, 0, 0.9, 0, 2.4, 1.1, 6.4, ln); box(camo, 0, 1.55, 2.6, 2.4, 1.1, 1.6, ln);
    for (var a = -1; a <= 1; a++) { box(dark, 1.25, 0.45, a * 2.0, 0.3, 0.9, 0.9, ln); box(dark, -1.25, 0.45, a * 2.0, 0.3, 0.9, 0.9, ln); }
    var lnYaw = new THREE.Group(); lnYaw.position.set(0, 1.5, -1.0); ln.add(lnYaw);
    cyl(steel, 0, 0.1, 0, 0.9, 0.25, lnYaw);
    var lnTilt = new THREE.Group(); lnTilt.position.set(0, 0.35, -1.4); lnYaw.add(lnTilt);
    var tubes = [];
    for (var t = 0; t < 4; t++) {
      var tb = box(canis, (t % 2 ? 0.45 : -0.45), 0.42 + (t < 2 ? 0 : 0.84), 1.9, 0.82, 0.8, 4.4, lnTilt);
      var cap = box(mat('capOn', { color: 0xb8b3a2, roughness: 0.8 }), tb.position.x, tb.position.y, 4.12, 0.7, 0.68, 0.04, lnTilt);
      tubes.push(cap);
    }
    // rotate the whole site so the launcher faces the front
    g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    g.updateMatrixWorld(true);
    var S = { g: g, side: side, name: name, x: x, y: y, z: z, sAnt: sAnt, fcYaw: fcYaw, fcTilt: fcTilt, lnYaw: lnYaw, lnTilt: lnTilt, tubes: tubes,
      st: 'search', tgt: null, t: 0, lock: 0, rounds: ROUNDS, gap: rnd(0, 2), reload: 0, yaw: 0, el: 0.3, call: side < 0 ? 'Sentinel' : 'Bastion' };
    sites.push(S); return S;
  }
  function build() {
    var e = E(); if (!e || !e.THREE || !e.scene) return false;
    THREE = e.THREE; geos.box = new THREE.BoxGeometry(1, 1, 1); geos.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    geos.msl = new THREE.CylinderGeometry(0.13, 0.16, 2.2, 6); geos.msl.rotateZ(-Math.PI / 2);
    root = new THREE.Group(); root.name = 'v12-sam'; e.scene.add(root);
    var hq = 44; try { var c = LB.config; hq = ((c && c.layout && c.layout.hqX) || 48) - 4; } catch (_) {}
    [-1, 1].forEach(function (side) {
      buildSite(side, side * (BASE_X - 54), BASE_Z + 3, side < 0 ? 'bull-airbase' : 'bear-airbase');
      if (!lowFx()) buildSite(side, side * (hq + 40), -68, side < 0 ? 'bull-hq' : 'bear-hq');
    });
    stats.sites = sites.length; built = true; return true;
  }

  // ---------------------------------------------------------------- engagement
  function pick(S) {
    var list = jets(), best = null, bd = 1e9;
    for (var i = 0; i < list.length; i++) {
      var J = list[i]; if (J.side === S.side || !airborne(J)) continue;
      var d = Math.hypot(J.x - S.x, J.z - S.z); if (d > SEARCH || d < RMIN) continue;
      if (d < bd) { bd = d; best = J; }
    }
    return best ? { J: best, d: bd } : null;
  }
  function aimAt(S, J, dt, rate) {   // slew the fire-control face and the launcher; returns the launcher's error (rad)
    var inv = S.g.rotation.y, dx = J.x - S.x, dz = J.z - S.z, want = Math.atan2(dx, dz) - inv;
    var d = want - S.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    S.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
    var el = Math.min(1.1, Math.max(0.35, Math.atan2(J.y - S.y, Math.hypot(dx, dz)) + 0.25));
    S.el += (el - S.el) * Math.min(1, dt * 2);
    S.fcYaw.rotation.y = S.yaw; S.fcTilt.rotation.x = -Math.min(0.5, S.el * 0.5);
    S.lnYaw.rotation.y = S.yaw; S.lnTilt.rotation.x = -S.el;
    return Math.abs(d);
  }
  function launch(S, J) {
    if (missiles.length >= (CAP[tier()] || 6)) { stats.dropped++; return false; }
    var idx = ROUNDS - S.rounds; S.rounds--; if (S.tubes[idx]) S.tubes[idx].visible = false;
    // muzzle: the launcher box's world position, a few metres along its axis
    var v = new THREE.Vector3(0, 0.84, 4.4); S.lnTilt.localToWorld(v);
    var dir = new THREE.Vector3(0, 0, 1).applyQuaternion(S.lnTilt.getWorldQuaternion(new THREE.Quaternion())).normalize();
    var m = new THREE.Mesh(geos.msl, mat('missile', { color: 0xe4e2da, roughness: 0.5, metalness: 0.2 }));
    m.position.copy(v); root.add(m);
    var M = { m: m, side: S.side, site: S, tgt: J, x: v.x, y: v.y, z: v.z, dx: dir.x, dy: dir.y, dz: dir.z, v: 18, t: 0, guided: true, lastLos: null, chaffT: rnd(0.8, 1.6) };
    missiles.push(M); stats.launched++;
    var f = F(), lo = lowFx();
    if (f) {
      f.puff({ kind: 'fire', x: v.x, y: v.y, z: v.z, size: 2.6, grow: 0.5, life: 0.25, color: 0xffc070, opacity: 0.95 });
      var bx = S.x - dir.x * 3, bz = S.z - dir.z * 3;   // backblast: a low dust and smoke cloud behind the launcher
      for (var k = 0; k < (lo ? 3 : 7); k++) f.puff({ kind: k % 2 ? 'dust' : 'smoke', x: bx + rnd(-3, 3), y: S.y + 0.8, z: bz + rnd(-3, 3), vx: -dir.x * rnd(2, 5), vy: rnd(0.3, 1.2), vz: -dir.z * rnd(2, 5), size: rnd(2.2, 3.4), grow: 1.6, life: rnd(2.5, 4.5), color: k % 2 ? 0xb7a98a : 0xd9d6cf, opacity: 0.55, drag: 0.96 });
    }
    if (LB.sfx && LB.sfx.explosion) { var cd = camDist(S.x, S.y, S.z); if (cd < 260) try { LB.sfx.explosion(0.55, cd); } catch (_) {} }
    radio(S.side, S.call, 'bird away, ' + cs(J) + ' engaged.', 1);
    radio(J.side, cs(J), 'mud spike, missile launch! Chaff, chaff, defending.', 2);
    J._samDef = 3.0; J._samSide = Math.random() < 0.5 ? -1 : 1;
    return true;
  }
  function tickSite(S, dt) {
    var down = OFF(S.side);
    if (!down) S.sAnt.rotation.y += dt * 2.4; else { stats.jammed += dt; S.st = 'search'; S.tgt = null; S.lock = 0; return; }
    if (S.st === 'reload') { S.reload -= dt; if (S.reload <= 0) { S.rounds = ROUNDS; S.tubes.forEach(function (c) { c.visible = true; }); S.st = 'search'; } return; }
    S.gap -= dt;
    if (S.tgt && (!airborne(S.tgt) || Math.hypot(S.tgt.x - S.x, S.tgt.z - S.z) > SEARCH)) { S.tgt = null; S.st = 'search'; S.lock = 0; }
    if (!S.tgt) { var p = pick(S); if (!p) { S.st = 'search'; return; } S.tgt = p.J; S.st = 'track'; S.lock = 0; }
    var J = S.tgt, err = aimAt(S, J, dt, 0.9), d = Math.hypot(J.x - S.x, J.z - S.z);
    if (S.st === 'track') {
      var m = Math.max(0.3, WXM(S.side)); S.lock += dt * m;
      if (J._samDef > 0 && Math.random() < dt * 0.25) { S.lock = Math.max(0, S.lock - 0.8); }   // a defending jet breaks track sometimes
      if (S.lock >= LOCK) { S.st = 'locked'; stats.locks++; }
    }
    if (S.st === 'locked' && S.gap <= 0 && err < 0.25 && d <= RMAX && d >= RMIN) {
      if (launch(S, J)) { S.gap = GAP; if (S.rounds <= 0) { S.st = 'reload'; S.reload = RELOAD * (lowFx() ? 1.6 : 1); S.tgt = null; } }   // phones fly few jets: slower reloads keep some in the sky
    }
  }

  function burst(M, prox) {
    lastBurst = { x: M.x, y: M.y, z: M.z, prox: prox, t: M.t };
    if (prox) stats.prox++; else stats.selfDestruct++;
    var f = F(), lo = lowFx();
    if (f) {
      f.puff({ kind: 'fire', x: M.x, y: M.y, z: M.z, size: 3.2, grow: 0.6, life: 0.22, color: 0xffb860, opacity: 0.95 });
      f.puff({ kind: 'smoke', x: M.x, y: M.y, z: M.z, vx: rnd(0.2, 0.8), vy: 0.2, size: 2.4, grow: 1.5, life: lo ? 2.6 : 4, color: 0x3a3633, opacity: 0.65, drag: 0.985 });
      if (!lo) for (var k = 0; k < 6; k++) f.puff({ kind: 'tracer', x: M.x, y: M.y, z: M.z, vx: rnd(-14, 14), vy: rnd(-10, 8), vz: rnd(-14, 14), size: 0.35, grow: 0.1, life: 0.5, color: 0xffd090, opacity: 0.9, drag: 0.94 });
    }
    if (LB.sfx && LB.sfx.explosion) { var cd = camDist(M.x, M.y, M.z); if (cd < 260) try { LB.sfx.explosion(0.6, cd); } catch (_) {} }
    if (!prox) return;
    var list = jets();
    for (var i = 0; i < list.length; i++) {
      var J = list[i]; if (J.side === M.side || !airborne(J)) continue;
      var dd = Math.hypot(J.x - M.x, J.y - M.y, J.z - M.z); if (dd > REACH) continue;
      var dmg = dd <= LETHAL ? 1.3 : Math.pow(1 - (dd - LETHAL) / (REACH - LETHAL), 1.4) * 1.0 * (0.6 + Math.random() * 0.6);
      if (dmg < 0.05) continue;
      stats.hits++; J.hp = (J.hp == null ? 1 : J.hp) - dmg;
      if (J.hp <= 0) { if (J.st !== 'down') { J.st = 'down'; stats.kills++; radio(M.side, M.site.call, 'splash one, ' + cs(J) + ' is down.'); } }
      else {
        stats.damaged++; if (!J._flakHit) { J._flakHit = 1; radio(J.side, cs(J), 'took fragments, losing hydraulics, RTB.'); }
        if (J.st === 'cruise' || J.st === 'fight') { J.t = Math.min(J.t || 0, 1.5); stats.rtb++; }
      }
    }
  }
  function tickMissile(M, dt) {
    M.t += dt;
    var J = M.tgt, f = F(), lo = lowFx();
    // motor: boost 0–1.2 s (to VMAX), sustain to 3.5 s, then coast with drag
    if (M.t < 1.2) M.v = Math.min(VMAX, M.v + 90 * dt); else if (M.t > 3.5) M.v = Math.max(45, M.v - 14 * dt);
    if (M.guided && J && airborne(J) && M.t > 0.35) {
      // defending target: chaff and a beam turn (notch). Either can break the radar lock.
      if (J._samDef > 0) {
        M.chaffT -= dt;
        if (M.chaffT <= 0) {
          M.chaffT = rnd(0.9, 1.5); stats.chaff++;
          if (f) for (var c = 0; c < (lo ? 2 : 5); c++) f.puff({ kind: 'flash', x: J.x - Math.cos(J.hd) * 1.5, y: J.y - 0.3, z: J.z + Math.sin(J.hd) * 1.5, vx: rnd(-2, 2), vy: rnd(-2, 0), vz: rnd(-2, 2), size: 0.7, grow: 2.2, life: 1.4, color: 0xdfe6ea, opacity: 0.55, delay: c * 0.06, drag: 0.9 });
          if (Math.random() < 0.24 / Math.max(0.5, WXM(M.side))) { M.guided = false; stats.lostLock++; radio(J.side, cs(J), 'chaff worked, missile defeated.'); }
        }
        // notch: the jet's velocity nearly perpendicular to the line of sight → doppler gate loses it
        var lx = J.x - M.x, lz = J.z - M.z, ll = Math.hypot(lx, lz) || 1, vx = Math.cos(J.hd), vz = -Math.sin(J.hd);
        if (Math.abs((lx * vx + lz * vz) / ll) < 0.2 && Math.random() < dt * 0.6) { M.guided = false; stats.notched++; stats.lostLock++; }
      }
    } else if (M.guided && !(J && airborne(J))) { M.guided = false; }   // target landed, died or vanished
    if (M.guided && J && M.t > 0.35) {
      // proportional navigation: turn the velocity at N × the line-of-sight rate, limited by the airframe
      var rx = J.x - M.x, ry = J.y - M.y, rz = J.z - M.z, rl = Math.hypot(rx, ry, rz) || 1;
      var los = { x: rx / rl, y: ry / rl, z: rz / rl };
      if (M.lastLos) {
        var wx = (los.x - M.lastLos.x) / dt, wy = (los.y - M.lastLos.y) / dt, wz = (los.z - M.lastLos.z) / dt;
        var ax = los.x + NAV * wx * 0.35, ay = los.y + NAV * wy * 0.35, az = los.z + NAV * wz * 0.35, al = Math.hypot(ax, ay, az) || 1;
        ax /= al; ay /= al; az /= al;
        var dot = Math.max(-1, Math.min(1, ax * M.dx + ay * M.dy + az * M.dz)), ang = Math.acos(dot), lim = TURN * dt * (M.v > 60 ? 1 : 0.6);
        var k = ang > lim ? lim / ang : 1;
        M.dx += (ax - M.dx) * k; M.dy += (ay - M.dy) * k; M.dz += (az - M.dz) * k;
        var dl = Math.hypot(M.dx, M.dy, M.dz) || 1; M.dx /= dl; M.dy /= dl; M.dz /= dl;
      }
      M.lastLos = los; stats.guided += dt;
    } else { M.dy -= 0.06 * dt; }   // unguided: gravity slowly pulls the nose down
    M.x += M.dx * M.v * dt; M.y += M.dy * M.v * dt; M.z += M.dz * M.v * dt;
    M.m.position.set(M.x, M.y, M.z); M.m.rotation.set(0, Math.atan2(-M.dz, M.dx), Math.asin(Math.max(-1, Math.min(1, M.dy))));
    if (f && M.t < 3.5) {
      f.puff({ kind: 'fire', x: M.x - M.dx * 1.3, y: M.y - M.dy * 1.3, z: M.z - M.dz * 1.3, size: 0.9, grow: 0.2, life: 0.08, color: 0xffd08a, opacity: 0.95 });
      if (!lo || Math.random() < 0.5) f.puff({ kind: 'smoke', x: M.x - M.dx * 1.8, y: M.y - M.dy * 1.8, z: M.z - M.dz * 1.8, vy: 0.2, size: lo ? 1.0 : 0.8, grow: 1.9, life: lo ? 2.2 : 3.6, color: 0xeeeeea, opacity: 0.5, drag: 0.98 });
    }
    // proximity fuze against any enemy jet; self-destruct at end of life or on the ground
    var list = jets();
    for (var i = 0; i < list.length; i++) { var Q = list[i]; if (Q.side === M.side || !airborne(Q)) continue; if (Math.abs(Q.x - M.x) < PROX && Math.abs(Q.z - M.z) < PROX && Math.hypot(Q.x - M.x, Q.y - M.y, Q.z - M.z) < PROX) { burst(M, true); return true; } }
    if (M.t > LIFE) { burst(M, false); return true; }
    if (M.y < H(M.x, M.z) + 0.3 || M.y < -0.5) { burst(M, false); return true; }
    return false;
  }
  function defendJets(dt) {   // beam turn away from the threat while the warning lasts
    var list = jets();
    for (var i = 0; i < list.length; i++) {
      var J = list[i]; if (!(J._samDef > 0)) continue; J._samDef -= dt;
      if (!airborne(J)) { J._samDef = 0; continue; }
      J.hd += (J._samSide || 1) * 1.1 * dt; J.y = Math.max(8, J.y - 3 * dt);   // a hard turn and a dive toward the weeds
    }
  }

  function update(dt) {
    if (!enabled || !(dt > 0)) return;
    if (!built) { if (!build()) return; }
    for (var i = 0; i < sites.length; i++) tickSite(sites[i], dt);
    for (var k = missiles.length - 1; k >= 0; k--) { if (tickMissile(missiles[k], dt)) { root.remove(missiles[k].m); missiles.splice(k, 1); } }
    defendJets(dt);
    stats.inFlight = missiles.length;
  }

  LB.sam = { version: 'v12.0.37', isEnabled: function () { return enabled; }, update: update,
    getState: function () {
      var o = Object.assign({ enabled: enabled, built: built, cap: CAP[tier()] || 6 }, stats);
      o.guided = Math.round(o.guided * 10) / 10; o.jammed = Math.round(o.jammed * 10) / 10;
      o.siteStates = sites.map(function (S) { return S.name + ':' + S.st + ':' + S.rounds; });
      return o;
    },
    _sites: function () { return sites; }, _missiles: function () { return missiles; }, _last: function () { return lastBurst; } };
})(window);
