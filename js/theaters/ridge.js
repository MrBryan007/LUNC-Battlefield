/* LUNC Battlefield v12.0.21 — ridge sector: the fight for Hill 402 (v12.1: a playable ridge sector). Game/sim layer.
 * The v12.0 "extra sector" was a row of cones on the horizon and the north strip was the flat ground skirt. This turns
 * the strip north of the land battle into a real sector:
 *  · terrain: a 200 × 52 m ridge mesh centred at (0, −100) with its own height function (a wandering crest 15–26 m
 *    high, the Hill 402 summit at x 0, saddle passes at x ±48, a gentler south face, a steep north face), vertex colours
 *    by height and slope, two dirt switchback trails, instanced pines and boulders
 *  · Hill 402 observation post: sandbag ring, bunker, radio mast with a blinking light, a flag in the holder's colour
 *    and a capture ring that follows the ground
 *  · one mountain fire team per side climbs its trail (slower uphill), takes the summit and digs in. Teams inside 30 m
 *    trade fire (own tracers): the high ground and the sandbags matter, weather/night sight (wx-combat) applies.
 *    A team down to 2 men falls back; a fresh team climbs 40 s later
 *  · capture: one side alone inside the ring pushes the bar (~15 s from neutral), both = CONTESTED
 *  · holding it: +1 intel / 10 s (economy.grant) and an 85 m observation-post reveal in the fog-of-war grid
 *  · Commander: Map → WAR SYSTEMS · RIDGE (Reinforce ridge 4 ammo, Fire mission 3 ammo = key K), a Ridge quick-jump,
 *    tactical-map crest + OP + teams
 * Never alters price, armies, the frontline or data labels (SIMULATED). ?ridge=0 (or ?theaters=0) turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('ridge') !== '0' && qs.get('theaters') !== '0';
  var E = function () { return LB.engine; };
  var CZ = -100, HALF_W = 100, Z0 = -74, Z1 = -126, SKIRT = -0.62, RING_R = 10, RANGE = 30, RESPAWN_S = 40, CAP_S = 15;
  var COST_REIN = { ammo: 4 }, COST_FIRE = { ammo: 3 }, REIN_CD = 45, FIRE_CD = 30;
  var CALLS = { '-1': 'Ridge Runner', '1': 'Granite' };
  var THREE = null, ready = false, last = 0, root = null, el = {}, uiT = 0, visT = 0, intelT = 10, aiFireT = { '-1': rnd(50, 80), '1': rnd(50, 80) };
  var teams = [], tracers = [], shells = [], op = {}, summit = { x: 0, z: 0, y: 0 }, paths = {};
  var cap = 0, owner = 0, contested = false, cmd = { rein: 0, fire: 0 }, sayT = {}, lastCmdFire = -1e9;
  var stats = { shots: 0, hits: 0, kia: 0, captures: 0, retreats: 0, waves: 0, intel: 0, fireMissions: 0, rein: 0, last: '' };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sstep(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'MEDIUM'; } }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bear' ? 1 : -1; } catch (_) { return -1; } }
  function sight() { try { return LB.wxCombat && LB.wxCombat.isEnabled && LB.wxCombat.isEnabled() ? LB.wxCombat.mod('sight') : 1; } catch (_) { return 1; } }
  function col(hex) { var c = new THREE.Color(hex); if (c.convertSRGBToLinear) c.convertSRGBToLinear(); return c; }
  function camDist(x, y, z) { try { var p = E().camera.position; return Math.hypot(p.x - x, p.y - y, p.z - z); } catch (_) { return 100; } }
  function radio(side, cs, text, pri, key, gap) {
    if (key) { var now = performance.now(); if (sayT[key] && now - sayT[key] < (gap || 15000)) return; sayT[key] = now; }
    if (!LB.voice || !LB.voice.say) return;
    var own = side === playerSide();
    try { LB.voice.say({ pri: pri != null ? pri : (own ? 2 : 1), side: side, callsign: cs, text: text, intercepted: !own, tag: 'SIMULATED' }); } catch (_) {}
  }

  // ------------------------------------------------------------------ height field
  function crestZ(x) { return -104 + 4 * Math.sin(x * 0.031 + 0.6) + 2 * Math.sin(x * 0.077); }
  function crestH(x) {
    var h = 15 + 4 * Math.sin(x * 0.043 + 1.1) + 2.5 * Math.sin(x * 0.11 + 0.3);
    h += 7 * Math.exp(-(x * x) / 256);                                                     // Hill 402
    h -= 8 * Math.exp(-((x - 48) * (x - 48)) / 100) + 8 * Math.exp(-((x + 48) * (x + 48)) / 100);   // saddle passes
    return Math.max(4, h);
  }
  function ridgeH(x, z) {
    var ax = Math.abs(x); if (ax >= HALF_W || z > Z0 + 2 || z < Z1 - 2) return 0;
    var dz = z - crestZ(x), w = dz > 0 ? 14 : 9, p = Math.exp(-(dz * dz) / (w * w));
    var fx = 1 - sstep(78, HALF_W, ax), fz = 1 - sstep(Z0 - 6, Z0, z), fn = sstep(Z1, Z1 + 6, z);
    var bumps = (0.55 * Math.sin(x * 0.61 + z * 0.37) * Math.sin(z * 0.83 - x * 0.21) + 0.35 * Math.sin(x * 1.7 + z * 1.3)) * p;
    return Math.max(0, (crestH(x) * p + bumps) * fx * fz * fn);
  }
  function groundY(x, z) { return SKIRT + ridgeH(x, z); }
  function slope(x, z) { var e = 0.8; return Math.hypot(ridgeH(x + e, z) - ridgeH(x - e, z), ridgeH(x, z + e) - ridgeH(x, z - e)) / (2 * e); }

  // ------------------------------------------------------------------ trails (path param in metres)
  function makePath(side) {
    var s = side, sx = summit.x, sz = summit.z;
    // Bulls (side −1) climb from the south-west, Bears (+1) from the south-east; switchbacks across the south face
    var pts = [[62, -74], [42, -81], [53, -88], [28, -92], [36, -97], [13, sz + 4.5], [7.2, sz + 1.2]].map(function (p) { return { x: s * p[0], z: p[1] }; });
    pts[pts.length - 1] = { x: sx + s * 7.2, z: sz + 1.2 };                                 // stop at the ring edge on our side
    var L = [0]; for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    return { pts: pts, L: L, len: L[L.length - 1] };
  }
  function pointAt(P, d) {
    d = clamp(d, 0, P.len);
    for (var i = 1; i < P.pts.length; i++) if (d <= P.L[i]) { var k = (d - P.L[i - 1]) / Math.max(1e-6, P.L[i] - P.L[i - 1]), a = P.pts[i - 1], b = P.pts[i]; return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, hd: Math.atan2(b.x - a.x, b.z - a.z) }; }
    var q = P.pts[P.pts.length - 1]; return { x: q.x, z: q.z, hd: 0 };
  }
  function distToPath(P, x, z) {
    var best = 1e9; for (var i = 1; i < P.pts.length; i++) {
      var a = P.pts[i - 1], b = P.pts[i], vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz, t = clamp(((x - a.x) * vx + (z - a.z) * vz) / l2, 0, 1);
      best = Math.min(best, Math.hypot(a.x + vx * t - x, a.z + vz * t - z));
    } return best;
  }

  // ------------------------------------------------------------------ build
  function buildTerrain() {
    var lo = low(), sw = lo ? 60 : 110, sd = lo ? 16 : 30;
    var g = new THREE.PlaneGeometry(HALF_W * 2, Z0 - Z1, sw, sd); g.rotateX(-Math.PI / 2);
    var pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
    var cG = col(0x46572f), cS = col(0x5a5a39), cR = col(0x57534a), cP = col(0x726d62), cD = col(0x5e4f38), c = new THREE.Color();
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), z = pos.getZ(i) + (Z0 + Z1) / 2, h = ridgeH(x, z), sl = slope(x, z);
      pos.setZ(i, z); pos.setY(i, SKIRT + h);
      c.copy(cG).lerp(cS, sstep(3, 11, h));
      c.lerp(cR, Math.max(sstep(0.75, 1.25, sl), sstep(13, 19, h) * 0.8));
      c.lerp(cP, sstep(20, 25, h) * 0.85);
      var dt = Math.min(distToPath(paths['-1'], x, z), distToPath(paths['1'], x, z)); c.lerp(cD, (1 - sstep(0.9, 2.2, dt)) * 0.85);
      var n = 0.93 + 0.14 * (0.5 + 0.5 * Math.sin(x * 2.3 + z * 1.7) * Math.sin(z * 2.9 - x * 0.7));
      colors[i * 3] = c.r * n; colors[i * 3 + 1] = c.g * n; colors[i * 3 + 2] = c.b * n;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.computeVertexNormals();
    var m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, flatShading: lo });
    var mesh = new THREE.Mesh(g, m); mesh.name = 'ridge-terrain'; mesh.receiveShadow = !lo; root.add(mesh);
    // pines + boulders (instanced)
    var nT = { LOW: 50, MEDIUM: 110, HIGH: 160, ULTRA: 190 }[tier()] || 110; if (E().mobile) nT = 50;
    var nR = lo ? 24 : 70, dummy = new THREE.Object3D();
    var pine = new THREE.InstancedMesh(new THREE.ConeGeometry(1.1, 4.2, lo ? 5 : 7), new THREE.MeshStandardMaterial({ color: col(0x2c4429), roughness: 0.9 }), nT);
    var trunkM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 5), new THREE.MeshStandardMaterial({ color: col(0x4a3826), roughness: 0.95 }), nT);
    var k = 0, tries = 0;
    while (k < nT && tries++ < nT * 30) {
      var x = rnd(-90, 90), z = rnd(Z1 + 4, Z0 - 2), h = ridgeH(x, z);
      if (h < 1.5 || h > 14 || slope(x, z) > 1.05 || Math.hypot(x - summit.x, z - summit.z) < 15) continue;
      if (Math.min(distToPath(paths['-1'], x, z), distToPath(paths['1'], x, z)) < 3) continue;
      var s = rnd(0.7, 1.45), y = groundY(x, z);
      dummy.position.set(x, y + 1.0 * s + 2.1 * s, z); dummy.rotation.set(0, rnd(0, 6.28), 0); dummy.scale.set(s, s * rnd(0.9, 1.2), s); dummy.updateMatrix(); pine.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, y + 0.6 * s, z); dummy.scale.set(s, s, s); dummy.updateMatrix(); trunkM.setMatrixAt(k, dummy.matrix); k++;
    }
    pine.count = k; trunkM.count = k; pine.name = 'ridge-pines'; root.add(pine); root.add(trunkM);
    var rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.9, 0), new THREE.MeshStandardMaterial({ color: col(0x77736a), roughness: 0.92, flatShading: true }), nR);
    k = 0; tries = 0;
    while (k < nR && tries++ < nR * 30) {
      var rx = rnd(-92, 92), rz = rnd(Z1 + 3, Z0 - 2), rh = ridgeH(rx, rz); if (rh < 2 || Math.hypot(rx - summit.x, rz - summit.z) < 6) continue;
      var rs = rnd(0.5, 1.8); dummy.position.set(rx, groundY(rx, rz) + 0.25 * rs, rz); dummy.rotation.set(rnd(0, 3), rnd(0, 6.28), rnd(0, 3)); dummy.scale.set(rs, rs * rnd(0.5, 0.9), rs * rnd(0.8, 1.3)); dummy.updateMatrix(); rock.setMatrixAt(k++, dummy.matrix);
    }
    rock.count = k; rock.name = 'ridge-rocks'; root.add(rock);
    stats.trees = pine.count; stats.rocks = rock.count;
  }
  function buildOp() {
    var g = new THREE.Group(); g.name = 'ridge-op'; g.position.set(summit.x, 0, summit.z); root.add(g); op.g = g;
    var bag = new THREE.MeshStandardMaterial({ color: col(0x8a7b58), roughness: 0.95 }), con = new THREE.MeshStandardMaterial({ color: col(0x6a6a5e), roughness: 0.9 });
    var dark = new THREE.MeshStandardMaterial({ color: col(0x1d1f1c), roughness: 0.8 }), box = new THREE.BoxGeometry(1, 1, 1);
    function put(geo, m, x, z, yo, sx, sy, sz, ry) { var o = new THREE.Mesh(geo, m); o.position.set(x, groundY(summit.x + x, summit.z + z) + yo, z); o.scale.set(sx, sy, sz); o.rotation.y = ry || 0; g.add(o); return o; }
    for (var i = 0; i < 12; i++) { var a = i / 12 * 6.2832; if (i === 3) continue; put(box, bag, Math.sin(a) * 3.4, Math.cos(a) * 3.4, 0.3, 1.7, 0.62, 0.75, a); put(box, bag, Math.sin(a + 0.26) * 3.4, Math.cos(a + 0.26) * 3.4, 0.86, 1.5, 0.5, 0.7, a + 0.26); }
    put(box, con, 0, -1.6, 0.65, 2.6, 1.4, 2.0); put(box, dark, 0, -0.58, 0.95, 1.6, 0.22, 0.05);   // bunker + firing slit
    var mast = put(new THREE.CylinderGeometry(0.06, 0.09, 7, 6), dark, 2.1, -1.2, 3.5, 1, 1, 1);
    op.light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); op.light.position.set(2.1, mast.position.y + 3.6, -1.2); g.add(op.light);
    put(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 5), dark, -2.2, 0.4, 2.1, 1, 1, 1);
    op.flagM = new THREE.MeshStandardMaterial({ color: col(0xd9d6cc), roughness: 0.8, side: THREE.DoubleSide });
    op.flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9, 6, 1), op.flagM); op.flag.position.set(-2.2 + 0.78, groundY(summit.x - 2.2, summit.z + 0.4) + 3.7, 0.4); g.add(op.flag);
    // capture ring: a ribbon that follows the ground
    var N = 72, rp = new Float32Array((N + 1) * 2 * 3), idx = [];
    for (var j = 0; j <= N; j++) {
      var b = j / N * 6.2832;
      [RING_R - 0.45, RING_R].forEach(function (r, q) { var x = Math.sin(b) * r, z = Math.cos(b) * r, o = (j * 2 + q) * 3; rp[o] = x; rp[o + 1] = groundY(summit.x + x, summit.z + z) + 0.22; rp[o + 2] = z; });
      if (j < N && j % 3 !== 2) idx.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 1, j * 2 + 3, j * 2 + 2);   // dashed, so it reads as a zone marker
    }
    var rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rg.setIndex(idx);
    op.ringM = new THREE.MeshBasicMaterial({ color: 0xe8e4d8, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    op.ring = new THREE.Mesh(rg, op.ringM); op.ring.renderOrder = 3; g.add(op.ring);
  }
  var GEO = null, MAT = null;
  function makeTeam(side) {
    if (!GEO) {
      GEO = { body: new THREE.CylinderGeometry(0.28, 0.34, 1.15, 6), head: new THREE.SphereGeometry(0.25, 6, 5), gun: new THREE.BoxGeometry(0.07, 0.07, 0.9), pack: new THREE.BoxGeometry(0.42, 0.5, 0.24) };
      MAT = { '-1': new THREE.MeshStandardMaterial({ color: col(0x3e5a36), roughness: 0.8 }), '1': new THREE.MeshStandardMaterial({ color: col(0x5b5a4a), roughness: 0.8 }),
        skin: new THREE.MeshStandardMaterial({ color: col(0xc9a27e), roughness: 0.8 }), gun: new THREE.MeshStandardMaterial({ color: col(0x1e1e1e), roughness: 0.6 }), pack: new THREE.MeshStandardMaterial({ color: col(0x4a4434), roughness: 0.9 }) };
    }
    var RZ = LB.armyRealism && LB.armyRealism.isEnabled && LB.armyRealism.isEnabled() && LB.armyRealism.figure ? LB.armyRealism : null;
    var n = low() ? 4 : 6, g = new THREE.Group(); g.name = 'ridge-team-' + side; root.add(g); var men = [];
    for (var i = 0; i < n; i++) {
      var m = new THREE.Group(), b = new THREE.Mesh(GEO.body, MAT[String(side)]), h = new THREE.Mesh(GEO.head, MAT.skin), gun = new THREE.Mesh(GEO.gun, MAT.gun), pk = new THREE.Mesh(GEO.pack, MAT.pack);
      b.position.y = 0.58; h.position.y = 1.4; gun.position.set(0.28, 0.95, 0.32); pk.position.set(0, 0.85, -0.3); m.add(b); m.add(h); m.add(gun); m.add(pk); g.add(m);
      if (RZ) { try { b.material = RZ.material(side, 'uniform') || b.material; RZ.figure(m, side, side < 0 ? 0x2f9a66 : 0xb4473f, 1.05, 0.31); } catch (_) {} }
      men.push({ g: m, i: i, alive: true, hp: 2, cd: rnd(0.5, 2), fall: 0, x: 0, y: 0, z: 0, d: 0, slot: null, ph: Math.random() * 6.28 });
    }
    var T = { side: side, cs: CALLS[String(side)], g: g, men: men, n: n, st: 'staging', t: side < 0 ? rnd(2, 5) : rnd(4, 8), d: 0, P: paths[String(side)] };
    men.forEach(function (M) { M.g.visible = false; }); return T;
  }
  function build() {
    THREE = E().THREE; root = new THREE.Group(); root.name = 'v12-ridge'; E().scene.add(root);
    summit.x = 0; summit.z = crestZ(0); summit.y = groundY(0, summit.z);
    paths['-1'] = makePath(-1); paths['1'] = makePath(1);
    buildTerrain(); buildOp();
    // the v12.0 horizon cones (js/theaters/extras.js) become the far range behind the ridge: sRGB-correct, darker
    try { E().scene.traverse(function (o) { if (o.isMesh && o.geometry && o.geometry.type === 'ConeGeometry' && o.position.z < -150 && o.material && o.material.color && o.material.color.getHex() === 0x5b6150) { o.material.color.copy(col(0x4b5144)); stats.farCones = (stats.farCones || 0) + 1; } }); } catch (_) {}
    teams = [makeTeam(-1), makeTeam(1)];
    var lm = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9 });
    for (var i = 0; i < (low() ? 6 : 12); i++) { var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)); var L = new THREE.Line(lg, lm.clone()); L.visible = false; L.frustumCulled = false; root.add(L); tracers.push({ l: L, t: 1 }); }
    buildUi();
    global.addEventListener('keydown', function (e) {
      if (!enabled || !ready) return;
      if (e.target && (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyK') commandFire();
    });
    return true;
  }

  // ------------------------------------------------------------------ teams
  function alive(T) { var n = 0; for (var i = 0; i < T.men.length; i++) if (T.men[i].alive) n++; return n; }
  function enemyOf(T) { return teams[0] === T ? teams[1] : teams[0]; }
  function inRing(M) { return M.alive && Math.hypot(M.x - summit.x, M.z - summit.z) < RING_R; }
  function inCover(M, side) { return owner === side && Math.hypot(M.x - summit.x, M.z - summit.z) < 3.9; }
  function respawnTeam(T, why) {
    T.men.forEach(function (M) { M.alive = true; M.hp = 2; M.fall = 0; M.g.visible = true; M.g.rotation.set(0, 0, 0); M.slot = null; });
    T.st = 'climb'; T.d = 0; stats.waves++;
    radio(T.side, T.cs, why || (T.cs + ', fresh team moving up the trail to Hill 402.'), 1, 'up' + T.side, 20000);
  }
  function slotFor(T, M) {   // holders sit inside the sandbags, attackers on their side of the ring
    var hold = owner === T.side || !enemyHeld(T), base = T.side < 0 ? -Math.PI / 2 : Math.PI / 2;
    var spread = hold ? 6.2832 : 1.8, a = base + (M.i / Math.max(1, T.n - 1) - 0.5) * spread * (hold ? (T.n - 1) / T.n : 1);
    var r = hold ? 2.6 : 7.0 + (M.i % 2) * 1.2;
    return { x: summit.x + Math.sin(a) * r, z: summit.z + Math.cos(a) * r };
  }
  function enemyHeld(T) { var o = enemyOf(T); return o.men.some(inRing); }
  function tickTeam(T, dt) {
    if (T.st === 'staging') { T.t -= dt; if (T.t <= 0) respawnTeam(T); return; }
    var n = alive(T);
    if (n === 0) { T.st = 'staging'; T.t = RESPAWN_S; radio(T.side, T.cs, T.cs + ' is gone. Next team in ' + RESPAWN_S + ' seconds.', 1, 'wipe' + T.side, 20000); return; }
    if (n <= 2 && T.n >= 4 && (T.st === 'climb' || T.st === 'hold')) { T.st = 'retreat'; stats.retreats++; radio(T.side, T.cs, T.cs + ', taking heavy fire, two left. Falling back off the hill.', 2, 'rt' + T.side, 15000); }
    var y0 = groundY(pointAt(T.P, T.d).x, pointAt(T.P, T.d).z);
    if (T.st === 'climb') {
      var ahead = pointAt(T.P, T.d + 1.5), grade = (groundY(ahead.x, ahead.z) - y0) / 1.5;
      var v = 2.8 * (1 - 0.55 * clamp(grade, 0, 1)) * (contact(T) ? 0.45 : 1);       // slower uphill, crawl when under fire
      T.d = Math.min(T.P.len, T.d + v * dt);
      if (T.d >= T.P.len - 0.1) { T.st = 'hold'; radio(T.side, T.cs, T.cs + ', on the summit. Digging in on Hill 402.', null, 'top' + T.side, 20000); }
    } else if (T.st === 'retreat') {
      T.d = Math.max(0, T.d - 3.6 * dt);
      if (T.d <= 0.1) { T.men.forEach(function (M) { M.g.visible = false; }); T.st = 'staging'; T.t = RESPAWN_S; }
    }
    // place men
    for (var i = 0; i < T.men.length; i++) {
      var M = T.men[i];
      if (!M.alive) { if (M.fall < 1) { M.fall = Math.min(1, M.fall + dt * 2.4); M.g.rotation.x = -M.fall * 1.45; } else { M.t = (M.t || 0) + dt; if (M.t > 14) M.g.visible = false; } continue; }
      var tx, tz;
      if (T.st === 'hold') { M.slot = slotFor(T, M); tx = M.slot.x; tz = M.slot.z; }
      else { var p = pointAt(T.P, T.d - i * 1.9 * (T.st === 'retreat' ? -1 : 1)), lat = (i % 2 ? 0.7 : -0.7); tx = p.x + Math.cos(p.hd) * lat; tz = p.z - Math.sin(p.hd) * lat; }
      if (!M.placed) { M.x = tx; M.z = tz; M.placed = true; }
      var dx = tx - M.x, dz = tz - M.z, dl = Math.hypot(dx, dz), step = Math.min(dl, 3.4 * dt);
      if (dl > 1e-3) { M.x += dx / dl * step; M.z += dz / dl * step; M.hd = Math.atan2(dx, dz); }
      var tgt = M.tgt && M.tgt.alive ? M.tgt : null; if (tgt) M.hd = Math.atan2(tgt.x - M.x, tgt.z - M.z);
      M.y = groundY(M.x, M.z); M.ph += dt * (dl > 0.05 ? 9 : 0);
      var crouch = (T.st === 'hold' || tgt) ? 0.78 : 1;
      M.g.position.set(M.x, M.y + (dl > 0.05 ? Math.abs(Math.sin(M.ph)) * 0.06 : 0), M.z); M.g.rotation.y = M.hd || 0; M.g.scale.set(1, crouch, 1);
    }
    T.cx = 0; T.cz = 0; var k = 0; T.men.forEach(function (M) { if (M.alive) { T.cx += M.x; T.cz += M.z; k++; } }); if (k) { T.cx /= k; T.cz /= k; }
  }
  function contact(T) { var o = enemyOf(T); return T.men.some(function (M) { return M.alive && o.men.some(function (N) { return N.alive && o.st !== 'staging' && Math.hypot(N.x - M.x, N.z - M.z) < RANGE; }); }); }
  function combat(dt) {
    var sm = sight();
    teams.forEach(function (T) {
      var O = enemyOf(T); if (T.st === 'staging' || O.st === 'staging') return;
      T.men.forEach(function (M) {
        if (!M.alive) return; M.cd -= dt; if (M.cd > 0) return;
        var best = null, bd = RANGE * Math.max(0.5, sm); O.men.forEach(function (N) { if (!N.alive) return; var d = Math.hypot(N.x - M.x, N.z - M.z); if (d < bd) { bd = d; best = N; } });
        M.tgt = best; if (!best) { M.cd = 0.5; return; }
        M.cd = rnd(1.4, 2.2) * (T.st === 'retreat' ? 1.6 : 1); stats.shots++;
        var p = 0.16 * sm * (M.y - best.y > 2 ? 1.35 : 1) * (inCover(best, O.side) ? 0.6 : 1) * (O.st === 'climb' || O.st === 'retreat' ? 0.85 : 1) * (1 - bd / (RANGE * 1.6));
        if (Math.random() < 0.4) tracer(M.x, M.y + 1.15, M.z, best.x + rnd(-0.4, 0.4), best.y + 0.9, best.z + rnd(-0.4, 0.4));
        if (LB.sfx && LB.sfx.gunfire && Math.random() < 0.3) try { LB.sfx.gunfire(camDist(M.x, M.y, M.z)); } catch (_) {}
        if (Math.random() < p) hit(best, O, 1);
      });
    });
  }
  function hit(N, O, dmg) {
    if (!N.alive) return; N.hp -= dmg; stats.hits++;
    if (N.hp <= 0) { N.alive = false; N.fall = 0; N.t = 0; stats.kia++; if (alive(O) === 1) radio(O.side, O.cs, O.cs + ', one man left on the hill!', 2, 'one' + O.side, 15000); }
  }
  function tracer(x0, y0, z0, x1, y1, z1) {
    var T = null; for (var i = 0; i < tracers.length; i++) if (tracers[i].t >= 0.09) { T = tracers[i]; break; } if (!T) return;
    var a = T.l.geometry.attributes.position; a.setXYZ(0, x0, y0, z0); a.setXYZ(1, x1, y1, z1); a.needsUpdate = true; T.t = 0; T.l.visible = true; T.l.material.opacity = 0.9;
  }
  function tickTracers(dt) { tracers.forEach(function (T) { if (T.t >= 0.09) return; T.t += dt; T.l.material.opacity = 0.9 * (1 - T.t / 0.09); if (T.t >= 0.09) T.l.visible = false; }); }

  // ------------------------------------------------------------------ capture + benefits
  function tickCapture(dt) {
    var b = 0, r = 0; teams[0].men.forEach(function (M) { if (inRing(M)) b++; }); teams[1].men.forEach(function (M) { if (inRing(M)) r++; });
    contested = b > 0 && r > 0;
    var prev = owner;
    if (!contested && (b || r)) {
      var side = b ? -1 : 1, nn = b || r, rate = dt / CAP_S * (1 + 0.15 * (nn - 1));
      cap = clamp(cap + side * rate, -1, 1);
      if (owner !== 0 && owner !== side && cap * owner <= 0) owner = 0;                  // knocked back to neutral
      if (cap <= -1) owner = -1; else if (cap >= 1) owner = 1;
    }
    if (owner !== prev) {
      if (owner) {
        stats.captures++;
        radio(owner, CALLS[String(owner)], 'Hill 402 is ours. Eyes on the whole north flank.', 2, 'cap' + owner, 8000);
        radio(-owner, CALLS[String(-owner)], 'We have lost Hill 402. Enemy has the high ground.', 2, 'lost' + -owner, 8000);
      } else radio(prev, CALLS[String(prev)], 'Hill 402 is contested. We are losing the summit.', 1, 'neu' + prev, 10000);
      if (op.flagM) op.flagM.color.copy(col(owner < 0 ? 0x2f9a66 : owner > 0 ? 0xb4473f : 0xd9d6cc));
    }
    if (owner) { intelT -= dt; if (intelT <= 0) { intelT = 10; if (LB.economy && LB.economy.grant && LB.economy.grant(owner, 'intel', 1)) stats.intel++; } } else intelT = 10;
  }
  function tickOp(dt, now) {
    if (!op.g) return;
    op.light.visible = Math.floor(now / 700) % 2 === 0;
    if (op.flag) op.flag.rotation.y = Math.sin(now / 600) * 0.25;
    var c = contested ? 0xffd36a : owner < 0 ? 0x58d08f : owner > 0 ? 0xff7b72 : 0xe8e4d8;
    op.ringM.color.setHex(c); op.ringM.opacity = contested ? 0.45 + 0.3 * Math.abs(Math.sin(now / 250)) : 0.55;
  }
  function visTick() {   // fog of war: hide enemy teams the Commander's side can't see
    var own = playerSide(), fow = LB.fow && LB.fow.isActive && LB.fow.isActive();
    teams.forEach(function (T) { if (T.side === own || !fow) { T.g.visible = true; return; } T.g.visible = T.cx != null && LB.fow.visible(T.cx, T.cz); });
  }

  // ------------------------------------------------------------------ fire missions (mortar rounds on the summit)
  function fireMission(side, who) {
    var O = side === teams[0].side ? teams[1] : teams[0];
    for (var i = 0; i < 3; i++) {
      var tg = O.men.filter(function (M) { return M.alive && Math.hypot(M.x - summit.x, M.z - summit.z) < RING_R + 4; });
      var aim = tg.length ? tg[Math.floor(Math.random() * tg.length)] : { x: summit.x + rnd(-6, 6), z: summit.z + rnd(-6, 6) };
      shells.push({ side: side, x: aim.x + rnd(-2.5, 2.5), z: aim.z + rnd(-2.5, 2.5), t: -(1.6 + i * 0.7) });
    }
    stats.fireMissions++;
    radio(side, CALLS[String(side)], who === 'cmd' ? 'Fire mission, Hill 402, three rounds. Shot, over.' : 'Mortars on the summit. Shot, over.', who === 'cmd' ? 2 : 1, 'fm' + side, 8000);
  }
  function tickShells(dt) {
    var F = LB.heavyFx;
    for (var i = shells.length - 1; i >= 0; i--) {
      var S = shells[i]; S.t += dt; if (S.t < 0) continue;
      var y = groundY(S.x, S.z);
      if (F) { F.puff({ kind: 'fire', x: S.x, y: y + 0.6, z: S.z, size: 1.6, grow: 1.6, life: 0.5, color: 0xffa040, opacity: 0.9 }); F.puff({ kind: 'dust', x: S.x, y: y + 0.5, z: S.z, vy: 3, size: 2.2, grow: 2.2, life: 2.2, color: 0x8a7d66, opacity: 0.7 }); }
      if (LB.sfx && LB.sfx.explosion) try { LB.sfx.explosion(0.45, camDist(S.x, y, S.z)); } catch (_) {}
      var O = S.side === teams[0].side ? teams[1] : teams[0];
      O.men.forEach(function (M) { if (!M.alive) return; var d = Math.hypot(M.x - S.x, M.z - S.z), cov = inCover(M, O.side) ? 0.5 : 1; if (d < 2.5) hit(M, O, cov === 1 || Math.random() < 0.6 ? 2 : 1); else if (d < 5 && Math.random() < 0.5 * cov) hit(M, O, 1); });
      shells.splice(i, 1);
    }
  }
  function aiTick(dt) {   // the AI side(s) call their own mortars when the enemy holds the hill
    var own = playerSide();
    [-1, 1].forEach(function (s) {
      var k = String(s); aiFireT[k] -= dt; if (aiFireT[k] > 0) return; aiFireT[k] = rnd(55, 85);
      if (s === own && performance.now() - lastCmdFire < 90000) return;                      // your side's mortars wait for your orders, unless you've been away 90 s
      var O = s === teams[0].side ? teams[1] : teams[0];
      if (!O.men.some(inRing)) return;
      if (LB.economy && LB.economy.isEnabled && LB.economy.isEnabled() && !LB.economy.pay(s, COST_FIRE)) return;
      fireMission(s, 'ai');
    });
  }

  // ------------------------------------------------------------------ Commander
  function myTeam() { var s = playerSide(); return teams[0].side === s ? teams[0] : teams[1]; }
  function payOk(cost) { return !(LB.economy && LB.economy.isEnabled && LB.economy.isEnabled()) || LB.economy.pay(playerSide(), cost); }
  function commandReinforce() {
    if (!ready) return note('Ridge not ready', false);
    if (cmd.rein > 0) return note('Reinforcements ready in ' + Math.ceil(cmd.rein) + ' s', false);
    var T = myTeam(), n = alive(T);
    if (T.st !== 'staging' && n >= T.n) return note(T.cs + ' is at full strength', false);
    if (!payOk(COST_REIN)) return note('Need ' + COST_REIN.ammo + ' ammo to reinforce the ridge', false);
    cmd.rein = REIN_CD; stats.rein++;
    if (T.st === 'staging' || T.st === 'retreat') { respawnTeam(T, T.cs + ', reinforced. Moving back up to Hill 402.'); }
    else { T.men.forEach(function (M) { if (!M.alive) { M.alive = true; M.hp = 2; M.fall = 0; M.t = 0; M.g.visible = true; M.g.rotation.set(0, 0, 0); var p = pointAt(T.P, Math.max(0, T.d - 12)); M.x = p.x; M.z = p.z; } }); radio(T.side, T.cs, T.cs + ', replacements joining from the trail.', 2, 'rein' + T.side, 8000); }
    return note('Ridge reinforced', true);
  }
  function commandFire() {
    if (!ready) return note('Ridge not ready', false);
    if (cmd.fire > 0) return note('Fire mission ready in ' + Math.ceil(cmd.fire) + ' s', false);
    if (!payOk(COST_FIRE)) return note('Need ' + COST_FIRE.ammo + ' ammo for a fire mission', false);
    cmd.fire = FIRE_CD; lastCmdFire = performance.now(); fireMission(playerSide(), 'cmd');
    return note('Fire mission on Hill 402: 3 rounds', true);
  }
  function note(txt, ok) { stats.last = txt; if (el.note) el.note.textContent = txt; renderUi(); return { ok: ok, text: txt }; }

  // ------------------------------------------------------------------ UI (Map → WAR SYSTEMS · RIDGE)
  function buildUi() {
    var p = doc.createElement('div'); p.id = 'ridgePanel'; p.className = 'supply-panel ridge-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · RIDGE SECTOR · HILL 402 <span class="qual sim">SIMULATED</span></div>' +
      '<div class="inv-status" id="ridgeStatus"></div>' +
      '<div class="ridge-bar" style="position:relative;height:8px;border-radius:4px;margin:6px 0;background:linear-gradient(90deg,rgba(88,208,143,.25),rgba(232,228,216,.15) 50%,rgba(255,123,114,.25))"><i id="ridgeCap" style="position:absolute;top:-2px;width:4px;height:12px;border-radius:2px;background:#ffd36a;left:50%"></i></div>' +
      '<div class="econ-actions">' +
      '<button type="button" id="ridgeRein">Reinforce ridge<small>4 ammo · refill your team</small></button>' +
      '<button type="button" id="ridgeFire">Fire mission<small>3 ammo · 3 mortar rounds · K</small></button>' +
      '<button type="button" id="ridgeView">View ridge<small>fly the camera there</small></button>' +
      '</div>' +
      '<div class="sup-row"><span id="ridgeNote" class="sup-status"></span></div>' +
      '<div class="th-note">One mountain team per side fights for the summit. Whoever holds Hill 402 earns +1 intel every 10 s and sees 85 m around it in fog of war. Game layer only — never moves the front. ?ridge=0 turns it off.</div>';
    el.p = p; el.status = p.querySelector('#ridgeStatus'); el.note = p.querySelector('#ridgeNote'); el.cap = p.querySelector('#ridgeCap');
    p.querySelector('#ridgeRein').addEventListener('click', function () { commandReinforce(); });
    p.querySelector('#ridgeFire').addEventListener('click', function () { commandFire(); });
    p.querySelector('#ridgeView').addEventListener('click', function () { try { LB.theaters.flyTo('ridge'); } catch (_) {} });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('aswPanel') || doc.getElementById('wxPanel') || doc.getElementById('uavPanel') || doc.getElementById('invasionPanel') || doc.getElementById('supplyPanel');
    var p = el.p; if (!p) return;
    if (anchor && anchor.parentNode) {
      if (p.parentNode !== anchor.parentNode || p.previousSibling !== anchor) anchor.parentNode.insertBefore(p, anchor.nextSibling);
      p.classList.toggle('floating', anchor.classList.contains('floating')); p.hidden = anchor.hidden;
    } else if (!p.parentNode) { var host = doc.querySelector('#sheet-map .sheet-body'); (host || doc.body).appendChild(p); }
  }
  var ST = { staging: 'STAGING', climb: 'CLIMBING', hold: 'ON THE SUMMIT', retreat: 'FALLING BACK' };
  function renderUi() {
    if (!el.status) return;
    var own = playerSide(), me = myTeam(), them = enemyOf(me), fow = LB.fow && LB.fow.isActive && LB.fow.isActive();
    var who = owner === 0 ? 'NEUTRAL' : owner === own ? 'YOURS' : 'ENEMY';
    var h = '<div>Hill 402: <b>' + who + '</b>' + (contested ? ' · CONTESTED' : '') + (owner === own ? ' · +1 intel / 10 s, OP vision' : '') + '</div>';
    h += '<div><b>' + me.cs + '</b> · ' + ST[me.st] + (me.st === 'staging' ? ' · ' + Math.ceil(me.t) + ' s' : ' · ' + alive(me) + '/' + me.n + ' men') + '</div>';
    h += '<div>' + them.cs + ' (enemy) · ' + (fow && !them.g.visible && them.st !== 'staging' ? 'not in sight' : ST[them.st] + (them.st === 'staging' ? '' : ' · ' + alive(them) + '/' + them.n)) + '</div>';
    h += '<div>Captures ' + stats.captures + ' · KIA ' + stats.kia + ' · fire missions ' + stats.fireMissions + ' · intel earned ' + stats.intel + '</div>';
    el.status.innerHTML = h;
    if (el.cap) el.cap.style.left = 'calc(' + ((cap + 1) * 50).toFixed(1) + '% - 2px)';
  }

  // ------------------------------------------------------------------ tick
  function update() {
    if (!enabled) return;
    var th = LB.theaters; if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { if (!build()) return; ready = true; } catch (err) { enabled = false; console.warn('[ridge] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused && e.isPaused()) return;
    if (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive()) return;
    step(dt, now);
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; placeUi(); renderUi(); }
  }
  function step(dt, now) {
    cmd.rein = Math.max(0, cmd.rein - dt); cmd.fire = Math.max(0, cmd.fire - dt);
    teams.forEach(function (T) { tickTeam(T, dt); });
    combat(dt); tickShells(dt); tickTracers(dt); tickCapture(dt); aiTick(dt); tickOp(dt, now || performance.now());
    visT -= dt; if (visT <= 0) { visT = 0.5; visTick(); }
  }

  LB.ridge = {
    version: 'v12.0.21', isEnabled: function () { return enabled && ready; }, update: update,
    reinforce: commandReinforce, fire: commandFire, groundY: groundY, height: ridgeH,
    summit: function () { return { x: summit.x, y: summit.y, z: summit.z }; },
    crest: function () { var o = []; for (var x = -90; x <= 90; x += 10) o.push({ x: x, z: crestZ(x), h: +ridgeH(x, crestZ(x)).toFixed(1) }); return o; },
    state: function () { return { owner: owner, cap: +cap.toFixed(2), contested: contested, teams: teams.map(function (T) { return { side: T.side, cs: T.cs, st: T.st, alive: alive(T), n: T.n, d: +T.d.toFixed(1), len: +T.P.len.toFixed(1), x: T.cx, z: T.cz, visible: T.g.visible }; }), cd: { rein: +cmd.rein.toFixed(1), fire: +cmd.fire.toFixed(1) } }; },
    visionFor: function (side) { var o = []; if (!ready) return o; if (owner === side) o.push({ x: summit.x, z: summit.z, r: 85 }); teams.forEach(function (T) { if (T.side === side && T.st !== 'staging' && T.cx != null) o.push({ x: T.cx, z: T.cz, r: 24 }); }); return o; },
    getStats: function () { return Object.assign({ owner: owner, cap: +cap.toFixed(2), shells: shells.length }, stats); },
    // test hooks
    _step: function (sec) { if (!ready) return false; for (var t = 0; t < sec; t += 0.05) step(0.05); renderUi(); return true; },
    _teams: function () { return teams; }, _resetCd: function () { cmd.rein = 0; cmd.fire = 0; aiFireT['-1'] = 999; aiFireT['1'] = 999; },
    _set: function (o, c) { owner = o; cap = c != null ? c : o; if (op.flagM) op.flagM.color.copy(col(owner < 0 ? 0x2f9a66 : owner > 0 ? 0xb4473f : 0xd9d6cc)); return true; },
    _hold: function (side) { var T = side === teams[0].side ? teams[0] : teams[1]; if (T.st === 'staging') respawnTeam(T); T.d = T.P.len; T.st = 'hold'; T.men.forEach(function (M) { M.placed = false; }); return true; },
    _stage: function (side, t) { var T = side === teams[0].side ? teams[0] : teams[1]; T.men.forEach(function (M) { M.g.visible = false; }); T.st = 'staging'; T.t = t == null ? 999 : t; return true; }
  };
})(window);
