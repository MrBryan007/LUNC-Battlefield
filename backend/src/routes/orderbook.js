import { live, unavailable, computeLiquidityZones } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import { depth, symbolInfo } from '../providers/binance.js';

export async function handleOrderbook(env, asset, limit = 100) {
  const a = String(asset || '').toUpperCase();
  if (a !== 'LUNC' && a !== 'USTC') {
    return unavailable('Asset must be LUNC or USTC', 'router');
  }
  const lim = Math.min(500, Math.max(5, Number(limit) || 100));
  return cached(`orderbook:${a}:${lim}`, TTL.orderbook, async () => {
    const info = symbolInfo(a);
    try {
      const { data, url } = await depth(env, info.spot, lim);
      const bids = (data.bids || []).map(([p, q]) => [String(p), String(q)]);
      const asks = (data.asks || []).map(([p, q]) => [String(p), String(q)]);
      const bestBid = bids[0] ? +bids[0][0] : null;
      const bestAsk = asks[0] ? +asks[0][0] : null;
      const mid =
        Number.isFinite(bestBid) && Number.isFinite(bestAsk) ? (bestBid + bestAsk) / 2 : null;
      const zones = computeLiquidityZones(bids, asks, mid);
      return live(
        {
          asset: a,
          symbol: info.spot,
          lastUpdateId: data.lastUpdateId ?? null,
          bids,
          asks,
          bestBid,
          bestAsk,
          mid,
          limit: lim,
          liquidityZones: zones
        },
        'binance',
        { sourceLabel: `Binance depth (${url.includes('vision') ? 'vision' : 'api'})` }
      );
    } catch (e) {
      return unavailable(`Orderbook unavailable: ${e.message || e}`, 'binance');
    }
  });
}
