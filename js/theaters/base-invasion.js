/* Base invasion slice — defenses + alert. Does not touch market frontline math. */
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
    barracks: { bull: 4, bear: 4 }
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

  function makeMesh(THREE, kind, color) {
    var g, m;
    if (kind === 'turret') {
      g = new THREE.CylinderGeometry(0.6, 0.8, 1.4, 8);
    } else if (kind === 'mortar') {
      g = new THREE.CylinderGeometry(0.35, 0.5, 1.1, 6);
    } else if (kind === 'sniper') {
      g = new THREE.BoxGeometry(0.8, 2.4, 0.8);
    } else if (kind === 'aa') {
      g = new THREE.CylinderGeometry(0.4, 0.55, 1.8, 6);
    } else {
      g = new THREE.BoxGeometry(1, 0.6, 1);
    }
    m = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7, metalness: 0.2 });
    var mesh = new THREE.Mesh(g, m);
    mesh.castShadow = !low();
    return mesh;
  }

  function placeDefenses() {
    var THREE = E().THREE;
    var scene = E().scene;
    var root = new THREE.Group();
    root.name = 'base-invasion-defenses';
    scene.add(root);

    var sides = [
      { side: -1, name: 'bull', x: -96, color: 0x3a6b4a },
      { side: 1, name: 'bear', x: 96, color: 0x6b3a3a }
    ];
    var kinds = low() ? ['turret', 'mortar'] : ['turret', 'mortar', 'sniper', 'aa'];
    var offsets = [
      { dx: 8, dz: 6 },
      { dx: -6, dz: 8 },
      { dx: 10, dz: -7 },
      { dx: -8, dz: -6 }
    ];

    sides.forEach(function (s) {
      kinds.forEach(function (kind, i) {
        var off = offsets[i] || offsets[0];
        var mesh = makeMesh(THREE, kind, s.color);
        var x = s.x + off.dx;
        var z = off.dz;
        var y = 0;
        try { y = E().terrainHeight(x, z) || 0; } catch (_) {}
        mesh.position.set(x, y + (kind === 'sniper' ? 1.2 : 0.7), z);
        mesh.userData = { kind: kind, side: s.side, hp: 100, wreck: false };
        root.add(mesh);
        state.defenses.push(mesh);
      });
    });
    state.root = root;
    state.ready = true;
  }

  function startAssault(attackerSide) {
    var now = Date.now();
    if (now - state.lastAssault < 25000) return;
    state.lastAssault = now;
    state.alertUntil = now + 12000;
    var target = attackerSide < 0 ? 'BEAR' : 'BULL';
    radio(attackerSide, 'BASE UNDER ATTACK — ' + target + ' BASE');
    try {
      var badge = document.getElementById('battleBadge');
      if (badge) badge.textContent = 'BASE UNDER ATTACK';
    } catch (_) {}
  }

  function tick() {
    if (!enabled || !E() || !E().scene) return;
    if (!state.ready) {
      try { placeDefenses(); } catch (_) { return; }
    }
    var now = Date.now();
    // Lightweight invasion pulse — does not move the market front
    if (now - state.lastAssault > 45000) {
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
        placeDefenses();
      } else if (tries > 40) {
        clearInterval(timer);
      }
    }, 500);
    setInterval(tick, 2000);
  }

  LB.baseInvasion = { init: init, tick: tick, getState: function () { return state; } };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1200);
  }
})(window);
