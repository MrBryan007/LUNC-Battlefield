/* LUNC Battlefield v9.4.2 — true LOD (semantic groups + impostor stub + cull diag)
 * LUNCBattle.lod — camera distance → LOD0–3; never despawns simulation state.
 * Missing LOD / GLB → procedural SAFE FALLBACK forever. No black canvas.
 */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle || (global.LUNCBattle = {});

  /** Default enter thresholds (world units). Leave thresholds = enter − hysteresis. */
  var DEFAULT_ENTER = Object.freeze({ LOD0: 24, LOD1: 44, LOD2: 70, LOD3: 999 });
  var DEFAULT_HYST = 4;

  /** Quality multipliers / overrides for enter thresholds. */
  var QUALITY_ENTER = Object.freeze({
    LOW: Object.freeze({ LOD0: 16, LOD1: 32, LOD2: 55, LOD3: 999 }),
    MEDIUM: Object.freeze({ LOD0: 20, LOD1: 40, LOD2: 65, LOD3: 999 }),
    HIGH: Object.freeze({ LOD0: 24, LOD1: 44, LOD2: 70, LOD3: 999 }),
    ULTRA: Object.freeze({ LOD0: 30, LOD1: 52, LOD2: 82, LOD3: 999 })
  });

  /** Anim update period multipliers by LOD (1 = every frame). Quality scales further. */
  var ANIM_PERIOD = Object.freeze({
    0: 1,   // full
    1: 2,   // reduced-freq
    2: 4,   // simple / sparse
    3: 0    // no limb anim
  });

  var _scratchCam = null;
  var _frustum = null;
  var _projScreen = null;
  var _counts = { lod0: 0, lod1: 0, lod2: 0, lod3: 0, culled: 0, units: 0, structures: 0, props: 0 };
  var _displayCounts = { lod0: 0, lod1: 0, lod2: 0, lod3: 0, culled: 0, units: 0, structures: 0, props: 0 };
  var _frameId = 0;

  function qualityKey() {
    try {
      if (LB.quality && LB.quality.getEffectiveName) {
        return String(LB.quality.getEffectiveName() || 'HIGH').toUpperCase();
      }
      if (LB.quality && LB.quality.getState) {
        return String(LB.quality.getState().effective || 'HIGH').toUpperCase();
      }
      if (LB.quality && LB.quality.getEffectivePreset) {
        var p = LB.quality.getEffectivePreset();
        if (p && p.unitDetail) {
          var ud = String(p.unitDetail).toLowerCase();
          if (ud === 'low') return 'LOW';
          if (ud === 'medium') return 'MEDIUM';
          if (ud === 'ultra') return 'ULTRA';
        }
      }
    } catch (_) {}
    return 'HIGH';
  }

  function getEnterThresholds() {
    var q = qualityKey();
    if (QUALITY_ENTER[q]) return QUALITY_ENTER[q];
    try {
      if (LB.quality && LB.quality.getEffectivePreset) {
        var lod = LB.quality.getEffectivePreset().lod;
        if (lod && lod.LOD0 != null) {
          return {
            LOD0: lod.LOD0,
            LOD1: lod.LOD1,
            LOD2: lod.LOD2,
            LOD3: lod.LOD3 != null ? lod.LOD3 : 999
          };
        }
      }
    } catch (_) {}
    return DEFAULT_ENTER;
  }

  function getHysteresis() {
    var q = qualityKey();
    if (q === 'LOW') return 3;
    if (q === 'ULTRA') return 5;
    return DEFAULT_HYST;
  }

  /**
   * Band from distance without hysteresis (raw).
   * d ≤ LOD0 → 0; ≤ LOD1 → 1; ≤ LOD2 → 2; else 3.
   */
  function bandFromDistance(distance, enter) {
    var d = +distance || 0;
    enter = enter || getEnterThresholds();
    if (d <= enter.LOD0) return 0;
    if (d <= enter.LOD1) return 1;
    if (d <= enter.LOD2) return 2;
    return 3;
  }

  /**
   * Hysteresis-aware LOD: keep previous band until leave threshold crossed.
   * Example: LOD0→1 when d ≥ 24; LOD1→0 when d < 20 (24 − 4).
   */
  function resolveLod(distance, previousLod, opts) {
    opts = opts || {};
    var enter = opts.enter || getEnterThresholds();
    var hyst = opts.hysteresis != null ? opts.hysteresis : getHysteresis();
    var prev = previousLod == null ? bandFromDistance(distance, enter) : (previousLod | 0);
    if (prev < 0) prev = 0;
    if (prev > 3) prev = 3;
    var d = +distance || 0;
    var raw = bandFromDistance(d, enter);

    if (raw > prev) {
      var promoteAt;
      if (prev === 0) promoteAt = enter.LOD0;
      else if (prev === 1) promoteAt = enter.LOD1;
      else promoteAt = enter.LOD2;
      if (d >= promoteAt) return Math.min(3, prev + 1);
      return prev;
    }
    if (raw < prev) {
      var leaveAt;
      if (prev === 1) leaveAt = enter.LOD0 - hyst;
      else if (prev === 2) leaveAt = enter.LOD1 - hyst;
      else if (prev === 3) leaveAt = enter.LOD2 - hyst;
      else leaveAt = -1;
      if (d < leaveAt) return Math.max(0, prev - 1);
      return prev;
    }
    return raw;
  }

  function distanceXZ(ax, az, bx, bz) {
    var dx = ax - bx;
    var dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function distanceToCamera(obj, camera) {
    if (!obj || !obj.position || !camera || !camera.position) return 0;
    return distanceXZ(obj.position.x, obj.position.z, camera.position.x, camera.position.z);
  }

  function setVis(obj, on) {
    if (obj) obj.visible = !!on;
  }

  /** Toggle an array or single Object3D. */
  function setGroupVis(list, on) {
    if (!list) return;
    if (Array.isArray(list)) {
      for (var i = 0; i < list.length; i++) setVis(list[i], on);
    } else {
      setVis(list, on);
    }
  }

  /**
   * Register semantic LOD groups on a procedural mesh root.
   * groups: { core|silhouette, major, detail, limbs } → Object3D | Object3D[]
   */
  function registerLodGroups(root, groups) {
    if (!root) return null;
    root.userData = root.userData || {};
    var g = groups || {};
    root.userData.lodGroups = {
      core: g.core || g.silhouette || null,
      silhouette: g.silhouette || g.core || null,
      major: g.major || null,
      detail: g.detail || null,
      limbs: g.limbs || null
    };
    return root.userData.lodGroups;
  }

  /**
   * Update unit LOD on userData; returns new band.
   * Preserves simulation — never despawns.
   */
  function updateUnitLod(unit, camera, opts) {
    if (!unit || !unit.userData) return 0;
    var dist = distanceToCamera(unit, camera);
    var prev = unit.userData.lodBand;
    var band = resolveLod(dist, prev, opts);
    unit.userData.lodBand = band;
    unit.userData.lodDistance = dist;
    unit.userData.lodKind = 'unit';
    applyProceduralLodVisibility(unit, band);
    return band;
  }

  function updateStructureLod(building, camera, opts) {
    if (!building || !building.userData) return 0;
    var dist = distanceToCamera(building, camera);
    var prev = building.userData.lodBand;
    var band = resolveLod(dist, prev, opts);
    building.userData.lodBand = band;
    building.userData.lodDistance = dist;
    building.userData.lodKind = 'structure';
    applyStructureLodVisibility(building, band);
    return band;
  }

  function updatePropLod(prop, camera, opts) {
    if (!prop || !prop.userData) return 0;
    var dist = distanceToCamera(prop, camera);
    var prev = prop.userData.lodBand;
    var band = resolveLod(dist, prev, opts);
    prop.userData.lodBand = band;
    prop.userData.lodDistance = dist;
    prop.userData.lodKind = 'prop';
    var groups = prop.userData.lodGroups;
    if (band >= 3) {
      if (prop.userData.lodHideAt3 !== false) prop.visible = false;
    } else if (band >= 2) {
      prop.visible = true;
      if (groups && groups.detail) setGroupVis(groups.detail, false);
      else if (prop.userData.lodDetail) prop.userData.lodDetail.visible = false;
    } else {
      prop.visible = true;
      if (groups && groups.detail) setGroupVis(groups.detail, band === 0);
      else if (prop.userData.lodDetail) prop.userData.lodDetail.visible = true;
    }
    return band;
  }

  /**
   * Semantic procedural LOD (preferred):
   * LOD0 full · LOD1 hide detail · LOD2 core/silhouette only · LOD3 impostor stub.
   * Falls back to lodGroups; never relies on fragile mesh-name aliases.
   */
  function applyProceduralLodVisibility(unit, band) {
    var ud = unit.userData;
    if (!ud) return;
    var THREE = global.THREE;

    // GLTF smoke / production mesh: impostor stub only at LOD3 (no name-based hide)
    if (ud.luncAssetSource === 'gltf' && !ud.luncProcedural) {
      if (band >= 3) {
        ud.impostorReady = true;
        ensureImpostorStub(unit, THREE);
        setProceduralChildrenVisible(unit, false);
        if (ud.impostorStub) ud.impostorStub.visible = true;
      } else {
        ud.impostorReady = false;
        if (ud.impostorStub) ud.impostorStub.visible = false;
        setProceduralChildrenVisible(unit, true);
      }
      return;
    }

    var groups = ud.lodGroups;
    var showDetail = band === 0;
    var showMajor = band <= 1;
    var showLimbs = band <= 1;
    var showCore = band <= 2;

    if (groups) {
      if (band >= 3) {
        // LOD3: hide all procedural groups; show impostor stub (no despawn / no teleport)
        setGroupVis(groups.detail, false);
        setGroupVis(groups.major, false);
        setGroupVis(groups.limbs, false);
        setGroupVis(groups.core, false);
        setGroupVis(groups.silhouette, false);
        ensureImpostorStub(unit, THREE);
        if (ud.impostorStub) ud.impostorStub.visible = true;
        ud.impostorReady = true;
        unit.visible = true;
      } else {
        ud.impostorReady = false;
        if (ud.impostorStub) ud.impostorStub.visible = false;
        setGroupVis(groups.detail, showDetail);
        setGroupVis(groups.major, showMajor);
        setGroupVis(groups.limbs, showLimbs);
        setGroupVis(groups.core, showCore);
        setGroupVis(groups.silhouette, showCore);
        unit.visible = true;
      }
      return;
    }

    // Legacy parts fallback (only if builders forgot lodGroups) — map real builder names
    var parts = ud.parts;
    if (!parts) return;
    setVis(parts.L_upperLeg || parts.leftLeg, showLimbs);
    setVis(parts.R_upperLeg || parts.rightLeg, showLimbs);
    setVis(parts.L_upperArm || parts.leftArm, showLimbs);
    setVis(parts.R_upperArm || parts.rightArm, showLimbs);
    setVis(parts.head, showMajor);
    setVis(parts.backpack || parts.pack, showDetail);
    setVis(parts.antenna, showDetail);
    if (parts.wheels) {
      for (var i = 0; i < parts.wheels.length; i++) setVis(parts.wheels[i], showDetail);
    }
    if (parts.tracks) {
      for (var j = 0; j < parts.tracks.length; j++) setVis(parts.tracks[j], showLimbs);
    }
    if (parts.trails) {
      for (var t = 0; t < parts.trails.length; t++) setVis(parts.trails[t], showDetail);
    }
    setVis(parts.turretDetail, showDetail);
    setVis(parts.barrelDetail, showDetail);
    setVis(parts.banner, showDetail);
    setVis(parts.turret, showMajor);
    setVis(parts.cannon, showMajor);
    setVis(parts.barrel, showMajor);
    setVis(parts.body || parts.hull || parts.torso || parts.carriage, showCore);
    setVis(parts.hull, showCore);
    setVis(parts.torso, showCore);
    setVis(parts.carriage, showCore);
    setVis(parts.hips, showCore);

    if (band >= 3) {
      unit.visible = true;
      ud.impostorReady = true;
      ensureImpostorStub(unit, THREE);
      if (ud.impostorStub) ud.impostorStub.visible = true;
      // Hide high-detail procedural; keep unit root for sim
      setProceduralChildrenVisible(unit, false);
      if (ud.impostorStub) ud.impostorStub.visible = true;
    } else {
      ud.impostorReady = false;
      if (ud.impostorStub) ud.impostorStub.visible = false;
      setProceduralChildrenVisible(unit, true);
      // Re-apply group-less visibility already set above
    }
  }

  /** Hide/show non-impostor children (procedural or GLTF visual) without removing from scene. */
  function setProceduralChildrenVisible(unit, on) {
    if (!unit || !unit.children) return;
    for (var i = 0; i < unit.children.length; i++) {
      var ch = unit.children[i];
      if (ch && ch.userData && ch.userData.luncImpostor) continue;
      // Keep ground blob shadow visible at all bands except we still show it at LOD3 under stub
      if (ch && ch.isMesh && ch.material && ch.material.transparent && ch.rotation &&
          Math.abs(ch.rotation.x + Math.PI / 2) < 0.01) {
        ch.visible = true;
        continue;
      }
      if (ch) ch.visible = !!on;
    }
  }

  /**
   * Structure LOD: semantic groups preferred; decorative/blinker fallback.
   * Keep HQ silhouette + faction identity at LOD0–2.
   */
  function applyStructureLodVisibility(building, band) {
    var ud = building.userData;
    if (!ud) return;
    var groups = ud.lodGroups;
    if (groups) {
      setGroupVis(groups.detail, band === 0);
      setGroupVis(groups.major, band <= 1);
      setGroupVis(groups.limbs, band <= 1);
      setGroupVis(groups.core || groups.silhouette, band <= 2);
    }
    var decor = ud.decorative || ud.lodDecor;
    if (decor && !groups) {
      var showDecor = band <= 1;
      if (Array.isArray(decor)) {
        for (var i = 0; i < decor.length; i++) if (decor[i]) decor[i].visible = showDecor;
      } else {
        decor.visible = showDecor;
      }
    } else if (decor && groups && !groups.detail) {
      // If decor collected but not folded into groups.detail
      var showD = band <= 1;
      if (Array.isArray(decor)) {
        for (var d = 0; d < decor.length; d++) if (decor[d]) decor[d].visible = showD;
      } else decor.visible = showD;
    }
    if (ud.blinkerMeshes) {
      var showBlink = band === 0;
      for (var b = 0; b < ud.blinkerMeshes.length; b++) {
        if (ud.blinkerMeshes[b]) ud.blinkerMeshes[b].visible = showBlink;
      }
    }
    if (ud.banner) ud.banner.visible = band <= 1;
    if (ud.factionAccent) ud.factionAccent.visible = true;
    if (ud.silhouette) ud.silhouette.visible = band <= 2;
    ud.impostorReady = band >= 3;
    if (band >= 3) {
      ensureImpostorStub(building, global.THREE);
      if (ud.impostorStub) ud.impostorStub.visible = true;
    } else if (ud.impostorStub) {
      ud.impostorStub.visible = false;
    }
  }

  /** Ensure a cheap billboard impostor stub group exists (architecture only). */
  function ensureImpostorStub(unit, THREE) {
    if (!unit) return null;
    if (!THREE) THREE = global.THREE;
    if (!THREE) return null;
    var ud = unit.userData || (unit.userData = {});
    if (ud.impostorStub && ud.impostorStub.parent === unit) return ud.impostorStub;
    // Stale ref (reparented / disposed) — recreate
    if (ud.impostorStub && ud.impostorStub.parent !== unit) {
      try { if (ud.impostorStub.parent) ud.impostorStub.parent.remove(ud.impostorStub); } catch (_) {}
      ud.impostorStub = null;
    }
    var stub = new THREE.Group();
    stub.name = 'lod3-impostor-stub';
    stub.visible = false;
    stub.userData.luncImpostor = true;
    try {
      var geo = new THREE.PlaneGeometry(1.2, 1.6);
      var mat = new THREE.MeshBasicMaterial({
        color: ud.side < 0 ? 0x49d39a : 0xe4675f,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      mat.userData = mat.userData || {};
      mat.userData.luncOwned = true;
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.8;
      stub.add(mesh);
    } catch (_) {}
    unit.add(stub);
    ud.impostorStub = stub;
    return stub;
  }

  /**
   * Anim update policy for a LOD band.
   * Returns { skipLimbAnim, period, simple }.
   */
  function animPolicy(lodBand, qualityComplexity) {
    var band = lodBand == null ? 0 : (lodBand | 0);
    var period = ANIM_PERIOD[band] != null ? ANIM_PERIOD[band] : 1;
    var q = String(qualityComplexity || qualityKey()).toLowerCase();
    if (q === 'low' && period > 0) period = Math.max(period, band >= 1 ? 3 : 2);
    if (q === 'medium' && band >= 1 && period > 0) period = Math.max(period, 2);
    if (q === 'ultra' && band <= 1) period = 1;
    return {
      lodBand: band,
      period: period,
      skipLimbAnim: band >= 3 || period === 0,
      simple: band >= 2,
      full: band === 0 && period === 1
    };
  }

  /** Should this unit run expensive limb anim this frame? */
  function shouldUpdateAnim(unit, frameCounter, qualityComplexity) {
    if (!unit || !unit.userData) return true;
    var pol = animPolicy(unit.userData.lodBand, qualityComplexity);
    if (pol.skipLimbAnim) return false;
    if (pol.period <= 1) return true;
    var idx = unit.userData.index || 0;
    return ((frameCounter + idx) % pol.period) === 0;
  }

  /** Frustum / off-camera check — skip expensive work; never despawn. */
  function isInView(obj, camera, THREE) {
    if (!obj || !camera) return true;
    try {
      if (!THREE) THREE = global.THREE;
      if (!THREE || !THREE.Frustum) return true;
      if (!_frustum) _frustum = new THREE.Frustum();
      if (!_projScreen) _projScreen = new THREE.Matrix4();
      _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projScreen);
      if (obj.geometry && obj.geometry.boundingSphere) {
        return _frustum.intersectsObject(obj);
      }
      if (!_scratchCam) _scratchCam = new THREE.Vector3();
      obj.getWorldPosition(_scratchCam);
      return _frustum.containsPoint(_scratchCam);
    } catch (_) {
      return true;
    }
  }

  /** Far FX skip: when camera far from event, skip cosmetic updates. */
  function shouldUpdateFx(worldX, worldZ, camera, maxDist) {
    if (!camera || !camera.position) return true;
    maxDist = maxDist != null ? maxDist : 90;
    var d = distanceXZ(worldX, worldZ, camera.position.x, camera.position.z);
    return d <= maxDist;
  }

  function beginFrame() {
    _frameId++;
    _counts.lod0 = 0;
    _counts.lod1 = 0;
    _counts.lod2 = 0;
    _counts.lod3 = 0;
    _counts.culled = 0;
    _counts.units = 0;
    _counts.structures = 0;
    _counts.props = 0;
  }

  /**
   * Tally one object for PERF.
   * lod0–3 = visible/processed this frame (not frustum/far-skipped).
   * culled = skipped expensive work (still simulated; not in lod0–3).
   */
  function tally(band, kind, culled) {
    if (kind === 'unit') _counts.units++;
    else if (kind === 'structure') _counts.structures++;
    else if (kind === 'prop') _counts.props++;
    if (culled) {
      _counts.culled++;
      return;
    }
    if (band === 0) _counts.lod0++;
    else if (band === 1) _counts.lod1++;
    else if (band === 2) _counts.lod2++;
    else _counts.lod3++;
  }

  function endFrame() {
    // Snapshot for PERF overlay — beginFrame zeros working counts at the start of
    // the next frame; quality.tick reads display snapshot after endFrame (v9.4.1+).
    _displayCounts.lod0 = _counts.lod0;
    _displayCounts.lod1 = _counts.lod1;
    _displayCounts.lod2 = _counts.lod2;
    _displayCounts.lod3 = _counts.lod3;
    _displayCounts.culled = _counts.culled;
    _displayCounts.units = _counts.units;
    _displayCounts.structures = _counts.structures;
    _displayCounts.props = _counts.props;
  }

  function getCounts() {
    return {
      lod0: _displayCounts.lod0,
      lod1: _displayCounts.lod1,
      lod2: _displayCounts.lod2,
      lod3: _displayCounts.lod3,
      culled: _displayCounts.culled,
      units: _displayCounts.units,
      structures: _displayCounts.structures,
      props: _displayCounts.props,
      frameId: _frameId,
      live: {
        lod0: _counts.lod0,
        lod1: _counts.lod1,
        lod2: _counts.lod2,
        lod3: _counts.lod3,
        culled: _counts.culled
      }
    };
  }

  /**
   * Resolve registry lod path for a given band.
   * lodPaths: { lod0, lod1, lod2, lod3 } — missing → fall back to lower, then entry.path.
   */
  function resolveLodPath(entry, lodBand) {
    if (!entry) return null;
    var band = lodBand == null ? 0 : (lodBand | 0);
    var paths = entry.lodPaths;
    if (!paths) return entry.path || null;
    function pick(n) {
      if (n <= 0) return paths.lod0 || entry.path || null;
      if (n === 1) return paths.lod1 || paths.lod0 || entry.path || null;
      if (n === 2) return paths.lod2 || paths.lod1 || paths.lod0 || entry.path || null;
      return paths.lod3 || paths.lod2 || paths.lod1 || paths.lod0 || entry.path || null;
    }
    return pick(band);
  }

  /**
   * Environment LOD pass: reduce/hide far props by camera distance.
   * Props tagged userData.envKind; terrain untouched.
   */
  function updateEnvironmentLod(envGroup, camera, opts) {
    if (!envGroup || !camera) return;
    opts = opts || {};
    var enter = opts.enter || getEnterThresholds();
    var hideBeyond = enter.LOD2;
    var clusterBeyond = enter.LOD1;
    envGroup.traverse(function (obj) {
      if (!obj.userData || !obj.userData.envKind) return;
      var dist = distanceToCamera(obj, camera);
      var kind = obj.userData.envKind;
      var band = resolveLod(dist, obj.userData.lodBand, opts);
      obj.userData.lodBand = band;
      if (band >= 3 || dist > hideBeyond * 1.15) {
        obj.visible = false;
        tally(3, 'prop', true);
        return;
      }
      obj.visible = true;
      if (band >= 2 || dist > clusterBeyond) {
        if (obj.userData.lodDetail) obj.userData.lodDetail.visible = false;
        if (obj.userData.lodGroups && obj.userData.lodGroups.detail) {
          setGroupVis(obj.userData.lodGroups.detail, false);
        }
        if (kind === 'tree' || kind === 'bush') {
          if (obj.userData.baseScale == null && obj.scale) {
            obj.userData.baseScale = obj.scale.x;
          }
        }
      } else {
        if (obj.userData.lodDetail) obj.userData.lodDetail.visible = true;
        if (obj.userData.lodGroups && obj.userData.lodGroups.detail) {
          setGroupVis(obj.userData.lodGroups.detail, band === 0);
        }
      }
      tally(band, 'prop', false);
    });
  }

  /**
   * Structure list LOD pass — decorative cull, keep silhouette + faction.
   */
  function updateStructuresLod(buildings, camera, opts) {
    if (!buildings || !camera) return;
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      if (!b) continue;
      var band = updateStructureLod(b, camera, opts);
      var inView = isInView(b, camera, global.THREE);
      if (!inView && band >= 2) {
        b.userData.lodSkipFx = true;
        tally(band, 'structure', true);
      } else {
        b.userData.lodSkipFx = false;
        tally(band, 'structure', false);
      }
    }
  }

  function getThresholdInfo() {
    var enter = getEnterThresholds();
    var hyst = getHysteresis();
    return {
      quality: qualityKey(),
      enter: {
        LOD0: enter.LOD0,
        LOD1: enter.LOD1,
        LOD2: enter.LOD2,
        LOD3: enter.LOD3
      },
      leave: {
        to0: enter.LOD0 - hyst,
        to1: enter.LOD1 - hyst,
        to2: enter.LOD2 - hyst
      },
      hysteresis: hyst,
      animPeriod: {
        LOD0: ANIM_PERIOD[0],
        LOD1: ANIM_PERIOD[1],
        LOD2: ANIM_PERIOD[2],
        LOD3: ANIM_PERIOD[3]
      }
    };
  }

  function getLodBand(distance) {
    return bandFromDistance(distance, getEnterThresholds());
  }

  LB.lod = {
    version: 'v9.4.2',
    DEFAULT_ENTER: DEFAULT_ENTER,
    QUALITY_ENTER: QUALITY_ENTER,
    getEnterThresholds: getEnterThresholds,
    getHysteresis: getHysteresis,
    bandFromDistance: bandFromDistance,
    resolveLod: resolveLod,
    getLodBand: getLodBand,
    distanceToCamera: distanceToCamera,
    updateUnitLod: updateUnitLod,
    updateStructureLod: updateStructureLod,
    updatePropLod: updatePropLod,
    applyProceduralLodVisibility: applyProceduralLodVisibility,
    applyStructureLodVisibility: applyStructureLodVisibility,
    registerLodGroups: registerLodGroups,
    ensureImpostorStub: ensureImpostorStub,
    animPolicy: animPolicy,
    shouldUpdateAnim: shouldUpdateAnim,
    isInView: isInView,
    shouldUpdateFx: shouldUpdateFx,
    beginFrame: beginFrame,
    endFrame: endFrame,
    tally: tally,
    getCounts: getCounts,
    resolveLodPath: resolveLodPath,
    updateEnvironmentLod: updateEnvironmentLod,
    updateStructuresLod: updateStructuresLod,
    getThresholdInfo: getThresholdInfo
  };
})(window);
