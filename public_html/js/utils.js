/* ─── EVALUATION SCORING RUBRIC (from s3: Критерии за оценка) ─── */
var EVAL_RUBRIC=[
{id:'scientific',label:'Научна стойност и актуалност',maxTotal:30,subcriteria:[
    {id:'originality',label:'Оригиналност на идеята',max:10},
    {id:'relevance',label:'Актуалност на проблема',max:10},
    {id:'theory',label:'Теоретична обоснованост',max:10}
]},
{id:'applicability',label:'Приложимост и иновативност',maxTotal:25,subcriteria:[
    {id:'practical',label:'Практическа приложимост',max:15},
    {id:'innovation',label:'Иновативен потенциал',max:10}
]},
{id:'team',label:'Квалификация на екипа',maxTotal:20,subcriteria:[
    {id:'leader_exp',label:'Научен опит на ръководителя',max:10},
    {id:'publications',label:'Публикационна активност',max:10}
]},
{id:'budget',label:'Реалистичност на бюджета',maxTotal:15,subcriteria:[
    {id:'budget_realistic',label:'Реалистичност и обоснованост на бюджета',max:15}
]},
{id:'results',label:'Очаквани резултати',maxTotal:10,subcriteria:[
    {id:'expected_results',label:'Измерими и значими очаквани резултати',max:10}
]}
];
var EVAL_MAX_SCORE=100;
var getEvaluation=f=>{const e=f.evaluation||f.Evaluation;if(!e)return null;if(typeof e==='string'){try{return JSON.parse(e)}catch(_){return null}}return e};
var getReviewers=f=>{const r=f.reviewers||f.Reviewers;if(!r)return[];if(typeof r==='string'){try{return JSON.parse(r)}catch(_){return[]}}return Array.isArray(r)?r:[]};
var calcRubricTotal=scores=>{if(!scores)return 0;return EVAL_RUBRIC.reduce((t,cat)=>t+cat.subcriteria.reduce((s,sub)=>s+(Number(scores[sub.id])||0),0),0)};
var scoreGrade=total=>total>=80?'high':total>=50?'medium':'low';
var statusLabel=status=>{const key=String(status||'').trim().toLowerCase();if(!key)return'—';try{if(typeof STATUS_LABELS!=='undefined'&&STATUS_LABELS[key])return STATUS_LABELS[key];}catch(_){}return key};
var reviewerStatusLabel=status=>{const key=String(status||'').trim().toLowerCase();if(!key)return'—';try{if(typeof REVIEWER_STATUS_LABELS!=='undefined'&&REVIEWER_STATUS_LABELS[key])return REVIEWER_STATUS_LABELS[key];}catch(_){}return statusLabel(key)};

/* Validate a person's full name. Requires ≥2 word parts, each ≥2 chars,
   composed of Cyrillic or Latin letters (with hyphen / apostrophe).
   Returns { ok:boolean, error?:string, name?:string (normalized) }. */
var validateFullName=raw=>{
  const v=String(raw||'').trim().replace(/\s+/g,' ');
  if(!v)return{ok:false,error:'Името е задължително.'};
  const parts=v.split(' ');
  if(parts.length<2)return{ok:false,error:'Въведете поне две имена (име и фамилия).'};
  const wordRe=/^[A-Za-zА-Яа-яЁёЪъЬьЮюЯяІіЇїЄєҐґ][A-Za-zА-Яа-яЁёЪъЬьЮюЯяІіЇїЄєҐґ\-’']{1,}$/;
  for(const p of parts){if(!wordRe.test(p))return{ok:false,error:'Невалиден символ в името: „'+p+'".'};}
  return{ok:true,name:parts.join(' ')};
};

/* Replace raw lifecycle status codes inside any user-facing string with their
   Bulgarian labels. Catches: bare codes (`admin_passed`), prefix forms
   (`Статус: admin_passed`, `Status: admin_passed`), arrow transitions
   (`submitted → admin_passed`), parenthesised codes (`Промяна (admin_passed)`),
   and competition-namespace codes too. Anything not in either label map is
   left untouched, so prose like "Изпращане в ход…" passes through. */
var _LIFECYCLE_LABEL_LOOKUP=(()=>{const m={};
    if(typeof STATUS_LABELS==='object'&&STATUS_LABELS)Object.keys(STATUS_LABELS).forEach(k=>{m[k.toLowerCase()]=STATUS_LABELS[k]});
    if(typeof COMPETITION_STATUS_LABELS==='object'&&COMPETITION_STATUS_LABELS)Object.keys(COMPETITION_STATUS_LABELS).forEach(k=>{if(!m[k.toLowerCase()])m[k.toLowerCase()]=COMPETITION_STATUS_LABELS[k]});
    return m;
})();
var _LIFECYCLE_CODE_RE=/\b([a-z][a-z0-9_]{2,40})\b/g;
var humanizeAction=raw=>{
    if(raw==null)return'—';
    let s=String(raw).trim();
    if(!s)return'—';
    // Whole-string fast path: bare code → label
    const lower=s.toLowerCase();
    if(_LIFECYCLE_LABEL_LOOKUP[lower])return _LIFECYCLE_LABEL_LOOKUP[lower];
    // Substitute every embedded snake_case / lowercase code that we recognise
    return s.replace(_LIFECYCLE_CODE_RE,(m)=>_LIFECYCLE_LABEL_LOOKUP[m.toLowerCase()]||m);
};

/* ─── LIFECYCLE PHASE LOOKUP (O(1) map — replaces chained if-else) ─── */
var _LIFECYCLE_PHASE_MAP=(function(){
  var _d={icon:'fa-pen',           color:'var(--ink-4)', label:'Чернова',      step:0};
  var _s={icon:'fa-inbox',         color:'var(--info)',  label:'Подадено',     step:1};
  var _r={icon:'fa-undo',          color:'var(--warn)',  label:'Корекция',     step:1};
  var _a={icon:'fa-user-shield',   color:'var(--primary)',label:'Допуснато',   step:2};
  var _n={icon:'fa-ban',           color:'var(--err)',   label:'Недопустимо',  step:2};
  var _v={icon:'fa-users',         color:'var(--review)',label:'Рецензиране',  step:3};
  var _e={icon:'fa-star',          color:'var(--gold)',  label:'Оценено',      step:4};
  var _p={icon:'fa-check-double',  color:'var(--ok)',    label:'Одобрено',     step:5};
  var _c={icon:'fa-file-signature',color:'var(--teal)',  label:'Договор',      step:6};
  var _x={icon:'fa-flask',         color:'var(--ok)',    label:'Изпълнение',   step:7};
  var _t={icon:'fa-chart-bar',     color:'var(--warn)',  label:'Отчитане',     step:7};
  var _z={icon:'fa-check-circle',  color:'var(--ink-4)',label:'Приключен',    step:8};
  var _w={icon:'fa-exclamation-triangle',color:'var(--err)',label:'Санкция',   step:8};
  var _j={icon:'fa-times',         color:'var(--err)',   label:'Отхвърлено',   step:4};
  return {
    draft:_d,completed:_d,
    submitted:_s,admin_review:_s,
    returned:_r,needs_correction:_r,resubmitted:_r,report_returned_for_correction:_r,
    admin_passed:_a,eligible:_a,
    ineligible:_n,
    in_review:_v,reviewer_assignment:_v,reviewers_proposed:_v,reviewer_invited:_v,reviewer_accepted:_v,review_submitted:_v,
    reviewed:_e,scored:_e,above_threshold:_e,below_threshold:_e,ranked:_e,proposed_for_funding:_e,
    approved:_p,approved_for_funding:_p,
    contract_draft:_c,contract_package_ready:_c,contracting:_c,contract_signed:_c,contracted:_c,
    active:_x,in_execution:_x,progress_updated:_x,expense_requested:_x,change_requested:_x,change_under_review:_x,change_approved:_x,change_rejected:_x,
    final_reporting:_t,reporting_due:_t,report_submitted:_t,report_under_review:_t,report_accepted:_t,final_report_prepared:_t,final_review_submitted:_t,final_evaluation:_t,
    closed:_z,successfully_completed:_z,partially_completed:_z,
    closed_with_sanction:_w,closed_with_restriction:_w,unsatisfactory:_w,sanction_3year:_w,
    rejected:_j
  };
})();
var _LIFECYCLE_DEFAULT={icon:'fa-circle',color:'var(--ink-5)',label:'—',step:0};

/**
 * Check if a string looks like a real Google Drive file ID.
 * Real Drive file IDs are long alphanumeric strings (28-44 chars),
 * while docType IDs like 'fnisections35' are short (< 20 chars).
 * This prevents constructing broken Google Docs iframe URLs from
 * logical document type identifiers.
 */
var _isValidDriveFileId = function(id) {
  if (!id || typeof id !== 'string') return false;
  // Real Drive file IDs are 28-44 characters, alphanumeric + underscore/hyphen
  // DocType IDs are typically short (< 20 chars) like 'fnisections35', 'fnipdf', etc.
  if (id.length < 25) return false;
  if (id.length > 120) return false;
  // Real Drive IDs don't contain dots or spaces
  if (/[\s.]/.test(id)) return false;
  // Must look like a hash: alphanumeric + underscore + hyphen
  return /^[a-zA-Z0-9_\-]+$/.test(id);
};
window._isValidDriveFileId = _isValidDriveFileId;
/* ─── LIFECYCLE & FINANCIAL HELPERS ─── */
var getLifecyclePhase=status=>{const s=String(status||'').toLowerCase();return _LIFECYCLE_PHASE_MAP[s]||_LIFECYCLE_DEFAULT;};

/* ─── BPMN PHASE TRACKER ───
 * Maps any lifecycle status to its BPMN process phase (1–11).
 * Used by list views to render a mini progress bar showing how far
 * a proposal/project has advanced through the regulatory pipeline.
 * Phases: 1=Конфигуриране 2=Прием 3=Адм.проверка 4=Корекции
 *          5=Рецензиране 6=Оценка 7=Одобрение 8=Договаряне
 *          9=Изпълнение 10=Отчитане 11=Приключване */
var BPMN_PHASE_MAP={draft:2,completed:2,submitted:2,admin_review:3,admin_passed:3,needs_correction:4,returned:4,resubmitted:3,eligible:3,ineligible:3,reviewers_proposed:5,reviewer_assignment:5,reviewer_invited:5,reviewer_accepted:5,in_review:5,review_submitted:5,reviewed:6,scored:6,above_threshold:6,below_threshold:6,ranked:6,proposed_for_funding:7,approved_for_funding:7,approved:7,contract_draft:8,contract_package_ready:8,contracting:8,contract_signed:8,contracted:8,active:9,in_execution:9,progress_updated:9,expense_requested:9,change_requested:9,change_under_review:9,change_approved:9,change_rejected:9,reporting_due:10,report_submitted:10,report_under_review:10,report_accepted:10,report_returned_for_correction:10,final_report_prepared:10,final_review_submitted:10,final_evaluation:10,successfully_completed:11,partially_completed:11,unsatisfactory:11,closed:11,closed_with_sanction:11,closed_with_restriction:11,sanction_3year:11,rejected:6,archived:11};
var BPMN_TOTAL_PHASES=11;
var getBPMNPhase=status=>{const s=String(status||'').toLowerCase();const step=BPMN_PHASE_MAP[s]||0;const ph=getLifecyclePhase(status);return{...ph,step:step||ph.step,totalPhases:BPMN_TOTAL_PHASES,pct:step?Math.round(step/BPMN_TOTAL_PHASES*100):0}};

/* ─── THRESHOLD CHECK (Правилник чл.19) ───
 * Pass = score ≥ 50% of max + 1 point. */
var isPassingThreshold=(score,maxScore)=>{const ms=maxScore||EVAL_MAX_SCORE;return(Number(score)||0)>=Math.floor(ms*0.5)+1};
var getThresholdMinimum=(maxScore)=>{const ms=maxScore||EVAL_MAX_SCORE;return Math.floor(ms*0.5)+1};

/* ─── REVIEW DEADLINE CALCULATOR ───
 * Reviews must be submitted within 10 days of CONSENT (BPMN 20→22, Правилник чл.17).
 * Accepts either a primitive consent/assigned date OR an assignment object that
 * carries `consentDate` + `assigned` — automatically prefers consentDate (the
 * regulation explicitly says the 10-day clock starts on consent, not assignment).
 * Returns { daysLeft, isOverdue, deadline, label, basedOn:'consent'|'assigned'|null }. */
var REVIEW_DEADLINE_DAYS=10;
var getReviewDeadline=(input,deadlineDays)=>{
    const dd=deadlineDays||REVIEW_DEADLINE_DAYS;
    let baseDate=null,basedOn=null;
    if(input&&typeof input==='object'){
        if(input.consentDate){baseDate=input.consentDate;basedOn='consent';}
        else if(input.assigned){baseDate=input.assigned;basedOn='assigned';}
    }else if(typeof input==='string'&&input){baseDate=input;basedOn='assigned';}
    if(!baseDate)return{daysLeft:null,isOverdue:false,deadline:null,label:'—',basedOn:null};
    try{
        const ad=new Date(baseDate);
        if(isNaN(ad.getTime()))return{daysLeft:null,isOverdue:false,deadline:null,label:'—',basedOn:null};
        const dl=new Date(ad);dl.setDate(dl.getDate()+dd);
        const msLeft=dl.getTime()-Date.now();
        const daysLeft=Math.ceil(msLeft/(1000*60*60*24));
        return{daysLeft,isOverdue:daysLeft<0,deadline:dl.toISOString(),basedOn,
            label:daysLeft<0?'Просрочен с '+Math.abs(daysLeft)+' д.':daysLeft===0?'Последен ден!':daysLeft+' дни'};
    }catch(_){return{daysLeft:null,isOverdue:false,deadline:null,label:'—',basedOn:null};}
};

/* ─── BPMN STAGE HELPER (reviewer perspective) ───
 * Maps reviewer assignment status to a friendly stage label and BPMN step
 * number per Process 4 (steps 17-23). Used by the reviewer UI to show a
 * tiny "Стъпка X/23" indicator and to drive the stage timeline component.
 * status flow: pending → consented → reviewed (or pending → declined). */
var BPMN_REVIEWER_STAGES=[
    {key:'invited',  step:19, label:'Поканен',     icon:'fa-envelope',         color:'var(--info)'},
    {key:'consented',step:20, label:'Приета покана',icon:'fa-handshake',       color:'var(--accent)'},
    {key:'in_review',step:22, label:'В процес',    icon:'fa-pen-to-square',    color:'var(--gold)'},
    {key:'submitted',step:23, label:'Подадена',    icon:'fa-check-double',     color:'var(--ok)'},
    {key:'declined', step:21, label:'Отказана',    icon:'fa-ban',              color:'var(--err)'},
    {key:'replaced', step:21, label:'Заменена',    icon:'fa-rotate',           color:'var(--ink-5)'}
];
var getReviewerStage=(assignment)=>{
    const st=String(assignment?.reviewStatus||assignment?.status||'').toLowerCase();
    if(st==='reviewed'||st==='submitted')return BPMN_REVIEWER_STAGES[3];
    if(st==='declined')return BPMN_REVIEWER_STAGES[4];
    if(st==='replaced')return BPMN_REVIEWER_STAGES[5];
    if(st==='consented'){
        // If they've started filling but not submitted, label as "in review"
        const hasDraft=assignment?.review&&String(assignment.review).length>2;
        return hasDraft?BPMN_REVIEWER_STAGES[2]:BPMN_REVIEWER_STAGES[1];
    }
    return BPMN_REVIEWER_STAGES[0];
};

/* ─── EXPENSE ELIGIBILITY HELPER ───
 * Checks whether an expense request falls within allowed cost groups
 * and budget limits for the project. */
var ALLOWED_EXPENSE_GROUPS=['salaries','external_services','assets','consumables','literature','travel','publications','reviews','other'];
var isExpenseGroupAllowed=group=>ALLOWED_EXPENSE_GROUPS.indexOf(String(group||'').toLowerCase())!==-1;
var checkExpenseBudget=(requestedAmount,spentInGroup,plannedInGroup)=>{const amt=Number(requestedAmount)||0;const spent=Number(spentInGroup)||0;const planned=Number(plannedInGroup)||0;if(planned<=0)return{ok:false,error:'Няма планиран бюджет за тази разходна група.'};if(spent+amt>planned)return{ok:false,error:'Няма достатъчно бюджет. Планирани: '+(toEur?eur(planned):planned.toFixed(2)+' €')+', усвоени: '+(toEur?eur(spent):spent.toFixed(2)+' €')+'.'};return{ok:true}};

/* ─── EURO CURRENCY HELPERS (BGN → EUR at Bulgaria's fixed ECB rate) ─── */
var EUR_BGN = 1.95583; // Fixed peg since BNB joined ERM-II
var toEur = (bgn) => (Number(bgn) || 0) / EUR_BGN;
var toBgn = (eurAmt) => (Number(eurAmt) || 0) * EUR_BGN;
var eur = (n) => toEur(n).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/* ─── NATURAL SORT (Document_1, Document_2, Document_10 — not 1,10,2) ───
 * Splits each string into digit / non-digit chunks; numeric chunks are
 * compared as numbers, non-numeric as locale-aware strings. Used by the
 * Documents view + Document Picker so file lists feel like a real file
 * manager, not a dumb lexical sort. */
var naturalCmp = (a, b) => {
    const sa = String(a == null ? '' : a);
    const sb = String(b == null ? '' : b);
    const re = /(\d+)|(\D+)/g;
    const ax = sa.toLowerCase().match(re) || [];
    const bx = sb.toLowerCase().match(re) || [];
    const len = Math.min(ax.length, bx.length);
    for (let i = 0; i < len; i++) {
        const A = ax[i], B = bx[i];
        const nA = /^\d+$/.test(A), nB = /^\d+$/.test(B);
        if (nA && nB) { const d = parseInt(A,10) - parseInt(B,10); if (d) return d; }
        else { const d = A.localeCompare(B, 'bg'); if (d) return d; }
    }
    return ax.length - bx.length;
};

/* ─── BYTES → HUMAN READABLE (for Drive metadata in document list view) ─── */
var fmtBytes = (n) => {
    const v = Number(n) || 0;
    if (!v) return '—';
    const u = ['B','KB','MB','GB','TB'];
    let i = 0, x = v;
    while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
    return (i === 0 ? x.toFixed(0) : x.toFixed(x < 10 ? 2 : 1)) + ' ' + u[i];
};

/* ─── LAST ACTIVITY DATE ────────────────────────────────────────────────
 * Walks the form's history array (newest-first after reverse) and returns
 * the most recent ISO timestamp. Falls back to submitted → created → null.
 * Used by all "Дата" columns so they reflect actual last edit, not just
 * the original submission time. */
var getLastActivityDate = (form) => {
    if (!form) return null;
    try {
        var h = Array.isArray(form.history) ? form.history : (Array.isArray(form.History) ? form.History : []);
        if (h.length) {
            // history is stored oldest-first in Sheets; the most recent entry wins
            var last = h[h.length - 1];
            if (last && last.date) return last.date;
            if (last && last.ts) return last.ts;
            // walk backwards for the first entry with a date
            for (var i = h.length - 1; i >= 0; i--) {
                if (h[i] && h[i].date) return h[i].date;
                if (h[i] && h[i].ts) return h[i].ts;
            }
        }
    } catch (_) {}
    return form.submitted || form.Submitted || form.created || form.Created || null;
};


// File upload limits — MAX_FILE_SIZE_BYTES is defined in config.js (10 MB).
// Personal library uploads allow up to 20 MB.
var MAX_MYDOCS_FILE_SIZE_BYTES = 20 * 1024 * 1024;

var readFileAsBase64=file=>new Promise((resolve,reject)=>{
if(file.size>MAX_FILE_SIZE_BYTES){reject(new Error(`Файлът "${file.name}" е твърде голям.`));return}
const reader=new FileReader();
reader.onload=ev=>resolve({name:file.name,size:(file.size/1024).toFixed(1)+' KB',type:file.type,data:ev.target.result});
reader.onerror=()=>reject(new Error('Грешка при четене на „'+file.name+'"'));
reader.readAsDataURL(file);
});

/* ─── LARGE FILE READER (MyDocuments — up to 50 MB) ────────────────────
 * Like readFileAsBase64 but uses a 50 MB limit instead of the global 10 MB cap.
 * Used exclusively by the MyDocuments upload path. */
var MAX_MYDOCS_FRONTEND_BYTES = 50 * 1024 * 1024; // 50 MB frontend limit
var readFileAsBase64Large = file => new Promise((resolve, reject) => {
  if (file.size > MAX_MYDOCS_FRONTEND_BYTES) {
    reject(new Error('Файлът „' + file.name + '" надвишава 50 MB лимит (' + (file.size/1024/1024).toFixed(1) + ' MB).'));
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => resolve({
    name: file.name,
    size: file.size >= 1024*1024
      ? (file.size / 1024 / 1024).toFixed(2) + ' MB'
      : (file.size / 1024).toFixed(1) + ' KB',
    type: file.type || 'application/octet-stream',
    data: ev.target.result
  });
  reader.onerror = () => reject(new Error('Грешка при четене на „' + file.name + '"'));
  reader.readAsDataURL(file);
});

/* ─── CHUNKED LARGE FILE UPLOAD (MyDocuments >18 MB) ───────────────────
 * Splits a file into 6 MB raw chunks, uploads each chunk to the GAS
 * uploadMyDocumentChunk endpoint, which reassembles them on the last chunk.
 * onProgress(pct:0-100, chunkDone:number, totalChunks:number) */
var _MYDOCS_CHUNK_SIZE = 6 * 1024 * 1024; // 6 MB per chunk
var uploadFileChunked = async (file, onProgress, formId) => {
  const totalChunks = Math.ceil(file.size / _MYDOCS_CHUNK_SIZE);
  const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  let lastRes = null;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * _MYDOCS_CHUNK_SIZE;
    const end = Math.min(start + _MYDOCS_CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);
    const chunkData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target.result.split(',')[1]); // raw base64 only
      reader.onerror = () => reject(new Error('Грешка при четене на чанк ' + i));
      reader.readAsDataURL(chunk);
    });
    const payload = {
      uploadId,
      chunkIndex: i,
      totalChunks,
      chunkData,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream'
    };
    // v12.49.x-uploadfix: carry the authenticated user so GAS uploadMyDocumentChunk
    // resolves auth.userId (Drive folder + ownership). Without it the chunk
    // upload fails with "Необходима е автентикация".
    const _cuE = String(typeof _currentUserEmail !== 'undefined' ? _currentUserEmail : (typeof currentUser !== 'undefined' && currentUser && currentUser.email ? currentUser.email : '') || '').toLowerCase();
    if (_cuE) { payload.userId = _cuE; payload.email = _cuE; }
    if (formId) payload.formId = formId;
    const res = await api('uploadMyDocumentChunk', payload);
    if (!res || !res.success) {
      throw new Error((res && res.error) || 'Грешка при качване на чанк ' + (i + 1) + '/' + totalChunks);
    }
    if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 100), i + 1, totalChunks);
    lastRes = res;
    if (res.complete) return res;
  }
  return lastRes || { success: false, error: 'Непълно качване' };
};

