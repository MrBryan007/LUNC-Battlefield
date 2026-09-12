/* War Room — structured event feed cards (v8.7) */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;

  const EventClass = Object.freeze({
    MARKET: 'MARKET',
    PRICE_TERRITORY: 'PRICE TERRITORY',
    LIQUIDATION: 'LIQUIDATION',
    BURN: 'BURN',
    WHALE: 'WHALE',
    GOVERNANCE: 'GOVERNANCE',
    VALIDATOR: 'VALIDATOR',
    NETWORK: 'NETWORK',
    SYSTEM: 'SYSTEM'
  });

  const Importance = Object.freeze({
    INFO: 'INFO',
    NOTABLE: 'NOTABLE',
    MAJOR: 'MAJOR',
    CRITICAL: 'CRITICAL'
  });

  const MAX_EVENTS = 40;
  const events = [];
  let feedEl = null;
  let viewEventHandler = null;
  let lastRenderTs = 0;
  const RENDER_MIN_MS = 80;

  function $(id) { return document.getElementById(id); }

  function ensureFeed() {
    if (!feedEl) feedEl = $('feed');
    return feedEl;
  }

  function inferFromLegacy(text, type) {
    const t = String(text || '');
    const ty = String(type || '').toLowerCase();
    let cls = EventClass.SYSTEM;
    let importance = Importance.INFO;
    let truth = DT.CALCULATED;
    let headline = t;
    let explanation = '';

    if (ty === 'burn' || /burn/i.test(t)) {
      cls = EventClass.BURN;
      importance = /simulated/i.test(t) ? Importance.INFO : Importance.NOTABLE;
      truth = /simulated/i.test(t) ? DT.SIMULATED : (/LIVE/i.test(t) ? DT.LIVE : DT.SIMULATED);
    } else if (ty === 'liq' || /LIVE LIQ/i.test(t) || (ty === 'loss' && /LIQ/i.test(t))) {
      cls = EventClass.LIQUIDATION;
      importance = Importance.NOTABLE;
      truth = DT.LIVE;
      if (/~\$|USD|qty/i.test(t)) {
        const m = t.match(/~?\$[\d.]+[KMB]?/i);
        if (m && /[MB]/i.test(m[0])) importance = Importance.MAJOR;
      }
    } else if (/BREAKOUT|BREAKDOWN|CAPTURE|captured|reclaimed/i.test(t)) {
      cls = EventClass.PRICE_TERRITORY;
      importance = Importance.MAJOR;
      truth = DT.CALCULATED;
    } else if (ty === 'win' && /CAPTURE|switched|connected/i.test(t)) {
      cls = /switched|connected|Battlefield|Public build|HTTPS/i.test(t)
        ? (/connected|order book|Binance/i.test(t) ? EventClass.NETWORK : EventClass.SYSTEM)
        : EventClass.PRICE_TERRITORY;
      importance = /CAPTURE/i.test(t) ? Importance.MAJOR : Importance.INFO;
    } else if (/whale/i.test(t)) {
      cls = EventClass.WHALE;
      importance = Importance.NOTABLE;
    } else if (/gov|proposal/i.test(t)) {
      cls = EventClass.GOVERNANCE;
      importance = Importance.NOTABLE;
    } else if (/validator/i.test(t)) {
      cls = EventClass.VALIDATOR;
      importance = Importance.INFO;
    } else if (/Binance|order book|reconnect|socket|WS|API bridge/i.test(t)) {
      cls = EventClass.NETWORK;
      importance = /disconnect|stale|fail|error/i.test(t) ? Importance.MAJOR : Importance.INFO;
      truth = DT.LIVE;
    } else if (ty === 'info') {
      cls = EventClass.SYSTEM;
    } else if (ty === 'win') {
      cls = EventClass.MARKET;
      importance = Importance.NOTABLE;
    } else if (ty === 'loss') {
      cls = EventClass.MARKET;
      importance = Importance.NOTABLE;
    }

    return {
      type: cls,
      headline: headline,
      explanation: explanation,
      truth: truth,
      importance: importance,
      legacyType: ty
    };
  }

  function normalize(ev) {
    const now = Date.now();
    const inferred = (!ev || (!ev.type && ev.headline == null && ev.text))
      ? inferFromLegacy(ev && (ev.text || ev.headline), ev && ev.legacyType)
      : null;
    const base = Object.assign({}, inferred || {}, ev || {});
    return {
      id: base.id || ('wr-' + now + '-' + Math.random().toString(36).slice(2, 7)),
      timestamp: base.timestamp || now,
      type: base.type || EventClass.SYSTEM,
      headline: base.headline || base.text || 'Event',
      explanation: base.explanation || '',
      token: base.token || null,
      source: base.source || null,
      truth: base.truth || DT.UNAVAILABLE,
      importance: base.importance || Importance.INFO,
      legacyType: base.legacyType || '',
      meta: base.meta || null
    };
  }

  function classCss(type) {
    const key = String(type || '').toUpperCase().replace(/\s+/g, '_');
    return 'wr-' + key.toLowerCase().replace(/_/g, '-');
  }

  function importanceCss(imp) {
    return 'wr-imp-' + String(imp || 'INFO').toLowerCase();
  }

  function typeIcon(type) {
    switch (type) {
      case EventClass.LIQUIDATION: return '⚡';
      case EventClass.BURN: return '🔥';
      case EventClass.WHALE: return '🐋';
      case EventClass.PRICE_TERRITORY: return '⚑';
      case EventClass.GOVERNANCE: return '📜';
      case EventClass.VALIDATOR: return '◇';
      case EventClass.NETWORK: return '◎';
      case EventClass.MARKET: return '▣';
      default: return '▪';
    }
  }

  function fmtTime(ts) {
    try {
      return new Date(ts).toISOString().slice(11, 19) + 'Z';
    } catch (_) {
      return '--:--:--Z';
    }
  }

  function buildCard(ev) {
    const div = document.createElement('div');
    div.className = [
      'feed-item', 'wr-card', classCss(ev.type), importanceCss(ev.importance), ev.legacyType || ''
    ].filter(Boolean).join(' ');
    div.dataset.eventId = ev.id;
    div.dataset.importance = ev.importance;
    div.setAttribute('role', 'article');
    div.setAttribute('aria-label', ev.type + ' ' + ev.headline);

    const head = document.createElement('div');
    head.className = 'wr-head';
    const icon = document.createElement('span');
    icon.className = 'wr-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = typeIcon(ev.type);
    const badge = document.createElement('span');
    badge.className = 'wr-type';
    badge.textContent = ev.type;
    const time = document.createElement('span');
    time.className = 'wr-time';
    time.textContent = fmtTime(ev.timestamp);
    head.appendChild(icon);
    head.appendChild(badge);
    head.appendChild(time);

    const title = document.createElement('div');
    title.className = 'wr-headline';
    title.textContent = ev.headline;

    div.appendChild(head);
    div.appendChild(title);

    if (ev.explanation) {
      const exp = document.createElement('div');
      exp.className = 'wr-explain micro';
      exp.textContent = ev.explanation;
      div.appendChild(exp);
    }

    const meta = document.createElement('div');
    meta.className = 'wr-meta micro';
    const bits = [];
    if (ev.token) bits.push(ev.token);
    if (ev.source) bits.push(ev.source);
    bits.push(String(ev.truth));
    bits.push(String(ev.importance));
    meta.textContent = bits.join(' · ');
    div.appendChild(meta);

    if (ev.importance === Importance.MAJOR || ev.importance === Importance.CRITICAL) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wr-view-btn';
      btn.textContent = 'VIEW EVENT';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof viewEventHandler === 'function') viewEventHandler(ev);
      });
      div.appendChild(btn);
    }

    return div;
  }

  function render(force) {
    const el = ensureFeed();
    if (!el) return;
    const now = Date.now();
    if (!force && now - lastRenderTs < RENDER_MIN_MS) return;
    lastRenderTs = now;
    // Rebuild from newest — throttle keeps this cheap
    const frag = document.createDocumentFragment();
    for (let i = 0; i < events.length; i++) {
      frag.appendChild(buildCard(events[i]));
    }
    el.innerHTML = '';
    el.appendChild(frag);
  }

  function push(ev) {
    const entry = normalize(ev);
    events.unshift(entry);
    while (events.length > MAX_EVENTS) events.pop();
    render(true);
    return entry;
  }

  /** Legacy string feed adapter used by battle-engine. */
  function pushText(text, type) {
    const inferred = inferFromLegacy(text, type);
    return push({
      text: text,
      headline: text,
      legacyType: type || '',
      type: inferred.type,
      truth: inferred.truth,
      importance: inferred.importance,
      explanation: inferred.explanation
    });
  }

  function pushLiquidation(entry) {
    if (!entry || !entry.live) return null;
    const isLong = entry.classification === 'LONG_LIQ';
    const sideLabel = isLong ? 'LONG' : 'SHORT';
    const benefit = isLong ? 'Bears' : 'Bulls';
    const usd = entry.usd != null ? entry.usd : 0;
    let importance = Importance.NOTABLE;
    if (usd >= 250000) importance = Importance.CRITICAL;
    else if (usd >= 50000) importance = Importance.MAJOR;
    const fmt = function (u) {
      if (!(u >= 0)) return '$—';
      if (u >= 1e6) return '$' + (u / 1e6).toFixed(2) + 'M';
      if (u >= 1e3) return '$' + (u / 1e3).toFixed(1) + 'K';
      return '$' + Math.round(u);
    };
    return push({
      type: EventClass.LIQUIDATION,
      headline: 'LIVE LIQ · ' + (entry.symbol || '') + ' · ' + sideLabel + ' · ' + fmt(usd),
      explanation: sideLabel + ' liquidated · ' + benefit + ' benefit · qty ' + (entry.amount != null ? entry.amount : '—'),
      token: entry.symbol || null,
      source: entry.source || 'Binance Futures',
      truth: DT.LIVE,
      importance: importance,
      legacyType: isLong ? 'loss' : 'liq',
      timestamp: entry.timestamp || Date.now(),
      meta: { classification: entry.classification, usd: usd, side: entry.side }
    });
  }

  function clear() {
    events.length = 0;
    const el = ensureFeed();
    if (el) el.innerHTML = '';
  }

  function setViewEventHandler(fn) {
    viewEventHandler = typeof fn === 'function' ? fn : null;
  }

  LB.warRoom = {
    EventClass: EventClass,
    Importance: Importance,
    push: push,
    pushText: pushText,
    pushLiquidation: pushLiquidation,
    clear: clear,
    getEvents: function () { return events.slice(); },
    render: render,
    setViewEventHandler: setViewEventHandler,
    version: 'v8.7'
  };
})(window);
