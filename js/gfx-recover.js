/* WebGL context loss recovery — pause, show status, controlled restore. No infinite reload. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var recovering = false;
  var reloadCount = 0;
  var MAX_RELOADS = 2;

  function showStatus(text) {
    var el = document.getElementById('gfxRecover');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gfxRecover';
      el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99998;background:rgba(20,16,8,.92);color:#ffd36a;padding:8px 14px;border-radius:6px;font:600 12px/1.3 system-ui,sans-serif;letter-spacing:.12em;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  }

  function attach(canvas) {
    if (!canvas || canvas.__gfxBound) return;
    canvas.__gfxBound = true;
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      recovering = true;
      showStatus('GRAPHICS RECOVERING');
      try { if (LB.engine && LB.engine.pause) LB.engine.pause(true); } catch (_) {}
    }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      recovering = false;
      showStatus('');
      try {
        if (LB.engine && LB.engine.pause) LB.engine.pause(false);
      } catch (_) {}
      // If the engine cannot resume cleanly, one controlled reload — then stop.
      setTimeout(function () {
        if (recovering) return;
        try {
          if (LB.engine && LB.engine.renderer && LB.engine.renderer.getContext) {
            var gl = LB.engine.renderer.getContext();
            if (gl && gl.isContextLost && gl.isContextLost()) {
              if (reloadCount < MAX_RELOADS) {
                reloadCount++;
                location.reload();
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
