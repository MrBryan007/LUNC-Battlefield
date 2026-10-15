/* LUNC Battlefield v12.0.13 — Base invasions + camo wear. Game/sim layer.
 * Each HQ gets barracks infantry, sentry + MG turrets, mortars, rockets, sniper towers, AA,
 * perimeter walls/gates and night searchlights. AI assault groups and player Raid orders attack
 * the enemy base; defenses fire (tracers 1-in-5, arcing mortars, rocket salvos, sniper, AA on jets).
 * Damaged defenses become wrecks and rebuild with fuel. A breach awards Commander score (cosmetic).
 * Siren via shared sfx; "BASE UNDER ATTACK" via voice alert queue. Never changes market data,
 * army counts or the front. ?invasion=0 (or ?theaters=0) turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('invasion') !== '0' && qs.get('theaters') !== '0';
  var THREE, root, ready = false, last = 0, uiT = 0, assaultT = 38, wrapDone = false;
  var HQ = 96, REBUILD_FUEL = 6, BARRACKS_S = 18, ASSAULT_CD = 42, RAID_CD = 28, BREACH_SCORE = 180;
  var defenses = [], barracks = [], gates = [], walls = [], lights = [], squads = [], shells = [], tracers = [];
  var bases = { '-1': { hp: 100, max: 100, side: -1 }, '1': { hp: 100, max: 100, side: 1 } };
  var alertUntil = 0, lastAssault = 0, lastRaid = 0, lastSiren = 0;
  var stats = { assaults: 0, raids: 0, shots: 0, wrecks: 0, rebuilds: 0, breaches: 0, respawns: 0, last: '' };
  var el = {};

  function E() { return LB.engine; }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function sideName(s) { return s < 0 ? 'BULL' : 'BEAR'; }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function med() { try { var n = LB.quality.getEffectiveName(); return n === 'MEDIUM' || n === 'LOW'; } catch (_) { return false; } }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }
  function hqX() { try { var c = LB.config; return (c && c.layout && c.layout.hqX) || HQ; } catch (_) { return HQ; } }
  function isNight() { return !!(doc.body && doc.body.classList.contains('night')); }
  function camDist(x, z) {
    try { var c = E().camera.position; var dx = c.x - x, dz = c.z - z; return Math.sqrt(dx * dx + dz * dz); } catch (_) { return 80; }
  }
  function far(x, z) { return camDist(x, z) > 140; }

  function mat(color, rough, metal) {
    // v12.0.13: slightly higher roughness = worn paint / fabric, less plastic shine
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: rough == null ? 0.84 : rough,
      metalness: metal == null ? 0.18 : metal
    });
  }
  function factionColor(side) { return side < 0 ? 0x3a4f30 : 0x5a3a32; } // olive drab / rust camo
  function factionAccent(side) { return side < 0 ? 0x2a3a24 : 0x4a2e28; }

  // ------------------------------------------------------------- radio + siren
  function radioAttack(targetSide) {
    var text = 'BASE UNDER ATTACK — ' + sideName(targetSide) + ' BASE';
    if (LB.voice && LB.voice.say) {
      try {
        LB.voice.say({
          pri: 3, side: 0, callsign: 'Watchtower', text: text, intercepted: false, tag: 'ALERT'
        });
        if (LB.voice._pump) LB.voice._pump(true);
      } catch (_) {}
    } else if (LB.ai && LB.ai.send) {
      try { LB.ai.send({ side: -targetSide, type: 'invasion', text: text }); } catch (_) {}
    }
    try {
      var badge = doc.getElementById('battleBadge');
      if (badge) badge.textContent = 'BASE UNDER ATTACK';
    } catch (_) {}
  }
  function playSiren() {
    var now = performance.now();
    if (now - lastSiren < 4000) return;
    lastSiren = now;
    if (LB.sfx && LB.sfx.siren) { try { LB.sfx.siren(); } catch (_) {} return; }
    // fallback if sfx.siren not yet present
    try { if (LB.sfx && LB.sfx.combat) LB.sfx.combat(0.25); if (LB.sfx && LB.sfx.radio) LB.sfx.radio(); } catch (_) {}
  }

  // ------------------------------------------------------------- mesh builders
  function makeDefense(kind, side) {
    var g = new THREE.Group(), color = factionColor(side), accent = factionAccent(side);
    var maxHp = 80;
    if (kind === 'sentry' || kind === 'mg') {
      maxHp = kind === 'mg' ? 110 : 90;
      var base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.45, 8), mat(0x2a2a28, 0.82, 0.35));
      var body = new THREE.Mesh(new THREE.BoxGeometry(kind === 'mg' ? 1.2 : 0.95, 0.5, kind === 'mg' ? 1.2 : 0.95), mat(color, 0.62, 0.38));
      var barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, kind === 'mg' ? 1.8 : 1.35, 6), mat(0x1a1a1a, 0.4, 0.75));
      body.position.y = 0.5; barrel.rotation.z = Math.PI / 2; barrel.position.set(kind === 'mg' ? 0.85 : 0.65, 0.55, 0);
      var head = new THREE.Group(); head.add(body, barrel); g.add(base, head); g.userData.head = head; g.userData.barrel = barrel;
    } else if (kind === 'mortar') {
      maxHp = 70;
      var pad = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.22, 8), mat(0x3a3a36, 0.88, 0.12));
      var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.05, 6), mat(0x222220, 0.5, 0.55));
      tube.rotation.x = -0.55; tube.position.set(0, 0.55, 0.15); g.add(pad, tube); g.userData.tube = tube;
    } else if (kind === 'rocket') {
      maxHp = 95;
      var rail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.9), mat(color, 0.6, 0.4));
      rail.position.y = 0.55;
      var tubes = new THREE.Group();
      for (var i = 0; i < 4; i++) {
        var t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 5), mat(0x2a2a28, 0.45, 0.6));
        t.rotation.z = Math.PI / 2; t.position.set(0.1, 0.85, -0.3 + i * 0.2); tubes.add(t);
      }
      var stand = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.5, 6), mat(0x333330, 0.7, 0.3));
      g.add(stand, rail, tubes); g.userData.head = tubes;
    } else if (kind === 'sniper') {
      maxHp = 85;
      var tower = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.8, 0.65), mat(0x3d3a34, 0.8, 0.18));
      tower.position.y = 1.4;
      var nest = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.38, 1.15), mat(accent, 0.7, 0.22));
      nest.position.y = 2.85;
      var sand = new THREE.Mesh(new THREE.SphereGeometry(0.32, 6, 4), mat(0x6b5a3e, 0.92, 0.04));
      sand.scale.set(1.2, 0.55, 0.9); sand.position.set(0.55, 0.18, 0.4);
      g.add(tower, nest, sand);
    } else if (kind === 'aa') {
      maxHp = 100;
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.5, 6), mat(0x2c2c2a, 0.58, 0.42));
      post.position.y = 0.75;
      var guns = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 0.45), mat(color, 0.52, 0.48));
      guns.position.y = 1.55;
      var dish = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(0x555550, 0.35, 0.65));
      dish.position.set(0, 2.05, 0); dish.rotation.x = -0.4;
      var head = new THREE.Group(); head.add(guns, dish); g.add(post, head); g.userData.head = head;
    }
    g.userData.kind = kind; g.userData.side = side; g.userData.hp = maxHp; g.userData.maxHp = maxHp;
    g.userData.wreck = false; g.userData.cd = 0; g.userData.parts = [];
    g.traverse(function (c) { if (c.isMesh) g.userData.parts.push({ mesh: c, mat: c.material }); });
    return g;
  }

  function makeWallSegment(side, x, z, rotY, len) {
    var g = new THREE.Group();
    var w = new THREE.Mesh(new THREE.BoxGeometry(len || 6, 1.4, 0.45), mat(0x4a463e, 0.88, 0.12));
    w.position.y = 0.7; g.add(w);
    var top = new THREE.Mesh(new THREE.BoxGeometry(len || 6, 0.25, 0.55), mat(factionAccent(side), 0.75, 0.2));
    top.position.y = 1.45; g.add(top);
    g.position.set(x, H(x, z), z); g.rotation.y = rotY || 0;
    g.userData = { kind: 'wall', side: side, hp: 60, maxHp: 60, wreck: false, parts: [] };
    g.traverse(function (c) { if (c.isMesh) g.userData.parts.push({ mesh: c, mat: c.material }); });
    return g;
  }

  function makeGate(side, x, z, facing) {
    var g = new THREE.Group();
    var postL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.2, 0.55), mat(0x3a3834, 0.8, 0.2));
    var postR = postL.clone(); postL.position.set(0, 1.1, -2.2); postR.position.set(0, 1.1, 2.2);
    var leaf = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.9, 4.0), mat(factionColor(side), 0.65, 0.35));
    leaf.position.set(0, 0.95, 0); g.add(postL, postR, leaf);
    g.position.set(x, H(x, z), z); g.rotation.y = facing || 0;
    g.userData = { kind: 'gate', side: side, hp: 90, maxHp: 90, wreck: false, open: 0, targetOpen: 0, leaf: leaf, parts: [] };
    g.traverse(function (c) { if (c.isMesh) g.userData.parts.push({ mesh: c, mat: c.material }); });
    return g;
  }

  function makeBarracks(side, x, z) {
    var g = new THREE.Group(), color = factionColor(side);
    var b = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.4, 3.6), mat(0x4a463c, 0.85, 0.15));
    b.position.y = 1.2;
    var roof = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.25, 4.0), mat(color, 0.7, 0.2));
    roof.position.y = 2.5;
    var door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.12), mat(0x2a2824, 0.9, 0.1));
    door.position.set(0, 0.8, 1.85);
    var flag = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.04), mat(side < 0 ? 0x3fbf7f : 0xd9564c, 0.6, 0.1));
    flag.position.set(2.4, 3.4, 0);
    g.add(b, roof, door, flag);
    g.position.set(x, H(x, z), z);
    g.userData = { side: side, timer: BARRACKS_S * 0.4, men: [], maxMen: low() ? 3 : (med() ? 5 : 8) };
    return g;
  }

  function makeMan(side, color) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.72, 0.28), mat(color, 0.82, 0.08));
    body.position.y = 0.9;
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), mat(0xc9a27e, 0.85, 0.05));
    head.position.y = 1.4;
    var legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.26), mat(0x2a2a28, 0.9, 0.05));
    legs.position.y = 0.28;
    g.add(body, head, legs);
    g.userData = { side: side, alive: true, hp: 30, cd: 0, speed: 5.5 + Math.random() * 1.5 };
    return g;
  }

  function makeAssaultSquad(side) {
    var g = new THREE.Group(), color = factionColor(side), n = low() ? 4 : (med() ? 6 : 8);
    for (var i = 0; i < n; i++) {
      var m = makeMan(side, color);
      m.position.set((i % 4 - 1.5) * 0.7, 0, ((i / 4) | 0) * 0.8 - 0.4);
      g.add(m);
    }
    g.userData = { side: side, speed: 5.8 + Math.random() * 1.8, alive: true, hp: n * 30, maxHp: n * 30, dmgCd: 0, breached: false };
    return g;
  }

  // ------------------------------------------------------------- place bases
  function placeAll() {
    THREE = E().THREE;
    root = new THREE.Group(); root.name = 'base-invasion'; E().scene.add(root);
    HQ = hqX();
    var kinds;
    if (low()) kinds = ['sentry', 'mg', 'mortar'];
    else if (med()) kinds = ['sentry', 'mg', 'mortar', 'sniper', 'aa'];
    else kinds = ['sentry', 'mg', 'mortar', 'rocket', 'sniper', 'aa'];

    // offsets around HQ compound (realistic perimeter spacing ~8–14 m)
    var offsets = [
      { dx: 11, dz: 9, kind: 0 }, { dx: -10, dz: 10, kind: 1 },
      { dx: 13, dz: -9, kind: 2 }, { dx: -12, dz: -8, kind: 3 },
      { dx: 7, dz: 14, kind: 4 }, { dx: -8, dz: -13, kind: 5 }
    ];

    [-1, 1].forEach(function (side) {
      var bx = side * HQ;
      kinds.forEach(function (kind, i) {
        var off = offsets[i] || offsets[i % offsets.length];
        var mesh = makeDefense(kind, side);
        var x = bx + off.dx * side, z = off.dz;
        mesh.position.set(x, H(x, z), z);
        mesh.lookAt(0, mesh.position.y, z * 0.2);
        mesh.userData.home = { x: x, y: mesh.position.y, z: z };
        root.add(mesh); defenses.push(mesh);
      });

      // perimeter walls (skip some on LOW)
      var wallPts = low()
        ? [{ dx: 16, dz: 0, rot: Math.PI / 2, len: 10 }, { dx: -16, dz: 0, rot: Math.PI / 2, len: 10 }]
        : [
          { dx: 18, dz: 0, rot: Math.PI / 2, len: 12 },
          { dx: -18, dz: 0, rot: Math.PI / 2, len: 12 },
          { dx: 0, dz: 16, rot: 0, len: 14 },
          { dx: 0, dz: -16, rot: 0, len: 14 },
          { dx: 12, dz: 12, rot: Math.PI / 4, len: 8 },
          { dx: -12, dz: -12, rot: Math.PI / 4, len: 8 }
        ];
      wallPts.forEach(function (w) {
        var wx = bx + w.dx * (w.rot === Math.PI / 2 ? side : 1);
        // keep front-facing wall on the inward side
        if (w.rot === Math.PI / 2) wx = bx + w.dx * side;
        else wx = bx + (w.dx || 0);
        var wz = w.dz;
        var seg = makeWallSegment(side, wx, wz, w.rot, w.len);
        root.add(seg); walls.push(seg); defenses.push(seg);
      });

      // main gate facing the front (inward)
      var gx = bx - side * 18, gz = 0;
      var gate = makeGate(side, gx, gz, side < 0 ? 0 : Math.PI);
      root.add(gate); gates.push(gate); defenses.push(gate);

      // barracks slightly behind HQ
      var brx = bx + side * 6, brz = low() ? 6 : 8;
      var br = makeBarracks(side, brx, brz);
      root.add(br); barracks.push(br);

      // night searchlights (MEDIUM+)
      if (!low()) {
        for (var li = 0; li < (med() ? 1 : 2); li++) {
          var light = new THREE.SpotLight(0xffe6b0, 0, 55, 0.35, 0.55, 1.2);
          var lx = bx + side * (4 + li * 3), lz = -4 + li * 8;
          light.position.set(lx, H(lx, lz) + 7.5, lz);
          light.target.position.set(lx - side * 18, H(lx, lz), lz + (li ? -6 : 6));
          root.add(light); root.add(light.target);
          lights.push({ light: light, side: side, phase: li * 1.7, baseX: lx, baseZ: lz });
        }
      }
    });

    wrapStrikes();
    buildUi();
    ready = true;
  }

  // ------------------------------------------------------------- strike damage
  function wrapStrikes() {
    var th = LB.theaters; if (!th || wrapDone || !th.onStrike) return;
    var orig = th.onStrike; wrapDone = true;
    th.onStrike = function (x, z, power) {
      try { onImpact(x, z, power || 1); } catch (_) {}
      return orig.apply(this, arguments);
    };
  }
  function onImpact(x, z, power) {
    var r = 7 * Math.max(1, Math.sqrt(power || 1));
    defenses.forEach(function (d) {
      if (d.userData.wreck) return;
      var dx = d.position.x - x, dz = d.position.z - z;
      if (dx * dx + dz * dz > r * r) return;
      d.userData.hp -= Math.max(12, Math.round(22 * (power || 1)));
      if (d.userData.hp <= 0) wreck(d);
    });
    // chip base hp if strike lands near HQ
    [-1, 1].forEach(function (side) {
      var bx = side * HQ;
      if (Math.hypot(bx - x, 0 - z) < 14) {
        var b = bases[String(side)];
        b.hp = Math.max(0, b.hp - Math.round(6 * (power || 1)));
      }
    });
  }

  function wreck(mesh) {
    if (mesh.userData.wreck) return;
    mesh.userData.wreck = true; mesh.userData.hp = 0; stats.wrecks++;
    mesh.rotation.z = 0.35 + Math.random() * 0.25;
    mesh.position.y -= 0.35;
    (mesh.userData.parts || []).forEach(function (p) {
      try {
        p.mesh.material = mat(0x2a2622, 0.95, 0.08);
        if (p.mesh.material.emissive) p.mesh.material.emissive.setHex(0x1a0a00);
      } catch (_) {}
    });
    try {
      if (LB.heavyFx && LB.heavyFx.puff) {
        LB.heavyFx.puff({ kind: 'smoke', x: mesh.position.x, y: mesh.position.y + 1.5, z: mesh.position.z, size: 2.2, grow: 3, life: 2.4, color: 0x2a2622, opacity: 0.65 });
      }
    } catch (_) {}
    stats.last = sideName(mesh.userData.side) + ' ' + (mesh.userData.kind || 'defense') + ' wrecked';
  }

  function rebuild(mesh, paid) {
    if (!mesh.userData.wreck) return false;
    mesh.userData.wreck = false;
    mesh.userData.hp = mesh.userData.maxHp;
    mesh.rotation.z = 0;
    mesh.position.y = (mesh.userData.home && mesh.userData.home.y != null) ? mesh.userData.home.y : H(mesh.position.x, mesh.position.z);
    (mesh.userData.parts || []).forEach(function (p) { try { p.mesh.material = p.mat; } catch (_) {} });
    stats.rebuilds++;
    stats.last = sideName(mesh.userData.side) + ' ' + (mesh.userData.kind || 'defense') + (paid ? ' rebuilt (' + REBUILD_FUEL + ' fuel)' : ' repaired');
    if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('arm'); } catch (_) {}
    renderUi();
    return true;
  }

  function rebuildNow() {
    var me = playerSide();
    var d = defenses.filter(function (x) { return x.userData.side === me && x.userData.wreck; })[0];
    if (!d) { stats.last = 'No wrecked defenses'; renderUi(); return false; }
    if (!LB.economy || !LB.economy.pay(me, { fuel: REBUILD_FUEL })) {
      if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('deny'); } catch (_) {}
      stats.last = 'Need ' + REBUILD_FUEL + ' fuel to rebuild'; renderUi(); return false;
    }
    return rebuild(d, true);
  }

  // ------------------------------------------------------------- assaults & raids
  function spawnAssault(attackerSide, isRaid) {
    var sq = makeAssaultSquad(attackerSide);
    var startX = -attackerSide * (HQ - 36);  // approach from just outside the enemy perimeter
    var targetX = -attackerSide * HQ;
    var z = (Math.random() - 0.5) * (low() ? 10 : 18);
    sq.position.set(startX, H(startX, z), z);
    sq.userData.targetX = targetX;
    sq.userData.targetZ = 0;
    sq.userData.isRaid = !!isRaid;
    root.add(sq); squads.push(sq);
    if (isRaid) stats.raids++; else stats.assaults++;
    return sq;
  }

  function startAssault(attackerSide, isRaid) {
    var now = Date.now();
    if (!isRaid && now - lastAssault < ASSAULT_CD * 1000) return null;
    if (isRaid && now - lastRaid < RAID_CD * 1000) return null;
    if (isRaid) lastRaid = now; else lastAssault = now;
    var target = -attackerSide;
    alertUntil = now + 14000;
    radioAttack(target);
    playSiren();
    var sq = spawnAssault(attackerSide, isRaid);
    stats.last = (isRaid ? 'RAID' : 'ASSAULT') + ' on ' + sideName(target) + ' base';
    renderUi();
    return sq;
  }

  function orderRaid() {
    var me = playerSide();
    // Prefer ordering a squad toward the enemy HQ if squads are available
    if (LB.squads && LB.squads.order) {
      try {
        var ok = LB.squads.order('move', -me * HQ, (Math.random() - 0.5) * 8, 0);
        if (ok) {
          lastRaid = Date.now();
          alertUntil = Date.now() + 12000;
          radioAttack(-me);
          playSiren();
          // Also send an assault group so the base-defense loop engages
          spawnAssault(me, true);
          stats.raids++;
          stats.last = 'Raid ordered on ' + sideName(-me) + ' base';
          if (LB.voice && LB.voice.event) try { LB.voice.event('squad_move', me); } catch (_) {}
          renderUi();
          return true;
        }
      } catch (_) {}
    }
    var sq = startAssault(me, true);
    return !!sq;
  }

  function breach(attackerSide, targetSide) {
    var b = bases[String(targetSide)];
    if (!b || b._breachLock) return;
    b._breachLock = true;
    setTimeout(function () { b._breachLock = false; }, 12000);   // one breach pulse per 12 s
    b.hp = Math.max(0, b.hp - 40);
    stats.breaches++;
    // game-layer reward only — mutate commander session score if present
    try {
      var st = LB.commander && LB.commander.getState && LB.commander.getState();
      if (st && st.session && attackerSide === playerSide()) {
        st.session.score = (st.session.score || 0) + BREACH_SCORE;
        if (LB.sfx && LB.sfx.success) LB.sfx.success();
      }
    } catch (_) {}
    if (LB.voice && LB.voice.say) {
      try {
        LB.voice.say({
          pri: 3, side: 0, callsign: 'Overlord',
          text: sideName(targetSide) + ' base breached. ' + sideName(attackerSide) + ' forces inside the wire, over.',
          tag: 'ALERT'
        });
      } catch (_) {}
    }
    stats.last = sideName(targetSide) + ' BASE BREACHED (+' + BREACH_SCORE + ' if you)';
    // soft reset base hp after a delay so the match continues
    setTimeout(function () { if (bases[String(targetSide)]) bases[String(targetSide)].hp = Math.max(bases[String(targetSide)].hp, bases[String(targetSide)].max * 0.55); renderUi(); }, 20000);
    try {
      if (LB.heavyFx && LB.heavyFx.puff) {
        var bx = targetSide * HQ;
        LB.heavyFx.puff({ kind: 'fire', x: bx, y: 2, z: 0, size: 4, grow: 4, life: 1.6, color: 0xff8a30, opacity: 0.9 });
      }
    } catch (_) {}
    renderUi();
  }

  // ------------------------------------------------------------- firing
  function fireTracer(from, to, side) {
    // 1-in-5 visible tracer (realism checklist)
    if (Math.random() > 0.22) {
      if (LB.sfx && LB.sfx.gunfire) try { LB.sfx.gunfire(Math.min(0.9, camDist(from.x, from.z) / 120)); } catch (_) {}
      stats.shots++;
      return;
    }
    try {
      if (LB.heavyFx && LB.heavyFx.tracers) {
        LB.heavyFx.tracers(from.x, from.z, to.x, to.z, 1, from.y || 1.2);
      } else if (E().effects && E().effects.fireWeapon) {
        E().effects.fireWeapon({ from: from, to: to, kind: 'tracer', side: side, power: 0.6 });
      }
    } catch (_) {}
    if (LB.sfx && LB.sfx.gunfire) try { LB.sfx.gunfire(Math.min(0.9, camDist(from.x, from.z) / 120)); } catch (_) {}
    stats.shots++;
  }

  function fireMortar(d, tx, tz) {
    var from = { x: d.position.x, y: d.position.y + 1.0, z: d.position.z };
    var to = { x: tx, y: H(tx, tz) + 0.3, z: tz };
    try {
      if (E().effects && E().effects.fireWeapon) {
        E().effects.fireWeapon({ from: from, to: to, kind: 'arty', side: d.userData.side, power: 1.1, onHit: function () {
          try { if (LB.heavyFx && LB.heavyFx.puff) LB.heavyFx.puff({ kind: 'fire', x: tx, y: 0.5, z: tz, size: 1.6, grow: 1.8, life: 0.6, color: 0xffa040, opacity: 0.85 }); } catch (_) {}
          // splash damage on nearby enemy assault squads
          squads.forEach(function (sq) {
            if (!sq.userData.alive || sq.userData.side === d.userData.side) return;
            if (Math.hypot(sq.position.x - tx, sq.position.z - tz) < 5) {
              sq.userData.hp -= 35;
              if (sq.userData.hp <= 0) { sq.userData.alive = false; sq.visible = false; }
            }
          });
        }});
      }
    } catch (_) {}
    stats.shots++;
  }

  function fireRocket(d, tx, tz) {
    for (var i = 0; i < (low() ? 1 : 3); i++) {
      (function (i) {
        setTimeout(function () {
          if (d.userData.wreck) return;
          var from = { x: d.position.x, y: d.position.y + 1.2, z: d.position.z };
          var to = { x: tx + (Math.random() - 0.5) * 4, y: H(tx, tz) + 0.4, z: tz + (Math.random() - 0.5) * 4 };
          try {
            if (E().effects && E().effects.fireWeapon) {
              E().effects.fireWeapon({ from: from, to: to, kind: 'rocket', side: d.userData.side, power: 1.4 });
            }
          } catch (_) {}
        }, i * 180);
      })(i);
    }
    stats.shots++;
  }

  function fireSniper(d, tx, tz) {
    var from = { x: d.position.x, y: d.position.y + 2.9, z: d.position.z };
    fireTracer(from, { x: tx, y: H(tx, tz) + 1.2, z: tz }, d.userData.side);
    squads.forEach(function (sq) {
      if (!sq.userData.alive || sq.userData.side === d.userData.side) return;
      if (Math.hypot(sq.position.x - tx, sq.position.z - tz) < 3) {
        sq.userData.hp -= 18;
        if (sq.userData.hp <= 0) { sq.userData.alive = false; sq.visible = false; }
      }
    });
  }

  function fireAA(d, jet) {
    if (!jet) return;
    var head = d.userData.head;
    if (head) {
      try { head.lookAt(jet.x, jet.y || 20, jet.z); } catch (_) {}
    }
    var from = { x: d.position.x, y: d.position.y + 1.8, z: d.position.z };
    var to = { x: jet.x, y: (jet.y || 20), z: jet.z };
    try {
      if (E().effects && E().effects.fireWeapon) {
        E().effects.fireWeapon({ from: from, to: to, kind: 'tracer', side: d.userData.side, power: 1.2, color: 0xffee88 });
      } else if (LB.heavyFx && LB.heavyFx.tracers) {
        LB.heavyFx.tracers(from.x, from.z, to.x, to.z, 2, from.y);
      }
    } catch (_) {}
    if (LB.sfx && LB.sfx.gunfire) try { LB.sfx.gunfire(0.4); } catch (_) {}
    stats.shots++;
  }

  function nearestEnemySquad(d) {
    var best = null, bd = 1e9;
    for (var i = 0; i < squads.length; i++) {
      var sq = squads[i];
      if (!sq.userData.alive || sq.userData.side === d.userData.side) continue;
      var dist = Math.hypot(sq.position.x - d.position.x, sq.position.z - d.position.z);
      if (dist < bd) { bd = dist; best = sq; }
    }
    return best ? { sq: best, dist: bd } : null;
  }

  function nearestEnemyJet(d) {
    try {
      var jets = LB.theaters && LB.theaters._jets ? LB.theaters._jets() : [];
      var best = null, bd = 1e9;
      for (var i = 0; i < jets.length; i++) {
        var J = jets[i];
        if (!J || J.side === d.userData.side) continue;
        var st = J.st;
        if (st !== 'cruise' && st !== 'fight' && st !== 'takeoff' && st !== 'rtb') continue;
        var dist = Math.hypot((J.x || 0) - d.position.x, (J.z || 0) - d.position.z);
        if (dist < bd && dist < 90) { bd = dist; best = J; }
      }
      return best;
    } catch (_) { return null; }
  }

  function tickDefenses(dt) {
    for (var i = 0; i < defenses.length; i++) {
      var d = defenses[i];
      if (d.userData.wreck || d.userData.kind === 'wall' || d.userData.kind === 'gate') continue;
      if (far(d.position.x, d.position.z) && low()) continue; // far = low detail on LOW
      d.userData.cd = Math.max(0, (d.userData.cd || 0) - dt);
      if (d.userData.cd > 0) continue;
      var kind = d.userData.kind;
      if (kind === 'aa') {
        var jet = nearestEnemyJet(d);
        if (jet) { fireAA(d, jet); d.userData.cd = low() ? 1.6 : 0.9; }
        continue;
      }
      var hit = nearestEnemySquad(d);
      if (!hit || hit.dist > (kind === 'sniper' ? 60 : kind === 'rocket' ? 52 : kind === 'mortar' ? 48 : 38)) continue;
      var tx = hit.sq.position.x, tz = hit.sq.position.z;
      if (d.userData.head) {
        try { d.userData.head.lookAt(tx, d.position.y + 0.5, tz); } catch (_) {}
      }
      if (kind === 'mortar') { fireMortar(d, tx, tz); d.userData.cd = low() ? 4.5 : 3.2; }
      else if (kind === 'rocket') { fireRocket(d, tx, tz); d.userData.cd = low() ? 6 : 4.5; }
      else if (kind === 'sniper') { fireSniper(d, tx, tz); d.userData.cd = 2.4; }
      else { // sentry / mg
        fireTracer({ x: d.position.x, y: d.position.y + 0.7, z: d.position.z }, { x: tx, y: hit.sq.position.y + 1, z: tz }, d.userData.side);
        hit.sq.userData.hp -= kind === 'mg' ? 8 : 5;
        if (hit.sq.userData.hp <= 0) { hit.sq.userData.alive = false; hit.sq.visible = false; }
        d.userData.cd = kind === 'mg' ? 0.35 : 0.55;
      }
    }
  }

  function tickGates(dt) {
    gates.forEach(function (g) {
      if (g.userData.wreck) return;
      // open for friendly assault/squad near the gate
      var open = false;
      for (var i = 0; i < squads.length; i++) {
        var sq = squads[i];
        if (!sq.userData.alive || sq.userData.side !== g.userData.side) continue;
        if (Math.hypot(sq.position.x - g.position.x, sq.position.z - g.position.z) < 10) { open = true; break; }
      }
      // also open when friendly barracks men sortie out
      barracks.forEach(function (br) {
        if (br.userData.side !== g.userData.side) return;
        br.userData.men.forEach(function (m) {
          if (m.userData.alive && Math.hypot(m.position.x - g.position.x, m.position.z - g.position.z) < 9) open = true;
        });
      });
      g.userData.targetOpen = open ? 1 : 0;
      g.userData.open += (g.userData.targetOpen - g.userData.open) * Math.min(1, dt * 2.5);
      if (g.userData.leaf) {
        g.userData.leaf.rotation.y = g.userData.open * (g.userData.side < 0 ? -1.2 : 1.2);
        g.userData.leaf.position.z = g.userData.open * 1.6 * g.userData.side;
      }
    });
  }

  function tickLights(dt) {
    var night = isNight();
    lights.forEach(function (L, i) {
      L.light.intensity = night ? (low() ? 0.35 : 0.7) : 0;
      if (!night) return;
      var t = performance.now() / 1000;
      L.light.target.position.x = L.baseX + Math.sin(t * 0.35 + L.phase) * 22;
      L.light.target.position.z = L.baseZ + Math.cos(t * 0.28 + L.phase) * 16;
    });
  }

  function tickBarracks(dt) {
    barracks.forEach(function (br) {
      // prune dead
      br.userData.men = br.userData.men.filter(function (m) { return m.userData.alive && m.parent; });
      br.userData.timer -= dt;
      if (br.userData.timer > 0) return;
      if (br.userData.men.length >= br.userData.maxMen) { br.userData.timer = 4; return; }
      br.userData.timer = BARRACKS_S * (low() ? 1.4 : 1);
      var m = makeMan(br.userData.side, factionColor(br.userData.side));
      var x = br.position.x - br.userData.side * 2, z = br.position.z + (Math.random() - 0.5) * 4;
      m.position.set(x, H(x, z), z);
      // patrol toward the gate / front a bit
      m.userData.tx = br.position.x - br.userData.side * (12 + Math.random() * 10);
      m.userData.tz = (Math.random() - 0.5) * 14;
      root.add(m); br.userData.men.push(m); stats.respawns++;
    });
    // move barracks men
    barracks.forEach(function (br) {
      br.userData.men.forEach(function (m) {
        if (!m.userData.alive) return;
        var dx = (m.userData.tx || m.position.x) - m.position.x;
        var dz = (m.userData.tz || m.position.z) - m.position.z;
        var dist = Math.hypot(dx, dz);
        if (dist > 0.4) {
          var sp = m.userData.speed * dt;
          m.position.x += (dx / dist) * sp;
          m.position.z += (dz / dist) * sp;
          m.position.y = H(m.position.x, m.position.z);
          m.lookAt(m.position.x + dx, m.position.y, m.position.z + dz);
        }
        // fight nearby enemy assaults
        m.userData.cd = Math.max(0, (m.userData.cd || 0) - dt);
        if (m.userData.cd > 0) return;
        for (var i = 0; i < squads.length; i++) {
          var sq = squads[i];
          if (!sq.userData.alive || sq.userData.side === m.userData.side) continue;
          if (Math.hypot(sq.position.x - m.position.x, sq.position.z - m.position.z) < 14) {
            fireTracer({ x: m.position.x, y: m.position.y + 1.2, z: m.position.z },
              { x: sq.position.x, y: sq.position.y + 1, z: sq.position.z }, m.userData.side);
            sq.userData.hp -= 4;
            if (sq.userData.hp <= 0) { sq.userData.alive = false; sq.visible = false; }
            m.userData.cd = 0.7;
            break;
          }
        }
      });
    });
  }

  function tickSquads(dt) {
    for (var i = squads.length - 1; i >= 0; i--) {
      var sq = squads[i];
      if (!sq.userData.alive) {
        if (sq.parent) sq.parent.remove(sq);
        squads.splice(i, 1);
        continue;
      }
      var tx = sq.userData.targetX, tz = sq.userData.targetZ || 0;
      var dx = tx - sq.position.x, dz = tz - sq.position.z;
      var dist = Math.hypot(dx, dz);
      if (dist > 1.2) {
        var sp = sq.userData.speed * dt;
        sq.position.x += (dx / dist) * sp;
        sq.position.z += (dz / dist) * sp;
        sq.position.y = H(sq.position.x, sq.position.z);
        sq.lookAt(tx, sq.position.y, tz);
      }
      // damage nearby enemy defenses
      sq.userData.dmgCd = Math.max(0, (sq.userData.dmgCd || 0) - dt);
      if (sq.userData.dmgCd <= 0) {
        defenses.forEach(function (d) {
          if (d.userData.wreck || d.userData.side === sq.userData.side) return;
          var dd = Math.hypot(d.position.x - sq.position.x, d.position.z - sq.position.z);
          if (dd < 7) {
            d.userData.hp -= 14;
            sq.userData.dmgCd = 0.8;
            if (d.userData.hp <= 0) wreck(d);
          }
        });
      }
      // breach check near HQ
      var enemyHq = -sq.userData.side * HQ;
      if (!sq.userData.breached && Math.hypot(sq.position.x - enemyHq, sq.position.z) < 9) {
        sq.userData.breached = true;
        breach(sq.userData.side, -sq.userData.side);
        sq.userData.alive = false;
        sq.visible = false;
      }
    }
  }

  // ------------------------------------------------------------- UI
  function buildUi() {
    var p = doc.createElement('div'); p.id = 'invasionPanel'; p.className = 'supply-panel invasion-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · BASE INVASIONS <span class="qual sim">SIMULATED</span></div>' +
      '<div class="inv-status" id="invStatus"></div>' +
      '<div class="econ-actions">' +
      '<button type="button" id="invRaid">Raid enemy base<small>assault + siren</small></button>' +
      '<button type="button" id="invRebuild">Rebuild defense<small>' + REBUILD_FUEL + ' fuel</small></button>' +
      '</div>' +
      '<div class="sup-row"><span id="invNote" class="sup-status"></span></div>' +
      '<div class="th-note">AI assaults the enemy HQ. Defenses fire, wreck, and rebuild with fuel. A breach awards Commander score (game layer only — never moves the front). ?invasion=0 turns it off.</div>';
    el.p = p; el.status = p.querySelector('#invStatus'); el.note = p.querySelector('#invNote');
    p.querySelector('#invRaid').addEventListener('click', function () { orderRaid(); });
    p.querySelector('#invRebuild').addEventListener('click', function () { rebuildNow(); });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('squadsPanel') || doc.getElementById('linesPanel') || doc.getElementById('fortsPanel') || doc.getElementById('supplyPanel');
    var p = el.p; if (!p) return;
    if (anchor && anchor.parentNode) {
      if (p.parentNode !== anchor.parentNode || p.previousSibling !== anchor) anchor.parentNode.insertBefore(p, anchor.nextSibling);
      p.classList.toggle('floating', anchor.classList.contains('floating'));
      p.hidden = anchor.hidden;
    } else if (!p.parentNode) {
      var host = doc.querySelector('#sheet-map .sheet-body');
      (host || doc.body).appendChild(p);
    }
  }
  function renderUi() {
    if (!el.p) return;
    placeUi();
    var me = playerSide();
    var lines = [-1, 1].map(function (s) {
      var b = bases[String(s)];
      var defs = defenses.filter(function (d) { return d.userData.side === s && d.userData.kind !== 'wall'; });
      var up = defs.filter(function (d) { return !d.userData.wreck; }).length;
      var wrecked = defs.length - up;
      var men = 0;
      barracks.forEach(function (br) { if (br.userData.side === s) men += br.userData.men.length; });
      var tag = s === me ? ' (you)' : '';
      return '<div class="inv-row ' + (s < 0 ? 'b' : 'r') + '"><b>' + sideName(s) + tag + '</b> HP ' + Math.round(b.hp) + '/' + b.max +
        ' · defs ' + up + ' up / ' + wrecked + ' wrecked · barracks ' + men + '</div>';
    });
    var eta = Math.max(0, ASSAULT_CD - (Date.now() - lastAssault) / 1000);
    var raidEta = Math.max(0, RAID_CD - (Date.now() - lastRaid) / 1000);
    lines.push('<div class="inv-row">Next AI assault ~' + eta.toFixed(0) + 's · Raid CD ' + raidEta.toFixed(0) + 's</div>');
    el.status.innerHTML = lines.join('');
    el.note.textContent = stats.last || 'Standing by';
    var raidBtn = el.p.querySelector('#invRaid');
    var rebBtn = el.p.querySelector('#invRebuild');
    if (raidBtn) raidBtn.disabled = raidEta > 0;
    if (rebBtn) {
      var hasWreck = defenses.some(function (d) { return d.userData.side === me && d.userData.wreck; });
      rebBtn.disabled = !hasWreck;
    }
  }

  // ------------------------------------------------------------- main loop
  function step(dt) {
    tickDefenses(dt);
    tickGates(dt);
    tickLights(dt);
    tickBarracks(dt);
    tickSquads(dt);

    assaultT -= dt;
    if (assaultT <= 0) {
      assaultT = ASSAULT_CD + Math.random() * 12;
      var attacker = (Math.random() < 0.5 ? -1 : 1);
      // prefer the AI (not the player) attacking
      if (Math.random() < 0.65) attacker = -playerSide();
      startAssault(attacker, false);
    }

    if (alertUntil && Date.now() > alertUntil) {
      alertUntil = 0;
      try {
        var badge = doc.getElementById('battleBadge');
        if (badge && badge.textContent === 'BASE UNDER ATTACK') badge.textContent = 'Contested Market Front';
      } catch (_) {}
    }

    uiT -= dt;
    if (uiT <= 0) { uiT = 0.5; renderUi(); }
  }

  function update() {
    if (!enabled) return;
    var th = LB.theaters;
    if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE || !e.scene) return;
    if (!ready) {
      try { placeAll(); } catch (err) { enabled = false; console.warn('[invasion] disabled', err); return; }
    }
    // late wrap if theaters.onStrike appeared after us
    if (!wrapDone) wrapStrikes();
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused && e.isPaused()) return;
    if (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive()) return;
    step(dt);
  }

  LB.baseInvasion = {
    isEnabled: function () { return enabled && ready; },
    update: update,
    orderRaid: orderRaid,
    rebuildNow: rebuildNow,
    startAssault: startAssault,
    getState: function () {
      return {
        ready: ready, enabled: enabled,
        bases: JSON.parse(JSON.stringify(bases)),
        defenses: defenses.map(function (d) {
          return { kind: d.userData.kind, side: d.userData.side, hp: d.userData.hp, wreck: !!d.userData.wreck,
            x: +d.position.x.toFixed(1), z: +d.position.z.toFixed(1) };
        }),
        squads: squads.length, barracks: barracks.map(function (b) { return { side: b.userData.side, men: b.userData.men.length }; }),
        stats: Object.assign({}, stats),
        nextAssault: Math.max(0, ASSAULT_CD - (Date.now() - lastAssault) / 1000),
        alert: Date.now() < alertUntil
      };
    },
    getStats: function () { return Object.assign({}, stats); },
    // test hooks
    _forceBreach: function (attacker, target) { breach(attacker == null ? playerSide() : attacker, target == null ? -playerSide() : target); return stats.breaches; },
    _forceAssault: function (side) { return startAssault(side == null ? -playerSide() : side, false); },
    _forceDamage: function (side, amount) {
      var list = defenses.filter(function (d) { return d.userData.side === (side == null ? playerSide() : side) && !d.userData.wreck && d.userData.kind !== 'wall'; });
      if (!list.length) return false;
      var d = list[0]; d.userData.hp -= (amount || 999); if (d.userData.hp <= 0) wreck(d); return true;
    },
    _wreckCount: function (side) { return defenses.filter(function (d) { return d.userData.side === side && d.userData.wreck; }).length; },
    _forEachDefense: function (fn) { defenses.forEach(fn); },
    _forEachBarracks: function (fn) { barracks.forEach(fn); },
    _forEachWall: function (fn) { walls.forEach(fn); gates.forEach(fn); },
    _step: function (sec) { if (!ready) return; for (var t = 0; t < sec; t += 0.05) step(0.05); }
  };
})(window);
