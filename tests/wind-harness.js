// shared wind probe (v12.0.64): wind state sane, windsocks swing downwind and fill with speed, smoke drifts downwind,
// HQ banners stream downwind, weather changes the wind, ?wind=0 restores the old behaviour. Screenshots to OUT.
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12064-shots';
require('fs').mkdirSync(OUT, { recursive: true });
const ang = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|\[wind|\[hqBanners|\[fires|\[theaters/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(14000);
    await p.evaluate(() => { const w = document.getElementById('cmdWatch'); if (w) w.click(); });
    return p;
  };
  const cam = (p, x, y, z, tx, ty, tz) => p.evaluate(a => { const e = LUNCBattle.engine; e.controls.minDistance = 2; e.controls.maxDistance = 500; e.controls.target.set(a[3], a[4], a[5]); e.camera.position.set(a[0], a[1], a[2]); e.controls.update(); }, [x, y, z, tx, ty, tz]);
  const out = {}, fails = [];
  const A = await mk('MEDIUM', false, '?play=1');
  out.s0 = await A.evaluate(() => LUNCBattle.wind.getState());
  if (!out.s0.enabled) fails.push('wind not enabled');
  if (out.s0.socks.length !== 4) fails.push('expected 4 windsocks, got ' + out.s0.socks.length);
  if (!(out.s0.speed >= 0.6 && out.s0.speed <= 14)) fails.push('speed out of range ' + out.s0.speed);
  // 1) wind FROM the west (270°) at 8 m/s (15.6 kt): blows toward +x → socks / banners yaw ≈ 0, socks fully filled
  await A.evaluate(() => LUNCBattle.wind.force(270, 8));
  await cam(A, -229, 6.5, -41, -236, 4.6, -48.8); await A.waitForTimeout(6000);
  out.w270 = await A.evaluate(() => { const s = LUNCBattle.wind.getState(); return { dir: s.dir, kt: s.kt, label: s.label, socks: s.socks, banner: LUNCBattle.hqBanners && LUNCBattle.hqBanners.getState().windYaw, flags: LUNCBattle.hqBanners && LUNCBattle.hqBanners.getState().flags }; });
  out.w270.socks.forEach((s, i) => { if (ang(s.hd, 0) > 0.15) fails.push('sock ' + i + ' hd ' + s.hd + ' not downwind (0)'); if (s.fill < 0.9) fails.push('sock ' + i + ' not filled at 15.6 kt: ' + s.fill); });
  if (out.w270.banner != null && ang(out.w270.banner, 0) > 0.05) fails.push('banner yaw ' + out.w270.banner);
  await A.screenshot({ path: OUT + '/windsock-15kt.png', timeout: 120000 });
  // 2) smoke: a heavy-fx smoke puff at the front drifts downwind (+x), not across
  out.smoke = await A.evaluate(() => { const F = LUNCBattle.heavyFx, fx = LUNCBattle.engine.getFrontlineX ? LUNCBattle.engine.getFrontlineX() : 0;
    const sp = F.puff({ kind: 'smoke', x: fx, y: 2, z: 0, vy: 0.8, size: 1, life: 4, color: 0x555555, opacity: 0.4 }); if (!sp) return null;
    const x0 = sp.position.x, z0 = sp.position.z; for (let i = 0; i < 50; i++) F.update(0.05);   // 2.5 s of synthetic steps (frame-rate independent)
    return { dx: +(sp.position.x - x0).toFixed(2), dz: +(sp.position.z - z0).toFixed(2), y: +sp.position.y.toFixed(2) }; });
  if (!out.smoke) fails.push('no smoke puff'); else if (!(out.smoke.dx > 1.0 && Math.abs(out.smoke.dz) < out.smoke.dx * 0.25)) fails.push('smoke not downwind ' + JSON.stringify(out.smoke));
  out.fires = await A.evaluate(() => LUNCBattle.fires && LUNCBattle.fires.wind ? LUNCBattle.fires.wind() : null);
  if (out.fires && !(out.fires.shared && out.fires.x > 0)) fails.push('fires not on the shared wind ' + JSON.stringify(out.fires));
  // 3) light air FROM the south (180°) at 1.5 m/s (2.9 kt): blows toward −z → hd ≈ +π/2, socks limp
  await A.evaluate(() => LUNCBattle.wind.force(180, 1.5)); await A.waitForTimeout(6000);
  out.w180 = await A.evaluate(() => LUNCBattle.wind.getState());
  out.w180.socks.forEach((s, i) => { if (ang(s.hd, Math.PI / 2) > 0.15) fails.push('sock ' + i + ' hd ' + s.hd + ' not downwind (π/2)'); if (s.fill > 0.35) fails.push('sock ' + i + ' too full at 2.9 kt: ' + s.fill); if (s.droop > -0.8) fails.push('sock ' + i + ' not drooping ' + s.droop); });
  await A.screenshot({ path: OUT + '/windsock-3kt.png', timeout: 120000 });
  // 4) back to the natural wind; rain makes it stronger, fog calmer
  await A.evaluate(() => LUNCBattle.wind.force(null, null));
  out.rain = await A.evaluate(() => new Promise(res => { const sel = document.getElementById('v12Weather'); if (!sel) return res(null); sel.value = 'rain'; sel.dispatchEvent(new Event('change', { bubbles: true })); setTimeout(() => { const s = LUNCBattle.wind.getState(); sel.value = 'fog'; sel.dispatchEvent(new Event('change', { bubbles: true })); setTimeout(() => { const f = LUNCBattle.wind.getState(); sel.value = 'clear'; sel.dispatchEvent(new Event('change', { bubbles: true })); res({ rain: s.wxMul, fog: f.wxMul, label: s.label }); }, 16000); }, 16000); }));
  if (out.rain && !(out.rain.rain > 1.3 && out.rain.fog < 0.7)) fails.push('weather does not shape the wind ' + JSON.stringify(out.rain));
  out.panel = await A.evaluate(() => { const el = (document.getElementById('wxStatus') || {}).textContent; const m0 = el && el.match(/WIND \d{3}° \([A-Z]+\) \d+ kt/); return m0 ? m0[0] : null; });
  if (!out.panel) fails.push('WIND line missing in WEATHER & CYBER panel');
  out.consoleWind = await A.evaluate(() => LUNCBattle.wind.label());
  // overview of the airbase with the socks + an HQ banner shot
  await A.evaluate(() => LUNCBattle.wind.force(225, 6));
  await cam(A, -170, 26, -20, -205, 0, -52); await A.waitForTimeout(5000); await A.screenshot({ path: OUT + '/airbase-wind.png', timeout: 120000 });
  out.errMedium = A.errs.slice(); if (A.errs.length) fails.push('MEDIUM errors: ' + A.errs.join(' | '));
  await A.context().close();
  // ?wind=0
  const K = await mk('MEDIUM', false, '?wind=0');
  out.off = await K.evaluate(() => ({ en: LUNCBattle.wind.isEnabled(), socks: LUNCBattle.wind.getState().socks.length, root: !!LUNCBattle.engine.scene.getObjectByName('wind-socks'), fires: LUNCBattle.fires && LUNCBattle.fires.wind && LUNCBattle.fires.wind().shared, banner: LUNCBattle.hqBanners && LUNCBattle.hqBanners.getState().windYaw }));
  if (out.off.en || out.off.socks || out.off.root || out.off.fires || out.off.banner != null) fails.push('?wind=0 not off ' + JSON.stringify(out.off));
  if (K.errs.length) fails.push('?wind=0 errors: ' + K.errs.join(' | '));
  await K.context().close();
  // phone
  const M = await mk('LOW', true, '');
  out.phone = await M.evaluate(() => { const s = LUNCBattle.wind.getState(); return { en: s.enabled, socks: s.socks.length, label: s.label }; });
  await M.screenshot({ path: OUT + '/iphone-wind.png', timeout: 120000 });
  if (M.errs.length) fails.push('phone errors: ' + M.errs.join(' | '));
  await M.context().close();
  console.log(JSON.stringify(out, null, 1));
  console.log(fails.length ? 'WIND PROBE FAIL\n - ' + fails.join('\n - ') : 'WIND PROBE PASS');
  await b.close(); process.exit(fails.length ? 2 : 0);
})().catch(e => { console.error(e); process.exit(3); });
