/* ============================================================
 *  МОН REPORTING VIEW — BPMN Process 11 (Gap Closure 2026-05-04)
 *  Ministry of Education and Science institutional reporting.
 *  Roles: NIDD (creator/editor), Vice-Rector (finalize), Rector
 *  (sign+submit), Admin (full). Two-factor on submission.
 * ============================================================ */

var MON_REPORT_TYPES_UI = [
  {value:'semiannual',label:'Шестмесечен'},
  {value:'annual',label:'Годишен'},
  {value:'adhoc',label:'Извънреден'}
];

var _monLabel = (s)=> (typeof MON_STATUS_LABELS!=='undefined'&&MON_STATUS_LABELS[s])||s||'—';
var _monColor = (s)=> (typeof MON_STATUS_COLOR!=='undefined'&&MON_STATUS_COLOR[s])||'var(--ink-4)';
var _monTypeLabel = (t)=> (typeof MON_REPORT_TYPE_LABELS!=='undefined'&&MON_REPORT_TYPE_LABELS[t])||t||'—';

/* ── Cross-session SWR cache helpers ────────────────────────────────────────
 * The list view + detail modal both cache to storage so cold reloads paint
 * the last-known state instantly instead of flashing the skeleton. We use
 * localStorage (survives full browser restart) with a 24h TTL guard, and
 * fall back to sessionStorage only when localStorage is unavailable
 * (private mode / quota exhausted). Returns null on miss / expired / parse
 * error — callers always treat null as cache-miss. */
var MON_CACHE_TTL_MS = 24*60*60*1000;
var _monCacheGet = (key)=>{
  const parse = raw => {
    if(!raw) return null;
    try{
      const o=JSON.parse(raw);
      if(!o || typeof o!=='object') return null;
      if(typeof o.ts==='number' && (Date.now()-o.ts) > MON_CACHE_TTL_MS) return null;
      return o;
    }catch(_){ return null; }
  };
  try{ const v=parse(localStorage.getItem(key)); if(v) return v; }catch(_){}
  try{ return parse(sessionStorage.getItem(key)); }catch(_){ return null; }
};
var _monCacheSet = (key, payload)=>{
  const wrapped = JSON.stringify(Object.assign({ ts: Date.now() }, payload||{}));
  try{ localStorage.setItem(key, wrapped); return; }catch(_){}
  try{ sessionStorage.setItem(key, wrapped); }catch(_){}
};

var _MR_EUR_BGN = (typeof EUR_BGN !== 'undefined') ? EUR_BGN : 1.95583;
var _monFmtBgn = (n)=>{ var v=Number(n||0); if(!isFinite(v)) v=0; return (v/_MR_EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'; };
var _monFmtPct = (n)=>{ var v=Number(n||0); if(!isFinite(v)) v=0; return v.toFixed(2)+'%'; };

/* ──────────────────────────────────────────────────────────────────────────
 *  POPUP-BLOCKER WORKAROUND for МОН отчет преглед/експорт
 *
 *  Browsers count `window.open` as user-initiated only inside the synchronous
 *  click handler. The export flow does an `await api(...)` first (Apps Script
 *  needs ~1-3 s to materialize the file), so by the time we get the URL the
 *  user-gesture window has expired → Chrome/Firefox/Safari/Edge silently
 *  block the popup. The workaround chain is:
 *
 *    1) PRE-OPEN a placeholder window during the click (still inside the
 *       gesture). Show a themed "Подготвя файла…" splash so the user knows
 *       what is happening if they switch to that tab.
 *    2) When the URL arrives, navigate that pre-opened window via
 *       `popupWin.location.href = url` — this is NOT a new popup, just a
 *       navigation, so it's never blocked.
 *    3) If the placeholder failed (third-party cookies / strict popup
 *       blockers / iframe sandboxing), fall back to an in-page anchor with
 *       `target="_blank"` + `.click()`. Anchor-clicks are permitted in many
 *       contexts where `window.open` is not.
 *    4) If even that is blocked, surface a persistent toast with an "Отвори"
 *       action that navigates the current tab — a guaranteed last resort.
 * ─────────────────────────────────────────────────────────────────────── */
var _monPopupSplashHTML = (label)=>(
  '<!doctype html><html lang="bg"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<title>'+(label||'Подготовка на МОН отчет')+'…</title>'+
  '<style>'+
  ':root{color-scheme:light}'+
  'html,body{height:100%;margin:0;background:linear-gradient(180deg,#F4F6FB 0%,#E7ECF7 100%);'+
  'font-family:-apple-system,Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;color:#1B2C5C}'+
  '.wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:1rem}'+
  '.card{display:flex;flex-direction:column;align-items:center;gap:1.1rem;padding:2rem 2.4rem;'+
  'background:#fff;border-radius:14px;box-shadow:0 8px 28px rgba(27,44,92,.16);max-width:380px;text-align:center}'+
  '.spin{width:46px;height:46px;border:4px solid rgba(35,56,116,.18);border-top-color:#233874;'+
  'border-radius:50%;animation:r .85s linear infinite}'+
  '.t{font-size:1rem;font-weight:600;color:#233874}'+
  '.s{font-size:.82rem;color:#5b6b8e;line-height:1.5}'+
  '@keyframes r{to{transform:rotate(360deg)}}'+
  '</style></head><body><div class="wrap"><div class="card">'+
  '<div class="spin"></div>'+
  '<div class="t">Подготвя се МОН отчет…</div>'+
  '<div class="s">Файлът се генерира и автоматично ще се отвори в този раздел. Моля, не затваряйте прозореца.</div>'+
  '</div></div></body></html>'
);
/** Sync-open a splash window during the click event so popup blockers allow it. */
var _monPrepPopup = ()=>{
  let win=null;
  try{
    // No "noopener" — we need to be able to navigate it later.
    win = window.open('about:blank', '_blank');
  }catch(_){ win=null; }
  if(win){
    try{
      win.document.open();
      win.document.write(_monPopupSplashHTML());
      win.document.close();
    }catch(_){/* cross-origin or sandboxed — still usable for .location */}
  }
  return win;
};
/** Multi-stage open: navigate pre-opened window, else anchor-click, else toast. */
var _monOpenOrFallback = (popupWin, url)=>{
  if(!url) return false;
  // Stage 1 — navigate the pre-opened window (preferred, never blocked).
  if(popupWin && !popupWin.closed){
    try{ popupWin.location.href = url; popupWin.focus && popupWin.focus(); return true; }catch(_){}
  }
  // Stage 2 — fresh window.open (works only if still inside a gesture).
  try{
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if(w && !w.closed){ try{ w.focus(); }catch(_){}
      return true; }
  }catch(_){}
  // Stage 3 — synthetic anchor click (often allowed when popups aren't).
  try{
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.style.position='fixed'; a.style.left='-9999px';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ try{ a.remove(); }catch(_){}}, 0);
    return true;
  }catch(_){}
  // Stage 4 — last-resort persistent toast with a one-tap action.
  try{
    if(typeof toast==='function'){
      toast('Браузърът блокира изскачащия прозорец. Натиснете „Отвори", за да заредите файла.',
        'warn', 12000, { actionLabel:'Отвори', action:()=>{ try{ window.location.href = url; }catch(_){} } });
    }
  }catch(_){}
  return false;
};
/** Close the splash placeholder when the export failed or returned nothing. */
var _monClosePopup = (popupWin, reason)=>{
  if(!popupWin || popupWin.closed) return;
  try{
    if(reason){
      popupWin.document.open();
      popupWin.document.write(
        '<!doctype html><meta charset="utf-8"><title>Грешка</title>'+
        '<style>html,body{height:100%;margin:0;display:flex;align-items:center;justify-content:center;'+
        'font-family:-apple-system,Segoe UI,Arial;background:#FCE5E5;color:#7B0000;text-align:center;padding:1rem}</style>'+
        '<div><h3 style="margin:0 0 .5rem">Грешка при генериране</h3><p style="margin:0;font-size:.9rem">'+
        String(reason).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))+
        '</p><p style="margin:1rem 0 0;font-size:.78rem;color:#9c4444">Можете да затворите прозореца.</p></div>');
      popupWin.document.close();
      // Auto-close after 6 s so we don't leave an orphan tab.
      try{ setTimeout(()=>{ try{ popupWin.close(); }catch(_){}}, 6000); }catch(_){}
      return;
    }
    popupWin.close();
  }catch(_){}
};

var _monQuickExport = async (reportId, format)=>{
  // Step 1 (sync, inside the click gesture) — open the placeholder window.
  const popupWin = _monPrepPopup();
  try{
    const res=await api('exportmonreportfile',{...(_adminCreds||{}),reportId,format});
    if(!res||res.success===false){
      const msg=(res&&res.error)||'Грешка при експорт';
      _monClosePopup(popupWin, msg);
      toast(msg,'error'); return;
    }
    const url=res.url||res.fileUrl||(res.data&&res.data.url);
    if(url){
      _monOpenOrFallback(popupWin, url);
      toast('Файлът е готов.','success');
    } else {
      _monClosePopup(popupWin);
      toast('Файлът е създаден.','success');
    }
  }catch(err){
    _monClosePopup(popupWin, err && err.message);
    toast(err.message||'Грешка','error');
  }
};

