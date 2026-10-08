#!/usr/bin/env node
/**
 * verify-live.cjs — UEV-ERP post-deploy live smoke test.
 *
 * Catches the class of bug we hit on 2026-08-19: a DEPLOY-INDUCED transient
 * 403 from the Hostinger `hcdn` edge (CDN cached a 403 while files were
 * briefly missing mid-upload). Static code checks can't see that — only a
 * real HTTP probe against the served host does.
 *
 * What it checks:
 *   1. index.html returns 200 + the expected cache-buster token (?v=VERSION)
 *   2. Every JS/CSS asset listed in index.html returns 200 (NOT 403/404)
 *   3. The stateless /api bridge accepts a POST (200, not 500)
 *   4. No path returns the Hostinger generic 403 block page
 *
 * Usage:
 *   node scripts/verify-live.cjs                # uses version.json + live host
 *   node scripts/verify-live.cjs --host=...     # override host
 *   node scripts/verify-live.cjs --version=12.47.14
 *
 * Exit: 0 = all green, 1 = any failure (so it can gate a deploy/cron).
 */
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_HOST = 'https://sr-ue-varna.com';

function arg(name, def) {
  const m = process.argv.slice(2).find(a => a.startsWith('--' + name + '='));
  return m ? m.split('=')[1] : def;
}

const HOST = arg('host', DEFAULT_HOST).replace(/\/+$/, '');
const VERSION = arg('version', (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version; }
  catch (_) { return null; }
})());

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  if (ok) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};

const get = (url) => new Promise((res, rej) => {
  https.get(url, { timeout: 15000 }, (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d, headers: r.headers }));
  }).on('error', rej).on('timeout', () => rej(new Error('timeout')));
});

const isHostinger403 = (body) => /Access to this resource on the server is denied/i.test(body);

(async () => {
  console.log('UEV-ERP live smoke test @ ' + HOST + (VERSION ? ' (expect v' + VERSION + ')' : ''));

  // 1. index.html + cache-buster
  let idx;
  try { idx = await get(HOST + '/?v=' + (VERSION || Date.now())); }
  catch (e) { console.log('  BLOCKED: ' + e.message); process.exit(2); }
  log(idx.status === 200, 'index.html -> HTTP ' + idx.status);
  log(!isHostinger403(idx.body), 'index.html not a Hostinger 403 block page');
  if (VERSION) {
    // Accept any ?v=<digits.digits.digits> token (e.g. 12.49.4) — the version
    // is injected at runtime via window.__ERP_BUILD for <script src> tags, while
    // <link rel=preload> tags carry the literal ?v=VERSION. Match both shapes.
    const tok = (idx.body.match(/v=[0-9]+\.[0-9]+\.[0-9]+/g) || []).map(s => s.split('=')[1]);
    const uniq = [...new Set(tok)];
    log(uniq.length >= 1 && uniq.every(v => v === VERSION), 'cache-buster tokens all = ' + VERSION, 'found ' + JSON.stringify(uniq));
  }

  // 2. Every asset referenced in index.html
  const assets = [...new Set([...idx.body.matchAll(/(?:src|href)="(js\/[^"]+|css\/[^"]+|assets\/[^"]+|styles[^"]*\.css|uev[^"]*\.css)"/g)]
    .map(m => m[1])
    .filter(a => !a.includes('?v=') || true)
    .map(a => a.split('?')[0]))];
  // de-dup + only versioned ones we can resolve
  const versioned = [...new Set([...idx.body.matchAll(/(?:src|href)="([^"]+\.(?:js|css))(\?v=[^"]+)?"/g)]
    .map(m => m[1] + (m[2] || '')))];
  let checked = 0;
  for (const a of versioned) {
    const url = a.includes('://') ? a : HOST + '/' + a.replace(/^\//, '');
    try {
      const r = await get(url);
      checked++;
      const ok = r.status === 200 && !isHostinger403(r.body);
      log(ok, a + ' -> ' + r.status);
    } catch (e) {
      checked++;
      log(false, a + ' -> ERROR ' + e.message);
    }
  }
  console.log('  (' + checked + ' assets probed)');

  // 3. /api bridge POST
  try {
    const api = await new Promise((res, rej) => {
      const body = JSON.stringify({ action: 'getsystemhealth' });
      const req = https.request(HOST + '/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000 },
        (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode, body: d })); });
      req.on('error', rej); req.on('timeout', () => rej(new Error('timeout')));
      req.write(body); req.end();
    });
    log(api.status === 200, 'POST /api -> HTTP ' + api.status);
    log(!isHostinger403(api.body), '/api not a Hostinger 403 block page');
  } catch (e) {
    log(false, 'POST /api -> ERROR ' + e.message);
  }

  console.log('\n  RESULT: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})();
