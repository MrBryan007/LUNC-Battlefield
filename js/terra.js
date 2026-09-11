/* Terra Classic / DefiLlama TVL helpers */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;

  async function fetchChainTvl() {
    try {
      const r = await fetch('https://api.llama.fi/v2/chains', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = await r.json();
      const terra = (rows || []).find(c => /terra classic/i.test(c.name) || c.gecko_id === 'terra-luna');
      return { truth: terra ? DT.LIVE : DT.UNAVAILABLE, tvlUsd: terra ? terra.tvl : null, source: 'DefiLlama' };
    } catch (e) {
      return { truth: DT.UNAVAILABLE, tvlUsd: null, reason: String(e.message || e) };
    }
  }

  async function fetchProtocolTvl(slug) {
    try {
      const r = await fetch('https://api.llama.fi/tvl/' + slug, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const v = await r.json();
      return { truth: typeof v === 'number' ? DT.LIVE : DT.UNAVAILABLE, tvlUsd: typeof v === 'number' ? v : null, source: 'DefiLlama' };
    } catch (e) {
      return { truth: DT.UNAVAILABLE, tvlUsd: null, reason: String(e.message || e) };
    }
  }

  LB.terra = { fetchChainTvl, fetchProtocolTvl };
})(window);
