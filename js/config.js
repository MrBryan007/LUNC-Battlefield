/* LUNC Battlefield v7 — shared config (GitHub Pages safe) */
(function (global) {
  'use strict';
  const DataTruth = Object.freeze({
    LIVE: 'LIVE',
    CALCULATED: 'CALCULATED',
    ESTIMATED: 'ESTIMATED',
    SIMULATED: 'SIMULATED',
    UNAVAILABLE: 'UNAVAILABLE'
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
    return null; // browser fallbacks only on Pages
  }

  function bridgeUrl() {
    const q = new URLSearchParams(location.search).get('bridge');
    if (q && /^https:\/\//i.test(q)) return q;
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8787/snapshot';
    }
    return null; // never poll localhost from github.io
  }

  const tokens = {
    LUNC: {
      name: 'LUNC/USDT', base: 0.00005346, color: 0x49d39a, hasBurns: true, decimals: 8,
      symbol: 'luncusdt', futures: '1000luncusdt', gecko: 'terra-luna',
      battlefield: 'war'
    },
    USTC: {
      name: 'USTC/USDT', base: 0.005579, color: 0x56b9d1, hasBurns: false, decimals: 5,
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
    BUILD: 'v7',
    TITLE: 'LUNC Ecosystem Battlefield v7',
    DataTruth,
    tokens,
    apiBase: resolveApiBase(),
    bridgeUrl: bridgeUrl(),
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
    ]
  };

  global.LUNCBattle = global.LUNCBattle || {};
  global.LUNCBattle.config = config;
  global.LUNCBattle.DataTruth = DataTruth;
})(window);
