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
  ['wx-combat wired', index.includes('theaters/wx-combat.js') && engine.includes('LUNCBattle.wxCombat.update()') && read('js/theaters/theaters.js').includes('function WXM(') && read('js/theaters/base-invasion.js').includes('function wxM(')],
  ['fires wired', index.includes('fx/fires.js') && index.indexOf('fx/fires.js') > index.indexOf('fx/craters.js') && engine.includes('LUNCBattle.fires.update()') && read('js/fx/craters.js').includes('new THREE.InstancedBufferAttribute(new Float32Array(CAPS.decals * 3)')],
  ['asw wired', index.includes('theaters/asw.js') && index.indexOf('theaters/asw.js') > index.indexOf('theaters/extras.js') && read('js/theaters/extras.js').includes('_subList') && read('js/theaters/extras.js').includes('!subs[s].ctl') && engine.includes('LUNCBattle.asw.update()') && read('js/sfx.js').includes('sonar: sonar')],
  ['ridge wired', index.includes('theaters/ridge.js') && index.indexOf('theaters/ridge.js') > index.indexOf('theaters/asw.js') && engine.includes('LUNCBattle.ridge.update()') && read('js/theaters/economy.js').includes('grant: function') && read('js/theaters/fow.js').includes('LB.ridge.visionFor') && read('js/theaters/theaters.js').includes("ridge: { label: 'Ridge'") && read('js/theaters/tacmap.js').includes('LB.ridge.crest()')],
  ['tacmap orders wired', read('js/theaters/tacmap.js').includes('function orderTap(') && read('js/theaters/tacmap.js').includes('LB.squads.routes()') && read('js/theaters/squads.js').includes('routes: function') && read('js/theaters/squads.js').includes('function routeLine(') && read('css/hud-dock.css').includes('.tac-orders')],
  ['los + casualties wired', read('js/theaters/los.js').includes('function trace(') && index.includes('js/theaters/los.js') && read('js/theaters/squads.js').includes('function hitChance(') && read('js/theaters/squads.js').includes('function wound(')],
  ['achievements wired', read('js/ui/achievements.js').includes('function unlock(') && index.includes('js/ui/achievements.js') && read('css/hud-dock.css').includes('.ach-toast')],
  ['forts + ridge LOS wired', read('js/theaters/forts.js').includes('LB.squads.woundAt(') && read('js/theaters/squads.js').includes('targetsFor: function') && read('js/theaters/ridge.js').includes('line of sight over the crest')],
  ['fort realism wired', read('js/theaters/forts.js').includes('function meshReal(') && read('js/theaters/forts.js').includes("qs.get('fortfx') !== '0'") && read('js/theaters/forts.js').includes('function onTarget(')],
  ['fort damage wired', read('js/theaters/forts.js').includes('function damageAt(') && read('js/theaters/forts.js').includes("qs.get('fortdmg') !== '0'") && read('js/theaters/squads.js').includes('LB.forts.suppress(')],
  ['rank unlocks wired', read('js/ui/achievements.js').includes('function setCamo(') && read('js/ui/achievements.js').includes("qs.get('cosmetics') !== '0'") && read('js/theaters/forts.js').includes('function applyCamo(') && read('css/hud-dock.css').includes('.ach-camo')],
  ['loadBuild aligned', index.includes('id="loadBuild">v12.0.28')]
];

let failed = 0;
checks.forEach(function (c) {
  const ok = !!c[1];
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + c[0]);
  if (!ok) failed++;
});
process.exit(failed ? 1 : 0);
