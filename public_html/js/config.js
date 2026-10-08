'use strict';
var {createElement:e,useState,useEffect,useCallback,useMemo,Fragment,memo,useRef,useDeferredValue,useLayoutEffect}=React;

// v3.39.7-erpfix: Global Drive-ID validator. Defined once here (loaded before
// components.js / wizard / documents service) and exposed on window so ANY module
// — including stale or split bundles — can call _isValidDriveId() without
// throwing "_isValidDriveId is not a function". Real IDs: 25+ chars, A-Za-z0-9_-,
// no synthetic prefixes (s_, doc_, up_, f_, copied_).
function _isValidDriveId(id){
  return typeof id === 'string' && id.length >= 25 && /^[A-Za-z0-9_-]+$/.test(id) &&
    !/^(s_|doc_|up_|f_|copied_)/.test(id);
}
try { window._isValidDriveId = _isValidDriveId; } catch (_) {}

// 1. Pull all config variables from the globally injected ERP_CONFIG
var {
GAS_URL: CFG_GAS_URL,
GAS_URL_RAW: _CFG_GAS_URL_RAW,
MAX_FILE_SIZE_BYTES: CFG_MAX_FILE_SIZE_BYTES,
PROJECT_TYPES: CFG_PROJECT_TYPES,
PRIORITY_AREAS: CFG_PRIORITY_AREAS,
STATUS_LABELS: CFG_STATUS_LABELS,
LOGO_URL: CFG_LOGO_URL,
 UEV_LOGO_URL: CFG_UEV_LOGO_URL,
COMPETITIONS: _CFG_COMPETITIONS,
GOOGLE_CLIENT_ID: CFG_GOOGLE_CLIENT_ID,
ANALYTICS_ENDPOINT: CFG_ANALYTICS_ENDPOINT,
// Parent-site URL for iframe-embedded deployments.
// All external-facing links (OAuth redirect, public results, CTAs)
// resolve against this origin — not the GAS /exec hosting.
PARENT_ORIGIN: CFG_PARENT_ORIGIN,
PARENT_PAGE_PATH: CFG_PARENT_PAGE_PATH
} = window.ERP_CONFIG||{};

var GAS_URL=String(CFG_GAS_URL||'').trim();

// ── v3.39.2-deploy: Boot-time stale-build self-check ──
// Expose the version stamped on THIS script's URL (set by index.html cache-buster)
// and the version baked into this JS bundle. app.js compares them at boot and
// auto-reloads to the latest deployed build if they differ — this is what catches
// the recurring "live site serves an old build while index.html was updated" failure
// Kept in sync with the index.html ?v= cache-buster (currently 13.01.0).
// Also derives from __ERP_DEPLOYED_V if present so the auto-reload never triggers spuriously.
var _selfSrc = (document.currentScript && document.currentScript.src) || '';
var _m = _selfSrc.match(/[?&]v=(\d+\.\d+\.\d+)/);
// v12.32.X: __ERP_CODE_VERSION must match the deployed cache-buster so the
// stale-build self-check (app.js) does NOT fire on every load. Derive it from
// __ERP_BUILD (the single source of truth set inline in index.html) instead of
// a hardcoded literal that drifts whenever the ?v= bumps. Previous literal
// '12.32.43' disagreed with index.html's ?v=12.32.45 → infinite _swbust reload
// loop (fixed 12.32.47 by deriving from __ERP_BUILD + single-fire session gate
// in app.js). Fall back to the parsed ?v= or a literal only if __ERP_BUILD is absent.
var _b = (typeof window.__ERP_BUILD !== 'undefined' && window.__ERP_BUILD) ? window.__ERP_BUILD : '';
window.__ERP_CODE_VERSION = _b || (_m ? _m[1] : '12.42.0');
// v12.36.1-fix: __ERP_DEPLOYED_V must be set so app.js's stale-build self-check
// can compare it against __ERP_CODE_VERSION. Previously never assigned → dead code.
window.__ERP_DEPLOYED_V = _m ? _m[1] : '';

// v12.32.43-docfix: Same-origin document streaming endpoint. When a document
// carries a real Drive file ID, the in-modal preview/open should resolve it
// from THIS origin (/database/stream-doc.php) instead of the raw Google Drive
// previewLink. stream-doc.php serves bytes from MySQL → GAS → Drive and
// self-heals, so a moved/deleted/unreachable Drive URL can never show the
// applicant the "файлът не съществува" Google 404. Empty string disables it
// (frontend falls back to the Drive previewLink).
window.__UEV_STREAM_DOC = '/database/stream-doc.php';
// v12.51.3-docfix: absolute URL for the proxy-doc.php endpoint, mirroring
// __UEV_STREAM_DOC. In Laravel mode hostinger-config-laravel.js sets
// _PHP_API_URL='/api' (no .php suffix), so the regex-based fallback in
// components.js produced a broken relative path. Absolute URL avoids that.
window.__UEV_PROXY_DOC = '/database/proxy-doc.php';

// ── v12.23.1-connfix: Defensive inline decode if GAS_URL is empty ──
// If core-bundle.js (gas-proxy.js) failed to resolve the URL (e.g. encoding
// corruption, missing shards, script load error), the config-secrets.js
// plain-text GAS_URL should already be set. But if BOTH are somehow empty,
// try one last inline decode of the encoded blob right here, before any
// api() call references the const.
var _GAS_URL_FINAL = GAS_URL;
if (!_GAS_URL_FINAL && typeof window !== 'undefined') {
  try {
    var _enc = (window.ERP_CONFIG && window.ERP_CONFIG.__ERP_GAS_ENCODED) || '';
    if (_enc) {
      var _m = _enc.match(/^v\d+\.(.+)$/);
      if (_m) {
        var _b64 = '';
        for (var _di = 0; _di < _m[1].length; _di++) _b64 += String.fromCharCode(_m[1].charCodeAt(_di) - 7);
        var _std = _b64.replace(/-/g, '+').replace(/_/g, '/');
        while (_std.length % 4) _std += '=';
        try {
          var _dec = decodeURIComponent(escape(atob(_std)));
          if (_dec && /^https?:\/\//.test(_dec)) {
            _GAS_URL_FINAL = _dec;
            window.ERP_CONFIG.GAS_URL = _dec;
            window.__ERP_GAS_URL = _dec;
          }
        } catch (_) {}
      }
    }
  } catch (_) {}
}
// Expose a live getter so api() and dualFetch() always read the latest URL.
window.__ERP_getGASURL = function() {
  return window.__ERP_GAS_URL || _GAS_URL_FINAL || '';
};
// Preserve the raw (possibly encoded) GAS_URL for proxy/encoded resolution.
// gas-proxy.js (loaded before us) may have already patched ERP_CONFIG.GAS_URL
// to the decoded value; in that case CFG_GAS_URL is already the real URL.
// If gas-proxy.js was not loaded, GAS_URL comes directly from config-secrets.js.
var GAS_URL_RAW=String(_CFG_GAS_URL_RAW||CFG_GAS_URL||'').trim();
var GAS_IS_PROXY=!!(window.__ERP_GAS_IS_PROXY);
var GOOGLE_CLIENT_ID=String(CFG_GOOGLE_CLIENT_ID||'').trim();
var ANALYTICS_ENDPOINT=String(CFG_ANALYTICS_ENDPOINT||'').trim();
// Canonical parent-site URL (where the iframe is embedded, not this script host).
// Falls back to location.origin when no PARENT_ORIGIN is configured.
var PARENT_ORIGIN=String(CFG_PARENT_ORIGIN||'').trim()||(typeof location!=='undefined'?location.origin:'');
var PARENT_PAGE_PATH=String(CFG_PARENT_PAGE_PATH||'').trim()||'/';
// Full URL of the embedding parent page (used for OAuth login_uri, public-results
// share links, and all external-facing CTAs). Always ends with a single '/'.
var SITE_URL=(function(){
  var o=PARENT_ORIGIN.replace(/\/+$/,'');
  var p=PARENT_PAGE_PATH;
  if(p.charAt(0)!=='/')p='/'+p;
  return o+p.replace(/\/+$/,'')+'/';
})();
// Exposed globally so the GIS init (competitions.js / views-bundle.js) can read
// window.__ERP_SITE_URL as the OAuth login_uri when the SPA is embedded in the
// third-party science-portal iframe. Must be an authorized redirect URI in the
// Google Cloud Console (see ROADMAP note). Standalone (top-level) usage ignores
// this because the iframe branch below only attaches it when embedded.
window.__ERP_SITE_URL = SITE_URL;

