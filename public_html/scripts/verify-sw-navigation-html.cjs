#!/usr/bin/env node
/*
 * G7 — Service-Worker navigation Content-Type guard.
 *
 * Prevents the 12.51.22 defect class from ever shipping again:
 *   A navigation Response built in sw.js MUST force `Content-Type:
 *   text/html; charset=utf-8`, otherwise a cached/transient bad-type copy
 *   makes the browser render index.html SOURCE as plain text on refresh
 *   (the "text leaking on refresh" bug).
 *
 * Blocking (exit 1) if a HTML navigation Response fails to set the explicit
 * text/html header. WARN-only would be insufficient — this class causes
 * silent, user-visible breakage on every refresh.
 *
 * Scope: only asserts on NAVIGATION responses — those whose body is HTML
 * (built from injectISGState(injected) or a cached HTML body). Non-HTML
 * responses (e.g. the ISG JSON data blob, error() responses) are ignored.
 *
 * No network, no deps. Reads sw.js from disk (path arg or default).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const repo = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const swPath = path.join(repo, 'sw.js');

function fail(msg) {
  console.error('G7 FAIL: ' + msg);
  process.exit(1);
}

if (!fs.existsSync(swPath)) {
  // sw.js absent in this checkout — not our concern, skip (warn, don't block).
  console.log('G7 SKIP: sw.js not found at ' + swPath);
  process.exit(0);
}

const src = fs.readFileSync(swPath, 'utf8');
const HTML_TYPE = "text/html; charset=utf-8";
const setRe = /set\(\s*['"]Content-Type['"]\s*,\s*['"]text\/html; charset=utf-8['"]\s*\)/;

// A navigation response is one of:
//   (A) built right after `injectISGState(`  -> the HTML shell injection.
//   (B) built from `cached.arrayBuffer()`/`cached.body` in the cache.match fallback.
// Walk `new Response(` occurrences; classify each by looking BACKWARDS ~700
// chars for an HTML-navigation signal, and forwards for the header set.
const re = /new Response\(/g;
let m;
let nav = 0;
let navHtml = 0;

while ((m = re.exec(src)) !== null) {
  const start = m.index;
  const before = src.slice(Math.max(0, start - 800), start);
  const isNav =
    /\binjectISGState\s*\(/.test(before) ||       // (A) HTML shell injection
    /cached\.arrayBuffer\(\)|cached\.body/.test(before); // (B) cached HTML fallback

  if (!isNav) continue; // non-navigation response (JSON blob, error, etc.)
  nav++;
  // The Content-Type set may sit on the Headers var BEFORE the Response ctor
  // (e.g. `var navHeaders = new Headers(res.headers); navHeaders.set(...);
  //  var injectedRes = new Response(injected, { headers: navHeaders })`) — so
  // scan a window both before and after the constructor for the set().
  const window = src.slice(Math.max(0, start - 900), start + 300);
  if (setRe.test(window)) {
    navHtml++;
  } else {
    const ln = src.slice(0, start).split('\n').length;
    console.error(
      '  G7: navigation `new Response(` at sw.js:' + ln +
      ' does NOT force Content-Type: "' + HTML_TYPE + '"'
    );
  }
}

if (nav === 0) {
  fail('no HTML navigation `new Response(` in sw.js — expected at least the index shell (injectISGState / cache fallback).');
}

if (navHtml < nav) {
  fail(
    (nav - navHtml) +
    ' HTML navigation Response(s) in sw.js do NOT force Content-Type: "' +
    HTML_TYPE + '". This is the 12.51.22 text-leak defect class. Fix sw.js before pushing.'
  );
}

// Defence-in-depth: never pass the raw `res.headers`/`cached.headers` clone
// through to a navigation Response without explicitly forcing text/html.
if (/headers:\s*res\.headers|headers:\s*cached\.headers/.test(src)) {
  fail(
    'sw.js passes a raw `headers:` clone to a navigation Response without ' +
    'forcing text/html (12.51.22 defect class). Wrap in `new Headers(...)` and set ' +
    'Content-Type explicitly.'
  );
}

// v12.51.27 regression guard: the networkFirstWithISG `.catch` fallback must
// fall back to the cached SPA shell when the exact deep-link URL is not cached
// (client-side deep links like /applications/f_xxx are reached via pushState,
// never a network fetch, so they're almost never in the SW cache). Without the
// shell fallback, a network failure returns Response.error() -> blank page ->
// "routing breaks on refresh". Assert the catch block reaches for '/' (shell).
// Anchor on the FUNCTION DEFINITION (not the first textual mention, which may
// be an unrelated .catch like tryPhp's), then find its .catch.
const fnIdx = src.indexOf('function networkFirstWithISG');
if (fnIdx === -1) {
  fail('sw.js has no networkFirstWithISG function definition.');
}
const fnBlock = src.slice(fnIdx);
const catchIdx = fnBlock.indexOf('.catch(function');
if (catchIdx === -1) {
  fail('sw.js networkFirstWithISG has no .catch fallback for navigation failures.');
}
const afterCatch = fnBlock.slice(catchIdx);
// Scan a generous window after the .catch for the shell fallback.
// The shell fallback (cache.match('/') then cache.match('/index.html'))
// appears inside the first .catch body, ~1400 chars in, so scan far enough.
const windowAfter = afterCatch.slice(0, 2500);
// Require the SHELL fallback: cache.match('/') (SPA shell) must appear
// before any cache.match('/index.html') so that a deep-link refresh that
// misses the network falls back to the cached shell, not Response.error().
const shellMatch = /cache\.match\(\s*['"]\/['"]\s*\)/.test(windowAfter);
const indexHtmlFallback = /cache\.match\(\s*['"]\/index\.html['"]\s*\)/.test(windowAfter);
if (!shellMatch || !indexHtmlFallback) {
  fail(
    'sw.js navigation `.catch` does NOT fall back to the cached SPA shell ' +
    '(cache.match("/") then cache.match("/index.html")). A network failure ' +
    'on a deep-link refresh would then return Response.error() and blank ' +
    'the page (12.51.27 deep-link-refresh defect class). Restore the shell ' +
    'fallback before pushing.'
  );
}

console.log(
  'G7 OK: ' + navHtml + '/' + nav +
  ' HTML navigation Response(s) force Content-Type: "' + HTML_TYPE + '"' +
  '; deep-link shell fallback present'
);
process.exit(0);
