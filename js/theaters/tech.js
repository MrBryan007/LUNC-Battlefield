/* LUNC Battlefield v12.0.3 — v12.1 "War Systems" part 3: tech tree. Game/sim layer.
 * Five techs per side, paid from the war economy stockpile (js/theaters/economy.js), 20 s research each, with prerequisites.
 * Logistics → Field Radar / Rapid Reload → Air Bridge / Fortifications. Effects only touch the game layer (income,
 * recon sweep, Commander cooldowns, supply-drop call, defenses). Never alters price, armies or the frontline. ?tech=0 off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('tech') !== '0' && qs.get('economy') !== '0' && qs.get('theaters') !== '0';
  var RESEARCH_S = 20;
  var TECHS = {
    logistics: { label: 'Logistics', cost: { fuel: 10 }, req: [], tip: 'Economy income ×1.25' },
    radar: { label: 'Field Radar', cost: { intel: 8 }, req: ['logistics'], tip: 'Recon sweep lasts 35 s and covers 3 zones' },
    reload: { label: 'Rapid Reload', cost: { ammo: 12 }, req: ['logistics'], tip: 'Commander cooldowns tick 20 % faster' },
    airbridge: { label: 'Air Bridge', cost: { fuel: 14 }, req: ['radar'], tip: 'Supply-drop call cooldown halved' },
    forts: { label: 'Fortifications', cost: { fuel: 10, ammo: 10 }, req: ['reload'], tip: 'Unlocks bunkers, turrets and walls' }
  };
  var ORDER = ['logistics', 'radar', 'reload', 'airbridge', 'forts'];
  var done = { '-1': {}, '1': {} }, busy = { '-1': null, '1': null };   // busy = { id, t }
  var ready = false, last = 0, uiT = 0, aiT = 25, el = {}, stats = { researched: 0, aiResearched: 0, last: '' };
  function E() { return LB.engine; }
  function ECO() { return LB.economy; }
  function playerSide() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function sideName(s) { return s < 0 ? 'BULL' : 'BEAR'; }
  function radio(side, text) { if (LB.ai && LB.ai.send) try { LB.ai.send({ side: side, type: 'tech', text: text }); } catch (_) {} }
  function has(side, id) { return !!(done[String(side)] || {})[id]; }
  function unlocked(side, id) { return TECHS[id].req.every(function (r) { return has(side, r); }); }
  function affordable(side, id) { var st = ECO() ? ECO().getStock(side) : {}, c = TECHS[id].cost; for (var r in c) if ((st[r] || 0) < c[r]) return false; return true; }
  function status(side, id) { var k = String(side); return has(side, id) ? 'done' : busy[k] && busy[k].id === id ? 'busy' : !unlocked(side, id) ? 'locked' : busy[k] ? 'wait' : affordable(side, id) ? 'ready' : 'poor'; }
  function research(id, side) {
    side = side == null ? playerSide() : side; var k = String(side), me = side === playerSide();
    if (!ready || !TECHS[id] || status(side, id) !== 'ready' || !ECO().pay(side, TECHS[id].cost)) { if (me && LB.sfx && LB.sfx.ui) try { LB.sfx.ui('deny'); } catch (_) {} return false; }
    busy[k] = { id: id, t: 0 };
    if (me && LB.sfx && LB.sfx.ui) try { LB.sfx.ui('arm'); } catch (_) {}
    radio(side, sideName(side) + ' R&D: "Researching ' + TECHS[id].label + '." (SIMULATED · game FX)');
    renderUi(); return true;
  }
  function complete(side) {
    var k = String(side), id = busy[k].id; done[k][id] = true; busy[k] = null;
    if (side === playerSide()) stats.researched++; else stats.aiResearched++;
    stats.last = sideName(side) + ' · ' + TECHS[id].label;
    radio(side, sideName(side) + ' R&D: "' + TECHS[id].label + ' online." ' + TECHS[id].tip + ' (SIMULATED · game FX)');
    if (side === playerSide() && LB.sfx && LB.sfx.ui) try { LB.sfx.ui('arm'); } catch (_) {}
    renderUi();
  }
  function buildUi() {
    var p = doc.createElement('div'); p.id = 'techPanel'; p.className = 'supply-panel tech-panel';
    p.innerHTML = '<div class="th-title">WAR SYSTEMS · TECH TREE <span class="qual sim">SIMULATED</span></div><div class="tech-tree">' +
      ORDER.map(function (id) { var t = TECHS[id], c = Object.keys(t.cost).map(function (r) { return t.cost[r] + ' ' + r; }).join(' + ');
        return '<button type="button" class="tech-node" data-tech="' + id + '" title="' + t.tip + (t.req.length ? ' · needs ' + t.req.map(function (r) { return TECHS[r].label; }).join(', ') : '') + '"><b>' + t.label + '</b><small>' + t.tip + '</small><em>' + c + '</em><i class="tech-bar"><span></span></i></button>'; }).join('') +
      '</div><div class="th-note" id="techEnemy"></div>';
    el.p = p; el.enemy = p.querySelector('#techEnemy');
    p.addEventListener('click', function (ev) { var b = ev.target.closest('button[data-tech]'); if (b) research(b.getAttribute('data-tech')); });
    placeUi();
  }
  function placeUi() {
    var anchor = doc.getElementById('economyPanel') || doc.getElementById('supplyPanel'), p = el.p;
    if (anchor && anchor.parentNode && p.previousSibling !== anchor) { anchor.parentNode.insertBefore(p, anchor.nextSibling); p.classList.toggle('floating', anchor.classList.contains('floating')); }
    else if (!p.parentNode) doc.body.appendChild(p);
    if (anchor) p.hidden = anchor.hidden;
  }
  function renderUi() {
    if (!el.p) return; placeUi();
    var me = playerSide(), k = String(me);
    ORDER.forEach(function (id) {
      var b = el.p.querySelector('[data-tech="' + id + '"]'), st = status(me, id); if (!b) return;
      b.setAttribute('data-st', st); b.disabled = st !== 'ready';
      var bar = b.querySelector('.tech-bar span'); bar.style.width = (st === 'done' ? 100 : st === 'busy' ? Math.round(busy[k].t / RESEARCH_S * 100) : 0) + '%';
    });
    var en = -me, n = Object.keys(done[String(en)]).length, b2 = busy[String(en)];
    el.enemy.textContent = 'Enemy R&D: ' + n + '/5 techs' + (b2 ? ' · researching ' + TECHS[b2.id].label : '') + '. A game layer: never changes price, armies or the front.';
  }
  function step(dt) {
    [-1, 1].forEach(function (s) { var b = busy[String(s)]; if (b) { b.t += dt; if (b.t >= RESEARCH_S) complete(s); } });
    var me = playerSide();
    if (has(me, 'reload')) try { var cds = LB.commander.getState().cds; for (var c in cds) if (cds[c] > 0) cds[c] = Math.max(0, cds[c] - dt * 0.2); } catch (_) {}
    aiT -= dt; if (aiT <= 0) { aiT = 20 + Math.random() * 20; var en = -me; if (!busy[String(en)]) { var opts = ORDER.filter(function (id) { return status(en, id) === 'ready'; }); if (opts.length) research(opts[0], en); } }
    uiT -= dt; if (uiT <= 0) { uiT = 0.5; renderUi(); }
  }
  function update() {
    if (!enabled) return;
    var eco = ECO(); if (!eco || !eco.isEnabled()) return;
    var e = E(); if (!e) return;
    if (!ready) { try { buildUi(); ready = true; } catch (err) { enabled = false; console.warn('[tech] disabled', err); return; } }
    var now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
    if (e.isPaused() || (LB.cutscene && LB.cutscene.isActive && LB.cutscene.isActive())) return;
    step(dt);
  }
  LB.tech = {
    isEnabled: function () { return enabled && ready; }, update: update, research: research, has: has,
    status: function (id, s) { return status(s == null ? playerSide() : s, id); },
    getState: function () { return { done: JSON.parse(JSON.stringify(done)), busy: JSON.parse(JSON.stringify(busy)), stats: Object.assign({}, stats) }; },
    TECHS: TECHS, _step: function (sec) { if (!ready) return; for (var t = 0; t < sec; t += 0.1) step(0.1); }
  };
})(window);
