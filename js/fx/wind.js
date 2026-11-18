/* LUNC Battlefield v12.0.64 — Wind (realism checklist, FX: "smoke drifts with wind"). Visual / SIMULATED layer only.
 *
 * One shared surface wind for the whole world, instead of smoke that rose straight up, fires with a private breeze,
 * banners that waved without a direction and rain that fell vertically.
 *  - Direction (world: north = −z, east = +x, ocean to the south): a daytime sea breeze from the south-southwest that
 *    veers slowly (two slow sines, ±40°), backing to a weaker offshore land breeze from the north at night when the
 *    day/night cycle runs. Speed 2–9 m/s (4–18 kt) on a slow swell, with gust peaks of up to +60 % (more in rain).
 *    Rain: ×1.45 and gustier; fog: ×0.45 (fog only forms in light air); night: ×0.8. Weather changes blend over ~8 s.
 *  - The scene is compressed (a 22 m carrier), so things drift at DRIFT_K (0.3) of the real speed in world units, with
 *    a log-ish wind profile: ×0.55 at the ground rising to ×1 by 14 m (smoke columns lean more as they rise).
 *  - Consumers: effects.js smoke puffs, heavy-fx smoke / gas / dust (naval exhaust, napalm, gas), fires (v12.0.19),
 *    realism-pass smoke columns (v12.0.13), HQ banners (v12.0.32) stream downwind, rain streaks slant, and windsocks.
 *  - Windsocks: an orange / white 5-band sock on a 5 m mast at both ends of each airbase runway. It swings to the wind
 *    with a little lag and fills with speed like a real sock (each band ≈ 3 kt, fully out at 15 kt), flutters in
 *    gusts (not on LOW / phones). Shown in Map → WAR SYSTEMS · WEATHER & CYBER as WIND (SIMULATED).
 * Never touches market data, armies, the front, combat odds or data-truth labels.
 * Kill switch: ?wind=0 (also off with ?realism=0) → every consumer falls back to its old behaviour.
 * API: LUNCBattle.wind.{isEnabled, get, drift(y, out), force(fromDeg, mps|null), getState, update}. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('wind') !== '0' && qs.get('realism') !== '0';
  var DRIFT_K = 0.3, KT = 1.94384, D2R = Math.PI / 180;
  var BASE_X = 205, BASE_Z = -55, SOCK_DX = [-31, 31], SOCK_DZ = 6.2, MAST = 5, SOCK_L = 2.6;
  var t0 = performance.now(), lastT = -1, wxMul = 1, gustMul = 1, nightK = 0, lastBlend = 0, forced = null;
  var cur = { x: 0, z: -1, speed: 4, gust: 0, kt: 8, fromDeg: 190, dirX: 0, dirZ: -1 };
  var THREE = null, root = null, socks = [], built = false, frame = 0;
  var stats = { socks: 0, frames: 0, culled: 0, consumers: {} };

  function E() { return LB.engine; }
  function weather() { try { return LB.v12extras.getOptions().weather || 'clear'; } catch (_) { return 'clear'; } }
  function nightNow() {
    try { var s = LB.skyLight && LB.skyLight.getState(); if (s && s.active) return s.night || 0; } catch (_) {}
    return doc && doc.body && doc.body.classList.contains('night') ? 1 : 0;
  }
  function lite() { try { return LB.quality.getEffectiveName() === 'LOW' || !!(E() && E().mobile) || global.innerWidth < 760; } catch (_) { return false; } }
  function H(x, z) { try { if (LB.groundY) return LB.groundY(x, z); } catch (_) {} try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }

  /** Recompute the wind for "now" (cheap; cached per ~16 ms so every consumer in a frame sees the same value). */
  function compute() {
    var now = performance.now(); if (now - lastT < 15) return cur;
    var dt = lastT < 0 ? 0 : Math.min(0.25, (now - lastT) / 1000); lastT = now;
    var t = (now - t0) / 1000, w = weather();
    var wantMul = w === 'rain' ? 1.45 : w === 'fog' ? 0.45 : 1, wantGust = w === 'rain' ? 1.6 : w === 'fog' ? 0.4 : 1;
    var a = dt ? Math.min(1, dt / 8) : 1; wxMul += (wantMul - wxMul) * a; gustMul += (wantGust - gustMul) * a;
    nightK += (nightNow() - nightK) * (dt ? Math.min(1, dt / 10) : 1);
    // direction the wind blows FROM, degrees true (0 = north = −z): sea breeze SSW by day → land breeze N at night
    var from = 200 + 28 * Math.sin(t / 211) + 12 * Math.sin(t / 53 + 1.3);
    from = from + (360 + 8 * Math.sin(t / 97) - from) * nightK;
    var base = (5.2 + 2.1 * Math.sin(t / 137 + 0.7) + 0.9 * Math.sin(t / 31)) * wxMul * (1 - 0.2 * nightK);
    var g = Math.max(0, Math.sin(t * 0.61) + 0.55 * Math.sin(t * 1.73 + 2.1) + 0.3 * Math.sin(t * 3.1 + 0.4) - 0.75) * 0.55 * gustMul;
    var speed = Math.max(0.6, Math.min(14, base * (1 + g)));
    if (forced) { if (forced.from != null) from = forced.from; if (forced.speed != null) { speed = forced.speed; g = 0; } }
    from = ((from % 360) + 360) % 360;
    var to = (from + 180) * D2R;                       // blowing toward: bearing → world (x = sin, z = −cos)
    cur.dirX = Math.sin(to); cur.dirZ = -Math.cos(to);
    cur.speed = speed; cur.gust = g; cur.kt = speed * KT; cur.fromDeg = from;
    cur.x = cur.dirX * speed; cur.z = cur.dirZ * speed;
    return cur;
  }
  /** World-unit drift velocity at height y (above ground), written into out {x, z}. */
  function drift(y, out) {
    out = out || {};
    if (!enabled) { out.x = 0; out.z = 0; return out; }
    var c = compute(), sh = 0.55 + 0.45 * Math.min(1, Math.max(0, y || 0) / 14), k = c.speed * DRIFT_K * sh;
    out.x = c.dirX * k; out.z = c.dirZ * k; return out;
  }
  function note(name) { stats.consumers[name] = (stats.consumers[name] || 0) + 1; }

  // ---------------------------------------------------------------- windsocks (airbase runway ends)
  function sockTex() {
    var c = doc.createElement('canvas'); c.width = 128; c.height = 16; var g = c.getContext('2d');
    for (var i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#eeeae0' : '#e8661c'; g.fillRect(i * 128 / 5, 0, 128 / 5 + 1, 16); }
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (var y = 0; y < 16; y += 4) g.fillRect(0, y, 128, 1);
    var tx = new THREE.CanvasTexture(c); if (THREE.sRGBEncoding) tx.encoding = THREE.sRGBEncoding; return tx;
  }
  function build() {
    var e = E(); THREE = e.THREE; root = new THREE.Group(); root.name = 'wind-socks'; e.scene.add(root);
    var lw = lite(), steel = new THREE.MeshStandardMaterial({ color: 0x9a9d98, roughness: 0.55, metalness: 0.6 });
    var red = new THREE.MeshStandardMaterial({ color: 0xb8322a, roughness: 0.6 });
    var cloth = new THREE.MeshStandardMaterial({ map: sockTex(), side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    // sock: open frustum lying along local +x (mouth at the pivot), UVs wrap the bands from mouth to tail
    var seg = lw ? 6 : 10, geo = new THREE.CylinderGeometry(0.16, 0.36, SOCK_L, lw ? 8 : 12, seg, true);
    geo.rotateZ(Math.PI / 2); geo.translate(SOCK_L / 2, 0, 0);
    var uv = geo.attributes.uv, pos = geo.attributes.position;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / SOCK_L, uv.getX(i));
    uv.needsUpdate = true;
    [-1, 1].forEach(function (side) {
      SOCK_DX.forEach(function (dx) {
        var x = side * BASE_X + dx, z = BASE_Z + SOCK_DZ, gy = H(x, z), m = new THREE.Group(); m.position.set(x, gy, z); root.add(m);
        var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, MAST, 6), steel); mast.position.y = MAST / 2; m.add(mast);
        for (var b = 0; b < 3; b++) { var band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.35, 6), red); band.position.y = 0.6 + b * 1.4; m.add(band); }
        var pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0x8f8c84, roughness: 0.9 })); pad.position.y = 0.04; m.add(pad);
        var yaw = new THREE.Group(); yaw.position.y = MAST; m.add(yaw);
        var ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 4, 12), steel); ring.rotation.y = Math.PI / 2; yaw.add(ring);
        var pitch = new THREE.Group(); yaw.add(pitch);
        var g2 = geo.clone(), sock = new THREE.Mesh(g2, cloth); sock.castShadow = !lw; pitch.add(sock);
        socks.push({ m: m, yaw: yaw, pitch: pitch, sock: sock, geo: g2, base: Float32Array.from(g2.attributes.position.array), hd: 0, fill: 0.5, ph: Math.random() * 6, side: side });
      });
    });
    stats.socks = socks.length; built = true;
  }
  function tickSocks(dt) {
    var c = compute(), e = E(), cam = e && e.camera, lw = lite(), t = (performance.now() - t0) / 1000;
    var want = Math.atan2(-c.dirZ, c.dirX);              // local +x → downwind (three: x' = cos, z' = −sin)
    var fillWant = Math.min(1, c.speed * KT / 15);       // a real sock is fully out at 15 kt (each band ≈ 3 kt)
    frame++;
    for (var i = 0; i < socks.length; i++) {
      var S = socks[i], d = want - S.hd; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      S.hd += d * Math.min(1, dt * 1.6); S.fill += (fillWant - S.fill) * Math.min(1, dt * 1.2);
      var fl = lw ? 0 : (0.04 + 0.12 * c.gust) * (0.4 + S.fill);
      S.yaw.rotation.y = S.hd + Math.sin(t * 3.1 + S.ph) * fl * 0.6;
      // droop: limp (≈ 75° down) in calm air → horizontal when fully filled
      S.pitch.rotation.z = -(1 - S.fill) * 1.3 + Math.sin(t * 4.3 + S.ph) * fl * 0.35;
      if (lw) continue;
      if (cam) { var dx = cam.position.x - S.m.position.x, dz = cam.position.z - S.m.position.z; if (dx * dx + dz * dz > 140 * 140) { stats.culled++; continue; } }
      // cloth: a limp sock is narrower toward the tail and ripples; a full one is a clean cone
      var p = S.geo.attributes.position, a = p.array, b = S.base, limp = 1 - S.fill;
      for (var v = 0; v < a.length; v += 3) {
        var u = b[v] / SOCK_L, sq = 1 - limp * 0.55 * u, wob = Math.sin(u * 9 - t * (6 + 6 * S.fill) + S.ph) * (0.03 + 0.05 * limp + 0.05 * c.gust) * u;
        a[v] = b[v] * (1 - 0.06 * limp * u); a[v + 1] = b[v + 1] * sq + wob; a[v + 2] = b[v + 2] * sq + wob * 0.6;
      }
      p.needsUpdate = true;
    }
    stats.frames++;
  }
  function update() {
    if (!enabled) return;
    var e = E(); if (!e || !e.THREE || !e.scene) return;
    if (!built) { try { build(); } catch (err) { console.warn('[wind] socks disabled', err); built = true; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (lastBlend || now)) / 1000); lastBlend = now;
    if (e.isPaused && e.isPaused()) return;
    if (socks.length) tickSocks(dt);
  }
  function compass(deg) { return ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(deg / 22.5) % 16]; }
  function label() {
    if (!enabled) return '';
    var c = compute(), g = c.gust > 0.08 ? ' gusting ' + Math.round(c.kt) : '';
    var base = c.gust > 0.08 ? c.kt / (1 + c.gust) : c.kt;
    return 'WIND ' + String(Math.round(c.fromDeg)).padStart(3, '0') + '° (' + compass(c.fromDeg) + ') ' + Math.round(base) + ' kt' + g;
  }

  LB.wind = {
    version: 'v12.0.64', update: update, label: label, compass: compass, _note: note,
    isEnabled: function () { return enabled; },
    get: function () { var c = compute(); return { x: c.x, z: c.z, dirX: c.dirX, dirZ: c.dirZ, speed: c.speed, gust: c.gust, kt: c.kt, fromDeg: c.fromDeg }; },
    drift: drift,
    force: function (fromDeg, mps) { forced = (fromDeg == null && mps == null) ? null : { from: fromDeg, speed: mps }; lastT = -1; return compute(); },
    getState: function () {
      var c = enabled ? compute() : cur;
      return { enabled: enabled, label: label(), fromDeg: +c.fromDeg.toFixed(1), speed: +c.speed.toFixed(2), kt: +c.kt.toFixed(1), gust: +c.gust.toFixed(2),
        dir: [+c.dirX.toFixed(3), +c.dirZ.toFixed(3)], wxMul: +wxMul.toFixed(2), night: +nightK.toFixed(2), forced: !!forced,
        socks: socks.map(function (S) { return { x: +S.m.position.x.toFixed(1), z: +S.m.position.z.toFixed(1), hd: +S.hd.toFixed(3), fill: +S.fill.toFixed(2), droop: +S.pitch.rotation.z.toFixed(2) }; }),
        stats: JSON.parse(JSON.stringify(stats)) };
    }
  };
})(window);
