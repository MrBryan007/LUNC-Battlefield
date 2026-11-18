/* LUNC Battlefield v12 (starter) — GLB skin layer for structures + aircraft.
 *
 * Purely VISUAL, same contract as js/v11-units.js:
 *  - Procedural meshes are never removed. When a GLB skin is attached, the procedural meshes move to camera
 *    layer 1 (hidden but alive), so LOD, damage overlays, muzzles, Commander hit tests and the market-driven
 *    frontline are untouched. Damage overlay meshes (damagedMesh / criticalMesh) stay on layer 0.
 *  - Any model that fails to load → that kind stays procedural (SAFE FALLBACK).
 *  - LOW tier = procedural only (skins removed live when switching to LOW). ?v12=0 disables the layer.
 *  - Moon Shot / Commander / effects are not touched.
 * Aircraft: heli body → GLB, procedural rotor disc kept (it is what animations.js spins).
 *           jets stay procedural (no verified CC0 jet yet) but get an additive afterburner glow on MEDIUM+.
 * Assets: assets/models/v12/*.glb, all CC0 — see docs/ASSET-LICENSES.md.
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle || (global.LUNCBattle = {});
  var BASE = 'assets/models/v12/';
  var CB = '?v=20261012v12a';
  var HIDDEN_LAYER = 1;
  var qs = (function () { try { return new URLSearchParams(location.search); } catch (_) { return { get: function () { return null; } }; } })();
  var disabled = qs.get('v12') === '0';

  // Skin registry: building kind / unit type → GLB + fit rules. fit: 'footprint' scales to the procedural
  // building's XZ extent; height is clamped to hMul × procedural height so silhouettes stay readable.
  var SKINS = {
    'building.bunker': { file: 'bunker_sandbag.glb', fit: 'footprint', pad: 1.15, hMul: 1.4, tint: 0.05, yaw: 0 },
    'building.radar':  { file: 'radar.glb',          fit: 'footprint', pad: 1.6,  hMul: 1.3, tint: 0.08, yaw: 0 },
    'building.tower':  { file: 'watchtower.glb',     fit: 'height',    pad: 1.0,  hMul: 1.0, tint: 0.06, yaw: 0 },
    'unit.heli':       { file: 'helicopter.glb',     length: 2.1, tint: 0.35, yaw: 0 }
  };
  var TIERS = { LOW: false, MEDIUM: true, HIGH: true, ULTRA: true };

  var E = null, THREE = null, scene = null;
  var models = {}, ready = false, active = false;
  var skinned = [];             // { host, skin, hidden:[meshes], kind }
  var jetGlows = [];            // { unit, sprite }
  var glowMat = null;
  var stats = { loaded: [], failed: [], buildings: 0, helis: 0, jetGlows: 0, tier: '' };

  function q() { return LB.quality && LB.quality.getEffectiveName ? LB.quality.getEffectiveName() : 'HIGH'; }

  function load(file) {
    return new Promise(function (res, rej) {
      if (!THREE.GLTFLoader) return rej(new Error('no GLTFLoader'));
      new THREE.GLTFLoader().load(BASE + file + CB, res, undefined, rej);
    });
  }

  /** Bake a GLB scene into a normalised template: centred on XZ, sitting on y=0, unit-size bbox recorded. */
  function template(gltf, yaw) {
    var root = gltf.scene;
    root.updateMatrixWorld(true);
    var holder = new THREE.Group();
    var inner = root.clone(true);
    if (yaw) inner.rotation.y = yaw;
    holder.add(inner);
    holder.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(holder);
    var size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    inner.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      var m = o.material;
      if (m && m.isMeshStandardMaterial) { m.envMapIntensity = 0.8; m.roughness = Math.max(0.5, m.roughness); }
    });
    return { node: holder, size: size };
  }

  function tintedClone(t, color, amt) {
    var n = t.node.clone(true);
    var col = new THREE.Color(color);
    n.traverse(function (o) {
      if (!o.isMesh || !o.material) return;
      o.material = o.material.clone();
      if (o.material.color && amt) o.material.color.lerp(col, amt);
    });
    n.userData.v12Skin = true;
    return n;
  }

  function hideProcedural(host, keep) {
    var hidden = [];
    host.traverse(function (o) {
      if (o === host || o.userData.v12Skin) return;
      if (keep && keep.indexOf(o) >= 0) return;
      if ((o.isMesh || o.isSprite || o.isLine || o.isInstancedMesh) && o.layers.mask & 1) {
        // never hide damage overlays or anything inside a skin
        var p = o, inSkin = false;
        while (p && p !== host) { if (p.userData && p.userData.v12Skin) { inSkin = true; break; } p = p.parent; }
        if (inSkin) return;
        o.layers.set(HIDDEN_LAYER); hidden.push(o);
      }
    });
    return hidden;
  }
  function collectKeep(host) {
    var keep = [];
    [host.userData.damagedMesh, host.userData.criticalMesh].forEach(function (m) {
      if (m) m.traverse(function (o) { keep.push(o); });
    });
    return keep;
  }

  // ------------------------------------------------------------ buildings
  function localBox(host) {
    // procedural extent in the host's local space (before skin is added)
    var inv = new THREE.Matrix4().copy(host.matrixWorld).invert();
    var box = new THREE.Box3(), tmp = new THREE.Box3();
    host.updateMatrixWorld(true);
    host.traverse(function (o) {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
      box.union(tmp);
    });
    return box;
  }

  function skinBuilding(host) {
    var key = 'building.' + host.userData.kind;
    var spec = SKINS[key], t = models[key];
    if (!spec || !t || host.userData.v12Skinned) return;
    var pb = localBox(host);
    if (pb.isEmpty()) return;
    var ps = pb.getSize(new THREE.Vector3());
    var s;
    if (spec.fit === 'height') s = ps.y / t.size.y;
    else s = Math.max(ps.x, ps.z) * spec.pad / Math.max(t.size.x, t.size.z);
    if (spec.fit !== 'height') s = Math.min(s, ps.y * spec.hMul / t.size.y);
    var skin = tintedClone(t, host.userData.side < 0 ? 0x49d39a : 0xe4675f, spec.tint);
    skin.scale.setScalar(s);
    skin.position.set((pb.min.x + pb.max.x) / 2, pb.min.y, (pb.min.z + pb.max.z) / 2);
    if (host.userData.side > 0) skin.rotation.y = Math.PI; // face the front for both factions
    var hidden = hideProcedural(host, collectKeep(host));
    host.add(skin);
    host.userData.v12Skinned = true;
    skinned.push({ host: host, skin: skin, hidden: hidden, kind: key });
    stats.buildings++;
  }

  function findBuildings() {
    var out = [];
    scene.traverse(function (o) {
      if (o.userData && o.userData.kind && o.userData.damageState && SKINS['building.' + o.userData.kind]) out.push(o);
    });
    return out;
  }

  // ------------------------------------------------------------ aircraft
  function skinHeli(u) {
    var t = models['unit.heli'], spec = SKINS['unit.heli'];
    var parts = u.userData.parts;
    if (!t || !parts || !parts.cabin || u.userData.v12Skinned) return;
    var skin = tintedClone(t, u.userData.side < 0 ? 0x49d39a : 0xe4675f, spec.tint);
    var horiz = Math.max(t.size.x, t.size.z);
    skin.scale.setScalar(spec.length / horiz);
    if (t.size.z > t.size.x) skin.rotation.y = Math.PI / 2; // align long axis to +x (procedural nose direction)
    skin.position.y = 0.12;
    var hidden = hideProcedural(parts.cabin);
    (parts.pods || []).forEach(function (p) { if (p && p.isMesh && (p.layers.mask & 1)) { p.layers.set(HIDDEN_LAYER); hidden.push(p); } });
    u.add(skin);
    u.userData.v12Skinned = true;
    skinned.push({ host: u, skin: skin, hidden: hidden, kind: 'unit.heli' });
    stats.helis++;
  }

  function addJetGlow(u) {
    if (u.userData.v12Glow) return;
    var parts = u.userData.parts;
    var eng = parts && parts.engines && parts.engines[0];
    if (!eng || !eng.geometry) return;
    if (!glowMat) {
      glowMat = new THREE.SpriteMaterial({
        map: LB.proctex && LB.proctex.softDot ? LB.proctex.softDot(THREE) : null,
        color: 0xffa040, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending
      });
    }
    if (!eng.geometry.boundingBox) eng.geometry.computeBoundingBox();
    var bb = eng.geometry.boundingBox;
    var sp = new THREE.Sprite(glowMat);
    sp.position.set(bb.min.x - 0.12, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2);
    sp.scale.setScalar(0.55);
    sp.userData.v12Skin = true;
    eng.parent.add(sp);
    u.userData.v12Glow = sp;
    jetGlows.push({ unit: u, sprite: sp });
    stats.jetGlows++;
  }

  // ------------------------------------------------------------ lifecycle
  function unskinAll() {
    skinned.forEach(function (s) {
      s.hidden.forEach(function (o) { o.layers.set(0); });
      if (s.skin.parent) s.skin.parent.remove(s.skin);
      s.host.userData.v12Skinned = false;
    });
    jetGlows.forEach(function (g) { if (g.sprite.parent) g.sprite.parent.remove(g.sprite); g.unit.userData.v12Glow = null; });
    skinned = []; jetGlows = [];
    stats.buildings = stats.helis = stats.jetGlows = 0;
  }

  var buildingsDone = false, scanT = 0;
  function update() {
    if (!ready || disabled || !E) return;
    var tierName = q();
    var want = !!TIERS[tierName];
    stats.tier = tierName;
    if (!want) { if (active) { unskinAll(); active = false; buildingsDone = false; } return; }
    active = true;
    if (!buildingsDone) { findBuildings().forEach(skinBuilding); buildingsDone = true; }
    // army scan is cheap but not needed every frame: units are rebuilt on token switch / count sync
    var now = performance.now();
    if (now - scanT > 500) {
      scanT = now;
      var a = E.getArmies();
      var all = a.bulls.concat(a.bears);
      for (var i = 0; i < all.length; i++) {
        var u = all[i]; if (!u || !u.userData) continue;
        if (u.userData.type === 3) skinHeli(u);
        else if (u.userData.type === 4) addJetGlow(u);
      }
      // drop records for removed units (token switch rebuilds armies)
      skinned = skinned.filter(function (s) { return s.kind !== 'unit.heli' || s.host.parent; });
      jetGlows = jetGlows.filter(function (g) { return g.unit.parent; });
    }
    // afterburner flicker (visual only)
    for (var j = 0; j < jetGlows.length; j++) {
      var g = jetGlows[j], sp = g.sprite;
      var f = 0.85 + Math.sin(now * 0.031 + j * 1.7) * 0.1 + Math.random() * 0.08;
      sp.scale.set(0.62 * f, 0.42 * f, 1);
      sp.material.opacity = 0.75;
    }
  }

  function init(engine) {
    if (ready || !engine || !engine.THREE || disabled) return;
    E = engine; THREE = engine.THREE; scene = engine.scene;
    var keys = Object.keys(SKINS);
    Promise.all(keys.map(function (k) {
      return load(SKINS[k].file).then(function (g) { models[k] = template(g, SKINS[k].yaw); stats.loaded.push(k); })
        .catch(function (e) { stats.failed.push(k); console.warn('[v12] skin failed, keeping procedural:', k, e && e.message); });
    })).then(function () { ready = true; });
  }

  LB.v12 = {
    init: init,
    update: update,
    setEnabled: function (on) { disabled = !on; if (!on) { unskinAll(); active = false; buildingsDone = false; } },
    isReady: function () { return ready; },
    getStats: function () { return JSON.parse(JSON.stringify(stats)); },
    SKINS: SKINS
  };
})(window);
