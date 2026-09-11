import { live, unavailable, calculated } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import { getBondedValidators, getStakingPool } from '../providers/terra.js';

export async function handleValidators(env) {
  return cached('validators', TTL.validators, async () => {
    try {
      const [{ data, url: src }, poolRes] = await Promise.all([
        getBondedValidators(env),
        getStakingPool(env).catch(() => null)
      ]);
      const bondedTokens = Number(poolRes?.data?.pool?.bonded_tokens || 0) || null;
      const raw = data.validators || [];
      const validators = raw.map(v => {
        const tokens = Number(v.tokens || 0);
        const vpPct =
          bondedTokens && bondedTokens > 0 ? (tokens / bondedTokens) * 100 : null;
        const out = {
          moniker: v.description?.moniker || null,
          operator: v.operator_address || null,
          tokens,
          votingPowerPct: vpPct,
          commission: v.commission?.commission_rates?.rate != null
            ? Number(v.commission.commission_rates.rate)
            : null,
          maxCommission: v.commission?.commission_rates?.max_rate != null
            ? Number(v.commission.commission_rates.max_rate)
            : null,
          jailed: !!v.jailed,
          status: v.status || null
        };
        // Omit nulls for cleaner payload? Spec says omit missing — strip nulls
        for (const k of Object.keys(out)) {
          if (out[k] == null) delete out[k];
        }
        return out;
      });

      validators.sort((a, b) => (b.tokens || 0) - (a.tokens || 0));

      const payload = {
        validators,
        count: validators.length,
        bondedTokens,
        note: vpPctNote(bondedTokens)
      };

      if (bondedTokens) {
        return live(payload, 'terra-lcd', {
          sourceLabel: `Terra Classic LCD staking (${new URL(src).host})`
        });
      }
      return calculated(payload, 'terra-lcd', {
        sourceLabel: `Terra Classic LCD staking (${new URL(src).host}) — VP% omitted (no pool)`
      });
    } catch (e) {
      return unavailable(`Validators failed: ${e.message || e}`, 'terra-lcd', {
        data: { validators: [], count: 0 }
      });
    }
  });
}

function vpPctNote(bonded) {
  return bonded
    ? 'votingPowerPct = validator.tokens / bonded_tokens'
    : 'votingPowerPct unavailable without staking pool';
}
