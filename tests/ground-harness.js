// ground-truth probe (v12.0.62): objects placed in the wide world sit on the surface you can see (raycast), not in the air
const { chromium } = require('/usr/local/lib/pnpm/5/.pnpm/playwright-core@1.59.1/node_modules/playwright-core');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const OUT = process.env.OUT || 'docs/v12062-shots';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const mk = async (q, mob, qs) => {
    const ctx = await b.newContext({ viewport: mob ? { width: 390, height: 844 } : { width: 1280, height: 800 }, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    await ctx.addInitScript(qq => { try { localStorage.setItem('luncBattle.graphicsQuality', qq); } catch (_) {} }, q);
    const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(String(e).slice(0, 300)));
    p.on('console', m => { const t = m.text(); if (/Shader Error|VALIDATE_STATUS|Program Info Log|\[revetments|\[roads|\[skylight|\[ground/i.test(t)) p.errs.push('console: ' + t.slice(0, 300)); });
    await p.goto(BASE + (qs || ''), { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(14000);
    await p.evaluate(() => { const w = document.getElementById('cmdWatch'); if (w) w.click(); });
    return p;
  };
  const measure = (p) => p.evaluate(() => {
    const L = LUNCBattle, e = L.engine, T = e.THREE, rc = new T.Raycaster(); rc.camera = e.camera;
    const skipNames = /^(v12-fow|skylight|sky|stars|v12-revetments|rain|v12-rain|cloud|smoke)/i;
    function skip(o) { for (let q = o; q; q = q.parent) { if (q.name && skipNames.test(q.name)) return true; if (q.userData && q.userData._probeSkip) return true; } return false; }
    function surf(x, z, from, own) {
      rc.set(new T.Vector3(x, from, z), new T.Vector3(0, -1, 0)); rc.far = 200;
      const hs = rc.intersectObjects(e.scene.children, true);
      for (const h of hs) { const o = h.object; if (!o.isMesh || o.isInstancedMesh || skip(o) || (own && own(o))) continue; if (surf.ref != null && h.point.y > surf.ref + 1.0) continue;   // props / roofs above the sample are not ground
        if (h.face && h.face.normal) { const nn = h.face.normal.clone().transformDirection(o.matrixWorld); if (nn.y < 0.8) continue; } const m = Array.isArray(o.material) ? o.material[0] : o.material; if (m && (m.transparent || m.visible === false) || !o.visible) continue; return { y: h.point.y, n: o.name || (o.parent && o.parent.name) || o.geometry.type }; }
      return null;
    }
    const res = {};
    // 1) road surface: every 6th asphalt vertex vs what is under the road (roads themselves excluded)
    const roadRoot = e.scene.getObjectByName('v12-roads'), inRoads = o => { for (let q = o; q; q = q.parent) if (q === roadRoot) return true; return false; };
    let worst = 0, n = 0, where = null; const asph = []; roadRoot && roadRoot.traverse(o => { if (o.name === 'road-asphalt') asph.push(o); });
    asph.forEach(o => { const P = o.geometry.attributes.position, v = new T.Vector3(); for (let i = 0; i < P.count; i += 6) { v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); surf.ref = v.y; const s = surf(v.x, v.z, v.y + 3, inRoads); surf.ref = null; if (!s) continue; const g = v.y - s.y; n++; if (Math.abs(g) > Math.abs(worst)) { worst = g; where = [+v.x.toFixed(1), +v.z.toFixed(1), s.n]; } } });
    res.road = { samples: n, worstGap: +worst.toFixed(2), where };
    // 2) boat ramps vs the beach
    res.ramps = []; roadRoot && roadRoot.traverse(o => { if (o.name === 'boat-ramp') { const s = surf(o.position.x, o.position.z - 3, 20, inRoads); res.ramps.push({ y: +o.position.y.toFixed(2), under: s && +s.y.toFixed(2), on: s && s.n }); } });
    // 3) checkpoints: lowest block base vs the ground beside it
    const R = L.revetments; res.checkpoints = R ? R._cps().map(c => { const s = surf(c.x + c.dz * 6, c.z - c.dx * 6, 40, null); return { id: c.side + c.id, gy: +c.g.position.y.toFixed(2), ground: s && +s.y.toFixed(2), on: s && s.n }; }) : [];
    // 4) apron / HQ flood-light pools
    const pools = []; e.scene.traverse(o => { if (o.name === 'skylight-pool') pools.push(o); });
    res.pools = pools.map(o => { const P = o.geometry.attributes.position, v = new T.Vector3().fromBufferAttribute(P, (P.count - 1) / 2).applyMatrix4(o.matrixWorld); surf.ref = v.y; const s = surf(v.x, v.z, v.y + 30, null); surf.ref = null; return +(v.y - 0.18 - (s ? s.y : 0)).toFixed(2); });
    // 5) SAM sites
    res.sam = []; e.scene.traverse(o => { if (/^sam-/.test(o.name) && o.parent && !/^sam-/.test(o.parent.name)) { const v = new T.Vector3(); o.getWorldPosition(v); const mine = x => { for (let q = x; q; q = q.parent) if (q === o) return true; return false; }; const s = surf(v.x + 9, v.z + 9, v.y + 30, mine); res.sam.push({ n: o.name, y: +v.y.toFixed(2), ground: s && +s.y.toFixed(2), on: s && s.n }); } });
    res.ground = L.ground && L.ground.getState();
    return res;
  });
  const A = await mk('MEDIUM', false, '');
  out = { medium: await measure(A) };
  const cam = (p, x, y, z, tx, ty, tz) => p.evaluate(a => { const e = LUNCBattle.engine; e.controls.minDistance = 3; e.controls.maxDistance = 500; e.controls.maxPolarAngle = Math.PI / 2; e.controls.target.set(a[3], a[4], a[5]); e.camera.position.set(a[0], a[1], a[2]); e.controls.update(); }, [x, y, z, tx, ty, tz]);
  await cam(A, 128, 7, -40, 150, 0, -70); await A.waitForTimeout(2500); await A.screenshot({ path: OUT + '/silo-spur.png', timeout: 120000 });
  await cam(A, 70, 6, 40, 85, -0.3, 58); await A.waitForTimeout(2000); await A.screenshot({ path: OUT + '/boat-ramp.png', timeout: 120000 });
  await cam(A, 175, 9, -40, 200, 0, -48); await A.waitForTimeout(2000); await A.screenshot({ path: OUT + '/airbase-gate.png', timeout: 120000 });
  out.mediumErrs = A.errs; await A.context().close();
  const K = await mk('MEDIUM', false, '?ground=0');
  out.off = await K.evaluate(() => ({ on: LUNCBattle.ground.isEnabled(), y: +LUNCBattle.groundY(150, -88).toFixed(2), th: +LUNCBattle.engine.terrainHeight(150, -88).toFixed(2) }));
  out.offErrs = K.errs; await K.context().close();
  const P = await mk('LOW', true, '');
  out.iphone = await measure(P); out.iphoneErrs = P.errs; await P.context().close();
  console.log(JSON.stringify(out, null, 1));
  const m = out.medium, okSet = r => Math.abs(r.road.worstGap) < 0.25 && r.ramps.every(q => q.under != null && Math.abs(q.y - q.under) < 0.4) && r.checkpoints.length === 6 && r.checkpoints.every(c => c.ground != null && Math.abs(c.gy - c.ground) < 0.35) && r.sam.every(s => s.ground == null || Math.abs(s.y - s.ground) < 0.35);
  const ok = okSet(m) && m.pools.length > 0 && m.pools.every(g => Math.abs(g) < 0.6) && okSet(out.iphone) && !out.off.on && Math.abs(out.off.y - out.off.th) < 0.01 && !out.mediumErrs.length && !out.offErrs.length && !out.iphoneErrs.length;
  console.log(ok ? 'GROUND PROBE PASS' : 'GROUND PROBE FAIL'); await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
var out;
