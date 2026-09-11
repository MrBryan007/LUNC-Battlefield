import { fetchJson } from '../lib/http.js';

const BASE = 'https://api.coingecko.com/api/v3';

const IDS = {
  LUNC: 'terra-luna',
  USTC: 'terrausd'
};

export async function simplePrice(ids = ['terra-luna', 'terrausd']) {
  const q = new URLSearchParams({
    ids: ids.join(','),
    vs_currencies: 'usd',
    include_24hr_vol: 'true',
    include_market_cap: 'true'
  });
  const data = await fetchJson(`${BASE}/simple/price?${q}`, {}, 10_000);
  return { data, url: `${BASE}/simple/price`, source: 'coingecko' };
}

export async function priceFor(asset) {
  const id = IDS[String(asset).toUpperCase()];
  if (!id) throw new Error('unknown asset for coingecko');
  const { data, url } = await simplePrice([id]);
  const row = data[id];
  if (!row || row.usd == null) throw new Error('coingecko missing price');
  return {
    price: row.usd,
    volume24h: row.usd_24h_vol ?? null,
    marketCap: row.usd_market_cap ?? null,
    id,
    url,
    source: 'coingecko',
    sourceLabel: 'CoinGecko'
  };
}

export { IDS };
