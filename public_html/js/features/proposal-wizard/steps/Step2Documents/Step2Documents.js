/* ═══════════════════════════════════════════════════════════════════════
 * Step2Documents.js — Стъпка 2: Подготовка на документи
 * ═══════════════════════════════════════════════════════════════════════
 * Props: { state: Step2State, validation: ValidationResult,
 *          onFieldChange: (field, value) => void,
 *          onGenerateDocument: (doc) => Promise,
 *          onUploadFile: (doc) => void,
 *          proposalId: string }
 *
 * Key design principles from spec:
 *   - NO auto-loaded iframe on step render
 *   - Explicit "Преглед" button to open preview panel
 *   - Status-appropriate action buttons per spec status_actions
 *   - Preview panel handles load failure gracefully with BG message
 *
 * v12.30.0-perf: Added useMemo for document list processing,
 *                useCallback for handlers, React.memo for child components.
 * v13.0.0: Document requirements loaded from config/document-requirements.js
 *          per project type with Bulgarian names from ERP source docs.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useCallback = React.useCallback;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useMemo = React.useMemo;

  // ── T2 (EPIC-A): file-type → FontAwesome preview icon ──
  // Maps a document/file name to a FontAwesome glyph so every card shows a
  // recognizable icon even when the config didn't supply one.
  var _EXT_ICON = {
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙',
    pptx: '📙', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
    txt: '📄', md: '📄', csv: '📊', zip: '🗜️', rar: '🗜️',
    docx_g: '📘', sheet: '📗', slide: '📙'
  };
  function iconForFilename(name) {
    if (!name) return '📄';
    var m = /\.([a-z0-9]+)$/i.exec(String(name));
    var ext = m ? m[1].toLowerCase() : '';
    return _EXT_ICON[ext] || '📄';
  }

  // ── Unique ID generator for ARIA element associations ──
  var _idCounter = 0;
  function useId(prefix) {
    _idCounter += 1;
    return prefix + '-' + _idCounter;
  }

  // Status labels (Bulgarian)
  var STATUS_LABELS = {
    missing: 'Липсва',
    draft_needed: 'Изисква довършване',
    generated: 'Генериран',
    uploaded: 'Качен',
    error: 'Грешка'
  };

  // Status actions per spec
  var STATUS_ACTIONS = {
    missing: { primary_bg: 'Създай от шаблон', secondary_bg: 'Качи файл' },
    draft_needed: { primary_bg: 'Продължи попълването', secondary_bg: 'Генерирай от бюджетни данни' },
    generated: { primary_bg: 'Преглед', secondary_bg: 'Отвори в Drive' },
    uploaded: { primary_bg: 'Преглед', secondary_bg: 'Замени файл' },
    error: { primary_bg: 'Генерирай отново', secondary_bg: 'Качи ръчно' }
  };

  /**
   * Step 2 — Documents checklist: generate from template or upload,
   * preview, and track status per document type.
   * @param {Object} props
   * @param {Object} props.state — step2 state slice ({ documents: ProposalDocument[], projectType: string })
   * @param {Object} props.validation — { isValid, errors } for step 2
   * @param {Function} props.onFieldChange — (field, value) → dispatch EDIT_FIELD on step 2
   * @param {Function} [props.onGenerateDocument] — (docType) → generate from template
   * @param {Function} [props.onUploadFile] — (docType, file) → upload handler
   * @param {string|null} [props.proposalId] — draft id (required for generate/upload)
   * @param {Object} [props.step3Budget] — step3 slice for budget_annex readiness detection
   * @returns {React.ReactElement}
   */
  function Step2Documents(props) {
    var state = props.state || {};
    var validation = props.validation || { errors: [] };
    var onFieldChange = props.onFieldChange || function () {};
    var onGenerateDocument = props.onGenerateDocument;
    var onUploadFile = props.onUploadFile;
    var proposalId = props.proposalId;
    var step3Budget = props.step3Budget || {};

    // Get external reviewers from step3 (used for referee duplicate check)
    var externalReviewers = Array.isArray(step3Budget.external_reviewers) ? step3Budget.external_reviewers : [];
    var competitionYear = state.competition_year || new Date().getFullYear();

    // Get project type from state (defaults to ФНИ1)
    var projectType = state.projectType || 'ФНИ1';
    // Normalize e.g. 'ФНИ1' -> 'ФНИ' so the template folder map keys match.
    var baseType = (projectType || '').replace(/[0-9]+$/, '') || 'ФНИ';

    // Load document requirements from config
        var docRequirements = useMemo(function () {
          var req = global.__DOCUMENT_REQUIREMENTS__;
          if (req && req[projectType]) {
            return req[projectType];
          }
          // Fallback to empty if config not loaded
          return { required: [], optional: [] };
        }, [projectType]);

    // Check if budget data exists in step3 for budget_annex auto-detection
    var _budgetAvailable = Number(step3Budget.total_budget_field) > 0;
    var _budgetCategories = Array.isArray(step3Budget.budget_categories) ? step3Budget.budget_categories : [];

    // Initialize documents from state or from config
    var documents = useMemo(function () {
      var existingDocs = Array.isArray(state.documents) && state.documents.length > 0
        ? state.documents
        : null;

      if (existingDocs) {
              // Merge existing state with config (in case config changed)
              var configDocs = docRequirements.required.concat(docRequirements.optional);
              var merged = configDocs.map(function (cfgDoc) {
                var existing = existingDocs.find(function (d) { return d.id === cfgDoc.id || d.type === cfgDoc.id; });
                if (existing) {
                  return Object.assign({}, existing, {
                    name_bg: cfgDoc.label,
                    description_bg: cfgDoc.description,
                    icon: cfgDoc.icon,
                    required: docRequirements.required.some(function (r) { return r.id === cfgDoc.id; }),
                    templateDriveUrl: cfgDoc.templateDriveUrl
                  });
                }
                return {
                  id: cfgDoc.id,
                  type: cfgDoc.id,
                  name_bg: cfgDoc.label,
                  description_bg: cfgDoc.description,
                  icon: cfgDoc.icon,
                  required: docRequirements.required.some(function (r) { return r.id === cfgDoc.id; }),
                  status: 'missing',
                  source: docRequirements.required.some(function (r) { return r.id === cfgDoc.id; }) ? 'template_generated' : 'user_upload',
                  templateDriveUrl: cfgDoc.templateDriveUrl
                };
              });
              return merged;
            }

      // First load - create from config
            return docRequirements.required.concat(docRequirements.optional).map(function (cfgDoc) {
              return {
                id: cfgDoc.id,
                type: cfgDoc.id,
                name_bg: cfgDoc.label,
                description_bg: cfgDoc.description,
                icon: cfgDoc.icon,
                required: docRequirements.required.some(function (r) { return r.id === cfgDoc.id; }),
                status: 'missing',
                source: docRequirements.required.some(function (r) { return r.id === cfgDoc.id; }) ? 'template_generated' : 'user_upload',
                templateDriveUrl: cfgDoc.templateDriveUrl
              };
            });
    }, [state.documents, docRequirements, projectType]);

    // Preview state: which document has its preview panel open
    var _preview = useState(null);
    var previewDocId = _preview[0];
    var setPreviewDocId = _preview[1];

    // Preview loading state
    var _previewLoading = useState({});
    var previewLoading = _previewLoading[0];
    var setPreviewLoading = _previewLoading[1];

    // Preview error state
    var _previewError = useState(null);
    var previewError = _previewError[0];
    var setPreviewError = _previewError[1];

    // Generating state
    var _genState = useState({});
    var generating = _genState[0];
    var setGenerating = _genState[1];

    // Upload progress (0..100) + drag-over highlight, per document id
    var _upState = useState({});
    var uploadProgress = _upState[0];
    var setUploadProgress = _upState[1];

    // Refs to hidden file inputs per document id — used to trigger the native picker
    var fileInputRefs = useRef({});
    var _dragState = useState(null);
    var dragOverId = _dragState[0];
    var setDragOverId = _dragState[1];

    // Auto-detect budget_annex status from step3 budget data
    // If budget data exists but budget_annex is 'missing', suggest generating it
    documents = useMemo(function () {
      return documents.map(function (d) {
        if (d.type && d.type.indexOf('budget_annex') !== -1 && d.status === 'missing' && _budgetAvailable) {
          return Object.assign({}, d, {
            status: 'draft_needed',
            _canGenerateFromBudget: true,
            _budgetHint: 'Бюджетните данни от Стъпка 3 са налични. Генерирайте таблицата, за да импортирате сумите.'
          });
        }
        return d;
      });
    }, [documents, _budgetAvailable]);

    // Count ready documents
    var readyCount = documents.filter(function (d) {
      return d.status === 'generated' || d.status === 'uploaded';
    }).length;
    var requiredCount = documents.filter(function (d) { return d.required; }).length;
    var requiredReady = documents.filter(function (d) {
      return d.required && (d.status === 'generated' || d.status === 'uploaded');
    }).length;
    var optionalCount = documents.filter(function (d) { return !d.required; }).length;
    var optionalReady = documents.filter(function (d) {
      return !d.required && (d.status === 'generated' || d.status === 'uploaded');
    }).length;

    // ── ARIA live region for status announcements ──
    var _statusAnnounceRef = useRef(null);
    var _statusAnnounce = useState('');

    useEffect(function () {
      if (_statusAnnounce[0]) {
        var timer = setTimeout(function () {
          _statusAnnounce[1]('');
        }, 3000);
        return function () { clearTimeout(timer); };
      }
    }, [_statusAnnounce[0]]);

    function announceStatus(doc, newStatus) {
      var msg = doc.name_bg + ' се променина до ' + (STATUS_LABELS[newStatus] || newStatus);
      _statusAnnounce[1](msg);
    }

    function handlePrimaryAction(doc) {
      if (doc.status === 'missing' || doc.status === 'error') {
        // Generate from template
        if (typeof onGenerateDocument === 'function') {
          setGenerating(function (prev) {
            var next = {};
            Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
            next[doc.id] = true;
            return next;
          });
          onGenerateDocument(doc).then(function (res) {
            if (res && res.success) {
              var updatedDoc = {
                id: doc.id,
                type: doc.type,
                name_bg: doc.name_bg,
                required: doc.required,
                status: 'generated',
                source: 'template_generated',
                drive_file_id: res.drive_file_id || res.fileId || null,
                download_url: res.download_url || null,
                last_modified: new Date().toISOString()
              };
              _updateDocument(updatedDoc);
            } else {
              _updateDocument({
                id: doc.id,
                type: doc.type,
                name_bg: doc.name_bg,
                required: doc.required,
                status: 'error',
                error_message: (res && res.error) || 'Неуспешно генериране на документ.'
              });
            }
          }).catch(function (err) {
            _updateDocument({
              id: doc.id,
              type: doc.type,
              name_bg: doc.name_bg,
              required: doc.required,
              status: 'error',
              error_message: err && err.message || 'Неуспешно генериране.'
            });
          }).finally(function () {
            setGenerating(function (prev) {
              var next = {};
              Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
              delete next[doc.id];
              return next;
            });
          });
        }
      } else if (doc.status === 'generated' || doc.status === 'uploaded') {
        // Toggle preview (explicit click only)
        if (previewDocId === doc.id) {
          setPreviewDocId(null);
          setPreviewError(null);
        } else {
          setPreviewDocId(doc.id);
          setPreviewError(null);
          setPreviewLoading(function (prev) {
            var next = {};
            Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
            next[doc.id] = true;
            return next;
          });

          // Try to fetch preview URL
          var api = global.__pwApi;
          if (api && proposalId) {
            api.getDocumentPreview(proposalId, doc.id).then(function (previewRes) {
              setPreviewLoading(function (prev) {
                var next = {};
                Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
                delete next[doc.id];
                return next;
              });
              if (previewRes.preview_url) {
                doc._previewUrl = previewRes.preview_url;
                doc._previewError = null;
              } else {
                doc._previewUrl = null;
                doc._previewError = previewRes.error || 'Файлът не може да бъде зареден в момента.';
                setPreviewError(doc.id);
              }
            }).catch(function () {
              setPreviewLoading(function (prev) {
                var next = {};
                Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
                delete next[doc.id];
                return next;
              });
              doc._previewUrl = null;
              doc._previewError = 'Файлът не може да бъде зареден в момента.';
              setPreviewError(doc.id);
            });
          } else {
            // No API — use drive URL directly if available
            setPreviewLoading(function (prev) {
              var next = {};
              Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
              delete next[doc.id];
              return next;
            });
            // v12.27.0-404fix: Validate drive_file_id before constructing URL
            // to prevent docType IDs (like 'fnisections35') from creating
            // broken Google Docs iframe URLs (404).
            var _isValid = typeof window._isValidDriveFileId === 'function'
              ? window._isValidDriveFileId(doc.drive_file_id)
              : (doc.drive_file_id && doc.drive_file_id.length > 25);
            if (_isValid) {
              doc._previewUrl = 'https://docs.google.com/document/d/' + encodeURIComponent(doc.drive_file_id) + '/preview';
              doc._previewError = null;
            } else {
              doc._previewUrl = null;
              doc._previewError = 'Файлът не може да бъде зареден в момента. Опитайте да го отворите директно в Drive.';
              setPreviewError(doc.id);
            }
          }
        }
      } else if (doc.status === 'draft_needed') {
        // Open in Drive for editing
        if (doc.drive_file_id) {
          window.open('https://docs.google.com/document/d/' + encodeURIComponent(doc.drive_file_id) + '/edit', '_blank', 'noopener,noreferrer');
        }
      }
    }

    function handleSecondaryAction(doc) {
      var actions = STATUS_ACTIONS[doc.status] || STATUS_ACTIONS.missing;
      if (actions.secondary_bg === 'Качи файл' || actions.secondary_bg === 'Замени файл' || actions.secondary_bg === 'Качи ръчно') {
        // v3.39.1-upload-fix: Trigger the hidden file input directly instead of delegating
        // to parent's onUploadFile which creates a new input without onChange handler.
        var input = fileInputRefs.current[doc.id];
        if (input) {
          input.click();
        } else if (typeof onUploadFile === 'function') {
          // Fallback if ref not yet registered
          onUploadFile(doc);
        }
      } else if (actions.secondary_bg === 'Отвори в Drive') {
        if (doc.drive_file_id) {
          window.open('https://docs.google.com/document/d/' + encodeURIComponent(doc.drive_file_id) + '/edit', '_blank', 'noopener,noreferrer');
        }
      }
    }

    function _updateDocument(updatedDoc) {
      onFieldChange('documents', documents.map(function (d) {
        if (d.id === updatedDoc.id || d.type === updatedDoc.type) {
          return Object.assign({}, d, updatedDoc);
        }
        return d;
      }));
    }

    function handleOpenDrive(doc) {
      if (doc.drive_file_id) {
        window.open('https://docs.google.com/document/d/' + encodeURIComponent(doc.drive_file_id) + '/edit', '_blank', 'noopener,noreferrer');
      }
    }

    function handleRegenerate(doc) {
      if (typeof onGenerateDocument === 'function') {
        setGenerating(function (prev) {
          var next = {};
          Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
          next[doc.id] = true;
          return next;
        });
        onGenerateDocument(doc).then(function (res) {
          if (res && res.success) {
            _updateDocument({
              id: doc.id,
              type: doc.type,
              status: 'generated',
              drive_file_id: res.drive_file_id || res.fileId || null,
              download_url: res.download_url || null,
              last_modified: new Date().toISOString(),
              error_message: null
            });
          }
        }).catch(function (err) {
          _updateDocument({
            id: doc.id,
            status: 'error',
            error_message: err && err.message || 'Неуспешно генериране.'
          });
        }).finally(function () {
          setGenerating(function (prev) {
            var next = {};
            Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
            delete next[doc.id];
            return next;
          });
        });
      }
    }

    // ── Upload with progress (drag-and-drop + file picker) ──
    // onUploadFile may report progress via props.onUploadProgress(docId, pct).
    function handleFileSelected(doc, file) {
      if (!file) return;
      setUploadProgress(function (prev) {
        var next = {};
        Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
        next[doc.id] = 0;
        return next;
      });
      // Surface optimistic state to user immediately
      _updateDocument(Object.assign({}, doc, { status: 'draft_needed', _uploading: true }));
      if (typeof onUploadFile === 'function') {
        // Pass a progress callback if the handler supports it (3rd arg), else just fire.
        try {
          onUploadFile(doc, file, function (pct) {
            setUploadProgress(function (prev) {
              var next = {};
              Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
              next[doc.id] = Math.max(0, Math.min(100, pct | 0));
              return next;
            });
          });
        } catch (_) {
          // legacy handler signature (doc only)
          onUploadFile(doc);
        }
      }
    }

    function handleDragOver(doc, ev) { ev.preventDefault(); setDragOverId(doc.id); }
    function handleDragLeave(doc, ev) { ev.preventDefault(); if (dragOverId === doc.id) setDragOverId(null); }
    function handleDrop(doc, ev) {
      ev.preventDefault();
      setDragOverId(null);
      var dt = ev.dataTransfer;
      if (dt && dt.files && dt.files.length) handleFileSelected(doc, dt.files[0]);
    }

    // ── Bulk generate all missing/required documents ──
    var missingRequired = documents.filter(function (d) {
      return d.required && (d.status === 'missing' || d.status === 'error');
    });
    function handleGenerateAllMissing() {
      missingRequired.forEach(function (doc) {
        if (typeof onGenerateDocument === 'function' && !generating[doc.id]) {
          handlePrimaryAction(doc);
        }
      });
    }

    // ── Render a single document card (shared by both sections) ──
    function renderDocCard(doc) {
      var isPreviewOpen = previewDocId === doc.id;
      var actions = STATUS_ACTIONS[doc.status] || STATUS_ACTIONS.missing;
      var lastMod = '';
      if (doc.last_modified) {
        try {
          var d = new Date(doc.last_modified);
          lastMod = d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        } catch (_) { lastMod = doc.last_modified; }
      }
      var icon = doc.icon || iconForFilename(doc.name_bg || doc.type);
      var prog = uploadProgress[doc.id];
      var isUploading = prog !== undefined && prog < 100;
      var isDrag = dragOverId === doc.id;

      return e('div', { key: doc.id || doc.type, role: 'listitem' },
        e('div', {
          className: 'pw-doc-card pw-status-rail pw-status-rail-' + doc.status + (isDrag ? ' pw-doc-dragover' : ''),
          role: 'listitem',
          tabIndex: 0,
          onKeyDown: function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              handlePrimaryAction(doc);
            } else if (ev.key === 'ArrowRight') {
              if (isPreviewOpen) setPreviewDocId(null); else handlePrimaryAction(doc);
            }
          },
          onDragOver: function (ev) { handleDragOver(doc, ev); },
          onDragLeave: function (ev) { handleDragLeave(doc, ev); },
          onDrop: function (ev) { handleDrop(doc, ev); },
          'aria-label': doc.name_bg + ' - статус: ' + (STATUS_LABELS[doc.status] || doc.status) + (doc.required ? ', задължителен' : ', по избор')
        },
          e('div', { className: 'pw-doc-icon', 'aria-hidden': 'true' }, icon),
          e('div', { className: 'pw-doc-info' },
            e('div', { className: 'pw-doc-name' },
              doc.name_bg || doc.type,
              e('span', {
                className: 'pw-status-badge pw-status-' + doc.status,
                role: 'status',
                'aria-label': STATUS_LABELS[doc.status] || doc.status
              }, STATUS_LABELS[doc.status] || doc.status),
              doc.required ? e('span', { style: { color: 'var(--pw-error-600)', fontSize: 12, fontWeight: 400 }, 'aria-hidden': 'true' }, ' *') : null
            ),
            doc.description_bg ? e('div', { className: 'pw-doc-description', style: { fontSize: 12, color: 'var(--pw-neutral-500)', marginTop: 4 } }, doc.description_bg) : null,
            lastMod ? e('div', { className: 'pw-doc-meta' }, 'Последна промяна: ' + lastMod) : null,
            doc.status === 'error' && doc.error_message
              ? e('div', { className: 'pw-doc-meta', style: { color: 'var(--pw-error-600)' }, role: 'alert', 'aria-live': 'assertive' }, doc.error_message)
              : null,
            generating[doc.id]
              ? e('div', { className: 'pw-doc-meta', style: { color: 'var(--pw-navy-500)' }, 'aria-live': 'polite' }, 'Генериране...')
              : null,
            isUploading
              ? e('div', { className: 'pw-doc-upload', role: 'progressbar', 'aria-valuenow': prog, 'aria-valuemin': 0, 'aria-valuemax': 100 },
                  e('div', { className: 'pw-doc-upload-bar', style: { width: prog + '%' } }),
                  e('span', { className: 'pw-doc-upload-pct' }, prog + '%')
                )
              : null
          ),
          e('div', { className: 'pw-doc-actions' },
            actions.primary_bg ? e('button', {
              key: 'primary',
              className: 'pw-btn pw-btn-sm pw-btn-primary',
              onClick: function () { handlePrimaryAction(doc); },
              disabled: generating[doc.id],
              'aria-label': actions.primary_bg
            }, actions.primary_bg) : null,
            e('input', {
              key: 'file-' + doc.id,
              type: 'file',
              className: 'pw-doc-file-input',
              accept: '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg',
              style: { display: 'none' },
              ref: function (el) {
                if (el) fileInputRefs.current[doc.id] = el;
              },
              onChange: function (ev) {
                var f = ev.target.files && ev.target.files[0];
                handleFileSelected(doc, f);
                ev.target.value = '';
              }
            }),
            actions.secondary_bg ? e('button', {
              key: 'secondary',
              className: 'pw-btn pw-btn-sm pw-btn-outline-clay',
              onClick: function () { handleSecondaryAction(doc); },
              disabled: generating[doc.id],
              'aria-label': actions.secondary_bg
            }, actions.secondary_bg) : null
          )
        ),
        isPreviewOpen ? renderPreview(doc) : null
      );
    }

    function renderPreview(doc) {
      return e('div', { className: 'pw-preview-panel', key: 'preview-' + doc.id, role: 'region', 'aria-label': 'Преглед на ' + (doc.name_bg || doc.type) },
        previewLoading[doc.id]
          ? e('div', { style: { textAlign: 'center', padding: 40, color: 'var(--pw-neutral-500)' }, 'aria-live': 'polite' }, 'Зареждане на преглед...')
          : doc._previewUrl && !doc._previewError
            ? e('iframe', {
                className: 'pw-preview-iframe',
                src: doc._previewUrl,
                title: 'Преглед на ' + (doc.name_bg || doc.type),
                sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups',
                allowFullScreen: true
              })
            : e('div', { className: 'pw-preview-error' },
                e('div', { className: 'pw-preview-error-icon' }, '⚠'),
                e('div', { className: 'pw-preview-error-msg' },
                  doc._previewError || 'Файлът не може да бъде зареден в момента. Опитайте да го отворите директно в Drive или го генерирайте наново.'
                ),
                e('div', { className: 'pw-preview-error-actions' },
                  doc.drive_file_id ? e('button', {
                    className: 'pw-btn pw-btn-sm pw-btn-secondary',
                    onClick: function () { handleOpenDrive(doc); },
                    'aria-label': 'Отвори в Google Drive'
                  }, 'Отвори в Drive') : null,
                  e('button', {
                    className: 'pw-btn pw-btn-sm pw-btn-primary',
                    onClick: function () {
                      setPreviewError(null);
                      handleRegenerate(doc);
                    },
                    'aria-label': 'Опитай отново'
                  }, 'Опитай отново'),
                  e('button', {
                    className: 'pw-btn pw-btn-sm pw-btn-ghost',
                    onClick: function () { setPreviewDocId(null); },
                    'aria-label': 'Затвори прегледа'
                  }, 'Затвори')
                )
              )
      );
    }

    // ── Render ──
    return e('div', { className: 'pw-step2' },
      // aria-live region for validation error announcements
      e('div', {
        id: 'pw-step2-live-region',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        style: { position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }
      }, _statusAnnounce[0]),

      // ── Header: title + completion ring + bulk action ──
      e('div', { className: 'pw-step2-header' },
        e('div', { className: 'pw-step2-heading' },
          e('h2', { className: 'pw-step2-title' }, 'Подготовка на документи'),
          e('p', { className: 'pw-step2-sub' }, 'Генерирайте от шаблон или качете всеки документ. Задължителните трябва да са готови преди подаване.'),
          e('p', { className: 'pw-step2-project-type', style: { fontSize: 13, color: 'var(--pw-neutral-500)', marginTop: 8 } },
            'Вид проект: ', e('strong', null, projectType), ' — ',
            requiredCount, ' задължителни, ', optionalCount, ' по избор'
          )
        ),
        e('div', { className: 'pw-step2-head-right' },
          (requiredCount > 0) ? (function () {
            var pct = requiredCount ? Math.round((requiredReady / requiredCount) * 100) : 0;
            var R = 18, C = 2 * Math.PI * R;
            var off = C * (1 - pct / 100);
            return e('div', { className: 'pw-ring-wrap', title: requiredReady + ' от ' + requiredCount + ' задължителни готови' },
              e('svg', { className: 'pw-ring', width: 44, height: 44, viewBox: '0 0 44 44', 'aria-hidden': 'true' },
                e('circle', { className: 'pw-ring-bg', cx: 22, cy: 22, r: R, fill: 'none', strokeWidth: 4 }),
                e('circle', { className: 'pw-ring-fg', cx: 22, cy: 22, r: R, fill: 'none', strokeWidth: 4,
                  strokeDasharray: C, strokeDashoffset: off, transform: 'rotate(-90 22 22)' })
              ),
              e('span', { className: 'pw-ring-label' }, requiredReady + '/' + requiredCount)
            );
          })() : null,
          (missingRequired.length > 0) ? e('button', {
            className: 'pw-btn pw-btn-sm pw-btn-primary',
            onClick: function () { handleGenerateAllMissing(); },
            disabled: missingRequired.some(function (d) { return generating[d.id]; }),
            'aria-label': 'Генерирай всички липсващи задължителни документи'
          }, 'Генерирай липсващите (' + missingRequired.length + ')') : null

      // ── Templates section: copyable Google-Doc templates per funding program ──
      (typeof TemplatesSection !== 'undefined') && e(TemplatesSection, { projectType: baseType, user: user }),
        )
      ),

      // ── Sectioned document list ──
      e('div', { className: 'pw-doc-sections', role: 'list' },
        (function () {
          var requiredDocs = documents.filter(function (d) { return d.required; });
          var optionalDocs = documents.filter(function (d) { return !d.required; });

          var sections = [
            {
              key: 'req',
              label: 'Задължителни документи',
              count: requiredReady + '/' + requiredCount,
              items: requiredDocs
            },
            {
              key: 'opt',
              label: 'По избор',
              count: optionalReady + '/' + optionalCount,
              items: optionalDocs
            }
          ];
          return sections.map(function (sec) {
            if (!sec.items.length) return null;
            return e('div', { key: sec.key, className: 'pw-doc-section', role: 'group', 'aria-label': sec.label },
              e('div', { className: 'pw-doc-section-head' },
                e('span', { className: 'pw-doc-section-label' }, sec.label),
                e('span', { className: 'pw-doc-section-count' }, sec.count)
              ),
              e('div', { className: 'pw-doc-list', role: 'list' },
                sec.items.map(function (doc) { return renderDocCard(doc); })
              )
            );
          });
        })()
      ),

      // Referee duplicate check component (Step 2 Referee Check)
      (externalReviewers.length > 0) ? e(global.__pwStep2RefereeCheck, {
        referees: externalReviewers,
        competitionYear: competitionYear,
        projectType: projectType,
        onDuplicatesExist: function (hasDuplicates) {
          // Store duplicate status in state so it can be used for validation
          // The parent wizard will handle blocking submission
          window.__pwRefereeDuplicates = hasDuplicates;
        }
      }) : null,

      // Validation summary inline
      validation && validation.errors && validation.errors.length > 0
        ? e('div', { className: 'pw-validation-summary', style: { marginTop: 16 }, role: 'alert', 'aria-live': 'assertive' },
            e('div', { className: 'pw-validation-summary-title' }, 'Липсват задължителни документи'),
            validation.errors.map(function (err, idx) {
              return e('div', { key: idx, className: 'pw-validation-summary-item' }, err.message_bg);
            })
          )
        : null
    );
  }

  global.__pwStep2Documents = React.memo(Step2Documents);

})(window);