/* ─── TOAST — v7.0.2 hardened notification system ───────────────────────
 * Guarantees:
 *   • Always pinned bottom-right via CSS position:fixed (z-index 15000 — above
 *     ALL modals, drawers, action menus). Never hidden by overlays.
 *   • Survives missing/destroyed containers (auto-recreates on call).
 *   • Pauses auto-dismiss while document.hidden — message persists until the
 *     user returns to the tab (no more ghost notifications they never saw).
 *   • Pauses on hover; resumes with a short tail when pointer leaves.
 *   • Non-blocking insertion via requestAnimationFrame so heavy click handlers
 *     don't visibly stall the toast appearing.
 *   • Continuity helper toast.afterClose() — queues a toast to land the moment
 *     the next modal closes (or 220ms max), so success feedback feels like a
 *     direct continuation of the user's action.
 *   • Dedup window 2s; queue cap 4; assertive routing (errors → role=alert).
 * Public API:
 *   toast(msg, type='info', ms=3500, opts?)
 *   toast.afterClose(msg, type, ms, opts?)   // wait for next modal close
 *   toast.dismissAll()
 * ─────────────────────────────────────────────────────────────────────── */
var _toastQueue=[];
var _TOAST_MAX=4;
var _toastDedup=new Map();
var _TOAST_ENTER_MS=280;
var _TOAST_EXIT_MS=220;

function _ensureToastContainer(assertive){
    var id=assertive?'toast-container-alerts':'toast-container';
    var c=document.getElementById(id);
    if(c)return c;
    // Container was removed (defensive). Recreate so notifications never silently fail.
    if(!document.body)return null;
    c=document.createElement('div');
    c.id=id;
    if(assertive){c.setAttribute('aria-live','assertive');c.setAttribute('role','alert');}
    else{c.setAttribute('aria-live','polite');c.setAttribute('role','status');}
    c.setAttribute('aria-atomic','false');
    document.body.appendChild(c);
    return c;
}

function _setActiveFlag(container,active){
    if(!container)return;
    if(active){container.setAttribute('data-active','1');}
    else{container.removeAttribute('data-active');}
}

// ── Client-side notification capture (Известия / „Моят акаунт") ──────────
// Persists user-facing toasts to a small localStorage ring buffer so the
// „Известия" panel can replay system events (validation blocks, warnings,
// confirmations) that the user may have dismissed or missed. Transient
// `info` toasts (loaders, progress) are intentionally skipped.
var _CLIENT_NOTIF_KEY='__erp_client_notif';
var readClientNotifications=()=>{
    try{
        const raw=localStorage.getItem(_CLIENT_NOTIF_KEY);
        const arr=raw?JSON.parse(raw):[];
        return Array.isArray(arr)?arr:[];
    }catch(_){return[];}
};
var _recordClientNotif=(type,msg)=>{
    try{
        if(type==='info')return;
        const arr=readClientNotifications();
        const text=String(msg);
        const last=arr[0];
        if(last&&last.text===text&&(Date.now()-(last.ts||0))<4000)return;
        arr.unshift({id:'c:'+Date.now()+':'+Math.random().toString(36).slice(2,7),type:type,text:text,ts:Date.now(),timestamp:new Date().toISOString()});
        const trimmed=arr.length>50?arr.slice(0,50):arr;
        localStorage.setItem(_CLIENT_NOTIF_KEY,JSON.stringify(trimmed));
        try{window.dispatchEvent(new CustomEvent('erp:notif'));}catch(_){}
    }catch(_){}
};
var clearClientNotifications=()=>{
    try{localStorage.removeItem(_CLIENT_NOTIF_KEY);window.dispatchEvent(new CustomEvent('erp:notif'));}catch(_){}
};
try{window.readClientNotifications=readClientNotifications;window.clearClientNotifications=clearClientNotifications;}catch(_){}

var toast=(msg,type='info',ms=3500,opts=null)=>{
    if(msg==null)return;
    const normalizedType=type==='warning'?'warn':(type==='\u0443\u0441\u043f\u0435\u0445'?'success':type);    const isAssertive=(normalizedType==='error'||normalizedType==='warn');
    const container=_ensureToastContainer(isAssertive)||_ensureToastContainer(false);
    if(!container)return;

    // Dedup: identical (type+msg) within 2s ignored, unless action button present.
    const dedupKey=normalizedType+'::'+msg;
    const now=Date.now();
    const hasAction=opts&&typeof opts.action==='function'&&opts.actionLabel;
    if(!hasAction){
        if(_toastDedup.has(dedupKey)&&(now-_toastDedup.get(dedupKey))<2000)return;
        _toastDedup.set(dedupKey,now);
        if(_toastDedup.size>20){
            const keys=[..._toastDedup.keys()];
            for(let i=0;i<keys.length-10;i++)_toastDedup.delete(keys[i]);
        }
    }

    // Queue cap — drop oldest if exceeded.
    while(_toastQueue.length>=_TOAST_MAX){
        const oldest=_toastQueue.shift();
        try{oldest.remove();}catch(_){}
    }

    // Capture into the notification centre ring buffer (Известия).
    try{_recordClientNotif(normalizedType,msg);}catch(_){}

    // Build element.
    const el=document.createElement('div');
    el.className=`toast ${normalizedType}`;
    const icons={success:'fa-check-circle',error:'fa-exclamation-circle',info:'fa-info-circle',warn:'fa-exclamation-triangle'};
    const ico=document.createElement('i');
    ico.className=`fas ${icons[normalizedType]||icons.info}`;
    const spn=document.createElement('span');
    spn.textContent=msg;
    el.appendChild(ico);
    el.appendChild(spn);

    // ── Visibility-aware dismiss timer ──
    // remainingMs counts down ONLY while the page is visible AND not hovered.
    // When document.hidden flips on, we pause; on visibilitychange→visible we resume.
    let remainingMs=ms;
    let timerStartTs=0;
    let dismissTimer=null;
    let dismissed=false;
    const isPaused=()=>document.hidden||el.matches(':hover');

    const stopTimer=()=>{
        if(dismissTimer){
            clearTimeout(dismissTimer);
            dismissTimer=null;
            if(timerStartTs){
                remainingMs=Math.max(0,remainingMs-(Date.now()-timerStartTs));
                timerStartTs=0;
            }
        }
    };
    const startTimer=(ms2)=>{
        if(dismissed||isPaused())return;
        if(typeof ms2==='number')remainingMs=ms2;
        if(remainingMs<=0){dismiss();return;}
        timerStartTs=Date.now();
        dismissTimer=setTimeout(dismiss,remainingMs);
    };
    const dismiss=()=>{
        if(dismissed)return;
        dismissed=true;
        stopTimer();
        document.removeEventListener('visibilitychange',onVisibility);
        el.classList.add('toast-leaving','dismissing');
        const idx=_toastQueue.indexOf(el);
        if(idx!==-1)_toastQueue.splice(idx,1);
        setTimeout(()=>{
            try{el.remove();}catch(_){}
            if(_toastQueue.length===0){_setActiveFlag(container,false);}
        },_TOAST_EXIT_MS);
    };
    const onVisibility=()=>{
        if(document.hidden){stopTimer();}
        else if(!dismissed){startTimer();}
    };
    document.addEventListener('visibilitychange',onVisibility);

    // Action button (optional).
    if(hasAction){
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='toast-action';
        btn.textContent=opts.actionLabel;
        btn.addEventListener('click',ev=>{
            ev.stopPropagation();
            try{opts.action();}catch(_){}
            dismiss();
        });
        el.appendChild(btn);
        ms=Math.max(ms,5000);
        remainingMs=ms;
    }

    // QoL: click toast (outside action btn) dismisses; hover pauses, leave resumes.
    el.addEventListener('click',ev=>{
        if(ev.target&&ev.target.closest('.toast-action'))return;
        dismiss();
    });
    el.addEventListener('mouseenter',stopTimer);
    el.addEventListener('mouseleave',()=>{startTimer(Math.min(remainingMs||ms,2000));});
    el.style.cursor='pointer';
    el.title='\u041a\u043b\u0438\u043a\u043d\u0438 \u0437\u0430 \u0437\u0430\u0442\u0432\u0430\u0440\u044f\u043d\u0435';

    // ── Non-blocking insertion ──
    // Defer DOM append by one rAF so the call site (often inside a heavy
    // form submit handler) doesn't pay the layout/paint cost synchronously.
    // The toast still feels instant (≤16ms) but never causes a perceptible hang.
    const insert=()=>{
        if(dismissed)return;
        container.appendChild(el);
        _toastQueue.push(el);
        _setActiveFlag(container,true);
        // Start timer only if visible. If hidden, onVisibility will arm it.
        if(!document.hidden)startTimer();
    };
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(insert);
    else insert();

    return {dismiss};
};

/** toast.afterClose — queue a toast to fire AFTER the next modal close
 *  (listens for `erp-modal-closed` event, fallback timer 220ms).
 *  Use for "save → close modal → success toast" flows where the toast
 *  should feel like a continuation of the action, not a competing pop-up. */
toast.afterClose=function(msg,type,ms,opts){
    var fired=false;
    var fire=function(){
        if(fired)return;
        fired=true;
        window.removeEventListener('erp-modal-closed',fire);
        toast(msg,type,ms,opts);
    };
    window.addEventListener('erp-modal-closed',fire,{once:true});
    setTimeout(fire,260);
};

/** toast.dismissAll — clear every visible toast immediately. */
toast.dismissAll=function(){
    while(_toastQueue.length){
        var el=_toastQueue.shift();
        try{el.classList.add('toast-leaving','dismissing');}catch(_){}
        setTimeout(((n)=>()=>{try{n.remove();}catch(_){}})(el),_TOAST_EXIT_MS);
    }
    var c1=document.getElementById('toast-container');var c2=document.getElementById('toast-container-alerts');
    _setActiveFlag(c1,false);_setActiveFlag(c2,false);
};

// Expose globally so non-module callers (e.g. library-deposits.js fallback) find it.
try{window.toast=toast;}catch(_){}
try{window.mutateOptimistic=mutateOptimistic;}catch(_){}
// v12.18.0: Expose pagination and metrics helpers so data-layer.js IIFE and any
// inline code that accesses window.loadMoreForms / window.loadMoreCompetitions can find them.
try{window.loadMoreForms=loadMoreForms;}catch(_){}
try{window.loadMoreCompetitions=loadMoreCompetitions;}catch(_){}
try{window.getMetricsDashboard=getMetricsDashboard;}catch(_){}
try{window.batchApi=batchApi;}catch(_){}
try{window.prioritizeRequest=prioritizeRequest;}catch(_){}

/* ─── Public results shareable URL ───────────────────────────────────── */
var _publicResultsUrl = (function(){
  try {
    var o = (typeof window!=='undefined' && window.__ERP_SITE_URL) || '';
    if (!o && typeof location!=='undefined') o = (location.origin || (location.protocol+'//'+location.host)) + '/';
    return o.replace(/\/+$/,'') + '/#/public-results';
  } catch (_) { return '/#/public-results'; }
})();
var getPublicResultsUrl = function(){
  return _publicResultsUrl;
};
/** Copy the public-results page URL to clipboard and show a brief toast. */
var copyPublicResultsLink = function(){
  var url = getPublicResultsUrl();
  if (typeof navigator!=='undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function(){
      toast('Линкът е копиран. Споделете го с външни посетители.','success',3000);
    }).catch(function(){
      promptCopyFallback(url);
    });
  } else {
    promptCopyFallback(url);
  }
};
var promptCopyFallback = function(url){
  // Fallback for HTTP or older browsers: show a prompt with the URL pre-selected.
  try {
    var ta = document.createElement('textarea');
    ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('Линкът е копиран.','success',2500);
  } catch (_) {
    toast('Линк: ' + url, 'info', 8000);
  }
};

/* ─── ADMIN SESSION (module-level credential cache with session token) ─── */
var _adminCreds = null;
var _sessionToken = null;
var _currentUserEmail = null;
var _currentUserIsAdmin = false;
var _currentUserRole = ROLE_APPLICANT;
var _SESSION_KEY = 'erp:session';
var _ACTIVITY_KEY = 'erp:lastActivity';
var _SESSION_TTL = (33 * 60 + 39) * 1000; // 33 minutes 39 seconds hard session timeout

