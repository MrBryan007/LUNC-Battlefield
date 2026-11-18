// silos probe (v12.0.59): missile test range. Logic run (deterministic _tick steps): countdown, doors, ejection, vertical climb,
// pitch-over, stage 1 / stage 2 into the sea, RV into the test box, radio lines; real-time screenshots of the site, the
// launch and the follow camera; ?silos=0; phone; shader + page errors.
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12059-shots';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|\[silos|\[v12-extras|\[tacmap/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(12000);
    await p.evaluate(() => { const w = document.getElementById('cmdWatch'); if (w) w.click(); });
    return p;
  };
  const out = {}; process.on('exit', () => { if (!out._printed) console.log(JSON.stringify(out, null, 1)); });
  const A = await mk('MEDIUM', false, '');
  out.logic = await A.evaluate(() => {
    const SI = LUNCBattle.silos, res = { radio: [] };
    const send = LUNCBattle.ai.send; LUNCBattle.ai.send = function (m) { if (m && m.type === 'icbm') res.radio.push(m.text.slice(0, 80)); return send.apply(this, arguments); };
    res.initial = SI.getState();
    // scheduler: a window 31 s out starts the countdown at T-30
    SI._setNext(31); SI._tick(1.5); res.countSt = SI.getState().sites.map(s => s.st + ':' + s.ct);
    const S = SI._sites().find(s => s.st === 'count'); res.counting = !!S;
    for (let t = 0; t < 22; t += 0.05) SI._tick(0.05); res.doorsOpenAtT10 = SI._sites().find(s => s.st === 'count').door;
    const smp = []; let maxY = 0, steps = 0, sep1 = 0, doorMax = 0;
    while (steps++ < 4000) {
      SI._tick(0.05); const q = SI._sites().find(s => s.st === 'flight');
      if (q) { maxY = Math.max(maxY, q.pos.y); smp.push([+q.w.toFixed(2), +q.dir.y.toFixed(2), +q.pos.y.toFixed(0)]); }
      if (SI._sites().every(s => s.st === 'idle') && steps > 200) break;
    }
    res.maxY = maxY; res.dirAt = [0.05, 0.3, 0.5, 0.7, 0.95].map(w => (smp.find(s => s[0] >= w) || [])[1]);
    res.after = SI.getState(); SI.launch(1); for (let i = 0; i < 60; i++) SI._tick(0.05); res.enemyCount = SI.getState().sites[1].st; for (let i = 0; i < 1500; i++) SI._tick(0.05);   // enemy side: INTERCEPTED lines
 res.steps = steps; res.debris = SI._debris().length;
    return res;
  });
  // real-time visuals on the Bull site
  out.visual = await A.evaluate(async () => {
    const e = LUNCBattle.engine, SI = LUNCBattle.silos; e.controls.minDistance = 3; e.controls.maxDistance = 400; e.controls.maxPolarAngle = Math.PI / 2;
    const S = SI._sites()[0]; SI.launch(-1); const st = SI._sites()[0]; st.ct = 12;
    const T = e.controls.target; T.set(S.x, 3, S.z); e.camera.position.set(S.x + 16, 9, S.z + 22); e.controls.update(); return { st: st.st, ct: st.ct };
  });
  // headless frames are slow, so sim time is advanced by hand (_tick) while the renderer draws between chunks
  const step = async (sec) => { for (let t = 0; t < sec * 4; t += 1) { await A.evaluate(() => { for (let i = 0; i < 5; i++) LUNCBattle.silos._tick(0.05); }); await A.waitForTimeout(120); } };
  await step(3); await A.waitForTimeout(1500); await A.screenshot({ path: OUT + '/silo-doors-open.png', timeout: 120000 });
  out.doorNow = await A.evaluate(() => LUNCBattle.silos.getState().sites[0]);
  await A.evaluate(() => { const S = LUNCBattle.silos._sites()[0]; S.ct = 0.01; });
  await A.evaluate(() => { for (let i = 0; i < 6; i++) LUNCBattle.silos._tick(0.05); });
  out.ejectSt = await A.evaluate(() => LUNCBattle.silos.getState().sites[0].st);
  await A.waitForTimeout(500); await A.screenshot({ path: OUT + '/silo-ejection.png', timeout: 120000 });
  await A.evaluate(() => { const e = LUNCBattle.engine, S = LUNCBattle.silos._sites()[0]; e.camera.position.set(S.x + 26, 22, S.z + 34); e.controls.update(); LUNCBattle.silos.watch(); });
  await step(2); await step(4);
  await A.evaluate(() => { for (let i = 0; i < 6; i++) LUNCBattle.silos._tick(0.05); }); await A.screenshot({ path: OUT + '/silo-boost.png', timeout: 120000 });
  out.follow = await A.evaluate(() => { const e = LUNCBattle.engine, S = LUNCBattle.silos._sites()[0], T = e.controls.target; return { w: S.w, missile: [S.pos.x, S.pos.y, S.pos.z].map(v => +v.toFixed(1)), target: [T.x, T.y, T.z].map(v => +v.toFixed(1)), following: LUNCBattle.silos.getState().following }; });
  await step(5); await step(3);
  await A.waitForTimeout(800); await A.screenshot({ path: OUT + '/silo-arc.png', timeout: 120000 });
  await step(10); await A.waitForTimeout(600); await A.screenshot({ path: OUT + '/silo-arc2.png', timeout: 120000 });
  // tactical map shows the range
  out.map = await A.evaluate(() => { const TM = LUNCBattle.tacmap; TM.open(); return new Promise(r => setTimeout(() => r(TM.getState ? { open: true } : { open: true }), 1500)); });
  await A.screenshot({ path: OUT + '/silo-tacmap.png', timeout: 120000 });
  await A.evaluate(() => LUNCBattle.tacmap.close());
  out.api = await A.evaluate(() => { const x = LUNCBattle.v12extras; return { spec: typeof x.setSpectator, cyber: typeof x.cyber, dayK: typeof x.getDayK }; });
  out.mediumErrs = A.errs; await A.context().close();
  const K = await mk('MEDIUM', false, '?silos=0');
  out.off = await K.evaluate(() => new Promise(r => setTimeout(() => { const s = LUNCBattle.silos; r({ on: s.isEnabled(), ready: s.getState().ready, hasRoot: !!LUNCBattle.engine.scene.getObjectByName('v12-silos'), oldTest: LUNCBattle.v12extras.launchTest !== undefined }); }, 4000)));
  out.offErrs = K.errs; await K.context().close();
  const L = await mk('LOW', true, '');
  out.iphone = await L.evaluate(() => new Promise(r => setTimeout(() => { LUNCBattle.silos.launch(1); r(LUNCBattle.silos.getState().status); }, 5000)));
  await L.waitForTimeout(6000); out.iphoneErrs = L.errs; await L.context().close();
  console.log(JSON.stringify(out, null, 1)); out._printed = 1;
  const g = out.logic;
  const ok = g.initial.ready && g.counting && g.doorsOpenAtT10 > 0.9 && g.dirAt[0] > 0.85 && g.dirAt[2] < 0.75 && g.dirAt[4] < -0.5 && g.maxY > 120 && g.after.rvInBox >= 1 && g.after.stage1Sea >= 1 && g.after.stage2Sea >= 1 &&
    g.radio.length >= 6 && g.radio.some(t => /INTERCEPTED/.test(t)) && g.radio.some(t => /RV in the box/.test(t)) && out.follow.following && Math.hypot(out.follow.missile[0] - out.follow.target[0], out.follow.missile[1] - out.follow.target[1], out.follow.missile[2] - out.follow.target[2]) < 60 &&
    out.api.spec === 'function' && out.api.cyber === 'function' && !out.off.on && !out.off.hasRoot && !out.mediumErrs.length && !out.offErrs.length && !out.iphoneErrs.length;
  console.log(ok ? 'SILOS PROBE PASS' : 'SILOS PROBE FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
