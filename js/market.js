/* Market data — liquidity zones with coverage honesty + HTTPS API snapshot */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;

  let state = {
    mid: null,
    truth: DT.UNAVAILABLE,
    source: null, // 'binance' | 'api' | null
    sourceLabel: null,
    zones: null,
    buyWallM: null,
    sellWallM: null,
    imbalance: 0,
    volume24h: null,
    volumeTruth: DT.UNAVAILABLE,
    maxBidPct: 0,
    maxAskPct: 0
  };

  function bookMapsToArrays(bidMap, askMap) {
    const bids = Object.keys(bidMap || {}).map(Number).filter(p => p > 0 && bidMap[p] > 0)
      .sort((a, b) => b - a).map(p => [p, bidMap[p]]);
    const asks = Object.keys(askMap || {}).map(Number).filter(p => p > 0 && askMap[p] > 0)
      .sort((a, b) => a - b).map(p => [p, askMap[p]]);
    return { bids, asks };
  }

  function maxDepthPct(mid, levels, side) {
    let max = 0;
    for (const [px] of levels) {
      const p = +px;
      if (!(p > 0)) continue;
      const pct = side === 'bid' ? ((mid - p) / mid) * 100 : ((p - mid) / mid) * 100;
      if (pct > max) max = pct;
    }
    return max;
  }

  function calcLiquidityZones(mid, bids, asks, bands) {
    if (!(mid > 0) || !Array.isArray(bids) || !Array.isArray(asks) || !bids.length || !asks.length) {
      return {
        truth: DT.UNAVAILABLE, mid: mid || null, bids: [], asks: [],
        maxBidPct: 0, maxAskPct: 0, reason: 'No order book'
      };
    }
    const bandList = bands || LB.config.liquidityBands;
    const maxBidPct = maxDepthPct(mid, bids, 'bid');
    const maxAskPct = maxDepthPct(mid, asks, 'ask');

    function sumSide(levels, side, reachPct) {
      return bandList.map(band => {
        // Band fully outside measured reach → UNAVAILABLE
        if (reachPct < band.minPct) {
          return {
            id: band.id, label: band.label, minPct: band.minPct, maxPct: band.maxPct,
            usd: null, truth: DT.UNAVAILABLE, reason: 'Book too shallow for this band'
          };
        }
        let notional = 0;
        for (const [px, qty] of levels) {
          const p = +px, q = +qty;
          if (!(p > 0 && q > 0)) continue;
          const pct = side === 'bid' ? ((mid - p) / mid) * 100 : ((p - mid) / mid) * 100;
          if (pct >= band.minPct && pct < band.maxPct) notional += p * q;
        }
        const partial = reachPct < band.maxPct;
        return {
          id: band.id, label: band.label, minPct: band.minPct, maxPct: band.maxPct,
          usd: notional,
          truth: partial ? DT.PARTIAL : DT.CALCULATED,
          reason: partial ? ('Coverage only to ~' + reachPct.toFixed(2) + '%') : null
        };
      });
    }

    const overallPartial = maxBidPct < 5 || maxAskPct < 5;
    return {
      truth: overallPartial ? DT.PARTIAL : DT.CALCULATED,
      mid,
      bids: sumSide(bids, 'bid', maxBidPct),
      asks: sumSide(asks, 'ask', maxAskPct),
      maxBidPct,
      maxAskPct
    };
  }

  function wallsFromZones(zones) {
    if (!zones || zones.truth === DT.UNAVAILABLE) {
      return { buyM: null, sellM: null, imbalance: 0, truth: DT.UNAVAILABLE };
    }
    const usable = (side, ids) => (side || []).filter(z => ids.includes(z.id) && z.truth !== DT.UNAVAILABLE && z.usd != null);
    const sum = arr => arr.reduce((a, z) => a + (z.usd || 0), 0);
    const buyLevels = usable(zones.bids, ['immediate', 'near']);
    const sellLevels = usable(zones.asks, ['immediate', 'near']);
    if (!buyLevels.length && !sellLevels.length) {
      return { buyM: null, sellM: null, imbalance: 0, truth: DT.UNAVAILABLE };
    }
    const buyUsd = sum(buyLevels);
    const sellUsd = sum(sellLevels);
    const tot = buyUsd + sellUsd;
    return {
      buyM: buyUsd / 1e6,
      sellM: sellUsd / 1e6,
      imbalance: tot > 0 ? (buyUsd - sellUsd) / tot : 0,
      truth: (buyLevels.some(z => z.truth === DT.PARTIAL) || sellLevels.some(z => z.truth === DT.PARTIAL))
        ? DT.PARTIAL : DT.CALCULATED,
      buyUsd,
      sellUsd
    };
  }

  function updateFromBook(mid, bids, asks, sourceTruth, sourceName, sourceLabel) {
    const zones = calcLiquidityZones(mid, bids, asks);
    if (zones.truth === DT.UNAVAILABLE) {
      state = {
        mid, truth: DT.UNAVAILABLE, source: sourceName || null, sourceLabel: sourceLabel || null,
        zones, buyWallM: null, sellWallM: null, imbalance: 0,
        volume24h: state.volume24h, volumeTruth: state.volumeTruth,
        maxBidPct: 0, maxAskPct: 0
      };
      return state;
    }
    zones.bookTruth = sourceTruth || DT.LIVE;
    zones.source = sourceName || null;
    zones.sourceLabel = sourceLabel || sourceName || 'Unknown';
    const walls = wallsFromZones(zones);
    state = {
      mid,
      truth: sourceTruth || DT.LIVE,
      source: sourceName || 'book',
      sourceLabel: sourceLabel || sourceName || 'Unknown',
      zones,
      buyWallM: walls.buyM,
      sellWallM: walls.sellM,
      imbalance: walls.imbalance,
      volume24h: state.volume24h,
      volumeTruth: state.volumeTruth,
      maxBidPct: zones.maxBidPct,
      maxAskPct: zones.maxAskPct
    };
    return state;
  }

  function updateFromMaps(mid, bidMap, askMap, sourceTruth, sourceName, sourceLabel) {
    const { bids, asks } = bookMapsToArrays(bidMap, askMap);
    return updateFromBook(mid, bids, asks, sourceTruth, sourceName, sourceLabel);
  }

  function setVolume24h(usd, truth) {
    state.volume24h = usd != null ? +usd : null;
    state.volumeTruth = truth || (usd != null ? DT.LIVE : DT.UNAVAILABLE);
  }

  function getState() { return state; }

  async function fetchBinanceSpotPrice(symbol) {
    if (!symbol) return { truth: DT.UNAVAILABLE, reason: 'No symbol' };
    try {
      const base = (LB.config.binanceRestBase || 'https://data-api.binance.vision').replace(/\/$/, '');
      const u = base + '/api/v3/ticker/bookTicker?symbol=' + encodeURIComponent(String(symbol).toUpperCase());
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) {
        const err = new Error('HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      const data = await r.json();
      const bid = +data.bidPrice, ask = +data.askPrice;
      const mid = (bid > 0 && ask > 0) ? (bid + ask) / 2 : +data.price;
      if (!(mid > 0)) throw new Error('No price');
      return {
        truth: DT.LIVE,
        source: 'binance',
        sourceLabel: 'Binance',
        mid, bid, ask,
        symbol: String(symbol).toUpperCase()
      };
    } catch (e) {
      const status = e && e.status;
      return { truth: DT.UNAVAILABLE, reason: String(e.message || e), status: status };
    }
  }

  async function fetchBinanceRestDepth(symbol, limit) {
    limit = limit || (LB.config.binanceRestDepthLimit || 1000);
    if (!symbol) return { truth: DT.UNAVAILABLE, reason: 'No symbol' };
    try {
      const base = (LB.config.binanceRestBase || 'https://data-api.binance.vision').replace(/\/$/, '');
      const u = base + '/api/v3/depth?symbol=' + encodeURIComponent(symbol.toUpperCase()) + '&limit=' + limit;
      const r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) {
        const err = new Error('HTTP ' + r.status);
        err.status = r.status;
        throw err;
      }
      const data = await r.json();
      return {
        truth: DT.LIVE,
        source: 'binance',
        sourceLabel: 'Binance',
        bids: data.bids || [],
        asks: data.asks || [],
        lastUpdateId: data.lastUpdateId
      };
    } catch (e) {
      return { truth: DT.UNAVAILABLE, reason: String(e.message || e), status: e && e.status };
    }
  }

  async function fetchSnapshot() {
    const base = LB.config.apiBase;
    if (!base) return { truth: DT.UNAVAILABLE, reason: 'No HTTPS API (?api=)' };
    try {
      const r = await fetch(base + '/snapshot', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      return { truth: DT.LIVE, data, source: 'api', sourceLabel: (data && data.sourceLabel) || 'Backend API' };
    } catch (e) {
      return { truth: DT.UNAVAILABLE, reason: String(e.message || e), status: e && e.status };
    }
  }

  LB.market = {
    calcLiquidityZones,
    wallsFromZones,
    updateFromBook,
    updateFromMaps,
    bookMapsToArrays,
    setVolume24h,
    getState,
    fetchSnapshot,
    fetchBridgeSnapshot: fetchSnapshot,
    fetchBinanceRestDepth,
    fetchBinanceSpotPrice
  };
})(window);