/* ─── Iframe-safe session persistence ───────────────────────────────────────
 * Inside a third-party iframe (the app is embedded in scienceandresearch.ue-
 * varna.bg), modern browsers may partition or block first-party storage:
 *   • Safari ITP can ephemeralise localStorage in cross-site iframes.
 *   • Chrome's third-party storage partitioning (rolling out 2024-2026) gives
 *     each top-frame its own storage bucket; data PERSISTS across reloads of
 *     the same parent page, but a different parent (or none) sees a fresh
 *     bucket — which is fine for our embed use case.
 *   • Some privacy modes block localStorage entirely → setItem throws.
 *
 * To survive a refresh inside the iframe regardless of which engine is in
 * play, every session write is mirrored across THREE redundant stores and
 * read back from whichever returns a value first:
 *   1. localStorage  — primary; fastest, persistent across tabs.
 *   2. sessionStorage — survives a refresh in the same iframe instance even
 *      when localStorage is wiped/blocked.
 *   3. Partitioned cookie (CHIPS) — survives reload AND a fresh iframe load
 *      when the parent page is the same; uses SameSite=None;Secure;Partitioned
 *      so it's accepted in cross-site iframes on browsers that enforce CHIPS.
 *   4. window.name — last-resort in-tab fallback for the rare case where
 *      cookies and both storages are denied (e.g. strict private modes).
 * Any one of these surviving is enough to restore the session. _touchActivity
 * mirrors the same way so the TTL clock can't be sidestepped by reading from
 * a stale fallback. */
var _SESSION_COOKIE = 'erp_session';
var _ACTIVITY_COOKIE = 'erp_lastact';
var _IS_HTTPS = (typeof location!=='undefined' && location.protocol==='https:');
function _cookieAttrs_(maxAgeS){
  // Partitioned attribute is silently ignored by browsers that don't support
  // it yet (Firefox older than 128); SameSite=None;Secure remains valid for
  // cross-site iframe writes everywhere else.
  var base = 'Path=/;Max-Age=' + maxAgeS + ';SameSite=None';
  if (_IS_HTTPS) base += ';Secure;Partitioned';
  return base;
}
function _setCookie_(name, value){
  try {
    if (typeof document === 'undefined') return;
    document.cookie = name + '=' + encodeURIComponent(value) + ';' + _cookieAttrs_(Math.floor(_SESSION_TTL/1000));
  } catch(_) {}
}
function _getCookie_(name){
  try {
    if (typeof document === 'undefined' || !document.cookie) return '';
    var parts = document.cookie.split(';');
    for (var i=0;i<parts.length;i++){
      var p = parts[i].trim();
      if (p.indexOf(name+'=') === 0) return decodeURIComponent(p.slice(name.length+1));
    }
  } catch(_) {}
  return '';
}
function _delCookie_(name){
  try {
    if (typeof document === 'undefined') return;
    document.cookie = name + '=;Path=/;Max-Age=0;SameSite=None' + (_IS_HTTPS ? ';Secure;Partitioned' : '');
  } catch(_) {}
}
function _winNameSlot_(){
  try {
    var w = window.name || '';
    if (w.indexOf('{') !== 0) return null;
    return JSON.parse(w);
  } catch(_) { return null; }
}
function _winNameWrite_(slot){
  try { window.name = JSON.stringify(slot || {}); } catch(_) {}
}

function _persistSession_(blob){
  var serialised = JSON.stringify(blob);
  try { localStorage.setItem(_SESSION_KEY, serialised); } catch(_) {}
  try { sessionStorage.setItem(_SESSION_KEY, serialised); } catch(_) {}
  _setCookie_(_SESSION_COOKIE, serialised);
  var slot = _winNameSlot_() || {};
  slot[_SESSION_KEY] = blob;
  _winNameWrite_(slot);
}
function _readSession_(){
  // Try every store; return the first non-empty parseable blob.
  var sources = [
    function(){ try { return localStorage.getItem(_SESSION_KEY); } catch(_) { return null; } },
    function(){ try { return sessionStorage.getItem(_SESSION_KEY); } catch(_) { return null; } },
    function(){ return _getCookie_(_SESSION_COOKIE); },
    function(){ var s = _winNameSlot_(); return s && s[_SESSION_KEY] ? JSON.stringify(s[_SESSION_KEY]) : null; }
  ];
  for (var i=0;i<sources.length;i++){
    var raw = sources[i]();
    if (!raw) continue;
    try {
      var parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') {
        // Re-mirror to slower stores so subsequent reads are fast / consistent.
        if (i > 0) _persistSession_(parsed);
        return parsed;
      }
    } catch(_) {}
  }
  return null;
}
function _wipeSession_(){
  try { localStorage.removeItem(_SESSION_KEY); } catch(_) {}
  try { localStorage.removeItem(_ACTIVITY_KEY); } catch(_) {}
  try { sessionStorage.removeItem(_SESSION_KEY); } catch(_) {}
  try { sessionStorage.removeItem(_ACTIVITY_KEY); } catch(_) {}
  _delCookie_(_SESSION_COOKIE);
  _delCookie_(_ACTIVITY_COOKIE);
  var slot = _winNameSlot_();
  if (slot) { delete slot[_SESSION_KEY]; delete slot[_ACTIVITY_KEY]; _winNameWrite_(slot); }
}

var _touchActivity = () => {
  var nowStr = String(Date.now());
  try { localStorage.setItem(_ACTIVITY_KEY, nowStr); } catch(_) {}
  try { sessionStorage.setItem(_ACTIVITY_KEY, nowStr); } catch(_) {}
  _setCookie_(_ACTIVITY_COOKIE, nowStr);
  var slot = _winNameSlot_() || {};
  slot[_ACTIVITY_KEY] = nowStr;
  _winNameWrite_(slot);
};
function _readActivity_(){
  var sources = [
    function(){ try { return localStorage.getItem(_ACTIVITY_KEY); } catch(_) { return null; } },
    function(){ try { return sessionStorage.getItem(_ACTIVITY_KEY); } catch(_) { return null; } },
    function(){ return _getCookie_(_ACTIVITY_COOKIE); },
    function(){ var s = _winNameSlot_(); return s && s[_ACTIVITY_KEY] ? s[_ACTIVITY_KEY] : null; }
  ];
  for (var i=0;i<sources.length;i++){
    var v = Number(sources[i]() || 0);
    if (v) return v;
  }
  return 0;
}

// Best-effort: ask the browser for first-party storage access when we're
// embedded in a cross-site iframe AND the user has interacted at least once.
// Without this call, Safari may partition our localStorage even with a user
// gesture; calling it is harmless on browsers that don't implement the API.
(function _requestStorageAccessOnce_(){
  try {
    if (typeof document === 'undefined' || typeof document.hasStorageAccess !== 'function') return;
    if (window.self === window.top) return; // not framed; nothing to request
    var ask = function(){
      try {
        document.hasStorageAccess().then(function(has){
          if (!has && typeof document.requestStorageAccess === 'function') {
            document.requestStorageAccess().catch(function(){ /* user denial is fine; fallbacks cover it */ });
          }
        }).catch(function(){});
      } catch(_) {}
      window.removeEventListener('click', ask, true);
      window.removeEventListener('keydown', ask, true);
    };
    window.addEventListener('click', ask, true);
    window.addEventListener('keydown', ask, true);
  } catch(_) {}
})();

var saveAdminSession = (creds) => {
  _adminCreds = creds;
  _sessionToken = (typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36);
  _persistSession_({type:'admin', username: creds?.username, ts: Date.now()});
  _touchActivity();
};
var saveGoogleSession = (user, isAdmin, role) => {
  _persistSession_({type:'google', name: user.name, email: user.email, picture: user.picture||null, isAdmin: !!isAdmin, role: role||ROLE_APPLICANT, ts: Date.now()});
  _touchActivity();
};
var clearSession = () => {
  _adminCreds = null;
  _sessionToken = null;
  _currentUserEmail = null;
  _currentUserIsAdmin = false;
  _currentUserRole = ROLE_APPLICANT;
  _wipeSession_();
};
// Legacy alias
var clearAdminSession = clearSession;

var READ_ACTIONS={
getforms:true,getcompetitions:true,getpubliccompetitions:true,getapplicationsbycompetition:true,
listdocuments:true,getreviewers:true,getreviewerforms:true,getdatachangestream:true,getsystemhealth:true,
getcalendarevents:true,getcompetitionsummary:true,
getcompetitionsfeed:true,getcontestboard:true,
getinitialdata:true,getprojects:true,getproject:true,getreports:true,getreport:true,
getchangerequests:true,checksanctions:true,checkeligibility:true,
getreviewdeadlines:true,
// v6.9.0 — Notification preferences
getnotificationsettings:true,getuserpreferences:true,getsystemnotificationsettings:true,
// Templates registry — cached per session (templates rarely change mid-session)
getrequiredapplicationtemplates:true,
// My Documents — applicant personal folder (short TTL, busted on upload/delete/copy)
listmydocuments:true,
// v12.17.3: Pre-generated template check (read MySQL mirror, fallback to GAS for creation)
ensureuserpregenerateddocs:true,
// v12.20.0: Type template copy — handled by PHP API (GAS doesn't have this action)
copytypetemplatesforform:true,
// v12.27.0: Proposal Wizard read actions (PHP SQL layer)
sqlgetproposal:true,
sqlgetproposaldocuments:true,
sqlgetdocumentpreview:true,
sqlgetbudgetrules:true,
// v15.0.0-perf: Dedicated applicant forms endpoint
getmyforms:true,
// v16.0.0-appconfig: Full app config from SQL layer
getappconfig:true,
sqlgetappconfig:true,
// v17.0.0-doclib-applicants: Template library + applicant views
sqltemplatelibrary:true, gettemplatelibrary:true,
sqladddocumenttemplate:true, adddocumenttemplate:true,
sqlupdatedocumenttemplate:true, updatedocumenttemplate:true,
sqldeletedocumenttemplate:true, deletedocumenttemplate:true,
sqlsynctemplatefromgas:true, synctemplatefromgas:true,
sqlgetapplicationsbyuser:true, getapplicationsbyuser:true,
sqlgetapplicantsummary:true, getapplicantsummary:true,
sqlgetapplicantslist:true, getapplicantslist:true
};
var inflightReadRequests=new Map();
var readResponseCache=new Map();
var READ_CACHE_TTL_MS={
getforms:180000,getcompetitions:180000,getpubliccompetitions:240000,getcompetitionsfeed:180000,
getcontestboard:180000,getapplicationsbycompetition:180000,listdocuments:600000,getreviewers:180000,getreviewerforms:180000,
getdatachangestream:30000,getsystemhealth:120000,getcalendarevents:180000,getcompetitionsummary:180000,
getinitialdata:180000,
getprojects:180000,getproject:120000,getreports:180000,getreport:90000,
getchangerequests:180000,checksanctions:300000,checkeligibility:300000,
getreviewdeadlines:90000,
getrequiredapplicationtemplates:900000,
// My Documents: 120 s — extended from 60s, still busted on upload/delete/copy
listmydocuments:120000,
// v12.17.3: pregen doc check — 10 min, busted when docs change
ensureuserpregenerateddocs:600000,
// v12.27.0: Proposal Wizard read actions
sqlgetproposal:180000,        // 3 min — proposal data changes on save
sqlgetproposaldocuments:180000, // 3 min — document list changes on gen/upload
sqlgetdocumentpreview:120000,  // 2 min — preview URL stable
sqlgetbudgetrules:300000,       // 5 min — budget rules are stable
// v16.0.0-appconfig: Very stable, config changes only on deploy
getappconfig:1800000,           // 30 min — app config from SQL
sqlgetappconfig:1800000         // 30 min — same as above
};
/* ─── Targeted cache invalidation per write action ──────────────────────────
 * Maps each mutation action to the read cache prefixes it should bust.
 * Prevents nuking unrelated caches (forms, competitions, etc.) on every write.
 * If an action is NOT listed, the full cache is cleared as a safe fallback. */
var WRITE_INVALIDATES={
  // Form / application mutations
  createform:['getforms','getinitialdata'],
  updateform:['getforms','getinitialdata'],
  submitform:['getforms','getinitialdata'],
  updatestatus:['getforms','getinitialdata'],
  uploadfile:['listdocuments','getinitialdata','getforms'],
  deletefile:['listdocuments','getinitialdata','getforms'],
  copydocument:['listdocuments','getinitialdata','getforms'],
  evaluateproject:['getforms','getinitialdata'],
  batchevaluate:['getforms','getinitialdata'],
  batchcheckcompliance:['getforms','getinitialdata'],
  generatecontract:['getforms','getinitialdata'],
  batchgeneratecontracts:['getforms','getinitialdata'],
  bulkupdateapplicationstatus:['getforms','getinitialdata'],
  // Competition mutations
  createcompetition:['getcompetitions','getpubliccompetitions','getinitialdata','getcontestboard','getcompetitionsummary'],
  editcompetition:['getcompetitions','getpubliccompetitions','getinitialdata','getcontestboard','getcompetitionsummary'],
  deletecompetition:['getcompetitions','getpubliccompetitions','getinitialdata','getcontestboard','getcompetitionsummary'],
  archivecompetition:['getcompetitions','getpubliccompetitions','getinitialdata','getcontestboard','getcompetitionsummary'],
  // Reviewer mutations
  addreviewer:['getreviewers','getreviewerforms'],
  updatereviewer:['getreviewers','getreviewerforms'],
  deletereviewer:['getreviewers','getreviewerforms'],
  bulkdeletereviewers:['getreviewers','getreviewerforms','getforms'],
  assignreviewers:['getreviewers','getreviewerforms','getforms'],
  // Reviewer workflow mutations (BPMN 19→20→22→23 + propose/confirm)
  // Without these, a unknown-action fallback nukes the entire client cache on
  // every consent/decline/submit click — wasteful and racy. Explicit entries
  // also guarantee getreviewerforms refreshes immediately so the reviewer's
  // own list reflects the new state without manual refresh.
  consenttoreview:['getreviewerforms','getreviewers','getforms','getinitialdata'],
  declineinvitation:['getreviewerforms','getreviewers','getforms','getinitialdata'],
  submitreview:['getreviewerforms','getreviewers','getforms','getinitialdata','getcompetitionsummary'],
  proposereviewers:['getreviewers','getforms','getinitialdata'],
  confirmreviewers:['getreviewers','getreviewerforms','getforms','getinitialdata'],
  replacereviewer:['getreviewers','getreviewerforms','getforms','getinitialdata'],
  // Project mutations
  createproject:['getprojects'],
  updateproject:['getprojects','getproject'],
  transitionprojectstatus:['getprojects','getproject'],
  createexpense:['getproject'],
  approveexpense:['getproject'],
  adddeliverable:['getproject'],
  updatedeliverable:['getproject'],
  generateranking:['getforms','getinitialdata','getcompetitionsummary'],
  approveresults:['getforms','getinitialdata','getcompetitionsummary'],
  publishresults:['getforms','getinitialdata','getcompetitionsummary','getcontestboard'],
  // Report mutations
  submitreport:['getreports','getreport'],
  acceptreport:['getreports','getreport'],
  returnreport:['getreports','getreport'],
  assignfinalreportreviewer:['getreports','getreport'],
  submitfinalreportreview:['getreports','getreport'],
  acceptfinalreport:['getreports','getreport'],
  // Change request mutations
  createchangerequest:['getchangerequests','getproject'],
  approvechangerequest:['getchangerequests','getproject'],
  rejectchangerequest:['getchangerequests','getproject'],
  // Sanctions
  addsanction:['getproject','checksanctions','checkeligibility'],
  // v6.9.0 — User notification preferences
  saveuserpreferences:['getnotificationsettings','getuserpreferences'],
  savesystemnotificationsettings:['getnotificationsettings','getsystemnotificationsettings'],
  // v6.10.0 — Full CSV export (bust general cache after data snapshot)
  exportalldatacsv:['getinitialdata','getcompetitions','getforms'],
  // Form delete (applicant draft) — bust forms + initial data only
  deleteform:['getforms','getinitialdata'],
  deletedraft:['getforms','getinitialdata'],
  // My Documents mutations
  copydocforuser:['listmydocuments'],
  uploadmydocument:['listmydocuments'],
  deletemydocument:['listmydocuments'],
  renamemydocument:['listmydocuments'],
  // Pregen doc: bust mydocs + relevant form caches
  upsertdocument:['listmydocuments','listdocuments'],
  ensureuserpregenerateddocs:['listmydocuments'],
  savedocumentcontent:['listmydocuments','listdocuments','getformdocuments','getforms','getinitialdata'],
  // v12.27.0: Proposal Wizard mutations
  sqlcreateproposal:['getforms','getinitialdata'],
  sqlupdateproposal:['getforms','getinitialdata','sqlgetproposal'],
  generateapplicationdocument:['listmydocuments','listdocuments','getforms'],
  // Google-styled inline document editor: new-doc form attachment
  attachdocumenttoform:['getformdocuments','listdocuments','getforms','getinitialdata'],
};
var UI_REFRESH_INTERVALS={adminCompetitions:60000,userCompetitions:120000,adminCalendar:120000,userCalendar:180000,appData:60000,adminStream:30000,userStream:60000,wakeRefreshDebounce:3000,tabSwitch:3000};
var isPageVisible=()=>typeof document==='undefined'||document.visibilityState==='visible';
var wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/* ─── Phase 5: connectivity toasts ──
 * Surface online/offline transitions once with a brief, non-blocking toast.
 * No extra polling — relies on the browser's native online/offline events. */
if(typeof window!=='undefined'){
    let _wasOffline=(typeof navigator!=='undefined'&&navigator.onLine===false);
    window.addEventListener('offline',()=>{_wasOffline=true;try{toast('Връзката е прекъсната. Промените ще изчакат възстановяване.','warning',5000)}catch(_){}});
    window.addEventListener('online',()=>{_wasOffline=false;});
}
/** Debounce: returns a function that only invokes `fn` after `ms` ms of silence */
var debounce=(fn,ms)=>{let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);}};
/** Throttle: invoke `fn` at most once per `ms` ms */
var throttle=(fn,ms)=>{let last=0;return(...args)=>{const now=Date.now();if(now-last>=ms){last=now;fn(...args);}}};

/* ─── Cache key indexes — turn O(all-keys) scans into O(matched) ───────────
 * `_actionKeys` maps each lowercase action (e.g. 'getforms') to the Set of
 * full requestKeys (action::JSON.stringify(body)) currently held in either the
 * in-memory readResponseCache or the inflight dedup map. `_persistedKeys` is
 * the parallel Set of requestKeys we know are mirrored into localStorage.
 * Maintained transparently by the wrappers below — all readResponseCache
 * mutations in this file go through _setReadCache / _deleteReadCache. */
