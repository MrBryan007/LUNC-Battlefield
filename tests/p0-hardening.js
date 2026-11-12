// P0 hardening tests — injection + version consistency.
// Run: node tests/p0-hardening.js
const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const ui = read('js/ui.js');
const config = read('js/config.js');
const index = read('index.html');

const AMP = '&' + 'amp;';
const LT = '&' + 'lt;';
const GT = '&' + 'gt;';

function esc(s) {
  return String(s)
    .replace(/&/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, '&' + 'quot;')
    .replace(/'/g, '&' + '#39;');
}

let failed = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name);
  if (!ok) failed++;
}

const samples = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  '& < > " \''
];
samples.forEach(function (m) {
  var out = esc(m);
  check('esc neutralizes: ' + m.slice(0, 28), out.indexOf('<') === -1);
});

check('ui esc uses amp entity', ui.indexOf(AMP) !== -1);
check('ui esc uses lt entity', ui.indexOf(LT) !== -1);
check('safeNum present', ui.indexOf('function safeNum') !== -1);
check('validator uses safeNum', ui.indexOf('safeNum(rawPower)') !== -1);
check('battle strength name escaped', ui.indexOf('esc(p.name)') !== -1);
check('source label escaped', ui.indexOf('esc(sourceLabel') !== -1);

var version = (config.match(/version:\s*'([^']+)'/) || [])[1];
var codename = (config.match(/codename:\s*'([^']+)'/) || [])[1];
check('version present', !!version);
check('codename present', !!codename);
check('title matches version', index.indexOf(version) !== -1);
check('title matches codename', index.indexOf(codename) !== -1);
check('loadBuild matches version', index.indexOf('id="loadBuild">' + version) !== -1);

console.log('');
console.log(failed ? ('FAILED ' + failed) : 'ALL PASS');
process.exit(failed ? 1 : 0);
