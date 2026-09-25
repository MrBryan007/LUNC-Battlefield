/* LUNC Battlefield v9.2 — shared MeshStandardMaterial registry (PBR foundation)
 *
 * Reuses named presets across terrain / structures / units / props.
 * Creation-time color & roughness variation for non-shared instances.
 * Quality-aware metal/rough clamps + envMap enable stubs.
 * Hot FX stay MeshBasic (effects.js) — use materials.basic() only when needed.
 *
 * Texture stubs (normal / AO / KTX2 / envMap) are intentional no-ops until
 * clear-license assets land. No unclear-license downloads.
 *
 * Does NOT upgrade Three.js. WebGL default path remains r128-stable.
 */
(function (global) {
  'use strict';

  var LB = global.LUNCBattle = global.LUNCBattle || {};

  var THREE_REF = null;
  var shared = Object.create(null); // name -> MeshStandardMaterial
  var owned = [];                   // all mats created by this registry
  var variantCount = 0;
  var envMapTex = null;
  var qualityTier = 'high'; // low | medium | high | ultra
  var envMapEnabled = false;

  var PRESET_DEFS = {
    // ---- terrain ----
    'terrain.ground': { color: 0x3d5234, roughness: 0.97, metalness: 0, vertexColors: true },
    'terrain.dirtPatch': {
      color: 0x4a3c2c, roughness: 1, metalness: 0,
      transparent: true, opacity: 0.42, depthWrite: false
    },
    'terrain.road': {
      color: 0x3a3226, roughness: 1, metalness: 0,
      transparent: true, opacity: 0.38, depthWrite: false
    },
    'terrain.mud': { color: 0x2e261c, roughness: 1, metalness: 0 },
    'terrain.rock': { color: 0x5a5c4e, roughness: 0.92, metalness: 0.04 },

    // ---- structures (neutral props / build kit) ----
    'structure.dirt': { color: 0x4a3c2a, roughness: 1, metalness: 0 },
    'structure.dirtDark': { color: 0x3a3024, roughness: 1, metalness: 0 },
    'structure.sandbag': { color: 0x6a5a3e, roughness: 0.98, metalness: 0.02 },
    'structure.crate': { color: 0x5a442e, roughness: 0.88, metalness: 0.04 },
    'structure.wood': { color: 0x493625, roughness: 0.9, metalness: 0.01 },
    'structure.metal': { color: 0x3a4038, roughness: 0.42, metalness: 0.48 },
    'structure.metalDark': { color: 0x222824, roughness: 0.5, metalness: 0.55 },
    'structure.rust': { color: 0x4a3428, roughness: 0.78, metalness: 0.28 },
    'structure.drum': { color: 0x3a4030, roughness: 0.55, metalness: 0.35 },
    'structure.glass': {
      color: 0x1a2218, roughness: 0.35, metalness: 0.15,
      emissive: 0x2a3a28, emissiveIntensity: 0.08
    },
    'structure.scorch': { color: 0x1c1a16, roughness: 1, metalness: 0 },
    'structure.rubble': { color: 0x4a4a40, roughness: 0.95, metalness: 0.04 },
    'structure.earth': { color: 0x5a4a34, roughness: 1, metalness: 0.01 },
    'structure.wallBull': { color: 0x5c5e54, roughness: 0.92, metalness: 0.04 },
    'structure.wallBear': { color: 0x4a4038, roughness: 0.92, metalness: 0.04 },
    'structure.wallDarkBull': { color: 0x4a4e46, roughness: 0.9, metalness: 0.05 },
    'structure.wallDarkBear': { color: 0x3a342c, roughness: 0.9, metalness: 0.05 },
    'structure.concreteBull': { color: 0x6a6c62, roughness: 0.88, metalness: 0.06 },
    'structure.concreteBear': { color: 0x524840, roughness: 0.88, metalness: 0.06 },
    'structure.roofBull': { color: 0x2a3028, roughness: 0.78, metalness: 0.12 },
    'structure.roofBear': { color: 0x1c1814, roughness: 0.78, metalness: 0.12 },
    'structure.roofTrimBull': { color: 0x3a4038, roughness: 0.7, metalness: 0.18 },
    'structure.roofTrimBear': { color: 0x2a221c, roughness: 0.7, metalness: 0.18 },
    'structure.frameBull': { color: 0x3a4238, roughness: 0.65, metalness: 0.22 },
    'structure.frameBear': { color: 0x2e2822, roughness: 0.65, metalness: 0.22 },
    'structure.interior': { color: 0x121410, roughness: 0.95, metalness: 0.02 },

    // ---- units ----
    'unit.bodyBull': { color: 0x2a3a30, roughness: 0.78, metalness: 0.12 },
    'unit.bodyBear': { color: 0x2e2424, roughness: 0.78, metalness: 0.12 },
    'unit.clothBull': { color: 0x1c241e, roughness: 0.92, metalness: 0.02 },
    'unit.clothBear': { color: 0x241818, roughness: 0.92, metalness: 0.02 },
    'unit.dark': { color: 0x121814, roughness: 0.7, metalness: 0.22 },
    'unit.metal': { color: 0x3a4640, roughness: 0.42, metalness: 0.48 },
    'unit.metalDark': { color: 0x222a26, roughness: 0.5, metalness: 0.55 },
    'unit.skin': { color: 0xc4a07a, roughness: 0.88, metalness: 0.02 },
    'unit.track': { color: 0x0e1210, roughness: 0.82, metalness: 0.18 },

    // ---- props / environment ----
    'prop.rock': { color: 0x4a4b3d, roughness: 0.95, metalness: 0.02 },
    'prop.rockB': { color: 0x5c5e4f, roughness: 0.92, metalness: 0.03 },
    'prop.trunk': { color: 0x4b3827, roughness: 1, metalness: 0.01 },
    'prop.deadTrunk': { color: 0x3a3228, roughness: 0.98, metalness: 0.02 },
    'prop.foliage': { color: 0x2a4528, roughness: 1, metalness: 0 },
    'prop.foliageB': { color: 0x355534, roughness: 0.98, metalness: 0 },
    'prop.bush': { color: 0x243b24, roughness: 1, metalness: 0 },
    'prop.rubble': { color: 0x55564a, roughness: 0.94, metalness: 0.04 },
    'prop.wood': { color: 0x493625, roughness: 0.9, metalness: 0.01 },
    'prop.sandbag': { color: 0x6a5a3e, roughness: 0.98, metalness: 0.02 },
    'prop.crate': { color: 0x5a442e, roughness: 0.88, metalness: 0.04 },
    'prop.scorched': {
      color: 0x141210, roughness: 1, metalness: 0,
      transparent: true, opacity: 0.45, depthWrite: false
    }
  };

  function ensureThree(THREE) {
    if (THREE) THREE_REF = THREE;
    if (!THREE_REF) THREE_REF = global.THREE || null;
    return THREE_REF;
  }

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  function qualityRoughness(r) {
    r = r == null ? 0.85 : +r;
    if (qualityTier === 'low') return clamp01(Math.max(r, 0.88));
    if (qualityTier === 'medium') return clamp01(Math.max(r, 0.72));
    return clamp01(r);
  }

  function qualityMetalness(m) {
    m = m == null ? 0.08 : +m;
    if (qualityTier === 'low') return clamp01(m * 0.55);
    if (qualityTier === 'medium') return clamp01(m * 0.85);
    return clamp01(m);
  }

  function qualityEmissiveIntensity(i) {
    i = i == null ? 0 : +i;
    if (qualityTier === 'low') return i * 0.55;
    if (qualityTier === 'medium') return i * 0.8;
    return i;
  }

  function track(mat, meta) {
    if (!mat) return mat;
    mat.userData = mat.userData || {};
    mat.userData.luncMaterials = true;
    if (meta) {
      if (meta.shared) mat.userData.luncShared = true;
      if (meta.name) mat.userData.luncPreset = meta.name;
      if (meta.variant) mat.userData.luncVariant = true;
    }
    owned.push(mat);
    return mat;
  }

  function buildStandard(def, extra) {
    var THREE = ensureThree();
    if (!THREE || !THREE.MeshStandardMaterial) {
      console.warn('[LUNCBattle.materials] THREE.MeshStandardMaterial unavailable');
      return null;
    }
    def = def || {};
    extra = extra || {};
    var params = {
      color: extra.color != null ? extra.color : (def.color != null ? def.color : 0x888888),
      roughness: qualityRoughness(extra.roughness != null ? extra.roughness : def.roughness),
      metalness: qualityMetalness(extra.metalness != null ? extra.metalness : def.metalness),
      emissive: extra.emissive != null ? extra.emissive : (def.emissive != null ? def.emissive : 0x000000),
      emissiveIntensity: qualityEmissiveIntensity(
        extra.emissiveIntensity != null ? extra.emissiveIntensity
          : (def.emissiveIntensity != null ? def.emissiveIntensity : 0)
      )
    };
    if (def.vertexColors || extra.vertexColors) params.vertexColors = true;
    if (def.transparent || extra.transparent) {
      params.transparent = true;
      params.opacity = extra.opacity != null ? extra.opacity
        : (def.opacity != null ? def.opacity : 1);
    }
    if (def.depthWrite === false || extra.depthWrite === false) params.depthWrite = false;
    if (def.flatShading || extra.flatShading) params.flatShading = true;
    if (def.side != null || extra.side != null) params.side = extra.side != null ? extra.side : def.side;

    var mat = new THREE.MeshStandardMaterial(params);
    // Stubs — reserved for future clear-license maps
    mat.userData.normalMapStub = null;
    mat.userData.aoMapStub = null;
    mat.userData.ktx2Stub = false;
    if (envMapEnabled && envMapTex && qualityTier !== 'low') {
      mat.envMap = envMapTex;
      mat.envMapIntensity = qualityTier === 'ultra' ? 0.55 : (qualityTier === 'high' ? 0.35 : 0.2);
    }
    return mat;
  }

  function init(THREE) {
    ensureThree(THREE);
    return api;
  }

  /**
   * Shared named preset. Created once; do not dispose from callers.
   * @param {string} name e.g. 'terrain.ground' | 'unit.metal'
   * @param {object} [overrides]
   */
  function get(name, overrides) {
    ensureThree();
    if (!name) return null;
    if (shared[name] && !overrides) return shared[name];
    if (shared[name] && overrides) {
      // Rare path: caller wants a one-off from a named base
      return createFromDef(PRESET_DEFS[name] || {}, overrides, { shared: false, variant: true, name: name + '.override' });
    }
    var def = PRESET_DEFS[name];
    if (!def) {
      console.warn('[LUNCBattle.materials] unknown preset:', name);
      def = { color: 0x666666, roughness: 0.85, metalness: 0.08 };
    }
    var mat = createFromDef(def, overrides || null, { shared: true, name: name });
    if (!overrides) shared[name] = mat;
    return mat;
  }

  function createFromDef(def, overrides, meta) {
    var mat = buildStandard(def, overrides || {});
    return track(mat, meta || { shared: false });
  }

  /**
   * Ad-hoc MeshStandardMaterial (registered). Preferred over raw THREE construction.
   * Signature matches legacy battle-engine mat(color, rough, metal, emissive, intensity).
   */
  function create(color, rough, metal, emissive, intensity, opts) {
    opts = opts || {};
    var def = {
      color: color,
      roughness: rough == null ? 0.72 : rough,
      metalness: metal == null ? 0.08 : metal,
      emissive: emissive || 0x000000,
      emissiveIntensity: intensity || 0
    };
    if (opts.transparent) {
      def.transparent = true;
      def.opacity = opts.opacity != null ? opts.opacity : 1;
      def.depthWrite = opts.depthWrite;
    }
    if (opts.vertexColors) def.vertexColors = true;
    if (opts.flatShading) def.flatShading = true;
    if (opts.side != null) def.side = opts.side;

    // Creation-time variation (subtle; deterministic if seed provided)
    if (opts.vary) {
      var seed = opts.seed != null ? +opts.seed : Math.random() * 1000;
      var jr = (Math.sin(seed * 12.9898) * 43758.5453) % 1;
      if (jr < 0) jr = -jr;
      var jc = (Math.sin(seed * 78.233) * 43758.5453) % 1;
      if (jc < 0) jc = -jc;
      def.roughness = clamp01(def.roughness + (jr - 0.5) * (opts.roughJitter != null ? opts.roughJitter : 0.06));
      // slight value shift via metalness keep + color jitter applied after build
      var mat = createFromDef(def, null, { shared: false, variant: true });
      variantCount++;
      if (mat && mat.color && mat.color.offsetHSL) {
        mat.color.offsetHSL(0, 0, (jc - 0.5) * (opts.colorJitter != null ? opts.colorJitter : 0.04));
      }
      return mat;
    }
    return createFromDef(def, null, { shared: !!opts.shared, variant: !opts.shared, name: opts.name });
  }

  /** Legacy alias used by battle-engine / modules. */
  function mat(color, rough, metal, emissive, intensity) {
    return create(color, rough, metal, emissive, intensity);
  }

  /**
   * Clone-ish variation from a shared preset or existing material (new instance).
   */
  function vary(base, seed, opts) {
    opts = opts || {};
    var src = typeof base === 'string' ? get(base) : base;
    if (!src) return create(0x888888, 0.85, 0.05, 0, 0, { vary: true, seed: seed });
    var col = 0x888888;
    try {
      if (src.color && src.color.getHex) col = src.color.getHex();
    } catch (_) {}
    return create(
      col,
      src.roughness,
      src.metalness,
      src.emissive && src.emissive.getHex ? src.emissive.getHex() : 0x000000,
      src.emissiveIntensity || 0,
      {
        vary: true,
        seed: seed,
        roughJitter: opts.roughJitter,
        colorJitter: opts.colorJitter,
        transparent: src.transparent,
        opacity: src.opacity,
        depthWrite: src.depthWrite,
        vertexColors: src.vertexColors
      }
    );
  }

  function accent(color, emissiveBoost, opts) {
    opts = opts || {};
    var key = opts.cacheKey || ('accent.' + String(color) + '_' + String(emissiveBoost || 0));
    if (!opts.forceNew && shared[key]) return shared[key];
    var m = create(
      color,
      opts.roughness != null ? opts.roughness : 0.55,
      opts.metalness != null ? opts.metalness : 0.2,
      color,
      emissiveBoost != null ? emissiveBoost : 0.07,
      { shared: !opts.forceNew, name: key }
    );
    if (!opts.forceNew) shared[key] = m;
    return m;
  }

  function factionAccent(side, color, intensity, opts) {
    opts = opts || {};
    return accent(color, intensity != null ? intensity : 0.14, {
      roughness: opts.roughness != null ? opts.roughness : 0.48,
      metalness: opts.metalness != null ? opts.metalness : 0.22,
      forceNew: !!opts.forceNew,
      cacheKey: opts.cacheKey || ('faction.' + String(side) + '.' + String(color) + '.' + String(intensity || 0.14))
    });
  }

  /** MeshBasic for shadows / hot FX helpers — not PBR. */
  function basic(params) {
    var THREE = ensureThree();
    if (!THREE || !THREE.MeshBasicMaterial) return null;
    var matB = new THREE.MeshBasicMaterial(params || {});
    matB.userData = matB.userData || {};
    matB.userData.luncMaterials = true;
    matB.userData.luncBasic = true;
    owned.push(matB);
    return matB;
  }

  function applyQuality(preset) {
    var name = preset;
    if (preset && typeof preset === 'object') {
      name = preset.lightingComplexity || preset.unitDetail || qualityTier;
    }
    if (typeof name === 'string') {
      name = name.toLowerCase();
      if (name === 'ultra' || name === 'high' || name === 'medium' || name === 'low') {
        qualityTier = name;
      } else if (name.indexOf('ultra') >= 0) qualityTier = 'ultra';
      else if (name.indexOf('high') >= 0) qualityTier = 'high';
      else if (name.indexOf('medium') >= 0 || name.indexOf('med') >= 0) qualityTier = 'medium';
      else if (name.indexOf('low') >= 0) qualityTier = 'low';
    }
    // Retune live shared materials (rough/metal clamps + envMap)
    Object.keys(shared).forEach(function (k) {
      var m = shared[k];
      if (!m || m.userData && m.userData.luncBasic) return;
      var def = PRESET_DEFS[k];
      if (def) {
        if (def.roughness != null) m.roughness = qualityRoughness(def.roughness);
        if (def.metalness != null) m.metalness = qualityMetalness(def.metalness);
        if (def.emissiveIntensity != null) {
          m.emissiveIntensity = qualityEmissiveIntensity(def.emissiveIntensity);
        }
      }
      if (envMapEnabled && envMapTex && qualityTier !== 'low') {
        m.envMap = envMapTex;
        m.envMapIntensity = qualityTier === 'ultra' ? 0.55 : (qualityTier === 'high' ? 0.35 : 0.2);
      } else {
        m.envMap = null;
      }
      m.needsUpdate = true;
    });
    return qualityTier;
  }

  // ---- Texture / pipeline stubs (no assets loaded) ----

  function setEnvMap(tex, enabled) {
    envMapTex = tex || null;
    envMapEnabled = enabled !== false && !!envMapTex;
    applyQuality(qualityTier);
    return { ok: !!envMapTex, enabled: envMapEnabled, stub: !envMapTex };
  }

  function attachNormalMapStub(matOrName, _url) {
    var m = typeof matOrName === 'string' ? get(matOrName) : matOrName;
    if (!m) return { ok: false, reason: 'material missing' };
    m.userData.normalMapStub = { pending: true, note: 'v9.2 stub — await clear-license normal maps' };
    return { ok: true, applied: false, stub: true };
  }

  function attachAOMapStub(matOrName, _url) {
    var m = typeof matOrName === 'string' ? get(matOrName) : matOrName;
    if (!m) return { ok: false, reason: 'material missing' };
    m.userData.aoMapStub = { pending: true, note: 'v9.2 stub — await clear-license AO maps' };
    return { ok: true, applied: false, stub: true };
  }

  function prepareKTX2Stub() {
    return {
      supported: false,
      loaded: false,
      stub: true,
      reason: 'KTX2/Basis not wired in v9.2 — no unclear-license packs; WebGL r128 path unchanged'
    };
  }

  function isShared(mat) {
    return !!(mat && mat.userData && mat.userData.luncShared);
  }

  function getCount() {
    // Drop disposed refs
    owned = owned.filter(function (m) {
      return m && !m.userData.luncDisposed;
    });
    var sharedN = 0;
    Object.keys(shared).forEach(function (k) {
      if (shared[k] && !shared[k].userData.luncDisposed) sharedN++;
    });
    return {
      total: owned.length,
      shared: sharedN,
      variants: Math.max(0, owned.length - sharedN),
      variantCreates: variantCount,
      quality: qualityTier,
      envMap: envMapEnabled
    };
  }

  function count() {
    return getCount().total;
  }

  function disposeOne(m) {
    if (!m || m.userData && m.userData.luncDisposed) return;
    try {
      if (m.map) m.map = null;
      if (m.normalMap) m.normalMap = null;
      if (m.aoMap) m.aoMap = null;
      if (m.envMap) m.envMap = null;
      if (m.dispose) m.dispose();
    } catch (_) {}
    if (m.userData) m.userData.luncDisposed = true;
  }

  /**
   * dispose(mat) — one material (skips shared unless force).
   * dispose() — all registry-owned materials.
   */
  function dispose(matOrNull, opts) {
    opts = opts || {};
    if (matOrNull) {
      if (isShared(matOrNull) && !opts.force) return false;
      disposeOne(matOrNull);
      return true;
    }
    owned.forEach(function (m) { disposeOne(m); });
    owned = [];
    shared = Object.create(null);
    variantCount = 0;
    return true;
  }

  function listPresets() {
    return Object.keys(PRESET_DEFS).slice();
  }

  // Listen for quality changes when available
  try {
    global.addEventListener('lunc-quality-change', function (ev) {
      try {
        var p = ev && ev.detail && ev.detail.preset;
        if (p) {
          var tier = p.lightingComplexity || p.unitDetail || 'high';
          applyQuality(tier);
        }
      } catch (_) {}
    });
  } catch (_) {}

  var api = {
    version: 'v9.2',
    init: init,
    get: get,
    create: create,
    mat: mat,
    vary: vary,
    accent: accent,
    factionAccent: factionAccent,
    basic: basic,
    applyQuality: applyQuality,
    setEnvMap: setEnvMap,
    attachNormalMapStub: attachNormalMapStub,
    attachAOMapStub: attachAOMapStub,
    prepareKTX2Stub: prepareKTX2Stub,
    isShared: isShared,
    getCount: getCount,
    count: count,
    dispose: dispose,
    listPresets: listPresets,
    PRESETS: PRESET_DEFS
  };

  LB.materials = api;
})(window);
