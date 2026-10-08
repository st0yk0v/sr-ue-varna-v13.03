/* ═══════════════════════════════════════════════════════════════════════════

 *  ERP Service Worker — ИУ-Варна Научноизследователска дейност

 *  Version : synced with window.__ERP_BUILD="13.01.0"

 *

 *  Cache strategy by resource type:

 *  ┌──────────────────────────────────┬──────────────────────────────────┐

 *  │ Resource                         │ Strategy                         │

 *  ├──────────────────────────────────┼──────────────────────────────────┤

 *  │ Local JS / CSS (versioned)       │ Network-First (fresh ?v= build)  │

 *  │ Local images (logos)             │ Cache-First                      │

 *  │ HTML navigation                  │ Network-First → cache fallback   │

 *  │ CDN JS/CSS (React, FontAwesome)  │ Cache-First (stable CDN URLs)    │

 *  │ Google Fonts CSS                 │ Stale-While-Revalidate           │

 *  │ Google Fonts woff2 (immutable)   │ Cache-First                      │

 *  │ GAS API (script.google.com)      │ Network-Only (never cache)       │

 *  │ Google auth (accounts.google.*)  │ Network-Only                     │

 *  │ All non-GET requests             │ Network-Only (side effects)      │

 *  └──────────────────────────────────┴──────────────────────────────────┘

 *

 *  Safety rules:

 *  • Only caches same-status-200 and cors responses — never opaque.

 *  • Never caches POST / PUT / DELETE (GAS API is all POST).

 *  • Bypasses auth and analytics endpoints unconditionally.

 *  • Cache names are versioned so a BUILD bump invalidates stale shell.

 *  • Fonts cache is NOT versioned — Google Fonts URLs are content-addressed.

 * ═══════════════════════════════════════════════════════════════════════════ */



'use strict';



/* ── Version — read from registration URL (?v=…) so it ALWAYS matches

 *    index.html's __ERP_BUILD="13.01.0"

 *    literal only if the parameter is missing (legacy / direct fetch). */

var BUILD = '13.01.0';

try {

  var _verLoc = self.location.href;

  var _verQs  = _verLoc.indexOf('?') >= 0 ? _verLoc.split('?')[1] : '';

  var _verParts = _verQs.split('&');

  for (var _vi = 0; _vi < _verParts.length; _vi++) {

    var _vkv = _verParts[_vi].split('=');

    if (_vkv[0] === 'v' && _vkv[1]) { BUILD = decodeURIComponent(_vkv[1]); break; }

  }

} catch (_) {}



/* ── Cache bucket names ──

 * SW_REV is an INTERNAL service-worker revision. It is appended to the
 * build-specific cache buckets so that ANY edit to this SW file (even when
 * the app BUILD number is unchanged) forces a clean cache take-over on
 * activation: the old `erp-shell-…` / `erp-cdn-…` buckets no longer match
 * the keep-list and are deleted. Bump this string on every SW change. */

var SW_REV = '13.01.0';

var CACHE_SHELL = 'erp-shell-' + BUILD + '-' + SW_REV;   // local JS, CSS, images

var CACHE_CDN   = 'erp-cdn-'   + BUILD + '-' + SW_REV;   // React, FontAwesome CDN assets

var CACHE_FONTS = 'erp-fonts-v1';          // Google Fonts (content-addressed, stable)

var CACHE_DATA  = 'erp-isg-v1';            // Incremental Static Generation — public data refreshed periodically



/* ── ISG: GAS endpoint for public data (read-only, same as prerender.js) ──

 * SECURITY (v6.4.x): The real GAS /exec URL is NEVER stored in this file.

 *

 * The encoded URL is passed at SW registration time via a query parameter

 * from index.html:  /sw.js?gas_url=<encoded-spliced-parts>

 *

 * The SW receives the pre-assembled encoded blob (A+B+C spliced shards),

 * decodes it to the real URL, and uses it ONLY for ISG public-data refresh.

 *

 * If the gas_url parameter is absent (e.g. registration script failed,

 * or the page was loaded without index.html orchestration), ISG is

 * gracefully disabled — no mutation endpoints are affected.

 *

 * There is NO hardcoded fallback URL in this file. The real GAS /exec URL

 * does not appear in plain text, encoded, or as splice parts anywhere in

 * the service worker source. */

var GAS_PUBLIC_URL = '';

