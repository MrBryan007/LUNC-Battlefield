/* LUNC Battlefield v10 — procedural textures (canvas-generated, original, no downloads)
 * Soft particle sprites, smoke puffs, terrain detail albedo + normal maps.
 * All textures are generated at runtime from seeded value noise — no third-party assets. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var cache = Object.create(null);

  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }

  // Tileable value noise on an N×N lattice
  function makeNoise(size, cells, seed) {
    var r = rng(seed);
    var lat = new Float32Array(cells * cells);
    for (var i = 0; i < lat.length; i++) lat[i] = r();
    var out = new Float32Array(size * size);
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var fx = x / size * cells, fy = y / size * cells;
        var x0 = Math.floor(fx), y0 = Math.floor(fy);
        var tx = fx - x0, ty = fy - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        var a = lat[y0 * cells + x0], b = lat[y0 * cells + x1];
        var c = lat[y1 * cells + x0], d = lat[y1 * cells + x1];
        out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
      }
    }
    return out;
  }

  function fbm(size, seed, octaves) {
    var acc = new Float32Array(size * size);
    var amp = 0.5, total = 0;
    for (var o = 0; o < octaves; o++) {
      var n = makeNoise(size, 4 << o, seed + o * 101);
      for (var i = 0; i < acc.length; i++) acc[i] += n[i] * amp;
      total += amp; amp *= 0.5;
    }
    for (var j = 0; j < acc.length; j++) acc[j] /= total;
    return acc;
  }

  function canvas(size) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  }

  function toTexture(THREE, c, opts) {
    opts = opts || {};
    var t = new THREE.CanvasTexture(c);
    if (opts.repeat) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(opts.repeat[0], opts.repeat[1]);
    }
    if (opts.srgb && THREE.sRGBEncoding != null) t.encoding = THREE.sRGBEncoding;
    t.needsUpdate = true;
    return t;
  }

  /** Soft radial glow — additive fire / flash / spark sprites */
  function softDot(THREE) {
    if (cache.softDot) return cache.softDot;
    var s = 64, c = canvas(s), g = c.getContext('2d');
    var grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.22, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    cache.softDot = toTexture(THREE, c);
    return cache.softDot;
  }

  /** Billowy smoke puff — noise-modulated soft disc */
  function smokePuff(THREE) {
    if (cache.smokePuff) return cache.smokePuff;
    var s = 128, c = canvas(s), g = c.getContext('2d');
    var n = fbm(s, 77, 4);
    var img = g.createImageData(s, s);
    for (var y = 0; y < s; y++) {
      for (var x = 0; x < s; x++) {
        var dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
        var d = Math.sqrt(dx * dx + dy * dy);
        var fall = Math.max(0, 1 - d);
        fall = fall * fall * (3 - 2 * fall);
        var v = n[y * s + x];
        var a = Math.max(0, Math.min(1, fall * (0.35 + v * 1.1) - 0.05));
        var i = (y * s + x) * 4;
        var shade = 200 + v * 55;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = shade;
        img.data[i + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    cache.smokePuff = toTexture(THREE, c);
    return cache.smokePuff;
  }

  /** Grass / earth detail albedo — near-white multiplier so vertex colors keep the layout */
  function groundDetail(THREE, repeatX, repeatY) {
    var key = 'ground' + repeatX + 'x' + repeatY;
    if (cache[key]) return cache[key];
    var s = 256, c = canvas(s), g = c.getContext('2d');
    var big = fbm(s, 11, 3), fine = fbm(s, 29, 5);
    var r = rng(4242);
    var img = g.createImageData(s, s);
    for (var i = 0; i < s * s; i++) {
      var v = 0.62 + big[i] * 0.3 + (fine[i] - 0.5) * 0.42;
      var o = i * 4;
      img.data[o] = Math.min(255, v * 238);
      img.data[o + 1] = Math.min(255, v * 248);
      img.data[o + 2] = Math.min(255, v * 226);
      img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // grass blade / pebble speckles
    for (var k = 0; k < 2600; k++) {
      var x = r() * s, y = r() * s, l = 1 + r() * 2.5;
      var light = r() > 0.5;
      g.strokeStyle = light ? 'rgba(255,255,230,0.13)' : 'rgba(20,24,10,0.16)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 1.5, y - l); g.stroke();
    }
    cache[key] = toTexture(THREE, c, { repeat: [repeatX, repeatY], srgb: true });
    return cache[key];
  }

  /** Tangent-space normal map from fbm height (Sobel) */
  function groundNormal(THREE, repeatX, repeatY) {
    var key = 'gnorm' + repeatX + 'x' + repeatY;
    if (cache[key]) return cache[key];
    var s = 256, c = canvas(s), g = c.getContext('2d');
    var h = fbm(s, 29, 5);
    var img = g.createImageData(s, s);
    var str = 3.2;
    function H(x, y) { return h[((y + s) % s) * s + ((x + s) % s)]; }
    for (var y = 0; y < s; y++) {
      for (var x = 0; x < s; x++) {
        var dx = (H(x + 1, y) - H(x - 1, y)) * str;
        var dy = (H(x, y + 1) - H(x, y - 1)) * str;
        var len = Math.sqrt(dx * dx + dy * dy + 1);
        var o = (y * s + x) * 4;
        img.data[o] = (-dx / len * 0.5 + 0.5) * 255;
        img.data[o + 1] = (-dy / len * 0.5 + 0.5) * 255;
        img.data[o + 2] = (1 / len * 0.5 + 0.5) * 255;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    cache[key] = toTexture(THREE, c, { repeat: [repeatX, repeatY] });
    return cache[key];
  }

  /** Soft irregular blob mask (alphaMap uses the green channel) — dirt patches / scorch */
  function blobMask(THREE) {
    if (cache.blob) return cache.blob;
    var s = 128, c = canvas(s), g = c.getContext('2d');
    var n = fbm(s, 133, 4);
    var img = g.createImageData(s, s);
    for (var y = 0; y < s; y++) {
      for (var x = 0; x < s; x++) {
        var dx = (x - s / 2) / (s / 2), dy = (y - s / 2) / (s / 2);
        var d = Math.sqrt(dx * dx + dy * dy) + (n[y * s + x] - 0.5) * 0.7;
        var a = Math.max(0, Math.min(1, (0.92 - d) / 0.4));
        var o = (y * s + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = a * 255; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    cache.blob = toTexture(THREE, c);
    return cache.blob;
  }

  /** Soft-sided strip mask for the worn centre track (fades at the long edges + ends) */
  function stripMask(THREE) {
    if (cache.strip) return cache.strip;
    var sw = 64, sh = 256, c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    var g = c.getContext('2d');
    var n = fbm(256, 211, 4);
    var img = g.createImageData(sw, sh);
    for (var y = 0; y < sh; y++) {
      for (var x = 0; x < sw; x++) {
        var u = Math.abs(x / (sw - 1) - 0.5) * 2;
        var v = Math.abs(y / (sh - 1) - 0.5) * 2;
        var nn = n[(y % 256) * 256 + (x * 4) % 256];
        var e = Math.min(1, u);
        var a = (1 - e * e * (3 - 2 * e)) * Math.max(0, Math.min(1, (1 - v) * 6));
        var o = (y * sw + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(0, Math.min(255, a * 255)); img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    cache.strip = toTexture(THREE, c);
    return cache.strip;
  }

  LB.proctex = { softDot: softDot, smokePuff: smokePuff, groundDetail: groundDetail, groundNormal: groundNormal, blobMask: blobMask, stripMask: stripMask, fbm: fbm };
})(window);
