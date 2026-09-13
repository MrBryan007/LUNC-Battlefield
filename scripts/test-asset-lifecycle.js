#!/usr/bin/env node
/**
 * v9.4.3 — node harness for async asset generation / dispose races.
 * Simulates load start → dispose → (reload) → late callbacks without THREE/DOM.
 */
'use strict';

var passed = 0;
var failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  PASS:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

/** Minimal mirror of asset-loader generation + cache contract */
function makeLoader() {
  var cache = Object.create(null);
  var pending = Object.create(null);
  var generation = Object.create(null);
  var staleIgnored = 0;
  var disposedRoots = [];

  function cacheKey(id, band) {
    band = band == null ? 0 : (band | 0);
    return band <= 0 ? id : id + '::lod' + band;
  }

  function getGeneration(id) {
    return generation[id] || 0;
  }

  function bumpGeneration(id) {
    generation[id] = (generation[id] || 0) + 1;
    return generation[id];
  }

  function disposeObject3DResources(root) {
    disposedRoots.push(root);
  }

  function dispose(id) {
    if (id) {
      bumpGeneration(id);
      var prefix = id + '::';
      Object.keys(cache).forEach(function (k) {
        if (k === id || k.indexOf(prefix) === 0) {
          if (cache[k] && cache[k].scene) disposeObject3DResources(cache[k].scene);
          delete cache[k];
        }
      });
      Object.keys(pending).forEach(function (k) {
        if (k === id || k.indexOf(prefix) === 0) delete pending[k];
      });
      return true;
    }
    Object.keys(generation).forEach(function (gid) { bumpGeneration(gid); });
    Object.keys(cache).forEach(function (k) {
      if (cache[k] && cache[k].scene) disposeObject3DResources(cache[k].scene);
    });
    cache = Object.create(null);
    pending = Object.create(null);
    return true;
  }

  /**
   * Start a fake async load. Returns { requestGen, key, finish(scene) }.
   */
  function startLoad(id, lodBand) {
    var band = lodBand == null ? 0 : (lodBand | 0);
    var key = cacheKey(id, band);
    var requestGen = generation[id] || 0;
    cache[key] = { status: 'loading', scene: null, requestGen: requestGen, lodBand: band };
    pending[key] = true;

    function finish(scene) {
      delete pending[key];
      if (requestGen !== (generation[id] || 0)) {
        staleIgnored++;
        if (scene) disposeObject3DResources(scene);
        return { ok: false, stale: true, requestGen: requestGen, generation: generation[id] || 0 };
      }
      cache[key] = {
        status: 'ready',
        scene: scene,
        requestGen: requestGen,
        lodBand: band
      };
      if (band === 0) {
        cache[id] = cache[key];
      }
      return { ok: true, scene: scene, requestGen: requestGen };
    }

    return { requestGen: requestGen, key: key, finish: finish, id: id, band: band };
  }

  return {
    cache: function () { return cache; },
    pending: function () { return pending; },
    getGeneration: getGeneration,
    dispose: dispose,
    startLoad: startLoad,
    staleIgnored: function () { return staleIgnored; },
    disposedRoots: disposedRoots,
    cacheKey: cacheKey
  };
}

console.log('\n=== 1. Generation invalidate on dispose ===');
(function () {
  var L = makeLoader();
  assert(L.getGeneration('unit.bull.infantry') === 0, 'gen starts at 0');
  L.dispose('unit.bull.infantry');
  assert(L.getGeneration('unit.bull.infantry') === 1, 'dispose bumps gen to 1');
  L.dispose('unit.bull.infantry');
  assert(L.getGeneration('unit.bull.infantry') === 2, 'second dispose bumps to 2');
})();

