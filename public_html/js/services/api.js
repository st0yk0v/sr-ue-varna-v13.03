/* ═══════════════════════════════════════════════════════════════════════════
 *  js/services/api.js — Unified API Client (v12.27.0)
 *
 *  Единен http клиент за комуникация с PHP backend.
 *  Осигурява:
 *    • Unified fetch с timeout, retry, circuit breaker
 *    • Dual-fetch (PHP първи, GAS като fallback)
 *    • Request дедупликация (еднаквите паралелни заявки се сливат)
 *    • Batch API поддръжка
 *    • DataVersion следене
 *
 *  ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  // ── Конфигурация ──────────────────────────────────────────────
  var API_TIMEOUT = 8000;       // 8s default
  var API_RETRIES = 2;          // max retries
  // ── Task 17: client-side sliding-window rate limiter ──
  // Mirrors a backend 60 req/min cap so a runaway UI (rapid retries, polling
  // loops, double-clicks) cannot flood the gateway. Short-circuits BEFORE the
  // network call with a synthetic 429 + a Bulgarian toast, matching how a real
  // backend 429 would be surfaced. Window resets on a rolling 60s basis.
  var RL_WINDOW_MS = 60 * 1000;
  var RL_MAX = 60;             // requests per window
  var _rlTimestamps = [];
  function _rateLimited() {
    var now = Date.now();
    // drop timestamps older than the window
    while (_rlTimestamps.length && now - _rlTimestamps[0] > RL_WINDOW_MS) _rlTimestamps.shift();
    if (_rlTimestamps.length >= RL_MAX) {
      var oldest = _rlTimestamps[0];
      var waitSec = Math.max(1, Math.ceil((oldest + RL_WINDOW_MS - now) / 1000));
      return waitSec;
    }
    _rlTimestamps.push(now);
    return 0;
  }
  function _surfaceRateLimit(waitSec) {
    try {
      var msg = 'Твърде много заявки. Моля, изчакайте ' + waitSec + ' сек.';
      if (typeof window !== 'undefined' && typeof window.toast === 'function') {
        window.toast(msg, 'warning', 4000);
      } else if (typeof toast === 'function') {
        toast(msg, 'warning', 4000);
      }
    } catch (_) {}
  }
  // v12.32.4-laravel: Accept relative /api URLs for Laravel backend
  // Falls back to production URL only when no URL is configured at all.
  var API_BASE = (window._PHP_API_URL && (window._PHP_API_URL.indexOf('/') === 0 || /^https?:\/\//.test(window._PHP_API_URL)))
    ? window._PHP_API_URL
    : 'https://sr-ue-varna.com/database/api.php';
  
  // In-flight request dedup
  var _inflight = new Map();
  
  // Data version tracking
  var _lastDataVersion = 0;
  var _dataVersionCallbacks = [];

  // ── Action routing: legacy GAS actions → SQL actions (v8 docSQL) ──
  // These mappings are checked BEFORE the API call. If a mapped SQL
  // action succeeds, the result is returned immediately. If it fails,
  // it falls through to the original action (GAS fallback).
  var _SQL_ACTION_ROUTES = {
    // Document operations
    // NOTE: 'copyDocument' intentionally NOT routed through SQL — it requires
    // actual Drive file copy via GAS (sqlcopyapplicationdocuments only copies
    // between form attached_docs arrays, losing the docId).
    'attachdocumenttoform':  { sql: 'sqlattachdocument',           timeout: 3000 },
    'detachdocumentfromform':{ sql: 'sqldetachdocument',           timeout: 3000 },
    'getformdocuments':      { sql: 'sqlgetapplicationdocuments',  timeout: 3000 },
    'listdocuments':         { sql: 'sqlgetapplicationdocuments',  timeout: 3000 },
    // My Documents operations — route through PHP/SQL, fall back to GAS
    'copyDocForUser':        { sql: 'copydocforuser',              timeout: 8000 },
    'listMyDocuments':       { sql: 'listmydocuments',             timeout: 8000 },
    'deleteMyDocument':      { sql: 'deletemydocument',            timeout: 5000 },
    // Proposal wizard reads
    'getproposaldocuments':  { sql: 'sqlgetproposaldocuments',     timeout: 3000 },
    'getdocumentpreview':    { sql: 'sqlgetdocumentpreview',       timeout: 3000 },
    'getbudgetrules':        { sql: 'sqlgetbudgetrules',           timeout: 3000 },
    // v10: Submit application via SQL with full validation pipeline
    'submitForm':            { sql: 'sqlsubmitapplication',        timeout: 8000 },
    // v11: Remaining high-value operations
    'bulkUpdateApplicationStatus': { sql: 'sqlbulkupdateapplicationstatus', timeout: 10000 },
    'addSanction':               { sql: 'sqladdsanction',              timeout: 8000 },
    'transitionProjectStatus':   { sql: 'sqltransitionprojectstatus',  timeout: 8000 },
    'signProjectContract':       { sql: 'sqlsignprojectcontract',      timeout: 8000 },
    'confirmLibrarySubmission':  { sql: 'sqlconfirmlibrarysubmission', timeout: 8000 },
    'getContractDeadlines':      { sql: 'sqlgetcontractdeadlines',     timeout: 8000 },
    'sendContractReminders':     { sql: 'sqlsendcontractreminders',    timeout: 10000 },
    // v12: Additional operations
    'updateDeliverable':         { sql: 'updatedeliverable',            timeout: 8000 },
    'editDeliverable':           { sql: 'updatedeliverable',            timeout: 8000 },
    'replaceReviewer':           { sql: 'replacereviewer',              timeout: 8000 },
  };

  /**
   * Основна API заявка — unified fetch с timeout и retry
   * @param {string} action - Име на action
   * @param {Object} params - Параметри
   * @param {Object} opts - Опции { timeout, retries, skipCache, source }
   * @returns {Promise<Object>}
   */
  function api(action, params, opts) {
    opts = opts || {};
    // ── Task 17: client-side rate-limit guard (short-circuit before network) ──
    // Skip the guard for local/non-network actions and for idempotent reads that
    // are part of the dedup path. Always guard network mutations + normal calls.
    if (!opts.skipRateLimit) {
      var _wait = _rateLimited();
      if (_wait > 0) {
        _surfaceRateLimit(_wait);
        return Promise.resolve({ success: false, error: 'rate_limited', retryAfter: _wait,
          _rateLimited: true });
      }
    }
    var timeout = opts.timeout || API_TIMEOUT;
    var retries = opts.retries !== undefined ? opts.retries : API_RETRIES;
    var source = opts.source || 'auto'; // 'php', 'gas', 'auto'

    // v15.0.0-perf: If action is 'getmyforms' and source is 'gas', remap to 'getforms'
    // because GAS doesn't have the dedicated getmyforms action.
    if (action === 'getmyforms' && source === 'gas') {
      action = 'getforms';
    }
    // ── v8 docSQL: Try SQL route first for mapped actions ──
    var route = _SQL_ACTION_ROUTES[action];
    if (route && source !== 'gas') {
      var sqlAction = route.sql;
      var sqlTimeout = opts.timeout || route.timeout || 3000;
      // Execute the SQL action with caller's params (rename keys if needed)
      var sqlParams = _mapParamsForSql(action, params);
      return _execute(sqlAction, sqlParams, sqlTimeout, 1, 'php')
        .then(function(res) {
          if (res && res.success) {
            // Normalize response to match what the caller expects
            return _normalizeSqlResponse(action, res);
          }
          // SQL failed → fall through to original action
          return _executeFallback(action, params, timeout, retries, source);
        })
        .catch(function() {
          // Network error → fall through to original action
          return _executeFallback(action, params, timeout, retries, source);
        });
    }

    // Дедупликация: ако има in-flight заявка за същия action+params, избери нея
    var dedupKey = action + '|' + JSON.stringify(params || {});
    if (_inflight.has(dedupKey)) {
      return _inflight.get(dedupKey);
    }

    var promise = _execute(action, params, timeout, retries, source);
    _inflight.set(dedupKey, promise);

    // Почисти след завършване
    promise.then(function() {
      _inflight.delete(dedupKey);
    }, function() {
      _inflight.delete(dedupKey);
    });

    return promise;
  }

  /**
   * Map legacy action params to SQL action params.
   */
  function _mapParamsForSql(action, params) {
    params = params || {};
    switch (action) {
      case 'copyDocument':
        return { sourceFormId: params.formId, targetFormId: params.formId };
      case 'attachdocumenttoform':
      case 'detachdocumentfromform':
        return {
          documentId: params.documentId || params.docId || '',
          formId: params.formId || params.fId || '',
          userEmail: params.userEmail || ''
        };
      case 'getformdocuments':
      case 'listdocuments':
        return {
          formId: params.formId || params.fId || '',
          includeBlobs: false
        };
      default:
        return params;
    }
  }

  /**
   * Normalize SQL response to match what the original action's callers expect.
   */
  function _normalizeSqlResponse(originalAction, sqlRes) {
    switch (originalAction) {
      case 'attachdocumenttoform':
      case 'detachdocumentfromform':
        // Caller expects { success, attached_docs }
        return sqlRes;
      case 'copyDocument':
        // Caller expects { success, file: { id, name, ... } }
        if (sqlRes.attached_docs) {
          var docs = JSON.parse(sqlRes.attached_docs || '[]');
          var last = docs.length > 0 ? docs[docs.length - 1] : null;
          return { success: true, file: last };
        }
        return { success: true, file: null };
      case 'getformdocuments':
      case 'listdocuments':
        // Caller expects { success, documents: [] }
        return sqlRes;
      default:
        return sqlRes;
    }
  }

  /**
   * Fallback: execute the original (legacy) action.
   */
  function _executeFallback(action, params, timeout, retries, source) {
    var dedupKey = action + '|' + JSON.stringify(params || {});
    var promise = _execute(action, params, timeout, retries, source);
    _inflight.set(dedupKey, promise);
    promise.then(function() { _inflight.delete(dedupKey); }, function() { _inflight.delete(dedupKey); });
    return promise;
  }

  /**
   * Вътрешно изпълнение на заявката
   */
  function _execute(action, params, timeout, retries, source) {
    var url = _resolveUrl(source);
    var body = JSON.stringify(Object.assign({}, params, { action: action }));
    
    return _fetchWithTimeout(url, body, timeout, retries);
  }

  /**
   * Fetch с timeout и retry логика
   */
  function _fetchWithTimeout(url, body, timeout, retries) {
    var attempt = 0;

    // Task 20: best-effort metrics beacon — fire-and-forget, never blocks the
    // request and swallows ALL errors (observability must never break the app).
    var _metricBase = (function () {
      try {
        var b = API_BASE.indexOf('/database/api.php');
        return (b !== -1 ? API_BASE.slice(0, b) : 'https://sr-ue-varna.com') + '/database/metrics.php';
      } catch (_) { return 'https://sr-ue-varna.com/database/metrics.php'; }
    })();
    function _emitMetric(name, params) {
      try {
        var qs = 'record=' + encodeURIComponent(name);
        for (var k in (params || {})) { qs += '&' + k + '=' + encodeURIComponent(params[k]); }
        var img = new Image();
        img.src = _metricBase + '?' + qs + '&_=' + Date.now();
      } catch (_) {}
    }
    function _emitError() { try { _emitMetric('erp_api_errors_total', { delta: 1 }); } catch (_) {} }

    function _try() {
      attempt++;
      return new Promise(function(resolve, reject) {
        var controller = new AbortController();
        var timer = setTimeout(function() { controller.abort(); }, timeout);
        var _startedAt = Date.now();

        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
          body: body,
          signal: controller.signal
        }).then(function(response) {
          clearTimeout(timer);
          // ── Task 17: surface a backend 429 the same way as the client guard ──
          if (response.status === 429) {
            var waitHdr = response.headers && response.headers.get ? response.headers.get('Retry-After') : null;
            var waitSec = waitHdr ? parseInt(waitHdr, 10) : 0;
            if (!waitSec || isNaN(waitSec)) waitSec = 10;
            _surfaceRateLimit(waitSec);
            return response.json().catch(function() { return { success: false, error: 'rate_limited', retryAfter: waitSec }; });
          }
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        }).then(function(data) {
          // Track data version
          if (data && data._dataVersion) {
            _lastDataVersion = data._dataVersion;
            _notifyDataVersion(data._dataVersion);
          }
          // Task 20: record rolling API latency (best-effort beacon)
          try { _emitMetric('erp_api_latency_seconds', { latency: ((Date.now() - _startedAt) / 1000).toFixed(3) }); } catch (_) {}
          // v12.30.0-realtime: Dispatch data-changed event for successful writes
          if (data && data.success && !data._readOnly) {
            try {
              window.dispatchEvent(new CustomEvent('erp:data-synced', {
                detail: { action: action, timestamp: Date.now(), _dataVersion: data._dataVersion }
              }));
            } catch(_) {}
          }
          resolve(data);
        }).catch(function(err) {
          clearTimeout(timer);
          // v12.49.76-network: detect offline on fetch failure
          if (!navigator.onLine) _setOffline(true);
          // Task 20: record API error (best-effort beacon) on terminal failure
          try { _emitError(); } catch (_) {}
          if (attempt <= retries && _isRetryable(err)) {
            // Exponential backoff
            setTimeout(function() { _try().then(resolve, reject); }, Math.min(1000 * Math.pow(2, attempt), 8000));
          } else {
            // Ако PHP fail-не, опитай GAS като fallback
            if (url.indexOf('database/api.php') !== -1) {
              // v15.0.0-perf: Remap getmyforms → getforms for GAS (GAS has no getmyforms)
              var _gasBody = body.indexOf('"getmyforms"') >= 0
                ? body.replace('"getmyforms"', '"getforms"')
                : body;
              _tryGASFallback(_gasBody).then(resolve, reject);
            } else {
              reject(err);
            }
          }
        });
      });
    }
    
    return _try();
  }

  /**
   * GAS fallback — опитва GAS URL когато PHP е недостъпен
   */
  function _tryGASFallback(body) {
    var gasUrl = window.__ERP_getGASURL ? window.__ERP_getGASURL() : '';
    if (!gasUrl) return Promise.reject(new Error('GAS URL not available'));
    
    return fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: body,
      signal: AbortSignal.timeout(15000)
    }).then(function(r) { return r.json(); });
  }

  /**
   * Batch API — множество заявки в една HTTP заявка
   * @param {Array<{action: string, params: Object}>} requests
   * @returns {Promise<Object>}
   */
  function batchApi(requests) {
    return api('batchapi', { requests: requests }, { timeout: 15000 });
  }

  /**
   * Извличане на dataVersion
   */
  function getDataVersion(forceRefresh) {
    return api('getdataversion', { forceRefresh: !!forceRefresh }, { timeout: 4000 });
  }

  /**
   * Ping — health check
   */
  function ping() {
    return api('ping', {}, { timeout: 3000, retries: 0, skipCache: true });
  }

  /**
   * Слушател за промени в dataVersion
   */
  function onDataVersionChange(callback) {
    _dataVersionCallbacks.push(callback);
  }

  function _notifyDataVersion(version) {
    for (var i = 0; i < _dataVersionCallbacks.length; i++) {
      try { _dataVersionCallbacks[i](version); } catch (_) {}
    }
  }

  /**
   * Helper: resolve URL според source
   */
  function _resolveUrl(source) {
    if (source === 'gas') {
      return window.__ERP_getGASURL ? window.__ERP_getGASURL() : API_BASE;
    }
    return API_BASE;
  }

  /**
   * Helper: дали грешката е retryable
   */
  function _isRetryable(err) {
    if (!err) return false;
    var msg = String(err.message || err);
    if (msg.indexOf('abort') !== -1) return true;
    if (msg.indexOf('timeout') !== -1) return true;
    if (msg.indexOf('network') !== -1) return true;
    if (msg.indexOf('HTTP 5') !== -1) return true;
    if (msg.indexOf('HTTP 0') !== -1) return true;
    return false;
  }

  // v12.49.76-network: offline detection + retry queue
  var _offline = false;
  var _retryQueue = [];
  var _maxRetryQueue = 50;
  function _isOffline() { return _offline; }
  function _setOffline(v) {
    if (_offline === v) return;
    _offline = v;
    try {
      if (v) {
        if (typeof window !== 'undefined' && typeof window._showBanner === 'function') {
          window._showBanner('Няма интернет връзка. Промените ще бъдат запазени локално.', 'offline');
        }
      } else {
        if (typeof window !== 'undefined' && typeof window._hideBanner === 'function') {
          window._hideBanner();
        }
        // Process retry queue when back online
        _processRetryQueue();
      }
      window.dispatchEvent(new CustomEvent('erp:connectivity', { detail: { offline: v } }));
    } catch (_) {}
  }
  function _enqueueRetry(action, params, opts, resolve, reject) {
    if (_retryQueue.length >= _maxRetryQueue) _retryQueue.shift();
    _retryQueue.push({ action: action, params: params, opts: opts, resolve: resolve, reject: reject, ts: Date.now() });
  }
  function _processRetryQueue() {
    while (_retryQueue.length > 0 && !_offline) {
      var job = _retryQueue.shift();
      api(job.action, job.params, job.opts).then(job.resolve, job.reject);
    }
  }
  // Listen to browser online/offline events
  (function _initConnectivityListeners() {
    try {
      if (typeof window === 'undefined') return;
      window.addEventListener('offline', function() { _setOffline(true); });
      window.addEventListener('online', function() { _setOffline(false); });
    } catch (_) {}
  })();
  global.__uevApi = api;
  global.__uevBatchApi = batchApi;
  global.__uevPing = ping;
  global.__uevGetDataVersion = getDataVersion;
  global.__uevOnDataVersionChange = onDataVersionChange;
  global.__uevGetLastDataVersion = function() { return _lastDataVersion; };

})(window);
