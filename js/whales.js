/* Whale hunter — LIVE via HTTPS API only */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;
  let latest = { truth: DT.UNAVAILABLE, events: [], reason: 'Whale feed not connected' };

  async function refresh() {
    const base = LB.config.apiBase;
    if (!base) {
      latest = { truth: DT.UNAVAILABLE, events: [], reason: 'Needs HTTPS API (?api=) for whale txs' };
      return latest;
    }
    try {
      const r = await fetch(base + '/whales?limit=20', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const events = (data.events || data || []).map(ev => ({
        amount: +ev.amount || 0,
        usd: ev.usd != null ? +ev.usd : null,
        wallet: ev.wallet || null,
        txhash: ev.txhash || ev.tx || null,
        direction: ev.direction || 'unknown',
        classification: ev.classification || 'unknown whale movement',
        timestamp: ev.timestamp || null,
        confidence: ev.confidence || null,
        source: ev.source || 'bridge',
        truth: DT.LIVE
      }));
      latest = { truth: DT.LIVE, events };
      return latest;
    } catch (e) {
      latest = { truth: DT.UNAVAILABLE, events: [], reason: String(e.message || e) };
      return latest;
    }
  }

  function getLatest() { return latest; }
  LB.whales = { refresh, getLatest };
})(window);
