// invite-link probe: desktop host makes an invite link, iPhone guest opens it, joins with one tap (relay shim for WebRTC)
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const path = require('path');
const SHIM = process.env.SHIM || path.join(__dirname, 'rtc-relay-shim.js');
const [shotB] = process.argv.slice(2);
const pages = [];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (mob, url) => { const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1, userAgent: mob ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, mob ? 'LOW' : 'MEDIUM');
    await ctx.addInitScript({ path: SHIM }); const p = await ctx.newPage(); pages.push(p);
    await p.exposeFunction('__relaySend', d => { const o = pages.find(x => x !== p && x.__peer); o && o.evaluate(v => window.__deliver(v), d).catch(() => {}); });
    await p.exposeFunction('__relayClose', () => { const o = pages.find(x => x !== p && x.__peer); o && o.evaluate(() => window.__remoteClosed()).catch(() => {}); });
    await p.exposeFunction('__relayLink', () => { pages.filter(x => x.__peer).forEach(x => x.evaluate(() => window.__open()).catch(() => {})); });
    p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300))); await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 150000 }); return p; };
  const out = {};
  const A = await mk(false, 'http://127.0.0.1:8765/index.html'); A.__peer = true;
  await A.waitForTimeout(14000);
  await A.evaluate(() => LUNCBattle.netplay.host());
  out.url = await A.evaluate(() => LUNCBattle.netplay.inviteUrl());
  out.shareBtn = await A.evaluate(() => !document.getElementById('npShareLink').hidden);
  // broken link page
  const C = await mk(true, 'http://127.0.0.1:8765/index.html#lbjoin=LO1.broken');
  await C.waitForTimeout(16000);
  out.broken = await C.evaluate(() => ({ hash: location.hash, invite: LUNCBattle.netplay.getState().invite, last: LUNCBattle.netplay.getState().stats.last, pcs: window.__pcCount || 0 }));
  await C.context().close();
  const B = await mk(true, out.url.replace(/^https?:\/\/[^/]+\/[^#]*/, 'http://127.0.0.1:8765/index.html')); B.__peer = true;
  await B.waitForTimeout(16000);
  out.opened = await B.evaluate(() => { const s = LUNCBattle.netplay.getState(), inv = document.getElementById('npInvite'); return { hash: location.hash, href: location.href, invite: s.invite, bannerShown: !!(inv && !inv.hidden), last: s.stats.last, pcsBeforeJoin: window.__pcCount || 0, sheetOpen: !!document.querySelector('#sheet-command.open, .sheet-command.open, #sheet-command[aria-hidden="false"]') }; });
  if (shotB) { await B.evaluate(() => { const p = document.getElementById('netplayPanel'); if (p) p.scrollIntoView({ block: 'start' }); }); await B.waitForTimeout(800); await B.screenshot({ path: shotB }); }
  const reply = await B.evaluate(() => LUNCBattle.netplay.joinInvite());
  out.reply = reply && reply.slice(0, 4);
  out.afterJoin = await B.evaluate(() => ({ invite: LUNCBattle.netplay.getState().invite, state: LUNCBattle.netplay.getState().state, last: LUNCBattle.netplay.getState().stats.last }));
  out.accepted = await A.evaluate(c => LUNCBattle.netplay.accept(c), reply);
  await A.waitForTimeout(4000);
  out.linked = { A: await A.evaluate(() => LUNCBattle.netplay.getState().state), B: await B.evaluate(() => [LUNCBattle.netplay.getState().state, LUNCBattle.netplay.getState().following]) };
  out.shareBtnAfter = await A.evaluate(() => !document.getElementById('npShareLink').hidden);
  console.log(JSON.stringify({ out, errA: A.errs, errB: B.errs }, null, 1));
  await b.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
