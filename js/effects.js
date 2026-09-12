/* LUNC Battlefield v9.4.4 — combat effects with pooling & event scaling */
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

    // v8.8 — caps from quality system when available (graphics-only; pooling unchanged)
    const qCaps = (global.LUNCBattle && LUNCBattle.quality && typeof LUNCBattle.quality.getEffectCaps === 'function')
      ? LUNCBattle.quality.getEffectCaps()
      : null;
    const CAPS = qCaps
      ? {
          projectiles: qCaps.projectiles,
          particles: qCaps.particles,
          explosions: qCaps.explosions,
          smoke: qCaps.smoke,
          scorches: qCaps.scorches
        }
      : (mobile
        ? { projectiles: 24, particles: 50, explosions: 4, smoke: 6, scorches: 10 }
        : { projectiles: 48, particles: 120, explosions: 8, smoke: 16, scorches: 24 });
    let effectDurationScale = (qCaps && qCaps.effectDurationScale != null) ? qCaps.effectDurationScale : 1;
    if (ctx.qualityCaps) {
      Object.assign(CAPS, {
        projectiles: ctx.qualityCaps.projectiles != null ? ctx.qualityCaps.projectiles : CAPS.projectiles,
        particles: ctx.qualityCaps.particles != null ? ctx.qualityCaps.particles : CAPS.particles,
        explosions: ctx.qualityCaps.explosions != null ? ctx.qualityCaps.explosions : CAPS.explosions,
        smoke: ctx.qualityCaps.smoke != null ? ctx.qualityCaps.smoke : CAPS.smoke,
        scorches: ctx.qualityCaps.scorches != null ? ctx.qualityCaps.scorches : CAPS.scorches
      });
      if (ctx.qualityCaps.effectDurationScale != null) effectDurationScale = ctx.qualityCaps.effectDurationScale;
    }

    const inactiveProjectiles = [];
    const inactiveParticles = [];
    const scorches = [];
    const shockwaves = [];
    const flashLights = [];

    let activeExplosions = 0;
    let activeSmoke = 0;
    let structureStressCooldownUntil = 0;
    const buildingCooldown = Object.create(null);

    // Shared geometries (pooled meshes reuse these)
    const GEO = {
      tracer: new THREE.CylinderGeometry(0.035, 0.028, 0.85, 5),
      shell: new THREE.CylinderGeometry(0.09, 0.07, 0.55, 6),
      arty: new THREE.SphereGeometry(0.16, 7, 6),
      rocket: new THREE.ConeGeometry(0.09, 0.55, 6),
      spark: new THREE.SphereGeometry(0.1, 5, 4),
      smoke: new THREE.SphereGeometry(0.28, 7, 6),
      scorch: new THREE.CircleGeometry(1, 10),
      ring: new THREE.RingGeometry(0.35, 0.55, 18)
    };
    GEO.tracer.rotateX(Math.PI / 2);
    GEO.shell.rotateX(Math.PI / 2);
    GEO.rocket.rotateX(Math.PI / 2);

    const tmpV = new THREE.Vector3();
    const tmpV2 = new THREE.Vector3();

    function countActive(kind) {
      let n = 0;
      for (let i = 0; i < projectilePool.length; i++) {
        if (projectilePool[i].userData && projectilePool[i].userData.kind === kind) n++;
      }
      return n;
    }

    function canSpawnProjectile() {
      return projectilePool.length < CAPS.projectiles;
    }

    function canSpawnParticle(isSmoke) {
      if (particlePool.length >= CAPS.particles) return false;
      if (isSmoke && activeSmoke >= CAPS.smoke) return false;
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
        mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
        mesh.userData._poolKind = kind;
      }
      mesh.visible = true;
      if (!mesh.parent) scene.add(mesh);
      return mesh;
    }

    function releaseProjectile(mesh) {
      mesh.visible = false;
      if (mesh.parent) scene.remove(mesh);
      const idx = projectilePool.indexOf(mesh);
      if (idx >= 0) projectilePool.splice(idx, 1);
      if (inactiveProjectiles.length < CAPS.projectiles * 2) inactiveProjectiles.push(mesh);
    }

    function acquireParticle(isSmoke) {
      let mesh = null;
      const want = isSmoke ? 'smoke' : 'spark';
      for (let i = inactiveParticles.length - 1; i >= 0; i--) {
        if (inactiveParticles[i].userData._poolKind === want) {
          mesh = inactiveParticles.splice(i, 1)[0];
          break;
        }
      }
      if (!mesh) {
        mesh = new THREE.Mesh(
          isSmoke ? GEO.smoke : GEO.spark,
          new THREE.MeshBasicMaterial({
            color: isSmoke ? 0x3b4039 : 0xffcc66,
            transparent: true,
            opacity: 0.85,
            depthWrite: false
          })
        );
        mesh.userData._poolKind = want;
      }
      mesh.visible = true;
      mesh.scale.set(1, 1, 1);
      if (!mesh.parent) scene.add(mesh);
      return mesh;
    }

    function releaseParticle(mesh) {
      if (mesh.userData.smoke) activeSmoke = Math.max(0, activeSmoke - 1);
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
      // 10M sits between medium and large — treat as large; 100M massive-adjacent → large power bump
      if (a >= 1e8 && a < 1e9) return { tier: 'large', power: 2.15, shake: 0.48 };
      return map[tier];
    }

    function applyShake(tierShake, power) {
      const amp = Math.min(0.55, tierShake || 0);
      if (amp <= 0) return;
      onShake(amp, Math.min(1.4, power || 1));
    }

    function muzzleFlash(x, y, z, color, scale) {
      scale = scale == null ? 1 : scale;
      if (!canSpawnParticle(false) && particlePool.length >= CAPS.particles) {
        dropSmallestParticle();
        if (!canSpawnParticle(false)) return;
      }
      const flash = acquireParticle(false);
      flash.material.color.setHex(color || 0xffe08a);
      flash.material.opacity = 0.95;
      flash.position.set(x, y, z);
      flash.scale.setScalar(0.35 * scale);
      flash.userData = {
        _poolKind: 'spark',
        vx: (Math.random() - 0.5) * 0.4,
        vy: 0.8 + Math.random() * 0.6,
        vz: (Math.random() - 0.5) * 0.4,
        life: 0.12 + Math.random() * 0.08,
        smoke: false,
        gravity: 2
      };
      particlePool.push(flash);

      const light = new THREE.PointLight(color || 0xffe08a, 2.2 * scale, 8 + 4 * scale);
      light.position.set(x, y, z);
      scene.add(light);
      flashLights.push({ light: light, life: 0.09 });
    }

    function spawnParticleBurst(x, y, z, opts) {
      opts = opts || {};
      const count = Math.min(opts.count || 8, mobile ? 10 : 18);
      const power = opts.power || 1;
      const palette = opts.palette || [opts.color || 0xf2c66d, 0xd96f42];
      const isSmoke = !!opts.smoke;
      for (let i = 0; i < count; i++) {
        if (!canSpawnParticle(isSmoke)) {
          if (particlePool.length >= CAPS.particles) dropSmallestParticle();
          if (!canSpawnParticle(isSmoke)) break;
        }
        const p = acquireParticle(isSmoke);
        const col = palette[i % palette.length];
        p.material.color.setHex(col);
        p.material.opacity = isSmoke ? 0.32 : 0.9;
        p.position.set(
          x + (Math.random() - 0.5) * (opts.spread || 1.1),
          y + Math.random() * 0.4,
          z + (Math.random() - 0.5) * (opts.spread || 1.1)
        );
        const speed = (isSmoke ? 0.4 : 2.6) * power;
        p.scale.setScalar(isSmoke ? (0.7 + Math.random() * 0.5) * (opts.scale || 1) : 0.45 + Math.random() * 0.35 * power);
        p.userData = {
          _poolKind: isSmoke ? 'smoke' : 'spark',
          vx: (Math.random() - 0.5) * speed,
          vy: (isSmoke ? 0.45 : 1.2) + Math.random() * (isSmoke ? 0.55 : 2.8) * power,
          vz: (Math.random() - 0.5) * speed,
          life: (isSmoke ? (1.2 + Math.random() * 0.7) : (0.35 + Math.random() * 0.45)) * effectDurationScale,
          smoke: isSmoke,
          gravity: isSmoke ? 0.2 : 5.1
        };
        if (isSmoke) activeSmoke++;
        particlePool.push(p);
      }
    }

    function scorchDecal(x, z, scale) {
      scale = scale == null ? 1 : scale;
      while (scorches.length >= CAPS.scorches) {
        const old = scorches.shift();
        if (old && old.parent) scene.remove(old);
      }
      const mat = new THREE.MeshBasicMaterial({
        color: 0x1a1612,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      });
      const disc = new THREE.Mesh(GEO.scorch, mat);
      disc.rotation.x = -Math.PI / 2;
      const y = terrainHeight(x, z) + 0.04;
      disc.position.set(x, y, z);
      disc.scale.setScalar(0.9 * scale + Math.random() * 0.25);
      disc.userData = { life: 14 + Math.random() * 8, fade: 0.55 };
      scene.add(disc);
      scorches.push(disc);
    }

    function shockwave(x, z, scale) {
      scale = scale == null ? 1 : scale;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe6a8,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ring = new THREE.Mesh(GEO.ring, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, terrainHeight(x, z) + 0.08, z);
      ring.scale.setScalar(0.4 * scale);
      ring.userData = { life: 0.35, maxLife: 0.35, grow: 3.2 * scale };
      scene.add(ring);
      shockwaves.push(ring);
    }

    function impact(x, z, kind, power, color) {
      power = power == null ? 1 : power;
      kind = kind || 'tracer';
      const y = terrainHeight(x, z) + 0.2;
      if (kind === 'tracer') {
        spawnParticleBurst(x, y, z, {
          count: mobile ? 4 : 6,
          power: 0.55 * power,
          color: color || 0xffe08a,
          palette: [color || 0xffe08a, 0xfff3c0],
          spread: 0.45
        });
      } else if (kind === 'shell') {
        spawnParticleBurst(x, y, z, {
          count: mobile ? 8 : 12,
          power: power,
          color: color || 0xf2c66d,
          palette: [color || 0xf2c66d, 0xd96f42, 0x8a6a3a],
          spread: 1.0
        });
        spawnParticleBurst(x, y + 0.3, z, { count: mobile ? 2 : 3, power: 0.7, smoke: true, scale: 0.9 });
        scorchDecal(x, z, 0.7 * power);
        applyShake(0.15, power);
      } else if (kind === 'arty') {
        spawnParticleBurst(x, y, z, {
          count: mobile ? 10 : 16,
          power: 1.3 * power,
          palette: [0x8b7355, 0xc4a574, 0x5c4a32, color || 0xf2c66d],
          spread: 1.6
        });
        spawnParticleBurst(x, y + 0.5, z, { count: mobile ? 3 : 5, power: 1.1, smoke: true, scale: 1.3 });
        scorchDecal(x, z, 1.35 * power);
        shockwave(x, z, 1.1 * power);
        applyShake(0.35, power);
      } else if (kind === 'rocket') {
        spawnParticleBurst(x, y, z, {
          count: mobile ? 8 : 14,
          power: 1.15 * power,
          palette: [color || 0xff8a4a, 0xffcc66, 0xff5522],
          spread: 1.2
        });
        spawnParticleBurst(x, y + 0.4, z, { count: mobile ? 2 : 4, power: 1, smoke: true, scale: 1.1 });
        scorchDecal(x, z, 1.0 * power);
        applyShake(0.22, power);
      }
    }

    function explosion(x, z, opts) {
      opts = opts || {};
      const power = opts.power == null ? 1 : opts.power;
      const color = opts.color != null ? opts.color : 0xf2c66d;
      const isBurn = !!opts.isBurn;
      const kind = opts.kind || (isBurn ? 'burn' : 'blast');

      if (activeExplosions >= CAPS.explosions) return;
      activeExplosions++;
      setTimeout(function () { activeExplosions = Math.max(0, activeExplosions - 1); }, 280);

      const y = terrainHeight(x, z) + 0.25;
      const palette = isBurn
        ? [0xffdc72, 0xf59e0b, 0xe66526, 0xfff3c0]
        : [color, 0xf2c66d, 0xd96f42];
      const count = Math.floor((isBurn ? 18 : 12) * Math.min(2.0, power));
      spawnParticleBurst(x, y, z, {
        count: Math.min(count, mobile ? 12 : 22),
        power: power,
        palette: palette,
        spread: 1.1 + power * 0.35
      });
      spawnParticleBurst(x, y + 0.45, z, {
        count: Math.max(2, Math.round(power * (mobile ? 2 : 3))),
        power: power * 0.9,
        smoke: true,
        scale: isBurn ? 1.2 : 1
      });
      scorchDecal(x, z, (isBurn ? 1.2 : 0.95) * power);
      if (power >= 1.2) shockwave(x, z, 0.85 * power);

      const light = new THREE.PointLight(isBurn ? 0xffc247 : color, isBurn ? 4.4 : 3.0, 16 + power * 4);
      light.position.set(x, 3.0, z);
      scene.add(light);
      flashLights.push({ light: light, life: 0.16 + power * 0.04 });

      const shake = isBurn ? Math.min(0.55, 0.2 + power * 0.12) : Math.min(0.55, 0.12 + power * 0.1);
      applyShake(shake, power);

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

      if (!canSpawnProjectile()) {
        dropOldestProjectile();
        if (!canSpawnProjectile()) return null;
      }

      const mesh = acquireProjectile(kind);
      mesh.material.color.setHex(color);
      const y0 = from.y != null ? from.y : terrainHeight(from.x, from.z) + 1.1;
      const y1 = to.y != null ? to.y : terrainHeight(to.x, to.z) + 0.35;
      mesh.position.set(from.x, y0, from.z != null ? from.z : 0);

      const dx = to.x - from.x;
      const dz = (to.z != null ? to.z : from.z) - (from.z != null ? from.z : 0);
      const dist = Math.max(0.5, Math.sqrt(dx * dx + dz * dz));

      let speed, life, arcH, flashScale;
      if (kind === 'tracer') {
        speed = 28 + power * 6;
        life = Math.min(1.1, dist / speed + 0.15);
        arcH = 0.05;
        flashScale = 0.55;
      } else if (kind === 'shell') {
        speed = 16 + power * 4;
        life = Math.min(2.0, dist / speed + 0.25);
        arcH = 1.2 + power * 0.4;
        flashScale = 0.95;
      } else if (kind === 'arty') {
        speed = 10 + power * 2.5;
        life = Math.min(3.2, dist / speed + 0.55);
        arcH = 4.5 + power * 1.8;
        flashScale = 1.35;
      } else { // rocket
        speed = 14 + power * 3;
        life = Math.min(2.4, dist / speed + 0.35);
        arcH = 1.8 + power * 0.6;
        flashScale = 1.1;
        kind = 'rocket';
      }

      mesh.lookAt(to.x, y1 + arcH * 0.4, to.z != null ? to.z : from.z);
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
        hit: false
      };
      projectilePool.push(mesh);

      muzzleFlash(from.x, y0, from.z != null ? from.z : 0, color, flashScale);
      return mesh;
    }

    /** Backward-compat wrappers used by battle-engine */
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

      // Prefer tower/bunker near impact; |x| high toward faction base (±48)
      let best = null;
      let bestScore = Infinity;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!b || !b.userData) continue;
        const kind = b.userData.kind;
        if (kind !== 'tower' && kind !== 'bunker') continue;
        const bx = b.position.x;
        const bz = b.position.z;
        // Visual stress near bases only (|x| toward faction)
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

      // Prefer DAMAGED only; rare CRITICAL on massive — visual stress test, not economic sim
      let state = 'DAMAGED';
      if (tier === 'massive' && Math.random() < 0.18) state = 'CRITICAL';
      structuresApi.setDamageState(best, state);
      buildingCooldown[id] = now + 12000;
      structureStressCooldownUntil = now + 4500;
    }

    /**
     * LIVE liquidation FX only — call from forceOrder handler with real stream data.
     * SHORT_LIQ / BUY → bull-colored toward bear lines
     * LONG_LIQ / SELL → bear-colored toward bull lines
     */
    function playLiquidationFX(opts) {
      opts = opts || {};
      const usd = +opts.usd || 0;
      const classification = (opts.classification || '').toUpperCase();
      const sideStr = (opts.side || '').toUpperCase();
      const scaled = scaleFromUsd(usd);
      const isLongLiq = classification === 'LONG_LIQ' || sideStr === 'SELL';
      // Longs liquidated → bearish FX toward bull lines (west / negative x)
      // Shorts liquidated → bullish FX toward bear lines (east / positive x)
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

      // Large/massive: brief shockwave + structure stress (projectiles own the impact FX)
      if (scaled.tier === 'large' || scaled.tier === 'massive') {
        shockwave(toX, zz, 0.9 + scaled.power * 0.25);
        maybeStressStructure(toX, zz, scaled.tier, isLongLiq ? -1 : 1);
      }
      applyShake(scaled.shake, scaled.power);
      return scaled;
    }

    /**
     * Burn FX — only when truth is LIVE or explicitly SIMULATED.
     * UNAVAILABLE / unknown → no fake LIVE FX.
     */
    function playBurnFX(opts) {
      opts = opts || {};
      const truth = opts.truth;
      const DT = (LB && LB.DataTruth) || {};
      if (truth !== DT.LIVE && truth !== 'LIVE' && truth !== DT.SIMULATED && truth !== 'SIMULATED') {
        return null;
      }
      const amount = +opts.amountLunc || 0;
      const scaled = scaleFromBurn(amount) || { tier: 'small', power: 1.0, shake: 0.12 };
      // Simulated path always uses modest gold flare (labeled by caller)
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
      applyShake(scaled.shake, power);
      return scaled;
    }

    /** Visual stubs for future whale LIVE hooks — no fabricated events */
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
      muzzleFlash(x, terrainHeight(x, z) + 2.5, z, color, 1.6);
    }

    function prepareWhaleFX() {
      return {
        spawnReinforcementBurst: spawnReinforcementBurst,
        convoyWarning: convoyWarning
      };
    }

    function tick(dt, now, camera) {
      // v9.4: skip expensive far FX updates (simulation projectiles still advance)
      var lodFx = (global.LUNCBattle && LUNCBattle.lod) ? LUNCBattle.lod : null;
      var cam = camera || null;
      var camPos = (cam && cam.position) ? cam.position : null;
      // Projectiles
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

        // Rocket exhaust trail
        if (ud.kind === 'rocket' && !ud.hit) {
          ud.trailAcc = (ud.trailAcc || 0) + dt;
          if (ud.trailAcc > (mobile ? 0.07 : 0.045)) {
            ud.trailAcc = 0;
            if (canSpawnParticle(true) || particlePool.length < CAPS.particles) {
              if (!canSpawnParticle(true) && particlePool.length >= CAPS.particles) dropSmallestParticle();
              if (canSpawnParticle(true)) {
                const smoke = acquireParticle(true);
                smoke.material.color.setHex(0x4a453c);
                smoke.material.opacity = 0.28;
                smoke.position.copy(b.position);
                smoke.scale.setScalar(0.45);
                smoke.userData = {
                  _poolKind: 'smoke',
                  vx: (Math.random() - 0.5) * 0.2,
                  vy: 0.25,
                  vz: (Math.random() - 0.5) * 0.2,
                  life: 0.45,
                  smoke: true,
                  gravity: 0.05
                };
                activeSmoke++;
                particlePool.push(smoke);
              }
            }
          }
        }

        if (ud.hit) {
          if (ud.kind === 'arty' || ud.kind === 'rocket') {
            explosion(b.position.x, b.position.z, {
              power: ud.power * 0.85,
              color: ud.color,
              kind: ud.kind
            });
          } else {
            impact(b.position.x, b.position.z, ud.kind, ud.power * 0.85, ud.color);
          }
          releaseProjectile(b);
        }
      }

      // Particles
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
        if (!ud.smoke) ud.vy -= (ud.gravity != null ? ud.gravity : 5.1) * dt;
        else {
          q.scale.multiplyScalar(1 + dt * 0.45);
          ud.vy -= (ud.gravity != null ? ud.gravity : 0.2) * dt;
        }
        const mat = q.material;
        if (mat) {
          mat.opacity = Math.max(0, ud.smoke ? ud.life * 0.2 : ud.life * 1.35);
        }
        if (ud.life <= 0) releaseParticle(q);
      }

      // Scorches fade
      for (let i = scorches.length - 1; i >= 0; i--) {
        const s = scorches[i];
        s.userData.life -= dt;
        if (s.material) {
          s.material.opacity = Math.max(0, s.userData.fade * (s.userData.life / 18));
        }
        if (s.userData.life <= 0) {
          scene.remove(s);
          scorches.splice(i, 1);
        }
      }

      // Shockwaves
      for (let i = shockwaves.length - 1; i >= 0; i--) {
        const r = shockwaves[i];
        r.userData.life -= dt;
        const grow = r.userData.grow * dt;
        r.scale.x += grow;
        r.scale.y += grow;
        r.scale.z += grow;
        if (r.material) {
          r.material.opacity = Math.max(0, 0.55 * (r.userData.life / r.userData.maxLife));
        }
        if (r.userData.life <= 0) {
          scene.remove(r);
          shockwaves.splice(i, 1);
        }
      }

      // Flash lights
      for (let i = flashLights.length - 1; i >= 0; i--) {
        const f = flashLights[i];
        f.life -= dt;
        if (f.light) f.light.intensity *= 0.82;
        if (f.life <= 0) {
          scene.remove(f.light);
          flashLights.splice(i, 1);
        }
      }
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
      if (next.effectDurationScale != null) effectDurationScale = next.effectDurationScale;
      return CAPS;
    }

    function scaledLife(base) {
      return Math.max(0.08, (base || 0) * effectDurationScale);
    }

    return {
      version: 'v8.8',
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
      // Compat
      launchStrike: launchStrike,
      createExplosion: createExplosion,
      tick: tick
    };
  }

  LB.effects = { createApi: createEffectsApi };
})(window);
