/* Boot — fast strength tick; slow backend intel */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  function boot() {
    const tag = document.getElementById('buildTag');
    if (tag) tag.textContent = 'BATTLEFIELD v8';
    const title = document.querySelector('title');
    if (title) title.textContent = LB.config.TITLE;
    if (LB.config.apiBase) {
      console.info('[LUNCBattle] HTTPS API base', LB.config.apiBase);
    } else {
      console.info('[LUNCBattle] No ?api= — browser DefiLlama/CoinGecko/Binance fallbacks; burns/whales/gov/validators UNAVAILABLE');
    }
    LB.ui.tickStrength();
    setInterval(() => LB.ui.tickStrength(), 2000);
    LB.ui.refreshAuxFeeds();
    setInterval(() => LB.ui.refreshAuxFeeds(), 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
