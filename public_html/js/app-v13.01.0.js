// One-time warn registry: surfaces normally-silent background failures once per session
var _warnedKinds=Object.create(null);
var warnOnce=(kind,message)=>{if(_warnedKinds[kind])return;_warnedKinds[kind]=true;try{toast(message,'warning',6000)}catch(_){}};
// Console-only variant for background operations — rate-limited per kind, never toasts
var _bgWarned=Object.create(null);
var _bgWarn=(kind,err)=>{if(_bgWarned[kind])return;_bgWarned[kind]=true;console.warn('[bg-refresh:'+kind+']',err&&err.message||err||'неуспешно');setTimeout(()=>{delete _bgWarned[kind]},120000)};

// v12.49.19-perf: render-timing marks + light telemetry for UI responsiveness.
// Additive only: no behavior change, no new dependencies.
try {
  if (typeof performance !== 'undefined' && performance.mark && performance.measure) {
    try { performance.mark('uev:first-paint'); } catch (_) {}
    var _uevMeasureOnce = function(name, startMark, endMark) {
      try {
        performance.measure(name, startMark, endMark);
        var m = performance.getEntriesByName(name)[0];
        if (m && typeof console !== 'undefined' && console.info) {
          console.info('[perf] ' + name + ': ' + Math.round(m.duration) + 'ms');
        }
      } catch (_) {}
    };
    window._uevMeasureOnce = _uevMeasureOnce;
  }
} catch (_) {}

var _restoreSession=()=>{try{
  // Read activity & session blob through the multi-store layer (utils.js):
  // localStorage → sessionStorage → partitioned cookie → window.name. This
  // keeps the user logged in across an iframe refresh even when the browser
  // partitions or wipes our localStorage between page loads.
  const lastAct=_readActivity_();
  if(lastAct&&(Date.now()-lastAct)>_SESSION_TTL){_wipeSession_();return null}
  const s=_readSession_();
  if(!s)return null;
  if(s?.type==='admin'&&s.username){_adminCreds={username:s.username};_currentUserEmail=s.username;_currentUserIsAdmin=true;_currentUserRole=ROLE_ADMIN;_touchActivity();return{name:'Администратор',email:s.username,userId:s.username,picture:null,_role:ROLE_ADMIN}}
  if(s?.type==='google'&&s.email){/* Domain gate on session restore — drop tampered/legacy non-domain users */ if(typeof isAllowedSignInEmail==='function'&&!isAllowedSignInEmail(s.email)){_wipeSession_();return null} const role=s.role||ROLE_APPLICANT;_currentUserEmail=s.email;_currentUserIsAdmin=isAdminRole(role);_currentUserRole=role;if(isAdminRole(role))_adminCreds={username:s.email};_touchActivity();return{name:s.name,email:s.email,picture:s.picture||null,_role:role}}
}catch(_){}return null};

// Compute initial session once at module load — avoids calling _restoreSession twice on mount
var _APP_INIT=(()=>{const s=_restoreSession();return{user:s,role:s?._role||ROLE_APPLICANT}})();

// ─── FEATURE FLAGS ───
window.ERP_CONFIG=window.ERP_CONFIG||{};
window.ERP_CONFIG.modules=window.ERP_CONFIG.modules||{};

// ─── SSR HYDRATION ───
// Consume preloaded state injected by scripts/prerender.js (static hosting)
// or server.js (Express SSR). Seeds COMPETITIONS global and SWR cache so the
// first render already has competition data — no loading spinner needed.
// Runs synchronously at module-load time, before ANY React component mounts.
var _preloadedState=null;
try{_preloadedState=consumePreloadedState()}catch(_){}

