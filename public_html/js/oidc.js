// Stub for oidc.js — module not yet implemented
// This file prevents 404 errors when index.html or other scripts
// attempt to load this module.
if (typeof define === 'function' && define.amd) {
  define({}); // AMD
} else if (typeof module !== 'undefined' && module.exports) {
  module.exports = {}; // CommonJS
} else {
  window.OIDC = window.OIDC || {}; // Global fallback
}
