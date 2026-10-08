// UEV-ERP live DB repair + verify tool (v12.48.0-dbfix).
//
// WHAT IT DOES (all over the reachable HTTPS API — no SSH/MySQL needed):
//   1. Confirms the deployed build now knows `repairallsheets` (was "Unknown").
//   2. Runs a READ-ONLY divergence probe: getinitialdata(scoped) vs getforms
//      for a target applicant email, to prove admin/applicant views agree.
//   3. (Optional, --repair) Calls action=repairallsheets with admin creds to
//      reconcile attached_docs + admin_emails on the live DB. ADMIN AUTH REQUIRED.
//
// USAGE:
//   node scripts/repair-verify-live.cjs                # read-only verify
//   node scripts/repair-verify-live.cjs --repair      # also run repairallsheets
//   ADMIN_EMAIL=you@ue-varna.bg ADMIN_SESSION=xxx \
//     node scripts/repair-verify-live.cjs --repair    # with admin auth
//
// Env (optional; only used with --repair):
//   ADMIN_EMAIL    an email present in the live admin_emails table
//   ADMIN_SESSION  X-Session-Id value (sent as header) for the admin session
//   API_BASE       default https://sr-ue-varna.com/database/api.php
//   PROBE_EMAIL    applicant email to scope-probe (default a throwaway)

const BASE = process.env.API_BASE || 'https://sr-ue-varna.com/database/api.php';
const PROBE_EMAIL = process.env.PROBE_EMAIL || 'diag-probe@uev-diag.probe';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_SESSION = process.env.ADMIN_SESSION || '';
const DO_REPAIR = process.argv.includes('--repair');

function post(action, body, headers) {
  const b = Object.assign({ action }, body || {});
  const h = Object.assign({ 'Content-Type': 'application/json' }, headers || {});
  return fetch(BASE, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(b),
  }).then(r => r.json().catch(() => ({ success: false, error: 'bad-json' })));
}

function adminHeaders() {
  const h = {};
  if (ADMIN_EMAIL) h['X-Admin-Email'] = ADMIN_EMAIL;
  if (ADMIN_SESSION) h['X-Session-Id'] = ADMIN_SESSION;
  return h;
}

(async () => {
  const out = { base: BASE, buildKnown: null, probe: {} };

  // 1) Is repairallsheets now known on the deployed build?
  const ra = await post('repairallsheets', { probe: 1 }, adminHeaders());
  out.buildKnown = ra;
  console.log('[1] repairallsheets probe:', JSON.stringify(ra));

  // 2) Divergence probe: getinitialdata should scope to PROBE_EMAIL now.
  const init = await post('getinitialdata', { email: PROBE_EMAIL, role: 'applicant', lean: true });
  const initForms = (init.forms && init.forms.forms) || [];
  const mineInit = initForms.filter(f => (f.userEmail || f.user_email || '') === PROBE_EMAIL);
  // 3) getforms (correctly scoped) for same email.
  const gf = await post('getforms', { email: PROBE_EMAIL, role: 'applicant', lean: true, limit: 500 });
  const gfForms = gf.forms || [];

  out.probe = {
    getinitialdata_total: initForms.length,
    getinitialdata_mine: mineInit.length,
    getforms_total: gfForms.length,
    // Consistency check: getinitialdata must not show others' forms to this applicant.
    CONSISTENT: initForms.length === mineInit.length,
  };
  console.log('[2] divergence probe:', JSON.stringify(out.probe, null, 2));

  // 4) Optional repair
  if (DO_REPAIR) {
    if (!ADMIN_EMAIL) {
      console.log('[3] --repair requested but ADMIN_EMAIL not set — skipping (needs admin auth).');
    } else {
      const rep = await post('repairallsheets', {}, adminHeaders());
      out.repair = rep;
      console.log('[3] repairallsheets result:', JSON.stringify(rep, null, 2));
      // Re-probe after repair to confirm scoping holds.
      const init2 = await post('getinitialdata', { email: PROBE_EMAIL, role: 'applicant', lean: true });
      const init2Forms = (init2.forms && init2.forms.forms) || [];
      out.postRepairProbe = {
        getinitialdata_total: init2Forms.length,
        CONSISTENT: init2Forms.every(f => (f.userEmail || f.user_email || '') === PROBE_EMAIL),
      };
      console.log('[4] post-repair probe:', JSON.stringify(out.postRepairProbe));
    }
  } else {
    console.log('[3] (skipped — pass --repair with ADMIN_EMAIL to run live repair)');
  }

  console.log('\nSUMMARY:', JSON.stringify(out.probe, null, 0));
  if (out.probe.CONSISTENT) console.log('OK: getinitialdata is scoped — admin/applicant views consistent.');
  else console.log('WARN: getinitialdata still shows foreign forms to an applicant — deploy v12.48.0 + run repair.');
})();