// ─── v12.21.0: GLOBAL ACTION GUARD — prevents double-clicks ───────────────
// Instantly (synchronously) disables any clicked button/element for 400ms to
// eliminate double-submissions and rapid-fire actions that cause UI lag.
// Elements with [data-no-guard] are excluded. Buttons inside .toast are excluded.
// The guard adds a `data-pending` attribute so CSS can show instant feedback.
(function(){
  if(typeof document==='undefined')return;
  var _guardLockTs=0;
  var _GUARD_MS=400;
  document.addEventListener('click',function(e){
    var el=e.target;
    // Walk up to find the nearest interactive element
    while(el&&el!==document.body){
      if(el.hasAttribute&&el.hasAttribute('data-no-guard'))return;
      if(el.closest&&el.closest('.toast'))return;
      if(el.tagName==='BUTTON'||el.tagName==='A'||el.getAttribute&&el.getAttribute('role')==='button'){
        var now=Date.now();
        if(el._guardTs&&(now-el._guardTs)<_GUARD_MS){
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        el._guardTs=now;
        // Instant visual feedback
        if(!el.hasAttribute('data-no-feedback')){
          el.setAttribute('data-pending','true');
          setTimeout(function(){
            try{el.removeAttribute('data-pending');}catch(_){}
          },_GUARD_MS);
        }
        return;
      }
      el=el.parentElement;
    }
  },true); // capture phase — fires before React's synthetic events
})();

// ─── BOOT-TIME BATCH PREFETCH ─────────────────────────────────────────────
// Strategy (v12.17.3):
//   1. localStorage SWR: instant paint from stale cache (0ms)
//   2. PHP batch call:   3 actions in 1 HTTP request (~200ms, MySQL)
//   3. GAS prefetch:     authoritative data arrives ~2-5s later
//
// The batch call combines competitions + forms + data_version into a single
// PHP round-trip so the UI is populated with fresh DB data before React
// finishes mounting most views.
if(_APP_INIT.user&&_APP_INIT.user.email){
    try{
        // Kick off the GAS-authoritative prefetch (getinitialdata) first
        prefetchCriticalData({isAdmin:isAdminRole(_APP_INIT.role),userId:_APP_INIT.user.email});
        // Fire PHP batch in parallel — arrives faster, seeds localStorage SWR
        if(typeof batchApi==='function'&&typeof window!=='undefined'&&window._PHP_API_URL){
            const _u=_APP_INIT.user.email;
            const _isAdm=isAdminRole(_APP_INIT.role);
            // v15.0.0-perf: Use dedicated getmyforms for non-admin — fastest path,
            // no role resolution, no fallback logic. Falls back to getforms for admin.
            const _formsAction = _isAdm
                ? {action:'getforms',data:{userId:_u,isAdmin:true,lean:true}}
                : {action:'getmyforms',data:{userId:_u,limit:50}};
            batchApi([
                {action:'getpubliccompetitions'},
                _formsAction,
                {action:'getdataversion'}
            ]).then(function(results){
                // Seed the data-layer cache for each result
                if(Array.isArray(results)){
                    const _actions=['getpubliccompetitions', _isAdm ? 'getforms' : 'getmyforms', 'getdataversion'];
                    results.forEach(function(r,i){
                        if(r&&r.success!==false&&typeof ERP_DATA!=='undefined'){
                            try{
                                ERP_DATA.cacheSet(_actions[i],{},r);
                                // v15.0.0-perf: Also seed under 'getforms' key when
                                // 'getmyforms' was used — the main forms loading code
                                // still calls api('getforms',...), so the cache under
                                // 'getforms' key is what gets read for instant render.
                                if(_actions[i]==='getmyforms' && r.forms){
                                    ERP_DATA.cacheSet('getforms',{},r);
                                }
                            }catch(_){}
                        }
                    });
                }
            }).catch(function(){/* silent — GAS prefetch is the authoritative fallback */});
        }
    }catch(_){}
}

/* ─── Memoized view wrappers ─── Phase 4
 * Top-level views receive stable callback refs (useCallback in App) and primitive props.
 * Wrapping them in React.memo() prevents unnecessary re-renders when App re-renders for
 * unrelated state (drawer toggle, profile modal, session-warn timer ticks, etc.).
 *
 * DEFENSIVE LOOKUP: every view is resolved through a `typeof X!=='undefined' ? X : window.X`
 * probe so a missing/late-loading bundle degrades to a harmless "view unavailable" placeholder
 * instead of crashing the whole app with `ReferenceError: <Name> is not defined`. This mirrors
 * the protective stubs already declared in views-bundle.js for shared components. */
var _viewMissing=(name)=>function _MissingView(){return e('div',{className:'view-error',style:{padding:'2rem',textAlign:'center',color:'var(--muted,#888)'}},e('i',{className:'fas fa-exclamation-triangle',style:{marginRight:'.4rem'}}),'Изгледът „'+name+'" не е зареден. Презаредете страницата.');};
var _resolveView=(name)=>{try{var g=(typeof window!=='undefined')?window:{};var v=g[name];if(v)return v;}catch(_){}/* fall through to lexical lookup via eval-free probe */ return null;};
// Resolve each view via window.* (set by views-bundle.js / components.js exposure blocks).
// Lexical references like `ApplicantView` would throw ReferenceError if the binding doesn't
// exist — window.* lookups return undefined safely instead.
//
// ── Lazy view wrapper (fixes "Изгледът не е зареден" race) ──
// Previously the view was resolved ONCE at app.js parse time and frozen into a memo.
// If views-bundle.js hadn't finished evaluating yet (slow network, deferred script race,
// cache priming after an email-link landing, etc.), the captured component was permanently
// the "missing" placeholder and the only recovery was a full page reload.
// `_lazyView` re-probes `window[name]` on every render until the real implementation
// becomes available, then caches and forwards props to it. The first failed render also
// schedules a couple of microtask/timeout retries to force a re-render without user action.
var _lazyView=(name)=>{
  let _cached=_resolveView(name);
  // Re-render trigger registry — populated per-instance below.
  const _LazyView=function _LazyView(props){
    if(!_cached){_cached=_resolveView(name);}
    const [,_tick]=useState(0);
    useEffect(function(){
      if(_cached)return;
      let cancelled=false;
      let tries=0;
      const probe=function(){
        if(cancelled)return;
        const v=_resolveView(name);
        if(v){_cached=v;_tick(t=>t+1);return;}
        if(tries++<20){setTimeout(probe,150);} // ~3s total retry window
      };
      // Probe on next microtask and then on a short interval.
      Promise.resolve().then(probe);
      return function(){cancelled=true;};
    },[]);
    if(_cached){return e(_cached,props);}
    return e(_viewMissing(name),null);
  };
  try{_LazyView.displayName='Lazy('+name+')';}catch(_){}
  return _LazyView;
};
var M_ApplicantView    = memo(_lazyView('ApplicantView'));
var M_AdminView        = memo(_lazyView('AdminView'));
var M_DashboardView    = memo(_lazyView('DashboardView'));
var M_CompetitionView  = memo(_lazyView('CompetitionView'));
var M_ContestBoardView = memo(_lazyView('ContestBoardView'));
var M_CalendarView     = memo(_lazyView('CalendarView'));
var M_DocumentsView    = memo(_lazyView('DocumentsView'));
var M_AllDocumentsPreview = memo(_lazyView('AllDocumentsPreview')); // v12.49.4: simplified /documents page
var M_MyDocumentsView  = (typeof MyDocumentsView!=='undefined'||_resolveView('MyDocumentsView'))?memo(_lazyView('MyDocumentsView')):null;
var M_ReviewersView    = memo(_lazyView('ReviewersView'));
var M_MyReviewsView    = memo(_lazyView('MyReviewsView'));
var M_AssetsView       = memo(_lazyView('AssetsView'));
var M_MinistryReportsView = (typeof MinistryReportsView!=='undefined')?memo(MinistryReportsView):null;
var M_ProjectReportsView  = (typeof ProjectReportsView!=='undefined')?memo(ProjectReportsView):null;
var M_LibraryDepositsView = (typeof LibraryDepositsView!=='undefined')?memo(LibraryDepositsView):null;
var M_BudgetTrackerView   = (typeof BudgetTrackerView!=='undefined')?memo(BudgetTrackerView):null;
var M_ExpensesViewMemo    = (typeof M_ExpensesView!=='undefined')?memo(M_ExpensesView):null;
var ProcurementDashboard  = memo(_lazyView('ProcurementDashboard'));

// M_AdminDashboard премахнат — admin панелът е премахнат

/* ════════════════════════════════════════════════════════════════════════
 *  M_FinanceModule — module-level UX shell for "Отчетност"
 *  ----------------------------------------------------------------------
 *  Adds module-level QoL on top of the 3 existing sub-views:
 *    • dynamic subtitle for ALL three sub-tabs (was: only projects/mon)
 *    • count badges on tab pills, fed live by sub-views via the
 *      `erp:financeCount` CustomEvent (and seeded from sessionStorage so
 *      counts persist across page reloads / tab-switches without flicker)
 *    • Alt+1 / Alt+2 / Alt+3 keyboard shortcuts to switch sub-tabs
 *      (with kbd hints in tab title attribute for discoverability)
 *    • "Recently opened" jump-pill row (last 3 records across all 3
 *      sub-sections, populated by sub-views via `erp:financeRecent` event)
 *  All sub-views remain unmodified by default — they are progressively
 *  enhanced when they emit the events below; legacy views just lose the
 *  badge / recent affordances but keep working.
 * ════════════════════════════════════════════════════════════════════════ */
var _FIN_COUNTS_LS = 'erp:fin:counts';
var _FIN_RECENT_LS = 'erp:fin:recent';
var _FIN_SUBTITLES = {
  projects: 'Проектни отчети — научно съдържание, финансов статус и прикачени файлове',
  expenses: 'Разходи — заявяване, одобрение и следене на бюджет по разходни групи',
  mon:      'Институционални отчети към МОН — шестмесечни, годишни и извънредни',
  library:  'Библиотечни депозити — задължителни два екземпляра по чл. 53 ЗВО',
  budget:   'Управление на бюджети по проекти — преглед, редактиране и импорт от файл'
};
var M_FinanceModule = (props) => {
  const { user, isAdmin, userRole, canMonReports, canLibraryDeposits, finSubTab, setFinSubTab,
          M_ProjectReportsView, M_MinistryReportsView, M_LibraryDepositsView, M_BudgetTrackerView,
          loadForms, reloadCompetitions, deepProjectId, deepSub, deepSessionId } = props;

  // Live counts (per-section). Seeded from sessionStorage to avoid flicker.
  const [counts, setCounts] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(_FIN_COUNTS_LS) || '{}') || {}; }
    catch (_) { return {}; }
  });
  // Recently opened items (cross-section). Newest first; max 3.
  // SANITISER: drop any historic sessionStorage entries whose label/id were
  // accidentally serialised as objects (visible as the "[object Object]" pill).
  const [recent, setRecent] = useState(() => {
    try {
      const a = JSON.parse(sessionStorage.getItem(_FIN_RECENT_LS) || '[]');
      if (!Array.isArray(a)) return [];
      const clean = a.filter(r => r && typeof r === 'object'
        && typeof r.id === 'string' && r.id
        && typeof r.section === 'string' && r.section
        && typeof r.label === 'string' && r.label
        && r.label !== '[object Object]'
        && r.label.indexOf('[object Object]') === -1
      ).slice(0,3);
      // Persist sanitised list back so the toxic entry is gone for good.
      try { sessionStorage.setItem(_FIN_RECENT_LS, JSON.stringify(clean)); } catch (_) {}
      return clean;
    } catch (_) { return []; }
  });

  // Listen for sub-view-emitted events. Sub-views are not required to emit
  // anything — absence simply hides the badge / recent affordance.
  useEffect(() => {
    const onCount = (ev) => {
      const d = (ev && ev.detail) || {};
      if (!d.key) return;
      setCounts(prev => {
        const next = { ...prev, [d.key]: { total: d.total||0, pending: d.pending||0, ts: Date.now() } };
        try { sessionStorage.setItem(_FIN_COUNTS_LS, JSON.stringify(next)); } catch (_) {}
        return next;
      });
    };
    const onRecent = (ev) => {
      const d = (ev && ev.detail) || {};
      // Defensive: every field MUST coerce to a primitive string before being
      // stored — otherwise an accidental object-valued dispatch (e.g. from a
      // sub-view passing the entire response payload) would leak into the
      // pill row and render as the dreaded "[object Object]".
      const _s = (v, fb) => {
        if (v === null || v === undefined) return fb;
        if (typeof v === 'object') {
          // Common shapes: {id:'…'} or {value:'…'} — pick the first sane primitive.
          if (typeof v.id === 'string' || typeof v.id === 'number') return String(v.id);
          if (typeof v.value === 'string' || typeof v.value === 'number') return String(v.value);
          return fb;
        }
        return String(v);
      };
      const id      = _s(d.id, '');
      const section = _s(d.section, '');
      if (!id || !section) return;
      const label = _s(d.label, id);
      const icon  = _s(d.icon, 'fa-file');
      setRecent(prev => {
        const filtered = prev.filter(r => !(r.id === id && r.section === section));
        const next = [{ id, section, label, icon, ts:Date.now() }, ...filtered].slice(0,3);
        try { sessionStorage.setItem(_FIN_RECENT_LS, JSON.stringify(next)); } catch (_) {}
        return next;
      });
    };
    window.addEventListener('erp:financeCount', onCount);
    window.addEventListener('erp:financeRecent', onRecent);
    return () => {
      window.removeEventListener('erp:financeCount', onCount);
      window.removeEventListener('erp:financeRecent', onRecent);
    };
  }, []);

  // Alt+1 / Alt+2 / Alt+3 keyboard shortcuts. Only active while user is
  // not focused inside an input/textarea/contenteditable.
  useEffect(() => {
    const onKey = (ev) => {
      if (!ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      const t = ev.target;
      const tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      if (ev.key === '1') { setFinSubTab('projects'); ev.preventDefault(); }
      else if (ev.key === '2') { setFinSubTab('expenses'); ev.preventDefault(); }
      else if (ev.key === '3' && canMonReports) { setFinSubTab('mon'); ev.preventDefault(); }
      else if (ev.key === '4' && canLibraryDeposits) { setFinSubTab('library'); ev.preventDefault(); }
      else if (ev.key === '5') { setFinSubTab('budget'); ev.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setFinSubTab, canMonReports, canLibraryDeposits]);

  // v12.17.2-analytics: Monitor API performance, cache hits, and queue events
  // Records metrics to window._analyticsMetrics (scaffolded in utils.js) for
  // production visibility. Logs to console in debug mode.
  useEffect(() => {
    const onAnalytics = (ev) => {
      const d = (ev && ev.detail) || {};
      const {type, action, latencyMs, success, cacheHit, backendMs} = d;
      if (!type) return;
      // Log to console for debugging (can be silenced via devtools)
      if (type === 'api:complete') {
        const status = success ? (cacheHit ? '✓' : '↓') : '✗';
        console.log(
          `%c${status}%c ${action}`,
          'color:' + (success ? (cacheHit ? '#0a0' : '#08d') : '#d00') + ';font-weight:700',
          'color:inherit',
          `${latencyMs}ms${backendMs ? ' (backend: ' + backendMs + 'ms)' : ''}`
        );
      } else if (type.startsWith('queue:')) {
        console.debug(`[queue] ${type}:`, d);
      } else if (type.startsWith('dlq:')) {
        console.debug(`[dlq] ${type}:`, d);
      }
    };
    window.addEventListener('erp:analytics', onAnalytics);
    return () => window.removeEventListener('erp:analytics', onAnalytics);
  }, []);

  // v12.17.3-instant: React to version-change events from data-layer.js poller.
  // When MySQL data changes (GAS sync, direct DB edit), frontend auto-refreshes
  // without user manually hitting refresh. Debounced to 800ms to batch bursts.
  useEffect(() => {
    let _debounce = null;
    const onDataChanged = () => {
      if (_debounce) clearTimeout(_debounce);
      _debounce = setTimeout(() => {
        loadForms({ forceRefresh: true, silent: true }).catch(() => {});
        reloadCompetitions({ forceRefresh: true }).catch(() => {});
      }, 800);
    };
    window.addEventListener('erp:data-changed', onDataChanged);
    // v12.32.33-realtime: erp:forms-changed was dispatched by every local
    // mutation (attach/remove/copy/delete) but had NO consumer — the visible
    // forms list only refreshed on the slow version poll. Consume it here so
    // the actor's own mutations reflect instantly (shares the same debounce).
    window.addEventListener('erp:forms-changed', onDataChanged);
    return () => {
      window.removeEventListener('erp:data-changed', onDataChanged);
      window.removeEventListener('erp:forms-changed', onDataChanged);
      if (_debounce) clearTimeout(_debounce);
    };
  }, [loadForms, reloadCompetitions]);

  const renderBadge = (key, color) => {
    const c = counts[key];
    if (!c || !c.total) return null;
    const isPending = c.pending > 0;
    return e('span', {
      className: 'count-chip',
      style: {
        marginLeft: '.4rem',
        background: isPending ? '#7B0000' : (color || 'var(--ink-5)'),
        color: '#fff', fontSize: '.66rem', padding: '.05rem .42rem',
        borderRadius: '999px', fontWeight: 700, lineHeight: 1.4
      },
      title: isPending ? (c.pending + ' изискват внимание от ' + c.total) : (c.total + ' общо')
    }, isPending ? (c.pending + '/' + c.total) : c.total);
  };

  const subtitle = _FIN_SUBTITLES[finSubTab] || _FIN_SUBTITLES.projects;

  const goToRecent = (r) => {
    setFinSubTab(r.section);
    // v12.36.5-url: reflect the open project in the address bar so every
    // project tab lives under its own readable / (sub-page of /projects).
    // Mirrors the developer-requested routing: /projects/:id,
    // /projects/:id/members, /projects/:id/reports. Back/forward already
    // re-applies the route via the popstate listener in App.
    try {
      if (r && r.projectId) {
        var _url = '/projects/' + encodeURIComponent(r.projectId);
        if (r.section === 'members') _url += '/members';
        else if (r.section === 'reports' || r.section === 'mon') _url += '/reports';
        history.pushState({}, '', _url);
      }
    } catch (_) {}
    // Sub-view listens for this event to open the detail modal directly.
    try { window.dispatchEvent(new CustomEvent('erp:financeOpen', { detail: r })); } catch (_) {}
  };

  // v12.36.2-deeplink: fetch project members on /projects/:id deep link
  const [deepData, setDeepData] = useState(null);
  useEffect(() => {
    if (!deepProjectId || !user) return;
    var p = typeof api === 'function' ? api : (window.api || function(){return Promise.resolve({success:false})});
    p('getprojectmembers', { projectId: deepProjectId }).then(function(r){
      if (r && r.success) setDeepData(r);
    }).catch(function(){});
  }, [deepProjectId, user]);

  return e(Fragment, null,
    e('div', { className:'page-top', style:{ marginBottom:'.85rem' } },
      e('div', { className:'page-top-left' },
        e('h2', { className:'page-title', style:{ margin:0, display:'flex', alignItems:'center', gap:'.55rem' } },
          e('i', { className:'fas fa-coins', 'aria-hidden':'true', style:{ color:'var(--primary)' } }),
          'Отчетност'
        ),
        e('div', { className:'page-subtitle', style:{ fontSize:'.78rem', color:'var(--ink-4)', marginTop:'.2rem' } }, subtitle)
      ),
      // Recently opened jump-pills (right side of header)
      recent.length > 0 && e('div', { className:'page-top-actions', style:{ display:'flex', gap:'.35rem', alignItems:'center', flexWrap:'wrap' } },
        e('span', { style:{ fontSize:'.7rem', color:'var(--ink-4)', marginRight:'.2rem' } },
          e('i', { className:'fas fa-clock-rotate-left', style:{ marginRight:'.25rem' } }), 'Последни:'),
        recent.map(r => e('button', {
          key: r.section + ':' + r.id,
          type:'button',
          className:'btn btn-sm btn-outline',
          onClick: () => goToRecent(r),
          title: 'Отвори отново ' + r.label,
          style:{ fontSize:'.7rem', padding:'.18rem .55rem' }
        }, e('i', { className:'fas ' + (r.icon||'fa-file'), style:{ marginRight:'.25rem', fontSize:'.65rem' } }), r.label))
      )
    ),
    e('div', { className:'fd-tabs', style:{ marginBottom:'1rem' }, role:'tablist', 'aria-label':'Отчетност' },
      e('button', { type:'button', className:'fd-tab '+(finSubTab==='projects'?'active':''), role:'tab',
        'aria-selected': finSubTab==='projects', onClick:()=>setFinSubTab('projects'),
        title: 'Alt+1 — Проектни отчети' },
        e('i', { className:'fas fa-chart-bar', 'aria-hidden':'true' }), ' Проектни отчети', renderBadge('projects', 'var(--primary)')),
      e('button', { type:'button', className:'fd-tab '+(finSubTab==='expenses'?'active':''), role:'tab',
        'aria-selected': finSubTab==='expenses', onClick:()=>setFinSubTab('expenses'),
        title: 'Alt+2 — Разходи' },
        e('i', { className:'fas fa-receipt', 'aria-hidden':'true' }), ' Разходи', renderBadge('expenses', '#7B0000')),
      canMonReports && e('button', { type:'button', className:'fd-tab '+(finSubTab==='mon'?'active':''), role:'tab',
        'aria-selected': finSubTab==='mon', onClick:()=>setFinSubTab('mon'),
        title: 'Alt+3 — МОН отчети' },
        e('i', { className:'fas fa-building-columns', 'aria-hidden':'true' }), ' МОН отчети', renderBadge('mon', 'var(--gold)')),
      canLibraryDeposits && e('button', { type:'button', className:'fd-tab '+(finSubTab==='library'?'active':''), role:'tab',
        'aria-selected': finSubTab==='library', onClick:()=>setFinSubTab('library'),
        title: 'Alt+4 — Библиотечни депозити' },
        e('i', { className:'fas fa-book', 'aria-hidden':'true' }), ' Библиотечни депозити', renderBadge('library', '#5b48d8')),
      e('button', { type:'button', className:'fd-tab '+(finSubTab==='budget'?'active':''), role:'tab',
        'aria-selected': finSubTab==='budget', onClick:()=>setFinSubTab('budget'),
        title: 'Alt+5 — Бюджет' },
        e('i', { className:'fas fa-chart-pie', 'aria-hidden':'true' }), ' Бюджет')
    ),
    deepData && deepProjectId && e('div',{className:'card',style:{marginBottom:'1rem',padding:'1rem',borderColor:'var(--primary)',borderLeft:'4px solid var(--primary)'}},
      e('div',{style:{display:'flex',alignItems:'center',gap:'.6rem',flexWrap:'wrap'}},
        e('i',{className:'fas fa-link',style:{color:'var(--primary)'}}),
        e('strong',null,deepData.title||deepProjectId),
        deepData.code&&e('span',{className:'badge',style:{background:'var(--bg-2)',color:'var(--ink-3)',fontSize:'.72rem'}},deepData.code),
        deepData.leader&&deepData.leader.name&&e('span',{style:{fontSize:'.78rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-user',style:{marginRight:'.25rem'}}),deepData.leader.name),
        Array.isArray(deepData.members)&&deepData.members.length>0&&e('span',{style:{fontSize:'.78rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-users',style:{marginRight:'.25rem'}}),deepData.members.length,' члена')
      ),
      deepSub&&e('div',{style:{marginTop:'.5rem',fontSize:'.75rem',color:'var(--ink-4)'}},
        'Преглед: ',deepSub==='members'?'Членове на проекта':'Отчети на проекта')
    ),
    finSubTab==='projects' && (M_ProjectReportsView
      ? e(M_ProjectReportsView, { user, isAdmin, userRole })
      : e('div', { className:'card', style:{ padding:'1.2rem' } }, e('div', { className:'empty-state' }, e('i', { className:'fas fa-chart-bar' }), e('div', null, 'Модулът „Проектни отчети" не е зареден.')))),
    finSubTab==='expenses' && (M_ExpensesViewMemo
      ? e(M_ExpensesViewMemo, { user, isAdmin, userRole })
      : e('div', { className:'card', style:{ padding:'1.2rem' } }, e('div', { className:'empty-state' }, e('i', { className:'fas fa-receipt' }), e('div', null, 'Модулът „Разходи" не е зареден.')))),
    finSubTab==='mon' && canMonReports && (M_MinistryReportsView
      ? e(M_MinistryReportsView, { user, isAdmin, userRole })
      : e('div', { className:'card', style:{ padding:'1.2rem' } }, e('div', { className:'empty-state' }, e('i', { className:'fas fa-building-columns' }), e('div', null, 'Модулът „МОН отчети" не е зареден.')))),
    finSubTab==='library' && canLibraryDeposits && (M_LibraryDepositsView
      ? e(M_LibraryDepositsView, { user, isAdmin, userRole })
      : e('div', { className:'card', style:{ padding:'1.2rem' } }, e('div', { className:'empty-state' }, e('i', { className:'fas fa-book' }), e('div', null, 'Модулът „Библиотечни депозити" не е зареден.')))),
    finSubTab==='budget' && (M_BudgetTrackerView
      ? e(M_BudgetTrackerView, { user, isAdmin, userRole })
      : e('div', { className:'card', style:{ padding:'1.2rem' } }, e('div', { className:'empty-state' }, e('i', { className:'fas fa-chart-pie' }), e('div', null, 'Модулът „Бюджет" не е зареден.'))))
  );
};

// ── Teacher directory (browse ALL, client-side filter) ─────────────────────
// v12.38.2-teachers: full institutional directory scraped from ue-varna.bg
// (academic/research). Loads assets/teachers.json (278 records) and renders a
// responsive card grid with Търсене на преподавател + Катедра + Звание filters.
var TeacherLookupView = memo(function TeacherLookupView(props) {
  var data = useState(null); var setData = data[1]; data = data[0];
  var struct = useState(null); var setStruct = struct[1]; struct = struct[0];
  var q = useState(''); var setQ = q[1]; q = q[0];
  var faculty = useState(''); var setFaculty = faculty[1]; faculty = faculty[0];
  var dept = useState(''); var setDept = dept[1]; dept = dept[0];
  var title = useState(''); var setTitle = title[1]; title = title[0];
  var loading = useState(true); var setLoading = loading[1]; loading = loading[0];
  var err = useState(null); var setErr = err[1]; err = err[0];
  var expandedTeacher = useState(null); var setExpandedTeacher = expandedTeacher[1]; expandedTeacher = expandedTeacher[0];
  var showPubs = useState(null); var setShowPubs = showPubs[1]; _showPubs = showPubs[0];
  var works = useState({}); var setWorks = works[1]; works = works[0];
  var worksLoading = useState({}); var setWorksLoading = worksLoading[1]; worksLoading = worksLoading[0];
  var subView = useState('lookup'); var setSubView = subView[1]; subView = subView[0];


  useEffect(function () {
    setLoading(true); setErr(null);
    Promise.all([
      fetch('assets/teachers.json?v=' + (__ERP_BUILD || '')).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }),
      fetch('assets/admin-structure.json?v=' + (__ERP_BUILD || '')).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      setData(res[0] && res[0].teachers ? res[0].teachers : []);
      setStruct(res[1]);
    }).catch(function (e) { setErr('Неуспешно зареждане на списъка с общности.'); })
      .finally(function () { setLoading(false); });
  }, []);

  useEffect(function () {
    if (!expandedTeacher || !expandedTeacher.email || works[expandedTeacher.email]) return;
    setWorksLoading(function (w) { var o = Object.assign({}, w); o[expandedTeacher.email] = true; return o; });
    api('getscientificworks', { email: expandedTeacher.email }).then(function (res) {
      if (res && res.success && Array.isArray(res.works)) {
        setWorks(function (w) { var o = Object.assign({}, w); o[expandedTeacher.email] = res.works; return o; });
      }
    }).catch(function () {}).finally(function () {
      setWorksLoading(function (w) { var o = Object.assign({}, w); o[expandedTeacher.email] = false; return o; });
    });
  }, [expandedTeacher]);

  // Normalize faculty names so "Колеж по туризъм – Варна" matches the
  // canonical "Колеж по туризъм" from admin-structure.json.
  var normFaculty = function (f) { return (f || '').replace(/\s*[–-]\s*Варна\s*$/i, '').trim(); };

  var teachers = data || [];
  // Faculty list: prefer admin-structure order; fall back to distinct values.
  var faculties = struct && Array.isArray(struct.faculties)
    ? struct.faculties.map(function (f) { return f.name; })
    : Array.from(new Set(teachers.map(function (t) { return normFaculty(t.faculty); }))).filter(Boolean).sort();
  // Departments filtered by the chosen faculty (so the dept dropdown is contextual).
  var depts = Array.from(new Set(teachers.filter(function (t) {
    return !faculty || normFaculty(t.faculty) === normFaculty(faculty);
  }).map(function (t) { return t.department; }))).sort();
  var titles = Array.from(new Set(teachers.map(function (t) { return t.title; }))).sort();
  // Stable color per faculty for the badge.
  var facultyColor = function (f) {
    var pal = ['#233874', '#0F7E66', '#9C4400', '#7B2D8E', '#1F7A6A', '#234B8C', '#8A6D00'];
    var i = faculties.indexOf(f); return pal[(i < 0 ? 0 : i) % pal.length];
  };

  var filtered = teachers.filter(function (t) {
    var hay = (t.full_name + ' ' + (t.title || '') + ' ' + (t.department || '') + ' ' + (t.email || '')).toLowerCase();
    return (!q || hay.indexOf(q.toLowerCase()) > -1)
        && (!faculty || normFaculty(t.faculty) === normFaculty(faculty))
        && (!dept || t.department === dept)
        && (!title || t.title === title);
  });

  return e('div', { className: 'teacher-lookup-wrap' },
    e('div', { className: 'page-top' },
      e('div', { className: 'page-top-left' },
        e('h2', null, 'Търсене'),
        e('p', null, 'Преглед на всички общности и ръководители в ИУ – Варна (академична справка). Филтрирайте по име, факултет, катедра или научно звание.'))),
    e('div', { className: 'card', style: { marginBottom: '1rem' } },
      e('div', { className: 'card-body', style: { display: 'flex', gap: '.5rem', flexWrap: 'wrap' } },
        e('input', { className: 'form-input', type: 'search', placeholder: 'Име, катедра или имейл…',
          value: q, onChange: function (ev) { setQ(ev.target.value); }, style: { flex: '1 1 220px' } }),
        e('select', { className: 'form-input', value: faculty, onChange: function (ev) { setFaculty(ev.target.value); setDept(''); }, style: { flex: '1 1 180px' } },
          e('option', { value: '' }, 'Всички факултети'),
          faculties.map(function (f) { return e('option', { key: f, value: f }, f); })),
        e('select', { className: 'form-input', value: dept, onChange: function (ev) { setDept(ev.target.value); }, style: { flex: '1 1 180px' } },
          e('option', { value: '' }, 'Всички катедри'),
          depts.map(function (d) { return e('option', { key: d, value: d }, d); })),
        e('select', { className: 'form-input', value: title, onChange: function (ev) { setTitle(ev.target.value); }, style: { flex: '1 1 140px' } },
          e('option', { value: '' }, 'Всички звания'),
          titles.map(function (t) { return e('option', { key: t, value: t }, t); })))),
    e('div', { className: 'veda-subnav', style: { display: 'flex', gap: '.5rem', marginBottom: '1rem', borderBottom: '2px solid var(--bg-2)', paddingBottom: '.5rem' } },
      e('button', { type:'button', className: 'btn btn-sm ' + (subView === 'lookup' ? 'btn-primary' : 'btn-outline'), onClick: function () { setSubView('lookup'); } }, e('i', { className: 'fas fa-list' }), ' Списък')
    ),
    loading && e('div', { className: 'empty-state' }, e('i', { className: 'fas fa-spinner fa-spin' }), e('div', null, 'Зареждане…')),
    err && e('div', { className: 'form-error' }, err),
    !loading && subView === 'lookup' && e('div', null,
      e('div', { style: { fontSize: '.8rem', color: 'var(--ink-4)', marginBottom: '.5rem' } },
        filtered.length + ' от ' + teachers.length + ' общности'),
      e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1rem' } },
        filtered.map(function (t) {
          var _avatar = t.photo
            ? e('img', { src: t.photo, alt: t.full_name, width: 44, height: 44,
                style: { borderRadius: '50%', objectFit: 'cover' }, loading: 'lazy',
                onError: function (ev) { ev.currentTarget.style.display = 'none'; } })
            : e('i', { className: 'fas fa-user-circle', style: { fontSize: '2rem', color: 'var(--primary)' } });
          var _fac = normFaculty(t.faculty);
          var _name = e('div', null,
            e('div', { style: { fontWeight: 700 } }, t.full_name),
            e('div', { style: { fontSize: '.78rem', color: 'var(--ink-4)' } }, t.title));
          var _meta = e('div', { style: { marginTop: '.6rem', fontSize: '.8rem', display: 'grid', gap: '.25rem' } },
            e('div', null, e('span', { style: { color: 'var(--ink-4)' } }, 'Катедра: '), t.department),
            e('div', null, e('span', { style: { color: 'var(--ink-4)' } }, 'Кабинет: '), t.room || '—'),
            t.email ? e('div', null, e('a', { href: 'mailto:' + t.email }, t.email)) : null,
            (t.phone && t.phone.indexOf('*') === -1) ? e('div', null, e('a', { href: 'tel:' + t.phone }, t.phone)) : null);
          var _links = e('div', { style: { marginTop: '.35rem', display:'grid', gap:'.25rem' } },
                                t.orcid ? e('a', { href: 'https://orcid.org/' + t.orcid, target:'_blank', rel:'noopener', style: { fontSize:'.78rem' } }, 'ORCID: ' + t.orcid) : null,
                                t.scopusAuthorId ? e('a', { href: 'https://www.scopus.com/authid/detail.uri?authorId=' + t.scopusAuthorId, target:'_blank', rel:'noopener', style: { fontSize:'.78rem' } }, 'Scopus: ' + t.scopusAuthorId) : null);
                    // v12.54.36: ORCID + Scopus publications panel — reformed UI
                    var _pubsVisible = expandedTeacher && expandedTeacher.email === t.email && _showPubs === t.email;
                    var _works = e('div', { style: { marginTop: '.5rem' } },
                      e('button', {
                          className: 'btn btn-sm ' + (_pubsVisible ? 'btn-primary' : 'btn-outline'),
                          onClick: function () { setShowPubs(_showPubs === t.email ? null : t.email); setExpandedTeacher(t); },
                          style: { width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '.5rem' }
                        },
                        e('i', { className: 'fas fa-book' }),
                                      e('span', { style: { background: 'rgba(255,255,255,.25)', borderRadius: 12, padding: '.1rem .5rem', fontSize: '.75rem', fontWeight: 700 } }, works[t.email] && works[t.email].length),
                                      e('i', { className: 'fas fa-' + (_pubsVisible ? 'chevron-up' : 'chevron-down'), style: { marginLeft: 'auto', fontSize: '.7rem' } })
                      ),
                      _pubsVisible && typeof window.StaffPublicationsPanel === 'function' && e(window.StaffPublicationsPanel, { email: t.email, name: t.name, onClose: function () { setShowPubs(null); } })
                    );
                              return e('div', { key: t.teacher_id || t.email, className: 'teacher-card',
                                            style: { padding: '1rem', border: '1px solid var(--bg-2)', borderRadius: 8, background: 'var(--surface)' } },
                                          e('div', { style: { display: 'flex', alignItems: 'center', gap: '.6rem', justifyContent: 'space-between' } },
                                            e('div', { style: { display: 'flex', alignItems: 'center', gap: '.6rem' } }, _avatar, _name),
                                            _fac ? e('span', { className: 'type-tag', style: { background: facultyColor(_fac), color: '#fff', border: 'none' } }, _fac) : null),
                                          _meta, _links, _works);
        }))
      )
    )
});

// ── Community View (Общност) — Reviewers + Teachers + VEDA ──
// v12.47.19 role-streamline: the Рецензенти nav tab is now visible to ALL
// authenticated users (applicants included) so an applicant can open the
// section and see the staff/teacher directory (TeacherLookupView). The
// reviewers *management* UI (M_ReviewersView — pool, assignments, stats) is
// intentionally hidden from plain applicants: `showReviewers` is gated on
// isAdmin || isReviewer || hasReviewerAssignments. A plain applicant's role
// is bumped to ROLE_APPLICANT_REVIEWER by the getreviewerforms probe
// (app.js:1046) the moment they receive a live assignment, which flips
// isReviewer=true and reveals the reviewers UI. Until then only the
// teacher/staff directory is shown.
var CommunityView=memo(function CommunityView(props){
  var isReviewer=!!props.isReviewer;
  var hasReviewerAssignments=!!props.hasReviewerAssignments;
  var showReviewers=props.isAdmin||isReviewer||hasReviewerAssignments;
  var subView=useState(showReviewers?'reviewers':'teachers'); var setSubView=subView[1]; subView=subView[0];
  return e('div',{style:{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}},
    e('div',{style:{display:'flex',gap:'.5rem',marginBottom:'1rem',borderBottom:'2px solid var(--bg-2)',paddingBottom:'.5rem'}},
      showReviewers&&e('button',{type:'button',className:'btn btn-sm '+(subView==='reviewers'?'btn-primary':'btn-outline'),onClick:function(){setSubView('reviewers')}},e('i',{className:'fas fa-users'}),' Общност'),
      e('button',{className:'btn btn-sm '+(subView==='teachers'?'btn-primary':'btn-outline'),onClick:function(){setSubView('teachers')}},e('i',{className:'fas fa-chalkboard-user'}),' Преподаватели')
    ),
    showReviewers&&subView==='reviewers'&&e(M_ReviewersView,{isAdmin:props.isAdmin,forms:props.forms,competitions:props.competitions}),
    subView==='teachers'&&e(TeacherLookupView,{userEmail:props.user.email,userName:props.user.name,userPicture:props.user.picture})
  );
});

