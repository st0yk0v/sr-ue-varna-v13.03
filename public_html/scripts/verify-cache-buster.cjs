#!/usr/bin/env node
/**
 * scripts/verify-cache-buster.cjs
 *
 * G1 pre-deploy guard: FAILS if any index.html ?v= token != version.json version
 * AND a js/ file changed since the last deploy tag.
 *
 * Catches the "code shipped but cache-busters not bumped" drift that broke
 * 12.49.0 / 12.49.1 (57 ?v= refs stuck at 12.48.9 while __ERP_BUILD was 12.49.1).
 *
 * Usage:
 *   node scripts/verify-cache-buster.cjs            # check only (exit 1 on drift)
 *   node scripts/verify-cache-buster.cjs --fix     # also bump index.html ?v= refs
 *
 * Integrates with deploy.sh: call BEFORE the upload loop. If it exits non-zero,
 * the deploy halts (set -e) until the cache-busters are aligned.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const VERSION_JSON = path.join(REPO, 'version.json');
const INDEX_HTML = path.join(REPO, 'index.html');
const GIT = process.env.GIT_BIN || 'git';

let didFix = false;
const args = process.argv.slice(2);
if (args.includes('--fix')) didFix = true;

function bail(msg) {
  console.error('CACHE-BUSTER DRIFT:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('CACHE-BUSTER OK:', msg);
}

// ── 1. Read version.json version ────────────────────────────────────────────
let version;
try {
  version = JSON.parse(fs.readFileSync(VERSION_JSON, 'utf8')).version;
} catch (e) {
  bail(`Cannot read version.json: ${e.message}`);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  bail(`version.json version is not semver: ${version}`);
}

// ── 2. Read index.html ?v= tokens ────────────────────────────────────────────
let html;
try {
  html = fs.readFileSync(INDEX_HTML, 'utf8');
} catch (e) {
  bail(`Cannot read index.html: ${e.message}`);
}

const tokenRe = /\?v=([\d.]+)/g;
const tokens = [];
let m;
while ((m = tokenRe.exec(html)) !== null) tokens.push(m[1]);
const uniqueTokens = [...new Set(tokens)];
const badTokens = uniqueTokens.filter(t => t !== version);

// ── 3. Check __ERP_BUILD ─────────────────────────────────────────────────────
const buildRe = /__ERP_BUILD="([^"]+)"/;
const buildMatch = html.match(buildRe);
const buildValue = buildMatch ? buildMatch[1] : null;
if (buildValue !== version) {
  if (!didFix) {
    bail(`__ERP_BUILD="${buildValue}" != version.json version="${version}"`);
  }
  console.log(`__ERP_BUILD drift detected: "${buildValue}" → will fix to "${version}"`);
}

// ── 4. Report token state ────────────────────────────────────────────────────
console.log(`\nversion.json version: ${version}`);
console.log(`index.html unique ?v= tokens: ${uniqueTokens.length === 1 ? uniqueTokens[0] : uniqueTokens.join(', ')}`);
console.log(`__ERP_BUILD: ${buildValue}`);
console.log(`total ?v= refs in index.html: ${tokens.length}`);

if (badTokens.length === 0 && buildValue === version) {
  ok('all ?v= tokens match version.json');
  ok('__ERP_BUILD matches version.json');
  // ── 5. JS-change check (only meaningful when tokens are ALREADY aligned) ──
  // If tokens are aligned, the guard passes regardless of JS changes.
  // If tokens were misaligned, we would have bailed above.
  process.exit(0);
}

// If only __ERP_BUILD is drifted (tokens aligned), handle in fix mode
if (badTokens.length === 0 && buildValue !== version) {
  if (!didFix) {
    bail(`__ERP_BUILD="${buildValue}" != version.json version="${version}" (but ?v= tokens aligned)`);
  }
  console.log(`only __ERP_BUILD drifted: "${buildValue}" → will fix to "${version}"`);
}

// ── 6. Tokens are misaligned — check if js/ changed since last tag ──────────
// This is the drift detection: if js/ changed but tokens weren't bumped, fail.
const jsChangedMsg = execSync(`${GIT} diff --name-only HEAD -- js/ 2>/dev/null || echo ""`, {
  cwd: REPO, encoding: 'utf8'
}).trim();

const jsChanged = jsChangedMsg.length > 0;

if (!jsChanged) {
  // Tokens are off but js/ didn't change — possibly a version-only bump that
  // forgot to update index.html. Still a real problem worth flagging.
  bail(
    `?v= tokens (${uniqueTokens.join(', ')}) != version.json (${version}) ` +
    `and no js/ changes detected since HEAD — version bump may not have updated cache-busters`
  );
}

// Tokens misaligned AND js/ changed since last commit → classic drift.
const msg =
  `?v= tokens (${uniqueTokens.join(', ')}) != version.json (${version}) ` +
  `and js/ files changed since HEAD — cache-busters must be bumped before deploy` +
  (didFix ? ': auto-fixing...' : '');

if (!didFix) {
  bail(msg);
}

// ── 7. Auto-fix: bump all ?v= tokens + __ERP_BUILD to version ────────────────
console.log(`\nAuto-fixing: bumping all ?v= tokens and __ERP_BUILD to ${version}...`);

let fixed = html;
// Bump ?v= tokens
fixed = fixed.replace(/\?v=([\d.]+)/g, (match, oldVer) => {
  if (oldVer === version) return match;
  return `?v=${version}`;
});

// Bump __ERP_BUILD
if (buildMatch) {
  fixed = fixed.replace(
    /__ERP_BUILD="[^"]+"/,
    `__ERP_BUILD="${version}"`
  );
}

if (fixed === html) {
  bail('fix mode enabled but no changes made — unexpected');
}

fs.writeFileSync(INDEX_HTML, fixed, 'utf8');
didFix = true;

// Verify the fix took
const newHtml = fs.readFileSync(INDEX_HTML, 'utf8');
const newTokens = [];
while ((m = tokenRe.exec(newHtml)) !== null) newTokens.push(m[1]);
const newUnique = [...new Set(newTokens)];
const newBad = newUnique.filter(t => t !== version);
const newBuildMatch = newHtml.match(buildRe);
const newBuildValue = newBuildMatch ? newBuildMatch[1] : null;

if (newBad.length > 0 || newBuildValue !== version) {
  bail(`fix applied but verification failed: tokens=${newUnique.join(', ')} build=${newBuildValue}`);
}

console.log(`Fixed: ${tokens.length} ?v= refs and __ERP_BUILD → ${version}`);
console.log('CACHE-BUSTER OK: all ?v= tokens match version.json (fixed)');
process.exit(0);
