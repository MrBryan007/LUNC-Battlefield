/* Unit builders / formations — v9.4.6 mesh merge: fewer draws / shared baked geos */
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
      // air — heli
      heliCabin: new THREE.BoxGeometry(0.85, 0.42, 0.55),
      heliNose: new THREE.BoxGeometry(0.35, 0.28, 0.4),
      heliTail: new THREE.BoxGeometry(1.05, 0.12, 0.1),
      heliRotor: new THREE.CylinderGeometry(1.15, 1.15, 0.04, 16),
      heliTailRotor: new THREE.BoxGeometry(0.06, 0.42, 0.08),
      heliSkid: new THREE.BoxGeometry(0.9, 0.05, 0.06),
      // air — jet
      jetFuse: new THREE.BoxGeometry(1.9, 0.28, 0.32),
      jetNose: new THREE.ConeGeometry(0.16, 0.55, 6),
      jetWing: new THREE.BoxGeometry(0.55, 0.05, 1.35),
      jetTailFin: new THREE.BoxGeometry(0.06, 0.35, 0.4),
      jetEngine: new THREE.CylinderGeometry(0.09, 0.11, 0.45, 6),
      shadowInf: new THREE.CircleGeometry(0.38, 12),
      shadowArmor: new THREE.CircleGeometry(0.72, 12),
      shadowArt: new THREE.CircleGeometry(0.58, 12),
      shadowHeli: new THREE.CircleGeometry(0.85, 12),
      shadowJet: new THREE.CircleGeometry(0.95, 12)
    };

    const shadowMat = (Mats && Mats.basic)
      ? Mats.basic({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false })
      : new THREE.MeshBasicMaterial({
          color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false
        });
    // Shared transparent mats (avoid per-unit .clone() — unique mats break batching / inflate counts)
    const shadowMatAir = (Mats && Mats.basic)
      ? Mats.basic({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false })
      : new THREE.MeshBasicMaterial({
          color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false
        });
    const rotorDiscMat = (Mats && Mats.basic)
      ? Mats.basic({ color: 0x3a4640, transparent: true, opacity: 0.55, depthWrite: false })
      : new THREE.MeshBasicMaterial({
          color: 0x3a4640, transparent: true, opacity: 0.55, depthWrite: false
        });

    // ---- v9.4.6: bake+merge helpers (r128-safe, no BufferGeometryUtils CDN) ----
    const _bakeM = new THREE.Matrix4();
    const _bakeP = new THREE.Vector3();
    const _bakeQ = new THREE.Quaternion();
    const _bakeS = new THREE.Vector3();
    const _bakeE = new THREE.Euler();
    const _mergedGeoCache = Object.create(null);

    /** Clone src geo and bake local TRS into vertex positions (shared primitives stay intact). */
    function bakeGeo(srcGeo, px, py, pz, rx, ry, rz, sx, sy, sz) {
      const g = srcGeo.clone();
      _bakeP.set(px || 0, py || 0, pz || 0);
      _bakeE.set(rx || 0, ry || 0, rz || 0, 'XYZ');
      _bakeQ.setFromEuler(_bakeE);
      _bakeS.set(sx != null ? sx : 1, sy != null ? sy : 1, sz != null ? sz : 1);
      _bakeM.compose(_bakeP, _bakeQ, _bakeS);
      g.applyMatrix4(_bakeM);
      return g;
    }

    /** Merge BufferGeometries that share the same attribute layout (position/normal/uv + index). */
    function mergeGeos(geos) {
      if (!geos || !geos.length) return null;
      if (geos.length === 1) return geos[0];
      const names = Object.keys(geos[0].attributes);
      const buckets = {};
      let n, name;
      for (n = 0; n < names.length; n++) buckets[names[n]] = [];
      const indexList = [];
      let indexOffset = 0;
      let i, j, geo, attr, arr, vc, TypeArray, itemSize, total, offset, mergedArr, out;
      for (i = 0; i < geos.length; i++) {
        geo = geos[i];
        if (!geo.attributes.normal) {
          try { geo.computeVertexNormals(); } catch (_) {}
        }
        for (n = 0; n < names.length; n++) {
          name = names[n];
          attr = geo.attributes[name];
          if (!attr) continue;
          buckets[name].push(attr.array);
        }
        vc = geo.attributes.position.count;
        if (geo.index) {
          arr = geo.index.array;
          for (j = 0; j < arr.length; j++) indexList.push(arr[j] + indexOffset);
        } else {
          for (j = 0; j < vc; j++) indexList.push(indexOffset + j);
        }
        indexOffset += vc;
      }
      out = new THREE.BufferGeometry();
      for (n = 0; n < names.length; n++) {
        name = names[n];
        if (!geos[0].attributes[name] || !buckets[name].length) continue;
        attr = geos[0].attributes[name];
        itemSize = attr.itemSize;
        TypeArray = attr.array.constructor;
        total = 0;
        for (i = 0; i < buckets[name].length; i++) total += buckets[name][i].length;
        mergedArr = new TypeArray(total);
        offset = 0;
        for (i = 0; i < buckets[name].length; i++) {
          mergedArr.set(buckets[name][i], offset);
          offset += buckets[name][i].length;
        }
        out.setAttribute(name, new THREE.BufferAttribute(mergedArr, itemSize));
      }
      out.setIndex(indexList);
      try { out.computeBoundingSphere(); } catch (_) {}
      return out;
    }

    function cachedMerged(key, buildFn) {
      if (_mergedGeoCache[key]) return _mergedGeoCache[key];
      _mergedGeoCache[key] = buildFn();
      return _mergedGeoCache[key];
    }


    // Pre-bake shared merged geos (one allocation, reused by every unit)
    function geoLowerLegBoot() {
      return cachedMerged('inf.lowerLegBoot', function () {
        return mergeGeos([
          bakeGeo(GEO.lowerLeg, 0, -0.16, 0, 0, 0, 0, 1, 1, 1),
          bakeGeo(GEO.boot, 0, -0.34, 0.02, 0, 0, 0, 1, 1, 1)
        ]);
      });
    }
    function geoArmorWheels() {
      return cachedMerged('armor.wheels', function () {
        const parts = [];
        [-0.52, 0.52].forEach(function (z) {
          [-0.55, -0.18, 0.18, 0.55].forEach(function (x) {
            parts.push(bakeGeo(GEO.wheel, x, 0.22, z, 0, 0, Math.PI / 2, 1, 1, 1));
          });
        });
        return mergeGeos(parts);
      });
    }
    function geoArmorTracks() {
      return cachedMerged('armor.tracks', function () {
        return mergeGeos([
          bakeGeo(GEO.trackBlock, 0, 0.2, -0.52, 0, 0, 0, 4.2, 1, 1),
          bakeGeo(GEO.trackBlock, 0, 0.2, 0.52, 0, 0, 0, 4.2, 1, 1)
        ]);
      });
    }
    function geoArtySides() {
      return cachedMerged('arty.sides', function () {
        return mergeGeos([
          bakeGeo(GEO.carriageSide, 0, 0.45, 0.32, 0, 0, 0, 1, 1, 1),
          bakeGeo(GEO.carriageSide, 0, 0.45, -0.32, 0, 0, 0, 1, 1, 1)
        ]);
      });
    }
    function geoArtyWheels() {
      return cachedMerged('arty.wheels', function () {
        return mergeGeos([
          bakeGeo(GEO.artyWheel, 0.05, 0.32, -0.42, 0, 0, Math.PI / 2, 1, 1, 1),
          bakeGeo(GEO.artyWheel, 0.05, 0.32, 0.42, 0, 0, Math.PI / 2, 1, 1, 1)
        ]);
      });
    }
    function geoArtyTrails() {
      return cachedMerged('arty.trails', function () {
        return mergeGeos([
          bakeGeo(GEO.trailLeg, -0.55, 0.2, 0.28, 0, 0.35, Math.PI / 2, 1, 1, 1),
          bakeGeo(GEO.trailLeg, -0.55, 0.2, -0.28, 0, -0.35, Math.PI / 2, 1, 1, 1)
        ]);
      });
    }
    function geoArtyFeet() {
      return cachedMerged('arty.feet', function () {
        return mergeGeos([
          bakeGeo(GEO.trailFoot, -1.05, 0.06, 0.42, 0, 0, 0, 1, 1, 1),
          bakeGeo(GEO.trailFoot, -1.05, 0.06, -0.42, 0, 0, 0, 1, 1, 1)
        ]);
      });
    }
    function geoHeliSkids() {
      return cachedMerged('heli.skids', function () {
        return mergeGeos([
          bakeGeo(GEO.heliSkid, 0.05, 0.22, -0.22, 0, 0, 0, 1, 1, 1),
          bakeGeo(GEO.heliSkid, 0.05, 0.22, 0.22, 0, 0, 0, 1, 1, 1)
        ]);
      });
    }
    function geoHeliPods() {
      return cachedMerged('heli.pods', function () {
        return mergeGeos([
          bakeGeo(GEO.trailFoot, 0.1, 0.32, 0.28, 0, 0, 0, 1.4, 0.7, 0.7),
          bakeGeo(GEO.trailFoot, 0.1, 0.32, -0.28, 0, 0, 0, 1.4, 0.7, 0.7)
        ]);
      });
    }
    function geoJetWings() {
      return cachedMerged('jet.wings', function () {
        return mergeGeos([
          bakeGeo(GEO.jetWing, -0.1, 0.38, 0.55, 0, 0.35, 0, 1, 1, 1),
          bakeGeo(GEO.jetWing, -0.1, 0.38, -0.55, 0, -0.35, 0, 1, 1, 1)
        ]);
      });
    }
    function geoJetEngines() {
      return cachedMerged('jet.engines', function () {
        return mergeGeos([
          bakeGeo(GEO.jetEngine, -0.55, 0.28, 0.28, 0, 0, Math.PI / 2, 1, 1, 1),
          bakeGeo(GEO.jetEngine, -0.55, 0.28, -0.28, 0, 0, Math.PI / 2, 1, 1, 1)
        ]);
      });
    }
    function geoBullHelm() {
      return cachedMerged('inf.helmBull', function () {
        return mergeGeos([
          bakeGeo(GEO.helmCap, 0, 0.04, 0, 0, 0, 0, 1, 1, 1),
          bakeGeo(GEO.helmDisc, 0, 0.02, 0, 0, 0, 0, 1, 1, 1)
        ]);
      });
    }
    // v9.4.5/6: default NO cast — only explicit core casters (shadow-map draw win)
    function setShadow(mesh, cast) {
      mesh.castShadow = !!cast;
      mesh.receiveShadow = true;
      if (cast) {
        mesh.userData = mesh.userData || {};
        mesh.userData.luncShadowCaster = true;
      }
      return mesh;
    }

    function meshFrom(geo, material, castShadow) {
      return setShadow(new THREE.Mesh(geo, material), !!castShadow);
    }

    function trackCaster(list, mesh) {
      if (mesh && mesh.castShadow) list.push(mesh);
      return mesh;
    }

    function limbGroup(upperGeo, lowerGeo, matU, matL, upperLen, opts) {
      opts = opts || {};
      const g = new THREE.Group();
      const upper = meshFrom(upperGeo, matU);
      upper.position.y = -upperLen * 0.5;
      g.add(upper);
      const lower = new THREE.Group();
      lower.position.y = -upperLen;
      let lowerMesh;
      if (opts.bakedLower) {
        // Already baked in parent-local space of lower group (y=0 at hip hinge)
        lowerMesh = meshFrom(opts.bakedLower, matL);
      } else {
        lowerMesh = meshFrom(lowerGeo, matL);
        const lowerLen = lowerGeo.parameters ? lowerGeo.parameters.height : 0.3;
        lowerMesh.position.y = -(lowerLen || 0.3) * 0.5;
      }
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
      const casters = [];
      const pelvis = trackCaster(casters, meshFrom(GEO.pelvisCyl, body, true));
      pelvis.position.y = 0;
      hips.add(pelvis);
      hips.position.y = 0.42;
      hips.userData.baseY = 0.42;
      parts.hips = hips;
      parts.pelvis = pelvis;

      // Legs (pivot at hips) — v9.4.6: lowerLeg+boot baked into one mesh per leg
      const lowerBootGeo = geoLowerLegBoot();
      const L_leg = limbGroup(GEO.upperLeg, GEO.lowerLeg, cloth, darkMat, 0.34, { bakedLower: lowerBootGeo });
      L_leg.group.position.set(-0.11, 0, 0);
      const R_leg = limbGroup(GEO.upperLeg, GEO.lowerLeg, cloth, darkMat, 0.34, { bakedLower: lowerBootGeo });
      R_leg.group.position.set(0.11, 0, 0);
      hips.add(L_leg.group, R_leg.group);
      parts.L_upperLeg = L_leg.group;
      parts.R_upperLeg = R_leg.group;
      parts.L_lowerLeg = L_leg.lower;
      parts.R_lowerLeg = R_leg.lower;

      // Torso
      const torso = new THREE.Group();
      const torsoMesh = trackCaster(casters, meshFrom(GEO.torsoCyl, accent, true));
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
      let helm, helmDisc;
      if (isBull) {
        // v9.4.6: bull helmCap+disc share metalMat → one draw
        helm = meshFrom(geoBullHelm(), metalMat);
        helmDisc = helm; // same mesh ref for LOD detail list
        headG.add(helm);
      } else {
        helm = meshFrom(GEO.helmCap, metalMat);
        helm.position.y = 0.04;
        headG.add(helm);
        helmDisc = meshFrom(GEO.helmDisc, metalMatDark);
        helmDisc.position.y = 0.02;
        headG.add(helmDisc);
      }
      if (!isBull) {
        // Bear: merge ridge+stub (same accent) into one detail mesh
        const ridgeGeo = cachedMerged('inf.bearRidgeStub', function () {
          return mergeGeos([
            bakeGeo(GEO.helmRidge, 0, 0.14, 0, 0, 0, 0, 1, 1, 1),
            bakeGeo(GEO.bannerStub, 0.02, 0.22, -0.12, 0, 0, 0, 1, 1, 1)
          ]);
        });
        const ridge = meshFrom(ridgeGeo, accent);
        headG.add(ridge);
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

      // v9.4.2: semantic LOD groups (lod.js toggles by group, not mesh names)
      const lodGroups = {
        core: [hips, torso],
        silhouette: [hips, torso],
        major: [headG],
        detail: (function () {
          const d = [];
          if (parts.backpack) d.push(parts.backpack);
          d.push(helm);
          if (helmDisc && helmDisc !== helm) d.push(helmDisc);
          return d;
        })(),
        limbs: [L_leg.group, R_leg.group, L_arm.group, R_arm.group]
      };
      if (global.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.registerLodGroups) {
        LUNCBattle.lod.registerLodGroups(g, lodGroups);
      } else {
        g.userData = g.userData || {};
        g.userData.lodGroups = lodGroups;
      }

      const muzzleOffset = new THREE.Vector3(side * 0.15, 1.05, 0.55);
      g.userData = Object.assign(g.userData || {}, {
        type: 0,
        side: side,
        phase: Math.random() * Math.PI * 2,
        shot: Math.random() * 3,
        animState: STATES.IDLE,
        parts: parts,
        shadowCasters: casters,
        lodGroups: (g.userData && g.userData.lodGroups) || lodGroups,
        speed: 0,
        facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        weaponRef: weapon,
        muzzleOffset: muzzleOffset,
        weapon: weapon,
        rootBob: 0
      });
      g.scale.setScalar(0.95);
      return g;
    }

    function createArmor(color, side) {
      const g = new THREE.Group();
      const isBull = side < 0;
      const accent = accentMat(color, 0.08);
      const parts = {};

      const casters = [];
      const hullG = new THREE.Group();
      const hull = trackCaster(casters, meshFrom(GEO.hullMain, accent, true));
      hull.position.y = 0.52;
      const bevel = meshFrom(GEO.hullBevel, bodyMatBull);
      bevel.material = isBull ? bodyMatBull : bodyMatBear;
      bevel.position.y = 0.78;
      const skirt = meshFrom(GEO.hullSkirt, darkMat);
      skirt.position.y = 0.32;
      if (!isBull) skirt.scale.set(1.05, 1.15, 1.08);
      hullG.add(hull, bevel, skirt);
      parts.hull = hullG;

      // v9.4.6: merge all wheels (1 mesh) + both track rows (1 mesh) — same trackMat
      const wheelsMerged = meshFrom(geoArmorWheels(), trackMat);
      hullG.add(wheelsMerged);
      const tracksMerged = meshFrom(geoArmorTracks(), trackMat);
      tracksMerged.userData.baseY = 0.2;
      hullG.add(tracksMerged);
      const wheels = [wheelsMerged];
      const tracks = [tracksMerged];
      parts.wheels = wheels;
      parts.tracks = tracks;

      // Turret group (rotates)
      const turret = new THREE.Group();
      turret.position.y = 0.92;
      let turretMesh;
      if (isBull) {
        turretMesh = trackCaster(casters, meshFrom(GEO.turretCyl, accent, true));
        const lid = meshFrom(GEO.turretBox, metalMat);
        lid.position.y = 0.2;
        lid.scale.set(0.85, 0.7, 0.9);
        turret.add(turretMesh, lid);
        const ant = meshFrom(GEO.antenna, metalMatDark);
        ant.position.set(-0.2, 0.45, -0.15);
        turret.add(ant);
      } else {
        turretMesh = trackCaster(casters, meshFrom(GEO.turretBear, accent, true));
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

      // v9.4.4: hull+turret+cannon stay in core through LOD0–2 (tanks must read as tanks)
      const armorDetail = wheels.slice();
      turret.children.forEach(function (ch) {
        if (ch !== cannonG && ch !== turretMesh) armorDetail.push(ch);
      });
      const lodGroups = {
        core: [hullG, turret],
        silhouette: [hullG, turret],
        major: [],
        detail: armorDetail,
        limbs: tracks.slice()
      };
      if (global.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.registerLodGroups) {
        LUNCBattle.lod.registerLodGroups(g, lodGroups);
      } else {
        g.userData = g.userData || {};
        g.userData.lodGroups = lodGroups;
      }

      g.userData = Object.assign(g.userData || {}, {
        type: 1,
        side: side,
        phase: Math.random() * Math.PI * 2,
        shot: Math.random() * 4,
        animState: STATES.IDLE_SCAN,
        parts: parts,
        shadowCasters: casters,
        lodGroups: (g.userData && g.userData.lodGroups) || lodGroups,
        speed: 0,
        facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        weaponRef: cannon,
        weapon: cannon,
        trackPhase: Math.random() * Math.PI * 2,
        muzzleOffset: new THREE.Vector3(0, 1.0, 1.1),
        rootBob: 0,
        recoil: 0
      });
      return g;
    }

    function createArtillery(color, side) {
      const g = new THREE.Group();
      const isBull = side < 0;
      const accent = accentMat(color, 0.06);
      const body = isBull ? bodyMatBull : bodyMatBear;
      const parts = {};

      const casters = [];
      const carriage = new THREE.Group();
      const base = trackCaster(casters, meshFrom(GEO.carriage, darkMat, true));
      base.position.y = 0.38;
      // v9.4.6: sides / wheels / trails / feet → one mesh each (matched materials)
      const sides = meshFrom(geoArtySides(), body);
      const shield = meshFrom(GEO.shield, accent);
      shield.position.set(0.35, 0.62, 0);
      carriage.add(base, sides, shield);
      parts.carriage = carriage;

      const wheelsMerged = meshFrom(geoArtyWheels(), trackMat);
      carriage.add(wheelsMerged);
      const wheels = [wheelsMerged];
      parts.wheels = wheels;

      const trailsMerged = meshFrom(geoArtyTrails(), darkMat);
      const feetMerged = meshFrom(geoArtyFeet(), metalMatDark);
      carriage.add(trailsMerged, feetMerged);
      parts.trails = [trailsMerged];
      const trail1 = trailsMerged;
      const trail2 = trailsMerged;
      const foot1 = feetMerged;
      const foot2 = feetMerged;

      // Barrel group — elevate (rotation.x) + recoil (position.z)
      const barrelG = new THREE.Group();
      barrelG.position.set(0.15, 0.72, 0);
      barrelG.rotation.x = -0.22;
      barrelG.userData.baseElev = -0.22;
      barrelG.userData.baseZ = 0;
      const barrelMesh = trackCaster(casters, meshFrom(GEO.barrelLong, metalMat, true));
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

      // v9.4.4: carriage+barrel stay recognizable through LOD0–2
      const lodGroups = {
        core: [carriage, barrelG],
        silhouette: [carriage, barrelG],
        major: [],
        detail: [wheelsMerged, trailsMerged, feetMerged, shield],
        limbs: [trailsMerged]
      };
      if (global.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.registerLodGroups) {
        LUNCBattle.lod.registerLodGroups(g, lodGroups);
      } else {
        g.userData = g.userData || {};
        g.userData.lodGroups = lodGroups;
      }

      g.userData = Object.assign(g.userData || {}, {
        type: 2,
        side: side,
        phase: Math.random() * Math.PI * 2,
        shot: Math.random() * 5,
        animState: STATES.IDLE,
        parts: parts,
        shadowCasters: casters,
        lodGroups: (g.userData && g.userData.lodGroups) || lodGroups,
        speed: 0,
        facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        weaponRef: barrelMesh,
        weapon: barrelMesh,
        muzzleOffset: new THREE.Vector3(0, 1.1, 1.4),
        rootBob: 0,
        recoil: 0
      });
      return g;
    }


    function createHelicopter(color, side) {
      const g = new THREE.Group();
      const isBull = side < 0;
      const accent = accentMat(color, 0.1);
      const body = isBull ? bodyMatBull : bodyMatBear;
      const parts = {};

      const casters = [];
      const cabinG = new THREE.Group();
      const cabin = trackCaster(casters, meshFrom(GEO.heliCabin, accent, true));
      cabin.position.y = 0.55;
      const nose = meshFrom(GEO.heliNose, body);
      nose.position.set(0.5, 0.5, 0);
      const boom = meshFrom(GEO.heliTail, darkMat);
      boom.position.set(-0.85, 0.58, 0);
      // v9.4.6: skids merged; pods merged (matched mats)
      const skids = meshFrom(geoHeliSkids(), metalMatDark);
      cabinG.add(cabin, nose, boom, skids);
      parts.cabin = cabinG;

      const rotorG = new THREE.Group();
      rotorG.position.y = 0.82;
      const disc = meshFrom(GEO.heliRotor, rotorDiscMat, false);
      rotorG.add(disc);
      parts.rotor = rotorG;
      parts.rotorDisc = disc;

      const tailRotor = meshFrom(GEO.heliTailRotor, metalMatDark);
      tailRotor.position.set(-1.35, 0.62, 0.12);
      cabinG.add(tailRotor);
      parts.tailRotor = tailRotor;

      const podsMerged = meshFrom(geoHeliPods(), metalMat);
      cabinG.add(podsMerged);
      parts.pods = [podsMerged];
      const podL = podsMerged;
      const podR = podsMerged;

      // Nose was modeled along +X; rotate to local +Z to match facing convention
      cabinG.rotation.y = -Math.PI / 2;
      g.add(cabinG, rotorG);
      g.scale.setScalar(1.05);

      const lodGroups = {
        core: [cabinG, rotorG],
        silhouette: [cabinG, rotorG],
        major: [],
        detail: [tailRotor, podsMerged],
        limbs: []
      };
      if (global.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.registerLodGroups) {
        LUNCBattle.lod.registerLodGroups(g, lodGroups);
      } else {
        g.userData = g.userData || {};
        g.userData.lodGroups = lodGroups;
      }

      g.userData = Object.assign(g.userData || {}, {
        type: 3,
        air: true,
        side: side,
        phase: Math.random() * Math.PI * 2,
        shot: Math.random() * 2,
        animState: STATES.IDLE,
        parts: parts,
        shadowCasters: casters,
        lodGroups: (g.userData && g.userData.lodGroups) || lodGroups,
        speed: 0,
        facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        weaponRef: podL,
        weapon: podL,
        muzzleOffset: new THREE.Vector3(0, 0.35, 0.55),
        rootBob: 0,
        alt: 8.5 + Math.random() * 2.5,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitRadius: 10 + Math.random() * 6,
        orbitSpeed: 0.35 + Math.random() * 0.25,
        airMode: 'orbit'
      });
      return g;
    }

    function createJet(color, side) {
      const g = new THREE.Group();
      const isBull = side < 0;
      const accent = accentMat(color, 0.12);
      const body = isBull ? bodyMatBull : bodyMatBear;
      const parts = {};

      const casters = [];
      const fuseG = new THREE.Group();
      const fuse = trackCaster(casters, meshFrom(GEO.jetFuse, accent, true));
      fuse.position.y = 0.4;
      const nose = meshFrom(GEO.jetNose, body);
      nose.rotation.z = -Math.PI / 2;
      nose.position.set(1.15, 0.4, 0);
      fuseG.add(fuse, nose);

      // v9.4.6: wings merged; engines merged
      const wingsMerged = meshFrom(geoJetWings(), metalMat);
      fuseG.add(wingsMerged);

      const fin = meshFrom(GEO.jetTailFin, accent);
      fin.position.set(-0.75, 0.62, 0);
      fuseG.add(fin);

      const enginesMerged = meshFrom(geoJetEngines(), darkMat);
      fuseG.add(enginesMerged);
      parts.fuselage = fuseG;
      parts.wings = [wingsMerged];
      parts.engines = [enginesMerged];
      const engL = enginesMerged;
      const engR = enginesMerged;

      // Nose along +X in mesh space → local +Z for facing
      fuseG.rotation.y = -Math.PI / 2;
      g.add(fuseG);
      g.scale.setScalar(1.1);

      const lodGroups = {
        core: [fuseG],
        silhouette: [fuseG],
        major: [],
        detail: [enginesMerged, fin],
        limbs: []
      };
      if (global.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.registerLodGroups) {
        LUNCBattle.lod.registerLodGroups(g, lodGroups);
      } else {
        g.userData = g.userData || {};
        g.userData.lodGroups = lodGroups;
      }

      g.userData = Object.assign(g.userData || {}, {
        type: 4,
        air: true,
        side: side,
        phase: Math.random() * Math.PI * 2,
        shot: Math.random() * 3,
        animState: STATES.IDLE,
        parts: parts,
        shadowCasters: casters,
        lodGroups: (g.userData && g.userData.lodGroups) || lodGroups,
        speed: 0,
        facing: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        weaponRef: fuse,
        weapon: fuse,
        muzzleOffset: new THREE.Vector3(0, 0.2, 0.7),
        rootBob: 0,
        alt: 14 + Math.random() * 4,
        airMode: 'ingress',
        runCooldown: Math.random() * 4,
        bank: 0
      });
      return g;
    }

    function createUnit(color, side, type) {
      // v9.3/v9.4.4: prefer GLB when ready; AUTO never swaps smoke-test boxes for tanks/air
      let g = null;
      const Assets = (LB && LB.assets) || null;
      const Reg = (LB && LB.assetRegistry) || null;
      const isAir = type === 3 || type === 4;
      const assetId = (!isAir && Reg && Reg.unitIdFromSideType)
        ? Reg.unitIdFromSideType(side, type)
        : null;
      let allowGltf = false;
      if (Assets && assetId && Assets.shouldUseGltf && Assets.shouldUseGltf(assetId)) {
        // Hard gate: smoke-test placeholders must never replace procedural armor/units in AUTO
        try {
          const entry = Reg && Reg.get ? Reg.get(assetId) : (Reg && Reg.byId && Reg.byId[assetId]);
          const smoke = entry && entry.smokeTest;
          const mode = Assets.getMode ? Assets.getMode() : 'AUTO';
          allowGltf = !(smoke && mode !== 'GLTF');
        } catch (_) {
          allowGltf = true;
        }
      }
      if (allowGltf) {
        try {
          g = Assets.instantiate(assetId, { color: color, side: side, type: type, accentColor: color });
        } catch (e) {
          g = null;
        }
      }
      if (!g) {
        g = type === 0 ? createInfantry(color, side)
          : type === 1 ? createArmor(color, side)
          : type === 2 ? createArtillery(color, side)
          : type === 3 ? createHelicopter(color, side)
          : type === 4 ? createJet(color, side)
          : createArtillery(color, side);
        g.userData = g.userData || {};
        g.userData.luncAssetSource = 'procedural';
        g.userData.luncProcedural = true;
        if (Assets && Assets.markProceduralSpawn) Assets.markProceduralSpawn();
      }
      const shadowGeo = type === 1 ? GEO.shadowArmor
        : type === 2 ? GEO.shadowArt
        : type === 3 ? GEO.shadowHeli
        : type === 4 ? GEO.shadowJet
        : GEO.shadowInf;
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = isAir ? -0.15 : 0.02;
      shadow.receiveShadow = false;
      shadow.castShadow = false;
      if (isAir) {
        shadow.scale.setScalar(0.65);
        shadow.material = shadowMatAir;
      }
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
        const n = pair[1] | 0;
        if (n <= 0) return;
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

    /** Spawn procedural air wing (heli type 3, jet type 4) above the battlefield. */
    function spawnAirWing(side, color, counts, list) {
      const nHeli = (counts && counts.heli) | 0;
      const nJet = (counts && counts.jet) | 0;
      let idx = 0;
      for (let i = 0; i < nHeli; i++) {
        const u = createUnit(color, side, 3);
        const z = (i - (nHeli - 1) / 2) * 7.5 + (((i * 11) % 5) - 2) * 0.4;
        const x = side * (18 + (i % 2) * 4);
        const alt = u.userData.alt || 9;
        u.position.set(x, alt, z);
        u.userData.home = { x: x, z: z };
        u.userData.homeZ = z;
        u.userData.index = idx++;
        u.userData.orbitAngle = (i / Math.max(1, nHeli)) * Math.PI * 2 + (side < 0 ? 0 : 1.2);
        list.push(u);
      }
      for (let j = 0; j < nJet; j++) {
        const u = createUnit(color, side, 4);
        const z = (j - (nJet - 1) / 2) * 11 + side * 2;
        const startX = side * (55 + j * 8);
        const alt = u.userData.alt || 15;
        u.position.set(startX, alt, z);
        u.userData.home = { x: startX, z: z };
        u.userData.homeZ = z;
        u.userData.index = idx++;
        u.userData.airMode = 'ingress';
        u.userData.runCooldown = j * 2.5 + Math.random();
        list.push(u);
      }
    }

    function setAnimState(u, state, now) {
      if (Anim && Anim.setAnimState) Anim.setAnimState(u, state, now);
      else u.userData.animState = state;
    }

    function tickUnit(u, dt, now, tickCtx) {
      tickCtx = tickCtx || {};
      // v9.4: true LOD with hysteresis via LUNCBattle.lod
      try {
        const Lod = global.LUNCBattle && LUNCBattle.lod;
        const camObj = tickCtx.camera || null;
        if (Lod && camObj && u.position) {
          const band = Lod.updateUnitLod(u, camObj);
          tickCtx.lodBand = band;
          // Frustum/far-skip AFTER LOD apply; hide mesh (still simulated — no despawn)
          let culled = false;
          if (band >= 2 && Lod.isInView && !Lod.isInView(u, camObj, THREE)) {
            tickCtx.skipAnim = true;
            u.userData.lodCulled = true;
            culled = true;
            u.visible = false;
            if (Lod.applyShadowPolicy) Lod.applyShadowPolicy(u, 3);
          } else {
            u.userData.lodCulled = false;
            if (!u.visible) u.visible = true;
          }
          Lod.tally(band, 'unit', culled);
        } else if (tickCtx.lodBand == null && global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getLodBand) {
          const cam = tickCtx.cameraPos;
          if (cam && u.position) {
            const dx = u.position.x - cam.x;
            const dz = u.position.z - cam.z;
            tickCtx.lodBand = LUNCBattle.quality.getLodBand(Math.sqrt(dx * dx + dz * dz));
          }
        }
      } catch (_) {}
      if (!tickCtx.animComplexity && global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset) {
        try {
          const p = LUNCBattle.quality.getEffectivePreset();
          tickCtx.animComplexity = p.animComplexity;
          tickCtx.unitUpdateDivisor = p.unitUpdateDivisor;
        } catch (_) {}
      }
      // Optional rigid GLB LOD swap when ?assets=gltf and target LOD ready (smoke verify)
      try {
        if (tickCtx.enableLodSwap && u.userData && u.userData.luncAssetId &&
            global.LUNCBattle && LUNCBattle.assets && LUNCBattle.assets.swapVisual) {
          const want = tickCtx.lodBand != null ? tickCtx.lodBand : u.userData.lodBand;
          const have = u.userData.luncLodBand != null ? u.userData.luncLodBand : u.userData.lodBand;
          if (want != null && have != null && want !== have && want < 3) {
            LUNCBattle.assets.swapVisual(u, u.userData.luncAssetId, want, {});
          }
        }
      } catch (_) {}
      if (tickCtx.skipAnim) {
        if (u.userData && u.userData.facing != null) u.rotation.y = u.userData.facing;
        return;
      }
      if (Anim && Anim.tickUnit) Anim.tickUnit(u, dt, now, tickCtx);
    }

    return {
      createInfantry: createInfantry,
      createArmor: createArmor,
      createArtillery: createArtillery,
      createHelicopter: createHelicopter,
      createJet: createJet,
      createUnit: createUnit,
      formationSlots: formationSlots,
      disposeArmy: disposeArmy,
      spawnFormation: spawnFormation,
      spawnAirWing: spawnAirWing,
      setShadow: setShadow,
      setAnimState: setAnimState,
      tickUnit: tickUnit,
      GEO: GEO,
      version: 'v9.4.6'
    };
  }

  LB.units = { createApi: createUnitsApi };
})(window);
