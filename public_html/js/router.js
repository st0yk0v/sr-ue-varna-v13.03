/* ═══════════════════════════════════════════════════════════════════════════
 *  js/router.js — GAS Router (v12.20.0-modern)
 *
 *  Modern connectivity monitoring with sliding-window health scoring,
 *  integration with weighted PHP pool, and smart degradation modes.
 *
 *  Features:
 *    • Sliding-window health (last N probes, weighted by recency)
 *    • Auto-degradation when GAS unreachable but PHP available
 *    • Connectivity status events for UI badge/indicator
 *    • Online/offline detection via navigator.onLine + periodic probe
 *    • GAS pre-warm on recovery (background ping before full re-enable)
 *
 *  ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  // ═══ HEALTH STATE ══════════════════════════════════════════════
  var HEALTH_WINDOW = 5;          // keep last N probe results
  var _gasHistory = [];           // [{ ok:bool, ts:number, latency:number }]
  var _phpHistory = [];
  var _state = {
    gasReachable: null,           // null=unknown, true/false
    phpReachable: null,
    lastGasCheck: 0,
    lastPhpCheck: 0,
    gasCheckInterval: 600000,     // 600s (10 min) between GAS probes — GAS is backup only
    phpCheckInterval: 120000,     // 120s between PHP probes
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    degradedMode: false,
    gasLatency: 0,
    phpLatency: 0
  };

  // ═══ SLIDING-WINDOW HEALTH SCORE ══════════════════════════════
  function _pushHistory(arr, ok, latency) {
    arr.push({ ok: ok, ts: Date.now(), latency: latency || 0 });
    if (arr.length > HEALTH_WINDOW) arr.shift();
  }

  function _healthScore(history) {
    if (!history.length) return 0;
    var score = 0, total = 0;
    for (var i = 0; i < history.length; i++) {
      var weight = (i + 1) / history.length; // newer = higher weight
      score += (history[i].ok ? 1 : 0) * weight;
      total += weight;
    }
    return total > 0 ? score / total : 0;
  }

  function _avgLatency(history) {
    if (!history.length) return 0;
    var sum = 0, count = 0;
    for (var i = 0; i < history.length; i++) {
      if (history[i].latency > 0) { sum += history[i].latency; count++; }
    }
    return count > 0 ? Math.round(sum / count) : 0;
  }

  // ═══ GAS URL RESOLUTION ════════════════════════════════════════
  function getGASURL() {
    if (window.__ERP_GAS_URL && /^https?:\/\//.test(window.__ERP_GAS_URL)) {
      return window.__ERP_GAS_URL;
    }
    var cfg = window.ERP_CONFIG || {};
    return (cfg.GAS_URL || cfg._GAS_URL_RAW || '');
  }

  function getPhpPool() {
    // v12.27.1-404fix: Filter out relative URLs
    if (window._PHP_API_POOL && window._PHP_API_POOL.length) {
      var filtered = window._PHP_API_POOL.filter(function(u){ return u && typeof u === 'string' && u.indexOf('http') === 0; });
      if (filtered.length) return filtered;
    }
    if (window._PHP_API_URL && /^https?:\/\//.test(window._PHP_API_URL)) return [window._PHP_API_URL];
    return [];
  }

  // ═══ HEALTH PROBES ═════════════════════════════════════════════
  var _probePending = { gas: false, php: false };

  function probeGAS(force) {
    var url = getGASURL();
    if (!url) return Promise.resolve(false);
    if (!force && _probePending.gas) return Promise.resolve(_state.gasReachable);
    if (!force && (Date.now() - _state.lastGasCheck) < _state.gasCheckInterval) {
      return Promise.resolve(_state.gasReachable);
    }
    _probePending.gas = true;
    _state.lastGasCheck = Date.now();
    var start = Date.now();
    return new Promise(function(resolve) {
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
          body: JSON.stringify({ action: 'ping' }),
          signal: AbortSignal.timeout(15000)  // 15s — GAS cold starts can take 10s+
        }).then(function(r) {
          var lat = Date.now() - start;
          _pushHistory(_gasHistory, r.ok, lat);
          _updateGASState(_healthScore(_gasHistory) >= 0.4);  // lower threshold — tolerate occasional timeout
          _probePending.gas = false;
          resolve(_state.gasReachable);
        }).catch(function() {
          _pushHistory(_gasHistory, false, 0);
          _updateGASState(_healthScore(_gasHistory) >= 0.4);  // lower threshold
          _probePending.gas = false;
          resolve(false);
        });
      } catch(_) {
        _pushHistory(_gasHistory, false, 0);
        _updateGASState(false);
        _probePending.gas = false;
        resolve(false);
      }
    });
  }

  function probePHP(force) {
    var pool = getPhpPool();
    if (!pool.length) return Promise.resolve(false);
    if (!force && _probePending.php) return Promise.resolve(_state.phpReachable);
    if (!force && (Date.now() - _state.lastPhpCheck) < _state.phpCheckInterval) {
      return Promise.resolve(_state.phpReachable);
    }
    _probePending.php = true;
    _state.lastPhpCheck = Date.now();
    var start = Date.now();
    // Probe first 2 pool URLs
    var urls = pool.slice(0, 2);
    return Promise.any(urls.map(function(url) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ping' }),
        signal: AbortSignal.timeout(4000)
      }).then(function(r) {
        return r.ok;
      });
    })).then(function() {
      var lat = Date.now() - start;
      _pushHistory(_phpHistory, true, lat);
      _updatePHPState(true);
      _probePending.php = false;
      return true;
    }).catch(function() {
      _pushHistory(_phpHistory, false, 0);
      _updatePHPState(_healthScore(_phpHistory) >= 0.5);
      _probePending.php = false;
      return _state.phpReachable;
    });
  }

  function _updateGASState(reachable) {
    var prev = _state.gasReachable;
    _state.gasReachable = reachable;
    _state.gasLatency = _avgLatency(_gasHistory);
    _state.degradedMode = !reachable && _state.phpReachable === true;
    if (prev !== reachable) _emitChange();

    // Update data-layer's gas health (integration)
    if (typeof window.__ERP_MARK_GAS === 'function') {
      reachable ? window.__ERP_MARK_GAS('up') : window.__ERP_MARK_GAS('down');
    }
  }

  function _updatePHPState(reachable) {
    var prev = _state.phpReachable;
    _state.phpReachable = reachable;
    _state.phpLatency = _avgLatency(_phpHistory);
    _state.degradedMode = !_state.gasReachable && reachable === true;
    if (prev !== reachable) _emitChange();
  }

  // ═══ CONNECTIVITY EVENTS ══════════════════════════════════════
  var _lastEmitted = '';
  function _emitChange() {
    var sig = (_state.gasReachable?'G':'g') + (_state.phpReachable?'P':'p') + (_state.isOnline?'O':'o');
    if (sig === _lastEmitted) return;
    _lastEmitted = sig;
    try {
      window.dispatchEvent(new CustomEvent('erp:connectivity-change', {
        detail: {
          gasReachable: _state.gasReachable,
          phpReachable: _state.phpReachable,
          degradedMode: _state.degradedMode,
          isOnline: _state.isOnline,
          gasLatency: _state.gasLatency,
          phpLatency: _state.phpLatency,
          gasScore: Math.round(_healthScore(_gasHistory) * 100),
          phpScore: Math.round(_healthScore(_phpHistory) * 100)
        }
      }));
    } catch(_) {}
  }

  // ═══ ONLINE/OFFLINE ════════════════════════════════════════════
  if (typeof window !== 'undefined') {
    window.addEventListener('online', function() {
      _state.isOnline = true;
      _emitChange();
      // Re-probe on reconnect
      setTimeout(function() { probePHP(true); probeGAS(true); }, 1000);
    });
    window.addEventListener('offline', function() {
      _state.isOnline = false;
      _emitChange();
    });
  }

  // ═══ PUBLIC API ════════════════════════════════════════════════
  window.__ERP_ROUTER = {
    mode: 'direct',
    getURL: getGASURL,
    getState: function() { return Object.assign({}, _state); },
    probeGAS: probeGAS,
    probePHP: probePHP,
    probeAll: function() { return Promise.all([probeGAS(true), probePHP(true)]); },
    getGasScore: function() { return Math.round(_healthScore(_gasHistory) * 100); },
    getPhpScore: function() { return Math.round(_healthScore(_phpHistory) * 100); },
    isDegraded: function() { return _state.degradedMode; },
    getGasLatency: function() { return _state.gasLatency; },
    getPhpLatency: function() { return _state.phpLatency; }
  };

  // ═══ INITIAL PROBE (deferred) ══════════════════════════════════
  setTimeout(function() {
    if (_state.isOnline) {
      probePHP(true).then(function() { if (_state.phpReachable) return probeGAS(true); });
    }
  }, 3000);

})();
