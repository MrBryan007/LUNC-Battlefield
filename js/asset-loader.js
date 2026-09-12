/* LUNC Battlefield v9.3 — professional glTF/GLB asset pipeline
 * Three.js r128 GLTFLoader (CDN examples). Procedural SAFE FALLBACK forever.
 * Modes: ?assets=procedural | ?assets=gltf | default AUTO
 * Progressive: never block first paint; missing/failed → procedural.
 */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle || (global.LUNCBattle = {});

  var THREE_REF = null;
  var loader = null;
  var mode = 'AUTO'; // PROCEDURAL | GLTF | AUTO
  var cache = Object.create(null); // id -> { status, scene, error, tris, entry, loadedAt }
  var pending = Object.create(null); // id -> Promise
  var stats = {
    loaded: 0,
    failed: 0,
    pending: 0,
    instantiated: 0,
    proceduralSpawns: 0,
    gltfSpawns: 0,
    approxTris: 0
  };
  var ktx2Stub = { ready: false, note: 'KTX2Loader not wired in v9.3 — r128 path unchanged' };
  var dracoStub = { ready: false, note: 'DRACOLoader not wired in v9.3' };
  var meshoptStub = { ready: false, note: 'MeshoptDecoder not wired in v9.3' };
  var skeletonUtilsNote =
    'SkeletonUtils.clone deferred — v9.3 uses Object3D.clone(); skinned meshes need SkeletonUtils later';
  var hotSwapEnabled = false; // documented skip — unsafe without anim retarget
  var preloadStarted = false;

  function resolveModeFromUrl() {
    try {
      var q = new URLSearchParams(location.search).get('assets');
      if (!q) return 'AUTO';
      q = String(q).toLowerCase();
      if (q === 'procedural' || q === 'proc' || q === 'off' || q === '0') return 'PROCEDURAL';
      if (q === 'gltf' || q === 'glb' || q === 'on' || q === '1') return 'GLTF';
      if (q === 'auto') return 'AUTO';
    } catch (_) {}
    return 'AUTO';
  }

  function getRegistry() {
    var reg = LB.assetRegistry;
    if (!reg || !reg.REGISTRY) return {};
    return reg.REGISTRY;
  }

  function getEntry(id) {
    if (LB.assetRegistry && LB.assetRegistry.get) return LB.assetRegistry.get(id);
    return getRegistry()[id] || null;
  }

  function qualityName() {
    try {
      if (LB.quality && LB.quality.getEffectivePreset) {
        var p = LB.quality.getEffectivePreset();
        return (p && (p.unitDetail || p.structureDetail || p.name)) || 'high';
      }
      if (LB.quality && LB.quality.getState) {
        return LB.quality.getState().effective || 'HIGH';
      }
    } catch (_) {}
    return 'HIGH';
  }

  function preferSimplerAssets() {
    var q = String(qualityName()).toLowerCase();
    if (q.indexOf('low') >= 0 || q.indexOf('medium') >= 0 || q.indexOf('med') >= 0) return true;
    try {
      if (innerWidth < 760) return true;
    } catch (_) {}
    return false;
  }

  /** LOW/MEDIUM / mobile prefer procedural unless mode is forced GLTF and asset ready. */
  function shouldPreferProceduralForQuality(entry) {
    if (mode === 'PROCEDURAL') return true;
    if (mode === 'GLTF') return false;
    // AUTO: on LOW/MEDIUM skip giant LOD0 GLBs when no simpler lodPaths
    if (preferSimplerAssets()) {
      if (entry && entry.lodPaths && entry.lodPaths.lod1) return false;
      // Prefer procedural for units/structures on low/med — props may still load
      if (entry && (entry.type === 'unit' || entry.type === 'vehicle' ||
          entry.type === 'artillery' || entry.type === 'structure')) {
        return true;
      }
    }
    return false;
  }

  function resolvePath(entry) {
    if (!entry || !entry.path) return null;
    if (preferSimplerAssets() && entry.lodPaths) {
      if (entry.lodPaths.lod2) return entry.lodPaths.lod2;
      if (entry.lodPaths.lod1) return entry.lodPaths.lod1;
    }
    return entry.path;
  }

  function countTris(root) {
    var tris = 0;
    if (!root || !root.traverse) return 0;
    root.traverse(function (obj) {
      if (!obj.isMesh || !obj.geometry) return;
      var g = obj.geometry;
      if (g.index && g.index.count) tris += g.index.count / 3;
      else if (g.attributes && g.attributes.position) tris += g.attributes.position.count / 3;
    });
    return Math.round(tris);
  }

  function applyQualityShadows(root) {
    if (!root || !root.traverse) return;
    var q = String(qualityName()).toLowerCase();
    var castMode = 'important';
    try {
      if (LB.quality && LB.quality.getEffectivePreset) {
        castMode = LB.quality.getEffectivePreset().shadowCast || castMode;
      }
    } catch (_) {}

    var meshIndex = 0;
    root.traverse(function (obj) {
      if (!obj.isMesh) return;
      meshIndex++;
      // Always receive on ground-contact meshes lightly
      obj.receiveShadow = true;
      if (q.indexOf('low') >= 0 || castMode === 'off' || castMode === 'major') {
        // LOW / minimal: only first/root-ish mesh casts
        obj.castShadow = meshIndex === 1;
      } else if (q.indexOf('medium') >= 0 || castMode === 'bases') {
        // MEDIUM: important meshes only (first few)
        obj.castShadow = meshIndex <= 2;
      } else {
        // HIGH / ULTRA: richer but still not every tiny child blindly if many
        obj.castShadow = meshIndex <= 8;
      }
    });
  }

  function applyRegistryNormalization(root, entry) {
    if (!root || !entry) return root;
    var g = root;
    if (entry.scale != null && entry.scale !== 1) {
      var s = entry.scale;
      if (typeof s === 'number') g.scale.setScalar(s);
      else if (Array.isArray(s)) g.scale.set(s[0] || 1, s[1] || 1, s[2] || 1);
    }
    if (entry.rotation && Array.isArray(entry.rotation)) {
      g.rotation.set(
        entry.rotation[0] || 0,
        entry.rotation[1] || 0,
        entry.rotation[2] || 0
      );
    }
    if (entry.positionOffset && Array.isArray(entry.positionOffset)) {
      g.position.x += entry.positionOffset[0] || 0;
      g.position.y += entry.positionOffset[1] || 0;
      g.position.z += entry.positionOffset[2] || 0;
    }
    if (entry.groundOffset) {
      g.position.y += entry.groundOffset;
    }
    return g;
  }

  /**
   * Preserve authored PBR; optional faction emissive accent tint via materials helpers.
   * Does NOT flatten MeshStandard/PBR into basic mats.
   */
  function applyOptionalFactionAccent(root, opts) {
    opts = opts || {};
    if (!opts.accentColor && opts.color == null) return;
    var color = opts.accentColor != null ? opts.accentColor : opts.color;
    var boost = opts.emissiveBoost != null ? opts.emissiveBoost : 0.06;
    var Mats = LB.materials;
    root.traverse(function (obj) {
      if (!obj.isMesh || !obj.material) return;
      var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(function (m) {
        if (!m) return;
        // Keep metallicRoughness / maps; only nudge emissive toward faction accent
        try {
          if (m.emissive && m.emissive.setHex && typeof color === 'number') {
            // Soft blend: don't overwrite authored emissive entirely
            var existing = m.emissive.getHex ? m.emissive.getHex() : 0;
            if (!existing) m.emissive.setHex(color);
            if (m.emissiveIntensity != null) {
              m.emissiveIntensity = Math.max(m.emissiveIntensity || 0, boost);
            }
            m.userData = m.userData || {};
            m.userData.luncFactionTint = true;
          }
        } catch (_) {}
      });
    });
    // Optional helper registration (does not replace mesh materials)
    if (Mats && Mats.factionAccent && opts.side != null && typeof color === 'number') {
      try {
        Mats.factionAccent(opts.side, color, boost, { forceNew: false });
      } catch (_) {}
    }
  }

  function ensureLoader() {
    if (loader) return loader;
    if (!THREE_REF) return null;
    if (typeof THREE_REF.GLTFLoader !== 'function') {
      console.warn('[LUNCBattle.assets] THREE.GLTFLoader missing — procedural only');
      return null;
    }
    loader = new THREE_REF.GLTFLoader();
    // Stubs for future decompressors (not attached — no third-party wasm in v9.3)
    loader.userData = loader.userData || {};
    loader.userData.ktx2 = ktx2Stub;
    loader.userData.draco = dracoStub;
    loader.userData.meshopt = meshoptStub;
    return loader;
  }

  function setCacheStatus(id, patch) {
    if (!cache[id]) {
      cache[id] = {
        status: 'idle',
        scene: null,
        error: null,
        tris: 0,
        entry: getEntry(id),
        loadedAt: 0
      };
    }
    Object.keys(patch).forEach(function (k) { cache[id][k] = patch[k]; });
    return cache[id];
  }

  function recomputeStats() {
    var loaded = 0, failed = 0, pend = 0, tris = 0;
    Object.keys(cache).forEach(function (id) {
      var c = cache[id];
      if (c.status === 'ready') { loaded++; tris += c.tris || 0; }
      else if (c.status === 'failed') failed++;
      else if (c.status === 'loading') pend++;
    });
    stats.loaded = loaded;
    stats.failed = failed;
    stats.pending = pend;
    stats.approxTris = tris;
  }

  function init(THREE) {
    THREE_REF = THREE || global.THREE;
    mode = resolveModeFromUrl();
    ensureLoader();
    // Seed cache entries as idle for known registry
    var reg = getRegistry();
    Object.keys(reg).forEach(function (id) {
      if (!cache[id]) setCacheStatus(id, { status: 'idle', entry: reg[id] });
    });
    recomputeStats();
    return {
      mode: mode,
      loaderReady: !!loader,
      gltfLoader: typeof (THREE_REF && THREE_REF.GLTFLoader) === 'function',
      version: 'v9.3'
    };
  }

  function getStatus(id) {
    var c = cache[id];
    if (!c) {
      var entry = getEntry(id);
      if (!entry) return { status: 'unknown', entry: null };
      return { status: 'idle', entry: entry };
    }
    return {
      status: c.status,
      error: c.error,
      tris: c.tris,
      entry: c.entry || getEntry(id),
      loadedAt: c.loadedAt
    };
  }

  function get(id) {
    var c = cache[id];
    return c && c.status === 'ready' ? c.scene : null;
  }

  function isReady(id) {
    return !!(cache[id] && cache[id].status === 'ready' && cache[id].scene);
  }

  /**
   * Whether instantiate should attempt GLB for this id under current mode/quality.
   */
  function shouldUseGltf(id) {
    if (mode === 'PROCEDURAL') return false;
    var entry = getEntry(id);
    if (!entry || !entry.path) return false;
    if (shouldPreferProceduralForQuality(entry)) return false;
    // AUTO skips smoke-test placeholder boxes — keep articulated procedural as default visual
    // Force ?assets=gltf to exercise the real GLB instantiate path for pipeline verification
    if (mode === 'AUTO' && entry.smokeTest) return false;
    if (mode === 'GLTF') return isReady(id); // only if already loaded — never block
    // AUTO + production-ready assets
    return isReady(id);
  }

  function loadAsset(id) {
    var entry = getEntry(id);
    if (!entry) {
      return Promise.resolve({ ok: false, id: id, error: 'unknown id', status: 'failed' });
    }
    if (mode === 'PROCEDURAL') {
      setCacheStatus(id, { status: 'skipped', error: 'mode=PROCEDURAL' });
      return Promise.resolve({ ok: false, id: id, error: 'procedural mode', status: 'skipped' });
    }
    if (!entry.path) {
      setCacheStatus(id, { status: 'failed', error: 'empty path' });
      stats.failed++;
      recomputeStats();
      return Promise.resolve({ ok: false, id: id, error: 'empty path', status: 'failed' });
    }
    if (cache[id] && cache[id].status === 'ready') {
      return Promise.resolve({ ok: true, id: id, scene: cache[id].scene, status: 'ready' });
    }
    if (pending[id]) return pending[id];

    var ldr = ensureLoader();
    if (!ldr) {
      setCacheStatus(id, { status: 'failed', error: 'GLTFLoader unavailable' });
      recomputeStats();
      return Promise.resolve({ ok: false, id: id, error: 'GLTFLoader unavailable', status: 'failed' });
    }

    setCacheStatus(id, { status: 'loading', error: null, entry: entry });
    stats.pending++;
    recomputeStats();

    var url = resolvePath(entry);
    var bust = '';
    try {
      if (LB.config && LB.config.BUILD) bust = (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(LB.config.BUILD);
    } catch (_) {}

    pending[id] = new Promise(function (resolve) {
      try {
        ldr.load(
          url + bust,
          function (gltf) {
            delete pending[id];
            var scene = gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]));
            if (!scene) {
              setCacheStatus(id, { status: 'failed', error: 'empty gltf scene' });
              recomputeStats();
              resolve({ ok: false, id: id, error: 'empty scene', status: 'failed' });
              return;
            }
            // Store template; clones happen on instantiate
            scene.userData = scene.userData || {};
            scene.userData.luncAssetId = id;
            scene.userData.luncGltf = true;
            var tris = countTris(scene);
            setCacheStatus(id, {
              status: 'ready',
              scene: scene,
              error: null,
              tris: tris,
              entry: entry,
              loadedAt: Date.now(),
              animations: (gltf && gltf.animations) || []
            });
            recomputeStats();
            resolve({ ok: true, id: id, scene: scene, status: 'ready', tris: tris });
          },
          undefined,
          function (err) {
            delete pending[id];
            var msg = (err && err.message) ? err.message : String(err || 'load failed');
            setCacheStatus(id, { status: 'failed', error: msg });
            recomputeStats();
            resolve({ ok: false, id: id, error: msg, status: 'failed' });
          }
        );
      } catch (e) {
        delete pending[id];
        var msg2 = (e && e.message) ? e.message : String(e);
        setCacheStatus(id, { status: 'failed', error: msg2 });
        recomputeStats();
        resolve({ ok: false, id: id, error: msg2, status: 'failed' });
      }
    });
    return pending[id];
  }

  function preload(ids) {
    ids = ids || [];
    if (mode === 'PROCEDURAL') {
      return Promise.resolve({ mode: mode, results: [] });
    }
    var list = ids.length ? ids.slice() : Object.keys(getRegistry()).filter(function (id) {
      var e = getEntry(id);
      return e && e.path;
    });
    // Mobile / LOW: only a tiny set
    if (preferSimplerAssets() && !ids.length) {
      list = list.filter(function (id) {
        return id.indexOf('prop.') === 0 || id.indexOf('.hq') > 0;
      }).slice(0, 4);
    }
    preloadStarted = true;
    return Promise.all(list.map(function (id) { return loadAsset(id); })).then(function (results) {
      return { mode: mode, results: results };
    });
  }

  /**
   * Clone a ready asset. Uses Object3D.clone (r128).
   * NOTE: skinned/rigged meshes need THREE.SkeletonUtils.clone later — see skeletonUtilsNote.
   */
  function cloneTemplate(template) {
    if (!template) return null;
    // Stub note retained on clones
    var cloned = template.clone(true);
    cloned.userData = cloned.userData || {};
    cloned.userData.luncClone = true;
    cloned.userData.skeletonUtilsNote = skeletonUtilsNote;
    return cloned;
  }

  /**
   * Instantiate a ready asset into a Group wrapper with registry normalization.
   * Returns null if not ready — caller MUST fall back to procedural.
   */
  function instantiate(id, opts) {
    opts = opts || {};
    if (!shouldUseGltf(id) && mode !== 'GLTF') {
      return null;
    }
    if (!isReady(id)) {
      return null;
    }
    var entry = getEntry(id);
    var template = cache[id].scene;
    var cloned = cloneTemplate(template);
    if (!cloned) {
      return null;
    }
    var wrap = new THREE_REF.Group();
    wrap.name = id;
    wrap.add(cloned);
    applyRegistryNormalization(wrap, entry);
    applyQualityShadows(wrap);
    applyOptionalFactionAccent(wrap, opts);
    wrap.userData = wrap.userData || {};
    wrap.userData.luncAssetId = id;
    wrap.userData.luncAssetSource = 'gltf';
    wrap.userData.luncProcedural = false;
    wrap.userData.type = opts.type;
    wrap.userData.side = opts.side;
    wrap.userData.animState = 'IDLE';
    wrap.userData.parts = wrap.userData.parts || {};
    wrap.userData.phase = Math.random() * Math.PI * 2;
    wrap.userData.shot = Math.random() * 5;
    wrap.userData.speed = 0;
    wrap.userData.facing = opts.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    wrap.userData.muzzleOffset = opts.muzzleOffset || new THREE_REF.Vector3(0, 1.0, 0.8);
    wrap.userData.rootBob = 0;
    wrap.userData.recoil = 0;
    stats.instantiated++;
    stats.gltfSpawns++;
    return wrap;
  }

  function getMode() { return mode; }

  function setMode(m) {
    var up = String(m || '').toUpperCase();
    if (up === 'PROCEDURAL' || up === 'GLTF' || up === 'AUTO') mode = up;
    return mode;
  }

  /** Effective display mode for PERF: PROCEDURAL / GLTF / MIXED */
  function getEffectiveAssetMode() {
    if (mode === 'PROCEDURAL') return 'PROCEDURAL';
    if (stats.gltfSpawns > 0 && stats.proceduralSpawns > 0) return 'MIXED';
    if (mode === 'GLTF' && stats.loaded > 0) return 'GLTF';
    if (stats.gltfSpawns > 0 && stats.proceduralSpawns === 0) return 'GLTF';
    if (stats.loaded > 0 && mode !== 'PROCEDURAL') return 'MIXED';
    return mode === 'GLTF' ? 'GLTF' : (mode === 'AUTO' ? 'AUTO' : 'PROCEDURAL');
  }

  function getStats() {
    recomputeStats();
    return {
      mode: mode,
      effectiveMode: getEffectiveAssetMode(),
      loaded: stats.loaded,
      failed: stats.failed,
      pending: stats.pending,
      approxTris: stats.approxTris,
      instantiated: stats.instantiated,
      proceduralSpawns: stats.proceduralSpawns,
      gltfSpawns: stats.gltfSpawns,
      preloadStarted: preloadStarted,
      hotSwapEnabled: hotSwapEnabled,
      ktx2: ktx2Stub,
      draco: dracoStub,
      meshopt: meshoptStub,
      skeletonUtilsNote: skeletonUtilsNote
    };
  }

  function markProceduralSpawn() {
    stats.proceduralSpawns++;
  }

  /**
   * Hot-swap skipped in v9.3 — replacing live units mid-battle without
   * animation retarget / formation home preservation is unsafe.
   * Documented: spawn procedural immediately; GLB used on next rebuild when ready.
   */
  function tryHotSwap() {
    return {
      ok: false,
      skipped: true,
      reason: 'Hot-swap deferred in v9.3 — use rebuildUnits when assets become ready, or keep procedural'
    };
  }

  function dispose(id) {
    function disposeObject(obj) {
      if (!obj) return;
      obj.traverse(function (child) {
        if (child.geometry && child.geometry.dispose) {
          try { child.geometry.dispose(); } catch (_) {}
        }
        var mats = child.material
          ? (Array.isArray(child.material) ? child.material : [child.material])
          : [];
        mats.forEach(function (m) {
          if (!m) return;
          // Do not dispose shared LUNCBattle.materials presets
          if (m.userData && m.userData.luncShared) return;
          try {
            if (m.map) m.map = null;
            if (m.normalMap) m.normalMap = null;
            if (m.aoMap) m.aoMap = null;
            if (m.emissiveMap) m.emissiveMap = null;
            if (m.metalnessMap) m.metalnessMap = null;
            if (m.roughnessMap) m.roughnessMap = null;
            if (m.dispose) m.dispose();
          } catch (_) {}
        });
      });
    }
    if (id) {
      var c = cache[id];
      if (c && c.scene) disposeObject(c.scene);
      delete cache[id];
      delete pending[id];
      recomputeStats();
      return true;
    }
    Object.keys(cache).forEach(function (k) {
      if (cache[k] && cache[k].scene) disposeObject(cache[k].scene);
    });
    cache = Object.create(null);
    pending = Object.create(null);
    stats.instantiated = 0;
    stats.proceduralSpawns = 0;
    stats.gltfSpawns = 0;
    recomputeStats();
    return true;
  }

  function prepareKTX2Stub() { return ktx2Stub; }
  function prepareDracoStub() { return dracoStub; }
  function prepareMeshoptStub() { return meshoptStub; }

  var api = {
    version: 'v9.3',
    init: init,
    loadAsset: loadAsset,
    preload: preload,
    get: get,
    instantiate: instantiate,
    getStatus: getStatus,
    getRegistry: getRegistry,
    dispose: dispose,
    getMode: getMode,
    setMode: setMode,
    shouldUseGltf: shouldUseGltf,
    isReady: isReady,
    getStats: getStats,
    getEffectiveAssetMode: getEffectiveAssetMode,
    markProceduralSpawn: markProceduralSpawn,
    tryHotSwap: tryHotSwap,
    prepareKTX2Stub: prepareKTX2Stub,
    prepareDracoStub: prepareDracoStub,
    prepareMeshoptStub: prepareMeshoptStub,
    skeletonUtilsNote: skeletonUtilsNote
  };

  LB.assets = api;
})(window);
