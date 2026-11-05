/* LUNC Battlefield v12.0.58 — Flight controls: flaps, control surfaces, speed brake and wingtip vapour
 * (realism checklist, sea & air: "flaps/slats animation"). Theater FX only (SIMULATED), never touches the sim.
 *
 *  - Every theater jet gets hinged parts sized from its own airframe (the delta wing and the fin are measured, so the
 *    parts sit on the real edges) and painted with the airframe's own material (camo included):
 *      · two trailing-edge elevons (the delta's flaps + elevators + ailerons in one surface),
 *      · two leading-edge flaps along the swept leading edges,
 *      · a rudder on the back of the fin,
 *      · a dorsal speed brake behind the canopy.
 *  - Elevons droop as flaps on the takeoff roll, on approach and in the flare, deflect trailing-edge-up to pitch up
 *    (from the pitch rate), and split for roll (from the bank rate). Leading-edge flaps droop at low speed and in hard
 *    turns. The rudder follows the yaw rate in the air and steers on the ground. The speed brake opens on the landing
 *    rollout, on a fast approach and when a fighter bleeds speed in a dogfight. Every hinge has a rate limit.
 *  - Wingtip vapour (MEDIUM+): hard dogfight turns pull white vortices off both wingtips; humid air (rain, fog or
 *    still-wet ground from v12.0.57 rain-mud) shows them at lower g. Budgeted per tick.
 * Hook: js/theaters/theaters.js calls flightControls.pose(J, dt) right after airOps.pose / jetPose.
 * Kill switch: ?flightctl=0 (also off with ?seaair=0 / ?realism=0). API: LUNCBattle.flightControls.getState().
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('flightctl') !== '0' && qs.get('seaair') !== '0' && qs.get('realism') !== '0';

  var RATE = { elevon: 1.6, lef: 0.9, rudder: 2.2, brake: 1.2 };            // rad/s hinge rates
  var MAX = { flap: 0.42, pitch: 0.3, roll: 0.28, lef: 0.35, rudder: 0.4, brake: 0.95 };
  var THREE = null, _v = null, _w = null;
  var vapAcc = 0;
  var stats = { decorated: 0, skipped: 0, flapsDown: 0, brakesOut: 0, vapour: 0, maxElevon: 0, maxRudder: 0, maxSplit: 0 };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function phone() { var e = LB.engine; return global.innerWidth < 760 || !!(e && e.mobile); }
  function rich() { return !phone() && tier() !== 'LOW'; }
  function humid() {
    var w = 'clear'; try { w = LB.v12extras.getOptions().weather; } catch (_) {}
    var wet = 0; try { wet = LB.rainMud && LB.rainMud.isEnabled() ? LB.rainMud.levels().wet : 0; } catch (_) {}
    return Math.max(w === 'rain' ? 1 : w === 'fog' ? 0.8 : 0, wet);
  }
  function step(cur, tgt, rate, dt) { return cur + clamp(tgt - cur, -rate * dt, rate * dt); }

  // ---------------------------------------------------------------- build (measure the airframe, add hinged parts)
  function measure(g) {
    var wing = null, fin = null, best = 0;
    g.updateMatrix();
    g.children.forEach(function (m) {
      if (!m.isMesh || !m.geometry) return;
      var gp = m.geometry.parameters || {};
      if (m.geometry.type === 'ConeGeometry' && gp.radialSegments === 3) wing = m;
      else if (m.geometry.type === 'BoxGeometry' && gp.height > gp.width && gp.depth < 0.1 && gp.height > best) { best = gp.height; fin = m; }
    });
    if (!wing) return null;
    if (!wing.geometry.boundingBox) wing.geometry.computeBoundingBox();
    wing.updateMatrix();
    var bb = wing.geometry.boundingBox.clone().applyMatrix4(wing.matrix);
    return { wing: wing, fin: fin, minX: bb.min.x, maxX: bb.max.x, span: Math.max(Math.abs(bb.min.z), Math.abs(bb.max.z)), y: (bb.min.y + bb.max.y) / 2, t: Math.max(0.03, bb.max.y - bb.min.y) };
  }
  function hinge(parent, x, y, z) { var h = new THREE.Group(); h.position.set(x, y, z); parent.add(h); return h; }
  function slab(h, w, t, d, mat, ox, oz) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), mat); b.position.set(ox || 0, 0, oz || 0); b.castShadow = false; h.add(b); return b; }
  function decorate(J) {
    if (J._fc) return J._fc;
    var g = J.g; THREE = THREE || (LB.engine && LB.engine.THREE);
    var c = J._fc = { ok: false, el: [0, 0], lef: 0, rud: 0, brk: 0, pp: null, pb: null, ph: null, sp: null, flap: 0 };
    if (!THREE || !g || !g.children || !g.children.length) { stats.skipped++; return c; }
    var M = measure(g); if (!M) { stats.skipped++; return c; }
    _v = _v || new THREE.Vector3(); _w = _w || new THREE.Vector3();
    var mat = M.wing.material, chord = Math.min(0.2, (M.maxX - M.minX) * 0.13), t = Math.max(0.02, M.t * 0.55);
    // a delta's span at the trailing edge is the full span, so the elevons run from the fuselage (≈0.24) to ~90 %
    var z0 = 0.26, z1 = M.span * 0.9, len = z1 - z0;
    c.elH = [-1, 1].map(function (s) { var h = hinge(g, M.minX + 0.01, M.y, s * (z0 + len / 2)); slab(h, chord, t, len, mat, -chord / 2, 0); return h; });
    // leading-edge flaps: along each swept edge from 30 % to 85 % of the span, hinge line on the edge
    // local +x of each flap group runs along its swept edge (root → tip); the hinge sits at the flap's rear, so a
    // positive droop lowers the front edge
    var L = M.maxX - M.minX, eLen = Math.hypot(M.span, L), lc = chord * 0.55;
    c.lefH = [-1, 1].map(function (s) {
      var f0 = 0.3, f1 = 0.85, fm = (f0 + f1) / 2;
      var outer = hinge(g, M.maxX - L * fm, M.y, s * M.span * fm);
      outer.rotation.y = Math.atan2(-s * M.span, -L);
      var inner = new THREE.Group(); inner.position.z = s * lc; outer.add(inner);
      slab(inner, eLen * (f1 - f0), t * 0.9, lc, mat, 0, -s * lc / 2);
      return inner;
    });
    if (M.fin) {
      var fp = M.fin.geometry.parameters, fx = M.fin.position.x - fp.width / 2, rh = fp.height * 0.78;
      c.rudH = hinge(g, fx, M.fin.position.y + (fp.height - rh) * 0.1, 0); slab(c.rudH, Math.min(0.16, fp.width * 0.35), rh, Math.max(0.03, fp.depth * 0.8), M.fin.material, -Math.min(0.16, fp.width * 0.35) / 2, 0);
      c.finTop = M.fin.position.y + fp.height / 2;
    }
    // dorsal speed brake: hinge at its front edge, opens trailing-edge up
    c.brkH = hinge(g, -0.15, 0.215, 0); slab(c.brkH, 0.42, 0.02, 0.2, mat, -0.21, 0);
    c.tips = [new THREE.Vector3(M.minX + 0.05, M.y, -M.span * 0.97), new THREE.Vector3(M.minX + 0.05, M.y, M.span * 0.97)];
    c.ok = true; stats.decorated++;
    return c;
  }

  // ---------------------------------------------------------------- per-frame pose
  function pose(J, dt) {
    if (!enabled || !J || !J.g || dt <= 0) return;
    var c = J._fc || decorate(J); if (!c.ok) return;
    var st = J.st, sa = J._sa || {}, ao = J._ao || {}, sp = J.sp || 0;
    var air = st === 'cruise' || st === 'fight' || st === 'rtb' || (st === 'takeoff' && J.y > 0.9);
    // rates from the attitude realism-seaair already computes
    var pitch = sa.pitch || 0, bank = sa.bank || 0;
    var dP = c.pp == null ? 0 : (pitch - c.pp) / dt, dB = c.pb == null ? 0 : wrap(bank - c.pb) / dt, om = sa.om || 0;
    c.pp = pitch; c.pb = bank;
    var slowing = c.sp != null ? (c.sp - sp) / dt : 0; c.sp = sp;
    // flaps: takeoff roll + climb-out until the gear is up, approach (ap 2 = final) and the landing rollout
    var final = st === 'rtb' && (sa.ap === 2 || (ao.cv && ao.cv.ph && ao.cv.ph !== 'join'));
    var flapT = st === 'takeoff' ? (ao.gear == null || ao.gear > 0.3 ? 0.6 : 0.15) : final ? 1 : st === 'land' ? (sp > 4 ? 1 : 0.3) : st === 'taxi' ? 0.3 : 0;
    if (st === 'down' || st === 'dead' || st === 'parked') flapT = st === 'parked' ? 0 : c.flap;
    c.flap = step(c.flap, flapT, 0.6, dt);
    var pitchCmd = air ? clamp(-dP * 0.9, -1, 1) * MAX.pitch : 0;           // trailing edge up (negative) to pitch up
    var rollCmd = air ? clamp(dB * 0.8, -1, 1) * MAX.roll : 0;               // split for roll
    if (st === 'down') { pitchCmd = 0.2 * Math.sin(performance.now() / 180 + J.slot); rollCmd = 0.25; }
    for (var i = 0; i < 2; i++) {
      var s = i === 0 ? -1 : 1, tgt = clamp(c.flap * MAX.flap + pitchCmd + s * rollCmd, -0.5, 0.6);
      c.el[i] = step(c.el[i], tgt, RATE.elevon, dt); c.elH[i].rotation.z = c.el[i];
      if (Math.abs(c.el[i]) > stats.maxElevon) stats.maxElevon = +Math.abs(c.el[i]).toFixed(3);
    }
    var split = Math.abs(c.el[0] - c.el[1]); if (split > stats.maxSplit) stats.maxSplit = +split.toFixed(3);
    var lefT = air ? clamp((sp < 30 ? (30 - sp) / 18 : 0) + (final ? 0.7 : 0) + Math.max(0, Math.abs(bank) - 0.6) * 0.8, 0, 1) * MAX.lef : st === 'takeoff' || st === 'land' ? MAX.lef * 0.6 : 0;
    c.lef = step(c.lef, lefT, RATE.lef, dt); c.lefH[0].rotation.x = c.lef; c.lefH[1].rotation.x = -c.lef;
    if (c.rudH) {
      var steer = 0;
      if (!air && (st === 'taxi' || st === 'land' || st === 'takeoff')) { var ph = c.ph == null ? (sa.vyaw || J.hd) : c.ph, ny = sa.vyaw != null ? sa.vyaw : J.hd; steer = clamp(wrap(ny - ph) / dt * 0.6, -1, 1); c.ph = ny; }
      else c.ph = null;
      var rudT = clamp((air ? om * 0.8 : steer), -1, 1) * MAX.rudder;
      c.rud = step(c.rud, rudT, RATE.rudder, dt); c.rudH.rotation.y = c.rud;
      if (Math.abs(c.rud) > stats.maxRudder) stats.maxRudder = +Math.abs(c.rud).toFixed(3);
    }
    var brkT = (st === 'land' && sp > 3) || (final && sp > 34) || (st === 'fight' && slowing > 4) ? MAX.brake : 0;
    c.brk = step(c.brk, brkT, RATE.brake, dt); c.brkH.rotation.z = -c.brk;
    // wingtip vapour (MEDIUM+)
    if (air && rich() && LB.heavyFx && LB.heavyFx.puff) {
      var g = Math.abs(bank) > 0.05 ? 1 / Math.max(0.2, Math.cos(Math.abs(bank))) : 1, hum = humid();
      var need = st === 'fight' ? 2.2 - hum * 0.9 : 2.8 - hum * 1.2;
      if (g > need && vapAcc > 0) {
        vapAcc--; J.g.updateMatrixWorld();
        for (var k = 0; k < 2; k++) {
          _v.copy(c.tips[k]); J.g.localToWorld(_v);
          LB.heavyFx.puff({ kind: 'smoke', x: _v.x, y: _v.y, z: _v.z, size: 0.18, grow: 0.9, life: 0.55 + hum * 0.4, color: 0xf2f5f8, opacity: 0.35 + hum * 0.2, drag: 0.6 });
          stats.vapour++;
        }
      }
    }
  }
  // the vapour budget refills on the frame clock (≈ 40 pairs a second across all jets)
  function tick(dt) { vapAcc = Math.min(6, vapAcc + dt * 40); }

  function getState() {
    var o = Object.assign({ enabled: enabled, tier: tier(), rich: rich() }, stats), jets = [];
    try { jets = LB.theaters && LB.theaters._jets ? LB.theaters._jets() : []; } catch (_) {}
    var fd = 0, bo = 0;
    jets.forEach(function (J) { var c = J._fc; if (!c || !c.ok) return; if (c.flap > 0.5) fd++; if (c.brk > 0.5) bo++; });
    o.flapsDown = fd; o.brakesOut = bo; o.jets = jets.length;
    return o;
  }

  LB.flightControls = {
    version: 'v12.0.58', isEnabled: function () { return enabled; }, pose: pose, tick: tick, getState: getState,
    _jet: function (J) { var c = J && J._fc; return c && c.ok ? { flap: +c.flap.toFixed(2), el: c.el.map(function (v) { return +v.toFixed(3); }), lef: +c.lef.toFixed(3), rud: +c.rud.toFixed(3), brk: +c.brk.toFixed(2) } : null; }
  };
})(window);
