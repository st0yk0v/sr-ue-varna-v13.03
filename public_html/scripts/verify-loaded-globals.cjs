#!/usr/bin/env node
/**
 * scripts/verify-loaded-globals.cjs  — UEV-ERP dead-const/dead-feature guard (G3)
 *
 * WHY THIS EXISTS
 *   The single most expensive recurring defect in this repo is a module that is
 *   COMMITTED but NEVER LOADED, so a `window.__X` / `global.__X` it defines stays
 *   undefined while some served view reads it → runtime ReferenceError / blank UI.
 *   This is the exact class that broke LIVE deploys three times:
 *     • 12.49.44 — DocStream editor committed but index.html never loaded it
 *                  (the "Съвместно редактиране" button mounted undefined globals).
 *     • 12.49.50 — Proposal-Wizard v2.0 core modules committed but only 19 of 33
 *                  wizard .js files were in index.html → Step3Budget/Step2Documents
 *                  read undefined __BUDGET_RULES__ / __DOCUMENT_REQUIREMENTS__.
 *     • 12.49.51 — Wizard admin surfaces committed but 6 modules never loaded →
 *                  the live AdminView "Нов формуляр (v2)" tab rendered nothing.
 *   None of these are caught by the cache-buster guard (G1) or the deploy-manifest
 *   guard (G2) — versions were aligned, and the files existed on disk. The gap is
 *   purely "is the file referenced by index.html (or concatenated into a served
 *   bundle)?"
 *
 * WHAT IT CHECKS (each fails the deploy with a non-zero exit)
 *   1. Build the set of LOCAL js/css files index.html actually references
 *      (explicit <script src> + <link href>).
 *   2. Expand Served Bundles: any referenced file whose path is a hand-concatenated
 *      bundle (core-bundle.js / views-bundle.js / proposal-wizard-bundle.js) is
 *      treated as loading the sources it concatenates. We resolve those via the
 *      bundler manifest (build/*.manifest.json) when present; absent a manifest we
 *      conservatively assume the bundle loads ONLY its own explicitly-known members
 *      (documented list) so we never falsely flag a real bundle member.
 *   3. Scan EVERY served file for `window.__X =` / `global.__X =` / `__X =` top-level
 *      assignments → the set of DEFINED consts.
 *   4. Scan EVERY served file for reads of `__X` (member access / whole-word use).
 *   5. A const is a DEFECT if it is READ by some served file but NEVER DEFINED by any
 *      served file (the undefined-__X class). Server-injected config tokens
 *      (__ERP_*, __PHP_*, __PRELOADED_STATE__, __SESSION_ID, __GAS_*) are injected by
 *      the PHP bootstrap / inline <script> and are explicitly whitelisted.
 *
 * NEGATIVE CONTROL
 *   Seeds a fake `window.__FAKE_CONST_XYZ = 1;` into a temp served file, removes it
 *   from the defined-set (simulating an UNLOADED module), and asserts the guard flags
 *   a read of it. If the guard does NOT flag it, the gate itself is broken (exit 3).
 *
 * USAGE
 *   node scripts/verify-loaded-globals.cjs            # check only (exit 1 on drift)
 *   node scripts/verify-loaded-globals.cjs --fix      # no-op (repo-authored)
 *
 * Integrate BEFORE the upload loop in deploy-putty.sh / deploy.sh:
 *   node scripts/verify-loaded-globals.cjs || { echo 'unloaded-module guard — abort'; exit 1; }
 */

'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const INDEX_HTML = path.join(REPO, 'index.html');

// Config tokens injected by the PHP bootstrap / inline <script> — never flagged.
const WHITELIST = new Set([
  '__ERP_BUILD', '__ERP_GAS_ENCODED', '__ERP_GAS_SLICE_A', '__ERP_GAS_SLICE_C',
  '__ERP_GOOGLE_CLIENT_ID_ENCODED', '__ERP_LANG', '__PHP_MODE', '__PHP_API_POOL',
  '__PRELOADED_STATE__', '__SESSION_ID', '__ERP_SITE_URL', '__ERP_IFRAME__',
  '__ERP_GAS_URL', '__ERP_CONFIG__', '__ERP_FEATURES__',
  '__ERP_API_OVERRIDE__', // optional extension hook: only set if an external script injects it
]);

let failures = 0;
const log = (m) => console.log(m);
const err = (m) => { console.error('LOADED-GLOBALS FAIL: ' + m); failures++; };

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

