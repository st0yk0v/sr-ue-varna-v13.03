#!/usr/bin/env node
/**
 * verify-preview-contract.cjs — Prop-contract guard for Google iframe document handler
 * fixes (12.51.15–18).
 *
 * Three gate assertions that surface regressions of fixes 12.51.15–18.
 * WARN-only: never blocks a push, but surfaces on every commit via the pre-commit hook.
 *
 * Gates (positive assertion — fix present => OK, fix absent => WARN):
 *  1. driveGone   — `_dpDriveInlineEmbed` is gated on `!driveGone`
 *                  (i.e. the deleted-file guard wraps the Google embed).
 *  2. edit-mode   — `setEditMode(true)` appears inside the `handleToggleEdit` body.
 *  3. native-ctl  — `_dpGnBase` appears in components.js AND `.gnative-group` in css/uev.css.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COMPONENTS = path.join(ROOT, 'js', 'components.js');
const UEV_CSS = path.join(ROOT, 'css', 'uev.css');

let componentsJs = '';
let uevCss = '';
try {
  componentsJs = fs.readFileSync(COMPONENTS, 'utf8');
} catch (e) {
  console.error(`ERROR: Cannot read js/components.js: ${e.message}`);
  process.exit(1);
}
try {
  uevCss = fs.readFileSync(UEV_CSS, 'utf8');
} catch (e) {
  console.error(`ERROR: Cannot read css/uev.css: ${e.message}`);
  process.exit(1);
}

let warns = 0;

// Gate 1: driveGone — _dpDriveInlineEmbed must be gated on !driveGone
// Positive: line ~1210 reads `const _dpDriveInlineEmbed = (... && !driveGone) ? ...`
const driveGoneGate = /_dpDriveInlineEmbed\s*=\s*\([^)]*!driveGone[^)]*\)\s*\?/;
if (driveGoneGate.test(componentsJs)) {
  console.log('OK:   Gate 1 (driveGone) — _dpDriveInlineEmbed gated on !driveGone (12.51.9 fix intact)');
} else {
  console.log('WARN: Gate 1 (driveGone) — _dpDriveInlineEmbed NOT gated on !driveGone (regression risk)');
  warns++;
}

// Gate 2: edit-mode — setEditMode(true) inside handleToggleEdit body
const htMatch = componentsJs.match(/const handleToggleEdit=useCallback\(function\(\)\{([\s\S]*?)\},\[/);
if (htMatch && /setEditMode\(true\)/.test(htMatch[1])) {
  console.log('OK:   Gate 2 (edit-mode) — setEditMode(true) present in handleToggleEdit body (12.51.15 fix intact)');
} else {
  console.log('WARN: Gate 2 (edit-mode) — setEditMode(true) NOT found in handleToggleEdit body (regression risk)');
  warns++;
}

// Gate 3: native-controls — _dpGnBase in components.js AND .gnative-group in css/uev.css
const gnBaseInComponents = /_dpGnBase/.test(componentsJs);
const gnativeGroupInCss = /\.gnative-group/.test(uevCss);
if (gnBaseInComponents && gnativeGroupInCss) {
  console.log('OK:   Gate 3 (native-ctl) — _dpGnBase (components.js) + .gnative-group (css/uev.css) present (12.51.16 fix intact)');
} else {
  const missing = [];
  if (!gnBaseInComponents) missing.push('_dpGnBase in components.js');
  if (!gnativeGroupInCss) missing.push('.gnative-group in css/uev.css');
  console.log('WARN: Gate 3 (native-ctl) — missing: ' + missing.join(', ') + ' (regression risk)');
  warns++;
}

console.log(`\n=== Prop-contract guard: ${warns} warning(s) (WARN-only, never blocks push) ===`);
// Exit 0 regardless — this is a WARN-only guard per the G5/G6 pattern.
process.exit(0);
