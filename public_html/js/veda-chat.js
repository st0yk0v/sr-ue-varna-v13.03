/*
 * veda-chat.js — VEDA Research Assistant UI for UEV-ERP.
 * A custom-tailored AI chatbot that wraps Scopus + ORCID APIs to build
 * full dossiers of university staff, answer research questions, and manage
 * document intelligence. Renders into a container div via the imperative
 * mount contract that app.js's VedaPanel already calls.
 *
 * LOADING: plain <script> include (preloadable) like the other js/*.js files.
 *   Exposes window.VedaChat.render(container, props) and .destroy().
 *
 * SECURITY: No API keys/tokens/endpoints are hardcoded. All secrets live in
 * the backend veda_config.json (loaded/saved via Veda.loadConfig/saveConfig).
 * This module is purely a UI shell over the window.Veda API client.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * BG/EN message map
   * ------------------------------------------------------------------ */
  var MSG = {
    bg: {
      title: 'VEDA Асистент',
      subtitle: 'Изследовски интелект за преподавател и публикации',
      search: 'Търсене на преподавател...',
      searchBtn: 'Търси',
      searchHint: 'Въведете име на преподавател за търсене в ORCID (и Scopus, ако е конфигуриран)',
      noResults: 'Няма намерени резултати',
      loading: 'Зареждане…',
      dossier: 'Досие',
      chat: 'Чат',
      config: 'Конфигурация',
      staff: 'Колеги',
      publications: 'Публикации',
      metrics: 'Метрики',
      employments: 'Трудов стаж',
      education: 'Образование',
      funding: 'Финансиране',
      hIndex: 'h-index',
      docCount: 'Документи',
      citations: 'Цитирания',
      orcidLabel: 'ORCID',
      scopusLabel: 'Scopus',
      lastSynced: 'Опреснено',
      askPlaceholder: 'Задайте въпрос за преподавателя...',
      askBtn: 'Питай',
      needsConfig: 'VEDA изисква конфигурация (Scopus API ключ). ORCID работи без ключ.',
      configure: 'Конфигурирай',
      save: 'Запази',
      cancel: 'Отказ',
      scopusKey: 'Scopus API ключ',
      orcidToken: 'ORCID токен',
      llmEndpoint: 'LLM крайна точка',
      llmKey: 'LLM ключ',
      saved: 'Запазено успешно',
      saveFailed: 'Грешка при запис',
      searchFirst: 'Първо потърсете преподавател',
      noDossier: 'Няма заредено досие. Изберете преподавател от търсенето.',
      greeting: 'Здравейте! Аз съм VEDA асистентът. Потърсете преподавател, за да заредя пълното му досие, или ми задайте въпрос.',
      netError: 'Мрежова грешка',
      noScopus: 'Scopus ключът не е конфигуриран — показва се само ORCID.',
      teacherCol: 'Преподавател',
      deptCol: 'Катедра',
      selectBtn: 'Избери',
      useInApplication: 'Използвай в заявлението',
      cached: 'кeширано',
      refreshDossier: 'Опресни от ORCID/Scopus',
      writing: 'Писане',
      writingHint: 'Подобрете, черновицайте или преведете текст от заявлението с VEDA.',
      writeMode: 'Режим',
      modeImprove: 'Подобри',
      modeDraft: 'Чернова',
      modeTranslate: 'Превод (BG)',
      projectType: 'Тип проект',
      projectTypeAll: 'Общ (всички типове)',
      instructions: 'Допълнителни инструкции (по избор)',
      instructionsPlaceholder: 'Напр. акцентирай върху иновациите и очакванията за въздействие…',
      inputText: 'Вашият текст',
      inputPlaceholder: 'Въведете или поставете текст от заявлението…',
      writeRun: 'Генерирай',
      writeInsert: 'Вмъкни в заявлението',
      writeCopy: 'Копирай',
      writeResult: 'Резултат',
      writeEmpty: 'Няма генериран текст още.',
      llmNotConfigured: 'VEDA писането не е конфигурирано (липсва LLM крайна точка/ключ).',
      writeError: 'Грешка при генериране',
      proseTip: 'Съвет: поставете курсора в поле на заявлението, за да вмъкнете директно на позицията.',
      citationStyle: 'Стил цитиране',
      exportCitations: 'Експортирай цитати',
      bibtexImport: 'Импорт от BibTeX',
      copyCitations: 'Копирай',
      citationsCopied: 'Цитатите са копирани',
      importBibtex: 'Импортирай',
      bibtexPlaceholder: 'Вмъкнете BibTeX записи тук…',
      importedPubs: 'Импортирани публикации',
      noPublications: 'Няма налични публикации за експорт.',
      metricsDashboard: 'Метрики — Табло',
      metricsTotalDossiers: 'Общо досия',
      metricsSynced: 'Синхронизирани',
      metricsWithWorks: 'С публикации',
      metricsTotalCitations: 'Общо цитирания',
      metricsTotalPubs: 'Общо публикации',
      metricsHIndexDist: 'h-index разпределение',
      coauthorNetwork: 'Мрежа на съавторите',
      coauthorHint: 'Визуализира връзките между съавторите на базата на публикациите.',
      coauthorLoading: 'Зареждане на мрежата...',
      noCoauthors: 'Няма намерени съавтори.',
      networkNodeCount: 'Автори',
      networkEdgeCount: 'Връзки',
    },
    en: {
      title: 'VEDA Assistant',
      subtitle: 'Research intelligence for faculty & publications',
      search: 'Search faculty…',
      searchBtn: 'Search',
      searchHint: 'Enter a faculty name to search ORCID (and Scopus, if configured)',
      noResults: 'No results found',
      loading: 'Loading…',
      dossier: 'Dossier',
      chat: 'Chat',
      config: 'Config',
      staff: 'Faculty',
      publications: 'Publications',
      metrics: 'Metrics',
      employments: 'Employment',
      education: 'Education',
      funding: 'Funding',
      hIndex: 'h-index',
      docCount: 'Documents',
      citations: 'Citations',
      orcidLabel: 'ORCID',
      scopusLabel: 'Scopus',
      lastSynced: 'Synced',
      askPlaceholder: 'Ask a question about the faculty member…',
      askBtn: 'Ask',
      needsConfig: 'VEDA needs configuration (Scopus API key). ORCID works without a key.',
      configure: 'Configure',
      save: 'Save',
      cancel: 'Cancel',
      scopusKey: 'Scopus API key',
      orcidToken: 'ORCID token',
      llmEndpoint: 'LLM endpoint',
      llmKey: 'LLM key',
      saved: 'Saved successfully',
      saveFailed: 'Save failed',
      searchFirst: 'Search for a faculty member first',
      noDossier: 'No dossier loaded. Select a faculty member from search.',
      greeting: 'Hello! I am the VEDA assistant. Search for a faculty member to load their full dossier, or ask me a question.',
      netError: 'Network error',
      noScopus: 'Scopus key not configured — showing ORCID only.',
      teacherCol: 'Faculty',
      deptCol: 'Department',
      selectBtn: 'Select',
      useInApplication: 'Use in application',
      cached: 'cached',
      refreshDossier: 'Refresh from ORCID/Scopus',
      writing: 'Writing',
      writingHint: 'Improve, draft, or translate proposal text with VEDA.',
      writeMode: 'Mode',
      modeImprove: 'Improve',
      modeDraft: 'Draft',
      modeTranslate: 'Translate (BG)',
      projectType: 'Project type',
      projectTypeAll: 'Generic (all types)',
      instructions: 'Extra instructions (optional)',
      instructionsPlaceholder: 'e.g. emphasize innovation and expected impact…',
      inputText: 'Your text',
      inputPlaceholder: 'Type or paste proposal text…',
      writeRun: 'Generate',
      writeInsert: 'Insert into application',
      writeCopy: 'Copy',
      writeResult: 'Result',
      writeEmpty: 'No generated text yet.',
      llmNotConfigured: 'VEDA writing is not configured (missing LLM endpoint/key).',
      writeError: 'Generation error',
      proseTip: 'Tip: place the caret in a proposal field to insert directly at the cursor.',
      citationStyle: 'Citation style',
      exportCitations: 'Export citations',
      bibtexImport: 'BibTeX import',
      copyCitations: 'Copy',
      citationsCopied: 'Citations copied',
      importBibtex: 'Import',
      bibtexPlaceholder: 'Paste BibTeX entries here…',
      importedPubs: 'Imported publications',
      noPublications: 'No publications available to export.',
      metricsDashboard: 'Metrics Dashboard',
      metricsTotalDossiers: 'Total dossiers',
      metricsSynced: 'Synced',
      metricsWithWorks: 'With publications',
      metricsTotalCitations: 'Total citations',
      metricsTotalPubs: 'Total publications',
      metricsHIndexDist: 'h-index distribution',
      coauthorNetwork: 'Co-author Network',
      coauthorHint: 'Visualizes co-author relationships based on publications.',
      coauthorLoading: 'Loading network…',
      noCoauthors: 'No co-authors found.',
      networkNodeCount: 'Authors',
      networkEdgeCount: 'Links',
    }
  };

  function lang() {
    var l = (typeof global.__ERP_LANG !== 'undefined' ? global.__ERP_LANG : 'bg');
    if (typeof l === 'string') l = l.toLowerCase().slice(0, 2);
    return MSG[l] ? l : 'bg';
  }
  function t(key) { var m = MSG[lang()]; return (m && m[key]) || key; }
  function str(x) { return (x === null || x === undefined) ? '' : String(x); }
  function num(x) { var n = Number(x); return isFinite(n) ? n : null; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDate(iso) {
    if (!iso) return '';
    try { var d = new Date(iso); if (isNaN(d)) return String(iso); return d.toLocaleDateString(lang() === 'bg' ? 'bg-BG' : 'en-US'); }
    catch (_) { return String(iso); }
  }

  /* Task 23 — insert a dossier summary into the currently-focused editor field
   * (proposal wizard textarea/contenteditable) via execCommand, with clipboard
   * fallback. Returns true if inserted at caret, false if clipboard-only. */
  function insertDossierIntoApplication(text) {
    try {
      var ae = (global.document && global.document.activeElement) ? global.document.activeElement : null;
      if (ae && (ae.isContentEditable || ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) {
        if (typeof global.document.execCommand === 'function' && global.document.execCommand('insertText', false, text)) return true;
        if (typeof ae.setRangeText === 'function') { ae.setRangeText(text, ae.selectionStart, ae.selectionEnd, 'end'); return true; }
      }
    } catch (_) {}
    try {
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text);
        if (typeof toast === 'function') toast('Досието е копирано в клипборда — поставете го в заявлението.', 'info');
        return false;
      }
    } catch (_) {}
    return false;
  }

  function buildDossierSummary(d) {
    var id = d.identity || {};
    var m = d.metrics || {};
    var lines = [];
    lines.push('Досие: ' + (id.name || '—'));
    if (id.affiliation) lines.push('Организация: ' + id.affiliation);
    if (id.email) lines.push('Имейл: ' + id.email);
    if (id.orcid) lines.push('ORCID: ' + id.orcid);
    if (m.hIndex != null) lines.push('h-index: ' + m.hIndex);
    if (m.citationCount != null) lines.push('Цитирания: ' + m.citationCount);
    if (m.documentCount != null) lines.push('Публикации: ' + m.documentCount);
    if (m.i10 != null) lines.push('i10-index: ' + m.i10);
    if (Array.isArray(d.publications) && d.publications.length) {
      lines.push('Ключови публикации:');
      d.publications.slice(0, 8).forEach(function (p) {
        lines.push('  • ' + (p.title || '—') + (p.year ? ' (' + p.year + ')' : '') + (p.doi ? ' DOI:' + p.doi : ''));
      });
    }
    if (Array.isArray(d.employments) && d.employments.length) {
      lines.push('Назначения:');
      d.employments.slice(0, 5).forEach(function (e2) {
        lines.push('  • ' + ([e2.role, e2.org].filter(Boolean).join(' @ ') || '—') + (e2.start ? ' (' + e2.start + (e2.end ? '–' + e2.end : '') + ')' : ''));
      });
    }
    return lines.join('\n');
  }

  /* ------------------------------------------------------------------ *\
   * T24 — Citation export (APA / MLA / Chicago) via Veda.cite.
   * Renders the formatted references list and supports copy-to-clipboard.
   * ------------------------------------------------------------------ */
  function exportCitations(style) {
    var pubs = (_state && _state.dossier && Array.isArray(_state.dossier.publications))
      ? _state.dossier.publications : [];
    if (!pubs.length) {
      if (typeof toast === 'function') toast(t('noPublications'), 'info');
      return;
    }
    _state.citeStyle = style || _state.citeStyle || 'apa';
    _state.citing = true;
    rerender();
    if (!global.Veda || typeof global.Veda.cite !== 'function') { _state.citing = false; rerender(); return; }
    global.Veda.cite(pubs, _state.citeStyle).then(function (r) {
      _state.citing = false;
      if (!r || !r.ok) { if (typeof toast === 'function') toast(t('netError'), 'error'); rerender(); return; }
      _state.citations = (r.data && Array.isArray(r.data.citations)) ? r.data.citations : [];
      _state.citeStyle = (r.data && r.data.style) || _state.citeStyle;
      rerender();
    }).catch(function () { _state.citing = false; if (typeof toast === 'function') toast(t('netError'), 'error'); rerender(); });
  }

  function copyCitations() {
    if (!_state.citations || !_state.citations.length) return;
    var text = _state.citations.join('\n');
    try {
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(text);
      } else {
        var ta = global.document.createElement('textarea');
        ta.value = text; global.document.body.appendChild(ta); ta.select();
        try { global.document.execCommand('copy'); } catch (_) {}
        global.document.body.removeChild(ta);
      }
      if (typeof toast === 'function') toast(t('citationsCopied'), 'success');
    } catch (_) {
      if (typeof toast === 'function') toast(t('netError'), 'error');
    }
  }

  /* ------------------------------------------------------------------ *\
   * T25 — BibTeX import via Veda.bibtexImport -> normalized publications.
   * ------------------------------------------------------------------ */
  function importBibtex() {
    var tex = (_state && _state.bibtexText) || '';
    if (!tex.trim()) {
      if (typeof toast === 'function') toast(t('bibtexPlaceholder'), 'info');
      return;
    }
    _state.importing = true;
    rerender();
    if (!global.Veda || typeof global.Veda.bibtexImport !== 'function') { _state.importing = false; rerender(); return; }
    global.Veda.bibtexImport(tex).then(function (r) {
      _state.importing = false;
      if (!r || !r.ok) { if (typeof toast === 'function') toast(t('saveFailed'), 'error'); rerender(); return; }
      _state.imported = (r.data && Array.isArray(r.data.publications)) ? r.data.publications : [];
      if (typeof toast === 'function') toast((r.data && r.data.count ? r.data.count : 0) + ' ' + t('importedPubs'), 'success');
      rerender();
    }).catch(function () { _state.importing = false; if (typeof toast === 'function') toast(t('netError'), 'error'); rerender(); });
  }

  /* ------------------------------------------------------------------ *
   * Style injection (scoped to .veda-chat-root)
   * ------------------------------------------------------------------ */
  function injectStyles() {
    if (global.document && !global.document.getElementById('veda-chat-styles')) {
      var s = global.document.createElement('style');
      s.id = 'veda-chat-styles';
      s.textContent = [
        '.veda-chat-root{display:flex;flex-direction:column;height:100%;min-height:0;font-family:var(--font-body,sans-serif);color:var(--ink,#2e2545)}',
        '.veda-tabs{display:flex;gap:0;border-bottom:2px solid var(--border,#E2E5F0);flex-shrink:0}',
        '.veda-tab{padding:.65rem 1.1rem;font-size:.78rem;font-weight:700;cursor:pointer;border:none;background:none;color:var(--ink-3,#555);border-bottom:3px solid transparent;margin-bottom:-2px;transition:all .15s}',
        '.veda-tab:hover{color:var(--primary,#233874)}',
        '.veda-tab.active{color:var(--primary,#233874);border-bottom-color:var(--primary,#233874)}',
        '.veda-tab .badge{margin-left:.35rem;font-size:.62rem;padding:.08rem .4rem;background:var(--bg-2,#ECEEF6);border-radius:999px}',
        '.veda-tab.active .badge{background:var(--primary,#233874);color:#fff}',
        '.veda-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:1rem}',
        '.veda-panel{display:none;height:100%;overflow-y:auto}',
        '.veda-panel.active{display:block}',
        /* Search */
        '.veda-search-row{display:flex;gap:.5rem;margin-bottom:.75rem}',
        '.veda-search-input{flex:1;padding:.55rem .8rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);font-size:.82rem;font-family:inherit}',
        '.veda-search-input:focus{outline:none;border-color:var(--primary,#233874);box-shadow:0 0 0 2px var(--primary-dim,rgba(35,56,116,.15))}',
        '.veda-btn{padding:.55rem 1.1rem;border:1px solid var(--primary,#233874);background:var(--primary,#233874);color:#fff;border-radius:var(--r-sm,8px);font-size:.78rem;font-weight:700;cursor:pointer;transition:all .15s;font-family:inherit}',
        '.veda-btn:hover{background:var(--primary-2,#1B2C5C)}',
        '.veda-btn:disabled{opacity:.5;cursor:not-allowed}',
        '.veda-btn-ghost{background:transparent;color:var(--primary,#233874)}',
        '.veda-btn-ghost:hover{background:var(--bg-2,#ECEEF6)}',
        '.veda-results{display:grid;gap:.5rem;margin-top:.5rem}',
        '.veda-result-card{padding:.7rem .9rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);cursor:pointer;transition:all .15s}',
        '.veda-result-card:hover{border-color:var(--primary,#233874);background:var(--bg,#f7f8fc)}',
        '.veda-result-name{font-weight:700;font-size:.85rem}',
        '.veda-result-meta{font-size:.72rem;color:var(--ink-4,#666);margin-top:.2rem}',
        '.veda-result-pills{display:flex;gap:.3rem;margin-top:.3rem;flex-wrap:wrap}',
        '.veda-pill{font-size:.62rem;padding:.1rem .45rem;border-radius:999px;font-weight:600}',
        '.veda-pill-orcid{background:#A6CE39;color:#1a1a1a}',
        '.veda-pill-scopus{background:#E77500;color:#fff}',
        '.veda-pill-source{background:var(--bg-2,#ECEEF6);color:var(--ink-3,#555)}',
        /* Dossier */
        '.veda-dossier-header{padding:.85rem 1rem;background:linear-gradient(135deg,var(--primary,#233874),var(--primary-2,#1B2C5C));color:#fff;border-radius:var(--r,12px);margin-bottom:.75rem}',
        '.veda-dossier-name{font-family:var(--font-display,serif);font-size:1.1rem;font-weight:700}',
        '.veda-dossier-meta{font-size:.74rem;opacity:.85;margin-top:.2rem}',
        '.veda-metrics{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.5rem;margin-bottom:.75rem}',
        '.veda-metric{padding:.6rem .7rem;background:var(--surface,#fff);border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);text-align:center}',
        '.veda-metric-icon{font-size:1rem;color:var(--primary,#233874);margin-bottom:.2rem}',
        '.veda-metric-val{font-family:var(--font-display,serif);font-size:1.3rem;font-weight:700;color:var(--primary,#233874)}',
        '.veda-metric-label{font-size:.65rem;color:var(--ink-4,#666);margin-top:.15rem}',
        '.veda-bar-chart{display:flex;align-items:flex-end;gap:.5rem;height:150px;padding:1rem .5rem;background:var(--surface,#fff);border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px)}',
        '.veda-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%}',
        '.veda-bar-val{font-size:.72rem;font-weight:700;color:var(--primary,#233874);margin-bottom:.25rem}',
        '.veda-bar{width:70%;background:linear-gradient(180deg,var(--primary,#233874),var(--brand-teal,#0F7E66));border-radius:4px 4px 0 0;transition:height .3s}',
        '.veda-bar-label{font-size:.62rem;color:var(--ink-4,#666);margin-top:.35rem;writing-mode:vertical-rl;transform:rotate(180deg)}',
        '.veda-section{margin-bottom:.75rem}',
        '.veda-section-title{font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-3,#555);margin-bottom:.4rem}',
        '.veda-pub{padding:.55rem .7rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);margin-bottom:.35rem}',
        '.veda-pub-title{font-size:.82rem;font-weight:600}',
        '.veda-pub-meta{font-size:.7rem;color:var(--ink-4,#666);margin-top:.15rem}',
        '.veda-pub-doi{font-size:.68rem;color:var(--primary,#233874)}',
        /* Chat */
        '.veda-chat-log{flex:1;overflow-y:auto;padding:.5rem 0;display:flex;flex-direction:column;gap:.5rem}',
        '.veda-msg{padding:.55rem .8rem;border-radius:var(--r,12px);font-size:.82rem;max-width:85%;line-height:1.5}',
        '.veda-msg-user{background:var(--primary,#233874);color:#fff;align-self:flex-end}',
        '.veda-msg-bot{background:var(--bg-2,#ECEEF6);align-self:flex-start}',
        '.veda-msg-error{background:var(--err-bg,#FEF2F2);color:var(--err,#8B1515);align-self:flex-start}',
        '.veda-chat-row{display:flex;gap:.5rem;margin-top:.5rem}',
        '.veda-chat-input{flex:1;padding:.55rem .8rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);font-size:.82rem;font-family:inherit}',
        '.veda-chat-input:focus{outline:none;border-color:var(--primary,#233874);box-shadow:0 0 0 2px var(--primary-dim,rgba(35,56,116,.15))}',
        /* Config */
        '.veda-config-row{margin-bottom:.65rem}',
        '.veda-config-label{display:block;font-size:.72rem;font-weight:600;color:var(--ink-3,#555);margin-bottom:.2rem}',
        '.veda-config-input{width:100%;padding:.5rem .7rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);font-size:.8rem;font-family:inherit;box-sizing:border-box}',
        '.veda-config-input:focus{outline:none;border-color:var(--primary,#233874);box-shadow:0 0 0 2px var(--primary-dim,rgba(35,56,116,.15))}',
        '.veda-config-status{font-size:.72rem;margin-top:.4rem}',
        '.veda-config-status.ok{color:var(--ok,#1f5c39)}',
        '.veda-config-status.err{color:var(--err,#8B1515)}',
        /* Citation export / BibTeX import (T24 / T25) */
        '.veda-row{display:flex;gap:.5rem;margin-top:.6rem;align-items:center;flex-wrap:wrap}',
        '.veda-input{flex:1;min-width:120px;padding:.5rem .7rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);font-size:.8rem;font-family:inherit;box-sizing:border-box}',
        '.veda-input:focus{outline:none;border-color:var(--primary,#233874);box-shadow:0 0 0 2px var(--primary-dim,rgba(35,56,116,.15))}',
        '.veda-cites{margin-top:.6rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);overflow:hidden}',
        '.veda-cite{font-size:.74rem;padding:.45rem .65rem;border-bottom:1px solid var(--border,#E2E5F0);line-height:1.35}',
        '.veda-cite:last-child{border-bottom:none}',
        '.veda-bib-box{width:100%;min-height:90px;margin-top:.6rem;padding:.5rem .65rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);font-family:monospace;font-size:.74rem;box-sizing:border-box;resize:vertical}',
        '.veda-bib-box:focus{outline:none;border-color:var(--primary,#233874);box-shadow:0 0 0 2px var(--primary-dim,rgba(35,56,116,.15))}',
        '.veda-imported{margin-top:.6rem;font-size:.76rem;color:var(--ink-2,#333)}',
        '.veda-imported .veda-pub{font-size:.74rem}',
        /* T26 — Metrics dashboard */
        '.veda-metric-wide{grid-column:span 2}',
        '.veda-dist-bar{display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem;font-size:.72rem}',
        '.veda-dist-label{width:55px;text-align:right;color:var(--ink-4,#666)}',
        '.veda-dist-track{flex:1;height:14px;background:var(--bg-2,#ECEEF6);border-radius:7px;overflow:hidden}',
        '.veda-dist-fill{height:100%;background:linear-gradient(90deg,var(--primary,#233874),var(--brand-teal,#0F7E66));border-radius:7px;transition:width .3s}',
        '.veda-dist-val{color:var(--ink-3,#555);min-width:24px;text-align:right}',
        /* T27 — Co-author network */
        '.veda-network-wrap{margin-top:.6rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);overflow:hidden}',
        '.veda-network-svg{width:100%;height:260px;display:block;background:var(--surface,#fff)}',
        '.veda-network-empty{padding:1.5rem;text-align:center;font-size:.74rem;color:var(--ink-4,#666)}',
        '.veda-network-stats{display:flex;gap:1rem;font-size:.72rem;color:var(--ink-3,#555);margin-bottom:.4rem}',
        /* T150 — Writing assistant */
        '.veda-write-out{margin-top:.4rem;padding:.7rem .8rem;border:1px solid var(--border,#E2E5F0);border-radius:var(--r-sm,8px);background:var(--surface,#fff);font-size:.82rem;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto}',
        '.veda-btn.active{background:var(--bg-2,#ECEEF6)}',
        /* Empty */
        '.veda-empty{text-align:center;padding:2rem 1rem;color:var(--ink-4,#666)}',
        '.veda-empty i{font-size:2rem;opacity:.3;margin-bottom:.5rem}',
        '.veda-empty-text{font-size:.82rem}',
        /* Loading spinner */
        '.veda-spinner{display:inline-block;width:16px;height:16px;border:2px solid var(--border,#E2E5F0);border-top-color:var(--primary,#233874);border-radius:50%;animation:veda-spin .7s linear infinite}',
        '@keyframes veda-spin{to{transform:rotate(360deg)}}',
      ].join('\n');
      global.document.head.appendChild(s);
    }
  }

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  var _state = null;

  function freshState() {
    return {
      activeTab: 'staff',
      query: '',
      results: [],
      loading: false,
      dossier: null,
      chatLog: [],
      chatLoading: false,
      config: { scopusEnabled: false, orcidEnabled: true, llmEnabled: false, hasScopusKey: false, hasOrcidToken: false },
      configForm: { scopusApiKey: '', orcidToken: '', llmEndpoint: '', llmKey: '' },
      configStatus: '',
      configDirty: false,
      citeStyle: 'apa',
      citations: null,
      citing: false,
      bibtexText: '',
      imported: null,
      importing: false,
      /* T150 — AI writing assistant */
      writeMode: 'improve',      // improve | draft | translate-bg
      writeProjectType: '',      // ФНИ | ПНИ | ДНП | НПФ ('' = generic)
      writeInstructions: '',
      writeInput: '',
      writeOutput: '',
      writeLoading: false,
      writeError: '',
      /* T26 — Metrics dashboard */
      metricsData: null,
      metricsLoading: false,
      /* T27 — Co-author network */
      coauthorData: null,
      coauthorLoading: false,
    };
  }

  /* ------------------------------------------------------------------ *
   * Render helpers
   * ------------------------------------------------------------------ */
  function el(tag, attrs) {
    var d = global.document;
    if (!d) return null;
    var e = d.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        if (k === 'style' && typeof attrs[k] === 'object') { e.style.cssText = Object.keys(attrs[k]).map(function (sk) { return sk + ':' + attrs[k][sk]; }).join(';'); }
        else if (k === 'className') e.className = attrs[k];
        else if (k === 'innerHTML') e.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') { var ev = k.slice(2).toLowerCase(); e.addEventListener(ev, attrs[k]); }
        else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k]);
      }
    }
    var children = Array.prototype.slice.call(arguments, 2);
    if (children.length) {
      children.forEach(function (c) {
        if (c == null || c === false) return;
        e.appendChild(typeof c === 'string' ? d.createTextNode(c) : c);
      });
    }
    return e;
  }

  function icon(cls) { return el('i', { className: cls, 'aria-hidden': 'true' }); }

  /* ------------------------------------------------------------------ *
   * Panel: Staff search
   * ------------------------------------------------------------------ */
  function renderStaffPanel() {
    var s = _state;
    var d = global.document;

    var input = el('input', {
      className: 'veda-search-input',
      type: 'search',
      placeholder: t('search'),
      value: s.query,
      onInput: function (ev) { s.query = ev.target.value; },
      onKeyDown: function (ev) { if (ev.key === 'Enter') doSearch(); },
    });

    var btn = el('button', { className: 'veda-btn', onClick: doSearch, disabled: s.loading },
      s.loading ? el('span', { className: 'veda-spinner' }) : t('searchBtn'));

    var hint = el('div', { style: { fontSize: '.68rem', color: 'var(--ink-4)', marginBottom: '.5rem' } }, t('searchHint'));

    var resultsEl = el('div', { className: 'veda-results' });
    if (s.results.length === 0 && !s.loading && s.query) {
      var emptyFrag = el('div', { className: 'veda-empty' });
      emptyFrag.appendChild(icon('fas fa-search'));
      emptyFrag.appendChild(el('div', { className: 'veda-empty-text' }, t('noResults')));
      resultsEl.appendChild(emptyFrag);
    }
    s.results.forEach(function (r) {
      var pills = el('div', { className: 'veda-result-pills' });
      if (r.orcid) pills.appendChild(el('span', { className: 'veda-pill veda-pill-orcid' }, t('orcidLabel') + ' ' + r.orcid));
      if (r.scopusAuthorId) pills.appendChild(el('span', { className: 'veda-pill veda-pill-scopus' }, t('scopusLabel') + ' ' + r.scopusAuthorId));
      if (r.source) pills.appendChild(el('span', { className: 'veda-pill veda-pill-source' }, r.source));

      resultsEl.appendChild(el('div', { className: 'veda-result-card', onClick: function () { loadDossier(r); } },
        el('div', { className: 'veda-result-name' }, r.name || r.givenName + ' ' + r.familyName || '—'),
        el('div', { className: 'veda-result-meta' }, [r.givenName, r.familyName].filter(Boolean).join(' ')),
        pills
      ));
    });

    return el('div', { className: 'veda-panel active', 'data-panel': 'staff' },
      hint,
      el('div', { className: 'veda-search-row' }, input, btn),
      resultsEl
    );
  }

  /* ------------------------------------------------------------------ *
   * Panel: Dossier view
   * ------------------------------------------------------------------ */
  function renderDossierPanel() {
    var d = _state.dossier;
    if (!d) {
      return el('div', { className: 'veda-panel', 'data-panel': 'dossier' },
        el('div', { className: 'veda-empty' },
          icon('fas fa-id-card'),
          el('div', { className: 'veda-empty-text' }, t('noDossier'))));
    }
    var frag = el('div', { className: 'veda-panel', 'data-panel': 'dossier' });

    // Header
    var id = d.identity || {};
    frag.appendChild(el('div', { className: 'veda-dossier-header' },
      el('div', { className: 'veda-dossier-name' }, id.name || '—'),
      el('div', { className: 'veda-dossier-meta' }, [
        id.affiliation ? '🏛 ' + id.affiliation : '',
        id.email ? '✉ ' + id.email : '',
        id.orcid ? 'ORCID: ' + id.orcid : '',
      ].filter(Boolean).join(' · '))
    ));

    // Metrics
    var m = d.metrics || {};
    var metricsEl = el('div', { className: 'veda-metrics' });
    var metricItems = [
      [t('hIndex'), m.hIndex, 'fa-chart-line'],
      [t('docCount'), m.documentCount, 'fa-file-alt'],
      [t('citations'), m.citationCount, 'fa-quote-right'],
      ['i10-index', m.i10, 'fa-star'],
    ];
    metricItems.forEach(function (item) {
      if (item[1] != null) metricsEl.appendChild(el('div', { className: 'veda-metric' },
        el('div', { className: 'veda-metric-icon' }, icon(item[2])),
        el('div', { className: 'veda-metric-val' }, item[1]),
        el('div', { className: 'veda-metric-label' }, item[0])));
    });
    if (metricsEl.children.length) frag.appendChild(metricsEl);

    // Publications by year chart
    if (Array.isArray(d.publications) && d.publications.length) {
      var yearCounts = {};
      d.publications.forEach(function (p) {
        var y = p.year || 'N/A';
        yearCounts[y] = (yearCounts[y] || 0) + 1;
      });
      var years = Object.keys(yearCounts).sort().slice(-8);
      var maxCount = Math.max.apply(null, years.map(function (y) { return yearCounts[y]; }));
      var chartEl = el('div', { className: 'veda-section' },
        el('div', { className: 'veda-section-title' }, 'Публикации по година'),
        el('div', { className: 'veda-bar-chart' }, years.map(function (y) {
          var pct = Math.round((yearCounts[y] / maxCount) * 100);
          return el('div', { className: 'veda-bar-col' },
            el('div', { className: 'veda-bar-val' }, yearCounts[y]),
            el('div', { className: 'veda-bar', style: { height: Math.max(pct, 5) + '%' } }),
            el('div', { className: 'veda-bar-label' }, y)
          );
        }))
      );
      frag.appendChild(chartEl);
    }

    // Publications
    if (Array.isArray(d.publications) && d.publications.length) {
      var pubSec = el('div', { className: 'veda-section' },
        el('div', { className: 'veda-section-title' }, t('publications') + ' (' + d.publications.length + ')'));
      d.publications.slice(0, 20).forEach(function (p) {
        pubSec.appendChild(el('div', { className: 'veda-pub' },
          el('div', { className: 'veda-pub-title' }, p.title || '—'),
          el('div', { className: 'veda-pub-meta' }, [p.year, p.source, p.type].filter(Boolean).join(' · ')),
          p.doi ? el('div', { className: 'veda-pub-doi' }, 'DOI: ' + p.doi) : null
        ));
      });
      frag.appendChild(pubSec);
    }

    // Employments
    if (Array.isArray(d.employments) && d.employments.length) {
      var empSec = el('div', { className: 'veda-section' },
        el('div', { className: 'veda-section-title' }, t('employments')));
      d.employments.slice(0, 10).forEach(function (e) {
        empSec.appendChild(el('div', { className: 'veda-pub' },
          el('div', { className: 'veda-pub-title' }, e.role || e.org || '—'),
          el('div', { className: 'veda-pub-meta' }, [e.org, e.start, e.end ? '→ ' + e.end : ''].filter(Boolean).join(' · '))
        ));
      });
      frag.appendChild(empSec);
    }

    // Education
    if (Array.isArray(d.education) && d.education.length) {
      var eduSec = el('div', { className: 'veda-section' },
        el('div', { className: 'veda-section-title' }, t('education')));
      d.education.slice(0, 10).forEach(function (e) {
        eduSec.appendChild(el('div', { className: 'veda-pub' },
          el('div', { className: 'veda-pub-title' }, e.degree || e.org || '—'),
          el('div', { className: 'veda-pub-meta' }, [e.org, e.start, e.end ? '→ ' + e.end : ''].filter(Boolean).join(' · '))
        ));
      });
      frag.appendChild(eduSec);
    }

    // Last synced / cached freshness
    if (d.lastSynced) {
      var freshness = el('div', { style: { fontSize: '.68rem', color: 'var(--ink-4)', marginTop: '.35rem', textAlign: 'right' } },
        t('lastSynced') + ': ' + fmtDate(d.lastSynced) + (d.cached ? ' · ' + t('cached') : ''));
      frag.appendChild(freshness);
    }

    // ── T24: Citation export (APA / MLA / Chicago) ──
    if (Array.isArray(d.publications) && d.publications.length) {
      var citeSec = el('div', { className: 'veda-section' },
        el('div', { className: 'veda-section-title' }, t('exportCitations')),
        el('div', { className: 'veda-row' },
          el('select', {
            className: 'veda-input',
            onChange: function (ev) { _state.citeStyle = ev.target.value; }
          },
            ['apa', 'mla', 'chicago'].map(function (s) {
              return el('option', { value: s, selected: (_state.citeStyle || 'apa') === s }, s.toUpperCase());
            })
          ),
          el('button', {
            className: 'veda-btn veda-btn-ghost',
            onClick: function () { exportCitations(_state.citeStyle); }
          }, _state.citing ? el('span', { className: 'veda-spinner' }) : (t('exportCitations')))
        )
      );
      if (_state.citations && _state.citations.length) {
        var citesWrap = el('div', { className: 'veda-cites' });
        _state.citations.forEach(function (c) { citesWrap.appendChild(el('div', { className: 'veda-cite' }, c)); });
        citeSec.appendChild(citesWrap);
        citeSec.appendChild(el('div', { className: 'veda-row' },
          el('button', { className: 'veda-btn veda-btn-ghost', onClick: copyCitations }, icon('fas fa-copy'), ' ' + t('copyCitations'))
        ));
      }
      frag.appendChild(citeSec);
    }

    // ── T25: BibTeX import ──
    var bibSec = el('div', { className: 'veda-section' },
      el('div', { className: 'veda-section-title' }, t('bibtexImport')),
      el('textarea', {
        className: 'veda-bib-box',
        placeholder: t('bibtexPlaceholder'),
        onInput: function (ev) { _state.bibtexText = ev.target.value; }
      }),
      el('div', { className: 'veda-row' },
        el('button', {
          className: 'veda-btn veda-btn-ghost',
          onClick: importBibtex
        }, _state.importing ? el('span', { className: 'veda-spinner' }) : (t('importBibtex')))
      )
    );
    if (_state.imported && _state.imported.length) {
      var impWrap = el('div', { className: 'veda-imported' },
        el('div', { className: 'veda-section-title' }, t('importedPubs') + ' (' + _state.imported.length + ')'));
      _state.imported.slice(0, 20).forEach(function (p) {
        impWrap.appendChild(el('div', { className: 'veda-pub' },
          el('div', { className: 'veda-pub-title' }, p.title || '—'),
          el('div', { className: 'veda-pub-meta' }, [p.year, p.journal].filter(Boolean).join(' · ')),
          p.doi ? el('div', { className: 'veda-pub-doi' }, 'DOI: ' + p.doi) : null
        ));
      });
      bibSec.appendChild(impWrap);
    }
    frag.appendChild(bibSec);

    // Task 23 — "Use in application" insert button
    var summary = buildDossierSummary(d);
    frag.appendChild(el('div', { style: { display: 'flex', gap: '.5rem', marginTop: '.5rem' } },
      el('button', {
        className: 'veda-btn veda-btn-ghost',
        style: { flex: '1' },
        onClick: function () {
          var inserted = insertDossierIntoApplication(summary);
          if (inserted && typeof toast === 'function') toast('Досието е вмъкнато в заявлението.', 'success');
        }
      }, t('useInApplication') || 'Използвай в заявлението'),
      el('button', {
        className: 'veda-btn veda-btn-ghost',
        style: { flexShrink: 0, whiteSpace: 'nowrap' },
        title: t('refreshDossier') || 'Опресни от ORCID/Scopus',
        onClick: function () {
          if (_state._dossierPerson) loadDossier(_state._dossierPerson, true);
        }
      }, el('i', { className: 'fas fa-sync-alt' }), ' ' + (t('refresh') || 'Опресни'))
    ));

    return frag;
  }

  /* ------------------------------------------------------------------ *
   * Panel: Writing (T150 — AI writing assistant)
   * ------------------------------------------------------------------ */
  function renderWritingPanel() {
    var s = _state;
    var frag = el('div', { className: 'veda-panel', 'data-panel': 'writing' });

    frag.appendChild(el('div', { className: 'veda-section-title' }, t('writing')));
    frag.appendChild(el('div', { style: { fontSize: '.72rem', color: 'var(--ink-4)', marginBottom: '.6rem' } }, t('writingHint')));

    // Mode selector
    var modeRow = el('div', { className: 'veda-row' },
      el('span', { style: { fontSize: '.74rem', fontWeight: 600, color: 'var(--ink-3)' } }, t('writeMode')));
    [['improve', t('modeImprove')], ['draft', t('modeDraft')], ['translate-bg', t('modeTranslate')]].forEach(function (m) {
      modeRow.appendChild(el('button', {
        className: 'veda-btn veda-btn-ghost' + (s.writeMode === m[0] ? ' active' : ''),
        style: s.writeMode === m[0] ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : null,
        onClick: function () { s.writeMode = m[0]; rerender(); }
      }, m[1]));
    });
    frag.appendChild(modeRow);

    // Project-type selector (tailors the system prompt via veda_prompts)
    var ptSelect = el('select', {
      className: 'veda-input',
      style: { marginTop: '.5rem', flex: '1 1 100%' },
      onChange: function (ev) { s.writeProjectType = ev.target.value; }
    },
      el('option', { value: '', selected: s.writeProjectType === '' }, t('projectTypeAll')),
      ['ФНИ', 'ПНИ', 'ДНП', 'НПФ'].map(function (pt) {
        return el('option', { value: pt, selected: s.writeProjectType === pt }, pt);
      })
    );
    frag.appendChild(el('div', { style: { marginTop: '.5rem' } },
      el('label', { className: 'veda-config-label' }, t('projectType')), ptSelect));

    // Extra instructions
    frag.appendChild(el('div', { style: { marginTop: '.5rem' } },
      el('label', { className: 'veda-config-label' }, t('instructions')),
      el('input', {
        className: 'veda-input',
        type: 'text',
        placeholder: t('instructionsPlaceholder'),
        value: s.writeInstructions,
        onInput: function (ev) { s.writeInstructions = ev.target.value; }
      })
    ));

    // Input text
    frag.appendChild(el('div', { style: { marginTop: '.5rem' } },
      el('label', { className: 'veda-config-label' }, t('inputText')),
      el('textarea', {
        className: 'veda-bib-box',
        style: { minHeight: '110px' },
        placeholder: t('inputPlaceholder'),
        onInput: function (ev) { s.writeInput = ev.target.value; }
      }, s.writeInput)
    ));

    // Run button
    frag.appendChild(el('div', { className: 'veda-row' },
      el('button', {
        className: 'veda-btn',
        disabled: s.writeLoading || !s.writeInput.trim(),
        onClick: runWrite
      }, s.writeLoading ? el('span', { className: 'veda-spinner' }) : t('writeRun'))
    ));

    if (s.writeError) {
      frag.appendChild(el('div', { className: 'veda-msg veda-msg-error', style: { marginTop: '.5rem' } },
        (s.writeError === 'llm_not_configured' ? t('llmNotConfigured') : (t('writeError') + ': ' + s.writeError))));
    }

    // Output
    if (s.writeOutput) {
      frag.appendChild(el('div', { className: 'veda-section-title', style: { marginTop: '.75rem' } }, t('writeResult')));
      frag.appendChild(el('div', { className: 'veda-write-out' }, s.writeOutput));
      frag.appendChild(el('div', { className: 'veda-row' },
        el('button', { className: 'veda-btn veda-btn-ghost', onClick: insertWriteOutput }, t('writeInsert')),
        el('button', { className: 'veda-btn veda-btn-ghost', onClick: copyWriteOutput }, icon('fas fa-copy'), ' ' + t('writeCopy'))
      ));
    } else if (!s.writeLoading && !s.writeError) {
      frag.appendChild(el('div', { className: 'veda-empty', style: { padding: '1.25rem' } },
        el('i', { className: 'fas fa-pen-nib' }),
        el('div', { className: 'veda-empty-text' }, t('writeEmpty'))));
    }

    frag.appendChild(el('div', { style: { fontSize: '.68rem', color: 'var(--ink-4)', marginTop: '.6rem' } }, t('proseTip')));
    return frag;
  }

  function runWrite() {
    var s = _state;
    if (!s.writeInput || !s.writeInput.trim()) return;
    if (!global.Veda || typeof global.Veda.write !== 'function') {
      s.writeError = 'no_bridge'; rerender(); return;
    }
    s.writeLoading = true; s.writeError = ''; s.writeOutput = '';
    rerender();
    global.Veda.write(s.writeInput, {
      mode: s.writeMode,
      instructions: s.writeInstructions,
      projectType: s.writeProjectType
    }).then(function (r) {
      s.writeLoading = false;
      if (r && r.ok && r.data && r.data.text) {
        s.writeOutput = r.data.text;
        s.writeError = '';
      } else {
        s.writeError = (r && r.error) || 'unknown';
        s.writeOutput = '';
      }
      rerender();
    }).catch(function () {
      s.writeLoading = false; s.writeError = 'network'; s.writeOutput = '';
      rerender();
    });
  }

  function insertWriteOutput() {
    var s = _state;
    if (!s.writeOutput) return;
    var inserted = insertDossierIntoApplication(s.writeOutput);
    if (typeof toast === 'function') {
      toast(inserted ? t('useInApplication') + ' ✓' : (t('writeCopy') + ' ✓'), inserted ? 'success' : 'info');
    }
  }

  function copyWriteOutput() {
    var s = _state;
    if (!s.writeOutput) return;
    try {
      if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
        global.navigator.clipboard.writeText(s.writeOutput);
        if (typeof toast === 'function') toast(t('writeCopy') + ' ✓', 'info');
      }
    } catch (_) {}
  }

  /* ------------------------------------------------------------------ *\
   * T26 — Metrics Dashboard panel
   * ------------------------------------------------------------------ */
  function loadMetrics() {
    var s = _state;
    if (s.metricsLoading) return;
    s.metricsLoading = true;
    s.metricsData = null;
    rerender();
    if (!global.Veda || typeof global.Veda.metrics !== 'function') { s.metricsLoading = false; rerender(); return; }
    global.Veda.metrics().then(function (r) {
      s.metricsLoading = false;
      s.metricsData = (r && r.ok && r.data && r.data.metrics) ? r.data.metrics : {};
      rerender();
    }).catch(function () { s.metricsLoading = false; rerender(); });
  }

  function renderMetricsPanel() {
    var s = _state;
    var frag = el('div', { className: 'veda-panel', 'data-panel': 'metrics' });
    frag.appendChild(el('div', { className: 'veda-section-title' }, t('metricsDashboard')));

    if (s.metricsLoading) {
      frag.appendChild(el('div', { className: 'veda-empty' }, el('span', { className: 'veda-spinner' }), el('div', { className: 'veda-empty-text' }, t('loading'))));
      return frag;
    }

    var m = s.metricsData;
    if (!m || !m.dossiers_total) {
      frag.appendChild(el('button', { className: 'veda-btn veda-btn-ghost', onClick: loadMetrics }, icon('fas fa-sync-alt'), ' ' + (t('refresh') || 'Зареди')));
      frag.appendChild(el('div', { className: 'veda-empty' }, el('i', { className: 'fas fa-chart-pie' }), el('div', { className: 'veda-empty-text' }, 'Няма данни. Натиснете „Зареди\".')));
      return frag;
    }

    // Summary metrics
    var metricsEl = el('div', { className: 'veda-metrics' });
    var metricItems = [
      [t('metricsTotalDossiers'), m.dossiers_total, 'fa-id-card'],
      [t('metricsSynced'), m.dossiers_synced, 'fa-sync'],
      [t('metricsWithWorks'), m.dossiers_with_works, 'fa-file-alt'],
      [t('metricsTotalCitations'), m.total_citations, 'fa-quote-right'],
      [t('metricsTotalPubs'), m.total_publications, 'fa-book'],
    ];
    metricItems.forEach(function (item) {
      if (item[1] != null) metricsEl.appendChild(el('div', { className: 'veda-metric' },
        el('div', { className: 'veda-metric-icon' }, icon(item[2])),
        el('div', { className: 'veda-metric-val' }, item[1]),
        el('div', { className: 'veda-metric-label' }, item[0])));
    });
    frag.appendChild(metricsEl);

    // h-index distribution bar chart
    if (m.h_index_distribution) {
      var dist = m.h_index_distribution;
      var distTotal = 0;
      for (var k in dist) { if (dist.hasOwnProperty(k)) distTotal += dist[k]; }
      var distSec = el('div', { className: 'veda-section' },
        el('div', { className: 'veda-section-title' }, t('metricsHIndexDist')));
      var labels = ['0', '1-5', '6-10', '11-20', '21+'];
      labels.forEach(function (label) {
        var val = dist[label] || 0;
        var pct = distTotal > 0 ? Math.round((val / distTotal) * 100) : 0;
        distSec.appendChild(el('div', { className: 'veda-dist-bar' },
          el('span', { className: 'veda-dist-label' }, label),
          el('div', { className: 'veda-dist-track' },
            el('div', { className: 'veda-dist-fill', style: { width: Math.max(pct, 1) + '%' } })),
          el('span', { className: 'veda-dist-val' }, val)
        ));
      });
      frag.appendChild(distSec);
    }

    frag.appendChild(el('button', { className: 'veda-btn veda-btn-ghost', style: { marginTop: '.6rem' }, onClick: loadMetrics }, icon('fas fa-sync-alt'), ' ' + (t('refresh') || 'Опресни')));
    return frag;
  }

  /* ------------------------------------------------------------------ *\
   * T27 — Co-author Network panel
   * ------------------------------------------------------------------ */
  function loadCoauthorNetwork() {
    var s = _state;
    if (s.coauthorLoading) return;
    s.coauthorLoading = true;
    s.coauthorData = null;
    rerender();
    if (!global.Veda || typeof global.Veda.coauthorNetwork !== 'function') { s.coauthorLoading = false; rerender(); return; }
    var dossierId = (s._dossierPerson && s._dossierPerson.orcid) ? s._dossierPerson.orcid : '';
    global.Veda.coauthorNetwork(dossierId).then(function (r) {
      s.coauthorLoading = false;
      s.coauthorData = (r && r.ok && r.data) ? r.data : { nodes: [], edges: [] };
      rerender();
    }).catch(function () { s.coauthorLoading = false; s.coauthorData = { nodes: [], edges: [] }; rerender(); });
  }

  function renderCoauthorPanel() {
    var s = _state;
    var frag = el('div', { className: 'veda-panel', 'data-panel': 'coauthor' });
    frag.appendChild(el('div', { className: 'veda-section-title' }, t('coauthorNetwork')));
    frag.appendChild(el('div', { style: { fontSize: '.72rem', color: 'var(--ink-4)', marginBottom: '.6rem' } }, t('coauthorHint')));

    if (s.coauthorLoading) {
      frag.appendChild(el('div', { className: 'veda-empty' }, el('span', { className: 'veda-spinner' }), el('div', { className: 'veda-empty-text' }, t('coauthorLoading'))));
      return frag;
    }

    var data = s.coauthorData;
    if (!data || !data.nodes || !data.nodes.length) {
      frag.appendChild(el('button', { className: 'veda-btn veda-btn-ghost', onClick: loadCoauthorNetwork }, icon('fas fa-project-diagram'), ' ' + (t('refresh') || 'Зареди')));
      frag.appendChild(el('div', { className: 'veda-empty' }, el('i', { className: 'fas fa-users' }), el('div', { className: 'veda-empty-text' }, t('noCoauthors'))));
      return frag;
    }

    // Stats
    frag.appendChild(el('div', { className: 'veda-network-stats' },
      el('span', null, icon('fas fa-user'), ' ', t('networkNodeCount') + ': ' + data.nodes.length),
      el('span', null, icon('fas fa-link'), ' ', t('networkEdgeCount') + ': ' + data.edges.length)));

    // SVG network visualization
    var W = 480, H = 260;
    var nodes = data.nodes.slice(0, 30);
    var edges = data.edges;
    // Simple circular layout
    var cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.38;
    var positions = {};
    nodes.forEach(function (n, i) {
      var angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      positions[n.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = global.document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'veda-network-svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', H);

    // Draw edges
    edges.forEach(function (e) {
      var pa = positions[e.source];
      var pb = positions[e.target];
      if (!pa || !pb) return;
      var line = global.document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', pa.x);
      line.setAttribute('y1', pa.y);
      line.setAttribute('x2', pb.x);
      line.setAttribute('y2', pb.y);
      line.setAttribute('stroke', 'var(--border, #E2E5F0)');
      line.setAttribute('stroke-width', Math.min(Math.max(e.weight, 1), 4));
      line.setAttribute('stroke-opacity', '0.6');
      svg.appendChild(line);
    });

    // Draw nodes
    nodes.forEach(function (n) {
      var p = positions[n.id];
      if (!p) return;
      var circle = global.document.createElementNS(svgNS, 'circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', Math.min(Math.max(4, Math.sqrt(n.count) * 3), 14));
      circle.setAttribute('fill', 'var(--primary, #233874)');
      circle.setAttribute('opacity', '0.8');
      svg.appendChild(circle);
      var text = global.document.createElementNS(svgNS, 'text');
      text.setAttribute('x', p.x);
      text.setAttribute('y', p.y - 10);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '8');
      text.setAttribute('fill', 'var(--ink, #2e2545)');
      text.textContent = n.name.length > 18 ? n.name.slice(0, 16) + '…' : n.name;
      svg.appendChild(text);
    });

    frag.appendChild(el('div', { className: 'veda-network-wrap' }, svg));
    frag.appendChild(el('button', { className: 'veda-btn veda-btn-ghost', style: { marginTop: '.6rem' }, onClick: loadCoauthorNetwork }, icon('fas fa-sync-alt'), ' ' + (t('refresh') || 'Опресни')));
    return frag;
  }

  /* ------------------------------------------------------------------ *
   * Panel: Chat
   * ------------------------------------------------------------------ */
  function renderChatPanel() {
    var s = _state;
    var frag = el('div', { className: 'veda-panel', 'data-panel': 'chat' });

    var log = el('div', { className: 'veda-chat-log' });

    // Greeting
    if (s.chatLog.length === 0) {
      log.appendChild(el('div', { className: 'veda-msg veda-msg-bot' }, t('greeting')));
    }
    s.chatLog.forEach(function (m) {
      log.appendChild(el('div', { className: 'veda-msg ' + (m.role === 'user' ? 'veda-msg-user' : m.role === 'error' ? 'veda-msg-error' : 'veda-msg-bot') }, m.text));
    });
    if (s.chatLoading) {
      log.appendChild(el('div', { className: 'veda-msg veda-msg-bot' }, el('span', { className: 'veda-spinner' })));
    }

    var input = el('input', {
      className: 'veda-chat-input',
      type: 'text',
      placeholder: t('askPlaceholder'),
      onKeyDown: function (ev) { if (ev.key === 'Enter' && ev.target.value.trim()) sendChat(ev.target.value.trim()); },
    });
    var sendBtn = el('button', { className: 'veda-btn', onClick: function () { var v = input.value.trim(); if (v) sendChat(v); } }, t('askBtn'));

    frag.appendChild(log);
    frag.appendChild(el('div', { className: 'veda-chat-row' }, input, sendBtn));
    return frag;
  }

  /* ------------------------------------------------------------------ *
   * Panel: Config
   * ------------------------------------------------------------------ */
  function renderConfigPanel() {
    var s = _state;
    var frag = el('div', { className: 'veda-panel', 'data-panel': 'config' });

    if (s.config.scopusEnabled === false && s.config.orcidEnabled) {
      frag.appendChild(el('div', { style: { fontSize: '.74rem', color: 'var(--warn,#7A4A00)', background: 'var(--warn-bg,#FFF8EC)', padding: '.55rem .75rem', borderRadius: 'var(--r-sm,8px)', marginBottom: '.75rem' } },
        icon('fas fa-exclamation-triangle'), ' ' + t('noScopus')));
    }

    var fields = [
      ['scopusApiKey', t('scopusKey'), 'password'],
      ['orcidToken', t('orcidToken'), 'password'],
      ['llmEndpoint', t('llmEndpoint'), 'text'],
      ['llmKey', t('llmKey'), 'password'],
    ];
    fields.forEach(function (f) {
      frag.appendChild(el('div', { className: 'veda-config-row' },
        el('label', { className: 'veda-config-label' }, f[1]),
        el('input', {
          className: 'veda-config-input',
          type: f[2],
          value: s.configForm[f[0]] || '',
          onInput: function (ev) { s.configForm[f[0]] = ev.target.value; s.configDirty = true; },
        })
      ));
    });

    var statusEl = el('div', { className: 'veda-config-status' });
    if (s.configStatus) statusEl.appendChild(global.document.createTextNode(s.configStatus));
    frag.appendChild(statusEl);

    frag.appendChild(el('div', { style: { display: 'flex', gap: '.5rem', marginTop: '.5rem' } },
      el('button', { className: 'veda-btn', onClick: saveConfig, disabled: !s.configDirty }, t('save')),
      el('button', { className: 'veda-btn veda-btn-ghost', onClick: loadConfigStatus }, t('cancel'))
    ));

    return frag;
  }

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */
  function doSearch() {
    var s = _state;
    if (!s.query || s.query.length < 2) return;
    s.loading = true;
    s.results = [];
    rerender();

    if (!global.Veda || typeof global.Veda.searchStaff !== 'function') {
      s.loading = false;
      s.results = [];
      rerender();
      return;
    }

    global.Veda.searchStaff(s.query).then(function (r) {
      s.loading = false;
      if (r && r.ok && Array.isArray(r.data)) {
        s.results = r.data.map(function (item) {
          return {
            name: item.name || ((item.givenName || '') + ' ' + (item.familyName || '')).trim(),
            givenName: item.givenName,
            familyName: item.familyName,
            orcid: item.orcid,
            scopusAuthorId: item.scopusAuthorId,
            source: item.source,
          };
        });
      } else {
        s.results = [];
      }
      rerender();
    }).catch(function () {
      s.loading = false;
      s.results = [];
      rerender();
    });
  }

  function loadDossier(person, refresh) {
    var s = _state;
    s.dossier = null;
    s.activeTab = 'dossier';
    s._dossierPerson = person;
    rerender();

    if (!global.Veda || typeof global.Veda.getDossier !== 'function') return;

    global.Veda.getDossier({ orcid: person.orcid, scopusAuthorId: person.scopusAuthorId, refresh: !!refresh }).then(function (r) {
      if (r && r.ok && r.data) {
        s.dossier = r.data;
      } else {
        s.dossier = { identity: { name: person.name, orcid: person.orcid, scopusAuthorId: person.scopusAuthorId }, publications: [], employments: [], education: [], funding: [], lastSynced: new Date().toISOString() };
      }
      rerender();
    }).catch(function () {
      s.dossier = { identity: { name: person.name, orcid: person.orcid, scopusAuthorId: person.scopusAuthorId }, publications: [], employments: [], education: [], funding: [], lastSynced: new Date().toISOString() };
      rerender();
    });
  }

  function sendChat(question) {
    var s = _state;
    s.chatLog.push({ role: 'user', text: question });
    s.chatLoading = true;
    rerender();

    if (!global.Veda || typeof global.Veda.ask !== 'function') {
      s.chatLoading = false;
      s.chatLog.push({ role: 'error', text: t('netError') });
      rerender();
      return;
    }

    global.Veda.ask(question, s.dossier).then(function (r) {
      s.chatLoading = false;
      if (r && r.ok && r.data) {
        s.chatLog.push({ role: 'bot', text: r.data.answer || '—' });
      } else {
        s.chatLog.push({ role: 'error', text: (r && r.error) || t('netError') });
      }
      rerender();
    }).catch(function () {
      s.chatLoading = false;
      s.chatLog.push({ role: 'error', text: t('netError') });
      rerender();
    });
  }

  function loadConfigStatus() {
    var s = _state;
    if (!global.Veda || typeof global.Veda.loadConfig !== 'function') return;
    global.Veda.loadConfig().then(function (r) {
      if (r && r.ok && r.data) {
        s.config = r.data;
        s.configStatus = '';
        s.configDirty = false;
      }
      rerender();
    }).catch(function () {});
  }

  function saveConfig() {
    var s = _state;
    if (!global.Veda || typeof global.Veda.saveConfig !== 'function') return;
    global.Veda.saveConfig(s.configForm).then(function (r) {
      if (r && r.ok) {
        s.configStatus = t('saved');
        s.configDirty = false;
        s.configForm = { scopusApiKey: '', orcidToken: '', llmEndpoint: '', llmKey: '' };
        loadConfigStatus();
      } else {
        s.configStatus = t('saveFailed') + ': ' + ((r && r.error) || 'unknown');
      }
      rerender();
    }).catch(function () {
      s.configStatus = t('saveFailed');
      rerender();
    });
  }

  /* ------------------------------------------------------------------ *
   * Main render
   * ------------------------------------------------------------------ */
  function render() {
    var root = _state && _state.root;
    if (!root) return;
    var d = global.document;
    if (!d) return;

    injectStyles();

    // Tabs
    var tabsEl = el('div', { className: 'veda-tabs', role: 'tablist' });
    var tabDefs = [
      { id: 'staff', label: t('staff'), icon: 'fas fa-users' },
      { id: 'dossier', label: t('dossier'), icon: 'fas fa-id-card' },
      { id: 'metrics', label: t('metricsDashboard'), icon: 'fas fa-chart-pie' },
      { id: 'coauthor', label: t('coauthorNetwork'), icon: 'fas fa-project-diagram' },
      { id: 'chat', label: t('chat'), icon: 'fas fa-comments' },
      { id: 'writing', label: t('writing'), icon: 'fas fa-pen-nib' },
      { id: 'config', label: t('config'), icon: 'fas fa-cog' },
    ];
    tabDefs.forEach(function (td) {
      var isActive = _state.activeTab === td.id;
      var btn = el('button', {
        className: 'veda-tab' + (isActive ? ' active' : ''),
        role: 'tab',
        'aria-selected': isActive,
        onClick: function () { _state.activeTab = td.id; rerender(); },
      },
        icon(td.id === _state.activeTab ? 'fas ' + td.icon : 'fas ' + td.icon), ' ', td.label,
        td.id === 'dossier' && _state.dossier ? el('span', { className: 'badge' }, '1') : null
      );
      tabsEl.appendChild(btn);
    });

    // Body
    var body = el('div', { className: 'veda-body' });
    body.appendChild(renderStaffPanel());
    body.appendChild(renderDossierPanel());
    body.appendChild(renderMetricsPanel());
    body.appendChild(renderCoauthorPanel());
    body.appendChild(renderChatPanel());
    body.appendChild(renderWritingPanel());
    body.appendChild(renderConfigPanel());

    // Show active panel
    var panels = body.querySelectorAll('.veda-panel');
    for (var i = 0; i < panels.length; i++) {
      if (panels[i].getAttribute('data-panel') === _state.activeTab) {
        panels[i].className = 'veda-panel active';
      } else {
        panels[i].className = 'veda-panel';
      }
    }

    // Clear + append
    root.innerHTML = '';
    root.className = 'veda-chat-root';
    root.appendChild(tabsEl);
    root.appendChild(body);
  }

  function rerender() {
    if (_state && _state._raf) return;
    _state._raf = global.requestAnimationFrame(function () {
      _state._raf = null;
      render();
    });
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */
  var VedaChat = {};

  VedaChat.render = function (container, props) {
    props = props || {};
    _state = freshState();
    _state.root = container;
    _state.query = props.initialQuery || '';

    // Load config on mount
    if (global.Veda && typeof global.Veda.loadConfig === 'function') {
      global.Veda.loadConfig().then(function (r) {
        if (r && r.ok && r.data) _state.config = r.data;
        rerender();
      }).catch(function () { rerender(); });
    } else {
      render();
    }
  };

  VedaChat.destroy = function () {
    _state = null;
  };

  global.VedaChat = VedaChat;

})(typeof window !== 'undefined' ? window : this);