var _monCanRole = (userRole,isAdmin,allowed)=>{
  if(isAdmin) return true;
  return allowed.indexOf(userRole)>=0;
};

var _monFmtDate = (iso)=>{
  if(!iso) return '—';
  try{ const d=new Date(iso); if(isNaN(d.getTime())) return iso;
    return (typeof fmtDateTime==='function')?fmtDateTime(d):(typeof formatBgDateTime==='function')?formatBgDateTime(d):d.toISOString().slice(0,16).replace('T',' ');
  }catch(_){return String(iso);}
};

/* ──────────────────────────────────────────────────────────── */
/*  CREATE MODAL  (ModalShell-based — perf: portal/ESC/focus-trap)*/
/* ──────────────────────────────────────────────────────────── */
var MONReportCreatorModal=({onClose,onCreated})=>{
  // ── Form model ───────────────────────────────────────────────────────────
  // The shape is driven entirely by `type`. Each type owns its own minimal
  // input set; `period`, `year`, `periodStart`, `periodEnd` are DERIVED on
  // every render so the four fields can never desync from each other.
  //   semiannual → year + half (H1/H2)              → "H1-2025" / "H2-2024"
  //   annual     → year                             → "2024"
  //   adhoc      → arbitrary start + end (date)     → "AdHoc-YYYY-MM-DD"
  // The user no longer types raw period codes — that field was the #1 source
  // of "невалиден период" backend rejections.
  const _now=new Date();
  const _curY=_now.getFullYear();
  const _defaultHalf = (_now.getMonth()<6) ? 'H2' : 'H1';
  const _defaultSemiYear = (_now.getMonth()<6) ? (_curY-1) : _curY;

  const[type,setType]=useState('semiannual');
  const[year,setYear]=useState(_defaultSemiYear);
  const[half,setHalf]=useState(_defaultHalf);                 // semiannual only
  const[adhocStart,setAdhocStart]=useState('');               // adhoc only
  const[adhocEnd,setAdhocEnd]=useState('');                   // adhoc only
  const[notes,setNotes]=useState('');
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState('');

  // Reset year when switching types so the picker lands on a sensible default.
  useEffect(()=>{
    if(type==='annual')         setYear(_curY-1);
    else if(type==='semiannual'){ setYear(_defaultSemiYear); setHalf(_defaultHalf); }
    /* adhoc keeps whatever year — derived from dates */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[type]);

  // Derived period/dates/year — single source of truth.
  const derived = useMemo(()=>{
    if(type==='annual'){
      const y=parseInt(year,10)||_curY;
      return { period:String(y), periodStart:y+'-01-01', periodEnd:y+'-12-31', year:y };
    }
    if(type==='semiannual'){
      const y=parseInt(year,10)||_curY;
      if(half==='H1') return { period:'H1-'+y, periodStart:y+'-01-01', periodEnd:y+'-06-30', year:y };
      return                  { period:'H2-'+y, periodStart:y+'-07-01', periodEnd:y+'-12-31', year:y };
    }
    // adhoc
    const s=adhocStart||''; const en=adhocEnd||'';
    const code = s ? ('AdHoc-'+s) : 'AdHoc-'+_now.toISOString().slice(0,10);
    const y = s ? (parseInt(s.slice(0,4),10)||_curY) : _curY;
    return { period:code, periodStart:s, periodEnd:en, year:y };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[type,year,half,adhocStart,adhocEnd]);

  // Live duplicate-check against the cached active bucket — no extra API call.
  // Saves a round-trip rejection round-trip for the most common UX failure.
  const duplicate = useMemo(()=>{
    const o=_monCacheGet('erp:monBuckets');
    const active=(o&&Array.isArray(o.active))?o.active:[];
    return active.find(r=>
      String(r.reportType||'').toLowerCase()===type
      && parseInt(r.year,10)===derived.year
      && String(r.period||'').trim()===derived.period
      && String(r.status||'').toLowerCase()!=='cancelled'
    )||null;
  },[type,derived]);

  // Client-side validation — surfaces issues before the round-trip.
  const validation = useMemo(()=>{
    if(type==='adhoc'){
      if(!adhocStart||!adhocEnd) return 'Изберете начална и крайна дата.';
      if(adhocStart>adhocEnd) return 'Крайната дата трябва да е след началната.';
    }
    const y=derived.year;
    if(!y||y<2000||y>(_curY+1)) return 'Невалидна година.';
    if(duplicate) return 'Вече съществува отчет за този период (статус: '+_monLabel(String(duplicate.status||'').toLowerCase())+').';
    return '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[type,adhocStart,adhocEnd,derived,duplicate]);

  const handleCreate=useCallback(async()=>{
    if(validation){ setError(validation); return; }
    setLoading(true); setError('');
    try{
      // Backend (v5.9.10+) defers heavy snapshot generation to a background
      // trigger and returns reportId in <1 s. UI stays responsive: we toast
      // immediately, navigate to the detail view, and the detail view's SWR
      // fetch will pick up the fully-materialised snapshot once the trigger
      // backfills it (1–3 s later).
      const res=await api('createmonreport',{
        ...(_adminCreds||{}),
        reportType:type,
        period:derived.period,
        periodStart:derived.periodStart,
        periodEnd:derived.periodEnd,
        year:derived.year,                // explicit — backend would otherwise default to current year
        notes:notes.trim()
      });
      if(!res||res.success===false){
        // Backend dedup is the last line of defence; surface its message verbatim.
        setError((res&&res.error)||'Грешка при създаване.');
        setLoading(false); return;
      }
      const msg = res.pending
        ? 'МОН отчетът е създаден — данните се обработват…'
        : 'МОН отчетът е създаден.';
      toast(msg,'success'); clearApiCache();
      // Backend (v5.9.10+) returns { success, reportId, id, pending, snapshot }.
      // We accept any of `id` / `reportId` and ALWAYS coerce to a primitive
      // string — this prevents the "[object Object]" regression where an
      // accidental object value leaked into the detail modal title and the
      // "Последни" pill row.
      const _payload = res.data || res || {};
      const _newId = (_payload.id !== undefined && _payload.id !== null) ? _payload.id
                   : (_payload.reportId !== undefined && _payload.reportId !== null) ? _payload.reportId
                   : '';
      const newIdStr = (typeof _newId === 'object') ? '' : String(_newId || '').trim();
      // Enrich payload with the derived metadata so list/detail can paint
      // immediately without waiting for the bucket refresh.
      onCreated && onCreated({
        ..._payload, id:newIdStr, reportId:newIdStr,
        reportType:type, period:derived.period, year:derived.year,
        periodStart:derived.periodStart, periodEnd:derived.periodEnd,
        notes:notes.trim(), status:'created'
      });
      onClose && onClose();
    }catch(err){ setError(err.message||'Сървърна грешка'); setLoading(false); }
  },[type,derived,notes,validation,onCreated,onClose]);

  const submitDisabled = loading || !!validation;
  const footer=e(Fragment,null,
    e('button',{type:'button',className:'btn btn-outline',onClick:onClose,disabled:loading},'Отказ'),
    e('button',{type:'button',className:'btn btn-primary',onClick:handleCreate,disabled:submitDisabled,title:validation||''},
      loading?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-plus'}),' ',loading?'Създаване…':'Създай отчет')
  );

  // Year options — last 6 years + current year (covers backfilled annual
  // reports without polluting the dropdown with ancient history).
  const yearOptions=[];
  for(let y=_curY; y>=_curY-6; y--) yearOptions.push(y);

  // Read-only "this report will cover" preview row — gives the user
  // confidence in the derived period before they click "Създай".
  const previewLine = type==='adhoc'
    ? (derived.periodStart && derived.periodEnd ? (derived.periodStart+' → '+derived.periodEnd) : '—')
    : (derived.period+'  ('+derived.periodStart+' → '+derived.periodEnd+')');

  return e(ModalShell,{open:true,onClose,title:'Нов МОН отчет',icon:'fas fa-building-columns',size:'default',footer,dismissable:!loading},
    error&&e('div',{style:{background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',padding:'.7rem',marginBottom:'.85rem',fontSize:'.78rem',color:'var(--err)'}},e('i',{className:'fas fa-exclamation-triangle'}),' ',error),
    !error && duplicate && e('div',{style:{background:'var(--warn-bg)',border:'1px solid var(--warn-border)',borderRadius:'var(--r-sm)',padding:'.7rem',marginBottom:'.85rem',fontSize:'.78rem',color:'var(--warn)'}},e('i',{className:'fas fa-circle-exclamation'}),' Вече съществува отчет за този период.'),
    e('div',{className:'detail-grid',style:{gap:'.85rem'}},
      e('div',{style:{gridColumn:'1 / -1'}},
        e('label',{className:'detail-label',htmlFor:'mon-type'},'Тип отчет'),
        e('select',{id:'mon-type',className:'form-select',value:type,onChange:ev=>setType(ev.target.value),disabled:loading,autoFocus:true},
          MON_REPORT_TYPES_UI.map(t=>e('option',{key:t.value,value:t.value},t.label)))
      ),
      // ── Type-specific inputs ────────────────────────────────────────────
      type!=='adhoc' && e('div',null,
        e('label',{className:'detail-label',htmlFor:'mon-year'},'Година'),
        e('select',{id:'mon-year',className:'form-select',value:year,onChange:ev=>setYear(parseInt(ev.target.value,10)),disabled:loading},
          yearOptions.map(y=>e('option',{key:y,value:y},String(y))))
      ),
      type==='semiannual' && e('div',null,
        e('label',{className:'detail-label',htmlFor:'mon-half'},'Полугодие'),
        e('select',{id:'mon-half',className:'form-select',value:half,onChange:ev=>setHalf(ev.target.value),disabled:loading},
          e('option',{value:'H1'},'H1 (януари–юни)'),
          e('option',{value:'H2'},'H2 (юли–декември)'))
      ),
      type==='adhoc' && e('div',null,
        e('label',{className:'detail-label',htmlFor:'mon-pstart'},'Период от'),
        e('input',{id:'mon-pstart',className:'form-input',type:'date',value:adhocStart,onChange:ev=>setAdhocStart(ev.target.value),disabled:loading,required:true})
      ),
      type==='adhoc' && e('div',null,
        e('label',{className:'detail-label',htmlFor:'mon-pend'},'Период до'),
        e('input',{id:'mon-pend',className:'form-input',type:'date',value:adhocEnd,onChange:ev=>setAdhocEnd(ev.target.value),disabled:loading,min:adhocStart||undefined,required:true})
      ),
      // ── Derived preview (read-only) ─────────────────────────────────────
      e('div',{style:{gridColumn:'1 / -1'}},
        e('label',{className:'detail-label'},'Покриван период'),
        e('div',{className:'form-input',style:{background:'var(--bg)',color:'var(--ink-2)',fontFamily:'var(--font-body)',cursor:'default',userSelect:'text'}},previewLine)
      ),
      e('div',{style:{gridColumn:'1 / -1'}},
        e('label',{className:'detail-label',htmlFor:'mon-notes'},'Бележки (по желание)'),
        e('textarea',{id:'mon-notes',className:'form-input',rows:3,value:notes,onChange:ev=>setNotes(ev.target.value),disabled:loading,maxLength:500,placeholder:'Кратко обяснение или контекст за отчета…'})
      )
    )
  );
};

/* ──────────────────────────────────────────────────────────── */
/*  DETAIL MODAL                                                */
/* ──────────────────────────────────────────────────────────── */
var MONReportDetailModal=({reportId,seed,user,isAdmin,userRole,onClose,onChanged})=>{
  // Persist last-used tab per session for ease of access.
  const[tab,setTab]=useState(()=>{ try{ return sessionStorage.getItem('erp:monDetailTab')||'overview'; }catch(_){ return 'overview'; } });
  useEffect(()=>{ try{ sessionStorage.setItem('erp:monDetailTab',tab); }catch(_){ } },[tab]);
  // SWR: hydrate instantly from cache (then from seed row from list), then refresh.
  const _cacheKey='erp:monReport:'+reportId;
  const _cached=_monCacheGet(_cacheKey);
  // Seed from list-row data so the modal can paint INSTANTLY with header,
  // status, period, totals — zero network wait. Slim getmonreport then refreshes
  // metadata, and editedData/history are loaded on-demand per tab.
  const _initialReport = _cached?.report || (seed ? {
    id:seed.id, reportType:seed.reportType, period:seed.period,
    periodStart:seed.periodStart, periodEnd:seed.periodEnd,
    year:seed.year, status:String(seed.status||'').toLowerCase(),
    createdBy:seed.createdBy, createdAt:seed.createdAt,
    submittedBy:seed.submittedBy, submittedAt:seed.submittedAt,
    submissionRef:seed.submissionRef, ministryRefNumber:seed.ministryRefNumber,
    ministryAckDate:seed.ministryAckDate, totals:seed.totals||{},
    notes:seed.notes||'', attachments:seed.attachments||[], _seeded:true
  } : null);
  const[report,setReport]=useState(_initialReport);
  const[history,setHistory]=useState(_cached?_cached.history||[]:[]);
  const[historyLoaded,setHistoryLoaded]=useState(!!(_cached&&_cached.history));
  const[snapshotLoaded,setSnapshotLoaded]=useState(!!(_cached&&_cached.report&&(_cached.report.editedData||_cached.report.dataSnapshot)));
  // `loading` only fires when we have NOTHING to display; with seed it's false.
  const[loading,setLoading]=useState(!_initialReport);
  const[refreshing,setRefreshing]=useState(false);   // background slim refresh
  const[loadingTab,setLoadingTab]=useState(false);   // per-tab lazy loader
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  const[notesEdit,setNotesEdit]=useState(_initialReport?(_initialReport.notes||''):'');
  const[returnReason,setReturnReason]=useState('');
  const[ackNumber,setAckNumber]=useState('');
  const[ackDate,setAckDate]=useState('');
  const[rejectReason,setRejectReason]=useState('');
  const[otpCtx,setOtpCtx]=useState(null);

  // Persist current state to storage cache.
  const _persist=useCallback((nextReport,nextHistory)=>{
    _monCacheSet(_cacheKey, {
      report: nextReport||report,
      history: nextHistory!==undefined ? nextHistory : history
    });
  },[_cacheKey,report,history]);

  // Slim metadata refresh — fast, no heavy JSON blobs.
  const reloadSlim=useCallback(async()=>{
    if(!_initialReport) setLoading(true); else setRefreshing(true);
    setError('');
    try{
      const res=await api('getmonreport',{...(_adminCreds||{}),reportId,slim:true});
      if(!res||res.success===false){ setError((res&&res.error)||'Грешка при зареждане.'); setLoading(false); setRefreshing(false); return; }
      const r=res.data||res.report||res;
      // Preserve previously-loaded heavy fields if the slim response omitted them.
      setReport(prev=>{
        const merged={...(prev||{}),...r,_seeded:false};
        if(prev&&prev.editedData&&!r.editedData) merged.editedData=prev.editedData;
        if(prev&&prev.dataSnapshot&&!r.dataSnapshot) merged.dataSnapshot=prev.dataSnapshot;
        _persist(merged);
        return merged;
      });
      setNotesEdit(r.notes||'');
    }catch(err){ setError(err.message||'Сървърна грешка'); }
    setLoading(false); setRefreshing(false);
  },[reportId,_initialReport,_persist]);

  // Lazy-load the heavy editedData / dataSnapshot JSON blobs (~Институционален отчет, Редакция).
  const loadSnapshot=useCallback(async(force)=>{
    if(snapshotLoaded&&!force) return;
    setLoadingTab(true);
    try{
      const res=await api('getmonreport',{...(_adminCreds||{}),reportId,include:['editedData','dataSnapshot']});
      if(res&&res.success!==false){
        const r=res.data||res.report||res;
        setReport(prev=>{
          const merged={...(prev||{}),editedData:r.editedData,dataSnapshot:r.dataSnapshot};
          _persist(merged);
          return merged;
        });
        setSnapshotLoaded(true);
      }
    }catch(_){ /* ignore — overview keeps working */ }
    setLoadingTab(false);
  },[reportId,snapshotLoaded,_persist]);

  // Background poll for newly-created reports whose snapshot is still being
  // backfilled by the server-side trigger (`_pending:true` placeholder).
  // Polls every 2 s up to 8 attempts (≈16 s) — abandons silently after that.
  // Once the real snapshot arrives, snapshotLoaded flips to true and any open
  // Институционален / Редакция tab re-renders with full data.
  useEffect(()=>{
    if(!report) return;
    const snap = report.dataSnapshot || report.editedData;
    if(!snap || !snap._pending) return;
    let attempts=0; let cancelled=false;
    setLoadingTab(true);
    const tick=async()=>{
      if(cancelled||attempts>=8){ if(!cancelled) setLoadingTab(false); return; }
      attempts++;
      try{
        const res=await api('getmonreport',{...(_adminCreds||{}),reportId,include:['editedData','dataSnapshot']});
        if(cancelled) return;
        if(res&&res.success!==false){
          const r=res.data||res.report||res;
          const fresh = r.dataSnapshot || r.editedData;
          if(fresh && !fresh._pending){
            setReport(prev=>{
              const merged={...(prev||{}),editedData:r.editedData,dataSnapshot:r.dataSnapshot};
              _persist(merged); return merged;
            });
            setSnapshotLoaded(true);
            setLoadingTab(false);
            return; // done
          }
        }
      }catch(_){}
      if(!cancelled) setTimeout(tick,2000);
    };
    const t=setTimeout(tick,1500);
    return ()=>{ cancelled=true; clearTimeout(t); };
  },[report,reportId,_persist]);

  // Lazy-load history only when the History tab is opened.
  const loadHistory=useCallback(async(force)=>{
    if(historyLoaded&&!force) return;
    setLoadingTab(true);
    try{
      const h=await api('getmonreporthistory',{...(_adminCreds||{}),reportId});
      const hist=(h&&h.data)||(h&&h.history)||[];
      setHistory(hist); setHistoryLoaded(true);
      _persist(undefined,hist);
    }catch(_){}
    setLoadingTab(false);
  },[reportId,historyLoaded,_persist]);

  // Combined reload helper used by action handlers — refreshes slim AND
  // invalidates per-tab caches so the next tab visit re-fetches the heavy bits.
  const reload=useCallback(async()=>{
    setSnapshotLoaded(false); setHistoryLoaded(false);
    await reloadSlim();
  },[reloadSlim]);

  // Initial slim load on mount / report change.
  useEffect(()=>{ reloadSlim(); /* eslint-disable-next-line */ },[reportId]);

  // Tab-driven lazy loading: only fetch what the tab actually needs.
  useEffect(()=>{
    if(tab==='institutional'||tab==='edit') loadSnapshot();
    else if(tab==='history') loadHistory();
    /* eslint-disable-next-line */
  },[tab,reportId]);

  const status = report?.status||'created';
  const canEdit = _monCanRole(userRole,isAdmin,[ROLE_NIDD,ROLE_ADMIN]) && (status==='created'||status==='under_editorial_review'||status==='returned_for_data_refresh');
  const canFinalize = _monCanRole(userRole,isAdmin,[ROLE_VICE_RECTOR,ROLE_NIDD,ROLE_ADMIN]) && (status==='created'||status==='under_editorial_review');
  const canSubmit = _monCanRole(userRole,isAdmin,[ROLE_RECTOR,ROLE_ADMIN]) && status==='finalized';
  const canAck = _monCanRole(userRole,isAdmin,[ROLE_NIDD,ROLE_ADMIN]) && status==='submitted';
  const canReject = _monCanRole(userRole,isAdmin,[ROLE_NIDD,ROLE_ADMIN]) && status==='submitted';
  const canArchive = _monCanRole(userRole,isAdmin,[ROLE_ADMIN,ROLE_NIDD]) && status==='acknowledged';
  const canCancel = _monCanRole(userRole,isAdmin,[ROLE_ADMIN]) && (status!=='archived'&&status!=='cancelled');
  const canRefresh = _monCanRole(userRole,isAdmin,[ROLE_NIDD,ROLE_ADMIN]) && (status==='created'||status==='under_editorial_review'||status==='returned_for_data_refresh');

  const doAction=async(action,extra)=>{
    setBusy(true); setError('');
    try{
      const res=await api(action,{...(_adminCreds||{}),reportId,...(extra||{})});
      if(res&&res.require2fa){
        const tf=res.twoFactor||{};
        setOtpCtx({email:tf.email||user?.email||'',message:res.message||'',cooldown:Number(tf.cooldown||30),pendingExtra:extra||{}});
        setBusy(false); return;
      }
      if(!res||res.success===false){ setError((res&&res.error)||'Грешка.'); setBusy(false); return; }
      toast('Готово.','success'); clearApiCache();
      await reload(); onChanged&&onChanged();
    }catch(err){ setError(err.message||'Сървърна грешка'); }
    setBusy(false);
  };

  const verifyOtp=async(code)=>{
    if(!otpCtx) return{success:false,error:'Няма активен контекст.'};
    try{
      const res=await api('submitmonreport',{...(_adminCreds||{}),reportId,otpCode:code,...(otpCtx.pendingExtra||{})});
      if(res&&res.require2fa) return{success:false,error:res.otpError||res.error||'Грешен код.'};
      if(!res||res.success===false) return{success:false,error:(res&&res.error)||'Грешка.'};
      // Surface partial-signature failures (one of PDF/XLSX missing the digital
      // seal) — full-failure already returns success:false from the backend.
      const sigWarn=Array.isArray(res.signatureWarnings)?res.signatureWarnings:[];
      if(sigWarn.length){
        toast('Отчетът е подаден, но електронният подпис не е положен върху '+sigWarn.map(w=>String(w.kind||'').toUpperCase()).join(' и ')+'. Свържете се с Администратор.','warn');
      } else {
        toast('Отчетът е подаден към МОН.','success');
      }
      clearApiCache();
      setOtpCtx(null); await reload(); onChanged&&onChanged();
      return{success:true};
    }catch(err){return{success:false,error:err.message||'Грешка'};}
  };
  const resendOtp=async()=>{
    try{ const r=await api('initiate2fa',{scope:'submitmonreport',email:otpCtx.email,ref:reportId});
      if(r&&r.success){ if(r.throttled) return{message:'Има активен код. Опитайте отново след '+(r.cooldown||30)+' сек.'};
        return{message:'Изпратен е нов код на '+otpCtx.email+'.'}; }
      return{error:(r&&r.error)||'Неуспешно.'};
    }catch(err){return{error:err.message||'Неуспешно.'};}
  };

  const handleSaveEdit=()=>doAction('editmonreport',{notes:notesEdit});
  const handleRefresh=()=>doAction('refreshmonreportdata',{});
  const handleFinalize=()=>doAction('finalizemonreport',{});
  const handleSubmit=()=>doAction('submitmonreport',{});
  const handleAck=()=>{ if(!ackNumber.trim()){ setError('Входящият номер е задължителен.'); return; } doAction('acknowledgemonsubmission',{ministryRefNumber:ackNumber.trim(),ministryAckDate:ackDate}); };
  const handleReject=()=>{ if(!rejectReason.trim()){ setError('Причина за връщане е задължителна.'); return; } doAction('rejectmonbyministry',{reason:rejectReason.trim()}); };
  const handleArchive=()=>doAction('archivemonreport',{});
  const handleCancel=()=>doAction('cancelmonreport',{reason:'Отменен от потребител'});
  const handleExport=async(format)=>{
    setBusy(true);
    // Pre-open splash window inside the user gesture (popup-blocker workaround).
    const popupWin = _monPrepPopup();
    try{
      const res=await api('exportmonreportfile',{...(_adminCreds||{}),reportId,format});
      if(!res||res.success===false){
        const msg=(res&&res.error)||'Грешка при експорт';
        _monClosePopup(popupWin, msg);
        toast(msg,'error');
      } else {
        const url=res.url||res.fileUrl||(res.data&&res.data.url);
        if(url){ _monOpenOrFallback(popupWin, url); toast('Файлът е готов.','success'); }
        else { _monClosePopup(popupWin); toast('Файлът е създаден.','success'); }
      }
    }catch(err){
      _monClosePopup(popupWin, err && err.message);
      toast(err.message||'Грешка','error');
    }
    setBusy(false);
  };

  const renderOverview=()=>{
    if(!report) return null;
    const m=report.metrics||{};
    // Detect deferred-snapshot placeholder (created with deferSnapshot:true,
    // backend trigger still backfilling). We surface a friendly notice so
    // the user doesn't read the zero-rows below as "the report is empty".
    const _snap = report.dataSnapshot || report.editedData;
    const _isPending = !!(_snap && _snap._pending);
    const row=(k,v)=>e('div',{key:k,style:{display:'flex',justifyContent:'space-between',padding:'.45rem .15rem',borderBottom:'1px dashed var(--border)'}},
      e('span',{style:{color:'var(--ink-3)',fontSize:'.78rem'}},k),
      e('span',{style:{fontWeight:600,fontSize:'.82rem'}},v??'—'));
    return e('div',null,
      _isPending && e('div',{className:'card',style:{padding:'.75rem .9rem',marginBottom:'.85rem',borderLeft:'4px solid var(--brand-navy,#233874)',background:'var(--info-bg,#eef2fc)',display:'flex',alignItems:'center',gap:'.65rem'}},
        e('i',{className:'fas fa-circle-notch fa-spin',style:{color:'var(--brand-navy,#233874)'}}),
        e('div',{style:{fontSize:'.82rem',color:'var(--ink-2)',lineHeight:1.45}},
          e('strong',null,'Снимката се обработва във фон…'),
          e('div',{style:{fontSize:'.74rem',color:'var(--ink-3)',marginTop:'.15rem'}},'Числата по-долу ще се запълнят автоматично след секунди. Можете да затворите прозореца — генерирането продължава.')
        )
      ),
      e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.75rem',marginBottom:'1rem'}},
        e('div',{className:'card',style:{padding:'.85rem'}},
          row('Идентификатор',report.id),
          row('Тип',_monTypeLabel(report.reportType)),
          row('Период',report.period||'—'),
          row('От — до',(report.periodStart||'—')+' → '+(report.periodEnd||'—')),
          row('Статус',e('span',{style:{color:_monColor(report.status),fontWeight:700}},_monLabel(report.status))),
          row('Създаден от',report.createdBy||'—'),
          row('Създаден на',_monFmtDate(report.createdAt))
        ),
        e('div',{className:'card',style:{padding:'.85rem'}},
          row('Брой проекти',m.projectsTotal||m.projects||0),
          row('Активни проекти',m.projectsActive||0),
          row('Приключени',m.projectsCompleted||0),
          row('Общ бюджет (€)',m.budgetTotal!=null?_monFmtBgn(m.budgetTotal):'—'),
          row('Изразходвано (€)',m.expensesTotal!=null?_monFmtBgn(m.expensesTotal):'—'),
          row('Брой публикации',m.publications||0),
          row('Брой деливерабли',m.deliverables||0)
        )
      ),
      report.notes&&e('div',{className:'card',style:{padding:'.85rem',marginBottom:'1rem'}},
        e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginBottom:'.35rem'}},'Бележки'),
        e('div',{style:{whiteSpace:'pre-wrap'}},report.notes)),
      (report.ministryRefNumber||report.ministryAckDate)&&e('div',{className:'card',style:{padding:'.85rem',marginBottom:'1rem',background:'var(--ok-bg,#e8f7ec)'}},
        e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginBottom:'.35rem'}},'Потвърждение от МОН'),
        e('div',null,'Входящ №: ',e('strong',null,report.ministryRefNumber||'—')),
        e('div',null,'Дата: ',e('strong',null,_monFmtDate(report.ministryAckDate)))
      ),
      // Action toolbar
      e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.5rem',marginTop:'.75rem'}},
        canRefresh&&e('button',{className:'btn btn-outline btn-sm',onClick:handleRefresh,disabled:busy},e('i',{className:'fas fa-rotate'}),' Обнови данни'),
        canFinalize&&e('button',{className:'btn btn-primary btn-sm',onClick:handleFinalize,disabled:busy},e('i',{className:'fas fa-check-double'}),' Финализирай'),
        canSubmit&&e('button',{className:'btn btn-primary btn-sm',onClick:handleSubmit,disabled:busy,style:{background:'var(--review,#5b48d8)'}},e('i',{className:'fas fa-paper-plane'}),' Подай към МОН (2FA)'),
        canArchive&&e('button',{className:'btn btn-outline btn-sm',onClick:handleArchive,disabled:busy},e('i',{className:'fas fa-archive'}),' Архивирай'),
        canCancel&&e('button',{className:'btn btn-outline btn-sm',style:{borderColor:'var(--err-border)',color:'var(--err)'},onClick:handleCancel,disabled:busy},e('i',{className:'fas fa-ban'}),' Отмени'),
        e('div',{style:{flex:1}}),
        e('button',{className:'btn btn-outline btn-sm',onClick:()=>handleExport('pdf'),disabled:busy},e('i',{className:'fas fa-file-pdf'}),' PDF'),
        e('button',{className:'btn btn-outline btn-sm',onClick:()=>handleExport('xlsx'),disabled:busy},e('i',{className:'fas fa-file-excel'}),' XLSX')
      ),
      // Acknowledge form (NIDD)
      canAck&&e('div',{className:'card',style:{padding:'.85rem',marginTop:'.85rem',background:'var(--info-bg,#eef4ff)'}},
        e('div',{style:{fontWeight:700,marginBottom:'.45rem'}},'Регистриране на потвърждение от МОН'),
        e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.55rem'}},
          e('input',{className:'input',placeholder:'Входящ № в МОН',value:ackNumber,onChange:ev=>setAckNumber(ev.target.value)}),
          e('input',{className:'input',type:'date',value:ackDate,onChange:ev=>setAckDate(ev.target.value)})
        ),
        e('button',{className:'btn btn-primary btn-sm',style:{marginTop:'.5rem'},onClick:handleAck,disabled:busy},e('i',{className:'fas fa-check'}),' Регистрирай')
      ),
      // Reject by ministry (NIDD records this)
      canReject&&e('div',{className:'card',style:{padding:'.85rem',marginTop:'.85rem',background:'var(--err-bg)'}},
        e('div',{style:{fontWeight:700,marginBottom:'.45rem'}},'Регистрирай отхвърляне от МОН (за повторна обработка)'),
        e('textarea',{className:'input',rows:2,placeholder:'Причина / коментар от МОН',value:rejectReason,onChange:ev=>setRejectReason(ev.target.value)}),
        e('button',{className:'btn btn-outline btn-sm',style:{marginTop:'.5rem',borderColor:'var(--err-border)',color:'var(--err)'},onClick:handleReject,disabled:busy},e('i',{className:'fas fa-undo'}),' Върни за коригиране')
      )
    );
  };

  const renderEdit=()=>{
    if(!report) return null;
    if(!canEdit) return e('div',{style:{padding:'1rem',color:'var(--ink-3)'}},'Този отчет не може да се редактира в текущия си статус (или нямате права).');
    return e('div',null,
      e('div',{className:'form-group'},e('label',null,'Бележки / редакторски коментари'),
        e('textarea',{className:'input',rows:8,value:notesEdit,onChange:ev=>setNotesEdit(ev.target.value),disabled:busy})),
      e('button',{className:'btn btn-primary btn-sm',onClick:handleSaveEdit,disabled:busy},e('i',{className:'fas fa-save'}),' Запиши промените'),
      e('div',{style:{marginTop:'.85rem',fontSize:'.75rem',color:'var(--ink-4)'}},
        'Числовите данни (брой проекти, бюджети, разходи и т.н.) се извличат автоматично от системата. Използвайте „Обнови данни" в раздел „Преглед", за да ги опресните.')
    );
  };

  const renderInstitutional=()=>{
    const data=(report&&(report.editedData||report.dataSnapshot))||{};
    const inst=data.institutional;
    if(!inst||!inst.sections) return e('div',{style:{padding:'1rem',color:'var(--ink-3)'}},'Няма институционален снимков обект. Натиснете „Обнови данни“ в раздел „Преглед“ за да го генерирате.');
    const S=inst.sections; const T=inst.totals||{};
    const sect=(num,title,icon,body)=>e('div',{key:num,className:'card',style:{padding:'.85rem',marginBottom:'.7rem'}},
      e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',padding:'.4rem .6rem',marginBottom:'.55rem',background:'#7B0000',color:'#fff',borderRadius:'4px',fontWeight:700}},
        e('i',{className:'fas '+icon}),e('span',null,num+'. '+title)),
      body);
    const empty=msg=>e('div',{style:{fontStyle:'italic',color:'var(--ink-4)',padding:'.4rem 0'}},msg||'(няма данни за периода)');
    const item=(idx,head,sub,attribution)=>e('div',{key:idx,style:{padding:'.45rem 0',borderBottom:'1px dashed var(--border)'}},
      e('div',{style:{fontSize:'.84rem'}},e('strong',null,(idx+1)+'. '),head),
      sub&&e('div',{style:{fontSize:'.74rem',color:'var(--ink-3)',marginTop:'.15rem'}},sub),
      attribution&&e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',fontStyle:'italic',textAlign:'right',marginTop:'.15rem'}},'Реализирал: '+attribution));

    const D=inst.derived||{};
    const kpiCard=(label,value,sub,color)=>e('div',{key:label,className:'card',style:{padding:'.55rem .7rem',borderLeft:'3px solid '+(color||'var(--primary)')}},
      e('div',{style:{fontSize:'.66rem',color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.04em'}},label),
      e('div',{style:{fontSize:'1.1rem',fontWeight:700,marginTop:'.15rem',color:color||'var(--ink-1)'}},value),
      sub&&e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.1rem'}},sub));
    return e('div',null,
      e('div',{className:'card',style:{padding:'.7rem',marginBottom:'.85rem',background:'var(--info-bg,#eef4ff)'}},
        e('div',{style:{fontSize:'.75rem',color:'var(--ink-3)'}},inst.templateRef||'ИНСТИТУЦИОНАЛЕН ОТЧЕТ по чл. 92, ал. 3 ЗВО'),
        e('div',{style:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'.5rem',marginTop:'.55rem',fontSize:'.74rem'}},
          e('div',null,e('strong',null,T.eventsCount||0),' събития'),
          e('div',null,e('strong',null,T.publicationsCount||0),' публикации'),
          e('div',null,e('strong',null,(T.projectsCompleted||0)+'+'+(T.projectsOngoing||0)),' проекти'),
          e('div',null,e('strong',null,T.projectsProposals||0),' предложения'),
          e('div',null,e('strong',null,T.expertCount||0),' експертни'),
          e('div',null,e('strong',null,T.partnershipsCount||0),' партньорства'),
          e('div',null,e('strong',null,_monFmtBgn(T.budgetTotal||0)),' € бюджет'),
          e('div',null,e('strong',null,_monFmtBgn(T.spentTotal||0)),' € изразходвани'))),
      // Derived KPI dashboard
      e('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'.55rem',marginBottom:'.85rem'}},
        kpiCard('Усвояване (общо)',_monFmtPct(D.globalUtilizationPct),'спрямо общия бюджет','#5b48d8'),
        kpiCard('Усвояване (средно/проект)',_monFmtPct(D.avgUtilizationPct),(D.projectCount||0)+' проекта','#7B0000'),
        kpiCard('Степен на приключване',_monFmtPct(D.completionRatePct),'приключени / всички','#0f7e5a'),
        kpiCard('Одобрение на предложения',_monFmtPct(D.proposalApprovalPct),'от подадените за периода','#c97a00'),
        kpiCard('Среден бюджет / проект',_monFmtBgn(D.avgBudgetPerProject),null,'#1a1a2e'),
        kpiCard('Среден разход / проект',_monFmtBgn(D.avgSpentPerProject),null,'#1a1a2e'),
        kpiCard('Публикации / проект',(D.publicationsPerProject||0).toFixed(2),'продуктивност','#5b48d8'),
        kpiCard('Перфектни закривания',(D.perfectClosures||0),'усвояване 95–105%','#0f7e5a'),
        kpiCard('Неусвоен бюджет',_monFmtBgn(D.unspentBudget),'остатък в периода','#c97a00'),
        kpiCard('Общо deliverables',(D.deliverablesTotal||0),'публ.+съб.+експ.','#1a1a2e')
      ),
      sect('I','Научни и практико-приложни събития','fa-calendar-check',
        (S.events&&S.events.length)?S.events.map((x,i)=>item(i,x.title,x.description,x.attribution)):empty()),
      sect('II','Научни изследвания','fa-microscope',
        (S.research&&S.research.length)?S.research.map((x,i)=>item(i,x.title||x.description,'Период: '+x.period+' • Бюджет: '+(Number(x.budget||0)/_MR_EUR_BGN).toFixed(2)+' €',x.attribution)):empty()),
      sect('III','Публикации','fa-book',
        (S.publications&&S.publications.length)?S.publications.map((x,i)=>item(i,'['+x.type+'] '+x.title,x.url||x.description,x.attribution)):empty()),
      sect('IV','Проекти и проектни предложения','fa-flask',
        e('div',null,
          e('div',{style:{fontWeight:700,marginTop:'.35rem',marginBottom:'.25rem'}},'Приключили проекти'),
          (S.projects&&S.projects.completed&&S.projects.completed.length)?S.projects.completed.map((p,i)=>item(i,'„'+p.title+'“ ('+p.code+')','Ръководител: '+(p.leader||'—')+' • '+p.period+' • Бюджет: '+_monFmtBgn(p.budget||0)+' • Изразх.: '+_monFmtBgn(p.spent||0)+' ('+Number(p.utilization||0).toFixed(2)+'%)',p.attribution)):empty('Няма приключени проекти.'),
          e('div',{style:{fontWeight:700,marginTop:'.55rem',marginBottom:'.25rem'}},'Текущи проекти'),
          (S.projects&&S.projects.ongoing&&S.projects.ongoing.length)?S.projects.ongoing.map((p,i)=>item(i,'„'+p.title+'“ ('+p.code+')','Ръководител: '+(p.leader||'—')+' • '+p.period+' • Статус: '+p.status+' • Усвоени: '+Number(p.utilization||0).toFixed(2)+'%',p.attribution)):empty('Няма активни проекти.'),
          e('div',{style:{fontWeight:700,marginTop:'.55rem',marginBottom:'.25rem'}},'Изготвени и подадени проектни предложения'),
          (S.projects&&S.projects.proposals&&S.projects.proposals.length)?S.projects.proposals.map((p,i)=>item(i,'„'+p.title+'“','Конкурс: '+(p.competition||'—')+' • Изход: '+p.outcome,p.attribution)):empty('Няма подадени предложения.'))),
      sect('V','Експертна дейност','fa-user-tie',
        (S.expert&&S.expert.length)?S.expert.map((x,i)=>item(i,x.title,x.description,x.attribution)):empty()),
      sect('VI','Партньорства','fa-handshake',
        (S.partnerships&&S.partnerships.length)?e('ol',{style:{paddingLeft:'1.2rem',margin:0}},S.partnerships.map((p,i)=>e('li',{key:i,style:{padding:'.18rem 0'}},p.name))):empty()),
      sect('VII','Организация и управление','fa-sitemap',
        (S.organization&&S.organization.length)?S.organization.map((x,i)=>item(i,x.description,x.createdAt,x.attribution)):empty()),
      sect('VIII','Популяризиране на дейността','fa-bullhorn',
        (S.promotion&&S.promotion.length)?S.promotion.map((x,i)=>item(i,x.description,null,x.attribution)):empty()),
      e('div',{className:'card',style:{padding:'.85rem',marginTop:'.7rem',background:'#fafbff',borderLeft:'3px solid #7B0000'}},
        e('div',{style:{fontWeight:700,marginBottom:'.4rem'}},'Декларация'),
        e('div',{style:{fontSize:'.78rem'}},'Долуподписаният(ата) ',inst.signatory&&inst.signatory.title||'Ректор',' на ',inst.signatory&&inst.signatory.institution||'ИУ – Варна',' декларирам, че настоящият отчет е изготвен на базата на действителни данни от информационната система.'),
        e('div',{style:{fontSize:'.74rem',color:'var(--ink-4)',marginTop:'.35rem'}},(inst.signatory&&inst.signatory.date||'')+' • '+(inst.signatory&&inst.signatory.location||'гр. Варна')))
    );
  };

  const renderHistory=()=>{
    if(!history||!history.length) return e('div',{style:{padding:'1rem',color:'var(--ink-3)'}},'Няма записи в историята.');
    return e('div',null, history.map((h,i)=>e('div',{key:i,className:'card',style:{padding:'.65rem .85rem',marginBottom:'.4rem'}},
      e('div',{style:{display:'flex',justifyContent:'space-between',gap:'.5rem',fontSize:'.75rem'}},
        e('span',{style:{fontWeight:700,color:_monColor(h.toStatus||h.status)}},(h.fromStatus?_monLabel(h.fromStatus)+' → ':'')+_monLabel(h.toStatus||h.status||h.action)),
        e('span',{style:{color:'var(--ink-4)'}},_monFmtDate(h.at||h.timestamp))
      ),
      h.actor&&e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)'}},h.actor),
      h.note&&e('div',{style:{fontSize:'.78rem',marginTop:'.25rem',whiteSpace:'pre-wrap'}},h.note)
    )));
  };

  const renderFiles=()=>{
    const files=(report&&(report.files||report.attachments))||[];
    if(!files.length) return e('div',{style:{padding:'1rem',color:'var(--ink-3)'}},'Няма прикачени файлове. Използвайте PDF/XLSX експортите от раздел „Преглед".');
    return e('div',null, files.map((f,i)=>e('div',{key:i,className:'card',style:{padding:'.55rem .85rem',marginBottom:'.35rem',display:'flex',justifyContent:'space-between',alignItems:'center'}},
      e('span',null,e('i',{className:'fas '+(String(f.name||'').toLowerCase().endsWith('.pdf')?'fa-file-pdf':'fa-file-excel'),style:{marginRight:'.45rem',color:'var(--ink-4)'}}),f.name||('Файл '+(i+1))),
      f.url&&e('a',{className:'btn btn-outline btn-sm',href:f.url,target:'_blank',rel:'noopener'},'Отвори')
    )));
  };

  const TABS=[
    {id:'overview',     label:'Преглед',               icon:'fa-eye'},
    {id:'institutional',label:'Институционален отчет', icon:'fa-landmark'},
    {id:'edit',         label:'Редакция',              icon:'fa-pen'},
    {id:'history',      label:'История',               icon:'fa-clock-rotate-left'},
    {id:'files',        label:'Файлове',               icon:'fa-paperclip'}
  ];

  const titleEl=e(Fragment,null,'МОН отчет',report?e('span',{style:{color:'var(--ink-4)',fontWeight:500,marginLeft:'.4rem'}},'· '+(report.id||'')):null,
    refreshing&&e('span',{style:{marginLeft:'.5rem',fontSize:'.65rem',color:'var(--ink-4)',fontWeight:500},title:'Обновяване във фон'},
      e('i',{className:'fas fa-circle-notch fa-spin'}),' обновяване')
  );

  const tabsBar=e('div',{className:'fd-tabs',style:{display:'flex',gap:'.25rem',padding:'.5rem 1rem 0',borderBottom:'1px solid var(--border)',flexWrap:'wrap'}},
    TABS.map(t=>e('button',{key:t.id,type:'button',className:'fd-tab'+(tab===t.id?' active':''),onClick:()=>setTab(t.id),style:{padding:'.5rem .85rem',background:tab===t.id?'var(--primary-glow,#eaf2ff)':'transparent',border:'none',borderBottom:tab===t.id?'2px solid var(--primary)':'2px solid transparent',cursor:'pointer',fontSize:'.82rem',fontWeight:tab===t.id?700:500,color:tab===t.id?'var(--primary)':'var(--ink-2)'}},
      e('i',{className:'fas '+t.icon,style:{marginRight:'.35rem'}}),t.label))
  );

  // Skeleton block for cold-load (no seed, no cache) — canonical pattern from
  // Отчети по проекти: card-loading wrapper + animated loading-strip + skeleton-lines.
  const skeleton=e('div',{className:'card card-loading',style:{padding:'1rem',position:'relative'}},
    e('div',{className:'loading-strip active'}),
    [0,1].map(i=>e('div',{key:i,style:{marginBottom:'.85rem'}},
      [85,60,90,70,55].map((w,j)=>e('div',{key:j,className:'skeleton skeleton-line',
        style:{width:w+'%',height:'.8rem',marginBottom:'.5rem'}}))
    ))
  );

  // Per-tab lazy-load indicator (slim shell shows; heavy data still streaming)
  // — inline strip styled like the rest of the loading vocabulary.
  const tabLazyHint=loadingTab && e('div',{className:'card card-loading',style:{
    padding:'.5rem .8rem',marginBottom:'.6rem',position:'relative',
    background:'var(--info-bg,#eef4ff)',color:'var(--info,#233874)',
    fontSize:'.75rem',display:'flex',alignItems:'center',gap:'.4rem'
  }},
    e('div',{className:'loading-strip active'}),
    e('i',{className:'fas fa-circle-notch fa-spin'}),' Зареждане на детайли…'
  );

  const body=loading
    ?skeleton
    :error
      ?e('div',{style:{background:'var(--err-bg)',border:'1px solid var(--err-border)',padding:'.75rem',borderRadius:'var(--r-sm)',color:'var(--err)'}},e('i',{className:'fas fa-exclamation-triangle'}),' ',error)
      :e('div',{className:'content-loaded'},
          tabLazyHint,
          tab==='overview'?renderOverview()
          :tab==='institutional'?renderInstitutional()
          :tab==='edit'?renderEdit()
          :tab==='history'?renderHistory():renderFiles()
        );

  return e(Fragment,null,
    e(ModalShell,{open:true,onClose,title:titleEl,icon:'fas fa-building-columns',size:'wide',dismissable:!busy,extraClass:'has-tabs'},
      tabsBar,
      e('div',{style:{padding:'1rem',maxHeight:'70vh',overflowY:'auto'}},body)
    ),
    otpCtx&&e(OtpVerifyModal,{
      email:otpCtx.email,
      initialMessage:otpCtx.message,
      initialCooldown:otpCtx.cooldown,
      onVerify:verifyOtp,
      onResend:resendOtp,
      onCancel:()=>setOtpCtx(null),
      title:'Подаване към МОН — 2FA'
    })
  );
};

/* ──────────────────────────────────────────────────────────── */
/*  LIST VIEW                                                   */
/* ──────────────────────────────────────────────────────────── */
var MinistryReportsView=({user,isAdmin,userRole})=>{
  const[bucket,setBucket]=useState('active'); // active | archive
  // Pre-warmed buckets cache for instant tab switching (single batched
  // round-trip to gas: getmonreportsbatch returns BOTH buckets at once).
  // Persisted to localStorage with 24h TTL so cold reloads paint instantly
  // from cache instead of blanking out (was sessionStorage — lost on tab close).
  const _BUCKETS_KEY='erp:monBuckets';
  const _initialBuckets=(()=>{
    const o=_monCacheGet(_BUCKETS_KEY);
    if(o && (Array.isArray(o.active)||Array.isArray(o.archive))){
      return { active:Array.isArray(o.active)?o.active:[], archive:Array.isArray(o.archive)?o.archive:[] };
    }
    return {active:[],archive:[]};
  })();
  const _hasCache = _initialBuckets.active.length>0 || _initialBuckets.archive.length>0;
  const[bucketCache,setBucketCache]=useState(_initialBuckets);
  const reports = bucketCache[bucket]||[];
  // Initial-load spinner only on cold start; background refreshes use a
  // separate `refreshing` flag so the table never blanks out.
  const[loading,setLoading]=useState(!_hasCache);
  const[refreshing,setRefreshing]=useState(false);
  const[error,setError]=useState('');
  const[showCreate,setShowCreate]=useState(false);
  const[detailId,setDetailId]=useState(null);
  const[search,setSearch]=useState('');
  // Defer search-driven filtering so typing stays smooth even on large lists.
  const deferredSearch=useDeferredValue(search);
  const[typeFilter,setTypeFilter]=useState('all');
  const[statusFilter,setStatusFilter]=useState('all');

  const canCreate = isAdmin || userRole===ROLE_NIDD;

  const reload=useCallback(async()=>{
    if(_hasCache) setRefreshing(true); else setLoading(true);
    setError('');
    try{
      // Batched single-round-trip — backend reads sheet ONCE for both buckets
      // and returns them in parallel, halving round-trip latency.
      const res=await api('getmonreportsbatch',{...(_adminCreds||{}),buckets:['active','archive']});
      if(!res||res.success===false){ setError((res&&res.error)||'Грешка при зареждане.'); }
      else{
        const r = (res.data&&res.data.results)||res.results||{};
        const next = {
          active:  Array.isArray(r.active&&r.active.reports)?r.active.reports:(Array.isArray(r.active)?r.active:[]),
          archive: Array.isArray(r.archive&&r.archive.reports)?r.archive.reports:(Array.isArray(r.archive)?r.archive:[])
        };
        setBucketCache(next);
        _monCacheSet(_BUCKETS_KEY, next);
      }
    }catch(err){ setError(err.message||'Сървърна грешка'); }
    setLoading(false); setRefreshing(false);
  },[_hasCache]);

  useEffect(()=>{ reload(); /* eslint-disable-next-line */ },[]);

  const filtered=useMemo(()=>{
    const q=String(deferredSearch||'').trim().toLowerCase();
    return (reports||[]).filter(r=>{
      if(typeFilter!=='all' && r.reportType!==typeFilter) return false;
      if(statusFilter!=='all' && r.status!==statusFilter) return false;
      if(!q) return true;
      return [r.id,r.period,r.createdBy,r.notes,r.ministryRefNumber].filter(Boolean).join(' ').toLowerCase().indexOf(q)>=0;
    });
  },[reports,deferredSearch,typeFilter,statusFilter]);

  // Aggregated KPI strip across visible (filtered) rows.
  const kpis=useMemo(()=>{
    const acc={count:filtered.length,events:0,publications:0,projects:0,proposals:0,budget:0,spent:0};
    filtered.forEach(r=>{ const t=r.totals||{};
      acc.events       += Number(t.eventsCount||0);
      acc.publications += Number(t.publicationsCount||0);
      acc.projects     += Number(t.projectsCompleted||0)+Number(t.projectsOngoing||0);
      acc.proposals    += Number(t.projectsProposals||0);
      acc.budget       += Number(t.budgetTotal||0);
      acc.spent        += Number(t.spentTotal||0);
    });
    acc.utilization = acc.budget>0 ? (acc.spent/acc.budget*100) : 0;
    return acc;
  },[filtered]);

  // Publish counts to module-level Отчетност shell. "pending" = anything in
  // a workflow-attention status (created/under_editorial_review/finalized/
  // submitted/returned_for_data_refresh) — anything not yet acknowledged
  // or archived counts as actionable for some role in the chain.
  useEffect(()=>{
    try {
      const total = (reports||[]).length;
      const pending = (reports||[]).filter(r=>{
        const s = String(r.status||'').toLowerCase();
        return ['created','under_editorial_review','finalized','submitted','returned_for_data_refresh'].indexOf(s) >= 0;
      }).length;
      window.dispatchEvent(new CustomEvent('erp:financeCount',{
        detail:{ key:'mon', total, pending }
      }));
    } catch(_) {}
  },[reports]);

  // Open-recent: jump to a specific MON report when M_FinanceModule asks.
  useEffect(()=>{
    const onOpen = (ev)=>{
      const d = (ev && ev.detail) || {};
      if (d.section !== 'mon' || !d.id) return;
      setDetailId(d.id);
    };
    window.addEventListener('erp:financeOpen', onOpen);
    return ()=>window.removeEventListener('erp:financeOpen', onOpen);
  },[]);

  // Distinct statuses present in current bucket (for status filter dropdown)
  const statusOptions=useMemo(()=>{
    const set={}; (reports||[]).forEach(r=>{ if(r.status) set[r.status]=true; });
    return Object.keys(set).sort();
  },[reports]);

  return e('div',{className:'view-container'},
    e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'.75rem',marginBottom:'1rem'}},
      e('div',null,
        e('h2',{style:{margin:0}},e('i',{className:'fas fa-building-columns',style:{marginRight:'.5rem',color:'var(--primary)'}}),'МОН отчети'),
        e('div',{style:{fontSize:'.78rem',color:'var(--ink-4)',marginTop:'.2rem'}},'Институционални отчети към Министерство на образованието и науката')
      ),
      e('div',{style:{display:'flex',gap:'.5rem',alignItems:'center'}},
        refreshing&&e('span',{title:'Обновяване във фон',style:{display:'inline-flex',alignItems:'center',gap:'.3rem',fontSize:'.72rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-circle-notch fa-spin'}),' Обновяване…'),
        canCreate&&e('button',{className:'btn btn-primary',onClick:()=>setShowCreate(true)},e('i',{className:'fas fa-plus'}),' Нов МОН отчет'),
        e('button',{className:'btn btn-outline',onClick:reload,disabled:loading||refreshing},e('i',{className:'fas fa-rotate'+(loading||refreshing?' fa-spin':'')}),' Обнови'),
        isAdmin&&e('button',{className:'btn btn-outline',onClick:async()=>{
          if(!window.confirm('Това ще премести всички референцирани МОН файлове в MON-Отчети/<година>/ и ще премести в кошчето нереференцираните дубликати. Продължи?'))return;
          try{const res=await api('cleanupmonduplicates',{});if(res&&res.success){toast(`Готово: запазени ${res.kept}, преместени ${res.moved}, изтрити ${res.trashed}`,'success',5000);}else{toast(res?.error||'Грешка при почистване','error');}}
          catch(err){toast('Грешка: '+(err?.message||err),'error');}
        },title:'Почисти дубликати в Drive (admin)'},e('i',{className:'fas fa-broom'}),' Почисти')
      )
    ),
    // Tab strip
    e('div',{style:{display:'flex',gap:'.25rem',marginBottom:'.85rem',borderBottom:'1px solid var(--border)'}},
      [{id:'active',label:'Активни',icon:'fa-list-ul'},{id:'archive',label:'Архив',icon:'fa-archive'}].map(b=>
        e('button',{key:b.id,onClick:()=>setBucket(b.id),style:{padding:'.55rem 1rem',background:bucket===b.id?'var(--primary-glow,#eaf2ff)':'transparent',border:'none',borderBottom:bucket===b.id?'2px solid var(--primary)':'2px solid transparent',cursor:'pointer',fontWeight:bucket===b.id?700:500,fontSize:'.85rem'}},
          e('i',{className:'fas '+b.icon,style:{marginRight:'.4rem'}}),b.label))
    ),
    // Filters — autoFocus search for fast keyboard access.
    e('div',{style:{display:'flex',gap:'.5rem',marginBottom:'.85rem',flexWrap:'wrap'}},
      e('input',{className:'input',type:'search',placeholder:'Търсене по ID, период, автор…',value:search,onChange:ev=>setSearch(ev.target.value),style:{flex:'1 1 280px',maxWidth:420},autoFocus:true}),
      e('select',{className:'input',value:typeFilter,onChange:ev=>setTypeFilter(ev.target.value),style:{maxWidth:200}},
        e('option',{value:'all'},'Всички типове'),
        MON_REPORT_TYPES_UI.map(t=>e('option',{key:t.value,value:t.value},t.label))
      ),
      e('select',{className:'input',value:statusFilter,onChange:ev=>setStatusFilter(ev.target.value),style:{maxWidth:220}},
        e('option',{value:'all'},'Всички статуси'),
        statusOptions.map(s=>e('option',{key:s,value:s},_monLabel(s)))
      )
    ),
    // KPI summary strip (across visible rows)
    !loading && filtered.length>0 && e('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:'.5rem',marginBottom:'.85rem'}},
      [
        {label:'Отчети',value:kpis.count,icon:'fa-folder-open',color:'var(--primary)'},
        {label:'Събития',value:kpis.events,icon:'fa-calendar-check',color:'#7B0000'},
        {label:'Публикации',value:kpis.publications,icon:'fa-book',color:'#5b48d8'},
        {label:'Проекти',value:kpis.projects,icon:'fa-flask',color:'#0f7e5a'},
        {label:'Предложения',value:kpis.proposals,icon:'fa-paper-plane',color:'#c97a00'},
        {label:'Бюджет',value:_monFmtBgn(kpis.budget),icon:'fa-coins',color:'#1a1a2e',compact:true},
        {label:'Изразх.',value:_monFmtBgn(kpis.spent),icon:'fa-money-bill-wave',color:'#1a1a2e',compact:true},
        {label:'Усвояване',value:_monFmtPct(kpis.utilization),icon:'fa-percent',color:'#1a1a2e'}
      ].map((k,i)=>e('div',{key:i,className:'card',style:{padding:'.55rem .7rem',borderLeft:'3px solid '+k.color}},
        e('div',{style:{fontSize:'.66rem',color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.04em'}},e('i',{className:'fas '+k.icon,style:{marginRight:'.35rem',color:k.color}}),k.label),
        e('div',{style:{fontSize:k.compact?'.85rem':'1.1rem',fontWeight:700,marginTop:'.2rem'}},k.value)
      ))
    ),
    // Table — cold-load shows skeleton rows (matches Отчети по проекти pattern);
    // background refresh slides the .loading-strip on top of the table card.
    error&&e('div',{style:{background:'var(--err-bg)',border:'1px solid var(--err-border)',padding:'.75rem',borderRadius:'var(--r-sm)',color:'var(--err)',marginBottom:'.85rem'}},e('i',{className:'fas fa-exclamation-triangle'}),' ',error),
    loading
      ?e('div',{className:'card card-loading',style:{padding:0,position:'relative',overflow:'hidden'}},
         e('div',{className:'loading-strip active'}),
         e('div',{className:'table-wrap'},
           e('table',{className:'data-table'},
             e('thead',null,e('tr',null,
               ['ID','Тип','Период','Статус','Метрики','Автор','Създаден','Подаден','Действия'].map(h=>e('th',{key:h},h))
             )),
             e('tbody',null, [0,1,2,3,4].map(i=>e('tr',{key:i},
               [80,90,80,70,120,90,90,90,80].map((w,j)=>e('td',{key:j},
                 e('div',{className:'skeleton skeleton-line',style:{width:w+'%',height:'.85rem'}})
               ))
             )))
           )
         )
       )
      :filtered.length===0
        ?e('div',{style:{padding:'2.5rem',textAlign:'center',color:'var(--ink-4)',background:'var(--bg-2)',borderRadius:'var(--r-md)'}},
          e('i',{className:'fas fa-inbox',style:{fontSize:'2rem',marginBottom:'.6rem',opacity:.4}}),
          e('div',null,bucket==='archive'?'Няма архивирани отчети.':'Няма активни МОН отчети.'),
          canCreate&&bucket==='active'&&e('button',{className:'btn btn-primary btn-sm',style:{marginTop:'.85rem'},onClick:()=>setShowCreate(true)},'Създайте първия отчет'))
        :e('div',{className:'table-wrap card'+(refreshing?' card-loading':''),style:{position:'relative'}},
          refreshing&&e('div',{className:'loading-strip active'}),
          e('table',{className:'data-table'},
            e('thead',null,e('tr',null,
              e('th',null,'ID'),e('th',null,'Тип'),e('th',null,'Период'),
              e('th',null,'Статус'),e('th',null,'Метрики'),e('th',null,'Автор'),e('th',null,'Създаден'),e('th',null,'Подаден'),e('th',null,'Действия')
            )),
            e('tbody',null, filtered.map(r=>{
              const t=r.totals||{};
              const chips=[
                {n:Number(t.eventsCount||0),l:'съб.',c:'#7B0000',i:'fa-calendar-check'},
                {n:Number(t.publicationsCount||0),l:'публ.',c:'#5b48d8',i:'fa-book'},
                {n:Number(t.projectsCompleted||0)+Number(t.projectsOngoing||0),l:'проекти',c:'#0f7e5a',i:'fa-flask'},
                {n:Number(t.projectsProposals||0),l:'предл.',c:'#c97a00',i:'fa-paper-plane'}
              ].filter(c=>c.n>0);
              return e('tr',{key:r.id,style:{cursor:'pointer'},onClick:()=>setDetailId(r.id)},
                e('td',{className:'mono'},r.id),
                e('td',null,_monTypeLabel(r.reportType)),
                e('td',null,r.period||'—'),
                e('td',null,e('span',{style:{display:'inline-block',padding:'.18rem .55rem',borderRadius:'999px',background:_monColor(r.status),color:'#fff',fontSize:'.7rem',fontWeight:700}},_monLabel(r.status))),
                e('td',{style:{minWidth:140}},
                  chips.length===0
                    ?e('span',{style:{fontSize:'.7rem',color:'var(--ink-4)',fontStyle:'italic'}},'—')
                    :e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.25rem'}},chips.map((c,i)=>e('span',{key:i,title:c.l,style:{display:'inline-flex',alignItems:'center',gap:'.2rem',padding:'.1rem .4rem',borderRadius:'4px',background:c.c+'14',color:c.c,fontSize:'.7rem',fontWeight:700}},e('i',{className:'fas '+c.i,style:{fontSize:'.65rem'}}),c.n)))
                ),
                e('td',{style:{fontSize:'.78rem'}},r.createdBy||'—'),
                e('td',{className:'mono',style:{fontSize:'.74rem'}},_monFmtDate(r.createdAt)),
                e('td',{className:'mono',style:{fontSize:'.74rem'}},_monFmtDate(r.submittedAt)),
                e('td',{onClick:ev=>ev.stopPropagation()},e('div',{style:{display:'flex',gap:'.25rem'}},
                  e('button',{className:'btn btn-outline btn-sm',title:'Отвори',onClick:()=>setDetailId(r.id)},e('i',{className:'fas fa-folder-open'})),
                  e('button',{className:'btn btn-outline btn-sm',title:'PDF',onClick:()=>_monQuickExport(r.id,'pdf')},e('i',{className:'fas fa-file-pdf'})),
                  e('button',{className:'btn btn-outline btn-sm',title:'XLSX',onClick:()=>_monQuickExport(r.id,'xlsx')},e('i',{className:'fas fa-file-excel'}))
                ))
              );
            }))
          )
        ),
    showCreate&&e(MONReportCreatorModal,{onClose:()=>setShowCreate(false),onCreated:rec=>{
      setShowCreate(false); reload();
      // Defensive: rec.id MUST be a primitive string — anything else (object,
      // undefined) would have produced the "[object Object]" regression in the
      // detail modal title bar and the recent-pill dispatch downstream.
      const newId = (rec && typeof rec.id === 'string' && rec.id.trim()) ? rec.id.trim() : '';
      if(newId) setDetailId(newId);
    }}),
    detailId&&e(MONReportDetailModal,{
      reportId:detailId,
      // Pass the matching list row as `seed` so the modal can paint INSTANTLY
      // without waiting for getmonreport — eliminates the perceived loading
      // delay for the most common case (clicking a row from the list).
      seed:(()=>{ const s=(reports||[]).find(x=>x.id===detailId)||null;
        // Side-effect: publish to module-level "Recently opened" pill row.
        // Force every field to a primitive string — a Sheets cell that gets
        // returned as Date/object would otherwise stringify to "[object Object]".
        if(s){ try{
          const _id     = (typeof s.id==='object' || s.id==null) ? '' : String(s.id);
          const _period = (typeof s.period==='object' || s.period==null) ? '' : String(s.period);
          if(_id){
            window.dispatchEvent(new CustomEvent('erp:financeRecent',{
              detail:{ section:'mon', id:_id, label:_id+(_period?' · '+_period:''), icon:'fa-building-columns' }
            }));
          }
        }catch(_){} }
        return s;
      })(),
      user,isAdmin,userRole,
      onClose:()=>setDetailId(null),
      onChanged:reload
    })
  );
};

try{ window.MinistryReportsView=MinistryReportsView; }catch(_){ }
