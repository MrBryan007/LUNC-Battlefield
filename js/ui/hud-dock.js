/* LUNC Battlefield v11.4 — organized minimal HUD ("dock").
 * Top bar: build · LIVE/data chip · market chip (opens Market) · mute/pause · settings gear · Hide UI.
 * Bottom dock (44px+ targets): Strike · Front · Orders · Map · Intel · Ops · Command · Token.
 * Each button opens ONE sheet (bottom sheet on phones, right drawer on desktop); opening one closes the others.
 * Strike (ability bar incl. HEAVY) is a strip above the dock; on desktop it can stay open next to a sheet.
 * Close: tap the button again, the ✕, swipe the sheet down, or Esc. State persists in localStorage `luncBattle.dock`.
 * Existing panels are ADOPTED (moved, not rebuilt), so all listeners, data and truth labels keep working.
 * ?dock=0 restores the old layout. Hide UI: "cmd" tier keeps only the strike strip + orders pill. */
(function (global) {
  'use strict';
  var doc = global.document, LB = global.LUNCBattle = global.LUNCBattle || {};
  if (new URLSearchParams(global.location.search).get('dock') === '0') return;
  var KEY = 'luncBattle.dock';
  var phone = function () { return global.innerWidth < 900 || global.innerHeight < 500; };
  var SHEETS = [
    { id: 'strike', icon: '✸', label: 'Strike', cmd: true },
    { id: 'front', icon: '⇅', label: 'Front', cmd: true },
    { id: 'orders', icon: '◎', label: 'Orders', cmd: true },
    { id: 'map', icon: '▦', label: 'Map' },
    { id: 'intel', icon: '✦', label: 'Intel' },
    { id: 'ops', icon: '☰', label: 'Ops' },
    { id: 'command', icon: '◈', label: 'Cmd' },
    { id: 'token', icon: '◐', label: 'Token' }
  ];
  var state = { sheet: null, strike: false };
  try { var s0 = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s0) { state.sheet = s0.sheet || null; state.strike = !!s0.strike; } } catch (_) {}
  var el = {}, wraps = {};

  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
  function h(tag, id, cls, html) { var d = doc.createElement(tag); if (id) d.id = id; if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }
  function wrap(id, title, truth) {
    var w = h('section', 'sheet-' + id, 'dock-sheet', '<header class="sheet-head"><b>' + title + '</b>' + (truth ? '<span class="qual sim">' + truth + '</span>' : '') +
      '<button type="button" class="sheet-x" aria-label="Close ' + title + '">✕</button></header><div class="sheet-body"></div>');
    w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', title);
    w.querySelector('.sheet-x').addEventListener('click', function () { open(null); });
    swipeClose(w);
    doc.body.appendChild(w); wraps[id] = w; return w.querySelector('.sheet-body');
  }
  function swipeClose(w) {
    var y0 = null;
    w.addEventListener('touchstart', function (e) { var b = w.querySelector('.sheet-body'); y0 = (b && b.scrollTop > 0) ? null : e.touches[0].clientY; }, { passive: true });
    w.addEventListener('touchmove', function (e) { if (y0 != null && e.touches[0].clientY - y0 > 70) { y0 = null; open(null); } }, { passive: true });
  }
  function adopt(node, into) { if (node && into && node.parentNode !== into) into.appendChild(node); return !!node; }

  function build() {
    doc.body.classList.add('dock-on');
    doc.body.setAttribute('data-hud-panel', 'field');   // neutralise the old tab switching
    // top bar
    el.top = h('div', 'dockTop', 'dock-top');
    el.top.innerHTML = '<div class="dt-left"></div><button type="button" id="dockMarket" class="dt-chip market" title="Market (price, power, data health)"><span class="dt-adv">◆ CONTESTED</span><span class="dt-price">$—</span></button>' +
      '<div class="dt-right"><button type="button" id="dockGear" class="dt-btn" title="Graphics &amp; settings" aria-label="Settings">⚙</button></div>';
    doc.body.appendChild(el.top);
    // orders pill
    el.pill = h('button', 'ordersPill', 'orders-pill', '<span class="op-txt">Orders</span><i class="op-bar"><b></b></i><span class="op-t"></span>');
    el.pill.type = 'button'; el.pill.title = 'Orders (mission)';
    el.pill.addEventListener('click', function () { toggle('orders'); });
    doc.body.appendChild(el.pill);
    // dock
    el.dock = h('nav', 'dock', 'dock-bar'); el.dock.setAttribute('aria-label', 'HUD panels');
    el.dock.innerHTML = SHEETS.map(function (s) {
      return '<button type="button" data-dock="' + s.id + '"' + (s.cmd ? ' data-cmd="1"' : '') + ' aria-expanded="false"><span class="di">' + s.icon + '</span><span class="dl">' + s.label + '</span></button>';
    }).join('');
    el.dock.addEventListener('click', function (e) { var b = e.target.closest('[data-dock]'); if (b) { toggle(b.getAttribute('data-dock')); b.blur(); } });
    doc.body.appendChild(el.dock);
    el.top.querySelector('#dockMarket').addEventListener('click', function () { toggle('market'); });
    el.top.querySelector('#dockGear').addEventListener('click', function () { toggle('settings'); });
    // sheet wrappers
    wraps.body = {
      map: wrap('map', 'Map & legend'), intel: wrap('intel', 'Intel', 'ADAPTIVE · LOCAL'), ops: wrap('ops', 'War Room · AI Ops'),
      command: wrap('command', 'Command intel'), token: wrap('token', 'Token'), market: wrap('market', 'Market'), settings: wrap('settings', 'Settings'),
      orders: wrap('orders', 'Orders'), front: wrap('front', 'Call the Front')
    };
    adoptAll();
    global.addEventListener('keydown', function (e) { if (e.code === 'Escape' && state.sheet && !doc.body.getAttribute('data-ui')) { var c = LB.commander && LB.commander.getState && LB.commander.getState(); if (c && c.armed) return; open(null); e.stopImmediatePropagation(); } }, true);
    global.addEventListener('resize', apply);
    setInterval(tickPill, 500);
    apply();
  }

  // Panels created by other modules appear late → adopt whenever they exist.
  function adoptAll() {
    var B = wraps.body, $ = function (id) { return doc.getElementById(id); };
    adopt($('statusTray'), el.top.querySelector('.dt-left'));
    if (phone()) adopt($('buildTag'), B.settings); else { var bt = $('buildTag'), L = el.top.querySelector('.dt-left'); if (bt && bt.parentNode !== L) L.insertBefore(bt, L.firstChild); }
    var mk = $('dockMarket'), Lf = el.top.querySelector('.dt-left'); if (mk && mk.parentNode !== Lf) Lf.appendChild(mk);
    var R = el.top.querySelector('.dt-right'), gear = $('dockGear');
    ['cmdMute', 'cmdPause'].forEach(function (id) { var n = $(id); if (n && n.parentNode !== R) R.insertBefore(n, gear); });
    var hide = $('btnHideUi'); if (hide && hide.parentNode !== R) R.appendChild(hide);
    adopt($('minimapWrap'), B.map); adopt($('dataTruthLegend'), B.map); adopt($('hint'), B.map);
    adopt($('intelPanel'), B.intel);
    adopt($('rightPanel'), B.ops);
    adopt($('leftPanel'), B.command);
    adopt($('tokenBar'), B.token);
    adopt($('topHud'), B.market); adopt($('battleBadge'), B.market);
    adopt($('qualityPicker'), B.settings);
    var tb = doc.querySelector('.cmd-topbar'); adopt(tb, B.orders); adopt($('cmdMission'), B.orders);
    adopt($('cmdCall'), B.front);
    // v12.0.1: v12 panels built before the dock existed fell back to <body> (theater bar floated over the field, even with Hide UI)
    var th = $('theaterBar'); if (th && th.parentNode !== B.map) { th.classList.remove('floating'); B.map.insertBefore(th, B.map.firstChild); }
    var sp = $('supplyPanel'); if (sp && sp.parentNode !== B.map) { sp.classList.remove('floating'); sp.hidden = false; if (th && th.parentNode === B.map) B.map.insertBefore(sp, th.nextSibling); else B.map.appendChild(sp); }
    var tk = $('theaterTicker'); if (tk && tk.parentNode !== B.intel) B.intel.insertBefore(tk, B.intel.firstChild);
    adopt($('v12Opts'), B.settings);
    var bh = doc.querySelector('a.build-hours-link.settings'); adopt(bh, B.settings);
  }

  function cmdOn() { return doc.body.classList.contains('cmd-on'); }
  function toggle(id) {
    if (id === 'strike') { setStrike(!state.strike); return; }
    open(state.sheet === id ? null : id);
  }
  function setStrike(on) {
    state.strike = !!on;
    if (on && phone() && state.sheet) state.sheet = null;   // phones: one thing open at a time
    save(); apply();
  }
  function open(id) {
    state.sheet = id;
    if (id && phone()) state.strike = false;
    save(); apply();
  }
  function apply() {
    adoptAll();
    var on = cmdOn();
    if (!on && ['front', 'orders'].indexOf(state.sheet) >= 0) state.sheet = null;
    doc.body.setAttribute('data-sheet', state.sheet || '');
    doc.body.classList.toggle('dock-strike', !!(state.strike && on));
    doc.body.classList.toggle('dock-phone', phone());
    Object.keys(wraps).forEach(function (k) { if (k === 'body') return; var w = wraps[k]; var o = state.sheet === k; w.classList.toggle('open', o); if (o) w.removeAttribute('inert'); else w.setAttribute('inert', ''); });
    el.dock.querySelectorAll('[data-dock]').forEach(function (b) {
      var id = b.getAttribute('data-dock'), act = id === 'strike' ? (state.strike && on) : state.sheet === id;
      b.classList.toggle('active', act); b.setAttribute('aria-expanded', act ? 'true' : 'false');
      b.hidden = b.getAttribute('data-cmd') === '1' && !on;
    });
  }
  function tickPill() {
    adoptAll();
    var on = cmdOn();
    el.pill.hidden = !on;
    var t = doc.getElementById('cmdMissionText'), bar = doc.getElementById('cmdMissionBar'), tm = doc.getElementById('cmdTimer');
    if (t) el.pill.querySelector('.op-txt').textContent = (t.textContent || 'Orders').replace(/\s+/g, ' ').slice(0, 30);
    if (bar) el.pill.querySelector('.op-bar b').style.width = bar.style.width || '0%';
    if (tm) el.pill.querySelector('.op-t').textContent = tm.textContent;
    var adv = doc.querySelector('#battleAdvantage .adv-text'), pr = doc.getElementById('price');
    if (adv) el.top.querySelector('.dt-adv').textContent = '◆ ' + adv.textContent;
    if (pr) el.top.querySelector('.dt-price').textContent = pr.textContent;
    var a = doc.getElementById('battleAdvantage'); if (a) el.top.querySelector('#dockMarket').setAttribute('data-state', a.getAttribute('data-state') || '');
    if (on !== tickPill._on) { tickPill._on = on; apply(); }
  }

  function init() { build(); LB.dock = { open: open, toggle: toggle, setStrike: setStrike, getState: function () { return Object.assign({}, state); } }; }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
