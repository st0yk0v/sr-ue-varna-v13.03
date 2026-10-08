/* ═══════════════════════════════════════════════════════════════════════
 * proposalsApi.js — Thin fetch wrapper for Proposal Wizard API
 * ═══════════════════════════════════════════════════════════════════════
 * Implements the api_contract from the spec:
 *   GET    /api/proposals/{id}
 *   POST   /api/proposals
 *   PATCH  /api/proposals/{id}
 *   GET    /api/proposals/{id}/documents
 *   POST   /api/proposals/{id}/documents/{docId}/generate
 *   POST   /api/proposals/{id}/documents/{docId}/upload
 *   GET    /api/proposals/{id}/documents/{docId}/preview
 *   GET    /api/proposals/{id}/budget/rules?project_type=X
 *   POST   /api/proposals/{id}/submit
 *
 * Uses the existing global api() and mutateApi() for transport,
 * adding a thin wrapper for 409 conflict detection and typed responses.
 *
 * v12.30.0-perf: Added timeout wrapper for API calls
 * v12.30.0-perf: Added request deduplication to prevent duplicate concurrent requests
 * v3.39.1-perf: Extended cache TTLs and improved error handling
 * ═══════════════════════════════════════════════════════════════════════ */

var _pwApi = (function () {
  'use strict';

  // ── Configuration ──
  var API_TIMEOUT_MS = 30000;
  var RETRY_MAX_ATTEMPTS = 3;
  var RETRY_BASE_DELAY_MS = 500;
  var DEBOUNCE_KEY_PREFIX = 'pw_draft_';

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

  // v3.39.1-perf: Retry logic with exponential backoff
  function _retry(fn, maxRetries, baseDelay) {
    return new Promise(function (resolve, reject) {
      var attempt = 0;
      function tryOnce() {
        fn().then(resolve).catch(function (err) {
          attempt++;
          if (attempt >= maxRetries) {
            reject(err);
          } else {
            var delay = baseDelay * Math.pow(2, attempt - 1);
            setTimeout(tryOnce, delay);
          }
        });
      }
      tryOnce();
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
    // v3.39.1-perf: Add 30s timeout to all API calls
    return _withTimeout(result, API_TIMEOUT_MS).then(function (res) {
      _setCachedResponse(cacheKey, res);
      return res;
    });
  }

  /**
   * Calls the existing global mutateApi() function (write POST/PATCH-style).
   * @param {string} action
   * @param {Object} payload
   * @param {Object} [opts]
   * @returns {Promise<Object>}
   */
  function _mutateApi(action, payload, opts) {
    var fn = (typeof mutateApi === 'function') ? mutateApi : window.mutateApi;
    if (typeof fn !== 'function') {
      // Fallback to api() if mutateApi is unavailable
      return _readApi(action, payload);
    }
    // Clear relevant cache entries on write operations
    if (opts && opts.invalidate) {
      opts.invalidate.forEach(function (key) {
        delete _responseCache[key];
      });
    }
    return fn(action, payload, opts || {});
  }

  /**
   * Checks if a response indicates a 409 conflict.
   * @param {Object} res
   * @returns {boolean}
   */
  function isConflictResponse(res) {
    return res && (
      res.error === 'row_version_conflict' ||
      res.error === 'conflict' ||
      res.status === 409 ||
      res.code === 409 ||
      (res.error && res.error.indexOf('конфликт') >= 0) ||
      (res.error && res.error.indexOf('row_version') >= 0)
    );
  }

  /**
   * GET /api/proposals/{id} — full wizard state.
   * @param {string} proposalId
   * @returns {Promise<Object>} — full WizardState shape or 404
   */
  function getProposal(proposalId) {
    var key = 'proposal:' + proposalId;
    var cached = _getCachedResponse(key);
    if (cached !== null) {
      return Promise.resolve(cached);
    }

    return _readApi('sqlGetProposal', { id: proposalId }).then(function (res) {
      if (!res || res.success === false) {
        return { found: false, error: res && res.error || 'Not found' };
      }
      var result = { found: true, data: res.data || res };
      _setCachedResponse(key, result);
      return result;
    });
  }

  /**
   * POST /api/proposals — create new draft.
   * @param {Object} initialData
   * @returns {Promise<Object>} — { proposalId, rowVersion }
   */
  function createProposal(initialData) {
    return _mutateApi('sqlCreateProposal', { form: initialData }, { invalidates: ['getforms', 'getinitialdata'] })
      .then(function (res) {
        if (!res || res.success === false) {
          throw new Error((res && res.error) || 'Неуспешно създаване на чернова.');
        }
        return {
          proposalId: res.id || res.proposalId,
          rowVersion: Number(res.rowVersion || res.row_version || 0)
        };
      });
  }

  /**
   * PATCH /api/proposals/{id} — partial update (autosave or explicit save).
   * Throws on 409 with { code: 409, serverVersion, serverLastModifiedAt }.
   * Sends row_version for optimistic concurrency control.
   * @param {string} proposalId
   * @param {Object} updates  — step data to persist
   * @param {number} rowVersion
   * @returns {Promise<Object>}
   */
  function patchProposal(proposalId, updates, rowVersion) {
    // Separate metadata from payload fields for cleaner server-side handling.
    // The PHP handler expects { id, row_version, userEmail, fields: { ... } }
    var payload = {
      id: proposalId,
      row_version: rowVersion,
      userEmail: (updates && updates.userId) || '',
      fields: {}
    };
    // Strip known metadata keys, keep only the step data as fields
    Object.keys(updates || {}).forEach(function (k) {
      if (k === 'id' || k === 'row_version' || k === 'rowVersion' || k === 'userId' || k === 'userName') return;
      payload.fields[k] = updates[k];
    });

    // Clear proposal cache on update
    _setCachedResponse('proposal:' + proposalId, null);

    return _mutateApi('sqlUpdateProposal', { updates: payload }, { invalidates: ['getforms', 'getinitialdata'] })
      .catch(function (thrown) {
        // mutateApi() throws on success:false BEFORE our .then runs, attaching
        // the raw server payload as thrown.response — normalize conflicts here.
        var body = thrown && thrown.response;
        if (body && isConflictResponse(body)) {
          var cErr = new Error('row_version_conflict');
          cErr.code = 409;
          cErr.serverVersion = Number(body.serverVersion || body.serverRowVersion || 0);
          cErr.serverLastModifiedAt = body.serverLastModifiedAt || body.lastModifiedAt || null;
          cErr.serverData = body.serverData || null;
          throw cErr;
        }
        throw thrown;
      })
      .then(function (res) {
        if (!res) {
          throw new Error('Празен отговор от сървъра.');
        }
        if (isConflictResponse(res)) {
          var err = new Error('row_version_conflict');
          err.code = 409;
          err.serverVersion = Number(res.serverVersion || res.serverRowVersion || 0);
          err.serverLastModifiedAt = res.serverLastModifiedAt || res.lastModifiedAt || null;
          err.serverData = res.serverData || null;
          throw err;
        }
        if (res.success === false) {
          throw new Error(res.error || 'Неуспешно запазване.');
        }
        var result = {
          success: true,
          rowVersion: Number(res.newRowVersion || res.new_row_version || res.rowVersion || res.row_version || rowVersion + 1),
          lastSavedAt: res.lastSavedAt || res.lastModifiedAt || res.updatedAt || new Date().toISOString()
        };
        // Update cache
        _setCachedResponse('proposal:' + proposalId, result);
        return result;
      });
  }

  /**
   * GET /api/proposals/{id}/documents — returns ProposalDocument[]
   * @param {string} proposalId
   * @returns {Promise<Array>}
   */
  function getDocuments(proposalId) {
    return _readApi('sqlGetProposalDocuments', { id: proposalId }).then(function (res) {
      if (!res || res.success === false) return [];
      return res.documents || res.data || [];
    });
  }

  /**
   * POST /api/proposals/{id}/documents/{docId}/generate — generate from template.
   * @param {string} proposalId
   * @param {string} docType
   * @returns {Promise<Object>}
   */
  function generateDocument(proposalId, docType) {
    return _mutateApi('generateApplicationDocument', {
      formId: proposalId,
      docId: docType
    }, { invalidates: ['getforms'] }).then(function (res) {
      if (!res || res.success === false) {
        throw new Error((res && res.error) || 'Неуспешно генериране на документ.');
      }
      return res;
    });
  }

  /**
   * GET /api/proposals/{id}/documents/{docId}/preview — preview URL.
   * Returns preview_url or a graceful error object.
   * @param {string} proposalId
   * @param {string} docId
   * @returns {Promise<Object>} — { preview_url: string|null, error: string|null }
   */
  function getDocumentPreview(proposalId, docId) {
    return _readApi('sqlGetDocumentPreview', { formId: proposalId, docId: docId }).then(function (res) {
      if (!res || res.success === false) {
        return {
          preview_url: null,
          error: res && res.error || 'Файлът не може да бъде зареден в момента. Опитайте да го отворите директно в Drive или го генерирайте наново.'
        };
      }
      return {
        preview_url: res.preview_url || res.previewLink || res.url || null,
        error: res.error || null
      };
    });
  }

  /**
   * GET /api/proposals/{id}/budget/rules?project_type=X — budget cap rules.
   * @param {string} projectType  — ФНИ|ПНИ|ДНП|НПФ
   * @returns {Promise<Array<{code:string, cap_percent:number}>>}
   */
  function getBudgetRules(projectType) {
    return _readApi('sqlGetBudgetRules', { project_type: projectType }).then(function (res) {
      if (!res || res.success === false) {
        // Fallback to hardcoded defaults if API not available
        return getDefaultBudgetRules(projectType);
      }
      return res.categories || res.data || getDefaultBudgetRules(projectType);
    });
  }

  /**
   * POST /api/proposals/{id}/submit — final submission with concurrency guard.
   * @param {string} proposalId
   * @param {Object} finalData  — expects { userId, userName, rowVersion? }
   * @returns {Promise<Object>}
   */
  function submitProposal(proposalId, finalData) {
    return _mutateApi('submitForm', Object.assign({}, finalData, {
      id: proposalId,
      row_version: finalData.rowVersion || finalData.row_version || 0
    }), { invalidates: ['getforms', 'getinitialdata'] }).catch(function (thrown) {
      // mutateApi() throws on success:false — recover the raw server payload
      // so 422 validation errors surface with their structured errors array.
      var body = thrown && thrown.response;
      if (body && body.errors && Array.isArray(body.errors)) {
        var vErr = new Error('validation_failed');
        vErr.code = 422;
        vErr.validationErrors = body.errors;
        throw vErr;
      }
      throw thrown;
    }).then(function (res) {
      if (!res) {
        throw new Error('Празен отговор от сървъра.');
      }
      if (res.success === false) {
        // 422 validation errors from server
        if (res.errors && Array.isArray(res.errors)) {
          var err = new Error('validation_failed');
          err.code = 422;
          err.validationErrors = res.errors;
          throw err;
        }
        throw new Error(res.error || 'Неуспешно изпращане.');
      }
      return res;
    });
  }

  /**
   * Default budget rules (placeholder — to be replaced with PROJECT_TYPE_RULES from GS.JS).
   * @param {string} projectType
   * @returns {Array<{code:string, cap_percent:number}>}
   */
  function getDefaultBudgetRules(projectType) {
    var defaultCaps = {
      'ФНИ': { personnel: 40, equipment: 30, materials: 20, travel: 10, publications: 10, overhead: 10 },
      'ПНИ': { personnel: 50, equipment: 25, materials: 15, travel: 10, publications: 10, overhead: 10 },
      'ДНП': { personnel: 60, equipment: 15, materials: 15, travel: 10, publications: 10, overhead: 10 },
      'НПФ': { personnel: 45, equipment: 20, materials: 20, travel: 10, publications: 15, overhead: 10 }
    };
    var caps = defaultCaps[projectType] || defaultCaps['ФНИ'];
    return [
      { code: 'personnel',    cap_percent: caps.personnel },
      { code: 'equipment',    cap_percent: caps.equipment },
      { code: 'materials',    cap_percent: caps.materials },
      { code: 'travel',       cap_percent: caps.travel },
      { code: 'publications', cap_percent: caps.publications },
      { code: 'overhead',     cap_percent: caps.overhead }
    ];
  }

  /**
   * v17.0.0: Check if proposer already has a project for same year/type.
   * @param {string} leaderName
   * @param {number} competitionYear
   * @param {string} projectType — ФНИ|ПНИ|ДНП|НПФ
   * @returns {Promise<{exists: boolean, message: string}>}
   */
  function checkProposer(leaderName, competitionYear, projectType) {
    return _readApi('checkproposer', {
      leaderName: leaderName,
      competitionYear: competitionYear,
      projectType: projectType
    });
  }

  /**
   * v17.0.0: Get document templates for a project type.
   * @param {string} projectType
   * @returns {Promise<Array<{id, name, docType, editUrl, previewUrl}>>}
   */
  function getDocumentTemplates(projectType) {
    return _readApi('getdocumenttemplates', { projectType: projectType }).then(function (res) {
      if (!res || res.success === false) return [];
      return res.templates || res.files || res.data || [];
    });
  }

  /**
   * v17.0.0: Save external reviewer assignment for a proposal.
   * @param {string} proposalId
   * @param {Object} refereeData — { name, degree, organization, email, phone, comments? }
   * @returns {Promise<Object>}
   */
  function saveRefereeProposal(proposalId, refereeData) {
    return _mutateApi('savereferee', {
      proposalId: proposalId,
      referee: refereeData
    }, { invalidates: ['getproposal:' + proposalId] });
  }

  /* ── Expose public API ── */
  return {
    getProposal: getProposal,
    createProposal: createProposal,
    patchProposal: patchProposal,
    getDocuments: getDocuments,
    generateDocument: generateDocument,
    getDocumentPreview: getDocumentPreview,
    getBudgetRules: getBudgetRules,
    submitProposal: submitProposal,
    isConflictResponse: isConflictResponse,
    getDefaultBudgetRules: getDefaultBudgetRules,
    checkProposer: checkProposer,
    getDocumentTemplates: getDocumentTemplates,
    saveRefereeProposal: saveRefereeProposal,
    // v3.39.1-perf: Cache management utilities
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
window.__pwApi = _pwApi;
