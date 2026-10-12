/* LUNC Battlefield v11.1 — loading screen + shader warm-up.
 * Purely presentational. Waits for the engine and the V11 model bake, then compiles every
 * shader program (renderer.compile with all hidden objects temporarily visible, plus one
 * explosion / strike / tracer / muzzle flash / Commander blast spawned behind the overlay)
 * so the first real explosion or strike doesn't hitch. Never touches market/feed values.
 * ?loader=0 skips it. ?perf=1 adds a long-task counter (LUNCBattle.perfStats).
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle || (global.LUNCBattle = {});
  var qs; try { qs = new URLSearchParams(location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var el = document.getElementById('loadScreen');
  var bar = document.getElementById('loadBar');
  var txt = document.getElementById('loadText');
  var t0 = performance.now(), MAX_WAIT = 25000;
  var state = { phase: 'boot', warmed: false, compileMs: 0, totalMs: 0, v11: null };
  LB.loader = { getState: function () { return Object.assign({}, state); } };

  // perf: long-task counter (reported by ?perf=1 and the headless checks)
  var perf = { longTasks: 0, longestTask: 0, longTasksAfterLoad: 0, longestAfterLoad: 0 };
  LB.perfStats = perf;
  try {
    new PerformanceObserver(function (list) {
      list.getEntries().forEach(function (e) {
        perf.longTasks++; perf.longestTask = Math.max(perf.longestTask, Math.round(e.duration));
        if (state.warmed) { perf.longTasksAfterLoad++; perf.longestAfterLoad = Math.max(perf.longestAfterLoad, Math.round(e.duration)); }
      });
    }).observe({ entryTypes: ['longtask'] });
  } catch (_) {}

  function set(p, msg) {
    if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
    if (txt && msg) txt.textContent = msg;
  }
  function hide() {
    state.totalMs = Math.round(performance.now() - t0);
    if (!el) return;
    el.classList.add('done');
    setTimeout(function () { el.style.display = 'none'; }, 450);
  }
  if (qs.get('loader') === '0') { if (el) el.style.display = 'none'; state.phase = 'skipped'; state.warmed = true; return; }

  function warm() {
    var eng = LB.engine;
    state.phase = 'warm';
    set(0.92, 'Compiling shaders…');
    var undo = [];
    try {
      var THREE = eng.THREE, fx = eng.effects, fxX = eng.getFrontlineX ? eng.getFrontlineX() : 0;
      // spawn one of each FX type (cosmetic, hidden behind the overlay, gone in ~1 s)
      if (fx) {
        try { fx.createExplosion && fx.createExplosion(fxX, 0, 0xffbf47, 1.2, false); } catch (_) {}
        try { fx.launchStrike && fx.launchStrike(fxX - 6, fxX, 2, 0xffd36a, 1); } catch (_) {}
        try { fx.fireWeapon && fx.fireWeapon({ from: { x: fxX - 5, y: 1, z: 0 }, to: { x: fxX, z: 0 }, kind: 'tracer', color: 0xffe9a0, power: 0.3, visualScale: 0.7 }); } catch (_) {}
        try { fx.muzzleFlash && fx.muzzleFlash(fxX - 5, 1, 0, 0xffe08a, 1); } catch (_) {}
      }
      if (LB.commander && LB.commander.warm) { try { undo.push(LB.commander.warm()); } catch (_) {} }
      // temporarily show everything hidden (V11 batches, reticle, dust, pools) and compile
      var shown = [];
      eng.scene.traverse(function (o) { if (!o.visible) { o.visible = true; shown.push(o); } });
      var tc = performance.now();
      eng.renderer.compile(eng.scene, eng.camera);
      state.compileMs = Math.round(performance.now() - tc);
      for (var i = 0; i < shown.length; i++) shown[i].visible = false;
      state.hiddenWarmed = shown.length;
    } catch (e) { console.warn('[loader] warm-up', e); }
    // let the engine draw 2 real frames (bloom/MSAA targets, V11 batches) under the overlay
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      undo.forEach(function (f) { try { f && f(); } catch (_) {} });
      state.warmed = true; state.phase = 'done';
      set(1, 'Ready');
      hide();
    }); });
  }

  function poll() {
    var eng = LB.engine, v = LB.v11, el2 = performance.now() - t0;
    if (!eng) { set(0.1, 'Building battlefield…'); return setTimeout(poll, 100); }
    var settled = !v || !v.isSettled || v.isSettled();
    if (!settled && el2 < MAX_WAIT) {
      var st = v.getStats ? v.getStats() : {};
      var k = st.bakeTotal ? (st.bakeProgress || 0) / st.bakeTotal : 0;
      set(0.2 + 0.7 * k, 'Preparing soldiers & vehicles… ' + Math.round(k * 100) + '%');
      return setTimeout(poll, 100);
    }
    state.v11 = v && v.getStats ? v.getStats().loaded : null;
    warm();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poll); else poll();
})(window);
