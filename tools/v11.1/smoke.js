const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const res = {};
  for (const vp of [{ w: 1280, h: 800, tag: 'desktop' }, { w: 390, h: 844, tag: 'phone', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' }]) {
    const p = await b.newPage(); await p.setViewport({ width: vp.w, height: vp.h }); if (vp.ua) await p.setUserAgent(vp.ua);
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.goto('http://localhost:8812/index.html?play=1&perf=1', { waitUntil: 'load', timeout: 60000 });
    await p.waitForFunction(() => window.LUNCBattle && LUNCBattle.loader && LUNCBattle.loader.getState().warmed, { timeout: 60000 });
    const r = await p.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const eng = LUNCBattle.engine, out = {};
      out.loader = LUNCBattle.loader.getState();
      out.v11 = LUNCBattle.v11.getStats();
      out.lightsAtLoad = 0; eng.scene.traverse(o => { if (o.isLight) out.lightsAtLoad++; });
      out.programsAtLoad = eng.renderer.info.programs.length;
      out.tiers = {};
      for (const t of ['LOW', 'MEDIUM', 'HIGH', 'ULTRA', 'AUTO']) { LUNCBattle.quality.setMode(t); await wait(1500); out.tiers[t] = { eff: LUNCBattle.quality.getEffectiveName(), soldiers: LUNCBattle.v11.getStats().soldiers }; }
      LUNCBattle.quality.setMode('HIGH'); await wait(800);
      const fx = eng.getFrontlineX();
      for (const a of ['arty', 'air']) { LUNCBattle.commander.debugFire(a, fx + 6, 0); await wait(2500); }
      LUNCBattle.commander.getState().session.charge = 100; LUNCBattle.commander.debugFire('moon', fx + 4, 2); await wait(3000);
      for (let i = 0; i < 6; i++) { eng.effects.createExplosion(fx + i, i - 3, 0xffbf47, 1.5, false); await wait(200); }
      await wait(1500);
      out.lightsAfter = 0; eng.scene.traverse(o => { if (o.isLight) out.lightsAfter++; });
      out.programsAfter = eng.renderer.info.programs.length;
      out.army = eng.getArmyStats(); out.units = eng.getArmies().bulls.length + eng.getArmies().bears.length;
      out.perf = LUNCBattle.perfStats; out.build = document.getElementById('buildTag').textContent;
      out.loaderHidden = getComputedStyle(document.getElementById('loadScreen')).display;
      return out;
    });
    r.errs = errs; res[vp.tag] = r;
    await p.screenshot({ path: 'shot-' + vp.tag + '.png' });
    await p.close();
  }
  await b.close();
  console.log(JSON.stringify(res, null, 1));
})();
