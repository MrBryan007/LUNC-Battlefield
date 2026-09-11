/* Unit builders / formations — extracted from battle-engine */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;

  function createUnitsApi(ctx) {
    const { THREE, scene, terrainHeight, mat } = ctx;

    function setShadow(mesh, cast) {
      cast = cast !== false;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      return mesh;
    }
    function cylinderBetween(radius, length, colorMat, axis) {
      axis = axis || 'z';
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 7), colorMat);
      if (axis === 'z') m.rotation.x = Math.PI / 2;
      else if (axis === 'x') m.rotation.z = Math.PI / 2;
      return m;
    }

    function createInfantry(color, side) {
      const g = new THREE.Group();
      const armor = mat(color, 0.58, 0.16, color, 0.08);
      const cloth = mat(0x202922, 0.9, 0.02);
      const skin = mat(0xcda77e, 0.9, 0);
      const steel = mat(0x343e38, 0.42, 0.38);
      const torso = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.31, 0.65, 7), armor));
      torso.position.y = 0.78;
      const head = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), skin));
      head.position.y = 1.23;
      const helm = setShadow(new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), steel));
      helm.position.y = 1.27;
      const leg1 = setShadow(cylinderBetween(0.075, 0.52, cloth, 'y'));
      leg1.position.set(-0.12, 0.32, 0);
      const leg2 = leg1.clone();
      leg2.position.x = 0.12;
      const arm1 = setShadow(cylinderBetween(0.065, 0.48, armor, 'y'));
      arm1.position.set(-0.3, 0.76, 0);
      arm1.rotation.z = -0.26;
      const arm2 = arm1.clone();
      arm2.position.x = 0.3;
      arm2.rotation.z = 0.26;
      const rifle = setShadow(cylinderBetween(0.045, 0.72, steel, 'z'));
      rifle.position.set(side * 0.34, 0.76, side * 0.16);
      rifle.rotation.y = Math.PI / 2;
      g.add(torso, head, helm, leg1, leg2, arm1, arm2, rifle);
      g.scale.setScalar(0.92);
      g.userData = { type: 0, side, phase: Math.random() * Math.PI * 2, weapon: rifle, shot: Math.random() * 3 };
      return g;
    }

    function createArmor(color, side) {
      const g = new THREE.Group();
      const armor = mat(color, 0.52, 0.26, color, 0.08);
      const steel = mat(0x222b27, 0.5, 0.42);
      const track = mat(0x111713, 0.78, 0.16);
      const hull = setShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), armor));
      hull.scale.set(1.35, 0.48, 0.9);
      hull.position.y = 0.58;
      const turret = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 0.38, 8), armor));
      turret.position.y = 0.94;
      const barrel = setShadow(cylinderBetween(0.065, 1.2, steel, 'x'));
      barrel.position.set(side * 0.68, 1.02, 0);
      [-0.45, 0, 0.45].forEach(dx =>
        [-0.45, 0.45].forEach(z => {
          const w = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8), track));
          w.rotation.x = Math.PI / 2;
          w.position.set(dx, 0.28, z);
          g.add(w);
        })
      );
      g.add(hull, turret, barrel);
      g.userData = { type: 1, side, phase: Math.random() * Math.PI * 2, weapon: barrel, shot: Math.random() * 4 };
      return g;
    }

    function createArtillery(color, side) {
      const g = new THREE.Group();
      const armor = mat(color, 0.6, 0.19, color, 0.06);
      const steel = mat(0x2d3731, 0.46, 0.38);
      const base = mat(0x171e19, 0.8, 0.12);
      const platform = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.28, 8), base));
      platform.position.y = 0.28;
      const housing = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.43, 0.64, 7), armor));
      housing.position.y = 0.67;
      const barrel = setShadow(cylinderBetween(0.095, 1.55, steel, 'x'));
      barrel.position.set(side * 0.78, 1.0, 0);
      barrel.rotation.z = -side * 0.16;
      const stabilizer1 = setShadow(cylinderBetween(0.07, 0.9, base, 'z'));
      stabilizer1.position.set(-0.28, 0.16, 0.35);
      const stabilizer2 = stabilizer1.clone();
      stabilizer2.position.z = -0.35;
      g.add(platform, housing, barrel, stabilizer1, stabilizer2);
      g.userData = { type: 2, side, phase: Math.random() * Math.PI * 2, weapon: barrel, shot: Math.random() * 5 };
      return g;
    }

    function createUnit(color, side, type) {
      const g = type === 0 ? createInfantry(color, side) : type === 1 ? createArmor(color, side) : createArtillery(color, side);
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(type === 1 ? 0.62 : 0.38, 14),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false })
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.025;
      g.add(shadow);
      g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      scene.add(g);
      return g;
    }

    function formationSlots(count, side, type) {
      const slots = [];
      const cols = type === 0 ? 8 : 5;
      const spacingZ = type === 0 ? 2.1 : 3.35;
      const spacingX = type === 0 ? 1.8 : 3.2;
      const back = type === 0 ? 8.6 : type === 1 ? 15 : 21;
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / cols),
          col = i % cols;
        const z = (col - (cols - 1) / 2) * spacingZ + (row % 2 ? spacingZ * 0.5 : 0);
        const x = side * (back + row * spacingX);
        slots.push({ x, z });
      }
      return slots;
    }

    function disposeArmy(arr) {
      arr.forEach(u => scene.remove(u));
      arr.length = 0;
    }

    function spawnFormation(side, color, counts, list) {
      [[0, counts.inf], [1, counts.armor], [2, counts.art]].forEach(([type, n]) => {
        const slots = formationSlots(n, side, type);
        slots.forEach((s, i) => {
          const u = createUnit(color, side, type);
          u.position.set(s.x, terrainHeight(s.x, s.z), s.z);
          u.userData.home = s;
          u.userData.index = i;
          list.push(u);
        });
      });
    }

    return {
      createInfantry,
      createArmor,
      createArtillery,
      createUnit,
      formationSlots,
      disposeArmy,
      spawnFormation,
      setShadow,
      cylinderBetween,
      version: 'v7-extracted'
    };
  }

  LB.units = { createApi: createUnitsApi };
})(window);
