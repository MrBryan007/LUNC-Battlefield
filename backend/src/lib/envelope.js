import { Truth } from './truth.js';

/**
 * Standard API envelope for every route.
 * @param {object} opts
 */
export function envelope({
  status = 'ok',
  truth = Truth.LIVE,
  source = 'unknown',
  sourceLabel = null,
  timestamp = null,
  stale = false,
  confidence = null,
  data = null,
  error = undefined
} = {}) {
  const out = {
    status,
    truth,
    source,
    sourceLabel: sourceLabel != null ? sourceLabel : String(source),
    timestamp: timestamp || new Date().toISOString(),
    stale: !!stale,
    confidence,
    data
  };
  if (error != null) out.error = typeof error === 'string' ? error : String(error.message || error);
  return out;
}

export function unavailable(reason, source = 'none', extra = {}) {
  return envelope({
    status: 'unavailable',
    truth: Truth.UNAVAILABLE,
    source,
    sourceLabel: extra.sourceLabel || source,
    data: extra.data != null ? extra.data : null,
    error: reason,
    confidence: 0,
    ...('stale' in extra ? { stale: extra.stale } : {})
  });
}

export function partial(data, reason, source, opts = {}) {
  return envelope({
    status: 'partial',
    truth: Truth.PARTIAL,
    source,
    sourceLabel: opts.sourceLabel || source,
    data,
    error: reason,
    confidence: opts.confidence != null ? opts.confidence : 0.5,
    stale: opts.stale || false
  });
}

export function live(data, source, opts = {}) {
  return envelope({
    status: 'ok',
    truth: Truth.LIVE,
    source,
    sourceLabel: opts.sourceLabel || source,
    data,
    confidence: opts.confidence != null ? opts.confidence : 1,
    stale: opts.stale || false,
    timestamp: opts.timestamp
  });
}

export function calculated(data, source, opts = {}) {
  return envelope({
    status: 'ok',
    truth: Truth.CALCULATED,
    source,
    sourceLabel: opts.sourceLabel || source,
    data,
    confidence: opts.confidence != null ? opts.confidence : 0.9,
    stale: opts.stale || false
  });
}

/** Liquidity zone coverage from bids/asks around mid (pct bands). */
export function computeLiquidityZones(bids, asks, mid, bands) {
  const defaultBands = bands || [
    { id: 'immediate', label: 'Immediate defense', minPct: 0, maxPct: 0.5 },
    { id: 'near', label: 'Near wall', minPct: 0.5, maxPct: 1 },
    { id: 'major', label: 'Major wall', minPct: 1, maxPct: 3 },
    { id: 'deep', label: 'Deep liquidity', minPct: 3, maxPct: 5 }
  ];
  if (!mid || !Number.isFinite(mid) || mid <= 0) {
    return { bands: defaultBands.map(b => ({ ...b, bidNotional: 0, askNotional: 0 })), mid: null };
  }
  function zoneNotional(levels, side) {
    return defaultBands.map(b => {
      let sum = 0;
      for (const [pStr, qStr] of levels) {
        const p = +pStr;
        const q = +qStr;
        if (!Number.isFinite(p) || !Number.isFinite(q)) continue;
        const pct = side === 'bid' ? ((mid - p) / mid) * 100 : ((p - mid) / mid) * 100;
        if (pct >= b.minPct && pct < b.maxPct) sum += p * q;
      }
      return { ...b, [`${side}Notional`]: sum };
    });
  }
  const bidZ = zoneNotional(bids || [], 'bid');
  const askZ = zoneNotional(asks || [], 'ask');
  const merged = defaultBands.map((b, i) => ({
    ...b,
    bidNotional: bidZ[i].bidNotional || 0,
    askNotional: askZ[i].askNotional || 0
  }));
  return { bands: merged, mid };
}

export { Truth };
