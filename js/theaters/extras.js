/* LUNC Battlefield v12.0 — theater extras (BASIC versions, see docs/V12-ROADMAP.md). All SIMULATED / cosmetic.
 * UAV drones · attack submarines (periscope ambush + torpedo) · ICBM silos (launch display, harmless ocean splash)
 * · cyber layer (glitch pulse + radio) · weather (clear/rain/fog) · day/night cycle · extra sector (northern ridge)
 * · always-on world-map inset (theater markers + camera) · fog of war (Spectator full vision ON by default).
 * Toggles live in the Settings sheet; choices persist in localStorage `luncBattle.v12opts`. Requires theaters.js. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var E = function () { return LB.engine; }, TH = function () { return LB.theaters; };
  var KEY = 'luncBattle.v12opts';
  var opt = { weather: 'clear', daynight: false, spectator: true, inset: true, music: true };
  try { Object.assign(opt, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(opt)); } catch (_) {} }
  var THREE, root, ready = false, last = 0, drones = [], subs = [], silos = [], icbms = [], rain = null, sun = null, hemi = null, base = {};
  var fowEl = null, inset = null, ictx = null, cyberT = 20, stats = { drones: 0, subs: 0, icbm: 0, cyber: 0 };
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'HIGH'; } }
  function low() { return tierName() === 'LOW' || (E() && E().mobile); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function fx() { return LB.heavyFx; }

  function build() {
    var e = E(); THREE = e.THREE; root = new THREE.Group(); root.name = 'v12-extras'; e.scene.add(root);
    var dark = new THREE.MeshStandardMaterial({ color: 0x3a3f42, roughness: 0.6, metalness: 0.4 });
    var box = new THREE.BoxGeometry(1, 1, 1);
    function m(g, mt, x, y, z, sx, sy, sz, p) { var o = new THREE.Mesh(g, mt); o.position.set(x, y, z); o.scale.set(sx, sy, sz); (p || root).add(o); return o; }
    // UAV drones (2 per side, 1 on LOW): slow orbits over the front / enemy rear
    var nD = low() ? 1 : 2;
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < nD; i++) {
        var g = new THREE.Group(); m(box, dark, 0, 0, 0, 2.2, 0.25, 0.3, g); m(box, dark, 0, 0, 0, 0.3, 0.06, 3.6, g); m(box, dark, -1, 0.25, 0, 0.3, 0.5, 0.06, g);
        root.add(g); drones.push({ g: g, side: side, a: rnd(0, 6.28), r: rnd(18, 34), cx: side * rnd(10, 50), cz: rnd(-30, 30), y: rnd(26, 34) });
      }
      // ICBM silos behind each HQ
      var sx = side * 150, sz = -95, s = new THREE.Group(); s.position.set(sx, 0, sz); root.add(s);
      m(new THREE.CylinderGeometry(2.2, 2.4, 0.6, 16), new THREE.MeshStandardMaterial({ color: 0x77736a, roughness: 0.9 }), 0, 0, 0, 1, 1, 1, s);
      var lid = m(box, dark, 0, 0.35, 0, 3.2, 0.2, 3.2, s);
      silos.push({ g: s, lid: lid, side: side, t: rnd(60, 120), x: sx, z: sz });
      // attack submarine (one per side)
      var sub = new THREE.Group(); m(new THREE.CylinderGeometry(0.8, 0.8, 9, 10), dark, 0, 0, 0, 1, 1, 1, sub).rotation.z = Math.PI / 2;
      m(box, dark, 0.6, 1.0, 0, 1.6, 1.4, 0.6, sub); var peri = m(box, dark, 0.6, 2.4, 0, 0.12, 1.6, 0.12, sub);
      sub.position.set(side * 60, -3, 175); root.add(sub);
      subs.push({ g: sub, peri: peri, side: side, st: 'deep', t: rnd(15, 35), x: side * 60, z: 175, dir: -side });
    });
    // extra sector: northern ridge (low-poly mountains on the horizon)
    var ridgeM = new THREE.MeshStandardMaterial({ color: 0x5b6150, roughness: 1, flatShading: true });
    for (var k = 0; k < (low() ? 6 : 14); k++) { var c = new THREE.Mesh(new THREE.ConeGeometry(rnd(20, 38), rnd(18, 42), 5), ridgeM); c.position.set(-250 + k * (500 / (low() ? 6 : 14)) + rnd(-10, 10), 6, -170 - rnd(0, 25)); root.add(c); }
    // lights for day/night
    e.scene.traverse(function (o) { if (o.isDirectionalLight && !sun) sun = o; if (o.isHemisphereLight && !hemi) hemi = o; });
    if (sun) base.sun = sun.intensity; if (hemi) base.hemi = hemi.intensity;
    // rain (Points; capped)
    var n = low() ? 600 : 2200, pos = new Float32Array(n * 3);
    for (var r = 0; r < n; r++) { pos[r * 3] = rnd(-90, 90); pos[r * 3 + 1] = rnd(0, 60); pos[r * 3 + 2] = rnd(-90, 90); }
    var rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: 0xaab8c4, size: 0.18, transparent: true, opacity: 0.6, depthWrite: false }));
    rain.visible = false; rain.frustumCulled = false; root.add(rain);
    buildUi(); applyWeather(); ready = true;
  }

  // ------------------------------------------------------------------ UI
  function buildUi() {
    var host = doc.querySelector('#sheet-settings .sheet-body') || doc.body;
    var p = doc.createElement('div'); p.id = 'v12Opts'; p.className = 'v12-opts';
    p.innerHTML = '<div class="th-title">WORLD <span class="qual sim">SIMULATED</span></div>' +
      '<label>Weather <select id="v12Weather"><option value="clear">Clear</option><option value="rain">Rain</option><option value="fog">Fog</option></select></label>' +
      '<label><input type="checkbox" id="v12Day"> Day / night cycle</label>' +
      '<label><input type="checkbox" id="v12Spec"> Spectator: full vision (off = fog of war)</label>' +
      '<label><input type="checkbox" id="v12Inset"> World-map inset</label>' +
      '<label><input type="checkbox" id="v12Music"> Adaptive music</label>' +
      '<label>Volume <input type="range" id="v12Vol" min="0" max="1" step="0.05"></label>';
    host.appendChild(p);
    var $ = function (id) { return doc.getElementById(id); };
    $('v12Weather').value = opt.weather; $('v12Day').checked = opt.daynight; $('v12Spec').checked = opt.spectator; $('v12Inset').checked = opt.inset; $('v12Music').checked = opt.music;
    $('v12Vol').value = LB.sfx && LB.sfx.getVolume ? LB.sfx.getVolume() : 0.7;
    $('v12Weather').addEventListener('change', function (e) { opt.weather = e.target.value; save(); applyWeather(); });
    $('v12Day').addEventListener('change', function (e) { opt.daynight = e.target.checked; save(); if (!opt.daynight) setDay(0.5); });
    $('v12Spec').addEventListener('change', function (e) { opt.spectator = e.target.checked; save(); applyFow(); });
    $('v12Inset').addEventListener('change', function (e) { opt.inset = e.target.checked; save(); if (inset) inset.hidden = !opt.inset; });
    $('v12Music').addEventListener('change', function (e) { opt.music = e.target.checked; save(); });
    $('v12Vol').addEventListener('input', function (e) { if (LB.sfx && LB.sfx.setVolume) LB.sfx.setVolume(e.target.value); });
    // world-map inset (always-on, tap → Map sheet)
    inset = doc.createElement('canvas'); inset.id = 'worldInset'; inset.className = 'world-inset'; inset.width = 150; inset.height = 100; inset.hidden = !opt.inset;
    inset.title = 'World map — tap to open Map'; inset.addEventListener('click', function () { if (LB.dock) LB.dock.open('map'); });
    doc.body.appendChild(inset); ictx = inset.getContext('2d');
    fowEl = doc.createElement('div'); fowEl.id = 'fowOverlay'; fowEl.className = 'fow-overlay'; doc.body.appendChild(fowEl);
    applyFow();
  }
  function applyWeather() {
    var f = E().scene.fog;
    if (rain) rain.visible = opt.weather === 'rain';
    if (f && f.isFog) { if (!base.far) { base.near = f.near; base.far = f.far; } }
    doc.body.setAttribute('data-weather', opt.weather);
  }
  function applyFow() { doc.body.classList.toggle('fow-on', !opt.spectator); }
  function setDay(k) {   // k: 0 night … 0.5 noon … 1 night
    var d = Math.max(0.12, Math.sin(k * Math.PI));
    if (sun) sun.intensity = base.sun * d; if (hemi) hemi.intensity = base.hemi * (0.35 + 0.65 * d);
    doc.body.classList.toggle('night', d < 0.35);
  }

  // ------------------------------------------------------------------ tick
  var dayT = 0.5, insetT = 0, fowT = 0;
  function update() {
    var th = TH(); if (!th || !th.isEnabled()) return;
    var e = E(); if (!ready) { try { build(); } catch (err) { console.warn('[v12-extras]', err); ready = true; return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused()) return;
    var F = fx();
    for (var i = 0; i < drones.length; i++) { var d = drones[i]; d.a += dt * 0.25; d.g.position.set(d.cx + Math.cos(d.a) * d.r, d.y, d.cz + Math.sin(d.a) * d.r); d.g.rotation.y = -d.a; }
    for (var s = 0; s < subs.length; s++) tickSub(subs[s], dt, F);
    for (var k = 0; k < silos.length; k++) tickSilo(silos[k], dt, F);
    for (var q = icbms.length - 1; q >= 0; q--) tickIcbm(icbms[q], dt, F, q);
    cyberT -= dt; if (cyberT <= 0) { cyberT = rnd(35, 70); cyber(); }
    if (rain && rain.visible) { var cp = e.camera.position; rain.position.set(cp.x, 0, cp.z); var a = rain.geometry.attributes.position; for (var r = 1; r < a.array.length; r += 3) { a.array[r] -= dt * 38; if (a.array[r] < 0) a.array[r] = 60; } a.needsUpdate = true; }
    var f = e.scene.fog; if (f && f.isFog && base.far) { var tf = opt.weather === 'fog' ? 0.35 : opt.weather === 'rain' ? 0.7 : 1; f.far += (base.far * tf - f.far) * Math.min(1, dt); if (f.far < f.near + 10) f.near = f.far * 0.4; }
    if (opt.daynight) { dayT = (dayT + dt / 240) % 1; setDay(dayT); }
    insetT -= dt; if (insetT <= 0 && inset && !inset.hidden) { insetT = 0.25; drawInset(); }
    fowT -= dt; if (fowT <= 0) { fowT = 0.5; tickFow(); }
    if (LB.sfx && LB.sfx.setVolume && !opt.music) { /* music level stays 0 via intensity decay */ }
    stats.drones = drones.length; stats.subs = subs.filter(function (x) { return x.st !== 'deep'; }).length;
  }
  function tickSub(S, dt, F) {
    S.t -= dt; S.x += S.dir * dt * 1.2; if (Math.abs(S.x) > 160 || Math.abs(S.x) < 15) S.dir = -S.dir;
    var y = S.st === 'deep' ? -3 : S.st === 'periscope' ? -1.5 : -0.4;
    S.g.position.set(S.x, S.g.position.y + (y - S.g.position.y) * Math.min(1, dt), S.z); S.g.rotation.y = S.dir > 0 ? 0 : Math.PI;
    if (S.st === 'deep' && S.t <= 0) { S.st = 'periscope'; S.t = 6; }
    else if (S.st === 'periscope') { if (F && Math.random() < dt * 3) F.puff({ kind: 'dust', x: S.x + 0.6, y: 0, z: S.z, size: 0.5, grow: 1, life: 0.8, color: 0xffffff, opacity: 0.5 }); if (S.t <= 0) { torpedo(S); S.st = 'deep'; S.t = rnd(30, 55); } }
  }
  function torpedo(S) {
    var ships = TH()._ships ? TH()._ships() : [], tgt = null, bd = 1e9;
    for (var i = 0; i < ships.length; i++) { var o = ships[i]; if (o.side === S.side || o.st !== 'sail') continue; var d = Math.abs(o.x - S.x) + Math.abs(o.z - S.z); if (d < bd) { bd = d; tgt = o; } }
    if (!tgt) return;
    var F = fx(), steps = 10;
    for (var k = 0; k < steps; k++) (function (k) { setTimeout(function () { if (!F) return; var t = k / steps; F.puff({ kind: 'dust', x: S.x + (tgt.x - S.x) * t, y: 0, z: S.z + (tgt.z - S.z) * t, size: 0.6, grow: 1, life: 1.5, color: 0xdfeef2, opacity: 0.6 }); if (k === steps - 1) { TH().onStrike(tgt.x, tgt.z, 1.4); TH().splash(tgt.x, tgt.z, 1.8); } }, k * 220); })(k);
    if (LB.ai && LB.ai.send) LB.ai.send({ side: S.side, type: 'sub', text: (S.side < 0 ? 'BULL' : 'BEAR') + ' SUB: "Periscope depth — torpedo away." (SIMULATED)' });
  }
  function tickSilo(S, dt, F) {
    S.t -= dt;
    if (S.t < 6 && S.t > 0) S.lid.position.x = Math.min(3.4, (6 - S.t) * 0.7);
    if (S.t <= 0) {
      S.t = rnd(150, 260); S.lid.position.x = 0; stats.icbm++;
      var THREE_ = THREE, g = new THREE_.Mesh(new THREE_.CylinderGeometry(0.5, 0.5, 5, 8), new THREE_.MeshStandardMaterial({ color: 0xe8e4da }));
      g.position.set(S.x, 2, S.z); root.add(g);
      icbms.push({ g: g, t: 0, x0: S.x, z0: S.z, x1: -S.side * rnd(40, 140), z1: rnd(190, 215), side: S.side });
      if (LB.ai && LB.ai.send) LB.ai.send({ side: S.side, type: 'icbm', text: 'Strategic test launch — inert payload, ocean range (SIMULATED · game FX)' });
    }
  }
  function tickIcbm(M, dt, F, idx) {
    M.t += dt / 14; var t = M.t;
    var x = M.x0 + (M.x1 - M.x0) * t, z = M.z0 + (M.z1 - M.z0) * t, y = 2 + Math.sin(Math.PI * t) * 160;
    M.g.position.set(x, y, z); M.g.rotation.z = (t - 0.5) * 2.2 * -Math.sign(M.x1 - M.x0);
    if (F && Math.random() < 0.7) F.puff({ kind: 'smoke', x: x, y: y - 2, z: z, size: 2, grow: 1.6, life: 3, color: 0xe2e0dc, opacity: 0.45 });
    if (t >= 1) { root.remove(M.g); M.g.geometry.dispose(); icbms.splice(idx, 1); if (TH().splash) TH().splash(M.x1, M.z1, 3); }
  }
  function cyber() {
    stats.cyber++;
    doc.body.classList.add('cyber-glitch'); setTimeout(function () { doc.body.classList.remove('cyber-glitch'); }, 900);
    var side = Math.random() < 0.5 ? -1 : 1;
    if (LB.ai && LB.ai.send) LB.ai.send({ side: side, type: 'cyber', text: (side < 0 ? 'BULL' : 'BEAR') + ' CYBER: radar spoofing on the enemy airbase — brief static (SIMULATED)' });
  }
  function drawInset() {
    var c = ictx, W = 150, H = 100, B = TH().bounds, sx = W / (B.maxX - B.minX), sz = H / (B.maxZ - B.minZ);
    var X = function (x) { return (x - B.minX) * sx; }, Z = function (z) { return (z - B.minZ) * sz; };
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(52,64,44,.9)'; c.fillRect(0, 0, W, Z(62));
    c.fillStyle = 'rgba(30,72,92,.9)'; c.fillRect(0, Z(62), W, H - Z(62));
    var fx0 = E().getFrontlineX(); c.fillStyle = 'rgba(73,211,154,.35)'; c.fillRect(0, 0, X(fx0), Z(62)); c.fillStyle = 'rgba(255,123,114,.3)'; c.fillRect(X(fx0), 0, W - X(fx0), Z(62));
    c.strokeStyle = '#ffd36a'; c.beginPath(); c.moveTo(X(fx0), Z(-45)); c.lineTo(X(fx0), Z(45)); c.stroke();
    var V = TH().VIEWS; c.fillStyle = '#fff'; c.font = '8px sans-serif';
    ['airW', 'airE', 'naval', 'bullHq', 'bearHq'].forEach(function (k) { var v = V[k]; c.fillRect(X(v.x) - 1.5, Z(v.z) - 1.5, 3, 3); });
    var sh = TH()._ships(); for (var i = 0; i < sh.length; i++) { c.fillStyle = sh[i].st === 'sail' ? (sh[i].side < 0 ? '#7cf0a8' : '#ff8a80') : '#555'; c.fillRect(X(sh[i].x) - 1, Z(sh[i].z) - 1, 2, 2); }
    var jt = TH()._jets(); for (var j = 0; j < jt.length; j++) { if (!jt[j].g.visible) continue; c.fillStyle = jt[j].side < 0 ? '#bfffd9' : '#ffd0cb'; c.fillRect(X(jt[j].x), Z(jt[j].z), 1.5, 1.5); }
    // camera view: target dot + frustum-ish wedge
    var e = E(), T = e.getCameraTarget(), cp = e.camera.position, dist = Math.hypot(cp.x - T.x, cp.z - T.z) + 1;
    var w = Math.max(4, cp.distanceTo(T) * 0.6 * sx);
    var ang = Math.atan2(T.z - cp.z, T.x - cp.x);
    c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.beginPath(); c.moveTo(X(cp.x), Z(cp.z));
    c.lineTo(X(T.x) + Math.cos(ang + Math.PI / 2) * w, Z(T.z) + Math.sin(ang + Math.PI / 2) * w); c.lineTo(X(T.x) - Math.cos(ang + Math.PI / 2) * w, Z(T.z) - Math.sin(ang + Math.PI / 2) * w); c.closePath(); c.stroke();
  }
  // Fog of war (basic): enemy aircraft/ships far from friendly units are hidden; screen-edge darkening overlay.
  function tickFow() {
    var fow = !opt.spectator, side = LB.commander && LB.commander.getState ? (LB.commander.getState().profile.side === 'bull' ? -1 : 1) : -1;
    var sh = TH()._ships(), jt = TH()._jets();
    function seen(x, z) { if (!fow) return true; if (side < 0 ? x < -10 : x > 10) return true; for (var i = 0; i < jt.length; i++) { var j = jt[i]; if (j.side === side && j.g.visible && Math.hypot(j.x - x, j.z - z) < 60) return true; } for (var k = 0; k < drones.length; k++) { var d = drones[k]; if (d.side === side && Math.hypot(d.g.position.x - x, d.g.position.z - z) < 50) return true; } return false; }
    for (var i = 0; i < sh.length; i++) if (sh[i].side !== side) sh[i].g.visible = seen(sh[i].x, sh[i].z);
    for (var j = 0; j < jt.length; j++) if (jt[j].side !== side && jt[j].st !== 'dead') jt[j].g.visible = seen(jt[j].x, jt[j].z);
    for (var s = 0; s < subs.length; s++) if (subs[s].side !== side) subs[s].g.visible = !fow || subs[s].st !== 'deep';
  }

  LB.v12extras = { update: update, getOptions: function () { return Object.assign({}, opt); }, getStats: function () { return Object.assign({}, stats); },
    setWeather: function (w) { opt.weather = w; save(); applyWeather(); }, setSpectator: function (v) { opt.spectator = !!v; save(); applyFow(); }, cyber: cyber,
    launchTest: function () { if (silos[0]) silos[0].t = 0.01; } };
})(window);
