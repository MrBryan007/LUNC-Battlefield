/* Base invasion — assault squads, siren, wrecks, darker bases. Does not touch market frontline math. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('invasion') !== '0' && qs.get('theaters') !== '0';

  var state = {
    ready: false,
    alertUntil: 0,
    lastAssault: 0,
    defenses: [],
    squads: [],
    lights: []
  };

  function E() { return LB.engine; }
  function low() {
    try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; }
  }

  function radio(side, text) {
    if (LB.ai && LB.ai.send) {
      try { LB.ai.send({ side: side, type: 'invasion', text: text }); } catch (_) {}
    }
    try {
      var el = document.getElementById('radioLog') || document.getElementById('feed');
      if (el && text) {
        var line = document.createElement('div');
        line.className = 'micro';
        line.textContent = '[RADIO] ' + text;
        el.insertBefore(line, el.firstChild);
        while (el.children.length > 40) el.removeChild(el.lastChild);
      }
    } catch (_) {}
  }

  function siren() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!state.audio) state.audio = new Ctx();
      var ctx = state.audio;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(420, ctx.currentTime);
      o.frequency.linearRampToValueAtTime(620, ctx.currentTime + 0.6);
      o.frequency.linearRampToValueAtTime(420, ctx.currentTime + 1.2);
      g.gain.setValueAtTime(0.04, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 1.5);
    } catch (_) {}
  }

  function mat(color, rough, metal) {
    var THREE = E().THREE;
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: rough == null ? 0.72 : rough,
      metalness: metal == null ? 0.25 : metal
    });
  }

  function makeDefense(kind, color) {
    var THREE = E().THREE;
    var group = new THREE.Group();
    if (kind === 'turret') {
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.95, 0.6, 8), mat(0x2a2a28, 0.8, 0.3));
      var body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.1), mat(color, 0.65, 0.35));
      var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), mat(0x1a1a1a, 0.4, 0.7));
      body.position.y = 0.55;
      barrel.rotation.z = Math.PI / 2;
      barrel.position.set(0.7, 0.6, 0);
      group.add(base, body, barrel);
    } else if (kind === 'mortar') {
      var pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.25, 8), mat(0x3a3a36, 0.85, 0.15));
      var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.1, 6), mat(0x222220, 0.5, 0.55));
      tube.rotation.x = 0.4;
      tube.position.y = 0.6;
      group.add(pad, tube);
    } else if (kind === 'sniper') {
      var tower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.7), mat(0x3d3a34, 0.78, 0.2));
      var nest = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.35, 1.1), mat(color, 0.7, 0.2));
      nest.position.y = 1.4;
      var sand = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 4), mat(0x6b5a3e, 0.9, 0.05));
      sand.position.set(0.5, 0.2, 0.4);
      group.add(tower, nest, sand);
    } else if (kind === 'aa') {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 6), mat(0x2c2c2a, 0.6, 0.4));
      var guns = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.4), mat(color, 0.55, 0.45));
      guns.position.y = 0.9;
      group.add(post, guns);
    }
    group.userData = { kind: kind, hp: 100, wreck: false };
    return group;
  }

  function makeSquad(side, color) {
    var THREE = E().THREE;
    var group = new THREE.Group();
    var count = low() ? 3 : 5;
    for (var i = 0; i < count; i++) {
      var body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.25), mat(color, 0.8, 0.1));
      body.position.set((i - 2) * 0.6, 0.35, (i % 2) * 0.4);
      group.add(body);
    }
    group.userData = { side: side, speed: 6 + Math.random() * 2, alive: true };
    return group;
  }

  function placeAll() {
    var THREE = E().THREE;
    var scene = E().scene;
    var root = new THREE.Group();
    root.name = 'base-invasion';
    scene.add(root);
    state.root = root;

    var sides = [
      { side: -1, name: 'bull', x: -96, color: 0x3d6b4a },
      { side: 1, name: 'bear', x: 96, color: 0x6b3d3d }
    ];
    var kinds = low() ? ['turret', 'mortar'] : ['turret', 'mortar', 'sniper', 'aa'];
    var offsets = [
      { dx: 9, dz: 7 },
      { dx: -7, dz: 9 },
      { dx: 11, dz: -8 },
      { dx: -9, dz: -7 }
    ];

    sides.forEach(function (s) {
      kinds.forEach(function (kind, i) {
        var off = offsets[i] || offsets[0];
        var mesh = makeDefense(kind, s.color);
        var x = s.x + off.dx;
        var z = off.dz;
        var y = 0;
        try { y = E().terrainHeight(x, z) || 0; } catch (_) {}
        mesh.position.set(x, y, z);
        mesh.userData.side = s.side;
        mesh.userData.home = { x: x, y: y, z: z };
        root.add(mesh);
        state.defenses.push(mesh);
      });

      // Night searchlight near HQ
      if (!low()) {
        var light = new THREE.SpotLight(0xffe6b0, 0.6, 40, 0.4, 0.5, 1);
        var lx = s.x + 4;
        var lz = 2;
        var ly = 0;
        try { ly = E().terrainHeight(lx, lz) || 0; } catch (_) {}
        light.position.set(lx, ly + 6, lz);
        light.target.position.set(lx + 10, ly, lz);
        root.add(light);
        root.add(light.target);
        state.lights.push(light);
      }
    });
    state.ready = true;
  }

  function spawnAssault(attackerSide) {
    var THREE = E().THREE;
    var color = attackerSide < 0 ? 0x3d6b4a : 0x6b3d3d;
    var squad = makeSquad(attackerSide, color);
    var startX = attackerSide < 0 ? -40 : 40;
    var targetX = attackerSide < 0 ? 96 : -96;
    var y = 0;
    try { y = E().terrainHeight(startX, 0) || 0; } catch (_) {}
    squad.position.set(startX, y, (Math.random() - 0.5) * 12);
    squad.userData.targetX = targetX;
    state.root.add(squad);
    state.squads.push(squad);
  }

  function startAssault(attackerSide) {
    var now = Date.now();
    if (now - state.lastAssault < 28000) return;
    state.lastAssault = now;
    state.alertUntil = now + 14000;
    var target = attackerSide < 0 ? 'BEAR' : 'BULL';
    radio(attackerSide, 'BASE UNDER ATTACK — ' + target + ' BASE');
    siren();
    spawnAssault(attackerSide);
    try {
      var badge = document.getElementById('battleBadge');
      if (badge) badge.textContent = 'BASE UNDER ATTACK';
    } catch (_) {}
  }

  function wreck(mesh) {
    if (mesh.userData.wreck) return;
    mesh.userData.wreck = true;
    mesh.userData.hp = 0;
    mesh.rotation.z = 0.4;
    mesh.position.y -= 0.4;
    mesh.traverse(function (c) {
      if (c.material && c.material.color) {
        c.material = c.material.clone();
        c.material.color.setHex(0x2a2622);
        c.material.emissive = c.material.emissive || { setHex: function () {} };
      }
    });
  }

  function tick() {
    if (!enabled || !E() || !E().scene) return;
    if (!state.ready) {
      try { placeAll(); } catch (_) { return; }
    }
    var now = Date.now();
    var dt = 0.5;

    // Move squads toward the enemy base
    state.squads.forEach(function (sq) {
      if (!sq.userData.alive) return;
      var dir = sq.userData.targetX > sq.position.x ? 1 : -1;
      sq.position.x += dir * sq.userData.speed * dt;
      // Damage a defense if close
      state.defenses.forEach(function (d) {
        if (d.userData.wreck) return;
        if (d.userData.side === sq.userData.side) return;
        var dx = d.position.x - sq.position.x;
        var dz = d.position.z - sq.position.z;
        if (dx * dx + dz * dz < 36) {
          d.userData.hp -= 25;
          if (d.userData.hp <= 0) wreck(d);
        }
      });
      if (Math.abs(sq.position.x - sq.userData.targetX) < 8) {
        sq.userData.alive = false;
        sq.visible = false;
      }
    });

    // Night lights sweep a little
    state.lights.forEach(function (l, i) {
      l.target.position.x += Math.sin(now / 800 + i) * 0.15;
    });

    if (now - state.lastAssault > 42000) {
      var roll = (now / 1000 | 0) % 2 === 0 ? -1 : 1;
      startAssault(roll);
    }
    if (state.alertUntil && now > state.alertUntil) {
      state.alertUntil = 0;
      try {
        var badge = document.getElementById('battleBadge');
        if (badge && badge.textContent === 'BASE UNDER ATTACK') {
          badge.textContent = 'Contested Market Front';
        }
      } catch (_) {}
    }
  }

  function init() {
    if (!enabled) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (E() && E().scene && E().THREE) {
        clearInterval(timer);
        placeAll();
      } else if (tries > 40) {
        clearInterval(timer);
      }
    }, 500);
    setInterval(tick, 500);
  }

  LB.baseInvasion = { init: init, tick: tick, getState: function () { return state; } };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1200);
  }
})(window);
