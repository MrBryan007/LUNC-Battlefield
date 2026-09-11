import { live, partial, unavailable, Truth } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import { bookTicker, ticker24h, symbolInfo } from '../providers/binance.js';
import { priceFor as llamaPrice } from '../providers/defillama.js';
import { priceFor as geckoPrice } from '../providers/coingecko.js';

export async function handleMarket(env, asset) {
  const a = String(asset || '').toUpperCase();
  if (a !== 'LUNC' && a !== 'USTC') {
    return unavailable('Asset must be LUNC or USTC', 'router');
  }
  return cached(`market:${a}`, TTL.prices, async () => {
    const info = symbolInfo(a);
    const notes = { futures: info?.futures || null, futuresNote: info?.note || null };

    // 1) Binance bookTicker mid
    try {
      const { data, url } = await bookTicker(env, info.spot);
      const bid = +data.bidPrice;
      const ask = +data.askPrice;
      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
        const mid = (bid + ask) / 2;
        let volume24h = null;
        let quoteVolume24h = null;
        try {
          const t = await ticker24h(env, info.spot);
          volume24h = +t.data.volume || null;
          quoteVolume24h = +t.data.quoteVolume || null;
        } catch (_) {}
        return live(
          {
            asset: a,
            symbol: info.spot,
            price: mid,
            bid,
            ask,
            volume24h,
            quoteVolume24h,
            ...notes
          },
          'binance',
          { sourceLabel: `Binance bookTicker (${url.includes('vision') ? 'vision' : 'api'})` }
        );
      }
    } catch (_) {}

    // 2) DefiLlama
    try {
      const p = await llamaPrice(a);
      return partial(
        { asset: a, symbol: info.spot, price: p.price, bid: null, ask: null, volume24h: null, ...notes },
        'Binance unavailable; DefiLlama fallback (no book)',
        'defillama',
        { sourceLabel: 'DefiLlama', confidence: 0.75 }
      );
    } catch (_) {}

    // 3) CoinGecko
    try {
      const p = await geckoPrice(a);
      return partial(
        {
          asset: a,
          symbol: info.spot,
          price: p.price,
          bid: null,
          ask: null,
          volume24h: p.volume24h,
          marketCap: p.marketCap,
          ...notes
        },
        'Binance+DefiLlama unavailable; CoinGecko fallback',
        'coingecko',
        { sourceLabel: 'CoinGecko', confidence: 0.7 }
      );
    } catch (e) {
      return unavailable(`Market price unavailable: ${e.message || e}`, 'market', {
        data: { asset: a, ...notes }
      });
    }
  });
}
