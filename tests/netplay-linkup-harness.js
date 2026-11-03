// two browsers-in-one: host (desktop MEDIUM) + guest (iPhone 390x844), link over WebRTC with copy-paste codes
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const [shotA, shotB, query] = process.argv.slice(2);
const pages = [];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const mk = async (mob, q) => { const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1, userAgent: mob ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, mob ? 'LOW' : 'MEDIUM');
    await ctx.addInitScript({ path: '' + require('path').join(__dirname, 'rtc-relay-shim.js') + '' }); const p = await ctx.newPage(); pages.push(p);
    await p.exposeFunction('__relaySend', d => { const o = pages.find(x => x !== p); o && o.evaluate(v => window.__deliver(v), d).catch(() => {}); });
    await p.exposeFunction('__relayClose', () => { const o = pages.find(x => x !== p); o && o.evaluate(() => window.__remoteClosed()).catch(() => {}); });
    await p.exposeFunction('__relayLink', () => { pages.forEach(x => x.evaluate(() => window.__open()).catch(() => {})); });
    p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300))); await p.goto('http://127.0.0.1:8765/index.html' + (q || ''), { waitUntil: 'load', timeout: 90000 }); return p; };
  const A = await mk(false, query), B = await mk(true, query);
  await A.waitForTimeout(14000);
  const out = {};
  out.enabled = await A.evaluate(() => LUNCBattle.netplay ? LUNCBattle.netplay.isEnabled() : null);
  if (!out.enabled) { out.panel = await A.evaluate(() => !!document.getElementById('netplayPanel')); console.log(JSON.stringify({ out, errA: A.errs, errB: B.errs })); await b.close(); return; }
  await A.evaluate(() => { localStorage.setItem('luncBattle.callsign', 'Alpha<b>Six'); });
  await B.evaluate(() => { localStorage.setItem('luncBattle.callsign', 'Bravo Two'); const w = document.getElementById('cmdWatch'); if (w) w.click(); });
  await A.evaluate(() => { const d = document.getElementById('cmdStart'); if (d) d.click(); });
  const t0 = Date.now();
  const offer = await A.evaluate(() => LUNCBattle.netplay.host()); out.offerLen = offer && offer.length; out.offerPre = offer && offer.slice(0, 4);
  out.badJoin = await B.evaluate(() => LUNCBattle.netplay.join('LO1.garbage').then(r => r === null && LUNCBattle.netplay.getState().stats.last));
  const reply = await B.evaluate(c => LUNCBattle.netplay.join(c), offer); out.replyLen = reply && reply.length; out.replyPre = reply && reply.slice(0, 4);
  out.wrongKind = await A.evaluate(c => LUNCBattle.netplay.accept(c), offer);
  out.accepted = await A.evaluate(c => LUNCBattle.netplay.accept(c), reply);
  for (let i = 0; i < 40; i++) { const s = await A.evaluate(() => LUNCBattle.netplay.getState().state); if (s === 'linked') break; await A.waitForTimeout(250); }
  await A.waitForTimeout(4500);
  out.linkMs = Date.now() - t0;
  out.A = await A.evaluate(() => LUNCBattle.netplay.getState()); out.B = await B.evaluate(() => LUNCBattle.netplay.getState());
  const scoreB0 = await B.evaluate(() => { const s = LUNCBattle.commander.getState().session; return s ? s.score : 0; });
  await A.evaluate(() => { const C = LUNCBattle.commander, cds = C.getState().cds; Object.keys(cds).forEach(k => cds[k] = 0); C.debugFire('air', 30, 12); });
  await B.waitForTimeout(1500);
  out.Bstrike = await B.evaluate(() => { const s = LUNCBattle.netplay.getState(); const sc = LUNCBattle.commander.getState().session; return { strikesIn: s.stats.strikesIn, rings: s.rings, last: s.stats.last, ringInScene: !!LUNCBattle.engine.scene.getObjectByName('netplay-ring'), score: sc ? sc.score : 0 }; });
  out.Bscore0 = scoreB0;
  await B.evaluate(() => LUNCBattle.netplay.signal('gg')); await A.waitForTimeout(800);
  out.Asig = await A.evaluate(() => { const s = LUNCBattle.netplay.getState(); return { signalsIn: s.stats.signalsIn, last: s.stats.last }; });
  // hostile messages on B
  out.hostile = await B.evaluate(() => { const N = LUNCBattle.netplay, s0 = N.getState().stats; const bad0 = s0.bad;
    N._onMsg('x'.repeat(3000)); N._onMsg('{not json'); N._onMsg(JSON.stringify({ k: 'eval', code: 'alert(1)' })); N._onMsg(JSON.stringify({ k: 'strike', a: '__proto__', x: 1, z: 1 })); N._onMsg(JSON.stringify({ k: 'sig', id: '<img onerror=1>' }));
    N._onMsg(JSON.stringify({ k: 'hello', name: '<script>x</script>', side: 'zzz' })); N._onMsg(JSON.stringify({ k: 'strike', a: 'air', x: 99999, z: -99999 }));
    const s1 = N.getState(); return { bad: s1.stats.bad - bad0, name: s1.peer.name, side: s1.peer.side, last: s1.stats.last }; });
  await B.waitForTimeout(1100);
  out.rate = await B.evaluate(() => { const N = LUNCBattle.netplay, d0 = N.getState().stats.dropped; for (let i = 0; i < 40; i++) N._onMsg(JSON.stringify({ k: 'mk', fx: 1, live: true, sc: 5, side: 'bull' })); return N.getState().stats.dropped - d0; });
  await B.evaluate(() => { LUNCBattle.dock.open('command'); const p = document.getElementById('netplayPanel'); if (p) p.scrollIntoView({ block: 'start' }); });
  await A.evaluate(() => { const w = document.getElementById('cmdWatch'); LUNCBattle.dock.open('command'); const p = document.getElementById('netplayPanel'); if (p) p.scrollIntoView({ block: 'start' }); });
  await B.waitForTimeout(2500);
  out.Bpanel = await B.evaluate(() => document.getElementById('npLink').textContent);
  if (shotB) await B.screenshot({ path: shotB }); if (shotA) await A.screenshot({ path: shotA });
  await A.evaluate(() => LUNCBattle.netplay.close()); await B.waitForTimeout(1500);
  out.afterClose = { A: await A.evaluate(() => LUNCBattle.netplay.getState().state), B: await B.evaluate(() => [LUNCBattle.netplay.getState().state, LUNCBattle.netplay.getState().stats.last]) };
  console.log(JSON.stringify({ out, errA: A.errs, errB: B.errs }, null, 1));
  await b.close();
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
