/* ════════════════════════════════════════════════════════════════════════
 *  PublicResultsView — UC-23
 *  ----------------------------------------------------------------------
 *  Anonymous, login-free page that lists published competition winners.
 *  Mounted by main.js when location.hash === '#/public-results' OR when
 *  the URL carries ?public=results — no Google sign-in required.
 *  Calls the GAS `getpublicresults` action (server returns only
 *  anonymisation-safe fields: title, code, area, score, rank).
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  if (typeof React === 'undefined' || typeof api === 'undefined') return;
  var e = React.createElement;
  var useState  = React.useState;
  var useEffect = React.useEffect;
  var useMemo   = React.useMemo;

  function PublicResultsView() {
    var s0 = useState({ loading: true, error: null, competitions: [] });
    var state = s0[0]; var setState = s0[1];
    var f0 = useState(''); var filter = f0[0]; var setFilter = f0[1];
    // Resolve the canonical parent-site URL from ERP_CONFIG. Falls back to
    // '/' when not configured (standalone hosting without an embedding parent).
    var siteUrl = (typeof window!=='undefined' && window.__ERP_SITE_URL) || '/';

    useEffect(function () {
      var alive = true;
      api('getpublicresults', {})
        .then(function (res) {
          if (!alive) return;
          if (!res || res.success !== true) {
            setState({ loading: false, error: (res && res.error) || 'Неуспешно зареждане', competitions: [] });
            return;
          }
          setState({ loading: false, error: null, competitions: Array.isArray(res.competitions) ? res.competitions : [] });
        })
        .catch(function (err) {
          if (!alive) return;
          setState({ loading: false, error: err && err.message || String(err), competitions: [] });
        });
      return function () { alive = false; };
    }, []);

    var visible = useMemo(function () {
      var q = String(filter || '').trim().toLowerCase();
      if (!q) return state.competitions;
      return state.competitions
        .map(function (c) {
          var items = (c.items || []).filter(function (it) {
            return ((it.title || '').toLowerCase().indexOf(q) !== -1)
                || ((it.area || '').toLowerCase().indexOf(q) !== -1)
                || ((it.projectCode || '').toLowerCase().indexOf(q) !== -1);
          });
          return Object.assign({}, c, { items: items });
        })
        .filter(function (c) { return c.items.length > 0; });
    }, [filter, state.competitions]);

    return e('div', { className: 'public-results-page', style: {
      minHeight: '100vh', background: '#F4F5F7', fontFamily: 'Open Sans, sans-serif'
    } },
      e('header', { style: {
        background: '#233874', color: '#fff', padding: '1.4rem 1.2rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.8rem'
      } },
        e('div', null,
          e('h1', { style: { margin: 0, fontSize: '1.35rem', fontWeight: 600 } },
            'Публикувани резултати — Научни конкурси'),
          e('div', { style: { fontSize: '.78rem', opacity: .85, marginTop: '.25rem' } },
            'Икономически университет – Варна · Научноизследователска дейност')
        ),
        e('a', { href: siteUrl, target: '_top', style: { color: '#fff', textDecoration: 'none', fontSize: '.85rem' } },
          e('i', { className: 'fas fa-sign-in-alt', style: { marginRight: '.3rem' } }),
          'Вход в системата')
      ),
      e('main', { style: { maxWidth: 1100, margin: '0 auto', padding: '1.4rem 1rem' } },
        e('div', { style: { background: 'var(--surface)', borderRadius: 8, padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)' } },
          e('p', { style: { margin: '0 0 .6rem', color: '#444', fontSize: '.85rem', lineHeight: 1.55 } },
            'Тази страница публикува класирането на одобрените за финансиране научни проекти на ИУ – Варна. ',
            'Показваните данни са анонимизирани (без лични имена и e-mail) съгласно вътрешния правилник и Регламент (ЕС) 2016/679.'),
          e('input', {
            type: 'search',
            placeholder: 'Търси по тема, направление или код…',
            value: filter,
            onChange: function (ev) { setFilter(ev.target.value); },
            style: { width: '100%', padding: '.55rem .8rem', border: '1px solid #ddd', borderRadius: 6, fontSize: '.85rem', boxSizing: 'border-box' }
          })
        ),
        state.loading && e('div', { style: { padding: '2rem', textAlign: 'center', color: '#666' } },
          e('i', { className: 'fas fa-spinner fa-spin', style: { fontSize: '1.4rem', marginBottom: '.5rem' } }),
          e('div', null, 'Зареждане…')),
        state.error && e('div', { style: { background: '#FFF4F4', border: '1px solid #FCC', color: '#7B0000', borderRadius: 8, padding: '1rem', marginBottom: '1rem' } },
          e('strong', null, 'Грешка: '), state.error),
        !state.loading && !state.error && visible.length === 0 && e('div', { style: {
          background: 'var(--surface)', borderRadius: 8, padding: '2rem', textAlign: 'center', color: '#666'
        } },
          e('i', { className: 'fas fa-inbox', style: { fontSize: '1.8rem', marginBottom: '.6rem', color: '#bbb' } }),
          e('div', null, 'Няма публикувани резултати към момента.')),
        visible.map(function (comp) {
          return e('section', { key: comp.competitionId, style: {
            background: 'var(--surface)', borderRadius: 8, padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,.06)'
          } },
            e('header', { style: { borderBottom: '1px solid #eee', paddingBottom: '.55rem', marginBottom: '.7rem' } },
              e('h2', { style: { margin: 0, fontSize: '1.05rem', color: '#233874' } },
                comp.name || comp.competitionId,
                comp.year ? e('span', { style: { color: '#777', fontWeight: 400, marginLeft: '.4rem' } }, '· ' + comp.year) : null),
              e('div', { style: { fontSize: '.72rem', color: '#888', marginTop: '.2rem' } },
                'Общо одобрени: ' + comp.total)
            ),
            e('div', { style: { overflowX: 'auto' } },
              e('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' } },
                e('thead', null,
                  e('tr', { style: { background: '#FAFAFA', textAlign: 'left' } },
                    e('th', { style: thStyle(60) }, '№'),
                    e('th', { style: thStyle() }, 'Тема'),
                    e('th', { style: thStyle(100) }, 'Тип'),
                    e('th', { style: thStyle() }, 'Направление'),
                    e('th', { style: { ...thStyle(80), textAlign: 'right' } }, 'Оценка'))
                ),
                e('tbody', null,
                  comp.items.map(function (it) {
                    return e('tr', { key: it.id, style: { borderTop: '1px solid #eee' } },
                      e('td', { style: { ...tdStyle, fontWeight: 600, color: '#233874' } }, it.rank),
                      e('td', { style: tdStyle }, it.title || '—'),
                      e('td', { style: tdStyle }, it.projectCode || '—'),
                      e('td', { style: tdStyle }, (function(){var pra=getAreas(it.area||'');return pra.length>0?pra.join(', '):'—';})()),
                      e('td', { style: { ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } },
                        (Number(it.score) || 0).toFixed(2)));
                  })
                )
              )
            )
          );
        })
      ),
      e('footer', { style: {
        textAlign: 'center', padding: '1.4rem 1rem', color: '#888', fontSize: '.75rem'
      } },
        '© 2026 Икономически университет – Варна · ',
        e('a', { href: siteUrl, target: '_top', style: { color: '#233874' } }, 'Към системата'))
    );
  }

  function thStyle(w) {
    return { padding: '.5rem .6rem', fontWeight: 600, color: '#444', fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.02em', width: w };
  }
  var tdStyle = { padding: '.5rem .6rem', verticalAlign: 'top' };

  global.PublicResultsView = PublicResultsView;
})(typeof window !== 'undefined' ? window : this);
