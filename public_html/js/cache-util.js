/* UEV-ERP — ERPCache: namespaced sessionStorage/localStorage wrapper
 * with timestamp-based TTL invalidation (default 30 min).
 * Task 4 / D5 (document caching audit support). Global: window.ERPCache.
 * Loaded via <script> before the bundle; plain UMD/IIFE, no ES imports. */
(function (global) {
  'use strict';

  var DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min

  // Registry of known ERP cache keys (audit surface — see ROADMAP D5).
  var KNOWN_KEYS = [
    'erp:assets:tab',
    'erp:applicant:statusFilter',
    'erp:applicant:counts',
    'erp:docs:cat',
    'erp:docs:view',
    'erp:newform:draft:',
    'erp:draft:',
    '_docCache_KEY'
  ];

  function _backend(kind) {
    try {
      return kind === 'local' ? global.localStorage : global.sessionStorage;
    } catch (e) {
      return null;
    }
  }

  function _now() { return Date.now(); }

  function _safeParse(raw) {
    if (raw === null || raw === undefined) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function _stamp(value) {
    return JSON.stringify({ __t: _now(), v: value });
  }

  function erpCacheGet(key, ttlMs) {
    ttlMs = ttlMs || DEFAULT_TTL_MS;
    var store = _backend('session') || _backend('local');
    if (!store) return null;
    var raw = store.getItem(key);
    if (raw === null) return null;
    var parsed = _safeParse(raw);
    if (!parsed || typeof parsed !== 'object' || !('__t' in parsed)) {
      // Legacy unstamped value — treat as fresh once, then re-stamp on next set.
      return parsed;
    }
    if (_now() - parsed.__t > ttlMs) {
      try { store.removeItem(key); } catch (e) {}
      return null;
    }
    return parsed.v;
  }

  function erpCacheSet(key, value, ttlMs) {
    ttlMs = ttlMs || DEFAULT_TTL_MS;
    var store = _backend('session') || _backend('local');
    if (!store) return false;
    try {
      store.setItem(key, _stamp(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function erpCacheRemove(key) {
    var store = _backend('session') || _backend('local');
    if (!store) return;
    try { store.removeItem(key); } catch (e) {}
  }

  // Drop any stamped key (known or matching a known prefix) that has expired.
  function erpCacheClearStale() {
    var store = _backend('session') || _backend('local');
    if (!store) return 0;
    var dropped = 0;
    var i, k, parsed;
    for (i = store.length - 1; i >= 0; i--) {
      k = store.key(i);
      if (!k) continue;
      var isKnown = KNOWN_KEYS.indexOf(k) !== -1 ||
        KNOWN_KEYS.some(function (p) { return p.charAt(p.length - 1) === ':' && k.indexOf(p) === 0; });
      if (!isKnown) continue;
      parsed = _safeParse(store.getItem(k));
      if (parsed && typeof parsed === 'object' && '__t' in parsed) {
        if (_now() - parsed.__t > DEFAULT_TTL_MS) {
          try { store.removeItem(k); dropped++; } catch (e) {}
        }
      }
    }
    return dropped;
  }

  // Best-effort clear of all known ERP keys (used on forced logout / re-auth).
  function erpCacheClearAll() {
    var store = _backend('session') || _backend('local');
    if (!store) return 0;
    var removed = 0;
    var i, k;
    for (i = store.length - 1; i >= 0; i--) {
      k = store.key(i);
      if (!k) continue;
      var isKnown = KNOWN_KEYS.indexOf(k) !== -1 ||
        KNOWN_KEYS.some(function (p) { return p.charAt(p.length - 1) === ':' && k.indexOf(p) === 0; });
      if (isKnown) {
        try { store.removeItem(k); removed++; } catch (e) {}
      }
    }
    return removed;
  }

  global.ERPCache = {
    DEFAULT_TTL_MS: DEFAULT_TTL_MS,
    knownKeys: KNOWN_KEYS,
    get: erpCacheGet,
    set: erpCacheSet,
    remove: erpCacheRemove,
    clearStale: erpCacheClearStale,
    clearAll: erpCacheClearAll
  };

  // Auto-sweep stale entries on load (cheap, runs once per page session).
  try { global.ERPCache.clearStale(); } catch (e) {}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
