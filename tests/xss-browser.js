// Browser-level XSS regression. Exercises the real UI render paths.
// Run: node tests/xss-browser.js
// Requires chromium and puppeteer-core.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.XSS_PORT || 8791;
const HOSTILE = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  'javascript:alert(1)',
  '& < > " \''
];

function serve() {
  return new Promise(function (resolve) {
    const server = http.createServer(function (req, res) {
      let p = req.url.split('?')[0];
      if (p === '/') p = '/index.html';
      const file = path.join(ROOT, decodeURIComponent(p));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = path.extname(file);
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(PORT, '127.0.0.1', function () { resolve(server); });
  });
}

async function main() {
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch (e) { console.log('SKIP  puppeteer-core not installed'); process.exit(0); }

  const server = await serve();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME || '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();
  const alerts = [];
  page.on('dialog', function (d) { alerts.push(d.message()); d.dismiss(); });
  page.on('pageerror', function (err) { alerts.push('pageerror:' + err.message); });

  await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.LUNCBattle && window.LUNCBattle.ui && window.LUNCBattle.ui.renderIntelPanels', { timeout: 20000 });

  const result = await page.evaluate(function (payloads) {
    var LB = window.LUNCBattle;
    var DT = LB.DataTruth;
    var hostile = payloads[0];
    var findings = [];

    // Stub data sources with hostile strings, then call the REAL renderers.
    LB.burns = LB.burns || {};
    LB.burns.getLatest = function () {
      return { truth: DT.LIVE, events: [{ amountLunc: 1000, source: hostile }] };
    };
    LB.whales = LB.whales || {};
    LB.whales.getLatest = function () {
      return { truth: DT.LIVE, events: [{ classification: hostile, source: hostile }] };
    };
    LB.governance = LB.governance || {};
    LB.governance.getLatest = function () {
      return {
        truth: DT.LIVE,
        proposals: [{ title: hostile, id: 'p1' }],
        validators: [{ name: hostile, votingPower: hostile, tokens: hostile }]
      };
    };

    LB.ui.renderIntelPanels();
    LB.ui.renderBattleStrength({
      bull: 10, bear: 5,
      advantageState: { id: 'BULL', label: 'BULL', icon: '▲', css: 'bull', side: 'bull' },
      parts: [{ name: hostile, detail: hostile, bullDelta: 1, contributes: true, truth: 'LIVE' }]
    }, true);
    if (LB.ui.renderLiquidityBands) {
      LB.ui.renderLiquidityBands(
        { bids: [], asks: [], truth: 'LIVE', maxBidPct: 1, maxAskPct: 1, sourceLabel: hostile },
        hostile,
        {}
      );
    }

    function scan(id) {
      var el = document.getElementById(id);
      if (!el) return { id: id, missing: true };
      var html = el.innerHTML || '';
      var text = el.textContent || '';
      return {
        id: id,
        hasScriptEl: !!el.querySelector('script'),
        hasImgOnerror: !!el.querySelector('img[onerror]'),
        hasSvgOnload: !!el.querySelector('svg[onload]'),
        hasRawScript: html.indexOf('<script') !== -1,
        hasRawImg: html.indexOf('<img') !== -1 && html.indexOf('onerror') !== -1,
        textHasHostile: text.indexOf('alert(1)') !== -1 || text.indexOf(hostile) !== -1
      };
    }

    ['burnsStatus', 'whalesStatus', 'govStatus', 'validatorsList', 'strengthParts'].forEach(function (id) {
      findings.push(scan(id));
    });
    return { findings: findings, scriptCount: document.querySelectorAll('script').length };
  }, HOSTILE);

  await browser.close();
  server.close();

  let failed = 0;
  function check(name, ok) {
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
    if (!ok) failed++;
  }

  check('no dialogs fired', alerts.length === 0);
  result.findings.forEach(function (f) {
    if (f.missing) { check(f.id + ' present', false); return; }
    check(f.id + ' no script element', !f.hasScriptEl);
    check(f.id + ' no img onerror', !f.hasImgOnerror);
    check(f.id + ' no svg onload', !f.hasSvgOnload);
    check(f.id + ' no raw <script in html', !f.hasRawScript);
    check(f.id + ' hostile rendered as text', f.textHasHostile);
  });

  console.log('');
  console.log(failed ? ('FAILED ' + failed) : 'ALL PASS');
  process.exit(failed ? 1 : 0);
}

main().catch(function (e) {
  console.error('ERROR', e.message);
  process.exit(1);
});
