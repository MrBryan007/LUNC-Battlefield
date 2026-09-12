/* LUNC Battlefield v9.4.3 — glTF/GLB + LOD-aware asset pipeline (async lifecycle)
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
  /** Per-base-asset lifecycle generation. dispose(id) bumps; load callbacks with stale gen are ignored. */
  var generation = Object.create(null); // baseId -> number
  var staleIgnored = 0;
  var stats = {
    loaded: 0,
    failed: 0,
    pending: 0,
    instantiated: 0,
    proceduralSpawns: 0,
    gltfSpawns: 0,
    glbSpawned: 0,       // alias clarity for PERF (same as gltfSpawns)
    proceduralSpawned: 0, // alias clarity for PERF
    approxTris: 0,
    lodSwaps: 0,
    lodFallback: 0
  };
  // Cache key: id OR id::lodN for LOD-specific templates
  // Shared textures on templates: do NOT dispose maps owned by cache templates from clones.
  var ktx2Stub = { ready: false, note: 'KTX2Loader not wired in v9.4 — r128 path unchanged' };
  var dracoStub = { ready: false, note: 'DRACOLoader not wired in v9.4' };
  var meshoptStub = { ready: false, note: 'MeshoptDecoder not wired in v9.4' };
  var skeletonUtilsNote =
    'SkeletonUtils.clone deferred to v9.5 — v9.4 uses Object3D.clone(); skinned/animated GLB swap needs SkeletonUtils';
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


  function getGeneration(id) {
    return generation[id] || 0;
  }

  function bumpGeneration(id) {
    generation[id] = (generation[id] || 0) + 1;
    return generation[id];
  }

  /** Dev-only: ?assetDelay=1500 slows GLTF callbacks for race repro. OFF by default. */
  function getAssetDelayMs() {
    try {
      var q = new URLSearchParams(location.search).get('assetDelay');
      if (q == null || q === '') return 0;
      var n = parseInt(q, 10);
      if (!isFinite(n) || n <= 0) return 0;
      return Math.min(n, 60000);
    } catch (_) {}
    return 0;
  }

  /**
   * Dispose geometries / materials / owned textures on a stale GLTF root.
   * Never dispose shared registry mats (luncShared) or template-shared maps still in live cache.
   */
  function disposeObject3DResources(root) {
    if (!root || !root.traverse) return;
    root.traverse(function (child) {
      if (child.geometry && child.geometry.dispose) {
        try { child.geometry.dispose(); } catch (_) {}
      }
      var mats = child.material
        ? (Array.isArray(child.material) ? child.material : [child.material])
        : [];
      mats.forEach(function (m) {
        if (!m) return;
        if (m.userData && m.userData.luncShared) return;
        try {
          var ownMaps = m.userData && m.userData.luncOwnsMaps;
          var mapKeys = ['map', 'normalMap', 'aoMap', 'emissiveMap', 'metalnessMap', 'roughnessMap', 'alphaMap', 'lightMap'];
          mapKeys.forEach(function (k) {
            if (!m[k]) return;
            if (ownMaps || (m[k].userData && m[k].userData.luncOwned)) {
              try { if (m[k].dispose) m[k].dispose(); } catch (_) {}
            }
            m[k] = null;
          });
          if (m.dispose) m.dispose();
        } catch (_) {}
      });
    });
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

  /**
   * Effective LOD band after quality/mobile resolution.
   * LOW/MED (and narrow viewports) bump a LOD0 request to LOD1 so simpler assets load.
   * Cache identity MUST use this effective band — never the raw requested band.
   */
  function resolveEffectiveLodBand(requestedBand, entry) {
    var band = requestedBand == null ? 0 : (requestedBand | 0);
    if (band < 0) band = 0;
    if (band > 3) band = 3;
    if (preferSimplerAssets() && band < 2) band = Math.max(band, 1);
    return band;
  }

  /** Cache key for an already-effective band. lod0 → base id; else id::lodN. */
  function cacheKey(id, lodBand) {
    var band = lodBand == null ? 0 : (lodBand | 0);
    if (band <= 0) return id;
    return id + '::lod' + band;
  }

  /** Resolve cache key from a requested band (applies quality/mobile effective resolution). */
  function cacheKeyForRequest(id, requestedBand) {
    var entry = getEntry(id);
    return cacheKey(id, resolveEffectiveLodBand(requestedBand, entry));
  }

  function resolvePath(entry, lodBand) {
    if (!entry) return null;
    // Accept either requested or already-effective; resolveEffective is idempotent for HIGH/ULTRA
    var band = resolveEffectiveLodBand(lodBand, entry);
    if (LB.lod && LB.lod.resolveLodPath) {
      var p = LB.lod.resolveLodPath(entry, band);
      if (p) return p;
    }
    if (entry.lodPaths) {
      var lp = entry.lodPaths;
      if (band <= 0 && lp.lod0) return lp.lod0;
      if (band === 1 && (lp.lod1 || lp.lod0)) return lp.lod1 || lp.lod0;
      if (band === 2 && (lp.lod2 || lp.lod1 || lp.lod0)) return lp.lod2 || lp.lod1 || lp.lod0;
      if (band >= 3) return lp.lod3 || lp.lod2 || lp.lod1 || lp.lod0 || null;
    }
    return entry.path || null;
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
    // Stubs for future decompressors (not attached — no third-party wasm in v9.4)
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
      version: 'v9.4.3'
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

  function get(id, lodBand) {
    var effective = resolveEffectiveLodBand(lodBand, getEntry(id));
    var key = cacheKey(id, effective);
    var c = cache[key] || (effective === 0 ? cache[id] : null);
    return c && c.status === 'ready' ? c.scene : null;
  }

  function isReady(id, lodBand) {
    var effective = resolveEffectiveLodBand(lodBand, getEntry(id));
    var key = cacheKey(id, effective);
    if (cache[key] && cache[key].status === 'ready' && cache[key].scene) return true;
    if (effective === 0 && cache[id] && cache[id].status === 'ready' && cache[id].scene) return true;
    return false;
  }

  /**
   * Whether instantiate should attempt GLB for this id under current mode/quality.
   */
  function shouldUseGltf(id, lodBand) {
    if (mode === 'PROCEDURAL') return false;
    var entry = getEntry(id);
    if (!entry) return false;
    var path = resolvePath(entry, lodBand == null ? 0 : lodBand);
    if (!path && !entry.path) return false;
    if (shouldPreferProceduralForQuality(entry)) return false;
    // AUTO skips smoke-test placeholder boxes — keep articulated procedural as default visual
    // Force ?assets=gltf to exercise the real GLB instantiate path for pipeline verification
    if (mode === 'AUTO' && entry.smokeTest) return false;
    if (mode === 'GLTF') return isReady(id, lodBand); // only if already loaded — never block
    // AUTO + production-ready assets
    return isReady(id, lodBand);
  }

  function loadAsset(id, lodBand) {
    var entry = getEntry(id);
    var requested = lodBand == null ? 0 : (lodBand | 0);
    // Effective resolved variant — cache identity follows this, not the request band
    var band = resolveEffectiveLodBand(requested, entry);
    var key = cacheKey(id, band);
    if (!entry) {
      return Promise.resolve({ ok: false, id: id, lodBand: band, requestedLodBand: requested, error: 'unknown id', status: 'failed' });
    }
    if (mode === 'PROCEDURAL') {
      setCacheStatus(key, { status: 'skipped', error: 'mode=PROCEDURAL', entry: entry, lodBand: band });
      return Promise.resolve({ ok: false, id: id, lodBand: band, requestedLodBand: requested, error: 'procedural mode', status: 'skipped' });
    }
    var url = resolvePath(entry, band);
    if (!url) {
      setCacheStatus(key, { status: 'failed', error: 'empty/missing LOD path', entry: entry, lodBand: band });
      stats.failed++;
      stats.lodFallback++;
      recomputeStats();
      return Promise.resolve({ ok: false, id: id, lodBand: band, error: 'empty/missing LOD path', status: 'failed' });
    }
    if (cache[key] && cache[key].status === 'ready') {
      return Promise.resolve({ ok: true, id: id, lodBand: band, scene: cache[key].scene, status: 'ready' });
    }
    // Also accept base-id cache when same URL as lod0
    if (band > 0 && cache[id] && cache[id].status === 'ready' && cache[id].url === url) {
      setCacheStatus(key, {
        status: 'ready', scene: cache[id].scene, error: null, tris: cache[id].tris,
        entry: entry, loadedAt: cache[id].loadedAt, lodBand: band, url: url,
        animations: cache[id].animations || []
      });
      recomputeStats();
      return Promise.resolve({ ok: true, id: id, lodBand: band, scene: cache[id].scene, status: 'ready', shared: true });
    }
    if (pending[key]) return pending[key];

    var ldr = ensureLoader();
    if (!ldr) {
      setCacheStatus(key, { status: 'failed', error: 'GLTFLoader unavailable', entry: entry, lodBand: band });
      recomputeStats();
      return Promise.resolve({ ok: false, id: id, lodBand: band, error: 'GLTFLoader unavailable', status: 'failed' });
    }

    // Capture lifecycle token BEFORE network starts (dispose bumps generation)
    var requestGen = generation[id] || 0;

    setCacheStatus(key, { status: 'loading', error: null, entry: entry, lodBand: band, url: url, requestGen: requestGen });
    stats.pending++;
    recomputeStats();

    var bust = '';
    try {
      if (LB.config && LB.config.BUILD) bust = (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(LB.config.BUILD);
    } catch (_) {}

    var delayMs = getAssetDelayMs();

    pending[key] = new Promise(function (resolve) {
      function finishOk(gltf) {
        delete pending[key];
        var scene = gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]));
        // Stale: dispose raced ahead (or dispose+reload) — do NOT rewrite cache
        if (requestGen !== (generation[id] || 0)) {
          staleIgnored++;
          if (scene) {
            try { disposeObject3DResources(scene); } catch (_) {}
          }
          recomputeStats();
          resolve({ ok: false, id: id, lodBand: band, requestedLodBand: requested, error: 'stale generation', status: 'stale', stale: true, requestGen: requestGen, generation: generation[id] || 0 });
          return;
        }
        if (!scene) {
          setCacheStatus(key, { status: 'failed', error: 'empty gltf scene', lodBand: band });
          recomputeStats();
          resolve({ ok: false, id: id, lodBand: band, error: 'empty scene', status: 'failed' });
          return;
        }
        // Store template; clones happen on instantiate. Maps stay template-owned (shared).
        scene.userData = scene.userData || {};
        scene.userData.luncAssetId = id;
        scene.userData.luncGltf = true;
        scene.userData.luncLodBand = band;
        scene.userData.luncTemplateOwned = true;
        scene.userData.luncRequestGen = requestGen;
        var tris = countTris(scene);
        setCacheStatus(key, {
          status: 'ready',
          scene: scene,
          error: null,
          tris: tris,
          entry: entry,
          loadedAt: Date.now(),
          lodBand: band,
          url: url,
          animations: (gltf && gltf.animations) || [],
          requestGen: requestGen
        });
        // Mirror to base id when lod0
        if (band === 0 && key !== id) {
          setCacheStatus(id, cache[key]);
        }
        if (band === 0) {
          setCacheStatus(id, {
            status: 'ready', scene: scene, error: null, tris: tris, entry: entry,
            loadedAt: Date.now(), lodBand: 0, url: url, animations: (gltf && gltf.animations) || [],
            requestGen: requestGen
          });
        }
        recomputeStats();
        resolve({ ok: true, id: id, lodBand: band, scene: scene, status: 'ready', tris: tris, requestGen: requestGen });
      }

      function finishErr(err) {
        delete pending[key];
        if (requestGen !== (generation[id] || 0)) {
          staleIgnored++;
          recomputeStats();
          resolve({ ok: false, id: id, lodBand: band, error: 'stale generation', status: 'stale', stale: true });
          return;
        }
        var msg = (err && err.message) ? err.message : String(err || 'load failed');
        setCacheStatus(key, { status: 'failed', error: msg, lodBand: band });
        stats.lodFallback++;
        recomputeStats();
        resolve({ ok: false, id: id, lodBand: band, error: msg, status: 'failed' });
      }

      try {
        ldr.load(
          url + bust,
          function (gltf) {
            if (delayMs > 0) {
              setTimeout(function () { finishOk(gltf); }, delayMs);
            } else {
              finishOk(gltf);
            }
          },
          undefined,
          function (err) {
            if (delayMs > 0) {
              setTimeout(function () { finishErr(err); }, delayMs);
            } else {
              finishErr(err);
            }
          }
        );
      } catch (e) {
        finishErr(e);
      }
    });
    return pending[key];
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
    var requested = opts.lodBand != null ? opts.lodBand : 0;
    var entry = getEntry(id);
    var band = resolveEffectiveLodBand(requested, entry);
    if (!shouldUseGltf(id, requested) && mode !== 'GLTF') {
      return null;
    }
    if (!isReady(id, requested)) {
      // Try lower LOD / base (still via effective resolution)
      if (!isReady(id, 0)) return null;
      band = resolveEffectiveLodBand(0, entry);
    }
    var key = cacheKey(id, band);
    var template = (cache[key] && cache[key].scene) || (cache[id] && cache[id].scene);
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
    wrap.userData.luncLodBand = band;
    wrap.userData.luncRequestedLodBand = requested;
    wrap.userData.lodBand = wrap.userData.luncLodBand;
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
    wrap.userData.home = opts.home || null;
    stats.instantiated++;
    stats.gltfSpawns++;
    stats.glbSpawned = stats.gltfSpawns;
    return wrap;
  }

  function getMode() { return mode; }

  function setMode(m) {
    var up = String(m || '').toUpperCase();
    if (up === 'PROCEDURAL' || up === 'GLTF' || up === 'AUTO') mode = up;
    return mode;
  }

  /**
   * Display mode for PERF — distinguishes CACHE LOADED vs SCENE SPAWNED.
   * Never implies GLB art is visible when only the template cache is populated.
   * Returns: PROCEDURAL | GLTF | MIXED | "GLTF LOADED · PROCEDURAL ACTIVE" | AUTO
   */
  function getEffectiveAssetMode() {
    var glbN = stats.gltfSpawns || stats.glbSpawned || 0;
    var procN = stats.proceduralSpawns || stats.proceduralSpawned || 0;
    if (mode === 'PROCEDURAL') return 'PROCEDURAL';
    if (glbN > 0 && procN > 0) return 'MIXED';
    if (glbN > 0 && procN === 0) return 'GLTF';
    // Cache may be warm while scene is still procedural (AUTO + smokeTest)
    if (stats.loaded > 0 && glbN === 0) return 'GLTF LOADED · PROCEDURAL ACTIVE';
    if (mode === 'GLTF' && glbN === 0) return 'GLTF LOADED · PROCEDURAL ACTIVE';
    if (mode === 'AUTO') return procN > 0 ? 'PROCEDURAL' : 'AUTO';
    return 'PROCEDURAL';
  }

  function getSpawnDiagnostics() {
    recomputeStats();
    var glbN = stats.gltfSpawns || 0;
    var procN = stats.proceduralSpawns || 0;
    return {
      assetsLoaded: stats.loaded,
      assetsFailed: stats.failed,
      assetsPending: stats.pending,
      glbSpawned: glbN,
      proceduralSpawned: procN,
      instantiated: stats.instantiated,
      mode: mode,
      effectiveMode: getEffectiveAssetMode(),
      note: stats.loaded > 0 && glbN === 0
        ? 'Templates in cache — scene still procedural (SAFE FALLBACK / smokeTest gate)'
        : null
    };
  }

  function getStats() {
    recomputeStats();
    var diag = getSpawnDiagnostics();
    return {
      mode: mode,
      effectiveMode: diag.effectiveMode,
      loaded: stats.loaded,
      failed: stats.failed,
      pending: stats.pending,
      approxTris: stats.approxTris,
      instantiated: stats.instantiated,
      proceduralSpawns: stats.proceduralSpawns,
      gltfSpawns: stats.gltfSpawns,
      glbSpawned: diag.glbSpawned,
      proceduralSpawned: diag.proceduralSpawned,
      assetsLoaded: diag.assetsLoaded,
      lodSwaps: stats.lodSwaps,
      lodFallback: stats.lodFallback,
      preloadStarted: preloadStarted,
      hotSwapEnabled: hotSwapEnabled,
      ktx2: ktx2Stub,
      draco: dracoStub,
      meshopt: meshoptStub,
      skeletonUtilsNote: skeletonUtilsNote,
      spawnNote: diag.note,
      staleIgnored: staleIgnored,
      assetDelayMs: getAssetDelayMs()
    };
  }

  function markProceduralSpawn() {
    stats.proceduralSpawns++;
    stats.proceduralSpawned = stats.proceduralSpawns;
  }

