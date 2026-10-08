/* ═══════════════════════════════════════════════════════════════════════
 * useAutosave.js — Debounced autosave hook per autosave_contract
 * ═══════════════════════════════════════════════════════════════════════
 * Features:
 *   - 2000ms debounce after last EDIT_FIELD
 *   - Also triggers on blur of any form field
 *   - Explicit save (SAVE_DRAFT_EXPLICIT) bypasses debounce
 *   - UI feedback: saving / saved at HH:MM / error + retry
 *   - 409 conflict detection → opens conflict resolution
 *   - Serialized request queue (no parallel saves)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   const autosave = useAutosave(wizard, { user, onConflict });
 *   // autosave.status: 'idle'|'saving'|'saved'|'error'
 *   // autosave.lastSavedAt: ISO8601|null
 *   // autosave.saveNow(): force explicit save
 *   // autosave.retry(): retry after error
 *   // autosave.blur(): call on blur events
 *   // autosave.errorMessage: string|null
 */

(function (global) {
  'use strict';

  var useState       = React.useState;
  var useEffect      = React.useEffect;
  var useCallback    = React.useCallback;
  var useRef         = React.useRef;

  /**
   * @param {Object} wizard — from useWizardState()
   * @param {Object} opts
   * @param {Object} opts.user — { email, name }
   * @param {Function} opts.onConflict — called on 409 with { serverVersion, serverLastModifiedAt }
   * @param {Function} [opts.onSaved] — called after successful save
   * @param {Function} [opts.onError] — called on save error
   * @returns {{ status: string, lastSavedAt: string|null, saveNow: Function, retry: Function, blur: Function, errorMessage: string|null, savePoints: Array, createSavePoint: Function, getSavePoints: Function, restoreSavePoint: Function, deleteSavePoint: Function }}
   */
  function useAutosave(wizard, opts) {
    var state = wizard.state;
    var dispatch = wizard.dispatch;

    var _status = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
    var status = _status[0];
    var setStatus = _status[1];

    var _errorMsg = useState(null);
    var errorMessage = _errorMsg[0];
    var setErrorMsg = _errorMsg[1];

    var debounceRef = useRef(null);
    var inflightRef = useRef(false);
    var pendingRef = useRef(false);
    var lastSavedRef = useRef(state.lastSavedAt);
    var statusRef = useRef(status);
    statusRef.current = status;

    // ── T67: Application Save Points ──
    var _savePoints = useState([]);
    var savePoints = _savePoints[0];
    var setSavePoints = _savePoints[1];

    // Load save points from localStorage on mount
    useEffect(function () {
      if (!state.proposalId) return;
      try {
        var key = 'pw_savepoints_' + state.proposalId;
        var stored = localStorage.getItem(key);
        if (stored) {
          var parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setSavePoints(parsed);
          }
        }
      } catch (e) {
        console.warn('[useAutosave] Failed to load save points:', e);
      }
    }, [state.proposalId]);

    // Persist save points to localStorage whenever they change
    useEffect(function () {
      if (!state.proposalId) return;
      try {
        var key = 'pw_savepoints_' + state.proposalId;
        localStorage.setItem(key, JSON.stringify(savePoints));
      } catch (e) {
        console.warn('[useAutosave] Failed to persist save points:', e);
      }
    }, [savePoints, state.proposalId]);

    /**
     * Builds the flat updates object passed to __pwApi.patchProposal().
     * NOTE: patchProposal() strips metadata keys (id/row_version/userId/userName)
     * and forwards the rest as `fields`, so step data must be TOP-LEVEL here —
     * not nested under an `updates` key (the PHP handler handleSqlUpdateProposal
     * persists `fields` into form_data as-is).
     * @returns {Object} { step1, step2, step3, userId, userName }
     */
    function _buildSavePayload() {
      var s = wizard.stateRef ? wizard.stateRef.current : state;
      return {
        step1: s.step1,
        step2: s.step2,
        step3: s.step3,
        userId: (opts && opts.user && opts.user.email) || '',
        userName: (opts && opts.user && opts.user.name) || ''
      };
    }

    // Perform the actual save
    var _doSave = useCallback(function (isExplicit) {
      if (inflightRef.current) {
        pendingRef.current = true;
        return;
      }
      if (!state.proposalId) {
        // No draft exists yet — skip autosave, wait for explicit save
        return;
      }
      inflightRef.current = true;
      setStatus('saving');
      setErrorMsg(null);

      var api = global.__pwApi;
      if (!api) {
        setStatus('error');
        setErrorMsg('API модулът не е наличен.');
        inflightRef.current = false;
        return;
      }

      api.patchProposal(state.proposalId, _buildSavePayload(), state.rowVersion)
        .then(function (res) {
          if (res.success) {
            dispatch('SET_SAVED', {
              lastSavedAt: res.lastSavedAt,
              rowVersion: res.rowVersion
            });
            lastSavedRef.current = res.lastSavedAt;
            setStatus('saved');
            // Auto-revert to idle after 3s
            setTimeout(function () {
              setStatus(function (prev) { return prev === 'saved' ? 'idle' : prev; });
            }, 3000);
            if (typeof opts.onSaved === 'function') opts.onSaved(res);
          }
        })
        .catch(function (err) {
          if (err && err.code === 409) {
            // Conflict — delegate to conflict handler
            dispatch('CONFLICT_DETECTED', {
              serverVersion: err.serverVersion,
              serverLastModifiedAt: err.serverLastModifiedAt,
              serverData: err.serverData
            });
            setStatus('error');
            setErrorMsg('Конфликт при запис. Друга сесия е променила черновата.');
            if (typeof opts.onConflict === 'function') {
              opts.onConflict({
                serverVersion: err.serverVersion,
                serverLastModifiedAt: err.serverLastModifiedAt
              });
            }
          } else {
            console.error('[ProposalWizard] Autosave failed:', err);
            setStatus('error');
            setErrorMsg(err && err.message || 'Неуспешно запазване — опитайте отново.');
            if (typeof opts.onError === 'function') opts.onError(err);
          }
        })
        .finally(function () {
          inflightRef.current = false;
          if (pendingRef.current) {
            pendingRef.current = false;
            _doSave(isExplicit);
          }
        });
    }, [state, dispatch, opts]);

    // Debounced autosave on isDirty changes
    useEffect(function () {
      if (!state.isDirty) return;
      if (!state.proposalId) return;

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(function () {
        _doSave(false);
      }, 2000);

      return function () {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
      };
    }, [state.isDirty, state.proposalId, _doSave]);

    // Explicit save (bypasses debounce)
    var saveNow = useCallback(function () {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      pendingRef.current = false;
      _doSave(true);
    }, [_doSave]);

    // Retry after error
    var retry = useCallback(function () {
      setErrorMsg(null);
      _doSave(true);
    }, [_doSave]);

    // Call on blur of form fields
    var blur = useCallback(function () {
      if (state.isDirty && state.proposalId) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        _doSave(false);
      }
    }, [state.isDirty, state.proposalId, _doSave]);

    // ── T67: Save Point Management ──

    /**
     * Creates a named snapshot of the current wizard state in localStorage.
     * @param {string} name — display name for the save point
     * @returns {{ success: boolean, message_bg: string }}
     */
    var createSavePoint = useCallback(function (name) {
      if (!state.proposalId) {
        return { success: false, message_bg: 'Няма активна чернова за запазване.' };
      }
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return { success: false, message_bg: 'Моля, въведете име на точката за запис.' };
      }
      var trimmedName = name.trim();
      var now = new Date().toISOString();
      var snapshot = {
        name: trimmedName,
        timestamp: now,
        data: {
          step1: state.step1,
          step2: state.step2,
          step3: state.step3,
          currentStep: state.currentStep
        }
      };
      // Replace if name exists, otherwise append
      var existing = savePoints.filter(function (sp) { return sp.name !== trimmedName; });
      existing.push(snapshot);
      setSavePoints(existing);
      return { success: true, message_bg: 'Точката за запис "' + trimmedName + '" е създадена.' };
    }, [state.proposalId, state.step1, state.step2, state.step3, state.currentStep, savePoints]);

    /**
     * Lists all named save points for the current proposal.
     * @returns {Array<{ name: string, timestamp: string, data: Object }>}
     */
    var getSavePoints = useCallback(function () {
      return savePoints.slice().sort(function (a, b) {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    }, [savePoints]);

    /**
     * Restores wizard state from a named save point.
     * @param {string} name — name of the save point to restore
     * @returns {{ success: boolean, message_bg: string }}
     */
    var restoreSavePoint = useCallback(function (name) {
      if (!state.proposalId) {
        return { success: false, message_bg: 'Няма активна чернова за възстановяване.' };
      }
      var target = savePoints.find(function (sp) { return sp.name === name; });
      if (!target) {
        return { success: false, message_bg: 'Точката за запис "' + name + '" не е намерена.' };
      }
      if (!target.data) {
        return { success: false, message_bg: 'Точката за запис "' + name + '" е повредена.' };
      }
      // Dispatch restore actions for each step
      if (target.data.step1) dispatch('RESTORE_STEP', { step: 1, data: target.data.step1 });
      if (target.data.step2) dispatch('RESTORE_STEP', { step: 2, data: target.data.step2 });
      if (target.data.step3) dispatch('RESTORE_STEP', { step: 3, data: target.data.step3 });
      if (target.data.currentStep) dispatch('GO_TO_STEP', target.data.currentStep);
      return { success: true, message_bg: 'Точката за запис "' + name + '" е възстановена.' };
    }, [state.proposalId, savePoints, dispatch]);

    /**
     * Deletes a named save point.
     * @param {string} name — name of the save point to delete
     * @returns {{ success: boolean, message_bg: string }}
     */
    var deleteSavePoint = useCallback(function (name) {
      if (!state.proposalId) {
        return { success: false, message_bg: 'Няма активна чернова.' };
      }
      var filtered = savePoints.filter(function (sp) { return sp.name !== name; });
      if (filtered.length === savePoints.length) {
        return { success: false, message_bg: 'Точката за запис "' + name + '" не е намерена.' };
      }
      setSavePoints(filtered);
      return { success: true, message_bg: 'Точката за запис "' + name + '" е изтрита.' };
    }, [state.proposalId, savePoints]);

    return {
      status: status,
      lastSavedAt: lastSavedRef.current,
      saveNow: saveNow,
      retry: retry,
      blur: blur,
      errorMessage: errorMessage,
      savePoints: savePoints,
      createSavePoint: createSavePoint,
      getSavePoints: getSavePoints,
      restoreSavePoint: restoreSavePoint,
      deleteSavePoint: deleteSavePoint
    };
  }

  /* ── Expose globally ── */
  global.__pwUseAutosave = useAutosave;

})(window);
