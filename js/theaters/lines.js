/* LUNC Battlefield v12.0.6 — v12.1 "War Systems" part 5: supply lines you can cut + reinforcement waves. Game/sim layer.
 * Each side's HQ→front supply road has two depots. Strikes within 9 u of an enemy depot damage it; 3 hits destroy it and the
 * line is CUT: that side's economy income is halved, its convoys stop and its next reinforcement wave is delayed until the
 * depot is repaired (25 s, or 5 fuel to rebuild now). Reinforcement waves: every 75 s a column marches from the HQ to the
 * front and folds into the line. Visual game layer only: never changes the market-driven army count, price or the front.
 * ?lines=0 turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('lines') !== '0' && qs.get('theaters') !== '0';
  var ROAD_Z = -32, HQ_X = 205, DEPOT_X = [90, 150], HP = 3, REPAIR_S = 25, WAVE_S = 75, CUT_DELAY = 20, HIT_R = 9;
  var THREE, root, ready = false, last = 0, uiT = 0, raidT = 50, el = {}, geo = {}, mat = {}, wrapped = false;
  var depots = [], waves = [], waveT = { '-1': 30, '1': 38 }, stats = { cuts: 0, repairs: 0, waves: 0, raids: 0, hits: 0, last: '' };
  function E() { return LB.engine; }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function sideName(s) { return s < 0 ? 'BULL' : 'BEAR'; }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function radio(side, text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: side, type: 'lines', text: text }); } catch (_) {} }
  function frontX() { try { return E().getFrontlineX() || 0; } catch (_) { return 0; } }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function isCut(side) { for (var i = 0; i < depots.length; i++) if (depots[i].side === side && depots[i].hp <= 0) return true; return false; }

  function build() {
    THREE = E().THREE; root = new THREE.Group(); root.name = 'v12-lines'; E().scene.add(root);
    geo.tank = new THREE.CylinderGeometry(1.3, 1.3, 2.6, 10); geo.pad = new THREE.BoxGeometry(9, 0.3, 6); geo.shed = new THREE.BoxGeometry(3.4, 2.2, 2.6);
    geo.pole = new THREE.CylinderGeometry(0.06, 0.06, 4, 5); geo.flag = new THREE.BoxGeometry(1.2, 0.7, 0.05);
    geo.body = new THREE.CylinderGeometry(0.3, 0.36, 1.2, 6); geo.head = new THREE.SphereGeometry(0.26, 6, 5);
    mat.pad = new THREE.MeshStandardMaterial({ color: 0x4a463e, roughness: 1 });
    mat.tank = new THREE.MeshStandardMaterial({ color: 0x6d7368, roughness: 0.6, metalness: 0.3 });
    mat.shed = new THREE.MeshStandardMaterial({ color: 0x5a4a36, roughness: 0.9 });
    mat.wreck = new THREE.MeshStandardMaterial({ color: 0x1f1b17, roughness: 1 });
    mat.side = { '-1': new THREE.MeshStandardMaterial({ color: 0x3fbf7f, roughness: 0.7 }), '1': new THREE.MeshStandardMaterial({ color: 0xd9564c, roughness: 0.7 }) };
    mat.skin = new THREE.MeshStandardMaterial({ color: 0xc9a27e, roughness: 0.8 });
    [-1, 1].forEach(function (side) { DEPOT_X.forEach(function (dx, i) { depots.push(makeDepot(side, side * dx, ROAD_Z + (i ? 7 : -7), i ? 'rear' : 'forward')); }); });
    wrapStrikes(); buildUi();
  }
  function makeDepot(side, x, z, role) {
    var g = new THREE.Group(), y = H(x, z); g.position.set(x, y, z); root.add(g);
    var pad = new THREE.Mesh(geo.pad, mat.pad); pad.position.y = 0.15; g.add(pad);
    var parts = [];
    for (var i = 0; i < 2; i++) { var t = new THREE.Mesh(geo.tank, mat.tank); t.rotation.z = Math.PI / 2; t.position.set(-1.6, 1.6, -1.4 + i * 2.8); g.add(t); parts.push(t); }
    var s = new THREE.Mesh(geo.shed, mat.shed); s.position.set(2.6, 1.25, 0); g.add(s); parts.push(s);
    var p = new THREE.Mesh(geo.pole, mat.tank); p.position.set(4, 2, 2.4); g.add(p);
    var f = new THREE.Mesh(geo.flag, mat.side[String(side)]); f.position.set(4.6, 3.6, 2.4); g.add(f);
    return { g: g, side: side, x: x, z: z, role: role, hp: HP, repair: 0, parts: parts, flag: f, smokeT: 0 };
  }
  function wrapStrikes() {
    var th = LB.theaters; if (!th || wrapped || !th.onStrike) return;
    var orig = th.onStrike; wrapped = true;
    th.onStrike = function (x, z, power) { try { onImpact(x, z, power || 1); } catch (_) {} return orig.apply(this, arguments); };
  }
  function onImpact(x, z, power) {
    for (var i = 0; i < depots.length; i++) {
      var d = depots[i]; if (d.hp <= 0 || Math.hypot(d.x - x, d.z - z) > HIT_R * Math.max(1, Math.sqrt(power))) continue;
      d.hp = Math.max(0, d.hp - Math.max(1, Math.round(power))); stats.hits++;
      if (d.hp <= 0) destroy(d); else stats.last = sideName(d.side) + ' ' + d.role + ' depot hit (' + d.hp + '/' + HP + ')';
    }
    renderUi();
  }
  function destroy(d) {
    d.hp = 0; d.repair = REPAIR_S; stats.cuts++;
    d.parts.forEach(function (p) { p.material = mat.wreck; p.scale.y = 0.45; });
    d.flag.visible = false;
    var F = LB.heavyFx; if (F) try { F.puff({ kind: 'fire', x: d.x, y: 2, z: d.z, size: 4, grow: 3, life: 1.4, color: 0xff8a30, opacity: 0.95 }); F.puff({ kind: 'smoke', x: d.x, y: 3, z: d.z, size: 5, grow: 6, life: 4, color: 0x2a2622, opacity: 0.7 }); } catch (_) {}
    var k = String(d.side); waveT[k] = Math.max(waveT[k], CUT_DELAY);
    if (LB.voice && LB.voice.event) try { LB.voice.event('cut', d.side); } catch (_) {}
    stats.last = sideName(d.side) + ' supply line CUT (' + d.role + ' depot)';
    radio(-d.side, sideName(-d.side) + ' COMMAND: "Enemy ' + d.role + ' depot destroyed — their supply line is cut." (SIMULATED · game FX)');
    if (d.side === playerSide() && LB.sfx && LB.sfx.ui) try { LB.sfx.ui('deny'); } catch (_) {}
  }
  function repair(d, paid) {
    d.hp = HP; d.repair = 0; stats.repairs++;
    d.parts.forEach(function (p) { p.material = p.geometry === geo.shed ? mat.shed : mat.tank; p.scale.y = 1; });
    d.flag.visible = true;
    stats.last = sideName(d.side) + ' ' + d.role + ' depot ' + (paid ? 'rebuilt (5 fuel)' : 'repaired');
    radio(d.side, sideName(d.side) + ' ENGINEERS: "' + d.role.charAt(0).toUpperCase() + d.role.slice(1) + ' depot back up, convoys rolling." (SIMULATED · game FX)');
    renderUi();
  }
  function rebuildNow() {
    var me = playerSide(), d = depots.filter(function (x) { return x.side === me && x.hp <= 0; })[0];
    if (!d) return false;
    if (!LB.economy || !LB.economy.pay(me, { fuel: 5 })) { if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('deny'); } catch (_) {} stats.last = 'Need 5 fuel to rebuild'; renderUi(); return false; }
    repair(d, true); return true;
  }
  function raid(targetSide) {   // AI bomber run on a depot (game FX)
    var list = depots.filter(function (d) { return d.side === targetSide && d.hp > 0; }); if (!list.length) return null;
    var d = list[(Math.random() * list.length) | 0], F = LB.heavyFx, dir = -targetSide; stats.raids++;
    if (targetSide === playerSide()) { if (LB.voice && LB.voice.event) try { LB.voice.event('raid', -targetSide); } catch (_) {} }
    try { if (F && F.flyby) F.flyby({ kind: 'bomber', color: targetSide < 0 ? 0xd9564c : 0x3fbf7f, x0: d.x - dir * 160, z0: d.z - 20, x1: d.x + dir * 160, z1: d.z + 20, y: 24, dur: 4.6, scale: 2 }); } catch (_) {}
    for (var i = 0; i < 3; i++) (function (i) { setTimeout(function () { if (!ready) return; var x = d.x + (Math.random() - 0.5) * 8, z = d.z + (Math.random() - 0.5) * 8; if (F) try { F.puff({ kind: 'fire', x: x, y: 1, z: z, size: 2.6, grow: 2.4, life: 0.8, color: 0xffa040, opacity: 0.95 }); } catch (_) {} onImpact(x, z, 1); if (LB.craters && LB.craters.impact) try { LB.craters.impact(x, z, 0.9, { mode: 'ambient' }); } catch (_) {} }, 1600 + i * 350); })(i);
    radio(-targetSide, sideName(-targetSide) + ' AIR: "Bombing run on the enemy ' + d.role + ' depot." (SIMULATED · game FX)');
    return { x: d.x, z: d.z, role: d.role };
  }

  // reinforcement waves (visual column; never changes army counts)
  function launchWave(side) {
    var n = low() ? 6 : 12, col = [], x0 = side * HQ_X; stats.waves++;
    if (LB.voice && LB.voice.event) try { LB.voice.event('wave', side); } catch (_) {}
    for (var i = 0; i < n; i++) {
      var r = new THREE.Group(), b = new THREE.Mesh(geo.body, mat.side[String(side)]), h = new THREE.Mesh(geo.head, mat.skin);
      b.position.y = 0.6; h.position.y = 1.45; r.add(b); r.add(h); root.add(r);
      col.push({ g: r, off: i * 2.2, lane: (i % 2 ? 0.9 : -0.9), ph: Math.random() * 6.28 });
    }
    waves.push({ side: side, x: x0, col: col, st: 'march' });
    var me = side === playerSide();
    stats.last = sideName(side) + ' reinforcement wave inbound';
    radio(side, sideName(side) + ' HQ: "Reinforcement wave moving up the supply road." (SIMULATED · visual only, market sets army size)');
    if (me && LB.sfx && LB.sfx.ui) try { LB.sfx.ui('arm'); } catch (_) {}
  }
  function tickWaves(dt) {
    for (var w = waves.length - 1; w >= 0; w--) {
      var W = waves[w], tx = frontX() + W.side * 14, dirX = tx > W.x ? 1 : -1, sp = 9 * (isCut(W.side) ? 0.5 : 1);
      if (W.st === 'march') { W.x += dirX * sp * dt; if ((tx - W.x) * dirX <= 0) { W.st = 'fold'; W.t = 0; } }
      else W.t += dt;
      for (var i = 0; i < W.col.length; i++) {
        var c = W.col[i], x = W.x - dirX * c.off, z = ROAD_Z + c.lane + Math.sin((W.x + c.ph) * 0.8) * 0.2;
        if (W.st === 'fold') { z += (i - W.col.length / 2) * W.t * 2.4; c.g.scale.setScalar(Math.max(0.01, 1 - W.t / 2.5)); }
        c.g.position.set(x, H(x, z) + Math.abs(Math.sin((W.x + c.ph) * 3)) * 0.12, z); c.g.rotation.y = dirX > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      if (W.side !== playerSide()) { var fv = !(LB.fow && LB.fow.isActive && LB.fow.isActive()) || LB.fow.visible(W.x, ROAD_Z); for (var q = 0; q < W.col.length; q++) W.col[q].g.visible = fv; }   // v12.0.8 fog of war
      if (W.st === 'fold' && W.t > 2.5) { W.col.forEach(function (c) { root.remove(c.g); }); waves.splice(w, 1); }
    }
  }

  function step(dt) {
    var F = LB.heavyFx;
    for (var i = 0; i < depots.length; i++) {
      var d = depots[i];
      if (d.hp <= 0) { d.repair -= dt; d.smokeT -= dt; if (F && d.smokeT <= 0) { d.smokeT = 0.6; try { F.puff({ kind: 'smoke', x: d.x + (Math.random() - 0.5) * 3, y: 2, z: d.z, size: 2, grow: 4, life: 3, color: 0x2a2622, opacity: 0.55 }); } catch (_) {} } if (d.repair <= 0) repair(d, false); }
      else d.flag.rotation.y = Math.sin(performance.now() / 600 + i) * 0.3;
    }
    [-1, 1].forEach(function (s) { var k = String(s); waveT[k] -= dt * (isCut(s) ? 0.5 : 1); if (waveT[k] <= 0) { waveT[k] = WAVE_S; launchWave(s); } });
    tickWaves(dt);
    raidT -= dt; if (raidT <= 0) { raidT = 70 + Math.random() * 50; raid(playerSide()); }
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; renderUi(); }
  }

  function buildUi() {
    var p = doc.createElement('div'); p.id = 'linesPanel'; p.className = 'supply-panel lines-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · SUPPLY LINES &amp; WAVES <span class="qual sim">SIMULATED</span></div>' +
      '<div class="lines-grid"><div data-s="-1"><b class="b">Bulls</b><span class="ln-st"></span><span class="ln-wave"></span></div><div data-s="1"><b class="r">Bears</b><span class="ln-st"></span><span class="ln-wave"></span></div></div>' +
      '<div class="sup-row"><button type="button" id="lnRebuild">Rebuild depot (5 fuel)</button><span id="lnStatus" class="sup-status"></span></div>' +
      '<div class="th-note">Strike an enemy depot on its HQ road 3× to cut the line: half income, convoys stop, waves delayed until repaired (25 s). Waves are visual only — the market sets army size.</div>';
    el.p = p; el.status = p.querySelector('#lnStatus'); el.btn = p.querySelector('#lnRebuild');
    el.btn.addEventListener('click', function () { rebuildNow(); });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('fortsPanel') || doc.getElementById('techPanel') || doc.getElementById('economyPanel') || doc.getElementById('supplyPanel'), p = el.p;
    if (anchor && anchor.parentNode && p.previousSibling !== anchor) { anchor.parentNode.insertBefore(p, anchor.nextSibling); p.classList.toggle('floating', anchor.classList.contains('floating')); }
    else if (!anchor && !p.parentNode) { var host = doc.querySelector('#sheet-map .sheet-body'); (host || doc.body).appendChild(p); }
    if (anchor) p.hidden = anchor.hidden;
  }
  function renderUi() {
    if (!el.p) return; placeUi();
    [-1, 1].forEach(function (s) {
      var row = el.p.querySelector('[data-s="' + s + '"]'), cut = isCut(s), ds = depots.filter(function (d) { return d.side === s; });
      row.querySelector('.ln-st').textContent = cut ? 'CUT · repair ' + Math.ceil(Math.max.apply(null, ds.map(function (d) { return d.hp <= 0 ? d.repair : 0; }))) + ' s' : 'Intact · depots ' + ds.map(function (d) { return d.hp; }).join('/') + ' hp';
      row.querySelector('.ln-st').classList.toggle('cut', cut);
      row.querySelector('.ln-wave').textContent = 'Next wave ' + Math.ceil(waveT[String(s)]) + ' s';
    });
    var me = playerSide(); el.btn.disabled = !isCut(me);
    el.status.textContent = stats.last || 'Lines intact';
  }
  function update() {
    if (!enabled) return;
    var th = LB.theaters; if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { build(); ready = true; } catch (err) { enabled = false; console.warn('[lines] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive())) return;
    step(dt);
  }
  LB.lines = {
    isEnabled: function () { return enabled && ready; }, update: update, isCut: isCut, rebuildNow: rebuildNow, raid: raid,
    launchWave: function (s) { if (ready) launchWave(s == null ? playerSide() : s); },
    depots: function () { return depots.map(function (d) { return { side: d.side, x: d.x, z: d.z, role: d.role, hp: d.hp, repair: d.repair }; }); },
    getStats: function () { return Object.assign({ waves: waves.length, waveT: Object.assign({}, waveT) }, stats); },
    _step: function (sec) { if (!ready) return; for (var t = 0; t < sec; t += 0.1) step(0.1); }
  };
})(window);
