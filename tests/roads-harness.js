// roads probe (v12.0.60): network built and draped on the terrain, markings and ramp present, wet asphalt, ?roads=0, phone, shader + page errors
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12060-shots';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|\[roads|\[tacmap/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(12000);
    await p.evaluate(() => { const w = document.getElementById('cmdWatch'); if (w) w.click(); });
    return p;
  };
  const cam = (p, x, y, z, tx, ty, tz) => p.evaluate(a => { const e = LUNCBattle.engine; e.controls.minDistance = 3; e.controls.maxDistance = 500; e.controls.maxPolarAngle = Math.PI / 2; e.controls.target.set(a[3], a[4], a[5]); e.camera.position.set(a[0], a[1], a[2]); e.controls.update(); }, [x, y, z, tx, ty, tz]);
  const out = {}; process.on('exit', () => { if (!out._printed) console.log(JSON.stringify(out, null, 1)); });
  const A = await mk('MEDIUM', false, '');
  out.state = await A.evaluate(() => LUNCBattle.roads.getState());
  out.drape = await A.evaluate(() => { const r = LUNCBattle.roads._root(), e = LUNCBattle.engine; let worst = 0, n = 0, nonmono = 0;
    r.children.forEach(m => { if (m.name !== 'road-asphalt') return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 7) { const h = e.terrainHeight(p.getX(i), p.getZ(i)) || 0; worst = Math.max(worst, Math.abs(p.getY(i) - 0.06 - h)); n++; } });
    const names = {}; r.children.forEach(m => names[m.name] = (names[m.name] || 0) + 1); return { worst, n, names }; });
  // wet asphalt
  out.wet = await A.evaluate(async () => { const R = LUNCBattle.roads, rm = LUNCBattle.rainMud, root = R._root(); const mat = root.children.find(m => m.name === 'road-asphalt').material, dry = mat.roughness;
    LUNCBattle.v12extras.setWeather('rain'); rm._soak('rain', 40); R.tick(0.6); R.tick(0.6); const wet = mat.roughness; LUNCBattle.v12extras.setWeather('clear'); return { dry, wet, lvl: rm.levels().wet }; });
  await cam(A, -90, 14, -20, -90, 0, -32); await A.waitForTimeout(2500); await A.screenshot({ path: OUT + '/road-supply.png', timeout: 120000 });
  await cam(A, 60, 10, 34, 80, 0, 50); await A.waitForTimeout(2000); await A.screenshot({ path: OUT + '/road-ramp.png', timeout: 120000 });
  await cam(A, 150, 30, -20, 150, 0, -70); await A.waitForTimeout(2000); await A.screenshot({ path: OUT + '/road-silo-spur.png', timeout: 120000 });
  await A.evaluate(() => { LUNCBattle.v12extras.setWeather('clear'); LUNCBattle.tacmap.open(); }); await A.waitForTimeout(2000); await A.screenshot({ path: OUT + '/road-tacmap.png', timeout: 120000 });
  out.mediumErrs = A.errs; await A.context().close();
  const K = await mk('MEDIUM', false, '?roads=0');
  out.off = await K.evaluate(() => new Promise(r => setTimeout(() => r({ on: LUNCBattle.roads.isEnabled(), built: LUNCBattle.roads.getState().built, root: !!LUNCBattle.engine.scene.getObjectByName('v12-roads') }), 4000)));
  out.offErrs = K.errs; await K.context().close();
  const L = await mk('LOW', true, '');
  out.iphone = await L.evaluate(() => new Promise(r => setTimeout(() => r(LUNCBattle.roads.getState()), 5000)));
  out.iphoneErrs = L.errs; await L.context().close();
  console.log(JSON.stringify(out, null, 1)); out._printed = 1;
  const ok = out.state.built && out.state.roads === 8 && out.state.ramps === 2 && out.state.bollards > 20 && out.state.signs === 8 && out.drape.worst < 0.01 && out.drape.names['road-centre'] > 4 && out.wet.wet < out.wet.dry - 0.3 &&
    !out.off.on && !out.off.root && out.iphone.built && out.iphone.signs === 0 && !out.mediumErrs.length && !out.offErrs.length && !out.iphoneErrs.length;
  console.log(ok ? 'ROADS PROBE PASS' : 'ROADS PROBE FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
