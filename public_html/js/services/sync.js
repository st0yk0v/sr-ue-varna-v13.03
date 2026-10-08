/* ═══════════════════════════════════════════════════════════════════════════
 *  js/services/sync.js — Data Synchronization Service (v12.27.0)
 *
 *  Синхронизация между UI и базата данни:
 *    • Data version polling (автоматично опресняване)
 *    • Cache invalidation при промяна на версията
 *    • Dual-write: PHP first, GAS fire-and-forget
 *    • Background refresh queue
 *    • Connection health monitoring
 *
 *  ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var POLL_INTERVAL = 45000;       // 45s между проверки
  var _pollTimer = null;
  var _lastVersion = 0;
  var _polling = false;
  var _listeners = [];

  /**
   * Стартиране на polling за dataVersion
   */
  function startPolling() {
    if (_polling) return;
    _polling = true;
    
    _checkVersion();
    _pollTimer = setInterval(_checkVersion, POLL_INTERVAL);
  }

  /**
   * Спиране на polling
   */
  function stopPolling() {
    _polling = false;
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  /**
   * Проверка на версията
   */
  function _checkVersion() {
    if (typeof __uevApi !== 'function') return;
    
    __uevApi('getdataversion', { forceRefresh: false }, { timeout: 4000 }).then(function(res) {
      if (res && res.success && res.dataVersion) {
        var newVersion = res.dataVersion;
        if (_lastVersion > 0 && newVersion !== _lastVersion) {
          // Версията се е променила — инвалидирай кеша
          _onVersionChange(_lastVersion, newVersion);
        }
        _lastVersion = newVersion;
      }
    }).catch(function() {
      // Silent fail — ще опита отново след interval
    });
  }

  /**
   * Обработка при промяна на версия
   */
  function _onVersionChange(oldVer, newVer) {
    // Инвалидирай кеша
    if (typeof __uevCache !== 'undefined') {
      __uevCache.flush();
    }
    
    // Уведоми listener-ите
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](newVer, oldVer); } catch (_) {}
    }
  }

  /**
   * Добавяне на listener за промяна
   */
  function onChange(callback) {
    _listeners.push(callback);
  }

  /**
   * Премахване на listener
   */
  function offChange(callback) {
    var idx = _listeners.indexOf(callback);
    if (idx !== -1) _listeners.splice(idx, 1);
  }

  /**
   * Ръчно форсиране на refresh
   */
  function forceRefresh() {
    _lastVersion = 0;
    _checkVersion();
  }

  /**
   * Sync: изпращане на мутация към PHP + GAS (dual-write)
   * @param {string} action
   * @param {Object} params
   * @returns {Promise<Object>}
   */
  function syncWrite(action, params) {
    // Write to PHP first
    return __uevApi(action, params, { timeout: 12000 }).then(function(result) {
      // Fire-and-forget to GAS
      var gasUrl = typeof __uevGetGASURL === 'function' ? __uevGetGASURL() : '';
      if (gasUrl && result && result.success) {
        setTimeout(function() {
          try {
            fetch(gasUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
              body: JSON.stringify(Object.assign({}, params, { action: action, _source: 'php' })),
              signal: AbortSignal.timeout(5000)
            }).catch(function() {});
          } catch (_) {}
        }, 100);
      }
      return result;
    });
  }

  /**
   * Sync: четене през cache-first стратегия
   * @param {string} action
   * @param {Object} params
   * @param {Object} opts
   * @returns {Promise<Object>}
   */
  function syncRead(action, params, opts) {
    opts = opts || {};
    var cacheKey = action + ':' + JSON.stringify(params || {});
    var ttl = opts.ttl || 300000; // 5 min default
    
    // SWR: cache-first
    if (typeof __uevCache !== 'undefined') {
      return __uevCache.swr(cacheKey, function() {
        return __uevApi(action, params, opts);
      }, ttl);
    }
    
    // Direct if no cache
    return __uevApi(action, params, opts);
  }

  // ── Background refresh queue ──
  var _bgQueue = [];
  var _bgRunning = false;

  function _processBgQueue() {
    if (_bgRunning || _bgQueue.length === 0) return;
    _bgRunning = true;
    
    var item = _bgQueue.shift();
    __uevApi(item.action, item.params, { timeout: 10000 }).then(function() {
      _bgRunning = false;
      _processBgQueue();
    }, function() {
      _bgRunning = false;
      _processBgQueue();
    });
  }

  function enqueueBgRefresh(action, params) {
    _bgQueue.push({ action: action, params: params });
    if (!_bgRunning) _processBgQueue();
  }

  // ── Auto-start polling ──
  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete') {
      startPolling();
    } else {
      document.addEventListener('DOMContentLoaded', startPolling);
    }
  }

  // ── Export ──
  global.__uevSync = {
    startPolling: startPolling,
    stopPolling: stopPolling,
    forceRefresh: forceRefresh,
    onChange: onChange,
    offChange: offChange,
    write: syncWrite,
    read: syncRead,
    enqueueBgRefresh: enqueueBgRefresh,
    getLastVersion: function() { return _lastVersion; }
  };

})(window);
