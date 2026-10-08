#!/usr/bin/env node
/**
 * scripts/verify-offline.cjs — UEV-ERP Offline PWA guard (G10)
 *
 * Verifies:
 *   1. manifest.webmanifest exists on disk and is valid JSON
 *   2. manifest.webmanifest is in the deploy allow-lists
 *   3. index.html links to the manifest
 *   4. sw.js precaches the manifest
 *   5. sw.js has offline shell fallback (cache.match('/') in catch)
 *   6. manifest has required PWA fields (name, short_name, start_url, display, icons)
 *
 * Wired as BLOCK in deploy-putty.sh (G10) and pre-commit-guard.sh.
 */

const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
let failures = 0;

function fail(msg) {
  console.error('  FAIL:', msg);
  failures++;
}

function ok(msg) {
  console.log('  OK:  ', msg);
}

// ── 1. manifest.webmanifest exists ──
const manifestPath = path.join(repo, 'manifest.webmanifest');
if (!fs.existsSync(manifestPath)) {
  fail('manifest.webmanifest not found on disk');
} else {
  ok('manifest.webmanifest exists on disk');

  // ── 2. Valid JSON + required fields ──
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fail('manifest.webmanifest is not valid JSON: ' + e.message);
  }

  if (manifest) {
    const required = ['name', 'short_name', 'start_url', 'display', 'icons'];
    for (const field of required) {
      if (!manifest[field]) fail('manifest missing required field: ' + field);
      else ok('manifest.' + field + ' present');
    }

    if (manifest.display !== 'standalone' && manifest.display !== 'minimal-ui' && manifest.display !== 'fullscreen') {
      fail('manifest.display should be standalone/minimal-ui/fullscreen, got: ' + manifest.display);
    } else {
      ok('manifest.display = ' + manifest.display);
    }

    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      fail('manifest.icons must be a non-empty array');
    } else {
      ok('manifest.icons has ' + manifest.icons.length + ' entries');
    }
  }
}

// ── 3. index.html links to manifest ──
const indexPath = path.join(repo, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
if (indexHtml.includes('rel="manifest"')) {
  ok('index.html links to manifest');
} else {
  fail('index.html missing <link rel="manifest">');
}

// ── 4. sw.js precaches the manifest ──
const swPath = path.join(repo, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
if (sw.includes('manifest.webmanifest')) {
  ok('sw.js precaches manifest.webmanifest');
} else {
  fail('sw.js does not precache manifest.webmanifest');
}

// ── 5. sw.js has offline shell fallback ──
if (sw.includes("cache.match('/')") || sw.includes("cache.match('/index.html')")) {
  ok('sw.js has offline shell fallback');
} else {
  fail('sw.js missing offline shell fallback (cache.match("/") in catch)');
}

// ── 6. manifest in deploy allow-lists ──
const deployPutty = fs.readFileSync(path.join(repo, 'scripts/deploy-putty.sh'), 'utf8');
if (deployPutty.includes('manifest.webmanifest')) {
  ok('deploy-putty.sh allow-lists manifest.webmanifest');
} else {
  fail('deploy-putty.sh missing manifest.webmanifest in FILES array');
}

const deploySh = fs.readFileSync(path.join(repo, 'scripts/deploy.sh'), 'utf8');
if (deploySh.includes('manifest.webmanifest')) {
  ok('deploy.sh allow-lists manifest.webmanifest');
} else {
  fail('deploy.sh missing manifest.webmanifest in FILES array');
}

// ── Summary ──
console.log('');
if (failures > 0) {
  console.error('G10 OFFLINE-PWA: ' + failures + ' failure(s)');
  process.exit(1);
} else {
  console.log('G10 OFFLINE-PWA: all checks passed');
  process.exit(0);
}
