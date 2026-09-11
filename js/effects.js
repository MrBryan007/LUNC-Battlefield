/* Visual effects helpers (explosions, smoke, muzzle). Core implementations live in battle-engine.js for v7 Phase 1; this module reserves the API surface. */
(function (global) {
  'use strict';
  global.LUNCBattle = global.LUNCBattle || {};
  global.LUNCBattle.effects = global.LUNCBattle.effects || {
    version: 'v7-phase1',
    note: 'Explosion/projectile routines currently owned by battle-engine.js; further extraction in a later commit.'
  };
})(window);