var _actionKeys=new Map();
var _persistedKeys=new Set();
var _actionOf=requestKey=>{const i=requestKey.indexOf('::');return i<0?requestKey:requestKey.slice(0,i);};
var _indexAdd=requestKey=>{const a=_actionOf(requestKey);let s=_actionKeys.get(a);if(!s){s=new Set();_actionKeys.set(a,s);}s.add(requestKey);};
var _indexDel=requestKey=>{const a=_actionOf(requestKey);const s=_actionKeys.get(a);if(!s)return;s.delete(requestKey);if(s.size===0)_actionKeys.delete(a);};
var _setReadCache=(requestKey,entry)=>{readResponseCache.set(requestKey,entry);_indexAdd(requestKey);};
var _deleteReadCache=requestKey=>{readResponseCache.delete(requestKey);_indexDel(requestKey);};
var _setInflight=(requestKey,p)=>{inflightReadRequests.set(requestKey,p);_indexAdd(requestKey);};
var _deleteInflight=requestKey=>{inflightReadRequests.delete(requestKey);if(!readResponseCache.has(requestKey))_indexDel(requestKey);};

/** Check whether the read cache already has a fresh entry for a given action */
var isCacheFresh=(action)=>{
    const key=String(action||'').toLowerCase();
    const ttl=READ_CACHE_TTL_MS[key]||0;
    if(ttl<=0)return false;
    const set=_actionKeys.get(key);if(!set||set.size===0)return false;
    const now=Date.now();
    for(const k of set){
        const e=readResponseCache.get(k);
        if(e&&(now-e.ts)<ttl)return true;
    }
    return false;
};

/** Drop all persisted cache rows for a given action prefix (or all if omitted).
 *  O(matched) thanks to the _persistedKeys index. Safe under quota errors. */
var _unpersistByPrefix=(prefix)=>{
    if(!prefix){
        for(const k of _persistedKeys){try{localStorage.removeItem(_PERSIST_KEY_PREFIX+k)}catch(_){}}
        _persistedKeys.clear();
        return;
    }
    const dead=[];
    for(const k of _persistedKeys)if(k.startsWith(prefix))dead.push(k);
    for(const k of dead){try{localStorage.removeItem(_PERSIST_KEY_PREFIX+k)}catch(_){}_persistedKeys.delete(k);}
};

/** Flush all read caches + inflight dedup so next api() call hits the server fresh */
var clearApiCache=()=>{
    readResponseCache.clear();
    inflightReadRequests.clear();
    _actionKeys.clear();
    _unpersistByPrefix('');
    // Also purge data-layer v2 cache entries so they don't outlive the v1 entries.
    if (typeof ERP_DATA !== 'undefined' && typeof ERP_DATA.clear === 'function') {
        ERP_DATA.clear();
    }
    var v2Prefix = 'erp:cache:v2:';
    try {
        for (var i = localStorage.length - 1; i >= 0; i--) {
            var k = localStorage.key(i);
            if (k && k.indexOf(v2Prefix) === 0) {
                localStorage.removeItem(k);
            }
        }
    } catch (_) {}
};

/** Selective invalidation: drop only the in-memory + persisted cache entries
 *  whose action prefix matches one of `actions`. Used by the data-change stream
 *  so that detecting a forms/competitions change doesn't also nuke unrelated
 *  caches (dashboard, projects, reports, calendar, reviewer lists, etc.). */
var invalidateApiCache=(actions)=>{
    const list=Array.isArray(actions)?actions:[actions];
    for(const a of list){
        const action=String(a||'').toLowerCase();
        if(!action)continue;
        const set=_actionKeys.get(action);
        if(set&&set.size){
            for(const k of[...set]){readResponseCache.delete(k);inflightReadRequests.delete(k);}
            _actionKeys.delete(action);
        }
        _unpersistByPrefix(action+'::');
    }
};

/* ─── INSTANT-LOAD LAYER: persistence + stale-while-revalidate + optimistic mutations ───
 * Goal: zero perceived latency. Hot reads hydrate from localStorage on boot,
 * stale entries serve instantly while a background refresh runs, and writes
 * patch caches synchronously so React re-renders before the network round-trip. */
var _PERSIST_KEY_PREFIX='erp:cache:';
var _PERSIST_VERSION='v1';
var _PERSIST_MAX_BYTES=200000;
var _PERSIST_MAX_AGE_MS=24*60*60*1000;
// Only endpoints whose stale data is harmless to display while revalidating.
var SWR_ACTIONS=new Set(['getforms','getcompetitions','getpubliccompetitions','getapplicationsbycompetition','listdocuments','getreviewers','getreviewerforms','getcalendarevents','getcompetitionsfeed','getcontestboard','getcompetitionsummary','getinitialdata','getprojects','getproject','getreports','getreport','getchangerequests','getreviewdeadlines','listmydocuments']);
// Subset that survives a full reload — keep small to respect localStorage quota.
var PERSIST_ACTIONS=new Set(['getforms','getcompetitions','getpubliccompetitions','listdocuments','getcontestboard','getreviewers','getprojects','getcalendarevents','getinitialdata']);

var _persistEntry=(requestKey,value)=>{
    try{
        const action=requestKey.split('::')[0];
        if(!PERSIST_ACTIONS.has(action))return;
        const json=JSON.stringify({v:_PERSIST_VERSION,ts:Date.now(),value});
        if(json.length>_PERSIST_MAX_BYTES)return;
        localStorage.setItem(_PERSIST_KEY_PREFIX+requestKey,json);
        _persistedKeys.add(requestKey);
    }catch(_){
        // Quota exceeded — drop oldest persisted entry and retry once. O(persisted) via index.
        try{
            let oldestK=null,oldestTs=Infinity;
            for(const k of _persistedKeys){
                try{const o=JSON.parse(localStorage.getItem(_PERSIST_KEY_PREFIX+k));if(o&&o.ts<oldestTs){oldestTs=o.ts;oldestK=k;}}catch(_){}
            }
            if(oldestK){
                localStorage.removeItem(_PERSIST_KEY_PREFIX+oldestK);
                _persistedKeys.delete(oldestK);
                localStorage.setItem(_PERSIST_KEY_PREFIX+requestKey,JSON.stringify({v:_PERSIST_VERSION,ts:Date.now(),value}));
                _persistedKeys.add(requestKey);
            }
        }catch(_){}
    }
};
var _hydratePersistedCache=()=>{
    try{
        const now=Date.now();
        const stale=[];
        // Single pass over localStorage on boot — necessary because we don't
        // yet have an index. From this point forward _persistedKeys carries
        // every persisted key so all later operations stay O(matched).
        for(let i=0;i<localStorage.length;i++){
            const k=localStorage.key(i);if(!k||!k.startsWith(_PERSIST_KEY_PREFIX))continue;
            try{
                const obj=JSON.parse(localStorage.getItem(k));
                if(!obj||obj.v!==_PERSIST_VERSION||(now-obj.ts)>_PERSIST_MAX_AGE_MS){stale.push(k);continue;}
                const requestKey=k.slice(_PERSIST_KEY_PREFIX.length);
                _setReadCache(requestKey,{ts:obj.ts,value:obj.value,hydrated:true});
                _persistedKeys.add(requestKey);
            }catch(_){stale.push(k);}
        }
        for(const k of stale){try{localStorage.removeItem(k)}catch(_){}}
    }catch(_){}
};
_hydratePersistedCache();

/* ─── Cache subscription bus — components re-render when SWR background fetch lands or an optimistic patch is applied ─── */
var _cacheSubscribers=new Map();

var _emitCacheChange=(action)=>{
    const key=String(action||'').toLowerCase();
    const subs=_cacheSubscribers.get(key);if(!subs)return;
    for(const fn of subs){try{fn()}catch(_){}}
};

/* ─── Inflight-activity tracker — drives refresh-button spinners during SWR background revalidation ─── */
var _readActivity=new Map();
var _activitySubscribers=new Set();
var _emitActivity=()=>{for(const fn of _activitySubscribers){try{fn()}catch(_){}}};
var _bumpActivity=(action)=>{
    const key=String(action||'').toLowerCase();
    _readActivity.set(key,(_readActivity.get(key)||0)+1);
    _emitActivity();
};
var _dropActivity=(action)=>{
    const key=String(action||'').toLowerCase();
    const n=(_readActivity.get(key)||0)-1;
    if(n<=0)_readActivity.delete(key);else _readActivity.set(key,n);
    _emitActivity();
};
/** Returns true if any inflight read for the given action (or any read at all if action omitted) is active. */
var isReadInflight=(action)=>{
    if(!action)return _readActivity.size>0;
    const key=String(action).toLowerCase();
    return(_readActivity.get(key)||0)>0;
};
/** React hook: re-renders subscriber whenever inflight activity for `action` changes. */
var useReadActivity=(action)=>{
    const[,force]=useState(0);
    useEffect(()=>{
        const fn=()=>force(n=>(n+1)|0);
        _activitySubscribers.add(fn);
        return()=>{_activitySubscribers.delete(fn);};
    },[]);
    return isReadInflight(action);
};

/* ─── Global top-of-viewport refresh indicator (CSS-driven via body[data-refreshing]) ─── */
(()=>{
    if(typeof document==='undefined')return;
    let _activeSince=0;
    let _hideTimer=null;
    const MIN_VISIBLE_MS=320; // avoid jarring flash on sub-frame requests
    const sync=()=>{
        const active=_readActivity.size>0;
        if(active){
            if(_hideTimer){clearTimeout(_hideTimer);_hideTimer=null;}
            if(document.body.getAttribute('data-refreshing')!=='true'){
                _activeSince=Date.now();
                document.body.setAttribute('data-refreshing','true');
            }
        }else if(document.body.getAttribute('data-refreshing')==='true'){
            const elapsed=Date.now()-_activeSince;
            const wait=Math.max(0,MIN_VISIBLE_MS-elapsed);
            if(_hideTimer)clearTimeout(_hideTimer);
            _hideTimer=setTimeout(()=>{
                if(_readActivity.size===0)document.body.removeAttribute('data-refreshing');
                _hideTimer=null;
            },wait);
        }
    };
    _activitySubscribers.add(sync);
})();

/* ─── runOptimistic ─────────────────────────────────────────────────────
 * Universal "fire-and-forget" wrapper for non-modal action buttons.
 *
 *   <button onClick={(ev)=>runOptimistic(ev,()=>api('approveX',{id}),
 *           {successMsg:'Одобрено',onSuccess:()=>refresh()})}>
 *
 * Effect:
 *  • Marks the source button with data-pending="true" → CSS shimmer +
 *    spinner overlay (defined in styles.css §LIVE-SYSTEM FEEL).
 *  • Awaits asyncFn() in the background.
 *  • On success, briefly flashes data-just-acted="true" (green tick) and
 *    fires opts.onSuccess(res). Toast iff successMsg provided.
 *  • On failure, clears pending state and toasts errorMsg (or err.message).
 *  • Always clears pending flag, even on exception.
 *
 * The button stays visually visible (not display-toggled) so layout never
 * shifts — the user reads the same text they just clicked. */
var runOptimistic=(eventOrEl,asyncFn,opts)=>{
    var o=opts||{};
    var btn=null;
    if(eventOrEl){
        if(eventOrEl.currentTarget&&eventOrEl.currentTarget.setAttribute)btn=eventOrEl.currentTarget;
        else if(eventOrEl.target&&eventOrEl.target.closest)btn=eventOrEl.target.closest('button,a,[role="button"]');
        else if(eventOrEl.setAttribute)btn=eventOrEl;
    }
    if(btn){
        if(btn.getAttribute('data-pending')==='true')return Promise.resolve(null); // double-click guard
        btn.setAttribute('data-pending','true');
    }
    var done=function(){
        if(!btn)return;
        btn.removeAttribute('data-pending');
    };
    var p;
    try{p=asyncFn();}catch(syncErr){p=Promise.reject(syncErr);}
    if(!p||typeof p.then!=='function')p=Promise.resolve(p);
    return p.then(function(res){
        done();
        if(res&&res.success===false){
            var msg=o.errorMsg||(res.error||'Действието не успя.');
            if(typeof toast==='function')toast(msg,'error');
            if(typeof o.onError==='function')o.onError(res);
            return res;
        }
        if(btn){
            btn.setAttribute('data-just-acted','true');
            setTimeout(function(){if(btn)btn.removeAttribute('data-just-acted');},650);
        }
        if(o.successMsg&&typeof toast==='function')toast(o.successMsg,'success',2200);
        if(typeof o.onSuccess==='function')o.onSuccess(res);
        return res;
    },function(err){
        done();
        if(typeof toast==='function')toast(o.errorMsg||(err&&err.message)||'Грешка при свързване.','error');
        if(typeof o.onError==='function')o.onError(err);
        return null;
    });
};
if(typeof window!=='undefined')window.runOptimistic=runOptimistic;

/** Patch every cached read entry whose key starts with `<actionPrefix>::` via a pure mutator.
 *  Returns a rollback function. Used by mutateApi() and direct optimistic edits.
 *  O(matched) — uses _actionKeys index instead of scanning the whole cache. */
var patchReadCache=(actionPrefix,mutator)=>{
    const action=String(actionPrefix||'').toLowerCase();
    const set=_actionKeys.get(action);
    const rollbacks=[];
    if(!set||set.size===0)return()=>{};
    for(const k of[...set]){
        const entry=readResponseCache.get(k);if(!entry)continue;
        const before=entry.value;
        let after;
        try{after=mutator(before,k)}catch(_){continue}
        if(after===undefined||after===before)continue;
        _setReadCache(k,{ts:entry.ts,value:after,optimistic:true});
        _persistEntry(k,after);
        rollbacks.push(()=>{_setReadCache(k,{ts:entry.ts,value:before});_persistEntry(k,before);});
    }
    if(rollbacks.length)_emitCacheChange(action);
    return()=>{for(const r of rollbacks)r();_emitCacheChange(action);};
};

/** Optimistic write: applies cache patches synchronously, fires the API call, rolls back on failure.
 *  opts.patches: [{action:'getforms', mutator:(forms)=>...}, ...]
 *  opts.invalidates: [actionPrefix...] — clear matching read caches after success (defaults to patches' actions). */
var mutateApi=async(action,data,opts={})=>{
    const patches=Array.isArray(opts.patches)?opts.patches:[];
    const rollbacks=patches.map(p=>patchReadCache(p.action,p.mutator));
    try{
        const res=await api(action,data);
        if(res&&res.success===false)throw new Error(res.error||'Грешка');
        const invalidates=Array.isArray(opts.invalidates)?opts.invalidates:patches.map(p=>p.action);
        for(const a of invalidates){
            const act=String(a||'').toLowerCase();
            const set=_actionKeys.get(act);
            if(set&&set.size){
                for(const k of[...set]){readResponseCache.delete(k);inflightReadRequests.delete(k);}
                _actionKeys.delete(act);
            }
            _unpersistByPrefix(act+'::');
            _emitCacheChange(a);
        }
        return res;
    }catch(err){
        for(const r of rollbacks)r();
        throw err;
    }
};

/** Periodic cache GC — evict expired entries to prevent unbounded growth.
 *  Runs in idle time if available, otherwise falls back to setTimeout. */
(function scheduleGC(){
    const GC_INTERVAL_MS=90000;
    const runGC=()=>{
        const now=Date.now();
        for(const[key,entry] of readResponseCache){
            const ttl=READ_CACHE_TTL_MS[_actionOf(key)]||0;
            if(now-entry.ts>ttl*2)_deleteReadCache(key);
        }
        if(_toastDedup.size>0){for(const[k,ts] of _toastDedup){if(now-ts>5000)_toastDedup.delete(k)}}
        scheduleGC();
    };
    const schedule=()=>{
        if
        (typeof requestIdleCallback==='function'){
            requestIdleCallback(runGC,{timeout:GC_INTERVAL_MS+5000});
        }else{
            setTimeout(runGC,GC_INTERVAL_MS);
        }
    };
    setTimeout(schedule,GC_INTERVAL_MS);
})();

/* ─── google.script.run bridge (no URL needed when served from GAS) ─── */
var _useGSR=!!(typeof google!=='undefined'&&google.script&&google.script.run);
// v9.44.0-timeout-fix: 33 s gives GAS (hard-capped at 30 s) time to finish
// and send the response before the client-side guard fires. Previously 30 s
// caused the client to race against its own timeout and occasionally reject
// a response that was already on the wire.
var _GSR_TIMEOUT_MS=33000;
var _gsrCall=(jsonStr)=>new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error('Заявката отне твърде дълго (timeout). Моля, опитайте отново.'))}},_GSR_TIMEOUT_MS);
    google.script.run
    .withSuccessHandler(r=>{if(!settled){settled=true;clearTimeout(timer);resolve(r)}})
    .withFailureHandler(e=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error(e&&e.message?e.message:String(e)))}})
    .gasApiCall(jsonStr);
});

/* ─── API (google.script.run preferred, fetch fallback) ─── */
/* ─── PERF: server data-versions tracker ──────────────────────────────────
 * Captured from any response that carries a `versions` field (currently
 * getInitialData and getDataChangeStream). Forwarded as `_dv` on subsequent
 * cached read requests so the backend can short-circuit with `notModified`
 * when nothing changed. Module-scoped — survives across api() calls but not
 * page reloads (a fresh load just re-learns from the first response). */
var _lastServerDataVersions=null;
// v12.27.1-degraded: track GAS reachability for state-transition banners.
// undefined = initial (no state known), false = GAS DOWN, true = GAS UP.
var _gasReachable;
var _gasLastFailTs = 0; // v12.26.0: timestamp of last GAS failure, for recovery window
var _gasNearDeadlineCount = 0; // v12.26.0-stable: count consecutive near-deadline responses
var _DV_AWARE_ACTIONS=new Set([
    'getinitialdata','getforms','getcompetitions','getpubliccompetitions',
    'listdocuments','getreviewers','getreviewerforms',
    // Panel + dashboard context propagate versions — enable notModified shortcut.
    'getcompetitionpanel','getdashboardcontext'
]);
var _captureServerDataVersions=(json)=>{
    if(!json||typeof json!=='object')return;
    const v=json.versions;
    if(!v||typeof v!=='object')return;
    // Merge so a partial response (e.g. only `applications`) doesn't drop
    // previously-known scopes. Numeric coercion guards against string drift.
    const next={..._lastServerDataVersions};
    for(const k of Object.keys(v)){next[k]=Number(v[k]||0);}
    _lastServerDataVersions=next;
};

