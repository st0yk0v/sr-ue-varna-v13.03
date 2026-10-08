/* ─── ADMIN ASSETS VIEW ───
 * One-stop admin browser for every file the system knows about:
 *   • Sheet-tracked attachments (per-application uploads + library docs)
 *   • Direct Drive enumeration of upload root + library folder
 * Backed by the GAS `adminassets` action.
 */

/* ─── DEFENSIVE FALLBACK STUBS for components.js globals ─── */
if(typeof window!=='undefined'&&!window.Badge){
  window.Badge=function _BadgeFallback(props){return React.createElement('span',{className:'badge '+(props&&props.status||'draft')},String((props&&props.status)||''));};
}
if(typeof window!=='undefined'&&!window.ApplicantCell){
  window.ApplicantCell=function _ApplicantCellFallback(props){return React.createElement('div',{},(props&&props.name)||'');};
}

/* ─── DOCUMENT STATUS BADGES (D7) ───
 * Roadmap Task 6: cover all document statuses with distinct color + icon.
 * Keyed by the status string the backend returns on a.form.status.
 * Also exported globally so other views (components.js) can reuse. */
var DOC_STATUS_BADGE_CLASS={
  pending:'badge draft',
  under_review:'badge review',
  scored:'badge info',
  ranked:'badge admin_passed',
  above_threshold:'badge approved',
  rejected:'badge returned',
  returned:'badge returned',
  needs_correction:'badge warn',
  resubmitted:'badge info'
};
var DOC_STATUS_LABEL={
  pending:'В очакване',
  under_review:'В рецензия',
  scored:'Оценен',
  ranked:'Класиран',
  above_threshold:'Над прага',
  rejected:'Отхвърлен',
  returned:'Върнат',
  needs_correction:'Нуждае се от корекция',
  resubmitted:'Предаден наново'
};
var docStatusBadgeClass=function(s){return DOC_STATUS_BADGE_CLASS[String(s||'').toLowerCase()]||'badge';};
var docStatusLabel=function(s){return DOC_STATUS_LABEL[String(s||'').toLowerCase()]||s||'—';};
if(typeof window!=='undefined'){
  window.DOC_STATUS_BADGE_CLASS=DOC_STATUS_BADGE_CLASS;
  window.DOC_STATUS_LABEL=DOC_STATUS_LABEL;
  window.DocStatusBadge=function(props){
    var s=props&&props.status;
    return React.createElement('span',{className:'badge '+(docStatusBadgeClass(s).replace('badge ',''))},
      React.createElement('i',{className:'fas '+(props&&props.icon||'fa-circle'),style:{marginRight:'.25rem',fontSize:'.6rem'}}),
      docStatusLabel(s));
  };
}

