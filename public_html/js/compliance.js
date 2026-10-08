/* ==========================================================================
 *  compliance.js — GDPR / ЗЗЛД helpers
 *  --------------------------------------------------------------------------
 *  Клиентски помощни функции, обединени в `window.Compliance`.
 *    • GDPR self-service (чл.15-17 GDPR)
 *    • Одитна верига (SHA-256 hash-chain верификация)
 *  Зарежда се преди app.js. EUPL-1.2.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ─── EGN validation (BDS ISO 7064 / NRA weights) ─── */
  function validateEGN(egn) {
    if (typeof egn !== 'string' || !/^\d{10}$/.test(egn)) return false;
    var w = [2, 4, 8, 5, 10, 9, 7, 3, 6], s = 0;
    for (var i = 0; i < 9; i++) s += parseInt(egn.charAt(i), 10) * w[i];
    var c = s % 11; if (c === 10) c = 0;
    return c === parseInt(egn.charAt(9), 10);
  }
  function maskEGN(egn) {
    if (!egn) return '';
    var s = String(egn).replace(/\D/g, '');
    if (s.length < 10) return s.replace(/./g, '*');
    return s.substr(0, 6) + '****';
  }
  function maskEmail(email) {
    if (!email) return '';
    var at = String(email).indexOf('@');
    if (at < 2) return '***';
    return email.charAt(0) + '***' + email.charAt(at - 1) + email.substr(at);
  }
  function maskName(n) {
    if (!n) return '';
    return String(n).trim().split(/\s+/).map(function (p) {
      return p.length <= 1 ? p : p.charAt(0) + '.';
    }).join(' ');
  }

  var PII_KEYS = ['egn', 'EGN', 'operatorEGN', 'personIdentificator', 'receiverUniqueIdentifier',
                  'senderUniqueIdentifier', 'identityNumber', 'phone', 'mobile', 'address'];
  var PII_SET = new Set(PII_KEYS);
  function redactPII(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(redactPII);
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (PII_SET.has(k) && typeof v === 'string') {
        out[k] = /^\d{10}$/.test(v) ? maskEGN(v) : '***';
      } else if (k.toLowerCase().includes('email') && typeof v === 'string') {
        out[k] = maskEmail(v);
      } else if (v && typeof v === 'object') {
        out[k] = redactPII(v);
      } else {
        out[k] = v;
      }
    });
    return out;
  }

  /**
   * Cryptographic SHA-256 digest (async).
   * Uses the Web Crypto API (SubtleCrypto) when available — produces a real
   * 256-bit hash required for audit-chain integrity verification.
   * Falls back to a fast FNV-1a-based pseudo-hash on platforms without Crypto
   * (e.g. HTTP contexts, old browsers) — shape-compatible but NOT cryptographic.
   * Callers that need tamper-evidence MUST be served over HTTPS where SubtleCrypto works.
   */
  async function sha256Hex(str) {
    var s = String(str == null ? '' : str);
    // ── Web Crypto path (real SHA-256, requires HTTPS) ──
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      try {
        var enc = new TextEncoder();
        var buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
        var bytes = new Uint8Array(buf);
        var hex = '';
        for (var bi = 0; bi < bytes.length; bi++) {
          hex += ('00' + bytes[bi].toString(16)).slice(-2);
        }
        return hex;
      } catch (_) { /* fall through to FNV-1a fallback */ }
    }
    // ── FNV-1a fallback (NOT cryptographic — use only for development/HTTP) ──
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    h = (h ^ (s.length * 16777619)) >>> 0;
    var hex8 = ('00000000' + h.toString(16)).slice(-8);
    return hex8 + hex8 + hex8 + hex8 + hex8 + hex8 + hex8 + hex8;
  }

  /* ─── API helper (uses global `api()` from utils.js) ─── */
  function _api() {
    if (typeof global.api !== 'function') throw new Error('api() не е заредено');
    return global.api;
  }

  /* ─── File → base64 helper ─── */
  async function fileToBase64(file) {
    if (!(file instanceof Blob)) throw new Error('Изисква се Blob/File');
    var buf = await file.arrayBuffer();
    var bytes = new Uint8Array(buf), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return global.btoa(bin);
  }

  /* ─── GDPR (чл.15-17 на Регламент (ЕС) 2016/679) ─── */
  var gdpr = {
    access:  function (email)       { return _api()('gdpraccess',  { subjectEmail: email }); },
    export:  function (email)       { return _api()('gdprexport',  { subjectEmail: email }); },
    rectify: function (email, p)    { return _api()('gdprrectify', { subjectEmail: email, patch: p || {} }); },
    erasure: function (email, r)    { return _api()('gdprerasure', { subjectEmail: email, reason: r || '' }); }
  };

  var audit = {
    verifyChain: function () { return _api()('auditverifychain', {}); }
  };

  /* Експорт в global namespace */
  global.Compliance = {
    validateEGN:  validateEGN,
    maskEGN:      maskEGN,
    maskEmail:    maskEmail,
    maskName:     maskName,
    redactPII:    redactPII,
    sha256Hex:    sha256Hex,
    fileToBase64: fileToBase64,
    gdpr:         gdpr,
    audit:        audit,
    PRIVACY_NOTICE_URL: 'PRIVACY.md',
    DPO_EMAIL: 'dpo@ue-varna.bg'
  };
})(typeof window !== 'undefined' ? window : globalThis);
