/**
 * TemplatesSection.js — "Шаблони" section for the Proposal Wizard.
 *
 * Shows the copyable Google-Doc application templates for the applicant's funding
 * program (ФНИ / ПНИ / ДНП / НПФ), sourced from that program's shared Drive
 * folder (see program-template-folders.js). Each template renders as a card with
 * a "Копирай в моя Drive" action that calls GAS `copyTemplateForUser` (already
 * wired in gas/GAS.GS). Falls back to the static `project_templates` rows when
 * the live folder listing is unavailable, so the UI never goes blank.
 */
var TemplatesSection = function (props) {
  var projectType = props.projectType || '';
  var folderId = (window.__PROGRAM_TEMPLATE_FOLDERS__ || {})[projectType] || '';
  var userEmail = (props.user && (props.user.email || props.user.userId)) || '';

  var _a = React.useState([]);
  var templates = _a[0];
  var setTemplates = _a[1];
  var _b = React.useState(true);
  var loading = _b[0];
  var setLoading = _b[1];
  var _c = React.useState('');
  var error = _c[0];
  var setError = _c[1];
  var _d = React.useState({});
  var copying = _d[0];
  var setCopying = _d[1];
  var _e = React.useState({});
  var copied = _e[0];
  var setCopied = _e[1];
  // T6 (EPIC-A): template search/filter by name.
  var _g = React.useState('');
  var query = _g[0];
  var setQuery = _g[1];
  // T5 (EPIC-A): drag-and-drop upload zone (graceful when no upload handler).
  var _h = React.useState(false);
  var dragOver = _h[0];
  var setDragOver = _h[1];
  var visible = React.useMemo(function () {
    if (!query.trim()) return templates;
    var q = query.trim().toLowerCase();
    return templates.filter(function (t) { return (t.name || '').toLowerCase().indexOf(q) !== -1; });
  }, [templates, query]);

  var onDropFile = React.useCallback(function (ev) {
    ev.preventDefault();
    setDragOver(false);
    var onUpload = props.onUploadTemplate;
    if (typeof onUpload === 'function' && ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) {
      onUpload(ev.dataTransfer.files[0], projectType);
    }
  }, [props.onUploadTemplate, projectType]);
  // folderUrl is authoritative from the API; fall back to the client registry.
  var _f = React.useState((window.__PROGRAM_TEMPLATE_FOLDER_URLS__ || {})[projectType] || '');
  var folderUrl = _f[0];
  var setFolderUrl = _f[1];

  var load = React.useCallback(function () {
    if (!folderId) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    var payload = { folderId: folderId, projectType: projectType };
    if (userEmail) payload.userId = userEmail;
    api('listFolderTemplates', payload)
      .then(function (res) {
        if (res && res.folderUrl) setFolderUrl(res.folderUrl);
        if (res && res.success && Array.isArray(res.templates) && res.templates.length) {
          setTemplates(res.templates);
        } else if (res && Array.isArray(res.fallback) && res.fallback.length) {
          setTemplates(res.fallback);
          setError('Показани са статичните шаблони (папката не е достъпна в момента).');
        } else {
          setTemplates([]);
        }
      })
      .catch(function () {
        setTemplates([]);
        setError('Неуспешно зареждане на шаблоните. Опитайте по-късно.');
      })
      .finally(function () { setLoading(false); });
  }, [folderId, projectType, userEmail]);

  React.useEffect(function () { load(); }, [load]);

  var copy = React.useCallback(function (tpl) {
    if (!tpl || !tpl.id) return;
    setCopying(function (c) { var n = Object.assign({}, c); n[tpl.id] = true; return n; });
    api('copyTemplateForUser', { templateId: tpl.id, projectType: projectType, name: tpl.name, userId: userEmail })
      .then(function (res) {
        if (res && res.success) {
          setCopied(function (c) { var n = Object.assign({}, c); n[tpl.id] = res.url || res.fileId || true; return n; });
        } else {
          setError((res && res.error) || 'Неуспешно копиране.');
        }
      })
      .catch(function (e) { setError((e && e.message) || 'Неуспешно копиране.'); })
      .finally(function () { setCopying(function (c) { var n = Object.assign({}, c); n[tpl.id] = false; return n; }); });
  }, [projectType]);

  if (!projectType) {
    return e('div', { className: 'pw-templates-empty', style: { padding: '1rem', color: 'var(--ink-4)', fontSize: '.8rem' } },
      'Изберете тип проект, за да видите наличните шаблони.');
  }
  if (!folderId) {
    return e('div', { className: 'pw-templates-empty', style: { padding: '1rem', color: 'var(--ink-4)', fontSize: '.8rem' } },
      'Няма конфигурирана папка с шаблони за „' + projectType + '“.');
  }

  return e('div', { className: 'pw-templates-section', onDragOver: function (ev) { ev.preventDefault(); setDragOver(true); }, onDragLeave: function () { setDragOver(false); }, onDrop: onDropFile },
    e('div', { className: 'pw-templates-head', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.5rem' } },
      e('h4', { style: { margin: 0, fontSize: '.85rem' } }, 'Шаблони за „' + projectType + '“'),
      folderUrl && e('a', { href: folderUrl, target: '_blank', rel: 'noopener noreferrer', className: 'pw-templates-folder-link', style: { fontSize: '.7rem' } },
        e('i', { className: 'fas fa-folder' }), ' Отвори папката')
    ),
    e('input', {
      type: 'search', value: query, placeholder: 'Търси шаблон…', 'aria-label': 'Търси шаблон',
      className: 'pw-input', style: { width: '100%', marginBottom: '.4rem', fontSize: '.74rem' },
      onChange: function (ev) { setQuery(ev.target.value); }
    }),
    dragOver && e('div', { className: 'pw-dropzone', style: { border: '2px dashed var(--brand-teal-deep)', borderRadius: 'var(--r-sm)', padding: '.6rem', marginBottom: '.4rem', fontSize: '.72rem', color: 'var(--brand-teal-deep)', textAlign: 'center' } }, 'Пуснете файл, за да го качите'),

    e('div', { className: 'pw-templates-head', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.5rem' } },
      e('h4', { style: { margin: 0, fontSize: '.85rem' } }, 'Шаблони за „' + projectType + '“'),
      folderUrl && e('a', { href: folderUrl, target: '_blank', rel: 'noopener noreferrer', className: 'pw-templates-folder-link', style: { fontSize: '.7rem' } },
        e('i', { className: 'fas fa-folder' }), ' Отвори папката')
    ),
    error && e('div', { className: 'pw-templates-note', style: { fontSize: '.7rem', color: 'var(--warn)', marginBottom: '.4rem' } }, error),
    loading
      ? e('div', { className: 'pw-templates-loading', style: { padding: '.75rem', color: 'var(--ink-4)', fontSize: '.78rem' } }, 'Зареждане на шаблоните…')
      : visible.length === 0
        ? e('div', { className: 'pw-templates-empty', style: { padding: '.75rem', color: 'var(--ink-4)', fontSize: '.78rem' } },
            templates.length === 0 ? 'Няма налични шаблони в тази папка.' : 'Няма шаблон, отговарящ на „' + query + '“.',
            folderUrl && e('div', { style: { marginTop: '.4rem' } },
              e('a', { href: folderUrl, target: '_blank', rel: 'noopener noreferrer', className: 'btn btn-sm btn-outline', style: { fontSize: '.7rem' } },
                e('i', { className: 'fas fa-folder' }), ' Отвори папката с шаблони')))
        : e('div', { className: 'pw-templates-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '.5rem' } },
            visible.map(function (tpl) {
              var isCopying = !!copying[tpl.id];
              var copiedVal = copied[tpl.id];
              return e('div', { key: tpl.id, className: 'pw-template-card', style: { border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '.6rem .7rem', background: 'var(--surface)' } },
                e('div', { className: 'pw-template-name', style: { fontSize: '.76rem', fontWeight: 600, marginBottom: '.15rem' } }, tpl.name || 'Шаблон'),
                e('div', { className: 'pw-template-type', style: { fontSize: '.62rem', color: 'var(--ink-4)', marginBottom: '.4rem' } }, (tpl.mimeType || '').replace('application/', '')),
                copiedVal
                  ? e('a', { href: (typeof copiedVal === 'string' ? copiedVal : tpl.url) || '#', target: '_blank', rel: 'noopener noreferrer', className: 'btn btn-success btn-sm', style: { fontSize: '.68rem', width: '100%' } },
                      e('i', { className: 'fas fa-check' }), ' Копирано — отвори')
                  : e('button', { type: 'button', className: 'btn btn-primary btn-sm', disabled: isCopying, onClick: function () { copy(tpl); }, style: { fontSize: '.68rem', width: '100%' } },
                      isCopying ? e(Fragment, null, e('i', { className: 'fas fa-spinner fa-spin' }), ' Копиране…') : e(Fragment, null, e('i', { className: 'fas fa-copy' }), ' Копирай в моя Drive'))
              );
            })
          )
  );
};

if (typeof window !== 'undefined') window.TemplatesSection = TemplatesSection;
