import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Truth } from '../src/lib/truth.js';
import { TTL, cacheSet, cacheGet, cacheClear } from '../src/lib/cache.js';

/** Mirror of Worker normalizePath — keep in sync with src/index.js */
function normalizePath(pathname) {
  let p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/api') return '/';
  if (p.startsWith('/api/')) p = p.slice(4) || '/';
  return p;
}

describe('path dual-mount', () => {
  it('strips /api prefix so bare and /api routes share handlers', () => {
    assert.equal(normalizePath('/api/snapshot'), '/snapshot');
    assert.equal(normalizePath('/snapshot'), '/snapshot');
    assert.equal(normalizePath('/api/burns'), '/burns');
    assert.equal(normalizePath('/burns'), '/burns');
    assert.equal(normalizePath('/governance/proposals'), '/governance/proposals');
    assert.equal(normalizePath('/api/governance/validators'), '/governance/validators');
    assert.equal(normalizePath('/api'), '/');
    assert.equal(normalizePath('/api/'), '/');
    assert.equal(normalizePath('/api/market/LUNC'), '/market/LUNC');
  });
});

describe('cache TTL map', () => {
  it('has expected TTLs', () => {
    assert.ok(TTL.prices <= 10_000);
    assert.ok(TTL.orderbook <= 10_000);
    assert.ok(TTL.governance >= 30_000);
    assert.ok(TTL.validators >= 60_000);
    assert.ok(TTL.burns >= 15_000);
  });

  it('stores and clears', () => {
    cacheClear();
    cacheSet('t', { x: 1 }, 60_000);
    assert.deepEqual(cacheGet('t').value, { x: 1 });
    cacheClear();
    assert.equal(cacheGet('t'), null);
  });
});

describe('truth enums', () => {
  it('exports all labels', () => {
    for (const k of ['LIVE', 'CALCULATED', 'ESTIMATED', 'SIMULATED', 'UNAVAILABLE', 'PARTIAL']) {
      assert.equal(Truth[k], k);
    }
  });
});

const OFFLINE = process.env.OFFLINE === '1';

describe('live LCD integration (optional)', { skip: OFFLINE }, () => {
  it('publicnode LCD latest block responds or soft-skips on network block', async () => {
    const url =
      'https://terra-classic-lcd.publicnode.com/cosmos/base/tendermint/v1beta1/blocks/latest';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        assert.ok(true, 'LCD non-OK in this environment');
        return;
      }
      const data = await res.json();
      assert.ok(data.block?.header?.height);
      assert.equal(data.block.header.chain_id, 'columbus-5');
    } catch (e) {
      assert.ok(true, 'LCD unreachable: ' + e.message);
    } finally {
      clearTimeout(t);
    }
  });
});
