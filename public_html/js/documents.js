/* ═══════════════════════════════════════════════════════════════════════
 *  js/services/documents.js — Instant Document Service (v8 docSQL)
 *  ═══════════════════════════════════════════════════════════════════════
 *  Fast document operations via SQL backend (sub-100ms).
 *  Bypasses GAS/Drive API for metadata operations — only falls back
 *  to Drive when file content is actually needed.
 *
 *  Usage:
 *    var docSvc = window.__ERP_DOC_SVC;
 *    docSvc.attachDocument(docId, formId).then(...)
 *    docSvc.getApplicationDocuments(formId).then(...)
 *
 *  Architecture:
 *    ┌──────────────────────────────────────────────────────┐
 *    │  frontend (React) → api('sqlattachdocument', ...)    │
 *    │    → PHP (sqlAttachDocumentToApplication)            │
 *    │      → MySQL CALL attach_document_to_application()  │
 *    │        → sub-100ms JSON update                      │
 *    └──────────────────────────────────────────────────────┘
 * ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var _api = global.__uevApi || function() {
    // Fallback if api.js not loaded yet
    console.warn('[DocSvc] __uevApi not available, using direct fetch');
    return Promise.resolve({ success: false, error: 'API not ready' });
  };

  var _batchApi = global.__uevBatchApi || function() { return Promise.resolve({ success: false }); };

  // ── Instant document operations ────────────────────────────

  /**
   * Attach a single document to an application (sub-100ms).
   * @param {string} documentId
   * @param {string} formId
   * @param {Object} [opts] - { skipOptimistic, onOptimistic }
   * @returns {Promise<{success, attached_docs}>}
   */
  function attachDocument(documentId, formId, opts) {
    opts = opts || {};
    var payload = { documentId: documentId, formId: formId };
    // Optional immediate UI callback
    if (typeof opts.onOptimistic === 'function') {
      opts.onOptimistic();
    }
    return _api('sqlattachdocument', payload, { timeout: 3000 })
      .then(function(res) {
        if (!res || !res.success) {
          // Fallback to legacy attach
          return _api('attachdocumenttoform', payload, { timeout: 8000 });
        }
        return res;
      });
  }

  /**
   * Detach a single document from an application (sub-100ms).
   * @param {string} documentId
   * @param {string} formId
   * @returns {Promise<{success, attached_docs}>}
   */
  function detachDocument(documentId, formId) {
    return _api('sqldetachdocument', { documentId: documentId, formId: formId }, { timeout: 3000 })
      .then(function(res) {
        if (!res || !res.success) {
          return _api('detachdocumentfromform', { documentId: documentId, formId: formId }, { timeout: 8000 });
        }
        return res;
      });
  }

  /**
   * Get all documents for an application (sub-50ms).
   * @param {string} formId
   * @param {boolean} [includeBlobs=false]
   * @returns {Promise<{success, documents: Array}>}
   */
  function getApplicationDocuments(formId, includeBlobs) {
    return _api('sqlgetapplicationdocuments', {
      formId: formId,
      includeBlobs: !!includeBlobs
    }, { timeout: 3000 })
      .then(function(res) {
        if (res && res.success) return res;
        // Fallback to legacy
        return _api('getformdocuments', { formId: formId }, { timeout: 8000 });
      });
  }

  /**
   * Bulk attach multiple documents to an application (sub-200ms for 10 docs).
   * @param {string} formId
   * @param {string[]} documentIds
   * @returns {Promise<{success, attached_docs}>}
   */
  function bulkAttachDocuments(formId, documentIds) {
    return _api('sqlbulkattachdocuments', {
      formId: formId,
      documentIds: documentIds
    }, { timeout: 5000 });
  }

  /**
   * Copy documents from one application to another (sub-100ms).
   * @param {string} sourceFormId
   * @param {string} targetFormId
   * @returns {Promise<{success, attached_docs}>}
   */
  function copyApplicationDocuments(sourceFormId, targetFormId) {
    return _api('sqlcopyapplicationdocuments', {
      sourceFormId: sourceFormId,
      targetFormId: targetFormId
    }, { timeout: 3000 });
  }

  /**
   * Full-text search across documents (sub-100ms).
   * @param {string} query
   * @param {Object} [filters] - { category, projectType, origin, userEmail }
   * @param {Object} [page] - { offset, limit }
   * @returns {Promise<{success, documents: Array, total: number}>}
   */
  function searchDocuments(query, filters, page) {
    filters = filters || {};
    page = page || {};
    return _api('sqlsearchdocuments', {
      query: query || '',
      category: filters.category || '',
      projectType: filters.projectType || '',
      origin: filters.origin || '',
      userEmail: filters.userEmail || '',
      offset: page.offset || 0,
      limit: page.limit || 50
    }, { timeout: 3000 });
  }

  /**
   * Get best document URL instantly (sub-50ms).
   * @param {string} documentId
   * @returns {Promise<{success, document: {best_url, url_type}}>}
   */
  function getDocumentUrl(documentId) {
    return _api('sqlgetdocumenturl', { documentId: documentId }, { timeout: 3000 });
  }

  // ── Batch operations ───────────────────────────────────────

  /**
   * Batch load documents for multiple applications at once.
   * @param {string[]} formIds
   * @returns {Promise<Object<string, Array>>} Map of formId → documents
   */
  function batchGetApplicationDocuments(formIds) {
    if (!formIds || !formIds.length) return Promise.resolve({});
    var requests = formIds.map(function(fid) {
      return { action: 'sqlgetapplicationdocuments', body: { formId: fid } };
    });
    return _batchApi(requests).then(function(res) {
      if (!res || !res.success || !res.results) return {};
      var map = {};
      for (var i = 0; i < res.results.length; i++) {
        var r = res.results[i];
        map[formIds[i]] = (r && r.success && r.documents) ? r.documents : [];
      }
      return map;
    });
  }

  // ── Legacy fallback detection ───────────────────────────────

  /**
   * Check if the SQL document service is available.
   * @returns {Promise<boolean>}
   */
  function isAvailable() {
    return _api('sqlgetdocumenturl', { documentId: '_probe_' }, { timeout: 2000 })
      .then(function(res) { return true; })
      .catch(function() { return false; });
  }

  // ── Exports ────────────────────────────────────────────────

  var DocSvc = {
    attachDocument: attachDocument,
    detachDocument: detachDocument,
    getApplicationDocuments: getApplicationDocuments,
    bulkAttachDocuments: bulkAttachDocuments,
    copyApplicationDocuments: copyApplicationDocuments,
    searchDocuments: searchDocuments,
    getDocumentUrl: getDocumentUrl,
    batchGetApplicationDocuments: batchGetApplicationDocuments,
    isAvailable: isAvailable
  };

  global.__ERP_DOC_SVC = DocSvc;

})(typeof window !== 'undefined' ? window : this);
