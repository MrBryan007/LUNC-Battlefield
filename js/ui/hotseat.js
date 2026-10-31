/* LUNC Battlefield v12.0.31 — v12.2 Multiplayer, part 1: hot-seat (two commanders, one device). Game layer only.
 * v12.0.35 part 2: player names, side choice (Swap sides), each player keeps their own ORDERS (commander.useMission),
 * tie-break on orders completed then hits, and a match history (last 5) saved on this device.
 *
 * Player 1 commands the Bulls, Player 2 the Bears. Turns of 60 / 90 / 120 s for 2 / 3 / 5 rounds. During a turn the
 * Commander layer runs for that player's side (commander.setSide, not saved), with that player's own Commander session
 * (score, combo, Moon Shot / nuke charge) and strike cooldowns (commander.useSession), their own camera, and the fog of
 * war follows the active side (every system reads the Commander side live). At the end of a turn the battle pauses and
 * an opaque pass-the-device screen hides the field until the next player taps Ready. After the last round a results
 * screen names the winner by game score. Exit (or leaving the page) restores your own side and session.
 * Never touches market data, armies, the price-driven front or data-truth labels: scores are game points.
 * Setup card in the Cmd sheet; ?hotseat=1 opens a match at load; ?hotseat=0 turns the feature off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs; try { qs = new URLSearchParams(global.location.search); } catch (_) { qs = { get: function () { return null; } }; }
  var enabled = qs.get('hotseat') !== '0' && qs.get('commander') !== '0';
  var NAMES = { bull: 'BULLS', bear: 'BEARS' }, TURNS = [60, 90, 120], ROUNDS = [2, 3, 5];
  var KEY = 'luncBattle.hotseat', saved = loadS();
  var cfg = { turn: TURNS.indexOf(saved.turn) >= 0 ? saved.turn : 90, rounds: ROUNDS.indexOf(saved.rounds) >= 0 ? saved.rounds : 3, names: [clean(saved.names && saved.names[0], 1), clean(saved.names && saved.names[1], 2)], swap: !!saved.swap };
  var hist = Array.isArray(saved.history) ? saved.history.slice(0, 5) : [];
  var st = null, el = {}, last = 0, ready = false;
  // v12.0.35: player names, side choice and match history, saved on this device only
  function loadS() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } }
  function saveS() { try { localStorage.setItem(KEY, JSON.stringify({ names: cfg.names, swap: cfg.swap, turn: cfg.turn, rounds: cfg.rounds, history: hist })); } catch (_) {} }
  function clean(v, n) { v = String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16); return v || 'Player ' + n; }
  // local date/time for the match history (device clock, not UTC)
  function stamp() { var d = new Date(), z = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); }
  function who(P) { return P.name + ' · ' + NAMES[P.side]; }
  function C() { return LB.commander; }
  function E() { return LB.engine; }
  function fmt(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function camGet() { var e = E(); return { p: e.camera.position.clone(), t: e.controls ? e.controls.target.clone() : null }; }
  function camSet(c) { var e = E(); if (!c) return; e.camera.position.copy(c.p); if (c.t && e.controls) { e.controls.target.copy(c.t); if (e.controls.update) e.controls.update(); } }
  function sfx(k) { if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui(k); } catch (_) {} }
  function radio(text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: 0, type: 'hq', text: text }); } catch (_) {} }
  function pstats(P) { var s = P.sess.session || {}; return { score: s.score || 0, hits: s.hits || 0, strikes: s.strikes || 0, missions: s.missionsDone || 0 }; }

  // ---------------------------------------------------------------- match flow
  function start(o) {
    if (!enabled || !C() || !C().setSide || !E()) return false;
    o = o || {}; if (TURNS.indexOf(+o.turn) >= 0) cfg.turn = +o.turn; if (ROUNDS.indexOf(+o.rounds) >= 0) cfg.rounds = +o.rounds;
    if (o.names && o.names.length) cfg.names = [clean(o.names[0], 1), clean(o.names[1], 2)];
    if (o.swap != null) cfg.swap = !!o.swap;
    readNames(); saveS();
    if (st) stop(true);
    var cs = C().getState(); if (!cs.started && C().deploy) C().deploy();
    st = { orig: C().getState().profile.side, origSess: null, cur: 0, round: 1, t: cfg.turn, phase: 'handoff', turn: cfg.turn, rounds: cfg.rounds, turnsPlayed: 0,
      origMis: undefined,
      players: [{ n: 1, name: cfg.names[0], side: cfg.swap ? 'bear' : 'bull', sess: C().freshSession(), cam: null, mis: null },
        { n: 2, name: cfg.names[1], side: cfg.swap ? 'bull' : 'bear', sess: C().freshSession(), cam: null, mis: null }] };
    doc.body.classList.add('hs-on'); radio('HQ: "Hot-seat match, ' + st.rounds + ' rounds of ' + st.turn + ' s. ' + who(st.players[0]) + ' commands first." (game mode)');
    handoff(); return true;
  }
  function handoff() {
    st.phase = 'handoff'; try { E().setPaused(true); } catch (_) {}
    var P = st.players[st.cur];
    var Q = st.players[1 - st.cur], mis = P.mis ? ' Your orders: ' + esc(P.mis.text) + ' (' + Math.min(P.mis.got, P.mis.n) + '/' + P.mis.n + ', ' + Math.max(0, Math.ceil(P.mis.left)) + ' s left).' : ' Fresh orders on your first turn.';
    cover('<div class="hs-kicker">PASS THE DEVICE</div><h2 class="hs-' + P.side + '">' + esc(P.name) + ' · ' + NAMES[P.side] + ' COMMANDER</h2>' +
      '<div class="hs-sub">Round ' + st.round + ' of ' + st.rounds + ' · ' + st.turn + ' s turn. ' + esc(Q.name) + ', look away.' + mis + '</div>' + board() +
      '<div class="hs-btns"><button type="button" class="hs-go" data-hs="ready">Ready · start my turn</button><button type="button" data-hs="stop">End match</button></div>');
    sfx('arm'); renderChip();
  }
  function beginTurn() {
    if (!st) return; var P = st.players[st.cur];
    C().setSide(P.side, false);
    var old = C().useSession(P.sess.session, P.sess.cds); if (!st.origSess) st.origSess = old;
    if (C().useMission) { var om = C().useMission(P.mis); if (st.origMis === undefined) st.origMis = om; P.mis = C().getState().mission; }   // v12.0.35 own orders
    if (P.cam) camSet(P.cam);
    st.phase = 'play'; st.t = st.turn; last = performance.now();
    hideCover(); try { E().setPaused(false); } catch (_) {}
    radio('HQ: "' + P.name + ', ' + NAMES[P.side] + ' command is yours. ' + st.turn + ' seconds." (game mode)');
    renderChip();
  }
  function endTurn() {
    if (!st || st.phase !== 'play') return false;
    var P = st.players[st.cur], cs = C().getState(); P.cam = camGet(); P.sess = { session: cs.session, cds: cs.cds }; P.mis = cs.mission || null; st.turnsPlayed++;
    if (st.cur === 1) st.round++;
    st.cur = 1 - st.cur;
    if (st.round > st.rounds) finish(); else handoff();
    return true;
  }
  function finish() {
    st.phase = 'done'; try { E().setPaused(true); } catch (_) {}
    var a = pstats(st.players[0]), b = pstats(st.players[1]);
    // score decides; a tie goes to missions completed, then hits (v12.0.35)
    var cmp = (a.score - b.score) || (a.missions - b.missions) || (a.hits - b.hits);
    st.winner = cmp === 0 ? 0 : cmp > 0 ? 1 : 2; st.tieBreak = a.score === b.score && cmp !== 0 ? (a.missions !== b.missions ? 'orders completed' : 'hits') : '';
    var W = st.winner ? st.players[st.winner - 1] : null;
    var w = W ? esc(W.name).toUpperCase() + ' · ' + NAMES[W.side] + ' WIN' : 'DRAW';
    hist.unshift({ at: stamp(), rounds: st.rounds, turn: st.turn, winner: st.winner, tie: st.tieBreak,
      p: st.players.map(function (P) { var s2 = pstats(P); return { name: P.name, side: P.side, score: s2.score, missions: s2.missions }; }) });
    hist = hist.slice(0, 5); saveS();
    cover('<div class="hs-kicker">MATCH OVER · ' + st.rounds + ' ROUNDS</div><h2' + (W ? ' class="hs-' + W.side + '"' : '') + '>' + w + '</h2>' + (st.tieBreak ? '<div class="hs-sub">Level on score, decided on ' + st.tieBreak + '.</div>' : '') + board() +
      '<div class="hs-sub">Game points only. The market front and data were never changed by either player.</div>' +
      '<div class="hs-btns"><button type="button" class="hs-go" data-hs="again">Play again</button><button type="button" data-hs="stop">Exit</button></div>');
    sfx('arm'); renderChip();
  }
  function stop(silent) {
    if (!st) return false;
    try { if (st.origSess) C().useSession(st.origSess.session, st.origSess.cds); if (st.origMis !== undefined && C().useMission) C().useMission(st.origMis); C().setSide(st.orig, true); } catch (_) {}
    st = null; hideCover(); doc.body.classList.remove('hs-on'); renderChip();
    try { E().setPaused(false); } catch (_) {}
    if (!silent) radio('HQ: "Hot-seat match closed. Back to single command." (game mode)');
    return true;
  }
  function tick() {
    if (!st || st.phase !== 'play') return;
    var now = performance.now(), dt = Math.min(1, (now - last) / 1000); last = now;
    var e = E(); if (e.isPaused && e.isPaused()) return;
    st.t -= dt; if (st.t <= 0) { st.t = 0; endTurn(); return; }
    renderChip();
  }

  // ---------------------------------------------------------------- UI
  function board() {
    var rows = st.players.map(function (P, i) { var s = pstats(P), on = st.phase !== 'done' && i === st.cur; return '<tr class="' + (on ? 'on' : '') + '"><td class="hs-' + P.side + '">' + esc(P.name) + ' · ' + NAMES[P.side] + '</td><td><b>' + s.score.toLocaleString() + '</b></td><td>' + s.missions + '</td><td>' + s.hits + '</td><td>' + s.strikes + '</td></tr>'; }).join('');
    return '<table class="hs-board"><thead><tr><th>Commander</th><th>Score</th><th>Orders</th><th>Hits</th><th>Strikes</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function cover(html) {
    if (!el.cover) {
      el.cover = doc.createElement('div'); el.cover.id = 'hsCover'; el.cover.className = 'hs-cover'; el.cover.setAttribute('role', 'dialog'); el.cover.setAttribute('aria-modal', 'true');
      el.cover.addEventListener('click', function (ev) { var b = ev.target.closest('[data-hs]'); if (!b) return; var k = b.getAttribute('data-hs'); if (k === 'ready') beginTurn(); else if (k === 'stop') stop(); else if (k === 'again') start(cfg); });
      doc.body.appendChild(el.cover);
    }
    el.cover.innerHTML = '<div class="hs-card">' + html + '</div>'; el.cover.hidden = false;
  }
  function hideCover() { if (el.cover) el.cover.hidden = true; }
  function renderChip() {
    if (!el.chip) {
      el.chip = doc.createElement('div'); el.chip.id = 'hsChip'; el.chip.className = 'hs-chip';
      el.chip.innerHTML = '<span id="hsWho"></span><b id="hsTime"></b><span id="hsRound"></span><button type="button" id="hsEnd">End turn</button>';
      el.chip.querySelector('#hsEnd').addEventListener('click', function (ev) { ev.stopPropagation(); endTurn(); });
      doc.body.appendChild(el.chip);
    }
    var on = !!(st && st.phase === 'play'); el.chip.hidden = !on; if (!on) return renderPanel();
    var P = st.players[st.cur];
    el.chip.className = 'hs-chip hs-' + P.side + (st.t <= 10 ? ' hs-low' : '');
    el.chip.querySelector('#hsWho').textContent = P.name + ' · ' + NAMES[P.side];
    el.chip.querySelector('#hsTime').textContent = fmt(st.t);
    el.chip.querySelector('#hsRound').textContent = 'R' + st.round + '/' + st.rounds;
    renderPanel();
  }
  function buildPanel() {
    var p = doc.createElement('div'); p.id = 'hsPanel'; p.className = 'hs-panel';
    p.innerHTML = '<div class="th-title">HOT-SEAT · 2 PLAYERS <span class="qual sim">GAME MODE</span></div>' +
      '<div class="hs-row"><small>Turn</small>' + TURNS.map(function (t) { return '<button type="button" data-turn="' + t + '">' + t + ' s</button>'; }).join('') + '</div>' +
      '<div class="hs-row"><small>Rounds</small>' + ROUNDS.map(function (r) { return '<button type="button" data-rounds="' + r + '">' + r + '</button>'; }).join('') + '</div>' +
      '<div class="hs-row hs-names"><small>Players</small><input id="hsN1" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Player 1 name"><b id="hsS1" class="hs-side"></b>' +
        '<input id="hsN2" maxlength="16" autocomplete="off" spellcheck="false" aria-label="Player 2 name"><b id="hsS2" class="hs-side"></b><button type="button" id="hsSwap" title="Swap which side each player commands">⇄ Swap sides</button></div>' +
      '<div class="hs-row"><button type="button" class="hs-go" id="hsStart">Start match</button><span id="hsStatus" class="th-note"></span></div>' +
      '<div class="th-note">Pass one device between two commanders. Player 1 moves first. Each gets their own score, orders, cooldowns, camera and fog of war. Game points only, never market data.</div>' +
      '<div class="hs-hist" id="hsHist"></div>';
    p.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.id === 'hsStart') { if (st) stop(); else { if (LB.dock && LB.dock.open) try { LB.dock.open(null); } catch (_) {} start(cfg); } return; }
      if (b.id === 'hsSwap') { if (!st) { cfg.swap = !cfg.swap; saveS(); } renderPanel(); return; }
      if (b.id === 'hsClear') { hist = []; saveS(); renderPanel(); return; }
      if (b.hasAttribute('data-turn')) cfg.turn = +b.getAttribute('data-turn');
      if (b.hasAttribute('data-rounds')) cfg.rounds = +b.getAttribute('data-rounds');
      renderPanel();
    });
    ['hsN1', 'hsN2'].forEach(function (id, i) {
      var inp = p.querySelector('#' + id); inp.value = cfg.names[i];
      inp.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') inp.blur(); });   // typing never triggers game hotkeys
      inp.addEventListener('keyup', function (ev) { ev.stopPropagation(); });
      inp.addEventListener('change', function () { readNames(); saveS(); inp.value = cfg.names[i]; });
    });
    el.p = p; placePanel(); renderPanel();
  }
  function placePanel() {
    if (!el.p || el.p.parentNode) return;
    var host = doc.querySelector('.sheet-command .sheet-body') || doc.querySelector('#sheet-command .sheet-body');
    if (host) host.insertBefore(el.p, host.firstChild);
  }
  function renderPanel() {
    if (!el.p) return; placePanel();
    el.p.querySelectorAll('[data-turn]').forEach(function (b) { b.classList.toggle('active', +b.getAttribute('data-turn') === cfg.turn); b.disabled = !!st; });
    el.p.querySelectorAll('[data-rounds]').forEach(function (b) { b.classList.toggle('active', +b.getAttribute('data-rounds') === cfg.rounds); b.disabled = !!st; });
    var sb = el.p.querySelector('#hsStart'); sb.textContent = st ? 'End match' : 'Start match';
    var s1 = el.p.querySelector('#hsS1'), s2 = el.p.querySelector('#hsS2'), a1 = cfg.swap ? 'bear' : 'bull', a2 = cfg.swap ? 'bull' : 'bear';
    s1.textContent = NAMES[a1]; s1.className = 'hs-side hs-' + a1; s2.textContent = NAMES[a2]; s2.className = 'hs-side hs-' + a2;
    el.p.querySelector('#hsSwap').disabled = !!st; el.p.querySelector('#hsN1').disabled = !!st; el.p.querySelector('#hsN2').disabled = !!st;
    var hh = el.p.querySelector('#hsHist');
    hh.innerHTML = hist.length ? '<small>RECENT MATCHES (this device)</small>' + hist.map(function (m) {
      var p0 = m.p[0], p1 = m.p[1], win = m.winner ? m.p[m.winner - 1].name : 'Draw';
      return '<div class="hs-h"><span>' + esc(m.at.slice(5)) + '</span><span class="hs-' + p0.side + '">' + esc(p0.name) + ' ' + p0.score.toLocaleString() + '</span><span>vs</span><span class="hs-' + p1.side + '">' + esc(p1.name) + ' ' + p1.score.toLocaleString() + '</span><b>' + (m.winner ? '🏆 ' : '') + esc(win) + (m.tie ? ' (' + esc(m.tie) + ')' : '') + '</b></div>';
    }).join('') + '<button type="button" id="hsClear">Clear</button>' : '';
    el.p.querySelector('#hsStatus').textContent = st ? (st.phase === 'done' ? 'Match over' : 'Round ' + Math.min(st.round, st.rounds) + '/' + st.rounds + ' · P' + st.players[st.cur].n + (st.phase === 'play' ? ' playing' : ' up next')) : '';
  }

  function readNames() {
    if (!el.p) return; var a = el.p.querySelector('#hsN1'), b = el.p.querySelector('#hsN2'); if (!a || !b) return;
    cfg.names = [clean(a.value, 1), clean(b.value, 2)];
  }
  function boot() {
    if (!enabled) { LB.hotseat = { isEnabled: function () { return false; }, getState: function () { return { enabled: false }; } }; return; }
    var tries = 0, iv = setInterval(function () {
      var c = C(), e = E();
      if (c && c.setSide && e && e.scene && doc.body) {
        clearInterval(iv); ready = true; buildPanel(); renderChip(); setInterval(tick, 250);
        setInterval(placePanel, 2000);
        if (qs.get('hotseat') === '1') setTimeout(function () { start(cfg); }, 1500);
      } else if (++tries > 600) clearInterval(iv);
    }, 250);
    global.addEventListener('pagehide', function () { if (st) try { C().setSide(st.orig, true); } catch (_) {} });
  }

  LB.hotseat = {
    isEnabled: function () { return enabled && ready; },
    start: start, endTurn: endTurn, history: function () { return hist.slice(); }, clearHistory: function () { hist = []; saveS(); renderPanel(); return true; }, stop: function () { return stop(); }, ready: function () { if (st && st.phase === 'handoff') { beginTurn(); return true; } return false; },
    getState: function () {
      if (!st) return { enabled: enabled, active: false, cfg: Object.assign({}, cfg) };
      return { enabled: enabled, active: true, phase: st.phase, cur: st.cur, side: st.players[st.cur].side, round: st.round, rounds: st.rounds, turn: st.turn, t: +st.t.toFixed(1), winner: st.winner || 0, turnsPlayed: st.turnsPlayed,
        tieBreak: st.tieBreak || '',
        players: st.players.map(function (P) { var s = pstats(P); return { n: P.n, name: P.name, side: P.side, score: s.score, hits: s.hits, strikes: s.strikes, missions: s.missions, mission: P.mis ? { id: P.mis.id, got: P.mis.got, n: P.mis.n, left: +P.mis.left.toFixed(1) } : null, hasCam: !!P.cam }; }) };
    },
    _t: function (t) { if (st) st.t = t; return true; }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