try {

  var _swLoc = self.location.href;

  var _swParam = _swLoc.indexOf('?') >= 0 ? _swLoc.split('?')[1] : '';

  var _swParts = _swParam.split('&');

  for (var i = 0; i < _swParts.length; i++) {

    var kv = _swParts[i].split('=');

    if (kv[0] === 'gas_url' && kv[1]) {

      // The gas_url value is the pre-assembled encoded blob (v1....)

      // Decode it using the same v1 shift-7 algorithm as gas-proxy.js

      var _enc = decodeURIComponent(kv[1]);

      var CHAR_SHIFT = 7;

      var _m = _enc.match(/^v(\d+)\.(.+)$/);

      if (_m) {

        var _payload = _m[2];

        var _b64 = '';

        for (var _j = 0; _j < _payload.length; _j++) {

          _b64 += String.fromCharCode(_payload.charCodeAt(_j) - CHAR_SHIFT);

        }

        var _std64 = _b64.replace(/-/g, '+').replace(/_/g, '/');

        while (_std64.length % 4) _std64 += '=';

        try {

          var _dec = decodeURIComponent(escape(atob(_std64)));

          if (/^https?:/.test(_dec)) GAS_PUBLIC_URL = _dec;

        } catch (_) {}

      }

      break;

    }

  }

} catch (_) {}

// If GAS_PUBLIC_URL is still empty, ISG public-data refresh is disabled.

// No fallback — the real URL is never stored in this source file.

const ISG_DATA_KEY   = '/__isg/competitions';  // cache key for incremental data

const ISG_INTERVAL_MS = 5 * 60 * 1000;          // refresh every 5 minutes

var   _isgTimer = null;



/* ── App shell: precached on install (prioritized for instant paint) ── */
/* ── Offline fallback page (T122) ── */
var OFFLINE_PAGE = '/index.html';


const SHELL_ASSETS = [

  // Tier 0: Critical render path (loaded FIRST — synchronous appearance)

  '/',

  '/index.html',

  '/manifest.json',
  '/manifest.webmanifest',

  '/styles.css?v='                             + BUILD,

  // Tier 1: Data core (needed before any API call)

  '/js/hostinger-config.js?v='                + BUILD,

  '/js/core-bundle.js?v='                     + BUILD,

  '/js/config.js?v='                          + BUILD,

  '/js/data-layer.js?v='                      + BUILD,

  '/js/utils.js?v='                           + BUILD,

  // Tier 2: UI framework (React components + views)

  '/js/components.js?v='                      + BUILD,

  '/js/views-bundle.js?v='                    + BUILD,

  '/js/app.js?v='                             + BUILD,

  // Tier 3: Non-critical (loaded async, not render-blocking)

  '/js/config-secrets.js?v='                  + BUILD,

  '/js/router.js?v='                          + BUILD,

  '/js/i18n.js?v='                            + BUILD,

  '/js/proposal-extras.js?v='                 + BUILD,

  '/js/main.js?v='                            + BUILD,

  // Tier 4: Assets (loaded on demand)

  '/assets/uev-logo.jpg',

  '/assets/science-logo.png',

  '/assets/uev-social-logo.png',

];



/* ── Hosts whose assets are cached on first use (cache-first after that) ── */

const CDN_CACHE_HOSTS = new Set([

  'cdnjs.cloudflare.com',

]);



/* ── Hosts / patterns that MUST always go to the network ── */

const BYPASS_RE = [

  /accounts\.google\.com/,

  /script\.google\.com/,   // GAS API — never cache

  /lh3\.googleusercontent\.com/,

  /formspree\.io/,

  /googletagmanager\.com/,

  /google-analytics\.com/,

  /\/database\/api\.php/,  // PHP API — never cache (dynamic data)

];


/* ── Known large JS/CSS bundles that MUST never be served stale.
   A new deploy bumps the ?v= query, and these are always fetched
   network-first so the SW can never hand back an old components.js. */
const LARGE_BUNDLES = new Set([
  '/js/components.js',
  '/js/views-bundle.js',
  '/js/app.js',
  '/css/uev.css',
  '/js/core-bundle.js',
  '/js/main.js',
]);

/* Should this same-origin asset be served NETWORK-FIRST (fetch fresh,
   then update the cache) instead of cache-first?
   • Any URL carrying a ?v= or ?cb= cache-buster query → always fresh.
   • Known large bundles → never stale.
   • Any other same-origin script/stylesheet → fresh (safety net). */
