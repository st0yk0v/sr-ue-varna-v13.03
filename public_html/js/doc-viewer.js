/* ═══════════════════════════════════════════════════════════════════════════
 * DOC-VIEWER.JS — Legacy iframe inline document viewer
 * Adopted from yai.free.bg (v5.9.64-perf2)
 * 
 * Features:
 *   - Direct Google Drive embed: drive.google.com/file/d/{fid}/preview?rm=minimal
 *   - Native Google controls (edit, comment, share, fullscreen)
 *   - CSS-based zoom (transform:scale) with scroll wrapper
 *   - viewMode: 'iframe' | 'text' | 'empty'
 *   - Backdrop-tap close via _useOverlayClickGuard
 *   - Autosave sync to ERP (v12.54.54-uev)
 *   - iframe-aware (in-iframe class for nested embedding)
 * ═══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  // ── Constants ──
  var ZOOM_MIN = 0.5;
  var ZOOM_MAX = 2.5;
  var ZOOM_STEP = 0.1;
  var AUTOSAVE_INTERVAL = 30000; // 30 seconds

  // ── Build the direct Google Drive embed URL (legacy pattern) ──
  // Uses drive.google.com/file/d/{fid}/preview?rm=minimal for ALL Drive files.
  // ?rm=minimal hides the Drive toolbar — no "Open in new tab" / "Download" UI.
  // The /preview path also cannot be flipped to /edit by URL manipulation.
  function driveEmbedUrl(doc) {
    var fid = doc.driveId || doc.fileId || (!String(doc.id || '').startsWith('s') ? doc.id : null);
    if (!fid) return null;
    return 'https://drive.google.com/file/d/' + encodeURIComponent(fid) + '/preview?rm=minimal';
  }

  // ── Build the direct Google Edit URL (for edit mode toggle) ──
  function driveEditUrl(doc) {
    var fid = doc.driveId || doc.fileId || (!String(doc.id || '').startsWith('s') ? doc.id : null);
    if (!fid) return null;
    return 'https://docs.google.com/document/d/' + encodeURIComponent(fid) + '/edit?usp=drivesdk';
  }

  // ── Determine if document has embedable Drive content ──
  function canEmbed(doc) {
    return !!driveEmbedUrl(doc);
  }

  // ── Determine if document has text content for fallback ──
  function hasTextContent(doc) {
    return !!(doc.content && doc.content.length > 0);
  }

  // ── Get the hardened preview link from backend ──
  function getPreviewLink(doc) {
    return doc.previewLink || doc.preview_link || '';
  }

  // ── Get webViewLink (opens in Google Docs/Drive native UI) ──
  function getWebViewLink(doc) {
    return doc.webViewLink || doc.web_view_link || '';
  }

  // ── Open document in new tab (fallback) ──
  function openInNewTab(doc) {
    var url = getPreviewLink(doc) || getWebViewLink(doc) || driveEmbedUrl(doc) || '';
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return true;
    }
    if (doc.downloadUrl) {
      window.open(doc.downloadUrl, '_blank');
      return true;
    }
    return false;
  }

  // ── Sync document content from Google Drive back to ERP ──
  function syncDocumentFromDrive(doc, content) {
    if (!doc || !doc.id) return Promise.resolve({ success: false, error: 'no_doc_id' });

    return fetch('database/api.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncdocumentfromdrive',
        docId: doc.id,
        content: content || '',
        timestamp: Date.now()
      })
    }).then(function(res){ return res.json() })
      .then(function(data){
        if (data.success) {
          console.log('[autosave] Synced doc ' + doc.id + ' to ERP');
        } else {
          console.warn('[autosave] Sync failed:', data.error);
        }
        return data;
      })
      .catch(function(err){
        console.warn('[autosave] Network error:', err);
        return { success: false, error: err.message };
      });
  }

  // ── Expose public API ──
  global.DocViewer = {
    driveEmbedUrl: driveEmbedUrl,
    driveEditUrl: driveEditUrl,
    canEmbed: canEmbed,
    hasTextContent: hasTextContent,
    getPreviewLink: getPreviewLink,
    getWebViewLink: getWebViewLink,
    openInNewTab: openInNewTab,
    syncDocumentFromDrive: syncDocumentFromDrive,
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
    ZOOM_STEP: ZOOM_STEP,
    AUTOSAVE_INTERVAL: AUTOSAVE_INTERVAL
  };

  console.log('[doc-viewer] Legacy iframe viewer loaded (v12.54.54-uev)');

})(typeof window !== 'undefined' ? window : this);
