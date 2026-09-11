/* Whale hunter — LIVE/PARTIAL via HTTPS API only; never guess buy/sell */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;
  let latest = { truth: DT.UNAVAILABLE, events: [], reason: 'Whale feed not connected' };

  /** Accept v7.1 envelope {status,truth,data:{events}} AND legacy {truth,events}. */
  function unwrap(data) {
    const truth = data.truth || DT.LIVE;
    const eventsRaw =
      (data.data && Array.isArray(data.data.events) && data.data.events) ||
      (Array.isArray(data.events) && data.events) ||
      (Array.isArray(data) ? data : []);
    const reason = data.error || data.reason || null;
    return { truth, eventsRaw, reason, source: data.source || data.sourceLabel || null };
  }

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
      const { truth, eventsRaw, reason, source } = unwrap(data);
      const events = eventsRaw.map(ev => ({
        amount: +ev.amount || 0,
        usd: ev.usd != null ? +ev.usd : null,
        wallet: ev.wallet || ev.from || null,
        txhash: ev.txhash || ev.tx || null,
        direction: ev.direction || 'unknown',
        classification: ev.classification || 'unknown whale movement',
        timestamp: ev.timestamp || null,
        confidence: ev.confidence || null,
        source: ev.source || source || 'bridge',
        truth: ev.truth || truth || DT.LIVE
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
  LB.whales = { refresh, getLatest };
})(window);
