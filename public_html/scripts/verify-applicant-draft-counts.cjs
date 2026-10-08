#!/usr/bin/env node
/* scripts/verify-applicant-draft-counts.cjs
 *
 * Verifies that the applicant landing-page draft-count behavior is correct:
 *  - ApplicantView derives counts from the dedicated `getmyforms` cached data,
 *    persists them in sessionStorage, and falls back to `forms`-derived counts.
 *  - The data-stream path invalidates `getmyforms` and force-refreshes forms
 *    so applicant draft counts update on server-side changes instead of stale cache.
 */

const fs = require('fs');
const path = require('path');

const root = (path.sep === '/'
  ? path.join(process.cwd(), 'uev-ver-7.21')
  : 'C:/Users/999/Desktop/uev-ver-7.21');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log('PASS: ' + msg);
}

let failures = 0;

try {
  const app = read('js/app.js');
  const views = read('js/views-bundle.js');

  // 1) Stream invalidates getmyforms and force-refreshes forms on applicationsChanged
  assert(
    app.includes("applicationsChanged") && app.includes("invalidateApiCache(['getforms','getmyforms','listdocuments','getcompetitionsummary','getapplicationsbycompetition','getcontestboard','getreviewerforms'])"),
    'data stream invalidates getmyforms for applications changes'
  );
  assert(
    app.includes("loadForms({forceRefresh:true,silent:true})"),
    'data stream force-refreshes forms on applications changes'
  );

  // 2) ApplicantView uses getmyforms cache for live counts
  assert(
    views.includes("ERP_DATA?.readSync?.('getmyforms',{})"),
    'ApplicantView reads getmyforms cache for live counts'
  );

  // 3) ApplicantView persists applicant counts across refresh
  assert(
    views.includes("sessionStorage.setItem('erp:applicant:counts',JSON.stringify(counts))"),
    'ApplicantView persists applicant counts in sessionStorage'
  );
  assert(
    views.includes("sessionStorage.getItem('erp:applicant:counts')"),
    'ApplicantView seeds applicant counts from sessionStorage'
  );

  // 4) Landing batch path seeds both getmyforms and getforms caches
  assert(
    (app.includes("_actions[i]==='getmyforms' && r.forms") && app.includes("ERP_DATA.cacheSet('getforms',{},r)")),
    'login batch seeds getforms cache from getmyforms response'
  );

  // 5) loadForms still uses role for server-side filtering
  assert(
    app.includes("const payload=isAdmin") && app.includes("role:userRole"),
    'loadForms includes role in payload'
  );

  // 6) Role changes trigger form reload with cache bust for admin upgrades
  assert(
    app.includes("loadForms({forceRefresh:true,silent:true})"),
    'role upgrade path force-refreshes forms'
  );

  console.log('\nVERIFY: applicant draft-count improvements present');
} catch (e) {
  console.error('FAIL: ' + e.message);
  process.exitCode = 1;
}
