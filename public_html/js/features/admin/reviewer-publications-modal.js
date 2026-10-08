/* ═══════════════════════════════════════════════════════════════════════
 * ReviewerPublicationsModal — ORCID + Scopus publications viewer
 * ═══════════════════════════════════════════════════════════════════════
 * Shows all scientific publications for a reviewer with links to DOI,
 * ORCID profile, Scopus metrics. Uses the unified_publications API.
 *
 * Props: { reviewer: { email, name, orcid? }, onClose }
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var Fragment = React.Fragment;
  var useMemo = React.useMemo;

  var SOURCE_META = {
    orcid:   { label: 'ORCID',         color: '#a6ce39', icon: 'fab fa-orcid' },
    scopus:  { label: 'Scopus',         color: '#e9711c', icon: 'fas fa-database' },
    scholar: { label: 'Google Scholar', color: '#4285f4', icon: 'fab fa-google' },
    manual:  { label: 'Ръчно',          color: '#4a6cf7', icon: 'fas fa-pen' },
    other:   { label: 'Друг',           color: '#888',    icon: 'fas fa-circle' }
  };

  var CRLF = String.fromCharCode(13) + String.fromCharCode(10);

  function ReviewerPublicationsModal(props) {
    var reviewer = props.reviewer || {};
    var onClose = props.onClose || function () {};

    var dataState = useState(null);
    var data = dataState[0];
    var setData = dataState[1];

    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    var syncingState = useState(false);
    var syncing = syncingState[0];
    var setSyncing = syncingState[1];

    var queryState = useState('');
    var query = queryState[0];
    var setQuery = queryState[1];

    var sourceFilterState = useState('all');
    var sourceFilter = sourceFilterState[0];
    var setSourceFilter = sourceFilterState[1];

    // ── Fetch publications ──
    function fetchPubs(forceRefresh) {
      setLoading(true);
      setError(null);
      api('unified_publications', {
        email: reviewer.email,
        name: reviewer.name,
        orcid: reviewer.orcid || '',
        refresh: !!forceRefresh
      }).then(function (res) {
        if (res && res.success && res.data) {
          setData(res.data);
        } else {
          setError((res && res.error) || 'Грешка при зареждане на публикациите.');
        }
        setLoading(false);
      }).catch(function () {
        setError('Грешка при връзка със сървъра.');
        setLoading(false);
      });
    }

    useEffect(function () { fetchPubs(false); }, []);

    // ── Sync (force refresh) ──
    function handleSync() {
      if (syncing) return;
      setSyncing(true);
      api('unified_publications', {
        email: reviewer.email,
        name: reviewer.name,
        orcid: reviewer.orcid || '',
        refresh: true
      }).then(function (res) {
        if (res && res.success && res.data) {
          setData(res.data);
        }
        setSyncing(false);
      }).catch(function () {
        setSyncing(false);
      });
    }

    // ── Filtered publications ──
    var publications = useMemo(function () {
      if (!data || !Array.isArray(data.publications)) return [];
      var q = query.trim().toLowerCase();
      return data.publications.filter(function (p) {
        if (sourceFilter !== 'all' && (p.source || 'other') !== sourceFilter) return false;
        if (!q) return true;
        return [p.title, p.authors, p.journal, p.doi, p.year]
          .filter(Boolean).join(' ').toLowerCase().indexOf(q) > -1;
      });
    }, [data, query, sourceFilter]);

    // ── Available sources ──
    var sources = useMemo(function () {
      if (!data || !Array.isArray(data.publications)) return [];
      var srcs = {};
      data.publications.forEach(function (p) { srcs[p.source || 'other'] = true; });
      return Object.keys(srcs).sort();
    }, [data]);

    // ── Export CSV ──
    function exportCsv() {
      var rows = [['Title', 'Authors', 'Journal', 'Year', 'DOI', 'URL', 'Cited By', 'Source']];
      publications.forEach(function (p) {
        rows.push([p.title || '', p.authors || '', p.journal || '', p.year || '', p.doi || '', p.url || '', p.citedBy != null ? String(p.citedBy) : '', p.source || '']);
      });
      var esc = function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; };
      var csv = String.fromCharCode(0xFEFF) + rows.map(function (r) { return r.map(esc).join(';'); }).join(CRLF);
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'publications_' + (reviewer.email || 'reviewer') + '.csv'; a.click();
    }

    // ── Export BibTeX ──
    function exportBibtex() {
      var bib = publications.filter(function (p) { return p.title; }).map(function (p) {
        var key = (p.authors || 'ref').split(' ').pop() + (p.year || '');
        var entry = '@article{' + key + ', title={' + (p.title || '') + '}, author={' + (p.authors || '') + '}, journal={' + (p.journal || '') + '}, year={' + (p.year || '') + '}';
        if (p.doi) entry += ', doi={' + p.doi + '}';
        if (p.url) entry += ', url={' + p.url + '}';
        return entry + '}';
      }).join(CRLF + CRLF);
      var blob = new Blob([bib], { type: 'text/plain;charset=utf-8;' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'publications_' + (reviewer.email || 'reviewer') + '.bib'; a.click();
    }

    // ── Render a publication card ──
    function renderPubCard(p, idx) {
      var src = SOURCE_META[p.source || 'other'] || SOURCE_META.other;
      return e('div', { key: p.doi || idx, style: { background: 'var(--surface,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 10, padding: '1rem' } },
        e('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '.6rem', justifyContent: 'space-between' } },
          e('div', { style: { fontWeight: 600, lineHeight: 1.3, flex: 1 } }, p.title || '—'),
          e('span', { style: { flex: '0 0 auto', fontSize: '.68rem', fontWeight: 700, color: src.color, border: '1px solid ' + src.color, borderRadius: 20, padding: '.15rem .6rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '.3rem' } },
            e('i', { className: src.icon }), src.label)
        ),
        e('div', { style: { fontSize: '.82rem', color: 'var(--ink-3)', marginTop: '.4rem', display: 'grid', gap: '.2rem' } },
          p.authors ? e('div', null, e('i', { className: 'fas fa-user-edit', style: { marginRight: '.3rem', color: 'var(--ink-4)' } }), p.authors) : null,
          e('div', null, [p.journal, p.type, p.year].filter(Boolean).join(' · '))
        ),
        e('div', { style: { display: 'flex', gap: '.75rem', marginTop: '.6rem', flexWrap: 'wrap', alignItems: 'center' } },
          p.doi ? e('a', { href: 'https://doi.org/' + String(p.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, ''), target: '_blank', rel: 'noopener noreferrer', style: { fontSize: '.78rem', color: '#4a6cf7', display: 'flex', alignItems: 'center', gap: '.2rem' } }, e('i', { className: 'fas fa-link' }), 'DOI') : null,
          p.url && !p.doi ? e('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer', style: { fontSize: '.78rem', color: '#4a6cf7', display: 'flex', alignItems: 'center', gap: '.2rem' } }, e('i', { className: 'fas fa-external-link-alt' }), 'Линк') : null,
          p.citedBy != null ? e('span', { style: { fontSize: '.78rem', color: 'var(--ink-3)' } }, e('i', { className: 'fas fa-quote-right', style: { marginRight: '.25rem' } }), 'Цитирания: ', e('strong', null, String(p.citedBy))) : null
        )
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════

    return e('div', { className: 'modal-overlay', onClick: onClose, style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' } },
      e('div', { className: 'modal-card', onClick: function (ev) { ev.stopPropagation(); }, style: { background: 'var(--bg,#f8f9fa)', borderRadius: 14, width: '100%', maxWidth: 800, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.3)' } },

        // ── Header ──
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '.75rem', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border,#e0e0e0)', background: 'var(--card,#fff)' } },
          e('i', { className: 'fas fa-graduation-cap', style: { fontSize: '1.3rem', color: '#4a6cf7' } }),
          e('div', { style: { flex: 1 } },
            e('div', { style: { fontWeight: 700, fontSize: '1rem' } }, 'Научни публикации'),
            e('div', { style: { fontSize: '.78rem', color: 'var(--ink-3)' } }, reviewer.name || reviewer.email)
          ),
          e('button', { className: 'btn btn-sm btn-outline', onClick: onClose, title: 'Затвори' }, e('i', { className: 'fas fa-times' }))
        ),

        // ── Content ──
        e('div', { style: { flex: 1, overflow: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' } },

          // ── Loading ──
          loading ? e('div', { style: { textAlign: 'center', padding: '3rem', color: 'var(--ink-3)' } },
            e('i', { className: 'fas fa-spinner spin', style: { fontSize: '2rem', display: 'block', marginBottom: '.5rem' } }),
            'Зареждане на публикации от ORCID и Scopus…'
          ) : null,

          // ── Error ──
          error && !loading ? e('div', { style: { padding: '1rem', background: 'var(--err-bg,#fde8e8)', borderRadius: 8, color: 'var(--err,#c62828)' } },
            e('i', { className: 'fas fa-exclamation-circle', style: { marginRight: '.4rem' } }), error
          ) : null,

          // ── Data loaded ──
          !loading && !error && data ? e(Fragment, null,

            // ── Identity + Metrics bar ──
            e('div', { style: { display: 'flex', gap: '.75rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--card,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 10, padding: '.85rem 1rem' } },
              data.identity ? e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem' } },
                e('i', { className: 'fas fa-user-graduate', style: { color: '#4a6cf7' } }),
                e('div', null,
                  e('div', { style: { fontWeight: 600, fontSize: '.88rem' } }, data.identity.name || reviewer.name),
                  data.identity.orcid ? e('a', { href: 'https://orcid.org/' + data.identity.orcid, target: '_blank', rel: 'noopener', style: { fontSize: '.75rem', color: '#a6ce39' } }, e('i', { className: 'fab fa-orcid', style: { marginRight: '.2rem' } }), data.identity.orcid) : null
                )
              ) : null,
              data.metrics ? e('div', { style: { display: 'flex', gap: '.75rem', flexWrap: 'wrap', marginLeft: 'auto' } },
                data.metrics.hIndex != null ? e('span', { style: { fontSize: '.78rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: 20, padding: '.2rem .6rem', fontWeight: 700 } }, 'h-index: ', data.metrics.hIndex) : null,
                data.metrics.citedByCount != null ? e('span', { style: { fontSize: '.78rem', background: '#e3f2fd', color: '#1565c0', borderRadius: 20, padding: '.2rem .6rem', fontWeight: 700 } }, 'Цитирания: ', data.metrics.citedByCount) : null,
                data.metrics.documentCount != null ? e('span', { style: { fontSize: '.78rem', background: '#fff3e0', color: '#e65100', borderRadius: 20, padding: '.2rem .6rem', fontWeight: 700 } }, 'Документи: ', data.metrics.documentCount) : null
              ) : null
            ),

            // ── Actions bar ──
            e('div', { style: { display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' } },
              e('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } },
                e('button', { className: 'btn btn-outline btn-sm', onClick: handleSync, disabled: syncing }, e('i', { className: 'fas fa-sync' + (syncing ? ' spin' : '') }), ' Синхронизирай'),
                e('button', { className: 'btn btn-outline btn-sm', onClick: exportCsv, disabled: publications.length === 0 }, e('i', { className: 'fas fa-file-csv' }), ' CSV'),
                e('button', { className: 'btn btn-outline btn-sm', onClick: exportBibtex, disabled: publications.length === 0 }, e('i', { className: 'fas fa-quote-right' }), ' BibTeX')
              ),
              data && data.sources && data.sources.scopus == null ?
                e('span', { style: { fontSize: '.72rem', color: 'var(--ink-4)', fontStyle: 'italic' } }, e('i', { className: 'fas fa-info-circle', style: { marginRight: '.2rem' } }), 'Scopus не е конфигуриран — само ORCID') : null
            ),

            // ── Filters ──
            publications.length > 0 ? e('div', { style: { display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' } },
              e('input', { className: 'form-input', type: 'search', placeholder: 'Търсене по заглавие, автор, списание…', value: query, onChange: function (ev) { setQuery(ev.target.value); }, style: { flex: '1 1 200px' } }),
              e('select', { className: 'form-input', value: sourceFilter, onChange: function (ev) { setSourceFilter(ev.target.value); }, style: { flex: '0 0 auto' } },
                e('option', { value: 'all' }, 'Всички източници'),
                sources.map(function (s) { var m = SOURCE_META[s] || SOURCE_META.other; return e('option', { key: s, value: s }, m.label); })
              ),
              (query || sourceFilter !== 'all') ? e('button', { className: 'btn btn-sm btn-outline', onClick: function () { setQuery(''); setSourceFilter('all'); } }, e('i', { className: 'fas fa-times' }), ' Изчисти') : null
            ) : null,

            // ── Empty state ──
            !loading && !error && data && publications.length === 0 ? e('div', { style: { textAlign: 'center', padding: '2rem', color: 'var(--ink-3)', background: 'var(--surface,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 10 } },
              e('i', { className: 'fas fa-book-open', style: { fontSize: '2rem', display: 'block', marginBottom: '.5rem' } }),
              'Няма намерени публикации.',
              e('div', { style: { marginTop: '.5rem', fontSize: '.78rem' } }, 'Натиснете „Синхронизирай“, за да заредите данни от ORCID/Scopus.')
            ) : null,

            // ── Publications list ──
            publications.length > 0 ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: '.6rem' } },
              publications.map(function (p, idx) { return renderPubCard(p, idx); })
            ) : null,

            // ── Footer summary ──
            publications.length > 0 ? e('div', { style: { fontSize: '.72rem', color: 'var(--ink-4)', textAlign: 'center', padding: '.5rem' } },
              data && data.lastSynced ? e('span', null, 'Синхронизирано: ', String(data.lastSynced).replace('T', ' ').substring(0, 16)) : null
            ) : null
          ) : null
        ),
      ),
    );
  }

  global.ReviewerPublicationsModal = React.memo(ReviewerPublicationsModal);

})(window);
