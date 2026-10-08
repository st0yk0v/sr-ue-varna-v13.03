#!/usr/bin/env node
/**
 * scripts/regress-binary-gate.cjs
 *
 * Permanent regression guard for the "binary office/PDF file dumped into the
 * textarea editor" defect (reports showed a .docx base64 blob inside the
 * editable field). Root cause: a .docx/.xlsx/.pdf whose doc.content was empty
 * at init got its binary bytes fetched lazily and flipped the modal into
 * text-edit mode.
 *
 * This test asserts, against the REAL source of js/components.js, that the
 * guards are present and wired correctly:
 *   1. isBinaryOffice is defined and flags .docx/.xlsx/.pptx/.pdf by name/mime.
 *   2. _contentIsBinary folds isBinaryOffice in (so empty-content office files
 *      are still treated as binary).
 *   3. The textarea render branch is gated by !isBinaryOffice (never shown for
 *      binary office files).
 *   4. handleLoadErpContent bails on isBinaryOffice (no lazy binary fetch into
 *      the editor).
 *
 * Run: node scripts/regress-binary-gate.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'js', 'components.js');
const src = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
const ck = (name, ok, detail) => {
  if (ok) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
};

// 1. isBinaryOffice defined and matches office/pdf extensions
ck('isBinaryOffice defined', /var isBinaryOffice=/.test(src));
ck('isBinaryOffice matches .docx/.xlsx/.pptx/.pdf',
  /isBinaryOffice=\/\\\?\.\(docx\?\|xlsx\?\|pptx\?\|pdf\)\$/.test(src) ||
  /isBinaryOffice=\/\\\.\(docx\?\|xlsx\?\|pptx\?\|pdf\)\$/i.test(src));

// 2. _contentIsBinary folds isBinaryOffice
ck('_contentIsBinary includes isBinaryOffice',
  /var _contentIsBinary=_uevLooksBinaryContent\(docContent\)\|\|isBinaryOffice;/.test(src));

// 3. textarea render branch gated by !isBinaryOffice
ck('textarea render gated by !isBinaryOffice',
  /useTextEditor && !_contentIsBinary && !isBinaryOffice/.test(src));

// 4. handleLoadErpContent bails on binary office
ck('handleLoadErpContent bails on _contentIsBinary||isBinaryOffice',
  /if\(_contentIsBinary\|\|isBinaryOffice\)\{[\s\S]{0,200}setUseTextEditor\(false\)/.test(src));

// 5. _shortDocId helper exists (header UX polish, must not break ids<=12)
ck('_shortDocId helper defined', /function _shortDocId\(id\)\{/.test(src));

console.log(`\n=== BINARY-GATE REGRESSION: ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
