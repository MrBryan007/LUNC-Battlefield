/* Market data — liquidity zones from live Binance book + primary ?api= snapshot */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;

  let state = {
    mid: null,
    truth: DT.UNAVAILABLE,
    source: null,
    zones: null,
    buyWallM: null,
    sellWallM: null,
    imbalance: 0
  };

  function bookMapsToArrays(bidMap, askMap) {
    const bids = Object.keys(bidMap || {}).map(Number).filter(p => p > 0 && bidMap[p] > 0)
      .sort((a, b) => b - a).map(p => [p, bidMap[p]]);
    const asks = Object.keys(askMap || {}).map(Number).filter(p => p > 0 && askMap[p] > 0)
      .sort((a, b) => a - b).map(p => [p, askMap[p]]);
    return { bids, asks };
  }

  function calcLiquidityZones(mid, bids, asks, bands) {
    if (!(mid > 0) || !Array.isArray(bids) || !Array.isArray(asks) || !bids.length || !asks.length) {
      return { truth: DT.UNAVAILABLE, mid: mid || null, bids: [], asks: [], reason: 'No order book' };
    }
    const bandList = bands || LB.config.liquidityBands;
    function sumSide(levels, side) {
      return bandList.map(band => {
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
    return {
      truth: DT.CALCULATED,
      mid,
      bids: sumSide(bids, 'bid'),
      asks: sumSide(asks, 'ask')
    };
  }

  function wallsFromZones(zones) {
    if (!zones || zones.truth === DT.UNAVAILABLE) {
      return { buyM: null, sellM: null, imbalance: 0, truth: DT.UNAVAILABLE };
    }
    // Immediate + Near as the "front wall" the armies track; Major/Deep exposed separately
    const sum = (side, ids) => side.filter(z => ids.includes(z.id)).reduce((a, z) => a + (z.usd || 0), 0);
    const buyUsd = sum(zones.bids || [], ['immediate', 'near']);
    const sellUsd = sum(zones.asks || [], ['immediate', 'near']);
    const buyM = buyUsd / 1e6;
    const sellM = sellUsd / 1e6;
    const tot = buyUsd + sellUsd;
    const imbalance = tot > 0 ? (buyUsd - sellUsd) / tot : 0;
    return { buyM, sellM, imbalance, truth: DT.CALCULATED, buyUsd, sellUsd };
  }

  function updateFromBook(mid, bids, asks, sourceTruth, sourceName) {
    const zones = calcLiquidityZones(mid, bids, asks);
    if (zones.truth === DT.UNAVAILABLE) {
      state = { mid, truth: DT.UNAVAILABLE, source: sourceName || null, zones, buyWallM: null, sellWallM: null, imbalance: 0 };
      return state;
    }
    // Zone math is CALCULATED; underlying book truth is LIVE (Binance) or from API
    zones.bookTruth = sourceTruth || DT.LIVE;
    const walls = wallsFromZones(zones);
    state = {
      mid,
      truth: sourceTruth || DT.LIVE,
      source: sourceName || 'book',
      zones,
      buyWallM: walls.buyM,
      sellWallM: walls.sellM,
      imbalance: walls.imbalance
    };
    return state;
  }

  function updateFromMaps(mid, bidMap, askMap, sourceTruth, sourceName) {
    const { bids, asks } = bookMapsToArrays(bidMap, askMap);
    return updateFromBook(mid, bids, asks, sourceTruth, sourceName);
  }

  function getState() { return state; }

  async function fetchSnapshot() {
    const base = LB.config.apiBase;
    if (!base) return { truth: DT.UNAVAILABLE, reason: 'No HTTPS API (?api=)' };
    try {
      const r = await fetch(base + '/snapshot', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      return { truth: DT.LIVE, data, source: 'api' };
    } catch (e) {
      return { truth: DT.UNAVAILABLE, reason: String(e.message || e) };
    }
  }

  // Back-compat alias
  const fetchBridgeSnapshot = fetchSnapshot;

  LB.market = {
    calcLiquidityZones,
    wallsFromZones,
    updateFromBook,
    updateFromMaps,
    bookMapsToArrays,
    getState,
    fetchSnapshot,
    fetchBridgeSnapshot
  };
})(window);
