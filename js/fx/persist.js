/* LUNC Battlefield v11.3 — session persistence for battle remains (game FX only).
 * Settled bodies, debris and wrecks are frozen into static InstancedMesh batches (no per-frame work:
 * a matrix is written once when the item arrives). Each batch is a ring buffer with a per-tier soft cap;
 * when it wraps, the OLDEST item is turned into a cheap imprint (scorch via craters + a low rubble pile,
 * LOW: scorch only) so the field keeps its history and nothing pops out abruptly.
 * Caps (wrecks / debris / bodies): ULTRA 400/1500/300 · HIGH 250/900/200 · MEDIUM 120/400/100 · LOW 40/100/30.
 * Batches are sized once at first use for the tier active then (re-tiering keeps the original allocation).
 * reset() only on a new Commander session.
 * v12.0.70 HULKS (?hulks=0 → v12.0.69 single-box wrecks): each wreck keeps its kind (mbt / spg / air / box) and gets
 * detail parts in two more static batches — MBT: open turret ring + thrown track + skewed side skirt; SPG: skewed
 * casemate + drooping gun + thrown track; downed aircraft: fuselage-length hull + snapped wing + tail fin. Soot → rust
 * colour variation. Distance LOD at 2 Hz: detail parts only within a per-tier camera radius (ULTRA 320 / HIGH 220 /
 * MEDIUM 140 m; LOW = hull only), the hull itself stays out to the horizon; only items that cross the radius are rewritten. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var E = function () { return LB.engine; };
  var CAPS = { ULTRA: [400, 1500, 300], HIGH: [250, 900, 200], MEDIUM: [120, 400, 100], LOW: [40, 100, 30] };
  var PILE_CAP = 1200;
  var THREE, B = null, stats = { bodies: 0, debris: 0, wrecks: 0, imprints: 0 };
  var HULKS = (function () { try { return new URLSearchParams(global.location.search).get('hulks') !== '0'; } catch (_) { return true; } })();
  var HULK_R = { ULTRA: 320, HIGH: 220, MEDIUM: 140, LOW: 0 };
  var HULK_PAL = [0x1d1c1a, 0x24201c, 0x2e2620, 0x3a2b1f, 0x262524, 0x33281f];
  var hstats = { on: HULKS, near: 0, far: 0, rewrites: 0, lodTicks: 0, kinds: { mbt: 0, spg: 0, air: 0, box: 0 } };
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }

  function batch(geo, mat, cap, name) {
    var im = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
    im.name = name; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false;
    var z = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color(0x444444);
    for (var i = 0; i < im.count; i++) { im.setMatrixAt(i, z); im.setColorAt(i, c); }
    E().scene.add(im);
    return { im: im, cap: cap, head: 0, used: 0, pos: new Float32Array(cap * 2), dirty: false };
  }
  function ensure() {
    if (B) return true;
    var e = E(); if (!e || !e.THREE) return false;
    THREE = e.THREE;
    var c = CAPS[tierName()] || CAPS.MEDIUM;
    var mat = function (r, m) { return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: r, metalness: m }); };
    var seg = new THREE.BoxGeometry(0.14, 1, 0.14); seg.translate(0, 0.5, 0);
    var hull = new THREE.BoxGeometry(1, 1, 1);
    B = {
      wreck: batch(hull, mat(0.95, 0.15), c[0], 'persist-wrecks'),
      debris: batch(new THREE.BoxGeometry(1, 1, 1), mat(0.85, 0.2), c[1], 'persist-debris'),
      body: batch(seg, mat(0.9, 0.05), c[2] * 7, 'persist-body-segs'),
      head: batch(new THREE.SphereGeometry(0.13, 6, 5), mat(0.9, 0.05), c[2], 'persist-body-heads'),
      pile: batch(new THREE.DodecahedronGeometry(0.5, 0), mat(1, 0), tierName() === 'LOW' ? 1 : PILE_CAP, 'persist-piles'),
      low: tierName() === 'LOW', caps: c
    };
    if (HULKS && !B.low) {   // v12.0.70 hulk detail: 3 box parts + 1 gun barrel per wreck slot
      var bar = new THREE.CylinderGeometry(0.5, 0.5, 1, 6); bar.rotateZ(Math.PI / 2);
      B.hbox = batch(new THREE.BoxGeometry(1, 1, 1), mat(0.95, 0.2), c[0] * 3, 'persist-hulk-parts');
      B.hbar = batch(bar, mat(0.8, 0.35), c[0], 'persist-hulk-guns');
      B.hmat = new Float32Array(c[0] * 4 * 16);   // detail matrices per wreck (4 parts), kept for LOD swaps
      B.hkind = new Uint8Array(c[0]);              // 0 none, 1 mbt, 2 spg, 3 air, 4 box
      B.hnear = new Uint8Array(c[0]);
      B.hcol = new Uint32Array(c[0]);
      B.hR = HULK_R[tierName()] != null ? HULK_R[tierName()] : 140;
      if (!lodTimer) lodTimer = setInterval(lodTick, 500);
    }
    return true;
  }
  var _m, _p, _q, _s, _c;
  function scratch() { if (!_m) { _m = new THREE.Matrix4(); _p = new THREE.Vector3(); _q = new THREE.Quaternion(); _s = new THREE.Vector3(); _c = new THREE.Color(); } }

  function imprint(x, z, size) {
    stats.imprints++;
    var CR = LB.craters;
    if (CR && CR.withMode && CR.impact) try { CR.withMode('scorch', function () { CR.impact(x, z, 0.35 * (size || 1)); }); } catch (_) {}
    if (B.low) return;
    var P = B.pile; scratch();
    var y = E().terrainHeight(x, z);
    _p.set(x, y + 0.02, z); _q.setFromAxisAngle(_s.set(0, 1, 0), Math.random() * 6.28);
    var k = 0.5 + (size || 1) * 0.5; _s.set(k, 0.22 * k, k);
    var i = P.head; P.head = (P.head + 1) % P.cap; P.used = Math.min(P.cap, P.used + 1);
    P.im.setMatrixAt(i, _m.compose(_p, _q, _s)); P.im.setColorAt(i, _c.setHex(0x3b352d));
    P.im.instanceMatrix.needsUpdate = true; if (P.im.instanceColor) P.im.instanceColor.needsUpdate = true;
  }
  /** Reserve `n` consecutive slots (a body uses 7 segment slots); imprints whatever was there. */
  function slot(b, x, z, size, n) {
    n = n || 1;
    if (b.head + n > b.cap) b.head = 0;
    var i = b.head;
    if (b.used >= b.cap || b.pos[i * 2] !== 0 || b.pos[i * 2 + 1] !== 0) {
      if (b.pos[i * 2] || b.pos[i * 2 + 1]) imprint(b.pos[i * 2], b.pos[i * 2 + 1], size);
    }
    b.pos[i * 2] = x || 1e-3; b.pos[i * 2 + 1] = z || 1e-3;
    b.head = (i + n) % b.cap; b.used = Math.min(b.cap, b.used + n);
    b.dirty = true;
    return i;
  }
  function flush(b) { b.im.instanceMatrix.needsUpdate = true; if (b.im.instanceColor) b.im.instanceColor.needsUpdate = true; }

  function addDebris(matrix, colorHex) {
    if (!ensure()) return; scratch();
    _m.copy(matrix); _p.setFromMatrixPosition(_m);
    var i = slot(B.debris, _p.x, _p.z, 0.4);
    B.debris.im.setMatrixAt(i, _m); B.debris.im.setColorAt(i, _c.setHex(colorHex == null ? 0x3d3f3a : colorHex)); flush(B.debris);
    stats.debris = B.debris.used;
  }
  /** Wreck hull: {x,z,rotY,sx,sy,sz,color,tilt,kind} — kind 'mbt' | 'spg' | 'air' (else a plain box). */
  function addWreck(o) {
    if (!ensure()) return; scratch();
    var i = slot(B.wreck, o.x, o.z, 1.6);
    var y = E().terrainHeight(o.x, o.z);
    var col = o.color || 0x1d1c1a;
    if (HULKS) col = o.color && o.kind !== 'air' ? o.color : HULK_PAL[(Math.random() * HULK_PAL.length) | 0];
    if (HULKS && o.kind === 'air') col = Math.random() < 0.5 ? 0x2a2b2c : 0x34332f;
    _p.set(o.x, y + (o.sy || 0.5) * 0.5 - 0.08, o.z);
    _q.setFromEuler(new THREE.Euler(o.tilt || 0, o.rotY || 0, (o.tilt || 0) * 0.6));
    _s.set(o.sx || 1.9, o.sy || 0.5, o.sz || 1.1);
    B.wreck.im.setMatrixAt(i, _m.compose(_p, _q, _s)); B.wreck.im.setColorAt(i, _c.setHex(col)); flush(B.wreck);
    stats.wrecks = B.wreck.used;
    if (B.hbox) hulkParts(i, o, y, col);
  }
  // ---- v12.0.70 HULKS: per-kind detail parts, written into hmat (local → world via the hull's yaw) ----
  var _hm, _hq, _hp, _hs, _he, _hu;
  function part(i, k, o, y, lx, ly, lz, sx, sy, sz, rx, ry, rz) {
    var cy = Math.cos(o.rotY || 0), sy0 = Math.sin(o.rotY || 0);
    // local x along the hull, z across it; rotate by the hull yaw (THREE yaw: x' = x cos + z sin, z' = -x sin + z cos)
    _hp.set(o.x + lx * cy + lz * sy0, y + ly, o.z - lx * sy0 + lz * cy);
    _hq.setFromEuler(_he.set(rx || 0, (o.rotY || 0) + (ry || 0), rz || 0, 'YXZ'));
    _hs.set(sx, sy, sz);
    _hm.compose(_hp, _hq, _hs).toArray(B.hmat, (i * 4 + k) * 16);
  }
  function hulkParts(i, o, y, col) {
    if (!_hm) { _hm = new THREE.Matrix4(); _hq = new THREE.Quaternion(); _hp = new THREE.Vector3(); _hs = new THREE.Vector3(); _he = new THREE.Euler(); _hu = new THREE.Matrix4().makeScale(0, 0, 0); }
    var L = o.sx || 1.9, H = o.sy || 0.5, W = o.sz || 1.1, r = Math.random, sgn = r() < 0.5 ? -1 : 1;
    var kind = o.kind === 'mbt' ? 1 : o.kind === 'spg' ? 2 : o.kind === 'air' ? 3 : 4;
    B.hmat.fill(0, i * 64, i * 64 + 64);
    if (kind === 1) {          // turret blown off (it flew as debris): open ring, thrown track beside the hull, skewed side skirt
      part(i, 0, o, y, L * 0.05, H + 0.02, 0, L * 0.42, 0.06, W * 0.62, 0, r() * 0.3, 0);
      part(i, 1, o, y, (r() - 0.3) * L * 0.4, 0.04, sgn * (W * 0.5 + 0.35 + r() * 0.5), L * 1.15, 0.07, 0.3, 0, (r() - 0.5) * 0.5, 0);
      part(i, 2, o, y, 0, H * 0.45, -sgn * (W * 0.5 + 0.03), L * 0.8, H * 0.5, 0.05, 0.35 + r() * 0.3, 0, (r() - 0.5) * 0.2);
    } else if (kind === 2) {   // SPG: casemate knocked askew, gun drooping into the dirt, thrown track
      part(i, 0, o, y, -L * 0.1, H + 0.2, 0, L * 0.5, 0.42, W * 0.78, (r() - 0.5) * 0.12, (r() - 0.5) * 0.5, 0.06 + r() * 0.08);
      part(i, 1, o, y, (r() - 0.5) * L * 0.3, 0.04, sgn * (W * 0.5 + 0.3 + r() * 0.4), L * 1.1, 0.07, 0.28, 0, (r() - 0.5) * 0.4, 0);
      var bl = 1.5 + r() * 0.3;
      part(i, 3, o, y, L * 0.25 + bl * 0.45, H * 0.85, 0, bl, 0.12, 0.12, 0, (r() - 0.5) * 0.25, -(0.25 + r() * 0.25));
    } else if (kind === 3) {   // downed aircraft: snapped wing lying off-axis, the other wing stub, tail fin canted
      part(i, 0, o, y, (r() - 0.5) * 0.4, 0.06, sgn * (W * 0.5 + 0.8 + r() * 0.6), 0.9, 0.06, 1.6, 0.08, (r() - 0.5) * 0.9, 0.1);
      part(i, 1, o, y, 0.1, H * 0.4, -sgn * (W * 0.5 + 0.45), 0.7, 0.05, 0.9, 0, 0.2, -sgn * 0.25);
      part(i, 2, o, y, -L * 0.42, H + 0.25, 0, 0.45, 0.6, 0.05, 0.3 * (r() - 0.5), 0, 0.35 + r() * 0.3);
    } else {                   // generic box hull: a bit of scattered plating
      part(i, 0, o, y, (r() - 0.5) * L, 0.04, sgn * (W * 0.5 + 0.4), 0.6, 0.05, 0.5, 0, r() * 3, 0.1);
    }
    B.hkind[i] = kind; B.hcol[i] = col; B.hnear[i] = 0;
    hstats.kinds[['', 'mbt', 'spg', 'air', 'box'][kind]]++;
    _c.setHex(col).multiplyScalar(0.85);
    for (var k = 0; k < 3; k++) { B.hbox.im.setMatrixAt(i * 3 + k, _hu); B.hbox.im.setColorAt(i * 3 + k, _c); }
    B.hbar.im.setMatrixAt(i, _hu); B.hbar.im.setColorAt(i, _c);
    applyLod(i, isNear(i), true);
    flush(B.hbox); flush(B.hbar);
  }
  function isNear(i) {
    if (!B.hR) return false;
    var cam; try { cam = E().camera.position; } catch (_) { return false; }
    var x = B.wreck.pos[i * 2], z = B.wreck.pos[i * 2 + 1];
    return Math.hypot(cam.x - x, cam.z - z, cam.y) < B.hR;
  }
  function applyLod(i, near, force) {
    if (!force && !!B.hnear[i] === near) return false;
    B.hnear[i] = near ? 1 : 0;
    var any = function (k) { var o = (i * 4 + k) * 16; return B.hmat[o] || B.hmat[o + 1] || B.hmat[o + 5] || B.hmat[o + 10]; };
    for (var k = 0; k < 3; k++) {
      if (near && any(k)) { _hm.fromArray(B.hmat, (i * 4 + k) * 16); B.hbox.im.setMatrixAt(i * 3 + k, _hm); } else B.hbox.im.setMatrixAt(i * 3 + k, _hu);
    }
    if (near && any(3)) { _hm.fromArray(B.hmat, (i * 4 + 3) * 16); B.hbar.im.setMatrixAt(i, _hm); } else B.hbar.im.setMatrixAt(i, _hu);
    hstats.rewrites++;
    return true;
  }
  var lodTimer = 0;
  function lodTick() {
    if (!B || !B.hbox || (global.document && global.document.hidden)) return;
    hstats.lodTicks++;
    var ch = false, n = 0, f = 0;
    for (var i = 0; i < B.wreck.cap; i++) {
      if (!B.hkind[i]) continue;
      var near = isNear(i);
      if (applyLod(i, near, false)) ch = true;
      if (near) n++; else f++;
    }
    hstats.near = n; hstats.far = f;
    if (ch) { flush(B.hbox); flush(B.hbar); }
  }
  /** Body from ragdoll proxy group (segments in g.userData.segs, head in g.userData.head). */
  function addBody(g, colorHex) {
    if (!ensure()) return false; scratch();
    g.updateMatrixWorld(true);
    var segs = g.userData.segs || [], head = g.userData.head;
    _p.setFromMatrixPosition(head ? head.matrixWorld : g.matrixWorld);
    var hi = slot(B.head, _p.x, _p.z, 0.5);
    var si = hi * 7;   // body segment slots mirror head slots (cap = heads × 7)
    B.body.pos[si * 2] = _p.x; B.body.used = B.head.used * 7;
    _c.setHex(0x4a5240).lerp(_s.set(0, 0, 0) && new THREE.Color(colorHex == null ? 0x666666 : colorHex), 0.35).multiplyScalar(0.8);   // muted uniform tone (non-graphic)
    for (var k = 0; k < 7; k++) {
      var s = segs[k];
      if (s) B.body.im.setMatrixAt(si + k, s.matrixWorld); else B.body.im.setMatrixAt(si + k, _m.makeScale(0, 0, 0));
      B.body.im.setColorAt(si + k, _c);
    }
    if (head) { B.head.im.setMatrixAt(hi, head.matrixWorld); B.head.im.setColorAt(hi, _c); }
    flush(B.body); flush(B.head);
    stats.bodies = B.head.used;
    return true;
  }
  function reset() {
    if (!B) return;
    var z = new THREE.Matrix4().makeScale(0, 0, 0);
    ['wreck', 'debris', 'body', 'head', 'pile'].forEach(function (k) {
      var b = B[k]; for (var i = 0; i < b.cap; i++) b.im.setMatrixAt(i, z);
      b.head = 0; b.used = 0; b.pos.fill(0); flush(b);
    });
    stats.bodies = stats.debris = stats.wrecks = stats.imprints = 0;
    if (B.hbox) {
      for (var j = 0; j < B.hbox.cap; j++) B.hbox.im.setMatrixAt(j, z);
      for (var j2 = 0; j2 < B.hbar.cap; j2++) B.hbar.im.setMatrixAt(j2, z);
      flush(B.hbox); flush(B.hbar); B.hkind.fill(0); B.hnear.fill(0); B.hmat.fill(0);
      hstats.near = hstats.far = 0; hstats.kinds = { mbt: 0, spg: 0, air: 0, box: 0 };
    }
  }
  LB.persist = { addDebris: addDebris, addWreck: addWreck, addBody: addBody, imprint: function (x, z, s) { if (ensure()) imprint(x, z, s); }, reset: reset, CAPS: CAPS,
    getStats: function () { return Object.assign({ tier: tierName(), caps: B ? B.caps : null, piles: B ? B.pile.used : 0 }, stats); },
    getHulkStats: function () { return Object.assign({ tier: tierName(), radius: B && B.hR != null ? B.hR : null, detail: !!(B && B.hbox) }, hstats, { kinds: Object.assign({}, hstats.kinds) }); },
    _lodTick: lodTick, HULK_R: HULK_R };
})(window);
