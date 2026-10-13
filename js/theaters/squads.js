/* LUNC Battlefield v12.0.9 — v12.1 "War Systems" part 6: squad commands with cover and flanking. Game layer.
 * Three player squads (Alpha/Bravo/Charlie) and three enemy AI squads. Orders: Move (pick a squad, tap the field), Hold,
 * Flank (wide swing along the north/south edge, then a hook into the enemy side), Cover (nearest friendly wall/bunker/
 * depot; IN COVER halves incoming fire). Squads trade tracer fire; fire builds suppression (slower moves).
 * Cosmetic only: never removes market units, never moves the front, never alters price. ?squads=0 turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('squads') !== '0' && qs.get('theaters') !== '0';
  var NAMES = ['Alpha', 'Bravo', 'Charlie'], RANGE = 24, SPEED = 5.5;
  var THREE, root, ready = false, last = 0, uiT = 0, aiT = 12, el = {}, geo = {}, mat = {}, squads = [], sel = null, moveArmed = false;
  var stats = { orders: 0, aiOrders: 0, shots: 0, flanks: 0, covers: 0, last: '' };
  function E() { return LB.engine; }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function sideName(s) { return s < 0 ? 'BULL' : 'BEAR'; }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function frontX() { try { return E().getFrontlineX() || 0; } catch (_) { return 0; } }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function radio(side, text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: side, type: 'squad', text: text }); } catch (_) {} }
  function fogHidden(x, z) { return LB.fow && LB.fow.isActive && LB.fow.isActive() && !LB.fow.visible(x, z); }

  function build() {
    THREE = E().THREE; root = new THREE.Group(); root.name = 'v12-squads'; E().scene.add(root);
    geo.body = new THREE.CylinderGeometry(0.3, 0.36, 1.2, 6); geo.head = new THREE.SphereGeometry(0.27, 6, 5); geo.gun = new THREE.BoxGeometry(0.08, 0.08, 0.9);
    geo.ring = new THREE.RingGeometry(3.2, 3.6, 28); geo.mark = new THREE.ConeGeometry(0.5, 1, 4);
    mat.side = { '-1': new THREE.MeshStandardMaterial({ color: 0x2f9a66, roughness: 0.75 }), '1': new THREE.MeshStandardMaterial({ color: 0xb4473f, roughness: 0.75 }) };
    mat.skin = new THREE.MeshStandardMaterial({ color: 0xc9a27e, roughness: 0.8 }); mat.gun = new THREE.MeshStandardMaterial({ color: 0x222222 });
    mat.sel = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    mat.wp = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.7 });
    var n = low() ? 3 : 5, fx = frontX();
    [-1, 1].forEach(function (side) { NAMES.forEach(function (nm, i) { squads.push(makeSquad(side, nm, n, fx + side * (26 + i * 6), -24 + i * 24)); }); });
    buildUi();
    global.addEventListener('pointerdown', function (e) {
      if (!moveArmed || !sel || !e.target || e.target.tagName !== 'CANVAS' || e.target.id === 'worldInset') return;
      e.stopPropagation(); e.preventDefault();
      var p = E().pickGround(e.clientX, e.clientY); if (p) order(sel, 'move', p.x, p.z);
    }, true);
  }
  function makeSquad(side, name, n, x, z) {
    var g = new THREE.Group(); root.add(g); var men = [];
    for (var i = 0; i < n; i++) {
      var m = new THREE.Group(), b = new THREE.Mesh(geo.body, mat.side[String(side)]), h = new THREE.Mesh(geo.head, mat.skin), gun = new THREE.Mesh(geo.gun, mat.gun);
      b.position.y = 0.6; h.position.y = 1.45; gun.position.set(0.3, 0.95, 0.35); m.add(b); m.add(h); m.add(gun); g.add(m);
      men.push({ g: m, ox: ((i % 3) - 1) * 1.6, oz: (Math.floor(i / 3) - 0.5) * 1.8, ph: Math.random() * 6.28 });
    }
    var ring = new THREE.Mesh(geo.ring, mat.sel); ring.rotation.x = -Math.PI / 2; ring.visible = false; root.add(ring);
    var wp = new THREE.Mesh(geo.mark, mat.wp); wp.rotation.x = Math.PI; wp.visible = false; root.add(wp);
    return { side: side, name: name, g: g, men: men, ring: ring, wp: wp, x: x, z: z, tx: x, tz: z, path: [], mode: 'hold', cover: false, sup: 0, cd: Math.random() * 2 };
  }
  function nearestCover(S) {
    var best = null, bd = 1e9;
    (LB.forts && LB.forts.list ? LB.forts.list() : []).forEach(function (f) { if (f.side !== S.side || f.type === 'turret') return; var d = Math.hypot(f.x - S.x, f.z - S.z); if (d < bd) { bd = d; best = { x: f.x - S.side * 3, z: f.z }; } });
    (LB.lines && LB.lines.depots ? LB.lines.depots() : []).forEach(function (d0) { if (d0.side !== S.side || d0.hp <= 0) return; var d = Math.hypot(d0.x - S.x, d0.z - S.z); if (d < bd) { bd = d; best = { x: d0.x - S.side * 5, z: d0.z }; } });
    return best;
  }
  function order(S, kind, x, z) {
    var me = S.side === playerSide(), fx = frontX();
    S.cover = false; S.path = [];
    if (kind === 'hold') { S.mode = 'hold'; S.tx = S.x; S.tz = S.z; }
    else if (kind === 'move') { S.mode = 'move'; S.path = [{ x: Math.max(-200, Math.min(200, x)), z: Math.max(-80, Math.min(55, z)) }]; }
    else if (kind === 'flank') {
      var edge = S.z >= 0 ? 48 : -70; S.mode = 'flank'; stats.flanks++;
      S.path = [{ x: S.x, z: edge }, { x: fx - S.side * 18, z: edge }, { x: fx - S.side * 26, z: edge * 0.45 }];
    } else if (kind === 'cover') {
      var c = nearestCover(S); if (!c) { if (me) { stats.last = S.name + ': no friendly cover — build a wall or bunker'; renderUi(); } return false; }
      S.mode = 'cover'; S.path = [c]; stats.covers++;
    }
    if (me) { stats.orders++; moveArmed = false; if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('arm'); } catch (_) {} } else stats.aiOrders++;
    stats.last = sideName(S.side) + ' ' + S.name + ': ' + kind.toUpperCase();
    if (LB.voice && LB.voice.event) try { LB.voice.event('squad_' + kind, S.side); } catch (_) {}
    radio(S.side, sideName(S.side) + ' ' + S.name.toUpperCase() + ': "' + ({ hold: 'Holding position.', move: 'Moving.', flank: 'Flanking — swinging wide.', cover: 'Moving to cover.' })[kind] + '" (SIMULATED · game FX)');
    renderUi(); return true;
  }
  function enemyTarget(S) {
    var best = null, bd = RANGE * RANGE;
    squads.forEach(function (o) { if (o.side === S.side) return; var d = (o.x - S.x) * (o.x - S.x) + (o.z - S.z) * (o.z - S.z); if (d < bd) { bd = d; best = { x: o.x, z: o.z, sq: o }; } });
    if (!best) try { var a = E().getArmies(), arr = S.side < 0 ? a.bears : a.bulls; for (var i = 0; i < arr.length; i += 3) { var u = arr[i]; if (!u || !u.position) continue; var dx = u.position.x - S.x, dz = u.position.z - S.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = { x: u.position.x, z: u.position.z }; } } } catch (_) {}
    return best;
  }
  function step(dt) {
    var F = LB.heavyFx, me = playerSide();
    for (var i = 0; i < squads.length; i++) {
      var S = squads[i];
      S.sup = Math.max(0, S.sup - dt * 0.12);
      if (S.path.length) {
        var p = S.path[0], dx = p.x - S.x, dz = p.z - S.z, d = Math.hypot(dx, dz), sp = SPEED * (1 - S.sup * 0.6) * dt;
        if (d <= sp) { S.x = p.x; S.z = p.z; S.path.shift(); if (!S.path.length) { if (S.mode === 'cover') S.cover = true; S.mode = S.mode === 'cover' ? 'cover' : 'hold'; } }
        else { S.x += dx / d * sp; S.z += dz / d * sp; S.hd = Math.atan2(dx, dz); }
      }
      var tg = enemyTarget(S);
      S.cd -= dt;
      if (tg) { S.hd = Math.atan2(tg.x - S.x, tg.z - S.z); if (S.cd <= 0) { S.cd = 1.2 + Math.random() * 0.8 + S.sup; stats.shots++; if (F && F.tracers && !fogHidden(S.x, S.z)) try { F.tracers(S.x, S.z, tg.x, tg.z, 2, 1.0); } catch (_) {} if (tg.sq) tg.sq.sup = Math.min(1, tg.sq.sup + (tg.sq.cover ? 0.06 : 0.12)); } }
      var hide = S.side !== me && fogHidden(S.x, S.z);
      S.g.visible = !hide;
      for (var m = 0; m < S.men.length; m++) {
        var M = S.men[m], cx = S.x + M.ox, cz = S.z + M.oz, moving = S.path.length > 0;
        M.g.position.set(cx, H(cx, cz) + (moving ? Math.abs(Math.sin(performance.now() / 160 + M.ph)) * 0.15 : 0), cz);
        M.g.rotation.y = S.hd || 0; M.g.scale.y = S.cover ? 0.7 : 1;   // crouched in cover
      }
      S.ring.visible = S === sel; if (S === sel) S.ring.position.set(S.x, H(S.x, S.z) + 0.1, S.z);
      var last = S.path[S.path.length - 1]; S.wp.visible = S.side === me && !!last && (S === sel || S.mode === 'flank');
      if (last) S.wp.position.set(last.x, H(last.x, last.z) + 1.8 + Math.sin(performance.now() / 300) * 0.25, last.z);
    }
    aiT -= dt; if (aiT <= 0) { aiT = 14 + Math.random() * 12; var ai = squads.filter(function (s) { return s.side !== me; }), S2 = ai[(Math.random() * ai.length) | 0], r = Math.random(), fx = frontX();
      if (S2) { if (r < 0.3) order(S2, 'flank'); else if (r < 0.5 && nearestCover(S2)) order(S2, 'cover'); else if (r < 0.8) order(S2, 'move', fx + S2.side * (8 + Math.random() * 16), -40 + Math.random() * 80); else order(S2, 'hold'); } }
    uiT -= dt; if (uiT <= 0) { uiT = 0.4; renderUi(); }
  }

  function buildUi() {
    var p = doc.createElement('div'); p.id = 'squadsPanel'; p.className = 'supply-panel squads-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · SQUADS <span class="qual sim">SIMULATED</span></div><div class="sq-list"></div>' +
      '<div class="econ-actions sq-orders"><button type="button" data-o="move">Move<small>then tap field</small></button><button type="button" data-o="hold">Hold<small>stop &amp; fire</small></button><button type="button" data-o="flank">Flank<small>swing wide</small></button><button type="button" data-o="cover">Cover<small>wall/bunker/depot</small></button></div>' +
      '<div class="sup-row"><span id="sqStatus" class="sup-status"></span></div><div class="th-note">Pick a squad, then an order. In cover = half the incoming fire. Suppression slows a squad. Game layer: never removes market units or moves the front.</div>';
    el.p = p; el.list = p.querySelector('.sq-list'); el.status = p.querySelector('#sqStatus');
    el.list.innerHTML = NAMES.map(function (n, i) { return '<button type="button" class="sq-btn" data-i="' + i + '"><b>' + n + '</b><span class="sq-st"></span><i class="sq-sup"><span></span></i></button>'; }).join('');
    p.addEventListener('click', function (ev) {
      var b = ev.target.closest('.sq-btn'); if (b) { var mine = squads.filter(function (s) { return s.side === playerSide(); }); sel = mine[+b.getAttribute('data-i')] || null; moveArmed = false; renderUi(); return; }
      var o = ev.target.closest('button[data-o]'); if (!o || !sel) return;
      var k = o.getAttribute('data-o');
      if (k === 'move') { moveArmed = !moveArmed; if (moveArmed && LB.dock && LB.dock.close && E().mobile) try { LB.dock.close(); } catch (_) {} stats.last = moveArmed ? sel.name + ': tap the field to move' : ''; renderUi(); }
      else order(sel, k);
    });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('linesPanel') || doc.getElementById('fortsPanel') || doc.getElementById('supplyPanel'), p = el.p;
    if (anchor && anchor.parentNode && p.previousSibling !== anchor) { anchor.parentNode.insertBefore(p, anchor.nextSibling); p.classList.toggle('floating', anchor.classList.contains('floating')); }
    else if (!anchor && !p.parentNode) { var host = doc.querySelector('#sheet-map .sheet-body'); (host || doc.body).appendChild(p); }
    if (anchor) p.hidden = anchor.hidden;
  }
  function renderUi() {
    if (!el.p) return; placeUi();
    var mine = squads.filter(function (s) { return s.side === playerSide(); });
    mine.forEach(function (S, i) {
      var b = el.list.querySelector('[data-i="' + i + '"]'); if (!b) return;
      b.classList.toggle('sel', S === sel);
      b.querySelector('.sq-st').textContent = (S.cover ? 'IN COVER' : S.mode.toUpperCase()) + (S.sup > 0.5 ? ' · SUPPRESSED' : '');
      b.querySelector('.sq-sup span').style.width = Math.round(S.sup * 100) + '%';
    });
    el.p.querySelectorAll('button[data-o]').forEach(function (b) { b.disabled = !sel; b.classList.toggle('armed', b.getAttribute('data-o') === 'move' && moveArmed); });
    el.status.textContent = stats.last || (sel ? sel.name + ' selected' : 'Pick a squad');
    doc.body.classList.toggle('sq-moving', moveArmed);
  }
  function update() {
    if (!enabled) return;
    var th = LB.theaters; if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { build(); ready = true; } catch (err) { enabled = false; console.warn('[squads] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive())) return;
    step(dt);
  }
  LB.squads = {
    isEnabled: function () { return enabled && ready; }, update: update,
    select: function (i) { var mine = squads.filter(function (s) { return s.side === playerSide(); }); sel = mine[i] || null; renderUi(); return !!sel; },
    order: function (kind, x, z, i) { var mine = squads.filter(function (s) { return s.side === playerSide(); }), S = i != null ? mine[i] : sel; return S ? order(S, kind, x, z) : false; },
    armMove: function () { if (sel) { moveArmed = true; renderUi(); } },
    list: function () { return squads.map(function (s) { return { side: s.side, name: s.name, x: +s.x.toFixed(1), z: +s.z.toFixed(1), mode: s.mode, cover: s.cover, sup: +s.sup.toFixed(2), path: s.path.length }; }); },
    getStats: function () { return Object.assign({}, stats); },
    _step: function (sec) { if (!ready) return; for (var t = 0; t < sec; t += 0.1) step(0.1); }
  };
})(window);
