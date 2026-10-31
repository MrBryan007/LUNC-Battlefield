/* LUNC Battlefield v12.0.45 — mission editor (v12.3 "Mission editor"; part 1 v12.0.44, part 2 v12.0.45). Game layer.
 * Part 2: map objectives (Hold a point: a squad of yours within 8 m for N s; Strike a point: N Commander strikes within
 * 7 m) on a picked point (Front centre / Hill 402 / North flank / South flank, resolved against the live front when the
 * objective starts), shown as a gold 3D ring + beam and a tactical-map ping; start conditions (weather, side) applied
 * on Play and put back when the run ends. Also time of day (Noon / Dusk / Night held for the run via v12extras.setTimeLock),
 * a SEND SQUAD chip during a hold (nearest squad's distance, one tap moves it onto the ring; ring turns green and fills
 * while held), ring flash on a hit and MISSED THE RING on a near miss, objective summaries in the saved list.
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
    inf: { short: 'Infantry', label: 'Hit enemy infantry', text: 'Hit {n} enemy infantry', min: 1, max: 60, def: 8, mk: function (n) { return { type: 0 }; } },
    armor: { short: 'Armor', label: 'Hit enemy armor', text: 'Hit {n} enemy armor', min: 1, max: 30, def: 4, mk: function () { return { type: 1 }; } },
    arty: { short: 'Artillery', label: 'Silence enemy artillery', text: 'Silence {n} enemy artillery', min: 1, max: 15, def: 2, mk: function () { return { type: 2 }; } },
    combo: { short: 'Combo', label: 'Reach a combo', text: 'Reach a x{n} combo', min: 2, max: 12, def: 4, mk: function () { return { combo: true }; } },
    score: { short: 'Score', label: 'Score points', text: 'Score {n} points', min: 100, max: 20000, def: 1500, mk: function () { return { score: true }; } },
    pu: { short: 'Power-ups', label: 'Collect power-ups', text: 'Collect {n} power-ups', min: 1, max: 6, def: 1, mk: function () { return { pu: true }; } },
    hold: { short: 'Hold', label: 'Hold a point', text: 'Hold {p} for {n} s with a squad', min: 10, max: 90, def: 20, map: true, mk: function () { return { hold: true }; } },
    hit: { short: 'Strike', label: 'Strike a point', text: 'Land {n} strikes on {p}', min: 1, max: 10, def: 3, map: true, mk: function () { return { spot: true }; } }
  };
  var POINTS = { front: 'Front centre', ridge: 'Hill 402', north: 'North flank', south: 'South flank' };
  var TODS = { '': 'Any time', noon: 'Noon', dusk: 'Dusk', night: 'Night' }, TOD_K = { noon: 0.5, dusk: 0.88, night: 0.98 };
  var WX = { '': 'Any weather', clear: 'Clear', rain: 'Rain', fog: 'Fog' }, SIDES = { '': 'Either side', bull: 'Play Bulls', bear: 'Play Bears' };
  var HOLD_R = 8, STRIKE_R = 7, NEAR_R = 25, mark = null, tickIv = null;
  var PRESETS = [
    { name: 'Tank hunter', obj: [{ k: 'armor', n: 3, t: 60 }, { k: 'armor', n: 5, t: 75 }, { k: 'combo', n: 4, t: 60 }] },
    { name: 'Artillery raid', obj: [{ k: 'arty', n: 1, t: 60 }, { k: 'inf', n: 10, t: 60 }, { k: 'arty', n: 2, t: 90 }] },
    { name: 'Combo master', obj: [{ k: 'combo', n: 3, t: 45 }, { k: 'combo', n: 5, t: 60 }, { k: 'score', n: 3000, t: 90 }] },
    { name: 'Take Hill 402', wx: 'fog', obj: [{ k: 'hit', n: 3, t: 60, p: 'ridge' }, { k: 'hold', n: 20, t: 90, p: 'ridge' }] },
    { name: 'Hold the line', obj: [{ k: 'hold', n: 15, t: 75, p: 'front' }, { k: 'hit', n: 2, t: 45, p: 'north' }, { k: 'armor', n: 3, t: 60 }] },
    { name: 'Night raid', tod: 'night', obj: [{ k: 'hit', n: 2, t: 60, p: 'south' }, { k: 'arty', n: 1, t: 75 }, { k: 'hold', n: 15, t: 90, p: 'south' }] },
    { name: 'Fog hold', wx: 'fog', tod: 'dusk', obj: [{ k: 'hold', n: 25, t: 100, p: 'north' }, { k: 'inf', n: 8, t: 60 }] }
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
      var r = { k: o.k, n: clampInt(o.n, K.min, K.max, K.def), t: clampInt(o.t, 20, 180, 60) };
      if (K.map) r.p = POINTS[o.p] ? o.p : 'front';
      return r;
    }).filter(Boolean);
    if (!obj.length) return null;
    return { name: cleanName(m.name), obj: obj, wx: WX[m.wx] && m.wx ? m.wx : '', side: SIDES[m.side] && m.side ? m.side : '', tod: TODS[m.tod] && m.tod ? m.tod : '',
      best: m.best != null && isFinite(+m.best) ? Math.max(0, +(+m.best).toFixed(1)) : null };
  }
  function encode(m) {
    var c = { v: 1, name: m.name, obj: m.obj.map(function (o) { return o.p ? [o.k, o.n, o.t, o.p] : [o.k, o.n, o.t]; }) };
    if (m.wx) c.wx = m.wx; if (m.side) c.side = m.side; if (m.tod) c.tod = m.tod;
    var j = JSON.stringify(c);
    return btoa(unescape(encodeURIComponent(j))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(code) {
    try {
      code = String(code || '').trim(); if (!code || code.length > 2000) return null;
      var j = JSON.parse(decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/')))));
      if (!j || j.v !== 1 || !Array.isArray(j.obj)) return null;
      return sanitize({ name: j.name, wx: j.wx, side: j.side, tod: j.tod, obj: j.obj.map(function (a) { return Array.isArray(a) ? { k: a[0], n: a[1], t: a[2], p: a[3] } : null; }) });
    } catch (_) { return null; }
  }
  function load() { try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); saved = (Array.isArray(a) ? a : []).map(sanitize).filter(Boolean).slice(0, MAX_SAVED); } catch (_) { saved = []; } }
  function store() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (_) {} }
  function hotseatOn() { try { return !!(LB.hotseat && LB.hotseat.getState && LB.hotseat.getState().active); } catch (_) { return false; } }

  function objText(o) { return KINDS[o.k].text.replace('{n}', o.n).replace('{p}', POINTS[o.p] || ''); }
  function frontX() { try { return LB.engine.getFrontlineX() || 0; } catch (_) { return 0; } }
  function pointXZ(id) {
    var fx = frontX(), R = LB.ridge && LB.ridge.isEnabled && LB.ridge.isEnabled() ? LB.ridge : null, sm = R ? R.summit() : null;
    var nz = sm ? sm.z * 0.45 : -30, sz = sm ? -sm.z * 0.3 : 22;
    if (id === 'ridge' && sm) return { x: sm.x, z: sm.z };
    if (id === 'north' || id === 'ridge') return { x: fx, z: nz };
    if (id === 'south') return { x: fx, z: sz };
    return { x: fx, z: 0 };
  }
  function mySide() { try { return C().getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  // ---- objective point marker (gold ring + beam) ----
  function showMark(x, z) {
    hideMark(); var e = LB.engine, T = e && e.THREE; if (!T || !e.scene) return;
    var g = new T.Group(), y = 0; try { y = (LB.los && LB.los.ground ? LB.los.ground(x, z) : e.terrainHeight(x, z)) || 0; } catch (_) {}
    var ring = new T.Mesh(new T.RingGeometry(HOLD_R - 1.1, HOLD_R, 48), new T.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.75, side: T.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; g.add(ring);
    var disc = new T.Mesh(new T.CircleGeometry(HOLD_R - 1.1, 40), new T.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.12, side: T.DoubleSide, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.2; g.add(disc);
    var beam = new T.Mesh(new T.CylinderGeometry(0.35, 0.9, 26, 12, 1, true), new T.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide }));
    beam.position.y = 13; g.add(beam);
    g.position.set(x, y, z); g.renderOrder = 5; e.scene.add(g); mark = { g: g, ring: ring, disc: disc, x: x, z: z, flash: 0 };
    try { if (LB.tacmap && LB.tacmap.ping) LB.tacmap.ping(x, z); } catch (_) {}
  }
  function hideMark() {
    if (!mark) return; try { mark.g.parent && mark.g.parent.remove(mark.g); mark.g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } catch (_) {}
    mark = null;
  }
  function tickMap() {
    if (!run || !run.cur) { if (mark) hideMark(); return; }
    var cur = run.cur, now = performance.now(), dt = Math.min(0.5, (now - (run.lastT || now)) / 1000); run.lastT = now;
    if (mark) {
      mark.flash = Math.max(0, (mark.flash || 0) - dt * 2.5);
      mark.ring.material.opacity = Math.min(1, 0.55 + 0.25 * Math.sin(now / 250) + mark.flash * 0.5);
      mark.ring.material.color.setHex(run.holding || mark.flash > 0.05 ? 0x6aff8f : 0xffd36a);
      var pr = cur.n > 0 ? Math.min(1, (cur.got || 0) / cur.n) : 0; mark.disc.scale.setScalar(0.05 + 0.95 * pr); mark.disc.material.opacity = 0.12 + 0.18 * pr;
      mark.disc.material.color.setHex(cur.hold ? 0x6aff8f : 0xffd36a);
    }
    renderChip();
    if (!cur.hold) return;
    var paused = false; try { paused = LB.engine.isPaused(); } catch (_) {}
    if (paused) return;
    var me = mySide(), inside = false, list = [];
    try { list = LB.squads && LB.squads.list ? LB.squads.list() : []; } catch (_) {}
    for (var i = 0; i < list.length; i++) { var q = list[i]; if (q.side !== me || !(q.alive > 0)) continue; if (Math.hypot(q.x - cur.px, q.z - cur.pz) <= HOLD_R) { inside = true; break; } }
    run.holding = inside;
    if (inside) { run.acc = (run.acc || 0) + dt; var g = Math.floor(run.acc); if (g !== cur.got) { cur.got = g; try { C().missionProgress('tick', 0); } catch (_) {} } }
  }
  /** commander fireAt hook: a Commander strike landed at x/z */
  function strikeAt(x, z) {
    if (!run || !run.cur || !run.cur.spot) return false;
    var d = Math.hypot(x - run.cur.px, z - run.cur.pz);
    if (d > STRIKE_R) { if (d <= NEAR_R) { stats.near = (stats.near || 0) + 1; flashChip('MISSED THE RING · ' + Math.round(d) + ' m off'); } return false; }
    if (mark) mark.flash = 1;
    run.cur.got++; try { C().missionProgress('tick', 0); } catch (_) {}
    return true;
  }
  function applyConditions(m) {
    var prev = { wx: null, side: null }, X = LB.v12extras;
    if (m.wx && X && X.setWeather && X.getOptions) { prev.wx = X.getOptions().weather; if (prev.wx !== m.wx) X.setWeather(m.wx); else prev.wx = null; }
    if (m.side && C() && C().setSide) { var cs = C().getState().profile.side; if (cs !== m.side) { prev.side = cs; C().setSide(m.side); } }
    if (m.tod && X && X.setTimeLock) { prev.tod = X.getTimeLock ? X.getTimeLock() : null; prev.todSet = true; X.setTimeLock(TOD_K[m.tod]); }
    return prev;
  }
  function restoreConditions(prev) {
    if (!prev) return;
    try { if (prev.wx && LB.v12extras && LB.v12extras.setWeather) LB.v12extras.setWeather(prev.wx); } catch (_) {}
    try { if (prev.side && C() && C().setSide) C().setSide(prev.side); } catch (_) {}
    try { if (prev.todSet && LB.v12extras && LB.v12extras.setTimeLock) LB.v12extras.setTimeLock(prev.tod); } catch (_) {}
  }
  // ---- objective chip (hold: nearest squad + SEND SQUAD; strike: count + fly the camera to the ring) ----
  function nearestSquad() {
    if (!run || !run.cur) return null; var me = mySide(), list = [], best = null, bi = -1, k = -1;
    try { list = LB.squads && LB.squads.list ? LB.squads.list() : []; } catch (_) {}
    for (var i = 0; i < list.length; i++) { var q = list[i]; if (q.side !== me) continue; k++; if (q.dead || !(q.alive > 0)) continue; var d = Math.hypot(q.x - run.cur.px, q.z - run.cur.pz); if (!best || d < best.d) { best = { d: d, name: q.name, i: k }; } }
    return best;
  }
  function sendSquad() {
    if (!run || !run.cur || !run.cur.hold) return false; var q = nearestSquad();
    if (!q || !LB.squads || !LB.squads.order) { flashChip('NO SQUAD AVAILABLE'); return false; }
    var ok = false; try { ok = LB.squads.order('move', run.cur.px, run.cur.pz, q.i); } catch (_) {}
    if (ok) { stats.sent = (stats.sent || 0) + 1; flashChip(q.name + ' MOVING TO THE RING'); try { if (LB.sfx && LB.sfx.radio) LB.sfx.radio(); } catch (_) {} }
    return ok;
  }
  function flashChip(t) { if (!el.chip) return; el.chipMsg = t; el.chipMsgT = performance.now() + 2200; renderChip(); }
  function renderChip() {
    var cur = run && run.cur, show = !!(cur && (cur.hold || cur.spot));
    if (!show) { if (el.chip) el.chip.classList.remove('show'); return; }
    if (!el.chip) {
      var c = el.chip = doc.createElement('button'); c.type = 'button'; c.id = 'meChip'; c.className = 'me-chip';
      c.innerHTML = '<b></b><span></span>'; c.addEventListener('click', function (ev) { ev.stopPropagation(); chipTap(); });
      doc.body.appendChild(c);
    }
    var b = el.chip.firstChild, s = el.chip.lastChild, msg = el.chipMsg && performance.now() < el.chipMsgT ? el.chipMsg : '';
    if (cur.hold) {
      var q = nearestSquad();
      b.textContent = run.holding ? 'HOLDING ' + Math.min(cur.n, cur.got || 0) + '/' + cur.n + ' s' : 'SEND SQUAD';
      s.textContent = msg || (q ? q.name + ' · ' + Math.round(q.d) + ' m from the ring' : 'no squad available') + ' · ' + POINTS[run.m.obj[run.i].p];
      el.chip.setAttribute('aria-label', 'Send the nearest squad to ' + POINTS[run.m.obj[run.i].p]);
    } else {
      b.textContent = 'STRIKE THE RING ' + cur.got + '/' + cur.n;
      s.textContent = msg || 'tap to look at ' + POINTS[run.m.obj[run.i].p] + ' · hits within ' + STRIKE_R + ' m count';
      el.chip.setAttribute('aria-label', 'Fly the camera to ' + POINTS[run.m.obj[run.i].p]);
    }
    el.chip.classList.toggle('held', !!run.holding); el.chip.classList.add('show');
  }
  function chipTap() {
    if (!run || !run.cur) return;
    if (run.cur.hold) sendSquad();
    else { try { if (LB.theaters && LB.theaters.flyToPoint) LB.theaters.flyToPoint(run.cur.px, run.cur.pz, 70); } catch (_) {} }
  }
  function mkOrders() {
    var o = run.m.obj[run.i], K = KINDS[o.k], base = K.mk(o.n);
    var m = { id: 'custom:' + o.k, text: objText(o), type: base.type, n: o.n, got: 0, combo: !!base.combo, call: false, score: !!base.score, pu: !!base.pu,
      hold: !!base.hold, spot: !!base.spot, time: o.t + (base.hold ? o.n : 0), left: o.t + (base.hold ? o.n : 0), reward: 150 + 50 * run.i, custom: true,
      chainTag: 'CUSTOM ORDERS ' + (run.i + 1) + '/' + run.m.obj.length };
    run.acc = 0; run.holding = false; run.cur = m;
    if (KINDS[o.k].map) { var P = pointXZ(o.p); m.px = P.x; m.pz = P.z; showMark(P.x, P.z); } else hideMark();
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
    if (run) { restoreConditions(run.prev); hideMark(); }
    run = { m: m, i: 0, t0: performance.now(), begun: false, ref: saved.find(function (s) { return s.name === m.name && encode(s) === encode(m); }) || null };
    run.prev = applyConditions(m);
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
    restoreConditions(run.prev); hideMark(); run = null; renderChip(); render();
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
      '<div class="me-row"><select id="meWx" aria-label="Start weather"></select><select id="meTod" aria-label="Start time of day"></select><select id="meSide" aria-label="Start side"></select></div>' +
      '<div id="meObjs" class="me-objs"></div>' +
      '<div class="me-row"><button type="button" id="meAdd">+ Objective</button><button type="button" id="mePlay" class="me-go">Play</button><button type="button" id="meSave">Save</button><button type="button" id="meShare">Share link</button></div>' +
      '<div class="me-row"><input id="meCode" placeholder="Paste a mission code or link" aria-label="Mission code"><button type="button" id="meImport">Load</button></div>' +
      '<div id="meSaved" class="me-saved"></div><div id="meStatus" class="sup-status"></div>' +
      '<div class="th-note">Your missions run through the ORDERS card: finish each objective before its timer runs out, one miss ends the run. Saved on this device. Game layer only; the market still drives the battle.</div>';
    var host = doc.querySelector('.sheet-command .sheet-body') || doc.querySelector('#sheet-command .sheet-body') || doc.body;
    host.appendChild(p);
    ['meWx', 'meTod', 'meSide', 'meName', 'mePreset', 'meObjs', 'meAdd', 'mePlay', 'meSave', 'meShare', 'meCode', 'meImport', 'meSaved', 'meStatus'].forEach(function (id) { el[id] = p.querySelector('#' + id); });
    Object.keys(WX).forEach(function (k) { el.meWx.appendChild(opt(k, WX[k])); });
    Object.keys(SIDES).forEach(function (k) { el.meSide.appendChild(opt(k, SIDES[k])); });
    Object.keys(TODS).forEach(function (k) { el.meTod.appendChild(opt(k, TODS[k])); });
    el.meTod.addEventListener('change', function () { draft.tod = TODS[el.meTod.value] ? el.meTod.value : ''; });
    el.meWx.addEventListener('change', function () { draft.wx = WX[el.meWx.value] ? el.meWx.value : ''; });
    el.meSide.addEventListener('change', function () { draft.side = SIDES[el.meSide.value] ? el.meSide.value : ''; });
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
    el.meName.value = draft.name; el.meObjs.textContent = ''; el.meWx.value = draft.wx || ''; el.meSide.value = draft.side || ''; el.meTod.value = draft.tod || '';
    draft.obj.forEach(function (o, i) {
      var row = doc.createElement('div'); row.className = 'me-obj';
      var num = doc.createElement('span'); num.className = 'me-num'; num.textContent = (i + 1) + '.';
      var k = doc.createElement('select'); k.setAttribute('aria-label', 'Objective ' + (i + 1));
      Object.keys(KINDS).forEach(function (id) { if (id === 'pu' && !(LB.powerups && LB.powerups.isEnabled && LB.powerups.isEnabled())) return; k.appendChild(opt(id, KINDS[id].label, id === o.k)); });
      var n = doc.createElement('input'); n.type = 'number'; n.value = o.n; n.min = KINDS[o.k].min; n.max = KINDS[o.k].max; n.setAttribute('aria-label', 'Target');
      var t = doc.createElement('input'); t.type = 'number'; t.value = o.t; t.min = 20; t.max = 180; t.step = 5; t.setAttribute('aria-label', 'Seconds');
      var ts = doc.createElement('span'); ts.className = 'me-s'; ts.textContent = 's';
      var x = doc.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove objective'); x.disabled = draft.obj.length < 2;
      k.addEventListener('change', function () { o.k = k.value; o.n = KINDS[o.k].def; if (KINDS[o.k].map && !o.p) o.p = 'front'; if (!KINDS[o.k].map) delete o.p; renderDraft(); });
      n.addEventListener('change', function () { o.n = clampInt(n.value, KINDS[o.k].min, KINDS[o.k].max, KINDS[o.k].def); n.value = o.n; });
      t.addEventListener('change', function () { o.t = clampInt(t.value, 20, 180, 60); t.value = o.t; });
      x.addEventListener('click', function () { if (draft.obj.length > 1) { draft.obj.splice(i, 1); renderDraft(); } });
      [num, k, n, t, ts, x].forEach(function (c) { row.appendChild(c); }); el.meObjs.appendChild(row);
      if (KINDS[o.k].map) {
        var pr = doc.createElement('div'); pr.className = 'me-pt'; var lb = doc.createElement('span'); lb.textContent = 'at';
        var ps = doc.createElement('select'); ps.setAttribute('aria-label', 'Point for objective ' + (i + 1));
        Object.keys(POINTS).forEach(function (id) { ps.appendChild(opt(id, POINTS[id], id === o.p)); });
        ps.addEventListener('change', function () { o.p = POINTS[ps.value] ? ps.value : 'front'; });
        pr.appendChild(lb); pr.appendChild(ps); el.meObjs.appendChild(pr);
      }
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
  function summary(m) {
    var c = [m.wx ? WX[m.wx] : '', m.tod ? TODS[m.tod] : '', m.side ? (m.side === 'bull' ? 'Bulls' : 'Bears') : ''].filter(Boolean);
    return m.obj.map(function (o) { return KINDS[o.k].short + (o.p ? ' ' + POINTS[o.p] : ''); }).join(' → ') + (c.length ? ' · ' + c.join(', ') : '');
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
      var nm = doc.createElement('span'); nm.className = 'me-svn'; nm.textContent = s.name + ' · ' + s.obj.length + ' obj' + (s.best != null ? ' · best ' + s.best + ' s' : '');
      var sm = doc.createElement('small'); sm.textContent = summary(s); nm.appendChild(sm); nm.title = s.obj.map(objText).join(' → ');
      var ld = doc.createElement('button'); ld.type = 'button'; ld.textContent = 'Edit'; ld.addEventListener('click', function () { draft = sanitize(s); renderDraft(); });
      var pl = doc.createElement('button'); pl.type = 'button'; pl.textContent = 'Play'; pl.addEventListener('click', function () { if (run) stop(); if (play(s)) closeSheet(); });
      var dl = doc.createElement('button'); dl.type = 'button'; dl.textContent = '×'; dl.setAttribute('aria-label', 'Delete ' + s.name); dl.addEventListener('click', function () { saved.splice(i, 1); store(); render(); });
      [nm, ld, pl, dl].forEach(function (c) { r.appendChild(c); }); el.meSaved.appendChild(r);
    });
    el.meStatus.textContent = run ? 'Objective ' + (run.i + 1) + ' of ' + run.m.obj.length + ' · ' + run.m.name + (run.cur && run.cur.hold ? (run.holding ? ' · HOLDING' : ' · move a squad onto the gold ring (Orders)') : '') : (stats.last || 'Build a mission, then Play');
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
        tickIv = setInterval(function () { try { tickMap(); } catch (e) { console.warn('[editor] map', e); } }, 250);
      }
    }, 500);
  }
  LB.missionEditor = {
    version: 'v12.0.45', isEnabled: function () { return enabled; }, next: next, play: play, stop: stop, strikeAt: strikeAt, sendSquad: sendSquad, nearest: nearestSquad, summary: function (m) { m = sanitize(m); return m ? summary(m) : ''; }, points: function () { var o = {}; Object.keys(POINTS).forEach(function (k) { o[k] = pointXZ(k); }); return o; },
    marker: function () { return mark ? { x: mark.x, z: mark.z } : null; },
    encode: encode, decode: decode, sanitize: sanitize, save: function (m) { if (m) draft = sanitize(m) || draft; return saveDraft(); }, saved: function () { return saved.map(function (s) { return Object.assign({}, s); }); },
    share: function (m) { return linkFor(sanitize(m || draft)); },
    getState: function () { return { enabled: enabled, running: !!run, index: run ? run.i : -1, holding: !!(run && run.holding), cur: run && run.cur ? { text: run.cur.text, got: run.cur.got, n: run.cur.n, px: run.cur.px, pz: run.cur.pz } : null, name: run ? run.m.name : null, tod: run ? run.m.tod : null, chip: !!(el.chip && el.chip.classList.contains('show')), ringFlash: mark ? +(mark.flash || 0).toFixed(2) : 0, queued: !!queued, saved: saved.length, stats: Object.assign({}, stats) }; }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
