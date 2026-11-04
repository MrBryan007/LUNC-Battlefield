// shared-pings probe: hand pings and located signals between a desktop host and an iPhone guest (relay shim)
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
  // host pings on its tactical map by hand (shared), guest sees it in ally blue with the callsign
  await A.evaluate(() => LUNCBattle.engine.focusWorld(60, 40, false)); await A.waitForTimeout(1200);
  out.refA = await A.evaluate(() => LUNCBattle.tacmap.userPing(150, -80));
  await B.waitForTimeout(1500);
  out.Bmark = await B.evaluate(() => { const s = LUNCBattle.netplay.getState().stats; return { marksIn: s.marksIn || 0, last: s.last, pings: LUNCBattle.tacmap.getState().pings, beacons: LUNCBattle.engine.scene.children.filter(o => o.name === 'tac-beacon').length }; });
  out.AmarksOut = await A.evaluate(() => LUNCBattle.netplay.getState().stats.marksOut || 0);
  // a second hand ping within 0.8 s is not re-sent (rate limit); a mission/strike-style ping is never sent
  out.spam = await A.evaluate(() => { LUNCBattle.tacmap.userPing(10, 10); LUNCBattle.tacmap.ping(20, 20); return LUNCBattle.netplay.getState().stats.marksOut || 0; });
  // located signal: guest asks for support while looking at (120, -60)
  await B.evaluate(() => LUNCBattle.engine.focusWorld(120, -60, false)); await B.waitForTimeout(500);
  await B.evaluate(() => LUNCBattle.netplay.signal('support')); await A.waitForTimeout(1200);
  out.Asig = await A.evaluate(() => LUNCBattle.netplay.getState().stats.last);
  // old-style signal without a place still works; hostile marks are clamped / rejected
  await A.evaluate(() => LUNCBattle.netplay._onMsg(JSON.stringify({ v: 1, k: 'sig', id: 'gg' }))); out.AsigOld = await A.evaluate(() => LUNCBattle.netplay.getState().stats.last);
  out.hostile = await B.evaluate(async () => { const N = LUNCBattle.netplay, b0 = N.getState().stats.bad; await new Promise(r => setTimeout(r, 500)); N._onMsg(JSON.stringify({ v: 1, k: 'mark', x: 'nope', z: 1 })); await new Promise(r => setTimeout(r, 500)); N._onMsg(JSON.stringify({ v: 1, k: 'mark', x: 1e9, z: -1e9 })); return { bad: N.getState().stats.bad - b0, last: N.getState().stats.last }; });
  if (shotB) { await B.evaluate(() => { LUNCBattle.tacmap.open(); }); await B.waitForTimeout(600); await B.evaluate(() => LUNCBattle.netplay._onMsg(JSON.stringify({ v: 1, k: 'mark', x: 150, z: -80 }))); await B.waitForTimeout(1500); await B.screenshot({ path: shotB }); }
  if (shotA) { await A.evaluate(() => LUNCBattle.tacmap.open()); await A.waitForTimeout(1200); await A.screenshot({ path: shotA }); }
  console.log(JSON.stringify({ out, errA: A.errs, errB: B.errs }, null, 1));
  await b.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
