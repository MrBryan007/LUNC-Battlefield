import { live, partial, unavailable } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import {
  getSupply,
  getStakingPool,
  getCommunityPool,
  ulunaToLunc
} from '../providers/terra.js';

export async function handleSupply(env) {
  return cached('supply', TTL.supply, async () => {
    const errors = [];
    let uluna = null;
    let bonded = null;
    let notBonded = null;
    let communityUluna = null;
    let sourceHost = null;

    try {
      const { data, url } = await getSupply(env, 'uluna');
      sourceHost = new URL(url).host;
      uluna = Number(data.amount?.amount || data.amount || 0);
    } catch (e) {
      errors.push('supply: ' + (e.message || e));
    }

    try {
      const { data, url } = await getStakingPool(env);
      sourceHost = sourceHost || new URL(url).host;
      bonded = Number(data.pool?.bonded_tokens || 0);
      notBonded = Number(data.pool?.not_bonded_tokens || 0);
    } catch (e) {
      errors.push('pool: ' + (e.message || e));
    }

    try {
      const { data } = await getCommunityPool(env);
      const coins = data.pool || [];
      const c = coins.find(x => x.denom === 'uluna');
      if (c) communityUluna = Number(c.amount);
    } catch (e) {
      errors.push('community_pool: ' + (e.message || e));
    }

    if (uluna == null && bonded == null) {
      return unavailable(errors.join('; ') || 'supply unavailable', 'terra-lcd', {
        data: null
      });
    }

    const stakingRatio =
      uluna && bonded != null && uluna > 0 ? bonded / uluna : null;

    const payload = {
      denom: 'uluna',
      uluna,
      lunc: uluna != null ? ulunaToLunc(uluna) : null,
      bonded,
      notBonded,
      stakingRatio,
      communityPoolUluna: communityUluna,
      communityPoolLunc: communityUluna != null ? ulunaToLunc(communityUluna) : null
    };

    if (errors.length) {
      return partial(payload, errors.join('; '), 'terra-lcd', {
        sourceLabel: sourceHost ? `Terra Classic LCD (${sourceHost})` : 'Terra Classic LCD',
        confidence: 0.7
      });
    }
    return live(payload, 'terra-lcd', {
      sourceLabel: sourceHost ? `Terra Classic LCD (${sourceHost})` : 'Terra Classic LCD'
    });
  });
}
