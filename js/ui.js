/* HUD helpers — Battle Strength (fast) + intel panels (slow) */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;

  /** Rolling LIVE liquidation events (max ~80, 10 min window). */
  const liqEvents = [];
  const LIQ_TTL_MS = 10 * 60 * 1000;

  function pruneLiqs(now) {
    now = now || Date.now();
    while (liqEvents.length && now - liqEvents[0].ts > LIQ_TTL_MS) liqEvents.shift();
    while (liqEvents.length > 80) liqEvents.shift();
  }

  /**
   * Binance futures forceOrder: S=SELL ⇒ longs liquidated (bearish);
   * S=BUY ⇒ shorts liquidated (bullish).
   */
  function recordLiquidation(ev) {
    const now = Date.now();
    const side = String(ev.side || '').toUpperCase();
    const classification = side === 'SELL' ? 'LONG_LIQ' : (side === 'BUY' ? 'SHORT_LIQ' : 'UNKNOWN');
    const entry = {
      symbol: ev.symbol || null,
      side,
      amount: ev.amount != null ? +ev.amount : null,
      usd: ev.usd != null ? +ev.usd : null,
      timestamp: ev.timestamp || now,
      ts: now,
      source: ev.source || 'Binance Futures',
      truth: DT.LIVE,
      classification,
      live: true
    };
    liqEvents.push(entry);
    pruneLiqs(now);
    return entry;
  }

  function getRecentLiquidations() {
    pruneLiqs();
    return liqEvents.slice();
  }

  function computeLiqBias() {
    pruneLiqs();
    if (!liqEvents.length) return { bias: null, truth: DT.UNAVAILABLE, longUsd: 0, shortUsd: 0 };
    let longUsd = 0, shortUsd = 0;
    liqEvents.forEach(e => {
      const u = e.usd || 0;
      if (e.classification === 'LONG_LIQ') longUsd += u;
      else if (e.classification === 'SHORT_LIQ') shortUsd += u;
    });
    const tot = longUsd + shortUsd;
    if (!(tot > 0)) return { bias: null, truth: DT.UNAVAILABLE, longUsd, shortUsd };
    // Short liqs help bulls; long liqs help bears → bias in [-1,1]
    const bias = Math.max(-1, Math.min(1, (shortUsd - longUsd) / tot));
    return { bias, truth: DT.LIVE, longUsd, shortUsd };
  }

  function computeBurnBias(burns) {
    if (!burns || burns.truth !== DT.LIVE || !burns.events || !burns.events.length) {
      return { bias: null, truth: (burns && burns.truth) || DT.UNAVAILABLE };
    }
    // Recent LIVE burns → modest bullish (supply reduction). Cap by size.
    let score = 0;
    burns.events.slice(0, 12).forEach(ev => {
      const amt = +ev.amountLunc || 0;
      if (amt >= 1e9) score += 0.35;
      else if (amt >= 1e8) score += 0.22;
      else if (amt >= 1e7) score += 0.12;
      else if (amt >= 1e6) score += 0.06;
      else if (amt >= 1e5) score += 0.02;
    });
    return { bias: Math.max(0, Math.min(1, score)), truth: DT.LIVE };
  }

  function usableTruth(t) {
    return t === DT.LIVE || t === DT.CALCULATED || t === DT.ESTIMATED || t === DT.PARTIAL;
  }

  function computeBattleStrength(input) {
    const parts = [];
    let bull = 50;
    function add(name, truth, bullDelta, detail) {
      const applied = usableTruth(truth) ? (bullDelta || 0) : 0;
      // PARTIAL inputs get half weight
      const weight = truth === DT.PARTIAL ? 0.5 : 1;
      const delta = applied * weight;
      parts.push({
        name,
        truth: truth || DT.UNAVAILABLE,
        bullDelta: delta,
        detail: detail || null,
        contributes: usableTruth(truth)
      });
      bull += delta;
    }

    if (input && input.momentum != null && input.momentumTruth) {
      add('price momentum', input.momentumTruth, input.momentum * 20,
        'Δ ' + (input.momentum >= 0 ? '+' : '') + Number(input.momentum).toFixed(3));
    } else add('price momentum', DT.UNAVAILABLE, 0);

    if (input && input.bookImbalance != null && input.bookTruth) {
      add('order-book imbalance', input.bookTruth, input.bookImbalance * 15,
        'imb ' + Number(input.bookImbalance).toFixed(3));
    } else add('order-book imbalance', DT.UNAVAILABLE, 0);

    if (input && input.whaleBias != null && input.whaleTruth) {
      add('whale activity', input.whaleTruth, input.whaleBias * 10);
    } else add('whale activity', DT.UNAVAILABLE, 0);

    if (input && input.burnBias != null && input.burnTruth && usableTruth(input.burnTruth)) {
      add('burn activity', input.burnTruth, input.burnBias * 8);
    } else add('burn activity', (input && input.burnTruth) || DT.UNAVAILABLE, 0);

    if (input && input.liqBias != null && input.liqTruth && usableTruth(input.liqTruth)) {
      add('liquidations', input.liqTruth, input.liqBias * 10,
        input.liqDetail || null);
    } else add('liquidations', (input && input.liqTruth) || DT.UNAVAILABLE, 0);

    // Volume: show when LIVE but do not invent bull/bear direction from volume alone
    if (input && input.volumeUsd != null && input.volumeTruth && usableTruth(input.volumeTruth)) {
      add('volume 24h', input.volumeTruth, 0,
        '$' + (input.volumeUsd >= 1e6
          ? (input.volumeUsd / 1e6).toFixed(2) + 'M'
          : (input.volumeUsd / 1e3).toFixed(0) + 'K'));
    } else add('volume 24h', (input && input.volumeTruth) || DT.UNAVAILABLE, 0);

    // OI / funding only when a trustworthy source exists (none wired → UNAVAILABLE)
    if (input && input.oiBias != null && input.oiTruth && usableTruth(input.oiTruth)) {
      add('open interest', input.oiTruth, input.oiBias * 6);
    } else add('open interest', DT.UNAVAILABLE, 0);

    if (input && input.fundingBias != null && input.fundingTruth && usableTruth(input.fundingTruth)) {
      add('funding', input.fundingTruth, input.fundingBias * 5);
    } else add('funding', DT.UNAVAILABLE, 0);

    bull = Math.max(0, Math.min(100, Math.round(bull)));
    const bear = 100 - bull;
    const advantage = bull === bear ? 'EVEN' : (bull > bear ? 'BULLS' : 'BEARS');
    return { bull, bear, advantage, parts, truth: DT.CALCULATED };
  }

  function renderIntelPanels() {
    const burns = LB.burns.getLatest();
    const whales = LB.whales.getLatest();
    const gov = LB.governance.getLatest();
    const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    set('burnsStatus', burns.truth + (burns.reason ? ' — ' + burns.reason : (burns.events && burns.events.length ? ' · ' + burns.events.length + ' events' : '')));
    set('whalesStatus', whales.truth + (whales.reason ? ' — ' + whales.reason : (whales.events && whales.events.length ? ' · ' + whales.events.length + ' events' : '')));
    set('govStatus', gov.truth + (gov.reason ? ' — ' + gov.reason : (gov.proposals && gov.proposals.length ? ' · ' + gov.proposals.length + ' proposals' : '')));
    const v = gov.validators || [];
    if (!v.length) {
      set('validatorsStatus', (gov.truth === DT.LIVE ? DT.UNAVAILABLE : gov.truth) + ' — ' + (gov.reason || 'No validator payload yet'));
    } else {
      set('validatorsStatus', DT.LIVE + ' · ' + v.length + ' validators');
      const list = document.getElementById('validatorsList');
      if (list) {
        list.innerHTML = v.slice(0, 8).map(val => {
          const name = val.name || val.moniker || val.operator_address || 'validator';
          const power = val.votingPower != null ? val.votingPower : (val.tokens != null ? val.tokens : '—');
          return '<div class="row"><span>' + name + '</span><strong>' + power + '</strong></div>';
        }).join('');
      }
    }
  }

  function renderBattleStrength(score) {
    const bullEl = document.getElementById('bullPower');
    const bearEl = document.getElementById('bearPower');
    const advEl = document.getElementById('battleAdvantage');
    const partsEl = document.getElementById('strengthParts');
    if (bullEl) bullEl.textContent = String(score.bull);
    if (bearEl) bearEl.textContent = String(score.bear);
    if (advEl) advEl.textContent = score.advantage;
    if (partsEl) {
      partsEl.innerHTML = score.parts.map(p => {
        const d = p.bullDelta || 0;
        const sign = d > 0 ? '+' : '';
        const contrib = p.contributes
          ? (d === 0 ? '· info' : (sign + d.toFixed(1) + ' bull'))
          : 'excluded';
        const detail = p.detail ? ' · ' + p.detail : '';
        return '<div class="row"><span>' + p.name + detail + '</span><strong class="truth-' +
          String(p.truth).toLowerCase() + '">' + p.truth + ' <span class="micro">(' + contrib + ')</span></strong></div>';
      }).join('');
    }
  }

  function tickStrength() {
    const burns = LB.burns.getLatest();
    const whales = LB.whales.getLatest();
    let whaleBias = null, whaleTruth = DT.UNAVAILABLE;
    if (whales && whales.truth === DT.LIVE && whales.events && whales.events.length) {
      whaleTruth = DT.LIVE;
      whaleBias = 0;
      whales.events.slice(0, 10).forEach(ev => {
        const c = (ev.classification || '').toLowerCase();
        if (c.includes('buy') || c.includes('withdraw')) whaleBias += 0.15;
        if (c.includes('sell') || c.includes('deposit')) whaleBias -= 0.15;
      });
      whaleBias = Math.max(-1, Math.min(1, whaleBias));
    }

    const burn = computeBurnBias(burns);
    const liq = computeLiqBias();
    const mkt = LB.market && LB.market.getState ? LB.market.getState() : null;
    const volumeUsd = (mkt && mkt.volume24h != null) ? mkt.volume24h
      : (LB.ui.lastVolumeUsd != null ? LB.ui.lastVolumeUsd : null);
    const volumeTruth = (mkt && mkt.volumeTruth) || LB.ui.lastVolumeTruth || DT.UNAVAILABLE;

    let liqDetail = null;
    if (liq.truth === DT.LIVE) {
      const fmt = u => u >= 1e6 ? (u / 1e6).toFixed(2) + 'M' : (u / 1e3).toFixed(0) + 'K';
      liqDetail = 'L $' + fmt(liq.longUsd) + ' / S $' + fmt(liq.shortUsd);
    }

    const score = computeBattleStrength({
      momentum: LB.ui.lastMomentum,
      momentumTruth: LB.ui.lastMomentumTruth,
      bookImbalance: LB.ui.lastBookImbalance,
      bookTruth: LB.ui.lastBookTruth,
      whaleBias,
      whaleTruth,
      burnBias: burn.bias,
      burnTruth: burn.truth,
      liqBias: liq.bias,
      liqTruth: liq.truth,
      liqDetail,
      volumeUsd,
      volumeTruth,
      oiBias: null,
      oiTruth: DT.UNAVAILABLE,
      fundingBias: null,
      fundingTruth: DT.UNAVAILABLE
    });
    renderBattleStrength(score);
  }

  async function refreshAuxFeeds() {
    await Promise.all([
      LB.burns.refresh(),
      LB.whales.refresh(),
      LB.governance.refreshProposals(),
      LB.governance.refreshValidators()
    ]);
    renderIntelPanels();
    tickStrength();
  }

  LB.ui = {
    computeBattleStrength,
    renderIntelPanels,
    renderBattleStrength,
    refreshAuxFeeds,
    tickStrength,
    recordLiquidation,
    getRecentLiquidations,
    computeLiqBias,
    lastMomentum: 0,
    lastMomentumTruth: DT.UNAVAILABLE,
    lastBookImbalance: 0,
    lastBookTruth: DT.UNAVAILABLE,
    lastZones: null,
    lastVolumeUsd: null,
    lastVolumeTruth: DT.UNAVAILABLE,
    lastDepthSourceLabel: 'Unavailable'
  };
})(window);
