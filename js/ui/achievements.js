/* LUNC Battlefield v12.0.24 — v12.3 part 1: achievements and a service record. Game layer.
 * 19 achievements read once a second from counters the other modules already keep (no hooks into them). Unlocks are
 * saved in localStorage ('luncBattle.achievements', id → unlock time). Your service-record title rises with the count.
 * Never touches market data, armies, the front or data-truth labels. ?ach=0 turns it off. */
(function (global) {
  'use strict';
  var LB = global.LUNCBattle = global.LUNCBattle || {}, doc = global.document;
  var qs = new URLSearchParams(global.location.search);
  var enabled = qs.get('ach') !== '0';
  var KEY = 'luncBattle.achievements';
  var got = load(), ev = { moon: 0, nuke: 0, combo: 0, night: 0, sec: 0, lastCharge: 0, lastNuke: 0 }, el = {}, ready = false, iv = 0, queue = [], showing = false, uiDirty = true;
  function cs() { try { return LB.commander.getState().session || {}; } catch (_) { return {}; } }
  function me() { try { return LB.commander.getState().profile.side === 'bull' ? -1 : 1; } catch (_) { return -1; } }
  function st(mod, fn) { try { var m = LB[mod]; return m && m[fn] ? m[fn]() || {} : {}; } catch (_) { return {}; } }
  function ownKills() { try { var s = me(); return LB.squads.list().filter(function (q) { return q.side === s; }).reduce(function (a, q) { return a + (q.kills || 0); }, 0); } catch (_) { return 0; } }
  var DEFS = [
    { id: 'first-blood', icon: '✸', name: 'First Blood', desc: 'Land your first Commander hit', p: function () { return [cs().hits || 0, 1]; } },
    { id: 'combo5', icon: '✕', name: 'Chain Reaction', desc: 'Reach a x5 combo', p: function () { return [ev.combo, 5]; } },
    { id: 'moon', icon: '☾', name: 'To the Moon', desc: 'Fire the Moon Shot', p: function () { return [ev.moon, 1]; } },
    { id: 'nuke', icon: '☢', name: 'Mushroom Cloud', desc: 'Drop the Mini Nuke', p: function () { return [ev.nuke, 1]; } },
    { id: 'mission1', icon: '◎', name: 'Mission Accomplished', desc: 'Complete a Commander mission', p: function () { return [cs().missionsDone || 0, 1]; } },
    { id: 'mission5', icon: '◉', name: 'Veteran', desc: 'Complete 5 missions in one session', p: function () { return [cs().missionsDone || 0, 5]; } },
    { id: 'level5', icon: '▲', name: 'Field Promotion', desc: 'Reach Commander level 5', p: function () { return [cs().level || 1, 5]; } },
    { id: 'score5k', icon: '$', name: 'High Roller', desc: 'Score 5,000 in one session', p: function () { return [Math.floor(cs().score || 0), 5000]; } },
    { id: 'orders10', icon: '⚑', name: 'Squad Leader', desc: 'Give your squads 10 orders', p: function () { return [st('squads', 'getStats').orders || 0, 10]; } },
    { id: 'kills10', icon: '⌖', name: 'Marksmen', desc: 'Your squads take down 10 enemy soldiers', p: function () { return [ownKills(), 10]; } },
    { id: 'hill', icon: '⛰', name: 'King of the Hill', desc: 'Hold Hill 402', p: function () { var o = st('ridge', 'getStats').owner; return [o && o === me() ? 1 : 0, 1]; } },
    { id: 'fort', icon: '▣', name: 'Engineer', desc: 'Build a fortification', p: function () { return [st('forts', 'getStats').built || 0, 1]; } },
    { id: 'tech3', icon: '⚗', name: 'Scientist', desc: 'Research 3 technologies', p: function () { return [((st('tech', 'getState').stats) || {}).researched || 0, 3]; } },
    { id: 'uav', icon: '✈', name: 'Eye in the Sky', desc: 'Task a UAV', p: function () { return [st('uav', 'getStats').cmdTasks || 0, 1]; } },
    { id: 'sonar', icon: '◌', name: 'Ping!', desc: 'Order a sonar ping', p: function () { return [st('asw', 'getStats').cmdPings || 0, 1]; } },
    { id: 'hack', icon: '⌁', name: 'Hacker', desc: 'Launch a cyber attack', p: function () { return [((st('wxCombat', 'getState').stats) || {}).playerHacks || 0, 1]; } },
    { id: 'supply', icon: '☂', name: 'Special Delivery', desc: 'Call in a supply drop', p: function () { return [st('supply', 'getStats').called || 0, 1]; } },
    { id: 'night', icon: '☽', name: 'Night Owl', desc: 'Fight for a minute at night', p: function () { return [Math.floor(ev.night), 60]; } },
    { id: 'tenmin', icon: '⏱', name: 'Dug In', desc: 'Play 10 minutes in one session', p: function () { return [Math.floor(ev.sec), 600]; } }
  ];
  var TITLES = [[0, 'Recruit'], [1, 'Private'], [3, 'Corporal'], [5, 'Sergeant'], [7, 'Lieutenant'], [10, 'Captain'], [13, 'Major'], [16, 'Colonel'], [19, 'General']];
  function load() { try { var o = JSON.parse(global.localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } }
  function save() { try { global.localStorage.setItem(KEY, JSON.stringify(got)); } catch (_) {} }
  function count() { return DEFS.filter(function (d) { return got[d.id]; }).length; }
  function title(n) { var t = TITLES[0][1]; TITLES.forEach(function (x) { if (n >= x[0]) t = x[1]; }); return t; }
  function nextTitle(n) { for (var i = 0; i < TITLES.length; i++) if (TITLES[i][0] > n) return TITLES[i]; return null; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function unlock(d) {
    if (got[d.id]) return false;
    var before = title(count()); got[d.id] = Date.now(); save(); uiDirty = true;
    var after = title(count());
    queue.push({ d: d, promo: after !== before ? after : null }); pump();
    if (LB.ai && LB.ai.send) try { LB.ai.send({ side: me(), type: 'ach', text: 'HQ: commendation — "' + d.name + '". ' + (after !== before ? 'Promoted to ' + after + '.' : '') + ' (game layer)' }); } catch (_) {}
    return true;
  }
  function pump() {
    if (showing || !queue.length || !el.toast) return;
    var q = queue.shift(); showing = true;
    el.toast.innerHTML = '<i>' + q.d.icon + '</i><div><small>ACHIEVEMENT UNLOCKED</small><b>' + esc(q.d.name) + '</b><span>' + esc(q.d.desc) + (q.promo ? ' · Promoted to <em>' + q.promo + '</em>' : '') + '</span></div>';
    el.toast.classList.remove('out'); el.toast.classList.add('on');
    if (LB.sfx) try { (q.promo && LB.sfx.rank ? LB.sfx.rank : LB.sfx.success)(); } catch (_) {}
    setTimeout(function () { el.toast.classList.add('out'); setTimeout(function () { el.toast.classList.remove('on', 'out'); showing = false; pump(); }, 400); }, queue.length ? 2200 : 3600);   // shorter when several unlock at once
  }
  function tick() {
    var e = LB.engine; if (!e) return;
    if (el.p && !el.p.parentNode) { place(); if (el.p.parentNode) uiDirty = true; }
    var paused = false; try { paused = e.isPaused(); } catch (_) {}
    var s = cs();
    if (!paused) {
      ev.sec += 1;
      try { if (LB.wxCombat && LB.wxCombat.getState().night) ev.night += 1; } catch (_) {}
    }
    ev.combo = Math.max(ev.combo, s.combo || 0);
    var ch = s.charge || 0, nk = s.nuke || 0;
    if (ev.lastCharge >= 99 && ch < 50) ev.moon++;   // the charge drains when the Moon Shot fires
    if (ev.lastNuke >= 99 && nk < 50) ev.nuke++;
    ev.lastCharge = ch; ev.lastNuke = nk;
    DEFS.forEach(function (d) { if (got[d.id]) return; var p; try { p = d.p(); } catch (_) { return; } if (p[0] >= p[1]) unlock(d); });
    if (uiDirty || (el.p && !el.p.hidden && el.p.offsetParent)) render();
  }
  function build() {
    el.toast = doc.createElement('div'); el.toast.className = 'ach-toast'; el.toast.setAttribute('role', 'status'); el.toast.setAttribute('aria-live', 'polite'); doc.body.appendChild(el.toast);
    var p = doc.createElement('div'); p.id = 'achPanel'; p.className = 'supply-panel ach-panel';
    p.innerHTML = '<div class="th-title">SERVICE RECORD · ACHIEVEMENTS <span class="qual sim">GAME LAYER</span></div>' +
      '<div class="ach-rank"><b id="achTitle"></b><span id="achCount"></span><i class="ach-bar"><span id="achBar"></span></i><small id="achNext"></small></div>' +
      '<div class="ach-list" id="achList"></div>' +
      '<div class="ach-foot"><span class="th-note">Saved on this device. Achievements only read the game layer, never market data.</span><button type="button" id="achReset">Reset</button></div>';
    el.p = p; el.list = p.querySelector('#achList');
    p.querySelector('#achReset').addEventListener('click', function () {
      var b = this; if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Tap again to reset'; setTimeout(function () { b.dataset.armed = ''; b.textContent = 'Reset'; }, 3000); return; }
      got = {}; save(); b.dataset.armed = ''; b.textContent = 'Reset'; uiDirty = true; render();
    });
    place(); render();
  }
  function place() {
    if (el.p.parentNode) return;
    var host = doc.querySelector('.sheet-command .sheet-body') || doc.querySelector('#sheet-command .sheet-body');
    if (host) host.appendChild(el.p);
  }
  function render() {
    if (!el.p) return; place(); uiDirty = false;
    var n = count(), nt = nextTitle(n);
    el.p.querySelector('#achTitle').textContent = title(n);
    el.p.querySelector('#achCount').textContent = n + ' / ' + DEFS.length;
    el.p.querySelector('#achBar').style.width = Math.round(n / DEFS.length * 100) + '%';
    el.p.querySelector('#achNext').textContent = nt ? 'Next: ' + nt[1] + ' at ' + nt[0] : 'Top rank reached';
    el.list.innerHTML = DEFS.map(function (d) {
      var on = !!got[d.id], p = [0, 1]; try { p = d.p(); } catch (_) {}
      var f = on ? 1 : Math.max(0, Math.min(1, p[0] / p[1]));
      return '<div class="ach-item' + (on ? ' on' : '') + '" data-ach="' + d.id + '"><i>' + d.icon + '</i><div><b>' + esc(d.name) + '</b><span>' + esc(d.desc) + '</span>' +
        (on ? '<small>Unlocked ' + new Date(got[d.id]).toLocaleDateString() + '</small>' : (p[1] > 1 ? '<em class="ach-pg"><span style="width:' + Math.round(f * 100) + '%"></span></em><small>' + Math.min(p[0], p[1]).toLocaleString() + ' / ' + p[1].toLocaleString() + '</small>' : '<small>Locked</small>')) + '</div></div>';
    }).join('');
  }
  function start() {
    if (!enabled || ready) return; ready = true;
    try { build(); } catch (err) { enabled = false; console.warn('[achievements] disabled', err); return; }
    iv = setInterval(function () { try { tick(); } catch (err) { console.warn('[achievements]', err); } }, 1000);
  }
  LB.achievements = {
    version: 'v12.0.24', isEnabled: function () { return enabled && ready; },
    list: function () { return DEFS.map(function (d) { var p = [0, 1]; try { p = d.p(); } catch (_) {} return { id: d.id, name: d.name, on: !!got[d.id], cur: p[0], goal: p[1] }; }); },
    count: count, title: function () { return title(count()); },
    getState: function () { return { enabled: enabled && ready, count: count(), total: DEFS.length, title: title(count()), ev: Object.assign({}, ev), queued: queue.length, showing: showing }; },
    reset: function () { got = {}; save(); uiDirty = true; render(); },
    _tick: tick, _unlock: function (id) { var d = DEFS.filter(function (x) { return x.id === id; })[0]; return d ? unlock(d) : false; }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', function () { setTimeout(start, 1500); }); else setTimeout(start, 1500);
})(window);
