/* LUNC Battlefield v12.0.42 — power-ups (v12.1 War Systems: "Power-ups and score multipliers"). Game layer.
 * Four timed power-ups for the Commander: Double Points (30 s, score x2 on top of the combo), Rapid Reload (20 s,
 * cooldowns run twice as fast), Combo Lock (20 s, the combo doesn't time out) and Moon Fuel (+25 Moon Shot charge).
 * Sources: a power crate your side wins (supply.js) gives a random one, and a glowing field pickup appears on the land
 * battlefield about every 75 s (90 s on LOW / phones) for 25 s; land any Commander strike within 5 m to collect it.
 * Active power-ups live on the Commander session (session.pu), so hot-seat players keep their own.
 * Only score, cooldowns and combo timing change: never market data, armies, the front or data-truth labels.
 * ?powerups=0 → off (power crates go back to +25 Moon Shot charge). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('powerups') !== '0' && qs.get('theaters') !== '0';
  var DEF = {
    double: { name: 'Double Points', icon: '×2', dur: 30, color: 0xffd36a, css: '#ffd36a', desc: 'Score x2' },
    reload: { name: 'Rapid Reload', icon: '⟳', dur: 20, color: 0x6ad1ff, css: '#6ad1ff', desc: 'Cooldowns x2 speed' },
    combo: { name: 'Combo Lock', icon: '∞', dur: 20, color: 0xc28bff, css: '#c28bff', desc: 'Combo never times out' },
    moon: { name: 'Moon Fuel', icon: '☾', dur: 0, color: 0x9fffb0, css: '#9fffb0', desc: '+25 Moon Shot charge' }
  };
  var IDS = ['double', 'reload', 'combo', 'moon'];
  var THREE, root, pick = null, spawnT = 40, ready = false, lastF = 0, el = {}, uiT = 0;
  var stats = { granted: 0, fromCrates: 0, fromField: 0, spawned: 0, expired: 0, byId: {}, bonus: 0 };
  function E() { return LB.engine; }
  function C() { return LB.commander && LB.commander.getState ? LB.commander.getState() : null; }
  function sess() { var c = C(); return c && c.session ? c.session : null; }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function act() { var s = sess(); if (!s) return null; s.pu = s.pu || {}; return s.pu; }
  function on(id) { var a = act(); return !!(enabled && a && a[id] > 0); }

  /** Give the Commander a power-up (id or random). source: 'crate' | 'field' | 'test' */
  function grant(id, source) {
    if (!enabled) return null;
    if (!DEF[id]) id = IDS[(Math.random() * IDS.length) | 0];
    var d = DEF[id], s = sess(); if (!s) return null;
    if (id === 'moon') s.charge = Math.min(100, (s.charge || 0) + 25);
    else { var a = act(); a[id] = Math.max(a[id] || 0, 0) + d.dur; }
    stats.granted++; stats.byId[id] = (stats.byId[id] || 0) + 1;
    if (source !== 'test' && LB.commander && LB.commander.missionProgress) try { LB.commander.missionProgress('pu', 1); } catch (_) {}   // v12.0.44 editor objective
    if (source === 'crate') stats.fromCrates++; else if (source === 'field') stats.fromField++;
    banner(d);
    if (LB.sfx && LB.sfx.success) try { LB.sfx.success(); } catch (_) {}
    render(true);
    return id;
  }
  // ------------------------------------------------------------- hooks used by commander.js
  function scoreMult() { return on('double') ? 2 : 1; }
  function cdRate() { return on('reload') ? 2 : 1; }
  function comboLocked() { return on('combo'); }
  function noteScore(base, gained) { if (on('double')) stats.bonus += Math.round(gained / 2); }
  function strikeAt(x, z) {   // collect a field pickup with any strike near it
    if (!enabled || !pick || pick.taken) return false;
    if (Math.hypot(x - pick.x, z - pick.z) > 5) return false;
    pick.taken = true; pick.g.visible = false; var id = pick.id; pick = null;
    grant(id, 'field'); return true;
  }

  // ------------------------------------------------------------- field pickup (a glowing beacon on the land battlefield)
  function build() {
    THREE = E().THREE; root = new THREE.Group(); root.name = 'v12-powerups'; E().scene.add(root);
  }
  function spawn() {
    var fx = 0; try { fx = E().getFrontlineX() || 0; } catch (_) {}
    var id = IDS[(Math.random() * IDS.length) | 0], d = DEF[id];
    var x = fx + (Math.random() * 2 - 1) * 22, z = (Math.random() * 2 - 1) * 34;
    var g = new THREE.Group();
    var core = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: d.color }));
    core.position.y = 2.2; g.add(core);
    var ring = new THREE.Mesh(new THREE.RingGeometry(4.4, 5, 32), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; g.add(ring);
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 7; g.add(beam);
    g.position.set(x, H(x, z), z); root.add(g);
    if (pick && pick.g) dispose(pick.g);
    pick = { id: id, x: x, z: z, g: g, core: core, ring: ring, beam: beam, t: 25, taken: false };
    stats.spawned++;
    if (LB.voice && LB.voice.say) try { LB.voice.say({ pri: 1, side: 0, callsign: 'Watchtower', text: 'Watchtower, power-up beacon on the field. ' + d.name + '. Hit it with a strike to collect, over.', tag: 'SIMULATED' }); } catch (_) {}
  }
  function dispose(g) { if (g.parent) g.parent.remove(g); g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  function tickPick(dt) {
    var c = C(); if (!c || !c.started) return;
    if (!pick) { spawnT -= dt; if (spawnT <= 0) { spawnT = low() ? 90 : 75; spawn(); } return; }
    pick.t -= dt;
    var tt = performance.now() / 1000;
    pick.core.rotation.y += dt * 2; pick.core.position.y = 2.2 + Math.sin(tt * 2.4) * 0.3;
    var fade = Math.min(1, pick.t / 4); pick.ring.material.opacity = 0.35 + 0.25 * Math.sin(tt * 4) * fade; pick.beam.material.opacity = 0.22 * fade;
    pick.ring.scale.setScalar(0.92 + 0.08 * Math.sin(tt * 3));
    if (pick.t <= 0) { dispose(pick.g); pick = null; stats.expired++; }
  }

  // ------------------------------------------------------------- HUD
  function buildUi() {
    var host = doc.getElementById('cmdLayer'); if (!host) return false;
    var w = doc.createElement('div'); w.id = 'puChips'; w.className = 'pu-chips'; w.setAttribute('aria-live', 'polite');
    host.appendChild(w); el.w = w;
    var b = doc.createElement('div'); b.id = 'puBanner'; b.className = 'pu-banner'; host.appendChild(b); el.b = b;
    return true;
  }
  function banner(d) {
    if (!el.b) return;
    el.b.innerHTML = '<b style="color:' + d.css + '">' + d.icon + '</b> POWER-UP · ' + d.name + '<small>' + d.desc + (d.dur ? ' · ' + d.dur + ' s' : '') + '</small>';
    el.b.classList.remove('on'); void el.b.offsetWidth; el.b.classList.add('on');
    clearTimeout(el.bt); el.bt = setTimeout(function () { el.b.classList.remove('on'); }, 2600);
  }
  function render(force) {
    if (!el.w) return; var a = act() || {}, html = '';
    IDS.forEach(function (id) { var d = DEF[id], t = a[id] || 0; if (!d.dur || t <= 0) return;
      html += '<div class="pu-chip" data-pu="' + id + '" style="--pu:' + d.css + '"><b>' + d.icon + '</b><span>' + d.name + '</span><em>' + Math.ceil(t) + 's</em><i style="width:' + Math.round(Math.min(1, t / d.dur) * 100) + '%"></i></div>'; });
    var s = sess(), mult = s ? (1 + Math.min(9, s.combo || 0) * 0.25) * scoreMult() : 1;
    if (mult > 1.01) html += '<div class="pu-chip pu-mult" style="--pu:#ffd36a"><b>×' + (Math.round(mult * 100) / 100) + '</b><span>score</span></div>';
    if (pick && !pick.taken) html += '<div class="pu-chip pu-field" style="--pu:' + DEF[pick.id].css + '"><b>◎</b><span>' + DEF[pick.id].name + ' on the field</span><em>' + Math.ceil(pick.t) + 's</em></div>';
    if (force || el.w._h !== html) { el.w.innerHTML = html; el.w._h = html; }
  }
  function update() {
    if (!enabled) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { var th = LB.theaters; if (!th || !th.isEnabled || !th.isEnabled() || !doc.getElementById('cmdLayer')) return; try { build(); buildUi(); ready = true; } catch (err) { enabled = false; console.warn('[powerups] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(1, (now - (lastF || now)) / 1000); lastF = now;
    if (e.isPaused && e.isPaused()) return;
    if (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive()) return;
    var a = act();
    if (a) IDS.forEach(function (id) { if (a[id] > 0) { a[id] = Math.max(0, a[id] - dt); if (a[id] === 0) stats.expired++; } });
    tickPick(dt);
    uiT -= dt; if (uiT <= 0) { uiT = 0.25; render(false); }
  }
  LB.powerups = {
    isEnabled: function () { return enabled; }, update: update, grant: grant, strikeAt: strikeAt,
    scoreMult: scoreMult, cdRate: cdRate, comboLocked: comboLocked, noteScore: noteScore,
    getState: function () { var a = act() || {}; return Object.assign({ enabled: enabled, ready: ready, active: Object.assign({}, a), field: pick ? { id: pick.id, x: +pick.x.toFixed(1), z: +pick.z.toFixed(1), t: +pick.t.toFixed(1) } : null, spawnIn: +spawnT.toFixed(1) }, stats, { byId: Object.assign({}, stats.byId) }); },
    _spawn: function () { if (ready) { spawn(); return pick && { x: pick.x, z: pick.z, id: pick.id }; } return null; }
  };
})(window);
