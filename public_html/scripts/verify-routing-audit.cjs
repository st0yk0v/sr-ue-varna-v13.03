#!/usr/bin/env node
/*
 * verify-routing-audit.cjs — UEV-ERP silent-unrouted-action gate.
 *
 * Recurring defect class (caught 3x in reconciliation: 12.49.55 2FA, 12.49.56
 * batch-compliance, 12.49.57 admin-CRUD): a served JS file calls api('ACTION')
 * but the action resolves to NEITHER a PHP handler (database/action_map.php)
 * NOR is it listed in js/utils.js::_GAS_ONLY. Such an action is sent to PHP,
 * gets HTTP 404, then falls through to GAS via the fragile 1519-loop — wasting
 * a round-trip and silently failing in PHP-only degraded mode.
 *
 * This script cross-references:
 *   1. every api('ACTION') in the SERVED JS bundle(s)
 *   2. against js/utils.js::_GAS_ONLY
 *   3. against database/action_map.php keys
 *   4. against gas/oldgas.gs dispatch (action==='X' + alias maps + wrapPostResult_)
 * and FAILS the build if any genuinely-unrouted action exists.
 *
 * Negative control: it deliberately seeds a fake api('totallyfakedactionxyz') into
 * an in-memory copy and asserts the detector flags it — proving the gate can fail.
 *
 * Usage: node scripts/verify-routing-audit.cjs [--root .] [--json]
 * Exit 0 = clean, non-zero = unrouted action(s) found.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.argv.includes('--root')
  ? process.argv[process.argv.indexOf('--root') + 1]
  : path.resolve(__dirname, '..');
const AS_JSON = process.argv.includes('--json');

let failures = 0;
const log = (m) => { if (!AS_JSON) console.log(m); };
const err = (m) => { if (!AS_JSON) console.error(m); };

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

// ── 1. Discover served JS files (parse script src= from index.html) ──
function servedJs(root) {
  const idx = read(path.join(root, 'index.html')) || '';
  const files = new Set();
  const re = /(?:src|href)="(\/js\/[a-zA-Z0-9_/.-]+\.js)"/g;
  let m;
  while ((m = re.exec(idx))) {
    // strip leading slash, normalize to repo-relative
    files.add(m[1].replace(/^\//, ''));
  }
  // Always include the core libs even if not literally in index.html src
  ['js/utils.js', 'js/views-bundle.js', 'js/components.js', 'js/app.js',
   'js/competitions.js', 'js/dashboard.js', 'js/forms-admin.js'].forEach(f => files.add(f));
  return [...files].filter(f => fs.existsSync(path.join(root, f)));
}

// Strip JS comments (// line + /* */ block) so commented-out placeholder
// calls (e.g. api('approvex'), api('savex')) are not mistaken for live calls.
function stripJsComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1');  // line comments (keep http:// etc.)
}

// ── 2. Every api('ACTION') in served JS ──
function extractApiCalls(root, jsFiles) {
  const calls = {}; // actionLower -> Set(relpath)
  const re = /api\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
  for (const f of jsFiles) {
    const raw = read(path.join(root, f)) || '';
    const txt = stripJsComments(raw);
    let mm;
    while ((mm = re.exec(txt))) {
      const a = mm[1].toLowerCase();
      (calls[a] || (calls[a] = new Set())).add(f);
    }
  }
  return calls;
}

// ── 3. _GAS_ONLY tokens from utils.js ──
function gasOnlyTokens(root) {
  const u = read(path.join(root, 'js/utils.js')) || '';
  const m = u.match(/_GAS_ONLY\s*=\s*\/\^\((.*?)\)\$?\/i/s);
  if (!m) return new Set();
  return new Set(m[1].split('|').map(s => s.trim()).filter(Boolean));
}

// ── 4. PHP action_map.php keys ──
function phpActionKeys(root) {
  const a = read(path.join(root, 'database/action_map.php')) || '';
  const keys = new Set();
  const re = /'([a-zA-Z0-9_]+)'\s*=>/g;
  let m;
  while ((m = re.exec(a))) keys.add(m[1].toLowerCase());
  return keys;
}

