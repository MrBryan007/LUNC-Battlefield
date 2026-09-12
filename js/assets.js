/* LUNC Battlefield v9.3 — glTF/GLB asset registry (original paths + procedural fallbacks) */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle || (global.LUNCBattle = {});

  /**
   * Registry entry fields:
   * id, type, path, faction, category, lod, animated, fallback,
   * license/source, scale, rotation, positionOffset, groundOffset
   *
   * Paths are relative to site root. Empty/missing path → always procedural.
   * Tiny original smoke-test GLBs ship under assets/models/ (see assets/licenses/ASSETS.md).
   */
  const REGISTRY = Object.freeze({
    'unit.bull.infantry': {
      id: 'unit.bull.infantry',
      type: 'unit',
      path: 'assets/models/units/unit_bull_infantry.glb',
      faction: 'bull',
      category: 'infantry',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'unit.bear.infantry': {
      id: 'unit.bear.infantry',
      type: 'unit',
      path: 'assets/models/units/unit_bear_infantry.glb',
      faction: 'bear',
      category: 'infantry',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'unit.bull.armor': {
      id: 'unit.bull.armor',
      type: 'vehicle',
      path: 'assets/models/vehicles/unit_bull_armor.glb',
      faction: 'bull',
      category: 'armor',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'unit.bear.armor': {
      id: 'unit.bear.armor',
      type: 'vehicle',
      path: 'assets/models/vehicles/unit_bear_armor.glb',
      faction: 'bear',
      category: 'armor',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'unit.bull.artillery': {
      id: 'unit.bull.artillery',
      type: 'artillery',
      path: 'assets/models/artillery/unit_bull_artillery.glb',
      faction: 'bull',
      category: 'artillery',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'unit.bear.artillery': {
      id: 'unit.bear.artillery',
      type: 'artillery',
      path: 'assets/models/artillery/unit_bear_artillery.glb',
      faction: 'bear',
      category: 'artillery',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'structure.bull.hq': {
      id: 'structure.bull.hq',
      type: 'structure',
      path: 'assets/models/structures/structure_bull_hq.glb',
      faction: 'bull',
      category: 'hq',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'structure.bear.hq': {
      id: 'structure.bear.hq',
      type: 'structure',
      path: 'assets/models/structures/structure_bear_hq.glb',
      faction: 'bear',
      category: 'hq',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'prop.crate': {
      id: 'prop.crate',
      type: 'prop',
      path: 'assets/models/props/prop_crate.glb',
      faction: null,
      category: 'prop',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'prop.barrel': {
      id: 'prop.barrel',
      type: 'prop',
      path: 'assets/models/props/prop_barrel.glb',
      faction: null,
      category: 'prop',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    'prop.rock': {
      id: 'prop.rock',
      type: 'prop',
      path: 'assets/models/props/prop_rock.glb',
      faction: null,
      category: 'prop',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'original',
      smokeTest: true,
      source: 'tools/make-tiny-glbs.js',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    },
    // Intentional missing-path entry — proves load failure → procedural forever
    'unit.bull.missing_demo': {
      id: 'unit.bull.missing_demo',
      type: 'unit',
      path: '',
      faction: 'bull',
      category: 'demo',
      lod: 0,
      lodPaths: null,
      animated: false,
      fallback: 'procedural',
      license: 'n/a',
      source: 'none — empty path smoke test',
      scale: 1,
      rotation: [0, 0, 0],
      positionOffset: [0, 0, 0],
      groundOffset: 0
    }
  });

  function getEntry(id) {
    return REGISTRY[id] || null;
  }

  function listIds() {
    return Object.keys(REGISTRY);
  }

  function unitId(faction, category) {
    return 'unit.' + faction + '.' + category;
  }

  function structureId(faction, category) {
    return 'structure.' + faction + '.' + category;
  }

  function typeToCategory(typeNum) {
    if (typeNum === 0) return 'infantry';
    if (typeNum === 1) return 'armor';
    return 'artillery';
  }

  function unitIdFromSideType(side, typeNum) {
    const faction = side < 0 ? 'bull' : 'bear';
    return unitId(faction, typeToCategory(typeNum));
  }

  LB.assetRegistry = {
    version: 'v9.3',
    REGISTRY: REGISTRY,
    get: getEntry,
    listIds: listIds,
    unitId: unitId,
    structureId: structureId,
    unitIdFromSideType: unitIdFromSideType,
    typeToCategory: typeToCategory
  };
})(window);
