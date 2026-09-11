import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  envelope,
  live,
  unavailable,
  partial,
  calculated,
  computeLiquidityZones,
  Truth
} from '../src/lib/envelope.js';
import { burnVisualScale, classifyWhaleTransfer, WHALE_THRESHOLDS } from '../src/providers/entities.js';

describe('envelope', () => {
  it('builds a standard envelope', () => {
    const e = envelope({ truth: Truth.LIVE, source: 'test', data: { ok: 1 } });
    assert.equal(e.status, 'ok');
    assert.equal(e.truth, 'LIVE');
    assert.equal(e.source, 'test');
    assert.equal(e.data.ok, 1);
    assert.ok(e.timestamp);
    assert.equal(e.stale, false);
  });

  it('live / unavailable / partial / calculated helpers', () => {
    assert.equal(live({ a: 1 }, 'binance').truth, 'LIVE');
    assert.equal(unavailable('nope', 'x').truth, 'UNAVAILABLE');
    assert.equal(partial({ a: 1 }, 'why', 'terra-lcd').truth, 'PARTIAL');
    assert.equal(calculated({ a: 1 }, 'math').truth, 'CALCULATED');
    assert.ok(unavailable('r').error);
  });
});

describe('computeLiquidityZones', () => {
  it('bins bid/ask notionals by pct from mid', () => {
    const mid = 100;
    const bids = [
      ['99.8', '10'], // 0.2% → immediate
      ['99.0', '5'],  // 1.0% → near (minPct 0.5 max 1 → pct < 1, so 1.0 not in near; 1.0 >= 1 → major)
      ['97.0', '2']   // 3% → major max is 3 exclusive? pct < 3 for major; 3.0 → deep
    ];
    // Fix expectations carefully:
    // immediate 0–0.5: 99.8 → 0.2% ✓
    // near 0.5–1: none from above if 99.0 is exactly 1.0% → goes to major (1–3)
    // major 1–3: 99.0 at 1% ✓; 97 at 3% → deep (3–5) since maxPct exclusive via < 
    const asks = [['100.4', '8']]; // 0.4% immediate
    const z = computeLiquidityZones(bids, asks, mid);
    assert.equal(z.mid, 100);
    const imm = z.bands.find(b => b.id === 'immediate');
    assert.ok(imm.bidNotional > 0);
    assert.ok(imm.askNotional > 0);
  });

  it('handles missing mid', () => {
    const z = computeLiquidityZones([], [], null);
    assert.equal(z.mid, null);
    assert.equal(z.bands.length, 4);
  });
});

describe('entities helpers', () => {
  it('burn visual scale thresholds', () => {
    assert.equal(burnVisualScale(50), 'below threshold');
    assert.equal(burnVisualScale(1e5), 'small strike');
    assert.equal(burnVisualScale(1e9), 'massive battlefield event');
  });

  it('never guesses buy/sell for unknown wallets', () => {
    const c = classifyWhaleTransfer('terra1unknownfrom', 'terra1unknownto');
    assert.equal(c.direction, 'unknown');
    assert.match(c.classification, /unknown/i);
  });

  it('exposes whale thresholds', () => {
    assert.ok(WHALE_THRESHOLDS.LUNC_ULUNA >= 50_000_000 * 1e6);
    assert.equal(WHALE_THRESHOLDS.USTC_USD_MIN, 25_000);
  });
});
