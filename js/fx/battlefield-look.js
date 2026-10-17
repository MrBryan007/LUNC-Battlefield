/* Battlefield look — scars, smoke, sandbags, burn patches. Cosmetic only.
 * v12.0.13: soft alpha-falloff earthy scorch (no solid black strip); grey/brown
 * smoke that drifts with wind and thins. ?look=0 disables. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('look') !== '0';

  var state = { ready: false, root: null, smokes: [], wind: { x: 0.35, z: 0.12 } };

  function E() { return LB.engine; }
  function low() {
    try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; }
  }

  function softScarMat(color, opacity) {
    var THREE = E().THREE;
    var m = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.94,
      metalness: 0.02,
      transparent: true,
      opacity: opacity == null ? 0.42 : opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    try {
      if (LB.proctex && LB.proctex.blobMask) {
        m.alphaMap = LB.proctex.blobMask(THREE);
        m.needsUpdate = true;
      }
    } catch (_) {}
    return m;
  }

  function mat(color, rough, metal, opacity) {
    var THREE = E().THREE;
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: rough == null ? 0.85 : rough,
      metalness: metal == null ? 0.05 : metal,
      transparent: opacity != null && opacity < 1,
      opacity: opacity == null ? 1 : opacity,
      depthWrite: opacity == null || opacity >= 0.9
    });
  }

  function H(x, z) {
    try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; }
  }

  function scar(x, z, w, d, color, opacity) {
    var THREE = E().THREE;
    var m = new THREE.Mesh(new THREE.CircleGeometry(1, 12), softScarMat(color, opacity));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, H(x, z) + 0.045, z);
    m.scale.set(w, d, 1);
    m.receiveShadow = true;
    return m;
  }

  function sandbags(x, z, count, rot) {
    var THREE = E().THREE;
    var g = new THREE.Group();
    for (var i = 0; i < count; i++) {
      var b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), mat(0x6a5a40, 0.92, 0.04));
      b.scale.set(1.4, 0.7, 1);
      b.position.set(i * 0.7, 0.2, (i % 2) * 0.15);
      g.add(b);
    }
    g.position.set(x, H(x, z), z);
    g.rotation.y = rot || 0;
    return g;
  }

  function smokeColumn(x, z) {
    var THREE = E().THREE;
    var g = new THREE.Group();
    // Grey/brown drifting smoke — never near-black solid spheres
    var greys = [0x7a7468, 0x6a6558, 0x5c564c, 0x8a8478];
    var layers = low() ? 3 : 5;
    for (var i = 0; i < layers; i++) {
      var op = Math.max(0.08, 0.28 - i * 0.045);
      var p = new THREE.Mesh(
        new THREE.SphereGeometry(0.55 + i * 0.28, 8, 6),
        new THREE.MeshBasicMaterial({
          color: greys[i % greys.length], transparent: true, opacity: op, depthWrite: false
        })
      );
      p.position.set((i % 2) * 0.25, 1.0 + i * 1.15, 0);
      p.userData = { layer: i, baseOp: op, phase: Math.random() * 10 };
      g.add(p);
    }
    g.position.set(x, H(x, z), z);
    g.userData = { baseY: g.position.y, t: Math.random() * 10, windPhase: Math.random() * 6 };
    return g;
  }

  function wreck(x, z) {
    var THREE = E().THREE;
    var g = new THREE.Group();
    var hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.1), mat(0x3c3832, 0.78, 0.28));
    hull.position.y = 0.3;
    hull.rotation.z = 0.3;
    var turret = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), mat(0x2e2c28, 0.7, 0.35));
    turret.position.set(0.4, 0.7, 0);
    turret.rotation.y = 0.6;
    g.add(hull, turret);
    g.position.set(x, H(x, z), z);
    return g;
  }

  function build() {
    var THREE = E().THREE;
    var scene = E().scene;
    var root = new THREE.Group();
    root.name = 'battlefield-look';
    scene.add(root);
    state.root = root;

    // Soft earthy scars — staggered so they never form a continuous black band
    var scars = low() ? 6 : 12;
    var earthy = [0x5a4a38, 0x4a4034, 0x6a5a44, 0x3d3428, 0x524636];
    for (var i = 0; i < scars; i++) {
      var x = -65 + i * 11 + ((i % 3) - 1) * 3.5;
      var z = ((i % 4) - 1.5) * 9 + (i % 2 ? 2.5 : -2.5);
      var c = earthy[i % earthy.length];
      var op = 0.28 + (i % 3) * 0.08;
      root.add(scar(x, z, 1.8 + (i % 3) * 0.4, 1.0 + (i % 2) * 0.35, c, op));
    }

    root.add(sandbags(-88, 4, 6, 0.2));
    root.add(sandbags(-88, -4, 5, -0.1));
    root.add(sandbags(88, 5, 6, 0.1));
    root.add(sandbags(88, -5, 5, -0.2));

    var wrecks = low() ? 2 : 4;
    for (var w = 0; w < wrecks; w++) {
      var wx = -18 + w * 12;
      var wz = (w % 2 ? 8 : -8);
      root.add(scar(wx, wz, 2.6, 2.0, 0x3a3026, 0.38));
      root.add(wreck(wx + 1, wz + 1));
    }

    var smokes = low() ? 2 : 4;
    for (var s = 0; s < smokes; s++) {
      var sm = smokeColumn(-28 + s * 18, (s % 2 ? 10 : -10));
      root.add(sm);
      state.smokes.push(sm);
    }

    // Keep atmosphere tint mild — do NOT crush fog/background to near-black
    try {
      if (scene.fog && scene.fog.color) {
        scene.fog.color.lerp(new THREE.Color(0x2a2e24), 0.15);
      }
    } catch (_) {}

    state.ready = true;
  }

  function tick() {
    if (!state.ready) return;
    var t = Date.now() / 1000;
    var wx = state.wind.x;
    var wz = state.wind.z;
    state.smokes.forEach(function (g, i) {
      g.children.forEach(function (p, j) {
        var layer = p.userData.layer || j;
        var phase = p.userData.phase || 0;
        // Drift with wind, rise, and thin with height / time
        p.position.y = 1.0 + layer * 1.15 + Math.sin(t * 0.55 + phase) * 0.18;
        p.position.x = Math.sin(t * 0.22 + phase) * 0.35 + wx * (0.4 + layer * 0.55) * Math.sin(t * 0.15 + i);
        p.position.z = Math.cos(t * 0.18 + phase) * 0.2 + wz * (0.3 + layer * 0.4);
        var s = 1 + layer * 0.08 + Math.sin(t * 0.4 + j) * 0.05;
        p.scale.set(s, s * (1.05 + layer * 0.04), s);
        if (p.material) {
          var base = p.userData.baseOp || 0.2;
          p.material.opacity = Math.max(0.05, base * (0.75 + 0.25 * Math.sin(t * 0.5 + phase)));
        }
      });
    });
  }

  function init() {
    if (!enabled) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (E() && E().scene && E().THREE) {
        clearInterval(timer);
        try { build(); } catch (_) {}
      } else if (tries > 40) {
        clearInterval(timer);
      }
    }, 500);
    setInterval(tick, 200);
  }

  LB.battlefieldLook = { init: init, getState: function () { return state; } };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1400);
  }
})(window);
