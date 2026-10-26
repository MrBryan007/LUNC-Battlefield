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
  ['fort crews + engineers wired', read('js/theaters/forts.js').includes('function soldier(') && read('js/theaters/forts.js').includes("qs.get('fortcrew') !== '0'") && read('js/theaters/forts.js').includes('function tickEng(') && read('js/theaters/forts.js').includes('engHit(x, z,')],
  ['navy detail wired', index.includes('js/fx/naval-detail.js') && index.indexOf('fx/naval-detail.js') > index.indexOf('theaters/theaters.js') && engine.includes('LUNCBattle.navalDetail.update()') && read('js/fx/naval-detail.js').includes("qs.get('navdetail') !== '0'")],
  ['hot-seat wired', index.includes('js/ui/hotseat.js') && read('js/ui/hotseat.js').includes("qs.get('hotseat') !== '0'") && read('js/commander.js').includes('useSession: function') && read('js/commander.js').includes('setSide: function') && read('css/hud-dock.css').includes('.hs-cover')],
  ['hq banners wired', index.includes('js/fx/hq-banners.js') && engine.includes('LUNCBattle.hqBanners.update()') && read('js/fx/hq-banners.js').includes("qs.get('banners') !== '0'") && read('js/ui/achievements.js').includes('function setBanner(') && read('js/ui/achievements.js').includes('id="achBanner"')],
  ['air ops wired', index.includes('js/fx/air-ops.js') && read('js/fx/air-ops.js').includes("qs.get('airops') !== '0'") && read('js/theaters/theaters.js').includes('AO.tick(J, dt, homeCtx(J))') && read('js/theaters/theaters.js').includes('LB.airOps.catapult(J, s)') && read('js/theaters/theaters.js').includes('AO.pose(J, dt)')],
  ['tracks wired', index.includes('js/fx/tracks.js') && read('js/fx/tracks.js').includes("qs.get('tracks') !== '0'") && engine.includes('LUNCBattle.tracks.update()')],
  ['flak wired', index.includes('js/fx/flak.js') && read('js/fx/flak.js').includes("qs.get('flak') !== '0'") && read('js/theaters/theaters.js').includes('LB.flak.update(wdt)') && read('js/theaters/theaters.js').includes('FL.fire(a.wx, 1.9, a.wz, o, a.side)') && read('js/theaters/base-invasion.js').includes('LB.flak.fire(from.x, from.y, from.z, jet, d.userData.side)')],
  ['sam wired', index.includes('js/fx/sam.js') && read('js/fx/sam.js').includes("qs.get('sam') !== '0'") && read('js/theaters/theaters.js').includes('LB.sam.update(wdt)')],
  ['shoreline wired', index.includes('js/fx/shoreline.js') && read('js/fx/shoreline.js').includes("qs.get('shore') !== '0'") && read('js/theaters/theaters.js').includes('LB.shoreline.patch(') && read('js/theaters/theaters.js').includes('LB.shoreline.update(')],
  ['loadBuild aligned', index.includes('id="loadBuild">v12.0.38')]
];

let failed = 0;
checks.forEach(function (c) {
  const ok = !!c[1];
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + c[0]);
  if (!ok) failed++;
});
process.exit(failed ? 1 : 0);
