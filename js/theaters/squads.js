/* LUNC Battlefield v12.0.9 — v12.1 "War Systems" part 6: squad commands with cover and flanking. Game layer.
 * v12.0.23: line of sight (LUNCBattle.los), a range / high-ground / cover / weather hit model, casualties (2 hp a man),
 * fall-back at 1 man, wipe-out + a fresh squad from HQ after 45 s, and slope-aware pace. ?los=0 = the v12.0.22 model.
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
  var stats = { orders: 0, aiOrders: 0, shots: 0, flanks: 0, covers: 0, hits: 0, kia: 0, wiped: 0, noLos: 0, fallbacks: 0, last: '' };
  var RESPAWN_S = 45, DOWN_S = 12;
  function LOS() { return LB.los && LB.los.isEnabled && LB.los.isEnabled() ? LB.los : null; }   // v12.0.23: off → v12.0.22 behaviour (no LOS, no casualties)
  function aliveN(S) { var n = 0; for (var i = 0; i < S.men.length; i++) if (S.men[i].alive) n++; return n; }
  function G(x, z) { var L = LOS(); return L ? L.ground(x, z) : H(x, z); }
  function E() { return LB.engine; }
  function RZ() { var a = LB.armyRealism; return a && a.isEnabled && a.isEnabled() && a.figure ? a : null; }
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
    [-1, 1].forEach(function (side) { NAMES.forEach(function (nm, i) { var S0 = makeSquad(side, nm, n, fx + side * (26 + i * 6), -24 + i * 24); S0.slotI = i; squads.push(S0); }); });
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
      if (RZ()) { b.material = RZ().material(side, 'uniform') || b.material; RZ().figure(m, side, side < 0 ? 0x2f9a66 : 0xb4473f, 1.08, 0.33); }   // v12.0.14 camo + IFF band
      men.push({ g: m, ox: ((i % 3) - 1) * 1.6, oz: (Math.floor(i / 3) - 0.5) * 1.8, ph: Math.random() * 6.28, hp: 2, alive: true, fall: 0, t: 0, x: x, z: z });
    }
    var ring = new THREE.Mesh(geo.ring, mat.sel); ring.rotation.x = -Math.PI / 2; ring.visible = false; root.add(ring);
    var wp = new THREE.Mesh(geo.mark, mat.wp); wp.rotation.x = Math.PI; wp.visible = false; root.add(wp);
    return { side: side, name: name, g: g, men: men, ring: ring, wp: wp, x: x, z: z, tx: x, tz: z, path: [], mode: 'hold', cover: false, sup: 0, cd: Math.random() * 2, n: n, dead: false, respawn: 0, fb: false, noLos: false, kills: 0, lost: 0 };
  }
  function nearestCover(S) {
    var best = null, bd = 1e9;
    (LB.forts && LB.forts.list ? LB.forts.list() : []).forEach(function (f) { if (f.side !== S.side || f.type === 'turret') return; var d = Math.hypot(f.x - S.x, f.z - S.z); if (d < bd) { bd = d; best = { x: f.x - S.side * 3, z: f.z }; } });
    (LB.lines && LB.lines.depots ? LB.lines.depots() : []).forEach(function (d0) { if (d0.side !== S.side || d0.hp <= 0) return; var d = Math.hypot(d0.x - S.x, d0.z - S.z); if (d < bd) { bd = d; best = { x: d0.x - S.side * 5, z: d0.z }; } });
    return best;
  }
  function order(S, kind, x, z) {
    var me = S.side === playerSide(), fx = frontX();
    if (S.dead) { if (me) { stats.last = S.name + ' is out of action — a fresh squad is on the way'; renderUi(); } return false; }
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
  var route = null, routeT = 0;
  function routeLine(S) {   // v12.0.22: the selected squad's route drawn on the ground, following the terrain (4 Hz)
    var now = performance.now(); if (now - routeT < 250 && route) return; routeT = now;
    if (!route) {
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(160 * 3), 3));
      route = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xffd36a, dashSize: 1.2, gapSize: 0.7, transparent: true, opacity: 0.9, depthWrite: false }));
      route.frustumCulled = false; route.renderOrder = 4; route.name = 'squad-route'; root.add(route);
    }
    var pts = [{ x: S.x, z: S.z }].concat(S.path), a = route.geometry.attributes.position, n = 0;
    for (var i = 1; i < pts.length && n < 159; i++) {
      var p0 = pts[i - 1], p1 = pts[i], L = Math.hypot(p1.x - p0.x, p1.z - p0.z), steps = Math.max(1, Math.ceil(L / 2));
      for (var k = (i === 1 ? 0 : 1); k <= steps && n < 160; k++) { var t = k / steps, x = p0.x + (p1.x - p0.x) * t, z = p0.z + (p1.z - p0.z) * t; a.setXYZ(n++, x, H(x, z) + 0.3, z); }
    }
    a.needsUpdate = true; route.geometry.setDrawRange(0, n); route.computeLineDistances(); route.visible = n > 1;
  }
  function hideRoute() { if (route) route.visible = false; }
  function enemyTarget(S) {
    var best = null, bd = RANGE * RANGE;
    var L = LOS(); S.noLos = false;
    squads.forEach(function (o) { if (o.side === S.side || o.dead) return; var d = (o.x - S.x) * (o.x - S.x) + (o.z - S.z) * (o.z - S.z); if (d >= bd) return; if (L && !L.clear(S.x, S.z, o.x, o.z, null, o.cover ? 0.7 : 1.1)) { S.noLos = true; return; } bd = d; best = { x: o.x, z: o.z, sq: o, d: Math.sqrt(d) }; });
    if (!best) try { var a = E().getArmies(), arr = S.side < 0 ? a.bears : a.bulls, bu = null; for (var i = 0; i < arr.length; i += 3) { var u = arr[i]; if (!u || !u.position) continue; var dx = u.position.x - S.x, dz = u.position.z - S.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; bu = u; } } if (bu && (!L || L.clear(S.x, S.z, bu.position.x, bu.position.z))) best = { x: bu.position.x, z: bu.position.z }; else if (bu) S.noLos = true; } catch (_) {}
    if (S.noLos && !best) stats.noLos++;
    return best;
  }
  // v12.0.23 hit model: range falloff, high ground, moving shooter, cover, shooter suppression, weather / night
  function hitChance(S, T, d) {
    var r = d <= 12 ? 0.26 : 0.26 * (1 - (d - 12) / 12 * 0.67), dh = G(S.x, S.z) - G(T.x, T.z);
    if (dh > 2) r *= 1.25; else if (dh < -2) r *= 0.85;
    if (S.path.length) r *= 0.6; if (T.cover) r *= 0.5; r *= 1 - S.sup * 0.5;
    if (LB.wxCombat && LB.wxCombat.mod) try { r *= LB.wxCombat.mod('gun') * LB.wxCombat.mod('sight'); } catch (_) {}
    return Math.max(0.02, Math.min(0.6, r));
  }
  function wound(T, S) {
    var up = T.men.filter(function (m) { return m.alive; }); if (!up.length) return;
    var M = up[(Math.random() * up.length) | 0]; M.hp--; stats.hits++;
    if (M.hp > 0) return;
    M.alive = false; M.fall = 0; M.t = 0; T.lost++; if (S) S.kills++; else stats.fortKills = (stats.fortKills || 0) + 1; stats.kia++;
    var n = aliveN(T), me = playerSide();
    if (n === 0) {
      T.dead = true; T.respawn = RESPAWN_S; T.path = []; T.mode = 'hold'; T.cover = false; stats.wiped++; if (T === sel) sel = null;
      radio(T.side, sideName(T.side) + ' ' + T.name.toUpperCase() + ': squad out of action. A fresh squad moves up from HQ in ' + RESPAWN_S + ' s. (SIMULATED · game FX)');
      if (T.side === me) stats.last = T.name + ' wiped out — replacements in ' + RESPAWN_S + ' s';
    } else if (n === 1 && !T.fb) {
      T.fb = true; stats.fallbacks++; order(T, 'move', frontX() + T.side * 60, T.z);
      radio(T.side, sideName(T.side) + ' ' + T.name.toUpperCase() + ': "One man left — falling back!" (SIMULATED · game FX)');
    } else if (T.side === me && n === 2) stats.last = T.name + ': taking casualties, ' + n + ' men left';
  }
  function respawn(S) {
    var fx = frontX(); S.dead = false; S.fb = false; S.sup = 0; S.cover = false; S.path = []; S.mode = 'hold';
    S.x = S.tx = fx + S.side * (26 + (S.slotI || 0) * 6 + 20); S.z = S.tz = -24 + (S.slotI || 0) * 24;
    S.men.forEach(function (M) { M.alive = true; M.hp = 2; M.fall = 0; M.t = 0; M.g.visible = true; M.g.rotation.set(0, 0, 0); });
    radio(S.side, sideName(S.side) + ' ' + S.name.toUpperCase() + ': "Fresh squad up from HQ, ready for orders." (SIMULATED · game FX)');
    order(S, 'move', fx + S.side * (26 + (S.slotI || 0) * 6), S.z);
  }
  function slopeK(S, dx, dz, d) {   // v12.0.23 slope-aware pace: uphill up to -45 %, downhill up to +15 %
    if (!LOS() || d < 0.5) return 1;
    var g = (G(S.x + dx / d, S.z + dz / d) - G(S.x, S.z));
    return g > 0 ? Math.max(0.55, 1 - g * 1.8) : Math.min(1.15, 1 - g * 0.6);
  }
  function step(dt) {
    var F = LB.heavyFx, me = playerSide();
    for (var i = 0; i < squads.length; i++) {
      var S = squads[i];
      S.sup = Math.max(0, S.sup - dt * 0.12);
      if (S.dead) { S.respawn -= dt; if (S.respawn <= 0) respawn(S); }
      if (S.fb && !S.dead && !S.path.length) { S.regroup = (S.regroup || 0) + dt; if (S.regroup > 20) { S.regroup = 0; S.fb = false; S.men.forEach(function (M) { if (!M.alive) { M.alive = true; M.hp = 2; M.fall = 0; M.t = 0; M.g.visible = true; M.g.rotation.set(0, 0, 0); } }); radio(S.side, sideName(S.side) + ' ' + S.name.toUpperCase() + ': "Replacements joined, back to full strength." (SIMULATED · game FX)'); renderUi(); } }
      if (S.path.length && !S.dead) {
        var p = S.path[0], dx = p.x - S.x, dz = p.z - S.z, d = Math.hypot(dx, dz), sp = SPEED * (1 - S.sup * 0.6) * slopeK(S, dx, dz, d) * dt;
        if (d <= sp) { S.x = p.x; S.z = p.z; S.path.shift(); if (!S.path.length) { if (S.mode === 'cover') S.cover = true; S.mode = S.mode === 'cover' ? 'cover' : 'hold'; } }
        else { S.x += dx / d * sp; S.z += dz / d * sp; S.hd = Math.atan2(dx, dz); }
      }
      var tg = S.dead ? null : enemyTarget(S);
      S.cd -= dt;
      if (tg) { S.hd = Math.atan2(tg.x - S.x, tg.z - S.z); if (S.cd <= 0) { var an = aliveN(S); S.cd = (1.2 + Math.random() * 0.8 + S.sup) * (LOS() ? Math.max(1, S.n / Math.max(1, an)) * 0.8 : 1); stats.shots++; if (F && F.tracers && !fogHidden(S.x, S.z)) try { F.tracers(S.x, S.z, tg.x, tg.z, 2, 1.0); } catch (_) {} if (tg.sq) { tg.sq.sup = Math.min(1, tg.sq.sup + (tg.sq.cover ? 0.06 : 0.12)); if (LOS() && Math.random() < hitChance(S, tg.sq, tg.d)) wound(tg.sq, S); } } }
      var hide = S.side !== me && fogHidden(S.x, S.z);
      S.g.visible = !hide;
      for (var m = 0, k = 0; m < S.men.length; m++) {
        var M = S.men[m];
        if (!M.alive) {   // v12.0.23: downed men fall where they were hit and lie for a while
          if (M.fall < 1) { M.fall = Math.min(1, M.fall + dt * 2.4); M.g.rotation.x = -M.fall * 1.45; M.g.scale.y = 1; M.g.position.y = H(M.x, M.z) + 0.1; }
          else { M.t += dt; if (M.t > DOWN_S) M.g.visible = false; }
          continue;
        }
        var ox = ((k % 3) - 1) * 1.6, oz = (Math.floor(k / 3) - 0.5) * 1.8; k++;   // formation closes up around the survivors
        M.ox += (ox - M.ox) * Math.min(1, dt * 1.5); M.oz += (oz - M.oz) * Math.min(1, dt * 1.5);
        var cx = S.x + M.ox, cz = S.z + M.oz, moving = S.path.length > 0; M.x = cx; M.z = cz;
        M.g.position.set(cx, H(cx, cz) + (moving ? Math.abs(Math.sin(performance.now() / 160 + M.ph)) * 0.15 : 0), cz);
        M.g.rotation.y = S.hd || 0; M.g.scale.y = S.cover ? 0.7 : 1;   // crouched in cover
      }
      S.ring.visible = S === sel; if (S === sel) S.ring.position.set(S.x, H(S.x, S.z) + 0.1, S.z);
      if (S === sel) routeLine(S);
      var last = S.path[S.path.length - 1]; S.wp.visible = S.side === me && !!last && (S === sel || S.mode === 'flank');
      if (last) S.wp.position.set(last.x, H(last.x, last.z) + 1.8 + Math.sin(performance.now() / 300) * 0.25, last.z);
    }
    if (!sel || !sel.path.length) hideRoute();
    aiT -= dt; if (aiT <= 0) { aiT = 14 + Math.random() * 12; var ai = squads.filter(function (s) { return s.side !== me && !s.dead && !s.fb; }), S2 = ai[(Math.random() * ai.length) | 0], r = Math.random(), fx = frontX();
      if (S2) { if (r < 0.3) order(S2, 'flank'); else if (r < 0.5 && nearestCover(S2)) order(S2, 'cover'); else if (r < 0.8) order(S2, 'move', fx + S2.side * (8 + Math.random() * 16), -40 + Math.random() * 80); else order(S2, 'hold'); } }
    uiT -= dt; if (uiT <= 0) { uiT = 0.4; renderUi(); }
  }

  function buildUi() {
    var p = doc.createElement('div'); p.id = 'squadsPanel'; p.className = 'supply-panel squads-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · SQUADS <span class="qual sim">SIMULATED</span></div><div class="sq-list"></div>' +
      '<div class="econ-actions sq-orders"><button type="button" data-o="move">Move<small>then tap field</small></button><button type="button" data-o="hold">Hold<small>stop &amp; fire</small></button><button type="button" data-o="flank">Flank<small>swing wide</small></button><button type="button" data-o="cover">Cover<small>wall/bunker/depot</small></button></div>' +
      '<div class="sup-row"><span id="sqStatus" class="sup-status"></span></div><div class="th-note">Pick a squad, then an order. In cover = half the incoming fire. Suppression slows a squad. Squads only fire at what they can see (hills, walls and bunkers block line of sight); range, high ground, cover and weather set the hit chance. Game layer: never removes market units or moves the front.</div>';
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
      b.querySelector('.sq-st').textContent = S.dead ? 'OUT · back in ' + Math.ceil(S.respawn) + ' s' : (S.cover ? 'IN COVER' : S.fb ? 'FALLING BACK' : S.mode.toUpperCase()) + (LOS() ? ' · ' + aliveN(S) + '/' + S.n : '') + (S.sup > 0.5 ? ' · SUPPRESSED' : '') + (S.noLos ? ' · NO LOS' : '');
      b.querySelector('.sq-sup span').style.width = Math.round(S.sup * 100) + '%';
    });
    el.p.querySelectorAll('button[data-o]').forEach(function (b) { b.disabled = !sel; b.classList.toggle('armed', b.getAttribute('data-o') === 'move' && moveArmed); });
    el.status.textContent = (stats.last || (sel ? sel.name + ' selected' : 'Pick a squad')) + (LOS() ? ' · KIA ' + mine.reduce(function (a, S) { return a + S.kills; }, 0) + ' / lost ' + mine.reduce(function (a, S) { return a + S.lost; }, 0) : '');
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
    // v12.0.22 tactical-map command: selection + routes for drawing (own routes only; enemy orders are never exposed)
    selected: function () { var mine = squads.filter(function (s) { return s.side === playerSide(); }); return sel ? mine.indexOf(sel) : -1; },
    routes: function () {
      var me = playerSide(), k = 0;
      return squads.map(function (S) { var own = S.side === me; return { side: S.side, name: S.name, i: own ? k++ : -1, own: own, x: S.x, z: S.z, mode: S.mode, cover: S.cover, sup: +S.sup.toFixed(2), sel: S === sel, visible: S.g.visible, dead: S.dead, alive: aliveN(S), n: S.n, fb: S.fb, noLos: S.noLos, path: own ? S.path.map(function (p) { return { x: p.x, z: p.z }; }) : [] }; });
    },
    list: function () { return squads.map(function (s) { return { side: s.side, name: s.name, x: +s.x.toFixed(1), z: +s.z.toFixed(1), mode: s.mode, cover: s.cover, sup: +s.sup.toFixed(2), path: s.path.length, alive: aliveN(s), n: s.n, dead: s.dead, respawn: +Math.max(0, s.respawn).toFixed(1), fb: s.fb, noLos: s.noLos, kills: s.kills, lost: s.lost }; }); },
    getStats: function () { return Object.assign({}, stats); },
    // v12.0.25: for fort turrets / bunkers — enemy squads of `side` they could shoot at, and a hit on one of them
    targetsFor: function (side) { var o = []; squads.forEach(function (S, k) { if (S.side !== side && !S.dead) o.push({ k: k, x: S.x, z: S.z, cover: S.cover, side: S.side }); }); return o; },
    woundAt: function (k) { var T = squads[k]; if (!T || T.dead || !LOS()) return false; wound(T, null); return true; },
    _place: function (k, x, z) { var S = squads[k]; if (!S) return false; S.x = S.tx = x; S.z = S.tz = z; S.path = []; S.mode = 'hold'; return true; },
    _hitChance: function (a, b) { var S = squads[a], T = squads[b]; return S && T ? hitChance(S, T, Math.hypot(S.x - T.x, S.z - T.z)) : 0; },
    _step: function (sec) { if (!ready) return; for (var t = 0; t < sec; t += 0.1) step(0.1); }
  };
})(window);
