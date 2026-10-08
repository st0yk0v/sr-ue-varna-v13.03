#!/usr/bin/env node
/**
 * verify-perf-ux.cjs — additive regression guard for v12.49.18+ perf/UX fixes.
 *
 * Checks:
 *  1. _safePostMessage_ does NOT call _probeCoop_ (COOP silence)
 *  2. /applications/:id deep-link uses memoized initialAppForm pattern
 *  3. render-timing helper exists in app.js
 *  4. 401 diagnostic logging exists in stream-doc.php
 */

const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    const ok = fn();
    if (ok) {
      console.log(`  [PASS]  ${name}`);
      passed++;
    } else {
      console.log(`  [FAIL]  ${name}`);
      failed++;
    }
  } catch (e) {
    console.log(`  [FAIL]  ${name}: ${e.message}`);
    failed++;
  }
}

function read(file) {
  return fs.readFileSync(path.join(repo, file), 'utf8');
}

console.log('\n=== verify-perf-ux.cjs ===\n');

// 1. COOP probe removed from hot path
check('_safePostMessage_ does not call _probeCoop_', () => {
  const html = read('index.html');
  const safeMatch = html.match(/function\s+_safePostMessage_[\s\S]*?\n\s*\}/);
  if (!safeMatch) return false;
  return !safeMatch[0].includes('_probeCoop_()');
});

// 2. Deep-link memoized
check('views-bundle uses memoized initialAppForm', () => {
  const vb = read('js/views-bundle.js');
  return vb.includes('const initialAppForm=useMemo') &&
         vb.includes('useEffect(()=>{if(!initialAppForm)return;');
});

// 3. Timing helper
check('app.js exposes _uevMeasureOnce', () => {
  const app = read('js/app.js');
  return app.includes('window._uevMeasureOnce = _uevMeasureOnce') &&
         app.includes("performance.mark('uev:first-paint')");
});

// 4. 401 diagnostics
check('stream-doc.php logs 401 diagnostics', () => {
  const php = read('database/stream-doc.php');
  return php.includes('stream-doc.php 401: no token') &&
         php.includes('stream-doc.php 401: bad token format') &&
         php.includes('stream-doc.php 401: session not found/expired');
});

// 5. Login UX hardening
check('login double-loader guard present', () => {
  const vb = read('js/views-bundle.js');
  return vb.includes('auth-transition') && vb.includes('login-loading-overlay');
});
check('GSI retry + longer timeout present', () => {
  const vb = read('js/views-bundle.js');
  return vb.includes('_gsiRetryCount') && vb.includes('12000');
});

console.log(`\n=== Summary ===`);
console.log(`PASS: ${passed}  FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
