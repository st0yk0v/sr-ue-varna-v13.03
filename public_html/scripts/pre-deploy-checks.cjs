#!/usr/bin/env node
/**
 * pre-deploy-checks.cjs — fail-fast checks before upload.
 *
 * Current checks:
 *  G1 cache-buster guard:
 *    1. version.json has a semver-like version/build.
 *    2. index.html contains at least one cache-buster token.
 *    3. ALL ?v= tokens in index.html match version.json.version exactly.
 *       This catches drift like "code shipped with stale ?v=12.49.11 tokens".
 *
 * Usage:
 *   node scripts/pre-deploy-checks.cjs
 *   node scripts/pre-deploy-checks.cjs --repo=/path/to/repo
 *
 * Exit: 0 = green, 1 = fail deploy.
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function arg(name, def) {
  const m = process.argv.slice(2).find(a => a.startsWith('--' + name + '='));
  return m ? m.split('=')[1] : def;
}

const repo = path.resolve(arg('repo', '.'));
const indexPath = path.join(repo, 'index.html');
const versionPath = path.join(repo, 'version.json');

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ' -> ' + detail : '')); }
};

try {
  const pkg = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
  const expectedVersion = String((pkg.version || pkg.build || '').trim());
  const semver = /^[0-9]+\.[0-9]+\.[0-9]+$/;
  log(semver.test(expectedVersion), 'version.json has semver', 'found=' + expectedVersion);

  const idx = fs.readFileSync(indexPath, 'utf8');
  const tokens = [...idx.matchAll(/(?:\?v=)([0-9]+\.[0-9]+\.[0-9]+)/g)].map(m => m[1]);
  const uniq = [...new Set(tokens)];
  log(uniq.length > 0, 'index.html contains cache-buster tokens', 'count=' + uniq.length);

  // Core guard: all tokens must match version.json exactly.
  const tokenMismatch = uniq.filter(v => v !== expectedVersion);
  log(tokenMismatch.length === 0, 'all ?v= tokens match version.json', tokenMismatch.length ? 'mismatches=' + JSON.stringify(tokenMismatch) : '');

  // Bonus: detect any changed static asset that would need cache-bust.
  try {
    const lastTag = (() => {
      const tags = execSync('git tag --list "checkpoint/*" --sort=-version:refname', { cwd: repo, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      return tags[0] || '';
    })();
    const changedSinceTag = (() => {
      if (!lastTag) return false;
      const out = execSync('git diff --name-only ' + lastTag + ' HEAD', { cwd: repo, encoding: 'utf8' }).trim();
      if (!out) return false;
      return out.split('\n').some(f => f.startsWith('js/') || f.startsWith('css/') || f.startsWith('styles') || f.startsWith('assets/'));
    })();
    if (changedSinceTag && tokenMismatch.length === 0) {
      log(true, 'cache-buster drift check', 'assets changed since ' + lastTag + ' and tokens match');
    } else if (!changedSinceTag) {
      log(true, 'cache-buster drift check', 'no static asset changes since ' + lastTag);
    }
  } catch (_) {}
} catch (e) {
  log(false, 'pre-deploy checks runtime error', e.message);
}

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
