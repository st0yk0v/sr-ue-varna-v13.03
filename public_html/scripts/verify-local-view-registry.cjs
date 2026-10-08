#!/usr/bin/env node
'use strict';
/**
 * verify-local-view-registry.cjs — assert every module-local view defined in app.js
 * has an explicit _regView('Name', Name) call in the same file.
 *
 * Usage: node scripts/verify-local-view-registry.cjs
 * Exit 0 = all registered. Exit 1 + reports each unregistered local view.
 *
 * Module-local views (v12.54.54 baseline): CommunityView, TeacherLookupView,
 * SiteFooter, VedaPanel. These are defined inside app.js itself (not imported from
 * views-bundle.js), so the _POLL_VIEWS / _syncWindowViews window-polling path does
 * NOT cover them — they need an explicit _regView('Name', Name) call.
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'js', 'app.js');
if (!fs.existsSync(appPath)) {
  console.error('ERROR: js/app.js not found at', appPath);
  process.exit(2);
}

const src = fs.readFileSync(appPath, 'utf8');

// Known module-local views for the v12.54.54 baseline.
// Extend this list if a new view is defined in app.js itself (var Name = memo( or var Name = function).
const LOCAL_VIEWS = ['CommunityView', 'TeacherLookupView', 'SiteFooter', 'VedaPanel'];

// Each must be defined somewhere in app.js (var Name = ...).
// Each must also have a _regView('Name', Name) call.
const missingDef = [];
const missingReg = [];

for (const name of LOCAL_VIEWS) {
  // 1. Definition check: is "var Name" present in app.js?
  const defRe = new RegExp('var\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*');
  if (!defRe.test(src)) {
    missingDef.push(name);
    continue; // can't register if not defined
  }

  // 2. Registration: _regView('Name', Name)
  const regRe = new RegExp(
    '_regView\\s*\\(\\s*[\'\"]' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'\"]\\s*,'
  );
  if (!regRe.test(src)) {
    missingReg.push(name);
  }
}

const allGood = missingDef.length === 0 && missingReg.length === 0;

if (allGood) {
  console.log(
    'PASS: all ' + LOCAL_VIEWS.length + ' module-local views defined in app.js and registered via _regView.'
  );
  process.exit(0);
}

if (missingDef.length > 0) {
  console.error('FAIL: the following local views are NOT defined in app.js: ' + missingDef.join(', '));
}
if (missingReg.length > 0) {
  console.error(
    'FAIL: the following module-local views in app.js are NOT registered via _regView: ' +
      missingReg.join(', ') +
      '\n  Add a _regView(\'Name\', Name) call in the module-local registration block (see SKILL.md).'
  );
}
process.exit(1);