// ── Institutional domain allowlist (defense-in-depth) ──
// Backend (gas.js) enforces the same rule; this is the UI-side guard so users
// see an immediate, clear rejection without a round-trip and without leaving
// a stale Google session signed in.
var ALLOWED_SIGNIN_DOMAINS = ['ue-varna.bg', 'students.ue-varna.bg'];
function isAllowedSignInEmail(email){
  const at = String(email||'').lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at+1).toLowerCase();
  return ALLOWED_SIGNIN_DOMAINS.some(d => domain === d || domain.endsWith('.'+d));
}
window.isAllowedSignInEmail = isAllowedSignInEmail;
window.ALLOWED_SIGNIN_DOMAINS = ALLOWED_SIGNIN_DOMAINS;
// Expose parent-site URL to all JS modules (used by OAuth redirect, public-results
// share links, email templates, and cross-origin iframe-aware navigation).
// Expose to all JS modules (used by utils.js for proxy-aware fetch paths).
window.__ERP_GAS_URL = GAS_URL;
window.__ERP_GAS_IS_PROXY = GAS_IS_PROXY;
var MAX_FILE_SIZE_BYTES=Number(CFG_MAX_FILE_SIZE_BYTES)||10*1024*1024;
var PROJECT_TYPES=Array.isArray(CFG_PROJECT_TYPES)&&CFG_PROJECT_TYPES.length?CFG_PROJECT_TYPES:[
// v9.37.0-regulatory: maxDurationMonths updated per чл.12 (до 3 години)
{value:'ФНИ',label:'Фундаментални научни изследвания (ФНИ)',maxBudget:12000,minDurationMonths:12,maxDurationMonths:36,maxTeamMembers:5,maxStudentCollaborators:3,noExpensesFirstMonth:true,reviewerFee:60,reviewerFeeCurrency:'EUR',monographReviewerFeeEUR:250,monographPerReviewFeeEUR:100,budgetCategories:['literature','datasets','office_supplies','team_remuneration','monograph_review','project_review','annual_report_review','typesetting','translation','external_services','domestic_travel','international_travel','publication_fees','monograph_publication','empirical_research','other']},
{value:'ПНИ',label:'Приложни научни изследвания (ПНИ)',maxBudget:12000,minDurationMonths:12,maxDurationMonths:36,maxTeamMembers:5,maxStudentCollaborators:3,noExpensesFirstMonth:true,reviewerFee:60,reviewerFeeCurrency:'EUR',requiresTRL:true,requiresSupportLetters:true,budgetCategories:['literature','datasets','office_supplies','team_remuneration','project_review','annual_report_review','typesetting','translation','external_services','domestic_travel','international_travel','conference_fees','publication_fees','empirical_research','utility_model','other']},
{value:'ДНП',label:'Подпомагане разработването на докторски дисертации (ДНП)',maxBudget:5000,minDurationMonths:12,maxDurationMonths:12,reviewerFee:60,reviewerFeeCurrency:'EUR',noTeamRemuneration:true,budgetCategories:['literature','datasets','office_supplies','travel','reviews','editing','printing','translation','conference_fees','publication_fees','other']},
{value:'НПФ',label:'Частично финансиране на научни форуми (НПФ)',maxBudget:6000,maxBudgetBGN:10000,minDurationMonths:1,maxDurationMonths:3,reviewerFee:51,reviewerFeeCurrency:'EUR',npfTiers:{department:{maxBGN:4000,maxEUR:3000,label:'Катедрен форум'},faculty:{maxBGN:6000,maxEUR:2500,label:'Кръгла маса'},university:{maxBGN:10000,maxEUR:6000,label:'Университетски/национален форум'}},budgetCategories:['visual_identity','event_portfolio','guest_lecturer','technical_services','dissemination','proceedings_print','proceedings_digital','doi','metadata_db','metadata_bpos','reviewer','other']}
];
/* ─── PRIORITY AREAS (v9.37.0 — per Конкурсна сесия 2026, verified from Бележки и коментари.docx) ─── */
var PRIORITY_AREAS=Array.isArray(CFG_PRIORITY_AREAS)&&CFG_PRIORITY_AREAS.length?CFG_PRIORITY_AREAS:[
'Глобални пазари и инвестиции',
'Индустрия 5.0, технологични иновации и когнитивни системи',
'Зелена икономика и устойчиво развитие',
'Дигитална трансформация и изкуствен интелект в бизнеса и висшето образование',
'Управление на данни за бизнес решения',
'Регионални стратегии и развитие на човешките ресурси'
];

/* ─── CKK MEMBERS (v9.37.0 — per Бележки и коментари.docx: ЦКК не участват в проектни предложения) ─── */
// These emails are BLOCKED from submitting project proposals.
// Update via ScriptProperties key 'CKK_MEMBERS' (comma-separated @ue-varna.bg emails).
var CKK_MEMBERS = (function(){
  try {
    var raw = (window.ERP_CONFIG && window.ERP_CONFIG.CKK_MEMBERS) || '';
    if (!raw) return []; // Admin emails demoted — set CKK_MEMBERS in ERP_CONFIG / ScriptProperties to restore
    return raw.split(',').map(function(e){ return e.trim().toLowerCase(); }).filter(Boolean);
  } catch(_) { return []; }
})();
// Pre-built Set for O(1) CKK membership lookup (array.indexOf → Set.has)
var _CKK_SET = new Set(CKK_MEMBERS);

/* ─── DEFINITION OF "МЛАД УЧЕН" (per Правилник, v4.5.1) ─── */
var YOUNG_SCIENTIST_DEFINITION = '„Млад учен" е лице, което извършва научноизследователска и научно-образователна дейност във висше училище и/или научна организация след придобиване на първа образователно-квалификационна степен „магистър", но не повече от 10 години след придобиването ѝ.';
var STATUS_LABELS=(CFG_STATUS_LABELS&&typeof CFG_STATUS_LABELS==='object')?CFG_STATUS_LABELS:{
// ── Proposal lifecycle ──
draft:'Чернова',completed:'Попълнено',submitted:'Изпратено за проверка',returned:'Върнато за корекция',admin_passed:'Допустимо',in_review:'При рецензенти',reviewed:'Рецензирано',
approved:'Одобрено',rejected:'Отхвърлено',contracted:'Сключен договор',
admin_review:'Админ. проверка',needs_correction:'Нуждае от корекция',resubmitted:'Подадено отново',
eligible:'Допустимо',ineligible:'Недопустимо',
// ── Review lifecycle ──
reviewers_proposed:'Предложени рецензенти',reviewer_assignment:'Назн. рецензенти',reviewer_invited:'Поканен рецензент',reviewer_accepted:'Приел рецензия',review_submitted:'Подадена рецензия',
scored:'Оценено',above_threshold:'Допуснат до класиране',below_threshold:'Не покрива минималния праг',ranked:'Класирано',proposed_for_funding:'Предложен за финансиране',approved_for_funding:'Одобрено за финанс.',approved_by_ac:'Одобрен от АС',contract_preparation:'Подготовка на договор',reviewer_declined:'Рецензент отказал',active_project:'Активен проект',
// ── Contracting ──
contract_draft:'Проект на договор',contract_package_ready:'Готов договорен пакет',contracting:'Договаряне',contract_signed:'Подп. договор',
// ── Execution ──
active:'Активен проект',in_execution:'В изпълнение',progress_updated:'Актуализиран напредък',expense_requested:'Заявен разход',change_requested:'Заявена промяна',change_under_review:'Промяна — преглед',change_approved:'Промяна — одобрена',change_rejected:'Промяна — отказана',
// ── Reporting ──
reporting_due:'Подлежи на отчет',report_submitted:'Подаден отчет',report_under_review:'Отчет — преглед',report_accepted:'Отчет — приет',report_returned_for_correction:'Отчет — върнат',final_report_prepared:'Подготвен фин. отчет',final_review_submitted:'Финална рецензия',final_evaluation:'Финална оценка',
successfully_completed:'Успешно завършен',partially_completed:'Частично изпълнен',unsatisfactory:'Незадоволителен',
// ── Closure ──
closed:'Приключен',closed_with_sanction:'Приключен със санкция',closed_with_restriction:'Приключен с ограничение',sanction_3year:'Санкция (3 г.)'
};
// ── Competition lifecycle (separate namespace) ──
var COMPETITION_STATUS_LABELS={
draft:'Чернова',configured:'Конфигуриран',approved_by_ac:'Одобрен от АС',opened:'Открит',published:'Публикуван',open_for_submission:'Отворен за подаване',closed_for_submission:'Затворен за подаване',evaluation_in_progress:'Оценяване',results_approved:'Резултати одобрени',archived:'Архивиран',
active:'Активен',closed:'Затворен',results_published:'Резултати публикувани'
};
// ── BPMN Gap Closure 2026-05-04 ──
// Process 11 — MON Reporting status labels.
var MON_STATUS_LABELS={
  created:'Чернова',
  under_editorial_review:'Под редакция',
  returned_for_data_refresh:'Върнат за обновяване',
  finalized:'Финализиран',
  submitted:'Подаден към МОН',
  rejected_by_ministry:'Отхвърлен от МОН',
  acknowledged:'Потвърден',
  archived:'Архивиран',
  cancelled:'Отменен'
};
var MON_STATUS_COLOR={
  created:'var(--ink-4)',under_editorial_review:'var(--gold,#c69b1a)',
  returned_for_data_refresh:'var(--warn,#e08600)',finalized:'var(--info)',
  submitted:'var(--review,#5b48d8)',rejected_by_ministry:'var(--err)',
  acknowledged:'var(--ok)',archived:'var(--ink-3)',cancelled:'var(--err)'
};
var MON_REPORT_TYPE_LABELS={semiannual:'Шестмесечен',annual:'Годишен',adhoc:'Извънреден'};
// Process 4 — When true, the UI for CKK shows „Предложи рецензенти" instead
// of the legacy direct-assign action; Rector/VR see the proposals queue.
var TWO_STEP_REVIEWER_APPROVAL=true;
// Augment STATUS_LABELS with overdue + reviewer-proposal lifecycle.
try{
  STATUS_LABELS.report_overdue='Просрочен отчет';
  STATUS_LABELS.reviewers_proposed='Предложени рецензенти';
}catch(_){ }
var LOGO_URL=String(CFG_LOGO_URL||'assets/science-logo.png');
var UEV_LOGO_URL=String(CFG_UEV_LOGO_URL||'assets/uev-logo.jpg');

