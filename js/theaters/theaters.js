/* LUNC Battlefield v12.0 — "Theaters of War" (Phase A). Visual/simulated only. ?theaters=0 = v11.4 behaviour.
 * - Wide world: x ±260, z −120…230. The market-driven Ground Theater stays central and untouched.
 * - Ocean (south, z > 62) with an animated wave shader (flat on LOW), beach and foam strip.
 * - Naval Theater: Bull fleet west, Bear fleet east. Destroyers / battleships, plus carriers on HIGH+ with deck jets.
 *   Broadsides with ballistic shells, splash columns, fire/smoke. Sunk ships list and stay as hulks; replacements sail in.
 *   Firing tempo is weighted by the market-driven army ratio → labelled ESTIMATED · SIMULATED. It never touches price or the front.
 * - Air Theater: an Air Force Base per side (runway, hangars, tower, radar sweep, parked jets, AA guns).
 *   Sorties taxi, take off, fly to the front / enemy base / fleet, dogfight with smoke-trail missiles and flares, then RTB.
 *   Sortie rate is weighted by |momentum| → labelled ESTIMATED · SIMULATED.
 * - Extras: radar sweep, HQ↔front supply convoys, a BREAKING ticker in Intel when a carrier is hit.
 * - Free camera: wide zoom (6–320), 360° orbit, one-finger pan / pinch / two-finger rotate, Q/E rotate, theater jumps, auto-tour.
 * Perf: shared geometry/materials, no shadows, far-theater sim LOD (4 Hz when the camera is > 230 away), tier caps, scratch vectors. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('theaters') !== '0';
  var E = function () { return LB.engine; };
  var BOUNDS = { minX: -260, maxX: 260, minZ: -120, maxZ: 230 };
  var SHORE = 62, NAVAL_Z = 135, BASE_X = 205, BASE_Z = -55;
  var CAPS = { LOW: { ships: 2, carrier: false, jets: 4, aa: 1, waves: false, convoy: 0 },
    MEDIUM: { ships: 3, carrier: false, jets: 8, aa: 2, waves: true, convoy: 2 },
    HIGH: { ships: 5, carrier: true, jets: 16, aa: 3, waves: true, convoy: 3 },
    ULTRA: { ships: 7, carrier: true, jets: 24, aa: 4, waves: true, convoy: 4 } };
  var THREE, scene, root, ready = false, cap, tierN;
  var ships = [], jets = [], shells = [], missiles = [], aaGuns = [], convoys = [], radars = [], hulks = [];
  var ocean = null, oceanU = null, foam = null;
  var stats = { ships: 0, hulks: 0, jets: 0, airborne: 0, shells: 0, missiles: 0, sunk: 0, kills: 0, ms: 0, simHz: 'full' };
  var mats = {}, geos = {};
  var last = 0, farAcc = 0, keys = {}, fly = null, tour = null, ticker = [];
  var _v = null, _v2 = null, _sph = null;

  function tierName() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function phone() { return innerWidth < 760 || (E() && E().mobile); }
  function fx() { return LB.heavyFx || null; }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  // ---------------------------------------------------------------- world
  function mat(name, o) { return mats[name] || (mats[name] = new THREE.MeshStandardMaterial(o)); }
  function mesh(g, m, x, y, z, sx, sy, sz, parent) {
    var o = new THREE.Mesh(geos[g], m); o.position.set(x, y, z); o.scale.set(sx, sy, sz);
    o.castShadow = false; o.receiveShadow = false; (parent || root).add(o); return o;
  }
  function buildOcean() {
    var waves = cap.waves && !phone();
    var seg = waves ? [120, 40] : [1, 1];
    var g = new THREE.PlaneGeometry(BOUNDS.maxX * 2 + 260, 320, seg[0], seg[1]);
    g.rotateX(-Math.PI / 2);
    var m = new THREE.MeshStandardMaterial({ color: 0x1f5468, roughness: 0.28, metalness: 0.15 });
    if (waves) {
      oceanU = { value: 0 };
      m.onBeforeCompile = function (sh) {
        sh.uniforms.uTime = oceanU;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n float w1 = sin(position.x*0.09 + uTime*1.1)*0.35 + sin(position.z*0.13 + uTime*0.8)*0.25;\n' +
          ' transformed.y += w1;\n');
        sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\n objectNormal = normalize(vec3(-cos(position.x*0.09 + uTime*1.1)*0.03, 1.0, -cos(position.z*0.13 + uTime*0.8)*0.03));\n');
      };
    }
    ocean = new THREE.Mesh(g, m); ocean.position.set(0, -0.35, SHORE + 160); ocean.name = 'v12-ocean'; root.add(ocean);
    // beach + foam
    var beach = new THREE.Mesh(new THREE.PlaneGeometry(BOUNDS.maxX * 2 + 260, 14), mat('sand', { color: 0xc9b98f, roughness: 0.95 }));
    beach.rotation.x = -Math.PI / 2; beach.position.set(0, -0.3, SHORE - 5); root.add(beach);
    foam = new THREE.Mesh(new THREE.PlaneGeometry(BOUNDS.maxX * 2 + 260, 2.2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(0, -0.2, SHORE + 1.2); root.add(foam);
  }
  function buildBase(side) {
    var bx = side * BASE_X, g = new THREE.Group(); g.position.set(bx, 0, BASE_Z); root.add(g);
    var tarmac = mat('tarmac', { color: 0x3a3d3f, roughness: 0.9 }), concrete = mat('concrete', { color: 0x8f8c84, roughness: 0.85 });
    var steel = mat('steel', { color: 0x5d6461, roughness: 0.6, metalness: 0.4 }), tint = mat('tint' + side, { color: side < 0 ? 0x3f8f63 : 0xa8423b, roughness: 0.6 });
    mesh('box', tarmac, 0, -0.12, 0, 70, 0.2, 7, g);                       // runway (along x)
    for (var i = -3; i <= 3; i++) mesh('box', concrete, i * 9, -0.01, 0, 3.5, 0.02, 0.35, g);   // centre line
    mesh('box', tarmac, -side * 18, -0.12, -14, 34, 0.2, 18, g);           // apron
    for (var h = 0; h < 3; h++) { mesh('box', steel, -side * (8 + h * 11), 2.2, -24, 9, 4.4, 8, g); mesh('box', tint, -side * (8 + h * 11), 4.5, -24, 9.2, 0.3, 8.2, g); }
    mesh('box', concrete, side * 26, 4, -12, 3, 8, 3, g); mesh('box', mat('glass', { color: 0x9fd3e8, roughness: 0.2, metalness: 0.6 }), side * 26, 8.6, -12, 4, 1.4, 4, g);
    // radar (sweeps)
    var rad = new THREE.Group(); rad.position.set(side * 34, 0, -20); g.add(rad);
    mesh('box', steel, 0, 2.5, 0, 0.6, 5, 0.6, rad);
    var dish = new THREE.Group(); dish.position.y = 5.2; rad.add(dish);
    mesh('box', concrete, 0, 0, 0, 4.4, 1.2, 0.25, dish); radars.push(dish);
    // walls
    mesh('box', concrete, 0, 0.8, -36, 90, 1.6, 0.8, g); mesh('box', concrete, 0, 0.8, 14, 90, 1.6, 0.8, g);
    // AA guns
    for (var a = 0; a < cap.aa; a++) {
      var ag = new THREE.Group(); ag.position.set((a - (cap.aa - 1) / 2) * 22, 0, 9); g.add(ag);
      mesh('cyl', steel, 0, 0.6, 0, 1.2, 1.2, 1.2, ag);
      var barrel = mesh('box', steel, 0, 1.6, 0, 0.25, 0.25, 2.6, ag); barrel.rotation.x = -0.7;
      aaGuns.push({ g: ag, side: side, cd: rnd(0, 1), wx: bx + ag.position.x, wz: BASE_Z + ag.position.z });
    }
    return g;
  }
  function buildShip(kind, side) {
    var g = new THREE.Group(), hullM = mat('hull' + side, { color: side < 0 ? 0x56605d : 0x5f5755, roughness: 0.7, metalness: 0.3 }), dark = mat('dark', { color: 0x2b2e30, roughness: 0.8 });
    var deck = mat('deck', { color: 0x4a4b46, roughness: 0.85 }), tint = mat('tint' + side, { color: side < 0 ? 0x3f8f63 : 0xa8423b, roughness: 0.6 });
    var L = kind === 'carrier' ? 22 : kind === 'battleship' ? 15 : 9;
    if (kind === 'carrier') {
      mesh('box', hullM, 0, 0.9, 0, L, 1.8, 3.4, g); mesh('box', deck, 0, 1.9, 0, L * 1.04, 0.25, 5.2, g);
      mesh('box', hullM, 1, 3.3, -2.0, 3, 2.6, 1, g); mesh('box', tint, 1, 4.8, -2.0, 1.2, 0.5, 0.8, g);
    } else {
      mesh('box', hullM, 0, 0.7, 0, L, 1.4, L * 0.16, g); mesh('cone', hullM, L * 0.56, 0.7, 0, L * 0.16, L * 0.16, 1.4, g).rotation.set(0, 0, -Math.PI / 2);
      mesh('box', hullM, -L * 0.05, 2.0, 0, L * 0.22, 1.4, L * 0.11, g); mesh('box', tint, -L * 0.05, 2.9, 0, L * 0.08, 0.6, L * 0.06, g);
      var nT = kind === 'battleship' ? 3 : 2;
      for (var i = 0; i < nT; i++) { var tx = (i < 2 ? L * 0.28 - i * L * 0.14 : -L * 0.32); mesh('cyl', dark, tx, 1.6, 0, 0.9, 0.5, 0.9, g); mesh('box', dark, tx + 1.0, 1.7, 0, 1.8, 0.14, 0.14, g); }
    }
    g.traverse(function (o) { o.castShadow = false; });
    root.add(g);
    return g;
  }
  function spawnShip(side, idx, kind) {
    var g = buildShip(kind, side);
    var lane = NAVAL_Z + (idx % 3 - 1) * 18 + (kind === 'carrier' ? 32 : 0);
    var s = { g: g, side: side, kind: kind, hp: kind === 'carrier' ? 220 : kind === 'battleship' ? 140 : 80, max: 0, x: side * rnd(40, 120), z: lane,
      dir: -side, speed: kind === 'carrier' ? 1.6 : 2.6, reload: rnd(2, 8), st: 'sail', t: 0, burn: 0, deckT: rnd(4, 10) };
    s.max = s.hp; g.position.set(s.x, 0, s.z); ships.push(s); return s;
  }
  function buildConvoy(side) {
    for (var i = 0; i < cap.convoy; i++) {
      var g = new THREE.Group(), m = mat('truck' + side, { color: side < 0 ? 0x4b5b3c : 0x5e4a3a, roughness: 0.8 });
      mesh('box', m, 0, 0.7, 0, 2.2, 1.2, 1.1, g); mesh('box', mat('dark', {}), 1.3, 0.55, 0, 0.8, 0.9, 1.0, g); root.add(g);
      convoys.push({ g: g, side: side, t: i / cap.convoy, dir: 1 });
    }
    var road = new THREE.Mesh(geos.box, mat('road', { color: 0x5b5446, roughness: 1 })); road.scale.set(170, 0.05, 2.4); road.position.set(side * 125, -0.32, -32); root.add(road);
  }
  function build() {
    var e = E(); THREE = e.THREE; scene = e.scene; tierN = tierName(); cap = CAPS[tierN] || CAPS.MEDIUM;
    if (phone() && tierN !== 'LOW') cap = CAPS.LOW;
    _v = new THREE.Vector3(); _v2 = new THREE.Vector3(); _sph = new THREE.Spherical();
    geos.box = new THREE.BoxGeometry(1, 1, 1); geos.cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); geos.cone = new THREE.ConeGeometry(0.5, 1, 8);
    root = new THREE.Group(); root.name = 'v12-theaters'; scene.add(root);
    buildOcean(); buildBase(-1); buildBase(1); buildConvoy(-1); buildConvoy(1);
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < cap.ships; i++) spawnShip(side, i, cap.carrier && i === 0 ? 'carrier' : i % 2 ? 'battleship' : 'destroyer');
      var nj = Math.max(1, Math.floor(cap.jets / 2));
      for (var j = 0; j < nj; j++) addJet(side, j);
    });
    // camera / fog for the wide world
    var c = e.controls;
    if (c) {
      c.maxDistance = 320; c.minDistance = 6; c.enablePan = true; c.screenSpacePanning = false; c.panSpeed = 1.2;
      c.maxPolarAngle = Math.PI / 2.06; c.minPolarAngle = 0.08;
      if (THREE.TOUCH) c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
      c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    }
    e.camera.far = 1400; e.camera.updateProjectionMatrix();
    fogWide();
    buildUi();
    ready = true;
  }
  function fogWide() { var f = E().scene.fog; if (f && f.isFog) { if (f.far < 420) { f.near = Math.max(f.near, 90); f.far = phone() ? 420 : 560; } } }

  // ---------------------------------------------------------------- jets
  function addJet(side, j) {
    var g = fx() ? fx().buildPlane('jet', side < 0 ? 0x3f8f63 : 0xa8423b) : new THREE.Group();
    g.scale.setScalar(1.25); root.add(g);
    var J = { g: g, side: side, st: 'parked', t: rnd(0, 12) + j * 3, x: 0, y: 0.6, z: 0, hd: 0, sp: 0, tgt: null, hp: 1, mcd: rnd(1, 3), flare: 2, slot: j, carrier: null, home: null };
    park(J); jets.push(J); return J;
  }
  function park(J) {
    J.st = 'parked'; J.sp = 0; J.y = 0.6; J.hp = 1; J.flare = 2;
    J.x = J.side * BASE_X - J.side * (6 + (J.slot % 6) * 6); J.z = BASE_Z - 12 - Math.floor(J.slot / 6) * 6; J.hd = J.side < 0 ? 0 : Math.PI;
    J.g.visible = true; J.g.rotation.set(0, 0, 0);
  }
  function sortieRate() {   // market weight: |momentum| (ESTIMATED), 0.5…1.6
    var m = 0; try { m = Math.abs(E().getMomentum() || 0); } catch (_) {}
    return Math.min(1.6, 0.5 + m * 40);
  }
  function enemyOf(side, list) { var best = null, bd = 1e9; for (var i = 0; i < list.length; i++) { var o = list[i]; if (o.side === side || !(o.st === 'cruise' || o.st === 'fight' || o.st === 'rtb')) continue; var d = (o.x - this_x) * (o.x - this_x) + (o.z - this_z) * (o.z - this_z); if (d < bd) { bd = d; best = o; } } return best ? { o: best, d: Math.sqrt(bd) } : null; }
  var this_x = 0, this_z = 0;
  function steer(J, tx, ty, tz, dt, turn) {
    var want = Math.atan2(-(tz - J.z), tx - J.x), d = want - J.hd;
    while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    var r = Math.max(-turn * dt, Math.min(turn * dt, d)); J.hd += r;
    J.x += Math.cos(J.hd) * J.sp * dt; J.z -= Math.sin(J.hd) * J.sp * dt; J.y += (ty - J.y) * Math.min(1, dt * 0.8);
    J.g.rotation.set(-r / Math.max(dt, 1e-3) * 0.25, J.hd, 0);
    return Math.hypot(tx - J.x, tz - J.z);
  }
  function tickJet(J, dt) {
    var F = fx();
    J.t -= dt;
    if (J.st === 'parked') { if (J.t <= 0 && airborne() < cap.jets) { J.st = 'taxi'; J.sp = 3; } }
    else if (J.st === 'taxi') { J.x -= J.side * J.sp * dt * -1; if (Math.abs(J.x - J.side * BASE_X) < 30) { J.z += (BASE_Z - J.z) * Math.min(1, dt * 2); } if (Math.abs(J.z - BASE_Z) < 0.6) { J.st = 'takeoff'; J.hd = J.side < 0 ? 0 : Math.PI; } }
    else if (J.st === 'takeoff') { J.sp = Math.min(34, J.sp + 14 * dt); J.x += Math.cos(J.hd) * J.sp * dt; if (J.sp > 20) J.y += dt * 6; J.g.rotation.set(0, J.hd, J.sp > 20 ? 0.18 : 0); if (J.y > 18) { J.st = 'cruise'; J.t = rnd(28, 45); pickTarget(J); } }
    else if (J.st === 'cruise' || J.st === 'fight') {
      this_x = J.x; this_z = J.z; var foe = enemyOf(J.side, jets);
      if (foe && foe.d < 70) {
        J.st = 'fight'; var o = foe.o;
        steer(J, o.x, o.y, o.z, dt, 1.5);
        J.mcd -= dt;
        if (J.mcd <= 0 && foe.d < 55) { J.mcd = rnd(2.5, 4.5) / sortieRate(); fireMissile(J, o); }
      } else {
        J.st = 'cruise';
        var d = steer(J, J.tgt.x, 22 + J.slot % 3 * 4, J.tgt.z, dt, 0.9);
        if (d < 12) pickTarget(J);
      }
      if (F && Math.random() < dt * 4) F.puff({ kind: 'smoke', x: J.x - Math.cos(J.hd) * 2, y: J.y, z: J.z + Math.sin(J.hd) * 2, size: 0.5, grow: 1.4, life: 0.8, color: 0xd0d3d4, opacity: 0.25 });
      if (J.t <= 0) J.st = 'rtb';
    } else if (J.st === 'rtb') {
      var hx = J.side * BASE_X + J.side * 40, d2 = steer(J, hx, 10, BASE_Z, dt, 0.9);
      if (d2 < 8) { J.st = 'land'; J.hd = J.side < 0 ? Math.PI : 0; }
    } else if (J.st === 'land') {
      J.sp = Math.max(5, J.sp - 8 * dt); J.x += Math.cos(J.hd) * J.sp * dt; J.y = Math.max(0.6, J.y - dt * 4); J.z += (BASE_Z - J.z) * Math.min(1, dt);
      J.g.rotation.set(0, J.hd, -0.06);
      if (J.y <= 0.61 && J.sp <= 5.5) { park(J); J.t = rnd(8, 18) / sortieRate(); }
    } else if (J.st === 'down') {
      J.y -= dt * 9; J.x += Math.cos(J.hd) * J.sp * dt; J.z -= Math.sin(J.hd) * J.sp * dt; J.g.rotation.z += dt * 3;
      if (F && Math.random() < dt * 14) F.puff({ kind: 'smoke', x: J.x, y: J.y, z: J.z, size: 1.0, grow: 1.6, life: 2.2, color: 0x2a2826, opacity: 0.5 });
      if (J.y <= 0.3) { crash(J.x, J.z, 1.2); J.g.visible = false; J.st = 'dead'; J.t = rnd(25, 40); }
    } else if (J.st === 'dead') { if (J.t <= 0) park(J); }
    J.g.position.set(J.x, J.y, J.z);
    if (J.st === 'taxi' || J.st === 'parked' || J.st === 'land') J.g.rotation.y = J.hd;
  }
  function airborne() { var n = 0; for (var i = 0; i < jets.length; i++) { var s = jets[i].st; if (s === 'cruise' || s === 'fight' || s === 'rtb' || s === 'takeoff') n++; } return n; }
  function pickTarget(J) {
    var r = Math.random(), s = J.side;
    if (r < 0.4) J.tgt = { x: E().getFrontlineX() + rnd(-20, 20), z: rnd(-40, 40) };                 // CAS over the ground front
    else if (r < 0.7) J.tgt = { x: -s * BASE_X + rnd(-30, 30), z: BASE_Z + rnd(-20, 20) };         // raid the enemy airbase
    else J.tgt = { x: -s * rnd(30, 120), z: NAVAL_Z + rnd(-25, 25) };                              // strike the enemy fleet
  }
  function fireMissile(J, o) {
    if (missiles.length > 24) return;
    missiles.push({ x: J.x, y: J.y - 0.4, z: J.z, tgt: o, t: 0, side: J.side });
  }
  function tickMissiles(dt) {
    var F = fx();
    for (var i = missiles.length - 1; i >= 0; i--) {
      var m = missiles[i], o = m.tgt; m.t += dt;
      var dx = o.x - m.x, dy = o.y - m.y, dz = o.z - m.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, sp = 70 * dt;
      m.x += dx / d * sp; m.y += dy / d * sp; m.z += dz / d * sp;
      if (F) F.puff({ kind: 'smoke', x: m.x, y: m.y, z: m.z, size: 0.35, grow: 1.6, life: 1.1, color: 0xe8e8e8, opacity: 0.45 });
      if (d < 2 || m.t > 3) {
        missiles.splice(i, 1);
        if (o.flare > 0 && Math.random() < 0.4) { o.flare--; if (F) for (var k = 0; k < 4; k++) F.puff({ kind: 'fire', x: o.x, y: o.y - k * 0.5, z: o.z, vy: -2, size: 0.5, grow: 0.2, life: 0.8, color: 0xffd27a, opacity: 0.9, delay: k * 0.05 }); continue; }
        if (d < 4 && (o.st === 'cruise' || o.st === 'fight' || o.st === 'rtb')) { if (F) F.puff({ kind: 'fire', x: o.x, y: o.y, z: o.z, size: 2.4, grow: 0.6, life: 0.6, color: 0xff9a3a, opacity: 0.95 }); o.st = 'down'; stats.kills++; }
      }
    }
  }
  function crash(x, z, p) {
    if (isWater(x, z)) { splash(x, z, p); return; }
    if (LB.damage) try { LB.damage.burst({ x: x, y: 0.3, z: z, n: 10, power: p, size: 0.32, trail: true }); } catch (_) {}
    if (LB.persist) try { LB.persist.addWreck({ x: x, z: z, rotY: Math.random() * 6, sx: 2.4, sy: 0.35, sz: 0.8, color: 0x2a2b2c, tilt: 0.2 }); } catch (_) {}
    var F = fx(); if (F) F.zone({ kind: 'fire', x: x, z: z, r: 1, dur: 5 });
  }

  // ---------------------------------------------------------------- naval
  function navalWeight(side) {   // army ratio from market walls (ESTIMATED): stronger side fires a bit faster
    try { var A = E().getArmies(), b = A.bulls.length, r = A.bears.length; var k = side < 0 ? b / Math.max(1, r) : r / Math.max(1, b); return Math.max(0.6, Math.min(1.6, k)); } catch (_) { return 1; }
  }
  function tickShip(s, dt) {
    var F = fx();
    if (s.st === 'sink') {
      s.t += dt; s.g.rotation.z = Math.min(0.32, s.t * 0.04) * s.side; s.g.position.y = -Math.min(1.6, s.t * 0.15);
      if (F && Math.random() < dt * 3) F.puff({ kind: 'smoke', x: s.x, y: 2, z: s.z, vy: 1.6, size: 2, grow: 1.6, life: 3, color: 0x221f1c, opacity: 0.5 });
      if (s.t > 12) { s.st = 'hulk'; hulks.push(s); if (hulks.length > 6) { var h = hulks.shift(); root.remove(h.g); ships.splice(ships.indexOf(h), 1); } }
      return;
    }
    if (s.st === 'hulk') return;
    s.x += s.dir * s.speed * dt;
    if (s.side < 0 ? (s.x < -170 || s.x > -18) : (s.x > 170 || s.x < 18)) s.dir = -s.dir;
    s.g.position.x = s.x; s.g.rotation.y = s.dir > 0 ? 0 : Math.PI;
    s.g.position.y = Math.sin(performance.now() * 0.0012 + s.z) * 0.12;
    if (s.burn > 0 && F && Math.random() < dt * 4) F.puff({ kind: Math.random() < 0.4 ? 'fire' : 'smoke', x: s.x + rnd(-3, 3), y: 2.4, z: s.z, vy: 1.3, size: 1.2, grow: 1.4, life: 1.8, color: Math.random() < 0.4 ? 0xff7a1a : 0x2e2a26, opacity: 0.55, flicker: true });
    s.reload -= dt * navalWeight(s.side);
    if (s.reload <= 0 && s.kind !== 'carrier') {
      s.reload = rnd(5, 9);
      var t = nearestShip(s); if (t) broadside(s, t);
    }
    if (s.kind === 'carrier') {
      s.deckT -= dt;
      if (s.deckT <= 0) { s.deckT = rnd(10, 18) / sortieRate(); deckLaunch(s); }
    }
  }
  function nearestShip(s) { var b = null, bd = 1e9; for (var i = 0; i < ships.length; i++) { var o = ships[i]; if (o.side === s.side || o.st !== 'sail') continue; var d = Math.abs(o.x - s.x) + Math.abs(o.z - s.z); if (d < bd) { bd = d; b = o; } } return bd < 260 ? b : null; }
  function broadside(s, t) {
    var F = fx(), n = s.kind === 'battleship' ? 3 : 2;
    for (var i = 0; i < n && shells.length < 40; i++) {
      var ox = s.x + rnd(-s.g.scale.x * 3, 3), tx = t.x + rnd(-6, 6), tz = t.z + rnd(-4, 4), T = 2.4 + Math.abs(tx - ox) / 70;
      shells.push({ x: ox, y: 2, z: s.z, vx: (tx - ox) / T, vz: (tz - s.z) / T, vy: 9.8 * T / 2, t: 0, tgt: t, from: s });
      if (F) F.puff({ kind: 'fire', x: ox, y: 2, z: s.z, size: 1.4, grow: 0.4, life: 0.25, color: 0xffd090, opacity: 0.95 });
      if (F) F.puff({ kind: 'smoke', x: ox, y: 2.2, z: s.z, vy: 0.6, size: 1.4, grow: 1.6, life: 1.6, color: 0x9a9a96, opacity: 0.35 });
    }
  }
  function tickShells(dt) {
    var F = fx();
    for (var i = shells.length - 1; i >= 0; i--) {
      var p = shells[i]; p.t += dt; p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (F && Math.random() < 0.6) F.puff({ kind: 'tracer', x: p.x, y: p.y, z: p.z, size: 0.45, grow: 0.1, life: 0.2, color: 0xffd27a, opacity: 0.9 });
      if (p.y <= 0) {
        shells.splice(i, 1);
        var t = p.tgt;
        if (t && t.st === 'sail' && Math.abs(p.x - t.x) < (t.kind === 'carrier' ? 11 : 7) && Math.abs(p.z - t.z) < 3.5) hitShip(t, 16, p.x, p.z);
        else splash(p.x, p.z, 0.8);
      }
    }
  }
  function hitShip(t, dmg, x, z) {
    var F = fx(); t.hp -= dmg; t.burn = 1;
    if (F) F.puff({ kind: 'fire', x: x, y: 2, z: z, size: 2.2, grow: 0.6, life: 0.6, color: 0xff9a3a, opacity: 0.95 });
    if (LB.damage) try { LB.damage.burst({ x: x, y: 2, z: z, n: 5, power: 1, size: 0.3, palette: [0x56605d, 0x2b2e30] }); } catch (_) {}
    if (t.kind === 'carrier' && (!t._brk || performance.now() - t._brk > 20000)) { t._brk = performance.now(); breaking((t.side < 0 ? 'Bull' : 'Bear') + ' carrier hit — fires on the flight deck'); }
    if (t.hp <= 0 && t.st === 'sail') {
      t.st = 'sink'; t.t = 0; stats.sunk++;
      if (t.kind === 'carrier') breaking((t.side < 0 ? 'Bull' : 'Bear') + ' carrier going down');
      var side = t.side, kind = t.kind, idx = ships.length;
      setTimeout(function () { if (ready) spawnShip(side, idx, kind); }, 45000);
    }
  }
  function deckLaunch(s) {
    // a deck jet: borrow a parked jet of this side and launch it from the carrier
    for (var i = 0; i < jets.length; i++) { var J = jets[i]; if (J.side === s.side && J.st === 'parked' && airborne() < cap.jets) {
      J.x = s.x; J.z = s.z; J.y = 2.3; J.hd = s.dir > 0 ? 0 : Math.PI; J.sp = 14; J.st = 'takeoff'; return; } }
  }
  function splash(x, z, p) {
    var F = fx(); if (!F) return;
    p = p || 1;
    for (var k = 0; k < 4; k++) F.puff({ kind: 'dust', x: x + rnd(-0.6, 0.6), y: 0.2, z: z + rnd(-0.6, 0.6), vy: 6 * p + k, size: 0.9 * p + 0.3, grow: 1.2, life: 1.1, color: 0xe9f2f4, opacity: 0.75, drag: 0.94, delay: k * 0.04 });
  }
  function isWater(x, z) { return enabled && ready && z > SHORE + 1.5; }

  // ---------------------------------------------------------------- bases: AA, radar, convoys
  function tickBases(dt) {
    var F = fx();
    for (var r = 0; r < radars.length; r++) radars[r].rotation.y += dt * 1.6;
    for (var i = 0; i < aaGuns.length; i++) {
      var a = aaGuns[i]; a.cd -= dt; if (a.cd > 0) continue; a.cd = 0.7;
      this_x = a.wx; this_z = a.wz; var foe = enemyOf(a.side, jets);
      if (!foe || foe.d > 60) continue;
      var o = foe.o; a.g.rotation.y = Math.atan2(o.x - a.wx, o.z - a.wz);
      if (F) F.puff({ kind: 'smoke', x: o.x + rnd(-4, 4), y: o.y + rnd(-2, 3), z: o.z + rnd(-4, 4), size: 1.3, grow: 1.2, life: 1.2, color: 0x262422, opacity: 0.6 });
      if (Math.random() < 0.06 && o.st !== 'down') { o.st = 'down'; stats.kills++; }
    }
    for (var c = 0; c < convoys.length; c++) {
      var v = convoys[c]; if (LB.lines && LB.lines.isCut && LB.lines.isCut(v.side)) continue;   // v12.0.6: cut supply line → convoys halt
      v.t += v.dir * dt * 0.03;
      if (v.t > 1) { v.t = 1; v.dir = -1; } else if (v.t < 0) { v.t = 0; v.dir = 1; }
      var x0 = v.side * 205, x1 = E().getFrontlineX() + v.side * 46, x = x0 + (x1 - x0) * v.t;
      v.g.position.set(x, -0.3, -32 + (v.dir > 0 ? -0.7 : 0.7)); v.g.rotation.y = (x1 > x0) === (v.dir > 0) ? 0 : Math.PI;
    }
  }

  // ---------------------------------------------------------------- commander strikes anywhere
  function onStrike(x, z, power) {
    if (!ready) return;
    for (var i = 0; i < ships.length; i++) { var s = ships[i]; if (s.st === 'sail' && Math.abs(s.x - x) < 6 + power * 3 && Math.abs(s.z - z) < 3 + power * 2) hitShip(s, 25 * power, x, z); }
    for (var j = 0; j < jets.length; j++) { var J = jets[j]; if (J.st === 'parked' && Math.hypot(J.x - x, J.z - z) < 2 + power * 2) { J.g.visible = false; J.st = 'dead'; J.t = 40; crash(J.x, J.z, power); } }
  }

  // ---------------------------------------------------------------- camera: theaters, fly-to, tour, Q/E
  var VIEWS = {
    ground: { label: 'Ground', x: 0, z: 0, d: 70, pol: 0.95, az: 0 },
    naval: { label: 'Naval', x: 0, z: NAVAL_Z, d: 120, pol: 1.0, az: 0.3 },
    airW: { label: 'Air West', x: -BASE_X, z: BASE_Z, d: 80, pol: 0.9, az: 0.6 },
    airE: { label: 'Air East', x: BASE_X, z: BASE_Z, d: 80, pol: 0.9, az: -0.6 },
    bullHq: { label: 'Bull HQ', x: -44, z: 0, d: 45, pol: 0.95, az: 0.4 },
    bearHq: { label: 'Bear HQ', x: 44, z: 0, d: 45, pol: 0.95, az: -0.4 },
    overview: { label: 'Overview', x: 0, z: 40, d: 310, pol: 0.62, az: 0 }
  };
  function flyTo(id, dur) {
    var v = VIEWS[id]; if (!v || !E()) return;
    var e = E(), T = e.getCameraTarget();
    _sph.set(v.d, v.pol, v.az);
    var to = new THREE.Vector3(v.x, 0.5, v.z), pos = new THREE.Vector3().setFromSpherical(_sph).add(to);
    fly = { t: 0, dur: dur || 1.6, fromT: T, toT: to, fromP: e.camera.position.clone(), toP: pos, id: id };
  }
  function tickCamera(dt) {
    var e = E(), cam = e.camera, c = e.controls;
    if (fly) {
      fly.t += dt; var k = Math.min(1, fly.t / fly.dur), s = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      _v.lerpVectors(fly.fromT, fly.toT, s); _v2.lerpVectors(fly.fromP, fly.toP, s);
      var lift = Math.sin(k * Math.PI) * Math.min(80, fly.fromT.distanceTo(fly.toT) * 0.25);   // arc up over long hops
      _v2.y += lift; if (c) c.target.copy(_v); cam.position.copy(_v2); cam.lookAt(_v);
      if (k >= 1) fly = null;
    }
    var rot = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
    if (rot && c) {
      _v.copy(cam.position).sub(c.target); _v.applyAxisAngle(_v2.set(0, 1, 0), rot * dt * 1.4); cam.position.copy(c.target).add(_v);
    }
    if (tour && !fly) { tour.t -= dt; if (tour.t <= 0) { tour.i = (tour.i + 1) % tour.list.length; flyTo(tour.list[tour.i], 3); tour.t = 7; } }
  }
  function startTour(on) {
    tour = on ? { list: ['overview', 'naval', 'airE', 'ground', 'airW', 'bullHq', 'bearHq'], i: -1, t: 0 } : null;
    var b = doc().getElementById('thTour'); if (b) b.classList.toggle('on', !!tour);
  }
  function doc() { return global.document; }

  // ---------------------------------------------------------------- UI: theater jump bar (Map sheet), ticker (Intel)
  function buildUi() {
    var d = doc(), bar = d.createElement('div'); bar.id = 'theaterBar'; bar.className = 'theater-bar';
    bar.innerHTML = '<div class="th-title">THEATERS <span class="qual sim">SIMULATED</span></div><div class="th-btns">' +
      Object.keys(VIEWS).map(function (k) { return '<button type="button" data-th="' + k + '">' + VIEWS[k].label + '</button>'; }).join('') +
      '<button type="button" id="thTour" data-th="tour">▶ Tour</button></div>' +
      '<div class="th-note">Naval tempo ← army ratio · Air sorties ← |momentum| · <b>ESTIMATED · SIMULATED</b>, never alters price or the front. ' +
      'Drag/1-finger pan · pinch/wheel zoom · 2-finger/Q·E rotate · WASD move.</div>';
    bar.addEventListener('click', function (ev) { var b = ev.target.closest('[data-th]'); if (!b) return; var id = b.getAttribute('data-th'); if (id === 'tour') startTour(!tour); else { startTour(false); flyTo(id); } });
    var host = d.querySelector('#sheet-map .sheet-body');
    if (host) host.insertBefore(bar, host.firstChild); else { bar.classList.add('floating'); d.body.appendChild(bar); }
    var tk = d.createElement('div'); tk.id = 'theaterTicker'; tk.className = 'theater-ticker'; tk.hidden = true;
    var ih = d.querySelector('#sheet-intel .sheet-body'); if (ih) ih.insertBefore(tk, ih.firstChild); else d.body.appendChild(tk);
    global.addEventListener('keydown', function (e) { if (/INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return; keys[e.code] = true; if (e.code === 'KeyO' && !e.ctrlKey && !e.metaKey) flyTo('overview'); });
    global.addEventListener('keyup', function (e) { keys[e.code] = false; });
    global.addEventListener('pointerdown', function () { if (tour) startTour(false); fly = fly && fly.t > 0.2 ? null : fly; }, true);
  }
  function breaking(text) {
    if (/carrier/i.test(text) && LB.voice && LB.voice.event) try { LB.voice.event('carrier', 0); } catch (_) {}   // v12.0.10 radio
    var line = 'BREAKING · ' + text + ' (SIMULATED)';
    ticker.unshift(line); if (ticker.length > 4) ticker.pop();
    var tk = doc().getElementById('theaterTicker'); if (tk) { tk.hidden = false; tk.innerHTML = ticker.map(function (t) { return '<div>' + t + '</div>'; }).join(''); }
    if (LB.ai && LB.ai.send) try { LB.ai.send({ side: 0, type: 'breaking', text: line }); } catch (_) {}
  }

  // ---------------------------------------------------------------- tick
  var fogT = 0;
  function update() {
    if (!enabled) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { build(); } catch (err) { enabled = false; console.warn('[theaters] disabled', err); return; } }
    var now = performance.now(), wdt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    tickCamera(wdt);
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive())) return;
    var t0 = now;
    if (oceanU) oceanU.value += wdt;
    if (foam) foam.material.opacity = 0.32 + Math.sin(now * 0.0013) * 0.14;
    fogT -= wdt; if (fogT <= 0) { fogT = 2; fogWide(); }
    // sim LOD: theaters far from the camera tick at 4 Hz
    var T = e.getCameraTarget(), far = Math.abs(T.x) > 0 ? 0 : 0;
    var navalNear = Math.hypot(T.x, T.z - NAVAL_Z) < 230 || e.camera.position.y > 120;
    farAcc += wdt;
    var doFar = farAcc >= 0.25, fdt = farAcc;
    if (doFar) farAcc = 0;
    var nd = navalNear ? wdt : (doFar ? fdt : 0);
    stats.simHz = navalNear ? 'full' : '4Hz';
    if (nd) { for (var i = 0; i < ships.length; i++) tickShip(ships[i], nd); tickShells(nd); }
    for (var j = 0; j < jets.length; j++) tickJet(jets[j], wdt);   // aircraft cross theaters → always full rate (few)
    tickMissiles(wdt);
    if (navalNear || doFar) tickBases(navalNear ? wdt : fdt);
    stats.ships = ships.filter(function (s) { return s.st === 'sail'; }).length; stats.hulks = hulks.length; stats.jets = jets.length; stats.airborne = airborne();
    stats.shells = shells.length; stats.missiles = missiles.length;
    stats.ms = stats.ms * 0.95 + (performance.now() - t0) * 0.05;
  }

  LB.theaters = {
    isEnabled: function () { return enabled && ready; }, bounds: BOUNDS, update: update, flyTo: flyTo, tour: startTour, isWater: isWater, splash: splash, onStrike: onStrike,
    VIEWS: VIEWS, CAPS: CAPS,
    getStats: function () { return Object.assign({ tier: tierN, cap: cap }, stats); },
    _ships: function () { return ships; }, _jets: function () { return jets; }
  };
})(window);
