/* LUNC Battlefield v12.0.8 — fuller fog of war (v12.1). Game/view layer.
 * Per-faction visibility grid (8 u cells over the whole world) recomputed twice a second while Spectator full vision is
 * OFF. Vision: own army (sampled), HQ/airbase radar (90 u, blinded 20 s when the enemy hacks your side), own jets (60),
 * UAV drones (50), defenses (26), supply depots (20), recon-sweep / intel-crate reveals; your half of the land front.
 * Fog ×0.6, rain ×0.8, night ×0.7. Enemy ships/jets/subs/defenses/columns outside vision are hidden (extras/forts/lines
 * ask LB.fow.visible). Last-known ghosts on the world-map inset, a soft dark layer over unseen ground.
 * The market-driven armies and the frontline are always shown (data truth). ?fow=0 → old simple fog. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('fow') !== '0' && qs.get('theaters') !== '0';
  var CELL = 8, B = { minX: -260, maxX: 260, minZ: -120, maxZ: 230 }, NX, NZ, vis, seenEver, tex, plane, THREE;
  var ready = false, last = 0, T = 0, active = false, radarDown = { '-1': 0, '1': 0 }, ghosts = {}, stats = { cells: 0, visible: 0, sources: 0, hidden: 0, ghosts: 0, mult: 1, radarDown: false, ms: 0 };
  function E() { return LB.engine; }
  function TH() { return LB.theaters; }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function low() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function spectator() { try { return LB.v12extras.getOptions().spectator !== false; } catch (_) { return true; } }
  function build() {
    THREE = E().THREE; if (TH() && TH().bounds) B = TH().bounds;
    NX = Math.ceil((B.maxX - B.minX) / CELL); NZ = Math.ceil((B.maxZ - B.minZ) / CELL);
    vis = new Uint8Array(NX * NZ); seenEver = new Uint8Array(NX * NZ); stats.cells = NX * NZ;
    var data = new Uint8Array(NX * NZ * 4);
    tex = new THREE.DataTexture(data, NX, NZ, THREE.RGBAFormat); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    var m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    plane = new THREE.Mesh(new THREE.PlaneGeometry(B.maxX - B.minX, B.maxZ - B.minZ), m);
    plane.rotation.x = -Math.PI / 2; plane.position.set((B.minX + B.maxX) / 2, 0.9, (B.minZ + B.maxZ) / 2); plane.renderOrder = 3; plane.visible = false; plane.name = 'v12-fow';
    E().scene.add(plane);
    wrapAi();
  }
  function wrapAi() {   // cyber hacks blind the victim's radar (retried until LB.ai exists)
    if (!LB.ai || !LB.ai.send || LB.ai.send._fow) return;
    var s0 = LB.ai.send, g = function (msg) { try { if (msg && msg.type === 'cyber' && (msg.side === -1 || msg.side === 1)) radarDown[String(-msg.side)] = 20; } catch (_) {} return s0.apply(this, arguments); };
    g._fow = true; g._snd = s0._snd; LB.ai.send = g;
  }
  function mult() {
    var w = 'clear'; try { w = LB.v12extras.getOptions().weather; } catch (_) {}
    return (w === 'fog' ? 0.6 : w === 'rain' ? 0.8 : 1) * (doc.body.classList.contains('night') ? 0.7 : 1);
  }
  function stamp(x, z, r) {
    var c0 = Math.max(0, Math.floor((x - r - B.minX) / CELL)), c1 = Math.min(NX - 1, Math.floor((x + r - B.minX) / CELL));
    var r0 = Math.max(0, Math.floor((z - r - B.minZ) / CELL)), r1 = Math.min(NZ - 1, Math.floor((z + r - B.minZ) / CELL)), rr = r * r;
    for (var j = r0; j <= r1; j++) { var cz = B.minZ + (j + 0.5) * CELL - z; for (var i = c0; i <= c1; i++) { var cx = B.minX + (i + 0.5) * CELL - x; if (cx * cx + cz * cz <= rr) vis[j * NX + i] = 1; } }
    stats.sources++;
  }
  function compute() {
    var t0 = performance.now(), side = playerSide(), k = mult(), th = TH(), fx = 0, i;
    vis.fill(0); stats.sources = 0; stats.mult = +k.toFixed(2);
    try { fx = E().getFrontlineX() || 0; } catch (_) {}
    // own half of the land front (x on your side of the front, land only)
    for (var j = 0; j < NZ; j++) { var z = B.minZ + (j + 0.5) * CELL; if (z > 60) continue; for (i = 0; i < NX; i++) { var x = B.minX + (i + 0.5) * CELL; if ((x - fx) * side > -6) vis[j * NX + i] = 1; } }
    try { var a = E().getArmies(), arr = side < 0 ? a.bulls : a.bears, step = low() ? 6 : 3; for (i = 0; i < arr.length; i += step) { var u = arr[i]; if (u && u.position) stamp(u.position.x, u.position.z, 28 * k); } } catch (_) {}
    var sk = String(side); stats.radarDown = radarDown[sk] > 0;
    if (!stats.radarDown) { stamp(side * 205, -55, 90 * k); stamp(side * 205, -10, 70 * k); }
    if (th && th._jets) th._jets().forEach(function (J) { if (J.side === side && J.g && J.g.visible && J.st !== 'dead' && J.st !== 'parked') stamp(J.x, J.z, 60 * k); });
    if (th && th._ships) th._ships().forEach(function (S) { if (S.side === side && S.st === 'sail') stamp(S.x, S.z, 45 * k); });
    if (LB.v12extras && LB.v12extras._drones) LB.v12extras._drones().forEach(function (d) { if (d.side === side) stamp(d.x, d.z, 50 * k); });
    if (LB.forts && LB.forts.list) LB.forts.list().forEach(function (f) { if (f.side === side) stamp(f.x, f.z, 26 * k); });
    if (LB.lines && LB.lines.depots) LB.lines.depots().forEach(function (d) { if (d.side === side && d.hp > 0) stamp(d.x, d.z, 20 * k); });
    if (LB.ridge && LB.ridge.visionFor) LB.ridge.visionFor(side).forEach(function (v) { stamp(v.x, v.z, v.r * k); });   // v12.0.21 Hill 402 OP + ridge team
    if (LB.supply && LB.supply.revealed) for (j = 0; j < NZ; j += 1) for (i = 0; i < NX; i += 1) { var c = j * NX + i; if (!vis[c] && LB.supply.revealed(B.minX + (i + 0.5) * CELL, B.minZ + (j + 0.5) * CELL)) vis[c] = 1; }
    var n = 0, d = tex.image.data;
    for (i = 0; i < vis.length; i++) { if (vis[i]) { n++; seenEver[i] = 1; } d[i * 4] = 6; d[i * 4 + 1] = 9; d[i * 4 + 2] = 14; d[i * 4 + 3] = vis[i] ? 0 : seenEver[i] ? 120 : 165; }
    tex.needsUpdate = true; stats.visible = n; stats.ms = +(performance.now() - t0).toFixed(2);
  }
  function visibleAt(x, z) {
    if (!active) return true;
    var i = Math.floor((x - B.minX) / CELL), j = Math.floor((z - B.minZ) / CELL);
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return false;
    return !!vis[j * NX + i];
  }
  function trackGhosts() {   // last-known positions of hidden enemy ships / jets
    var side = playerSide(), th = TH(), now = performance.now(), hidden = 0;
    if (th && th._ships) th._ships().forEach(function (S, i) { if (S.side === side || S.st !== 'sail') return; if (visibleAt(S.x, S.z)) delete ghosts['s' + i]; else { hidden++; if (!ghosts['s' + i]) ghosts['s' + i] = { x: S.x, z: S.z, t: now, k: 'ship' }; } });
    if (th && th._jets) th._jets().forEach(function (J, i) { if (J.side === side || J.st === 'parked' || J.st === 'dead') return; if (visibleAt(J.x, J.z)) delete ghosts['j' + i]; else { hidden++; if (!ghosts['j' + i]) ghosts['j' + i] = { x: J.x, z: J.z, t: now, k: 'jet' }; } });
    for (var g in ghosts) if (now - ghosts[g].t > 45000) delete ghosts[g];
    stats.hidden = hidden; stats.ghosts = Object.keys(ghosts).length;
  }
  function update() {
    if (!enabled) return;
    var th = TH(); if (!th || !th.isEnabled || !th.isEnabled()) return;
    var e = E(); if (!e || !e.THREE) return;
    if (!ready) { try { build(); ready = true; } catch (err) { enabled = false; console.warn('[fow] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    var was = active; active = !spectator(); if (active && !was) { compute(); trackGhosts(); T = 0.5; }   // first frame of fog: no blank grid
    plane.visible = active && !doc.body.hasAttribute('data-cutscene');
    if (e.isPaused()) return;
    for (var k in radarDown) if (radarDown[k] > 0) radarDown[k] -= dt;
    T -= dt; if (T <= 0) { T = 0.5; wrapAi(); if (active) { compute(); trackGhosts(); } }
  }
  LB.fow = {
    isEnabled: function () { return enabled && ready; }, isActive: function () { return enabled && ready && active; }, update: update, visible: visibleAt,
    ghosts: function () { var o = []; for (var g in ghosts) o.push(ghosts[g]); return o; },
    getStats: function () { return Object.assign({ active: active, radarDownS: Object.assign({}, radarDown) }, stats); },
    clearRadar: function (side) { radarDown[String(side)] = 0; },   // v12.0.18 counter-hack
    _compute: function () { if (ready) { active = !spectator(); if (active) { compute(); trackGhosts(); } } }
  };
})(window);