// ── VEDA Panel wrapper (mounts window.VedaChat imperative UI) ────────────
var VedaPanel=memo(function VedaPanel(props){
  var user=props.user;
  var containerRef=useRef(null);
  var chatRef=useRef(null);

  useEffect(function(){
    if(!containerRef.current)return;
    if(typeof window!=='undefined'&&window.VedaChat&&typeof window.VedaChat.render==='function'){
      window.VedaChat.render(containerRef.current,{user:user});
      chatRef.current=true;
    }
    return function(){
      if(chatRef.current&&typeof window!=='undefined'&&window.VedaChat&&typeof window.VedaChat.destroy==='function'){
        window.VedaChat.destroy();
        chatRef.current=false;
      }
    };
  },[]);

  useEffect(function(){
    if(chatRef.current&&typeof window!=='undefined'&&window.VedaChat&&typeof window.VedaChat.render==='function'){
      window.VedaChat.render(containerRef.current,{user:user});
    }
  },[user]);

  return e('div',{ref:containerRef,className:'veda-panel-root',style:{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}});
});

// ── Static site footer (memoized) ──────────────────────────────────────────
// The footer is 100% static (no activeTab/user/lang/session deps), yet it was
// previously inlined inside App's JSX, so every setActiveTab / data-stream tick
// / setLang re-rendered and reconciled ~145 elements for zero visual change.
// Hoisting it into a memoized component makes it render ONCE and skip
// reconciliation on every subsequent App re-render → faster tab switches.
var SiteFooter=memo(function SiteFooter(props){
  var onA11yClick=props.onA11yClick||function(){};
  return e('footer',{className:'site-footer',role:'contentinfo'},
    e('div',{className:'footer-social-band'},
      e('div',{className:'footer-social-inner'},
        e('a',{href:'https://www.facebook.com/ue.varna',target:'_blank',rel:'noopener','aria-label':'Facebook',className:'footer-social-link'},
          e('i',{className:'fab fa-facebook-square'}),e('span',null,'Facebook')),
        e('a',{href:'https://x.com/UE_VARNA',target:'_blank',rel:'noopener','aria-label':'X (Twitter)',className:'footer-social-link'},
          e('i',{className:'fab fa-x-twitter'}),e('span',null,'X')),
        e('a',{href:'https://www.linkedin.com/school/university-of-economics-varna/',target:'_blank',rel:'noopener','aria-label':'LinkedIn',className:'footer-social-link'},
          e('i',{className:'fab fa-linkedin'}),e('span',null,'LinkedIn')),
        e('a',{href:'https://www.instagram.com/ueVarna/',target:'_blank',rel:'noopener','aria-label':'Instagram',className:'footer-social-link'},
          e('i',{className:'fab fa-instagram'}),e('span',null,'Instagram')),
        e('a',{href:'https://www.youtube.com/@UniversityOfEconomicsVarna',target:'_blank',rel:'noopener','aria-label':'YouTube',className:'footer-social-link'},
          e('i',{className:'fab fa-youtube'}),e('span',null,'Youtube'))
      )
    ),
    e('div',{className:'footer-main'},
      e('div',{className:'footer-grid'},
        e('div',{className:'footer-col footer-col-brand'},
          e('div',{className:'footer-brand-logos'},
            e('a',{href:'https://ue-varna.bg',target:'_blank',rel:'noopener','aria-label':'Икономически университет – Варна'},
              e('img',{className:'footer-logo-106',src:'assets/uev-social-logo.png?v=8.6.2',alt:'ИУ – Варна · С академични традиции в бъдещето',loading:'lazy',width:140,height:140,onError:ev=>{var t=ev&&ev.currentTarget;if(!t||t.dataset.fb)return;t.dataset.fb='1';t.src=UEV_LOGO_URL;t.classList.add('footer-logo-106-fallback');}})
            )
          ),
          e('address',{className:'footer-address'},
            e('div',{className:'footer-addr-row'},
              e('i',{className:'fas fa-university','aria-hidden':'true'}),
              e('span',{translate:'no'},'бул. „Княз Борис I" 77, Варна 9002')),
            e('div',{className:'footer-addr-row'},
              e('i',{className:'fas fa-phone','aria-hidden':'true'}),
              e('a',{href:'tel:+359****0890',translate:'no'},'+359 52 800 890')),
            e('div',{className:'footer-addr-row'},
              e('i',{className:'fas fa-envelope','aria-hidden':'true'}),
              e('a',{href:'mailto:infocenter@ue-varna.bg',translate:'no'},'infocenter@ue-varna.bg')),
            e('div',{className:'footer-addr-row'},
              e('i',{className:'fas fa-map-marker-alt','aria-hidden':'true'}),
              e('a',{href:'https://google.com/maps/place/University+of+Economics+-+Varna/@43.2086,27.9237,15z/data=!4m5!3m4!1s0x0:0x3d401ef3c09a59bf!8m2!3d43.209057!4d27.923601?hl=en',target:'_blank',rel:'noopener'},
                e('span',{className:'i18n-bg'},'Карта'),
                e('span',{className:'i18n-en'},'Map')))
          )
        ),
        e('div',{className:'footer-col'},
          e('h4',{className:'footer-col-title'},
            e('span',{className:'i18n-bg'},'Прием'),
            e('span',{className:'i18n-en'},'Admissions')),
          e('ul',{className:'footer-link-list'},
            e('li',null,e('a',{href:'https://ue-varna.bg/bg/p/85/profesionalen-bakalavar',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Професионален бакалавър'),
              e('span',{className:'i18n-en'},'Vocational bachelor'))),
            e('li',null,e('a',{href:'https://ue-varna.bg/bg/p/86/bakalavar',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Бакалавър'),
              e('span',{className:'i18n-en'},'Bachelor'))),
            e('li',null,e('a',{href:'https://ue-varna.bg/bg/p/87/magistar',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Магистър'),
              e('span',{className:'i18n-en'},'Master'))),
            e('li',null,e('a',{href:'https://ue-varna.bg/bg/p/88/doktor',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Доктор'),
              e('span',{className:'i18n-en'},'Doctoral'))),
            e('li',null,e('a',{href:'https://ue-varna.bg/bg/p/89/prodalzhavashto-obuchenie',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Продължаващо обучение'),
              e('span',{className:'i18n-en'},'Continuing education')))
          )
        ),
        e('div',{className:'footer-col'},
          e('h4',{className:'footer-col-title'},
            e('span',{className:'i18n-bg'},'Информация'),
            e('span',{className:'i18n-en'},'Information')),
          e('ul',{className:'footer-link-list'},
            e('li',null,e('a',{href:'https://scienceandresearch.ue-varna.bg/doctoral-school/',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Докторантско училище'),
              e('span',{className:'i18n-en'},'Doctoral school'))),
            e('li',null,e('a',{href:'https://scienceandresearch.ue-varna.bg/nii/',target:'_blank',rel:'noopener',translate:'no'},'НИИ')),
            e('li',null,e('a',{href:'https://scienceandresearch.ue-varna.bg/business-services/',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Бизнес услуги'),
              e('span',{className:'i18n-en'},'Business services'))),
            e('li',null,e('a',{href:'https://scienceandresearch.ue-varna.bg/trainings/',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Тренинги'),
              e('span',{className:'i18n-en'},'Trainings'))),
            e('li',null,e('a',{href:'https://scienceandresearch.ue-varna.bg/workshops/',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Уъркшопи'),
              e('span',{className:'i18n-en'},'Workshops'))),
            e('li',null,e('a',{href:'https://scienceandresearch.ue-varna.bg/icebm/',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Конференция ICEBM'),
              e('span',{className:'i18n-en'},'ICEBM Conference'))),
            e('li',null,e('a',{href:'https://scienceandresearch.ue-varna.bg/useful/',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Полезно'),
              e('span',{className:'i18n-en'},'Useful')))
          )
        ),
        e('div',{className:'footer-col footer-col-info'},
          e('a',{className:'footer-project-sci-link',href:'https://scienceandresearch.ue-varna.bg/',target:'_blank',rel:'noopener','aria-label':'Научноизследователска дейност'},
            e('img',{className:'footer-logo-sci',src:LOGO_URL,alt:'НИИ',loading:'lazy',width:60,height:60})
          ),
          e('h4',{className:'footer-col-title'},
            e('span',{className:'i18n-bg'},'Допълнителна информация'),
            e('span',{className:'i18n-en'},'Additional information')),
          e('ul',{className:'footer-link-list'},
            e('li',null,e('a',{href:'https://ue-varna.bg/bg/p/8207/za-nas/finansova-informatsia',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Финансова информация'),
              e('span',{className:'i18n-en'},'Financial information'))),
            e('li',null,e('a',{href:'https://ue-varna.bg/bg/p/96/chesto-zadavani-vaprosi',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Често задавани въпроси'),
              e('span',{className:'i18n-en'},'FAQ'))),
            e('li',null,e('a',{href:'https://ue-varna.bg/bg/p/8561/nauchnoizsledovatelski-institut/novini-i-sabitia',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Новини'),
              e('span',{className:'i18n-en'},'News'))),
            e('li',null,e('a',{href:'https://ue-varna.bg/bg/p/8383/za-nas/kontakti',target:'_blank',rel:'noopener'},
              e('span',{className:'i18n-bg'},'Контакти'),
              e('span',{className:'i18n-en'},'Contacts')))
          ),
          e('div',{className:'footer-project-contact'},
            e('div',{className:'footer-project-title'},
              e('i',{className:'fas fa-flask','aria-hidden':'true'}),
              e('span',{className:'i18n-bg'},'За контакти (Научни проекти)'),
              e('span',{className:'i18n-en'},'Project contacts')),
            e('div',{className:'footer-project-row'},
              e('i',{className:'fas fa-envelope','aria-hidden':'true'}),
              e('a',{href:'mailto:scientific.projects@ue-varna.bg',translate:'no'},'scientific.projects@ue-varna.bg')),
            e('div',{className:'footer-project-row'},
              e('i',{className:'fas fa-phone','aria-hidden':'true'}),
              e('a',{href:'tel:+359****4725',translate:'no'},'0882 164 725'))
          )
        )
      )
    ),
    e('div',{className:'footer-bottom'},
      e('span',{className:'footer-copy-text'},
        e('span',{className:'i18n-bg'},'© 2026 Икономически университет – Варна'),
        e('span',{className:'i18n-en'},'© 2026 University of Economics – Varna')),
      e('span',{style:{margin:'0 .5rem',color:'var(--ink-4)'}},'•'),
      e('button',{type:'button',className:'footer-a11y-link',onClick:onA11yClick,'aria-haspopup':'dialog'},
        e('i',{className:'fas fa-universal-access','aria-hidden':'true',style:{marginRight:'.35rem'}}),
        e('span',{className:'i18n-bg'},'Декларация за достъпност'),
        e('span',{className:'i18n-en'},'Accessibility statement'))
    )
  );
});

// ── Readable-URL routing (module scope): parse /projects* deep links ──
// NOTE: there is no literal 'projects' tab; projects live under the
// 'finance' tab as finSubTab='projects'. parseRoute returns a logical
// route with tab:'projects'; apply* helpers translate it to the real
// finance/projects view so existing tabs are never broken.
function parseRoute(){
  try{
    var loc=window.location||{};
    var path=(loc.pathname||'/').replace(/\/+$/,'')||'/';
    var search=loc.search||'';
    var q=new URLSearchParams(search);
    var m;
    // ── v12.37.7-sections: every ERP section is its own readable URL ──
    var SECTION_TABS={documents:'documents',projects:'projects',finance:'finance',dashboard:'dashboard',calendar:'calendar',applications:'applications',reviewers:'reviewers',teachers:'teachers',whoami:'whoami'};
    var _seg=path.split('/')[1];
    if(_seg && SECTION_TABS[_seg]){
      var _params={tab:SECTION_TABS[_seg]};
      if(_seg==='documents'){ _params.docSub=(q.get('view')||null); }
      if(_seg==='finance'){ _params.finSub=(q.get('view')||null); }
      if(_seg==='dashboard'){ _params.dashComp=(q.get('comp')||null); }
      return {path:path,params:_params};
    }
    if((m=path.match(/^\/applications\/([^/]+)$/))){
      return {path:path,params:{tab:'applications',appId:m[1]}};
    }
    if(path==='/projects'){
      return {path:path,params:{tab:'projects',sessionId:(q.get('session_id')||null)}};
    }
    if((m=path.match(/^\/projects\/([^/]+)\/members$/))){
      return {path:path,params:{tab:'projects',projectId:m[1],sub:'members'}};
    }
    if((m=path.match(/^\/projects\/([^/]+)\/reports$/))){
      return {path:path,params:{tab:'projects',projectId:m[1],sub:'reports'}};
    }
    if((m=path.match(/^\/projects\/([^/]+)$/))){
      return {path:path,params:{tab:'projects',projectId:m[1]}};
    }
    return null;
  }catch(_){return null;}
}

var App=()=>{
const[user,setUser]=useState(()=>_APP_INIT.user);const[userRole,setUserRole]=useState(()=>_APP_INIT.role);const isAdmin=isAdminRole(userRole);const isReviewer=isReviewerRole(userRole);const[forms,setForms]=useState([]);const[dataLoading,setDataLoading]=useState(false);const[activeTab,setActiveTab]=useState(()=>{try{var v=sessionStorage.getItem('erp:activeTab');if(v==='assets')v='documents';if(v==='reporting'||v==='mon_reports')v='finance';return v||'applications'}catch(_){return'applications'}});const[docSubTab,setDocSubTab]=useState(()=>{try{return sessionStorage.getItem('erp:docSubTab')||'documents'}catch(_){return'documents'}});const[finSubTab,setFinSubTab]=useState(()=>{try{var v=sessionStorage.getItem('erp:finSubTab');return (v==='projects'||v==='mon'||v==='library'||v==='expenses'||v==='budget')?v:'projects'}catch(_){return'projects'}});const[showProfileModal,setShowProfileModal]=useState(false);const[showA11y,setShowA11y]=useState(false);const[showQA,setShowQA]=useState(false);const[showDrawer,setShowDrawer]=useState(false);const[drawerClosing,setDrawerClosing]=useState(false);const[lang,setLang]=useState(()=>localStorage.getItem('erp-lang')||'bg');const[showCommandPalette,setShowCommandPalette]=useState(false);const[commandPaletteQuery,setCommandPaletteQuery]=useState('');const toggleLang=useCallback(()=>{const nl=lang==='bg'?'en':'bg';setLang(nl);document.documentElement.lang=nl;localStorage.setItem('erp-lang',nl);if(window.STATE)window.STATE.language=nl;if(window.ERP_I18N)window.ERP_I18N.setLang(nl);},[lang]);const[theme,setTheme]=useState(()=>{try{return localStorage.getItem('erp-theme')}catch(_){return null} });const toggleTheme=useCallback(()=>{const next=theme==='dark'?'light':theme==='light'?'dark':null;setTheme(next);if(next){localStorage.setItem('erp-theme',next);document.documentElement.setAttribute('data-theme',next)}else{localStorage.removeItem('erp-theme');document.documentElement.removeAttribute('data-theme')}if(window.STATE)window.STATE.theme=next},[theme]);
const[breadcrumbItems,setBreadcrumbItems]=useState([]);
// E3 breadcrumb: child nodes appended after the tab label on the single shell strip
const breadcrumbTrail=useMemo(()=>{if(!breadcrumbItems||!breadcrumbItems.length)return null;return breadcrumbItems.map((item,idx)=>e(Fragment,{key:idx},e('span',{className:'bc-sep'},e('i',{className:'fas fa-chevron-right'})),item.href?e('a',{href:item.href,target:item.target||'_blank',rel:item.rel||'noopener',onClick:item.onClick},item.label):e('span',{style:{color:'var(--ink-3)'}},item.label)));},[breadcrumbItems]);
// ── Readable-URL routing: deep-link state (stashed from /projects* URLs) ──
const[deepProjectId,setDeepProjectId]=useState(()=>{try{return sessionStorage.getItem('erp:deepProjectId')||null}catch(_){return null}});
const[deepSub,setDeepSub]=useState(()=>{try{return sessionStorage.getItem('erp:deepSub')||null}catch(_){return null}});
const[deepSessionId,setDeepSessionId]=useState(()=>{try{return sessionStorage.getItem('erp:deepSessionId')||null}catch(_){return null}});
const[deepAppId,setDeepAppId]=useState(()=>{try{return localStorage.getItem('erp:deepAppId')||null}catch(_){return null}});
// Persist deep-link state so a refresh restores the specific application/project.
const _persistDeepProjectId=(v)=>{try{sessionStorage.setItem('erp:deepProjectId',v||'')}catch(_){}};
const _persistDeepSub=(v)=>{try{sessionStorage.setItem('erp:deepSub',v||'')}catch(_){}};
const _persistDeepSessionId=(v)=>{try{sessionStorage.setItem('erp:deepSessionId',v||'')}catch(_){}};
const _persistDeepAppId=(v)=>{try{localStorage.setItem('erp:deepAppId',v||'')}catch(_){}};
// Translate a parsed /projects* route into the real finance/projects view.
// Keeps parseRoute's logical tab:'projects' separate from the actual tab.
const applyProjectsRoute=useCallback((p)=>{try{
  if(!p||p.tab!=='projects')return;
  setActiveTab('finance');
  setFinSubTab('projects');
  setDeepSessionId(p.sessionId!=null?p.sessionId:null);
  _persistDeepSessionId(p.sessionId!=null?p.sessionId:null);
  setDeepProjectId(p.projectId!=null?p.projectId:null);
  _persistDeepProjectId(p.projectId!=null?p.projectId:null);
  setDeepSub(p.sub!=null?p.sub:null);
  _persistDeepSub(p.sub!=null?p.sub:null);
}catch(_){}},[setActiveTab,setFinSubTab,setDeepSessionId,setDeepProjectId,setDeepSub]);
// v12.37.7-sections: unified route applier — sets the active tab (and
// sub-tabs) from parsed params for ALL sections, then defers projects
// deep-link handling to applyProjectsRoute.
const applyRouteParams=useCallback((p)=>{try{
  if(!p||!p.tab)return;
  if(p.docSub)setDocSubTab(p.docSub);
  if(p.finSub)setFinSubTab(p.finSub);
  if(p.tab!=='projects'){ setActiveTab(p.tab); }
  if(p.appId) setDeepAppId(p.appId);
  _persistDeepAppId(p.appId||null);
  applyProjectsRoute(p);
}catch(_){}},[setActiveTab,setDocSubTab,setFinSubTab,setDeepAppId,applyProjectsRoute]);
// v12.48.1: /whoami is admin-only; bounce non-admins to applications.
useEffect(()=>{ if(activeTab==='whoami'&&!isAdmin){ setActiveTab('applications'); } },[activeTab,isAdmin,setActiveTab]);
const closeDrawer=useCallback(()=>{if(drawerClosing)return;setDrawerClosing(true);setTimeout(()=>{setShowDrawer(false);setDrawerClosing(false)},220)},[drawerClosing]);
// ── Session continuity: persist navigation state across reloads (sessionStorage = per-tab) ──
useEffect(()=>{try{sessionStorage.setItem('erp:activeTab',activeTab)}catch(_){}},[activeTab]);
// v12.38.2-login: reflect the landing page in the address bar. When logged out
// the SPA shows the login screen, so the URL should read /login (not /applications).
// After a successful Google auth, handleLogin sets activeTab='applications' (app.js:1057),
// so this effect flips the URL to /applications on the first post-login render.
useEffect(()=>{try{
  if(typeof history==='undefined'||!history.pushState)return;
  var _path=window.location.pathname||'/';
  if(!user){
      // v12.54.14-deeplink: remember the intended path so after login we can
      // redirect back to the specific application the user was trying to access.
      try {
        var _curPath = window.location.pathname || '/';
        if (_curPath !== '/login' && _curPath !== '/') {
          sessionStorage.setItem('erp:intendedPath', _curPath);
        }
      } catch(_){}
      if(_path!=='/login'){ history.pushState({tab:'login'},'','/login'); }
      return;
    }
  var _map={documents:'/documents',projects:'/projects',finance:'/finance',dashboard:'/dashboard',calendar:'/calendar',applications:'/applications',reviewers:'/staff-members',teachers:'/teachers',whoami:'/whoami'};
  var _url=_map[activeTab];
  if(_url && _path!==_url){
    history.pushState({tab:activeTab},'',_url);
  }
}catch(_){}},[user,activeTab]);
useEffect(()=>{try{sessionStorage.setItem('erp:docSubTab',docSubTab)}catch(_){}},[docSubTab]);
useEffect(()=>{try{sessionStorage.setItem('erp:finSubTab',finSubTab)}catch(_){}},[finSubTab]);
// ── Readable-URL routing: apply deep link on first load (once) ──
useEffect(()=>{try{var r=parseRoute();if(r)applyRouteParams(r.params);}catch(_){}},[applyRouteParams]);
// v12.51.27: re-apply a persisted deep link on mount so a refresh
// restores the specific application even when parseRoute/initial
// render timing shifts the deepAppId state.
useEffect(()=>{try{var a=localStorage.getItem('erp:deepAppId');if(a&&!deepAppId)setDeepAppId(a);}catch(_){}},[]);
// ── Readable-URL routing: re-apply route on back/forward navigation ──
useEffect(()=>{function onPop(){try{var r=parseRoute();if(r)applyRouteParams(r.params);}catch(_){}}window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop);},[applyRouteParams]);
// ── Command palette: Ctrl+K global shortcut ──
useEffect(()=>{
  function onKey(ev){
    if((ev.ctrlKey||ev.metaKey)&&ev.key==='k'){ev.preventDefault();setShowCommandPalette(true);setCommandPaletteQuery('');}
    if(ev.key==='Escape'&&showCommandPalette){ev.preventDefault();setShowCommandPalette(false);}
  }
  document.addEventListener('keydown',onKey);
  return()=>document.removeEventListener('keydown',onKey);
},[showCommandPalette]);
const commandPaletteItems=useMemo(()=>{
  var q=(commandPaletteQuery||'').toLowerCase().trim();
  var items=[
    {id:'applications',label:'Заявки / Applications',icon:'fa-file-alt',desc:'Преглед на конкурсни заявки',tab:'applications'},
    {id:'documents',label:'Документи / Documents',icon:'fa-folder',desc:'Библиотека с документи и шаблони',tab:'documents'},
    {id:'mydocs',label:'Моите документи / My Docs',icon:'fa-user-folder',desc:'Вашите лични документи',tab:'documents',docSub:'mydocs'},
    {id:'dashboard',label:'Табло / Dashboard',icon:'fa-gauge',desc:'Аналитики и статистики',tab:'dashboard'},
    {id:'reviewers',label:'Общност / Community',icon:'fa-users',desc:'Преподаватели и рецензенти',tab:'reviewers'},
    {id:'finance',label:'Финанси / Finance',icon:'fa-coins',desc:'Проекти и бюджети',tab:'finance'},
    {id:'calendar',label:'Календар / Calendar',icon:'fa-calendar',desc:'Събития и крайни срокове',tab:'calendar'},
    {id:'profile',label:'Профил / Profile',icon:'fa-user-circle',desc:'Вашите данни и настройки',action:'profile'},
    {id:'lang',label:lang==='bg'?'Смени езика (EN)':'Switch language (BG)',icon:'fa-language',desc:lang==='bg'?'Превключи на English':'Switch to Български',action:'lang'},
  ];
  if(!q)return items;
  return items.filter(it=>(it.label+' '+(it.desc||'')).toLowerCase().indexOf(q)!==-1);
},[commandPaletteQuery,lang]);
const executeCommand=useCallback((item)=>{
  setShowCommandPalette(false);
  setCommandPaletteQuery('');
  if(item.action==='lang'){toggleLang();return;}
  if(item.action==='profile'){setShowProfileModal(true);return;}
  setActiveTab(item.tab);
  if(item.docSub)setDocSubTab(item.docSub);
  if(item.finSub)setFinSubTab(item.finSub);
},[toggleLang,setActiveTab,setDocSubTab,setFinSubTab]);
const[formsError,setFormsError]=useState(null);
const[selectedCompId,setSelectedCompId]=useState(()=>{try{return sessionStorage.getItem('erp:selectedCompId')||''}catch(_){return''}});
useEffect(()=>{try{selectedCompId?sessionStorage.setItem('erp:selectedCompId',selectedCompId):sessionStorage.removeItem('erp:selectedCompId')}catch(_){}},[selectedCompId]);
const[applyCompId,setApplyCompId]=useState(null);
const navigateToCompetition=useCallback(compId=>{setSelectedCompId(compId);setActiveTab('dashboard')},[]);
const navigateToApply=useCallback(compId=>{setApplyCompId(compId);setActiveTab('applications')},[]);
const handleApplyDone=useCallback(()=>setApplyCompId(null),[]);
const[allDocuments,setAllDocuments]=useState([]);
// v3.39.14-docviz: ref mirror so async loaders can read the latest list
// without adding it to dependency arrays (prevents stale-closure wipes).
const allDocumentsRef=useRef([]);
useEffect(()=>{allDocumentsRef.current=allDocuments;},[allDocuments]);
const[appCompetitions,setAppCompetitions]=useState(COMPETITIONS);
// ── Reviewer-presence sentinel ──
// True the moment the server confirms the logged-in user has at least one
// row in the Reviewers sheet that points at a specific application
// (formId set). Used as a defensive fallback so the "Моите рецензии" tab
// stays visible even when checkAdmin's resolveUserRole_ misses the user
// (cache miss between assignReviewers and the next role probe, or when the
// session was restored from before the assignment was created).
const[hasReviewerAssignments,setHasReviewerAssignments]=useState(false);
const[pendingReviewCount,setPendingReviewCount]=useState(0);
const _compSig=typeof competitionListSignature==='function'?competitionListSignature(COMPETITIONS||[]):'';
const compSigAppRef=useRef(_compSig);
const formsSigRef=useRef('');

useEffect(()=>{
    window.dispatchEvent(new Event(APP_MOUNT_EVENT));
    // If a session was restored from localStorage, notify the analytics bridge now.
    // Fresh logins go through handleLogin which dispatches its own erp-auth event.
    if(_APP_INIT.user){
        window.dispatchEvent(new CustomEvent('erp-auth',{detail:{type:'login',email:_APP_INIT.user.email||null,name:_APP_INIT.user.name||_APP_INIT.user.displayName||null,role:_APP_INIT.role,authType:'session_restore'}}));
    }
},[]);

// ── Global keyboard shortcuts ─────────────────────────────────────────────
// Alt+1…7 → top-level tabs (applications, dashboard, documents, reviewers,
//            myreviews, finance, settings). Escape → close drawer/modal.
// Only fires when focus is not in a text input to avoid stealing keystrokes.
useEffect(()=>{
    const _TAB_KEYS=['applications','dashboard','documents','reviewers','myreviews','finance','settings'];
    const onKey=(ev)=>{
        if(!user)return;
        const tag=(ev.target&&ev.target.tagName)||'';
        const isInput=/^(INPUT|TEXTAREA|SELECT)$/i.test(tag)||ev.target.isContentEditable;
        // Escape — close drawer if open, otherwise let the modal handle it
        if(ev.key==='Escape'&&showDrawer&&!isInput){closeDrawer();return;}
        // Alt+1..7 — navigate top-level tabs
        if(ev.altKey&&!ev.ctrlKey&&!ev.metaKey&&!isInput){
            const idx=parseInt(ev.key,10);
            if(idx>=1&&idx<=_TAB_KEYS.length){
                ev.preventDefault();
                setActiveTab(_TAB_KEYS[idx-1]);
            }
        }
    };
    document.addEventListener('keydown',onKey,{passive:false});
    return()=>document.removeEventListener('keydown',onKey);
},[user,showDrawer,closeDrawer]);

// ── Grid/table keyboard navigation (Task 16: E3 keyboard navigation master) ──
// Delegate one handler for ALL .data-table bodies in the app. ArrowUp/ArrowDown
// move a roving row highlight; Enter activates the row's first actionable control
// (button/a with [data-row-action] or the row's own onClick). Plain DOM delegation
// so it works for ApplicantView / AdminView / CompetitionView / AssetsView etc.
// without each view needing its own key logic. Never steals keys from inputs.
useEffect(()=>{
    const _ROW_SEL='table.data-table tbody tr';
    const _isFormField=(t)=>{if(!t)return false;const tag=(t.tagName||'').toUpperCase();return tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||t.isContentEditable;};
    const _setActiveRow=(tr)=>{
        if(!tr)return;
        document.querySelectorAll('tr.kbd-active').forEach(r=>r.classList.remove('kbd-active'));
        tr.classList.add('kbd-active');
        try{tr.setAttribute('tabindex','0');tr.focus({preventScroll:false});}catch(_){try{tr.focus();}catch(__){}}
        // keep the active row in view
        try{tr.scrollIntoView({block:'nearest'});}catch(_){}
    };
    const _firstAction=(tr)=>{
        if(!tr)return null;
        // Prefer an explicit action target, else the first button/link in the row
        const explicit=tr.querySelector('[data-row-action]');
        if(explicit)return explicit;
        const btns=tr.querySelectorAll('a[href],button:not([disabled]),[role="button"]');
        for(const b of btns){if(b.offsetParent!==null||b.getClientRects().length)return b;}
        return btns[0]||null;
    };
    const _onKey=(ev)=>{
        if(ev.ctrlKey||ev.metaKey||ev.altKey)return;
        const k=ev.key;
        if(k!=='ArrowDown'&&k!=='ArrowUp'&&k!=='Enter'&&k!=='Home'&&k!=='End')return;
        if(_isFormField(ev.target))return;
        const active=document.activeElement;
        const inRow=active&&active.matches&&active.matches(_ROW_SEL);
        const table=active&&active.closest&&active.closest('table.data-table');
        let scope=table;
        if(!scope)scope=document.querySelector('table.data-table');
        if(!scope)return;
        const rows=Array.prototype.slice.call(scope.querySelectorAll('tbody tr')).filter(r=>r.offsetParent!==null||r.getClientRects().length);
        if(!rows.length)return;
        if(k==='Enter'){
            if(!inRow)return; // only act when a row is focused
            // Prefer an explicit/button action; otherwise click the row itself
            // (most tables open detail via <tr onClick> in React synthetic handlers)
            const act=_firstAction(active)||active;
            if(act){ev.preventDefault();try{act.click();}catch(_){try{active.click();}catch(__){}}}
            return;
        }
        ev.preventDefault();
        let idx=inRow?rows.indexOf(active):-1;
        if(k==='ArrowDown')idx=idx<0?0:Math.min(idx+1,rows.length-1);
        else if(k==='ArrowUp')idx=idx<0?rows.length-1:Math.max(idx-1,0);
        else if(k==='Home')idx=0;
        else if(k==='End')idx=rows.length-1;
        _setActiveRow(rows[idx]);
    };
    document.addEventListener('keydown',_onKey);
    return()=>document.removeEventListener('keydown',_onKey);
},[]);




// ── Reviewer assignment probe (always-on) ────────────────────────────────
// Runs for every logged-in user, regardless of declared role. This closes
// three previously-broken paths that left an assigned reviewer with NO
// access to the 100т scoring UI:
//
//   1. Session restored from before the user was added to the Reviewers
//      sheet → handleLogin's probe never ran on this tab.
//   2. checkAdmin returned ROLE_APPLICANT because the per-execution
//      `_reviewerEmailsCache` was warm with a stale snapshot taken just
//      before assignReviewers wrote the row.
//   3. The user holds a non-reviewer role label (project_lead, vice_rector,
//      etc.) but is ALSO listed in the Reviewers sheet — `isReviewerRole`
//      returns false for those labels and the "Моите рецензии" tab was
//      hidden even though backend assignments exist.
//
// On detection: bump role to APPLICANT_REVIEWER (idempotent, never
// downgrades a real reviewer/admin) AND raise `hasReviewerAssignments` so
// the tab appears regardless of role.  Admins who are also registered
// reviewers get the probe too so they see the "Моите рецензии" tab —
// but their role stays 'admin' (never downgraded to applicant-reviewer).
useEffect(()=>{
    if(!user||!user.email)return;
    let cancelled=false;
    api('getreviewerforms',{reviewerEmail:user.email}).then(res=>{
        if(cancelled)return;
        const list=res&&res.success&&Array.isArray(res.assignments)?res.assignments.filter(a=>a&&a.formId):[];
        setHasReviewerAssignments(list.length>0);
        setPendingReviewCount(list.filter(a=>{const s=a.reviewStatus||'';return s!=='reviewed'&&s!=='submitted'&&s!=='declined'&&s!=='replaced'}).length);
        if(list.length>0&&!isReviewerRole(userRole)&&!isAdminRole(userRole)&&userRole!==ROLE_CKK){
            const newRole=ROLE_APPLICANT_REVIEWER;
            setUserRole(newRole);
            _currentUserRole=newRole;
            try{saveGoogleSession(user,false,newRole);}catch(_){}
        }
    }).catch(err=>_bgWarn('reviewer-probe',err));
    return()=>{cancelled=true};
},[user,userRole]);

// v12.30.0-fix: Admin status re-check on session restore.
// When a Google-authenticated user is promoted to admin via SQL while their
// session is still active, the saved role in localStorage is still 'applicant'.
// This effect calls checkadmin via PHP to detect the promotion and upgrades
// the role immediately without requiring logout/login.
// v17.0.2-adminfix: Also runs periodically (every 60s) to detect mid-session
// admin promotions added via SQL admin_emails table.
useEffect(()=>{
    if(!user||!user.email)return;
    const s=(typeof _readSession==='function')?_readSession():null;
    if(!s||s.type!=='google')return;
    let cancelled=false;
    let pollTimer=null;
    function _checkAdmin(){
        api('checkadmin',{email:user.email}).then(function(res){
        if(cancelled||!res||!res.success)return;
        if(res.isAdmin){
            // v12.48.5: prefer viewRole (users with forms land on applicant view)
            const newRole=res.viewRole||(res.role||ROLE_ADMIN);
            setUserRole(newRole);
            _currentUserRole=newRole;
            _currentUserIsAdmin=true;
            if(user.email)saveGoogleSession(user,true,newRole);
            window.dispatchEvent(new CustomEvent('erp-auth',{detail:{type:'role_upgrade',email:user.email,role:newRole}}));
            // Clear polling timer since we're now admin
            if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
            // v18.0.0-adminfix: Clear stale cached data FIRST so the subsequent
            // loadForms() (triggered by React state change → useEffect re-run)
            // fetches ALL forms from the server instead of serving the old
            // getmyforms response (only 3 own forms) from localStorage cache.
            // The old fire-and-forget api('getForms', ...) calls were useless
            // because their responses were silently discarded — React state
            // was never updated from them.
            try {
                // 1. Clear localStorage cache (ERP_DATA)
                if(typeof ERP_DATA!=='undefined'){
                    if(ERP_DATA.cacheDelete)ERP_DATA.cacheDelete('getforms',{});
                    if(ERP_DATA.cacheDelete)ERP_DATA.cacheDelete('getcompetitions',{});
                    if(ERP_DATA.invalidate)ERP_DATA.invalidate('getforms');
                    if(ERP_DATA.invalidate)ERP_DATA.invalidate('getcompetitions');
                }
                // 2. Clear in-memory API cache (in-flight dedup)
                if(typeof invalidateApiCache==='function'){
                    invalidateApiCache(['getforms','getcompetitions']);
                }
            } catch(_) {}
            // v19.0.0-adminfix: Force immediate forms re-fetch with admin context
            // instead of waiting for the next poll cycle (up to 60s).
            try {
              if(typeof loadForms==='function') loadForms({forceRefresh:true,silent:true});
              if(typeof reloadCompetitions==='function') reloadCompetitions({forceRefresh:true});
            } catch(_){}
        }
    }).catch(function(){});
    }
    // v17.0.2-adminfix: Periodic re-check every 60s for mid-session promotions
    if(!cancelled){
        _checkAdmin(); // initial check
        pollTimer=setInterval(_checkAdmin, 15000);
    }
    return()=>{cancelled=true; if(pollTimer){clearInterval(pollTimer);pollTimer=null;}};
},[user,userRole]);

// Listen for live badge updates emitted by MyReviewsView so the nav
// pending-count chip stays in sync without an extra round-trip.
useEffect(()=>{
    const onCount=(ev)=>{
        if(!ev||!ev.detail)return;
        const n=Number(ev.detail.pending);
        if(Number.isFinite(n)&&n>=0){
            setPendingReviewCount(n);
            if(n>0)setHasReviewerAssignments(true);
        }
    };
    window.addEventListener('erp:reviewerPendingCount',onCount);
    return()=>window.removeEventListener('erp:reviewerPendingCount',onCount);
},[]);

const handleLogin=useCallback(async (u,adminOverride,roleOverride)=>{
    // ── Defense-in-depth domain gate ──
    // Reject any Google-derived user whose email isn't on the institutional
    // allowlist. The username/password admin path uses a non-email userId
    // (e.g. plain "admin"), so it bypasses this check by design.
    const _email = String(u?.email||'').trim();
    const _looksLikeEmail = _email.indexOf('@')>0;
    if(_looksLikeEmail && typeof isAllowedSignInEmail==='function' && !isAllowedSignInEmail(_email)){
        toast('Достъпът е разрешен само за акаунти на ИУ – Варна (@ue-varna.bg).','error',6000);
        try{window.google?.accounts?.id?.disableAutoSelect?.()}catch(_){}
        try{window.google?.accounts?.id?.revoke?.(_email,()=>{})}catch(_){}
        clearSession();
        setUser(null);setUserRole(ROLE_APPLICANT);
        return;
    }
    // Show auth→dashboard transition overlay with live step progress
    const overlay=document.getElementById('auth-transition');
    const _stepEl=function(n){return document.getElementById('auth-step-'+n);};
    const _setStep=function(n,label){var e=_stepEl(n);if(e){e.classList.add('active');var s=e.querySelector('.auth-step-icon');if(s)s.innerHTML='<i class="fas fa-spinner fa-pulse"></i>';}var lbl=document.getElementById('auth-transition-label');if(lbl&&label)lbl.textContent=label;};
    const _doneStep=function(n){var e=_stepEl(n);if(e){e.classList.remove('active');e.classList.add('done');var s=e.querySelector('.auth-step-icon');if(s)s.innerHTML='<i class="fas fa-check-circle"></i>';}};
    if(overlay){overlay.classList.add('active');overlay.classList.remove('fade-out')}
    _setStep(1,'Проверка на достъпа...');
    // Safety: ensure overlay never stays stuck
    const overlaySafetyTimer=setTimeout(()=>{if(overlay){overlay.classList.remove('active','fade-out')}},6000);
    const resolvedRole=roleOverride||(adminOverride?ROLE_ADMIN:(function(){
        // v9.37.0-regulatory: CKK member detection via client-side allowlist.
        // The backend enforces the same check authoritatively; this only
        // accelerates the UI badge and disables "Нов проект" button early.
        if(_email && (typeof _CKK_SET!=='undefined'?_CKK_SET.has(_email.toLowerCase()):(typeof CKK_MEMBERS!=='undefined'&&Array.isArray(CKK_MEMBERS)&&CKK_MEMBERS.indexOf(_email.toLowerCase())!==-1))) return ROLE_CKK;
        return ROLE_APPLICANT;
    })());
    // Prefetch data while overlay is visible
    _currentUserEmail=u?.email||null;
    _currentUserIsAdmin=isAdminRole(resolvedRole);
    _currentUserRole=resolvedRole;
    _setStep(2,'Зареждане на конкурси...');
    // v12.26.0: Try localStorage cache FIRST (instant, no network).
    // This seeds COMPETITIONS immediately so dropdowns render without waiting.
    var _lsCacheOk = false;
    try {
        if (typeof ERP_DATA !== 'undefined' && ERP_DATA.cacheGet) {
            var _cachedComps = ERP_DATA.cacheGet('getpubliccompetitions', {});
            if (_cachedComps && _cachedComps.data && _cachedComps.data.competitions && _cachedComps.data.competitions.length > 0) {
                var _clist = _cachedComps.data.competitions;
                if (typeof COMPETITIONS !== 'undefined' && Array.isArray(COMPETITIONS) && COMPETITIONS.length === 0) {
                    COMPETITIONS = _clist.map(function(c){return {id:c.id||'',name:c.name||'',dateEnd:c.deadline||c.dateEnd||'',deadline:c.deadline||c.dateEnd||'',status:c.status||'',created:c.created||'',description:c.description||'',folderId:c.folderId||''};});
                }
                _lsCacheOk = true;
            }
        }
    } catch(_) {}
    // v12.54.10-rolefix: Always use 'getforms' action — backend resolveRole() checks
        // admin_emails table and returns correct forms for the user's institutional email.
        // Using 'getmyforms' for non-admin bypasses role resolution and queries by
        // Google email only, missing forms stored under institutional email.
        // v12.26.0: Fire PHP batch (arrives ~200ms), seeds cache + COMPETITIONS.
        // Then fire GAS prefetch as non-blocking background refresh.
        if(typeof batchApi==='function'&&typeof window!=='undefined'&&window._PHP_API_URL){
            const _uE=u?.email||'';const _isAdm=isAdminRole(resolvedRole);
            var _batchTimeout = setTimeout(function(){ _doneStep(2); _setStep(3,'Подготовка на табло...'); }, 4000);
            batchApi([
                {action:'getpubliccompetitions'},
                {action:'getforms',data:{userId:_uE,isAdmin:true,lean:true}},
                {action:'getdataversion'}
            ]).then(function(results){
            clearTimeout(_batchTimeout);
            if(Array.isArray(results)){
                const _act=['getpubliccompetitions','getforms','getdataversion'];
                results.forEach(function(r,i){
                    if(r&&r.success!==false&&typeof ERP_DATA!=='undefined'){
                        try{ERP_DATA.cacheSet(_act[i],{},r)}catch(_){}
                    }
                });
                // Seed COMPETITIONS global from batch response so dropdowns render
                var _batchComps = results[0] && results[0].competitions;
                if (Array.isArray(_batchComps) && _batchComps.length > 0 && typeof COMPETITIONS !== 'undefined') {
                    COMPETITIONS = _batchComps.map(function(c){return {id:c.id||'',name:c.name||'',dateEnd:c.deadline||c.dateEnd||'',deadline:c.deadline||c.dateEnd||'',status:c.status||'',created:c.created||'',description:c.description||'',folderId:c.folderId||''};});
                }
                // v12.30.0-cache: Seed forms into prefetch so loadForms() finds them
                // instantly when it runs (avoiding a duplicate network request).
                var _batchForms = results[1] && (results[1].forms || (results[1].data && results[1].data.forms));
                if (Array.isArray(_batchForms) && _batchForms.length > 0 && typeof storePrefetch === 'function') {
                    storePrefetch('forms', { success: true, forms: _batchForms });
                }
            }
            _doneStep(2);
            _setStep(3,'Подготовка на табло...');
        }).catch(function(){
            clearTimeout(_batchTimeout);
            _doneStep(2);
            _setStep(3,'Подготовка на табло...');
        });
    } else {
        _doneStep(2);
        _setStep(3,'Подготовка на табло...');
    }
    // v12.26.0: Fire prefetch in background — it's non-blocking and serves
    // as a background refresh. The batch result (or localStorage) already
    // gave us instant data, so this is purely a cache warmer for next load.
    if (!_lsCacheOk) {
        prefetchCriticalData({isAdmin:isAdminRole(resolvedRole),userId:u?.email||''});
    } else {
        // Cache was OK — only fire lightweight GAS version check (not full getinitialdata)
        // v12.30.0-fix: Use img.src instead of sendBeacon — less detectable by adblockers,
        // and if blocked by ERR_BLOCKED_BY_CLIENT it still fires onerror silently.
        try {
            var _gasWarmUrl = window.__ERP_GAS_URL || (window.ERP_CONFIG && window.ERP_CONFIG.GAS_URL);
            if (_gasWarmUrl && typeof document !== 'undefined') {
                var _sep = _gasWarmUrl.indexOf('?') >= 0 ? '&' : '?';
                var _fullUrl = _gasWarmUrl + _sep + 'action=getversion&_warmup=1&_t=' + Date.now();
                // Use Image beacon — adblockers are less aggressive on img requests vs fetch/XHR/beacon
                var _img = new Image();
                _img.onload = function() { /* GAS warmup OK */ };
                _img.onerror = function() { /* GAS warmup blocked — silent */ };
                _img.src = _fullUrl;
            }
        } catch(_) {}
    }
    // Minimal delay so React paints the skeleton dashboard instantly
    await new Promise(r=>setTimeout(r,30)); // reduced from 80ms
    _doneStep(1);
    _setStep(3,'Зареждане на табло...');
    setUser(u);
    setUserRole(resolvedRole);
    // v12.54.14-deeplink: restore the intended deep link after login so a user
    // who visited /applications/f_xxx directly lands on that application
    // instead of always on the applications list.
    var _intendedPath = '';
    try { _intendedPath = sessionStorage.getItem('erp:intendedPath') || ''; } catch(_) {}
    if (_intendedPath && _intendedPath.indexOf('/applications/') === 0) {
      var _m = _intendedPath.match(/^\/applications\/([^/]+)$/);
      if (_m) {
        setActiveTab('applications');
        setDeepAppId(_m[1]);
        _persistDeepAppId(_m[1]);
        try { history.pushState({app:_m[1],tab:'applications'},'',_intendedPath); } catch(_){}
        try { sessionStorage.removeItem('erp:intendedPath'); } catch(_){}
      } else {
        setActiveTab('applications');
      }
    } else {
      setActiveTab('applications');
    }
    // Notify analytics bridge: triggers cookie consent banner (if not yet decided)
    // and records the login action in the local analytics log.
    window.dispatchEvent(new CustomEvent('erp-auth',{detail:{type:'login',email:u?.email||null,name:u?.name||u?.displayName||null,role:resolvedRole,authType:adminOverride?'admin':'google'}}));
    // Persist session with role
    if(u?.email && !adminOverride) saveGoogleSession(u, false, resolvedRole);
    else if(u?.email && adminOverride) saveGoogleSession(u, true, resolvedRole);
    // Fade out overlay after dashboard paints — mark step 3 done first
    _doneStep(3);
    var _lblEl=document.getElementById('auth-transition-label');
    if(_lblEl)_lblEl.textContent='Готово ✓';
    requestAnimationFrame(()=>{requestAnimationFrame(()=>{
        if(overlay){overlay.classList.add('fade-out');setTimeout(()=>{overlay.classList.remove('active','fade-out');clearTimeout(overlaySafetyTimer)},350)}
    })});
    // If role is not yet reviewer, check server-side for reviewer assignments.
    // Admins get a parallel check — they keep their admin role but the probe
    // sets hasReviewerAssignments so the "Моите рецензии" tab appears.
    // PERF: consumePrefetch('revassign') reuses the parallel getreviewerforms
    // call already fired by prefetchCriticalData — zero additional GAS round-trips.
    if(u?.email){
        consumePrefetch('revassign').then(res=>{
            if(!res||!res.success)return;
            const assignments=Array.isArray(res.assignments)?res.assignments:[];
            if(!isReviewerRole(resolvedRole)&&!isAdminRole(resolvedRole)&&resolvedRole!==ROLE_CKK){
                if(assignments.length>0){
                    const newRole=ROLE_APPLICANT_REVIEWER;
                    setUserRole(newRole);
                    _currentUserRole=newRole;
                    saveGoogleSession(u, false, newRole);
                }
            }else if(isAdminRole(resolvedRole)){
                const list=assignments.filter(a=>a&&a.formId);
                setHasReviewerAssignments(list.length>0);
                setPendingReviewCount(list.filter(a=>{const s=a.reviewStatus||'';return s!=='reviewed'&&s!=='submitted'&&s!=='declined'&&s!=='replaced'}).length);
            }
        }).catch(err=>_bgWarn('getreviewerforms',err));
    }
},[]);
const logout=useCallback(()=>{const _email=_currentUserEmail;setUser(null);setUserRole(ROLE_APPLICANT);setForms([]);formsSigRef.current='';setFormsError(null);setAllDocuments([]);clearSession();window.google?.accounts?.id?.disableAutoSelect?.();if(_email){try{api('loguserlogout',{email:_email}).catch(function(){})}catch(_){}}},[]);

const[showSessionInfo,setShowSessionInfo]=useState(false); // idle clock → info modal
const[showSessionWarn,setShowSessionWarn]=useState(false); // session expiry warning
const[sessionCountdown,setSessionCountdown]=useState(120); // seconds remaining when warn shows
const[sessionVer,setSessionVer]=useState(0);

// v12.53.0: Pull-to-refresh gesture recognizer (mobile only)
// Uses a ref to avoid TDZ: handleManualRefresh is declared later in the
// component (line ~1757), so the effect CANNOT list it in its dependency array.
const _handleManualRefreshRef = useRef(() => {});
useEffect(() => {
  _handleManualRefreshRef.current = handleManualRefresh;
}, []);
useEffect(()=>{
  if(!user)return;
  var startY=0,currentY=0,isPulling=false,threshold=80;
  var onTouchStart=function(e){
    if(window.scrollY>0)return;
    startY=e.touches[0].clientY;
    isPulling=true;
  };
  var onTouchMove=function(e){
    if(!isPulling)return;
    currentY=e.touches[0].clientY;
    var diff=currentY-startY;
    if(diff>0&&window.scrollY<=0){
      // Visual feedback could be added here
    }
  };
  var onTouchEnd=function(){
    if(!isPulling)return;
    isPulling=false;
    var diff=currentY-startY;
    if(diff>threshold&&window.scrollY<=0){
      try{_handleManualRefreshRef.current({forceRefresh:true,silent:false});}catch(_){}
    }
    startY=0;currentY=0;
  };
  document.addEventListener('touchstart',onTouchStart,{passive:true});
  document.addEventListener('touchmove',onTouchMove,{passive:true});
  document.addEventListener('touchend',onTouchEnd,{passive:true});
  return function(){
    document.removeEventListener('touchstart',onTouchStart);
    document.removeEventListener('touchmove',onTouchMove);
    document.removeEventListener('touchend',onTouchEnd);
  };
},[user]);
  // T23: session list expansion state (inline; SessionListPanel lives in settings.js
  // but app.js is monolithic — we inline the logic here to avoid a cross-file dependency
  // in the modal render path).
  const[showSessionList,setShowSessionList]=useState(false);
  const[sessions,setSessions]=useState([]);
  const[revoking,setRevoking]=useState(null);
  const[sessLoading,setSessLoading]=useState(false);
  const[sessError,setSessError]=useState('');
  const _sessEmail=useCallback(function(){return String(user&&user.email||'').toLowerCase().trim();},[user]);
  const _sessLoad=useCallback(function(){
    var email=_sessEmail();
    if(!email){setSessLoading(false);return;}
    setSessLoading(true);setSessError('');setSessions([]);
    api('getsessionlist',{email:email,userId:email}).then(function(r){
      setSessLoading(false);
      if(r&&r.success){setSessions(r.sessions||[]);setSessError('');}
      else{if(r&&r.error)setSessError(r.error);}
    }).catch(function(ex){setSessLoading(false);setSessError('Грешка: '+(ex.message||String(ex)));});
  },[_sessEmail]);
  useEffect(function(){_sessLoad();},[_sessLoad]);
  const _sessRevoke=useCallback(function(sid){
    if(!sid)return;
    setRevoking(sid);
    var email=_sessEmail();
    api('revokesession',{session_id:sid,email:email,userId:email}).then(function(r){
      setRevoking(null);
      if(r&&r.success){setSessions(function(prev){return prev.filter(function(s){return s.session_id!==sid;});});}
      else{setSessError(r&&r.error?'Не може да се отзове сесията: '+r.error:'Грешка при отземане.');}
    }).catch(function(ex){setRevoking(null);setSessError('Грешка: '+(ex.message||String(ex)));});
  },[_sessEmail]);
  const _sessFmtDate=useCallback(function(iso){
    if(!iso)return'—';
    var d=new Date(iso);
    if(isNaN(d.getTime()))return iso;
    return d.toLocaleString('bg-BG',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  },[]);
  const _sessDeviceLabel=useCallback(function(dev){
    if(!dev)return'Непознат устройство';
    if(dev==='mobile')return'Мобилно устройство';
    if(dev==='tablet')return'Планшет';
    return'Настолно устройство';
  },[]);
// Idle-based session tracking: the timer keys off LAST ACTIVITY, not login time.
// _touchActivity() is fired (throttled) on every user gesture, so the session
// genuinely auto-renews on activity. _readActivity_() reads the same redundant
// stores as _readSession_() (localStorage/sessionStorage/cookie/window.name).
const _lastActivityTs = useCallback(() => {
  var a = _readActivity_();
  if (a && a > 0) return a;
  var s = _readSession_() || {};
  return s.ts || Date.now();
}, []);
const extendSession=useCallback(()=>{
    if(!user)return;
    // Re-save the session with a fresh timestamp — resets both the
    // _SESSION_KEY.ts field and the activity clock
    const s=_readSession_()||{};
    try{
        if(s.type==='admin')saveAdminSession({username:s.username});
        else saveGoogleSession(user,isAdmin,userRole);
    }catch(_){saveGoogleSession(user,isAdmin,userRole);}
    _touchActivity(); // reset the idle clock on explicit extend
    setShowSessionWarn(false);
    setSessionCountdown(120);
    setSessionVer(v=>v+1);
},[user,isAdmin,userRole]);
// Activity listener — throttled to once per 30s so we don't hammer storage
// on every scroll/mousemove. Click/keydown/scroll/touch reset the idle clock.
useEffect(()=>{
  if(!user)return;
  var lastTouch=0;
  var onActivity=function(){
    var now=Date.now();
    if(now-lastTouch<30000)return; // throttle: max 1 touch per 30s
    lastTouch=now;
    _touchActivity();
  };
  var opts={passive:true,capture:true};
  document.addEventListener('click',onActivity,opts);
  document.addEventListener('keydown',onActivity,opts);
  document.addEventListener('scroll',onActivity,opts);
  document.addEventListener('touchstart',onActivity,opts);
  return function(){
    document.removeEventListener('click',onActivity,opts);
    document.removeEventListener('keydown',onActivity,opts);
    document.removeEventListener('scroll',onActivity,opts);
    document.removeEventListener('touchstart',onActivity,opts);
  };
},[user]);
// Session expiry timer — warn 2 min before, hard logout at timeout.
// Keys off LAST ACTIVITY (not login time) so the session auto-renews on use.
useEffect(()=>{if(!user)return;var loginTs=_lastActivityTs();var remaining=Math.max(0,_SESSION_TTL-(Date.now()-loginTs));var WARN_BEFORE=2*60*1000;var warnTid=null;if(remaining>WARN_BEFORE){warnTid=setTimeout(()=>{setShowSessionWarn(true);setSessionCountdown(Math.floor(WARN_BEFORE/1000));},remaining-WARN_BEFORE);}else{setShowSessionWarn(true);setSessionCountdown(Math.max(0,Math.floor(remaining/1000)));}var tid=setTimeout(()=>{setShowSessionWarn(false);toast('Сесията изтече. Моля, влезте отново.','warn',4000);logout()},remaining);return()=>{clearTimeout(tid);if(warnTid)clearTimeout(warnTid);};},[user,logout,sessionVer,_lastActivityTs]);
// Countdown ticker — runs every second while warning is visible
useEffect(()=>{if(!showSessionWarn)return;const t=setInterval(()=>setSessionCountdown(c=>Math.max(0,c-1)),1000);return()=>clearInterval(t);},[showSessionWarn]);
// Server-side session heartbeat — keeps the DB session alive by pinging
// sessionheartbeat every 5 min while the user is active. This prevents the
// DB session row from expiring (24h sliding window) even if the frontend
// TTL is shorter. Also surfaces a concurrent-session warning if another
// session for the same email appears.
useEffect(()=>{
  if(!user||!user.email)return;
  var sid=(window.__SESSION_ID||'');
  var tick=function(){
    api('sessionheartbeat',{sessionId:sid,email:user.email}).then(function(res){
      if(res&&res.success&&res.concurrentSessions>0){
        // Surface concurrent-session info (non-blocking; shown in session info modal).
        window.__CONCURRENT_SESSIONS__=res.concurrent;
      }
    }).catch(function(){});
  };
  var tid=setInterval(tick,5*60*1000);
  return ()=>clearInterval(tid);
},[user]);

const loadForms=useCallback(async(opts={})=>{
    if(!user)return;
    const silent=!!opts.silent;
    const forceRefresh=!!opts.forceRefresh;
    if(!silent)setDataLoading(true);
    setFormsError(null);

    // v12.30.0-cache: Instant localStorage first — serve cached forms in ~0ms.
    // Uses lowercase 'getforms' and empty body to match the cache key written by
    // the login batch API (handleLogin → ERP_DATA.cacheSet('getforms', {}, r)).
    var _cacheServed = false;
    if (!forceRefresh && typeof ERP_DATA !== 'undefined' && ERP_DATA.readSync) {
        try {
            var _cached = ERP_DATA.readSync('getforms', {});
            if (_cached && _cached.forms && Array.isArray(_cached.forms)) {
                var _cachedSig = '';
                try { _cachedSig = formsSignature(_cached.forms); } catch (_) {}
                if (_cachedSig && _cachedSig !== formsSigRef.current) {
                    formsSigRef.current = _cachedSig;
                    setForms(_cached.forms);
                }
                _cacheServed = true;
                if (!silent) setDataLoading(false);
            }
        } catch(_) {}
    }

    try{
        // v12.54.10-rolefix: Always use getForms with isAdmin:true so backend resolveRole()
        // checks admin_emails and returns correct forms for institutional email.
        const payload={...(_adminCreds||{}),userId:user.email||'',lean:true,forceRefresh,role:userRole,isAdmin:true};

        let res=null;
    if(!res)res=await api('getForms',payload);

    const nextForms=(res.data?.forms||res.forms)||[];
    let nextSig='';
    try { nextSig = formsSignature(nextForms); } catch (_) { nextSig = ''; /* defensive: malformed evaluation/reviewers won't block the UI */ }
    // Force-refresh ALWAYS commits the new array even if the signature matches.
    // Two reasons:
    //   1) The user explicitly asked for fresh data (Refresh button or stream
    //      poll detected a server-side change). Suppressing the update on
    //      signature-equality would silently discard server-confirmed state.
    //   2) Optimistic patches in child views (changeStatus, submitForm) mutate
    //      a single field. The server response often carries richer derived
    //      fields (evaluation, signatureAdmin, history, contractId). If we
    //      gated on the optimistic-vs-server signature match, those richer
    //      fields would never reach React state.
    if(forceRefresh||nextSig!==formsSigRef.current){formsSigRef.current=nextSig;setForms(nextForms)}
    // v12.30.0-cache: Store fetched forms in localStorage so subsequent loads
    // find them instantly via the cache-first path above.
    // Uses lowercase 'getforms' with empty body to match the batch API key format.
    if (res && typeof ERP_DATA !== 'undefined' && ERP_DATA.cacheSet) {
        try {
            ERP_DATA.cacheSet('getforms', {}, res);
            // Also clear getmyforms cache so applicant view gets fresh data on refresh
            if (ERP_DATA.cacheDelete) {
                try { ERP_DATA.cacheDelete('getmyforms', {}); } catch (_) {}
            }
        } catch(_) {}
    }
    const serverRole=res.data?.role||res.role;
    // v12.28.3-adminfix: Never downgrade from an admin-equivalent role
    // (admin, ckk, nidd, rector, vice-rector) to a lower role based on a
    // server response — the SQL database is the authoritative admin source.
    // GAS may return applicant role if its admin cache is stale, but the
    // SQL-promoted admin must not be reverted.
    if(serverRole&&serverRole!==userRole){
      const _currIsAdmin=isAdminRole(userRole);
      const _newIsAdmin=isAdminRole(serverRole);
      // Only allow upgrade or lateral move; never downgrade from admin→non-admin
      if(!_currIsAdmin||_newIsAdmin||serverRole===userRole){
        // v19.0.0-adminfix: Clear cached forms when upgrading to admin so the
        // re-fetch (triggered by isAdmin → loadForms effect) gets ALL forms
        // from the server, not stale applicant-only cache.
        if(!_currIsAdmin && _newIsAdmin){
          try {
            if(typeof ERP_DATA!=='undefined' && ERP_DATA.cacheDelete)
              ERP_DATA.cacheDelete('getforms',{});
            if(typeof invalidateApiCache==='function')
              invalidateApiCache(['getforms']);
          } catch(_){}
        }
        setUserRole(serverRole);_currentUserRole=serverRole;_currentUserIsAdmin=_newIsAdmin;
      }
    }
    }catch(err){
    const msg=err.message||'Неизвестна грешка';
    setFormsError(msg);
    if(!silent)toast('Грешка при зареждане: '+msg,'error',6000);
    }finally{if(!silent)setDataLoading(false)}
},[user,isAdmin,userRole]);

const[docsLoading,setDocsLoading]=useState(false);
const[docsError,setDocsError]=useState(null);
const loadAllDocuments=useCallback(async(forceRefresh=false)=>{
    // v3.39.14-docviz: Cold-start / caching fix.
    // 1) Admins MUST send real credentials; if _adminCreds isn't ready yet
    //    (cold start, async auth), DO NOT fire listDocuments — a bare
    //    {isAdmin:true} returns the applicant set (empty after merge) and
    //    would WIPE the admin's previously-loaded document list.
    // 2) Never overwrite a populated list with an empty/transient result —
    //    keep the last-good data so a cold-start SW/cache miss can't blank
    //    the dashboard.
    if(isAdmin && (!_adminCreds || !(_adminCreds.username||_adminCreds.email))){
      return; // creds not ready — retry via the boot effect / next stream tick
    }
    setDocsLoading(true);
    setDocsError(null);
    try{
    let res=null;
    if(!forceRefresh){const prefetched=await consumePrefetch('documents');if(prefetched&&prefetched.success!==false)res=prefetched;}
    if(!res){
        const payload=isAdmin
            ?Object.assign({},_adminCreds||{},{isAdmin:true,forceRefresh:!!forceRefresh,userId:(_adminCreds&&_adminCreds.username)||user?.email||''})
            :{isAdmin:false,forceRefresh:!!forceRefresh,userId:user?.email||''};
        res=await api('listDocuments',payload);
    }
    if(res&&res.success===false){throw new Error(res.error||'listDocuments failed')}
    const driveDocs=Array.isArray((res.data?.documents||res.documents))?(res.data?.documents||res.documents):[];
    const merged=mergeDocuments(driveDocs);
    // Keep last-good data on an empty/transient result (cold-start safety).
    setAllDocuments(prev=> (merged.length>0 || prev.length===0) ? merged : prev);
    }catch(err){
    const msg=err&&err.message||'Неизвестна грешка';
    // Only surface an error if we have no data at all (avoid blinking errors
    // over a healthy cached list).
    if(allDocumentsRef.current.length===0) setDocsError(msg);
    warnOnce('docs','Документите не могат да се обновят: '+msg);
    }finally{
    setDocsLoading(false);
    }
},[isAdmin,user]);

const reloadCompetitions=useCallback(async(opts={})=>{
    const payload={userId:user?.email||'',isAdmin};
    if(isAdmin&&_adminCreds)Object.assign(payload,_adminCreds);

    if(!opts.forceRefresh){
        const prefetched=await consumePrefetch('competitions');
        if(prefetched&&prefetched.success!==false){
            const list=(prefetched.data?.competitions||prefetched.competitions)||[];
            if(Array.isArray(list)&&list.length){
                COMPETITIONS=list.map(c=>({
                    id:c.id||'',name:c.name||'',dateEnd:c.dateEnd||c.deadline||'',deadline:c.deadline||c.dateEnd||'',
                    status:c.status||'',created:c.created||'',description:c.description||'',folderId:c.folderId||''
                }));
            }
        }
    }

    const result=await refreshCompetitions(payload,opts);
    var _sig='';
    try { _sig = typeof competitionListSignature==='function' ? competitionListSignature(COMPETITIONS) : ''; } catch(_) { _sig = ''; }
    if(_sig&&_sig!==compSigAppRef.current){compSigAppRef.current=_sig;setAppCompetitions([...COMPETITIONS])}
    return result;
},[user,isAdmin]);

/** Synchronously patch the in-memory forms array — used for instant optimistic updates in child views */
const patchForms=useCallback(patchFn=>setForms(prev=>patchFn(prev)),[]);

const handleManualRefresh=useCallback((opts={})=>{const forceRefresh=opts.forceRefresh!==false;const silent=!!opts.silent;clearApiCache();invalidateApiCache(['getforms','getmyforms']);loadForms({forceRefresh,silent});reloadCompetitions({forceRefresh});loadAllDocuments(forceRefresh);},[loadForms,reloadCompetitions,loadAllDocuments]);
try{window._refreshAllDocuments=function(force){return loadAllDocuments(!!force);};}catch(_){}

// ─── DATA STREAMING HANDLERS (all users) ───
const streamVersionsRef=useRef({applications:0,competitions:0,reviewers:0,messages:0});
const streamIntervalRef=useRef(null);
const[lastLiveUpdate,setLastLiveUpdate]=useState(null);
const lastActiveTabRef=useRef(activeTab);

const handleDataStream=useCallback(async()=>{
    if(!user)return;
    try{
        const res=await api('getDataChangeStream',{versions:streamVersionsRef.current});
        const changes=res.data?.changes||res.changes;
        if(res.success&&changes){
            if(changes.versions)streamVersionsRef.current=changes.versions;
            setLastLiveUpdate(Date.now());
            if(changes.hasChanges){
                // PERF: targeted invalidation — only nuke caches whose underlying data
                // actually bumped. Preserves dashboard/projects/reports/reviewer/calendar
                // caches across stream ticks where only one bucket changed.
                const _streamLoads=[];
                if(changes.applicationsChanged){
                    invalidateApiCache(['getforms','getmyforms','listdocuments','getcompetitionsummary','getapplicationsbycompetition','getcontestboard','getreviewerforms']);
                    _streamLoads.push(loadForms({forceRefresh:true,silent:true}));
                    _streamLoads.push(loadAllDocuments(false));
                }
                if(changes.competitionsChanged){
                    invalidateApiCache(['getcompetitions','getpubliccompetitions','getcompetitionsfeed','getcompetitionsummary','getcontestboard','getcalendarevents']);
                    _streamLoads.push(reloadCompetitions({}));
                }
                if(changes.reviewersChanged){
                    invalidateApiCache(['getreviewers','getreviewerforms']);
                }
                if(changes.messagesChanged){
                    // Bump global message caches and notify any open FormDetail/messages tab.
                    invalidateApiCache(['getmessages','getunreadmessagecount','getrecentmessages']);
                    try{window.dispatchEvent(new CustomEvent('erp:messages-changed',{detail:{at:Date.now()}}))}catch(_){}
                }
                if(_streamLoads.length)await Promise.all(_streamLoads.map(p=>Promise.resolve(p).catch(()=>{})));
            }
        }
    }catch(err){
        // Live-update polling failures are expected during transient network
        // blips, sleep/wake, captive-portal redirects, and GAS cold starts.
        // The next interval tick (or the focus/visibility wake handler) will
        // recover automatically — no need to surface a user-visible warning.
        try{console.debug('[stream] tick failed (will retry):',err&&err.message||err)}catch(_){}
    }
},[user,loadForms,reloadCompetitions,loadAllDocuments]);

const getSystemHealth=useCallback(async()=>{
    if(!user||!isAdmin)return;
    try{
        const res=await api('getSystemHealth',{});
        const health=res.data?.health||res.health;
        if(res.success&&health){
            if(health.status==='degraded'){
                toast('Предупреждение: Система работи с намалени възможности','warning',8000);
            }
        }
    }catch(err){
        warnOnce('health','Системната диагностика е недостъпна.');
    }
},[user,isAdmin]);

// Set up real-time data streaming poll (all users)
useEffect(()=>{
    if(!user)return;
    if(isAdmin)getSystemHealth();
    const pollMs=isAdmin?UI_REFRESH_INTERVALS.adminStream:UI_REFRESH_INTERVALS.userStream;
    handleDataStream();
    streamIntervalRef.current=setInterval(()=>{
        if(isPageVisible())handleDataStream();
    },pollMs);
    return()=>{
        if(streamIntervalRef.current)clearInterval(streamIntervalRef.current);
    };
},[user,isAdmin,handleDataStream,getSystemHealth]);

useEffect(()=>{if(user){loadForms();reloadCompetitions();const t=setTimeout(()=>loadAllDocuments(),isAdmin?800:300);if(isAdmin){// v12.21.1-perf: Only run repairallsheets when app version changed, not every boot.
const _lastRepairVer=localStorage.getItem('erp:repairVersion');const _curVer=window.__ERP_BUILD||'12.21.1';
if(_lastRepairVer!==_curVer){
const r=setTimeout(()=>{api('repairallsheets',{...(_adminCreds||{})}).then(()=>{try{localStorage.setItem('erp:repairVersion',_curVer)}catch(_){}}).catch(err=>_bgWarn('repairallsheets',err))},15000);return()=>{clearTimeout(t);clearTimeout(r)}
}return()=>clearTimeout(t)}return()=>clearTimeout(t)}},user,isAdmin,loadForms,loadAllDocuments,reloadCompetitions);

// v3.39.2-deploy: Stale-build self-check. config.js exposes the ?v= it was
// actually loaded with (__ERP_DEPLOYED_V) and the version baked into the bundle
// (__ERP_CODE_VERSION). If they differ, index.html was updated but this JS file
// was not redeployed — instead of showing a banner, silently serve the latest
// deployed build to the user: unregister the SW, wipe erp-* caches, and
// hard-reload so index.html re-registers the SW with the bumped ?v= and
// precaches the fresh bundle. (No manual prompt — users always get the last
// version automatically.)
useEffect(()=>{
  // v12.32.X: circuit-breaker — never loop on a version mismatch. If we already
  // force-reloaded once this session, stop to avoid an infinite _swbust loop.
  try {
    var _swReloads = Number(sessionStorage.getItem('erp:swReloads') || '0');
    if (_swReloads >= 1) { return; }
    sessionStorage.setItem('erp:swReloads', String(_swReloads + 1));
  } catch(_) {}
  try{
    var _dep=window.__ERP_DEPLOYED_V, _code=window.__ERP_CODE_VERSION;
    if(_dep && _code && _dep!==_code){
      // v12.32.40: auto-serve latest build (was a red reload banner before).
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(function(regs){
            regs.forEach(function(r){ try{ r.unregister(); }catch(_){} });
          });
        }
        if ('caches' in window) {
          caches.keys().then(function(keys){
            keys.forEach(function(k){ if (/^erp-/.test(k)) { try{ caches.delete(k); }catch(_){} } });
            _forceReload(_code);
          }).catch(function(){ _forceReload(_code); });
        } else { _forceReload(_code); }
      } catch(_) { _forceReload(_code); }
      function _forceReload(){
        // v12.32.46-loopfix: STRICTLY single-fire per tab session. If a reload
        // was already attempted (erp_reload_done) and the versions still
        // disagree, DO NOT reload again — otherwise a persistent mismatch
        // (e.g. stale config.js literal) becomes an infinite refresh loop.
        // The session flag is only cleared when a fresh build actually loads.
        try {
          var _ss = window._safeSS || null;
          try {
            if (_ss) {
              if (_ss.getItem('erp_reload_done')) return;
              _ss.setItem('erp_reload_done', '1');
            } else if (typeof sessionStorage !== 'undefined') {
              if (sessionStorage.getItem('erp_reload_done')) return;
              sessionStorage.setItem('erp_reload_done', '1');
            }
          } catch(_) {}
        } catch(_) {}
        try {
          var url = location.href.replace(/([?&])v=\d+\.\d+\.\d+/, '$1v=' + _code);
          if (url.indexOf('_swbust=') === -1) {
            url += (url.indexOf('?') >= 0 ? '&' : '?') + '_swbust=' + Date.now();
          }
          window.location.href = url;
        } catch(_) {}
      }
    }
  }catch(_){}
},[]);

// Non-admin: light background refresh only when data stream is stale
useEffect(()=>{if(!user||isAdmin)return;const pollId=setInterval(()=>{if(!isPageVisible())return;const sinceLastLive=lastLiveUpdate?Date.now()-lastLiveUpdate:Number.MAX_SAFE_INTEGER;if(sinceLastLive<(UI_REFRESH_INTERVALS.userStream*2))return;if(!isCacheFresh('getforms'))loadForms({silent:true}).catch(err=>_bgWarn('loadForms-nonadmin',err));if(!isCacheFresh('getpubliccompetitions'))reloadCompetitions().catch(err=>_bgWarn('reloadComps-nonadmin',err))},UI_REFRESH_INTERVALS.appData);return()=>clearInterval(pollId)},[user,isAdmin,lastLiveUpdate,loadForms,reloadCompetitions,loadAllDocuments]);

// Admin dashboard: safety-net refresh only when cache is stale
useEffect(()=>{if(!user||!isAdmin)return;const pollId=setInterval(()=>{if(!isPageVisible())return;if(!isCacheFresh('getforms'))loadForms({silent:true}).catch(err=>_bgWarn('loadForms-admin',err));if(!isCacheFresh('getcompetitions'))reloadCompetitions().catch(err=>_bgWarn('reloadComps-admin',err))},UI_REFRESH_INTERVALS.adminCompetitions*2);return()=>clearInterval(pollId)},[user,isAdmin,loadForms,reloadCompetitions]);

// Auto-refresh on tab switch — skip if cache is still fresh
useEffect(()=>{
    if(!user||activeTab===lastActiveTabRef.current)return;
    lastActiveTabRef.current=activeTab;
    const t=setTimeout(()=>{
        const formsFresh=isCacheFresh('getforms');
        const compsFresh=isCacheFresh(isAdmin?'getcompetitions':'getpubliccompetitions');
        if(!formsFresh)loadForms({silent:true}).catch(err=>_bgWarn('loadForms-tabswitch',err));
        if(!compsFresh)reloadCompetitions({}).catch(err=>_bgWarn('reloadComps-tabswitch',err));
    },UI_REFRESH_INTERVALS.tabSwitch);
    return()=>clearTimeout(t);
},[user,activeTab,isAdmin,loadForms,reloadCompetitions]);

// ── Phase 5: scroll-position memory across tab switches ──
// Saves window.scrollY for the leaving tab and restores it for the entering
// tab. Falls back to top when no prior position is stored. Improves UX when
// the user jumps from a deep position in a long list to another tab and back.
const scrollMapRef=useRef({});
useEffect(()=>{
    if(!user)return;
    const tab=activeTab;
    const saved=scrollMapRef.current[tab];
    // Defer restore one frame so the new view has a chance to mount.
    const raf=requestAnimationFrame(()=>{
        try{window.scrollTo({top:typeof saved==='number'?saved:0,left:0,behavior:'auto'})}catch(_){window.scrollTo(0,typeof saved==='number'?saved:0)}
    });
    return()=>{cancelAnimationFrame(raf);scrollMapRef.current[tab]=window.scrollY||window.pageYOffset||0;};
},[user,activeTab]);

useEffect(()=>{
    if(!user)return;
    const onWake=debounce(()=>{
        if(!isPageVisible())return;
        reloadCompetitions({forceRefresh:true}).catch(err=>_bgWarn('reloadComps-wake',err));
        loadForms({silent:true,forceRefresh:true}).catch(err=>_bgWarn('loadForms-wake',err));
    },UI_REFRESH_INTERVALS.wakeRefreshDebounce);
    window.addEventListener('focus',onWake);
    document.addEventListener('visibilitychange',onWake);
    return()=>{
        window.removeEventListener('focus',onWake);
        document.removeEventListener('visibilitychange',onWake);
    };
},[user,reloadCompetitions,loadForms]);

// tabs and tabLabel must be computed before any early return to respect Rules of Hooks
// MON reporting visibility: admin/NIDD/Vice-Rector/Rector (CKK excluded — not their workflow)
const canMonReports = isAdmin && userRole!==ROLE_CKK;
// Library deposits: admin-only administrative function
const canLibraryDeposits = isAdmin;
const tabs=useMemo(()=>[
    {id:'applications',label:'Предложения',icon:'fa-file-alt'},
    {id:'dashboard',label:'Конкурси',icon:'fa-trophy'},
    {id:'reviewers',label:'Общност',icon:'fa-users'},
    ...((isReviewer||hasReviewerAssignments)?[{id:'myreviews',label:'Моите рецензии',icon:'fa-clipboard-check',badge:pendingReviewCount>0?pendingReviewCount:0}]:[]),
    // Админ таб премахнат
    {id:'documents',label:'Документи',icon:'fa-folder'},
    {id:'finance',label:'Отчетност',icon:'fa-coins'},
    {id:'calendar',label:'Календар',icon:'fa-calendar-alt'},
],[isAdmin,isReviewer,userRole,hasReviewerAssignments,pendingReviewCount]);
// Auto-correct sub-tab when user can't see restricted sections
useEffect(()=>{if(!canMonReports&&finSubTab==='mon')setFinSubTab('projects');},[canMonReports,finSubTab]);
useEffect(()=>{if(!canLibraryDeposits&&finSubTab==='library')setFinSubTab('projects');},[canLibraryDeposits,finSubTab]);
const tabLabel=useMemo(()=>tabs.find(t=>t.id===activeTab)?.label||'',[tabs,activeTab]);

// ── Tab-hover prefetch (Step 9) ─────────────────────────────────────────────
// Warm the cache for a tab the moment the user's pointer enters its button.
// All loaders are SWR-debounced (isCacheFresh + cache key) so a hover that
// hits a fresh cache is a no-op. Fires only on idle hover (200ms grace) to
// avoid thrashing during keyboard tab-switching or quick swipes across the
// nav strip. Safe — does not change activeTab or fire any mutation.
// IMPORTANT: must be declared BEFORE the `if(!user)return` early-return
// to respect React's Rules of Hooks (same hook count on every render).
const _hoverPrefetchTimer=useRef(null);
const prefetchTab=useCallback((tabId)=>{
    if(!user||!tabId||tabId===activeTab)return;
    try{
        if(tabId==='applications'&&!isCacheFresh('getforms')){loadForms({silent:true}).catch(err=>_bgWarn('loadForms-prefetch',err));}
        else if(tabId==='reviewers'&&!isCacheFresh('getreviewers')){
            try{api('getreviewers',{userId:user.email,isAdmin,...(_adminCreds||{})}).catch(err=>_bgWarn('getreviewers-prefetch',err));}catch(_){}
        }
        else if(tabId==='documents'&&!isCacheFresh('listdocuments')){loadAllDocuments(false);}
        else if(tabId==='dashboard'){
            // Merged "Конкурси" board — warm BOTH competitions and projects so the
            // default sub-tab (Конкурси) and the workflow board paint instantly.
            const k=isAdmin?'getcompetitions':'getpubliccompetitions';
            if(!isCacheFresh(k))reloadCompetitions({}).catch(err=>_bgWarn('reloadComps-prefetch',err));
            if(isAdmin&&!_prefetchPromises.has('competitionPanel')){
                const panelP=api('getcompetitionpanel',{isAdmin:true,userId:user.email||'',competitionId:'',...(_adminCreds||{})}).catch(()=>null);
                _prefetchPromises.set('competitionPanel',panelP);
            }
            if(!isCacheFresh('getprojects')){
                try{api('getprojects',{userId:user.email,isAdmin,lean:true}).catch(err=>_bgWarn('getprojects-dash-prefetch',err));}catch(_){}
            }
        }
        else if(tabId==='finance'&&!isCacheFresh('getprojects')){
            try{api('getprojects',{userId:user.email,isAdmin,lean:true}).catch(err=>_bgWarn('getprojects-fin-prefetch',err));}catch(_){}
        }
    }catch(_){}
},[user,activeTab,isAdmin,loadForms,reloadCompetitions,loadAllDocuments]);
const onTabHover=useCallback((tabId)=>{
    if(_hoverPrefetchTimer.current)clearTimeout(_hoverPrefetchTimer.current);
    _hoverPrefetchTimer.current=setTimeout(()=>prefetchTab(tabId),200);
},[prefetchTab]);
const onTabHoverEnd=useCallback(()=>{
    if(_hoverPrefetchTimer.current){clearTimeout(_hoverPrefetchTimer.current);_hoverPrefetchTimer.current=null;}
},[]);

if(!user){const _LS=typeof LoginScreen!=='undefined'?LoginScreen:(window.LoginScreen||_viewMissing('LoginScreen'));return e(_LS,{onLogin:handleLogin});}

// ── Expose tab navigation for child views ──
try{window.App={setActiveTab,setDocSubTab,openMyDocs:()=>{try{setActiveTab('documents');setDocSubTab('mydocs');}catch(_){}},navigateToRoute:function(path){try{history.pushState({},'',path);var r=parseRoute();if(r)applyProjectsRoute(r.params);}catch(_){}},setBreadcrumb:function(items){try{setBreadcrumbItems(Array.isArray(items)?items:[]);}catch(_){}}};}catch(_){}

return e(ErrorBoundary,null,
    e(Fragment,null,

    e('div',{className:'site-topbar'},e('div',{className:'topbar-inner'},e('div',{className:'topbar-brand'},e('a',{href:'https://scienceandresearch.ue-varna.bg/',target:'_blank',rel:'noopener',translate:'no',title:'Научноизследователски институт'},e('span',{className:'i18n-bg'},'НИИ'),e('span',{className:'i18n-en'},'Science and Research')),e('span',{className:'topbar-sep'},'/'),e('a',{href:'https://ue-varna.bg',target:'_blank',rel:'noopener',translate:'no',title:'University of Economics – Varna'},e('span',{className:'i18n-bg'},'ИУ – Варна'),e('span',{className:'i18n-en'},'UE – Varna'))),e('div',{className:'topbar-links'},e('a',{href:'https://ue-varna.bg',target:'_blank',rel:'noopener',className:'topbar-link',translate:'no'},e('i',{className:'fas fa-external-link-alt'}),' ue-varna.bg'),e('a',{href:'https://scienceandresearch.ue-varna.bg/',target:'_blank',rel:'noopener',className:'topbar-link',translate:'no'},e('i',{className:'fas fa-flask'}),' Science & Research'),user&&showSessionWarn&&e('button',{type:'button',className:'topbar-link session-clock-btn warn',onClick:()=>setShowSessionInfo(true),title:'Сесията изтича — кликнете за подробности'},e('i',{className:'fas fa-clock'}),e('span',{className:'session-clock-label'},Math.floor(sessionCountdown/60)+':'+(sessionCountdown%60<10?'0':'')+sessionCountdown%60)),user&&!showSessionWarn&&e('button',{type:'button',className:'topbar-link session-clock-btn',onClick:()=>setShowSessionInfo(true),title:'Статус на сесията — кликнете за оставащо време'},e('i',{className:'fas fa-clock'})),e('button',{type:'button',className:'topbar-link topbar-qa-btn',onClick:()=>setShowQA(true),title:lang==='bg'?'Често задавани въпроси':'Q&A – Frequently Asked Questions','aria-label':lang==='bg'?'Често задавани въпроси':'Q&A'},e('i',{className:'fas fa-circle-question'})),e(window.NotificationBell,{userEmail:user.email,lang:lang,initialUnread:0}),e('button',{type:'button',className:'topbar-link topbar-lang-btn',onClick:toggleLang,'aria-label':'Switch language',title:lang==='bg'?'Switch to English':'Превключи на Български'},lang==='bg'?'EN':'BG'),e('button',{type:'button',className:'topbar-link topbar-theme-btn',onClick:toggleTheme,title:theme==='dark'?(lang==='bg'?'Светла тема':'Light theme'):theme==='light'?(lang==='bg'?'Тъмна тема (системна)':'Dark theme (system)'):(lang==='bg'?'Тъмна тема':'Dark theme'),'aria-label':'Toggle theme'},e('i',{className:'fas '+(theme==='dark'?'fa-sun':theme==='light'?'fa-moon':'fa-circle-half-stroke')})),e('button',{type:'button',className:'topbar-link topbar-logout-btn',onClick:logout,'aria-label':'Изход',title:'Изход от профила'},e('i',{className:'fas fa-sign-out-alt'}))))),
    e('header',{className:'site-header',role:'banner'},e('div',{className:'header-inner'},e('nav',{className:'nav-tabs','aria-label':'Основна навигация',role:'tablist'},tabs.map(t=>e('button',{key:t.id,type:'button',className:'nav-tab '+(activeTab===t.id?'active':''),onClick:()=>setActiveTab(t.id),onMouseEnter:()=>onTabHover(t.id),onMouseLeave:onTabHoverEnd,onFocus:()=>onTabHover(t.id),onBlur:onTabHoverEnd,role:'tab','aria-selected':activeTab===t.id,'aria-label':t.label+(t.badge?' ('+t.badge+' в оценка)':'')},e('i',{className:'fas '+t.icon,'aria-hidden':'true'}),e('span',null,t.label),t.badge?e('span',{className:'rv-pending-badge',style:{marginLeft:'.4rem',fontSize:'.62rem',padding:'.08rem .42rem',background:'var(--err)',color:'#fff',borderRadius:'999px',fontWeight:700,verticalAlign:'middle'}},t.badge):null))),e('div',{className:'user-panel','aria-label':'Потребителски панел'},user.picture?e('div',{className:'user-avatar',style:{cursor:'pointer'},onClick:()=>setShowProfileModal(true),title:'Профил','aria-label':'Отвори профил'},e('img',{src:user.picture,alt:user.name})):e('div',{className:'user-avatar',style:{cursor:'pointer'},onClick:()=>setShowProfileModal(true),title:'Профил','aria-label':'Отвори профил'},initials(user.name)),e('span',{className:'user-name'},user.name),e('span',{className:'role-badge '+(isAdmin?'admin':'')},ROLE_LABELS[userRole]||'Кандидат')),e('button',{type:'button',className:'hamburger-btn','aria-label':'Меню',onClick:()=>setShowDrawer(true)},e('i',{className:'fas fa-bars'})))),
    showDrawer&&e(Fragment,null,e('div',{className:'drawer-overlay'+(drawerClosing?' drawer-closing':''),onClick:closeDrawer}),e('div',{className:'drawer-panel'+(drawerClosing?' drawer-closing':''),onClick:ev=>ev.stopPropagation()},e('div',{className:'drawer-head'},e('div',{className:'drawer-head-user'},e('div',{className:'drawer-avatar'},user.picture?e('img',{src:user.picture,alt:user.name}):initials(user.name)),e('div',{className:'drawer-user-info'},e('div',{className:'drawer-user-name'},user.name),e('div',{className:'drawer-user-role'},ROLE_LABELS[userRole]||'Кандидат'))),e('button',{type:'button',className:'drawer-close',onClick:closeDrawer,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))),e('div',{className:'drawer-body'},e('div',{className:'drawer-section'},e('div',{className:'drawer-section-label'},'Навигация'),tabs.map(t=>e('button',{key:t.id,type:'button',className:'drawer-item'+(activeTab===t.id?' active':''),onClick:()=>{setActiveTab(t.id);closeDrawer()}},e('i',{className:'fas '+t.icon}),t.label,t.badge?e('span',{style:{marginLeft:'auto',fontSize:'.66rem',padding:'.1rem .45rem',background:'var(--err)',color:'#fff',borderRadius:'999px',fontWeight:700}},t.badge):null))),e('div',{className:'drawer-section'},e('div',{className:'drawer-section-label'},'Акаунт'),e('button',{type:'button',className:'drawer-item',onClick:()=>{setShowProfileModal(true);closeDrawer()}},e('i',{className:'fas fa-user-circle'}),'Профил'),user&&e('button',{type:'button',className:'drawer-item',onClick:()=>{setShowSessionInfo(true);closeDrawer()}},e('i',{className:'fas fa-clock',style:{color:showSessionWarn?'var(--err)':'var(--ink-4)'}}),'Статус на сесията',showSessionWarn&&e('span',{style:{marginLeft:'auto',fontSize:'.66rem',padding:'.1rem .45rem',background:'var(--err)',color:'#fff',borderRadius:'999px',fontWeight:700}},Math.floor(sessionCountdown/60)+':'+(sessionCountdown%60<10?'0':'')+sessionCountdown%60)),e('button',{type:'button',className:'drawer-item',onClick:()=>{setShowQA(true);closeDrawer()}},e('i',{className:'fas fa-circle-question',style:{color:'var(--ink-4)'}}),lang==='bg'?'Често задавани въпроси':'Q&A'))),e('div',{className:'drawer-section'},e('div',{className:'drawer-section-label'},'Език'),e('button',{type:'button',className:'drawer-item drawer-lang-btn',onClick:toggleLang,style:{fontWeight:700}},e('i',{className:'fas fa-language',style:{color:'var(--brand-teal)'}}),lang==='bg'?'Switch to English / Български':'Превключи на Български / English',e('span',{className:'drawer-lang-badge'},lang==='bg'?'EN':'BG')),e('button',{type:'button',className:'drawer-item drawer-theme-btn',onClick:toggleTheme},e('i',{className:'fas '+(theme==='dark'?'fa-sun':theme==='light'?'fa-moon':'fa-circle-half-stroke'),style:{color:'var(--brand-navy)'}}),theme==='dark'?(lang==='bg'?'Тъмна тема (активна)':'Dark theme (on)'):theme==='light'?(lang==='bg'?'Светла тема (активна)':'Light theme (on)'):(lang==='bg'?'Системна тема':'System theme'))),e('div',{className:'drawer-section'},e('button',{type:'button',className:'drawer-item danger',onClick:()=>{closeDrawer();logout()}},e('i',{className:'fas fa-sign-out-alt'}),'Изход'))),e('div',{className:'drawer-foot'},e('div',{className:'drawer-foot-logos'},e('img',{className:'drawer-foot-logo',src:LOGO_URL,alt:'ИУ Варна'})),e('span',{className:'drawer-foot-text'},'© 2026 ИУ – Варна')))),
    e('div',{className:'breadcrumb-strip'},e('div',{className:'breadcrumb-inner'},e('a',{href:'https://ue-varna.bg',target:'_blank',rel:'noopener',translate:'no',title:'University of Economics – Varna'},e('span',{className:'i18n-bg'},'ИУ – Варна'),e('span',{className:'i18n-en'},'UE – Varna')),e('span',{className:'bc-sep'},e('i',{className:'fas fa-chevron-right'})),e('a',{href:'https://ue-varna.bg/bg/p/7806/nauchna-deynost',target:'_blank',rel:'noopener'},e('span',{className:'i18n-bg',translate:'no'},'Научна дейност'),e('span',{className:'i18n-en'},'Science and Research')),e('span',{className:'bc-sep'},e('i',{className:'fas fa-chevron-right'})),e('span',{style:{color:'var(--ink-3)'}},tabLabel),breadcrumbTrail)),
    e('main',{className:'main-content',id:'main-content',tabIndex:-1,role:'main','aria-label':'Основно съдържание'},
        e('div',{className:'view-enter',key:activeTab},
        activeTab==='applications'&&e(Fragment,null,
        formsError&&e('div',{style:{background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',padding:'.85rem 1.2rem',marginBottom:'1rem',fontSize:'.82rem',color:'var(--err)',display:'flex',alignItems:'flex-start',gap:'.55rem'}},
            e('i',{className:'fas fa-exclamation-triangle',style:{flexShrink:0,marginTop:'.1rem'}}),
            e('div',null,
            e('strong',null,'Предложенията не могат да бъдат заредени: '),formsError,
            e('div',{style:{fontSize:'.73rem',opacity:.75,marginTop:'.3rem'}},'Проверете: 1) Скриптът е публикуван като "Всеки" в Deploy. 2) Spreadsheet ID е правилен. 3) Дайте разрешение на скрипта при първо стартиране.'),
            e('button',{type:'button',className:'btn btn-outline btn-sm',style:{marginTop:'.5rem'},onClick:handleManualRefresh},'Опитай отново')
            )
        ),
        isAdmin
            ?e(M_AdminView,{forms,loading:dataLoading,onRefresh:handleManualRefresh,allDocuments,onPatchForms:patchForms,userEmail:user&&user.email,isAdmin,initialAppId:deepAppId})
            :e(M_ApplicantView,{user,forms,loading:dataLoading,onRefresh:handleManualRefresh,allDocuments,applyCompId,onApplyDone:handleApplyDone,competitions:appCompetitions,onPatchForms:patchForms,initialAppId:deepAppId})
        ),
        // ── v12.48.1: /whoami — admin Администрация landing (identity + all proposals) ──
        activeTab==='whoami'&&isAdmin&&e(Fragment,null,
            e('div',{className:'whoami-banner',role:'region','aria-label':'Идентичност на администратор'},
                e('div',{className:'whoami-avatar'},(user&&user.name?user.name.trim().charAt(0).toUpperCase():'?')),
                e('div',{className:'whoami-meta'},
                    e('div',{className:'whoami-name'},user&&user.name?user.name:'Администратор'),
                    e('div',{className:'whoami-email'},user&&user.email?user.email:''),
                    e('div',{className:'whoami-role'},'Роля: '+({'admin':'Администратор','rector':'Ректор','vice_rector':'Зам.-ректор','nidd':'НИД','ckk':'ЦКК','reviewer':'Рецензент','applicant':'Кандидат'}[userRole]||userRole||'Администратор'))
                ),
                e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:()=>setActiveTab('applications')},e('i',{className:'fas fa-arrow-left','aria-hidden':'true'}),' Към предложенията')
            ),
            e(M_AdminView,{forms,loading:dataLoading,onRefresh:handleManualRefresh,allDocuments,onPatchForms:patchForms,userEmail:user&&user.email})
        ),
        activeTab==='reviewers'&&e(CommunityView,{isAdmin,isReviewer,hasReviewerAssignments,forms,competitions:appCompetitions,user}),
        activeTab==='myreviews'&&(isReviewer||hasReviewerAssignments)&&e(M_MyReviewsView,{user,allDocuments}),
        activeTab==='dashboard'&&e(M_DashboardView,{user,userRole,isAdmin,forms,formsLoading:dataLoading,onApply:navigateToApply,initialCompId:selectedCompId,userEmail:user.email}),

        activeTab==='documents'&&e(Fragment,null,
            e('div',{className:'fd-tabs',style:{marginBottom:'1rem'},role:'tablist','aria-label':'Документи'},
                e('button',{type:'button',className:'fd-tab '+(docSubTab==='documents'?'active':''),role:'tab','aria-selected':docSubTab==='documents',onClick:()=>setDocSubTab('documents')},e('i',{className:'fas fa-folder','aria-hidden':'true'}),' Документи'),
                e('button',{type:'button',className:'fd-tab '+(docSubTab==='mydocs'?'active':''),role:'tab','aria-selected':docSubTab==='mydocs',onClick:()=>setDocSubTab('mydocs')},e('i',{className:'fas fa-user-folder','aria-hidden':'true'}),' Моите документи')
            ),
            docSubTab==='documents'&&e(M_DocumentsView,{onAttachToForm:null,isAdmin}),
            docSubTab==='mydocs'&&M_MyDocumentsView&&e(M_MyDocumentsView,{isAdmin})
        ),
        activeTab==='finance'&&e(M_FinanceModule,{user,isAdmin,userRole,canMonReports,canLibraryDeposits,finSubTab,setFinSubTab,M_ProjectReportsView,M_MinistryReportsView,M_LibraryDepositsView,M_BudgetTrackerView,loadForms,reloadCompetitions,deepProjectId,deepSub,deepSessionId}),
        activeTab==='calendar'&&e(M_CalendarView,{onViewCompetition:navigateToCompetition,onApply:navigateToApply,isAdmin,userEmail:user.email,competitions:appCompetitions}),
    )),
    e(SiteFooter,{onA11yClick:()=>setShowA11y(true)}),
    // v12.53.0: Mobile bottom navigation bar (visible only on small screens via CSS)
    e('nav',{className:'mobile-bottom-nav','aria-label':'Мобилна навигация',role:'tablist'},
      tabs.map(function(t){
        return e('button',{key:t.id,type:'button',className:'mob-bottom-item '+(activeTab===t.id?'active':''),onClick:function(){setActiveTab(t.id);try{window.scrollTo({top:0,behavior:'auto'});}catch(_){}},'aria-selected':activeTab===t.id,'aria-label':t.label},
          e('i',{className:'fas '+t.icon,'aria-hidden':'true'}),
          e('span',null,t.label),
          t.badge?e('span',{style:{position:'absolute',top:'.2rem',right:'.2rem',fontSize:'.55rem',padding:'.05rem .32rem',background:'var(--err)',color:'#fff',borderRadius:'999px',fontWeight:700}},t.badge):null
        );
      })
    ),
    showProfileModal&&e(window.ProfileSettingsModal,{user,isAdmin,isReviewer,onClose:()=>setShowProfileModal(false),logout,onRefresh:handleManualRefresh,showSessionWarn,extendSession,onDismissSessionWarn:()=>setShowSessionWarn(false),sessionCountdown,userRole}),
    showA11y&&e(window.AccessibilityStatementModal,{onClose:()=>setShowA11y(false)}),
    showQA&&typeof QAModal==='function'&&e(QAModal,{onClose:()=>setShowQA(false),lang}),
    // ── Command palette (Ctrl+K) ──
    showCommandPalette&&_portal(e('div',{className:'modal-overlay',style:{zIndex:9999,backdropFilter:'blur(4px)'},onClick:()=>setShowCommandPalette(false)},
      e('div',{className:'modal-box command-palette-modal',onClick:ev=>ev.stopPropagation()},
        e('div',{className:'command-palette-head'},
          e('i',{className:'fas fa-search',style:{marginRight:'.5rem',color:'var(--ink-4)'}}),
          e('input',{className:'command-palette-input',type:'search',placeholder:'Търсене в менюто... (Esc за затваряне)',value:commandPaletteQuery,onChange:ev=>setCommandPaletteQuery(ev.target.value),autoFocus:true,onKeyDown:function(ev){
            if(ev.key==='ArrowDown'||ev.key==='ArrowUp'){ev.preventDefault();var list=document.querySelectorAll('.command-palette-item');if(!list.length)return;var idx=-1;for(var i=0;i<list.length;i++)if(list[i].classList.contains('active')){idx=i;break;}list[idx]&&list[idx].classList.remove('active');var next=ev.key==='ArrowDown'?(idx+1)%list.length:(idx-1+list.length)%list.length;list[next].classList.add('active');list[next].scrollIntoView({block:'nearest'});}
            if(ev.key==='Enter'){var list=document.querySelectorAll('.command-palette-item.active');if(list.length&&list[0]._cmd)executeCommand(list[0]._cmd);}
          }})
        ),
        e('div',{className:'command-palette-list'},
          commandPaletteItems.length===0&&e('div',{className:'command-palette-empty',style:{padding:'1.5rem',textAlign:'center',color:'var(--ink-4)',fontSize:'.85rem'}},'Няма намерени резултати / No results'),
          commandPaletteItems.map(function(item,idx){return e('button',{key:idx,type:'button',className:'command-palette-item'+(idx===0?' active':''),_cmd:item,onClick:function(){executeCommand(item)}},
            e('i',{className:'fas '+item.icon,style:{width:'1.5rem',textAlign:'center',color:'var(--ink-4)'}}),
            e('div',{style:{flex:'1',minWidth:0,textAlign:'left'}},
              e('div',{style:{fontWeight:600}},item.label),
              e('div',{style:{fontSize:'.75rem',color:'var(--ink-4)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},item.desc)
            )
          );})
        ),
        e('div',{className:'command-palette-foot'},e('span',null,'↑↓ навигация'),e('span',null,'↵ избор'),e('span',null,'Esc затваряне'))
      )
    )),
    // ── Session info modal (click on clock icon in topbar / drawer) ──
    showSessionInfo&&!showProfileModal&&(()=>{
      const loginTs=_lastActivityTs();
      const remSec=Math.max(0,Math.floor((_SESSION_TTL-(Date.now()-loginTs))/1000));
      const remMin=Math.floor(remSec/60);const remSecPart=remSec%60;
      const isUrgent=remSec<=120;
      return _portal(e('div',{className:'modal-overlay',style:{zIndex:9998},onClick:()=>setShowSessionInfo(false)},
        e('div',{className:'modal-box narrow session-warn-modal',onClick:ev=>ev.stopPropagation()},
          e('div',{className:'modal-head'},
            e('h3',{style:{color:isUrgent?'var(--err)':'var(--ink)'}},e('i',{className:'fas fa-clock',style:{marginRight:'.45rem'}}),'Статус на сесията'),
            e('button',{type:'button',className:'close-btn','aria-label':'Затвори',onClick:()=>setShowSessionInfo(false)},e('i',{className:'fas fa-times'}))
          ),
          e('div',{className:'modal-body',style:{textAlign:'center',padding:'1.5rem 1.25rem'}},
            e('div',{className:'session-countdown-ring'},
              e('span',{className:'session-countdown-num',style:{color:isUrgent?'var(--err)':'var(--ok)'}},
                remMin+':'+(remSecPart<10?'0':'')+remSecPart)
            ),
            e('p',{style:{marginTop:'1rem',fontSize:'.88rem',color:'var(--ink-3)'}},
              isUrgent
                ?e(Fragment,null,'Сесията изтича след ',e('strong',null,remSec,' сек'),'!',e('br',null),'Удължете я сега, за да не загубите незапазените данни.')
                :e(Fragment,null,'Оставащо време: ',e('strong',null,remMin,' мин ',remSecPart,' сек'),'.')
            ),
            e('p',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginTop:'.5rem'}},
              'Максимална продължителност: 30 минути. Сесията се подновява автоматично при всяко действие.'
            ),
            (window.__CONCURRENT_SESSIONS__&&window.__CONCURRENT_SESSIONS__.length>0)?e('div',{style:{marginTop:'.75rem',padding:'.6rem .8rem',background:'var(--warn-bg)',border:'1px solid var(--warn-border)',borderRadius:6,fontSize:'.75rem',color:'var(--warn)',textAlign:'left'}},
              e('i',{className:'fas fa-exclamation-triangle',style:{marginRight:'.4rem'}}),
              e('strong',null,'Внимание: '),window.__CONCURRENT_SESSIONS__.length,' други активни сесии за този акаунт.',
              e('div',{style:{marginTop:'.3rem',fontSize:'.7rem',color:'var(--ink-4)'}},
                'Ако не сте вие, сменете паролата или излезте от всички устройства.')
            ):null
          ),
          e('div',{className:'modal-footer',style:{justifyContent:'center',gap:'1rem'}},
            e('button',{className:'btn btn-outline',onClick:()=>{setShowSessionList(function(v){return !v;});setShowSessionInfo(false);}},'Всички активни сесии'),
            e('button',{className:'btn btn-outline',onClick:()=>setShowSessionInfo(false)},'Затвори'),
            e('button',{className:'btn '+(isUrgent?'btn-danger':'btn-primary'),onClick:()=>{extendSession();setShowSessionInfo(false)}},e('i',{className:'fas fa-redo',style:{marginRight:'.4rem'}}),'Удължи сесията')
          )
        )
      ))
    })(),
    // ── T72: Session management list modal ──
    showSessionList&&_portal(e('div',{className:'modal-overlay',style:{zIndex:9998},onClick:()=>setShowSessionList(false)},
      e('div',{className:'modal-box session-list-modal',onClick:ev=>ev.stopPropagation(),style:{maxWidth:'640px',width:'95vw'}},
        e('div',{className:'modal-head'},
          e('h3',null,e('i',{className:'fas fa-shield-alt',style:{marginRight:'.45rem'}}),'Активни сесии'),
          e('button',{type:'button',className:'close-btn','aria-label':'Затвори',onClick:()=>setShowSessionList(false)},e('i',{className:'fas fa-times'}))
        ),
        e('div',{className:'modal-body'},
          e('p',{style:{fontSize:'.82rem',color:'var(--ink-4)',marginBottom:'.75rem',marginTop:0}},
            'Управлявайте активните сесии на вашия акаунт. Можете да отмените всяка отделна сесия или всички останали едновременно.'),
          sessError?e('div',{className:'alert alert-error',style:{marginBottom:'.75rem'}},sessError):null,
          sessLoading?e('div',{style:{textAlign:'center',padding:'2rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-spinner fa-spin'}),' Зареждане...'):null,
          !sessLoading&&sessions.length===0?e('div',{style:{textAlign:'center',padding:'2rem',color:'var(--ink-4)'}},'Няма активни сесии.'):null,
          !sessLoading&&sessions.length>0&&e('div',{className:'session-list'},
            sessions.map(function(s){
              return e('div',{key:s.session_id,className:'session-item '+(s.current?'session-current':'')},
                e('div',{className:'session-item-icon'},
                  e('i',{className:'fas '+(s.device==='mobile'?'fa-mobile-alt':s.device==='tablet'?'fa-tablet-alt':'fa-desktop'),'aria-hidden':'true'})
                ),
                e('div',{className:'session-item-info'},
                  e('div',{className:'session-item-header'},
                    s.current?e('span',{className:'session-badge-current'},e('i',{className:'fas fa-check-circle',style:{marginRight:'.3rem'}}),'Текуща сесия'):null,
                    s.current?null:e('button',{type:'button',className:'btn btn-sm btn-danger-outline',disabled:revoking===s.session_id,onClick:function(){_sessRevoke(s.session_id);}},
                      revoking===s.session_id?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-times'}),
                      ' Отмени сесията'
                    )
                  ),
                  e('div',{className:'session-item-detail'},
                    e('i',{className:'fas fa-network-wired',style:{marginRight:'.3rem',color:'var(--ink-4)'}}),
                    'IP адрес: ',e('strong',null,s.ip_address||'—')
                  ),
                  e('div',{className:'session-item-detail'},
                    e('i',{className:'fas fa-clock',style:{marginRight:'.3rem',color:'var(--ink-4)'}}),
                    'Последна активност: ',e('strong',null,_sessFmtDate(s.last_active))
                  ),
                  e('div',{className:'session-item-detail',style:{fontSize:'.72rem',color:'var(--ink-4)'}},
                    s.user_agent?s.user_agent.substring(0,80)+(s.user_agent.length>80?'…':''):'Непознат устройство'
                  )
                )
              );
            })
          )
        ),
        e('div',{className:'modal-footer',style:{justifyContent:'space-between',gap:'.5rem'}},
          e('button',{className:'btn btn-sm btn-outline',onClick:()=>_sessLoad(),disabled:sessLoading},e('i',{className:'fas fa-sync',style:{marginRight:'.3rem'}}),'Опресни'),
          e('div',{style:{display:'flex',gap:'.5rem'}},
            e('button',{className:'btn btn-sm btn-danger',disabled:sessLoading||sessions.length<=1,onClick:function(){
              var toRevoke=sessions.filter(function(s){return !s.current;});
              if(toRevoke.length===0)return;
              if(!confirm('Отмени всички други '+toRevoke.length+' сесии?'))return;
              var i=0;
              var next=function(){if(i>=toRevoke.length)return;_sessRevoke(toRevoke[i].session_id);i++;setTimeout(next,200);};
              next();
            }},e('i',{className:'fas fa-sign-out-alt',style:{marginRight:'.3rem'}}),'Отмени всички други'),
            e('button',{className:'btn btn-sm btn-outline',onClick:()=>setShowSessionList(false)},'Затвори')
          )
        )
      )
    )),
    // ── Standalone session-expiry warning modal (2-min countdown) ──
    showSessionWarn&&!showProfileModal&&_portal(e('div',{className:'modal-overlay',style:{zIndex:9999,backdropFilter:'blur(2px)'}},
      e('div',{className:'modal-box narrow session-warn-modal',onClick:ev=>ev.stopPropagation()},
        e('div',{className:'modal-head'},
          e('h3',{style:{color:'var(--warn)'}},e('i',{className:'fas fa-clock',style:{marginRight:'.45rem'}}),'Сесията изтича!'),
          e('button',{type:'button',className:'close-btn','aria-label':'Затвори',onClick:()=>setShowSessionWarn(false)},e('i',{className:'fas fa-times'}))
        ),
        e('div',{className:'modal-body',style:{textAlign:'center',padding:'1.5rem 1.25rem'}},
          e('div',{className:'session-countdown-ring'},
            e('span',{className:'session-countdown-num',style:{color:sessionCountdown<=30?'var(--err)':'var(--warn)'}},
              Math.floor(sessionCountdown/60)+':'+(sessionCountdown%60<10?'0':'')+sessionCountdown%60)
          ),
          e('p',{style:{marginTop:'1rem',fontSize:'.88rem',color:'var(--ink-3)'}},
            'Вашата сесия ще изтече след ',e('strong',null,sessionCountdown,' сек'),'.',e('br',null),'Желаете ли да я удължите?'
          )
        ),
        e('div',{className:'modal-footer',style:{justifyContent:'center',gap:'1rem'}},
          e('button',{className:'btn btn-outline',onClick:()=>setShowSessionWarn(false)},'Затвори'),
          e('button',{className:'btn btn-primary',onClick:extendSession},e('i',{className:'fas fa-redo',style:{marginRight:'.4rem'}}),'Удължи сесията')
        )
      )
    ))
    )
;
};

// ── T74: Password Strength Meter ─────────────────────────────────────────────
// Returns {score:0-4, label, color, tips[]} for a given password.
var passwordStrength = function(pw) {
  if (!pw) return {score: 0, label: 'Много слаба', color: '#dc3545', tips: ['Въведете парола']};
  var score = 0;
  var tips = [];
  if (pw.length >= 8) score++; else tips.push('Минимум 8 символа');
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++; else tips.push('Използвайте главни и малки букви');
  if (/\d/.test(pw)) score++; else tips.push('Добавете цифра');
  if (/[^a-zA-Z0-9]/.test(pw)) score++; else tips.push('Добавете специален символ');
  score = Math.min(4, score);
  var labels = ['Много слаба', 'Слаба', 'Средна', 'Силна', 'Много силна'];
  var colors = ['#dc3545', '#fd7e14', '#ffc107', '#28a745', '#198754'];
  return {score: score, label: labels[score], color: colors[score], tips: tips};
};

// T74b: Render a password strength bar (returns React element)
var PasswordStrengthBar = function(props) {
  var pw = props.password || '';
  var s = passwordStrength(pw);
  if (!pw) return null;
  return e('div', {className: 'pw-strength-bar', style: {marginTop: '.35rem'}},
    e('div', {style: {display: 'flex', gap: '3px', height: '4px', borderRadius: '2px', overflow: 'hidden', background: '#e9ecef'}},
      [0,1,2,3].map(function(i) {
        return e('div', {key: i, style: {flex: 1, background: i < s.score ? s.color : 'transparent', transition: 'background .2s'}});
      })
    ),
    e('div', {style: {fontSize: '.72rem', color: s.color, marginTop: '.2rem', fontWeight: 600}},
      'Сила на паролата: ', s.label),
    s.tips.length > 0 && s.score < 3 ? e('div', {style: {fontSize: '.68rem', color: '#888', marginTop: '.15rem'}},
      s.tips.slice(0, 2).map(function(t, i) { return e('div', {key: i}, '• ', t); })
    ) : null
  );
};

// ── T73: MFA Setup Modal ─────────────────────────────────────────────────────
// Renders a TOTP setup flow: QR code from otpauth URI + verification input.
var MfaSetupModal = function(props) {
  var onClose = props.onClose || function(){};
  var email = props.email || '';
  var _s = React.useState({step: 'loading', secret: '', uri: '', code: '', error: '', verifying: false});
  var st = _s[0], setSt = _s[1];
  var _ref = React.useRef(null);

  React.useEffect(function() {
    api('setupmfa', {ownerEmail: email}).then(function(r) {
      if (r && r.success) setSt(function(p) { return Object.assign({}, p, {step: 'show', secret: r.secret, otpauthUri: r.otpauthUri}); });
      else setSt(function(p) { return Object.assign({}, p, {step: 'error', error: (r && r.error) || 'Грешка при генериране'}); });
    })["catch"](function(e) { setSt(function(p) { return Object.assign({}, p, {step: 'error', error: e.message || 'Грешка'}); }); });
  }, []);

  var verify = function() {
    if (!st.code || st.code.length !== 6) {
      setSt(function(p) { return Object.assign({}, p, {error: 'Въведете 6-цифрен код'}); });
      return;
    }
    setSt(function(p) { return Object.assign({}, p, {verifying: true, error: ''}); });
    api('verifymfasetup', {ownerEmail: email, code: st.code}).then(function(r) {
      if (r && r.success) setSt(function(p) { return Object.assign({}, p, {step: 'done', verifying: false}); });
      else setSt(function(p) { return Object.assign({}, p, {verifying: false, error: (r && r.error) || 'Невалиден код'}); });
    })["catch"](function(e) { setSt(function(p) { return Object.assign({}, p, {verifying: false, error: e.message}); }); });
  };

  // Simple QR code via chart.googleapis.com (no external lib dependency)
  var qrImg = st.otpauthUri ? 'https://chart.googleapis.com/chart?chs=180x180&cht=qr&chl=' + encodeURIComponent(st.otpauthUri) : '';

  return e('div', {className: 'modal-overlay', style: {zIndex: 9998}},
    e('div', {className: 'modal-box', style: {maxWidth: '420px'}, onClick: function(e) { e.stopPropagation(); }},
      e('div', {className: 'modal-head'},
        e('h3', null, e('i', {className: 'fas fa-shield-alt', style: {marginRight: '.4rem'}}), 'Двуфакторна автентикация'),
        e('button', {type: 'button', className: 'close-btn', 'aria-label': 'Затвори', onClick: onClose}, e('i', {className: 'fas fa-times'}))
      ),
      e('div', {className: 'modal-body', style: {textAlign: 'center'}},
        st.step === 'loading' ? e('p', null, 'Генериране на ключ...') :
        st.step === 'error' ? e('div', null,
          e('p', {style: {color: 'var(--err)'}}, st.error),
          e('button', {className: 'btn btn-outline btn-sm', onClick: onClose}, 'Затвори')
        ) :
        st.step === 'show' ? e('div', null,
          e('p', {style: {fontSize: '.82rem', marginBottom: '.6rem'}}, 'Сканирайте QR кода с Google Authenticator или подобно приложение:'),
          e('img', {src: qrImg, alt: 'QR код за MFA', style: {width: 180, height: 180, border: '1px solid #ddd', borderRadius: 8}}),
          e('div', {style: {marginTop: '.6rem', fontSize: '.72rem', color: '#888', wordBreak: 'break-all'}},
            'Ръчен ключ: ', e('code', null, st.secret)),
          e('div', {style: {marginTop: '.8rem'}},
            e('label', {style: {fontSize: '.78rem', display: 'block', marginBottom: '.25rem'}}, 'Въведете 6-цифрен код от приложението:'),
            e('input', {type: 'text', maxLength: 6, value: st.code, placeholder: '000000',
              onChange: function(ev) { setSt(function(p) { return Object.assign({}, p, {code: ev.target.value.replace(/\D/g,'')}); }); },
              style: {width: '120px', textAlign: 'center', fontSize: '1.1rem', letterSpacing: '.3rem', padding: '.4rem'}})
          ),
          st.error ? e('div', {style: {color: 'var(--err)', fontSize: '.75rem', marginTop: '.4rem'}}, st.error) : null,
          e('div', {style: {marginTop: '.8rem', display: 'flex', gap: '.5rem', justifyContent: 'center'}},
            e('button', {className: 'btn btn-outline btn-sm', onClick: onClose}, 'Отказ'),
            e('button', {className: 'btn btn-primary btn-sm', onClick: verify, disabled: st.verifying},
              st.verifying ? 'Проверка...' : 'Активирай')
          )
        ) :
        st.step === 'done' ? e('div', null,
          e('i', {className: 'fas fa-check-circle', style: {fontSize: '2.5rem', color: '#28a745'}}),
          e('p', {style: {marginTop: '.5rem'}}, 'Двуфакторната автентикация е активирана успешно!'),
          e('button', {className: 'btn btn-primary btn-sm', onClick: onClose, style: {marginTop: '.6rem'}}, 'Готово')
        ) : null
      )
    )
  );
};

// ── T72: Session Management Panel ────────────────────────────────────────────
// Lists active sessions with revoke capability.
var SessionManagementPanel = function(props) {
  var onClose = props.onClose || function(){};
  var email = props.email || '';
  var _s = React.useState({sessions: [], loading: true, error: ''});
  var st = _s[0], setSt = _s[1];

  var load = function() {
    setSt(function(p) { return Object.assign({}, p, {loading: true}); });
    api('getsessionlist', {ownerEmail: email}).then(function(r) {
      if (r && r.success) setSt(function(p) { return Object.assign({}, p, {sessions: r.sessions || [], loading: false}); });
      else setSt(function(p) { return Object.assign({}, p, {loading: false, error: (r && r.error) || 'Грешка'}); });
    })["catch"](function(e) { setSt(function(p) { return Object.assign({}, p, {loading: false, error: e.message}); }); });
  };

  React.useEffect(load, []);

  var revoke = function(sid) {
    api('revokesession', {ownerEmail: email, sessionId: sid}).then(function() { load(); })["catch"](function(){});
  };

  var revokeAllOthers = function() {
    st.sessions.forEach(function(s) { revoke(s.id); });
  };

  var uaShort = function(ua) {
    if (!ua) return 'Неизвестно';
    if (ua.length <= 50) return ua;
    return ua.substring(0, 47) + '...';
  };

  return e('div', {className: 'modal-overlay', style: {zIndex: 9998}},
    e('div', {className: 'modal-box', style: {maxWidth: '560px', maxHeight: '80vh', overflow: 'auto'}, onClick: function(e) { e.stopPropagation(); }},
      e('div', {className: 'modal-head'},
        e('h3', null, e('i', {className: 'fas fa-desktop', style: {marginRight: '.4rem'}}), 'Активни сесии'),
        e('button', {type: 'button', className: 'close-btn', 'aria-label': 'Затвори', onClick: onClose}, e('i', {className: 'fas fa-times'}))
      ),
      e('div', {className: 'modal-body'},
        st.loading ? e('p', null, 'Зареждане...') :
        st.error ? e('p', {style: {color: 'var(--err)'}}, st.error) :
        e('div', null,
          e('div', {style: {marginBottom: '.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}},
            e('span', {style: {fontSize: '.82rem', color: '#666'}},
              st.count || st.sessions.length, ' активна(и) сесия(и)'),
            e('button', {className: 'btn btn-outline btn-xs', onClick: revokeAllOthers, disabled: st.sessions.length <= 1},
              e('i', {className: 'fas fa-sign-out-alt', style: {marginRight: '.3rem'}}), 'Отмени всички други')
          ),
          st.sessions.length === 0 ? e('p', {style: {color: '#888', fontSize: '.85rem'}}, 'Няма активни сесии.') :
          st.sessions.map(function(s) {
            return e('div', {key: s.id, style: {padding: '.5rem', border: '1px solid #eee', borderRadius: 6, marginBottom: '.4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}},
              e('div', {style: {fontSize: '.78rem'}},
                e('div', null, e('i', {className: 'fas fa-network-wired', style: {marginRight: '.3rem', color: '#888'}}), 'IP: ', s.ip || '—'),
                e('div', {style: {color: '#666', marginTop: '.15rem'}}, uaShort(s.userAgent || s.user_agent)),
                e('div', {style: {color: '#888', marginTop: '.15rem'}}, 'Последна активност: ', s.lastActive || s.last_active || '—')
              ),
              e('button', {className: 'btn btn-outline btn-xs', onClick: function() { revoke(s.id); }},
                e('i', {className: 'fas fa-times', style: {marginRight: '.2rem'}}), 'Отмени')
            );
          })
        )
      ),
      e('div', {className: 'modal-footer', style: {justifyContent: 'center'}},
        e('button', {className: 'btn btn-outline', onClick: onClose}, 'Затвори')
      )
    )
  );
};

try{
// ── Bootstrap guard: verify the rendering engine is available ──
if(typeof ReactDOM==='undefined'||typeof React==='undefined'){
  var _missing='';
  if(typeof React==='undefined')_missing+='React ';
  if(typeof ReactDOM==='undefined')_missing+='ReactDOM ';
  throw new Error(_missing.trim()+'библиотеката не е заредена. Проверете интернет връзката.\n\n'+
    'Решения:\n'+
    '1. Хостинг: отворете през уеб сървър (напр. VS Code Live Server), не директно от файловата система.\n'+
    '2. Адблокер: изключете го за този сайт.\n'+
    '3. Кеш: очистете кеша на браузъра или отворете в инкогнито.\n'+
    '4. Ако проблемът продължава, проверете конзолата (F12 > Console) за повече подробности.');
}
var _EB=typeof ErrorBoundary==='function'?ErrorBoundary:React.Fragment;
// ── UC-23 anonymous public results bypass ──────────────────────────
// When the URL is #/public-results or carries ?public=results, render
// the standalone PublicResultsView instead of the auth-gated App.
// Skips Google Sign-In entirely so external visitors (rectorate, MON,
// applicants) can audit competition outcomes without an account.
var _isPublicResultsRoute=(function(){try{
  var h=String(location.hash||'').toLowerCase();
  var s=String(location.search||'').toLowerCase();
  return h==='#/public-results'||h==='#public-results'||/[?&]public=results\b/.test(s);
}catch(_){return false;}})();
if(_isPublicResultsRoute&&typeof PublicResultsView==='function'){
  try{var _ls=document.getElementById('loading-screen');if(_ls)_ls.classList.add('hidden');}catch(_){}
  ReactDOM.createRoot(document.getElementById('root')).render(e(_EB,null,e(PublicResultsView)));
}else if(typeof ProfilePage==='function'&&(location.hash==='#/myprofile'||location.hash==='#myprofile'||String(location.pathname).replace(/^\//,'')==='#myprofile')){
  try{var _ls=document.getElementById('loading-screen');if(_ls)_ls.classList.add('hidden');}catch(_){}
  ReactDOM.createRoot(document.getElementById('root')).render(e(_EB,null,e(ProfilePage,{user:_APP_INIT.user||null})));
}else{
  ReactDOM.createRoot(document.getElementById('root')).render(e(_EB,null,e(App)));
}

// ----- profile-page router -----
(function(){
  try{
    if(typeof window!=='undefined'&&typeof window.addEventListener==='function'){
      var _pph=function(){
        try{
          var _h=String(location.hash||'').toLowerCase();
          var _p=String(location.pathname||'').replace(/^\//,'');
          if(_h==='#/myprofile'||_h==='#myprofile'||_p==='#myprofile'){
            if(typeof ReactDOM!=='undefined'&&typeof ProfilePage!=='undefined'){
              var _r=document.getElementById('root');
              if(_r){ReactDOM.createRoot(_r).render(e(React.Fragment,null,e(ProfilePage,{user:_APP_INIT.user||null})));}
            }
          }else{
            if(typeof ReactDOM!=='undefined'&&typeof App!=='undefined'){
              var _r=document.getElementById('root');
              if(_r){ReactDOM.createRoot(_r).render(e(_EB,null,e(App)));}
            }
          }
        }catch(_){}
      };
      window.addEventListener('hashchange',_pph);
    }
  }catch(_){}
})();

}catch(err){

var _r=document.getElementById('root');
var _stk='';
try{_stk=String((err&&err.stack)||'').split('\n').slice(0,6).join(' \u2192 ').replace(/</g,'&lt;');}catch(_){}
var _msg='';
try{_msg=String(err.message||err).replace(/</g,'&lt;');}catch(_){_msg='Неизвестна грешка при инициализация';}
if(_r)_r.innerHTML='<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;background:#F4F5F7"><div style="text-align:center;max-width:640px;padding:2rem"><h2 style="color:#991B1B;margin:0 0 .5rem">Грешка при стартиране</h2><p style="color:#505050;margin:0 0 1rem;line-height:1.6">'+_msg+'</p><pre style="text-align:left;background:#fff;border:1px solid #eee;padding:.6rem;border-radius:6px;font-size:.7rem;color:#666;overflow:auto;max-height:200px">'+_stk+'</pre><p style="color:#888;font-size:.7rem;margin-top:.5rem">'+location.href.replace(/</g,'&lt;')+'</p><button onclick="location.reload()" style="margin-top:1rem;padding:.6rem 1.5rem;background:#233874;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:.9rem">Опресни страницата</button></div></div>';
try{console.error('[boot-render-error]',err);}catch(_){}
try{hideLoadingScreen()}catch(_){}
}

/* ============================================================================
 * Analytics (page_visit / page_exit → Formspree, GDPR-gated, session/IP/UA,
 * compact emoji report) lives exclusively in js/main.js as of v5.2.5A1.
 * The previous duplicated IIFE was removed to eliminate the
 * `window._analyticsSent` race that suppressed main.js's send and to drop
 * the extra `app_mounted` Formspree row. Do NOT re-add analytics code here.
 * ============================================================================ */