// v12.17.2-analytics: Performance monitoring scaffold for production visibility
var _analyticsMetrics={
  apiCalls:[],
  dlqEvents:[],
  metrics:{totalRequests:0,totalErrors:0,totalCacheHits:0,avgLatencyMs:0},
  flushInterval:60*1000, // 60s
  flushFn:null
};

var _emitAnalyticsEvent=(eventType,data)=>{
  try{
    const evt=new CustomEvent('erp:analytics',{detail:{type:eventType,timestamp:Date.now(),...data}});
    if(typeof window!=='undefined'&&window.dispatchEvent)window.dispatchEvent(evt);
  }catch(_){}
};

var _captureApiMetrics=(action,latencyMs,success,cacheHit,backendMs)=>{
  _analyticsMetrics.apiCalls.push({action,latencyMs,success,cacheHit,backendMs,ts:Date.now()});
  _analyticsMetrics.metrics.totalRequests++;
  if(!success)_analyticsMetrics.metrics.totalErrors++;
  if(cacheHit)_analyticsMetrics.metrics.totalCacheHits++;
  _emitAnalyticsEvent('api:complete',{action,latencyMs,success,cacheHit,backendMs});
};

// v12.17.2-priorityqueue: Request prioritization to prevent starvation of critical ops
// Priority levels: 1=auth (critical) > 2=dashboard > 3=background > 4=analytics (low)
var _priorityQueue={
  queues:{1:[],2:[],3:[],4:[]},
  processing:false,
  maxConcurrent:3,
  active:0,
  stats:{totalQueued:0,priorityChanges:0,totalDeferred:0,totalDirect:0}
};

var _getActionPriority=(action)=>{
  const a=String(action||'').toLowerCase();
  // Priority 1: Auth, critical operations
  if(a==='authenticate'||a==='checkadmin'||a==='adminlogin'||a==='getversion'||a==='ping'||a==='initiate2fa'||a==='verify2fa')return 1;
  // Priority 2: Dashboard, initial data, competitions — also write operations that are user-facing (submit, create, update)
  // Writes bypass the queue entirely, but priority 2 label is used for analytics/logging
  if(a==='getinitialdata'||a==='getforms'||a==='getcompetitions'||a==='getpubliccompetitions'||a==='getdashboardcontext'||a==='getprojects'||a==='getprojectdashboard'||a==='loadmoreforms'||a==='loadmorecompetitions')return 2;
  if(a==='submitform'||a==='createform'||a==='updateform'||a==='updatestatus'||a==='submitreview')return 2;
  // Priority 3: Background refresh, document listing, reviews
  if(a==='listdocuments'||a==='getdocumentssummary'||a==='getreviewers'||a==='getreviewerforms'||a==='getreports'||a==='getcompetitionsummary'||a==='getcontestboard'||a==='listmydocuments')return 3;
  // Priority 4: Analytics, logging, low-priority fetches
  return 4;
};

// v12.18.0: Write deduplication by idempotency key
var _inflightWrites=new Map();

var prioritizeRequest=(priority,action,asyncFn)=>{
  priority=Math.max(1,Math.min(4,priority||3)); // Clamp to 1-4
  _priorityQueue.queues[priority].push({action,fn:asyncFn,priority,queuedAt:Date.now()});
  _priorityQueue.stats.totalQueued++;
  _priorityQueue.stats.totalDeferred++;
  _emitAnalyticsEvent('queue:enqueue',{action,priority,queuedLen:_priorityQueue.queues[priority].length});
  if(!_priorityQueue.processing)_processPriorityQueue();
};

var _processPriorityQueue=(async()=>{
  if(_priorityQueue.processing||_priorityQueue.active>=_priorityQueue.maxConcurrent)return;
  _priorityQueue.processing=true;
  while(_priorityQueue.active<_priorityQueue.maxConcurrent){
    let item=null;
    for(let p=1;p<=4;p++){
      if(_priorityQueue.queues[p].length>0){item=_priorityQueue.queues[p].shift();break;}
    }
    if(!item)break;
    _priorityQueue.active++;
    const _queueWait=Date.now()-item.queuedAt;
    try{
      await Promise.resolve().then(item.fn);
      _emitAnalyticsEvent('queue:complete',{action:item.action,priority:item.priority,queueWaitMs:_queueWait});
    }catch(_){
      _emitAnalyticsEvent('queue:error',{action:item.action,priority:item.priority,queueWaitMs:_queueWait});
    }
    _priorityQueue.active--;
  }
  _priorityQueue.processing=false;
});


