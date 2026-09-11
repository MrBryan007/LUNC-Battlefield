/* Market data helpers — liquidity zones + API bridge hooks */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;

  function calcLiquidityZones(mid, bids, asks, bands) {
    // bids/asks: array of [price, qty] sorted; mid > 0
    const out = { truth: DT.CALCULATED, mid, bands: [] };
    if (!(mid > 0) || !Array.isArray(bids) || !Array.isArray(asks)) {
      return { truth: DT.UNAVAILABLE, mid: mid || null, bands: [], reason: 'No order book' };
    }
    function sumSide(levels, side) {
      return (bands || LB.config.liquidityBands).map(band => {
        let notional = 0;
        for (const [px, qty] of levels) {
          const p = +px, q = +qty;
          if (!(p > 0 && q > 0)) continue;
          const pct = side === 'bid' ? ((mid - p) / mid) * 100 : ((p - mid) / mid) * 100;
          if (pct >= band.minPct && pct < band.maxPct) notional += p * q;
        }
        return { id: band.id, label: band.label, minPct: band.minPct, maxPct: band.maxPct, usd: notional };
      });
    }
    out.bids = sumSide(bids, 'bid');
    out.asks = sumSide(asks, 'ask');
    return out;
  }

  async function fetchBridgeSnapshot() {
    const base = LB.config.apiBase;
    if (!base) return { truth: DT.UNAVAILABLE, reason: 'No HTTPS API configured (?api=)' };
    try {
      const r = await fetch(base + '/snapshot', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      return { truth: DT.LIVE, data };
    } catch (e) {
      return { truth: DT.UNAVAILABLE, reason: String(e.message || e) };
    }
  }

  LB.market = { calcLiquidityZones, fetchBridgeSnapshot };
})(window);