function isNetworkFirstAsset(url) {
  if (url.searchParams.has('v') || url.searchParams.has('cb')) return true;
  if (LARGE_BUNDLES.has(url.pathname)) return true;
  if (/\.(js|css)(\?|$)/i.test(url.pathname)) return true;
  return false;
}



/* GAS API: only the public-competitions endpoint is allowed through the ISG

   data refresh. All other GAS calls (mutations, auth, admin) stay network-only. */

function isGASPublicData(url) {

  return /script\.google\.com/.test(url) && GAS_PUBLIC_URL === url;

}



/* ═══════════════════════════════════════════════════════════

 *  INSTALL — precache the app shell

 * ═══════════════════════════════════════════════════════════ */

self.addEventListener('install', function (ev) {

  ev.waitUntil(

    caches.open(CACHE_SHELL).then(function (cache) {

      /* {cache:'reload'} bypasses the HTTP cache so we always store a fresh

         copy during precache, regardless of the Hostinger year-long headers. */

      var requests = SHELL_ASSETS.map(function (url) {

        return cache.add(new Request(url, { cache: 'reload' })).catch(function (err) {

          console.warn('[SW] precache miss:', url, err.message);

        });

      });

      return Promise.resolve(requests).then(function (rs) {

        var failCount = 0;

        for (var i = 0; i < rs.length; i++) {

          if (!rs[i] || rs[i].status !== 200) failCount++;

        }

        if (failCount) console.warn("[SW] " + failCount + "/" + SHELL_ASSETS.length + " shell assets not precached (opt-in optional precache)");

      }).then(function () {

      /* Activate the new SW immediately without waiting for open tabs to close.

         Safe here: our assets are immutable per version string, so a racing

         tab loading v5.9.51 assets still gets consistent responses. */

      return self.skipWaiting();

    })

    })
  );

});



/* ═══════════════════════════════════════════════════════════

 *  ACTIVATE — delete every cache that belongs to a previous build

 * ═══════════════════════════════════════════════════════════ */

self.addEventListener('activate', function (ev) {

  ev.waitUntil(

    caches.keys().then(function (keys) {

      return Promise.all(

        keys.filter(function (k) {

          /* Keep this build's caches, the stable font cache, and the ISG

             data cache (survives across SW updates — incremental). */

          if (k === CACHE_SHELL || k === CACHE_CDN || k === CACHE_FONTS || k === CACHE_DATA) return false;

          if (/^erp-/.test(k)) return true; // stale ERP cache from old build

          return false;

        }).map(function (k) {

          return caches.delete(k);

        })

      );

    }).then(function () {

      /* Start incremental data refresh now that we're the active SW.

         Stop any stale timer first (belt-and-suspenders). */

      stopISGTimer();

      startISGTimer();

      /* Take control of all open clients (tabs) immediately so the new cache

         is used from the very next fetch without requiring a reload. */

      return self.clients.claim();

    })

  );

});



/* ═══════════════════════════════════════════════════════════

 *  FETCH — route every request to the appropriate strategy

 * ═══════════════════════════════════════════════════════════ */

