/* LUNC Battlefield v12.0.1 — v12.1 "War Systems" part 1: supply drops + war resources. Game/sim layer, SIMULATED.
 * Cargo planes drop parachute crates into a drop zone (colored smoke + ground ring + world-map ping). Contents: fuel, ammo,
 * intel or a power-up. A small AI squad from each side races to the crate; a capture ring fills for whichever side is in
 * range, and stops while CONTESTED. The winner banks the resource in a per-side tally (Map sheet → WAR SYSTEMS).
 * If the Commander's side wins: intel lifts fog of war around the zone for 30 s, ammo cuts active cooldowns by 30 %,
 * a power-up adds +25 Moon Shot charge (game-only). The Commander can call a drop in (60 s cooldown).
 * Never alters market data, army counts or the frontline. ?supply=0 (or ?theaters=0) turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('supply') !== '0' && qs.get('theaters') !== '0';
  var E = function () { return LB.engine; }, TH = function () { return LB.theaters; };
  var KINDS = {
    fuel: { label: 'Fuel', color: 0xff9a3c, css: '#ff9a3c' },
    ammo: { label: 'Ammo', color: 0xff5a5a, css: '#ff5a5a' },
    intel: { label: 'Intel', color: 0x5ab4ff, css: '#5ab4ff' },
    power: { label: 'Power-up', color: 0xffd36a, css: '#ffd36a' }
  };
  var KLIST = ['fuel', 'ammo', 'intel', 'power'];
  var CAPTURE_S = 6, CALL_CD = 60, REVEAL_S = 30, REVEAL_R = 70;
  var THREE, root, ready = false, last = 0, drops = [], reveals = [], autoT = 0, callCd = 0, uiT = 0, nextId = 1;
  var tally = { '-1': { fuel: 0, ammo: 0, intel: 0, power: 0 }, '1': { fuel: 0, ammo: 0, intel: 0, power: 0 } };
  var stats = { dropped: 0, captured: 0, contested: 0, called: 0, lastResult: '' };
  var geo = {}, mat = {}, el = {};
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function low() { return tierName() === 'LOW' || (E() && E().mobile); }
  function caps() { return low() ? { active: 1, runners: 2 } : { active: 2, runners: 3 }; }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function sideName(s) { return s < 0 ? 'BULL' : 'BEAR'; }
  function fx() { return LB.heavyFx; }
  function frontX() { try { return E().getFrontlineX() || 0; } catch (_) { return 0; } }
  function radio(side, text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: side, type: 'supply', text: text }); } catch (_) {} }

  function build() {
    var e = E(); THREE = e.THREE; root = new THREE.Group(); root.name = 'v12-supply'; e.scene.add(root);
    geo.crate = new THREE.BoxGeometry(1.6, 1.2, 1.6);
    geo.band = new THREE.BoxGeometry(1.7, 0.18, 1.7);
    geo.chute = new THREE.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.line = new THREE.CylinderGeometry(0.03, 0.03, 3.2, 4);
    geo.ring = new THREE.RingGeometry(3.6, 4.2, 40);
    geo.prog = new THREE.RingGeometry(4.3, 5.0, 40, 1, 0, Math.PI * 2);
    geo.body = new THREE.CylinderGeometry(0.28, 0.32, 1.1, 6);
    geo.head = new THREE.SphereGeometry(0.24, 8, 6);
    mat.crate = new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.85 });
    mat.chute = new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.9, side: THREE.DoubleSide });
    mat.line = new THREE.MeshBasicMaterial({ color: 0x333333 });
    mat.ring = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    mat.side = { '-1': new THREE.MeshStandardMaterial({ color: 0x3fbf7f, roughness: 0.7 }), '1': new THREE.MeshStandardMaterial({ color: 0xd9564c, roughness: 0.7 }) };
    mat.skin = new THREE.MeshStandardMaterial({ color: 0xc9a27e, roughness: 0.8 });
    mat.kind = {}; KLIST.forEach(function (k) { mat.kind[k] = new THREE.MeshBasicMaterial({ color: KINDS[k].color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }); });
    buildUi(); autoT = rnd(20, 35); ready = true;
  }

  // ------------------------------------------------------------------ drops
  function spawnDrop(opts) {
    opts = opts || {};
    var c = caps(), active = drops.filter(function (d) { return d.st !== 'done'; }).length;
    if (active >= c.active) return null;
    var kind = opts.kind && KINDS[opts.kind] ? opts.kind : KLIST[(Math.random() * KLIST.length) | 0];
    var fxX = frontX(), x = opts.x != null ? opts.x : fxX + rnd(-35, 35), z = opts.z != null ? opts.z : rnd(-38, 40);
    x = Math.max(-140, Math.min(140, x)); z = Math.max(-80, Math.min(52, z));
    var dir = Math.random() < 0.5 ? -1 : 1, plane = null, F = fx();
    try { plane = F && F.buildPlane ? F.buildPlane('bomber', 0x9aa3a8) : null; } catch (_) { plane = null; }
    if (!plane) { plane = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 5), mat.crate); }
    plane.position.set(x - dir * 220, 40, z); plane.rotation.y = dir > 0 ? 0 : Math.PI; root.add(plane);
    var d = { id: nextId++, kind: kind, x: x, z: z, dir: dir, st: 'inbound', plane: plane, y: 38, prog: 0, contest: 0, smokeT: 0,
      squads: { '-1': [], '1': [] }, called: !!opts.called, t: 0, grp: null, chute: null, ring: null, progM: null, winner: 0 };
    drops.push(d); stats.dropped++;
    radio(opts.called ? playerSide() : 0, (opts.called ? sideName(playerSide()) + ' COMMAND: "Supply drop requested, cargo plane inbound."' : 'AIR LOGISTICS: cargo plane inbound, drop zone marked') + ' (SIMULATED)');
    return d;
  }
  function release(d) {
    var g = new THREE.Group(); g.position.set(d.x, d.y, d.z); root.add(g);
    var crate = new THREE.Mesh(geo.crate, mat.crate); g.add(crate);
    var band = new THREE.Mesh(geo.band, mat.kind[d.kind]); band.position.y = 0.2; g.add(band);
    var chute = new THREE.Group(); chute.position.y = 3.6; g.add(chute);
    chute.add(new THREE.Mesh(geo.chute, mat.chute));
    for (var i = 0; i < 4; i++) { var l = new THREE.Mesh(geo.line, mat.line); var a = i * Math.PI / 2 + Math.PI / 4; l.position.set(Math.cos(a) * 1.1, -1.6, Math.sin(a) * 1.1); l.rotation.z = Math.cos(a) * 0.5; l.rotation.x = -Math.sin(a) * 0.5; chute.add(l); }
    d.grp = g; d.chute = chute; d.st = 'falling';
    var ring = new THREE.Mesh(geo.ring, mat.ring); ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.08, d.z); root.add(ring); d.ring = ring;
  }
  function land(d) {
    d.st = 'landed'; d.t = 0; d.grp.position.y = 0.6;
    if (d.chute) { d.grp.remove(d.chute); d.chute = null; }
    d.progM = new THREE.Mesh(new THREE.RingGeometry(4.3, 5.0, 40, 1, 0, 0.01), mat.kind[d.kind]); d.progM.rotation.x = -Math.PI / 2; d.progM.position.set(d.x, 0.1, d.z); root.add(d.progM);
    var n = caps().runners, fxX = frontX();
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < n; i++) {
        var r = new THREE.Group(), b = new THREE.Mesh(geo.body, mat.side[side]), h = new THREE.Mesh(geo.head, mat.skin);
        b.position.y = 0.55; h.position.y = 1.3; r.add(b); r.add(h);
        var sx = fxX + side * rnd(14, 34), sz = d.z + rnd(-18, 18);
        if (Math.sign(d.x - fxX) === side) sx = d.x + side * rnd(14, 26);   // crate on this side's ground: start from their rear
        r.position.set(sx, 0, sz); root.add(r);
        d.squads[side].push({ g: r, x: sx, z: sz, v: rnd(4.2, 6.2), ph: rnd(0, 6.28), a: rnd(0, 6.28) });
      }
    });
    radio(0, 'DROP ZONE: ' + KINDS[d.kind].label.toUpperCase() + ' crate on the ground, both squads moving (SIMULATED)');
  }
  function removeRunner(d, side, idx) { var r = d.squads[side][idx]; if (!r) return; root.remove(r.g); d.squads[side].splice(idx, 1); var F = fx(); if (F) F.puff({ kind: 'dust', x: r.x, y: 0.4, z: r.z, size: 1.2, grow: 1.2, life: 1.2, color: 0xb8a888, opacity: 0.6 }); }
  function finish(d, side) {
    d.st = 'captured'; d.winner = side; d.t = 0; stats.captured++;
    tally[String(side)][d.kind]++;
    var me = playerSide() === side, eff = '';
    if (me) {
      if (d.kind === 'intel') { reveals.push({ x: d.x, z: d.z, t: REVEAL_S }); eff = ' Area revealed for 30 s.'; }
      else if (d.kind === 'ammo') { try { var cds = LB.commander.getState().cds; for (var k in cds) if (cds[k] > 0) cds[k] *= 0.7; eff = ' Cooldowns cut 30%.'; } catch (_) {} }
      else if (d.kind === 'power') { try { var s = LB.commander.getState().session; if (s) { s.charge = Math.min(100, (s.charge || 0) + 25); eff = ' +25 Moon Shot charge.'; } } catch (_) {} }
      else eff = ' Fuel banked.';
    }
    stats.lastResult = sideName(side) + ' captured ' + KINDS[d.kind].label + (me ? '.' + eff : '.');
    radio(side, sideName(side) + ' SQUAD: "' + KINDS[d.kind].label + ' crate secured."' + (me ? eff : '') + ' (SIMULATED · game FX)');
    if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui(me ? 'arm' : 'deny'); } catch (_) {}
    renderUi();
  }
  function cleanup(d) {
    if (d.plane) { root.remove(d.plane); d.plane = null; }
    if (d.grp) { root.remove(d.grp); d.grp = null; }
    if (d.ring) { root.remove(d.ring); d.ring = null; }
    if (d.progM) { root.remove(d.progM); d.progM.geometry.dispose(); d.progM = null; }
    [-1, 1].forEach(function (s) { d.squads[s].forEach(function (r) { root.remove(r.g); }); d.squads[s] = []; });
    d.st = 'done';
  }
  function setProg(d) {
    if (!d.progM) return;
    var a = Math.max(0.01, Math.abs(d.prog) * Math.PI * 2);
    d.progM.geometry.dispose(); d.progM.geometry = new THREE.RingGeometry(4.3, 5.0, 40, 1, Math.PI / 2, a);
    d.progM.material = d.contest > 0 ? mat.ring : (d.prog < 0 ? mat.side['-1'] : d.prog > 0 ? mat.side['1'] : mat.kind[d.kind]);
  }

  function tickDrop(d, dt, F) {
    d.t += dt;
    if (d.plane) {
      d.plane.position.x += d.dir * dt * 48;
      if (d.st === 'inbound' && (d.plane.position.x - d.x) * d.dir >= 0) { d.y = d.plane.position.y - 2; release(d); }
      if (Math.abs(d.plane.position.x - d.x) > 240) { root.remove(d.plane); d.plane = null; }
    }
    if (d.st === 'falling') {
      d.y -= dt * 4.2; var sway = Math.sin(d.t * 1.7) * 0.18;
      d.grp.position.set(d.x + Math.sin(d.t * 0.9) * 0.6, d.y, d.z); d.grp.rotation.z = sway;
      if (d.y <= 0.6) land(d);
    }
    if (d.st === 'landed' || d.st === 'falling') {
      d.smokeT -= dt;
      if (F && d.smokeT <= 0) { d.smokeT = low() ? 0.45 : 0.22; F.puff({ kind: 'smoke', x: d.x + rnd(-0.4, 0.4), y: 0.6, z: d.z + rnd(-0.4, 0.4), vy: 2.4, vx: 0.4, size: 1.6, grow: 2.2, life: 4, color: KINDS[d.kind].color, opacity: 0.55 }); }
      if (d.ring) d.ring.material.opacity = 0.35 + Math.sin(d.t * 4) * 0.2;
    }
    if (d.st === 'landed') {
      var inR = { '-1': 0, '1': 0 };
      [-1, 1].forEach(function (side) {
        var sq = d.squads[side];
        for (var i = 0; i < sq.length; i++) {
          var r = sq[i], dx = d.x - r.x, dz = d.z - r.z, dist = Math.hypot(dx, dz);
          if (dist > 3.2) { var st = Math.min(dist - 3, r.v * dt); r.x += dx / dist * st; r.z += dz / dist * st; r.g.rotation.y = Math.atan2(dx, dz); r.ph += dt * 12; r.g.position.y = Math.abs(Math.sin(r.ph)) * 0.18; }
          else { r.a += dt * 0.6; r.x = d.x + Math.cos(r.a + i * 2.1) * 3; r.z = d.z + Math.sin(r.a + i * 2.1) * 3; r.g.position.y = 0; r.g.rotation.y = Math.atan2(d.x - r.x, d.z - r.z); }
          r.g.position.x = r.x; r.g.position.z = r.z;
          if (Math.hypot(d.x - r.x, d.z - r.z) < 4.2) inR[side]++;
        }
      });
      if (inR['-1'] && inR['1']) {
        if (!d.contest) stats.contested++;
        d.contest += dt;
        if (F && Math.random() < dt * 6) { var a = d.squads[-1][0], b = d.squads[1][0]; if (a && b) F.puff({ kind: 'tracer', x: (a.x + b.x) / 2 + rnd(-1, 1), y: 0.9, z: (a.z + b.z) / 2 + rnd(-1, 1), size: 0.35, grow: 0.2, life: 0.18, color: 0xffd36a, opacity: 0.9 }); }
        if (Math.random() < dt * 0.35) { var s = Math.random() < 0.5 ? -1 : 1; if (d.squads[s].length) removeRunner(d, s, (Math.random() * d.squads[s].length) | 0); }
      } else {
        d.contest = 0;
        var who = inR['-1'] ? -1 : inR['1'] ? 1 : 0;
        if (who) d.prog = Math.max(-1, Math.min(1, d.prog + who * dt / CAPTURE_S));
      }
      if (!d.squads[-1].length && !d.squads[1].length) d.prog += (d.prog >= 0 ? 1 : -1) * dt / CAPTURE_S;   // nobody left: decays to whoever led
      setProg(d);
      if (d.prog <= -1) finish(d, -1); else if (d.prog >= 1) finish(d, 1);
      if (d.t > 90 && d.st === 'landed') { stats.lastResult = KINDS[d.kind].label + ' crate expired (nobody held it)'; cleanup(d); }
    }
    if (d.st === 'captured') {
      if (d.grp) d.grp.position.y = 0.6 + d.t * 1.5;
      if (d.t > 2.5) cleanup(d);
    }
    if (d.st === 'done' && d.plane) { /* plane still exiting */ }
  }

  // ------------------------------------------------------------------ UI (Map sheet)
  function buildUi() {
    var p = doc.createElement('div'); p.id = 'supplyPanel'; p.className = 'supply-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · SUPPLY <span class="qual sim">SIMULATED</span></div>' +
      '<table class="sup-tally"><thead><tr><th></th>' + KLIST.map(function (k) { return '<th style="color:' + KINDS[k].css + '">' + KINDS[k].label + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody><tr data-s="-1"><td class="b">Bulls</td>' + KLIST.map(function (k) { return '<td data-k="' + k + '">0</td>'; }).join('') + '</tr>' +
      '<tr data-s="1"><td class="r">Bears</td>' + KLIST.map(function (k) { return '<td data-k="' + k + '">0</td>'; }).join('') + '</tr></tbody></table>' +
      '<div class="sup-row"><button type="button" id="supCall">Call supply drop</button><span id="supStatus" class="sup-status">Next drop soon</span></div>' +
      '<div class="th-note">Crates are a game layer: they never change price, armies or the front. Your side wins intel = fog lifted 30 s, ammo = cooldowns −30%, power-up = +25 Moon Shot charge.</div>';
    var host = doc.querySelector('#sheet-map .sheet-body');
    if (host) { var tb = doc.getElementById('theaterBar'); if (tb && tb.parentNode === host) host.insertBefore(p, tb.nextSibling); else host.insertBefore(p, host.firstChild); }
    else { p.classList.add('floating'); p.hidden = true; doc.body.appendChild(p); }
    el.p = p; el.status = p.querySelector('#supStatus'); el.call = p.querySelector('#supCall');
    el.call.addEventListener('click', function () { callIn(); });
  }
  function renderUi() {
    if (!el.p) return;
    [-1, 1].forEach(function (s) { KLIST.forEach(function (k) { var c = el.p.querySelector('tr[data-s="' + s + '"] td[data-k="' + k + '"]'); if (c) c.textContent = tally[String(s)][k]; }); });
    var act = drops.filter(function (d) { return d.st !== 'done'; }), txt;
    if (act.length) { var d = act[0]; txt = d.st === 'inbound' ? 'Cargo plane inbound' : d.st === 'falling' ? KINDS[d.kind].label + ' crate under canopy' : d.st === 'landed' ? (d.contest > 0 ? 'CONTESTED · ' : '') + KINDS[d.kind].label + ' crate · ' + Math.round(Math.abs(d.prog) * 100) + '% ' + (d.prog < 0 ? 'Bulls' : d.prog > 0 ? 'Bears' : '') : stats.lastResult; }
    else txt = stats.lastResult || 'Next drop in ' + Math.ceil(Math.max(0, autoT)) + ' s';
    el.status.textContent = txt;
    el.call.disabled = callCd > 0;
    el.call.textContent = callCd > 0 ? 'Call supply drop (' + Math.ceil(callCd) + 's)' : 'Call supply drop';
  }
  function callIn() {
    if (!ready || callCd > 0) { if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('deny'); } catch (_) {} return null; }
    var side = playerSide(), d = spawnDrop({ called: true, x: frontX() + side * rnd(10, 22) });
    if (d) { callCd = CALL_CD; stats.called++; } else stats.lastResult = 'Drop zone busy, try again shortly';
    renderUi(); return d;
  }

  // ------------------------------------------------------------------ tick
  function update() {
    if (!enabled) return;
    var th = TH(); if (!th || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { build(); } catch (err) { enabled = false; console.warn('[supply] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive())) return;
    var F = fx();
    autoT -= dt; if (autoT <= 0) { autoT = rnd(70, 110); spawnDrop(); }
    if (callCd > 0) callCd = Math.max(0, callCd - dt);
    for (var i = drops.length - 1; i >= 0; i--) { var d = drops[i]; tickDrop(d, dt, F); if (d.st === 'done' && !d.plane) drops.splice(i, 1); else if (d.st === 'done' && d.plane) { d.plane.position.x += d.dir * dt * 48; if (Math.abs(d.plane.position.x - d.x) > 240) { root.remove(d.plane); d.plane = null; } } }
    for (var r = reveals.length - 1; r >= 0; r--) { reveals[r].t -= dt; if (reveals[r].t <= 0) reveals.splice(r, 1); }
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; renderUi(); }
  }

  LB.supply = {
    isEnabled: function () { return enabled && ready; }, update: update, callIn: callIn,
    spawn: function (o) { return ready ? spawnDrop(o) : null; },
    list: function () { return drops.filter(function (d) { return d.st !== 'done'; }).map(function (d) { return { id: d.id, x: d.x, z: d.z, kind: d.kind, st: d.st, prog: d.prog, contested: d.contest > 0, color: KINDS[d.kind].css }; }); },
    revealed: function (x, z) { for (var i = 0; i < reveals.length; i++) if (Math.hypot(reveals[i].x - x, reveals[i].z - z) < REVEAL_R) return true; return false; },
    getTally: function () { return JSON.parse(JSON.stringify(tally)); },
    getStats: function () { return Object.assign({ active: drops.filter(function (d) { return d.st !== 'done'; }).length, callCd: callCd, reveals: reveals.length }, stats); },
    KINDS: KINDS
  };
})(window);
