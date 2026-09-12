/* LUNC Battlefield v9.4.5 — graphics quality + PERF recovery (throttled UI) */
(function (global) {
  'use strict';

  var LB = global.LUNCBattle = global.LUNCBattle || {};

  var STORAGE_KEY = 'luncBattle.graphicsQuality';
  var PERF_KEY = 'luncBattle.perfOverlay';

  var MODES = Object.freeze({
    AUTO: 'AUTO',
    LOW: 'LOW',
    MEDIUM: 'MEDIUM',
    HIGH: 'HIGH',
    ULTRA: 'ULTRA'
  });

  var FEED_STATES = Object.freeze({
    LIVE: 'LIVE',
    DEGRADED: 'DEGRADED',
    STALE: 'STALE',
    RATE_LIMITED: 'RATE_LIMITED',
    CORS_BLOCKED: 'CORS_BLOCKED',
    OFFLINE: 'OFFLINE',
    UNAVAILABLE: 'UNAVAILABLE',
    RECONNECTING: 'RECONNECTING'
  });

  /**
   * Authoritative LOD enter distances + hysteresis (world units).
   * lod.js MUST read these via getEffectivePreset().lod — do not retune elsewhere.
   * LOW 16/32/55 h3 · MED 20/40/65 h4 · HIGH 24/44/70 h4 · ULTRA 30/52/82 h5
   */
  var DEFAULT_LOD = Object.freeze({
    LOD0: 24,
    LOD1: 44,
    LOD2: 70,
    LOD3: 999,
    hysteresis: 4
  });

  function clonePreset(p) {
    return {
      pixelRatioCap: p.pixelRatioCap,
      renderScale: p.renderScale,
      shadows: p.shadows,
      shadowMapSize: p.shadowMapSize,
      unitDetail: p.unitDetail,
      envDensity: p.envDensity,
      vegetationDensity: p.vegetationDensity,
      particles: p.particles,
      smoke: p.smoke,
      explosions: p.explosions,
      projectiles: p.projectiles,
      scorches: p.scorches,
      minimapHz: p.minimapHz,
      animComplexity: p.animComplexity,
      lightingComplexity: p.lightingComplexity,
      structureDetail: p.structureDetail,
      effectDurationScale: p.effectDurationScale,
      unitUpdateDivisor: p.unitUpdateDivisor,
      shadowCast: p.shadowCast,
      lod: Object.assign({}, p.lod || DEFAULT_LOD),
      postFxHooks: p.postFxHooks || { bloom: false, ao: false, sharpen: false },
      textureLodHooks: p.textureLodHooks || { maxAnisotropy: 1, preferCompressed: false }
    };
  }

  var PRESETS = Object.freeze({
    LOW: Object.freeze(clonePreset({
      pixelRatioCap: 1.0,
      renderScale: 0.72,
      shadows: 'off',
      shadowMapSize: 512,
      unitDetail: 'low',
      envDensity: 0.35,
      vegetationDensity: 0.30,
      particles: 36,
      smoke: 4,
      explosions: 3,
      projectiles: 20,
      scorches: 8,
      minimapHz: 7,
      animComplexity: 'low',
      lightingComplexity: 'low',
      structureDetail: 'low',
      effectDurationScale: 0.72,
      unitUpdateDivisor: 2,
      shadowCast: 'major',
      lod: { LOD0: 16, LOD1: 32, LOD2: 55, LOD3: 999, hysteresis: 3 },
      postFxHooks: { bloom: false, ao: false, sharpen: false },
      textureLodHooks: { maxAnisotropy: 1, preferCompressed: true }
    })),
    MEDIUM: Object.freeze(clonePreset({
      pixelRatioCap: 1.35,
      renderScale: 0.88,
      shadows: 'basic',
      shadowMapSize: 1024,
      unitDetail: 'medium',
      envDensity: 0.60,
      vegetationDensity: 0.55,
      particles: 70,
      smoke: 8,
      explosions: 5,
      projectiles: 32,
      scorches: 14,
      minimapHz: 8,
      animComplexity: 'medium',
      lightingComplexity: 'medium',
      structureDetail: 'medium',
      effectDurationScale: 0.9,
      unitUpdateDivisor: 1,
      shadowCast: 'bases',
      lod: { LOD0: 20, LOD1: 40, LOD2: 65, LOD3: 999, hysteresis: 4 },
      postFxHooks: { bloom: false, ao: false, sharpen: false },
      textureLodHooks: { maxAnisotropy: 2, preferCompressed: false }
    })),
    HIGH: Object.freeze(clonePreset({
      pixelRatioCap: 1.6,
      renderScale: 1.0,
      shadows: 'soft',
      shadowMapSize: 2048,
      unitDetail: 'high',
      envDensity: 0.85,
      vegetationDensity: 0.85,
      particles: 120,
      smoke: 16,
      explosions: 8,
      projectiles: 48,
      scorches: 24,
      minimapHz: 8,
      animComplexity: 'high',
      lightingComplexity: 'high',
      structureDetail: 'high',
      effectDurationScale: 1.0,
      unitUpdateDivisor: 1,
      shadowCast: 'rich',
      lod: { LOD0: 24, LOD1: 44, LOD2: 70, LOD3: 999, hysteresis: 4 },
      postFxHooks: { bloom: false, ao: false, sharpen: false },
      textureLodHooks: { maxAnisotropy: 4, preferCompressed: false }
    })),
    ULTRA: Object.freeze(clonePreset({
      pixelRatioCap: 1.8,
      renderScale: 1.0,
      shadows: 'soft',
      shadowMapSize: 2048,
      unitDetail: 'ultra',
      envDensity: 1.0,
      vegetationDensity: 1.0,
      particles: 160,
      smoke: 20,
      explosions: 10,
      projectiles: 56,
      scorches: 28,
      minimapHz: 10,
      animComplexity: 'ultra',
      lightingComplexity: 'ultra',
      structureDetail: 'ultra',
      effectDurationScale: 1.05,
      unitUpdateDivisor: 1,
      shadowCast: 'rich',
      lod: { LOD0: 30, LOD1: 52, LOD2: 82, LOD3: 999, hysteresis: 5 },
      postFxHooks: { bloom: false, ao: false, sharpen: false },
      textureLodHooks: { maxAnisotropy: 8, preferCompressed: false }
    }))
  });

  var PRESET_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'];

  function isMobileFlag() {
    try {
      return !!(global.matchMedia && global.matchMedia('(max-width: 760px)').matches) ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    } catch (_) {
      return (global.innerWidth || 1024) < 760;
    }
  }

  function hardwareScore() {
    var dpr = global.devicePixelRatio || 1;
    var w = global.innerWidth || 1280;
    var h = global.innerHeight || 720;
    var cores = (navigator && navigator.hardwareConcurrency) || 4;
    var mobile = isMobileFlag();
    var mem = (navigator && navigator.deviceMemory) || 0;
    var score = 0;
    if (mobile) score -= 2;
    if (dpr >= 2.5) score -= 1;
    else if (dpr <= 1.25) score += 1;
    if (w * h >= 1920 * 1080) score += 1;
    if (w * h <= 1280 * 720) score -= 1;
    if (cores >= 8) score += 1;
    if (cores <= 4) score -= 1;
    if (mem && mem <= 4) score -= 1;
    if (mem && mem >= 8) score += 1;
    return { score: score, dpr: dpr, cores: cores, mobile: mobile, mem: mem, res: w + 'x' + h };
  }

  function pickInitialAuto(renderer) {
    var hw = hardwareScore();
    var score = hw.score;
    try {
      if (renderer && renderer.info && renderer.info.memory) {
        var geo = renderer.info.memory.geometries || 0;
        if (geo > 400) score -= 1;
      }
    } catch (_) {}
    if (hw.mobile || score <= -2) return 'LOW';
    if (score <= 0) return 'MEDIUM';
    if (score <= 2) return 'HIGH';
    return 'ULTRA';
  }

  function readStoredMode() {
    try {
      var v = localStorage.getItem(STORAGE_KEY);
      if (v && (v === 'AUTO' || PRESETS[v])) return v;
    } catch (_) {}
    return 'AUTO';
  }

  function writeStoredMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (_) {}
  }

  function wantPerfOverlay() {
    try {
      if (new URLSearchParams(location.search).get('perf') === '1') return true;
      if (localStorage.getItem(PERF_KEY) === '1') return true;
    } catch (_) {}
    return false;
  }

  // ---- mutable runtime state ----
  var userMode = readStoredMode();
  var autoLevel = 'MEDIUM';
  var effectiveName = userMode === 'AUTO' ? autoLevel : userMode;
  var applied = clonePreset(PRESETS[effectiveName] || PRESETS.MEDIUM);
  var currentRenderScale = applied.renderScale;
  var targetRenderScale = applied.renderScale;
  var currentPixelRatio = Math.min(global.devicePixelRatio || 1, applied.pixelRatioCap) * currentRenderScale;

  var rendererRef = null;
  var sceneRef = null;
  var sunRef = null;
  var fillRef = null;
  var hemiRef = null;
  var rimRef = null;
  var accentLightsRef = null;

  // FPS / dyn-res adaptation
  var frameTimes = [];
  var frameAccum = 0;
  var frameCount = 0;
  var lastAdaptAt = 0;
  var lastLevelChangeAt = 0;
  var adaptCooldownMs = 8000;
  var levelCooldownMs = 12000;
  var fpsEma = 60;
  var frameMsEma = 16.7;
  var low1pctMs = 16.7;
  var sortedBuf = [];
  var ADAPT_HYST_DOWN = 28; // sustained below → drop
  var ADAPT_HYST_UP = 54;   // sustained above → raise
  var SCALE_STEP = 0.04;
  var SCALE_MIN = 0.55;
  var SCALE_MAX = 1.0;

  // Feed health (diagnostics only — never a graphics failure)
  var feeds = Object.create(null);
  var FEED_NAMES = [
    'binanceWs', 'binanceVision', 'coingecko', 'defillama', 'backend', 'terra'
  ];
  FEED_NAMES.forEach(function (n) {
    feeds[n] = { state: FEED_STATES.UNAVAILABLE, detail: '', updatedAt: 0 };
  });

  // Counts callback for overlay
  var countsProvider = null;

  // Overlay DOM
  var overlayEl = null;
  var overlayVisible = false;
  var overlayAccum = 0;

  function getEffectiveName() {
    return userMode === 'AUTO' ? autoLevel : userMode;
  }

  function getEffectivePreset() {
    return clonePreset(PRESETS[getEffectiveName()] || PRESETS.MEDIUM);
  }

  function syncAppliedFromEffective() {
    var name = getEffectiveName();
    effectiveName = name;
    var p = PRESETS[name] || PRESETS.MEDIUM;
    applied = clonePreset(p);
    targetRenderScale = applied.renderScale;
    // Don't jump scale instantly — tick() eases toward target
  }

  function classifyHttp(status, errMsg) {
    var msg = String(errMsg || '');
    var s = +status || 0;
    if (!s) {
      var m = /HTTP\s+(\d+)/i.exec(msg);
      if (m) s = +m[1];
    }
    if (s === 429) return FEED_STATES.RATE_LIMITED;
    if (s === 451) return FEED_STATES.CORS_BLOCKED; // geo/legal block — feed diagnostic, not graphics failure
    if (/CORS|Failed to fetch|NetworkError|blocked by CORS/i.test(msg)) return FEED_STATES.CORS_BLOCKED;
    if (s === 0 && /fetch|network|offline/i.test(msg)) return FEED_STATES.OFFLINE;
    if (s >= 500) return FEED_STATES.DEGRADED;
    if (s >= 400) return FEED_STATES.UNAVAILABLE;
    return FEED_STATES.UNAVAILABLE;
  }

  function reportFeed(name, state, detail) {
    if (!name) return;
    var key = String(name);
    if (!feeds[key]) feeds[key] = { state: FEED_STATES.UNAVAILABLE, detail: '', updatedAt: 0 };
    var st = String(state || FEED_STATES.UNAVAILABLE).toUpperCase();
    if (!FEED_STATES[st]) {
      // allow aliases
      if (st === 'OK' || st === 'CONNECTED') st = FEED_STATES.LIVE;
      else if (st === 'ERROR') st = FEED_STATES.OFFLINE;
      else if (st === 'GEO_BLOCKED' || st === 'HTTP_451') st = FEED_STATES.CORS_BLOCKED;
      else if (st === 'HTTP_429') st = FEED_STATES.RATE_LIMITED;
      else st = FEED_STATES.UNAVAILABLE;
    }
    feeds[key].state = st;
    feeds[key].detail = detail != null ? String(detail) : '';
    feeds[key].updatedAt = Date.now();
  }

  function getFeedHealth() {
    var out = {};
    Object.keys(feeds).forEach(function (k) {
      out[k] = Object.assign({}, feeds[k]);
    });
    return out;
  }

  function getLodBand(distance) {
    // Prefer true LOD module (v9.4) when present — hysteresis is per-object via lod.resolveLod
    try {
      if (LB.lod && LB.lod.getLodBand) return LB.lod.getLodBand(distance);
    } catch (_) {}
    var d = +distance || 0;
    var lod = applied.lod || DEFAULT_LOD;
    if (d <= lod.LOD0) return 0;
    if (d <= lod.LOD1) return 1;
    if (d <= lod.LOD2) return 2;
    return 3;
  }

  /**
   * Apply graphics settings to an existing WebGLRenderer — NEVER recreates it.
   */
  function apply(renderer, scene, sun, opts) {
    opts = opts || {};
    rendererRef = renderer || rendererRef;
    sceneRef = scene || sceneRef;
    sunRef = sun || sunRef;
    if (opts.fillLight) fillRef = opts.fillLight;
    if (opts.hemiLight) hemiRef = opts.hemiLight;
    if (opts.rimLight) rimRef = opts.rimLight;
    if (opts.accentLights) accentLightsRef = opts.accentLights;

    syncAppliedFromEffective();
    var p = applied;
    var dpr = global.devicePixelRatio || 1;
    var capped = Math.min(dpr, p.pixelRatioCap);
    targetRenderScale = p.renderScale;
    // Initial apply may set immediately; subsequent AUTO ticks ease
    if (opts.immediate !== false && currentRenderScale === applied.renderScale) {
      currentRenderScale = p.renderScale;
    }
    currentPixelRatio = Math.max(0.5, capped * currentRenderScale);

    if (rendererRef) {
      try {
        if (LB.renderer && typeof LB.renderer.applyPixelRatio === 'function') {
          LB.renderer.applyPixelRatio(rendererRef, currentPixelRatio);
        } else {
          rendererRef.setPixelRatio(currentPixelRatio);
        }
        // Keep buffer size at CSS pixels; pixel ratio carries dyn-res
        rendererRef.setSize(global.innerWidth, global.innerHeight, false);
      } catch (_) {}

      if (p.shadows === 'off') {
        rendererRef.shadowMap.enabled = false;
      } else {
        rendererRef.shadowMap.enabled = true;
        // Basic = hard PCF; soft = PCFSoft
        try {
          var THREE = global.THREE;
          if (THREE) {
            rendererRef.shadowMap.type = (p.shadows === 'soft' && THREE.PCFSoftShadowMap)
              ? THREE.PCFSoftShadowMap
              : (THREE.PCFShadowMap || THREE.BasicShadowMap || THREE.PCFSoftShadowMap);
          }
        } catch (_) {}
      }
      rendererRef.shadowMap.needsUpdate = true;
    }

    if (sunRef) {
      if (p.shadows === 'off') {
        sunRef.castShadow = false;
      } else {
        sunRef.castShadow = true;
        var sz = p.shadowMapSize || 1024;
        try {
          if (sunRef.shadow && sunRef.shadow.mapSize) {
            if (sunRef.shadow.mapSize.x !== sz || sunRef.shadow.mapSize.y !== sz) {
              sunRef.shadow.mapSize.set(sz, sz);
              if (sunRef.shadow.map) {
                sunRef.shadow.map.dispose();
                sunRef.shadow.map = null;
              }
            }
          }
        } catch (_) {}
      }
    }

    // Lighting complexity: scale fill / hemi / rim / accents for PBR (v9.2)
    if (fillRef) {
      if (p.lightingComplexity === 'low') fillRef.intensity = 0.06;
      else if (p.lightingComplexity === 'medium') fillRef.intensity = 0.12;
      else if (p.lightingComplexity === 'ultra') fillRef.intensity = 0.22;
      else fillRef.intensity = 0.18;
    }
    if (hemiRef) {
      if (p.lightingComplexity === 'low') hemiRef.intensity = 0.38;
      else if (p.lightingComplexity === 'medium') hemiRef.intensity = 0.46;
      else if (p.lightingComplexity === 'ultra') hemiRef.intensity = 0.58;
      else hemiRef.intensity = 0.52;
    }
    if (rimRef) {
      if (p.lightingComplexity === 'low') rimRef.intensity = 0;
      else if (p.lightingComplexity === 'medium') rimRef.intensity = 0.04;
      else if (p.lightingComplexity === 'ultra') rimRef.intensity = 0.1;
      else rimRef.intensity = 0.07;
    }
    if (sunRef && sunRef.isDirectionalLight) {
      if (p.lightingComplexity === 'low') sunRef.intensity = 0.88;
      else if (p.lightingComplexity === 'medium') sunRef.intensity = 0.98;
      else if (p.lightingComplexity === 'ultra') sunRef.intensity = 1.12;
      else sunRef.intensity = 1.05;
    }
    if (accentLightsRef && accentLightsRef.length) {
      var accentScale = 1;
      if (p.lightingComplexity === 'low') accentScale = 0.55;
      else if (p.lightingComplexity === 'medium') accentScale = 0.8;
      else if (p.lightingComplexity === 'ultra') accentScale = 1.15;
      for (var ai = 0; ai < accentLightsRef.length; ai++) {
        var al = accentLightsRef[ai];
        if (!al) continue;
        if (al.userData && al.userData.baseIntensity == null) {
          al.userData.baseIntensity = al.intensity;
        }
        var base = (al.userData && al.userData.baseIntensity != null) ? al.userData.baseIntensity : al.intensity;
        al.intensity = base * accentScale;
      }
    }

    // Keep materials registry quality clamps in sync
    try {
      if (LB.materials && typeof LB.materials.applyQuality === 'function') {
        LB.materials.applyQuality(p.lightingComplexity || p.unitDetail || 'high');
      }
    } catch (_) {}

    // Notify listeners (effects/minimap/etc.)
    try {
      var ev = new CustomEvent('lunc-quality-change', {
        detail: { mode: userMode, effective: getEffectiveName(), preset: getEffectivePreset() }
      });
      global.dispatchEvent(ev);
    } catch (_) {}

    return getState();
  }

  function easeRenderScale(dt) {
    var diff = targetRenderScale - currentRenderScale;
    if (Math.abs(diff) < 0.005) {
      currentRenderScale = targetRenderScale;
      return false;
    }
    var step = Math.min(Math.abs(diff), SCALE_STEP * Math.max(1, dt * 60 * 0.35));
    currentRenderScale += Math.sign(diff) * step;
    return true;
  }

  function pushFrameSample(frameMs) {
    frameTimes.push(frameMs);
    if (frameTimes.length > 120) frameTimes.shift();
    frameMsEma = frameMsEma * 0.9 + frameMs * 0.1;
    var fps = frameMs > 0.001 ? 1000 / frameMs : 60;
    fpsEma = fpsEma * 0.9 + fps * 0.1;
    // approx 1% low from recent window
    if (frameTimes.length >= 30) {
      sortedBuf = frameTimes.slice().sort(function (a, b) { return b - a; });
      var idx = Math.max(0, Math.floor(sortedBuf.length * 0.01));
      low1pctMs = sortedBuf[idx];
    }
  }

  function maybeAdaptAuto(now) {
    if (userMode !== 'AUTO') return;
    if (now - lastLevelChangeAt < levelCooldownMs) return;
    if (now - lastAdaptAt < 2500) return;
    lastAdaptAt = now;

    var fps = fpsEma;
    var idx = PRESET_ORDER.indexOf(autoLevel);
    if (idx < 0) idx = 1;

    // Dynamic resolution first (finer grain) before changing preset level
    if (fps < ADAPT_HYST_DOWN && currentRenderScale > SCALE_MIN + 0.02) {
      targetRenderScale = Math.max(SCALE_MIN, targetRenderScale - SCALE_STEP);
    } else if (fps > ADAPT_HYST_UP && currentRenderScale < Math.min(SCALE_MAX, applied.renderScale) - 0.02) {
      targetRenderScale = Math.min(Math.min(SCALE_MAX, applied.renderScale), targetRenderScale + SCALE_STEP);
    }

    // Sustained very low → drop preset (hysteresis: need fps well below)
    if (fps < ADAPT_HYST_DOWN - 4 && targetRenderScale <= SCALE_MIN + 0.03 && idx > 0) {
      autoLevel = PRESET_ORDER[idx - 1];
      lastLevelChangeAt = now;
      syncAppliedFromEffective();
      apply(rendererRef, sceneRef, sunRef, { immediate: false, fillLight: fillRef, hemiLight: hemiRef, rimLight: rimRef, accentLights: accentLightsRef });
      try { updateQualityUi(); } catch (_) {}
      return;
    }
    // Sustained high with scale near preset → raise
    var maxIdx = isMobileFlag() ? PRESET_ORDER.indexOf('HIGH') : PRESET_ORDER.length - 1;
    if (fps > ADAPT_HYST_UP + 4 && currentRenderScale >= Math.min(SCALE_MAX, applied.renderScale) - 0.02 && idx < maxIdx) {
      autoLevel = PRESET_ORDER[idx + 1];
      lastLevelChangeAt = now;
      syncAppliedFromEffective();
      apply(rendererRef, sceneRef, sunRef, { immediate: false, fillLight: fillRef, hemiLight: hemiRef, rimLight: rimRef, accentLights: accentLightsRef });
      try { updateQualityUi(); } catch (_) {}
    }
  }

  function tick(dt, renderer) {
    if (renderer) rendererRef = renderer;
    var frameMs = (dt > 0 && dt < 1) ? dt * 1000 : 16.7;
    pushFrameSample(frameMs);
    frameAccum += dt;
    frameCount++;

    var now = performance.now();
    maybeAdaptAuto(now);

    var changed = easeRenderScale(dt);
    if (changed && rendererRef) {
      var dpr = global.devicePixelRatio || 1;
      var capped = Math.min(dpr, applied.pixelRatioCap);
      currentPixelRatio = Math.max(0.5, capped * currentRenderScale);
      try {
        if (LB.renderer && typeof LB.renderer.applyPixelRatio === 'function') {
          LB.renderer.applyPixelRatio(rendererRef, currentPixelRatio);
        } else {
          rendererRef.setPixelRatio(currentPixelRatio);
        }
      } catch (_) {}
    }

    if (overlayVisible) {
      overlayAccum += dt;
      if (overlayAccum >= 0.5) {
        overlayAccum = 0;
        refreshOverlay();
      }
    }
  }

  function setMode(mode) {
    var m = String(mode || 'AUTO').toUpperCase();
    if (m !== 'AUTO' && !PRESETS[m]) m = 'AUTO';
    userMode = m;
    writeStoredMode(m);
    if (m === 'AUTO') {
      autoLevel = pickInitialAuto(rendererRef);
    }
    syncAppliedFromEffective();
    currentRenderScale = applied.renderScale;
    targetRenderScale = applied.renderScale;
    apply(rendererRef, sceneRef, sunRef, { immediate: true, fillLight: fillRef, hemiLight: hemiRef, rimLight: rimRef, accentLights: accentLightsRef });
    updateQualityUi();
    return getState();
  }

  function getState() {
    return {
      mode: userMode,
      effective: getEffectiveName(),
      label: userMode === 'AUTO' ? ('AUTO · ' + getEffectiveName()) : getEffectiveName(),
      preset: getEffectivePreset(),
      renderScale: +currentRenderScale.toFixed(3),
      targetRenderScale: +targetRenderScale.toFixed(3),
      pixelRatio: +currentPixelRatio.toFixed(3),
      fps: +fpsEma.toFixed(1),
      frameMs: +frameMsEma.toFixed(2),
      low1pctMs: +low1pctMs.toFixed(2),
      feeds: getFeedHealth()
    };
  }

  function setCountsProvider(fn) {
    countsProvider = typeof fn === 'function' ? fn : null;
  }

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'perfOverlay';
    overlayEl.className = 'perf-overlay';
    overlayEl.setAttribute('aria-hidden', 'true');
    overlayEl.innerHTML =
      '<div class="perf-title">PERF · v9.4.5</div>' +
      '<div class="perf-section" id="perfGfx"></div>' +
      '<div class="perf-section" id="perfAssets"></div>' +
      '<div class="perf-section perf-feeds" id="perfFeeds"></div>';
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function refreshOverlay() {
    if (!overlayEl) return;
    var st = getState();
    var info = (rendererRef && rendererRef.info) ? rendererRef.info : null;
    var counts = countsProvider ? (countsProvider() || {}) : {};
    var gfx = document.getElementById('perfGfx');
    var feedEl = document.getElementById('perfFeeds');
    if (gfx) {
      var rs = (LB.renderer && LB.renderer.getState) ? LB.renderer.getState() : null;
      var gpuAvail = rs ? rs.webgpuAvailable : null;
      var gpuLabel = gpuAvail === true ? 'yes' : (gpuAvail === false ? 'no' : 'unknown');
      var activeBackend = (rs && rs.activeBackend) || LB.activeRendererBackend || 'webgl';
      var preferLabel = (rs && rs.rendererType) || (rs && rs.preferResolved) || 'webgl';
      var fb = (rs && rs.fallbackReason) || LB.rendererFallbackReason || '';
      if (fb && fb.length > 72) fb = fb.slice(0, 69) + '…';
      var infoSrc = info;
      if (!infoSrc && LB.renderer && LB.renderer.getInfo) infoSrc = LB.renderer.getInfo(rendererRef);
      gfx.innerHTML =
        '<div>FPS <b>' + st.fps.toFixed(0) + '</b> · avg <b>' + st.frameMs.toFixed(1) + 'ms</b> · 1%low≈ <b>' + st.low1pctMs.toFixed(1) + 'ms</b></div>' +
        '<div>Scale <b>' + st.renderScale.toFixed(2) + '</b> · dPR <b>' + st.pixelRatio.toFixed(2) + '</b> · <b>' + st.label + '</b></div>' +
        '<div>Renderer prefer <b>' + preferLabel + '</b> · Active <b>' + activeBackend + '</b></div>' +
        '<div>WebGPU available <b>' + gpuLabel + '</b></div>' +
        (fb ? '<div>Fallback <b>' + String(fb).replace(/[<>]/g, '') + '</b></div>' : '') +
        '<div>Calls <b>' + (infoSrc && infoSrc.render ? infoSrc.render.calls : '—') + '</b> · Tris <b>' + (infoSrc && infoSrc.render ? infoSrc.render.triangles : '—') + '</b></div>' +
        '<div>Tex <b>' + (infoSrc && infoSrc.memory ? infoSrc.memory.textures : '—') + '</b> · Geo <b>' + (infoSrc && infoSrc.memory ? infoSrc.memory.geometries : '—') + '</b></div>' +
        '<div>Units <b>' + (counts.units != null ? counts.units : '—') + '</b> · Proj <b>' + (counts.projectiles != null ? counts.projectiles : '—') + '</b></div>' +
        '<div>Parts <b>' + (counts.particles != null ? counts.particles : '—') + '</b> · Expl <b>' + (counts.explosions != null ? counts.explosions : '—') + '</b> · Smoke <b>' + (counts.smoke != null ? counts.smoke : '—') + '</b></div>' +
        '<div>Mats <b>' + (counts.materials != null ? counts.materials : (LB.materials && LB.materials.count ? LB.materials.count() : '—')) + '</b>' +
        (counts.materialsShared != null ? (' · shared <b>' + counts.materialsShared + '</b>') : '') + '</div>' +
        '<div>Minimap <b>' + (st.preset.minimapHz || '—') + ' Hz</b></div>';
    }
    var assetsEl = document.getElementById('perfAssets');
    if (assetsEl) {
      var aMode = '—', loaded = '—', failed = '—', pending = '—', tris = '—';
      var glbSp = '—', procSp = '—', spawnNote = '';
      var lodLine = 'LOD0–3 —';
      try {
        if (LB.assets && LB.assets.getStats) {
          var as = LB.assets.getStats();
          aMode = as.effectiveMode || as.mode || '—';
          loaded = as.loaded != null ? as.loaded : (as.assetsLoaded != null ? as.assetsLoaded : '—');
          failed = as.failed != null ? as.failed : '—';
          pending = as.pending != null ? as.pending : '—';
          tris = as.approxTris != null ? as.approxTris : '—';
          glbSp = as.glbSpawned != null ? as.glbSpawned : (as.gltfSpawns != null ? as.gltfSpawns : 0);
          procSp = as.proceduralSpawned != null ? as.proceduralSpawned : (as.proceduralSpawns != null ? as.proceduralSpawns : 0);
          if (as.spawnNote) spawnNote = String(as.spawnNote);
        }
        if (LB.lod && LB.lod.getCounts) {
          var lc = LB.lod.getCounts();
          lodLine = 'LOD0 <b>' + lc.lod0 + '</b> · LOD1 <b>' + lc.lod1 + '</b> · LOD2 <b>' + lc.lod2 + '</b> · LOD3 <b>' + lc.lod3 + '</b>' +
            ' · cull <b>' + (lc.culled || 0) + '</b>';
        }
      } catch (_) {}
      assetsEl.innerHTML =
        '<div class="perf-feed-title">ASSETS</div>' +
        '<div>Mode <b>' + String(aMode).replace(/[<>]/g, '') + '</b></div>' +
        '<div>ASSETS LOADED (cache) <b>' + loaded + '</b> · fail <b>' + failed + '</b> · pend <b>' + pending + '</b></div>' +
        '<div>ASSETS SPAWNED · GLB <b>' + glbSp + '</b> · procedural <b>' + procSp + '</b></div>' +
        '<div>Approx tris (cached) <b>' + tris + '</b></div>' +
        '<div>' + lodLine + '</div>' +
        (spawnNote ? '<div class="micro">' + spawnNote.replace(/[<>]/g, '') + '</div>' : '');
    }
    if (feedEl) {
      var fh = st.feeds;
      var lines = ['<div class="perf-feed-title">FEEDS (diagnostics)</div>'];
      var labels = {
        binanceWs: 'Binance WS',
        binanceVision: 'Binance Vision REST',
        coingecko: 'CoinGecko',
        defillama: 'DefiLlama',
        backend: 'Backend/API',
        terra: 'Terra feeds'
      };
      Object.keys(labels).forEach(function (k) {
        var f = fh[k] || { state: 'UNAVAILABLE', detail: '' };
        lines.push(
          '<div class="feed-row state-' + f.state + '"><span>' + labels[k] + '</span><b>' + f.state + '</b>' +
          (f.detail ? ' <i>' + f.detail.replace(/[<>]/g, '') + '</i>' : '') + '</div>'
        );
      });
      // any extra feeds
      Object.keys(fh).forEach(function (k) {
        if (labels[k]) return;
        var f = fh[k];
        lines.push('<div class="feed-row state-' + f.state + '"><span>' + k + '</span><b>' + f.state + '</b></div>');
      });
      feedEl.innerHTML = lines.join('');
    }
  }

  function setOverlayVisible(on) {
    overlayVisible = !!on;
    ensureOverlay();
    overlayEl.classList.toggle('visible', overlayVisible);
    overlayEl.setAttribute('aria-hidden', overlayVisible ? 'false' : 'true');
    if (overlayVisible) refreshOverlay();
    try { localStorage.setItem(PERF_KEY, overlayVisible ? '1' : '0'); } catch (_) {}
  }

  function toggleOverlay() {
    setOverlayVisible(!overlayVisible);
  }

  function updateQualityUi() {
    var label = document.getElementById('qualityLabel');
    var chip = document.getElementById('qualityChip');
    var sel = document.getElementById('qualitySelect');
    var st = getState();
    if (label) label.textContent = st.label;
    if (chip) chip.textContent = st.label;
    if (sel && sel.value !== userMode) sel.value = userMode;
  }

  function mountQualityUi() {
    if (document.getElementById('qualityPicker')) return;
    // Fixed top-right — must stay above minimap/statusTray (was occluded in tray)
    var wrap = document.createElement('div');
    wrap.id = 'qualityPicker';
    wrap.className = 'quality-picker quality-picker-fixed';
    wrap.innerHTML =
      '<button type="button" id="qualityGear" class="quality-gear" title="Graphics quality" aria-label="Graphics quality" aria-expanded="false">⚙</button>' +
      '<span class="quality-chip" id="qualityChip" aria-hidden="true">AUTO</span>' +
      '<div class="quality-menu" id="qualityMenu" hidden>' +
      '<label class="quality-menu-label">Graphics</label>' +
      '<select id="qualitySelect" aria-label="Graphics quality mode">' +
      '<option value="AUTO">AUTO (recommended)</option>' +
      '<option value="LOW">LOW</option>' +
      '<option value="MEDIUM">MEDIUM</option>' +
      '<option value="HIGH">HIGH</option>' +
      '<option value="ULTRA">ULTRA</option>' +
      '</select>' +
      '<div class="quality-active" id="qualityLabel">AUTO · MEDIUM</div>' +
      '</div>';
    document.body.appendChild(wrap);

    var gear = document.getElementById('qualityGear');
    var menu = document.getElementById('qualityMenu');
    var sel = document.getElementById('qualitySelect');
    gear.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = menu.hasAttribute('hidden');
      if (open) {
        menu.removeAttribute('hidden');
        gear.setAttribute('aria-expanded', 'true');
      } else {
        menu.setAttribute('hidden', '');
        gear.setAttribute('aria-expanded', 'false');
      }
    });
    sel.value = userMode;
    sel.addEventListener('change', function () {
      setMode(sel.value);
    });
    document.addEventListener('pointerdown', function (e) {
      if (!wrap.contains(e.target)) {
        menu.setAttribute('hidden', '');
        gear.setAttribute('aria-expanded', 'false');
      }
    });
    updateQualityUi();
  }

  function initBootstrap() {
    // AUTO initial pick before renderer exists uses HW only
    if (userMode === 'AUTO') {
      autoLevel = pickInitialAuto(null);
    }
    syncAppliedFromEffective();
    currentRenderScale = applied.renderScale;
    targetRenderScale = applied.renderScale;

    function onReady() {
      mountQualityUi();
      if (wantPerfOverlay()) setOverlayVisible(true);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }

    addEventListener('keydown', function (e) {
      if (e.code === 'KeyP' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var t = e.target;
        var tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        e.preventDefault();
        toggleOverlay();
      }
    });
  }

  // Caps helper for effects.js
  function getEffectCaps() {
    var p = applied;
    return {
      projectiles: p.projectiles,
      particles: p.particles,
      explosions: p.explosions,
      smoke: p.smoke,
      scorches: p.scorches,
      effectDurationScale: p.effectDurationScale
    };
  }

  function getDensityScale() {
    return {
      env: applied.envDensity,
      vegetation: applied.vegetationDensity,
      structure: applied.structureDetail === 'low' ? 0.55
        : applied.structureDetail === 'medium' ? 0.75
        : applied.structureDetail === 'high' ? 0.9 : 1
    };
  }

  // Public API
  var api = {
    version: 'v9.4.5',
    MODES: MODES,
    PRESETS: PRESETS,
    FEED_STATES: FEED_STATES,
    STORAGE_KEY: STORAGE_KEY,
    apply: apply,
    tick: tick,
    getState: getState,
    setMode: setMode,
    getEffectivePreset: getEffectivePreset,
    getLodBand: getLodBand,
    reportFeed: reportFeed,
    classifyHttp: classifyHttp,
    getFeedHealth: getFeedHealth,
    getEffectCaps: getEffectCaps,
    getDensityScale: getDensityScale,
    setCountsProvider: setCountsProvider,
    setOverlayVisible: setOverlayVisible,
    toggleOverlay: toggleOverlay,
    updateQualityUi: updateQualityUi,
    pickInitialAuto: pickInitialAuto,
    hardwareScore: hardwareScore,
    /** v9 hooks — documented, no-op stubs for post-FX / texture LOD pipelines */
    postFxHooks: function () { return (applied.postFxHooks || {}); },
    textureLodHooks: function () { return (applied.textureLodHooks || {}); }
  };

  LB.quality = api;
  initBootstrap();
})(window);
