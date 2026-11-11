/* LUNC Battlefield v12.0.61 — Gate checkpoints and HESCO revetments (realism checklist, Scale & spacing: "revetments
 * incomplete"). Visual only (game layer): never touches market data, armies, the front or data-truth labels.
 *  - Six checkpoints (HQ gate on the supply road, airbase spur gate, silo spur gate; both sides) built on the v12.0.60
 *    roads: staggered HESCO (sand-filled wire-cage) chicane blocks, flanking HESCO walls, Jersey barriers, a guard booth
 *    with a window and a flag, a floodlight mast and, on the two spurs, a striped boom barrier that lifts and drops.
 *    (The HQ supply road carries the convoy trucks, so it gets no boom and no blocks in the lane.)
 *  - Instanced blocks sitting on the real terrain height; LOW / phones get shorter walls and no floodlight.
 *  - Polish (shipped 2026-11-11): each checkpoint snaps to the nearest point of its v12.0.60 road and turns to the road's
 *    real heading; every HESCO / Jersey block sits on the terrain under its own footprint (no floating on slopes); HESCO
 *    units use the real MIL-1 size (1.06 x 1.37 m) with bulging geotextile, per-unit tone and a few degrees of skew; Jersey
 *    barriers use the F-shape profile; floodlights, light pools and booth windows come on at night (v12.0.51 sky-light).
 *  - Tactical map: small gate symbols. Kill switch: ?revet=0 (also off with ?realism=0). API: LUNCBattle.revetments.getState().
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('revet') !== '0' && qs.get('realism') !== '0';
  var THREE = null, root = null, built = false, cps = [], mats = null, pools = [], lastNight = -1, stats = { checkpoints: 0, hesco: 0, jersey: 0, booths: 0, booms: 0, lights: 0, boomUp: 0, snapped: 0, night: 0 };
  var clock = 0, col2 = null;
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
    var hesco = canvasTex(function (g, w, h) { g.fillStyle = '#a8946a'; g.fillRect(0, 0, w, h); for (var i = 0; i < 700; i++) { g.fillStyle = 'rgba(' + (120 + Math.random() * 60 | 0) + ',' + (100 + Math.random() * 50 | 0) + ',70,0.25)'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); } var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,245,220,0.10)'); gr.addColorStop(0.8, 'rgba(70,55,35,0)'); gr.addColorStop(1, 'rgba(70,55,35,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(70,72,66,0.7)'; g.lineWidth = 1; for (var k = 0; k <= 14; k++) { g.beginPath(); g.moveTo(k * w / 14, 0); g.lineTo(k * w / 14, h); g.stroke(); g.beginPath(); g.moveTo(0, k * h / 14); g.lineTo(w, k * h / 14); g.stroke(); } g.lineWidth = 2.5; g.strokeStyle = 'rgba(60,62,58,0.85)'; g.strokeRect(1, 1, w - 2, h - 2); }, 128, 128);
    var stripe = canvasTex(function (g, w, h) { for (var i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2f2f2' : '#c4281f'; g.fillRect(i * w / 8, 0, w / 8, h); } }, 128, 16);
    var poolTex = canvasTex(function (g, w, h) { var r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, 64, 64);
    var stopTex = canvasTex(function (g, w, h) { g.fillStyle = '#c4281f'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', w / 2, h / 2 + 1); }, 64, 64);
    return {
      hesco: new THREE.MeshStandardMaterial({ map: hesco, roughness: 1 }), jersey: new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.95 }),
      hescoGeo: hescoGeo(), jerseyGeo: jerseyGeo(), poolGeo: new THREE.CircleGeometry(6, 24),
      pool: new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffe2a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 }),
      stop: new THREE.MeshStandardMaterial({ map: stopTex, roughness: 0.6, side: THREE.DoubleSide }),
      wall: new THREE.MeshStandardMaterial({ color: 0x8a8a80, roughness: 0.9 }), roof: new THREE.MeshStandardMaterial({ color: 0x3a3d3f, roughness: 0.7 }), glass: new THREE.MeshStandardMaterial({ color: 0x14242c, roughness: 0.2, metalness: 0.6 }),
      boom: new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 }), post: new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.7 }), dark: new THREE.MeshStandardMaterial({ color: 0x2b2e30, roughness: 0.6, metalness: 0.4 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0x6b675e }), flag: new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8, side: THREE.DoubleSide })
    };
  }

  function snap(side, D) {   // nearest point on the matching v12.0.60 road, with that segment's heading
    var nets; try { nets = LB.roads && LB.roads._nets ? LB.roads._nets() : null; } catch (_) { nets = null; }
    var id = D.id === 'hq' ? 'supply' : D.id, R = null;
    if (nets) for (var i = 0; i < nets.length; i++) if (nets[i].side === side && nets[i].id === id) { R = nets[i]; break; }
    if (!R || !R.pts || R.pts.length < 2) return D;
    var best = null;
    for (var j = 1; j < R.pts.length; j++) {
      var a = R.pts[j - 1], b = R.pts[j], vx = b[0] - a[0], vz = b[1] - a[1], L2 = vx * vx + vz * vz; if (!L2) continue;
      var t = ((D.x - a[0]) * vx + (D.z - a[1]) * vz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      var px = a[0] + vx * t, pz = a[1] + vz * t, d2 = (px - D.x) * (px - D.x) + (pz - D.z) * (pz - D.z);
      if (!best || d2 < best.d2) { var L = Math.sqrt(L2), sx = vx / L, sz = vz / L; if (sx * D.dx + sz * D.dz < 0) { sx = -sx; sz = -sz; } best = { d2: d2, x: px, z: pz, dx: sx, dz: sz }; }
    }
    if (!best || best.d2 > 36) return D;   // more than 6 m away: keep the authored spot
    stats.snapped++;
    return Object.assign({}, D, { x: best.x, z: best.z, dx: best.dx, dz: best.dz, hw: R.w ? Math.max(D.hw, R.w / 2) : D.hw });
  }
  function hescoGeo() {   // MIL-1 unit 1.06 x 1.37 x 1.06 m, sides bulge out a few cm where the sand pushes the geotextile
    var g = new THREE.BoxGeometry(1.06, 1.37, 1.06, 3, 3, 3), P = g.attributes.position, v = new THREE.Vector3();
    for (var i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); var fy = 1 - Math.pow(v.y / 0.685, 2);   // 0 at top / bottom rim, 1 mid-height
      var bx = Math.abs(v.x) > 0.52 ? 1 : 0, bz = Math.abs(v.z) > 0.52 ? 1 : 0, mx = 1 - Math.pow(v.z / 0.53, 2), mz = 1 - Math.pow(v.x / 0.53, 2);
      if (bx) v.x *= 1 + 0.06 * fy * Math.max(0, mx); if (bz) v.z *= 1 + 0.06 * fy * Math.max(0, mz);
      if (v.y > 0.68) v.y -= 0.05 * Math.max(0, mx) * Math.max(0, mz);   // sand settles: the top sags a little
      P.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  }
  function jerseyGeo() {   // F-shape concrete barrier: 0.6 m foot, 0.2 m top, 0.81 m tall, 3 m long (along local X)
    var sh = new THREE.Shape(); sh.moveTo(-0.3, 0); sh.lineTo(0.3, 0); sh.lineTo(0.3, 0.07); sh.lineTo(0.16, 0.3); sh.lineTo(0.1, 0.81); sh.lineTo(-0.1, 0.81); sh.lineTo(-0.16, 0.3); sh.lineTo(-0.3, 0.07); sh.lineTo(-0.3, 0);
    var g = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }); g.translate(0, 0, -1.5); g.rotateY(Math.PI / 2); g.computeVertexNormals(); return g;
  }
  var _v = null;
  function grounded(g, lx, ly, lz) {   // local block position → local y that puts the block's base on the terrain under it
    _v = _v || new THREE.Vector3(); _v.set(lx, 0, lz).applyMatrix4(g.matrixWorld);
    return H(_v.x, _v.z) - g.position.y + ly;
  }
  function box(p, w, h, d, m, x, y, z) { var o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; }
  function buildCp(side, D0, l) {
    var D = snap(side, D0);
    var g = new THREE.Group(); g.position.set(D.x, H(D.x, D.z), D.z); g.rotation.y = -Math.atan2(D.dz, D.dx); root.add(g); g.updateMatrixWorld(true);
    var hw = D.hw, off = hw + 1.7, sideCol = side < 0 ? 0x4b6b3c : 0x7a4a3a, HH = 1.37, d = new THREE.Object3D(), col = new THREE.Color();
    // HESCO walls flanking the road (local X = along road, Z = lateral); MIL-1 units 1.06 m wide, 1.37 m tall
    var pos = [], span = l ? 3 : 5;
    for (var side2 = -1; side2 <= 1; side2 += 2) for (var i = 0; i < span; i++) for (var u = 0; u < 2; u++) { var ux = (u ? 1 : -1) * (5 + i * 1.08); pos.push([ux, HH / 2, side2 * off, 0]); if (!l && i % 2 === 0) pos.push([ux, HH * 1.5, side2 * off, 1]); }
    if (D.chicane) { pos.push([-3.2, HH / 2, -hw * 0.45, 0], [-3.2, HH / 2, -hw * 0.45 - 1.08, 0], [0.4, HH / 2, hw * 0.45, 0], [0.4, HH / 2, hw * 0.45 + 1.08, 0]); }
    var im = new THREE.InstancedMesh(mats.hescoGeo, mats.hesco, pos.length), base = {};
    pos.forEach(function (p, i) {
      var key = p[0] + ',' + p[2], y;
      if (p[3] && base[key] != null) y = base[key] + HH;   // stacked unit rides on the one below
      else { y = grounded(g, p[0], p[1], p[2]) - 0.06; base[key] = y; }   // sink 6 cm so the sand meets the ground
      d.position.set(p[0], y, p[2]); d.rotation.set(0, (Math.random() - 0.5) * 0.07, (Math.random() - 0.5) * 0.02);
      var sc = 0.97 + Math.random() * 0.06; d.scale.set(sc, 0.96 + Math.random() * 0.05, sc); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      col.setHSL(0.11 + Math.random() * 0.02, 0.22 + Math.random() * 0.1, 0.5 + Math.random() * 0.12); im.setColorAt(i, col);
    });
    if (im.instanceColor) im.instanceColor.needsUpdate = true; g.add(im); stats.hesco += pos.length;
    // F-shape Jersey barriers at the road edge approaching the gate, each on its own patch of ground
    var jp = [[-8.5, -hw - 0.45], [-8.5, hw + 0.45], [8.5, -hw - 0.45], [8.5, hw + 0.45]], jm = new THREE.InstancedMesh(mats.jerseyGeo, mats.jersey, jp.length);
    d.scale.set(1, 1, 1);
    jp.forEach(function (p, i) { d.position.set(p[0], grounded(g, p[0], 0, p[1]) - 0.03, p[1]); d.rotation.set(0, (Math.random() - 0.5) * 0.05, 0); d.updateMatrix(); jm.setMatrixAt(i, d.matrix); }); g.add(jm); stats.jersey += jp.length;
    // guard booth on the shoulder, on the +Z side, with a window facing the road and a flag
    var bz = off + 2.6, b = new THREE.Group(); b.position.set(0, grounded(g, 0, 0, bz), bz); g.add(b);
    box(b, 2.2, 2.3, 2.2, mats.wall, 0, 1.15, 0); box(b, 2.6, 0.18, 2.6, mats.roof, 0, 2.4, 0); box(b, 1.4, 0.7, 0.06, mats.glass, 0, 1.45, -1.12); box(b, 0.7, 1.5, 0.06, mats.dark, 0.5, 0.75, 1.12);
    box(b, 2.4, 0.15, 2.4, mats.jersey, 0, -0.02, 0);   // concrete pad under the booth
    box(b, 0.05, 3.2, 0.05, mats.post, 1.0, 3.9, 1.0); box(b, 0.9, 0.55, 0.03, new THREE.MeshStandardMaterial({ color: sideCol, roughness: 0.8, side: THREE.DoubleSide }), 1.45, 5.1, 1.0);
    stats.booths++;
    // floodlight mast + (MEDIUM+) the pool of light it throws on the road at night
    if (!l) {
      var mz = off + 1.2, mast = new THREE.Group(); mast.position.set(-1.8, grounded(g, -1.8, 0, mz), mz); g.add(mast);
      box(mast, 0.12, 5.2, 0.12, mats.dark, 0, 2.6, 0); var head = box(mast, 0.9, 0.25, 0.4, mats.dark, 0, 5.3, -0.1); head.rotation.x = -0.35; box(mast, 0.8, 0.12, 0.3, mats.lamp, 0, 5.15, -0.2).rotation.x = -0.35; stats.lights++;
      var pool = new THREE.Mesh(mats.poolGeo, mats.pool.clone()); pool.rotation.x = -Math.PI / 2; pool.position.set(-1.8, grounded(g, -1.8, 0, 0) + 0.12, 0); pool.renderOrder = 3; pool.visible = false; g.add(pool); pools.push(pool);
    }
    var cp = { side: side, id: D.id, x: D.x, z: D.z, dx: D.dx, dz: D.dz, g: g, bar: null, ph: Math.random() * 14, up: 0 };
    if (D.boom) {   // striped boom barrier: post on the -Z shoulder, bar spans the road along Z, lifts about the X axis
      var py = grounded(g, 2.2, 0, -hw - 0.6), pivot = new THREE.Group(); pivot.position.set(2.2, py + 1.0, -hw - 0.6); g.add(pivot); box(g, 0.4, 1.1, 0.4, mats.post, 2.2, py + 0.55, -hw - 0.6); box(g, 0.4, 0.5, 0.4, mats.dark, 2.2, grounded(g, 2.2, 0, hw + 0.7) + 0.25, hw + 0.7);
      var L = hw * 2 + 1.2; box(pivot, 0.1, 0.12, L, mats.boom, 0, 0, L / 2); box(pivot, 0.03, 0.4, 0.4, mats.stop, 0, -0.26, L / 2); cp.bar = pivot; cp.L = L; stats.booms++;
    }
    cps.push(cp); stats.checkpoints++;
  }
  function build() {
    var e = E(); THREE = e.THREE; root = new THREE.Group(); root.name = 'v12-revetments'; e.scene.add(root); mats = mk(); col2 = new THREE.Color(); var l = lite();
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
    var n = 0; try { var sk = LB.skyLight && LB.skyLight.getState ? LB.skyLight.getState() : null; n = sk && sk.active ? +sk.lightsOn || 0 : 0; } catch (_) { n = 0; }
    if (Math.abs(n - lastNight) > 0.02) {   // floodlights, light pools and booth windows follow the v12.0.51 night lights
      lastNight = n; stats.night = +n.toFixed(2);
      mats.lamp.color.setHex(0x6b675e).lerp(col2.setHex(0xfff0c0), n); mats.glass.emissive.setHex(0xffc870); mats.glass.emissiveIntensity = 0.55 * n;
      for (var p = 0; p < pools.length; p++) { pools[p].visible = n > 0.05; pools[p].material.opacity = 0.32 * n; }
    }
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
    _cps: function () { return cps; }, _pools: function () { return pools; },
    _gaps: function () {   // worst distance between a ground-tier block's base and the terrain under its centre (m)
      var worst = 0, m = new THREE.Matrix4(), v = new THREE.Vector3();
      cps.forEach(function (c) { c.g.updateMatrixWorld(true); c.g.children.forEach(function (o) { if (!o.isInstancedMesh) return; var half = o.geometry === mats.hescoGeo ? 0.685 : 0;
        for (var i = 0; i < o.count; i++) { o.getMatrixAt(i, m); v.setFromMatrixPosition(m); v.applyMatrix4(c.g.matrixWorld); var base = v.y - half * 0.98, gnd = H(v.x, v.z), gp = base - gnd; if (gp < 1.0) worst = Math.max(worst, Math.abs(gp)); } }); });
      return +worst.toFixed(3);
    }, _night: function () { lastNight = -1; }, _root: function () { return root; }, _clock: function (v) { if (v != null) clock = v; return clock; }
  };
})(window);
