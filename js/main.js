/* Boot — fast strength tick; slow backend intel */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  function boot() {
    const tag = document.getElementById('buildTag');
    if (tag) tag.textContent = 'BATTLEFIELD ' + ((LB.config && LB.config.BUILD) || 'v8');
    const title = document.querySelector('title');
    if (title && LB.config && LB.config.TITLE) title.textContent = LB.config.TITLE;
    const buildLabel = document.getElementById('buildLabel');
    if (buildLabel && LB.config) buildLabel.textContent = LB.config.BUILD;
    if (LB.ui && typeof LB.ui.initHudChrome === 'function') LB.ui.initHudChrome();
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