self.addEventListener('fetch', function (ev) {

  var req = ev.request;



  /* 1. Non-GET → always network (POST/PUT/DELETE have side effects) */

  if (req.method !== 'GET') return;



  /* 2. Chrome extensions, blob URLs, data URIs → ignore */

  if (!/^https?:/.test(req.url)) return;



  var url;

  try { url = new URL(req.url); } catch (_) { return; }



  /* 3. Hard bypass list (Google auth, analytics, PHP API) → network-only. */

  for (var i = 0; i < BYPASS_RE.length; i++) {

    if (BYPASS_RE[i].test(req.url)) return;

  }



  /* 4. Google Fonts woff2 (immutable, content-addressed) → Cache-First */

  if (url.hostname === 'fonts.gstatic.com') {

    ev.respondWith(cacheFirst(req, CACHE_FONTS));

    return;

  }



  /* 5. Google Fonts CSS → Stale-While-Revalidate

        (the CSS changes rarely; stale serves instantly, network updates bg) */

  if (url.hostname === 'fonts.googleapis.com') {

    ev.respondWith(staleWhileRevalidate(req, CACHE_FONTS));

    return;

  }



  /* 6. CDN JS / CSS (React, ReactDOM, Font Awesome) → Cache-First

        URLs are stable / versioned by CDN, safe to cache indefinitely. */

  if (CDN_CACHE_HOSTS.has(url.hostname)) {

    ev.respondWith(cacheFirst(req, CACHE_CDN));

    return;

  }



  /* 7. Same-origin assets */

  if (url.hostname === self.location.hostname) {

    /* HTML navigations → Network-First with ISG data injection.

       The HTML is fetched fresh from the network (or cache fallback),

       then the SW injects the freshest __PRELOADED_STATE__ from the

       ISG data cache so every page load gets incrementally-updated

       competition data — no redeploy needed.

       ALSO matches 'nested-navigate' for iframe loads to ensure consistent

       behaviour inside embedded deployments. */

    if (req.mode === 'navigate' || req.mode === 'nested-navigate') {

      ev.respondWith(networkFirstWithISG(req, CACHE_SHELL));

      return;

    }



    /* Versioned JS / CSS / large bundles → CACHE-FIRST.
       Assets are IMMUTABLE per ?v= query (every deploy bumps it), and the SW
       cache key includes the full URL+query, so a new build creates a new
       cache entry and the old is never served. Cache-first means repeat visits
       serve instantly from cache instead of re-fetching ~70 assets per load
       (the old NETWORK-FIRST mode forced a round-trip on every single asset on
       every load — the main cause of the perceived performance regression).
       Freshness is guaranteed because the ?v= changes on every deploy. */
    if (isNetworkFirstAsset(url)) {
      ev.respondWith(cacheFirst(req, CACHE_SHELL));
      return;
    }

    /* Other same-origin assets (logos, immutable images) → Cache-First. */
    ev.respondWith(cacheFirst(req, CACHE_SHELL));

    return;

  }



  /* 8. Everything else → let the browser handle it normally */

});



/* ═══════════════════════════════════════════════════════════

 *  PERIODIC ISG — background refresh of public competition data

 * ═══════════════════════════════════════════════════════════ */



/** Fetch public competitions from GAS and store in CACHE_DATA.

 *  Runs periodically (every ISG_INTERVAL_MS) and on-demand via message.

 *  Silent failures — stale data is better than no data. */

function refreshISGData() {

  if (!GAS_PUBLIC_URL) return Promise.resolve();



  // v12.26.0-stable: Try hardcoded PHP URL first (works cross-origin),

  // then origin-based fallback. Skip entirely from file:// protocol.

  var _swOrigin = self.location.origin || '';

  var _isSwFileProtocol = (_swOrigin === 'null' || _swOrigin.indexOf('file:') === 0);

  var phpUrls = _isSwFileProtocol

    ? [] // file:// protocol — skip PHP entirely, go straight to GAS

    : [

        'https://sr-ue-varna.com/database/api.php',

        _swOrigin + '/database/api.php'

      ];



  function tryPhp() {

    if (!phpUrls.length) return Promise.reject(new Error('No PHP URLs (file:// protocol)'));

    var _phpUrl = phpUrls.shift();

    if (!_phpUrl || _phpUrl.indexOf('http') !== 0) {

      if (!phpUrls.length) return Promise.reject(new Error('No valid PHP URLs'));

      return tryPhp();

    }

    return fetch(_phpUrl, {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ action: 'getpubliccompetitions' }),

      signal: AbortSignal.timeout(4000)

    })

    .then(function (res) {

      if (!res.ok) throw new Error('PHP responded ' + res.status);

      return res.json();

    })

    .then(function (json) {

      if (json && json.success && json.competitions) {

        return cacheCompetitions(json.competitions);

      }

      throw new Error('PHP response missing competitions');

    })

    .catch(function (err) {

      if (phpUrls.length) return tryPhp();

      throw err;

    });

  }



  return tryPhp().catch(function (/* fallback to GAS */) {

      return fetch(GAS_PUBLIC_URL, {

        method: 'POST',

        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },

        body: JSON.stringify({ action: 'getpubliccompetitions', activeOnly: true }),

      })

        .then(function (res) {

          if (!res.ok) throw new Error('GAS responded ' + res.status);

          return res.json();

        })

        .then(function (json) {

          var list = (json && json.data && json.data.competitions) || (json && json.competitions) || [];

          if (!Array.isArray(list) || list.length === 0) return;

          return cacheCompetitions(list);

        });

    })

    .catch(function (err) {

      console.warn('[SW:ISG] background refresh failed:', err.message);

    });

}



