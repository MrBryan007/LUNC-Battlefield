/* LUNC Battlefield v12.0.4 — v12.1 "War Systems" part 4: defensive structures. Game/sim layer.
 * Bunkers, turrets and walls, paid from the war economy and unlocked by the Fortifications tech. Pick a type in
 * Map → WAR SYSTEMS · DEFENSES and tap the field (your side of the front only). Turrets swivel to the nearest enemy unit
 * in range and fire tracers; bunkers flash from the slit. Cosmetic game FX: never removes units, never moves the front,
 * never alters price. The enemy AI builds too. ?forts=0 turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('forts') !== '0' && qs.get('economy') !== '0' && qs.get('theaters') !== '0';
  var TYPES = {
    bunker: { label: 'Bunker', cost: { fuel: 8, ammo: 4 }, tip: 'Sandbagged bunker, MG slit', range: 22 },
    turret: { label: 'Turret', cost: { fuel: 6, ammo: 8 }, tip: 'Swivel gun, auto-tracks enemies', range: 28 },
    wall: { label: 'Wall', cost: { fuel: 6 }, tip: 'Concrete barrier line', range: 0 }
  };
  var TLIST = ['bunker', 'turret', 'wall'];
  var THREE, root, ready = false, last = 0, uiT = 0, aiT = 30, armed = null, el = {}, geo = {}, mat = {};
  var list = [], stats = { built: 0, aiBuilt: 0, shots: 0, last: '' };
  function E() { return LB.engine; }
  function ECO() { return LB.economy; }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function sideName(s) { return s < 0 ? 'BULL' : 'BEAR'; }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function cap() { return low() ? 5 : 8; }
  function count(side) { return list.filter(function (f) { return f.side === side; }).length; }
  function unlocked(side) { return !LB.tech || !LB.tech.has ? true : LB.tech.has(side, 'forts'); }
  function afford(side, t) { var st = ECO().getStock(side), c = TYPES[t].cost; for (var r in c) if ((st[r] || 0) < c[r]) return false; return true; }
  function frontX() { try { return E().getFrontlineX() || 0; } catch (_) { return 0; } }
  function radio(side, text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: side, type: 'forts', text: text }); } catch (_) {} }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }

  function build() {
    THREE = E().THREE; root = new THREE.Group(); root.name = 'v12-forts'; E().scene.add(root);
    geo.bunker = new THREE.CylinderGeometry(2.6, 3.1, 1.6, 10, 1);
    geo.roof = new THREE.CylinderGeometry(2.7, 2.7, 0.35, 10);
    geo.slit = new THREE.BoxGeometry(2.2, 0.3, 0.4);
    geo.sand = new THREE.SphereGeometry(0.55, 6, 4);
    geo.tBase = new THREE.CylinderGeometry(1.2, 1.5, 1.2, 8);
    geo.tHead = new THREE.BoxGeometry(1.4, 0.8, 1.4);
    geo.tGun = new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6);
    geo.wall = new THREE.BoxGeometry(1.9, 1.5, 0.6);
    mat.concrete = new THREE.MeshStandardMaterial({ color: 0x55534d, roughness: 0.95 });
    mat.sand = new THREE.MeshStandardMaterial({ color: 0x7a6744, roughness: 1 });
    mat.dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 });
    mat.metal = new THREE.MeshStandardMaterial({ color: 0x4d5550, roughness: 0.5, metalness: 0.6 });
    mat.side = { '-1': new THREE.MeshStandardMaterial({ color: 0x3fbf7f, roughness: 0.7 }), '1': new THREE.MeshStandardMaterial({ color: 0xd9564c, roughness: 0.7 }) };
    buildUi();
    global.addEventListener('pointerdown', function (e) {
      if (!armed || !e.target || e.target.tagName !== 'CANVAS') return;
      e.stopPropagation(); e.preventDefault();
      var p = E().pickGround(e.clientX, e.clientY); if (p) place(armed, p.x, p.z);
    }, true);
    global.addEventListener('keydown', function (e) { if (armed && e.code === 'Escape') { armed = null; renderUi(); } });
  }
  function mesh(type, side) {
    var g = new THREE.Group(), m;
    if (type === 'bunker') {
      m = new THREE.Mesh(geo.bunker, mat.concrete); m.position.y = 0.8; g.add(m);
      m = new THREE.Mesh(geo.roof, mat.concrete); m.position.y = 1.75; g.add(m);
      m = new THREE.Mesh(geo.slit, mat.dark); m.position.set(0, 1.25, -side * 2.75); g.add(m);
      for (var i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2; m = new THREE.Mesh(geo.sand, mat.sand); m.position.set(Math.cos(a) * 3.6, 0.35, Math.sin(a) * 3.6); m.scale.set(1.3, 0.7, 1); m.rotation.y = -a; g.add(m); }
      var flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.05), mat.side[String(side)]); flag.position.set(1.4, 2.6, 0); g.add(flag);
      g.userData.muzzle = new THREE.Vector3(0, 1.25, -side * 3);
    } else if (type === 'turret') {
      m = new THREE.Mesh(geo.tBase, mat.concrete); m.position.y = 0.6; g.add(m);
      var head = new THREE.Group(); head.position.y = 1.55; g.add(head);
      head.add(new THREE.Mesh(geo.tHead, mat.side[String(side)]));
      var gun = new THREE.Mesh(geo.tGun, mat.metal); gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.1, -1.5); head.add(gun);
      g.userData.head = head;
    } else {
      for (var j = -2; j <= 2; j++) { m = new THREE.Mesh(geo.wall, mat.concrete); m.position.set(0, 0.75, j * 2); m.rotation.y = Math.PI / 2; g.add(m); }
    }
    return g;
  }
  function place(type, x, z, side) {
    side = side == null ? playerSide() : side; var me = side === playerSide();
    var fail = function (msg) { if (me) { stats.last = msg; if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('deny'); } catch (_) {} renderUi(); } return null; };
    if (!ready || !TYPES[type]) return null;
    if (!unlocked(side)) return fail('Research Fortifications first');
    if (count(side) >= cap()) return fail('Defense cap reached (' + cap() + ')');
    if (!afford(side, type)) return fail('Not enough fuel/ammo');
    var fx = frontX();
    if ((x - fx) * side < 6) x = fx + side * 6;   // your side of the front only (bull = west = -1)
    x = Math.max(-150, Math.min(150, x)); z = Math.max(-80, Math.min(55, z));
    ECO().pay(side, TYPES[type].cost);
    var g = mesh(type, side); g.position.set(x, H(x, z), z); root.add(g);
    var f = { id: list.length + 1, type: type, side: side, x: x, z: z, g: g, cd: Math.random(), aim: 0, rise: 0 };
    g.scale.set(1, 0.05, 1); list.push(f);
    if (me) { stats.built++; armed = null; if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('arm'); } catch (_) {} } else stats.aiBuilt++;
    stats.last = sideName(side) + ' built a ' + TYPES[type].label.toLowerCase();
    var F = LB.heavyFx; if (F) try { F.puff({ kind: 'dust', x: x, y: 0.5, z: z, size: 3, grow: 2, life: 1.4, color: 0xb8a888, opacity: 0.6 }); } catch (_) {}
    radio(side, sideName(side) + ' ENGINEERS: "' + TYPES[type].label + ' up." (SIMULATED · game FX)');
    renderUi(); return { id: f.id, type: type, side: side, x: x, z: z };
  }
  function nearestEnemy(f, range) {
    var a; try { a = E().getArmies(); } catch (_) { return null; }
    var arr = f.side < 0 ? a.bears : a.bulls, best = null, bd = range * range;
    for (var i = 0; i < (arr || []).length; i += 2) { var u = arr[i]; if (!u || !u.position || u.visible === false) continue; var dx = u.position.x - f.x, dz = u.position.z - f.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = u; } }
    return best;
  }
  function step(dt) {
    var F = LB.heavyFx;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.rise < 1) { f.rise = Math.min(1, f.rise + dt * 1.5); f.g.scale.y = 0.05 + 0.95 * f.rise; }
      var R = TYPES[f.type].range; if (!R) continue;
      f.cd -= dt; if (f.cd > 0) continue; f.cd = f.type === 'turret' ? 1.1 : 1.8;
      var t = nearestEnemy(f, R); if (!t) continue;
      var tx = t.position.x, tz = t.position.z;
      if (f.g.userData.head) { f.aim = Math.atan2(-(tx - f.x), -(tz - f.z)); f.g.userData.head.rotation.y = f.aim; }
      if (F && F.tracers) try { F.tracers(f.x, f.z, tx, tz, f.type === 'turret' ? 3 : 2, f.type === 'turret' ? 1.6 : 1.2); stats.shots++; } catch (_) {}
    }
    aiT -= dt; if (aiT <= 0) { aiT = 35 + Math.random() * 25; var en = -playerSide(); if (unlocked(en) && count(en) < cap()) { var ty = TLIST[(Math.random() * 3) | 0]; if (afford(en, ty)) place(ty, frontX() + en * (12 + Math.random() * 25), -40 + Math.random() * 80, en); } }
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; renderUi(); }
  }

  function buildUi() {
    var p = doc.createElement('div'); p.id = 'fortsPanel'; p.className = 'supply-panel forts-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · DEFENSES <span class="qual sim">SIMULATED</span></div><div class="econ-actions">' +
      TLIST.map(function (t) { var c = TYPES[t].cost; return '<button type="button" data-fort="' + t + '" title="' + TYPES[t].tip + '">' + TYPES[t].label + '<small>' + Object.keys(c).map(function (r) { return c[r] + ' ' + r; }).join(' + ') + '</small></button>'; }).join('') +
      '</div><div class="sup-row"><span id="fortStatus" class="sup-status"></span></div><div class="th-note">Pick a type, then tap the field on your side of the front. Turrets and bunkers fire tracers at enemies in range — game FX only, they never remove units or move the front.</div>';
    el.p = p; el.status = p.querySelector('#fortStatus');
    p.addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-fort]'); if (!b) return;
      var t = b.getAttribute('data-fort'); armed = armed === t ? null : t;
      if (armed && LB.dock && LB.dock.close && E().mobile) try { LB.dock.close(); } catch (_) {}
      renderUi();
    });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('techPanel') || doc.getElementById('economyPanel'), p = el.p;
    if (anchor && anchor.parentNode && p.previousSibling !== anchor) { anchor.parentNode.insertBefore(p, anchor.nextSibling); p.classList.toggle('floating', anchor.classList.contains('floating')); }
    else if (!p.parentNode) doc.body.appendChild(p);
    if (anchor) p.hidden = anchor.hidden;
  }
  function renderUi() {
    if (!el.p) return; placeUi();
    var me = playerSide(), ok = unlocked(me);
    TLIST.forEach(function (t) { var b = el.p.querySelector('[data-fort="' + t + '"]'); if (!b) return; b.disabled = !ok || !afford(me, t) || count(me) >= cap(); b.classList.toggle('armed', armed === t); });
    el.status.textContent = !ok ? 'Locked · research Fortifications in the tech tree' : armed ? 'Placing ' + TYPES[armed].label + ' · tap the field (Esc cancels)' : 'Yours ' + count(me) + '/' + cap() + ' · enemy ' + count(-me) + (stats.last ? ' · ' + stats.last : '');
    doc.body.classList.toggle('fort-placing', !!armed);
  }
  function update() {
    if (!enabled) return;
    var eco = ECO(); if (!eco || !eco.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { build(); ready = true; } catch (err) { enabled = false; console.warn('[forts] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive())) return;
    step(dt);
  }
  LB.forts = {
    isEnabled: function () { return enabled && ready; }, update: update, place: place,
    arm: function (t) { armed = TYPES[t] ? t : null; renderUi(); },
    list: function () { return list.map(function (f) { return { type: f.type, side: f.side, x: f.x, z: f.z }; }); },
    getStats: function () { return Object.assign({ count: list.length, armed: armed }, stats); },
    TYPES: TYPES, _step: function (sec) { if (!ready) return; for (var t = 0; t < sec; t += 0.1) step(0.1); }
  };
})(window);
