/**
 * UEV-ERP Laravel Backend Configuration — v12.26.0-laravel
 *
 * Routes ALL API calls to the Laravel backend at /api.
 * This replaces the old multi-domain PHP pool approach — 
 * Laravel is the single source of truth.
 *
 * Architecture:
 *   Laravel API:  /api/*  → laravel/public/index.php (PHP-FPM)
 *   Static SPA:   /*      → public_html/index.html (Apache)
 */
(function(){
  // ── Laravel is the single backend — no pool needed ──
  var apiUrl = '/api';

  window._PHP_API_URL  = apiUrl;
  window._PHP_API_POOL = [apiUrl];

  window.ERP_CONFIG = Object.assign(window.ERP_CONFIG || {}, {
    __ERP_BACKEND: 'laravel',
    __PHP_MODE: true,
    __PHP_API_POOL: [apiUrl],
    GAS_URL: apiUrl,  // Override GAS_URL so legacy api() calls hit Laravel
  });

  // ── Timeouts — Laravel is fast, use shorter timeouts ──
  window.__ERP_PHP_TIMEOUT_READ    = 6000;
  window.__ERP_PHP_TIMEOUT_WRITE   = 12000;
  window.__ERP_PHP_TIMEOUT_BATCH   = 8000;
  window.__ERP_PHP_TIMEOUT_VERSION = 3000;

  // ── No health probing needed — single backend ──
  var primary = apiUrl;
  localStorage.setItem('__erp_api_health', JSON.stringify((_a={},_a[primary]={ok:true,ts:Date.now(),latency:0},_a)));var _a;
  localStorage.setItem('__erp_api_health_full_ts', String(Date.now()));
})();