/** Cache competition data into CACHE_DATA store. */

function cacheCompetitions(list) {

  var payload = {

    v: 1, ts: Date.now(),

    competitions: list.map(function (c) {

      return {

        id: String(c.id || ''),

        name: String(c.name || ''),

        deadline: String(c.deadline || c.dateEnd || ''),

        status: String(c.status || ''),

        callType: String(c.callType || ''),

        year: String(c.year || ''),

        openDate: String(c.openDate || ''),

        description: String(c.description || '').slice(0, 200),

        directions: String(c.directions || ''),

        evalCriteria: String(c.evalCriteria || ''),

        budgetByDirection: String(c.budgetByDirection || ''),

      };

    }),

    build: BUILD,

  };

  var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

  var resp = new Response(blob, { status: 200, headers: { 'Content-Type': 'application/json' } });

  return caches.open(CACHE_DATA).then(function (cache) {

    return cache.put(ISG_DATA_KEY, resp.clone());

  });

}



/** Start the periodic ISG timer. Called on activate. */

function startISGTimer() {

  if (_isgTimer) return;

  refreshISGData();

  _isgTimer = setInterval(refreshISGData, ISG_INTERVAL_MS);

}



/** Stop the periodic ISG timer. Called when a new SW takes over. */

function stopISGTimer() {

  if (_isgTimer) { clearInterval(_isgTimer); _isgTimer = null; }

}



/* ── ISG HTML injection ──────────────────────────────────────────────── */



/** Network-First + ISG: fetch HTML, inject freshest __PRELOADED_STATE__,

 *  cache the result, return. Falls back to cached shell when offline. */

function networkFirstWithISG(req, cacheName) {

  return fetch(req).then(function (res) {

    if (!isCacheable(res)) return res;

    return res.clone().text().then(function (html) {

      return injectISGState(html).then(function (injected) {

        var navHeaders = new Headers(res.headers);
        navHeaders.set('Content-Type', 'text/html; charset=utf-8');
        navHeaders.delete('X-Content-Type-Options');

        var injectedRes = new Response(injected, {

          status: res.status,

          statusText: res.statusText,

          headers: navHeaders,

        });

        /* Clone synchronously BEFORE returning — the async cache.put

           would race the browser consuming the returned response body. */

        var _cacheCopy = injectedRes.clone();

        caches.open(cacheName).then(function (cache) {

          cache.put(req, _cacheCopy);

        });

        return injectedRes;

      });

    });

  }).catch(function () {

    return caches.open(cacheName).then(function (cache) {

      return cache.match(req).then(function (cached) {

        if (cached) {

          /* v12.51.22-leakfix: normalise a cached navigation's Content-Type too,
             so an old cached copy with a bad type can never render as text. */
          var fbHeaders = new Headers(cached.headers);
          fbHeaders.set('Content-Type', 'text/html; charset=utf-8');
          fbHeaders.delete('X-Content-Type-Options');
          return cached.arrayBuffer().then(function (buf) {
            return new Response(buf, {
              status: cached.status,
              statusText: cached.statusText,
              headers: fbHeaders,
            });
          });
        }

        /* v12.51.27-deeplink: a refresh of a client-side deep link
           (/applications/f_xxx, /projects/xxx, ...) issues a real navigation
           request the SW has likely NEVER cached (those URLs are reached via
           pushState, not network). If the network also failed, the bare
           cache.match above returns nothing and we previously returned
           Response.error() -> blank page ("routing breaks on refresh").
           Fall back to the cached SPA shell (/) so the app ALWAYS boots and
           client-side routing re-derives the deep link from location.pathname. */
        return cache.match('/').then(function (shell) {
          if (!shell) return cache.match('/index.html');
        }).then(function (shell) {
          if (!shell) return Response.error();
          var sh = new Headers(shell.headers);
          sh.set('Content-Type', 'text/html; charset=utf-8');
          sh.delete('X-Content-Type-Options');
          // Strip the embedded preloaded-state so the shell re-fetches fresh.
          return shell.arrayBuffer().then(function (buf) {
            return new Response(buf, {
              status: 200,
              statusText: 'OK',
              headers: sh,
            });
          });
        });

      });

    });

  });

}



/** If ISG data is fresher than what's embedded in the HTML,

 *  replace __PRELOADED_STATE__ with the fresher version. */

