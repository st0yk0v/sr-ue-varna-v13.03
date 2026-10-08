/* ═══════════════════════════════════════════════════════════════════════
 * reviewer-publications.js — Admin Reviewer Publications Tab
 * ═══════════════════════════════════════════════════════════════════════
 * Displays all reviewers with their scientific publications in a
 * searchable, filterable list with CSV/BibTeX export.
 *
 * Props: { user: { email, name, ... } }
 * API:   api('getreviewerpublications', {...})  -> { success, reviewers: [...] }
 *        api('syncallreviewerpublications', {...}) -> { success, synced, total }
 *
 * Each reviewer entry: { email, name, orcid, works: [...] }
 * Each work entry: { title, authors, journal, year, doi, cited_by, source, url }
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var Fragment = React.Fragment;
  var useMemo = React.useMemo;

  // ── Source badge config (matches ScientificProfileTab) ──
  var SOURCE_META = {
    orcid: { label: 'ORCID', color: '#a6ce39' },
    scopus: { label: 'Scopus', color: '#e9711c' },
    scholar: { label: 'Google Scholar', color: '#4285f4' },
    manual: { label: 'Ръчно', color: '#4a6cf7' },
    other: { label: 'Друг', color: '#888' }
  };

  var CRLF = String.fromCharCode(13) + String.fromCharCode(10);

  /**
   * ReviewerPublicationsTab — admin view of all reviewers' publications.
   * @param {Object} props
   * @param {Object} props.user — current admin user { email, name }
   * @returns {React.ReactElement}
   */
  function ReviewerPublicationsTab(props) {
    var user = props.user || {};

    // ── Data state ──
    var reviewersState = useState([]);
    var reviewers = reviewersState[0];
    var setReviewers = reviewersState[1];

    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    // ── Sync state ──
    var syncingState = useState(false);
    var syncing = syncingState[0];
    var setSyncing = syncingState[1];

    var syncProgressState = useState(null);
    var syncProgress = syncProgressState[0];
    var setSyncProgress = syncProgressState[1];

    // ── Filter state ──
    var queryState = useState('');
    var query = queryState[0];
    var setQuery = queryState[1];

    var sourceFilterState = useState('all');
    var sourceFilter = sourceFilterState[0];
    var setSourceFilter = sourceFilterState[1];

    var yearFromState = useState('');
    var yearFrom = yearFromState[0];
    var setYearFrom = yearFromState[1];

    var yearToState = useState('');
    var yearTo = yearToState[0];
    var setYearTo = yearToState[1];

    // ── UI state ──
    var expandedState = useState(function () { return {}; });
    var expanded = expandedState[0];
    var setExpanded = expandedState[1];

    // ── Fetch reviewers with publications ──
    function fetchReviewers() {
      setLoading(true);
      setError(null);
      api('getreviewerpublications', { isAdmin: true, authEmail: user.email }).then(function (res) {
        if (res && res.success && Array.isArray(res.reviewers)) {
          setReviewers(res.reviewers);
        } else if (res && res.success) {
          setReviewers([]);
        } else {
          setError((res && res.message) || 'Грешка при зареждане на публикациите.');
        }
        setLoading(false);
      }).catch(function () {
        setError('Грешка при връзка със сървъра.');
        setLoading(false);
      });
    }

    useEffect(function () {
      fetchReviewers();
    }, []);

    // ── Sync all reviewers ──
    function handleSyncAll() {
      if (syncing) return;
      setSyncing(true);
      setSyncProgress(null);
      api('syncallreviewerpublications', { isAdmin: true, authEmail: user.email }).then(function (res) {
        if (res && res.success) {
          setSyncProgress({
            synced: res.synced || 0,
            total: res.total || 0,
            message: 'Синхронизирани са ' + (res.synced || 0) + ' от ' + (res.total || 0) + ' рецензенти.'
          });
          // Refresh the list after sync
          fetchReviewers();
        } else {
          setSyncProgress({ error: (res && res.message) || 'Грешка при синхронизация.' });
        }
        setSyncing(false);
      }).catch(function () {
        setSyncProgress({ error: 'Грешка при връзка със сървъра.' });
        setSyncing(false);
      });
    }

    // ── Toggle reviewer expansion ──
    function toggleReviewer(email) {
      setExpanded(function (prev) {
        var next = Object.assign({}, prev);
        next[email] = !next[email];
        return next;
      });
    }

    // ── Expand / collapse all ──
    function expandAll() {
      var all = {};
      reviewers.forEach(function (r) { all[r.email] = true; });
      setExpanded(all);
    }

    function collapseAll() {
      setExpanded({});
    }

    // ── Filter works for a reviewer ──
    function filterWorks(works) {
      var q = query.trim().toLowerCase();
      return works.filter(function (w) {
        // Source filter
        if (sourceFilter !== 'all' && (w.source || 'other') !== sourceFilter) return false;
        // Year range filter
        if (yearFrom && w.year && parseInt(w.year, 10) < parseInt(yearFrom, 10)) return false;
        if (yearTo && w.year && parseInt(w.year, 10) > parseInt(yearTo, 10)) return false;
        // Text search
        if (!q) return true;
        var haystack = [w.title, w.authors, w.journal, w.publication, w.doi, w.year]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.indexOf(q) > -1;
      });
    }

    // ── Compute totals ──
    var totals = useMemo(function () {
      var totalPapers = 0;
      reviewers.forEach(function (r) {
        var works = filterWorks(Array.isArray(r.works) ? r.works : []);
        totalPapers += works.length;
      });
      return { reviewers: reviewers.length, papers: totalPapers };
    }, [reviewers, query, sourceFilter, yearFrom, yearTo]);

    // ── Available sources for filter dropdown ──
    var availableSources = useMemo(function () {
      var srcs = {};
      reviewers.forEach(function (r) {
        (Array.isArray(r.works) ? r.works : []).forEach(function (w) {
          srcs[w.source || 'other'] = true;
        });
      });
      return Object.keys(srcs).sort();
    }, [reviewers]);

    // ── CSV export ──
    function exportCsv() {
      var rows = [['Reviewer', 'Email', 'Title', 'Authors', 'Journal', 'Year', 'DOI', 'URL', 'Cited By', 'Source']];
      reviewers.forEach(function (r) {
        var works = filterWorks(Array.isArray(r.works) ? r.works : []);
        works.forEach(function (w) {
          rows.push([
            r.name || '', r.email || '',
            w.title || '', w.authors || '',
            w.journal || w.publication || '',
            w.year || '', w.doi || '',
            w.url || '', w.cited_by != null ? String(w.cited_by) : '',
            w.source || ''
          ]);
        });
      });
      var esc = function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; };
      var lines = rows.map(function (r) { return r.map(esc).join(';'); });
      var csv = String.fromCharCode(0xFEFF) + lines.join(CRLF);
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'reviewer_publications.csv';
      a.click();
    }

    // ── BibTeX export ──
    function exportBibtex() {
      var entries = [];
      reviewers.forEach(function (r) {
        var works = filterWorks(Array.isArray(r.works) ? r.works : []);
        works.forEach(function (w) {
          if (!w.title) return;
          var key = (w.authors || 'ref').split(' ').pop() + (w.year || '');
          var entry = '@article{' + key +
            ', title={' + (w.title || '') + '}' +
            ', author={' + (w.authors || '') + '}' +
            ', journal={' + (w.journal || w.publication || '') + '}' +
            ', year={' + (w.year || '') + '}';
          if (w.doi) entry += ', doi={' + w.doi + '}';
          if (w.url) entry += ', url={' + w.url + '}';
          entry += '}';
          entries.push(entry);
        });
      });
      var bib = entries.join(CRLF + CRLF);
      var blob = new Blob([bib], { type: 'text/plain;charset=utf-8;' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'reviewer_publications.bib';
      a.click();
    }

    // ── Render a single work card ──
    function renderWorkCard(w, idx) {
      var src = w.source || 'other';
      var meta = SOURCE_META[src] || SOURCE_META.other;
      return e('div', { key: w.id || idx, style: { background: 'var(--surface,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 8, padding: '.85rem 1rem' } },
        e('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '.5rem', justifyContent: 'space-between' } },
          e('div', { style: { fontWeight: 600, lineHeight: 1.3 } }, w.title || '—'),
          e('span', { style: { flex: '0 0 auto', fontSize: '.68rem', fontWeight: 700, color: meta.color, border: '1px solid ' + meta.color, borderRadius: 20, padding: '.1rem .5rem', whiteSpace: 'nowrap' } }, meta.label)
        ),
        e('div', { style: { fontSize: '.8rem', color: 'var(--ink-3)', marginTop: '.3rem', display: 'grid', gap: '.15rem' } },
          w.authors ? e('div', null, w.authors) : null,
          e('div', null, [w.journal || w.publication, w.year].filter(Boolean).join(' · '))
        ),
        e('div', { style: { display: 'flex', gap: '.75rem', marginTop: '.5rem', flexWrap: 'wrap', alignItems: 'center' } },
          w.doi ? e('a', { href: 'https://doi.org/' + String(w.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, ''), target: '_blank', rel: 'noopener noreferrer', style: { fontSize: '.78rem', color: '#4a6cf7' } }, e('i', { className: 'fas fa-link', style: { marginRight: '.2rem' } }), 'DOI') : null,
          w.url ? e('a', { href: w.url, target: '_blank', rel: 'noopener noreferrer', style: { fontSize: '.78rem', color: '#4a6cf7' } }, e('i', { className: 'fas fa-external-link-alt', style: { marginRight: '.2rem' } }), 'Линк') : null,
          w.cited_by != null && w.cited_by !== '' ? e('span', { style: { fontSize: '.78rem', color: 'var(--ink-3)', marginLeft: 'auto' } }, e('i', { className: 'fas fa-quote-right', style: { marginRight: '.25rem' } }), 'Цитирания: ', String(w.cited_by)) : null
        )
      );
    }

    // ═══════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════

    // Loading state
    if (loading && reviewers.length === 0) {
      return e('div', { style: { padding: '2rem', textAlign: 'center', color: 'var(--ink-3)' } },
        e('i', { className: 'fas fa-spinner spin', style: { fontSize: '1.5rem', display: 'block', marginBottom: '.5rem' } }),
        'Зареждане на публикациите на рецентентите…'
      );
    }

    // Error state
    if (error && reviewers.length === 0) {
      return e('div', { style: { padding: '1.5rem', color: 'var(--red)', textAlign: 'center' } },
        e('i', { className: 'fas fa-exclamation-circle', style: { fontSize: '1.5rem', display: 'block', marginBottom: '.5rem' } }),
        error,
        e('div', { style: { marginTop: '1rem' } },
          e('button', { className: 'btn btn-sm btn-outline', onClick: fetchReviewers }, e('i', { className: 'fas fa-sync' }), ' Опитай отново')

        )
      );
    }

    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: '1rem' } },

      // ── Header: totals + sync + export ──
      e('div', { style: { display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap', justifyContent: 'space-between' } },
        e('div', { style: { display: 'flex', gap: '1rem', alignItems: 'center' } },
          e('div', { style: { fontSize: '.85rem', color: 'var(--ink-3)' } },
            e('i', { className: 'fas fa-users', style: { marginRight: '.3rem', color: '#4a6cf7' } }),
            e('strong', null, totals.reviewers), ' рецензенти'
          )
        ),
        e('div', { style: { display: 'flex', gap: '.4rem', flexWrap: 'wrap' } },
          e('button', { className: 'btn btn-outline btn-sm', onClick: handleSyncAll, disabled: syncing },
            e('i', { className: 'fas fa-sync' + (syncing ? ' spin' : '') }), ' Синхронизирай всички'
          ),
          e('button', { className: 'btn btn-outline btn-sm', onClick: exportCsv, disabled: totals.papers === 0 },
            e('i', { className: 'fas fa-file-csv' }), ' CSV'
          ),
          e('button', { className: 'btn btn-outline btn-sm', onClick: exportBibtex, disabled: totals.papers === 0 },
            e('i', { className: 'fas fa-quote-right' }), ' BibTeX'
          )
        )
      ),

      // ── Sync progress ──
      syncProgress ? e('div', {
        style: {
          padding: '.6rem 1rem',
          borderRadius: 8,
          background: syncProgress.error ? 'var(--err-bg,#fde8e8)' : 'var(--ok-bg,#e8f5e9)',
          color: syncProgress.error ? 'var(--err,#c62828)' : 'var(--ok,#2e7d32)',
          fontSize: '.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: '.4rem'
        }
      },
        e('i', { className: syncProgress.error ? 'fas fa-exclamation-triangle' : 'fas fa-check-circle' }),
        syncProgress.error || syncProgress.message
      ) : null,

      // ── Filters ──
      e('div', { style: { display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--card,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 10, padding: '.75rem' } },
        e('div', { style: { flex: '1 1 200px', position: 'relative' } },
          e('i', { className: 'fas fa-search', style: { position: 'absolute', left: '.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', fontSize: '.8rem' } }),
          e('input', {
            className: 'form-input',
            type: 'search',
            placeholder: 'Търсене по заглавие, автор, списание, DOI…',
            value: query,
            onChange: function (ev) { setQuery(ev.target.value); },
            style: { paddingLeft: '1.8rem' }
          })
        ),
        e('select', {
          className: 'form-input',
          value: sourceFilter,
          onChange: function (ev) { setSourceFilter(ev.target.value); },
          style: { flex: '0 0 auto' }
        },
          e('option', { value: 'all' }, 'Всички източници'),
          availableSources.map(function (s) {
            var meta = SOURCE_META[s] || SOURCE_META.other;
            return e('option', { key: s, value: s }, meta.label);
          })
        ),
        e('input', {
          className: 'form-input',
          type: 'number',
          placeholder: 'От год.',
          value: yearFrom,
          onChange: function (ev) { setYearFrom(ev.target.value); },
          style: { flex: '0 0 80px' }
        }),
        e('input', {
          className: 'form-input',
          type: 'number',
          placeholder: 'До год.',
          value: yearTo,
          onChange: function (ev) { setYearTo(ev.target.value); },
          style: { flex: '0 0 80px' }
        }),
        (query || sourceFilter !== 'all' || yearFrom || yearTo) ?
          e('button', { className: 'btn btn-sm btn-outline', onClick: function () { setQuery(''); setSourceFilter('all'); setYearFrom(''); setYearTo(''); } },
            e('i', { className: 'fas fa-times' }), ' Изчисти'
          ) : null
      ),

      // ── Expand/Collapse all ──
      reviewers.length > 0 ? e('div', { style: { display: 'flex', gap: '.4rem', justifyContent: 'flex-end' } },
        e('button', { className: 'btn btn-sm btn-link', onClick: expandAll, style: { fontSize: '.75rem' } }, e('i', { className: 'fas fa-expand-alt' }), ' Разгъни всички'),
        e('button', { className: 'btn btn-sm btn-link', onClick: collapseAll, style: { fontSize: '.75rem' } }, e('i', { className: 'fas fa-compress-alt' }), ' Сгъни всички')
      ) : null,

      // ── Empty state ──
      reviewers.length === 0 ? e('div', {
        style: { padding: '2rem', textAlign: 'center', color: 'var(--ink-3)', background: 'var(--surface,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 8 }
      },
        e('i', { className: 'fas fa-users-slash', style: { fontSize: '2rem', display: 'block', marginBottom: '.5rem' } }),
        'Няма намерени рецензенти.',
        e('div', { style: { marginTop: '.75rem', fontSize: '.78rem' } }, 'Натиснете „Синхронизирай всички“, за да заредите данните.')
      ) : null,

      // ── Reviewer list ──
      reviewers.map(function (r) {
        var works = filterWorks(Array.isArray(r.works) ? r.works : []);
        var isExpanded = !!expanded[r.email];
        // Hide reviewers with no matching works when filters active
        if ((query || sourceFilter !== 'all' || yearFrom || yearTo) && works.length === 0) return null;

        return e('div', { key: r.email, style: { background: 'var(--card,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 10, overflow: 'hidden' } },
          // Reviewer header (clickable to expand)
          e('div', {
            onClick: function () { toggleReviewer(r.email); },
            style: { display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.85rem 1rem', cursor: 'pointer', userSelect: 'none', borderBottom: isExpanded ? '1px solid var(--border,#e0e0e0)' : 'none' }
          },
            e('i', { className: 'fas fa-chevron-' + (isExpanded ? 'down' : 'right'), style: { fontSize: '.7rem', color: 'var(--ink-4)', flex: '0 0 auto' } }),
            e('i', { className: 'fas fa-user-graduate', style: { color: '#4a6cf7', fontSize: '1rem' } }),
            e('div', { style: { flex: 1, minWidth: 0 } },
              e('div', { style: { fontWeight: 600 } }, r.name || r.email),
              e('div', { style: { fontSize: '.75rem', color: 'var(--ink-3)' } }, r.email)
            ),
            r.orcid ? e('a', {
              href: 'https://orcid.org/' + r.orcid,
              target: '_blank',
              rel: 'noopener noreferrer',
              onClick: function (ev) { ev.stopPropagation(); },
              style: { flex: '0 0 auto', fontSize: '.72rem', color: '#a6ce39' }
            }, e('i', { className: 'fab fa-orcid', style: { marginRight: '.2rem' } }), r.orcid) : null,
            e('span', { style: { flex: '0 0 auto', fontSize: '.72rem', fontWeight: 700, color: 'var(--ink-3)', background: 'var(--bg-2,#f0f0f0)', borderRadius: 20, padding: '.15rem .6rem' } }, works.length, ' публ.')
          ),
          // Expanded works list
          isExpanded ? e('div', { style: { padding: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem' } },
            works.length === 0 ? e('div', { style: { padding: '1rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '.82rem' } },
              e('i', { className: 'fas fa-inbox', style: { marginRight: '.3rem' } }),
              'Няма публикации, отговарящи на филтъра.'
            ) : works.map(function (w, idx) { return renderWorkCard(w, idx); })
          ) : null
        );
      }),

      // ── Footer summary ──
      !loading && reviewers.length > 0 ? e('div', { style: { padding: '.5rem .25rem', fontSize: '.72rem', color: 'var(--ink-4)', textAlign: 'center' } },
        e('i', { className: 'fas fa-info-circle' }),
        ' Показани: ', e('strong', null, totals.reviewers), ' рецензенти'
      ) : null
    );
  }

  // ── Export as global ──
  global.ReviewerPublicationsTab = React.memo(ReviewerPublicationsTab);

})(window);
