// EARTHWORKS probe (v12.0.71): frontline berms are earth mounds, sandbags are pillow clusters, berms + scorch discs tilt to the
// terrain normal, palette is sRGB-correct. ?earthworks=0 = v12.0.70 box berms.
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || '/workspace/lunc-shots/2026-11-27';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const fails = [], out = {};
  for (const [name, tier, qs, mob] of [['on', 'HIGH', '?play=1', false], ['off', 'HIGH', '?play=1&earthworks=0', false], ['phone', 'LOW', '?play=1', true]]) {
    const ctx = await b.newContext(mob ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(t => { try { localStorage.setItem('luncBattle.graphicsQuality', t); } catch (_) {} }, tier);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await p.goto(BASE + qs, { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(15000);
    const r = await p.evaluate(() => {
      const E = LUNCBattle.engine, T = E.THREE, g = E.scene.getObjectByName('contestedFrontline');
      const st = LUNCBattle.priceTerritory.getEarthworksStats ? LUNCBattle.priceTerritory.getEarthworksStats() : null;
      let boxes = 0, mounds = 0, worst = 0, checked = 0, earthR = null;
      const up = new T.Vector3(), n = new T.Vector3();
      g.children.forEach(o => {
        const geo = o.geometry; const isGroup = !o.isMesh;
        if (o.isMesh && geo.type === 'BoxGeometry' && geo.parameters.width >= 1.8) boxes++;
        if (o.isMesh && geo.type === 'SphereGeometry' && o.scale.x >= 0.9) { mounds++; if (earthR == null) earthR = o.material.color.r; }
        const isDisc = o.isMesh && geo.type === 'CircleGeometry';
        if ((o.isMesh && geo.type === 'SphereGeometry') || isDisc || isGroup) {
          const x = o.position.x, z = o.position.z, d = 0.6;
          const hx = (E.terrainHeight(x + d, z) - E.terrainHeight(x - d, z)) / (2 * d), hz = (E.terrainHeight(x, z + d) - E.terrainHeight(x, z - d)) / (2 * d);
          n.set(-hx, 1, -hz).normalize();
          up.set(0, isDisc ? 0 : 1, isDisc ? 1 : 0).applyQuaternion(o.quaternion);
          const ang = Math.acos(Math.min(1, up.dot(n))) * 180 / Math.PI; worst = Math.max(worst, ang); checked++;
        }
      });
      return { st, boxes, mounds, worst: +worst.toFixed(2), checked, earthR, build: LUNCBattle.config.BUILD_META.version };
    });
    r.errs = errs; out[name] = r;
    await p.screenshot({ path: OUT + '/earthworks-' + name + '.png', timeout: 120000 });
    await ctx.close();
  }
  const on = out.on, off = out.off, ph = out.phone;
  if (!on.st || !on.st.on || on.st.mounds < 5 || on.st.bagClusters < 3 || on.mounds < 5) fails.push('on: mounds/bags missing ' + JSON.stringify(on));
  if (on.boxes !== 0) fails.push('on: box berms still present ' + on.boxes);
  if (on.checked < 10 || on.worst > 3) fails.push('on: pieces not aligned to terrain (worst ' + on.worst + '°, n ' + on.checked + ')');
  if (!(on.earthR < 0.12)) fails.push('on: earth colour not linearised ' + on.earthR);
  if (!off.st || off.st.on || off.st.mounds !== 0 || off.boxes < 5) fails.push('off: expected v12.0.70 box berms ' + JSON.stringify(off));
  if (!ph.st || !ph.st.on || ph.st.mounds < 3) fails.push('phone: earthworks missing ' + JSON.stringify(ph.st));
  if (on.errs.length || off.errs.length || ph.errs.length) fails.push('page errors ' + JSON.stringify([on.errs, off.errs, ph.errs]));
  console.log(JSON.stringify(out, null, 1));
  console.log(fails.length ? 'EARTHWORKS PROBE FAIL ' + fails.join('; ') : 'EARTHWORKS PROBE PASS');
  await b.close(); process.exit(fails.length ? 1 : 0);
})();
