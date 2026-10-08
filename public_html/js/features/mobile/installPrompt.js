/**
 * Mobile PWA install prompt + iOS standalone detection
 * v12.53.0 — native-like UX
 *
 * Additive-only: registers a beforeinstallprompt handler and exposes
 * detectIosStandalone() for CSS targeting. No behavior change on desktop.
 */
(function () {
  if (typeof window === 'undefined') return;

  var _installPrompt = null;
  var _installPromptFired = false;

  // ── iOS standalone detection ──
  // Returns true when the page is running as a standalone PWA on iOS Safari
  // (navigator.standalone === true) OR when the user has added to home screen
  // on older iOS where navigator.standalone is false but display-mode is standalone.
  window.detectIosStandalone = function () {
    try {
      var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      var isStandalone = navigator.standalone === true;
      // Also check display-mode media query (covers edge cases)
      var mqStandalone = window.matchMedia('(display-mode: standalone)').matches;
      return isIOS && (isStandalone || mqStandalone);
    } catch (_) { return false; }
  };

  // ── Apply iOS standalone class to <body> for CSS targeting ──
  window.applyIosStandaloneClass = function () {
    try {
      if (window.detectIosStandalone()) {
        document.documentElement.classList.add('ios-standalone');
        document.body.classList.add('ios-standalone');
        return true;
      }
    } catch (_) {}
    return false;
  };

  // ── beforeinstallprompt handler ──
  // Stores the event so we can fire it later when the user taps our custom CTA.
  // This MUST be registered at module load (before the browser fires the event).
  window.addEventListener('beforeinstallprompt', function (ev) {
    try {
      ev.preventDefault();
      _installPrompt = ev;
      _installPromptFired = true;
      // Signal to the app that install is available
      try { sessionStorage.setItem('erp:installAvailable', '1'); } catch (_) {}
      try { window.__ERP_INSTALL_AVAILABLE__ = true; } catch (_) {}
      try { window.dispatchEvent(new CustomEvent('erp:install-available')); } catch (_) {}
    } catch (_) {}
  });

  // ── Programmatic install trigger ──
  // Call this from a user gesture (button tap) to show the install prompt.
  window.triggerPwaInstall = function () {
    return new Promise(function (resolve) {
      if (!_installPrompt) {
        resolve({ outcome: 'unavailable', reason: 'no-prompt-stored' });
        return;
      }
      try {
        _installPrompt.prompt();
        _installPrompt.userChoice.then(function (choice) {
          try {
            if (choice.outcome === 'accepted') {
              try { sessionStorage.setItem('erp:installed', '1'); } catch (_) {}
              try { window.__ERP_INSTALLED__ = true; } catch (_) {}
            }
          } catch (_) {}
          _installPrompt = null;
          try { sessionStorage.removeItem('erp:installAvailable'); } catch (_) {}
          resolve(choice);
        }).catch(function () {
          resolve({ outcome: 'error', reason: 'userChoice-rejected' });
        });
      } catch (_) {
        resolve({ outcome: 'error', reason: 'prompt-failed' });
      }
    });
  };

  // ── Listen for successful install ──
  window.addEventListener('appinstalled', function () {
    try {
      sessionStorage.setItem('erp:installed', '1');
      window.__ERP_INSTALLED__ = true;
      _installPrompt = null;
      try { sessionStorage.removeItem('erp:installAvailable'); } catch (_) {}
      try { window.dispatchEvent(new CustomEvent('erp:installed')); } catch (_) {}
    } catch (_) {}
  });

  // ── Expose install availability check ──
  window.isPwaInstallAvailable = function () {
    return _installPromptFired && _installPrompt !== null;
  };

  // ── Expose already-installed check ──
  window.isPwaInstalled = function () {
    try {
      if (sessionStorage.getItem('erp:installed') === '1') return true;
    } catch (_) {}
    try {
      return window.matchMedia('(display-mode: standalone)').matches;
    } catch (_) { return false; }
  };

  // ── Apply iOS class immediately on load ──
  try { window.applyIosStandaloneClass(); } catch (_) {}

})();
