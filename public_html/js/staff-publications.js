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

    // v13.01: Publications section hidden pending ORCID auth repair.
    // The backend was returning wrong-person publications; until the auth
    // backend is fixed, this panel renders only a notice and does not
    // fetch ORCID / CrossRef / Semantic Scholar / OpenAlex / DBLP.
    return e('div', { style: { background: 'var(--card,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 12, padding: '1rem', marginTop: '.5rem', boxShadow: '0 2px 8px rgba(0,0,0,.04)' } },
      e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' } },
        e('i', { className: 'fas fa-info-circle', style: { color: 'var(--primary)' } }),
        e('div', { style: { flex: 1 } },
          e('div', { style: { fontWeight: 700, fontSize: '.95rem' } }, 'Научни публикации'),
          e('div', { style: { fontSize: '.75rem', color: 'var(--ink-3)' } }, name || email)
        ),
        e('button', { className: 'btn btn-sm btn-outline', onClick: onClose, title: 'Затвори', style: { padding: '.25rem .5rem' } }, e('i', { className: 'fas fa-times' }))
      ),
      e('div', { style: { padding: '.75rem', background: 'var(--bg-2)', borderRadius: 8, textAlign: 'center', color: 'var(--ink-2)' } },
        e('i', { className: 'fas fa-ban', style: { display: 'block', fontSize: '1.2rem', marginBottom: '.4rem' } }),
        e('div', { style: { fontWeight: 600, marginBottom: '.3rem' } }, 'Публикациите са временно скрити'),
        e('div', { style: { fontSize: '.78rem' } }, 'ORCID автентикацията в задната част е нарушена и показва публикации на различни автори. Секцията остава скрита, докато проблемът бъде реши.')
      )
    );
  }

  global.StaffPublicationsPanel = global.React.memo(StaffPublicationsPanel);

})(window);