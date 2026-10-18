/* LUNC Battlefield v12.0.19 — fires that burn out over minutes (realism gap from v12.0.13 / .14 / .15). Visual only.
 * Every lasting fire in the game (burning tank wrecks, crashed aircraft, Commander napalm and fire strikes, critical
 * vehicle fires, wreck husks) becomes a fire site with a real lifecycle instead of a 5–20 s flame zone:
 *   IGNITE/BURN (50–110 s, rain ×0.6): flames shrink as the fuel burns down; a dark oily smoke column that greys out
 *   SMOULDER   (70–140 s): no flames, a few embers, a thin grey smoke wisp that fades away
 *   OUT        : a charred scorch is left on the ground (LUNCBattle.craters 'scorch' mode)
 * Smoke drifts with one slowly veering wind. Rain shortens burns and turns the smoke into pale steam. Nearest sites
 * emit at full rate, far ones at a quarter rate (smoke only), beyond 160 m nothing; emission backs off when the shared
 * sprite pool is busy so explosions never starve. MEDIUM+ get a small pool of flickering fire lights, created once.
 * Never touches market data, armies, the frontline or labels. ?fires=0 → v12.0.18 behaviour (flame zones only). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('fires') !== '0';
  var CAPS = { LOW: { sites: 8, near: 3, lights: 0 }, MEDIUM: { sites: 16, near: 6, lights: 2 }, HIGH: { sites: 28, near: 10, lights: 3 }, ULTRA: { sites: 36, near: 14, lights: 4 } };
  var THREE = null, ready = false, last = 0, sites = [], lights = [], rankT = 0, wind = { a: Math.random() * 6.28, s: 0.9, x: 0, z: 0 };
  var stats = { added: 0, merged: 0, burning: 0, smouldering: 0, out: 0, dropped: 0, emitted: 0, skipped: 0, lights: 0 };
  function E() { return LB.engine; }
  function tier() { try { var t = LB.quality.getEffectiveName(); return CAPS[t] ? t : 'HIGH'; } catch (_) { return 'HIGH'; } }
  function cap() { var c = CAPS[tier()]; try { if (E().mobile) return CAPS.LOW; } catch (_) {} return c; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rain() { try { return LB.v12extras.getOptions().weather === 'rain'; } catch (_) { return false; } }
  function gy(x, z) { try { return LB.terrain && LB.terrain.terrainHeight ? LB.terrain.terrainHeight(x, z) : 0; } catch (_) { return 0; } }
  function water(x, z) { try { return LB.theaters && LB.theaters.isWater && LB.theaters.isWater(x, z); } catch (_) { return false; } }
  function lerpHex(a, b, k) { var ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255, br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255; return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k); }

  // ------------------------------------------------------------------ sites
  function add(x, z, r, o) {
    if (!enabled || !isFinite(x) || !isFinite(z) || water(x, z)) return null;
    o = o || {}; r = Math.max(0.5, Math.min(3, r || 1));
    for (var i = 0; i < sites.length; i++) {   // merge into a nearby site: refuel it rather than stacking columns
      var s = sites[i];
      if (Math.abs(s.x - x) < 2.6 && Math.abs(s.z - z) < 2.6) {
        if (!o.smoulder) { if (s.ph === 'smoulder') { s.ph = 'burn'; s.t = 0; s.burnT = rnd(40, 80) * (rain() ? 0.6 : 1); } else s.t = Math.max(0, s.t - s.burnT * 0.35); s.r = Math.min(3, Math.max(s.r, r)); }
        stats.merged++; return s;
      }
    }
    var c = cap();
    while (sites.length >= c.sites) {   // drop the oldest smouldering site first, then the oldest
      var k = -1, ko = -1, best = -1;
      for (var j = 0; j < sites.length; j++) { if (sites[j].ph === 'smoulder' && sites[j].age > best) { best = sites[j].age; k = j; } }
      if (k < 0) { best = -1; for (j = 0; j < sites.length; j++) if (sites[j].age > best) { best = sites[j].age; ko = j; } k = ko; }
      finish(sites[k], false); sites.splice(k, 1); stats.dropped++;
    }
    var wet = rain() ? 0.6 : 1;
    var S = { x: x, z: z, y: gy(x, z), r: r, ph: o.smoulder ? 'smoulder' : 'burn', t: 0, age: 0, burnT: rnd(50, 110) * wet * (0.7 + 0.3 * r), smT: rnd(70, 140) * (o.smoulder ? 0.7 : 1),
      fT: 0, sT: rnd(0, 0.3), eT: rnd(0.5, 2), rank: 99, src: o.src || 'fire' };
    sites.push(S); stats.added++;
    return S;
  }
  function finish(S, scorch) {
    if (scorch && LB.craters && LB.craters.impact) try { LB.craters.impact(S.x, S.z, Math.min(2.2, S.r * 0.9), { mode: 'scorch' }); } catch (_) {}
    stats.out++;
  }

  // ------------------------------------------------------------------ hooks
  function hook() {
    var F = LB.heavyFx;
    if (F && F.zone && !F.zone._fires) {
      var z0 = F.zone, zf = function (o) {
        try {
          if (o && o.kind === 'fire' && !o._fires && (o.dur || 0) >= 4) {
            var r = (o.r || 1) * (o.dur >= 12 ? 1.3 : 1);
            if (o.line) { for (var i = 0; i < 3; i++) { var t = (i + 0.5) / 3; add(o.line.x0 + (o.line.x1 - o.line.x0) * t, o.line.z0 + (o.line.z1 - o.line.z0) * t, Math.min(2.4, r * 1.1), { src: 'line' }); } }
            else add(o.x, o.z, r, { src: 'zone' });
          }
        } catch (_) {}
        return z0.apply(this, arguments);
      };
      zf._fires = true; F.zone = zf;
    }
    var P = LB.persist;
    if (P && P.addWreck && !P.addWreck._fires) {
      var w0 = P.addWreck, wf = function (o) { try { if (o && Math.random() < 0.7) add(o.x, o.z, Math.max(0.6, (o.sx || 1.6) * 0.45), { smoulder: true, src: 'wreck' }); } catch (_) {} return w0.apply(this, arguments); };
      wf._fires = true; P.addWreck = wf;
    }
  }
  // ------------------------------------------------------------------ lights (MEDIUM+), created once
  function buildLights() {
    var n = cap().lights;
    for (var i = 0; i < n; i++) { var L = new THREE.PointLight(0xff8a3a, 0, 12, 2); L.name = 'fire-light'; L.castShadow = false; E().scene.add(L); lights.push(L); }
  }

  // ------------------------------------------------------------------ tick
  function rank() {
    var T; try { T = E().getCameraTarget(); } catch (_) { return; }
    var arr = sites.map(function (s) { s.d = Math.hypot(s.x - T.x, s.z - T.z); return s; }).sort(function (a, b) { return a.d - b.d; });
    var near = cap().near; for (var i = 0; i < arr.length; i++) arr[i].rank = i < near ? i : 99;
  }
  function emit(S, dt, F, budgetOk, steam) {
    if (S.d > 160) return;
    var full = S.rank < 99 && S.d < 110, mult = full ? 1 : 0.25;
    if (!budgetOk && S.rank > 1) { stats.skipped++; return; }
    var x = S.x, z = S.z, y = S.y, r = S.r;
    if (S.ph === 'burn') {
      var h = Math.max(0.22, 1 - 0.78 * (S.t / S.burnT));   // fuel burning down
      if (full) {
        S.fT -= dt;
        if (S.fT <= 0) {
          S.fT = 1 / (5 + 6 * h * r);
          var a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r * 0.7;
          F.puff({ kind: 'fire', x: x + Math.cos(a) * rr, y: y + 0.25, z: z + Math.sin(a) * rr, vy: 1.2 + h * 1.4, vx: wind.x * 0.2, vz: wind.z * 0.2,
            size: (0.55 + Math.random() * 0.5) * r * (0.55 + 0.6 * h), grow: 0.3, life: 0.55 + Math.random() * 0.35, color: Math.random() < 0.5 ? 0xff7a1a : 0xffb347, opacity: 0.85 * Math.min(1, 0.4 + h), flicker: true });
          stats.emitted++;
        }
      }
      S.sT -= dt;
      if (S.sT <= 0) {
        S.sT = 1 / ((1.8 + 2.2 * h) * Math.max(0.7, r) * mult);
        var col = steam ? 0xa9a8a3 : lerpHex(0x3a352f, 0x6f6b64, 1 - h);
        F.puff({ kind: 'smoke', x: x + rnd(-0.4, 0.4) * r, y: y + 1 + h * 0.6, z: z + rnd(-0.4, 0.4) * r, vy: 1.5 + h * 1.2, vx: wind.x * (0.9 + Math.random() * 0.5), vz: wind.z * (0.9 + Math.random() * 0.5),
          size: (1 + 0.5 * h) * r, grow: 1.9, life: 3.6 + Math.random() * 1.6, color: col, opacity: (steam ? 0.32 : 0.42) * (0.6 + 0.4 * h), drag: 0.985 });
        stats.emitted++;
      }
    } else {   // smoulder
      var u = Math.min(1, S.t / S.smT), k = 1 - u;
      S.sT -= dt;
      if (S.sT <= 0 && k > 0.04) {
        S.sT = 1 / ((0.5 + 1.3 * k) * Math.max(0.7, r) * mult);
        F.puff({ kind: 'smoke', x: x + rnd(-0.3, 0.3) * r, y: y + 0.6, z: z + rnd(-0.3, 0.3) * r, vy: 0.9 + k * 0.6, vx: wind.x * 1.1, vz: wind.z * 1.1,
          size: (0.6 + 0.5 * k) * r, grow: 1.6, life: 3.4 + Math.random() * 1.4, color: steam ? 0xb4b3ae : 0x7c7870, opacity: 0.08 + 0.26 * k, drag: 0.985 });
        stats.emitted++;
      }
      if (full && k > 0.45) { S.eT -= dt; if (S.eT <= 0) { S.eT = rnd(0.8, 2.2); F.puff({ kind: 'fire', x: x + rnd(-0.5, 0.5) * r, y: y + 0.12, z: z + rnd(-0.5, 0.5) * r, vy: 0.4, size: 0.22 * r, grow: 0.2, life: 0.5, color: 0xff6a1a, opacity: 0.8 * k, flicker: true }); } }
    }
  }
  function step(dt) {
    var F = LB.heavyFx, steam = rain();
    // wind veers slowly, 0.6–1.4 m/s (calmer in rain)
    wind.a += (Math.random() - 0.5) * dt * 0.08; wind.s += (1 + Math.sin(performance.now() / 47000) * 0.4 - wind.s) * dt * 0.05;
    var ws = wind.s * (steam ? 0.7 : 1); wind.x = Math.cos(wind.a) * ws; wind.z = Math.sin(wind.a) * ws;
    rankT -= dt; if (rankT <= 0) { rankT = 0.5; rank(); }
    var budgetOk = true;
    if (F && F.getStats) { var st = F.getStats(); budgetOk = st.sprites < st.cap * 0.7; }
    var burning = 0, sm = 0;
    for (var i = sites.length - 1; i >= 0; i--) {
      var S = sites[i]; S.t += dt; S.age += dt;
      if (S.ph === 'burn' && S.t >= S.burnT) { S.ph = 'smoulder'; S.t = 0; }
      else if (S.ph === 'smoulder' && S.t >= S.smT) { finish(S, true); sites.splice(i, 1); continue; }
      if (S.ph === 'burn') burning++; else sm++;
      if (F) emit(S, dt, F, budgetOk, steam);
    }
    stats.burning = burning; stats.smouldering = sm;
    // lights on the nearest burning sites
    if (lights.length) {
      var near = sites.filter(function (s) { return s.ph === 'burn' && s.d < 90; }).sort(function (a, b) { return a.d - b.d; }), used = 0;
      for (var L = 0; L < lights.length; L++) {
        var s2 = near[L], li = lights[L];
        if (!s2) { li.intensity = 0; continue; }
        var h2 = Math.max(0.22, 1 - 0.78 * (s2.t / s2.burnT)), fl = 0.75 + 0.25 * Math.sin(performance.now() / 70 + L * 2.1) * Math.sin(performance.now() / 113 + L);
        li.position.set(s2.x, s2.y + 1.2 + s2.r * 0.3, s2.z); li.distance = 8 + 4 * s2.r; li.intensity = 1.5 * h2 * fl; used++;
      }
      stats.lights = used;
    }
  }
  function update() {
    if (!enabled) return;
    var e = E(); if (!e || !e.THREE || !e.scene) return;
    if (!ready) { THREE = e.THREE; try { buildLights(); } catch (_) {} ready = true; }
    hook();
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused && e.isPaused()) return;
    step(dt);
  }

  LB.fires = {
    version: 'v12.0.19', isEnabled: function () { return enabled && ready; }, update: update, add: add,
    list: function () { return sites.map(function (s) { return { x: +s.x.toFixed(1), z: +s.z.toFixed(1), r: +s.r.toFixed(2), ph: s.ph, t: +s.t.toFixed(1), burnT: +s.burnT.toFixed(0), smT: +s.smT.toFixed(0), src: s.src, rank: s.rank }; }); },
    wind: function () { return { x: +wind.x.toFixed(2), z: +wind.z.toFixed(2), speed: +Math.hypot(wind.x, wind.z).toFixed(2) }; },
    getStats: function () { return Object.assign({ sites: sites.length, cap: cap().sites }, stats); },
    clear: function () { sites.length = 0; },
    _step: function (sec) { for (var t = 0; t < sec; t += 0.1) step(0.1); return sites.length; }
  };
})(window);
