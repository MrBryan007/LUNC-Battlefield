/* LUNC Battlefield v12.0.23 — v12.1 "War Systems": line of sight. Game layer.
 * LUNCBattle.los.clear(x1, z1, x2, z2, eye, aim) → true when a ray from the shooter's eye (1.6 m) to the target's
 * centre mass (aim, 1.1 m standing / 0.7 m crouched in cover) clears the terrain,
 * the Hill 402 ridge and fortifications (walls 1.5 m, bunkers 1.6 m). Samples every 1.5 m; results cached for 0.5 s per
 * rounded point pair, so squads can ask every shot. Obstacles within 2.5 m of either end are ignored (you can shoot
 * over the wall you're standing behind). Never touches market data. ?los=0 turns it off (everything is visible). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('los') !== '0' && qs.get('theaters') !== '0';
  var STEP = 1.5, EYE = 1.6, AIM = 1.1, cache = {}, cacheN = 0, cacheT = 0, stats = { checks: 0, cached: 0, blocked: 0, by: { ground: 0, wall: 0, bunker: 0 } };
  function E() { return LB.engine; }
  function ground(x, z) {
    var h = 0; try { h = E().terrainHeight(x, z) || 0; } catch (_) {}
    var R = LB.ridge; if (R && R.isEnabled && R.isEnabled() && R.groundY) try { var r = R.groundY(x, z); if (r > h) h = r; } catch (_) {}
    return h;
  }
  function obstacles() {
    var o = []; if (!LB.forts || !LB.forts.list) return o;
    try { LB.forts.list().forEach(function (f) { if (f.type === 'wall') o.push({ k: 'wall', x: f.x, z0: f.z - 5, z1: f.z + 5, h: 1.5 }); else if (f.type === 'bunker') o.push({ k: 'bunker', x: f.x, z: f.z, r: 3.0, h: 1.6 }); }); } catch (_) {}
    return o;
  }
  function trace(x1, z1, x2, z2, eye, aim) {
    var e = eye == null ? EYE : eye, a = aim == null ? AIM : aim, dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz);
    if (L < 2) return { ok: true };
    var y1 = ground(x1, z1) + e, y2 = ground(x2, z2) + a, n = Math.ceil(L / STEP);
    for (var i = 1; i < n; i++) {
      var t = i / n, x = x1 + dx * t, z = z1 + dz * t, y = y1 + (y2 - y1) * t;
      if (ground(x, z) > y - 0.15) return { ok: false, by: 'ground', t: t };
    }
    var obs = obstacles();
    for (var j = 0; j < obs.length; j++) {
      var O = obs[j], t2, px, pz, d0, d1;
      if (O.k === 'wall') {   // vertical segment at x = O.x from z0..z1
        if (Math.abs(dx) < 1e-6) continue; t2 = (O.x - x1) / dx; if (t2 <= 0 || t2 >= 1) continue;
        pz = z1 + dz * t2; if (pz < O.z0 || pz > O.z1) continue; px = O.x;
      } else {   // closest approach to the bunker centre
        t2 = Math.max(0, Math.min(1, ((O.x - x1) * dx + (O.z - z1) * dz) / (L * L))); px = x1 + dx * t2; pz = z1 + dz * t2;
        if (Math.hypot(px - O.x, pz - O.z) > O.r) continue;
      }
      d0 = Math.hypot(px - x1, pz - z1); d1 = Math.hypot(px - x2, pz - z2); if (d0 < 2.5 || d1 < 2.5) continue;
      var yl = y1 + (y2 - y1) * t2; if (ground(px, pz) + O.h > yl - 0.1) return { ok: false, by: O.k, t: t2 };
    }
    return { ok: true };
  }
  function clear(x1, z1, x2, z2, eye, aim) {
    if (!enabled) return true;
    var now = performance.now(); if (now - cacheT > 500) { cache = {}; cacheN = 0; cacheT = now; }
    var k = Math.round(x1) + ',' + Math.round(z1) + ':' + Math.round(x2) + ',' + Math.round(z2) + ':' + (eye || 0) + ':' + (aim || 0);
    stats.checks++;
    if (k in cache) { stats.cached++; return cache[k]; }
    var r = trace(x1, z1, x2, z2, eye, aim); if (!r.ok) { stats.blocked++; stats.by[r.by]++; }
    if (cacheN < 4000) { cache[k] = r.ok; cacheN++; }
    return r.ok;
  }
  LB.los = {
    version: 'v12.0.23', isEnabled: function () { return enabled; },
    clear: clear, trace: function (x1, z1, x2, z2, eye, aim) { return enabled ? trace(x1, z1, x2, z2, eye, aim) : { ok: true }; }, ground: ground,
    getStats: function () { return JSON.parse(JSON.stringify(stats)); }
  };
})(window);
