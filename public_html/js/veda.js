/*
 * VEDA core module — standalone preloadable script for UEV-ERP.
 * Wraps Scopus + ORCID APIs to build a full dossier of university staff.
 *
 * SECURITY/CONFIG CONTRACT:
 *   No API keys / tokens / endpoints are hardcoded here. Everything is read
 *   from the backend 'veda_config' action at runtime. If a service key or
 *   token is missing, the module degrades gracefully and surfaces a
 *   'needs configuration' state to the UI via the returned shapes.
 *
 * LOADING: plain <script> include like the other js/*.js files.
 *   Exposes a single global: window.Veda
 */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------
   * User-facing message map (BG default, EN fallback)
   * Keyed by window.__ERP_LANG (falls back to 'bg').
   * ------------------------------------------------------------------- */
  var MESSAGES = {
    bg: {
      needsConfig: 'VEDA се нуждае от конфигурация (липсва API ключ/токен).',
      noConfig: 'Липсва конфигурация за VEDA.',
      scopusMissing: 'Scopus API ключът липсва — Scopus е деактивиран.',
      orcidMissing: 'ORCID токенът липсва — ORCID е деактивиран.',
      llmDisabled: 'LLM е деактивиран — използва се правило-базиран отговор.',
      netError: 'Мрежова грешка при свързване с VEDA услугата.',
      timeout: 'Изтече времето за отговор от VEDA услугата.',
      badJson: 'Невалиден отговор от сървъра (не е JSON).',
      serverError: 'Сървърът върна грешка: '
    },
    en: {
      needsConfig: 'VEDA needs configuration (missing API key/token).',
      noConfig: 'VEDA configuration is missing.',
      scopusMissing: 'Scopus API key is missing — Scopus disabled.',
      orcidMissing: 'ORCID token is missing — ORCID disabled.',
      llmDisabled: 'LLM is disabled — using rule-based answer.',
      netError: 'Network error connecting to VEDA service.',
      timeout: 'VEDA service request timed out.',
      badJson: 'Invalid server response (not JSON).',
      serverError: 'Server returned an error: '
    }
  };

  function lang() {
    var l = (global.__ERP_LANG || 'bg');
    if (typeof l === 'string') { l = l.toLowerCase().slice(0, 2); }
    return MESSAGES[l] ? l : 'bg';
  }
  function msg(key) {
    var m = MESSAGES[lang()];
    return m[key] || key;
  }

  /* ---------------------------------------------------------------------
   * Internal cached config (populated by loadConfig / used by ask()).
   * ------------------------------------------------------------------- */
  var _config = null;

  /* ---------------------------------------------------------------------
   * Endpoint resolution: prefer an existing app api client / config,
   * otherwise fall back to the standard ERP api path.
   * ------------------------------------------------------------------- */
  function apiEndpoint() {
    if (global.UEVApi && typeof global.UEVApi.endpoint === 'function') {
      return global.UEVApi.endpoint();
    }
    if (global.ERP_CONFIG && global.ERP_CONFIG.apiUrl) {
      return global.ERP_CONFIG.apiUrl;
    }
    return 'database/api.php';
  }

  /* ---------------------------------------------------------------------
   * Single internal network helper.
   * POSTs (or GETs) JSON to the ERP API and normalizes every outcome so
   * callers never deal with raw fetch / JSON / envelope errors.
   * Resolves ALWAYS to { ok:true, data } or { ok:false, error }.
   * Never rejects.
   * ------------------------------------------------------------------- */
  function _api(action, body, method) {
    method = method || 'POST';
    body = body || {};
    var endpoint = apiEndpoint();
    var sep = endpoint.indexOf('?') === -1 ? '?' : '&';
    var url = endpoint + sep + 'action=' + encodeURIComponent(action);

    var opts = { method: method, headers: { 'Accept': 'application/json' } };

    if (method === 'POST') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (body && Object.keys(body).length) {
      Object.keys(body).forEach(function (k) {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(body[k]);
      });
    }

    var controller = null;
    var timeoutId = null;
    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      opts.signal = controller.signal;
      timeoutId = setTimeout(function () { controller.abort(); }, 15000);
    }

    var p;
    if (typeof fetch === 'function') {
      p = fetch(url, opts);
    } else if (global.jQuery && global.jQuery.ajax) {
      // Legacy jQuery fallback for older pages.
      p = new Promise(function (resolve, reject) {
        global.jQuery.ajax({
          url: url,
          type: method,
          dataType: 'json',
          contentType: 'application/json',
          data: method === 'POST' ? JSON.stringify(body) : body,
          success: function (d) {
            resolve({ json: function () { return Promise.resolve(d); }, ok: true, status: 200 });
          },
          error: function (xhr, text) {
            reject(new Error(text || 'ajax_error'));
          }
        });
      });
    } else {
      return Promise.resolve({ ok: false, error: 'No HTTP client available (fetch/jQuery missing).' });
    }

    return p.then(function (resp) {
      if (timeoutId) { clearTimeout(timeoutId); }
      if (!resp) { return { ok: false, error: msg('netError') }; }
      if (typeof resp.ok === 'boolean' && resp.ok === false) {
        return { ok: false, error: msg('serverError') + (resp.status || '') };
      }
      return resp.json().then(function (json) {
        // Standard ERP envelope: { success:true, data:... }
        if (json && typeof json === 'object' && ('success' in json)) {
          if (json.success === false) {
            return { ok: false, error: msg('serverError') + (json.error || 'unknown') };
          }
          return { ok: true, data: (json.data !== undefined ? json.data : json) };
        }
        // Allow bare data responses too.
        return { ok: true, data: json };
      }, function () {
        return { ok: false, error: msg('badJson') };
      });
    }, function (err) {
      if (timeoutId) { clearTimeout(timeoutId); }
      if (controller && controller.signal && controller.signal.aborted) {
        return { ok: false, error: msg('timeout') };
      }
      return { ok: false, error: msg('netError') + ' ' + (err && err.message ? err.message : '') };
    });
  }

  /* =====================================================================
   * PUBLIC API
   * ===================================================================== */
  var Veda = {};

  /**
   * Load VEDA configuration from the backend (action 'veda_config', GET).
   * No credentials are stored client-side; presence flags indicate what
   * the backend currently has configured.
   * @async
   * @returns {Promise<{ok:boolean, error?:string, data?:{
   *   scopusEnabled:boolean, orcidEnabled:boolean, llmEnabled:boolean,
   *   hasScopusKey:boolean, hasOrcidToken:boolean
   * }}>}
   */
  Veda.loadConfig = function () {
    return _api('veda_config', {}, 'GET').then(function (r) {
      if (!r.ok) { return r; }
      var d = r.data || {};
      _config = d;
      return {
        ok: true,
        data: {
          scopusEnabled: !!d.scopusEnabled,
          orcidEnabled: !!d.orcidEnabled,
          llmEnabled: !!d.llmEnabled,
          hasScopusKey: !!d.hasScopusKey,
          hasOrcidToken: !!d.hasOrcidToken
        }
      };
    });
  };

  /**
   * Persist VEDA configuration (credentials) to the backend
   * (action 'veda_config', POST). NEVER hardcodes keys — they are passed
   * in by the caller and forwarded to the server for secure storage.
   * @async
   * @param {Object} cfg - { scopusApiKey, orcidToken, llmEndpoint, llmKey }
   * @returns {Promise<{ok:boolean, error?:string, data?:*}>}
   */
  Veda.saveConfig = function (cfg) {
    cfg = cfg || {};
    return _api('veda_config', {
      scopusApiKey: (cfg.scopusApiKey || ''),
      orcidToken: cfg.orcidToken || '',
      llmEndpoint: cfg.llmEndpoint || '',
      llmKey: cfg.llmKey || ''
    }, 'POST');
  };

  /**
   * Search for candidate university staff by name / affiliation.
   * @async
   * @param {string} query
   * @returns {Promise<{ok:boolean, error?:string, data?:Array<{
   *   name:string, orcid:string, scopusAuthorId:string,
   *   affiliation:string, score:number
   * }}>}>}
   */
  Veda.searchStaff = function (query) {
    return _api('veda_search', { query: query || '' }).then(function (r) {
      if (!r.ok) { return r; }
      var list = Array.isArray(r.data)
        ? r.data
        : (r.data && Array.isArray(r.data.results) ? r.data.results : []);
      return { ok: true, data: list };
    });
  };

  /**
   * Fetch and normalize a dossier for a staff member.
   * @async
   * @param {{orcid?:string, scopusAuthorId?:string}} ids
   * @returns {Promise<{ok:boolean, error?:string, data?:Object}>}
   *          data is the normalized dossier shape (see compileDossier).
   */
  Veda.getDossier = function (ids) {
    ids = ids || {};
    return _api('veda_dossier', {
      orcid: ids.orcid || '',
      scopusAuthorId: ids.scopusAuthorId || '',
      refresh: !!ids.refresh
    }).then(function (r) {
      if (!r.ok) { return r; }
      return { ok: true, data: Veda.compileDossier(r.data) };
    });
  };

  /**
   * Pure normalization: turn a raw backend dossier into the canonical shape
   * so the UI never re-parses raw payloads. Safe to call with null/undefined.
   *
   * Normalized shape:
   * {
   *   identity:{name, orcid, scopusAuthorId, affiliation, email?},
   *   metrics:{hIndex?, documentCount?, citationCount?, i10?,
   *            scopusCount?, orcidWorkCount?},
   *   publications:[{title, year, source, type, authors, doi?, link?, citedBy?}],
   *   employments:[{org, role, start, end}],
   *   education:[{org, degree, start, end}],
   *   funding:[{title, agency, amount?, period?}],
   *   lastSynced:ISOString
   * }
   *
   * @param {Object} raw - raw backend dossier payload
   * @returns {Object} normalized dossier
   */
  Veda.compileDossier = function (raw) {
    raw = raw || {};
    function arr(x) { return Array.isArray(x) ? x : []; }
    function str(x) { return (x === null || x === undefined) ? '' : String(x); }
    function num(x) { var n = Number(x); return isFinite(n) ? n : undefined; }

    var identity = raw.identity || raw.person || {};
    var metrics = raw.metrics || {};

    var publications = arr(raw.publications || raw.works || []).map(function (p) {
      p = p || {};
      return {
        title: str(p.title || p.name),
        year: num(p.year || p.publicationDate),
        source: str(p.source || p.journal || p.venue),
        type: str(p.type || p.subtype),
        authors: arr(p.authors || p.creators).map(function (a) {
          return typeof a === 'string' ? a : str(a.name || a.fullName);
        }),
        doi: p.doi ? str(p.doi) : undefined,
        link: (p.link || p.url) ? str(p.link || p.url) : undefined,
        citedBy: num(p.citedBy || p.citedByCount)
      };
    });

    var employments = arr(raw.employments || []).map(function (e) {
      e = e || {};
      return {
        org: str(e.org || e.organization || e.name),
        role: str(e.role || e.title),
        start: str(e.start || e.startDate),
        end: str(e.end || e.endDate)
      };
    });

    var education = arr(raw.education || []).map(function (e) {
      e = e || {};
      return {
        org: str(e.org || e.organization || e.name),
        degree: str(e.degree || e.title),
        start: str(e.start || e.startDate),
        end: str(e.end || e.endDate)
      };
    });

    var funding = arr(raw.funding || raw.grants || []).map(function (f) {
      f = f || {};
      return {
        title: str(f.title || f.name),
        agency: str(f.agency || f.funder),
        amount: f.amount ? str(f.amount) : undefined,
        period: f.period ? str(f.period) : undefined
      };
    });

    var lastSynced;
    try { lastSynced = new Date().toISOString(); } catch (e) { lastSynced = ''; }

    return {
      identity: {
        name: str(identity.name || identity.fullName),
        orcid: str(identity.orcid),
        scopusAuthorId: str(identity.scopusAuthorId),
        affiliation: str(identity.affiliation),
        email: identity.email ? str(identity.email) : undefined
      },
      metrics: {
        hIndex: num(metrics.hIndex || metrics.h_index),
        documentCount: num(metrics.documentCount || metrics.doc_count),
        citationCount: num(metrics.citationCount || metrics.citation_count),
        i10: num(metrics.i10),
        scopusCount: num(metrics.scopusCount),
        orcidWorkCount: num(metrics.orcidWorkCount)
      },
      publications: publications,
      employments: employments,
      education: education,
      funding: funding,
      lastSynced: lastSynced
    };
  };

  /**
   * Ask VEDA a natural-language question about a (normalized) dossier.
   * If the LLM is disabled the backend returns a rule-based retrieval answer;
   * the UI simply renders it. Passes the cached config so the backend can
   * decide whether LLM vs rule-based is available.
   * @async
   * @param {string} question
   * @param {Object} dossier - normalized dossier (from compileDossier)
   * @returns {Promise<{ok:boolean, error?:string, data?:{
   *   answer:string, citations?:Array, needs_config?:boolean
   * }}>}
   */
  Veda.ask = function (question, dossier) {
    return _api('veda_chat', {
      question: question || '',
      dossier: dossier || null,
      config: _config || null
    }).then(function (r) {
      if (!r.ok) { return r; }
      var d = r.data || {};
      return {
        ok: true,
        data: {
          answer: str(d.answer),
          citations: Array.isArray(d.citations) ? d.citations : [],
          needs_config: !!d.needs_config
        }
      };
    });
  };

  /**
   * Verify a Google ID token server-side and return the authenticated profile.
   * Free backend path: uses Google's public tokeninfo endpoint via the PHP
   * handler registered as `googleauthemail`. No secrets are stored client-side.
   * @async
   * @param {string} idToken
   * @returns {Promise<{ok:boolean, error?:string, data?:{email:string,name:string,picture:string,email_verified:boolean,hd:string}}>}
   */
  Veda.getGoogleAuthUserEmail = function (idToken) {
    return _api('googleauthemail', { id_token: idToken || '' }).then(function (r) {
      if (!r) { return { ok: false, error: 'empty_response' }; }
      if (!r.ok) { return { ok: false, error: r.error || 'google_auth_failed' }; }
      var d = r.data || {};
      var email = String(d.email || '').toLowerCase().trim();
      if (!email) { return { ok: false, error: r.error || 'missing_email' }; }
      return {
        ok: true,
        data: {
          email: email,
          name: String(d.name || ''),
          picture: String(d.picture || ''),
          email_verified: !!d.email_verified,
          hd: String(d.hd || ''),
        },
      };
    });
  };

  global.Veda = Veda;

  // ════════════════════════════════════════════════════════════════
  // EPIC-D Research intelligence (T24/T25/T26/T150) — frontend bridge.
  // Mirrors the existing Veda.* promise shape (returns {ok, data|error}).
  // ════════════════════════════════════════════════════════════════

  // T150 — AI writing assistant for application text.
  Veda.write = function (text, opts) {
    opts = opts || {};
    return _api('vedawrite', {
      text: text || '',
      mode: opts.mode || 'improve',          // improve | draft | translate-bg
      instructions: opts.instructions || '',
      projectType: opts.projectType || ''    // ФНИ | ПНИ | ДНП | НПФ — tailors the system prompt (veda_prompts)
    }).then(function (r) {
      if (!r.ok) { return r; }
      var d = r.data || {};
      return { ok: true, data: { text: str(d.text), mode: str(d.mode) } };
    });
  };

  // T24 — Citation export (APA / MLA / Chicago).
  Veda.cite = function (publications, style) {
    return _api('vedacite', {
      publications: publications || [],
      style: style || 'apa'
    }).then(function (r) {
      if (!r.ok) { return r; }
      var d = r.data || {};
      return { ok: true, data: { style: str(d.style), citations: Array.isArray(d.citations) ? d.citations : [] } };
    });
  };

  // T25 — BibTeX import -> normalized publications.
  Veda.bibtexImport = function (bibtex) {
    return _api('vedabibteximport', { bibtex: bibtex || '' }).then(function (r) {
      if (!r.ok) { return r; }
      var d = r.data || {};
      return { ok: true, data: { count: (d.count || 0), publications: Array.isArray(d.publications) ? d.publications : [] } };
    });
  };

  // T26 — VEDA metrics for the dashboard.
  Veda.metrics = function () {
    return _api('vedametrics', {}).then(function (r) {
      if (!r.ok) { return r; }
      var d = r.data || {};
      return { ok: true, data: { metrics: d.metrics || {} } };
    });
  };

  // T27 — Co-author network graph.
  Veda.coauthorNetwork = function (dossierId) {
    return _api('vedacoauthornetwork', { dossierId: dossierId || '' }).then(function (r) {
      if (!r.ok) { return r; }
      var d = r.data || {};
      return { ok: true, data: { nodes: Array.isArray(d.nodes) ? d.nodes : [], edges: Array.isArray(d.edges) ? d.edges : [] } };
    });
  };

})(typeof window !== 'undefined' ? window : this);

