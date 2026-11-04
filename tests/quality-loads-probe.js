const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const runs = [['HIGH',false,''],['MEDIUM',false,''],['LOW',false,''],['LOW',true,''],['MEDIUM',false,'?partnerview=0'],['MEDIUM',false,'?online=0']];
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
 const res = [];
 for (const [q, mob, qs] of runs) { const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
  await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto('http://127.0.0.1:8765/index.html' + qs, { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(15000);
  const info = await p.evaluate(() => ({ build: LUNCBattle.config.BUILD_META && LUNCBattle.config.BUILD_META.version, np: !!(LUNCBattle.netplay && LUNCBattle.netplay.isEnabled()), pv: !!document.getElementById('npLook'), q: LUNCBattle.quality && LUNCBattle.quality.get ? LUNCBattle.quality.get() : null }));
  const name = (mob ? 'iphone' : q) + (qs ? '-' + qs.replace(/\W/g, '') : ''); await p.screenshot({ path: 'docs/v12055-shots/load-' + name + '.png' });
  res.push({ name, errs, info }); await ctx.close(); }
 console.log(JSON.stringify(res)); await b.close(); })().catch(e => { console.error(e); process.exit(2); });
