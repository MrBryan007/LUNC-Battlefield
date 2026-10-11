// v11.2: offline soldier pose bake. Runs the exact v11.1 runtime bake in headless Chrome
// (?v11poses=runtime), then serialises it to assets/models/v11/soldier-poses.bin.
// Usage: NODE_PATH=<puppeteer-core> node tools/v11.2/bake-poses.js [port=8812]
const puppeteer = require('puppeteer-core'), fs = require('fs'), path = require('path');
const port = process.argv[2] || 8812;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${port}/index.html?play=1&loader=0&v11poses=runtime&v11lod=0`, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => window.LUNCBattle && LUNCBattle.v11 && LUNCBattle.v11.isReady(), { timeout: 180000 });
  const r = await p.evaluate(() => ({ b64: LUNCBattle.v11.exportPoses(), st: LUNCBattle.v11.getStats() }));
  if (!r.b64) throw new Error('export failed ' + errs.join(';'));
  const out = path.join(__dirname, '../../assets/models/v11/soldier-poses.bin');
  fs.writeFileSync(out, Buffer.from(r.b64, 'base64'));
  console.log('wrote', out, fs.statSync(out).size, 'bytes; runtime bake took', r.st.bakeMs, 'ms; source', r.st.poseSource, errs);
  await b.close();
})();
