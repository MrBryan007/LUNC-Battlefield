/* LUNC Battlefield v12.0.31 — v12.2 Multiplayer, part 1: hot-seat (two commanders, one device). Game layer only.
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
  var cfg = { turn: 90, rounds: 3 }, st = null, el = {}, last = 0, ready = false;
  function C() { return LB.commander; }
  function E() { return LB.engine; }
  function fmt(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function camGet() { var e = E(); return { p: e.camera.position.clone(), t: e.controls ? e.controls.target.clone() : null }; }
  function camSet(c) { var e = E(); if (!c) return; e.camera.position.copy(c.p); if (c.t && e.controls) { e.controls.target.copy(c.t); if (e.controls.update) e.controls.update(); } }
  function sfx(k) { if (LB.sfx && LB.sfx.ui) try { LB.sfx.ui(k); } catch (_) {} }
  function radio(text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: 0, type: 'hq', text: text }); } catch (_) {} }
  function pstats(P) { var s = P.sess.session || {}; return { score: s.score || 0, hits: s.hits || 0, strikes: s.strikes || 0 }; }

  // ---------------------------------------------------------------- match flow
  function start(o) {
    if (!enabled || !C() || !C().setSide || !E()) return false;
    o = o || {}; if (TURNS.indexOf(+o.turn) >= 0) cfg.turn = +o.turn; if (ROUNDS.indexOf(+o.rounds) >= 0) cfg.rounds = +o.rounds;
    if (st) stop(true);
    var cs = C().getState(); if (!cs.started && C().deploy) C().deploy();
    st = { orig: C().getState().profile.side, origSess: null, cur: 0, round: 1, t: cfg.turn, phase: 'handoff', turn: cfg.turn, rounds: cfg.rounds, turnsPlayed: 0,
      players: [{ n: 1, side: 'bull', sess: C().freshSession(), cam: null }, { n: 2, side: 'bear', sess: C().freshSession(), cam: null }] };
    doc.body.classList.add('hs-on'); radio('HQ: "Hot-seat match, ' + st.rounds + ' rounds of ' + st.turn + ' s. Bulls command first." (game mode)');
    handoff(); return true;
  }
  function handoff() {
    st.phase = 'handoff'; try { E().setPaused(true); } catch (_) {}
    var P = st.players[st.cur];
    cover('<div class="hs-kicker">PASS THE DEVICE</div><h2 class="hs-' + P.side + '">Player ' + P.n + ' · ' + NAMES[P.side] + ' COMMANDER</h2>' +
      '<div class="hs-sub">Round ' + st.round + ' of ' + st.rounds + ' · ' + st.turn + ' s turn. Player ' + (3 - P.n) + ', look away.</div>' + board() +
      '<div class="hs-btns"><button type="button" class="hs-go" data-hs="ready">Ready · start my turn</button><button type="button" data-hs="stop">End match</button></div>');
    sfx('arm'); renderChip();
  }
  function beginTurn() {
    if (!st) return; var P = st.players[st.cur];
    C().setSide(P.side, false);
    var old = C().useSession(P.sess.session, P.sess.cds); if (!st.origSess) st.origSess = old;
    if (P.cam) camSet(P.cam);
    st.phase = 'play'; st.t = st.turn; last = performance.now();
    hideCover(); try { E().setPaused(false); } catch (_) {}
    radio('HQ: "Player ' + P.n + ', ' + NAMES[P.side] + ' command is yours. ' + st.turn + ' seconds." (game mode)');
    renderChip();
  }
  function endTurn() {
    if (!st || st.phase !== 'play') return false;
    var P = st.players[st.cur], cs = C().getState(); P.cam = camGet(); P.sess = { session: cs.session, cds: cs.cds }; st.turnsPlayed++;
    if (st.cur === 1) st.round++;
    st.cur = 1 - st.cur;
    if (st.round > st.rounds) finish(); else handoff();
    return true;
  }
  function finish() {
    st.phase = 'done'; try { E().setPaused(true); } catch (_) {}
    var a = pstats(st.players[0]), b = pstats(st.players[1]);
    var w = a.score === b.score ? 'DRAW' : a.score > b.score ? 'PLAYER 1 · BULLS WIN' : 'PLAYER 2 · BEARS WIN';
    st.winner = a.score === b.score ? 0 : a.score > b.score ? 1 : 2;
    cover('<div class="hs-kicker">MATCH OVER · ' + st.rounds + ' ROUNDS</div><h2>' + w + '</h2>' + board() +
      '<div class="hs-sub">Game points only. The market front and data were never changed by either player.</div>' +
      '<div class="hs-btns"><button type="button" class="hs-go" data-hs="again">Play again</button><button type="button" data-hs="stop">Exit</button></div>');
    sfx('arm'); renderChip();
  }
  function stop(silent) {
    if (!st) return false;
    try { if (st.origSess) C().useSession(st.origSess.session, st.origSess.cds); C().setSide(st.orig, true); } catch (_) {}
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
    var rows = st.players.map(function (P, i) { var s = pstats(P), on = st.phase !== 'done' && i === st.cur; return '<tr class="' + (on ? 'on' : '') + '"><td class="hs-' + P.side + '">P' + P.n + ' · ' + NAMES[P.side] + '</td><td><b>' + s.score.toLocaleString() + '</b></td><td>' + s.hits + '</td><td>' + s.strikes + '</td></tr>'; }).join('');
    return '<table class="hs-board"><thead><tr><th>Commander</th><th>Score</th><th>Hits</th><th>Strikes</th></tr></thead><tbody>' + rows + '</tbody></table>';
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
    el.chip.querySelector('#hsWho').textContent = 'P' + P.n + ' · ' + NAMES[P.side];
    el.chip.querySelector('#hsTime').textContent = fmt(st.t);
    el.chip.querySelector('#hsRound').textContent = 'R' + st.round + '/' + st.rounds;
    renderPanel();
  }
  function buildPanel() {
    var p = doc.createElement('div'); p.id = 'hsPanel'; p.className = 'hs-panel';
    p.innerHTML = '<div class="th-title">HOT-SEAT · 2 PLAYERS <span class="qual sim">GAME MODE</span></div>' +
      '<div class="hs-row"><small>Turn</small>' + TURNS.map(function (t) { return '<button type="button" data-turn="' + t + '">' + t + ' s</button>'; }).join('') + '</div>' +
      '<div class="hs-row"><small>Rounds</small>' + ROUNDS.map(function (r) { return '<button type="button" data-rounds="' + r + '">' + r + '</button>'; }).join('') + '</div>' +
      '<div class="hs-row"><button type="button" class="hs-go" id="hsStart">Start match</button><span id="hsStatus" class="th-note"></span></div>' +
      '<div class="th-note">Pass one device between two commanders: Player 1 has the Bulls, Player 2 the Bears. Each gets their own score, cooldowns, camera and fog of war. Game points only, never market data.</div>';
    p.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      if (b.id === 'hsStart') { if (st) stop(); else { if (LB.dock && LB.dock.open) try { LB.dock.open(null); } catch (_) {} start(cfg); } return; }
      if (b.hasAttribute('data-turn')) cfg.turn = +b.getAttribute('data-turn');
      if (b.hasAttribute('data-rounds')) cfg.rounds = +b.getAttribute('data-rounds');
      renderPanel();
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
    el.p.querySelector('#hsStatus').textContent = st ? (st.phase === 'done' ? 'Match over' : 'Round ' + Math.min(st.round, st.rounds) + '/' + st.rounds + ' · P' + st.players[st.cur].n + (st.phase === 'play' ? ' playing' : ' up next')) : '';
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
    start: start, endTurn: endTurn, stop: function () { return stop(); }, ready: function () { if (st && st.phase === 'handoff') { beginTurn(); return true; } return false; },
    getState: function () {
      if (!st) return { enabled: enabled, active: false, cfg: Object.assign({}, cfg) };
      return { enabled: enabled, active: true, phase: st.phase, cur: st.cur, side: st.players[st.cur].side, round: st.round, rounds: st.rounds, turn: st.turn, t: +st.t.toFixed(1), winner: st.winner || 0, turnsPlayed: st.turnsPlayed,
        players: st.players.map(function (P) { var s = pstats(P); return { n: P.n, side: P.side, score: s.score, hits: s.hits, strikes: s.strikes, hasCam: !!P.cam }; }) };
    },
    _t: function (t) { if (st) st.t = t; return true; }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
