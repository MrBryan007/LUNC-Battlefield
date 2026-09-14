/* LUNC Battlefield v9.4.12.1 — combat impact / FX polish (pooled, quality-capped) */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;

  function createEffectsApi(ctx) {
    const THREE = ctx.THREE;
    const scene = ctx.scene;
    const terrainHeight = ctx.terrainHeight || function () { return 0; };
    const projectilePool = ctx.projectilePool || [];
    const particlePool = ctx.particlePool || [];
    const onShake = typeof ctx.onShake === 'function' ? ctx.onShake : function () {};
    const mobile = !!ctx.mobile;
    const structuresApi = ctx.structuresApi || null;
    const getCamera = typeof ctx.getCamera === 'function' ? ctx.getCamera : function () { return null; };

    const qCaps = (global.LUNCBattle && LUNCBattle.quality && typeof LUNCBattle.quality.getEffectCaps === 'function')
      ? LUNCBattle.quality.getEffectCaps()
      : null;
    const CAPS = qCaps
      ? {
          projectiles: qCaps.projectiles,
          particles: qCaps.particles,
          explosions: qCaps.explosions,
          smoke: qCaps.smoke,
          scorches: qCaps.scorches,
          debris: qCaps.debris != null ? qCaps.debris : (mobile ? 10 : 22),
          aftermath: qCaps.aftermath != null ? qCaps.aftermath : (mobile ? 2 : 4),
          shockwaves: qCaps.shockwaves != null ? qCaps.shockwaves : (mobile ? 3 : 6)
        }
      : (mobile
        ? { projectiles: 24, particles: 50, explosions: 4, smoke: 6, scorches: 10, debris: 10, aftermath: 2, shockwaves: 3 }
        : { projectiles: 48, particles: 120, explosions: 8, smoke: 16, scorches: 24, debris: 22, aftermath: 4, shockwaves: 6 });
    let effectDurationScale = (qCaps && qCaps.effectDurationScale != null) ? qCaps.effectDurationScale : 1;
    if (ctx.qualityCaps) {
      Object.assign(CAPS, {
        projectiles: ctx.qualityCaps.projectiles != null ? ctx.qualityCaps.projectiles : CAPS.projectiles,
        particles: ctx.qualityCaps.particles != null ? ctx.qualityCaps.particles : CAPS.particles,
        explosions: ctx.qualityCaps.explosions != null ? ctx.qualityCaps.explosions : CAPS.explosions,
        smoke: ctx.qualityCaps.smoke != null ? ctx.qualityCaps.smoke : CAPS.smoke,
        scorches: ctx.qualityCaps.scorches != null ? ctx.qualityCaps.scorches : CAPS.scorches,
        debris: ctx.qualityCaps.debris != null ? ctx.qualityCaps.debris : CAPS.debris,
        aftermath: ctx.qualityCaps.aftermath != null ? ctx.qualityCaps.aftermath : CAPS.aftermath,
        shockwaves: ctx.qualityCaps.shockwaves != null ? ctx.qualityCaps.shockwaves : CAPS.shockwaves
      });
      if (ctx.qualityCaps.effectDurationScale != null) effectDurationScale = ctx.qualityCaps.effectDurationScale;
    }

    const inactiveProjectiles = [];
    const inactiveParticles = [];
    const scorches = [];
    const shockwaves = [];
    const flashLights = [];
    const explosionSlots = [];
    const aftermath = [];

    let activeSmoke = 0;
    let activeDebris = 0;
    let structureStressCooldownUntil = 0;
    const buildingCooldown = Object.create(null);

    // Shared geometries (pooled meshes reuse these)
    const GEO = {
      tracer: new THREE.CylinderGeometry(0.018, 0.012, 0.52, 5),
      shell: new THREE.CylinderGeometry(0.07, 0.055, 0.48, 6),
      arty: new THREE.SphereGeometry(0.13, 7, 6),
      rocket: new THREE.ConeGeometry(0.07, 0.42, 6),
      bomb: new THREE.SphereGeometry(0.16, 7, 6),
      spark: new THREE.SphereGeometry(0.07, 5, 4),
      smoke: new THREE.SphereGeometry(0.28, 7, 6),
      debris: new THREE.BoxGeometry(0.11, 0.08, 0.09),
      ember: new THREE.SphereGeometry(0.045, 4, 3),
      flash: new THREE.SphereGeometry(0.16, 6, 5),
      fire: new THREE.SphereGeometry(0.2, 6, 5),
      scorch: new THREE.CircleGeometry(1, 10),
      ring: new THREE.RingGeometry(0.35, 0.55, 18)
    };
    GEO.tracer.rotateX(Math.PI / 2);
    GEO.shell.rotateX(Math.PI / 2);
    GEO.rocket.rotateX(Math.PI / 2);

    const SHARED = {
      scorch: new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.55, depthWrite: false }),
      ring: new THREE.MeshBasicMaterial({ color: 0xffe6a8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      spark: new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.85, depthWrite: false }),
      smoke: new THREE.MeshBasicMaterial({ color: 0x3b4039, transparent: true, opacity: 0.85, depthWrite: false }),
      debris: new THREE.MeshBasicMaterial({ color: 0x6a5740, transparent: true, opacity: 0.95, depthWrite: false }),
      ember: new THREE.MeshBasicMaterial({ color: 0xff6a2a, transparent: true, opacity: 0.9, depthWrite: false }),
      flash: new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0.95, depthWrite: false }),
      fire: new THREE.MeshBasicMaterial({ color: 0xff7a28, transparent: true, opacity: 0.7, depthWrite: false }),
      proj: new THREE.MeshBasicMaterial({ color: 0xffffff })
    };
    const inactiveScorches = [];
    const inactiveRings = [];
    const inactiveLights = [];
    const inactiveAftermath = [];
    const MAX_FLASH_LIGHTS = mobile ? 1 : 3;

    const tmpV = new THREE.Vector3();
    const tmpV2 = new THREE.Vector3();
    const tracerDummy = new THREE.Object3D();
    const tracerMatBull = SHARED.proj.clone();
    tracerMatBull.color.setHex(0x7dffb0);
    const tracerMatBear = SHARED.proj.clone();
    tracerMatBear.color.setHex(0xff8a78);
    const tracerBatchBull = new THREE.InstancedMesh(GEO.tracer, tracerMatBull, CAPS.projectiles);
    const tracerBatchBear = new THREE.InstancedMesh(GEO.tracer, tracerMatBear, CAPS.projectiles);
    tracerBatchBull.count = 0;
    tracerBatchBear.count = 0;
    tracerBatchBull.frustumCulled = false;
    tracerBatchBear.frustumCulled = false;
    tracerBatchBull.castShadow = false;
    tracerBatchBear.castShadow = false;
    scene.add(tracerBatchBull);
    scene.add(tracerBatchBear);

    function syncTracerBatches() {
      let nb = 0, ne = 0;
      for (let i = 0; i < projectilePool.length; i++) {
        const b = projectilePool[i];
        const ud = b.userData;
        if (!ud || ud.kind !== 'tracer' || ud.hit) continue;
        const batch = ud.side < 0 ? tracerBatchBull : tracerBatchBear;
        const n = ud.side < 0 ? nb : ne;
        if (n >= CAPS.projectiles) continue;
        tracerDummy.position.copy(b.position);
        tracerDummy.quaternion.copy(b.quaternion);
        const s = ud.visualScale || 1;
        tracerDummy.scale.set(s, s, s);
        tracerDummy.updateMatrix();
        batch.setMatrixAt(n, tracerDummy.matrix);
        if (ud.side < 0) nb++; else ne++;
      }
      tracerBatchBull.count = nb;
      tracerBatchBear.count = ne;
      tracerBatchBull.instanceMatrix.needsUpdate = true;
      tracerBatchBear.instanceMatrix.needsUpdate = true;
    }

    function qMul() {
      if (effectDurationScale <= 0.75) return 0.55;
      if (effectDurationScale < 0.95) return 0.78;
      if (effectDurationScale > 1.02) return 1.12;
      return 1;
    }

    function particleKind(flag) {
      if (flag === true) return 'smoke';
      if (flag === false || flag == null) return 'spark';
      return flag;
    }

    function geoForParticle(kind) {
      if (kind === 'smoke') return GEO.smoke;
      if (kind === 'debris') return GEO.debris;
      if (kind === 'ember') return GEO.ember;
      if (kind === 'flash') return GEO.flash;
      if (kind === 'fire') return GEO.fire;
      return GEO.spark;
    }

    function matForParticle(kind) {
      if (kind === 'smoke') return SHARED.smoke;
      if (kind === 'debris') return SHARED.debris;
      if (kind === 'ember') return SHARED.ember;
      if (kind === 'flash') return SHARED.flash;
      if (kind === 'fire') return SHARED.fire;
      return SHARED.spark;
    }

    function canSpawnProjectile() {
      return projectilePool.length < CAPS.projectiles;
    }

    function canSpawnParticle(flag) {
      const kind = particleKind(flag);
      if (particlePool.length >= CAPS.particles) return false;
      if (kind === 'smoke' && activeSmoke >= CAPS.smoke) return false;
      if ((kind === 'debris' || kind === 'ember') && activeDebris >= CAPS.debris) return false;
      return true;
    }

    function acquireProjectile(kind) {
      let mesh = null;
      for (let i = inactiveProjectiles.length - 1; i >= 0; i--) {
        if (inactiveProjectiles[i].userData._poolKind === kind) {
          mesh = inactiveProjectiles.splice(i, 1)[0];
          break;
        }
      }
      if (!mesh) {
        let geo = GEO.tracer;
        if (kind === 'shell') geo = GEO.shell;
        else if (kind === 'arty') geo = GEO.arty;
        else if (kind === 'rocket') geo = GEO.rocket;
        else if (kind === 'bomb') geo = GEO.bomb;
        mesh = new THREE.Mesh(geo, SHARED.proj.clone());
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      mesh.userData._poolKind = kind;
      }
      if (kind === 'tracer') {
        mesh.visible = false;
        if (mesh.parent) mesh.parent.remove(mesh);
      } else {
        mesh.visible = true;
        mesh.scale.set(1, 1, 1);
        if (!mesh.parent) scene.add(mesh);
      }
      return mesh;
    }

    function releaseProjectile(mesh) {
      mesh.visible = false;
      mesh.scale.set(1, 1, 1);
      if (mesh.parent) scene.remove(mesh);
      const idx = projectilePool.indexOf(mesh);
      if (idx >= 0) projectilePool.splice(idx, 1);
      if (inactiveProjectiles.length < CAPS.projectiles * 2) inactiveProjectiles.push(mesh);
    }

    function acquireParticle(flag) {
      const want = particleKind(flag);
      let mesh = null;
      for (let i = inactiveParticles.length - 1; i >= 0; i--) {
        if (inactiveParticles[i].userData._poolKind === want) {
          mesh = inactiveParticles.splice(i, 1)[0];
          break;
        }
      }
      if (!mesh) {
        mesh = new THREE.Mesh(geoForParticle(want), matForParticle(want).clone());
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData._poolKind = want;
      }
      mesh.visible = true;
      mesh.scale.set(1, 1, 1);
      if (!mesh.parent) scene.add(mesh);
      return mesh;
    }

    function releaseParticle(mesh) {
      const ud = mesh.userData;
      if (ud && ud.smoke) activeSmoke = Math.max(0, activeSmoke - 1);
      if (ud && (ud._poolKind === 'debris' || ud._poolKind === 'ember' || ud.debris)) {
        activeDebris = Math.max(0, activeDebris - 1);
      }
      mesh.visible = false;
      if (mesh.parent) scene.remove(mesh);
      const idx = particlePool.indexOf(mesh);
      if (idx >= 0) particlePool.splice(idx, 1);
      if (inactiveParticles.length < CAPS.particles * 2) inactiveParticles.push(mesh);
    }

    function dropOldestProjectile() {
      if (!projectilePool.length) return;
      let oldest = 0;
      let minLife = Infinity;
      for (let i = 0; i < projectilePool.length; i++) {
        const life = projectilePool[i].userData.life;
        if (life < minLife) { minLife = life; oldest = i; }
      }
      releaseProjectile(projectilePool[oldest]);
    }

    function dropSmallestParticle() {
      if (!particlePool.length) return;
      let idx = 0;
      let smallest = Infinity;
      for (let i = 0; i < particlePool.length; i++) {
        const s = particlePool[i].scale.x;
        if (s < smallest) { smallest = s; idx = i; }
      }
      releaseParticle(particlePool[idx]);
    }

    function tryParticle(kind) {
      if (canSpawnParticle(kind)) return true;
      if (particlePool.length >= CAPS.particles) dropSmallestParticle();
      return canSpawnParticle(kind);
    }

    function scaleFromUsd(usd) {
      const u = +usd || 0;
      let tier = 'small';
      if (u >= 250000) tier = 'massive';
      else if (u >= 50000) tier = 'large';
      else if (u >= 5000) tier = 'medium';
      const map = {
        small: { tier: 'small', power: 0.7, shake: 0, barrageCount: 1 },
        medium: { tier: 'medium', power: 1.15, shake: 0.15, barrageCount: 2 },
        large: { tier: 'large', power: 1.75, shake: 0.35, barrageCount: 4 },
        massive: { tier: 'massive', power: 2.4, shake: 0.55, barrageCount: 6 }
      };
      return map[tier];
    }

    function scaleFromBurn(amountLunc) {
      const a = +amountLunc || 0;
      let tier = 'small';
      if (a >= 1e9) tier = 'massive';
      else if (a >= 1e8) tier = 'large';
      else if (a >= 1e7) tier = 'large';
      else if (a >= 1e6) tier = 'medium';
      else if (a >= 1e5) tier = 'small';
      else return null;
      const map = {
        small: { tier: 'small', power: 0.9, shake: 0.08 },
        medium: { tier: 'medium', power: 1.35, shake: 0.2 },
        large: { tier: 'large', power: 1.9, shake: 0.4 },
        massive: { tier: 'massive', power: 2.6, shake: 0.55 }
      };
      if (a >= 1e8 && a < 1e9) return { tier: 'large', power: 2.15, shake: 0.48 };
      return map[tier];
    }

    function applyShake(tierShake, power, info) {
      const amp = Math.min(0.55, tierShake || 0);
      if (amp <= 0) return;
      onShake(amp, Math.min(1.4, power || 1), info || null);
    }

    function releaseFlashLight(entry) {
      if (!entry || !entry.light) return;
      const light = entry.light;
      light.intensity = 0;
      if (light.parent) scene.remove(light);
      if (inactiveLights.length < MAX_FLASH_LIGHTS * 2) inactiveLights.push(light);
    }

    function acquireFlashLight(color, intensity, distance, x, y, z, life) {
      while (flashLights.length >= MAX_FLASH_LIGHTS) {
        const oldest = flashLights.shift();
        releaseFlashLight(oldest);
      }
      let light = inactiveLights.pop() || null;
      if (!light) {
        light = new THREE.PointLight(0xffffff, 1, 10);
        light.castShadow = false;
      }
      light.color.setHex(color);
      light.intensity = intensity;
      light.distance = distance;
      light.position.set(x, y, z);
      if (!light.parent) scene.add(light);
      flashLights.push({ light: light, life: life });
    }

    function beginExplosionSlot() {
      if (explosionSlots.length >= CAPS.explosions) return false;
      explosionSlots.push({ life: 0.32 });
      return true;
    }

    /* T1 flash: tiny, at the muzzle, no float-away sphere */
    function muzzleFlash(x, y, z, color, scale, opts) {
      opts = opts || {};
      scale = scale == null ? 1 : scale;
      if (!tryParticle('flash')) return;
      const flash = acquireParticle('flash');
      flash.material.color.setHex(color || 0xffe08a);
      flash.material.opacity = 0.95;
      flash.position.set(x, y, z);
      flash.scale.set(0.55 * scale, 0.28 * scale, 0.55 * scale);
      flash.userData = {
        _poolKind: 'flash',
        vx: (Math.random() - 0.5) * 0.08,
        vy: 0.05,
        vz: (Math.random() - 0.5) * 0.08,
        life: (opts.life != null ? opts.life : (0.055 + Math.random() * 0.03)) * effectDurationScale,
        smoke: false,
        gravity: 0
      };
      particlePool.push(flash);

      if (opts.sparks) {
        const n = Math.min(opts.sparks, mobile ? 2 : 4);
        for (let i = 0; i < n; i++) {
          if (!tryParticle('spark')) break;
          const s = acquireParticle('spark');
          s.material.color.setHex(0xfff3c0);
          s.material.opacity = 0.9;
          s.position.set(x, y, z);
          s.scale.setScalar(0.22 + Math.random() * 0.12);
          const sp = 1.4 + Math.random() * 1.8;
          s.userData = {
            _poolKind: 'spark',
            vx: (Math.random() - 0.5) * sp,
            vy: 0.4 + Math.random() * 1.1,
            vz: (Math.random() - 0.5) * sp,
            life: 0.1 + Math.random() * 0.08,
            smoke: false,
            gravity: 6
          };
          particlePool.push(s);
        }
      }

      if (opts.light) {
        acquireFlashLight(color || 0xffe08a, 1.6 * scale, 6 + 3 * scale, x, y, z, 0.055 + 0.03 * scale);
      }
    }

    function muzzleSmoke(x, y, z, scale) {
      if (!tryParticle(true)) return;
      const p = acquireParticle(true);
      p.material.color.setHex(0x6a675e);
      p.material.opacity = 0.28;
      p.position.set(x, y + 0.05, z);
      p.scale.setScalar(0.35 * (scale || 1));
      p.userData = {
        _poolKind: 'smoke',
        vx: (Math.random() - 0.5) * 0.25,
        vy: 0.55 + Math.random() * 0.35,
        vz: (Math.random() - 0.5) * 0.25,
        life: (0.35 + Math.random() * 0.2) * effectDurationScale,
        smoke: true,
        gravity: 0.12
      };
      activeSmoke++;
      particlePool.push(p);
    }

    function seedTrail(mesh, color, scale) {
      if (!tryParticle(true)) return;
      const smoke = acquireParticle(true);
      smoke.material.color.setHex(color != null ? color : 0x4a453c);
      smoke.material.opacity = 0.3;
      smoke.position.copy(mesh.position);
      smoke.scale.setScalar(0.32 * (scale || 1));
      smoke.userData = {
        _poolKind: 'smoke',
        vx: (Math.random() - 0.5) * 0.12,
        vy: 0.18,
        vz: (Math.random() - 0.5) * 0.12,
        life: 0.28 * effectDurationScale,
        smoke: true,
        gravity: 0.04
      };
      activeSmoke++;
      particlePool.push(smoke);
    }

    function spawnParticleBurst(x, y, z, opts) {
      opts = opts || {};
      const count = Math.min(opts.count || 8, mobile ? 10 : 18);
      const power = opts.power || 1;
      const palette = opts.palette || [opts.color || 0xf2c66d, 0xd96f42];
      const isSmoke = !!opts.smoke;
      const kind = isSmoke ? 'smoke' : 'spark';
      for (let i = 0; i < count; i++) {
        if (!tryParticle(kind)) break;
        const p = acquireParticle(kind);
        const col = palette[i % palette.length];
        p.material.color.setHex(col);
        p.material.opacity = isSmoke ? 0.32 : 0.9;
        p.position.set(
          x + (Math.random() - 0.5) * (opts.spread || 1.1),
          y + Math.random() * 0.4,
          z + (Math.random() - 0.5) * (opts.spread || 1.1)
        );
        const speed = (isSmoke ? 0.4 : 2.6) * power;
        p.scale.setScalar(isSmoke ? (0.7 + Math.random() * 0.5) * (opts.scale || 1) : 0.35 + Math.random() * 0.28 * power);
        p.userData = {
          _poolKind: kind,
          vx: (Math.random() - 0.5) * speed,
          vy: (isSmoke ? 0.45 : 1.2) + Math.random() * (isSmoke ? 0.55 : 2.8) * power,
          vz: (Math.random() - 0.5) * speed,
          life: (isSmoke ? (1.05 + Math.random() * 0.55) : (0.28 + Math.random() * 0.32)) * effectDurationScale,
          smoke: isSmoke,
          gravity: isSmoke ? 0.2 : 5.1
        };
        if (isSmoke) activeSmoke++;
        particlePool.push(p);
      }
    }

    function spawnDebris(x, y, z, opts) {
      opts = opts || {};
      const qm = qMul();
      const count = Math.max(0, Math.round((opts.count || 4) * qm));
      const power = opts.power || 1;
      const palette = opts.palette || [0x6a5740, 0x8b7355, 0x4a3c2a];
      for (let i = 0; i < count; i++) {
        if (!tryParticle('debris')) break;
        const p = acquireParticle('debris');
        p.material.color.setHex(palette[i % palette.length]);
        p.material.opacity = 0.95;
        p.position.set(x + (Math.random() - 0.5) * 0.25, y + Math.random() * 0.15, z + (Math.random() - 0.5) * 0.25);
        const speed = (2.4 + Math.random() * 3.4) * power;
        const ang = Math.random() * Math.PI * 2;
        p.scale.setScalar(0.55 + Math.random() * 0.7 * power);
        p.userData = {
          _poolKind: 'debris',
          debris: true,
          vx: Math.cos(ang) * speed,
          vy: (2.2 + Math.random() * 4.2) * power,
          vz: Math.sin(ang) * speed,
          life: (0.32 + Math.random() * 0.28) * effectDurationScale,
          smoke: false,
          gravity: 14,
          spin: (Math.random() - 0.5) * 8
        };
        activeDebris++;
        particlePool.push(p);
      }
    }

    function spawnEmbers(x, y, z, opts) {
      opts = opts || {};
      const qm = qMul();
      const count = Math.max(0, Math.round((opts.count || 3) * qm));
      const power = opts.power || 1;
      for (let i = 0; i < count; i++) {
        if (!tryParticle('ember')) break;
        const p = acquireParticle('ember');
        p.material.color.setHex(i % 2 ? 0xff6a2a : 0xffcc66);
        p.material.opacity = 0.9;
        p.position.set(x, y + 0.1, z);
        p.scale.setScalar(0.45 + Math.random() * 0.4);
        p.userData = {
          _poolKind: 'ember',
          debris: true,
          vx: (Math.random() - 0.5) * 1.6 * power,
          vy: 1.4 + Math.random() * 2.4 * power,
          vz: (Math.random() - 0.5) * 1.6 * power,
          life: (0.4 + Math.random() * 0.35) * effectDurationScale,
          smoke: false,
          gravity: 3.2
        };
        activeDebris++;
        particlePool.push(p);
      }
    }

    function spawnFireCore(x, z, scale, life) {
      while (aftermath.length >= CAPS.aftermath) {
        const old = aftermath.shift();
        if (old) {
          old.visible = false;
          if (old.parent) scene.remove(old);
          if (inactiveAftermath.length < CAPS.aftermath * 2) inactiveAftermath.push(old);
        }
      }
      let mesh = inactiveAftermath.pop() || null;
      if (!mesh) {
        mesh = new THREE.Mesh(GEO.fire, SHARED.fire.clone());
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
      const y = terrainHeight(x, z) + 0.18;
      mesh.visible = true;
      mesh.material.opacity = 0.72;
      mesh.position.set(x, y, z);
      mesh.scale.set(0.7 * scale, 1.1 * scale, 0.7 * scale);
      mesh.userData = {
        life: (life || 0.7) * effectDurationScale,
        maxLife: (life || 0.7) * effectDurationScale,
        grow: 0.35 * scale
      };
      if (!mesh.parent) scene.add(mesh);
      aftermath.push(mesh);
    }

    function scorchDecal(x, z, scale) {
      scale = scale == null ? 1 : scale;
      while (scorches.length >= CAPS.scorches) {
        const old = scorches.shift();
        if (old) {
          old.visible = false;
          if (old.parent) scene.remove(old);
          if (inactiveScorches.length < CAPS.scorches * 2) inactiveScorches.push(old);
        }
      }
      let disc = inactiveScorches.pop() || null;
      if (!disc) {
        disc = new THREE.Mesh(GEO.scorch, SHARED.scorch.clone());
        disc.castShadow = false;
        disc.receiveShadow = false;
        disc.rotation.x = -Math.PI / 2;
      }
      disc.visible = true;
      disc.material.opacity = 0.5;
      const y = terrainHeight(x, z) + 0.04;
      disc.position.set(x, y, z);
      disc.scale.setScalar(0.85 * scale + Math.random() * 0.2);
      disc.userData = { life: 10 + Math.random() * 6, fade: 0.5 };
      if (!disc.parent) scene.add(disc);
      scorches.push(disc);
    }

    function shockwave(x, z, scale) {
      scale = scale == null ? 1 : scale;
      const cap = Math.max(1, CAPS.shockwaves != null ? CAPS.shockwaves : (mobile ? 3 : 6));
      while (shockwaves.length >= cap) {
        const old = shockwaves.shift();
        if (old) {
          old.visible = false;
          if (old.parent) scene.remove(old);
          if (inactiveRings.length < cap * 2) inactiveRings.push(old);
        }
      }
      let ring = inactiveRings.pop() || null;
      if (!ring) {
        ring = new THREE.Mesh(GEO.ring, SHARED.ring.clone());
        ring.castShadow = false;
        ring.receiveShadow = false;
        ring.rotation.x = -Math.PI / 2;
      }
      ring.visible = true;
      ring.material.opacity = 0.5;
      ring.position.set(x, terrainHeight(x, z) + 0.08, z);
      ring.scale.setScalar(0.35 * scale);
      ring.userData = { life: 0.28, maxLife: 0.28, grow: 3.6 * scale };
      if (!ring.parent) scene.add(ring);
      shockwaves.push(ring);
    }

    function impactFlash(x, y, z, color, scale) {
      if (!tryParticle('flash')) return;
      const flash = acquireParticle('flash');
      flash.material.color.setHex(color || 0xfff1c2);
      flash.material.opacity = 0.92;
      flash.position.set(x, y, z);
      flash.scale.setScalar(0.55 * (scale || 1));
      flash.userData = {
        _poolKind: 'flash',
        vx: 0, vy: 0.15, vz: 0,
        life: 0.07 * effectDurationScale,
        smoke: false,
        gravity: 0
      };
      particlePool.push(flash);
    }

    /* Distinct ground impacts — small arms < armor < arty < rocket < bomb */
    function impact(x, z, kind, power, color) {
      power = power == null ? 1 : power;
      kind = kind || 'tracer';
      const y = terrainHeight(x, z) + 0.18;
      const qm = qMul();

      if (kind === 'tracer') {
        impactFlash(x, y, z, color || 0xffe08a, 0.35);
        spawnParticleBurst(x, y, z, {
          count: Math.max(2, Math.round((mobile ? 3 : 5) * qm)),
          power: 0.4 * power,
          color: color || 0xffe08a,
          palette: [color || 0xffe08a, 0xfff3c0],
          spread: 0.28
        });
        spawnDebris(x, y, z, { count: mobile ? 0 : 1, power: 0.35, palette: [0x8b7355, 0x6a5740] });
      } else if (kind === 'shell') {
        impactFlash(x, y, z, color || 0xf2c66d, 0.85);
        spawnParticleBurst(x, y, z, {
          count: Math.round((mobile ? 6 : 9) * qm),
          power: 0.85 * power,
          color: color || 0xf2c66d,
          palette: [color || 0xf2c66d, 0xd96f42, 0x8a6a3a],
          spread: 0.85
        });
        spawnDebris(x, y, z, { count: mobile ? 2 : 4, power: 0.9 * power });
        spawnParticleBurst(x, y + 0.25, z, { count: mobile ? 1 : 2, power: 0.55, smoke: true, scale: 0.7 });
        scorchDecal(x, z, 0.55 * power);
        acquireFlashLight(color || 0xf2c66d, 2.2, 10, x, y + 0.4, z, 0.08);
      } else if (kind === 'arty') {
        impactFlash(x, y + 0.15, z, 0xfff1c2, 1.35);
        spawnParticleBurst(x, y, z, {
          count: Math.round((mobile ? 8 : 12) * qm),
          power: 1.25 * power,
          palette: [0x8b7355, 0xc4a574, 0x5c4a32, color || 0xf2c66d],
          spread: 1.35
        });
        spawnDebris(x, y, z, { count: mobile ? 4 : 8, power: 1.35 * power });
        spawnParticleBurst(x, y + 0.55, z, { count: mobile ? 2 : 4, power: 1.05, smoke: true, scale: 1.25 });
        spawnEmbers(x, y, z, { count: mobile ? 1 : 3, power: 0.9 });
        scorchDecal(x, z, 1.25 * power);
        shockwave(x, z, 1.05 * power);
        acquireFlashLight(0xffc070, 3.4, 14, x, y + 0.6, z, 0.12);
        applyShake(0.32, power, { x: x, z: z, y: y, kind: 'arty' });
      } else if (kind === 'rocket') {
        impactFlash(x, y, z, color || 0xff8a4a, 1.1);
        spawnParticleBurst(x, y, z, {
          count: Math.round((mobile ? 7 : 11) * qm),
          power: 1.1 * power,
          palette: [color || 0xff8a4a, 0xffcc66, 0xff5522],
          spread: 1.05
        });
        spawnDebris(x, y, z, { count: mobile ? 3 : 5, power: 1.05 * power, palette: [0x6a5740, 0x888078, 0xff8a4a] });
        spawnParticleBurst(x, y + 0.4, z, { count: mobile ? 2 : 3, power: 0.95, smoke: true, scale: 1.05 });
        spawnEmbers(x, y, z, { count: mobile ? 2 : 4, power: 1 });
        scorchDecal(x, z, 0.95 * power);
        shockwave(x, z, 0.7 * power);
        acquireFlashLight(color || 0xff8a4a, 3.0, 12, x, y + 0.5, z, 0.1);
        applyShake(0.18, power, { x: x, z: z, y: y, kind: 'rocket' });
      } else if (kind === 'bomb') {
        explosion(x, z, { power: power, color: color, kind: 'bomb' });
      }
    }

    function explosion(x, z, opts) {
      opts = opts || {};
      const power = opts.power == null ? 1 : opts.power;
      const color = opts.color != null ? opts.color : 0xf2c66d;
      const isBurn = !!opts.isBurn;
      const kind = opts.kind || (isBurn ? 'burn' : 'blast');
      const isBomb = kind === 'bomb';
      const qm = qMul();

      if (!beginExplosionSlot()) return;

      const y = terrainHeight(x, z) + 0.22;
      const palette = isBurn
        ? [0xffdc72, 0xf59e0b, 0xe66526, 0xfff3c0]
        : isBomb
          ? [0xfff1c2, 0xff9a3a, 0xd96f42, 0x8b7355]
          : [color, 0xf2c66d, 0xd96f42];

      impactFlash(x, y + (isBomb ? 0.35 : 0.12), z, isBurn ? 0xffdc72 : 0xfff1c2, isBomb ? 1.8 * power : 1.1 * power);

      spawnParticleBurst(x, y, z, {
        count: Math.min(Math.round((isBomb ? 14 : isBurn ? 14 : 10) * Math.min(1.8, power) * qm), mobile ? 10 : 18),
        power: power,
        palette: palette,
        spread: (isBomb ? 1.35 : 1.0) + power * 0.3
      });

      spawnDebris(x, y, z, {
        count: isBomb ? (mobile ? 6 : 10) : (mobile ? 3 : 6),
        power: (isBomb ? 1.55 : 1.15) * power,
        palette: isBomb ? [0x6a5740, 0x8b7355, 0x4a3c2a, 0x2a241c] : [0x6a5740, 0x8b7355, 0x5c4a32]
      });

      spawnParticleBurst(x, y + (isBomb ? 0.85 : 0.45), z, {
        count: Math.max(2, Math.round(power * (mobile ? 2 : (isBomb ? 5 : 3)) * qm)),
        power: power * (isBomb ? 1.15 : 0.9),
        smoke: true,
        scale: isBurn ? 1.2 : (isBomb ? 1.45 : 1)
      });

      if (isBomb || isBurn || power >= 1.3) {
        spawnEmbers(x, y, z, { count: isBomb ? (mobile ? 4 : 7) : (mobile ? 2 : 4), power: power });
      }

      scorchDecal(x, z, (isBomb ? 1.55 : isBurn ? 1.2 : 0.95) * power);
      if (isBomb || power >= 1.15) shockwave(x, z, (isBomb ? 1.35 : 0.85) * power);

      if (isBomb && CAPS.aftermath > 0) {
        spawnFireCore(x, z, 0.9 + power * 0.35, 0.85 + power * 0.2);
      } else if (isBurn && CAPS.aftermath > 0) {
        spawnFireCore(x, z, 0.7 + power * 0.2, 0.55);
      }

      acquireFlashLight(
        isBurn ? 0xffc247 : (isBomb ? 0xffe08a : color),
        isBomb ? 5.2 : (isBurn ? 4.4 : 3.0),
        (isBomb ? 20 : 16) + power * 4,
        x, isBomb ? 3.6 : 3.0, z,
        (isBomb ? 0.2 : 0.14) + power * 0.04
      );

      const shakeKind = isBomb ? 'bomb' : (isBurn ? 'burn' : kind);
      const shake = isBomb
        ? Math.min(0.5, 0.28 + power * 0.12)
        : isBurn
          ? Math.min(0.5, 0.18 + power * 0.1)
          : Math.min(0.45, 0.1 + power * 0.08);
      applyShake(shake, power, { x: x, z: z, y: y, kind: shakeKind });

      if (opts.stressStructure) {
        maybeStressStructure(x, z, opts.tier || 'large', opts.sideHint);
      }
    }

    function fireWeapon(opts) {
      opts = opts || {};
      const from = opts.from;
      const to = opts.to;
      if (!from || !to) return null;
      let kind = opts.kind || 'tracer';
      const color = opts.color != null ? opts.color : 0xffe08a;
      const power = opts.power == null ? 1 : opts.power;
      const side = opts.side != null ? opts.side : (to.x >= from.x ? 1 : -1);
      const visualScale = opts.visualScale != null ? opts.visualScale : 1;
      const trailScale = opts.trailScale != null ? opts.trailScale : visualScale;

      if (!canSpawnProjectile()) {
        dropOldestProjectile();
        if (!canSpawnProjectile()) return null;
      }

      const mesh = acquireProjectile(kind);
      mesh.material.color.setHex(color);
      if (kind === 'tracer') mesh.material.color.offsetHSL(0, 0, 0.08);
      const y0 = from.y != null ? from.y : terrainHeight(from.x, from.z) + 1.1;
      const y1 = to.y != null ? to.y : terrainHeight(to.x, to.z) + 0.35;
      mesh.position.set(from.x, y0, from.z != null ? from.z : 0);
      mesh.scale.setScalar(visualScale);

      const dx = to.x - from.x;
      const dz = (to.z != null ? to.z : from.z) - (from.z != null ? from.z : 0);
      const dist = Math.max(0.5, Math.sqrt(dx * dx + dz * dz));

      let speed, life, arcH, flashScale;
      if (kind === 'tracer') {
        speed = 34 + power * 6;
        life = Math.min(0.85, dist / speed + 0.08);
        arcH = 0.02;
        flashScale = 0.42 * visualScale;
      } else if (kind === 'shell') {
        speed = 18 + power * 4;
        life = Math.min(1.8, dist / speed + 0.22);
        arcH = 1.05 + power * 0.35;
        flashScale = 1.05;
      } else if (kind === 'arty') {
        speed = 9.5 + power * 2.2;
        life = Math.min(3.2, dist / speed + 0.55);
        arcH = 5.2 + power * 2.0;
        flashScale = 1.55;
      } else if (kind === 'bomb') {
        speed = 11 + power * 2.2;
        life = Math.min(2.8, dist / speed + 0.55);
        arcH = -(2.8 + power * 0.9);
        flashScale = 0.28;
      } else {
        speed = (opts.readableSpeed != null ? opts.readableSpeed : (18 + power * 3.5));
        life = Math.min(2.4, dist / speed + 0.35);
        arcH = 0.45 + power * 0.2;
        flashScale = 0.95 * visualScale;
        kind = 'rocket';
      }

      mesh.lookAt(to.x, y1 + Math.abs(arcH) * 0.25, to.z != null ? to.z : from.z);
      mesh.userData = {
        _poolKind: kind,
        kind: kind,
        tx: to.x,
        ty: y1,
        tz: to.z != null ? to.z : (from.z || 0),
        fromX: from.x,
        fromY: y0,
        fromZ: from.z != null ? from.z : 0,
        speed: speed,
        life: life,
        maxLife: life,
        color: color,
        power: power,
        side: side,
        arcH: arcH,
        trailAcc: 0,
        trailScale: trailScale,
        visualScale: visualScale,
        hit: false,
        runId: opts.runId != null ? opts.runId : null,
        jetStrike: !!opts.jetStrike,
        onHit: typeof opts.onHit === 'function' ? opts.onHit : null
      };
      projectilePool.push(mesh);

      const mz = from.z != null ? from.z : 0;
      if (kind === 'tracer') {
        muzzleFlash(from.x, y0, mz, color, flashScale, { life: 0.045, sparks: 1 });
      } else if (kind === 'shell') {
        muzzleFlash(from.x, y0, mz, color, flashScale, { life: 0.08, sparks: 3, light: true });
        muzzleSmoke(from.x, y0, mz, 0.7);
      } else if (kind === 'arty') {
        muzzleFlash(from.x, y0, mz, 0xfff1c2, flashScale, { life: 0.11, sparks: 5, light: true });
        muzzleSmoke(from.x, y0, mz, 1.15);
        muzzleSmoke(from.x + (Math.random() - 0.5) * 0.2, y0 + 0.1, mz, 0.85);
      } else if (kind === 'rocket') {
        muzzleFlash(from.x, y0, mz, color, flashScale, { life: 0.07, sparks: 2, light: true });
        seedTrail(mesh, 0x4a453c, trailScale);
      } else if (kind === 'bomb') {
        muzzleFlash(from.x, y0, mz, 0xffcc88, 0.3, { life: 0.04 });
      }

      return mesh;
    }

    function launchStrike(fromX, toX, z, color, power) {
      power = power == null ? 1 : power;
      return fireWeapon({
        from: { x: fromX, y: terrainHeight(fromX, z) + 1.15, z: z },
        to: { x: toX, y: terrainHeight(toX, z) + 0.35, z: z },
        kind: power >= 1.05 ? 'arty' : (power >= 0.8 ? 'shell' : 'tracer'),
        color: color,
        power: power
      });
    }

    function createExplosion(x, z, color, power, isBurn) {
      explosion(x, z, { power: power, color: color, isBurn: !!isBurn, kind: isBurn ? 'burn' : 'blast' });
    }

    function fireBarrage(opts) {
      opts = opts || {};
      const n = Math.max(1, opts.count || 3);
      const from = opts.from;
      const to = opts.to;
      const results = [];
      for (let i = 0; i < n; i++) {
        const jitterZ = (Math.random() - 0.5) * (opts.spreadZ || 5);
        const jitterX = (Math.random() - 0.5) * (opts.spreadX || 2.5);
        results.push(fireWeapon({
          from: {
            x: from.x + (opts.staggerX || 0) * i,
            y: from.y,
            z: (from.z || 0) + jitterZ * 0.35
          },
          to: {
            x: to.x + jitterX,
            y: to.y,
            z: (to.z || 0) + jitterZ
          },
          kind: opts.kind || 'rocket',
          color: opts.color,
          power: opts.power || 1.1,
          side: opts.side
        }));
      }
      return results;
    }

    function maybeStressStructure(x, z, tier, sideHint) {
      if (!structuresApi || typeof structuresApi.setDamageState !== 'function') return;
      if (tier !== 'large' && tier !== 'massive') return;
      const now = performance.now();
      if (now < structureStressCooldownUntil) return;

      let list = null;
      if (typeof structuresApi.getBuildings === 'function') {
        list = structuresApi.getBuildings();
      }
      if (!list || !list.length) return;

      let best = null;
      let bestScore = Infinity;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!b || !b.userData) continue;
        const kind = b.userData.kind;
        if (kind !== 'tower' && kind !== 'bunker') continue;
        const bx = b.position.x;
        const bz = b.position.z;
        if (Math.abs(bx) < 28) continue;
        if (sideHint != null && b.userData.side != null && b.userData.side !== sideHint) continue;
        const dx = bx - x;
        const dz = bz - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestScore) {
          bestScore = d2;
          best = b;
        }
      }
      if (!best || bestScore > 22 * 22) return;

      const id = best.uuid || (best.userData.kind + ':' + best.position.x);
      if (buildingCooldown[id] && now < buildingCooldown[id]) return;

      let state = 'DAMAGED';
      if (tier === 'massive' && Math.random() < 0.18) state = 'CRITICAL';
      structuresApi.setDamageState(best, state);
      buildingCooldown[id] = now + 12000;
      structureStressCooldownUntil = now + 4500;
    }

    function playLiquidationFX(opts) {
      opts = opts || {};
      const usd = +opts.usd || 0;
      const classification = (opts.classification || '').toUpperCase();
      const sideStr = (opts.side || '').toUpperCase();
      const scaled = scaleFromUsd(usd);
      const isLongLiq = classification === 'LONG_LIQ' || sideStr === 'SELL';
      const bullColor = opts.bullColor != null ? opts.bullColor : 0x49d39a;
      const bearColor = opts.bearColor != null ? opts.bearColor : 0xe4675f;
      const color = isLongLiq ? bearColor : bullColor;
      const fromX = isLongLiq ? (opts.targetX || 0) + 12 : (opts.targetX || 0) - 12;
      const toX = isLongLiq ? (opts.targetX || 0) - 6 : (opts.targetX || 0) + 6;
      const zz = opts.z != null ? opts.z : (Math.random() - 0.5) * 14;
      const kind = scaled.tier === 'small' ? 'shell'
        : scaled.tier === 'medium' ? 'shell'
        : scaled.tier === 'large' ? 'arty'
        : 'rocket';

      const from = { x: fromX, y: terrainHeight(fromX, zz) + 2.2, z: zz };
      const to = { x: toX, y: terrainHeight(toX, zz) + 0.4, z: zz };

      if (scaled.barrageCount > 1) {
        fireBarrage({
          from: from,
          to: to,
          count: Math.min(scaled.barrageCount, mobile ? 3 : scaled.barrageCount),
          kind: kind === 'rocket' ? 'rocket' : 'arty',
          color: color,
          power: scaled.power,
          spreadZ: 6,
          spreadX: 3
        });
      } else {
        fireWeapon({ from: from, to: to, kind: kind, color: color, power: scaled.power });
      }

      if (scaled.tier === 'large' || scaled.tier === 'massive') {
        shockwave(toX, zz, 0.9 + scaled.power * 0.25);
        maybeStressStructure(toX, zz, scaled.tier, isLongLiq ? -1 : 1);
      }
      // v9.4.12.1: shake comes from the projectile impact/explosion path only (no wrapper double-apply)
      return scaled;
    }

    function playBurnFX(opts) {
      opts = opts || {};
      const truth = opts.truth;
      const DT = (LB && LB.DataTruth) || {};
      if (truth !== DT.LIVE && truth !== 'LIVE' && truth !== DT.SIMULATED && truth !== 'SIMULATED') {
        return null;
      }
      const amount = +opts.amountLunc || 0;
      const scaled = scaleFromBurn(amount) || { tier: 'small', power: 1.0, shake: 0.12 };
      const power = (truth === DT.SIMULATED || truth === 'SIMULATED')
        ? Math.min(scaled.power, 1.25)
        : scaled.power;
      const x = opts.x != null ? opts.x : (Math.random() - 0.5) * 8;
      const z = opts.z != null ? opts.z : (Math.random() - 0.5) * 14;
      explosion(x, z, {
        power: power,
        color: 0xffbf47,
        isBurn: true,
        kind: 'burn',
        stressStructure: scaled.tier === 'massive' || scaled.tier === 'large',
        tier: scaled.tier,
        sideHint: null
      });
      // v9.4.12.1: explosion() already applyShake's once for kind 'burn'
      return scaled;
    }

    function spawnReinforcementBurst(opts) {
      opts = opts || {};
      const x = opts.x || 0;
      const z = opts.z || 0;
      const color = opts.color != null ? opts.color : 0x49d39a;
      spawnParticleBurst(x, terrainHeight(x, z) + 1.2, z, {
        count: mobile ? 6 : 10,
        power: 0.8,
        palette: [color, 0xfff3c0],
        spread: 1.4
      });
      shockwave(x, z, 0.7);
    }

    function convoyWarning(opts) {
      opts = opts || {};
      const x = opts.x || 0;
      const z = opts.z || 0;
      const color = opts.color != null ? opts.color : 0xffcc66;
      shockwave(x, z, 1.4);
      muzzleFlash(x, terrainHeight(x, z) + 2.5, z, color, 1.6, { life: 0.1, light: true });
    }

    function prepareWhaleFX() {
      return {
        spawnReinforcementBurst: spawnReinforcementBurst,
        convoyWarning: convoyWarning
      };
    }

    function tick(dt, now, camera) {
      var lodFx = (global.LUNCBattle && LUNCBattle.lod) ? LUNCBattle.lod : null;
      var cam = camera || getCamera();
      var camPos = (cam && cam.position) ? cam.position : null;

      for (let i = explosionSlots.length - 1; i >= 0; i--) {
        explosionSlots[i].life -= dt;
        if (explosionSlots[i].life <= 0) explosionSlots.splice(i, 1);
      }

      for (let i = projectilePool.length - 1; i >= 0; i--) {
        const b = projectilePool[i];
        const ud = b.userData;
        if (!ud || ud.hit) {
          releaseProjectile(b);
          continue;
        }
        ud.life -= dt;
        const progress = Math.min(1, (ud.maxLife - Math.max(0, ud.life)) / Math.max(1e-4, ud.maxLife));
        if (ud.kind === 'tracer') {
          const dx = ud.tx - b.position.x;
          const dz = ud.tz - b.position.z;
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          const step = ud.speed * dt;
          if (step >= len || ud.life <= 0) {
            b.position.set(ud.tx, ud.ty, ud.tz);
            ud.hit = true;
          } else {
            b.position.x += (dx / len) * step;
            b.position.z += (dz / len) * step;
            b.position.y = terrainHeight(b.position.x, b.position.z) + 1.0 + Math.sin(now * 18 + i) * 0.02;
            b.lookAt(ud.tx, b.position.y, ud.tz);
          }
        } else {
          const px = ud.fromX + (ud.tx - ud.fromX) * progress;
          const pz = ud.fromZ + (ud.tz - ud.fromZ) * progress;
          const py = ud.fromY + (ud.ty - ud.fromY) * progress + Math.sin(progress * Math.PI) * (ud.arcH || 0);
          const prev = Math.max(0, progress - 0.03);
          tmpV.set(
            ud.fromX + (ud.tx - ud.fromX) * prev,
            ud.fromY + (ud.ty - ud.fromY) * prev + Math.sin(prev * Math.PI) * (ud.arcH || 0),
            ud.fromZ + (ud.tz - ud.fromZ) * prev
          );
          b.position.set(px, py, pz);
          tmpV2.set(px - tmpV.x, py - tmpV.y, pz - tmpV.z).normalize();
          if (tmpV2.lengthSq() > 1e-6) b.lookAt(px + tmpV2.x, py + tmpV2.y, pz + tmpV2.z);
          if (progress >= 0.995 || ud.life <= 0) ud.hit = true;
        }

        if ((ud.kind === 'rocket' || ud.kind === 'bomb') && !ud.hit) {
          ud.trailAcc = (ud.trailAcc || 0) + dt;
          const trailEvery = mobile ? 0.07 : 0.04;
          if (ud.trailAcc > trailEvery) {
            ud.trailAcc = 0;
            if (tryParticle(true)) {
              const smoke = acquireParticle(true);
              smoke.material.color.setHex(ud.kind === 'bomb' ? 0x5a564c : 0x4a453c);
              smoke.material.opacity = 0.26;
              smoke.position.copy(b.position);
              smoke.scale.setScalar(0.38 * (ud.trailScale || 1));
              smoke.userData = {
                _poolKind: 'smoke',
                vx: (Math.random() - 0.5) * 0.15,
                vy: 0.22,
                vz: (Math.random() - 0.5) * 0.15,
                life: 0.38 * effectDurationScale,
                smoke: true,
                gravity: 0.05
              };
              activeSmoke++;
              particlePool.push(smoke);
            }
          }
        }

        if (ud.hit) {
          const hx = b.position.x;
          const hz = b.position.z;
          const jetBoost = ud.jetStrike ? 1.22 : 1;
          if (ud.kind === 'bomb') {
            explosion(hx, hz, {
              power: ud.power * 0.95 * jetBoost,
              color: ud.color,
              kind: 'bomb'
            });
          } else if (ud.kind === 'arty') {
            impact(hx, hz, 'arty', ud.power * 0.9 * jetBoost, ud.color);
          } else if (ud.kind === 'rocket') {
            impact(hx, hz, 'rocket', ud.power * 0.9 * jetBoost, ud.color);
            if (ud.jetStrike) {
              spawnParticleBurst(hx, terrainHeight(hx, hz) + 0.5, hz, {
                count: mobile ? 2 : 3,
                power: 0.95 * ud.power,
                smoke: true,
                scale: 1.1
              });
            }
          } else {
            impact(hx, hz, ud.kind, ud.power * 0.85 * jetBoost, ud.color);
            if (ud.jetStrike && ud.kind === 'tracer') {
              spawnParticleBurst(hx, terrainHeight(hx, hz) + 0.25, hz, {
                count: mobile ? 2 : 4,
                power: 0.7,
                palette: [0x8b7355, 0xc4a574, ud.color || 0xffe08a],
                spread: 0.7
              });
            }
          }
          if (typeof ud.onHit === 'function') {
            try { ud.onHit({ x: hx, z: hz, runId: ud.runId, kind: ud.kind, mesh: b }); } catch (_) {}
          }
          ud.onHit = null;
          releaseProjectile(b);
        }
      }

      for (let i = particlePool.length - 1; i >= 0; i--) {
        const q = particlePool[i];
        if (camPos && lodFx && lodFx.shouldUpdateFx &&
            !lodFx.shouldUpdateFx(q.position.x, q.position.z, camera, 95)) {
          q.userData.life -= dt * 1.25;
          if (q.userData.life > 0) continue;
        }
        const ud = q.userData;
        ud.life -= dt;
        q.position.x += ud.vx * dt;
        q.position.y += ud.vy * dt;
        q.position.z += ud.vz * dt;
        if (ud.spin) {
          q.rotation.x += ud.spin * dt;
          q.rotation.z += ud.spin * 0.7 * dt;
        }
        if (ud.smoke) {
          q.scale.multiplyScalar(1 + dt * 0.45);
          ud.vy -= (ud.gravity != null ? ud.gravity : 0.2) * dt;
        } else if (ud._poolKind === 'flash') {
          q.scale.multiplyScalar(1 + dt * 4.5);
        } else {
          ud.vy -= (ud.gravity != null ? ud.gravity : 5.1) * dt;
        }
        const mat = q.material;
        if (mat) {
          if (ud.smoke) mat.opacity = Math.max(0, ud.life * 0.2);
          else if (ud._poolKind === 'flash') mat.opacity = Math.max(0, ud.life * 8);
          else mat.opacity = Math.max(0, ud.life * 1.45);
        }
        if (ud.life <= 0) releaseParticle(q);
      }

      for (let i = scorches.length - 1; i >= 0; i--) {
        const s = scorches[i];
        s.userData.life -= dt;
        if (s.material) {
          s.material.opacity = Math.max(0, s.userData.fade * (s.userData.life / 16));
        }
        if (s.userData.life <= 0) {
          s.visible = false;
          if (s.parent) scene.remove(s);
          scorches.splice(i, 1);
          if (inactiveScorches.length < CAPS.scorches * 2) inactiveScorches.push(s);
        }
      }

      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const r = shockwaves[i];
        r.userData.life -= dt;
        const grow = r.userData.grow * dt;
        r.scale.x += grow;
        r.scale.y += grow;
        r.scale.z += grow;
        if (r.material) {
          r.material.opacity = Math.max(0, 0.5 * (r.userData.life / r.userData.maxLife));
        }
        if (r.userData.life <= 0) {
          r.visible = false;
          if (r.parent) scene.remove(r);
          shockwaves.splice(i, 1);
          if (inactiveRings.length < (CAPS.shockwaves || 6) * 2) inactiveRings.push(r);
        }
      }

      for (let i = aftermath.length - 1; i >= 0; i--) {
        const f = aftermath[i];
        f.userData.life -= dt;
        const t = Math.max(0, f.userData.life / Math.max(1e-4, f.userData.maxLife));
        f.position.y += dt * 0.35;
        f.scale.x += dt * f.userData.grow;
        f.scale.z += dt * f.userData.grow;
        f.scale.y += dt * f.userData.grow * 0.6;
        if (f.material) f.material.opacity = Math.max(0, 0.7 * t);
        if (f.userData.life <= 0) {
          f.visible = false;
          if (f.parent) scene.remove(f);
          aftermath.splice(i, 1);
          if (inactiveAftermath.length < CAPS.aftermath * 2) inactiveAftermath.push(f);
        }
      }

      for (let i = flashLights.length - 1; i >= 0; i--) {
        const f = flashLights[i];
        f.life -= dt;
        if (f.light) f.light.intensity *= 0.78;
        if (f.life <= 0) {
          releaseFlashLight(f);
          flashLights.splice(i, 1);
        }
      }
      syncTracerBatches();
    }

    if (global.addEventListener) {
      global.addEventListener('lunc-quality-change', function () {
        try {
          if (global.LUNCBattle && LUNCBattle.quality && LUNCBattle.quality.getEffectCaps) {
            setCaps(LUNCBattle.quality.getEffectCaps());
          }
        } catch (_) {}
      });
    }

    function setCaps(next) {
      if (!next) return CAPS;
      if (next.projectiles != null) CAPS.projectiles = next.projectiles;
      if (next.particles != null) CAPS.particles = next.particles;
      if (next.explosions != null) CAPS.explosions = next.explosions;
      if (next.smoke != null) CAPS.smoke = next.smoke;
      if (next.scorches != null) CAPS.scorches = next.scorches;
      if (next.debris != null) CAPS.debris = next.debris;
      if (next.aftermath != null) CAPS.aftermath = next.aftermath;
      if (next.shockwaves != null) CAPS.shockwaves = next.shockwaves;
      if (next.effectDurationScale != null) effectDurationScale = next.effectDurationScale;
      return CAPS;
    }

    return {
      version: 'v9.4.14',
      caps: CAPS,
      setCaps: setCaps,
      getDurationScale: function () { return effectDurationScale; },
      scaleFromUsd: scaleFromUsd,
      scaleFromBurn: scaleFromBurn,
      fireWeapon: fireWeapon,
      fireBarrage: fireBarrage,
      muzzleFlash: muzzleFlash,
      impact: impact,
      explosion: explosion,
      scorchDecal: scorchDecal,
      shockwave: shockwave,
      playLiquidationFX: playLiquidationFX,
      playBurnFX: playBurnFX,
      prepareWhaleFX: prepareWhaleFX,
      spawnReinforcementBurst: spawnReinforcementBurst,
      convoyWarning: convoyWarning,
      launchStrike: launchStrike,
      createExplosion: createExplosion,
      tick: tick
    };
  }

  LB.effects = { createApi: createEffectsApi };
})(window);
