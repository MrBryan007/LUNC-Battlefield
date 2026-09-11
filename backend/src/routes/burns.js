import { live, partial, unavailable } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import { searchTxs, lcdGet, ulunaToLunc } from '../providers/terra.js';
import { labelAddress, burnVisualScale, BURN_VISUAL_SCALE } from '../providers/entities.js';

/**
 * Conservative burn indexer.
 * Never counts ordinary MsgSend / bank sends as burns.
 * Looks for burn-like message types / events when LCD search works.
 */
function extractBurnsFromTxs(txs = []) {
  const events = [];
  for (const wrap of txs) {
    const tx = wrap.tx || wrap;
    const body = tx?.body || tx?.value?.msg || null;
    const msgs = body?.messages || body?.msg || [];
    const hash = wrap.txhash || wrap.hash || wrap.tx_response?.txhash || null;
    const height = wrap.height || wrap.tx_response?.height || null;
    const timestamp = wrap.timestamp || wrap.tx_response?.timestamp || null;
    const rawLog = wrap.raw_log || wrap.tx_response?.raw_log || '';

    for (const msg of msgs) {
      const type = msg['@type'] || msg.type || '';
      // Explicit burn message types only
      const isBurnMsg =
        /MsgBurn/i.test(type) ||
        /MsgExecuteContract/i.test(type) && /burn/i.test(JSON.stringify(msg).slice(0, 500));

      // Event-based: look for burn in logs if present
      let burnedUluna = null;
      if (isBurnMsg) {
        const amount = msg.amount || msg.burn_coins || msg.coins;
        if (Array.isArray(amount)) {
          const uluna = amount.find(c => c.denom === 'uluna');
          if (uluna) burnedUluna = Number(uluna.amount);
        } else if (amount?.denom === 'uluna') {
          burnedUluna = Number(amount.amount);
        }
      }

      // Parse events array if LCD includes them
      const txEvents = wrap.events || wrap.tx_response?.events || [];
      for (const ev of txEvents) {
        if (ev.type === 'burn' || ev.type === 'coin_burn') {
          for (const attr of ev.attributes || []) {
            const key = attr.key?.length < 40 ? attr.key : (typeof atob === 'function' ? tryDecode(attr.key) : attr.key);
            const val = attr.value?.length < 80 ? attr.value : tryDecode(attr.value);
            if ((key === 'amount' || key === 'burner') && typeof val === 'string' && val.includes('uluna')) {
              const m = val.match(/(\d+)uluna/);
              if (m) burnedUluna = Number(m[1]);
            }
            if (key === 'amount' && /^\d+$/.test(String(val))) {
              // ambiguous — skip unless denom known
            }
          }
        }
      }

      // raw_log heuristic: only if explicitly "burn"
      if (burnedUluna == null && /burn/i.test(rawLog) && /uluna/i.test(rawLog)) {
        // Too risky to parse freely — skip
      }

      if (burnedUluna != null && Number.isFinite(burnedUluna) && burnedUluna > 0) {
        const amountLunc = ulunaToLunc(burnedUluna);
        const from = msg.from_address || msg.burner || msg.sender || null;
        const ent = labelAddress(from);
        events.push({
          amountLunc,
          amountUluna: burnedUluna,
          usd: null,
          wallet: from,
          entity: ent?.label || null,
          txhash: hash,
          height: height != null ? Number(height) : null,
          timestamp,
          source: 'terra-lcd',
          visual: burnVisualScale(amountLunc || 0),
          msgType: type || null
        });
      }
    }
  }
  return events;
}

function tryDecode(s) {
  try {
    if (typeof atob === 'function' && /^[A-Za-z0-9+/=]+$/.test(s) && s.length % 4 === 0) {
      return atob(s);
    }
  } catch (_) {}
  return s;
}

async function scanBurns(env, limit = 20) {
  const errors = [];
  let txs = [];

  // Attempt 1: event query for burn (may 400 on some LCDs)
  try {
    const { data } = await searchTxs(env, {
      'events': 'message.action=/cosmos.bank.v1beta1.MsgBurn',
      'pagination.limit': String(Math.min(50, limit)),
      order_by: 'ORDER_BY_DESC'
    });
    txs = data.tx_responses || data.txs || [];
  } catch (e) {
    errors.push('MsgBurn search: ' + (e.message || e));
  }

  // Attempt 2: terra wasm burn-ish — usually not applicable; skip inventing

  // Attempt 3: recent txs with query message.module=bank (too broad — DO NOT treat sends as burns)
  if (!txs.length) {
    try {
      // Probe LCD tx endpoint availability with a height-bounded query if possible
      const { data: blockData } = await lcdGet('/cosmos/base/tendermint/v1beta1/blocks/latest', env);
      const height = Number(blockData?.block?.header?.height);
      if (Number.isFinite(height)) {
        // Some LCDs support tx by events at height — still won't invent burns
        errors.push(`LCD reachable at height ${height}; no burn-indexed txs returned`);
      }
    } catch (e) {
      errors.push('block probe: ' + (e.message || e));
    }
  }

  const events = extractBurnsFromTxs(txs).slice(0, limit);
  return { events, errors, scanned: txs.length };
}

export async function handleBurns(env, url) {
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20));
  return cached(`burns:${limit}`, TTL.burns, async () => {
    try {
      const { events, errors, scanned } = await scanBurns(env, limit);
      const payload = {
        events,
        visualScale: BURN_VISUAL_SCALE,
        scannedTxs: scanned,
        note: 'Ordinary transfers are never counted as burns'
      };
      if (events.length > 0 && errors.length === 0) {
        return live(payload, 'terra-lcd', { sourceLabel: 'Terra Classic LCD burn scan' });
      }
      if (events.length > 0) {
        return partial(payload, errors.join('; '), 'terra-lcd', {
          sourceLabel: 'Terra Classic LCD burn scan (partial)',
          confidence: 0.55
        });
      }
      return unavailable(
        errors.length
          ? `No burn events indexed. ${errors.join('; ')}`
          : 'No burn events found in recent LCD search. Indexer is best-effort; prefer PARTIAL/UNAVAILABLE over wrong LIVE.',
        'terra-lcd',
        {
          sourceLabel: 'Terra Classic LCD',
          data: payload
        }
      );
    } catch (e) {
      return unavailable(`Burn feed failed: ${e.message || e}`, 'terra-lcd', {
        data: { events: [], visualScale: BURN_VISUAL_SCALE }
      });
    }
  });
}

export async function handleBurnsStats(env) {
  const recent = await handleBurns(env, new URL('https://x/burns?limit=50'));
  const events = recent?.data?.events || [];
  const totalLunc = events.reduce((s, e) => s + (e.amountLunc || 0), 0);
  const data = {
    count: events.length,
    totalLunc,
    visualScale: BURN_VISUAL_SCALE,
    truthNote: recent.truth
  };
  if (recent.truth === 'UNAVAILABLE') {
    return unavailable(recent.error || 'burn stats unavailable', 'terra-lcd', { data });
  }
  if (recent.truth === 'PARTIAL') {
    return partial(data, recent.error, 'terra-lcd', { confidence: 0.5 });
  }
  return live(data, 'terra-lcd', { sourceLabel: 'Terra Classic LCD' });
}
