// revetments probe (v12.0.61): six checkpoints with HESCO / Jersey / booth, boom barriers lift and drop, ?revet=0, phone, errors
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12061-shots';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|\[revetments|\[roads|\[tacmap/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(12000);
    await p.evaluate(() => { const w = document.getElementById('cmdWatch'); if (w) w.click(); });
    return p;
  };
  const cam = (p, x, y, z, tx, ty, tz) => p.evaluate(a => { const e = LUNCBattle.engine; e.controls.minDistance = 3; e.controls.maxDistance = 500; e.controls.maxPolarAngle = Math.PI / 2; e.controls.target.set(a[3], a[4], a[5]); e.camera.position.set(a[0], a[1], a[2]); e.controls.update(); }, [x, y, z, tx, ty, tz]);
  const out = {}; process.on('exit', () => { if (!out._printed) console.log(JSON.stringify(out, null, 1)); });
  const A = await mk('MEDIUM', false, '');
  out.state = await A.evaluate(() => LUNCBattle.revetments.getState());
  out.gaps = await A.evaluate(() => LUNCBattle.revetments._gaps());
  out.align = await A.evaluate(() => LUNCBattle.revetments._cps().map(c => ({ id: c.id, side: c.side, x: +c.x.toFixed(1), z: +c.z.toFixed(1), dx: +c.dx.toFixed(2), dz: +c.dz.toFixed(2) })));
  out.nightOn = await A.evaluate(() => { const R = LUNCBattle.revetments, S = LUNCBattle.skyLight, g0 = S.getState; S.getState = () => Object.assign(g0(), { active: true, lightsOn: 1 }); R._night(); R.tick(0.05);
    const on = { night: R.getState().night, pools: R._pools().filter(p => p.visible).length }; S.getState = g0; R._night(); R.tick(0.05); on.dayPools = R._pools().filter(p => p.visible).length; return on; });
  out.boom = await A.evaluate(() => { const R = LUNCBattle.revetments, seen = []; R._clock(0); R._cps().forEach(c => { if (c.bar) c.ph = 0; });
    for (let t = 0; t < 14; t += 0.1) { R.tick(0.1); seen.push(R.getState().boomAngles[0]); } return { min: Math.min(...seen), max: Math.max(...seen), up: R.getState().boomUp }; });
  // pose for screenshots: airbase gate, boom up
  await A.evaluate(() => { const R = LUNCBattle.revetments; R._clock(0); R._cps().forEach(c => { c.ph = 8.5 - 0; }); R.tick(0.01); for (let i = 0; i < 40; i++) R.tick(0.05); });
  await cam(A, -170, 8, -52, -194.5, 1, -44.7); await A.waitForTimeout(2500); await A.screenshot({ path: OUT + '/checkpoint-airbase.png', timeout: 120000 });
  await cam(A, 74, 7, -22, 60, 1, -32); await A.waitForTimeout(2000); await A.screenshot({ path: OUT + '/checkpoint-hq.png', timeout: 120000 });
  await A.evaluate(() => { const S = LUNCBattle.skyLight, g0 = S.getState; S.getState = () => Object.assign(g0(), { active: true, lightsOn: 1 }); LUNCBattle.revetments._night(); LUNCBattle.revetments.tick(0.05); });
  await A.waitForTimeout(1500); await A.screenshot({ path: OUT + '/checkpoint-hq-lights.png', timeout: 120000 });
  await A.evaluate(() => { LUNCBattle.tacmap.open(); }); await A.waitForTimeout(2000); await A.screenshot({ path: OUT + '/checkpoint-tacmap.png', timeout: 120000 });
  out.mediumErrs = A.errs; await A.context().close();
  const K = await mk('MEDIUM', false, '?revet=0');
  out.off = await K.evaluate(() => new Promise(r => setTimeout(() => r({ on: LUNCBattle.revetments.isEnabled(), built: LUNCBattle.revetments.getState().built, root: !!LUNCBattle.engine.scene.getObjectByName('v12-revetments') }), 4000)));
  out.offErrs = K.errs; await K.context().close();
  const L = await mk('LOW', true, '');
  out.iphone = await L.evaluate(() => new Promise(r => setTimeout(() => r(LUNCBattle.revetments.getState()), 5000)));
  out.iphoneErrs = L.errs; await L.context().close();
  console.log(JSON.stringify(out, null, 1)); out._printed = 1;
  const ok = out.state.built && out.state.checkpoints === 6 && out.state.snapped === 6 && out.gaps < 0.12 && out.nightOn.night === 1 && out.nightOn.pools === 6 && out.nightOn.dayPools === 0 && out.state.booms === 4 && out.state.booths === 6 && out.state.lights === 6 && out.state.hesco > 100 && out.boom.min < -1.0 && out.boom.max > -0.05 &&
    !out.off.on && !out.off.root && out.iphone.built && out.iphone.lights === 0 && out.iphone.hesco < out.state.hesco && !out.mediumErrs.length && !out.offErrs.length && !out.iphoneErrs.length;
  console.log(ok ? 'REVET PROBE PASS' : 'REVET PROBE FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
