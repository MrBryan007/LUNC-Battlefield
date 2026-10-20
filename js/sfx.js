/* LUNC Battlefield v10 — procedural WebAudio SFX (no audio files; all synthesized)
 * explosion(power, dist) · gunfire(dist) · jet() · ui(kind) · success() · fail() · rank() · ambience
 * Unlocks on first user gesture (iOS requirement). Mute: M key / HUD button (persisted).
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var KEY = 'luncBattle.muted';
  var ctx = null, master = null, comp = null, noiseBuf = null, ambGain = null;
  var muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (_) {}
  var lastBoom = 0, lastGun = 0, activeVoices = 0;
  var MAX_VOICES = /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent || '') ? 10 : 18;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : (typeof volume === 'number' ? volume : 0.7);
    comp.connect(master); master.connect(ctx.destination);
    var len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0), b = 0;
    for (var i = 0; i < len; i++) { var w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
    startAmbience();
    return ctx;
  }

  function voice(ms) {
    if (activeVoices >= MAX_VOICES) return false;
    activeVoices++;
    setTimeout(function () { activeVoices = Math.max(0, activeVoices - 1); }, ms);
    return true;
  }

  function noise(dur, filterType, freq, q, vol, attack, when) {
    var t = (when || ctx.currentTime);
    var src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    var f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(comp);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
    return f;
  }

  function tone(freq, endFreq, dur, type, vol, when) {
    var t = (when || ctx.currentTime);
    var o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(comp); o.start(t); o.stop(t + dur + 0.05);
  }

  /** power ~0.5–3, dist 0..1 (0 = at camera) */
  function explosion(power, dist) {
    if (!ctx || muted) return;
    intensity = Math.min(1, intensity + 0.05 * (power || 1));
    var now = performance.now();
    if (now - lastBoom < 70) return;
    lastBoom = now;
    power = Math.max(0.4, Math.min(3, power || 1));
    var att = Math.max(0.08, 1 - (dist || 0));
    var dur = 0.5 + power * 0.45;
    if (!voice(dur * 1000)) return;
    var f = noise(dur, 'lowpass', 900 + power * 500, 0.8, 0.55 * att * Math.min(1.4, power), 0.004);
    f.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + dur);
    tone(85 + Math.random() * 20, 32, dur * 0.8, 'sine', 0.5 * att * Math.min(1.3, power));
    if (power > 1.4) noise(0.12, 'highpass', 2500, 0.5, 0.18 * att);
  }

  function gunfire(dist) {
    if (!ctx || muted) return;
    var now = performance.now();
    if (now - lastGun < 90) return;
    lastGun = now;
    if (!voice(200)) return;
    var att = Math.max(0.05, 1 - (dist || 0));
    var bursts = 1 + (Math.random() * 3 | 0);
    for (var i = 0; i < bursts; i++) {
      noise(0.06, 'bandpass', 1400 + Math.random() * 900, 1.2, 0.12 * att, 0.002, ctx.currentTime + i * 0.07);
    }
  }

  function jet() {
    if (!ctx || muted || !voice(2200)) return;
    var f = noise(2.0, 'bandpass', 400, 0.6, 0.16, 0.6);
    f.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 1.2);
    f.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 2.0);
  }

  function ui(kind) {
    if (!ctx || muted) return;
    if (kind === 'deny') { tone(180, 120, 0.14, 'square', 0.05); return; }
    if (kind === 'arm') { tone(660, 990, 0.09, 'triangle', 0.06); return; }
    tone(880, 1320, 0.06, 'triangle', 0.045);
  }
  function success() {
    if (!ctx || muted) return;
    [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0, 0.22, 'triangle', 0.07, ctx.currentTime + i * 0.07); });
  }
  function fail() {
    if (!ctx || muted) return;
    tone(330, 160, 0.35, 'sawtooth', 0.05); tone(247, 110, 0.45, 'triangle', 0.05, ctx.currentTime + 0.12);
  }
  function rank() {
    if (!ctx || muted) return;
    [392, 523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0, 0.35, 'triangle', 0.06, ctx.currentTime + i * 0.09); });
  }
  function radio() {
    if (!ctx || muted) return;
    noise(0.18, 'bandpass', 1800, 4, 0.08, 0.002);
    tone(1200, 900, 0.08, 'square', 0.025, ctx.currentTime + 0.18);
  }

  // Distant battle rumble — very quiet low-passed noise bed with slow swell
  function startAmbience() {
    try {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
      ambGain = ctx.createGain(); ambGain.gain.value = 0.05;
      var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      var lfoG = ctx.createGain(); lfoG.gain.value = 0.025;
      lfo.connect(lfoG); lfoG.connect(ambGain.gain);
      src.connect(f); f.connect(ambGain); ambGain.connect(comp);
      src.start(); lfo.start();
    } catch (_) {}
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (_) {}
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
    try { global.dispatchEvent(new CustomEvent('lunc-mute-change', { detail: { muted: muted } })); } catch (_) {}
  }
  function setPaused(p) {
    if (!ctx) return;
    try { if (p) ctx.suspend(); else ctx.resume(); } catch (_) {}
  }

  function unlock() { ensure(); }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    global.addEventListener(ev, unlock, { passive: true });
  });

  // v12: volume slider + basic adaptive music (low drone pad whose level follows combat intensity)
  var volume = 0.7; try { var vv = parseFloat(localStorage.getItem('luncBattle.volume')); if (vv >= 0 && vv <= 1) volume = vv; } catch (_) {}
  function setVolume(v) { volume = Math.max(0, Math.min(1, +v || 0)); try { localStorage.setItem('luncBattle.volume', String(volume)); } catch (_) {} if (master && !muted) master.gain.value = volume; }
  var music = null, intensity = 0;
  function musicOn() {
    if (music || !ensure()) return;
    var g = ctx.createGain(); g.gain.value = 0; g.connect(comp);
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.connect(g);
    [55, 82.4, 110.3].forEach(function (hz, i) { var o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = hz; o.detune.value = (i - 1) * 6; o.connect(f); o.start(); });
    music = { g: g, f: f };
  }
  function combat(amount) { intensity = Math.min(1, intensity + (amount || 0.1)); }
  setInterval(function () {
    intensity *= 0.94;
    if (!music) { if (ctx) musicOn(); return; }
    var target = muted ? 0 : 0.018 + intensity * 0.05;
    music.g.gain.setTargetAtTime(target, ctx.currentTime, 0.8);
    music.f.frequency.setTargetAtTime(380 + intensity * 900, ctx.currentTime, 0.8);
  }, 500);

  // v12.0.7: ambience beds (wind / surf / rain), Doppler jet pass, radio blip variant
  var beds = null;
  function bedsOn() {
    if (beds || !ctx) return beds;
    try {
      beds = {};
      [['wind', 'bandpass', 420, 0.5], ['surf', 'lowpass', 520, 0.6], ['rain', 'highpass', 3200, 0.4]].forEach(function (b) {
        var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = b[0] === 'rain' ? 1.3 : 0.7;
        var f = ctx.createBiquadFilter(); f.type = b[1]; f.frequency.value = b[2]; f.Q.value = b[3];
        var g = ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(comp); src.start(0, Math.random() * 1.5);
        beds[b[0]] = { g: g, f: f };
      });
      var lfo = ctx.createOscillator(); lfo.frequency.value = 0.11; var lg = ctx.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(beds.wind.f.frequency); lfo.start();   // gusts
      var lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.09; var lg2 = ctx.createGain(); lg2.gain.value = 260; lfo2.connect(lg2); lg2.connect(beds.surf.f.frequency); lfo2.start();   // waves
    } catch (_) { beds = null; }
    return beds;
  }
  function setBeds(lv) {   // levels 0..1
    if (!ctx || !bedsOn()) return;
    var k = muted ? 0 : 1, t = ctx.currentTime;
    if (lv.wind != null) beds.wind.g.gain.setTargetAtTime(0.06 * lv.wind * k, t, 0.6);
    if (lv.surf != null) beds.surf.g.gain.setTargetAtTime(0.09 * lv.surf * k, t, 0.6);
    if (lv.rain != null) beds.rain.g.gain.setTargetAtTime(0.035 * lv.rain * k, t, 0.6);
  }
  /** Doppler jet pass. pan −1..1 (start side), att 0..1 loudness, dur seconds */
  function jetPass(pan, att, dur) {
    if (!ctx || muted || !voice(3000)) return;
    dur = dur || 2.2; att = Math.max(0.05, Math.min(1, att == null ? 1 : att));
    var t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + dur * 0.45); f.frequency.exponentialRampToValueAtTime(260, t + dur);   // approach high, recede low
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * att, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(330, t + dur * 0.45); o.frequency.exponentialRampToValueAtTime(150, t + dur);   // engine whine, Doppler drop
    var og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.03 * att, t + dur * 0.45); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var out = g;
    if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan || 0)), t); p.pan.linearRampToValueAtTime(-Math.max(-1, Math.min(1, pan || 0)), t + dur); g.connect(p); og.connect(p); p.connect(comp); }
    else { g.connect(comp); og.connect(comp); }
    src.connect(f); f.connect(g); o.connect(og);
    src.start(t, Math.random()); src.stop(t + dur + 0.05); o.start(t); o.stop(t + dur + 0.05);
    intensity = Math.min(1, intensity + 0.04);
  }
  function blip(side) {
    if (!ctx || muted) return;
    var base = side < 0 ? 1350 : side > 0 ? 1050 : 1200;
    noise(0.1, 'bandpass', 2200, 5, 0.035, 0.002);
    tone(base, base * 0.92, 0.05, 'square', 0.018, ctx.currentTime + 0.1); tone(base * 1.25, 0, 0.04, 'square', 0.014, ctx.currentTime + 0.17);
  }

  /** v12.0.20 active sonar ping: a clean ~1.5 kHz tone with a long ring-out and a fainter echo, by camera distance. */
  function sonar(dist) {
    if (!ctx || muted) return;
    var k = Math.max(0, 1 - (dist || 0) / 260); if (k <= 0.02) return;
    var t = ctx.currentTime;
    tone(1510, 1480, 1.1, 'sine', 0.05 * k, t); tone(3020, 2990, 0.5, 'sine', 0.008 * k, t);
    tone(1500, 1470, 0.9, 'sine', 0.018 * k, t + 0.55);
  }

  /** Air-raid / base-under-attack siren. Respects mute, volume, pause and iOS unlock (via ensure). */
  function siren() {
    if (!ensure() || muted) return;
    if (!voice(1800)) return;
    intensity = Math.min(1, intensity + 0.12);
    var t0 = ctx.currentTime;
    // Rising/falling saw sweep through compressor/master so mute & volume apply
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(380, t0);
    o.frequency.linearRampToValueAtTime(720, t0 + 0.55);
    o.frequency.linearRampToValueAtTime(400, t0 + 1.1);
    o.frequency.linearRampToValueAtTime(680, t0 + 1.55);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.04);
    g.gain.exponentialRampToValueAtTime(0.06, t0 + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.7;
    o.connect(f); f.connect(g); g.connect(comp);
    o.start(t0); o.stop(t0 + 1.75);
    // Second harmonic for urgency
    var o2 = ctx.createOscillator(); o2.type = 'square';
    o2.frequency.setValueAtTime(190, t0);
    o2.frequency.linearRampToValueAtTime(360, t0 + 0.55);
    o2.frequency.linearRampToValueAtTime(200, t0 + 1.55);
    var g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t0);
    g2.gain.exponentialRampToValueAtTime(0.035, t0 + 0.05);
    g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);
    o2.connect(g2); g2.connect(comp);
    o2.start(t0); o2.stop(t0 + 1.75);
  }

  LB.sfx = {
    setBeds: setBeds, jetPass: jetPass, blip: blip, audio: function () { return ctx ? { ctx: ctx, comp: comp, beds: !!beds } : null; },
    setVolume: setVolume, getVolume: function () { return volume; }, combat: combat, getIntensity: function () { return intensity; },
    explosion: explosion, gunfire: gunfire, jet: jet, ui: ui, success: success, fail: fail, rank: rank, radio: radio, siren: siren, sonar: sonar,
    setMuted: setMuted, isMuted: function () { return muted; }, toggleMute: function () { setMuted(!muted); return muted; },
    setPaused: setPaused, ready: function () { return !!ctx; }
  };
})(window);
