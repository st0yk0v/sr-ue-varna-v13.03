/* ═══════════════════════════════════════════════════════════════════════
 * ORCIDConnectionPanel — Connect ORCID via OAuth
 * ═══════════════════════════════════════════════════════════════════════
 * Allows Google Auth users to connect their ORCID account.
 * Flow: Click "Connect ORCID" → ORCID login popup → Callback → Save
 *
 * Props: { email, name, onConnected }
 * ═══════════════════════════════════════════════════════════════════════
 */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var Fragment = React.Fragment;

  function ORCIDConnectionPanel(props) {
    var email = props.email || '';
    var name = props.name || '';
    var onConnected = props.onConnected || function () {};

    var statusState = useState(null);
    var status = statusState[0];
    var setStatus = statusState[1];

    var loadingState = useState(false);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    var errorState = useState(null);
    var error = errorState[0];
    var setError = errorState[1];

    var connectingState = useState(false);
    var connecting = connectingState[0];
    var setConnecting = connectingState[1];

    // Check ORCID status on mount
    useEffect(function () {
      if (!email) return;
      checkStatus();
    }, [email]);

    function checkStatus() {
      setLoading(true);
      api('getorcidstatus', { email: email }).then(function (res) {
        setLoading(false);
        if (res && res.success) {
          setStatus(res);
        } else {
          setStatus({ connected: false });
        }
      }).catch(function () {
        setLoading(false);
        setStatus({ connected: false });
      });
    }

    function connectOrcID() {
      setConnecting(true);
      setError(null);

      // Get auth URL from backend
      api('orcid_auth_url', {}).then(function (res) {
        if (res && res.success && res.url) {
          // Open ORCID login in popup
          var popup = window.open(
            res.url,
            'orcid_oauth',
            'width=600,height=700,scrollbars=yes,resizable=yes'
          );

          // Listen for callback message from popup
          var onMessage = function (ev) {
            if (!ev.data || ev.data.type !== 'orcid_callback') return;
            window.removeEventListener('message', onMessage);
            popup.close();

            if (ev.data.success) {
              // Save the connection
              saveConnection(ev.data.orcid, ev.data.name);
            } else {
              setError(ev.data.error || 'ORCID връзката беше отказана.');
              setConnecting(false);
            }
          };
          window.addEventListener('message', onMessage);

          // Fallback: poll for popup close
          var pollTimer = setInterval(function () {
            if (popup.closed) {
              clearInterval(pollTimer);
              window.removeEventListener('message', onMessage);
              setConnecting(false);
            }
          }, 500);
        } else {
          setError((res && res.error) || 'Не може да се генерира URL за ORCID връзка.');
          setConnecting(false);
        }
      }).catch(function () {
        setError('Грешка при връзка със сървъра.');
        setConnecting(false);
      });
    }

    function saveConnection(orcid, orcidName) {
      api('saveorcidconnection', { email: email, orcid: orcid, name: orcidName || name }).then(function (res) {
        setConnecting(false);
        if (res && res.success) {
          setStatus({ connected: true, orcid: orcid, name: orcidName || name });
          onConnected(orcid);
        } else {
          setError((res && res.error) || 'Грешка при запис на ORCID връзката.');
        }
      }).catch(function () {
        setConnecting(false);
        setError('Грешка при връзка със сървъра.');
      });
    }

    function disconnectOrcID() {
      if (!confirm('Сигурни ли сте, че искате да премахнете ORCID връзката?')) return;

      setLoading(true);
      api('orcid_disconnect', { email: email }).then(function (res) {
        setLoading(false);
        if (res && res.success) {
          setStatus({ connected: false });
          onConnected(null);
        } else {
          setError((res && res.error) || 'Грешка при премахване на ORCID връзката.');
        }
      }).catch(function () {
        setLoading(false);
        setError('Грешка при връзка със сървъра.');
      });
    }

    // ── Render ────────────────────────────────────────────────────────────
    return e('div', { style: { background: 'var(--card,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 12, padding: '1rem', marginBottom: '1rem' } },
      e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' } },
        e('i', { className: 'fab fa-orcid', style: { color: '#a6ce39', fontSize: '1.2rem' } }),
        e('div', { style: { flex: 1 } },
          e('div', { style: { fontWeight: 700, fontSize: '.95rem' } }, 'ORCID профил'),
          e('div', { style: { fontSize: '.75rem', color: 'var(--ink-3)' } }, 'Свържете вашия ORCID профил')
        )
      ),

      error ? e('div', { style: { padding: '.5rem', background: 'var(--err-bg,#fde8e8)', borderRadius: 6, color: 'var(--err,#c62828)', fontSize: '.8rem', marginBottom: '.75rem' } },
        e('i', { className: 'fas fa-exclamation-circle', style: { marginRight: '.4rem' } }), error
      ) : null,

      loading ? e('div', { style: { textAlign: 'center', padding: '1rem', color: 'var(--ink-3)' } },
        e('i', { className: 'fas fa-spinner spin', style: { fontSize: '1rem' } }), ' Зареждане…'
      ) : null,

      !loading && status && status.connected ? e(Fragment, null,
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' } },
          e('div', { style: { width: 40, height: 40, borderRadius: '50%', background: '#a6ce39', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            e('i', { className: 'fab fa-orcid', style: { color: '#fff', fontSize: '1.2rem' } })
          ),
          e('div', { style: { flex: 1 } },
            e('div', { style: { fontWeight: 600, fontSize: '.9rem' } }, status.name || name || email),
            e('a', { href: 'https://orcid.org/' + status.orcid, target: '_blank', rel: 'noopener', style: { fontSize: '.8rem', color: '#a6ce39', textDecoration: 'none' } },
              status.orcid
            ),
            status.last_synced ? e('div', { style: { fontSize: '.7rem', color: 'var(--ink-3)', marginTop: '.2rem' } },
              'Синхронизирано: ' + new Date(status.last_synced).toLocaleDateString('bg-BG')
            ) : null
          ),
          e('button', { className: 'btn btn-sm btn-outline', onClick: disconnectOrcID, style: { color: '#c62828', borderColor: '#c62828' } },
            e('i', { className: 'fas fa-unlink' }), ' Премахни'
          )
        )
      ) : null,

      !loading && (!status || !status.connected) ? e(Fragment, null,
        e('div', { style: { textAlign: 'center', padding: '.75rem' } },
          e('div', { style: { fontSize: '.85rem', color: 'var(--ink-3)', marginBottom: '.75rem' } },
            'Свържете вашия ORCID профил, за да синхронизирате автоматично вашите публикации.'
          ),
          e('button', { className: 'btn btn-primary', onClick: connectOrcID, disabled: connecting },
            connecting ? e(Fragment, null,
              e('i', { className: 'fas fa-spinner spin' }), ' Свързване…'
            ) : e(Fragment, null,
              e('i', { className: 'fab fa-orcid' }), ' Свържи ORCID профил'
            )
          ),
          e('div', { style: { fontSize: '.7rem', color: 'var(--ink-3)', marginTop: '.5rem' } },
            'Ще бъдете пренасочени към ORCID за оторизация.'
          )
        )
      ) : null
    );
  }

  global.ORCIDConnectionPanel = React.memo(ORCIDConnectionPanel);

})(window);