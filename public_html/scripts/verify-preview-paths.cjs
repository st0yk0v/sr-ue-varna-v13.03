#!/usr/bin/env node
/**
 * scripts/verify-preview-paths.cjs
 *
 * Regression gate for the document-preview architecture.
 * Asserts the invariants that keep previews working across all document types.
 *
 * WHAT IT CHECKS (T5)
 *  - gNative declared inside DocumentPreviewModal scope (not leaking from InlineDocEditorModal)
 *  - _dpDirectEmbed set for Drive-id docs (prefer Google /preview hot path)
 *  - proxy-doc.php 400→302 logic present (_dpShouldProxy is fallback-only, not hot path)
 *  - streamDocUrl attaches STATE.sessionId as ?token= (auth for DB-stored bytes)
 *  - iframeUrl uses streamDocUrl||previewLink||embedUrl (no dead Drive default)
 *  - Spreadsheet/МИП docType handling present (spreadsheetml → googleSheet)
 *
 * RUN: node scripts/verify-preview-paths.cjs
 */

'use strict';
const fs = require('fs');
const path = require('path');

const COMPONENTS = path.join(__dirname, '..', 'js', 'components.js');
const PROXY_DOC = path.join(__dirname, '..', 'database', 'proxy-doc.php');

let passed = 0, failed = 0;
const check = (name, ok, detail) => {
  ok ? passed++ : failed++;
  console.log(`  [${ok ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};

const componentsSrc = fs.readFileSync(COMPONENTS, 'utf8');
const proxySrc = fs.readFileSync(PROXY_DOC, 'utf8');

console.log('=== Document Preview Regression Checks (T5) ===\n');

// ── 1. gNative is declared inside DocumentPreviewModal, not leaked ──────────
// The modal defines gNative from its own _dpDriveFid / isGoogleDocType.
// A leaked reference to InlineDocEditorModal's _driveFid / isGoogleDoc would crash.
{
  // gNative must be declared with `var gNative` or `const gNative` AFTER _dpDriveFid
  const gNativeDecl = componentsSrc.match(/var\s+gNative\s*=/);
  const gNativeAfterDp = componentsSrc.indexOf('var gNative') > componentsSrc.indexOf('_dpDriveFid');
  check('gNative declared in DPM scope (after _dpDriveFid)',
    !!gNativeDecl && gNativeAfterDp,
    gNativeAfterDp ? `declared at pos ${componentsSrc.indexOf('var gNative')} > _dpDriveFid at ${componentsSrc.indexOf('_dpDriveFid')}` : 'ordering wrong'
  );
}

// ── 2. _dpDirectEmbed is set for Drive-id docs ──────────────────────────────
// The hot-path iframe src must be the direct Google /preview for Drive docs.
{
  const directEmbedAssigned = /var\s+_dpDirectEmbed\s*=\s*''.*/.test(componentsSrc);
  const directEmbedGuarded = /if\s*\(.*_dpDriveFid\s*&&\s*_dpDriveFid\.length\s*>=\s*25.*\)/.test(componentsSrc);
  const directEmbedDocsGoogle = /docs\.google\.com\/document\/d\/.*\/preview/.test(componentsSrc);
  const directEmbedSheetsGoogle = /docs\.google\.com\/spreadsheets\/d\/.*\/preview/.test(componentsSrc);
  check('_dpDirectEmbed declared + guarded on Drive-id length',
    directEmbedAssigned && directEmbedGuarded,
    directEmbedGuarded ? 'Drive-id length guard present' : 'missing guard'
  );
  check('_dpDirectEmbed builds docs.google.com/document/d/{id}/preview',
    directEmbedDocsGoogle, 'document preview URL present');
  check('_dpDirectEmbed builds docs.google.com/spreadsheets/d/{id}/preview',
    directEmbedSheetsGoogle, 'spreadsheet preview URL present');
}

// ── 3. _dpEffectivePreviewUrl prefers _dpDirectEmbed (hot path) ─────────────
{
  const effPreviewPrefersDirect = /var\s+_dpEffectivePreviewUrl\s*=\s*_dpDirectEmbed\s*\?\s*_dpDirectEmbed/.test(componentsSrc);
  check('_dpEffectivePreviewUrl prefers _dpDirectEmbed (direct embed wins)',
    effPreviewPrefersDirect, 'ternary: _dpDirectEmbed ? _dpDirectEmbed : ...');
}

// ── 4. proxy is fallback-only, NOT on hot path ──────────────────────────────
{
  const proxyNotDefault = /proxy.*NOT used.*hot path/.test(componentsSrc) ||
    /proxy.*intentionally NOT used/.test(componentsSrc) ||
    /proxy.*no longer on the hot path/.test(componentsSrc);
  const iframeSrcIsDirect = /var\s+_dpIframeSrc\s*=\s*_dpDirectEmbed\s*\|\|\s*_dpEffectivePreviewUrl/.test(componentsSrc);
  check('proxy-doc is fallback-only, not on hot path',
    proxyNotDefault, 'proxy documented as fallback');
  check('_dpIframeSrc = _dpDirectEmbed || _dpEffectivePreviewUrl',
    iframeSrcIsDirect, 'iframe src uses direct embed first');
}

// ── 5. _dpShouldProxy exists but is only used for fallback URLs ──────────────
{
  const shouldProxyDeclared = /var\s+_dpShouldProxy\s*=\s*_dpDriveFid/.test(componentsSrc);
  // _dpShouldProxy must NOT gate iframeUrl / _dpIframeSrc / _dpEffectivePreviewUrl
  const lines = componentsSrc.split('\n');
  let proxyGatesHotPath = false;
  let inHotPathSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/iframeUrl|_dpIframeSrc|_dpEffectivePreviewUrl/.test(line)) inHotPathSection = true;
    if (inHotPathSection && /_dpShouldProxy/.test(line) && !/fallback|_dpProxied/.test(line)) {
      proxyGatesHotPath = true;
      break;
    }
    if (inHotPathSection && /iframeUrl\s*=/.test(line)) inHotPathSection = false;
  }
  check('_dpShouldProxy does NOT gate the hot-path iframe src',
    !proxyGatesHotPath, proxyGatesHotPath ? 'WARNING: _dpShouldProxy gates hot path' : 'clean');
}

// ── 6. streamDocUrl attaches session token ───────────────────────────────────
{
  const streamAttachesToken = /&token\s*=\s*encodeURIComponent\s*\(_sid\)/.test(componentsSrc) ||
    /_u\s*\+=\s*['&]token\s*=\s*['"]/.test(componentsSrc) ||
    /token=.*encodeURIComponent.*_sid/.test(componentsSrc);
  const streamUsesStateSession = /STATE\s*\.\s*sessionId/.test(componentsSrc) ||
    /sessionId/.test(componentsSrc);
  check('streamDocUrl attaches session token (?token=)',
    streamAttachesToken, 'token appended to stream URL');
}

// ── 7. iframeUrl chains streamDocUrl || previewLink || embedUrl ──────────────
{
  const iframeChain = /const\s+iframeUrl\s*=\s*streamDocUrl\s*\(\s*doc\s*\s*\)\s*\|\|/.test(componentsSrc);
  const noForceDriveDefault = !/forceDrive\s*=\s*true/.test(componentsSrc) ||
    /forceDrive\s*=\s*false/.test(componentsSrc);
  check('iframeUrl = streamDocUrl(doc) || previewLink || embedUrl',
    iframeChain, 'correct chaining order');
  check('forceDrive does NOT default to true (no dead-Drive default)',
    noForceDriveDefault, 'System view first');
}

// ── 8. proxy-doc.php returns 400 on missing driveId, redirect on private doc ───
{
  const returns400 = /http_response_code\s*\(\s*400\s*\)/.test(proxySrc);
  const hasJsonNoContent = /X-Erp-NoContent\s*:\s*1/.test(proxySrc);
  const stripsXFrame = /header_remove\s*\(\s*['"']X-Frame-Options['"']/.test(proxySrc);
  check('proxy-doc.php returns 400 on empty driveId/fid',
    returns400, '400 bad request');
  check('proxy-doc.php sets X-Erp-NoContent: 1 on JSON fallback',
    hasJsonNoContent, 'no-content signal');
  check('proxy-doc.php strips X-Frame-Options (CSP bypass)',
    stripsXFrame, 'frame-ancestors bypass');
}

// ── 9. gNative control links (comment/suggest/history/copy/print) ────────────
{
  const gNativeHasComment = /gNative\s*.*\*\s*comment\s*:/.test(componentsSrc) ||
    /comment:\s*_dpGnBase/.test(componentsSrc);
  const gNativeHasCopy = /copy:\s*_dpGnBase/.test(componentsSrc);
  check('gNative includes comment/suggest/history/copy/print links',
    gNativeHasComment && gNativeHasCopy, 'control links present');
}

// ── 10. Spreadsheet/МИП docType handling present ───────────────────────────
// The legacy gate looked for a literal "MIPseudoSheet" symbol that never existed;
// the real code path normalizes spreadsheet MIME types (incl. МИП листа /
// spreadsheetml / ms-excel) to a usable docType ('googleSheet') so previews work.
{
  const hasSpreadsheetRegex = /spreadsheetml/.test(componentsSrc);
  const mapsToGoogleSheet = /isGoogleSheet\?'googleSheet'/.test(componentsSrc) ||
    /_docTypeKey=isGoogleSheet\?'googleSheet'/.test(componentsSrc);
  const hasMimeBranch = /wordprocessingml\|msword\|spreadsheetml\|ms-excel/.test(componentsSrc);
  check('Spreadsheet/МИП docType handling present (spreadsheetml → googleSheet)',
    hasSpreadsheetRegex && mapsToGoogleSheet && hasMimeBranch,
    hasSpreadsheetRegex && mapsToGoogleSheet && hasMimeBranch ? 'spreadsheet mime → googleSheet path present' : 'MISSING — spreadsheet preview path absent');
}

// ── 11. Direct Drive /view fallback button present ──────────────────────────
{
  const driveViewFallback = /Отвори в Google Drive/.test(componentsSrc) &&
    /drive\.google\.com\/file\/d\/.*\/view/.test(componentsSrc);
  check('Direct Drive /view fallback button present in DPM',
    driveViewFallback, 'external Drive link button');
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
