/* LUNC Battlefield v11.3 — session persistence for battle remains (game FX only).
 * Settled bodies, debris and wrecks are frozen into static InstancedMesh batches (no per-frame work:
 * a matrix is written once when the item arrives). Each batch is a ring buffer with a per-tier soft cap;
 * when it wraps, the OLDEST item is turned into a cheap imprint (scorch via craters + a low rubble pile,
 * LOW: scorch only) so the field keeps its history and nothing pops out abruptly.
 * Caps (wrecks / debris / bodies): ULTRA 400/1500/300 · HIGH 250/900/200 · MEDIUM 120/400/100 · LOW 40/100/30.
 * Batches are sized once at first use for the tier active then (re-tiering keeps the original allocation).
 * reset() only on a new Commander session. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var E = function () { return LB.engine; };
  var CAPS = { ULTRA: [400, 1500, 300], HIGH: [250, 900, 200], MEDIUM: [120, 400, 100], LOW: [40, 100, 30] };
  var PILE_CAP = 1200;
  var THREE, B = null, stats = { bodies: 0, debris: 0, wrecks: 0, imprints: 0 };
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
  /** Wreck hull: {x,z,rotY,sx,sy,sz,color,tilt} */
  function addWreck(o) {
    if (!ensure()) return; scratch();
    var i = slot(B.wreck, o.x, o.z, 1.6);
    var y = E().terrainHeight(o.x, o.z);
    _p.set(o.x, y + (o.sy || 0.5) * 0.5 - 0.08, o.z);
    _q.setFromEuler(new THREE.Euler(o.tilt || 0, o.rotY || 0, (o.tilt || 0) * 0.6));
    _s.set(o.sx || 1.9, o.sy || 0.5, o.sz || 1.1);
    B.wreck.im.setMatrixAt(i, _m.compose(_p, _q, _s)); B.wreck.im.setColorAt(i, _c.setHex(o.color || 0x1d1c1a)); flush(B.wreck);
    stats.wrecks = B.wreck.used;
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
  }
  LB.persist = { addDebris: addDebris, addWreck: addWreck, addBody: addBody, imprint: function (x, z, s) { if (ensure()) imprint(x, z, s); }, reset: reset, CAPS: CAPS,
    getStats: function () { return Object.assign({ tier: tierName(), caps: B ? B.caps : null, piles: B ? B.pile.used : 0 }, stats); } };
})(window);
