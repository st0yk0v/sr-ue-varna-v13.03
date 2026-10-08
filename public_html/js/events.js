/* ═══════════════════════════════════════════════════════════════════════════
 *  js/processors/events.js — Application Event Bus (v12.27.0)
 *
 *  Event-driven комуникация между компонентите.
 *  Осигурява:
 *    • Pub/sub модел за decoupled компоненти
 *    • Data version събития за cache invalidation
 *    • Connectivity събития за router
 *    • User action събития за analytics
 *
 *  ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var _listeners = {};
  var _history = [];
  var _MAX_HISTORY = 100;

  /**
   * Subscribe за събитие
   * @param {string} event
   * @param {Function} callback
   * @param {Object} opts - { once, priority }
   * @returns {Function} unsubscribe
   */
  function on(event, callback, opts) {
    opts = opts || {};
    if (!_listeners[event]) _listeners[event] = [];
    
    var entry = {
      callback: callback,
      once: !!opts.once,
      priority: opts.priority || 0
    };
    
    _listeners[event].push(entry);
    // Sort by priority descending
    _listeners[event].sort(function(a, b) { return b.priority - a.priority; });
    
    // Return unsubscribe function
    return function() { off(event, callback); };
  }

  /**
   * Unsubscribe
   */
  function off(event, callback) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(function(e) {
      return e.callback !== callback;
    });
    if (_listeners[event].length === 0) delete _listeners[event];
  }

  /**
   * Publish събитие
   * @param {string} event
   * @param {*} data
   */
  function emit(event, data) {
    // Log to history
    _history.push({ event: event, data: data, ts: Date.now() });
    if (_history.length > _MAX_HISTORY) _history.shift();
    
    if (!_listeners[event]) return;
    
    var toRemove = [];
    for (var i = 0; i < _listeners[event].length; i++) {
      var entry = _listeners[event][i];
      try {
        entry.callback(data);
      } catch (err) {
        console.warn('[events] Error in handler for "' + event + '":', err);
      }
      if (entry.once) toRemove.push(entry.callback);
    }
    
    // Remove once handlers
    for (var ri = 0; ri < toRemove.length; ri++) {
      off(event, toRemove[ri]);
    }
  }

  /**
   * Subscribe once
   */
  function once(event, callback) {
    return on(event, callback, { once: true });
  }

  /**
   * Изчакване на събитие (Promise)
   * @param {string} event
   * @param {number} timeout
   * @returns {Promise}
   */
  function waitFor(event, timeout) {
    return new Promise(function(resolve, reject) {
      var unsub = on(event, function(data) {
        unsub();
        resolve(data);
      }, { once: true });
      
      if (timeout > 0) {
        setTimeout(function() {
          unsub();
          reject(new Error('Timeout waiting for event: ' + event));
        }, timeout);
      }
    });
  }

  /**
   * Вземане на история
   */
  function getHistory(event) {
    if (event) return _history.filter(function(h) { return h.event === event; });
    return _history.slice();
  }

  // ── Built-in events ──

  // Data version change
  on('data:version:change', function(version) {
    if (typeof __uevCache !== 'undefined') {
      __uevCache.flush();
    }
  });

  // Connectivity change
  on('connectivity:change', function(state) {
    if (state === 'online' && typeof __uevSync !== 'undefined') {
      __uevSync.forceRefresh();
    }
  });

  // User login/logout
  on('auth:login', function(user) {
    if (typeof __uevStorage !== 'undefined') {
      __uevStorage.session.save(user);
    }
  });

  on('auth:logout', function() {
    if (typeof __uevStorage !== 'undefined') {
      __uevStorage.session.clear();
    }
    if (typeof __uevCache !== 'undefined') {
      __uevCache.flush();
    }
  });

  // ── Export ──
  global.__uevEvents = {
    on: on,
    off: off,
    emit: emit,
    once: once,
    waitFor: waitFor,
    getHistory: getHistory
  };

})(window);
