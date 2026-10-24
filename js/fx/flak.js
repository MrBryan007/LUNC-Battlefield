/* LUNC Battlefield v12.0.34 — Flak: aimed AA shells with time + proximity fuzes. Theater FX only (SIMULATED).
 *
 * Replaces the airbase AA guns' flat 6 % kill roll (js/theaters/theaters.js tickBases) and gives the HQ base AA defenses
 * (js/theaters/base-invasion.js fireAA, tracers only until now) real shells:
 *  - Lead: predicted intercept from the jet's heading, speed and climb, the shell's time of flight (muzzle ~75 m/s) and
 *    gravity drop. Aim dispersion grows with range and with the weather / night / cyber 'aa' modifier (wxCombat).
 *  - Shells fly ballistic with a faint tracer, a time fuze set to the predicted intercept and a proximity fuze (~3 m).
 *    A turning / jinking jet beats the lead more often than a straight flyer.
 *  - Bursts: flash + lingering black puff that drifts; fragment damage falls off with distance (lethal inside ~1.5 m,
 *    nothing beyond 5 m). Jets keep hit points (J.hp): a damaged jet trails smoke and breaks off for home; at 0 it goes down.
 * API: flak.fire(x, y, z, jet, side, opts) → true when a shell left the barrel; flak.update(dt); flak.getState().
 * Never touches market data, armies, the front or data-truth labels. Kill switch: ?flak=0 (the old random roll returns). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('flak') !== '0';
  var G = 9.8, VS = 75, PROX = 3.0, LETHAL = 1.5, REACH = 5.0;
  var shells = [], stats = { fired: 0, bursts: 0, prox: 0, timed: 0, hits: 0, damaged: 0, kills: 0, rtb: 0, inFlight: 0, dropped: 0, lastMiss: 0 };
  var CAP = { LOW: 16, MEDIUM: 32, HIGH: 48, ULTRA: 64 };

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; }
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function phone() { var e = LB.engine; return global.innerWidth < 760 || !!(e && e.mobile); }
  function lowFx() { return phone() || tier() === 'LOW'; }
  function F() { return LB.heavyFx || null; }
  function WXM(side) { try { return LB.wxCombat && LB.wxCombat.isEnabled() ? LB.wxCombat.mod('aa', side) : 1; } catch (_) { return 1; } }
  function jets() { try { return LB.theaters && LB.theaters._jets ? LB.theaters._jets() : []; } catch (_) { return []; } }
  function airborne(J) { var s = J.st; return (s === 'cruise' || s === 'fight' || s === 'rtb' || s === 'takeoff') && J.y > 2.5 && (!J.g || J.g.visible !== false); }
  function mySide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function cs(J) { return (J._ao && J._ao.cs) || ((J.side < 0 ? 'Viper ' : 'Raptor ') + (1 + (J.slot || 0))); }
  function radio(side, callsign, text) {
    if (!LB.voice || !LB.voice.say || side !== mySide()) return;
    try { LB.voice.say({ pri: 1, side: side, callsign: callsign, text: text, intercepted: false, tag: 'SIMULATED' }); } catch (_) {}
  }
  function camDist(x, y, z) { try { var c = LB.engine.camera.position; return Math.hypot(c.x - x, c.y - y, c.z - z); } catch (_) { return 100; } }

  /** Fire one shell from (x, y, z) at jet J for `side`. */
  function fire(x, y, z, J, side, o) {
    if (!enabled || !J || !airborne(J)) return false;
    if (shells.length >= (CAP[tier()] || 32)) { stats.dropped++; return false; }
    o = o || {};
    var vs = o.v || VS, sp = J.sp || 0, vx = Math.cos(J.hd || 0) * sp, vz = -Math.sin(J.hd || 0) * sp;
    var vy = J._sa ? J._sa.vy || 0 : 0;
    // lead: two fixed-point iterations of the intercept time
    var px = J.x, py = J.y, pz = J.z, t = 0;
    for (var k = 0; k < 3; k++) { t = Math.hypot(px - x, py - y, pz - z) / vs; px = J.x + vx * t; py = J.y + vy * t; pz = J.z + vz * t; }
    if (t > 2.2) return false;   // out of effective range
    var m = Math.max(0.3, WXM(side)), sig = (0.6 + t * vs * 0.022) / m;   // dispersion grows with range, worse in bad weather / cyber
    px += gauss() * sig; py += gauss() * sig * 0.7; pz += gauss() * sig;
    var s = { x: x, y: y, z: z, vx: (px - x) / t, vy: (py - y) / t + 0.5 * G * t, vz: (pz - z) / t, t: 0, fuze: t + rnd(-0.06, 0.06), side: side, tgt: J, trc: Math.random() < 0.5 };
    shells.push(s); stats.fired++;
    var f = F(); if (f && !lowFx()) f.puff({ kind: 'fire', x: x, y: y + 0.2, z: z, size: 0.6, grow: 0.3, life: 0.12, color: 0xffd38a, opacity: 0.9 });
    return true;
  }

  var lastBurst = null;
  function burst(s, prox) {
    lastBurst = { x: s.x, y: s.y, z: s.z, prox: prox };
    stats.bursts++; if (prox) stats.prox++; else stats.timed++;
    var f = F(), lo = lowFx();
    if (f) {
      f.puff({ kind: 'fire', x: s.x, y: s.y, z: s.z, size: 1.3, grow: 0.5, life: 0.16, color: 0xffc070, opacity: 0.95 });
      f.puff({ kind: 'smoke', x: s.x, y: s.y, z: s.z, vx: rnd(0.3, 0.9), vy: 0.15, size: 1.4, grow: 1.45, life: lo ? 2.2 : 3.4, color: 0x161514, opacity: 0.72, drag: 0.985 });
      if (!lo) f.puff({ kind: 'smoke', x: s.x + rnd(-0.6, 0.6), y: s.y + rnd(-0.4, 0.4), z: s.z + rnd(-0.6, 0.6), vx: rnd(0.3, 0.9), size: 1.0, grow: 1.6, life: 3.0, color: 0x2a2826, opacity: 0.5, delay: 0.05, drag: 0.985 });
    }
    if (LB.sfx && LB.sfx.explosion) { var d = camDist(s.x, s.y, s.z); if (d < 220) try { LB.sfx.explosion(0.45, d); } catch (_) {} }
    var list = jets(), hitAny = false;
    for (var i = 0; i < list.length; i++) {
      var J = list[i]; if (J.side === s.side || !airborne(J)) continue;
      var dd = Math.hypot(J.x - s.x, J.y - s.y, J.z - s.z); if (dd > REACH) continue;
      var dmg = dd <= LETHAL ? 1.2 : Math.pow(1 - (dd - LETHAL) / (REACH - LETHAL), 1.6) * 0.9 * (0.6 + Math.random() * 0.6);
      if (dmg < 0.05) continue;
      hitAny = true; stats.hits++;
      J.hp = (J.hp == null ? 1 : J.hp) - dmg;
      if (J.hp <= 0) {
        if (J.st !== 'down') { J.st = 'down'; stats.kills++; radio(s.side, s.side < 0 ? 'Skyguard' : 'Iron Dome', 'splash one, ' + cs(J) + ' going down.'); }
      } else {
        stats.damaged++;
        if (!J._flakHit) { J._flakHit = 1; radio(J.side, cs(J), 'hit by flak, breaking off, RTB.'); }
        if (J.st === 'cruise' || J.st === 'fight') { J.t = Math.min(J.t || 0, 1.5); stats.rtb++; }
      }
    }
    if (!hitAny) stats.lastMiss = Math.round(Math.min(99, Math.hypot(s.tgt.x - s.x, s.tgt.y - s.y, s.tgt.z - s.z)) * 10) / 10;
  }

  function update(dt) {
    if (!enabled || !(dt > 0)) return;
    var f = F(), lo = lowFx(), list = jets();
    for (var i = shells.length - 1; i >= 0; i--) {
      var s = shells[i]; s.t += dt; s.vy -= G * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.trc && f && !lo && Math.random() < 0.7) f.puff({ kind: 'tracer', x: s.x, y: s.y, z: s.z, size: 0.3, grow: 0.1, life: 0.12, color: 0xffe08a, opacity: 0.85 });
      var prox = false;
      for (var j = 0; j < list.length; j++) { var J = list[j]; if (J.side === s.side || !airborne(J)) continue; if (Math.abs(J.x - s.x) < PROX && Math.abs(J.z - s.z) < PROX && Math.hypot(J.x - s.x, J.y - s.y, J.z - s.z) < PROX) { prox = true; break; } }
      if (prox || s.t >= s.fuze) { shells.splice(i, 1); burst(s, prox); continue; }
      if (s.y < 0 || s.t > 4) shells.splice(i, 1);
    }
    stats.inFlight = shells.length;
    // damaged jets trail smoke; a repaired jet (parked → hp 1) is clean again
    if (f) for (var k = 0; k < list.length; k++) {
      var Q = list[k]; if (Q.st === 'parked') { Q._flakHit = 0; continue; }
      if (Q.hp < 1 && airborne(Q) && Math.random() < dt * (lo ? 3 : 7) * (1.2 - Q.hp)) f.puff({ kind: 'smoke', x: Q.x - Math.cos(Q.hd) * 1.6, y: Q.y, z: Q.z + Math.sin(Q.hd) * 1.6, size: 0.6, grow: 1.6, life: 1.6, color: 0x3a3632, opacity: 0.5 });
    }
  }

  LB.flak = { version: 'v12.0.34', isEnabled: function () { return enabled; }, fire: fire, update: update,
    getState: function () { return Object.assign({ enabled: enabled, cap: CAP[tier()] || 32 }, stats); },
    _shells: function () { return shells; }, _last: function () { return lastBurst; } };
})(window);