function injectISGState(html) {

  return caches.open(CACHE_DATA).then(function (cache) {

    return cache.match(ISG_DATA_KEY).then(function (cached) {

      if (!cached) return html;

      return cached.json().then(function (isgData) {

        if (!isgData || !isgData.ts) return html;



        // Check if the HTML already has fresher or equal data

        // SAFETY (v8.0.1): use a bounded regex that won't over-greedy match

        // into following script blocks. Max 500-char capture to prevent runaway.

        var existingMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[^}]{0,500}\})/);

        if (existingMatch) {

          try {

            var existingParsed = JSON.parse(existingMatch[1]);

            var existingTs = parseInt(existingParsed.ts, 10);

            if (!isNaN(existingTs) && existingTs >= isgData.ts) return html;

          } catch (_) { /* parse failed, inject anyway */ }

        }



        // Inject the fresher ISG data

        var newStateJson = JSON.stringify(isgData);

        var marker = 'window.__PRELOADED_STATE__';

        var idx = html.indexOf(marker);



        if (idx !== -1) {

          var endIdx = html.indexOf('\n', html.indexOf(';', idx));

          if (endIdx === -1) endIdx = html.indexOf('</script>', idx);

          if (endIdx !== -1) {

            html = html.slice(0, idx) +

                   'window.__PRELOADED_STATE__ = ' + newStateJson + ';' +

                   html.slice(endIdx);

            return html;

          }

        }



        // No existing __PRELOADED_STATE__ — inject after __ERP_BUILD="13.01.0"

        var buildMarker = "window.__ERP_BUILD=" + '"' + BUILD + '"';

        var buildIdx = html.indexOf(buildMarker);

        if (buildIdx !== -1) {

          var scriptEnd = html.indexOf('</script>', buildIdx);

          if (scriptEnd !== -1) {

            html = html.slice(0, scriptEnd + '</script>'.length) +

                   '\n<script id="preloaded-state">window.__PRELOADED_STATE__ = ' +

                   newStateJson + ';</script>\n' +

                   html.slice(scriptEnd + '</script>'.length);

            return html;

          }

        }



        return html;

      }).catch(function () { return html; });

    });

  }).catch(function () { return html; });

}



/* ═══════════════════════════════════════════════════════════

 *  MESSAGE — page ↔ SW communication

 * ═══════════════════════════════════════════════════════════ */

self.addEventListener('message', function (ev) {

  if (!ev.data) return;

  if (ev.data.type === 'SKIP_WAITING') {

    self.skipWaiting();

  } else if (ev.data.type === 'REFRESH_ISG') {

    ev.waitUntil(refreshISGData());

  } else if (ev.data.type === 'ISG_STATUS') {

    ev.waitUntil(

      caches.open(CACHE_DATA).then(function (cache) {

        return cache.match(ISG_DATA_KEY);

      }).then(function (cached) {

        if (!cached) { _replyToClient(ev, { isg: false }); return; }

        return cached.json().then(function (data) {

          _replyToClient(ev, {

            isg: true,

            ts: data && data.ts || 0,

            count: (data && data.competitions && data.competitions.length) || 0,

            age: data && data.ts ? (Date.now() - data.ts) : null,

          });

        });

      }).catch(function () { _replyToClient(ev, { isg: false }); })

    );

  }

});



// v12.28.3-coop: Safe Client.postMessage — Chrome logs a console warning

// when COOP blocks postMessage, even inside try-catch. We check for

// cross-origin isolation before attempting to send, to reduce console noise.

function _clientCanReceivePostMessage_(client) {

  try {

    // Clients with cross-origin isolation restrictions can't receive

    // postMessage from the SW. Check the client's URL origin against

    // our own — if cross-origin and COOP is restrictive, skip.

    var _clientUrl = client.url || '';

    var _clientOrigin = _clientUrl.indexOf('://') > 0

      ? _clientUrl.split('/').slice(0, 3).join('/')

      : '';

    if (!_clientOrigin) return false;

    // Same-origin clients can always receive postMessage

    if (_clientOrigin === self.location.origin) return true;

    // Cross-origin clients might have COOP that blocks postMessage.

    // Attempt a probe: send a no-op and catch silently.

    // The console warning will still fire but we minimize it.

    return true; // optimistically try — the try-catch handles failures

  } catch(_) {

    return false;

  }

}



