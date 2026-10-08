/* ═══════════════════════════════════════════════════════════════════════
 * useAutosave.js — Debounced autosave hook for Proposal Wizard v2.0
 * ═══════════════════════════════════════════════════════════════════════
 * Provides:
 *   - Debounced save (1500ms default)
 *   - Dirty state tracking
 *   - Save status management (idle / saving / saved / error)
 *   - 409 conflict detection with server version capture
 *   - Retry support
 *
 * Exposed globally as window.__pwUseAutosave.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useCallback = React.useCallback;

  /**
   * Hook: useAutosave
   * @param {Object} options
   * @param {number} [options.delay=1500] — debounce delay in ms
   * @param {Function} [options.onSave] — called with the full state when save fires
   * @param {Function} [options.onConflict] — called with 409 conflict info
   * @param {boolean} [options.enabled=true] — whether autosave is active
   * @returns {{status: string, lastSavedAt: ?string, errorMessage: ?string,
   *           triggerSave: Function, retry: Function}}
   */
  function useAutosave(options) {
    options = options || {};
    var delay = options.delay || 1500;
    var onSave = options.onSave || function () { return Promise.resolve({ success: true }); };
    var onConflict = options.onConflict || function () {};
    var enabled = options.enabled !== false;

    var _status = useState('idle');
    var status = _status[0];
    var setStatus = _status[1];

    var _lastSaved = useState(null);
    var lastSavedAt = _lastSaved[0];
    var setLastSavedAt = _lastSaved[1];

    var _error = useState(null);
    var errorMessage = _error[0];
    var setErrorMessage = _error[1];

    var _retryFn = useRef(null);
    var _timerRef = useRef(null);
    var _lastStateRef = useRef(null);

    // ── Clear timer on unmount ───────────────────────────────────────────
    useEffect(function () {
      return function () {
        if (_timerRef.current) {
          clearTimeout(_timerRef.current);
          _timerRef.current = null;
        }
      };
    }, []);

    /**
     * Perform the actual save.
     * @param {Object} state — wizard state to save
     * @returns {Promise<Object>}
     */
    var performSave = useCallback(function (state) {
      setStatus('saving');
      setErrorMessage(null);

      return onSave(state).then(function (res) {
        if (res && res.success === false) {
          // Check for 409 conflict
          if (res.error === 'row_version_conflict' ||
              res.error === 'conflict' ||
              res.status === 409 ||
              (res.error && res.error.indexOf('конфликт') >= 0)) {
            onConflict({
              serverVersion: res.serverVersion || res.newRowVersion || 0,
              serverLastModifiedAt: res.lastModifiedAt || null,
              serverData: res.serverData || null
            });
            setStatus('error');
            setErrorMessage('Конфликт при запис. Вашият чернова е конфликтен със сървърната версия.');
            return res;
          }

          // Other error
          setStatus('error');
          setErrorMessage(res.error || 'Неуспешно запазване.');
          return res;
        }

        // Success
        setStatus('saved');
        setLastSavedAt(res.lastSavedAt || new Date().toISOString());

        // Auto-reset to idle after 3 seconds
        setTimeout(function () {
          setStatus(function (prev) { return prev === 'saved' ? 'idle' : prev; });
        }, 3000);

        return res;
      }).catch(function (err) {
        setStatus('error');
        setErrorMessage(err && err.message || 'Грешка при свързване.');
        return null;
      });
    }, [onSave, onConflict]);

    /**
     * Debounced save — schedules a save after `delay` ms.
     * @param {Object} state — wizard state
     */
    var scheduleSave = useCallback(function (state) {
      if (!enabled) return;

      _lastStateRef.current = state;

      // Clear existing timer
      if (_timerRef.current) {
        clearTimeout(_timerRef.current);
      }

      // Schedule new save
      _timerRef.current = setTimeout(function () {
        _timerRef.current = null;
        var savedState = _lastStateRef.current;
        if (savedState) {
          performSave(savedState);
        }
      }, delay);
    }, [delay, enabled, performSave]);

    /**
     * Trigger an immediate save (bypass debounce).
     * @param {Object} [state] — wizard state (uses last state if omitted)
     * @returns {Promise<Object>}
     */
    var triggerSave = useCallback(function (state) {
      if (!enabled) return Promise.resolve({ success: true });

      // Clear any pending debounced save
      if (_timerRef.current) {
        clearTimeout(_timerRef.current);
        _timerRef.current = null;
      }

      var saveState = state || _lastStateRef.current;
      if (!saveState) {
        return Promise.resolve({ success: true });
      }

      return performSave(saveState);
    }, [enabled, performSave]);

    /**
     * Retry the last save.
     * @returns {Promise<Object>}
     */
    var retry = useCallback(function () {
      var saveState = _lastStateRef.current;
      if (!saveState) return Promise.resolve({ success: true });
      return performSave(saveState);
    }, [performSave]);

    // Store retry function for external access
    _retryFn.current = retry;

    return {
      status: status,
      lastSavedAt: lastSavedAt,
      errorMessage: errorMessage,
      triggerSave: triggerSave,
      scheduleSave: scheduleSave,
      retry: retry
    };
  }

  // ── Expose globally ──────────────────────────────────────────────────
  global.__pwUseAutosave = useAutosave;

})(window);
