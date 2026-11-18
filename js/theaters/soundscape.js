/* LUNC Battlefield v12.0.7 — sound design pass. Drives js/sfx.js from the v12 world:
 * ambience beds by camera (ocean surf near the coast, wind with altitude, rain with the weather toggle), Doppler jet
 * passes when an airborne jet streaks past the camera, theater strikes (ships, depots, torpedoes) by distance to the
 * camera, radio blips on radio-chatter lines (throttled), turret/bunker gunfire by distance. Respects mute, volume, pause
 * and the iOS unlock-on-tap (sfx stays silent until the first tap). ?soundscape=0 turns it off. Audio only. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('soundscape') !== '0' && qs.get('theaters') !== '0';
  var ready = false, last = 0, bedT = 0, jetT = 0, blipAt = 0, lastShots = 0, gunT = 0, passed = {};
  var stats = { passes: 0, strikes: 0, blips: 0, guns: 0, beds: null };
  function E() { return LB.engine; }
  function S() { return LB.sfx; }
  function cam() { var e = E(); return e && e.camera ? e.camera.position : null; }
  function camDist(x, z) { var c = cam(); return c ? Math.hypot(c.x - x, c.z - z) : 999; }
  function norm(d) { return Math.max(0, Math.min(0.95, d / 260)); }
  function wrap() {
    var th = LB.theaters;
    if (th && th.onStrike && !th.onStrike._snd) {
      var o = th.onStrike, f = function (x, z, power) { try { if (S() && S().explosion) { S().explosion((power || 1) * 1.1, norm(camDist(x, z))); stats.strikes++; } } catch (_) {} return o.apply(this, arguments); };
      f._snd = true; th.onStrike = f;
    }
    if (LB.ai && LB.ai.send && !LB.ai.send._snd) {
      var s0 = LB.ai.send, g = function (msg) { try { var now = performance.now(); if (now - blipAt > 3500 && S() && S().blip) { blipAt = now; S().blip(msg && msg.side); stats.blips++; } } catch (_) {} return s0.apply(this, arguments); };
      g._snd = true; LB.ai.send = g;
    }
  }
  function beds() {
    var c = cam(), sfx = S(); if (!c || !sfx || !sfx.setBeds) return;
    var th = LB.theaters, opt = LB.v12extras && LB.v12extras.getOptions ? LB.v12extras.getOptions() : {};
    var t = E().getCameraTarget ? E().getCameraTarget() : c;
    var surf = 0; if (th && th.isWater) { if (th.isWater(t.x, t.z)) surf = 1; else if (th.isWater(t.x, t.z + 30)) surf = 0.6; else if (th.isWater(t.x, t.z + 60)) surf = 0.25; }
    var wind = Math.max(0.2, Math.min(1, 0.25 + c.y / 160)) * (opt.weather === 'rain' ? 1.3 : 1);
    var rain = opt.weather === 'rain' ? 1 : 0;
    stats.beds = { wind: +wind.toFixed(2), surf: surf, rain: rain };
    sfx.setBeds(stats.beds);
  }
  function jets() {
    var th = LB.theaters, c = cam(), e = E(); if (!th || !th._jets || !c || !S() || !S().jetPass) return;
    var list = th._jets(), now = performance.now();
    for (var i = 0; i < list.length; i++) {
      var J = list[i]; if (!(J.st === 'cruise' || J.st === 'fight' || J.st === 'rtb' || J.st === 'takeoff') || !J.g || !J.g.visible) continue;
      var d = Math.hypot(c.x - J.x, c.y - (J.y || 0), c.z - J.z);
      if (d < 70 && (!passed[i] || now - passed[i] > 7000)) {
        passed[i] = now; var pan = 0;
        try { var v = new e.THREE.Vector3(J.x, J.y || 0, J.z).project(e.camera); pan = Math.max(-1, Math.min(1, v.x)); } catch (_) {}
        S().jetPass(pan || (Math.random() < 0.5 ? -0.6 : 0.6), 1 - d / 80, 1.8 + d / 60); stats.passes++;
        break;   // one pass at a time
      }
    }
  }
  function guns() {
    var F = LB.forts; if (!F || !F.getStats || !S() || !S().gunfire) return;
    var st = F.getStats(); if (st.shots > lastShots) {
      var c = cam(), best = 999; (F.list() || []).forEach(function (f) { if (f.type !== 'wall') best = Math.min(best, camDist(f.x, f.z)); });
      if (best < 200) { S().gunfire(norm(best)); stats.guns++; }
    }
    lastShots = st.shots;
  }
  function update() {
    if (!enabled) return;
    var th = LB.theaters; if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.camera) return;
    if (!ready) { wrap(); ready = true; }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused()) return;
    bedT -= dt; if (bedT <= 0) { bedT = 0.5; wrap(); beds(); }
    jetT -= dt; if (jetT <= 0) { jetT = 0.25; jets(); }
    gunT -= dt; if (gunT <= 0) { gunT = 0.3; guns(); }
  }
  LB.soundscape = { isEnabled: function () { return enabled && ready; }, update: update, getStats: function () { return JSON.parse(JSON.stringify(stats)); } };
})(window);
