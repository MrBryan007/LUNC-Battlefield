/* Real burn feed — LIVE/PARTIAL via HTTPS API; never silent-sim as live */
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

  /** Accept v7.1 envelope {status,truth,data:{events}} AND legacy {truth,events}. */
  function unwrap(data) {
    const truth = data.truth || DT.LIVE;
    const eventsRaw =
      (data.data && Array.isArray(data.data.events) && data.data.events) ||
      (Array.isArray(data.events) && data.events) ||
      (Array.isArray(data) ? data : []);
    const reason = data.error || data.reason || (data.data && data.data.note) || null;
    return { truth, eventsRaw, reason, source: data.source || data.sourceLabel || null };
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
      const { truth, eventsRaw, reason, source } = unwrap(data);
      const events = eventsRaw.map(ev => ({
        amountLunc: +ev.amountLunc || +ev.amount || 0,
        usd: ev.usd != null ? +ev.usd : null,
        wallet: ev.wallet || ev.entity || null,
        txhash: ev.txhash || ev.tx || null,
        timestamp: ev.timestamp || ev.time || null,
        supply: ev.supply != null ? +ev.supply : null,
        source: ev.source || source || 'bridge',
        truth: ev.truth || truth || DT.LIVE,
        visual: ev.visual || visualScale(+ev.amountLunc || +ev.amount || 0)
      }));
      latest = {
        truth: truth || DT.LIVE,
        events,
        reason: truth === DT.UNAVAILABLE || truth === DT.PARTIAL ? reason : null
      };
      return latest;
    } catch (e) {
      latest = { truth: DT.UNAVAILABLE, events: [], reason: String(e.message || e) };
      return latest;
    }
  }

  function getLatest() { return latest; }

  LB.burns = { refresh, getLatest, visualScale };
})(window);
