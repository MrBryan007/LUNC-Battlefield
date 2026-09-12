/* LUNC Battlefield v9.4.7 — CPU / frame-cadence diagnostic harness (dev-only) */
(function (global) {
  'use strict';

  var LB = global.LUNCBattle = global.LUNCBattle || {};

  var params;
  try { params = new URLSearchParams(location.search); } catch (_) { params = new URLSearchParams(); }

  var SCENE_ORDER = ['renderer', 'terrain', 'structures', 'ground', 'air', 'fx', 'full'];

  function parseScene(raw) {
    var s = String(raw || 'full').toLowerCase();
    return SCENE_ORDER.indexOf(s) >= 0 ? s : 'full';
  }

  function parseDpr(raw) {
    if (raw == null || raw === '') return null;
    var n = Number(raw);
    if (!(n > 0) || n > 3) return null;
    return n;
  }

  var enabled = params.get('diag') === '1' || params.get('cadence') === '1';
  var scene = parseScene(params.get('scene'));
  var dprOverride = parseDpr(params.get('dpr'));
  var shadowsOff = params.get('shadows') === '0';
  var fxOff = params.get('fx') === '0';
  var airOff = params.get('air') === '0';

  var sceneRank = SCENE_ORDER.indexOf(scene);

  /** Progressive tiers: each includes all lower layers. */
  function sceneIncludes(layer) {
    var want = SCENE_ORDER.indexOf(String(layer || '').toLowerCase());
    if (want < 0) return true;
    return sceneRank >= want;
  }

  var flags = Object.freeze({
    enabled: enabled,
    scene: scene,
    dpr: dprOverride,
    shadowsOff: shadowsOff,
    fxOff: fxOff || !sceneIncludes('fx'),
    airOff: airOff || !sceneIncludes('air'),
    groundOff: !sceneIncludes('ground'),
    terrainOff: !sceneIncludes('terrain'),
    structuresOff: !sceneIncludes('structures')
  });

  // ---- counters / timers (diag only) ----
  var rafN = 0;
  var renderN = 0;
  var simN = 0;
  var windowStart = 0;
  var lastLogAt = 0;
  var TIMER_KEYS = ['units', 'air', 'effects', 'lod', 'minimap', 'quality', 'render'];
  var timers = Object.create(null);
  var timerCounts = Object.create(null);
  TIMER_KEYS.forEach(function (k) { timers[k] = 0; timerCounts[k] = 0; });

  var overlayEl = null;
  var lastSnapshot = null;
  var rendererRef = null;
  var perfFpsFn = null;

  function resetWindow(now) {
    rafN = 0;
    renderN = 0;
    simN = 0;
    TIMER_KEYS.forEach(function (k) { timers[k] = 0; timerCounts[k] = 0; });
    windowStart = now || performance.now();
  }

  function markRaf() {
    if (!enabled) return;
    rafN++;
  }

  function markSim() {
    if (!enabled) return;
    simN++;
  }

  function markRender() {
    if (!enabled) return;
    renderN++;
  }

  function time(name, fn) {
    if (!enabled) {
      return fn();
    }
    var t0 = performance.now();
    var out;
    try { out = fn(); } finally {
      var ms = performance.now() - t0;
      if (timers[name] != null) {
        timers[name] += ms;
        timerCounts[name]++;
      }
    }
    return out;
  }

  function rankedTimers(elapsedSec) {
    var rows = TIMER_KEYS.map(function (k) {
      var total = timers[k] || 0;
      var n = timerCounts[k] || 0;
      return {
        name: k,
        totalMs: total,
        avgMs: n ? total / n : 0,
        pct: elapsedSec > 0 ? (total / (elapsedSec * 1000)) * 100 : 0
      };
    });
    rows.sort(function (a, b) { return b.totalMs - a.totalMs; });
    return rows;
  }

  function sizeReadout(renderer) {
    var canvas = renderer && renderer.domElement;
    var cssW = canvas ? canvas.clientWidth : 0;
    var cssH = canvas ? canvas.clientHeight : 0;
    var dbW = 0, dbH = 0;
    try {
      if (renderer && renderer.getDrawingBufferSize) {
        var v = new (global.THREE && THREE.Vector2 ? THREE.Vector2 : function () { this.x = 0; this.y = 0; })();
        renderer.getDrawingBufferSize(v);
        dbW = v.x; dbH = v.y;
      } else if (canvas) {
        dbW = canvas.width; dbH = canvas.height;
      }
    } catch (_) {
      if (canvas) { dbW = canvas.width; dbH = canvas.height; }
    }
    var dpr = (typeof devicePixelRatio === 'number') ? devicePixelRatio : 1;
    var pr = 0;
    try { pr = renderer && renderer.getPixelRatio ? renderer.getPixelRatio() : 0; } catch (_) {}
    return {
      css: cssW + '×' + cssH,
      drawingBuffer: dbW + '×' + dbH,
      devicePixelRatio: +dpr.toFixed(3),
      rendererPixelRatio: +Number(pr).toFixed(3)
    };
  }

  function ensureOverlay() {
    if (!enabled) return null;
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'cadenceOverlay';
    overlayEl.className = 'cadence-overlay';
    overlayEl.setAttribute('aria-hidden', 'false');
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function formatRanked(rows) {
    return rows.map(function (r) {
      return r.name + ' ' + r.avgMs.toFixed(2) + 'ms (' + r.pct.toFixed(0) + '%)';
    }).join(' · ');
  }

  function snapshot(now) {
    now = now || performance.now();
    if (!windowStart) windowStart = now;
    var elapsed = Math.max(0.001, (now - windowStart) / 1000);
    var perfFps = null;
    try {
      if (typeof perfFpsFn === 'function') perfFps = perfFpsFn();
      else if (LB.quality && LB.quality.getState) perfFps = LB.quality.getState().fps;
    } catch (_) {}
    var sizes = sizeReadout(rendererRef);
    var ranked = rankedTimers(elapsed);
    var snap = {
      t: now,
      elapsedSec: +elapsed.toFixed(2),
      rafPerSec: +(rafN / elapsed).toFixed(1),
      renderPerSec: +(renderN / elapsed).toFixed(1),
      simPerSec: +(simN / elapsed).toFixed(1),
      perfFps: perfFps != null ? +Number(perfFps).toFixed(1) : null,
      ranked: ranked,
      sizes: sizes,
      scene: scene,
      flags: {
        dpr: dprOverride,
        shadowsOff: shadowsOff,
        fxOff: flags.fxOff,
        airOff: flags.airOff
      }
    };
    lastSnapshot = snap;
    return snap;
  }

  function publish(snap) {
    ensureOverlay();
    if (overlayEl) {
      var r = snap.ranked;
      var top = r.slice(0, 4).map(function (x) {
        return '<div>' + x.name + ' <b>' + x.avgMs.toFixed(2) + 'ms</b> · ' + x.pct.toFixed(0) + '%</div>';
      }).join('');
      overlayEl.innerHTML =
        '<div class="cadence-title">CADENCE · v9.4.7</div>' +
        '<div>RAF/s <b>' + snap.rafPerSec + '</b> · render/s <b>' + snap.renderPerSec + '</b> · sim/s <b>' + snap.simPerSec + '</b></div>' +
        '<div>PERF FPS <b>' + (snap.perfFps != null ? snap.perfFps : '—') + '</b> · scene <b>' + snap.scene + '</b></div>' +
        '<div>CSS <b>' + snap.sizes.css + '</b> · DB <b>' + snap.sizes.drawingBuffer + '</b></div>' +
        '<div>dPR dev <b>' + snap.sizes.devicePixelRatio + '</b> · ren <b>' + snap.sizes.rendererPixelRatio + '</b>' +
        (snap.flags.dpr != null ? (' · override <b>' + snap.flags.dpr + '</b>') : '') + '</div>' +
        '<div class="cadence-rank-title">CPU (avg/frame, ranked)</div>' + top;
    }
    try {
      console.info(
        '[cadence]',
        'RAF/s=' + snap.rafPerSec,
        'render/s=' + snap.renderPerSec,
        'sim/s=' + snap.simPerSec,
        'PERF=' + snap.perfFps,
        'scene=' + snap.scene,
        formatRanked(snap.ranked),
        'css=' + snap.sizes.css,
        'db=' + snap.sizes.drawingBuffer,
        'dpr=' + snap.sizes.devicePixelRatio + '/' + snap.sizes.rendererPixelRatio
      );
    } catch (_) {}
  }

  /** Call once per animate() after work; logs every ~2s. */
  function endFrame(renderer) {
    if (!enabled) return null;
    if (renderer) rendererRef = renderer;
    var now = performance.now();
    if (!windowStart) windowStart = now;
    if (now - lastLogAt < 2000) return lastSnapshot;
    var snap = snapshot(now);
    publish(snap);
    lastLogAt = now;
    resetWindow(now);
    return snap;
  }

  function bindRenderer(renderer) {
    rendererRef = renderer || null;
  }

  function setPerfFpsProvider(fn) {
    perfFpsFn = typeof fn === 'function' ? fn : null;
  }

  function applyAbHooks(renderer, sun) {
    if (!renderer) return;
    if (dprOverride != null) {
      try {
        if (LB.renderer && typeof LB.renderer.applyPixelRatio === 'function') {
          LB.renderer.applyPixelRatio(renderer, dprOverride);
        } else {
          renderer.setPixelRatio(dprOverride);
        }
      } catch (_) {
        try { renderer.setPixelRatio(dprOverride); } catch (__) {}
      }
    }
    if (shadowsOff) {
      try {
        if (renderer.shadowMap) renderer.shadowMap.enabled = false;
        if (sun) sun.castShadow = false;
      } catch (_) {}
    }
  }

  function bootBanner() {
    if (!enabled && scene === 'full' && dprOverride == null && !shadowsOff && !fxOff && !airOff) return;
    try {
      console.info(
        '[cadence] v9.4.7 hooks',
        'diag=' + enabled,
        'scene=' + scene,
        'dpr=' + dprOverride,
        'shadowsOff=' + shadowsOff,
        'fxOff=' + flags.fxOff,
        'airOff=' + flags.airOff
      );
    } catch (_) {}
    if (enabled) {
      try {
        if (LB.quality && LB.quality.setOverlayVisible) LB.quality.setOverlayVisible(true);
      } catch (_) {}
      ensureOverlay();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootBanner);
  } else {
    bootBanner();
  }

  LB.cadence = {
    version: 'v9.4.7',
    flags: flags,
    SCENE_ORDER: SCENE_ORDER,
    sceneIncludes: sceneIncludes,
    markRaf: markRaf,
    markSim: markSim,
    markRender: markRender,
    time: time,
    endFrame: endFrame,
    bindRenderer: bindRenderer,
    setPerfFpsProvider: setPerfFpsProvider,
    applyAbHooks: applyAbHooks,
    sizeReadout: sizeReadout,
    getLastSnapshot: function () { return lastSnapshot; },
    enabled: enabled
  };
})(window);