// ── 5. GAS dispatch actions. Scan ALL THREE .gs files:
//         gas/GAS.GS   — the LIVE backend (32k lines, what actually serves)
//         gas/code.gs  — legacy 624-line transport stub (kept for history)
//         gas/oldgas.gs— full reference implementation
//    GAS.GS was previously omitted, so 43 dispatch tokens present only in the
//    live file (including listFolderTemplates) were invisible to this gate. A
//    GAS-only action added to GAS.GS would have been reported as unrouted.
function gasDispatchActions(root) {
  const set = new Set();
  for (const fname of ['gas/GAS.GS', 'gas/code.gs', 'gas/oldgas.gs']) {
    const g = read(path.join(root, fname));
    if (!g) continue;
    let m;
    const re1 = /action\s*===?\s*['"]([a-zA-Z0-9_]+)['"]/g;
    while ((m = re1.exec(g))) set.add(m[1].toLowerCase());
    const re2 = /wrapPostResult_\(\s*'([a-zA-Z0-9_]+)'/g;
    while ((m = re2.exec(g))) set.add(m[1].toLowerCase());
    // alias / handler maps: KEY: handlerFnName  (KEY may have leading underscore)
    const re3 = /['"]?([a-zA-Z_][a-zA-Z0-9_]{2,})['"]?\s*:\s*(['"]?[a-zA-Z_][a-zA-Z0-9_]*['"]?|function|\{)/g;
    while ((m = re3.exec(g))) set.add(m[1].toLowerCase());
  }
  return set;
}

function main() {
  const jsFiles = servedJs(ROOT);
  const calls = extractApiCalls(ROOT, jsFiles);
  const gasOnly = gasOnlyTokens(ROOT);
  const php = phpActionKeys(ROOT);
  const gas = gasDispatchActions(ROOT);

  // ── Negative control: prove the detector CAN fail ──
  // Inject a synthetic action that is in NEITHER backend, then assert it is
  // flagged as unrouted. Without this, a green run only proves "no issues
  // found" — not that the gate would catch one.
  const NC = 'totallyfakedactionxyz';
  calls[NC] = new Set(['js/__probe__.js']);

  log(`Served JS files scanned: ${jsFiles.length}`);
  log(`Distinct api() actions referenced: ${Object.keys(calls).length}`);
  log(`_GAS_ONLY tokens: ${gasOnly.size}  PHP action_map keys: ${php.size}  GAS dispatch actions: ${gas.size}`);

  const unrouted = [];
  for (const action of Object.keys(calls).sort()) {
    const inGasOnly = gasOnly.has(action);
    const inPhp = php.has(action);
    const inGasDispatch = gas.has(action);
    if (inGasOnly) continue;            // routed straight to GAS — OK
    if (inPhp) continue;                // handled by PHP — OK
    if (inGasDispatch) {
      // Routed to PHP -> 404 -> fragile fallthrough to GAS. Not fatal but a
      // wasted round-trip + degraded-mode failure. Treat as a DEFECT to fix
      // by adding to _GAS_ONLY (so it routes straight to GAS like its siblings).
      unrouted.push({ action, kind: 'GAS_HANDLER_MISSING_FROM_GASONLY', files: [...calls[action]] });
    } else {
      unrouted.push({ action, kind: 'NEITHER_BACKEND', files: [...calls[action]] });
    }
  }

  // ── Negative control: prove the detector CAN fail ──
  // The synthetic action injected above (NC) is in NEITHER _GAS_ONLY nor PHP
  // nor GAS, so it MUST appear in `unrouted`. If it doesn't, the gate is
  // broken (a green run would be meaningless theatre). It is then excluded
  // from the deploy-blocking failure count (it is not a real code defect).
  const ncFound = unrouted.some(u => u.action === NC);
  if (!ncFound) {
    err('NEGATIVE CONTROL BROKEN: injected fake action was NOT flagged as unrouted — gate is broken.');
    failures++;
  } else {
    log('Negative control PASS: synthetic unrouted action correctly flagged.');
  }
  const realUnrouted = unrouted.filter(u => u.action !== NC);

  if (unrouted.length) {
    err(`\n=== UNROUTED ACTIONS (${unrouted.length}) ===`);
    for (const u of unrouted) {
      err(`  ${u.action}  [${u.kind}]  in ${u.files.slice(0, 4).join(', ')}`);
    }
    failures += realUnrouted.length;
  } else {
    log('\nNo silent-unrouted actions: every served api() call resolves to PHP or _GAS_ONLY.');
  }

  // ── Coherence: every _GAS_ONLY token must resolve to PHP or GAS ──
  const orphans = [];
  for (const t of [...gasOnly].sort()) {
    if (!php.has(t) && !gas.has(t)) orphans.push(t);
  }
  if (orphans.length) {
    err(`\n=== ORPHAN _GAS_ONLY TOKENS (resolve nowhere): ${orphans.join(', ')} ===`);
    failures += orphans.length;
  } else {
    log('Every _GAS_ONLY token resolves to a real PHP handler or GAS handler.');
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ ok: failures === 0, failures, unrouted, orphans: orphans.length }, null, 2));
  }
  if (failures > 0) {
    err(`\nROUTING AUDIT FAILED: ${failures} issue(s). Fix before deploy.`);
    process.exit(1);
  }
  log('\nROUTING AUDIT PASSED.');
  process.exit(0);
}

main();
