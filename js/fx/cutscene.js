/* LUNC Battlefield v11.3 — Mini Nuke cinematic (game FX only, skippable).
 * Beats: LAUNCH (missile leaves friendly base) → DESCENT (slow-mo warhead tracking) → FLASH (impact callback
 * runs the real game-only blast) → FIREBALL (mushroom + sweeping ring, wide orbit) → TITLE CARD → return.
 * Skip: click / tap / Esc / Space. Game logic is paused until impact; camera + Hide UI state restored at the end.
 * LOW / mobile: ~4.5 s, fewer particles. Moon Shot is unrelated and untouched. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {};
  var doc = global.document;
  var E = function () { return LB.engine; };
  var cs = null;   // active cutscene state
  var timeScale = 1; // debug/testing only (slow GPUs in headless capture)

  function lowTier() { try { return LB.quality.getEffectiveName() === 'LOW' || E().mobile; } catch (_) { return false; } }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function overlay() {
    var o = doc.getElementById('nukeCut');
    if (o) return o;
    o = doc.createElement('div'); o.id = 'nukeCut';
    o.innerHTML = '<div class="nc-bar top"></div><div class="nc-bar bot"></div><div class="nc-flash"></div>' +
      '<div class="nc-beat"></div><div class="nc-card"><b>TACTICAL BURN EVENT</b><span>Supply reduced by exactly 0 tokens · game FX only, not a chain burn</span></div>' +
      '<div class="nc-skip">Click / Space / Esc to skip</div>';
    doc.body.appendChild(o);
    return o;
  }

  function buildMissile(THREE) {
    var g = new THREE.Group();
    var m = new THREE.MeshStandardMaterial({ color: 0xd9d6cc, roughness: 0.5, metalness: 0.4 });
    var red = new THREE.MeshStandardMaterial({ color: 0xc8392f, roughness: 0.5 });
    var body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.2, 10), m);
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10), red); nose.position.y = 1.4;
    g.add(body, nose);
    for (var i = 0; i < 4; i++) { var f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.45), red); f.position.y = -0.9; f.rotation.y = i * Math.PI / 2; f.position.x = Math.cos(i * Math.PI / 2) * 0.2; f.position.z = Math.sin(i * Math.PI / 2) * 0.2; g.add(f); }
    var flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: LB.proctex && LB.proctex.softDot ? LB.proctex.softDot(THREE) : null, color: 0xffa040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
    flame.position.y = -1.5; flame.scale.set(0.9, 1.6, 1); g.add(flame); g.userData.flame = flame;
    g.scale.setScalar(1.4);
    return g;
  }

  /** play({x, z, side, onImpact}) */
  function play(o) {
    var e = E(); if (!e || cs) return false;
    var THREE = e.THREE, low = lowTier();
    var T = low ? { launch: 0.8, descent: 1.3, fire: 1.8, card: 1.0 } : { launch: 1.6, descent: 2.0, fire: 3.0, card: 1.4 };
    var ctrl = e.controls || null;
    cs = {
      o: o, t: 0, T: T, low: low, impacted: false, done: false,
      camPos: e.camera.position.clone(), camTarget: (LB.engine.getCameraTarget ? LB.engine.getCameraTarget() : null),
      wasPaused: e.isPaused(),
      launchX: (o.side || -1) * 44, missile: buildMissile(THREE), fireball: null, ring: null, last: performance.now(), start: performance.now()
    };
    e.scene.add(cs.missile);
    var ov = overlay(); ov.className = 'show' + (low ? ' low' : '');
    doc.body.classList.add('cutscene');
    e.setPaused(true);   // freeze game logic until impact
    return true;
  }

  function impact() {
    if (!cs || cs.impacted) return;
    cs.impacted = true;
    var e = E(), THREE = e.THREE, o = cs.o;
    if (!cs.wasPaused) e.setPaused(false);
    try { if (o.onImpact) o.onImpact(); } catch (err) { console.warn('[cutscene] impact', err); }
    var ov = overlay(); ov.classList.add('flash');
    setTimeout(function () { ov.classList.remove('flash'); }, 380);
    // fireball + ring (own meshes, animated in update with wall-clock dt)
    var y = e.terrainHeight(o.x, o.z);
    var fb = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    fb.position.set(o.x, y + 1, o.z); e.scene.add(fb); cs.fireball = fb;
    var ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(o.x, y + 0.4, o.z); e.scene.add(ring); cs.ring = ring;
    if (LB.heavyFx) LB.heavyFx.mushroom(o.x, o.z, cs.low ? 1.6 : 2.4, cs.low ? 4 : 7);
  }

  function end() {
    if (!cs) return;
    var e = E(), s = cs;
    if (!s.impacted) impact();
    [s.missile, s.fireball, s.ring].forEach(function (m) { if (m && m.parent) { m.parent.remove(m); m.traverse(function (k) { if (k.geometry) k.geometry.dispose(); }); } });
    e.camera.position.copy(s.camPos);
    if (e.setCameraTarget && s.camTarget) e.setCameraTarget(s.camTarget);
    var ov = overlay(); ov.className = '';
    doc.body.classList.remove('cutscene');
    if (!s.wasPaused && e.isPaused()) e.setPaused(false);
    cs = null;
    if (s.o.onEnd) try { s.o.onEnd(); } catch (_) {}
  }

  function skip() { if (cs) end(); }

  /** Called from battle-engine drawFrame (every rendered frame, even while paused) — overrides the camera. */
  function update() {
    if (!cs) return;
    var e = E(), cam = e.camera, now = performance.now();
    cs.t += (now - cs.last) / 1000 * timeScale; cs.last = now;   // wall clock (keeps its length on slow GPUs)   // wall clock: the cutscene keeps its length even on slow GPUs
    var T = cs.T, o = cs.o, t = cs.t, ov = overlay(), beat = ov.querySelector('.nc-beat');
    var y0 = e.terrainHeight(o.x, o.z);
    var tA = T.launch, tB = tA + T.descent, tC = tB + T.fire, tD = tC + T.card;
    var m = cs.missile;
    if (t < tA) {                                   // LAUNCH: from friendly base, camera low looking up
      var k = t / tA, lx = cs.launchX, lz = 0;
      m.position.set(lx + (o.x - lx) * 0.15 * k, e.terrainHeight(lx, lz) + 1 + k * k * 30, lz);
      m.rotation.z = -Math.sign(o.x - lx) * k * 0.4;
      cam.position.set(lx - Math.sign(o.x - lx) * 9, e.terrainHeight(lx, lz) + 2.2, 7);
      cam.lookAt(m.position);
      beat.textContent = 'LAUNCH DETECTED';
      if (LB.heavyFx && !cs.low) LB.heavyFx.puff({ kind: 'smoke', x: m.position.x, y: m.position.y - 1.5, z: m.position.z, size: 1, grow: 1.6, life: 2.2, color: 0xd8d4cc, opacity: 0.5 });
    } else if (t < tB) {                            // DESCENT: slow-mo tracking the warhead
      var k2 = ease((t - tA) / T.descent);
      var hy = y0 + 46 * (1 - k2) + 1.2;
      m.position.set(o.x + (1 - k2) * 6, hy, o.z + (1 - k2) * 3);
      m.rotation.set(0, 0, Math.PI);                 // nose down
      if (m.userData.flame) m.userData.flame.visible = false;
      cam.position.set(m.position.x + 7, m.position.y + 5, m.position.z + 9);
      cam.lookAt(o.x, y0, o.z);
      beat.textContent = 'TACTICAL WARHEAD · INBOUND';
    } else if (t < tC) {                            // FLASH → FIREBALL: wide slow orbit
      if (!cs.impacted) { m.visible = false; impact(); }
      var k3 = (t - tB) / T.fire;
      var ang = 0.6 + k3 * 0.5, dist = 46 - k3 * 6;
      cam.position.set(o.x + Math.cos(ang) * dist, y0 + 16 + k3 * 4, o.z + Math.sin(ang) * dist);
      cam.lookAt(o.x, y0 + 6 + k3 * 6, o.z);
      if (cs.fireball) { var s = 2 + Math.pow(k3, 0.5) * 9; cs.fireball.scale.setScalar(s); cs.fireball.position.y = y0 + s * 0.6 + k3 * 6; cs.fireball.material.opacity = 0.95 * (1 - k3 * 0.85); cs.fireball.material.color.setHSL(0.08 - k3 * 0.05, 1, 0.6 - k3 * 0.25); }
      if (cs.ring) { var rr = 1 + k3 * 34; cs.ring.scale.set(rr, rr, rr); cs.ring.material.opacity = 0.8 * (1 - k3); }
      beat.textContent = '';
    } else if (t < tD) {                            // TITLE CARD
      ov.classList.add('card');
      cam.position.set(o.x + Math.cos(1.1) * 40, y0 + 20, o.z + Math.sin(1.1) * 40);
      cam.lookAt(o.x, y0 + 12, o.z);
      if (cs.fireball) cs.fireball.visible = false;
      if (cs.ring) cs.ring.visible = false;
    } else end();
  }

  function onKey(e) {
    if (!cs) return;
    if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); skip(); }
    else e.stopImmediatePropagation();   // no hotkeys during the cutscene
  }
  function onPointer(e) { if (!cs) return; if (cs.t > 0.25) { e.preventDefault(); e.stopImmediatePropagation(); skip(); } }
  global.addEventListener('keydown', onKey, true);
  global.addEventListener('pointerdown', onPointer, true);

  LB.cutscene = { playNuke: play, _setTimeScale: function (k) { timeScale = k > 0 ? k : 1; }, update: update, skip: skip, isActive: function () { return !!cs; },
    getState: function () { return cs ? { t: +cs.t.toFixed(2), impacted: cs.impacted, low: cs.low } : null; } };
})(window);
