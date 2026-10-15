/* War zone look — fires, craters, wire, tracers, heavier atmosphere. Cosmetic only. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('warzone') !== '0';

  var state = { ready: false, root: null, fires: [], tracers: [] };

  function E() { return LB.engine; }
  function low() {
    try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; }
  }
  function H(x, z) {
    try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; }
  }
  function mat(color, rough, metal, opacity, emissive, ei) {
    var THREE = E().THREE;
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: rough == null ? 0.8 : rough,
      metalness: metal == null ? 0.1 : metal,
      transparent: opacity != null && opacity < 1,
      opacity: opacity == null ? 1 : opacity,
      emissive: emissive || 0x000000,
      emissiveIntensity: ei || 0,
      depthWrite: opacity == null || opacity >= 0.85
    });
  }

  function crater(x, z, r) {
    var THREE = E().THREE;
    var g = new THREE.Group();
    var hole = new THREE.Mesh(new THREE.CircleGeometry(r, 10), mat(0x1a1410, 0.95, 0.02));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.03;
    var rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r * 1.15, 10), mat(0x3a3228, 0.9, 0.04));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.05;
    g.add(hole, rim);
    g.position.set(x, H(x, z), z);
    return g;
  }

  function fire(x, z) {
    var THREE = E().THREE;
    var g = new THREE.Group();
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 6, 4), mat(0xff6a1a, 0.4, 0.0, 0.9, 0xff4500, 1.4));
    var glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), mat(0xff3300, 0.5, 0.0, 0.35, 0xff2200, 0.8));
    var smoke = new THREE.Mesh(new THREE.SphereGeometry(0.7, 6, 4), mat(0x222018, 0.9, 0.0, 0.4));
    smoke.position.y = 1.6;
    g.add(core, glow, smoke);
    g.position.set(x, H(x, z) + 0.2, z);
    g.userData = { t: Math.random() * 10 };
    return g;
  }

  function wire(x, z, len, rot) {
    var THREE = E().THREE;
    var g = new THREE.Group();
    var posts = 3;
    for (var i = 0; i < posts; i++) {
      var p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 5), mat(0x3a3a38, 0.6, 0.5));
      p.position.set(i * (len / (posts - 1)), 0.55, 0);
      g.add(p);
      if (i < posts - 1) {
        var line = new THREE.Mesh(new THREE.BoxGeometry(len / (posts - 1), 0.02, 0.02), mat(0x4a4a46, 0.5, 0.6));
        line.position.set(i * (len / (posts - 1)) + len / (posts - 1) / 2, 0.7, 0);
        g.add(line);
        var line2 = line.clone();
        line2.position.y = 0.35;
        g.add(line2);
      }
    }
    g.position.set(x, H(x, z), z);
    g.rotation.y = rot || 0;
    return g;
  }

  function tracer() {
    var THREE = E().THREE;
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.4), mat(0xffe08a, 0.3, 0.2, 0.85, 0xffcc66, 1.2));
    m.userData = {
      life: 0.6 + Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 40,
      vz: (Math.random() - 0.5) * 20,
      x: (Math.random() - 0.5) * 80,
      z: (Math.random() - 0.5) * 20
    };
    m.position.set(m.userData.x, 1.2, m.userData.z);
    return m;
  }

  function build() {
    var THREE = E().THREE;
    var scene = E().scene;
    var root = new THREE.Group();
    root.name = 'warzone-look';
    scene.add(root);
    state.root = root;

    var craters = low() ? 4 : 10;
    for (var i = 0; i < craters; i++) {
      var x = -60 + i * 12;
      var z = ((i % 4) - 1.5) * 7;
      root.add(crater(x, z, 1.6 + (i % 3) * 0.6));
    }

    var fires = low() ? 2 : 5;
    for (var f = 0; f < fires; f++) {
      var fx = -40 + f * 16;
      var fz = (f % 2 ? 9 : -9);
      var fl = fire(fx, fz);
      root.add(fl);
      state.fires.push(fl);
    }

    // Wire near both bases and across a gap
    root.add(wire(-92, 8, 10, 0.1));
    root.add(wire(-92, -8, 10, -0.1));
    root.add(wire(92, 8, 10, 0.05));
    root.add(wire(92, -8, 10, -0.05));
    if (!low()) {
      root.add(wire(-10, 12, 14, 0.4));
      root.add(wire(8, -12, 12, -0.3));
    }

    var tracerCount = low() ? 4 : 10;
    for (var t = 0; t < tracerCount; t++) {
      var tr = tracer();
      root.add(tr);
      state.tracers.push(tr);
    }

    // Heavier war fog
    try {
      if (scene.fog && scene.fog.color) scene.fog.color.setHex(0x1c1814);
      if (scene.background && scene.background.setHex) scene.background.setHex(0x141210);
    } catch (_) {}

    state.ready = true;
  }

  function tick() {
    if (!state.ready) return;
    var t = Date.now() / 1000;
    var dt = 0.2;
    state.fires.forEach(function (g, i) {
      var s = 1 + Math.sin(t * 6 + i) * 0.15;
      g.children[0].scale.set(s, s * 1.2, s);
      g.children[1].scale.set(s * 1.1, s, s * 1.1);
      g.children[2].position.y = 1.6 + Math.sin(t * 0.8 + i) * 0.2;
    });
    state.tracers.forEach(function (tr) {
      tr.userData.life -= dt;
      tr.position.x += tr.userData.vx * dt;
      tr.position.z += tr.userData.vz * dt;
      if (tr.userData.life <= 0 || Math.abs(tr.position.x) > 100) {
        tr.userData.life = 0.6 + Math.random() * 0.4;
        tr.userData.vx = (Math.random() - 0.5) * 40;
        tr.userData.vz = (Math.random() - 0.5) * 20;
        tr.position.set((Math.random() - 0.5) * 80, 1.2, (Math.random() - 0.5) * 20);
      }
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

  LB.warzone = { init: init, getState: function () { return state; } };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1600);
  }
})(window);
