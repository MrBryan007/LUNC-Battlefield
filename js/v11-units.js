/* LUNC Battlefield v11.0 — realistic unit skin layer (CC0 glTF models, baked-animation instancing)
 *
 * Purely VISUAL. Reads army positions from LUNCBattle.engine.getArmies() each frame and draws
 * modern military models on top of them with THREE.InstancedMesh. It never changes army sizes,
 * market data, frontline math or any LIVE/CALCULATED value. Procedural meshes stay alive on
 * camera layer 1 (hidden) so LOD, muzzles, Commander hit tests and SAFE FALLBACK keep working.
 * If any model fails to load, that unit type simply stays procedural.
 *
 * Models (all CC0, see docs/ASSET-LICENSES.md): Quaternius via Poly Pizza.
 *   soldier.glb (SWAT, rigged: Idle_Gun / Walk / Run / Gun_Shoot), tank_a.glb, tank_b.glb,
 *   truck_armored.glb (IFV), pickup_armored.glb (MG technical).
 *
 * Animation: each clip is sampled into N static poses at load (SkinnedMesh.boneTransform), and every
 * pose is one InstancedMesh per faction. A soldier picks the pose for its current state/time, so
 * hundreds of animated soldiers cost ~one draw call per pose instead of one AnimationMixer each.
 *
 * URL: ?v11=0 disables the layer (pure v10 procedural look).
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle || (global.LUNCBattle = {});
  var VERSION = 'v11.1';
  var BASE = 'assets/models/v11/';
  var HIDDEN_LAYER = 1;

  var qs = (function () { try { return new URLSearchParams(location.search); } catch (_) { return { get: function () { return null; } }; } })();
  var disabled = qs.get('v11') === '0';

  // Per-tier density + features. Escorts are cosmetic squadmates/vehicles around market-driven units.
  var TIER = {
    LOW:    { infEscort: 0.5, armorEscort: 0,   mortar: 0.5, shadows: false, dust: false, mg: 0.5, poseFps: 10 },
    MEDIUM: { infEscort: 1,   armorEscort: 0.5, mortar: 1,   shadows: true,  dust: true,  mg: 1,   poseFps: 12 },
    HIGH:   { infEscort: 2,   armorEscort: 1,   mortar: 1,   shadows: true,  dust: true,  mg: 1,   poseFps: 14 },
    ULTRA:  { infEscort: 2,   armorEscort: 1,   mortar: 1,   shadows: true,  dust: true,  mg: 1.3, poseFps: 16 }
  };

  // Clip → pose count. Names are matched by suffix (armature prefix varies).
  var CLIPS = { idle: ['Idle_Gun', 6], walk: ['Walk', 8], run: ['Run', 8], shoot: ['Idle_Gun_Shoot', 6] };

  var E = null, THREE = null, scene = null;
  var ready = false, failed = false;
  var tierName = 'HIGH', tier = TIER.HIGH;
  var models = {};            // key → { parts:[{geo, mat}], norm: Matrix4 } or soldier poses
  var batches = [];           // all InstancedMesh batches
  var soldierBatches = null;  // [faction][clip][pose] → batch
  var vehBatches = {};        // key → [faction] → [part] batch
  var mortarBatch = null;
  var unitState = new WeakMap();
  var stats = { bakeProgress: 0, bakeTotal: 28, soldiers: 0, tanks: 0, ifv: 0, technicals: 0, mortars: 0, hiddenProcedural: 0, tier: '', loaded: false };
  var dust = null;
  var tmpM = new (global.THREE ? global.THREE.Matrix4 : function () {})();

  function q() { return LB.quality && LB.quality.getEffectiveName ? LB.quality.getEffectiveName() : 'HIGH'; }
  // v12.0.14 realism pass 2 (armies): faction camo instead of faction-tinted paint, camo shader, IFF roof panels.
  function AR() { var a = LB.armyRealism; return a && a.isEnabled && a.isEnabled() && a.patch ? a : null; }
  var RZ_GLB = { soldier: [0x56603f, 0x545a4e], veh: [0x5a6242, 0x51574c], tex: [0xe6ead2, 0xd8dad2] };
  function det(i, s) { var x = Math.sin((i + 1.37) * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); }

  // ---------------------------------------------------------------- baking
  function bakeMesh(mesh, applyColor) {
    var src = mesh.geometry;
    var pos = src.attributes.position, nor = src.attributes.normal;
    var n = pos.count;
    var outP = new Float32Array(n * 3), outN = new Float32Array(n * 3);
    var v = new THREE.Vector3(), nv = new THREE.Vector3();
    var nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    var skinned = mesh.isSkinnedMesh && mesh.skeleton;
    if (skinned) mesh.skeleton.update();
    for (var i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      if (skinned) mesh.boneTransform(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      outP[i * 3] = v.x; outP[i * 3 + 1] = v.y; outP[i * 3 + 2] = v.z;
      if (nor) {
        nv.fromBufferAttribute(nor, i);
        if (skinned) skinNormal(mesh, i, nv);
        nv.applyMatrix3(nm).normalize();
        outN[i * 3] = nv.x; outN[i * 3 + 1] = nv.y; outN[i * 3 + 2] = nv.z;
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(outP, 3));
    if (nor) g.setAttribute('normal', new THREE.BufferAttribute(outN, 3));
    if (src.attributes.uv) g.setAttribute('uv', src.attributes.uv);
    if (src.index) g.setIndex(src.index);
    if (applyColor) {
      var c = new Float32Array(n * 3);
      for (var k = 0; k < n; k++) { c[k * 3] = applyColor.r; c[k * 3 + 1] = applyColor.g; c[k * 3 + 2] = applyColor.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if (!nor) g.computeVertexNormals();
    return g;
  }

  // Approximate skinned normal: weighted bone rotation (good enough for lit low-poly).
  var _bm = null, _acc = null, _snT = null, _snW = [0, 0, 0, 0], _snB = [0, 0, 0, 0];
  function skinNormal(mesh, i, nv) {
    if (!_bm) { _bm = new THREE.Matrix4(); _acc = new THREE.Vector3(); }
    var si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    if (!si || !sw) return;
    var bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses;
    _acc.set(0, 0, 0);
    var t = _snT || (_snT = new THREE.Vector3());
    var W = _snW, B = _snB;
    W[0] = sw.getX(i); W[1] = sw.getY(i); W[2] = sw.getZ(i); W[3] = sw.getW(i);
    B[0] = si.getX(i); B[1] = si.getY(i); B[2] = si.getZ(i); B[3] = si.getW(i);
    for (var j = 0; j < 4; j++) {
      var w = W[j]; if (!w) continue;
      var b = B[j];
      _bm.multiplyMatrices(bones[b].matrixWorld, inv[b]).premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
      t.copy(nv).transformDirection(_bm).multiplyScalar(w);
      _acc.add(t);
    }
    if (_acc.lengthSq() > 1e-8) nv.copy(_acc);
  }

  function mergeGeos(list) {
    // simple non-generic merge (position/normal/color[/uv]) with indices
    var total = 0, idxTotal = 0, hasUv = list.every(function (g) { return !!g.attributes.uv; });
    list.forEach(function (g) { total += g.attributes.position.count; idxTotal += g.index ? g.index.count : g.attributes.position.count; });
    var P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3), U = hasUv ? new Float32Array(total * 2) : null;
    var I = new (total > 65535 ? Uint32Array : Uint16Array)(idxTotal);
    var vo = 0, io = 0;
    list.forEach(function (g) {
      var n = g.attributes.position.count;
      P.set(g.attributes.position.array, vo * 3);
      N.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.color) C.set(g.attributes.color.array, vo * 3); else C.fill(1, vo * 3, (vo + n) * 3);
      if (U) { var ua = g.attributes.uv; for (var k = 0; k < n; k++) { U[(vo + k) * 2] = ua.getX(k); U[(vo + k) * 2 + 1] = ua.getY(k); } }
      if (g.index) { for (var a = 0; a < g.index.count; a++) I[io++] = g.index.getX(a) + vo; }
      else { for (var b = 0; b < n; b++) I[io++] = b + vo; }
      vo += n;
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    out.setAttribute('color', new THREE.BufferAttribute(C, 3));
    if (U) out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    out.setIndex(new THREE.BufferAttribute(I, 1));
    out.computeBoundingSphere();
    return out;
  }

  /** Normalise a baked set of geos: centre on X/Z, feet at y=0, forward = +Z, given length/height. */
  function normalise(geos, opts) {
    var box = new THREE.Box3();
    geos.forEach(function (g) { g.computeBoundingBox(); box.union(g.boundingBox); });
    var size = box.getSize(new THREE.Vector3());
    var m = new THREE.Matrix4();
    var rot = new THREE.Matrix4().makeRotationY(opts.yaw || 0);
    var sz = opts.height ? opts.height / size.y : opts.length / Math.max(size.x, size.z);
    var c = box.getCenter(new THREE.Vector3());
    m.makeTranslation(-c.x, -box.min.y, -c.z);
    m.premultiply(rot).premultiply(new THREE.Matrix4().makeScale(sz, sz, sz));
    return m;
  }

  /** Hex (sRGB) → linear colour, so baked vertex colours match the art direction after output encoding. */
  function C(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  function factionTint(base, faction, amt) {
    return base.clone().lerp(C(faction), amt);
  }

  function makeBatch(geo, mat, cap) {
    var im = new THREE.InstancedMesh(geo, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false; // instances span the field; per-unit culling done by the engine
    im.castShadow = tier.shadows;
    im.receiveShadow = true;
    im.userData.v11 = true;
    im.visible = false;
    scene.add(im);
    batches.push(im);
    return im;
  }

  function stdMat(opts) {
    var m = new THREE.MeshStandardMaterial({
      vertexColors: !!opts.vertexColors, map: opts.map || null,
      roughness: opts.roughness != null ? opts.roughness : 0.62,
      metalness: opts.metalness != null ? opts.metalness : 0.2,
      envMapIntensity: opts.env != null ? opts.env : 0.85
    });
    if (opts.map) { opts.map.encoding = THREE.sRGBEncoding; }
    return m;
  }

  // ---------------------------------------------------------------- loading
  function load(url) {
    return new Promise(function (res, rej) {
      if (!THREE.GLTFLoader) return rej(new Error('no GLTFLoader'));
      new THREE.GLTFLoader().load(url, res, undefined, rej);
    });
  }

  function findClip(gltf, suffix) {
    var best = null;
    gltf.animations.forEach(function (a) {
      var nm = a.name.split('|').pop();
      if (nm === suffix) best = a;
    });
    return best;
  }

  /** Bake soldier poses. Returns a Promise; yields between clips so the page stays responsive. */
  function buildSoldier(gltf, bullCol, bearCol) {
    var root = gltf.scene;
    var mixer = new THREE.AnimationMixer(root);
    var meshes = [];
    root.traverse(function (o) { if (o.isMesh) meshes.push(o); });
    var factions = [bullCol, bearCol];
    function colorFor(m, f) {
      var name = (m.material && m.material.name) || '';
      var base = (m.material && m.material.color) ? m.material.color.clone() : new THREE.Color(1, 1, 1);
      if (name === 'Swat') return AR() ? C(RZ_GLB.soldier[f]) : factionTint(C(0x4f5644), factions[f], 0.14); // olive fatigues + faction
      if (name === 'Swat_Black') return C(0x23262a);                          // plate carrier / boots
      if (name === 'Visor') return C(f === 0 ? 0x2a9a90 : 0xa8452a).lerp(C(factions[f]), 0.4);
      return base;
    }
    var norm = null;
    var wrist = root.getObjectByName('Wrist.R');
    var H = null;
    // Original procedural carbine (project-authored): receiver, barrel, magazine, stock, optic.
    function rifleGeo(len) {
      var parts = [
        [new THREE.BoxGeometry(0.07, 0.11, 0.42), 0, 0, 0.05],
        [new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6).rotateX(Math.PI / 2), 0, 0.02, 0.43],
        [new THREE.BoxGeometry(0.05, 0.16, 0.08).rotateX(0.25), 0, -0.11, 0.1],
        [new THREE.BoxGeometry(0.06, 0.1, 0.22), 0, -0.02, -0.25],
        [new THREE.BoxGeometry(0.05, 0.06, 0.12), 0, 0.09, 0.06]
      ];
      var gs = parts.map(function (p) { var g = p[0].toNonIndexed(); g.translate(p[1], p[2], p[3]); return g; });
      var m = mergeGeos(gs.map(function (g) { g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(0.018), 3)); return g; }));
      m.scale(len, len, len);
      return m;
    }
    var rifleBase = null;
    var mats = factions.map(function () { return stdMat({ vertexColors: true, roughness: 0.72, metalness: 0.06, env: 0.7 }); });
    if (AR()) mats.forEach(function (m, f) { AR().patch(m, f === 0 ? -1 : 1, 'glbInf'); });
    soldierBatches = [[], []];
    var keys = Object.keys(CLIPS);
    var chain = Promise.resolve();
    keys.forEach(function (key, ci) {
      chain = chain.then(function () {
        return new Promise(function (res) { setTimeout(res, 0); });
      }).then(function () {
        var clip = findClip(gltf, CLIPS[key][0]) || findClip(gltf, 'Idle_Gun') || gltf.animations[0];
        var nPose = CLIPS[key][1];
        var action = mixer.clipAction(clip);
        action.play();
        soldierBatches[0][ci] = []; soldierBatches[1][ci] = [];
        var pChain = Promise.resolve();
        for (var p0 = 0; p0 < nPose; p0++) (function (p) { pChain = pChain.then(function () {
          return new Promise(function (r) { setTimeout(r, 0); }); // v11.1: yield per pose (short tasks)
        }).then(function () {
          mixer.setTime((p / nPose) * clip.duration);
          root.updateMatrixWorld(true);
          var geos = meshes.map(function (m) { return bakeMesh(m, colorFor(m, 0)); });
          if (H == null) { var bb = new THREE.Box3(); geos.forEach(function (g) { g.computeBoundingBox(); bb.union(g.boundingBox); }); H = bb.max.y - bb.min.y; }
          if (wrist) {
            if (!rifleBase) rifleBase = rifleGeo(H / 1.75);
            var w = new THREE.Vector3().setFromMatrixPosition(wrist.matrixWorld);
            var r = rifleBase.clone();
            var pitch = key === 'run' ? -0.55 : (key === 'walk' ? -0.25 : 0.0);
            r.rotateX(-pitch * 0.5);
            r.rotateY(key === 'run' ? 0.5 : 0.08);
            r.translate(w.x - H * 0.02, w.y + H * 0.01, w.z + H * 0.05);
            geos.push(r);
          }
          var g0 = mergeGeos(geos);
          if (!norm) norm = normalise([g0], { height: 1.32, yaw: 0 });
          g0.applyMatrix4(norm);
          g0.computeBoundingSphere();
          // faction 1 shares position/normal/index; only the colour attribute differs
          var c1 = new Float32Array(g0.attributes.color.array.length), off = 0;
          meshes.forEach(function (m, mi) {
            var col = colorFor(m, 1), n = geos[mi].attributes.position.count;
            for (var k = 0; k < n; k++) { c1[(off + k) * 3] = col.r; c1[(off + k) * 3 + 1] = col.g; c1[(off + k) * 3 + 2] = col.b; }
            off += n;
          });
          for (var rk = off * 3; rk < c1.length; rk++) c1[rk] = 0.018; // rifle
          var g1 = new THREE.BufferGeometry();
          g1.setAttribute('position', g0.attributes.position);
          g1.setAttribute('normal', g0.attributes.normal);
          g1.setAttribute('color', new THREE.BufferAttribute(c1, 3));
          g1.setIndex(g0.index);
          g1.boundingSphere = g0.boundingSphere;
          soldierBatches[0][ci][p] = { im: null, geo: g0, mat: mats[0] };
          soldierBatches[1][ci][p] = { im: null, geo: g1, mat: mats[1] };
          stats.bakeProgress = (stats.bakeProgress || 0) + 1;
        }); })(p0);
        return pChain.then(function () { action.stop(); });
      });
    });
    return chain;
  }

  /** Re-grade a colourful source atlas into muted military paint (desaturate + olive multiply). Cached per texture. */
  var _milCache = new Map();
  function militaryTexture(tex) {
    if (!tex || !tex.image) return tex;
    if (_milCache.has(tex)) return _milCache.get(tex);
    var out = tex;
    try {
      var img = tex.image, w = img.width, h = img.height;
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      var d = g.getImageData(0, 0, w, h), a = d.data;
      for (var i = 0; i < a.length; i += 4) {
        var l = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11;
        var k = 0.22; // keep 22% of original saturation
        var r = l + (a[i] - l) * k, gg = l + (a[i + 1] - l) * k, b = l + (a[i + 2] - l) * k;
        a[i] = r * 0.80; a[i + 1] = gg * 0.84; a[i + 2] = b * 0.70; // olive drab cast
      }
      g.putImageData(d, 0, 0);
      out = new THREE.CanvasTexture(cv);
      out.flipY = tex.flipY; out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
      out.encoding = THREE.sRGBEncoding; out.anisotropy = 4;
    } catch (_) { out = tex; }
    _milCache.set(tex, out);
    return out;
  }

  function buildVehicle(gltf, opts) {
    var root = gltf.scene;
    root.updateMatrixWorld(true);
    var flat = [], textured = [];
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var mat = o.material;
      if (mat && mat.map) textured.push({ mesh: o, mat: mat });
      else flat.push({ mesh: o, mat: mat });
    });
    var parts = [];
    var factions = [opts.bullCol, opts.bearCol];
    var allGeos = [];
    var perFaction = [[], []];
    [0, 1].forEach(function (f) {
      if (flat.length) {
        var geos = flat.map(function (e) {
          var nm = (e.mat && e.mat.name) || '';
          var c = e.mat && e.mat.color ? e.mat.color.clone() : new THREE.Color(1, 1, 1);
          if (/^Main(_Light)?$/.test(nm)) c = AR() ? C(RZ_GLB.veh[f]).multiplyScalar(nm === 'Main_Light' ? 1.12 : 1) : factionTint(C(opts.camo || 0x56604c), factions[f], 0.06);
          else if (nm === 'Main_Dark') c = C(0x2f342c);
          else if (nm === 'Wheels') c = C(0x1d1f21);
          else if (nm === 'Main_Details') c = C(0x3b3f3a);
          return bakeMesh(e.mesh, c);
        });
        var g = mergeGeos(geos);
        var fm = stdMat({ vertexColors: true, roughness: 0.55, metalness: 0.35, env: 1.0 });
        if (AR()) AR().patch(fm, f === 0 ? -1 : 1, 'glbVeh');
        perFaction[f].push({ geo: g, mat: fm, tex: false });
        allGeos.push(g);
      }
      textured.forEach(function (e) {
        var g2 = bakeMesh(e.mesh, null);
        var m2 = stdMat({ map: militaryTexture(e.mat.map), roughness: 0.58, metalness: 0.3, env: 1.0 });
        m2.color = AR() ? C(RZ_GLB.tex[f]) : factionTint(C(0xe2e4d8), factions[f], 0.1);
        if (AR()) AR().patch(m2, f === 0 ? -1 : 1, 'glbVeh');
        perFaction[f].push({ geo: g2, mat: m2, tex: true });
        allGeos.push(g2);
      });
    });
    var norm = normalise(allGeos.slice(0, perFaction[0].length), { length: opts.length, yaw: opts.yaw || 0 });
    [0, 1].forEach(function (f) { perFaction[f].forEach(function (p) { p.geo.applyMatrix4(norm); p.geo.computeBoundingSphere(); }); });
    if (AR() && opts.iff) addIffPanel(perFaction, factions, opts);
    return perFaction;
  }

  /** v12.0.14: small faction-coloured IFF roof panel, sitting on the highest roof area near the vehicle centre. */
  function addIffPanel(perFaction, factions, opts) {
    try {
      var all = perFaction[0].map(function (p) { return p.geo; });
      var box = new THREE.Box3();
      all.forEach(function (g) { g.computeBoundingBox(); box.union(g.boundingBox); });
      var size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      var roofY = box.min.y, rx = size.x * 0.18, rzz = size.z * 0.18;
      all.forEach(function (g) {
        var pa = g.attributes.position;
        for (var i = 0; i < pa.count; i++) {
          var x = pa.getX(i), z = pa.getZ(i);
          if (Math.abs(x - c.x) < rx && Math.abs(z - c.z - (opts.iffZ || 0) * size.z) < rzz) roofY = Math.max(roofY, pa.getY(i));
        }
      });
      if (roofY <= box.min.y) roofY = box.max.y;
      var w = Math.min(size.x, size.z) * 0.34;
      [0, 1].forEach(function (f) {
        var g = new THREE.BoxGeometry(w, 0.03, w * 0.7).toNonIndexed();
        g.translate(c.x, roofY + 0.016, c.z + (opts.iffZ || 0) * size.z);
        g.computeBoundingSphere();
        var m = AR().iffMaterial(factions[f]);
        perFaction[f].push({ geo: g, mat: m, tex: false, iff: true });
      });
      stats.iffPanels = (stats.iffPanels || 0) + 1;
    } catch (_) {}
  }

  function buildMortarGeo() {
    // Original procedural mortar (tube + baseplate + bipod) — project-authored geometry.
    var parts = [];
    var tube = new THREE.CylinderGeometry(0.055, 0.065, 0.78, 10); tube.rotateX(-0.95); tube.translate(0, 0.36, 0.05);
    var plate = new THREE.CylinderGeometry(0.2, 0.22, 0.05, 12); plate.translate(0, 0.03, -0.2);
    var legA = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 5); legA.rotateZ(0.35); legA.rotateX(0.3); legA.translate(0.1, 0.22, 0.32);
    var legB = legA.clone(); legB.translate(-0.2, 0, 0); legB.rotateZ(0);
    [tube, plate, legA, legB].forEach(function (g) { var n = g.toNonIndexed ? g : g; parts.push(n); });
    var geos = parts.map(function (g) {
      g = g.index ? g.toNonIndexed() : g;
      var c = new Float32Array(g.attributes.position.count * 3).fill(0.22);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.setIndex(null);
      return g;
    });
    return mergeGeos(geos);
  }

  function bake(soldierG, tankA, tankB, truck, pickup) {
    var bullCol = E.bullColor(), bearCol = E.bearColor();
    var caps = { soldier: 1500, veh: 160 };   // v11.3: room for 500-unit armies
    var soldierDone = !soldierG ? Promise.resolve() : buildSoldier(soldierG, bullCol, bearCol).then(function () {
      soldierBatches.forEach(function (byClip) {
        byClip.forEach(function (poses) {
          poses.forEach(function (b) { b.im = makeBatch(b.geo, b.mat, Math.ceil(caps.soldier / 3)); });
        });
      });
    });
    function veh(key, gltf, opts) {
      if (!gltf) return;
      var pf = buildVehicle(gltf, Object.assign({ bullCol: bullCol, bearCol: bearCol }, opts));
      vehBatches[key] = pf.map(function (parts) {
        return parts.map(function (p) { return makeBatch(p.geo, p.mat, caps.veh); });
      });
    }
    // Quaternius tanks face -X in the source, trucks face -Z; game forward is +Z.
    veh('tankA', tankA, { length: 2.75, yaw: Math.PI / 2, camo: 0x5b6450, iff: true });
    veh('tankB', tankB, { length: 2.6, yaw: Math.PI / 2, camo: 0x5d5a4a, iff: true });
    veh('ifv', truck, { length: 2.45, yaw: Math.PI, iff: true });
    veh('tech', pickup, { length: 2.2, yaw: Math.PI });
    var mg = buildMortarGeo();
    mortarBatch = makeBatch(mg, stdMat({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), 64);
    return soldierDone;
  }

  // ---------------------------------------------------------------- dust (soft billboard pool)
  function initDust() {
    var tex = LB.proctex && LB.proctex.smokePuff ? LB.proctex.smokePuff(THREE) : null;
    if (!tex) return;
    var pool = [];
    for (var i = 0; i < 48; i++) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xb9a587, transparent: true, opacity: 0, depthWrite: false, fog: true }));
      s.visible = false; s.userData.life = 0; scene.add(s); pool.push(s);
    }
    dust = { pool: pool, i: 0 };
  }
  function puff(x, y, z, size) {
    if (!dust || !tier.dust) return;
    var s = dust.pool[dust.i++ % dust.pool.length];
    s.position.set(x + (Math.random() - 0.5) * 0.3, y + 0.15, z + (Math.random() - 0.5) * 0.3);
    s.userData.life = s.userData.max = 1.1 + Math.random() * 0.6;
    s.userData.size = size || 0.7;
    s.visible = true;
  }
  function tickDust(dt) {
    if (!dust) return;
    for (var di = 0; di < dust.pool.length; di++) {
      var s = dust.pool[di];
      if (!s.visible) continue;
      s.userData.life -= dt;
      if (s.userData.life <= 0) { s.visible = false; continue; }
      var k = 1 - s.userData.life / s.userData.max;
      s.scale.setScalar(s.userData.size * (0.6 + k * 1.8));
      s.position.y += dt * 0.35;
      s.material.opacity = 0.42 * (1 - k) * Math.min(1, k * 6);
    }
  }

  // ---------------------------------------------------------------- per-frame
  function hideProcedural(u) {
    var ud = u.userData;
    if (ud.v11Hidden && ud.v11Stub === ud.impostorStub) return;
    u.traverse(function (o) {
      if (o === u) return;
      if (o.userData && o.userData.groundBlob) return;
      if (o.isMesh || o.isSprite || o.isLine) o.layers.set(HIDDEN_LAYER);
    });
    ud.v11Hidden = true;
    ud.v11Stub = ud.impostorStub;
    stats.hiddenProcedural++;
  }
  function showProcedural(u) {
    if (!u.userData.v11Hidden) return;
    u.traverse(function (o) { if (o.layers) o.layers.set(0); });
    u.userData.v11Hidden = false;
  }

  var _m = null, _off = null, _q = null, _q2 = null, _s = null, _p = null, _e = null;
  function pushAll(arr, mat) { for (var i = 0; i < arr.length; i++) push(arr[i], mat); }
  function push(im, mat) {
    if (!im || im.count >= im.instanceMatrix.count) return;
    im.setMatrixAt(im.count++, mat);
  }

  function clipFor(state, speed) {
    if (state === 'RUN' || speed > 2.2) return 2;
    if (state === 'WALK' || speed > 0.35) return 1;
    if (state === 'FIRE' || state === 'AIM') return 3;
    return 0;
  }

  function soldierAt(f, clipIdx, poseT, mat) {
    var poses = soldierBatches[f][clipIdx];
    var p = Math.floor(poseT) % poses.length;
    push(poses[p].im, mat);
    stats.soldiers++;
  }

  var mgTimer = 0, mortarClock = new WeakMap();

  var _lastT = 0;
  function update(dt) {
    if (!ready || disabled) return;
    var nowMs = performance.now();
    if (dt == null) { dt = _lastT ? Math.min(0.05, (nowMs - _lastT) / 1000) : 1 / 60; }
    _lastT = nowMs;
    var paused = E.isPaused && E.isPaused();
    var simDt = paused ? 0 : dt;
    var tn = q();
    if (tn !== tierName) applyTier(tn);
    var now = performance.now() * 0.001;
    for (var bi = 0; bi < batches.length; bi++) batches[bi].count = 0;
    stats.soldiers = stats.tanks = stats.ifv = stats.technicals = stats.mortars = 0;

    var armies = E.getArmies();
    var lists = [armies.bulls, armies.bears];
    var front = E.getFrontlineX ? E.getFrontlineX() : 0;
    mgTimer -= simDt;
    var fx = E.effects;

    var infTotal = (lists[0].length + lists[1].length) * 0.66;   // v11.3 escort thinning
    for (var f = 0; f < 2; f++) {
      var arr = lists[f];
      var infIdx = 0, armIdx = 0, artIdx = 0;
      for (var i = 0; i < arr.length; i++) {
        var u = arr[i];
        if (!u || !u.userData) continue;
        var ud = u.userData, t = ud.type | 0;
        if (t > 2 || ud.air) continue;
        if (t === 2) { // artillery stays procedural; add a mortar team beside it
          if (det(artIdx++, 5 + f) < tier.mortar) mortarTeam(u, f, now, simDt, fx, front);
          continue;
        }
        if (t === 0 && !soldierBatches) continue;
        if (t === 1 && !vehBatches.tankA) continue;
        hideProcedural(u);
        if (!u.visible) { if (t === 0) infIdx++; else armIdx++; continue; } // engine frustum-culled
        var st = unitState.get(u);
        if (!st) { st = { px: u.position.x, pz: u.position.z, sp: 0, ph: Math.random() * 8 }; unitState.set(u, st); }
        if (simDt > 0) {
          var dx = u.position.x - st.px, dz = u.position.z - st.pz;
          var inst = Math.sqrt(dx * dx + dz * dz) / simDt;
          st.sp += (Math.min(inst, 6) - st.sp) * Math.min(1, simDt * 6);
          st.px = u.position.x; st.pz = u.position.z;
        }
        u.updateMatrixWorld();
        if (t === 0) {
          var ci = clipFor(ud.animState, st.sp);
          if (st.rate == null) st.rate = AR() ? 0.84 + Math.random() * 0.32 : 1;   // v12.0.14 gait variety
          st.pose = (st.pose || st.ph) + simDt * tier.poseFps * (ci === 2 ? 1.25 : 1) * st.rate;
          soldierAt(f, ci, st.pose, u.matrixWorld);
          // v11.3: with big market armies the real units fill the field → thin out the visual escorts
          var escK = tier.infEscort * (infTotal > 280 ? 0.3 : infTotal > 140 ? 0.6 : 1);
          var nEsc = escK >= 1 ? Math.floor(escK) : (det(infIdx, 9) < escK ? 1 : 0);
          if (ud.wounded || ud.medic) nEsc = 0;
          for (var e = 0; e < nEsc; e++) escort(u, f, infIdx, e, ci, st);
          infIdx++;
        } else {
          var key = (armIdx % 3 === 2) ? 'ifv' : (f === 0 ? 'tankA' : 'tankB');
          if (!vehBatches[key]) key = 'tankA';
          pushAll(vehBatches[key][f], u.matrixWorld);
          if (key === 'ifv') { stats.ifv++; mgFire(u, f, front, fx, 0.9); } else stats.tanks++;
          if (st.sp > 0.4 && Math.random() < simDt * 5) puff(u.position.x, u.position.y, u.position.z, 0.9);
          if (det(armIdx, 13 + f) < tier.armorEscort * 0.5 && vehBatches.tech) technical(u, f, armIdx, front, fx, simDt);
          armIdx++;
        }
      }
    }
    for (var bj = 0; bj < batches.length; bj++) { var bb = batches[bj]; bb.visible = bb.count > 0; if (bb.count) bb.instanceMatrix.needsUpdate = true; }
    tickDust(simDt);
    stats.tier = tierName;
  }

  function localOffset(u, lx, lz, out) {
    // offset in unit local space (forward=+Z), snapped to terrain
    _p.set(lx, 0, lz).applyQuaternion(u.quaternion);
    out.x = u.position.x + _p.x; out.z = u.position.z + _p.z;
    out.y = E.terrainHeight(out.x, out.z);
    return out;
  }

  var _tmpPos = { x: 0, y: 0, z: 0 };
  function escort(u, f, idx, e, ci, st) {
    var lx = (e === 0 ? 1 : -1) * (0.75 + det(idx, 21 + e) * 0.5);
    var lz = -0.5 - det(idx, 31 + e) * 0.9;
    localOffset(u, lx, lz, _tmpPos);
    _q.copy(u.quaternion);
    _e.set(0, (det(idx, 41 + e) - 0.5) * 0.4, 0);
    _q.multiply(_q2.setFromEuler(_e));
    _m.compose(_off.set(_tmpPos.x, _tmpPos.y, _tmpPos.z), _q, _s.set(1, 1, 1).multiplyScalar(0.94 + det(idx, 51 + e) * 0.1));
    var eci = ci === 0 && det(idx, 61 + e) < 0.35 ? 3 : ci; // some escorts fire while the leader idles
    soldierAt(f, eci, (st.pose || 0) + 2.3 * (e + 1), _m);
  }

  function technical(u, f, idx, front, fx, simDt) {
    if (AR() && u.userData.home && u.userData.home.rz) localOffset(u, 4.3, -0.4, _tmpPos);   // v12.0.14: in the gap between tanks
    else localOffset(u, 1.9 * (idx % 2 ? 1 : -1), -2.6, _tmpPos);
    _m.compose(_off.set(_tmpPos.x, _tmpPos.y, _tmpPos.z), u.quaternion, _s.set(1, 1, 1));
    pushAll(vehBatches.tech[f], _m);
    stats.technicals++;
  }

  function mgFire(u, f, front, fx, gunH) {
    if (!fx || !fx.fireWeapon || mgTimer > 0 || Math.random() > 0.08 * tier.mg) return;
    if (E.isPaused && E.isPaused()) return;
    mgTimer = 0.18;
    var side = f === 0 ? -1 : 1;
    var from = { x: u.position.x - side * 0.4, y: u.position.y + gunH + 0.55, z: u.position.z };
    var tx = front + -side * (3 + Math.random() * 6);
    var to = { x: tx, z: u.position.z + (Math.random() - 0.5) * 5 };
    for (var k = 0; k < 3; k++) {
      (function (k) {
        setTimeout(function () {
          try { fx.fireWeapon({ from: from, to: { x: to.x + k * 0.2, z: to.z + (Math.random() - 0.5) }, kind: 'tracer', color: f === 0 ? 0xffe9a0 : 0xffb07a, power: 0.35, visualScale: 0.7 }); } catch (_) {}
        }, k * 70);
      })(k);
    }
  }

  function mortarTeam(u, f, now, simDt, fx, front) {
    if (!soldierBatches || !mortarBatch || !u.visible) return;
    var side = f === 0 ? -1 : 1;
    // team sits 2.2 m to the side of the gun, facing the enemy
    localOffset(u, 2.2, -0.4, _tmpPos);
    var bx = _tmpPos.x, by = _tmpPos.y, bz = _tmpPos.z;
    _m.compose(_off.set(bx, by, bz), u.quaternion, _s.set(1.15, 1.15, 1.15));
    push(mortarBatch, _m);
    var st = mortarClock.get(u);
    if (!st) { st = { t: 2 + Math.random() * 6, pose: Math.random() * 6 }; mortarClock.set(u, st); }
    st.t -= simDt; st.pose += simDt * tier.poseFps;
    var firing = st.t < 0.6;
    localOffset(u, 2.55, -0.85, _tmpPos);
    _m.compose(_off.set(_tmpPos.x, _tmpPos.y, _tmpPos.z), u.quaternion, _s.set(1, 1, 1));
    soldierAt(f, firing ? 3 : 0, st.pose, _m);
    localOffset(u, 1.75, -0.95, _tmpPos);
    _m.compose(_off.set(_tmpPos.x, _tmpPos.y, _tmpPos.z), u.quaternion, _s.set(0.97, 0.97, 0.97));
    soldierAt(f, 0, st.pose + 3, _m);
    stats.mortars++;
    if (st.t <= 0 && fx && fx.fireWeapon && simDt > 0) {
      st.t = 6 + Math.random() * 6;
      var tx = front - side * (4 + Math.random() * 9);
      var tz = bz + (Math.random() - 0.5) * 10;
      try {
        fx.fireWeapon({
          from: { x: bx, y: by + 0.75, z: bz }, to: { x: tx, z: tz }, kind: 'arty', power: 0.35,
          color: 0xffd9a0, visualScale: 0.6,
          onHit: function () {
            try { if (fx.scorchDecal) fx.scorchDecal(tx, tz, 0.55); } catch (_) {}
            for (var d = 0; d < 3; d++) puff(tx, E.terrainHeight(tx, tz), tz, 1.2);
          }
        });
      } catch (_) {}
    }
  }

  function applyTier(name) {
    tierName = name;
    tier = TIER[name] || TIER.HIGH;
    batches.forEach(function (b) { b.castShadow = tier.shadows; });
  }

  function setEnabled(on) {
    disabled = !on;
    var armies = E && E.getArmies ? E.getArmies() : null;
    batches.forEach(function (b) { b.visible = false; b.count = 0; });
    if (!armies) return;
    if (!on) armies.bulls.concat(armies.bears).forEach(showProcedural);
  }

  function init(engine) {
    if (ready || failed || !engine || !engine.THREE) return;
    E = engine; THREE = engine.THREE; scene = engine.scene;
    _m = new THREE.Matrix4(); _off = new THREE.Vector3(); _q = new THREE.Quaternion(); _q2 = new THREE.Quaternion(); _s = new THREE.Vector3(); _p = new THREE.Vector3(); _e = new THREE.Euler();
    if (disabled) return;
    applyTier(q());
    var t0 = performance.now();
    function opt(p) { return p.catch(function (e) { console.warn('[v11] model failed, keeping procedural:', e && e.message); return null; }); }
    Promise.all(['soldier', 'tank_a', 'tank_b', 'truck_armored', 'pickup_armored'].map(function (n) {
      return opt(load(BASE + n + '.glb?v=20261010v111'));
    })).then(function (g) {
      return bake(g[0], g[1], g[2], g[3], g[4]);
    }).then(function () {
      initDust();
      ready = true;
      stats.loaded = true;
      stats.bakeMs = Math.round(performance.now() - t0);
      // quick sanity for the rebuild path (token switch etc.)
    }).catch(function (e) {
      failed = true;
      console.warn('[v11] skin layer disabled:', e);
    });
  }

  LB.v11 = {
    version: VERSION,
    init: init,
    update: update,
    setEnabled: setEnabled,
    isReady: function () { return ready; },
    isSettled: function () { return ready || failed || disabled || !E; },
    getStats: function () { var s = Object.assign({}, stats); s.batches = batches.length; s.drawn = batches.filter(function (b) { return b.visible; }).length; return s; },
    TIER: TIER
  };
})(window);
