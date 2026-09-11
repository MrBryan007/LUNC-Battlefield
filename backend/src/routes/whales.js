import { live, partial, unavailable } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import { searchTxs, lcdGet, ulunaToLunc, uusdToUstc } from '../providers/terra.js';
import { classifyWhaleTransfer, WHALE_THRESHOLDS, labelAddress } from '../providers/entities.js';
import { handleMarket } from './market.js';

function parseCoinAmount(coins) {
  if (!coins) return [];
  if (typeof coins === 'string') {
    // e.g. "50000000000000uluna"
    const out = [];
    for (const part of coins.split(',')) {
      const m = part.trim().match(/^(\d+)([a-zA-Z\/]+)$/);
      if (m) out.push({ amount: m[1], denom: m[2] });
    }
    return out;
  }
  if (Array.isArray(coins)) return coins;
  return [];
}

function extractWhalesFromTxs(txs, { luncPrice, ustcPrice, limit }) {
  const events = [];
  const minUluna = WHALE_THRESHOLDS.LUNC_ULUNA;
  const minUusd =
    ustcPrice && ustcPrice > 0
      ? Math.floor((WHALE_THRESHOLDS.USTC_USD_MIN / ustcPrice) * 1e6)
      : 25_000 * 1e6; // fallback assume ~$1 historical nonsense — better: use USD gate below

  for (const wrap of txs) {
    const tx = wrap.tx || wrap;
    const msgs = tx?.body?.messages || [];
    const hash = wrap.txhash || wrap.tx_response?.txhash || null;
    const height = wrap.height || wrap.tx_response?.height || null;
    const timestamp = wrap.timestamp || wrap.tx_response?.timestamp || null;

    for (const msg of msgs) {
      const type = msg['@type'] || msg.type || '';
      if (!/MsgSend/i.test(type)) continue; // only bank sends for whale hunter
      const from = msg.from_address || null;
      const to = msg.to_address || null;
      const amounts = parseCoinAmount(msg.amount);

      for (const c of amounts) {
        const denom = c.denom;
        const raw = Number(c.amount);
        if (!Number.isFinite(raw) || raw <= 0) continue;

        let asset = null;
        let amount = null;
        let usd = null;
        let pass = false;

        if (denom === 'uluna') {
          asset = 'LUNC';
          amount = ulunaToLunc(raw);
          usd = luncPrice != null ? amount * luncPrice : null;
          pass = raw >= minUluna;
        } else if (denom === 'uusd') {
          asset = 'USTC';
          amount = uusdToUstc(raw);
          usd = ustcPrice != null ? amount * ustcPrice : amount; // if no price, treat unit as approx
          // Prefer USD threshold when price known
          if (ustcPrice != null) pass = usd >= WHALE_THRESHOLDS.USTC_USD_MIN;
          else pass = amount >= WHALE_THRESHOLDS.USTC_USD_MIN; // conservative without price
        } else {
          continue;
        }

        if (!pass) continue;

        const cls = classifyWhaleTransfer(from, to);
        const fromLabel = labelAddress(from);
        const toLabel = labelAddress(to);

        events.push({
          asset,
          amount,
          amountRaw: raw,
          denom,
          usd,
          wallet: from,
          from,
          to,
          fromLabel: fromLabel?.label || null,
          toLabel: toLabel?.label || null,
          txhash: hash,
          height: height != null ? Number(height) : null,
          timestamp,
          direction: cls.direction,
          classification: cls.classification,
          confidence: cls.confidence,
          source: 'terra-lcd'
        });
      }
    }
  }

  // Sort by usd/amount desc
  events.sort((a, b) => (b.usd || b.amount || 0) - (a.usd || a.amount || 0));
  return events.slice(0, limit);
}

async function scanWhales(env, limit) {
  const errors = [];
  let txs = [];

  // Prices for USD gates
  let luncPrice = null;
  let ustcPrice = null;
  try {
    const m = await handleMarket(env, 'LUNC');
    if (m?.data?.price) luncPrice = m.data.price;
  } catch (e) {
    errors.push('lunc price: ' + (e.message || e));
  }
  try {
    const m = await handleMarket(env, 'USTC');
    if (m?.data?.price) ustcPrice = m.data.price;
  } catch (e) {
    errors.push('ustc price: ' + (e.message || e));
  }

  // MsgSend search — many public LCDs reject free-form event queries
  try {
    const { data } = await searchTxs(env, {
      events: 'message.action=/cosmos.bank.v1beta1.MsgSend',
      'pagination.limit': '30',
      order_by: 'ORDER_BY_DESC'
    });
    txs = data.tx_responses || [];
  } catch (e) {
    errors.push('MsgSend search: ' + (e.message || e));
  }

  // Alternate query style
  if (!txs.length) {
    try {
      const { data } = await searchTxs(env, {
        events: 'transfer.amount',
        'pagination.limit': '10'
      });
      txs = data.tx_responses || [];
      if (txs.length) errors.push('transfer.amount query returned txs but filter is coarse — applying thresholds only');
    } catch (e) {
      errors.push('transfer search: ' + (e.message || e));
    }
  }

  if (!txs.length) {
    try {
      const { data } = await lcdGet('/cosmos/base/tendermint/v1beta1/blocks/latest', env);
      const height = data?.block?.header?.height;
      errors.push(`LCD ok (height ${height}); tx event search unsupported or empty on this endpoint`);
    } catch (e) {
      errors.push('lcd: ' + (e.message || e));
    }
  }

  const events = extractWhalesFromTxs(txs, { luncPrice, ustcPrice, limit });
  return { events, errors, scanned: txs.length, luncPrice, ustcPrice };
}

export async function handleWhales(env, url) {
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  return cached(`whales:${limit}`, TTL.whales, async () => {
    try {
      const { events, errors, scanned, luncPrice, ustcPrice } = await scanWhales(env, limit);
      const payload = {
        events,
        thresholds: {
          luncMin: 50_000_000,
          ustcUsdMin: WHALE_THRESHOLDS.USTC_USD_MIN,
          luncPrice,
          ustcPrice
        },
        scannedTxs: scanned,
        note: 'Never guesses buy/sell. Deposit/withdrawal only for known exchange addresses.'
      };
      if (events.length > 0 && errors.length === 0) {
        return live(payload, 'terra-lcd', { sourceLabel: 'Terra Classic LCD whale scan' });
      }
      if (events.length > 0) {
        return partial(payload, errors.join('; '), 'terra-lcd', {
          sourceLabel: 'Terra Classic LCD whale scan (partial)',
          confidence: 0.55
        });
      }
      return unavailable(
        errors.length
          ? `No whale events indexed. ${errors.join('; ')}`
          : 'No whale MsgSend events above threshold in LCD search.',
        'terra-lcd',
        { sourceLabel: 'Terra Classic LCD', data: payload }
      );
    } catch (e) {
      return unavailable(`Whale feed failed: ${e.message || e}`, 'terra-lcd', {
        data: { events: [] }
      });
    }
  });
}
