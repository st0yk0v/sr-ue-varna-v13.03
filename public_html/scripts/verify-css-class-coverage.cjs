#!/usr/bin/env node
/**
 * scripts/verify-css-class-coverage.cjs — UEV-ERP CSS-class coverage guard (G6, WARN-only)
 *
 * WHY THIS EXISTS
 *   The 12.49.60 reconciliation ran a one-off CSS-class coverage audit (every className referenced
 *   by served JS is defined in some stylesheet) and reported 0 gaps. That audit was NEVER persisted
 *   as a guard — the same gap that let the dead-feature class (G3, 12.49.44-51) ship repeatedly
 *   before becoming permanent. This script makes the check durable so a future CSS edit / class
 *   rename / deleted or unlinked stylesheet cannot silently break styling in prod.
 *
 *   This is a WARN-only residual check, not a BLOCK-class guard: a missing class definition yields a
 *   broken/blank-styled panel but is NOT a hard 404/500/dead-feature (those are G2/G3 territory).
 *   It is wired WARN-only into deploy.sh / deploy-putty.sh / pre-commit-guard.sh, exactly like G5
 *   (dark-mode coverage). Its job: make the residual VISIBLE + trackable, with a negative control.
 *
 * WHAT IT CHECKS (advisory, exit 0 always)
 *   1. Build the LOCAL served-CSS universe: every root-relative href="…css" linked by index.html
 *      (styles.css, styles-responsive.css, css/uev-dark-mode.css, js-features-X.css), minus query
 *      string (?v=).
 *   2. Build the EXTERNAL served-CSS universe: every absolute http(s) CSS href linked by index.html
 *      (e.g. Font Awesome from cdnjs). These classes are provided by a third party, so a referenced
 *      `fa-…`/`fas` class is NOT a defect even though it's absent from local CSS. The list of
 *      external origins is printed for transparency.
 *   3. Extract every CSS class SELECTOR defined in the local + external stylesheets by fetching the
 *      external ones over HTTPS and running a regex over both.
 *   4. Walk every served non-vendor JS file (index.html script refs + js/*.js, excluding
 *      /vendor/ which is third-party) and extract className tokens in all real forms:
 *      className="…", className:'…', class:"…", cx("…"), cls('…'), classnames(…).
 *   5. For each referenced class, report it as a GAP only if it is defined by NEITHER local NOR
 *      external CSS.
 *
 * NEGATIVE CONTROL
 *   Injects a synthetic referenced-but-undefined class into a temp served JS file copy and asserts
 *   the detector flags it. If it does NOT, the detector is broken (exit 3) — same discipline as
 *   G3/G4/G5. The negative control does NOT change the repo (temp file is created and deleted).
 *
 * USAGE
 *   node scripts/verify-css-class-coverage.cjs          # WARN report, exit 0
 *   node scripts/verify-css-class-coverage.cjs --strict # exit 2 if any real gap
 *                                                  (NOT used by deploy; exposed for CI opt-in)
 *
 * NOTE on `node_modules` / `.git/worktrees`: the repo ships stray worktree dirs and a stale
 * build/; this script reads ONLY files linked by index.html + js/*.js (non-vendor), so it is
 * immune to those. It does NOT touch the network for local CSS.
 */

'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = path.resolve(__dirname, '..');
const INDEX_HTML = path.join(REPO, 'index.html');

function localCss() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const out = [];
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*?\.css)(?:\?[^"]*)?"/g)) {
    out.push(path.join(REPO, m[1].replace(/^\/+/, ''))); // root-relative -> repo-relative
  }
  return out.filter((p) => fs.existsSync(p));
}

function externalCss() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const out = [];
  for (const m of html.matchAll(/(?:href|src)="(https:\/\/[^"]+?\.css[^"]*)"/g)) {
    out.push(m[1]);
  }
  return out;
}

function servedJs() {
  const files = new Set();
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(js\/[^"]+\.js)"/g)) files.add(m[1]);
  const jsDir = path.join(REPO, 'js');
  for (const p of fs.readdirSync(jsDir)) if (p.endsWith('.js')) files.add('js/' + p);
  return [...files]
    .filter((p) => !p.includes('/vendor/'))
    .map((p) => path.join(REPO, p))
    .filter((p) => fs.existsSync(p));
}

function definedClassesFromCss(txt) {
  const defs = new Set();
  txt = txt.replace(/\/\*[\s\S]*?\*\//g, ' ');            // strip comments
  txt = txt.replace(/url\([^)]*\)/g, ' ');               // strip url() bodies (class names inside)
  const re = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    const after = txt[m.index + m[0].length];
    if (after === '(' || after === '=') continue; // css function/class attr value, not a selector
    defs.add(m[1].toLowerCase());
  }
  return defs;
}

function referencedClassesFromJs(txt) {
  const refs = [];
  // className="…" | className:'…' | className:"…" | class="…" | cx("…") | cls('…') | classnames("…")
  const re = /(?:\bclassName|\bclass)\s*[:=]\s*["']([^"']+)["']|(?:cx|cls|classnames)\s*\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(txt)) !== null) {
    const s = (m[1] || m[2] || '').trim();
    if (!s) continue;
    for (const tok of s.split(/\s+/)) {
      const t = tok.trim();
      if (t && !t.startsWith('{') && !t.startsWith('$')) refs.push(t);
    }
  }
  return refs;
}