var APP_MOUNT_EVENT='erp-ui-mounted';
// Boot-time error handling & loader hiding is consolidated in index.html's
// inline <script> (runs first, more robust). This thin proxy exists for
// app.js's catch-block fallback only.
var hideLoadingScreen=()=>{
try{const s=document.getElementById('loading-screen');if(s){s.classList.add('hidden');setTimeout(()=>{try{if(s.parentNode)s.remove()}catch(_){}},600)}}catch(_){}
};

/* ─── DOCUMENTS ───
   Mock/static placeholder documents were removed in v5.2.5A1-ui30.
   Drive (OFFICIAL_DOCS_FOLDER_ID) is now the single source of truth. */
var STATIC_DOCUMENTS=[];

var COMPETITIONS=Array.isArray(_CFG_COMPETITIONS)?_CFG_COMPETITIONS.slice():[];

/* ─── REVIEWER FEE SCHEDULE (source: 01 Бюджет/ docs, May 2026) ─── */
var REVIEWER_FEE_SCHEDULE={
  // Project reviewer fees
  'ФНИ':{amount:60,currency:'EUR',label:'Рецензент на проект (последна година)'},
  'ПНИ':{amount:60,currency:'EUR',label:'Рецензент на проект (последна година)'},
  'ДНП':{amount:60,currency:'EUR',label:'Рецензент на проект (последна година)'},
  // Forum reviewer fees (BGN per regulation)
  'НПФ':{amount:100,currency:'BGN',label:'Рецензент на научен форум'},
  // Annual report reviewer fees
  '_ANNUAL_REPORT':{amount:25,currency:'EUR',label:'Рецензент на годишен отчет'},
  // Monograph reviewer fees (ФНИ only)
  '_MONOGRAPH':{amount:250,currency:'EUR',label:'Рецензент на монография (общо)'},
  '_MONOGRAPH_PER_REVIEW':{amount:100,currency:'EUR',label:'Рецензия за монография (на брой)'}
};

/**
 * Get the reviewer fee for a given project type.
 * @param {string} projectType — e.g. 'ФНИ', 'НПФ'
 * @returns {{ amount:number, currency:string, label:string }|null}
 */
function getReviewerFeeForType(projectType){
  var key=String(projectType||'').toUpperCase().trim();
  return REVIEWER_FEE_SCHEDULE[key]||null;
}

/**
 * Get the max budget for a given project type.
 * @param {string} projectType
 * @returns {number|null}
 */
function getMaxBudgetForType(projectType){
  var pt=PROJECT_TYPES.find(function(p){return p.value===String(projectType||'').trim()});
  return pt?pt.maxBudget:null;
}

/**
 * Validate budget amount against project type limit.
 * @param {string} projectType
 * @param {number} budgetEUR
 * @returns {{ ok:boolean, maxBudget:number|null, pctUsed:number, warning:string }}
 */
function validateBudgetForType(projectType,budgetEUR){
  var max=getMaxBudgetForType(projectType);
  if(max===null)return{ok:true,maxBudget:null,pctUsed:0,warning:''};
  var pct=Math.round((Number(budgetEUR)||0)/max*100);
  if((Number(budgetEUR)||0)>max){
    return{ok:false,maxBudget:max,pctUsed:pct,warning:'Бюджетът ('+Number(budgetEUR).toFixed(0)+' €) надвишава максимума за '+String(projectType)+' ('+max+' €).'};
  }
  var warn='';
  if(pct>=90)warn='Бюджетът е на '+pct+'% от максимума ('+max+' €).';
  return{ok:true,maxBudget:max,pctUsed:pct,warning:warn};
}

/* ─── PROFESSIONAL FIELDS (v9.37.0 — per Системен файл.docx)
   Dropdown shown after "Приоритетно направление" in the application form.
   Mirrors the official МОН professional-field classification. */
var PROFESSIONAL_FIELDS = [
  { value: '3.7',  label: '3.7 Администрация и управление' },
  { value: '3.8',  label: '3.8 Икономика' },
  { value: '3.9',  label: '3.9 Туризъм' },
  { value: '4.6',  label: '4.6 Информатика' }
];

/* ─── APPLICATION SESSION PARAMETERS (v9.46.0-rules — Конкурсна сесия 2026) ─── */
var APPLICATION_OPEN_DATE='26.05.2026';
var APPLICATION_DEADLINE_DATE='26.06.2026';
var APPLICATION_DEADLINE_ISO='2026-06-26';
var APPLICATION_INFO_URL='https://sites.google.com/ue-varna.bg/scientific-projects/2026-projects';
var APPLICATION_QUESTIONS_URL='https://forms.gle/1DKrN61JR71orCk3A';
var CKK_CONTACT_EMAIL='scientific.projects@ue-varna.bg';
var CKK_CONTACT_PHONE='0882164720';
var RECTOR_ORDER='РД-14-92/22.05.2026';

/* ─── BUDGET LIMITS REFERENCE TABLE (v9.46.0-rules — per docs/data-model-2026.md §6) ─── */
var BUDGET_LIMITS_BY_TYPE={
  'ФНИ':[
    {cat:'Специализирана научна литература',pct:10,note:'Само в рамките на първите 12 мес. (т.2.1)'},
    {cat:'Информационни масиви/бази данни',pct:40,note:'(т.2.2)'},
    {cat:'Канцеларски материали',pct:5,note:'(т.2.3)'},
    {cat:'Възнаграждения (с млади учени/докторанти)',pct:35,note:'Мин. 30% за млади учени/докторанти (т.3.1)'},
    {cat:'Възнаграждения (без млади учени)',pct:10,note:'(т.3.1)'},
    {cat:'Членове извън ИУ-Варна',pct:20,note:'От общите заплати'},
    {cat:'Компютърен набор и размножаване',pct:5,note:'(т.4.1)'},
    {cat:'Външни услуги',pct:25,note:'Само когато екипът не може (т.4.3)'},
    {cat:'Командировки в страната',pct:10,note:'Изисква се публикация (т.4.4)'},
    {cat:'Командировки в чужбина',pct:20,note:'Изисква се публикация (т.4.5)'},
    {cat:'Емпирично изследване',pct:20,note:'Анкетьори, фокус групи (т.4.8)'},
    {cat:'Рецензент (окончателен)',fixed:'60 €',note:'В последната година (т.3.3)'},
    {cat:'M1 (декември)',fixed:'0 лв',note:'Задължително нулеви разходи в M1'},
  ],
  'ПНИ':[
    {cat:'Специализирана научна литература',pct:10,note:'(т.2.1)'},
    {cat:'Информационни масиви/бази данни',pct:40,note:'(т.2.2)'},
    {cat:'Канцеларски материали',pct:5,note:'(т.2.3)'},
    {cat:'Възнаграждения (с млади учени/докторанти)',pct:35,note:'Мин. 30% за млади учени/докторанти (т.3.1)'},
    {cat:'Възнаграждения (без млади учени)',pct:10,note:'(т.3.1)'},
    {cat:'Членове извън ИУ-Варна',pct:20,note:'От общите заплати'},
    {cat:'Компютърен набор и размножаване',pct:5,note:'(т.4.1)'},
    {cat:'Външни услуги',pct:20,note:'По-нисък лимит вкл. при ПНИ (т.4.3)'},
    {cat:'Командировки в страната',pct:10,note:'(т.4.4)'},
    {cat:'Командировки в чужбина',pct:15,note:'По-нисък лимит при ПНИ (т.4.5)'},
    {cat:'Емпирично изследване',pct:25,note:'По-висок лимит при ПНИ (т.4.8)'},
    {cat:'Рецензент (окончателен)',fixed:'60 €',note:'В последната година (т.3.3)'},
    {cat:'M1 (декември)',fixed:'0 лв',note:'Задължително нулеви разходи в M1'},
  ],
  'ДНП':[
    {cat:'Канцеларски материали',pct:10,note:''},
    {cat:'Възнаграждения',fixed:'ЗАБРАНЕНИ',note:'Заплати не се допускат за ДНП'},
    {cat:'Рецензент (окончателен)',fixed:'60 €',note:'В последната година'},
    {cat:'Рецензент на годишен отчет',fixed:'25 €',note:'На годишен отчет'},
  ],
  'НПФ':[
    {cat:'Визуална идентичност',pct:15,note:'Уеб, лого, брандинг (т.1)'},
    {cat:'Портфолио на събитието',pct:30,note:'Макс. 30 лв/участник (т.2)'},
    {cat:'Гост-лектор',fixed:'≤ 1000 лв',note:'(т.3)'},
    {cat:'Техническо обслужване',pct:15,note:'Ако не е изцяло в ИУ-Варна (т.4)'},
    {cat:'Рецензент',fixed:'≤ 100 лв',note:'Назначен от ректора (т.7)'},
  ]
};

