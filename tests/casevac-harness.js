// CASEVAC probe (v12.0.67): a treated SERIOUS casualty is evacuated to its side's CCP — litter team (2 medics, pole litter,
// ~1.6 m/s, casualty ~0.85 m up) or a limp back alone (~0.9 m/s) — rests ~20 s on a CCP cot, then returns to the line.
// A hit bearer sets the casualty down and it is picked up again. Minor wounds don't evacuate. ?casevac=0 = v12.0.66.
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || '/workspace/lunc-shots/2026-11-25';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = [];
    p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|\[medics|\[squads/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(15000);
    await p.evaluate(() => LUNCBattle.engine.setPaused(true));
    return p;
  };
  // bull infantry casualty with >= 2 medics within 4..28 m (so a litter team can form)
  const pick = (p, skip) => p.evaluate(sk => {
    const A = LUNCBattle.engine.getArmies(), M = LUNCBattle.medics._medics(-1);
    const inf = u => u.parent && u.userData && (u.userData.type | 0) === 0 && !u.userData.air && !u.userData.medic && !u.userData.wounded && !u.userData.evac && !u.userData.rdDown && u.userData.aiRank == null;
    for (let i = 0; i < A.bulls.length; i++) {
      const u = A.bulls[i]; if (!inf(u) || (sk || []).includes(i)) continue;
      const ds = M.map(m => Math.hypot(m.position.x - u.position.x, m.position.z - u.position.z)).sort((a, c) => a - c);
      if (ds.length >= 2 && ds[0] > 3 && ds[1] < 28) return i;
    }
    return null;
  }, skip);
  // wound, step 0.1 s until evac ends; record modes, carry speed, litter lift, CCP distance, rest time
  const run = (p, i, serious, opt) => p.evaluate(a => {
    const u = LUNCBattle.engine.getArmies().bulls[a.i], MD = LUNCBattle.medics, e = LUNCBattle.engine;
    MD._wound(u, a.serious);
    let k = 0; for (; k < 900 && u.userData.wounded; k++) MD._step(0.1);
    const r = { healedIn: +(k / 10).toFixed(1), modes: [], picked: false, lift: 0, litters: 0, carryD: 0, carryT: 0, limpD: 0, limpT: 0, ccpT: 0, ccpDx: null, setDown: false, mid: null, done: false };
    let last = null, hit = false;
    for (k = 0; k < 3000; k++) {
      const ev = MD._evacOf(u); if (!ev) { r.done = true; break; }
      if (r.modes[r.modes.length - 1] !== ev.mode) r.modes.push(ev.mode);
      if (ev.picked) { r.picked = true; r.lift = Math.max(r.lift, ev.y); r.litters = Math.max(r.litters, ev.litters); if (last && last.picked) { r.carryD += Math.hypot(ev.x - last.x, ev.z - last.z); r.carryT += 0.1; } if (!r.mid && r.carryT > 6) r.mid = { x: ev.x, z: ev.z }; }
      if (ev.mode === 'limp' && last && last.mode === 'limp') { r.limpD += Math.hypot(ev.x - last.x, ev.z - last.z); r.limpT += 0.1; if (!r.mid && r.limpT > 3) r.mid = { x: ev.x, z: ev.z }; }
      if (ev.mode === 'ccp') { r.ccpT += 0.1; if (r.ccpDx == null) r.ccpDx = +Math.abs(ev.x - (-38)).toFixed(1); }
      if (a.hitAt && ev.picked && r.carryT > a.hitAt && !hit) { hit = MD._hitBearer(u); r.setDown = hit && MD._evacOf(u).mode === 'wait' && MD._evacOf(u).litters === 0; }
      if (a.stopMid && r.mid) return r;
      if (a.stopCcp && r.ccpT > 1) return r;
      last = ev; MD._step(0.1);
    }
    r.backInLine = !u.userData.evac && Math.abs(u.rotation.x) < 0.01 && u.rotation.order === 'XYZ';
    r.carryV = r.carryT ? +(r.carryD / r.carryT).toFixed(2) : null; r.limpV = r.limpT ? +(r.limpD / r.limpT).toFixed(2) : null;
    r.lift = +r.lift.toFixed(2); r.ccpT = +r.ccpT.toFixed(1); r.carryT = +r.carryT.toFixed(1);
    return r;
  }, Object.assign({ i, serious }, opt || {}));
  const out = {}, fails = [];
  const A = await mk('MEDIUM', false, '?play=1');
  out.s0 = await A.evaluate(() => { let cots = 0; const g = LUNCBattle.engine.scene.getObjectByName('ccp-points'); if (g) g.traverse(o => { if (o.name === 'ccp-cot') cots++; }); return { casevac: LUNCBattle.medics.casevacEnabled(), medics: LUNCBattle.medics._medics(-1).length, cots }; });
  if (!out.s0.casevac || out.s0.cots !== 12) fails.push('casevac / CCP cots missing ' + JSON.stringify(out.s0));
  const used = [];
  // 1) litter team, full run (screenshot mid-carry on a second run below)
  let i = await pick(A, used); used.push(i);
  if (i == null) fails.push('no litter candidate');
  else {
    const r = out.litter = await run(A, i, true);
    if (!r.picked || r.litters < 1) fails.push('no litter team ' + JSON.stringify(r));
    if (!(r.lift > 0.7 && r.lift < 1.0)) fails.push('casualty not carried at ~0.85 m ' + JSON.stringify(r));
    if (!(r.carryV > 1.3 && r.carryV < 1.75)) fails.push('litter speed not ~1.6 m/s ' + JSON.stringify(r));
    if (!(r.ccpDx != null && r.ccpDx < 9)) fails.push('did not reach the CCP ' + JSON.stringify(r));
    if (!(r.ccpT >= 19 && r.ccpT <= 22)) fails.push('CCP rest not ~20 s ' + JSON.stringify(r));
    if (!r.done || !r.backInLine) fails.push('did not return to the line ' + JSON.stringify(r));
  }
  // 2) limp (no free litter)
  await A.evaluate(() => LUNCBattle.medics._noLitter(-1, true));
  i = await pick(A, used); used.push(i);
  if (i != null) {
    const r = out.limp = await run(A, i, true);
    if (r.picked || !r.modes.includes('limp')) fails.push('no limp ' + JSON.stringify(r));
    if (!(r.limpV > 0.7 && r.limpV < 1.05)) fails.push('limp speed not ~0.9 m/s ' + JSON.stringify(r));
    if (!(r.ccpDx != null && r.ccpDx < 9) || !r.done) fails.push('limp did not reach CCP / return ' + JSON.stringify(r));
  } else fails.push('no limp candidate');
  await A.evaluate(() => LUNCBattle.medics._noLitter(-1, false));
  // 3) bearer hit mid-carry → set down → picked up again (or limps) → CCP
  i = await pick(A, used); used.push(i);
  if (i != null) {
    const r = out.bearer = await run(A, i, true, { hitAt: 2 });
    if (!r.setDown || !r.modes.includes('wait')) fails.push('bearer hit did not set the casualty down ' + JSON.stringify(r));
    if (!r.done || r.ccpDx == null) fails.push('set-down casualty never reached the CCP ' + JSON.stringify(r));
  } else fails.push('no bearer candidate');
  // 4) minor → no evac
  i = await pick(A, used); used.push(i);
  if (i != null) { const r = out.minor = await run(A, i, false); if (r.modes.length) fails.push('minor casualty evacuated ' + JSON.stringify(r)); }
  out.stats = await A.evaluate(() => LUNCBattle.medics.getStats());
  if (!(out.stats.evacuated >= 2 && out.stats.limped >= 1 && out.stats.ccpDone >= 3 && out.stats.setDown >= 1)) fails.push('stats wrong ' + JSON.stringify(out.stats));
  // screenshot: litter team mid-carry
  i = await pick(A, used); used.push(i);
  if (i != null) {
    const r = await run(A, i, true, { stopMid: true });
    if (r.mid) { await A.evaluate(m => { const e = LUNCBattle.engine; e.controls.minDistance = 1.5; e.controls.maxDistance = 500; e.controls.target.set(m.x, 0.8, m.z); e.camera.position.set(m.x + 2.5, 4.2, m.z + 3.5); e.controls.update(); }, r.mid); await A.waitForTimeout(2500); await A.screenshot({ path: OUT + '/casevac-litter.png', timeout: 120000 }); }
  }
  // CCP with casualties resting
  await A.evaluate(() => { const MD = LUNCBattle.medics; MD._step(80); });
  for (let n = 0; n < 3; n++) { const j = await pick(A, used); used.push(j); if (j != null) await run(A, j, true, { stopCcp: true }); }
  await A.evaluate(() => { const e = LUNCBattle.engine; e.controls.target.set(-44, 0.4, -8); e.camera.position.set(-40, 4.2, -1.5); e.controls.update(); }); await A.waitForTimeout(2000);
  await A.screenshot({ path: OUT + '/casevac-ccp.png', timeout: 120000 });
  await A.evaluate(() => LUNCBattle.engine.setPaused(false)); await A.waitForFunction(() => /evac [1-9]/.test((document.getElementById('sqMedics') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
  out.panel = await A.evaluate(() => { const el = document.getElementById('sqMedics'); return el ? el.textContent : null; });
  if (!out.panel || !/evac [1-9]/.test(out.panel) || !/at CCP \d/.test(out.panel)) fails.push('MEDICS line missing evac ' + out.panel);
  if (A.errs.length) fails.push('MEDIUM errors: ' + A.errs.join(' | '));
  await A.context().close();
  // 5) ?casevac=0 → v12.0.66: serious healed, no evac, no cots
  const K = await mk('MEDIUM', false, '?play=1&casevac=0');
  out.off0 = await K.evaluate(() => { let cots = 0; const g = LUNCBattle.engine.scene.getObjectByName('ccp-points'); if (g) g.traverse(o => { if (o.name === 'ccp-cot') cots++; }); return { casevac: LUNCBattle.medics.casevacEnabled(), care: LUNCBattle.medics.careEnabled(), cots }; });
  const k0 = await pick(K, []);
  if (k0 != null) out.off = await run(K, k0, true);
  if (out.off0.casevac || !out.off0.care || out.off0.cots) fails.push('?casevac=0 not off ' + JSON.stringify(out.off0));
  if (out.off && out.off.modes.length) fails.push('?casevac=0 still evacuates ' + JSON.stringify(out.off));
  if (K.errs.length) fails.push('?casevac=0 errors: ' + K.errs.join(' | '));
  await K.context().close();
  // 6) phone LOW: no cots, evac still works, no errors
  const M = await mk('LOW', true, '?play=1');
  out.phone0 = await M.evaluate(() => { let n = 0, cots = 0; const g = LUNCBattle.engine.scene.getObjectByName('ccp-points'); if (g) g.traverse(o => { if (o.isMesh) n++; if (o.name === 'ccp-cot') cots++; }); return { meshes: n, cots, medics: LUNCBattle.medics._medics(-1).length }; });
  const pi = await pick(M, []);
  if (pi != null) out.phone = await run(M, pi, true);
  if (out.phone0.meshes !== 4 || out.phone0.cots) fails.push('phone CCP wrong ' + JSON.stringify(out.phone0));
  if (out.phone && !out.phone.done) fails.push('phone evac stuck ' + JSON.stringify(out.phone));
  await M.evaluate(() => LUNCBattle.engine.setPaused(false)); await M.waitForTimeout(3000);
  await M.screenshot({ path: OUT + '/casevac-iphone.png', timeout: 120000 });
  if (M.errs.length) fails.push('phone errors: ' + M.errs.join(' | '));
  await M.context().close();
  console.log(JSON.stringify(out, null, 1));
  console.log(fails.length ? 'CASEVAC PROBE FAIL\n - ' + fails.join('\n - ') : 'CASEVAC PROBE PASS');
  await b.close(); process.exit(fails.length ? 2 : 0);
})().catch(e => { console.error(e); process.exit(3); });
