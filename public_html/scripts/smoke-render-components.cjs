#!/usr/bin/env node
/**
 * scripts/smoke-render-components.cjs
 *
 * Regression gate for the no-build legacy frontend (js/components.js).
 *
 * WHY THIS EXISTS
 *   Two production crashes (2026-08-18) came from the DocumentPreviewModal's
 *   drivefilemeta preflight referencing variables that only exist in
 *   InlineDocEditorModal's scope (_driveFid, then isGoogleDoc/isGoogleSheet/
 *   hasEmbed). Those refs sat in a useEffect *dependency array*, which real
 *   React evaluates at render time — so the modal exploded the instant it
 *   opened. A plain `node --check` (syntax only) and a grep-based test BOTH
 *   missed it, because the error is a runtime undefined-reference, not a
 *   syntax error.
 *
 * WHAT IT DOES
 *   Loads js/components.js in a VM with minimal React/ReactDOM/DOM shims and
 *   actually RENDERS every component function (createElement calls function
 *   types) AND evaluates every useEffect dependency array + effect body. Any
 *   ReferenceError in a modal's render/effect path throws here, exactly as it
 *   would in the browser.
 *
 * RUN: node scripts/smoke-render-components.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'js', 'components.js');
let passed = 0, failed = 0;
const check = (n, ok, d) => { ok ? passed++ : failed++; console.log(`  [${ok ? 'OK' : 'FAIL'}] ${n}${d ? ' — ' + d : ''}`); };

const noop = function () {};
const reactShim = {
  createElement: function (type, props) {
    const children = Array.prototype.slice.call(arguments, 2);
    const node = { type: type, props: props || {}, children: children };
    // Render function components so their body (and useEffect calls) run.
    if (typeof type === 'function') { try { type.call(null, props || {}); } catch (e) { throw e; } }
    return node;
  },
  Fragment: { __frag: true },
  useState: function (v) { return [typeof v === 'function' ? v() : v, noop]; },
  useEffect: function (fn, deps) {
    // Real React evaluates the deps array at call time → surfaces ReferenceErrors.
    if (deps && deps.length) { for (let i = 0; i < deps.length; i++) { void deps[i]; } }
    try { if (typeof fn === 'function') fn(); } catch (e) { /* ignore async/side-effect throws */ }
  },
  useCallback: function (f) { return f; },
  useRef: function (v) { return { current: v || null }; },
  useMemo: function (f) { return f(); },
  useReducer: function (s, i) { return [i, noop]; },
  forwardRef: function (c) { return c; },
  createContext: function () { return { Provider: function () { return null; }, Consumer: function () { return null; } }; },
  useContext: function () { return {}; },
  memo: function (c) { return c; },
  Component: function () {},
  Children: { map: function () { return []; }, count: function () { return 0; }, toArray: function () { return []; } }
};
const sandbox = {
  console: { log: noop, error: noop, warn: noop, info: noop, debug: noop },
  window: {
    addEventListener: noop, removeEventListener: noop,
    location: { protocol: 'https:', origin: 'https://sr-ue-varna.com', href: 'https://sr-ue-varna.com/' },
    open: noop, matchMedia: function () { return { matches: false, addListener: noop, removeListener: noop, addEventListener: noop, removeEventListener: noop }; },
    scrollY: 0, pageYOffset: 0, innerWidth: 1280, innerHeight: 800,
    dispatchEvent: noop, _safeSS: { getItem: function () { return null; }, setItem: noop },
    CustomEvent: function () {}, MutationObserver: function () { return { observe: noop, disconnect: noop }; },
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop
  },
  document: {
    addEventListener: noop, removeEventListener: noop,
    getElementById: function () { return null; }, querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    createElement: function () { return { style: {}, classList: { add: noop, remove: noop, contains: function () { return false; } }, appendChild: noop, setAttribute: noop }; },
    body: { classList: { add: noop, remove: noop, contains: function () { return false; } }, style: {}, dataset: {} },
    documentElement: { classList: { add: noop, remove: noop, contains: function () { return false; } }, clientWidth: 1280 },
    createTextNode: function () { return {}; }, createEvent: function () { return {}; }
  },
  React: reactShim,
  ReactDOM: { render: noop, createPortal: function (n) { return n; }, findDOMNode: function () { return null; } },
  fetch: function () { return Promise.resolve({ json: function () { return Promise.resolve({}); }, ok: true, text: function () { return Promise.resolve(''); } }); },
  XMLHttpRequest: function () { return { open: noop, send: noop, setRequestHeader: noop, getAllResponseHeaders: function () { return ''; } }; },
  setTimeout: noop, setInterval: noop, clearTimeout: noop, clearInterval: noop,
  navigator: { userAgent: 'node', language: 'bg' },
  location: { protocol: 'https:', origin: 'https://sr-ue-varna.com', href: 'https://sr-ue-varna.com/' },
  CustomEvent: function () {}, MutationObserver: function () { return { observe: noop, disconnect: noop }; },
  HTMLIFrameElement: function () {}
};
sandbox.global = sandbox; sandbox.self = sandbox;
sandbox.window.React = reactShim; sandbox.window.ReactDOM = sandbox.ReactDOM;
sandbox.window.document = sandbox.document;
vm.createContext(sandbox);

let evalError = null;
try {
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sandbox, { filename: 'components.js' });
} catch (e) { evalError = e; }

check('components.js module + all component renders evaluate without ReferenceError',
  !evalError, evalError ? (evalError.message + '\n' + (evalError.stack || '').split('\n').slice(0, 4).join('\n')) : null);

console.log(`\n=== SMOKE-RENDER: ${passed} passed, ${failed} failed ===`);
process.exit(failed ? 1 : 0);
