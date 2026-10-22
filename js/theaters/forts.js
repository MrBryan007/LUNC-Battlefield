/* LUNC Battlefield v12.0.4 — v12.1 "War Systems" part 4: defensive structures. Game/sim layer.
 * v12.0.26 realism pass (?fortfx=0 → off): weathered concrete, faction camo, Jersey barriers, sandbag courses, turret
 * slew 75°/s and fire only on target, bunker slit arc, muzzle flash, recoil, distance-attenuated delayed sound.
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
  function count(side) { return list.filter(function (f) { return f.side === side; }).length; }
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
    } else if (type === 'turret') {
      add(geo.rPed, mat.rConcrete, 0, 0.55, 0); add(geo.rRing, mat.rMetal, 0, 1.18, 0);
      var head = new THREE.Group(); head.position.y = 1.55; g.add(head);
      add(geo.rBody, mat.rCamo[S], 0, 0, 0, head); add(geo.rStripe, mat.rStripe[S], 0, 0.1, 0, head);   // thin faction band round the sides, camo on top
      add(geo.rShield, mat.rCamo[S], 0, 0.12, -0.72, head); add(geo.rAmmo, mat.rCamo[S], 0.62, -0.05, 0.05, head);
      var gun = new THREE.Group(); gun.position.set(0, 0.08, -0.6); head.add(gun);
      var b = add(geo.rBarrel, mat.rMetal, 0, 0, -1.1, gun); b.rotation.x = Math.PI / 2;
      var br = add(geo.rBrake, mat.rMetal, 0, 0, -2.2, gun); br.rotation.x = Math.PI / 2;
      g.userData.head = head; g.userData.gun = gun;
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
    if (seen && d < 180 && LB.sfx && LB.sfx.gunfire) { var fire = function () { try { LB.sfx.gunfire(d / 180); } catch (_) {} }; if (d > 120) setTimeout(fire, d / SOUND * 1000); else fire(); }
  }
  function animReal(f, dt) {   // per frame: slew the turret at a realistic rate, decay recoil and flash
    var u = f.g.userData;
    if (u.head && f.aimT != null) { var df = Math.atan2(Math.sin(f.aimT - f.aim), Math.cos(f.aimT - f.aim)), st = SLEW * dt; f.aim += Math.abs(df) <= st ? df : st * Math.sign(df); f.aim = Math.atan2(Math.sin(f.aim), Math.cos(f.aim)); u.head.rotation.y = f.aim; }
    if (u.gun && f.recoil) { f.recoil = Math.max(0, f.recoil - dt * 9); u.gun.position.z = -0.6 + f.recoil * 0.22; }
    if (u.flash && f.flashT > 0) { f.flashT -= dt; if (f.flashT <= 0) u.flash.visible = false; }
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
    var f = { id: list.length + 1, type: type, side: side, x: x, z: z, g: g, cd: Math.random(), aim: 0, rise: 0 };
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
  function step(dt) {
    var F = LB.heavyFx;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (f.side !== playerSide()) f.g.visible = !(LB.fow && LB.fow.isActive && LB.fow.isActive()) || LB.fow.visible(f.x, f.z);   // v12.0.8 fog of war
      if (f.rise < 1) { f.rise = Math.min(1, f.rise + dt * 1.5); f.g.scale.y = 0.05 + 0.95 * f.rise; }
      var R = TYPES[f.type].range; if (!R) continue;
      if (REAL) animReal(f, dt);
      f.cd -= dt; if (f.cd > 0) continue; f.cd = f.type === 'turret' ? 1.1 : 1.8;
      // v12.0.25: line of sight; enemy squads first (they can be hurt), then the market armies (cosmetic as before)
      var L = LB.los && LB.los.isEnabled && LB.los.isEnabled() ? LB.los : null, eye = f.type === 'turret' ? 1.9 : 1.25, tx, tz, sq = null, hidden = 0;
      if (L && LB.squads && LB.squads.targetsFor) {
        var bd = R * R; LB.squads.targetsFor(f.side).forEach(function (q) { var d = (q.x - f.x) * (q.x - f.x) + (q.z - f.z) * (q.z - f.z); if (d >= bd) return; if (!L.clear(f.x, f.z, q.x, q.z, eye, q.cover ? 0.7 : 1.1)) { stats.noLos = (stats.noLos || 0) + 1; hidden++; return; } bd = d; sq = q; sq.d = Math.sqrt(d); });
      }
      f.blind = false;
      if (sq) {
        tx = sq.x; tz = sq.z;
        if (REAL && !onTarget(f, tx, tz)) continue;
        var pc = (f.type === 'turret' ? 0.22 : 0.18) * (1 - sq.d / R * 0.5) * (sq.cover ? 0.5 : 1);
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
    aiT -= dt; if (aiT <= 0) { aiT = 35 + Math.random() * 25; var en = -playerSide(); if (unlocked(en) && count(en) < cap()) { var ty = TLIST[(Math.random() * 3) | 0]; if (afford(en, ty)) place(ty, frontX() + en * (12 + Math.random() * 25), -40 + Math.random() * 80, en); } }
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; renderUi(); }
  }

  function buildUi() {
    var p = doc.createElement('div'); p.id = 'fortsPanel'; p.className = 'supply-panel forts-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · DEFENSES <span class="qual sim">SIMULATED</span></div><div class="econ-actions">' +
      TLIST.map(function (t) { var c = TYPES[t].cost; return '<button type="button" data-fort="' + t + '" title="' + TYPES[t].tip + '">' + TYPES[t].label + '<small>' + Object.keys(c).map(function (r) { return c[r] + ' ' + r; }).join(' + ') + '</small></button>'; }).join('') +
      '</div><div class="sup-row"><span id="fortStatus" class="sup-status"></span></div><div class="th-note">Pick a type, then tap the field on your side of the front. Turrets and bunkers fire tracers at enemies in range — game FX only, they never remove units or move the front.</div>';
    el.p = p; el.status = p.querySelector('#fortStatus');
    p.addEventListener('click', function (ev) {
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
    el.status.textContent = !ok ? 'Locked · research Fortifications in the tech tree' : armed ? 'Placing ' + TYPES[armed].label + ' · tap the field (Esc cancels)' : 'Yours ' + count(me) + '/' + cap() + ' · enemy ' + count(-me) + (function () { var b = list.filter(function (f) { return f.side === me && f.blind; }).length; return b ? ' · ' + b + ' NO LOS' : ''; })() + (stats.squadHits ? ' · squad hits ' + stats.squadHits + (LB.squads && LB.squads.getStats ? ' / KIA ' + ((LB.squads.getStats().fortKillsBy || {})[me] || 0) : '') : '') + (stats.last ? ' · ' + stats.last : '');
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
    list: function () { return list.map(function (f) { return { type: f.type, side: f.side, x: f.x, z: f.z, blind: !!f.blind }; }); },
    getStats: function () { return Object.assign({ count: list.length, armed: armed, real: REAL }, stats); },
    _aim: function (i) { var f = list[i]; return f ? { aim: +f.aim.toFixed(3), aimT: f.aimT == null ? null : +f.aimT.toFixed(3), recoil: f.recoil || 0, flash: !!(f.g.userData.flash && f.g.userData.flash.visible) } : null; },
    TYPES: TYPES, _step: function (sec) { if (!ready) return; for (var t = 0; t < sec; t += 0.1) step(0.1); }
  };
})(window);
