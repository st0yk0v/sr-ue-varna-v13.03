#!/usr/bin/env node
/**
 * scripts/verify-darkmode-coverage.cjs  — UEV-ERP dark-mode inline-style guard (G5, WARN-only)
 *
 * WHY THIS EXISTS
 *   The app is variable-driven: css/uev-dark-mode.css swaps the SEMANTIC tokens
 *   (--bg/--ink/--surface/--border/--white/...) so every component that reads
 *   them via var() re-themes automatically when the user toggles dark mode
 *   (app.js toggleTheme → html.theme-dark) or follows the OS preference.
 *
 *   The one class the token swap CANNOT cover is a hardcoded light-color LITERAL
 *   written directly into an inline React style object (e.g. style={{background:'#fff'}}
 *   or style={{color:'white'}}). Those literals stay light even in dark mode and
 *   produce unreadable/broken-looking panels. This is the only remaining E4
 *   ("dark-mode per-view pass") gap: the base + toggle are complete, but ~300+
 *   inline hardcodes were never migrated to the semantic var() tokens.
 *
 *   This is NOT live-breaking (light mode is unaffected; only dark-mode aesthetics
 *   suffer), so the guard is WARN-only — it NEVER blocks a commit or a deploy.
 *   Its job is to make the residual VISIBLE and trackable, and to provide a
 *   negative control proving the detector works.
 *
 * WHAT IT CHECKS (advisory, exit 0 always)
 *   Scans every served non-vendor JS file for hardcoded LIGHT-color literals in an
 *   inline style context:
 *     • color/background/backgroundColor/borderColor/fill/stroke value of
 *       '#fff' / '#ffffff' / '#FFF...' (near-white) or the literal 'white'
 *       (case-insensitive, single/double quoted) or rgb(255,255,255)/rgba(255,255,255,...).
 *   Reports a per-file count + grand total. Prints a one-line summary suitable for
 *   the deploy log.
 *
 * NEGATIVE CONTROL
 *   Injects a synthetic `style={{ background:'#ffffff' }}` into a temp served file,
 *   re-runs the detector, and asserts the count increased by ≥1. If it does NOT,
 *   the detector is broken (exit 3) — same discipline as G3/G4. (The negative
 *   control is a self-test; it does not change the repo.)
 *
 * USAGE
 *   node scripts/verify-darkmode-coverage.cjs            # WARN report, exit 0
 *   node scripts/verify-darkmode-coverage.cjs --strict   # exit 2 if >0 findings
 *                                                          (NOT used by deploy;
 *                                                           exposed for CI opt-in)
 *
 * Intended integration: deploy-putty.sh / deploy.sh run it WARN-only (like G1 in
 * the pre-commit hook) so the count is always surfaced without ever blocking a push.
 */

'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const INDEX_HTML = path.join(REPO, 'index.html');
const JS_DIR = path.join(REPO, 'js');

// light-color literals that break dark mode when hardcoded in inline styles
const LIGHT_PATTERNS = [
  /#f{3,6}\b/i,                          // #fff / #ffffff / #FFF...
  /\bwhite\b/i,                          // literal 'white' / "White"
  /rgb\(\s*255\s*,\s*255\s*,\s*255/i,   // rgb(255,255,255 ...)
  /rgba\(\s*255\s*,\s*255\s*,\s*255/i,  // rgba(255,255,255 ...)
];
// style property names whose value, if a light literal, breaks dark mode
const STYLE_PROP = /(?:color|background|backgroundColor|borderColor|fill|stroke|outlineColor|boxShadow)\s*[:=]/i;

function getServedJs() {
  const files = new Set();
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(js\/[^"]+)"/g)) {
    files.add(m[1]);
  }
  for (const p of fs.readdirSync(JS_DIR)) {
    if (p.endsWith('.js')) files.add('js/' + p);
  }
  // exclude vendor libs (legitimately self-styled, not part of our theme system)
  return [...files]
    .filter((f) => !f.includes('/vendor/'))
    .map((f) => path.join(REPO, f))
    .filter((p) => fs.existsSync(p));
}

function countInFile(absPath) {
  const txt = fs.readFileSync(absPath, 'utf8');
  let count = 0;
  // walk line-by-line to keep matches contextual and avoid cross-line noise
  const lines = txt.split(/\r?\n/);
  for (const line of lines) {
    if (!STYLE_PROP.test(line)) continue;
    for (const re of LIGHT_PATTERNS) {
      if (re.test(line)) { count++; break; }
    }
  }
  return count;
}

function run() {
  const strict = process.argv.includes('--strict');
  const served = getServedJs();
  const perFile = [];
  let total = 0;
  for (const f of served) {
    const c = countInFile(f);
    if (c > 0) {
      perFile.push([path.relative(REPO, f), c]);
      total += c;
    }
  }
  perFile.sort((a, b) => b[1] - a[1]);

  console.log('DARK-MODE COVERAGE (G5, WARN-only):');
  for (const [f, c] of perFile) console.log(`  ${String(c).padStart(4)}  ${f}`);
  console.log(`DARK-MODE COVERAGE: ${total} hardcoded light-color inline-style literal(s) across ${perFile.length} served file(s).`);
  console.log('DARK-MODE COVERAGE: WARN-only — does not block deploy. Migrate to semantic var() tokens (--bg/--surface/--white/--ink) to clear.');
  return { total, perFile, strict };
}

function negativeControl() {
  // inject a synthetic hardcoded-white inline style into a temp served file copy,
  // assert the detector counts it, then remove the temp file.
  const served = getServedJs();
  if (!served.length) { console.error('NEG-CTRL: no served JS found'); return false; }
  const target = served[0];
  const tmp = target + '.g5neg.tmp';
  const original = fs.readFileSync(target, 'utf8');
  const injected = original + '\nconst __g5neg = { style: { backgroundColor: "#ffffff" } };\n';
  fs.writeFileSync(tmp, injected);
  const before = countInFile(target);
  const after = countInFile(tmp);
  fs.unlinkSync(tmp);
  const ok = after >= before + 1;
  console.log(`NEG-CTRL: injected '#ffffff' inline style → count ${before} → ${after} (${ok ? 'PASS' : 'FAIL'})`);
  return ok;
}

// ── main ──────────────────────────────────────────────────────────────────
const { total, strict } = run();
const ncOk = negativeControl();
if (!ncOk) {
  console.error('DARK-MODE COVERAGE: NEGATIVE CONTROL FAILED — detector broken (exit 3).');
  process.exit(3);
}
if (strict && total > 0) {
  console.error('DARK-MODE COVERAGE: --strict set and findings > 0 (exit 2).');
  process.exit(2);
}
// WARN-only: always exit 0 so it never blocks commit/deploy
process.exit(0);
