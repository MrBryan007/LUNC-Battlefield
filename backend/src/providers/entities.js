/**
 * Conservative known-entity labels for Terra Classic.
 * Only label when address matches exactly. Never guess buy/sell.
 * Addresses are well-known public CEX deposit/hot wallets or burn sinks where documented.
 * Prefer unknown over wrong classification.
 */

/** @type {Record<string, { label: string, kind: string }>} */
export const KNOWN_ADDRESSES = Object.freeze({
  // Terra Classic community burn / tax-related sinks (publicly documented)
  // Leave sparse — wrong labels are worse than unknown.
});

/** Known exchange-related addresses (deposit/withdrawal classification only). */
export const EXCHANGE_ADDRESSES = Object.freeze({
  // Populate only with high-confidence public hot/deposit wallets.
  // Empty by default → whales stay "unknown whale movement".
});

/** Burn-related entity labels (MsgExec / known burn programs). Conservative. */
export const BURN_ENTITIES = Object.freeze({
  // e.g. documented LUNC burn bots / community burn wallets when verified
});

export function labelAddress(addr) {
  if (!addr) return null;
  const a = String(addr).trim();
  if (EXCHANGE_ADDRESSES[a]) return { ...EXCHANGE_ADDRESSES[a], address: a };
  if (KNOWN_ADDRESSES[a]) return { ...KNOWN_ADDRESSES[a], address: a };
  if (BURN_ENTITIES[a]) return { ...BURN_ENTITIES[a], address: a };
  return null;
}

export function isExchangeAddress(addr) {
  return !!(addr && EXCHANGE_ADDRESSES[String(addr).trim()]);
}

export function classifyWhaleTransfer(from, to) {
  const fromEx = isExchangeAddress(from);
  const toEx = isExchangeAddress(to);
  if (fromEx && !toEx) {
    return {
      direction: 'withdrawal',
      classification: `withdrawal from ${EXCHANGE_ADDRESSES[from]?.label || 'exchange'}`,
      confidence: 0.7
    };
  }
  if (!fromEx && toEx) {
    return {
      direction: 'deposit',
      classification: `deposit to ${EXCHANGE_ADDRESSES[to]?.label || 'exchange'}`,
      confidence: 0.7
    };
  }
  if (fromEx && toEx) {
    return {
      direction: 'transfer',
      classification: 'exchange-to-exchange transfer',
      confidence: 0.6
    };
  }
  return {
    direction: 'unknown',
    classification: 'unknown whale movement',
    confidence: 0.4
  };
}

export const WHALE_THRESHOLDS = Object.freeze({
  LUNC_ULUNA: 50_000_000 * 1_000_000, // ≥50M LUNC in uluna
  USTC_UUSD: null, // set dynamically via USD threshold
  USTC_USD_MIN: 25_000
});

export const BURN_VISUAL_SCALE = Object.freeze([
  { min: 1e5, label: 'small strike' },
  { min: 1e6, label: 'artillery strike' },
  { min: 1e7, label: 'bombardment' },
  { min: 1e8, label: 'major burn event' },
  { min: 1e9, label: 'massive battlefield event' }
]);

export function burnVisualScale(amountLunc) {
  let label = 'below threshold';
  for (const s of BURN_VISUAL_SCALE) if (amountLunc >= s.min) label = s.label;
  return label;
}
