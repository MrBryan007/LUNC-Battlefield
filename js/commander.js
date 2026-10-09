/* LUNC Battlefield v10 — COMMANDER game layer (original)
 *
 * Turns the live market battlefield into something you can play:
 *  - Pick a side (Bulls or Bears) and call in support: Artillery [1], Airstrike [2], Moon Shot [3]
 *  - Strikes land on the real 3D field with full FX, shake, flash and synthesized audio
 *  - Hit enemy units for score; build combos; charge the Moon Shot ultimate
 *  - Rotating missions with a difficulty ramp (more targets, less time each level)
 *  - "Call the Front": predict the next LIVE price move (scored only while price is LIVE)
 *  - XP + ranks persisted locally; pause / restart / mute; mouse, keyboard and touch
 *
 * DATA TRUTH: everything here is a GAME layer. Strikes are cosmetic — they never change
 * market math, army sizes, the frontline, or any LIVE/CALCULATED value. Predictions read the
 * live price but are only a game (not financial advice). Nothing is sent anywhere.
 */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var STORE = 'luncBattle.commander.v10';
  var doc = global.document;

  var RANKS = [
    { xp: 0, name: 'Recruit' }, { xp: 300, name: 'Private' }, { xp: 800, name: 'Corporal' },
    { xp: 1600, name: 'Sergeant' }, { xp: 3000, name: 'Lieutenant' }, { xp: 5000, name: 'Captain' },
    { xp: 8000, name: 'Major' }, { xp: 12000, name: 'Colonel' }, { xp: 18000, name: 'General' },
    { xp: 26000, name: 'Validator General' }
  ];

  var ABILITIES = {
    arty: { key: '1', name: 'Artillery', icon: '✸', cd: 5, radius: 3.2, desc: 'Three-shell barrage' },
    air: { key: '2', name: 'Airstrike', icon: '✈', cd: 16, radius: 2.6, desc: 'Bomb run across the target' },
    moon: { key: '3', name: 'Moon Shot', icon: '☾', cd: 0, radius: 6.5, desc: 'Ultimate — charge by landing hits' }
  };

  var POINTS = { 0: 10, 1: 30, 2: 45 }; // infantry / armor / artillery

  function load() {
    try { return Object.assign({ xp: 0, best: 0, side: 'bull', seenIntro: false, bestStreak: 0 }, JSON.parse(localStorage.getItem(STORE) || '{}')); }
    catch (_) { return { xp: 0, best: 0, side: 'bull', seenIntro: false, bestStreak: 0 }; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(profile)); } catch (_) {} }

  var profile = load();
  var session = null;
  var armed = null;
  var cds = { arty: 0, air: 0, moon: 0 };
  var reticle = null;
  var el = {};
  var pointer = { x: 0, y: 0, has: false };
  var mission = null;
  var call = null; // { dir, entry, endsAt, dur }
  var started = false;
  var hitCooldown = new WeakMap();

  function E() { return LB.engine; }
  function sfx() { return LB.sfx || null; }

  function rankFor(xp) {
    var r = RANKS[0], idx = 0;
    for (var i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) { r = RANKS[i]; idx = i; }
    var next = RANKS[idx + 1] || null;
    return { idx: idx, name: r.name, floor: r.xp, next: next ? next.xp : null };
  }

  function newSession() {
    session = { score: 0, combo: 0, comboT: 0, level: 1, charge: 0, hits: 0, strikes: 0, streak: 0, missionsDone: 0 };
    cds = { arty: 0, air: 0, moon: 0 };
    call = null;
    nextMission();
    renderAll();
  }

  // ---------------- Missions (difficulty ramp) ----------------
  function nextMission() {
    var L = session.level;
    var live = E() && E().isPriceLive && E().isPriceLive();
    var pool = [
      { id: 'inf', text: 'Hit {n} enemy infantry', type: 0, n: 5 + 2 * L },
      { id: 'armor', text: 'Hit {n} enemy armor', type: 1, n: 2 + L },
      { id: 'arty', text: 'Silence {n} enemy artillery', type: 2, n: 1 + Math.floor(L / 2) },
      { id: 'combo', text: 'Reach a x{n} combo', combo: true, n: 3 + Math.floor(L / 2) }
    ];
    if (live) pool.push({ id: 'call', text: 'Call the Front correctly', call: true, n: 1 });
    var pick = pool[(Math.random() * pool.length) | 0];
    if (mission && pick.id === mission.id && pool.length > 1) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
    var time = Math.max(30, 75 - (L - 1) * 5);
    if (pick.call) time = Math.max(time, 50);
    mission = { id: pick.id, text: pick.text.replace('{n}', pick.n), type: pick.type, n: pick.n, got: 0,
      combo: !!pick.combo, call: !!pick.call, time: time, left: time, reward: 120 + 60 * L };
    toast('NEW ORDERS', mission.text, 'info');
    if (sfx()) sfx().radio();
  }

  function missionProgress(kind, val) {
    if (!mission) return;
    if (kind === 'hit' && mission.type === val) mission.got++;
    if (kind === 'combo' && mission.combo) mission.got = Math.max(mission.got, val);
    if (kind === 'call' && mission.call) mission.got += val;
    if (mission.got >= mission.n) completeMission();
  }

  function completeMission() {
    var reward = mission.reward + Math.round(mission.left * 4);
    addScore(reward, null, true);
    session.missionsDone++;
    session.level++;
    toast('MISSION COMPLETE', '+' + reward + ' · Level ' + session.level, 'win');
    if (sfx()) sfx().success();
    if (E()) E().flash(0.12);
    nextMission();
  }

  function failMission() {
    toast('MISSION FAILED', mission.text + ' — new orders incoming', 'bad');
    if (sfx()) sfx().fail();
    session.streak = 0;
    nextMission();
  }

  // ---------------- Scoring ----------------
  function addScore(points, worldPos, noCombo) {
    var mult = noCombo ? 1 : (1 + Math.min(9, session.combo) * 0.25);
    var gained = Math.round(points * mult);
    session.score += gained;
    var before = rankFor(profile.xp);
    profile.xp += gained;
    var after = rankFor(profile.xp);
    if (session.score > profile.best) profile.best = session.score;
    save();
    if (after.idx > before.idx) {
      toast('PROMOTED', after.name, 'rank');
      if (sfx()) sfx().rank();
    }
    if (worldPos && E()) floatText('+' + gained, worldPos, noCombo ? 'gold' : '');
    renderStats();
    return gained;
  }

  // ---------------- Strikes ----------------
  function enemySide() { return profile.side === 'bull' ? 1 : -1; }      // bears are side +1
  function enemyArmy() {
    var a = E().getArmies();
    return enemySide() > 0 ? a.bears : a.bulls;
  }
  function friendlyColor() { return profile.side === 'bull' ? E().bullColor() : E().bearColor(); }

  function resolveHits(x, z, radius, power, noCharge) {
    var army = enemyArmy();
    var now = performance.now();
    var n = 0, pts = 0;
    for (var i = 0; i < army.length; i++) {
      var u = army[i];
      if (!u || !u.userData) continue;
      var t = u.userData.type | 0;
      if (t === 3 || t === 4 || u.userData.air) continue;
      var dx = u.position.x - x, dz = u.position.z - z;
      var d2 = dx * dx + dz * dz;
      if (d2 > radius * radius) continue;
      var last = hitCooldown.get(u) || 0;
      if (now - last < 900) continue;
      hitCooldown.set(u, now);
      // cosmetic knockback — units ease back to their market-driven slot on their own
      var d = Math.sqrt(d2) || 1;
      var push = (1 - d / radius) * 0.9 * power;
      u.position.x += (dx / d) * push;
      u.position.z += (dz / d) * push * 0.6;
      n++;
      pts += POINTS[t] || 10;
      missionProgress('hit', t);
    }
    if (n) {
      session.hits += n;
      session.combo++;
      session.comboT = 3.2;
      session.streak++;
      if (session.streak > profile.bestStreak) profile.bestStreak = session.streak;
      if (!noCharge) session.charge = Math.min(100, session.charge + n * 7);
      addScore(pts, new (E().THREE.Vector3)(x, E().terrainHeight(x, z) + 1.5, z));
      missionProgress('combo', session.combo);
      hitMarker(n);
    }
    return n;
  }

  // ---------------- Blast FX (player strikes: big readable fireballs) ----------------
  var blasts = [], blastPool = [], blastLight = null;
  function blastSprite(kind) {
    var THREE = E().THREE, PT = LB.proctex;
    for (var i = 0; i < blastPool.length; i++) if (blastPool[i].userData.kind === kind) return blastPool.splice(i, 1)[0];
    var m = new THREE.SpriteMaterial({
      map: kind === 'smoke' ? (PT && PT.smokePuff(THREE)) : (PT && PT.softDot(THREE)),
      color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false,
      blending: kind === 'smoke' ? THREE.NormalBlending : THREE.AdditiveBlending, fog: true
    });
    var sp = new THREE.Sprite(m);
    sp.userData.kind = kind;
    return sp;
  }
  function spawnBlast(x, z, power, gold) {
    var eng = E(), THREE = eng.THREE;
    var y = eng.terrainHeight(x, z);
    var lowFx = eng.mobile || (LB.quality && LB.quality.getEffectiveName && LB.quality.getEffectiveName() === 'LOW');
    var nFire = lowFx ? 4 : 7, nSmoke = lowFx ? 3 : 6;
    var hot = gold ? [0xffd877, 0xffb02e, 0xff7a10] : [0xffd9a0, 0xff9a3a, 0xff4a14];
    for (var i = 0; i < nFire + nSmoke; i++) {
      var smoke = i >= nFire;
      var sp = blastSprite(smoke ? 'smoke' : 'fire');
      var a = Math.random() * Math.PI * 2, r = Math.random() * 0.9 * power;
      sp.position.set(x + Math.cos(a) * r, y + 0.4 + Math.random() * 0.6, z + Math.sin(a) * r);
      sp.material.color.setHex(smoke ? 0x2c2a26 : hot[i % hot.length]);
      sp.material.opacity = smoke ? 0 : 1;
      sp.scale.setScalar(0.3);
      sp.userData.t = 0;
      sp.userData.life = smoke ? 2.2 + Math.random() * 1.2 : 0.55 + Math.random() * 0.35;
      sp.userData.delay = smoke ? 0.12 + Math.random() * 0.2 : Math.random() * 0.08;
      sp.userData.size = (smoke ? 3.2 : 2.1) * power * (0.7 + Math.random() * 0.6);
      sp.userData.vy = smoke ? 0.9 + Math.random() * 0.8 : 1.2 + Math.random() * 1.5;
      sp.userData.vx = Math.cos(a) * (smoke ? 0.4 : 1.4);
      sp.userData.vz = Math.sin(a) * (smoke ? 0.4 : 1.4);
      sp.userData.smoke = smoke;
      sp.visible = true;
      eng.scene.add(sp);
      blasts.push(sp);
    }
    if (!blastLight) { blastLight = new THREE.PointLight(0xffa040, 0, 26, 2); eng.scene.add(blastLight); }
    blastLight.position.set(x, y + 2.5, z);
    blastLight.color.setHex(gold ? 0xffcc55 : 0xff9a40);
    blastLight.intensity = Math.max(blastLight.intensity, 5 * power);
    // keep total sprites bounded
    while (blasts.length > (lowFx ? 70 : 160)) recycle(blasts.shift());
  }
  function recycle(sp) { sp.visible = false; if (sp.parent) sp.parent.remove(sp); if (blastPool.length < 200) blastPool.push(sp); }
  function tickBlasts(dt) {
    if (blastLight) blastLight.intensity *= Math.pow(0.02, dt);
    for (var i = blasts.length - 1; i >= 0; i--) {
      var sp = blasts[i], u = sp.userData;
      if (u.delay > 0) { u.delay -= dt; continue; }
      u.t += dt;
      var k = u.t / u.life;
      if (k >= 1) { blasts.splice(i, 1); recycle(sp); continue; }
      sp.position.x += u.vx * dt; sp.position.z += u.vz * dt; sp.position.y += u.vy * dt;
      u.vx *= 0.96; u.vz *= 0.96;
      if (u.smoke) {
        sp.scale.setScalar(u.size * (0.45 + Math.sqrt(k) * 0.9));
        sp.material.opacity = Math.min(0.55, k * 6) * (1 - k);
      } else {
        sp.scale.setScalar(u.size * (0.35 + Math.pow(k, 0.4) * 0.9));
        sp.material.opacity = 0.55 * Math.pow(1 - k, 1.6);
        u.vy *= 0.95;
      }
    }
  }

  function boom(x, z, power, isGold) {
    var eng = E();
    if (!eng || !eng.effects) return;
    var col = isGold ? 0xffc94a : friendlyColor();
    eng.effects.createExplosion(x, z, col, power, !!isGold);
    try { spawnBlast(x, z, power, isGold); } catch (e) { /* FX are optional */ }
    var cam = eng.camera.position;
    var dx = cam.x - x, dz = cam.z - z;
    var dist = Math.min(1, Math.sqrt(dx * dx + dz * dz) / 110);
    if (sfx()) sfx().explosion(power * 1.2, dist);
    eng.addShake(Math.min(0.3, 0.1 * power));
    eng.flash(0.012 * power);
  }

  function strikeArty(x, z) {
    var eng = E();
    var side = profile.side === 'bull' ? -1 : 1;
    var any = 0, pending = 3;
    for (var i = 0; i < 3; i++) {
      (function (k) {
        var tx = x + (Math.random() - 0.5) * 2.4, tz = z + (Math.random() - 0.5) * 2.4;
        var from = { x: side * 52, y: 14, z: tz * 0.6 };
        setTimeout(function () {
          var fired = eng.effects && eng.effects.fireWeapon && eng.effects.fireWeapon({
            from: from, to: { x: tx, y: eng.terrainHeight(tx, tz) + 0.2, z: tz },
            kind: 'arty', color: friendlyColor(), power: 1.35, side: -side,
            onHit: function () { any += resolveHits(tx, tz, ABILITIES.arty.radius, 1.0); boom(tx, tz, 1.1); done(); }
          });
          if (!fired) { boom(tx, tz, 1.2); any += resolveHits(tx, tz, ABILITIES.arty.radius, 1.0); done(); }
        }, k * 180);
      })(i);
    }
    function done() { if (--pending === 0 && !any) breakCombo(); }
  }

  function strikeAir(x, z) {
    var eng = E();
    if (sfx()) sfx().jet();
    var any = 0;
    var n = eng.mobile ? 5 : 7;
    for (var i = 0; i < n; i++) {
      (function (k) {
        setTimeout(function () {
          var tz = z - 7 + (14 * k) / (n - 1);
          var tx = x + (Math.random() - 0.5) * 1.2;
          boom(tx, tz, 1.5);
          any += resolveHits(tx, tz, ABILITIES.air.radius, 1.2);
          if (k === n - 1 && !any) breakCombo();
        }, 650 + k * 120);
      })(i);
    }
  }

  function strikeMoon(x, z) {
    var eng = E();
    session.charge = 0;
    toast('MOON SHOT', 'Game FX only — not a chain burn', 'gold');
    eng.flash(0.12);
    eng.addShake(0.5);
    boom(x, z, 2.6, true);
    resolveHits(x, z, ABILITIES.moon.radius, 1.6, true);
    for (var i = 0; i < 8; i++) {
      (function (k) {
        setTimeout(function () {
          var a = (k / 8) * Math.PI * 2, r = 3.8;
          var tx = x + Math.cos(a) * r, tz = z + Math.sin(a) * r;
          boom(tx, tz, 1.4, true);
          resolveHits(tx, tz, 2.5, 1, true);
        }, 220 + k * 70);
      })(i);
    }
  }

  function breakCombo() {
    if (session.combo > 0) floatScreen('MISS', pointer.x, pointer.y, 'miss');
    session.combo = 0;
    session.streak = 0;
    renderStats();
  }

  function fireAt(ability, p) {
    if (!p) return;
    var a = ABILITIES[ability];
    if (ability === 'moon' ? session.charge < 100 : cds[ability] > 0) { if (sfx()) sfx().ui('deny'); return; }
    if (E().isPaused()) return;
    session.strikes++;
    if (ability === 'arty') strikeArty(p.x, p.z);
    else if (ability === 'air') strikeAir(p.x, p.z);
    else strikeMoon(p.x, p.z);
    if (a.cd) cds[ability] = a.cd;
    if (!(global.matchMedia && matchMedia('(pointer: fine)').matches) || ability === 'moon') disarm();
    renderAbilities();
  }

  function arm(ability) {
    if (!started) return;
    if (ability === 'moon' && session.charge < 100) { if (sfx()) sfx().ui('deny'); pulseBtn(ability); return; }
    if (ability !== 'moon' && cds[ability] > 0) { if (sfx()) sfx().ui('deny'); pulseBtn(ability); return; }
    armed = armed === ability ? null : ability;
    if (armed && sfx()) sfx().ui('arm');
    doc.body.classList.toggle('cmd-armed', !!armed);
    if (reticle) {
      reticle.visible = !!armed && pointer.has;
      var r = armed ? ABILITIES[armed].radius : 1;
      reticle.scale.set(r, r, r);
    }
    if (armed && !pointer.has) toast(ABILITIES[armed].name.toUpperCase(), (E().mobile ? 'Tap' : 'Click') + ' the battlefield to strike', 'info', 1400);
    renderAbilities();
  }
  function disarm() { armed = null; doc.body.classList.remove('cmd-armed'); if (reticle) reticle.visible = false; renderAbilities(); }

  // ---------------- Call the Front (live prediction) ----------------
  function startCall(dir) {
    var eng = E();
    if (call) return;
    if (!eng.isPriceLive()) { toast('PRICE NOT LIVE', 'Calls are scored only on a LIVE price feed', 'bad'); if (sfx()) sfx().ui('deny'); return; }
    var dur = 30;
    call = { dir: dir, entry: eng.getPrice(), endsAt: performance.now() + dur * 1000, dur: dur };
    if (sfx()) sfx().ui('arm');
    toast(dir > 0 ? '▲ LONG CALLED' : '▼ SHORT CALLED', 'Resolves in ' + dur + 's against the LIVE price', 'info');
    renderCall();
  }

  function resolveCall() {
    var eng = E();
    var exit = eng.getPrice();
    var move = exit - call.entry;
    var dir = call.dir;
    var entry = call.entry;
    call = null;
    if (!eng.isPriceLive()) { toast('CALL VOID', 'Price feed dropped — no score', 'info'); renderCall(); return; }
    if (move === 0) { toast('FLAT — PUSH', 'No move in 30s. No score.', 'info'); renderCall(); return; }
    var right = (move > 0 && dir > 0) || (move < 0 && dir < 0);
    var pct = (move / entry) * 100;
    if (right) {
      var g = addScore(150 + Math.round(Math.min(5, Math.abs(pct) * 20) * 40), null, true);
      toast('CALL WON', (pct >= 0 ? '+' : '') + pct.toFixed(3) + '% · +' + g, 'win');
      if (sfx()) sfx().success();
      missionProgress('call', 1);
    } else {
      toast('CALL LOST', (pct >= 0 ? '+' : '') + pct.toFixed(3) + '%', 'bad');
      if (sfx()) sfx().fail();
    }
    renderCall();
  }

  // ---------------- Tick ----------------
  function tick(dt, wallDt) {
    if (!started || !session) return;
    var paused = E() && E().isPaused();
    if (!paused) tickBlasts(dt);
    if (!paused) {
      for (var k in cds) if (cds[k] > 0) cds[k] = Math.max(0, cds[k] - dt);
      if (session.comboT > 0) {
        session.comboT -= dt;
        if (session.comboT <= 0) { session.combo = 0; renderStats(); }
      }
      if (mission) {
        mission.left -= dt;
        if (mission.left <= 0) failMission();
      }
      if (call && performance.now() >= call.endsAt) resolveCall();
    }
    tickAcc += wallDt || dt;
    if (tickAcc > 0.1) { tickAcc = 0; renderAbilities(); renderMission(); renderCall(); }
    if (reticle && reticle.visible) {
      reticle.rotation.y += (wallDt || 0.016) * 1.4;
      var s = 1 + Math.sin(performance.now() * 0.008) * 0.05;
      var r = armed ? ABILITIES[armed].radius : 1;
      reticle.scale.set(r * s, 1, r * s);
    }
  }
  var tickAcc = 0;

  // ---------------- 3D reticle ----------------
  function buildReticle() {
    var THREE = E().THREE;
    var g = new THREE.Group();
    var ringMat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    var inner = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.16, 24), ringMat);
    inner.rotation.x = -Math.PI / 2;
    g.add(inner);
    for (var i = 0; i < 4; i++) {
      var tick = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.26), ringMat);
      tick.rotation.x = -Math.PI / 2;
      var a = i * Math.PI / 2;
      tick.position.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8);
      tick.rotation.z = a + Math.PI / 2;
      g.add(tick);
    }
    var fillMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false });
    var fill = new THREE.Mesh(new THREE.CircleGeometry(0.92, 40), fillMat);
    fill.rotation.x = -Math.PI / 2;
    g.add(fill);
    g.renderOrder = 5;
    g.visible = false;
    E().scene.add(g);
    reticle = g;
  }

  function updateReticle(cx, cy) {
    if (!reticle) return;
    var p = E().pickGround(cx, cy);
    if (!p) { reticle.visible = false; return; }
    reticle.position.set(p.x, E().terrainHeight(p.x, p.z) + 0.12, p.z);
    reticle.visible = !!armed;
  }

  // ---------------- DOM / HUD ----------------
  function h(tag, cls, html) { var d = doc.createElement(tag); if (cls) d.className = cls; if (html != null) d.innerHTML = html; return d; }

  function buildHud() {
    var root = h('div', 'cmd-layer');
    root.id = 'cmdLayer';
    root.innerHTML =
      '<div class="cmd-topbar">' +
        '<div class="cmd-rank" id="cmdRank"><span class="cmd-rank-name">Recruit</span><div class="cmd-xp"><i id="cmdXpBar"></i></div></div>' +
        '<div class="cmd-score"><span class="lbl">Score</span><b id="cmdScore">0</b></div>' +
        '<div class="cmd-combo" id="cmdCombo">x0</div>' +
        '<button class="cmd-icon-btn" id="cmdMute" title="Mute (M)" aria-label="Mute">🔊</button>' +
        '<button class="cmd-icon-btn" id="cmdPause" title="Pause (P / Esc)" aria-label="Pause">❚❚</button>' +
      '</div>' +
      '<div class="cmd-mission" id="cmdMission"><div class="cmd-mission-head"><span class="tag">ORDERS · LV <b id="cmdLevel">1</b></span><span class="cmd-timer" id="cmdTimer">0s</span></div>' +
        '<div class="cmd-mission-text" id="cmdMissionText">—</div><div class="cmd-progress"><i id="cmdMissionBar"></i></div></div>' +
      '<div class="cmd-bar" id="cmdBar">' +
        abilityBtn('arty') + abilityBtn('air') + abilityBtn('moon') +
        '<div class="cmd-call" id="cmdCall">' +
          '<div class="cmd-call-label">Call the Front <span class="qual live" id="cmdCallTruth">LIVE</span></div>' +
          '<div class="cmd-call-btns"><button id="cmdLong" class="long">▲ Long</button><button id="cmdShort" class="short">▼ Short</button></div>' +
          '<div class="cmd-call-status" id="cmdCallStatus">30s round · game only</div>' +
        '</div>' +
      '</div>' +
      '<div class="cmd-toasts" id="cmdToasts"></div>' +
      '<div class="cmd-hitmarker" id="cmdHit">✕</div>';
    doc.body.appendChild(root);

    var overlay = h('div', 'cmd-overlay');
    overlay.id = 'cmdOverlay';
    overlay.innerHTML =
      '<div class="cmd-card">' +
        '<div class="cmd-card-kicker">LUNC BATTLEFIELD · v10</div>' +
        '<h1 id="cmdOverlayTitle">Take Command</h1>' +
        '<p class="cmd-card-sub">The armies move with the <b>live market</b>. You call in the support.</p>' +
        '<div class="cmd-side-pick"><button data-side="bull" class="bull">▲ Command Bulls</button><button data-side="bear" class="bear">▼ Command Bears</button></div>' +
        '<ul class="cmd-howto">' +
          '<li><kbd>1</kbd> Artillery · <kbd>2</kbd> Airstrike · <kbd>3</kbd> Moon Shot — then click/tap the field</li>' +
          '<li>Hit enemy units for score. Keep hitting to build a combo and charge the Moon Shot.</li>' +
          '<li>Complete orders before the timer runs out — each level asks for more, faster.</li>' +
          '<li><b>Call the Front:</b> predict the next 30s LIVE price move for bonus XP.</li>' +
          '<li><kbd>WASD</kbd> pan · drag to orbit · scroll/pinch zoom · <kbd>F</kbd> frontline · <kbd>P</kbd> pause · <kbd>M</kbd> mute</li>' +
        '</ul>' +
        '<div class="cmd-card-actions"><button class="cmd-primary-btn" id="cmdStart">Deploy</button><button class="cmd-ghost-btn" id="cmdRestart">Restart session</button><button class="cmd-ghost-btn" id="cmdWatch">Just watch</button></div>' +
        '<div class="cmd-card-foot">Game layer only — strikes are cosmetic and never change market data, armies or the frontline. Calls are not financial advice.</div>' +
        '<div class="cmd-card-stats" id="cmdCardStats"></div>' +
      '</div>';
    doc.body.appendChild(overlay);
    var cmdBtn = h('button', 'cmd-enter-btn', '⚔ Take Command');
    cmdBtn.id = 'cmdEnter';
    cmdBtn.addEventListener('click', function () { showOverlay('intro'); });
    doc.body.appendChild(cmdBtn);

    el.root = root; el.overlay = overlay;
    ['cmdScore', 'cmdCombo', 'cmdRank', 'cmdXpBar', 'cmdLevel', 'cmdTimer', 'cmdMissionText', 'cmdMissionBar', 'cmdCall',
      'cmdCallStatus', 'cmdCallTruth', 'cmdToasts', 'cmdHit', 'cmdMute', 'cmdPause', 'cmdOverlayTitle', 'cmdCardStats', 'cmdMission', 'cmdRestart']
      .forEach(function (id) { el[id] = doc.getElementById(id); });

    root.querySelectorAll('[data-ability]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); arm(b.getAttribute('data-ability')); });
    });
    doc.getElementById('cmdLong').addEventListener('click', function () { startCall(1); });
    doc.getElementById('cmdShort').addEventListener('click', function () { startCall(-1); });
    el.cmdMute.addEventListener('click', function () { if (sfx()) { sfx().toggleMute(); renderMute(); } });
    el.cmdPause.addEventListener('click', function () { togglePause(); });
    overlay.querySelectorAll('[data-side]').forEach(function (b) {
      b.addEventListener('click', function () {
        profile.side = b.getAttribute('data-side'); save(); renderSide();
        if (sfx()) sfx().ui();
      });
    });
    doc.getElementById('cmdStart').addEventListener('click', function () { deploy(); });
    doc.getElementById('cmdWatch').addEventListener('click', function () { watchMode(); });
    el.cmdRestart.addEventListener('click', function () { newSession(); deploy(); toast('SESSION RESTARTED', 'Fresh orders, score reset', 'info'); });
    renderSide(); renderMute();
  }

  function abilityBtn(id) {
    var a = ABILITIES[id];
    return '<button class="cmd-ability ' + id + '" data-ability="' + id + '" title="' + a.name + ' (' + a.key + ') — ' + a.desc + '">' +
      '<span class="cmd-ab-ring"></span><span class="cmd-ab-icon">' + a.icon + '</span>' +
      '<span class="cmd-ab-name">' + a.name + '</span><kbd>' + a.key + '</kbd><span class="cmd-ab-cd"></span></button>';
  }

  function renderSide() {
    el.overlay.querySelectorAll('[data-side]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-side') === profile.side); });
    doc.body.setAttribute('data-cmd-side', profile.side);
  }
  function renderMute() { if (el.cmdMute) el.cmdMute.textContent = (sfx() && sfx().isMuted()) ? '🔇' : '🔊'; }

  function renderStats() {
    if (!el.cmdScore || !session) return;
    el.cmdScore.textContent = session.score.toLocaleString();
    el.cmdCombo.textContent = 'x' + session.combo;
    el.cmdCombo.classList.toggle('hot', session.combo >= 3);
    var r = rankFor(profile.xp);
    el.cmdRank.querySelector('.cmd-rank-name').textContent = r.name;
    var pct = r.next ? (profile.xp - r.floor) / (r.next - r.floor) : 1;
    el.cmdXpBar.style.width = Math.round(pct * 100) + '%';
    el.cmdRank.title = profile.xp.toLocaleString() + ' XP' + (r.next ? ' · next rank at ' + r.next.toLocaleString() : ' · max rank');
  }

  function renderAbilities() {
    if (!el.root || !session) return;
    el.root.querySelectorAll('[data-ability]').forEach(function (b) {
      var id = b.getAttribute('data-ability');
      var a = ABILITIES[id];
      var frac, label = '';
      if (id === 'moon') { frac = session.charge / 100; label = session.charge >= 100 ? 'READY' : Math.floor(session.charge) + '%'; }
      else { frac = a.cd ? 1 - cds[id] / a.cd : 1; label = cds[id] > 0 ? Math.ceil(cds[id]) + 's' : ''; }
      b.style.setProperty('--cd', (frac * 360).toFixed(1) + 'deg');
      b.classList.toggle('ready', frac >= 1);
      b.classList.toggle('armed', armed === id);
      b.querySelector('.cmd-ab-cd').textContent = label;
    });
  }

  function renderMission() {
    if (!mission || !el.cmdMissionText) return;
    el.cmdMissionText.textContent = mission.text + (mission.n > 1 ? '  (' + Math.min(mission.got, mission.n) + '/' + mission.n + ')' : '');
    el.cmdLevel.textContent = session.level;
    el.cmdTimer.textContent = Math.max(0, Math.ceil(mission.left)) + 's';
    el.cmdTimer.classList.toggle('urgent', mission.left < 10);
    el.cmdMissionBar.style.width = Math.round(Math.min(1, mission.got / mission.n) * 100) + '%';
  }

  function renderCall() {
    if (!el.cmdCall) return;
    var live = E() && E().isPriceLive();
    el.cmdCallTruth.textContent = live ? 'LIVE' : 'WAITING';
    el.cmdCallTruth.className = 'qual ' + (live ? 'live' : 'na');
    el.cmdCall.classList.toggle('active', !!call);
    el.cmdCall.classList.toggle('disabled', !live && !call);
    if (call) {
      var left = Math.max(0, (call.endsAt - performance.now()) / 1000);
      var cur = E().getPrice();
      var pct = ((cur - call.entry) / call.entry) * 100;
      var winning = (pct > 0 && call.dir > 0) || (pct < 0 && call.dir < 0);
      el.cmdCallStatus.innerHTML = (call.dir > 0 ? '▲ LONG' : '▼ SHORT') + ' · ' + left.toFixed(0) + 's · <span class="' + (pct === 0 ? '' : winning ? 'up' : 'down') + '">' + (pct >= 0 ? '+' : '') + pct.toFixed(3) + '%</span>';
    } else {
      el.cmdCallStatus.textContent = live ? '30s round · game only' : 'Needs LIVE price feed';
    }
  }

  function renderAll() { renderStats(); renderAbilities(); renderMission(); renderCall(); }

  function toast(title, body, kind, ms) {
    if (!el.cmdToasts) return;
    var t = h('div', 'cmd-toast ' + (kind || ''), '<b>' + title + '</b><span>' + (body || '') + '</span>');
    el.cmdToasts.appendChild(t);
    while (el.cmdToasts.children.length > 3) el.cmdToasts.firstChild.remove();
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, ms || 2600);
  }

  function floatText(text, worldPos, cls) {
    var s = E().worldToScreen(worldPos);
    if (s.behind) return;
    floatScreen(text, s.x, s.y, cls);
  }
  function floatScreen(text, x, y, cls) {
    var f = h('div', 'cmd-float ' + (cls || ''), text);
    f.style.left = x + 'px'; f.style.top = y + 'px';
    doc.body.appendChild(f);
    setTimeout(function () { f.remove(); }, 1100);
  }
  function hitMarker(n) {
    if (!el.cmdHit) return;
    el.cmdHit.style.left = pointer.x + 'px'; el.cmdHit.style.top = pointer.y + 'px';
    el.cmdHit.classList.remove('show'); void el.cmdHit.offsetWidth; el.cmdHit.classList.add('show');
    if (n >= 3) el.cmdHit.classList.add('multi'); else el.cmdHit.classList.remove('multi');
  }
  function pulseBtn(id) {
    var b = el.root && el.root.querySelector('[data-ability="' + id + '"]');
    if (!b) return;
    b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny');
  }

  // ---------------- Flow ----------------
  function showOverlay(mode) {
    el.overlay.classList.add('show');
    el.overlay.setAttribute('data-mode', mode);
    el.cmdOverlayTitle.textContent = mode === 'pause' ? 'Paused' : 'Take Command';
    doc.getElementById('cmdStart').textContent = mode === 'pause' ? 'Resume' : 'Deploy';
    el.cmdRestart.style.display = (mode === 'pause' && session) ? '' : 'none';
    var r = rankFor(profile.xp);
    el.cmdCardStats.innerHTML = '<span>Rank <b>' + r.name + '</b></span><span>XP <b>' + profile.xp.toLocaleString() + '</b></span><span>Best <b>' + (profile.best || 0).toLocaleString() + '</b></span><span>Best streak <b>' + (profile.bestStreak || 0) + '</b></span>';
  }
  function hideOverlay() { el.overlay.classList.remove('show'); }

  function deploy() {
    hideOverlay();
    if (!session) newSession();
    started = true;
    doc.body.classList.add('cmd-on');
    doc.body.classList.remove('cmd-watch');
    if (E().isPaused()) E().setPaused(false);
    profile.seenIntro = true; profile.watch = false; save();
    renderAll();
    if (sfx()) sfx().ui();
  }
  function watchMode() {
    hideOverlay();
    started = false;
    disarm();
    doc.body.classList.remove('cmd-on');
    doc.body.classList.add('cmd-watch');
    if (E().isPaused()) E().setPaused(false);
    profile.seenIntro = true; profile.watch = true; save();
  }
  function togglePause() {
    var eng = E();
    if (!eng) return;
    var p = !eng.isPaused();
    eng.setPaused(p);
    if (p) { disarm(); showOverlay('pause'); } else hideOverlay();
  }

  function bindInput() {
    var canvas = E().renderer.domElement;
    global.addEventListener('pointermove', function (e) {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.has = e.pointerType === 'mouse';
      if (armed && e.target === canvas) updateReticle(e.clientX, e.clientY);
    }, { passive: true });
    // Capture phase on window so an armed click never also starts an orbit drag
    global.addEventListener('pointerdown', function (e) {
      if (!armed || e.target !== canvas) return;
      e.stopPropagation();
      e.preventDefault();
      pointer.x = e.clientX; pointer.y = e.clientY;
      var p = E().pickGround(e.clientX, e.clientY);
      if (p) {
        updateReticle(e.clientX, e.clientY);
        fireAt(armed, p);
      }
    }, true);
    global.addEventListener('contextmenu', function (e) { if (armed && e.target === canvas) { e.preventDefault(); disarm(); } });
    global.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var c = e.code;
      if (c === 'Digit1' || c === 'Numpad1') arm('arty');
      else if (c === 'Digit2' || c === 'Numpad2') arm('air');
      else if (c === 'Digit3' || c === 'Numpad3') arm('moon');
      else if (c === 'KeyP' && !e.shiftKey) togglePause();
      else if (c === 'Escape') { if (armed) disarm(); else if (started || E().isPaused()) togglePause(); }
      else if (c === 'KeyM') { if (sfx()) { sfx().toggleMute(); renderMute(); } }
      else if (c === 'KeyF') { E().focusFrontline(true); }
      else if (c === 'Space' && armed && pointer.has) { e.preventDefault(); fireAt(armed, E().pickGround(pointer.x, pointer.y)); }
    });
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden && started && !E().isPaused()) togglePause();
    });
  }

  function init() {
    if (!LB.engine || !doc.body) return false;
    try {
      if (new URLSearchParams(location.search).get('commander') === '0') return false;
    } catch (_) {}
    buildHud();
    buildReticle();
    bindInput();
    newSession();
    var params = new URLSearchParams(location.search);
    if (params.get('play') === '1') deploy();
    else if (profile.seenIntro || params.get('intro') === '0') watchModeOrResume();
    else showOverlay('intro');
    return true;
  }
  function watchModeOrResume() {
    // Returning players resume how they left: command (default) or spectator
    if (profile.watch) watchMode(); else deploy();
  }

  LB.commander = {
    init: init, tick: tick, arm: arm, deploy: deploy, togglePause: togglePause,
    getState: function () { return { started: started, session: session, profile: profile, mission: mission, call: call, armed: armed, cds: cds }; },
    // test hook: fire an ability at world x/z (used by headless verification)
    debugFire: function (ability, x, z) { fireAt(ability, { x: x, z: z }); }
  };

  function boot() {
    if (LB.engine) { init(); return; }
    var tries = 0;
    var iv = setInterval(function () { if (LB.engine || ++tries > 100) { clearInterval(iv); if (LB.engine) init(); } }, 100);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
