/* ═══════════════════════════════════════════════════════════════════════════
 *  js/services/storage.js — Unified Storage Service (v12.27.0)
 *
 *  Абстракция над localStorage/sessionStorage, която осигурява:
 *    • CRUD за structured data
 *    • TTL и автоматично clean-up
 *    • JSON encoding/decoding
 *    • Фолбек между storage типове
 *    • Session restore (активност, login session)
 *
 *  ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PREFIX = 'uev:store:';
  var SESSION_TTL = 24 * 60 * 60 * 1000; // 24h

  /**
   * Запис на стойност
   */
  function setItem(key, value, ttlMs, storageType) {
    var storage = _getStorage(storageType || 'local');
    if (!storage) return false;
    
    try {
      storage.setItem(PREFIX + key, JSON.stringify({
        v: value,
        e: ttlMs > 0 ? Date.now() + ttlMs : 0,
        t: Date.now()
      }));
      return true;
    } catch (_) { return false; }
  }

  /**
   * Четене на стойност
   */
  function getItem(key, storageType) {
    var storage = _getStorage(storageType || 'local');
    if (!storage) return null;
    
    try {
      var raw = storage.getItem(PREFIX + key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (entry.e && entry.e > 0 && entry.e < Date.now()) {
        storage.removeItem(PREFIX + key);
        return null;
      }
      return entry.v;
    } catch (_) { return null; }
  }

  /**
   * Изтриване
   */
  function removeItem(key, storageType) {
    var storage = _getStorage(storageType || 'local');
    if (!storage) return;
    try { storage.removeItem(PREFIX + key); } catch (_) {}
  }

  /**
   * Изчистване на всички UEV ключове
   */
  function clear() {
    ['localStorage', 'sessionStorage'].forEach(function(type) {
      try {
        var storage = global[type];
        if (!storage) return;
        var keys = Object.keys(storage);
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].indexOf(PREFIX) === 0) {
            storage.removeItem(keys[i]);
          }
        }
      } catch (_) {}
    });
  }

  /**
   * Запис на сесия
   */
  function saveSession(sessionData) {
    return setItem('session', sessionData, SESSION_TTL, 'local');
  }

  /**
   * Четене на сесия
   */
  function loadSession() {
    return getItem('session', 'local');
  }

  /**
   * Изтриване на сесия (logout)
   */
  function clearSession() {
    removeItem('session', 'local');
    removeItem('session', 'session');
  }

  /**
   * Запис на активност (touch)
   */
  function touchActivity() {
    setItem('activity', Date.now(), SESSION_TTL, 'local');
  }

  /**
   * Четене на последна активност
   */
  function getLastActivity() {
    return getItem('activity', 'local');
  }

  /**
   * Запис на draft (autosave)
   */
  function saveDraft(formId, data) {
    return setItem('draft:' + formId, data, 7 * 24 * 60 * 60 * 1000, 'local');
  }

  /**
   * Четене на draft
   */
  function loadDraft(formId) {
    return getItem('draft:' + formId, 'local');
  }

  /**
   * Изтриване на draft
   */
  function deleteDraft(formId) {
    removeItem('draft:' + formId, 'local');
  }

  // ── Helper ──

  function _getStorage(type) {
    try {
      if (type === 'session') return global.sessionStorage;
      return global.localStorage;
    } catch (_) { return null; }
  }

  // ── Session restore (използва се от app.js) ──
  global._readSession_ = loadSession;
  global._writeSession_ = saveSession;
  global._wipeSession_ = clearSession;
  global._touchActivity = touchActivity;
  global._readActivity_ = getLastActivity;
  global._SESSION_TTL = SESSION_TTL;

  // ── Draft helpers ──
  global._saveDraft = saveDraft;
  global._loadDraft = loadDraft;
  global._deleteDraft = deleteDraft;

  // ── T9: cross-tab draft-count sync (v12.50.0) ──
  // localStorage fires a native 'storage' event in OTHER tabs when a key
  // changes. We bridge that into an in-app pub/sub so the ApplicantView draft
  // counts (which read the getmyforms cache) can refresh without a reload when
  // a second tab saves/deletes a draft.
  var _draftSubs = [];
  function _onDraftStorage(ev) {
    if (!ev || !ev.key) return;
    if (ev.key.indexOf(PREFIX + 'draft:') !== 0 && ev.key !== PREFIX + 'draft') return;
    var formId = ev.key.indexOf(PREFIX + 'draft:') === 0 ? ev.key.slice((PREFIX + 'draft:').length) : null;
    _draftSubs.forEach(function (fn) {
      try { fn({ formId: formId, key: ev.key, newValue: ev.newValue, oldValue: ev.oldValue }); } catch (_) {}
    });
  }
  if (global.addEventListener) {
    global.addEventListener('storage', _onDraftStorage);
  }
  var _draftSync = {
    // Subscribe to cross-tab draft changes. Returns an unsubscribe function.
    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      _draftSubs.push(fn);
      return function () {
        var i = _draftSubs.indexOf(fn);
        if (i >= 0) _draftSubs.splice(i, 1);
      };
    },
    // Notify local subscribers immediately (same-tab save) — optional, keeps
    // both tabs in lockstep for the common single-tab case too.
    notify: function (formId) {
      _draftSubs.forEach(function (fn) {
        try { fn({ formId: formId || null, key: PREFIX + 'draft' + (formId ? ':' + formId : ''), newValue: null, oldValue: null }); } catch (_) {}
      });
    }
  };

  // ── Export ──
  global.__uevStorage = {
    get: getItem,
    set: setItem,
    remove: removeItem,
    clear: clear,
    session: { save: saveSession, load: loadSession, clear: clearSession },
    draft: { save: saveDraft, load: loadDraft, delete: deleteDraft },
    draftSync: _draftSync
  };

})(window);
