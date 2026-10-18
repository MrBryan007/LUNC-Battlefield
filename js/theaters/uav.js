/* LUNC Battlefield v12.0.17 — UAV recon & strike drones (v12.1: deepen the basic v12.0 drones). Game/sim layer.
 * Takes over the v12.0 orbiting drone boxes (js/theaters/extras.js) and turns them into tasked MALE drones:
 *  · own procedural airframe (long straight wing, V-tail, sensor ball, spinning pusher prop, nav lights), banks in turns
 *  · tasking: fly to a task point and orbit it; each side's AI re-tasks every 25–40 s (front / enemy ships / depots /
 *    forward defenses); the Commander tasks their side's drone to the camera point (Map → WAR SYSTEMS · UAV, or U)
 *  · sensor footprint (36 m, IR so night doesn't cut it; fog ×0.6, rain ×0.8) spots enemy ships, parked jets, defenses
 *    and depots → SPOT markers on the tactical map for 20 s + a radio call with a grid reference
 *  · two missiles per sortie: "RIFLE" → a visible smoke-trailed pursuit → hit through LB.theaters.onStrike (small power)
 *    → "SPLASH"; empty = "WINCHESTER" → RTB to its airbase, rearm 20 s, relaunch
 *  · enemy AA (airbase, base AA defenses, warships) can shoot it down; it spirals down trailing smoke and a new one
 *    launches 40 s later ("<callsign> down")
 * Never alters price, armies, the frontline or data labels (SIMULATED). ?uav=0 (or ?theaters=0) → v12.0 orbit boxes. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('uav') !== '0' && qs.get('theaters') !== '0';
  var E = function () { return LB.engine; }, TH = function () { return LB.theaters; };
  var BASE_X = 205, BASE_Z = -55, HQX = 96, ORBIT_R = 22, SENSOR_R = 36, WPN_R = 46, AMMO = 2, REARM_S = 20, RESPAWN_S = 40;
  var CRUISE = 14, ORBIT_V = 10, TURN = 0.62, SPOT_TTL = 20000, CMD_CD = 12;
  var CALLS = { '-1': ['Reaper 1-1', 'Reaper 1-2'], '1': ['Shadow 2-1', 'Shadow 2-2'] };
  var THREE = null, ready = false, last = 0, list = [], missiles = [], spots = {}, el = {}, cmdCd = 0, uiT = 0, sayT = { '-1': 0, '1': 0 };
  var stats = { drones: 0, spotted: 0, fired: 0, hits: 0, downs: 0, rearms: 0, tasks: 0, cmdTasks: 0, last: '' };
  var low = function () { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bear' ? 1 : -1; } catch (_) { return -1; } }
  function wmult() { var w = 'clear'; try { w = LB.v12extras.getOptions().weather; } catch (_) {} return w === 'fog' ? 0.6 : w === 'rain' ? 0.8 : 1; }
  function grid(x, z) { try { return LB.tacmap && LB.tacmap.gridRef ? LB.tacmap.gridRef(x, z) : Math.round(x) + ',' + Math.round(z); } catch (_) { return Math.round(x) + ',' + Math.round(z); } }
  function wrap(a) { while (a > Math.PI) a -= 6.2832; while (a < -Math.PI) a += 6.2832; return a; }
  function radio(side, cs, text, pri) {
    if (!LB.voice || !LB.voice.say) return;
    var own = side === playerSide();
    try { LB.voice.say({ pri: pri != null ? pri : (own ? 2 : 1), side: side, callsign: cs, text: text, intercepted: !own, tag: 'SIMULATED' }); } catch (_) {}
  }
  function col(hex) { var c = new THREE.Color(hex); if (c.convertSRGBToLinear) c.convertSRGBToLinear(); return c; }

  // ------------------------------------------------------------------ airframe
  var GEO = null, MAT = null;
  function buildModel(side) {
    if (!GEO) {
      GEO = { box: new THREE.BoxGeometry(1, 1, 1), fus: new THREE.CylinderGeometry(0.34, 0.2, 4.6, 10), ball: new THREE.SphereGeometry(0.26, 10, 8), nav: new THREE.SphereGeometry(0.09, 6, 4),
        prop: new THREE.BoxGeometry(1.5, 0.08, 0.05), msl: new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6) };
      GEO.fus.rotateX(Math.PI / 2); GEO.msl.rotateX(Math.PI / 2);
      MAT = { body: new THREE.MeshStandardMaterial({ color: col(0x8d9399), roughness: 0.55, metalness: 0.25 }), dark: new THREE.MeshStandardMaterial({ color: col(0x2c3034), roughness: 0.5, metalness: 0.4 }),
        glass: new THREE.MeshStandardMaterial({ color: col(0x1d2a33), roughness: 0.15, metalness: 0.6 }),
        bull: new THREE.MeshStandardMaterial({ color: col(0x3fae6a), roughness: 0.6 }), bear: new THREE.MeshStandardMaterial({ color: col(0xc8574b), roughness: 0.6 }),
        red: new THREE.MeshBasicMaterial({ color: 0xff3a2a }), green: new THREE.MeshBasicMaterial({ color: 0x3aff6a }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
    }
    var g = new THREE.Group(); g.name = 'uav-airframe';
    function m(geo, mat, x, y, z, sx, sy, sz) { var o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); if (sx != null) o.scale.set(sx, sy, sz); g.add(o); return o; }
    m(GEO.fus, MAT.body, 0, 0, 0);                                   // fuselage (nose → +Z)
    m(GEO.box, MAT.body, 0, 0.18, 2.0, 0.5, 0.28, 0.9);              // satcom hump
    m(GEO.ball, MAT.glass, 0, -0.32, 1.9);                           // EO/IR sensor ball
    m(GEO.box, MAT.body, 0, 0.12, 0.2, 8.2, 0.08, 0.62);              // long straight wing
    var vt = m(GEO.box, MAT.body, -0.55, 0.42, -2.0, 0.06, 0.9, 0.55); vt.rotation.z = 0.75;   // V-tail
    var vt2 = m(GEO.box, MAT.body, 0.55, 0.42, -2.0, 0.06, 0.9, 0.55); vt2.rotation.z = -0.75;
    m(GEO.box, MAT.body, 0, -0.42, -1.9, 0.05, 0.5, 0.4);            // ventral fin
    m(GEO.box, side < 0 ? MAT.bull : MAT.bear, 0, 0.36, -1.55, 0.12, 0.05, 0.5);   // IFF stripe
    var prop = m(GEO.prop, MAT.dark, 0, 0, -2.4); prop.name = 'uav-prop';
    var r1 = m(GEO.msl, MAT.dark, -1.9, -0.18, 0.3), r2 = m(GEO.msl, MAT.dark, 1.9, -0.18, 0.3);   // two missiles on the rails
    var nav = [];
    if (!low()) { nav.push(m(GEO.nav, MAT.red, -4.1, 0.12, 0.2)); nav.push(m(GEO.nav, MAT.green, 4.1, 0.12, 0.2)); var st = m(GEO.nav, MAT.white, 0, 0.5, -2.2); st.name = 'uav-strobe'; nav.push(st); }
    g.scale.setScalar(0.92);
    return { g: g, prop: prop, rails: [r1, r2], strobe: nav[2] || null };
  }

  // ------------------------------------------------------------------ setup
  function build() {
    var ex = LB.v12extras; if (!ex || !ex._droneList) return false;
    var raw = ex._droneList(); if (!raw || !raw.length) return false;
    THREE = E().THREE;
    var bySide = { '-1': 0, '1': 0 };
    raw.forEach(function (d) {
      d.ctl = true;                                     // extras.js stops its fixed orbit for this drone
      d.g.children.forEach(function (c) { c.visible = false; });
      var M = buildModel(d.side); d.g.add(M.g);
      var k = bySide[String(d.side)]++, x = d.side * BASE_X + (k ? 8 : -8), z = BASE_Z + 6;
      var D = { d: d, g: d.g, M: M, side: d.side, cs: CALLS[String(d.side)][k] || CALLS[String(d.side)][0], idx: k,
        x: d.g.position.x || x, y: d.g.position.y || 30, z: d.g.position.z || z, hd: d.side < 0 ? Math.PI / 2 : -Math.PI / 2, bank: 0, v: CRUISE,
        st: 'transit', task: null, ammo: AMMO, cd: rnd(8, 18), t: 0, retask: rnd(1, 6), alt: rnd(30, 36), sense: 0, threat: 0 };
      list.push(D);
    });
    buildUi();
    global.addEventListener('keydown', function (e) {
      if (!enabled || !ready) return;
      if (e.target && (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyU') commandTask();
    });
    return true;
  }

  // ------------------------------------------------------------------ targets & tasking
  function frontX() { try { return E().getFrontlineX() || 0; } catch (_) { return 0; } }
  function enemyTargets(side) {   // live theater targets of the other side: { kind, x, z, ref }
    var out = [], th = TH();
    try { th._ships().forEach(function (S) { if (S.side !== side && S.st === 'sail') out.push({ kind: 'ship', x: S.x, z: S.z, o: S, label: S.kind === 'carrier' ? 'carrier' : S.kind === 'battleship' ? 'battleship' : 'destroyer' }); }); } catch (_) {}
    try { th._jets().forEach(function (J) { if (J.side !== side && J.st === 'parked' && J.g.visible) out.push({ kind: 'jet', x: J.x, z: J.z, o: J, label: 'jet on the apron' }); }); } catch (_) {}
    try { if (LB.lines && LB.lines.depots) LB.lines.depots().forEach(function (d) { if (d.side !== side && d.hp > 0) out.push({ kind: 'depot', x: d.x, z: d.z, label: d.role + ' depot' }); }); } catch (_) {}
    try { if (LB.baseInvasion && LB.baseInvasion._forEachDefense) LB.baseInvasion._forEachDefense(function (m) { var u = m.userData; if (u.side !== side && !u.wreck && u.kind !== 'wall') out.push({ kind: 'defense', x: m.position.x, z: m.position.z, o: m, sub: u.kind, label: u.kind + ' position' }); }); } catch (_) {}
    return out;
  }
  function aiTask(D) {
    var side = D.side, fx = frontX(), opts = [], tg = enemyTargets(side);
    opts.push({ w: 3, x: fx - side * rnd(18, 34), z: rnd(-60, 30), kind: 'front' });
    var ships = tg.filter(function (t) { return t.kind === 'ship'; }); if (ships.length) { var s = ships[(Math.random() * ships.length) | 0]; opts.push({ w: 2.2, x: s.x, z: s.z, kind: 'ships', follow: s.o }); }
    var dep = tg.filter(function (t) { return t.kind === 'depot'; }); if (dep.length) { var p = dep[(Math.random() * dep.length) | 0]; opts.push({ w: 1.4, x: p.x, z: p.z, kind: 'depot' }); }
    opts.push({ w: 0.9, x: -side * (HQX - rnd(10, 22)), z: rnd(-22, 22), kind: 'defenses' });
    if (D.idx === 1 && opts.length > 1) opts[0].w = 1.5;   // the second drone favours the other jobs
    var sum = 0, i; for (i = 0; i < opts.length; i++) sum += opts[i].w; var r = Math.random() * sum;
    for (i = 0; i < opts.length; i++) { r -= opts[i].w; if (r <= 0) break; }
    var o = opts[Math.min(i, opts.length - 1)];
    D.task = { x: o.x, z: o.z, kind: o.kind, by: 'ai', follow: o.follow || null };
    D.retask = rnd(25, 40); stats.tasks++;
  }
  function ownAlive(side) { return list.filter(function (D) { return D.side === side && (D.st === 'transit' || D.st === 'orbit' || D.st === 'launch'); }); }
  function commandTask(x, z) {
    if (!ready) return { ok: false, why: 'not ready' };
    if (cmdCd > 0) return note('UAV re-task ready in ' + Math.ceil(cmdCd) + ' s', false);
    if (x == null) { var T = E().getCameraTarget(); x = T.x; z = T.z; }
    var B = (TH() && TH().bounds) || { minX: -260, maxX: 260, minZ: -120, maxZ: 230 };
    x = Math.max(B.minX + 10, Math.min(B.maxX - 10, x)); z = Math.max(B.minZ + 10, Math.min(B.maxZ - 10, z));
    var side = playerSide(), mine = ownAlive(side);
    if (!mine.length) return note('No UAV airborne — next one is rearming or launching', false);
    mine.sort(function (a, b) { return Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z); });
    var D = mine[0];
    D.task = { x: x, z: z, kind: 'commander', by: 'cmdr', until: performance.now() + 45000 }; D.retask = 45; D.st = D.st === 'orbit' ? 'transit' : D.st;
    cmdCd = CMD_CD; stats.cmdTasks++;
    var eta = Math.max(1, Math.round(Math.hypot(D.x - x, D.z - z) / CRUISE));
    radio(side, D.cs, D.cs + ', copy. Tasked to grid ' + grid(x, z) + ', on station in ' + eta + ' seconds.', 2);
    if (LB.tacmap && LB.tacmap.ping) try { LB.tacmap.ping(x, z); } catch (_) {}
    return note(D.cs + ' tasked to ' + grid(x, z) + ' (ETA ' + eta + ' s)', true, D);
  }
  function commandStrike() {
    var side = playerSide(), mine = ownAlive(side).filter(function (D) { return D.ammo > 0; }), best = null;
    mine.forEach(function (D) { var t = pickStrike(D); if (t && (!best || t.d < best.t.d)) best = { D: D, t: t }; });
    if (!best) return note(mine.length ? 'No spotted target in missile range — task the UAV closer' : 'No armed UAV airborne', false);
    fire(best.D, best.t); return note(best.D.cs + ': rifle on the ' + best.t.label, true);
  }
  function note(txt, ok, D) { stats.last = txt; if (el.note) el.note.textContent = txt; renderUi(true); return { ok: ok, text: txt, drone: D ? D.cs : null }; }

  // ------------------------------------------------------------------ sensor, weapons, threats
  function sense(D) {
    var r = SENSOR_R * wmult(), r2 = r * r, tg = enemyTargets(D.side), now = performance.now(), fresh = [];
    for (var i = 0; i < tg.length; i++) {
      var t = tg[i], dx = t.x - D.x, dz = t.z - D.z; if (dx * dx + dz * dz > r2) continue;
      var key = t.kind + ':' + (t.kind === 'ship' || t.kind === 'jet' ? (TH()._ships().indexOf(t.o) + '/' + TH()._jets().indexOf(t.o)) : Math.round(t.x) + ',' + Math.round(t.z));
      if (!spots[key] || now - spots[key].t > SPOT_TTL) { fresh.push(t); stats.spotted++; }
      spots[key] = { x: t.x, z: t.z, kind: t.kind, side: -D.side, by: D.side, t: now, label: t.label };
    }
    for (var k in spots) if (now - spots[k].t > SPOT_TTL) delete spots[k];
    if (fresh.length && now - sayT[String(D.side)] > 18000) {
      sayT[String(D.side)] = now;
      var kinds = {}; fresh.forEach(function (t) { kinds[t.label] = (kinds[t.label] || 0) + 1; });
      var words = Object.keys(kinds).slice(0, 2).map(function (l) { return kinds[l] + ' ' + l + (kinds[l] > 1 ? 's' : ''); }).join(', ');
      radio(D.side, D.cs, D.cs + ', contact. ' + words + ', grid ' + grid(fresh[0].x, fresh[0].z) + '.');
    }
  }
  function pickStrike(D) {
    var best = null, now = performance.now(), prio = { ship: 0, defense: 1, depot: 2, jet: 3 };
    var r = WPN_R * (0.85 + 0.15 * wmult());
    enemyTargets(D.side).forEach(function (t) {
      var d = Math.hypot(t.x - D.x, t.z - D.z); if (d > r) return;
      var seen = false; for (var k in spots) { var s = spots[k]; if (now - s.t < SPOT_TTL && Math.abs(s.x - t.x) < 8 && Math.abs(s.z - t.z) < 8) { seen = true; break; } }
      if (!seen) return;
      var sc = prio[t.kind] * 40 + d; if (!best || sc < best.sc) { best = t; best.sc = sc; best.d = d; }
    });
    return best;
  }
  function fire(D, t) {
    if (D.ammo <= 0) return false;
    D.ammo--; D.cd = rnd(40, 60); stats.fired++;
    var rail = D.M.rails[D.ammo] || D.M.rails[0]; if (rail) rail.visible = false;
    var m = new THREE.Mesh(GEO.msl, MAT.dark); m.position.set(D.x, D.y - 0.4, D.z); m.name = 'uav-missile'; E().scene.add(m);
    missiles.push({ m: m, x: D.x, y: D.y - 0.4, z: D.z, vx: Math.sin(D.hd) * D.v, vy: -2, vz: Math.cos(D.hd) * D.v, t: 0, tgt: t, side: D.side, cs: D.cs, trailT: 0 });
    radio(D.side, D.cs, D.cs + ', rifle, rifle. One away on the ' + t.label + '.', D.side === playerSide() ? 2 : 1);
    if (LB.sfx && LB.sfx.blip) try { LB.sfx.blip(); } catch (_) {}
    return true;
  }
  function tgtPos(t) {
    if (t.kind === 'ship' && t.o) return { x: t.o.x, y: 1.4, z: t.o.z, alive: t.o.st === 'sail' };
    if (t.kind === 'jet' && t.o) return { x: t.o.x, y: 0.6, z: t.o.z, alive: t.o.st === 'parked' };
    if (t.kind === 'defense' && t.o) return { x: t.o.position.x, y: 1.2, z: t.o.position.z, alive: !t.o.userData.wreck };
    return { x: t.x, y: 1, z: t.z, alive: true };
  }
  function tickMissiles(dt) {
    var F = LB.heavyFx, lo = low();
    for (var i = missiles.length - 1; i >= 0; i--) {
      var M = missiles[i], p = tgtPos(M.tgt); M.t += dt;
      var dx = p.x - M.x, dy = p.y - M.y, dz = p.z - M.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, sp = Math.min(62, 18 + M.t * 40);
      var k = Math.min(1, dt * 4.5);   // pursuit: steer the velocity onto the line of sight
      M.vx += (dx / d * sp - M.vx) * k; M.vy += (dy / d * sp - M.vy) * k; M.vz += (dz / d * sp - M.vz) * k;
      M.x += M.vx * dt; M.y += M.vy * dt; M.z += M.vz * dt;
      M.m.position.set(M.x, M.y, M.z); M.m.lookAt(M.x + M.vx, M.y + M.vy, M.z + M.vz);
      M.trailT -= dt; if (F && !lo && M.trailT <= 0) { M.trailT = 0.035; F.puff({ kind: 'smoke', x: M.x, y: M.y, z: M.z, size: 0.45, grow: 1.6, life: 1.4, color: 0xd9d6cf, opacity: 0.55, drag: 0.9 }); }
      if (d < 1.6 || M.y <= 0.2 || M.t > 7) {
        E().scene.remove(M.m); missiles.splice(i, 1);
        var hit = d < 3.5 && p.alive;
        var ix = hit ? p.x : M.x, iz = hit ? p.z : M.z;
        if (F) { F.puff({ kind: 'fire', x: ix, y: 1.2, z: iz, size: 2.4, grow: 0.8, life: 0.5, color: 0xffa040, opacity: 0.95, flicker: true }); F.puff({ kind: 'smoke', x: ix, y: 1.6, z: iz, vy: 2.5, size: 2.2, grow: 1.4, life: 3.2, color: 0x4a4540, opacity: 0.6 }); }
        try { if (TH().isWater && TH().isWater(ix, iz) && !hit) TH().splash(ix, iz, 1); else TH().onStrike(ix, iz, 0.55); } catch (_) {}
        if (hit) stats.hits++;
        radio(M.side, M.cs, hit ? M.cs + ', splash. Good hit on the ' + M.tgt.label + '.' : M.cs + ', miss, round impacted short.', M.side === playerSide() ? 2 : 1);
      }
    }
  }
  function threatAt(D) {   // per-second chance an enemy air-defence envelope gets the drone
    var side = D.side, p = 0, th = TH();
    if (Math.hypot(D.x - (-side * BASE_X), D.z - BASE_Z) < 60) p += 0.035;   // enemy airbase AA
    try { if (LB.baseInvasion && LB.baseInvasion._forEachDefense) LB.baseInvasion._forEachDefense(function (m) { var u = m.userData; if (u.side !== side && !u.wreck && u.kind === 'aa' && Math.hypot(m.position.x - D.x, m.position.z - D.z) < 42) p += 0.03; }); } catch (_) {}
    try { th._ships().forEach(function (S) { if (S.side !== side && S.st === 'sail' && Math.hypot(S.x - D.x, S.z - D.z) < 34) p += S.kind === 'destroyer' ? 0.025 : 0.015; }); } catch (_) {}
    return Math.min(0.12, p * (0.6 + 0.4 * wmult()));
  }

  // ------------------------------------------------------------------ flight
  function steer(D, hdDes, v, dt) {
    var dh = wrap(hdDes - D.hd), turn = Math.max(-TURN * dt, Math.min(TURN * dt, dh));
    D.hd = wrap(D.hd + turn); D.v += (v - D.v) * Math.min(1, dt * 0.8);
    var omega = turn / Math.max(1e-4, dt), bankDes = Math.max(-0.55, Math.min(0.55, Math.atan(D.v * omega / 9.81)));
    D.bank += (bankDes - D.bank) * Math.min(1, dt * 2.5);
    D.x += Math.sin(D.hd) * D.v * dt; D.z += Math.cos(D.hd) * D.v * dt;
  }
  function tickDrone(D, dt) {
    var F = LB.heavyFx, home = { x: D.side * BASE_X + (D.idx ? 8 : -8), z: BASE_Z + 6 };
    if (D.st === 'dead') { D.t -= dt; if (D.t <= 0) { D.st = 'rearm'; D.t = 4; D.x = home.x; D.z = home.z; D.y = 0.7; D.g.visible = true; D.d.dead = false; D.ammo = AMMO; D.M.rails.forEach(function (r) { r.visible = true; }); radio(D.side, D.cs, D.cs + ' is up, replacement airframe launching.', 1); } return; }
    if (D.st === 'down') {
      D.hd = wrap(D.hd + dt * 1.9); D.bank = Math.min(1.1, D.bank + dt * 0.8); D.y -= dt * 7; D.x += Math.sin(D.hd) * 9 * dt; D.z += Math.cos(D.hd) * 9 * dt;
      if (F && Math.random() < dt * 14) F.puff({ kind: 'smoke', x: D.x, y: D.y, z: D.z, size: 0.9, grow: 1.4, life: 2.2, color: 0x2a2725, opacity: 0.65 });
      if (D.y <= 0.3) {
        var wet = TH().isWater && TH().isWater(D.x, D.z);
        if (wet) TH().splash(D.x, D.z, 1.4); else if (F) { F.puff({ kind: 'fire', x: D.x, y: 0.8, z: D.z, size: 2, grow: 0.7, life: 0.6, color: 0xff9a3a, opacity: 0.9 }); F.puff({ kind: 'dust', x: D.x, y: 0.5, z: D.z, vy: 3, size: 1.8, grow: 1.3, life: 1.6, color: 0x8a7c66, opacity: 0.6 }); }
        D.st = 'dead'; D.t = RESPAWN_S; D.g.visible = false; D.d.dead = true;
      }
      return pose(D, dt);
    }
    if (D.st === 'rearm') { D.t -= dt; D.y = 0.7; D.bank = 0; D.v = 0; if (D.t <= 0) { D.st = 'launch'; D.v = 6; D.hd = D.side < 0 ? Math.PI / 2 : -Math.PI / 2; if (!D.task) aiTask(D); } return pose(D, dt); }
    if (D.cd > 0) D.cd -= dt;
    if (D.task && D.task.by === 'cmdr' && performance.now() > D.task.until) D.task.by = 'ai';
    if (D.task && D.task.follow && D.task.follow.st === 'sail') { D.task.x = D.task.follow.x; D.task.z = D.task.follow.z; }
    D.retask -= dt; if (!D.task || (D.retask <= 0 && D.task.by !== 'cmdr')) aiTask(D);
    var tx = D.task.x, tz = D.task.z, alt = D.alt;
    if (D.st === 'rtb') { tx = home.x; tz = home.z; }
    var dx = tx - D.x, dz = tz - D.z, dist = Math.hypot(dx, dz);
    if (D.st === 'rtb') {
      alt = dist < 40 ? Math.max(0.7, dist * 0.6) : D.alt;
      steer(D, Math.atan2(dx, dz), dist < 30 ? 7 : CRUISE, dt);
      if (dist < 5) { D.st = 'rearm'; D.t = REARM_S; stats.rearms++; D.ammo = AMMO; D.M.rails.forEach(function (r) { r.visible = true; }); }
    } else if (dist > ORBIT_R * 1.6) {
      if (D.st === 'orbit') D.st = 'transit';
      steer(D, Math.atan2(dx, dz), CRUISE, dt);
    } else {
      D.st = D.st === 'launch' ? 'transit' : 'orbit';
      var a = Math.atan2(D.x - tx, D.z - tz), corr = Math.max(-1, Math.min(1, (dist - ORBIT_R) / ORBIT_R));
      steer(D, a + Math.PI / 2 + corr * Math.PI / 2, ORBIT_V, dt);
    }
    D.y += Math.max(-3 * dt, Math.min(3 * dt, alt - D.y));
    // sensor + weapons + threats at 1 Hz
    D.sense -= dt;
    if (D.sense <= 0 && D.st !== 'rtb' && D.y > 8) {
      D.sense = 1; sense(D);
      if (D.ammo > 0 && D.cd <= 0) { var t = pickStrike(D); if (t) fire(D, t); }
      if (D.ammo <= 0 && !missiles.some(function (m) { return m.cs === D.cs; })) { D.st = 'rtb'; radio(D.side, D.cs, D.cs + ', winchester. RTB to rearm.', 1); }
      if (Math.random() < threatAt(D)) { D.st = 'down'; stats.downs++; radio(D.side, D.cs, D.cs + ' is hit, losing the link. ' + D.cs + ' down.', D.side === playerSide() ? 3 : 1); }
    }
    pose(D, dt);
  }
  function pose(D, dt) {
    D.g.position.set(D.x, D.y, D.z);
    D.g.rotation.set(0, 0, 0); D.g.rotation.order = 'YXZ'; D.g.rotation.y = D.hd; D.g.rotation.z = -D.bank; D.g.rotation.x = D.st === 'down' ? 0.5 : 0;
    if (D.M.prop) D.M.prop.rotation.z += dt * (D.st === 'rearm' ? 6 : 42);
    if (D.M.strobe) D.M.strobe.visible = (performance.now() % 1200) < 90;
  }

  // ------------------------------------------------------------------ UI (Map → WAR SYSTEMS · UAV)
  function buildUi() {
    var p = doc.createElement('div'); p.id = 'uavPanel'; p.className = 'supply-panel uav-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · UAV <span class="qual sim">SIMULATED</span></div>' +
      '<div class="inv-status" id="uavStatus"></div>' +
      '<div class="econ-actions">' +
      '<button type="button" id="uavTask">Task UAV here<small>camera point · U</small></button>' +
      '<button type="button" id="uavStrike">UAV strike<small>spotted target</small></button>' +
      '</div>' +
      '<div class="sup-row"><span id="uavNote" class="sup-status"></span></div>' +
      '<div class="th-note">Drones orbit their task point, spot enemy ships, parked jets, depots and defenses for the tactical map, and carry two missiles per sortie. Enemy AA can shoot them down. Game layer only — never moves the front. ?uav=0 turns it off.</div>';
    el.p = p; el.status = p.querySelector('#uavStatus'); el.note = p.querySelector('#uavNote');
    p.querySelector('#uavTask').addEventListener('click', function () { commandTask(); });
    p.querySelector('#uavStrike').addEventListener('click', function () { commandStrike(); });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('invasionPanel') || doc.getElementById('squadsPanel') || doc.getElementById('linesPanel') || doc.getElementById('supplyPanel');
    var p = el.p; if (!p) return;
    if (anchor && anchor.parentNode) {
      if (p.parentNode !== anchor.parentNode || p.previousSibling !== anchor) anchor.parentNode.insertBefore(p, anchor.nextSibling);
      p.classList.toggle('floating', anchor.classList.contains('floating')); p.hidden = anchor.hidden;
    } else if (!p.parentNode) { var host = doc.querySelector('#sheet-map .sheet-body'); (host || doc.body).appendChild(p); }
  }
  var ST = { transit: 'EN ROUTE', orbit: 'ON STATION', rtb: 'RTB', rearm: 'REARMING', launch: 'LAUNCHING', down: 'SHOT DOWN', dead: 'REPLACING' };
  function renderUi(force) {
    if (!el.status) return;
    var side = playerSide(), html = list.filter(function (D) { return D.side === side; }).map(function (D) {
      var where = D.st === 'dead' ? Math.ceil(D.t) + ' s' : D.st === 'rearm' ? Math.ceil(D.t) + ' s' : grid(D.task ? D.task.x : D.x, D.task ? D.task.z : D.z);
      return '<div><b>' + D.cs + '</b> · ' + ST[D.st] + ' · ' + where + ' · ' + D.ammo + ' msl' + (D.task && D.task.by === 'cmdr' ? ' · YOUR TASK' : '') + '</div>';
    }).join('');
    var nSpot = Object.keys(spots).filter(function (k) { return spots[k].by === side; }).length;
    html += '<div>Contacts spotted (20 s): ' + nSpot + ' · fired ' + stats.fired + ' · hits ' + stats.hits + ' · lost ' + stats.downs + '</div>';
    el.status.innerHTML = html;
  }

  // ------------------------------------------------------------------ tick
  function update() {
    if (!enabled) return;
    var th = TH(); if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { if (!build()) return; ready = true; } catch (err) { enabled = false; console.warn('[uav] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused && e.isPaused()) return;
    if (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive()) return;
    step(dt);
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; placeUi(); renderUi(); }
  }
  function step(dt) {
    if (cmdCd > 0) cmdCd -= dt;
    for (var i = 0; i < list.length; i++) tickDrone(list[i], dt);
    tickMissiles(dt);
    stats.drones = list.filter(function (D) { return D.st !== 'dead'; }).length;
  }

  LB.uav = {
    version: 'v12.0.17', isEnabled: function () { return enabled && ready; }, update: update,
    task: commandTask, strike: commandStrike,
    list: function () { return list.map(function (D) { return { side: D.side, cs: D.cs, st: D.st, x: D.x, y: D.y, z: D.z, hd: D.hd, ammo: D.ammo, task: D.task ? { x: D.task.x, z: D.task.z, kind: D.task.kind, by: D.task.by } : null, sensor: SENSOR_R * wmult() }; }); },
    spots: function () { var o = [], now = performance.now(); for (var k in spots) if (now - spots[k].t < SPOT_TTL) o.push(Object.assign({ age: (now - spots[k].t) / 1000 }, spots[k])); return o; },
    getStats: function () { return Object.assign({ missiles: missiles.length, spots: Object.keys(spots).length, cmdCd: Math.max(0, +cmdCd.toFixed(1)) }, stats); },
    // test hooks
    _step: function (sec) { if (!ready) return false; for (var t = 0; t < sec; t += 0.05) step(0.05); renderUi(); return true; },
    _shootDown: function (i) { var D = list[i || 0]; if (!D || D.st === 'dead') return false; D.st = 'down'; stats.downs++; return true; },
    _place: function (i, x, z) { var D = list[i || 0]; if (!D) return false; D.x = x; D.z = z; D.y = D.alt; D.st = 'orbit'; D.task = { x: x, z: z, kind: 'test', by: 'cmdr', until: performance.now() + 60000 }; D.cd = 0; return true; },
    _resetCd: function () { cmdCd = 0; list.forEach(function (D) { D.cd = 0; }); }
  };
})(window);
