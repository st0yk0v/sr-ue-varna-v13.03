/* ── Deployment secrets TEMPLATE ──────────────────────────────────
 * Copy this file to config-secrets.js and fill in the real values.
 * config-secrets.js is .gitignored — it will NOT be committed.
 *
 * IMPORTANT: All essential values (GAS_URL, splice parts, encoded blob)
 * are already set in index.html's inline ERP_CONFIG. This file is for
 * ENVIRONMENT-SPECIFIC OVERRIDES only (staging, proxy mode, custom
 * Client ID). Leave everything commented out to use defaults.
 *
 * QUICK FIX — if you see "Липсва GAS_URL":
 *   1. Copy this file → config-secrets.js
 *   2. Uncomment GAS_URL below and paste your /exec URL
 *   3. Get the URL from: Google Apps Script → Deploy → Web App
 *
 * COMMON OVERRIDE EXAMPLES:
 *
 *   PLAIN-TEXT GAS URL (defence-in-depth):
 *     GAS_URL: 'https://script.google.com/macros/s/.../exec',
 *
 *   PROXY MODE:
 *     GAS_PROXY_PATH: '/api/gas/',
 *
 *   STAGING GAS URL:
 *     GAS_URL: 'https://script.google.com/macros/s/.../exec',
 *
 *   CUSTOM CLIENT ID:
 *     __ERP_GOOGLE_CLIENT_ID_ENCODED: '<output from encode-gs-url.js>',
 */

window.ERP_CONFIG = Object.assign(window.ERP_CONFIG || {}, {

  // ── Plain-text GAS URL (defence-in-depth) ─────────────────────
  // Uncomment and paste your /exec URL here. This is only used as
  // a last-resort fallback if the encoded blob decode fails.
  // GAS_URL: 'https://script.google.com/macros/s/.../exec',

  // ── Proxy mode (uncomment when server.js is running) ───────────
  // GAS_PROXY_PATH: '/api/gas/',

  // ── Override Google Client ID (encoded) ────────────────────────
  // __ERP_GOOGLE_CLIENT_ID_ENCODED: '',

});
