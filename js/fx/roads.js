/* LUNC Battlefield v12.0.60 — Base roads: asphalt, shoulders, lane markings and a boat ramp (realism checklist, Scale &
 * spacing: "base roads incomplete"). Visual only (game layer): never touches market data, armies, the front or labels.
 *  - A road network per side, draped on the real terrain height: the HQ supply road (z = -32), an airbase spur, a silo
 *    access spur (the v12.0.59 missile range) and a beach spur that ends in a concrete boat ramp at the waterline.
 *  - Layers: dirt shoulder, asphalt, dashed centre line (double line on the supply road), edge lines. Sign posts and
 *    reflector bollards at the junctions on MEDIUM+. Wet asphalt goes darker and glossier with the rain-mud wet level.
 *  - The tactical map draws the network as thin lines (LUNCBattle.roads.drawMap).
 * Kill switch: ?roads=0 (also off with ?realism=0). API: LUNCBattle.roads.getState().
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('roads') !== '0' && qs.get('realism') !== '0';
  var THREE = null, root = null, built = false, mats = {}, nets = [], posts = null, stats = { roads: 0, segments: 0, verts: 0, signs: 0, bollards: 0, ramps: 0, wet: 0 };
  var lastWet = -1, acc = 0;

  function E() { return LB.engine; }
  function H(x, z) { try { return (LB.groundY ? LB.groundY(x, z) : E().terrainHeight(x, z)) || 0; } catch (_) { return 0; } }   // v12.0.62: visible ground (js/fx/ground.js)
  function tier() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function lite() { return tier() === 'LOW' || !!(E() && E().mobile) || global.innerWidth < 760; }

  // polylines per side (side = -1 Bull west, +1 Bear east); x mirrored
  function defs(side) {
    var s = side;
    return [
      { id: 'supply', w: 3.4, sh: 1.3, dbl: true, edge: true, pts: [[s * 40, -32], [s * 90, -32], [s * 140, -32], [s * 190, -32], [s * 222, -32]] },
      { id: 'airbase', w: 2.8, sh: 1.1, edge: true, pts: [[s * 176, -32], [s * 188, -39], [s * 198, -47], [s * 204, -52]] },
      { id: 'silo', w: 2.4, sh: 1.0, pts: [[s * 116, -32], [s * 115.5, -46], [s * 115, -62], [s * 115.5, -76], [s * 120, -84], [s * 126, -85.5], [s * 146, -85.5], [s * 150, -88]] },   // v12.0.62: leaves the supply road west of the fuel depot and runs round the SAM pads (it used to cut straight through one) into the silo range
      { id: 'beach', w: 2.8, sh: 1.1, edge: true, ramp: true, pts: [[s * 72, -32], [s * 72, -8], [s * 76, 20], [s * 82, 46], [s * 85, 58]] }
    ];
  }
  function HS(x, z) {   // v12.0.62: at a step in the visible ground (core mesh edge, skirt to beach) take the higher side so the road never dips under it
    var c = H(x, z), m = c, r = 1.6, v;
    v = H(x + r, z); if (v > m) m = v; v = H(x - r, z); if (v > m) m = v; v = H(x, z + r); if (v > m) m = v; v = H(x, z - r); if (v > m) m = v;
    return m - c > 0.15 ? m : c;
  }
  function sample(pts, step) {
    var out = [], acc = 0, i, d, n, t;
    out.push([pts[0][0], pts[0][1]]);
    for (i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i]; d = Math.hypot(b[0] - a[0], b[1] - a[1]); n = Math.max(1, Math.round(d / step));
      for (t = 1; t <= n; t++) out.push([a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n]);
    }
    // light smoothing of the corners (Chaikin once)
    var sm = [out[0]]; for (i = 1; i < out.length - 1; i++) { var p = out[i - 1], c = out[i], q = out[i + 1]; sm.push([(p[0] + 2 * c[0] + q[0]) / 4, (p[1] + 2 * c[1] + q[1]) / 4]); } sm.push(out[out.length - 1]);
    return sm;
  }
  function ribbon(pl, halfW, lift, off) {   // off = lateral offset of the ribbon centre
    var pos = [], idx = [], nor = [], uv = [], len = 0, i;
    for (i = 0; i < pl.length; i++) {
      var p = pl[i], q = pl[Math.min(pl.length - 1, i + 1)], o = pl[Math.max(0, i - 1)];
      var dx = q[0] - o[0], dz = q[1] - o[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      if (i) len += Math.hypot(p[0] - pl[i - 1][0], p[1] - pl[i - 1][1]);
      for (var k = -1; k <= 1; k += 2) { var x = p[0] + nx * (halfW * k + (off || 0)), z = p[1] + nz * (halfW * k + (off || 0)); pos.push(x, HS(x, z) + lift, z); nor.push(0, 1, 0); uv.push(k < 0 ? 0 : 1, len); }
    }
    for (i = 0; i < pl.length - 1; i++) { var a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    stats.verts += pos.length / 3; stats.segments += pl.length - 1; return g;
  }
  function dashes(pl, halfW, lift, dash, gap, off) {   // merged quads
    var pos = [], idx = [], run = 0, on = true, rem = dash, i, vi = 0;
    for (i = 1; i < pl.length; i++) {
      var a = pl[i - 1], b = pl[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L, nx = -dz, nz = dx, t = 0;
      while (t < L) {
        var step = Math.min(rem, L - t);
        if (on) {
          var x0 = a[0] + dx * t, z0 = a[1] + dz * t, x1 = x0 + dx * step, z1 = z0 + dz * step, ox = nx * (off || 0), oz = nz * (off || 0);
          var q = [[x0 + ox - nx * halfW, z0 + oz - nz * halfW], [x0 + ox + nx * halfW, z0 + oz + nz * halfW], [x1 + ox - nx * halfW, z1 + oz - nz * halfW], [x1 + ox + nx * halfW, z1 + oz + nz * halfW]];
          for (var k = 0; k < 4; k++) pos.push(q[k][0], HS(q[k][0], q[k][1]) + lift, q[k][1]);
          idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2); vi += 4;
        }
        t += step; rem -= step; if (rem <= 1e-6) { on = !on; rem = on ? dash : gap; }
      }
    }
    if (!pos.length) return null;
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); stats.verts += pos.length / 3; return g;
  }
  function add(g, mat, order, name) {
    if (!g) return null; var m = new THREE.Mesh(g, mat); m.renderOrder = order || 0; m.name = name || 'road'; m.frustumCulled = false; m.receiveShadow = true; root.add(m); return m;
  }
  function mk(color, rough, off) {
    var m = new THREE.MeshStandardMaterial({ color: color, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -off, polygonOffsetUnits: -off });
    return m;
  }
  function build() {
    var e = E(); THREE = e.THREE; root = new THREE.Group(); root.name = 'v12-roads'; e.scene.add(root);
    try { e.scene.traverse(function (o) { if (o.name === 'supply-slab') { o.visible = false; stats.slabsHidden = (stats.slabsHidden || 0) + 1; } }); } catch (_) {}   // v12.0.62: the old flat supply slab is replaced
    var l = lite(), step = l ? 8 : 4;
    mats.shoulder = mk(0x6a5e48, 1, 1); mats.asphalt = mk(0x3a3c3f, 0.95, 2); mats.line = mk(0xe8e4d2, 0.8, 3); mats.yellow = mk(0xe0b53a, 0.8, 3); mats.ramp = mk(0x8e8b83, 0.9, 3);
    mats.asphalt.userData.base = 0x3a3c3f;
    [-1, 1].forEach(function (side) {
      defs(side).forEach(function (R) {
        var pl = sample(R.pts, step);
        add(ribbon(pl, R.w / 2 + R.sh, 0.045, 0), mats.shoulder, 1, 'road-shoulder');
        add(ribbon(pl, R.w / 2, 0.06, 0), mats.asphalt, 2, 'road-asphalt');
        if (R.dbl) { add(dashes(pl, 0.07, 0.075, 6, 0, 0.14), mats.yellow, 3, 'road-centre'); add(dashes(pl, 0.07, 0.075, 6, 0, -0.14), mats.yellow, 3, 'road-centre'); }
        else add(dashes(pl, 0.08, 0.075, 1.6, 2.2, 0), mats.line, 3, 'road-centre');
        if (R.edge) { add(dashes(pl, 0.06, 0.075, 8, 0, R.w / 2 - 0.2), mats.line, 3, 'road-edge'); add(dashes(pl, 0.06, 0.075, 8, 0, -(R.w / 2 - 0.2)), mats.line, 3, 'road-edge'); }
        var end = R.pts[R.pts.length - 1], first = R.pts[0];
        if (R.ramp) buildRamp(end[0], end[1], pl);
        nets.push({ side: side, id: R.id, pts: R.pts.slice(), w: R.w }); stats.roads++;
      });
    });
    if (!l) buildPosts();
    built = true;
  }
  function buildRamp(x, z, pl) {   // concrete ramp running down into the water at the end of the beach spur
    var a = pl[pl.length - 2], b = pl[pl.length - 1], ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
    var g = new THREE.BoxGeometry(4.6, 0.3, 9), m = new THREE.Mesh(g, mats.ramp); var ry = HS(x, z) + 0.08 - 0.15 - 4.5 * Math.sin(0.008);   // v12.0.62: land end flush with the asphalt, then a gentle fall into the surf
    m.position.set(x + Math.sin(ang) * 4, ry, z + Math.cos(ang) * 4); m.rotation.order = 'YXZ'; m.rotation.y = ang; m.rotation.x = 0.008; m.name = 'boat-ramp'; root.add(m);
    var lg = new THREE.BoxGeometry(5, 0.2, 0.3), m2 = new THREE.Mesh(lg, mats.yellow); m2.position.set(x, HS(x, z) + 0.1, z); m2.rotation.y = ang; root.add(m2); stats.ramps++;
  }
  function buildPosts() {   // reflector bollards along the supply road + sign posts at the junctions (instanced)
    var bol = [], sig = [];
    [-1, 1].forEach(function (s) {
      for (var x = 56; x <= 210; x += 14) bol.push([s * x, -32 + 2.6], [s * x, -32 - 2.6]);
      [[s * 72, -28.5], [s * 116, -28.5], [s * 176, -28.5], [s * 72, -35.5]].forEach(function (p) { sig.push(p); });
    });
    var bg = new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6), bm = new THREE.MeshStandardMaterial({ color: 0xe8e4d2, roughness: 0.6, emissive: 0x222018 });
    posts = new THREE.InstancedMesh(bg, bm, bol.length); var d = new THREE.Object3D();
    bol.forEach(function (p, i) { d.position.set(p[0], H(p[0], p[1]) + 0.4, p[1]); d.rotation.set(0, 0, 0); d.updateMatrix(); posts.setMatrixAt(i, d.matrix); }); posts.frustumCulled = false; root.add(posts); stats.bollards = bol.length;
    var sp = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), sm = new THREE.MeshStandardMaterial({ color: 0x55595b, roughness: 0.6 }), pg = new THREE.BoxGeometry(0.9, 0.6, 0.05), pm = new THREE.MeshStandardMaterial({ color: 0x1f6b3c, roughness: 0.5, emissive: 0x06150c });
    sig.forEach(function (p) { var y = H(p[0], p[1]); var a = new THREE.Mesh(sp, sm); a.position.set(p[0], y + 1.1, p[1]); root.add(a); var b = new THREE.Mesh(pg, pm); b.position.set(p[0], y + 2.0, p[1]); b.rotation.y = p[1] > -32 ? Math.PI : 0; root.add(b); }); stats.signs = sig.length;
  }
  function tick(dt) {
    if (!enabled) return;
    if (!built) { var th = LB.theaters; if (!th || !th.isEnabled || !th.isEnabled() || !E() || !E().terrainHeight) return; try { build(); } catch (err) { console.warn('[roads]', err); built = true; enabled = false; return; } }
    acc += dt; if (acc < 0.5) return; acc = 0;
    var wet = 0; try { wet = LB.rainMud && LB.rainMud.isEnabled() ? LB.rainMud.levels().wet : 0; } catch (_) {}
    if (Math.abs(wet - lastWet) > 0.02) { lastWet = wet; mats.asphalt.roughness = 0.95 - 0.55 * wet; mats.asphalt.color.setHex(mats.asphalt.userData.base).multiplyScalar(1 - 0.35 * wet); mats.shoulder.roughness = 1 - 0.3 * wet; mats.shoulder.color.setHex(0x6a5e48).multiplyScalar(1 - 0.3 * wet); stats.wet = +wet.toFixed(2); }
  }
  function drawMap(c, X, Z, big, own) {
    if (!enabled || !built) return 0;
    c.save(); c.lineCap = 'round';
    nets.forEach(function (R) {
      c.strokeStyle = R.id === 'supply' ? 'rgba(214,196,150,.55)' : 'rgba(214,196,150,.38)'; c.lineWidth = (R.id === 'supply' ? 1.6 : 1) * (big ? 1.5 : 1);
      c.beginPath(); R.pts.forEach(function (p, i) { if (i) c.lineTo(X(p[0]), Z(p[1])); else c.moveTo(X(p[0]), Z(p[1])); }); c.stroke();
    });
    c.restore(); return nets.length;
  }
  LB.roads = {
    version: 'v12.0.60', isEnabled: function () { return enabled; }, tick: tick, drawMap: drawMap,
    getState: function () { return Object.assign({ enabled: enabled, built: built, meshes: root && root.children ? root.children.length : 0 }, stats); },
    _nets: function () { return nets; }, _root: function () { return root; }
  };
})(window);