var AssetsView = ({ user, isAdmin }) => {
    if (!isAdmin) {
        return e('div', { className: 'card' }, e('div', { className: 'card-body' },
            e('div', { className: 'empty-state' },
                e('div', { className: 'empty-state-icon' }, e('i', { className: 'fas fa-lock' })),
                e('h4', null, 'Само за администратори'),
                e('p', null, 'Тази секция изисква администраторски права.')
            )
        ));
    }

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('erp:assets:tab') || 'attachments'; } catch (_) { return 'attachments'; } });
    const [query, setQuery] = useState('');
    const queryDeferred = useDeferredValue(query); // non-blocking asset filtering
    const [sourceFilter, setSourceFilter] = useState('all'); // upload | library | all
    const [zoneFilter, setZoneFilter] = useState('all');     // uploads | library | all

    useEffect(() => { try { sessionStorage.setItem('erp:assets:tab', tab); } catch (_) {} }, [tab]);

    const load = useCallback(async (force = false) => {
        setLoading(true);
        setError(null);
        try {
            const res = await api('adminassets', { forceRefresh: !!force });
            if (!res || res.success === false) throw new Error(res?.error || 'Грешка при зареждане.');
            setData(res);
        } catch (err) {
            setError(err.message || 'Неизвестна грешка.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(false); }, [load]);

    const summary = data?.summary || {};
    const attachments = data?.attachments || [];
    const driveAssets = data?.driveAssets || [];

    const filteredAttachments = useMemo(() => {
        const q = queryDeferred.trim().toLowerCase();
        return attachments.filter(a => {
            if (sourceFilter !== 'all' && a.source !== sourceFilter) return false;
            if (!q) return true;
            return [a.name, a.form?.title, a.form?.owner, a.form?.ownerName, a.form?.projectCode, a.fileId]
                .some(s => String(s || '').toLowerCase().indexOf(q) !== -1);
        });
    }, [attachments, queryDeferred, sourceFilter]);

    const filteredDrive = useMemo(() => {
        const q = queryDeferred.trim().toLowerCase();
        return driveAssets.filter(a => {
            if (zoneFilter !== 'all' && a.zone !== zoneFilter) return false;
            if (!q) return true;
            return [a.name, a.folderName, a.id, a.mimeType]
                .some(s => String(s || '').toLowerCase().indexOf(q) !== -1);
        });
    }, [driveAssets, queryDeferred, zoneFilter]);

    // D8 — infinite scroll paging (replaces the hard .slice(0,500) cap)
    var PAGE_SIZE = 100;
    var [attachPage, setAttachPage] = useState(1);
    var [drivePage, setDrivePage] = useState(1);
    var [loadingMore, setLoadingMore] = useState(false);
    var attachSentinelRef = useRef(null);
    var driveSentinelRef = useRef(null);

    // Reset paging whenever the filtered set changes (search/filter/tab).
    useEffect(function () { setAttachPage(1); }, [queryDeferred, sourceFilter]);
    useEffect(function () { setDrivePage(1); }, [queryDeferred, zoneFilter]);

    var pagedAttachments = filteredAttachments.slice(0, attachPage * PAGE_SIZE);
    var pagedDrive = filteredDrive.slice(0, drivePage * PAGE_SIZE);
    var hasMoreAttachments = pagedAttachments.length < filteredAttachments.length;
    var hasMoreDrive = pagedDrive.length < filteredDrive.length;

    useEffect(function () {
        if (!attachSentinelRef.current || !hasMoreAttachments) return;
        var obs = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) {
                setLoadingMore(true);
                setAttachPage(function (p) { return p + 1; });
                setLoadingMore(false);
            }
        }, { rootMargin: '200px' });
        obs.observe(attachSentinelRef.current);
        return function () { obs.disconnect(); };
    }, [hasMoreAttachments, attachPage]);

    useEffect(function () {
        if (!driveSentinelRef.current || !hasMoreDrive) return;
        var obs = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) {
                setLoadingMore(true);
                setDrivePage(function (p) { return p + 1; });
                setLoadingMore(false);
            }
        }, { rootMargin: '200px' });
        obs.observe(driveSentinelRef.current);
        return function () { obs.disconnect(); };
    }, [hasMoreDrive, drivePage]);

    const fmtBytes = b => {
        const n = Number(b || 0);
        if (!n) return '—';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    };

    const openPreview = url => { if (url) window.open(url, '_blank', 'noopener,noreferrer'); };
    // Download via the GAS proxy (bypasses drive.usercontent.google.com 500s).
    // Falls back to opening the legacy URL if the helper is unavailable.
    const _fidFrom = a => a && (a.fileId || a.id || (function () {
        var m = String(a.downloadUrl || a.previewLink || '').match(/[-\w]{25,}/);
        return m ? m[0] : '';
    })());
    const downloadAsset = a => {
        var fid = _fidFrom(a);
        if (fid && typeof window !== 'undefined' && typeof window._proxyDownload === 'function') {
            window._proxyDownload(fid, a.name, '');
            return;
        }
        if (a.downloadUrl) openPreview(a.downloadUrl);
    };

    return e('div', null,
        e('div', { className: 'page-top' },
            e('div', { className: 'page-top-left' },
                e('h2', null, e('i', { className: 'fas fa-database', style: { color: 'var(--gold)', marginRight: '.5rem' } }), 'Системни активи'),
                e('p', null, 'Всички файлове, прикачени към проектни предложения, и съдържание на Drive папките.')
            ),
            e('div', { className: 'page-top-actions' },
                e(RefreshButton, { loading, onClick: () => load(true) })
            )
        ),

        // Summary stat strip
        e('div', { className: 'card', style: { marginBottom: '1rem' } },
            e('div', { className: 'card-body', style: { padding: '.85rem 1rem' } },
                e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '1rem' } },
                    [
                        { label: 'Предложения', value: summary.forms || 0, icon: 'fa-file-alt', color: 'var(--info)' },
                        { label: 'Прикачени файлове', value: summary.attachments || 0, icon: 'fa-paperclip', color: 'var(--gold)' },
                        { label: 'Drive файлове', value: summary.driveFiles || 0, icon: 'fab fa-google-drive', color: 'var(--ok)' },
                        { label: 'Качени', value: summary.uploads || 0, icon: 'fa-upload', color: 'var(--review)' },
                        { label: 'Библиотека', value: summary.library || 0, icon: 'fa-folder', color: 'var(--primary)' },
                        { label: 'Общ обем', value: fmtBytes(summary.bytesTotal), icon: 'fa-hdd', color: 'var(--ink-3)' }
                    ].map((s, i) => e('div', { key: i, style: { flex: '1 1 140px', minWidth: 140, padding: '.6rem .75rem', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' } },
                        e('div', { style: { fontSize: '.68rem', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'flex', alignItems: 'center', gap: '.35rem' } },
                            e('i', { className: 'fas ' + s.icon, style: { color: s.color, fontSize: '.7rem' } }),
                            s.label
                        ),
                        e('div', { style: { fontSize: '1.25rem', fontWeight: 700, color: 'var(--ink-1)', marginTop: '.15rem' } }, s.value)
                    ))
                )
            )
        ),

        // Tab switch + search bar
        e('div', { className: 'card' + (loading ? ' card-loading' : ''), style: { position: 'relative' } },
            e('div', { className: 'loading-strip' + (loading ? ' active' : '') }),
            e('div', { className: 'card-header' },
                e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' } },
                    e('div', { className: 'tab-pills', style: { display: 'inline-flex', gap: '.25rem' } },
                                            e('button', { type:'button', className: 'btn btn-sm ' + (tab === 'attachments' ? 'btn-primary' : 'btn-outline'), onClick: () => setTab('attachments') },
                                                e('i', { className: 'fas fa-paperclip' }), ' Прикачени (', filteredAttachments.length, ')'),
                                            e('button', { type:'button', className: 'btn btn-sm ' + (tab === 'drive' ? 'btn-primary' : 'btn-outline'), onClick: () => setTab('drive') },
                                                e('i', { className: 'fab fa-google-drive' }), ' Drive (', filteredDrive.length, ')')
                    ),
                    e('input', {
                        type: 'search', placeholder: 'Търсене по име, собственик, ID…',
                        value: query, onChange: ev => setQuery(ev.target.value),
                        style: { flex: '1 1 220px', minWidth: 200, padding: '.4rem .65rem', fontSize: '.78rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)' }
                    }),
                    tab === 'attachments' && e('select', {
                        value: sourceFilter, onChange: ev => setSourceFilter(ev.target.value),
                        style: { padding: '.4rem .55rem', fontSize: '.78rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)' }
                    },
                        e('option', { value: 'all' }, 'Всички'),
                        e('option', { value: 'upload' }, 'Качени от кандидати'),
                        e('option', { value: 'library' }, 'От библиотеката')
                    ),
                    tab === 'drive' && e('select', {
                        value: zoneFilter, onChange: ev => setZoneFilter(ev.target.value),
                        style: { padding: '.4rem .55rem', fontSize: '.78rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)' }
                    },
                        e('option', { value: 'all' }, 'Всички зони'),
                        e('option', { value: 'uploads' }, 'Зона: качвания'),
                        e('option', { value: 'library' }, 'Зона: библиотека')
                    )
                )
            ),

            error && e('div', { style: { padding: '.75rem 1rem', background: 'var(--err-bg)', color: 'var(--err)', fontSize: '.8rem' } },
                e('i', { className: 'fas fa-exclamation-triangle' }), ' ', error
            ),

            tab === 'attachments' && (filteredAttachments.length === 0
                ? e('div', { className: 'card-body' }, e('div', { className: 'empty-state', role: 'status', 'aria-live': 'polite' },
                    e('div', { className: 'empty-state-icon' }, e('i', { className: 'fas fa-inbox' })),
                    e('h4', null, loading ? 'Зареждане…' : 'Няма прикачени файлове'),
                    e('p', null, 'Все още няма прикачени документи към проектни предложения.'),
                    !loading && e('button', { className: 'btn btn-outline btn-sm', style: { marginTop: '.5rem' }, onClick: () => load(true) },
                        e('i', { className: 'fas fa-sync', style: { marginRight: '.35rem' } }), 'Опитай отново')
                ))
                : e('div', { className: 'table-wrap' }, e('table', null,
                    e('thead', null, e('tr', null,
                        e('th', null, 'Файл'),
                        e('th', null, 'Тип'),
                        e('th', null, 'Размер'),
                        e('th', null, 'Предложение'),
                        e('th', null, 'Собственик'),
                        e('th', null, 'Статус'),
                        e('th', null, '')
                    )),
                    e('tbody', null, pagedAttachments.map((a, idx) => e('tr', { key: idx },
                        e('td', { 'data-label': 'Файл' },
                            e('div', { style: { display: 'flex', alignItems: 'center', gap: '.4rem' } },
                                e('i', { className: 'fas ' + (a.source === 'library' ? 'fa-book' : 'fa-paperclip'), style: { color: a.source === 'library' ? 'var(--gold)' : 'var(--ink-4)', fontSize: '.7rem' } }),
                                e('span', { style: { fontWeight: 600, fontSize: '.78rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }, title: a.name }, a.name || '—')
                            )
                        ),
                        e('td', { 'data-label': 'Тип' }, e('span', { style: { fontSize: '.7rem', color: 'var(--ink-4)' } }, a.source === 'library' ? 'Библиотека' : 'Качен')),
                        e('td', { 'data-label': 'Размер', className: 'mono' }, a.size || fmtBytes(a.sizeBytes)),
                        e('td', { 'data-label': 'Предложение' }, e('span', { style: { fontSize: '.74rem', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }, title: a.form?.title }, a.form?.title || '—')),
                        e('td', { 'data-label': 'Собственик' }, e('span', { style: { fontSize: '.72rem' } }, a.form?.ownerName || a.form?.owner || '—')),
                        e('td', { 'data-label': 'Статус' }, a.form?.status ? e(DocStatusBadge, { status: a.form.status }) : '—'),
                        e('td', { 'data-label': '' }, e('div', { style: { display: 'flex', gap: '.25rem' } },
                            a.previewLink && e('button', { className: 'btn btn-outline btn-sm', title: 'Преглед', onClick: () => openPreview(a.previewLink) }, e('i', { className: 'fas fa-eye' })),
                            a.downloadUrl && e('button', { className: 'btn btn-outline btn-sm', title: 'Изтегли', onClick: () => downloadAsset(a) }, e('i', { className: 'fas fa-download' }))
                        ))
                    ))),
                    hasMoreAttachments && e('tr', { ref: attachSentinelRef }, e('td', { colSpan: 7, style: { textAlign: 'center', fontSize: '.72rem', color: 'var(--ink-4)', padding: '.5rem' } }, loadingMore ? 'Зареждане…' : 'Превъртете за още'))
                ))
            ),

            tab === 'drive' && (filteredDrive.length === 0
                ? e('div', { className: 'card-body' }, e('div', { className: 'empty-state', role: 'status', 'aria-live': 'polite' },
                    e('div', { className: 'empty-state-icon' }, e('i', { className: 'fab fa-google-drive' })),
                    e('h4', null, loading ? 'Зареждане…' : 'Няма Drive активи'),
                    e('p', null, 'Drive Advanced Service може да не е активиран в скрипта или папките са празни.'),
                    !loading && e('button', { className: 'btn btn-outline btn-sm', style: { marginTop: '.5rem' }, onClick: () => load(true) },
                        e('i', { className: 'fas fa-sync', style: { marginRight: '.35rem' } }), 'Опитай отново')
                ))
                : e('div', { className: 'table-wrap' }, e('table', null,
                    e('thead', null, e('tr', null,
                        e('th', null, 'Име'),
                        e('th', null, 'Тип'),
                        e('th', null, 'Зона'),
                        e('th', null, 'Размер'),
                        e('th', null, 'Папка'),
                        e('th', null, 'Променено'),
                        e('th', null, '')
                    )),
                    e('tbody', null, pagedDrive.map((a, idx) => e('tr', { key: idx },
                        e('td', { 'data-label': 'Име' },
                            e('span', { style: { fontWeight: 600, fontSize: '.78rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }, title: a.name }, a.name || '—')
                        ),
                        e('td', { 'data-label': 'Тип' }, e('span', { style: { fontSize: '.7rem', color: 'var(--ink-4)' } }, a.typeLabel || '—')),
                        e('td', { 'data-label': 'Зона' }, e('span', { className: 'badge ' + (a.zone === 'library' ? 'approved' : 'draft'), style: { fontSize: '.66rem' } }, a.zone === 'library' ? 'Библиотека' : 'Качвания')),
                        e('td', { 'data-label': 'Размер', className: 'mono' }, a.size || fmtBytes(a.sizeBytes)),
                        e('td', { 'data-label': 'Папка' }, e('span', { style: { fontSize: '.72rem', color: 'var(--ink-4)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }, title: a.folderName }, a.folderName || '—')),
                        e('td', { 'data-label': 'Променено', className: 'mono', style: { fontSize: '.7rem' } }, a.modified ? fmtDate(a.modified) : '—'),
                        e('td', { 'data-label': '' }, e('div', { style: { display: 'flex', gap: '.25rem' } },
                            a.previewLink && e('button', { className: 'btn btn-outline btn-sm', title: 'Преглед', onClick: () => openPreview(a.previewLink) }, e('i', { className: 'fas fa-eye' })),
                            a.downloadUrl && e('button', { className: 'btn btn-outline btn-sm', title: 'Изтегли', onClick: () => downloadAsset(a) }, e('i', { className: 'fas fa-download' }))
                        ))
                    ))),
                    hasMoreDrive && e('tr', { ref: driveSentinelRef }, e('td', { colSpan: 7, style: { textAlign: 'center', fontSize: '.72rem', color: 'var(--ink-4)', padding: '.5rem' } }, loadingMore ? 'Зареждане…' : 'Превъртете за още'))
                ))
            )
        )
    );
};
