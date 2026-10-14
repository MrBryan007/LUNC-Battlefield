/* WebGL context loss recovery — pause, show status, controlled restore. No infinite reload. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var recovering = false;
  var reloadCount = 0;
  var MAX_RELOADS = 1;
  var RELOAD_KEY = 'lunc-gfx-reload';

  function log(msg) {
    try { console.info('[LUNC Battlefield] ' + msg); } catch (_) {}
  }

  function showStatus(text) {
    var el = document.getElementById('gfxRecover');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gfxRecover';
      el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99998;background:rgba(20,16,8,.92);color:#ffd36a;padding:8px 14px;border-radius:6px;font:600 12px/1.3 system-ui,sans-serif;letter-spacing:.12em;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = text || '';
    el.style.display = text ? 'block' : 'none';
  }

  function canReload() {
    try {
      var last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last < 20000) return false;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      return reloadCount < MAX_RELOADS;
    } catch (_) {
      return reloadCount < MAX_RELOADS;
    }
  }

  function attach(canvas) {
    if (!canvas || canvas.__gfxBound) return;
    canvas.__gfxBound = true;
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      recovering = true;
      log('WebGL context lost');
      showStatus('GRAPHICS RECOVERING');
      try { if (LB.engine && LB.engine.pause) LB.engine.pause(true); } catch (_) {}
    }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      recovering = false;
      log('WebGL context restored');
      showStatus('');
      try {
        if (LB.engine && LB.engine.pause) LB.engine.pause(false);
      } catch (_) {}
      setTimeout(function () {
        if (recovering) return;
        try {
          if (LB.engine && LB.engine.renderer && LB.engine.renderer.getContext) {
            var gl = LB.engine.renderer.getContext();
            if (gl && gl.isContextLost && gl.isContextLost()) {
              if (canReload()) {
                reloadCount++;
                log('WebGL still lost — controlled reload');
                location.reload();
              } else {
                showStatus('GRAPHICS UNAVAILABLE');
              }
            }
          }
        } catch (_) {}
      }, 800);
    }, false);
  }

  function watch() {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      var canvas = document.querySelector('canvas');
      if (canvas) {
        attach(canvas);
        clearInterval(timer);
      } else if (tries > 60) {
        clearInterval(timer);
      }
    }, 400);
  }

  LB.gfxRecover = { watch: watch, isRecovering: function () { return recovering; } };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watch);
  } else {
    watch();
  }
})(window);
