/* v11.1 — Hide UI / cinematic mode.
 * Three tiers on body[data-ui]: (none)=full HUD → "cmd"=Commander-only strip → "clean"=nothing but the 3D field.
 * H cycles tiers (Shift+H goes straight to clean / back to full). Esc restores full UI while hidden.
 * Cosmetic only: never touches market data, armies or the renderer (canvas is already fullscreen, so no resize needed).
 * Persisted in localStorage `luncBattle.uiMode`. ?ui=0 untouched (diag flag). */
(function (global) {
  'use strict';
  var doc = global.document;
  var KEY = 'luncBattle.uiMode';
  // Everything that is HUD chrome (selectors that exist in index.html / created by minimap.js, quality.js, commander.js).
  var HUD_SEL = '#topHud,#leftPanel,#rightPanel,#hudTabs,#tokenBar,#hint,#dataTruthLegend,#statusTray,' +
    '#buildTag,#battleBadge,#minimapWrap,#cmdEnter,#qualityPicker';
  var CMD_CHROME_SEL = '#dockTop,.dock-sheet,.cmd-topbar,.cmd-call';           // hidden in clean; .cmd-topbar also hidden in cmd tier except pause/mute
  var CMD_CORE_SEL = '#cmdMission,#cmdBar';                 // strike buttons + cooldowns + orders: visible in "cmd" tier
  var mode = 'full';
  var btnHide, btnRestore;

  function cmdOn() { return doc.body.classList.contains('cmd-on'); }

  function setInert(sel, on) {
    var nodes = doc.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) {
      if (on) { nodes[i].setAttribute('inert', ''); nodes[i].setAttribute('aria-hidden', 'true'); }
      else { nodes[i].removeAttribute('inert'); nodes[i].removeAttribute('aria-hidden'); }
    }
  }

  function apply(next, save) {
    if (next === 'cmd' && !cmdOn()) next = 'clean'; // no Commander session → Commander tier is meaningless
    mode = next;
    if (mode === 'full') doc.body.removeAttribute('data-ui'); else doc.body.setAttribute('data-ui', mode);
    var hidden = mode !== 'full';
    setInert(HUD_SEL, hidden);
    setInert(CMD_CHROME_SEL, mode === 'clean');
    setInert(CMD_CORE_SEL, mode === 'clean');
    if (btnHide) btnHide.setAttribute('aria-pressed', hidden ? 'true' : 'false');
    if (btnRestore) {
      btnRestore.textContent = 'Show UI';
      btnRestore.title = mode === 'cmd' ? 'Show full UI (Esc) · H: clean view' : 'Show full UI (H / Esc)';
    }
    // If focus is inside a now-inert panel, drop it so keys keep reaching the game.
    if (hidden && doc.activeElement && doc.activeElement.closest && doc.activeElement.closest('[inert]')) doc.activeElement.blur();
    if (save !== false) { try { localStorage.setItem(KEY, mode); } catch (_) {} }
    try { global.dispatchEvent(new CustomEvent('lunc:uimode', { detail: { mode: mode } })); } catch (_) {}
  }

  function cycle() {
    if (mode === 'full') apply(cmdOn() ? 'cmd' : 'clean');
    else if (mode === 'cmd') apply('clean');
    else apply('full');
  }

  function isTyping(t) {
    if (!t) return false;
    if (t.isContentEditable) return true;
    return /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '');
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
    if (e.code === 'KeyH') {
      e.preventDefault();
      if (e.shiftKey) apply(mode === 'clean' ? 'full' : 'clean'); else cycle();
    } else if (e.code === 'Escape' && mode !== 'full') {
      // Capture phase: restore UI instead of letting commander.js treat Esc as pause.
      // An armed strike still gets Esc first (disarm) so the reticle never sticks.
      var c = global.LUNCBattle && global.LUNCBattle.commander;
      var st = c && c.getState ? c.getState() : null;
      if (st && st.armed) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      apply('full');
    }
  }

  function init() {
    btnHide = doc.createElement('button');
    btnHide.type = 'button'; btnHide.id = 'btnHideUi'; btnHide.className = 'ui-toggle-btn';
    btnHide.title = 'Hide UI (H) · Shift+H: clean view'; btnHide.setAttribute('aria-label', 'Hide UI');
    btnHide.textContent = '⛶ Hide UI';
    btnHide.addEventListener('click', function () { cycle(); btnHide.blur(); });
    var tray = doc.getElementById('statusTray');
    if (tray) tray.appendChild(btnHide); else doc.body.appendChild(btnHide);

    btnRestore = doc.createElement('button');
    btnRestore.type = 'button'; btnRestore.id = 'btnRestoreUi'; btnRestore.className = 'ui-toggle-btn';
    btnRestore.addEventListener('click', function () { apply('full'); btnRestore.blur(); });
    doc.body.appendChild(btnRestore);

    global.addEventListener('keydown', onKey, true);
    // Commander starting/stopping changes which tiers make sense.
    if (global.MutationObserver) new MutationObserver(function () {
      if (mode === 'cmd' && !cmdOn()) apply('clean', false);
      else if (mode !== 'full') apply(mode, false); // re-inert nodes created later (minimap, cmdEnter)
    }).observe(doc.body, { attributes: true, attributeFilter: ['class'] });

    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (_) {}
    apply(saved === 'cmd' || saved === 'clean' ? saved : 'full', false);

    global.LUNCBattle = global.LUNCBattle || {};
    global.LUNCBattle.uiMode = { get: function () { return mode; }, set: function (m) { apply(m); }, cycle: cycle };
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
