import { fetchJsonFailover, fetchJson } from '../lib/http.js';

const DEFAULT_LCDS = [
  'https://terra-classic-lcd.publicnode.com',
  'https://lcd.terra-classic.hexxagon.io'
];

export function lcdList(env = {}) {
  const raw = env.TERRA_LCD_URLS || '';
  if (raw.trim()) {
    return raw.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  }
  return DEFAULT_LCDS.map(u => u.replace(/\/$/, ''));
}

export async function lcdGet(path, env = {}, timeoutMs = 10_000) {
  const bases = lcdList(env);
  const urls = bases.map(b => `${b}${path.startsWith('/') ? path : '/' + path}`);
  return fetchJsonFailover(urls, {}, timeoutMs);
}

export async function getLatestBlock(env) {
  return lcdGet('/cosmos/base/tendermint/v1beta1/blocks/latest', env);
}

export async function getNodeInfo(env) {
  return lcdGet('/cosmos/base/tendermint/v1beta1/node_info', env);
}

export async function getSupply(env, denom = 'uluna') {
  return lcdGet(`/cosmos/bank/v1beta1/supply/by_denom?denom=${encodeURIComponent(denom)}`, env);
}

export async function getAllSupply(env) {
  return lcdGet('/cosmos/bank/v1beta1/supply?pagination.limit=200', env);
}

export async function getStakingPool(env) {
  return lcdGet('/cosmos/staking/v1beta1/pool', env);
}

export async function getCommunityPool(env) {
  return lcdGet('/cosmos/distribution/v1beta1/community_pool', env);
}

export async function getBondedValidators(env) {
  return lcdGet('/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=300', env, 12_000);
}

export async function getGovProposals(env, status) {
  // Try gov v1beta1 first (Terra Classic classic)
  const q = status ? `?proposal_status=${status}&pagination.limit=50` : '?pagination.limit=50';
  try {
    return await lcdGet(`/cosmos/gov/v1beta1/proposals${q}`, env, 12_000);
  } catch (e) {
    // Fallback gov v1
    return lcdGet(`/cosmos/gov/v1/proposals${q}`, env, 12_000);
  }
}

export async function getGovProposal(env, id) {
  try {
    return await lcdGet(`/cosmos/gov/v1beta1/proposals/${id}`, env);
  } catch (_) {
    return lcdGet(`/cosmos/gov/v1/proposals/${id}`, env);
  }
}

export async function getGovTally(env, id) {
  try {
    return await lcdGet(`/cosmos/gov/v1beta1/proposals/${id}/tally`, env);
  } catch (_) {
    return lcdGet(`/cosmos/gov/v1/proposals/${id}/tally`, env);
  }
}

export async function getGovParams(env, kind = 'tallying') {
  try {
    return await lcdGet(`/cosmos/gov/v1beta1/params/${kind}`, env);
  } catch (_) {
    return lcdGet(`/cosmos/gov/v1/params/${kind}`, env);
  }
}

export async function getGovDeposits(env, id) {
  try {
    return await lcdGet(`/cosmos/gov/v1beta1/proposals/${id}/deposits`, env);
  } catch (_) {
    return lcdGet(`/cosmos/gov/v1/proposals/${id}/deposits`, env);
  }
}

/** Best-effort treasury/tax params — may not exist on all LCDs. */
export async function getTaxParams(env) {
  const candidates = [
    '/terra/treasury/v1beta1/tax_rate',
    '/terra/treasury/v1beta1/params',
    '/cosmos/tax/v1beta1/params'
  ];
  const bases = lcdList(env);
  let lastErr;
  for (const path of candidates) {
    for (const b of bases) {
      try {
        const data = await fetchJson(`${b}${path}`, {}, 8_000);
        return { data, url: `${b}${path}`, path };
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('tax params unavailable');
}

/**
 * Scan recent txs. Terra Classic LCD tx search support varies.
 * Prefer event-filtered queries; fall back to empty on failure.
 */
export async function searchTxs(env, params, timeoutMs = 12_000) {
  const qs = new URLSearchParams(params).toString();
  return lcdGet(`/cosmos/tx/v1beta1/txs?${qs}`, env, timeoutMs);
}

export function ulunaToLunc(uluna) {
  const n = Number(uluna);
  if (!Number.isFinite(n)) return null;
  return n / 1e6;
}

export function uusdToUstc(uusd) {
  const n = Number(uusd);
  if (!Number.isFinite(n)) return null;
  return n / 1e6;
}

export { DEFAULT_LCDS };
