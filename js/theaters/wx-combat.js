/* LUNC Battlefield v12.0.18 — weather & cyber warfare affect combat (v12.1: deepen the basic weather + cyber layers).
 * Game/sim layer. One place that says how much the current conditions hurt each weapon system:
 *  · weather (Settings → WORLD: Clear / Rain / Fog) and night: naval gunnery spread, AA hit chance, IR-missile hits,
 *    direct-fire range of base MG / sentry / sniper positions, UAV sensors (uav.js already scales its own footprint)
 *  · rain makes the ground wet (darker, glossier) and throws splashes near the camera (MEDIUM+)
 *  · cyber: every hack (the v12.0 random pulse, or one the Commander orders) now also knocks out one enemy system for
 *    15 s — AA guns, UAV links or comms (a jammed tactical map) — on top of the existing radar blind in fow.js
 *  · Map → WAR SYSTEMS · WEATHER & CYBER: live modifiers, outages per side, Counter-hack (5 intel) and Cyber attack (8 intel)
 * Never alters price, armies, the frontline or data labels (SIMULATED). ?wxcombat=0 (or ?theaters=0) → v12.0.17 behaviour. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('wxcombat') !== '0' && qs.get('theaters') !== '0';
  var E = function () { return LB.engine; };
  var OUT_S = 15, IMMUNE_S = 30, HACK_CD = 60, COST_COUNTER = { intel: 5 }, COST_HACK = { intel: 8 };
  var SYS = ['aa', 'uav', 'comms'], NAMES = { aa: 'AA guns', uav: 'UAV links', comms: 'comms', radar: 'radar' };
  // multipliers per condition (realism: radar-laid naval guns lose less than eyes; IR seekers suffer in rain/fog)
  var WX = {
    clear: { gun: 1, aa: 1, ir: 1, sight: 1 },
    rain: { gun: 1.35, aa: 0.75, ir: 0.8, sight: 0.82 },
    fog: { gun: 1.7, aa: 0.55, ir: 0.65, sight: 0.55 }
  };
  var NIGHT = { gun: 1.15, aa: 0.85, ir: 1, sight: 0.75 };
  var ready = false, last = 0, uiT = 0, out = { '-1': {}, '1': {} }, immune = { '-1': 0, '1': 0 }, hackCd = 0, el = {}, wet = 0, ground = null, gBase = null, splT = 0;
  var stats = { hacks: 0, outages: 0, counters: 0, playerHacks: 0, last: '', wet: 0 };
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bear' ? 1 : -1; } catch (_) { return -1; } }
  function sideName(s) { return s < 0 ? 'BULL' : 'BEAR'; }
  function weather() { try { return LB.v12extras.getOptions().weather || 'clear'; } catch (_) { return 'clear'; } }
  function night() { return !!(doc.body && doc.body.classList.contains('night')); }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function mod(kind, side) {
    if (!enabled) return 1;
    if (kind === 'aa' && side != null && offline(side, 'aa')) return 0;
    var w = WX[weather()] || WX.clear, v = w[kind] != null ? w[kind] : 1;
    if (night()) v *= NIGHT[kind] != null ? NIGHT[kind] : 1;
    return v;
  }
  function offline(side, sys) { var o = out[String(side)]; return !!(enabled && o && o[sys] > 0); }

  // ------------------------------------------------------------------ cyber
  function wrapAi() {
    if (!LB.ai || !LB.ai.send || LB.ai.send._wx) return;
    var s0 = LB.ai.send, g = function (msg) { try { if (msg && msg.type === 'cyber' && (msg.side === -1 || msg.side === 1) && !msg._wx) onHack(msg.side, null); } catch (_) {} return s0.apply(this, arguments); };
    g._wx = true; g._fow = s0._fow; g._snd = s0._snd; LB.ai.send = g;
  }
  function onHack(attacker, sys) {
    var victim = -attacker, k = String(victim); stats.hacks++;
    if (immune[k] > 0) { stats.last = sideName(victim) + ' firewall held'; radio(victim, sideName(victim) + ' CYBER: intrusion blocked, firewall held.'); return null; }
    sys = sys || SYS[(Math.random() * SYS.length) | 0];
    out[k][sys] = OUT_S; stats.outages++; stats.last = sideName(victim) + ' ' + NAMES[sys] + ' down ' + OUT_S + ' s';
    radio(victim, sideName(victim) + ' CYBER: ' + NAMES[sys] + ' offline — hostile intrusion, restoring in ' + OUT_S + ' seconds.', victim === playerSide() ? 3 : 1);
    if (sys === 'comms') applyJam();
    renderUi(); return sys;
  }
  function radio(side, text, pri) {
    if (!LB.voice || !LB.voice.say) return;
    try { LB.voice.say({ pri: pri != null ? pri : 2, side: side, callsign: 'Cyber cell', text: text, intercepted: side !== playerSide(), tag: 'SIMULATED' }); } catch (_) {}
  }
  function playerHack() {
    if (!ready) return note('Not ready', false);
    if (hackCd > 0) return note('Cyber attack ready in ' + Math.ceil(hackCd) + ' s', false);
    var me = playerSide();
    if (LB.economy && LB.economy.isEnabled && LB.economy.isEnabled() && !LB.economy.pay(me, COST_HACK)) return note('Need ' + COST_HACK.intel + ' intel for a cyber attack', false);
    hackCd = HACK_CD; stats.playerHacks++;
    doc.body.classList.add('cyber-glitch'); setTimeout(function () { doc.body.classList.remove('cyber-glitch'); }, 700);
    var sys = null;
    if (LB.ai && LB.ai.send) {   // through the shared bus so fow.js also blinds the enemy radar
      try { LB.ai.send({ side: me, type: 'cyber', _wx: true, text: sideName(me) + ' CYBER: Commander-ordered intrusion on the enemy network (SIMULATED)' }); } catch (_) {}
    }
    sys = onHack(me, null);
    return note(sys ? 'Enemy ' + NAMES[sys] + ' down for ' + OUT_S + ' s (and their radar blinded)' : 'Enemy firewall held', !!sys);
  }
  function counterHack() {
    if (!ready) return note('Not ready', false);
    var me = playerSide(), k = String(me), any = false;
    for (var s in out[k]) if (out[k][s] > 0) any = true;
    var radar = false; try { radar = LB.fow && LB.fow.getStats && LB.fow.getStats().radarDownS[k] > 0; } catch (_) {}
    if (!any && !radar && immune[k] > 0) return note('Firewall already up (' + Math.ceil(immune[k]) + ' s)', false);
    if (LB.economy && LB.economy.isEnabled && LB.economy.isEnabled() && !LB.economy.pay(me, COST_COUNTER)) return note('Need ' + COST_COUNTER.intel + ' intel for a counter-hack', false);
    out[k] = {}; immune[k] = IMMUNE_S; stats.counters++;
    if (LB.fow && LB.fow.clearRadar) try { LB.fow.clearRadar(me); } catch (_) {}
    applyJam();
    radio(me, sideName(me) + ' CYBER: systems restored, firewall up for ' + IMMUNE_S + ' seconds.', 2);
    return note('Systems restored · firewall ' + IMMUNE_S + ' s', true);
  }
  function note(t, ok) { stats.last = t; if (el.note) el.note.textContent = t; renderUi(); return { ok: ok, text: t }; }
  function applyJam() {
    var on = offline(playerSide(), 'comms');
    doc.body.classList.toggle('comms-jammed', on);
    if (!el.jam) { el.jam = doc.createElement('div'); el.jam.id = 'jamOverlay'; el.jam.className = 'jam-overlay'; el.jam.innerHTML = '<span>COMMS JAMMED</span>'; doc.body.appendChild(el.jam); }
    el.jam.hidden = !on;
    var inset = doc.getElementById('worldInset');
    if (inset && on) { var r = inset.getBoundingClientRect(); el.jam.style.left = r.left + 'px'; el.jam.style.top = r.top + 'px'; el.jam.style.width = r.width + 'px'; el.jam.style.height = r.height + 'px'; }
  }

  // ------------------------------------------------------------------ wet ground + rain splashes
  function findGround() {
    if (ground) return ground;
    try { E().scene.traverse(function (o) { if (!ground && o.isMesh && o.name === 'ground' && o.material && o.material.color) ground = o; }); } catch (_) {}
    if (ground) gBase = { c: ground.material.color.clone(), r: ground.material.roughness, m: ground.material.metalness };
    return ground;
  }
  function tickWet(dt) {
    var target = weather() === 'rain' ? 1 : 0;
    wet += (target - wet) * Math.min(1, dt / (target ? 20 : 45));   // soaks in over ~20 s, dries over ~45 s
    if (Math.abs(target - wet) < 0.002) wet = target;
    stats.wet = +wet.toFixed(3);
    var g = findGround(); if (!g || !gBase) return;
    var m = g.material, k = wet;
    m.color.copy(gBase.c).multiplyScalar(1 - 0.3 * k);
    m.roughness = gBase.r + (0.5 - gBase.r) * k;
    if (weather() === 'rain' && !low()) {
      splT -= dt; var F = LB.heavyFx;
      if (F && splT <= 0) {
        splT = 0.06; var T = E().getCameraTarget();
        for (var i = 0; i < 2; i++) { var x = T.x + rnd(-28, 28), z = T.z + rnd(-22, 22); F.puff({ kind: 'dust', x: x, y: 0.15, z: z, vy: 1.2, size: 0.18, grow: 1.6, life: 0.35, color: 0xc9d4dc, opacity: 0.45, drag: 0.85 }); }
      }
    }
  }

  // ------------------------------------------------------------------ UI
  function pct(v) { var p = Math.round((v - 1) * 100); return (p > 0 ? '+' : '') + p + ' %'; }
  function buildUi() {
    var p = doc.createElement('div'); p.id = 'wxPanel'; p.className = 'supply-panel wx-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · WEATHER &amp; CYBER <span class="qual sim">SIMULATED</span></div>' +
      '<div class="inv-status" id="wxStatus"></div>' +
      '<div class="econ-actions">' +
      '<button type="button" id="wxCounter">Counter-hack<small>' + COST_COUNTER.intel + ' intel · restore + firewall</small></button>' +
      '<button type="button" id="wxHack">Cyber attack<small>' + COST_HACK.intel + ' intel · 15 s outage</small></button>' +
      '</div>' +
      '<div class="sup-row"><span id="wxNote" class="sup-status"></span></div>' +
      '<div class="th-note">Rain and fog widen naval gunnery spread, cut AA and IR-missile hits and shorten direct-fire range; night adds to it. Hacks knock out one enemy system (AA, UAV links or comms) for 15 s and blind their radar. Change weather in Settings → WORLD. Game layer only — never moves the front. ?wxcombat=0 turns it off.</div>';
    el.p = p; el.status = p.querySelector('#wxStatus'); el.note = p.querySelector('#wxNote');
    p.querySelector('#wxCounter').addEventListener('click', function () { counterHack(); });
    p.querySelector('#wxHack').addEventListener('click', function () { playerHack(); });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('uavPanel') || doc.getElementById('invasionPanel') || doc.getElementById('squadsPanel') || doc.getElementById('supplyPanel');
    var p = el.p; if (!p) return;
    if (anchor && anchor.parentNode) {
      if (p.parentNode !== anchor.parentNode || p.previousSibling !== anchor) anchor.parentNode.insertBefore(p, anchor.nextSibling);
      p.classList.toggle('floating', anchor.classList.contains('floating')); p.hidden = anchor.hidden;
    } else if (!p.parentNode) { var host = doc.querySelector('#sheet-map .sheet-body'); (host || doc.body).appendChild(p); }
  }
  function outages(side) {
    var o = out[String(side)], a = [];
    for (var s in o) if (o[s] > 0) a.push(NAMES[s] + ' ' + Math.ceil(o[s]) + ' s');
    try { var rd = LB.fow.getStats().radarDownS[String(side)]; if (rd > 0) a.push('radar ' + Math.ceil(rd) + ' s'); } catch (_) {}
    if (immune[String(side)] > 0) a.push('firewall ' + Math.ceil(immune[String(side)]) + ' s');
    return a.length ? a.join(', ') : 'all systems up';
  }
  function renderUi() {
    if (!el.status) return;
    var w = weather(), n = night(), me = playerSide();
    el.status.innerHTML = '<div><b>' + w.toUpperCase() + (n ? ' · NIGHT' : '') + '</b> · gunnery spread ' + pct(mod('gun')) + ' · AA hits ' + pct(mod('aa')) + ' · IR missiles ' + pct(mod('ir')) + ' · direct-fire range ' + pct(mod('sight')) + (wet > 0.02 ? ' · ground wet ' + Math.round(wet * 100) + ' %' : '') + '</div>' +
      '<div>Your side (' + sideName(me) + '): ' + outages(me) + '</div><div>Enemy (' + sideName(-me) + '): ' + outages(-me) + '</div>' +
      (hackCd > 0 ? '<div>Cyber attack ready in ' + Math.ceil(hackCd) + ' s</div>' : '');
  }

  // ------------------------------------------------------------------ tick
  function step(dt) {
    if (hackCd > 0) hackCd -= dt;
    var jamWas = offline(playerSide(), 'comms');
    [-1, 1].forEach(function (s) { var k = String(s), o = out[k]; for (var q in o) { o[q] -= dt; if (o[q] <= 0) { delete o[q]; if (s === playerSide()) radio(s, sideName(s) + ' CYBER: ' + NAMES[q] + ' back online.', 1); } } if (immune[k] > 0) immune[k] -= dt; });
    if (jamWas !== offline(playerSide(), 'comms') || jamWas) applyJam();
    tickWet(dt);
  }
  function update() {
    if (!enabled) return;
    var th = LB.theaters; if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { buildUi(); ready = true; } catch (err) { enabled = false; console.warn('[wx-combat] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    wrapAi();
    if (e.isPaused && e.isPaused()) return;
    step(dt);
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; placeUi(); renderUi(); }
  }

  LB.wxCombat = {
    version: 'v12.0.18', isEnabled: function () { return enabled && ready; }, update: update,
    mod: mod, offline: offline, hack: playerHack, counter: counterHack,
    getState: function () { return { weather: weather(), night: night(), wet: +wet.toFixed(3), mods: { gun: mod('gun'), aa: mod('aa'), ir: mod('ir'), sight: mod('sight') }, out: JSON.parse(JSON.stringify(out)), immune: Object.assign({}, immune), hackCd: Math.max(0, +hackCd.toFixed(1)), stats: Object.assign({}, stats) }; },
    // test hooks
    _hack: function (attacker, sys) { return onHack(attacker, sys); },
    _step: function (sec) { for (var t = 0; t < sec; t += 0.1) step(0.1); renderUi(); },
    _resetCd: function () { hackCd = 0; immune = { '-1': 0, '1': 0 }; }
  };
})(window);
