/* Projectile / explosion / smoke — extracted from battle-engine */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;

  function createEffectsApi(ctx) {
    const { THREE, scene, terrainHeight, projectilePool, particlePool, onShake } = ctx;

    function launchStrike(fromX, toX, z, color, power) {
      power = power == null ? 1 : power;
      const matGlow = new THREE.MeshBasicMaterial({ color });
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.11 + 0.04 * Math.min(power, 2), 7, 6), matGlow);
      bolt.position.set(fromX, 1.1 + Math.random() * 1.2, z);
      bolt.userData = { tx: toX, speed: 13 + power * 5, life: 2.2, color, power, prev: bolt.position.clone() };
      scene.add(bolt);
      projectilePool.push(bolt);
    }

    function createExplosion(x, z, color, power, isBurn) {
      power = power == null ? 1 : power;
      isBurn = !!isBurn;
      const count = Math.floor((isBurn ? 24 : 14) * Math.min(2.2, power));
      const palette = isBurn ? [0xffdc72, 0xf59e0b, 0xe66526] : [color, 0xf2c66d, 0xd96f42];
      for (let i = 0; i < count; i++) {
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(0.12 + Math.random() * 0.18 * power, 6, 5),
          new THREE.MeshBasicMaterial({ color: palette[i % palette.length], transparent: true, opacity: 0.9 })
        );
        sphere.position.set(
          x + (Math.random() - 0.5) * 1.2,
          terrainHeight(x, z) + 0.25 + Math.random() * 0.55,
          z + (Math.random() - 0.5) * 1.2
        );
        sphere.userData = {
          vx: (Math.random() - 0.5) * 3.2 * power,
          vy: 1.3 + Math.random() * 3.4 * power,
          vz: (Math.random() - 0.5) * 3.2 * power,
          life: 0.45 + Math.random() * 0.55,
          smoke: false
        };
        scene.add(sphere);
        particlePool.push(sphere);
      }
      for (let i = 0; i < Math.max(2, Math.round(power * 3)); i++) {
        const smoke = new THREE.Mesh(
          new THREE.SphereGeometry(0.26 + Math.random() * 0.25, 7, 6),
          new THREE.MeshBasicMaterial({ color: 0x3b4039, transparent: true, opacity: 0.3, depthWrite: false })
        );
        smoke.position.set(
          x + (Math.random() - 0.5) * 0.7,
          terrainHeight(x, z) + 0.6,
          z + (Math.random() - 0.5) * 0.7
        );
        smoke.userData = {
          vx: (Math.random() - 0.5) * 0.35,
          vy: 0.45 + Math.random() * 0.55,
          vz: (Math.random() - 0.5) * 0.35,
          life: 1.4 + Math.random() * 0.7,
          smoke: true
        };
        scene.add(smoke);
        particlePool.push(smoke);
      }
      const light = new THREE.PointLight(isBurn ? 0xffc247 : color, isBurn ? 4.8 : 3.2, 18);
      light.position.set(x, 3.2, z);
      scene.add(light);
      setTimeout(() => scene.remove(light), 180);
      if (typeof onShake === 'function') onShake(isBurn ? 0.35 : 0.2, power);
    }

    return { launchStrike, createExplosion, version: 'v7-extracted' };
  }

  LB.effects = { createApi: createEffectsApi };
})(window);
