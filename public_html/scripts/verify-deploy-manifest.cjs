#!/usr/bin/env node
/**
 * scripts/verify-deploy-manifest.cjs
 *
 * Deploy-manifest guard for UEV-ERP. Hard-fails a push when the set of files
 * the live site actually loads (index.html local /js / /css refs) diverges from
 * the set the deploy allow-list would actually upload (deploy.sh + key launchers).
 *
 * WHY THIS EXISTS
 *   The most catastrophic recurring failure in this repo is a SILENT BROKEN
 *   PUSH: the canonical `deploy.sh` dry-run looked fine, but the launcher the
 *   agent actually ran had drifted, so a --push shipped a broken live site:
 *     • 12.49.52 — css/uev-dark-mode.css was allow-listed but the FILE did not
 *       exist on disk → every push would 404 the dark-mode CSS (broken theme).
 *     • 12.49.53 — the key launchers had dropped 12 files that index.html loads
 *       (wizard-core globals, wizard-admin set, dark-mode css) → blank wizard
 *       steps + broken admin panel live, while deploy.sh --push looked perfect.
 *   Neither incident is caught by the cache-buster guard (G1) — tokens were
 *   aligned. This guard closes that class: it cross-checks the THREE sources of
 *   truth (index.html refs, local disk, deploy allow-lists) so a push can never
 *   silently ship a frontend file the server never receives (or upload a file
 *   index.html never requested but which is required by runtime CSS injection).
 *
 * CHECKS (each fails the deploy with a non-zero exit)
 *   1. Every index.html local /js or /css ref resolves on DISK.
 *      (catches the allow-listed-but-missing-file defect before upload.)
 *   2. Every index.html ref is present in the canonical deploy.sh FILES allow-list.
 *      (catches a push that would SKIP a frontend file the site loads.)
 *   3. Every index.html ref is present in the *key* launcher(s) FILES allow-list
 *      the agent actually runs (deploy-putty.sh / _deploy_full_key.sh).
 *      (catches the 12.49.53 launcher-drift defect.)
 *   4. The full set of files each launcher would upload is a SUBSET of the
 *      canonical allow-list (no launcher uploads a file canonical wouldn't),
 *      so a launcher can't accidentally ship an unverified file.
 *
 * USAGE
 *   node scripts/verify-deploy-manifest.cjs            # check only (exit 1 on drift)
 *   node scripts/verify-deploy-manifest.cjs --fix      # (no-op fix; manifest is repo-authored)
 *
 * Integrate BEFORE the upload loop in deploy-putty.sh / deploy.sh:
 *   node scripts/verify-deploy-manifest.cjs || { echo 'deploy manifest drift — abort'; exit 1; }
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const INDEX_HTML = path.join(REPO, 'index.html');
const DEPLOY_SH = path.join(REPO, 'scripts', 'deploy.sh');
const KEY_LAUNCHERS = [
  path.join(REPO, 'scripts', 'deploy-putty.sh'),
  path.join(REPO, 'scripts', '_deploy_full_key.sh'),
];

let failures = 0;
function fail(msg) {
  console.error('DEPLOY-MANIFEST FAIL: ' + msg);
  failures++;
}
function ok(msg) { console.log('DEPLOY-MANIFEST OK: ' + msg); }

// ── 1. Parse index.html local refs (strip ?v= query) ────────────────────────
let html;
try { html = fs.readFileSync(INDEX_HTML, 'utf8'); }
catch (e) { fail('cannot read index.html: ' + e.message); process.exit(1); }

const jsRefs = [...html.matchAll(/src="\/(js\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
const cssRefs = [...html.matchAll(/href="\/(css\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1]);
const indexRefs = new Set([...jsRefs, ...cssRefs].map(r => r.replace(/^\//, '')));

// ── 2. Parse allow-lists (FILES=(...) arrays) ───────────────────────────────
function parseFilesArray(file) {
  let t;
  try { t = fs.readFileSync(file, 'utf8'); }
  catch (e) { return null; }
  const m = t.match(/FILES=\(([\s\S]*?)\)/);
  if (!m) return null;
  return new Set([...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]));
}

const canonical = parseFilesArray(DEPLOY_SH);
if (!canonical) { fail('cannot parse FILES array in scripts/deploy.sh'); process.exit(1); }

const launcherSets = [];
for (const lf of KEY_LAUNCHERS) {
  const s = parseFilesArray(lf);
  if (s) launcherSets.push({ file: lf, set: s });
}

// ── 3. Check 1: every index ref exists on disk ──────────────────────────────
let missingDisk = 0;
for (const ref of [...indexRefs].sort()) {
  if (!fs.existsSync(path.join(REPO, ref))) {
    fail(`index.html loads "${ref}" but the file does NOT exist on disk (push would 404 it live)`);
    missingDisk++;
  }
}
if (missingDisk === 0) ok(`all ${indexRefs.size} index.html js/css refs resolve on disk`);

// ── 4. Check 2: every index ref is in the canonical allow-list ──────────────
let droppedCanonical = 0;
for (const ref of [...indexRefs].sort()) {
  if (!canonical.has(ref)) {
    fail(`index.html loads "${ref}" but it is NOT in scripts/deploy.sh allow-list (push would skip it)`);
    droppedCanonical++;
  }
}
if (droppedCanonical === 0) ok('all index.html refs are in the canonical deploy.sh allow-list');

// ── 5. Check 3: every index ref is in each key launcher ────────────────────
for (const l of launcherSets) {
  const name = path.basename(l.file);
  let dropped = 0;
  for (const ref of [...indexRefs].sort()) {
    if (!l.set.has(ref)) {
      fail(`index.html loads "${ref}" but it is NOT in ${name} allow-list (push via this launcher would skip it)`);
      dropped++;
    }
  }
  if (dropped === 0) ok(`all index.html refs are in ${name} allow-list`);
}

// ── 6. Check 4: each launcher's files ⊆ canonical ───────────────────────────
for (const l of launcherSets) {
  const name = path.basename(l.file);
  const extra = [...l.set].filter(f => !canonical.has(f)).sort();
  if (extra.length) {
    fail(`${name} would upload ${extra.length} file(s) NOT in canonical allow-list: ${extra.join(', ')}`);
  } else {
    ok(`${name} uploads only canonical allow-listed files (${l.set.size} files)`);
  }
}

// ── 7. Optional tag drift note (informational, not fatal) ──────────────────
try {
  const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || echo ""', { cwd: REPO, encoding: 'utf8' }).trim();
  if (lastTag) {
    const changed = execSync(`git diff --name-only ${lastTag} -- js/ css/ index.html 2>/dev/null || echo ""`, { cwd: REPO, encoding: 'utf8' }).trim();
    if (changed) console.log(`DEPLOY-MANIFEST INFO: ${changed.split('\n').length} frontend file(s) changed since tag ${lastTag} (expected — bump ?v= accordingly).`);
  }
} catch (_) { /* no git / no tags — informational only */ }

if (failures > 0) {
  console.error(`\nDEPLOY-MANIFEST: ${failures} drift condition(s) — DO NOT PUSH until resolved.`);
  process.exit(1);
}
console.log('\nDEPLOY-MANIFEST: all checks passed — index.html, disk, and deploy allow-lists are consistent.');
process.exit(0);
