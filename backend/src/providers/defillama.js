import { fetchJson } from '../lib/http.js';

const BASE = 'https://coins.llama.fi';

const COINS = {
  LUNC: 'coingecko:terra-luna',
  USTC: 'coingecko:terrausd'
};

export async function currentPrices(assets = ['LUNC', 'USTC']) {
  const keys = assets.map(a => COINS[String(a).toUpperCase()]).filter(Boolean);
  if (!keys.length) throw new Error('no defillama coins');
  const url = `${BASE}/prices/current/${keys.join(',')}`;
  const data = await fetchJson(url, {}, 10_000);
  return { data, url, source: 'defillama' };
}

export async function priceFor(asset) {
  const key = COINS[String(asset).toUpperCase()];
  if (!key) throw new Error('unknown asset for defillama');
  const { data, url } = await currentPrices([asset]);
  const row = data?.coins?.[key];
  if (!row || row.price == null) throw new Error('defillama missing price');
  return {
    price: row.price,
    timestamp: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : null,
    key,
    url,
    source: 'defillama',
    sourceLabel: 'DefiLlama'
  };
}

export { COINS };
