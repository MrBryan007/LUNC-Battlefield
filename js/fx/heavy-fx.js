/* LUNC Battlefield v11.3 — visual primitives for Commander heavy weapons (game FX only).
 * Flybys (bomber / jet / A-10), lingering fire & gas zones, mushroom dust, tracer lines.
 * Pooled sprites, hard caps per tier; ticked from commander.tick(dt) so it freezes on pause.
 * Never touches armies, market data or the frontline. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var E = function () { return LB.engine; };
  var THREE = null, scene = null;
  var CAP = { LOW: 70, MEDIUM: 160, HIGH: 260, ULTRA: 320 };
  var sprites = [], pool = [], flybys = [], zones = [];
  var tex = {};
  function tierCap() { var t = 'HIGH'; try { t = LB.quality.getEffectiveName(); } catch (_) {} return CAP[t] || 160; }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }

  function ensure() {
    if (THREE) return true;
    var e = E(); if (!e || !e.THREE) return false;
    THREE = e.THREE; scene = e.scene;
    var PT = LB.proctex;
    tex.dot = PT && PT.softDot ? PT.softDot(THREE) : null;
    tex.smoke = PT && PT.smokePuff ? PT.smokePuff(THREE) : tex.dot;
    return true;
  }
  function sprite(kind) {
    var sp = null;
    for (var i = 0; i < pool.length; i++) if (pool[i].userData.kind === kind) { sp = pool.splice(i, 1)[0]; break; }
    if (!sp) {
      var add = kind === 'fire' || kind === 'tracer' || kind === 'flash';
      sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: kind === 'smoke' || kind === 'gas' || kind === 'dust' ? tex.smoke : tex.dot, transparent: true, depthWrite: false,
        blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !add, fog: true
      }));
      sp.userData.kind = kind;
    }
    sp.visible = true;
    if (!sp.parent) scene.add(sp);
    return sp;
  }
  function recycle(sp) { sp.visible = false; if (sp.parent) sp.parent.remove(sp); if (pool.length < 400) pool.push(sp); }

  /** Generic particle: {kind, x,y,z, vx,vy,vz, size, grow, life, color, opacity, delay} */
  function puff(o) {
    if (!ensure() || sprites.length >= tierCap()) return null;
    var sp = sprite(o.kind || 'smoke');
    sp.material.color.setHex(o.color != null ? o.color : 0xffffff);
    sp.position.set(o.x, o.y, o.z);
    sp.userData.p = { vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, size: o.size || 1, grow: o.grow || 0.6, life: o.life || 1.5, t: 0,
      op: o.opacity != null ? o.opacity : 0.6, delay: o.delay || 0, drag: o.drag != null ? o.drag : 0.97, flicker: !!o.flicker };
    sp.scale.setScalar(0.001);
    sprites.push(sp);
    return sp;
  }

  function buildPlane(kind, color) {
    if (!ensure()) return null;
    var g = new THREE.Group();
    var body = new THREE.MeshStandardMaterial({ color: kind === 'a10' ? 0x6b6f62 : 0x50565a, roughness: 0.6, metalness: 0.35 });
    var tint = new THREE.MeshStandardMaterial({ color: color || 0x888888, roughness: 0.5, metalness: 0.2 });
    var dark = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.7 });
    function box(w, h, d, m, x, y, z) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; }
    function cyl(r, l, m, x, y, z) { var c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 8), m); c.rotation.z = Math.PI / 2; c.position.set(x, y, z); g.add(c); return c; }
    if (kind === 'a10') {
      // A-10: straight wings, twin tail fins, rear-mounted twin engine pods, nose gun
      cyl(0.28, 3.4, body, 0, 0, 0);                    // fuselage (nose +x)
      box(0.5, 0.22, 0.5, dark, 1.55, 0.18, 0);         // canopy
      cyl(0.05, 0.7, dark, 1.95, -0.08, 0);             // GAU-8 barrel
      box(0.9, 0.07, 5.2, body, 0.15, -0.05, 0);        // straight wing
      box(0.6, 0.06, 0.5, tint, 0.15, 0.0, 2.35); box(0.6, 0.06, 0.5, tint, 0.15, 0.0, -2.35); // tinted tips
      cyl(0.24, 0.9, dark, -0.75, 0.42, 0.42); cyl(0.24, 0.9, dark, -0.75, 0.42, -0.42);       // twin engines
      box(0.6, 0.06, 1.9, body, -1.55, 0.25, 0);        // tailplane
      box(0.45, 0.7, 0.06, tint, -1.6, 0.55, 0.95); box(0.45, 0.7, 0.06, tint, -1.6, 0.55, -0.95); // twin fins
    } else if (kind === 'bomber') {
      cyl(0.42, 4.2, body, 0, 0, 0);
      box(1.3, 0.09, 6.4, body, 0.2, 0, 0);
      box(0.5, 0.08, 0.6, tint, 0.2, 0.02, 3.0); box(0.5, 0.08, 0.6, tint, 0.2, 0.02, -3.0);
      box(0.6, 0.9, 0.07, tint, -1.9, 0.5, 0);
      for (var i = -1; i <= 1; i += 2) { cyl(0.18, 0.8, dark, 0.4, -0.18, i * 1.5); cyl(0.18, 0.8, dark, 0.4, -0.18, i * 2.4); }
    } else {
      cyl(0.22, 3.0, body, 0, 0, 0);
      box(0.35, 0.18, 0.4, dark, 0.9, 0.16, 0);
      var w = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 3), body); w.rotation.set(Math.PI / 2, 0, -Math.PI / 2); w.scale.set(1, 1, 0.08); w.position.set(-0.3, 0, 0); g.add(w);
      box(0.5, 0.7, 0.06, tint, -1.2, 0.4, 0);
    }
    g.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    g.userData.heavyFx = true;
    return g;
  }

  /** Fly a plane from (x0,z0) to (x1,z1) at height y over dur seconds. onStep(t, x, z) every tick; onEnd(). */
  function flyby(o) {
    if (!ensure()) return null;
    var g = buildPlane(o.kind, o.color);
    g.scale.setScalar(o.scale || 1.6);
    var dx = o.x1 - o.x0, dz = o.z1 - o.z0;
    g.rotation.y = Math.atan2(-dz, dx);
    scene.add(g);
    var f = { g: g, o: o, t: 0, lastT: 0, smokeT: 0 };
    flybys.push(f);
    if (LB.sfx && LB.sfx.jet) try { LB.sfx.jet(); } catch (_) {}
    return f;
  }

  /** Lingering zone: kind 'fire' (orange flames + smoke) or 'gas' (green-yellow cloud). Optional line segment. */
  function zone(o) {
    if (!ensure()) return null;
    var z = { o: o, t: 0, emitT: 0 };
    zones.push(z);
    return z;
  }

  function mushroom(x, z, scale, dur) {
    if (!ensure()) return;
    var n = low() ? 10 : 26, y0 = E().terrainHeight(x, z);
    for (var i = 0; i < n; i++) {
      var k = i / n, cap = k > 0.55;
      var a = Math.random() * Math.PI * 2, rr = cap ? (1.6 + Math.random() * 2.2) * scale : Math.random() * 0.7 * scale;
      puff({ kind: 'dust', x: x + Math.cos(a) * rr * 0.4, y: y0 + 0.5, z: z + Math.sin(a) * rr * 0.4,
        vx: Math.cos(a) * rr * 0.25, vz: Math.sin(a) * rr * 0.25, vy: (cap ? 4.2 : 2.6 + k * 3) * scale * 0.55,
        size: (cap ? 3.4 : 1.8) * scale, grow: 1.4, life: dur || 5, color: cap ? 0x8a7a66 : 0x6e6152, opacity: 0.7, drag: cap ? 0.95 : 0.985, delay: k * 0.6 });
    }
    // ground ring of dust
    var m = low() ? 8 : 18;
    for (var j = 0; j < m; j++) {
      var b = (j / m) * Math.PI * 2;
      puff({ kind: 'dust', x: x, y: y0 + 0.3, z: z, vx: Math.cos(b) * 7 * scale, vz: Math.sin(b) * 7 * scale, vy: 0.3,
        size: 1.6 * scale, grow: 1.2, life: 2.6, color: 0x7d6f5c, opacity: 0.55, drag: 0.93 });
    }
  }

  function tracers(x0, z0, x1, z1, n, y) {
    if (!ensure()) return;
    for (var i = 0; i < n; i++) {
      var t = i / Math.max(1, n - 1);
      puff({ kind: 'tracer', x: x0 + (x1 - x0) * t, y: (y || 0.4) + E().terrainHeight(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t), z: z0 + (z1 - z0) * t,
        size: 0.35, grow: 0.1, life: 0.18, color: 0xffd27a, opacity: 0.95, delay: t * 0.05 });
    }
  }

  function update(dt) {
    if (!THREE) return;
    var eng = E();
    for (var i = flybys.length - 1; i >= 0; i--) {
      var f = flybys[i], o = f.o;
      if (!dt) continue;
      f.t = Math.min(1, f.t + dt / o.dur);
      var x = o.x0 + (o.x1 - o.x0) * f.t, z = o.z0 + (o.z1 - o.z0) * f.t;
      f.g.position.set(x, (eng.terrainHeight(x, z) || 0) + o.y, z);
      f.g.rotation.x = Math.sin(f.t * Math.PI) * (o.bank || 0.12);
      if (o.onStep) try { o.onStep(f.t, x, z, f); } catch (_) {}
      f.smokeT -= dt;
      if (f.smokeT <= 0 && !low()) { f.smokeT = 0.05; puff({ kind: 'smoke', x: x, y: f.g.position.y, z: z, size: 0.5, grow: 1.5, life: 0.8, color: 0xbfc2c4, opacity: 0.3 }); }
      if (f.t >= 1) { scene.remove(f.g); f.g.traverse(function (m) { if (m.geometry) m.geometry.dispose(); }); flybys.splice(i, 1); if (o.onEnd) try { o.onEnd(); } catch (_) {} }
    }
    for (var zi = zones.length - 1; zi >= 0; zi--) {
      var Z = zones[zi], zo = Z.o;
      if (!dt) continue;
      Z.t += dt; Z.emitT -= dt;
      if (Z.t >= zo.dur) { zones.splice(zi, 1); if (zo.onEnd) try { zo.onEnd(); } catch (_) {} continue; }
      if (zo.onTick) try { zo.onTick(Z.t, dt); } catch (_) {}
      if (Z.emitT <= 0) {
        Z.emitT = low() ? 0.16 : 0.07;
        var fade = 1 - Z.t / zo.dur;
        var px, pz;
        if (zo.line) { var tt = Math.random(); px = zo.line.x0 + (zo.line.x1 - zo.line.x0) * tt + (Math.random() - 0.5) * zo.r; pz = zo.line.z0 + (zo.line.z1 - zo.line.z0) * tt + (Math.random() - 0.5) * zo.r; }
        else { var a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * zo.r; px = zo.x + Math.cos(a) * rr; pz = zo.z + Math.sin(a) * rr; }
        var gy = eng.terrainHeight(px, pz);
        if (zo.kind === 'fire') {
          puff({ kind: 'fire', x: px, y: gy + 0.3, z: pz, vy: 1.6, size: 0.9 + Math.random() * 0.6, grow: 0.3, life: 0.7, color: Math.random() < 0.5 ? 0xff7a1a : 0xffb347, opacity: 0.85 * fade, flicker: true });
          if (Math.random() < 0.35) puff({ kind: 'smoke', x: px, y: gy + 1.0, z: pz, vy: 1.2, size: 1.2, grow: 1.6, life: 2.4, color: 0x2e2a26, opacity: 0.45 * fade });
        } else {
          puff({ kind: 'gas', x: px, y: gy + 0.5 + Math.random() * 0.8, z: pz, vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, vy: 0.12,
            size: 1.8 + Math.random(), grow: 0.8, life: 2.6, color: Math.random() < 0.5 ? 0xb8e04a : 0xd8e870, opacity: 0.42 * fade, drag: 0.99 });
        }
      }
    }
    for (var s = sprites.length - 1; s >= 0; s--) {
      var sp = sprites[s], p = sp.userData.p;
      if (!dt) continue;
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      var k = p.t / p.life;
      if (k >= 1) { sprites.splice(s, 1); recycle(sp); continue; }
      sp.position.x += p.vx * dt; sp.position.y += p.vy * dt; sp.position.z += p.vz * dt;
      p.vx *= p.drag; p.vz *= p.drag; p.vy *= p.drag;
      sp.scale.setScalar(p.size * (0.4 + Math.pow(k, 0.5) * p.grow + 0.6 * Math.min(1, k * 8)));
      sp.material.opacity = p.op * Math.min(1, k * 6) * (1 - k) * (p.flicker ? 0.75 + Math.random() * 0.25 : 1);
    }
  }

  function clear() {
    sprites.forEach(recycle); sprites.length = 0;
    flybys.forEach(function (f) { if (f.g.parent) f.g.parent.remove(f.g); }); flybys.length = 0;
    zones.length = 0;
  }

  LB.heavyFx = { puff: puff, flyby: flyby, zone: zone, mushroom: mushroom, tracers: tracers, buildPlane: buildPlane, update: update, clear: clear,
    getZones: function () { return zones.map(function (z) { return z.o; }); },
    getStats: function () { return { sprites: sprites.length, pool: pool.length, flybys: flybys.length, zones: zones.length, cap: tierCap() }; } };
})(window);
