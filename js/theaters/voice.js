/* LUNC Battlefield v12.0.10 — spoken radio chatter + HQ announcements.
 * Speech: browser SpeechSynthesis (no audio files). SpeechSynthesis output cannot be routed through WebAudio, so the radio
 * effect is approximated: lower pitch / slightly faster speech, plus WebAudio squelch clicks and a band-passed (300–3000 Hz),
 * lightly distorted static bed before, under and after each line. INTERCEPTED enemy lines get heavier static.
 * Priority queue, at most one spoken line per ~6 s; announcements (HQ) win over chatter. Subtitle strip above the dock.
 * Market lines only state what the live data says (LIVE) or are labelled SIMULATED. Audio/UI only: never changes data.
 * Settings → WORLD → "Radio voice" mutes it; ?voice=0 turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('voice') !== '0';
  var KEY = 'luncBattle.voice', GAP = 6000;
  var on = true; try { on = localStorage.getItem(KEY) !== '0'; } catch (_) {}
  var synth = global.speechSynthesis || null, ready = false, queue = [], lastSpoke = 0, speaking = false, log = [], el = {}, bed = null;
  var watch = { t: 0, fx: null, price: null, weather: null, night: null, eta: {}, started: false, humorT: 120 };
  var stats = { spoken: 0, shown: 0, dropped: 0, intercepted: 0, speech: !!synth, last: '' };
  var P = { hq: 3, alert: 3, event: 2, chatter: 1, humor: 0 };
  var CALL = { '-1': ['Bull Actual', 'Green Hornet', 'Moonrunner Two-One', 'Burn Squad'], '1': ['Bear Actual', 'Red Grizzly', 'Short Stack Six', 'Dump Truck'], '0': ['HQ', 'Overlord', 'Watchtower'] };
  var LINES = {
    strike: ['{c}, fire mission confirmed, rounds out, over.', '{c}, splash in five, keep your heads down, over.', '{c}, ordnance away. Roger, over.'],
    nuke: ['All stations, all stations, flash flash flash. Big one inbound. Heads down, over.', 'Overlord to all units, tactical burn detonation. Brace, brace, brace.'],
    squad_move: ['{c}, moving, over.', '{c}, roger, oscar mike.', '{c}, copy, relocating now, over.'],
    squad_hold: ['{c}, holding position, over.', '{c}, roger, digging in.'],
    squad_flank: ['{c}, swinging wide on the flank, over.', '{c}, going around, keep them busy, over.'],
    squad_cover: ['{c}, moving to cover, over.', '{c}, roger, getting behind the wall.'],
    cut: ['{c}, enemy depot is burning. Their supply line is cut, over.', 'Watchtower, confirm the depot is down. Supply line severed, over.'],
    cutUs: ['HQ, our depot is hit, supply line is cut. Engineers needed, over.'],
    raid: ['Air raid warning, air raid warning. Bombers inbound on the supply road, over.', 'Watchtower, bandits low and fast heading for our depot. Over.'],
    carrier: ['All stations, carrier hit. Fires on the flight deck, over.', 'Overlord, the carrier is burning. Repeat, the carrier is burning, over.'],
    wave: ['{c}, reinforcements rolling up the supply road, over.', 'HQ, fresh troops on the way to the line, over.'],
    eta: ['HQ, reinforcements E T A fifteen seconds, over.'],
    tech: ['{c}, R and D reports {x} online, over.', '{c}, {x} is ready. Roger, out.'],
    dropWon: ['{c}, crate secured, heading home, over.', '{c}, we got the drop. Roger, out.'],
    dropLost: ['{c}, they beat us to the crate. Negative on the drop, over.'],
    start: ['All stations, this is Overlord. Radio check. The battlefield is live, over.'],
    weather: { fog: 'Watchtower, fog rolling in. Visibility dropping, over.', rain: 'Watchtower, rain over the sector. Expect sloppy air ops, over.', clear: 'Watchtower, skies clearing, over.' },
    night: 'Overlord, sun is down. Night ops, watch for tracers, over.', day: 'Overlord, first light. Back to day ops, over.',
    humor: ['{c}, who left the coffee on the tank? Over.', 'HQ, request permission to buy the dip. Request denied, over.', '{c}, my horoscope said sideways today. Roger, out.', 'Watchtower, someone keeps shouting wen moon on this channel. Cut it out, over.', '{c}, the chart is not a map, repeat, the chart is not a map. Over.']
  };
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function call(side) { return pick(CALL[String(side || 0)] || CALL['0']); }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function muted() { return !on || (LB.sfx && LB.sfx.isMuted && LB.sfx.isMuted()); }

  // ------------------------------------------------------------- radio sound (WebAudio around the speech)
  function A() { var a = LB.sfx && LB.sfx.audio ? LB.sfx.audio() : null; return a && a.ctx ? a : null; }
  var noiseBuf = null, curve = null;
  function prep(ctx) {
    if (!noiseBuf) { var n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
    if (!curve) { curve = new Float32Array(256); for (var k = 0; k < 256; k++) { var x = k / 128 - 1; curve[k] = Math.tanh(x * 3); } }
  }
  function radioChain(ctx, out, vol, dur, when) {   // static → 300–3000 Hz band-pass → soft-clip distortion → gain envelope
    prep(ctx);
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    var ws = ctx.createWaveShaper(); ws.curve = curve;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
    if (dur) g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(hp); hp.connect(lp); lp.connect(ws); ws.connect(g); g.connect(out);
    src.start(when, Math.random() * 0.5); if (dur) src.stop(when + dur + 0.05);
    return { src: src, g: g };
  }
  function squelch(heavy) {   // key-up click + static burst
    var a = A(); if (!a || muted()) return;
    var c = a.ctx, t = c.currentTime;
    var o = c.createOscillator(); o.type = 'square'; o.frequency.value = heavy ? 900 : 1300;
    var og = c.createGain(); og.gain.setValueAtTime(0.05, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); o.connect(og); og.connect(a.comp); o.start(t); o.stop(t + 0.06);
    radioChain(c, a.comp, heavy ? 0.14 : 0.08, heavy ? 0.42 : 0.28, t + 0.03);
  }
  function bedOn(heavy) { var a = A(); if (!a || muted()) return; bedOff(); bed = radioChain(a.ctx, a.comp, heavy ? 0.045 : 0.018, 0, a.ctx.currentTime); }
  function bedOff() { if (!bed) return; var a = A(); try { var t = a ? a.ctx.currentTime : 0; bed.g.gain.setTargetAtTime(0.0001, t, 0.05); bed.src.stop(t + 0.3); } catch (_) {} bed = null; }
  var voices = null;
  function pickVoice(heavy) {
    if (!synth) return null; if (!voices || !voices.length) voices = synth.getVoices() || [];
    var en = voices.filter(function (v) { return /^en/i.test(v.lang); }); if (!en.length) return null;
    return en[heavy ? Math.min(1, en.length - 1) : 0];
  }

  // ------------------------------------------------------------- queue
  function say(o) {   // o: { pri, side, text, intercepted, tag }
    if (!enabled) return;
    var now = performance.now(); o.t = now;
    queue = queue.filter(function (q) { return now - q.t < 9000; });   // stale lines drop
    if (queue.length >= 4) { queue.sort(function (a, b) { return a.pri - b.pri; }); if (queue[0].pri <= o.pri) { queue.shift(); stats.dropped++; } else { stats.dropped++; return; } }
    queue.push(o);
  }
  function pump() {
    var now = performance.now(); if (!queue.length || speaking || now - lastSpoke < GAP) return;
    queue.sort(function (a, b) { return b.pri - a.pri || a.t - b.t; });
    var o = queue.shift(); lastSpoke = now; show(o);
    if (muted() || !synth) return;
    speaking = true; squelch(o.intercepted); bedOn(o.intercepted);
    try {
      var u = new SpeechSynthesisUtterance(o.text.replace(/\(.*?\)/g, ''));
      u.pitch = o.intercepted ? 0.55 : 0.8; u.rate = o.intercepted ? 1.0 : 1.12; u.volume = Math.max(0.2, (LB.sfx && LB.sfx.getVolume ? LB.sfx.getVolume() : 0.7)) * (o.intercepted ? 0.6 : 0.9);
      var v = pickVoice(o.intercepted); if (v) u.voice = v;
      var done = function () { speaking = false; bedOff(); squelch(o.intercepted); };
      u.onend = done; u.onerror = done; setTimeout(function () { if (speaking) { try { synth.cancel(); } catch (_) {} done(); } }, 9000);
      setTimeout(function () { try { synth.speak(u); stats.spoken++; } catch (_) { done(); } }, 260);
    } catch (_) { speaking = false; bedOff(); }
  }
  function show(o) {
    stats.shown++; if (o.intercepted) stats.intercepted++;
    var who = o.callsign || call(o.side);
    var item = { who: who, text: o.text, side: o.side, intercepted: !!o.intercepted, tag: o.tag || '' };
    log.unshift(item); if (log.length > 8) log.pop(); stats.last = who + ': ' + o.text;
    if (!el.strip) return;
    el.cur.innerHTML = '<b class="rs-who ' + (o.side < 0 ? 'b' : o.side > 0 ? 'r' : 'hq') + '">' + esc(who) + '</b>' + (o.intercepted ? '<i class="rs-int">INTERCEPTED</i>' : '') + (o.tag ? '<i class="rs-tag">' + esc(o.tag) + '</i>' : '') + '<span>' + esc(o.text) + '</span>';
    el.strip.classList.add('live'); clearTimeout(el.hideT); el.hideT = setTimeout(function () { el.strip.classList.remove('live'); }, 6500);
    el.log.innerHTML = log.map(function (l) { return '<div><b class="' + (l.side < 0 ? 'b' : l.side > 0 ? 'r' : 'hq') + '">' + esc(l.who) + '</b>' + (l.intercepted ? ' <i>INTERCEPTED</i>' : '') + ' ' + esc(l.text) + '</div>'; }).join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /** Public event entry. kind: strike|nuke|squad_*|cut|raid|carrier|wave|tech|dropWon|dropLost; side = acting side */
  function event(kind, side, extra) {
    if (!enabled) return;
    var me = playerSide(), pri = P.event, text, tpl, intercepted = false, cs = null;
    if (kind === 'cut') { if (side === me) { tpl = LINES.cutUs; pri = P.alert; cs = 'HQ'; } else tpl = LINES.cut; }
    else if (kind === 'raid') { tpl = LINES.raid; pri = P.alert; cs = 'Watchtower'; side = 0; }
    else if (kind === 'carrier' || kind === 'nuke') { tpl = LINES[kind]; pri = P.alert; cs = 'Overlord'; side = 0; }
    else tpl = LINES[kind];
    if (!tpl) return;
    if (side && side !== me && kind !== 'cut') { intercepted = true; pri = Math.min(pri, P.chatter); }   // enemy chatter = intercepted
    if (/^squad_/.test(kind) && side === me) pri = P.chatter;
    cs = cs || call(side);
    text = pick(tpl).replace('{c}', cs).replace('{x}', extra || '');
    say({ pri: pri, side: side, text: text, intercepted: intercepted, callsign: cs, tag: kind === 'raid' || kind === 'carrier' || kind === 'nuke' ? 'ALERT' : '' });
  }

  // ------------------------------------------------------------- HQ announcements (polled)
  function announce(dt) {
    var e = LB.engine; if (!e) return;
    if (!watch.started) { watch.started = true; say({ pri: P.hq, side: 0, callsign: 'Overlord', text: LINES.start[0], tag: 'HQ' }); }
    watch.t -= dt; watch.humorT -= dt;
    if (watch.t <= 0) {
      watch.t = 25;
      var fx = e.getFrontlineX ? e.getFrontlineX() : null, price = e.getPrice ? e.getPrice() : null, live = e.isPriceLive ? e.isPriceLive() : false;
      if (watch.fx != null && fx != null && watch.price && price) {
        var dfx = fx - watch.fx, pct = (price - watch.price) / watch.price * 100;
        if (Math.abs(dfx) > 1.5 && Math.abs(pct) > 0.01) {   // only speak when the data actually moved
          var up = pct > 0, txt = (up ? 'Bulls pushing ' : 'Bears pushing ') + (dfx > 0 ? 'east' : 'west') + '. Price ' + (up ? 'up ' : 'down ') + Math.abs(pct).toFixed(2) + ' percent, front moving ' + (dfx > 0 ? 'east' : 'west') + ', over.';
          say({ pri: P.hq, side: 0, callsign: 'HQ', text: txt, tag: live ? 'LIVE' : 'SIMULATED' });
        }
      }
      watch.fx = fx; watch.price = price;
    }
    var opt = {}; try { opt = LB.v12extras.getOptions(); } catch (_) {}
    if (opt.weather && watch.weather && opt.weather !== watch.weather) say({ pri: P.hq, side: 0, callsign: 'Watchtower', text: LINES.weather[opt.weather] || LINES.weather.clear, tag: 'SIMULATED' });
    watch.weather = opt.weather || watch.weather;
    var night = doc.body.classList.contains('night');
    if (watch.night != null && night !== watch.night) say({ pri: P.hq, side: 0, callsign: 'Overlord', text: night ? LINES.night : LINES.day, tag: 'SIMULATED' });
    watch.night = night;
    if (LB.lines && LB.lines.getStats) { var wt = LB.lines.getStats().waveT || {}, k = String(playerSide()); var v = wt[k]; if (v != null) { if (v < 15 && v > 12 && !watch.eta[k]) { watch.eta[k] = 1; say({ pri: P.hq, side: 0, callsign: 'HQ', text: LINES.eta[0], tag: 'HQ' }); } if (v > 20) watch.eta[k] = 0; } }
    if (watch.humorT <= 0) { watch.humorT = 150 + Math.random() * 120; var s = Math.random() < 0.5 ? -1 : 1; var hc = call(s); say({ pri: P.humor, side: s, callsign: hc, text: pick(LINES.humor).replace('{c}', hc), intercepted: s !== playerSide() }); }
  }

  // ------------------------------------------------------------- UI
  function buildUi() {
    var s = doc.createElement('div'); s.id = 'radioStrip'; s.className = 'radio-strip'; s.setAttribute('role', 'log'); s.setAttribute('aria-live', 'polite');
    s.innerHTML = '<div class="rs-cur"></div><div class="rs-log" hidden></div>';
    doc.body.appendChild(s); el.strip = s; el.cur = s.querySelector('.rs-cur'); el.log = s.querySelector('.rs-log');
    s.addEventListener('click', function () { el.log.hidden = !el.log.hidden; s.classList.toggle('open', !el.log.hidden); });
    var host = doc.getElementById('v12Opts');
    if (host) { var l = doc.createElement('label'); l.innerHTML = '<input type="checkbox" id="v12Voice"> Radio voice (spoken chatter)'; host.appendChild(l); var cb = l.querySelector('input'); cb.checked = on; cb.addEventListener('change', function () { setOn(cb.checked); }); }
  }
  function setOn(v) { on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) {} if (!on) { queue = []; try { synth && synth.cancel(); } catch (_) {} bedOff(); speaking = false; } }
  var last = 0;
  function update() {
    if (!enabled) return;
    var e = LB.engine; if (!e || !e.THREE) return;
    if (!ready) { if (!doc.getElementById('v12Opts') && LB.theaters && LB.theaters.isEnabled && LB.theaters.isEnabled() && !LB.v12extras) return; try { buildUi(); ready = true; } catch (err) { enabled = false; console.warn('[voice] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused()) return;
    announce(dt); pump();
  }
  LB.voice = {
    isEnabled: function () { return enabled && ready; }, update: update, event: event, say: say, setOn: setOn, isOn: function () { return on; },
    getLog: function () { return log.slice(); }, getStats: function () { return Object.assign({ queue: queue.length, on: on }, stats); },
    _pump: function (force) { if (force) lastSpoke = 0; pump(); }
  };
})(window);
