// partner-view probe: desktop host + iPhone guest linked through the relay shim; each sees the other's camera wedge
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const path = require('path');
const [shotA, shotB, query] = process.argv.slice(2);
const pages = [];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (mob, q) => { const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1, userAgent: mob ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, mob ? 'LOW' : 'MEDIUM');
    await ctx.addInitScript({ path: path.join(__dirname, 'rtc-relay-shim.js') }); const p = await ctx.newPage(); pages.push(p);
    await p.exposeFunction('__relaySend', d => { if (p.__mute && d.indexOf('"k":"cam"') >= 0) return; const o = pages.find(x => x !== p); o && o.evaluate(v => window.__deliver(v), d).catch(() => {}); });
    await p.exposeFunction('__relayClose', () => { const o = pages.find(x => x !== p); o && o.evaluate(() => window.__remoteClosed()).catch(() => {}); });
    await p.exposeFunction('__relayLink', () => { pages.forEach(x => x.evaluate(() => window.__open()).catch(() => {})); });
    p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300))); await p.goto('http://127.0.0.1:8765/index.html' + (q || ''), { waitUntil: 'load', timeout: 120000 }); return p; };
  const A = await mk(false, query), B = await mk(true, query);
  await A.waitForTimeout(15000);
  const out = {};
  await A.evaluate(() => localStorage.setItem('luncBattle.callsign', 'Alpha6'));
  await B.evaluate(() => { localStorage.setItem('luncBattle.callsign', 'Bravo2'); const w = document.getElementById('cmdWatch'); if (w) w.click(); });
  await A.evaluate(() => { const d = document.getElementById('cmdStart'); if (d) d.click(); });
  const offer = await A.evaluate(() => LUNCBattle.netplay.host());
  const reply = await B.evaluate(c => LUNCBattle.netplay.join(c), offer);
  out.accepted = await A.evaluate(c => LUNCBattle.netplay.accept(c), reply);
  for (let i = 0; i < 40; i++) { const s = await A.evaluate(() => LUNCBattle.netplay.getState().state); if (s === 'linked') break; await A.waitForTimeout(250); }
  // host flies its camera somewhere distinctive
  await A.evaluate(() => LUNCBattle.engine.focusWorld(120, -60, false));
  await A.waitForTimeout(3500);
  out.Bview = await B.evaluate(() => { const v = LUNCBattle.netplay.partnerView(); return v && { tx: v.tx, tz: v.tz, name: v.name, ally: v.ally, trail: v.trail.length }; });
  out.Aview = await A.evaluate(() => { const v = LUNCBattle.netplay.partnerView(); return v && { tx: v.tx, tz: v.tz, name: v.name, trail: v.trail.length }; });
  out.lookBtn = { A: await A.evaluate(() => !document.getElementById('npLook').hidden), B: await B.evaluate(() => !document.getElementById('npLook').hidden) };
  out.Bdrawn0 = await B.evaluate(() => LUNCBattle.tacmap.getState().partnerView);
  await B.waitForTimeout(1500);
  out.Bdrawn1 = await B.evaluate(() => LUNCBattle.tacmap.getState().partnerView);
  out.Bcam0 = await B.evaluate(() => { const t = LUNCBattle.engine.getCameraTarget(); return [Math.round(t.x), Math.round(t.z)]; });
  out.look = await B.evaluate(() => LUNCBattle.netplay.lookWithPartner());
  await B.waitForTimeout(6000);
  out.Bcam1 = await B.evaluate(() => { const t = LUNCBattle.engine.getCameraTarget(); return [Math.round(t.x), Math.round(t.z)]; });
  out.Blast = await B.evaluate(() => LUNCBattle.netplay.getState().stats.last);
  // hostile cam values are clamped to the world
  out.clamped = await B.evaluate(() => { LUNCBattle.netplay._onMsg(JSON.stringify({ v: 1, k: 'cam', cx: 1e9, cz: -1e9, tx: 'x', tz: 9e9 })); const v = LUNCBattle.netplay.partnerView(); return v && { cx: v.cx, cz: v.cz, tx: v.tx, tz: v.tz }; });
  if (shotA) { await A.evaluate(() => LUNCBattle.tacmap.open()); await A.waitForTimeout(1500); await A.screenshot({ path: shotA }); await A.evaluate(() => LUNCBattle.tacmap.close()); }
  if (shotB) { await B.evaluate(() => LUNCBattle.tacmap.open()); await B.waitForTimeout(1500); await B.screenshot({ path: shotB }); await B.evaluate(() => LUNCBattle.tacmap.close()); }
  // staleness: host stops sending cam, guest hides the wedge after 5 s
  A.__mute = true; await B.waitForTimeout(6500);
  out.staleView = await B.evaluate(() => LUNCBattle.netplay.partnerView());
  out.lookStale = await B.evaluate(() => LUNCBattle.netplay.lookWithPartner());
  await B.evaluate(() => LUNCBattle.netplay.close()); await A.waitForTimeout(1500);
  out.afterClose = await A.evaluate(() => [LUNCBattle.netplay.getState().state, LUNCBattle.netplay.partnerView()]);
  console.log(JSON.stringify({ out, errA: A.errs, errB: B.errs }, null, 1));
  await b.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
