/* LUNC Battlefield v12.0.15 — Realism pass, part 3: sea & air motion.
 *
 * Theater layer only (SIMULATED). Never touches market data, the price→X mapping, the frontline, army counts or labels.
 *  1. Aircraft attitude: Euler order YZX (yaw → pitch → roll in the airframe's own axes). Coordinated-turn bank
 *     atan(V·ω/g) clamped ±66°, smoothed; pitch from climb rate; ground states face their direction of travel.
 *  2. Takeoff & landing: rotation at Vr and climb-out; RTB flies initial point → final-approach fix lined up with the
 *     runway, slows to approach speed, rides a glide slope with a flare, touches down, brakes on the rollout and taxis to
 *     its parking slot (no teleport, no 180° heading snap in mid-air).
 *  3. Ships: heave / pitch / roll sampled from the ocean shader's wave function at bow, stern and both beams, through a
 *     damped roll spring (small hulls roll more). Patrol-lane ends become turning circles (seaward, heel outward, slow in
 *     the turn) instead of an instant 180° flip. Hulls sit at a waterline instead of on top of the water.
 *     Foam V-wake (Kelvin ~19.5° arms + stern trail) riding the same waves, and bow spray (MEDIUM+, not on phones).
 *  4. Materials: theater colours were authored as sRGB hex but fed to three r128 as linear (ships, airbases and the
 *     ocean read washed-out beige / pale teal). Converted from sRGB here; deeper sea colour.
 * Kill switch: ?seaair=0 (also off with ?realism=0) restores the v12.0.14 theater motion and colours. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('realism') !== '0' && qs.get('seaair') !== '0';
  var G = 9.8, TAU = Math.PI * 2;
  var stats = { ships: 0, wakes: 0, maxRoll: 0, maxPitch: 0, maxBank: 0, approaches: 0, landings: 0, taxiIns: 0, uturns: 0, colorsFixed: 0, spray: 0 };
  var THREE = null, wakeTex = null, wakeMats = {}, wakeGeo = null;

  function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function phone() { var e = LB.engine; return global.innerWidth < 760 || !!(e && e.mobile); }
  function rich() { var t = tier(); return !phone() && (t === 'HIGH' || t === 'ULTRA' || t === 'MEDIUM'); }

  // ---------------------------------------------------------------- materials (sRGB → linear)
  function fixColor(o) {      // o: MeshStandardMaterial options; returns o with colour converted (theaters mat())
    if (!enabled || !o || o.color == null || o._srgb) return o;
    var T = (LB.engine && LB.engine.THREE) || global.THREE; if (!T) return o;
    o.color = new T.Color(o.color).convertSRGBToLinear(); o._srgb = true; stats.colorsFixed++;
    return o;
  }
  function fixMaterial(m) {
    if (!enabled || !m || !m.color || m.userData._srgb) return m;
    m.color.convertSRGBToLinear(); m.userData._srgb = true; stats.colorsFixed++; return m;
  }

  // ---------------------------------------------------------------- waves (same function as the theaters ocean shader)
  function wave(x, z) {
    var th = LB.theaters;
    if (th && th.waveAt) { var w = th.waveAt(x, z); if (w !== null) return w + 0.35; }   // relative to the −0.35 sea level
    var t = performance.now() * 0.001;           // flat ocean on LOW → gentle synthetic swell for hull motion only
    return Math.sin(x * 0.09 + t * 1.1) * 0.12 + Math.sin(z * 0.13 + t * 0.8) * 0.08;
  }

  // ---------------------------------------------------------------- ships
  var HULL = { destroyer: { L: 9, B: 1.5, R: 12, roll: 1.25, per: 6.0, ox: 0 }, battleship: { L: 15, B: 2.4, R: 16, roll: 1.0, per: 7.5 },
    carrier: { L: 22, B: 5.2, R: 22, roll: 0.6, per: 10 } };
  function initShip(s) {
    var h = HULL[s.kind] || HULL.destroyer;
    s._sa = { h: h, hd: s.dir > 0 ? 0 : Math.PI, lane: s.z, wp: 0, v: s.speed, roll: 0, rv: 0, pitch: 0, heave: 0, om: 0, wake: null, sprayT: Math.random() };
    s.g.rotation.order = 'YZX';
  }
  /** Moves a sailing ship (replaces the instant lane flip). lo/hi: patrol-lane x bounds. */
  function moveShip(s, dt, lo, hi) {
    if (!s._sa) initShip(s);
    var a = s._sa, h = a.h, R = h.R;
    var fx = Math.cos(a.hd);
    if (!a.wp) a.wp = fx > 0 ? 1 : -1;
    if (a.wp > 0 && s.x > hi - R) { a.wp = -1; stats.uturns++; } else if (a.wp < 0 && s.x < lo + R) { a.wp = 1; stats.uturns++; }
    var endX = a.wp > 0 ? hi : lo, look = Math.min(40, Math.max(R * 1.2, Math.abs(endX - s.x)));
    var px = s.x + a.wp * look, pz = a.lane;
    var want = Math.atan2(-(pz - s.z), px - s.x), d = wrap(want - a.hd);
    if (Math.abs(d) > 2.6) d = (fx > 0 ? -1 : 1) * Math.abs(d);              // target behind → turn seaward (+z)
    var omMax = a.v / R, om = clamp(d / Math.max(dt, 1e-3), -omMax, omMax) * 0.9;
    a.om += (om - a.om) * Math.min(1, dt * 1.5);                             // rudder lag
    a.hd = wrap(a.hd + a.om * dt);
    var turnK = Math.abs(a.om) / Math.max(1e-4, omMax);
    a.v += ((s.speed * (1 - 0.3 * turnK)) - a.v) * Math.min(1, dt * 0.4);   // bleed speed in the turn
    s.x += Math.cos(a.hd) * a.v * dt; s.z -= Math.sin(a.hd) * a.v * dt;
    s.dir = Math.cos(a.hd) >= 0 ? 1 : -1;
    attitude(s, dt);
  }
  function attitude(s, dt) {
    var a = s._sa, h = a.h, c = Math.cos(a.hd), sn = Math.sin(a.hd), L2 = h.L * 0.5, B2 = h.B * 0.5;
    // forward = (c, -sn), starboard = (sn, c)
    var hb = wave(s.x + c * L2, s.z - sn * L2), hs = wave(s.x - c * L2, s.z + sn * L2);
    var hp = wave(s.x - sn * B2, s.z - c * B2), hst = wave(s.x + sn * B2, s.z + c * B2), h0 = wave(s.x, s.z);
    var heave = (hb + hs + hp + hst + h0 * 2) / 6;
    a.heave += (heave * 0.85 - a.heave) * Math.min(1, dt * 2.2);
    var pitchT = Math.atan2(hb - hs, h.L) * 1.4;
    a.pitch += (pitchT - a.pitch) * Math.min(1, dt * 1.6);
    // roll: damped spring toward the wave slope across the beam (amplified for resonance) + outward heel in turns
    var rollT = Math.atan2(hp - hst, h.B) * 1.2 * h.roll + clamp(a.om * a.v * 0.06, -0.07, 0.07)
      + Math.sin(performance.now() * 0.001 * TAU / h.per + s.z) * 0.012 * h.roll;
    var w0 = TAU / h.per, acc = -w0 * w0 * (a.roll - rollT) - 2 * 0.28 * w0 * a.rv;
    a.rv += acc * dt; a.roll = clamp(a.roll + a.rv * dt, -0.12, 0.12);
    s.g.position.set(s.x, a.heave - 0.6, s.z);
    s.g.rotation.set(a.roll, a.hd, a.pitch);
    s._sy = a.heave - 0.6;
    stats.maxRoll = Math.max(stats.maxRoll * 0.999, Math.abs(a.roll)); stats.maxPitch = Math.max(stats.maxPitch * 0.999, Math.abs(a.pitch));
    wakeAndSpray(s, dt);
  }
  function makeWakeTex() {
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    var g = cv.getContext('2d'); g.clearRect(0, 0, 256, 128);
    // stern at the right edge (u = 1), trail to the left. Turbulent stern trail (brightest) + faint Kelvin arms.
    var sx = 250, sy = 64, i;
    for (i = 0; i < 3; i++) {
      var w = 4 + i * 5, tg = g.createLinearGradient(0, 0, sx, 0);
      tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(0.6, 'rgba(255,255,255,' + (0.16 - i * 0.04).toFixed(2) + ')'); tg.addColorStop(1, 'rgba(255,255,255,' + (0.62 - i * 0.18).toFixed(2) + ')');
      g.fillStyle = tg; g.beginPath(); g.moveTo(sx, sy - w * 0.5); g.lineTo(0, sy - w * 1.6); g.lineTo(0, sy + w * 1.6); g.lineTo(sx, sy + w * 0.5); g.closePath(); g.fill();
    }
    g.lineCap = 'round';
    for (var k = 0; k < 2; k++) {
      var sgn = k ? 1 : -1, ag = g.createLinearGradient(sx, 0, 0, 0);
      ag.addColorStop(0, 'rgba(255,255,255,0.42)'); ag.addColorStop(0.7, 'rgba(255,255,255,0.08)'); ag.addColorStop(1, 'rgba(255,255,255,0)');
      g.strokeStyle = ag; g.lineWidth = 2.2; g.shadowColor = 'rgba(255,255,255,0.5)'; g.shadowBlur = 3;
      g.beginPath(); g.moveTo(sx, sy + sgn * 4);
      for (i = 1; i <= 24; i++) { var u = i / 24; g.lineTo(sx - u * sx, sy + sgn * (4 + u * 44) + Math.sin(i * 1.7) * 1.2); }
      g.stroke();
    }
    g.shadowBlur = 0;
    for (var p = 0; p < 90; p++) { var u2 = Math.random() * 0.7, x2 = sx - u2 * sx, y2 = sy + (Math.random() * 2 - 1) * (4 + u2 * 12);
      g.fillStyle = 'rgba(255,255,255,' + (0.22 * (1 - u2)).toFixed(3) + ')'; g.fillRect(x2, y2, 1.5, 1.5); }
    var t = new THREE.CanvasTexture(cv); t.needsUpdate = true; return t;
  }
  function wakeMat(L) {
    var th = LB.theaters, U = th && th.oceanUniform && th.oceanUniform();
    if (!U) return null;
    if (wakeMats.m) return wakeMats.m;
    if (!wakeTex) wakeTex = makeWakeTex();
    var m = new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, opacity: 0.6, depthWrite: false, color: 0xf2f7f8, fog: true });
    var OZ = (th.oceanZ && th.oceanZ()) || 222;
    m.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = U;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <project_vertex>',
        'vec4 wpW = modelMatrix * vec4( transformed, 1.0 );\n' +
        'wpW.y += sin(wpW.x*0.09 + uTime*1.1)*0.35 + sin((wpW.z - ' + OZ.toFixed(1) + ')*0.13 + uTime*0.8)*0.25;\n' +
        'vec4 mvPosition = viewMatrix * wpW;\n gl_Position = projectionMatrix * mvPosition;\n');
    };
    m.customProgramCacheKey = function () { return 'v12015-wake'; };
    wakeMats.m = m; return m;
  }
  function wakeAndSpray(s, dt) {
    var a = s._sa;
    if (!rich()) { if (a.wake) a.wake.visible = false; return; }
    if (!a.wake) {
      var m = wakeMat(a.h.L); if (!m) return;
      if (!wakeGeo) { wakeGeo = new THREE.PlaneGeometry(1, 1, 16, 2); wakeGeo.rotateX(-Math.PI / 2); }
      a.wake = new THREE.Mesh(wakeGeo, m); a.wake.name = 'v12015-wake'; a.wake.renderOrder = 2; a.wake.frustumCulled = false;
      a.wakeLen = a.h.L * 2.6; a.wake.scale.set(a.wakeLen, 1, a.h.L * 1.2);
      (s.g.parent || LB.engine.scene).add(a.wake); stats.wakes++;
    }
    var c = Math.cos(a.hd), sn = Math.sin(a.hd), back = a.h.L * 0.48 + a.wakeLen * 0.5;
    a.wake.visible = true;
    a.wake.position.set(s.x - c * back, -0.35 + 0.08, s.z + sn * back);
    a.wake.rotation.y = a.hd;
        a.wake.scale.z = a.h.L * (0.9 + 0.35 * a.v / Math.max(0.1, s.speed));
    // bow spray
    var F = LB.heavyFx; a.sprayT -= dt;
    if (F && F.puff && a.sprayT <= 0) {
      a.sprayT = 0.35 + Math.random() * 0.4;
      var bx = s.x + c * a.h.L * 0.55, bz = s.z - sn * a.h.L * 0.55;
      F.puff({ kind: 'dust', x: bx + sn * 0.5 * (Math.random() < 0.5 ? -1 : 1), y: wave(bx, bz) - 0.35, z: bz + c * 0.5, vy: 1.2 + a.v * 0.35, size: 0.35 + a.h.L * 0.02, grow: 1.3, life: 0.7, color: 0xeef4f5, opacity: 0.55, drag: 0.93 });
      stats.spray++;
    }
  }
  function dropShip(s) { if (s && s._sa && s._sa.wake) { if (s._sa.wake.parent) s._sa.wake.parent.remove(s._sa.wake); s._sa.wake = null; } }
  function sinkTick(s) { if (s && s._sa && s._sa.wake) s._sa.wake.material === wakeMats.m && (s._sa.wake.visible = false); }

  // ---------------------------------------------------------------- aircraft
  function initJet(J) { J._sa = { bank: 0, pitch: 0, px: J.x, py: J.y, pz: J.z, phd: J.hd, om: 0, vy: 0, vyaw: J.hd, ap: 0 }; J.g.rotation.order = 'YZX'; }
  /** RTB → approach → final → touchdown → rollout → taxi-in. C: { bx, bz, side, steer, park, rnd, rate, slotXZ } */
  function flyHome(J, dt, C) {
    if (!J._sa) initJet(J);
    var a = J._sa, side = J.side, hd0 = side < 0 ? 0 : Math.PI, dirx = Math.cos(hd0);
    var xT = C.bx - dirx * 30, xF = xT - dirx * 60, zR = C.bz;
    if (J.st === 'rtb') {
      if (a.ap === 0 || a.ap > 2) { a.ap = 1; stats.approaches++; }
      var tgtSp = a.ap === 2 ? 17 : 24;
      J.sp += clamp(tgtSp - J.sp, -6 * dt, 6 * dt);
      if (a.ap === 1) {                         // initial point abeam the final-approach fix (north side), then turn in
        var ipZ = zR - 34, d1 = C.steer(J, xF - dirx * 6, 15, ipZ, dt, 0.9);
        if (d1 < 14 || ((J.x - xF) * dirx < 4 && Math.abs(J.z - ipZ) < 16 && Math.abs(J.x - xF) < 22)) a.ap = 2;
      } else if (a.ap === 2) {                  // base turn → final: pursue a point on the centreline 28 ahead, glide slope
        var along = (J.x - xT) * dirx;           // < 0 before the threshold
        var look = clamp(Math.abs(along) * 0.35, 9, 28), lx = J.x + dirx * look; if ((lx - xT) * dirx < 6) lx = xT + dirx * 6;
        var offC = Math.abs(J.z - zR);
        var gy = 0.6 + Math.max(0, -along) * 0.173;
        if (gy < 2.6) gy = 0.6 + (gy - 0.6) * 0.75;   // flare: shallower sink close to the ground
        if (offC > 2.5) gy = Math.max(gy, 1.4);         // not on the centreline yet → no touchdown
        var aligned = Math.abs(wrap(J.hd - hd0)) < 0.5;
        C.steer(J, lx, aligned ? gy : Math.max(gy, 8), zR, dt, 1.0);
        if (aligned) J.y += (gy - J.y) * Math.min(1, dt * 1.6);
        if (along > 45 || (Math.abs(J.z - zR) > 70)) { a.ap = 1; }                       // go-around: overshot → re-enter
        else if (aligned && offC <= 2.5 && along > -3 && J.y <= 0.85) { J.st = 'land'; J.y = 0.6; J.hd = hd0; a.ap = 3; stats.landings++; }
      }
      return true;
    }
    if (J.st === 'land') {
      if (a.ap < 3) { a.ap = 3; }               // a carrier/legacy hand-off still rolls out normally
      if (a.ap === 3) {                         // rollout: wheels braking, nose-wheel steering back to the centreline
        J.sp = Math.max(3.5, J.sp - 7 * dt); J.y = 0.6;
        J.hd += clamp(wrap(hd0 - J.hd), -dt * 0.6, dt * 0.6);
        J.x += Math.cos(J.hd) * J.sp * dt; J.z -= Math.sin(J.hd) * J.sp * dt; J.z += (zR - J.z) * Math.min(1, dt * 1.2);
        if (J.sp <= 3.6) a.ap = 4;
      } else if (a.ap === 4) {                  // taxi-in along the runway to the slot's x, then onto the apron
        var sl = C.slotXZ(J), tx = sl.x, tz = sl.z, onRw = Math.abs(J.z - zR) < 1.5 && Math.abs(J.x - tx) > 1.2;
        var px = onRw ? tx : tx, pz = onRw ? zR : tz;
        var dx = px - J.x, dz = pz - J.z, dd = Math.hypot(dx, dz);
        var want = Math.atan2(-dz, dx); J.hd += clamp(wrap(want - J.hd), -dt * 1.6, dt * 1.6);
        J.sp = Math.min(4, 1 + dd); J.x += Math.cos(J.hd) * J.sp * dt; J.z -= Math.sin(J.hd) * J.sp * dt;
        if (!onRw && dd < 0.8) { C.park(J); J.t = C.rnd(8, 18) / C.rate(); a.ap = 0; stats.taxiIns++; return true; }
      }
      J.g.position.set(J.x, J.y, J.z);
      return true;
    }
    return false;
  }
  /** Takeoff hold: turn onto the runway heading (visual yaw) before the roll starts. True once lined up. */
  function lineUp(J, dt) {
    if (!J._sa) initJet(J);
    var a = J._sa, d = wrap(J.hd - a.vyaw);
    if (Math.abs(d) < 0.06) { a.vyaw = J.hd; return true; }
    a.vyaw += clamp(d, -dt * 1.1, dt * 1.1); return false;
  }
  /** Called after every theater jet tick: sets the airframe attitude from its real motion. */
  function jetPose(J, dt) {
    if (!J._sa) initJet(J);
    var a = J._sa; if (dt <= 0) return;
    var st = J.st, air = st === 'cruise' || st === 'fight' || st === 'rtb' || (st === 'takeoff' && J.y > 0.9);
    var dyaw = wrap(J.hd - a.phd), om = dyaw / dt;
    if (Math.abs(om) > 4) om = 0;                       // teleports (park / deck launch) are not turns
    a.om += (om - a.om) * Math.min(1, dt * 4);
    var vy = (J.y - a.py) / dt; if (Math.abs(vy) > 40) vy = 0;
    a.vy += (vy - a.vy) * Math.min(1, dt * 3);
    var sp = Math.max(1, J.sp || 1), bankT = 0, pitchT = 0;
    if (air) {
      bankT = -Math.atan(sp * a.om / G); bankT = clamp(bankT, -1.15, 1.15);
      pitchT = clamp(Math.atan2(a.vy, sp), -0.35, 0.4);
      if (st === 'rtb' && a.ap === 2) pitchT = Math.max(pitchT + 0.07, J.y < 2.6 ? 0.12 : 0.04);   // approach attitude, flare
      if (st === 'takeoff') pitchT = Math.max(pitchT, 0.15);
    } else if (st === 'takeoff') { pitchT = J.sp > 20 ? 0.16 : 0; }
    else if (st === 'land') { pitchT = J.sp > 9 ? 0.06 : 0; }
    if (st === 'down') { a.bank += dt * 2.6; pitchT = -0.6; }
    else a.bank += (bankT - a.bank) * Math.min(1, dt * 3.2);
    a.pitch += (pitchT - a.pitch) * Math.min(1, dt * (st === 'takeoff' ? 2 : 3));
    // ground states face the direction they actually move (theaters taxi used to roll out backwards)
    var mvx = J.x - a.px, mvz = J.z - a.pz, mv = Math.hypot(mvx, mvz) / dt, yaw = J.hd;
    if (!air && st !== 'down' && st !== 'dead') {
      if (mv > 0.5 && mv < 40) { var vyaw = Math.atan2(-mvz, mvx); a.vyaw += clamp(wrap(vyaw - a.vyaw), -dt * 2.2, dt * 2.2); }
      else if (st === 'parked') a.vyaw = J.hd;
      yaw = a.vyaw;
    } else a.vyaw = J.hd;
    if (st === 'parked' && mv > 40) { a.vyaw = J.hd; yaw = J.hd; }
    J.g.rotation.order = 'YZX';
    J.g.rotation.set(a.bank, yaw, a.pitch);
    stats.maxBank = Math.max(stats.maxBank * 0.998, Math.abs(a.bank));
    a.px = J.x; a.py = J.y; a.pz = J.z; a.phd = J.hd;
  }

  LB.seaAir = {
    version: 'v12.0.15',
    on: function () { if (THREE == null && LB.engine && LB.engine.THREE) THREE = LB.engine.THREE; return enabled && !!THREE; },
    isEnabled: function () { return enabled; },
    fixColor: fixColor, fixMaterial: fixMaterial, wave: wave,
    moveShip: moveShip, dropShip: dropShip, sinkTick: sinkTick,
    flyHome: flyHome, jetPose: jetPose, lineUp: lineUp,
    getState: function () { return Object.assign({ enabled: enabled, tier: tier(), rich: rich() }, stats); }
  };
})(window);
