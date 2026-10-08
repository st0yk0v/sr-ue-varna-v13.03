#!/usr/bin/env node
'use strict';
/**
 * verify-modal-guards.cjs — assert every bare usage of the three cross-bundle modals
 * in app.js is preceded by a `typeof Name === 'function' &&` guard on the same line.
 *
 * Usage: node scripts/verify-modal-guards.cjs
 * Exit 0 = all guarded. Exit 1 + reports each unguarded bare ref.
 *
 * The three modals that originate from other bundles (views-bundle.js / components.js)
 * and are referenced bare in app.js JSX:
 *   ProfileSettingsModal     — defined in views-bundle.js
 *   AccessibilityStatementModal — defined in components.js
 *   QAModal                   — defined in components.js (already guarded, checked too)
 *
 * A bare ref is a token `Name` used in a JSX e(...) call that is NOT preceded by
 * `typeof Name === 'function'` on the same logical line.
 */

const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'js', 'app.js');
if (!fs.existsSync(appPath)) {
  console.error('ERROR: js/app.js not found at', appPath);
  process.exit(2);
}

const src = fs.readFileSync(appPath, 'utf8');
const lines = src.split('\n');

const MODALS = ['ProfileSettingsModal', 'AccessibilityStatementModal', 'QAModal'];

// For each modal name, find every bare usage line and check the guard.
let unguarded = [];

for (const name of MODALS) {
  const lineRe = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!lineRe.test(line)) continue;

    // Skip comment lines and string-only occurrences (e.g. in _POLL_VIEWS arrays)
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // A "bare" usage means the name appears as a JS identifier (not inside a string).
    // Heuristic: the line contains the name AND also contains `e(` (JSX.createElement call),
    // and the name is NOT inside a single/double-quoted string literal on that line.
    //
    // We do a simple single-line string-strip: remove quoted substrings, then check.
    let stripped = line;
    // remove double-quoted strings
    stripped = stripped.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, '');
    // remove single-quoted strings
    stripped = stripped.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '');
    // remove backtick template literals (non-greedy, no nested backticks)
    stripped = stripped.replace(/`[^`]*`/g, '');

    if (!lineRe.test(stripped)) continue; // name only appeared inside a string → not a bare ref

    // Now check: is it preceded by `typeof Name === 'function'`?
    // Build the guard regex for this specific name.
    const guardRe = new RegExp(
      'typeof\\s+' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '\\s*===\\s*[\'"]function[\'"]\\s*&&'
    );

    if (!guardRe.test(line)) {
      unguarded.push({ name, line: i + 1, text: line.trim() });
    }
  }
}

if (unguarded.length === 0) {
  console.log('PASS: all ' + MODALS.length + ' modal refs in app.js have typeof guards.');
  process.exit(0);
}

console.error('FAIL: ' + unguarded.length + ' unguarded bare modal ref(s) in app.js:');
for (const u of unguarded) {
  console.error('  line ' + u.line + ': ' + u.text);
}
process.exit(1);
