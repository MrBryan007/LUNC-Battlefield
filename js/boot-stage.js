/* Progressive boot flag — battlefield can be marked playable before optional systems finish. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var stages = { core: false, optional: false };

  function mark(name) {
    stages[name] = true;
    try {
      var el = document.getElementById('loadText');
      if (el && name === 'core') el.textContent = 'Battlefield ready';
    } catch (_) {}
    if (name === 'core') {
      document.documentElement.setAttribute('data-boot', 'playable');
    }
  }

  function isPlayable() { return !!stages.core; }

  LB.boot = { mark: mark, isPlayable: isPlayable, stages: stages };

  // Mark playable once the engine reports a scene, without waiting on optional theaters.
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    try {
      if (LB.engine && LB.engine.scene) {
        mark('core');
        clearInterval(timer);
      }
    } catch (_) {}
    if (tries > 80) clearInterval(timer);
  }, 250);
})(window);
