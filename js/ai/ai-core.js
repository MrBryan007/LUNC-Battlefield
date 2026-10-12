/* LUNC Battlefield — AI Phase 1 (v11.2-ai): faction blackboard, message bus, staggered
 * unit brains, officers / chain of command, dynamic quests, War Room "AI Ops" panel.
 *
 * Rules: everything here is SIMULATED and cosmetic. It never writes price, walls, momentum,
 * targetX/frontline, army counts or DataTruth. Brains only output a small depth offset and a
 * lateral (z) target; battle-engine applies them BEFORE its existing frontline clamp, so the
 * market-driven front still decides where each army can stand.
 * Toggle: ?ai=0 or LUNCBattle.ai.setEnabled(false). Officer labels: MEDIUM+ tiers.
 */
(function (window) {
  'use strict';
  var LB = window.LUNCBattle = window.LUNCBattle || {};
  var qs = new URLSearchParams(window.location.search);
  var enabled = qs.get('ai') !== '0';
  var E = function () { return LB.engine; };

  // ---------- tier budgets ----------
  var TIERS = {
    LOW:    { snipers: 1, hz: 4,  perFrame: 24,  officers: 3, quests: 1, labels: false, markers: false },
    MEDIUM: { snipers: 4, hz: 6,  perFrame: 48,  officers: 5, quests: 2, labels: true,  markers: true },
    HIGH:   { snipers: 8, hz: 8,  perFrame: 96,  officers: 8, quests: 3, labels: true,  markers: true },
    ULTRA:  { snipers: 12, hz: 10, perFrame: 160, officers: 10, quests: 3, labels: true, markers: true }
  };
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (e) { return 'MEDIUM'; } }
  function tier() { return TIERS[tierName()] || TIERS.MEDIUM; }
  // v12: optional advice from the adaptive layer (js/learn/learn.js). Cosmetic only; null when absent / ?learn=0.
  var _adv = null, _advT = 0;
  function advice() {
    var t = performance.now();
    if (t - _advT > 5000) { _advT = t; try { _adv = LB.learn && LB.learn.isEnabled && LB.learn.isEnabled() && LB.learn.getAdvice ? LB.learn.getAdvice() : null; } catch (e) { _adv = null; } }
    return _adv;
  }
  function weightedPick(keys, w) {
    var sum = 0, i; for (i = 0; i < keys.length; i++) sum += Math.max(0, w[keys[i]] || 0);
    if (!(sum > 0)) return keys[(Math.random() * keys.length) | 0];
    var r = Math.random() * sum; for (i = 0; i < keys.length; i++) { r -= Math.max(0, w[keys[i]] || 0); if (r <= 0) return keys[i]; }
    return keys[keys.length - 1];
  }

  var RANKS = ['Sergeant', 'Lieutenant', 'Captain', 'Major', 'Colonel'];
  var ALIAS = { Sergeant: 'Staker', Lieutenant: 'Delegator', Captain: 'Validator', Major: 'Whale', Colonel: 'Governor' };
  var INSIG = ['▲', '▲▲', '◆', '★', '★★'];
  var STRATS = ['PUSH', 'HOLD', 'FLANK', 'FALL BACK'];
  var Z_LIM = 15;

  // ---------- spatial hash (rebuilt each think round) ----------
  function SpatialHash(cell) { this.cell = cell; this.map = new Map(); }
  SpatialHash.prototype.clear = function () { this.map.clear(); };
  SpatialHash.prototype.key = function (x, z) { return ((Math.floor(x / this.cell) + 512) << 10) | (Math.floor(z / this.cell) + 512); };
  SpatialHash.prototype.add = function (u) {
    var k = this.key(u.position.x, u.position.z), b = this.map.get(k);
    if (!b) { b = []; this.map.set(k, b); } b.push(u);
  };
  SpatialHash.prototype.query = function (x, z, r, out) {
    out.length = 0; var c = this.cell, r2 = r * r;
    for (var gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (var gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
        var b = this.map.get(((gx + 512) << 10) | (gz + 512)); if (!b) continue;
        for (var i = 0; i < b.length; i++) { var p = b[i].position, dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz <= r2) out.push(b[i]); }
      }
    return out;
  };
  var hash = new SpatialHash(4);
  var _q = [];

  // ---------- blackboard + bus ----------
  function mkBoard(side) {
    return { side: side, strategy: 'HOLD', stratSince: 0, threatZ: 0, threatT: -99, flankZ: side < 0 ? 9 : -9,
      morale: 0.8, size: 0, officers: [], quests: [], colonel: null };
  }
  var boards = { '-1': mkBoard(-1), '1': mkBoard(1) };
  var bus = [];      // {t, side, type, from, to, text, x, z}
  var chatter = [];  // display lines
  var listeners = [];
  function nowS() { return performance.now() * 0.001; }
  function rankName(u) { var r = u.userData.aiRank; return r == null ? 'Private' : RANKS[r]; }
  function callsign(u) { return (u.userData.side < 0 ? 'BULL-' : 'BEAR-') + rankName(u).slice(0, 3).toUpperCase() + '-' + ((u.userData.index | 0) % 100); }
  function send(msg) {
    msg.t = nowS(); bus.push(msg); if (bus.length > 60) bus.shift();
    for (var i = 0; i < listeners.length; i++) try { listeners[i](msg); } catch (e) {}
    if (msg.text) { chatter.unshift({ t: msg.t, side: msg.side, text: msg.text }); if (chatter.length > 8) chatter.pop(); uiDirty = true; }
  }

  // ---------- brains ----------
  function brain(u) {
    var ud = u.userData;
    if (!ud.ai) ud.ai = { st: 'HOLD', offX: 0, z: ud.home ? ud.home.z : u.position.z, rate: 0.6, born: nowS(), vet: 0,
      patrolPh: Math.random() * 6.28, next: 0, quest: null, leader: null, morale: 0.8 };
    return ud.ai;
  }
  function homeZ(u) { return u.userData.home ? u.userData.home.z : 0; }
  function think(u, side, b, t) {
    var a = brain(u), type = u.userData.type | 0;
    a.vet += 1 / tier().hz;
    var hz = homeZ(u);
    // leader aura: morale + cohesion
    var L = a.leader && a.leader.parent ? a.leader : null;
    a.morale += ((L ? 0.95 : 0.7) * b.morale - a.morale) * 0.2;
    var st = 'HOLD';
    if (a.quest && a.quest.active) st = 'QUEST';
    else if (a.morale < 0.35) st = 'RETREAT';
    else if (b.strategy === 'PUSH') st = type === 2 ? 'HOLD' : 'ADVANCE';
    else if (b.strategy === 'FALL BACK') st = a.morale < 0.55 ? 'RETREAT' : 'REGROUP';
    else if (b.strategy === 'FLANK') st = (type !== 2 && Math.abs(hz - b.flankZ) < 8) ? 'FLANK' : 'PATROL';
    else st = (t - b.threatT < 6 && type === 0) ? 'SUPPORT' : 'PATROL';
    a.st = st;
    var tz = hz, off = 0, rate = 0.5;
    switch (st) {
      case 'ADVANCE': off = -1.5 - a.morale; tz = hz * 0.9; rate = 0.8; break;           // closer to front (clamp still applies)
      case 'FLANK':   off = -1.0; tz = b.flankZ + (hz - b.flankZ) * 0.35; rate = 0.9; break;
      case 'SUPPORT': off = -0.6; tz = hz + (b.threatZ - hz) * 0.45; rate = 1.0; break;
      case 'RETREAT': off = 3.5; tz = hz * 0.6; rate = 1.1; break;
      case 'REGROUP': off = 1.6; tz = L ? L.position.z + (hz - homeZ(L)) * 0.5 : hz; rate = 0.7; break;
      case 'QUEST':   off = a.quest.offX; tz = a.quest.z + (hz % 3); rate = 0.9; break;
      default:        off = Math.sin(t * 0.3 + a.patrolPh) * 0.8; tz = hz + Math.sin(t * 0.17 + a.patrolPh) * 2.6; rate = 0.35; // patrol
    }
    if (L && st !== 'QUEST' && st !== 'RETREAT') tz = tz * 0.7 + (L.position.z + (hz - homeZ(L)) * 0.6) * 0.3;
    if (a.sniper) { thinkSniper(u, a, side, b, t); return; }
    if (type === 2) { off *= 0.25; tz = hz + (tz - hz) * 0.3; }  // batteries mostly hold
    a.offX = off; a.z = Math.max(-Z_LIM, Math.min(Z_LIM, tz)); a.rate = rate * (L ? 1.15 : 1);
  }

  // Engine hook: called per ground unit per frame. Cheap: reads cached brain output.
  function steer(u, side, targetX, dt) {
    if (!enabled || !u.userData.ai) return null;
    var a = u.userData.ai;
    a._o = a._o || { dx: 0, z: 0, rate: 0 };
    a._o.dx = side * a.offX; a._o.z = a.z; a._o.rate = a.rate;
    return a._o;
  }


  // ---------- snipers (Phase 1: designated marksmen on terrain high points) ----------
  // Perches = highest terrain samples on OUR side of the market front (re-scored every faction tick
  // as the front moves). structures.js rooftop sockets / env tall trees plug in via LB.ai.addPerchSource.
  var perchSources = [];
  function findPerches(side, fx) {
    var e = E(), out = [];
    for (var d = 9; d <= 22; d += 2.6) for (var z = -13; z <= 13; z += 2.6) {
      var x = fx + side * d; out.push({ x: x, z: z, h: e.terrainHeight(x, z) - d * 0.02, src: 'terrain' });
    }
    perchSources.forEach(function (fn) { try { (fn(side, fx) || []).forEach(function (p) { out.push(p); }); } catch (er) {} });
    out = out.filter(function (p) { return (p.x - fx) * side > 7; });   // never on the enemy side of the front
    out.sort(function (p, q) { return q.h - p.h; });
    return out.slice(0, 16);
  }
  function staffSnipers(arr, b, fx) {
    var ad = advice(), dens = ad && ad.sniperDensity > 0 ? Math.min(1, ad.sniperDensity) : 1;
    var want = Math.min(Math.round(tier().snipers * dens), Math.floor(b.size * 0.06));   // never above the tier cap
    b.perches = findPerches(b.side, fx);
    var cur = arr.filter(function (u) { return u.userData.ai && u.userData.ai.sniper && u.parent && !u.userData.rdDown; });
    for (var i = cur.length; i > want; i--) { cur[i - 1].userData.ai.sniper = null; cur.pop(); }
    var pool = arr.filter(function (u) { return (u.userData.type | 0) === 0 && u.userData.ai && !u.userData.ai.sniper && u.userData.aiRank == null && !u.userData.rdDown; });
    while (cur.length < want && pool.length) {
      var u = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      u.userData.ai.sniper = { st: 'MOVE', perch: null, shots: 0, t: 0, target: null };
      cur.push(u);
    }
    var used = 0;
    cur.forEach(function (u) { var S = u.userData.ai.sniper;
      if (!S.perch || (S.perch.x - fx) * b.side < 7) { S.perch = b.perches[(used + Math.floor(Math.random() * 3)) % Math.max(1, b.perches.length)]; S.st = 'MOVE'; }
      used++; });
    b.snipers = cur;
  }
  function pickSniperTarget(u, side) {
    var e = E(), A = e.getArmies(), foes = side < 0 ? A.bears : A.bulls, best = null, bs = -1, R = 30;
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i], fu = f.userData; if (!fu || fu.air || (fu.type | 0) !== 0 || fu.rdDown || !f.parent) continue;
      var dx = f.position.x - u.position.x, dz = f.position.z - u.position.z, d = Math.sqrt(dx * dx + dz * dz); if (d > R) continue;
      var sc = (fu.aiRank != null ? 5 + fu.aiRank : 1) + (fu.ai && fu.ai.st === 'ADVANCE' ? 1 : 0) - d / R;  // officers + exposed first
      if (sc > bs) { bs = sc; best = f; }
    }
    return best;
  }
  var glintMat = null;
  function glint(u) {
    var e = E(), THREE = e.THREE; if (!tier().markers) return;
    if (!glintMat) { var c = document.createElement('canvas'); c.width = c.height = 32; var g = c.getContext('2d');
      var gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32); glintMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }); }
    var s = new THREE.Sprite(glintMat); s.scale.setScalar(0.9); s.position.set(0, 1.25, 0); u.add(s);
    setTimeout(function () { u.remove(s); }, 450);
  }
  function thinkSniper(u, a, side, b, t) {
    var S = a.sniper, e = E(), fx = e.getFrontlineX(), depthHome = u.userData.home && u.userData.home.depth != null ? u.userData.home.depth : 7.8;
    var P = S.perch || { x: fx + side * 14, z: homeZ(u) };
    a.offX = Math.abs(P.x - fx) - depthHome; a.z = Math.max(-Z_LIM, Math.min(Z_LIM, P.z)); a.rate = 1.2; a.st = 'SNIPER:' + S.st;
    u.userData.shot = 99; // engine's regular rifle fire is suppressed for marksmen
    var dist = Math.abs(u.position.z - P.z) + Math.abs(u.position.x - P.x);
    if (S.st === 'MOVE') { if (dist < 1.5) { S.st = 'SCAN'; S.t = t; } return; }
    if (t - b.threatT < 3 && Math.abs(b.threatZ - u.position.z) < 3) { S.st = 'MOVE'; S.perch = b.perches[Math.floor(Math.random() * b.perches.length)]; return; } // threatened → relocate
    if (S.st === 'SCAN' && t - S.t > 2.5) { S.target = pickSniperTarget(u, side); if (S.target) { S.st = 'AIM'; S.t = t; glint(u); } else S.t = t; return; }
    if (S.st === 'AIM' && t - S.t > 1.6) {
      var tg = S.target; S.st = 'SCAN'; S.t = t;
      if (!tg || !tg.parent || tg.userData.rdDown) return;
      var fxApi = e.effects;
      if (fxApi && fxApi.fireWeapon) fxApi.fireWeapon({ from: { x: u.position.x, y: u.position.y + 1.1, z: u.position.z },
        to: { x: tg.position.x, y: tg.position.y + 1, z: tg.position.z }, kind: 'tracer', color: 0xfff2c0, power: 0.35, side: side });
      if (Math.random() < 0.55 && LB.ragdoll && LB.ragdoll.kill) {
        var ok = LB.ragdoll.kill(tg, u.position.x, u.position.z, 0.7);
        if (ok && Math.random() < 0.5) send({ side: side, type: 'sniper', from: callsign(u), text: 'Marksman ' + callsign(u) + ': target down' + (tg.userData.aiRank != null ? ' — enemy ' + RANKS[tg.userData.aiRank] : '') });
      }
      if (++S.shots >= 3) { S.shots = 0; S.st = 'MOVE'; S.perch = b.perches[Math.floor(Math.random() * b.perches.length)]; }
    }
  }

  // ---------- officers ----------
  var labelMats = new Map();
  function labelSprite(rank, side) {
    var E0 = E(), THREE = E0.THREE, key = rank + ':' + side;
    var m = labelMats.get(key);
    if (!m) {
      var c = document.createElement('canvas'); c.width = 128; c.height = 64; var g = c.getContext('2d');
      g.fillStyle = side < 0 ? 'rgba(20,60,40,.85)' : 'rgba(80,20,20,.85)'; g.fillRect(4, 8, 120, 48);
      g.strokeStyle = '#ffd36a'; g.lineWidth = 3; g.strokeRect(4, 8, 120, 48);
      g.fillStyle = '#ffd36a'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center';
      g.fillText(INSIG[rank] + ' ' + RANKS[rank].slice(0, 3).toUpperCase(), 64, 41);
      var tex = new THREE.CanvasTexture(c);
      m = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
      labelMats.set(key, m);
    }
    var s = new THREE.Sprite(m); s.scale.set(2.2, 1.1, 1); s.position.set(0, 3.1, 0); s.renderOrder = 5;
    s.userData.aiLabel = true; return s;
  }
  function setRank(u, r, b) {
    var ud = u.userData; ud.aiRank = r;
    if (ud.aiLabel) { u.remove(ud.aiLabel); ud.aiLabel = null; }
    if (tier().labels && E().THREE) { ud.aiLabel = labelSprite(r, b.side); u.add(ud.aiLabel); }
  }
  function officerQuota(n, cap) {
    // scales with (market-driven) army size, capped per tier
    var q = [1, Math.min(2, Math.floor(n / 30)), Math.floor(n / 22), Math.floor(n / 14), Math.floor(n / 8)]; // Col..Sgt
    var out = [], left = cap;
    for (var r = 4; r >= 0 && left > 0; r--) { var k = Math.max(r === 4 ? 1 : 0, Math.min(left, q[4 - r])); for (var i = 0; i < k; i++) out.push(r); left -= k; }
    return out;
  }
  function staffOfficers(arr, b, t) {
    var ground = arr.filter(function (u) { return u.parent && (u.userData.type | 0) <= 1 && !u.userData.air && !u.userData.rdDown; });
    b.size = ground.length;
    b.officers = b.officers.filter(function (o) { return o.parent && !o.userData.rdDown; });
    var want = officerQuota(ground.length, tier().officers);
    var have = b.officers.map(function (o) { return o.userData.aiRank; }).sort().reverse();
    if (have.join() === want.join()) return;
    // demote all, then promote by veterancy (survival time); Colonel prefers armor
    b.officers.forEach(function (o) { o.userData.aiRank = null; if (o.userData.aiLabel) { o.remove(o.userData.aiLabel); o.userData.aiLabel = null; } });
    var pool = ground.slice().sort(function (p, q) {
      var vp = (p.userData.ai ? p.userData.ai.vet : 0) + ((p.userData.type | 0) === 1 ? 30 : 0);
      var vq = (q.userData.ai ? q.userData.ai.vet : 0) + ((q.userData.type | 0) === 1 ? 30 : 0);
      return vq - vp;
    });
    b.officers = [];
    for (var i = 0; i < want.length && i < pool.length; i++) { setRank(pool[i], want[i], b); b.officers.push(pool[i]); }
    b.colonel = b.officers[0] || null;
  }
  function assignLeaders(arr, b) {
    var leaders = b.officers.filter(function (o) { return o.userData.aiRank <= 1; });
    if (!leaders.length) leaders = b.officers;
    arr.forEach(function (u) {
      if (!u.userData.ai || u.userData.aiRank != null) return;
      var best = null, bd = 1e9;
      for (var i = 0; i < leaders.length; i++) { var d = Math.abs(leaders[i].position.z - u.position.z); if (d < bd) { bd = d; best = leaders[i]; } }
      u.userData.ai.leader = bd < 7 ? best : null;
    });
  }
  function onOfficerDown(u) {
    var side = u.userData.side, b = boards[side]; if (!b || u.userData.aiRank == null) return;
    var r = u.userData.aiRank, name = callsign(u);
    b.morale = Math.max(0.2, b.morale - 0.06 * (r + 1));
    send({ side: side, type: 'officer-down', from: name, text: name + ' (' + RANKS[r] + ') is down — chain of command reshuffling', x: u.position.x, z: u.position.z });
    b.officers = b.officers.filter(function (o) { return o !== u; });
    u.userData.aiRank = null; if (u.userData.aiLabel) { u.remove(u.userData.aiLabel); u.userData.aiLabel = null; }
    b._restaff = true; // succession next faction tick (highest-veteran promoted)
  }

  // ---------- faction strategy ----------
  function chooseStrategy(b, t, mom, sizeRatio) {
    var dir = b.side < 0 ? mom : -mom; // >0 = market favours this side
    var s;
    if (dir > 0.12) s = 'PUSH';
    else if (dir < -0.12) s = b.morale < 0.5 ? 'FALL BACK' : 'HOLD';
    else if (sizeRatio > 1.15) s = 'FLANK';
    else {
      var adS = advice(), pri = adS && adS.strategyPrior && adS.strategyPrior[String(b.side)];
      if (t - b.threatT < 8) s = 'HOLD';
      else if (pri && t - b.stratSince > 12) s = weightedPick(['HOLD', 'FLANK', 'PUSH'], pri);   // neutral market: learned prior
      else s = (Math.floor(t / 40 + (b.side < 0 ? 0 : 1)) % 2 ? 'FLANK' : 'HOLD');
    }
    if (s !== b.strategy && t - b.stratSince > 12) {
      b.strategy = s; b.stratSince = t;
      if (s === 'FLANK') b.flankZ = (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 5);
      var col = b.colonel ? callsign(b.colonel) : (b.side < 0 ? 'BULL HQ' : 'BEAR HQ');
      send({ side: b.side, type: 'strategy', from: col, text: col + ': all units — ' + s + (s === 'FLANK' ? (b.flankZ > 0 ? ' north' : ' south') : '') });
    }
    // morale drifts toward market direction (cosmetic only)
    b.morale += ((0.75 + dir * 2) - b.morale) * 0.05; b.morale = Math.max(0.2, Math.min(1, b.morale));
  }

  // ---------- quests ----------
  var QTYPES = [
    { id: 'capture', name: 'Capture ridge point', offX: -1.2, dur: 35 },
    { id: 'defend',  name: 'Defend the wall',     offX: 0.6,  dur: 40 },
    { id: 'recon',   name: 'Recon the flank',     offX: -0.4, dur: 25 },
    { id: 'battery', name: 'Destroy enemy battery', offX: -1.6, dur: 30 },
    { id: 'escort',  name: 'Escort armor column', offX: -0.8, dur: 30 }
  ];
  var questSeq = 1, markers = [];
  function genQuest(b, arr, t) {
    if (b.quests.length >= tier().quests || !b.officers.length) return;
    var issuer = b.officers.filter(function (o) { return o.userData.aiRank >= 2; })[0] || b.officers[0];
    var adQ = advice(), qw = adQ && adQ.questWeights;
    var qt = qw ? QTYPES.filter(function (x) { return x.id === weightedPick(QTYPES.map(function (y) { return y.id; }), qw); })[0] || QTYPES[0]
                : QTYPES[Math.floor(Math.random() * QTYPES.length)];
    if (b.strategy === 'FALL BACK') qt = QTYPES[1];
    var z = qt.id === 'recon' ? b.flankZ : (qt.id === 'defend' ? 0 : (Math.random() - 0.5) * 20);
    var q = { id: 'Q' + (questSeq++), side: b.side, type: qt.id, name: qt.name, z: z, offX: qt.offX, t0: t, dur: qt.dur,
      progress: 0, active: true, issuer: callsign(issuer), issuerRank: RANKS[issuer.userData.aiRank], squad: [], truth: 'SIMULATED' };
    var cand = arr.filter(function (u) { return u.userData.ai && !u.userData.ai.quest && (u.userData.type | 0) <= (qt.id === 'escort' ? 1 : 0) && !u.userData.rdDown; })
      .sort(function (p, r) { return Math.abs(homeZ(p) - z) - Math.abs(homeZ(r) - z); }).slice(0, 6);
    if (!cand.length) return;
    cand.forEach(function (u) { u.userData.ai.quest = q; }); q.squad = cand;
    b.quests.push(q);
    send({ side: b.side, type: 'quest', from: q.issuer, text: q.issuer + ' → squad of ' + cand.length + ': ' + q.name, z: z });
    addMarker(q);
  }
  function tickQuests(b, t) {
    b.quests.forEach(function (q) {
      if (!q.active) return;
      var near = 0;
      q.squad.forEach(function (u) { if (u.parent && !u.userData.rdDown && Math.abs(u.position.z - q.z) < 4) near++; });
      q.progress = Math.min(1, q.progress + (near / Math.max(1, q.squad.length)) / q.dur);
      if (q.progress >= 1 || t - q.t0 > q.dur * 2) {
        q.active = false; q.done = q.progress >= 1;
        if (LB.learn && LB.learn.emit) { try { LB.learn.emit('ai:quest', { side: q.side, type: q.type, ok: q.done }); } catch (e) {} }
        q.squad.forEach(function (u) { if (u.userData.ai && u.userData.ai.quest === q) u.userData.ai.quest = null; });
        send({ side: b.side, type: 'quest-end', from: q.issuer, text: q.issuer + ': "' + q.name + '" ' + (q.done ? 'complete' : 'aborted') });
        if (q.done) b.morale = Math.min(1, b.morale + 0.05);
      }
    });
    b.quests = b.quests.filter(function (q) { return q.active; });
  }
  function addMarker(q) {
    if (!tier().markers) return;
    var e = E(), THREE = e.THREE;
    var c = document.createElement('canvas'); c.width = 256; c.height = 64; var g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = q.side < 0 ? '#7cf0a8' : '#ff8a80'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center';
    g.fillText('◎ ' + q.name.toUpperCase(), 128, 28); g.fillStyle = '#ccc'; g.font = '14px sans-serif'; g.fillText('AI objective · SIMULATED', 128, 52);
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.scale.set(5.5, 1.4, 1); s.renderOrder = 6; s.userData.q = q; e.scene.add(s); markers.push(s);
  }
  function tickMarkers(t) {
    var e = E(), fx = e.getFrontlineX();
    for (var i = markers.length - 1; i >= 0; i--) {
      var s = markers[i], q = s.userData.q;
      if (!q.active) { e.scene.remove(s); s.material.map.dispose(); s.material.dispose(); markers.splice(i, 1); continue; }
      var x = fx + q.side * 3; s.position.set(x, e.terrainHeight(x, q.z) + 4.5 + Math.sin(t * 2) * 0.2, q.z);
    }
  }

  // ---------- War Room panel ----------
  var panel = null, uiDirty = true, uiNext = 0;
  function ensurePanel() {
    if (panel) return panel;
    var rp = document.getElementById('rightPanel'); if (!rp) return null;
    panel = document.createElement('div'); panel.id = 'aiOps'; panel.className = 'ai-ops';
    rp.insertBefore(panel, document.getElementById('feed'));
    panel.addEventListener('click', function (ev) {
      var el = ev.target.closest('[data-fz]'); if (!el) return;
      var e = E(); if (e && e.focusWorld) e.focusWorld(+el.getAttribute('data-fx'), +el.getAttribute('data-fz'), true);
    });
    return panel;
  }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function renderPanel(t) {
    var p = ensurePanel(); if (!p) return;
    var h = '<div class="ai-head">AI OPS <span class="sim">SIMULATED</span> <span class="ai-sub">unit AI · not market data</span></div>';
    [-1, 1].forEach(function (side) {
      var b = boards[side];
      h += '<div class="ai-side ' + (side < 0 ? 'bull' : 'bear') + '"><b>' + (side < 0 ? 'BULLS' : 'BEARS') + '</b> · ' + b.strategy +
        ' · morale ' + Math.round(b.morale * 100) + '% · ' + b.size + ' ground · ' + ((b.snipers || []).length) + ' marksmen</div><div class="ai-roster">';
      b.officers.slice(0, 6).forEach(function (o) {
        var a = o.userData.ai || {}, r = o.userData.aiRank;
        h += '<div class="ai-off" data-fx="' + o.position.x.toFixed(1) + '" data-fz="' + o.position.z.toFixed(1) + '" title="Click to focus">' +
          INSIG[r] + ' ' + RANKS[r] + ' <i>(' + ALIAS[RANKS[r]] + ')</i> · z' + o.position.z.toFixed(0) + ' · ' + (a.st || '—') + '</div>';
      });
      b.quests.forEach(function (q) {
        h += '<div class="ai-q">◎ ' + esc(q.name) + ' — ' + Math.round(q.progress * 100) + '% · by ' + esc(q.issuerRank) + ' ' + esc(q.issuer) + '</div>';
      });
      h += '</div>';
    });
    h += '<div class="ai-radio">' + chatter.slice(0, 5).map(function (c) {
      return '<div class="' + (c.side < 0 ? 'bull' : 'bear') + '">📻 ' + esc(c.text) + '</div>'; }).join('') + '</div>';
    p.innerHTML = h; uiDirty = false;
  }

  // ---------- explosions → spotting reports (via ragdoll/effects wrap) ----------
  function reportBlast(x, z, power) {
    var t = nowS();
    [-1, 1].forEach(function (side) {
      var b = boards[side]; var fx = E().getFrontlineX();
      if ((x - fx) * side < 4 && t - b.threatT > 5 && power > 0.9) { // blast on/near our side
        b.threatZ = z; b.threatT = t;
        var sg = b.officers.filter(function (o) { return o.userData.aiRank <= 1; })[0];
        if (sg && Math.random() < 0.5) send({ side: side, type: 'spotted', from: callsign(sg), text: callsign(sg) + ': taking fire at z' + z.toFixed(0) + ', requesting support', x: x, z: z });
      }
    });
  }

  // ---------- main loop (own rAF, budgeted, staggered) ----------
  var cursor = { '-1': 0, '1': 0 }, accum = 0, factionNext = 0, lastT = 0, booted = false, stats = { thinks: 0, ms: 0, units: 0 };
  function loop() {
    requestAnimationFrame(loop);
    var e = E(); if (!e || !enabled) return;
    var t = nowS(), dt = Math.min(0.1, t - (lastT || t)); lastT = t;
    if (e.isPaused && e.isPaused()) return;
    var t0 = performance.now(), A = e.getArmies(), T = tier();
    if (t >= factionNext) {
      factionNext = t + 1;
      hash.clear();
      var mom = e.getMomentum ? e.getMomentum() : 0;
      [[A.bulls, -1], [A.bears, 1]].forEach(function (p) {
        var b = boards[p[1]]; p[0].forEach(function (u) { if (!u.userData.air) hash.add(u); });
        if (b._restaff || Math.random() < 0.2) { b._restaff = false; staffOfficers(p[0], b, t); }
        assignLeaders(p[0], b); tickQuests(b, t);
        staffSnipers(p[0], b, e.getFrontlineX());
        if (Math.random() < 0.12) genQuest(b, p[0], t);
      });
      var nb = boards[-1].size || 1, nr = boards[1].size || 1;
      chooseStrategy(boards[-1], t, mom, nb / nr); chooseStrategy(boards[1], t, mom, nr / nb);
      uiDirty = true;
    }
    // staggered brains: each unit thinks ~T.hz times/s, never more than T.perFrame per frame
    [[A.bulls, -1], [A.bears, 1]].forEach(function (p) {
      var arr = p[0], n = arr.length; if (!n) return;
      var want = Math.min(Math.ceil(n * T.hz * dt), T.perFrame >> 1);
      for (var k = 0; k < want; k++) {
        var u = arr[cursor[p[1]]++ % n]; if (!u || !u.userData || u.userData.air || (u.userData.type | 0) > 2) continue;
        think(u, p[1], boards[p[1]], t); stats.thinks++;
      }
    });
    tickMarkers(t);
    if (uiDirty && t >= uiNext) { uiNext = t + 1; renderPanel(t); }
    stats.units = A.bulls.length + A.bears.length;
    stats.ms = stats.ms * 0.95 + (performance.now() - t0) * 0.05;
  }
  function boot() {
    if (booted) return; if (!E() || !E().getArmies) { setTimeout(boot, 400); return; }
    booted = true; document.body.classList.toggle('ai-on', enabled); requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  LB.ai = {
    version: 'v11.2-ai-p1',
    steer: steer,
    isEnabled: function () { return enabled; },
    setEnabled: function (v) {
      enabled = !!v; document.body.classList.toggle('ai-on', enabled);
      if (!enabled) { var A = E() && E().getArmies(); if (A) A.bulls.concat(A.bears).forEach(function (u) { if (u.userData) u.userData.ai = null; }); if (panel) panel.innerHTML = ''; }
    },
    onOfficerDown: onOfficerDown,
    reportBlast: reportBlast,
    send: send,
    onMessage: function (fn) { listeners.push(fn); },
    getQuests: function () { return boards[-1].quests.concat(boards[1].quests); },
    getState: function () { return { enabled: enabled, tier: tierName(), boards: boards, chatter: chatter.slice(), bus: bus.slice(-20), stats: Object.assign({}, stats) }; },
    addPerchSource: function (fn) { perchSources.push(fn); },
    hash: hash, RANKS: RANKS
  };
})(window);
