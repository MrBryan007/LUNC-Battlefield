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
    master.gain.value = muted ? 0 : 0.7;
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
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.7, ctx.currentTime, 0.05);
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

  LB.sfx = {
    explosion: explosion, gunfire: gunfire, jet: jet, ui: ui, success: success, fail: fail, rank: rank, radio: radio,
    setMuted: setMuted, isMuted: function () { return muted; }, toggleMute: function () { setMuted(!muted); return muted; },
    setPaused: setPaused, ready: function () { return !!ctx; }
  };
})(window);