function _replyToClient(ev, data) {

  if (ev.source && ev.source.postMessage) {

    try { ev.source.postMessage({ type: 'ISG_STATUS_REPLY', data: data }); } catch (_) {}

  }

  self.clients.matchAll().then(function (clients) {

    clients.forEach(function (client) {

      if (!_clientCanReceivePostMessage_(client)) return;

      try { client.postMessage({ type: 'ISG_STATUS_REPLY', data: data }); } catch (_) {}

    });

  });

}



/* ═══════════════════════════════════════════════════════════

 *  STRATEGY HELPERS

 * ═══════════════════════════════════════════════════════════ */



/**

 * Cache-First: serve from cache; fetch + store on miss.

 * Best for versioned assets that never change at a given URL.

 */

function cacheFirst(req, cacheName) {

  return caches.open(cacheName).then(function (cache) {

    return cache.match(req).then(function (cached) {

      if (cached) return cached;



      return fetch(req).then(function (res) {

        if (isCacheable(res)) {

          cache.put(req, res.clone());

        }

        return res;

      });

    });

  });

}



/**

 * Network-First: try the network; serve cached copy on failure.

 * Best for HTML navigations where freshness matters but offline matters too.

 */

function networkFirst(req, cacheName) {

  return fetch(req).then(function (res) {

    if (isCacheable(res)) {

      /* Clone synchronously BEFORE returning — the async cache.put

         would race the browser consuming the returned response body. */

      var _cacheCopy = res.clone();

      caches.open(cacheName).then(function (cache) {

        cache.put(req, _cacheCopy);

      });

    }

    return res;

  }).catch(function () {

    return caches.open(cacheName).then(function (cache) {

      return cache.match(req).then(function (cached) {

        if (!cached) {
          if (req.mode === 'navigate' || req.mode === 'nested-navigate') {
            return caches.match(OFFLINE_PAGE);
          }
          return Response.error();
        }
        return cached;

      });

    });

  });

}



/**

 * Stale-While-Revalidate: serve the cached copy immediately (if any),

 * then update the cache in the background from the network.

 * Best for Google Fonts CSS that changes rarely but should stay fresh.

 */

function staleWhileRevalidate(req, cacheName) {

  return caches.open(cacheName).then(function (cache) {

    return cache.match(req).then(function (cached) {

      var networkFetch = fetch(req).then(function (res) {

        if (isCacheable(res)) {

          cache.put(req, res.clone());

        }

        return res;

      }).catch(function () { /* background refresh failed silently */ });



      return cached || networkFetch;

    });

  });

}



/**

 * Only cache responses that are safe to store:

 * • HTTP 200 (not redirects, not errors)

 * • type 'basic' (same-origin) or 'cors' (CDN with CORS headers)

 * • NOT opaque (type 'opaque') — opaque responses have unknown status codes

 *   and could silently cache a 4xx/5xx, breaking the app.

 */

function isCacheable(res) {

  if (!res) return false;

  if (res.status !== 200) return false;

  if (res.type === 'opaque') return false; // never cache opaque responses

  return true;

}





/* ═══════════════════════════════════════════════════════════
 *  T103: Service Worker Enhancements
 *  ═══════════════════════════════════════════════════════════
 *  Added: cache size management, background sync, offline fallback
 */

/* ── Cache size limits ── */
var CACHE_MAX_ENTRIES = 200;     // max responses per cache bucket
var CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for non-versioned

/**
 * Trim a cache bucket to CACHE_MAX_ENTRIES by deleting oldest entries.
 * Called after successful fetches to prevent unbounded cache growth.
 */
function trimCache(cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.keys().then(function (keys) {
      if (keys.length <= CACHE_MAX_ENTRIES) return;
      var toDelete = keys.length - CACHE_MAX_ENTRIES;
      // Delete oldest first (keys are returned in insertion order)
      var deletions = keys.slice(0, toDelete).map(function (req) {
        return cache.delete(req);
      });
      return Promise.all(deletions);
    });
  });
}

/**
 * Evict stale entries from the fonts cache (content-addressed, so
 * stale = older than CACHE_MAX_AGE_MS). Google Fonts URLs are stable
 * but the CSS may reference new woff2 files over time.
 */
