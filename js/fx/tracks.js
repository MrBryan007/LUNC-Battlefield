/* LUNC Battlefield v12.0.36 — Tread marks: tracks and ruts that persist under vehicles (realism checklist, terrain).
 *
 * Cosmetic only (game/visual layer). Never touches market data, the price→X mapping, the frontline math, army counts
 * or data-truth labels.
 *  - Every MBT (type 1) lays a pair of track prints and every self-propelled gun (type 2) a pair of narrower wheel
 *    ruts as it moves: a print every 1.6–1.8 m of travel, offset to each side of the hull along its heading. Only
 *    vehicles within a tier radius of the camera focus lay prints (LOW 90 m … ULTRA 230 m), so the ring buffer holds
 *    the prints you can actually see.
 *  - Prints are height-aware: y from engine.terrainHeight and tilted to the local slope (finite-difference normal), so
 *    they hug berms and craters. Nothing is laid in the ocean or on the beach.
 *  - One InstancedMesh ring buffer (one draw call, no shadows, polygon offset against z-fighting). Caps per tier.
 *    Prints age over minutes: they lighten toward the soil colour and thin out near the end of their life, then the
 *    slot is reused for the newest print.
 *  - Rain (Settings → WORLD weather) lays darker, wetter, slightly wider mud prints.
 *  - Wrecks / hidden units lay nothing; a jump of more than 6 m (respawn, teleport) starts a fresh line.
 * Kill switch: ?tracks=0 (also off with ?realism=0). API: LUNCBattle.tracks.getState().
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('tracks') !== '0' && qs.get('realism') !== '0';

  var CAPS = { LOW: { n: 600, life: 150, every: 3, near: 90 }, MEDIUM: { n: 1800, life: 420, every: 2, near: 140 }, HIGH: { n: 3600, life: 420, every: 1, near: 180 }, ULTRA: { n: 5000, life: 420, every: 1, near: 230 } };
  // per vehicle type: half gauge (m, centre of hull to centre of the print), print width, step between prints
  var KIND = { 1: { half: 1.07, w: 0.36, step: 1.6, cleat: true }, 2: { half: 0.62, w: 0.2, step: 1.8, cleat: false } };
  var SHORE_Z = 54, JUMP = 6;
  var DRY = { fresh: 0x2b261e, old: 0x6b5f49 }, WET = { fresh: 0x17130e, old: 0x4a4031 };

  var THREE = null, mesh = null, geo = null, mat = null, capT = '', cap = CAPS.HIGH;
  var marks = [], head = 0, filled = 0, frame = 0, last = 0, ageAcc = 0, tierAcc = 0;
  var state = { enabled: enabled, ready: false, tier: '', cap: 0, marks: 0, vehicles: 0, drops: 0, recycled: 0, skippedShore: 0, skippedWreck: 0, skippedFar: 0, restarts: 0, wet: false, maxSlopeDeg: 0 };
  var _m = null, _q = null, _q2 = null, _p = null, _s = null, _up = null, _n = null, _c = null, _cf = null, _co = null, _e = null;

  function E() { return LB.engine; }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function tierName() {
    try { var t = LB.quality.getEffectiveName(); if (E().mobile) t = 'LOW'; return CAPS[t] ? t : 'HIGH'; } catch (_) { return 'HIGH'; }
  }
  function wet() { try { return LB.v12extras.getOptions().weather === 'rain'; } catch (_) { return false; } }

  function build() {
    var e = E(); THREE = e.THREE;
    _m = new THREE.Matrix4(); _q = new THREE.Quaternion(); _q2 = new THREE.Quaternion(); _p = new THREE.Vector3(); _s = new THREE.Vector3();
    _up = new THREE.Vector3(0, 1, 0); _n = new THREE.Vector3(); _c = new THREE.Color(); _cf = new THREE.Color(); _co = new THREE.Color(); _e = new THREE.Euler();
    // a print: a flat quad with soft cleat bars baked into a tiny canvas (track) or a plain soft rut (wheels)
    geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    var tex = null;
    try {
      var cv = document.createElement('canvas'); cv.width = 16; cv.height = 64; var g = cv.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, 16, 64);
      var grd = g.createLinearGradient(0, 0, 16, 0); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.18, 'rgba(255,255,255,.75)'); grd.addColorStop(0.82, 'rgba(255,255,255,.75)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 16, 64);
      g.fillStyle = 'rgba(255,255,255,.35)'; for (var y = 2; y < 64; y += 8) g.fillRect(2, y, 12, 3);   // cleat bars
      tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.RepeatWrapping;
    } catch (_) { tex = null; }
    mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, alphaMap: tex || null,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: true });
    mat.name = 'tracks.print';
    alloc(tierName());
    state.ready = true;
  }
  function alloc(t) {
    var e = E(); capT = t; cap = CAPS[t];
    if (mesh) { e.scene.remove(mesh); mesh.dispose && mesh.dispose(); }
    mesh = new THREE.InstancedMesh(geo, mat, cap.n);
    mesh.name = 'treadMarks'; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.instanceMatrix.setUsage && mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap.n * 3), 3);
    mesh.count = 0; e.scene.add(mesh);
    // keep the newest prints when shrinking (tier change); drop the rest
    var keep = marks.slice(); keep.sort(function (a, b) { return a.t0 - b.t0; }); keep = keep.slice(-cap.n);
    marks = []; head = 0; filled = 0;
    keep.forEach(function (k) { put(k); });
    state.tier = t; state.cap = cap.n;
  }
  function compose(k, now) {
    var age = (now - k.t0) / 1000, life = cap.life, f = Math.min(1, age / life);
    if (f >= 1) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(k.i, _m); return; }
    var thin = f < 0.8 ? 1 : Math.max(0.05, 1 - (f - 0.8) / 0.2);   // thin out over the last 20 % of life
    _p.set(k.x, k.y, k.z); _s.set(k.w * thin, 1, k.l);
    _e.set(0, k.yaw, 0); _q.setFromEuler(_e); _q2.setFromUnitVectors(_up, _n.set(k.nx, k.ny, k.nz)); _q.premultiply(_q2);
    _m.compose(_p, _q, _s); mesh.setMatrixAt(k.i, _m);
    var P = k.wet ? WET : DRY; _cf.setHex(P.fresh); _co.setHex(P.old); _c.copy(_cf).lerp(_co, Math.min(1, f * 1.15));
    mesh.setColorAt ? mesh.setColorAt(k.i, _c) : (mesh.instanceColor.setXYZ(k.i, _c.r, _c.g, _c.b));
  }
  function put(k) {
    k.i = head;
    if (filled >= cap.n) { state.recycled++; } else filled++;
    marks[head] = k; head = (head + 1) % cap.n;
    compose(k, performance.now());
    mesh.count = filled; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  function drop(x, z, yaw, len, K, rain, now) {
    if (z > SHORE_Z) { state.skippedShore++; return; }
    var d = 0.6, hx = H(x + d, z) - H(x - d, z), hz = H(x, z + d) - H(x, z - d);
    _n.set(-hx / (2 * d), 1, -hz / (2 * d)).normalize();
    var sl = Math.acos(Math.min(1, _n.y)) * 57.3; if (sl > state.maxSlopeDeg) state.maxSlopeDeg = +sl.toFixed(1);
    var w = K.w * (rain ? 1.15 : 1);
    put({ x: x, y: H(x, z) + 0.035, z: z, yaw: yaw, l: len, w: w, nx: _n.x, ny: _n.y, nz: _n.z, wet: rain, t0: now });
    state.drops++;
  }
  function lay(u, rain, now, fx, fz, near2) {
    var ud = u.userData, t = ud.utype != null ? ud.utype : ud.type, K = KIND[t];
    if (!K) return false;
    if (ud.wreckUntil || !u.visible || u.scale.x < 0.05) { ud._trk = null; state.skippedWreck++; return true; }
    var p = u.position, tr = ud._trk;
    var fdx = p.x - fx, fdz = p.z - fz;
    if (fdx * fdx + fdz * fdz > near2) { ud._trk = null; state.skippedFar++; return true; }   // nobody sees prints out there
    if (!tr) { ud._trk = { x: p.x, z: p.z }; return true; }
    var dx = p.x - tr.x, dz = p.z - tr.z, dist = Math.hypot(dx, dz);
    if (dist > JUMP) { tr.x = p.x; tr.z = p.z; state.restarts++; return true; }
    if (dist < K.step) return true;
    var yaw = Math.atan2(dx, dz), cx = tr.x + dx * 0.5, cz = tr.z + dz * 0.5, ox = Math.cos(yaw) * K.half, oz = -Math.sin(yaw) * K.half;
    var len = dist + 0.12;   // a little overlap so a line reads continuous
    drop(cx + ox, cz + oz, yaw, len, K, rain, now);
    drop(cx - ox, cz - oz, yaw, len, K, rain, now);
    tr.x = p.x; tr.z = p.z;
    return true;
  }
  function age(now) {
    for (var i = 0; i < filled; i++) { var k = marks[i]; if (k) compose(k, now); }
    mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  function update() {
    if (!enabled) return;
    var e = E(); if (!e || !e.THREE || !e.scene || !e.getArmies) return;
    if (!state.ready) { try { build(); } catch (err) { enabled = false; state.enabled = false; console.warn('[tracks]', err); return; } }
    var now = performance.now(), dt = Math.min(0.25, (now - (last || now)) / 1000); last = now;
    if (e.isPaused && e.isPaused()) return;
    tierAcc += dt; if (tierAcc > 2) { tierAcc = 0; var t = tierName(); if (t !== capT) alloc(t); }
    if ((++frame % cap.every) !== 0) return;
    var A = e.getArmies(), rain = wet(), n = 0; state.wet = rain;
    var f = e.controls && e.controls.target ? e.controls.target : e.camera.position, near2 = cap.near * cap.near;
    [A.bulls, A.bears].forEach(function (list) { if (list) for (var i = 0; i < list.length; i++) if (lay(list[i], rain, now, f.x, f.z, near2)) n++; });
    state.vehicles = n;
    ageAcc += dt * cap.every; if (ageAcc > 0.5) { ageAcc = 0; age(now); }
    state.marks = filled;
  }

  LB.tracks = {
    version: 'v12.0.36', isEnabled: function () { return enabled && state.ready; }, update: update,
    getState: function () { return Object.assign({}, state, { marks: filled, life: cap.life }); },
    clear: function () { marks = []; head = 0; filled = 0; if (mesh) mesh.count = 0; return true; },
    // test hook: lay a straight line of prints for a vehicle type from (x,z) along yaw for `m` metres
    _lay: function (type, x, z, yaw, m) {
      if (!state.ready) return 0; var K = KIND[type] || KIND[1], now = performance.now(), c = 0;
      for (var s = 0; s < m; s += K.step) { var px = x + Math.sin(yaw) * s, pz = z + Math.cos(yaw) * s, ox = Math.cos(yaw) * K.half, oz = -Math.sin(yaw) * K.half;
        drop(px + ox, pz + oz, yaw, K.step + 0.12, K, wet(), now); drop(px - ox, pz - oz, yaw, K.step + 0.12, K, wet(), now); c += 2; }
      return c;
    },
    _age: function (sec) { var now = performance.now(); marks.forEach(function (k) { if (k) k.t0 -= sec * 1000; }); age(now); return true; }
  };
})(window);
