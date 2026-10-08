#!/usr/bin/env node
/*
 * G9 — index.html structural integrity guard.
 *
 * Prevents the 12.51.24 defect class ("Defensive global fallbacks" text leak):
 *   Raw JavaScript that sits OUTSIDE a <script>...</script> block renders as
 *   VISIBLE PAGE TEXT and never executes. The fix (12.51.24) removed such a
 *   block; this guard ensures no similar block can ship again.
 *
 * Checks (all blocking — exit 1 on violation):
 *   1. <script> and </script> tag counts are balanced.
 *   2. No JS-signal text (window./function(/var /__erp_/ etc.) appears in the
 *      page TEXT outside <script>/<style>/<!--comment--> regions.
 *
 * No network, no deps. Accepts an optional repo path arg (default = cwd).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const repo = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const indexPath = path.join(repo, 'index.html');

function fail(msg) {
  console.error('G9 FAIL: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  // index.html absent in this checkout — not our concern.
  console.log('G9 SKIP: index.html not found at ' + indexPath);
  process.exit(0);
}

const html = fs.readFileSync(indexPath, 'utf8');
const opens = (html.match(/<script\b/g) || []).length;
const closes = (html.match(/<\/script>/g) || []).length;
if (opens !== closes) {
  fail(`unbalanced <script> tags in index.html: ${opens} opens vs ${closes} closes. ` +
       'A dangling script tag makes the following text render as visible page text.');
}

// Strip script + style + comment regions, then check remaining TEXT for JS signals.
const noScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ');
const noStyle = noScripts.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ' ');
const noComments = noStyle.replace(/<!--[\s\S]*?-->/g, ' ');
const textOnly = noComments.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const JS_SIGNALS = [
  'window.', 'function(', 'var ', 'const ', 'let ', '=>',
  'JSON.parse', 'addEventListener', '__erp_', 'STATUS_LABELS',
  'ROLE_APPLICANT', 'CKK_MEMBERS', 'PROMISE.reject', 'localStorage',
];
const leaked = JS_SIGNALS.filter(s => textOnly.includes(s));
if (leaked.length) {
  fail('raw JavaScript text found in index.html BODY (outside <script>/<style>/comments): ' +
       JSON.stringify(leaked) + '. This renders as visible page text and never executes ' +
       '(the 12.51.24 leak class). Wrap it in a <script> tag or remove it.');
}

console.log(`G9 OK: index.html structure intact (${opens} balanced script tags, no raw JS in body text)`);
process.exit(0);
