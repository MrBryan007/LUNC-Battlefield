// v11.2: logical draw-call / triangle / program counts per tier, idle and during a strike burst.
// Usage: NODE_PATH=... node drawcalls.js <port>. Counts are renderer.info totals per frame averaged over
// consecutive frames (shadow pass + main + post). Valid on SwiftShader (counts are logical, not timings).
const puppeteer = require('puppeteer-core');
const port = process.argv[2] || 8812;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const res = {};
  for (const vp of [{ w: 1280, h: 800, tag: 'desktop' }, { w: 390, h: 844, tag: 'phone', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }]) {
    const p = await b.newPage(); await p.setViewport({ width: vp.w, height: vp.h }); if (vp.ua) await p.setUserAgent(vp.ua);
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.evaluateOnNewDocument(() => { let a = 99; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
    await p.goto(`http://localhost:${port}/index.html?play=1&perf=1`, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => window.LUNCBattle && LUNCBattle.loader && LUNCBattle.loader.getState().warmed && LUNCBattle.v11 && LUNCBattle.v11.isSettled(), { timeout: 120000 });
    const r = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const raf = () => new Promise(r => requestAnimationFrame(() => r()));
      const eng = LUNCBattle.engine, R = eng.renderer;
      // Wrap renderer.render and sum the per-call deltas (shadow pass + scene + post blits) over n
      // consecutive frames, so throttled shadow updates are averaged correctly.
      const acc = { calls: 0, tris: 0, points: 0 }, orig = R.render.bind(R);
      R.render = function (s, c) { const i = R.info.render, c0 = i.calls, t0 = i.triangles, p0 = i.points; orig(s, c); acc.calls += Math.max(0, i.calls - c0); acc.tris += Math.max(0, i.triangles - t0); acc.points += Math.max(0, i.points - p0); };
      async function frame(n) {
        R.info.autoReset = false; await raf(); acc.calls = acc.tris = acc.points = 0;
        for (let i = 0; i < n; i++) await raf();
        R.info.autoReset = true;
        return { calls: Math.round(acc.calls / n), tris: Math.round(acc.tris / n), points: Math.round(acc.points / n) };
      }
      const out = { tiers: {} };
      for (const t of ['LOW', 'MEDIUM', 'HIGH', 'ULTRA']) {
        LUNCBattle.quality.setMode(t); await wait(2500);
        const idle = await frame(12);
        const fx = eng.getFrontlineX();
        LUNCBattle.commander.debugFire('arty', fx + 6, 0); LUNCBattle.commander.debugFire('air', fx + 5, 3);
        for (let i = 0; i < 6; i++) eng.effects.createExplosion(fx + i, i - 3, 0xffbf47, 1.5, false);
        await wait(700);
        const burst = await frame(6);
        out.tiers[t] = { idle, burst, particles: (eng.getPerf && eng.getPerf().particles) || null, v11: LUNCBattle.v11.getStats().soldiers, programs: R.info.programs.length };
        await wait(3000);
      }
      out.programsEnd = R.info.programs.length; out.build = document.getElementById('buildTag').textContent;
      return out;
    });
    r.errs = errs; res[vp.tag] = r; await p.close();
  }
  await b.close(); console.log(JSON.stringify(res, null, 1));
})();
