/* HUD helpers — Battle Strength Score scaffold + intel panels */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;

  function computeBattleStrength(input) {
    // input fields optional; missing → ignored with UNAVAILABLE
    const parts = [];
    let bull = 50, bear = 50;
    function add(name, truth, bullDelta) {
      parts.push({ name, truth, bullDelta: bullDelta || 0 });
      if (truth === DT.LIVE || truth === DT.CALCULATED || truth === DT.ESTIMATED) {
        bull += bullDelta;
      }
    }
    if (input && input.momentum != null && input.momentumTruth) {
      add('price momentum', input.momentumTruth, input.momentum * 20);
    } else add('price momentum', DT.UNAVAILABLE, 0);
    if (input && input.bookImbalance != null && input.bookTruth) {
      add('order-book imbalance', input.bookTruth, input.bookImbalance * 15);
    } else add('order-book imbalance', DT.UNAVAILABLE, 0);
    if (input && input.whaleBias != null && input.whaleTruth) {
      add('whale activity', input.whaleTruth, input.whaleBias * 10);
    } else add('whale activity', DT.UNAVAILABLE, 0);
    if (input && input.burnBias != null && input.burnTruth) {
      add('burn activity', input.burnTruth, input.burnBias * 8);
    } else add('burn activity', DT.UNAVAILABLE, 0);
    if (input && input.liqBias != null && input.liqTruth) {
      add('liquidations', input.liqTruth, input.liqBias * 10);
    } else add('liquidations', DT.UNAVAILABLE, 0);

    bull = Math.max(0, Math.min(100, Math.round(bull)));
    bear = 100 - bull;
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
      partsEl.innerHTML = score.parts.map(p =>
        '<div class="row"><span>' + p.name + '</span><strong class="truth-' + p.truth.toLowerCase() + '">' + p.truth + '</strong></div>'
      ).join('');
    }
  }

  async function refreshAuxFeeds() {
    await Promise.all([
      LB.burns.refresh(),
      LB.whales.refresh(),
      LB.governance.refreshProposals()
    ]);
    renderIntelPanels();
    // Strength uses mostly UNAVAILABLE until feeds exist; momentum filled by engine via LB.ui.lastMomentum
    const score = computeBattleStrength({
      momentum: LB.ui && LB.ui.lastMomentum,
      momentumTruth: LB.ui && LB.ui.lastMomentumTruth,
      bookImbalance: LB.ui && LB.ui.lastBookImbalance,
      bookTruth: LB.ui && LB.ui.lastBookTruth,
      whaleBias: null, whaleTruth: DT.UNAVAILABLE,
      burnBias: null, burnTruth: DT.UNAVAILABLE,
      liqBias: null, liqTruth: DT.UNAVAILABLE
    });
    renderBattleStrength(score);
  }

  LB.ui = {
    computeBattleStrength,
    renderIntelPanels,
    renderBattleStrength,
    refreshAuxFeeds,
    lastMomentum: 0,
    lastMomentumTruth: DT.UNAVAILABLE,
    lastBookImbalance: 0,
    lastBookTruth: DT.UNAVAILABLE
  };
})(window);
