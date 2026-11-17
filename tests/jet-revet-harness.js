// aircraft blast revetments probe (v12.0.63): revetments built, parked jets inside them, taxi-out / taxi-in clear of the walls, tug push-back, ?jetrevet=0 = old layout
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12063-shots';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|\[jetrevet|\[theaters/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(14000);
    await p.evaluate(() => { const w = document.getElementById('cmdWatch'); if (w) w.click(); });
    return p;
  };
  const cam = (p, x, y, z, tx, ty, tz) => p.evaluate(a => { const e = LUNCBattle.engine; e.controls.minDistance = 3; e.controls.maxDistance = 500; e.controls.target.set(a[3], a[4], a[5]); e.camera.position.set(a[0], a[1], a[2]); e.controls.update(); }, [x, y, z, tx, ty, tz]);
  // install a sampler: every 200 ms, centre clearance of every ground jet to every wall (own slot's walls excluded while parked / pushing)
  const sampler = p => p.evaluate(() => { const JR = LUNCBattle.jetRevet, th = LUNCBattle.theaters; window.__jr = { minParked: 1e9, minMoving: 1e9, where: null, samples: 0, tugSeen: 0 };
    const W = JR._walls(), d = (J, w) => Math.hypot(Math.max(0, Math.abs(J.x - w.x) - w.hx), Math.max(0, Math.abs(J.z - w.z) - w.hz));
    setInterval(() => { th._jets().forEach(J => { if (!J.g.visible || J.y > 0.75 || J.st === 'dead') return; const sl = JR.slot(J.side, J.slot); const own = w => Math.abs(w.x - sl.x) < 3.5 && Math.abs(w.z - sl.z) < 4;
      const parked = J.st === 'parked', near = parked || J._push || Math.hypot(J.x - sl.x, J.z - sl.z) < 2.5;
      const m = Math.min.apply(null, W.filter(w => !(near && own(w))).map(w => d(J, w)).concat([1e9])); const mo = parked ? Math.min.apply(null, W.map(w => d(J, w))) : m;
      if (parked) { if (mo < __jr.minParked) __jr.minParked = mo; } else if (m < __jr.minMoving) { __jr.minMoving = m; __jr.where = [J.st, J.slot, +J.x.toFixed(1), +J.z.toFixed(1)]; } });
      const t = LUNCBattle.jetRevet._root().getObjectByName('jet-revet-tug'); if (t && t.visible) __jr.tugSeen++; __jr.samples++; }, 200); });
  // fast-forward one jet with synthetic 50 ms steps through the real theater tick; clearance to the real wall list every step
  const ff = (p, slot, mode, maxSteps, stopAtPush) => p.evaluate(a => { const [slot, mode, maxSteps, stopAtPush] = a, th = LUNCBattle.theaters, JR = LUNCBattle.jetRevet, W = JR._walls();
    const J = th._jets().find(q => q.side === -1 && q.slot === slot); if (!J) return null; const sl = JR.slot(J.side, J.slot);
    const d = w => Math.hypot(Math.max(0, Math.abs(J.x - w.x) - w.hx), Math.max(0, Math.abs(J.z - w.z) - w.hz)), own = w => Math.abs(w.x - sl.x) < 3.5 && Math.abs(w.z - sl.z) < 4;
    if (mode === 'out' && J.st === 'parked') { J.t = 0; }
    if (mode === 'in' && J.st !== 'land') { if (!J._sa) LUNCBattle.seaAir.jetPose(J, 0.016); J.st = 'land'; J.y = 0.6; J.sp = 4; J.x = -205 + 25; J.z = -55; J.hd = 0; J._sa.ap = 3; J._sa.px = J.x; J._sa.pz = J.z; J._jr = null; }
    let min = 1e9, where = null, n = 0, tug = 0; const st0 = JR.getState();
    for (; n < maxSteps; n++) { th._tickJet(J, 0.05); JR.tick(0.05); if (J.y > 0.75) break;
      const near = J.st === 'parked' || J._push || Math.hypot(J.x - sl.x, J.z - sl.z) < 2.5; const m = Math.min.apply(null, W.filter(w => !(near && own(w))).map(d));
      if (m < min) { min = m; where = [J.st, +J.x.toFixed(2), +J.z.toFixed(2)]; }
      const t = JR._root().getObjectByName('jet-revet-tug'); if (t && t.visible) tug++;
      if (mode === 'out' && J.st === 'takeoff') break; if (mode === 'in' && J.st === 'parked') break; if (stopAtPush && J._jr && J._jr.ph === 2 && Math.abs(J.z - sl.z) < 1.6) break; }
    return { st: J.st, steps: n, min: +min.toFixed(2), where, tug, x: +J.x.toFixed(2), z: +J.z.toFixed(2), slot: [sl.x, sl.z], hdOk: Math.abs(J.hd - sl.hd) < 0.01 }; }, [slot, mode, maxSteps, stopAtPush]);
  const out = {};
  const A = await mk('MEDIUM', false, '');
  await sampler(A);
  out.state0 = await A.evaluate(() => LUNCBattle.jetRevet.getState());
  out.hangarZ = await A.evaluate(() => LUNCBattle.jetRevet.hangarZ(-24));
  await cam(A, -168, 22, -38, -192, 0, -68); await A.waitForTimeout(3000); await A.screenshot({ path: OUT + '/revetments-overview.png', timeout: 120000 });
  out.ffOut = await ff(A, 0, 'out', 900, false);
  out.ffIn1 = await ff(A, 2, 'in', 2400, true);
  await cam(A, -181, 8, -52, -188, 0.4, -64); await A.waitForTimeout(800); await A.screenshot({ path: OUT + '/tug-pushback.png', timeout: 120000 });
  out.ffIn2 = await ff(A, 2, 'in', 1200, false);
  await cam(A, -196, 4.5, -60, -200, 0.6, -70); await A.waitForTimeout(1500); await A.screenshot({ path: OUT + '/revetment-close.png', timeout: 120000 });
  out.medium = await A.evaluate(() => Object.assign({ jr: window.__jr }, LUNCBattle.jetRevet.getState()));
  out.mediumErrs = A.errs; await A.context().close();
  const Hh = await mk('HIGH', false, ''); out.high = await Hh.evaluate(() => LUNCBattle.jetRevet.getState()); out.highErrs = Hh.errs; await Hh.context().close();
  const P = await mk('LOW', true, ''); await sampler(P); await P.waitForTimeout(20000); out.iphone = await P.evaluate(() => Object.assign({ jr: window.__jr }, LUNCBattle.jetRevet.getState())); out.iphoneErrs = P.errs;
  await cam(P, -175, 20, -40, -195, 0, -66); await P.waitForTimeout(1500); await P.screenshot({ path: OUT + '/revetments-iphone.png', timeout: 120000 }); await P.context().close();
  const K = await mk('MEDIUM', false, '?jetrevet=0');
  out.off = await K.evaluate(() => { const J = LUNCBattle.theaters._jets().filter(q => q.st === 'parked'); return { on: LUNCBattle.jetRevet.isEnabled(), root: !!LUNCBattle.jetRevet._root(), hangarZ: LUNCBattle.jetRevet.hangarZ(-24), oldSlots: J.every(q => Math.abs(q.z - (-55 - 12 - Math.floor(q.slot / 6) * 6)) < 0.01) }; });
  out.offErrs = K.errs; await K.context().close();
  console.log(JSON.stringify(out, null, 1));
  const m = out.medium;
  const ok = m.built && m.revetments === 2 * m.maxSlots && m.tugs === 2 && out.hangarZ === -29 && m.jr.minParked >= 2.0 && m.jr.minMoving >= 1.73 && m.taxiOuts >= 1 && m.taxiIns >= 1 && m.pushbacks >= 1 &&
    out.ffOut.st === 'takeoff' && out.ffOut.min >= 1.73 && out.ffIn1.tug > 0 && out.ffIn2.st === 'parked' && out.ffIn2.hdOk && Math.abs(out.ffIn2.x - out.ffIn2.slot[0]) < 0.01 && Math.abs(out.ffIn2.z - out.ffIn2.slot[1]) < 0.05 && Math.min(out.ffIn1.min, out.ffIn2.min) >= 1.73 &&
    out.high.built && out.high.revetments === 2 * out.high.maxSlots && out.iphone.built && out.iphone.lite && out.iphone.jr.minParked >= 2.0 && out.iphone.jr.minMoving >= 1.73 &&
    !out.off.on && !out.off.root && out.off.hangarZ === -24 && out.off.oldSlots && !out.mediumErrs.length && !out.highErrs.length && !out.iphoneErrs.length && !out.offErrs.length;
  console.log(ok ? 'JETREVET PROBE PASS' : 'JETREVET PROBE FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
