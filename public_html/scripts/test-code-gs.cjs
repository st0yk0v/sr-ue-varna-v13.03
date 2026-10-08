#!/usr/bin/env node
/**
 * Executable test for gas/code.gs.
 *
 * Apps Script has no local runtime, so we stub the Google globals
 * (ContentService, HtmlService, Session, SpreadsheetApp) and run code.gs in a
 * real VM context. This exercises the ACTUAL dispatch, domain gate, registry
 * and response shaping — not just a parse.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'gas', 'code.gs');
let passed = 0, failed = 0;

function check(name, ok, detail) {
  (ok ? passed++ : failed++);
  console.log(`  [${ok ? 'OK' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

/** Build a fresh sandbox. activeEmail=null simulates a stateless api.php call. */
function makeSandbox(activeEmail) {
  const sandbox = {
    console,
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) {
        return { _text: text, _mime: null,
                 setMimeType(m) { this._mime = m; return this; } };
      }
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      // No index.html in the project → doGet must fall back to JSON.
      createHtmlOutputFromFile() { throw new Error('index not found'); }
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => activeEmail || '' })
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheets: () => [{}, {}, {}] })
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'code.gs' });
  return sandbox;
}

/** Invoke doPost / doGet and parse the JSON the handler produced. */
function call(sandbox, fnName, body, query) {
  const e = {};
  if (body) e.postData = { contents: JSON.stringify(body) };
  if (query) e.parameter = query;
  const out = sandbox[fnName](e);
  return { mime: out._mime, json: JSON.parse(out._text) };
}

console.log('=== gas/code.gs behaviour ===\n');

// ── Baseline: no action ────────────────────────────────────────────────────
let s = makeSandbox(null);
let r = call(s, 'doPost', {});
check('POST without action -> NO_ACTION', r.json.code === 'NO_ACTION' && r.json.success === false);
check('response mime is JSON', r.mime === 'application/json', r.mime);
check('_timing is attached', !!r.json._timing && r.json._timing.server_version === '12.47.0');

// ── Ultra-light actions bypass auth ───────────────────────────────────────
r = call(s, 'doPost', { action: 'ping' });
check('ping works unauthenticated', r.json.success === true && r.json.ping === 'pong');
r = call(s, 'doGet', null, { action: 'getversion' });
check('GET getversion returns JSON version', r.json.success === true && r.json.version === '12.47.0');
check('getversion reports handler count', typeof r.json.handlers === 'number' && r.json.handlers >= 4,
      'handlers=' + r.json.handlers);

// ── Domain gate ───────────────────────────────────────────────────────────
r = call(s, 'doPost', { action: 'listactions' });
check('protected action without identity -> AUTH_REQUIRED', r.json.code === 'AUTH_REQUIRED');

r = call(s, 'doPost', { action: 'listactions', email: 'someone@gmail.com' });
check('foreign domain rejected -> DOMAIN_NOT_ALLOWED', r.json.code === 'DOMAIN_NOT_ALLOWED');

r = call(s, 'doPost', { action: 'listactions', email: 'yonistoykov@ue-varna.bg' });
check('institutional email accepted', r.json.success === true && Array.isArray(r.json.actions));
check('listactions includes built-ins',
      ['getsystemhealth', 'getversion', 'listactions', 'ping'].every(a => r.json.actions.includes(a)),
      (r.json.actions || []).join(','));

// Session identity must win over a spoofed body email.
s = makeSandbox('attacker@gmail.com');
r = call(s, 'doPost', { action: 'listactions', email: 'yonistoykov@ue-varna.bg' });
check('session identity overrides body email (no spoofing)',
      r.json.code === 'DOMAIN_NOT_ALLOWED' && r.json.email === 'attacker@gmail.com');

s = makeSandbox('yonistoykov@ue-varna.bg');
r = call(s, 'doPost', { action: 'getsystemhealth' });
check('valid session passes the gate', r.json.success === true);
check('health reports spreadsheet + sheets',
      r.json.checks.spreadsheet === 'ok' && r.json.checks.sheets === 3);

// Public GET actions skip the gate entirely.
s = makeSandbox(null);
r = call(s, 'doGet', null, { action: 'getsystemhealth' });
check('public GET action skips gate', r.json.success === true);

// ── Unknown action ────────────────────────────────────────────────────────
r = call(s, 'doPost', { action: 'nope', email: 'a@ue-varna.bg' });
check('unknown action -> UNKNOWN_ACTION', r.json.code === 'UNKNOWN_ACTION');

// ── Action aliases + case-insensitivity ───────────────────────────────────
r = call(s, 'doPost', { method: 'PING' });
check('alias "method" + uppercase resolves', r.json.ping === 'pong');

// ── Registry: custom handlers, errors, ctx ────────────────────────────────
s = makeSandbox('user@ue-varna.bg');
vm.runInContext(`
  ERP_REGISTER_HANDLERS({
    echo: function (body, ctx) { return { got: body.value, who: ctx.email, isGet: ctx.isGet }; },
    boom: function () { throw new Error('deliberate failure'); },
    bare: function () { return; }
  });
`, s);
r = call(s, 'doPost', { action: 'echo', value: 42 });
check('custom handler runs, ctx populated',
      r.json.got === 42 && r.json.who === 'user@ue-varna.bg' && r.json.isGet === false);
check('success defaults to true', r.json.success === true);

r = call(s, 'doPost', { action: 'boom' });
check('handler throw -> HANDLER_ERROR (no crash)',
      r.json.code === 'HANDLER_ERROR' && /deliberate failure/.test(r.json.error));
check('failing action is named in the error', r.json.action === 'boom');

r = call(s, 'doPost', { action: 'bare' });
check('handler returning undefined -> success', r.json.success === true);

// ── Payload slimming (parity with GAS.GS jsonResponse_) ───────────────────
vm.runInContext(`
  ERP_REGISTER_HANDLERS({
    slim: function () { return { keep: 'yes', n: 0, f: false, dropNull: null, dropEmpty: '', dropArr: [] }; }
  });
`, s);
r = call(s, 'doPost', { action: 'slim' });
check('null/""/[] stripped from response',
      !('dropNull' in r.json) && !('dropEmpty' in r.json) && !('dropArr' in r.json));
check('falsy-but-meaningful values kept (0, false)',
      r.json.n === 0 && r.json.f === false && r.json.keep === 'yes');

// ── doGet without action, no index.html ───────────────────────────────────
r = call(s, 'doGet', null, {});
check('GET without action degrades to JSON, not an HTML error',
      r.json.success === true && r.json.version === '12.47.0');

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);
