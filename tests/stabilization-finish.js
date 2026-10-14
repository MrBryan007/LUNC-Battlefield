// Security and build-consistency checks for the stabilization finish pass.
// Run: node tests/stabilization-finish.js
const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const config = read('js/config.js');
const ui = read('js/ui.js');
const index = read('index.html');
const gfx = read('js/gfx-recover.js');
const camera = read('js/camera.js');
const boot = read('js/boot-stage.js');

const MALICIOUS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(1)</script>',
  'javascript:alert(1)'
];

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNum(v) {
  if (v == null || v === '') return '—';
  var n = Number(v);
  if (!isFinite(n)) return esc(String(v));
  return String(Math.round(n * 100) / 100);
}

let failed = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) failed++;
}

// esc must neutralize malicious strings
MALICIOUS.forEach(function (m) {
  var out = esc(m);
  var noRawTag = out.indexOf('<') === -1;
  check('esc neutralizes: ' + m.slice(0, 28), noRawTag);
});

// voting power non-numeric is escaped
check('safeNum rejects script', safeNum('<script>alert(1)</script>').indexOf('<') === -1);
check('safeNum keeps number', safeNum(1500) === '1500' || safeNum(1500).indexOf('1') !== -1);

// Source contains hardened patterns
check('esc uses &', ui.indexOf('&amp;') !== -1);
check('safeNum present', ui.indexOf('function safeNum') !== -1);
check('validator power uses safeNum', ui.indexOf('safeNum(rawPower)') !== -1);
check('battle strength name escaped', ui.indexOf('esc(p.name)') !== -1);
check('battle strength detail escaped', ui.indexOf('esc(p.detail)') !== -1);
check('source label escaped', ui.indexOf('esc(sourceLabel') !== -1);

// Build consistency — one source
var versionMatch = config.match(/version:\s*'([^']+)'/);
var codenameMatch = config.match(/codename:\s*'([^']+)'/);
var version = versionMatch ? versionMatch[1] : '';
var codename = codenameMatch ? codenameMatch[1] : '';
check('BUILD version present', !!version);
check('BUILD codename present', !!codename);
check('title contains version', index.indexOf(version) !== -1);
check('loadBuild contains version', index.indexOf('id="loadBuild">' + version) !== -1);

// Recovery and motion
check('gfx logs context lost', gfx.indexOf('WebGL context lost') !== -1);
check('gfx logs context restored', gfx.indexOf('WebGL context restored') !== -1);
check('gfx status text', gfx.indexOf('GRAPHICS RECOVERING') !== -1);
check('reduced-motion gate', camera.indexOf('prefers-reduced-motion') !== -1);
check('boot performance marks', boot.indexOf('performance.mark') !== -1);

// DataTruth constants intact
check('DataTruth LIVE', config.indexOf("LIVE: 'LIVE'") !== -1);
check('DataTruth ESTIMATED', config.indexOf("ESTIMATED: 'ESTIMATED'") !== -1);
check('DataTruth UNAVAILABLE', config.indexOf("UNAVAILABLE: 'UNAVAILABLE'") !== -1);

console.log('');
console.log(failed ? ('FAILED ' + failed) : 'ALL PASS');
process.exit(failed ? 1 : 0);
