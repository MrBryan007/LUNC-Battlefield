/**
 * LUNC Battlefield v7.1 — Terra Intelligence Backend
 * Cloudflare Worker (ES module). Dual-mount: /api/* AND bare legacy paths
 * so Pages ?api=https://worker.example and ?api=https://worker.example/api both work.
 */
import { corsHeaders, jsonResponse } from './lib/http.js';
import { unavailable } from './lib/envelope.js';
import { handleHealth } from './routes/health.js';
import { handleSnapshot } from './routes/snapshot.js';
import { handleMarket } from './routes/market.js';
import { handleOrderbook } from './routes/orderbook.js';
import { handleLiquidations } from './routes/liquidations.js';
import { handleBurns, handleBurnsStats } from './routes/burns.js';
import { handleWhales } from './routes/whales.js';
import { handleGovernanceList, handleGovernanceOne } from './routes/governance.js';
import { handleValidators } from './routes/validators.js';
import { handleSupply } from './routes/supply.js';
import { handleNetwork } from './routes/network.js';

/** Strip trailing slash and optional /api prefix. */
function normalizePath(pathname) {
  let p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/api') return '/';
  if (p.startsWith('/api/')) p = p.slice(4) || '/';
  return p;
}

async function route(path, url, env) {
  if (path === '/' || path === '/health') return handleHealth(env);
  if (path === '/snapshot') return handleSnapshot(env);

  {
    const m = path.match(/^\/market\/(LUNC|USTC|lunc|ustc)$/);
    if (m) return handleMarket(env, m[1]);
  }
  {
    const m = path.match(/^\/orderbook\/(LUNC|USTC|lunc|ustc)$/);
    if (m) return handleOrderbook(env, m[1], url.searchParams.get('limit') || 100);
  }

  if (path === '/liquidations') return handleLiquidations(env);

  if (path === '/burns' || path === '/burns/recent') return handleBurns(env, url);
  if (path === '/burns/stats') return handleBurnsStats(env);

  if (path === '/whales' || path === '/whales/recent') return handleWhales(env, url);

  if (path === '/governance' || path === '/governance/proposals') {
    return handleGovernanceList(env, url);
  }
  {
    const m = path.match(/^\/governance\/(?:proposals\/)?(\d+)$/);
    if (m) return handleGovernanceOne(env, m[1]);
  }

  if (path === '/validators' || path === '/governance/validators') {
    return handleValidators(env);
  }

  if (path === '/supply') return handleSupply(env);
  if (path === '/network') return handleNetwork(env);

  return unavailable(`No route for ${url.pathname}`, 'router', {
    data: {
      routes: [
        '/api/health', '/health',
        '/api/snapshot', '/snapshot',
        '/api/market/LUNC|USTC',
        '/api/orderbook/LUNC|USTC',
        '/api/liquidations',
        '/api/burns', '/burns',
        '/api/whales', '/whales',
        '/api/governance', '/governance/proposals',
        '/api/validators', '/governance/validators',
        '/api/supply', '/api/network'
      ]
    }
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'GET') {
      return jsonResponse(unavailable('Only GET and OPTIONS are supported', 'router'), 405, cors);
    }

    try {
      const url = new URL(request.url);
      const path = normalizePath(url.pathname);
      const body = await route(path, url, env || {});
      const httpStatus = body?.source === 'router' && body?.truth === 'UNAVAILABLE' ? 404 : 200;
      return jsonResponse(body, httpStatus, cors);
    } catch (e) {
      return jsonResponse(unavailable(`Internal error: ${e.message || e}`, 'worker'), 500, cors);
    }
  }
};
