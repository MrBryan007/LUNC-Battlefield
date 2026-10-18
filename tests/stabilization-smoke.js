// Lightweight checks for the stabilization slice. Run with: node tests/stabilization-smoke.js
const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const config = read('js/config.js');
const ui = read('js/ui.js');
const engine = read('js/battle-engine.js');
const camera = read('js/camera.js');
const index = read('index.html');

const checks = [
  ['BUILD_META present', config.includes('BUILD_META')],
  ['API allowlist present', config.includes('ALLOWED_API_ORIGINS')],
  ['esc() present', ui.includes('function esc(')],
  ['burn source escaped', ui.includes('esc(top.source)')],
  ['estimated walls not random', !engine.includes('buyWall=base*(.92+Math.random()')],
  ['reduced-motion gate', camera.includes('prefers-reduced-motion')],
  ['gfx-recover wired', index.includes('gfx-recover.js')],
  ['base-invasion wired', index.includes('base-invasion.js')],
  ['realism-pass wired', index.includes('realism-pass.js')],
  ['realism-armies wired', index.includes('realism-armies.js')],
  ['tacmap wired', index.includes('theaters/tacmap.js') && read('js/theaters/extras.js').includes('LB.tacmap.drawInset')],
  ['realism-seaair wired', index.includes('realism-seaair.js') && index.indexOf('realism-seaair.js') < index.indexOf('theaters/theaters.js')],
  ['uav wired', index.includes('theaters/uav.js') && index.indexOf('theaters/uav.js') > index.indexOf('theaters/extras.js') && read('js/theaters/extras.js').includes('_droneList') && engine.includes('LUNCBattle.uav.update()')],
  ['loadBuild aligned', index.includes('id="loadBuild">v12.0.17')]
];

let failed = 0;
checks.forEach(function (c) {
  const ok = !!c[1];
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + c[0]);
  if (!ok) failed++;
});
process.exit(failed ? 1 : 0);