var api=async(action,data={},retries=2)=>{
// WordPress adapter
if(typeof window!=='undefined'&&typeof window.__ERP_API_OVERRIDE__==='function'){
    return window.__ERP_API_OVERRIDE__(action,data);
}
// ── v12.20.0-modern: Modern PHP pool with weighted selection ──
// PHP is the fast path (~200ms). GAS is the authoritative fallback.
// GAS-only actions (Drive/file ops) skip PHP entirely to avoid wasted timeouts.
const _isRead=!!READ_ACTIONS[String(action||'').toLowerCase()];
const _actionLc = String(action||'').toLowerCase();
// Actions that CANNOT be handled by PHP (require Google Drive/Sheets API)
// v12.32.9-laravel: Reduced list — many actions now handled by the Laravel bridge.
// Only keep actions that truly need Google Drive/Sheets API.
var _GAS_ONLY = /^(generateapplicationdocument|generatebudgetspreadsheet|batchgeneratedocuments|autogeneratefortype|predictivebatchgenerate|testemailnotification|test2faemail|repairallsheets|renamemydocument|getdatachangestream|adminassets|initiate2fa|verify2fa|loguserlogout|publishresults|approveresults|validateprojectresults|createlibraryfolder|deletelibraryfile|deletelibraryfolder|uploadlibraryfile|getmonreportsbatch|submitmonreport|cleanupmonduplicates|getreportdeadlines|senddeadlinereminders|evaluateproject|batchevaluate|batchcheckcompliance|performfullcompliancecheck|batchgeneratecontracts|removereviewer|requestcorrection|setdevadminemailsenabled|getmynotifications|drivefilemeta|uploadmydocumentchunk)$/i;
var _isGASOnly = _GAS_ONLY.test(_actionLc);
// v12.27.6-phpauth: Auth actions handled exclusively by PHP — never fall through to GAS.
var _PHP_AUTH = /^(adminlogin|checkadmin|authenticate)$/i;
var _isPhpAuth = _PHP_AUTH.test(_actionLc);

// v12.26.0: file:// protocol detection — skip PHP pool entirely.
// From file://, ALL cross-origin fetch requests fail (null origin).
// Skip directly to GAS to avoid 20s+ of useless PHP pool timeouts.
// Cached in sessionStorage so repeated calls are instant.
var _isFileProtocol = false;
try {
    var _cachedFp = window._safeSS && window._safeSS.getItem('__erp_file_protocol');
    if (_cachedFp !== null) {
        _isFileProtocol = _cachedFp === '1';
    } else {
        _isFileProtocol = (typeof window !== 'undefined' && window.location &&
            (String(window.location.protocol) === 'file:' || window.location.origin === 'null'));
        if (window._safeSS) window._safeSS.setItem('__erp_file_protocol', _isFileProtocol ? '1' : '0');
    }
} catch(_) { _isFileProtocol = false; }

if(typeof window!=='undefined' && !_isGASOnly && !_isFileProtocol){
    // ── Modern weighted pool (v12.20.0) ──
    // v12.32.9-laravel: Accept relative /api URLs for Laravel backend.
    // Falls back to production URL only when no URL is configured at all.
    var _filterHttp = function(arr) {
      if (!Array.isArray(arr)) return [];
      return arr.filter(function(u){
        return u && typeof u === 'string' && (u.indexOf('/') === 0 || u.indexOf('http') === 0);
      });
    };
    var _pool;
    if (window.__ERP_POOL && typeof window.__ERP_POOL.getBestUrl === 'function') {
        var _best = window.__ERP_POOL.getBestUrl();
        _pool = _best ? [_best.url] : [];
        // Append remaining pool entries as fallbacks
        var _allPool = _filterHttp(window._PHP_API_POOL);
        for (var _ai = 0; _ai < _allPool.length; _ai++) {
            if (_allPool[_ai] !== (_best ? _best.url : '')) _pool.push(_allPool[_ai]);
        }
    } else {
        var _fallbackPool = _filterHttp(window._PHP_API_POOL);
        _pool = _fallbackPool.length
            ? _fallbackPool
            : _filterHttp(window._PHP_API_URL ? [window._PHP_API_URL] : []);
    }

    const _phpTimeout = _isRead
        ? (window.__ERP_PHP_TIMEOUT_READ || 8000)
        : (window.__ERP_PHP_TIMEOUT_WRITE || 15000);

    // v12.27.8-httpstatus: Track whether PHP returned 404 for this action.
    // If so, skip remaining PHP pool URLs (they'll also 404) and fall through
    // to GAS immediately.
    var _phpApiReturned404 = false;

    for(let _pi=0;_pi<_pool.length;_pi++){
        // If a previous PHP URL returned 404 for this action, skip the rest
        if (_phpApiReturned404) break;
        try{
            const _resp=await fetch(_pool[_pi],{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({action,...data}),
                signal:AbortSignal.timeout(_phpTimeout)
            });
            if(_resp.ok){
                const _j=await _resp.json();
                if(_j&&_j.success!==false){
                    // ── Mark pool success (circuit breaker) ──
                    if (window.__ERP_POOL && typeof window.__ERP_POOL.markSuccess === 'function') {
                        window.__ERP_POOL.markSuccess(_pool[_pi], 0);
                    }

                    // Empty-list fallthrough detection
                    var _isEmptyList = false;
                    if (_isRead) {
                        var _listKeys = ['forms','competitions','reviewers','projects','reports','changeRequests','documents','deliverables','expenses','sanctions','libraryDeposits','notifications','messages'];
                        for (var _lk = 0; _lk < _listKeys.length; _lk++) {
                            var _k = _listKeys[_lk];
                            if (_j.hasOwnProperty(_k) && Array.isArray(_j[_k]) && _j[_k].length === 0 && !_j.total && !_j.hasOwnProperty('summary')) {
                                _isEmptyList = true; break;
                            }
                        }
                        if (!_isEmptyList && _actionLc === 'getinitialdata' && _j.data && _j.data.forms && Array.isArray(_j.data.forms) && _j.data.forms.length === 0 && (!_j.data.competitions || _j.data.competitions.length === 0)) {
                            _isEmptyList = true;
                        }
                    }
                    if (_isEmptyList) {
                        if (_gasReachable === false) {
                            _j._source = 'php';
                            _j._degraded = true;
                            return _j;
                        }
                    } else {
                        // Promote successful URL to front of pool
                        if(_pi>0&&window._PHP_API_POOL){
                            window._PHP_API_POOL.splice(_pi,1);
                            window._PHP_API_POOL.unshift(_pool[_pi]);
                            window._PHP_API_URL=_pool[_pi];
                        }
                        _j._source = 'php';
                        _j._phpUrl = _pool[_pi];
                        return _j;
                    }
                }
                // ── v12.49.20-draftfix: PHP returned HTTP 200 but success:false ──
                // This is a LOGICAL error from the backend (ownership mismatch,
                // "only drafts can be deleted", missing email, validation, etc.),
                // NOT a transient transport failure. Previously the code marked it
                // as a pool failure and fell through to GAS, where an unreachable
                // GAS node produced a misleading "Няма връзка със сървъра" that
                // masked the real backend error (e.g. on draft delete).
                // FIX: return the real backend error verbatim. Do NOT mark the pool
                // as failed (PHP is healthy), do NOT fall through to GAS.
                if (window.__ERP_POOL && typeof window.__ERP_POOL.markSuccess === 'function') {
                    window.__ERP_POOL.markSuccess(_pool[_pi], 0);
                }
                if(_pi>0&&window._PHP_API_POOL){
                    window._PHP_API_POOL.splice(_pi,1);
                    window._PHP_API_POOL.unshift(_pool[_pi]);
                    window._PHP_API_URL=_pool[_pi];
                }
                _j._source = 'php';
                _j._phpUrl = _pool[_pi];
                return _j;
            } else if (_resp.status === 404) {
                // 404 = action not found on PHP — skip remaining pool
                _phpApiReturned404 = true;
                console.debug('[API] PHP 404 for ' + _actionLc + ' at ' + _pool[_pi] + ' — falling through to GAS');
                break;
            } else {
                // 5xx or other HTTP error — try next PHP URL
                if (window.__ERP_POOL && typeof window.__ERP_POOL.markFailure === 'function') {
                    window.__ERP_POOL.markFailure(_pool[_pi]);
                }
            }
        }catch(_){
            if (window.__ERP_POOL && typeof window.__ERP_POOL.markFailure === 'function') {
                window.__ERP_POOL.markFailure(_pool[_pi]);
            }
        }
    }
    if (_isPhpAuth) {
        return { success: false, error: 'Грешка при вход. Проверете интернет връзката и опитайте отново.' };
    }
}
// ── CRITICAL: GAS_URL guard ──
// v12.23.1-connfix: Use live getter + inline decode fallback.
var _liveGAS_check = (typeof window.__ERP_getGASURL === 'function') ? window.__ERP_getGASURL() : GAS_URL;
if (!_liveGAS_check && typeof window!=='undefined'){
    // Last-resort: try inline decode of the encoded blob (bypasses core-bundle.js)
    try{
        var _encBlob = (window.ERP_CONFIG && window.ERP_CONFIG.__ERP_GAS_ENCODED) || '';
        if(_encBlob){
            var _m = _encBlob.match(/^v\d+\.(.+)$/);
            if(_m){
                var _b64='';
                for(var _di=0;_di<_m[1].length;_di++)_b64+=String.fromCharCode(_m[1].charCodeAt(_di)-7);
                var _std=_b64.replace(/-/g,'+').replace(/_/g,'/');
                while(_std.length%4)_std+='=';
                var _dec=decodeURIComponent(escape(atob(_std)));
                if(_dec&&/^https?:\/\//.test(_dec)){
                    window.ERP_CONFIG.GAS_URL=_dec;
                    window.__ERP_GAS_URL=_dec;
                    _liveGAS_check = _dec;
                }
            }
        }
    }catch(_){}
}
if(!_liveGAS_check||_liveGAS_check.trim()===''){
    var _phpPool = (typeof window!=='undefined' && window._PHP_API_POOL && window._PHP_API_POOL.length) ? window._PHP_API_POOL : [];
    if(_phpPool.length > 0){
        // v12.24.0-phpfallback: GAS is unreachable but PHP pool is available.
        // Auto-route through PHP as primary backend. Reads work at full speed.
        // Writes may have reduced functionality (no Drive operations).
        console.warn('[erp-api] GAS_URL not available — PHP-only mode (reads+basic writes)');
        // Set live GAS to first PHP pool URL so the fetch() below routes through PHP
        window.__ERP_GAS_URL = _phpPool[0];
        window.__ERP_BACKEND = 'php';
        _liveGAS_check = _phpPool[0];
        // Notify connectivity monitor
        try { window.dispatchEvent(new CustomEvent('erp:connectivity-change', { detail: { gasReachable: false, phpReachable: true } })); } catch(_) {}
    } else {
        const msg='Липсва GAS_URL. Създайте js/config-secrets.js (от config-secrets.example.js) и въведете /exec URL от Google Apps Script деплой или /api.php за PHP бекенд.';
        if(typeof toast==='function')try{toast(msg,'error',8000)}catch(_){}
        throw new Error(msg);
    }
}
const normalizedAction=String(action||'').toLowerCase();
const reqBody={action,...data};
if(_currentUserEmail&&!reqBody.userId&&!reqBody.email&&!reqBody.userEmail&&!reqBody.username){
    reqBody.userId=_currentUserEmail;
    // SECURITY: Do NOT send isAdmin from client — server determines role via resolveAuthContext
}
const isRead=!!READ_ACTIONS[normalizedAction];
// v12.27.9-skipgas: If GAS is known down and this is a read, return empty.
// Avoids wasted 401 requests every poll cycle for actions PHP doesn't handle.
// v12.26.0: When GAS was unreachable, try localStorage cache first (SWR),
// then try GAS again every 60s for auto-recovery.
if (isRead && _gasReachable === false) {
    var _gasDownAge = Date.now() - (_gasLastFailTs || 0);
    // Try reading from data-layer cache first (instant, no network)
    try {
        if (typeof ERP_DATA !== 'undefined' && ERP_DATA.cacheGet) {
            var _cached = ERP_DATA.cacheGet(normalizedAction, data);
            if (_cached && _cached.data) {
                _cached._fromCache = true;
                _cached._degraded = true;
                return _cached.data;
            }
        }
    } catch(_) {}
    // If still in the recovery window (<30s), return empty
    // v12.30.0-perf: Reduced from 60s→30s for faster recovery after transient role sync issues
    if (_gasDownAge < 30000) {
        return { success: true, _degraded: true,
            forms: [], competitions: [], reviewers: [], projects: [], documents: [], reports: [], expenses: [] };
    }
    // Recovery window expired — try GAS again
    _gasReachable = undefined; // reset so the GAS fetch below runs
}
const bypassCache=!!reqBody.forceRefresh;
// ── PERF: conditional-fetch handshake ──────────────────────────────────────
// For known versioned read actions, attach the most recently observed server
// data versions as `_dv`. The backend short-circuits with a tiny
// `{notModified:true}` payload when nothing changed → we transparently re-use
// the in-memory readResponseCache value (revives its TTL too). Saves 30–90 KB
// of JSON serialisation + transport per polled call in the steady state.
if(isRead&&!reqBody._dv&&_DV_AWARE_ACTIONS.has(normalizedAction)){
    const _dvSnap=_lastServerDataVersions;
    if(_dvSnap&&Object.keys(_dvSnap).length){reqBody._dv={..._dvSnap};}
}
// ── Phase 5: client-side offline guard ──
// When the browser knows it's offline, fail fast with a clean error instead of
// burning retries on requests that cannot possibly succeed.
if(!isRead&&typeof navigator!=='undefined'&&navigator.onLine===false){
    throw new Error('Няма връзка с интернет. Моля, проверете свързаността и опитайте отново.');
}
// ── Phase 5: idempotency key for writes ──
// Generated once per logical call and reused on every retry attempt. The
// backend dedups by this key for ~5 minutes, making the existing transient-
// failure retry loop SAFE for writes (previously a network drop after a
// successful sheet write could cause duplicate rows on retry).
if(!isRead&&!reqBody._idemKey){
    reqBody._idemKey=normalizedAction+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
}
// Build cache key WITHOUT forceRefresh so a forced-refresh overwrites the same slot as a normal read.
// Also strip `_dv` (the conditional-fetch handshake) — different snapshots
// must NOT split the same logical request into different cache slots.
const _cacheBody=(bypassCache||reqBody._dv)?(()=>{const b={...reqBody};delete b.forceRefresh;delete b._dv;return b})():reqBody;
const requestKey=isRead?(normalizedAction+'::'+JSON.stringify(_cacheBody)):'';
const ttlMs=isRead?(READ_CACHE_TTL_MS[normalizedAction]||0):0;
if(isRead&&!bypassCache&&ttlMs>0){
    const cached=readResponseCache.get(requestKey);
    if(cached){
        const age=Date.now()-cached.ts;
        if(age<ttlMs)return cached.value;
        // Stale-while-revalidate: serve stale instantly, refresh in background once.
        if(SWR_ACTIONS.has(normalizedAction)){
            // PERF: skip background revalidation while page is hidden — the
            // visibilitychange wake handler will trigger a fresh fetch on return.
            // Avoids burning round-trips for backgrounded tabs.
            if(!inflightReadRequests.has(requestKey)&&isPageVisible()){
                _bumpActivity(normalizedAction);
                Promise.resolve().then(()=>api(action,{...data,forceRefresh:true},retries)
                    .then(()=>_emitCacheChange(normalizedAction))
                    .catch(()=>{})
                    .finally(()=>_dropActivity(normalizedAction)));
            }
            return cached.value;
        }
        _deleteReadCache(requestKey);
    }
}
if(isRead&&!bypassCache&&inflightReadRequests.has(requestKey))return inflightReadRequests.get(requestKey);

// v12.18.0: Write deduplication — if an identical write is already in-flight, return its promise
if(!isRead&&reqBody._idemKey&&_inflightWrites.has(reqBody._idemKey)){
  return _inflightWrites.get(reqBody._idemKey);
}

// v12.18.0: Track write promises for dedup
const _writeDedupKey=!isRead&&reqBody._idemKey?reqBody._idemKey:null;

// v12.18.0-fix: Declare _reqStartTime in OUTER scope so error-handler catch blocks
// in the queue wrapper, the isRead branch, and the write branch can all access it.
// Previously it was const-scoped inside reqPromise → ReferenceError on any API failure.
const _reqStartTime=performance&&typeof performance.now==='function'?performance.now():Date.now();

const reqPromise=(async()=>{
    const jsonStr=JSON.stringify(reqBody);
    for(let attempt=0;attempt<=retries;attempt++){
    try{
        let json;
        if(_useGSR){
        /* ── Direct server call (no /exec URL needed) ── */
        json=await _gsrCall(jsonStr);
        if(!json||typeof json!=='object')throw new Error('Невалиден отговор от gasApiCall');
        }else{
        /* ── Fetch fallback for external hosting ── */
        const controller=new AbortController();
        // ── v12.23.1-connfix: Always read GAS URL from live window getter ──
        // The const GAS_URL from config.js is captured at module load time.
        // If core-bundle.js failed and the inline decode in config.js succeeded,
        // window.__ERP_getGASURL() returns the freshly decoded URL while the
        // const GAS_URL is still empty. Use the live getter everywhere.
        var _liveGAS = (typeof window.__ERP_getGASURL === 'function') ? window.__ERP_getGASURL() : GAS_URL;
        var isPHP = (_liveGAS && _liveGAS.indexOf('api.php') >= 0)
                  || (typeof window.__ERP_BACKEND !== 'undefined' && window.__ERP_BACKEND === 'php');
        var fetchTimeout = isPHP
          ? (isRead ? 8000 : 15000)
          : (isRead ? 22000 : (attempt === 0 ? 28000 : 25000));
        const timer=setTimeout(()=>controller.abort(),fetchTimeout);
        try{
            const res=await fetch(_liveGAS,{
            method:'POST',
            redirect:'follow',
            signal:controller.signal,
            headers:{'Content-Type':'text/plain;charset=UTF-8','Accept':'application/json, text/plain, */*'},
            body:jsonStr
            });
            clearTimeout(timer);
            if(!res.ok){
            // v12.27.8-httpstatus: Added specific handling for 404 (wrong GAS URL)
            // and 500 (server error) with actionable messages.
            var _statusSpecificHint = '';
            if (res.status === 404) {
              _statusSpecificHint = 'HTTP 404 — GAS deployment URL не е намерен. Възможни причини: (1) URL е променен след повторен деплой, (2) проектът е изтрит, (3) грешен /exec адрес. Обновете GAS_URL в config-secrets.js.';
            } else if (res.status === 500) {
              _statusSpecificHint = 'HTTP 500 — GAS сървърна грешка. Възможни причини: (1) синтактична грешка в code.gs, (2) изтекъл 30-сек. времеви лимит, (3) липсваща оторизация. Проверете GAS execution log.';
            } else if (res.status === 400) {
              _statusSpecificHint = 'HTTP 400 — невалидна заявка към GAS. Проверете формата на данните.';
            } else if (res.status === 405) {
              _statusSpecificHint = 'HTTP 405 — скриптът не е публикуван като Web App (Execute as: Me / Who has access: Anyone). Вземете новия /exec URL и го поставете в main.js → GAS_URL.';
            } else if (res.status === 403) {
              _statusSpecificHint = 'HTTP 403 — нямате достъп. Проверете правата на деплоя.';
            } else {
              _statusSpecificHint = 'HTTP ' + res.status + ' — сървърна грешка.';
            }
            // v12.31.6-dbconfig: A 500 caused by missing DB configuration is FATAL,
            // not transient — retrying only floods the server with identical 500s.
            // If the response body signals a config failure, read it once and throw
            // immediately (no backoff/retry), so the UI shows one clear message.
            var _body500 = '';
            try { _body500 = (typeof res.text === 'function') ? await res.text() : ''; } catch(_) { _body500 = ''; }
            if (res.status === 500 && /Database not configured|Missing:\s*DB_|not configured/i.test(_body500)) {
              throw new Error('Базата данни не е конфигурирана (липсва database/.env с DB_NAME/DB_USER/DB_PASS). Моля, конфигурирайте сървъра.');
            }
            const transient=res.status===408||res.status===425||res.status===429||res.status===500||res.status===502||res.status===503||res.status===504;
            if(transient&&attempt<retries){
              // v12.17.2: Exponential backoff with jitter (instead of linear)
              // Delays: 1s + jitter → 2s + jitter → 4s + jitter → 8s + jitter
              // This prevents thundering herd when services recover.
              const baseDelay=Math.pow(2,attempt)*1000;
              const jitter=Math.floor(Math.random()*baseDelay*0.5);
              await wait(baseDelay+jitter);
              continue;
            }
            throw new Error(_statusSpecificHint);
            }
            // Reuse the body we already read for the DB-config check (res.text() is
            // single-use); fall back to a fresh read only if it wasn't consumed yet.
            const text = (_body500 !== '' || res.status !== 500) ? _body500 : await res.text();
            if(/^\s*<!doctype html|^\s*<html/i.test(text)){
            const lower=text.toLowerCase();
            const deployHint=(lower.includes('404')||lower.includes('страницата не е намерена')||lower.includes('page not found')||lower.includes('error 411')||lower.includes('google'))
                ?'GAS_URL сочи към невалиден или недостъпен Google Apps Script deployment (404). Обновете /exec URL и преразгърнете Web App.'
                :(lower.includes('500')||lower.includes('internal server'))
                  ?'GAS върна 500 грешка. Проверете GAS execution log-а за синтактични грешки или изтекъл 30-секунден лимит.'
                  :'Сървърът върна HTML страница вместо JSON. Проверете GAS_URL и правата на деплоя.';
            throw new Error(deployHint);
            }
            try{json=JSON.parse(text)}catch(_){
              // Detect known GAS deployment issues and surface actionable hints.
              var hint='';
              if(/Missing Index\.html/i.test(text))hint=' — GAS проектът няма HTML файл. Качете index.html в Apps Script редактора и преразгърнете.';
              else if(/Script function not found/i.test(text))hint=' — doPost функцията не е намерена. Проверете дали gas.js е запазен и публикуван.';
              else if(/Authorization is required/i.test(text))hint=' — Скриптът изисква оторизация. Отворете GAS редактора и дайте права.';
              else if(/404|Not Found|Page not found/i.test(text))hint=' — GAS URL не е намерен (404). Обновете /exec адреса.';
              else if(/500|Server Error|Internal Server Error/i.test(text))hint=' — GAS върна 500 грешка. Прегледайте execution log-а в GAS редактора.';
              throw new Error('Невалиден отговор от сървъра'+(hint||': '+text.slice(0,120)));
            }
        }catch(fetchErr){
            clearTimeout(timer);
            // v12.27.1-degraded: GAS unreachable — return graceful empty result
            // for reads (avoids "Failed to fetch" breaking the UI). Writes still
            // throw so the caller knows the mutation didn't go through.
            // v12.27.8-httpstatus: Differentiate between 404 (config issue —
            // don't mark GAS as down, it's a wrong URL) and 5xx/network error
            // (real backend issue — mark as down with recovery window).
            var _isGAS404 = fetchErr && fetchErr.message && (
              fetchErr.message.indexOf('HTTP 404') >= 0 ||
              fetchErr.message.indexOf('404 —') >= 0 ||
              fetchErr.message.indexOf('не е намерен (404)') >= 0
            );
            if (isRead) {
                // v12.32.X: Suppress console.warn for GAS unreachable on
                // read-only operations. Return degraded data silently so
                // the UI stays functional without flooding the console.
                return { success: true, _degraded: true, _error: _isGAS404
                    ? 'GAS URL не е намерен (404). Свържете се с администратор за актуален /exec адрес.'
                    : 'GAS недостъпен — показване на кеширани данни.',
                    forms: [], competitions: [], reviewers: [], projects: [], documents: [], reports: [], expenses: [] };
            }
            // v12.27.5-writegraceful: Return {success:false} for writes too
            // instead of throwing. Callers handle the error field gracefully.
            // v12.32.X: Suppress console.warn for GAS unreachable on
            // write operations. Return the error object silently so
            // the UI shows an inline toast instead of console noise.
            if (typeof _gasReachable === 'undefined' || _gasReachable !== false) {
                _gasReachable = false;
                try { window.dispatchEvent(new CustomEvent('erp:connectivity-change', { detail: { gasReachable: false, phpReachable: true } })); } catch(_) {}
            }
            return { success: false, _degraded: true, error: 'Няма връзка със сървъра. Проверете интернет връзката и опитайте отново.' };
        }
        }
        if(json&&json.success===false){
        // ── 2FA pass-through: OTP challenge responses carry require2fa=true
        //     and must be returned to the caller AS-IS so the modal can show
        //     the verification UI.  Do NOT throw them as errors.
        if(json.require2fa||json.twoFactor){
          _captureServerDataVersions(json);
          return json;
        }
        const m=String(json.error||'Сървърна грешка');
        if(/timeout|temporar|429|5\d\d/i.test(m)&&attempt<retries){
            // v12.17.2: Exponential backoff with jitter
            const baseDelay=Math.pow(2,attempt)*1000;
            const jitter=Math.floor(Math.random()*baseDelay*0.5);
            await wait(baseDelay+jitter);
            continue;
        }
        throw new Error(m)
        }
        // PERF: capture server-reported data versions (used by next call's _dv).
        _captureServerDataVersions(json);
        // v12.26.0-stable: GAS responded successfully → fire recovery if previously down.
        if (_gasReachable === false) {
            _gasReachable = true;
            _gasLastFailTs = 0;
            try { window.dispatchEvent(new CustomEvent('erp:connectivity-change', { detail: { gasReachable: true, phpReachable: true, degradedMode: false } })); } catch(_) {}
        }
        // v12.26.0-stable: Track GAS near-deadline warnings for adaptive backoff
        if (json && json._timing && json._timing.near_deadline) {
            _gasNearDeadlineCount = (_gasNearDeadlineCount || 0) + 1;
        } else {
            _gasNearDeadlineCount = 0;
        }
        // PERF: notModified short-circuit. The server confirmed our snapshot
        // is still current → return the existing cached value (and revive its
        // TTL so subsequent reads keep hitting the in-memory slot). If the
        // cache was somehow evicted between the request and this point, clear
        // the DV tracker and retry WITHOUT _dv — the notModified payload is
        // meaningless without cached real data and would silently blank the UI.
        if(isRead&&json&&json.notModified===true){
            const _hit=requestKey?readResponseCache.get(requestKey):null;
            if(_hit){
                _hit.ts=Date.now();
                _setReadCache(requestKey,_hit);
                const _elapsed=performance&&typeof performance.now==='function'?performance.now()-_reqStartTime:0;
                _captureApiMetrics(action,_elapsed,true,true,0);
                return _hit.value;
            }
            // No prior cache → notModified is a lie.  Wipe the version tracker
            // so the immediate retry sends NO _dv, forcing a full response.
            // Must also clear the inflight dedup lock so the retry call doesn't
            // deadlock by returning this same still-running promise.
            _lastServerDataVersions=null;
            if(requestKey)_deleteInflight(requestKey);
            return api(action,data,retries);
        }
        if(isRead&&ttlMs>0){
        _setReadCache(requestKey,{ts:Date.now(),value:json});
        _persistEntry(requestKey,json);
        }else if(!isRead){
        // Targeted invalidation: only clear caches affected by this write action.
        // O(matched) thanks to _actionKeys + _persistedKeys indexes.
        const toInvalidate=WRITE_INVALIDATES[normalizedAction];
        if(toInvalidate){
            for(const a of toInvalidate){
                const set=_actionKeys.get(a);
                if(set&&set.size){
                    for(const k of[...set]){readResponseCache.delete(k);inflightReadRequests.delete(k);}
                    _actionKeys.delete(a);
                }
                _unpersistByPrefix(a+'::');
            }
        }else if(readResponseCache.size){
            // Unknown write action — safe fallback: clear everything
            clearApiCache();
        }
        }
        const _elapsed=performance&&typeof performance.now==='function'?performance.now()-_reqStartTime:0;
        const _backendMs=json&&json._timing&&json._timing.total_ms?json._timing.total_ms:0;
        _captureApiMetrics(action,_elapsed,true,false,_backendMs);
        return json;
    }catch(err){
        const isAbort=err&&err.name==='AbortError';
        const msg=isAbort?'Заявката отне твърде дълго (timeout)':(err&&err.message?err.message:'API грешка');
        const retriable=isAbort||/Failed to fetch|NetworkError|Load failed|timeout|temporar|429|5\d\d/i.test(msg);
        if(attempt<retries&&retriable){
            // v9.44.0-timeout-fix: AbortError means the request was in-flight
            // for the full timeout window — the GAS isolate is likely still
            // processing (or just finished). Retry quickly with a short jitter
            // so the retry lands while the isolate is still warm.
            // Regular network errors use the original exponential backoff.
            const retryWait=isAbort?200+Math.floor(Math.random()*150):700*(attempt+1)+Math.floor(Math.random()*350);
            await wait(retryWait);
            continue;
        }
        throw new Error(msg);
    }
    }
})();

// v12.18.0: Write dedup — register in-flight write promise
if(_writeDedupKey){_inflightWrites.set(_writeDedupKey,reqPromise);}

// v12.18.0: Priority queue integration — route low-priority reads through queue
// Priority 1-2 (auth, dashboard) execute immediately for fastest TTI.
// Priority 3-4 (background, analytics) are deferred behind critical ops.
const _actionPriority=_getActionPriority(normalizedAction);
const _useQueue=isRead&&_actionPriority>=3&&!bypassCache;

if(_useQueue){
  // Wrap in priority queue to avoid starving critical requests
  const _queueResult=new Promise((resolve,reject)=>{
    _priorityQueue.stats.totalDeferred++;
    prioritizeRequest(_actionPriority,normalizedAction,async()=>{
      try{
        const _res=await reqPromise;
        resolve(_res);
      }catch(e){reject(e);}
    });
  });
  _setInflight(requestKey,_queueResult);
  _bumpActivity(normalizedAction);
  try{return await _queueResult}catch(err){
    const _elapsed=performance&&typeof performance.now==='function'?performance.now()-_reqStartTime:0;
    _captureApiMetrics(action,_elapsed,false,false,0);
    throw err;
  }finally{
    _deleteInflight(requestKey);
    _dropActivity(normalizedAction);
    if(_writeDedupKey)_inflightWrites.delete(_writeDedupKey);
  }
}

if(isRead){
    _setInflight(requestKey,reqPromise);
    _bumpActivity(normalizedAction);
    try{return await reqPromise}catch(err){
        const _elapsed=performance&&typeof performance.now==='function'?performance.now()-_reqStartTime:0;
        _captureApiMetrics(action,_elapsed,false,false,0);
        throw err;
    }finally{
      _deleteInflight(requestKey);
      _dropActivity(normalizedAction);
      if(_writeDedupKey)_inflightWrites.delete(_writeDedupKey);
    }
}
// Writes also bump the global activity tracker so the top-of-viewport
// progress bar fires for create/update/delete round-trips, not just reads.
// Without this, mutating actions felt sluggish — UI gave no feedback during
// the round-trip and only updated when the optimistic patch + response landed.
_bumpActivity(normalizedAction);
return reqPromise.catch(err=>{
    const _elapsed=performance&&typeof performance.now==='function'?performance.now()-_reqStartTime:0;
    _captureApiMetrics(action,_elapsed,false,false,0);
    throw err;
}).finally(()=>{
  _dropActivity(normalizedAction);
  if(_writeDedupKey)_inflightWrites.delete(_writeDedupKey);
});
};

