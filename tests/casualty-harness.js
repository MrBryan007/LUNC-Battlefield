// casualty care probe (v12.0.66): triage, covering smoke + hold + casualty drag in the danger zone, longer serious treatment,
// safe-zone casualties treated in place, 30 m response range, CCP tent/sign, ?casualty=0 = old behaviour, ?smoke=0 still drags.
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12066-shots';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/^pick none/.test(t)) console.log(t); if (/Shader Error|VALIDATE_STATUS|Program Info Log|\[medics|\[smoke|\[squads/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(15000);
    await p.evaluate(() => LUNCBattle.engine.setPaused(true));
    return p;
  };
  // pick a bull infantry casualty: danger = enemy within 24 m (or not), with an idle medic 4–30 m away
  const pick = (p, danger) => p.evaluate(dg => {
    const e = LUNCBattle.engine, A = e.getArmies(), M = LUNCBattle.medics._medics(-1);
    const inf = u => u.parent && u.userData && (u.userData.type | 0) === 0 && !u.userData.air && !u.userData.medic && !u.userData.wounded && !u.userData.rdDown && u.userData.aiRank == null;
    const near = (x, z) => { let d = 1e9, w = null; A.bears.forEach(v => { if (v.parent && !v.userData.rdDown && !v.userData.air) { const q = Math.hypot(v.position.x - x, v.position.z - z); if (q < d) { d = q; w = v; } } }); near.w = w; return d; };
    let best = null, maxNe = 0; const cand = { n: 0, los: 0 };
    A.bulls.forEach((u, i) => { if (!inf(u) || best) return; const ne = near(u.position.x, u.position.z); maxNe = Math.max(maxNe, ne); if (dg ? ne > 13 : ne < 15) return; if (dg) { cand.n++; if (!LUNCBattle.los.trace(near.w.position.x, near.w.position.z, u.position.x, u.position.z).ok) return; cand.los++; }
      const md = Math.min(...M.map(m => Math.hypot(m.position.x - u.position.x, m.position.z - u.position.z))); if (md < 2 || md > 29) return; best = { i, ne: +ne.toFixed(1), md: +md.toFixed(1) }; });
    if (!best) console.log('pick none: maxNe ' + maxNe.toFixed(1) + ' medics ' + M.length + ' cand ' + JSON.stringify(cand));
    return best;
  }, danger);
  // wound it and run the medic sim with a fixed 0.1 s step until treated; log the state machine
  const run = (p, i, serious) => p.evaluate(a => {
    const u = LUNCBattle.engine.getArmies().bulls[a.i], MD = LUNCBattle.medics, SM = LUNCBattle.smoke;
    const sm0 = SM ? SM.getState().stats.medic || 0 : 0;
    MD._wound(u, a.serious); const x0 = u.userData.wounded.x, z0 = u.userData.wounded.z;
    const seq = []; let treatT = 0, xT = null, danger = null, mid = null;
    for (let k = 0; k < 900 && u.userData.wounded; k++) {
      MD._step(0.1); if (SM && SM.isEnabled()) SM._step(0.1);
      const m = MD._medicOf(u); const st = m ? m.st : 'wait';
      if (m && danger == null) danger = m.danger;
      if (seq[seq.length - 1] !== st) seq.push(st);
      if (st === 'treat') { treatT += 0.1; if (xT == null) xT = u.userData.wounded.x; }
      if (st === 'drag' && !mid) mid = { x: u.position.x, z: u.position.z };
    }
    return { seq, danger, treatT: +treatT.toFixed(1), drag: xT == null ? null : +((xT - x0) * -1).toFixed(2), healed: !u.userData.wounded, smoke: (SM ? SM.getState().stats.medic || 0 : 0) - sm0, x0: +x0.toFixed(1), z0: +z0.toFixed(1), mid };
  }, { i, serious });
  const out = {}, fails = [];
  const A = await mk('MEDIUM', false, '?play=1');
  out.s0 = await A.evaluate(() => ({ en: LUNCBattle.medics.isEnabled(), care: LUNCBattle.medics.careEnabled(), medics: LUNCBattle.medics._medics(-1).length, ccp: !!LUNCBattle.engine.scene.getObjectByName('ccp-points'), ccpMeshes: (() => { let n = 0; const g = LUNCBattle.engine.scene.getObjectByName('ccp-points'); if (g) g.traverse(o => { if (o.isMesh) n++; }); return n; })() }));
  if (!out.s0.care || !out.s0.medics || !out.s0.ccp || out.s0.ccpMeshes < 10) fails.push('care / medics / CCP missing ' + JSON.stringify(out.s0));
  // danger zone, serious
  out.pickD = await pick(A, true);
  if (!out.pickD) fails.push('no danger-zone casualty candidate');
  else {
    // screenshot mid-drag: run partially first
    out.danger = await run(A, out.pickD.i, true);
    const d = out.danger;
    if (!d.danger) fails.push('danger zone not detected ' + JSON.stringify(d));
    if (!(d.seq.includes('hold') && d.smoke >= 1)) fails.push('no covering smoke / hold ' + JSON.stringify(d));
    if (!d.seq.includes('drag') || !(d.drag >= 4)) fails.push('no casualty drag toward own lines ' + JSON.stringify(d));
    if (!(d.treatT >= 4.5) || !d.healed) fails.push('serious treatment too short / not healed ' + JSON.stringify(d));
    if (d.mid) { await A.evaluate(m => { const e = LUNCBattle.engine; e.controls.minDistance = 2; e.controls.maxDistance = 500; e.controls.target.set(m.x, 1, m.z); e.camera.position.set(m.x - 12, 8, m.z + 14); e.controls.update(); }, d.mid); await A.waitForTimeout(2500); await A.screenshot({ path: OUT + '/casualty-smoke.png', timeout: 120000 }); }
  }
  // safe zone, minor
  out.pickS = await pick(A, false);
  if (!out.pickS) fails.push('no safe casualty candidate');
  else {
    out.safe = await run(A, out.pickS.i, false);
    const s = out.safe;
    if (s.danger || s.seq.includes('hold') || s.seq.includes('drag') || s.smoke) fails.push('safe casualty got smoke / drag ' + JSON.stringify(s));
    if (!(s.treatT >= 2 && s.treatT <= 3) || !s.healed) fails.push('minor treatment wrong ' + JSON.stringify(s));
  }
  out.stats = await A.evaluate(() => LUNCBattle.medics.getStats());
  // CCP view
  await A.evaluate(() => { const e = LUNCBattle.engine; e.controls.target.set(-39, 1, -6); e.camera.position.set(-30, 7, 4); e.controls.update(); }); await A.waitForTimeout(2000);
  await A.screenshot({ path: OUT + '/ccp-bulls.png', timeout: 120000 });
  await A.evaluate(() => LUNCBattle.engine.setPaused(false)); await A.waitForFunction(() => /treated [1-9]/.test((document.getElementById('sqMedics') || {}).textContent || ''), null, { timeout: 30000 }).catch(() => {});
  out.panel = await A.evaluate(() => { const el = document.getElementById('sqMedics'); return el ? el.textContent : null; });
  if (!out.panel || !/treated [1-9]/.test(out.panel) || !/dragged [1-9]/.test(out.panel)) fails.push('SQUADS panel MEDICS line wrong ' + out.panel);
  if (A.errs.length) fails.push('MEDIUM errors: ' + A.errs.join(' | '));
  await A.context().close();
  // ?smoke=0: still drags, no smoke
  const S = await mk('MEDIUM', false, '?play=1&smoke=0');
  const ps = await pick(S, true);
  if (ps) { out.nosmoke = await run(S, ps.i, true); if (out.nosmoke.smoke || out.nosmoke.seq.includes('hold') || !out.nosmoke.seq.includes('drag')) fails.push('?smoke=0 behaviour wrong ' + JSON.stringify(out.nosmoke)); }
  else out.nosmoke = 'no candidate (skipped)';
  if (S.errs.length) fails.push('?smoke=0 errors: ' + S.errs.join(' | '));
  await S.context().close();
  // ?casualty=0: old behaviour
  const K = await mk('MEDIUM', false, '?play=1&casualty=0');
  out.off0 = await K.evaluate(() => ({ care: LUNCBattle.medics.careEnabled(), ccp: !!LUNCBattle.engine.scene.getObjectByName('ccp-points'), panelShown: (() => { const el = document.getElementById('sqMedics'); return !!(el && !el.parentNode.hidden); })() }));
  const pk = await pick(K, true);
  if (pk) out.off = await run(K, pk.i, true);
  if (out.off0.care || out.off0.ccp || out.off0.panelShown) fails.push('?casualty=0 not off ' + JSON.stringify(out.off0));
  if (out.off && (out.off.seq.includes('drag') || out.off.seq.includes('hold') || out.off.smoke || out.off.treatT > 3)) fails.push('?casualty=0 behaviour changed ' + JSON.stringify(out.off));
  if (K.errs.length) fails.push('?casualty=0 errors: ' + K.errs.join(' | '));
  await K.context().close();
  // phone: sign only, no errors
  const M = await mk('LOW', true, '?play=1');
  out.phone = await M.evaluate(() => { let n = 0; const g = LUNCBattle.engine.scene.getObjectByName('ccp-points'); if (g) g.traverse(o => { if (o.isMesh) n++; }); return { ccp: !!g, meshes: n, medics: LUNCBattle.medics._medics(-1).length }; });
  if (!out.phone.ccp || out.phone.meshes !== 4) fails.push('phone CCP wrong ' + JSON.stringify(out.phone));
  await M.evaluate(() => LUNCBattle.engine.setPaused(false)); await M.waitForTimeout(3000);
  await M.screenshot({ path: OUT + '/iphone-casualty.png', timeout: 120000 });
  if (M.errs.length) fails.push('phone errors: ' + M.errs.join(' | '));
  await M.context().close();
  console.log(JSON.stringify(out, null, 1));
  console.log(fails.length ? 'CASUALTY PROBE FAIL\n - ' + fails.join('\n - ') : 'CASUALTY PROBE PASS');
  await b.close(); process.exit(fails.length ? 2 : 0);
})().catch(e => { console.error(e); process.exit(3); });
