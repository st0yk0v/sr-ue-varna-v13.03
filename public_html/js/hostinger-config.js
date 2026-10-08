/**
 * Hostinger PHP Backend Configuration — v12.20.0-modern
 *
 * Modern connection pooling with circuit-breaker, weighted health scoring,
 * lazy probing, and adaptive timeouts based on network quality.
 *
 * Architecture:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  WeightedPool: each backend URL has a health score       │
 *   │  CircuitBreaker: fail-fast after N failures, half-open   │
 *   │  LazyProbe: health checked on first use, then periodic   │
 *   │  Adaptive: timeouts scale with effectiveType (2G→4x)     │
 *   │  Events: connectivity-change dispatched on state change  │
 *   └──────────────────────────────────────────────────────────┘
 *
 * MUST be loaded FIRST (before config-secrets.js).
 */
(function(){
  'use strict';
  var origin = window.location.origin;
  var _isFileProtocol = (origin === 'null' || String(window.location.protocol) === 'file:');
  var now = Date.now;

  // ═══ WEIGHTED CONNECTION POOL ═══════════════════════════════════
  // When opened from file:// protocol, the origin is "null" and fetch
  // cannot make CORS requests. Skip the origin-based URL entirely and
  // let the app fall back to GAS directly (via core-bundle.js decode).
  var _pool = [
    { url: 'https://sr-ue-varna.com/database/api.php',   weight: 10, failures: 0, lastOk: 0, latency: 0 }
  ];
  if (!_isFileProtocol && origin && origin !== 'null') {
    _pool.push({ url: origin + '/database/api.php', weight: 8, failures: 0, lastOk: 0, latency: 0 });
  }
  _pool = _pool.filter(function(e, i, a) { return a.findIndex(function(x){return x.url===e.url}) === i; });

  // ═══ CIRCUIT BREAKER ═══════════════════════════════════════════
  var CB_THRESHOLD = 3;          // consecutive failures to open circuit
  var CB_HALF_OPEN_MS = 30000;   // 30s before half-open probe
  var CB_PROBE_TIMEOUT = 3000;   // 3s for half-open probe

  // ═══ HEALTH TRACKING ═══════════════════════════════════════════
  var HEALTH_TTL = 300000;       // 5min between health probes (reduced frequency)
  var _lastHealthProbe = 0;
  var _healthProbing = false;
  var _probeQueue = [];

  // ═══ CONNECTION QUALITY ════════════════════════════════════════
  var _connQuality = 1;
  try {
    var _conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (_conn) {
      var _ect = _conn.effectiveType;
      if (_ect === 'slow-2g' || _ect === '2g') _connQuality = 4;
      else if (_ect === '3g') _connQuality = 2;
      _conn.addEventListener('change', function() { _connQuality = _ect === 'slow-2g'||_ect==='2g' ? 4 : _ect==='3g' ? 2 : 1; });
    }
  } catch(_) {}

  // ═══ IFRAME DETECTION ══════════════════════════════════════════
  var _isIframe = (function(){ try{ return window !== window.top; }catch(_){ return true; } })();

  // ═══ EXPORTED API ══════════════════════════════════════════════
  // v12.27.1-404fix: Filter out any relative URLs (must start with http).
  // Prevents 'database/api.php' (relative) from being used when a script
  // fails to load or origin is unexpectedly empty.
  var _exportedUrls = _pool
    .map(function(e){ return e.url; })
    .filter(function(u){ return u && typeof u === 'string' && u.indexOf('http') === 0; });
  window._PHP_API_POOL = _exportedUrls.length ? _exportedUrls : ['https://sr-ue-varna.com/database/api.php'];
  window._PHP_API_URL  = _exportedUrls.length ? _exportedUrls[0] : 'https://sr-ue-varna.com/database/api.php';

  // ── Adaptive timeouts (scaled by connection quality) ──
  var _baseRead  = _isIframe ? 3000  : 6000;
  var _baseWrite = _isIframe ? 6000  : 12000;
  var _baseBatch = _isIframe ? 5000  : 10000;
  window.__ERP_PHP_TIMEOUT_READ    = Math.round(_baseRead  * _connQuality);
  window.__ERP_PHP_TIMEOUT_WRITE   = Math.round(_baseWrite * _connQuality);
  window.__ERP_PHP_TIMEOUT_BATCH   = Math.round(_baseBatch * _connQuality);
  window.__ERP_PHP_TIMEOUT_VERSION = Math.round(4000 * _connQuality);

  // ═══ POOL MANAGEMENT ═══════════════════════════════════════════

  /** Get the best healthy URL from the pool (weighted by health score). */
  function getBestUrl() {
    _maybeProbeHealth();
    var best = null, bestScore = -1;
    for (var i = 0; i < _pool.length; i++) {
      var p = _pool[i];
      var score = p.weight - (p.failures * 3);
      if (p.failures >= CB_THRESHOLD) {
        if (now() - p.lastOk > CB_HALF_OPEN_MS) {
          p.failures = CB_THRESHOLD - 1; // half-open
          score = 1;
        } else { continue; }
      }
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best || _pool[0];
  }

  /** Mark a URL as successful (reduce failure count, bump weight). */
  function markSuccess(url, latencyMs) {
    for (var i = 0; i < _pool.length; i++) {
      if (_pool[i].url === url) {
        _pool[i].failures = Math.max(0, _pool[i].failures - 1);
        _pool[i].lastOk = now();
        _pool[i].latency = latencyMs || 0;
        _pool[i].weight = Math.min(15, _pool[i].weight + 1);
        _syncPoolExport();
        return;
      }
    }
  }

  /** Mark a URL as failed (increment failure count, open circuit if threshold). */
  function markFailure(url) {
    for (var i = 0; i < _pool.length; i++) {
      if (_pool[i].url === url) {
        _pool[i].failures++;
        _pool[i].weight = Math.max(1, _pool[i].weight - 2);
        _syncPoolExport();
        _emitStateChange();
        return;
      }
    }
    // Unknown URL — add to pool with penalty
    if (url && /^https?:\/\//.test(url)) {
      _pool.push({ url: url, weight: 3, failures: CB_THRESHOLD, lastOk: 0, latency: 0 });
      _syncPoolExport();
    }
  }

  function _syncPoolExport() {
    var _exportedUrls = _pool
      .map(function(e){ return e.url; })
      .filter(function(u){ return u && typeof u === 'string' && u.indexOf('http') === 0; });
    window._PHP_API_POOL = _exportedUrls.length ? _exportedUrls : ['https://sr-ue-varna.com/database/api.php'];
    window._PHP_API_URL  = _exportedUrls.length ? _exportedUrls[0] : 'https://sr-ue-varna.com/database/api.php';
  }

  /** Reset all circuit breakers (called on explicit user action). */
  function resetAll() {
    for (var i = 0; i < _pool.length; i++) {
      _pool[i].failures = 0;
      _pool[i].weight = 10;
    }
    _syncPoolExport();
    _emitStateChange();
  }

  // ═══ LAZY HEALTH PROBING ═══════════════════════════════════════
  function _maybeProbeHealth() {
    if (_healthProbing) return;
    if (now() - _lastHealthProbe < HEALTH_TTL) return;
    _healthProbing = true;
    _lastHealthProbe = now();
    _probeAllAsync();
  }

  function _probeAllAsync() {
    var pending = _pool.length;
    function done() { if (--pending <= 0) { _healthProbing = false; _emitStateChange(); } }
    for (var i = 0; i < _pool.length; i++) {
      (function(p) {
        // Retry up to 2 times with 500ms delay — avoids false negatives
        // from transient network hiccups (DNS, TLS, routing).
        function doProbe(attempt) {
          _probeUrl(p.url).then(function(ok) {
            if (ok) {
              markSuccess(p.url, 0);
              done();
            } else if (attempt < 2) {
              // Transient failure — retry once after short delay
              setTimeout(function() { doProbe(attempt + 1); }, 500);
            } else {
              markFailure(p.url);
              done();
            }
          }).catch(function() {
            if (attempt < 2) {
              setTimeout(function() { doProbe(attempt + 1); }, 500);
            } else {
              markFailure(p.url);
              done();
            }
          });
        }
        doProbe(0);
      })(_pool[i]);
    }
  }

  function _probeUrl(url) {
    return new Promise(function(resolve) {
      var tid = setTimeout(function(){ resolve(false); }, CB_PROBE_TIMEOUT);
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ping' }),
          signal: AbortSignal.timeout(CB_PROBE_TIMEOUT)
        }).then(function(r) {
          clearTimeout(tid);
          resolve(r.ok);
        }).catch(function() {
          clearTimeout(tid);
          resolve(false);
        });
      } catch(_) { clearTimeout(tid); resolve(false); }
    });
  }

  // ═══ CONNECTIVITY EVENTS ══════════════════════════════════════
  var _lastEmittedState = '';
  function _emitStateChange() {
    var totalWeight = 0, openCircuits = 0;
    var primaryReachable = true;
    for (var i = 0; i < _pool.length; i++) {
      totalWeight += _pool[i].weight;
      if (_pool[i].failures >= CB_THRESHOLD) {
        openCircuits++;
        // Primary URL (weight=10, sr-ue-varna.com) determines overall reachability
        if (_pool[i].weight >= 10) {
          primaryReachable = false;
        }
      }
    }
    // If primary has never been probed (all latencies are 0), it might still be OK
    // Only mark as unreachable when the primary has actually accumulated failures
    if (primaryReachable && openCircuits > 0) {
      // Secondary URLs failed but primary is OK — just degraded
    }
    var state = totalWeight + '|' + openCircuits + '|' + (primaryReachable ? '1' : '0');
    if (state === _lastEmittedState) return;
    _lastEmittedState = state;
    try {
      window.dispatchEvent(new CustomEvent('erp:connectivity-change', {
        detail: {
          phpReachable: primaryReachable,
          degraded: openCircuits > 0 && primaryReachable,
          poolHealth: _pool.map(function(p){ return { url: p.url.replace(/\/database\/api\.php$/,''), weight: p.weight, open: p.failures >= CB_THRESHOLD, latency: p.latency }; })
        }
      }));
    } catch(_) {}
  }

  // ═══ PUBLIC API ════════════════════════════════════════════════
  window.__ERP_POOL = {
    getBestUrl: getBestUrl,
    markSuccess: markSuccess,
    markFailure: markFailure,
    resetAll: resetAll,
    probeNow: _probeAllAsync,
    getPool: function() { return _pool.slice(); },
    isDegraded: function() { return _pool.some(function(p){ return p.failures >= CB_THRESHOLD; }); }
  };

  // ═══ ERP_CONFIG ════════════════════════════════════════════════
  window.ERP_CONFIG = Object.assign(window.ERP_CONFIG || {}, {
    __ERP_BACKEND: 'php',
    __PHP_MODE: true,
    __PHP_API_POOL: window._PHP_API_POOL
  });

  // ── Initial lazy health probe after 2s (don't block first paint) ──
  setTimeout(function() { _maybeProbeHealth(); }, 2000);

  // ── Periodic health refresh every 5min ──
  setInterval(function() { _lastHealthProbe = 0; _maybeProbeHealth(); }, 300000);

})();