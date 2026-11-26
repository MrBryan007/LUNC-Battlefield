// MEDEVAC probe (v12.0.68): urgent casualty at the CCP → dustoff helicopter from the Role 2 hospital → green smoke → lands at
// the HLZ → crew carry the patient aboard on a litter → flight to the hospital → ward ~40 s → return to duty on the next
// sortie → dismount at the HLZ → walks back to the line at ~1.4 m/s. ?medevac=0 = v12.0.67 (CCP rest, then walk back).
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
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|\[medics|\[medevac|\[squads/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(15000);
    await p.evaluate(() => LUNCBattle.engine.setPaused(true));
    return p;
  };
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
  const scene = p => p.evaluate(() => { const c = {}; LUNCBattle.engine.scene.traverse(o => { if (/^medevac-/.test(o.name)) c[o.name] = (c[o.name] || 0) + 1; }); let hm = 0; LUNCBattle.engine.scene.traverse(o => { if (o.name === 'medevac-hospital') o.traverse(q => { if (q.isMesh) hm++; }); }); c.hospMeshes = hm; return c; });
  // full loop: wound → CCP → dustoff → hospital → RTD → line. opt.stop: return early at 'approach' / 'carry' / 'hosp' for a screenshot.
  const run = (p, i, opt) => p.evaluate(a => {
    const MD = LUNCBattle.medics, MV = LUNCBattle.medevac, u = LUNCBattle.engine.getArmies().bulls[a.i];
    if (!a.resume) { MD._wound(u, true); for (let k = 0; k < 900 && u.userData.wounded; k++) MD._step(0.1); }
    const r = window.__mv = a.resume ? window.__mv : { modes: [], heli: [], maxAgl: 0, maxV: 0, minPitch: 0, maxPitch: 0, maxRoll: 0, landDx: null, nearHeli: true, rtlV: 0, rtlT: 0, done: false, mdv: null };
    let last = null; r.shot = null;
    for (let k = 0; k < 6000; k++) {
      const ev = u.userData.evac; if (!ev) { r.done = true; break; }
      if (r.mdv == null && ev.mode === 'ccp') r.mdv = !!ev.mdv;
      if (r.modes[r.modes.length - 1] !== ev.mode) r.modes.push(ev.mode);
      const h = MV.isEnabled() ? MV._heli(-1) : null;
      if (h) {
        if (r.heli[r.heli.length - 1] !== h.st) { r.heli.push(h.st); if (h.st === 'ground' && r.landDx == null) { const z = MV.hlz(-1); r.landDx = +Math.hypot(h.x - z.x, h.z - z.z).toFixed(2); } }
        r.maxAgl = Math.max(r.maxAgl, h.agl); r.maxV = Math.max(r.maxV, h.v); r.minPitch = Math.min(r.minPitch, h.pitch); r.maxPitch = Math.max(r.maxPitch, h.pitch); r.maxRoll = Math.max(r.maxRoll, Math.abs(h.roll));
        if (ev.mode === 'aboard' && h.st.startsWith('to') && Math.hypot(u.position.x - h.x, u.position.z - h.z) > 3) r.nearHeli = false;
        if (a.stop === 'approach' && h.st === 'toHlz' && h.agl < 9 && h.agl > 3 && Math.hypot(h.x - MV.hlz(-1).x, h.z - MV.hlz(-1).z) < 18) { r.shot = { x: h.x, y: h.y, z: h.z }; return r; }
        if (a.stop === 'carry' && h.job === 'carry') { r.shot = { x: u.position.x, y: 0.8, z: u.position.z }; return r; }
        if (a.stop === 'hosp' && ev.mode === 'hosp' && h.st === 'pad') { r.shot = { x: u.position.x, y: 0, z: u.position.z }; return r; }
      }
      if (ev.mode === 'rtl' && last && last.mode === 'rtl') { r.rtlV = Math.max(r.rtlV, Math.abs(ev.x - last.x) / 0.1); r.rtlT += 0.1; }
      last = { mode: ev.mode, x: ev.x }; MD._step(0.1);
    }
    r.backInLine = !u.userData.evac && u.rotation.order === 'XYZ'; r.stats = MV.getStats(); r.mstats = MD.getStats();
    ['maxAgl', 'maxV', 'minPitch', 'maxPitch', 'maxRoll', 'rtlV', 'rtlT'].forEach(k => r[k] = +r[k].toFixed(2));
    return r;
  }, Object.assign({ i }, opt || {}));
  const cam = (p, t, off) => p.evaluate(a => { const e = LUNCBattle.engine; e.controls.minDistance = 1.5; e.controls.maxDistance = 900; e.controls.target.set(a.t.x, a.t.y || 0.8, a.t.z); e.camera.position.set(a.t.x + a.o[0], (a.t.y || 0) + a.o[1], a.t.z + a.o[2]); e.controls.update(); }, { t, o: off });
  const out = {}, fails = [];
  const A = await mk('MEDIUM', false, '?play=1');
  out.s0 = await scene(A);
  out.en = await A.evaluate(() => ({ en: LUNCBattle.medevac.isEnabled(), heli: LUNCBattle.medevac._heli(-1) }));
  if (!out.en.en || out.s0['medevac-heli'] !== 2 || out.s0['medevac-hlz'] !== 2 || out.s0['medevac-hospital'] !== 2 || !out.en.heli || out.en.heli.st !== 'pad') fails.push('medevac not built ' + JSON.stringify(out));
  const i = await pick(A, []);
  if (i == null) fails.push('no casualty candidate');
  else {
    let r = await run(A, i, { stop: 'approach' });
    if (r.shot) { await cam(A, r.shot, [-14, 3, 16]); await A.waitForTimeout(2500); await A.screenshot({ path: OUT + '/medevac-approach.png', timeout: 120000 }); }
    r = await run(A, i, { resume: true, stop: 'carry' });
    if (r.shot) { await A.evaluate(() => LUNCBattle.medics._step(4)); const s = await A.evaluate(n => { const u = LUNCBattle.engine.getArmies().bulls[n]; return { x: u.position.x, y: 0.8, z: u.position.z }; }, i); await cam(A, s, [7, 5, 9]); await A.waitForTimeout(2500); await A.screenshot({ path: OUT + '/medevac-hlz.png', timeout: 120000 }); }
    r = await run(A, i, { resume: true, stop: 'hosp' });
    if (r.shot) { await cam(A, r.shot, [-10, 9, 14]); await A.waitForTimeout(2500); await A.screenshot({ path: OUT + '/medevac-hospital.png', timeout: 120000 }); }
    r = out.loop = await run(A, i, { resume: true });
    const want = ['ccp', 'board', 'aboard', 'hosp', 'rtdWait', 'rtdBoard', 'aboard', 'rtl'];
    let k = 0; r.modes.forEach(m => { if (m === want[k]) k++; });
    if (!r.mdv) fails.push('CCP arrival not put on the manifest ' + JSON.stringify(r.modes));
    if (k < want.length) fails.push('patient flow wrong ' + JSON.stringify(r.modes));
    if (!r.heli.includes('toHlz') || !r.heli.includes('ground') || !r.heli.includes('toHosp')) fails.push('heli states wrong ' + JSON.stringify(r.heli));
    if (!(r.maxAgl > 18 && r.maxAgl < 32)) fails.push('cruise altitude not ~25 m ' + r.maxAgl);
    if (!(r.maxV > 10 && r.maxV <= 24.01)) fails.push('flight speed wrong ' + r.maxV);   // the 76 m HLZ→hospital leg peaks ~14 m/s on a 2.2 m/s² approach
    if (!(r.minPitch < -0.05 && r.maxPitch > 0.05)) fails.push('no nose-down accel / nose-up flare ' + r.minPitch + ' ' + r.maxPitch);
    if (!(r.landDx != null && r.landDx < 1.5)) fails.push('did not land on the HLZ ' + r.landDx);
    if (!r.nearHeli) fails.push('patient not riding in the cabin');
    if (!(r.rtlV > 1.0 && r.rtlV < 1.5) || !(r.rtlT > 3)) fails.push('return-to-line walk wrong ' + r.rtlV + ' / ' + r.rtlT);
    if (!r.done || !r.backInLine) fails.push('patient never back in the line ' + JSON.stringify(r));
    if (!(r.stats.lifted >= 1 && r.stats.rtd >= 1 && r.stats.smoke >= 1 && r.stats.sorties >= 2)) fails.push('stats wrong ' + JSON.stringify(r.stats));
  }
  await A.evaluate(() => LUNCBattle.engine.setPaused(false));
  await A.waitForFunction(() => /dustoff [1-9]/.test((document.getElementById('sqMedics') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
  out.panel = await A.evaluate(() => (document.getElementById('sqMedics') || {}).textContent);
  if (!/dustoff [1-9]/.test(out.panel || '')) fails.push('MEDICS line missing dustoff ' + out.panel);
  await A.waitForTimeout(25000);   // live (unpaused): no errors
  if (A.errs.length) fails.push('MEDIUM errors: ' + A.errs.join(' | '));
  await A.context().close();
  // ?medevac=0 → v12.0.67 + walk back
  const K = await mk('MEDIUM', false, '?play=1&medevac=0');
  out.off0 = await scene(K);
  const k0 = await pick(K, []);
  if (k0 != null) out.off = await run(K, k0, {});
  if (out.off0['medevac-heli']) fails.push('?medevac=0 still builds ' + JSON.stringify(out.off0));
  if (out.off && (out.off.mdv || out.off.modes.includes('aboard') || !out.off.modes.includes('rtl') || !out.off.done)) fails.push('?medevac=0 flow wrong ' + JSON.stringify(out.off.modes));
  if (K.errs.length) fails.push('?medevac=0 errors: ' + K.errs.join(' | '));
  await K.context().close();
  // phone LOW: built without tents, a loop runs, no errors
  const P = await mk('LOW', true, '?play=1');
  out.phone0 = await scene(P);
  const p0 = await pick(P, []);
  if (p0 != null) out.phone = await run(P, p0, {});
  if (out.phone0['medevac-heli'] !== 2 || !(out.phone0.hospMeshes < out.s0.hospMeshes)) fails.push('phone build wrong ' + JSON.stringify(out.phone0) + ' vs ' + out.s0.hospMeshes);
  if (out.phone && !out.phone.done) fails.push('phone loop stuck ' + JSON.stringify(out.phone.modes));
  await P.evaluate(() => LUNCBattle.engine.setPaused(false)); await P.waitForTimeout(3000);
  await P.screenshot({ path: OUT + '/medevac-iphone.png', timeout: 120000 });
  if (P.errs.length) fails.push('phone errors: ' + P.errs.join(' | '));
  await P.context().close();
  console.log(JSON.stringify(out, null, 1));
  console.log(fails.length ? 'MEDEVAC PROBE FAIL\n - ' + fails.join('\n - ') : 'MEDEVAC PROBE PASS');
  await b.close(); process.exit(fails.length ? 2 : 0);
})().catch(e => { console.error(e); process.exit(3); });
