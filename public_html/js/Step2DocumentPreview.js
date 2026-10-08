(function () {
  'use strict';

  var React = window.React;

  function Step2DocumentPreview(props) {
    var doc = props.doc;
    var onClose = props.onClose;
    var onDownload = props.onDownload;

    var iframeRef = React.useRef(null);
    var [loading, setLoading] = React.useState(true);
    var [error, setError] = React.useState(false);

    React.useEffect(function () {
      function handleKeyDown(event) {
        if (event.key === 'Escape' && onClose) {
          onClose();
        }
      }
      document.addEventListener('keydown', handleKeyDown);
      return function () {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [onClose]);

    var previewUrl = '';
    var driveFallbackUrl = '';
    if (doc) {
      if (doc.url) {
        previewUrl = doc.url;
      } else if (doc.driveFileId) {
        // v12.51.14-gnative: MIME-aware preview. Native Google Docs/Sheets/
        // Slides/Drawings must use their type-specific docs.google.com/{type}/d/
        // {id}/preview URL — the generic drive.google.com/file/d/{id}/preview 404s
        // inside an iframe ("file does not exist"). Binary files keep the generic
        // URL. Parity with DocumentPreviewModal's _dpDirectEmbed.
        var _m = String(doc.mimeType || doc.mime_type || doc.fileType || '').toLowerCase();
        var _fid = doc.driveFileId;
        if (_m.indexOf('google-apps.document') >= 0) {
          previewUrl = 'https://docs.google.com/document/d/' + encodeURIComponent(_fid) + '/preview';
        } else if (_m.indexOf('google-apps.spreadsheet') >= 0) {
          previewUrl = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(_fid) + '/preview';
        } else if (_m.indexOf('google-apps.presentation') >= 0) {
          previewUrl = 'https://docs.google.com/presentation/d/' + encodeURIComponent(_fid) + '/preview';
        } else if (_m.indexOf('google-apps.drawing') >= 0) {
          previewUrl = 'https://docs.google.com/drawings/d/' + encodeURIComponent(_fid) + '/preview';
        } else {
          previewUrl = 'https://drive.google.com/file/d/' + encodeURIComponent(_fid) + '/preview';
        }
        driveFallbackUrl = 'https://drive.google.com/file/d/' + encodeURIComponent(_fid) + '/preview';
      }
    }

    function handleIframeLoad() {
      setLoading(false);
    }

    function handleIframeError() {
      setLoading(false);
      setError(true);
    }

    function handleDownload() {
      var downloadUrl = doc && doc.url ? doc.url : previewUrl;
      if (onDownload) {
        onDownload(doc, downloadUrl);
      } else if (downloadUrl) {
        window.open(downloadUrl, '_blank');
      }
    }

    function handleBackdropClick(event) {
      if (event.target === event.currentTarget && onClose) {
        onClose();
      }
    }

    var title = doc && doc.name ? doc.name : 'Document Preview';

    return React.createElement(
      'div',
      {
        className: 'step2-doc-preview-backdrop',
        onClick: handleBackdropClick
      },
      React.createElement(
        'div',
        { className: 'step2-doc-preview-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
        React.createElement(
          'div',
          { className: 'step2-doc-preview-header' },
          React.createElement('span', { className: 'step2-doc-preview-title' }, title),
          React.createElement(
            'button',
            {
              className: 'step2-doc-preview-close',
              onClick: onClose,
              type: 'button',
              'aria-label': 'Close preview'
            },
            '×'
          )
        ),
        React.createElement(
          'div',
          { className: 'step2-doc-preview-body' },
          loading && !error
            ? React.createElement(
                'div',
                { className: 'step2-doc-preview-loading' },
                React.createElement('div', { className: 'step2-doc-preview-spinner' }),
                React.createElement('span', null, 'Loading document…')
              )
            : null,
          error
            ? React.createElement(
                'div',
                { className: 'step2-doc-preview-error' },
                React.createElement('span', null, 'Failed to load document preview.'),
                React.createElement(
                  'button',
                  { className: 'step2-doc-preview-retry', onClick: function () {
                    // v12.51.14-gnative: rotate to the generic Drive preview as a
                    // fallback (the MIME-aware URL may have been wrong) and force a
                    // fresh iframe load via the key bump.
                    if (driveFallbackUrl && previewUrl !== driveFallbackUrl) {
                      previewUrl = driveFallbackUrl;
                    }
                    setError(false);
                    setLoading(true);
                  } },
                  'Retry'
                )
              )
            : null,
          previewUrl
            ? React.createElement('iframe', {
                key: error ? 'retry' : 'init',
                ref: iframeRef,
                className: loading ? 'step2-doc-preview-iframe step2-doc-preview-iframe--hidden' : 'step2-doc-preview-iframe',
                src: previewUrl,
                title: title,
                onLoad: handleIframeLoad,
                onError: handleIframeError
              })
            : React.createElement(
                'div',
                { className: 'step2-doc-preview-error' },
                React.createElement('span', null, 'No document URL available.')
              )
        ),
        React.createElement(
          'div',
          { className: 'step2-doc-preview-footer' },
          React.createElement(
            'button',
            {
              className: 'step2-doc-preview-download',
              onClick: handleDownload,
              type: 'button',
              disabled: !previewUrl
            },
            'Download'
          ),
          React.createElement(
            'button',
            {
              className: 'step2-doc-preview-cancel',
              onClick: onClose,
              type: 'button'
            },
            'Close'
          )
        )
      )
    );
  }

  // v12.49.78-globalshim: use window (always defined in browser) instead of
  // Node-only `global`, which throws "ReferenceError: global is not defined"
  // when this standalone step file loads. A global shim in index.html also
  // covers this, but window is the safe, self-contained choice here.
  window.__pwStep2DocumentPreview = Step2DocumentPreview;
})();