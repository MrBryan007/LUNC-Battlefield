/* LUNC Battlefield v12.0.4 — v12.1 "War Systems" part 4: defensive structures. Game/sim layer.
 * v12.0.26 realism pass (?fortfx=0 → off): weathered concrete, faction camo, Jersey barriers, sandbag courses, turret
 * slew 75°/s and fire only on target, bunker slit arc, muzzle flash, recoil, distance-attenuated delayed sound.
 * v12.0.27 forts under fire (?fortdmg=0 → off): blast damage through theaters.onStrike, scorch / wreck, squad suppression,
 * AI mortar missions and repairs, Commander Repair and Mortars-on-fort.
 * v12.0.29 fort crews and combat engineers (?fortcrew=0 → off): a gunner behind each turret shield and a sentry behind
 * each bunker (they duck when suppressed and are gone when the fort is wrecked); Repair sends a two-man engineer team on
 * foot from 35 m behind the fort, they work 6 s and can be killed by mortars / strikes on the way.
 * Bunkers, turrets and walls, paid from the war economy and unlocked by the Fortifications tech. Pick a type in
 * Map → WAR SYSTEMS · DEFENSES and tap the field (your side of the front only). Turrets swivel to the nearest enemy unit
 * in range and fire tracers; bunkers flash from the slit. Cosmetic game FX: never removes units, never moves the front,
 * never alters price. The enemy AI builds too. ?forts=0 turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('forts') !== '0' && qs.get('economy') !== '0' && qs.get('theaters') !== '0';
  var REAL = qs.get('fortfx') !== '0';   // v12.0.26 defenses realism pass; ?fortfx=0 → v12.0.25 look and behaviour
  var SLEW = 75 * Math.PI / 180, ON_TGT = 6 * Math.PI / 180, SOUND = 343;
  var DMG = qs.get('fortdmg') !== '0';   // v12.0.27 forts under fire; ?fortdmg=0 → v12.0.26 invulnerable forts
  var HP = { bunker: 8, turret: 5, wall: 6 }, BLAST_R = 6, WRECK_S = 40, REPAIR_COST = { fuel: 3 }, REPAIR_CD = 20, SHELL_CD = 40, SHELL_COST = { ammo: 3 };
  var CREW = REAL && qs.get('fortcrew') !== '0';   // v12.0.29 crews + engineers; ?fortcrew=0 → v12.0.28 (no crew, instant repair)
  var ENG_SPEED = 3.5, ENG_WORK = 6, ENG_FROM = 35, ENG_KILL_R = 4, engs = [];
  var nextId = 1, shells = [], artT = 70, repT = 0, shellT = 0, wrappedStrike = false, scorchCache = {};
  var TYPES = {
    bunker: { label: 'Bunker', cost: { fuel: 8, ammo: 4 }, tip: 'Sandbagged bunker, MG slit', range: 22 },
    turret: { label: 'Turret', cost: { fuel: 6, ammo: 8 }, tip: 'Swivel gun, auto-tracks enemies', range: 28 },
    wall: { label: 'Wall', cost: { fuel: 6 }, tip: 'Concrete barrier line', range: 0 }
  };
  var TLIST = ['bunker', 'turret', 'wall'];
  var THREE, root, ready = false, last = 0, uiT = 0, aiT = 30, armed = null, el = {}, geo = {}, mat = {};
  var list = [], stats = { built: 0, aiBuilt: 0, shots: 0, last: '' };
  function E() { return LB.engine; }
  function ECO() { return LB.economy; }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function sideName(s) { return s < 0 ? 'BULL' : 'BEAR'; }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function cap() { return low() ? 5 : 8; }
  function count(side) { return list.filter(function (f) { return f.side === side && !f.dead; }).length; }
  function unlocked(side) { return !LB.tech || !LB.tech.has ? true : LB.tech.has(side, 'forts'); }
  function afford(side, t) { var st = ECO().getStock(side), c = TYPES[t].cost; for (var r in c) if ((st[r] || 0) < c[r]) return false; return true; }
  function frontX() { try { return E().getFrontlineX() || 0; } catch (_) { return 0; } }
  function radio(side, text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: side, type: 'forts', text: text }); } catch (_) {} }
  function H(x, z) { try { return E().terrainHeight(x, z) || 0; } catch (_) { return 0; } }

  function build() {
    THREE = E().THREE; root = new THREE.Group(); root.name = 'v12-forts'; E().scene.add(root);
    geo.bunker = new THREE.CylinderGeometry(2.6, 3.1, 1.6, 10, 1);
    geo.roof = new THREE.CylinderGeometry(2.7, 2.7, 0.35, 10);
    geo.slit = new THREE.BoxGeometry(2.2, 0.3, 0.4);
    geo.sand = new THREE.SphereGeometry(0.55, 6, 4);
    geo.tBase = new THREE.CylinderGeometry(1.2, 1.5, 1.2, 8);
    geo.tHead = new THREE.BoxGeometry(1.4, 0.8, 1.4);
    geo.tGun = new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6);
    geo.wall = new THREE.BoxGeometry(1.9, 1.5, 0.6);
    mat.concrete = new THREE.MeshStandardMaterial({ color: 0x55534d, roughness: 0.95 });
    mat.sand = new THREE.MeshStandardMaterial({ color: 0x7a6744, roughness: 1 });
    mat.dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 });
    mat.metal = new THREE.MeshStandardMaterial({ color: 0x4d5550, roughness: 0.5, metalness: 0.6 });
    mat.side = { '-1': new THREE.MeshStandardMaterial({ color: 0x3fbf7f, roughness: 0.7 }), '1': new THREE.MeshStandardMaterial({ color: 0xd9564c, roughness: 0.7 }) };
    if (REAL) buildReal();
    buildUi();
    global.addEventListener('pointerdown', function (e) {
      if (!armed || !e.target || e.target.tagName !== 'CANVAS' || e.target.id === 'worldInset') return;
      e.stopPropagation(); e.preventDefault();
      var p = E().pickGround(e.clientX, e.clientY); if (p) place(armed, p.x, p.z);
    }, true);
    global.addEventListener('keydown', function (e) { if (armed && e.code === 'Escape') { armed = null; renderUi(); } });
  }
  function mesh(type, side) {
    var g = new THREE.Group(), m;
    if (type === 'bunker') {
      m = new THREE.Mesh(geo.bunker, mat.concrete); m.position.y = 0.8; g.add(m);
      m = new THREE.Mesh(geo.roof, mat.concrete); m.position.y = 1.75; g.add(m);
      m = new THREE.Mesh(geo.slit, mat.dark); m.position.set(0, 1.25, -side * 2.75); g.add(m);
      for (var i = 0; i < 9; i++) { var a = i / 9 * Math.PI * 2; m = new THREE.Mesh(geo.sand, mat.sand); m.position.set(Math.cos(a) * 3.6, 0.35, Math.sin(a) * 3.6); m.scale.set(1.3, 0.7, 1); m.rotation.y = -a; g.add(m); }
      var flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.05), mat.side[String(side)]); flag.position.set(1.4, 2.6, 0); g.add(flag);
      g.userData.muzzle = new THREE.Vector3(0, 1.25, -side * 3);
    } else if (type === 'turret') {
      m = new THREE.Mesh(geo.tBase, mat.concrete); m.position.y = 0.6; g.add(m);
      var head = new THREE.Group(); head.position.y = 1.55; g.add(head);
      head.add(new THREE.Mesh(geo.tHead, mat.side[String(side)]));
      var gun = new THREE.Mesh(geo.tGun, mat.metal); gun.rotation.x = Math.PI / 2; gun.position.set(0, 0.1, -1.5); head.add(gun);
      g.userData.head = head;
    } else {
      for (var j = -2; j <= 2; j++) { m = new THREE.Mesh(geo.wall, mat.concrete); m.position.set(0, 0.75, j * 2); m.rotation.y = Math.PI / 2; g.add(m); }
    }
    return g;
  }

  // ---- v12.0.26 realism pass: sRGB-correct materials, weathered concrete, faction camo, real shapes, flashes ----
  function col(hex) { var c = new THREE.Color(hex); if (c.convertSRGBToLinear) c.convertSRGBToLinear(); return c; }
  function concreteTex() {
    var s = 128, c = doc.createElement('canvas'); c.width = c.height = s; var g = c.getContext('2d'), i, x, y, r;
    g.fillStyle = '#9a978f'; g.fillRect(0, 0, s, s);
    for (i = 0; i < 260; i++) { x = Math.random() * s; y = Math.random() * s; r = 1 + Math.random() * 7; g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '60,58,52' : '170,166,156') + ',' + (0.05 + Math.random() * 0.12).toFixed(2) + ')'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
    for (i = 0; i < 18; i++) { x = Math.random() * s; var w = 1 + Math.random() * 3, h = 20 + Math.random() * 70; var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(45,42,36,0.28)'); gr.addColorStop(1, 'rgba(45,42,36,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, h); }   // rain streaks from the top
    var gb = g.createLinearGradient(0, s * 0.72, 0, s); gb.addColorStop(0, 'rgba(70,58,40,0)'); gb.addColorStop(1, 'rgba(70,58,40,0.45)'); g.fillStyle = gb; g.fillRect(0, s * 0.72, s, s * 0.28);   // mud splash at the foot
    for (i = 0; i < 14; i++) { g.fillStyle = 'rgba(40,40,38,0.35)'; g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2); }   // chips
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (THREE.sRGBEncoding != null) t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }
  function jersey() {   // Jersey-barrier profile, 0.8 m foot, 0.26 m top, 1.5 m tall (the LOS wall height), 1.9 m long
    var sh = new THREE.Shape(); sh.moveTo(-0.4, 0); sh.lineTo(0.4, 0); sh.lineTo(0.4, 0.08); sh.lineTo(0.19, 0.33); sh.lineTo(0.13, 1.5); sh.lineTo(-0.13, 1.5); sh.lineTo(-0.19, 0.33); sh.lineTo(-0.4, 0.08); sh.lineTo(-0.4, 0);
    var g = new THREE.ExtrudeGeometry(sh, { depth: 1.9, bevelEnabled: false }); g.translate(0, 0, -0.95); g.computeVertexNormals(); return g;
  }
  function buildReal() {
    var lowQ = low(), tex = lowQ ? null : concreteTex();
    mat.rConcrete = new THREE.MeshStandardMaterial({ color: col(lowQ ? 0x6a6862 : 0xb5b2aa), roughness: 0.93, metalness: 0, map: tex });
    mat.rSand = new THREE.MeshStandardMaterial({ color: col(0x6b5c40), roughness: 1, metalness: 0 });   // burlap khaki, not peach
    mat.rDark = new THREE.MeshStandardMaterial({ color: col(0x0d0d0c), roughness: 0.9 });
    mat.rMetal = new THREE.MeshStandardMaterial({ color: col(0x2c2f2c), roughness: 0.42, metalness: 0.75 });
    mat.rCamo = { '-1': new THREE.MeshStandardMaterial({ color: col(0x4b5320), roughness: 0.78, metalness: 0.15 }), '1': new THREE.MeshStandardMaterial({ color: col(0x857a64), roughness: 0.78, metalness: 0.15 }) };
    mat.rStripe = { '-1': new THREE.MeshStandardMaterial({ color: col(0x2e8a5a), roughness: 0.7 }), '1': new THREE.MeshStandardMaterial({ color: col(0xa8453b), roughness: 0.7 }) };
    geo.rBag = new THREE.SphereGeometry(0.5, 7, 4); geo.rBag.scale(1.25, 0.5, 0.75);
    geo.rCore = new THREE.CylinderGeometry(2.55, 2.9, 1.6, 14, 1);
    geo.rRoof = new THREE.CylinderGeometry(2.95, 2.95, 0.32, 14);
    geo.rSlit = new THREE.BoxGeometry(2.0, 0.28, 0.5); geo.rLip = new THREE.BoxGeometry(2.6, 0.14, 0.7);
    geo.rPed = new THREE.CylinderGeometry(1.0, 1.35, 1.1, 12); geo.rRing = new THREE.CylinderGeometry(0.95, 0.95, 0.16, 16);
    geo.rBody = new THREE.BoxGeometry(1.0, 0.62, 1.2); geo.rShield = new THREE.BoxGeometry(1.5, 0.95, 0.08);
    geo.rBarrel = new THREE.CylinderGeometry(0.06, 0.07, 2.2, 8); geo.rBrake = new THREE.CylinderGeometry(0.11, 0.11, 0.26, 8);
    geo.rAmmo = new THREE.BoxGeometry(0.34, 0.3, 0.5); geo.rStripe = new THREE.BoxGeometry(1.03, 0.07, 1.23);
    geo.rWall = jersey();
    var dot = LB.proctex && LB.proctex.softDot ? LB.proctex.softDot(THREE) : null;
    mat.flash = new THREE.SpriteMaterial({ map: dot, color: 0xffc46a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 });
  }
  function bags(n, rings, r0, y0, dy) {   // one instanced mesh per fort: staggered sandbag courses
    var total = n * rings, im = new THREE.InstancedMesh(geo.rBag, mat.rSand, total), o = new THREE.Object3D(), k = 0;
    for (var ri = 0; ri < rings; ri++) for (var i = 0; i < n; i++) {
      var a = (i + (ri % 2) * 0.5) / n * Math.PI * 2; o.position.set(Math.cos(a) * r0, y0 + ri * dy, Math.sin(a) * r0); o.rotation.set(0, -a + Math.PI / 2, (Math.random() - 0.5) * 0.12);
      o.scale.setScalar(0.9 + Math.random() * 0.2); o.updateMatrix(); im.setMatrixAt(k++, o.matrix);
    }
    im.castShadow = im.receiveShadow = true; return im;
  }
  // ---- v12.0.29 crew figures: ~1.8 m procedural soldier in faction uniform with helmet, shared geometry/materials ----
  function soldier(side, eng) {
    var S = String(side), g = new THREE.Group(), sh = !low();
    if (!geo.cTorso) {
      geo.cTorso = new THREE.BoxGeometry(0.44, 0.6, 0.25); geo.cLeg = new THREE.BoxGeometry(0.16, 0.8, 0.19); geo.cArm = new THREE.BoxGeometry(0.12, 0.58, 0.14);
      geo.cHead = new THREE.SphereGeometry(0.115, 8, 6); geo.cHelm = new THREE.SphereGeometry(0.16, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2); geo.cPack = new THREE.BoxGeometry(0.32, 0.38, 0.16);
      geo.cKit = new THREE.BoxGeometry(0.34, 0.2, 0.16);
      geo.cLeg.translate(0, -0.4, 0); geo.cArm.translate(0, -0.27, 0);   // pivot at hip / shoulder
      mat.cUni = { '-1': new THREE.MeshStandardMaterial({ color: col(0x3d4526), roughness: 0.92 }), '1': new THREE.MeshStandardMaterial({ color: col(0x5c5747), roughness: 0.92 }) };
      mat.cHelm = { '-1': new THREE.MeshStandardMaterial({ color: col(0x2d331d), roughness: 0.8 }), '1': new THREE.MeshStandardMaterial({ color: col(0x4a463a), roughness: 0.8 }) };
      mat.cSkin = new THREE.MeshStandardMaterial({ color: col(0x8a6a55), roughness: 0.8 });
      mat.cBoot = new THREE.MeshStandardMaterial({ color: col(0x1e1c19), roughness: 0.9 });
      mat.cKit = new THREE.MeshStandardMaterial({ color: col(0x6e3a1e), roughness: 0.7, metalness: 0.2 });
    }
    function add(gm, mt, x, y, z) { var q = new THREE.Mesh(gm, mt); q.position.set(x, y, z); q.castShadow = sh; (q.userData || (q.userData = {})).crew = 1; g.add(q); return q; }
    var AR = LB.armyRealism && LB.armyRealism.isEnabled && LB.armyRealism.isEnabled() ? LB.armyRealism : null;   // same camo fatigues as the armies
    function am(kind, fb) { var m = null; if (AR) try { m = AR.material(side, kind); } catch (_) {} return m || fb; }
    var mu = am('uniform', mat.cUni[S]), mt = am('trousers', mat.cUni[S]), mg = am('gear', mat.cHelm[S]);
    var legs = [add(geo.cLeg, mt, -0.11, 0.82, 0), add(geo.cLeg, mt, 0.11, 0.82, 0)];
    add(geo.cTorso, mu, 0, 1.12, 0);
    var arms = [add(geo.cArm, mu, -0.29, 1.38, 0), add(geo.cArm, mu, 0.29, 1.38, 0)];
    add(geo.cHead, mat.cSkin, 0, 1.56, 0); add(geo.cHelm, mg, 0, 1.6, 0);
    add(geo.cPack, mg, 0, 1.14, 0.2);
    if (eng) { var kit = add(geo.cKit, mat.cKit, 0.38, 0.95, 0); g.userData.kit = kit; }
    g.userData.legs = legs; g.userData.arms = arms; g.userData.crouch = 0;
    return g;
  }
  function crewPose(m, crouch, t) {   // crouch 0..1: knees down, lean forward; small idle sway
    var u = m.userData; u.crouch += (crouch - u.crouch) * 0.15;
    m.scale.y = 1 - 0.32 * u.crouch; m.rotation.x = -0.25 * u.crouch + Math.sin(t * 0.7 + m.id) * 0.015;
  }

  function meshReal(type, side) {
    var g = new THREE.Group(), m, S = String(side);
    function add(geom, mt, x, y, z, par) { var q = new THREE.Mesh(geom, mt); q.position.set(x, y, z); q.castShadow = q.receiveShadow = true; (par || g).add(q); return q; }
    if (type === 'bunker') {
      add(geo.rCore, mat.rConcrete, 0, 0.8, 0); add(geo.rRoof, mat.rConcrete, 0, 1.76, 0);
      add(geo.rSlit, mat.rDark, -side * 2.62, 1.25, 0).rotation.y = Math.PI / 2; add(geo.rLip, mat.rConcrete, -side * 2.7, 1.45, 0).rotation.y = Math.PI / 2;   // slit faces the enemy (+x for Bulls)
      var ring = bags(13, 2, 3.55, 0.25, 0.42); g.add(ring);
      var top = bags(7, 1, 1.7, 2.05, 0); g.add(top);
      var flag = add(new THREE.BoxGeometry(0.03, 0.5, 0.9), mat.rStripe[S], side * 1.4, 2.75, 0.45); flag.castShadow = false;
      add(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), mat.rMetal, side * 1.4, 2.45, 0);
      g.userData.muzzle = new THREE.Vector3(-side * 2.95, 1.25, 0);
      if (CREW) { var sen = soldier(side); sen.position.set(side * 4.35, 0, 0.7); sen.rotation.y = side * Math.PI / 2; g.add(sen); g.userData.crew = [sen]; }   // v12.0.29 sentry behind the bunker, facing the enemy
    } else if (type === 'turret') {
      add(geo.rPed, mat.rConcrete, 0, 0.55, 0); add(geo.rRing, mat.rMetal, 0, 1.18, 0);
      var head = new THREE.Group(); head.position.y = 1.55; g.add(head);
      add(geo.rBody, mat.rCamo[S], 0, 0, 0, head); add(geo.rStripe, mat.rStripe[S], 0, 0.1, 0, head);   // thin faction band round the sides, camo on top
      add(geo.rShield, mat.rCamo[S], 0, 0.12, -0.72, head); add(geo.rAmmo, mat.rCamo[S], 0.62, -0.05, 0.05, head);
      var gun = new THREE.Group(); gun.position.set(0, 0.08, -0.6); head.add(gun);
      var b = add(geo.rBarrel, mat.rMetal, 0, 0, -1.1, gun); b.rotation.x = Math.PI / 2;
      var br = add(geo.rBrake, mat.rMetal, 0, 0, -2.2, gun); br.rotation.x = Math.PI / 2;
      g.userData.head = head; g.userData.gun = gun;
      if (CREW) { var gn = soldier(side); gn.position.set(0, -0.29, 0.62); gn.userData.arms.forEach(function (a) { a.rotation.x = 1.1; }); head.add(gn); g.userData.crew = [gn]; }   // v12.0.29 gunner on the pedestal behind the shield, turns with the head
      g.userData.muzzleLocal = new THREE.Vector3(0, 0.08, -2.95);
    } else {
      var w = new THREE.InstancedMesh(geo.rWall, mat.rConcrete, 5), o = new THREE.Object3D();
      for (var j = -2; j <= 2; j++) { o.position.set((Math.random() - 0.5) * 0.06, 0, j * 2); o.rotation.set(0, (Math.random() - 0.5) * 0.04, 0); o.updateMatrix(); w.setMatrixAt(j + 2, o.matrix); }
      w.castShadow = w.receiveShadow = true; g.add(w);
    }
    if (type !== 'wall') {
      var fl = new THREE.Sprite(mat.flash); fl.visible = false; fl.scale.set(1.1, 1.1, 1);
      if (type === 'turret') { fl.position.copy(g.userData.muzzleLocal); g.userData.head.add(fl); } else { fl.position.copy(g.userData.muzzle); g.add(fl); }
      g.userData.flash = fl;
    }
    return g;
  }
  function camDist(x, z) { try { var c = E().camera.position; return Math.hypot(c.x - x, c.y, c.z - z); } catch (_) { return 999; } }
  function shotFx(f, F) {   // flash, recoil, bunker dust, distance-attenuated sound with speed-of-sound delay
    var u = f.g.userData, seen = f.g.visible;
    if (u.flash && seen) { u.flash.visible = true; var k = 0.8 + Math.random() * 0.6; u.flash.scale.set(k, k, 1); u.flash.material.rotation = Math.random() * 6.28; f.flashT = 0.06; }
    if (u.gun) f.recoil = 1;
    if (f.type === 'bunker' && F && F.puff && seen && Math.random() < 0.35) try { F.puff({ kind: 'dust', x: f.x + (u.muzzle ? u.muzzle.x : 0), y: H(f.x, f.z) + 1.0, z: f.z + (u.muzzle ? u.muzzle.z : 0), size: 0.8, grow: 1.2, life: 0.7, color: 0xa89878, opacity: 0.35 }); } catch (_) {}
    var d = camDist(f.x, f.z);
    if (seen && d < 180 && LB.sfx && LB.sfx.gunfire) { var fire = function () { try { LB.sfx.gunfire(d / 180, { x: f.x, y: H(f.x, f.z) + 1.2, z: f.z, noDelay: true }); } catch (_) {} }; if (d > 120) setTimeout(fire, d / SOUND * 1000); else fire(); }
  }
  function animReal(f, dt) {   // per frame: slew the turret at a realistic rate, decay recoil and flash
    var u = f.g.userData;
    if (u.head && f.aimT != null) { var df = Math.atan2(Math.sin(f.aimT - f.aim), Math.cos(f.aimT - f.aim)), st = SLEW * dt; f.aim += Math.abs(df) <= st ? df : st * Math.sign(df); f.aim = Math.atan2(Math.sin(f.aim), Math.cos(f.aim)); u.head.rotation.y = f.aim; }
    if (u.gun && f.recoil) { f.recoil = Math.max(0, f.recoil - dt * 9); u.gun.position.z = -0.6 + f.recoil * 0.22; }
    if (u.flash && f.flashT > 0) { f.flashT -= dt; if (f.flashT <= 0) u.flash.visible = false; }
    if (u.crew) { var tt = performance.now() / 1000, c = (f.sup || 0) > 0.3 ? 1 : 0; for (var i = 0; i < u.crew.length; i++) crewPose(u.crew[i], c, tt); }   // v12.0.29 a suppressed crew ducks
  }
  function place(type, x, z, side) {
    side = side == null ? playerSide() : side; var me = side === playerSide();
    var fail = function (msg) { if (me) { stats.last = msg; if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('deny'); } catch (_) {} renderUi(); } return null; };
    if (!ready || !TYPES[type]) return null;
    if (!unlocked(side)) return fail('Research Fortifications first');
    if (count(side) >= cap()) return fail('Defense cap reached (' + cap() + ')');
    if (!afford(side, type)) return fail('Not enough fuel/ammo');
    var fx = frontX();
    if ((x - fx) * side < 6) x = fx + side * 6;   // your side of the front only (bull = west = -1)
    x = Math.max(-150, Math.min(150, x)); z = Math.max(-80, Math.min(55, z));
    ECO().pay(side, TYPES[type].cost);
    var g = REAL ? meshReal(type, side) : mesh(type, side); g.position.set(x, H(x, z), z); root.add(g);
    var f = { id: nextId++, type: type, side: side, x: x, z: z, g: g, cd: Math.random(), aim: 0, rise: 0, hp: HP[type], maxHp: HP[type], sup: 0 };
    g.scale.set(1, 0.05, 1); list.push(f);
    if (REAL && g.userData.head) { f.aim = side < 0 ? -Math.PI / 2 : Math.PI / 2; g.userData.head.rotation.y = f.aim; }   // v12.0.26: built facing the enemy
    if (me) { stats.built++; armed = null; if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui('arm'); } catch (_) {} } else stats.aiBuilt++;
    stats.last = sideName(side) + ' built a ' + TYPES[type].label.toLowerCase();
    var F = LB.heavyFx; if (F) try { F.puff({ kind: 'dust', x: x, y: 0.5, z: z, size: 3, grow: 2, life: 1.4, color: 0xb8a888, opacity: 0.6 }); } catch (_) {}
    radio(side, sideName(side) + ' ENGINEERS: "' + TYPES[type].label + ' up." (SIMULATED · game FX)');
    renderUi(); return { id: f.id, type: type, side: side, x: x, z: z };
  }
  function nearestEnemy(f, range) {
    var a; try { a = E().getArmies(); } catch (_) { return null; }
    var arr = f.side < 0 ? a.bears : a.bulls, best = null, bd = range * range;
    for (var i = 0; i < (arr || []).length; i += 2) { var u = arr[i]; if (!u || !u.position || u.visible === false) continue; var dx = u.position.x - f.x, dz = u.position.z - f.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = u; } }
    return best;
  }
  function onTarget(f, tx, tz) {   // v12.0.26: bunkers fire through a fixed slit arc; turrets must slew onto the target first
    var want = Math.atan2(-(tx - f.x), -(tz - f.z));
    if (!f.g.userData.head) { var face = f.side < 0 ? -Math.PI / 2 : Math.PI / 2, off = Math.abs(Math.atan2(Math.sin(want - face), Math.cos(want - face))); if (off > 1.2) { f.cd = 0.5; stats.arc = (stats.arc || 0) + 1; return false; } return true; }
    f.aimT = want; var df = Math.abs(Math.atan2(Math.sin(want - f.aim), Math.cos(want - f.aim)));
    if (df > ON_TGT) { f.cd = 0.08; stats.slewing = (stats.slewing || 0) + 1; return false; }
    return true;
  }

  // ---- v12.0.27 forts under fire: blast damage, scorch / wreck states, crew suppression, mortars, repair ----
  function scorchMat(m) {
    if (!m || !m.color || m.isSpriteMaterial) return m;
    var c = scorchCache[m.uuid]; if (c) return c;
    c = m.clone(); c.color = m.color.clone().multiplyScalar(0.42); c.roughness = 1; scorchCache[m.uuid] = c; return c;
  }
  function paint(f, mode) {   // 'ok' | 'scorch' | 'wreck'
    f.g.traverse(function (o) {
      if (!o.isMesh && !o.isInstancedMesh) return;
      if (!o.userData.mat0) o.userData.mat0 = o.material;
      o.material = mode === 'ok' ? o.userData.mat0 : mode === 'wreck' ? (mat.wreck || (mat.wreck = new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 1 }))) : scorchMat(o.userData.mat0);
    });
  }
  function hurt(f, dmg, why) {
    if (f.dead || !DMG) return;
    var was = f.hp; f.hp = Math.max(0, f.hp - dmg); stats.fortHits = (stats.fortHits || 0) + 1;
    if (f.hp <= 0) return wreck(f, why);
    if (was > f.maxHp / 2 && f.hp <= f.maxHp / 2) paint(f, 'scorch');
    f.sup = Math.min(1, (f.sup || 0) + 0.5);
    if (f.side === playerSide()) stats.last = TYPES[f.type].label + ' hit (' + f.hp + '/' + f.maxHp + ')';
  }
  function wreck(f, why) {
    f.dead = true; f.hp = 0; f.wreckT = WRECK_S; f.blind = false; paint(f, 'wreck');
    f.g.scale.y = 0.38; var u = f.g.userData; if (u.crew) u.crew.forEach(function (m) { m.visible = false; }); if (u.head) { u.head.rotation.x = 0.45; u.head.position.y = 1.1; } if (u.flash) u.flash.visible = false;
    var k = String(f.side); stats.lostBy = stats.lostBy || {}; stats.lostBy[k] = (stats.lostBy[k] || 0) + 1; stats.destroyed = (stats.destroyed || 0) + 1;
    var F = LB.heavyFx, y = H(f.x, f.z); if (F && F.puff) try { F.puff({ kind: 'fire', x: f.x, y: y + 1.5, z: f.z, size: 3.5, grow: 3, life: 1.2, color: 0xff8a30, opacity: 0.95 }); F.puff({ kind: 'smoke', x: f.x, y: y + 2.5, z: f.z, vy: 2, size: 4, grow: 6, life: 5, color: 0x26221f, opacity: 0.75 }); F.puff({ kind: 'dust', x: f.x, y: y + 0.6, z: f.z, size: 4, grow: 5, life: 2.4, color: 0x9a8b70, opacity: 0.6 }); } catch (_) {}
    if (LB.sfx && LB.sfx.explosion) try { LB.sfx.explosion(0.9, Math.min(1, camDist(f.x, f.z) / 220), { x: f.x, y: y + 1, z: f.z }); } catch (_) {}
    var me = playerSide(), lbl = TYPES[f.type].label.toLowerCase();
    stats.last = (f.side === me ? 'Our ' : 'Enemy ') + lbl + ' destroyed' + (why ? ' (' + why + ')' : '');
    radio(f.side, sideName(f.side) + ' ENGINEERS: "' + TYPES[f.type].label + ' destroyed' + (why ? ' by ' + why : '') + '. Crew pulling back." (SIMULATED · game FX)');
    if (f.side === me && LB.sfx && LB.sfx.ui) try { LB.sfx.ui('deny'); } catch (_) {}
    renderUi();
  }
  function damageAt(x, z, power, why) {   // a blast at (x, z): forts within 6 m × √power take 1–3+ hp, more near the centre
    if (!DMG || !ready) return 0;
    var pw = Math.max(0.3, power || 1), r = BLAST_R * Math.sqrt(pw), n = 0;
    if (engs.length) engHit(x, z, ENG_KILL_R * Math.sqrt(pw), why);
    for (var i = 0; i < list.length; i++) { var f = list[i]; if (f.dead) continue; var d = Math.hypot(f.x - x, f.z - z); if (d > r) continue; hurt(f, Math.max(1, Math.round(pw * 3 * (1 - d / r) + 0.4)), why); n++; }
    if (n) renderUi(); return n;
  }
  function wrapStrikes() {
    var th = LB.theaters; if (wrappedStrike || !th || !th.onStrike) return;
    var orig = th.onStrike; wrappedStrike = true;
    th.onStrike = function (x, z, power) { try { damageAt(x, z, power || 1, 'air/artillery strike'); } catch (_) {} return orig.apply(this, arguments); };
  }
  function mortars(side, f, who) {   // 3 rounds around a fort, 2–3.6 s time of flight
    for (var i = 0; i < 3; i++) shells.push({ side: side, x: f.x + (Math.random() - 0.5) * 6, z: f.z + (Math.random() - 0.5) * 6, t: -(2 + i * 0.8) });
    stats.missions = (stats.missions || 0) + 1;
    var me = playerSide(), lbl = TYPES[f.type].label.toLowerCase();
    if (f.side === me) { stats.last = 'INCOMING — enemy mortars on our ' + lbl; radio(me, sideName(me) + ' ENGINEERS: "INCOMING! Mortars on our ' + lbl + '!" (SIMULATED · game FX)'); }
    else radio(side, sideName(side) + ' MORTARS: "Fire mission, enemy ' + lbl + ', three rounds. Shot, over." (SIMULATED · game FX)');
  }
  function tickShells(dt) {
    var F = LB.heavyFx;
    for (var i = shells.length - 1; i >= 0; i--) {
      var S = shells[i]; S.t += dt; if (S.t < 0) continue;
      var y = H(S.x, S.z);
      if (F && F.puff) try { F.puff({ kind: 'fire', x: S.x, y: y + 0.6, z: S.z, size: 1.6, grow: 1.6, life: 0.5, color: 0xffa040, opacity: 0.9 }); F.puff({ kind: 'dust', x: S.x, y: y + 0.5, z: S.z, vy: 3, size: 2.2, grow: 2.2, life: 2.2, color: 0x8a7d66, opacity: 0.7 }); } catch (_) {}
      if (LB.sfx && LB.sfx.explosion) try { LB.sfx.explosion(0.45, Math.min(1, camDist(S.x, S.z) / 220), { x: S.x, y: y, z: S.z }); } catch (_) {}
      damageAt(S.x, S.z, 0.8, 'mortars'); shells.splice(i, 1);
    }
  }
  function visibleToAi(f) { return Math.abs(f.x - frontX()) < 60; }   // the AI side sees what's near the front
  function mostDamaged(side) { var b = null; list.forEach(function (f) { if (f.side === side && !f.dead && !f.engTeam && f.hp < f.maxHp && (!b || f.hp / f.maxHp < b.hp / b.maxHp)) b = f; }); return b; }
  function repairFort(f) { f.hp = f.maxHp; f.sup = 0; paint(f, 'ok'); stats.repairs = (stats.repairs || 0) + 1; }

  // ---- v12.0.29 combat engineers: Repair walks a two-man team out from 35 m behind the fort, 6 s of work, can be killed ----
  function engOn() { return CREW && DMG; }
  function sendEngineers(f, who) {
    var side = f.side, sx = f.x + side * ENG_FROM, team = { id: nextId++, side: side, fort: f, who: who, state: 'walk', t: 0, age: 0, men: [] };
    sx = Math.max(-170, Math.min(170, sx));
    for (var i = 0; i < 2; i++) {
      var z = f.z + (i ? 1.3 : -1.3), m = soldier(side, true); m.position.set(sx, H(sx, z), z); root.add(m);
      team.men.push({ g: m, x: sx, z: z, x0: sx, z0: z, ox: i ? 1.2 : -1.2, alive: true, ph: Math.random() * 6, deadT: 0 });
    }
    f.engTeam = team; engs.push(team); stats.engSent = (stats.engSent || 0) + 1;
    return team;
  }
  function engKia(team, m, why) {
    m.alive = false; m.deadT = 8; m.g.rotation.x = -Math.PI / 2 * 0.95; m.g.position.y = H(m.x, m.z) + 0.15;
    var k = String(team.side); stats.engKiaBy = stats.engKiaBy || {}; stats.engKiaBy[k] = (stats.engKiaBy[k] || 0) + 1; stats.engKia = (stats.engKia || 0) + 1;
    if (team.side === playerSide()) stats.last = 'Engineer hit' + (why ? ' (' + why + ')' : '');
  }
  function engHit(x, z, r, why) {
    for (var i = 0; i < engs.length; i++) { var T = engs[i]; for (var j = 0; j < T.men.length; j++) { var m = T.men[j]; if (m.alive && Math.hypot(m.x - x, m.z - z) <= r) engKia(T, m, why); } }
  }
  function endTeam(T, i) {
    T.men.forEach(function (m) { root.remove(m.g); }); engs.splice(i, 1); if (T.fort.engTeam === T) T.fort.engTeam = null;
  }
  function tickEng(dt) {
    var F = LB.heavyFx, me = playerSide(), fog = LB.fow && LB.fow.isActive && LB.fow.isActive();
    for (var i = engs.length - 1; i >= 0; i--) {
      var T = engs[i], f = T.fort, alive = T.men.filter(function (m) { return m.alive; }), lbl = TYPES[f.type].label;
      T.age += dt;
      T.men.forEach(function (m) { if (!m.alive && m.deadT > 0) { m.deadT -= dt; if (m.deadT <= 0) m.g.visible = false; } });
      if (!alive.length && T.state !== 'failed') {
        T.state = 'failed'; T.t = 6; stats.engFailed = (stats.engFailed || 0) + 1; if (f.engTeam === T) f.engTeam = null;
        if (T.side === me) stats.last = 'Engineer team down · ' + lbl + ' not repaired';
        radio(T.side, sideName(T.side) + ' ENGINEERS: "Repair team is down! ' + lbl + ' still damaged." (SIMULATED · game FX)'); renderUi();
      }
      if (T.state === 'failed') { T.t -= dt; if (T.t <= 0) endTeam(T, i); continue; }
      if (f.dead && T.state !== 'back') { T.state = 'back'; if (f.engTeam === T) f.engTeam = null; }
      var working = T.state === 'work', arrived = 0;
      for (var j = 0; j < alive.length; j++) {
        var m = alive[j], u = m.g.userData, tx, tz;
        if (T.state === 'back') { tx = m.x0; tz = m.z0; } else { tx = f.x + T.side * 3.9; tz = f.z + m.ox; }
        var dx = tx - m.x, dz = tz - m.z, d = Math.hypot(dx, dz), st = ENG_SPEED * dt;
        if (!working && d > 0.15) {
          var k = Math.min(1, st / d); m.x += dx * k; m.z += dz * k; m.ph += dt * 9;
          m.g.rotation.y = Math.atan2(-dx, -dz);
          u.legs[0].rotation.x = Math.sin(m.ph) * 0.55; u.legs[1].rotation.x = -Math.sin(m.ph) * 0.55;
          u.arms[0].rotation.x = -Math.sin(m.ph) * 0.4; u.arms[1].rotation.x = Math.sin(m.ph) * 0.4;
        } else {
          arrived++; u.legs[0].rotation.x = u.legs[1].rotation.x = 0;
          if (working) { m.g.rotation.y = Math.atan2(-(f.x - m.x), -(f.z - m.z)); m.ph += dt * 7; u.arms[1].rotation.x = 1.2 + Math.sin(m.ph) * 0.6; u.arms[0].rotation.x = 0.9; crewPose(m.g, 0.6, m.ph); }
        }
        m.g.position.set(m.x, H(m.x, m.z) + (working ? 0 : Math.abs(Math.sin(m.ph)) * 0.04), m.z);
        if (T.side !== me) m.g.visible = !fog || LB.fow.visible(m.x, m.z);
      }
      if (T.state === 'walk' && arrived === alive.length) { T.state = 'work'; T.t = ENG_WORK; if (T.side === me) stats.last = 'Engineers repairing the ' + lbl.toLowerCase(); }
      else if (T.state === 'work') {
        T.t -= dt; T.fxT = (T.fxT || 0) - dt;
        if (T.fxT <= 0 && F && F.puff && f.g.visible) { T.fxT = 0.45 + Math.random() * 0.3; var y = H(f.x, f.z); try { F.puff({ kind: 'fire', x: f.x + T.side * 3.0, y: y + 0.9 + Math.random() * 0.6, z: f.z + (Math.random() - 0.5) * 2, size: 0.35, grow: 0.4, life: 0.25, color: 0xffd27a, opacity: 0.95 }); F.puff({ kind: 'dust', x: f.x + T.side * 3.2, y: y + 0.4, z: f.z, size: 1, grow: 1.4, life: 1, color: 0xa89878, opacity: 0.35 }); } catch (_) {} }
        if (T.t <= 0) {
          repairFort(f); if (f.g.userData.crew) f.g.userData.crew.forEach(function (c) { c.visible = true; });
          stats.engRepairs = (stats.engRepairs || 0) + 1; if (T.who === 'me') stats.cmdRepairs = (stats.cmdRepairs || 0) + 1;
          if (T.side === me) stats.last = lbl + ' repaired by engineers';
          radio(T.side, sideName(T.side) + ' ENGINEERS: "' + lbl + ' repaired, back in the fight. Pulling back." (SIMULATED · game FX)');
          T.state = 'back'; if (f.engTeam === T) f.engTeam = null; renderUi();
        }
      } else if (T.state === 'back' && (arrived === alive.length || T.age > 90)) endTeam(T, i);
    }
  }
  function myTeam() { var me = playerSide(); for (var i = 0; i < engs.length; i++) if (engs[i].side === me && engs[i].who === 'me' && (engs[i].state === 'walk' || engs[i].state === 'work')) return engs[i]; return null; }
  function dmgTick(dt) {
    wrapStrikes(); tickShells(dt); if (engs.length) tickEng(dt);
    if (repT > 0) repT -= dt; if (shellT > 0) shellT -= dt;
    var me = playerSide(), en = -me;
    artT -= dt; if (artT <= 0) {
      artT = 60 + Math.random() * 30;
      var tg = list.filter(function (f) { return f.side === me && !f.dead && visibleToAi(f); });
      if (tg.length && (!ECO() || !ECO().isEnabled() || ECO().pay(en, SHELL_COST))) mortars(en, tg[(Math.random() * tg.length) | 0], 'ai');
      var d = mostDamaged(en); if (d && Math.random() < 0.6 && ECO().pay(en, REPAIR_COST)) { if (engOn()) { sendEngineers(d, 'ai'); radio(en, sideName(en) + ' ENGINEERS: "Moving up to fix the ' + TYPES[d.type].label.toLowerCase() + '." (SIMULATED · game FX)'); } else { repairFort(d); radio(en, sideName(en) + ' ENGINEERS: "' + TYPES[d.type].label + ' patched up." (SIMULATED · game FX)'); } }
    }
  }
  function cmdRepair() {
    if (!DMG) return false;
    var me = playerSide(), f = mostDamaged(me);
    if (repT > 0) { stats.last = 'Engineers busy · ' + Math.ceil(repT) + ' s'; return renderUi(), false; }
    if (!f) { stats.last = 'Nothing to repair'; return renderUi(), false; }
    if (!ECO().pay(me, REPAIR_COST)) { stats.last = 'Repair needs 3 fuel'; return renderUi(), false; }
    if (engOn()) {   // v12.0.29: the repair happens when the engineer team gets there and finishes the job
      sendEngineers(f, 'me'); repT = REPAIR_CD; stats.cmdDispatch = (stats.cmdDispatch || 0) + 1; stats.last = 'Engineers moving to the ' + TYPES[f.type].label.toLowerCase();
      radio(me, sideName(me) + ' ENGINEERS: "Copy, moving up to the ' + TYPES[f.type].label.toLowerCase() + '. ETA ' + Math.round(ENG_FROM / ENG_SPEED) + ' seconds." (SIMULATED · game FX)'); renderUi(); return true;
    }
    repairFort(f); repT = REPAIR_CD; stats.cmdRepairs = (stats.cmdRepairs || 0) + 1; stats.last = TYPES[f.type].label + ' repaired';
    radio(me, sideName(me) + ' ENGINEERS: "' + TYPES[f.type].label + ' repaired, back in the fight." (SIMULATED · game FX)'); renderUi(); return true;
  }
  function cmdShell() {   // your mortars on the nearest enemy fort you can see (fog of war)
    if (!DMG) return false;
    var me = playerSide(), fogOn = LB.fow && LB.fow.isActive && LB.fow.isActive(), b = null, bd = 1e9, fx = frontX();
    if (shellT > 0) { stats.last = 'Mortars reloading · ' + Math.ceil(shellT) + ' s'; return renderUi(), false; }
    list.forEach(function (f) { if (f.side === me || f.dead) return; if (fogOn && !LB.fow.visible(f.x, f.z)) return; var d = Math.abs(f.x - fx) + Math.abs(f.z) * 0.2; if (d < bd) { bd = d; b = f; } });
    if (!b) { stats.last = 'No enemy fort in sight'; return renderUi(), false; }
    if (!ECO().pay(me, SHELL_COST)) { stats.last = 'Mortars need 3 ammo'; return renderUi(), false; }
    mortars(me, b, 'cmd'); shellT = SHELL_CD; stats.cmdMissions = (stats.cmdMissions || 0) + 1; stats.last = 'Mortars on the enemy ' + TYPES[b.type].label.toLowerCase(); renderUi(); return true;
  }
  function targetsFor(side) { var o = []; list.forEach(function (f) { if (f.side !== side && !f.dead && f.rise >= 1) o.push({ id: f.id, type: f.type, x: f.x, z: f.z }); }); return o; }
  function suppress(id, amt) { if (!DMG) return false; for (var i = 0; i < list.length; i++) if (list[i].id === id && !list[i].dead) { list[i].sup = Math.min(1, (list[i].sup || 0) + (amt || 0.15)); stats.suppressed = (stats.suppressed || 0) + 1; return true; } return false; }

  // ---- v12.0.28 rank-unlocked camo (js/ui/achievements.js picks it; drawn here on your side's camo material) ----
  var CAMO_DEF = { '-1': 0x4b5320, '1': 0x857a64 }, camoKey = 'std', camoTex = {};
  function camoTexture(c) {
    if (camoTex[c.id]) return camoTex[c.id];
    var s = 128, cv = doc.createElement('canvas'); cv.width = cv.height = s; var g = cv.getContext('2d'), i, k;
    var hex = function (n) { return '#' + ('000000' + n.toString(16)).slice(-6); };
    g.fillStyle = hex(c.base); g.fillRect(0, 0, s, s);
    var seed = 7; var R = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (k = 0; k < c.spots.length; k++) {
      g.fillStyle = hex(c.spots[k]);
      for (i = 0; i < (c.tiger ? 9 : 11); i++) {
        var x = R() * s, y = R() * s, pts = [], ex = [26 + R() * 30, 3 + R() * 4, (R() - 0.5) * 0.35];
        if (!c.tiger) { var r = 7 + R() * 14; for (var j = 0; j <= 7; j++) { var a = j / 7 * 6.283, rr = r * (0.6 + R() * 0.6); pts.push([Math.cos(a) * rr * 1.3, Math.sin(a) * rr]); } }
        [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s], [s, s], [-s, -s], [s, -s], [-s, s]].forEach(function (o) {   // draw wrapped copies so the texture tiles
          var cx = x + o[0], cy = y + o[1]; if (cx < -60 || cx > s + 60 || cy < -40 || cy > s + 40) return;
          g.beginPath();
          if (c.tiger) g.ellipse(cx, cy, ex[0], ex[1], ex[2], 0, 6.283);   // horizontal brush strokes
          else pts.forEach(function (q, j) { g[j ? 'lineTo' : 'moveTo'](cx + q[0], cy + q[1]); });
          g.fill();
        });
      }
    }
    var t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1.5, 1.5); if (THREE.sRGBEncoding != null) t.encoding = THREE.sRGBEncoding;
    camoTex[c.id] = t; return t;
  }
  function applyCamo() {
    if (!REAL || !mat.rCamo) return;
    var A = LB.achievements, c = A && A.camo ? A.camo() : null, me = playerSide(), key = c ? me + ':' + c.id : 'std';
    if (key === camoKey) return; camoKey = key;
    ['-1', '1'].forEach(function (k) { var m = mat.rCamo[k], had = !!m.map; m.map = null; m.color.copy(col(CAMO_DEF[k])); if (had) m.needsUpdate = true; });
    if (!c) return;
    var m = mat.rCamo[String(me)];
    if (low()) { m.color.copy(col(c.base)); return; }   // LOW / phones: the pattern's base colour, no texture
    m.map = camoTexture(c); m.color.setRGB(1, 1, 1); m.needsUpdate = true;
    Object.keys(scorchCache).forEach(function (k) { delete scorchCache[k]; });
  }
  function step(dt) {
    var F = LB.heavyFx;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.dead) { f.wreckT -= dt; if (f.wreckT <= 0) { root.remove(f.g); list.splice(i, 1); i--; } continue; }   // v12.0.27 wreck, cleared after 40 s
      if (DMG) { if (f.sup > 0) f.sup = Math.max(0, f.sup - dt * 0.25); if (f.hp <= f.maxHp / 2 && f.g.visible) { f.smokeT = (f.smokeT || 0) - dt; if (f.smokeT <= 0 && F && F.puff) { f.smokeT = 0.8 + Math.random() * 0.6; try { F.puff({ kind: 'smoke', x: f.x + (Math.random() - 0.5), y: H(f.x, f.z) + 2, z: f.z + (Math.random() - 0.5), vy: 1.2, size: 1.4, grow: 3, life: 3, color: 0x2e2a26, opacity: 0.55 }); } catch (_) {} } } }
      if (f.side !== playerSide()) f.g.visible = !(LB.fow && LB.fow.isActive && LB.fow.isActive()) || LB.fow.visible(f.x, f.z);   // v12.0.8 fog of war
      if (f.rise < 1) { f.rise = Math.min(1, f.rise + dt * 1.5); f.g.scale.y = 0.05 + 0.95 * f.rise; }
      var R = TYPES[f.type].range; if (!R) continue;
      if (REAL) animReal(f, dt);
      f.cd -= dt; if (f.cd > 0) continue; f.cd = (f.type === 'turret' ? 1.1 : 1.8) * (1 + (f.sup || 0));   // v12.0.27: a suppressed crew fires slower
      // v12.0.25: line of sight; enemy squads first (they can be hurt), then the market armies (cosmetic as before)
      var L = LB.los && LB.los.isEnabled && LB.los.isEnabled() ? LB.los : null, eye = f.type === 'turret' ? 1.9 : 1.25, tx, tz, sq = null, hidden = 0;
      if (L && LB.squads && LB.squads.targetsFor) {
        var bd = R * R; LB.squads.targetsFor(f.side).forEach(function (q) { var d = (q.x - f.x) * (q.x - f.x) + (q.z - f.z) * (q.z - f.z); if (d >= bd) return; if (!L.clear(f.x, f.z, q.x, q.z, eye, q.cover ? 0.7 : 1.1)) { stats.noLos = (stats.noLos || 0) + 1; hidden++; return; } bd = d; sq = q; sq.d = Math.sqrt(d); });
      }
      f.blind = false;
      if (sq) {
        tx = sq.x; tz = sq.z;
        if (REAL && !onTarget(f, tx, tz)) continue;
        var pc = (f.type === 'turret' ? 0.22 : 0.18) * (1 - sq.d / R * 0.5) * (sq.cover ? 0.5 : 1) * (1 - (f.sup || 0) * 0.5);
        if (LB.wxCombat && LB.wxCombat.mod) try { pc *= LB.wxCombat.mod('gun'); } catch (_) {}
        stats.squadShots = (stats.squadShots || 0) + 1;
        if (Math.random() < pc && LB.squads.woundAt(sq.k, f.side)) stats.squadHits = (stats.squadHits || 0) + 1;
      } else {
        var t = nearestEnemy(f, R); if (!t) { if (hidden) { f.blind = true; f.cd = 0.6; } continue; }
        tx = t.position.x; tz = t.position.z;
        if (L && !L.clear(f.x, f.z, tx, tz, eye, 1.1)) { stats.noLos = (stats.noLos || 0) + 1; f.blind = true; f.cd = 0.6; continue; }   // blind: re-check soon, no tracers through walls
        if (REAL && !onTarget(f, tx, tz)) continue;
      }
      if (!REAL && f.g.userData.head) { f.aim = Math.atan2(-(tx - f.x), -(tz - f.z)); f.g.userData.head.rotation.y = f.aim; }
      if (F && F.tracers) try { F.tracers(f.x, f.z, tx, tz, f.type === 'turret' ? 3 : 2, f.type === 'turret' ? 1.6 : 1.2); stats.shots++; } catch (_) {}
      if (REAL) shotFx(f, F);
    }
    if (DMG) dmgTick(dt);
    aiT -= dt; if (aiT <= 0) { aiT = 35 + Math.random() * 25; var en = -playerSide(); if (unlocked(en) && count(en) < cap()) { var ty = TLIST[(Math.random() * 3) | 0]; if (afford(en, ty)) place(ty, frontX() + en * (12 + Math.random() * 25), -40 + Math.random() * 80, en); } }
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; renderUi(); }
  }

  function buildUi() {
    var p = doc.createElement('div'); p.id = 'fortsPanel'; p.className = 'supply-panel forts-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · DEFENSES <span class="qual sim">SIMULATED</span></div><div class="econ-actions">' +
      TLIST.map(function (t) { var c = TYPES[t].cost; return '<button type="button" data-fort="' + t + '" title="' + TYPES[t].tip + '">' + TYPES[t].label + '<small>' + Object.keys(c).map(function (r) { return c[r] + ' ' + r; }).join(' + ') + '</small></button>'; }).join('') +
      '</div>' + (DMG ? '<div class="econ-actions"><button type="button" id="fortRepair">Repair<small>3 fuel · most damaged</small></button><button type="button" id="fortShell">Mortars on fort<small>3 ammo · 3 rounds</small></button></div>' : '') + '<div class="sup-row"><span id="fortStatus" class="sup-status"></span></div><div class="th-note">Pick a type, then tap the field on your side of the front. Turrets and bunkers fire at enemies they can see — game FX only, they never remove market units or move the front.' + (DMG ? ' Strikes and mortars damage forts (enemy mortars too); squads suppress their crews.' : '') + '</div>';
    el.p = p; el.status = p.querySelector('#fortStatus');
    p.addEventListener('click', function (ev) {
      if (ev.target.closest('#fortRepair')) return void cmdRepair();
      if (ev.target.closest('#fortShell')) return void cmdShell();
      var b = ev.target.closest('button[data-fort]'); if (!b) return;
      var t = b.getAttribute('data-fort'); armed = armed === t ? null : t;
      if (armed && LB.dock && LB.dock.close && E().mobile) try { LB.dock.close(); } catch (_) {}
      renderUi();
    });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('techPanel') || doc.getElementById('economyPanel'), p = el.p;
    if (anchor && anchor.parentNode && p.previousSibling !== anchor) { anchor.parentNode.insertBefore(p, anchor.nextSibling); p.classList.toggle('floating', anchor.classList.contains('floating')); }
    else if (!p.parentNode) doc.body.appendChild(p);
    if (anchor) p.hidden = anchor.hidden;
  }
  function renderUi() {
    if (!el.p) return; placeUi();
    var me = playerSide(), ok = unlocked(me);
    TLIST.forEach(function (t) { var b = el.p.querySelector('[data-fort="' + t + '"]'); if (!b) return; b.disabled = !ok || !afford(me, t) || count(me) >= cap(); b.classList.toggle('armed', armed === t); });
    el.status.textContent = !ok ? 'Locked · research Fortifications in the tech tree' : armed ? 'Placing ' + TYPES[armed].label + ' · tap the field (Esc cancels)' : 'Yours ' + count(me) + '/' + cap() + ' · enemy ' + count(-me) + (function () { var b = list.filter(function (f) { return f.side === me && f.blind; }).length; return b ? ' · ' + b + ' NO LOS' : ''; })() + (function () { if (!DMG) return ''; var dmg = list.filter(function (f) { return f.side === me && !f.dead && f.hp < f.maxHp; }).length, lost = (stats.lostBy || {})[String(me)] || 0, kill = (stats.lostBy || {})[String(-me)] || 0; var ek = (stats.engKiaBy || {})[String(me)] || 0; return (dmg ? ' · ' + dmg + ' damaged' : '') + (lost ? ' · lost ' + lost : '') + (ek ? ' · engineers lost ' + ek : '') + (kill ? ' · enemy forts destroyed ' + kill : ''); })() + (stats.squadHits ? ' · squad hits ' + stats.squadHits + (LB.squads && LB.squads.getStats ? ' / KIA ' + ((LB.squads.getStats().fortKillsBy || {})[me] || 0) : '') : '') + (stats.last ? ' · ' + stats.last : '');
    if (DMG) { var rb = el.p.querySelector('#fortRepair'), sb = el.p.querySelector('#fortShell'); if (rb) { var tm = myTeam(); rb.disabled = repT > 0 || !mostDamaged(me); rb.querySelector('small').textContent = tm ? (tm.state === 'work' ? 'repairing ' + Math.ceil(tm.t) + ' s' : 'engineers en route ' + Math.round(Math.max(0, Math.abs(tm.fort.x + tm.side * 3.9 - (tm.men.filter(function (m) { return m.alive; })[0] || tm.men[0]).x))) + ' m') : repT > 0 ? 'engineers busy ' + Math.ceil(repT) + ' s' : '3 fuel · most damaged'; } if (sb) { sb.disabled = shellT > 0; sb.querySelector('small').textContent = shellT > 0 ? 'reloading ' + Math.ceil(shellT) + ' s' : '3 ammo · 3 rounds'; } }
    try { applyCamo(); } catch (_) {}
    doc.body.classList.toggle('fort-placing', !!armed);
  }
  function update() {
    if (!enabled) return;
    var eco = ECO(); if (!eco || !eco.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { build(); ready = true; } catch (err) { enabled = false; console.warn('[forts] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive())) return;
    step(dt);
  }
  LB.forts = {
    isEnabled: function () { return enabled && ready; }, update: update, place: place,
    arm: function (t) { armed = TYPES[t] ? t : null; renderUi(); },
    list: function () { return list.filter(function (f) { return !f.dead; }).map(function (f) { return { id: f.id, type: f.type, side: f.side, x: f.x, z: f.z, blind: !!f.blind, hp: f.hp, maxHp: f.maxHp, sup: +(f.sup || 0).toFixed(2) }; }); },
    wrecks: function () { return list.filter(function (f) { return f.dead; }).map(function (f) { return { id: f.id, type: f.type, side: f.side, x: f.x, z: f.z, t: +f.wreckT.toFixed(1) }; }); },
    damageAt: function (x, z, p, why) { return damageAt(x, z, p, why); }, targetsFor: targetsFor, suppress: suppress, repair: cmdRepair, shell: cmdShell, dmgEnabled: function () { return DMG; }, camoApplied: function () { return camoKey; },
    crewEnabled: function () { return CREW; },
    engineers: function () { return engs.map(function (T) { return { id: T.id, side: T.side, fortId: T.fort.id, who: T.who, state: T.state, t: +(T.t || 0).toFixed(1), men: T.men.map(function (m) { return { x: +m.x.toFixed(1), z: +m.z.toFixed(1), alive: m.alive }; }) }; }); },
    crew: function (id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) { var c = list[i].g.userData.crew || []; return { n: c.length, visible: c.filter(function (m) { return m.visible; }).length, crouch: c.length ? +c[0].userData.crouch.toFixed(2) : 0 }; } return null; },
    _artT: function (t) { artT = t; return true; }, _cds: function () { repT = 0; shellT = 0; return true; },
    getStats: function () { var o = Object.assign({ count: list.filter(function (f) { return !f.dead; }).length, armed: armed, real: REAL, dmg: DMG, shellsInFlight: shells.length }, stats); if (stats.lostBy) o.lostBy = Object.assign({}, stats.lostBy); return o; },
    _aim: function (i) { var f = list[i]; return f ? { aim: +f.aim.toFixed(3), aimT: f.aimT == null ? null : +f.aimT.toFixed(3), recoil: f.recoil || 0, flash: !!(f.g.userData.flash && f.g.userData.flash.visible) } : null; },
    TYPES: TYPES, _step: function (sec) { if (!ready) return; for (var t = 0; t < sec; t += 0.1) step(0.1); }
  };
})(window);