/** mutateOptimistic (v8.1.0-ui) — fire-and-forget mutation with instant UI rollback.
 *  Usage:
 *    await mutateOptimistic(
 *      ()=>api('updateForm',payload),          // async mutation
 *      { onSuccess:(res)=>refresh(),            // called on success
 *        onError:(err)=>toast(err.message,'error'), // called on failure
 *        successMsg:'Запазено',                 // toast on success
 *        errorMsg:'Грешка при запис' }         // toast on error (default)
 *    );
 *  Returns the api result (throws on failure so callers can catch).
 */
var mutateOptimistic=async(asyncFn,opts={})=>{
  const {onSuccess,onError,successMsg,errorMsg}=opts;
  try{
    const res=await asyncFn();
    if(res&&res.success===false){
      const msg=errorMsg||(res.error||'Действието не успя.');
      if(typeof toast==='function')toast(msg,'error',6000);
      if(typeof onError==='function')try{onError(new Error(msg))}catch(_){}
      throw new Error(msg);
    }
    if(successMsg&&typeof toast==='function')toast(successMsg,'success');
    if(typeof onSuccess==='function')try{onSuccess(res)}catch(_){}
    return res;
  }catch(err){
    if(err&&err.message&&err.message!==(errorMsg||'')){
      const msg=errorMsg||err.message||'Грешка';
      if(typeof toast==='function')toast(msg,'error',6000);
    }
    if(typeof onError==='function')try{onError(err)}catch(_){}
    throw err;
  }
};

/** Prefetch critical data in a SINGLE round-trip during login (getinitialdata returns
 *  forms + competitions + documents in one GAS execution — avoids 3 separate cold-starts).
 *  Also pre-warms the projects cache so Dashboard/Reporting tabs paint instantly. */
var _prefetchPromises=new Map();

/** Consume server-preloaded state (injected by scripts/prerender.js or server.js).
 *  Seeds the SWR cache and COMPETITIONS global so the first render already has data.
 *  Returns the parsed preloaded state or null if unavailable/stale. */
var _PRELOADED_TTL=5*60*1000; // 5 minutes — matches server.js CACHE_TTL_MS
var consumePreloadedState=()=>{
    try{
        var ps=window.__PRELOADED_STATE__;
        if(!ps||typeof ps!=='object'||ps.v!==1)return null;
        var age=Date.now()-ps.ts;
        if(age>_PRELOADED_TTL)return null; // stale — let the app fetch fresh data
        // Seed the COMPETITIONS global so React renders immediately with data.
        // The competition view effects will detect non-empty COMPETITIONS and
        // skip the initial API call, then do a silent background refresh.
        if(Array.isArray(ps.competitions)&&ps.competitions.length>0){
            COMPETITIONS=ps.competitions;
            // Seed SWR read-cache so isCacheFresh() returns true on cold start.
            // Request keys are opaque (body-hash-based), so we plant fresh
            // cache entries keyed by a well-known marker that lookup functions
            // will match. The shape mirrors api()'s cache-write path.
            var now=Date.now();
            var entry={ts:now,value:{success:true,competitions:ps.competitions}};
            var pk='getpubliccompetitions', pk2='getcompetitions';
            try{_setReadCache('ssr:'+pk,entry);_actionKeys.has(pk)||_actionKeys.set(pk,new Set());_actionKeys.get(pk).add('ssr:'+pk)}catch(_){}
            try{_setReadCache('ssr:'+pk2,{ts:now,value:{success:true,data:{competitions:ps.competitions}}});_actionKeys.has(pk2)||_actionKeys.set(pk2,new Set());_actionKeys.get(pk2).add('ssr:'+pk2)}catch(_){}
        }
        return ps;
    }catch(_){return null}
};

/** Query the Service Worker for current ISG data freshness.
 *  Returns a promise that resolves to {isg:bool, ts:number, count:number, age:number|null}
 *  or {isg:false} if ISG is not available (no SW, no data yet, etc.).
 *  Use this to show "Data refreshed X minutes ago" indicators. */
var getISGStatus=()=>{
    return new Promise((resolve)=>{
        if(!('serviceWorker' in navigator)||!navigator.serviceWorker.controller){
            resolve({isg:false});return;
        }
        var timeout=setTimeout(()=>resolve({isg:false}),3000);
        var handler=function(ev){
            if(ev.data&&ev.data.type==='ISG_STATUS_REPLY'){
                clearTimeout(timeout);
                navigator.serviceWorker.removeEventListener('message',handler);
                resolve(ev.data.data||{isg:false});
            }
        };
        navigator.serviceWorker.addEventListener('message',handler);
        try{navigator.serviceWorker.controller.postMessage({type:'ISG_STATUS'})}catch(_){
            clearTimeout(timeout);
            navigator.serviceWorker.removeEventListener('message',handler);
            resolve({isg:false});
        }
    });
};

/* ─── PAGINATION HELPERS (v12.18.0) ────────────────────────────────────
 * Lazy-load additional forms/competitions after the initial lean bundle.
 * Uses the server-side loadMoreForms / loadMoreCompetitions endpoints.
 *
 * Usage:
 *   const {data, hasMore} = await loadMoreForms(20, 20);
 *   // offset=20, limit=20 → second page
 */
var loadMoreForms = async (offset = 0, limit = 20, extraData = {}) => {
  const res = await api('loadMoreForms', { offset, limit, ...extraData });
  if (!res || !res.success) throw new Error(res && res.error ? res.error : 'loadMoreForms failed');
  return { data: res.data || [], total: res.total || 0, hasMore: !!res.hasMore, offset: res.offset, limit: res.limit };
};

var loadMoreCompetitions = async (offset = 0, limit = 10, extraData = {}) => {
  const res = await api('loadMoreCompetitions', { offset, limit, ...extraData });
  if (!res || !res.success) throw new Error(res && res.error ? res.error : 'loadMoreCompetitions failed');
  return { data: res.data || [], total: res.total || 0, hasMore: !!res.hasMore, offset: res.offset, limit: res.limit };
};

/* ─── METRICS DASHBOARD (v12.18.0) ────────────────────────────────────
 * Fetches aggregated system health for the admin panel.
 * Returns { success, metrics: { version, sheets, mysql, cache, errors } }
 * Safe for frequent polling (lightweight, read-only).
 */
var getMetricsDashboard = async (extraData = {}) => {
  return api('getMetricsDashboard', extraData);
};

/* ─── BATCH API HELPER (v12.17.2, enhanced v12.18.0) ──────────────────
 * Combines multiple independent read requests into a single API call.
 * Reduces round-trips on initial page load from 3-5 requests → 1 batched call.
 *
 * v12.18.0: Added automatic dedup of identical requests within the batch.
 * 
 * Usage:
 *   const [forms, competitions, projects] = await batchApi([
 *     { action: 'getforms', data: {} },
 *     { action: 'getcompetitions', data: {} },
 *     { action: 'getprojects', data: {} }
 *   ]);
 * 
 * Returns: Array of responses in the same order as requests.
 * Errors: If batch fails or any sub-request fails, throws or returns error objects.
 */
var batchApi = async (requests) => {
  if (!Array.isArray(requests) || !requests.length) {
    throw new Error('batchApi: requests must be a non-empty array');
  }

  // v12.18.0: Deduplicate identical requests within the batch
  // Key = action + JSON.stringify(data) — only keep the first occurrence
  const _seenKeys = new Set();
  const _dedupedRequests = [];
  for (const r of requests) {
    const _key = r.action + '::' + JSON.stringify(r.data || {});
    if (_seenKeys.has(_key)) continue; // Skip duplicate
    _seenKeys.add(_key);
    _dedupedRequests.push(r);
  }
  const _dedupCount = requests.length - _dedupedRequests.length;
  if (_dedupCount > 0) {
    console.debug(`batchApi: deduplicated ${_dedupCount} identical request(s)`);
  }
  const _effectiveRequests = _dedupedRequests;

  // v12.17.3: Try PHP batch endpoint first (fastest — no GAS cold start)
  var phpUrl = (typeof window._PHP_API_URL !== 'undefined') ? window._PHP_API_URL : null;
  if (phpUrl) {
    try {
      var phpResp = await fetch(phpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batchapi',
          requests: _effectiveRequests
        }),
        signal: AbortSignal.timeout(8000)
      });
      if (phpResp.ok) {
        var phpJson = await phpResp.json();
        if (phpJson && phpJson.success && Array.isArray(phpJson.results)) {
          return phpJson.results;
        }
      }
    } catch (_) { /* Fall through to GAS */ }
  }

  // Try GAS batch endpoint
  try {
    const batchPayload = { action: 'batchapi', requests: _effectiveRequests.map(r => ({ action: r.action, ...(r.data || {}) })) };
    const result = await api(batchPayload.action, batchPayload);
    if (result && result.success && Array.isArray(result.results)) {
      return result.results;
    }
    if (result && result.success && Array.isArray(result.responses)) {
      return result.responses;
    }
  } catch (e) {
    console.warn('batchApi fallback to sequential:', e.message);
  }

  // Final fallback: parallel sequential calls
  return Promise.all(
    _effectiveRequests.map(req =>
      api(req.action, req.data || {})
        .catch(err => ({ success: false, error: err.message }))
    )
  );
};

var prefetchCriticalData=(authCtx={})=>{
    const isAdmin=!!(authCtx&&authCtx.isAdmin);
    const userId=(authCtx&&authCtx.userId)||'';
    // Only fire once per login sequence
    if(_prefetchPromises.has('competitions')||_prefetchPromises.has('forms'))return;
    // v12.26.0: Check localStorage cache first — skip network if fresh data exists
    var _skipNetwork = false;
    try {
        if (typeof ERP_DATA !== 'undefined' && ERP_DATA.cacheGet) {
            var _cInit = ERP_DATA.cacheGet('getinitialdata', {userId:userId,isAdmin:isAdmin,lean:true,skipDocuments:true});
            if (_cInit && _cInit.data && _cInit.data.success) {
                _prefetchPromises.set('competitions', Promise.resolve(_cInit.data.competitions || null));
                if (userId) _prefetchPromises.set('forms', Promise.resolve(_cInit.data.forms || null));
                _skipNetwork = true;
            }
        }
    } catch(_) {}
    if (_skipNetwork) return;
    const payload={userId,isAdmin,lean:true,skipDocuments:true,...(_adminCreds||{})};
    const masterP=api('getinitialdata',payload).catch(()=>null);
    // Split the single response into individual prefetch slots.
    // Documents are intentionally skipped on cold start (Drive scan is the
    // slowest sub-call) — DocumentsView fetches them on first mount instead.
    _prefetchPromises.set('competitions',masterP.then(r=>r&&r.competitions?r.competitions:null).catch(()=>null));
    if(userId)_prefetchPromises.set('forms',masterP.then(r=>r&&r.forms?r.forms:null).catch(()=>null));
    // PERF: Stagger secondary GAS calls 1.5 s after getinitialdata to avoid
    // simultaneous cold-start contention (each GAS invocation needs its own
    // V8 instance; firing 3–4 at once competes for quota and slows all of them).
    // getinitialdata is the critical path — it gets the first warm instance.
    // Secondary prefetches arrive when getinitialdata is already executing or
    // done, so warm/re-used instances handle them without stalling login TTI.
    setTimeout(function(){
        // Pre-warm projects cache for instant Dashboard/Reporting tab paint.
        if(userId){
            const projP=api('getprojects',{userId,isAdmin,lean:true,...(_adminCreds||{})}).catch(()=>null);
            _prefetchPromises.set('projects',projP);
        }
        // Admin-only: pre-warm reviewers list so the Reviewers / Competitions tabs
        // paint instantly without a separate cold-start GAS execution.
        if(isAdmin&&userId){
            const revP=api('getreviewers',{userId,isAdmin,...(_adminCreds||{})}).catch(()=>null);
            _prefetchPromises.set('reviewers',revP);
        }
    },1500);
    // Reviewer assignments: keep near-simultaneous so handleLogin (which runs
    // ~80 ms after this) can consume it via consumePrefetch without waiting.
    // If not yet resolved, handleLogin awaits it — still saves a serial call.
    if(userId){
        const raP=api('getreviewerforms',{reviewerEmail:userId}).catch(()=>null);
        _prefetchPromises.set('revassign',raP);
    }
};
/** Consume a prefetched promise (returns cached result or null) */
var consumePrefetch=async(key)=>{
    const p=_prefetchPromises.get(key);
    if(!p)return null;
    _prefetchPromises.delete(key);
    return p;
};

var createCompetitionWithFallback=async(payload={})=>{
if(!payload.username&&!payload.userId&&!_adminCreds){
    throw new Error('Необходим е администраторски вход за създаване на конкурс. Моля, влезте отново.');
}
try{return await api('createcompetition',payload)}
catch(err){
    const msg=String((err&&err.message)||'');
    if(/Unknown action/i.test(msg))throw new Error('Бекендът не разпознава действието createcompetition. Моля, преразгърнете (redeploy) GAS уеб приложението с актуалния код.');
    if(/Отказан достъп|access denied|unauthorized/i.test(msg))throw new Error('Нямате права за създаване на конкурс. Моля, влезте като администратор.');
    throw err;
}
};


var competitionListSignature=list=>(Array.isArray(list)?list:[]).map(c=>[String(c.id||''),String(c.name||''),String(c.deadline||c.dateEnd||''),String(c.status||''),String(c.created||''),String(c.description||'').slice(0,60)].join('|')).join(';;');
// formsSignature: includes EVERY mutable field whose change must trigger a
// React re-render. Previously this only covered status/title/dates/counts,
// which silently dropped reviewer scores, evaluations, contract IDs, return
// comments and admin signatures from the UI — even when the SWR cache had
// correctly fetched the fresh payload. Cost: admin "Предложения" tab and
// applicant "Моите проектни предложения" tab showed stale data after
// reviews/scoring/contracting until a hard reload.
var formsSignature=list=>(Array.isArray(list)?list:[]).map(f=>{
    const ev=f.evaluation||f.Evaluation||null;
    var evSig='0';if(ev&&typeof ev==='object'){try{evSig=String(Object.keys(ev).length)+':'+String(JSON.stringify(ev).length)}catch(_){evSig='circular'}}
    const rev=f.reviewers||f.Reviewers||[];
    const revSig=Array.isArray(rev)?String(rev.length)+':'+rev.map(r=>(r&&(r.email||r.Email||''))+':'+(r&&(r.status||r.Status||''))+':'+(r&&(r.score!=null?r.score:''))).join(','):'0';
    return [
        String(getId(f)||''),
        String(getStatus(f)||''),
        String(getTitle(f)||''),
        String(getDescription(f)||'').slice(0,80),
        String(getArea(f)||''),
        String(getSubmitted(f)||''),
        String(getCreated(f)||''),
        String((f.attachedDocs||f.AttachedDocs||[]).length),
        String((f.history||f.History||[]).length),
        String((f.fileIds||f.FileIds||[]).length),
        String(Number(f.score||f.Score||0)),
        String(f.rank||f.Rank||''),
        String(f.contractId||f.ContractId||''),
        String(getReturnComment(f)||'').slice(0,120),
        String(f.signature?1:0),
        String(f.signatureAdmin||f.SignatureAdmin?1:0),
        String((f.teamMembers||f.TeamMembers||[]).length),
        String(Number(f.budget||f.Budget||0)),
        String(Number(f.durationMonths||f.DurationMonths||0)),
        String(f.projectCode||f.ProjectCode||''),
        evSig,
        revSig
    ].join('|');
}).join(';;');
var eventsSignature=list=>(Array.isArray(list)?list:[]).map(ev=>[String(ev.id||''),String(ev.date||''),String(ev.type||''),String(ev.status||''),String(ev.competitionId||'')].join('|')).join(';;');

/* ─── REFRESH COMPETITIONS FROM API ─── */
var refreshCompetitions=async(authCtx={},opts={})=>{
try{
    const isAdminCtx=!!(authCtx&&authCtx.isAdmin);
    const userId=(authCtx&&authCtx.userId)||'';
    const forceRefresh=!!(opts&&opts.forceRefresh);
    const payload=isAdminCtx
    ?{isAdmin:true,userId,forceRefresh,...(authCtx.username?{username:authCtx.username,password:authCtx.password}:{})}
    :{activeOnly:true,forceRefresh,userId};
    // Single primary endpoint per role; fallback only on failure
    const primary=isAdminCtx?'getcompetitions':'getpubliccompetitions';
    const fallback=isAdminCtx?'getcompetitionsfeed':'getcompetitions';
    let comps=null;
    try{
        const res=await api(primary,payload);
        if(res&&res.success!==false){const list=res.data?.competitions??res.competitions;if(Array.isArray(list))comps=list}
    }catch(_){}
    if(comps===null){
    try{const res=await api(fallback,payload);if(res&&res.success!==false){const list=res.data?.competitions??res.competitions;if(Array.isArray(list))comps=list}}catch(_){}
    }
    if(comps===null)return COMPETITIONS;
    const mapped=comps.map(c=>({id:c.id||'',name:c.name||'',dateEnd:c.dateEnd||c.deadline||'',deadline:c.deadline||c.dateEnd||'',status:c.status||'',created:c.created||'',description:c.description||'',folderId:c.folderId||''}));
    if(competitionListSignature(mapped)!==competitionListSignature(COMPETITIONS))COMPETITIONS=mapped;
    return COMPETITIONS;
}catch(_){
    return COMPETITIONS;
}
};

