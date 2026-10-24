/* LUNC Battlefield v12.0.32 — HQ standards: a flagpole at each HQ flying a waving cloth banner. Game layer only.
 *
 * A 9 m pole with a gold finial at the rear of each HQ compound and a 3 × 1.9 m cloth banner. The cloth is a plane whose
 * vertices are moved every frame by a travelling wave (amplitude grows from the hoist to the fly, a little droop, more
 * vigorous in rain); LOW / phones use fewer segments and update every other frame. Banner art is drawn on a canvas in
 * the faction's colours. Your HQ flies the banner you picked in Cmd → Service record → UNLOCKS (rank-unlocked, see
 * js/ui/achievements.js); the enemy HQ flies its faction Standard. Follows the commanded side (hot-seat aware).
 * Never touches market data, armies, the front or data-truth labels. Kill switch: ?banners=0. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('banners') !== '0';
  var W = 3.0, HGT = 1.9, POLE = 9;
  var THREE = null, root = null, flags = {}, last = 0, frame = 0, chkT = 0, t0 = performance.now();
  var stats = { built: 0, redraws: 0, frames: 0, culled: 0 };
  var PAL = { '-1': { field: '#2b5e3e', dark: '#1b3a27', light: '#e8e2cf', mark: '#7cf0a8' }, '1': { field: '#7e2b26', dark: '#4d1a17', light: '#e8e2cf', mark: '#ff8a80' } };
  var GOLD = '#d7b56d';

  function E() { return LB.engine; }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function hqX() { try { var c = LB.config; return (c && c.layout && c.layout.hqX) || 96; } catch (_) { return 96; } }
  function mySide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function rain() { try { return (LB.v12extras.getOptions().weather || '') === 'rain'; } catch (_) { return false; } }
  function myBanner() { try { var b = LB.achievements && LB.achievements.banner && LB.achievements.banner(); return b ? b.id : 'std'; } catch (_) { return 'std'; } }

  // ---------------------------------------------------------------- banner art (256 × 160 canvas, hoist on the left)
  function star(g, cx, cy, r, fill) {
    g.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fillStyle = fill; g.fill();
  }
  function draw(c, side, id) {
    var g = c.getContext('2d'), P = PAL[String(side)], w = c.width, h = c.height;
    g.clearRect(0, 0, w, h); g.fillStyle = P.field; g.fillRect(0, 0, w, h);
    if (id === 'chevron') {
      g.fillStyle = P.light; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.5, h / 2); g.lineTo(0, h); g.closePath(); g.fill();
      g.fillStyle = P.dark; g.beginPath(); g.moveTo(0, h * 0.18); g.lineTo(w * 0.36, h / 2); g.lineTo(0, h * 0.82); g.closePath(); g.fill();
      g.fillStyle = P.light; g.fillRect(w * 0.5, h * 0.44, w * 0.5, h * 0.12);
    } else if (id === 'horns') {
      g.fillStyle = P.dark; g.fillRect(0, 0, w, h);
      g.strokeStyle = GOLD; g.fillStyle = GOLD; g.lineWidth = 10; g.lineCap = 'round';
      if (side < 0) {   // bull: head with two horns
        g.beginPath(); g.arc(w / 2, h * 0.62, h * 0.2, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(w / 2 - h * 0.16, h * 0.5); g.quadraticCurveTo(w / 2 - h * 0.55, h * 0.45, w / 2 - h * 0.42, h * 0.14); g.stroke();
        g.beginPath(); g.moveTo(w / 2 + h * 0.16, h * 0.5); g.quadraticCurveTo(w / 2 + h * 0.55, h * 0.45, w / 2 + h * 0.42, h * 0.14); g.stroke();
      } else {          // bear: head with round ears and a paw-print muzzle
        g.beginPath(); g.arc(w / 2, h * 0.56, h * 0.26, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(w / 2 - h * 0.22, h * 0.3, h * 0.1, 0, Math.PI * 2); g.arc(w / 2 + h * 0.22, h * 0.3, h * 0.1, 0, Math.PI * 2); g.fill();
        g.fillStyle = P.dark; g.beginPath(); g.arc(w / 2, h * 0.64, h * 0.07, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = P.field; g.fillRect(0, 0, w, h * 0.08); g.fillRect(0, h * 0.92, w, h * 0.08);
    } else if (id === 'star') {
      g.fillStyle = P.dark; g.fillRect(0, 0, w * 0.42, h * 0.56);
      star(g, w * 0.21, h * 0.28, h * 0.2, P.light);
      for (var i = 0; i < 3; i++) { g.fillStyle = i % 2 ? P.field : P.light; g.fillRect(w * 0.42, h * 0.56 * i / 3 + (i ? 0 : 0), w * 0.58, h * 0.56 / 3); }
      g.fillStyle = P.light; g.fillRect(0, h * 0.7, w, h * 0.1);
    } else if (id === 'laurel') {
      g.fillStyle = P.dark; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7a9a4a';
      for (var k = 0; k < 9; k++) {
        [-1, 1].forEach(function (sg) {
          var a = Math.PI / 2 + sg * (0.35 + k * 0.27), cx = w / 2 + Math.cos(a) * h * 0.34, cy = h * 0.5 + Math.sin(a) * h * 0.34;
          g.save(); g.translate(cx, cy); g.rotate(a + sg * 0.6); g.beginPath(); g.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2); g.fill(); g.restore();
        });
      }
      star(g, w / 2, h * 0.5, h * 0.17, GOLD);
    } else if (id === 'general') {
      g.fillStyle = side < 0 ? '#1f3d2a' : '#5e1a18'; g.fillRect(0, 0, w, h);
      for (var s2 = 0; s2 < 4; s2++) star(g, w * (0.2 + s2 * 0.2), h * 0.5, h * 0.13, GOLD);
      g.strokeStyle = GOLD; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = GOLD; for (var f = 0; f < w; f += 10) { g.fillRect(f, h - 7, 6, 7); g.fillRect(f, 0, 6, 7); }   // fringe
    } else {   // standard: faction field, a light centre band and the faction mark at the hoist
      g.fillStyle = P.light; g.fillRect(0, h * 0.42, w, h * 0.16);
      g.fillStyle = P.dark; g.fillRect(0, 0, w * 0.22, h);
      g.fillStyle = P.mark; g.beginPath();
      if (side < 0) { g.moveTo(w * 0.11, h * 0.36); g.lineTo(w * 0.17, h * 0.6); g.lineTo(w * 0.05, h * 0.6); } else { g.moveTo(w * 0.11, h * 0.64); g.lineTo(w * 0.17, h * 0.4); g.lineTo(w * 0.05, h * 0.4); }
      g.closePath(); g.fill();
    }
    // cloth shading: faint weave + darker hoist edge
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 6, h);
    g.globalAlpha = 0.05; g.fillStyle = '#000'; for (var y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- build
  function build() {
    THREE = E().THREE; root = new THREE.Group(); root.name = 'v12032-hq-banners'; E().scene.add(root);
    var lw = low(), sx = lw ? 8 : 16, sy = lw ? 4 : 8;
    var poleM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8d9296).convertSRGBToLinear(), roughness: 0.4, metalness: 0.7 });
    var goldM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xd7b56d).convertSRGBToLinear(), roughness: 0.35, metalness: 0.8 });
    var baseM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x77736b).convertSRGBToLinear(), roughness: 0.95 });
    var ropeM = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xd9d2bf).convertSRGBToLinear(), roughness: 0.9 });
    [-1, 1].forEach(function (side) {
      var x = side * (hqX() + 5), z = -7, y = H(x, z), g = new THREE.Group(); g.position.set(x, y, z); root.add(g);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, POLE, 8), poleM); pole.position.y = POLE / 2; pole.castShadow = !lw; g.add(pole);
      var fin = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), goldM); fin.position.y = POLE + 0.12; g.add(fin);
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.5, 10), baseM); base.position.y = 0.2; base.receiveShadow = true; g.add(base);
      // halyard: a thin rope from the cleat up to the truck, down the fly side of the pole, plus a cleat and a truck pulley
      var hal = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, POLE - 1.2, 4), ropeM); hal.position.set(0.09, (POLE - 1.2) / 2 + 1.1, 0.02); g.add(hal);
      var cleat = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), poleM); cleat.position.set(0.1, 1.2, 0); g.add(cleat);
      var truck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 10), poleM); truck.position.y = POLE - 0.04; g.add(truck);
      var canvas = doc.createElement('canvas'); canvas.width = 256; canvas.height = 160;
      var tex = new THREE.CanvasTexture(canvas); if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 2;
      var geo = new THREE.PlaneGeometry(W, HGT, sx, sy); geo.translate(W / 2, 0, 0);
      var cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 }));
      cloth.position.set(0.08, POLE - 0.25 - HGT / 2, 0); cloth.castShadow = !lw; g.add(cloth);
      var base0 = Float32Array.from(geo.attributes.position.array);
      flags[side] = { side: side, g: g, cloth: cloth, geo: geo, base0: base0, canvas: canvas, tex: tex, key: '', ph: Math.random() * 6 };
    });
    stats.built = 2; refresh(true);
  }
  function refresh(force) {
    var me = mySide();
    [-1, 1].forEach(function (side) {
      var F = flags[side]; if (!F) return;
      var id = side === me ? myBanner() : 'std', key = side + ':' + id;
      if (!force && key === F.key) return;
      draw(F.canvas, side, id); F.tex.needsUpdate = true; F.key = key; F.id = id; stats.redraws++;
    });
  }
  function wave(F, t, wind, normals) {
    var p = F.geo.attributes.position, a = p.array, b = F.base0, amp = 0.27 * wind, k = 2.1, w = 5.2 * (0.7 + wind * 0.3);
    for (var i = 0; i < a.length; i += 3) {
      var x = b[i], y = b[i + 1], u = x / W;
      a[i + 2] = Math.sin(k * x - w * t + F.ph + y * 0.6) * amp * (0.15 + u) + Math.sin(k * 2.1 * x - w * 1.7 * t) * amp * 0.25 * u;
      a[i + 1] = y - u * u * 0.12 / wind;
      a[i] = x * (1 - 0.03 * Math.abs(Math.sin(w * t * 0.5 + F.ph)));
    }
    p.needsUpdate = true; if (normals) F.geo.computeVertexNormals();
  }
  function update() {
    if (!enabled) return;
    var e = E(); if (!e || !e.THREE || !e.scene) return;
    if (!THREE) { try { build(); } catch (err) { enabled = false; console.warn('[hqBanners] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    chkT -= dt; if (chkT <= 0) { chkT = 1; refresh(false); }
    if (e.isPaused && e.isPaused()) return;
    frame++; if (low() && frame % 2) return;
    var t = (now - t0) / 1000, wind = (rain() ? 1.35 : 1) * (0.85 + 0.15 * Math.sin(t * 0.37));
    var cam = e.camera, lw = low(), n = 0;
    for (var s in flags) {
      var F = flags[s]; F.g.rotation.y = 0.35 + Math.sin(t * 0.05) * 0.1;
      // far flags (beyond ~260 m, or ~160 m on LOW / phones) freeze in their last pose: you can't see the cloth move from there
      if (cam) { var dx = cam.position.x - F.g.position.x, dz = cam.position.z - F.g.position.z, far = lw ? 160 : 260; if (dx * dx + dz * dz > far * far) { stats.culled++; continue; } }
      wave(F, t, wind, !lw || frame % 4 < 2); n++;
    }
    if (n) stats.frames++;
  }

  LB.hqBanners = {
    version: 'v12.0.32', update: update,
    isEnabled: function () { return enabled; },
    refresh: function () { refresh(true); return true; },
    getState: function () { var o = Object.assign({ enabled: enabled, me: mySide() }, stats); o.flags = Object.keys(flags).map(function (k) { var F = flags[k]; return { side: F.side, id: F.id, x: +F.g.position.x.toFixed(1), z: F.g.position.z, y: +F.g.position.y.toFixed(2) }; }); return o; },
    _focus: function (side) { var F = flags[side]; return F ? { x: F.g.position.x, y: F.g.position.y + POLE - 1.2, z: F.g.position.z } : null; }
  };
})(window);
