(function (global) {
  'use strict';

  var e = global.React.createElement;
  var Fragment = global.React.Fragment;
  var useState = global.React.useState;
  var useEffect = global.React.useEffect;
  var useMemo = global.React.useMemo;

  function StaffPublicationsPanel({ email, name, onClose }) {
    var _useState = useState(true),
        loading = _useState[0],
        setLoading = _useState[1];
    var _useState2 = useState(null),
        error = _useState2[0],
        setError = _useState2[1];
    var _useState3 = useState(null),
        data = _useState3[0],
        setData = _useState3[1];
    var _useState4 = useState(null),
        orcidConnection = _useState4[0],
        setOrcidConnection = _useState4[1];
    var _useState5 = useState(''),
        orcidInput = _useState5[0],
        setOrcidInput = _useState5[1];
    var _useState6 = useState(false),
        orcidSaving = _useState6[0],
        setOrcidSaving = _useState6[1];
    var _useState7 = useState(null),
        orcidSaveMsg = _useState7[0],
        setOrcidSaveMsg = _useState7[1];

    var fetchPublications = useMemo(function () {
      return function () {
        setLoading(true);
        setError(null);
        global.api('getscientificprofile', { email: email })
          .then(function (res) {
            setLoading(false);
            if (res && res.success) {
              setData(res.data);
            } else {
              setError((res && res.error) || 'Грешка при зареждане на публикациите.');
            }
          })
          .catch(function (err) {
            setLoading(false);
            setError(err.message || 'Мрежова грешка при зареждане.');
          });
      };
    }, [email]);

    var checkOrcidConnection = useMemo(function () {
      return function () {
        global.api('orcidstatus', { email: email })
          .then(function (res) {
            if (res && res.success) {
              setOrcidConnection(res.data);
            }
          })
          .catch(function () {});
      };
    }, [email]);

    useEffect(function () {
      fetchPublications();
      checkOrcidConnection();
    }, [fetchPublications, checkOrcidConnection]);

    var onOrcidConnected = useMemo(function () {
      return function () {
        setOrcidConnection({ connected: true, orcidId: null });
        fetchPublications();
      };
    }, [fetchPublications]);

    var saveOrcId = useMemo(function () {
      return function () {
        var id = orcidInput.trim();
        if (!id) return;
        setOrcidSaving(true);
        setOrcidSaveMsg(null);
        global.api('saveorcid', { email: email, orcidId: id })
          .then(function (res) {
            setOrcidSaving(false);
            if (res && res.success) {
              setOrcidSaveMsg('ORCID ID запазен успешно.');
              checkOrcidConnection();
              fetchPublications();
            } else {
              setOrcidSaveMsg((res && res.error) || 'Грешка при запазване.');
            }
          })
          .catch(function (err) {
            setOrcidSaving(false);
            setOrcidSaveMsg(err.message || 'Мрежова грешка.');
          });
      };
    }, [orcidInput, email, checkOrcidConnection, fetchPublications]);

    var renderSummary = useMemo(function () {
      return function () {
        if (!data) return null;
        var total = data.count || 0;
        var bySource = data.bySource || {};
        var orcidId = data.orcid || (orcidConnection && orcidConnection.orcidId) || null;
        return e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.75rem', fontSize: '.8rem', color: 'var(--ink-3)' } },
          e('span', { style: { background: 'var(--bg-2)', borderRadius: 12, padding: '.15rem .5rem' } }, 'Всего: ' + total),
          Object.keys(bySource).map(function (src) {
            return e('span', { key: src, style: { background: 'var(--bg-2)', borderRadius: 12, padding: '.15rem .5rem' } }, src + ': ' + bySource[src]);
          }),
          orcidId && e('span', { style: { background: '#a6ce39', color: '#000', borderRadius: 12, padding: '.15rem .5rem', fontWeight: 600 } }, 'ORCID: ' + orcidId)
        );
      };
    }, [data, orcidConnection]);

    var renderPubItem = useMemo(function () {
      return function (p, idx) {
        var title = p.title || p.preferredTitle || 'Без заглавие';
        var year = p.publicationYear || p.year || '';
        var type = p.type || p['publication-type'] || '';
        var doi = p.doi || p.externalIds?.doi || p.doiUrl ? p.doiUrl.replace('https://doi.org/', '') : '';
        var url = p.url || (doi ? 'https://doi.org/' + doi : null);
        var source = p.source || p['source-name'] || '';
        var citation = p.citationCount || p.citedBy || 0;
        return e('div', { key: idx, style: { padding: '.6rem .75rem', background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)' } },
          e('div', { style: { display: 'flex', gap: '.5rem', alignItems: 'flex-start' } },
            e('div', { style: { flex: 1, minWidth: 0 } },
              e('div', { style: { fontWeight: 600, fontSize: '.85rem', lineHeight: 1.3 } }, title),
              e('div', { style: { fontSize: '.75rem', color: 'var(--ink-3)', marginTop: '.2rem' } },
                (type ? '[' + type + '] ' : '') +
                (year ? year : '') +
                (source ? ' · ' + source : '') +
                (doi ? ' · DOI: ' + doi : '') +
                (citation ? ' · Цитирания: ' + citation : '')
              ),
              url && e('a', { href: url, target: '_blank', rel: 'noopener', style: { fontSize: '.75rem', marginTop: '.3rem', display: 'inline-block', color: 'var(--primary)' } }, 'Отвори ↗')
            )
          )
        );
      };
    }, []);

    return e('div', { style: { background: 'var(--card,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 12, padding: '1rem', marginTop: '.5rem', boxShadow: '0 2px 8px rgba(0,0,0,.04)' } },
      e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' } },
        e('i', { className: 'fas fa-graduation-cap', style: { color: '#4a6cf7', fontSize: '1.1rem' } }),
        e('div', { style: { flex: 1 } },
          e('div', { style: { fontWeight: 700, fontSize: '.95rem' } }, 'Научни публикации'),
          e('div', { style: { fontSize: '.75rem', color: 'var(--ink-3)' } }, name || email)
        ),
        e('button', { className: 'btn btn-sm btn-outline', onClick: onClose, title: 'Затвори', style: { padding: '.25rem .5rem' } }, e('i', { className: 'fas fa-times' }))
      ),
      loading ? e('div', { style: { textAlign: 'center', padding: '1.5rem', color: 'var(--ink-3)' } },
        e('i', { className: 'fas fa-spinner spin', style: { fontSize: '1.2rem', display: 'block', marginBottom: '.4rem' } }),
        'Зареждане от ORCID, CrossRef, Semantic Scholar, OpenAlex, DBLP, Google Scholar…'
      ) : null,
      error && !loading ? e('div', { style: { padding: '.75rem', background: 'var(--err-bg,#fde8e8)', borderRadius: 8, color: 'var(--err,#c62828)', fontSize: '.85rem' } },
        e('i', { className: 'fas fa-exclamation-circle', style: { marginRight: '.4rem' } }), error
      ) : null,
      !loading && !error && data ? e(Fragment, null,
        e('div', { style: { marginBottom: '1rem' } },
          e(global.ORCIDConnectionPanel, { email: email, name: name, onConnected: onOrcidConnected })
        ),
        renderSummary(),
        data.count === 0 ? e('div', { style: { textAlign: 'center', padding: '1.5rem', color: 'var(--ink-3)' } },
          e('i', { className: 'fas fa-book-open', style: { fontSize: '1.5rem', display: 'block', marginBottom: '.4rem' } }),
          'Няма намерени публикации.',
          e('div', { style: { marginTop: '.4rem', fontSize: '.75rem' } }, 'Натиснете „Опресни“ или проверете по-късно.')
        ) : null,
        data.publications && data.publications.length > 0 ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: '.5rem' } },
          data.publications.map(function (p, idx) { return renderPubItem(p, idx); })
        ) : null,
        !data.orcid && (!orcidConnection || !orcidConnection.connected) ? e('div', { style: { marginTop: '.75rem', padding: '.75rem', background: '#f8f9fa', border: '1px solid var(--border,#e0e0e0)', borderRadius: 8 } },
          e('div', { style: { fontWeight: 600, fontSize: '.85rem', marginBottom: '.4rem', display: 'flex', alignItems: 'center', gap: '.4rem' } },
            e('i', { className: 'fab fa-orcid', style: { color: '#a6ce39' } }),
            'Ръчно въвеждане на ORCID ID'
          ),
          e('div', { style: { fontSize: '.75rem', color: 'var(--ink-3)', marginBottom: '.5rem' } }, 'Ако имате ORCID ID, но не искате да свързвате профила, въведете ръчно:'),
          e('div', { style: { display: 'flex', gap: '.4rem' } },
            e('input', { type: 'text', placeholder: '0000-0000-0000-0000', value: orcidInput, onChange: function (ev) { setOrcidInput(ev.target.value); }, style: { flex: 1, padding: '.4rem .6rem', border: '1px solid var(--border,#e0e0e0)', borderRadius: 6, fontSize: '.85rem', fontFamily: 'monospace' }, disabled: orcidSaving }),
            e('button', { className: 'btn btn-sm btn-primary', onClick: saveOrcId, disabled: orcidSaving || !orcidInput.trim() },
              orcidSaving ? e('i', { className: 'fas fa-spinner spin' }) : e('i', { className: 'fas fa-save' }), ' Запази'
            )
          ),
          orcidSaveMsg ? e('div', { style: { marginTop: '.4rem', fontSize: '.75rem', color: orcidSaveMsg.includes('успешно') ? '#2e7d32' : '#c62828' } }, orcidSaveMsg) : null
        ) : null,
        e('div', { style: { marginTop: '.75rem', textAlign: 'center' } },
          e('button', { className: 'btn btn-outline btn-sm', onClick: fetchPublications, disabled: loading },
            e('i', { className: 'fas fa-sync' + (loading ? ' spin' : '') }), ' Опресни'
          )
        )
      ) : null
    );
  }

  global.StaffPublicationsPanel = global.React.memo(StaffPublicationsPanel);

})(window);