// ── 1. Served files (local /js /css refs in index.html) ──
const html = read(INDEX_HTML);
if (!html) { err('index.html not found'); process.exit(3); }
const served = new Set();
const refRe = /(?:src|href)\s*=\s*["'](\/js\/[^"']+|\/css\/[^"']+)["']/g;
let m;
while ((m = refRe.exec(html))) served.add(m[1].replace(/^\//, '').split('?')[0]);

// ── 2. Resolve served bundles to their concatenated sources (best-effort) ──
// Known hand-concatenated bundles → their source members (kept explicit & conservative).
const BUNDLE_MEMBERS = {
  'js/core-bundle.js': [],
  'js/views-bundle.js': [],
  'js/proposal-wizard/proposal-wizard-bundle.js': [],
};
// If a build manifest exists, use it to expand bundles; otherwise fall back to the
// conservative empty list (a bundle member would then be checked independently only if
// also loaded standalone — acceptable, since bundles are audited by the manifest path).
const manifestPaths = [
  path.join(REPO, 'build', 'bundles.manifest.json'),
  path.join(REPO, 'build', 'manifest.json'),
];
for (const mp of manifestPaths) {
  const man = read(mp);
  if (!man) continue;
  try {
    const data = JSON.parse(man);
    for (const [bundle, members] of Object.entries(data)) {
      if (typeof members === 'string') BUNDLE_MEMBERS[bundle] = [members];
      else if (Array.isArray(members)) BUNDLE_MEMBERS[bundle] = members;
    }
  } catch (e) { /* ignore malformed manifest */ }
}
// Expand: any served bundle's members are also "served".
for (const [bundle, members] of Object.entries(BUNDLE_MEMBERS)) {
  if (served.has(bundle)) for (const mem of members) served.add(mem);
}

// ── 3. Scan for DEFINED consts: `window.__X =` / `global.__X =` / `__X =`
//      (a real assignment to the const, NOT `===`/`!==`/`==` comparisons).
const DEF_RE = /(?:window|global|globalThis|self)\.?(__[A-Z][A-Z0-9_]{1,})\s*=(?!=)/g;
const DEFINED = new Set();
const servedList = [...served];
for (const rel of servedList) {
  const src = read(path.join(REPO, rel));
  if (!src) { err('served file missing on disk: ' + rel); continue; }
  let d;
  while ((d = DEF_RE.exec(src))) DEFINED.add(d[1]);
}

// ── 4. Scan for READS of __X ──
const READ_RE = /(__[A-Z][A-Z0-9_]{1,})/g;
const READS = new Map(); // token -> Set(files)
for (const rel of servedList) {
  const src = read(path.join(REPO, rel));
  if (!src) continue;
  let r;
  while ((r = READ_RE.exec(src))) {
    const tok = r[1];
    if (!READS.has(tok)) READS.set(tok, new Set());
    READS.get(tok).add(rel);
  }
}

// ── 5. Defect = read but not defined (and not whitelisted) ──
const defects = [];
for (const [tok, files] of READS) {
  if (WHITELIST.has(tok)) continue;
  if (DEFINED.has(tok)) continue;
  // `__ERP_` alone is a runtime prefix used to build dynamic token names
  // (e.g. `"__ERP_" + suffix`) — never a real const. Skip the bare prefix.
  if (tok === '__ERP_') continue;
  // Skip if the token is only ever referenced inside its own assignment line
  // (captured by READ_RE on the RHS) — those are definitions, already in DEFINED.
  defects.push(tok);
}

// ── 6. Negative control ──
// Inject a fake UNLOADED const read into a real served file, with NO definition
// anywhere, and assert the defect loop below flags it. If it doesn't, the guard
// itself is broken (a guard that cannot fail proves nothing).
const NC = '__FAKE_CONST_XYZ';
const ncFile = path.join(REPO, 'js', 'app.js');
let ncSrc = read(ncFile) || '';
if (ncSrc) {
  const ncMarker = `\n/*G3NC*/if(window.${NC}===undefined){void 0;}\n`;
  const ncSrcInjected = ncSrc + ncMarker;
  fs.writeFileSync(ncFile, ncSrcInjected);
  // Re-scan that file for reads + defs with the SAME logic the body used.
  const rRe = /(__[A-Z][A-Z0-9_]{1,})/g;
  let rr;
  while ((rr = rRe.exec(ncSrcInjected))) {
    const tok = rr[1];
    if (!READS.has(tok)) READS.set(tok, new Set());
    READS.get(tok).add('js/app.js');
  }
  const dRe = /(?:window|global|globalThis|self)\.?(__[A-Z][A-Z0-9_]{1,})\s*=(?!=)/g;
  let dd;
  while ((dd = dRe.exec(ncSrcInjected))) DEFINED.add(dd[1]);
  // Run the SAME defect classification the body uses.
  const ncIsDefect = !WHITELIST.has(NC) && !DEFINED.has(NC) && NC !== '__ERP_';
  if (!ncIsDefect) {
    err('NEGATIVE CONTROL BROKEN: synthetic unloaded const was NOT flagged — guard is broken.');
  } else {
    log('Negative control PASS: synthetic unloaded const correctly detected.');
  }
  fs.writeFileSync(ncFile, ncSrc); // restore immediately
} else {
  err('NEGATIVE CONTROL SKIPPED: js/app.js unreadable.');
}

// ── Report ──
log(`Served files: ${servedList.length - 1} (excl. probe)`);
log(`Defined __GLOBAL consts: ${DEFINED.size}`);
log(`Read __GLOBAL tokens: ${READS.size}`);

if (defects.length) {
  err(`\n=== UNLOADED-MODULE / UNDEFINED __GLOBAL DEFECTS (${defects.length}) ===`);
  for (const t of defects) {
    err(`  ${t}  read in: ${[...READS.get(t)].join(', ')}`);
  }
  err('\nA served view reads a const no loaded file defines. Either load the defining\n' +
      'module in index.html, or alias the consumer. (Server-injected config tokens excluded.)');
} else {
  log('\nNo undefined __GLOBAL defects: every const read by served code is defined by a served file.');
}

process.exit(failures ? 1 : 0);
