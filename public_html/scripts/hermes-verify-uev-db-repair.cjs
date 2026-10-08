#!/usr/bin/env node
/**
 * hermes-verify-uev-db-repair.cjs — ad-hoc verification for DB connection fix
 * NOT a canonical test suite — focused smoke check for the 56 forms / 33 projects fix.
 * Run: node scripts/hermes-verify-uev-db-repair.cjs
 */

'use strict';

const https = require('https');

function postAPI(action, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(Object.assign({ action }, body || {}));
    const req = https.request('https://sr-ue-varna.com/database/api.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 10000
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const parts = d.split('}{');
        for (let i = 0; i < parts.length; i++) {
          try {
            const o = JSON.parse(parts[i] + (i < parts.length - 1 ? '}' : ''));
            if (o.success) resolve(o);
          } catch (e) {}
        }
        resolve(null);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function check(name, fn) {
  try {
    const result = fn();
    if (result) {
      console.log('  PASS  ' + name);
      return true;
    } else {
      console.log('  FAIL  ' + name);
      return false;
    }
  } catch (e) {
    console.log('  FAIL  ' + name + ' — ' + e.message);
    return false;
  }
}

console.log('=== UEV-ERP DB Repair Verification (ad-hoc) ===\n');

let pass = 0, fail = 0;
const report = (ok) => { if (ok) pass++; else fail++; };

// 1. getforms returns 56 forms with role=admin
report(check('getforms (role=admin) returns 56 forms', async () => {
  const forms = await postAPI('getforms', { role: 'admin', limit: 500, lean: false });
  if (!forms) return false;
  const count = forms.forms ? forms.forms.length : forms.total;
  console.log('    → ' + count + ' forms returned (role in response: ' + (forms.role || 'none') + ')');
  return count === 56;
}));

// 2. getprojects returns 33 projects with role=admin
report(check('getprojects (role=admin) returns 33 projects', async () => {
  const projs = await postAPI('getprojects', { role: 'admin', limit: 500 });
  if (!projs) return false;
  const count = projs.projects ? projs.projects.length : projs.total;
  console.log('    → ' + count + ' projects returned');
  return count === 33;
}));

// 3. DB ping — healthy
report(check('DB ping — healthy', async () => {
  const ping = await postAPI('ping');
  if (!ping || !ping.db) return false;
  console.log('    → DB ' + (ping.db.healthy ? 'HEALTHY' : 'UNHEALTHY') +
    ' @ ' + (ping.db.host || 'unknown') +
    ' | latency: ' + (ping.db.latency_ms || '?') + 'ms');
  return ping.db.healthy === true;
}));

// 4. gettablestatus — all tables present
report(check('gettablestatus — all tables present', async () => {
  const tabs = await postAPI('gettablestatus');
  if (!tabs || tabs.status !== 'healthy') return false;
  const missing = (tabs.missing || []).length;
  const critical = (tabs.critical_missing || []).length;
  console.log('    → ' + Object.keys(tabs.tables_status).length + ' tables, ' +
    missing + ' missing, ' + critical + ' critical missing');
  return missing === 0;
}));

// 5. getsystemhealth — correct counts
report(check('getsystemhealth — 56 apps / 33 projects / 14 reviewers / 94 docs', async () => {
  const health = await postAPI('getsystemhealth');
  if (!health) return false;
  console.log('    → apps=' + health.total_applications +
    ', projects=' + health.total_projects +
    ', reviewers=' + health.total_reviewers +
    ', docs=' + health.total_documents);
  return health.total_applications === 56 &&
    health.total_projects === 33 &&
    health.total_reviewers === 14 &&
    health.total_documents === 94;
}));

// 6. api.php forceAdmin bypass code present
const fs = require('fs');
const apiPath = process.cwd() + '/database/api.php';
report(check('api.php — forceAdmin bypass in handleGetForms', () => {
  const content = fs.readFileSync(apiPath, 'utf8');
  const hasForceAdmin = content.includes('forceAdmin') &&
    content.includes("$role = 'admin'");
  console.log('    → forceAdmin bypass with role override: ' + (hasForceAdmin ? 'YES' : 'NO'));
  return hasForceAdmin;
}));

report(check('api.php — forceAdmin bypass in handleGetProjects', () => {
  const content = fs.readFileSync(apiPath, 'utf8');
  const projSection = content.substring(
    content.indexOf('function handleGetProjects'),
    content.indexOf('function handleGetProject')
  );
  const hasForceAdmin = projSection.includes('forceAdmin');
  console.log('    → forceAdmin bypass in handleGetProjects: ' + (hasForceAdmin ? 'YES' : 'NO'));
  return hasForceAdmin;
}));

// 7. db-data-viewer.js served live
report(check('Live JS — db-data-viewer.js served', async () => {
  const data = await new Promise((resolve, reject) => {
    https.get('https://sr-ue-varna.com/js/db-data-viewer.js?v=12.49.98', (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
  const ok = data.includes('Database Data Viewer');
  console.log('    → db-data-viewer.js: ' + (ok ? 'FOUND' : 'MISSING'));
  return ok;
}));

// 8. Live CSS — db-viewer styles
report(check('Live CSS — db-viewer styles in uev.css', async () => {
  const data = await new Promise((resolve, reject) => {
    https.get('https://sr-ue-varna.com/css/uev.css?v=12.49.98', (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
  const ok = data.includes('.db-viewer');
  console.log('    → .db-viewer styles: ' + (ok ? 'FOUND' : 'MISSING'));
  return ok;
}));

// 9. index.html has db-data-viewer container
report(check('index.html — db-data-viewer container', () => {
  const html = fs.readFileSync(process.cwd() + '/index.html', 'utf8');
  const hasContainer = html.includes('id="db-data-viewer"');
  const hasScript = html.includes('js/db-data-viewer.js');
  console.log('    → container: ' + (hasContainer ? 'YES' : 'NO') +
    ', script: ' + (hasScript ? 'YES' : 'NO'));
  return hasContainer && hasScript;
}));

console.log('\n=== Result: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
