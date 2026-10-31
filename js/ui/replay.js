/* LUNC Battlefield v12.0.46 — after-action replay, part 1 (v12.3 "A replay system"). Game layer, read-only.
 * The battle is driven by live market prices and randomised systems, so an exact deterministic re-simulation from a
 * command log + seed is not possible here. This is a RECORDED replay instead: every 2 s the recorder keeps a compact
 * frame (market front X with the data-truth label it had at that moment, score, ORDERS text, live unit counts, up to
 * 24 sampled market-army units per side (16 on LOW / phones), every squad, the Hill 402 holder) for the last 10 minutes,
 * plus events (Commander strikes, orders complete / failed, custom missions). The AFTER-ACTION viewer draws it top-down
 * with a front chart, Play / Pause, 1x / 4x / 16x, a scrubber, previous / next event and an event list; tapping an event
 * while the game runs flies the live camera there. Up to 2 replays saved on the device, export as .json.
 * Only reads the engine; never touches market data, armies, the front or data-truth labels. ?replay=0 → off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('replay') !== '0';
  var KEY = 'luncBattle.replays.v1', DT = 2, MAX_FRAMES = 300, MAX_EVENTS = 400, MAX_SAVED = 2;
  var VIEW = { minX: -160, maxX: 160, minZ: -110, maxZ: 80 };
  var TYPE_N = ['inf', 'armor', 'arty'], ABIL_SHORT = { arty: 'Artillery', air: 'Air strike', moon: 'Moon Shot', cluster: 'Cluster', emp: 'EMP', flare: 'Flare', moab: 'MOAB', cbomb: 'Carpet bomb', napalm: 'Napalm', gas: 'Gas', a10: 'A-10 run', nuke: 'Mini nuke' };
  var rec = { t0: Date.now(), frames: [], events: [] }, sampleIv = null, saved = [], el = {}, view = null, stats = { frames: 0, events: 0, saves: 0, opened: 0, last: '' };

  function E() { return LB.engine; }
  function C() { return LB.commander; }
  function lowTier() { try { return LB.quality.getEffectiveName() === 'LOW' || (E() && E().mobile); } catch (_) { return false; } }
  function now() { return (Date.now() - rec.t0) / 1000; }
  function r1(v) { return Math.round(v * 10) / 10; }

  // ------------------------------------------------------------------ recorder
  function sample() {
    var e = E(); if (!e || !e.getFrontlineX) return;
    try { if (e.isPaused && e.isPaused()) return; } catch (_) {}
    var f = { t: r1(now()), fx: r1(e.getFrontlineX() || 0), live: !!(e.isPriceLive && e.isPriceLive()), sc: 0, ord: '', n: [0, 0, 0, 0, 0, 0], u: [], q: [], ow: 0 };
    try { var st = C().getState(); f.sc = st.session ? st.session.score | 0 : 0; f.ord = st.mission ? String(st.mission.text || '').slice(0, 60) : ''; f.side = st.profile.side === 'bull' ? -1 : 1; } catch (_) {}
    try {
      var A = e.getArmies(), per = lowTier() ? 16 : 24;
      [A.bulls, A.bears].forEach(function (arr, si) {
        var alive = [];
        for (var i = 0; i < arr.length; i++) { var u = arr[i], ud = u.userData || {}; if (ud.dead === true || u.visible === false || ud.air) continue; var ty = ud.type | 0; if (ty > 2) continue; f.n[si * 3 + ty]++; alive.push(u); }
        var step = Math.max(1, alive.length / per);
        for (var k = 0, got = 0; k < alive.length && got < per; k += step, got++) { var w = alive[Math.floor(k)]; f.u.push(si ? 1 : -1, (w.userData.type | 0), Math.round(w.position.x), Math.round(w.position.z)); }
      });
    } catch (_) {}
    try { (LB.squads && LB.squads.list ? LB.squads.list() : []).forEach(function (q) { f.q.push(q.side, Math.round(q.x), Math.round(q.z), q.dead ? 0 : q.alive | 0, String(q.name || '').slice(0, 10)); }); } catch (_) {}
    try { if (LB.ridge && LB.ridge.isEnabled && LB.ridge.isEnabled()) f.ow = LB.ridge.state().owner || 0; } catch (_) {}
    rec.frames.push(f); stats.frames++;
    if (rec.frames.length > MAX_FRAMES) rec.frames.shift();
    var cut = rec.frames[0].t; while (rec.events.length && rec.events[0].t < cut) rec.events.shift();
  }
  /** hook: kind 'strike' (a = ability, x, z) | 'done' | 'fail' (a = orders text) | 'mission' (a = name, won) */
  function event(kind, a, x, z, extra) {
    if (!enabled) return;
    var ev = { t: r1(now()), k: kind, a: String(a == null ? '' : a).slice(0, 60) };
    if (x != null && isFinite(x)) { ev.x = Math.round(x); ev.z = Math.round(z || 0); }
    if (extra != null) ev.w = extra ? 1 : 0;
    rec.events.push(ev); stats.events++;
    if (rec.events.length > MAX_EVENTS) rec.events.shift();
  }
  function snapshot(name) {
    var sm = null; try { if (LB.ridge && LB.ridge.isEnabled && LB.ridge.isEnabled()) { var q = LB.ridge.summit(); sm = { x: Math.round(q.x), z: Math.round(q.z) }; } } catch (_) {}
    return { v: 1, name: String(name || '').replace(/[^A-Za-z0-9 .,:!?'#()_-]/g, '').slice(0, 40) || 'Battle', at: new Date().toISOString(), dt: DT,
      summit: sm, frames: rec.frames.slice(), events: rec.events.slice() };
  }
  /** Validate a replay from storage / file into a safe one, or null. */
  function sanitize(r) {
    if (!r || typeof r !== 'object' || r.v !== 1 || !Array.isArray(r.frames) || !r.frames.length) return null;
    var num = function (v, d) { v = +v; return isFinite(v) ? v : d; };
    var frames = r.frames.slice(-MAX_FRAMES).map(function (f) {
      if (!f || typeof f !== 'object') return null;
      return { t: num(f.t, 0), fx: num(f.fx, 0), live: !!f.live, sc: num(f.sc, 0) | 0, ord: String(f.ord || '').slice(0, 60), side: f.side === 1 ? 1 : -1,
        n: (Array.isArray(f.n) ? f.n : []).slice(0, 6).map(function (v) { return num(v, 0) | 0; }),
        u: (Array.isArray(f.u) ? f.u : []).slice(0, 4 * 48).map(function (v) { return num(v, 0) | 0; }),
        q: (Array.isArray(f.q) ? f.q : []).slice(0, 5 * 24).map(function (v, i) { return i % 5 === 4 ? String(v).replace(/[^A-Za-z0-9 -]/g, '').slice(0, 10) : num(v, 0) | 0; }), ow: num(f.ow, 0) | 0 };
    }).filter(Boolean);
    if (!frames.length) return null;
    var events = (Array.isArray(r.events) ? r.events : []).slice(-MAX_EVENTS).map(function (ev) {
      if (!ev || typeof ev !== 'object' || ['strike', 'done', 'fail', 'mission'].indexOf(ev.k) < 0) return null;
      var o = { t: num(ev.t, 0), k: ev.k, a: String(ev.a || '').replace(/[<>]/g, '').slice(0, 60) };
      if (ev.x != null) { o.x = num(ev.x, 0) | 0; o.z = num(ev.z, 0) | 0; } if (ev.w != null) o.w = ev.w ? 1 : 0; return o;
    }).filter(Boolean);
    var sm = r.summit && isFinite(+r.summit.x) && isFinite(+r.summit.z) ? { x: +r.summit.x | 0, z: +r.summit.z | 0 } : null;
    return { v: 1, name: String(r.name || 'Battle').replace(/[^A-Za-z0-9 .,:!?'#()_-]/g, '').slice(0, 40) || 'Battle', at: String(r.at || '').slice(0, 30), dt: DT, summit: sm, frames: frames, events: events };
  }
  function load() { try { var a = JSON.parse(localStorage.getItem(KEY) || '[]'); saved = (Array.isArray(a) ? a : []).map(sanitize).filter(Boolean).slice(0, MAX_SAVED); } catch (_) { saved = []; } }
  function store() { try { localStorage.setItem(KEY, JSON.stringify(saved)); return true; } catch (_) { stats.last = 'Not enough storage on this device to save'; return false; } }
  function save(name) {
    if (rec.frames.length < 2) { stats.last = 'Nothing recorded yet, give it a few seconds'; render(); return null; }
    var r = sanitize(snapshot(name || 'Battle ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
    saved.unshift(r); if (saved.length > MAX_SAVED) saved.length = MAX_SAVED;
    if (store()) { stats.saves++; stats.last = 'Saved "' + r.name + '" (' + dur(r) + ')'; } render(); return r;
  }
  function dur(r) { var s = Math.max(0, r.frames[r.frames.length - 1].t - r.frames[0].t); return s >= 60 ? Math.floor(s / 60) + ' min ' + Math.round(s % 60) + ' s' : Math.round(s) + ' s'; }
  function exportJson(r) {
    try {
      var b = new Blob([JSON.stringify(r)], { type: 'application/json' }), a = doc.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'lunc-replay-' + (r.at || '').slice(0, 16).replace(/[^0-9T]/g, '') + '.json'; doc.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); return true;
    } catch (_) { return false; }
  }

  // ------------------------------------------------------------------ viewer
  function evLabel(ev) {
    if (ev.k === 'strike') return (ABIL_SHORT[ev.a] || ev.a) + (ev.x != null ? ' at ' + ev.x + ', ' + ev.z : '');
    if (ev.k === 'done') return 'Orders complete: ' + ev.a;
    if (ev.k === 'fail') return 'Orders failed: ' + ev.a;
    return (ev.w ? 'Mission accomplished: ' : 'Mission over: ') + ev.a;
  }
  /** world box around everything recorded (units, squads, strikes, the front), padded, clamped to the battle area */
  function contentBox(r) {
    var b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }, add = function (x, z) { if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x; if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z; };
    r.frames.forEach(function (f) { for (var i = 0; i + 3 < f.u.length; i += 4) add(f.u[i + 2], f.u[i + 3]); for (var j = 0; j + 4 < f.q.length; j += 5) add(f.q[j + 1], f.q[j + 2]); add(f.fx, 0); });
    r.events.forEach(function (ev) { if (ev.x != null) add(ev.x, ev.z); });
    if (!isFinite(b.minX)) return { minX: VIEW.minX, maxX: VIEW.maxX, minZ: VIEW.minZ, maxZ: VIEW.maxZ };
    var px = Math.max(12, (b.maxX - b.minX) * 0.12), pz = Math.max(12, (b.maxZ - b.minZ) * 0.12);
    return { minX: Math.max(VIEW.minX, b.minX - px), maxX: Math.min(VIEW.maxX, b.maxX + px), minZ: Math.max(VIEW.minZ, b.minZ - pz), maxZ: Math.min(VIEW.maxZ, b.maxZ + pz) };
  }
  function fmtT(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function buildViewer() {
    if (el.v) return;
    var v = el.v = doc.createElement('div'); v.id = 'replayViewer'; v.className = 'rp-viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'After-action replay');
    v.innerHTML = '<div class="rp-head"><b>AFTER-ACTION REPLAY</b> <span class="qual sim">RECORDED · GAME LAYER</span><span id="rpName" class="rp-name"></span><button type="button" id="rpClose" class="rp-x" aria-label="Close replay">×</button></div>' +
      '<div class="rp-stage"><canvas id="rpMap" aria-label="Replay map"></canvas><div id="rpHud" class="rp-hud"></div></div>' +
      '<canvas id="rpChart" class="rp-chart" aria-label="Front position over time"></canvas>' +
      '<input type="range" id="rpScrub" class="rp-scrub" min="0" max="1000" value="0" aria-label="Replay position">' +
      '<div class="rp-ctl"><button type="button" id="rpPrev" aria-label="Previous event">⏮</button><button type="button" id="rpPlay" class="rp-go">▶ Play</button><button type="button" id="rpNext" aria-label="Next event">⏭</button>' +
      '<button type="button" data-sp="1" class="rp-sp">1x</button><button type="button" data-sp="4" class="rp-sp on">4x</button><button type="button" data-sp="16" class="rp-sp">16x</button><span id="rpTime" class="rp-time"></span></div>' +
      '<div id="rpEvents" class="rp-events"></div>' +
      '<div class="th-note">Recorded every ' + DT + ' s, not re-simulated: the front line is the market-driven position at that moment, with the price source it had (LIVE or SIMULATED). Up to 24 sampled units per side are shown. Tap an event to look at that spot in the live battle.</div>';
    doc.body.appendChild(v);
    ['rpName', 'rpClose', 'rpMap', 'rpHud', 'rpChart', 'rpScrub', 'rpPrev', 'rpPlay', 'rpNext', 'rpTime', 'rpEvents'].forEach(function (id) { el[id] = v.querySelector('#' + id); });
    el.rpClose.addEventListener('click', close);
    el.rpPlay.addEventListener('click', function () { if (!view) return; if (view.t >= view.t1 - 0.01) view.t = view.t0; view.playing = !view.playing; view.last = performance.now(); draw(); });
    el.rpPrev.addEventListener('click', function () { jump(-1); });
    el.rpNext.addEventListener('click', function () { jump(1); });
    v.querySelectorAll('.rp-sp').forEach(function (b) { b.addEventListener('click', function () { if (!view) return; view.speed = +b.getAttribute('data-sp'); v.querySelectorAll('.rp-sp').forEach(function (o) { o.classList.toggle('on', o === b); }); }); });
    el.rpScrub.addEventListener('input', function () { if (!view) return; view.playing = false; view.t = view.t0 + (view.t1 - view.t0) * (+el.rpScrub.value / 1000); draw(); });
    el.rpChart.addEventListener('click', function (ev) { if (!view) return; var r = el.rpChart.getBoundingClientRect(); view.playing = false; view.t = view.t0 + (view.t1 - view.t0) * Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); draw(); });
    v.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } else if (ev.key === ' ' && ev.target === v) { ev.preventDefault(); el.rpPlay.click(); } });
    global.addEventListener('resize', function () { if (view) draw(); });
  }
  function open(r) {
    if (!enabled) return false;
    r = r ? sanitize(r) : sanitize(snapshot('Last ' + Math.max(1, Math.round((rec.frames.length ? rec.frames[rec.frames.length - 1].t - rec.frames[0].t : 0) / 60)) + ' min'));
    if (!r || r.frames.length < 2) { stats.last = 'Nothing recorded yet, give it a few seconds'; render(); return false; }
    buildViewer();
    view = { r: r, t0: r.frames[0].t, t1: r.frames[r.frames.length - 1].t, t: r.frames[0].t, playing: true, speed: 4, last: performance.now(), fi: 0, box: contentBox(r) };
    el.v.querySelectorAll('.rp-sp').forEach(function (o) { o.classList.toggle('on', o.getAttribute('data-sp') === '4'); });
    el.rpName.textContent = r.name + ' · ' + dur(r);
    el.rpEvents.textContent = '';
    r.events.forEach(function (ev, i) {
      var b = doc.createElement('button'); b.type = 'button'; b.className = 'rp-ev rp-' + ev.k; b.setAttribute('data-i', i);
      var t = doc.createElement('span'); t.textContent = fmtT(ev.t - view.t0); var s = doc.createElement('span'); s.textContent = evLabel(ev);
      b.appendChild(t); b.appendChild(s);
      b.addEventListener('click', function () { view.playing = false; view.t = Math.max(view.t0, ev.t - 1); draw(); lookAt(ev); });
      el.rpEvents.appendChild(b);
    });
    if (!r.events.length) { var n = doc.createElement('div'); n.className = 'rp-none'; n.textContent = 'No strikes or orders in this stretch yet.'; el.rpEvents.appendChild(n); }
    el.v.classList.add('show'); el.v.tabIndex = -1; try { el.v.focus({ preventScroll: true }); } catch (_) {}
    doc.body.classList.add('replay-open'); stats.opened++;
    try { var b2 = doc.querySelector('#sheet-command .sheet-x'); if (b2 && doc.querySelector('#sheet-command.open, .sheet-command.open')) b2.click(); } catch (_) {}
    requestAnimationFrame(loop); draw(); return true;
  }
  function close() { if (!el.v) return; el.v.classList.remove('show'); doc.body.classList.remove('replay-open'); view = null; }
  function lookAt(ev) { if (ev.x == null) return; try { if (LB.theaters && LB.theaters.flyToPoint) LB.theaters.flyToPoint(ev.x, ev.z, 70); } catch (_) {} }
  function jump(dir) {
    if (!view) return; var evs = view.r.events, t = view.t, pick = null;
    for (var i = 0; i < evs.length; i++) { var e2 = evs[i]; if (dir > 0 ? e2.t > t + 0.6 : e2.t < t - 1.2) { if (dir > 0) { pick = e2; break; } pick = e2; } }
    if (pick) { view.playing = false; view.t = Math.max(view.t0, pick.t - 0.5); draw(); }
  }
  function loop() {
    if (!view) return;
    var n = performance.now(), dt = Math.min(0.25, (n - view.last) / 1000); view.last = n;
    if (view.playing) { view.t += dt * view.speed; if (view.t >= view.t1) { view.t = view.t1; view.playing = false; } draw(); }
    requestAnimationFrame(loop);
  }
  function frameAt(t) {
    var F = view.r.frames, i = view.fi;
    if (F[i].t > t) i = 0;
    while (i < F.length - 1 && F[i + 1].t <= t) i++;
    view.fi = i; var a = F[i], b = F[Math.min(F.length - 1, i + 1)], k = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
    return { a: a, b: b, k: k };
  }
  function fitCanvas(cv) {
    var r = cv.getBoundingClientRect(), dpr = Math.min(2, global.devicePixelRatio || 1), w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return { w: w, h: h, dpr: dpr };
  }
  function draw() {
    if (!view || !el.v) return;
    var FA = frameAt(view.t), a = FA.a, b = FA.b, k = FA.k, cv = el.rpMap, S = fitCanvas(cv), g = cv.getContext('2d'), W = S.w, H = S.h, d = S.dpr;
    // equal x/z scale (no stretching), centred on the recorded content
    var B = view.box, sc = Math.min(W / (B.maxX - B.minX), H / (B.maxZ - B.minZ)), cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    var sx = function (x) { return W / 2 + (x - cx) * sc; }, sz = function (z) { return H / 2 + (z - cz) * sc; };
    view.px = { sx: sx, sz: sz, sc: sc };
    g.fillStyle = '#17201a'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    for (var gx = -250; gx <= 250; gx += 10) { var X0 = sx(gx); if (X0 < 0 || X0 > W) continue; g.strokeStyle = gx % 50 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(X0, 0); g.lineTo(X0, H); g.stroke(); }
    for (var gz = -250; gz <= 250; gz += 10) { var Z0 = sz(gz); if (Z0 < 0 || Z0 > H) continue; g.strokeStyle = gz % 50 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(0, Z0); g.lineTo(W, Z0); g.stroke(); }
    // 10 m scale bar
    g.strokeStyle = 'rgba(238,243,239,.6)'; g.lineWidth = d; g.beginPath(); g.moveTo(W - 12 * d - 10 * sc, H - 12 * d); g.lineTo(W - 12 * d, H - 12 * d); g.stroke();
    g.fillStyle = 'rgba(238,243,239,.6)'; g.font = (9 * d) + 'px Inter, sans-serif'; g.textAlign = 'right'; g.fillText('10 m', W - 12 * d, H - 16 * d);
    if (view.r.summit) { var hx = sx(view.r.summit.x), hz = sz(view.r.summit.z); if (hx > 0 && hx < W && hz > 0 && hz < H) { g.fillStyle = a.ow ? (a.ow < 0 ? '#5aa8ff' : '#ff6a5f') : 'rgba(238,243,239,.5)'; g.beginPath(); g.moveTo(hx, hz - 7 * d); g.lineTo(hx + 6 * d, hz + 4 * d); g.lineTo(hx - 6 * d, hz + 4 * d); g.fill(); g.textAlign = 'center'; g.fillText('Hill 402', hx, hz + 15 * d); } }
    var fx = a.fx + (b.fx - a.fx) * k;
    g.fillStyle = 'rgba(80,150,255,.07)'; g.fillRect(0, 0, sx(fx), H); g.fillStyle = 'rgba(255,90,80,.07)'; g.fillRect(sx(fx), 0, W - sx(fx), H);
    g.strokeStyle = a.live ? '#ffd36a' : 'rgba(255,211,106,.6)'; g.lineWidth = 2 * d; g.setLineDash(a.live ? [] : [6 * d, 4 * d]);
    g.beginPath(); g.moveTo(sx(fx), 0); g.lineTo(sx(fx), H); g.stroke(); g.setLineDash([]);
    // units (sampled; interpolated when the same slot exists in both frames)
    var U = a.u, V = b.u.length === a.u.length ? b.u : a.u;
    for (var i = 0; i + 3 < U.length; i += 4) {
      var x = U[i + 2] + (V[i + 2] - U[i + 2]) * k, z = U[i + 3] + (V[i + 3] - U[i + 3]) * k, ty = U[i + 1];
      g.fillStyle = U[i] < 0 ? '#5aa8ff' : '#ff6a5f'; var s = Math.max(1.6 * d, Math.min(6 * d, (ty === 1 ? 2.2 : ty === 2 ? 1.9 : 0.9) * sc));
      if (ty === 2) { g.beginPath(); g.moveTo(sx(x), sz(z) - s); g.lineTo(sx(x) + s, sz(z) + s); g.lineTo(sx(x) - s, sz(z) + s); g.fill(); } else g.fillRect(sx(x) - s, sz(z) - s * (ty === 1 ? 0.7 : 1), s * 2, s * (ty === 1 ? 1.4 : 2));
    }
    // squads
    var Q = a.q, R = b.q.length === a.q.length ? b.q : a.q;
    g.font = (10 * d) + 'px Inter, sans-serif'; g.textAlign = 'center';
    for (var j = 0; j + 4 < Q.length; j += 5) {
      var qx = Q[j + 1] + (R[j + 1] - Q[j + 1]) * k, qz = Q[j + 2] + (R[j + 2] - Q[j + 2]) * k, alive = Q[j + 3] > 0;
      g.globalAlpha = alive ? 1 : 0.35; g.strokeStyle = Q[j] < 0 ? '#9fd0ff' : '#ffb0a8'; g.lineWidth = 2 * d;
      var px = sx(qx), pz = sz(qz), c = 5 * d; g.beginPath(); g.moveTo(px - c, pz + c * 0.4); g.lineTo(px, pz - c * 0.6); g.lineTo(px + c, pz + c * 0.4); g.stroke();
      if (Q[j] === a.side) { g.fillStyle = 'rgba(238,243,239,.85)'; g.fillText(Q[j + 4], px, pz - c * 1.3); }
    }
    g.globalAlpha = 1;
    // strikes: expanding rings for 3 s after they land
    view.r.events.forEach(function (ev) {
      if (ev.k !== 'strike' || ev.x == null) return; var age = view.t - ev.t; if (age < 0 || age > 3) return;
      var rr = Math.max(3 * d, (2 + age * 6) * sc * (ev.a === 'nuke' || ev.a === 'moab' ? 2.2 : 1));
      if (age < 2) { g.fillStyle = 'rgba(255,210,140,' + (1 - age / 2).toFixed(2) + ')'; g.font = (10 * d) + 'px Inter, sans-serif'; g.textAlign = 'center'; g.fillText(ABIL_SHORT[ev.a] || ev.a, sx(ev.x), sz(ev.z) - rr - 4 * d); }
      g.strokeStyle = 'rgba(255,190,90,' + (1 - age / 3).toFixed(2) + ')'; g.lineWidth = 2.5 * d; g.beginPath(); g.arc(sx(ev.x), sz(ev.z), rr, 0, Math.PI * 2); g.stroke();
      if (age < 0.6) { g.fillStyle = 'rgba(255,230,150,' + (1 - age / 0.6).toFixed(2) + ')'; g.beginPath(); g.arc(sx(ev.x), sz(ev.z), 3 * d, 0, Math.PI * 2); g.fill(); }
    });
    // HUD
    var n = a.n || [], ow = a.ow ? (a.ow < 0 ? 'Bulls' : 'Bears') : 'nobody';
    el.rpHud.textContent = '';
    [['FRONT', (fx >= 0 ? '+' : '') + fx.toFixed(1) + ' · ' + (a.live ? 'LIVE price' : 'SIMULATED price')], ['SCORE', String(Math.round(a.sc + (b.sc - a.sc) * k))],
      ['BULLS', (n[0] | 0) + ' inf · ' + (n[1] | 0) + ' armor · ' + (n[2] | 0) + ' arty'], ['BEARS', (n[3] | 0) + ' inf · ' + (n[4] | 0) + ' armor · ' + (n[5] | 0) + ' arty'],
      ['HILL 402', ow], ['ORDERS', a.ord || '—']].forEach(function (p) { var r = doc.createElement('div'); var bb = doc.createElement('b'); bb.textContent = p[0]; var s2 = doc.createElement('span'); s2.textContent = p[1]; r.appendChild(bb); r.appendChild(s2); el.rpHud.appendChild(r); });
    drawChart();
    el.rpScrub.value = String(Math.round((view.t - view.t0) / Math.max(0.001, view.t1 - view.t0) * 1000));
    el.rpTime.textContent = fmtT(view.t - view.t0) + ' / ' + fmtT(view.t1 - view.t0);
    el.rpPlay.textContent = view.playing ? '❚❚ Pause' : '▶ Play';
    var cur = -1; view.r.events.forEach(function (ev, i) { if (ev.t <= view.t + 0.01) cur = i; });
    if (cur !== view.cur) { view.cur = cur; el.rpEvents.querySelectorAll('.rp-ev').forEach(function (bt) { var on = +bt.getAttribute('data-i') === cur; bt.classList.toggle('on', on); if (on && view.playing) try { bt.scrollIntoView({ block: 'nearest' }); } catch (_) {} }); }
  }
  function drawChart() {
    var cv = el.rpChart, S = fitCanvas(cv), g = cv.getContext('2d'), W = S.w, H = S.h, F = view.r.frames, d = S.dpr;
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
    var lo = Infinity, hi = -Infinity; F.forEach(function (f) { lo = Math.min(lo, f.fx); hi = Math.max(hi, f.fx); }); if (hi - lo < 4) { var m = (hi + lo) / 2; lo = m - 2; hi = m + 2; }
    var tx = function (t) { return (t - view.t0) / Math.max(0.001, view.t1 - view.t0) * W; }, ty = function (v) { return H - 4 * d - (v - lo) / (hi - lo) * (H - 8 * d); };
    if (lo < 0 && hi > 0) { g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(0, ty(0)); g.lineTo(W, ty(0)); g.stroke(); }
    g.lineWidth = 1.5 * d;
    for (var i = 1; i < F.length; i++) { g.strokeStyle = F[i].live ? '#ffd36a' : 'rgba(255,211,106,.45)'; g.beginPath(); g.moveTo(tx(F[i - 1].t), ty(F[i - 1].fx)); g.lineTo(tx(F[i].t), ty(F[i].fx)); g.stroke(); }
    view.r.events.forEach(function (ev) { g.fillStyle = ev.k === 'strike' ? 'rgba(255,170,80,.9)' : ev.k === 'fail' || (ev.k === 'mission' && !ev.w) ? '#ff6a5f' : '#6aff8f'; g.fillRect(tx(ev.t) - d, ev.k === 'strike' ? 0 : H - 6 * d, 2 * d, 6 * d); });
    g.strokeStyle = '#fff'; g.lineWidth = 1.5 * d; g.beginPath(); g.moveTo(tx(view.t), 0); g.lineTo(tx(view.t), H); g.stroke();
    g.fillStyle = 'rgba(238,243,239,.7)'; g.font = (9 * d) + 'px Inter, sans-serif'; g.textAlign = 'left'; g.fillText('FRONT POSITION (market price)', 4 * d, 10 * d);
  }

  // ------------------------------------------------------------------ Cmd sheet panel
  function buildUi() {
    var p = el.p = doc.createElement('div'); p.id = 'replayPanel'; p.className = 'supply-panel rp-panel';
    p.innerHTML = '<div class="th-title">AFTER-ACTION REPLAY <span class="qual sim">RECORDED</span></div>' +
      '<div class="me-row"><button type="button" id="rpWatch" class="me-go">Watch the last minutes</button><button type="button" id="rpSave">Save replay</button></div>' +
      '<div id="rpSaved" class="me-saved"></div><div id="rpStatus" class="sup-status"></div>';
    var host = doc.querySelector('#sheet-command .sheet-body') || doc.querySelector('.sheet-command .sheet-body') || doc.body, me = doc.getElementById('missionEditor');
    if (me && me.parentNode === host) host.insertBefore(p, me.nextSibling); else host.appendChild(p);
    el.rpWatch = p.querySelector('#rpWatch'); el.rpSaved = p.querySelector('#rpSaved'); el.rpStatus = p.querySelector('#rpStatus');
    el.rpWatch.addEventListener('click', function () { open(null); });
    p.querySelector('#rpSave').addEventListener('click', function () { save(); });
    render();
  }
  function render() {
    if (!el.p) return;
    var span = rec.frames.length > 1 ? rec.frames[rec.frames.length - 1].t - rec.frames[0].t : 0;
    el.rpWatch.textContent = span >= 60 ? 'Watch the last ' + Math.round(span / 60) + ' min' : 'Watch the last ' + Math.round(span) + ' s';
    el.rpSaved.textContent = '';
    saved.forEach(function (r, i) {
      var row = doc.createElement('div'); row.className = 'me-sv';
      var nm = doc.createElement('span'); nm.className = 'me-svn'; nm.textContent = r.name + ' · ' + dur(r);
      var sm = doc.createElement('small'); sm.textContent = r.events.filter(function (e) { return e.k === 'strike'; }).length + ' strikes · ' + r.events.filter(function (e) { return e.k === 'done'; }).length + ' orders done'; nm.appendChild(sm);
      var w = doc.createElement('button'); w.type = 'button'; w.textContent = 'Watch'; w.addEventListener('click', function () { open(r); });
      var x = doc.createElement('button'); x.type = 'button'; x.textContent = 'Export'; x.addEventListener('click', function () { exportJson(r); });
      var dl = doc.createElement('button'); dl.type = 'button'; dl.textContent = '×'; dl.setAttribute('aria-label', 'Delete ' + r.name); dl.addEventListener('click', function () { saved.splice(i, 1); store(); render(); });
      [nm, w, x, dl].forEach(function (c) { row.appendChild(c); }); el.rpSaved.appendChild(row);
    });
    el.rpStatus.textContent = stats.last || ('Recording · ' + rec.frames.length + ' frames, ' + rec.events.length + ' events kept (last 10 min)');
  }

  function init() {
    if (!enabled) return;
    load();
    sampleIv = setInterval(function () { try { sample(); } catch (e) { console.warn('[replay] sample', e); } }, DT * 1000);
    var tries = 0, iv = setInterval(function () {
      var host = doc.querySelector('#sheet-command .sheet-body') || doc.querySelector('.sheet-command .sheet-body');
      if ((host && (doc.getElementById('missionEditor') || tries > 6)) || ++tries > 120) { clearInterval(iv); try { buildUi(); } catch (e) { console.warn('[replay] ui', e); } setInterval(function () { if (!view) render(); }, 3000); }
    }, 500);
    // capture phase so Esc closes the viewer without also pausing the battle (commander listens on window)
    global.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && view) { ev.stopImmediatePropagation(); ev.preventDefault(); close(); } }, true);
  }
  LB.replay = {
    version: 'v12.0.46', isEnabled: function () { return enabled; }, event: event, sample: sample, open: open, close: close, save: save, sanitize: sanitize,
    saved: function () { return saved.map(function (r) { return { name: r.name, frames: r.frames.length, events: r.events.length }; }); }, exportJson: exportJson,
    snapshot: function () { return snapshot('test'); }, seek: function (t) { if (view) { view.playing = false; view.t = Math.max(view.t0, Math.min(view.t1, view.t0 + t)); draw(); } },
    getState: function () { return { enabled: enabled, frames: rec.frames.length, events: rec.events.length, open: !!view, t: view ? +(view.t - view.t0).toFixed(1) : null, playing: !!(view && view.playing), speed: view ? view.speed : null, saved: saved.length, stats: Object.assign({}, stats) }; }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
