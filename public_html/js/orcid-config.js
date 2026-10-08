/* ═══════════════════════════════════════════════════════════════════════
 * ORCIDConfigPanel — Configure ORCID API Client
 * ═══════════════════════════════════════════════════════════════════════
 * Admin panel for configuring ORCID OAuth credentials.
 * Allows registering an ORCID API client and testing the connection.
 *
 * Props: { onClose }
 * ═══════════════════════════════════════════════════════════════════════
 */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var Fragment = React.Fragment;

  function ORCIDConfigPanel(props) {
    var onClose = props.onClose || function () {};

    var configState = useState(null);
    var config = configState[0];
    var setConfig = configState[1];

    var loadingState = useState(true);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    var savingState = useState(false);
    var saving = savingState[0];
    var setSaving = savingState[1];

    var clientIdState = useState('');
    var clientId = clientIdState[0];
    var setClientId = clientIdState[1];

    var clientSecretState = useState('');
    var clientSecret = clientSecretState[0];
    var setClientSecret = clientSecretState[1];

    var sandboxState = useState(true);
    var sandbox = sandboxState[0];
    var setSandbox = sandboxState[1];

    var redirectUriState = useState('');
    var redirectUri = redirectUriState[0];
    var setRedirectUri = redirectUriState[1];

    var messageState = useState(null);
    var message = messageState[0];
    var setMessage = messageState[1];

    var testingState = useState(false);
    var testing = testingState[0];
    var setTesting = testingState[1];

    // Load config on mount
    useEffect(function () {
      loadConfig();
    }, []);

    function loadConfig() {
      setLoading(true);
      api('veda_config', {}).then(function (res) {
        setLoading(false);
        if (res && res.success) {
          setConfig(res.data);
          setRedirectUri(res.data.orcidRedirectUri || window.location.origin + '/database/api.php?action=orcid_callback');
        }
      }).catch(function () {
        setLoading(false);
      });
    }

    function saveConfig() {
      setSaving(true);
      setMessage(null);

      var payload = {
        orcidClientId: clientId,
        orcidClientSecret: clientSecret,
        orcidSandbox: sandbox ? '1' : '',
        orcidRedirectUri: redirectUri
      };

      api('veda_config', payload).then(function (res) {
        setSaving(false);
        if (res && res.success) {
          setMessage({ type: 'success', text: 'ORCID API client конфигуриран успешно!' });
          loadConfig();
          // Clear secret field for security
          setClientSecret('');
        } else {
          setMessage({ type: 'error', text: (res && res.error) || 'Грешка при запис.' });
        }
      }).catch(function () {
        setSaving(false);
        setMessage({ type: 'error', text: 'Грешка при връзка със сървъра.' });
      });
    }

    function testConnection() {
      setTesting(true);
      setMessage(null);

      api('orcid_auth_url', {}).then(function (res) {
        setTesting(false);
        if (res && res.success && res.url) {
          setMessage({ type: 'success', text: 'Връзката с ORCID е успешна! URL генериран.' });
        } else {
          setMessage({ type: 'error', text: (res && res.error) || 'Не може да се генерира URL. Проверете Client ID.' });
        }
      }).catch(function () {
        setTesting(false);
        setMessage({ type: 'error', text: 'Грешка при връзка със сървъра.' });
      });
    }

    function openOrcIDRegister() {
      var url = sandbox
        ? 'https://sandbox.orcid.org/developer-tools'
        : 'https://orcid.org/developer-tools';
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    // ── Render ────────────────────────────────────────────────────────────
    return e('div', { style: { background: 'var(--card,#fff)', border: '1px solid var(--border,#e0e0e0)', borderRadius: 12, padding: '1.5rem', maxWidth: 600, margin: '0 auto' } },
      e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' } },
        e('i', { className: 'fab fa-orcid', style: { color: '#a6ce39', fontSize: '1.5rem' } }),
        e('div', { style: { flex: 1 } },
          e('div', { style: { fontWeight: 700, fontSize: '1.1rem' } }, 'ORCID API Client Configuration'),
          e('div', { style: { fontSize: '.75rem', color: 'var(--ink-3)' } }, 'Configure ORCID OAuth for publication sync')
        ),
        e('button', { className: 'btn btn-sm btn-outline', onClick: onClose, title: 'Close' }, e('i', { className: 'fas fa-times' }))
      ),

      message ? e('div', { style: { padding: '.75rem', background: message.type === 'success' ? '#f0fdf4' : '#fde8e8', borderRadius: 8, color: message.type === 'success' ? '#2e7d32' : '#c62828', fontSize: '.85rem', marginBottom: '1rem' } },
        e('i', { className: 'fas fa-' + (message.type === 'success' ? 'check-circle' : 'exclamation-circle'), style: { marginRight: '.4rem' } }), message.text
      ) : null,

      loading ? e('div', { style: { textAlign: 'center', padding: '2rem', color: 'var(--ink-3)' } },
        e('i', { className: 'fas fa-spin fa-spinner', style: { fontSize: '1.5rem' } })
      ) : e(Fragment, null,

        // Instructions
        e('div', { style: { background: '#f8f9fa', borderRadius: 8, padding: '1rem', marginBottom: '1rem', border: '1px solid var(--border,#e0e0e0)' } },
          e('div', { style: { fontWeight: 600, fontSize: '.9rem', marginBottom: '.5rem', display: 'flex', alignItems: 'center', gap: '.4rem' } },
            e('i', { className: 'fas fa-info-circle', style: { color: '#4a6cf7' } }),
            'How to register an ORCID API client:'
          ),
          e('ol', { style: { fontSize: '.8rem', color: 'var(--ink-2)', paddingLeft: '1.2rem', margin: 0 } },
            e('li', { style: { marginBottom: '.3rem' } }, 'Go to ', e('a', { href: '#', onClick: function(e) { e.preventDefault(); openOrcIDRegister(); }, style: { color: '#a6ce39' } }, sandbox ? 'sandbox.orcid.org' : 'orcid.org'), ' → Developer Tools'),
            e('li', { style: { marginBottom: '.3rem' } }, 'Click "Register for the ORCID Public API"'),
            e('li', { style: { marginBottom: '.3rem' } }, 'Fill in the application name: ', e('strong', null, 'UEV-ERP Scientific Publications')),
            e('li', { style: { marginBottom: '.3rem' } }, 'Set Redirect URI to the value below'),
            e('li', null, 'Copy the Client ID and Client Secret here')
          )
        ),

        // Sandbox toggle
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' } },
          e('label', { style: { display: 'flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer' } },
            e('input', { type: 'checkbox', checked: sandbox, onChange: function(ev) { setSandbox(ev.target.checked); } }),
            e('span', { style: { fontSize: '.85rem', fontWeight: 600 } }, 'Use ORCID Sandbox (for testing)')
          ),
          config && config.orcidSandbox ? e('span', { style: { fontSize: '.7rem', background: '#4a6cf7', color: '#fff', borderRadius: 10, padding: '.15rem .5rem' } }, 'SANDBOX') : null
        ),

        // Client ID
        e('div', { style: { marginBottom: '.75rem' } },
          e('label', { style: { display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.25rem' } }, 'Client ID'),
          e('input', {
            type: 'text',
            placeholder: 'APP-XXXXXXXXXXXXXXXX',
            value: clientId,
            onChange: function(ev) { setClientId(ev.target.value); },
            style: { width: '100%', padding: '.5rem .75rem', border: '1px solid var(--border,#e0e0e0)', borderRadius: 6, fontSize: '.85rem', fontFamily: 'monospace' }
          }),
          config && config.orcidClientIdSet ? e('div', { style: { fontSize: '.7rem', color: '#2e7d32', marginTop: '.2rem' } }, e('i', { className: 'fas fa-check' }), ' Currently set') : null
        ),

        // Client Secret
        e('div', { style: { marginBottom: '.75rem' } },
          e('label', { style: { display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.25rem' } }, 'Client Secret'),
          e('input', {
            type: 'password',
            placeholder: config && config.orcidClientSecretSet ? '••••••••••••••••' : 'Enter client secret',
            value: clientSecret,
            onChange: function(ev) { setClientSecret(ev.target.value); },
            style: { width: '100%', padding: '.5rem .75rem', border: '1px solid var(--border,#e0e0e0)', borderRadius: 6, fontSize: '.85rem', fontFamily: 'monospace' }
          })
        ),

        // Redirect URI
        e('div', { style: { marginBottom: '1rem' } },
          e('label', { style: { display: 'block', fontSize: '.8rem', fontWeight: 600, marginBottom: '.25rem' } }, 'Redirect URI'),
          e('input', {
            type: 'text',
            placeholder: 'https://sr-ue-varna.com/database/api.php?action=orcid_callback',
            value: redirectUri,
            onChange: function(ev) { setRedirectUri(ev.target.value); },
            style: { width: '100%', padding: '.5rem .75rem', border: '1px solid var(--border,#e0e0e0)', borderRadius: 6, fontSize: '.85rem', fontFamily: 'monospace' }
          }),
          e('div', { style: { fontSize: '.7rem', color: 'var(--ink-3)', marginTop: '.2rem' } }, 'Use this exact value in your ORCID developer settings')
        ),

        // Buttons
        e('div', { style: { display: 'flex', gap: '.5rem', flexWrap: 'wrap' } },
          e('button', { className: 'btn btn-primary', onClick: saveConfig, disabled: saving || !clientId },
            saving ? e('i', { className: 'fas fa-spinner spin' }) : e('i', { className: 'fas fa-save' }), ' Запази'
          ),
          e('button', { className: 'btn btn-outline', onClick: testConnection, disabled: testing || !clientId },
            testing ? e('i', { className: 'fas fa-spinner spin' }) : e('i', { className: 'fas fa-vial' }), ' Тествай'
          ),
          e('button', { className: 'btn btn-outline', onClick: openOrcIDRegister },
            e('i', { className: 'fas fa-external-link-alt' }), ' ORCID Developer Tools'
          )
        ),

        // Status
        config ? e('div', { style: { marginTop: '1rem', padding: '.75rem', background: config.orcidOAuthConfigured ? '#f0fdf4' : '#fff3cd', borderRadius: 8, border: '1px solid ' + (config.orcidOAuthConfigured ? '#bbf7d0' : '#ffeaa7') } },
          e('div', { style: { fontWeight: 600, fontSize: '.85rem', color: config.orcidOAuthConfigured ? '#2e7d32' : '#856404' } },
            e('i', { className: 'fas fa-' + (config.orcidOAuthConfigured ? 'check-circle' : 'exclamation-triangle'), style: { marginRight: '.4rem' } }),
            config.orcidOAuthConfigured ? 'ORCID OAuth е конфигуриран и готов за работа' : 'ORCID OAuth не е конфигурирван'
          ),
          e('div', { style: { fontSize: '.75rem', color: 'var(--ink-2)', marginTop: '.3rem' } },
            'Client ID: ' + (config.orcidClientIdSet ? '✅ Set' : '❌ Not set'), ' | ',
            'Client Secret: ' + (config.orcidClientSecretSet ? '✅ Set' : '❌ Not set'), ' | ',
            'Sandbox: ' + (config.orcidSandbox ? 'Yes' : 'No')
          )
        ) : null
      )
    );
  }

  global.ORCIDConfigPanel = React.memo(ORCIDConfigPanel);

})(window);