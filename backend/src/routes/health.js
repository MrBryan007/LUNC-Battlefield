import { live, unavailable } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import { binanceBases, bookTicker } from '../providers/binance.js';
import { fetchWithTimeout } from '../lib/http.js';

async function probe(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    return { name, ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, error: String(e.message || e) };
  }
}

export async function handleHealth(env) {
  return cached('health', TTL.health, async () => {
    const lcds = lcdList(env);
    const bins = binanceBases(env);
    const probes = await Promise.all([
      probe('terra-lcd-primary', async () => {
        const { data } = await getLatestBlock(env);
        if (!data?.block) throw new Error('no block');
      }),
      probe('binance-bookTicker-LUNC', async () => {
        await bookTicker(env, 'LUNCUSDT');
      }),
      probe('defillama', async () => {
        const r = await fetchWithTimeout('https://coins.llama.fi/prices/current/coingecko:terra-luna', {}, 8_000);
        if (!r.ok) throw new Error('HTTP ' + r.status);
      }),
      probe('coingecko', async () => {
        const r = await fetchWithTimeout('https://api.coingecko.com/api/v3/ping', {}, 8_000);
        if (!r.ok) throw new Error('HTTP ' + r.status);
      })
    ]);

    let chainId = env.CHAIN_ID || 'columbus-5';
    let height = null;
    try {
      const { data } = await getLatestBlock(env);
      height = Number(data?.block?.header?.height) || null;
      chainId = data?.block?.header?.chain_id || chainId;
    } catch (_) {}

    const okCount = probes.filter(p => p.ok).length;
    const body = {
      ok: true,
      build: env.BUILD || 'v7.1',
      chainId,
      height,
      lcds,
      binanceBases: bins,
      probes,
      upstreamOk: okCount,
      upstreamTotal: probes.length
    };

    return live(body, 'worker', {
      sourceLabel: 'LUNC Battlefield Worker',
      confidence: okCount / probes.length
    });
  });
}
