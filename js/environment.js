/* LUNC Battlefield v9.4 — battlefield environment props + LOD (materials registry) */
(function (global) {
  'use strict';

  function seededRand(seed) {
    const x = Math.sin(seed * 999.11) * 43758.5453123;
    return x - Math.floor(x);
  }

  function blockedSpot(x, z) {
    // Central road strip |x|<5 or base keep zones |x|>42 && |z|<14
    if (Math.abs(x) < 5) return true;
    if (Math.abs(x) > 42 && Math.abs(z) < 14) return true;
    return false;
  }

  function createEnvironment(opts) {
    const THREE = opts.THREE;
    const scene = opts.scene;
    const terrainHeight = opts.terrainHeight;
    const mobile = !!opts.mobile;
    const Mats = (global.LUNCBattle && LUNCBattle.materials) || null;
    if (Mats && Mats.init) Mats.init(THREE);
    const matFn = opts.mat || (Mats && Mats.mat) || function (color, rough, metal) {
      return new THREE.MeshStandardMaterial({
        color: color,
        roughness: rough == null ? 0.9 : rough,
        metalness: metal == null ? 0.05 : metal
      });
    };

    // v8.8 quality density (graphics-only)
    let dens = 1;
    let vegDens = 1;
    let shadowCastMode = 'rich';
    try {
      if (opts.densityScale != null) dens = +opts.densityScale;
      else if (global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getDensityScale) {
        const ds = LUNCBattle.quality.getDensityScale();
        dens = ds.env != null ? ds.env : 1;
        vegDens = ds.vegetation != null ? ds.vegetation : dens;
      }
      if (opts.vegetationDensity != null) vegDens = +opts.vegetationDensity;
      if (opts.shadowCast) shadowCastMode = opts.shadowCast;
      else if (global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset) {
        shadowCastMode = LUNCBattle.quality.getEffectivePreset().shadowCast || shadowCastMode;
      }
    } catch (_) {}
    if (!(dens > 0)) dens = 1;
    if (!(vegDens > 0)) vegDens = dens;
    const allowPropShadow = shadowCastMode === 'rich' || shadowCastMode === 'bases';
    const allowMinorShadow = shadowCastMode === 'rich';

    const scale = (mobile ? 0.55 : 1) * dens;
    const group = new THREE.Group();
    group.name = 'environment-v81';

    function tagEnv(obj, kind) {
      if (!obj) return obj;
      obj.userData = obj.userData || {};
      obj.userData.envKind = kind;
      obj.userData.lodBand = 0;
      return obj;
    }

    const rockMat = Mats ? Mats.get('prop.rock') : matFn(0x4a4b3d, 0.95, 0.02);
    const rockMatB = Mats ? Mats.get('prop.rockB') : matFn(0x5c5e4f, 0.92, 0.03);
    const trunkMat = Mats ? Mats.get('prop.trunk') : matFn(0x4b3827, 1, 0.01);
    const deadTrunkMat = Mats ? Mats.get('prop.deadTrunk') : matFn(0x3a3228, 0.98, 0.02);
    const foliageMat = Mats ? Mats.get('prop.foliage') : matFn(0x2a4528, 1, 0);
    const foliageMatB = Mats ? Mats.get('prop.foliageB') : matFn(0x355534, 0.98, 0);
    const bushMat = Mats ? Mats.get('prop.bush') : matFn(0x243b24, 1, 0);
    const rubbleMat = Mats ? Mats.get('prop.rubble') : matFn(0x55564a, 0.94, 0.04);
    const woodMat = Mats ? Mats.get('prop.wood') : matFn(0x493625, 0.9, 0.01);
    const sandbagMat = Mats ? Mats.get('prop.sandbag') : matFn(0x6a5a3e, 0.98, 0.02);
    const crateMat = Mats ? Mats.get('prop.crate') : matFn(0x5a442e, 0.88, 0.04);
    const scorchedMat = Mats
      ? Mats.get('prop.scorched')
      : new THREE.MeshStandardMaterial({
          color: 0x141210,
          roughness: 1,
          transparent: true,
          opacity: 0.45,
          depthWrite: false
        });
    // Ambient haze smoke stays MeshBasic (hot/cheap FX path — not PBR)
    const smokeMat = (Mats && Mats.basic)
      ? Mats.basic({
          color: 0x8a8678,
          transparent: true,
          opacity: 0.14,
          depthWrite: false
        })
      : new THREE.MeshBasicMaterial({
          color: 0x8a8678,
          transparent: true,
          opacity: 0.14,
          depthWrite: false
        });

    const counts = {
      rocks: Math.max(4, Math.round(42 * scale)),
      trees: Math.max(3, Math.round(28 * scale * (vegDens / Math.max(dens, 0.01)))),
      deadTrees: Math.max(2, Math.round(12 * scale * (vegDens / Math.max(dens, 0.01)))),
      bushes: Math.max(4, Math.round(36 * scale * (vegDens / Math.max(dens, 0.01)))),
      ruins: Math.max(2, Math.round(8 * scale)),
      barricades: Math.max(2, Math.round(10 * scale)),
      fences: Math.max(2, Math.round(16 * scale)),
      equipment: Math.max(1, Math.round(8 * scale)),
      scorched: Math.max(2, Math.round(10 * scale)),
      smoke: Math.max(1, Math.round((mobile ? 3 : 6) * dens))
    };
    const dummy = new THREE.Object3D();

    function placeY(x, z, lift) {
      return terrainHeight(x, z) + (lift || 0);
    }

    function tryPos(seed, xSpan, zSpan) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const x = (seededRand(seed + attempt * 17) - 0.5) * xSpan;
        const z = (seededRand(seed + attempt * 31 + 3) - 0.5) * zSpan;
        if (!blockedSpot(x, z)) return { x: x, z: z };
      }
      return null;
    }

    // ---- Rocks (v8.8 InstancedMesh — shared unit geos, per-instance scale) ----
    let rockPlaced = 0;
    const rockItemsA = [];
    const rockItemsB = [];
    for (let i = 0; i < counts.rocks * 2 && rockPlaced < counts.rocks; i++) {
      const p = tryPos(i + 40, 124, 72);
      if (!p) continue;
      const h = terrainHeight(p.x, p.z);
      const hillBias = seededRand(i + 120);
      if (h < 0.35 && hillBias > 0.35) continue;
      const useIcosa = seededRand(i + 200) > 0.55;
      const s = 0.22 + seededRand(i + 250) * 0.75;
      const item = {
        x: p.x,
        y: placeY(p.x, p.z, s * 0.35),
        z: p.z,
        sx: s * (1.25 + seededRand(i + 300) * 0.4),
        sy: s * (0.65 + seededRand(i + 320) * 0.5),
        sz: s * 1.05,
        rx: seededRand(i + 340) * 0.4,
        ry: seededRand(i + 360) * Math.PI,
        rz: seededRand(i + 380) * 0.3
      };
      if (useIcosa) rockItemsA.push(item); else rockItemsB.push(item);
      rockPlaced++;
    }
    function addRockInstances(items, geo, material) {
      if (!items.length) return;
      const mesh = new THREE.InstancedMesh(geo, material, items.length);
      mesh.castShadow = allowMinorShadow;
      mesh.receiveShadow = true;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.rx, it.ry, it.rz);
        dummy.scale.set(it.sx, it.sy, it.sz);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
    addRockInstances(rockItemsA, new THREE.IcosahedronGeometry(1, 0), rockMat);
    addRockInstances(rockItemsB, new THREE.DodecahedronGeometry(1, 0), rockMatB);

    // ---- Living trees (trunk + 2–3 foliage blobs) ----
    let treePlaced = 0;
    for (let i = 0; i < counts.trees * 2 && treePlaced < counts.trees; i++) {
      const p = tryPos(i + 500, 118, 68);
      if (!p) continue;
      if (Math.abs(p.x) < 10) continue;
      const tree = new THREE.Group();
      const trunkH = 0.85 + seededRand(i + 520) * 0.55;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.14, trunkH, 6),
        trunkMat
      );
      trunk.position.y = trunkH * 0.5;
      trunk.castShadow = allowPropShadow;
      tree.add(trunk);

      const blobCount = 2 + (seededRand(i + 540) > 0.45 ? 1 : 0);
      for (let b = 0; b < blobCount; b++) {
        const br = 0.32 + seededRand(i * 3 + b + 560) * 0.28;
        const blob = new THREE.Mesh(
          new THREE.SphereGeometry(br, 6, 5),
          seededRand(i + b + 580) > 0.5 ? foliageMat : foliageMatB
        );
        blob.position.set(
          (seededRand(i + b + 600) - 0.5) * 0.35,
          trunkH * 0.75 + b * 0.28 + seededRand(i + b + 620) * 0.15,
          (seededRand(i + b + 640) - 0.5) * 0.35
        );
        blob.scale.set(1.15, 0.85 + seededRand(i + b + 660) * 0.35, 1.1);
        blob.castShadow = allowMinorShadow;
        tree.add(blob);
      }
      const sc = 0.75 + seededRand(i + 680) * 0.7;
      tree.scale.setScalar(sc);
      tree.rotation.y = seededRand(i + 700) * Math.PI;
      tree.position.set(p.x, placeY(p.x, p.z, 0), p.z);
      group.add(tree);
      treePlaced++;
    }

    // ---- Dead trees (bare branching cylinders) ----
    let deadPlaced = 0;
    for (let i = 0; i < counts.deadTrees * 2 && deadPlaced < counts.deadTrees; i++) {
      const p = tryPos(i + 900, 110, 64);
      if (!p) continue;
      const dead = new THREE.Group();
      const th = 1.1 + seededRand(i + 920) * 0.7;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.11, th, 5),
        deadTrunkMat
      );
      trunk.position.y = th * 0.5;
      trunk.castShadow = allowPropShadow;
      dead.add(trunk);
      const branches = 2 + Math.floor(seededRand(i + 940) * 3);
      for (let b = 0; b < branches; b++) {
        const bl = 0.35 + seededRand(i + b + 960) * 0.45;
        const branch = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.04, bl, 4),
          deadTrunkMat
        );
        branch.position.set(0, th * (0.45 + seededRand(i + b + 980) * 0.4), 0);
        branch.rotation.z = (seededRand(i + b + 1000) - 0.5) * 1.4;
        branch.rotation.y = seededRand(i + b + 1020) * Math.PI * 2;
        branch.translateY(bl * 0.35);
        branch.castShadow = allowMinorShadow && !mobile;
        dead.add(branch);
      }
      dead.scale.setScalar(0.7 + seededRand(i + 1040) * 0.55);
      dead.rotation.y = seededRand(i + 1060) * Math.PI;
      dead.position.set(p.x, placeY(p.x, p.z, 0), p.z);
      group.add(dead);
      deadPlaced++;
    }

    // ---- Bushes / shrubs ----
    let bushPlaced = 0;
    for (let i = 0; i < counts.bushes * 2 && bushPlaced < counts.bushes; i++) {
      const p = tryPos(i + 1200, 120, 70);
      if (!p) continue;
      const bush = new THREE.Group();
      const n = 2 + Math.floor(seededRand(i + 1220) * 2);
      for (let b = 0; b < n; b++) {
        const r = 0.22 + seededRand(i + b + 1240) * 0.22;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 5, 4), bushMat);
        m.position.set(
          (seededRand(i + b + 1260) - 0.5) * 0.35,
          r * 0.55,
          (seededRand(i + b + 1280) - 0.5) * 0.35
        );
        m.scale.y = 0.7;
        if (allowMinorShadow && !mobile) m.castShadow = true;
        bush.add(m);
      }
      bush.position.set(p.x, placeY(p.x, p.z, 0), p.z);
      bush.scale.setScalar(0.8 + seededRand(i + 1300) * 0.6);
      group.add(bush);
      bushPlaced++;
    }

    // ---- Ruined wall fragments / rubble near midfield flanks ----
    let ruinPlaced = 0;
    for (let i = 0; i < counts.ruins * 3 && ruinPlaced < counts.ruins; i++) {
      const flank = seededRand(i + 1400) > 0.5 ? 1 : -1;
      const x = flank * (14 + seededRand(i + 1420) * 18);
      const z = (seededRand(i + 1440) - 0.5) * 52;
      if (blockedSpot(x, z) || Math.abs(x) < 8) continue;
      const ruin = new THREE.Group();
      const w = 1.2 + seededRand(i + 1460) * 1.8;
      const h = 0.55 + seededRand(i + 1480) * 0.9;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.35), rubbleMat);
      wall.position.y = h * 0.5;
      wall.rotation.y = (seededRand(i + 1500) - 0.5) * 0.6;
      wall.castShadow = true;
      wall.receiveShadow = true;
      ruin.add(wall);
      // Rubble pile
      for (let r = 0; r < 3; r++) {
        const chunk = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.12 + seededRand(i + r + 1520) * 0.18, 0),
          rubbleMat
        );
        chunk.position.set(
          (seededRand(i + r + 1540) - 0.5) * w,
          0.1,
          0.3 + seededRand(i + r + 1560) * 0.4
        );
        chunk.castShadow = !mobile;
        ruin.add(chunk);
      }
      ruin.position.set(x, placeY(x, z, 0), z);
      group.add(ruin);
      ruinPlaced++;
    }

    // ---- Wooden barricades / sandbag mounds near frontline trenches ----
    let barPlaced = 0;
    for (let i = 0; i < counts.barricades * 2 && barPlaced < counts.barricades; i++) {
      const side = seededRand(i + 1600) > 0.5 ? 1 : -1;
      const x = side * (3.2 + seededRand(i + 1620) * 3.2); // near trenches ±3..±6
      const z = (seededRand(i + 1640) - 0.5) * 48;
      if (Math.abs(x) < 2.5 || Math.abs(z) < 2) continue;
      if (Math.abs(x) > 42 && Math.abs(z) < 14) continue;
      const bag = new THREE.Group();
      if (seededRand(i + 1660) > 0.4) {
        // Sandbag-like elongated mounds (BoxGeometry — r128-safe)
        const mound = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.55), sandbagMat);
        mound.position.y = 0.28;
        mound.castShadow = true;
        mound.receiveShadow = true;
        bag.add(mound);
        const mound2 = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.38, 0.48), sandbagMat);
        mound2.position.set(0.05, 0.55, 0.02);
        mound2.rotation.y = 0.12;
        mound2.castShadow = true;
        mound2.receiveShadow = true;
        bag.add(mound2);
      } else {
        // Wooden barricade
        for (let pl = 0; pl < 3; pl++) {
          const plank = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.12, 0.22),
            woodMat
          );
          plank.position.set(0, 0.25 + pl * 0.22, 0);
          plank.rotation.z = (seededRand(i + pl + 1680) - 0.5) * 0.15;
          plank.castShadow = true;
          bag.add(plank);
        }
        const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.9, 5), woodMat);
        const postR = postL.clone();
        postL.position.set(-0.7, 0.45, 0);
        postR.position.set(0.7, 0.45, 0);
        bag.add(postL, postR);
      }
      bag.rotation.y = Math.PI / 2 + (seededRand(i + 1700) - 0.5) * 0.35;
      bag.position.set(x, placeY(x, z, 0), z);
      group.add(bag);
      barPlaced++;
    }

    // ---- Fence posts (v8.8 InstancedMesh) ----
    let fencePlaced = 0;
    const fencePosts = [];
    const fenceRails = [];
    for (let i = 0; i < counts.fences * 2 && fencePlaced < counts.fences; i++) {
      const p = tryPos(i + 1800, 100, 60);
      if (!p) continue;
      if (Math.abs(p.x) < 12) continue;
      fencePosts.push({ x: p.x, y: placeY(p.x, p.z, 0.48), z: p.z });
      if (seededRand(i + 1820) > 0.55) {
        fenceRails.push({ x: p.x + 0.5, y: placeY(p.x, p.z, 0.55), z: p.z });
      }
      fencePlaced++;
    }
    if (fencePosts.length) {
      const postMesh = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.05, 0.07, 0.95, 5), woodMat, fencePosts.length
      );
      postMesh.castShadow = allowMinorShadow && !mobile;
      postMesh.receiveShadow = true;
      for (let i = 0; i < fencePosts.length; i++) {
        const it = fencePosts[i];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        postMesh.setMatrixAt(i, dummy.matrix);
      }
      postMesh.instanceMatrix.needsUpdate = true;
      group.add(postMesh);
    }
    if (fenceRails.length) {
      const railMesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1.1, 0.06, 0.08), woodMat, fenceRails.length
      );
      railMesh.castShadow = allowMinorShadow && !mobile;
      for (let i = 0; i < fenceRails.length; i++) {
        const it = fenceRails[i];
        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        railMesh.setMatrixAt(i, dummy.matrix);
      }
      railMesh.instanceMatrix.needsUpdate = true;
      group.add(railMesh);
    }

    // ---- Abandoned equipment: cart / wheel / crate stacks ----
    let eqPlaced = 0;
    for (let i = 0; i < counts.equipment * 2 && eqPlaced < counts.equipment; i++) {
      const p = tryPos(i + 2000, 96, 56);
      if (!p) continue;
      if (Math.abs(p.x) < 14) continue;
      const eq = new THREE.Group();
      const kind = Math.floor(seededRand(i + 2020) * 3);
      if (kind === 0) {
        // Wrecked cart silhouette
        const bed = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.85), woodMat);
        bed.position.y = 0.45;
        bed.rotation.z = 0.18;
        eq.add(bed);
        const wheel = new THREE.Mesh(
          new THREE.TorusGeometry(0.32, 0.06, 6, 12),
          matFn(0x3a342c, 0.9, 0.08)
        );
        wheel.position.set(0.5, 0.32, 0.5);
        wheel.rotation.y = Math.PI / 2;
        eq.add(wheel);
        const wheel2 = wheel.clone();
        wheel2.position.set(-0.35, 0.12, -0.4);
        wheel2.rotation.z = 0.9;
        eq.add(wheel2);
      } else if (kind === 1) {
        // Broken wheel alone
        const wheel = new THREE.Mesh(
          new THREE.TorusGeometry(0.38, 0.07, 6, 14),
          matFn(0x3a342c, 0.9, 0.08)
        );
        wheel.rotation.x = Math.PI / 2 + 0.3;
        wheel.position.y = 0.08;
        eq.add(wheel);
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.04), woodMat);
        spoke.position.y = 0.1;
        eq.add(spoke);
      } else {
        // Crate stack
        for (let c = 0; c < 2 + Math.floor(seededRand(i + 2040) * 2); c++) {
          const crate = new THREE.Mesh(
            new THREE.BoxGeometry(0.55, 0.4, 0.5),
            crateMat
          );
          crate.position.set(
            (seededRand(i + c + 2060) - 0.5) * 0.25,
            0.2 + c * 0.42,
            (seededRand(i + c + 2080) - 0.5) * 0.2
          );
          crate.rotation.y = seededRand(i + c + 2100) * 0.4;
          crate.castShadow = true;
          crate.receiveShadow = true;
          eq.add(crate);
        }
      }
      eq.traverse(function (o) {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      eq.rotation.y = seededRand(i + 2120) * Math.PI;
      eq.position.set(p.x, placeY(p.x, p.z, 0), p.z);
      group.add(eq);
      eqPlaced++;
    }

    // ---- Scorched ground discs near random crater-like spots ----
    let scorchPlaced = 0;
    for (let i = 0; i < counts.scorched * 2 && scorchPlaced < counts.scorched; i++) {
      const p = tryPos(i + 2200, 108, 62);
      if (!p) continue;
      if (Math.abs(p.x) < 10) continue;
      const r = 1.2 + seededRand(i + 2220) * 2.2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 10), scorchedMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p.x, placeY(p.x, p.z, 0.05), p.z);
      group.add(disc);
      scorchPlaced++;
    }

    // ---- Distant subtle smoke puffs ----
    const smokePuffs = [];
    let smokePlaced = 0;
    for (let i = 0; i < counts.smoke * 3 && smokePlaced < counts.smoke; i++) {
      const p = tryPos(i + 2400, 100, 58);
      if (!p) continue;
      if (Math.abs(p.x) < 16) continue;
      const s = 1.2 + seededRand(i + 2420) * 1.8;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), smokeMat.clone());
      puff.position.set(p.x, placeY(p.x, p.z, 1.5 + seededRand(i + 2440) * 2), p.z);
      puff.scale.y = 0.7;
      puff.userData.phase = seededRand(i + 2460) * Math.PI * 2;
      puff.userData.baseOpacity = 0.1 + seededRand(i + 2480) * 0.08;
      tagEnv(puff, 'smoke');
      group.add(puff);
      smokePuffs.push(puff);
      smokePlaced++;
    }

    scene.add(group);

    // v9.4: tag untagged children for env LOD (trees/rocks/crates/fences/debris)
    group.traverse(function (obj) {
      if (!obj.isMesh && !obj.isGroup) return;
      if (obj === group) return;
      if (obj.userData && obj.userData.envKind) return;
      var n = (obj.name || '').toLowerCase();
      var kind = null;
      if (n.indexOf('tree') >= 0 || n.indexOf('foliage') >= 0) kind = 'tree';
      else if (n.indexOf('rock') >= 0) kind = 'rock';
      else if (n.indexOf('bush') >= 0) kind = 'bush';
      else if (n.indexOf('crate') >= 0 || n.indexOf('barrel') >= 0) kind = 'crate';
      else if (n.indexOf('fence') >= 0 || n.indexOf('barricade') >= 0) kind = 'fence';
      else if (n.indexOf('ruin') >= 0 || n.indexOf('wreck') >= 0 || n.indexOf('debris') >= 0 || n.indexOf('rubble') >= 0) kind = 'debris';
      else if (n.indexOf('smoke') >= 0) kind = 'smoke';
      // Parent group tagging: if mesh has no name, tag parent groups that look like props
      if (!kind && obj.parent && obj.parent !== group && obj.parent.userData && obj.parent.userData.envKind) return;
      if (!kind && obj.isGroup && obj.children && obj.children.length) {
        // leave for children; mark as prop cluster
        kind = 'prop';
      }
      if (kind) {
        obj.userData = obj.userData || {};
        obj.userData.envKind = kind;
        obj.userData.lodBand = 0;
      }
    });

    const fog = {
      fogColor: 0x121a12,
      fogNear: 48,
      fogFar: 132,
      background: 0x0c140e
    };

    function update(dt, now, camera) {
      // v9.4 env LOD — reduce/hide far trees/rocks/wreckage; terrain stable
      try {
        if (camera && global.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.updateEnvironmentLod) {
          LUNCBattle.lod.updateEnvironmentLod(group, camera);
        }
      } catch (_) {}
      for (let i = 0; i < smokePuffs.length; i++) {
        const p = smokePuffs[i];
        if (p.visible === false) continue;
        // Skip far smoke opacity churn when LOD says so
        if (p.userData && p.userData.lodBand >= 3) continue;
        const o = p.userData.baseOpacity * (0.75 + 0.25 * Math.sin(now * 0.35 + p.userData.phase));
        p.material.opacity = o;
        p.position.y += Math.sin(now * 0.2 + p.userData.phase) * 0.002;
      }
    }

    function dispose() {
      group.traverse(function (obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(function (m) {
            if (!m) return;
            if (Mats && Mats.isShared && Mats.isShared(m)) return;
            if (m.dispose) m.dispose();
          });
        }
      });
      scene.remove(group);
    }

    return {
      group: group,
      dispose: dispose,
      update: update,
      fog: fog,
      counts: {
        desktop: {
          rocks: 42, trees: 28, deadTrees: 12, bushes: 36,
          ruins: 8, barricades: 10, fences: 16, equipment: 8,
          scorched: 10, smoke: 6
        },
        mobile: {
          rocks: Math.round(42 * 0.55), trees: Math.round(28 * 0.55),
          deadTrees: Math.round(12 * 0.55), bushes: Math.round(36 * 0.55),
          ruins: Math.round(8 * 0.55), barricades: Math.round(10 * 0.55),
          fences: Math.round(16 * 0.55), equipment: Math.round(8 * 0.55),
          scorched: Math.round(10 * 0.55), smoke: 3
        },
        placed: {
          rocks: rockPlaced, trees: treePlaced, deadTrees: deadPlaced,
          bushes: bushPlaced, ruins: ruinPlaced, barricades: barPlaced,
          fences: fencePlaced, equipment: eqPlaced, scorched: scorchPlaced,
          smoke: smokePlaced
        }
      }
    };
  }

  global.LUNCBattle = global.LUNCBattle || {};
  global.LUNCBattle.environment = { createEnvironment: createEnvironment };
})(window);
