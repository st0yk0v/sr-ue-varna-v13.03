/* ═══════════════════════════════════════════════════════════════════════════
 *  js/data-layer.js — Instant-Load Data Layer (v12.26.0-dualwrite)
 *
 *  Architecture: three-tier data distribution with dual-write redundancy
 *  ┌─────────────────────────────────────────────────────────────────┐
 *  │  Tier 1: localStorage (instant) — 100ms render, no network    │
 *  │  Tier 2: PHP/MySQL (fast) — 200-500ms reads, PRIMARY backend  │
 *  │  Tier 3: GAS/Sheets (fallback) — 1-10s, authoritative mirror │
 *  └─────────────────────────────────────────────────────────────────┘
 *
 *  v12.26.0: PHP is the PRIMARY backend. GAS is the authoritative
 *  mirror (used only when PHP is unreachable). All reads go through
 *  PHP first, then GAS as fallback. Writes go to PHP first, then
 *  fire-and-forget to GAS. Empty responses from PHP are treated as
 *  valid (system just started / no data yet) and cached briefly.
 *
 *  Every read resolves from the fastest available tier:
 *    localStorage hit → instant render + background refresh
 *    localStorage miss → PHP (primary) → GAS (fallback)
 *
 *  Every write updates localStorage optimistically, then syncs to
 *  both PHP and GAS in parallel for reliability.
 *
 *  Exposed on window.ERP_DATA for integration with existing api().
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  // ── Only load in browser context ──
  if (typeof window === 'undefined') return;

  var STORAGE_PREFIX = 'erp:cache:v2:';
  var CACHE_TTL_DEFAULT_MS = 5 * 60 * 1000;    // 5 min default
  // ── Iframe detection — when embedded, extend TTLs and delay background refresh ──
  var _isIframe = (function(){ try{ return window !== window.top; }catch(_){ return true; } })();
  var _iframeTTLMultiplier = _isIframe ? 2.5 : 1; // iframe: 2.5x longer cache (less network = faster)
  // ── Connection-quality TTL scaling ──
  // On slow connections (2G/3G) extend TTLs to reduce network pressure.
  // Falls back to 1× on browsers without Network Information API.
  var _connTTLMultiplier = (function(){
    try{
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if(!c) return 1;
      var ect = c.effectiveType;
      if(ect === 'slow-2g' || ect === '2g') return 4;
      if(ect === '3g') return 2;
    }catch(_){}
    return 1;
  })();
  // v20.0.0-perf: Reduced SWR delay to 100ms for iframe (was 300ms)
  // to minimize the window where stale data is visible before background refresh.
  // Standalone remains 0ms for instant background refresh.
  var _swrDelayMs = _isIframe ? 100 : 0;
  // v20.0.0-perf: Page load timestamp for boot-time grace period — prevents cache flash
  // from version-poll invalidation during the first 5 seconds after page load.
  var _pageLoadTs = Date.now();
  // v15.0.0-perf: Increased TTLs for mutation-busted endpoints.
  // Mutation-based invalidation (ERP_DATA.write) clears related caches on
  // every write, so TTLs serve only as a max-age safety net, not freshness.
  // This dramatically reduces network churn for the most frequently polled
  // endpoints (getforms, getinitialdata, getcompetitions).
  var CACHE_TTL = {
    getinitialdata:       4 * 60 * 1000,         // 4 min (was 2) — mutation-busted, version-keyed
    getforms:             8 * 60 * 1000,         // 8 min (was 5) — mutation-busted, forms change rarely for list view
    getcompetitions:      5 * 60 * 1000,         // 5 min (was 3) — mutation-busted
    getpubliccompetitions:8 * 60 * 1000,         // 8 min (was 5) — stable, rarely changes
    listdocuments:        5 * 60 * 1000,         // 5 min (was 3) — mutation-busted
    getreviewers:         5 * 60 * 1000,         // 5 min (was 3) — mutation-busted
    getreviewerforms:     5 * 60 * 1000,         // 5 min (was 3) — mutation-busted
    getprojects:          5 * 60 * 1000,         // 5 min (was 3) — mutation-busted
    getprojectdashboard:  5 * 60 * 1000,         // 5 min (was 3) — mutation-busted
    getcompetitionsummary:5 * 60 * 1000,         // 5 min (was 3) — mutation-busted
    getcompetitionpanel:  5 * 60 * 1000,         // 5 min (was 3) — mutation-busted
    getdashboardcontext:  3 * 60 * 1000,         // 3 min (was 2) — mutation-busted
    // v15.0.0-perf: Dedicated getmyforms endpoint — fastest path for applicant list view
    getmyforms:           8 * 60 * 1000,         // 8 min — mutation-busted, same as getforms
    getmessages:          60 * 1000,             // 60s — near real-time
    getnotifications:     30 * 1000,             // 30s — near real-time
    getapplicationsbycompetition: 3 * 60 * 1000, // 3 min — mutation-busted
    getcontestboard:      3 * 60 * 1000,         // 3 min — mutation-busted
    checksanctions:       5 * 60 * 1000,         // 5 min — rarely changes
    getselfassessment:    3 * 60 * 1000,         // 3 min — mutation-busted
    listmydocuments:      2 * 60 * 1000,         // 2 min — mutation-busted
    listckkmembers:       10 * 60 * 1000,        // 10 min — very stable
    getversion:           2 * 60 * 1000,         // 2 min
    getsystemhealth:      60 * 1000,             // 60s
    getdataversion:       20 * 1000,             // 20s (was 15s) — v15.0.0-perf: reduced polling frequency
    getdatachangestream:  30 * 1000,             // 30s — stream polling, mutation-busted
    // v12.20.0: Document generation endpoints
    gettypedocuments:     3 * 60 * 1000,         // 3 min — mutation-busted
    getformdocuments:     2 * 60 * 1000,         // 2 min — mutation-busted
    getgenerateddocs:     2 * 60 * 1000,         // 2 min — mutation-busted
    ensureuserpregenerateddocs: 60 * 1000,       // 1 min — mutation-busted
    getdocumenttemplates: 10 * 60 * 1000,        // 10 min — very stable
    // v12.18.0: Pagination + metrics endpoints
    loadmoreforms:        3 * 60 * 1000,         // 3 min — mutation-busted
    loadmorecompetitions: 3 * 60 * 1000,         // 3 min — mutation-busted
    getmetricsdashboard:  60 * 1000,             // 60s — admin health panel
    // v12.27.0: Proposal Wizard endpoints
    sqlgetproposal:       60 * 1000,             // 1 min — mutation-busted
    sqlgetproposaldocuments: 60 * 1000,          // 1 min — mutation-busted
    sqlgetdocumentpreview: 60 * 1000,            // 1 min — preview URL
    sqlgetbudgetrules:     5 * 60 * 1000,        // 5 min — budget rules are stable
    // v11: Remaining operations
    getcontractdeadlines:   5 * 60 * 1000,       // 5 min — contract deadlines change slowly
    sqlgetcontractdeadlines: 5 * 60 * 1000,      // 5 min — SQL equivalent
    // ── v8 docSQL: Instant document operations ──
    sqlgetapplicationdocuments: 30 * 1000,       // 30s — instant, low-latency
    sqlgetdocumenturl:         5 * 60 * 1000,    // 5 min — URLs are stable
    sqlsearchdocuments:        30 * 1000,        // 30s — search results
    sqlattachdocument:         10 * 1000,        // 10s — mutation result
    sqldetachdocument:         10 * 1000,        // 10s — mutation result
    // v16.0.0-appconfig: Full application configuration (very stable)
    getappconfig:              30 * 60 * 1000,   // 30 min — config changes only on deploy/schema migration
    sqlgetappconfig:           30 * 60 * 1000,   // 30 min — same as above
    // v17.0.0-doclib-applicants: Template library + applicant views
    sqltemplatelibrary:        10 * 60 * 1000,   // 10 min — template library is stable
    gettemplatelibrary:        10 * 60 * 1000,   // 10 min — same
    sqlgetapplicationsbyuser:  3 * 60 * 1000,    // 3 min — applications change on mutation
    getapplicationsbyuser:     3 * 60 * 1000,    // 3 min — same
    sqlgetapplicantsummary:    5 * 60 * 1000,    // 5 min — summary stats, mutation-busted
    getapplicantsummary:       5 * 60 * 1000,    // 5 min — same
    sqlgetapplicantslist:      5 * 60 * 1000,    // 5 min — admin list, mutation-busted
    getapplicantslist:         5 * 60 * 1000,    // 5 min — same
    sqladddocumenttemplate:    10 * 1000,        // 10s — mutation result
    sqlupdatedocumenttemplate: 10 * 1000,        // 10s — mutation result
    sqldeletedocumenttemplate: 10 * 1000,        // 10s — mutation result
    sqlsynctemplatefromgas:    10 * 1000,        // 10s — mutation result
  };

  // v12.28.0-cache: Mutation action → related cache actions to invalidate.
  // When ERP_DATA.write succeeds, related caches are cleared immediately.
  // v15.0.0-perf: All form mutations also invalidate getmyforms cache
  var MUTATION_CACHE_MAP = {
    'createapplication': ['getforms','getmyforms','getform','getinitialdata','getdashboardcontext','loadmoreforms'],
    'createform':       ['getforms','getmyforms','getform','getinitialdata','getdashboardcontext','loadmoreforms'],
    'updateform':       ['getforms','getmyforms','getform','getinitialdata','getdashboardcontext'],
    'submitform':       ['getforms','getmyforms','getform','getinitialdata','getdashboardcontext'],
    'deleteform':       ['getforms','getmyforms','getinitialdata','getdashboardcontext'],
    'updatestatus':     ['getforms','getmyforms','getform','getinitialdata','getdashboardcontext'],
    'createcompetition':['getcompetitions','getpubliccompetitions','getcontestboard','getcompetitionsummary','loadmorecompetitions'],
    'editcompetition':  ['getcompetitions','getpubliccompetitions','getcontestboard','getcompetitionsummary'],
    'deletecompetition':['getcompetitions','getpubliccompetitions','getcontestboard','getcompetitionsummary'],
    'addreviewer':      ['getreviewers','getreviewerforms','getcompetitionsummary'],
    'deletereviewer':   ['getreviewers','getreviewerforms','getcompetitionsummary'],
    'submitreview':     ['getreviewerforms','getreviewers'],
    'createproject':    ['getprojects','getprojectdashboard','getdashboardcontext'],
    'updateproject':    ['getprojects','getprojectdashboard'],
    'submitreport':     ['getreports','getprojectdashboard'],
    'createexpense':    ['getexpenses','getfinancialsummary'],
    'createchangerequest':['getchangerequests'],
    'sendmessage':      ['getmessages'],
    'uploadmydocument': ['listmydocuments','listdocuments'],
    'deletemydocument': ['listmydocuments','listdocuments'],
    'copydocforuser':   ['listmydocuments','listdocuments'],
    'deletefile':       ['getforms','listdocuments','listmydocuments'],
    'copydocument':     ['listmydocuments','listdocuments'],
    'bulkupdateapplicationstatus': ['getforms','getmyforms','getinitialdata','getdashboardcontext'],
    'addsanction':      ['getprojects','checksanctions','checkeligibility'],
    'transitionprojectstatus':['getprojects','getproject','getprojectdashboard'],
    'signprojectcontract':['getforms','getmyforms','getform','getinitialdata'],
    'confirmlibrarysubmission':['getdeliverables'],
    'updatedeliverable':['getproject','getdeliverables'],
    'editdeliverable':  ['getproject','getdeliverables'],
    'replacereviewer':  ['getreviewers','getreviewerforms','getforms','getmyforms','getinitialdata'],
    'addadminemail':    ['listadminemails'],
    'removeadminemail': ['listadminemails'],
    // ── v8 docSQL: Instant document mutation invalidation ──
    'sqlattachdocument':   ['listdocuments','listmydocuments','getformdocuments'],
    'sqldetachdocument':   ['listdocuments','listmydocuments','getformdocuments'],
    'sqlbulkattachdocuments': ['listdocuments','listmydocuments','getformdocuments'],
    'attachdocumenttoform':['listdocuments','listmydocuments','getformdocuments'],
    'detachdocumentfromform':['listdocuments','listmydocuments','getformdocuments'],
    // ── v17.0.0-doclib-applicants: Template library + applicant mutations ──
    'adddocumenttemplate':  ['gettemplatelibrary','sqltemplatelibrary','getrequiredapplicationtemplates'],
    'updatedocumenttemplate':['gettemplatelibrary','sqltemplatelibrary','getrequiredapplicationtemplates'],
    'deletedocumenttemplate':['gettemplatelibrary','sqltemplatelibrary','getrequiredapplicationtemplates'],
    'sqladddocumenttemplate':['gettemplatelibrary','sqltemplatelibrary','getrequiredapplicationtemplates'],
    'sqlupdatedocumenttemplate':['gettemplatelibrary','sqltemplatelibrary','getrequiredapplicationtemplates'],
    'sqldeletedocumenttemplate':['gettemplatelibrary','sqltemplatelibrary','getrequiredapplicationtemplates'],
    'sqlsynctemplatefromgas':['gettemplatelibrary','sqltemplatelibrary','getrequiredapplicationtemplates'],
    'synctemplatefromgas':['gettemplatelibrary','sqltemplatelibrary','getrequiredapplicationtemplates'],
    // Applicant mutations bust applicant-specific caches
    'sqlgetapplicationsbyuser':['getapplicationsbyuser','sqlgetapplicationsbyuser'],
    'getapplicationsbyuser':['getapplicationsbyuser','sqlgetapplicationsbyuser'],
  };
  // Actions that support stale-while-revalidate (serve cached, refresh in bg)
  var SWR_ACTIONS = new Set(Object.keys(CACHE_TTL));

  // v12.28.0-cache: Every action in SWR_ACTIONS is also in the invalidation map
  // so writes clear both the stale cache + the fresh cache for related reads.

  // ── In-flight request deduplication ──
  var inflightMap = new Map();

  // ── Background refresh queue ──
  var _bgQueue = [];
  var _bgRunning = false;

  // ── v12.26.0: GAS health state ────────────────────────────────────
  // Tracks whether GAS is reachable. When GAS is known-down, skips
  // GAS retries to avoid wasting 20s+ on failed fetch attempts.
  // Reset after 5min to allow recovery. Persisted in sessionStorage
  // so tab-reload doesn't forget the state.
  var _gasHealthy = true;
  var _gasLastCheck = 0;
  var _GAS_HEALTH_TTL = 300000; // 5min
  (function _initGasHealth(){
    try {
      var raw = window._safeSS && window._safeSS.getItem('__erp_gas_health');
      if (raw) { var h = JSON.parse(raw); if (h && h.ok === false) { _gasHealthy = false; _gasLastCheck = h.ts || 0; } }
    } catch(_) {}
  })();
  function _markGasDown(){
    _gasHealthy = false; _gasLastCheck = Date.now();
    try { window._safeSS && window._safeSS.setItem('__erp_gas_health', JSON.stringify({ok:false,ts:Date.now()})); } catch(_) {}
  }
  function _markGasUp(){
    _gasHealthy = true; _gasLastCheck = Date.now();
    try { window._safeSS && window._safeSS.removeItem('__erp_gas_health'); } catch(_) {}
  }
  function _shouldTryGas(){
    if (_gasHealthy) return true;
    if (Date.now() - _gasLastCheck > _GAS_HEALTH_TTL) { _gasHealthy = true; return true; }
    return false;
  }

  // ── Mutation queue for offline writes ──
  var MUTATION_QUEUE_KEY = STORAGE_PREFIX + 'mutations';

  /* ─── HELPERS ─── */
  function storageKey(action, body) {
    return STORAGE_PREFIX + action + '::' + JSON.stringify(body);
  }

  function isPageVisible() {
    return typeof document !== 'undefined' && (!document.hidden);
  }

  /* ─── LOCALSTORAGE CACHE ─── */
  function cacheGet(action, body) {
    try {
      var key = storageKey(action, body);
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || !entry.data || !entry.ts) return null;
      var age = Date.now() - entry.ts;
      var _ttl = CACHE_TTL[action];
      if(_ttl && _isIframe) _ttl = Math.round(_ttl * _iframeTTLMultiplier); // v10.4.1-iframe: 2.5x longer
      if(_ttl && _connTTLMultiplier > 1) _ttl = Math.round(_ttl * _connTTLMultiplier); // slow network: extend TTLs
      if (age > _ttl) {
        // Expired — remove from storage but return for SWR use
        if (!SWR_ACTIONS.has(action)) {
          localStorage.removeItem(key);
          return null;
        }
        // SWR: return stale data, mark as stale
        // v20.0.0-perf: If data is >3x TTL stale, don't return it — force network fetch
        // to prevent flashing very old data on page load.
        if (age > _ttl * 3) {
          localStorage.removeItem(key);
          return null;
        }
        return { data: entry.data, stale: true, age: age };
      }
      return { data: entry.data, stale: false, age: age };
    } catch (_) { return null; }
  }

  function cacheSet(action, body, data) {
    try {
      var key = storageKey(action, body);
      var entry = JSON.stringify({ data: data, ts: Date.now() });
      localStorage.setItem(key, entry);
      // v15.0.0-perf: Register key for O(1) invalidation
      if (ERP_DATA._registerCacheKey) ERP_DATA._registerCacheKey(key);
      // Emit custom event so other components can react
      try { window.dispatchEvent(new CustomEvent('erp:cache-update', {
        detail: { action: action, data: data }
      })); } catch (_) {}
    } catch (_) {
      // localStorage full — evict oldest entries
      evictStaleCache();
    }
  }

  function cacheDelete(action, body) {
    try {
      var key = storageKey(action, body);
      localStorage.removeItem(key);
      // v15.0.0-perf: Unregister key for O(1) invalidation
      if (ERP_DATA._unregisterCacheKey) ERP_DATA._unregisterCacheKey(key);
    } catch (_) {}
  }

  function cacheClear() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(STORAGE_PREFIX) === 0) keys.push(k);
      }
      keys.forEach(function(k) { localStorage.removeItem(k); });
      // v15.0.0-perf: Clear registry
      if (ERP_DATA._cacheKeyRegistry_) ERP_DATA._cacheKeyRegistry_ = null;
    } catch (_) {}
  }

  // v12.19.0-perf: Optimized LRU eviction — samples instead of full scan.
  // On localStorage full, removes the 10 oldest entries from a random sample
  // of 30 cache entries. This is O(30) instead of O(n) for large caches.
  function evictStaleCache() {
    try {
      var prefix = STORAGE_PREFIX;
      var candidates = [];
      // Collect a random sample of cache entries (fast path)
      var total = localStorage.length;
      var sampleSize = Math.min(30, total);
      var step = Math.max(1, Math.floor(total / sampleSize));
      for (var i = 0; i < total && candidates.length < sampleSize; i += step) {
        var k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) {
          try {
            var raw = localStorage.getItem(k);
            var parsed = JSON.parse(raw);
            candidates.push({ key: k, ts: parsed.ts || 0 });
          } catch (_) {
            candidates.push({ key: k, ts: 0 });
          }
        }
      }
      // Sort oldest first, remove oldest 10 (or fewer if sample is small)
      candidates.sort(function(a, b) { return a.ts - b.ts; });
      var toRemove = Math.min(10, candidates.length);
      for (var j = 0; j < toRemove; j++) {
        localStorage.removeItem(candidates[j].key);
      }
    } catch (_) {}
  }

  /* ─── DUAL-BACKEND FETCH ───
   * v12.17.3-instant: Tries PHP first (fast local DB), falls back to GAS.
   * Uses _PHP_API_POOL for URL failover — matches code.gs HOSTINGER_URL_POOL.
   * PHP responses are returned from MySQL in-process memory — no Sheets reads.
   * GAS responses are written back to PHP cache (fire-and-forget) to warm it.
   * AbortController races: PHP 4s / 8s, GAS 22s. */
  // ── v12.21.0: Per-host failure tracker for circuit-breaking ──────────
  // v12.27.8-httpstatus: Distinguishes 404 (action not found on PHP) from
  // 500 (server error). 404s don't open the circuit — the server is healthy,
  // the action just isn't implemented on PHP. Only 500s/timeouts count as
  // real failures. This prevents a single GAS-only action from tripping the
  // breaker and blocking all subsequent PHP reads for 30s.
  var _phpFailCounts = {}; // { url: {count, firstFailTs} }
  var _php404Counts = {};  // { url: {count, firstFailTs} } — separate counter for 404s
  var _CIRCUIT_BREAK_THRESHOLD = 3;     // consecutive failures before skipping
  var _CIRCUIT_RESET_MS = 30000;        // reset after 30s
  var _PHP_404_CAP = 10;                // ignore 404s until this many (avoids masking a totally wrong URL)

  function _markPhpSuccess_(url) {
    delete _phpFailCounts[url];
    delete _php404Counts[url];
  }

  function _markPhpFailure_(url, statusCode) {
    // HTTP 404 = action not found on PHP — NOT a server failure.
    // Only track these with a separate counter so a wrongly-routed URL
    // (every action returns 404) eventually gets skipped.
    if (statusCode === 404) {
      var now = Date.now();
      var entry = _php404Counts[url];
      if (!entry || (now - entry.firstFailTs) > _CIRCUIT_RESET_MS * 3) {
        _php404Counts[url] = { count: 1, firstFailTs: now };
      } else {
        entry.count++;
      }
      return;
    }
    // 5xx, timeout, network error, or other — real failure
    var now = Date.now();
    var entry = _phpFailCounts[url];
    if (!entry || (now - entry.firstFailTs) > _CIRCUIT_RESET_MS) {
      _phpFailCounts[url] = { count: 1, firstFailTs: now };
    } else {
      entry.count++;
    }
  }

  function _isCircuitOpen_(url) {
    var entry = _phpFailCounts[url];
    if (!entry) return false;
    if ((Date.now() - entry.firstFailTs) > _CIRCUIT_RESET_MS) {
      delete _phpFailCounts[url];
      return false;
    }
    return entry.count >= _CIRCUIT_BREAK_THRESHOLD;
  }

  function _is404CircuitOpen_(url) {
    // Separate check for 404-heavy URLs — if every action returns 404,
    // the URL is probably wrong. Uses a higher threshold.
    var entry = _php404Counts[url];
    if (!entry) return false;
    if ((Date.now() - entry.firstFailTs) > _CIRCUIT_RESET_MS * 3) {
      delete _php404Counts[url];
      return false;
    }
    return entry.count >= _PHP_404_CAP;
  }

  // Expose for connectivity monitoring
  window.__ERP_PHP_FAIL_COUNTS = _phpFailCounts;

  // v12.26.0: file:// protocol detection — skip PHP pool entirely.
  // Cached in sessionStorage so repeated calls are instant.
  var _isFileProtocol = false;
  try {
    var _cachedFp = window._safeSS && window._safeSS.getItem('__erp_file_protocol');
    if (_cachedFp !== null) {
      _isFileProtocol = _cachedFp === '1';
    } else {
      _isFileProtocol = (typeof window !== 'undefined' && window.location &&
          (String(window.location.protocol) === 'file:' || window.location.origin === 'null'));
      if (window._safeSS) window._safeSS.setItem('__erp_file_protocol', _isFileProtocol ? '1' : '0');
    }
  } catch(_) { _isFileProtocol = false; }

  async function dualFetch(action, data, retries) {
    retries = retries || 1;

    // ═══ MODERN POOL: use weighted pool if available ════════════════
    // Skip when running from file:// protocol (CORS blocks all fetches).
    var phpUrl = null;
    // v12.32.9-laravel: Accept relative /api URLs for Laravel backend
    var _filterHttp = function(arr) {
      if (!Array.isArray(arr)) return [];
      return arr.filter(function(u){
        return u && typeof u === 'string' && (u.indexOf('/') === 0 || u.indexOf('http') === 0);
      });
    };
    if (!_isFileProtocol) {
      if (window.__ERP_POOL && typeof window.__ERP_POOL.getBestUrl === 'function') {
        var best = window.__ERP_POOL.getBestUrl();
        phpUrl = best ? best.url : null;
      }
      // Fallback to legacy pool
      if (!phpUrl) {
        var _poolArr = _filterHttp(window._PHP_API_POOL);
        if (!_poolArr.length && window._PHP_API_URL) {
          _poolArr = _filterHttp([window._PHP_API_URL]);
        }
        phpUrl = _poolArr[0];
      }
    }

    // ═══ PHP PRIMARY ═══════════════════════════════════════════════
    // v12.27.8-httpstatus: Distinguishes HTTP 404 (action not found on PHP)
    // from 500 (server error). On 404, skips the entire PHP pool and falls
    // through to GAS immediately — no point retrying other PHP URLs for the
    // same action. On 500, retries other pool URLs, then falls through to GAS.
    var _phpReturned404 = false;
    if (phpUrl && !_isCircuitOpen_(phpUrl) && !_is404CircuitOpen_(phpUrl)) {
      try {
        var _phpDLTimeout = (typeof window.__ERP_PHP_TIMEOUT_READ !== 'undefined') ? window.__ERP_PHP_TIMEOUT_READ : 5000;
        var phpResp = await fetch(phpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: action, ...data }),
          signal: AbortSignal.timeout(_phpDLTimeout)
        });
        if (phpResp.ok) {
          var phpJson = await phpResp.json();
          if (phpJson && phpJson.success !== false) {
            _markPhpSuccess_(phpUrl);
            if (window.__ERP_POOL && typeof window.__ERP_POOL.markSuccess === 'function') {
              window.__ERP_POOL.markSuccess(phpUrl, 0);
            }
            cacheSet(action, data, phpJson);
            return phpJson;
          }
          // PHP returned HTTP 200 but success === false — treat as 500-level (logic error)
          _markPhpFailure_(phpUrl, 500);
          if (window.__ERP_POOL && typeof window.__ERP_POOL.markFailure === 'function') {
            window.__ERP_POOL.markFailure(phpUrl);
          }
          // Try to extract a meaningful error from the body
          if (phpJson && phpJson.error) {
            console.warn('[DataLayer] PHP logic error for ' + action + ': ' + phpJson.error);
          }
        } else if (phpResp.status === 404) {
          // 404 = this action doesn't exist on PHP — NOT a server failure
          _markPhpFailure_(phpUrl, 404);
          _phpReturned404 = true;
          console.debug('[DataLayer] PHP 404 for action=' + action + ' — falling through to GAS');
        } else {
          // 5xx, 4xx (except 404), etc. — real server failure
          _markPhpFailure_(phpUrl, phpResp.status);
          if (window.__ERP_POOL && typeof window.__ERP_POOL.markFailure === 'function') {
            window.__ERP_POOL.markFailure(phpUrl);
          }
          // Try to extract error body for diagnostics
          try {
            phpResp.text().then(function(_bodyText) {
              if (_bodyText && _bodyText.length < 500) {
                console.warn('[DataLayer] PHP HTTP ' + phpResp.status + ' body: ' + _bodyText.slice(0, 200));
              }
            }).catch(function(){});
          } catch(_) {}
        }
      } catch (_) {
        _markPhpFailure_(phpUrl, 0); // timeout / network error
        if (window.__ERP_POOL && typeof window.__ERP_POOL.markFailure === 'function') {
          window.__ERP_POOL.markFailure(phpUrl);
        }
      }

      // ═══ PHP POOL FALLBACK: try remaining pool URLs ═══════════════
      // Skip entirely when:
      //   • running from file:// (CORS blocks everything)
      //   • primary returned 404 (other URLs will also 404 for this action)
      // Skip entirely when running from file:// (CORS blocks everything)
      if (!_isFileProtocol && !_phpReturned404) {
      var _allPhpPool = (typeof window._PHP_API_POOL !== 'undefined' && window._PHP_API_POOL.length)
        ? window._PHP_API_POOL : [];
      for (var _pi = 0; _pi < _allPhpPool.length; _pi++) {
        var _altUrl = _allPhpPool[_pi];
        if (_altUrl === phpUrl || _isCircuitOpen_(_altUrl) || _is404CircuitOpen_(_altUrl)) continue;
        try {
          var _altResp = await fetch(_altUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, ...data }),
            signal: AbortSignal.timeout(Math.round(_phpDLTimeout * 0.7))
          });
          if (_altResp.ok) {
            var _altJson = await _altResp.json();
            if (_altJson && _altJson.success !== false) {
              _markPhpSuccess_(_altUrl);
              if (window.__ERP_POOL && typeof window.__ERP_POOL.markSuccess === 'function') {
                window.__ERP_POOL.markSuccess(_altUrl, 0);
              }
              cacheSet(action, data, _altJson);
              return _altJson;
            }
          } else if (_altResp.status === 404) {
            // Skip remaining pool — 404 means the action isn't on PHP at all
            break;
          }
        } catch(__) {}
      }
      }
    }

    // ═══ GAS FALLBACK (authoritative) ═════════════════════════════
    // v15.0.0-perf: Remap getmyforms → getforms for GAS (GAS has no dedicated getmyforms action)
    var _gasAction = (action === 'getmyforms') ? 'getforms' : action;
    var gasUrl = (typeof window.__ERP_getGASURL === 'function') ? window.__ERP_getGASURL() :
                 (typeof window.__ERP_GAS_URL !== 'undefined') ? window.__ERP_GAS_URL :
                 (typeof GAS_URL !== 'undefined') ? GAS_URL : '';
    if (!gasUrl) throw new Error('No backend URL available');

    if (!_shouldTryGas()) {
      var _staleCache = cacheGet(action, data);
      if (_staleCache) {
        _staleCache._fromStaleCache = true;
        _staleCache._gasDown = true;
        return _staleCache;
      }
      throw new Error('GAS backend is unreachable — data unavailable. Опитайте отново по-късно.');
    }

    // ═══ GAS WITH RETRY + JITTER ══════════════════════════════════
    var _lastGasErr = null;
    for (var attempt = 0; attempt <= retries; attempt++) {
      try {
        var controller = new AbortController();
        var timer = setTimeout(function() { controller.abort(); }, 22000);
        var res = await fetch(gasUrl, {
          method: 'POST',
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'Accept': 'application/json' },
          body: JSON.stringify({ action: _gasAction, ...data })
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error('GAS HTTP ' + res.status);
        var text = await res.text();
        if (/^\s*<!doctype html|^\s*<html/i.test(text)) {
          _markGasDown();
          throw new Error('GAS returned HTML');
        }
        var json = JSON.parse(text);
        _markGasUp();
        cacheSet(action, data, json);
        _syncToPHP(action, data, json);
        return json;
      } catch (err) {
        _lastGasErr = err;
        _markGasDown();
        if (attempt < retries && _shouldTryGas()) {
          // Exponential backoff with jitter (100-400ms random)
          var delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 400);
          await new Promise(function(r) { setTimeout(r, delay); });
          continue;
        }
        throw err;
      }
    }
    throw _lastGasErr || new Error('GAS fallback exhausted');
  }

  /* ─── PHP CACHE SYNC (fire-and-forget) ───
   * Writes successful GAS responses to the PHP MySQL cache so subsequent
   * PHP reads serve instantly without hitting GAS.
   * v12.27.8-httpstatus: Silently ignores HTTP 404 (action not on PHP) and
   * HTTP 500 (server error) — the GAS response is already cached in
   * localStorage, so PHP cache warming is purely opportunistic. */
  async function _syncToPHP(action, data, response) {
    // v12.32.9-laravel: Accept relative /api URLs for Laravel backend
    var phpUrl = (typeof window._PHP_API_URL !== 'undefined' && (window._PHP_API_URL.indexOf('/') === 0 || /^https?:\/\//.test(window._PHP_API_URL))) ? window._PHP_API_URL : null;
    if (!phpUrl || !response) return;
    try {
      var cacheKey = String(action).toLowerCase() + '::' + JSON.stringify(data);
      var ttl = CACHE_TTL[action] || CACHE_TTL_DEFAULT_MS;
      ttl = Math.ceil(ttl / 1000); // convert to seconds
      var _resp = await fetch(phpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gassetcache',
          cacheKey: cacheKey,
          responseData: JSON.stringify(response),
          ttlSeconds: ttl
        })
      });
      // 404/500 are expected when PHP doesn't implement gassetcache —
      // silently ignore, the caller doesn't depend on this sync.
      if (!_resp.ok && _resp.status !== 404 && _resp.status !== 500) {
        console.warn('[DataLayer] _syncToPHP returned HTTP ' + _resp.status + ' for ' + action);
      }
    } catch(_) {
      // Network error — fire-and-forget, no recovery needed
    }
  }

  /* ─── DEAD-LETTER QUEUE (v12.17.2) ─────────────────────────────────
   * Tracks mutations that fail during execution/sync and retries them with
   * exponential backoff. Ensures no user edits are lost, even if the backend
   * is temporarily unavailable.
   */
  var DLQ_KEY = STORAGE_PREFIX + 'dlq:mutations';
  var DLQ_MAX_RETRIES = 5;
  var DLQ_BASE_DELAY_MS = 1000; // 1s base delay, then 2s, 4s, 8s, 16s

  function enqueueDLQMutation(action, data, attempt) {
    attempt = attempt || 0;
    try {
      var dlq = JSON.parse(localStorage.getItem(DLQ_KEY) || '[]');
      dlq.push({
        action: action,
        data: data,
        ts: Date.now(),
        attempt: attempt,
        nextRetry: Date.now() + (DLQ_BASE_DELAY_MS * Math.pow(2, attempt)),
        id: action + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
      });
      // Keep max 100 DLQ entries
      if (dlq.length > 100) dlq = dlq.slice(dlq.length - 100);
      localStorage.setItem(DLQ_KEY, JSON.stringify(dlq));
      try {
        window.dispatchEvent(new CustomEvent('erp:dlq-enqueue', {
          detail: { action: action, attempt: attempt }
        }));
      } catch (_) {}
      // v12.17.2-analytics: Emit analytics event for DLQ monitoring
      try {
        window.dispatchEvent(new CustomEvent('erp:analytics', {
          detail: { type: 'dlq:enqueue', action: action, attempt: attempt, timestamp: Date.now() }
        }));
      } catch (_) {}
    } catch (_) {}
  }

  function dequeueDLQMutation(id) {
    try {
      var dlq = JSON.parse(localStorage.getItem(DLQ_KEY) || '[]');
      dlq = dlq.filter(function(m) { return m.id !== id; });
      localStorage.setItem(DLQ_KEY, JSON.stringify(dlq));
    } catch (_) {}
  }

  async function processDLQMutations() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      var dlq = JSON.parse(localStorage.getItem(DLQ_KEY) || '[]');
      var now = Date.now();
      var processed = 0;
      for (var i = 0; i < dlq.length && processed < 3; i++) {
        var m = dlq[i];
        if (!m || m.nextRetry > now) continue; // Not ready yet
        if ((m.attempt || 0) >= DLQ_MAX_RETRIES) {
          // Max retries exceeded, remove but log
          console.warn('DLQ: mutation abandoned after ' + DLQ_MAX_RETRIES + ' attempts:', m.action);
          dequeueDLQMutation(m.id);
          continue;
        }
        try {
          // Try via api() so it uses the same retry logic + health checks
          var result = await api(m.action, m.data || {}, 1);
          if (result && result.success !== false) {
            dequeueDLQMutation(m.id);
            processed++;
            try {
              window.dispatchEvent(new CustomEvent('erp:dlq-success', {
                detail: { action: m.action, attempt: m.attempt }
              }));
            } catch (_) {}
            // v12.17.2-analytics: Emit success event for DLQ mutation
            try {
              window.dispatchEvent(new CustomEvent('erp:analytics', {
                detail: { type: 'dlq:success', action: m.action, attempt: m.attempt, timestamp: Date.now() }
              }));
            } catch (_) {}
          } else {
            // Still failed, re-enqueue with next attempt
            dequeueDLQMutation(m.id);
            enqueueDLQMutation(m.action, m.data, (m.attempt || 0) + 1);
            // v12.17.2-analytics: Emit failure event for DLQ mutation
            try {
              window.dispatchEvent(new CustomEvent('erp:analytics', {
                detail: { type: 'dlq:retry', action: m.action, attempt: m.attempt, nextAttempt: (m.attempt || 0) + 1, timestamp: Date.now() }
              }));
            } catch (_) {}
          }
        } catch (_) {
          // Network error, re-enqueue for later
          dequeueDLQMutation(m.id);
          enqueueDLQMutation(m.action, m.data, (m.attempt || 0) + 1);
          // v12.17.2-analytics: Emit network error event for DLQ mutation
          try {
            window.dispatchEvent(new CustomEvent('erp:analytics', {
              detail: { type: 'dlq:networkError', action: m.action, attempt: m.attempt, nextAttempt: (m.attempt || 0) + 1, timestamp: Date.now() }
            }));
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // Process DLQ periodically (every 30s) and when page becomes visible
  if (typeof setInterval !== 'undefined') {
    setInterval(processDLQMutations, 30000);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) processDLQMutations();
    });
  }

  /* ─── MUTATION QUEUE (offline writes) ─── */
  function enqueueMutation(action, data) {
    try {
      var queue = JSON.parse(localStorage.getItem(MUTATION_QUEUE_KEY) || '[]');
      queue.push({ action: action, data: data, ts: Date.now(), id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
      // Keep max 50 pending mutations
      if (queue.length > 50) queue = queue.slice(queue.length - 50);
      localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
    } catch (_) {}
  }

  function dequeueMutation(id) {
    try {
      var queue = JSON.parse(localStorage.getItem(MUTATION_QUEUE_KEY) || '[]');
      queue = queue.filter(function(m) { return m.id !== id; });
      localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue));
    } catch (_) {}
  }

  async function flushMutationQueue() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      var queue = JSON.parse(localStorage.getItem(MUTATION_QUEUE_KEY) || '[]');
      if (!queue.length) return;
      for (var i = 0; i < queue.length; i++) {
        var m = queue[i];
        try {
          // Try GAS (authoritative)
          var gasUrl = (typeof window.__ERP_getGASURL === 'function') ? window.__ERP_getGASURL() :
                       (typeof window.__ERP_GAS_URL !== 'undefined') ? window.__ERP_GAS_URL : '';
          if (gasUrl) {
            await fetch(gasUrl, {
              method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
              body: JSON.stringify({ action: m.action, ...m.data })
            });
          }
          // Also try PHP if available
          var phpUrl = (typeof window._PHP_API_URL !== 'undefined' && (window._PHP_API_URL.indexOf('/') === 0 || window._PHP_API_URL.indexOf('http') === 0)) ? window._PHP_API_URL : null;
          if (phpUrl) {
            fetch(phpUrl, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: m.action, ...m.data })
            }).catch(function(){}); // fire-and-forget
          }
          dequeueMutation(m.id);
        } catch (err) {
          // Move to dead-letter queue for later retry
          enqueueDLQMutation(m.action, m.data);
          dequeueMutation(m.id);
          break; // stop on first failure
        }
      }
    } catch (_) {}
  }

  /* ─── PUBLIC API ─── */
  var ERP_DATA = {
    // ── Synchronous localStorage read (instant — 0ms, no network) ──
    // Returns cached data immediately or undefined if not cached/stale.
    // Used by api() for instant-first-render before async fetch.
    readSync: function(action, data) {
      var body = data || {};
      var cached = cacheGet(action, body);
      if (cached && !cached.stale) return cached.data;
      // Stale: trigger background refresh but return stale data
      if (cached && cached.stale && isPageVisible()) {
        var reqKey = action + '::' + JSON.stringify(body);
        if (!inflightMap.has(reqKey)) {
          // v10.5.0-iframe-perf: use shared _swrDelayMs
          var bgPromise = new Promise(function(r){setTimeout(r,_swrDelayMs);}).then(function(){
            return dualFetch(action, body);
          }).then(function(fresh) { return fresh; })
            .catch(function() {})
            .finally(function() { inflightMap.delete(reqKey); });
          inflightMap.set(reqKey, bgPromise);
        }
        return cached.data;
      }
      return undefined;
    },

    // ── Read with instant-load SWR (async — full flow with network) ──
    // Returns cached data immediately (if available), refreshes in background.
    // Always resolves with data — never throws for cached reads.
    read: async function(action, data, opts) {
      opts = opts || {};
      var body = data || {};
      var forceRefresh = opts.forceRefresh || false;

      // Deduplicate in-flight requests
      var reqKey = action + '::' + JSON.stringify(body);
      if (!forceRefresh && inflightMap.has(reqKey)) {
        return inflightMap.get(reqKey);
      }

      // 1) Check localStorage cache (instant render)
      if (!forceRefresh) {
        var cached = cacheGet(action, body);
        if (cached) {
          // SWR: if not stale, return immediately
          if (!cached.stale) return cached.data;
          // Stale: schedule background refresh, return stale data
          if (isPageVisible() && !inflightMap.has(reqKey)) {
            // v10.5.0-iframe-perf: use shared _swrDelayMs
            var bgPromise = new Promise(function(r){setTimeout(r,_swrDelayMs);}).then(function(){
              return dualFetch(action, body);
            }).then(function(fresh) { return fresh; })
              .catch(function() { /* keep stale data */ })
              .finally(function() { inflightMap.delete(reqKey); });
            inflightMap.set(reqKey, bgPromise);
          }
          return cached.data;
        }
      }

      // 2) Cache miss or forced refresh — fetch from network
      var fetchPromise = dualFetch(action, body)
        .then(function(result) {
          inflightMap.delete(reqKey);
          return result;
        })
        .catch(function(err) {
          inflightMap.delete(reqKey);
          // On network failure, try localStorage one more time
          var fallback = cacheGet(action, body);
          if (fallback) return fallback.data;
          throw err;
        });

      inflightMap.set(reqKey, fetchPromise);
      return fetchPromise;
    },

    // ── v12.26.0-dualwrite: PHP-primary write with GAS mirror ──
    // 1) Try PHP first (fast, ~200ms)
    // 2) Fire-and-forget mirror to GAS (non-blocking)
    // 3) On PHP failure, try GAS directly
    // 4) On total failure, queue for offline replay
    write: async function(action, data, opts) {
      opts = opts || {};
      var optimisticResult = opts.optimisticResult || null;

      // 1) Optimistic localStorage update
      if (optimisticResult) {
        cacheSet(action, data, optimisticResult);
      }

      // 2) Check online status
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        enqueueMutation(action, data);
        return optimisticResult || { success: true, _offline: true };
      }

      // 3) PHP primary write (fast, reliable)
      // v12.32.9-laravel: Accept relative /api URLs for Laravel backend
      var phpUrl = (typeof window._PHP_API_URL !== 'undefined' && (window._PHP_API_URL.indexOf('/') === 0 || window._PHP_API_URL.indexOf('http') === 0)) ? window._PHP_API_URL : null;
      var phpSuccess = false;
      var _phpWriteReturned404 = false;
      if (phpUrl) {
        try {
          var phpResp = await fetch(phpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, ...data }),
            signal: AbortSignal.timeout(15000)
          });
          if (phpResp.ok) {
            var phpJson = await phpResp.json();
            if (phpJson && phpJson.success !== false) {
              phpSuccess = true;
              // v12.28.0-cache: Invalidate related caches on successful write
              _invalidateRelatedCaches_(action, data);
              // v12.30.0-realtime: Dispatch document/form-specific events
              _dispatchSyncEvent_(action, data, phpJson);
              // v12.30.0-realtime: Trigger immediate GAS sync (bypasses 1min cron)
              _triggerSyncNow_();
              // Fire-and-forget mirror to GAS in background
              _mirrorWriteToGAS_(action, data);
              return phpJson;
            }
          } else if (phpResp.status === 404) {
            _phpWriteReturned404 = true;
            console.debug('[DataLayer] write: PHP 404 for action=' + action + ' — falling through to GAS');
          }
        } catch(_) { /* PHP write failed, fall through to GAS */ }
      }

      // 4) GAS fallback for writes PHP couldn't handle
      var gasUrl = (typeof window.__ERP_getGASURL === 'function') ? window.__ERP_getGASURL() :
                   (typeof window.__ERP_GAS_URL !== 'undefined') ? window.__ERP_GAS_URL :
                   (typeof GAS_URL !== 'undefined') ? GAS_URL : '';
      if (!gasUrl || !_shouldTryGas()) {
        // GAS is down — if PHP succeeded we already returned. If here, queue for offline.
        if (!phpSuccess) {
          enqueueMutation(action, data);
          return optimisticResult || { success: true, _offline: true, _queued: true };
        }
        throw new Error('No backend available for write');
      }

      try {
        var gasResp = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ action: action, ...data })
        });
        if (!gasResp.ok) throw new Error('GAS error ' + gasResp.status);
        var text = await gasResp.text();
        if (/^\s*<!doctype html|^\s*<html/i.test(text)) throw new Error('GAS returned HTML');
        _markGasUp();
        return JSON.parse(text);
      } catch(gasErr) {
        _markGasDown();
        // If PHP succeeded earlier, the write is good — GAS mirror failure is non-fatal
        if (phpSuccess) return optimisticResult || { success: true, _mirrorFailed: true };
        enqueueMutation(action, data);
        return optimisticResult || { success: true, _offline: true, _queued: true };
      }
    },

    // ── Fire-and-forget GAS mirror for writes ──
    // v12.27.8-httpstatus: Handles GAS 404 (deployment URL changed / expired)
    // and 500 (server error) gracefully — the write already succeeded on PHP,
    // so the GAS mirror is purely opportunistic. On persistent 404, marks GAS
    // as down to avoid pointless retries.
    _mirrorWriteToGAS_: async function(action, data) {
      var gasUrl = (typeof window.__ERP_getGASURL === 'function') ? window.__ERP_getGASURL() :
                   (typeof window.__ERP_GAS_URL !== 'undefined') ? window.__ERP_GAS_URL : '';
      if (!gasUrl || !_shouldTryGas()) return;
      try {
        var res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ action: action, ...data }),
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          _markGasUp();
        } else if (res.status === 404) {
          // GAS deployment URL is stale — don't mark as down, but log a warning
          console.warn('[DataLayer] GAS 404 on mirror write — deployment URL may be stale');
        } else {
          // 5xx or other error — mark GAS as down temporarily
          _markGasDown();
        }
      } catch(_) { _markGasDown(); }
    },

    // ── v12.28.0-cache: Invalidate related caches after a mutation write.
    // Uses MUTATION_CACHE_MAP to find which read caches to clear.
    // v12.30.0-realtime: Dispatch sync events for real-time UI updates
    _dispatchSyncEvent_: function(action, data, result) {
      try {
        // Document-specific events
        var _docEvents = {
          'uploadmydocument': 'erp:mydocAdded',
          'deletemydocument': 'erp:mydocRemoved',
          'copydocforuser': 'erp:mydocAdded',
          'renamemydocument': 'erp:mydocUpdated',
          'deletefile': 'erp:mydocRemoved',
          'updatedeliverable': 'erp:deliverableUpdated',
          'createapplication': 'erp:forms-changed',
          'createform': 'erp:forms-changed',
          'updateform': 'erp:forms-changed',
          'deleteform': 'erp:forms-changed',
          'submitform': 'erp:forms-changed',
          'createcompetition': 'erp:competitions-changed',
          'editcompetition': 'erp:competitions-changed',
        };
        var _evtName = _docEvents[action];
        if (_evtName) {
          window.dispatchEvent(new CustomEvent(_evtName, { detail: { action: action, data: data, result: result } }));
        }
        // Generic sync event for all writes
        window.dispatchEvent(new CustomEvent('erp:data-synced', {
          detail: { action: action, timestamp: Date.now(), result: result }
        }));
      } catch(_) {}
    },

    // v12.30.0-realtime: Fire-and-forget trigger for sync_queue processing.
    // This propagates PHP mutations to GAS within seconds, bypassing the 1-minute cron.
    // v15.0.0-perf: Debounced sync trigger — coalesces rapid mutations into
    // a single syncnow call. If multiple writes happen within 2s (e.g. form
    // auto-save during typing), only ONE sync request is sent.
    _syncNowTimer_: null,
    _triggerSyncNow_: function() {
      try {
        if (this._syncNowTimer_) return; // Debounce: already scheduled
        this._syncNowTimer_ = setTimeout(function(_self) {
          _self._syncNowTimer_ = null;
          var _phpUrl = window._PHP_API_URL || (window.__ERP_GAS_URL || '');
          if (!_phpUrl) return;
          fetch(_phpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'syncnow' }),
            signal: AbortSignal.timeout(5000)
          }).catch(function() {});
        }, 2000, this); // 2s debounce window
      } catch(_) {}
    },

    // v15.0.0-perf: Cache key registry for O(1) invalidation instead of
    // scanning all localStorage keys. Updated by cacheSet/cacheDelete.
    _cacheKeyRegistry_: null,
    _ensureRegistry_: function() {
      if (this._cacheKeyRegistry_) return;
      this._cacheKeyRegistry_ = new Set();
      try {
        var prefix = STORAGE_PREFIX;
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) this._cacheKeyRegistry_.add(k);
        }
      } catch(_) {}
    },
    _registerCacheKey_: function(key) {
      try {
        if (!this._cacheKeyRegistry_) this._cacheKeyRegistry_ = new Set();
        this._cacheKeyRegistry_.add(key);
      } catch(_) {}
    },
    _unregisterCacheKey_: function(key) {
      try {
        if (this._cacheKeyRegistry_) this._cacheKeyRegistry_.delete(key);
      } catch(_) {}
    },

    _invalidateRelatedCaches_: function(action, data) {
      var actionsToClear = MUTATION_CACHE_MAP[action];
      if (!actionsToClear || actionsToClear.length === 0) {
        // Unknown mutation — invalidate ALL caches for safety
        cacheClear();
        this._cacheKeyRegistry_ = null;
        return;
      }
      try {
        var prefix = STORAGE_PREFIX;
        // v15.0.0-perf: Use registry for O(1) iteration over cache keys only
        this._ensureRegistry_();
        var registry = this._cacheKeyRegistry_;
        if (!registry || registry.size === 0) {
          // Fallback: scan localStorage (legacy path)
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(prefix) === 0) registry.add(k);
          }
        }
        var keysToRemove = [];
        registry.forEach(function(k) {
          for (var j = 0; j < actionsToClear.length; j++) {
            if (k.indexOf(prefix + actionsToClear[j] + '::') === 0) {
              keysToRemove.push(k);
              break;
            }
          }
        });
        keysToRemove.forEach(function(k) {
          localStorage.removeItem(k);
          if (registry) registry.delete(k);
        });
        // Also bump a DOM event so connected React components refresh
        try {
          window.dispatchEvent(new CustomEvent('erp:cache-invalidate', {
            detail: { action: action, cleared: actionsToClear }
          }));
        } catch(_) {}
      } catch(_) {
        // On error, fall back to full clear
        cacheClear();
        this._cacheKeyRegistry_ = null;
      }
    },

    // ── Invalidate cache entries ──
    // Clears all cached data for a given action pattern
    invalidate: function(actionPattern) {
      try {
        var prefix = STORAGE_PREFIX;
        if (actionPattern) prefix += actionPattern;
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) localStorage.removeItem(k);
        }
      } catch (_) {}
    },

    // ── Clear entire data cache ──
    clear: function() {
      cacheClear();
    },

    // ── v12.19.0-perf: Warm up cache using batch API (1 request vs N) ──
    // Uses the PHP batchapi endpoint to fetch multiple actions in one round-trip.
    // Falls back to individual requests if batch API is unavailable.
    warm: async function(actions) {
      if (!Array.isArray(actions) || actions.length === 0) return;
      var phpUrl = (typeof window._PHP_API_URL !== 'undefined' && (window._PHP_API_URL.indexOf('/') === 0 || window._PHP_API_URL.indexOf('http') === 0)) ? window._PHP_API_URL : null;

      // Try batch API first (single round-trip for all actions)
      if (phpUrl && actions.length > 1) {
        try {
          var batchRequests = actions.map(function(a) {
            return Object.assign({ action: a.action }, a.data || {});
          });
          var resp = await fetch(phpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'batchapi', requests: batchRequests }),
            signal: AbortSignal.timeout(8000)
          });
          if (resp.ok) {
            var json = await resp.json();
            if (json && json.success && json.results) {
              // Cache each result individually
              json.results.forEach(function(result, i) {
                if (result && result.success !== false) {
                  var a = actions[i];
                  cacheSet(a.action, a.data || {}, result);
                }
              });
              return json.results;
            }
          }
        } catch (_) {
          // Batch failed — fall through to individual requests
        }
      }

      // Fallback: individual parallel requests
      var results = await Promise.allSettled(
        actions.map(function(a) {
          return ERP_DATA.read(a.action, a.data || {}, { forceRefresh: false })
            .catch(function() {});
        })
      );
      return results;
    },

    // ── Get cache stats ──
    stats: function() {
      var count = 0, size = 0;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(STORAGE_PREFIX) === 0) {
            count++;
            size += (localStorage.getItem(k) || '').length;
          }
        }
      } catch (_) {}
      return { entries: count, sizeBytes: size, sizeKB: Math.round(size / 1024) };
    },

    // ── Flush offline mutation queue ──
    flushOffline: function() {
      return flushMutationQueue();
    }
  };

  // ── Add cacheSet for external integration (called by api() in utils.js) ──
  ERP_DATA.cacheSet = function(action, data, result) {
    cacheSet(action, data, result);
  };

  // ── Expose globally ──
  global.ERP_DATA = ERP_DATA;

  // ── Auto-flush mutation queue on online event ──
  if (typeof window !== 'undefined') {
    window.addEventListener('online', function() {
      flushMutationQueue();
    });
  }

  // ── Warm critical data on idle ──
  // Uses requestIdleCallback to pre-fetch data without blocking UI.
  // v15.0.0-perf: Reduced timeout further (1200→800ms) so background data
  // warming begins sooner. getforms is now FIRST in the warm list because
  // it's the most critical endpoint — "Моите проектни предложения" must
  // appear instantly when the user navigates to the applicant view.
  // listdocuments moved second so the document picker in Step 2 is pre-warmed.
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(function() {
      ERP_DATA.warm([
        { action: 'getmyforms' },           // v15.0.0-perf: dedicated applicant forms — fastest path
        { action: 'getforms' },             // v15.0.0-perf: generic forms fallback
        { action: 'listdocuments' },        // needed for Step 2 picker
        { action: 'getcompetitions' },
        { action: 'getpubliccompetitions' }
      ]);
    }, { timeout: _isIframe ? 400 : 800 }); // v15.0.0-perf: 500/1200→400/800
  } else if (typeof window !== 'undefined') {
    // Fallback: warm after a short delay — let first paint complete
    var _warmupDelay = _isIframe ? 400 : 500; // v15.0.0-perf: 500/600→400/500
    setTimeout(function() {
      ERP_DATA.warm([
        { action: 'getmyforms' },           // v15.0.0-perf: dedicated applicant forms
        { action: 'getforms' },
        { action: 'listdocuments' },
        { action: 'getcompetitions' },
        { action: 'getpubliccompetitions' }
      ]);
    }, _warmupDelay);
  }

  // ── Periodically flush mutation queue ──
  setInterval(function() {
    flushMutationQueue();
  }, 30000); // v12.27.9: 60s→30s mutation flush — recovers offline writes faster

  var _statsInit = ERP_DATA.stats();
  console.log('[DataLayer] Initialized — ' + _statsInit.entries + ' entries, ' + _statsInit.sizeKB + 'KB' + (_isIframe?' [iframe]':''));

  // ── Expose iframe flag ──
  try{ window.__ERP_IS_IFRAME = _isIframe; }catch(_){}

  // ── Visibility-change: refresh stale cache on tab return ──
  // v15.0.0-perf: Uses requestAnimationFrame to sync with browser paint
  // cycle for jank-free refresh. Checks all critical endpoints in parallel
  // (was sequential). Falls back to 200ms setTimeout (was 500ms).
  // Now includes listdocuments and getmesssages for complete refresh.
  try{
    document.addEventListener('visibilitychange', function(){
      if(document.hidden) return;
      var _doRefresh = function(){
        var _crit = ['getmyforms','getforms','getcompetitions','getpubliccompetitions','listdocuments','getmessages','getnotifications'];
        var _stale = [];
        for(var _ci=0;_ci<_crit.length;_ci++){
          var _ck = cacheGet(_crit[_ci], {});
          if(!_ck || _ck.stale) _stale.push(_crit[_ci]);
        }
        // Refresh all stale caches in parallel
        if(_stale.length){
          Promise.allSettled(_stale.map(function(a){
            return ERP_DATA.read(a, {}, { forceRefresh: true }).catch(function(){});
          }));
        }
      };
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(_doRefresh);
      } else if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(_doRefresh, { timeout: 1000 });
      } else {
        setTimeout(_doRefresh, 200);
      }
    });
  }catch(_){}

  // ── v12.19.0-perf: Optimized real-time data version polling ──────────
  // Polls /database/api.php?action=getdataversion periodically.
  // Key improvements over v12.17.3:
  //   1. Random jitter (±30%) prevents thundering-herd from concurrent users
  //   2. Adaptive interval: 15s when visible, 45s when hidden
  //   3. Smart invalidation: only clears affected cache scopes (not ALL)
  //   4. Exponential backoff on consecutive failures (max 60s)
  // When version changes, invalidates affected cache keys and re-fetches.
  (function startVersionPoller(){
    var _phpUrl = null;
    var _lastVersion = null;
    var _pollTimer = null;
    var _consecutiveFailures = 0;
    var _pollCount = 0;           // v12.19.1-perf: counter for per-table breakdown
    // v15.0.0-perf: Increased base interval from 15s→20s to reduce server load.
    // Extended cache TTLs (up to 8min) mean the poller only needs to detect
    // changes — not maintain freshness. Iframe: 2x interval (less network churn).
    var BASE_INTERVAL_MS = _isIframe ? 30000 : 10000; // v12.32.33-realtime: 30s→10s (50s→30s iframe) — near-real-time cross-user updates; getdataversion is a cheap MAX() aggregate
    var HIDDEN_INTERVAL_MS = _isIframe ? 90000 : 60000; // 60s when tab hidden (90s iframe)
    var MAX_INTERVAL_MS = _isIframe ? 120000 : 60000;   // 60s max with backoff (120s iframe)

    function getPhpUrl(){
      return (typeof window._PHP_API_URL !== 'undefined' && (window._PHP_API_URL.indexOf('/') === 0 || window._PHP_API_URL.indexOf('http') === 0)) ? window._PHP_API_URL : null;
    }

    // ── Random jitter: ±30% of interval to prevent thundering herd ──
    function jitter(baseMs) {
      var range = baseMs * 0.3;
      return baseMs + (Math.random() * range * 2) - range;
    }

    // ── Adaptive interval based on visibility + failure count ──
    function getAdaptiveInterval() {
      var base = isPageVisible() ? BASE_INTERVAL_MS : HIDDEN_INTERVAL_MS;
      // Exponential backoff on failures
      if (_consecutiveFailures > 1) {
        base = Math.min(base * Math.pow(1.5, _consecutiveFailures - 1), MAX_INTERVAL_MS);
      }
      return jitter(base);
    }

    function scheduleNext() {
      if (_pollTimer) clearTimeout(_pollTimer);
      var delay = getAdaptiveInterval();
      _pollTimer = setTimeout(pollVersion, delay);
    }

    async function pollVersion(){
      _phpUrl = _phpUrl || getPhpUrl();
      if (!_phpUrl) { scheduleNext(); return; }
      try{
        _pollCount++;
        // v12.19.1-perf: Every 5th poll requests per-table breakdown for smart invalidation.
        // Other polls use the fast MAX() aggregate (lighter DB query).
        var fullBreakdown = (_pollCount % 5 === 0);
        var body = { action: 'getdataversion' };
        if (fullBreakdown) body.full = '1';
        var resp = await fetch(_phpUrl, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(4000)
        });
        if(!resp.ok) {
          // v12.31.6-dbconfig: a 500 with a "Database not configured" body is a
          // fatal server-config failure. Don't hammer the broken endpoint every
          // interval — but DON'T permanently halt: reschedule with a long backoff
          // so polling self-heals once the server's .env is configured (no reload
          // needed). Surfaced once via console.error.
          if (resp.status === 500) {
            try {
              var _cfgTxt = await resp.text();
              if (/Database not configured|Missing:\s*DB_|not configured/i.test(_cfgTxt)) {
                _consecutiveFailures++;
                console.error('[data-layer] DB not configured — version polling backing off 60s. Configure database/.env.');
                _pollTimer = setTimeout(pollVersion, 60000);
                return;
              }
            } catch(_) {}
          }
          _consecutiveFailures++; scheduleNext(); return;
        }
        var json = await resp.json();
        var newVersion = json && (json.version || json.data_version || json._dataVersion);
        if (newVersion == null) { _consecutiveFailures++; scheduleNext(); return; }

        _consecutiveFailures = 0; // Reset on success

        // v20.0.0-perf: Boot-time grace period — skip invalidation for first 5s after page load
        // to prevent flashing stale→empty→fresh during initial render sequence.
        var _bootGraceExpired = Date.now() - _pageLoadTs > 5000;
        if (_lastVersion != null && String(newVersion) !== String(_lastVersion) && _bootGraceExpired) {
          // Data changed — smart invalidation: clear only mutable caches
          _smartCacheInvalidation(json.tables || {});
          if (isPageVisible()) {
            ERP_DATA.warm([
              {action:'getforms'},
              {action:'getcompetitions'},
              {action:'getpubliccompetitions'}
            ]);
          }
          try { window.dispatchEvent(new CustomEvent('erp:data-changed',{
            detail:{oldVersion:_lastVersion, newVersion:newVersion}
          })); } catch(_) {}
        }
        _lastVersion = newVersion;
      }catch(_){
        _consecutiveFailures++;
      }
      scheduleNext();
    }

    // v12.19.0-perf: Smart invalidation based on per-table version bumps.
    // Instead of clearing ALL localStorage, we only clear caches related
    // to tables that actually changed. This preserves warm caches for
    // stable data (documents, sanctions, etc.) across version bumps.
    function _smartCacheInvalidation(tables) {
      if (!tables || Object.keys(tables).length === 0) {
        // No per-table breakdown — fall back to full clear
        cacheClear();
        return;
      }

      // Map table names → cache action prefixes
      var TABLE_TO_ACTIONS = {
        'applications':     ['getforms','getmyforms','getform','getinitialdata','getdashboardcontext','loadmoreforms'],
        'competitions':     ['getcompetitions','getpubliccompetitions','getcontestboard','getcompetitionsummary','loadmorecompetitions'],
        'reviewers':        ['getreviewers','getreviewerforms'],
        'projects':         ['getprojects','getproject','getprojectdashboard'],
        'documents':        ['listdocuments','listmydocuments'],
        'messages':         ['getmessages'],
        'notifications':    ['getnotifications'],
        'sanctions':        ['checksanctions','getsanctions'],
        'ckk_members':      ['listckkmembers'],
        'reports':          ['getreports'],
        'ministry_reports': ['getministryreports'],
        'library_deposits': ['getlibrarydeposits'],
        'change_requests':  ['getchangerequests'],
        'deliverables':     ['getdeliverables']
      };

      var actionsToClear = new Set();
      Object.keys(tables).forEach(function(tableName) {
        var actions = TABLE_TO_ACTIONS[tableName];
        if (actions) {
          actions.forEach(function(a) { actionsToClear.add(a); });
        }
      });

      if (actionsToClear.size === 0) {
        // Unknown tables changed — full clear for safety
        cacheClear();
        return;
      }

      // Clear only affected cache entries
      try {
        var prefix = STORAGE_PREFIX;
        var keysToRemove = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) {
            // Check if this cache key matches any affected action
            var matched = false;
            actionsToClear.forEach(function(action) {
              if (k.indexOf(prefix + action + '::') === 0) {
                matched = true;
              }
            });
            if (matched) keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
      } catch(_) {
        // On error, fall back to full clear
        cacheClear();
      }
    }

    // Listen for visibility changes to adjust polling rate
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
          // Tab became visible — poll immediately and reset interval
          _consecutiveFailures = 0;
          pollVersion();
        }
        // When hiding, the next scheduled poll will use the longer interval
      });
    }

    // Start polling when PHP URL becomes available
    function maybeStart(){
      _phpUrl = getPhpUrl();
      if (!_phpUrl || _pollTimer) return;
      // Initial poll after a short delay (let page settle first)
      // v12.27.9: Reduced from 2000-3000ms to 800-1300ms — faster data-version detection
      _pollTimer = setTimeout(pollVersion, 800 + Math.floor(Math.random() * 500));
    }

    // Try now, and again after short delay in case hostinger-config.js hasn't run yet
    // v12.27.9: Reduced fallback check from 1500ms to 800ms
    maybeStart();
    setTimeout(maybeStart, 800);
  })();

  // ── v12.17.3-instant: Predictive prefetch on hover ────────────────────
  // When a nav tab is hovered for 120ms, prefetch that section's data.
  // Dramatically speeds up perceived navigation — data is often ready
  // before the user finishes clicking.
  (function setupPredictivePrefetch(){
    var HOVER_DELAY_MS = 120;
    var _prefetchTimers = {};
    var _TAB_PREFETCH = {
      'documents': [{action:'listdocuments'},{action:'listmydocuments'}],
      'applications': [{action:'getforms'},{action:'getinitialdata',data:{lean:true}}],
      'dashboard': [{action:'getpubliccompetitions'},{action:'getcompetitions'}],
      'calendar': [{action:'getcompetitions'}],
      'reviewers': [{action:'getreviewers'},{action:'getreviewerforms'}],
      'finance': [{action:'getprojects'}]
    };

    function prefetchTab(tabId){
      var actions = _TAB_PREFETCH[tabId];
      if (!actions) return;
      actions.forEach(function(a){
        var cached = cacheGet(a.action, a.data || {});
        if (!cached) {
          dualFetch(a.action, a.data || {}).catch(function(){});
        }
      });
    }

    // Hook into nav tabs via MutationObserver + event delegation
    document.addEventListener('mouseover', function(ev){
      var btn = ev.target && ev.target.closest&&ev.target.closest('[data-prefetch-tab],[data-tab],.nav-tab');
      if (!btn) return;
      var tabId = btn.getAttribute('data-prefetch-tab') || btn.getAttribute('data-tab') ||
                  (btn.className||'').match(/\bnav-tab\b/)&&(btn.textContent||'').toLowerCase().trim();
      if (!tabId) return;
      if (_prefetchTimers[tabId]) return;
      _prefetchTimers[tabId] = setTimeout(function(){
        delete _prefetchTimers[tabId];
        prefetchTab(tabId);
      }, HOVER_DELAY_MS);
    }, {passive:true});

    document.addEventListener('mouseout', function(ev){
      var btn = ev.target && ev.target.closest&&ev.target.closest('[data-prefetch-tab],[data-tab],.nav-tab');
      if (!btn) return;
      var tabId = btn.getAttribute('data-prefetch-tab') || btn.getAttribute('data-tab') || '';
      if (_prefetchTimers[tabId]){ clearTimeout(_prefetchTimers[tabId]); delete _prefetchTimers[tabId]; }
    }, {passive:true});

    // Expose for app.js tab hover hooks
    global._prefetchTab = prefetchTab;
  })();

  /* ═══════════════════════════════════════════════════════════════════════
   *  v12.18.0: Incremental / Lazy Loading via IntersectionObserver
   *
   *  Monitors sentinel elements with [data-lazy-more] attribute.
   *  When the sentinel enters the viewport, fires loadMoreForms or
   *  loadMoreCompetitions with the next offset, appends results to the
   *  existing DOM container, and updates the sentinel.
   *
   *  Usage in views:
   *    <div data-lazy-more="forms" data-offset="20" data-limit="20"
   *         data-container="#forms-list" data-template="#form-card-template"></div>
   *
   *  The observer auto-stops when hasMore=false or on disconnect().
   *  Falls back to a scroll-listener on browsers without IO.
   */
  (function setupLazyLoader(){
    if (typeof IntersectionObserver === 'undefined') return; // No IO support
    var _lazyObservers = [];

    // Public API for views to register lazy containers
    global._registerLazyContainer = function(opts){
      try {
        var sentinel = (typeof opts.sentinel === 'string')
          ? document.querySelector(opts.sentinel)
          : opts.sentinel;
        if (!sentinel) return;
        var type = opts.type || 'forms'; // 'forms' or 'competitions'
        var container = (typeof opts.container === 'string')
          ? document.querySelector(opts.container)
          : opts.container;
        var onData = opts.onData || function(data, containerEl){ /* no-op */ };
        var onComplete = opts.onComplete || function(){ /* no-op */ };
        var offset = opts.offset || 0;
        var limit = opts.limit || (type === 'forms' ? 20 : 10);
        var loading = false;
        var done = false;

        var observer = new IntersectionObserver(function(entries){
          if (done || loading) return;
          var entry = entries[0];
          if (!entry || !entry.isIntersecting) return;
          loading = true;
          // Access loadMoreForms / loadMoreCompetitions from shared browser script scope
          // (const in non-module scripts are globally accessible but NOT on window).
          // eslint-disable-next-line no-undef
          var apiFn = type === 'forms'
            ? (typeof loadMoreForms === 'function' ? loadMoreForms : null)
            : (typeof loadMoreCompetitions === 'function' ? loadMoreCompetitions : null);
          if (typeof apiFn !== 'function') { loading = false; return; }
          apiFn(offset, limit).then(function(res){
            loading = false;
            if (!res || !res.data || !res.data.length) { done = true; return; }
            if (typeof onData === 'function') onData(res.data, container);
            offset = res.offset + res.data.length;
            if (!res.hasMore) { done = true; observer.disconnect(); if (typeof onComplete === 'function') onComplete(); }
            sentinel.setAttribute('data-offset', String(offset));
          }).catch(function(){
            loading = false;
            // Retry on next intersection
          });
        }, { rootMargin: '200px' }); // Start loading 200px before sentinel is visible
        observer.observe(sentinel);
        _lazyObservers.push(observer);
        return observer;
      } catch(_){ return null; }
    };

    // Cleanup all observers on page unload
    try {
      window.addEventListener('beforeunload', function(){
        _lazyObservers.forEach(function(o){ try{ o.disconnect(); }catch(_){} });
        _lazyObservers = [];
      });
    } catch(_) {}
  })();

  /* ═══════════════════════════════════════════════════════════════════════
   *  v12.21.0: Connectivity Monitoring & Recovery
   *
   *  Listens for erp:connectivity-change events from router.js and
   *  adjusts data-fetching behaviour:
   *    • When GAS is unreachable but PHP is up → degraded mode (PHP-only reads)
   *    • When all backends are down → serve from localStorage only
   *    • When connectivity is restored → immediate cache refresh
   *    • Periodic dead-letter queue retry on reconnection
   *
   *  Also listens for erp:php-all-failed events from dualFetch to
   *  trigger immediate GAS fallback and notify the user.
   */
  (function setupConnectivityMonitor(){
    var _connState = {
      gasUp: null,
      phpUp: null,
      degraded: false,
      lastChange: 0
    };

    function _updateConnState(detail) {
      var prev = Object.assign({}, _connState);
      _connState.gasUp = detail.gasReachable;
      _connState.phpUp = detail.phpReachable;
      _connState.degraded = !!detail.degradedMode;
      _connState.lastChange = Date.now();

      // Recovery: connectivity restored
      if ((!_connState.gasUp && prev.gasUp !== true && _connState.gasUp === true) ||
          (!_connState.phpUp && prev.phpUp !== true && _connState.phpUp === true)) {
        // Backend came back — refresh stale caches
        try { window.dispatchEvent(new CustomEvent('erp:connectivity-restored', {
          detail: { gasUp: _connState.gasUp, phpUp: _connState.phpUp }
        })); } catch(_) {}
        // Flush offline mutations
        flushMutationQueue();
        processDLQMutations();
        // Warm critical caches
        if (isPageVisible()) {
          setTimeout(function() {
            ERP_DATA.warm([
              { action: 'getcompetitions' },
              { action: 'getpubliccompetitions' },
              { action: 'getforms' }
            ]);
          }, 1000);
        }
      }

      // Degraded mode: all PHP backends failed → notify
      if (_connState.phpUp === false && prev.phpUp !== false && isPageVisible()) {
        try {
          window.dispatchEvent(new CustomEvent('erp:php-down', {
            detail: { timestamp: Date.now() }
          }));
        } catch(_) {}
      }
    }

    // Listen for router connectivity events
    if (typeof window !== 'undefined') {
      window.addEventListener('erp:connectivity-change', function(ev) {
        if (ev && ev.detail) _updateConnState(ev.detail);
      });

      // Listen for PHP-all-failed events from dualFetch
      window.addEventListener('erp:php-all-failed', function(ev) {
        var detail = ev && ev.detail;
        if (!detail) return;
        _connState.phpUp = false;
        _connState.lastChange = Date.now();
      });
    }

    // Expose connectivity state
    ERP_DATA.getConnectivity = function() {
      return Object.assign({}, _connState);
    };

    ERP_DATA.isDegraded = function() {
      return _connState.degraded;
    };
  })();

})(window);