console.log('\n=== 2. Dispose-during-load: late callback is stale ===');
(function () {
  var L = makeLoader();
  var req = L.startLoad('prop.crate', 0);
  assert(L.cache()['prop.crate'].status === 'loading', 'status loading');
  assert(req.requestGen === 0, 'requestGen captured as 0');
  L.dispose('prop.crate');
  assert(!L.pending()['prop.crate'], 'pending cleared');
  assert(!L.cache()['prop.crate'], 'cache cleared');
  var scene = { name: 'stale-gltf' };
  var r = req.finish(scene);
  assert(r.stale === true, 'callback reports stale');
  assert(!L.cache()['prop.crate'], 'stale callback did not re-cache');
  assert(L.staleIgnored() === 1, 'staleIgnored++');
  assert(L.disposedRoots.indexOf(scene) >= 0, 'stale root disposed');
})();

console.log('\n=== 3. Dispose + reload race: old must not overwrite new ===');
(function () {
  var L = makeLoader();
  var first = L.startLoad('structure.bull.hq', 0);
  L.dispose('structure.bull.hq');
  var second = L.startLoad('structure.bull.hq', 0);
  assert(first.requestGen === 0, 'first gen 0');
  assert(second.requestGen === 1, 'second gen 1 after dispose');
  var oldScene = { name: 'old' };
  var newScene = { name: 'new' };
  var r1 = first.finish(oldScene);
  assert(r1.stale === true, 'first finish ignored as stale');
  assert(!L.cache()['structure.bull.hq'] || L.cache()['structure.bull.hq'].status === 'loading',
    'cache not ready from stale first');
  var r2 = second.finish(newScene);
  assert(r2.ok === true, 'second finish owns cache');
  assert(L.cache()['structure.bull.hq'].scene === newScene, 'cache scene is new');
  assert(L.cache()['structure.bull.hq'].requestGen === 1, 'cache stores gen 1');
  assert(L.disposedRoots.indexOf(oldScene) >= 0, 'old scene disposed');
})();

console.log('\n=== 4. Multi-LOD pending dispose ===');
(function () {
  var L = makeLoader();
  var a0 = L.startLoad('unit.bear.tank', 0);
  var a1 = L.startLoad('unit.bear.tank', 1);
  var a2 = L.startLoad('unit.bear.tank', 2);
  var a3 = L.startLoad('unit.bear.tank', 3);
  assert(!!L.pending()[L.cacheKey('unit.bear.tank', 0)], 'lod0 pending');
  assert(!!L.pending()[L.cacheKey('unit.bear.tank', 1)], 'lod1 pending');
  assert(!!L.pending()[L.cacheKey('unit.bear.tank', 2)], 'lod2 pending');
  assert(!!L.pending()[L.cacheKey('unit.bear.tank', 3)], 'lod3 pending');
  L.dispose('unit.bear.tank');
  assert(Object.keys(L.pending()).length === 0, 'all pending cleared for id');
  assert(Object.keys(L.cache()).length === 0, 'all cache variants cleared');
  var s0 = { n: 0 }, s1 = { n: 1 }, s2 = { n: 2 }, s3 = { n: 3 };
  assert(a0.finish(s0).stale && a1.finish(s1).stale && a2.finish(s2).stale && a3.finish(s3).stale,
    'all four LOD callbacks stale');
  assert(Object.keys(L.cache()).length === 0, 'no cache after stale LOD finishes');
  assert(L.staleIgnored() === 4, 'four stale ignores');
})();

console.log('\n=== 5. Effective keys + quality switch style dispose ===');
(function () {
  var L = makeLoader();
  // Simulate effective LOD1 stored under id::lod1 while raw request was 0
  var req = L.startLoad('unit.bull.infantry', 1);
  assert(req.key === 'unit.bull.infantry::lod1', 'effective key id::lod1');
  L.dispose('unit.bull.infantry');
  var scene = { name: 'eff' };
  assert(req.finish(scene).stale === true, 'effective-key load also invalidated');
  // Reload at lod0 after dispose
  var again = L.startLoad('unit.bull.infantry', 0);
  assert(again.requestGen === 1, 'reload gen is 1');
  var live = { name: 'live' };
  assert(again.finish(live).ok === true, 'reload succeeds');
  assert(L.cache()['unit.bull.infantry'].scene === live, 'base key owns live scene');
})();

console.log('\n=== Summary ===');
console.log('passed=' + passed + ' failed=' + failed);
process.exit(failed ? 1 : 0);
