/* LUNC Battlefield v12.0.63 — Airbase dispersal: aircraft blast revetments (realism checklist, Scale & spacing:
 * "aircraft blast revetments still open"). Before this, parked jets stood nose-to-tail in a taxi queue on the apron and
 * taxied out through each other; at HIGH the second row was parked against the hangar fronts.
 *  - Two facing rows of U-shaped steel-bin revetments (corrugated steel bins filled with earth, ARMCO style) either side of
 *    a central taxi lane on each apron, with yellow lead-in lines, stop bars and slot numbers; a tarmac taxiway link
 *    from the lane to the runway; the hangars move 5 m back so the rear row has room.
 *  - Jets park nose-out in their own revetment. Taxi-out: roll forward into the lane, taxi to the link, curve onto the
 *    runway centreline, then the normal line-up / take-off. Taxi-in (after the v12.0.15 rollout): runway → link → lane,
 *    stop abeam the slot, a tow tug hooks on and pushes the jet back into the revetment.
 *  - Walls are slightly lower on LOW / phones (same layout, fewer bins, no slot numbers).
 * Kill switch: ?jetrevet=0 (also off with ?realism=0) restores the old parking and taxi exactly.
 * Visual + ground movement of the theater jets only (SIMULATED layer): never touches market data, armies, the front or
 * data-truth labels. API: LUNCBattle.jetRevet.getState().
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('jetrevet') !== '0' && qs.get('realism') !== '0';
  var BASE_X = 205, BASE_Z = -55;
  var LANE = -13, ROW = [-8.5, -17.5], PITCH = 6, FIRST = 6, LINK = 10, WALL_H = 1.55, DEPTH = 5.2, HANGAR_Z = -29;
  var THREE = null, root = null, built = false, tugs = {}, walls = [], mats = {};
  var stats = { built: false, revetments: 0, wallSegs: 0, tugs: 0, taxiOuts: 0, taxiIns: 0, pushbacks: 0, maxSlots: 0 };

  function E() { return LB.engine; }
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function lite() { return tier() === 'LOW' || !!(E() && E().mobile) || global.innerWidth < 760; }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /** Parking slot j of a side: world x / z, nose-out heading, row, lane z. */
  function slot(side, j) {
    var k = j % 6, row = Math.floor(j / 6) % 2, bx = side * BASE_X;
    return { x: bx - side * (FIRST + k * PITCH), z: BASE_Z + ROW[row], hd: row === 0 ? Math.PI / 2 : -Math.PI / 2, row: row, lane: BASE_Z + LANE };
  }
  function takeoffHd(side) { return side < 0 ? 0 : Math.PI; }

  // ------------------------------------------------------------ ground movement (pure pursuit on waypoints)
  function drive(J, wx, wz, sp, dt, rate) {   // forward along the heading, turning toward (wx, wz); returns distance left
    var dx = wx - J.x, dz = wz - J.z, d = Math.hypot(dx, dz), want = Math.atan2(-dz, dx), err = wrap(want - J.hd);
    J.hd = wrap(J.hd + clamp(err, -dt * rate, dt * rate));
    var v = Math.abs(err) > 0.6 ? sp * 0.55 : sp; if (d < 2) v = Math.min(v, 0.6 + d);
    J.sp = v; J.x += Math.cos(J.hd) * v * dt; J.z -= Math.sin(J.hd) * v * dt;
    return d;
  }
  function outRoute(J) {
    var s = slot(J.side, J.slot), bx = J.side * BASE_X, lz = s.lane + (s.row === 0 ? 0.6 : -0.6);   // start the turn just short of the lane centre: wingtips clear the wall ends (centre >= 1.98 m, half-span 1.73 m)
    return [[s.x, lz], [bx + J.side * (LINK - 2), s.lane], [bx + J.side * LINK, BASE_Z - 4.2], [bx + J.side * (LINK - 3.5), BASE_Z - 0.4], [bx + J.side * (LINK - 6), BASE_Z]];
  }
  /** Theater 'taxi' state. Returns true when the jet is on the runway centreline, ready for line-up / take-off. */
  function taxiOut(J, dt) {
    var R = J._jr;
    if (!R || R.k !== 'out') { R = J._jr = { k: 'out', w: outRoute(J), i: 0 }; }
    var p = R.w[R.i], d = drive(J, p[0], p[1], R.i === 0 ? 1.6 : 3.2, dt, 1.5);
    if (d < (R.i === R.w.length - 1 ? 0.6 : R.i === 0 ? 0.6 : 1.3)) { R.i++; if (R.i >= R.w.length) { J._jr = null; J.z = BASE_Z; stats.taxiOuts++; return true; } }
    return false;
  }
  /** Taxi-in after the rollout (realism-seaair ap 4). Returns true once the jet is pushed back into its slot. */
  function taxiIn(J, dt) {
    var R = J._jr, s = slot(J.side, J.slot), bx = J.side * BASE_X;
    if (!R || R.k !== 'in') {
      var past = J.side * (J.x - bx) > LINK + 2;   // rolled out beyond the link: turn back along the runway first
      R = J._jr = { k: 'in', ph: 0, i: 0, w: (past ? [] : [[bx + J.side * (LINK + 4), BASE_Z]]).concat([[bx + J.side * (LINK + 1), BASE_Z - 3.5], [bx + J.side * LINK, s.lane + 1.2], [bx + J.side * (LINK - 3), s.lane], [s.x - J.side * 2.2, s.lane]]) };
    }
    if (R.ph === 0) {
      var p = R.w[R.i], d = drive(J, p[0], p[1], 3, dt, 1.5);
      if (d < 1.0) { R.i++; if (R.i >= R.w.length) { R.ph = 1; J.sp = 0; } }
      return false;
    }
    if (R.ph === 1) {   // tug hooks on, swings the jet round so its tail faces the revetment
      J._push = true; J.sp = 0; var e = wrap(s.hd - J.hd); J.hd = wrap(J.hd + clamp(e, -dt * 0.55, dt * 0.55));
      J.x += (s.x - J.x) * Math.min(1, dt * 0.9);
      if (Math.abs(e) < 0.02 && Math.abs(J.x - s.x) < 0.08) { J.hd = s.hd; J.x = s.x; R.ph = 2; stats.pushbacks++; }
      return false;
    }
    // ph 2: pushed back (tail first) to the stop bar at walking pace
    J._push = true; var dz = s.z - J.z, v = Math.min(1.0, 0.25 + Math.abs(dz)); J.sp = 0;
    J.z += Math.sign(dz) * Math.min(Math.abs(dz), v * dt);
    if (Math.abs(dz) < 0.03) { J._push = false; J._jr = null; stats.taxiIns++; return true; }
    return false;
  }

  // ------------------------------------------------------------ visuals
  function binGeo(len, h, lowH) {   // tapered earth-filled steel bin: trapezoid section extruded along x
    var sh = new THREE.Shape(), b = 0.55, t = 0.32;
    sh.moveTo(-b, 0); sh.lineTo(b, 0); sh.lineTo(t, h); sh.lineTo(-t, h); sh.lineTo(-b, 0);
    var g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false, steps: 1 });
    g.translate(0, 0, -len / 2); g.rotateY(Math.PI / 2);   // runs along x
    return g;
  }
  function corrTex() {   // vertical corrugations with rust streaks (canvas, no assets)
    var c = document.createElement('canvas'); c.width = 128; c.height = 64; var x = c.getContext('2d');
    x.fillStyle = '#6b6f60'; x.fillRect(0, 0, 128, 64);
    for (var i = 0; i < 128; i += 4) { x.fillStyle = i % 8 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.18)'; x.fillRect(i, 0, 2, 64); }
    for (var r = 0; r < 14; r++) { x.fillStyle = 'rgba(110,62,30,' + (0.12 + Math.random() * 0.2) + ')'; x.fillRect(Math.random() * 128, 20 + Math.random() * 30, 1 + Math.random() * 3, 34); }
    for (var p = 0; p < 4; p++) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(p * 32, 0, 1, 64); }
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function addWall(x, z, len, along, h) {   // along: 'x' or 'z'
    var g = binGeo(len, h); var m = new THREE.Mesh(g, mats.steel); m.position.set(x, -0.02, z); if (along === 'z') m.rotation.y = Math.PI / 2;
    m.castShadow = true; m.receiveShadow = true; m.name = 'jet-revet-wall'; root.add(m);
    var top = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, 0.12, 0.6), mats.earth); top.position.set(x, -0.02 + h + 0.03, z); if (along === 'z') top.rotation.y = Math.PI / 2; top.name = 'jet-revet-top'; root.add(top);
    walls.push({ x: x, z: z, hx: along === 'x' ? len / 2 : 0.55, hz: along === 'z' ? len / 2 : 0.55 }); stats.wallSegs++;
  }
  function slab(x, z, w, d) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, d), mats.tarmac); m.position.set(x, -0.312, z); m.receiveShadow = true; m.name = 'jet-revet-taxiway'; root.add(m); return m; }   // reaches down to the skirt (no floating slab)
  function flat(x, z, w, d, mat, y, ry) { var m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; m.receiveShadow = true; m.name = 'jet-revet-mark'; root.add(m); return m; }
  function build() {
    var e = E(), th = LB.theaters; THREE = e.THREE;
    root = new THREE.Group(); root.name = 'v12-jet-revet'; e.scene.add(root);
    var l = lite(), h = l ? WALL_H * 0.85 : WALL_H;
    var tex = corrTex();
    mats.steel = new THREE.MeshStandardMaterial({ color: 0x9da293, map: tex, roughness: 0.75, metalness: 0.35 });
    mats.earth = new THREE.MeshStandardMaterial({ color: 0x7d6e52, roughness: 1 });
    mats.yellow = new THREE.MeshStandardMaterial({ color: 0xe0b53a, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mats.tarmac = new THREE.MeshStandardMaterial({ color: 0x3d4042, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    mats.tug = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.6, metalness: 0.2 });
    mats.dark = new THREE.MeshStandardMaterial({ color: 0x222426, roughness: 0.8 });
    var n = 6; try { var J = th && th._jets ? th._jets() : []; var per = {}; J.forEach(function (q) { per[q.side] = Math.max(per[q.side] || 0, q.slot + 1); }); n = Math.max(1, per[-1] || 0, per[1] || 0); } catch (_) {}
    stats.maxSlots = n;
    [-1, 1].forEach(function (s) {
      var bx = s * BASE_X;
      // taxiway link: lane → runway, and the lane stub beyond the apron edge
      slab(bx + s * (LINK - 3.5), BASE_Z + LANE, 15, 4.4);
      slab(bx + s * LINK, BASE_Z + (LANE - 3.5) / 2 - 0.2, 5, -LANE - 1.5);
      flat(bx - s * 18, BASE_Z + LANE, 34, 0.14, mats.yellow, -0.002);   // lane centre line
      flat(bx + s * (LINK - 3.5), BASE_Z + LANE, 15, 0.14, mats.yellow, -0.002);
      flat(bx + s * LINK, BASE_Z + (LANE - 3.5) / 2 - 0.2, 0.14, -LANE - 3.5, mats.yellow, -0.002);
      for (var row = 0; row < 2; row++) {
        var cnt = Math.max(0, Math.min(6, n - row * 6)); if (!cnt) continue;
        var zr = BASE_Z + ROW[row], back = zr + (row === 0 ? 1 : -1) * (DEPTH / 2 + 0.3), mid = zr + (row === 0 ? 1 : -1) * 0.3 - (row === 0 ? 1 : -1) * 0.0;
        for (var k = 0; k < cnt; k++) {
          var sx = bx - s * (FIRST + k * PITCH);
          addWall(sx, back, PITCH - 0.2, 'x', h);   // back wall
          stats.revetments++;
          flat(sx, (zr + BASE_Z + LANE) / 2, 0.12, Math.abs(zr - BASE_Z - LANE), mats.yellow, -0.002);   // lead-in line
          flat(sx, zr + (row === 0 ? -1 : 1) * 2.0, 1.6, 0.16, mats.yellow, -0.002);   // stop bar at the nose
        }
        for (var w = 0; w <= cnt; w++) {   // side walls shared between neighbours
          var wx = bx - s * (FIRST - PITCH / 2 + w * PITCH), wz = zr + (row === 0 ? 1 : -1) * 0.25;
          addWall(wx, wz, DEPTH, 'z', w === 0 || w === cnt ? h : h * 0.92);
        }
      }
      // tow tug (hidden until a push-back)
      var t = new THREE.Group(); t.name = 'jet-revet-tug';
      var body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.95), mats.tug); body.position.y = 0.42; t.add(body);
      var cab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.8), mats.dark); cab.position.set(-0.35, 0.88, 0); t.add(cab);
      var bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.07), mats.dark); bar.position.set(1.35, 0.35, 0); t.add(bar);
      for (var q = 0; q < 4; q++) { var wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 10), mats.dark); wh.rotation.x = Math.PI / 2; wh.position.set(q < 2 ? 0.45 : -0.45, 0.22, q % 2 ? 0.5 : -0.5); t.add(wh); }
      var bcn = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffa020 })); bcn.position.set(-0.35, 1.15, 0); t.add(bcn); t.userData.beacon = bcn;
      t.visible = false; root.add(t); tugs[s] = t; stats.tugs++;
    });
    built = true; stats.built = true;
  }
  var acc = 0;
  function tick(dt) {
    if (!enabled) return;
    var th = LB.theaters;
    if (!built) { if (!th || !th.isEnabled || !th.isEnabled() || !E() || !E().scene || !th._jets || !th._jets().length) return; try { build(); } catch (err) { console.warn('[jetrevet]', err); built = true; enabled = false; return; } }
    acc += dt;
    var on = { '-1': null, '1': null };
    th._jets().forEach(function (J) { if (J._push && J.st === 'land' && J.g.visible) on[J.side] = J; });
    [-1, 1].forEach(function (s) {
      var t = tugs[s], J = on[s]; if (!t) return;
      t.visible = !!J; if (!J) return;
      var nose = 2.95; t.position.set(J.x + Math.cos(J.hd) * nose, -0.02, J.z - Math.sin(J.hd) * nose); t.rotation.y = J.hd + Math.PI;
      if (t.userData.beacon) t.userData.beacon.visible = (acc % 0.8) < 0.4;
    });
  }
  function hangarZ(def) { return enabled ? HANGAR_Z : def; }
  LB.jetRevet = {
    version: 'v12.0.63', isEnabled: function () { return enabled; }, slot: slot, taxiOut: taxiOut, taxiIn: taxiIn, takeoffHd: takeoffHd,
    hangarZ: hangarZ, tick: tick, _walls: function () { return walls; }, _root: function () { return root; },
    getState: function () { return Object.assign({ enabled: enabled, tier: tier(), lite: lite() }, stats); }
  };
})(window);