/**
   * Safe visual LOD swap: replace mesh children while preserving world transform,
   * side/faction, formation home, type, health/state hooks, anim metadata,
   * fire timing, targeting. No new logical unit / no duplicate on LOD change.
   * Skinned/AnimationMixer swap → v9.5 (SkeletonUtils) — see docs/V9-LOD.md.
   */
  function captureUnitState(wrap) {
    if (!wrap || !wrap.userData) return null;
    var ud = wrap.userData;
    return {
      position: wrap.position ? wrap.position.clone() : null,
      rotation: wrap.rotation ? { x: wrap.rotation.x, y: wrap.rotation.y, z: wrap.rotation.z } : null,
      quaternion: wrap.quaternion ? wrap.quaternion.clone() : null,
      scale: wrap.scale ? wrap.scale.clone() : null,
      side: ud.side,
      type: ud.type,
      home: ud.home,
      index: ud.index,
      animState: ud.animState,
      phase: ud.phase,
      shot: ud.shot,
      speed: ud.speed,
      facing: ud.facing,
      fireUntil: ud.fireUntil,
      reloadUntil: ud.reloadUntil,
      hitUntil: ud.hitUntil,
      recoil: ud.recoil,
      rootBob: ud.rootBob,
      health: ud.health,
      targetId: ud.targetId,
      muzzleOffset: ud.muzzleOffset,
      lodBand: ud.lodBand,
      luncAssetId: ud.luncAssetId,
      luncAssetSource: ud.luncAssetSource
    };
  }

  function restoreUnitState(wrap, state) {
    if (!wrap || !state) return;
    if (state.position && wrap.position) wrap.position.copy(state.position);
    if (state.quaternion && wrap.quaternion) wrap.quaternion.copy(state.quaternion);
    else if (state.rotation && wrap.rotation) {
      wrap.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
    }
    if (state.scale && wrap.scale) wrap.scale.copy(state.scale);
    var ud = wrap.userData;
    ud.side = state.side;
    ud.type = state.type;
    ud.home = state.home;
    ud.index = state.index;
    ud.animState = state.animState;
    ud.phase = state.phase;
    ud.shot = state.shot;
    ud.speed = state.speed;
    ud.facing = state.facing;
    ud.fireUntil = state.fireUntil;
    ud.reloadUntil = state.reloadUntil;
    ud.hitUntil = state.hitUntil;
    ud.recoil = state.recoil;
    ud.rootBob = state.rootBob;
    ud.health = state.health;
    ud.targetId = state.targetId;
    if (state.muzzleOffset) ud.muzzleOffset = state.muzzleOffset;
  }

  function swapVisual(wrap, id, lodBand, opts) {
    opts = opts || {};
    if (!wrap || !THREE_REF) return { ok: false, reason: 'no wrap' };
    var band = lodBand == null ? 0 : (lodBand | 0);
    if (band >= 3) {
      // Impostor stub — create/show stub; hide procedural/GLTF visual; preserve transform/state
      wrap.userData.lodBand = 3;
      wrap.userData.luncLodBand = 3;
      wrap.userData.impostorReady = true;
      if (LB.lod && LB.lod.ensureImpostorStub) LB.lod.ensureImpostorStub(wrap, THREE_REF);
      if (LB.lod && LB.lod.applyProceduralLodVisibility) {
        LB.lod.applyProceduralLodVisibility(wrap, 3);
      } else if (wrap.userData.impostorStub) {
        wrap.userData.impostorStub.visible = true;
      }
      return { ok: true, impostor: true, lodBand: 3 };
    }
    if (!isReady(id, band)) {
      stats.lodFallback++;
      return { ok: false, reason: 'LOD asset not ready — keep current visual', fallback: true };
    }
    var state = captureUnitState(wrap);
    var fresh = null;
    try {
      // Temporarily allow instantiate
      var prevMode = mode;
      fresh = instantiate(id, {
        lodBand: band,
        side: wrap.userData.side,
        type: wrap.userData.type,
        color: opts.color,
        accentColor: opts.accentColor || opts.color,
        home: wrap.userData.home,
        muzzleOffset: wrap.userData.muzzleOffset
      });
      mode = prevMode;
    } catch (e) {
      stats.lodFallback++;
      return { ok: false, reason: String(e && e.message || e), fallback: true };
    }
    if (!fresh) {
      stats.lodFallback++;
      return { ok: false, reason: 'instantiate returned null', fallback: true };
    }
    // Move fresh children into wrap; dispose old non-shared geometry carefully
    var oldChildren = wrap.children.slice();
    while (fresh.children.length) {
      wrap.add(fresh.children[0]);
    }
    oldChildren.forEach(function (ch) {
      if (ch.userData && ch.userData.luncImpostor) return; // keep impostor stub
      wrap.remove(ch);
      // Do not dispose template-shared geos/maps — only leaf clones without template flag
      try {
        ch.traverse(function (child) {
          if (child.geometry && child.geometry.dispose && !(child.userData && child.userData.luncTemplateOwned)) {
            // Cloned geos from Object3D.clone are unique — safe to dispose
            // But shared materials from registry must stay
          }
        });
      } catch (_) {}
    });
    restoreUnitState(wrap, state);
    wrap.userData.lodBand = band;
    wrap.userData.luncLodBand = band;
    wrap.userData.luncAssetId = id;
    wrap.userData.luncAssetSource = 'gltf';
    stats.lodSwaps++;
    // Undo double-count from instantiate during swap
    if (stats.gltfSpawns > 0) stats.gltfSpawns--;
    if (stats.instantiated > 0) stats.instantiated--;
    stats.glbSpawned = stats.gltfSpawns;
    return { ok: true, lodBand: band, swapped: true };
  }

  /**
   * Full skinned hot-swap skipped — unsafe without SkeletonUtils / anim retarget (v9.5).
   * Use swapVisual for rigid LOD mesh swaps; rebuildUnits for army refresh.
   */
  function tryHotSwap() {
    return {
      ok: false,
      skipped: true,
      reason: 'Skinned hot-swap deferred to v9.5 (SkeletonUtils). Use swapVisual for rigid LOD or rebuildUnits.'
    };
  }

  function dispose(id) {
    if (id) {
      // Bump generation FIRST so in-flight callbacks become stale
      bumpGeneration(id);
      var prefix = id + '::';
      var keys = Object.keys(cache).filter(function (k) {
        return k === id || k.indexOf(prefix) === 0;
      });
      keys.forEach(function (k) {
        var c = cache[k];
        if (c && c.scene) disposeObject3DResources(c.scene);
        delete cache[k];
      });
      Object.keys(pending).forEach(function (k) {
        if (k === id || k.indexOf(prefix) === 0) delete pending[k];
      });
      recomputeStats();
      return true;
    }
    // Full wipe — invalidate every known generation
    Object.keys(generation).forEach(function (gid) { bumpGeneration(gid); });
    Object.keys(cache).forEach(function (k) {
      if (cache[k] && cache[k].scene) disposeObject3DResources(cache[k].scene);
    });
    cache = Object.create(null);
    pending = Object.create(null);
    // Keep generation map (already bumped) so late callbacks still see mismatch
    stats.instantiated = 0;
    stats.proceduralSpawns = 0;
    stats.gltfSpawns = 0;
    stats.glbSpawned = 0;
    stats.proceduralSpawned = 0;
    stats.lodSwaps = 0;
    stats.lodFallback = 0;
    recomputeStats();
    return true;
  }

  function prepareKTX2Stub() { return ktx2Stub; }
  function prepareDracoStub() { return dracoStub; }
  function prepareMeshoptStub() { return meshoptStub; }

  var api = {
    version: 'v9.4.3',
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
    getSpawnDiagnostics: getSpawnDiagnostics,
    swapVisual: swapVisual,
    captureUnitState: captureUnitState,
    restoreUnitState: restoreUnitState,
    cacheKey: cacheKey,
    cacheKeyForRequest: cacheKeyForRequest,
    resolveEffectiveLodBand: resolveEffectiveLodBand,
    resolvePath: resolvePath,
    tryHotSwap: tryHotSwap,
    prepareKTX2Stub: prepareKTX2Stub,
    prepareDracoStub: prepareDracoStub,
    prepareMeshoptStub: prepareMeshoptStub,
    skeletonUtilsNote: skeletonUtilsNote,
    disposeObject3DResources: disposeObject3DResources,
    getGeneration: getGeneration,
    bumpGeneration: bumpGeneration,
    getAssetDelayMs: getAssetDelayMs
  };

  LB.assets = api;
})(window);
