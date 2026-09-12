/* LUNC Battlefield v9.4.8 — non-JS / WebGL stall diagnostic harness (dev-only)
 * Query flags (non-destructive):
 *   ?stall=1 | ?diag=1  → GPU/info panel + WebGL dump
 *   ?mat=basic          → unlit MeshBasic override (geometry unchanged)
 *   ?tex=0              → clear maps/envMaps where safe
 *   ?freeze=1           → freeze sim/LOD/FX/UI updates; keep rendering
 *   ?norender=1         → RAF without renderer.render
 *   ?canvas=1280x800|960x600|640x400|320x200  → internal drawing buffer
 *   ?aa=0               → antialias off (must apply at create)
 *   ?ui=0               → hide PERF/DOM overlays/panels
 *   ?lights=0|1|hemi    → light reduction tests
 */
(function (global) {
  'use strict';

  var LB = global.LUNCBattle = global.LUNCBattle || {};

  var params;
  try { params = new URLSearchParams(location.search); } catch (_) { params = new URLSearchParams(); }

  var CANVAS_PRESETS = {
    '1280x800': [1280, 800],
    '960x600': [960, 600],
    '640x400': [640, 400],
    '320x200': [320, 200]
  };

  function parseCanvas(raw) {
    if (!raw) return null;
    var key = String(raw).toLowerCase().replace(/\s/g, '');
    if (CANVAS_PRESETS[key]) return { w: CANVAS_PRESETS[key][0], h: CANVAS_PRESETS[key][1], key: key };
    var m = key.match(/^(\d{2,4})x(\d{2,4})$/);
    if (!m) return null;
    var w = +m[1], h = +m[2];
    if (w < 64 || h < 64 || w > 3840 || h > 2160) return null;
    return { w: w, h: h, key: w + 'x' + h };
  }

  var stallOn = params.get('stall') === '1';
  var diagOn = params.get('diag') === '1' || params.get('cadence') === '1';
  var enabled = stallOn || diagOn; // GPU/info panel when stall or diag
  var matBasic = String(params.get('mat') || '').toLowerCase() === 'basic';
  var texOff = params.get('tex') === '0';
  var freeze = params.get('freeze') === '1';
  var norender = params.get('norender') === '1';
  var canvasOverride = parseCanvas(params.get('canvas'));
  var aaOff = params.get('aa') === '0';
  var uiOff = params.get('ui') === '0';
  var lightsMode = String(params.get('lights') || '').toLowerCase(); // '', '0', '1', 'hemi'
  if (lightsMode !== '0' && lightsMode !== '1' && lightsMode !== 'hemi') lightsMode = '';

  var flags = Object.freeze({
    enabled: enabled,
    stall: stallOn,
    diag: diagOn,
    matBasic: matBasic,
    texOff: texOff,
    freeze: freeze,
    norender: norender,
    canvas: canvasOverride,
    aaOff: aaOff,
    uiOff: uiOff,
    lights: lightsMode
  });

  // ---- GPU timer query state (async, non-blocking) ----
  var gpuExt = null;
  var gpuExtKind = null; // 'webgl2' | 'webgl1' | null
  var gpuQueries = [];
  var gpuPending = null;
  var gpuLastMs = null;
  var gpuAvgMs = null;
  var gpuSamples = 0;
  var gpuSupported = false;
  var gpuFailReason = null;
  var lastCpuSubmitMs = null;
  var lastWallRenderMs = null;
  var lastInfoSnap = null;
  var lastSceneSnap = null;
  var webglDump = null;
  var overlayEl = null;
  var lastPublishAt = 0;
  var rendererRef = null;
  var sceneRef = null;
  var matOverridesApplied = false;
  var lightsSnapshot = null;
  var basicMatCache = Object.create(null);

  function getGL(renderer) {
    try {
      if (renderer && typeof renderer.getContext === 'function') return renderer.getContext();
    } catch (_) {}
    return null;
  }

  function initGpuTimers(renderer) {
    if (gpuExtKind !== null && gpuExt) return gpuSupported;
    var gl = getGL(renderer);
    if (!gl) {
      gpuFailReason = 'no GL context';
      gpuExtKind = 'none';
      return false;
    }
    try {
      if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
        gpuExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
        if (gpuExt) {
          gpuExtKind = 'webgl2';
          gpuSupported = true;
          return true;
        }
      }
      gpuExt = gl.getExtension('EXT_disjoint_timer_query');
      if (gpuExt) {
        gpuExtKind = 'webgl1';
        gpuSupported = true;
        return true;
      }
      gpuFailReason = 'EXT_disjoint_timer_query(_webgl2) unavailable';
      gpuExtKind = 'none';
    } catch (err) {
      gpuFailReason = 'timer init: ' + (err && err.message ? err.message : String(err));
      gpuExtKind = 'none';
    }
    return false;
  }

  function pollGpuResults(gl) {
    if (!gpuSupported || !gpuExt || !gpuPending) return;
    try {
      var q = gpuPending;
      var available = false;
      if (gpuExtKind === 'webgl2') {
        available = !!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
        if (available) {
          var disjoint = gl.getParameter(gpuExt.GPU_DISJOINT_EXT);
          if (!disjoint) {
            var ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
            gpuLastMs = ns / 1e6;
            gpuSamples++;
            gpuAvgMs = gpuAvgMs == null ? gpuLastMs : (gpuAvgMs * 0.85 + gpuLastMs * 0.15);
          }
          gl.deleteQuery(q);
          gpuPending = null;
        }
      } else {
        available = !!gpuExt.getQueryObjectEXT(q, gpuExt.QUERY_RESULT_AVAILABLE_EXT);
        if (available) {
          var disjoint1 = gl.getParameter(gpuExt.GPU_DISJOINT_EXT);
          if (!disjoint1) {
            var ns1 = gpuExt.getQueryObjectEXT(q, gpuExt.QUERY_RESULT_EXT);
            gpuLastMs = ns1 / 1e6;
            gpuSamples++;
            gpuAvgMs = gpuAvgMs == null ? gpuLastMs : (gpuAvgMs * 0.85 + gpuLastMs * 0.15);
          }
          gpuExt.deleteQueryEXT(q);
          gpuPending = null;
        }
      }
    } catch (_) {
      // never block the frame on query errors
      try {
        if (gpuPending && gpuExtKind === 'webgl2') gl.deleteQuery(gpuPending);
        else if (gpuPending && gpuExt) gpuExt.deleteQueryEXT(gpuPending);
      } catch (__) {}
      gpuPending = null;
    }
  }

  /**
   * Wrap renderer.render with optional GPU timer + CPU submit timing.
   * Non-blocking: result of previous query is polled; new query started if none pending.
   */
  function timedRender(renderer, scene, camera) {
    var t0 = performance.now();
    var gl = getGL(renderer);
    var began = false;
    if (enabled && gl && initGpuTimers(renderer)) {
      pollGpuResults(gl);
      if (!gpuPending) {
        try {
          if (gpuExtKind === 'webgl2') {
            var q2 = gl.createQuery();
            gl.beginQuery(gpuExt.TIME_ELAPSED_EXT, q2);
            gpuPending = q2;
            began = true;
          } else if (gpuExtKind === 'webgl1') {
            var q1 = gpuExt.createQueryEXT();
            gpuExt.beginQueryEXT(gpuExt.TIME_ELAPSED_EXT, q1);
            gpuPending = q1;
            began = true;
          }
        } catch (_) {
          began = false;
          gpuPending = null;
        }
      }
    }

    var out;
    try {
      if (!norender) {
        out = renderer.render(scene, camera);
      }
    } finally {
      if (began && gl) {
        try {
          if (gpuExtKind === 'webgl2') gl.endQuery(gpuExt.TIME_ELAPSED_EXT);
          else if (gpuExtKind === 'webgl1') gpuExt.endQueryEXT(gpuExt.TIME_ELAPSED_EXT);
        } catch (_) {
          gpuPending = null;
        }
      }
    }
    lastCpuSubmitMs = performance.now() - t0;
    lastWallRenderMs = lastCpuSubmitMs;
    return out;
  }

  function dumpWebGL(renderer) {
    var dump = {
      version: null,
      shadingLanguage: null,
      vendor: null,
      renderer: null,
      unmaskedVendor: null,
      unmaskedRenderer: null,
      maxTextureSize: null,
      maxRenderbufferSize: null,
      maxVertexAttribs: null,
      maxTextureImageUnits: null,
      maxCombinedTextureImageUnits: null,
      antialias: null,
      depthBits: null,
      stencilBits: null,
      alpha: null,
      preserveDrawingBuffer: null,
      powerPreference: null,
      isWebGL2: null,
      drawingBufferWidth: null,
      drawingBufferHeight: null,
      extensions: [],
      threeInfoAutoReset: null,
      contextAttributes: null
    };
    try {
      var gl = getGL(renderer);
      if (!gl) return dump;
      dump.version = gl.getParameter(gl.VERSION);
      dump.shadingLanguage = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
      dump.vendor = gl.getParameter(gl.VENDOR);
      dump.renderer = gl.getParameter(gl.RENDERER);
      dump.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      dump.maxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      dump.maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
      dump.maxTextureImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
      dump.maxCombinedTextureImageUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
      dump.drawingBufferWidth = gl.drawingBufferWidth;
      dump.drawingBufferHeight = gl.drawingBufferHeight;
      dump.isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
      var attrs = gl.getContextAttributes ? gl.getContextAttributes() : null;
      if (attrs) {
        dump.contextAttributes = attrs;
        dump.antialias = !!attrs.antialias;
        dump.depthBits = attrs.depth ? 'yes' : 'no';
        dump.stencilBits = attrs.stencil ? 'yes' : 'no';
        dump.alpha = !!attrs.alpha;
        dump.preserveDrawingBuffer = !!attrs.preserveDrawingBuffer;
        dump.powerPreference = attrs.powerPreference || null;
      }
      try {
        var dbg = gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) {
          dump.unmaskedVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
          dump.unmaskedRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
        }
      } catch (_) {}
      try {
        var exts = gl.getSupportedExtensions && gl.getSupportedExtensions();
        dump.extensions = exts ? exts.slice().sort() : [];
      } catch (_) {}
      if (renderer && renderer.info) {
        dump.threeInfoAutoReset = renderer.info.autoReset !== false;
      }
    } catch (err) {
      dump.error = err && err.message ? err.message : String(err);
    }
    webglDump = dump;
    return dump;
  }

  function captureRenderInfo(renderer) {
    var info = renderer && renderer.info;
    if (!info) {
      lastInfoSnap = null;
      return null;
    }
    var r = info.render || {};
    var mem = info.memory || {};
    var programs = null;
    try {
      if (info.programs) programs = info.programs.length;
      else if (Array.isArray(info.programs)) programs = info.programs.length;
    } catch (_) {}
    lastInfoSnap = {
      calls: r.calls,
      triangles: r.triangles,
      points: r.points,
      lines: r.lines,
      frame: r.frame,
      geometries: mem.geometries,
      textures: mem.textures,
      programs: programs,
      autoReset: info.autoReset !== false
    };
    return lastInfoSnap;
  }

  function countScene(scene, camera) {
    var snap = {
      object3d: 0,
      meshes: 0,
      visibleMeshes: 0,
      visibleObject3d: 0,
      nearMeshes: 0,
      farMeshes: 0,
      materials: 0,
      uniqueMats: 0,
      lights: 0,
      lightsOn: 0
    };
    if (!scene) {
      lastSceneSnap = snap;
      return snap;
    }
    var camPos = camera && camera.position ? camera.position : null;
    var nearDist = 40;
    var farDist = 90;
    var matSet = Object.create(null);
    var matN = 0;
    scene.traverse(function (o) {
      snap.object3d++;
      if (o.visible) snap.visibleObject3d++;
      if (o.isLight) {
        snap.lights++;
        if (o.visible !== false && (o.intensity == null || o.intensity > 0)) snap.lightsOn++;
      }
      if (o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) {
        snap.meshes++;
        if (o.visible) {
          snap.visibleMeshes++;
          if (camPos) {
            var d = o.position.distanceTo(camPos);
            if (d <= nearDist) snap.nearMeshes++;
            else if (d >= farDist) snap.farMeshes++;
          }
        }
        var mats = o.material
          ? (Array.isArray(o.material) ? o.material : [o.material])
          : [];
        for (var i = 0; i < mats.length; i++) {
          var m = mats[i];
          if (!m) continue;
          matN++;
          var id = m.uuid || m.id;
          if (id != null) matSet[id] = 1;
        }
      }
    });
    snap.materials = matN;
    snap.uniqueMats = Object.keys(matSet).length;
    lastSceneSnap = snap;
    return snap;
  }

  function basicFrom(mat) {
    if (!mat || !global.THREE) return mat;
    var THREE = global.THREE;
    var key = mat.uuid || String(mat.id);
    if (basicMatCache[key]) return basicMatCache[key];
    var color = 0x888888;
    try {
      if (mat.color && mat.color.getHex) color = mat.color.getHex();
      else if (mat.emissive && mat.emissive.getHex) color = mat.emissive.getHex();
    } catch (_) {}
    var b = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: !!mat.wireframe,
      transparent: !!mat.transparent,
      opacity: mat.opacity != null ? mat.opacity : 1,
      side: mat.side != null ? mat.side : THREE.FrontSide,
      depthWrite: mat.depthWrite !== false,
      depthTest: mat.depthTest !== false
    });
    if (mat.map && !texOff) b.map = mat.map;
    b.userData = b.userData || {};
    b.userData.luncStallBasic = true;
    b.userData.luncOrigMat = mat;
    basicMatCache[key] = b;
    return b;
  }

  function applyMatBasic(scene) {
    if (!matBasic || !scene || matOverridesApplied) return;
    scene.traverse(function (o) {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh)) return;
      if (Array.isArray(o.material)) {
        o.userData._stallOrigMat = o.material.slice();
        o.material = o.material.map(basicFrom);
      } else if (o.material) {
        o.userData._stallOrigMat = o.material;
        o.material = basicFrom(o.material);
      }
    });
    matOverridesApplied = true;
  }

  function applyTexOff(scene) {
    if (!texOff || !scene) return;
    scene.traverse(function (o) {
      if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isSprite)) return;
      var mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (var i = 0; i < mats.length; i++) {
        var m = mats[i];
        if (!m) continue;
        if (!m.userData) m.userData = {};
        if (m.userData._stallTexSaved) continue;
        m.userData._stallTexSaved = {
          map: m.map || null,
          envMap: m.envMap || null,
          normalMap: m.normalMap || null,
          roughnessMap: m.roughnessMap || null,
          metalnessMap: m.metalnessMap || null,
          aoMap: m.aoMap || null,
          emissiveMap: m.emissiveMap || null,
          alphaMap: m.alphaMap || null,
          lightMap: m.lightMap || null,
          bumpMap: m.bumpMap || null
        };
        m.map = null;
        m.envMap = null;
        m.normalMap = null;
        m.roughnessMap = null;
        m.metalnessMap = null;
        m.aoMap = null;
        m.emissiveMap = null;
        m.alphaMap = null;
        m.lightMap = null;
        m.bumpMap = null;
        m.needsUpdate = true;
      }
    });
  }

  function applyLights(scene) {
    if (!lightsMode || !scene) return;
    if (!lightsSnapshot) {
      lightsSnapshot = [];
      scene.traverse(function (o) {
        if (!o.isLight) return;
        lightsSnapshot.push({
          light: o,
          intensity: o.intensity,
          visible: o.visible
        });
      });
    }
    var hemi = null;
    var dirs = [];
    for (var i = 0; i < lightsSnapshot.length; i++) {
      var L = lightsSnapshot[i].light;
      if (L.isHemisphereLight) hemi = L;
      if (L.isDirectionalLight) dirs.push(L);
    }
    for (var j = 0; j < lightsSnapshot.length; j++) {
      var entry = lightsSnapshot[j];
      var light = entry.light;
      if (lightsMode === '0') {
        light.intensity = 0;
        light.visible = false;
      } else if (lightsMode === 'hemi') {
        if (light.isHemisphereLight) {
          light.visible = true;
          light.intensity = entry.intensity > 0 ? entry.intensity : 0.6;
        } else {
          light.intensity = 0;
          light.visible = false;
        }
      } else if (lightsMode === '1') {
        var keep = dirs[0] || hemi || light;
        if (light === keep) {
          light.visible = true;
          light.intensity = entry.intensity > 0 ? entry.intensity : 1;
        } else {
          light.intensity = 0;
          light.visible = false;
        }
      }
    }
  }

  function applyCanvasSize(renderer) {
    if (!canvasOverride || !renderer) return;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(canvasOverride.w, canvasOverride.h, false);
      var canvas = renderer.domElement;
      if (canvas && canvas.style) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      }
    } catch (_) {}
  }

  function applyUiOff() {
    if (!uiOff) return;
    try {
      document.documentElement.classList.add('stall-ui-off');
      var ids = [
        'topHud', 'tokenBar', 'hudTabs', 'leftPanel', 'rightPanel', 'warRoom',
        'statusTray', 'feed', 'minimapWrap', 'qualityPicker', 'buildTag',
        'battleBadge', 'perfOverlay', 'cadenceOverlay', 'stallOverlay',
        'legend', 'truthLegend', 'mobileBar'
      ];
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      document.querySelectorAll('.perf-overlay, .cadence-overlay, .stall-overlay, .quality-picker').forEach(function (el) {
        el.style.display = 'none';
      });
    } catch (_) {}
  }

  function ensureOverlay() {
    if (!enabled || uiOff) return null;
    if (overlayEl) return overlayEl;
    overlayEl = document.createElement('div');
    overlayEl.id = 'stallOverlay';
    overlayEl.className = 'stall-overlay';
    overlayEl.setAttribute('aria-hidden', 'false');
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function fmt(n, d) {
    if (n == null || typeof n !== 'number' || !isFinite(n)) return '—';
    return n.toFixed(d != null ? d : 1);
  }

  function publish() {
    if (!enabled || uiOff) return;
    ensureOverlay();
    if (!overlayEl) return;
    var info = lastInfoSnap || {};
    var scene = lastSceneSnap || {};
    var dump = webglDump || {};
    var gpuLine = gpuSupported
      ? ('GPU <b>' + fmt(gpuLastMs, 2) + 'ms</b> · avg <b>' + fmt(gpuAvgMs, 2) + 'ms</b> · n=' + gpuSamples)
      : ('GPU <b>n/a</b> · ' + (gpuFailReason || 'no ext'));
    overlayEl.innerHTML =
      '<div class="stall-title">STALL · v9.4.8</div>' +
      '<div>' + gpuLine + '</div>' +
      '<div>CPU submit <b>' + fmt(lastCpuSubmitMs, 2) + 'ms</b> · wall render <b>' + fmt(lastWallRenderMs, 2) + 'ms</b></div>' +
      '<div>Calls <b>' + (info.calls != null ? info.calls : '—') + '</b> · Tris <b>' + (info.triangles != null ? info.triangles : '—') + '</b></div>' +
      '<div>Pts <b>' + (info.points != null ? info.points : '—') + '</b> · Lines <b>' + (info.lines != null ? info.lines : '—') + '</b> · Prog <b>' + (info.programs != null ? info.programs : '—') + '</b></div>' +
      '<div>Geo <b>' + (info.geometries != null ? info.geometries : '—') + '</b> · Tex <b>' + (info.textures != null ? info.textures : '—') + '</b> · autoReset <b>' + (info.autoReset ? 'on' : 'off') + '</b></div>' +
      '<div>Meshes vis <b>' + (scene.visibleMeshes != null ? scene.visibleMeshes : '—') + '</b>/' + (scene.meshes != null ? scene.meshes : '—') +
      ' · near <b>' + (scene.nearMeshes != null ? scene.nearMeshes : '—') + '</b> · far <b>' + (scene.farMeshes != null ? scene.farMeshes : '—') + '</b></div>' +
      '<div>Object3D vis <b>' + (scene.visibleObject3d != null ? scene.visibleObject3d : '—') + '</b>/' + (scene.object3d != null ? scene.object3d : '—') +
      ' · uniqMat <b>' + (scene.uniqueMats != null ? scene.uniqueMats : '—') + '</b></div>' +
      '<div class="stall-flags">flags freeze=' + (freeze ? 1 : 0) +
      ' norender=' + (norender ? 1 : 0) +
      ' mat=' + (matBasic ? 'basic' : '—') +
      ' tex=' + (texOff ? 0 : '—') +
      ' aa=' + (aaOff ? 0 : '—') +
      ' lights=' + (lightsMode || '—') +
      ' canvas=' + (canvasOverride ? canvasOverride.key : '—') + '</div>' +
      '<div class="stall-gpu micro">' +
      (dump.unmaskedRenderer || dump.renderer || '—') +
      ' · AA ' + (dump.antialias == null ? '—' : dump.antialias) +
      ' · DB ' + (dump.drawingBufferWidth || '?') + '×' + (dump.drawingBufferHeight || '?') +
      '</div>';
  }

  function logWebGLOnce() {
    if (!webglDump) return;
    try {
      console.info('[stall] WebGL dump', {
        version: webglDump.version,
        unmaskedVendor: webglDump.unmaskedVendor,
        unmaskedRenderer: webglDump.unmaskedRenderer,
        maxTextureSize: webglDump.maxTextureSize,
        antialias: webglDump.antialias,
        alpha: webglDump.alpha,
        preserveDrawingBuffer: webglDump.preserveDrawingBuffer,
        powerPreference: webglDump.powerPreference,
        depth: webglDump.depthBits,
        stencil: webglDump.stencilBits,
        isWebGL2: webglDump.isWebGL2,
        drawingBuffer: webglDump.drawingBufferWidth + '×' + webglDump.drawingBufferHeight,
        threeInfoAutoReset: webglDump.threeInfoAutoReset,
        extCount: (webglDump.extensions || []).length,
        hasTimerQuery: !!(webglDump.extensions || []).filter(function (e) {
          return /timer_query/i.test(e);
        }).length
      });
      console.info('[stall] extensions', (webglDump.extensions || []).join(', '));
    } catch (_) {}
  }

  var loggedDump = false;

  /** Call after render each frame (or from cadence endFrame). */
  function endFrame(renderer, scene, camera) {
    rendererRef = renderer || rendererRef;
    sceneRef = scene || sceneRef;
    if (!enabled && !matBasic && !texOff && !lightsMode && !canvasOverride) {
      return null;
    }
    if (rendererRef && !webglDump) {
      dumpWebGL(rendererRef);
      if (!loggedDump && enabled) {
        loggedDump = true;
        logWebGLOnce();
      }
    }
    if (sceneRef) {
      if (matBasic) applyMatBasic(sceneRef);
      if (texOff) applyTexOff(sceneRef);
      if (lightsMode) applyLights(sceneRef);
    }
    if (canvasOverride && rendererRef) applyCanvasSize(rendererRef);
    if (enabled && rendererRef) {
      captureRenderInfo(rendererRef);
      if (sceneRef) countScene(sceneRef, camera);
      var now = performance.now();
      if (now - lastPublishAt >= 1000) {
        lastPublishAt = now;
        publish();
        try {
          console.info(
            '[stall]',
            'calls=' + (lastInfoSnap && lastInfoSnap.calls),
            'tris=' + (lastInfoSnap && lastInfoSnap.triangles),
            'gpuMs=' + fmt(gpuLastMs, 2),
            'cpuSubmit=' + fmt(lastCpuSubmitMs, 2),
            'visMeshes=' + (lastSceneSnap && lastSceneSnap.visibleMeshes),
            'near/far=' + (lastSceneSnap && lastSceneSnap.nearMeshes) + '/' + (lastSceneSnap && lastSceneSnap.farMeshes)
          );
        } catch (_) {}
      }
    }
    return {
      info: lastInfoSnap,
      scene: lastSceneSnap,
      gpuMs: gpuLastMs,
      cpuSubmitMs: lastCpuSubmitMs,
      webgl: webglDump
    };
  }

  function bind(renderer, scene) {
    rendererRef = renderer || null;
    sceneRef = scene || null;
    if (rendererRef) {
      initGpuTimers(rendererRef);
      dumpWebGL(rendererRef);
      applyCanvasSize(rendererRef);
    }
  }

  function bootBanner() {
    applyUiOff();
    if (!enabled && !matBasic && !texOff && !freeze && !norender && !aaOff && !uiOff && !lightsMode && !canvasOverride) {
      return;
    }
    try {
      console.info(
        '[stall] v9.4.8 hooks',
        'stall=' + stallOn,
        'diag=' + diagOn,
        'matBasic=' + matBasic,
        'texOff=' + texOff,
        'freeze=' + freeze,
        'norender=' + norender,
        'aaOff=' + aaOff,
        'uiOff=' + uiOff,
        'lights=' + (lightsMode || 'default'),
        'canvas=' + (canvasOverride ? canvasOverride.key : 'default')
      );
    } catch (_) {}
    if (enabled && !uiOff) ensureOverlay();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootBanner);
  } else {
    bootBanner();
  }

  var api = {
    version: 'v9.4.8',
    flags: flags,
    enabled: enabled,
    bind: bind,
    timedRender: timedRender,
    endFrame: endFrame,
    dumpWebGL: dumpWebGL,
    captureRenderInfo: captureRenderInfo,
    countScene: countScene,
    applyCanvasSize: applyCanvasSize,
    applyMatBasic: applyMatBasic,
    applyTexOff: applyTexOff,
    applyLights: applyLights,
    applyUiOff: applyUiOff,
    getGpuStats: function () {
      return {
        supported: gpuSupported,
        kind: gpuExtKind,
        lastMs: gpuLastMs,
        avgMs: gpuAvgMs,
        samples: gpuSamples,
        failReason: gpuFailReason,
        cpuSubmitMs: lastCpuSubmitMs
      };
    },
    getLastInfo: function () { return lastInfoSnap; },
    getLastScene: function () { return lastSceneSnap; },
    getWebGLDump: function () { return webglDump; },
    /** Create-time antialias preference for battle-engine / renderer.create */
    wantAntialias: function () { return !aaOff; }
  };

  LB.stall = api;
})(window);
