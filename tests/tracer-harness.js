// TRACER 1-IN-5 probe (v12.0.69): ~20 % of small-arms rounds glow; dark rounds still fly and impact. ?tracer15=0 = every round glows.
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || '/workspace/lunc-shots/2026-11-26';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const fails = [], out = {};
  for (const [name, qs] of [['on', '?play=1'], ['off', '?play=1&tracer15=0']]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('luncBattle.graphicsQuality', 'MEDIUM'); } catch (_) {} });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await p.goto(BASE + qs, { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(15000);
    const r = await p.evaluate(() => {
      const fx = LUNCBattle.engine.effects, s0 = fx.getTracerStats(), hits = { n: 0 };
      for (let i = 0; i < 200; i++) fx.fireWeapon({ from: { x: -20, z: i % 7 }, to: { x: 20, z: i % 7 }, kind: 'tracer', side: i % 2 ? 1 : -1, onHit: () => hits.n++ });
      const s1 = fx.getTracerStats(); return { s0, s1, on: s1.on, lit: s1.lit - s0.lit, dark: s1.dark - s0.dark };
    });
    r.errs = errs; out[name] = r;
    if (name === 'on') { await p.evaluate(() => LUNCBattle.engine.setPaused(false)); await p.waitForTimeout(4000); await p.screenshot({ path: OUT + '/tracer15-on.png', timeout: 120000 }); }
    else { await p.waitForTimeout(4000); await p.screenshot({ path: OUT + '/tracer15-off.png', timeout: 120000 }); }
    await ctx.close();
  }
  const on = out.on, off = out.off;
  if (!on.on || on.lit + on.dark !== 200) fails.push('on: counts ' + JSON.stringify(on));
  if (on.lit < 35 || on.lit > 45) fails.push('on: lit share not ~20 % (' + on.lit + '/200)');
  if (off.on || off.dark !== 0 || off.lit !== 200) fails.push('off: expected all lit ' + JSON.stringify(off));
  if (on.errs.length || off.errs.length) fails.push('page errors');
  console.log(JSON.stringify(out, null, 1));
  console.log(fails.length ? 'TRACER PROBE FAIL ' + fails.join('; ') : 'TRACER PROBE PASS');
  await b.close(); process.exit(fails.length ? 1 : 0);
})();
