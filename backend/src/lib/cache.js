/** Simple in-memory TTL cache (per-isolate on Workers). */
const store = new Map();

export const TTL = Object.freeze({
  prices: 8_000,
  orderbook: 5_000,
  governance: 60_000,
  validators: 120_000,
  burns: 30_000,
  whales: 30_000,
  supply: 60_000,
  network: 60_000,
  health: 15_000,
  snapshot: 8_000,
  liquidations: 10_000
});

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return null;
  }
  return { value: hit.value, stale: false, ageMs: Date.now() - hit.storedAt };
}

export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expires: Date.now() + ttlMs, storedAt: Date.now() });
  return value;
}

export async function cached(key, ttlMs, producer) {
  const hit = cacheGet(key);
  if (hit) return hit.value;
  const value = await producer();
  return cacheSet(key, value, ttlMs);
}

export function cacheStats() {
  return { size: store.size, keys: [...store.keys()] };
}

export function cacheClear() {
  store.clear();
}
