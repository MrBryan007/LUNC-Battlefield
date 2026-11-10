/* LUNC Battlefield v12.0.59 — Missile test range: a full inert ICBM test launch (SIMULATED · inert, game FX only).
 * Takes over the two v12.0 ICBM silos from extras.js (box lid + sliding cylinder) and turns each into a test site:
 *  concrete apron, split blast doors over a launch tube, amber beacons, perimeter fence, control bunker, and a marked
 *  test box (four buoys) in the ocean. A test window opens every few minutes, alternating sides: 30 s radio countdown
 *  (own side clear, enemy side INTERCEPTED), doors open at T-10, cold-launch gas ejection, motor ignition, vertical climb,
 *  pitch-over onto a ballistic arc (the missile points along its velocity), stage 1 separates and tumbles into the sea,
 *  stage 2 burns out and falls away, the inert RV separates and re-enters glowing into the test box (splash + radio).
 * Tactical map shows silos, the ground track, the missile and the test box. Settings → WORLD shows the next test window
 * with a "Watch next launch" button. Never touches market data, armies, the front, combat or data-truth labels.
 * Kill switch: ?silos=0 (restores the v12.0 display). API: LUNCBattle.silos.getState().
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('silos') !== '0';
  var THREE = null, root = null, sites = [], debris = [], ready = false, uiEl = null, uiBtn = null, uiT = 0;
  var nextT = 70 + Math.random() * 40, nextIdx = 0, follow = false, followSite = null, stats = { launches: 0, rvInBox: 0, stage1Sea: 0, stage2Sea: 0, countdowns: 0, lastResult: '' };
  var T_FLIGHT = 34, APEX = 170, G = 9, SEP1 = 0.3, BURN = 0.62, SEP2 = 0.7, REENTRY = 0.8, CT = 30;
  var _v, _q, _up;

  function E() { return LB.engine; }
  function TH() { return LB.theaters; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function lite() { return tier() === 'LOW' || !!(E() && E().mobile) || global.innerWidth < 760; }
  function F() { return LB.heavyFx; }
  function ownSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function radio(S, text) {
    if (!LB.ai || !LB.ai.send) return;
    var own = S.side === ownSide(), tag = (S.side < 0 ? 'BULL' : 'BEAR') + ' RANGE CONTROL: ';
    LB.ai.send({ side: S.side, type: 'icbm', text: (own ? '' : 'INTERCEPTED · ') + tag + '"' + text + '" (SIMULATED · inert)' });
  }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

  // ------------------------------------------------------------------ build
  function stackMesh(M) {
    var g = new THREE.Group(), body = M.body, dark = M.dark, band = M.band;
    var s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 4.2, 12), body); s1.position.y = 2.1; g.add(s1);
    var nz = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.18, 12), band); nz.position.y = 4.3; g.add(nz);
    var s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 2.6, 12), body); s2.position.y = 5.7; g.add(s2);
    var rv = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 12), M.rv); rv.position.y = 7.75; g.add(rv);
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 8), dark); nose.position.y = 8.65; g.add(nose);
    var fl = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 10, 1, true), M.flame); fl.rotation.x = Math.PI; fl.position.y = -1.5; fl.visible = false; g.add(fl);
    var fl2 = new THREE.Mesh(new THREE.ConeGeometry(0.26, 2.0, 8, 1, true), M.flameCore); fl2.rotation.x = Math.PI; fl2.position.y = -0.95; fl2.visible = false; g.add(fl2);
    g.userData = { fl: fl, fl2: fl2, s1: s1, band: nz, s2: s2, rv: rv, nose: nose };
    return g;
  }
  function buildSite(sl, M) {
    var side = sl.side, g = new THREE.Group(); g.position.set(sl.x, 0, sl.z); root.add(g);
    var conc = M.conc;
    function box(w, h, d, mat, x, y, z, p) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(x, y, z); (p || g).add(o); return o; }
    box(10, 0.3, 10, conc, 0, 0.1, 0);
    var hole = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20), M.black); hole.rotation.x = -Math.PI / 2; hole.position.y = 0.27; g.add(hole);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 6, 20), M.dark); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    var d1 = box(1.45, 0.22, 3.2, M.door, -0.72, 0.44, 0), d2 = box(1.45, 0.22, 3.2, M.door, 0.72, 0.44, 0);
    // hazard stripes around the apron
    for (var k = 0; k < 4; k++) { var st = box(k % 2 ? 0.35 : 9.6, 0.02, k % 2 ? 9.6 : 0.35, M.stripe, k === 1 ? 4.7 : k === 3 ? -4.7 : 0, 0.27, k === 0 ? 4.7 : k === 2 ? -4.7 : 0); }
    // control bunker (half-buried) with a flat roof and a door
    var bk = new THREE.Group(); bk.position.set(-side * 9.5, 0, 4); g.add(bk);
    box(5, 1.8, 3.4, conc, 0, 0.9, 0, bk); box(5.4, 0.3, 3.8, M.dark, 0, 1.9, 0, bk); box(0.9, 1.3, 0.1, M.door, 0, 0.65, 1.72, bk); box(1.6, 0.4, 0.1, M.glass, 1.4, 1.1, 1.72, bk);
    var ant = box(0.08, 3.2, 0.08, M.dark, 1.8, 3.4, 0, bk);
    // beacons
    var bm = [new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), M.beacon.clone()), new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), M.beacon.clone())];
    bm[0].position.set(-4.4, 1.0, -4.4); bm[1].position.set(4.4, 1.0, 4.4); box(0.1, 0.8, 0.1, M.dark, -4.4, 0.55, -4.4); box(0.1, 0.8, 0.1, M.dark, 4.4, 0.55, 4.4); g.add(bm[0]); g.add(bm[1]);
    // perimeter fence: posts + two wires as a single LineSegments (one draw), square 16 x 16 with a gap on the bunker side
    var pts = [], R = 8.2, ph = 1.7;
    function seg(x0, z0, x1, z1) { var n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.6)); for (var i = 0; i <= n; i++) { var x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n; pts.push(x, 0, z, x, ph, z); } pts.push(x0, 0.6, z0, x1, 0.6, z1, x0, ph, z0, x1, ph, z1); }
    seg(-R, -R, R, -R); seg(R, -R, R, R); seg(R, R, -R, R); seg(-R, R, -R, -R);
    var fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    var fence = new THREE.LineSegments(fg, M.fence); g.add(fence);
    // the missile, standing down in the tube (hidden under the apron)
    var mis = stackMesh(M); mis.visible = false; g.add(mis); mis.position.set(0, -9, 0);
    // test box: four buoys in the sea
    var bx = -side * 90, bz = 205, buoys = [];
    [[-22, -22], [22, -22], [22, 22], [-22, 22]].forEach(function (c) {
      var b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.3, 8), M.buoy); b.position.set(bx + c[0], 0.5, bz + c[1]); root.add(b);
      var top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), M.beacon.clone()); top.position.set(bx + c[0], 1.4, bz + c[1]); root.add(top); buoys.push(b, top);
    });
    var lp = []; [[-22, -22], [22, -22], [22, 22], [-22, 22], [-22, -22]].forEach(function (c) { lp.push(bx + c[0], 0.3, bz + c[1]); });
    var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    var lines = new THREE.Line(lg, M.boxLine); lines.frustumCulled = false; root.add(lines);
    var S = { side: side, sl: sl, x: sl.x, z: sl.z, g: g, d1: d1, d2: d2, door: 0, bm: bm, mis: mis, bx: bx, bz: bz, buoys: buoys, lines: lines, st: 'idle', t: 0, ct: 0, w: 0, fl: null, said: {}, blink: 0, trail: 0, M: M, off: 0, sep1: false, sep2: false, pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 1, 0), spd: 0 };
    sl.ctl = true; if (sl.g) sl.g.visible = false;
    sites.push(S);
  }
  function build() {
    var e = E(); THREE = e.THREE; _v = new THREE.Vector3(); _q = new THREE.Quaternion(); _up = new THREE.Vector3(0, 1, 0);
    root = new THREE.Group(); root.name = 'v12-silos'; e.scene.add(root);
    var std = function (c, r, m) { return new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m || 0 }); };
    var M = {
      conc: std(0x8e8b83, 0.95), black: new THREE.MeshBasicMaterial({ color: 0x050505 }), dark: std(0x2b2f31, 0.6, 0.4), door: std(0x575c5e, 0.7, 0.5),
      stripe: std(0xd6a21b, 0.8), glass: std(0x16262f, 0.2, 0.6), beacon: new THREE.MeshBasicMaterial({ color: 0x3a2a08 }), buoy: std(0xe9e6df, 0.7),
      fence: new THREE.LineBasicMaterial({ color: 0x9aa0a2, transparent: true, opacity: 0.8 }), boxLine: new THREE.LineBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.55 }),
      body: std(0xe6e2d8, 0.55, 0.15), band: std(0x2a2d2f, 0.6, 0.3), rv: std(0xb8b4aa, 0.4, 0.5),
      flame: new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      flameCore: new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    };
    var list = LB.v12extras && LB.v12extras._siloList ? LB.v12extras._siloList() : [];
    for (var i = 0; i < list.length; i++) buildSite(list[i], M);
    M.rvHot = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
    ready = sites.length > 0; buildUi();
  }
  function buildUi() {
    var host = doc.getElementById('v12Opts'); if (!host || uiEl) return;
    uiEl = doc.createElement('div'); uiEl.className = 'silo-row'; uiEl.id = 'siloRow'; uiEl.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0;font-size:12px;flex-wrap:wrap';
    uiEl.innerHTML = '<span id="siloNext">Missile range: next test window —</span> <span class="qual sim">SIMULATED · inert</span>';
    uiBtn = doc.createElement('button'); uiBtn.type = 'button'; uiBtn.id = 'siloWatch'; uiBtn.textContent = 'Watch next launch'; uiBtn.style.cssText = 'padding:4px 10px;border-radius:8px;border:1px solid #ffd36a;background:#222;color:#ffd36a';
    uiBtn.addEventListener('click', function () { watch(); });
    uiEl.appendChild(uiBtn); host.appendChild(uiEl);
  }

  // ------------------------------------------------------------------ flight path (analytic, ballistic-looking)
  function pathAt(S, w, out) {
    var k = Math.pow(Math.max(0, w), 1.6), tx = S.bx, tz = S.bz;
    out.set(S.x + (tx - S.x) * k, 2.5 * (1 - w) + APEX * 4 * w * (1 - w), S.z + (tz - S.z) * k); return out;
  }
  var _p0 = null, _p1 = null;
  function setFlight(S) {
    if (!_p0) { _p0 = new THREE.Vector3(); _p1 = new THREE.Vector3(); }
    var w = S.w; pathAt(S, w, _p0); pathAt(S, Math.min(1, w + 0.004), _p1);
    S.dir.copy(_p1).sub(_p0); S.spd = S.dir.length() / (0.004 * T_FLIGHT); S.dir.normalize();
    S.pos.copy(_p0);
    var m = S.mis; _q.setFromUnitVectors(_up, S.dir);
    m.position.copy(S.pos).addScaledVector(S.dir, S.off).sub(S.g.position); m.quaternion.copy(_q);
  }

  // ------------------------------------------------------------------ debris (stages tumbling down)
  function spawnDebris(S, mesh, kind, vh) {
    var m = mesh.clone(); m.material = mesh.material; root.add(m);
    var wp = new THREE.Vector3(); mesh.getWorldPosition(wp); m.position.copy(wp); m.quaternion.copy(S.mis.quaternion);
    var v = S.dir.clone().multiplyScalar(S.spd);
    if (vh) { var hz = Math.hypot(S.bx - wp.x, S.bz - wp.z) || 1; v.x = (S.bx - wp.x) / hz * vh; v.z = (S.bz - wp.z) / hz * vh; v.y *= 0.35; }
    debris.push({ m: m, v: v, kind: kind, spin: new THREE.Vector3(rnd(-3, 3), rnd(-1, 1), rnd(-4, 4)), life: 0, side: S.side });
  }
  function tickDebris(dt) {
    var f = F(), l = lite();
    for (var i = debris.length - 1; i >= 0; i--) {
      var D = debris[i], m = D.m; D.life += dt;
      D.v.y -= G * dt; m.position.addScaledVector(D.v, dt); m.rotation.x += D.spin.x * dt; m.rotation.z += D.spin.z * dt;
      if (f && Math.random() < dt * (l ? 4 : 10)) f.puff({ kind: 'smoke', x: m.position.x, y: m.position.y, z: m.position.z, size: 1.4, grow: 1.4, life: 2.5, color: 0xcfcfcf, opacity: 0.35 });
      if (m.position.y <= 0.2 || D.life > 40) {
        var water = TH() && TH().isWater ? TH().isWater(m.position.x, m.position.z) : false;
        if (water) { if (TH().splash) TH().splash(m.position.x, m.position.z, 2.2); if (D.kind === 1) stats.stage1Sea++; else stats.stage2Sea++; }
        else if (f) f.puff({ kind: 'dust', x: m.position.x, y: 0.5, z: m.position.z, size: 2, grow: 3, life: 1.6, color: 0x8a8472, opacity: 0.6 });
        root.remove(m); debris.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ site state machine
  function beacons(S, on) { for (var i = 0; i < 2; i++) S.bm[i].material.color.setHex(on ? 0xffb020 : 0x3a2a08); }
  function buoyLights(S, on) { for (var i = 1; i < S.buoys.length; i += 2) S.buoys[i].material.color.setHex(on ? 0xffb020 : 0x3a2a08); }
  function doorTo(S, open, dt) { S.door += (open - S.door) * Math.min(1, dt * 1.6); var o = 0.72 + S.door * 1.9; S.d1.position.x = -o; S.d2.position.x = o; }
  function startCount(S) { S.st = 'count'; S.ct = CT; S.said = {}; stats.countdowns++; }
  function say(S, key, text) { if (!S.said[key]) { S.said[key] = 1; radio(S, text); } }
  function tickSite(S, dt) {
    var f = F(), l = lite(), blink = (performance.now() % 700) < 350;
    if (S.st === 'idle') { doorTo(S, 0, dt); beacons(S, false); buoyLights(S, false); return; }
    if (S.st === 'count') {
      S.ct -= dt; var on = blink; beacons(S, on); buoyLights(S, on);
      if (S.ct <= CT - 0.05) say(S, 'c30', 'Range is clear. T-minus 30 seconds. Inert test round, ocean range');
      if (S.ct <= 10) { doorTo(S, 1, dt); say(S, 'c10', 'Silo doors opening. T-minus 10'); }
      if (S.ct <= 3) say(S, 'c3', 'T-minus 3. Final go');
      if (S.ct <= 0) { S.st = 'eject'; S.t = 0; S.mis.visible = true; S.off = 0; S.sep1 = S.sep2 = false; S.mis.userData.s1.visible = S.mis.userData.band.visible = S.mis.userData.s2.visible = true; S.mis.userData.rv.visible = S.mis.userData.nose.visible = true; S.mis.userData.rv.material = S.M.rv; S.mis.position.set(0, -3, 0); S.mis.quaternion.identity(); stats.launches++; say(S, 'go', 'Launch. Inert test round away'); }
      return;
    }
    if (S.st === 'eject') {
      S.mis.userData.fl.visible = S.mis.userData.fl2.visible = S.t > 1.0;            // cold launch: gas ejection pops the missile out of the tube, then the motor lights
      S.t += dt; beacons(S, blink); var k = Math.min(1, S.t / 1.3);
      S.mis.position.y = -3 + (6.2 * k * (2 - k)); doorTo(S, 1, dt);
      if (f && Math.random() < dt * (l ? 14 : 36)) f.puff({ kind: 'dust', x: S.x + rnd(-0.8, 0.8), y: 0.6, z: S.z + rnd(-0.8, 0.8), vy: 4, size: 1.2, grow: 3.6, life: 1.6, color: 0xe8e8e8, opacity: 0.7 });
      if (S.t >= 1.3) { S.st = 'flight'; S.w = 0; setFlight(S); S.trail = 0; if (LB.sfx && LB.sfx.explosion) { try { LB.sfx.explosion(0.5); } catch (_) {} } }
      return;
    }
    if (S.st === 'flight') {
      S.w += dt / T_FLIGHT; var w = S.w, burning = w < BURN; beacons(S, blink);
      if (w >= 1) { impact(S); return; }
      if (!S.sep1 && w >= SEP1) { S.sep1 = true; var ud = S.mis.userData; S.off = 0; spawnDebris(S, ud.s1, 1, Math.min(90, sepSpeed(S))); ud.s1.visible = false; ud.band.visible = false; S.mis.userData.s2.position.y -= 4.4; ud.rv.position.y -= 4.4; ud.nose.position.y -= 4.4; say(S, 's1', 'Stage one separation confirmed'); S.sepFlash = 0.6; }
      if (!S.sep2 && w >= SEP2) { S.sep2 = true; spawnDebris(S, S.mis.userData.s2, 2, 0); S.mis.userData.s2.visible = false; S.mis.userData.rv.position.y -= 3.0; S.mis.userData.nose.position.y -= 3.0; say(S, 's2', 'Stage two burnout. Reentry vehicle separated'); }
      setFlight(S);
      var ud2 = S.mis.userData, fk = burning ? 0.85 + Math.random() * 0.3 : 0; ud2.fl.visible = ud2.fl2.visible = burning; if (burning) { var fs = S.sep1 ? 0.7 : 1; ud2.fl.scale.set(fs, fs * fk, fs); ud2.fl2.scale.set(fs, fs * fk, fs); ud2.fl.position.y = S.sep1 ? -1.5 + 0.2 : -1.5; ud2.fl2.position.y = S.sep1 ? -0.75 : -0.95; }
      var tail = new THREE.Vector3().copy(S.mis.position).add(S.g.position).addScaledVector(S.dir, S.sep1 ? -0.4 : -0.1);
      if (burning && f) {
        var n = l ? (Math.random() < 0.5 ? 1 : 0) : 1;
        for (var i = 0; i < n; i++) f.puff({ kind: 'fire', x: tail.x, y: tail.y, z: tail.z, size: S.sep1 ? 1.6 : 2.4, grow: 0.1, life: 0.35, color: 0xffa23c, opacity: 0.95 });
        if (Math.random() < dt * (l ? 8 : 20)) f.puff({ kind: 'smoke', x: tail.x, y: tail.y, z: tail.z, size: 2.4, grow: 3, life: 6, color: 0xeceae6, opacity: 0.5, drag: 0.99 });
      }
      if (f) {   // lingering contrail: thin, long-lived, rate-limited
        S.trail -= dt; if (S.trail <= 0) { S.trail = l ? 0.4 : 0.22; f.puff({ kind: 'smoke', x: tail.x, y: tail.y, z: tail.z, size: 1.8, grow: 2.2, life: l ? 7 : 9, color: 0xf2f4f5, opacity: 0.32, drag: 1 }); }
      }
      if (w >= REENTRY) {   // re-entry glow
        S.mis.userData.rv.material = S.M.rvHot;
        if (f) f.puff({ kind: 'fire', x: S.pos.x, y: S.pos.y, z: S.pos.z, size: 2.6, grow: 0.1, life: 0.5, color: 0xff7a22, opacity: 0.9 });
      }
      doorTo(S, 1, dt);
      return;
    }
    if (S.st === 'done') { S.t -= dt; doorTo(S, S.t > 4 ? 1 : 0, dt); beacons(S, false); if (S.t <= 0) { S.st = 'idle'; buoyLights(S, false); } }
  }
  function sepSpeed(S) {   // horizontal speed that carries stage 1 from where it separates into the sea (fall time from its own height / vy)
    var y = S.pos.y, vy = S.dir.y * S.spd * 0.35, tf = (vy + Math.sqrt(vy * vy + 2 * G * y)) / G;
    var hz = Math.hypot(S.bx - S.pos.x, (S.bz - 60) - S.pos.z) * 0.8 + 20;   // lands comfortably past the beach
    return hz / Math.max(1, tf);
  }
  function impact(S) {
    S.mis.visible = false; S.mis.userData.fl.visible = S.mis.userData.fl2.visible = false; S.st = 'done'; S.t = 10; stats.rvInBox++; stats.lastResult = 'RV in the box';
    var f = F(), x = S.pos.x, z = S.pos.z; if (TH() && TH().splash) TH().splash(x, z, 3.2);
    if (f) { f.puff({ kind: 'dust', x: x, y: 1.5, z: z, size: 5, grow: 9, life: 2.6, color: 0xf2f8fa, opacity: 0.9 }); f.puff({ kind: 'fire', x: x, y: 1.8, z: z, size: 3, grow: 3, life: 0.8, color: 0xffb04a, opacity: 0.9 }); }
    say(S, 'rv', 'RV in the box. Test complete'); if (follow && followSite === S) follow = false;
  }

  // ------------------------------------------------------------------ camera follow, scheduler, API
  function watch() {
    var S = null; for (var i = 0; i < sites.length; i++) if (sites[i].st !== 'idle' && sites[i].st !== 'done') S = sites[i];
    if (!S) S = sites[nextIdx % sites.length]; if (!S) return false;
    follow = true; followSite = S; var th = TH(); if (th && th.flyToPoint && S.st !== 'eject' && S.st !== 'flight') th.flyToPoint(S.x, S.z, 46); return true;
  }
  function tickFollow(dt) {
    if (!follow || !followSite) return; var S = followSite, e = E(); if (!e || !e.controls) return;
    if (S.st !== 'flight' && S.st !== 'eject') return;
    var p = S.st === 'flight' ? S.pos : _v.set(S.x, 4, S.z), T = e.controls.target, k = 1 - Math.exp(-dt * 8);
    var dx = (p.x - T.x) * k, dy = (p.y - T.y) * k, dz = (p.z - T.z) * k;
    T.x += dx; T.y += dy; T.z += dz; e.camera.position.x += dx; e.camera.position.y += dy; e.camera.position.z += dz;
  }
  function launch(side) {
    if (!ready) return false; var S = null;
    for (var i = 0; i < sites.length; i++) if ((side == null || sites[i].side === side) && sites[i].st === 'idle') { S = sites[i]; break; }
    if (!S) return false; startCount(S); S.ct = 0.01; nextT = rnd(150, 260); nextIdx = sites.indexOf(S) + 1; return true;
  }
  function tick(dt) {
    if (!ready) return;
    nextT -= dt; var busy = false; for (var i = 0; i < sites.length; i++) if (sites[i].st !== 'idle') busy = true;
    var cdAt = nextT - CT;   // countdown starts 30 s before the window
    if (!busy && nextT <= CT) { var S = sites[nextIdx % sites.length]; if (S && S.st === 'idle') { startCount(S); S.ct = Math.max(0.5, nextT); nextT = rnd(150, 260) + S.ct; nextIdx++; } }
    for (var k = 0; k < sites.length; k++) tickSite(sites[k], dt);
    tickDebris(dt); tickFollow(dt);
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; if (!uiEl) buildUi(); var el = doc.getElementById('siloNext'); if (el) el.textContent = 'Missile range: ' + status(); }
  }
  function status() {
    for (var i = 0; i < sites.length; i++) { var S = sites[i]; if (S.st === 'count') return (S.side < 0 ? 'BULL' : 'BEAR') + ' launch T-' + Math.ceil(S.ct) + ' s'; if (S.st === 'eject' || S.st === 'flight') return (S.side < 0 ? 'BULL' : 'BEAR') + ' test round in flight'; }
    return 'next test window in ' + fmt(nextT);
  }
  function update(dt) { if (!enabled) return; if (!ready && !root) { try { build(); } catch (err) { console.warn('[silos]', err); ready = false; root = root || {}; enabled = false; return; } } tick(dt); }
  function map(c, X, Z, s, big, own) {
    if (!enabled || !ready) return 0; var n = 0;
    sites.forEach(function (S) {
      var col = S.side < 0 ? '#58d08f' : '#ff7b72', px = X(S.x), pz = Z(S.z), bx = X(S.bx), bz = Z(S.bz), live = S.st === 'eject' || S.st === 'flight';
      c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = big ? 1.4 : 1;
      c.strokeRect(px - s * 0.5, pz - s * 0.5, s, s); c.beginPath(); c.arc(px, pz, s * 0.22, 0, 6.283); c.fill();
      c.strokeStyle = 'rgba(255,176,46,.85)'; c.strokeRect(bx - s * 1.2, bz - s * 1.2, s * 2.4, s * 2.4);
      if (live || S.st === 'count') { c.setLineDash([3, 3]); c.strokeStyle = 'rgba(255,211,106,.7)'; c.beginPath(); c.moveTo(px, pz); c.lineTo(bx, bz); c.stroke(); c.setLineDash([]); }
      if (live && S.st === 'flight') { var mx = X(S.pos.x), mz = Z(S.pos.z); c.fillStyle = '#fff'; c.beginPath(); c.arc(mx, mz, Math.max(1.8, s * 0.35), 0, 6.283); c.fill(); c.strokeStyle = '#ffd36a'; c.stroke(); }
      if (big) { c.fillStyle = '#f2f6f3'; c.font = Math.max(8, s * 0.9) + 'px sans-serif'; c.textAlign = 'center'; c.fillText('SILO', px, pz - s * 0.8); c.fillText('TEST BOX', bx, bz - s * 1.4); }
      c.restore(); n += 2;
    });
    return n;
  }
  LB.silos = {
    version: 'v12.0.59', isEnabled: function () { return enabled; }, update: update, drawMap: map, launch: launch, watch: watch,
    getState: function () { return Object.assign({ enabled: enabled, ready: ready, next: +nextT.toFixed(1), debris: debris.length, status: ready ? status() : '', following: follow, sites: sites.map(function (S) { return { side: S.side, st: S.st, w: +(S.w || 0).toFixed(3), ct: +S.ct.toFixed(1), door: +S.door.toFixed(2), y: S.st === 'flight' ? +S.pos.y.toFixed(1) : 0 }; }) }, stats); },
    _tick: tick, _sites: function () { return sites; }, _debris: function () { return debris; }, _setNext: function (s) { nextT = s; }
  };
})(window);
