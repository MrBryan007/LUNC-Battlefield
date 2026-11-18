// smoke screens probe (v12.0.65): a screen builds, blocks a sight line that was clear, drifts downwind with the shared
// wind, clears; Smoke order + cooldown; auto smoke on fall-back and when pinned; ?smoke=0 = old behaviour; phone loads.
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12065-shots';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|\[smoke|\[squads|\[los|\[theaters|\[wind/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(15000);
    return p;
  };
  const cam = (p, x, y, z, tx, ty, tz) => p.evaluate(a => { const e = LUNCBattle.engine; e.controls.minDistance = 2; e.controls.maxDistance = 500; e.controls.target.set(a[3], a[4], a[5]); e.camera.position.set(a[0], a[1], a[2]); e.controls.update(); }, [x, y, z, tx, ty, tz]);
  // find a clear 24 m sight line across the front and return the two ends
  const lane = p => p.evaluate(() => { const L = LUNCBattle.los, fx = LUNCBattle.engine.getFrontlineX() || 0; LUNCBattle.smoke._clear();
    for (let z = -30; z <= 30; z += 3) { const a = [fx - 14, z], c = [fx + 10, z]; if (L.trace(a[0], a[1], c[0], c[1]).ok) return { a, c, z }; } return null; });
  const out = {}, fails = [];
  const A = await mk('MEDIUM', false, '?play=1');
  out.s0 = await A.evaluate(() => ({ en: LUNCBattle.smoke.isEnabled(), btn: !!document.getElementById('sqSmoke'), los: LUNCBattle.los.isEnabled(), squads: LUNCBattle.squads.isEnabled() }));
  if (!out.s0.en || !out.s0.btn) fails.push('smoke not enabled / no Smoke button ' + JSON.stringify(out.s0));
  await A.evaluate(() => { try { LUNCBattle.wind.force(270, 6); } catch (_) {} });
  const ln = await lane(A); out.lane = ln; if (!ln) fails.push('no clear sight line found');
  if (ln) {
    out.before = await A.evaluate(l => LUNCBattle.los.trace(l.a[0], l.a[1], l.c[0], l.c[1]), ln);
    out.made = await A.evaluate(l => { const n = LUNCBattle.smoke.screen(l.a[0], l.a[1], l.c[0], l.c[1], -1, 'manual'); LUNCBattle.smoke._step(8); return n; }, ln);
    out.built = await A.evaluate(() => LUNCBattle.smoke.getState());
    out.during = await A.evaluate(l => LUNCBattle.los.trace(l.a[0], l.a[1], l.c[0], l.c[1]), ln);
    if (out.made !== 3) fails.push('screen made ' + out.made + ' clouds');
    if (!out.built.clouds.every(c => c.r > 3.5 && c.h > 3 && c.dens > 0.9)) fails.push('clouds did not build ' + JSON.stringify(out.built.clouds));
    if (out.during.ok || out.during.by !== 'smoke') fails.push('smoke does not block LOS ' + JSON.stringify(out.during));
    // the screen sits across the sight line (perpendicular), about 6 m in front of the thrower
    const c0 = out.built.clouds; out.geom = { spanZ: +(Math.max(...c0.map(c => c.z)) - Math.min(...c0.map(c => c.z))).toFixed(1), meanX: +(c0.reduce((s, c) => s + c.x, 0) / 3).toFixed(1) };
    if (out.geom.spanZ < 7) fails.push('screen not across the threat axis ' + JSON.stringify(out.geom));
    const fx = await A.evaluate(() => LUNCBattle.engine.getFrontlineX() || 0);
    await cam(A, ln.a[0] - 14, 7, ln.z + 16, ln.a[0] + 6, 2, ln.z); await A.waitForTimeout(2500);
    await A.screenshot({ path: OUT + '/smoke-screen.png', timeout: 120000 });
    // drift with the shared wind (from 270° → toward +x)
    const x0 = out.built.clouds.map(c => c.x);
    out.drift = await A.evaluate(x0 => { LUNCBattle.smoke._step(10); const s = LUNCBattle.smoke.getState(); return s.clouds.map((c, i) => +(c.x - x0[i]).toFixed(2)); }, x0);
    if (!out.drift.every(d => d > 2)) fails.push('clouds not drifting downwind ' + JSON.stringify(out.drift));
    out.clear = await A.evaluate(l => { LUNCBattle.smoke._step(45); return { n: LUNCBattle.smoke.getState().clouds.length, los: LUNCBattle.los.trace(l.a[0], l.a[1], l.c[0], l.c[1]).ok }; }, ln);
    if (out.clear.n !== 0 || !out.clear.los) fails.push('screen did not clear ' + JSON.stringify(out.clear));
    void fx;
  }
  // Smoke order + cooldown (UI button)
  out.order = await A.evaluate(() => { LUNCBattle.smoke._clear(); LUNCBattle.squads.select(0); const btn = document.getElementById('sqSmoke'); btn.click(); const s1 = LUNCBattle.smoke.getState(); btn.click(); const s2 = LUNCBattle.smoke.getState();
    const me = LUNCBattle.squads.list().filter(s => s.side === (LUNCBattle.commander.getState().profile.side === 'bull' ? -1 : 1))[0]; return { c1: s1.clouds.length, c2: s2.clouds.length, manual: s2.stats.manual, status: (document.getElementById('sqStatus') || {}).textContent, alpha: me && me.name }; });
  if (out.order.c1 !== 3 || out.order.c2 !== 3) fails.push('Smoke order / cooldown wrong ' + JSON.stringify(out.order));
  // auto smoke when an enemy squad falls back, and when pinned
  out.auto = await A.evaluate(() => { const sq = LUNCBattle.squads, me = LUNCBattle.commander.getState().profile.side === 'bull' ? -1 : 1, L = sq.list(); const k = L.findIndex(s => s.side !== me && !s.dead), k2 = L.findIndex((s, i) => s.side !== me && !s.dead && i !== k);
    const a0 = LUNCBattle.smoke.getState().stats.auto; let n = 9; for (let i = 0; i < 40 && n > 1; i++) n = sq._wound(k, me); const fb = sq.list()[k].fb, a1 = LUNCBattle.smoke.getState().stats.auto;
    const S2 = sq._sq(k2); S2.smokeCd = 0; S2.sup = 0.95; sq._step(0.2); const a2 = LUNCBattle.smoke.getState().stats.auto; return { k, n, fb, a0, a1, a2, cd2: S2.smokeCd }; });
  if (!(out.auto.fb && out.auto.a1 > out.auto.a0)) fails.push('no smoke on fall-back ' + JSON.stringify(out.auto));
  if (!(out.auto.a2 > out.auto.a1)) fails.push('no smoke when pinned ' + JSON.stringify(out.auto));
  out.losStats = await A.evaluate(() => LUNCBattle.los.getStats().by);
  // tactical map draws the clouds
  out.map = await A.evaluate(() => { LUNCBattle.smoke._step(4); const c = document.createElement('canvas').getContext('2d'); return LUNCBattle.smoke.drawMap(c, x => x, z => z, 4, true); });
  if (!(out.map > 0)) fails.push('tactical map draws no smoke');
  await cam(A, -20, 60, 70, 0, 0, 0); await A.waitForTimeout(2000); await A.screenshot({ path: OUT + '/smoke-overview.png', timeout: 120000 });
  if (A.errs.length) fails.push('MEDIUM errors: ' + A.errs.join(' | '));
  await A.context().close();
  // ?smoke=0
  const K = await mk('MEDIUM', false, '?play=1&smoke=0');
  out.off = await K.evaluate(() => { const b = document.getElementById('sqSmoke'); return { en: LUNCBattle.smoke.isEnabled(), made: LUNCBattle.smoke.screen(0, 0, 10, 0, -1), btnShown: !!(b && b.style.display !== 'none'), root: !!LUNCBattle.engine.scene.getObjectByName('smoke-screens'), sqOk: LUNCBattle.squads.isEnabled() }; });
  if (out.off.en || out.off.made || out.off.btnShown || out.off.root) fails.push('?smoke=0 not off ' + JSON.stringify(out.off));
  if (K.errs.length) fails.push('?smoke=0 errors: ' + K.errs.join(' | '));
  await K.context().close();
  // phone
  const M = await mk('LOW', true, '?play=1');
  const lm = await lane(M);
  out.phone = await M.evaluate(l => { const fx = LUNCBattle.engine.getFrontlineX() || 0, a = l ? l.a : [fx - 14, 0], c = l ? l.c : [fx + 10, 0]; LUNCBattle.smoke.screen(a[0], a[1], c[0], c[1], -1, 'manual'); LUNCBattle.smoke._step(8); const s = LUNCBattle.smoke.getState(); return { per: s.perCloud, clouds: s.clouds.length, sprites: s.clouds.reduce((n, c) => n + c.sprites, 0) }; }, lm);
  if (out.phone.per !== 3 || out.phone.clouds !== 3) fails.push('phone smoke wrong ' + JSON.stringify(out.phone));
  await M.screenshot({ path: OUT + '/iphone-smoke.png', timeout: 120000 });
  if (M.errs.length) fails.push('phone errors: ' + M.errs.join(' | '));
  await M.context().close();
  console.log(JSON.stringify(out, null, 1));
  console.log(fails.length ? 'SMOKE PROBE FAIL\n - ' + fails.join('\n - ') : 'SMOKE PROBE PASS');
  await b.close(); process.exit(fails.length ? 2 : 0);
})().catch(e => { console.error(e); process.exit(3); });
