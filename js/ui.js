/* HUD — RTS Command (v8.7): primary strip, Battle Strength, intel, data-health */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;

  /** Rolling LIVE liquidation events (max ~80, 10 min window). */
  const liqEvents = [];
  const LIQ_TTL_MS = 10 * 60 * 1000;

  // Throttle bookkeeping — avoid DOM thrash from WS ticks
  const throttle = {
    primaryAt: 0,
    strengthAt: 0,
    intelAt: 0,
    healthAt: 0,
    PRIMARY_MS: 120,
    STRENGTH_MS: 400,
    INTEL_MS: 800,
    HEALTH_MS: 500
  };

  const healthState = {
    priceLive: false,
    priceSource: 'Simulation',
    priceAgeMs: null,
    depthLive: false,
    depthLabel: 'Unavailable',
    depthAgeMs: null,
    geckoOk: null,
    binanceOk: null,
    apiOk: null,
    reconnecting: false,
    backendExpected: false,
    backendOffline: false,
    token: 'LUNC'
  };

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
      side: side,
      amount: ev.amount != null ? +ev.amount : null,
      usd: ev.usd != null ? +ev.usd : null,
      timestamp: ev.timestamp || now,
      ts: now,
      source: ev.source || 'Binance Futures',
      truth: DT.LIVE,
      classification: classification,
      live: true
    };
    liqEvents.push(entry);
    pruneLiqs(now);
    if (LB.warRoom && typeof LB.warRoom.pushLiquidation === 'function') {
      LB.warRoom.pushLiquidation(entry);
    }
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
    liqEvents.forEach(function (e) {
      const u = e.usd || 0;
      if (e.classification === 'LONG_LIQ') longUsd += u;
      else if (e.classification === 'SHORT_LIQ') shortUsd += u;
    });
    const tot = longUsd + shortUsd;
    if (!(tot > 0)) return { bias: null, truth: DT.UNAVAILABLE, longUsd: longUsd, shortUsd: shortUsd };
    const bias = Math.max(-1, Math.min(1, (shortUsd - longUsd) / tot));
    return { bias: bias, truth: DT.LIVE, longUsd: longUsd, shortUsd: shortUsd };
  }

  function computeBurnBias(burns) {
    if (!burns || burns.truth !== DT.LIVE || !burns.events || !burns.events.length) {
      return { bias: null, truth: (burns && burns.truth) || DT.UNAVAILABLE };
    }
    let score = 0;
    burns.events.slice(0, 12).forEach(function (ev) {
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

  /** Battle Strength contributions only count LIVE / CALCULATED. */
  function contributesToStrength(t) {
    return t === DT.LIVE || t === DT.CALCULATED;
  }

  function computeBattleStrength(input) {
    const parts = [];
    let bull = 50;
    function add(name, truth, bullDelta, detail) {
      const ok = contributesToStrength(truth);
      const delta = ok ? (bullDelta || 0) : 0;
      parts.push({
        name: name,
        truth: truth || DT.UNAVAILABLE,
        bullDelta: delta,
        detail: detail || null,
        contributes: ok
      });
      bull += delta;
    }

    if (input && input.momentum != null && input.momentumTruth) {
      add('Momentum', input.momentumTruth, contributesToStrength(input.momentumTruth) ? input.momentum * 20 : 0,
        'Δ ' + (input.momentum >= 0 ? '+' : '') + Number(input.momentum).toFixed(3));
    } else add('Momentum', DT.UNAVAILABLE, 0);

    if (input && input.bookImbalance != null && input.bookTruth) {
      add('Order Book', input.bookTruth, contributesToStrength(input.bookTruth) ? input.bookImbalance * 15 : 0,
        'imb ' + Number(input.bookImbalance).toFixed(3));
    } else add('Order Book', DT.UNAVAILABLE, 0);

    if (input && input.volumeUsd != null && input.volumeTruth && usableTruth(input.volumeTruth)) {
      // Volume is informational — no fabricated direction
      add('Volume', contributesToStrength(input.volumeTruth) ? input.volumeTruth : DT.UNAVAILABLE, 0,
        '$' + (input.volumeUsd >= 1e6
          ? (input.volumeUsd / 1e6).toFixed(2) + 'M'
          : (input.volumeUsd / 1e3).toFixed(0) + 'K'));
    } else add('Volume', (input && input.volumeTruth) || DT.UNAVAILABLE, 0);

    if (input && input.liqBias != null && input.liqTruth && contributesToStrength(input.liqTruth)) {
      add('Liqs', input.liqTruth, input.liqBias * 10, input.liqDetail || null);
    } else add('Liqs', (input && input.liqTruth) || DT.UNAVAILABLE, 0);

    if (input && input.whaleBias != null && input.whaleTruth && contributesToStrength(input.whaleTruth)) {
      add('Whales', input.whaleTruth, input.whaleBias * 10);
    } else add('Whales', (input && input.whaleTruth) || DT.UNAVAILABLE, 0);

    if (input && input.burnBias != null && input.burnTruth && contributesToStrength(input.burnTruth)) {
      add('Burns', input.burnTruth, input.burnBias * 8);
    } else add('Burns', (input && input.burnTruth) || DT.UNAVAILABLE, 0);

    if (input && input.fundingBias != null && input.fundingTruth && contributesToStrength(input.fundingTruth)) {
      add('Funding', input.fundingTruth, input.fundingBias * 5);
    } else add('Funding', DT.UNAVAILABLE, 0);

    if (input && input.oiBias != null && input.oiTruth && contributesToStrength(input.oiTruth)) {
      add('OI', input.oiTruth, input.oiBias * 6);
    } else add('OI', DT.UNAVAILABLE, 0);

    if (input && input.ecosystemBias != null && input.ecosystemTruth && contributesToStrength(input.ecosystemTruth)) {
      add('Ecosystem', input.ecosystemTruth, input.ecosystemBias * 4, input.ecosystemDetail || null);
    } else add('Ecosystem', (input && input.ecosystemTruth) || DT.UNAVAILABLE, 0);

    bull = Math.max(0, Math.min(100, Math.round(bull)));
    const bear = 100 - bull;
    const state = advantageFromScore(bull, bear);
    return {
      bull: bull,
      bear: bear,
      advantage: state.id,
      advantageState: state,
      parts: parts,
      truth: DT.CALCULATED
    };
  }

  function advantageFromScore(bull, bear) {
    // Icons + text + faction accents (not color-only)
    if (bull >= 70) {
      return { id: 'STRONG_BULL', label: 'STRONG BULL', icon: '▲▲', css: 'strong-bull', side: 'bull' };
    }
    if (bull >= 58) {
      return { id: 'BULL', label: 'BULL', icon: '▲', css: 'bull', side: 'bull' };
    }
    if (bull <= 30) {
      return { id: 'STRONG_BEAR', label: 'STRONG BEAR', icon: '▼▼', css: 'strong-bear', side: 'bear' };
    }
    if (bull <= 42) {
      return { id: 'BEAR', label: 'BEAR', icon: '▼', css: 'bear', side: 'bear' };
    }
    return { id: 'CONTESTED', label: 'CONTESTED', icon: '◆', css: 'contested', side: 'mid' };
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
    return el;
  }

  function renderAdvantage(state) {
    const el = document.getElementById('battleAdvantage');
    if (!el || !state) return;
    el.className = 'advantage ' + state.css;
    el.dataset.state = state.id;
    const icon = el.querySelector('.adv-icon');
    const text = el.querySelector('.adv-text');
    if (icon) icon.textContent = state.icon;
    if (text) text.textContent = state.label;
    else el.textContent = state.icon + ' ' + state.label;
  }

  function renderIntelPanels() {
    const burns = LB.burns.getLatest();
    const whales = LB.whales.getLatest();
    const gov = LB.governance.getLatest();

    const burnsEl = document.getElementById('burnsStatus');
    if (burnsEl) {
      if (burns.truth === DT.LIVE && burns.events && burns.events.length) {
        const top = burns.events[0];
        const amt = top.amountLunc != null ? Number(top.amountLunc) : null;
        const amtStr = amt != null
          ? (amt >= 1e9 ? (amt / 1e9).toFixed(2) + 'B' : amt >= 1e6 ? (amt / 1e6).toFixed(2) + 'M' : amt.toLocaleString())
          : '—';
        burnsEl.innerHTML = '<div class="intel-card burn-card">'
          + '<span class="truth-live">LIVE</span> · ' + burns.events.length + ' events'
          + '<div class="micro">Latest ' + amtStr + ' LUNC'
          + (top.source ? ' · ' + top.source : '') + '</div></div>';
      } else {
        burnsEl.textContent = burns.truth + (burns.reason ? ' — ' + burns.reason : '');
      }
    }

    const whalesEl = document.getElementById('whalesStatus');
    if (whalesEl) {
      if (whales.truth === DT.LIVE && whales.events && whales.events.length) {
        whalesEl.innerHTML = '<div class="intel-card whale-card">'
          + '<span class="truth-live">LIVE</span> · ' + whales.events.length + ' events'
          + '<div class="micro">' + (whales.events[0].classification || 'activity')
          + (whales.events[0].source ? ' · ' + whales.events[0].source : '') + '</div></div>';
      } else {
        whalesEl.textContent = whales.truth + (whales.reason ? ' — ' + whales.reason : '');
      }
    }

    const govEl = document.getElementById('govStatus');
    if (govEl) {
      if (gov.truth === DT.LIVE && gov.proposals && gov.proposals.length) {
        const p = gov.proposals[0];
        govEl.innerHTML = '<div class="intel-card gov-card">'
          + '<span class="truth-live">LIVE</span> · ' + gov.proposals.length + ' proposals'
          + '<div class="micro">' + (p.title || p.id || 'proposal') + '</div></div>';
      } else {
        govEl.textContent = gov.truth + (gov.reason ? ' — ' + gov.reason : '');
      }
    }

    const v = gov.validators || [];
    if (!v.length) {
      setText('validatorsStatus', (gov.truth === DT.LIVE ? DT.UNAVAILABLE : gov.truth)
        + ' — ' + (gov.reason || 'No validator payload yet'));
      const list = document.getElementById('validatorsList');
      if (list) list.innerHTML = '';
    } else {
      setText('validatorsStatus', DT.LIVE + ' · ' + v.length + ' validators');
      const list = document.getElementById('validatorsList');
      if (list) {
        list.innerHTML = v.slice(0, 8).map(function (val) {
          const name = val.name || val.moniker || val.operator_address || 'validator';
          const power = val.votingPower != null ? val.votingPower : (val.tokens != null ? val.tokens : '—');
          return '<div class="row"><span>' + name + '</span><strong>' + power + '</strong></div>';
        }).join('');
      }
    }
  }

  function renderBattleStrength(score, force) {
    const now = Date.now();
    if (!force && now - throttle.strengthAt < throttle.STRENGTH_MS) return;
    throttle.strengthAt = now;

    setText('bullPower', String(score.bull));
    setText('bearPower', String(score.bear));
    renderAdvantage(score.advantageState || advantageFromScore(score.bull, score.bear));

    const partsEl = document.getElementById('strengthParts');
    if (partsEl) {
      partsEl.innerHTML = score.parts.map(function (p) {
        const d = p.bullDelta || 0;
        const sign = d > 0 ? '+' : '';
        let contrib;
        if (!p.contributes) {
          contrib = 'UNAVAILABLE';
        } else if (d === 0) {
          contrib = 'info';
        } else {
          contrib = sign + d.toFixed(1) + ' bull';
        }
        const detail = p.detail ? ' · ' + p.detail : '';
        const truthClass = 'truth-' + String(p.truth).toLowerCase();
        return '<div class="row strength-part' + (p.contributes ? '' : ' unavailable') + '">'
          + '<span>' + p.name + detail + '</span>'
          + '<strong class="' + truthClass + '">' + (p.contributes ? p.truth : 'UNAVAILABLE')
          + ' <span class="micro">(' + contrib + ')</span></strong></div>';
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
      whales.events.slice(0, 10).forEach(function (ev) {
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
      const fmt = function (u) { return u >= 1e6 ? (u / 1e6).toFixed(2) + 'M' : (u / 1e3).toFixed(0) + 'K'; };
      liqDetail = 'L $' + fmt(liq.longUsd) + ' / S $' + fmt(liq.shortUsd);
    }

    // Ecosystem: only when TVL truth is LIVE (set by battle-engine / feeds)
    let ecosystemBias = null;
    let ecosystemTruth = LB.ui.lastEcosystemTruth || DT.UNAVAILABLE;
    let ecosystemDetail = LB.ui.lastEcosystemDetail || null;
    if (ecosystemTruth === DT.LIVE && LB.ui.lastEcosystemBias != null) {
      ecosystemBias = LB.ui.lastEcosystemBias;
    } else {
      ecosystemTruth = DT.UNAVAILABLE;
      ecosystemBias = null;
    }

    // JURIS: never invent book / liq contributions
    const token = healthState.token || 'LUNC';
    let bookImbalance = LB.ui.lastBookImbalance;
    let bookTruth = LB.ui.lastBookTruth;
    let liqBias = liq.bias;
    let liqTruth = liq.truth;
    if (token === 'JURIS') {
      bookImbalance = null;
      bookTruth = DT.UNAVAILABLE;
      liqBias = null;
      liqTruth = DT.UNAVAILABLE;
    }

    const score = computeBattleStrength({
      momentum: LB.ui.lastMomentum,
      momentumTruth: LB.ui.lastMomentumTruth,
      bookImbalance: bookImbalance,
      bookTruth: bookTruth,
      whaleBias: whaleBias,
      whaleTruth: whaleTruth,
      burnBias: burn.bias,
      burnTruth: burn.truth,
      liqBias: liqBias,
      liqTruth: liqTruth,
      liqDetail: liqDetail,
      volumeUsd: volumeUsd,
      volumeTruth: volumeTruth,
      oiBias: null,
      oiTruth: DT.UNAVAILABLE,
      fundingBias: null,
      fundingTruth: DT.UNAVAILABLE,
      ecosystemBias: ecosystemBias,
      ecosystemTruth: ecosystemTruth,
      ecosystemDetail: ecosystemDetail
    });
    renderBattleStrength(score);
    return score;
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

  function ageLabel(ms) {
    if (ms == null || !(ms >= 0)) return '—';
    if (ms < 1500) return '1s';
    if (ms < 2500) return Math.round(ms / 1000) + 's';
    if (ms < 60000) return Math.round(ms / 1000) + 's';
    return Math.round(ms / 60000) + 'm';
  }

  function computeDataHealth() {
    const h = healthState;
    // CoinGecko fail ≠ total failure if Binance ok
    if (h.backendExpected && h.backendOffline && !h.binanceOk && !h.priceLive) {
      return { id: 'BACKEND_OFFLINE', label: 'BACKEND OFFLINE', css: 'offline' };
    }
    if (h.reconnecting) {
      return { id: 'RECONNECTING', label: 'RECONNECTING', css: 'reconnecting' };
    }
    const priceOk = !!h.priceLive;
    const depthOk = !!h.depthLive;
    if (priceOk && depthOk && (h.binanceOk || h.apiOk)) {
      return { id: 'ALL_LIVE', label: 'ALL SYSTEMS LIVE', css: 'all-live' };
    }
    if (priceOk && !depthOk) {
      return { id: 'PARTIAL', label: 'PARTIAL DATA', css: 'partial' };
    }
    if (priceOk || h.binanceOk) {
      return { id: 'PARTIAL', label: 'PARTIAL DATA', css: 'partial' };
    }
    if (!priceOk && !depthOk) {
      return { id: 'DEGRADED', label: 'DEGRADED', css: 'degraded' };
    }
    return { id: 'PARTIAL', label: 'PARTIAL DATA', css: 'partial' };
  }

  function renderSourceFreshness() {
    const h = healthState;
    const bits = [];
    if (h.depthLive && /binance/i.test(h.depthLabel || '')) {
      bits.push('BINANCE');
      bits.push('LIVE');
      bits.push(ageLabel(h.depthAgeMs));
    } else if (h.priceLive) {
      bits.push(String(h.priceSource || 'FEED').toUpperCase());
      // Stale downgrade
      if (h.priceAgeMs != null && h.priceAgeMs > 15000) {
        bits.push('STALE');
        bits.push(ageLabel(h.priceAgeMs));
      } else {
        bits.push('LIVE');
        bits.push(ageLabel(h.priceAgeMs));
      }
    } else {
      bits.push('SIM');
      bits.push('NO LIVE FEED');
    }
    setText('sourceFreshness', bits.join(' · '));
  }

  function renderDataHealth(force) {
    const now = Date.now();
    if (!force && now - throttle.healthAt < throttle.HEALTH_MS) return;
    throttle.healthAt = now;
    const dh = computeDataHealth();
    const el = document.getElementById('dataHealth');
    if (el) {
      el.textContent = dh.label;
      el.className = 'data-health ' + dh.css;
      el.dataset.state = dh.id;
    }
    // Compact status tray mirrors health
    const mode = document.getElementById('dataMode');
    if (mode) {
      const live = healthState.priceLive;
      const label = live
        ? ('LIVE · ' + String(healthState.priceSource || '').toUpperCase())
        : 'SIMULATION — price not live';
      if (mode.textContent !== label) mode.textContent = label;
      mode.className = live ? 'live' : 'error';
      if (dh.id === 'RECONNECTING') mode.className = 'error';
      if (dh.id === 'BACKEND_OFFLINE') mode.className = 'error';
    }
    renderSourceFreshness();
    const agent = document.getElementById('agentStatus');
    if (agent) {
      const build = (LB.config && LB.config.BUILD) || '';
      const depth = healthState.depthLive
        ? (healthState.depthLabel || 'Depth LIVE')
        : 'Estimated walls (NOT live order book)';
      const next = 'Depth: ' + depth + ' · ' + build;
      if (agent.textContent !== next) agent.textContent = next;
    }
  }

  function updateHealthInput( partial ) {
    if (!partial) return;
    Object.keys(partial).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(healthState, k)) healthState[k] = partial[k];
    });
    renderDataHealth();
  }

  function renderLiquidityBands(zones, sourceLabel, opts) {
    const el = document.getElementById('liquidityZones');
    if (!el) return;
    opts = opts || {};
    const noBook = opts.noBook || healthState.token === 'JURIS';
    if (noBook) {
      el.innerHTML = '<div class="micro">UNAVAILABLE — no Binance book for this token</div>';
      return;
    }
    if (!zones || zones.truth === 'UNAVAILABLE' || zones.truth === DT.UNAVAILABLE) {
      el.textContent = 'UNAVAILABLE — no live order book';
      return;
    }
    const fmt = function (u) {
      if (u == null) return '—';
      return u >= 1e6 ? '$' + (u / 1e6).toFixed(2) + 'M' : '$' + (u / 1e3).toFixed(0) + 'K';
    };
    const shortName = function (z) {
      const id = z.id || '';
      if (id === 'immediate') return 'Immediate';
      if (id === 'near') return 'Near';
      if (id === 'major') return 'Major';
      if (id === 'deep') return 'Deep';
      return (z.label || id).replace(' defense', '').replace(' wall', '').replace(' liquidity', '');
    };
    const cell = function (z) {
      const name = shortName(z);
      if (z.truth === 'UNAVAILABLE' || z.truth === DT.UNAVAILABLE) {
        return '<span class="liq-band unavailable"><em>' + name + '</em> UNAVAILABLE</span>';
      }
      if (z.truth === 'PARTIAL' || z.truth === DT.PARTIAL) {
        return '<span class="liq-band partial" title="PARTIAL — less authoritative"><em>' + name + '</em> '
          + fmt(z.usd) + ' <span class="qual est">PARTIAL</span></span>';
      }
      return '<span class="liq-band"><em>' + name + '</em> ' + fmt(z.usd)
        + ' <span class="qual live">' + (z.truth || 'CALC') + '</span></span>';
    };
    const row = function (side) {
      return (zones[side] || []).map(cell).join('');
    };
    const cover = 'bid≤' + (zones.maxBidPct || 0).toFixed(2) + '% · ask≤' + (zones.maxAskPct || 0).toFixed(2) + '%';
    const src = sourceLabel || zones.sourceLabel || 'Unknown';
    const liveDepth = !!healthState.depthLive;
    let badge;
    if (!liveDepth) {
      badge = '<span class="qual est">(ESTIMATED · not live book)</span>';
    } else if (zones.truth === 'PARTIAL' || zones.truth === DT.PARTIAL) {
      badge = '<span class="qual est">(PARTIAL · ' + src + ')</span>';
    } else {
      badge = '<span class="qual live">(LIVE · ' + src + ')</span>';
    }
    el.innerHTML = '<div class="micro">' + badge + ' · coverage ' + cover + '</div>'
      + '<div class="liq-side"><span class="micro bull">Bid</span> ' + row('bids') + '</div>'
      + '<div class="liq-side"><span class="micro bear">Ask</span> ' + row('asks') + '</div>';
  }

  function updateFrontlineHud(info) {
    if (!info) return;
    const now = Date.now();
    if (now - throttle.primaryAt < throttle.PRIMARY_MS) {
      // Still allow range text through at lower rate via battle-engine direct writes
    }
    throttle.primaryAt = now;
    const dec = info.decimals != null ? info.decimals : 8;
    const detail = document.getElementById('frontlineDetail');
    if (!detail) return;
    const px = info.price;
    const levels = info.levels || [];
    let nearestContested = null;
    let below = null;
    let above = null;
    for (let i = 0; i < levels.length; i++) {
      const lv = levels[i];
      const p = typeof lv === 'number' ? lv : (lv.price != null ? lv.price : lv);
      if (!(p > 0)) continue;
      if (p <= px) below = p;
      if (p >= px && above == null) above = p;
      const own = (typeof lv === 'object' && lv.ownership) || null;
      if (own === 'contested' || (Math.abs(p - px) / (px || 1) < 0.002)) {
        if (!nearestContested || Math.abs(p - px) < Math.abs(nearestContested - px)) {
          nearestContested = p;
        }
      }
    }
    const bits = [];
    bits.push('Front $' + (px > 0 ? Number(px).toFixed(dec) : '—'));
    if (below != null) bits.push('▼ $' + Number(below).toFixed(dec));
    if (above != null && above !== below) bits.push('▲ $' + Number(above).toFixed(dec));
    if (nearestContested != null) bits.push('contested ~$' + Number(nearestContested).toFixed(dec));
    detail.textContent = bits.join(' · ');
  }

  function clearForTokenSwitch(token) {
    healthState.token = token || healthState.token;
    healthState.priceLive = false;
    healthState.depthLive = false;
    healthState.priceAgeMs = null;
    healthState.depthAgeMs = null;
    healthState.reconnecting = false;
    LB.ui.lastMomentum = 0;
    LB.ui.lastMomentumTruth = DT.UNAVAILABLE;
    LB.ui.lastBookImbalance = 0;
    LB.ui.lastBookTruth = DT.UNAVAILABLE;
    LB.ui.lastZones = null;
    LB.ui.lastVolumeUsd = null;
    LB.ui.lastVolumeTruth = DT.UNAVAILABLE;
    LB.ui.lastChange24h = null;
    LB.ui.lastChangeTruth = DT.UNAVAILABLE;
    LB.ui.lastEcosystemBias = null;
    LB.ui.lastEcosystemTruth = DT.UNAVAILABLE;
    LB.ui.lastEcosystemDetail = null;
    liqEvents.length = 0;

    setText('priceChange', '24h —');
    setText('marketCap', '$—');
    setText('marketRank', '—');
    setText('marketVolume', '$—');
    setText('marketSupply', '—');
    const lz = document.getElementById('liquidityZones');
    if (lz) {
      lz.textContent = token === 'JURIS'
        ? 'UNAVAILABLE — no Binance book for JURIS'
        : 'UNAVAILABLE — waiting for live book';
    }
    setText('frontlineDetail', 'Frontline —');
    renderDataHealth(true);
    tickStrength();
  }

  function setPriceChange(changePct, truth) {
    LB.ui.lastChange24h = changePct;
    LB.ui.lastChangeTruth = truth || DT.UNAVAILABLE;
    const el = document.getElementById('priceChange');
    if (!el) return;
    if (changePct == null || !usableTruth(truth) || truth === DT.UNAVAILABLE) {
      el.textContent = '24h —';
      el.className = 'micro price-change';
      return;
    }
    const sign = changePct >= 0 ? '+' : '';
    el.textContent = '24h ' + sign + Number(changePct).toFixed(2) + '% · ' + truth;
    el.className = 'micro price-change ' + (changePct >= 0 ? 'up' : 'down');
  }

  function initHudChrome() {
    const tabs = document.getElementById('hudTabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        const btn = e.target.closest('[data-panel]');
        if (!btn) return;
        const panel = btn.getAttribute('data-panel');
        tabs.querySelectorAll('[data-panel]').forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        document.body.setAttribute('data-hud-panel', panel);
      });
      document.body.setAttribute('data-hud-panel', 'command');
    }

    // Secondary drawer toggles
    document.querySelectorAll('[data-drawer-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-drawer-toggle');
        const body = document.getElementById(id);
        if (!body) return;
        const open = body.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    // Wire VIEW EVENT → optional camera focus via war room
    if (LB.warRoom && LB.warRoom.setViewEventHandler) {
      LB.warRoom.setViewEventHandler(function (ev) {
        // Prefer frontline focus for territory / liq; never invent world coords
        try {
          const mm = document.querySelector('.minimap-focus [data-focus="front"]');
          if (mm) mm.click();
        } catch (_) {}
        if (ev && ev.headline) {
          // Soft highlight already in card; no console noise
        }
      });
    }

    const buildLabel = document.getElementById('buildLabel');
    if (buildLabel && LB.config) buildLabel.textContent = LB.config.BUILD;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHudChrome);
  } else {
    initHudChrome();
  }

  LB.ui = {
    computeBattleStrength: computeBattleStrength,
    advantageFromScore: advantageFromScore,
    renderIntelPanels: renderIntelPanels,
    renderBattleStrength: renderBattleStrength,
    refreshAuxFeeds: refreshAuxFeeds,
    tickStrength: tickStrength,
    recordLiquidation: recordLiquidation,
    getRecentLiquidations: getRecentLiquidations,
    computeLiqBias: computeLiqBias,
    updateHealthInput: updateHealthInput,
    renderDataHealth: renderDataHealth,
    renderLiquidityBands: renderLiquidityBands,
    updateFrontlineHud: updateFrontlineHud,
    clearForTokenSwitch: clearForTokenSwitch,
    setPriceChange: setPriceChange,
    initHudChrome: initHudChrome,
    lastMomentum: 0,
    lastMomentumTruth: DT.UNAVAILABLE,
    lastBookImbalance: 0,
    lastBookTruth: DT.UNAVAILABLE,
    lastZones: null,
    lastVolumeUsd: null,
    lastVolumeTruth: DT.UNAVAILABLE,
    lastDepthSourceLabel: 'Unavailable',
    lastChange24h: null,
    lastChangeTruth: DT.UNAVAILABLE,
    lastEcosystemBias: null,
    lastEcosystemTruth: DT.UNAVAILABLE,
    lastEcosystemDetail: null,
    version: 'v8.7'
  };
})(window);
