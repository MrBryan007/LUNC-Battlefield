import { fetchJson, fetchJsonFailover } from '../lib/http.js';

const DEFAULT_BASES = [
  'https://data-api.binance.vision',
  'https://api.binance.com'
];

export function binanceBases(env = {}) {
  const raw = env.BINANCE_REST_BASES || '';
  if (raw.trim()) {
    return raw.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  }
  return DEFAULT_BASES;
}

const SYMBOLS = {
  LUNC: { spot: 'LUNCUSDT', futures: '1000LUNCUSDT', note: 'Futures use 1000LUNCUSDT (price ×1000 vs spot)' },
  USTC: { spot: 'USTCUSDT', futures: 'USTCUSDT', note: 'Futures USTCUSDT' }
};

export function symbolInfo(asset) {
  return SYMBOLS[String(asset).toUpperCase()] || null;
}

export async function bookTicker(env, symbol) {
  const bases = binanceBases(env);
  const urls = bases.map(b => `${b}/api/v3/ticker/bookTicker?symbol=${symbol}`);
  return fetchJsonFailover(urls, {}, 8_000);
}

export async function ticker24h(env, symbol) {
  const bases = binanceBases(env);
  const urls = bases.map(b => `${b}/api/v3/ticker/24hr?symbol=${symbol}`);
  return fetchJsonFailover(urls, {}, 8_000);
}

export async function depth(env, symbol, limit = 100) {
  const lim = Math.min(500, Math.max(5, Number(limit) || 100));
  const bases = binanceBases(env);
  const urls = bases.map(b => `${b}/api/v3/depth?symbol=${symbol}&limit=${lim}`);
  return fetchJsonFailover(urls, {}, 10_000);
}

/**
 * Force-order / liquidations: Binance exposes these primarily via WebSocket
 * (`!forceOrder@arr` / `<symbol>@forceOrder`). There is no reliable public REST
 * history endpoint for recent liquidations. Do not fabricate.
 */
export async function tryLiquidationsRest() {
  return {
    available: false,
    reason:
      'Binance forceOrder liquidations require WebSocket ingest (or a Durable Object buffer). No public REST history used; refusing to fabricate.'
  };
}

export { SYMBOLS, DEFAULT_BASES };