/* ─── REQUIRED DOCUMENTS PER PROJECT TYPE (v4.9.5) ───
   Maps each project type to its mandatory application documents.
   Used by the application form to show a checklist of documents
   the applicant must download, fill in, and re-upload.
   NOTE: The "Бюджет на проекта (Приложение 3)" Excel upload has been
   REMOVED — the inline budget editor (BudgetEditor) captures structured
   budget data and feeds it into the Sections 3-5 doc generation via
   {{BUDGET}} / {{BUDGET_TOTAL}} placeholders. No separate Excel upload needed.
   Structure: { id, label, description, templateName, acceptExt, required } */
var REQUIRED_DOCUMENTS_BY_TYPE = {
  'ФНИ': [
    { id: 'fnisections35',label: 'Формуляр за кандидатстване – Раздели 3-5', description: 'Работна програма, план-сметка и очаквани резултати (Раздели 3, 4 и 5)', templateName: '01-02 ФНИ Формуляр за кандидатстване Раздели 3-5.docx', acceptExt: '.doc,.docx,.pdf', required: true }
  ],
  'ПНИ': [
    { id: 'pnisections35',label: 'Формуляр за кандидатстване – Раздели 3-5', description: 'Работна програма, план-сметка и очаквани резултати (Раздели 3, 4 и 5)', templateName: '02-02 ПНИ Формуляр за кандидатстване Раздели 3-5.docx', acceptExt: '.doc,.docx,.pdf', required: true }
  ],
  'ДНП': [
    { id: 'dnpsections35',label: 'Формуляр за кандидатстване – Раздели 3-5', description: 'Работна програма, план-сметка и очаквани резултати (Раздели 3, 4 и 5)', templateName: '03-02 ДНП Формуляр за кандидастване Раздели 3-5.docx', acceptExt: '.doc,.docx,.pdf', required: true }
  ],
  'НПФ': [
    { id: 'npfform',      label: 'Формуляр за кандидатстване – НПФ',description: 'Пълен формуляр за кандидатстване за частично финансиране на научен форум', templateName: '04 НПФ Формуляр за кандидатстване.docx', acceptExt: '.doc,.docx,.pdf', required: true }
  ]
};

/** Get required document templates for a project type. */
function getRequiredDocuments(projectType){
  var key = String(projectType||'').toUpperCase().trim();
  return REQUIRED_DOCUMENTS_BY_TYPE[key] || [];
}

/* ─── BUDGET SPREADSHEET TEMPLATES (per project type) — v9.69.0 ───
   Official Google Sheets budget tables. The applicant generates a personal
   editable copy (in „Моите документи") that is pre-filled from the Step-3
   budget UI. Backend mirror: PROJECT_BUDGET_TEMPLATES in gscode.js. */
var PROJECT_BUDGET_TEMPLATES = {
  'ФНИ': { id: '1MCGrMcU82NY_yDqjXxyOxFS5Uwz9Xz5j8zUZYSfrUqQ', gid: 893829297,  label: 'Бюджетна таблица — ФНИ' },
  'ПНИ': { id: '1HqdUGvRobKSIkVajBEeN_OzLDq7kfZpaVWbc1qG3Xwc', gid: 403420795,  label: 'Бюджетна таблица — ПНИ' },
  'ДНП': { id: '1JZljcUkQz5-2lQfDXHM69ehmPaV8XD9a714v1voImy4', gid: 683768571,  label: 'Бюджетна таблица — ДНП' },
  'НПФ': { id: '1LhGG2IFoWhw3VuxwML7J7S5jLEnPApukmvUB9kC5Fbs', gid: 1015761759, label: 'Бюджетна таблица — НПФ' }
};

/** Get the budget spreadsheet template for a project type (or null). */
function getBudgetTemplate(projectType){
  var key = String(projectType||'').toUpperCase().trim();
  return PROJECT_BUDGET_TEMPLATES[key] || null;
}
try{ if(typeof window!=='undefined'){ window.PROJECT_BUDGET_TEMPLATES=PROJECT_BUDGET_TEMPLATES; window.getBudgetTemplate=getBudgetTemplate; } }catch(_){}

/** Check which required documents have been uploaded for a form.
 *  v12.30.1-fix: Added direct docType matching, templateSourceId matching,
 *  and templateSourceName matching — not just fragile name substring checks.
 *  Previously, library-attached docs (which carry no _generated flag) would
 *  only match if their name happened to contain the template ID string,
 *  causing false "missing documents" errors at submission time. */
function checkRequiredDocsStatus(projectType, attachedDocs, uploadedFiles){
  var required = getRequiredDocuments(projectType);
  if (!required.length) return { total:0, fulfilled:0, missing:[] };
  // Build a rich attachment corpus: for each attached doc, collect ALL
  // possible matchable strings so we can do multi-criteria matching.
  var attachedSignatures = (Array.isArray(attachedDocs)?attachedDocs:[]).map(function(d){
    var sigs = [];
    // 1. Generated doc marker: docType + '_generated'
    if(d._generated && d.docType) sigs.push(d.docType.toLowerCase() + '_generated');
    // 2. Direct docType field (set by generate, copyDocForUser, or backend)
    if(d.docType) sigs.push(d.docType.toLowerCase());
    // 3. templateSourceId from backend (set by copyDocForUser / copyDocument)
    if(d.templateSourceId) sigs.push(d.templateSourceId.toLowerCase());
    // 4. templateSourceName from backend
    if(d.templateSourceName) sigs.push(String(d.templateSourceName).toLowerCase());
    // 5. Doc name (lowercased)
    if(d.name) sigs.push(String(d.name).toLowerCase());
    // 6. Doc ID itself (sometimes matches template file IDs)
    if(d.id) sigs.push(String(d.id).toLowerCase());
    // 7. driveId (canonical Drive file ID)
    if(d.driveId && d.driveId !== d.id) sigs.push(String(d.driveId).toLowerCase());
    return sigs;
  });
  var allSignatures = attachedSignatures.reduce(function(acc, arr){ return acc.concat(arr); }, []);
  // Also include uploaded file names
  (Array.isArray(uploadedFiles)?uploadedFiles:[]).forEach(function(f){
    if(f.name) allSignatures.push(String(f.name).toLowerCase());
  });
  // Deduplicate
  var seen = {}; var uniqueSigs = [];
  allSignatures.forEach(function(s){ if(!seen[s]){ seen[s]=1; uniqueSigs.push(s); } });
  
  var fulfilled = 0, missing = [];
  required.forEach(function(doc){
    var docIdLc = String(doc.id||'').toLowerCase();
    var tplName = String(doc.templateName||'').toLowerCase();
    var tplPrefix = tplName.replace('.docx','').replace('.xlsx','').slice(0,12);
    // Build multiple match patterns from the required doc definition
    var found = uniqueSigs.some(function(n){
      // 1. Exact match: docType + '_generated' (generated via checklist button)
      if(n === docIdLc + '_generated') return true;
      // 2. Generated file prefix: fniteam_F1234567
      if(n.indexOf(docIdLc + '_') === 0) return true;
      // 3. Exact docType match (direct field from backend copy/generate)
      if(n === docIdLc) return true;
      // 4. Template name contains doc ID (e.g. "01-02 ФНИ Формуляр...")
      if(tplName.indexOf(docIdLc) >= 0 && n.indexOf(docIdLc) >= 0) return true;
      // 5. Template name prefix match (first 12 chars of template filename)
      if(tplPrefix.length >= 4 && n.indexOf(tplPrefix) >= 0) return true;
      // 6. Doc name contains the doc ID anywhere
      if(n.indexOf(docIdLc) >= 0) return true;
      return false;
    });
    if (found) fulfilled++; else missing.push(doc);
  });
  return { total: required.length, fulfilled: fulfilled, missing: missing };
}

/* ─── DOCUMENT HELPERS ─── */
/* Canonical categories used by the Documents view tabs / section grouping.
   When the Drive folderName matches one of these (case-insensitive substring),
   we adopt it directly. Otherwise we fall back to filename heuristics so that
   files sitting at the root of OFFICIAL_DOCS_FOLDER_ID (which inherits the
   parent folder's display name as folderName) still get grouped under a
   semantic category instead of one giant "Общи" / parent-folder bucket. */
