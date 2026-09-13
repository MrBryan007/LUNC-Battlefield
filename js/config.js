/* LUNC Battlefield v9.4.10 — shared config (GitHub Pages safe) */
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

  function resolveApiBase() {
    const q = new URLSearchParams(location.search).get('api');
    if (q) return httpsOnly(q);
    if (typeof global.LUNC_API_BASE === 'string' && global.LUNC_API_BASE) {
      return httpsOnly(global.LUNC_API_BASE);
    }
    const bridge = new URLSearchParams(location.search).get('bridge');
    if (bridge && /^https:\/\//i.test(bridge)) {
      try {
        const u = new URL(bridge);
        if (u.pathname.endsWith('/snapshot')) {
          u.pathname = u.pathname.replace(/\/snapshot\/?$/, '');
          return httpsOnly(u.toString());
        }
        return httpsOnly(bridge.replace(/\/$/, ''));
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

  const config = {
    BUILD: 'v9.4.10',
    TITLE: 'LUNC Ecosystem Battlefield v9.4.10 — AUTO quality caps at HIGH for Mac/Retina interactive headroom (WebGL r128)',
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
  global.LUNCBattle.config = config;
  global.LUNCBattle.DataTruth = DataTruth;
})(window);
