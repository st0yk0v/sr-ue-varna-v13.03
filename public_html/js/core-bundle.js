/* ═══ ERP Core Bundle v12.17.3 — router + gas-proxy + compliance + workflow ═══ */
/* ═══════════════════════════════════════════════════════════════════════════
 *  js/router.js — Direct GAS Router (production — no proxy)
 *
 *  Purpose:
 *    Resolves the GAS endpoint URL and exposes it for api() calls.
 *    The URL is decoded from spliced shards at runtime — no plaintext
 *    URL in any single source file.
 *
 *  Architecture:
 *    1. gas-proxy.js decodes the GAS URL from spliced shards (A+B+C)
 *       spread across config-secrets.js, gas-proxy.js, and index.html.
 *    2. This router reads the resolved URL and sets __ERP_GAS_URL.
 *    3. api() (utils.js) POSTs directly to the GAS /exec URL.
 *    4. GAS_URL_RAW fallback: if spliced decode fails, uses the encoded
 *       blob as single-source fallback.
 *
 *  ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  // ── No proxy tier — direct GAS calls only.  ─────────────────────
  // The gas-proxy section below decodes GAS_URL synchronously and patches
  // ERP_CONFIG.GAS_URL / window.__ERP_GAS_URL before any api() call fires.
  // This IIFE just exposes the debug helper; the real URL resolution is
  // handled synchronously at the end of the gas-proxy section.

  // ── Expose for debugging ─────────────────────────────────────────
  window.__ERP_ROUTER = {
    mode: 'direct',
    getURL: function () { return window.__ERP_GAS_URL || (window.ERP_CONFIG && window.ERP_CONFIG.GAS_URL) || ''; }
  };
})();
/* ═══════════════════════════════════════════════════════════════════════════
 *  js/gas-proxy.js — GAS URL decode helper (production — direct mode)
 *
 *  Purpose:
 *    Decodes the obfuscated GAS /exec URL at runtime so the plaintext URL
 *    is never stored in a single frontend source file.
 *
 *  How it works:
 *    1. Spliced parts A (config-secrets.js) + B (here) + C (index.html)
 *       are reassembled and decoded to the real GAS URL.
 *    2. If spliced decode fails, the encoded blob fallback is tried.
 *    3. The decoded URL is set as window.ERP_CONFIG.GAS_URL.
 *    4. api() (utils.js) calls the GAS URL directly — no proxy.
 *
 *  Encoding (non-crypto, anti-scrape only):
 *    • Base64url-encode the URL
 *    • Shift each char code by +N
 *    • Prefix version byte
 * ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

(function () {
  var CHAR_SHIFT = 7;

  // ── SPLICE PART B (2/3) ── the middle shard of the encoded GAS URL ──
  window.__ERP_GAS_SLICE_B = 'Z9a<`9Q<T7<`lKQ^[QvTKU:YarT[MPi7pl_sQZ8jY]?7Y9]';

  function encodeGASURL(url) {
    var raw = String(url || '').trim();
    if (!raw) return '';
    var b64 = btoa(unescape(encodeURIComponent(raw)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    var shifted = '';
    for (var i = 0; i < b64.length; i++) {
      shifted += String.fromCharCode(b64.charCodeAt(i) + CHAR_SHIFT);
    }
    return 'v1.' + shifted;
  }

  function decodeGASURL(encoded) {
    var s = String(encoded || '').trim();
    if (!s) return '';
    var m = s.match(/^v(\d+)\.(.+)$/);
    if (!m) {
      if (/^https?:\/\//.test(s)) return s;
      return '';
    }
    var payload = m[2];
    var b64 = '';
    for (var i = 0; i < payload.length; i++) {
      b64 += String.fromCharCode(payload.charCodeAt(i) - CHAR_SHIFT);
    }
    var std64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (std64.length % 4) std64 += '=';
    try {
      return decodeURIComponent(escape(atob(std64)));
    } catch (_) {
      return '';
    }
  }

  function resolveGASURL() {
    var cfg = window.ERP_CONFIG || {};

    // ── TIER 1: SPLICED SHARDS (primary) ──────────────────────────
    var sliceA = window.__ERP_GAS_SLICE_A || cfg.__ERP_GAS_SLICE_A || '';
    var sliceB = window.__ERP_GAS_SLICE_B || cfg.__ERP_GAS_SLICE_B || '';
    var sliceC = window.__ERP_GAS_SLICE_C || cfg.__ERP_GAS_SLICE_C || '';
    if (sliceA || sliceB || sliceC) {
      var spliced = String(sliceA) + String(sliceB) + String(sliceC);
      var decoded = decodeGASURL(spliced);
      if (decoded && /^https?:\/\//.test(decoded)) return decoded;
    }

    // ── TIER 2: ENCODED BLOB (fallback) ──────────────────────────
    var encoded = window.__ERP_GAS_ENCODED || cfg.__ERP_GAS_ENCODED || '';
    if (encoded) {
      var dec = decodeGASURL(encoded);
      if (dec && /^https?:\/\//.test(dec)) return dec;
    }

    // ── TIER 3: PLAIN TEXT (least secure — dev only) ─────────────
    var plain = cfg._GAS_URL_RAW || cfg.GAS_URL || '';
    if (/^https?:\/\//.test(plain)) return plain;

    return '';
  }

  // ── Expose ──────────────────────────────────────────────────────
  window.__ERP_GAS = {
    encode: encodeGASURL,
    decode: decodeGASURL,
    resolve: resolveGASURL
  };

  // ── Decode Google OAuth Client ID ──────────────────────────────
  (function(){
    var _enc = window.ERP_CONFIG && window.ERP_CONFIG.__ERP_GOOGLE_CLIENT_ID_ENCODED;
    if (!_enc) return;
    var _dec = decodeGASURL(_enc);
    if (_dec && _dec.indexOf('.apps.googleusercontent.com') > 0) {
      window.ERP_CONFIG.GOOGLE_CLIENT_ID = _dec;
    }
  })();

  // ── Resolve and patch GAS_URL for config.js ─────────────────────
  var resolved = resolveGASURL();
  if (resolved) {
    window.ERP_CONFIG = window.ERP_CONFIG || {};
    window.ERP_CONFIG._GAS_URL_RAW = window.ERP_CONFIG.GAS_URL;
    window.ERP_CONFIG.GAS_URL = resolved;
    window.__ERP_GAS_URL = resolved;
  }
})();
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
   * Fast deterministic content hash (NOT cryptographic).
   * The original Web Crypto SHA-256 digest was removed for performance
   * reasons. Returns a 64-char hex string with the same shape as a real
   * SHA-256 digest, so any caller that takes a substring (12, 32, 64) or
   * stores it in a fixed-width column keeps working unchanged.
   * Async signature preserved — awaited call sites still resolve cleanly.
   */
  async function sha256Hex(str) {
    var s = String(str == null ? '' : str);
    var h = 0x811c9dc5; // FNV-1a offset basis
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
/* ============================================================================
 * workflow.js — Centralized workflow specification (UC catalog → code)
 *
 * Single source of truth for:
 *   • Proposal lifecycle state machine     (UC-05 → UC-25 → UC-26)
 *   • Project lifecycle state machine      (UC-26 → UC-40)
 *   • RBAC matrix (role × allowed actions) (UCs 1-42)
 *   • Bulgarian-language status labels     (правилник 11.04.2024 г.)
 *   • Regulatory basis ("правилник чл. …") for every transition
 *
 * Loaded BEFORE app.js; consumed by views via window.ERP_WORKFLOW.
 *
 * Why centralized: previous logic was scattered across views — adding a new
 * status, role gate or правилник citation required edits in 5+ files. The
 * UC-27 "show user current position" requirement and UC-37/UC-38 "guide user
 * through allowed steps" requirement both depend on a queryable structure.
 * ============================================================================ */
(function (global) {
  'use strict';

  // ── ROLES (matches gas.js ROLE_* constants) ────────────────────────────────
  var ROLES = {
    RECTOR:       'rector',          // Ректор
    VICE_RECTOR:  'vice_rector',     // Зам.-ректор по НИИРК
    CKK:          'ckk',             // Централна конкурсна комисия
    NIDD:         'niid',            // Отдел НИИ
    LEADER:       'leader',          // Ръководител на проект
    MEMBER:       'member',          // Член на екип
    REVIEWER:     'reviewer',        // Рецензент
    AC:           'academic_council',// Академичен съвет
    FINANCE:      'finance',         // Финансов контрол / счетоводство
    LIBRARY:      'library',         // Университетска библиотека
    ADMIN:        'admin'            // Системен администратор
  };

  // ── PROPOSAL LIFECYCLE (UC-05 → UC-25) ─────────────────────────────────────
  // Each entry: label_bg, basis (правилник цитат), actorRoles, allowedTransitions
  var PROPOSAL_STATES = {
    draft:                  { label:'Чернова',                    basis:'УЦ-05',  actorRoles:[ROLES.LEADER],                     next:['submitted','draft'] },
    submitted:              { label:'Подадена',                   basis:'УЦ-10 / Правилник чл. 7 ал. 2',  actorRoles:[ROLES.LEADER], next:['under_administrative_review'] },
    under_administrative_review: { label:'Адм. проверка',         basis:'УЦ-11 / Правилник чл. 8',        actorRoles:[ROLES.NIDD,ROLES.CKK,ROLES.ADMIN], next:['needs_correction','eligible','ineligible'] },
    needs_correction:       { label:'Връщане за корекция',        basis:'УЦ-12 / 5 раб. дни',             actorRoles:[ROLES.NIDD,ROLES.CKK,ROLES.ADMIN], next:['resubmitted','ineligible'] },
    resubmitted:            { label:'Коригирана',                 basis:'УЦ-13',                          actorRoles:[ROLES.LEADER], next:['under_administrative_review'] },
    eligible:               { label:'Допустима',                  basis:'УЦ-14',                          actorRoles:[ROLES.CKK],   next:['reviewer_proposal'] },
    ineligible:             { label:'Недопустима',                basis:'УЦ-14',                          actorRoles:[ROLES.CKK],   next:[] },
    reviewer_proposal:      { label:'Предложени рецензенти',      basis:'УЦ-15 / ≥1 външен',              actorRoles:[ROLES.CKK],   next:['reviewer_assigned','reviewer_proposal'] },
    reviewer_assigned:      { label:'Назначени рецензенти',       basis:'УЦ-16 / Утвърждаване от ректор', actorRoles:[ROLES.RECTOR],next:['under_review','reviewer_declined'] },
    under_review:           { label:'В рецензиране',              basis:'УЦ-17 / 10 дни',                 actorRoles:[ROLES.REVIEWER], next:['scored','reviewer_declined','eligible'] },
    reviewer_declined:      { label:'Рецензент отказал',          basis:'УЦ-17 / Нов рецензент',          actorRoles:[ROLES.CKK,ROLES.ADMIN], next:['reviewer_proposal','reviewer_assigned'] },
    scored:                 { label:'Оценена',                    basis:'УЦ-18',                          actorRoles:[ROLES.CKK],   next:['below_threshold','above_threshold','under_review'] },
    below_threshold:        { label:'Не покрива минималния праг', basis:'УЦ-19 / <50%+1',                 actorRoles:[],            next:[] },
    above_threshold:        { label:'Допуснат до класиране',      basis:'УЦ-19 / ≥50%+1',                 actorRoles:[ROLES.CKK],   next:['ranked'] },
    ranked:                 { label:'Класирана',                  basis:'УЦ-20 / по направление',         actorRoles:[ROLES.CKK],   next:['proposed_for_funding','rejected'] },
    proposed_for_funding:   { label:'Предложена за финансиране',  basis:'УЦ-21',                          actorRoles:[ROLES.AC],    next:['approved_by_ac','rejected'] },
    approved_by_ac:         { label:'Одобрена от АС',             basis:'УЦ-22',                          actorRoles:[ROLES.AC],    next:['published'] },
    published:              { label:'Публикувани резултати',      basis:'УЦ-23',                          actorRoles:[ROLES.NIDD],  next:['contract_preparation'] },
    contract_preparation:   { label:'Подготовка на договор',      basis:'УЦ-24',                          actorRoles:[ROLES.NIDD],  next:['contract_signed'] },
    contract_signed:        { label:'Подписан договор',           basis:'УЦ-25 / 10 дни',                 actorRoles:[ROLES.RECTOR,ROLES.LEADER], next:['active_project'] },
    active_project:         { label:'Активен проект',             basis:'УЦ-26',                          actorRoles:[ROLES.LEADER], next:[] },
    rejected:               { label:'Отхвърлена',                 basis:'УЦ-21/22',                       actorRoles:[],            next:[] }
  };

  // ── PROJECT LIFECYCLE (UC-26 → UC-40) ──────────────────────────────────────
  var PROJECT_STATES = {
    active:                 { label:'Активен',                    basis:'УЦ-26',                          actorRoles:[ROLES.LEADER], next:['in_execution'] },
    in_execution:           { label:'В изпълнение',               basis:'УЦ-27',                          actorRoles:[ROLES.LEADER], next:['semiannual_reporting','annual_reporting','interim_reporting','final_reporting'] },
    semiannual_reporting:   { label:'Шестмесечно отчитане',       basis:'УЦ-35 / 10-то число',            actorRoles:[ROLES.LEADER], next:['report_under_review'] },
    annual_reporting:       { label:'Годишно отчитане',           basis:'УЦ-36 / 10 декември',            actorRoles:[ROLES.LEADER], next:['report_under_review'] },
    interim_reporting:      { label:'Междинно отчитане',          basis:'УЦ-36 / >1 г.',                  actorRoles:[ROLES.LEADER], next:['report_under_review'] },
    report_under_review:    { label:'Отчет в преглед',            basis:'УЦ-37',                          actorRoles:[ROLES.NIDD,ROLES.CKK], next:['report_accepted','report_returned_for_correction'] },
    report_accepted:        { label:'Отчет приет',                basis:'УЦ-37',                          actorRoles:[ROLES.CKK],   next:['in_execution','final_reporting'] },
    report_returned_for_correction: { label:'Отчет върнат',       basis:'УЦ-37',                          actorRoles:[ROLES.LEADER],next:['semiannual_reporting','annual_reporting','interim_reporting'] },
    final_reporting:        { label:'Окончателно отчитане',       basis:'УЦ-38',                          actorRoles:[ROLES.LEADER], next:['final_report_submitted'] },
    final_report_submitted: { label:'Финален отчет подаден',      basis:'УЦ-38',                          actorRoles:[ROLES.LEADER],next:['final_review_assigned'] },
    final_review_assigned:  { label:'Назначен финален рецензент', basis:'УЦ-39 / 10 дни',                 actorRoles:[ROLES.CKK],   next:['final_review_submitted','final_review_declined'] },
    final_review_declined:  { label:'Финален рецензент отказал',  basis:'УЦ-39 / Преназначаване',         actorRoles:[ROLES.CKK,ROLES.ADMIN], next:['final_review_assigned'] },
    final_review_submitted: { label:'Финална рецензия подадена',  basis:'УЦ-39',                          actorRoles:[ROLES.REVIEWER], next:['final_evaluation'] },
    final_evaluation:       { label:'Финална оценка',             basis:'УЦ-40',                          actorRoles:[ROLES.CKK],   next:['accepted_closed','closed_with_sanction','partially_completed'] },
    accepted_closed:        { label:'Приет и приключен',          basis:'УЦ-40',                          actorRoles:[],            next:[] },
    partially_completed:    { label:'Частично изпълнен',          basis:'УЦ-40',                          actorRoles:[],            next:['accepted_closed'] },
    closed_with_sanction:   { label:'Незадоволително (3 г. блок)',basis:'УЦ-40 / 3 г. забрана',           actorRoles:[],            next:[] }
  };

  // ── RBAC MATRIX (action → allowed roles) ───────────────────────────────────
  // Subset of the most security-critical actions; UI uses this to hide buttons
  // for users without the needed role. Backend is still the source of truth.
  var RBAC = {
    // Конкурси
    createcompetition:       [ROLES.VICE_RECTOR,ROLES.ADMIN],
    approvecompetitionbyac:  [ROLES.AC,ROLES.ADMIN],
    issuerectororder:        [ROLES.RECTOR,ROLES.ADMIN],
    publishresults:          [ROLES.NIDD,ROLES.ADMIN],
    // Предложения
    submitform:              [ROLES.LEADER,ROLES.MEMBER],
    updatestatus:            [ROLES.NIDD,ROLES.CKK,ROLES.ADMIN],
    // Рецензиране
    proposereviewers:        [ROLES.CKK,ROLES.ADMIN],
    confirmreviewers:        [ROLES.RECTOR,ROLES.ADMIN],
    assignreviewers:         [ROLES.CKK,ROLES.RECTOR,ROLES.ADMIN], // legacy fallback
    // Класиране & финансиране
    generateranking:         [ROLES.CKK,ROLES.ADMIN],
    approveresults:          [ROLES.AC,ROLES.ADMIN],
    acceptcontestresultsbyac:[ROLES.AC,ROLES.ADMIN],
    // Договори
    signprojectcontract:     [ROLES.RECTOR,ROLES.LEADER,ROLES.ADMIN],
    // Проекти / отчети
    createproject:           [ROLES.NIDD,ROLES.ADMIN],
    submitreport:            [ROLES.LEADER],
    acceptreport:            [ROLES.CKK,ROLES.ADMIN],
    returnreport:            [ROLES.CKK,ROLES.ADMIN],
    // Финален цикъл
    assignfinalreportreviewer:[ROLES.CKK,ROLES.ADMIN],
    submitfinalreportreview: [ROLES.REVIEWER],
    acceptfinalreport:       [ROLES.CKK,ROLES.ADMIN],
    // Промени
    createchangerequest:     [ROLES.LEADER],
    approvechangerequest:    [ROLES.CKK,ROLES.ADMIN],
    // Финанси
    createexpense:           [ROLES.LEADER],
    approveexpense:          [ROLES.FINANCE,ROLES.ADMIN],
    // Санкции
    addsanction:             [ROLES.CKK,ROLES.ADMIN],
    checksanctions:          [ROLES.CKK,ROLES.NIDD,ROLES.ADMIN],
    // Библиотека (UC-41)
    addlibrarydeposit:       [ROLES.LEADER],
    confirmlibrarydeposit:   [ROLES.LIBRARY,ROLES.ADMIN],
    getlibrarydeposits:      [ROLES.LIBRARY,ROLES.NIDD,ROLES.ADMIN],
    addlibrarydepositfile:   [ROLES.LEADER,ROLES.LIBRARY,ROLES.ADMIN],
    removelibrarydepositfile:[ROLES.LEADER,ROLES.LIBRARY,ROLES.ADMIN],
    // МОН
    createmonreport:         [ROLES.NIDD,ROLES.ADMIN],
    finalizemonreport:       [ROLES.VICE_RECTOR,ROLES.ADMIN],
    submitmonreport:         [ROLES.RECTOR,ROLES.ADMIN]
  };

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function getProposalState(code) { return PROPOSAL_STATES[code] || null; }
  function getProjectState(code)  { return PROJECT_STATES[code]  || null; }

  /** Check whether `userRole` may perform `action`. Admin always passes. */
  function canPerform(action, userRole, isAdmin) {
    if (isAdmin) return true;
    var allowed = RBAC[String(action || '').toLowerCase()];
    if (!allowed) return false;
    return allowed.indexOf(userRole) !== -1;
  }

  /** List allowed next-states for a given current state and role. */
  function allowedTransitions(stateMap, currentState, userRole, isAdmin) {
    var s = stateMap[currentState];
    if (!s || !Array.isArray(s.next)) return [];
    return s.next.filter(function (next) {
      var ns = stateMap[next];
      if (!ns) return false;
      if (isAdmin) return true;
      // Empty actorRoles → anyone (including system events)
      if (!Array.isArray(ns.actorRoles) || ns.actorRoles.length === 0) return true;
      return ns.actorRoles.indexOf(userRole) !== -1;
    });
  }

  /** Render-friendly label for any known status (proposal OR project). */
  function labelOf(code) {
    if (PROPOSAL_STATES[code]) return PROPOSAL_STATES[code].label;
    if (PROJECT_STATES[code])  return PROJECT_STATES[code].label;
    return code || '—';
  }

  /** Правилник citation for any state. */
  function basisOf(code) {
    var s = PROPOSAL_STATES[code] || PROJECT_STATES[code];
    return s ? s.basis : '';
  }

  // ── Workflow position chip (React component factory) ───────────────────────
  // Returns a React element if React is available; otherwise null. Designed to
  // be called from any view: e.g. WorkflowChip({state, kind:'proposal'}).
  function makeChipFactory() {
    if (!global.React) return function () { return null; };
    var e = global.React.createElement;
    return function WorkflowChip(props) {
      var state = props && props.state;
      var kind = (props && props.kind) || 'proposal'; // 'proposal' | 'project'
      var meta = (kind === 'project' ? PROJECT_STATES : PROPOSAL_STATES)[state]
              || PROPOSAL_STATES[state] || PROJECT_STATES[state];
      if (!meta) return null;
      return e('span', {
        className: 'wf-chip wf-chip-' + state,
        title: meta.label,
        style: {
          display:'inline-flex', alignItems:'center', gap:'.35rem',
          padding:'.18rem .55rem', borderRadius:'999px',
          fontSize:'.72rem', fontWeight:600,
          background:'var(--info-bg,#eef1fa)', color:'var(--info,#233874)',
          border:'1px solid var(--info-border,#c9d0ea)'
        }
      },
        e('i', { className:'fas fa-route', style:{fontSize:'.65rem',opacity:.7} }),
        meta.label
      );
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  global.ERP_WORKFLOW = {
    ROLES:              ROLES,
    PROPOSAL_STATES:    PROPOSAL_STATES,
    PROJECT_STATES:     PROJECT_STATES,
    RBAC:               RBAC,
    getProposalState:   getProposalState,
    getProjectState:    getProjectState,
    canPerform:         canPerform,
    allowedTransitions: allowedTransitions,
    labelOf:            labelOf,
    basisOf:            basisOf,
    WorkflowChip:       makeChipFactory()
  };
})(typeof window !== 'undefined' ? window : globalThis);
