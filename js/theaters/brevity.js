/* LUNC Battlefield v12.0.40 — brevity codes and radio procedure (realism checklist, audio & radio: "authentic brevity codes").
 * The air war gets its own radio calls, driven by real dogfight events in theaters.js (the sim itself is unchanged):
 *   BANDIT / TALLY when a fight starts, FOX TWO on an IR missile launch, DEFENDING + FLARES when the target decoys,
 *   SPLASH ONE on a kill, TRASHED on a miss, BINGO / RTB when a sortie heads home, and a "hit, going down" call when one of
 *   your own jets is shot down (by a missile, flak, a SAM or gun AA).
 * Commander strikes follow call-for-fire procedure: SHOT, then SPLASH about five seconds later, then ROUNDS COMPLETE.
 * Plain-English glosses go in brackets on the subtitle strip (shown, never spoken; voice.js strips brackets before speech),
 * and the radio log lists every brevity word heard this session.
 * Throttled per kind; your side is spoken, the enemy's is INTERCEPTED at a lower rate; always chatter priority so HQ calls
 * and alerts win. Labelled SIMULATED. Radio/UI only: never touches market data, armies or the front. ?brevity=0 → off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('brevity') !== '0' && qs.get('voice') !== '0' && qs.get('theaters') !== '0';
  var GLOSS = {
    'BANDIT': 'a confirmed enemy aircraft', 'TALLY': 'I can see the enemy', 'FOX TWO': 'infrared missile fired',
    'DEFENDING': 'evading a threat', 'FLARES': 'decoys dropped against a heat-seeker', 'SPLASH': 'target destroyed, or rounds have landed',
    'TRASHED': 'the missile missed or was decoyed', 'BINGO': 'only enough fuel to get home', 'RTB': 'returning to base',
    'SHOT': 'rounds have left the guns', 'ROUNDS COMPLETE': 'the fire mission is finished', 'WILCO': 'will comply',
    'MERGED': 'the fighters have passed each other', 'NAKED': 'no radar or missile warning'
  };
  var CS = { '-1': ['Viper', 'Mustang', 'Ranger', 'Hornet'], '1': ['Raptor', 'Talon', 'Grizzly', 'Kodiak'] };
  var COOL = { tally: 14, fox: 9, defend: 12, splash: 6, trashed: 16, bingo: 22, down: 8, fire: 4 };
  var last = {}, heard = {}, prev = new Map(), timers = [], T = 0, scanT = 0;
  var stats = { calls: 0, own: 0, intercepted: 0, throttled: 0, glossed: 0, byKind: {}, procedure: 0, last: '' };

  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function cs(J) {
    if (J && J._ao && J._ao.cs) return J._ao.cs;
    var a = CS[String(J && J.side || -1)] || CS['-1'], s = (J && J.slot) || 0;
    return a[s % a.length] + ' ' + (1 + (s >> 2));
  }
  function gloss(text) {   // first time a word is heard this session, append the meaning in brackets (shown only)
    var out = text;
    Object.keys(GLOSS).forEach(function (w) {
      if (out.toUpperCase().indexOf(w) < 0) return;
      heard[w] = (heard[w] || 0) + 1;
      if (heard[w] === 1) { out += ' (' + w.toLowerCase() + ': ' + GLOSS[w] + ')'; stats.glossed++; }
    });
    return out;
  }
  function emit(kind, side, callsign, text, opt) {
    if (!enabled || !LB.voice || !LB.voice.say) return false;
    var me = playerSide(), own = side === me, key = kind + ':' + (own ? 'o' : 'e');
    var cd = (COOL[kind] || 10) * (own ? 1 : 2.2);
    if (!(opt && opt.force) && T - (last[key] || -1e9) < cd) { stats.throttled++; return false; }
    if (!own && !(opt && opt.force) && Math.random() > 0.45) { stats.throttled++; return false; }
    last[key] = T;
    var t = gloss(text);
    try { LB.voice.say({ pri: (opt && opt.pri) || 1, side: side, callsign: callsign, text: t, intercepted: !own, tag: 'SIMULATED' }); } catch (_) { return false; }
    stats.calls++; if (own) stats.own++; else stats.intercepted++;
    stats.byKind[kind] = (stats.byKind[kind] || 0) + 1; stats.last = callsign + ': ' + t;
    return true;
  }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  /** Event hooks from theaters.js. kind: fox | defend | trashed | splash */
  function air(kind, J, o) {
    if (!enabled || !J) return;
    if (kind === 'fox') emit('fox', J.side, cs(J), cs(J) + ', ' + pick(['Fox Two', 'Fox Two, Fox Two', 'Fox Two, single bandit']) + '.');
    else if (kind === 'defend' && o) emit('defend', o.side, cs(o), cs(o) + ', ' + pick(['defending, flares, flares', 'missile inbound, defending, flares']) + '.');
    else if (kind === 'trashed' && J) emit('trashed', J.side, cs(J), cs(J) + ', ' + pick(['missile trashed', 'trashed, re-attacking']) + '.');
    else if (kind === 'splash' && J) { emit('splash', J.side, cs(J), cs(J) + ', ' + pick(['Splash one', 'Splash one bandit', 'Splash one, looking for more']) + '.'); }
  }

  /** Call-for-fire procedure for a Commander fire mission (side = firing side). */
  function fireMission(side, ability) {
    if (!enabled) return;
    var me = playerSide(), FDC = 'Steel Rain';   // the fire direction centre's callsign
    if (side !== me) return;
    stats.procedure++;
    var named = { arty: 'Artillery', air: 'Air', cluster: 'Cluster', emp: 'E M P', flare: 'Illumination', moab: 'Heavy' }[ability] || 'Fire';
    if (!emit('fire', side, FDC, FDC + ', ' + named + ' mission, shot, over.', { force: true, pri: 2 })) return;
    timers.push({ at: T + 5, fn: function () { emit('fire', side, FDC, FDC + ', splash, over.', { force: true, pri: 2 }); } });
    timers.push({ at: T + 11, fn: function () { emit('fire', side, FDC, FDC + ', rounds complete, over.', { force: true, pri: 1 }); } });
  }

  function scan() {   // state transitions: fight start (tally), sortie heading home (bingo), own jet shot down
    var jets = []; try { jets = LB.theaters && LB.theaters._jets ? LB.theaters._jets() : []; } catch (_) {}
    var me = playerSide();
    for (var i = 0; i < jets.length; i++) {
      var J = jets[i], s = J.st, p = prev.get(J);
      if (p !== s) {
        if (s === 'fight' && p === 'cruise') emit('tally', J.side, cs(J), cs(J) + ', ' + pick(['tally one bandit, engaging', 'bandit, nose hot, tally', 'merged, tally one']) + '.');
        else if (s === 'rtb' && (p === 'cruise' || p === 'fight')) emit('bingo', J.side, cs(J), cs(J) + ', ' + pick(['bingo, R T B', 'bingo fuel, R T B, wilco', 'Winchester and bingo, R T B']) + '.');
        else if (s === 'down' && p && p !== 'down' && J.side === me) emit('down', J.side, cs(J), cs(J) + ', ' + pick(['I\'m hit, going down', 'hit, hit, ejecting', 'lost an engine, I\'m going in']) + '.', { pri: 2 });
        prev.set(J, s);
      }
    }
  }

  // ------------------------------------------------------------- glossary in the radio log
  var glossEl = null;
  function renderGlossary() {
    var strip = doc.getElementById('radioStrip'); if (!strip) return;
    var logEl = strip.querySelector('.rs-log'); if (!logEl) return;
    if (!glossEl || !glossEl.isConnected) { glossEl = doc.createElement('div'); glossEl.className = 'rs-gloss'; glossEl.id = 'radioGlossary'; }
    if (glossEl.parentNode !== logEl) logEl.appendChild(glossEl);
    var words = Object.keys(heard);
    glossEl.innerHTML = words.length ? '<b>Brevity heard</b>' + words.map(function (w) { return '<div><code>' + w + '</code> ' + GLOSS[w] + '</div>'; }).join('') : '';
  }

  var lastF = 0, gT = 0;
  function update() {
    if (!enabled) return;
    var e = LB.engine; if (!e || !e.THREE) return;
    var now = performance.now(), dt = Math.min(0.1, (now - (lastF || now)) / 1000); lastF = now;
    if (e.isPaused && e.isPaused()) return;
    T += dt; scanT -= dt; gT -= dt;
    if (scanT <= 0) { scanT = 0.25; try { scan(); } catch (_) {} }
    for (var i = timers.length - 1; i >= 0; i--) if (T >= timers[i].at) { var f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (_) {} }
    if (gT <= 0) { gT = 1; try { renderGlossary(); } catch (_) {} }
  }
  LB.brevity = {
    isEnabled: function () { return enabled; }, update: update, air: air, fireMission: fireMission, glossary: function () { return Object.assign({}, GLOSS); },
    getState: function () { return Object.assign({ enabled: enabled, heard: Object.assign({}, heard), pending: timers.length }, stats, { byKind: Object.assign({}, stats.byKind) }); }
  };
})(window);
