/* LUNC Battlefield v8.6 — lightweight Canvas 2D minimap (not a second Three.js renderer) */
(function (global) {
  'use strict';

  var WORLD = { minX: -70, maxX: 70, minZ: -45, maxZ: 45 };
  var DRAW_HZ = 10; // ~8–12 Hz throttle; overridden by quality

  function createApi(opts) {
    opts = opts || {};
    var mobile = !!opts.mobile;
    var bounds = Object.assign({}, WORLD, opts.worldBounds || null);
    var getFrontlineX = typeof opts.getFrontlineX === 'function'
      ? opts.getFrontlineX
      : function () { return 0; };
    var getViewportWorldRect = typeof opts.getViewportWorldRect === 'function'
      ? opts.getViewportWorldRect
      : null;
    var onFocusWorld = typeof opts.onFocusWorld === 'function' ? opts.onFocusWorld : null;
    var getUnits = typeof opts.getUnits === 'function' ? opts.getUnits : null;
    var notifyUserInput = typeof opts.notifyUserInput === 'function' ? opts.notifyUserInput : null;
    var drawHz = opts.drawHz;
    if (!(drawHz > 0) && global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset) {
      try { drawHz = LUNCBattle.quality.getEffectivePreset().minimapHz; } catch (_) {}
    }
    if (!(drawHz > 0)) drawHz = DRAW_HZ;
    function setDrawHz(hz) {
      if (hz > 0) drawHz = hz;
      return drawHz;
    }
    if (global.addEventListener) {
      global.addEventListener('lunc-quality-change', function (ev) {
        try {
          var hz = ev && ev.detail && ev.detail.preset && ev.detail.preset.minimapHz;
          if (hz > 0) drawHz = hz;
        } catch (_) {}
      });
    }

    var wrap = opts.wrap || null;
    var canvas = opts.canvas || null;
    var created = false;

    if (!canvas) {
      wrap = document.createElement('div');
      wrap.id = 'minimapWrap';
      wrap.className = 'minimap-wrap' + (mobile ? ' mobile' : '');

      var focusBar = document.createElement('div');
      focusBar.className = 'minimap-focus';
      focusBar.innerHTML =
        '<button type="button" data-focus="front" title="Focus frontline">FRONT</button>' +
        '<button type="button" data-focus="bull" title="Focus bull base">BULL</button>' +
        '<button type="button" data-focus="bear" title="Focus bear base">BEAR</button>';
      wrap.appendChild(focusBar);

      canvas = document.createElement('canvas');
      canvas.id = 'minimapCanvas';
      canvas.className = 'minimap-canvas';
      wrap.appendChild(canvas);

      if (mobile) {
        var tog = document.createElement('button');
        tog.type = 'button';
        tog.id = 'minimapToggle';
        tog.className = 'minimap-toggle';
        tog.textContent = 'MAP';
        tog.setAttribute('aria-expanded', 'true');
        wrap.insertBefore(tog, focusBar);
        tog.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          wrap.classList.toggle('collapsed');
          tog.setAttribute('aria-expanded', wrap.classList.contains('collapsed') ? 'false' : 'true');
        });
      }

      document.body.appendChild(wrap);
      created = true;
    }

    var w = mobile ? 118 : 168;
    var h = mobile ? 78 : 112;
    canvas.width = w * 2; // retina
    canvas.height = h * 2;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');

    var defenses = [];
    var pulses = []; // { x, z, kind, born, life }
    var lastDraw = 0;
    var dragging = false;

    function worldToCanvas(x, z) {
      var u = (x - bounds.minX) / (bounds.maxX - bounds.minX);
      var v = (z - bounds.minZ) / (bounds.maxZ - bounds.minZ);
      return { x: u * canvas.width, y: v * canvas.height };
    }

    function canvasToWorld(cx, cy) {
      // cx/cy in CSS pixels relative to canvas
      var rect = canvas.getBoundingClientRect();
      var u = cx / rect.width;
      var v = cy / rect.height;
      return {
        x: bounds.minX + u * (bounds.maxX - bounds.minX),
        z: bounds.minZ + v * (bounds.maxZ - bounds.minZ)
      };
    }

    function setDefenses(list) {
      defenses = Array.isArray(list) ? list : [];
    }

    function pulseEvent(ev) {
      if (!ev) return;
      pulses.push({
        x: ev.x || 0,
        z: ev.z || 0,
        kind: ev.kind || 'fx',
        born: performance.now(),
        life: ev.life != null ? ev.life : 1500
      });
      if (pulses.length > 12) pulses.shift();
    }

    function drawField(fx) {
      var W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Field base
      ctx.fillStyle = '#0e1610';
      ctx.fillRect(0, 0, W, H);

      // Split by frontline — bull west tint / bear east tint
      var split = worldToCanvas(fx, 0);
      var sx = Math.max(0, Math.min(W, split.x));

      ctx.fillStyle = 'rgba(40, 110, 78, 0.22)';
      ctx.fillRect(0, 0, sx, H);
      ctx.fillStyle = 'rgba(140, 55, 48, 0.22)';
      ctx.fillRect(sx, 0, W - sx, H);

      // Subtle center road band
      ctx.fillStyle = 'rgba(90, 80, 55, 0.18)';
      ctx.fillRect(0, H * 0.42, W, H * 0.16);

      // Border
      ctx.strokeStyle = 'rgba(198, 176, 120, 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, W - 2, H - 2);

      // Frontline
      ctx.strokeStyle = 'rgba(215, 181, 109, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, 4);
      ctx.lineTo(sx, H - 4);
      ctx.stroke();

      // HQ markers ±48
      function hq(x, color) {
        var p = worldToCanvas(x, 0);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 7);
        ctx.lineTo(p.x + 6, p.y + 5);
        ctx.lineTo(p.x - 6, p.y + 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      hq(-48, '#49d39a');
      hq(48, '#e4675f');
    }

    function drawDefenses() {
      for (var i = 0; i < defenses.length; i++) {
        var d = defenses[i];
        var p = worldToCanvas(d.x, d.z);
        var r = 2 + (d.strength || 1);
        ctx.globalAlpha = d.partial ? 0.4 : 0.85;
        ctx.fillStyle = d.side === 'bull' ? '#6ecf9a' : '#e88a82';
        ctx.fillRect(p.x - r * 0.5, p.y - r * 0.5, r, r);
      }
      ctx.globalAlpha = 1;
    }

    function drawUnits() {
      if (!getUnits) return;
      var pack = getUnits() || {};
      var bulls = pack.bulls || [];
      var bears = pack.bears || [];
      var cluster = (bulls.length + bears.length) > 72;
      var step = cluster ? 2 : 1;

      function paint(arr, baseColor) {
        for (var i = 0; i < arr.length; i += step) {
          var u = arr[i];
          if (!u || !u.position) continue;
          var p = worldToCanvas(u.position.x, u.position.z);
          var type = (u.userData && u.userData.type) || 0;
          // type colors: inf / armor / arty / heli / jet
          var col = baseColor;
          if (type === 1) col = baseColor === '#49d39a' ? '#7dffc0' : '#ff9a92';
          if (type === 2) col = baseColor === '#49d39a' ? '#c9f5df' : '#ffd0cc';
          if (type === 3) col = baseColor === '#49d39a' ? '#b8ffe0' : '#ffc4bf';
          if (type === 4) col = baseColor === '#49d39a' ? '#e8fff4' : '#ffe0dc';
          var r = type === 4 ? 3.4 : type === 3 ? 3.0 : type === 2 ? 3.2 : type === 1 ? 2.6 : 2;
          if (cluster) r *= 1.15;
          ctx.fillStyle = col;
          ctx.beginPath();
          if (type === 3 || type === 4) {
            // diamond blip for air
            ctx.moveTo(p.x, p.y - r);
            ctx.lineTo(p.x + r * 0.7, p.y);
            ctx.lineTo(p.x, p.y + r);
            ctx.lineTo(p.x - r * 0.7, p.y);
            ctx.closePath();
          } else {
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
      paint(bulls, '#49d39a');
      paint(bears, '#e4675f');
    }

    function drawViewport() {
      if (!getViewportWorldRect) return;
      var r = getViewportWorldRect();
      if (!r) return;
      var a = worldToCanvas(r.minX, r.minZ);
      var b = worldToCanvas(r.maxX, r.maxZ);
      var x = Math.min(a.x, b.x);
      var y = Math.min(a.y, b.y);
      var ww = Math.abs(b.x - a.x);
      var hh = Math.abs(b.y - a.y);
      ctx.strokeStyle = 'rgba(232, 238, 233, 0.75)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, ww, hh);
      ctx.fillStyle = 'rgba(232, 238, 233, 0.06)';
      ctx.fillRect(x, y, ww, hh);
    }

    function drawPulses(now) {
      for (var i = pulses.length - 1; i >= 0; i--) {
        var p = pulses[i];
        var age = now - p.born;
        if (age > p.life) { pulses.splice(i, 1); continue; }
        var t = age / p.life;
        var c = worldToCanvas(p.x, p.z);
        var rad = 4 + t * 18;
        ctx.globalAlpha = (1 - t) * 0.7;
        ctx.strokeStyle = p.kind === 'burn' ? '#ffbf47'
          : p.kind === 'liq' ? '#78cad9'
          : '#d7b56d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function draw(force) {
      var now = performance.now();
      if (!force && now - lastDraw < (1000 / drawHz)) return;
      lastDraw = now;
      if (wrap && wrap.classList.contains('collapsed')) return;
      var fx = getFrontlineX();
      drawField(fx);
      drawDefenses();
      drawUnits();
      drawViewport();
      drawPulses(now);
    }

    function focusFromEvent(e) {
      var rect = canvas.getBoundingClientRect();
      var cx = (e.clientX != null ? e.clientX : e.touches[0].clientX) - rect.left;
      var cy = (e.clientY != null ? e.clientY : e.touches[0].clientY) - rect.top;
      var wpos = canvasToWorld(cx, cy);
      if (notifyUserInput) notifyUserInput();
      if (onFocusWorld) onFocusWorld(wpos.x, wpos.z, true);
    }

    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      focusFromEvent(e);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      e.preventDefault();
      e.stopPropagation();
      // Desktop drag pans focus; mobile tap-only mostly
      if (!mobile || e.pointerType === 'mouse') focusFromEvent(e);
    });
    function endDrag(e) {
      dragging = false;
      if (e && e.pointerId != null) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    if (wrap) {
      wrap.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
      });
      var focusBarEl = wrap.querySelector('.minimap-focus');
      if (focusBarEl) {
        focusBarEl.addEventListener('click', function (e) {
          var btn = e.target.closest('button[data-focus]');
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          if (notifyUserInput) notifyUserInput();
          var kind = btn.getAttribute('data-focus');
          if (kind === 'front' && opts.onFocusFrontline) opts.onFocusFrontline(true);
          else if (kind === 'bull' && opts.onFocusBull) opts.onFocusBull(true);
          else if (kind === 'bear' && opts.onFocusBear) opts.onFocusBear(true);
        });
      }
    }

    return {
      draw: draw,
      setDefenses: setDefenses,
      pulseEvent: pulseEvent,
      canvas: canvas,
      wrap: wrap,
      setDrawHz: setDrawHz,
      getDrawHz: function () { return drawHz; },
      version: 'v8.8'
    };
  }

  global.LUNCBattle = global.LUNCBattle || {};
  global.LUNCBattle.minimap = { createApi: createApi };
})(window);
