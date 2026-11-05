// rain & mud probe (v12.0.57): wet / mud wear on the camo shader, puddles, ripples, spray, drying, ?mud=0, LOW
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12057-shots';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300))); p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log/i.test(t)) p.errs.push('shader: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(12000);
    await p.evaluate(() => { const w = document.getElementById('cmdWatch'); if (w) w.click(); });
    return p;
  };
  // close-up on a bull MBT near the front, looking down the line
  const closeUp = p => p.evaluate(() => {
    const e = LUNCBattle.engine, A = e.getArmies(); let u = null;
    const f = e.controls.target, W = new e.THREE.Vector3(); let bd = 1e9;
    for (const l of [A.bulls, A.bears]) for (const v of l) { const t = v.userData.utype != null ? v.userData.utype : v.userData.type; if (t !== 1 || !v.visible || v.userData.wreckUntil || v.parent !== e.scene) continue; const d = Math.hypot(v.position.x - (window.__fx != null ? window.__fx : f.x), v.position.z - (window.__fz != null ? window.__fz : f.z)); if (d < bd) { bd = d; u = v; } }
    if (u && window.__fx == null) { window.__fx = u.position.x; window.__fz = u.position.z; }
    if (!u) return null; e.notifyUserInput && e.notifyUserInput(); e.controls.minDistance = 6;   // test-only close-up
    e.controls.target.set(u.position.x, u.position.y + 1, u.position.z); e.camera.position.set(u.position.x + 7, u.position.y + 4.5, u.position.z + 9); e.controls.update();
    return { x: +u.position.x.toFixed(1), z: +u.position.z.toFixed(1), d: +bd.toFixed(1), parent: u.parent && u.parent.type };
  });
  const out = {}; process.on('exit', () => { if (!out._printed) console.log(JSON.stringify(out, null, 1)); });
  // ---- HIGH desktop: dry baseline, soak, dry out
  const A = await mk('HIGH', false, '');
  out.high0 = await A.evaluate(() => ({ build: LUNCBattle.config.BUILD_META.version, on: LUNCBattle.rainMud.isEnabled(), st: LUNCBattle.rainMud.getState(), wear: LUNCBattle.armyRealism.getWear() }));
  out.focus = await closeUp(A); await A.waitForTimeout(800); await A.screenshot({ path: OUT + '/high-dry.png', timeout: 120000 });
  out.rain = await A.evaluate(() => { LUNCBattle.v12extras.setWeather('rain'); const L = LUNCBattle.rainMud._soak('rain', 150); return L; });
  await A.waitForTimeout(2500);
  out.high1 = await A.evaluate(() => ({ st: LUNCBattle.rainMud.getState(), wear: LUNCBattle.armyRealism.getWear(), panel: (document.getElementById('wxStatus') || {}).textContent || '' }));
  await closeUp(A); await A.waitForTimeout(1500); await A.screenshot({ path: OUT + '/high-rain-mud.png', timeout: 120000 });
  // puddle view: fly over the nearest puddle
  out.puddleView = await A.evaluate(() => { const e = LUNCBattle.engine; let pm = null; e.scene.traverse(o => { if (o.name === 'rainPuddles') pm = o; }); if (!pm) return null;
    const M = new e.THREE.Matrix4(), P = new e.THREE.Vector3(); let best = null; for (let i = 0; i < pm.count; i++) { pm.getMatrixAt(i, M); P.setFromMatrixPosition(M); const s = M.elements[0]; if (s > 0.5 && (!best || Math.abs(P.z) < Math.abs(best.z))) best = { x: P.x, y: P.y, z: P.z, s: s }; }
    if (!best) return null; e.notifyUserInput && e.notifyUserInput(); e.controls.minDistance = 6; e.controls.target.set(best.x, best.y, best.z); e.camera.position.set(best.x + 6, best.y + 4, best.z + 9); e.controls.update(); return { x: +best.x.toFixed(1), z: +best.z.toFixed(1), r: +best.s.toFixed(2) }; });
  await A.waitForTimeout(1200); await A.screenshot({ path: OUT + '/high-puddle.png', timeout: 120000 });
  out.ripples = await A.evaluate(() => LUNCBattle.rainMud.getState().ripples);
  out.dryout = await A.evaluate(() => { LUNCBattle.v12extras.setWeather('clear'); const a = LUNCBattle.rainMud._soak('clear', 90), b2 = Object.assign({}, a); const c = LUNCBattle.rainMud._soak('clear', 300); return { after90: b2, after390: c, wear: LUNCBattle.armyRealism.getWear() }; });
  await closeUp(A); await A.waitForTimeout(1200); await A.screenshot({ path: OUT + '/high-caked.png', timeout: 120000 });
  out.highErrs = A.errs; await A.context().close();
  // ---- LOW + iPhone: wear works, no puddles
  const L = await mk('LOW', true, '');
  out.iphone = await L.evaluate(() => { LUNCBattle.v12extras.setWeather('rain'); LUNCBattle.rainMud._soak('rain', 120); return null; });
  await L.waitForTimeout(2500);
  out.iphone = await L.evaluate(() => ({ st: LUNCBattle.rainMud.getState(), wear: LUNCBattle.armyRealism.getWear() }));
  await L.screenshot({ path: OUT + '/iphone-rain.png', timeout: 120000 }); out.iphoneErrs = L.errs; await L.evaluate(() => LUNCBattle.v12extras.setWeather('clear')); await L.context().close();
  // ---- ?mud=0
  const K = await mk('MEDIUM', false, '?mud=0');
  out.off = await K.evaluate(() => { LUNCBattle.v12extras.setWeather('rain'); return new Promise(r => setTimeout(() => { let pm = 0; LUNCBattle.engine.scene.traverse(o => { if (o.name === 'rainPuddles') pm++; }); r({ on: LUNCBattle.rainMud.isEnabled(), wear: LUNCBattle.armyRealism.getWear(), puddleMeshes: pm }); LUNCBattle.v12extras.setWeather('clear'); }, 3000)); });
  out.offErrs = K.errs;
  console.log(JSON.stringify(out, null, 1)); out._printed = 1;
  const ok = out.high0.on && out.high1.wear.wet > 0.95 && out.high1.wear.mud > 0.9 && out.high1.st.puddlesVisible > 10 && out.dryout.after390.wet < 0.05 && out.dryout.after390.dry > 0.95 && out.dryout.after390.mud < out.high1.wear.mud && out.dryout.after390.fill < 0.2 &&
    out.iphone.st.puddles === 0 && out.iphone.wear.mud > 0.9 && !out.off.on && out.off.wear.wet === 0 && out.off.puddleMeshes === 0 && !out.highErrs.length && !out.iphoneErrs.length && !out.offErrs.length;
  console.log(ok ? 'RAIN-MUD PROBE PASS' : 'RAIN-MUD PROBE FAIL');
  await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
