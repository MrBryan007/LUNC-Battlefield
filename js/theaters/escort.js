/* LUNC Battlefield v12.0.47 — escort convoy (mission editor part 3, v12.3 "Mission editor"). Game layer.
 * start(side, need): a 3-truck convoy of your side forms up on its HQ supply road (z = -32) ~140 m behind the live front,
 * waits 5 s, then drives to 12 m behind the front following the terrain. 2 enemy ambush teams (3 when all 3 trucks are
 * needed) are dug in along the road: red ring + AMBUSH beacon + tactical-map ping. Within 14 m of a live ambush the
 * trucks take fire every 1.1 s (muzzle flash + tracer), 3 hits per truck; a destroyed truck burns as a wreck until the
 * run ends. A Commander strike within 9 m (via theaters.onStrike) clears an ambush; one of your squads within 14 m
 * suppresses it (hit chance halved). Everything is disposed on stop(). Never touches market data, armies or the front.
 * ?escort=0 → off (the editor hides the Escort objective). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('escort') !== '0';
  var ROAD_Z = -32, START_BACK = 140, STOP_BACK = 12, FORM_S = 5, SPEED = 6.5, GAP = 9, TRUCK_HP = 3;
  var AMB_R = 14, CLEAR_R = 9, FIRE_S = 1.1, HIT_P = 0.42;
  var THREE = null, run = null, raf = 0, wrapped = false, mat = null, geo = null, stats = { runs: 0, delivered: 0, lost: 0, cleared: 0, shots: 0, hits: 0, last: '' };

  function E() { return LB.engine; }
  function H(x, z) { try { return (LB.los && LB.los.ground ? LB.los.ground(x, z) : E().terrainHeight(x, z)) || 0; } catch (_) { return 0; } }
  function frontX() { try { return E().getFrontlineX() || 0; } catch (_) { return 0; } }
  function night() { return !!(doc.body && doc.body.classList.contains('night')); }
  function FX() { return LB.heavyFx && LB.heavyFx.puff ? LB.heavyFx : null; }
  function camDist(x, z) { try { var c = E().camera.position; return Math.hypot(c.x - x, c.z - z); } catch (_) { return 999; } }
  function note(k, a) { try { if (LB.replay && LB.replay.event) LB.replay.event('escort', a); } catch (_) {} stats.last = a; }
  function ensureAssets() {
    if (mat) return; THREE = E().THREE;
    geo = { cab: new THREE.BoxGeometry(1.9, 1.7, 2.1), bed: new THREE.BoxGeometry(2.1, 1.9, 4.2), wheel: new THREE.CylinderGeometry(0.46, 0.46, 0.35, 10),
      ring: new THREE.RingGeometry(AMB_R - 0.8, AMB_R, 48), core: new THREE.RingGeometry(CLEAR_R - 0.5, CLEAR_R, 40), beam: new THREE.CylinderGeometry(0.3, 0.8, 20, 10, 1, true),
      lamp: new THREE.SphereGeometry(0.16, 6, 5), tracer: new THREE.BoxGeometry(0.08, 0.08, 1), flash: new THREE.SphereGeometry(0.35, 6, 5), man: new THREE.BoxGeometry(0.5, 0.5, 1.1) };
    mat = { cab: { '-1': new THREE.MeshStandardMaterial({ color: 0x4f5b3a, roughness: 0.8 }), '1': new THREE.MeshStandardMaterial({ color: 0x5d564a, roughness: 0.8 }) },
      tarp: new THREE.MeshStandardMaterial({ color: 0x6f6a4e, roughness: 0.95 }), wheel: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.9 }),
      wreck: new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 1 }), lamp: new THREE.MeshBasicMaterial({ color: 0xfff1c4 }),
      amb: new THREE.MeshBasicMaterial({ color: 0xff5a4f, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
      ambCore: new THREE.MeshBasicMaterial({ color: 0xffb0a8, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
      beam: new THREE.MeshBasicMaterial({ color: 0xff5a4f, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
      tracer: new THREE.MeshBasicMaterial({ color: 0xffd08a }), flash: new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9 }),
      man: new THREE.MeshStandardMaterial({ color: 0x3b3a33, roughness: 1 }) };
  }
  function makeTruck(side) {
    var g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    var cab = new THREE.Mesh(geo.cab, mat.cab[String(side)]); cab.position.set(0, 1.35, 2.3); body.add(cab);
    var bed = new THREE.Mesh(geo.bed, mat.tarp); bed.position.set(0, 1.45, -0.9); body.add(bed);
    var wheels = [];
    [[-1, 2.2], [1, 2.2], [-1, -0.4], [1, -0.4], [-1, -2.0], [1, -2.0]].forEach(function (w) { var m = new THREE.Mesh(geo.wheel, mat.wheel); m.rotation.z = Math.PI / 2; m.position.set(w[0] * 1.0, 0.46, w[1]); body.add(m); wheels.push(m); });
    var lamps = [-0.6, 0.6].map(function (lx) { var l = new THREE.Mesh(geo.lamp, mat.lamp); l.position.set(lx, 1.0, 3.38); body.add(l); return l; });
    return { g: g, body: body, cab: cab, bed: bed, wheels: wheels, lamps: lamps, hp: TRUCK_HP, st: 'form', x: 0, z: ROAD_Z, smokeT: 0 };
  }
  function makeAmbush(x, z) {
    var g = new THREE.Group(), y = H(x, z); g.position.set(x, y, z);
    var ring = new THREE.Mesh(geo.ring, mat.amb.clone()); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    var core = new THREE.Mesh(geo.core, mat.ambCore); core.rotation.x = -Math.PI / 2; core.position.y = 0.32; g.add(core);
    var beam = new THREE.Mesh(geo.beam, mat.beam); beam.position.y = 10; g.add(beam);
    var men = []; for (var i = 0; i < 3; i++) { var m = new THREE.Mesh(geo.man, mat.man); var a = i * 2.1; m.position.set(Math.cos(a) * 2.2, 0.25, (z > ROAD_Z ? 3.5 : -3.5) + Math.sin(a) * 1.2); g.add(m); men.push(m); }
    return { g: g, ring: ring, beam: beam, men: men, x: x, z: z + (z > ROAD_Z ? 3.5 : -3.5), alive: true, fireT: Math.random() * FIRE_S, sup: false };
  }
  /** Start an escort for `side` (-1 Bulls, 1 Bears). need = trucks that must arrive (1-3). */
  function start(side, need) {
    if (!enabled || !E() || !E().scene) return false;
    stop(true); ensureAssets();
    side = side === 1 ? 1 : -1; need = Math.max(1, Math.min(3, need | 0 || 2));
    var fx = frontX(), x0 = fx + side * START_BACK, x1 = fx + side * STOP_BACK, root = new THREE.Group(); root.name = 'escort'; E().scene.add(root);
    var trucks = []; for (var i = 0; i < 3; i++) { var T = makeTruck(side); T.x = x0 + side * i * GAP; T.z = ROAD_Z; place(T, side, 0); root.add(T.g); trucks.push(T); }
    var nA = need >= 3 ? 3 : 2, ambs = [];
    for (var k = 0; k < nA; k++) { var f = 0.3 + 0.45 * (nA === 1 ? 0.5 : k / (nA - 1)), ax = x0 + (x1 - x0) * f + (Math.random() - 0.5) * 8, az = ROAD_Z + (k % 2 ? 6 : -6); var A = makeAmbush(ax, az); root.add(A.g); ambs.push(A); try { if (LB.tacmap && LB.tacmap.ping) LB.tacmap.ping(ax, az); } catch (_) {} }
    run = { side: side, need: need, x0: x0, x1: x1, root: root, trucks: trucks, ambs: ambs, t: 0, last: performance.now(), tracers: [], done: false, result: null };
    stats.runs++; stats.last = 'Convoy forming up';
    wrapStrikes(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    return true;
  }
  function place(T, side, dt) {
    var dir = -side, y = H(T.x, T.z), yb = H(T.x - dir * 2, T.z), yf = H(T.x + dir * 2, T.z);   // dir: travel direction (toward the front)
    T.g.position.set(T.x, y, T.z); T.g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    T.body.rotation.x = -Math.atan2(yf - yb, 4) * 0.9;
  }
  function stop(silent) {
    cancelAnimationFrame(raf); raf = 0; if (!run) return false;
    try { run.root.parent && run.root.parent.remove(run.root); run.ambs.forEach(function (A) { A.ring.material.dispose(); }); } catch (_) {}   // shared geometry / materials are kept for the next run
    run = null; return true;
  }
  function wrapStrikes() {
    var th = LB.theaters; if (wrapped || !th || !th.onStrike) return; wrapped = true;
    var orig = th.onStrike;
    th.onStrike = function (x, z, power) { try { onImpact(x, z, power || 1); } catch (_) {} return orig.apply(this, arguments); };
  }
  function onImpact(x, z, power) {
    if (!run) return 0; var n = 0;
    run.ambs.forEach(function (A, i) {
      if (!A.alive || Math.hypot(A.x - x, A.z - z) > CLEAR_R * Math.max(1, Math.sqrt(power))) return;
      A.alive = false; n++; stats.cleared++; A.ring.material.color.setHex(0x7a7a7a); A.ring.material.opacity = 0.25; A.beam.visible = false;
      A.men.forEach(function (m) { m.rotation.z = Math.PI / 2; m.position.y = 0.15; m.material = mat.wreck; });
      note('clear', 'Ambush ' + (i + 1) + ' cleared');
    });
    return n;
  }
  function loop() {
    if (!run) return; raf = requestAnimationFrame(loop);
    var now = performance.now(), dt = Math.min(0.1, (now - run.last) / 1000); run.last = now;
    var paused = false; try { paused = E().isPaused() || (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive()); } catch (_) {}
    if (paused || run.done) { fadeTracers(dt); return; }
    step(dt);
  }
  function step(dt) {
    var R = run, side = R.side, dir = -side; R.t += dt;
    var fx = frontX(); R.x1 = fx + side * STOP_BACK;
    var nightOn = night(), F = FX(), sq = [];
    try { sq = LB.squads && LB.squads.list ? LB.squads.list().filter(function (q) { return q.side === side && !q.dead && q.alive > 0; }) : []; } catch (_) {}
    R.ambs.forEach(function (A) {
      A.ring.material.opacity = A.alive ? 0.5 + 0.25 * Math.sin(R.t * 4) : 0.25;
      A.sup = A.alive && sq.some(function (q) { return Math.hypot(q.x - A.x, q.z - A.z) <= AMB_R; });
    });
    for (var i = 0; i < R.trucks.length; i++) {
      var T = R.trucks[i]; T.lamps.forEach(function (l) { l.visible = nightOn && T.hp > 0; });
      if (T.hp <= 0) { T.smokeT -= dt; if (F && T.smokeT <= 0) { T.smokeT = 0.35; F.puff({ kind: 'smoke', x: T.x, y: 2.2, z: T.z, vy: 1.4, size: 2.2, grow: 1.4, life: 3, color: 0x2a2724, opacity: 0.5 }); } continue; }
      if (T.st === 'form' && R.t >= FORM_S) { T.st = 'drive'; if (i === 0) note('roll', 'Convoy rolling'); }
      if (T.st === 'drive') {
        var lead = null; for (var j = i - 1; j >= 0; j--) if (R.trucks[j].hp > 0 && R.trucks[j].st !== 'arrived') { lead = R.trucks[j]; break; }
        var goal = R.x1 + side * (R.trucks.filter(function (o, k) { return k < i && o.st === 'arrived'; }).length * GAP * 0.8);
        var limit = lead ? lead.x + side * GAP : goal, dist = (limit - T.x) * dir, v = Math.max(0, Math.min(SPEED, dist * 1.2));
        T.x += dir * v * dt; T.wheels.forEach(function (w) { w.rotation.x += v * dt / 0.46; });
        if (!lead && (goal - T.x) * dir <= 0.6) { T.st = 'arrived'; stats.delivered++; note('arrive', 'Truck ' + (i + 1) + ' reached the front'); }
        if (F && v > 1 && Math.random() < dt * 6) F.puff({ kind: 'dust', x: T.x - dir * 2.6, y: 0.4, z: T.z + (Math.random() - 0.5), size: 1.2, grow: 1.2, life: 1.2, color: 0x9a8a6a, opacity: 0.35 });
        place(T, side, dt);
      }
    }
    // ambush fire at the nearest live truck in range
    R.ambs.forEach(function (A) {
      if (!A.alive) return; A.fireT -= dt; if (A.fireT > 0) return; A.fireT = FIRE_S * (0.85 + Math.random() * 0.3);
      var tgt = null, best = AMB_R; R.trucks.forEach(function (T) { if (T.hp <= 0 || T.st === 'arrived') return; var d = Math.hypot(T.x - A.x, T.z - A.z); if (d <= best) { best = d; tgt = T; } });
      if (!tgt) return; stats.shots++;
      var hit = Math.random() < HIT_P * (A.sup ? 0.5 : 1); tracer(A, tgt, hit);
      if (hit) { tgt.hp--; stats.hits++; if (tgt.hp <= 0) kill(tgt); }
    });
    fadeTracers(dt);
    var alive = R.trucks.filter(function (T) { return T.hp > 0; }).length, arrived = R.trucks.filter(function (T) { return T.st === 'arrived'; }).length;
    R.arrived = arrived; R.alive = alive;
    if (arrived >= R.need) { R.done = true; R.result = 'won'; }
    else if (alive < R.need) { R.done = true; R.result = 'lost'; }
  }
  function kill(T) {
    T.hp = 0; T.st = 'dead'; stats.lost++;
    [T.cab, T.bed].forEach(function (m) { m.material = mat.wreck; }); T.body.rotation.z = 0.12; T.body.position.y = -0.2;
    try { var e = E(); if (e.effects && e.effects.createExplosion) e.effects.createExplosion(T.x, T.z, 0xff8a3a, 0.6, false); } catch (_) {}
    var F = FX(); if (F) for (var k = 0; k < 4; k++) F.puff({ kind: 'fire', x: T.x + (Math.random() - 0.5) * 2, y: 1.6, z: T.z + (Math.random() - 0.5) * 2, vy: 1.5, size: 1.6, grow: 0.8, life: 1.4, color: 0xffa040, opacity: 0.8, flicker: true });
    note('lost', 'Truck lost in an ambush');
    try { var cd = camDist(T.x, T.z); if (LB.sfx && LB.sfx.explosion && cd < 240) LB.sfx.explosion(0.5, cd, { x: T.x, y: 1, z: T.z }); } catch (_) {}
  }
  function tracer(A, T, hit) {
    if (!run) return; var y0 = H(A.x, A.z) + 0.6, y1 = H(T.x, T.z) + 1.4;
    var m = new THREE.Mesh(geo.tracer, mat.tracer), fl = new THREE.Mesh(geo.flash, mat.flash);
    var tx = T.x + (hit ? 0 : (Math.random() - 0.5) * 6), tz = T.z + (hit ? 0 : (Math.random() - 0.5) * 6);
    m.position.set(A.x, y0, A.z); m.lookAt(tx, y1, tz); m.userData = { fx: A.x, fy: y0, fz: A.z, tx: tx, ty: y1, tz: tz, t: 0 };
    fl.position.set(A.x, y0, A.z); fl.userData = { t: 0, flash: true };
    run.root.add(m); run.root.add(fl); run.tracers.push(m, fl);
    try { var cd = camDist(A.x, A.z); if (LB.sfx && LB.sfx.gunfire && cd < 140) LB.sfx.gunfire(Math.min(1, cd / 90), { x: A.x, y: y0, z: A.z }); } catch (_) {}
  }
  function fadeTracers(dt) {
    if (!run) return;
    for (var i = run.tracers.length - 1; i >= 0; i--) {
      var o = run.tracers[i], u = o.userData; u.t += dt;
      if (u.flash) { o.scale.setScalar(1 + u.t * 6); if (u.t > 0.08) { run.root.remove(o); run.tracers.splice(i, 1); } continue; }
      var k = Math.min(1, u.t / 0.22); o.position.set(u.fx + (u.tx - u.fx) * k, u.fy + (u.ty - u.fy) * k, u.fz + (u.tz - u.fz) * k);
      if (k >= 1) { run.root.remove(o); run.tracers.splice(i, 1); }
    }
  }
  function nextAmbush() {
    if (!run) return null; var lead = run.trucks.filter(function (T) { return T.hp > 0 && T.st !== 'arrived'; })[0], lx = lead ? lead.x : run.x0, s = -run.side, best = null;
    run.ambs.forEach(function (A) { if (!A.alive) return; var d = (A.x - lx) * s; if (!best || (d >= -AMB_R && d < best.d) || best.d < -AMB_R) best = { x: A.x, z: A.z, d: d }; });
    return best;
  }
  function state() {
    if (!run) return { enabled: enabled, active: false, stats: Object.assign({}, stats) };
    var lead = run.trucks.filter(function (T) { return T.hp > 0 && T.st !== 'arrived'; })[0];
    return { enabled: enabled, active: true, side: run.side, need: run.need, arrived: run.arrived | 0, alive: run.alive == null ? 3 : run.alive, done: run.done, result: run.result,
      forming: run.t < FORM_S, leadDist: lead ? Math.round(Math.abs(run.x1 - lead.x)) : 0, ambushes: run.ambs.filter(function (A) { return A.alive; }).length,
      ambs: run.ambs.map(function (A) { return { x: +A.x.toFixed(1), z: +A.z.toFixed(1), alive: A.alive, sup: A.sup }; }),
      trucks: run.trucks.map(function (T) { return { x: +T.x.toFixed(1), hp: T.hp, st: T.st }; }), stats: Object.assign({}, stats) };
  }
  LB.escort = { version: 'v12.0.47', isEnabled: function () { return enabled; }, start: start, stop: stop, state: state, nextAmbush: nextAmbush, _impact: onImpact,
    _step: function (sec) { if (!run) return; for (var t = 0; t < sec; t += 0.05) { if (run.done) break; step(0.05); } } };
})(window);
