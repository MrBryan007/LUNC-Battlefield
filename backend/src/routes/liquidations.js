import { unavailable } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import { tryLiquidationsRest } from '../providers/binance.js';

export async function handleLiquidations(env) {
  return cached('liquidations', TTL.liquidations, async () => {
    const probe = await tryLiquidationsRest();
    return unavailable(probe.reason, 'binance-forceOrder', {
      sourceLabel: 'Binance forceOrder (WS-only)',
      data: {
        events: [],
        ingest: 'none',
        hint: 'Optional future: Worker + Durable Object buffering <symbol>@forceOrder'
      }
    });
  });
}
