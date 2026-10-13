/* LUNC Battlefield v12.0.2 — v12.1 "War Systems" part 2: war economy. Game/sim layer.
 * Per-side stockpiles of fuel / ammo / intel. Income every 4 s is weighted by market signals and is labelled
 * ESTIMATED · SIMULATED: fuel ← the side's share of the army (market walls), ammo ← |momentum|, intel ← the side that
 * momentum favours. Captured supply crates add +5 of their kind. The Commander spends stock in Map → WAR SYSTEMS:
 * Recon sweep, Rearm, Rush drop. Never alters price, armies or the frontline. ?economy=0 (or ?theaters=0) turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('economy') !== '0' && qs.get('theaters') !== '0';
  var E = function () { return LB.engine; };
  var RES = ['fuel', 'ammo', 'intel'], TICK = 4, CAP = 99;
  var ACTIONS = {
    recon: { label: 'Recon sweep', cost: { intel: 6 }, tip: 'Reveals 70 u around the front for 20 s' },
    rearm: { label: 'Rearm', cost: { ammo: 8 }, tip: 'Active Commander cooldowns −30 %' },
    rush: { label: 'Rush drop', cost: { fuel: 8 }, tip: 'Resets the supply-drop call cooldown' }
  };
  var stock = { '-1': { fuel: 4, ammo: 4, intel: 2 }, '1': { fuel: 4, ammo: 4, intel: 2 } };
  var earned = { '-1': { fuel: 0, ammo: 0, intel: 0 }, '1': { fuel: 0, ammo: 0, intel: 0 } };
  var lastRate = { '-1': { fuel: 0, ammo: 0, intel: 0 }, '1': { fuel: 0, ammo: 0, intel: 0 } };
  var stats = { ticks: 0, spent: 0, aiSpent: 0, crates: 0, last: '' };
  var ready = false, last = 0, tickT = TICK, uiT = 0, aiT = 30, el = {}, lastTally = null;
  var listeners = [];
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function sideName(s) { return s < 0 ? 'BULL' : 'BEAR'; }
  function radio(side, text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: side, type: 'economy', text: text }); } catch (_) {} }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function rates() {   // market-weighted income per tick (ESTIMATED · SIMULATED)
    var e = E(), nb = 1, nr = 1, m = 0;
    try { var a = e.getArmies(); nb = (a.bulls || []).length || 1; nr = (a.bears || []).length || 1; } catch (_) {}
    try { m = e.getMomentum() || 0; } catch (_) {}
    var shareB = nb / (nb + nr), am = clamp(0.6 + Math.abs(m) * 30, 0.6, 1.8), lean = clamp(m * 40, -1, 1);
    var r = {};
    r['-1'] = { fuel: 0.4 + shareB * 1.2, ammo: am, intel: 0.3 + Math.max(0, lean) * 0.7 };
    r['1'] = { fuel: 0.4 + (1 - shareB) * 1.2, ammo: am, intel: 0.3 + Math.max(0, -lean) * 0.7 };
    return r;
  }
  function income() {
    var r = rates(); stats.ticks++;
    [-1, 1].forEach(function (s) { var k = String(s); RES.forEach(function (x) { var v = r[k][x]; lastRate[k][x] = v; stock[k][x] = Math.min(CAP, stock[k][x] + v); earned[k][x] += v; }); });
    // supply crates banked since last tick → +5 of their kind (power-ups go to ammo)
    if (LB.supply && LB.supply.getTally) {
      var t = LB.supply.getTally();
      if (lastTally) [-1, 1].forEach(function (s) { var k = String(s); ['fuel', 'ammo', 'intel', 'power'].forEach(function (x) { var d = (t[k][x] || 0) - (lastTally[k][x] || 0); if (d > 0) { var to = x === 'power' ? 'ammo' : x; stock[k][to] = Math.min(CAP, stock[k][to] + 5 * d); stats.crates += d; } }); });
      lastTally = t;
    }
    emit();
  }
  function can(side, id) { var a = ACTIONS[id], st = stock[String(side)]; if (!a) return false; for (var r in a.cost) if (st[r] < a.cost[r]) return false; return true; }
  function pay(side, id) { var a = ACTIONS[id], st = stock[String(side)]; for (var r in a.cost) st[r] -= a.cost[r]; }
  function apply(side, id) {
    var me = side === playerSide(), fx = 0;
    try { fx = E().getFrontlineX() || 0; } catch (_) {}
    if (id === 'recon') { if (me && LB.supply && LB.supply.addReveal) LB.supply.addReveal(fx - side * 30, 0, 20); }
    else if (id === 'rearm') { if (me) try { var cds = LB.commander.getState().cds; for (var k in cds) if (cds[k] > 0) cds[k] *= 0.7; } catch (_) {} }
    else if (id === 'rush') { if (me && LB.supply && LB.supply.resetCallCd) LB.supply.resetCallCd(); }
  }
  function spend(id, side) {
    if (!ready) return false;
    side = side == null ? playerSide() : side;
    if (!can(side, id)) { if (side === playerSide() && LB.sfx && LB.sfx.ui) try { LB.sfx.ui('deny'); } catch (_) {} return false; }
    pay(side, id); apply(side, id);
    if (side === playerSide()) { stats.spent++; if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('arm'); } catch (_) {} } else stats.aiSpent++;
    stats.last = sideName(side) + ' · ' + ACTIONS[id].label;
    radio(side, sideName(side) + ' LOGISTICS: "' + ACTIONS[id].label + ' authorised." (SIMULATED · game FX)');
    emit(); renderUi(); return true;
  }
  function aiSpend() {   // the side the Commander is not on spends when it can afford it (radio line only)
    var s = -playerSide(), ids = Object.keys(ACTIONS).filter(function (id) { return can(s, id); });
    if (ids.length) spend(ids[(Math.random() * ids.length) | 0], s);
  }
  function emit() { listeners.forEach(function (f) { try { f(api.getState()); } catch (_) {} }); }

  // ------------------------------------------------------------------ UI
  function buildUi() {
    var p = doc.createElement('div'); p.id = 'economyPanel'; p.className = 'supply-panel econ-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · ECONOMY <span class="qual est">ESTIMATED · SIMULATED</span></div>' +
      '<table class="sup-tally econ-tally"><thead><tr><th></th><th style="color:#ff9a3c">Fuel</th><th style="color:#ff5a5a">Ammo</th><th style="color:#5ab4ff">Intel</th></tr></thead><tbody>' +
      [-1, 1].map(function (s) { return '<tr data-s="' + s + '"><td class="' + (s < 0 ? 'b' : 'r') + '">' + (s < 0 ? 'Bulls' : 'Bears') + '</td>' + RES.map(function (r) { return '<td data-k="' + r + '">0</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table><div class="econ-actions">' +
      Object.keys(ACTIONS).map(function (id) { var a = ACTIONS[id], c = Object.keys(a.cost).map(function (r) { return a.cost[r] + ' ' + r; }).join(' + '); return '<button type="button" data-act="' + id + '" title="' + a.tip + '">' + a.label + '<small>' + c + '</small></button>'; }).join('') +
      '</div><div class="th-note">Income every 4 s: fuel ← army share (market walls), ammo ← |momentum|, intel ← the side momentum favours. Crates add +5. A game layer: never changes price, armies or the front.</div>';
    var host = doc.querySelector('#sheet-map .sheet-body'), sp = doc.getElementById('supplyPanel');
    if (sp && sp.parentNode) sp.parentNode.insertBefore(p, sp.nextSibling);
    else if (host) host.appendChild(p);
    else { p.classList.add('floating'); doc.body.appendChild(p); }
    el.p = p;
    p.addEventListener('click', function (ev) { var b = ev.target.closest('button[data-act]'); if (b) spend(b.getAttribute('data-act')); });
  }
  function placeUi() {   // keep the panel right under the supply panel, wherever the dock moved it
    var sp = doc.getElementById('supplyPanel'), p = el.p;
    if (sp && sp.parentNode && p.previousSibling !== sp) { sp.parentNode.insertBefore(p, sp.nextSibling); p.classList.toggle('floating', sp.classList.contains('floating')); }
    if (sp) p.hidden = sp.hidden;
  }
  function renderUi() {
    if (!el.p) return;
    placeUi();
    var me = playerSide();
    [-1, 1].forEach(function (s) { RES.forEach(function (r) { var c = el.p.querySelector('tr[data-s="' + s + '"] td[data-k="' + r + '"]'); if (c) { c.textContent = Math.floor(stock[String(s)][r]); c.title = '+' + lastRate[String(s)][r].toFixed(2) + ' / 4 s'; } }); });
    Object.keys(ACTIONS).forEach(function (id) { var b = el.p.querySelector('button[data-act="' + id + '"]'); if (b) b.disabled = !can(me, id); });
  }

  function step(dt) {
    tickT -= dt; if (tickT <= 0) { tickT += TICK; income(); }
    aiT -= dt; if (aiT <= 0) { aiT = 40 + Math.random() * 30; aiSpend(); }
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; renderUi(); }
  }
  function update() {
    if (!enabled) return;
    var th = LB.theaters; if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { buildUi(); ready = true; } catch (err) { enabled = false; console.warn('[economy] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive())) return;
    step(dt);
  }
  var api = LB.economy = {
    isEnabled: function () { return enabled && ready; }, update: update, spend: spend, can: function (id, s) { return can(s == null ? playerSide() : s, id); },
    pay: function (side, cost) { var st = stock[String(side)]; for (var r in cost) if (st[r] < cost[r]) return false; for (var q in cost) st[q] -= cost[q]; emit(); renderUi(); return true; },   // for tech / structures
    getStock: function (s) { return Object.assign({}, stock[String(s == null ? playerSide() : s)]); },
    getState: function () { return { stock: JSON.parse(JSON.stringify(stock)), earned: JSON.parse(JSON.stringify(earned)), rate: JSON.parse(JSON.stringify(lastRate)), stats: Object.assign({}, stats) }; },
    onChange: function (f) { listeners.push(f); }, ACTIONS: ACTIONS, playerSide: playerSide,
    _step: function (sec) { if (!ready) return; for (var t = 0; t < sec; t += 0.1) step(0.1); }
  };
})(window);
