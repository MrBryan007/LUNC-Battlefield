/* LUNC Battlefield v12.0.14 — Realism pass, part 2: armies.
 *
 * Purely cosmetic (game/visual layer). Never touches market data, the price→X mapping, the frontline math,
 * army counts or data-truth labels.
 *  1. Materials: object-space procedural camo (onBeforeCompile on MeshStandardMaterial, three r128, no UVs needed).
 *     Bulls woodland / olive drab, Bears dark grey-green with tan. Dust on top faces, grime low down, roughness
 *     rises with dirt. LOW / phone: flat camo base only (uniform switch → no noise work). Faction identity stays
 *     readable through small IFF markers (roof panel on vehicles, shoulder band on infantry).
 *  2. Scale & spacing: MBT ×1.45 / SPG ×1.3 (uniform), vehicle formation slots as staggered ranks with 8–9.5 m
 *     lateral pitch and a hard no-overlap minimum; a light separation pass keeps vehicles from stacking.
 *  3. Motion: vehicle acceleration / braking limits (never overshoot the desired X), max turn rate with hull
 *     heading following travel (reverses instead of spinning around), suspension pitch / roll / bob, turret slew
 *     toward a target at a max rate. Infantry gait variety (per-soldier cadence and stride).
 * Kill switch: ?realism=0 (shared with v12.0.13 realism-pass.js) restores the old look, spacing and motion.
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('realism') !== '0' && qs.get('armies') !== '0';

  // ---------------------------------------------------------------- palettes (sRGB hex)
  // side < 0 = Bulls (woodland / olive drab), side > 0 = Bears (dark grey-green with tan)
  var PAL = {
    bull: { base: 0x4d5631, c1: 0x313b22, c2: 0x5e4a33, c3: 0x22231c, dust: 0x8f8466 },
    bear: { base: 0x485046, c1: 0x30362f, c2: 0x8a7b5c, c3: 0x262825, dust: 0x8a8070 }
  };
  // kind → { mul: base brightness, scale: pattern frequency (1/unit), pat: pattern strength, low: grime band,
  //          rough, metal, dirt }
  var KIND = {
    armor:     { mul: 1.0,  scale: 1.15, pat: 1.0,  lowY: 0.55, lowK: 2.2, rough: 0.74, metal: 0.22, dirt: 1.0 },
    armorDark: { mul: 0.72, scale: 1.15, pat: 0.8,  lowY: 0.5,  lowK: 2.2, rough: 0.8,  metal: 0.2,  dirt: 1.0 },
    art:       { mul: 0.95, scale: 1.2,  pat: 1.0,  lowY: 0.5,  lowK: 2.2, rough: 0.76, metal: 0.2,  dirt: 1.0 },
    uniform:   { mul: 1.08, scale: 5.5,  pat: 0.85, lowY: 0,    lowK: 0,   rough: 0.9,  metal: 0.02, dirt: 0.55 },
    trousers:  { mul: 0.9,  scale: 5.5,  pat: 0.85, lowY: 0,    lowK: 0,   rough: 0.92, metal: 0.02, dirt: 0.7 },
    gear:      { mul: 0.8,  scale: 4.0,  pat: 0.35, lowY: 0,    lowK: 0,   rough: 0.85, metal: 0.04, dirt: 0.5 },
    air:       { mul: 1.0,  scale: 0.6,  pat: 0.18, lowY: 0,    lowK: 0,   rough: 0.55, metal: 0.35, dirt: 0.25, air: true },
    // v11 GLB layers (vertex colours already carry the base; the pattern only modulates)
    glbVeh:    { mul: 1.0,  scale: 1.2,  pat: 1.0,  lowY: 0.45, lowK: 2.4, rough: 0.68, metal: 0.28, dirt: 0.9, glb: true },
    glbInf:    { mul: 1.0,  scale: 5.0,  pat: 0.8,  lowY: 0,    lowK: 0,   rough: 0.85, metal: 0.04, dirt: 0.5, glb: true }
  };
  var SCALE = { 1: 1.45, 2: 1.3 };                 // MBT / SPG uniform scale
  var FOOT = { 1: { L: 4.35, W: 3.2 }, 2: { L: 4.3, W: 2.9 } };   // scaled footprint (m) along facing / lateral
  var MOVE = {                                       // m/s, m/s², rad/s
    1: { vmax: 4.2, acc: 1.6, brake: 2.6, turn: 0.55, slew: 0.65, vz: 2.4 },
    2: { vmax: 2.6, acc: 0.9, brake: 1.8, turn: 0.4,  slew: 0.35, vz: 1.4 }
  };
  var Z_RANGE = { min: -92, max: 50 };                // land area (shore at z≈62, beach ≈57)

  var THREE = null;
  var camoMats = [];                                 // every patched material (detail uniform updated per tier)
  var matCache = {};
  var iffCache = {};
  var lastArmorEnd = { '-1': 46, '1': 46 };
  var state = {
    enabled: enabled, ready: false, detail: 1, tier: '',
    camoMats: 0, iffMarkers: 0, scaled: 0, gaitVaried: 0, slotsBuilt: 0,
    limitedSteps: 0, turnLimited: 0, slews: 0, separations: 0, minVehicleGap: null
  };

  function T() { return THREE || global.THREE; }
  function lin(hex) { return new (T().Color)(hex).convertSRGBToLinear(); }
  function sideKey(side) { return side < 0 ? 'bull' : 'bear'; }
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function isPhone() {
    try {
      if (LB.engine && LB.engine.mobile) return true;
      return (global.innerWidth || 1000) < 760 || /iPhone|iPad|Android/i.test(navigator.userAgent || '');
    } catch (_) { return false; }
  }
  function cheap() { return tierName() === 'LOW' || isPhone(); }
  function det01(i, salt) { var x = Math.sin((i + 1.17) * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); }

  // ---------------------------------------------------------------- camo shader patch (r128)
  var NOISE = [
    'varying vec3 vRzPos;', 'varying vec3 vRzNrm;',
    'uniform float uRzDetail; uniform float uRzScale; uniform float uRzPat; uniform float uRzDirt;',
    'uniform float uRzLowY; uniform float uRzLowK; uniform vec3 uRzC1; uniform vec3 uRzC2; uniform vec3 uRzC3; uniform vec3 uRzDust;',
    'float rzH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
    'float rzN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(rzH(i), rzH(i + vec3(1,0,0)), f.x), mix(rzH(i + vec3(0,1,0)), rzH(i + vec3(1,1,0)), f.x), f.y),',
    '             mix(mix(rzH(i + vec3(0,0,1)), rzH(i + vec3(1,0,1)), f.x), mix(rzH(i + vec3(0,1,1)), rzH(i + vec3(1,1,1)), f.x), f.y), f.z); }'
  ].join('\n');
  var FRAG_COLOR = [
    '#include <color_fragment>',
    'float rzRough = 0.0;',
    '{',
    '  vec3 rzUp = normalize(vRzNrm);',
    '  float rzLow = uRzLowK > 0.0 ? 1.0 - clamp((vRzPos.y - uRzLowY) * uRzLowK + 0.5, 0.0, 1.0) : 0.0;',
    '  if (uRzDetail > 0.5) {',
    '    vec3 rp = vRzPos * uRzScale;',
    '    float n = rzN(rp) * 0.68 + rzN(rp * 2.3 + 7.1) * 0.32;',
    '    vec3 m = vec3(1.0);',
    '    m = mix(m, uRzC1, smoothstep(0.40, 0.44, n) * (1.0 - smoothstep(0.55, 0.59, n)));',
    '    m = mix(m, uRzC2, smoothstep(0.62, 0.66, n));',
    '    m = mix(m, uRzC3, smoothstep(0.30, 0.26, n));',
    '    diffuseColor.rgb *= mix(vec3(1.0), m, uRzPat);',
    '    float g = rzN(rp * 3.7 + 1.7);',
    '    float dust = clamp(max(rzUp.y, 0.0) * 0.32 * g + rzLow * (0.35 + 0.35 * g), 0.0, 0.7) * uRzDirt;',
    '    diffuseColor.rgb = mix(diffuseColor.rgb, uRzDust * (0.75 + 0.4 * g), dust);',
    '    rzRough = dust;',
    '  } else {',
    '    float dust = clamp(max(rzUp.y, 0.0) * 0.12 + rzLow * 0.3, 0.0, 0.4) * uRzDirt;',
    '    diffuseColor.rgb = mix(diffuseColor.rgb, uRzDust, dust);',
    '    rzRough = dust;',
    '  }',
    '}'
  ].join('\n');

  function rzOnBeforeCompile(shader) {
    var u = this.userData && this.userData.rzU;
    if (!u) return;
    for (var k in u) shader.uniforms[k] = u[k];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRzPos;\nvarying vec3 vRzNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRzPos = position;\nvRzNrm = objectNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <color_fragment>', FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + rzRough * 0.28, 0.0, 1.0);');
  }

  /** Patch an existing MeshStandardMaterial with the camo shader. */
  function patch(m, side, kindName) {
    if (!m || !m.isMeshStandardMaterial || (m.userData && m.userData.rzU)) return m;
    var K = KIND[kindName] || KIND.armor, P = PAL[sideKey(side)];
    var base = lin(P.base);
    function rel(hex) { var c = lin(hex); return new (T().Vector3)(c.r / Math.max(1e-4, base.r), c.g / Math.max(1e-4, base.g), c.b / Math.max(1e-4, base.b)); }
    var air = !!K.air;
    var dust = lin(P.dust);
    m.userData = m.userData || {};
    m.userData.rzU = {
      uRzDetail: { value: state.detail }, uRzScale: { value: K.scale }, uRzPat: { value: K.pat }, uRzDirt: { value: K.dirt },
      uRzLowY: { value: K.lowY }, uRzLowK: { value: K.lowK },
      uRzC1: { value: air ? new (T().Vector3)(0.86, 0.88, 0.9) : rel(P.c1) },
      uRzC2: { value: air ? new (T().Vector3)(1.08, 1.06, 1.04) : rel(P.c2) },
      uRzC3: { value: air ? new (T().Vector3)(0.8, 0.8, 0.82) : rel(P.c3) },
      uRzDust: { value: new (T().Vector3)(dust.r, dust.g, dust.b) }
    };
    m.userData.rzKind = kindName; m.userData.rzSide = side;
    m.onBeforeCompile = rzOnBeforeCompile;
    m.customProgramCacheKey = function () { return 'rz-camo-v1'; };
    m.needsUpdate = true;
    camoMats.push(m);
    state.camoMats = camoMats.length;
    return m;
  }

  /** Camo material for a procedural unit part (cached per side+kind). */
  function material(side, kindName) {
    if (!enabled || !T()) return null;
    var key = sideKey(side) + '.' + kindName;
    if (matCache[key]) return matCache[key];
    var K = KIND[kindName] || KIND.armor, P = PAL[sideKey(side)];
    // three r128 treats material colours as linear: convert the sRGB palette so it displays as authored
    // (the camo multipliers / dust are linear too). Raw hex here washed Bears out to pink-white.
    var c = lin(K.air ? (side < 0 ? 0x5d646b : 0x67635a) : P.base);
    c.multiplyScalar(K.mul);
    var m = new (T().MeshStandardMaterial)({ color: c, roughness: K.rough, metalness: K.metal, envMapIntensity: 0.45 });
    m.name = 'rz.' + key;
    try { if (LB.materials && LB.materials.applyEnv) LB.materials.applyEnv(m); } catch (_) {}
    matCache[key] = patch(m, side, kindName);
    return matCache[key];
  }

  /** IFF marker material: faction colour, low emissive so it stays readable but not neon. */
  function iffMaterial(color) {
    var key = String(color);
    if (iffCache[key]) return iffCache[key];
    var m = new (T().MeshStandardMaterial)({ color: color, roughness: 0.6, metalness: 0.05, emissive: color, emissiveIntensity: 0.2 });
    m.name = 'rz.iff.' + key;
    iffCache[key] = m;
    return m;
  }
  var _iffGeo = {};
  function iffGeo(kind) {
    if (_iffGeo[kind]) return _iffGeo[kind];
    var G = T();
    var g;
    if (kind === 'roof') g = new G.BoxGeometry(0.62, 0.035, 0.42);
    else if (kind === 'chevron') g = new G.BoxGeometry(0.5, 0.03, 0.12);
    else g = new G.CylinderGeometry(0.068, 0.068, 0.07, 8, 1, true);   // shoulder band
    _iffGeo[kind] = g;
    return g;
  }

  /** Simple theater figures (squads, barracks, supply runners): camo body + a faction IFF band. */
  function figure(group, side, color, y, r) {
    if (!enabled || !group) return null;
    try {
      var G = T();
      var band = new G.Mesh(new G.CylinderGeometry(r || 0.34, r || 0.34, 0.09, 8, 1, true), iffMaterial(color));
      band.position.y = y || 1.0;
      band.userData.rzIff = true;
      group.add(band);
      state.iffMarkers++;
      return band;
    } catch (_) { return null; }
  }

  /** Called by units.js at creation: add IFF markers, vehicle scale, gait variety. */
  function decorate(g, side, type, color, parts) {
    if (!enabled || !g) return;
    var ud = g.userData;
    var G = T();
    try {
      if (type === 0) {
        // shoulder band on the left upper arm + gait variety
        var arm = parts && parts.L_upperArm;
        if (arm) {
          var band = new G.Mesh(iffGeo('band'), iffMaterial(color));
          band.position.set(0, -0.07, 0);
          band.userData.rzIff = true;
          arm.add(band);
          state.iffMarkers++;
        }
        ud.gaitMul = 0.84 + Math.random() * 0.32;
        ud.gaitAmp = 0.82 + Math.random() * 0.34;
        ud.phase = Math.random() * Math.PI * 2;
        state.gaitVaried++;
      } else if (type === 1 || type === 2) {
        var host = (parts && parts.turret) || g;
        var roof = new G.Mesh(iffGeo('roof'), iffMaterial(color));
        if (type === 1) roof.position.set(0, 0.45, -0.18);   // turret roof panel, behind the lid
        else roof.position.set(0, 0.86, -0.55);              // SPG deck panel
        roof.userData.rzIff = true;
        host.add(roof);
        if (type === 1) {
          var chev = new G.Mesh(iffGeo('chevron'), iffMaterial(color));
          chev.position.set(0, 0.79, 0.95); chev.rotation.x = -0.32;   // glacis chevron
          chev.userData.rzIff = true;
          g.add(chev);
        }
        state.iffMarkers++;
        var s = SCALE[type] || 1;
        g.scale.setScalar(s);
        g.rotation.order = 'YXZ';            // pitch/roll in the hull frame
        ud.rzScale = s;
        state.scaled++;
      }
    } catch (_) {}
  }

  // ---------------------------------------------------------------- formation slots (vehicles)
  /**
   * Staggered ranks. Lateral pitch P (target 8–9.5 m centre spacing), rank pitch R (> vehicle length, so
   * diagonal neighbours never overlap), widened laterally inside the land area before going deeper.
   * Depth is the distance behind the live frontline (applied by the engine — front math untouched).
   */
  function vehicleSlots(count, side, type, S) {
    var slots = [];
    if (count <= 0) return slots;
    var F = FOOT[type] || FOOT[1];
    var P = type === 1 ? 8.6 : 9.2, R = type === 1 ? 6.0 : 6.4;
    var minP = F.W + 2.6, minR = F.L + 1.1;
    var D0 = type === 1 ? 12.0 : (lastArmorEnd[String(side < 0 ? -1 : 1)] + 5);
    var budget = type === 1 ? 34 : 26;
    var spanMax = Z_RANGE.max - Z_RANGE.min;
    var span = Math.min(spanMax, (type === 1 ? 84 : 70) * Math.max(1, (S || 1) / 2));
    // small armies (phone / LOW) form a compact company block (≥ 2–3 ranks) instead of one long thin line
    if (count <= 40) span = Math.min(span, Math.max(P * 3, P * (Math.ceil(count / 3) - 1)));
    function rowsFor(sp, p) { var per = Math.max(1, Math.floor(sp / p) + 1); return { per: per, rows: Math.ceil(count / per) }; }
    var L = rowsFor(span, P);
    while (L.rows * R > budget && span < spanMax) { span = Math.min(spanMax, span + 8); L = rowsFor(span, P); }
    if (L.rows * R > budget) R = Math.max(minR, budget / L.rows);
    while (L.rows * R > budget && P > minP) { P = Math.max(minP, P - 0.4); L = rowsFor(span, P); }
    // centre the block on z=0 when it fits, else shift north (the coast is to the south)
    var used = Math.min(span, (L.per - 1) * P);
    var zc = Math.min(0, Z_RANGE.max - 2 - used / 2);
    if (zc - used / 2 < Z_RANGE.min) zc = Z_RANGE.min + used / 2;
    var i = 0;
    for (var r = 0; r < L.rows && i < count; r++) {
      var inRow = Math.min(L.per, count - i);
      var stagger = (r % 2) * P * 0.5;
      var rowW = (inRow - 1) * P;
      for (var k = 0; k < inRow; k++, i++) {
        var z = zc - rowW / 2 + k * P + (r % 2 && inRow > 1 ? stagger - P * 0.25 : 0);
        z += (det01(i, 41 + type) - 0.5) * Math.min(1.2, (P - F.W) * 0.3);
        var depth = D0 + r * R + (det01(i, 43 + type) - 0.5) * Math.min(0.8, (R - F.L) * 0.5);
        var yaw = (det01(i, 47 + type) - 0.5) * 0.12;
        slots.push({ x: side * depth, z: Math.max(Z_RANGE.min, Math.min(Z_RANGE.max, z)), depth: depth, yaw: yaw, cluster: Math.floor(i / 2), rz: true });
      }
    }
    if (type === 1) lastArmorEnd[String(side < 0 ? -1 : 1)] = D0 + L.rows * R;
    state.slotsBuilt++;
    state.lastSlots = state.lastSlots || {};
    state.lastSlots[(side < 0 ? 'bull' : 'bear') + type] = { n: count, perRow: L.per, rows: L.rows, P: +P.toFixed(2), R: +R.toFixed(2), span: +used.toFixed(1), depth0: +D0.toFixed(1) };
    return slots;
  }

  // ---------------------------------------------------------------- motion
  function rz(u) { var ud = u.userData; return ud.rz || (ud.rz = { v: 0, vz: 0, yaw: null, pitch: 0, roll: 0, prevV: 0, px: u.position.x, pz: u.position.z, aimZ: 0, aimT: 0, tYaw: 0 }); }
  function angDiff(a, b) { var d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

  /** Accel/brake/vmax-limited X step for vehicles. dx = desired - x (desired comes from the untouched front math). */
  function limitStep(u, type, step, dx, dt) {
    if (!enabled || (type !== 1 && type !== 2) || !(dt > 0)) return step;
    var M = MOVE[type], s = rz(u);
    var vWant = step / dt;
    var stopV = Math.sqrt(2 * M.brake * Math.abs(dx));           // can still stop before the desired X
    vWant = Math.sign(vWant) * Math.min(Math.abs(vWant), M.vmax, stopV);
    var dv = vWant - s.v;
    var lim = (Math.abs(vWant) > Math.abs(s.v) && Math.sign(vWant) === Math.sign(s.v || vWant) ? M.acc : M.brake) * dt;
    s.v += Math.max(-lim, Math.min(lim, dv));
    var out = s.v * dt;
    if (Math.abs(out) > Math.abs(dx) && Math.sign(out) === Math.sign(dx)) { out = dx; s.v = dx / dt * 0.5; }
    if (Math.abs(out - step) > 1e-4) state.limitedSteps++;
    return out;
  }

  function terrainH(x, z) { try { return LB.engine.terrainHeight(x, z) || 0; } catch (_) { return 0; } }

  /** After the engine positioned and animated a ground unit: hull heading/turn-rate, suspension, turret slew. */
  function postTick(u, type, side, dt, now, targetX) {
    if (!enabled || (type !== 1 && type !== 2) || !(dt > 0)) return;
    var ud = u.userData, M = MOVE[type], s = rz(u);
    if (ud.rdDown || ud.dead || ud.wreck) return;
    if (Math.abs(u.position.z - s.pz) > 6 || Math.abs(u.position.x - s.px) > 6) {   // respawn / teleport: no slide
      s.px = u.position.x; s.pz = u.position.z; s.v = 0; s.vz = 0; s.prevV = 0;
    }
    // lateral (AI z-steer) speed limit with acceleration
    var dzRaw = u.position.z - s.pz;
    var vzWant = dzRaw / dt;
    var lim = M.acc * dt;
    s.vz += Math.max(-lim, Math.min(lim, vzWant - s.vz));
    s.vz = Math.max(-M.vz, Math.min(M.vz, s.vz));
    u.position.z = s.pz + s.vz * dt;
    var vx = (u.position.x - s.px) / dt, vz = s.vz;
    s.px = u.position.x; s.pz = u.position.z;
    var spd = Math.sqrt(vx * vx + vz * vz);
    // hull heading: follow travel when moving, else face the enemy; reverse when backing away
    var face = (side < 0 ? Math.PI / 2 : -Math.PI / 2) + ((ud.home && ud.home.yaw) || 0);
    if (s.yaw == null) s.yaw = face;
    var want = face;
    if (spd > 0.35) {
      var mv = Math.atan2(vx, vz);
      if (Math.cos(angDiff(mv, face)) < -0.2) mv += Math.PI;     // backing up → keep the front toward the enemy
      var k = Math.min(1, (spd - 0.35) / 1.2);
      want = face + angDiff(face, mv) * k;
    }
    var d = angDiff(s.yaw, want), maxT = M.turn * dt;
    if (Math.abs(d) > maxT) state.turnLimited++;
    s.yaw += Math.max(-maxT, Math.min(maxT, d));
    u.rotation.y = s.yaw;
    // suspension: pitch from accel + slope, roll from cross-slope, small bob when moving
    var acc = (s.v - s.prevV) / dt; s.prevV = s.v;
    var fwdX = Math.sin(s.yaw), fwdZ = Math.cos(s.yaw), hl = (FOOT[type].L || 4) * 0.42, hw = (FOOT[type].W || 3) * 0.42;
    var x = u.position.x, z = u.position.z;
    var slopeP = Math.atan2(terrainH(x + fwdX * hl, z + fwdZ * hl) - terrainH(x - fwdX * hl, z - fwdZ * hl), hl * 2);
    var slopeR = Math.atan2(terrainH(x + fwdZ * hw, z - fwdX * hw) - terrainH(x - fwdZ * hw, z + fwdX * hw), hw * 2);
    var signedV = s.v * (side < 0 ? 1 : -1);                      // + = forward toward the enemy
    var accF = acc * (side < 0 ? 1 : -1);
    // suspension soaks up most of the terrain: clamp to a believable hull attitude (≈ ±5° pitch, ±4° roll)
    slopeP = Math.max(-0.07, Math.min(0.07, slopeP * 0.6));
    slopeR = Math.max(-0.06, Math.min(0.06, slopeR * 0.6));
    var pitchWant = -slopeP + Math.max(-0.03, Math.min(0.03, -accF * 0.016));   // accel → nose up (negative x)
    s.pitch += (pitchWant - s.pitch) * Math.min(1, dt * 4);
    s.roll += (slopeR - s.roll) * Math.min(1, dt * 4);
    var bob = spd > 0.2 ? Math.sin(now * (7 + spd * 1.5) + (ud.phase || 0)) * 0.012 * Math.min(1, spd / 2) : 0;
    u.rotation.x = s.pitch + bob * 0.5;
    u.rotation.z = s.roll;
    u.position.y += Math.abs(bob) * 0.6;
    ud.rzSpeed = Math.abs(signedV);
    // turret slew toward a target point on the enemy side, max slew rate
    var tur = ud.parts && ud.parts.turret;
    if (tur && type === 1) {
      if (now > s.aimT) { s.aimT = now + 3 + Math.random() * 4; s.aimZ = (Math.random() - 0.5) * 18; }
      var firing = ud.animState === 'FIRE' || ud.animState === 'AIM';
      var ax = (targetX != null ? targetX : 0) - side * (firing ? 4 : 10), az = z + (firing ? s.aimZ * 0.3 : s.aimZ);
      var worldYaw = Math.atan2(ax - x, az - z);
      var local = angDiff(0, worldYaw - s.yaw);
      var dl = angDiff(s.tYaw, local), ms = M.slew * dt;
      s.tYaw += Math.max(-ms, Math.min(ms, dl));
      tur.rotation.y = s.tYaw;
      state.slews++;
    }
  }

  /** Light separation between vehicles of one side (spatial hash, mostly lateral push). */
  var _grid = new Map();
  function separate(list, dt) {
    if (!enabled || !list || !list.length) return;
    _grid.clear();
    var C = 8, n = 0, minGap = Infinity;
    for (var i = 0; i < list.length; i++) {
      var u = list[i], t = u && u.userData && (u.userData.type | 0);
      if (!u || u.userData.air || (t !== 1 && t !== 2) || u.userData.rdDown) continue;
      var key = Math.floor(u.position.x / C) + ',' + Math.floor(u.position.z / C);
      var cell = _grid.get(key); if (!cell) _grid.set(key, cell = []);
      cell.push(u); n++;
    }
    if (n < 2) return;
    _grid.forEach(function (cell, key) {
      var p = key.split(','), cx = +p[0], cz = +p[1];
      for (var a = 0; a < cell.length; a++) {
        var A = cell[a], FA = FOOT[A.userData.type | 0];
        for (var ox = -1; ox <= 1; ox++) for (var oz = -1; oz <= 1; oz++) {
          var nb = _grid.get((cx + ox) + ',' + (cz + oz)); if (!nb) continue;
          for (var b = 0; b < nb.length; b++) {
            var B = nb[b]; if (B === A || B.id < A.id) continue;
            var dx = B.position.x - A.position.x, dz = B.position.z - A.position.z;
            var FB = FOOT[B.userData.type | 0];
            var needX = (FA.L + FB.L) * 0.5 + 0.8, needZ = (FA.W + FB.W) * 0.5 + 0.8;
            var gap = Math.sqrt(dx * dx + dz * dz); if (gap < minGap) minGap = gap;
            if (Math.abs(dx) < needX && Math.abs(dz) < needZ) {
              var push = (needZ - Math.abs(dz)) * Math.min(1, dt * 6) * 0.5;
              var sz = dz >= 0 ? 1 : -1;
              A.position.z -= push * sz; B.position.z += push * sz;
              if (A.userData.rz) A.userData.rz.pz = A.position.z;
              if (B.userData.rz) B.userData.rz.pz = B.position.z;
              state.separations++;
            }
          }
        }
      }
    });
    if (isFinite(minGap)) state.minVehicleGap = +minGap.toFixed(2);
  }

  /** AI z clamp for one unit: keep units near their own (wide-front) home lane instead of ±15 m. */
  function aiZLimit(u, base) {
    if (!enabled) return base;
    var hz = u && u.userData && u.userData.home ? Math.abs(u.userData.home.z) : 0;
    return Math.max(base, hz + 3);
  }

  // ---------------------------------------------------------------- tier handling
  function refreshTier() {
    var t = tierName(), d = cheap() ? 0 : 1;
    state.tier = t;
    if (d === state.detail) return;
    state.detail = d;
    for (var i = 0; i < camoMats.length; i++) {
      var u = camoMats[i].userData && camoMats[i].userData.rzU;
      if (u) u.uRzDetail.value = d;
    }
  }

  function init() {
    THREE = global.THREE || null;
    state.ready = !!THREE;
    state.detail = cheap() ? 0 : 1;
    setInterval(function () { try { refreshTier(); } catch (_) {} }, 1000);
  }

  LB.armyRealism = {
    isEnabled: function () { return enabled; },
    getState: function () { var s = Object.assign({}, state); s.camoMats = camoMats.length; return s; },
    material: material,
    patch: patch,
    iffMaterial: iffMaterial,
    decorate: decorate,
    figure: figure,
    vehicleSlots: vehicleSlots,
    limitStep: limitStep,
    postTick: postTick,
    separate: separate,
    aiZLimit: aiZLimit,
    palette: function (side) { return PAL[sideKey(side)]; },
    /** sRGB hex for soldier fatigues (ragdolls / persistent bodies). */
    bodyColor: function (side) { return lin(side < 0 ? 0x525b38 : 0x4d544a).getHex(); },
    /** Far-LOD stub colour (dark camo silhouette instead of pastel). */
    stubColor: function (side) { return lin(side < 0 ? 0x3f4830 : 0x474b42).getHex(); },
    SCALE: SCALE, MOVE: MOVE, FOOT: FOOT
  };
  if (!enabled) {
    // keep a tiny API so callers can feature-detect cheaply
    LB.armyRealism = { isEnabled: function () { return false; }, getState: function () { return { enabled: false }; } };
    return;
  }
  init();
})(window);
