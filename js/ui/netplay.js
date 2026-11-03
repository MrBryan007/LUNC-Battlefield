/* LUNC Battlefield v12.0.52 — online link-up, part 1 (+ v12.0.53 part 2: host's market drives both battles; v12.0.54 part 3: invite links; v12.0.55 part 4: partner view) (v12.2 Multiplayer → Online). Game layer.
 * WebRTC peer-to-peer with copy-paste signalling (no server): Host makes an invite code, Join pastes it and gets a reply
 * code, the host pastes the reply. Codes are the SDP, deflated + base64url (LO1. offer / LA1. answer; LOJ./LAJ. plain
 * where CompressionStream is missing). A public STUN server is contacted only when you press Host or Join; there's no
 * relay (TURN), so some mobile / office networks can't link, and the panel says so.
 * Once linked: partner callsign, side, score, ping, and a front comparison (each side keeps its own market data and
 * data-truth labels; host-authoritative market sync is part 2). Each side's Commander strikes are sent and shown on the
 * other screen as a cosmetic ALLY / RIVAL STRIKE (explosion FX, ring, tactical-map ping, radio line): they never score,
 * damage units or move anything. Quick signals only (preset ids), no free text. Incoming messages are validated (JSON
 * ≤ 2 KB, known types, numbers clamped to the world, names reduced to plain text) and rate-limited. ?online=0 → off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('online') !== '0' && typeof global.RTCPeerConnection === 'function';
  var hostMkt = qs.get('hostmarket') !== '0';
  var PX_S = 2, PX_QUIET_MS = 12000, SRC_LABELS = { binance: 'Binance', coingecko: 'CoinGecko', llama: 'DefiLlama', api: 'Backend API', bridge: 'Backend API', sim: 'Simulation' };
  var pview = qs.get('partnerview') !== '0', CAM_S = 1, CAM_STALE_MS = 5000, pcam = null, camIv = null;
  var HASH_KEY = 'lbjoin=', pendingInvite = null, inviteCode = '';
  var follow = true, px = { t: 0, n: 0, last: null, quiet: false }, pxIv = null;
  var VER = 1, MAX_MSG = 2048, MAX_CODE = 20000, RATE = 20, PING_S = 2, MARKET_S = 5, GATHER_MS = 3500;
  var ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
  var WORLD = { minX: -260, maxX: 260, minZ: -120, maxZ: 230 };
  var SIGNALS = { nice: 'Nice shot!', north: 'Push north', south: 'Push south', support: 'Need support', hold: 'Hold the line', gg: 'GG' };
  var ABIL = { arty: 'Artillery', air: 'Air strike', moon: 'Moon Shot', cluster: 'Cluster', emp: 'EMP', flare: 'Flare', moab: 'MOAB', cbomb: 'Carpet bomb', napalm: 'Napalm', gas: 'Gas', a10: 'A-10 run', nuke: 'Mini nuke' };
  var pc = null, ch = null, role = null, state = 'idle', el = {}, peer = null, rx = { n: 0, t: 0 }, pingIv = null, mkIv = null, pingSent = {}, marks = [];
  var stats = { sent: 0, recv: 0, dropped: 0, strikesIn: 0, strikesOut: 0, signalsIn: 0, rtt: null, last: '', bad: 0 };
  var canZip = typeof global.CompressionStream === 'function' && typeof global.DecompressionStream === 'function';

  function C() { return LB.commander; }
  function E() { return LB.engine; }
  function clamp(v, a, b, d) { v = +v; return isFinite(v) ? Math.max(a, Math.min(b, v)) : d; }
  function cleanName(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Commander'; }
  function mySide() { try { return C().getState().profile.side === 'bear' ? 'bear' : 'bull'; } catch (_) { return 'bull'; } }
  function myScore() { try { var s = C().getState().session; return s ? s.score | 0 : 0; } catch (_) { return 0; } }
  function myName() { try { var v = localStorage.getItem('luncBattle.callsign'); if (v) return cleanName(v); } catch (_) {} return 'Commander'; }

  // ---------------------------------------------------------------- codes
  function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), o = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }
  function pipe(bytes, Stream, cap) {
    var s = new Stream('deflate-raw'), w = s.writable.getWriter(); w.write(bytes).catch(function () {}); w.close().catch(function () {});
    var rd = s.readable.getReader(), parts = [], size = 0;
    function pump() { return rd.read().then(function (x) { if (x.done) return; size += x.value.length; if (cap && size > cap) { try { rd.cancel(); } catch (_) {} throw new Error('too big'); } parts.push(x.value); return pump(); }); }
    return pump().then(function () { var all = new Uint8Array(size), o = 0; parts.forEach(function (p) { all.set(p, o); o += p.length; }); return all; });
  }
  function encodeDesc(kind, desc) {
    var txt = JSON.stringify({ v: VER, t: desc.type, sdp: desc.sdp, b: (LB.config && LB.config.BUILD_META && LB.config.BUILD_META.version) || '' });
    var bytes = new TextEncoder().encode(txt), pre = kind === 'offer' ? 'LO' : 'LA';
    if (!canZip) return Promise.resolve(pre + 'J.' + b64u(bytes));
    return pipe(bytes, global.CompressionStream).then(function (z) { return pre + '1.' + b64u(z); });
  }
  function decodeDesc(code, want) {
    code = String(code || '').trim().replace(/\s+/g, '');
    var pre = want === 'offer' ? 'LO' : 'LA';
    if (code.length > MAX_CODE || code.indexOf(pre) !== 0 || !/^L[OA][1J]\.[A-Za-z0-9_-]+$/.test(code)) return Promise.resolve(null);
    var zipped = code.charAt(2) === '1';
    return Promise.resolve().then(function () {
      var bytes = unb64u(code.slice(4));
      if (!zipped) return bytes; if (!canZip) throw new Error('no zip');
      return pipe(bytes, global.DecompressionStream, 60000);
    }).then(function (b) {
      var j = JSON.parse(new TextDecoder().decode(b));
      if (!j || j.v !== VER || j.t !== want || typeof j.sdp !== 'string' || j.sdp.length > 50000 || j.sdp.indexOf('v=0') !== 0) return null;
      return { type: j.t, sdp: j.sdp, build: String(j.b || '').replace(/[^A-Za-z0-9.]/g, '').slice(0, 12) };
    }).catch(function () { return null; });
  }
  function gathered(p) {
    return new Promise(function (res) {
      if (p.iceGatheringState === 'complete') return res();
      var done = false, fin = function () { if (!done) { done = true; res(); } };
      p.addEventListener('icegatheringstatechange', function () { if (p.iceGatheringState === 'complete') fin(); });
      setTimeout(fin, GATHER_MS);   // STUN may be unreachable: go with the candidates we have
    });
  }

  // ---------------------------------------------------------------- connection
  function newPc() {
    close(true);
    pc = new global.RTCPeerConnection({ iceServers: ICE });
    pc.addEventListener('connectionstatechange', function () {
      var s = pc && pc.connectionState;
      if (s === 'failed') setState('failed', 'Could not link. One of the networks blocks direct connections (no relay server).');
      else if (s === 'disconnected' || s === 'closed') { if (state === 'linked') setState('lost', 'Partner disconnected'); }
    });
    return pc;
  }
  function host() {
    if (!enabled) return Promise.resolve(null);
    newPc(); role = 'host'; setState('making', 'Making an invite…');
    wire(pc.createDataChannel('lunc', { ordered: true }));
    return pc.createOffer().then(function (o) { return pc.setLocalDescription(o); }).then(function () { return gathered(pc); })
      .then(function () { return encodeDesc('offer', pc.localDescription); })
      .then(function (code) { inviteCode = code; setState('invite', 'Step 1 of 3: send this invite (code or link) to your partner. Step 3: paste their reply code below.'); showCode(code); return code; })
      .catch(function (e) { setState('failed', 'Could not make an invite (' + String(e && e.name || e).slice(0, 40) + ')'); return null; });
  }
  function join(code) {
    if (!enabled) return Promise.resolve(null);
    return decodeDesc(code, 'offer').then(function (d) {
      if (!d) { setState('idle', 'That is not a LUNC Battlefield invite code'); return null; }
      newPc(); role = 'guest'; setState('making', 'Making your reply…');
      pc.addEventListener('datachannel', function (ev) { if (ev.channel && ev.channel.label === 'lunc') wire(ev.channel); });
      return pc.setRemoteDescription({ type: 'offer', sdp: d.sdp }).then(function () { return pc.createAnswer(); }).then(function (a) { return pc.setLocalDescription(a); })
        .then(function () { return gathered(pc); }).then(function () { return encodeDesc('answer', pc.localDescription); })
        .then(function (rc) { setState('reply', 'Step 2 of 3: send this reply code back to the host. You link up as soon as they paste it.' + (d.build && d.build !== build() ? ' (They run ' + d.build + ', you run ' + build() + '.)' : '')); showCode(rc); return rc; });
    }).catch(function (e) { setState('failed', 'Could not answer that invite (' + String(e && e.name || e).slice(0, 40) + ')'); return null; });
  }
  function accept(code) {
    if (!pc || role !== 'host') return Promise.resolve(false);
    return decodeDesc(code, 'answer').then(function (d) {
      if (!d) { say('That is not a reply code for this invite'); return false; }
      setState('linking', 'Linking…');
      return pc.setRemoteDescription({ type: 'answer', sdp: d.sdp }).then(function () { return true; });
    }).catch(function (e) { setState('failed', 'Could not use that reply (' + String(e && e.name || e).slice(0, 40) + ')'); return false; });
  }
  function build() { return (LB.config && LB.config.BUILD_META && LB.config.BUILD_META.version) || ''; }
  function wire(c) {
    ch = c;
    ch.addEventListener('open', function () {
      setState('linked', 'Linked'); hideCode(); send({ k: 'hello', v: VER, name: myName(), side: mySide(), b: build() });
      clearInterval(pingIv); clearInterval(mkIv);
      pingIv = setInterval(function () { var id = Math.floor(Math.random() * 1e9); pingSent[id] = performance.now(); send({ k: 'ping', id: id }); Object.keys(pingSent).forEach(function (k) { if (performance.now() - pingSent[k] > 10000) delete pingSent[k]; }); }, PING_S * 1000);
      mkIv = setInterval(sendMarket, MARKET_S * 1000); sendMarket();
      clearInterval(camIv); if (pview) { camIv = setInterval(sendCam, CAM_S * 1000); sendCam(); }
      clearInterval(pxIv); if (role === 'host' && hostMkt) { pxIv = setInterval(sendPx, PX_S * 1000); sendPx(); }
    });
    ch.addEventListener('close', function () { if (state === 'linked') setState('lost', 'Partner left'); stopTimers(); });
    ch.addEventListener('message', function (ev) { onMsg(ev.data); });
  }
  function stopTimers() { clearInterval(pingIv); clearInterval(mkIv); clearInterval(pxIv); clearInterval(camIv); pingIv = mkIv = pxIv = camIv = null; pcam = null; release(null); }
  function close(silent) {
    stopTimers(); try { if (ch && ch.readyState === 'open') ch.send(JSON.stringify({ k: 'bye' })); } catch (_) {}
    try { if (ch) ch.close(); } catch (_) {} try { if (pc) pc.close(); } catch (_) {}
    ch = null; pc = null; peer = null; role = null; inviteCode = ''; if (!silent) { setState('idle', 'Link closed'); hideCode(); }
  }
  function send(o) { if (!ch || ch.readyState !== 'open') return false; try { ch.send(JSON.stringify(o)); stats.sent++; return true; } catch (_) { return false; } }
  function sendMarket() {
    var e = E(); if (!e) return;
    send({ k: 'mk', fx: +(e.getFrontlineX() || 0).toFixed(2), live: !!(e.isPriceLive && e.isPriceLive()), sc: myScore(), side: mySide() });
  }

  // ---------------------------------------------------------------- v12.0.53 host market (host → guest)
  function sendPx() {
    var e = E(); if (!e || role !== 'host' || !e.getPrice) return;
    var src = e.getPriceSource ? e.getPriceSource() : 'sim';
    var r = e.getDisplayedRange ? e.getDisplayedRange() : null;
    send({ k: 'px', tok: e.getToken(), p: e.getPrice(), live: !!(e.isPriceLive && e.isPriceLive()), src: SRC_LABELS[src] ? src : 'sim', lo: r ? r.low : 0, hi: r ? r.high : 0 });
  }
  function tokenKnown(t) { return typeof t === 'string' && /^[A-Z]{2,8}$/.test(t) && !!doc.querySelector('.token-btn[data-token="' + t + '"]'); }
  function onPx(m) {
    if (role !== 'guest' || !hostMkt) { stats.bad++; return; }
    var e = E(); if (!e || !e.pushRemoteSpot) return;
    if (!tokenKnown(m.tok)) { stats.bad++; return; }
    var base = e.getTokenBase ? e.getTokenBase(m.tok) : 0, p = +m.p;
    if (!(base > 0) || !isFinite(p) || p < base * 0.05 || p > base * 20) { stats.bad++; return; }
    var src = SRC_LABELS[m.src] ? m.src : 'sim', live = !!m.live && src !== 'sim';
    var lo = +m.lo, hi = +m.hi; if (!(isFinite(lo) && isFinite(hi) && lo > 0 && hi > lo)) lo = hi = 0;
    px.last = { tok: m.tok, p: p, live: live, label: SRC_LABELS[src], lo: lo, hi: hi }; px.t = performance.now(); px.n++;
    if (!follow) return;
    if (e.getToken() !== m.tok) { var b = doc.querySelector('.token-btn[data-token="' + m.tok + '"]'); if (b) b.click(); say('Switched to ' + m.tok + ' to match the host'); }
    if (!e.isRemoteMarket()) { e.setRemoteMarket(true); if (px.quiet) say('Following the host\'s market again'); px.quiet = false; }
    e.pushRemoteSpot(p, live, SRC_LABELS[src], lo, hi);
  }
  function release(msg) { var e = E(); if (e && e.isRemoteMarket && e.isRemoteMarket()) { e.setRemoteMarket(false); if (msg) say(msg); } }
  function setFollow(on) { follow = !!on; if (!follow) release('Back on your own market feed'); else if (px.last && performance.now() - px.t < PX_QUIET_MS) onPx({ tok: px.last.tok, p: px.last.p, live: px.last.live, lo: px.last.lo, hi: px.last.hi, src: Object.keys(SRC_LABELS).filter(function (k) { return SRC_LABELS[k] === px.last.label; })[0] || 'sim' }); render(); }
  function pxWatch() {
    var e = E(); if (!e || !e.isRemoteMarket || !e.isRemoteMarket()) return;
    if (state !== 'linked') { release(null); return; }
    if (performance.now() - px.t > PX_QUIET_MS) { px.quiet = true; release('Host\'s market went quiet, back on your own feed'); }
  }

  // ---------------------------------------------------------------- v12.0.55 partner view (both ways)
  function r1(v) { return Math.round(v * 10) / 10; }
  function sendCam() {
    var e = E(); if (!e || !e.camera || !e.getCameraTarget) return;
    var T = e.getCameraTarget(), P = e.camera.position;
    send({ k: 'cam', cx: r1(P.x), cz: r1(P.z), tx: r1(T.x), tz: r1(T.z) });
  }
  function onCam(m) {
    if (!pview || state !== 'linked') return;
    var W = WORLD, pad = 200;
    var v = { cx: clamp(m.cx, W.minX - pad, W.maxX + pad, 0), cz: clamp(m.cz, W.minZ - pad, W.maxZ + pad, 0), tx: clamp(m.tx, W.minX, W.maxX, 0), tz: clamp(m.tz, W.minZ, W.maxZ, 0), t: performance.now() };
    var trail = pcam ? pcam.trail : [];
    if (!pcam || Math.hypot(v.tx - pcam.tx, v.tz - pcam.tz) > 4) { trail.push({ x: v.tx, z: v.tz, t: v.t }); if (trail.length > 6) trail.shift(); }
    v.trail = trail; pcam = v; stats.camIn = (stats.camIn || 0) + 1;
  }
  /** for the tactical map: the partner's view (fresh only), plus whether they're an ally */
  function partnerView() {
    if (!pview || state !== 'linked' || !pcam || performance.now() - pcam.t > CAM_STALE_MS) return null;
    return { cx: pcam.cx, cz: pcam.cz, tx: pcam.tx, tz: pcam.tz, trail: pcam.trail.slice(), name: peer ? peer.name : 'Partner', ally: !!(peer && peer.side === mySide()) };
  }
  function lookWithPartner() {
    var v = partnerView(), e = E(); if (!v || !e) { say('Your partner\'s view isn\'t coming through yet'); return false; }
    try { if (e.focusWorld) e.focusWorld(v.tx, v.tz, true); else if (e.controls) { e.controls.target.set(v.tx, 0.5, v.tz); e.controls.update(); } } catch (_) {}
    try { if (e.notifyUserInput) e.notifyUserInput(); } catch (_) {}
    say('Looking where ' + v.name + ' is looking (' + Math.round(v.tx) + ', ' + Math.round(v.tz) + ')'); return true;
  }

  // ---------------------------------------------------------------- incoming (untrusted)
  function onMsg(data) {
    var now = performance.now();
    if (now - rx.t > 1000) { rx.t = now; rx.n = 0; }
    if (++rx.n > RATE) { stats.dropped++; return; }
    if (typeof data !== 'string' || data.length > MAX_MSG) { stats.bad++; return; }
    var m; try { m = JSON.parse(data); } catch (_) { stats.bad++; return; }
    if (!m || typeof m !== 'object' || typeof m.k !== 'string') { stats.bad++; return; }
    stats.recv++; peer = peer || { name: 'Partner', side: 'bull', score: 0, fx: null, live: false, b: '' };
    switch (m.k) {
      case 'hello': peer.name = cleanName(m.name); peer.side = m.side === 'bear' ? 'bear' : 'bull'; peer.b = String(m.b || '').replace(/[^A-Za-z0-9.]/g, '').slice(0, 12); say(peer.name + ' linked up (' + (peer.side === 'bull' ? 'Bulls' : 'Bears') + ')'); radio(peer.name + ' on the net, commanding ' + (peer.side === 'bull' ? 'Bulls' : 'Bears') + '.'); break;
      case 'ping': send({ k: 'pong', id: clamp(m.id, 0, 1e9, 0) | 0 }); break;
      case 'pong': var t0 = pingSent[m.id | 0]; if (t0) { stats.rtt = Math.round(performance.now() - t0); delete pingSent[m.id | 0]; } break;
      case 'mk': peer.fx = clamp(m.fx, WORLD.minX, WORLD.maxX, 0); peer.live = !!m.live; peer.score = clamp(m.sc, 0, 1e9, 0) | 0; peer.side = m.side === 'bear' ? 'bear' : 'bull'; break;
      case 'strike': if (ABIL[m.a]) { stats.strikesIn++; showStrike(m.a, clamp(m.x, WORLD.minX, WORLD.maxX, 0), clamp(m.z, WORLD.minZ, WORLD.maxZ, 0)); } else stats.bad++; break;
      case 'sig': if (SIGNALS[m.id]) { stats.signalsIn++; say(peer.name + ': ' + SIGNALS[m.id]); radio(peer.name + ': ' + SIGNALS[m.id]); } else stats.bad++; break;
      case 'px': onPx(m); break;
      case 'cam': onCam(m); return;   // 1/s, no re-render needed
      case 'bye': setState('lost', (peer.name || 'Partner') + ' left'); stopTimers(); break;
      default: stats.bad++;
    }
    render();
  }
  function radio(text) { try { if (LB.voice && LB.voice.say) LB.voice.say({ pri: 2, side: peer && peer.side === 'bear' ? 1 : -1, text: text, tag: 'LINK' }); } catch (_) {} }
  function showStrike(a, x, z) {
    var ally = peer && peer.side === mySide(), e = E(), label = (ally ? 'ALLY' : 'RIVAL') + ' STRIKE · ' + ABIL[a];
    try { if (e && e.effects && e.effects.explosion) e.effects.explosion(x, z, { power: a === 'nuke' || a === 'moab' ? 2.2 : a === 'arty' ? 1.1 : 1.4, color: ally ? 0x9fd8ff : 0xff9a7a }); } catch (_) {}
    try { if (LB.sfx && LB.sfx.explosion) LB.sfx.explosion(0.7, null, { x: x, y: 0.5, z: z }); } catch (_) {}
    try { if (LB.tacmap && LB.tacmap.ping) LB.tacmap.ping(x, z); } catch (_) {}
    ring(x, z, ally);
    radio((peer ? peer.name : 'Partner') + ': ' + ABIL[a] + ' at ' + Math.round(x) + ', ' + Math.round(z) + '.');
    stats.last = label + ' at ' + Math.round(x) + ', ' + Math.round(z);
  }
  function ring(x, z, ally) {
    var e = E(), T = e && e.THREE; if (!T || !e.scene) return;
    var y = 0; try { y = e.terrainHeight(x, z) || 0; } catch (_) {}
    var m = new T.Mesh(new T.RingGeometry(5, 6, 40), new T.MeshBasicMaterial({ color: ally ? 0x7cc8ff : 0xff6b5a, transparent: true, opacity: 0.85, side: T.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.3, z); m.renderOrder = 5; m.name = 'netplay-ring'; e.scene.add(m);
    marks.push({ m: m, t: performance.now() });
    if (marks.length > 6) dropMark(marks.shift());
  }
  function dropMark(k) { try { k.m.parent && k.m.parent.remove(k.m); k.m.geometry.dispose(); k.m.material.dispose(); } catch (_) {} }
  function tickMarks() {
    var now = performance.now();
    for (var i = marks.length - 1; i >= 0; i--) { var k = marks[i], a = (now - k.t) / 4000; if (a >= 1) { dropMark(k); marks.splice(i, 1); continue; } k.m.material.opacity = 0.85 * (1 - a); var s = 1 + a * 1.6; k.m.scale.set(s, s, s); }
  }

  // ---------------------------------------------------------------- outgoing hooks
  function strike(a, x, z) { if (state !== 'linked' || !ABIL[a]) return false; stats.strikesOut++; return send({ k: 'strike', a: a, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 }); }
  function signal(id) { if (!SIGNALS[id] || state !== 'linked') return false; say('You: ' + SIGNALS[id]); return send({ k: 'sig', id: id }); }

  // ---------------------------------------------------------------- UI
  function setState(s, msg) { state = s; if (msg != null) stats.last = msg; render(); }
  function say(t) { stats.last = t; render(); }
  function showCode(code) { if (!el.code) return; el.codeRow.hidden = false; el.code.value = code; el.codeLen.textContent = (code.length / 1024).toFixed(1) + ' KB'; try { el.code.select(); } catch (_) {} }
  function hideCode() { if (el.codeRow) { el.codeRow.hidden = true; el.code.value = ''; } }
  function inviteUrl() { return inviteCode ? global.location.origin + global.location.pathname + '#' + HASH_KEY + inviteCode : ''; }
  function shareLink() {
    var u = inviteUrl(); if (!u || role !== 'host' || state !== 'invite') return;
    var coarse = false; try { coarse = global.matchMedia('(pointer: coarse)').matches; } catch (_) {}
    if (coarse && global.navigator.share) { global.navigator.share({ title: 'Join my LUNC Battlefield link-up', url: u }).then(function () { say('Invite link shared. Paste their reply code below when it comes back.'); }, function () {}); return; }
    try { if (global.navigator.clipboard && global.navigator.clipboard.writeText) { global.navigator.clipboard.writeText(u).then(function () { say('Invite link copied. Paste their reply code below when it comes back.'); }, function () { el.code.value = u; el.code.select(); say('Select the link and copy it'); }); return; } } catch (_) {}
    el.code.value = u; el.code.select(); say('Select the link and copy it');
  }
  /** on load / hashchange: #lbjoin=LO1... → strip it from the address bar, then offer Join (nothing is contacted until Join now) */
  function inviteFromHash() {
    var h = String(global.location.hash || ''), at = h.indexOf(HASH_KEY);
    if (at < 0) return Promise.resolve(false);
    var code = h.slice(at + HASH_KEY.length).split('&')[0];
    try { global.history.replaceState(null, '', global.location.pathname + global.location.search); } catch (_) {}
    return decodeDesc(code, 'offer').then(function (d) {
      if (!d) { pendingInvite = null; say('That invite link is broken or incomplete. Ask your partner for a new one.'); openPanel(); return false; }
      if (state === 'linked') { say('You are already linked. Disconnect first to join another invite.'); openPanel(); return false; }
      pendingInvite = code; say('You have been invited to an online link-up' + (d.build && d.build !== build() ? ' (they run ' + d.build + ', you run ' + build() + ')' : '') + '.'); openPanel(); return true;
    });
  }
  function openPanel() { render(); try { if (LB.dock && LB.dock.open) LB.dock.open('command'); } catch (_) {} try { if (el.p) el.p.scrollIntoView({ block: 'start' }); } catch (_) {} }
  function joinInvite() { var c = pendingInvite; pendingInvite = null; render(); if (c) return join(c); return Promise.resolve(null); }
  function copyCode() {
    var v = el.code.value; if (!v) return;
    var coarse = false; try { coarse = global.matchMedia('(pointer: coarse)').matches; } catch (_) {}
    if (coarse && global.navigator.share) { global.navigator.share({ title: 'LUNC Battlefield link-up code', text: v }).then(function () { say('Code shared'); }, function () {}); return; }
    try { if (global.navigator.clipboard && global.navigator.clipboard.writeText) { global.navigator.clipboard.writeText(v).then(function () { say('Code copied'); }, function () { el.code.select(); say('Select the code and copy it'); }); return; } } catch (_) {}
    el.code.select(); say('Select the code and copy it');
  }
  function buildUi() {
    var p = el.p = doc.createElement('div'); p.id = 'netplayPanel'; p.className = 'supply-panel np-panel';
    p.innerHTML = '<div class="th-title">ONLINE LINK-UP <span class="qual sim">BETA · P2P</span></div>' +
      '<div class="me-row"><input id="npName" maxlength="16" placeholder="Your callsign" aria-label="Your callsign"><button type="button" id="npHost" class="me-go">Host</button><button type="button" id="npClose">Disconnect</button></div>' +
      '<div class="me-row"><input id="npPaste" placeholder="Paste an invite or reply code" aria-label="Invite or reply code"><button type="button" id="npUse">Use code</button></div>' +
      '<div id="npInvite" class="np-invite" hidden><b>You\'ve been invited to an online link-up</b><span>Joining makes a reply code to send back. A public STUN server is contacted only when you press Join now.</span><div class="me-row"><button type="button" id="npJoinNow" class="me-go">Join now</button><button type="button" id="npNotNow">Not now</button></div></div>' +
      '<div id="npCodeRow" class="np-code" hidden><textarea id="npCode" readonly rows="3" aria-label="Your code"></textarea><div class="me-row"><button type="button" id="npCopy">Copy code</button><button type="button" id="npShareLink" class="me-go" hidden>Share invite link</button><small id="npCodeLen"></small></div></div>' +
      '<div id="npLink" class="np-link"></div>' +
      '<div id="npSig" class="np-sig"></div>' +
      '<div class="me-row"><button type="button" id="npLook" hidden>Look with partner</button></div>' +
      '<label id="npFollowRow" class="np-follow" hidden><input type="checkbox" id="npFollow" checked> Follow the host\'s market (same price, same front)</label>' +
      '<div id="npStatus" class="sup-status"></div>' +
      '<div class="th-note">Direct link between two browsers, no game server: codes go by any messenger. A public STUN server is asked for your address only when you press Host or use a code. There is no relay, so some mobile or office networks can\'t link. The guest can follow the host\'s market (same price and front, labelled VIA HOST); partner strikes are shown as cosmetic ALLY / RIVAL STRIKES and never score or change your battle.</div>';
    var host2 = doc.querySelector('#sheet-command .sheet-body') || doc.querySelector('.sheet-command .sheet-body') || doc.body, rp = doc.getElementById('replayPanel');
    if (rp && rp.parentNode === host2) host2.insertBefore(p, rp.nextSibling); else host2.appendChild(p);
    ['npName', 'npHost', 'npClose', 'npPaste', 'npUse', 'npCodeRow', 'npCode', 'npCopy', 'npCodeLen', 'npLink', 'npSig', 'npStatus', 'npFollowRow', 'npFollow', 'npInvite', 'npJoinNow', 'npNotNow', 'npShareLink', 'npLook'].forEach(function (id) { el[id.replace(/^np/, '').replace(/^./, function (c) { return c.toLowerCase(); })] = p.querySelector('#' + id); });
    el.name.value = myName() === 'Commander' ? '' : myName();
    el.name.addEventListener('change', function () { var n = cleanName(el.name.value); el.name.value = n; try { localStorage.setItem('luncBattle.callsign', n); } catch (_) {} });
    el.host.addEventListener('click', function () { host(); });
    el.close.addEventListener('click', function () { close(false); });
    el.use.addEventListener('click', function () { var v = el.paste.value.trim(); el.paste.value = ''; if (/^LA/.test(v)) accept(v); else join(v); });
    el.copy.addEventListener('click', copyCode);
    el.shareLink.addEventListener('click', shareLink);
    el.look.addEventListener('click', lookWithPartner);
    el.joinNow.addEventListener('click', joinInvite);
    el.notNow.addEventListener('click', function () { pendingInvite = null; say('Invite ignored'); });
    if (el.follow) el.follow.addEventListener('change', function () { setFollow(el.follow.checked); });
    Object.keys(SIGNALS).forEach(function (id) { var b = doc.createElement('button'); b.type = 'button'; b.textContent = SIGNALS[id]; b.setAttribute('data-sig', id); b.addEventListener('click', function () { signal(id); }); el.sig.appendChild(b); });
    render();
  }
  function render() {
    if (!el.p) return;
    var linked = state === 'linked';
    el.close.disabled = !pc; el.host.disabled = state === 'making' || linked;
    el.sig.hidden = !linked;
    if (el.invite) el.invite.hidden = !pendingInvite;
    if (el.look) el.look.hidden = !(linked && pview);
    if (el.shareLink) el.shareLink.hidden = !(role === 'host' && state === 'invite' && inviteCode);
    if (el.followRow) { el.followRow.hidden = !(linked && role === 'guest' && hostMkt); el.follow.checked = follow; }
    el.link.textContent = '';
    if (linked && peer) {
      var e = E(), fx = e ? e.getFrontlineX() || 0 : 0, live = !!(e && e.isPriceLive && e.isPriceLive()), sg = function (v) { return (v >= 0 ? '+' : '') + v.toFixed(1); };
      var rows = [['Partner', peer.name + ' · ' + (peer.side === 'bull' ? 'Bulls' : 'Bears') + (peer.side === mySide() ? ' (ally)' : ' (rival)') + ' · score ' + peer.score.toLocaleString()],
        ['Link', (role === 'host' ? 'You host' : 'You joined') + ' · ping ' + (stats.rtt != null ? stats.rtt + ' ms' : '…')],
        ['Market', mktText()],
        ['Front', 'You ' + sg(fx) + ' ' + (live ? 'LIVE' : 'SIMULATED') + ' · Partner ' + (peer.fx != null ? sg(peer.fx) + ' ' + (peer.live ? 'LIVE' : 'SIMULATED') : '…')]];
      rows.forEach(function (r) { var d = doc.createElement('div'); d.className = 'rp-rrow'; var b = doc.createElement('b'); b.textContent = r[0]; var s = doc.createElement('span'); s.textContent = r[1]; d.appendChild(b); d.appendChild(s); el.link.appendChild(d); });
    }
    el.status.textContent = (state === 'idle' && !stats.last ? 'Host a link, or paste an invite code from a partner' : stats.last) + (stats.strikesIn ? ' · ' + stats.strikesIn + ' partner strikes' : '');
  }
  function mktText() {
    var e = E();
    if (role === 'host') return hostMkt ? 'You share your market (' + (e ? e.getToken() : '') + ') with your partner' : 'Not shared (?hostmarket=0)';
    if (!hostMkt) return 'Your own feed (?hostmarket=0)';
    if (e && e.isRemoteMarket && e.isRemoteMarket() && px.last) return 'Following host · ' + px.last.tok + ' · ' + (px.last.live ? 'LIVE · ' + px.last.label : 'SIMULATED');
    return follow ? (px.quiet ? 'Host quiet, your own feed' : 'Waiting for the host\'s market…') : 'Your own feed';
  }
  function init() {
    if (!enabled) return;
    var tries = 0, iv = setInterval(function () {
      var h = doc.querySelector('#sheet-command .sheet-body') || doc.querySelector('.sheet-command .sheet-body');
      if ((h && (doc.getElementById('replayPanel') || tries > 6)) || ++tries > 120) { clearInterval(iv); try { buildUi(); } catch (e) { console.warn('[netplay] ui', e); } inviteFromHash(); setInterval(function () { if (state === 'linked') render(); }, 2000); }
    }, 500);
    setInterval(pxWatch, 1000);
    (function loop() { try { if (marks.length) tickMarks(); } catch (_) {} requestAnimationFrame(loop); })();
    global.addEventListener('pagehide', function () { if (pc) close(true); });
    global.addEventListener('hashchange', function () { if (el.p && String(global.location.hash).indexOf(HASH_KEY) >= 0) inviteFromHash(); });
  }
  LB.netplay = {
    version: 'v12.0.55', isEnabled: function () { return enabled; }, host: host, join: join, accept: accept, setFollow: setFollow, partnerView: partnerView, lookWithPartner: lookWithPartner, inviteUrl: inviteUrl, joinInvite: joinInvite, _fromHash: inviteFromHash, close: function () { close(false); }, strike: strike, signal: signal,
    _onMsg: onMsg, decode: decodeDesc,
    getState: function () { return { enabled: enabled, state: state, role: role, peer: peer ? Object.assign({}, peer) : null, rings: marks.length, invite: !!pendingInvite, follow: follow, following: !!(E() && E().isRemoteMarket && E().isRemoteMarket()), px: px.last ? Object.assign({ n: px.n }, px.last) : null, stats: Object.assign({}, stats) }; }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(window);
