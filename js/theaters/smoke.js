/* LUNC Battlefield v12.0.65 — Smoke screens (realism checklist, Combat behavior: "deepen retreat"). Game layer only.
 *
 * Smoke-grenade screens that block line of sight and drift with the v12.0.64 shared wind.
 *  - A screen is 3 canisters thrown in a line across the threat axis (≈ 6 m toward the enemy, 5 m apart). Each cloud
 *    builds over ~7 s (HC / L83-style grenades: a thick white-grey cloud, ~4.5 m radius, ~4 m high), drifts with
 *    LUNCBattle.wind at the 1.5 m wind, thins over its last 12 s and clears after ~45 s (rain knocks it down faster).
 *  - Line of sight: js/theaters/los.js asks blockers() — a sight line through a thick cloud is blocked (squads, forts,
 *    Hill 402 teams and the v12.0.43 army LOS all trace through it), so fire stops through the screen.
 *  - Who throws it: the selected squad on a Smoke order (Map → WAR SYSTEMS · SQUADS, 35 s cooldown per squad), and any
 *    squad of either side automatically when it falls back or gets pinned (suppression ≥ 0.85, 45 s cooldown), with a
 *    "Popping smoke!" radio call. Clouds show on the tactical map as grey discs.
 *  - Look: camera-facing smoke sprites (HIGH 8 / MEDIUM 6 / LOW + phones 3 per cloud), a canister spurt at the base
 *    while it burns. Max 12 clouds; the oldest clears first.
 * Never touches market data, the front, army counts or data-truth labels. Kill switch: ?smoke=0 (also off with
 * ?squads=0 / ?theaters=0). API: LUNCBattle.smoke.{isEnabled, screen, blockers, drawMap, getState, update, _step}. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('smoke') !== '0' && qs.get('squads') !== '0' && qs.get('theaters') !== '0';
  var MAX_CLOUDS = 12, BUILD_S = 7, LIFE_S = 45, FADE_S = 12, R_MAX = 4.5, H_MAX = 4.0, AHEAD = 6, SPACING = 5;
  var THREE = null, root = null, tex = null, clouds = [], pool = [], last = 0, ready = false;
  var stats = { screens: 0, clouds: 0, manual: 0, auto: 0, cleared: 0, blocks: 0, last: '' };
  var _w = { x: 0, z: 0 };

  function E() { return LB.engine; }
  function tier() { try { if (E().mobile) return 'LOW'; return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function perCloud() { var t = tier(); return t === 'LOW' ? 3 : t === 'MEDIUM' ? 6 : 8; }
  function H(x, z) { try { if (LB.groundY) return LB.groundY(x, z); } catch (_) {} try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function rain() { try { return (LB.v12extras.getOptions().weather || '') === 'rain'; } catch (_) { return false; } }
  function smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  function ensure() {
    if (THREE) return true;
    var e = E(); if (!e || !e.THREE || !e.scene) return false;
    THREE = e.THREE; root = new THREE.Group(); root.name = 'smoke-screens'; e.scene.add(root);
    tex = LB.proctex && LB.proctex.smokePuff ? LB.proctex.smokePuff(THREE) : null;
    ready = true; return true;
  }
  function sprite() {
    var sp = pool.pop();
    if (!sp) { sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xcfcdc4, transparent: true, opacity: 0, depthWrite: false, fog: true })); sp.renderOrder = 3; }
    sp.visible = true; root.add(sp); return sp;
  }
  function recycle(sp) { sp.visible = false; if (sp.parent) sp.parent.remove(sp); if (pool.length < 120) pool.push(sp); }
  function clearCloud(C) { C.sp.forEach(recycle); C.sp.length = 0; stats.cleared++; }

  /** Throw a screen of 3 canisters from (x, z) toward (tx, tz). Returns the number of clouds made. */
  function screen(x, z, tx, tz, side, why) {
    if (!enabled || !ensure()) return 0;
    var dx = tx - x, dz = tz - z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L, ahead = Math.min(AHEAD, L * 0.5);
    var cx = x + ux * ahead, cz = z + uz * ahead, k = perCloud(), made = 0;
    for (var i = -1; i <= 1; i++) {
      while (clouds.length >= MAX_CLOUDS) clearCloud(clouds.shift());
      var px = cx - uz * i * SPACING + (Math.random() - 0.5) * 1.2, pz = cz + ux * i * SPACING + (Math.random() - 0.5) * 1.2;
      var C = { x: px, z: pz, t: -i * 0.35 - 0.35, life: LIFE_S * (0.9 + Math.random() * 0.2), side: side, r: 0, h: 0, dens: 0, sp: [], off: [] };
      for (var j = 0; j < k; j++) { var s = sprite(); C.sp.push(s); C.off.push({ a: Math.random() * 6.283, d: Math.sqrt(Math.random()), y: (j + 0.5) / k, ph: Math.random() * 6.283, s: 0.85 + Math.random() * 0.4 }); }
      clouds.push(C); made++;
    }
    stats.screens++; stats.clouds += made; if (why === 'manual') stats.manual++; else stats.auto++;
    return made;
  }
  /** Thick clouds as LOS obstacles: [{x, z, r, h, y0}] (r is the opaque core, ~85 % of the visible radius). */
  function blockers() {
    var o = [];
    if (!enabled) return o;
    for (var i = 0; i < clouds.length; i++) { var C = clouds[i]; if (C.dens > 0.35 && C.r > 1.6) o.push({ x: C.x, z: C.z, r: C.r * 0.85, h: C.h, y0: C.y0 || 0 }); }
    return o;
  }
  function step(dt) {
    var WD = LB.wind && LB.wind.isEnabled() ? LB.wind : null, wet = rain();
    if (WD) WD.drift(1.5, _w); else { _w.x = 0; _w.z = 0; }
    var now = performance.now() / 1000;
    for (var i = clouds.length - 1; i >= 0; i--) {
      var C = clouds[i]; C.t += dt * (wet ? 1.35 : 1);
      if (C.t >= C.life) { clearCloud(C); clouds.splice(i, 1); continue; }
      if (C.t < 0) { C.sp.forEach(function (s) { s.material.opacity = 0; }); continue; }   // canister still in the air
      var g = smooth(C.t / BUILD_S), fade = smooth((C.life - C.t) / FADE_S);
      C.r = 0.9 + (R_MAX - 0.9) * g + 0.6 * Math.max(0, C.t - BUILD_S) / C.life;   // keeps spreading slowly as it ages
      C.h = 1 + (H_MAX - 1) * g; C.dens = Math.min(1, C.t / 2.5) * fade;
      var ramp = Math.min(1, C.t / 3); C.x += _w.x * ramp * dt; C.z += _w.z * ramp * dt;
      C.y0 = H(C.x, C.z);
      for (var j = 0; j < C.sp.length; j++) {
        var s = C.sp[j], O = C.off[j], rr = C.r * 0.7 * O.d, a = O.a + now * 0.05;
        var lean = O.y * O.y * 1.4;   // upper puffs lean further downwind
        s.position.set(C.x + Math.cos(a) * rr + _w.x * lean, C.y0 + 0.4 + O.y * C.h + Math.sin(now * 0.7 + O.ph) * 0.15, C.z + Math.sin(a) * rr + _w.z * lean);
        var sc = (1.6 + C.r * 1.1) * O.s * (0.75 + 0.25 * O.y); s.scale.set(sc, sc, 1);
        s.material.opacity = Math.min(1, (C.sp.length <= 3 ? 1.15 : 1) * C.dens * (0.8 + 0.2 * (1 - O.y)));
        s.material.rotation = O.ph + now * 0.04;
      }
      // canister spurt while it burns (first ~20 s): the lowest sprite pulses at the base
      if (C.t < 20 && C.sp.length) { var b = C.sp[0]; b.material.opacity = Math.min(0.9, b.material.opacity + 0.12 * (1 + Math.sin(now * 9 + C.off[0].ph))); }
    }
  }
  function update() {
    if (!enabled) return;
    var e = E(); if (!e || !e.scene) return;
    var now = performance.now(), dt = Math.min(0.25, (now - (last || now)) / 1000); last = now;
    if (!clouds.length || (e.isPaused && e.isPaused())) return;
    if (!ensure()) return;
    step(dt);
  }
  function drawMap(c, X, Z, s, big) {
    if (!enabled || !clouds.length) return 0;
    var n = 0; c.save(); c.fillStyle = 'rgba(225,225,218,' + (big ? 0.55 : 0.45) + ')';
    for (var i = 0; i < clouds.length; i++) { var C = clouds[i]; if (C.dens < 0.15) continue; var px = X(C.x), pz = Z(C.z), rr = Math.max(big ? 3 : 1.6, Math.abs(X(C.x + C.r) - px)); c.globalAlpha = Math.min(1, C.dens + 0.2); c.beginPath(); c.arc(px, pz, rr, 0, Math.PI * 2); c.fill(); n++; }
    c.restore(); return n;
  }

  LB.smoke = {
    version: 'v12.0.65', update: update, screen: screen, blockers: blockers, drawMap: drawMap,
    isEnabled: function () { return enabled; },
    _note: function (k) { stats.blocks += k || 1; },
    _step: function (sec) { if (!ensure()) return; for (var t = 0; t < sec; t += 0.1) step(0.1); },
    getState: function () {
      return { enabled: enabled, ready: ready, perCloud: perCloud(), clouds: clouds.map(function (C) { return { x: +C.x.toFixed(2), z: +C.z.toFixed(2), r: +C.r.toFixed(2), h: +C.h.toFixed(2), dens: +C.dens.toFixed(2), t: +C.t.toFixed(1), side: C.side, sprites: C.sp.length }; }), stats: Object.assign({}, stats) };
    },
    _clear: function () { clouds.forEach(clearCloud); clouds.length = 0; }
  };
})(window);