var _DOC_CANON_CATS = ['Нормативни','Критерии','Насоки','Шаблони','ФНИ','ПНИ','ДНП','ПСП','НПФ'];
var _matchCanonCat = s => {
    if (!s) return '';
    const t = String(s).trim();
    for (const c of _DOC_CANON_CATS) {
        if (t === c) return c;
        if (t.toLowerCase().includes(c.toLowerCase())) return c;
    }
    return '';
};
var _categoryFromName = n => {
    n = String(n || '');
    if (n.includes('ФНИ')) return 'ФНИ';
    if (n.includes('ПНИ')) return 'ПНИ';
    if (n.includes('ДНП')) return 'ДНП';
    if (n.includes('НПФ')) return 'НПФ';
    if (n.includes('ПСП')) return 'ПСП';
    if (n.includes('Критерии') || n.includes('Матрица') || n.includes('класиране') || n.includes('оценъч')) return 'Критерии';
    if (n.includes('Правилник') || n.includes('Система') || n.includes('Наредба') || n.includes('Регламент') || n.includes('Закон') || n.includes('ЗЕДЕУУ') || n.includes('ЗЗЛД') || n.includes('GDPR')) return 'Нормативни';
    if (n.includes('Образец') || n.includes('Декларация') || n.includes('Шаблон') || n.includes('Форма') || n.match(/обр\.?\s*\d/i)) return 'Шаблони';
    if (n.includes('направления') || n.includes('Приоритет') || n.includes('Цели') || n.includes('Насоки') || n.includes('Указани')) return 'Насоки';
    return '';
};
var getDocCategory = doc => {
    if (!doc) return 'Общи';
    // 0. Honour explicit project_type from backend (most reliable)
    if (doc.projectType) {
        const pt = String(doc.projectType).trim().toUpperCase();
        if (['ФНИ','ПНИ','ДНП','НПФ','ПСП'].includes(pt)) return pt;
    }
    // 1. Honour Drive subfolder names that already match a canonical category.
    const folderHit = _matchCanonCat(doc.folderName);
    if (folderHit) return folderHit;
    // 2. Filename heuristics.
    const nameHit = _categoryFromName(doc.name);
    if (nameHit) return nameHit;
    // 3. Fall back to the raw folder name (if any) — admin custom categories.
    if (doc.folderName && String(doc.folderName).trim()) return String(doc.folderName).trim();
    return 'Общи';
};

var FORM_ID_PATTERN = /^F[0-9A-F]{8}$/i;

/* Normalise the Drive listing into the shape the UI expects.
   - Filters out per-application upload folders (folderName matches FORM_ID_PATTERN).
   - Deduplicates by file id.
   - Backfills folderName via getDocCategory() when Drive returned an empty label.
   No more static merge — Drive is authoritative. */
var _normDocKeys = (d) => {
    // v3.39.4-snakefix: Normalise snake_case from PHP API to camelCase
    if (d.drive_id && !d.driveId) d.driveId = d.drive_id;
    if (d.mime_type && !d.mimeType) d.mimeType = d.mime_type;
    if (d.preview_link && !d.previewLink) d.previewLink = d.preview_link;
    if (d.web_view_link && !d.webViewLink) d.webViewLink = d.web_view_link;
    if (d.google_doc_edit_link && !d.googleDocEditLink) d.googleDocEditLink = d.google_doc_edit_link;
    if (d.edit_link && !d.editLink) d.editLink = d.edit_link;
    if (d.download_url && !d.downloadUrl) d.downloadUrl = d.download_url;
    if (d.folder_name && !d.folderName) d.folderName = d.folder_name;
    if (d.file_id && !d.fileId) d.fileId = d.file_id;
    if (d.type_label && !d.typeLabel) d.typeLabel = d.type_label;
    if (d.project_type && !d.projectType) d.projectType = d.project_type;
    if (d.template_source_id && !d.templateSourceId) d.templateSourceId = d.template_source_id;
    if (d.user_email && !d.userEmail) d.userEmail = d.user_email;
    if (d.form_id && !d.formId) d.formId = d.form_id;
    if (d.is_static !== undefined && d.isStatic === undefined) d.isStatic = d.is_static;
    return d;
};

var mergeDocuments = (driveDocsRaw) => {
    if (!Array.isArray(driveDocsRaw)) return [];
    const seenIds = new Set();
    const result = [];
    for (const dd of driveDocsRaw) {
        if (!dd || !dd.id) continue;
        if (seenIds.has(dd.id)) continue;
        _normDocKeys(dd); // Normalise snake_case → camelCase in-place
        if (dd.folderName && FORM_ID_PATTERN.test(String(dd.folderName).trim())) continue;
        const enriched = { ...dd };
        if (!enriched.folderName || !String(enriched.folderName).trim()) {
            enriched.folderName = getDocCategory(enriched);
        }
        result.push(enriched);
        seenIds.add(dd.id);
    }
    return result;
};

