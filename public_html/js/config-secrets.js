/* ── Deployment secrets — local overrides only ───────────────────────────
 * All essential values (GAS URL shards, PROJECT_TYPES, etc.) are already
 * set in the inline ERP_CONFIG block in index.html.
 * This file is loaded FIRST in the defer chain so the service worker can
 * precache it (sw.js includes it in SHELL_ASSETS). Without it the SW
 * install step throws a 404 and falls back to the old cached worker.
 *
 * Generated from: js/config-secrets.example.js
 * Version: 12.19.0
 * ─────────────────────────────────────────────────────────────────────── */
window.ERP_CONFIG = Object.assign(window.ERP_CONFIG || {}, {
  // Uncomment when running behind server.js proxy (npm start):
  // GAS_PROXY_PATH: '/api/gas/',
});
