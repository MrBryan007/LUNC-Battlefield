/* LUNC Battlefield v12.0.62 — Ground truth: one shared "visible ground" height for everything placed in the wide world.
 * engine.terrainHeight() is the height field of the core battlefield mesh (138 x 82 m). Outside that rectangle the
 * visible ground is the flat skirt (y -0.55), the beach strip (y -0.3) or the Hill 402 ridge, but terrainHeight keeps
 * climbing (its "edge hills" term grows with |z|), so anything that used it out there floated: the silo spur road rose
 * up to 12 m into the air, the apron flood-light pools hung 9-13 m over the airbases, the gate checkpoints and the boat
 * ramp sat 1-4 m up. LB.groundY(x, z) returns the height of the surface you can actually see:
 *   - inside the core mesh: terrainHeight (unchanged),
 *   - on an airbase runway / apron: the tarmac top (y -0.02); on an HQ compound pad: terrainHeight (the pad follows it),
 *   - on the beach strip: the sand plane, elsewhere: the skirt,
 *   - the Hill 402 ridge (js/theaters/ridge.js) when it is on and higher.
 * Kill switch: ?ground=0 makes LB.groundY fall back to terrainHeight (the old behaviour). Visual / placement only:
 * never touches market data, armies, the front or data-truth labels.
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('ground') !== '0';
  var BASE_X = 205, BASE_Z = -55, PADS = null;
  var CORE = { hx: 69, hz: 41, cx: 0, cz: 0, probed: false }, SKIRT = -0.55, BEACH = { y: -0.3, z0: 50, z1: 64 }, stats = { calls: 0, core: 0, skirt: 0, beach: 0, ridge: 0, pad: 0 };
  function E() { return LB.engine; }
  function probeCore() {   // read the real size / position of the core terrain mesh once it exists
    var e = E(); if (!e || !e.scene) return; CORE.probed = true;
    try {
      var t = e.scene.getObjectByName('terrain-v81'), m = null;
      if (t) t.traverse(function (o) { if (!m && o.isMesh && o.geometry && o.geometry.parameters && o.geometry.parameters.width > 100) m = o; });
      if (m) { var p = m.geometry.parameters, w = new e.THREE.Vector3(); m.getWorldPosition(w); CORE.hx = p.width / 2; CORE.hz = p.height / 2; CORE.cx = w.x; CORE.cz = w.z; }
      var sk = e.scene.getObjectByName('ground-skirt'); if (sk) { var v = new e.THREE.Vector3(); sk.getWorldPosition(v); SKIRT = v.y; }
    } catch (_) {}
  }
  function hqX() { try { var c = LB.config; return (c && c.layout && c.layout.hqX) || 96; } catch (_) { return 96; } }
  function pads() {   // flat built surfaces outside the core mesh (js/theaters/theaters.js buildBase, js/structures.js addPad)
    if (PADS) return PADS; PADS = [];
    [-1, 1].forEach(function (s) {
      var bx = s * BASE_X;
      PADS.push({ k: 'tarmac', x0: bx - 35, x1: bx + 35, z0: BASE_Z - 3.5, z1: BASE_Z + 3.5, y: -0.02 });   // runway 70 x 7
      var ax = bx - s * 18; PADS.push({ k: 'tarmac', x0: ax - 17, x1: ax + 17, z0: BASE_Z - 23, z1: BASE_Z - 5, y: -0.02 });   // apron 34 x 18
      var hx = s * hqX(); PADS.push({ k: 'hq', x0: hx - 8.2, x1: hx + 8.2, z0: -11.2, z1: 11.2, y: null });   // compound pad 16 x 22
    });
    return PADS;
  }
  function padTop(q) {   // same rule as js/structures.js addPad: top = max height over the pad + 5 % of its thickness
    var mn = 1e9, mx = -1e9, cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2, hw = (q.x1 - q.x0) / 2 * 0.96, hd = (q.z1 - q.z0) / 2 * 0.96;
    for (var a = -1; a <= 1.001; a += 0.25) for (var b = -1; b <= 1.001; b += 0.25) { var v = th(cx + a * hw, cz + b * hd); if (v < mn) mn = v; if (v > mx) mx = v; }
    var thick = Math.max(0.2, (mx - mn) + 0.2); q.y = mx + thick * 0.05; return q.y;
  }
  function th(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function inCore(x, z) { return Math.abs(x - CORE.cx) <= CORE.hx && Math.abs(z - CORE.cz) <= CORE.hz; }
  function groundY(x, z) {
    if (!enabled) return th(x, z);
    if (!CORE.probed && E() && E().scene) probeCore();
    stats.calls++;
    var h, k;
    var P = pads(), pad = null;
    for (var i = 0; i < P.length; i++) { var q = P[i]; if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) { pad = q; break; } }
    if (inCore(x, z)) { h = th(x, z); k = 'core'; }
    else if (pad) { if (pad.y == null) padTop(pad); h = pad.y; k = 'pad'; }
    else if (z >= BEACH.z0 && z <= BEACH.z1) { h = BEACH.y; k = 'beach'; }
    else { h = SKIRT; k = 'skirt'; }
    var R = LB.ridge; if (R && R.isEnabled && R.isEnabled() && R.groundY) { try { var r = R.groundY(x, z); if (r > h + 0.001) { h = r; k = 'ridge'; } } catch (_) {} }
    stats[k]++;
    return h;
  }
  LB.groundY = groundY;
  LB.ground = {
    version: 'v12.0.62', isEnabled: function () { return enabled; }, y: groundY, inCore: inCore,
    pads: pads, getState: function () { if (!CORE.probed && E() && E().scene) probeCore(); return Object.assign({ enabled: enabled, core: Object.assign({}, CORE), skirt: SKIRT, beach: Object.assign({}, BEACH) }, { stats: Object.assign({}, stats) }); }
  };
})(window);
