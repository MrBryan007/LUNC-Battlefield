/* LUNC Battlefield v12.0.16 — Tactical map: military symbology + expand mode (v12.1 "tactical minimap").
 *
 * UI / game layer only. Reads positions (SIMULATED) and the market-driven front; never writes market data, armies,
 * the front or data-truth labels.
 *  - Draws the always-on world inset (replaces the 1–2 px dot renderer in extras.js) backed at devicePixelRatio.
 *  - APP-6-inspired symbols (own drawing, not copied art): frames relative to the Commander's side — own = rectangle,
 *    enemy = diamond — in faction colours. Ground units aggregate per map cell into one symbol per type
 *    (infantry ✕, armor ellipse, artillery dot, helicopter bow-tie) with echelon ticks by count. Air tracks (dome /
 *    half-diamond + heading leader), surface ships (circle / diamond + CV·BB·DD), HQs with a staff, airbases,
 *    supply depots, forts, supply-drop pings, fog-of-war dimming + ghosts.
 *  - FLOT: the live front as a line with semicircles facing the enemy; header says where it comes from.
 *  - Expand mode (⤢ button, N key, Map-sheet button): large map, World / Front zoom, lettered grid (50 m cells),
 *    legend, tap = fly camera there, long-press / right-click = ping (rings on both maps, 3D beacon, radio blip).
 * Kill switch: ?tacmap=0 (the v12.0.14 dot inset comes back). */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('tacmap') !== '0' && qs.get('theaters') !== '0';
  var doc = global.document;
  var E = function () { return LB.engine; }, TH = function () { return LB.theaters; };
  var COL = { bull: '#58d08f', bear: '#ff7b72', bullF: 'rgba(88,208,143,.28)', bearF: 'rgba(255,123,114,.26)', ink: 'rgba(8,12,10,.9)' };
  var FRONT_VIEW = { minX: -150, maxX: 150, minZ: -105, maxZ: 75 };
  var GRID = 50, COLS = 'ABCDEFGHJKLMN';
  var state = { open: false, view: 'world', legend: false, pings: [], beacons: [], drawn: 0, symbols: 0, lastMs: 0, insetDpr: 1 };
  var big = null, bctx = null, btn = null, raf = 0, lastBig = 0, pressT = 0, pressAt = null;

  function mySide() { try { return LB.commander.getState().profile.side === 'bear' ? 1 : -1; } catch (_) { return -1; } }
  function sideCol(s) { return s < 0 ? COL.bull : COL.bear; }
  function sideFill(s) { return s < 0 ? COL.bullF : COL.bearF; }
  function bounds(view) { var B = TH() && TH().bounds; if (view === 'front') return FRONT_VIEW; return B || { minX: -260, maxX: 260, minZ: -120, maxZ: 230 }; }
  function gridRef(x, z) {
    var B = bounds('world'), c = Math.floor((x - B.minX) / GRID), r = Math.floor((z - B.minZ) / GRID) + 1;
    var ex = Math.floor(((x - B.minX) % GRID) / 5), ez = Math.floor(((z - B.minZ) % GRID) / 5);
    return (COLS[c] || '?') + r + '-' + ex + ez;
  }

  // ---------------------------------------------------------------- symbol primitives
  function frame(c, x, y, s, own, kind, side) {
    // kind: 'land' | 'air' | 'sea' | 'inst'
    c.beginPath();
    if (kind === 'air') {
      if (own) { c.moveTo(x - s, y + s * 0.45); c.lineTo(x - s, y - s * 0.05); c.arc(x, y - s * 0.05, s, Math.PI, 0); c.lineTo(x + s, y + s * 0.45); }
      else { c.moveTo(x - s, y + s * 0.4); c.lineTo(x - s * 0.15, y - s * 0.95); c.lineTo(x + s * 0.15, y - s * 0.95); c.lineTo(x + s, y + s * 0.4); }
    } else if (kind === 'sea') {
      if (own) c.arc(x, y, s * 0.82, 0, Math.PI * 2);
      else { c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.closePath(); }
    } else {
      if (own) c.rect(x - s * 1.25, y - s * 0.8, s * 2.5, s * 1.6);
      else { c.moveTo(x, y - s * 1.1); c.lineTo(x + s * 1.1, y); c.lineTo(x, y + s * 1.1); c.lineTo(x - s * 1.1, y); c.closePath(); }
    }
    c.fillStyle = sideFill(side); c.fill();
    c.lineWidth = Math.max(1, s * 0.22); c.strokeStyle = sideCol(side); c.stroke();
  }
  function icon(c, x, y, s, own, type) {
    c.strokeStyle = sideColNow; c.fillStyle = sideColNow; c.lineWidth = Math.max(0.8, s * 0.16);
    var w = own ? s * 1.25 : s * 0.62, h = own ? s * 0.8 : s * 0.62;
    if (type === 0) { c.beginPath(); c.moveTo(x - w, y - h); c.lineTo(x + w, y + h); c.moveTo(x - w, y + h); c.lineTo(x + w, y - h); c.stroke(); }
    else if (type === 1) { c.beginPath(); c.ellipse(x, y, w * 0.62, h * 0.5, 0, 0, Math.PI * 2); c.stroke(); }
    else if (type === 2) { c.beginPath(); c.arc(x, y, s * 0.3, 0, Math.PI * 2); c.fill(); }
    else if (type === 3) { c.beginPath(); c.moveTo(x - s * 0.7, y - s * 0.35); c.lineTo(x + s * 0.7, y + s * 0.35); c.lineTo(x + s * 0.7, y - s * 0.35); c.lineTo(x - s * 0.7, y + s * 0.35); c.closePath(); c.stroke(); }
  }
  var sideColNow = '#fff';
  function echelon(c, x, y, s, n, own) {
    var top = y - (own ? s * 0.8 : s * 1.1) - s * 0.35, k = n >= 100 ? 6 : n >= 50 ? 5 : n >= 20 ? 4 : n >= 10 ? 3 : n >= 5 ? 2 : 1;
    c.fillStyle = sideColNow; c.strokeStyle = sideColNow; c.lineWidth = Math.max(0.8, s * 0.16);
    if (k <= 3) { for (var i = 0; i < k; i++) { c.beginPath(); c.arc(x + (i - (k - 1) / 2) * s * 0.42, top, s * 0.12, 0, Math.PI * 2); c.fill(); } }
    else { var m = k - 3; c.beginPath(); for (var j = 0; j < m; j++) { var xx = x + (j - (m - 1) / 2) * s * 0.36; c.moveTo(xx, top + s * 0.15); c.lineTo(xx, top - s * 0.3); } c.stroke(); }
  }
  function label(c, txt, x, y, px, col, align) {
    c.font = '600 ' + px + 'px Inter, system-ui, sans-serif'; c.textAlign = align || 'center'; c.textBaseline = 'middle';
    c.lineWidth = Math.max(2, px * 0.28); c.strokeStyle = 'rgba(5,8,7,.85)'; c.strokeText(txt, x, y); c.fillStyle = col || '#e8efe9'; c.fillText(txt, x, y);
  }

  // ---------------------------------------------------------------- map renderer
  function render(c, W, H, view, big) {
    var t0 = performance.now(), e = E(), th = TH(); if (!e || !th) return 0;
    var B = bounds(view), sx = W / (B.maxX - B.minX), sz = H / (B.maxZ - B.minZ), sc = Math.min(sx, sz);
    var X = function (x) { return (x - B.minX) * sx; }, Z = function (z) { return (z - B.minZ) * sz; };
    var own = mySide(), shore = 62, n = 0, s = big ? Math.max(5, Math.min(9, W / 110)) : Math.max(2.6, W / 46);
    // terrain: land (khaki), beach, sea
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#3b4433'; c.fillRect(0, 0, W, Math.max(0, Z(shore)));
    c.fillStyle = '#7d7457'; c.fillRect(0, Z(shore - 8), W, Z(shore) - Z(shore - 8));
    c.fillStyle = '#1b3f50'; c.fillRect(0, Z(shore), W, H - Z(shore));
    var fx0 = e.getFrontlineX();
    c.fillStyle = 'rgba(88,208,143,.10)'; c.fillRect(0, 0, X(fx0), Z(shore - 8)); c.fillStyle = 'rgba(255,123,114,.09)'; c.fillRect(X(fx0), 0, W - X(fx0), Z(shore - 8));
    // grid
    var BW = bounds('world');
    c.strokeStyle = big ? 'rgba(230,240,232,.13)' : 'rgba(230,240,232,.08)'; c.lineWidth = 1; c.beginPath();
    for (var gx = BW.minX; gx <= BW.maxX; gx += GRID) { if (gx < B.minX || gx > B.maxX) continue; c.moveTo(Math.round(X(gx)) + 0.5, 0); c.lineTo(Math.round(X(gx)) + 0.5, H); }
    for (var gz = BW.minZ; gz <= BW.maxZ; gz += GRID) { if (gz < B.minZ || gz > B.maxZ) continue; c.moveTo(0, Math.round(Z(gz)) + 0.5); c.lineTo(W, Math.round(Z(gz)) + 0.5); }
    c.stroke();
    if (big) {
      var fpx = Math.max(10, Math.round(W / 90));
      for (var ci = 0; BW.minX + ci * GRID < BW.maxX; ci++) { var cx = BW.minX + (ci + 0.5) * GRID; if (cx > B.minX && cx < B.maxX) label(c, COLS[ci] || '?', X(cx), fpx * 0.8, fpx, 'rgba(232,239,233,.7)'); }
      for (var ri = 0; BW.minZ + ri * GRID < BW.maxZ; ri++) { var rz = BW.minZ + (ri + 0.5) * GRID; if (rz > B.minZ && rz < B.maxZ) label(c, String(ri + 1), fpx * 0.7, Z(rz), fpx, 'rgba(232,239,233,.7)'); }
    }
    // FLOT (front line): line + semicircles facing the enemy of the Commander's side
    var fX = X(fx0), z0 = Z(-95), z1 = Z(shore - 8), face = own < 0 ? 1 : -1, r = big ? Math.max(4, s * 0.7) : Math.max(2, s * 0.55);
    c.strokeStyle = '#ffd36a'; c.lineWidth = big ? 2 : 1.3; c.beginPath(); c.moveTo(fX, Math.max(0, z0)); c.lineTo(fX, z1); c.stroke();
    c.beginPath(); for (var yy = Math.max(0, z0) + r; yy < z1 - r; yy += r * 3.2) { c.moveTo(fX, yy - r); c.arc(fX, yy, r, -Math.PI / 2, Math.PI / 2, face < 0); } c.stroke();
    // installations: HQs, airbases, depots, forts
    var V = th.VIEWS;
    [['bullHq', -1, 'HQ'], ['bearHq', 1, 'HQ'], ['airW', -1, 'AB'], ['airE', 1, 'AB']].forEach(function (q) {
      var v = V[q[0]]; if (!v) return; var px = X(v.x), pz = Z(v.z), ss = s * (big ? 1.15 : 1.05), o = q[1] === own;
      sideColNow = sideCol(q[1]); frame(c, px, pz, ss, o, 'inst', q[1]);
      if (q[2] === 'HQ') {   // HQ staff: down from the frame's left corner
        var hx = o ? px - ss * 1.25 : px - ss * 1.1, hy = o ? pz + ss * 0.8 : pz;
        c.strokeStyle = sideColNow; c.lineWidth = Math.max(1, ss * 0.2); c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx, pz + ss * 2.2); c.stroke();
      }
      if (big || W >= 120) label(c, q[2], px, pz, Math.max(6, ss * 0.95), '#f2f6f3');
      n++;
    });
    if (LB.lines && LB.lines.depots) LB.lines.depots().forEach(function (d) { var px = X(d.x), pz = Z(d.z), ss = s * 0.7; sideColNow = sideCol(d.side); frame(c, px, pz, ss, d.side === own, 'inst', d.side); if (big) label(c, d.hp > 0 ? 'SUP' : 'SUP✕', px, pz, Math.max(6, ss * 0.9), d.hp > 0 ? '#f2f6f3' : '#ffb4a8'); n++; });
    if (big && LB.forts && LB.forts.list) LB.forts.list().forEach(function (f) { var px = X(f.x), pz = Z(f.z); c.fillStyle = sideCol(f.side); c.beginPath(); c.moveTo(px, pz - 3); c.lineTo(px + 3, pz + 2.5); c.lineTo(px - 3, pz + 2.5); c.closePath(); c.fill(); n++; });
    // ground units, aggregated per cell → one symbol per (side, type)
    var fowOn = LB.fow && LB.fow.isActive && LB.fow.isActive();
    var cell = Math.max(8, (big ? 26 : 36) / Math.max(0.3, sc)), agg = {};
    try {
      var A = e.getArmies();
      [A.bulls, A.bears].forEach(function (arr, k) {
        var side = k ? 1 : -1;
        for (var i = 0; i < arr.length; i++) {
          var u = arr[i]; if (!u || !u.userData || u.userData.alive === false) continue;   // not .visible: LOD hides far units
          var ty = u.userData.type | 0; if (ty === 4) continue;           // fixed-wing come from the theater list
          var ux = u.position.x, uz = u.position.z; if (ux < B.minX || ux > B.maxX || uz < B.minZ || uz > B.maxZ) continue;
          if (fowOn && side !== own && !LB.fow.visible(ux, uz)) continue;
          var key = side + ':' + ty + ':' + Math.floor(ux / cell) + ':' + Math.floor(uz / cell), a = agg[key];
          if (!a) a = agg[key] = { side: side, ty: ty, n: 0, x: 0, z: 0 };
          a.n++; a.x += ux; a.z += uz;
        }
      });
    } catch (_) {}
    var keys = Object.keys(agg), gs = big ? s * 0.95 : s * 0.8;
    keys.sort(function (a, b) { return agg[a].ty - agg[b].ty; });
    for (var ki = 0; ki < keys.length; ki++) {
      var a = agg[keys[ki]], ax = X(a.x / a.n), az = Z(a.z / a.n), o = a.side === own;
      sideColNow = sideCol(a.side);
      frame(c, ax, az, gs, o, a.ty === 3 ? 'air' : 'land', a.side); icon(c, ax, az, gs, o, a.ty);
      if (big || gs >= 4) echelon(c, ax, az, gs, a.n, o);
      n++;
    }
    // ships
    var sh = th._ships();
    for (var si = 0; si < sh.length; si++) {
      var S = sh[si]; if (!S.g.visible && S.side !== own) continue;
      var px2 = X(S.x), pz2 = Z(S.z); if (px2 < -10 || px2 > W + 10 || pz2 < -10 || pz2 > H + 10) continue;
      if (S.st !== 'sail') { c.fillStyle = 'rgba(160,160,160,.6)'; c.fillRect(px2 - 1.5, pz2 - 1.5, 3, 3); continue; }
      var ss2 = gs * (S.kind === 'carrier' ? 1.5 : 1.2); sideColNow = sideCol(S.side);
      frame(c, px2, pz2, ss2, S.side === own, 'sea', S.side);
      if (big) label(c, S.kind === 'carrier' ? 'CV' : S.kind === 'battleship' ? 'BB' : 'DD', px2, pz2, Math.max(6, ss2 * 0.8), '#f2f6f3');
      else { c.fillStyle = sideColNow; c.fillRect(px2 - 0.8, pz2 - 0.8, 1.6, 1.6); }
      n++;
    }
    // aircraft (airborne) with a heading leader
    var jt = th._jets();
    for (var ji = 0; ji < jt.length; ji++) {
      var J = jt[ji]; if (!J.g.visible || J.st === 'parked' || J.st === 'dead') continue;
      var jx = X(J.x), jz = Z(J.z); if (jx < -10 || jx > W + 10 || jz < -10 || jz > H + 10) continue;
      var js = gs * 0.8, oj = J.side === own; sideColNow = sideCol(J.side);
      frame(c, jx, jz, js, oj, 'air', J.side);
      c.strokeStyle = sideColNow; c.lineWidth = 1; c.beginPath(); c.moveTo(jx, jz); c.lineTo(jx + Math.cos(J.hd) * js * 2.6, jz - Math.sin(J.hd) * js * 2.6 * (sz / sx)); c.stroke();
      n++;
    }
    // fog of war: dim unseen ground + last-known ghosts
    if (fowOn) {
      var step = big ? 10 : 4; c.fillStyle = 'rgba(4,6,10,.5)';
      for (var fy = 0; fy < H; fy += step) for (var fxp = 0; fxp < W; fxp += step) { var wx = B.minX + (fxp + step / 2) / sx, wz = B.minZ + (fy + step / 2) / sz; if (!LB.fow.visible(wx, wz)) c.fillRect(fxp, fy, step, step); }
      var gh = LB.fow.ghosts(); c.strokeStyle = 'rgba(220,220,220,.8)'; c.setLineDash([2, 2]);
      for (var gi = 0; gi < gh.length; gi++) { c.strokeRect(X(gh[gi].x) - gs, Z(gh[gi].z) - gs, gs * 2, gs * 2); }
      c.setLineDash([]);
    }
    // supply drops
    if (LB.supply && LB.supply.list) { var pl = LB.supply.list(), pr = (big ? 5 : 2.5) + (performance.now() % 1000) / (big ? 120 : 250); for (var q = 0; q < pl.length; q++) { c.strokeStyle = pl[q].color; c.lineWidth = 1.2; c.beginPath(); c.arc(X(pl[q].x), Z(pl[q].z), pr, 0, 6.283); c.stroke(); c.fillStyle = pl[q].color; c.fillRect(X(pl[q].x) - 1.5, Z(pl[q].z) - 1.5, 3, 3); } }
    // pings
    var now = performance.now();
    for (var p = 0; p < state.pings.length; p++) {
      var P = state.pings[p], age = (now - P.t) / 1000; if (age > 12) continue;
      var rr = (big ? 6 : 3) + (age % 1.2) * (big ? 14 : 6), al = Math.max(0, 1 - age / 12);
      c.strokeStyle = 'rgba(255,224,120,' + al.toFixed(2) + ')'; c.lineWidth = big ? 2 : 1.2; c.beginPath(); c.arc(X(P.x), Z(P.z), rr, 0, 6.283); c.stroke();
      c.fillStyle = 'rgba(255,224,120,' + al.toFixed(2) + ')'; c.beginPath(); c.arc(X(P.x), Z(P.z), big ? 3 : 1.6, 0, 6.283); c.fill();
      if (big) label(c, 'PING ' + P.ref, X(P.x), Z(P.z) - 14, 11, '#ffe078');
    }
    // camera: target + view wedge
    var T = e.getCameraTarget(), cp = e.camera.position, w = Math.max(big ? 8 : 4, cp.distanceTo(T) * 0.6 * sx), ang = Math.atan2((T.z - cp.z) * sz, (T.x - cp.x) * sx);
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(cp.x), Z(cp.z));
    c.lineTo(X(T.x) + Math.cos(ang + Math.PI / 2) * w, Z(T.z) + Math.sin(ang + Math.PI / 2) * w); c.lineTo(X(T.x) - Math.cos(ang + Math.PI / 2) * w, Z(T.z) - Math.sin(ang + Math.PI / 2) * w); c.closePath(); c.stroke();
    state.symbols = n; state.lastMs = +(performance.now() - t0).toFixed(2); state.drawn++;
    return n;
  }

  // ---------------------------------------------------------------- inset (called from extras.js drawInset)
  function drawInset(cv) {
    if (!enabled || !cv) return false;
    var dpr = Math.min(2, global.devicePixelRatio || 1), cssW = cv.clientWidth || 150, cssH = cv.clientHeight || 100;
    if (cv.width !== Math.round(cssW * dpr) || cv.height !== Math.round(cssH * dpr)) { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); }
    state.insetDpr = dpr;
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { render(c, cssW, cssH, 'world', false); } catch (err) { if (!drawInset._w) { drawInset._w = 1; console.warn('[tacmap]', err); } return false; }
    ensureButton(); return true;
  }

  // ---------------------------------------------------------------- expanded map
  function buildBig() {
    if (big) return;
    var wrap = doc.createElement('div'); wrap.id = 'tacMap'; wrap.className = 'tac-map'; wrap.hidden = true;
    wrap.innerHTML = '<div class="tac-head"><b>TACTICAL MAP</b> <span class="qual sim">POSITIONS SIMULATED</span> <span class="tac-flot" id="tacFlot"></span>' +
      '<span class="tac-sp"></span><div class="tac-seg"><button type="button" data-tv="world" class="on">World</button><button type="button" data-tv="front">Front</button></div>' +
      '<button type="button" data-tm="legend" title="Legend">?</button><button type="button" data-tm="sheet" title="Map sheet (theaters, war systems)">☰</button><button type="button" data-tm="close" title="Close (Esc)">✕</button></div>' +
      '<div class="tac-body"><canvas id="tacCanvas"></canvas><div class="tac-legend" hidden>' +
      '<div><i class="lg rect"></i>Own forces (rectangle) · <i class="lg dia"></i>Enemy (diamond)</div>' +
      '<div>✕ infantry · ⬭ armor · ● artillery · ⋈ helicopter · ⌒ air track (line = heading) · ○ CV/BB/DD ships</div>' +
      '<div>• •• ••• | || ||| unit-count echelon (on-screen units, not real strength) · HQ / AB / SUP installations</div>' +
      '<div><span style="color:#ffd36a">◗◗ FLOT</span>: the front line set by the market price · rings: supply drops / pings</div>' +
      '<div>Tap / click: fly the camera there · long-press / right-click: drop a ping · N: open/close · Esc: close</div></div>' +
      '<div class="tac-foot" id="tacFoot"></div></div>';
    doc.body.appendChild(wrap); big = wrap;
    if (global.innerWidth < 760) { state.view = 'front'; wrap.querySelectorAll('[data-tv]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-tv') === 'front'); }); }   // phones: denser default
    var cv = wrap.querySelector('#tacCanvas'); bctx = cv.getContext('2d');
    wrap.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var tv = b.getAttribute('data-tv'), tm = b.getAttribute('data-tm');
      if (tv) { state.view = tv; wrap.querySelectorAll('[data-tv]').forEach(function (x) { x.classList.toggle('on', x === b); }); drawBig(true); }
      else if (tm === 'close') setOpen(false);
      else if (tm === 'legend') { state.legend = !state.legend; wrap.querySelector('.tac-legend').hidden = !state.legend; }
      else if (tm === 'sheet') { setOpen(false); if (LB.dock && LB.dock.open) LB.dock.open('map'); }
    });
    function worldAt(ev) {
      var r = cv.getBoundingClientRect(), B = bounds(state.view);
      return { x: B.minX + (ev.clientX - r.left) / r.width * (B.maxX - B.minX), z: B.minZ + (ev.clientY - r.top) / r.height * (B.maxZ - B.minZ) };
    }
    cv.addEventListener('contextmenu', function (ev) { ev.preventDefault(); var w = worldAt(ev); ping(w.x, w.z); });
    cv.addEventListener('pointerdown', function (ev) {
      if (ev.button === 2) return;
      pressAt = { x: ev.clientX, y: ev.clientY, w: worldAt(ev) }; clearTimeout(pressT);
      pressT = setTimeout(function () { if (pressAt) { ping(pressAt.w.x, pressAt.w.z); pressAt = null; } }, 520);
    });
    cv.addEventListener('pointermove', function (ev) { if (pressAt && Math.hypot(ev.clientX - pressAt.x, ev.clientY - pressAt.y) > 10) { clearTimeout(pressT); pressAt = null; } });
    cv.addEventListener('pointerup', function (ev) {
      if (!pressAt) return; clearTimeout(pressT); var w = pressAt.w; pressAt = null;
      flyTo(w.x, w.z);
    });
    cv.addEventListener('pointercancel', function () { clearTimeout(pressT); pressAt = null; });
  }
  function flyTo(x, z) {
    var th = TH(); if (th && th.flyToPoint) th.flyToPoint(x, z, z > 70 ? 110 : 70);
    else { var e = E(); if (e && e.controls) { e.controls.target.set(x, 0.5, z); e.controls.update(); } }
    if (global.innerWidth < 760) setOpen(false);   // phones: show the spot right away
  }
  function ping(x, z) {
    var ref = gridRef(x, z);
    state.pings.push({ x: x, z: z, t: performance.now(), ref: ref }); if (state.pings.length > 6) state.pings.shift();
    beacon(x, z);
    try { if (LB.sfx && LB.sfx.blip) LB.sfx.blip(mySide()); } catch (_) {}
    var f = doc.getElementById('tacFoot'); if (f) f.textContent = 'Ping at ' + ref + ' (game marker only)';
    drawBig(true);
  }
  function beacon(x, z) {
    var e = E(); if (!e || !e.THREE || !e.scene) return;
    var T = e.THREE, y0 = 0; try { y0 = e.terrainHeight ? e.terrainHeight(x, z) : 0; } catch (_) {}
    if (TH() && TH().isWater && TH().isWater(x, z)) y0 = -0.3;
    var m = new T.MeshBasicMaterial({ color: 0xffe078, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false });
    var g = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 40, 8, 1, true), m); g.position.set(x, y0 + 20, z); g.name = 'tac-beacon';
    var ring = new T.Mesh(new T.RingGeometry(1.6, 2.2, 32), m.clone()); ring.rotation.x = -Math.PI / 2; ring.position.set(x, y0 + 0.25, z); ring.name = 'tac-beacon-ring';
    e.scene.add(g); e.scene.add(ring);
    state.beacons.push({ g: g, ring: ring, t: performance.now() });
    while (state.beacons.length > 4) dropBeacon(state.beacons.shift());
  }
  function dropBeacon(b) { [b.g, b.ring].forEach(function (o) { if (o.parent) o.parent.remove(o); o.geometry.dispose(); o.material.dispose(); }); }
  function tickBeacons() {
    var now = performance.now();
    for (var i = state.beacons.length - 1; i >= 0; i--) {
      var b = state.beacons[i], age = (now - b.t) / 1000;
      if (age > 12) { dropBeacon(b); state.beacons.splice(i, 1); continue; }
      var k = Math.max(0, 1 - age / 12); b.g.material.opacity = 0.55 * k; b.ring.material.opacity = 0.7 * k * (0.6 + 0.4 * Math.sin(age * 5));
      var s = 1 + (age % 1.2) * 1.5; b.ring.scale.set(s, s, 1);
    }
  }
  function drawBig(force) {
    if (!big || big.hidden) return;
    var now = performance.now(); if (!force && now - lastBig < 120) return; lastBig = now;
    var cv = bctx.canvas, body = cv.parentNode, dpr = Math.min(2, global.devicePixelRatio || 1);
    var B = bounds(state.view), aspect = (B.maxX - B.minX) / (B.maxZ - B.minZ);
    var aw = body.clientWidth, ah = body.clientHeight - 4, w = aw, h = w / aspect; if (h > ah) { h = ah; w = h * aspect; }
    w = Math.max(100, Math.floor(w)); h = Math.max(70, Math.floor(h));
    if (cv.style.width !== w + 'px') { cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { render(bctx, w, h, state.view, true); } catch (err) { console.warn('[tacmap] big', err); }
    var f = doc.getElementById('tacFlot');
    if (f) { var live = false; try { live = E().isPriceLive(); } catch (_) {} f.innerHTML = 'FLOT ← price <span class="qual ' + (live ? 'live' : 'est') + '">' + (live ? 'LIVE' : 'NOT LIVE') + '</span>'; }
  }
  function loop() { raf = 0; if (!state.open) return; drawBig(false); tickBeacons(); raf = global.requestAnimationFrame(loop); }
  function setOpen(v) {
    if (!enabled) return false;
    buildBig(); state.open = !!v; big.hidden = !state.open; doc.body.classList.toggle('tac-open', state.open);
    if (state.open) { drawBig(true); if (!raf) raf = global.requestAnimationFrame(loop); }
    return state.open;
  }
  function ensureButton() {
    if (btn || !enabled) return;
    btn = doc.createElement('button'); btn.type = 'button'; btn.id = 'tacExpand'; btn.className = 'tac-expand'; btn.title = 'Tactical map (N)'; btn.setAttribute('aria-label', 'Open tactical map');
    btn.textContent = '⤢';
    btn.addEventListener('click', function (ev) { ev.stopPropagation(); setOpen(!state.open); });
    doc.body.appendChild(btn);
    var inset = doc.getElementById('worldInset'); if (inset) { var sync = function () { btn.hidden = inset.hidden; }; sync(); new MutationObserver(sync).observe(inset, { attributes: true, attributeFilter: ['hidden'] }); }
    // Map sheet entry
    var host = doc.querySelector('#sheet-map .sheet-body');
    if (host && !doc.getElementById('tacOpenBtn')) { var b2 = doc.createElement('button'); b2.type = 'button'; b2.id = 'tacOpenBtn'; b2.className = 'tac-open-btn'; b2.textContent = '⤢ Open tactical map (N)'; b2.addEventListener('click', function () { if (LB.dock && LB.dock.open) LB.dock.open(null); setOpen(true); }); host.insertBefore(b2, host.firstChild); }
  }
  if (enabled) {
    global.addEventListener('keydown', function (e) {
      if (e.target && (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyN') { setOpen(!state.open); }
      else if (e.code === 'Escape' && state.open) { setOpen(false); e.stopImmediatePropagation(); }
    }, true);
    // keep beacons fading even with the map closed
    setInterval(function () { if (!state.open && state.beacons.length) tickBeacons(); }, 100);
  }

  LB.tacmap = {
    version: 'v12.0.16', isEnabled: function () { return enabled; },
    drawInset: drawInset, open: function () { return setOpen(true); }, close: function () { return setOpen(false); }, toggle: function () { return setOpen(!state.open); },
    setView: function (v) { state.view = v === 'front' ? 'front' : 'world'; drawBig(true); return state.view; },
    ping: ping, gridRef: gridRef, render: render,
    getState: function () { return { enabled: enabled, open: state.open, view: state.view, symbols: state.symbols, drawn: state.drawn, ms: state.lastMs, pings: state.pings.length, beacons: state.beacons.length, insetDpr: state.insetDpr, side: mySide() }; }
  };
})(window);
