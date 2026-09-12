/* LUNC Battlefield v9.4.4 — unit animation helpers + air rotor/bank (procedural, Three.js r128) */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle = global.LUNCBattle || {};

  const STATES = Object.freeze({
    // Infantry
    IDLE: 'IDLE',
    WALK: 'WALK',
    RUN: 'RUN',
    AIM: 'AIM',
    FIRE: 'FIRE',
    RELOAD: 'RELOAD',
    HIT: 'HIT',
    // Armor
    MOVE: 'MOVE',
    AIM_TURRET: 'AIM_TURRET',
    IDLE_SCAN: 'IDLE_SCAN',
    // Artillery shares AIM / FIRE / RELOAD / IDLE
  });

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dampAngle(current, target, dt, rate) {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return current + d * clamp(dt * rate, 0, 1);
  }

  /**
   * Pick infantry/armor/arty anim state from speed + firing flags.
   * @param {object} unit
   * @param {{speed?:number, momentum?:number, firing?:boolean}} opts
   */
  function pickState(unit, opts) {
    opts = opts || {};
    const ud = unit.userData;
    const type = ud.type;
    const now = opts.now != null ? opts.now : performance.now() * 0.001;
    const speed = opts.speed != null ? opts.speed : (ud.speed || 0);
    const mom = Math.abs(opts.momentum != null ? opts.momentum : 0);

    // Timed fire / reload / hit take priority
    if (ud.fireUntil && now < ud.fireUntil) return STATES.FIRE;
    if (ud.reloadUntil && now < ud.reloadUntil) return STATES.RELOAD;
    if (ud.hitUntil && now < ud.hitUntil) return STATES.HIT;

    if (type === 0) {
      if (opts.firing) return STATES.FIRE;
      if (speed > 2.4 || (speed > 1.1 && mom > 0.12)) return STATES.RUN;
      if (speed > 0.35) return STATES.WALK;
      if (mom > 0.05 && speed > 0.12) return STATES.AIM;
      return STATES.IDLE;
    }
    if (type === 1) {
      if (opts.firing) return STATES.FIRE;
      if (speed > 0.4) return STATES.MOVE;
      if (mom > 0.04) return STATES.AIM_TURRET;
      return STATES.IDLE_SCAN;
    }
    if (type === 3 || type === 4) {
      if (opts.firing) return STATES.FIRE;
      return STATES.MOVE;
    }
    // artillery
    if (opts.firing) return STATES.FIRE;
    if (ud.reloadUntil && now < ud.reloadUntil) return STATES.RELOAD;
    if (mom > 0.03 || Math.abs((opts.targetX || 0) - unit.position.x) > 18) return STATES.AIM;
    return STATES.IDLE;
  }

  function setAnimState(unit, state, now) {
    now = now != null ? now : performance.now() * 0.001;
    const ud = unit.userData;
    if (ud.animState === state) return;
    ud.animState = state;
    ud.animStateAt = now;
    if (state === STATES.FIRE) {
      ud.fireUntil = now + (ud.type === 2 ? 0.28 : ud.type === 1 ? 0.22 : 0.16);
      ud.reloadUntil = ud.fireUntil + (ud.type === 2 ? 1.6 : ud.type === 1 ? 0.85 : 0.55);
      ud.recoil = 1;
    }
  }

  function tickInfantry(unit, dt, now, ctx) {
    ctx = ctx || {};
    const ud = unit.userData;
    const parts = ud.parts || {};
    const state = ud.animState || STATES.IDLE;
    const phase = ud.phase || 0;
    const speed = ud.speed || 0;

    // Face movement / enemy: bulls (+x toward east front), bears (−x)
    const side = ud.side || -1;
    let faceY = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    if (ud.facing != null) faceY = ud.facing;
    // slight turn when moving
    if (Math.abs(speed) > 0.2 && ud.velX != null) {
      const moveYaw = Math.atan2(ud.velX, 0.001);
      faceY = dampAngle(faceY, moveYaw, dt, 4);
    }
    unit.rotation.y = dampAngle(unit.rotation.y, faceY, dt, 6);
    unit.rotation.z = lerp(unit.rotation.z, 0, clamp(dt * 8, 0, 1));
    unit.rotation.x = lerp(unit.rotation.x, 0, clamp(dt * 8, 0, 1));

    let stride = 0;
    let armAmp = 0.18;
    let legAmp = 0.42;
    let crouch = 0;

    if (state === STATES.RUN) {
      stride = now * (8.5 + speed * 0.4) + phase;
      armAmp = 0.55;
      legAmp = 0.72;
    } else if (state === STATES.WALK) {
      stride = now * (5.2 + speed * 0.5) + phase;
      armAmp = 0.32;
      legAmp = 0.48;
    } else if (state === STATES.AIM || state === STATES.FIRE) {
      stride = now * 1.2 + phase;
      armAmp = 0.04;
      legAmp = 0.06;
      crouch = 0.04;
    } else if (state === STATES.RELOAD) {
      stride = now * 2.0 + phase;
      armAmp = 0.12;
      legAmp = 0.08;
    } else if (state === STATES.HIT) {
      unit.rotation.z = Math.sin(now * 28 + phase) * 0.12;
      crouch = 0.08;
    } else {
      stride = now * 1.6 + phase;
      armAmp = 0.06;
      legAmp = 0.05;
    }

    const swing = Math.sin(stride);
    const swingOpp = Math.sin(stride + Math.PI);

    // Opposite arm/leg swings
    if (parts.L_upperLeg) parts.L_upperLeg.rotation.x = swing * legAmp;
    if (parts.R_upperLeg) parts.R_upperLeg.rotation.x = swingOpp * legAmp;
    if (parts.L_lowerLeg) parts.L_lowerLeg.rotation.x = Math.max(0, -swing) * legAmp * 0.85;
    if (parts.R_lowerLeg) parts.R_lowerLeg.rotation.x = Math.max(0, -swingOpp) * legAmp * 0.85;

    if (parts.L_upperArm) {
      parts.L_upperArm.rotation.x = swingOpp * armAmp;
      parts.L_upperArm.rotation.z = -0.22;
    }
    if (parts.R_upperArm) {
      if (state === STATES.AIM || state === STATES.FIRE) {
        parts.R_upperArm.rotation.x = -0.85;
        parts.R_upperArm.rotation.z = 0.15;
      } else if (state === STATES.RELOAD) {
        parts.R_upperArm.rotation.x = -0.35 + Math.sin(now * 6) * 0.25;
        parts.R_upperArm.rotation.z = 0.35;
      } else {
        parts.R_upperArm.rotation.x = swing * armAmp;
        parts.R_upperArm.rotation.z = 0.22;
      }
    }
    if (parts.L_lowerArm) parts.L_lowerArm.rotation.x = Math.max(0, swingOpp) * armAmp * 0.5;
    if (parts.R_lowerArm) {
      parts.R_lowerArm.rotation.x =
        state === STATES.FIRE || state === STATES.AIM ? -0.2 : Math.max(0, swing) * armAmp * 0.45;
    }

    if (parts.torso) {
      parts.torso.rotation.y = swing * (state === STATES.RUN ? 0.08 : 0.04);
      parts.torso.position.y = (parts.torso.userData.baseY || 0.72) - crouch;
    }
    if (parts.hips) {
      parts.hips.position.y = (parts.hips.userData.baseY || 0.42) - crouch * 0.5;
    }
    if (parts.weapon) {
      const w = parts.weapon;
      if (state === STATES.FIRE) {
        const kick = Math.max(0, (ud.fireUntil || 0) - now) / 0.16;
        w.position.z = (w.userData.baseZ || 0.22) - kick * 0.08;
      } else {
        w.position.z = lerp(w.position.z, w.userData.baseZ || 0.22, clamp(dt * 10, 0, 1));
      }
    }

    // Tiny root bob from walk (secondary to terrain feet)
    ud.rootBob = state === STATES.RUN || state === STATES.WALK
      ? Math.abs(Math.sin(stride)) * (state === STATES.RUN ? 0.028 : 0.016)
      : 0;
  }

  function tickArmor(unit, dt, now, ctx) {
    ctx = ctx || {};
    const ud = unit.userData;
    const parts = ud.parts || {};
    const state = ud.animState || STATES.IDLE_SCAN;
    const side = ud.side || -1;
    const speed = ud.speed || 0;

    // Hull faces enemy / movement
    let faceY = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    if (ud.facing != null) faceY = ud.facing;
    unit.rotation.y = dampAngle(unit.rotation.y, faceY, dt, 3.5);

    // Track scroll
    ud.trackPhase = (ud.trackPhase || 0) + speed * dt * 2.8;
    const wheels = parts.wheels || [];
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.x = ud.trackPhase + i * 0.35;
    }
    if (parts.tracks) {
      const tr = parts.tracks;
      if (Array.isArray(tr)) {
        tr.forEach(function (t, i) {
          if (t.material && t.material.map) { /* no maps */ }
          t.position.y = (t.userData.baseY || 0.22) + Math.sin(ud.trackPhase + i) * 0.008 * (speed > 0.2 ? 1 : 0);
        });
      }
    }

    // Turret toward frontline (targetX)
    if (parts.turret) {
      const tx = ctx.targetX != null ? ctx.targetX : 0;
      const dx = tx - unit.position.x;
      // Local yaw: world face already toward ±x; turret yaw relative to hull
      let desiredLocal = 0;
      if (Math.abs(dx) > 0.5) {
        // Look slightly toward front along local +z (after hull yaw)
        desiredLocal = clamp(-dx * 0.02 * side, -0.55, 0.55);
      }
      if (state === STATES.IDLE_SCAN) {
        desiredLocal = Math.sin(now * 0.35 + (ud.phase || 0)) * 0.35;
      }
      parts.turret.rotation.y = dampAngle(parts.turret.rotation.y, desiredLocal, dt, 2.8);
    }

    // Cannon recoil on local z (barrel points along local +z after group orient)
    if (parts.cannon) {
      const c = parts.cannon;
      const baseZ = c.userData.baseZ != null ? c.userData.baseZ : 0.55;
      if (state === STATES.FIRE || (ud.recoil && ud.recoil > 0.05)) {
        ud.recoil = Math.max(0, (ud.recoil || 0) - dt * 4.5);
        c.position.z = baseZ - ud.recoil * 0.35;
      } else {
        c.position.z = lerp(c.position.z, baseZ, clamp(dt * 6, 0, 1));
        ud.recoil = 0;
      }
    }

    ud.rootBob = 0;
  }

  function tickArtillery(unit, dt, now, ctx) {
    ctx = ctx || {};
    const ud = unit.userData;
    const parts = ud.parts || {};
    const state = ud.animState || STATES.IDLE;
    const side = ud.side || -1;

    let faceY = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    if (ud.facing != null) faceY = ud.facing;
    unit.rotation.y = dampAngle(unit.rotation.y, faceY, dt, 2.2);

    if (parts.barrel) {
      const b = parts.barrel;
      const baseElev = b.userData.baseElev != null ? b.userData.baseElev : -0.22;
      let elev = baseElev;
      if (state === STATES.AIM || state === STATES.FIRE) {
        const tx = ctx.targetX != null ? ctx.targetX : 0;
        const dist = Math.abs(tx - unit.position.x);
        elev = baseElev - clamp(dist / 80, 0, 0.35);
      }
      if (state === STATES.RELOAD) {
        elev = baseElev + 0.12;
      }
      b.rotation.x = dampAngle(b.rotation.x, elev, dt, 2.5);

      const baseZ = b.userData.baseZ != null ? b.userData.baseZ : 0.7;
      if (state === STATES.FIRE || (ud.recoil && ud.recoil > 0.05)) {
        ud.recoil = Math.max(0, (ud.recoil || 0) - dt * 2.8);
        b.position.z = baseZ - ud.recoil * 0.45;
      } else {
        b.position.z = lerp(b.position.z, baseZ, clamp(dt * 4, 0, 1));
        if (state !== STATES.FIRE) ud.recoil = 0;
      }
    }

    if (parts.wheels) {
      parts.wheels.forEach(function (w, i) {
        w.rotation.x = Math.sin(now * 0.4 + i) * 0.02;
      });
    }

    ud.rootBob = 0;
  }


  function tickHelicopter(unit, dt, now, ctx) {
    const ud = unit.userData;
    const parts = ud.parts || {};
    if (ud.facing != null) {
      unit.rotation.y = dampAngle(unit.rotation.y, ud.facing, dt, 4.5);
    }
    if (parts.rotor) {
      parts.rotor.rotation.y = (parts.rotor.rotation.y || 0) + dt * 18;
    }
    if (parts.tailRotor) {
      parts.tailRotor.rotation.x = (parts.tailRotor.rotation.x || 0) + dt * 28;
    }
    ud.rootBob = 0;
  }

  function tickJet(unit, dt, now, ctx) {
    const ud = unit.userData;
    if (ud.facing != null) {
      unit.rotation.y = dampAngle(unit.rotation.y, ud.facing, dt, 6);
    }
    // subtle engine pulse via scale on engine meshes
    const parts = ud.parts || {};
    if (parts.engines) {
      const pulse = 1 + Math.sin(now * 14 + (ud.phase || 0)) * 0.03;
      for (let i = 0; i < parts.engines.length; i++) {
        parts.engines[i].scale.setScalar(pulse);
      }
    }
    ud.rootBob = 0;
  }

  function tickUnit(unit, dt, now, ctx) {
    ctx = ctx || {};
    const ud = unit.userData;
    if (!ud) return;

    // v9.4 — LOD anim rates: LOD0 full · LOD1 reduced · LOD2 simple · LOD3 no limb anim
    const lod = ctx.lodBand != null ? ctx.lodBand : (ud.lodBand != null ? ud.lodBand : 0);
    const complexity = ctx.animComplexity || 'high';
    const divisor = ctx.unitUpdateDivisor > 1 ? ctx.unitUpdateDivisor : 1;
    let period = 1;
    try {
      if (global.LUNCBattle && LUNCBattle.lod && LUNCBattle.lod.animPolicy) {
        const pol = LUNCBattle.lod.animPolicy(lod, complexity);
        period = pol.period || 1;
        if (pol.skipLimbAnim) {
          if (ud.facing != null) unit.rotation.y = ud.facing;
          ud.rootBob = 0;
          return;
        }
      }
    } catch (_) {}
    const effDiv = Math.max(divisor, period > 1 ? period : 1);
    if (effDiv > 1) {
      ud._animFrame = (ud._animFrame || 0) + 1;
      if ((ud._animFrame + (ud.index || 0)) % effDiv !== 0 && lod >= 1) {
        if (ud.facing != null) unit.rotation.y = ud.facing;
        return;
      }
    }
    if (lod >= 3) {
      // LOD3: no limb anim (impostor prep)
      if (ud.facing != null) unit.rotation.y = ud.facing;
      ud.rootBob = 0;
      return;
    }
    if (lod >= 2) {
      // LOD2 simple: facing + light bob; air keeps rotor/engine motion readable
      if (ud.facing != null) unit.rotation.y = dampAngle(unit.rotation.y, ud.facing, dt, 6);
      if (ud.type === 3) {
        const parts = ud.parts || {};
        if (parts.rotor) parts.rotor.rotation.y = (parts.rotor.rotation.y || 0) + dt * 14;
        ud.rootBob = 0;
        return;
      }
      if (ud.type === 4) { ud.rootBob = 0; return; }
      ud.rootBob = (ud.type === 0 && (ud.speed || 0) > 0.4) ? Math.sin(now * 6) * 0.02 : 0;
      return;
    }

    const picked = pickState(unit, {
      speed: ud.speed,
      momentum: ctx.momentum,
      firing: !!ud.firing,
      now: now,
      targetX: ctx.targetX
    });
    // Timed FIRE → RELOAD → clear; otherwise use speed/momentum pick
    if (ud.fireUntil && now < ud.fireUntil) ud.animState = STATES.FIRE;
    else if (ud.reloadUntil && now < ud.reloadUntil) ud.animState = STATES.RELOAD;
    else if (ud.hitUntil && now < ud.hitUntil) ud.animState = STATES.HIT;
    else ud.animState = picked;
    const type = ud.type;
    if (type === 0) tickInfantry(unit, dt, now, ctx);
    else if (type === 1) tickArmor(unit, dt, now, ctx);
    else if (type === 3) tickHelicopter(unit, dt, now, ctx);
    else if (type === 4) tickJet(unit, dt, now, ctx);
    else tickArtillery(unit, dt, now, ctx);
  }

  LB.animations = {
    STATES: STATES,
    pickState: pickState,
    setAnimState: setAnimState,
    tickInfantry: tickInfantry,
    tickArmor: tickArmor,
    tickArtillery: tickArtillery,
    tickHelicopter: tickHelicopter,
    tickJet: tickJet,
    tickUnit: tickUnit,
    dampAngle: dampAngle
  };
})(window);
