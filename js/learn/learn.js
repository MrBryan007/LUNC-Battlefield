/* LUNC Battlefield — adaptive / self-learning layer (local only, no network).
 *
 * Event bus + rolling aggregates (1 s tick, no per-frame work) → light adaptation (EMA + bandit-style weights):
 *   - dynamic mission difficulty (target ~65 % success), mission-type weights with novelty decay
 *   - faction strategy priors (advice the AI layer MAY read; nudged by frontline moves after each strategy)
 *   - chatter frequency tuned by dismiss rate, tip library with cooldowns + LEARNED badge
 * Never touches market data, army sizes or the frontline. All adaptive output is labelled ADAPTIVE / SIMULATED.
 * Persistence: localStorage 'luncBattle.learn.v1' (versioned, size-capped), export/import JSON, reset.
 *
 * Hook API (LUNCBattle.learn) — for commander.js, war-room.js, cinematic.js and js/ai/*:
 *   emit(type, data)               e.g. 'strike' {ability}, 'hits' {ability,n}, 'mission:new|done|fail',
 *                                  'call:result' {right}, 'market' {type,importance,headline},
 *                                  'ai:strategy' {side,strategy}, 'ai:quest' {side,type,ok}, 'ai:sniperKill' {side}
 *   on(type, fn) / off(type, fn)   subscribe ('*' = all)
 *   missionAdvice(ids)             → { weights:{id:w}, difficulty } (commander nextMission)
 *   getAdvice()                    → { strategyPrior:{'-1':{PUSH..},'1':{..}}, questWeights:{capture..},
 *                                      sniperDensity:0..1 (fraction of tier cap), difficulty, label:'ADAPTIVE' }
 *   getState(), export(), import(json), reset(), setHumor(bool)
 * URL: ?learn=0 disables the layer (hooks become no-ops).
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var doc = global.document;
  var KEY = 'luncBattle.learn.v1', SCHEMA = 1, MAX_BYTES = 24 * 1024;
  var qs = (function () { try { return new URLSearchParams(location.search); } catch (_) { return { get: function () { return null; } }; } })();
  var disabled = qs.get('learn') === '0';
  var ABILITIES = ['arty', 'air', 'moon', 'cluster', 'emp', 'flare'];
  var ABN = { arty: 'Artillery', air: 'Airstrike', moon: 'Moon Shot', cluster: 'Cluster Mortars', emp: 'EMP Pulse', flare: 'Recon Flare' };
  var SECTORS = ['bullBase', 'bullField', 'front', 'bearField', 'bearBase'];
  var STRATS = ['PUSH', 'HOLD', 'FLANK', 'FALL BACK'];
  var QUESTS = ['capture', 'defend', 'recon', 'battery', 'escort'];
  var TARGET_SUCCESS = 0.65;

  // ------------------------------------------------------------ state
  function freshMem() {
    return {
      v: SCHEMA, sessions: 0, created: Date.now(),
      ab: {},                        // ability → { used, hit, ema }   ema = rolling hit rate
      calls: { n: 0, right: 0, ema: 0.5 },
      missions: { done: 0, fail: 0, abandon: 0, ema: TARGET_SUCCESS, byType: {} },  // byType id → {n, done, eng}
      difficulty: 1,
      attention: {},                 // sector → seconds (all-time)
      hideUi: { toggles: 0, cleanS: 0 },
      market: { big: 0, liq: 0, walls: 0 },
      strat: { '-1': {}, '1': {} },  // side → strategy → ema of frontline gain
      quests: {},                    // quest type → ema success
      sniperKills: 0,
      tips: {},                      // tip id → { n, last, sessions }
      humor: { on: true, shown: 0, dismissed: 0, rate: 1 },
      last: null                     // summary of previous session (for the recap)
    };
  }
  var mem = freshMem();
  var sess = { t0: Date.now(), strikes: {}, hits: {}, missionsDone: 0, missionsFail: 0, calls: 0, callsRight: 0, recent: [], lastStrike: null, airMissRun: 0 };
  var listeners = {};
  var queue = [];                    // raw events since last tick (bounded)
  var intel = [];                    // [{id, text, kind, t, learned}]
  var lastHumorT = 0, lastTipT = 0, lastPrice = null, priceHist = [], activeMission = null, lastStratEval = [];
  var tickN = 0;

  function load() {
    try {
      var raw = localStorage.getItem(KEY); if (!raw) return;
      var m = JSON.parse(raw);
      if (!m || m.v !== SCHEMA) return;            // future migrations: switch (m.v) { … }
      var f = freshMem();
      for (var k in f) if (m[k] === undefined) m[k] = f[k];
      mem = m;
    } catch (_) { mem = freshMem(); }
  }
  function save() {
    try {
      var s = JSON.stringify(mem);
      if (s.length > MAX_BYTES) { mem.tips = {}; mem.quests = {}; s = JSON.stringify(mem); }   // trim least important
      if (s.length <= MAX_BYTES) localStorage.setItem(KEY, s);
    } catch (_) {}
  }

  // ------------------------------------------------------------ bus
  function emit(type, data) {
    if (disabled) return;
    var ev = { type: type, data: data || {}, t: Date.now() };
    if (queue.length < 200) queue.push(ev);
    var ls = (listeners[type] || []).concat(listeners['*'] || []);
    for (var i = 0; i < ls.length; i++) { try { ls[i](ev); } catch (_) {} }
  }
  function on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  function off(type, fn) { var a = listeners[type]; if (a) listeners[type] = a.filter(function (f) { return f !== fn; }); }

  function ema(prev, x, a) { return prev == null ? x : prev + (x - prev) * a; }
  function abRec(id) { return mem.ab[id] || (mem.ab[id] = { used: 0, hit: 0, ema: 0.5 }); }

  // ------------------------------------------------------------ aggregation (1 s tick)
  function consume(ev) {
    var d = ev.data, now = ev.t;
    switch (ev.type) {
      case 'strike': {
        var r = abRec(d.ability); r.used++;
        sess.strikes[d.ability] = (sess.strikes[d.ability] || 0) + 1;
        // close the previous strike window: no hits → miss
        if (sess.lastStrike && !sess.lastStrike.hit) closeStrike(sess.lastStrike, false);
        sess.lastStrike = { ability: d.ability, t: now, hit: false };
        sess.recent.push({ a: d.ability, t: now }); if (sess.recent.length > 12) sess.recent.shift();
        break;
      }
      case 'hits': {
        var ls = sess.lastStrike;
        if (ls && ls.ability === d.ability && now - ls.t < 3000 && !ls.hit) { ls.hit = true; closeStrike(ls, true); }
        sess.hits[d.ability] = (sess.hits[d.ability] || 0) + (d.n | 0);
        break;
      }
      case 'mission:new': activeMission = { id: d.id, t: now }; break;
      case 'mission:done': case 'mission:fail': case 'mission:abandon': {
        var ok = ev.type === 'mission:done';
        var M = mem.missions;
        if (ok) { M.done++; sess.missionsDone++; } else if (ev.type === 'mission:fail') { M.fail++; sess.missionsFail++; } else M.abandon++;
        M.ema = ema(M.ema, ok ? 1 : 0, 0.15);
        var bt = M.byType[d.id] || (M.byType[d.id] = { n: 0, done: 0, eng: 0.5 });
        bt.n++; if (ok) bt.done++;
        // engagement: finished fast = engaging; failed with zero progress = boring; abandoned = boring
        var frac = d.time ? Math.max(0, Math.min(1, (d.left || 0) / d.time)) : 0;
        var engage = ok ? 0.6 + 0.4 * frac : (ev.type === 'mission:fail' && d.got > 0 ? 0.4 : 0.15);
        bt.eng = ema(bt.eng, engage, 0.2);
        // dynamic difficulty → steer toward TARGET_SUCCESS (bounded, slow)
        mem.difficulty = Math.max(0.7, Math.min(1.35, mem.difficulty + (M.ema - TARGET_SUCCESS) * 0.08));
        activeMission = null;
        break;
      }
      case 'call:result':
        if (d.void) break;
        mem.calls.n++; sess.calls++; if (d.right) { mem.calls.right++; sess.callsRight++; }
        mem.calls.ema = ema(mem.calls.ema, d.right ? 1 : 0, 0.2);
        break;
      case 'market':
        if (d.type === 'LIQUIDATION') { mem.market.liq++; maybeHumor('liquidation'); }
        else if (/WALL/i.test(d.headline || '')) mem.market.walls++;
        else if (/CAPTURE THE RANGE/i.test(d.headline || '')) { mem.market.big++; maybeHumor(/BULL/.test(d.headline) ? 'pump' : 'dump'); }
        break;
      case 'ui:mode': mem.hideUi.toggles++; break;
      case 'ai:strategy': lastStratEval.push({ side: d.side, s: d.strategy, t: now, fx: frontX() }); if (lastStratEval.length > 8) lastStratEval.shift(); break;
      case 'ai:quest': { var qr = mem.quests[d.type]; mem.quests[d.type] = ema(qr, d.ok ? 1 : 0, 0.2); break; }
      case 'ai:sniperKill': mem.sniperKills++; break;
      case 'moon': maybeHumor('moon'); break;
      case 'humor:dismiss': mem.humor.dismissed++; mem.humor.rate = Math.max(0.25, mem.humor.rate * 0.8); break;
      case 'intel:dismiss': if (mem.tips[d.id]) mem.tips[d.id].dismissed = (mem.tips[d.id].dismissed || 0) + 1; break;
    }
  }
  function closeStrike(s, hit) {
    var r = abRec(s.ability);
    if (hit) r.hit++;
    r.ema = ema(r.ema, hit ? 1 : 0, 0.18);
    if (s.ability === 'air') sess.airMissRun = hit ? 0 : sess.airMissRun + 1;
    if (!hit && Math.random() < 0.25) maybeHumor('miss');
    else if (hit && Math.random() < 0.12) maybeHumor('strike');
  }

  function E() { return LB.engine; }
  function frontX() { try { return E().getFrontlineX ? E().getFrontlineX() : 0; } catch (_) { return 0; } }
  function sectorOf(x) { return x < -30 ? 'bullBase' : x < -8 ? 'bullField' : x <= 8 ? 'front' : x <= 30 ? 'bearField' : 'bearBase'; }

  function tick() {
    tickN++;
    var q = queue; queue = [];
    for (var i = 0; i < q.length; i++) consume(q[i]);
    var eng = E();
    // camera attention: ground point at screen centre, 1 sample / s
    if (eng && eng.pickGround) {
      try { var p = eng.pickGround(innerWidth / 2, innerHeight / 2); if (p) { var s = sectorOf(p.x); mem.attention[s] = (mem.attention[s] || 0) + 1; } } catch (_) {}
    }
    if (doc.body.getAttribute('data-ui') === 'clean') mem.hideUi.cleanS++;
    // price: big-move detector over ~60 s (LIVE only; reads, never writes)
    try {
      if (eng && eng.isPriceLive && eng.isPriceLive()) {
        var pr = eng.getPrice(); priceHist.push(pr); if (priceHist.length > 60) priceHist.shift();
        var p0 = priceHist[0];
        if (priceHist.length >= 30 && p0) {
          var ch = (pr - p0) / p0;
          if (Math.abs(ch) > 0.006 && tickN % 30 === 0) { mem.market.big++; maybeHumor(ch > 0 ? 'pump' : 'dump'); }
          else if (Math.abs(ch) < 0.0004 && tickN % 90 === 0) maybeHumor('flat');
        }
      }
    } catch (_) {}
    // strategy priors: 30 s after each announced strategy, credit it with frontline gain for that side
    var now = Date.now();
    lastStratEval = lastStratEval.filter(function (e) {
      if (now - e.t < 30000) return true;
      var gain = (frontX() - e.fx) * (e.side < 0 ? 1 : -1);   // bulls (left) gain when the front moves +x
      var tbl = mem.strat[String(e.side)] || (mem.strat[String(e.side)] = {});
      tbl[e.s] = ema(tbl[e.s], Math.max(-1, Math.min(1, gain / 4)), 0.25);
      return false;
    });
    if (tickN % 5 === 0) evaluateTips();
    if (tickN % 15 === 0) { mem.lastLive = summary(); save(); }
  }

  // ------------------------------------------------------------ adaptation outputs
  function missionAdvice(ids) {
    var w = {}, M = mem.missions.byType, recent = (sess.recentMissions || []);
    ids.forEach(function (id) {
      var bt = M[id];
      var eng = bt ? bt.eng : 0.55;
      var reps = recent.slice(-3).filter(function (r) { return r === id; }).length;
      var novelty = Math.pow(0.45, reps);                      // novelty decay
      w[id] = (0.15 + eng) * novelty;                            // + exploration floor
    });
    return { weights: w, difficulty: mem.difficulty, label: 'ADAPTIVE' };
  }
  function noteMission(id) { (sess.recentMissions = sess.recentMissions || []).push(id); if (sess.recentMissions.length > 6) sess.recentMissions.shift(); }

  function getAdvice() {
    var pri = {};
    ['-1', '1'].forEach(function (side) {
      var t = mem.strat[side] || {}, out = {}, sum = 0;
      STRATS.forEach(function (s) { out[s] = Math.exp(1.5 * (t[s] || 0)); sum += out[s]; });
      STRATS.forEach(function (s) { out[s] = +(out[s] / sum).toFixed(3); });
      pri[side] = out;
    });
    var qw = {};
    QUESTS.forEach(function (k) { qw[k] = +(0.5 + (mem.quests[k] != null ? mem.quests[k] : 0.5)).toFixed(3); });
    // sniper density suggestion (0..1 of the AI tier cap): fewer if snipers already dominate the player's advances
    var sd = Math.max(0.3, Math.min(1, 1 - Math.max(0, mem.sniperKills - 20) / 100));
    return { strategyPrior: pri, questWeights: qw, sniperDensity: +sd.toFixed(2), difficulty: +mem.difficulty.toFixed(3), label: 'ADAPTIVE · SIMULATED' };
  }

  // ------------------------------------------------------------ tips
  function rate(id) { var r = mem.ab[id]; return r && r.used >= 3 ? r.ema : null; }
  function cmdState() { try { return LB.commander && LB.commander.getState ? LB.commander.getState() : null; } catch (_) { return null; } }
  var TIPS = [
    { id: 'air_lead', cd: 180, when: function () { return sess.airMissRun >= 3 || (rate('air') != null && rate('air') < 0.35); },
      text: 'Airstrikes walk a 14 m line across your click about 0.7 s later — aim at where the squad will be, not where it is.' },
    { id: 'arty_only', cd: 300, when: function () { var a = sess.strikes.arty || 0, t = total(sess.strikes); return t >= 12 && a / t > 0.7; },
      text: 'Artillery carries the team, but Cluster Mortars (4) cover wide squads and EMP (5) doubles armor score.' },
    { id: 'flare_combo', cd: 240, when: function () { return (sess.strikes.flare || 0) >= 2 && !followUps('flare', 6000); },
      text: 'Recon Flare marks a zone for 6 s — follow it with Cluster or Airstrike inside the glow for +50% score.' },
    { id: 'emp_armor', cd: 300, when: function () { var b = mem.missions.byType.armor; return b && b.n >= 2 && b.done / b.n < 0.5; },
      text: 'Armor orders running late? EMP Pulse (5) scores armor hits double.' },
    { id: 'moon_ready', cd: 120, when: function () { var s = cmdState(); return s && s.started && s.session && s.session.charge >= 100 && Date.now() - (sess.lastStrike ? sess.lastStrike.t : 0) > 15000; },
      text: 'Moon Shot is charged (3). Big blast, game FX only — not a chain burn.' },
    { id: 'call_flat', cd: 400, when: function () { return mem.calls.n >= 4 && mem.calls.ema < 0.4; },
      text: 'Call the Front scores the LIVE price 30 s later. In flat markets it is close to a coin flip — it is a game, not a signal.' },
    { id: 'sniper_flare', cd: 300, when: function () { return mem.sniperKills >= 3; },
      text: 'Snipers keep stopping advances. A Recon Flare or Cluster on the ridge line clears perches fastest.' },
    { id: 'liq_front', cd: 300, when: function () { return mem.market.liq >= 2 && recentLiq(); },
      text: 'Liquidations are hitting the tape — the front can jump. Press F to re-centre on the frontline.' },
    { id: 'attention', cd: 600, when: function () { var a = mem.attention, f = a.front || 0, t = total(a); return t > 240 && f / t < 0.2; },
      text: 'Most of the action is at the front. Press F any time to jump the camera there.' },
    { id: 'hide_ui', cd: 900, when: function () { return mem.hideUi.toggles === 0 && (Date.now() - sess.t0) > 8 * 60000; },
      text: 'Want the view without panels? Press H for Commander-only, H again for a clean cinematic view.' },
    { id: 'difficulty', cd: 900, when: function () { return mem.missions.done + mem.missions.fail >= 6 && Math.abs(mem.difficulty - 1) > 0.12; },
      text: function () { return 'Orders are now ' + (mem.difficulty > 1 ? 'tougher' : 'gentler') + ' (×' + mem.difficulty.toFixed(2) + ') to keep missions around 65% success. Adaptive, game-only.'; } }
  ];
  var lastLiqT = 0;
  function recentLiq() { return Date.now() - lastLiqT < 60000; }
  on('market', function (ev) { if (ev.data.type === 'LIQUIDATION') lastLiqT = ev.t; });
  function total(o) { var s = 0; for (var k in o) s += o[k] || 0; return s; }
  function followUps(ab, win) {
    var r = sess.recent;
    for (var i = 0; i < r.length - 1; i++) if (r[i].a === ab && r[i + 1].t - r[i].t < win) return true;
    return false;
  }
  function evaluateTips() {
    var now = Date.now();
    if (now - lastTipT < 45000) return;                    // global tip rate limit
    for (var i = 0; i < TIPS.length; i++) {
      var tp = TIPS[i], rec = mem.tips[tp.id] || (mem.tips[tp.id] = { n: 0, last: 0, sessions: 0, lastSess: 0 });
      if (now - rec.last < tp.cd * 1000 * (1 + (rec.dismissed || 0) * 0.5)) continue;
      var ok = false; try { ok = tp.when(); } catch (_) {}
      if (!ok) continue;
      rec.n++; rec.last = now; if (rec.lastSess !== mem.sessions) { rec.sessions++; rec.lastSess = mem.sessions; }
      var learned = rec.n >= 2 || rec.sessions >= 2;       // pattern repeated → LEARNED badge
      pushIntel({ id: tp.id, kind: 'tip', text: typeof tp.text === 'function' ? tp.text() : tp.text, learned: learned });
      lastTipT = now;
      return;
    }
  }

  // ------------------------------------------------------------ humor
  function maybeHumor(tag) {
    if (!mem.humor.on || !LB.humor) return;
    var now = Date.now();
    var gap = 75000 / Math.max(0.25, mem.humor.rate);       // ≥ 75 s between lines, longer if dismissed often
    if (now - lastHumorT < gap) return;
    var pool = LB.humor.LINES.filter(function (l) { return l.t === tag; });
    if (!pool.length) return;
    var line;
    var R = LB.humor.REMIX;
    if (R && R.what[tag] && Math.random() < 0.25) {
      var tpl = R.templates[(Math.random() * R.templates.length) | 0];
      line = tpl.replace('{who}', R.who[(Math.random() * R.who.length) | 0]).replace('{what}', R.what[tag][(Math.random() * R.what[tag].length) | 0]);
    } else line = pool[(Math.random() * pool.length) | 0].s;
    lastHumorT = now; mem.humor.shown++;
    mem.humor.rate = Math.min(1.5, mem.humor.rate * 1.03);  // slowly recovers when not dismissed
    pushIntel({ id: 'humor', kind: 'humor', text: line });
    floatText(line, 'humor');
  }

  // ------------------------------------------------------------ UI
  var panel = null, listEl = null, floatEl = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function ensurePanel() {
    if (panel || disabled) return panel;
    var rp = doc.getElementById('rightPanel'); if (!rp) return null;
    panel = doc.createElement('section'); panel.id = 'intelPanel'; panel.className = 'intel-panel';
    panel.innerHTML =
      '<div class="intel-head"><span class="intel-title">INTEL</span><span class="qual sim" title="Generated locally from how you play. Game-only; never changes market data.">ADAPTIVE · LOCAL</span>' +
      '<span class="intel-tools"><button data-act="humor" title="Toggle chatter">😄</button><button data-act="export" title="Export memory (JSON)">⤓</button>' +
      '<button data-act="import" title="Import memory (JSON)">⤒</button><button data-act="reset" title="Forget everything">⟲</button></span></div>' +
      '<div class="intel-list" id="intelList"></div><input type="file" accept="application/json" id="intelFile" hidden>';
    var feed = doc.getElementById('feed');
    var ai = doc.getElementById('aiOps');
    rp.insertBefore(panel, ai || feed || null);
    listEl = panel.querySelector('#intelList');
    panel.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      var act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
      if (act === 'humor') { setHumor(!mem.humor.on); }
      else if (act === 'export') exportFile();
      else if (act === 'import') panel.querySelector('#intelFile').click();
      else if (act === 'reset') { if (global.confirm('Forget everything Intel has learned on this device?')) reset(); }
      else if (act === 'x') { emit(id === 'humor' ? 'humor:dismiss' : 'intel:dismiss', { id: id }); var li = b.closest('.intel-item'); if (li) li.remove(); intel = intel.filter(function (it) { return it.el !== li; }); }
    });
    panel.querySelector('#intelFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { var ok = importJson(String(rd.result)); pushIntel({ id: 'sys', kind: 'sys', text: ok ? 'Memory imported.' : 'Import failed: not a v' + SCHEMA + ' Intel file.' }); };
      rd.readAsText(f); e.target.value = '';
    });
    renderHumorBtn();
    return panel;
  }
  function renderHumorBtn() { if (!panel) return; var b = panel.querySelector('[data-act="humor"]'); b.classList.toggle('off', !mem.humor.on); b.title = mem.humor.on ? 'Chatter on — click to mute' : 'Chatter off — click to enable'; }
  function pushIntel(it) {
    if (!ensurePanel()) return;
    it.t = Date.now();
    var li = doc.createElement('div');
    li.className = 'intel-item ' + it.kind;
    li.innerHTML = (it.learned ? '<span class="intel-badge">LEARNED</span>' : '') +
      (it.kind === 'tip' ? '<span class="intel-ico">◆</span>' : it.kind === 'humor' ? '<span class="intel-ico">💬</span>' : it.kind === 'recap' ? '<span class="intel-ico">⟳</span>' : '<span class="intel-ico">·</span>') +
      '<span class="intel-text">' + esc(it.text) + '</span><button data-act="x" data-id="' + esc(it.id) + '" title="Dismiss">×</button>';
    listEl.insertBefore(li, listEl.firstChild);
    it.el = li; intel.unshift(it);
    while (intel.length > 5) { var o = intel.pop(); if (o.el && o.el.parentNode) o.el.parentNode.removeChild(o.el); }
    if (it.kind === 'tip' || it.kind === 'recap') floatText(it.text, it.kind, it.learned);
  }
  var floatTimer = null;
  function floatText(text, kind, learned) {
    if (disabled || !doc.body.classList.contains('cmd-on')) return;     // floating text only while commanding
    if (!floatEl) {
      floatEl = doc.createElement('div'); floatEl.id = 'intelFloat'; floatEl.className = 'intel-float';
      floatEl.addEventListener('click', function (e) { if (e.target.closest('button')) { emit(floatEl.dataset.kind === 'humor' ? 'humor:dismiss' : 'intel:dismiss', { id: floatEl.dataset.kind }); hideFloat(); } });
      doc.body.appendChild(floatEl);
    }
    floatEl.dataset.kind = kind;
    floatEl.innerHTML = (learned ? '<span class="intel-badge">LEARNED</span> ' : '') + '<span>' + esc(text) + '</span><button title="Dismiss">×</button>';
    floatEl.classList.add('show');
    clearTimeout(floatTimer); floatTimer = setTimeout(hideFloat, kind === 'humor' ? 5000 : 7000);
  }
  function hideFloat() { if (floatEl) floatEl.classList.remove('show'); }

  // ------------------------------------------------------------ persistence API
  function summary() {
    var best = null, bestScore = -1;
    ABILITIES.forEach(function (a) { var u = sess.strikes[a] || 0; if (!u) return; var r = abRec(a); var sc = u * (0.5 + r.ema); if (sc > bestScore) { bestScore = sc; best = a; } });
    return { at: Date.now(), mins: Math.round((Date.now() - sess.t0) / 60000), fav: best, favRate: best ? Math.round(abRec(best).ema * 100) : null,
      missions: sess.missionsDone, fails: sess.missionsFail, calls: sess.calls, callsRight: sess.callsRight };
  }
  function recap() {
    var L = mem.last;
    if (!L || (!L.fav && !L.missions && !L.calls)) {
      pushIntel({ id: 'recap', kind: 'recap', text: 'Intel is watching how you play (locally, on this device) and will adapt orders and tips. Toggle or reset it here any time.' });
      return;
    }
    var bits = [];
    if (L.fav) bits.push('you ' + (L.favRate != null && L.favRate < 40 ? 'leaned on ' : 'loved ') + ABN[L.fav] + (L.favRate != null ? ' (' + L.favRate + '% of strikes landed)' : ''));
    if (L.missions) bits.push(L.missions + ' mission' + (L.missions > 1 ? 's' : '') + ' completed');
    if (L.calls) bits.push(L.callsRight + '/' + L.calls + ' calls right');
    var txt = 'The game remembers: last time ' + bits.join(', ') + '.';
    if (Math.abs(mem.difficulty - 1) > 0.05) txt += ' Orders are tuned ×' + mem.difficulty.toFixed(2) + '.';
    pushIntel({ id: 'recap', kind: 'recap', text: txt });
  }
  function exportJson() { return JSON.stringify(mem, null, 1); }
  function exportFile() {
    try {
      var blob = new Blob([exportJson()], { type: 'application/json' });
      var a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lunc-battlefield-intel-v' + SCHEMA + '.json';
      doc.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    } catch (_) {}
  }
  function importJson(s) {
    try { var m = JSON.parse(s); if (!m || m.v !== SCHEMA) return false; var f = freshMem(); for (var k in f) if (m[k] === undefined) m[k] = f[k]; mem = m; save(); renderHumorBtn(); return true; } catch (_) { return false; }
  }
  function reset() { mem = freshMem(); mem.sessions = 1; save(); if (listEl) listEl.innerHTML = ''; intel = []; renderHumorBtn(); pushIntel({ id: 'sys', kind: 'sys', text: 'Intel memory cleared.' }); }
  function setHumor(v) { mem.humor.on = !!v; save(); renderHumorBtn(); if (!v) hideFloat(); }

  // ------------------------------------------------------------ boot
  function boot() {
    if (disabled) return;
    load();
    mem.last = mem.lastLive || mem.last;   // previous session's live summary becomes "last"
    mem.lastLive = null;
    mem.sessions++;
    save();
    global.addEventListener('lunc:uimode', function () { emit('ui:mode', {}); });
    // Optional passive bridge to the AI layer (js/ai/*): read its bus, never write.
    var tries = 0;
    (function hookAi() {
      if (LB.ai && LB.ai.onMessage) {
        LB.ai.onMessage(function (m) { if (m && m.type === 'strategy') emit('ai:strategy', { side: m.side, strategy: (m.text || '').replace(/^.*— /, '').split(' ')[0] }); });
      } else if (tries++ < 20) setTimeout(hookAi, 1000);
    })();
    global.addEventListener('pagehide', function () {
      if (activeMission) emit('mission:abandon', { id: activeMission.id });
      var q = queue; queue = []; q.forEach(consume);
      mem.lastLive = summary(); save();
    });
    setInterval(tick, 1000);
    var tries2 = 0;
    (function waitPanel() { if (ensurePanel()) recap(); else if (tries2++ < 30) setTimeout(waitPanel, 500); })();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();

  LB.learn = {
    version: 'v12-learn-1', schema: SCHEMA,
    emit: emit, on: on, off: off,
    missionAdvice: missionAdvice, noteMission: noteMission, getAdvice: getAdvice,
    getState: function () { return { mem: JSON.parse(JSON.stringify(mem)), session: summary(), intel: intel.map(function (i) { return { id: i.id, kind: i.kind, text: i.text, learned: !!i.learned }; }) }; },
    export: exportJson, import: importJson, reset: reset, setHumor: setHumor,
    isEnabled: function () { return !disabled; },
    _tick: tick, _maybeHumor: maybeHumor, _pushIntel: pushIntel, TIPS: TIPS
  };
})(window);
