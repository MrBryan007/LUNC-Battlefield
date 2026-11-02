/* LUNC Battlefield v12.0.50 — mission browser (v12.3 "Mission editor": the fuller mission browser). Game layer.
 * Full-screen MISSIONS browser opened from the mission editor panel. Tabs: Operations (built-in presets plus four new
 * hand-made ones, easy → hard), My missions (saved on this device) and Recent (the last 8 missions played, from any
 * source including ?mission= links). Each card shows a difficulty rating worked out from what each objective asks for
 * in its time limit (plus night / fog / rain), the total time limit, objective chips, start conditions, your record
 * (plays, wins, best time) and 1-3 stars (win; win inside 75 % of the time limit; inside 50 %), NEW if never played.
 * Play / Edit (loads it into the editor and opens the Cmd sheet) / Share link. Search, filter and sort.
 * Results come from LB.missionEditor's finish() hook and are kept per mission code in localStorage
 * (luncBattle.missionStats.v1), sanitized on load. Never touches market data, armies, the front or data-truth labels.
 * ?missions=0 (or ?editor=0) → off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('missions') !== '0' && qs.get('editor') !== '0';
  var KEY = 'luncBattle.missionStats.v1', MAX_REC = 60, RECENT_N = 8;
  // four new operations on top of the editor presets (all validated through the editor's sanitizer)
  var EXTRA_OPS = [
    { name: 'Recon by fire', obj: [{ k: 'inf', n: 6, t: 60 }, { k: 'hit', n: 2, t: 60, p: 'north' }] },
    { name: 'Armored thrust', wx: 'rain', obj: [{ k: 'armor', n: 4, t: 60 }, { k: 'hold', n: 15, t: 70, p: 'front' }, { k: 'armor', n: 6, t: 75 }] },
    { name: 'Ridge night assault', tod: 'night', obj: [{ k: 'hit', n: 3, t: 60, p: 'ridge' }, { k: 'hold', n: 25, t: 90, p: 'ridge' }, { k: 'arty', n: 2, t: 75 }] },
    { name: 'Last convoy', wx: 'fog', tod: 'dusk', obj: [{ k: 'escort', n: 3, t: 120 }, { k: 'hold', n: 20, t: 80, p: 'front' }, { k: 'score', n: 4000, t: 90 }] }
  ];
  // what a "normal" ask looks like per minute for each objective kind (difficulty 1.0)
  var REF = { inf: 8, armor: 4, arty: 2, combo: 4, score: 1500, pu: 1, hit: 3, escort: 2 };
  var KIND_ICON = { inf: '✚', armor: '▣', arty: '▲', combo: '✕', score: '★', pu: '⚡', hold: '◎', hit: '⊕', escort: '⛟' };
  var TIERS = [[0.8, 'Easy', 'e'], [1.2, 'Normal', 'n'], [1.7, 'Hard', 'h'], [99, 'Brutal', 'b']];
  var recs = {}, el = {}, ui = { tab: 'ops', q: '', filter: 'all', sort: 'diff', open: false }, stats = { opened: 0, results: 0, plays: 0, last: '' };

  function M() { return LB.missionEditor; }
  function editorOn() { var m = M(); return !!(m && m.isEnabled && m.isEnabled()); }
  function now() { return Date.now(); }

  // ---------------------------------------------------------------- difficulty + stars
  function objDiff(o) {
    var t = Math.max(20, o.t);
    if (o.k === 'hold') return (o.n + 40) / t * 1.4;          // getting a squad there takes time too
    if (o.k === 'combo') return Math.pow(o.n / REF.combo, 1.4) * (60 / t);
    if (o.k === 'escort') return (o.n / REF.escort) * (90 / t) * 1.1;
    return (o.n / (REF[o.k] || 1)) * (60 / t);
  }
  function difficulty(m) {
    if (!m || !m.obj || !m.obj.length) return { v: 0, label: 'Easy', cls: 'e' };
    var ds = m.obj.map(objDiff), mx = Math.max.apply(null, ds), mean = ds.reduce(function (a, b) { return a + b; }, 0) / ds.length;
    var v = (mx * 0.6 + mean * 0.4) * (1 + 0.12 * (ds.length - 1));
    if (m.tod === 'night') v += 0.15; else if (m.tod === 'dusk') v += 0.05;
    if (m.wx === 'fog') v += 0.1; else if (m.wx === 'rain') v += 0.05;
    v = Math.round(v * 100) / 100;
    for (var i = 0; i < TIERS.length; i++) if (v < TIERS[i][0]) return { v: v, label: TIERS[i][1], cls: TIERS[i][2] };
    return { v: v, label: 'Brutal', cls: 'b' };
  }
  function limit(m) { return m.obj.reduce(function (a, o) { return a + o.t; }, 0); }
  function starsFor(m, secs) { var L = limit(m); return secs <= L * 0.5 ? 3 : secs <= L * 0.75 ? 2 : 1; }

  // ---------------------------------------------------------------- records
  function code(m) { try { return M().encode(m); } catch (_) { return ''; } }
  function clean(r) {
    if (!r || typeof r !== 'object') return null;
    var n = function (v) { v = +v; return isFinite(v) && v >= 0 ? v : 0; };
    var o = { name: String(r.name || '').replace(/[^A-Za-z0-9 .,!?'#()_-]/g, '').slice(0, 32), plays: n(r.plays) | 0, wins: n(r.wins) | 0, stars: Math.min(3, n(r.stars) | 0), last: n(r.last) };
    o.best = r.best != null && isFinite(+r.best) && +r.best > 0 ? +(+r.best).toFixed(1) : null;
    if (o.wins > o.plays) o.plays = o.wins;
    return o;
  }
  function load() {
    recs = {};
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (a && typeof a === 'object') Object.keys(a).slice(0, MAX_REC).forEach(function (k) { if (/^[A-Za-z0-9_-]{8,2000}$/.test(k) && M().decode(k)) { var r = clean(a[k]); if (r) recs[k] = r; } });
    } catch (_) { recs = {}; }
  }
  function store() {
    var ks = Object.keys(recs);
    if (ks.length > MAX_REC) ks.sort(function (a, b) { return recs[a].last - recs[b].last; }).slice(0, ks.length - MAX_REC).forEach(function (k) { delete recs[k]; });
    try { localStorage.setItem(KEY, JSON.stringify(recs)); } catch (_) {}
  }
  /** hook from mission-editor finish(): one result per run */
  function result(m, won, secs) {
    if (!enabled) return null;
    m = M().sanitize(m); if (!m) return null;
    var k = code(m); if (!k) return null;
    var r = recs[k] || { name: m.name, plays: 0, wins: 0, stars: 0, best: null, last: 0 };
    r.name = m.name; r.plays++; r.last = now();
    if (won) { r.wins++; secs = +secs || 0; if (secs > 0 && (r.best == null || secs < r.best)) r.best = +secs.toFixed(1); r.stars = Math.max(r.stars, starsFor(m, secs)); }
    recs[k] = r; store(); stats.results++;
    if (ui.open) renderList();
    return Object.assign({}, r);
  }

  // ---------------------------------------------------------------- lists
  function ops() {
    var ed = M(), base = (ed.presets ? ed.presets() : []).concat(EXTRA_OPS);
    return base.map(function (p) { return ed.sanitize(p); }).filter(Boolean)
      .map(function (m) { return { m: m, src: 'op' }; })
      .sort(function (a, b) { return difficulty(a.m).v - difficulty(b.m).v; });
  }
  function mine() { return (M().saved() || []).map(function (s) { return { m: M().sanitize(s), src: 'mine' }; }).filter(function (x) { return x.m; }); }
  function recent() {
    return Object.keys(recs).sort(function (a, b) { return recs[b].last - recs[a].last; }).slice(0, RECENT_N)
      .map(function (k) { var m = M().decode(k); return m ? { m: m, src: 'recent' } : null; }).filter(Boolean);
  }
  function list(tab) {
    var L = tab === 'mine' ? mine() : tab === 'recent' ? recent() : ops();
    var q = ui.q.trim().toLowerCase();
    L = L.filter(function (x) {
      var m = x.m;
      if (q && m.name.toLowerCase().indexOf(q) < 0) return false;
      if (ui.filter === 'map') return m.obj.some(function (o) { return o.k === 'hold' || o.k === 'hit'; });
      if (ui.filter === 'convoy') return m.obj.some(function (o) { return o.k === 'escort'; });
      if (ui.filter === 'dark') return m.tod === 'night' || m.tod === 'dusk' || m.wx === 'fog';
      if (ui.filter === 'new') return !rec(m);
      return true;
    });
    var by = {
      diff: function (a, b) { return difficulty(a.m).v - difficulty(b.m).v; },
      length: function (a, b) { return limit(a.m) - limit(b.m); },
      best: function (a, b) { var x = (rec(a.m) || {}).best, y = (rec(b.m) || {}).best; return (x == null ? 1e9 : x) - (y == null ? 1e9 : y); },
      name: function (a, b) { return a.m.name.localeCompare(b.m.name); }
    }[ui.sort];
    if (by && !(tab === 'recent' && ui.sort === 'diff')) L.sort(by);
    return L;
  }
  function rec(m) { return recs[code(m)] || null; }
  function opsStars() { var o = ops(), got = 0; o.forEach(function (x) { var r = rec(x.m); if (r) got += r.stars; }); return { got: got, max: o.length * 3 }; }

  // ---------------------------------------------------------------- actions
  function play(m) {
    var ed = M(), c = LB.commander; if (!ed) return false;
    try { if (c && c.getState && !c.getState().started && c.deploy) c.deploy(); } catch (_) {}
    try { if (ed.getState().running) ed.stop(); } catch (_) {}
    var ok = ed.play(m); stats.plays += ok ? 1 : 0; stats.last = ok ? 'Playing "' + m.name + '"' : 'Could not start "' + m.name + '"';
    if (ok) close(); else say(stats.last);
    return ok;
  }
  function edit(m) {
    var ed = M(); if (!ed || !ed.edit) return false;
    ed.edit(m); close();
    try { if (LB.dock && LB.dock.open) LB.dock.open('command'); } catch (_) {}
    setTimeout(function () { var p = doc.getElementById('missionEditor'); if (p && p.scrollIntoView) try { p.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {} }, 250);
    stats.last = 'Editing "' + m.name + '"'; return true;
  }
  function share(m) {
    var link = M().share(m); el.link.hidden = false; el.link.value = link;
    var fb = function () { try { el.link.focus({ preventScroll: true }); el.link.select(); } catch (_) {} say('Copy the link for "' + m.name + '" below'); };
    try { if (global.navigator.clipboard && global.navigator.clipboard.writeText) { global.navigator.clipboard.writeText(link).then(function () { say('Link for "' + m.name + '" copied'); }, fb); return link; } } catch (_) {}
    fb(); return link;
  }
  function say(t) { stats.last = t; if (el.msg) el.msg.textContent = t; }

  // ---------------------------------------------------------------- UI
  function mk(tag, cls, txt) { var e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function fmtT(s) { s = Math.round(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function build() {
    if (el.v) return;
    var v = el.v = mk('div', 'rp-viewer mb-viewer'); v.id = 'missionBrowser'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Mission browser');
    v.innerHTML = '<div class="rp-head"><b>MISSIONS</b><span class="qual sim">GAME LAYER</span><span id="mbProg" class="rp-name"></span><button type="button" id="mbClose" class="rp-x" aria-label="Close missions">✕</button></div>' +
      '<div class="mb-bar"><div class="rp-tabs" role="tablist">' +
      '<button type="button" class="rp-tab on" data-tab="ops" role="tab">Operations</button><button type="button" class="rp-tab" data-tab="mine" role="tab">My missions</button><button type="button" class="rp-tab" data-tab="recent" role="tab">Recent</button></div>' +
      '<input id="mbSearch" class="mb-search" type="search" placeholder="Search missions" aria-label="Search missions" maxlength="32">' +
      '<select id="mbFilter" aria-label="Filter"><option value="all">All</option><option value="map">Map objectives</option><option value="convoy">Convoy</option><option value="dark">Night, dusk &amp; fog</option><option value="new">Not played</option></select>' +
      '<select id="mbSort" aria-label="Sort"><option value="diff">Easiest first</option><option value="length">Shortest first</option><option value="best">Best time</option><option value="name">Name</option></select></div>' +
      '<input type="text" id="mbLink" class="rp-link" readonly hidden aria-label="Mission link"><div id="mbMsg" class="rp-sharemsg" role="status"></div>' +
      '<div id="mbGrid" class="mb-grid"></div>' +
      '<div class="th-note">Difficulty is worked out from what each objective asks for in its time limit, plus night and fog. Stars: ★ win · ★★ inside 75 % of the time limit · ★★★ inside half. Records are kept on this device. Game layer only; the market still drives the battle.</div>';
    doc.body.appendChild(v);
    el.grid = v.querySelector('#mbGrid'); el.prog = v.querySelector('#mbProg'); el.link = v.querySelector('#mbLink'); el.msg = v.querySelector('#mbMsg');
    v.querySelector('#mbClose').addEventListener('click', close);
    v.querySelectorAll('.rp-tab').forEach(function (b) { b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); }); });
    var se = v.querySelector('#mbSearch'); se.addEventListener('input', function () { ui.q = se.value.slice(0, 32); renderList(); });
    var fi = v.querySelector('#mbFilter'); fi.addEventListener('change', function () { ui.filter = fi.value; renderList(); });
    var so = v.querySelector('#mbSort'); so.addEventListener('change', function () { ui.sort = so.value; renderList(); });
    v.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); ev.preventDefault(); close(); } else if (!/INPUT|SELECT|TEXTAREA/.test((ev.target || {}).tagName || '')) ev.stopPropagation(); });
  }
  function setTab(t) {
    ui.tab = t === 'mine' || t === 'recent' ? t : 'ops';
    el.v.querySelectorAll('.rp-tab').forEach(function (b) { var on = b.getAttribute('data-tab') === ui.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    renderList();
  }
  function card(x) {
    var m = x.m, d = difficulty(m), r = rec(m), c = mk('div', 'mb-card');
    var h = mk('div', 'mb-ch'); h.appendChild(mk('b', 'mb-nm', m.name));
    if (!r) h.appendChild(mk('span', 'mb-new', 'NEW'));
    var dg = mk('span', 'mb-diff mb-d-' + d.cls, d.label); dg.title = 'Difficulty ' + d.v.toFixed(2); h.appendChild(dg); c.appendChild(h);
    var cond = [m.wx ? ({ clear: 'Clear', rain: 'Rain', fog: 'Fog' })[m.wx] : '', m.tod ? ({ noon: 'Noon', dusk: 'Dusk', night: 'Night' })[m.tod] : '', m.side ? (m.side === 'bull' ? 'Bulls' : 'Bears') : ''].filter(Boolean);
    c.appendChild(mk('div', 'mb-meta', m.obj.length + (m.obj.length > 1 ? ' objectives' : ' objective') + ' · up to ' + fmtT(limit(m)) + (cond.length ? ' · ' + cond.join(', ') : '')));
    var ch = mk('div', 'mb-chips');
    m.obj.forEach(function (o, i) { var t = mk('span', 'mb-chip mb-k-' + o.k, (KIND_ICON[o.k] || '•') + ' ' + (M().objText ? M().objText(o) : o.k)); t.title = (i + 1) + '. ' + t.textContent + ' in ' + o.t + ' s'; ch.appendChild(t); });
    c.appendChild(ch);
    var st = mk('div', 'mb-rec');
    var stars = mk('span', 'mb-stars', '★★★'.slice(0, r ? r.stars : 0) + '☆☆☆'.slice(0, 3 - (r ? r.stars : 0))); stars.setAttribute('aria-label', (r ? r.stars : 0) + ' of 3 stars'); st.appendChild(stars);
    st.appendChild(mk('span', null, r ? 'Played ' + r.plays + ' · won ' + r.wins + (r.best != null ? ' · best ' + r.best + ' s' : '') : 'Not played yet'));
    c.appendChild(st);
    var bt = mk('div', 'mb-btns');
    var p = mk('button', 'me-go', 'Play'); p.type = 'button'; p.addEventListener('click', function () { play(m); });
    var e = mk('button', null, 'Edit'); e.type = 'button'; e.addEventListener('click', function () { edit(m); });
    var s = mk('button', null, 'Share link'); s.type = 'button'; s.addEventListener('click', function () { share(m); });
    [p, e, s].forEach(function (b) { bt.appendChild(b); }); c.appendChild(bt);
    return c;
  }
  function renderList() {
    if (!el.grid) return;
    var L = list(ui.tab); el.grid.textContent = '';
    L.forEach(function (x) { el.grid.appendChild(card(x)); });
    if (!L.length) el.grid.appendChild(mk('div', 'rp-none', ui.tab === 'mine' ? 'No saved missions yet. Build one in the mission editor and press Save.' : ui.tab === 'recent' ? 'Missions you play show up here.' : 'No missions match.'));
    var s = opsStars(); el.prog.textContent = 'Operations ★ ' + s.got + ' / ' + s.max + ' · ' + L.length + ' shown';
  }
  function open(tab) {
    if (!enabled || !editorOn()) return false;
    build(); ui.open = true; el.v.classList.add('show'); doc.body.classList.add('replay-open', 'mb-open');
    el.link.hidden = true; el.msg.textContent = '';
    setTab(tab || ui.tab); stats.opened++;
    try { var b = doc.querySelector('#sheet-command .sheet-x'); if (b && doc.querySelector('#sheet-command.open')) b.click(); } catch (_) {}
    el.v.tabIndex = -1; try { el.v.focus({ preventScroll: true }); } catch (_) {}
    return true;
  }
  function close() { if (!el.v) return; ui.open = false; el.v.classList.remove('show'); doc.body.classList.remove('mb-open'); if (!doc.querySelector('#replayViewer.show')) doc.body.classList.remove('replay-open'); }
  function addEntry() {
    var p = doc.getElementById('missionEditor'); if (!p || doc.getElementById('mbOpen')) return !!p;
    var row = mk('div', 'me-row mb-entry'), b = mk('button', 'me-go', 'Browse missions'); b.type = 'button'; b.id = 'mbOpen';
    b.addEventListener('click', function () { open(); });
    var sub = mk('small', 'mb-entry-s', ''); el.entryS = sub; row.appendChild(b); row.appendChild(sub);
    var t = p.querySelector('.th-title'); if (t && t.nextSibling) p.insertBefore(row, t.nextSibling); else p.appendChild(row);
    refreshEntry(); return true;
  }
  function refreshEntry() { if (!el.entryS) return; var s = opsStars(); el.entryS.textContent = ops().length + ' operations · ★ ' + s.got + ' / ' + s.max; }

  function init() {
    if (!enabled) return;
    var tries = 0, iv = setInterval(function () {
      if (!M() || !M().isEnabled) { if (++tries > 120) clearInterval(iv); return; }
      if (!editorOn()) { clearInterval(iv); enabled = false; return; }
      load();
      if (addEntry() || ++tries > 120) { clearInterval(iv); setInterval(refreshEntry, 4000); }
    }, 500);
    global.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && ui.open) { ev.stopImmediatePropagation(); ev.preventDefault(); close(); } }, true);
  }
  LB.missionBrowser = {
    version: 'v12.0.50', isEnabled: function () { return enabled; }, open: open, close: close, result: result, play: play, edit: edit, share: share,
    difficulty: function (m) { m = M().sanitize(m); return m ? difficulty(m) : null; }, stars: function (m, secs) { m = M().sanitize(m); return m ? starsFor(m, secs) : 0; },
    list: function (tab) { return list(tab || ui.tab).map(function (x) { var r = rec(x.m); return { name: x.m.name, diff: difficulty(x.m).label, v: difficulty(x.m).v, limit: limit(x.m), stars: r ? r.stars : 0, plays: r ? r.plays : 0, best: r ? r.best : null }; }); },
    setQuery: function (q, f, s) { if (q != null) ui.q = String(q); if (f) ui.filter = f; if (s) ui.sort = s; renderList(); },
    records: function () { return JSON.parse(JSON.stringify(recs)); }, reload: load,
    getState: function () { return { enabled: enabled, open: ui.open, tab: ui.tab, cards: el.grid ? el.grid.querySelectorAll('.mb-card').length : 0, records: Object.keys(recs).length, stars: opsStars(), stats: Object.assign({}, stats) }; }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
