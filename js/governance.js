/* Terra Classic governance — LIVE via HTTPS API / LCD bridge only; never fabricate */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;
  let latest = { truth: DT.UNAVAILABLE, proposals: [], validators: [], reason: 'Governance API not connected' };

  /** Enrich proposal fields for UI when present (v7.1 envelope or legacy array). */
  function mapProposal(p) {
    if (!p || typeof p !== 'object') return p;
    return {
      id: p.id != null ? p.id : p.proposal_id,
      title: p.title || null,
      description: p.description || p.summary || null,
      proposer: p.proposer || null,
      status: p.status || null,
      submitTime: p.submitTime || p.submit_time || null,
      depositEndTime: p.depositEndTime || p.deposit_end_time || null,
      votingStartTime: p.votingStartTime || p.voting_start_time || null,
      votingEndTime: p.votingEndTime || p.voting_end_time || null,
      tally: p.tally || p.final_tally_result || null,
      turnout: p.turnout != null ? p.turnout : null,
      quorum: p.quorum != null ? p.quorum : null,
      threshold: p.threshold != null ? p.threshold : null,
      deposits: p.deposits || null,
      // passthrough extras
      raw: p
    };
  }

  function unwrapProposals(data) {
    const truth = data.truth || DT.LIVE;
    const list =
      (data.data && Array.isArray(data.data.proposals) && data.data.proposals) ||
      (Array.isArray(data.proposals) && data.proposals) ||
      (Array.isArray(data) ? data : []);
    return { truth, proposals: list.map(mapProposal), reason: data.error || data.reason || null };
  }

  function unwrapValidators(data) {
    const truth = data.truth || DT.LIVE;
    const list =
      (data.data && Array.isArray(data.data.validators) && data.data.validators) ||
      (Array.isArray(data.validators) && data.validators) ||
      (Array.isArray(data) ? data : []);
    return { truth, validators: list, reason: data.error || data.reason || null };
  }

  async function refreshProposals() {
    const base = LB.config.apiBase;
    if (!base) {
      latest = { ...latest, truth: DT.UNAVAILABLE, proposals: [], reason: 'Needs HTTPS API (?api=) for proposals' };
      return latest;
    }
    try {
      const r = await fetch(base + '/governance/proposals', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const u = unwrapProposals(data);
      latest = {
        truth: u.truth,
        proposals: u.proposals,
        validators: latest.validators || [],
        reason: u.truth === DT.UNAVAILABLE ? u.reason : null
      };
      return latest;
    } catch (e) {
      latest = { truth: DT.UNAVAILABLE, proposals: [], validators: latest.validators || [], reason: String(e.message || e) };
      return latest;
    }
  }

  async function refreshValidators() {
    const base = LB.config.apiBase;
    if (!base) {
      return { truth: DT.UNAVAILABLE, validators: [], reason: 'Needs HTTPS API (?api=) for validators' };
    }
    try {
      const r = await fetch(base + '/governance/validators', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const u = unwrapValidators(data);
      latest.validators = u.validators;
      if (u.truth === DT.LIVE || u.truth === DT.CALCULATED || u.truth === DT.PARTIAL) {
        latest.truth = latest.proposals && latest.proposals.length ? latest.truth : u.truth;
      }
      return { truth: u.truth, validators: u.validators, reason: u.reason };
    } catch (e) {
      return { truth: DT.UNAVAILABLE, validators: [], reason: String(e.message || e) };
    }
  }

  function getLatest() { return latest; }
  LB.governance = { refreshProposals, refreshValidators, getLatest };
})(window);
