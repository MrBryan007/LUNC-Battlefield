/* LUNC Battlefield v9.2 — procedural terrain (registry MeshStandardMaterials) */
(function (global) {
  'use strict';

  function seededRand(seed) {
    const x = Math.sin(seed * 999.11) * 43758.5453123;
    return x - Math.floor(x);
  }

  function hash2(x, z) {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function valueNoise(x, z) {
    const xi = Math.floor(x);
    const zi = Math.floor(z);
    const xf = x - xi;
    const zf = z - zi;
    const u = xf * xf * (3 - 2 * xf);
    const v = zf * zf * (3 - 2 * zf);
    const a = hash2(xi, zi);
    const b = hash2(xi + 1, zi);
    const c = hash2(xi, zi + 1);
    const d = hash2(xi + 1, zi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  function fbm(x, z, octaves) {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * valueNoise(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / (norm || 1);
  }

  // Deterministic crater table (shared by height + coloring)
  const CRATERS = [];
  (function buildCraters() {
    for (let i = 0; i < 18; i++) {
      const cx = (seededRand(i + 17) - 0.5) * 118;
      const cz = (seededRand(i + 91) - 0.5) * 70;
      if (Math.abs(cx) < 14) continue;
      if (Math.abs(cx) > 40 && Math.abs(cz) < 16) continue;
      CRATERS.push({
        x: cx,
        z: cz,
        r: 1.8 + seededRand(i + 200) * 3.4,
        d: 0.28 + seededRand(i + 310) * 0.55
      });
    }
  })();

  function craterDepth(x, z) {
    let depth = 0;
    let prox = 0;
    for (let i = 0; i < CRATERS.length; i++) {
      const c = CRATERS[i];
      const dx = x - c.x;
      const dz = z - c.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < c.r) {
        const t = 1 - dist / c.r;
        const bowl = t * t * (3 - 2 * t);
        depth += c.d * bowl;
        prox = Math.max(prox, bowl);
      }
    }
    return { depth: depth, prox: prox };
  }

  function terrainHeight(x, z) {
    // Multi-octave rolling hills + gentle depressions
    let h =
      (fbm(x * 0.018 + 2.1, z * 0.017 + 0.7, 4) - 0.42) * 1.55 +
      (fbm(x * 0.046 - 1.3, z * 0.044 + 3.2, 3) - 0.5) * 0.55 +
      (fbm(x * 0.09, z * 0.088, 2) - 0.5) * 0.18;

    // Gentle basin depressions
    h -= Math.abs(fbm(x * 0.012 + 8, z * 0.011 - 4, 2) - 0.5) * 0.35;

    // Frontline flatten |x|<8, with trench/berm ridges at ±3..±6
    const flatten = Math.exp(-(x * x) / (2 * 7.5 * 7.5));
    const absX = Math.abs(x);
    let trenchBerm = 0;
    if (absX > 2.2 && absX < 7.2) {
      const trench = -0.32 * Math.exp(-Math.pow((absX - 3.7) / 0.85, 2));
      const berm = 0.42 * Math.exp(-Math.pow((absX - 5.4) / 0.9, 2));
      trenchBerm = trench + berm;
    }
    h = h * (1 - 0.84 * flatten) + trenchBerm;

    // Edge hills near |z| large
    const edgeT = Math.max(0, (Math.abs(z) - 26) / 16);
    if (edgeT > 0) {
      h += edgeT * edgeT * (0.95 + 0.45 * Math.sin(x * 0.075 + z * 0.02));
    }

    // Worn dirt road along z through center (width ~10–14), slightly lower
    const roadHalf = 6.2;
    const road = Math.exp(-(x * x) / (2 * roadHalf * roadHalf));
    h -= road * 0.2;

    // Crater bowls
    h -= craterDepth(x, z).depth;

    return h;
  }

  function createTerrain(opts) {
    const THREE = opts.THREE;
    const scene = opts.scene;
    const mobile = !!opts.mobile;
    let qualitySegScale = 1;
    try {
      if (opts.terrainSegScale != null) qualitySegScale = +opts.terrainSegScale;
      else if (global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getEffectivePreset) {
        const ud = LUNCBattle.quality.getEffectivePreset().unitDetail;
        if (ud === 'low') qualitySegScale = 0.65;
        else if (ud === 'medium') qualitySegScale = 0.85;
        else if (ud === 'ultra') qualitySegScale = 1.05;
      }
    } catch (_) {}

    const width = 138;
    const depth = 82;
    const segW = Math.max(48, Math.round((mobile ? 96 : 160) * qualitySegScale));
    const segD = Math.max(32, Math.round((mobile ? 56 : 90) * qualitySegScale));

    const group = new THREE.Group();
    group.name = 'terrain-v81';

    const terrainGeo = new THREE.PlaneGeometry(width, depth, segW, segD);
    terrainGeo.rotateX(-Math.PI / 2);
    const pos = terrainGeo.attributes.position;
    const colors = [];

    const colGrass = new THREE.Color(0x3d5234);
    const colOlive = new THREE.Color(0x4a5536);
    const colDirt = new THREE.Color(0x5a4634);
    const colMud = new THREE.Color(0x2e261c);
    const colRock = new THREE.Color(0x5a5c4e);
    const colScorch = new THREE.Color(0x1c1a16);
    const tintBull = new THREE.Color(0x1a3a28);
    const tintBear = new THREE.Color(0x3a221c);

    // Sample heights into a grid for slope estimation
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = terrainHeight(x, z);
      heights[i] = h;
      pos.setY(i, h);
    }

    const vertsX = segW + 1;
    const vertsZ = segD + 1;

    function idxAt(ix, iz) {
      return iz * vertsX + ix;
    }

    for (let iz = 0; iz < vertsZ; iz++) {
      for (let ix = 0; ix < vertsX; ix++) {
        const i = idxAt(ix, iz);
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const h = heights[i];

        // Slope from neighbors (laplacian-ish)
        const ix0 = Math.max(0, ix - 1);
        const ix1 = Math.min(vertsX - 1, ix + 1);
        const iz0 = Math.max(0, iz - 1);
        const iz1 = Math.min(vertsZ - 1, iz + 1);
        const dhx = Math.abs(heights[idxAt(ix1, iz)] - heights[idxAt(ix0, iz)]);
        const dhz = Math.abs(heights[idxAt(ix, iz1)] - heights[idxAt(ix, iz0)]);
        const slope = Math.min(1, (dhx + dhz) * 2.2);

        const roadDist = Math.abs(x);
        const roadProx = Math.exp(-(roadDist * roadDist) / (2 * 6.5 * 6.5));
        const crater = craterDepth(x, z).prox;

        // Base blend: low = mud/dirt, mid = grass/olive, high/slope = rock
        const c = colOlive.clone();
        if (h < 0.05) {
          c.copy(colMud).lerp(colDirt, THREE.MathUtils.clamp((h + 0.4) / 0.5, 0, 1));
        } else if (h < 0.55) {
          c.copy(colDirt).lerp(colGrass, (h - 0.05) / 0.5);
        } else {
          c.copy(colGrass).lerp(colOlive, Math.min(1, (h - 0.55) / 0.9));
        }

        // Slope → rock
        c.lerp(colRock, slope * 0.55);

        // Road → worn dirt / mud
        c.lerp(colDirt, roadProx * 0.72);
        if (roadProx > 0.35) c.lerp(colMud, (roadProx - 0.35) * 0.5);

        // Craters → scorched charcoal
        c.lerp(colScorch, crater * 0.85);

        // Subtle bull-west / bear-east tint (~3–5%)
        const sideTint = x < 0 ? tintBull : tintBear;
        c.lerp(sideTint, 0.035 + Math.min(0.015, Math.abs(x) / 2000));

        colors.push(c.r, c.g, c.b);
      }
    }

    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const Mats = (global.LUNCBattle && LUNCBattle.materials) || null;
    if (Mats && Mats.init) Mats.init(THREE);
    const groundMat = Mats
      ? Mats.get('terrain.ground')
      : new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.97,
          metalness: 0,
          flatShading: false
        });
    const ground = new THREE.Mesh(terrainGeo, groundMat);
    ground.receiveShadow = true;
    ground.castShadow = false;
    ground.name = 'ground';
    group.add(ground);

    // Subtle secondary dirt patches (thin offset planes) — few draw calls
    const patchMat = Mats
      ? Mats.get('terrain.dirtPatch')
      : new THREE.MeshStandardMaterial({
          color: 0x4a3c2c,
          roughness: 1,
          metalness: 0,
          transparent: true,
          opacity: 0.42,
          depthWrite: false
        });
    let patchCount = mobile ? 5 : 9;
    try {
      if (global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getDensityScale) {
        const d = LUNCBattle.quality.getDensityScale().env || 1;
        patchCount = Math.max(3, Math.round(patchCount * d));
      }
    } catch (_) {}
    for (let i = 0; i < patchCount; i++) {
      const px = (seededRand(i + 701) - 0.5) * 100;
      const pz = (seededRand(i + 811) - 0.5) * 58;
      if (Math.abs(px) < 8) continue;
      if (Math.abs(px) > 42 && Math.abs(pz) < 14) continue;
      const pw = 3.5 + seededRand(i + 901) * 5;
      const pd = 2.2 + seededRand(i + 951) * 3.5;
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), patchMat);
      patch.rotation.x = -Math.PI / 2;
      patch.rotation.z = seededRand(i + 980) * Math.PI;
      const py = terrainHeight(px, pz) + 0.04;
      patch.position.set(px, py, pz);
      patch.receiveShadow = true;
      group.add(patch);
    }

    // Soft road tint overlay (not a neon strip)
    const roadMat = Mats
      ? Mats.get('terrain.road')
      : new THREE.MeshStandardMaterial({
          color: 0x3a3226,
          roughness: 1,
          metalness: 0,
          transparent: true,
          opacity: 0.38,
          depthWrite: false
        });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(12.5, 74), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.03, 0);
    road.receiveShadow = true;
    group.add(road);

    scene.add(group);

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
      ground: ground,
      terrainHeight: terrainHeight,
      craters: CRATERS,
      dispose: dispose
    };
  }

  global.LUNCBattle = global.LUNCBattle || {};
  global.LUNCBattle.terrain = { createTerrain: createTerrain, terrainHeight: terrainHeight };
})(window);