/* ─── AUDIT EXPORT HELPER ─── */
var exportAuditJSON = async (filters = {}, options = {}) => {
const clearAfterExport = options.clearAfterExport !== false;
const res = await api('exportAudit', { ...(_adminCreds||{}), isAdmin: true, clearAfterExport, ...filters });
const audit = res.data?.audit || res.audit;
if (!audit) throw new Error('Невалиден отговор от сървъра');
const json = JSON.stringify(audit, null, 2);
const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
const url = URL.createObjectURL(blob);
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
const a = document.createElement('a');
a.href = url;
a.download = `audit_export_${stamp}.json`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
clearApiCache();
return {
    summary: audit.meta?.summary || {},
    cleanup: res.data?.cleanup || res.cleanup || audit.meta?.cleanupAfterExport || null
};
};

/* ─── FULL CSV EXPORT HELPER (v6.10.0) ──────────────────────────────
 * Mirrors exportAuditJSON line-for-line.  Calls backend exportAllDataCSV,
 * assembles a single multi-sheet CSV with # comment separators, triggers
 * an <a> download identically to the JSON path.
 *
 * The CSV uses RFC 4180 dialect with UTF-8 BOM — compatible with
 * PostgreSQL COPY, Supabase Table Import, and Microsoft Excel.
 *
 * Returns { summary, totalRows, exportedAt } on success.
 * Throws on error (caught by caller → toast). */
var exportAllDataCSV = async (options = {}) => {
const res = await api('exportAllDataCSV', Object.assign(
    { isAdmin: true },
    _adminCreds || {}
));
const csvMap = (res && res.data && res.data.csv) || (res && res.csv) || null;
if (!csvMap || typeof csvMap !== 'object') {
    throw new Error((res && res.error) || 'Сървърът не върна CSV данни');
}

// ── Build multi-sheet CSV (one # === SHEET: name === block per sheet) ─
var lines = [];
var sheetNames = Object.keys(csvMap);

// Metadata header (commented lines — safe for PostgreSQL COPY with HEADER)
lines.push('# ERP Научни проекти – ИУ Варна  |  Пълен CSV експорт');
lines.push('# Дата: ' + ((res && res.exportedAt) || new Date().toISOString()));
lines.push('# Таблици: ' + sheetNames.join(', '));
lines.push('# Общо редове: ' + ((res && res.totalRows) || '—'));
lines.push('# Формат: RFC 4180 CSV (UTF-8 BOM)  |  Supabase / PostgreSQL съвместим');
lines.push('#');

sheetNames.forEach(function(sheetName) {
    var csvText = csvMap[sheetName];
    if (!csvText || typeof csvText !== 'string' || csvText.trim() === '') return;
    lines.push('# === SHEET: ' + sheetName + ' ===');
    // Split the backend CSV string into individual lines and push them
    var sheetLines = csvText.split(/\r?\n/);
    for (var i = 0; i < sheetLines.length; i++) {
        lines.push(sheetLines[i]);
    }
    lines.push(''); // blank separator between sheets
});

var fullCsv = lines.join('\n');

// ── Trigger browser download (IDENTICAL pattern to exportAuditJSON) ─
var blob = new Blob(['\uFEFF' + fullCsv], { type: 'text/csv;charset=utf-8' });
var url  = URL.createObjectURL(blob);
var now  = new Date();
var pad  = function(n) { return String(n).padStart(2, '0'); };
var stamp = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate()) +
            '_' + pad(now.getHours()) + pad(now.getMinutes());
var a = document.createElement('a');
a.href = url;
a.download = 'erp_full_export_' + stamp + '.csv';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
clearApiCache();  // same as JSON path

return {
    summary:    (res && res.summary) || {},
    totalRows:  (res && res.totalRows) || 0,
    exportedAt: (res && res.exportedAt) || ''
};
};

/* ─── MY DOCUMENTS API ─── */
/* Copy an official-docs-folder document into the caller's personal "My Documents" folder.
   formId: optional — when provided, stores in the per-form session folder
           instead of the root "My Documents" folder.
   Returns { success, file: { id, name, mimeType, typeLabel, previewLink, webViewLink, downloadUrl, size, sizeBytes, folderName, createdDate, modifiedDate } } */
var copyDocForUser=async(docId,formId)=>{
  if(!docId)return{success:false,error:'Липсва docId'};
  // v12.30.2-mydocs: include the signed-in user's identity. The PHP handler
  // handleCopyDocForUser REQUIRES userId/email to attribute the copy to the
  // caller's "Моите документи" folder — without it the copy is rejected with
  // "Missing docId/userId" and the document never appears in My Documents.
  var _email=(typeof _currentUserEmail!=='undefined'&&_currentUserEmail)||'';
  var payload={docId,userId:_email,email:_email};
  if(formId)payload.formId=String(formId).trim();
  return await api('copyDocForUser',payload);
};

/* List all files in the caller's personal "My Documents" folder.
   Admin can pass targetUserId to list another user's docs.
   Returns { success, documents: [...] } */
var listMyDocuments=async(forceRefresh=false,targetUserId=null)=>{
  // v19.0.0-authfix: Include current user email so PHP can resolve the caller.
  // Falls back to global _currentUserEmail which is set at login/session restore.
  var _email = (typeof _currentUserEmail !== 'undefined' && _currentUserEmail) || '';
  return await api('listMyDocuments',{forceRefresh,targetUserId,userId:_email});
};

/* Delete a file from the caller's personal "My Documents" folder.
   Returns { success, message } */
var deleteMyDocument=async docId=>{
  if(!docId)return{success:false,error:'Липсва docId'};
  return await api('deleteMyDocument',{docId});
};

/* Fetch the canonical template registry (from backend).
   Returns { success, templates: { ФНИ: [...], ПНИ: [...], ... } }
   Each template: { id, name, mime, resolved, fileId, foundAs } */
var getApplicationTemplates=async(withResolution=false)=>{
  return await api('getRequiredApplicationTemplates',{withResolution});
};

/* Upload local files to the caller's personal "My Documents" folder.
   files: array of {name, size, type, data} from readFileAsBase64.
   formId: optional — when provided, uploads into the per-proposal subfolder
           instead of the root "My Documents" folder.
   Returns { success, files: [...], skipped: [...], message } */
var uploadMyDocument=async(files,formId)=>{
  if(!Array.isArray(files)||!files.length)return{success:false,error:'Няма избрани файлове'};
  var payload={files};
  // v12.49.x-uploadfix: stamp the authenticated user so the PHP handler
  // (handleUploadMyDocument) can attribute + scope the upload. Without this the
  // backend returns "Missing userId" and the upload fails silently.
  var _upU=String(typeof _currentUserEmail!=='undefined'?_currentUserEmail:(typeof currentUser!=='undefined'&&currentUser&&currentUser.email?currentUser.email:'')||'').toLowerCase();
  if(_upU){payload.userId=_upU;payload.email=_upU;}
  if(formId)payload.formId=String(formId).trim();
  return await api('uploadMyDocument',payload);
};

/* ─── DOC VISUALS ─── */
var getDocVisuals=doc=>{
const tl=(doc.typeLabel||'').toLowerCase();
const mime=(doc.mimeType||'').toLowerCase();
if(tl==='pdf'||mime.includes('pdf'))return{cssClass:'pdf',icon:'fa-file-pdf',label:'PDF'};
if(tl.includes('excel')||tl.includes('sheet')||mime.includes('spreadsheet')||mime.includes('excel'))return{cssClass:mime.includes('google')?'gsheet':'xlsx',icon:'fa-file-excel',label:'Excel'};
if(tl.includes('word')||tl.includes('google doc')||mime.includes('document')||mime.includes('msword'))return{cssClass:mime.includes('google')?'gdoc':'docx',icon:'fa-file-word',label:'Word'};
if(tl.includes('powerpoint')||tl.includes('slides')||mime.includes('presentation')||mime.includes('powerpoint'))return{cssClass:mime.includes('google')?'gslides':'pptx',icon:'fa-file-powerpoint',label:'Slides'};
if(tl==='text'||tl==='csv'||mime.includes('text/'))return{cssClass:'txt',icon:'fa-file-alt',label:'Text'};
if(tl==='audio'||mime.includes('audio/')||mime.includes('mp3')||mime.includes('wav')||mime.includes('ogg')||mime.includes('m4a')||mime.includes('flac'))return{cssClass:'audio',icon:'fa-file-audio',label:'Audio'};
if(tl==='video'||mime.includes('video/')||mime.includes('mp4')||mime.includes('webm')||mime.includes('mov')||mime.includes('avi'))return{cssClass:'video',icon:'fa-file-video',label:'Video'};
if(mime.includes('form'))return{cssClass:'form',icon:'fa-wpforms',label:'Google Form'};
return{cssClass:'docx',icon:'fa-file',label:'Документ'};
};

/* ─── APPLICATION DOCUMENT GENERATION ───
   Generates a pre-filled document from a template in the official library.
   formId       – the application form ID
   docType      – key from REQUIRED_DOCUMENTS_BY_TYPE (e.g. 'fniteam', 'fnisections35')
   projectCode  – optional live projectCode (ФНИ/ПНИ/ДНП/НПФ). When supplied,
                  the backend uses it as authoritative and syncs the stored
                  draft row if it disagrees. This prevents the historical
                  'TBD' sentinel from blocking template resolution.
   Returns { success, message, file: { id, name, ... }, googleDocEditLink } */
var generateApplicationDocument=async(formId,docType,projectCode,extra)=>{
  if(!formId||!docType)return{success:false,error:'Липсва formId/docType'};
  const payload={formId,docType};
  if(projectCode)payload.projectCode=String(projectCode).trim().toUpperCase();
  // Pass optional live form data so placeholders are filled even before the draft is saved
  if(extra&&typeof extra==='object'){
    if(extra.title)payload.title=String(extra.title).trim();
    if(extra.titleEn)payload.titleEn=String(extra.titleEn).trim();
    if(extra.acronym)payload.acronym=String(extra.acronym).trim();
    if(extra.description)payload.description=String(extra.description).trim();
    if(extra.descriptionEn)payload.descriptionEn=String(extra.descriptionEn).trim();
    if(extra.objectives)payload.objectives=String(extra.objectives).trim();
    if(extra.expectedResults)payload.expectedResults=String(extra.expectedResults).trim();
    if(extra.area)payload.area=String(extra.area).trim();
    if(extra.professionalField)payload.professionalField=String(extra.professionalField).trim();
    if(extra.durationMonths)payload.durationMonths=Number(extra.durationMonths);
    if(extra.applicantName)payload.applicantName=String(extra.applicantName).trim();
    if(extra.teamMembers)payload.teamMembers=extra.teamMembers;
  }
  return await api('generateApplicationDocument',payload);
};

/* ─── BUDGET SPREADSHEET GENERATION (per project type) — v9.69.0 ───
   Copies the official budget table for the project type into the applicant's
   „Моите документи" folder and pre-fills the budget cells from the Step-3
   budget state. Mirrors generateApplicationDocument.
   formId       – optional application form ID (a draft is ensured client-side)
   projectCode  – ФНИ/ПНИ/ДНП/НПФ (from Step 1)
   budget       – the Step-3 budget object { groupId:{ year:amount }, ... }
   Returns { success, file, applicantFile, googleSheetEditLink, prefilled } */
var generateBudgetSpreadsheet=async(formId,projectCode,budget,extra)=>{
  const type=String(projectCode||'').trim().toUpperCase();
  if(!type)return{success:false,error:'Липсва тип проект'};
  const payload={projectType:type};
  if(formId)payload.formId=formId;
  if(budget&&typeof budget==='object')payload.budget=budget;
  // Pass optional metadata so the budget sheet is pre-populated with form fields
  if(extra&&typeof extra==='object'){
    if(extra.acronym)payload.acronym=String(extra.acronym).trim();
    if(extra.projectTitle)payload.projectTitle=String(extra.projectTitle).trim();
    if(extra.applicantName)payload.applicantName=String(extra.applicantName).trim();
  }
  return await api('generateBudgetSpreadsheet',payload);
};

/* Fetch the canonical template registry + live Drive resolution status,
   so the UI can grey out "Генерирай" buttons whose backing template is
   missing from the library. Cached for the session (templates rarely
   change mid-modal). */
var getRequiredApplicationTemplates=async(withResolution)=>{
  const payload={};
  if(withResolution)payload.withResolution=true;
  return await api('getRequiredApplicationTemplates',payload);
};

/* ════════════════════════════════════════════════════════════════════════
 * DEFENSIVE UTILITIES (v10.3.2-hardened)
 * Safe wrappers for common crash-prone operations. Every function below
 * silently degrades instead of throwing — critical for surviving backend
 * GAS bugs, malformed cached data, and quota-exceeded localStorage.
 * ════════════════════════════════════════════════════════════════════════ */

/* ─── REQUEST IDLE CALLBACK WRAPPER ───
 * Schedules fn via rIC when available, falls back to setTimeout.
 * opts.timeout: max ms before forced execution (default 2000).
 * opts.fallbackMs: fallback setTimeout delay (default 16ms = 1 frame). */
var _ric=(fn,opts)=>{
  if(typeof requestIdleCallback!=='undefined'){
    requestIdleCallback(fn,{timeout:(opts&&opts.timeout)||2000});
  }else{
    var delay=(opts&&opts.fallbackMs)||16;
    setTimeout(function(){fn({timeRemaining:function(){return 50;},didTimeout:false});},delay);
  }
};
try{window._ric=_ric;}catch(_){}

/* ─── RELATIVE TIME FORMATTER ───
 * Returns human-friendly Bulgarian relative time: "преди 2 мин.", "вчера".
 * Uses Intl.RelativeTimeFormat when available; FNV fallback otherwise. */
var _RTF_BG=(typeof Intl!=='undefined'&&typeof Intl.RelativeTimeFormat==='function')
  ?new Intl.RelativeTimeFormat('bg',{numeric:'auto'})
  :null;
var formatRelativeTime=(dateInput)=>{
  if(!dateInput)return'—';
  const d=new Date(dateInput);
  if(isNaN(d.getTime()))return'—';
  const ms=Date.now()-d.getTime();
  const secs=Math.abs(ms)/1000;
  if(_RTF_BG){
    if(secs<60)return _RTF_BG.format(-Math.round(secs),'second');
    if(secs<3600)return _RTF_BG.format(-Math.round(secs/60),'minute');
    if(secs<86400)return _RTF_BG.format(-Math.round(secs/3600),'hour');
    if(secs<604800)return _RTF_BG.format(-Math.round(secs/86400),'day');
    return _RTF_BG.format(-Math.round(secs/604800),'week');
  }
  if(secs<60)return'преди '+Math.max(1,Math.round(secs))+' с.';
  if(secs<3600)return'преди '+Math.round(secs/60)+' мин.';
  if(secs<86400)return'преди '+Math.round(secs/3600)+' ч.';
  return'преди '+Math.round(secs/86400)+' дни';
};
try{window.formatRelativeTime=formatRelativeTime;}catch(_){}

/* ─── MEMOIZE (single-arg, Map-backed) ─── */
var memoize=(fn)=>{const c=new Map();return function(k){if(c.has(k))return c.get(k);const v=fn.call(this,k);c.set(k,v);return v;};};

/* Safe function call — wraps fn() in try/catch, returns fallback on error.
   Logs once per key so repeated failures don't flood the console. */
var _safeCallLog={};
var safeCall=(fn,fallback,key)=>{
  try{return fn()}catch(e){
    if(key&&!_safeCallLog[key]){_safeCallLog[key]=true;console.warn('[safeCall:'+key+']',e&&e.message||e)}
    return arguments.length>1?fallback:null;
  }
};

/* Safe deep property access — obj?.a?.b?.c without the syntax support risk.
   Path is dot-separated: 'a.b.c'. Returns fallback if anything is null/undefined. */
var safeGet=(obj,path,fallback)=>{
  if(obj==null)return arguments.length>2?fallback:undefined;
  if(!path)return obj;
  var parts=String(path).split('.'),cur=obj;
  for(var i=0;i<parts.length;i++){
    if(cur==null)return arguments.length>2?fallback:undefined;
    cur=cur[parts[i]];
  }
  return cur!=null?cur:(arguments.length>2?fallback:undefined);
};

/* Safe localStorage read with JSON parse — never throws. */
var safeLSGet=(key,fallback)=>{
  try{var raw=(window._safeLS||localStorage).getItem(key);if(raw==null)return arguments.length>1?fallback:null;return JSON.parse(raw)}catch(_){return arguments.length>1?fallback:null}
};

/* Safe localStorage write with JSON stringify — never throws. */
var safeLSSet=(key,val)=>{
  try{(window._safeLS||localStorage).setItem(key,JSON.stringify(val))}catch(_){}
};

/* Debounce helper — returns a debounced version of fn.
   Leading edge fires immediately, trailing after `ms` of inactivity. */
var debounceAdv=(fn,ms)=>{
  var timer=0,lastArgs=null,lastThis=null;
  function flush(){timer=0;if(lastArgs){fn.apply(lastThis,lastArgs);lastArgs=null;lastThis=null;}}
  return function(){
    lastArgs=arguments;lastThis=this;
    if(!timer){fn.apply(this,arguments);timer=setTimeout(flush,ms)}
    else{clearTimeout(timer);timer=setTimeout(flush,ms)}
  };
};

/* Throttle helper with leading+trailing — fn fires at most once per `ms`. */
var throttleAdv=(fn,ms)=>{
  var last=0,timer=0;
  return function(){
    var now=Date.now(),ctx=this,args=arguments;
    if(now-last>=ms){last=now;fn.apply(ctx,args)}
    else if(!timer){timer=setTimeout(function(){timer=0;last=Date.now();fn.apply(ctx,args)},ms-(now-last))}
  };
};

/* ── Auto-save draft debouncer (used by form modals) ──
   Saves form draft to localStorage at most once per second.
   Used by ApplicantView / NewFormModal to persist in-progress edits. */
var autoSaveDraft=(key,data)=>{
  try{
    var payload={ts:Date.now(),data:data};
    (window._safeLS||localStorage).setItem(key,JSON.stringify(payload));
  }catch(_){/* quota exceeded — silently drop, the form save API is the real persistence */}
};

