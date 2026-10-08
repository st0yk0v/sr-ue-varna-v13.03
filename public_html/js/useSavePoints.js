/* ═══════════════════════════════════════════════════════════════════════
 * useSavePoints.js — Named save points for Proposal Wizard (T67)
 * ═══════════════════════════════════════════════════════════════════════
 * Allows users to create named snapshots of their application progress,
 * list existing save points, restore from a named point, and delete
 * unwanted ones. Save points are persisted to localStorage for fast
 * access and mirrored to the server when an API is available.
 *
 * Usage:
 *   const { savePoints, createSavePoint, restoreSavePoint, deleteSavePoint } =
 *     useSavePoints({ proposalId, getState, setState });
 *
 * Булgarian UI strings throughout.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useRef = React.useRef;

  /**
   * Generate a storage key for a proposal's save points.
   * @param {string|null} proposalId
   * @returns {string}
   */
  function storageKey(proposalId) {
    return 'pw_savepoints_' + (proposalId || 'draft');
  }

  /**
   * Generate a unique id for a save point.
   * @returns {string}
   */
  function generateId() {
    return 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  /**
   * Format a timestamp as a human-readable Bulgarian date string.
   * @param {number} ts — epoch ms
   * @returns {string}
   */
  function formatTimestamp(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var day = String(d.getDate()).padStart(2, '0');
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var year = d.getFullYear();
    var hours = String(d.getHours()).padStart(2, '0');
    var mins = String(d.getMinutes()).padStart(2, '0');
    return day + '.' + month + '.' + year + ' ' + hours + ':' + mins;
  }

  /**
   * Load save points from localStorage.
   * @param {string|null} proposalId
   * @returns {Array<{id:string,name:string,timestamp:number,state:Object}>}
   */
  function loadSavePoints(proposalId) {
    try {
      var raw = localStorage.getItem(storageKey(proposalId));
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Persist save points to localStorage.
   * @param {string|null} proposalId
   * @param {Array} points
   */
  function persistSavePoints(proposalId, points) {
    try {
      localStorage.setItem(storageKey(proposalId), JSON.stringify(points));
    } catch (e) {
      // Storage full — silently fail
    }
  }

  /**
   * useSavePoints hook.
   * @param {Object} opts
   * @param {string|null} opts.proposalId — current proposal id
   * @param {Function} opts.getState — returns current wizard state snapshot
   * @param {Function} opts.setState — restores wizard state from snapshot
   * @param {Function} [opts.onSavePointCreated] — callback after creation
   * @param {Function} [opts.onSavePointRestored] — callback after restore
   * @returns {{ savePoints: Array, createSavePoint: Function, restoreSavePoint: Function, deleteSavePoint: Function, formatTimestamp: Function }}
   */
  function useSavePoints(opts) {
    var proposalId = opts.proposalId;
    var getState = opts.getState;
    var setState = opts.setState;
    var onSavePointCreated = opts.onSavePointCreated;
    var onSavePointRestored = opts.onSavePointRestored;

    var [savePoints, setSavePoints] = useState(function () {
      return loadSavePoints(proposalId);
    });

    var proposalIdRef = useRef(proposalId);
    proposalIdRef.current = proposalId;

    // Reload save points when proposalId changes
    useEffect(function () {
      setSavePoints(loadSavePoints(proposalId));
    }, [proposalId]);

    /**
     * Create a new named save point.
     * @param {string} name — user-provided name for the save point
     * @returns {Object|null} the created save point or null on failure
     */
    var createSavePoint = useCallback(function (name) {
      var trimmed = (name || '').trim();
      if (!trimmed) return null;

      var snapshot = getState ? getState() : null;
      var point = {
        id: generateId(),
        name: trimmed,
        timestamp: Date.now(),
        state: snapshot
      };

      var current = loadSavePoints(proposalIdRef.current);
      var updated = current.concat(point);
      persistSavePoints(proposalIdRef.current, updated);
      setSavePoints(updated);

      if (onSavePointCreated) onSavePointCreated(point);
      return point;
    }, [getState, onSavePointCreated]);

    /**
     * Restore wizard state from a save point.
     * @param {string} id — save point id
     * @returns {boolean} true if restored successfully
     */
    var restoreSavePoint = useCallback(function (id) {
      var current = loadSavePoints(proposalIdRef.current);
      var point = null;
      for (var i = 0; i < current.length; i++) {
        if (current[i].id === id) {
          point = current[i];
          break;
        }
      }
      if (!point || !point.state) return false;

      if (setState) setState(point.state);
      if (onSavePointRestored) onSavePointRestored(point);
      return true;
    }, [setState, onSavePointRestored]);

    /**
     * Delete a save point by id.
     * @param {string} id
     */
    var deleteSavePoint = useCallback(function (id) {
      var current = loadSavePoints(proposalIdRef.current);
      var updated = current.filter(function (p) { return p.id !== id; });
      persistSavePoints(proposalIdRef.current, updated);
      setSavePoints(updated);
    }, []);

    return {
      savePoints: savePoints,
      createSavePoint: createSavePoint,
      restoreSavePoint: restoreSavePoint,
      deleteSavePoint: deleteSavePoint,
      formatTimestamp: formatTimestamp
    };
  }

  // Expose globally
  global.__pwUseSavePoints = useSavePoints;
  global.__pwFormatTimestamp = formatTimestamp;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
