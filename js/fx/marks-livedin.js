/* Hits leave marks + lived-in bases. Cosmetic only. Does not touch market math. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('marks') !== '0';

  var state = { ready: false, root: null, marks: [], lastHook: 0 };

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
      roughness: rough == null ? 0.82 : rough,
      metalness: metal == null ? 0.08 : metal,
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
    var hole = new THREE.Mesh(new THREE.CircleGeometry(r, 8), mat(0x161210, 0.95, 0.02));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.04;
    var rim = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r * 1.2, 8), mat(0x3a3026, 0.9, 0.04));
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.06;
    g.add(hole, rim);
    g.position.set(x, H(x, z), z);
    return g;
  }

  function smallFire(x, z) {
    var THREE = E().THREE;
    var g = new THREE.Group();
    var core = new THREE.Mesh(new THREE.SphereGeometry(0.3, 5, 4), mat(0xff5a12, 0.4, 0, 0.9, 0xff4400, 1.2));
    var smoke = new THREE.Mesh(new THREE.SphereGeometry(0.45, 5, 4), mat(0x2a2620, 0.9, 0, 0.35));
    smoke.position.y = 0.9;
    g.add(core, smoke);
    g.position.set(x, H(x, z) + 0.15, z);
    g.userData = { t: Math.random() * 8, life: 18 };
    return g;
  }

  function crate(x, z) {
    var THREE = E().THREE;
    var m = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), mat(0x5a4a32, 0.85, 0.1));
    m.position.set(x, H(x, z) + 0.25, z);
    m.rotation.y = Math.random() * 0.6;
    return m;
  }

  function damagedWall(x, z, rot) {
    var THREE = E().THREE;
    var g = new THREE.Group();
    var wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 0.3), mat(0x4a4540, 0.88, 0.12));
    wall.position.y = 0.7;
    var hole = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.35), mat(0x1a1612, 0.95, 0.02));
    hole.position.set(0.4, 0.8, 0);
    g.add(wall, hole);
    g.position.set(x, H(x, z), z);
    g.rotation.y = rot || 0;
    return g;
  }

  function markAt(x, z) {
    if (state.marks.length > (low() ? 12 : 28)) {
      var old = state.marks.shift();
      if (old && old.parent) old.parent.remove(old);
    }
    var c = crater(x, z, 1.2 + Math.random() * 0.8);
    state.root.add(c);
    state.marks.push(c);
    if (Math.random() < 0.55) {
      var f = smallFire(x + 0.4, z + 0.3);
      state.root.add(f);
      state.marks.push(f);
    }
  }

  function livedInBases() {
    // Clutter and damaged walls around both HQs
    var spots = [
      { x: -90, z: 6 }, { x: -86, z: -5 }, { x: -94, z: 2 },
      { x: 90, z: 5 }, { x: 86, z: -6 }, { x: 94, z: 3 }
    ];
    spots.forEach(function (s, i) {
      state.root.add(crate(s.x, s.z));
      if (i % 2 === 0) state.root.add(crate(s.x + 0.9, s.z + 0.4));
    });
    state.root.add(damagedWall(-84, 10, 0.2));
    state.root.add(damagedWall(-84, -10, -0.15));
    state.root.add(damagedWall(84, 10, -0.1));
    state.root.add(damagedWall(84, -10, 0.15));
  }

  function hookExplosions() {
    // Watch for existing explosion calls if the engine exposes them
    try {
      var eng = E();
      if (eng && eng.createExplosion && !eng.__marksHooked) {
        var orig = eng.createExplosion;
        eng.createExplosion = function (x, z) {
          var r = orig.apply(this, arguments);
          try { markAt(x || 0, z || 0); } catch (_) {}
          return r;
        };
        eng.__marksHooked = true;
      }
    } catch (_) {}
  }

  function build() {
    var THREE = E().THREE;
    var scene = E().scene;
    var root = new THREE.Group();
    root.name = 'marks-livedin';
    scene.add(root);
    state.root = root;
    livedInBases();
    // Seed a few marks so the field already looks hit
    var seeds = low() ? 3 : 6;
    for (var i = 0; i < seeds; i++) {
      markAt(-30 + i * 12, (i % 2 ? 6 : -6));
    }
    hookExplosions();
    state.ready = true;
  }

  function tick() {
    if (!state.ready) return;
    var t = Date.now() / 1000;
    // Flicker any fire marks
    state.marks.forEach(function (m) {
      if (!m.userData || m.userData.life == null) return;
      m.userData.life -= 0.2;
      if (m.children && m.children[0]) {
        var s = 1 + Math.sin(t * 7) * 0.12;
        m.children[0].scale.set(s, s * 1.15, s);
      }
      if (m.userData.life <= 0 && m.parent) {
        m.parent.remove(m);
      }
    });
    // Occasional new mark if no engine hook fired
    if (Date.now() - state.lastHook > 8000 && Math.random() < 0.3) {
      state.lastHook = Date.now();
      markAt((Math.random() - 0.5) * 70, (Math.random() - 0.5) * 16);
    }
    hookExplosions();
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
    setInterval(tick, 250);
  }

  LB.marks = { init: init, markAt: markAt, getState: function () { return state; } };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1800);
  }
})(window);
