// HULKS probe (v12.0.70): persistent wrecks get per-kind detail parts (MBT / SPG / aircraft) with a camera-distance LOD;
// ?hulks=0 = v12.0.69 single-box wrecks; LOW = hull only.
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || '/workspace/lunc-shots/2026-11-27';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const fails = [], out = {};
  for (const [name, tier, qs] of [['on', 'HIGH', '?play=1'], ['off', 'HIGH', '?play=1&hulks=0'], ['low', 'LOW', '?play=1']]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(t => { try { localStorage.setItem('luncBattle.graphicsQuality', t); } catch (_) {} }, tier);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await p.goto(BASE + qs, { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(15000);
    const r = await p.evaluate(() => {
      const P = LUNCBattle.persist, E = LUNCBattle.engine, cam = E.camera.position;
      // drop a cluster right under the camera (near) and one far beyond the LOD radius
      const kinds = ['mbt', 'spg', 'air', 'box'], near = [], far = [];
      for (let i = 0; i < 12; i++) { const k = kinds[i % 4]; P.addWreck({ x: cam.x + (i % 4) * 5 - 8, z: cam.z - 30 + Math.floor(i / 4) * 5, rotY: i, sx: k === 'air' ? 2.2 : k === 'spg' ? 1.4 : 1.9, sy: k === 'air' ? 0.35 : 0.55, sz: k === 'air' ? 0.7 : 1.1, kind: k }); }
      for (let i = 0; i < 4; i++) P.addWreck({ x: cam.x + 900 + i * 6, z: cam.z + 900, rotY: i, kind: kinds[i] });
      P._lodTick();
      const s1 = P.getHulkStats();
      // move the camera far away → every hulk drops to hull-only, and back
      const c0 = cam.clone(); cam.set(c0.x + 5000, c0.y, c0.z + 5000); P._lodTick(); const s2 = P.getHulkStats();
      cam.copy(c0); P._lodTick(); const s3 = P.getHulkStats();
      const parts = E.scene.getObjectByName('persist-hulk-parts'), guns = E.scene.getObjectByName('persist-hulk-guns');
      return { s1, s2, s3, base: P.getStats().wrecks, hasParts: !!parts, hasGuns: !!guns };
    });
    r.errs = errs; out[name] = r;
    if (name === 'on') {
      await p.evaluate(() => { const E = LUNCBattle.engine, c = E.camera.position; if (E.controls && E.controls.target) { E.controls.target.set(c.x - 2, 0, c.z - 25); } E.camera.lookAt(c.x - 2, 0, c.z - 25); });
      await p.waitForTimeout(1500); await p.screenshot({ path: OUT + '/hulks-on.png', timeout: 120000 });
    }
    await ctx.close();
  }
  const on = out.on, off = out.off, low = out.low;
  if (!on.s1.on || !on.s1.detail || !on.hasParts || !on.hasGuns) fails.push('on: detail batches missing ' + JSON.stringify(on.s1));
  if (on.s1.kinds.mbt < 3 || on.s1.kinds.spg < 3 || on.s1.kinds.air < 3) fails.push('on: kinds ' + JSON.stringify(on.s1.kinds));
  if (on.s1.near < 12 || on.s1.far < 4) fails.push('on: LOD near/far ' + on.s1.near + '/' + on.s1.far);
  if (on.s2.near !== 0) fails.push('on: far camera still has near hulks ' + on.s2.near);
  if (on.s3.near < 12) fails.push('on: camera back, near not restored ' + on.s3.near);
  if (off.s1.on || off.s1.detail || off.hasParts || off.base < 16) fails.push('off: expected plain wrecks ' + JSON.stringify(off.s1));
  if (low.s1.detail || low.hasParts || low.base < 16) fails.push('low: expected hull-only ' + JSON.stringify(low.s1));
  if (on.errs.length || off.errs.length || low.errs.length) fails.push('page errors ' + JSON.stringify([on.errs, off.errs, low.errs]));
  console.log(JSON.stringify(out, null, 1));
  console.log(fails.length ? 'HULKS PROBE FAIL ' + fails.join('; ') : 'HULKS PROBE PASS');
  await b.close(); process.exit(fails.length ? 1 : 0);
})();
