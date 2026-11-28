// flight-controls probe (v12.0.58): parts built on real theater jets, flaps / elevons / rudder / speed brake logic on a
// test airframe, wingtip vapour in a hard turn (dry vs humid), ?flightctl=0, shader + page errors
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12058-shots';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|\[flight/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(12000);
    await p.evaluate(() => { const w = document.getElementById('cmdWatch'); if (w) w.click(); });
    return p;
  };
  const out = {}; process.on('exit', () => { if (!out._printed) console.log(JSON.stringify(out, null, 1)); });
  const A = await mk('MEDIUM', false, '');
  // real jets: sample 25 s of the live sim
  out.live = await A.evaluate(() => new Promise(r => { const seen = {}; let n = 0; const iv = setInterval(() => {
    LUNCBattle.theaters._jets().forEach(J => { const s = LUNCBattle.flightControls._jet(J); if (!s) return; const k = J.st; const o = seen[k] = seen[k] || { n: 0, flap: 0, brk: 0, split: 0, rud: 0 }; o.n++; o.flap = Math.max(o.flap, s.flap); o.brk = Math.max(o.brk, s.brk); o.split = Math.max(o.split, Math.abs(s.el[0] - s.el[1])); o.rud = Math.max(o.rud, Math.abs(s.rud)); });
    if (++n >= 25) { clearInterval(iv); r({ seen, st: LUNCBattle.flightControls.getState() }); } }, 1000); }));
  // a test airframe parked in front of the camera, driven through the phases by hand
  out.rig = await A.evaluate(() => {
    const e = LUNCBattle.engine, FC = LUNCBattle.flightControls, T = e.THREE;
    const g = LUNCBattle.heavyFx.buildPlane('jet', 0x3f8f63); g.scale.setScalar(2.2); e.scene.add(g);
    const x = 30, z = 30, y = 6; g.position.set(x, y, z); g.rotation.order = 'YZX';
    const J = window.__J = { g, st: 'rtb', sp: 40, slot: 0, x, y, z, hd: 0.6, side: -1, _sa: { ap: 2, pitch: 0.06, bank: 0, om: 0, vyaw: 0.6 } };
    const run = (sec, f) => { for (let t = 0; t < sec; t += 0.05) { f && f(t); FC.pose(J, 0.05); } return FC._jet(J); };
    const res = {};
    res.final = run(3);                                                              // final approach: flaps + brake (fast)
    J.st = 'cruise'; J.sp = 60; J._sa.ap = 0; res.cruise = run(4);                     // clean
    res.rollIn = run(0.4, t => { J._sa.bank = -t * 2.5; });                           // rolling right
    res.pitchUp = run(0.4, t => { J._sa.bank = -1; J._sa.pitch = 0.06 + t * 0.8; });
    J._sa.om = 0.9; res.yaw = run(1);
    J.st = 'land'; J.sp = 12; J._sa.bank = 0; J._sa.pitch = 0.05; J._sa.om = 0; res.rollout = run(3);
    // vapour: hard turn, dry then humid
    const v0 = FC.getState().vapour; J.st = 'fight'; J.sp = 55; J._sa.bank = 1.2;
    for (let i = 0; i < 40; i++) { FC.tick(0.05); FC.pose(J, 0.05); }
    const v1 = FC.getState().vapour;
    LUNCBattle.v12extras.setWeather('rain'); J._sa.bank = 1.0;                          // 1.85 g: dry needs 2.2, humid 1.3
    for (let i = 0; i < 40; i++) { FC.tick(0.05); FC.pose(J, 0.05); }
    const v2 = FC.getState().vapour; LUNCBattle.v12extras.setWeather('clear');
    J._sa.bank = 1.0; for (let i = 0; i < 40; i++) { FC.tick(0.05); FC.pose(J, 0.05); }
    const v3 = FC.getState().vapour;
    res.vapour = { hardDry: v1 - v0, mediumHumid: v2 - v1, mediumDry: v3 - v2 };
    // pose for the screenshot: on final with flaps, LE flaps, speed brake out, slight bank
    J.st = 'rtb'; J._sa.ap = 2; J.sp = 40; J._sa.bank = 0.25; J._sa.om = 0.3; J._sa.pitch = 0.1; run(3);
    g.rotation.set(0.25, 0.6, 0.1);
    e.setPaused(true); e.controls.minDistance = 3; e.controls.target.set(x, y, z); e.camera.position.set(x - 5.5, y + 4.2, z + 7.5); e.controls.update();
    res.final2 = FC._jet(J);
    return res;
  });
  await A.waitForTimeout(1500); await A.screenshot({ path: OUT + '/jet-final-flaps.png', timeout: 120000 });
  await A.evaluate(() => { const J = window.__J, FC = LUNCBattle.flightControls; J.st = 'cruise'; J._sa.ap = 0; J.sp = 60; J._sa.bank = 0; J._sa.om = 0; for (let t = 0; t < 4; t += 0.05) FC.pose(J, 0.05); J.g.rotation.set(0, 0.6, 0); });
  await A.waitForTimeout(1200); await A.screenshot({ path: OUT + '/jet-clean.png', timeout: 120000 });
  out.mediumErrs = A.errs; await A.context().close();
  const K = await mk('MEDIUM', false, '?flightctl=0');
  out.off = await K.evaluate(() => new Promise(r => setTimeout(() => r({ on: LUNCBattle.flightControls.isEnabled(), withParts: LUNCBattle.theaters._jets().filter(J => J._fc).length, jets: LUNCBattle.theaters._jets().length }), 4000)));
  out.offErrs = K.errs; await K.context().close();
  const L = await mk('LOW', true, '');
  out.iphone = await L.evaluate(() => new Promise(r => setTimeout(() => r(LUNCBattle.flightControls.getState()), 6000)));
  out.iphoneErrs = L.errs; await L.context().close();
  console.log(JSON.stringify(out, null, 1)); out._printed = 1;
  const R = out.rig;
  const ok = out.live.st.decorated > 0 && R.final.flap > 0.95 && R.final.brk > 0.9 && R.final.el[0] > 0.3 && R.cruise.flap < 0.05 && R.cruise.brk < 0.05 &&
    Math.abs(R.rollIn.el[0] - R.rollIn.el[1]) > 0.15 && R.pitchUp.el[0] + R.pitchUp.el[1] < -0.1 && Math.abs(R.yaw.rud) > 0.2 && R.rollout.brk > 0.9 && R.rollout.flap > 0.95 &&
    R.vapour.hardDry > 0 && R.vapour.mediumHumid > 0 && R.vapour.mediumDry === 0 && !out.off.on && out.off.withParts === 0 && out.iphone.vapour === 0 &&
    !out.mediumErrs.length && !out.offErrs.length && !out.iphoneErrs.length;
  console.log(ok ? 'FLIGHT-CONTROLS PROBE PASS' : 'FLIGHT-CONTROLS PROBE FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
