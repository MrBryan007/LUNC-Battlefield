/* Battlefield look — scars, smoke, sandbags, burn patches. Cosmetic only. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('look') !== '0';

  var state = { ready: false, root: null, smokes: [] };

  function E() { return LB.engine; }
  function low() {
    try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; }
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

  function scar(x, z, w, d, color) {
    var THREE = E().THREE;
    var m = new THREE.Mesh(new THREE.CircleGeometry(1, 8), mat(color, 0.95, 0.02));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, H(x, z) + 0.04, z);
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
    for (var i = 0; i < 4; i++) {
      var p = new THREE.Mesh(new THREE.SphereGeometry(0.6 + i * 0.25, 6, 4), mat(0x2a2a28, 0.9, 0.0, 0.35));
      p.position.set((i % 2) * 0.3, 1.2 + i * 1.1, 0);
      g.add(p);
    }
    g.position.set(x, H(x, z), z);
    g.userData = { baseY: g.position.y, t: Math.random() * 10 };
    return g;
  }

  function wreck(x, z) {
    var THREE = E().THREE;
    var g = new THREE.Group();
    var hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.1), mat(0x2c2824, 0.7, 0.3));
    hull.position.y = 0.3;
    hull.rotation.z = 0.3;
    var turret = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), mat(0x1e1c1a, 0.6, 0.4));
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

    // Ground scars across the front
    var scars = low() ? 8 : 18;
    for (var i = 0; i < scars; i++) {
      var x = -70 + (i * 8) + (i % 3);
      var z = ((i % 5) - 2) * 6;
      var c = i % 3 === 0 ? 0x3a342c : (i % 3 === 1 ? 0x2a2620 : 0x4a4034);
      root.add(scar(x, z, 2.4 + (i % 3), 1.2 + (i % 2), c));
    }

    // Sandbag lines near both HQs
    root.add(sandbags(-88, 4, 6, 0.2));
    root.add(sandbags(-88, -4, 5, -0.1));
    root.add(sandbags(88, 5, 6, 0.1));
    root.add(sandbags(88, -5, 5, -0.2));

    // Burned patches and wrecks in the middle
    var wrecks = low() ? 2 : 5;
    for (var w = 0; w < wrecks; w++) {
      var wx = -20 + w * 10;
      var wz = (w % 2 ? 6 : -6);
      root.add(scar(wx, wz, 3.2, 2.4, 0x1a1612));
      root.add(wreck(wx + 1, wz + 1));
    }

    // Smoke columns
    var smokes = low() ? 2 : 4;
    for (var s = 0; s < smokes; s++) {
      var sm = smokeColumn(-30 + s * 18, (s % 2 ? 8 : -8));
      root.add(sm);
      state.smokes.push(sm);
    }

    // Darker overall fog tint if the scene fog exists
    try {
      if (scene.fog && scene.fog.color) {
        scene.fog.color.setHex(0x1a1c16);
      }
      if (scene.background && scene.background.setHex) {
        scene.background.setHex(0x121410);
      }
    } catch (_) {}

    state.ready = true;
  }

  function tick() {
    if (!state.ready) return;
    var t = Date.now() / 1000;
    state.smokes.forEach(function (g, i) {
      g.children.forEach(function (p, j) {
        p.position.y = 1.2 + j * 1.1 + Math.sin(t * 0.6 + i + j) * 0.15;
        p.position.x = Math.sin(t * 0.3 + j) * 0.2;
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
