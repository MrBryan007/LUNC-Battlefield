/* LUNC Battlefield v12.0.44 — mission editor, part 1 (v12.3 "Mission editor"). Game layer.
 * Cmd sheet → MISSION EDITOR: a name and a chain of 1-5 objectives (hit N infantry / armor / artillery, reach a xN combo,
 * score N points, collect N power-ups), each with a time limit of 20-180 s. Play runs the chain through the normal ORDERS
 * card (commander.nextMission asks LB.missionEditor.next first); each objective done moves on, one failure ends the run.
 * Up to 6 missions saved on the device with a best time each; share with ?mission=<code> (base64url JSON) or a copy code.
 * Names are reduced to plain letters/digits/punctuation (no HTML). Hot-seat turns keep their own random orders.
 * Never touches market data, armies, the front or data-truth labels. ?editor=0 → off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('editor') !== '0';
  var KEY = 'luncBattle.missions.v1', MAX_SAVED = 6, MAX_OBJ = 5;
  var KINDS = {
    inf: { label: 'Hit enemy infantry', text: 'Hit {n} enemy infantry', min: 1, max: 60, def: 8, mk: function (n) { return { type: 0 }; } },
    armor: { label: 'Hit enemy armor', text: 'Hit {n} enemy armor', min: 1, max: 30, def: 4, mk: function () { return { type: 1 }; } },
    arty: { label: 'Silence enemy artillery', text: 'Silence {n} enemy artillery', min: 1, max: 15, def: 2, mk: function () { return { type: 2 }; } },
    combo: { label: 'Reach a combo', text: 'Reach a x{n} combo', min: 2, max: 12, def: 4, mk: function () { return { combo: true }; } },
    score: { label: 'Score points', text: 'Score {n} points', min: 100, max: 20000, def: 1500, mk: function () { return { score: true }; } },
    pu: { label: 'Collect power-ups', text: 'Collect {n} power-ups', min: 1, max: 6, def: 1, mk: function () { return { pu: true }; } }
  };
  var PRESETS = [
    { name: 'Tank hunter', obj: [{ k: 'armor', n: 3, t: 60 }, { k: 'armor', n: 5, t: 75 }, { k: 'combo', n: 4, t: 60 }] },
    { name: 'Artillery raid', obj: [{ k: 'arty', n: 1, t: 60 }, { k: 'inf', n: 10, t: 60 }, { k: 'arty', n: 2, t: 90 }] },
    { name: 'Combo master', obj: [{ k: 'combo', n: 3, t: 45 }, { k: 'combo', n: 5, t: 60 }, { k: 'score', n: 3000, t: 90 }] }
  ];
  var saved = [], draft = null, run = null, queued = null, el = {}, stats = { played: 0, won: 0, lost: 0, last: '' };

  function C() { return LB.commander; }
  function clampInt(v, a, b, d) { v = Math.round(+v); return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; }
  function cleanName(s) { s = String(s == null ? '' : s).replace(/[^A-Za-z0-9 .,!?'#()_-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32); return s || 'Custom mission'; }
  /** Validate any outside mission (saved, link, code) into a safe one, or null. */
  function sanitize(m) {
    if (!m || typeof m !== 'object' || !Array.isArray(m.obj)) return null;
    var obj = m.obj.slice(0, MAX_OBJ).map(function (o) {
      var K = o && KINDS[o.k]; if (!K) return null;
      return { k: o.k, n: clampInt(o.n, K.min, K.max, K.def), t: clampInt(o.t, 20, 180, 60) };
    }).filter(Boolean);
    if (!obj.length) return null;
    return { name: cleanName(m.name), obj: obj, best: m.best != null && isFinite(+m.best) ? Math.max(0, +(+m.best).toFixed(1)) : null };
  }
  function encode(m) {
    var j = JSON.stringify({ v: 1, name: m.name, obj: m.obj.map(function (o) { return [o.k, o.n, o.t]; }) });
    return btoa(unescape(encodeURIComponent(j))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    try {
      code = String(code || '').trim(); if (!code || code.length > 2000) return null;
      var j = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/')))));
      if (!j || j.v !== 1 || !Array.isArray(j.obj)) return null;
      return sanitize({ name: j.name, obj: j.obj.map(function (a) { return Array.isArray(a) ? { k: a[0], n: a[1], t: a[2] } : null; }) });
    } catch (_) { return null; }
  }
  function load() { try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); saved = (Array.isArray(a) ? a : []).map(sanitize).filter(Boolean).slice(0, MAX_SAVED); } catch (_) { saved = []; } }
  function store() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (_) {} }
  function hotseatOn() { try { return !!(LB.hotseat && LB.hotseat.getState && LB.hotseat.getState().active); } catch (_) { return false; } }

  function objText(o) { return KINDS[o.k].text.replace('{n}', o.n); }
  function mkOrders() {
    var o = run.m.obj[run.i], K = KINDS[o.k], base = K.mk(o.n);
    var m = { id: 'custom:' + o.k, text: objText(o), type: base.type, n: o.n, got: 0, combo: !!base.combo, call: false, score: !!base.score, pu: !!base.pu,
      time: o.t, left: o.t, reward: 150 + 50 * run.i, custom: true, chainTag: 'CUSTOM ORDERS ' + (run.i + 1) + '/' + run.m.obj.length };
    return m;
  }
  /** commander.nextMission hook. outcome: 'new' | 'done' | 'fail'. Returns custom orders or null (random orders). */
  function next(outcome, session, prev) {
    if (!enabled || hotseatOn()) { if (run) finish(false, 'hot-seat'); return null; }
    if (!run && queued) { start(queued); queued = null; return run ? mkOrders() : null; }
    if (!run) return null;
    if (!prev || !prev.custom) { if (outcome === 'new' && run.i === 0 && !run.begun) { run.begun = true; return mkOrders(); } return run.begun ? mkOrders() : null; }
    run.begun = true;
    if (outcome === 'fail') { finish(false, 'failed: ' + prev.text); return null; }
    if (outcome === 'done') {
      run.i++;
      if (run.i >= run.m.obj.length) { finish(true); return null; }
      return mkOrders();
    }
    return mkOrders();
  }
  function start(m) {
    m = sanitize(m); if (!m) return false;
    run = { m: m, i: 0, t0: performance.now(), begun: false, ref: saved.find(function (s) { return s.name === m.name && encode(s) === encode(m); }) || null };
    stats.played++; stats.last = 'Playing "' + m.name + '"';
    render(); return true;
  }
  function play(m) {
    if (!enabled) return false;
    if (hotseatOn()) { stats.last = 'Stop hot-seat to play a custom mission'; render(); return false; }
    if (!start(m)) return false;
    run.begun = true;
    var c = C(); if (c && c.restartOrders) { run.begun = false; c.restartOrders(); }
    return true;
  }
  function finish(won, why) {
    if (!run) return;
    var secs = (performance.now() - run.t0) / 1000, m = run.m;
    if (won) {
      stats.won++; stats.last = 'Mission "' + m.name + '" complete in ' + secs.toFixed(1) + ' s';
      if (run.ref && (run.ref.best == null || secs < run.ref.best)) { run.ref.best = +secs.toFixed(1); stats.last += ' · new best'; store(); }
      banner('MISSION ACCOMPLISHED', m.name + ' · ' + secs.toFixed(1) + ' s', true);
      try { if (LB.sfx && LB.sfx.success) LB.sfx.success(); } catch (_) {}
    } else {
      stats.lost++; stats.last = 'Mission "' + m.name + '" ended (' + (why || 'stopped') + ')';
      banner('MISSION OVER', m.name + ' · ' + (why || 'stopped'), false);
    }
    run = null; render();
  }
  function stop() { if (!run) return false; finish(false, 'stopped'); var c = C(); if (c && c.restartOrders) c.restartOrders(); return true; }
  function banner(title, body, win) {
    var b = el.banner; if (!b) { b = el.banner = doc.createElement('div'); b.className = 'me-banner'; b.setAttribute('role', 'status'); doc.body.appendChild(b); }
    b.textContent = ''; var t = doc.createElement('b'); t.textContent = title; var s = doc.createElement('span'); s.textContent = body; b.appendChild(t); b.appendChild(s);
    b.classList.toggle('win', !!win); b.classList.add('show'); clearTimeout(b._t); b._t = setTimeout(function () { b.classList.remove('show'); }, 3600);
  }

  // ---------------- UI (Cmd sheet) ----------------
  function opt(v, label, sel) { var o = doc.createElement('option'); o.value = v; o.textContent = label; if (sel) o.selected = true; return o; }
  function buildUi() {
    var p = el.p = doc.createElement('div'); p.id = 'missionEditor'; p.className = 'supply-panel me-panel';
    p.innerHTML = '<div class="th-title">MISSION EDITOR <span class="qual sim">GAME ONLY</span></div>' +
      '<div class="me-row"><input id="meName" maxlength="32" placeholder="Mission name" aria-label="Mission name"><select id="mePreset" aria-label="Start from a preset"></select></div>' +
      '<div id="meObjs" class="me-objs"></div>' +
      '<div class="me-row"><button type="button" id="meAdd">+ Objective</button><button type="button" id="mePlay" class="me-go">Play</button><button type="button" id="meSave">Save</button><button type="button" id="meShare">Share link</button></div>' +
      '<div class="me-row"><input id="meCode" placeholder="Paste a mission code or link" aria-label="Mission code"><button type="button" id="meImport">Load</button></div>' +
      '<div id="meSaved" class="me-saved"></div><div id="meStatus" class="sup-status"></div>' +
      '<div class="th-note">Your missions run through the ORDERS card: finish each objective before its timer runs out, one miss ends the run. Saved on this device. Game layer only; the market still drives the battle.</div>';
    var host = doc.querySelector('.sheet-command .sheet-body') || doc.querySelector('#sheet-command .sheet-body') || doc.body;
    host.appendChild(p);
    ['meName', 'mePreset', 'meObjs', 'meAdd', 'mePlay', 'meSave', 'meShare', 'meCode', 'meImport', 'meSaved', 'meStatus'].forEach(function (id) { el[id] = p.querySelector('#' + id); });
    el.mePreset.appendChild(opt('', 'Presets…'));
    PRESETS.forEach(function (pr, i) { el.mePreset.appendChild(opt(String(i), pr.name)); });
    el.mePreset.addEventListener('change', function () { var pr = PRESETS[+el.mePreset.value]; if (pr) { draft = sanitize(pr); renderDraft(); } el.mePreset.value = ''; });
    el.meName.addEventListener('input', function () { draft.name = cleanName(el.meName.value); });
    el.meAdd.addEventListener('click', function () { if (draft.obj.length < MAX_OBJ) { draft.obj.push({ k: 'inf', n: KINDS.inf.def, t: 60 }); renderDraft(); } });
    el.mePlay.addEventListener('click', function () { if (run) stop(); else if (play(draft)) closeSheet(); });
    el.meSave.addEventListener('click', function () { saveDraft(); });
    el.meShare.addEventListener('click', function () { share(draft); });
    el.meImport.addEventListener('click', function () {
      var v = el.meCode.value.trim(), m = v.indexOf('mission=') >= 0 ? decode(v.split('mission=')[1].split('&')[0]) : decode(v);
      if (m) { draft = m; renderDraft(); el.meCode.value = ''; stats.last = 'Loaded "' + m.name + '"'; } else stats.last = 'That code is not a valid mission';
      render();
    });
    draft = sanitize(PRESETS[0]); renderDraft(); render();
  }
  function closeSheet() { try { var b = doc.querySelector('#sheet-command .sheet-x'); if (b) b.click(); } catch (_) {} }
  function renderDraft() {
    el.meName.value = draft.name; el.meObjs.textContent = '';
    draft.obj.forEach(function (o, i) {
      var row = doc.createElement('div'); row.className = 'me-obj';
      var num = doc.createElement('span'); num.className = 'me-num'; num.textContent = (i + 1) + '.';
      var k = doc.createElement('select'); k.setAttribute('aria-label', 'Objective ' + (i + 1));
      Object.keys(KINDS).forEach(function (id) { if (id === 'pu' && !(LB.powerups && LB.powerups.isEnabled && LB.powerups.isEnabled())) return; k.appendChild(opt(id, KINDS[id].label, id === o.k)); });
      var n = doc.createElement('input'); n.type = 'number'; n.value = o.n; n.min = KINDS[o.k].min; n.max = KINDS[o.k].max; n.setAttribute('aria-label', 'Target');
      var t = doc.createElement('input'); t.type = 'number'; t.value = o.t; t.min = 20; t.max = 180; t.step = 5; t.setAttribute('aria-label', 'Seconds');
      var ts = doc.createElement('span'); ts.className = 'me-s'; ts.textContent = 's';
      var x = doc.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove objective'); x.disabled = draft.obj.length < 2;
      k.addEventListener('change', function () { o.k = k.value; o.n = KINDS[o.k].def; renderDraft(); });
      n.addEventListener('change', function () { o.n = clampInt(n.value, KINDS[o.k].min, KINDS[o.k].max, KINDS[o.k].def); n.value = o.n; });
      t.addEventListener('change', function () { o.t = clampInt(t.value, 20, 180, 60); t.value = o.t; });
      x.addEventListener('click', function () { if (draft.obj.length > 1) { draft.obj.splice(i, 1); renderDraft(); } });
      [num, k, n, t, ts, x].forEach(function (c) { row.appendChild(c); }); el.meObjs.appendChild(row);
    });
    el.meAdd.disabled = draft.obj.length >= MAX_OBJ;
  }
  function saveDraft() {
    var m = sanitize(draft); if (!m) return null;
    var i = saved.findIndex(function (s) { return s.name === m.name; });
    if (i >= 0) { m.best = encode(saved[i]) === encode(m) ? saved[i].best : null; saved[i] = m; }
    else { if (saved.length >= MAX_SAVED) saved.pop(); saved.unshift(m); }
    store(); stats.last = 'Saved "' + m.name + '"'; render(); return m;
  }
  function linkFor(m) { var u = new URL(global.location.href); u.search = ''; u.hash = ''; return u.toString() + '?mission=' + encode(m); }
  function share(m) {
    var link = linkFor(sanitize(m)); el.meCode.value = link;
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { stats.last = 'Link copied'; render(); }, function () {}); } catch (_) {}
    stats.last = 'Share this link'; render(); return link;
  }
  function render() {
    if (!el.p) return;
    el.mePlay.textContent = run ? 'Stop mission' : 'Play';
    el.meSaved.textContent = '';
    saved.forEach(function (s, i) {
      var r = doc.createElement('div'); r.className = 'me-sv';
      var nm = doc.createElement('span'); nm.textContent = s.name + ' · ' + s.obj.length + ' obj' + (s.best != null ? ' · best ' + s.best + ' s' : '');
      var ld = doc.createElement('button'); ld.type = 'button'; ld.textContent = 'Edit'; ld.addEventListener('click', function () { draft = sanitize(s); renderDraft(); });
      var pl = doc.createElement('button'); pl.type = 'button'; pl.textContent = 'Play'; pl.addEventListener('click', function () { if (run) stop(); if (play(s)) closeSheet(); });
      var dl = doc.createElement('button'); dl.type = 'button'; dl.textContent = '×'; dl.setAttribute('aria-label', 'Delete ' + s.name); dl.addEventListener('click', function () { saved.splice(i, 1); store(); render(); });
      [nm, ld, pl, dl].forEach(function (c) { r.appendChild(c); }); el.meSaved.appendChild(r);
    });
    el.meStatus.textContent = run ? 'Objective ' + (run.i + 1) + ' of ' + run.m.obj.length + ' · ' + run.m.name : (stats.last || 'Build a mission, then Play');
  }

  function init() {
    if (!enabled) return;
    load();
    var q = qs.get('mission'); if (q) { var m = decode(q); if (m) queued = m; else console.warn('[editor] bad ?mission= code'); }
    var tries = 0, iv = setInterval(function () {
      var host = doc.querySelector('.sheet-command .sheet-body') || doc.querySelector('#sheet-command .sheet-body');
      if (host || ++tries > 120) {
        clearInterval(iv); try { buildUi(); } catch (e) { console.warn('[editor] ui', e); }
        if (queued) { draft = sanitize(queued); renderDraft(); var c = C(), st = c && c.getState ? c.getState() : null; if (st && st.started && c.restartOrders) { c.restartOrders(); } }
        setInterval(function () { if (run) render(); }, 1000);
      }
    }, 500);
  }
  LB.missionEditor = {
    version: 'v12.0.44', isEnabled: function () { return enabled; }, next: next, play: play, stop: stop,
    encode: encode, decode: decode, sanitize: sanitize, save: function (m) { if (m) draft = sanitize(m) || draft; return saveDraft(); }, saved: function () { return saved.map(function (s) { return Object.assign({}, s); }); },
    share: function (m) { return linkFor(sanitize(m || draft)); },
    getState: function () { return { enabled: enabled, running: !!run, index: run ? run.i : -1, name: run ? run.m.name : null, queued: !!queued, saved: saved.length, stats: Object.assign({}, stats) }; }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
