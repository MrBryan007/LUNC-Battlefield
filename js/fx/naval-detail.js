/* LUNC Battlefield v12.0.30 — Navy detail: funnels, exhaust, radar, deck markings.
 *
 * Theater FX only (SIMULATED). Never touches market data, the price→X mapping, the frontline, army counts or labels.
 * Decorates every ship the theaters spawn (LB.theaters._ships()), with shared geometry and materials and no assets:
 *  - destroyers / battleships: raked funnels with black caps (1 / 2), a mast with a yardarm and a rotating air-search
 *    radar, a dark boot-top band at the waterline, small AA mounts and lifeboats;
 *  - carrier: a funnel on the island, island mast + rotating radar, boot-top, painted deck markings (dashed centre line,
 *    angled landing-area lines, foul line, elevator outline);
 *  - funnel exhaust that thickens with speed and in turns (MEDIUM+ and not on phones); a burning, sinking or sunk ship
 *    stops making exhaust and its radar stops.
 * Ship local axes: bow +x, beam z, waterline about y 0.25 (realism-seaair sits hulls 0.6 below the wave height).
 * Kill switch: ?navdetail=0 (also off with ?realism=0 or ?seaair=0). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('navdetail') !== '0' && qs.get('realism') !== '0' && qs.get('seaair') !== '0' && qs.get('theaters') !== '0';
  var THREE = null, geo = null, mat = null, last = 0, _v = null;
  var stats = { decorated: 0, funnels: 0, radars: 0, exhaust: 0, markings: 0 };

  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function phone() { var e = LB.engine; return global.innerWidth < 760 || !!(e && e.mobile); }
  function rich() { var t = tier(); return !phone() && t !== 'LOW'; }
  function col(hex) { var c = new THREE.Color(hex); if (c.convertSRGBToLinear) c.convertSRGBToLinear(); return c; }
  function sm(hex, rough, metal) { return new THREE.MeshStandardMaterial({ color: col(hex), roughness: rough == null ? 0.8 : rough, metalness: metal || 0 }); }

  function init() {
    THREE = LB.engine.THREE; _v = new THREE.Vector3();
    geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      funnel: new THREE.CylinderGeometry(0.5, 0.56, 1, 12),
      cap: new THREE.CylinderGeometry(0.53, 0.53, 1, 12),
      mast: new THREE.CylinderGeometry(0.05, 0.07, 1, 6),
      boat: new THREE.CylinderGeometry(0.16, 0.16, 1, 8, 1, false, 0, Math.PI),
      aa: new THREE.CylinderGeometry(0.22, 0.26, 0.22, 8),
      dish: new THREE.BoxGeometry(1, 0.32, 0.06)
    };
    geo.funnel.rotateZ(-0.12);   // raked aft (bow is +x)
    geo.cap.rotateZ(-0.12);
    mat = {
      gray: { '-1': sm(0x6d7774, 0.72, 0.25), '1': sm(0x77706c, 0.72, 0.25) },
      cap: sm(0x161616, 0.9), boot: sm(0x3a1d1a, 0.85), steel: sm(0x3f4446, 0.5, 0.6), radar: sm(0x9aa1a3, 0.45, 0.5),
      boat: sm(0xd9d4c4, 0.6), paint: sm(0xe9e6dc, 0.7), yellow: sm(0xd6b33a, 0.7), red: sm(0xa8352e, 0.7)
    };
  }
  function add(g, gm, m, x, y, z, sx, sy, sz) { var o = new THREE.Mesh(gm, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = false; o.receiveShadow = false; g.add(o); return o; }

  function decorate(s) {
    var g = s.g, S = String(s.side), gray = mat.gray[S], d = { funnels: [], radar: null, smokeT: Math.random(), n: 0 };
    var L = s.kind === 'carrier' ? 22 : s.kind === 'battleship' ? 15 : 9;
    if (s.kind === 'carrier') {
      add(g, geo.box, mat.boot, 0, 0.28, 0, L * 1.005, 0.32, 3.46);                            // boot-top at the waterline
      var fn = add(g, geo.funnel, gray, 0.3, 5.15, -2.0, 1.1, 1.1, 0.8); d.funnels.push(fn);   // funnel on top of the island
      add(g, geo.cap, mat.cap, 0.35, 5.75, -2.0, 1.12, 0.14, 0.82);
      add(g, geo.mast, mat.steel, 1.9, 5.7, -2.0, 1, 2.2, 1);
      add(g, geo.box, mat.steel, 1.9, 6.3, -2.0, 0.06, 0.06, 1.3);                             // yardarm
      d.radar = add(g, geo.dish, mat.radar, 1.9, 6.95, -2.0, 1.1, 1, 1);
      // deck markings (deck top is y 2.025): dashed centre line, angled landing area, foul line, elevator outline
      var y = 2.035;
      for (var i = -5; i <= 5; i++) add(g, geo.box, mat.paint, i * 2.0, y, 0.15, 1.0, 0.012, 0.08);
      var ang = new THREE.Group(); ang.position.set(-3.2, y, 0.9); ang.rotation.y = 0.16; g.add(ang);   // angled deck, ~9° to port
      add(ang, geo.box, mat.paint, 0, 0, -1.05, 15, 0.012, 0.07); add(ang, geo.box, mat.paint, 0, 0, 1.05, 15, 0.012, 0.07);
      for (var j = -3; j <= 3; j++) add(ang, geo.box, mat.paint, j * 2.1, 0, 0, 0.9, 0.012, 0.06);
      add(g, geo.box, mat.red, 6.0, y, 0.3, 0.06, 0.012, 3.6);                                 // foul line across the bow
      add(g, geo.box, mat.yellow, 3.0, y, 2.05, 1.8, 0.012, 0.05); add(g, geo.box, mat.yellow, 3.0, y, 1.0, 1.8, 0.012, 0.05);
      add(g, geo.box, mat.yellow, 2.1, y, 1.52, 0.05, 0.012, 1.05); add(g, geo.box, mat.yellow, 3.9, y, 1.52, 0.05, 0.012, 1.05);   // deck-edge elevator
      stats.markings++;
    } else {
      var B = L * 0.16;
      add(g, geo.box, mat.boot, 0, 0.28, 0, L * 1.005, 0.32, B * 1.04);
      var nf = s.kind === 'battleship' ? 2 : 1;
      for (var k = 0; k < nf; k++) {
        var bs = s.kind === 'battleship', fx = -L * (bs ? 0.19 : 0.2) - k * L * 0.065, r = L * (bs ? 0.025 : 0.03), h = bs ? 1.9 : 1.5;   // stands on the 1.4 m deck
        d.funnels.push(add(g, geo.funnel, gray, fx, 1.4 + h / 2, 0, r * 2, h, r * 2));
        add(g, geo.cap, mat.cap, fx - h * 0.06, 1.4 + h + 0.02, 0, r * 2.04, 0.16, r * 2.04);
      }
      var mx = -L * 0.03, mt = 3.2;
      add(g, geo.mast, mat.steel, mx, mt + 0.9, 0, 1, 1.8, 1);
      add(g, geo.box, mat.steel, mx, mt + 1.25, 0, 0.05, 0.05, B * 0.8);
      d.radar = add(g, geo.dish, mat.radar, mx, mt + 1.9, 0, L * 0.07, 1, 1);
      for (var a = -1; a <= 1; a += 2) {                                                       // AA mounts + lifeboats on both beams
        add(g, geo.aa, mat.steel, -L * 0.12, 1.5, a * B * 0.38, 1, 1, 1);
        var bt = add(g, geo.boat, mat.boat, -L * 0.26, 1.75, a * B * 0.42, 1, L * 0.07, 1); bt.rotation.set(0, 0, Math.PI / 2); bt.rotation.x = Math.PI;
      }
    }
    stats.funnels += d.funnels.length; if (d.radar) stats.radars++;
    s._nd = d; stats.decorated++;
  }

  function tick(s, dt, F, R) {
    var d = s._nd; if (!d) return;
    var alive = s.st === 'sail' && !(s.burn > 0);
    if (d.radar && s.st === 'sail') d.radar.rotation.y += dt * (s.kind === 'carrier' ? 1.6 : 2.4);
    if (!alive || !R || !F || !F.puff || !s.g.visible) return;
    var a = s._sa, v = a ? a.v : s.speed, turn = a ? Math.min(1, Math.abs(a.om) * 6) : 0;
    d.smokeT -= dt * (0.6 + v * 0.25 + turn * 0.8);
    if (d.smokeT > 0) return;
    d.smokeT = 0.55 + Math.random() * 0.35;
    for (var i = 0; i < d.funnels.length; i++) {
      var fn = d.funnels[i]; _v.set(0, fn.scale.y * 0.55, 0); fn.localToWorld(_v);
      F.puff({ kind: 'smoke', x: _v.x, y: _v.y, z: _v.z, vy: 0.9 + v * 0.1, size: 0.55 + (s.kind === 'battleship' ? 0.2 : 0) + turn * 0.3, grow: 2.4, life: 3.2, color: 0x4a4744, opacity: 0.32 + turn * 0.12, drag: 0.97 });
      stats.exhaust++;
    }
  }

  function update() {
    if (!enabled) return;
    var e = LB.engine, th = LB.theaters; if (!e || !e.THREE || !th || !th.isEnabled || !th.isEnabled() || !th._ships) return;
    if (!THREE) init();
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused && e.isPaused()) return;
    var ships = th._ships(), F = LB.heavyFx, R = rich();
    for (var i = 0; i < ships.length; i++) { var s = ships[i]; if (!s || !s.g) continue; if (!s._nd) try { decorate(s); } catch (err) { s._nd = { funnels: [] }; console.warn('[navalDetail]', err); } tick(s, dt, F, R); }
  }

  LB.navalDetail = {
    version: 'v12.0.30', update: update,
    isEnabled: function () { return enabled; },
    getState: function () { return Object.assign({ enabled: enabled, rich: THREE ? rich() : null }, stats); }
  };
})(window);
