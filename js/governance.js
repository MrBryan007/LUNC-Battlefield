/* Terra Classic governance — LIVE via HTTPS API / LCD bridge only; never fabricate */
(function (global) {
  'use strict';
  const LB = global.LUNCBattle;
  const DT = LB.DataTruth;
  let latest = { truth: DT.UNAVAILABLE, proposals: [], validators: [], reason: 'Governance API not connected' };

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
      latest = {
        truth: DT.LIVE,
        proposals: data.proposals || data || [],
        validators: latest.validators || [],
        reason: null
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
      latest.validators = data.validators || data || [];
      latest.truth = DT.LIVE;
      return { truth: DT.LIVE, validators: latest.validators };
    } catch (e) {
      return { truth: DT.UNAVAILABLE, validators: [], reason: String(e.message || e) };
    }
  }

  function getLatest() { return latest; }
  LB.governance = { refreshProposals, refreshValidators, getLatest };
})(window);
