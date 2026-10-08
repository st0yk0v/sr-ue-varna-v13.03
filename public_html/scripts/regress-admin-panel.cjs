#!/usr/bin/env node
/**
 * scripts/regress-admin-panel.cjs
 *
 * Permanent regression guard for the Admin management panel (U22):
 *   1. AdminManagerView receives userEmail (so self/last-admin guards work).
 *   2. The remove button is disabled for the current user and the last admin.
 *   3. remove() passes _currentEmail to the backend (server-side guard).
 *   4. Backend handleRemoveAdmin rejects self-removal (cannot_remove_self)
 *      and last-admin removal (cannot_remove_last_admin).
 *   5. Orphaned duplicate artifacts are gone (admin-manager-view.js,
 *      admin-manager.php) so there is a single source of truth.
 *
 * Run: node scripts/regress-admin-panel.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const VB = path.join(__dirname, '..', 'js', 'views-bundle.js');
const APP = path.join(__dirname, '..', 'js', 'app.js');
const API = path.join(__dirname, '..', 'database', 'api.php');
const DEPLOY = path.join(__dirname, '..', 'scripts', 'deploy.sh');
const vb = fs.readFileSync(VB, 'utf8');
const app = fs.readFileSync(APP, 'utf8');
const api = fs.readFileSync(API, 'utf8');
const deploy = fs.readFileSync(DEPLOY, 'utf8');

let pass = 0, fail = 0;
const ck = (name, ok, detail) => {
  if (ok) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
};

// 1. userEmail threaded app -> AdminView -> AdminManagerView
ck('app.js passes userEmail to M_AdminView (both call sites)',
  (app.match(/M_AdminView,\{[^}]*userEmail:user&&user\.email[^}]*\}/g) || []).length === 2);
ck('AdminView accepts userEmail prop',
  /var AdminView=\(\{[^}]*userEmail[^}]*\}\)=>/.test(app) || /var AdminView=\(\{forms[^}]*userEmail/.test(vb));
ck('AdminManagerView receives userEmail',
  /AdminManagerView\(\{isAdmin,userEmail\}\)/.test(vb));
ck('AdminManagerView reads props.userEmail',
  /var userEmail = String\(props\.userEmail \|\| ''\)\.toLowerCase\(\);/.test(vb));

// 2. remove button disabled for self / last admin
ck('row computes _canRemove = !self && !lastAdmin',
  /var _canRemove = !_isSelf && !_isLastAdmin;/.test(vb));
ck('remove button disabled when !_canRemove',
  /className: 'btn btn-danger btn-sm', disabled: !_canRemove/.test(vb));
ck('role label map present (human-readable roles)',
  /_roleLabel = \(\{admin:'Администратор'/.test(vb));

// 3. remove() sends _currentEmail
ck('remove() sends _currentEmail to backend',
  /api\('removeadmin', \{email: email, _currentEmail: _selfEmail\}\)/.test(vb));

// 4. backend guards
ck('handleRemoveAdmin blocks self-removal',
  /cannot_remove_self/.test(api));
ck('handleRemoveAdmin blocks last-admin removal',
  /cannot_remove_last_admin/.test(api));

// 5. orphaned artifacts removed
ck('orphaned js/admin-manager-view.js deleted',
  !fs.existsSync(path.join(__dirname, '..', 'js', 'admin-manager-view.js')));
ck('orphaned scripts/admin-manager.php deleted',
  !fs.existsSync(path.join(__dirname, '..', 'scripts', 'admin-manager.php')));
ck('admin-manager-view.js removed from deploy.sh',
  !/admin-manager-view/.test(deploy));

console.log(`\n=== ADMIN-PANEL REGRESSION: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
