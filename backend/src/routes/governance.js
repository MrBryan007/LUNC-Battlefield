import { live, partial, unavailable } from '../lib/envelope.js';
import { cached, TTL } from '../lib/cache.js';
import {
  getGovProposals,
  getGovProposal,
  getGovTally,
  getGovParams,
  getGovDeposits,
  getStakingPool
} from '../providers/terra.js';

function statusString(s) {
  if (s == null) return null;
  if (typeof s === 'string') return s;
  const map = {
    0: 'PROPOSAL_STATUS_UNSPECIFIED',
    1: 'PROPOSAL_STATUS_DEPOSIT_PERIOD',
    2: 'PROPOSAL_STATUS_VOTING_PERIOD',
    3: 'PROPOSAL_STATUS_PASSED',
    4: 'PROPOSAL_STATUS_REJECTED',
    5: 'PROPOSAL_STATUS_FAILED'
  };
  return map[s] || String(s);
}

function mapProposal(p, tally, deposits, params, bondedTokens) {
  const id = String(p.proposal_id ?? p.id ?? '');
  const content = p.content || p.messages?.[0] || {};
  const title =
    p.title ||
    content.title ||
    content.content?.title ||
    (content['@type'] ? String(content['@type']).split('.').pop() : null) ||
    `Proposal ${id}`;
  const description =
    p.summary ||
    p.description ||
    content.description ||
    content.content?.description ||
    null;

  const yes = tally ? Number(tally.yes || tally.yes_count || 0) : null;
  const no = tally ? Number(tally.no || tally.no_count || 0) : null;
  const abstain = tally ? Number(tally.abstain || tally.abstain_count || 0) : null;
  const nwv = tally
    ? Number(tally.no_with_veto || tally.no_with_veto_count || 0)
    : null;
  const totalVoted =
    yes != null ? yes + (no || 0) + (abstain || 0) + (nwv || 0) : null;

  let turnout = null;
  if (totalVoted != null && bondedTokens && bondedTokens > 0) {
    turnout = totalVoted / bondedTokens;
  }

  return {
    id,
    title,
    description,
    proposer: p.proposer || null,
    status: statusString(p.status),
    submitTime: p.submit_time || null,
    depositEndTime: p.deposit_end_time || null,
    votingStartTime: p.voting_start_time || null,
    votingEndTime: p.voting_end_time || null,
    tally:
      tally != null
        ? { yes, no, abstain, noWithVeto: nwv, totalVoted }
        : null,
    turnout,
    quorum: params?.quorum != null ? Number(params.quorum) : null,
    threshold: params?.threshold != null ? Number(params.threshold) : null,
    vetoThreshold:
      params?.veto_threshold != null ? Number(params.veto_threshold) : null,
    deposits: deposits || null
  };
}

async function loadParamsAndBonded(env) {
  let params = null;
  let bondedTokens = null;
  try {
    const { data } = await getGovParams(env, 'tallying');
    params = data.tally_params || data.params || data;
  } catch (_) {}
  try {
    const { data } = await getStakingPool(env);
    bondedTokens = Number(data?.pool?.bonded_tokens || 0) || null;
  } catch (_) {}
  return { params, bondedTokens };
}

export async function handleGovernanceList(env, url) {
  return cached('gov:list', TTL.governance, async () => {
    try {
      const { params, bondedTokens } = await loadParamsAndBonded(env);
      const { data, url: src } = await getGovProposals(env);
      const raw = data.proposals || [];
      // Enrich voting-period with tally (cap to avoid fan-out)
      const proposals = [];
      let tallyErrors = 0;
      for (const p of raw.slice(0, 30)) {
        const id = p.proposal_id ?? p.id;
        let tally = p.final_tally_result || null;
        const st = statusString(p.status);
        if (!tally && id != null && /VOTING/i.test(String(st))) {
          try {
            const t = await getGovTally(env, id);
            tally = t.data.tally || t.data;
          } catch (_) {
            tallyErrors++;
          }
        }
        proposals.push(mapProposal(p, tally, null, params, bondedTokens));
      }

      const active = proposals.filter(p => /VOTING|DEPOSIT/i.test(String(p.status || '')));
      const payload = {
        proposals,
        activeCount: active.length,
        count: proposals.length,
        params: params
          ? {
              quorum: params.quorum,
              threshold: params.threshold,
              vetoThreshold: params.veto_threshold
            }
          : null
      };

      if (tallyErrors > 0) {
        return partial(payload, `${tallyErrors} tally fetch(es) failed`, 'terra-lcd', {
          sourceLabel: `Terra Classic LCD gov (${src})`,
          confidence: 0.75
        });
      }
      return live(payload, 'terra-lcd', {
        sourceLabel: `Terra Classic LCD gov (${new URL(src).host})`
      });
    } catch (e) {
      return unavailable(`Governance list failed: ${e.message || e}`, 'terra-lcd', {
        data: { proposals: [], activeCount: 0 }
      });
    }
  });
}

export async function handleGovernanceOne(env, id) {
  return cached(`gov:one:${id}`, TTL.governance, async () => {
    try {
      const { params, bondedTokens } = await loadParamsAndBonded(env);
      const { data, url: src } = await getGovProposal(env, id);
      const p = data.proposal || data;
      let tally = p.final_tally_result || null;
      try {
        const t = await getGovTally(env, id);
        tally = t.data.tally || t.data || tally;
      } catch (_) {}
      let deposits = null;
      try {
        const d = await getGovDeposits(env, id);
        deposits = d.data.deposits || [];
      } catch (_) {}
      const mapped = mapProposal(p, tally, deposits, params, bondedTokens);
      return live({ proposal: mapped }, 'terra-lcd', {
        sourceLabel: `Terra Classic LCD gov (${new URL(src).host})`
      });
    } catch (e) {
      return unavailable(`Proposal ${id} failed: ${e.message || e}`, 'terra-lcd');
    }
  });
}