/* ─── UTILITIES ─── */
var dtfDate=new Intl.DateTimeFormat('bg-BG',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Sofia'});
var dtfFull=new Intl.DateTimeFormat('bg-BG',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Sofia'});

/* ── Unified institutional date format ──────────────────────────────────
   Display format requested by end-user review (2026-05-11):
       DD-MM-YYYY/HH:MM:SS    e.g.  11-05-2026/15:28:42   (datetime)
       DD-MM-YYYY              e.g.  11-05-2026            (date-only)
   Numeric DD-MM-YYYY (no Bulgarian month name) — applied SYSTEMWIDE so
   every history entry, badge, table cell uses the same precision down
   to the second. Time zone Europe/Sofia. Exposed as
   window.formatBgDateTime / window.formatBgDate so any module
   (compliance, i18n, main analytics, late-loaded views) can call it.
   Also overrides `Date.prototype.toString` ONCE in the browser so any
   raw `{someDateObj}` rendered by React produces the same readable
   string instead of the noisy native ‘Fri May 01 2026 00:00:00 GMT+0300’.
───────────────────────────────────────────────────────────────────────── */
var _BG_MONTHS=['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
var _bgPad=n=>(n<10?'0':'')+n;
var _bgDateParts=d=>{
  // Convert to Europe/Sofia wall time without DST surprises by using the
  // formatToParts pipeline once and reading individual fields.
  try{
    const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Sofia',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d);
    const m={};p.forEach(x=>{m[x.type]=x.value});
    return {y:m.year,mo:m.month,da:m.day,h:m.hour==='24'?'00':m.hour,mi:m.minute,se:m.second||'00'};
  }catch(_){
    return {y:String(d.getFullYear()),mo:_bgPad(d.getMonth()+1),da:_bgPad(d.getDate()),h:_bgPad(d.getHours()),mi:_bgPad(d.getMinutes()),se:_bgPad(d.getSeconds())};
  }
};
var formatBgDateTime=v=>{
  if(v==null||v==='')return'—';
  const d=(v instanceof Date)?v:new Date(v);
  if(isNaN(d.getTime()))return String(v);
  const p=_bgDateParts(d);
  return `${p.da}-${p.mo}-${p.y}/${p.h}:${p.mi}:${p.se}`;
};
var formatBgDate=v=>{
  if(v==null||v==='')return'—';
  const d=(v instanceof Date)?v:new Date(v);
  if(isNaN(d.getTime()))return String(v);
  const p=_bgDateParts(d);
  return `${p.da}-${p.mo}-${p.y}`;
};
try{ window.formatBgDateTime=formatBgDateTime; window.formatBgDate=formatBgDate; }catch(_){ }

// One-shot Date.prototype.toString override (browser bundle only). Guards
// against double-patching on hot-reload. Original kept on _origToString
// for any code that explicitly needs the native form.
try{
  if(typeof Date!=='undefined' && !Date.prototype._bgPatched){
    Date.prototype._origToString = Date.prototype.toString;
    Date.prototype.toString = function(){ try{ return formatBgDateTime(this); }catch(_){ return Date.prototype._origToString.call(this); } };
    Date.prototype._bgPatched = true;
  }
}catch(_){ }

var fmtDate=s=>{if(s==null||s==='')return'—';const d=new Date(s);return isNaN(d.getTime())?String(s):formatBgDate(d)};
var fmtDateTime=s=>{if(s==null||s==='')return'—';const d=new Date(s);return isNaN(d.getTime())?String(s):formatBgDateTime(d)};
var initials=n=>(n||'').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()||'?';
/** Skeleton placeholder cards shown during initial data load */
var SkeletonCards=({count=3})=>e(Fragment,null,...Array.from({length:count},(_,i)=>e('div',{key:i,className:'skeleton-card skeleton',style:{padding:'1.1rem',display:'flex',flexDirection:'column',gap:'.6rem'}},e('div',{className:'skeleton skeleton-line w75'}),e('div',{className:'skeleton skeleton-line w90'}),e('div',{className:'skeleton skeleton-line w50'}))));
/** Skeleton table rows shown during data load */

/** Animated refresh button – spins icon while loading or while a background SWR refresh is in flight */
var RefreshButton=({loading,onClick,title='Опресни',action=null})=>{
    const bgActive=action?useReadActivity(action):false;
    const spinning=!!loading||bgActive;
    return e('button',{className:'btn btn-outline btn-icon'+(spinning?' btn-refresh-spinning':''),onClick:spinning?undefined:onClick,title:spinning?'Зареждане…':title,disabled:spinning,'aria-label':spinning?'Зареждане…':title},e('i',{className:'fas fa-sync-alt','aria-hidden':'true'}));
};
var getName=f=>f?String(f.userName||f.UserName||f.user_name||''):'';
var getEmail=f=>f?String(f.email||f.Email||f.userEmail||f.UserEmail||f.user_email||''):'';
var getStatus=f=>{if(!f)return'draft';let s=String(f.status||f.Status||'draft').toLowerCase();if(s==='drafts')s='draft';const map={'чернова':'draft','изпратена':'submitted','одобрена':'approved','върната':'returned','отхвърлена':'rejected'};return map[s]||s};
var getTitle=f=>f?String(f.title||f.Title||''):'';
var getId=f=>f?String(f.id||f.ID||''):'';
var getProjectType=f=>String(f.projectCode||f.ProjectCode||'');
var getCompetitionId=f=>f?String(f.competitionId||f.CompetitionId||''):'';
var getDescription=f=>f?String(f.description||f.Description||''):'';
var getArea=f=>f?String(f.area||f.Area||''):'';
/** Split a multi-area delimited string (;;) into a clean array.
 *  Single-value legacy rows return a 1-element array.
 *  @param {object|string} f — form object (or raw area string)
 *  @returns {Array<string>} */
var getAreas=f=>{
  var raw='';
  if(typeof f==='string')raw=f;
  else if(f&&typeof f==='object')raw=String(f.area||f.Area||'');
  if(!raw)return[];
  return raw.split(';;').map(function(s){return s.trim();}).filter(Boolean);
};
/** Join an array of areas into the ;;‑delimited storage format. */
var joinAreas=arr=>(Array.isArray(arr)?arr:[]).filter(function(a){return String(a||'').trim();}).join(';;');
/** Get the primary (first) area for display in compact contexts. */
var getPrimaryArea=f=>{var a=getAreas(f);return a.length>0?a[0]:'';};
var getReturnComment=f=>f?String(f.returnComment||f.ReturnComment||f.return_comment||''):'';
/* Backend stores returnComment as JSON {comment, deadline} when an admin returns
   a submission for correction. Parse defensively — older rows or report rows
   may still be plain strings. Returns {comment, deadline, daysLeft, expired, raw}. */
var parseReturnComment=raw=>{
  const s=String(raw||'').trim();if(!s)return null;
  let comment=s,deadline=null;
  if(s.charAt(0)==='{'){try{const o=JSON.parse(s);if(o&&typeof o==='object'){comment=String(o.comment||'').trim();deadline=o.deadline||null;}}catch(_){}}
  let daysLeft=null,expired=false,deadlineLabel='';
  if(deadline){const dl=new Date(deadline);if(!isNaN(dl)){daysLeft=Math.ceil((dl-Date.now())/86400000);expired=daysLeft<=0;try{deadlineLabel=(typeof formatBgDateTime==='function')?formatBgDateTime(dl):dl.toISOString().slice(0,16).replace('T',' ');}catch(_){deadlineLabel=dl.toISOString().slice(0,16).replace('T',' ');}}}
  return{comment,deadline,deadlineLabel,daysLeft,expired,raw:s};
};
var getFileIds=f=>{if(!f)return[];let r=f.fileIds||f.FileIds||f.file_ids||[];if(typeof r==='string'){try{r=JSON.parse(r)}catch(_){r=[]}}return Array.isArray(r)?r:[]};
var getHistory=f=>{if(!f)return[];const r=f.history||f.History||[];return Array.isArray(r)?r:[]};
// v12.31.3-uxharden: never throws (null form), tolerates JSON-string payloads
// from the SQL replica, and filters out null/non-object entries so callers
// always get a clean array (never undefined).
var getAttachedDocs=f=>{if(!f)return[];let r=f.attachedDocs||f.AttachedDocs||f.attached_docs||[];if(typeof r==='string'){try{r=JSON.parse(r)}catch(_){r=[]}}return Array.isArray(r)?r.filter(d=>d&&typeof d==='object'):[]};
var getSignature=f=>f.signature||f.Signature||null;
var getSignatureAdmin=f=>f.signatureAdmin||f.SignatureAdmin||null;
var getSubmitted=f=>f?(f.submitted||f.Submitted||''):'';
var getCreated=f=>f?(f.created||f.Created||''):'';
var isImageSignature=v=>typeof v==='string'&&v.indexOf('data:image')===0;
var REVIEWER_STATUS_LABELS={pending:'В очакване',consented:'Дал съгласие',reviewed:'Рецензия получена',declined:'Отказана',inactive:'Неактивен',assigned:'Назначен',submitted:'Подадена'};

/* ── ROLE SYSTEM ── */
var ROLE_ADMIN='admin';
var ROLE_REVIEWER='reviewer';
var ROLE_APPLICANT_REVIEWER='applicant-reviewer';
var ROLE_APPLICANT='applicant';
// Extended roles per regulation workflow
var ROLE_RECTOR='rector';
var ROLE_VICE_RECTOR='vice_rector';
var ROLE_CKK='ckk';
var ROLE_NIDD='nidd';
var ROLE_ACADEMIC_COUNCIL='academic_council';
var ROLE_PROJECT_LEAD='project_lead';
var ROLE_FINANCIAL='financial';
var ROLE_ACCOUNTING='accounting';
var ROLE_LIBRARY='library';
var ROLE_UNIT_HEAD='unit_head';
var ROLE_TEAM_MEMBER='team_member';
var ROLE_LABELS={[ROLE_ADMIN]:'Администратор',[ROLE_REVIEWER]:'Рецензент',[ROLE_APPLICANT_REVIEWER]:'Кандидат / Рецензент',[ROLE_APPLICANT]:'Кандидат',[ROLE_RECTOR]:'Ректор',[ROLE_VICE_RECTOR]:'Зам.-ректор НИИРК',[ROLE_CKK]:'ЦКК',[ROLE_NIDD]:'Отдел НИИ',[ROLE_ACADEMIC_COUNCIL]:'Академичен съвет',[ROLE_PROJECT_LEAD]:'Ръководител на проект',[ROLE_TEAM_MEMBER]:'Член на екип',[ROLE_FINANCIAL]:'Финансов контрол',[ROLE_ACCOUNTING]:'Счетоводство',[ROLE_LIBRARY]:'Библиотека',[ROLE_UNIT_HEAD]:'Рк. звено'};
var isAdminRole=r=>r===ROLE_ADMIN||r===ROLE_CKK||r===ROLE_NIDD||r===ROLE_RECTOR||r===ROLE_VICE_RECTOR;
var isReviewerRole=r=>r===ROLE_REVIEWER||r===ROLE_APPLICANT_REVIEWER;

/* ── RBAC MATRIX ── single source of truth for capability checks.
   Capability flags are coarse-grained per the regulatory dataflow.
   Use `can(role, capability)` for boolean checks. */
var RBAC_CAPABILITIES={
// ── Competition & Call Management (1.1) ──
'competition.create':[ROLE_ADMIN,ROLE_NIDD,ROLE_VICE_RECTOR],
'competition.configure':[ROLE_ADMIN,ROLE_NIDD,ROLE_VICE_RECTOR,ROLE_CKK],
'competition.approve_ac':[ROLE_ACADEMIC_COUNCIL,ROLE_RECTOR],
'competition.open':[ROLE_RECTOR,ROLE_ADMIN],
'competition.publish':[ROLE_ADMIN,ROLE_NIDD,ROLE_RECTOR],
'competition.archive':[ROLE_ADMIN,ROLE_NIDD],
// ── Proposal (1.2) ──
'proposal.create':[ROLE_APPLICANT,ROLE_APPLICANT_REVIEWER,ROLE_PROJECT_LEAD],
'proposal.submit':[ROLE_APPLICANT,ROLE_APPLICANT_REVIEWER,ROLE_PROJECT_LEAD],
'proposal.admin_review':[ROLE_ADMIN,ROLE_NIDD],
'proposal.return_for_correction':[ROLE_ADMIN,ROLE_NIDD,ROLE_CKK],
// ── Review & Evaluation (1.3) ──
'review.propose_reviewers':[ROLE_CKK,ROLE_ADMIN],
'review.approve_reviewers':[ROLE_RECTOR,ROLE_ADMIN],
'review.assign':[ROLE_ADMIN,ROLE_NIDD,ROLE_CKK],
'review.submit':[ROLE_REVIEWER,ROLE_APPLICANT_REVIEWER],
'review.rank':[ROLE_CKK,ROLE_ADMIN],
'review.approve_for_funding':[ROLE_ACADEMIC_COUNCIL,ROLE_RECTOR],
// ── Contract & Activation (1.4) ──
'contract.generate':[ROLE_ADMIN,ROLE_NIDD],
'contract.sign_rector':[ROLE_RECTOR],
'contract.sign_leader':[ROLE_PROJECT_LEAD,ROLE_APPLICANT,ROLE_APPLICANT_REVIEWER],
'contract.activate':[ROLE_ADMIN,ROLE_NIDD],
// ── Execution & Monitoring (1.5) ──
'project.update_progress':[ROLE_PROJECT_LEAD,ROLE_TEAM_MEMBER,ROLE_APPLICANT,ROLE_APPLICANT_REVIEWER],
'project.add_results':[ROLE_PROJECT_LEAD,ROLE_TEAM_MEMBER,ROLE_APPLICANT,ROLE_APPLICANT_REVIEWER],
'expense.request':[ROLE_PROJECT_LEAD,ROLE_APPLICANT,ROLE_APPLICANT_REVIEWER],
'expense.approve':[ROLE_FINANCIAL,ROLE_ADMIN],
'expense.post':[ROLE_ACCOUNTING,ROLE_ADMIN],
'change.request':[ROLE_PROJECT_LEAD,ROLE_APPLICANT,ROLE_APPLICANT_REVIEWER],
'change.review':[ROLE_CKK,ROLE_NIDD,ROLE_ADMIN],
'change.approve':[ROLE_RECTOR,ROLE_ADMIN],
// ── Reporting & Closing (1.6) ──
'report.submit':[ROLE_PROJECT_LEAD,ROLE_APPLICANT,ROLE_APPLICANT_REVIEWER],
'report.review':[ROLE_NIDD,ROLE_CKK,ROLE_ADMIN],
'report.accept':[ROLE_CKK,ROLE_ADMIN],
'report.final_review':[ROLE_REVIEWER,ROLE_CKK],
'report.final_evaluate':[ROLE_CKK,ROLE_ADMIN],
'sanction.impose':[ROLE_RECTOR,ROLE_ADMIN,ROLE_CKK],
// ── Institutional Reporting (1.7) ──
'inst_report.compile':[ROLE_NIDD,ROLE_ADMIN],
'inst_report.review':[ROLE_VICE_RECTOR,ROLE_NIDD],
'inst_report.submit_moe':[ROLE_RECTOR],
// ── Library / Publications ──
'publication.deposit':[ROLE_LIBRARY,ROLE_PROJECT_LEAD,ROLE_TEAM_MEMBER],
// ── System ──
'audit.view':[ROLE_ADMIN,ROLE_NIDD,ROLE_RECTOR],
'rbac.manage':[ROLE_ADMIN]
};
var can=(role,capability)=>{
const allowed=RBAC_CAPABILITIES[capability];
if(!allowed)return false;
return allowed.indexOf(role)>=0;
};

/* ─── ERROR BOUNDARY (defined early so it's always available) ───
 * Declared as `var` + class expression (NOT a bare `class` statement):
 * a top-level `class` creates a global *lexical* binding that would
 * shadow/conflict with any `var ErrorBoundary = window.ErrorBoundary||null`
 * alias in later-loaded classic scripts (same TDZ hazard as top-level
 * `const`). `var` keeps it a plain window global. */
var ErrorBoundary = class ErrorBoundary extends React.Component{
constructor(props){super(props);this.state={hasError:false,errorMsg:'',errorStack:'',retryCount:0,staleHint:false};this.handleRetry=this.handleRetry.bind(this);this.handleCopyError=this.handleCopyError.bind(this);this.handleHardReload=this.handleHardReload.bind(this)}
static getDerivedStateFromError(error){return{hasError:true,errorMsg:(error&&error.message)||'Неизвестна грешка',errorStack:(error&&error.stack)||''}}
componentDidCatch(error,info){
  console.error('ErrorBoundary:',error,info);
  var errMsg=(error&&error.message)||'Unknown';
  // v12.49.2: React "Minified error #310" = "Rendered more hooks than during the
  // previous render." In a periodic-build SPA served via CDN this is almost always
  // caused by a STALE cached bundle (older chunk meeting newer code) rather than a
  // genuine source bug. Flag it so the UI leads with a hard-reload remedy.
  var isHookError=/Minified React error #310|Rendered more hooks than during the previous render|hook/i.test(errMsg+' '+(error&&error.stack||''));
  var staleHint=isHookError;
  try{
    var errData={message:errMsg,stack:(error&&error.stack)||'',componentStack:(info&&info.componentStack)||'',timestamp:new Date().toISOString(),isHookError:isHookError};
    window._safeLS?window._safeLS.setItem('erp_last_error',JSON.stringify(errData)):localStorage.setItem('erp_last_error',JSON.stringify(errData));
    // Log to global ring buffer for the notification centre
    if(window.__erp_errors){window.__erp_errors.unshift({ts:Date.now(),msg:errMsg,src:'ErrorBoundary',line:0,isHookError:isHookError});if(window.__erp_errors.length>20)window.__erp_errors.length=20}
  }catch(_){}
  // Auto-retry once for transient backend bugs — most "is not defined"
  // errors are GAS cold-start races that resolve on a re-render.
  var isBackendBug=/is not defined|is not a function|Cannot read properties of/i.test(errMsg);
  if(isBackendBug&&this.state.retryCount<1){
    var self=this;
    setTimeout(function(){self.handleRetry()},1200);
  }
  if(staleHint){this.setState({staleHint:true});}
}
handleRetry(){this.setState({hasError:false,errorMsg:'',errorStack:'',staleHint:false,retryCount:this.state.retryCount+1});try{(window._safeLS||localStorage).removeItem('erp_last_error')}catch(_){}}
handleCopyError(){
  var txt='Error: '+this.state.errorMsg+'\n\nStack: '+this.state.errorStack+'\n\nTime: '+new Date().toISOString()+'\nBuild: '+(window.__ERP_BUILD||'?');
  try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt);if(typeof toast==='function')toast('Грешката е копирана в клипборда','info',2000)}else{prompt('Копирайте грешката (Ctrl+C):',txt)}}catch(_){prompt('Копирайте грешката (Ctrl+C):',txt)}
}
// v12.49.2: Hard reload that bypasses the browser + CDN cache (Cache-Control:
// no-cache + a fresh ?_t query so every js/*.js is re-fetched). The single most
// effective remedy for minified-hook/render errors caused by a stale cached bundle.
handleHardReload(){
  try{(window._safeLS||localStorage).removeItem('erp_last_error')}catch(_){}
  try{
    var url=String(location.href||'');
    url=url.replace(/[?&]_t=\d+/g,''); // strip any prior cache-buster
    var sep=url.indexOf('?')>=0?'&':'?';
    url=url+sep+'_t='+Date.now();
    var h=String(location.hash||'');
    if(h) url=url.replace(/#.*$/,'' )+h; // keep the route hash
    var req=new XMLHttpRequest();
    req.open('GET',url,false); req.setRequestHeader('Cache-Control','no-cache'); req.send();
  }catch(_){}
  try{location.reload(true);}catch(_){location.href=url;}
}
render(){if(this.state.hasError){
    var cr=React.createElement;
    const errMsg=String(this.state.errorMsg||'');
    const isBackendBug=/is not defined|is not a function|Cannot read properties of/i.test(errMsg);
    const isNetworkBug=/Failed to fetch|NetworkError|timeout|Load failed/i.test(errMsg);
    // v12.49.2: dedicated React #310 resolution path.
    const isHookError=/Minified React error #310|Rendered more hooks than during the previous render|hook/i.test(errMsg+' '+(this.state.errorStack||''));
    // generic message for non-hook errors
    var userMsg=isBackendBug?'Сървърът върна неочакван отговор. Това обикновено се оправя с презареждане.'
      :isNetworkBug?'Проблем с мрежовата свързаност. Проверете интернета и опитайте отново.'
      :'Приложението срещна неочаквана грешка. Моля, опитайте отново.';
    var autoRetrying=isBackendBug&&this.state.retryCount<1;
    var build=window.__ERP_BUILD||'?';
    if(isHookError){
      // React #310 = "Rendered more hooks than during the previous render."
      // Most common cause in this CDN-served, periodically-built SPA: a STALE
      // cached JS chunk (old + new code mix). Lead with a hard reload (cache bypass).
      return cr('div',{style:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-body, sans-serif)',background:'var(--bg, #F4F5F7)',padding:'1rem'}},
        cr('div',{style:{maxWidth:'560px',width:'100%',background:'var(--card, #fff)',border:'1px solid var(--border, #E2E4E9)',borderRadius:'14px',padding:'2rem 2rem 1.6rem',boxShadow:'0 8px 30px rgba(20,30,60,.08)',textAlign:'center'}},
          cr('div',{style:{width:'64px',height:'64px',borderRadius:'50%',background:'var(--warn-bg, #FEF3C7)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1rem',border:'1px solid var(--warn-border, #FCD34D)'}},cr('i',{className:'fas fa-sync-alt',style:{fontSize:'1.4rem',color:'var(--warn, #B45309)'}})),
          cr('h2',{style:{margin:'0 0 .4rem',color:'var(--ink, #181818)',fontSize:'1.25rem'}},'Грешка при зареждане на интерфейса'),
          cr('p',{style:{color:'var(--ink-2, #374151)',margin:'0 0 .35rem',lineHeight:1.55,fontSize:'.9rem'}},
            'Засечена е вътрешна грешка на React („минифицирана грешка #310“). Най-често е причинена от остаряла кеширана версия на скриптовете в браузъра или CDN-а.'),
          cr('div',{style:{background:'var(--bg-2, #F7F8FA)',border:'1px solid var(--border, #E2E4E9)',borderRadius:'8px',padding:'.55rem .7rem',margin:'.4rem 0 .9rem',fontSize:'.74rem',color:'var(--ink-3, #6B7280)',textAlign:'left',lineHeight:1.5}},
            cr('strong',{style:{color:'var(--ink, #181818)'}},'Какво се случи: '),
            '„Rendered more hooks than during the previous render“ — компонентът е извикал различен брой React hooks между две зареждания. Това обикновено означава, че част от кода е по-нова, а част — по-стара (кеш).'),
          cr('div',{style:{display:'flex',flexDirection:'column',gap:'.55rem',marginTop:'.4rem'}},
            cr('button',{onClick:this.handleHardReload,style:{padding:'.7rem 1rem',border:'none',borderRadius:'9px',background:'var(--primary, #233874)',color:'#fff',cursor:'pointer',fontSize:'.92rem',fontWeight:600}},
              '🔄 Презареди без кеш (препоръчително)'),
            cr('button',{onClick:this.handleRetry,style:{padding:'.6rem 1rem',border:'1px solid var(--border, #E2E4E9)',borderRadius:'9px',background:'var(--surface)',color:'var(--ink, #181818)',cursor:'pointer',fontSize:'.88rem'}},
              'Опитай отново'),
            cr('button',{onClick:function(){window.location.reload()},style:{padding:'.6rem 1rem',border:'1px solid var(--border, #E2E4E9)',borderRadius:'9px',background:'var(--bg-2, #F7F8FA)',color:'var(--ink-3, #6B7280)',cursor:'pointer',fontSize:'.84rem'}},
              'Опресни страницата'),
            cr('button',{onClick:this.handleCopyError,style:{padding:'.5rem 1rem',border:'none',borderRadius:'9px',background:'transparent',color:'var(--ink-4, #9CA3AF)',cursor:'pointer',fontSize:'.78rem'}},
              '📋 Копирай детайлите за поддръжката')),
          cr('p',{style:{fontSize:'.68rem',color:'var(--ink-4, #9CA3AF)',marginTop:'1rem',fontFamily:'monospace'}},'Версия: '+build+'  ·  Ако грешката се повтаря след презареждане без кеш — се обърнете към администратора.')
        ));
    }
    // Non-hook generic fallback (unchanged behaviour, lightly refreshed styling)
    return cr('div',{style:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--font-body, sans-serif)',background:'var(--bg, #F4F5F7)'}},
      cr('div',{style:{textAlign:'center',maxWidth:'520px',padding:'2rem'}},
        cr('div',{style:{width:'64px',height:'64px',borderRadius:'50%',background:'var(--err-bg, #FEF2F2)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 1.2rem',border:'1px solid var(--err-border, #FCA5A5)'}},cr('i',{className:'fas fa-exclamation-triangle',style:{fontSize:'1.4rem',color:'var(--err, #991B1B)'}})),
        cr('h2',{style:{margin:'0 0 .5rem',color:'var(--ink, #181818)',fontSize:'1.3rem'}},'Възникна грешка'),
        cr('p',{style:{color:'var(--ink-3, #505050)',margin:'0 0 .6rem',lineHeight:1.6,fontSize:'.88rem'}},autoRetrying?'Автоматично възстановяване след момент…':userMsg),
        cr('p',{style:{fontSize:'.72rem',margin:'0 0 1.5rem',fontFamily:'monospace',color:'var(--ink-4, #858585)',wordBreak:'break-word',maxWidth:'480px',background:'var(--bg-2)',padding:'.35rem .6rem',borderRadius:'var(--r-xs)'}},errMsg),
        cr('div',{style:{display:'flex',gap:'.6rem',justifyContent:'center',flexWrap:'wrap'}},
          cr('button',{onClick:this.handleRetry,style:{padding:'.55rem 1.2rem',border:'1px solid var(--border, #E2E4E9)',borderRadius:'8px',background:'var(--surface)',color:'var(--ink, #181818)',cursor:'pointer',fontSize:'.85rem'}},'Опитай отново'),
          cr('button',{onClick:function(){window.location.reload()},style:{padding:'.55rem 1.2rem',border:'none',borderRadius:'8px',background:'var(--primary, #233874)',color:'white',cursor:'pointer',fontSize:'.85rem'}},'Опресни страницата'),
          cr('button',{onClick:this.handleCopyError,style:{padding:'.55rem 1.2rem',border:'1px solid var(--border, #E2E4E9)',borderRadius:'8px',background:'var(--bg-2)',color:'var(--ink-3)',cursor:'pointer',fontSize:'.82rem'}},'📋 Копирай грешката'))));}return this.props.children}
};


/* ════════════════════════════════════════════════════════════════════════
 * CONNECTIVITY MONITOR (v12.21.0)
 * Tracks backend reachability and provides health status to UI components.
 * Listens for events from router.js, data-layer.js, and hostinger-config.js.
 * ════════════════════════════════════════════════════════════════════════ */
var CONNECTIVITY = {
  _state: {
    gasUp: null,          // null=unknown, true=reachable, false=unreachable
    phpUp: null,
    degraded: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    lastChange: 0
  },
  _listeners: [],
  /** Subscribe to connectivity state changes. Returns unsubscribe function. */
  onChange: function(fn) {
    this._listeners.push(fn);
    return (function(self, f) {
      return function() { self._listeners = self._listeners.filter(function(x) { return x !== f; }); };
    })(this, fn);
  },
  _notify: function() {
    var s = this.getState();
    for (var i = 0; i < this._listeners.length; i++) {
      try { this._listeners[i](s); } catch(_) {}
    }
  },
  _update: function(detail) {
    var prev = Object.assign({}, this._state);
    if (detail.gasReachable !== undefined) this._state.gasUp = detail.gasReachable;
    if (detail.phpReachable !== undefined) this._state.phpUp = detail.phpReachable;
    if (detail.degradedMode !== undefined) this._state.degraded = detail.degradedMode;
    if (detail.isOnline !== undefined) this._state.isOnline = detail.isOnline;
    this._state.lastChange = Date.now();
    if (prev.gasUp !== this._state.gasUp || prev.phpUp !== this._state.phpUp ||
        prev.degraded !== this._state.degraded || prev.isOnline !== this._state.isOnline) {
      this._notify();
    }
  },
  getState: function() { return Object.assign({}, this._state); },
  /** True when at least one backend is reachable */
  isReachable: function() {
    return this._state.isOnline && (this._state.gasUp !== false || this._state.phpUp !== false);
  },
  /** True when all backends are unreachable */
  isOffline: function() {
    return !this._state.isOnline || (this._state.gasUp === false && this._state.phpUp === false);
  }
};

// Wire connectivity events
if (typeof window !== 'undefined') {
  window.addEventListener('erp:connectivity-change', function(ev) {
    if (ev && ev.detail) CONNECTIVITY._update(ev.detail);
  });
  window.addEventListener('erp:php-all-failed', function() {
    CONNECTIVITY._update({ phpReachable: false });
  });
  window.addEventListener('online', function() {
    CONNECTIVITY._update({ isOnline: true, gasReachable: null, phpReachable: null });
  });
  window.addEventListener('offline', function() {
    CONNECTIVITY._update({ isOnline: false, gasReachable: false, phpReachable: false });
  });
}

/* ════════════════════════════════════════════════════════════════════════
 * GLOBAL EXPORTS (v10.3.2-hardened)
 * Config.js defines ALL shared constants at file scope. This block ensures
 * every critical symbol is also accessible via window.* — so that scripts
 * loaded out of order or in error recovery mode still find their deps.
 * ════════════════════════════════════════════════════════════════════════ */
try{
  window.ROLE_APPLICANT=ROLE_APPLICANT;window.ROLE_ADMIN=ROLE_ADMIN;
  window.ROLE_REVIEWER=ROLE_REVIEWER;window.ROLE_RECTOR=ROLE_RECTOR;
  window.ROLE_VICE_RECTOR=ROLE_VICE_RECTOR;window.ROLE_CKK=ROLE_CKK;
  window.ROLE_NIDD=ROLE_NIDD;window.ROLE_ACADEMIC_COUNCIL=ROLE_ACADEMIC_COUNCIL;
  window.ROLE_PROJECT_LEAD=ROLE_PROJECT_LEAD;window.ROLE_TEAM_MEMBER=ROLE_TEAM_MEMBER;
  window.ROLE_FINANCIAL=ROLE_FINANCIAL;window.ROLE_ACCOUNTING=ROLE_ACCOUNTING;
  window.ROLE_LIBRARY=ROLE_LIBRARY;window.ROLE_APPLICANT_REVIEWER=ROLE_APPLICANT_REVIEWER;
  window.ROLE_UNIT_HEAD=ROLE_UNIT_HEAD;
  window.STATUS_LABELS=STATUS_LABELS;window.COMPETITION_STATUS_LABELS=COMPETITION_STATUS_LABELS;
  window.REVIEWER_STATUS_LABELS=REVIEWER_STATUS_LABELS;window.MON_STATUS_LABELS=MON_STATUS_LABELS;
  window.PROJECT_TYPES=PROJECT_TYPES;window.PRIORITY_AREAS=PRIORITY_AREAS;
  window.COMPETITIONS=COMPETITIONS;window.PROFESSIONAL_FIELDS=PROFESSIONAL_FIELDS;
  window.CKK_MEMBERS=CKK_MEMBERS;
  window.GAS_URL=GAS_URL;window.GAS_URL_RAW=GAS_URL_RAW;
  window.MAX_FILE_SIZE_BYTES=MAX_FILE_SIZE_BYTES;window.EUR_BGN=EUR_BGN;
  window.ALLOWED_SIGNIN_DOMAINS=ALLOWED_SIGNIN_DOMAINS;
  window.isAllowedSignInEmail=isAllowedSignInEmail;
  window.isAdminRole=isAdminRole;window.isReviewerRole=isReviewerRole;
  window.ErrorBoundary=ErrorBoundary;
  window.getReviewerFeeForType=getReviewerFeeForType;
  window.getMaxBudgetForType=getMaxBudgetForType;
  window.validateBudgetForType=validateBudgetForType;
  window.CONNECTIVITY=CONNECTIVITY;
}catch(_){/* non-critical export guard */}

