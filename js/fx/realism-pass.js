/* LUNC Battlefield v12.0.13 — Realism pass, part 1.
 * Layered explosions, speed-of-sound delay + distance attenuation on blasts,
 * faction camo / PBR wear on bases & defenses, gravity ballistic arcs,
 * stronger muzzle-flash / fire light. Scales down on LOW/phone.
 * Kill switch: ?realism=0. Cosmetic / audio only — never touches market data,
 * army counts or the front. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('realism') !== '0';
  var state = {
    ready: false,
    enabled: enabled,
    hooked: false,
    matsApplied: 0,
    delayedBooms: 0,
    layered: 0,
    ballistic: 0,
    lights: 0
  };
  var SOS = 340; // m/s approximate; 1 world unit ≈ 1 m
  var pending = [];
  var columns = [];

  function E() { return LB.engine; }
  function low() {
    try { return LB.quality.getEffectiveName() === 'LOW' || (E() && E().mobile); } catch (_) { return false; }
  }
  function camPos() {
    try { return E().camera.position; } catch (_) { return { x: 0, y: 30, z: 50 }; }
  }
  function distToCam(x, y, z) {
    var c = camPos();
    var dx = c.x - x, dy = (c.y || 0) - (y || 0), dz = c.z - z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ---- Camo / PBR wear palettes (Bull olive drab, Bear rust-brown) ----
  function camoPalette(side) {
    if (side < 0) {
      return {
        base: 0x3a4f30, accent: 0x2a3a24, metal: 0x3a3e38, dirt: 0x5a4a34,
        wear: 0x6a6048, wood: 0x4a3a28
      };
    }
    return {
      base: 0x5a3a32, accent: 0x4a2e28, metal: 0x3e3834, dirt: 0x5a4a34,
      wear: 0x6a5848, wood: 0x4a3a28
    };
  }

  function wearMat(THREE, color, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: rough == null ? 0.82 : rough,
      metalness: metal == null ? 0.18 : metal
    });
  }

  function applyWearToMesh(mesh, side) {
    if (!mesh || !mesh.isMesh || !mesh.material) return;
    var THREE = E().THREE;
    var pal = camoPalette(side);
    var name = (mesh.name || '') + (mesh.userData && mesh.userData.kind || '');
    var mat;
    if (/barrel|gun|tube|rail|dish/i.test(name) || (mesh.geometry && mesh.geometry.type === 'CylinderGeometry' && mesh.scale.x < 0.2)) {
      mat = wearMat(THREE, pal.metal, 0.45, 0.62);
    } else if (/sand|bag|crate/i.test(name)) {
      mat = wearMat(THREE, pal.dirt, 0.95, 0.04);
    } else if (/flag|accent|roof|nest|leaf/i.test(name)) {
      mat = wearMat(THREE, pal.accent, 0.72, 0.12);
    } else {
      // Base body: camo + slight random wear darkening
      var c = new THREE.Color(pal.base);
      c.offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
      mat = wearMat(THREE, c.getHex(), 0.78 + Math.random() * 0.12, 0.12 + Math.random() * 0.1);
    }
    // Dirt/wear: slightly raise roughness, subtle emissive dirt not needed
    try {
      if (mesh.material && mesh.material.dispose && mesh.userData && !mesh.userData._realismOwned) {
        // don't dispose shared mats aggressively; just replace reference
      }
    } catch (_) {}
    mesh.material = mat;
    mesh.userData = mesh.userData || {};
    mesh.userData._realismOwned = true;
    state.matsApplied++;
  }

  function paintGroup(g, side) {
    if (!g) return;
    g.traverse(function (c) {
      if (!c.isMesh) return;
      if (c.userData && c.userData._realismOwned) return;
      applyWearToMesh(c, side == null ? (g.userData && g.userData.side) : side);
    });
  }

  function applyCamoToInvasion() {
    if (!enabled || !LB.baseInvasion) return;
    try {
      if (LB.baseInvasion._forEachDefense) {
        LB.baseInvasion._forEachDefense(function (d) { paintGroup(d, d.userData && d.userData.side); });
      }
      if (LB.baseInvasion._forEachBarracks) {
        LB.baseInvasion._forEachBarracks(function (b) { paintGroup(b, b.userData && b.userData.side); });
      }
      if (LB.baseInvasion._forEachWall) {
        LB.baseInvasion._forEachWall(function (w) { paintGroup(w, w.userData && w.userData.side); });
      }
    } catch (_) {}
  }

  // ---- Layered explosion extras: rising smoke column + delayed debris puff ----
  function spawnSmokeColumn(x, z, power) {
    if (!enabled) return;
    var eng = E();
    if (!eng || !eng.THREE || !eng.scene) return;
    if (low() && Math.random() > 0.45) return;
    var THREE = eng.THREE;
    var H = 0;
    try { H = eng.terrainHeight(x, z) || 0; } catch (_) {}
    var g = new THREE.Group();
    g.position.set(x, H, z);
    var n = low() ? 3 : 5;
    var greys = [0x7a7468, 0x6a6558, 0x5c564c, 0x8a8478, 0x4a453c];
    for (var i = 0; i < n; i++) {
      var op = Math.max(0.06, 0.32 - i * 0.05) * Math.min(1.2, power || 1);
      var p = new THREE.Mesh(
        new THREE.SphereGeometry(0.45 + i * 0.22, low() ? 5 : 8, low() ? 4 : 6),
        new THREE.MeshBasicMaterial({
          color: greys[i % greys.length], transparent: true, opacity: op, depthWrite: false
        })
      );
      p.position.set((i % 2) * 0.15, 0.6 + i * 0.85, 0);
      p.userData = { layer: i, baseOp: op, born: performance.now() };
      g.add(p);
    }
    g.userData = { life: 2.2 + (power || 1) * 0.6, maxLife: 2.8, wind: 0.4 + Math.random() * 0.3 };
    eng.scene.add(g);
    columns.push(g);
    state.layered++;
    // Cap
    while (columns.length > (low() ? 4 : 10)) {
      var old = columns.shift();
      if (old && old.parent) old.parent.remove(old);
    }
  }

  function layeredBoom(x, z, power) {
    if (!enabled) return;
    power = power == null ? 1 : power;
    // Flash / fireball / shockwave / scorch already in effects.explosion —
    // add rising smoke column + optional secondary debris ring
    spawnSmokeColumn(x, z, power);
    try {
      if (LB.heavyFx && LB.heavyFx.puff && !low()) {
        LB.heavyFx.puff({
          kind: 'smoke', x: x, y: 1.2, z: z,
          size: 1.4 * power, grow: 2.2, life: 1.4,
          color: 0x6a6558, opacity: 0.35
        });
      }
    } catch (_) {}
    // Point fire light briefly (MEDIUM+)
    if (!low()) {
      try {
        var THREE = E().THREE;
        var light = new THREE.PointLight(0xffa040, 1.6 * Math.min(2, power), 18 + power * 6, 2);
        var H = 0; try { H = E().terrainHeight(x, z) || 0; } catch (_) {}
        light.position.set(x, H + 2.2, z);
        E().scene.add(light);
        state.lights++;
        var born = performance.now();
        var lid = setInterval(function () {
          var age = (performance.now() - born) / 1000;
          if (age > 0.35 || !light.parent) {
            clearInterval(lid);
            if (light.parent) light.parent.remove(light);
            try { light.dispose && light.dispose(); } catch (_) {}
            return;
          }
          light.intensity = 1.6 * Math.min(2, power) * (1 - age / 0.35);
        }, 40);
      } catch (_) {}
    }
  }

  // ---- Speed-of-sound delayed blast ----
  function scheduleBoom(power, x, y, z) {
    if (!enabled || !LB.sfx || !LB.sfx.explosion) return;
    var d = distToCam(x, y || 0, z);
    var delayMs = Math.min(2500, (d / SOS) * 1000);
    // Attenuation: loud near, quiet far (also passed as dist 0..1 to sfx)
    var attDist = Math.min(1, d / 160);
    if (LB.sfx.whoosh) { try { LB.sfx.explosion(power, attDist, { x: x, y: y || 0, z: z }); } catch (_) {} if (delayMs >= 40) state.delayedBooms++; return; }   // v12.0.39 positional
    if (delayMs < 40) {
      try { LB.sfx.explosion(power, attDist); } catch (_) {}
      return;
    }
    pending.push({ at: performance.now() + delayMs, power: power, dist: attDist });
    state.delayedBooms++;
  }

  function pumpPending() {
    if (!pending.length) return;
    var now = performance.now();
    for (var i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at <= now) {
        try { LB.sfx.explosion(pending[i].power, pending[i].dist); } catch (_) {}
        pending.splice(i, 1);
      }
    }
  }

  function tickColumns(dt) {
    for (var i = columns.length - 1; i >= 0; i--) {
      var g = columns[i];
      g.userData.life -= dt;
      var t = 1 - Math.max(0, g.userData.life) / (g.userData.maxLife || 2.5);
      g.children.forEach(function (p, j) {
        p.position.y += (0.35 + j * 0.08) * dt;
        p.position.x += (g.userData.wind || 0.3) * dt * (0.5 + j * 0.15);
        var s = 1 + t * (0.4 + j * 0.08);
        p.scale.set(s, s * 1.1, s);
        if (p.material) p.material.opacity = Math.max(0, (p.userData.baseOp || 0.2) * (1 - t));
      });
      if (g.userData.life <= 0) {
        if (g.parent) g.parent.remove(g);
        columns.splice(i, 1);
      }
    }
  }

  // ---- Hook engine effects + sfx ----
  function hook() {
    if (!enabled || state.hooked) return;
    var eng = E();
    if (!eng || !eng.effects) return;

    // Wrap createExplosion
    if (eng.effects.createExplosion && !eng.effects.__realismBoom) {
      var origBoom = eng.effects.createExplosion;
      eng.effects.createExplosion = function (x, z, color, power, isBurn) {
        var r = origBoom.apply(this, arguments);
        try { layeredBoom(x, z, power || 1); } catch (_) {}
        return r;
      };
      eng.effects.__realismBoom = true;
    }

    // Wrap fireWeapon for gravity arcs + muzzle light on shell/arty
    if (eng.effects.fireWeapon && !eng.effects.__realismBallistic) {
      var origFire = eng.effects.fireWeapon;
      eng.effects.fireWeapon = function (opts) {
        opts = opts || {};
        var kind = opts.kind || 'tracer';
        if (kind === 'shell' || kind === 'arty') {
          // Gravity-based peak height: h = g T^2 / 8
          try {
            var from = opts.from, to = opts.to;
            if (from && to) {
              var dx = to.x - from.x;
              var dz = (to.z || 0) - (from.z || 0);
              var dist = Math.sqrt(dx * dx + dz * dz) || 1;
              var speed = kind === 'arty' ? (9.5 + (opts.power || 1) * 2.2) : (18 + (opts.power || 1) * 4);
              var T = Math.min(kind === 'arty' ? 3.2 : 1.8, dist / speed + (kind === 'arty' ? 0.55 : 0.22));
              var g = 9.8;
              var peak = (g * T * T) / 8;
              // Blend with existing feel; arty gets fuller ballistic
              opts._realismArcH = kind === 'arty'
                ? Math.max(4.5, Math.min(18, peak * 1.15))
                : Math.max(1.2, Math.min(8, peak * 0.85));
              state.ballistic++;
            }
          } catch (_) {}
        }
        var mesh = origFire.call(this, opts);
        if (mesh && mesh.userData && opts._realismArcH != null) {
          mesh.userData.arcH = opts._realismArcH;
          mesh.userData.ballistic = true;
        }
        // Extra muzzle point light for shell/arty on MEDIUM+
        if (mesh && (kind === 'shell' || kind === 'arty') && !low() && opts.from) {
          try {
            var THREE = eng.THREE;
            var L = new THREE.PointLight(0xffe08a, kind === 'arty' ? 1.8 : 1.1, 12, 2);
            L.position.set(opts.from.x, (opts.from.y || 1) + 0.2, opts.from.z || 0);
            eng.scene.add(L);
            state.lights++;
            var t0 = performance.now();
            var iv = setInterval(function () {
              if (performance.now() - t0 > 90 || !L.parent) {
                clearInterval(iv);
                if (L.parent) L.parent.remove(L);
              } else {
                L.intensity *= 0.7;
              }
            }, 30);
          } catch (_) {}
        }
        return mesh;
      };
      eng.effects.__realismBallistic = true;
    }

    // Wrap sfx.explosion: far blasts get speed-of-sound delay + stronger attenuation
    if (LB.sfx && LB.sfx.explosion && !LB.sfx.__realismSos) {
      var raw = LB.sfx.explosion;
      LB.sfx._rawExplosion = raw;
      LB.sfx.explosion = function (power, dist, pos) {
        if (LB.sfx.__sosInside) return raw.call(LB.sfx, power, dist, pos);
        if (pos && LB.sfx.whoosh) return raw.call(LB.sfx, power, dist, pos);   // v12.0.39: positional sounds schedule their own delay on the audio clock
        dist = dist == null ? 0 : dist;
        if (dist > 1) dist = Math.min(1, dist / 260);   // v12.0.39: some callers pass metres
        // dist 0 = near / loud, 1 = far / quiet (battle-engine convention)
        if (dist > 0.22) {
          var approxM = dist * 140;
          var delayMs = Math.min(2200, (approxM / SOS) * 1000);
          pending.push({ at: performance.now() + delayMs, power: power, dist: Math.min(1, dist + 0.08) });
          state.delayedBooms++;
          return;
        }
        LB.sfx.__sosInside = true;
        try { return raw.call(LB.sfx, power, dist); }
        finally { LB.sfx.__sosInside = false; }
      };
      LB.sfx.__realismSos = true;
    }

    state.hooked = true;
    state.ready = true;
  }

  function tick() {
    if (!enabled) return;
    if (!state.hooked) hook();
    pumpPending();
    tickColumns(0.2);
  }

  function init() {
    if (!enabled) {
      LB.realism = {
        isEnabled: function () { return false; },
        getState: function () { return state; }
      };
      return;
    }
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (E() && E().effects && E().scene && E().THREE) {
        clearInterval(timer);
        try { hook(); } catch (_) {}
        // Camo pass after invasion builds (~2s later, retry a few times)
        var passes = 0;
        var camoTimer = setInterval(function () {
          passes++;
          try { applyCamoToInvasion(); } catch (_) {}
          if (passes > 8) clearInterval(camoTimer);
        }, 1500);
      } else if (tries > 50) {
        clearInterval(timer);
      }
    }, 400);
    setInterval(tick, 200);
  }

  LB.realism = {
    init: init,
    isEnabled: function () { return enabled; },
    getState: function () { return state; },
    layeredBoom: layeredBoom,
    scheduleBoom: scheduleBoom,
    applyCamo: applyCamoToInvasion
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1200);
  }
})(window);
