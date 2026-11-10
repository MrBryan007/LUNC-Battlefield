/* LUNC Battlefield v12.0.61 — Gate checkpoints and HESCO revetments (realism checklist, Scale & spacing: "revetments
 * incomplete"). Visual only (game layer): never touches market data, armies, the front or data-truth labels.
 *  - Six checkpoints (HQ gate on the supply road, airbase spur gate, silo spur gate; both sides) built on the v12.0.60
 *    roads: staggered HESCO (sand-filled wire-cage) chicane blocks, flanking HESCO walls, Jersey barriers, a guard booth
 *    with a window and a flag, a floodlight mast and, on the two spurs, a striped boom barrier that lifts and drops.
 *    (The HQ supply road carries the convoy trucks, so it gets no boom and no blocks in the lane.)
 *  - Instanced blocks sitting on the real terrain height; LOW / phones get shorter walls and no floodlight.
 *  - Tactical map: small gate symbols. Kill switch: ?revet=0 (also off with ?realism=0). API: LUNCBattle.revetments.getState().
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('revet') !== '0' && qs.get('realism') !== '0';
  var THREE = null, root = null, built = false, cps = [], mats = null, stats = { checkpoints: 0, hesco: 0, jersey: 0, booths: 0, booms: 0, lights: 0, boomUp: 0 };
  var clock = 0;
  function E() { return LB.engine; }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function lite() { return tier() === 'LOW' || !!(E() && E().mobile) || global.innerWidth < 760; }

  function defs(s) {   // x, z, road direction (dx, dz), half road width, kind
    return [
      { id: 'hq', x: s * 60, z: -32, dx: s, dz: 0, hw: 1.7, boom: false, chicane: false },
      { id: 'airbase', x: s * 194.5, z: -44.7, dx: s * 0.82, dz: -0.57, hw: 1.4, boom: true, chicane: true },
      { id: 'silo', x: s * 149.3, z: -78, dx: 0.04 * s, dz: -1, hw: 1.2, boom: true, chicane: true }
    ];
  }
  function canvasTex(draw, w, h) { var c = doc.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
  function mk() {
    var hesco = canvasTex(function (g, w, h) { g.fillStyle = '#b9a67c'; g.fillRect(0, 0, w, h); for (var i = 0; i < 400; i++) { g.fillStyle = 'rgba(' + (120 + Math.random() * 60 | 0) + ',' + (100 + Math.random() * 50 | 0) + ',70,0.25)'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); } g.strokeStyle = 'rgba(55,55,50,0.85)'; g.lineWidth = 2; for (var k = 0; k <= 8; k++) { g.beginPath(); g.moveTo(k * w / 8, 0); g.lineTo(k * w / 8, h); g.stroke(); g.beginPath(); g.moveTo(0, k * h / 8); g.lineTo(w, k * h / 8); g.stroke(); } }, 128, 128);
    var stripe = canvasTex(function (g, w, h) { for (var i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2f2f2' : '#c4281f'; g.fillRect(i * w / 8, 0, w / 8, h); } }, 128, 16);
    return {
      hesco: new THREE.MeshStandardMaterial({ map: hesco, roughness: 1 }), jersey: new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.95 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.9 }), roof: new THREE.MeshStandardMaterial({ color: 0x3a3d3f, roughness: 0.7 }), glass: new THREE.MeshStandardMaterial({ color: 0x14242c, roughness: 0.2, metalness: 0.6 }),
      boom: new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 }), post: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.7 }), dark: new THREE.MeshStandardMaterial({ color: 0x2b2e30, roughness: 0.6, metalness: 0.4 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xfff0c0 }), flag: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8, side: THREE.DoubleSide })
    };
  }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function buildCp(side, D, l) {
    var g = new THREE.Group(); g.position.set(D.x, H(D.x, D.z), D.z); g.rotation.y = -Math.atan2(D.dz, D.dx); root.add(g);
    var hw = D.hw, off = hw + 1.6, sideCol = side < 0 ? 0x4b6b3c : 0x7a4a3a;
    // HESCO walls flanking the road (local X = along road, Z = lateral)
    var pos = [], span = l ? 3 : 5;
    for (var side2 = -1; side2 <= 1; side2 += 2) for (var i = 0; i < span; i++) for (var u = 0; u < 2; u++) { var ux = (u ? 1 : -1) * (5 + i * 1.25); pos.push([ux, 0.6, side2 * off, 0]); if (!l && i % 2 === 0) pos.push([ux, 1.8, side2 * off, 0]); }
    if (D.chicane) { pos.push([-3.2, 0.6, -hw * 0.45, 0], [-3.2, 0.6, -hw * 0.45 - 1.2, 0], [0.4, 0.6, hw * 0.45, 0], [0.4, 0.6, hw * 0.45 + 1.2, 0]); }
    var im = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mats.hesco, pos.length), d = new THREE.Object3D();
    pos.forEach(function (p, i) { d.position.set(p[0], p[1], p[2]); d.rotation.set(0, 0, 0); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); g.add(im); stats.hesco += pos.length;
    // Jersey barriers at the road edge approaching the gate
    var jp = [[-8.5, -hw - 0.5], [-8.5, hw + 0.5], [8.5, -hw - 0.5], [8.5, hw + 0.5]], jm = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.85, 0.55), mats.jersey, jp.length);
    jp.forEach(function (p, i) { d.position.set(p[0], 0.42, p[1]); d.updateMatrix(); jm.setMatrixAt(i, d.matrix); }); g.add(jm); stats.jersey += jp.length;
    // guard booth on the shoulder, on the +Z side, with a window facing the road and a flag
    var bz = off + 2.6, b = new THREE.Group(); b.position.set(0, 0, bz); g.add(b);
    box(b, 2.2, 2.3, 2.2, mats.wall, 0, 1.15, 0); box(b, 2.6, 0.18, 2.6, mats.roof, 0, 2.4, 0); box(b, 1.4, 0.7, 0.06, mats.glass, 0, 1.45, -1.12); box(b, 0.7, 1.5, 0.06, mats.dark, 0.5, 0.75, 1.12);
    var fp = box(b, 0.05, 3.2, 0.05, mats.post, 1.0, 3.9, 1.0); var fl = box(b, 0.9, 0.55, 0.03, new THREE.MeshStandardMaterial({ color: sideCol, roughness: 0.8, side: THREE.DoubleSide }), 1.45, 5.1, 1.0);
    stats.booths++;
    // floodlight mast
    if (!l) { var mast = new THREE.Group(); mast.position.set(-1.8, 0, off + 1.2); g.add(mast); box(mast, 0.12, 5.2, 0.12, mats.dark, 0, 2.6, 0); box(mast, 0.9, 0.25, 0.4, mats.dark, 0, 5.3, 0.1); box(mast, 0.8, 0.12, 0.3, mats.lamp, 0, 5.15, 0.2); stats.lights++; }
    var cp = { side: side, id: D.id, x: D.x, z: D.z, g: g, bar: null, ph: Math.random() * 14, up: 0 };
    if (D.boom) {   // striped boom barrier: post on the -Z shoulder, bar spans the road along Z, lifts about the X axis
      var pivot = new THREE.Group(); pivot.position.set(2.2, 1.0, -hw - 0.6); g.add(pivot); box(g, 0.4, 1.1, 0.4, mats.post, 2.2, 0.55, -hw - 0.6); box(g, 0.4, 0.5, 0.4, mats.dark, 2.2, 0.25, hw + 0.7);
      var L = hw * 2 + 1.2, bar = box(pivot, 0.1, 0.12, L, mats.boom, 0, 0, L / 2); bar.material.map.repeat.set(1, 1); cp.bar = pivot; cp.L = L; stats.booms++;
    }
    cps.push(cp); stats.checkpoints++;
  }
  function build() {
    var e = E(); THREE = e.THREE; root = new THREE.Group(); root.name = 'v12-revetments'; e.scene.add(root); mats = mk(); var l = lite();
    [-1, 1].forEach(function (s) { defs(s).forEach(function (D) { buildCp(s, D, l); }); });
    built = true;
  }
  function tick(dt) {
    if (!enabled) return;
    if (!built) { var th = LB.theaters; if (!th || !th.isEnabled || !th.isEnabled() || !E() || !E().terrainHeight || !LB.roads || !LB.roads.getState().built) return; try { build(); } catch (err) { console.warn('[revetments]', err); built = true; enabled = false; return; } }
    clock += dt; var up = 0;
    for (var i = 0; i < cps.length; i++) {
      var c = cps[i]; if (!c.bar) continue;
      var t = (clock + c.ph) % 14, k = t < 6 ? 0 : t < 7 ? t - 6 : t < 11 ? 1 : 1 - (t - 11) / 3;   // closed 6 s, lift 1 s, open 4 s, drop 3 s
      k = k < 0 ? 0 : k > 1 ? 1 : k; var target = -k * 1.25; c.bar.rotation.x += (target - c.bar.rotation.x) * Math.min(1, dt * 6); c.up = k; if (k > 0.5) up++;
    }
    stats.boomUp = up;
  }
  function drawMap(c, X, Z, big, own) {
    if (!enabled || !built) return 0; var s = big ? 3.2 : 2.2;
    c.save(); c.lineWidth = 1;
    cps.forEach(function (p) { var x = X(p.x), z = Z(p.z); c.strokeStyle = p.side < 0 ? '#58d08f' : '#ff7b72'; c.beginPath(); c.moveTo(x - s, z - s); c.lineTo(x - s, z + s); c.moveTo(x + s, z - s); c.lineTo(x + s, z + s); c.moveTo(x - s, z); c.lineTo(x + s, z); c.stroke(); });
    c.restore(); return cps.length;
  }
  LB.revetments = {
    version: 'v12.0.61', isEnabled: function () { return enabled; }, tick: tick, drawMap: drawMap,
    getState: function () { return Object.assign({ enabled: enabled, built: built, boomAngles: cps.filter(function (c) { return c.bar; }).map(function (c) { return +c.bar.rotation.x.toFixed(2); }) }, stats); },
    _cps: function () { return cps; }, _root: function () { return root; }, _clock: function (v) { if (v != null) clock = v; return clock; }
  };
})(window);
