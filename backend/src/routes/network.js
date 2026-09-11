import { live, partial, unavailable } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import {
  getLatestBlock,
  getBondedValidators,
  getTaxParams
} from '../providers/terra.js';

export async function handleNetwork(env) {
  return cached('network', TTL.network, async () => {
    const errors = [];
    let height = null;
    let chainId = env.CHAIN_ID || 'columbus-5';
    let blockTime = null;
    let activeValidators = null;
    let tax = null;
    let sourceHost = null;

    try {
      const { data, url } = await getLatestBlock(env);
      sourceHost = new URL(url).host;
      height = Number(data.block?.header?.height) || null;
      chainId = data.block?.header?.chain_id || chainId;
      blockTime = data.block?.header?.time || null;
    } catch (e) {
      errors.push('block: ' + (e.message || e));
    }

    try {
      const { data } = await getBondedValidators(env);
      activeValidators = (data.validators || []).length;
    } catch (e) {
      errors.push('validators: ' + (e.message || e));
    }

    try {
      const { data, path } = await getTaxParams(env);
      tax = { raw: data, path, truth: 'LIVE' };
    } catch (e) {
      tax = {
        truth: 'UNAVAILABLE',
        reason: 'Tax/treasury params not exposed on configured LCDs: ' + (e.message || e)
      };
    }

    if (height == null && activeValidators == null) {
      return unavailable(errors.join('; ') || 'network unavailable', 'terra-lcd');
    }

    const payload = {
      chainId,
      height,
      blockTime,
      activeValidatorCount: activeValidators,
      tax
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
