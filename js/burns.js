/* Real burn feed — LIVE only via HTTPS API; never silent-sim as live */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;
  let latest = { truth: DT.UNAVAILABLE, events: [], reason: 'Burn indexer not connected' };

  function visualScale(amount) {
    const scales = LB.config.burnVisualScale;
    let label = 'below threshold';
    for (const s of scales) if (amount >= s.min) label = s.label;
    return label;
  }

  async function refresh() {
    const base = LB.config.apiBase;
    if (!base) {
      latest = { truth: DT.UNAVAILABLE, events: [], reason: 'Needs HTTPS API (?api=) for on-chain burns' };
      return latest;
    }
    try {
      const r = await fetch(base + '/burns?limit=20', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const events = (data.events || data || []).map(ev => ({
        amountLunc: +ev.amountLunc || +ev.amount || 0,
        usd: ev.usd != null ? +ev.usd : null,
        wallet: ev.wallet || ev.entity || null,
        txhash: ev.txhash || ev.tx || null,
        timestamp: ev.timestamp || ev.time || null,
        supply: ev.supply != null ? +ev.supply : null,
        source: ev.source || 'bridge',
        truth: DT.LIVE,
        visual: visualScale(+ev.amountLunc || +ev.amount || 0)
      }));
      latest = { truth: DT.LIVE, events };
      return latest;
    } catch (e) {
      latest = { truth: DT.UNAVAILABLE, events: [], reason: String(e.message || e) };
      return latest;
    }
  }

  function getLatest() { return latest; }

  LB.burns = { refresh, getLatest, visualScale };
})(window);
