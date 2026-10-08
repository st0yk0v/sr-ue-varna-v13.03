/* ═══════════════════════════════════════════════════════════════════════════
 *  js/services/cache.js — Multi-Tier Cache Service (v12.27.0)
 *
 *  Многослоен кеш за "незабавно четене":
 *    L1: In-memory (MAP) — мигновен достъп, per-page
 *    L2: localStorage — между page loads
 *    L3: SessionStorage — за времето на tab/session
 *
 *  SWR (Stale-While-Revalidate): връща кеширана стойност веднага,
 *  после обновява на заден план.
 *
 *  ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PREFIX = 'uev:cache:v2:';
  var DEFAULT_TTL = 5 * 60 * 1000; // 5 min
  
  // ── L1: In-memory cache ──
  var _memCache = new Map();
  var _memStats = { hits: 0, misses: 0, sets: 0 };

  // ── L2: localStorage ──
  var _lsAvailable = _checkStorage('localStorage');
  // ── L3: sessionStorage ──
  var _ssAvailable = _checkStorage('sessionStorage');

  /**
   * Вземане от кеш (L1 → L2 → L3)
   * @param {string} key
   * @returns {*|null}
   */
  function cacheGet(key) {
    // L1
    if (_memCache.has(key)) {
      var entry = _memCache.get(key);
      if (entry.expires === 0 || entry.expires > Date.now()) {
        _memStats.hits++;
        return entry.value;
      }
      _memCache.delete(key);
    }
    _memStats.misses++;
    
    // L2
    var val = _lsGet(key);
    if (val !== null) {
      _memCache.set(key, { value: val, expires: Date.now() + 60000 });
      return val;
    }
    
    // L3
    val = _ssGet(key);
    if (val !== null) {
      _memCache.set(key, { value: val, expires: Date.now() + 60000 });
      return val;
    }
    
    return null;
  }

  /**
   * Записване в кеш (L1 + L2)
   * @param {string} key
   * @param {*} value
   * @param {number} ttlMs - TTL в милисекунди
   */
  function cacheSet(key, value, ttlMs) {
    ttlMs = ttlMs || DEFAULT_TTL;
    
    // L1
    _memCache.set(key, {
      value: value,
      expires: ttlMs > 0 ? Date.now() + ttlMs : 0
    });
    _memStats.sets++;
    
    // L2 (localStorage — само за по-големи TTL)
    if (ttlMs >= 30000) {
      _lsSet(key, value, ttlMs);
    }
  }

  /**
   * Изтриване от кеш
   */
  function cacheDelete(key) {
    _memCache.delete(key);
    _lsDelete(key);
    _ssDelete(key);
  }

  /**
   * Изчистване на целия кеш
   */
  function cacheFlush() {
    _memCache.clear();
    if (_lsAvailable) {
      var keys = Object.keys(localStorage);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf(PREFIX) === 0) {
          localStorage.removeItem(keys[i]);
        }
      }
    }
    if (_ssAvailable) {
      var skeys = Object.keys(sessionStorage);
      for (var j = 0; j < skeys.length; j++) {
        if (skeys[j].indexOf(PREFIX) === 0) {
          sessionStorage.removeItem(skeys[j]);
        }
      }
    }
  }

  /**
   * SWR: връща кеширана стойност + фонова refresh
   * @param {string} key
   * @param {Function} fetcher - async функция за fresh data
   * @param {number} ttlMs
   * @returns {Promise<*>} - веднага връща кеша (ако има), после обновява
   */
  function cacheSwr(key, fetcher, ttlMs) {
    ttlMs = ttlMs || DEFAULT_TTL;
    var cached = cacheGet(key);
    
    // Background refresh promise
    var refreshPromise = fetcher().then(function(fresh) {
      if (fresh !== undefined && fresh !== null) {
        cacheSet(key, fresh, ttlMs);
      }
      return fresh;
    }).catch(function(err) {
      // Ако refresh fail-не, върни кеша (stale data)
      return cached;
    });
    
    // Ако има кеш, върни го веднага, refresh-а продължава на заден план
    if (cached !== null) {
      // Не block-вай — стартирай refresh async
      setTimeout(function() { fetcher().then(function(fresh) {
        if (fresh !== null) cacheSet(key, fresh, ttlMs);
      }).catch(function() {}); }, 0);
      return Promise.resolve(cached);
    }
    
    // Няма кеш — чакай refresh-а
    return refreshPromise;
  }

  /**
   * Вземане на кеш статистики
   */
  function cacheStats() {
    return Object.assign({}, _memStats, {
      memSize: _memCache.size,
      hitRate: (_memStats.hits + _memStats.misses) > 0
        ? Math.round((_memStats.hits / (_memStats.hits + _memStats.misses)) * 100) + '%'
        : '0%'
    });
  }

  // ── localStorage helpers ──

  function _lsGet(key) {
    if (!_lsAvailable) return null;
    try {
      var raw = localStorage.getItem(PREFIX + key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (entry.e && entry.e > 0 && entry.e < Date.now()) {
        localStorage.removeItem(PREFIX + key);
        return null;
      }
      return entry.v;
    } catch (_) { return null; }
  }

  function _lsSet(key, value, ttlMs) {
    if (!_lsAvailable) return;
    try {
      var entry = JSON.stringify({
        v: value,
        e: ttlMs > 0 ? Date.now() + ttlMs : 0,
        t: Date.now()
      });
      localStorage.setItem(PREFIX + key, entry);
    } catch (_) {}
  }

  function _lsDelete(key) {
    if (!_lsAvailable) return;
    try { localStorage.removeItem(PREFIX + key); } catch (_) {}
  }

  // ── sessionStorage helpers ──

  function _ssGet(key) {
    if (!_ssAvailable) return null;
    try {
      var raw = sessionStorage.getItem(PREFIX + 'ss:' + key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (entry.e && entry.e > 0 && entry.e < Date.now()) {
        sessionStorage.removeItem(PREFIX + 'ss:' + key);
        return null;
      }
      return entry.v;
    } catch (_) { return null; }
  }

  function _ssSet(key, value, ttlMs) {
    if (!_ssAvailable) return;
    try {
      sessionStorage.setItem(PREFIX + 'ss:' + key, JSON.stringify({
        v: value,
        e: ttlMs > 0 ? Date.now() + ttlMs : 0,
        t: Date.now()
      }));
    } catch (_) {}
  }

  function _ssDelete(key) {
    if (!_ssAvailable) return;
    try { sessionStorage.removeItem(PREFIX + 'ss:' + key); } catch (_) {}
  }

  // ── Storage availability check ──

  function _checkStorage(type) {
    try {
      var storage = global[type];
      if (!storage) return false;
      var testKey = '__uev_test__';
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      return true;
    } catch (_) { return false; }
  }

  // ── Export ──
  global.__uevCache = {
    get: cacheGet,
    set: cacheSet,
    del: cacheDelete,
    flush: cacheFlush,
    swr: cacheSwr,
    stats: cacheStats,
    PREFIX: PREFIX
  };

})(window);
