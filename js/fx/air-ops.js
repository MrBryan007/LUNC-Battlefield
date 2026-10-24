/* LUNC Battlefield v12.0.33 — Air ops realism for the theater jets. Theater FX only (SIMULATED).
 *
 *  1. Landing gear: a nose leg and two main legs (strut + wheel) on every theater jet. They extend on final approach and
 *     retract a second after lift-off (about 1.5 s travel, hidden when stowed), plus a tailhook that drops for a carrier pass.
 *  2. Engines: nozzle glow + afterburner plume (outer flame and hot core, additive) driven by a throttle model: full reheat
 *     on the takeoff roll, the catapult shot and in a dogfight, dim in cruise, idle on approach and on the ground.
 *     A red anti-collision beacon blinks while the engine runs.
 *  3. Catapult: a deck jet is shot off the carrier's bow (about 3 g, riding the ship's motion) with steam venting along
 *     the track (MEDIUM+), instead of appearing at 14 m/s.
 *  4. Carrier recovery: deck jets fly home to their own carrier while it is afloat. Join astern, glide slope down the deck
 *     centreline, trap with a hard arrest (about 2.5 g), taxi to a deck spot, ride with the ship and get struck below after
 *     12–20 s (back into the airbase pool). Too high / off the centreline at the ramp → bolter or wave-off and a new pass.
 *     A sinking carrier loses the jets on its deck; jets in the pattern divert to the airbase.
 * Hooks (js/theaters/theaters.js): airOps.tick(J, dt, C) before the jet state machine (true = handled), airOps.pose(J, dt)
 * after jetPose, airOps.catapult(J, ship) from deckLaunch. Never touches market data, armies, the front or data labels.
 * Kill switch: ?airops=0 (also off with ?seaair=0 / ?realism=0). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('airops') !== '0' && qs.get('seaair') !== '0' && qs.get('realism') !== '0';
  var THREE = null, R = null;   // shared geometry / materials
  var stats = { decorated: 0, gearDown: 0, gearUp: 0, cycles: 0, catShots: 0, cvApproaches: 0, traps: 0, bolters: 0, waveOffs: 0, struckBelow: 0, diverts: 0, lostOnDeck: 0, steam: 0, onDeck: 0, inPattern: 0, burners: 0 };
  var DECK = 2.025, JY = 0.6, TD = { lo: -10.2, hi: -4.6 }, LZ = 0.9, SPOT = { lx: -6, lz: -1.85 }, STERN = -11.4, BOW = 11.4;
  var CS = { '-1': ['Viper', 'Mustang', 'Ranger', 'Hornet'], '1': ['Raptor', 'Bandit', 'Grizzly', 'Kodiak'] };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function phone() { var e = LB.engine; return global.innerWidth < 760 || !!(e && e.mobile); }
  function rich() { var t = tier(); return !phone() && t !== 'LOW'; }
  function F() { return LB.heavyFx || null; }
  function lin(hex) { var c = new THREE.Color(hex); if (c.convertSRGBToLinear) c.convertSRGBToLinear(); return c; }
  function mySide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function radio(J, text) {
    if (!LB.voice || !LB.voice.say || J.side !== mySide()) return;   // own-side deck calls only (keeps the channel clear)
    try { LB.voice.say({ pri: 1, side: J.side, callsign: J._ao.cs, text: J._ao.cs + ', ' + text, intercepted: false, tag: 'SIMULATED' }); } catch (_) {}
  }

  // ---------------------------------------------------------------- shared parts
  function res() {
    if (R) return R;
    THREE = LB.engine.THREE;
    var strutM = new THREE.MeshStandardMaterial({ color: lin(0xb9bcbf), roughness: 0.45, metalness: 0.7 });
    var tyreM = new THREE.MeshStandardMaterial({ color: lin(0x1c1d1e), roughness: 0.95 });
    var hookM = new THREE.MeshStandardMaterial({ color: lin(0xd8c23a), roughness: 0.6, metalness: 0.3 });
    var flame = new THREE.MeshBasicMaterial({ color: lin(0xff8a2a), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    var core = new THREE.MeshBasicMaterial({ color: lin(0xbfd8ff), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    var beacon = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    var cone = new THREE.ConeGeometry(1, 1, 10, 1, true); cone.translate(0, 0.5, 0); cone.rotateZ(Math.PI / 2);   // base at the nozzle, tip trailing (-x)
    R = { strutM: strutM, tyreM: tyreM, hookM: hookM, beacon: beacon,
      strut: new THREE.BoxGeometry(0.035, 0.26, 0.035), wheel: new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10).rotateX(Math.PI / 2),
      hook: new THREE.BoxGeometry(0.5, 0.025, 0.025).translate(-0.25, 0, 0), bea: new THREE.SphereGeometry(0.045, 6, 4), cone: cone,
      flameMats: [], coreMats: [], flame: flame, core: core };
    return R;
  }
  function leg(g, x, z, dir, twin) {
    var p = new THREE.Group(); p.position.set(x, -0.17, z);
    var s = new THREE.Mesh(R.strut, R.strutM); s.position.y = -0.12; p.add(s);
    var w = new THREE.Mesh(R.wheel, R.tyreM); w.position.y = -0.24; p.add(w);
    if (twin) { var w2 = new THREE.Mesh(R.wheel, R.tyreM); w2.position.set(0, -0.24, 0.06); w.position.z = -0.03; w2.position.z = 0.03; p.add(w2); }
    p.userData.dir = dir; g.add(p); return p;
  }
  function decorate(J) {
    if (J._ao) return J._ao;
    res();
    var g = J.g, a = J._ao = { gear: 1, gearT: 1, hook: 0, hookT: 0, thr: 0, thrT: 0, legs: [], cs: CS[String(J.side)][J.slot % 4] + ' ' + (1 + (J.slot >> 2)), cv: null, cat: null, upAt: 0 };
    if (!g || !g.children || !g.children.length) return a;   // no airframe (heavyFx missing) → logic only
    a.legs.push(leg(g, 0.95, 0, 1, true), leg(g, -0.35, 0.36, -1), leg(g, -0.35, -0.36, -1));
    var hk = new THREE.Group(); hk.position.set(-1.25, -0.16, 0); hk.add(new THREE.Mesh(R.hook, R.hookM)); g.add(hk); a.hookG = hk;
    var fm = R.flame.clone(), cm = R.core.clone();   // per-jet opacity (cheap: 2 materials per jet)
    var fl = new THREE.Mesh(R.cone, fm); fl.position.set(-1.5, 0, 0); fl.scale.set(0.001, 0.16, 0.16); fl.renderOrder = 3; fl.visible = false; g.add(fl);
    var co = new THREE.Mesh(R.cone, cm); co.position.set(-1.5, 0, 0); co.scale.set(0.001, 0.09, 0.09); co.renderOrder = 4; co.visible = false; g.add(co);
    var be = new THREE.Mesh(R.bea, R.beacon); be.position.set(-1.25, 0.77, 0); be.visible = false; g.add(be);
    a.fl = fl; a.co = co; a.be = be; a.fm = fm; a.cm = cm;
    stats.decorated++;
    return a;
  }

  // ---------------------------------------------------------------- ship frame
  function shd(s) { return s._sa ? s._sa.hd : (s.dir > 0 ? 0 : Math.PI); }
  function toWorld(s, lx, lz) { var h = shd(s), c = Math.cos(h), n = Math.sin(h); return { x: s.x + lx * c + lz * n, z: s.z - lx * n + lz * c }; }
  function toLocal(s, x, z) { var h = shd(s), c = Math.cos(h), n = Math.sin(h), dx = x - s.x, dz = z - s.z; return { lx: dx * c - dz * n, lz: dx * n + dz * c }; }
  function deckY(s) { return (s.g ? s.g.position.y : 0) + DECK + JY; }
  function shipV(s) { return s._sa ? s._sa.v : (s.speed || 0); }
  function afloat(s) { return s && s.st === 'sail'; }

  // ---------------------------------------------------------------- catapult (called from deckLaunch)
  function catapult(J, s) {
    if (!enabled) return false;
    var a = decorate(J);
    a.cat = { s: s, lx: -1.5, v: 0 }; a.cv = null; J.carrier = s; J.st = 'takeoff'; J.sp = 0; a.gear = 1; a.gearT = 1;
    var p = toWorld(s, a.cat.lx, LZ); J.x = p.x; J.z = p.z; J.y = deckY(s); J.hd = shd(s);
    stats.catShots++; return true;
  }
  function tickCat(J, dt, a) {
    var c = a.cat, s = c.s;
    if (!afloat(s)) { a.cat = null; J.st = 'down'; return false; }
    c.v += 30 * dt; c.lx += c.v * dt;   // ≈ 3 g shuttle stroke
    var p = toWorld(s, c.lx, LZ); J.x = p.x; J.z = p.z; J.y = deckY(s); J.hd = shd(s); J.sp = shipV(s) + c.v;
    a.thrT = 1;
    var f = F(); if (f && rich() && Math.random() < dt * 22) { var q = toWorld(s, c.lx - 1.2, LZ); f.puff({ kind: 'smoke', x: q.x, y: deckY(s) - 0.5, z: q.z, vy: 0.9, size: 0.5, grow: 2.2, life: 1.3, color: 0xf2f4f5, opacity: 0.45, drag: 0.9 }); stats.steam++; }
    if (c.lx >= BOW) { a.cat = null; J.sp = Math.max(24, J.sp); J.y += 0.15; a.upAt = 0; }   // off the bow → normal climb-out
    return true;
  }

  // ---------------------------------------------------------------- carrier recovery
  function startCv(J, a) {
    a.cv = { s: J.carrier, ph: 'join', t: 0, wire: 0, park: 0, rv: 0, lx: 0, lz: 0, err: 0 }; stats.cvApproaches++;
  }
  function tickCv(J, dt, a, C) {
    var v = a.cv, s = v.s;
    if (!afloat(s)) {
      if (J.st === 'land') { J.g.visible = false; J.st = 'dead'; J.t = 25 + Math.random() * 15; stats.lostOnDeck++; var f = F(); if (f) f.puff({ kind: 'fire', x: J.x, y: J.y, z: J.z, size: 1.6, grow: 0.8, life: 0.8, color: 0xff8a3a, opacity: 0.9 }); }
      else { stats.diverts++; J.carrier = null; }
      a.cv = null; return J.st === 'dead';
    }
    var h = shd(s), L = toLocal(s, J.x, J.z), dy = deckY(s);
    if (v.ph === 'join' || v.ph === 'final') {
      J.st = 'rtb';
      if (v.ph === 'join') {
        var ip = toWorld(s, STERN - 85, LZ + 10), d = C.steer(J, ip.x, dy + 9, ip.z, dt, 1.0);
        J.sp += clamp(22 - J.sp, -6 * dt, 6 * dt); a.thrT = 0.2;
        if (d < 16) { v.ph = 'final'; v.t = 0; v.err = Math.random() < 0.18 ? 0.9 + Math.random() * 0.6 : 0; }   // ~1 in 5 passes come in high → bolter
      } else {
        v.t += dt;
        var along = L.lx - TD.lo, look = clamp(Math.abs(along) * 0.35, 8, 26);
        var tp = toWorld(s, Math.min(L.lx + look, BOW), LZ);
        var gs = dy - 0.4 + v.err + Math.max(0, -along) * 0.105;    // ~6° glide slope to the wires (carrier approaches are steep)
        var tgtSp = shipV(s) + 15;
        J.sp += clamp(tgtSp - J.sp, -5 * dt, 5 * dt); a.thrT = 0.35; a.hookT = 1;
        C.steer(J, tp.x, gs, tp.z, dt, 1.1);
        var aligned = Math.abs(wrap(J.hd - h)) < 0.35;
        if (aligned) J.y += (gs - J.y) * Math.min(1, dt * 1.8);
        if (L.lx > STERN - 0.5 && L.lx < BOW && Math.abs(L.lz) < 2.6 && J.y < dy) J.y = dy;   // wheels on the deck, never through it
        if (L.lx > STERN - 30 && Math.abs(L.lz - LZ) > 5) { stats.waveOffs++; v.ph = 'join'; radio(J, 'wave off, wave off.'); }
        else if (L.lx >= TD.lo && L.lx <= TD.hi && J.y <= dy + 0.45 && Math.abs(L.lz - LZ) < 1.6 && aligned) {
          v.ph = 'trap'; v.wire = 1 + Math.min(3, Math.floor((L.lx - TD.lo) / ((TD.hi - TD.lo) / 4))); v.rv = Math.max(4, J.sp - shipV(s)); v.lx = L.lx; v.lz = L.lz;
          J.st = 'land'; stats.traps++; radio(J, 'trap, ' + v.wire + ' wire.');
          var f2 = F(); if (f2) { var tw = toWorld(s, L.lx - 1, L.lz); f2.puff({ kind: 'smoke', x: tw.x, y: dy - 0.45, z: tw.z, size: 0.6, grow: 1.6, life: 0.7, color: 0x9a9b98, opacity: 0.45 }); }
        } else if (L.lx > TD.hi && L.lx < BOW + 4 && J.y < dy + 3) {   // past the wires and still flying → bolter, go around
          stats.bolters++; v.ph = 'bolter'; v.t = 0; radio(J, 'bolter, bolter.');
        }
        if (v.t > 40) { v.ph = 'join'; v.t = 0; }
      }
      return true;
    }
    if (v.ph === 'bolter') {   // full power, climb out over the bow, then re-join
      J.st = 'rtb'; v.t += dt; a.thrT = 1; a.hookT = 1;
      J.sp = Math.min(30, J.sp + 10 * dt); J.x += Math.cos(J.hd) * J.sp * dt; J.z -= Math.sin(J.hd) * J.sp * dt; J.y += dt * 4;
      if (v.t > 3.5) { v.ph = 'join'; v.t = 0; }
      return true;
    }
    // on deck: trap → taxi to the spot → parked → struck below
    J.st = 'land'; a.thrT = 0;
    if (v.ph === 'trap') {
      v.rv = Math.max(0, v.rv - 25 * dt); v.lx += v.rv * dt; v.lz += (LZ - v.lz) * Math.min(1, dt * 3);
      if (v.rv <= 0) { v.ph = 'taxi'; a.hookT = 0; }
    } else if (v.ph === 'taxi') {
      var dx = SPOT.lx - v.lx, dz = SPOT.lz - v.lz, dd = Math.hypot(dx, dz);
      if (dd < 0.15) { v.ph = 'parked'; v.park = 12 + Math.random() * 8; }
      else { var st = Math.min(2.2, dd) * dt; v.lx += dx / dd * st; v.lz += dz / dd * st; }
    } else if (v.ph === 'parked') {
      v.park -= dt;
      if (v.park <= 0) { a.cv = null; J.carrier = s; C.park(J); J.t = C.rnd(8, 18) / C.rate(); stats.struckBelow++; return true; }
    }
    var w = toWorld(s, v.lx, v.lz); J.x = w.x; J.z = w.z; J.y = dy; J.sp = shipV(s) + (v.ph === 'trap' ? v.rv : 0);
    if (v.ph !== 'taxi') J.hd = h; else { var want = h + Math.atan2(-(SPOT.lz - v.lz), SPOT.lx - v.lx); J.hd += clamp(wrap(want - J.hd), -dt * 1.5, dt * 1.5); }
    return true;
  }

  /** Before the theater state machine. True = this module moved the jet this tick. */
  function tick(J, dt, C) {
    if (!enabled || !LB.engine || !LB.engine.THREE) return false;
    var a = decorate(J);
    if (a.cat) { if (J.st !== 'takeoff') a.cat = null; else return tickCat(J, dt, a); }
    if (a.cv && !(J.st === 'rtb' || J.st === 'land')) { a.cv = null; }    // shot down in the pattern
    if (!a.cv && J.st === 'rtb' && J.carrier) { if (afloat(J.carrier)) startCv(J, a); else { J.carrier = null; stats.diverts++; } }
    if (a.cv) return tickCv(J, dt, a, C);
    return false;
  }

  /** After jetPose: gear / hook / throttle / beacon. */
  function pose(J, dt) {
    if (!enabled || !J._ao) return;
    var a = J._ao, st = J.st, ap = J._sa ? J._sa.ap : 0;
    // gear: down on the ground, on the takeoff roll until ~2 s after lift-off, and on final (airbase or carrier)
    var down = st === 'parked' || st === 'taxi' || st === 'land' || st === 'dead';
    if (st === 'takeoff') { if (J.y > (J.carrier ? deckY(J.carrier) + 0.6 : 0.9)) { a.upAt += dt; } down = a.upAt < 1.2; }
    else a.upAt = 0;
    if (st === 'rtb' && (ap === 2 || (a.cv && a.cv.ph === 'final'))) down = J.y < 14 || ap === 2;
    if (st === 'down') down = a.gear > 0.5;
    a.gearT = down ? 1 : 0;
    var was = a.gear; a.gear += clamp(a.gearT - a.gear, -dt / 1.5, dt / 1.5);
    if (was > 0 && a.gear === 0) stats.cycles++;
    for (var i = 0; i < a.legs.length; i++) { var p = a.legs[i]; p.rotation.z = (1 - a.gear) * 1.45 * p.userData.dir; p.visible = a.gear > 0.03; }
    // hook
    if (!a.cv) a.hookT = 0;
    a.hook += clamp(a.hookT - a.hook, -dt, dt); if (a.hookG) a.hookG.rotation.z = a.hook * 0.55;
    // throttle
    if (!a.cat && !a.cv) a.thrT = st === 'takeoff' ? 1 : st === 'fight' ? 0.85 : st === 'cruise' ? 0.3 : st === 'rtb' ? (ap === 2 ? 0.3 : 0.25) : st === 'land' || st === 'taxi' ? 0.08 : 0;
    a.thr += clamp(a.thrT - a.thr, -dt * 1.4, dt * 2.5);
    if (a.fl) {
      var reheat = a.thr > 0.6, on = st !== 'parked' && st !== 'dead' && st !== 'down';
      var flick = 0.88 + Math.random() * 0.24, len = (0.25 + a.thr * 1.6) * flick;
      a.fl.visible = on && reheat && !phone(); a.co.visible = on && a.thr > 0.05;
      if (a.fl.visible) { a.fl.scale.set(len, 0.16, 0.16); a.fm.opacity = Math.min(0.8, (a.thr - 0.5) * 1.6); }
      if (a.co.visible) { a.co.scale.set(0.2 + a.thr * 0.8 * flick, 0.09, 0.09); a.cm.opacity = 0.25 + a.thr * 0.55; }
      a.be.visible = on && st !== 'down' && ((performance.now() / 1000 + J.slot * 0.13) % 1) < 0.12;
    }
  }

  function getState() {
    var o = Object.assign({ enabled: enabled, tier: tier(), rich: rich() }, stats), jets = [];
    try { jets = LB.theaters && LB.theaters._jets ? LB.theaters._jets() : []; } catch (_) {}
    var gd = 0, gu = 0, deck = 0, pat = 0, bu = 0;
    jets.forEach(function (J) { var a = J._ao; if (!a) return; if (a.gear > 0.97) gd++; else if (a.gear < 0.03) gu++; if (a.cv) { if (J.st === 'land') deck++; else pat++; } if (a.fl && a.fl.visible) bu++; });
    o.gearDown = gd; o.gearUp = gu; o.onDeck = deck; o.inPattern = pat; o.burners = bu; o.jets = jets.length;
    return o;
  }

  LB.airOps = { version: 'v12.0.33', isEnabled: function () { return enabled; }, tick: tick, pose: pose, catapult: catapult, getState: getState,
    _jet: function (J) { return J && J._ao ? { gear: +J._ao.gear.toFixed(2), hook: +J._ao.hook.toFixed(2), thr: +J._ao.thr.toFixed(2), cv: J._ao.cv ? J._ao.cv.ph : null, cat: !!J._ao.cat } : null; } };
})(window);
