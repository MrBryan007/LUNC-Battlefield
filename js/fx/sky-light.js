/* LUNC Battlefield v12.0.51 — realism pass: sun, sky and night lights. Visual layer only.
 * Runs only while the day/night cycle is on or a mission holds the time of day (LB.v12extras.getDayK() != null), so the
 * default noon look is unchanged. Sun path: the key light swings east → west and sinks toward the horizon (longer
 * shadows at dusk); its colour follows the elevation (noon white → golden hour → red-orange sunset → a cool moon key at
 * night). Hemisphere sky / ground, fill and rim colours, the sky dome (zenith, horizon, sun glow), fog and background
 * follow (blue haze → amber dusk → deep navy). Stars fade in at twilight. Night lights are all fake (one Points draw
 * call + additive ground pools; no real lights are added, so no shader recompiles): runway edge / threshold / end /
 * taxi lights, a sequenced approach strobe, tower and radar beacons, sodium flood masts with orange light pools on both
 * airbases and both HQ bases, aircraft navigation lights (red port, green starboard, white tail strobe, red beacon)
 * on flying jets, and ship navigation lights (masthead, red port, green starboard, stern). Lights on hidden (fog of
 * war) jets and ships stay off. Never touches market data, armies, the front or data-truth labels. ?skylight=0 → off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('skylight') !== '0' && qs.get('theaters') !== '0';
  var BASE_X = 205, BASE_Z = -55;
  var THREE = null, ready = false, active = false, last = 0, dynT = 0;
  var L = {}, base = null, stars = null, pts = null, pools = [], masts = null, heads = null, statics = [], dyn = [], cap = 0, nStatic = 0;
  var st = { k: null, sun: 1, night: 0, golden: 0, lightsOn: 0, statics: 0, dynamic: 0, navJets: 0, navShips: 0, stars: 0, pools: 0, masts: 0, elev: 0, az: 0 };
  var C = {};   // palette (sRGB)

  function E() { return LB.engine; }
  function TH() { return LB.theaters; }
  function tierName() { try { return LB.quality.getEffectiveName(); } catch (_) { return 'MEDIUM'; } }
  function low() { var t = tierName(); return t === 'LOW' || !!(E() && E().mobile); }
  function H(x, z) { try { return (LB.los && LB.los.ground ? LB.los.ground(x, z) : E().terrainHeight(x, z)) || 0; } catch (_) { return 0; } }
  function hqX() { try { var c = LB.config; return (c && c.layout && c.layout.hqX) || 96; } catch (_) { return 96; } }
  function sstep(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function dayK() { try { var X = LB.v12extras; return X && X.getDayK ? X.getDayK() : null; } catch (_) { return null; } }
  function weather() { try { return LB.v12extras.getOptions().weather; } catch (_) { return 'clear'; } }

  // ---------------------------------------------------------------- build
  function glowTex(stops) {
    var c = doc.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); }); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c); return t;
  }
  function findLights(scene) {
    var dirs = [];
    scene.traverse(function (o) { if (o.isDirectionalLight) dirs.push(o); if (o.isHemisphereLight && !L.hemi) L.hemi = o; if (o.name === 'sky' && o.material && o.material.uniforms && o.material.uniforms.zenith) L.sky = o; });
    L.sun = dirs.filter(function (d) { return d.castShadow; })[0] || dirs[0] || null;
    dirs.forEach(function (d) { if (d === L.sun) return; if (!L.fill && d.color.getHex() === 0x7aa0c8) L.fill = d; else if (!L.rim && d.color.getHex() === 0xffe6c4) L.rim = d; });
  }
  function capture() {
    var e = E(), s = e.scene, b = { sunPos: L.sun ? L.sun.position.clone() : null, sunCol: L.sun ? L.sun.color.clone() : null };
    if (L.hemi) { b.hemiSky = L.hemi.color.clone(); b.hemiGround = L.hemi.groundColor.clone(); }
    if (L.fill) b.fillCol = L.fill.color.clone(); if (L.rim) b.rimCol = L.rim.color.clone();
    if (s.fog && s.fog.color) b.fog = s.fog.color.clone();
    if (s.background && s.background.isColor) b.bg = s.background.clone();
    if (L.sky) { var u = L.sky.material.uniforms; b.zen = u.zenith.value.clone(); b.hor = u.horizon.value.clone(); b.sunU = u.sunColor.value.clone(); b.sunDirRef = u.sunDir.value; b.sunDir = u.sunDir.value.clone(); }
    var p = b.sunPos || new THREE.Vector3(-38, 36, 18); b.dist = p.length(); b.el = Math.asin(p.y / b.dist); b.az = Math.atan2(p.z, p.x);
    return b;
  }
  function addStatic(x, y, z, col, size, kind, ph) { statics.push({ x: x, y: y, z: z, c: col, s: size, k: kind || 'steady', ph: ph || 0 }); }
  function buildStatics() {
    var lo = low(), WHITE = [1, 0.9, 0.74], GREEN = [0.3, 1, 0.45], RED = [1, 0.18, 0.12], BLUE = [0.3, 0.5, 1], SODIUM = [1, 0.6, 0.24];
    [-1, 1].forEach(function (side) {
      var ox = side * BASE_X, oz = BASE_Z, step = lo ? 10 : 5;
      for (var x = -35; x <= 35.01; x += step) { addStatic(ox + x, 0.08, oz - 3.75, WHITE, 0.55); addStatic(ox + x, 0.08, oz + 3.75, WHITE, 0.55); }
      for (var zz = -3; zz <= 3.01; zz += lo ? 2 : 1) { [-1, 1].forEach(function (e) { addStatic(ox + e * 35.6, 0.08, oz + zz, GREEN, 0.5); addStatic(ox + e * 36.4, 0.08, oz + zz, RED, 0.5); }); }
      for (var i = 0; i < (lo ? 4 : 7); i++) addStatic(ox + side * (40 + i * 5), 0.3, oz, [1, 1, 1], 0.9, 'rabbit', i / (lo ? 4 : 7));   // approach strobe runs toward the runway
      for (var t = 1; t <= 34; t += lo ? 6 : 3) addStatic(ox - side * t, 0.06, oz - 5.2, BLUE, 0.38);
      addStatic(ox + side * 26, 9.9, oz - 12, [1, 1, 1], 0.9, 'beaconW'); addStatic(ox + side * 26, 9.9, oz - 12, GREEN, 0.9, 'beaconG');   // tower beacon (white / green)
      addStatic(ox + side * 34, 6.1, oz - 20, RED, 0.6, 'slow', side > 0 ? 0.5 : 0);   // radar obstruction light
      [-4, -18, -32].forEach(function (mx) { mastAt(ox + side * mx, oz - 6.4, ox + side * mx, oz - 13, SODIUM); });   // apron flood masts
    });
    // HQ bases: two masts behind each HQ
    var hq = hqX();
    [-1, 1].forEach(function (side) { [-16, 16].forEach(function (z) { var mx = side * (hq + 14); mastAt(mx, z, side * (hq + 7), z * 0.6, SODIUM); }); });
  }
  var mastList = [];
  function mastAt(x, z, px, pz, col) {
    var y = H(x, z); mastList.push({ x: x, y: y, z: z }); addStatic(x, y + 11.2, z, col, 1.7, 'sodium');
    pools.push({ x: px, z: pz, r: 12 });
  }
  function buildMeshes() {
    var e = E(), scene = e.scene, lo = low();
    // mast poles + lamp heads (instanced: two draw calls for all masts)
    var metal = new THREE.MeshStandardMaterial({ color: 0x6b706c, roughness: 0.55, metalness: 0.6 });
    var headM = new THREE.MeshStandardMaterial({ color: 0x3a3d3c, roughness: 0.5, metalness: 0.5, emissive: new THREE.Color(0xffa040), emissiveIntensity: 0 });
    masts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.17, 11, 6), metal, mastList.length);
    heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1.3, 0.35, 0.7), headM, mastList.length);
    var m4 = new THREE.Matrix4();
    mastList.forEach(function (m, i) { m4.makeTranslation(m.x, m.y + 5.5, m.z); masts.setMatrixAt(i, m4); m4.makeTranslation(m.x, m.y + 11.1, m.z); heads.setMatrixAt(i, m4); });
    masts.castShadow = heads.castShadow = !lo; masts.name = 'skylight-masts'; heads.name = 'skylight-heads';
    scene.add(masts); scene.add(heads); st.masts = mastList.length;
    // light pools (terrain-following additive discs)
    var poolTex = glowTex([[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    var poolM = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xff9a45, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
    pools.forEach(function (p) {
      var g = new THREE.PlaneGeometry(p.r * 2, p.r * 2, 8, 8); g.rotateX(-Math.PI / 2);
      var a = g.attributes.position; for (var i = 0; i < a.count; i++) a.setY(i, H(p.x + a.getX(i), p.z + a.getZ(i)) + 0.18);
      a.needsUpdate = true; var mesh = new THREE.Mesh(g, poolM); mesh.position.set(p.x, 0, p.z); mesh.renderOrder = 3; mesh.visible = false; mesh.name = 'skylight-pool'; scene.add(mesh); p.mesh = mesh;
    });
    L.poolM = poolM; L.headM = headM; st.pools = pools.length;
    // stars
    var n = lo ? 500 : 1400, sp = new Float32Array(n * 3), seed = 7;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (var s = 0; s < n; s++) { var u = rnd(), v = rnd(), th = u * Math.PI * 2, ph = Math.acos(1 - v * 0.95); sp[s * 3] = Math.sin(ph) * Math.cos(th) * 1000; sp[s * 3 + 1] = Math.cos(ph) * 1000 + 30; sp[s * 3 + 2] = Math.sin(ph) * Math.sin(th) * 1000; }
    var sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: lo ? 1.6 : 1.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    stars.frustumCulled = false; stars.renderOrder = -9; stars.visible = false; stars.name = 'skylight-stars'; scene.add(stars); st.stars = n;
    // night lights: one Points draw call
    nStatic = statics.length; cap = nStatic + (lo ? 60 : 160);
    var pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap);
    statics.forEach(function (q, i) { pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z; col[i * 3] = q.c[0]; col[i * 3 + 1] = q.c[1]; col[i * 3 + 2] = q.c[2]; size[i] = q.s; alpha[i] = 1; });
    var g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g2.setAttribute('lcol', new THREE.BufferAttribute(col, 3));
    g2.setAttribute('lsize', new THREE.BufferAttribute(size, 1)); g2.setAttribute('lalpha', new THREE.BufferAttribute(alpha, 1));
    g2.setDrawRange(0, nStatic);
    var mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uOn: { value: 0 } },
      vertexShader: 'attribute vec3 lcol; attribute float lsize; attribute float lalpha; uniform float uScale; uniform float uOn; varying vec3 vC; varying float vA;\n' +
        'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float d = max(-mv.z, 1.0);\n' +
        '  gl_PointSize = clamp(lsize * uScale / d, 1.6, 56.0); vC = lcol; vA = lalpha * uOn * clamp(1.15 - d / 1100.0, 0.3, 1.0); if (lalpha <= 0.001) gl_PointSize = 0.0; }',
      fragmentShader: 'varying vec3 vC; varying float vA;\nvoid main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0) discard;\n' +
        '  float core = exp(-r * 9.0), halo = exp(-r * 2.5) * 0.4; gl_FragColor = vec4(min(vC * (core * 1.6 + halo) + vec3(core * 0.35), vec3(1.0)), (core + halo) * vA); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    pts = new THREE.Points(g2, mat); pts.frustumCulled = false; pts.renderOrder = 6; pts.visible = false; pts.name = 'skylight-lights'; scene.add(pts);
    st.statics = nStatic;
  }
  function build() {
    var e = E(); if (!e || !e.THREE || !e.scene) return false;
    THREE = e.THREE; findLights(e.scene); base = capture();
    C = {
      golden: new THREE.Color(0xffa35c), sunset: new THREE.Color(0xff6e45), moon: new THREE.Color(0x8fa6d6),
      hemiDusk: new THREE.Color(0xcfa58c), hemiNight: new THREE.Color(0x26344f), gDusk: new THREE.Color(0x3b2a20), gNight: new THREE.Color(0x0d0f15),
      zenDusk: new THREE.Color(0x34416e), zenNight: new THREE.Color(0x050914), horDusk: new THREE.Color(0xf09a5c), horNight: new THREE.Color(0x141c30),
      fogDusk: new THREE.Color(0xb88a6c), fogNight: new THREE.Color(0x0e131d), fillNight: new THREE.Color(0x3a4f7a), rimDusk: new THREE.Color(0xffb37a)
    };
    ['zenDusk', 'zenNight', 'horDusk', 'horNight'].forEach(function (k) { C[k + 'L'] = C[k].clone().convertSRGBToLinear(); });
    C.tmp = new THREE.Color(); C.v = new THREE.Vector3(); C.v2 = new THREE.Vector3(); C.dir = new THREE.Vector3(); C.sunDirU = new THREE.Vector3();
    buildStatics(); buildMeshes(); ready = true; return true;
  }

  // ---------------------------------------------------------------- dynamic nav lights (jets, ships)
  var JET_OFF = [[-0.8, 0, -1.35, 'r'], [-0.8, 0, 1.35, 'g'], [-1.5, 0.45, 0, 'strobe'], [0, 0.32, 0, 'beacon']];
  function shipOff(kind) { var Lh = kind === 'carrier' ? 22 : kind === 'battleship' ? 15 : 9, b = kind === 'carrier' ? 2.7 : Lh * 0.085, mh = kind === 'carrier' ? 6.4 : kind === 'battleship' ? 4.6 : 3.6; return [[Lh * 0.1, mh, 0, 'w'], [Lh * 0.05, 2.3, -b - 0.1, 'r'], [Lh * 0.05, 2.3, b + 0.1, 'g'], [-Lh * 0.5, 1.7, 0, 'w']]; }
  function relink() {
    dyn = []; var th = TH(); if (!th || !th._jets) return;
    var jets = th._jets() || [], ships = th._ships() || [];
    jets.forEach(function (J) { JET_OFF.forEach(function (o) { dyn.push({ obj: J, g: J.g, o: o, jet: true }); }); });
    ships.forEach(function (S) { shipOff(S.kind).forEach(function (o) { dyn.push({ obj: S, g: S.g, o: o, jet: false }); }); });
    if (dyn.length > cap - nStatic) dyn.length = cap - nStatic;
  }
  function shown(g) { for (var o = g; o; o = o.parent) if (!o.visible) return false; return true; }
  var COLS = { r: [1, 0.12, 0.08], g: [0.2, 1, 0.4], w: [1, 0.95, 0.85], strobe: [1, 1, 1], beacon: [1, 0.15, 0.1] };
  function writeDyn(now) {
    var g2 = pts.geometry, P = g2.attributes.position.array, Cc = g2.attributes.lcol.array, S = g2.attributes.lsize.array, A = g2.attributes.lalpha.array, t = now / 1000, nj = 0, ns = 0;
    for (var i = 0; i < dyn.length; i++) {
      var d = dyn[i], j = nStatic + i, on = false, ob = d.obj;
      if (d.jet) on = ob.st !== 'parked' && ob.st !== 'dead' && ob.st !== 'hangar' && ob.hp > 0 && shown(d.g);
      else on = ob.st !== 'sink' && ob.st !== 'hulk' && ob.hp > 0 && shown(d.g);
      var a = 0;
      if (on) {
        C.v.set(d.o[0], d.o[1], d.o[2]); d.g.localToWorld(C.v);
        P[j * 3] = C.v.x; P[j * 3 + 1] = C.v.y; P[j * 3 + 2] = C.v.z;
        var k = d.o[3], c = COLS[k]; Cc[j * 3] = c[0]; Cc[j * 3 + 1] = c[1]; Cc[j * 3 + 2] = c[2];
        if (k === 'strobe') { a = ((t + i * 0.13) % 1.2) < 0.07 ? 1 : 0; S[j] = 1.1; }
        else if (k === 'beacon') { a = ((t + i * 0.21) % 1.0) < 0.12 ? 1 : 0.05; S[j] = 0.8; }
        else { a = 1; S[j] = d.jet ? 0.55 : 0.65; }
        if (d.jet) nj++; else ns++;
      }
      A[j] = a;
    }
    st.navJets = nj; st.navShips = ns; st.dynamic = dyn.length;
    g2.setDrawRange(0, nStatic + dyn.length);
    g2.attributes.position.needsUpdate = true; g2.attributes.lcol.needsUpdate = true; g2.attributes.lsize.needsUpdate = true; g2.attributes.lalpha.needsUpdate = true;
  }
  function blinkStatics(now) {
    var A = pts.geometry.attributes.lalpha.array, t = now / 1000;
    for (var i = 0; i < nStatic; i++) {
      var q = statics[i];
      if (q.k === 'rabbit') { var ph = (t * 2) % 1; A[i] = Math.abs(ph - q.ph) < 0.07 ? 1 : 0; }
      else if (q.k === 'beaconW') A[i] = (t % 1.5) < 0.12 ? 1 : 0;
      else if (q.k === 'beaconG') A[i] = ((t + 0.75) % 1.5) < 0.12 ? 1 : 0;
      else if (q.k === 'slow') A[i] = ((t + q.ph) % 2) < 1 ? 1 : 0.1;
    }
  }

  // ---------------------------------------------------------------- per frame
  function restore() {
    if (!base) return;
    var e = E(), s = e.scene;
    if (L.sun && base.sunPos) { L.sun.position.copy(base.sunPos); L.sun.color.copy(base.sunCol); }
    if (L.hemi && base.hemiSky) { L.hemi.color.copy(base.hemiSky); L.hemi.groundColor.copy(base.hemiGround); }
    if (L.fill && base.fillCol) L.fill.color.copy(base.fillCol); if (L.rim && base.rimCol) L.rim.color.copy(base.rimCol);
    if (s.fog && base.fog) s.fog.color.copy(base.fog); if (s.background && s.background.isColor && base.bg) s.background.copy(base.bg);
    if (L.sky && base.zen) { var u = L.sky.material.uniforms; u.zenith.value.copy(base.zen); u.horizon.value.copy(base.hor); u.sunColor.value.copy(base.sunU); u.sunDir.value = base.sunDirRef; }
    if (stars) stars.visible = false; if (pts) pts.visible = false; pools.forEach(function (p) { if (p.mesh) p.mesh.visible = false; }); if (L.headM) L.headM.emissiveIntensity = 0;
    active = false; st.k = null; st.night = 0; st.golden = 0; st.lightsOn = 0;
  }
  function apply(k, now) {
    var e = E(), sc = e.scene, s = Math.max(0, Math.sin(k * Math.PI));
    var N = sstep(0.3, 0.12, s), G = sstep(0.75, 0.3, s) * (1 - N), Lon = sstep(0.45, 0.25, s), wx = weather();
    st.k = +k.toFixed(3); st.sun = +s.toFixed(3); st.night = +N.toFixed(3); st.golden = +G.toFixed(3); st.lightsOn = +Lon.toFixed(3);
    // sun path: noon (k 0.5) = the baseline direction; east → west through the day, lower toward dusk; moon at night
    var el = base.el * (0.22 + 0.78 * sstep(0.12, 1, s)), az = base.az + (k - 0.5) * 1.7;
    C.dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    C.v2.set(Math.cos(0.8) * Math.cos(base.az + 2.2), Math.sin(0.8), Math.cos(0.8) * Math.sin(base.az + 2.2));   // moon: high, opposite side
    C.dir.lerp(C.v2, N).normalize();
    st.elev = +(Math.asin(C.dir.y) * 57.3).toFixed(1); st.az = +(Math.atan2(C.dir.z, C.dir.x) * 57.3).toFixed(1);
    if (L.sun) {
      L.sun.position.copy(C.dir).multiplyScalar(base.dist);
      var sunset = sstep(0.5, 0.22, s) * (1 - N);
      L.sun.color.copy(base.sunCol).lerp(C.golden, G).lerp(C.sunset, sunset * 0.6).lerp(C.moon, N);
    }
    if (L.hemi && base.hemiSky) { L.hemi.color.copy(base.hemiSky).lerp(C.hemiDusk, G * 0.7).lerp(C.hemiNight, N); L.hemi.groundColor.copy(base.hemiGround).lerp(C.gDusk, G * 0.6).lerp(C.gNight, N); }
    if (L.fill && base.fillCol) L.fill.color.copy(base.fillCol).lerp(C.fillNight, N);
    if (L.rim && base.rimCol) L.rim.color.copy(base.rimCol).lerp(C.rimDusk, G).lerp(C.moon, N);
    var fogT = wx === 'fog' ? 0.55 : wx === 'rain' ? 0.75 : 1;   // thick weather mutes the colour shift a little (grey stays grey)
    if (sc.fog && base.fog) sc.fog.color.copy(base.fog).lerp(C.fogDusk, G * 0.55 * fogT).lerp(C.fogNight, N * (wx === 'fog' ? 0.85 : 1));
    if (sc.background && sc.background.isColor && sc.fog) sc.background.copy(sc.fog.color);
    if (L.sky && base.zen) {
      var u = L.sky.material.uniforms;
      u.zenith.value.copy(base.zen).lerp(C.zenDuskL, G * 0.6).lerp(C.zenNightL, N);
      u.horizon.value.copy(base.hor).lerp(C.horDuskL, G * 0.75 * fogT).lerp(C.horNightL, N);
      C.tmp.copy(L.sun ? L.sun.color : C.golden).convertSRGBToLinear(); u.sunColor.value.copy(C.tmp).multiplyScalar(1 - N * 0.8);
      C.sunDirU.copy(C.dir); u.sunDir.value = C.sunDirU;
    }
    // stars
    if (stars) { var so = N * (wx === 'clear' ? 0.9 : wx === 'rain' ? 0.2 : 0.08); stars.visible = so > 0.01; stars.material.opacity = so; if (stars.visible) stars.position.copy(e.camera.position); }
    // night lights
    if (pts) {
      pts.visible = Lon > 0.01; pts.material.uniforms.uOn.value = Lon * (wx === 'fog' ? 0.8 : 1);
      if (pts.visible) {
        var hgt = (e.renderer && e.renderer.domElement && e.renderer.domElement.height) || (global.innerHeight || 800);
        pts.material.uniforms.uScale.value = hgt / (2 * Math.tan((e.camera.fov || 50) * Math.PI / 360));
        dynT -= 1; if (dynT <= 0 || !dyn.length) { relink(); dynT = 120; }
        blinkStatics(now); writeDyn(now);
      }
    }
    var po = Lon * 0.5; pools.forEach(function (p) { if (p.mesh) p.mesh.visible = po > 0.01; }); if (L.poolM) L.poolM.opacity = po * (wx === 'fog' ? 1.25 : 1);
    if (L.headM) L.headM.emissiveIntensity = Lon * 1.6;
    active = true;
  }
  function update() {
    if (!enabled) return;
    var e = E(); if (!e || !e.scene) return;
    if (!ready) { try { if (!build()) return; } catch (err) { enabled = false; console.warn('[skylight]', err); return; } }
    var now = performance.now(); last = now;
    var k = dayK();
    if (k == null || !isFinite(k)) { if (active) restore(); return; }
    apply(k, now);
  }

  LB.skyLight = {
    version: 'v12.0.51', isEnabled: function () { return enabled; }, isActive: function () { return active; }, update: update,
    getState: function () { return Object.assign({ enabled: enabled, ready: ready, active: active }, st); },
    _lights: function () { if (!pts) return null; var A = pts.geometry.attributes.lalpha.array, n = pts.geometry.drawRange.count, on = 0; for (var i = 0; i < n; i++) if (A[i] > 0.5) on++; return { drawn: n, lit: on, uOn: pts.material.uniforms.uOn.value, visible: pts.visible }; }
  };
})(window);
