/* LUNC Battlefield shared config (GitHub Pages safe) — current build from BUILD_META */
(function (global) {
  'use strict';
  const DataTruth = Object.freeze({
    LIVE: 'LIVE',
    CALCULATED: 'CALCULATED',
    ESTIMATED: 'ESTIMATED',
    SIMULATED: 'SIMULATED',
    UNAVAILABLE: 'UNAVAILABLE',
    PARTIAL: 'PARTIAL'
  });

  function httpsOnly(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol === 'https:' ? u.toString().replace(/\/$/, '') : null;
    } catch (_) { return null; }
  }

  // Approved production API origins. Empty until an official gateway is owned.
  // Arbitrary HTTPS origins are rejected unless developer mode is active.
  const ALLOWED_API_ORIGINS = Object.freeze([
    // 'https://api.luncbattlefield.com'  // future official gateway — do not invent
  ]);

  function isDeveloperMode() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('debug') === '1' || params.get('dev') === '1') return true;
      const host = location.hostname || '';
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch (_) { return false; }
  }

  function isAllowedApiOrigin(url) {
    if (!url) return false;
    try {
      const u = new URL(url, location.href);
      if (u.protocol !== 'https:') return false;
      if (isDeveloperMode()) return true;
      return ALLOWED_API_ORIGINS.indexOf(u.origin) !== -1;
    } catch (_) { return false; }
  }

  function resolveApiBase() {
    const params = new URLSearchParams(location.search);
    const q = params.get('api');
    if (q) {
      const candidate = httpsOnly(q);
      return isAllowedApiOrigin(candidate) ? candidate : null;
    }
    if (typeof global.LUNC_API_BASE === 'string' && global.LUNC_API_BASE) {
      const candidate = httpsOnly(global.LUNC_API_BASE);
      return isAllowedApiOrigin(candidate) ? candidate : null;
    }
    const bridge = params.get('bridge');
    if (bridge && /^https:\/\//i.test(bridge)) {
      try {
        const u = new URL(bridge);
        if (u.pathname.endsWith('/snapshot')) {
          u.pathname = u.pathname.replace(/\/snapshot\/?$/, '');
        }
        const candidate = httpsOnly(u.toString());
        return isAllowedApiOrigin(candidate) ? candidate : null;
      } catch (_) {}
    }
    return null;
  }

  const tokens = {
    LUNC: {
      name: 'LUNC/USDT', base: 0.00005122, color: 0x49d39a, hasBurns: true, decimals: 8,
      symbol: 'luncusdt', futures: '1000luncusdt', gecko: 'terra-luna',
      battlefield: 'war'
    },
    USTC: {
      name: 'USTC/USDT', base: 0.00514, color: 0x56b9d1, hasBurns: false, decimals: 5,
      symbol: 'ustcusdt', futures: 'ustcusdt', gecko: 'terrausd',
      battlefield: 'repeg', objective: 1.0
    },
    JURIS: {
      name: 'JURIS', base: 0.00000245, color: 0xa791dc, hasBurns: false, decimals: 8,
      symbol: null, futures: null, gecko: 'juris-protocol',
      battlefield: 'protocol'
    }
  };

  // Single source of truth for current release metadata.
  // Historical comments and changelog entries are left untouched.
  const BUILD = Object.freeze({
    version: 'v12.0.39',
    codename: 'Positional Battle Audio',
    date: '2026-10-29'
  });

  const config = {
    BUILD: BUILD.version,
    BUILD_META: BUILD,
    TITLE: 'LUNC Ecosystem Battlefield ' + BUILD.version + ' — ' + BUILD.codename,
    DataTruth,
    tokens,
    apiBase: resolveApiBase(),
    liquidityBands: [
      { id: 'immediate', label: 'Immediate defense', minPct: 0, maxPct: 0.5 },
      { id: 'near', label: 'Near wall', minPct: 0.5, maxPct: 1 },
      { id: 'major', label: 'Major wall', minPct: 1, maxPct: 3 },
      { id: 'deep', label: 'Deep liquidity', minPct: 3, maxPct: 5 }
    ],
    burnVisualScale: [
      { min: 1e5, label: 'small strike' },
      { min: 1e6, label: 'artillery strike' },
      { min: 1e7, label: 'bombardment' },
      { min: 1e8, label: 'major burn event' },
      { min: 1e9, label: 'massive battlefield event' }
    ],
    // Prefer deeper REST snapshot; WS only refreshes near market
    binanceRestDepthLimit: 1000,
    // api.binance.com often 451 in restricted regions; vision mirrors public market data
    binanceRestBase: 'https://data-api.binance.vision'
  };

  global.LUNCBattle = global.LUNCBattle || {};
  // v12.0.11 wide front: HQs farther apart (visual layout only; price->X mapping untouched)
  try {
    var wq = new URLSearchParams(global.location ? global.location.search : '').get('wide');
    config.layout = wq === '0' ? { wide: false, hqX: 48, spread: 1 } : { wide: true, hqX: 96, spread: 2 };
  } catch (e) { config.layout = { wide: true, hqX: 96, spread: 2 }; }
  global.LUNCBattle.config = config;
  global.LUNCBattle.DataTruth = DataTruth;
})(window);
