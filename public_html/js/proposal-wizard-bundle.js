/* ═══════════════════════════════════════════════════════════════════════
 * proposal-wizard-bundle.js — Loads all Proposal Wizard v2.0 modules
 * ═══════════════════════════════════════════════════════════════════════
 * Include this file AFTER React, AFTER components.js/views-bundle.js.
 *
 * Load order:
 *   1. Types (types.js)
 *   2. API client (proposalsApi.js)
 *   3. State machine (useWizardState.js)
 *   4. Autosave hook (useAutosave.js)
 *   5. Shared components (StatusBadge, AutosaveIndicator, etc.)
 *   6. Step schemas
 *   7. Step components (Step1, Step2, Step3)
 *   8. Wizard shell (WizardShell.js)
 *   9. CSS (proposal-wizard.css) — loaded via link or inline
 *
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /**
   * Load all proposal wizard modules in dependency order.
   * Safe to call multiple times — skips if already loaded.
   */
  function loadProposalWizard() {
    if (global.__pwWizardLoaded) return;
    global.__pwWizardLoaded = true;

    // Modules are loaded via separate <script> tags in index.html.
    // This function serves as a dependency manifest and init helper.

    // Check that React is available
    if (typeof React === 'undefined') {
      console.warn('[ProposalWizard] React is not available — wizard cannot render.');
      return;
    }

    // Check core dependencies
    var deps = [
      '__pwTypes', '__pwApi', '__pwUseWizardState', '__pwStatusBadge',
      '__pwAutosaveIndicator', '__pwConfirmCloseDialog', '__pwConflictResolutionDialog',
      '__pwInlineValidationSummary', '__pwStepIndicator', '__pwDocumentCard',
      '__pwStep1Schema', '__pwStep2Schema', '__pwStep3Schema',
      '__pwStep1BasicInfo', '__pwStep2Documents', '__pwStep3Budget',
      '__pwWizardShell'
    ];

    var missing = deps.filter(function (name) { return !global[name]; });
    if (missing.length > 0) {
      console.warn('[ProposalWizard] Missing modules:', missing.join(', '));
      return;
    }

    // Insert CSS
    _injectCSS();

    // Register the wizard as a replacement for NewFormModal
    _registerWizardEntryPoints();
  }

  /**
   * Inject the proposal-wizard CSS into the document.
   */
  function _injectCSS() {
    if (global.__pwCssInjected) return;

    // Use absolute path from root for reliable loading whether page is at /
    // or in a subdirectory like /nauchni-proekti/
    var cssPath = '/js/features/proposal-wizard/proposal-wizard.css';
    // Try to find existing link
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      if (links[i].href && links[i].href.indexOf('proposal-wizard.css') >= 0) {
        global.__pwCssInjected = true;
        return;
      }
    }

    // Create link element
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssPath;
    // v12.28.3-coop: Fallback if CSS fails to load (e.g. wrong path/env).
    // Try alternative absolute path (for backward compat with old deployments).
    link.onerror = function() {
      console.warn('[ProposalWizard] CSS failed at ' + cssPath + ', trying subdirectory variant...');
      var altLink = document.createElement('link');
      altLink.rel = 'stylesheet';
      altLink.href = '/features/proposal-wizard/proposal-wizard.css';
      altLink.onerror = function() { console.warn('[ProposalWizard] Both CSS paths failed.'); };
      document.head.appendChild(altLink);
    };
    document.head.appendChild(link);
    global.__pwCssInjected = true;
  }

  /**
   * Register the wizard entry points in the global scope.
   * New wizard is available as ProposalWizardModal (window.__pwWizardShell).
   * Legacy NewFormModal is preserved — no automatic replacement.
   * To activate: set window.__pwUseNewWizard = true before page load.
   */
  function _registerWizardEntryPoints() {
    // Store reference to legacy NewFormModal for fallback
    if (!global.__pwLegacyNewFormModal && global.NewFormModal) {
      global.__pwLegacyNewFormModal = global.NewFormModal;
    }

    // If feature flag is active, wrap NewFormModal to use the new wizard
    if (global.__pwUseNewWizard === true) {
      if (global.NewFormModal && global.ProposalWizardModal) {
        global.NewFormModal = function NewFormModalWrapper(props) {
          return global.ProposalWizardModal(props);
        };
      }
    }
  }

  /**
   * Feature flag: use the new wizard instead of the legacy one.
   * Set window.__pwUseNewWizard = true before loading.
   * @returns {boolean}
   */
  function isNewWizardEnabled() {
    return global.__pwUseNewWizard === true;
  }

  /* ── Expose ── */
  global.__pwLoadProposalWizard = loadProposalWizard;
  global.__pwIsNewWizardEnabled = isNewWizardEnabled;

  // Auto-load if enabled
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (global.__pwAutoLoad !== false) loadProposalWizard();
    });
  } else {
    if (global.__pwAutoLoad !== false) loadProposalWizard();
  }

})(window);
