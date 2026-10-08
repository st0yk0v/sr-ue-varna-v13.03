/* ══════════════════════════════════════════════════════════════════════
 * wizardAdminApi.js — Admin API wrapper for Proposal Wizard submissions
 * ═══════════════════════════════════════════════════════════════════════
 * Provides admin operations on wizard submissions:
 *   - getWizardSubmissions(filters)     — list submissions with optional filters
 *   - getWizardSubmission(id)           — get full submission details
 *   - getWizardStats()                  — aggregate statistics
 *   - deleteWizardSubmission(id)        — soft-delete a submission
 *   - exportWizardSubmissionsCSV(filters) — export submissions as CSV
 *
 * All functions call api('wizard_admin_action', {...}) with appropriate parameters.
 *
 * Uses the existing global api() for transport.
 * ═══════════════════════════════════════════════════════════════════════ */

var _pwAdminApi = (function () {
  'use strict';

  // ── Configuration ──
  var API_TIMEOUT_MS = 30000;

  // v3.39.1-perf: Request deduplication cache
  var _pendingRequests = {};

  // v3.39.1-perf: Response cache for read operations
  var _responseCache = {};
  var _CACHE_TTL = 120000; // 2 minutes

  /**
   * Wraps a promise with a timeout.
   * @param {Promise} promise
   * @param {number} ms
   * @returns {Promise}
   */
  function _withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        clearTimeout(timer);
        reject(new Error('API call timeout after ' + ms + 'ms'));
      }, ms);
      promise.then(function (result) {
        clearTimeout(timer);
        resolve(result);
      }).catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  // v3.39.1-perf: Deduplicate concurrent identical requests
  function _dedupeRequest(key, fn) {
    if (_pendingRequests[key]) {
      return _pendingRequests[key];
    }
    _pendingRequests[key] = fn().finally(function () {
      delete _pendingRequests[key];
    });
    return _pendingRequests[key];
  }

  // v3.39.1-perf: Cache lookup helper
  function _getCachedResponse(key) {
    var entry = _responseCache[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > _CACHE_TTL) {
      delete _responseCache[key];
      return null;
    }
    return entry.data;
  }

  function _setCachedResponse(key, data) {
    _responseCache[key] = { data: data, ts: Date.now() };
    // Limit cache size
    if (Object.keys(_responseCache).length > 100) {
      var oldestKey = null;
      var oldestTs = Infinity;
      for (var k in _responseCache) {
        if (_responseCache[k].ts < oldestTs) {
          oldestTs = _responseCache[k].ts;
          oldestKey = k;
        }
      }
      if (oldestKey) delete _responseCache[oldestKey];
    }
  }

  // v3.39.1-perf: Cache key generator
  function _cacheKey(action, params) {
    return action + ':' + JSON.stringify(params || {});
  }

  function _readApi(action, params) {
    var cacheKey = _cacheKey(action, params);
    var cached = _getCachedResponse(cacheKey);
    if (cached !== null) {
      return Promise.resolve(cached);
    }

    var fn = (typeof api === 'function') ? api : window.api;
    if (typeof fn !== 'function') {
      return Promise.reject(new Error('api() not available'));
    }
    var result = fn(action, params || {});
    // Add timeout to all API calls
    return _withTimeout(result, API_TIMEOUT_MS).then(function (res) {
      _setCachedResponse(cacheKey, res);
      return res;
    });
  }

  function _mutateApi(action, payload) {
    var fn = (typeof mutateApi === 'function') ? mutateApi : window.mutateApi;
    if (typeof fn !== 'function') {
      // Fallback to api() if mutateApi is unavailable
      return _readApi(action, payload);
    }
    // Clear relevant cache entries on write operations
    var cacheKeysToInvalidate = Object.keys(_responseCache).filter(function (k) {
      return k.indexOf('getWizardSubmissions') === 0 || k.indexOf('getWizardStats') === 0;
    });
    cacheKeysToInvalidate.forEach(function (key) {
      delete _responseCache[key];
    });
    return fn(action, payload);
  }

  /**
   * List all wizard submissions with optional filters.
   * @param {Object} filters — Optional filters object
   * @param {string} [filters.status] — Filter by status (e.g., 'draft', 'submitted', 'approved', 'rejected')
   * @param {string} [filters.projectType] — Filter by project type (e.g., 'ФНИ', 'ПНИ', 'ДНП', 'НПФ')
   * @param {Object} [filters.dateRange] — Date range filter { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
   * @returns {Promise<Array>} — Array of submission summaries
   */
  function getWizardSubmissions(filters) {
    var params = {
      op: 'list',
      filters: filters || {}
    };
    return _readApi('wizard_admin_action', params).then(function (res) {
      if (!res || res.success === false) {
        return { success: false, error: res && res.error || 'Failed to load submissions' };
      }
      return res.submissions || res.data || [];
    });
  }

  /**
   * Get full submission details including documents and budget.
   * @param {string} id — Submission ID
   * @returns {Promise<Object>} — Full submission details or error
   */
  function getWizardSubmission(id) {
    if (!id) {
      return Promise.reject(new Error('Submission ID is required'));
    }
    var params = {
      op: 'get',
      id: id
    };
    return _readApi('wizard_admin_action', params).then(function (res) {
      if (!res || res.success === false) {
        return { success: false, error: res && res.error || 'Submission not found' };
      }
      return { success: true, data: res.submission || res.data || res };
    });
  }

  /**
   * Get aggregate statistics for wizard submissions.
   * @returns {Promise<Object>} — Statistics object
   */
  function getWizardStats() {
    var params = {
      op: 'stats'
    };
    return _readApi('wizard_admin_action', params).then(function (res) {
      if (!res || res.success === false) {
        return { success: false, error: res && res.error || 'Failed to load statistics' };
      }
      return { success: true, data: res.stats || res.data || res };
    });
  }

  /**
   * Soft-delete a wizard submission.
   * @param {string} id — Submission ID
   * @returns {Promise<Object>} — Result of deletion
   */
  function deleteWizardSubmission(id) {
    if (!id) {
      return Promise.reject(new Error('Submission ID is required'));
    }
    var params = {
      op: 'delete',
      id: id
    };
    return _mutateApi('wizard_admin_action', params).then(function (res) {
      if (!res || res.success === false) {
        throw new Error(res && res.error || 'Failed to delete submission');
      }
      return { success: true, data: res };
    });
  }

  /**
   * Export wizard submissions as CSV.
   * @param {Object} filters — Optional filters (same as getWizardSubmissions)
   * @returns {Promise<Blob>} — CSV blob for download
   */
  function exportWizardSubmissionsCSV(filters) {
    var params = {
      op: 'export_csv',
      filters: filters || {}
    };
    // Use api() directly for export since it may return a blob
    var fn = (typeof api === 'function') ? api : window.api;
    if (typeof fn !== 'function') {
      return Promise.reject(new Error('api() not available'));
    }
    var result = fn('wizard_admin_action', params);
    return _withTimeout(result, API_TIMEOUT_MS).then(function (res) {
      if (!res || res.success === false) {
        throw new Error(res && res.error || 'Failed to export CSV');
      }
      // If the server returns a blob directly, return it
      if (res instanceof Blob) {
        return res;
      }
      // If server returns base64 or data URL, convert to blob
      if (res && res.csvBase64) {
        var binaryString = atob(res.csvBase64);
        var bytes = new Uint8Array(binaryString.length);
        for (var i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes], { type: 'text/csv;charset=utf-8;' });
      }
      // If server returns a download URL, fetch it
      if (res && res.downloadUrl) {
        return fetch(res.downloadUrl).then(function (response) {
          if (!response.ok) throw new Error('Failed to download CSV');
          return response.blob();
        });
      }
      // Fallback: assume res is already a blob-like object
      return new Blob([JSON.stringify(res)], { type: 'text/csv;charset=utf-8;' });
    });
  }

  /* ── Expose public API ── */
  return {
    getWizardSubmissions: getWizardSubmissions,
    getWizardSubmission: getWizardSubmission,
    getWizardStats: getWizardStats,
    deleteWizardSubmission: deleteWizardSubmission,
    exportWizardSubmissionsCSV: exportWizardSubmissionsCSV,
    // Cache management utilities
    clearCache: function () {
      _responseCache = {};
      _pendingRequests = {};
    },
    getCacheStats: function () {
      return {
        cacheSize: Object.keys(_responseCache).length,
        pendingRequests: Object.keys(_pendingRequests).length
      };
    }
  };
})();

/* ── Expose globally ── */
window.__pwAdminApi = _pwAdminApi;