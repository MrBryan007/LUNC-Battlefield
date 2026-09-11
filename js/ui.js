/* HUD helpers — Battle Strength (fast) + intel panels (slow) */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;

  function computeBattleStrength(input) {
    const parts = [];
    let bull = 50;
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
      partsEl.innerHTML = score.parts.map(p =>
        '<div class="row"><span>' + p.name + '</span><strong class="truth-' + p.truth.toLowerCase() + '">' + p.truth + '</strong></div>'
      ).join('');
    }
  }

  function tickStrength() {
    const burns = LB.burns.getLatest();
    const whales = LB.whales.getLatest();
    let whaleBias = null, whaleTruth = DT.UNAVAILABLE;
    if (burns && burns.truth === DT.LIVE && burns.events && burns.events.length) {
      /* burns are supply-negative / bullish bias small */
    }
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
    const score = computeBattleStrength({
      momentum: LB.ui.lastMomentum,
      momentumTruth: LB.ui.lastMomentumTruth,
      bookImbalance: LB.ui.lastBookImbalance,
      bookTruth: LB.ui.lastBookTruth,
      whaleBias,
      whaleTruth,
      burnBias: null,
      burnTruth: (burns && burns.truth) || DT.UNAVAILABLE,
      liqBias: null,
      liqTruth: DT.UNAVAILABLE
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
    lastMomentum: 0,
    lastMomentumTruth: DT.UNAVAILABLE,
    lastBookImbalance: 0,
    lastBookTruth: DT.UNAVAILABLE,
    lastZones: null
  };
})(window);
