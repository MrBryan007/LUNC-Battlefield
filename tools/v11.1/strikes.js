const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const out = {};
  for (const [tag, base] of [['old', 8811], ['new', 8812]]) {
    const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.evaluateOnNewDocument(() => { window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ entryTypes: ['longtask'] }); } catch (_) {} });
    await p.goto(`http://localhost:${base}/index.html?play=1&quality=HIGH`, { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => window.LUNCBattle && LUNCBattle.v11 && LUNCBattle.v11.isReady() && (!LUNCBattle.loader || LUNCBattle.loader.getState().warmed), { timeout: 90000 });
    await new Promise(r => setTimeout(r, 4000));
    const r = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)); const eng = LUNCBattle.engine;
      const lights = () => { let n = 0; eng.scene.traverse(o => { if (o.isLight) n++; }); return n; };
      const o = { progBefore: eng.renderer.info.programs.length, lightsBefore: lights() };
      const t0 = performance.now(); const fx = eng.getFrontlineX();
      LUNCBattle.commander.debugFire('arty', fx + 6, 0); await wait(2000);
      LUNCBattle.commander.debugFire('air', fx + 5, 3); await wait(2000);
      LUNCBattle.commander.getState().session.charge = 100; LUNCBattle.commander.debugFire('moon', fx + 4, 2); await wait(2500);
      for (let i = 0; i < 8; i++) { eng.effects.createExplosion(fx + i, i - 4, 0xffbf47, 1.6, false); await wait(150); }
      await wait(1500);
      o.progAfter = eng.renderer.info.programs.length; o.lightsAfter = lights();
      o.longTasksDuringStrikes = window.__lt.filter(x => x[0] >= t0);
      return o;
    });
    r.errs = errs; out[tag] = r; await p.close();
  }
  await b.close(); console.log(JSON.stringify(out));
})();