function fetchHttps(url) {
  return new Promise((res) => {
    https.get(url, { timeout: 12000 }, (r) => {
      let d = ''; r.setEncoding('utf8'); r.on('data', (c) => d += c); r.on('end', () => res(d));
    }).on('error', () => res('')).on('timeout', () => res(''));
  });
}

async function run() {
  const strict = process.argv.includes('--strict');
  const localFiles = localCss();
  const extUrls = externalCss();

  const defined = new Set();
  for (const f of localFiles) for (const c of definedClassesFromCss(fs.readFileSync(f, 'utf8'))) defined.add(c);

  const extDefined = new Set();
  for (const u of extUrls) {
    const body = await fetchHttps(u);
    if (body) for (const c of definedClassesFromCss(body)) extDefined.add(c);
  }
  for (const c of extDefined) defined.add(c); // union: any class defined by local OR external CSS

  const served = servedJs();
  // Font Awesome 6 loaded from CDN (index.html links all.min.css). In FA6 the per-icon classes
  // (fa-clipboard-medical, fa-shield-check, …) live in the per-family CSS files that are NOT
  // linked by index.html, so the CDN fetch above only yields the style-family prefixes
  // (fas/far/fal/fat/fade/fab). Those icon classes are PROVIDED by FA at runtime — they are
  // not repo-owned definitions and are therefore not repo defects. We exclude the FA6
  // icon prefix (fa-*) and the FA6 family prefixes explicitly so they do not pollute the
  // gap count; a genuinely-misspelled local class still trips the check.
  const isFaIcon = (t) => /^fa[-]/.test(t) || /^(fas|far|fal|fat|fade|fab)$/i.test(t);
  const missing = new Map();
  for (const f of served) {
    const refs = referencedClassesFromJs(fs.readFileSync(f, 'utf8'));
    const perFile = new Set();
    for (const r of refs) {
      if (isFaIcon(r)) continue;
      if (!defined.has(r.toLowerCase())) perFile.add(r);
    }
    if (perFile.size) missing.set(path.relative(REPO, f), perFile);
  }

  console.log('CSS-CLASS COVERAGE (G6, WARN-only):');
  console.log('  Local CSS : ' + localFiles.map((p) => path.relative(REPO, p)).join(', '));
  console.log('  External CSS: ' + (extUrls.length ? extUrls.join(', ') : '(none)'));
  console.log('  Defined class selectors (local+external union): ' + defined.size);
  let total = 0;
  for (const [f, set] of [...missing.entries()].sort((a, b) => b[1].size - a[1].size)) {
    total += set.size;
    console.log('  ' + String(set.size).padStart(4) + '  ' + f + '  -> ' + [...set].slice(0, 12).join(' ') + (set.size > 12 ? ' …' : ''));
  }
  const msg = total === 0
    ? 'CSS-CLASS COVERAGE: 0 referenced-but-undefined classes across ' + served.length + ' served JS file(s) / ' + (localFiles.length + extUrls.length) + ' served CSS file(s).'
    : 'CSS-CLASS COVERAGE: ' + total + ' referenced-but-undefined class(es) across ' + missing.size + ' served JS file(s).';
  console.log(msg);
  console.log('CSS-CLASS COVERAGE: WARN-only — does not block deploy. A class in the union of LOCAL + EXTERNAL CSS is satisfied. To clear a class, define it in a local served stylesheet.');

  const { negativeControl } = module.exports;
  const ncOk = negativeControl(defined);
  if (!ncOk) { console.error('CSS-CLASS COVERAGE: NEGATIVE CONTROL FAILED — detector broken (exit 3).'); process.exit(3); }
  if (strict && total > 0) { console.error('CSS-CLASS COVERAGE: --strict and findings > 0 (exit 2).'); process.exit(2); }
  process.exit(0);
}

// exposed so the negative control can be reused by the main pass
module.exports = { negativeControl };

function negativeControl(defined) {
  const served = servedJs();
  if (!served.length) { console.error('NEG-CTRL: no served JS found'); return false; }
  const target = served[0];
  const tmp = target + '.g6neg.tmp';
  const original = fs.readFileSync(target, 'utf8');
  const fake = '__g6neg_class_xyzzy_' + Math.random().toString(36).slice(2);
  const injected = original + '\nvar __g6neg = React.createElement("div", { className: "' + fake + '" });\n';
  fs.writeFileSync(tmp, injected);
  const before = referencedClassesFromJs(original).filter((c) => !defined.has(c.toLowerCase())).length;
  const after = referencedClassesFromJs(injected).filter((c) => !defined.has(c.toLowerCase())).length;
  fs.unlinkSync(tmp);
  const ok = after >= before + 1;
  console.log('NEG-CTRL: injected \'' + fake + '\' className -> undefined count ' + before + ' -> ' + after + ' (' + (ok ? 'PASS' : 'FAIL') + ')');
  return ok;
}

run();
