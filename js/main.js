/* Boot — aux feeds + badge. Battlefield scene boots from battle-engine.js */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  function boot() {
    const tag = document.getElementById('buildTag');
    if (tag) tag.textContent = 'BATTLEFIELD v7';
    const title = document.querySelector('title');
    if (title) title.textContent = LB.config.TITLE;
    if (LB.config.apiBase) {
      console.info('[LUNCBattle] HTTPS API base', LB.config.apiBase);
    } else {
      console.info('[LUNCBattle] No ?api= bridge — browser DefiLlama/CoinGecko/Binance fallbacks only; burns/whales/gov UNAVAILABLE');
    }
    LB.ui.refreshAuxFeeds();
    setInterval(() => LB.ui.refreshAuxFeeds(), 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
