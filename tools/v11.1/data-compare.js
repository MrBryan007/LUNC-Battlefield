const puppeteer = require('puppeteer-core');
const INIT = () => {
  let a = 1234567; Math.random = function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const realFetch = window.fetch;
  window.fetch = (u, o) => { const s = String(u); if (s.startsWith(location.origin) || s.startsWith('assets') || s.startsWith('/')) return realFetch(u, o); return Promise.reject(new Error('offline-harness')); };
  window.__ws = [];
  window.WebSocket = class { constructor(u) { this.url = u; this.readyState = 0; window.__ws.push(this); } send() {} close() {} };
  window.WebSocket.OPEN = 1;
};
async function run(url) {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.evaluateOnNewDocument(INIT);
  await p.goto(url, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));
  const snaps = await p.evaluate(async () => {
    const ws = window.__ws.find(w => /bookTicker/.test(w.url));
    if (!ws) return { err: 'no ws', urls: window.__ws.map(w => w.url) };
    ws.readyState = 1; ws.onopen && ws.onopen();
    const send = d => ws.onmessage({ data: JSON.stringify({ data: d }) });
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const snap = () => {
      const st = JSON.parse(JSON.stringify(LUNCBattle.market.getState()));
      const ui = LUNCBattle.ui;
      return { market: st, imb: ui.lastBookImbalance, truth: ui.lastBookTruth, zones: ui.lastZones,
        price: LUNCBattle.engine.getPrice(),
        dom: ['price', 'buyWall', 'sellWall', 'liquidityZones'].map(id => (document.getElementById(id) || {}).textContent) };
    };
    const out = [];
    let mid = 0.0000452;
    for (let burst = 0; burst < 6; burst++) {
      for (let i = 0; i < 40; i++) {
        const k = burst * 40 + i;
        mid = mid * (1 + Math.sin(k * 0.37) * 0.0004);
        if (k % 3 === 0) send({ b: (mid * 0.9999).toPrecision(8), a: (mid * 1.0001).toPrecision(8) });
        const bids = [], asks = [];
        for (let j = 0; j < 20; j++) {
          bids.push([(mid * (1 - 0.0002 * (j + 1))).toPrecision(8), String(1e9 + ((k * 7919 + j * 104729) % 9e9))]);
          asks.push([(mid * (1 + 0.0002 * (j + 1))).toPrecision(8), String(1e9 + ((k * 6007 + j * 15485863) % 9e9))]);
        }
        send({ bids, asks });
        if (i % 5 === 4) await wait(4);
      }
      await wait(1700);
      out.push(snap());
    }
    return out;
  });
  await b.close();
  return { snaps, errs };
}
(async () => {
  const q = '?play=1&loader=0&commander=1';
  const A = await run('http://localhost:8811/index.html' + q);
  const B = await run('http://localhost:8812/index.html' + q);
  const norm = s => JSON.stringify(s, (k, v) => (/ts|time|updated|age/i.test(k) ? undefined : v));
  let same = 0, diff = [];
  (A.snaps || []).forEach((s, i) => { if (norm(s) === norm(B.snaps[i])) same++; else diff.push(i); });
  console.log('old errs', A.errs, 'new errs', B.errs);
  console.log('checkpoints', (A.snaps||[]).length, 'identical', same, 'diff', diff);
  if (A.snaps && A.snaps[0]) console.log('sample old', JSON.stringify(A.snaps[5].dom), A.snaps[5].market.buyWallM, A.snaps[5].market.sellWallM);
  if (B.snaps && B.snaps[0]) console.log('sample new', JSON.stringify(B.snaps[5].dom), B.snaps[5].market.buyWallM, B.snaps[5].market.sellWallM);
  if (diff.length) { console.log(norm(A.snaps[diff[0]]).slice(0, 1500)); console.log(norm(B.snaps[diff[0]]).slice(0, 1500)); }
  require('fs').writeFileSync('data-compare.json', JSON.stringify({ A, B }, null, 1));
})();