function evictStaleEntries(cacheName, maxAge) {
  var now = Date.now();
  return caches.open(cacheName).then(function (cache) {
    return cache.keys().then(function (keys) {
      var deletions = keys.map(function (req) {
        return cache.match(req).then(function (res) {
          if (!res) return cache.delete(req);
          var dateHeader = res.headers.get('date');
          if (dateHeader) {
            var age = now - new Date(dateHeader).getTime();
            if (age > maxAge) return cache.delete(req);
          }
          return null;
        }).catch(function () { return cache.delete(req); });
      });
      return Promise.all(deletions);
    });
  });
}

/* ── Background Sync for offline form submissions ── */

self.addEventListener('sync', function (ev) {
  if (ev.tag === 'sync-form-submissions') {
    ev.waitUntil(syncPendingSubmissions());
  } else if (ev.tag === 'sync-document-uploads') {
    ev.waitUntil(syncPendingUploads());
  }
});

/**
 * Replay form submissions that were queued while offline.
 * Pending submissions are stored in IndexedDB by the page (js/utils.js).
 */
function syncPendingSubmissions() {
  // The page-side code manages the IndexedDB queue.
  // The SW just broadcasts a 'RETRY_SYNC' message to all clients.
  return self.clients.matchAll().then(function (clients) {
    clients.forEach(function (client) {
      try {
        client.postMessage({ type: 'RETRY_SYNC', queue: 'form-submissions' });
      } catch (_) {}
    });
  });
}

/**
 * Replay document uploads that were queued while offline.
 */
function syncPendingUploads() {
  return self.clients.matchAll().then(function (clients) {
    clients.forEach(function (client) {
      try {
        client.postMessage({ type: 'RETRY_SYNC', queue: 'document-uploads' });
      } catch (_) {}
    });
  });
}

/* ── Offline fallback response ── */

/**
 * Returns a JSON error response for failed API calls when offline.
 * The page-side api() handler recognizes this and queues for retry.
 */
function offlineAPIResponse() {
  var body = JSON.stringify({
    success: false,
    offline: true,
    error: 'You are offline. Your changes will be synced when connection is restored.',
    retryable: true
  });
  return new Response(body, {
    status: 503,
    statusText: 'Service Unavailable (Offline)',
    headers: { 'Content-Type': 'application/json' }
  });
}

/* ── Periodic cache maintenance ── */

/**
 * Run cache maintenance: trim oversized buckets, evict stale entries.
 * Called on activate and every 30 minutes via setInterval.
 */
function runCacheMaintenance() {
  // Trim shell and CDN caches
  trimCache(CACHE_SHELL);
  trimCache(CACHE_CDN);
  // Evict font cache entries older than max age
  evictStaleEntries(CACHE_FONTS, CACHE_MAX_AGE_MS);
}

// Run maintenance every 30 minutes
var _maintenanceTimer = null;

function startMaintenanceTimer() {
  if (_maintenanceTimer) return;
  _maintenanceTimer = setInterval(runCacheMaintenance, 30 * 60 * 1000);
}

function stopMaintenanceTimer() {
  if (_maintenanceTimer) { clearInterval(_maintenanceTimer); _maintenanceTimer = null; }
}

// Hook into existing activate: start maintenance timer
var _origActivate = self.addEventListener;
// (Maintenance timer is started below in the activate patch)

/* ── Patch activate to start maintenance ── */
// We override the activate handler by adding a new listener that runs
// alongside the existing one (both fire on activate).
self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    Promise.resolve().then(function () {
      startMaintenanceTimer();
      return runCacheMaintenance();
    })
  );
});

/* ── Patch cacheFirst to trim after put ── */
var _origCacheFirst = cacheFirst;
cacheFirst = function (req, cacheName) {
  return _origCacheFirst(req, cacheName).then(function (res) {
    // Fire-and-forget trim (don't block response)
    if (res && res.ok) {
      trimCache(cacheName).catch(function () {});
    }
    return res;
  });
};

/* ── Message handler extension: cache maintenance trigger ── */
var _origMessageHandler = self.addEventListener;
// The existing message handler already handles SKIP_WAITING, REFRESH_ISG, ISG_STATUS.
// We add MAINTENANCE trigger via a separate listener.
self.addEventListener('message', function (ev) {
  if (!ev.data) return;
  if (ev.data.type === 'RUN_CACHE_MAINTENANCE') {
    ev.waitUntil(runCacheMaintenance());
  } else if (ev.data.type === 'CLEAR_ALL_CACHES') {
    ev.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      })
    );
  }
});

