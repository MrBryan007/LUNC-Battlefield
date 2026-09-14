/* LUNC Battlefield v9.4.2 — faction bases & RTS structures (original procedural) */
(function (global) {
  'use strict';

  function createApi(opts) {
    const THREE = opts.THREE;
    const scene = opts.scene;
    const terrainHeight = opts.terrainHeight;
    const mat = opts.mat || function (color, rough, metal, emissive, intensity) {
      return new THREE.MeshStandardMaterial({
        color: color,
        roughness: rough == null ? 0.85 : rough,
        metalness: metal == null ? 0.08 : metal,
        emissive: emissive || 0x000000,
        emissiveIntensity: intensity || 0
      });
    };
    // v9.2: shared PBR registry (was referenced below but never declared — black canvas)
    const Mats = (global.LUNCBattle && LUNCBattle.materials) || null;
    if (Mats && Mats.init) Mats.init(THREE);
    const mobile = !!opts.mobile;
    let structureDens = 1;
    let shadowCastMode = mobile ? 'bases' : 'rich';
    try {
      if (opts.densityScale != null) structureDens = +opts.densityScale;
      else if (global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getDensityScale) {
        structureDens = LUNCBattle.quality.getDensityScale().structure || 1;
      }
      if (opts.shadowCast) shadowCastMode = opts.shadowCast;
      else if (global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset) {
        shadowCastMode = LUNCBattle.quality.getEffectivePreset().shadowCast || shadowCastMode;
      }
    } catch (_) {}
    const allowRichShadow = shadowCastMode === 'rich';
    const allowBaseShadow = shadowCastMode !== 'major' && shadowCastMode !== 'off';

    const GEO = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl5: new THREE.CylinderGeometry(1, 1, 1, 5),
      cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
      cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
      cone6: new THREE.ConeGeometry(1, 1, 6),
      cone8: new THREE.ConeGeometry(1, 1, 8),
      sphere: new THREE.SphereGeometry(1, 6, 5),
      dish: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.46),
      plane: new THREE.PlaneGeometry(1, 1),
      circle: new THREE.CircleGeometry(1, 10)
    };

    const MAT = {
      dirt: Mats ? Mats.get('structure.dirt') : mat(0x4a3c2a, 1, 0),
      dirtDark: Mats ? Mats.get('structure.dirtDark') : mat(0x3a3024, 1, 0),
      sandbag: Mats ? Mats.get('structure.sandbag') : mat(0x6a5a3e, 0.98, 0.02),
      crate: Mats ? Mats.get('structure.crate') : mat(0x5a442e, 0.88, 0.04),
      wood: Mats ? Mats.get('structure.wood') : mat(0x493625, 0.9, 0.01),
      metal: Mats ? Mats.get('structure.metal') : mat(0x3a4038, 0.42, 0.48),
      metalDark: Mats ? Mats.get('structure.metalDark') : mat(0x222824, 0.5, 0.55),
      rust: Mats ? Mats.get('structure.rust') : mat(0x4a3428, 0.78, 0.28),
      drum: Mats ? Mats.get('structure.drum') : mat(0x3a4030, 0.55, 0.35),
      glass: Mats ? Mats.get('structure.glass') : mat(0x1a2218, 0.35, 0.15, 0x2a3a28, 0.08),
      scorch: Mats ? Mats.get('structure.scorch') : mat(0x1c1a16, 1, 0),
      rubble: Mats ? Mats.get('structure.rubble') : mat(0x4a4a40, 0.95, 0.04),
      earth: Mats ? Mats.get('structure.earth') : mat(0x5a4a34, 1, 0.01)
    };

    const dummy = new THREE.Object3D();
    const buildings = [];
    const commandCenters = {};
    const accentBySide = { '-1': [], '1': [] };
    const radars = [];
    const banners = [];
    const blinkers = [];
    const bases = [];
    const ownedGeos = [
      GEO.box, GEO.cyl5, GEO.cyl6, GEO.cyl8, GEO.cone6, GEO.cone8,
      GEO.sphere, GEO.dish, GEO.plane, GEO.circle
    ];
    const ownedMats = [
      MAT.dirt, MAT.dirtDark, MAT.sandbag, MAT.crate, MAT.wood,
      MAT.metal, MAT.metalDark, MAT.rust, MAT.drum, MAT.glass, MAT.scorch,
      MAT.rubble, MAT.earth
    ];

    function accentMat(side, color, rough, metal, intensity) {
      // Mutable faction accents — unique instances so setAccentColor can retint
      const m = Mats
        ? Mats.create(color, rough == null ? 0.5 : rough, metal == null ? 0.22 : metal, color, intensity == null ? 0.14 : intensity)
        : mat(color, rough == null ? 0.5 : rough, metal == null ? 0.22 : metal, color, intensity == null ? 0.14 : intensity);
      accentBySide[String(side)].push(m);
      ownedMats.push(m);
      return m;
    }

    function factionMats(side, accentColor) {
      const bull = side < 0;
      const wall = Mats
        ? Mats.get(bull ? 'structure.wallBull' : 'structure.wallBear')
        : mat(bull ? 0x5c5e54 : 0x4a4038, 0.92, 0.04);
      const wallDark = Mats
        ? Mats.get(bull ? 'structure.wallDarkBull' : 'structure.wallDarkBear')
        : mat(bull ? 0x4a4e46 : 0x3a342c, 0.9, 0.05);
      const concrete = Mats
        ? Mats.get(bull ? 'structure.concreteBull' : 'structure.concreteBear')
        : mat(bull ? 0x6a6c62 : 0x524840, 0.88, 0.06);
      const roof = Mats
        ? Mats.get(bull ? 'structure.roofBull' : 'structure.roofBear')
        : mat(bull ? 0x2a3028 : 0x1c1814, 0.78, 0.12);
      const roofTrim = Mats
        ? Mats.get(bull ? 'structure.roofTrimBull' : 'structure.roofTrimBear')
        : mat(bull ? 0x3a4038 : 0x2a221c, 0.7, 0.18);
      const frame = Mats
        ? Mats.get(bull ? 'structure.frameBull' : 'structure.frameBear')
        : mat(bull ? 0x3a4238 : 0x2e2822, 0.65, 0.22);
      const interior = Mats ? Mats.get('structure.interior') : mat(0x121410, 0.95, 0.02);
      return {
        wall: wall,
        wallDark: wallDark,
        concrete: concrete,
        roof: roof,
        roofTrim: roofTrim,
        frame: frame,
        interior: interior,
        accent: accentMat(side, accentColor, 0.48, 0.22, 0.16),
        accentSoft: accentMat(side, accentColor, 0.7, 0.1, 0.08),
        lamp: accentMat(side, accentColor, 0.35, 0.15, 0.55),
        banner: accentMat(side, accentColor, 0.82, 0.04, 0.04)
      };
    }

    function registerFactionMats(fm) {
      // Shared registry mats are not disposed here — only track non-shared
      [fm.wall, fm.wallDark, fm.concrete, fm.roof, fm.roofTrim, fm.frame, fm.interior].forEach(function (m) {
        if (!m) return;
        if (Mats && Mats.isShared && Mats.isShared(m)) return;
        ownedMats.push(m);
      });
    }

    function heightRange(x, z, hx, hz) {
      const pts = [
        [x, z], [x + hx, z], [x - hx, z], [x, z + hz], [x, z - hz],
        [x + hx, z + hz], [x + hx, z - hz], [x - hx, z + hz], [x - hx, z - hz]
      ];
      let lo = terrainHeight(pts[0][0], pts[0][1]);
      let hi = lo;
      for (let i = 1; i < pts.length; i++) {
        const h = terrainHeight(pts[i][0], pts[i][1]);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
      return { min: lo, max: hi };
    }

    function placeOnTerrain(obj, x, z, yOff) {
      obj.position.set(x, terrainHeight(x, z) + (yOff || 0), z);
      return obj;
    }

    function placeBuilding(obj, x, z, hx, hz, yOff) {
      const y = heightRange(x, z, hx || 1.4, hz || 1.4).max + (yOff || 0);
      obj.position.set(x, y, z);
      return obj;
    }

    function addPad(parent, x, z, w, d) {
      const r = heightRange(x, z, w * 0.48, d * 0.48);
      const thick = Math.max(0.2, (r.max - r.min) + 0.2);
      const pad = new THREE.Mesh(GEO.box, MAT.dirt);
      pad.scale.set(w, thick, d);
      pad.position.set(x, r.max - thick * 0.45, z);
      pad.receiveShadow = true;
      pad.castShadow = false;
      parent.add(pad);
      return pad;
    }

    function add(parent, geo, material, x, y, z, sx, sy, sz, rot, forceShadow) {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      if (sx != null) m.scale.set(sx, sy != null ? sy : 1, sz != null ? sz : sx);
      if (rot) {
        if (rot.x) m.rotation.x = rot.x;
        if (rot.y) m.rotation.y = rot.y;
        if (rot.z) m.rotation.z = rot.z;
      }
      m.castShadow = forceShadow ? allowBaseShadow : (allowRichShadow && !mobile);
      m.receiveShadow = true;
      parent.add(m);
      return m;
    }

    function makeDamageOverlays(parent, w, h, d) {
      const damaged = add(parent, GEO.box, MAT.scorch, 0.05, h * 0.62, 0.04, w * 0.72, 0.05, d * 0.62);
      damaged.visible = false;
      damaged.castShadow = false;
      const critical = add(parent, GEO.box, MAT.rubble, w * 0.12, h * 0.18, d * 0.08, w * 0.38, h * 0.22, d * 0.28, { z: 0.35, y: 0.2 });
      critical.visible = false;
      return { damaged: damaged, critical: critical };
    }

    function markBuilding(group, kind, side, overlays) {
      overlays = overlays || {};
      group.userData.kind = kind;
      group.userData.side = side;
      group.userData.damageState = 'HEALTHY';
      group.userData.smokePoints = overlays.smokePoints || [{ x: 0, y: 2.2, z: 0 }];
      group.userData.firePoints = overlays.firePoints || [{ x: 0.35, y: 1.4, z: 0.15 }];
      group.userData.debrisSpawns = overlays.debrisSpawns || [
        { x: 0.7, y: 0.35, z: 0.45 },
        { x: -0.55, y: 0.28, z: -0.4 }
      ];
      group.userData.damagedMesh = overlays.damaged || null;
      group.userData.criticalMesh = overlays.critical || null;
      buildings.push(group);
      return group;
    }

    function addBanner(parent, side, fm, x, y, z, w, h, facing) {
      add(parent, GEO.cyl5, MAT.metalDark, x, y, z, 0.045, h + 0.4, 0.045);
      const cloth = add(parent, GEO.plane, fm.banner, x + facing * 0.02, y + h * 0.15, z + 0.02, w, h, 1);
      cloth.material.side = THREE.DoubleSide;
      cloth.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
      banners.push({ mesh: cloth, phase: Math.abs(x) * 0.17 + Math.abs(z) * 0.11 });
      return cloth;
    }

    function addLamp(parent, fm, x, y, z, blink) {
      const lamp = add(parent, GEO.box, fm.lamp, x, y, z, 0.1, 0.12, 0.08);
      if (blink) blinkers.push({ mat: fm.lamp, phase: x * 0.3 + z * 0.2, mode: blink });
      return lamp;
    }

    function flushInstances(parent, geo, material, items, shadows) {
      if (!items || !items.length) return null;
      const mesh = new THREE.InstancedMesh(geo, material, items.length);
      mesh.castShadow = !!shadows && allowRichShadow && !mobile;
      mesh.receiveShadow = true;
      for (let i = 0; i < items.length; i++) {
        const t = items[i];
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(t.rx || 0, t.ry || 0, t.rz || 0);
        dummy.scale.set(t.sx == null ? 1 : t.sx, t.sy == null ? 1 : t.sy, t.sz == null ? 1 : t.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      parent.add(mesh);
      return mesh;
    }

    // =========================================================
    // BULL — organized / industrial
    // =========================================================
    function buildBullCommand(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.cyl8, fm.concrete, 0, 2.15, 0, 2.85, 4.3, 2.85, null, true);
      add(g, GEO.cyl8, fm.wallDark, 0, 4.45, 0, 2.55, 0.38, 2.55, null, true);
      add(g, GEO.cyl8, fm.roof, 0, 4.72, 0, 2.95, 0.18, 2.95, null, true);
      add(g, GEO.cyl8, fm.roofTrim, 0, 4.88, 0, 3.05, 0.08, 3.05);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        add(g, GEO.box, MAT.metalDark, Math.cos(a) * 2.7, 5.15, Math.sin(a) * 2.7, 0.07, 0.42, 0.07);
      }
      add(g, GEO.cyl5, MAT.metal, 0.55, 5.85, 0.15, 0.04, 1.7, 0.04, null, true);
      add(g, GEO.cyl5, MAT.metal, 0.95, 5.55, -0.25, 0.03, 1.15, 0.03);
      add(g, GEO.box, MAT.metal, 0.55, 6.72, 0.15, 0.55, 0.04, 0.04);
      add(g, GEO.box, MAT.metal, 0.55, 6.55, 0.15, 0.04, 0.04, 0.45);
      add(g, GEO.sphere, fm.lamp, 0.55, 6.78, 0.15, 0.07, 0.07, 0.07);
      blinkers.push({ mat: fm.lamp, phase: 1.2, mode: 'blink' });
      add(g, GEO.box, fm.frame, 2.55, 1.05, 0, 0.28, 2.1, 1.35, null, true);
      add(g, GEO.box, fm.interior, 2.62, 1.0, 0, 0.12, 1.7, 0.95);
      addLamp(g, fm, 2.72, 1.85, 0.52, null);
      addLamp(g, fm, 2.72, 1.85, -0.52, null);
      add(g, GEO.box, fm.wall, -0.4, 1.05, 3.15, 3.2, 2.1, 2.0, null, true);
      add(g, GEO.box, fm.roof, -0.4, 2.25, 3.15, 3.45, 0.16, 2.2, { z: 0.08 });
      add(g, GEO.box, fm.interior, 1.15, 0.85, 3.15, 0.1, 1.15, 0.7);
      add(g, GEO.cyl8, fm.accentSoft, 0, 3.35, 0, 2.88, 0.1, 2.88);
      addBanner(g, side, fm, -2.9, 2.5, 0, 1.35, 1.85, -1);
      const ov = makeDamageOverlays(g, 5.2, 4.4, 5.2);
      markBuilding(g, 'commandCenter', side, {
        damaged: ov.damaged, critical: ov.critical,
        smokePoints: [{ x: 0.4, y: 5.1, z: 0.2 }, { x: -0.6, y: 4.9, z: 0.8 }],
        firePoints: [{ x: 2.4, y: 1.4, z: 0 }],
        debrisSpawns: [{ x: 2.2, y: 0.4, z: 1.1 }, { x: -1.4, y: 0.3, z: -1.6 }]
      });
      return g;
    }

    function buildBullBarracks(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.wall, 0, 0.95, 0, 5.6, 1.9, 2.25, null, true);
      add(g, GEO.box, fm.roof, 0, 2.15, -0.55, 5.85, 0.12, 1.35, { x: 0.42 });
      add(g, GEO.box, fm.roof, 0, 2.15, 0.55, 5.85, 0.12, 1.35, { x: -0.42 });
      add(g, GEO.box, fm.roofTrim, 0, 2.42, 0, 5.9, 0.1, 0.18);
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue;
        add(g, GEO.box, MAT.glass, 1.15, 1.15, i * 0.38, 0.06, 0.42, 0.32);
      }
      add(g, GEO.box, fm.frame, 2.75, 0.7, 0, 0.16, 1.25, 0.7);
      add(g, GEO.box, fm.interior, 2.82, 0.68, 0, 0.06, 1.05, 0.5);
      add(g, GEO.box, fm.accentSoft, 0, 1.85, 1.14, 5.4, 0.06, 0.06);
      const ov = makeDamageOverlays(g, 5.4, 2.0, 2.2);
      markBuilding(g, 'barracks', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 2.5, z: 0 }] });
      return g;
    }

    function buildBullDepot(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.wall, -0.15, 1.15, 0, 4.4, 2.3, 3.4, null, true);
      add(g, GEO.box, fm.roof, -0.15, 2.42, 0, 4.7, 0.16, 3.65);
      add(g, GEO.box, fm.interior, 2.05, 1.05, 0, 0.08, 1.9, 2.6);
      add(g, GEO.box, fm.frame, 2.15, 2.15, 0, 0.14, 0.18, 2.85);
      add(g, GEO.box, fm.frame, 2.15, 1.1, 1.4, 0.14, 2.2, 0.16);
      add(g, GEO.box, fm.frame, 2.15, 1.1, -1.4, 0.14, 2.2, 0.16);
      add(g, GEO.box, MAT.dirtDark, 2.85, 0.16, 0, 1.8, 0.14, 2.2, { z: -0.22 });
      addLamp(g, fm, 2.2, 2.05, 1.15, 'pulse');
      addLamp(g, fm, 2.2, 2.05, -1.15, 'pulse');
      const ov = makeDamageOverlays(g, 4.4, 2.4, 3.4);
      markBuilding(g, 'vehicleDepot', side, {
        damaged: ov.damaged, critical: ov.critical,
        smokePoints: [{ x: 0.2, y: 2.6, z: 0.4 }],
        firePoints: [{ x: 1.8, y: 0.6, z: 0.8 }]
      });
      return g;
    }

    function buildBullArty(fm, side) {
      const g = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        add(g, GEO.box, MAT.earth, Math.cos(a) * 2.15, 0.42, Math.sin(a) * 2.15, 1.35, 0.85, 0.7, { y: -a });
      }
      add(g, GEO.circle, MAT.dirtDark, 0, 0.04, 0, 1.7, 1, 1.7, { x: -Math.PI / 2 });
      add(g, GEO.box, fm.wallDark, 0, 0.18, 0, 1.1, 0.12, 1.1);
      const ov = makeDamageOverlays(g, 3.2, 1.0, 3.2);
      markBuilding(g, 'artilleryPad', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 1.1, z: 0 }] });
      return g;
    }

    function buildBullSupply(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.wall, 0, 1.05, 0, 3.4, 2.1, 2.5, null, true);
      add(g, GEO.box, fm.roof, 0, 2.22, 0, 3.65, 0.18, 2.7);
      add(g, GEO.box, fm.concrete, 1.55, 0.28, 0, 1.3, 0.22, 1.8);
      add(g, GEO.box, fm.frame, 1.72, 0.85, 0, 0.12, 1.2, 1.05);
      add(g, GEO.box, fm.interior, 1.78, 0.82, 0, 0.06, 0.95, 0.8);
      add(g, GEO.box, fm.accentSoft, 0, 2.05, 1.28, 2.8, 0.06, 0.06);
      const ov = makeDamageOverlays(g, 3.4, 2.2, 2.5);
      markBuilding(g, 'supplyDepot', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 2.4, z: 0 }] });
      return g;
    }

    function buildBullRadar(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.cyl6, fm.concrete, 0, 0.35, 0, 0.55, 0.7, 0.55, null, true);
      add(g, GEO.cyl5, MAT.metal, 0, 2.05, 0, 0.09, 2.8, 0.09, null, true);
      add(g, GEO.box, MAT.metalDark, 0, 1.4, 0, 0.08, 1.6, 0.08, { z: 0.45 });
      add(g, GEO.box, MAT.metalDark, 0, 1.4, 0, 0.08, 1.6, 0.08, { z: -0.45 });
      const head = new THREE.Group();
      head.position.set(0, 3.45, 0);
      add(head, GEO.box, MAT.metal, 0, 0, 0, 0.35, 0.22, 0.35);
      add(head, GEO.dish, MAT.metal, 0.15, 0.15, 0, 1.05, 1.05, 1.05, { x: -0.85, y: Math.PI / 2 });
      add(head, GEO.cyl5, MAT.metalDark, 0.05, 0.05, 0, 0.05, 0.7, 0.05, { z: 1.1 });
      add(head, GEO.sphere, fm.lamp, 0.15, 0.35, 0, 0.08, 0.08, 0.08);
      g.add(head);
      radars.push({ dish: head, speed: 0.55 });
      blinkers.push({ mat: fm.lamp, phase: 2.4, mode: 'blink' });
      const ov = makeDamageOverlays(g, 1.4, 3.2, 1.4);
      markBuilding(g, 'radar', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 3.6, z: 0 }] });
      return g;
    }

    function buildBullComms(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.wall, 0, 0.75, 0, 2.1, 1.5, 1.8, null, true);
      add(g, GEO.box, fm.roof, 0, 1.58, 0, 2.25, 0.14, 1.95);
      add(g, GEO.cyl6, MAT.drum, -0.85, 0.55, 1.35, 0.32, 1.1, 0.32);
      add(g, GEO.cyl6, MAT.drum, -0.25, 0.42, 1.4, 0.28, 0.85, 0.28);
      add(g, GEO.cyl5, MAT.metal, 0.55, 2.15, 0, 0.05, 1.2, 0.05);
      add(g, GEO.box, MAT.metal, 0.55, 2.75, 0, 0.55, 0.04, 0.04);
      addLamp(g, fm, 0.2, 1.72, 0.85, 'blink');
      const ov = makeDamageOverlays(g, 2.1, 1.6, 1.8);
      markBuilding(g, 'commsPower', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: -0.8, y: 1.3, z: 1.3 }] });
      return g;
    }

    function buildBullTower(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.cyl8, fm.concrete, 0, 1.85, 0, 0.95, 3.7, 0.95, null, true);
      add(g, GEO.cyl8, fm.wallDark, 0, 3.75, 0, 1.15, 0.28, 1.15, null, true);
      add(g, GEO.cyl8, fm.roof, 0, 3.98, 0, 1.22, 0.14, 1.22);
      add(g, GEO.box, MAT.metalDark, 0, 4.35, 0, 0.08, 0.55, 0.08);
      addLamp(g, fm, 0, 4.62, 0, 'pulse');
      add(g, GEO.box, fm.interior, 0.85, 2.55, 0, 0.08, 0.45, 0.35);
      const ov = makeDamageOverlays(g, 2.0, 3.8, 2.0);
      markBuilding(g, 'tower', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 4.1, z: 0 }] });
      return g;
    }

    function buildBullBunker(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.wallDark, 0, 0.55, 0, 2.6, 1.1, 1.7, null, true);
      add(g, GEO.box, MAT.earth, 0, 0.28, -0.15, 3.05, 0.55, 2.15);
      add(g, GEO.box, fm.interior, 1.25, 0.55, 0, 0.1, 0.55, 0.85);
      add(g, GEO.box, fm.frame, 1.28, 0.72, 0, 0.12, 0.18, 1.05);
      const ov = makeDamageOverlays(g, 2.6, 1.1, 1.7);
      markBuilding(g, 'bunker', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 1.2, z: 0 }] });
      return g;
    }

    // =========================================================
    // BEAR — heavier / fortified (different meshes, not recolors)
    // =========================================================
    function buildBearHQ(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.concrete, 0, 1.25, 0, 6.6, 2.5, 4.6, null, true);
      add(g, GEO.box, fm.wallDark, 0, 2.58, 0, 6.9, 0.22, 4.9, null, true);
      add(g, GEO.box, fm.wall, -3.15, 0.85, 0, 1.8, 1.35, 4.2, { z: 0.48 }, true);
      for (let i = -3; i <= 3; i++) {
        add(g, GEO.box, fm.wallDark, i * 0.92, 2.92, 2.25, 0.55, 0.48, 0.32);
        add(g, GEO.box, fm.wallDark, i * 0.92, 2.92, -2.25, 0.55, 0.48, 0.32);
      }
      for (let i = -2; i <= 2; i++) {
        add(g, GEO.box, fm.wallDark, 3.2, 2.92, i * 0.85, 0.32, 0.48, 0.5);
      }
      for (let i = -2; i <= 2; i++) {
        add(g, GEO.box, MAT.glass, -3.25, 1.55, i * 0.7, 0.08, 0.22, 0.55);
      }
      add(g, GEO.box, fm.frame, -3.45, 0.75, 0, 0.2, 1.35, 1.15, null, true);
      add(g, GEO.box, fm.interior, -3.52, 0.72, 0, 0.08, 1.1, 0.85);
      addLamp(g, fm, -3.55, 1.45, 0.62, null);
      addLamp(g, fm, -3.55, 1.45, -0.62, null);
      add(g, GEO.box, fm.accent, 0, 2.48, 2.42, 6.4, 0.07, 0.07);
      add(g, GEO.box, fm.accent, 0, 2.48, -2.42, 6.4, 0.07, 0.07);
      add(g, GEO.cyl5, MAT.metalDark, 2.2, 3.55, 0, 0.06, 1.4, 0.06, null, true);
      addBanner(g, side, fm, 2.2, 3.2, 0.05, 1.15, 1.45, 1);
      add(g, GEO.sphere, fm.lamp, 2.2, 4.3, 0, 0.08, 0.08, 0.08);
      blinkers.push({ mat: fm.lamp, phase: 0.6, mode: 'blink' });
      const ov = makeDamageOverlays(g, 6.6, 2.6, 4.6);
      markBuilding(g, 'commandCenter', side, {
        damaged: ov.damaged, critical: ov.critical,
        smokePoints: [{ x: 0.8, y: 2.8, z: 0.4 }, { x: -2.4, y: 1.6, z: 1.2 }],
        firePoints: [{ x: -3.2, y: 0.9, z: 0 }],
        debrisSpawns: [{ x: -2.8, y: 0.3, z: 1.6 }, { x: 2.4, y: 0.35, z: -1.8 }]
      });
      return g;
    }

    function buildBearBarracks(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.wall, 0, 1.05, 0, 5.2, 2.1, 2.55, null, true);
      add(g, GEO.box, fm.roof, 0, 2.25, 0.05, 5.55, 0.28, 2.85, { x: 0.08 });
      for (let i = -1; i <= 1; i++) {
        add(g, GEO.box, fm.wallDark, -2.45, 0.85, i * 0.85, 0.45, 1.7, 0.4, { z: 0.15 });
        add(g, GEO.box, fm.wallDark, 2.45, 0.85, i * 0.85, 0.45, 1.7, 0.4, { z: -0.12 });
      }
      for (let i = -2; i <= 2; i++) {
        add(g, GEO.box, MAT.glass, -2.62, 1.35, i * 0.4, 0.06, 0.16, 0.42);
      }
      add(g, GEO.box, fm.frame, -2.65, 0.65, 0, 0.14, 1.15, 0.75);
      add(g, GEO.box, fm.accent, 0, 2.12, 1.38, 4.8, 0.06, 0.06);
      const ov = makeDamageOverlays(g, 5.2, 2.2, 2.55);
      markBuilding(g, 'barracks', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 2.5, z: 0 }] });
      return g;
    }

    function buildBearHangar(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.wall, 1.6, 1.2, 0, 0.35, 2.4, 3.8, null, true);
      const posts = [[-1.6, 1.7], [-1.6, -1.7], [0.2, 1.7], [0.2, -1.7]];
      posts.forEach(function (p) {
        add(g, GEO.box, fm.frame, p[0], 1.15, p[1], 0.22, 2.3, 0.22, null, true);
      });
      add(g, GEO.box, fm.roof, 0, 2.45, 0, 4.6, 0.2, 4.15, { z: 0.05 });
      add(g, GEO.box, fm.roofTrim, -2.15, 2.35, 0, 0.18, 0.16, 4.15);
      add(g, GEO.box, MAT.dirtDark, -2.2, 0.06, 0, 2.2, 0.1, 3.2);
      addLamp(g, fm, -2.0, 2.25, 1.6, 'pulse');
      addLamp(g, fm, -2.0, 2.25, -1.6, 'pulse');
      const ov = makeDamageOverlays(g, 4.4, 2.5, 4.0);
      markBuilding(g, 'vehicleDepot', side, {
        damaged: ov.damaged, critical: ov.critical,
        smokePoints: [{ x: 1.4, y: 2.6, z: 0 }],
        firePoints: [{ x: -1.5, y: 0.4, z: 1.2 }]
      });
      return g;
    }

    function buildBearArty(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, MAT.earth, 1.15, 0.7, 0, 1.15, 1.4, 4.4);
      add(g, GEO.box, MAT.earth, -0.35, 0.55, 1.85, 2.6, 1.1, 1.05);
      add(g, GEO.box, MAT.earth, -0.35, 0.55, -1.85, 2.6, 1.1, 1.05);
      add(g, GEO.box, MAT.dirtDark, -0.2, 0.05, 0, 2.4, 0.1, 2.6);
      add(g, GEO.box, fm.wallDark, 0.35, 0.16, 0, 1.0, 0.14, 1.2);
      const ov = makeDamageOverlays(g, 3.6, 1.4, 4.4);
      markBuilding(g, 'artilleryPad', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 1.5, z: 0 }] });
      return g;
    }

    function buildBearSupply(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.wall, 0, 1.15, 0, 3.6, 2.3, 2.8, null, true);
      add(g, GEO.box, fm.roof, 0, 2.45, 0, 3.95, 0.32, 3.1);
      add(g, GEO.box, MAT.earth, 0.2, 0.45, 1.55, 3.8, 0.9, 0.85, { x: 0.25 });
      add(g, GEO.box, fm.frame, -1.85, 0.8, 0, 0.16, 1.4, 1.1);
      add(g, GEO.box, fm.interior, -1.92, 0.78, 0, 0.06, 1.15, 0.85);
      add(g, GEO.box, fm.accent, 0, 2.28, 1.52, 3.2, 0.07, 0.07);
      const ov = makeDamageOverlays(g, 3.6, 2.4, 2.8);
      markBuilding(g, 'supplyDepot', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 2.6, z: 0 }] });
      return g;
    }

    function buildBearRadar(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.concrete, 0, 0.85, 0, 1.15, 1.7, 1.15, null, true);
      add(g, GEO.cyl6, MAT.metalDark, 0, 2.15, 0, 0.16, 1.1, 0.16, null, true);
      const head = new THREE.Group();
      head.position.set(0, 2.75, 0);
      add(head, GEO.box, MAT.metal, 0, 0.15, 0, 0.45, 0.28, 0.45);
      add(head, GEO.box, MAT.metal, -0.15, 0.35, 0, 1.55, 1.05, 0.1, { y: 0.15 });
      add(head, GEO.box, MAT.metalDark, -0.15, 0.35, 0, 1.35, 0.08, 0.12, { y: 0.15 });
      add(head, GEO.sphere, fm.lamp, 0.2, 0.55, 0, 0.07, 0.07, 0.07);
      g.add(head);
      radars.push({ dish: head, speed: 0.38 });
      blinkers.push({ mat: fm.lamp, phase: 3.1, mode: 'blink' });
      const ov = makeDamageOverlays(g, 1.6, 2.8, 1.6);
      markBuilding(g, 'radar', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 2.9, z: 0 }] });
      return g;
    }

    function buildBearComms(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.wallDark, 0, 0.7, 0, 2.35, 1.4, 2.0, null, true);
      add(g, GEO.box, fm.roof, 0, 1.52, 0, 2.55, 0.22, 2.2);
      add(g, GEO.cyl6, MAT.rust, 0.95, 0.5, 1.25, 0.38, 1.0, 0.38);
      add(g, GEO.box, MAT.metalDark, -0.7, 2.15, 0, 0.08, 1.35, 0.08);
      add(g, GEO.box, MAT.metal, -0.7, 2.75, 0, 0.7, 0.05, 0.05);
      add(g, GEO.box, MAT.metal, -0.7, 2.55, 0, 0.05, 0.05, 0.55);
      addLamp(g, fm, 0.15, 1.62, 0.95, 'blink');
      const ov = makeDamageOverlays(g, 2.35, 1.5, 2.0);
      markBuilding(g, 'commsPower', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0.9, y: 1.2, z: 1.2 }] });
      return g;
    }

    function buildBearTower(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.concrete, 0, 1.95, 0, 2.15, 3.9, 2.15, null, true);
      add(g, GEO.box, fm.wallDark, 0, 3.95, 0, 2.35, 0.28, 2.35, null, true);
      const caps = [[1.0, 1.0], [1.0, -1.0], [-1.0, 1.0], [-1.0, -1.0]];
      caps.forEach(function (c) {
        add(g, GEO.box, fm.wall, c[0], 4.28, c[1], 0.42, 0.5, 0.42);
      });
      add(g, GEO.box, MAT.metalDark, 0, 4.45, 0, 0.1, 0.55, 0.1);
      addLamp(g, fm, 0, 4.78, 0, 'pulse');
      add(g, GEO.box, MAT.glass, -1.05, 2.4, 0, 0.08, 0.28, 0.7);
      add(g, GEO.box, fm.accent, 0, 3.82, 1.12, 2.0, 0.06, 0.06);
      const ov = makeDamageOverlays(g, 2.2, 4.0, 2.2);
      markBuilding(g, 'tower', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 4.2, z: 0 }] });
      return g;
    }

    function buildBearBunker(fm, side) {
      const g = new THREE.Group();
      add(g, GEO.box, fm.concrete, 0, 0.65, 0, 3.15, 1.3, 2.05, null, true);
      add(g, GEO.box, MAT.earth, 0.15, 0.35, 0.1, 3.6, 0.7, 2.45);
      add(g, GEO.box, fm.wallDark, 0, 1.35, 0, 3.25, 0.18, 2.15);
      add(g, GEO.box, fm.interior, -1.5, 0.6, 0, 0.1, 0.55, 0.95);
      add(g, GEO.box, fm.frame, -1.55, 0.78, 0, 0.12, 0.2, 1.15);
      add(g, GEO.box, fm.accent, 0, 1.28, 1.05, 2.4, 0.05, 0.05);
      const ov = makeDamageOverlays(g, 3.15, 1.3, 2.05);
      markBuilding(g, 'bunker', side, { damaged: ov.damaged, critical: ov.critical, smokePoints: [{ x: 0, y: 1.4, z: 0 }] });
      return g;
    }

    function addHedgehog(items, x, y, z, s) {
      s = s || 1;
      items.push({ x: x, y: y, z: z, sx: 0.1 * s, sy: 1.15 * s, sz: 0.1 * s, rx: 0.7, ry: 0.4, rz: 0.2 });
      items.push({ x: x, y: y, z: z, sx: 0.1 * s, sy: 1.15 * s, sz: 0.1 * s, rx: -0.55, ry: 1.1, rz: 0.35 });
      items.push({ x: x, y: y, z: z, sx: 0.1 * s, sy: 1.15 * s, sz: 0.1 * s, rx: 0.15, ry: 0.2, rz: 1.15 });
    }

    function buildPerimeter(group, side, fm, crates, bags, fences, hogs) {
      const bull = side < 0;
      const originX = side * 48;
      const frontX = originX - side * 7;
      const rearX = originX + side * 10;
      const zMin = -13;
      const zMax = 13;
      const gateHalf = 2.35;
      const wallH = bull ? 1.15 : 1.48;
      const wallT = bull ? 0.42 : 0.72;
      const seg = mobile ? 2.6 : 2.05;
      const walls = [];

      function wallRun(x0, z0, x1, z1, skipGate) {
        const dx = x1 - x0;
        const dz = z1 - z0;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        const n = Math.max(1, Math.round(len / seg));
        const ux = dx / n;
        const uz = dz / n;
        const ry = Math.atan2(dx, dz);
        for (let i = 0; i < n; i++) {
          const x = x0 + ux * (i + 0.5);
          const z = z0 + uz * (i + 0.5);
          if (skipGate && Math.abs(z) < gateHalf && Math.abs(x - frontX) < 1.2) continue;
          const y = terrainHeight(x, z);
          walls.push({
            x: x, y: y + wallH * 0.5, z: z,
            sx: wallT, sy: wallH, sz: seg * 0.96,
            ry: ry
          });
          if (!bull && i % 2 === 0) {
            walls.push({
              x: x, y: y + wallH + 0.18, z: z,
              sx: wallT * 0.7, sy: 0.36, sz: 0.55,
              ry: ry
            });
          }
        }
      }

      wallRun(frontX, zMin, frontX, zMax, true);
      wallRun(rearX, zMin, rearX, zMax, false);
      wallRun(rearX, zMax, frontX, zMax, false);
      wallRun(rearX, zMin, frontX, zMin, false);
      flushInstances(group, GEO.box, fm.wall, walls, true);

      // Gate posts + lintel toward frontline
      const gy = terrainHeight(frontX, 0);
      const postW = bull ? 0.45 : 0.7;
      const postH = wallH + 0.55;
      const gp1 = add(group, GEO.box, fm.concrete, frontX, gy + postH * 0.5, gateHalf, postW, postH, postW, null, true);
      const gp2 = add(group, GEO.box, fm.concrete, frontX, gy + postH * 0.5, -gateHalf, postW, postH, postW, null, true);
      add(group, GEO.box, fm.frame, frontX, gy + postH + 0.08, 0, postW * 0.7, 0.16, gateHalf * 2 + postW);
      addLamp(group, fm, frontX - side * 0.15, gy + postH - 0.15, gateHalf * 0.55, 'pulse');
      addLamp(group, fm, frontX - side * 0.15, gy + postH - 0.15, -gateHalf * 0.55, 'pulse');
      gp1.userData.kind = 'gate';
      gp2.userData.kind = 'gate';

      // Approach dirt pad from gate toward frontline
      const apX = frontX - side * 3.2;
      addPad(group, apX, 0, 5.5, 5.2);

      // Sandbags near gate + bunkers
      const bagN = Math.max(4, Math.round((mobile ? 8 : 16) * structureDens));
      for (let i = 0; i < bagN; i++) {
        const sideZ = (i % 2 ? 1 : -1);
        const x = frontX - side * (0.8 + (i % 4) * 0.35);
        const z = sideZ * (gateHalf + 0.7 + Math.floor(i / 2) * 0.42);
        const y = terrainHeight(x, z) + 0.18 + (i % 3) * 0.16;
        bags.push({ x: x, y: y, z: z, sx: 0.85, sy: 0.32, sz: 0.42, ry: (i % 2) * 0.2 });
      }

      // Fence runs along outer flanks
      const fenceN = Math.max(3, Math.round((mobile ? 6 : 12) * structureDens));
      for (let i = 0; i < fenceN; i++) {
        const z = -11 + i * (22 / Math.max(1, fenceN - 1));
        const x = rearX + side * 1.3;
        const y = terrainHeight(x, z);
        fences.push({ x: x, y: y + 0.48, z: z, sx: 0.07, sy: 0.95, sz: 0.07 });
        if (i < fenceN - 1) {
          const z2 = -11 + (i + 1) * (22 / Math.max(1, fenceN - 1));
          fences.push({
            x: x, y: y + 0.62, z: (z + z2) * 0.5,
            sx: 0.05, sy: 0.06, sz: Math.abs(z2 - z) * 0.92,
            ry: 0
          });
        }
      }

      // Hedgehogs outside the front wall
      const hogN = Math.max(1, Math.round((mobile ? 2 : 5) * structureDens));
      for (let i = 0; i < hogN; i++) {
        const z = -9 + i * (18 / Math.max(1, hogN - 1));
        const x = frontX - side * 2.4;
        addHedgehog(hogs, x, terrainHeight(x, z) + 0.35, z, 0.85);
      }

      return { frontX: frontX, rearX: rearX, originX: originX };
    }

    function placeNamed(group, building, x, z, hx, hz, yOff) {
      placeBuilding(building, x, z, hx, hz, yOff);
      // v9.4.2: decorative → semantic LOD groups (detail); keep silhouette/core
      if (building && building.userData) {
        const decor = [];
        const core = [];
        building.traverse(function (ch) {
          if (!ch.isMesh) return;
          const n = (ch.name || '').toLowerCase();
          if (n.indexOf('decor') >= 0 || n.indexOf('antenna') >= 0 || n.indexOf('banner') >= 0 ||
              n.indexOf('blink') >= 0 || n.indexOf('light') >= 0 || n.indexOf('dish') >= 0) {
            decor.push(ch);
          } else if (n.indexOf('silhou') >= 0 || n.indexOf('hull') >= 0 || n.indexOf('keep') >= 0 ||
                     n.indexOf('tower') >= 0 || n.indexOf('base') >= 0) {
            core.push(ch);
          }
        });
        if (decor.length) building.userData.decorative = decor;
        const lodGroups = {
          core: core.length ? core : null,
          silhouette: core.length ? core : (building.userData.silhouette || null),
          major: building.userData.factionAccent ? [building.userData.factionAccent] : null,
          detail: decor.length ? decor : null,
          limbs: null
        };
        if (global.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.registerLodGroups) {
          LUNCBattle.lod.registerLodGroups(building, lodGroups);
        } else {
          building.userData.lodGroups = lodGroups;
        }
        building.userData.lodBand = 0;
      }
      group.add(building);
      return building;
    }


    function tryGltfHQ(side, accentColor) {
      const Assets = (global.LUNCBattle && LUNCBattle.assets) || null;
      const Reg = (global.LUNCBattle && LUNCBattle.assetRegistry) || null;
      if (!Assets || !Reg) return null;
      const id = Reg.structureId
        ? Reg.structureId(side < 0 ? 'bull' : 'bear', 'hq')
        : ('structure.' + (side < 0 ? 'bull' : 'bear') + '.hq');
      if (!Assets.shouldUseGltf || !Assets.shouldUseGltf(id)) return null;
      try {
        const root = Assets.instantiate(id, { color: accentColor, side: side, accentColor: accentColor });
        if (!root) return null;
        root.userData = root.userData || {};
        root.userData.kind = 'hq';
        root.userData.side = side;
        root.userData.luncAssetSource = 'gltf';
        return root;
      } catch (_) {
        return null;
      }
    }

    function createFactionBase(side, accentColor) {
      const g = new THREE.Group();
      g.name = side < 0 ? 'bull-base' : 'bear-base';
      g.userData.side = side;
      g.userData.color = accentColor;
      const fm = factionMats(side, accentColor);
      registerFactionMats(fm);
      const bull = side < 0;
      const ox = side * 48;
      const toward = -side;

      const crates = [];
      const bags = [];
      const fences = [];
      const hogs = [];
      const drums = [];

      const peri = buildPerimeter(g, side, fm, crates, bags, fences, hogs);

      // Compound dirt pad
      addPad(g, ox, 0, 16, 22);

      let hq;
      if (bull) {
        // v9.3: optional GLB HQ when ready; else procedural command center
        const gltfHq = tryGltfHQ(side, accentColor);
        if (gltfHq) {
          hq = placeNamed(g, gltfHq, ox - 4, 0, 3.2, 3.4);
        } else {
          hq = placeNamed(g, buildBullCommand(fm, side), ox - 4, 0, 3.2, 3.4);
          if (global.LUNCBattle && LUNCBattle.assets && LUNCBattle.assets.markProceduralSpawn) {
            LUNCBattle.assets.markProceduralSpawn();
          }
        }
        placeNamed(g, buildBullBarracks(fm, side), ox - 2, 8.4, 2.8, 1.2);
        placeNamed(g, buildBullDepot(fm, side), ox - 2.2, -8.4, 2.4, 1.8);
        placeNamed(g, buildBullArty(fm, side), ox + 4.2, 12.2, 2.2, 2.2);
        placeNamed(g, buildBullSupply(fm, side), ox - 7, -4.1, 1.8, 1.3);
        placeNamed(g, buildBullRadar(fm, side), ox - 8, 5.6, 0.8, 0.8);
        placeNamed(g, buildBullComms(fm, side), ox - 7.4, 2.1, 1.1, 1.0);
        placeNamed(g, buildBullTower(fm, side), peri.frontX + 0.2, 13, 1.1, 1.1);
        placeNamed(g, buildBullTower(fm, side), peri.frontX + 0.2, -13, 1.1, 1.1);
        placeNamed(g, buildBullBunker(fm, side), peri.frontX + 0.6, 5.1, 1.4, 0.9, -0.12);
        placeNamed(g, buildBullBunker(fm, side), peri.frontX + 0.6, -5.1, 1.4, 0.9, -0.12);
        addPad(g, ox - 4, 0, 7.2, 7.0);
        addPad(g, ox - 2, 8.4, 6.2, 3.2);
        addPad(g, ox - 2.2, -8.4, 5.6, 4.2);
        addPad(g, ox + 4.2, 12.2, 5.0, 5.0);
      } else {
        const gltfHqB = tryGltfHQ(side, accentColor);
        if (gltfHqB) {
          hq = placeNamed(g, gltfHqB, ox + 3, 0, 3.5, 2.5);
        } else {
          hq = placeNamed(g, buildBearHQ(fm, side), ox + 3, 0, 3.5, 2.5);
          if (global.LUNCBattle && LUNCBattle.assets && LUNCBattle.assets.markProceduralSpawn) {
            LUNCBattle.assets.markProceduralSpawn();
          }
        }
        placeNamed(g, buildBearBarracks(fm, side), ox + 1.2, 8.5, 2.6, 1.4);
        placeNamed(g, buildBearHangar(fm, side), ox + 1.5, -8.5, 2.4, 2.1);
        placeNamed(g, buildBearArty(fm, side), ox - 4.0, -12.2, 2.0, 2.3);
        placeNamed(g, buildBearSupply(fm, side), ox + 7, -4.0, 1.9, 1.5);
        placeNamed(g, buildBearRadar(fm, side), ox + 8, 5.6, 0.8, 0.8);
        placeNamed(g, buildBearComms(fm, side), ox + 7.2, 2.0, 1.2, 1.1);
        placeNamed(g, buildBearTower(fm, side), peri.frontX - 0.2, 13, 1.2, 1.2);
        placeNamed(g, buildBearTower(fm, side), peri.frontX - 0.2, -13, 1.2, 1.2);
        placeNamed(g, buildBearBunker(fm, side), peri.frontX - 0.5, 5.2, 1.6, 1.1, -0.1);
        placeNamed(g, buildBearBunker(fm, side), peri.frontX - 0.5, -5.2, 1.6, 1.1, -0.1);
        addPad(g, ox + 3, 0, 8.2, 6.4);
        addPad(g, ox + 1.2, 8.5, 6.0, 3.4);
        addPad(g, ox + 1.5, -8.5, 5.6, 4.6);
        addPad(g, ox - 4.0, -12.2, 5.2, 5.4);
      }

      // Depot / hangar drums + crates (shared geo, instanced)
      const drumN = Math.max(1, Math.round((mobile ? 2 : 4) * structureDens));
      const depotZ = -8.4;
      for (let i = 0; i < drumN; i++) {
        const x = ox + toward * 1.2 + i * 0.45;
        const z = depotZ + (bull ? -2.1 : 2.2);
        drums.push({
          x: x, y: terrainHeight(x, z) + 0.38, z: z,
          sx: 0.28, sy: 0.76, sz: 0.28
        });
      }
      const crateN = Math.max(2, Math.round((mobile ? 3 : 7) * structureDens));
      for (let i = 0; i < crateN; i++) {
        const x = ox + toward * (2.2 + (i % 3) * 0.5);
        const z = (bull ? 12.2 : -12.2) + ((i % 2) ? 0.55 : -0.4);
        crates.push({
          x: x,
          y: terrainHeight(x, z) + 0.2 + Math.floor(i / 3) * 0.38,
          z: z,
          sx: 0.5, sy: 0.38, sz: 0.46,
          ry: i * 0.21
        });
      }
      // Extra sandbags at bunkers
      if (!mobile) {
        for (let i = 0; i < 6; i++) {
          const z = (i < 3 ? 5.1 : -5.1) + (i % 3 - 1) * 0.45;
          const x = peri.frontX - side * 1.1;
          bags.push({
            x: x, y: terrainHeight(x, z) + 0.2, z: z,
            sx: 0.8, sy: 0.3, sz: 0.4, ry: 0.1 * i
          });
        }
      }

      flushInstances(g, GEO.box, MAT.crate, crates, !mobile);
      flushInstances(g, GEO.box, MAT.sandbag, bags, !mobile);
      flushInstances(g, GEO.box, MAT.wood, fences, false);
      flushInstances(g, GEO.box, MAT.metalDark, hogs, !mobile);
      flushInstances(g, GEO.cyl6, MAT.drum, drums, !mobile);

      commandCenters[side] = hq;
      g.userData.buildings = buildings.filter(function (b) { return b.userData.side === side; });
      g.userData.accentColor = accentColor;
      bases.push(g);
      scene.add(g);
      return g;
    }

    function applyStructureLods(camera) {
      try {
        if (camera && global.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.updateStructuresLod) {
          LUNCBattle.lod.updateStructuresLod(buildings, camera);
        }
      } catch (_) {}
    }

    function updateStructures(dt, now) {
      for (let i = 0; i < radars.length; i++) {
        const r = radars[i];
        if (r && r.dish) r.dish.rotation.y += (r.speed || 0.45) * dt;
      }
      for (let i = 0; i < banners.length; i++) {
        const b = banners[i];
        if (!b || !b.mesh) continue;
        const t = now * 2.6 + b.phase;
        b.mesh.scale.x = 1 + Math.sin(t) * 0.07;
        b.mesh.rotation.z = Math.sin(t * 0.85) * 0.1;
      }
      for (let i = 0; i < blinkers.length; i++) {
        const k = blinkers[i];
        if (k && k.parent && k.parent.userData && k.parent.userData.lodSkipFx) continue;
        if (k && k.userData && k.userData.lodSkipFx) continue;
        if (!k || !k.mat) continue;
        if (k.mode === 'blink') {
          const on = Math.sin(now * 3.1 + k.phase) > 0.35;
          k.mat.emissiveIntensity = on ? 0.62 : 0.12;
        } else {
          k.mat.emissiveIntensity = 0.22 + Math.sin(now * 1.6 + k.phase) * 0.12;
        }
      }
    }

    function setDamageState(building, state) {
      if (!building || !building.userData) return;
      const s = String(state || 'HEALTHY').toUpperCase();
      building.userData.damageState = s;
      const d = building.userData.damagedMesh;
      const c = building.userData.criticalMesh;
      if (d) d.visible = s === 'DAMAGED' || s === 'CRITICAL';
      if (c) c.visible = s === 'CRITICAL';
    }

    function getCommandCenter(side) {
      return commandCenters[side] || commandCenters[String(side)] || null;
    }

    function setAccentColor(side, hex) {
      const list = accentBySide[String(side)] || [];
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m.color) m.color.setHex(hex);
        if (m.emissive) m.emissive.setHex(hex);
      }
    }

    function dispose() {
      for (let i = 0; i < bases.length; i++) {
        const g = bases[i];
        scene.remove(g);
        g.traverse(function (obj) {
          if (obj.geometry && ownedGeos.indexOf(obj.geometry) === -1 && obj.geometry.dispose) {
            obj.geometry.dispose();
          }
        });
      }
      bases.length = 0;
      buildings.length = 0;
      radars.length = 0;
      banners.length = 0;
      blinkers.length = 0;
      ownedGeos.forEach(function (geo) { if (geo && geo.dispose) geo.dispose(); });
      ownedMats.forEach(function (m) {
        if (!m) return;
        if (Mats && Mats.isShared && Mats.isShared(m)) return;
        if (Mats && Mats.dispose) Mats.dispose(m);
        else if (m.dispose) m.dispose();
      });
    }

    function getBuildings() {
      return buildings;
    }

    return {
      createFactionBase: createFactionBase,
      updateStructures: updateStructures,
      applyStructureLods: applyStructureLods,
      setDamageState: setDamageState,
      getCommandCenter: getCommandCenter,
      getBuildings: getBuildings,
      setAccentColor: setAccentColor,
      dispose: dispose,
      version: 'v9.4'
    };
  }

  global.LUNCBattle = global.LUNCBattle || {};
  global.LUNCBattle.structures = { createApi: createApi };
})(window);
