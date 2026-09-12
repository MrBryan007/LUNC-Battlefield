/* LUNC Battlefield v9.1 — renderer abstraction + WebGPU readiness
 *
 * Default path remains WebGL (Three.js r128 WebGLRenderer) — identical to v8.8.
 * WebGPU is experimental: try only when prefer/URL/localStorage asks for it, and
 * ONLY if THREE.WebGPURenderer exists on the loaded THREE build.
 *
 * Three r128 CDN does NOT ship WebGPURenderer. Real WebGPU requires a future
 * Three.js upgrade (v9.2+). This module never loads a second Three CDN or
 * upgrades the global THREE object.
 *
 * Never crashes: always returns a working WebGLRenderer on any WebGPU failure.
 */
(function (global) {
  'use strict';

  var LB = global.LUNCBattle = global.LUNCBattle || {};

  var STORAGE_KEY = 'luncBattle.renderer';
  var VALID = { webgl: true, webgpu: true };

  /** Sync cache filled by detectWebGPU (sync probe + async resolve). */
  var detectCache = null;
  var detectPromise = null;

  /** Last create() result summary for getState / overlay. */
  var lastCreate = {
    prefer: 'webgl',
    backend: 'webgl',
    webgpuAvailable: null,
    fallbackReason: null,
    threeRevision: null,
    capabilities: null
  };

  function threeRevision(THREE) {
    try {
      if (THREE && THREE.REVISION != null) return String(THREE.REVISION);
    } catch (_) {}
    return 'unknown';
  }

  function readUrlPrefer() {
    try {
      var q = new URLSearchParams(global.location.search).get('renderer');
      if (q) {
        q = String(q).toLowerCase().trim();
        if (VALID[q]) return q;
      }
    } catch (_) {}
    return null;
  }

  function readStoredPrefer() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v) {
        v = String(v).toLowerCase().trim();
        if (VALID[v]) return v;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Preference order: explicit prefer arg → URL ?renderer= → localStorage → webgl.
   * @param {string} [explicit]
   * @returns {'webgl'|'webgpu'}
   */
  function resolvePreference(explicit) {
    if (explicit) {
      var e = String(explicit).toLowerCase().trim();
      if (VALID[e]) return e;
    }
    var fromUrl = readUrlPrefer();
    if (fromUrl) return fromUrl;
    var fromStore = readStoredPrefer();
    if (fromStore) return fromStore;
    return 'webgl';
  }

  function syncProbeGpu() {
    var nav = global.navigator;
    if (!nav || !nav.gpu) {
      return {
        available: false,
        reason: 'navigator.gpu not present',
        adapterInfo: null,
        pending: false
      };
    }
    return {
      available: null, // unknown until requestAdapter resolves
      reason: 'navigator.gpu present; adapter probe pending',
      adapterInfo: null,
      pending: true
    };
  }

  function summarizeAdapter(adapter) {
    if (!adapter) return null;
    var info = {};
    try {
      if (adapter.name) info.name = adapter.name;
      if (adapter.features && typeof adapter.features.forEach === 'function') {
        var feats = [];
        adapter.features.forEach(function (f) { feats.push(f); });
        info.features = feats.slice(0, 24);
      }
      if (adapter.limits) {
        info.limits = {
          maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
          maxBindGroups: adapter.limits.maxBindGroups
        };
      }
      // Newer browsers may expose requestAdapterInfo
      if (typeof adapter.requestAdapterInfo === 'function') {
        info.hasRequestAdapterInfo = true;
      }
    } catch (_) {}
    return info;
  }

  /**
   * Detect WebGPU. Sync path returns cache or immediate navigator.gpu probe.
   * Also kicks an async requestAdapter fill when possible.
   * @returns {{ available: boolean|null, reason?: string, adapterInfo?: object|null, pending?: boolean }}
   */
  function detectWebGPU() {
    if (detectCache && detectCache.available !== null && !detectCache.pending) {
      return Object.assign({}, detectCache);
    }

    var probe = syncProbeGpu();
    if (!probe.pending) {
      detectCache = {
        available: false,
        reason: probe.reason,
        adapterInfo: null,
        pending: false
      };
      return Object.assign({}, detectCache);
    }

    // Start async adapter request once
    if (!detectPromise && global.navigator && global.navigator.gpu &&
        typeof global.navigator.gpu.requestAdapter === 'function') {
      detectPromise = global.navigator.gpu.requestAdapter()
        .then(function (adapter) {
          if (!adapter) {
            detectCache = {
              available: false,
              reason: 'requestAdapter returned null',
              adapterInfo: null,
              pending: false
            };
            return detectCache;
          }
          detectCache = {
            available: true,
            reason: null,
            adapterInfo: summarizeAdapter(adapter),
            pending: false
          };
          // Best-effort adapter info enrichment
          try {
            if (adapter && typeof adapter.requestAdapterInfo === 'function') {
              return adapter.requestAdapterInfo().then(function (ai) {
                if (ai && detectCache) {
                  detectCache.adapterInfo = Object.assign({}, detectCache.adapterInfo || {}, {
                    vendor: ai.vendor,
                    architecture: ai.architecture,
                    device: ai.device,
                    description: ai.description
                  });
                }
                return detectCache;
              }).catch(function () { return detectCache; });
            }
          } catch (_) {}
          return detectCache;
        })
        .catch(function (err) {
          detectCache = {
            available: false,
            reason: 'requestAdapter failed: ' + (err && err.message ? err.message : String(err)),
            adapterInfo: null,
            pending: false
          };
          return detectCache;
        });
    }

    if (!detectCache) {
      detectCache = {
        available: null,
        reason: probe.reason,
        adapterInfo: null,
        pending: true
      };
    }
    return Object.assign({}, detectCache);
  }

  /** @returns {Promise<object>} resolves when adapter probe settles (or immediately if done). */
  function detectWebGPUAsync() {
    detectWebGPU();
    if (detectPromise) return detectPromise.then(function () { return Object.assign({}, detectCache); });
    return Promise.resolve(Object.assign({}, detectCache || syncProbeGpu()));
  }

  function collectWebGLCapabilities(renderer) {
    var caps = {
      backend: 'webgl',
      notes: []
    };
    try {
      if (renderer && renderer.capabilities) {
        caps.maxTextures = renderer.capabilities.maxTextures;
        caps.maxVertexTextures = renderer.capabilities.maxVertexTextures;
        caps.maxTextureSize = renderer.capabilities.maxTextureSize;
        caps.maxCubemapSize = renderer.capabilities.maxCubemapSize;
        caps.precision = renderer.capabilities.precision;
        caps.logarithmicDepthBuffer = !!renderer.capabilities.logarithmicDepthBuffer;
        caps.isWebGL2 = !!renderer.capabilities.isWebGL2;
        if (caps.isWebGL2) caps.notes.push('WebGL2 context');
        else caps.notes.push('WebGL1 context');
      }
    } catch (_) {
      caps.notes.push('capabilities read failed');
    }
    try {
      if (renderer && renderer.getContext) {
        var gl = renderer.getContext();
        if (gl) {
          var dbg = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
          if (dbg) {
            caps.vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
            caps.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
          }
        }
      }
    } catch (_) {}
    return caps;
  }

  function createWebGLRenderer(THREE, opts) {
    opts = opts || {};
    var params = {
      antialias: opts.antialias !== false,
      powerPreference: opts.powerPreference || 'high-performance'
    };
    if (opts.canvas) params.canvas = opts.canvas;
    var renderer = new THREE.WebGLRenderer(params);
    return renderer;
  }

  /**
   * Attempt THREE.WebGPURenderer only if present on the loaded THREE (r128: absent).
   * Does NOT import or load any alternate Three build.
   */
  function tryCreateWebGPURenderer(THREE, opts) {
    opts = opts || {};
    if (!THREE || typeof THREE.WebGPURenderer !== 'function') {
      return {
        ok: false,
        reason: 'THREE.WebGPURenderer not present on loaded Three (r' +
          threeRevision(THREE) + '). Real WebGPU needs a Three upgrade (v9.2+). No second CDN loaded in v9.1.'
      };
    }
    try {
      var params = {
        antialias: opts.antialias !== false,
        powerPreference: opts.powerPreference || 'high-performance'
      };
      if (opts.canvas) params.canvas = opts.canvas;
      var gpuRenderer = new THREE.WebGPURenderer(params);
      // Some WebGPURenderer builds are async-init; if init exists, caller may await —
      // v9.1 treats sync construction success as enough; failures still fall back.
      return { ok: true, renderer: gpuRenderer, reason: null };
    } catch (err) {
      return {
        ok: false,
        reason: 'THREE.WebGPURenderer construct failed: ' + (err && err.message ? err.message : String(err))
      };
    }
  }

  /**
   * Create a renderer. Prefer WebGL unless prefer/URL/localStorage asks for webgpu.
   * @param {{ THREE: object, canvas?: HTMLCanvasElement, antialias?: boolean, powerPreference?: string, prefer?: string }} options
   * @returns {{ renderer: object, backend: string, webgpuAvailable: boolean|null, fallbackReason: string|null, capabilities: object, dispose: function }}
   */
  function create(options) {
    options = options || {};
    var THREE = options.THREE || global.THREE;
    if (!THREE || typeof THREE.WebGLRenderer !== 'function') {
      throw new Error('[LUNCBattle.renderer] THREE.WebGLRenderer required');
    }

    var prefer = resolvePreference(options.prefer);
    var gpuDetect = detectWebGPU();
    var webgpuAvailable = gpuDetect.available;
    var fallbackReason = null;
    var backend = 'webgl';
    var renderer = null;
    var capabilities = null;

    if (prefer === 'webgpu') {
      var attempt = tryCreateWebGPURenderer(THREE, options);
      if (attempt.ok) {
        renderer = attempt.renderer;
        backend = 'webgpu';
        fallbackReason = null;
        capabilities = {
          backend: 'webgpu',
          notes: [
            'Experimental WebGPURenderer path',
            'Full WebGPU pipeline still requires Three upgrade validation (v9.2+)'
          ],
          adapterInfo: (detectCache && detectCache.adapterInfo) || null
        };
      } else {
        fallbackReason = attempt.reason;
        try {
          if (typeof console !== 'undefined' && console.info) {
            console.info('[LUNCBattle.renderer] WebGPU requested → fallback to WebGL:', fallbackReason);
          }
        } catch (_) {}
        renderer = createWebGLRenderer(THREE, options);
        backend = 'webgl';
        capabilities = collectWebGLCapabilities(renderer);
        capabilities.notes = (capabilities.notes || []).concat(['fallback from webgpu preference']);
      }
    } else {
      renderer = createWebGLRenderer(THREE, options);
      backend = 'webgl';
      capabilities = collectWebGLCapabilities(renderer);
    }

    lastCreate = {
      prefer: prefer,
      backend: backend,
      webgpuAvailable: webgpuAvailable,
      fallbackReason: fallbackReason,
      threeRevision: threeRevision(THREE),
      capabilities: capabilities
    };

    // Publish for overlay / battle-engine
    LB.rendererBackend = backend;
    LB.rendererState = getState();

    function dispose() {
      try {
        if (renderer && typeof renderer.dispose === 'function') renderer.dispose();
      } catch (_) {}
    }

    return {
      renderer: renderer,
      backend: backend,
      webgpuAvailable: webgpuAvailable,
      fallbackReason: fallbackReason,
      capabilities: capabilities,
      dispose: dispose
    };
  }

  function getState() {
    var THREE = global.THREE;
    var det = detectCache || detectWebGPU();
    return {
      rendererType: lastCreate.prefer || resolvePreference(),
      webgpuAvailable: det.available === true ? true : (det.available === false ? false : null),
      webgpuReason: det.reason || null,
      activeBackend: lastCreate.backend || 'webgl',
      fallbackReason: lastCreate.fallbackReason || null,
      threeRevision: lastCreate.threeRevision || threeRevision(THREE),
      preferResolved: resolvePreference(),
      storageKey: STORAGE_KEY,
      capabilities: lastCreate.capabilities,
      notes: [
        'Default renderer is WebGL (Three r128) — matches v8.8',
        'WebGPU experimental via ?renderer=webgpu or localStorage luncBattle.renderer=webgpu',
        'THREE.WebGPURenderer not in r128 CDN — expect WebGL fallback in v9.1',
        'Real WebGPU needs Three upgrade in v9.2+'
      ]
    };
  }

  function applyPixelRatio(renderer, dpr) {
    if (!renderer || typeof renderer.setPixelRatio !== 'function') return;
    var v = +dpr;
    if (!(v > 0) || !isFinite(v)) return;
    try { renderer.setPixelRatio(v); } catch (_) {}
  }

  function getInfo(renderer) {
    try {
      if (renderer && renderer.info) return renderer.info;
    } catch (_) {}
    return null;
  }

  function setStoredPreference(pref) {
    var p = String(pref || '').toLowerCase().trim();
    if (!VALID[p]) return false;
    try { localStorage.setItem(STORAGE_KEY, p); return true; } catch (_) { return false; }
  }

  var api = {
    version: 'v9.1+v9.2',
    STORAGE_KEY: STORAGE_KEY,
    detectWebGPU: detectWebGPU,
    detectWebGPUAsync: detectWebGPUAsync,
    resolvePreference: resolvePreference,
    create: create,
    getState: getState,
    applyPixelRatio: applyPixelRatio,
    getInfo: getInfo,
    setStoredPreference: setStoredPreference
  };

  LB.renderer = api;

  // Kick async GPU probe early (non-blocking) so overlay can show availability later
  try { detectWebGPU(); } catch (_) {}
})(window);
