import { envelope, Truth } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import { handleMarket } from './market.js';
import { handleOrderbook } from './orderbook.js';
import { handleBurns } from './burns.js';
import { handleWhales } from './whales.js';
import { handleGovernanceList } from './governance.js';
import { handleValidators } from './validators.js';
import { handleSupply } from './supply.js';
import { handleNetwork } from './network.js';
import { handleLiquidations } from './liquidations.js';

function summarizeOrderbook(ob) {
  if (!ob || ob.truth === Truth.UNAVAILABLE) return ob;
  const d = ob.data || {};
  return {
    ...ob,
    data: {
      asset: d.asset,
      symbol: d.symbol,
      mid: d.mid,
      bestBid: d.bestBid,
      bestAsk: d.bestAsk,
      bidLevels: (d.bids || []).length,
      askLevels: (d.asks || []).length,
      liquidityZones: d.liquidityZones || null,
      limit: d.limit
    }
  };
}

export async function handleSnapshot(env) {
  return cached('snapshot', TTL.snapshot, async () => {
    const blank = new URL('https://worker.local/');
    const results = await Promise.allSettled([
      handleMarket(env, 'LUNC'),
      handleMarket(env, 'USTC'),
      handleOrderbook(env, 'LUNC', 100),
      handleOrderbook(env, 'USTC', 100),
      handleBurns(env, new URL('https://x/burns?limit=10')),
      handleWhales(env, new URL('https://x/whales?limit=10')),
      handleGovernanceList(env, blank),
      handleValidators(env),
      handleSupply(env),
      handleNetwork(env),
      handleLiquidations(env)
    ]);

    const val = (i) =>
      results[i].status === 'fulfilled'
        ? results[i].value
        : {
            status: 'unavailable',
            truth: Truth.UNAVAILABLE,
            source: 'snapshot',
            sourceLabel: 'snapshot',
            timestamp: new Date().toISOString(),
            stale: false,
            confidence: 0,
            data: null,
            error: String(results[i].reason?.message || results[i].reason)
          };

    const marketLunc = val(0);
    const marketUstc = val(1);
    const obLunc = summarizeOrderbook(val(2));
    const obUstc = summarizeOrderbook(val(3));
    const burns = val(4);
    const whales = val(5);
    const gov = val(6);
    const validators = val(7);
    const supply = val(8);
    const network = val(9);
    const liquidations = val(10);

    const nested = {
      market: { LUNC: marketLunc, USTC: marketUstc },
      orderbook: { LUNC: obLunc, USTC: obUstc },
      burns: {
        ...burns,
        data: {
          recentCount: burns.data?.events?.length || 0,
          events: burns.data?.events || [],
          visualScale: burns.data?.visualScale
        }
      },
      whales: {
        ...whales,
        data: {
          recentCount: whales.data?.events?.length || 0,
          events: whales.data?.events || []
        }
      },
      governance: {
        ...gov,
        data: {
          activeCount: gov.data?.activeCount || 0,
          count: gov.data?.count || 0,
          proposals: (gov.data?.proposals || []).slice(0, 10)
        }
      },
      validators: {
        ...validators,
        data: {
          count: validators.data?.count || 0,
          validators: (validators.data?.validators || []).slice(0, 15)
        }
      },
      supply,
      network,
      liquidations
    };

    const truths = Object.values(nested).flatMap(v => {
      if (v && v.truth) return [v.truth];
      if (v && typeof v === 'object') {
        return Object.values(v).map(x => x?.truth).filter(Boolean);
      }
      return [];
    });
    const anyLive = truths.some(t => t === Truth.LIVE || t === Truth.CALCULATED || t === Truth.PARTIAL);
    const allUnavailable = truths.every(t => t === Truth.UNAVAILABLE);

    return envelope({
      status: allUnavailable ? 'unavailable' : 'ok',
      truth: allUnavailable ? Truth.UNAVAILABLE : anyLive ? Truth.PARTIAL : Truth.PARTIAL,
      source: 'aggregate',
      sourceLabel: 'Snapshot aggregate',
      confidence: null,
      data: nested
    });
  });
}
