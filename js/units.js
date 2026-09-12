/* Unit builders / formations — v9.3 articulated RTS units + optional glTF instantiate */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;

  function createUnitsApi(ctx) {
    const { THREE, scene, terrainHeight, mat } = ctx;
    const Anim = (LB && LB.animations) || null;
    const STATES = (Anim && Anim.STATES) || {
      IDLE: 'IDLE', WALK: 'WALK', RUN: 'RUN', AIM: 'AIM', FIRE: 'FIRE',
      RELOAD: 'RELOAD', HIT: 'HIT', MOVE: 'MOVE', AIM_TURRET: 'AIM_TURRET', IDLE_SCAN: 'IDLE_SCAN'
    };

    // ---- Shared materials via LUNCBattle.materials registry (v9.2) ----
    const Mats = (LB && LB.materials) || null;
    if (Mats && Mats.init) Mats.init(THREE);
    const bodyMatBull = Mats ? Mats.get('unit.bodyBull') : mat(0x2a3a30, 0.78, 0.12);
    const bodyMatBear = Mats ? Mats.get('unit.bodyBear') : mat(0x2e2424, 0.78, 0.12);
    const clothMat = Mats ? Mats.get('unit.clothBull') : mat(0x1c241e, 0.92, 0.02);
    const clothMatBear = Mats ? Mats.get('unit.clothBear') : mat(0x241818, 0.92, 0.02);
    const darkMat = Mats ? Mats.get('unit.dark') : mat(0x121814, 0.7, 0.22);
    const metalMat = Mats ? Mats.get('unit.metal') : mat(0x3a4640, 0.42, 0.48);
    const metalMatDark = Mats ? Mats.get('unit.metalDark') : mat(0x222a26, 0.5, 0.55);
    const skinMat = Mats ? Mats.get('unit.skin') : mat(0xc4a07a, 0.88, 0.02);
    const trackMat = Mats ? Mats.get('unit.track') : mat(0x0e1210, 0.82, 0.18);
    // accent mats created per-faction color below via cache / registry
    const accentCache = {};
    function accentMat(color, emissiveBoost) {
      const key = color + '_' + (emissiveBoost || 0);
      if (!accentCache[key]) {
        accentCache[key] = Mats
          ? Mats.accent(color, emissiveBoost != null ? emissiveBoost : 0.07)
          : mat(color, 0.55, 0.2, color, emissiveBoost != null ? emissiveBoost : 0.07);
      }
      return accentCache[key];
    }

    // ---- Shared geometries (low segment counts) ----
    const GEO = {
      torsoCyl: new THREE.CylinderGeometry(0.2, 0.28, 0.58, 6),
      pelvisCyl: new THREE.CylinderGeometry(0.22, 0.24, 0.22, 6),
      headSphere: new THREE.SphereGeometry(0.15, 6, 5),
      helmCap: new THREE.SphereGeometry(0.17, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.55),
      helmRidge: new THREE.BoxGeometry(0.06, 0.08, 0.22),
      helmDisc: new THREE.CylinderGeometry(0.18, 0.19, 0.05, 7),
      upperArm: new THREE.CylinderGeometry(0.055, 0.062, 0.32, 5),
      lowerArm: new THREE.CylinderGeometry(0.045, 0.052, 0.28, 5),
      upperLeg: new THREE.CylinderGeometry(0.07, 0.078, 0.34, 5),
      lowerLeg: new THREE.CylinderGeometry(0.055, 0.065, 0.32, 5),
      weapon: new THREE.CylinderGeometry(0.028, 0.035, 0.68, 5),
      backpack: new THREE.BoxGeometry(0.28, 0.32, 0.14),
      boot: new THREE.BoxGeometry(0.12, 0.08, 0.18),
      bannerStub: new THREE.BoxGeometry(0.04, 0.28, 0.08),
      // armor
      hullMain: new THREE.BoxGeometry(1.55, 0.52, 1.05),
      hullBevel: new THREE.BoxGeometry(1.35, 0.22, 0.95),
      hullSkirt: new THREE.BoxGeometry(1.7, 0.16, 1.15),
      turretCyl: new THREE.CylinderGeometry(0.32, 0.42, 0.34, 7),
      turretBox: new THREE.BoxGeometry(0.72, 0.28, 0.62),
      turretBear: new THREE.CylinderGeometry(0.28, 0.48, 0.38, 6),
      cannon: new THREE.CylinderGeometry(0.055, 0.07, 1.15, 6),
      wheel: new THREE.CylinderGeometry(0.16, 0.16, 0.14, 7),
      trackBlock: new THREE.BoxGeometry(0.38, 0.14, 0.12),
      snorkel: new THREE.CylinderGeometry(0.03, 0.035, 0.55, 5),
      antenna: new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4),
      // artillery
      carriage: new THREE.BoxGeometry(0.95, 0.28, 0.7),
      carriageSide: new THREE.BoxGeometry(0.12, 0.35, 0.85),
      artyWheel: new THREE.CylinderGeometry(0.32, 0.32, 0.14, 8),
      barrelLong: new THREE.CylinderGeometry(0.07, 0.095, 1.65, 6),
      trailLeg: new THREE.CylinderGeometry(0.045, 0.055, 1.05, 5),
      trailFoot: new THREE.BoxGeometry(0.16, 0.08, 0.22),
      shield: new THREE.BoxGeometry(0.08, 0.45, 0.55),
      shadowInf: new THREE.CircleGeometry(0.38, 12),
      shadowArmor: new THREE.CircleGeometry(0.72, 12),
      shadowArt: new THREE.CircleGeometry(0.58, 12)
    };

    const shadowMat = (Mats && Mats.basic)
      ? Mats.basic({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false })
      : new THREE.MeshBasicMaterial({
          color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false
        });

    function setShadow(mesh, cast) {
      cast = cast !== false;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      return mesh;
    }

    function meshFrom(geo, material) {
      return setShadow(new THREE.Mesh(geo, material));
    }

    function limbGroup(upperGeo, lowerGeo, matU, matL, upperLen) {
      const g = new THREE.Group();
      const upper = meshFrom(upperGeo, matU);
      upper.position.y = -upperLen * 0.5;
      g.add(upper);
      const lower = new THREE.Group();
      lower.position.y = -upperLen;
      const lowerMesh = meshFrom(lowerGeo, matL);
      const lowerLen = lowerGeo.parameters ? lowerGeo.parameters.height : 0.3;
      lowerMesh.position.y = -(lowerLen || 0.3) * 0.5;
      lower.add(lowerMesh);
      g.add(lower);
      g.userData.upper = upper;
      g.userData.lower = lower;
      return { group: g, upper: upper, lower: lower, lowerMesh: lowerMesh };
    }

    function createInfantry(color, side) {
      const g = new THREE.Group();
      const isBull = side < 0;
      const accent = accentMat(color, isBull ? 0.08 : 0.1);
      const body = isBull ? bodyMatBull : bodyMatBear;
      const cloth = isBull ? clothMat : clothMatBear;
      const parts = {};

      // Hips / pelvis
      const hips = new THREE.Group();
      const pelvis = meshFrom(GEO.pelvisCyl, body);
      pelvis.position.y = 0;
      hips.add(pelvis);
      hips.position.y = 0.42;
      hips.userData.baseY = 0.42;
      parts.hips = hips;
      parts.pelvis = pelvis;

      // Legs (pivot at hips)
      const L_leg = limbGroup(GEO.upperLeg, GEO.lowerLeg, cloth, darkMat, 0.34);
      L_leg.group.position.set(-0.11, 0, 0);
      const R_leg = limbGroup(GEO.upperLeg, GEO.lowerLeg, cloth, darkMat, 0.34);
      R_leg.group.position.set(0.11, 0, 0);
      const L_boot = meshFrom(GEO.boot, darkMat);
      L_boot.position.set(0, -0.34, 0.02);
      L_leg.lower.add(L_boot);
      const R_boot = meshFrom(GEO.boot, darkMat);
      R_boot.position.set(0, -0.34, 0.02);
      R_leg.lower.add(R_boot);
      hips.add(L_leg.group, R_leg.group);
      parts.L_upperLeg = L_leg.group;
      parts.R_upperLeg = R_leg.group;
      parts.L_lowerLeg = L_leg.lower;
      parts.R_lowerLeg = R_leg.lower;

      // Torso
      const torso = new THREE.Group();
      const torsoMesh = meshFrom(GEO.torsoCyl, accent);
      torsoMesh.position.y = 0.29;
      torso.add(torsoMesh);
      // chest plate taper feel
      const chest = meshFrom(GEO.pelvisCyl, body);
      chest.scale.set(0.95, 0.7, 0.85);
      chest.position.y = 0.48;
      torso.add(chest);
      torso.position.y = 0.72;
      torso.userData.baseY = 0.72;
      parts.torso = torso;

      // Head + helmet
      const headG = new THREE.Group();
      const head = meshFrom(GEO.headSphere, skinMat);
      head.position.y = 0;
      headG.add(head);
      const helm = meshFrom(GEO.helmCap, metalMat);
      helm.position.y = 0.04;
      headG.add(helm);
      const helmDisc = meshFrom(GEO.helmDisc, isBull ? metalMat : metalMatDark);
      helmDisc.position.y = 0.02;
      headG.add(helmDisc);
      if (!isBull) {
        // Bear: taller ridge
        const ridge = meshFrom(GEO.helmRidge, accent);
        ridge.position.set(0, 0.14, 0);
        headG.add(ridge);
        const stub = meshFrom(GEO.bannerStub, accent);
        stub.position.set(0.02, 0.22, -0.12);
        headG.add(stub);
      } else {
        const ridge = meshFrom(GEO.helmRidge, accent);
        ridge.scale.set(1, 0.6, 0.8);
        ridge.position.set(0, 0.12, 0);
        headG.add(ridge);
      }
      headG.position.y = 0.72;
      torso.add(headG);
      parts.head = headG;
      parts.helmet = helm;

      // Arms
      const L_arm = limbGroup(GEO.upperArm, GEO.lowerArm, accent, body, 0.32);
      L_arm.group.position.set(-0.3, 0.48, 0);
      const R_arm = limbGroup(GEO.upperArm, GEO.lowerArm, accent, body, 0.32);
      R_arm.group.position.set(0.3, 0.48, 0);
      torso.add(L_arm.group, R_arm.group);
      parts.L_upperArm = L_arm.group;
      parts.R_upperArm = R_arm.group;
      parts.L_lowerArm = L_arm.lower;
      parts.R_lowerArm = R_arm.lower;

      // Weapon in right hand-ish
      const weapon = meshFrom(GEO.weapon, metalMat);
      weapon.rotation.x = Math.PI / 2;
      weapon.position.set(0.02, -0.2, 0.22);
      weapon.userData.baseZ = 0.22;
      R_arm.lower.add(weapon);
      parts.weapon = weapon;

      // Optional backpack
      if (isBull || Math.random() > 0.35) {
        const pack = meshFrom(GEO.backpack, darkMat);
        pack.position.set(0, 0.28, -0.2);
        torso.add(pack);
        parts.backpack = pack;
      }

      g.add(hips, torso);

      const muzzleOffset = new THREE.Vector3(side * 0.15, 1.05, 0.55);
      g.userData = {
        type: 0,
        side: side,
        phase: Math.random() * Math.PI * 2,
        shot: Math.random() * 3,
        animState: STATES.IDLE,
        parts: parts,
        speed: 0,
        facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        weaponRef: weapon,
        muzzleOffset: muzzleOffset,
        weapon: weapon,
        rootBob: 0
      };
      g.scale.setScalar(0.95);
      return g;
    }

    function createArmor(color, side) {
      const g = new THREE.Group();
      const isBull = side < 0;
      const accent = accentMat(color, 0.08);
      const parts = {};

      const hullG = new THREE.Group();
      const hull = meshFrom(GEO.hullMain, accent);
      hull.position.y = 0.52;
      const bevel = meshFrom(GEO.hullBevel, bodyMatBull);
      bevel.material = isBull ? bodyMatBull : bodyMatBear;
      bevel.position.y = 0.78;
      const skirt = meshFrom(GEO.hullSkirt, darkMat);
      skirt.position.y = 0.32;
      if (!isBull) skirt.scale.set(1.05, 1.15, 1.08);
      hullG.add(hull, bevel, skirt);
      parts.hull = hullG;

      // Tracks / wheels L/R
      const wheels = [];
      const tracks = [];
      [-0.52, 0.52].forEach(function (z) {
        const trackRow = meshFrom(GEO.trackBlock, trackMat);
        trackRow.scale.set(4.2, 1, 1);
        trackRow.position.set(0, 0.2, z);
        trackRow.userData.baseY = 0.2;
        hullG.add(trackRow);
        tracks.push(trackRow);
        [-0.55, -0.18, 0.18, 0.55].forEach(function (x, i) {
          const w = meshFrom(GEO.wheel, trackMat);
          w.rotation.z = Math.PI / 2;
          w.position.set(x, 0.22, z);
          hullG.add(w);
          wheels.push(w);
        });
      });
      parts.wheels = wheels;
      parts.tracks = tracks;

      // Turret group (rotates)
      const turret = new THREE.Group();
      turret.position.y = 0.92;
      let turretMesh;
      if (isBull) {
        turretMesh = meshFrom(GEO.turretCyl, accent);
        const lid = meshFrom(GEO.turretBox, metalMat);
        lid.position.y = 0.2;
        lid.scale.set(0.85, 0.7, 0.9);
        turret.add(turretMesh, lid);
        const ant = meshFrom(GEO.antenna, metalMatDark);
        ant.position.set(-0.2, 0.45, -0.15);
        turret.add(ant);
      } else {
        turretMesh = meshFrom(GEO.turretBear, accent);
        const cupola = meshFrom(GEO.turretBox, metalMatDark);
        cupola.position.y = 0.22;
        cupola.scale.set(0.7, 0.85, 0.75);
        turret.add(turretMesh, cupola);
        const snorkel = meshFrom(GEO.snorkel, metalMat);
        snorkel.position.set(0.15, 0.4, -0.25);
        turret.add(snorkel);
      }
      parts.turret = turret;

      // Cannon group (recoil on z)
      const cannonG = new THREE.Group();
      const cannon = meshFrom(GEO.cannon, metalMat);
      cannon.rotation.x = Math.PI / 2;
      cannon.position.z = 0.55;
      cannon.userData.baseZ = 0.55;
      cannonG.add(cannon);
      cannonG.position.y = 0.05;
      turret.add(cannonG);
      parts.cannon = cannon;

      g.add(hullG, turret);

      g.userData = {
        type: 1,
        side: side,
        phase: Math.random() * Math.PI * 2,
        shot: Math.random() * 4,
        animState: STATES.IDLE_SCAN,
        parts: parts,
        speed: 0,
        facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        weaponRef: cannon,
        weapon: cannon,
        trackPhase: Math.random() * Math.PI * 2,
        muzzleOffset: new THREE.Vector3(0, 1.0, 1.1),
        rootBob: 0,
        recoil: 0
      };
      return g;
    }

    function createArtillery(color, side) {
      const g = new THREE.Group();
      const isBull = side < 0;
      const accent = accentMat(color, 0.06);
      const body = isBull ? bodyMatBull : bodyMatBear;
      const parts = {};

      const carriage = new THREE.Group();
      const base = meshFrom(GEO.carriage, darkMat);
      base.position.y = 0.38;
      const sideL = meshFrom(GEO.carriageSide, body);
      sideL.position.set(0, 0.45, 0.32);
      const sideR = meshFrom(GEO.carriageSide, body);
      sideR.position.set(0, 0.45, -0.32);
      const shield = meshFrom(GEO.shield, accent);
      shield.position.set(0.35, 0.62, 0);
      carriage.add(base, sideL, sideR, shield);
      parts.carriage = carriage;

      const wheels = [];
      [-0.42, 0.42].forEach(function (z) {
        const w = meshFrom(GEO.artyWheel, trackMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(0.05, 0.32, z);
        carriage.add(w);
        wheels.push(w);
      });
      parts.wheels = wheels;

      // Trail legs (rear)
      const trail1 = meshFrom(GEO.trailLeg, darkMat);
      trail1.rotation.z = Math.PI / 2;
      trail1.rotation.y = 0.35;
      trail1.position.set(-0.55, 0.2, 0.28);
      const trail2 = meshFrom(GEO.trailLeg, darkMat);
      trail2.rotation.z = Math.PI / 2;
      trail2.rotation.y = -0.35;
      trail2.position.set(-0.55, 0.2, -0.28);
      const foot1 = meshFrom(GEO.trailFoot, metalMatDark);
      foot1.position.set(-1.05, 0.06, 0.42);
      const foot2 = meshFrom(GEO.trailFoot, metalMatDark);
      foot2.position.set(-1.05, 0.06, -0.42);
      carriage.add(trail1, trail2, foot1, foot2);
      parts.trails = [trail1, trail2];

      // Barrel group — elevate (rotation.x) + recoil (position.z)
      const barrelG = new THREE.Group();
      barrelG.position.set(0.15, 0.72, 0);
      barrelG.rotation.x = -0.22;
      barrelG.userData.baseElev = -0.22;
      barrelG.userData.baseZ = 0;
      const barrelMesh = meshFrom(GEO.barrelLong, metalMat);
      barrelMesh.rotation.x = Math.PI / 2;
      barrelMesh.position.z = 0.7;
      barrelG.add(barrelMesh);
      const breech = meshFrom(GEO.carriage, accent);
      breech.scale.set(0.35, 0.55, 0.4);
      breech.position.set(-0.15, 0, 0);
      barrelG.add(breech);
      parts.barrel = barrelG;

      g.add(carriage, barrelG);

      // Scale up slightly — distinctly larger than infantry
      g.scale.setScalar(1.15);

      g.userData = {
        type: 2,
        side: side,
        phase: Math.random() * Math.PI * 2,
        shot: Math.random() * 5,
        animState: STATES.IDLE,
        parts: parts,
        speed: 0,
        facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        weaponRef: barrelMesh,
        weapon: barrelMesh,
        muzzleOffset: new THREE.Vector3(0, 1.1, 1.4),
        rootBob: 0,
        recoil: 0
      };
      return g;
    }

    function createUnit(color, side, type) {
      // v9.3: prefer GLB when asset pipeline has it ready; else procedural SAFE FALLBACK
      let g = null;
      const Assets = (LB && LB.assets) || null;
      const Reg = (LB && LB.assetRegistry) || null;
      const assetId = Reg && Reg.unitIdFromSideType
        ? Reg.unitIdFromSideType(side, type)
        : null;
      if (Assets && assetId && Assets.shouldUseGltf && Assets.shouldUseGltf(assetId)) {
        try {
          g = Assets.instantiate(assetId, { color: color, side: side, type: type, accentColor: color });
        } catch (e) {
          g = null;
        }
      }
      if (!g) {
        g = type === 0 ? createInfantry(color, side)
          : type === 1 ? createArmor(color, side)
          : createArtillery(color, side);
        g.userData = g.userData || {};
        g.userData.luncAssetSource = 'procedural';
        g.userData.luncProcedural = true;
        if (Assets && Assets.markProceduralSpawn) Assets.markProceduralSpawn();
      }
      const shadowGeo = type === 1 ? GEO.shadowArmor : type === 2 ? GEO.shadowArt : GEO.shadowInf;
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.02;
      shadow.receiveShadow = false;
      shadow.castShadow = false;
      g.add(shadow);
      g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(g);
      return g;
    }

    function formationSlots(count, side, type) {
      const slots = [];
      const cols = type === 0 ? 8 : 5;
      const spacingZ = type === 0 ? 2.25 : 3.5;
      const spacingX = type === 0 ? 1.95 : 3.35;
      const back = type === 0 ? 8.6 : type === 1 ? 15 : 21;
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        // Deterministic jitter from index (no Math.random — stable formations)
        const jx = ((i * 17) % 7) * 0.04 - 0.12;
        const jz = ((i * 13) % 5) * 0.05 - 0.1;
        const z = (col - (cols - 1) / 2) * spacingZ + (row % 2 ? spacingZ * 0.5 : 0) + jz;
        const x = side * (back + row * spacingX) + jx * side;
        slots.push({ x: x, z: z });
      }
      return slots;
    }

    function disposeArmy(arr) {
      arr.forEach(function (u) { scene.remove(u); });
      arr.length = 0;
    }

    function spawnFormation(side, color, counts, list) {
      [[0, counts.inf], [1, counts.armor], [2, counts.art]].forEach(function (pair) {
        const type = pair[0];
        const n = pair[1];
        const slots = formationSlots(n, side, type);
        slots.forEach(function (s, i) {
          const u = createUnit(color, side, type);
          u.position.set(s.x, terrainHeight(s.x, s.z), s.z);
          u.userData.home = s;
          u.userData.index = i;
          list.push(u);
        });
      });
    }

    function setAnimState(u, state, now) {
      if (Anim && Anim.setAnimState) Anim.setAnimState(u, state, now);
      else u.userData.animState = state;
    }

    function tickUnit(u, dt, now, tickCtx) {
      tickCtx = tickCtx || {};
      // Inject quality LOD hooks when not provided by caller
      if (tickCtx.lodBand == null && global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getLodBand) {
        try {
          const cam = tickCtx.cameraPos;
          if (cam && u.position) {
            const dx = u.position.x - cam.x;
            const dz = u.position.z - cam.z;
            tickCtx.lodBand = LUNCBattle.quality.getLodBand(Math.sqrt(dx * dx + dz * dz));
          }
        } catch (_) {}
      }
      if (!tickCtx.animComplexity && global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset) {
        try {
          const p = LUNCBattle.quality.getEffectivePreset();
          tickCtx.animComplexity = p.animComplexity;
          tickCtx.unitUpdateDivisor = p.unitUpdateDivisor;
        } catch (_) {}
      }
      if (Anim && Anim.tickUnit) Anim.tickUnit(u, dt, now, tickCtx);
    }

    return {
      createInfantry: createInfantry,
      createArmor: createArmor,
      createArtillery: createArtillery,
      createUnit: createUnit,
      formationSlots: formationSlots,
      disposeArmy: disposeArmy,
      spawnFormation: spawnFormation,
      setShadow: setShadow,
      setAnimState: setAnimState,
      tickUnit: tickUnit,
      GEO: GEO,
      version: 'v9.3'
    };
  }

  LB.units = { createApi: createUnitsApi };
})(window);
