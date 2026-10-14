/* Progressive boot — mark playable before optional systems finish. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var stages = { core: false, playable: false, full: false };

  function mark(name) {
    if (!performance || !performance.mark) return;
    try { performance.mark('lunc-' + name); } catch (_) {}
  }

  function setStage(name) {
    stages[name] = true;
    mark(name);
    try {
      if (name === 'playable') {
        var el = document.getElementById('loadText');
        if (el) el.textContent = 'Battlefield ready';
        document.documentElement.setAttribute('data-boot', 'playable');
      }
      if (name === 'full') {
        document.documentElement.setAttribute('data-boot', 'full');
        if (performance.measure) {
          try { performance.measure('lunc-to-playable', 'lunc-boot-start', 'lunc-playable'); } catch (_) {}
          try { performance.measure('lunc-to-full', 'lunc-boot-start', 'lunc-full'); } catch (_) {}
        }
      }
    } catch (_) {}
  }

  LB.boot = {
    mark: setStage,
    isPlayable: function () { return !!stages.playable; },
    stages: stages
  };

  mark('boot-start');

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    try {
      if (LB.engine && LB.engine.scene && !stages.playable) {
        setStage('renderer-ready');
        setStage('playable');
      }
      if (stages.playable && LB.commander && !stages.full) {
        setStage('full');
        clearInterval(timer);
      }
    } catch (_) {}
    if (tries > 100) clearInterval(timer);
  }, 200);
})(window);
