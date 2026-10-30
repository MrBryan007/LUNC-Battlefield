/* LUNC Battlefield v12.0.43 — army line of sight (v12.1 War Systems: "Still open: LOS for the market-army tanks").
 * Hooked from battle-engine maybeFire for the market armies (fire visuals only):
 *  · Direct fire (infantry type 0, MBT type 1) engages a real enemy ground unit within reach that it can actually see
 *    (LB.los.trace: MBT sight 2.4 m, rifle 1.6 m, target centre 0.9 m), with a small spread (MBT 0.8 m, rifle 1.6 m).
 *    Enemies in reach but all hidden → hold fire and re-check in ~0.6 s. Nobody in reach → the old suppressive fire at
 *    the price front, so the line never goes quiet.
 *  · Indirect fire (SPG type 2) needs an observer: a friendly rifle or MBT near the front that can see the aim point.
 *    Observed → normal spread; unobserved → 2.2x spread.
 * Never touches market data, army counts, the price-driven front or data-truth labels.
 * ?armylos=0 → off (also off with ?los=0 / ?theaters=0). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('armylos') !== '0' && qs.get('los') !== '0' && qs.get('theaters') !== '0';
  var REACH = 24, SAMPLES = 10, SIGHT = { 0: 1.6, 1: 2.4 }, SPREAD = { 0: 1.6, 1: 0.8 }, AIM = 0.9, UNOBS = 2.2;
  var stats = { engaged: 0, held: 0, fallback: 0, observed: 0, unobserved: 0, checks: 0, by: { ground: 0, wall: 0, bunker: 0 }, last: '' };
  var el = {};
  function E() { return LB.engine; }
  function L() { return LB.los && LB.los.isEnabled && LB.los.isEnabled() ? LB.los : null; }
  function armies() { try { return E().getArmies(); } catch (_) { return null; } }
  function ground(u) { var ud = u.userData || {}; return u.visible !== false && !ud.air && ud.dead !== true && (ud.type | 0) <= 2 && u.position.y < 6; }
  function see(los, x1, z1, x2, z2, eye) {
    stats.checks++;
    var r = los.trace(x1, z1, x2, z2, eye, AIM);
    if (!r.ok && stats.by[r.by] != null) stats.by[r.by]++;
    return r.ok;
  }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

  /** Direct fire: returns { mode: 'engage', x, z, target } | { mode: 'hold' } | { mode: 'fallback' } */
  function direct(u, type) {
    var los = L(), a = armies(); if (!enabled || !los || !a) return { mode: 'fallback' };
    var side = u.userData.side, foes = side < 0 ? a.bears : a.bulls; if (!foes || !foes.length) return { mode: 'fallback' };
    var px = u.position.x, pz = u.position.z, cand = [], n = foes.length, start = (Math.random() * n) | 0, tries = Math.min(n, SAMPLES * 6);
    for (var i = 0; i < tries && cand.length < SAMPLES; i++) {
      var f = foes[(start + i * 7) % n]; if (!f || !f.position || !ground(f)) continue;
      var dx = f.position.x - px, dz = f.position.z - pz, d = dx * dx + dz * dz; if (!(d <= REACH * REACH)) continue;
      cand.push({ u: f, d: d });
    }
    if (!cand.length) { stats.fallback++; return { mode: 'fallback' }; }
    cand.sort(function (p, q) { return p.d - q.d; });
    var eye = SIGHT[type] || 1.6;
    for (var j = 0; j < Math.min(4, cand.length); j++) {
      var t = cand[j].u;
      if (see(los, px, pz, t.position.x, t.position.z, eye)) {
        var s = SPREAD[type] || 1.6; stats.engaged++;
        return { mode: 'engage', x: t.position.x + gauss() * s, z: t.position.z + gauss() * s, target: t };
      }
    }
    stats.held++; stats.last = (side < 0 ? 'Bull' : 'Bear') + (type === 1 ? ' MBT' : ' rifle') + ' held fire, no line of sight';
    return { mode: 'hold' };
  }

  /** Indirect fire: returns a spread multiplier (1 observed, UNOBS unobserved). */
  function indirect(u, toX, toZ) {
    var los = L(), a = armies(); if (!enabled || !los || !a) return 1;
    var side = u.userData.side, own = side < 0 ? a.bulls : a.bears, n = (own || []).length; if (!n) return UNOBS;
    var start = (Math.random() * n) | 0, looked = 0;
    for (var i = 0; i < Math.min(n, 60) && looked < 6; i++) {
      var o = own[(start + i * 5) % n]; if (!o || !o.position || !ground(o)) continue;
      var ty = o.userData.type | 0; if (ty > 1) continue;
      var dx = toX - o.position.x, dz = toZ - o.position.z; if (!(dx * dx + dz * dz <= 30 * 30)) continue;
      looked++;
      if (see(los, o.position.x, o.position.z, toX, toZ, SIGHT[ty])) { stats.observed++; return 1; }
    }
    stats.unobserved++; return UNOBS;
  }

  // ---- Map → WAR SYSTEMS row ----
  function buildUi() {
    var p = doc.createElement('div'); p.id = 'armyLosPanel'; p.className = 'supply-panel armylos-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · ARMY LINE OF SIGHT <span class="qual sim">SIMULATED</span></div>' +
      '<div class="sup-row"><span id="alosStats" class="sup-status"></span></div>' +
      '<div class="th-note">Rifles and tanks now shoot at enemies they can actually see; hills, walls and bunkers block the shot and they hold fire. Artillery needs a spotter near the front or its rounds scatter. Fire visuals only — the market sets army size and the front.</div>';
    el.p = p; el.s = p.querySelector('#alosStats');
  }
  function placeUi() {
    if (!el.p) buildUi();
    var anchor = doc.getElementById('linesPanel') || doc.getElementById('fortsPanel') || doc.getElementById('economyPanel') || doc.getElementById('supplyPanel'), p = el.p;
    if (anchor && anchor.parentNode) { if (p.previousSibling !== anchor) anchor.parentNode.insertBefore(p, anchor.nextSibling); p.classList.toggle('floating', anchor.classList.contains('floating')); p.hidden = anchor.hidden; }
    else if (!p.parentNode) { var host = doc.querySelector('#sheet-map .sheet-body'); if (host) host.appendChild(p); }
    var tot = stats.engaged + stats.held, obs = stats.observed + stats.unobserved;
    el.s.textContent = 'Aimed shots ' + stats.engaged + ' · held ' + stats.held + (tot ? ' (' + Math.round(stats.held * 100 / tot) + '%)' : '') +
      ' · suppressive ' + stats.fallback + ' · artillery observed ' + (obs ? Math.round(stats.observed * 100 / obs) : 0) + '%';
  }
  if (enabled && doc) setInterval(function () { try { if (LB.engine) placeUi(); } catch (_) {} }, 1000);

  LB.armyLos = {
    version: 'v12.0.43', isEnabled: function () { return enabled && !!L(); },
    direct: direct, indirect: indirect,
    getState: function () { return JSON.parse(JSON.stringify(stats)); }
  };
})(window);
