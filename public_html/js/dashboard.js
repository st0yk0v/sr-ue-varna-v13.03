
// ============================================================
//  DASHBOARD VIEW — Конкурси · Класиране · Проекти · Отчети
//  Unified interactive board per admin/workflow requirements
// ============================================================

// ── Module-level constants (avoid re-creation on every render) ──
// Each phase enriched with `step` (BPMN order), `sla` (regulatory deadline label
// from Правилник + Кратко описание на процесите), `uc` (use-case ID range), and
// `owner` (primary responsible role) so the dashboard renders as a true mission
// control with traceable references back to the BPMN/UC table.
var BPMN_PHASES=[
    {id:'configuration',step:1,label:'Конфигуриране',icon:'fa-sliders',desc:'Конфигуриране на конкурс, одобрение от АС и публикуване',uc:'UC-01–04',owner:'Зам.-ректор · АС · Ректор',sla:'',statuses:['configured','approved_by_ac','published','open_for_submission'],color:'var(--ink-4)'},
    {id:'intake',step:2,label:'Прием',icon:'fa-inbox',desc:'Подаване на проектни предложения в рамките на конкурса',uc:'UC-05–10',owner:'Кандидат',sla:'≤ 1 месец',statuses:['draft','completed','submitted'],color:'var(--info)'},
    {id:'screening',step:3,label:'Административна проверка',icon:'fa-user-shield',desc:'Проверка за административно съответствие и допустимост (правила 7 и 8)',uc:'UC-11 / UC-14',owner:'НИИ · ЦКК',sla:'',statuses:['admin_review','admin_passed','eligible','ineligible'],color:'var(--primary)'},
    {id:'corrections',step:4,label:'Корекции',icon:'fa-pen-to-square',desc:'Корекции при установени несъответствия — 5 работни дни',uc:'UC-12 / UC-13',owner:'Кандидат',sla:'≤ 5 раб. дни',statuses:['returned','needs_correction','resubmitted'],color:'var(--warn)'},
    {id:'review',step:5,label:'Рецензиране',icon:'fa-users',desc:'Двама рецензенти (поне 1 външен), съгласие, депозиране на рецензия',uc:'UC-15–17',owner:'Рецензенти · ЦКК',sla:'≤ 10 дни',statuses:['reviewers_proposed','reviewer_assignment','reviewer_invited','reviewer_accepted','in_review','review_submitted','reviewed'],color:'var(--review)'},
    {id:'scoring',step:6,label:'Оценка и класиране',icon:'fa-sort-amount-down',desc:'Консолидиране на точки, праг 50%+1, класиране по направление и тип',uc:'UC-18–20',owner:'ЦКК',sla:'',statuses:['scored','ranked','proposed_for_funding','rejected'],color:'var(--gold)'},
    {id:'approval',step:7,label:'Одобрение',icon:'fa-check-double',desc:'Решение на ЦКК и Академичен съвет за финансиране',uc:'UC-21–23',owner:'ЦКК · АС',sla:'',statuses:['approved_for_funding','approved'],color:'var(--ok)'},
    {id:'contracting',step:8,label:'Договаряне',icon:'fa-file-signature',desc:'Генериране и подписване на договор между ректора и ръководителя',uc:'UC-24–26',owner:'Ректор · Ръководител',sla:'≤ 10 дни',statuses:['contract_draft','contract_package_ready','contracting','contract_signed','contracted'],color:'var(--teal)'},
    {id:'execution',step:9,label:'Изпълнение',icon:'fa-flask',desc:'Активни проекти — дейности, резултати, разходи, промени',uc:'UC-27–34',owner:'Ръководител · ЦКК',sla:'1–3 г.',statuses:['active','in_execution','progress_updated','expense_requested','change_requested','change_under_review','change_approved','change_rejected'],color:'var(--red)'},
    {id:'reporting',step:10,label:'Отчитане',icon:'fa-chart-bar',desc:'Шестмесечен (10-то число) и годишен (10 дек.) отчет; финална рецензия 10 дни',uc:'UC-35–39 / UC-42',owner:'Ръководител · НИИ · ЦКК',sla:'10-то число',statuses:['reporting_due','report_submitted','report_under_review','report_accepted','report_returned_for_correction','final_report_prepared','final_review_submitted','final_evaluation','final_reporting'],color:'var(--warn)'},
    {id:'closing',step:11,label:'Приключване',icon:'fa-flag-checkered',desc:'Финално решение на ЦКК — успешно / частично / незадоволително; архивиране',uc:'UC-40 / UC-41',owner:'ЦКК · Библиотека',sla:'',statuses:['successfully_completed','partially_completed','unsatisfactory','closed','closed_with_sanction','closed_with_restriction','sanction_3year','archived'],color:'var(--ink-4)'}
];
var DASH_CHANGE_TYPES=[{value:'team_change',label:'Промяна в екипа'},{value:'leader_change',label:'Смяна на ръководител'},{value:'budget_change',label:'Промяна по план-сметка'},{value:'plan_update',label:'Актуализация за следваща година'},{value:'suspension',label:'Прекъсване'},{value:'termination',label:'Прекратяване'},{value:'addendum',label:'Допълнително споразумение'}];
var PROJ_STATUS_COLOR={active:'var(--ok)',in_execution:'var(--info)',progress_updated:'var(--info)',expense_requested:'var(--gold)',change_requested:'var(--warn)',change_under_review:'var(--warn)',change_approved:'var(--ok)',change_rejected:'var(--err)',final_reporting:'var(--warn)',reporting_due:'var(--warn)',closed:'var(--ink-4)',successfully_completed:'var(--ok)',partially_completed:'var(--warn)',unsatisfactory:'var(--err)',closed_with_sanction:'var(--err)',closed_with_restriction:'var(--err)',sanction_3year:'var(--err)'};
// Competition status labels — separate from proposal STATUS_LABELS
var COMP_STATUS_LABELS={active:'Активен',closed:'Затворен',results_published:'Публикуван',archived:'Архивиран',draft:'Чернова'};

var DashboardView=({user,userRole,isAdmin,forms:propForms,formsLoading:propFormsLoading,onApply,initialCompId,userEmail})=>{
const isPrivileged=isAdmin||userRole===ROLE_CKK||userRole===ROLE_NIDD;
// ── Unified "Конкурси" board ──────────────────────────────────────────
// Merges the former top-level "Конкурси" tab into this view as its first
// sub-tab so applicants, reviewers, CKK and admins share one mission
// control surface: Конкурси · Преглед · Класиране · Проекти · Събития.
// Reporting and MON отчети live in the top-level "Отчетност" tab.
const MAIN_TABS=useMemo(()=>[
    {id:'competitions',label:'Конкурси',icon:'fa-trophy'},
    {id:'overview',label:'Преглед',icon:'fa-th-large'},
    ...(isPrivileged?[{id:'ranking',label:'Класиране',icon:'fa-sort-amount-down'}]:[]),
    {id:'projects',label:'Проекти',icon:'fa-flask'},
    {id:'events',label:'Събития',icon:'fa-calendar-day'},
],[isPrivileged]);
const[mainTab,setMainTab]=useState('competitions');
// Resolve the competition sub-views from the shared bundle (same global
// registry app.js uses). Both live in competitions.js, evaluated before
// this file in views-bundle.js, so they are always defined by render time.
const _CompetitionView=(typeof window!=='undefined'&&window.CompetitionView)||(typeof CompetitionView!=='undefined'?CompetitionView:null);
const _ContestBoardView=(typeof window!=='undefined'&&window.ContestBoardView)||(typeof ContestBoardView!=='undefined'?ContestBoardView:null);

// ── Shared state ──
const[competitions,setCompetitions]=useState([]);
const[selectedComp,setSelectedComp]=useState('');
// Server-authoritative role-aware context (active BPMN phase, session, KPIs).
// Optional — if the endpoint is unavailable or stale, the dashboard falls
// back to client-side computation. Loaded once on mount, refreshed on the
// same triggers as the workflow board.
const[serverContext,setServerContext]=useState(null);
const[applications,setApplications]=useState([]);
const[rankResult,setRankResult]=useState(null);
const[rankLoading,setRankLoading]=useState(false);
const[generating,setGenerating]=useState(false);
const[approving,setApproving]=useState(false);
const[publishing,setPublishing]=useState(false);
const[selectedApp,setSelectedApp]=useState(null);

// ── Projects state ──
const[projects,setProjects]=useState([]);
const[projLoading,setProjLoading]=useState(false);
const[projError,setProjError]=useState('');
const[selectedProject,setSelectedProjectObj]=useState(null);
const[projDetailTab,setProjDetailTab]=useState('overview');
const[changeType,setChangeType]=useState('team_change');
const[changeDesc,setChangeDesc]=useState('');
const[changeSub,setChangeSub]=useState(false);
const[crReviewingId,setCrReviewingId]=useState('');
const[crDecisionNotes,setCrDecisionNotes]=useState('');
const[crDeciding,setCrDeciding]=useState(false);

// ── Workflow board state ──
const[workflowLoading,setWorkflowLoading]=useState(true);
const[workflowStats,setWorkflowStats]=useState(null);
const[projectDashboard,setProjectDashboard]=useState(null);

// ── Workflow expanded lane state ──
const[expandedLane,setExpandedLane]=useState(null);
const[signModal,setSignModal]=useState(null);
const[confirmModal,setConfirmModal]=useState(null);
// Reflect background SWR refreshes in the refresh button so it spins while data is being revalidated.
// IMPORTANT: each hook MUST be called unconditionally on every render (Rules of Hooks) —
// using `||` to short-circuit hook calls breaks React's internal hook list and throws
// "Cannot read properties of undefined (reading 'length')".
const bgFormsActive=useReadActivity('getforms');
const bgDashActive=useReadActivity('getprojectdashboard');
const bgProjActive=useReadActivity('getprojects');
const bgActivity=bgFormsActive||bgDashActive||bgProjActive;

// ── PM filters / search (useDeferredValue for non-blocking filtering) ──
const[projSearch,setProjSearch]=useState('');
const[projPhaseFilter,setProjPhaseFilter]=useState('');
// useDeferredValue defers the expensive filtering render while the input stays instant
const projSearchDeferred=useDeferredValue(projSearch.trim().toLowerCase());

// ── Memoized derived data (avoid recompute on unrelated state changes) ──
const filteredProjects=useMemo(()=>{
    const q=projSearchDeferred;
    const phaseId=projPhaseFilter;
    const phaseStatuses=phaseId?(BPMN_PHASES.find(p=>p.id===phaseId)?.statuses||[]):null;
    return projects.filter(p=>{
        if(phaseStatuses&&!phaseStatuses.includes(p.status))return false;
        if(!q)return true;
        return(String(p.title||'').toLowerCase().includes(q)
            ||String(p.leaderName||'').toLowerCase().includes(q)
            ||String(p.leaderEmail||'').toLowerCase().includes(q)
            ||String(p.projectCode||'').toLowerCase().includes(q)
            ||String(p.direction||'').toLowerCase().includes(q));
    });
},[projects,projSearchDeferred,projPhaseFilter]);

const buildWorkflowStats=useCallback(forms=>{
    const items=Array.isArray(forms)?forms:[];
    const statusCounts=items.reduce((acc,item)=>{
        const status=item.status||'unknown';
        acc[status]=(acc[status]||0)+1;
        return acc;
    },{});
    const applicantOwned=items.filter(item=>(item.userEmail||item.userId||'')===user.email);
    const pendingApplicant=applicantOwned.filter(item=>['draft','returned','needs_correction'].includes(item.status));
    const reviewQueue=items.filter(item=>['reviewer_assignment','in_review','reviewed'].includes(item.status));
    const adminQueue=items.filter(item=>['submitted','admin_review'].includes(item.status));
    const completed=items.filter(item=>['approved','contracted','contract_signed','active'].includes(item.status));

    const lanes=BPMN_PHASES.map(phase=>{
        const laneItems=items.filter(item=>phase.statuses.includes(item.status));
        return {...phase,count:laneItems.length,items:laneItems};
    });

    const totalProcessed=items.filter(item=>item.status!=='draft').length;
    const phaseCounts=lanes.map(l=>l.count);
    const maxPhaseCount=Math.max(1,...phaseCounts);

    return {
        total:items.length,
        totalProcessed,
        statusCounts,
        pendingApplicant,
        reviewQueue,
        adminQueue,
        completed,
        lanes,
        maxPhaseCount,
        allItems:items
    };
},[user.email]);

// ── Ref to track propForms without causing loadWorkflowBoard re-creation on every parent re-render ──
const propFormsRef=useRef(propForms);
useEffect(()=>{propFormsRef.current=propForms;},[propForms]);
// ── Load helpers ──
const loadCompetitions=useCallback(async()=>{
    api('getcompetitions',{userId:user.email}).then(res=>{if(res.success)setCompetitions(res.competitions||res.data?.competitions||[]);}).catch(()=>{});
},[user]);

// Server-authoritative dashboard context. Best-effort — failures are
// swallowed so the client-side fallback (downstream of `lanes` + the
// auto-select effect) remains the authoritative source. The endpoint is
// version-keyed via _ifVersionsMatch_, so repeated calls during a session
// usually return a ~120-byte notModified payload.
const loadServerContext=useCallback(async()=>{
    try{
        const payload={userId:user.email,role:userRole};
        if(isAdmin&&_adminCreds)Object.assign(payload,_adminCreds,{isAdmin:true});
        const res=await api('getdashboardcontext',payload);
        if(res&&res.success)setServerContext(res);
    }catch(_){/* fall back to client-side computation */}
},[user,userRole,isAdmin]);

const loadWorkflowBoard=useCallback(async(opts={})=>{
    const forceRefresh=!!opts.forceRefresh;
    setWorkflowLoading(true);
    try{
        const authPayload={userId:user.email,role:userRole};
        if(isAdmin&&_adminCreds)Object.assign(authPayload,_adminCreds,{isAdmin:true});
        if(forceRefresh)authPayload.forceRefresh=true;
        // Use forms ref to avoid re-creating this callback on every parent re-render
        const currentForms=propFormsRef.current;
        const hasPropForms=Array.isArray(currentForms)&&currentForms.length>0&&!forceRefresh;
        const[formsRes,projectDashRes]=await Promise.all([
            hasPropForms?Promise.resolve({success:true,forms:currentForms}):api('getforms',authPayload).catch(()=>({success:false,forms:[]})),
            api('getprojectdashboard',authPayload).catch(()=>({success:false,dashboard:null}))
        ]);
        const forms=formsRes.forms||formsRes.data?.forms||[];
        setWorkflowStats(buildWorkflowStats(forms));
        if(projectDashRes.success)setProjectDashboard(projectDashRes.dashboard||null);
    }finally{setWorkflowLoading(false);}
},[user.email,userRole,isAdmin,buildWorkflowStats]);

const loadApplicationsForComp=useCallback(async(compId)=>{
    if(!compId)return;
    setRankLoading(true);
    try{
        const res=await api('getapplicationsbycompetition',{competitionId:compId,userId:user.email});
        setApplications(res.applications||res.data?.applications||[]);
    }catch(_){}finally{setRankLoading(false);}
},[user]);

const _DASH_PROJ_CACHE_KEY='erp:dash:projects:'+(user?.email||'anon');
const _dashProjCacheGet=()=>{try{const r=localStorage.getItem(_DASH_PROJ_CACHE_KEY);if(!r)return null;const p=JSON.parse(r);if(Date.now()-p.ts>900000)return null;return p.data||[];}catch(_){return null}};
const _dashProjCacheSet=data=>{try{localStorage.setItem(_DASH_PROJ_CACHE_KEY,JSON.stringify({ts:Date.now(),data}));}catch(_){}};

const loadProjects=useCallback(async()=>{
    setProjLoading(true);setProjError('');
    try{
        // 1. Consume prefetched promise from boot-time prefetch (fastest)
        const prefetched=await consumePrefetch('projects');
        if(prefetched&&prefetched.success&&Array.isArray(prefetched.projects)){setProjects(prefetched.projects);_dashProjCacheSet(prefetched.projects);setProjLoading(false);return}
        // 2. Hydrate from localStorage for instant paint
        const cached=_dashProjCacheGet();
        if(cached&&cached.length){setProjects(cached);setProjLoading(false)}
        // 3. Fetch fresh (SWR: stale shown, fresh replaces)
        const res=await api('getprojects',{userId:user.email});
        if(res.success){setProjects(res.projects||[]);_dashProjCacheSet(res.projects||[]);}
        else if(!cached||!cached.length)setProjError(res.error||'Грешка при зареждане.');
    }
    catch(err){if(!projects.length)setProjError(err.message);}
    finally{setProjLoading(false);}
},[user]);

useEffect(()=>{if(isPrivileged)loadCompetitions();},[loadCompetitions,isPrivileged]);
// Projects power the briefing's hero metrics (active count, on-track %,
// budget burn). Load them on dashboard mount, not only when the Projects
// tab is opened — otherwise the overview shows zeros until the user
// drills into Projects, which is misleading mission-control behaviour.
useEffect(()=>{loadProjects();},[loadProjects]);
useEffect(()=>{loadWorkflowBoard();},[loadWorkflowBoard]);
// Server-authoritative context — fire-and-forget; the dashboard works
// without it via client-side fallback (see `_clientActivePhase` below).
useEffect(()=>{loadServerContext();},[loadServerContext]);
// Applicants need competition metadata too (session name, year, deadline,
// budget) so the briefing renders contextually for them as well.
useEffect(()=>{if(!isPrivileged)loadCompetitions();},[isPrivileged,loadCompetitions]);

// Auto-select the most relevant competition so the briefing has session
// context out of the box. Preference order:
//   1. an active/open competition the user has at least one application in
//   2. the soonest-deadline active/open competition
//   3. the first competition in the list
// Privileged roles get the first non-archived comp; applicants get one
// they've actually applied to. Runs once when competitions land.
useEffect(()=>{
    if(selectedComp||!Array.isArray(competitions)||!competitions.length)return;
    // Prefer server-picked session id when available — it has the same rule
    // (live + user has applications → live by deadline → first) but is
    // computed against the authoritative sheet rather than client-cached
    // workflowStats which may be stale.
    if(serverContext&&serverContext.session&&serverContext.session.id&&competitions.find(c=>c.id===serverContext.session.id)){
        setSelectedComp(serverContext.session.id);return;
    }
    const myEmail=(user.email||'').toLowerCase();
    const myItems=(workflowStats?.allItems||[]).filter(it=>String(it.userEmail||it.userId||'').toLowerCase()===myEmail);
    const myCompIds=new Set(myItems.map(it=>it.competitionId||it.competition).filter(Boolean));
    const isLive=c=>{const s=String(c.status||'').toLowerCase();return s==='active'||s==='open_for_submission'||s==='published'||s==='opened'||s==='evaluation_in_progress'};
    const sortByDeadline=arr=>arr.slice().sort((a,b)=>(new Date(a.deadline||a.dateEnd||0).getTime()||Infinity)-(new Date(b.deadline||b.dateEnd||0).getTime()||Infinity));
    const liveMine=sortByDeadline(competitions.filter(c=>myCompIds.has(c.id)&&isLive(c)));
    const live=sortByDeadline(competitions.filter(isLive));
    const pick=liveMine[0]||live[0]||competitions[0];
    if(pick&&pick.id)setSelectedComp(pick.id);
},[competitions,workflowStats,user.email,selectedComp,serverContext]);

// ── Upcoming events tab state + loader ──
const[eventsList,setEventsList]=useState([]);
const[eventsLoading,setEventsLoading]=useState(false);
const[eventsError,setEventsError]=useState('');
const[eventsHorizonDays,setEventsHorizonDays]=useState(60);
const[eventsTypeFilter,setEventsTypeFilter]=useState('all');
const loadEvents=useCallback(async(opts)=>{
    setEventsLoading(true);setEventsError('');
    try{
        const calRes=await api('getcalendarevents',{userId:user?.email||'',forceRefresh:!!(opts&&opts.forceRefresh)});
        const cal=(calRes&&calRes.success&&Array.isArray(calRes.events))?calRes.events:[];
        let merged=cal.slice();
        // Privileged users also get report deadlines + contract SLA
        if(isPrivileged){
            try{
                const dlRes=await api('getreportdeadlines',{userId:user?.email||'',forceRefresh:!!(opts&&opts.forceRefresh)});
                const dls=(dlRes&&Array.isArray(dlRes.deadlines))?dlRes.deadlines:(dlRes&&Array.isArray(dlRes.items)?dlRes.items:[]);
                dls.forEach(d=>{
                    merged.push({
                        id:'rpt_'+d.projectId+'_'+d.type+'_'+d.period,
                        projectId:d.projectId,
                        title:'Отчет ('+(d.type==='semiannual'?'полугодишен':d.type==='annual'?'годишен':'междинен')+'): '+(d.projectTitle||d.projectId).slice(0,42),
                        description:'Период: '+d.period+(d.leaderEmail?' · Ръководител: '+d.leaderEmail:''),
                        date:d.dueDate,
                        type:d.overdue?'overdue':'report_deadline',
                        color:d.overdue?'#a1281b':'#7B1B1B'
                    });
                });
            }catch(_){}
        }
        // Admin users also get contract SLA deadlines
        if(isAdmin||isPrivileged){
            try{
                const ctRes=await api('getcontractdeadlines',{userId:user?.email||'',forceRefresh:!!(opts&&opts.forceRefresh)});
                const cts=(ctRes&&Array.isArray(ctRes.deadlines))?ctRes.deadlines:(ctRes&&Array.isArray(ctRes.items)?ctRes.items:[]);
                cts.forEach(d=>{
                    merged.push({
                        id:'ctr_'+d.contractId+'_'+d.type,
                        title:'Договор: '+(d.projectTitle||d.contractId||'').slice(0,42),
                        description:(d.leaderEmail?'Ръководител: '+d.leaderEmail+' · ':'')+(d.daysRemaining!=null?(d.daysRemaining+' дни остават'):'Виж детайли'),
                        date:d.dueDate||d.deadline||d.date,
                        type:d.overdue?'overdue':'contract_deadline',
                        color:d.overdue?'#a1281b':'var(--teal)'
                    });
                });
            }catch(_){}
        }
        setEventsList(merged);
    }catch(err){setEventsError(err.message||'Грешка при зареждане на събития.');}
    finally{setEventsLoading(false)}
},[user?.email,isPrivileged]);
useEffect(()=>{if(mainTab==='events')loadEvents();},[mainTab,loadEvents]);

// ── Deadline-notify modal (admin → applicants) ──
const[deadlineNotifyOpen,setDeadlineNotifyOpen]=useState(false);

// ── Ranking actions ──
const handleGenerateRanking=useCallback(async()=>{
    setGenerating(true);
    try{const res=await api('generateranking',{competitionId:selectedComp,userId:user.email});
        if(res.success){setRankResult(res);toast('Класирането е генерирано.','success');await loadApplicationsForComp(selectedComp);}
        else toast(res.error||'Грешка.','error');}
    catch(err){toast(err.message,'error');}finally{setGenerating(false);}
},[selectedComp,user,loadApplicationsForComp]);

const handleApproveResults=useCallback(async()=>{
    setApproving(true);
    try{const res=await api('approveresults',{competitionId:selectedComp,userId:user.email});
        if(res.success){toast('Резултатите са одобрени ('+res.approvedCount+' проекта).','success');await loadApplicationsForComp(selectedComp);}
        else toast(res.error||'Грешка.','error');}
    catch(err){toast(err.message,'error');}finally{setApproving(false);}
},[selectedComp,user,loadApplicationsForComp]);

const handlePublishResults=useCallback(()=>{
    setConfirmModal({
        message:'Публикувате ли резултатите? Статусът на конкурса ще се промени на „Публикуван".',
        confirmLabel:'Публикувай',
        onConfirm:async()=>{
            setConfirmModal(null);
            setPublishing(true);
            try{const res=await api('publishresults',{competitionId:selectedComp,userId:user.email});
                if(res.success){toast('Резултатите са публикувани. Статус: Публикуван.','success',5000,{action:typeof copyPublicResultsLink==='function'?copyPublicResultsLink:null,actionLabel:'Копирай публичен линк'});clearApiCache();await loadCompetitions();}
                else toast(res.error||'Грешка.','error');}
            catch(err){toast(err.message,'error');}finally{setPublishing(false);}
        }
    });
},[selectedComp,user,loadCompetitions]);

// ── Projects actions ──
const loadProjectDetail=useCallback(async(id)=>{
    const res=await api('getproject',{projectId:id,userId:user.email}).catch(()=>null);
    if(res?.success)setSelectedProjectObj(res.project);
},[user]);

const handleChangeRequest=useCallback(async()=>{
    if(!selectedProject||!changeDesc.trim())return;
    setChangeSub(true);
    try{const res=await api('createchangerequest',{projectId:selectedProject.id,changeType,description:changeDesc,userId:user.email});
        if(res.success){toast('Искането е подадено.','success');setChangeDesc('');await loadProjectDetail(selectedProject.id);}
        else toast(res.error||'Грешка.','error');}
    catch(err){toast(err.message,'error');}finally{setChangeSub(false);}
},[selectedProject,changeType,changeDesc,user,loadProjectDetail]);

const handleDecideCR=useCallback(async(crId,decision)=>{
    if(!crId||!decision||!selectedProject)return;
    setCrDeciding(true);
    try{const res=await api('approvechangerequest',{changeRequestId:crId,decision,notes:crDecisionNotes,userId:user.email});
        if(res.success){
            toast(decision==='approved'?'Одобрено успешно.':'Отхвърлено.','success');
            setCrReviewingId('');setCrDecisionNotes('');
            await loadProjectDetail(selectedProject.id);
        }else toast(res.error||'Грешка.','error');}
    catch(err){toast(err.message,'error');}finally{setCrDeciding(false);}
},[selectedProject,crDecisionNotes,user,loadProjectDetail]);

// ── Expanded lane detail renderer (used by mission-control overview) ──
const renderLaneDetail=()=>{
    // Compute lane data from workflowStats — works regardless of competition filter
    const srcItems=workflowStats?.allItems||[];
    const filteredForLane=selectedComp?srcItems.filter(f=>f.competitionId===selectedComp||f.competition===selectedComp):srcItems;
    const wfStats=(selectedComp&&workflowStats)?buildWorkflowStats(filteredForLane):workflowStats;
    const wfLanes=wfStats?.lanes||[];
    const wfSc=wfStats?.statusCounts||{};
    const lane=wfLanes.find(l=>l.id===expandedLane);
    if(!lane)return null;
    // ── Prefer server-authoritative items for this lane ──────────────────
    // serverContext.laneItems[laneId] carries ≤50 lightweight summaries
    // (id, title, status, userName, userEmail, date). When available they
    // are the freshest data. Fall back to the client-computed lane.items
    // (which may be stale SWR cache). If both exist, server items win.
    var _svItems=serverContext&&serverContext.laneItems&&serverContext.laneItems[expandedLane]||null;
    var laneItems=_svItems&&_svItems.length?_svItems:(lane.items||[]);
    // Merge server count annotation into the count chip
    var displayCount=lane.count;
    var _svCount=serverContext&&serverContext.laneCounts&&serverContext.laneCounts[expandedLane]||null;
    if(typeof _svCount==='number'&&_svCount!==lane.count)displayCount=_svCount;
    const maxItems=window.innerWidth<=640?8:20;
    return e('div',{className:'card wf-lane-detail',style:{marginTop:'1.25rem'}},
        e('div',{className:'wf-lane-header',style:{borderLeftColor:lane.color}},
            e('div',{className:'wf-lane-title-row'},e('i',{className:'fas '+lane.icon,style:{color:lane.color}}),e('h3',null,'Стъпка '+lane.step+' · '+lane.label),e('span',{className:'count-chip'},displayCount),_svItems&&e('span',{className:'wf-lane-sv-chip',title:'Данните са потвърдени от сървъра'},e('i',{className:'fas fa-check-circle'}),' сървър')),
            e('p',{className:'wf-lane-desc'},lane.desc),
            e('div',{className:'wf-lane-meta-row'},
                e('span',{className:'wf-lane-meta-chip'},e('i',{className:'fas fa-bookmark'}),' ',lane.uc),
                lane.owner&&e('span',{className:'wf-lane-meta-chip'},e('i',{className:'fas fa-user-tie'}),' ',lane.owner),
                lane.sla&&e('span',{className:'wf-lane-meta-chip sla'},e('i',{className:'fas fa-stopwatch'}),' ',lane.sla)
            ),
            e('div',{className:'wf-lane-chips'},lane.statuses.map(s=>{const cnt=wfSc[s]||0;return cnt>0?e('span',{key:s,className:'wf-status-chip'},STATUS_LABELS[s]||s,e('strong',null,' '+cnt)):null;}))
        ),
        laneItems.length>0
            ?e('div',{className:'wf-lane-table-wrap'},
                e('table',{className:'wf-lane-table'},
                    e('thead',null,e('tr',null,e('th',null,'Заглавие'),e('th',null,'Кандидат'),e('th',null,'Статус'),e('th',null,'Дата'))),
                    e('tbody',null,laneItems.slice(0,maxItems).map((item,i)=>{
                        const itemTitle=item.title||item.id||('Проект '+(i+1));
                        const itemName=item.userName||item.userEmail||'—';
                        const itemStatus=item.status||'—';
                        // Server items use `date`; client items use `submitted`/`created`
                        const itemDate=item.date||item.submitted||item.created||'';
                        let deadlineWarn=null;
                        if(lane.id==='corrections'&&item.returnComment){try{const rc=typeof item.returnComment==='object'?item.returnComment:JSON.parse(item.returnComment);if(rc.deadline){const dl=new Date(rc.deadline);const days=Math.ceil((dl-new Date())/86400000);deadlineWarn=days<=0?'Срокът изтече':days+' дни остават';}}catch(_){}}
                        return e('tr',{key:item.id||i},
                            e('td',{'data-label':'Заглавие'},e('div',{className:'wf-item-title'},itemTitle),item.projectCode&&e('span',{className:'type-tag',style:{fontSize:'.6rem',marginTop:'.15rem'}},item.projectCode)),
                            e('td',{'data-label':'Кандидат'},itemName),
                            e('td',{'data-label':'Статус'},e('span',{className:'badge',style:{background:lane.color+'1a',color:lane.color,border:'1px solid '+lane.color+'33'}},STATUS_LABELS[itemStatus]||itemStatus),deadlineWarn&&e('div',{className:'wf-deadline-warn'},e('i',{className:'fas fa-clock'}),deadlineWarn)),
                            e('td',{'data-label':'Дата'},fmtDate(itemDate))
                        );
                    }))
                ),
                laneItems.length>maxItems&&e('div',{style:{padding:'.6rem 1rem',fontSize:'.75rem',color:'var(--ink-4)',textAlign:'center'}},'… и още '+(laneItems.length-maxItems)+' предложения')
            )
            :e('div',{className:'wf-lane-empty'},e('i',{className:'fas fa-inbox'}),e('p',null,'Няма предложения в тази фаза.')),
        e('button',{className:'btn btn-outline btn-sm wf-lane-close-btn',onClick:()=>setExpandedLane(null)},e('i',{className:'fas fa-chevron-up'}),' Скрий')
    );
};

const renderOverview=()=>{
    const allItems=workflowStats?.allItems||[];
    const filteredItems=selectedComp
        ?allItems.filter(f=>f.competitionId===selectedComp||f.competition===selectedComp)
        :allItems;
    const stats=(selectedComp&&workflowStats)?buildWorkflowStats(filteredItems):workflowStats;
    // ── Pipeline data source ────────────────────────────────────────────
    // When getDashboardContext succeeded, the server is the authority.
    // Lane counts come from serverContext.laneCounts (pre-computed against
    // the full sheet, not a cached subset). Lane detail items come from
    // serverContext.laneItems. Client-side workflowStats is only a fallback
    // when the server endpoint is unavailable.
    var _svLaneCounts=serverContext&&serverContext.laneCounts||null;
    var _svLaneItems=serverContext&&serverContext.laneItems||null;
    var lanes;
    if(_svLaneCounts){
        // Server-authoritative: build lanes from BPMN_PHASES + server counts.
        // This is faster because we skip the client-side buildWorkflowStats
        // filter/reduce pass over the full forms array.
        lanes=BPMN_PHASES.map(function(ph){
            var svCnt=_svLaneCounts[ph.id]||0;
            var svItems=_svLaneItems&&_svLaneItems[ph.id]||null;
            return Object.assign({},ph,{
                count:svCnt,
                _serverCount:svCnt,
                _serverItems:svItems,
                items:[] // filled on-demand by renderLaneDetail
            });
        });
    }else{
        // Client fallback: compute from workflowStats
        lanes=(stats?.lanes||[]).map(function(l){
            return Object.assign({},l,{_serverCount:null,_serverItems:null});
        });
    }
    const sc=stats?.statusCounts||{};
    const selCompObj=competitions.find(c=>c.id===selectedComp);
    const projsAll=Array.isArray(projects)?projects:[];
    const projActiveCnt=projsAll.filter(p=>['active','in_execution','progress_updated'].includes(p.status)).length;
    const projReportingDue=projsAll.filter(p=>['reporting_due','final_reporting','report_returned_for_correction'].includes(p.status)).length;
    const now=Date.now();const dayMs=86400000;
    const urgentItems=[];const reviewItems=[];const nextStepItems=[];const blockedItems=[];
    (filteredItems||[]).forEach(item=>{
        const st=item.status||'';
        if(['closed_with_sanction','closed_with_restriction','sanction_3year','unsatisfactory','ineligible'].includes(st)){
            blockedItems.push({...item,_reason:STATUS_LABELS[st]||st,_lane:'closing'});
        }else if(['returned','needs_correction'].includes(st)){
            let days=null;if(item.returnComment){try{const rc=JSON.parse(item.returnComment);if(rc.deadline)days=Math.ceil((new Date(rc.deadline).getTime()-now)/dayMs);}catch(_){}}
            const target=days!==null&&days<=2?urgentItems:nextStepItems;
            target.push({...item,_reason:days!==null?(days<0?'Просрочена с '+Math.abs(days)+' дни':days+' дни до краен срок'):'Изчаква корекция',_lane:'corrections'});
        }else if(['reviewer_assignment','reviewer_invited','reviewer_accepted','in_review'].includes(st)){
            const sent=item.reviewSentAt||item.assignedAt||item.submitted;let days=null;if(sent)days=Math.ceil((now-new Date(sent).getTime())/dayMs);
            const overdue=days!==null&&days>10;(overdue?urgentItems:reviewItems).push({...item,_reason:overdue?'Рецензия просрочена ('+days+' дни)':(days!==null?days+' дни в рецензиране':'Очаква рецензент'),_lane:'review'});
        }else if(['submitted','admin_review'].includes(st)){reviewItems.push({...item,_reason:'Очаква проверка',_lane:'screening'});
        }else if(st==='resubmitted'){reviewItems.push({...item,_reason:'Повторно подадено',_lane:'corrections'});
        }else if(['draft'].includes(st)&&(item.userEmail||item.userId)===user.email){nextStepItems.push({...item,_reason:'Чернова — подайте',_lane:'intake'});}
    });
    projsAll.forEach(p=>{if(['reporting_due','final_reporting'].includes(p.status)){const due=p.reportDueAt||p.nextReportDate;let days=null;if(due)days=Math.ceil((new Date(due).getTime()-now)/dayMs);if(days!==null&&days<0)urgentItems.push({id:'p_'+p.id,title:p.title||p.name||p.id,_reason:'Отчет просрочен с '+Math.abs(days)+' дни',_lane:'reporting',_project:true});else reviewItems.push({id:'p_'+p.id,title:p.title||p.name||p.id,_reason:days!==null?days+' дни до отчет':'Отчет предстои',_lane:'reporting',_project:true});}});
    urgentItems.sort((a,b)=>(a._reason||'').localeCompare(b._reason||''));
    const totalCount=_svLaneCounts
        ? lanes.reduce(function(s,l){return s+(l.count||0);},0)
        : (stats?.total||0);
    const handleLaneClick=lane=>{setExpandedLane(expandedLane===lane.id?null:lane.id);try{setTimeout(()=>{const el=document.querySelector('.wf-lane-detail');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});},80);}catch(_){}};
    const handleJumpProjects=()=>{setMainTab('projects');if(!projects.length)loadProjects();};

    // ── Deadline radar: next 10 days of deadlines ──
    const radarDays=[];for(let i=0;i<10;i++){const d=new Date(now+i*dayMs);const ds=d.toISOString().slice(0,10);const cnt=filteredItems.filter(it=>{const dl=it.deadline||it.dateEnd||it.reportDueAt;if(!dl)return false;return String(dl).slice(0,10)===ds;}).length;radarDays.push({date:d,label:d.toLocaleDateString('bg-BG',{weekday:'short'}),day:d.getDate(),month:d.getMonth()+1,count:cnt,isToday:i===0});}

    // ── Executive briefing (role-aware hero) ──────────────────────
    // Calm, high-signal summary block at the very top of the dashboard.
    // Mirrors the visual spec from the 2026-05 redesign: greeting + session
    // badge, two hero metric cards (active projects health, budget burn),
    // three KPI tiles (role-aware), and a prioritised "Requires your
    // attention" feed. Every metric below is derived from already-loaded
    // workflowStats / projects state — no extra API calls.
    const _now=new Date(now);
    const _hr=_now.getHours();
    const _greet=_hr<11?'Добро утро':_hr<18?'Добър ден':'Добър вечер';
    const _displayName=user.displayName||user.name||(user.email||'').split('@')[0]||'';
    const _dateLabel=_now.toLocaleDateString('bg-BG',{day:'numeric',month:'long',year:'numeric'});
    // ── Session week — relative to the SELECTED competition's openDate
    // (or its created timestamp as fallback). This matches the regulatory
    // notion of "седмица N от конкурсната сесия" rather than ISO week of
    // the calendar year. When no competition is selected (e.g. brand new
    // applicant), fall back to ISO week of year so the chip is still useful.
    const _sessionStartRaw=selCompObj?.openDate||selCompObj?.startDate||selCompObj?.created;
    let _sessionWeek=null;let _sessionWeekIsCalendar=false;
    if(_sessionStartRaw){
        const _t=new Date(_sessionStartRaw).getTime();
        if(!isNaN(_t)&&_t<=now){_sessionWeek=Math.max(1,Math.ceil((now-_t)/(7*dayMs)));}
    }
    if(_sessionWeek===null){
        _sessionWeekIsCalendar=true;
        _sessionWeek=(d=>{const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const dn=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-dn);const ys=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-ys)/dayMs+1)/7);})(_now);
    }
    const _sessionYear=selCompObj?.year||(_sessionStartRaw?String(_sessionStartRaw).slice(0,4):null)||_now.getFullYear();
    // Role bucket → which KPI tiles to show.
    const _roleBucket=isPrivileged?'privileged':(userRole===ROLE_REVIEWER||userRole===ROLE_APPLICANT_REVIEWER?'reviewer':'applicant');
    // Active-projects health breakdown.
    const _projOnTrack=projsAll.filter(p=>['active','in_execution','progress_updated','change_approved'].includes(p.status)).length;
    const _projAtRisk=projsAll.filter(p=>['change_requested','change_under_review','expense_requested','reporting_due','report_returned_for_correction'].includes(p.status)).length;
    const _projOverdue=projsAll.filter(p=>{if(['final_reporting','reporting_due'].includes(p.status)){const due=p.reportDueAt||p.nextReportDate;if(due&&new Date(due).getTime()<now)return true;}return false;}).length+blockedItems.filter(b=>b._lane==='execution'||b._lane==='reporting').length;
    const _projTotalActive=_projOnTrack+_projAtRisk+_projOverdue;
    const _onSchedulePct=_projTotalActive>0?Math.round(_projOnTrack/_projTotalActive*100):0;
    // ── Budget burn — preference order:
    //   1. Selected competition's `budget` field (now surfaced by gas.js v3.19+)
    //   2. Sum of selected-competition project budgets, when comp has none
    //   3. Sum of all visible competition budgets (privileged global view)
    // Spent: sum of all project budgets currently in execution/reporting/closing.
    const _compBudget=Number(selCompObj?.budget||selCompObj?.totalBudget||0);
    const _projsForBudget=selectedComp?projsAll.filter(p=>p.competitionId===selectedComp):projsAll;
    const _budgetTotal=_compBudget>0?_compBudget:(selectedComp?_projsForBudget.reduce((s,p)=>s+(Number(p.budget)||0),0):competitions.reduce((s,c)=>s+(Number(c.budget)||Number(c.totalBudget)||0),0));
    const _budgetUsed=_projsForBudget.filter(p=>['active','in_execution','progress_updated','reporting_due','report_submitted','report_under_review','report_accepted','final_reporting','closed','successfully_completed','partially_completed'].includes(p.status)).reduce((s,p)=>s+(Number(p.budget)||0),0);
    const _budgetPct=_budgetTotal>0?Math.min(100,Math.round(_budgetUsed/_budgetTotal*100)):0;
    const _EUR_BGN=typeof EUR_BGN!=='undefined'?EUR_BGN:1.95583;
    const _eurFmt=n=>(n/_EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2});
    const _budgetTotalEur=_budgetTotal/_EUR_BGN;
    const _budgetHumanTotal=_budgetTotalEur>=1e6?(_budgetTotalEur/1e6).toFixed(1)+' млн. €':_budgetTotalEur>=1e3?(_budgetTotalEur/1e3).toFixed(0)+' хил. €':_budgetTotalEur.toFixed(0)+' €';
    // KPI tiles — picked per role bucket.
    const _expiringSoon=filteredItems.filter(it=>{const dl=it.deadline||it.dateEnd||it.reportDueAt;if(!dl)return false;const ds=Math.ceil((new Date(dl).getTime()-now)/dayMs);return ds>=0&&ds<=3;}).length;
    const _awaitingSign=filteredItems.filter(it=>['contract_draft','contract_package_ready','contracting'].includes(it.status)).length;
    const _myDrafts=filteredItems.filter(it=>(it.userEmail||it.userId)===user.email&&it.status==='draft').length;
    const _myReturned=filteredItems.filter(it=>(it.userEmail||it.userId)===user.email&&['returned','needs_correction'].includes(it.status)).length;
    const _myInReview=filteredItems.filter(it=>(it.userEmail||it.userId)===user.email&&['in_review','reviewer_assignment','reviewer_invited','reviewer_accepted','reviewed','review_submitted'].includes(it.status)).length;
    const _rvAssigned=(stats?.reviewQueue?.length||0);
    const _rvOverdue=urgentItems.filter(u=>u._lane==='review').length;
    const _rvSubmitted=filteredItems.filter(it=>['review_submitted','reviewed'].includes(it.status)).length;
    const _kpiTiles=_roleBucket==='privileged'?[
        {id:'review',label:'За преглед',value:(stats?.adminQueue?.length||0)+(stats?.reviewQueue?.length||0),lane:'screening'},
        {id:'expiring',label:'Изтичащ срок',value:_expiringSoon,tone:_expiringSoon>0?'warn':null,lane:'review'},
        {id:'sign',label:'Очакват подпис',value:_awaitingSign,lane:'contracting'}
    ]:_roleBucket==='reviewer'?[
        {id:'assigned',label:'Назначени на мен',value:_rvAssigned,lane:'review'},
        {id:'overdue',label:'Изтичащ срок',value:_rvOverdue,tone:_rvOverdue>0?'warn':null,lane:'review'},
        {id:'submitted',label:'Подадени рецензии',value:_rvSubmitted,lane:'review'}
    ]:[
        {id:'drafts',label:'Мои чернови',value:_myDrafts,lane:'intake'},
        {id:'returned',label:'Чакат корекция',value:_myReturned,tone:_myReturned>0?'warn':null,lane:'corrections'},
        {id:'review',label:'В рецензия',value:_myInReview,lane:'review'}
    ];
    // Attention feed — top priority items, dot-coded by urgency.
    const _attention=[
        ...urgentItems.slice(0,4).map(u=>({tone:'err',title:u.title||u.id||'—',sub:u._reason,lane:u._lane,project:!!u._project})),
        ...reviewItems.filter(r=>!urgentItems.includes(r)).slice(0,3).map(r=>({tone:'warn',title:r.title||r.id||'—',sub:r._reason,lane:r._lane,project:!!r._project})),
        ...nextStepItems.slice(0,2).map(n=>({tone:'info',title:n.title||n.id||'—',sub:n._reason,lane:n._lane}))
    ].slice(0,6);
    const _onAttentionClick=item=>{if(item.project)handleJumpProjects();else if(item.lane)handleLaneClick(lanes.find(l=>l.id===item.lane)||{id:item.lane});};

    // ═══════════ ROLE-BASED STAT CARDS (matching 3-panel image spec) ═══════
    var _roleCards=[];
    if(_roleBucket==='privileged'){
        _roleCards=[
            {id:'active',icon:'fa-flask',num:_projTotalActive||projActiveCnt||0,label:'Активни проекти',sub:[_projOnTrack+' в изпълнение',_projAtRisk+' подготвят се'],barPct:_projTotalActive>0?_onSchedulePct:0,barOk:true},
            {id:'deadlines',icon:'fa-clock',num:radarDays.reduce(function(s,r){return s+r.count},0),label:'Срокове \u00b7 следващите 10 дни',sub:['Контракти','Явявания'],tone:radarDays.reduce(function(s,r){return s+r.count},0)>5?'warn':null},
            {id:'review',icon:'fa-clipboard-check',num:(stats?.adminQueue?.length||0)+(stats?.reviewQueue?.length||0),label:'За преглед',action:'Започни',actionLane:'screening'},
            {id:'done',icon:'fa-check-circle',num:stats?.completed?.length||0,label:'Изпълнен срок'},
            {id:'sign',icon:'fa-pen-to-square',num:_awaitingSign,label:'Очакват подпис',action:_awaitingSign>0?'Ускори':null,actionLane:'contracting',tone:_awaitingSign>0?'warn':null}
        ];
    }else if(_roleBucket==='reviewer'){
        _roleCards=[
            {id:'tasks',icon:'fa-tasks',num:_rvAssigned,label:'Моите задачи',sub:['Нови: '+(stats?.reviewQueue?.length||0),'В процес: '+_rvSubmitted]},
            {id:'deadlines',icon:'fa-clock',num:_rvOverdue+_rvAssigned,label:'Крайни срокове',tone:_rvOverdue>0?'err':null},
            {id:'info',icon:'fa-info-circle',num:reviewItems.length+nextStepItems.length,label:'Очаквам информация'}
        ];
    }else{
        _roleCards=[
            {id:'apps',icon:'fa-file-lines',num:_myDrafts+_myReturned+_myInReview,label:'Моите заявления',sub:['Нови: '+_myDrafts,'Обработени: '+(_myReturned+_myInReview)]},
            {id:'projects',icon:'fa-flask',num:_projTotalActive||projActiveCnt||0,label:'Проекти в изпълнение',sub:['Технически критерии: '+_projOnTrack]},
            {id:'corrections',icon:'fa-triangle-exclamation',num:_myReturned,label:'Изискват корекции',action:_myReturned>0?'Започни корекции':null,tone:_myReturned>0?'err':null},
            {id:'notifications',icon:'fa-bell',num:nextStepItems.length+urgentItems.length,label:'Нови известия'},
            {id:'deadlines',icon:'fa-calendar-xmark',num:radarDays.reduce(function(s,r){return s+r.count},0),label:'Крайни срокове за подаване',sub:['17 Май']}
        ];
    }

    var _renderTimeline=function(){
        var phases=_roleBucket==='privileged'?[
            {label:'Подаване на заявления',count:totalCount,active:true},
            {label:'Техническа проверка',count:(sc.submitted||0)+(sc.admin_review||0),active:!!(sc.submitted||sc.admin_review)},
            {label:'Експертна оценка',count:(sc.in_review||0)+(sc.review_submitted||0)+(sc.reviewed||0),active:!!(sc.in_review||sc.review_submitted)},
            {label:'Класиране',count:(sc.scored||0)+(sc.ranked||0),active:!!(sc.scored||sc.ranked)},
            {label:'Сключване на договори',count:(sc.contract_draft||0)+(sc.contracting||0)+(sc.contracted||0),active:!!(sc.contract_draft||sc.contracting)}
        ]:_roleBucket==='reviewer'?[
            {label:'Разпределение',count:_rvAssigned,active:true},
            {label:'Попълване',count:_rvSubmitted,active:_rvSubmitted>0},
            {label:'Критерии',count:0,active:false},
            {label:'Коментари',count:0,active:false},
            {label:'Изпращане',count:_rvSubmitted,active:_rvSubmitted>0}
        ]:[
            {label:'Подадено',count:1,active:true,done:true},
            {label:'Техническа проверка',count:0,active:true},
            {label:'Експертна оценка',count:0,active:!!_myInReview},
            {label:'Класиране',count:0,active:false},
            {label:'Договор',count:0,active:false}
        ];
        return e('div',{className:'dash-timeline'},
            phases.map(function(ph,i){
                var cls='dash-tl-step'+(ph.active?' active':'')+(ph.done?' done':'');
                return e('div',{key:i,className:cls},
                    e('div',{className:'dash-tl-dot'}),
                    e('div',{className:'dash-tl-label'},ph.label),
                    (ph.count>0)&&e('div',{className:'dash-tl-count'},ph.count)
                );
            })
        );
    };

    var _roleActions=_roleBucket==='privileged'?[
        {icon:'fa-user-shield',label:'Проверки заявления',count:(stats?.adminQueue?.length||0),lane:'screening'},
        {icon:'fa-flask',label:'Проекти',tab:'projects'},
        {icon:'fa-calendar-day',label:'Събития',tab:'events'},
        {icon:'fa-bell',label:'Известия за срокове',adminNotify:true}
    ]:_roleBucket==='reviewer'?[
        {icon:'fa-pen',label:'Напиши нова оценка',lane:'review'},
        {icon:'fa-eye',label:'Разгледай проекти',tab:'projects'},
        {icon:'fa-envelope',label:'Известие към кандидат',lane:'review'},
        {icon:'fa-book',label:'Инструкции за оценка',lane:'review'}
    ]:[
        {icon:'fa-file-circle-plus',label:'Подаване на ново заявление',tab:'applications'},
        {icon:'fa-magnifying-glass',label:'Преглед на мои проекти',tab:'projects'},
        {icon:'fa-comment-dots',label:'Съобщение към администратор',lane:'screening'},
        {icon:'fa-circle-question',label:'Помощ и ресурси',help:true}
    ];

    var _handleRoleAction=function(a){
        if(a.lane){handleLaneClick(lanes.find(function(l){return l.id===a.lane})||{id:a.lane});return}
        if(a.tab){setMainTab(a.tab);if(a.tab==='projects'&&!projects.length)loadProjects();return}
        if(a.adminNotify&&isAdmin){setDeadlineNotifyOpen(true);return}
        if(a.help){toast('Помощната секция е достъпна в горното меню.','info');return}
    };

    return e('div',{className:'mc-dashboard'},
        // ═══════════ ROW 0: ROLE-BASED OVERVIEW ═══════════
        e('section',{className:'mc-briefing','aria-label':'Кратък преглед'},
            e('header',{className:'mc-briefing-head'},
                e('div',{className:'mc-briefing-greet'},
                    e('div',{className:'mc-briefing-hello'},_greet,', ',e('strong',null,_displayName)),
                    e('div',{className:'mc-briefing-session'},
                        (function(){var wkLabel=_sessionWeekIsCalendar?'седмица '+_sessionWeek+' (календарна)':'седмица '+_sessionWeek+' от сесията';return selCompObj?[(selCompObj.name||'Конкурсна сесия '+_sessionYear),' · ',wkLabel]:['Конкурсна сесия ',_sessionYear,' · ',wkLabel];})())
                ),
                e('div',{className:'mc-briefing-meta'},
                    e('span',{className:'mc-briefing-date'},_dateLabel),
                    e('button',{type:'button',className:'mc-briefing-menu',title:'Опресни',onClick:function(){loadWorkflowBoard({forceRefresh:true});loadProjects();},'aria-label':'Опресни данните'},
                        e('i',{className:'fas fa-ellipsis-h'}))
                )
            ),
            // ── Role-based stat card grid ──
            e('div',{className:'dash-stats-grid',style:{marginTop:'.75rem'}},
                _roleCards.map(function(c){
                    var toneCls=c.tone||'';
                    return e('div',{key:c.id,className:'dash-stat-card'+(toneCls?' '+toneCls:''),onClick:c.actionLane?function(){handleLaneClick(lanes.find(function(l){return l.id===c.actionLane})||{id:c.actionLane});}:undefined,style:c.actionLane?{cursor:'pointer'}:undefined},
                        e('div',{className:'stat-icon-row'},
                            e('i',{className:'fas '+c.icon+' stat-icon'}),
                            e('div',{className:'stat-num'},c.num)
                        ),
                        e('div',{className:'stat-label'},c.label),
                        c.sub&&e('div',{className:'stat-sub'},c.sub.map(function(s,i){return e('span',{key:i},s);})),
                        c.barPct!==undefined&&e('div',{className:'stat-bar'},e('div',{className:'stat-bar-fill',style:{width:c.barPct+'%',background:c.barOk?'var(--ok)':'var(--brand-teal)'}})),
                        c.action&&e('div',{className:'stat-action'},e('button',{className:'btn btn-sm btn-outline',onClick:function(ev){ev.stopPropagation();if(c.actionLane)handleLaneClick(lanes.find(function(l){return l.id===c.actionLane})||{id:c.actionLane});}},c.action))
                    );
                })
            ),
            // ── Process timeline ──
            totalCount>0&&e('div',{style:{marginTop:'.85rem'}},_renderTimeline())
        ),
        // ═══════════ QUICK ACTIONS ═══════════
        e('section',{className:'mc-section mc-section-quick','aria-label':'Бързи действия'},
            e('div',{className:'dash-actions-row'},
                _roleActions.map(function(a,i){
                    return e('button',{key:i,type:'button',className:'btn btn-outline btn-sm dash-action-btn',onClick:function(){_handleRoleAction(a);}},
                        e('i',{className:'fas '+a.icon,style:{marginRight:'.35rem'}}),a.label+(a.count?' ('+a.count+')':'')
                    );
                })
            )
        ),
        // ═══════════ PROCESS RAIL · BPMN PIPELINE (privileged only) ═══════════
        isPrivileged&&e('section',{className:'mc-section mc-section-pipeline','aria-label':'Процес на конкурса'},
            e('div',{className:'mc-section-head'},
                e('div',{className:'mc-section-title-wrap'},
                    e('h3',{className:'mc-section-title'},'Процес на конкурса'),
                    selCompObj&&e('span',{className:'mc-section-sub'},selCompObj.name||selCompObj.id),
                    !workflowLoading&&totalCount>0&&e('span',{className:'mc-section-count'},totalCount,' предложения'),
                    workflowLoading&&e('i',{className:'fas fa-spinner spin mc-section-spin','aria-hidden':'true'})
                ),
                e('button',{type:'button',className:'mc-section-action',onClick:function(){loadWorkflowBoard({forceRefresh:true});loadProjects();},title:'Опресни',disabled:workflowLoading,'aria-label':'Опресни'},
                    (workflowLoading||bgActivity)?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-sync-alt'}))
            ),
            workflowLoading
                ?e('div',{className:'mc-section-loading'},e('i',{className:'fas fa-spinner spin'}),' Зареждане…')
                :e('div',{className:'mc-pipeline'},
                    lanes.map(function(lane){
                        var _maxCount=Math.max(1,lanes.reduce(function(s,l){return s+(l.count||0)},0));
                        var pct=_maxCount>0?Math.round(lane.count/_maxCount*100):0;
                        var isExp=expandedLane===lane.id;
                        var isAuto=!expandedLane&&serverContext&&serverContext.activePhase===lane.id;
                        return e('div',{key:lane.id,className:'mc-pipe-step'+(isExp?' active-phase':'')+(isAuto?' current-phase':'')+(lane.count>0?' has-items':''),onClick:function(){handleLaneClick(lane);},onKeyDown:function(ev){if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();handleLaneClick(lane);}},tabIndex:0,role:'button','aria-pressed':isExp?'true':'false','aria-current':isAuto?'step':undefined,title:(lane.uc||'')+' '+lane.label+': '+lane.count+' предложения'+(lane.sla?' · Срок: '+lane.sla:'')+(isAuto?' · Активна фаза за вашата роля':'')},
                            e('div',{className:'mc-step-no'},lane.step),
                            e('div',{className:'wf-pipe-icon',style:{background:lane.count>0?lane.color:'var(--border-2)'}},e('i',{className:'fas '+lane.icon})),
                            e('div',{className:'wf-pipe-name'},lane.label),
                            e('div',{className:'wf-pipe-count',style:{color:lane.count>0?lane.color:'var(--ink-5)'}},lane.count),
                            lane.sla&&e('div',{className:'mc-sla-chip'},lane.sla),
                            e('div',{className:'wf-pipe-bar','aria-hidden':'true'},e('div',{className:'wf-pipe-bar-fill',style:{width:pct+'%',background:lane.color}}))
                        );
                    })
                )
        ),
        // ═══════════ EXPANDED LANE DETAIL ═══════════
        expandedLane&&!workflowLoading&&renderLaneDetail()
    );
};

// ─── Project Detail ───────────────────────────────────────────────
const renderProjectDetail=()=>{
    const p=selectedProject;
    return e('div',null,
        e('div',{className:'dash-back-row'},
            e('button',{className:'btn btn-outline btn-sm',onClick:()=>{setSelectedProjectObj(null);setProjDetailTab('overview')}},e('i',{className:'fas fa-arrow-left'}),' Назад'),
            e('div',{className:'dash-back-title'},p.title),
            e('div',{className:'dash-pill',style:{background:PROJ_STATUS_COLOR[p.status]||'var(--ink-4)',flexShrink:0}},STATUS_LABELS[p.status]||p.status),
            e('button',{className:'btn btn-outline btn-sm',style:{marginLeft:'auto'},title:'Валидирай резултатите преди финален отчет',
                onClick:async()=>{
                    try{const res=await api('validateprojectresults',{projectId:p.id,userId:user.email});if(res.success){
                        const issues=res.issues||res.warnings||[];
                        if(issues.length)toast(issues.length+' проблема открити при валидацията.','warn',6000);
                        else toast('Всички резултати са валидни. Може да подадете финален отчет.','success',5000);
                        if(res.report)toast(JSON.stringify(res.report,null,2).slice(0,500),'info',8000);
                    }else{toast(res.error||'Грешка при валидация','error')}}catch(err){toast(err.message,'error')}
                }
            },e('i',{className:'fas fa-clipboard-check',style:{color:'var(--ok)'}}),' Валидирай резултати')
        ),
        e('div',{className:'fd-tabs'},
                    ['overview','activities','indicators','documents','lifecycle','changes','publications'].map(t=>
                e('button',{key:t,className:'fd-tab '+(projDetailTab===t?'active':''),onClick:()=>setProjDetailTab(t)},
                    {overview:e(Fragment,null,e('i',{className:'fas fa-info-circle'}),' Преглед'),
                                                             activities:e(Fragment,null,e('i',{className:'fas fa-tasks'}),' Дейности'),
                                                             indicators:e(Fragment,null,e('i',{className:'fas fa-chart-line'}),' Индикатори'),
                                                             documents:e(Fragment,null,e('i',{className:'fas fa-paperclip'}),' Документи'),
                                                             lifecycle:e(Fragment,null,e('i',{className:'fas fa-sitemap'}),' Жизнен цикъл'),
                                                             changes:e(Fragment,null,e('i',{className:'fas fa-edit'}),' Промени'),
                                                             publications:e(Fragment,null,e('i',{className:'fas fa-book-open'}),' Публикации')
                    }[t]
                )
            )
        ),
        projDetailTab==='overview'&&e('div',{className:'card'},
          e('div',{className:'card-body'},
            (()=>{
                const budget=Number(p.budget||0);
                const spent=Number(p.spent||p.totalExpenses||0);
                const pctSpent=budget>0?Math.min(100,Math.round(spent/budget*100)):0;
                const inds=Array.isArray(p.indicators)?p.indicators:[];
                const indDone=inds.filter(ind=>Number(ind.achieved||ind.actual||0)>=Number(ind.target||ind.planned||1)).length;
                if(!budget&&!inds.length&&!p.contractId)return null;
                return e('div',{className:'proj-fin-strip'},
                    e('div',{className:'proj-fin-item'},
                        e('div',{className:'detail-label'},'Бюджет'),
                        e('div',{style:{fontWeight:700,fontSize:'.9rem',fontFamily:'var(--font-display)'}},budget>0?_eurFmt(budget)+' €':'—'),
                        budget>0&&e('div',{className:'fin-bar'},e('div',{className:'fin-bar-fill',style:{width:pctSpent+'%',background:pctSpent>90?'var(--err)':pctSpent>65?'var(--warn)':'var(--ok)'}})),
                        budget>0&&e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.25rem'}},spent>0?'Разходи: '+_eurFmt(spent)+' € ('+pctSpent+'%)':'Няма данни за разходи')
                    ),
                    inds.length>0&&e('div',{className:'proj-fin-item'},
                        e('div',{className:'detail-label'},'Индикатори'),
                        e('div',{style:{fontWeight:700,fontSize:'.9rem',fontFamily:'var(--font-display)'}},indDone+' / '+inds.length),
                        e('div',{className:'fin-bar'},e('div',{className:'fin-bar-fill',style:{width:(inds.length?Math.round(indDone/inds.length*100):0)+'%',background:'var(--ok)'}})),
                        e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.25rem'}},'Постигнати индикатори')
                    ),
                    p.contractId&&e('div',{className:'proj-fin-item'},
                        e('div',{className:'detail-label'},'Договор №'),
                        e('div',{style:{fontWeight:700,fontSize:'.82rem',fontFamily:'monospace',marginTop:'.1rem'}},p.contractId),
                        p.startDate&&e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.25rem'}},p.startDate,' → ',p.endDate||'…')
                    )
                );
            })(),
            e('div',{className:'dash-grid-2',style:{marginBottom:'1.25rem'}},
                e('div',null,e('div',{className:'detail-label'},'Ръководител'),e('div',{className:'detail-val'},p.leaderName||p.leaderEmail||'—')),
                e('div',null,e('div',{className:'detail-label'},'Тип проект'),e('div',{className:'detail-val'},p.projectCode?e('span',{className:'type-tag'},p.projectCode):'—')),
                e('div',null,e('div',{className:'detail-label'},'Направление'),e('div',{className:'detail-val'},(function(){var areas=getAreas(p.direction||p.area||'');if(!areas.length)return'—';return e(Fragment,null,areas.map(function(a){return e('span',{key:a,className:'area-chip',style:{display:'inline-block',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill)',padding:'.08rem .5rem',fontSize:'.72rem',marginRight:'.25rem',marginBottom:'.15rem'}},a);}));})())),
                e('div',null,e('div',{className:'detail-label'},'Период'),p.startDate?(p.startDate+' – '+(p.endDate||'…')):'—'),
                e('div',null,e('div',{className:'detail-label'},'Договор №'),e('div',{className:'detail-val',style:{fontFamily:'monospace',fontSize:'.78rem'}},p.contractId||'—')),
                e('div',null,e('div',{className:'detail-label'},'Бюджет'),e('div',{className:'detail-val'},p.budget?((Number(p.budget)/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'):'—')),
                e('div',null,e('div',{className:'detail-label'},'Конкурс'),e('div',{className:'detail-val',style:{fontSize:'.8rem'}},p.competitionId||'—')),
                e('div',null,e('div',{className:'detail-label'},'Година'),e('div',{className:'detail-val'},p.year||'—'))
            ),
            p.objectives&&e('div',{style:{marginBottom:'1rem'}},e('div',{className:'detail-label'},'Цели'),e('div',{className:'detail-val',style:{fontSize:'.82rem',color:'var(--ink-2)',whiteSpace:'pre-wrap',lineHeight:1.7}},p.objectives)),
            p.expectedResults&&e('div',{style:{marginBottom:'1rem'}},e('div',{className:'detail-label'},'Очаквани резултати'),e('div',{className:'detail-val',style:{fontSize:'.82rem',color:'var(--ink-2)',whiteSpace:'pre-wrap',lineHeight:1.7}},p.expectedResults)),
            p.teamMembers&&p.teamMembers.length>0&&e('div',null,
                e('div',{className:'section-label',style:{marginBottom:'.5rem'}},e('i',{className:'fas fa-users'}),' Научен екип'),
                e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.4rem'}},
                    p.teamMembers.map((m,i)=>e('div',{key:i,style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-xs)',padding:'.35rem .7rem',fontSize:'.78rem',display:'flex',alignItems:'center',gap:'.4rem'}},
                        e('div',{className:'applicant-avatar',style:{width:28,height:28,fontSize:'.6rem',flexShrink:0}},initials(m.name||m.email||'')),
                        e('div',null,e('div',{style:{fontWeight:600}},m.name||m.email||'—'),m.role&&e('div',{style:{fontSize:'.7rem',color:'var(--ink-4)'}},m.role))
                    ))
                )
            )
          )
        ),
        projDetailTab==='activities'&&e('div',{className:'card'},
          e('div',{className:'card-body'},
            p.activities&&p.activities.length>0
                ?e('div',{className:'comp-tl'},p.activities.map((a,i)=>{
                    const dotCls=a.status==='completed'?'done':a.status==='in_progress'?'active':'pending';
                    return e('div',{key:i,className:'comp-tl-step '+dotCls},
                        e('div',{className:'comp-tl-dot '+dotCls},i+1),
                        e('div',{className:'comp-tl-card'},
                            e('div',{className:'comp-tl-head'},
                                e('div',{className:'comp-tl-title'},a.title||('Дейност '+(i+1))),
                                e('span',{className:'comp-tl-badge '+dotCls},{completed:'Завършена',in_progress:'В изпълнение',pending:'Предстои'}[a.status]||a.status||'—')
                            ),
                            e('div',{className:'comp-tl-body'},
                                a.description&&e('p',{className:'comp-tl-desc'},a.description),
                                e('div',{className:'comp-tl-meta'},
                                    a.startDate&&e('span',{className:'comp-tl-tag'},e('i',{className:'fas fa-calendar-alt'}),' ',a.startDate),
                                    a.endDate&&e('span',{className:'comp-tl-tag'},e('i',{className:'fas fa-flag-checkered'}),' ',a.endDate)
                                )
                            )
                        )
                    );
                }))
                :e('div',{className:'empty-state',style:{padding:'2rem'}},e('i',{className:'fas fa-tasks',style:{fontSize:'2rem',marginBottom:'.75rem',display:'block',color:'var(--ink-4)'}}),e('p',null,'Няма въведени дейности.'))
          )
        ),
        projDetailTab==='indicators'&&e('div',{className:'card',style:{overflowX:'auto'}},
          e('div',{className:'card-body'},
            p.indicators&&p.indicators.length>0
                ?e('div',{className:'table-wrap'},e('table',null,
                    e('thead',null,e('tr',null,
                        ['Индикатор','Планирана','Постигната','%','Статус'].map(h=>e('th',{key:h},h))
                    )),
                    e('tbody',null,p.indicators.map((ind,i)=>{
                        const plan=Number(ind.target||ind.planned||0);
                        const actual=Number(ind.achieved||ind.actual||0);
                        const pct=plan>0?Math.min(100,Math.round(actual/plan*100)):0;
                        return e('tr',{key:i},
                            e('td',{'data-label':'Индикатор'},ind.name||ind.indicator||('Инд. '+(i+1))),
                            e('td',{'data-label':'Планирана'},(ind.target||ind.planned||'—')),
                            e('td',{'data-label':'Постигната',style:{fontWeight:700,color:pct>=100?'var(--ok)':pct>=50?'var(--warn)':'var(--err)'}},(ind.achieved||ind.actual||'—')),
                            e('td',{'data-label':'%',style:{minWidth:80}},
                                e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem'}},
                                    e('div',{style:{flex:1,height:6,borderRadius:3,background:'var(--bg)'}},
                                        e('div',{style:{width:pct+'%',height:'100%',borderRadius:3,background:pct>=100?'var(--ok)':pct>=50?'var(--warn)':'var(--err)',transition:'width .3s'}})
                                    ),
                                    e('span',{style:{fontSize:'.7rem',fontWeight:700,color:'var(--ink-3)',minWidth:28}},pct+'%')
                                )
                            ),
                            e('td',{'data-label':'Статус'},ind.status||'—')
                        );
                    }))
                ))
                                :e('div',{className:'empty-state',style:{padding:'2rem'}},e('i',{className:'fas fa-chart-line',style:{fontSize:'2rem',marginBottom:'.75rem',display:'block',color:'var(--ink-4)'}}),e('p',null,'Няма въведени индикатори.'))
                          )
                        ),
                        projDetailTab==='publications'&&e('div',{className:'card'},
                                  e('div',{className:'card-body'},
                                    p.publications&&p.publications.length>0
                                        ?e('div',{style:{display:'grid',gap:'.65rem'}},p.publications.map((pub,i)=>e('div',{key:i,style:{padding:'.85rem 1rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)'}},
                                            e('div',{style:{fontWeight:700,fontSize:'.88rem',marginBottom:'.25rem'}},pub.title||('Публикация '+(i+1))),
                                            pub.authors&&e('div',{style:{fontSize:'.78rem',color:'var(--ink-3)'}},(Array.isArray(pub.authors)?pub.authors.join(', '):pub.authors)),
                                            e('div',{style:{display:'flex',gap:'1rem',flexWrap:'wrap',fontSize:'.72rem',color:'var(--ink-4)',marginTop:'.3rem'}},
                                                pub.journal&&e('span',null,e('i',{className:'fas fa-book',style:{marginRight:'.25rem'}}),pub.journal),
                                                pub.year&&e('span',null,e('i',{className:'fas fa-calendar',style:{marginRight:'.25rem'}}),pub.year),
                                                pub.doi&&e('a',{href:'https://doi.org/'+pub.doi,target:'_blank',rel:'noopener noreferrer',style:{color:'var(--info)'}},e('i',{className:'fas fa-external-link-alt',style:{marginRight:'.2rem'}}),'DOI'),
                                                pub.indexed&&e('span',{className:'cert-seal ok',style:{fontSize:'.62rem'}},pub.indexed)
                                            )
                                        )))
                                        :e('div',{className:'empty-state',style:{padding:'2rem'}},e('i',{className:'fas fa-book-open',style:{fontSize:'2rem',marginBottom:'.75rem',display:'block',color:'var(--ink-4)'}}),e('p',null,'Няма въведени публикации.'))
                                  )
                                ),
                        projDetailTab==='documents'&&e('div',{className:'card'},
          e('div',{className:'card-body'},
            e('div',{className:'section-label',style:{marginBottom:'1rem'}},e('i',{className:'fas fa-paperclip'}),' Прикачени файлове и документи'),
            (()=>{
                const fileIds=p.fileIds||p.FileIds||[];
                const attachedDocs=p.attachedDocs||p.AttachedDocs||[];
                return e('div',{style:{display:'flex',flexDirection:'column',gap:'.85rem'}},
                    attachedDocs.length>0&&e('div',null,
                        e('div',{className:'detail-label',style:{marginBottom:'.5rem'}},'Официални документи ('+ attachedDocs.length+')'),
                        e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.4rem'}},
                            attachedDocs.map((d,i)=>{const _did=d.id||d.fileId||d.driveId||'';const _open=d.previewLink||d.downloadUrl||d.webViewLink||(_did?'https://drive.google.com/file/d/'+encodeURIComponent(_did)+'/preview':'');const _label=(d.name||d.id||'Документ').slice(0,40);return e('span',{key:i,className:'file-chip'},e('i',{className:'fas fa-file-alt',style:{fontSize:'.7rem',color:'var(--gold)'}}),_open?e('a',{href:_open,target:'_blank',rel:'noopener noreferrer',style:{color:'var(--ink-2)',textDecoration:'none'}},_label):_label,_open&&e('i',{className:'fas fa-eye',style:{marginLeft:'.3rem',color:'var(--ink-4)',fontSize:'.6rem'}}))})
                        )
                    ),
                    fileIds.length>0&&e('div',null,
                        e('div',{className:'detail-label',style:{marginBottom:'.5rem'}},'Качени файлове ('+fileIds.length+')'),
                        e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.4rem'}},
                            fileIds.map((f,i)=>{const _fid=f.fileId||f.id||f.driveId||'';const _open=f.downloadUrl||f.previewLink||(_fid?'https://drive.google.com/file/d/'+encodeURIComponent(_fid)+'/preview':'');return e('span',{key:i,className:'file-chip'},e('i',{className:'fas fa-paperclip',style:{fontSize:'.7rem',color:'var(--ink-4)'}}),_open?e('a',{href:_open,target:'_blank',rel:'noopener noreferrer',style:{color:'var(--ink-2)',textDecoration:'none'}},(f.name||('Файл '+(i+1))).slice(0,35)):(f.name||('Файл '+(i+1))).slice(0,35),_open&&e('a',{href:_open,target:'_blank',rel:'noopener noreferrer',title:f.downloadUrl?'Изтегли':'Преглед',style:{marginLeft:'.3rem',color:'var(--info)',fontSize:'.65rem'}},e('i',{className:'fas '+(f.downloadUrl?'fa-download':'fa-eye')})))})
                        )
                    ),
                    attachedDocs.length===0&&fileIds.length===0&&e('div',{className:'empty-state',style:{padding:'1.5rem'}},e('i',{className:'fas fa-folder-open',style:{fontSize:'1.5rem',marginBottom:'.5rem',display:'block',color:'var(--ink-4)'}}),e('p',null,'Няма прикачени файлове.')),
                    p.contractId&&e('div',{style:{marginTop:'1rem',paddingTop:'1rem',borderTop:'1px solid var(--border)'}},
                        e('div',{className:'detail-label',style:{marginBottom:'.5rem'}},e('i',{className:'fas fa-pen-fancy',style:{marginRight:'.3rem',color:'var(--primary)'}}),'Подписване на договор'),
                        e('button',{className:'btn btn-outline',onClick:()=>setSignModal({type:'contract',contractId:p.contractId,projectId:p.id,title:'Договор '+p.contractId})},
                            e('i',{className:'fas fa-signature',style:{marginRight:'.4rem'}}),'Подпиши договор'
                        )
                    )
                );
            })()
          )
        ),
        projDetailTab==='changes'&&e('div',{style:{display:'grid',gap:'1rem'}},
            (p.leaderEmail===user.email||isAdmin)&&e('div',{className:'card',style:{padding:'1.25rem'}},
                e('div',{className:'section-label',style:{marginBottom:'.75rem'}},e('i',{className:'fas fa-pen-square'}),' Ново искане за промяна'),
                e('div',{style:{display:'grid',gap:'.6rem'}},
                    e('select',{className:'form-select',value:changeType,onChange:ev=>setChangeType(ev.target.value)},
                        DASH_CHANGE_TYPES.map(ct=>e('option',{key:ct.value,value:ct.value},ct.label))
                    ),
                    e('textarea',{className:'form-input',rows:4,placeholder:'Опишете исканата промяна подробно…',value:changeDesc,onChange:ev=>setChangeDesc(ev.target.value),style:{resize:'vertical'}}),
                    e('button',{className:'btn btn-primary',onClick:handleChangeRequest,disabled:changeSub||!changeDesc.trim()},
                        changeSub?e('i',{className:'fas fa-spinner spin'}):'Подай искане за промяна'
                    )
                )
            ),
            e('div',{className:'card',style:{padding:'1.25rem'}},
                e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.75rem'}},
                    e('div',{className:'section-label',style:{margin:0}},e('i',{className:'fas fa-history'}),' История на исканията'),
                    (p.changeRequests||[]).length>0&&e('span',{className:'count-chip'},(p.changeRequests||[]).length)
                ),
                (p.changeRequests||[]).length===0
                    ?e('div',{className:'empty-state',style:{padding:'1.5rem'}},
                        e('i',{className:'fas fa-inbox',style:{fontSize:'1.5rem',display:'block',marginBottom:'.5rem',color:'var(--ink-4)'}}),
                        e('p',null,'Няма подадени искания за промяна.')
                      )
                    :e('div',{style:{display:'flex',flexDirection:'column',gap:'.6rem'}},
                        (p.changeRequests||[]).map((cr,i)=>{
                            const isReviewing=crReviewingId===cr.id;
                            const statusColor=cr.status==='approved'?'var(--ok)':cr.status==='rejected'?'var(--err)':'var(--gold)';
                            const statusLabel={approved:'✓ Одобрено',rejected:'✗ Отхвърлено',submitted:'⧖ Чакащо'}[cr.status]||cr.status;
                            const typeLabel=DASH_CHANGE_TYPES.find(c=>c.value===cr.changeType)?.label||cr.changeType||'—';
                            return e('div',{key:cr.id||i,style:{padding:'.85rem 1rem',background:'var(--surface)',border:'1px solid '+(cr.status==='submitted'&&isAdmin?'var(--warn-border)':'var(--border)'),borderRadius:'var(--r-sm)'}},
                                e('div',{style:{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:'.35rem',marginBottom:'.3rem'}},
                                    e('span',{style:{fontWeight:700,fontSize:'.84rem'}},typeLabel),
                                    e('span',{className:'dash-pill',style:{background:statusColor,fontSize:'.68rem',padding:'.2rem .55rem'}},statusLabel)
                                ),
                                e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',display:'flex',gap:'.75rem',flexWrap:'wrap',marginBottom:'.35rem'}},
                                    cr.submittedAt&&e('span',null,e('i',{className:'fas fa-calendar',style:{marginRight:'.2rem'}}),(cr.submittedAt||'').substring(0,10)),
                                    cr.requestedBy&&e('span',null,e('i',{className:'fas fa-user',style:{marginRight:'.2rem'}}),cr.requestedBy)
                                ),
                                cr.description&&e('div',{style:{fontSize:'.8rem',color:'var(--ink-2)',lineHeight:1.6,marginBottom:'.35rem',padding:'.45rem .65rem',background:'var(--bg)',borderRadius:'var(--r-xs)',whiteSpace:'pre-wrap'}},cr.description),
                                (cr.status==='approved'||cr.status==='rejected')&&e('div',{style:{fontSize:'.72rem',color:'var(--ink-3)',marginTop:'.35rem',paddingTop:'.35rem',borderTop:'1px solid var(--border)',display:'flex',gap:'.75rem',flexWrap:'wrap',alignItems:'center'}},
                                    e('i',{className:'fas fa-gavel',style:{color:statusColor}}),
                                    cr.reviewedBy&&e('span',null,cr.reviewedBy),
                                    cr.reviewedAt&&e('span',null,(cr.reviewedAt||'').substring(0,10)),
                                    cr.notes&&cr.notes!==cr.status&&e('span',{style:{fontStyle:'italic',color:'var(--ink-2)'}},'"',cr.notes,'"')
                                ),
                                isAdmin&&cr.status==='submitted'&&!isReviewing&&e('div',{style:{display:'flex',gap:'.5rem',marginTop:'.6rem',paddingTop:'.6rem',borderTop:'1px solid var(--border)'}},
                                    e('button',{className:'btn btn-outline btn-sm',style:{color:'var(--ok)',borderColor:'var(--ok)',flex:1},onClick:()=>{setCrReviewingId(cr.id);setCrDecisionNotes('');},disabled:crDeciding},
                                        e('i',{className:'fas fa-gavel',style:{marginRight:'.3rem'}}),'Разгледай'
                                    )
                                ),
                                isAdmin&&cr.status==='submitted'&&isReviewing&&e('div',{style:{marginTop:'.6rem',paddingTop:'.6rem',borderTop:'1px solid var(--border)',display:'grid',gap:'.5rem'}},
                                    e('textarea',{className:'form-input',rows:2,placeholder:'Бележки / причина за отказ (по желание)…',value:crDecisionNotes,onChange:ev=>setCrDecisionNotes(ev.target.value),style:{resize:'vertical',fontSize:'.8rem'}}),
                                    e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap'}},
                                        e('button',{className:'btn btn-sm',style:{background:'var(--ok)',color:'#fff',flex:1},onClick:()=>handleDecideCR(cr.id,'approved'),disabled:crDeciding},
                                            crDeciding?e('i',{className:'fas fa-spinner spin'}):e(Fragment,null,e('i',{className:'fas fa-check',style:{marginRight:'.3rem'}}),'Одобри')
                                        ),
                                        e('button',{className:'btn btn-sm',style:{background:'var(--err)',color:'#fff',flex:1},onClick:()=>handleDecideCR(cr.id,'rejected'),disabled:crDeciding},
                                            crDeciding?e('i',{className:'fas fa-spinner spin'}):e(Fragment,null,e('i',{className:'fas fa-times',style:{marginRight:'.3rem'}}),'Откажи')
                                        ),
                                        e('button',{className:'btn btn-outline btn-sm',style:{flexShrink:0},onClick:()=>{setCrReviewingId('');setCrDecisionNotes('');},disabled:crDeciding},
                                            e('i',{className:'fas fa-arrow-left'})
                                        )
                                    )
                                )
                            );
                        })
                    )
            )
        ),
        projDetailTab==='lifecycle'&&e('div',{className:'card'},
          e('div',{className:'card-body'},
            e('div',{className:'section-label',style:{marginBottom:'1rem'}},e('i',{className:'fas fa-sitemap'}),' Жизнен цикъл на проекта'),
            e('div',{className:'lifecycle-trail'},
                e('div',{className:'lifecycle-step done'},
                    e('div',{className:'lifecycle-step-icon',style:{background:'var(--info)',color:'#fff'}},e('i',{className:'fas fa-file-alt'})),
                    e('div',{style:{flex:1}},
                        e('div',{style:{fontWeight:700,fontSize:'.82rem'}},p.title||'Проектно предложение'),
                        e('div',{style:{fontSize:'.72rem',color:'var(--ink-3)',marginTop:'.15rem',display:'flex',gap:'.75rem',flexWrap:'wrap'}},
                            p.competitionId&&e('span',null,e('i',{className:'fas fa-trophy',style:{marginRight:'.25rem',color:'var(--gold)'}}),p.competitionId),
                            p.year&&e('span',null,e('i',{className:'fas fa-calendar',style:{marginRight:'.2rem'}}),p.year),
                            p.leaderName&&e('span',null,e('i',{className:'fas fa-user',style:{marginRight:'.2rem'}}),p.leaderName)
                        ),
                        (p.sourceFormId||p.formId)&&e('div',{style:{fontFamily:'monospace',fontSize:'.7rem',color:'var(--ink-5)',marginTop:'.2rem'}},'ID: ',p.sourceFormId||p.formId)
                    ),
                    e('span',{className:'comp-tl-tag ok',style:{fontSize:'.65rem',flexShrink:0}},'Подадено')
                ),
                (p.score||p.rank)&&e('div',{className:'lifecycle-step done'},
                    e('div',{className:'lifecycle-step-icon',style:{background:'var(--gold)',color:'#fff'}},e('i',{className:'fas fa-star'})),
                    e('div',{style:{flex:1}},
                        e('div',{style:{fontWeight:700,fontSize:'.82rem'}},'Оценка и класиране'),
                        e('div',{style:{fontSize:'.72rem',color:'var(--ink-3)',marginTop:'.15rem',display:'flex',gap:'.75rem',flexWrap:'wrap'}},
                            p.score&&e('span',null,'Оценка: ',e('strong',null,p.score,' т.')),
                            p.rank&&e('span',null,'Ранг: ',e('strong',null,'#',p.rank))
                        )
                    ),
                    e('span',{className:'comp-tl-tag ok',style:{fontSize:'.65rem',flexShrink:0}},'Одобрено')
                ),
                p.contractId&&e('div',{className:'lifecycle-step done'},
                    e('div',{className:'lifecycle-step-icon',style:{background:'var(--teal)',color:'#fff'}},e('i',{className:'fas fa-file-signature'})),
                    e('div',{style:{flex:1}},
                        e('div',{style:{fontWeight:700,fontSize:'.82rem'}},'Договор'),
                        e('div',{style:{fontFamily:'monospace',fontSize:'.78rem',color:'var(--ink-3)',marginTop:'.15rem'}},p.contractId),
                        p.startDate&&e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginTop:'.15rem'}},p.startDate,' → ',p.endDate||'…'),
                        e('button',{className:'btn btn-outline btn-xs',style:{marginTop:'.4rem',display:'inline-flex'},onClick:()=>setSignModal({type:'contract',contractId:p.contractId,projectId:p.id,title:'Договор '+p.contractId})},e('i',{className:'fas fa-signature',style:{marginRight:'.3rem'}}),'Подпиши')
                    ),
                    e('span',{className:'comp-tl-tag ok',style:{fontSize:'.65rem',flexShrink:0}},'Договорено')
                ),
                e('div',{className:'lifecycle-step '+(p.status==='active'||p.status==='in_execution'?'active-step':p.status==='closed'||p.status==='closed_with_sanction'?'done':'')},
                    e('div',{className:'lifecycle-step-icon',style:{background:PROJ_STATUS_COLOR[p.status]||'var(--ink-4)',color:'#fff'}},e('i',{className:'fas fa-flask'})),
                    e('div',{style:{flex:1}},
                        e('div',{style:{fontWeight:700,fontSize:'.82rem'}},'Изпълнение на проекта'),
                        e('div',{style:{fontSize:'.72rem',color:'var(--ink-3)',marginTop:'.15rem',display:'flex',gap:'.75rem',flexWrap:'wrap'}},
                            e('span',{style:{fontWeight:600,color:PROJ_STATUS_COLOR[p.status]||'var(--ink-4)'}},STATUS_LABELS[p.status]||p.status),
                            p.budget&&e('span',null,e('i',{className:'fas fa-coins',style:{marginRight:'.2rem',color:'var(--gold)'}}),(Number(p.budget)/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2}),' €')
                        ),
                        Array.isArray(p.indicators)&&p.indicators.length>0&&e('div',{style:{marginTop:'.4rem'}},
                            (()=>{
                                const inds=p.indicators;
                                const done=inds.filter(i=>Number(i.achieved||i.actual||0)>=Number(i.target||i.planned||1)).length;
                                const pct=Math.round(done/inds.length*100);
                                return e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',fontSize:'.7rem',color:'var(--ink-4)'}},
                                    e('div',{className:'fin-bar',style:{flex:1}},e('div',{className:'fin-bar-fill',style:{width:pct+'%',background:'var(--ok)'}})),
                                    e('span',null,done+'/',inds.length,' инд.')
                                );
                            })()
                        )
                    ),
                    e('span',{className:'comp-tl-tag '+(p.status==='closed_with_sanction'?'err':p.status==='closed'?'ok':p.status==='active'||p.status==='in_execution'?'ok':'warn'),style:{fontSize:'.65rem',flexShrink:0}},STATUS_LABELS[p.status]||p.status)
                )
            )
          )
        ),
        signModal&&e(SignatureModal,{
            title:signModal.title||'Подпис на документ',
            message:'Изберете метод за подписване на договора:',
            signerEmail:user.email,
            signerRole:userRole,
            contractId:signModal.contractId||'',
            competitionId:p.competitionId||'',
            formId:signModal.projectId||'',
            require2fa:!isAdminRole(userRole),
            userEmail:user.email||'',
            otpScope:'signature',
            otpRef:signModal.projectId||signModal.contractId||'contract',
            onConfirm:()=>{toast('Подписът е регистриран успешно.','success');setSignModal(null);},
            onCancel:()=>setSignModal(null)
        })
    );
};

// ─── Ranking Panel ────────────────────────────────────────────────
const renderRanking=()=>{
    const scored=applications.filter(a=>['scored','reviewed','ranked','approved_for_funding','approved','contracted'].includes(a.status));
    const belowThreshold=applications.filter(a=>a.rank==='below_threshold'||a.status==='rejected');
    const selComp=competitions.find(c=>c.id===selectedComp);
    return e('div',{style:{display:'grid',gap:'1rem'}},
        // Actions bar — competition is selected from the top-header filter
        e('div',{className:'card',style:{padding:'1.25rem'}},
            !selectedComp
                ?e('div',{style:{color:'var(--ink-4)',fontSize:'.84rem',display:'flex',alignItems:'center',gap:'.6rem',padding:'.5rem 0'}},
                    e('i',{className:'fas fa-arrow-up'}),
                    'Изберете конкурсна сесия от горния филтър за да генерирате класиране.'
                  )
                :e('div',null,
                    selComp&&e('div',{className:'dash-rank-comp-meta'},
                        e('span',{style:{fontWeight:700,fontSize:'.85rem',marginRight:'.15rem'}},selComp.name||selComp.id),
                        e('span',{className:'comp-tl-tag info'},e('i',{className:'fas fa-calendar-alt'}),' ',fmtDate(selComp.deadline||selComp.dateEnd||'')),
                        e('span',{className:'comp-tl-tag '+(selComp.status==='active'?'ok':selComp.status==='results_published'?'info':selComp.status==='closed'?'warn':'')},COMP_STATUS_LABELS[selComp.status]||selComp.status||'—'),
                        applications.length>0&&e('span',{className:'comp-tl-tag'},e('i',{className:'fas fa-file-alt'}),'\u00a0',applications.length,' предложения')
                    ),
                    e('div',{className:'dash-rank-act'},
                        e('button',{className:'btn btn-primary',onClick:handleGenerateRanking,disabled:generating||rankLoading},
                            generating?e('i',{className:'fas fa-spinner spin'}):e(Fragment,null,e('i',{className:'fas fa-list-ol'}),' Генерирай класиране')
                        ),
                        (isAdmin||userRole===ROLE_RECTOR)&&e('button',{className:'btn btn-outline',onClick:handleApproveResults,disabled:approving},
                            approving?e('i',{className:'fas fa-spinner spin'}):e(Fragment,null,e('i',{className:'fas fa-check-double'}),' Одобри')
                        ),
                        isAdmin&&e('button',{className:'btn btn-outline',onClick:handlePublishResults,disabled:publishing},
                            publishing?e('i',{className:'fas fa-spinner spin'}):e(Fragment,null,e('i',{className:'fas fa-globe'}),' Публикувай')
                        )
                    )
                )
        ),
        rankResult&&e('div',{className:'card',style:{padding:'1.1rem',background:'var(--ok-bg)',border:'1px solid var(--ok-border)'}},
            e('div',{style:{fontWeight:700,color:'var(--ok)',display:'flex',alignItems:'center',gap:'.5rem'}},
                e('i',{className:'fas fa-check-circle'}),
                e('span',null,'Класирането е завършено')
            ),
            e('div',{style:{fontSize:'.82rem',color:'var(--ink-2)',marginTop:'.3rem'}},
                'Прагова точка: ',e('strong',null,rankResult.threshold),' т.\u00a0·\u00a0',
                'Допуснати до класиране: ',e('strong',null,(rankResult.ranked||[]).filter(r=>r.aboveThreshold).length),'\u00a0·\u00a0',
                'Не покриват прага: ',e('strong',null,(rankResult.ranked||[]).filter(r=>!r.aboveThreshold).length)
            )
        ),
        rankLoading&&e('div',{className:'card card-loading',style:{padding:'1.1rem',position:'relative'}},
            e('div',{className:'loading-strip active'}),
            [80,55,90,65,70].map((w,i)=>e('div',{key:i,className:'skeleton skeleton-line',style:{width:w+'%',height:'.8rem',marginBottom:'.55rem'}}))
        ),
        !rankLoading&&selectedComp&&scored.length>0&&e('div',{className:'card',style:{padding:'1.25rem'}},
            e('div',{className:'card-header',style:{marginBottom:'.85rem'}},
                e('div',{className:'card-title'},e('i',{className:'fas fa-award',style:{color:'var(--gold)',marginRight:'.4rem'}}),'Класирани предложения'),
                e('span',{className:'badge badge-ok'},scored.length)
            ),
            e('div',{className:'table-wrap',style:{overflowX:'auto'}},
            e('table',{style:{minWidth:420}},
                e('thead',null,e('tr',null,
                    ['Ранг','Заглавие','Кандидат','Тип','Точки','Статус'].map(h=>e('th',{key:h},h))
                )),
                e('tbody',null,
                    [...scored].sort((a,b)=>(parseFloat(a.rank)||999)-(parseFloat(b.rank)||999)).map((a,i)=>{
                        const isTop=parseFloat(a.rank)<=3;
                        return e('tr',{key:a.id||i,className:'card-hover',style:{cursor:'pointer',background:isTop?'var(--gold-glow)':''},onClick:()=>setSelectedApp(selectedApp?.id===a.id?null:a)},
                            e('td',{style:{fontWeight:800,color:isTop?'var(--gold)':'var(--ink-3)',fontSize:isTop?'1rem':'.85rem'}},'#'+(a.rank||'—')),
                            e('td',{style:{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:600}},a.title||a.id),
                            e('td',{style:{color:'var(--ink-3)',maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(a.userName||a.userEmail||'—')),
                            e('td',null,a.projectCode&&e('span',{className:'type-tag',style:{fontSize:'.65rem'}},a.projectCode)),
                            e('td',{style:{fontWeight:700,color:'var(--ink)'}},e('span',null,(a.score||'—'),' т.')),
                            e('td',null,e('span',{className:'dash-pill',style:{background:a.status==='approved_for_funding'||a.status==='approved'||a.status==='contracted'?'var(--ok)':'var(--info)'}},(STATUS_LABELS[a.status]||a.status||'').substring(0,20)))
                        );
                    })
                )
            )
            ),
            // Expandable row detail
            selectedApp&&e('div',{style:{marginTop:'1rem',padding:'1.1rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-sm)'}},
                e('div',{style:{fontWeight:700,fontSize:'.88rem',marginBottom:'.65rem'}},selectedApp.title),
                e('div',{className:'dash-grid-3'},
                    e('div',null,e('div',{className:'detail-label'},'Направление'),e('div',{className:'detail-val'},(function(){var sa=getAreas(selectedApp.area||'');if(!sa.length)return'—';return e(Fragment,null,sa.map(function(a){return e('span',{key:a,className:'area-chip',style:{display:'inline-block',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill)',padding:'.08rem .5rem',fontSize:'.72rem',marginRight:'.25rem',marginBottom:'.15rem'}},a);}));})())),
                    e('div',null,e('div',{className:'detail-label'},'Бюджет'),e('div',{className:'detail-val'},selectedApp.budget?(Number(selectedApp.budget)/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €':'—')),
                    e('div',null,e('div',{className:'detail-label'},'Оценка'),e('div',{className:'detail-val',style:{fontWeight:700}},(selectedApp.score||'—')+' т.')),
                    e('div',null,e('div',{className:'detail-label'},'Рецензенти'),e('div',{className:'detail-val'},(()=>{const revs=getReviewers(selectedApp);return revs.length?revs.join(', '):'—';})())),
                    e('div',null,e('div',{className:'detail-label'},'Подадено'),e('div',{className:'detail-val'},fmtDate(selectedApp.submitted||selectedApp.created))),
                    e('div',null,e('div',{className:'detail-label'},'Прикачени'),e('div',{className:'detail-val'},(getAttachedDocs(selectedApp)||[]).length+(getFileIds(selectedApp)||[]).length>0?((getAttachedDocs(selectedApp)||[]).length+' + '+(getFileIds(selectedApp)||[]).length+' файла'):(''+((getAttachedDocs(selectedApp)||[]).length+(getFileIds(selectedApp)||[]).length))))
                ),
                selectedApp.description&&e('div',{style:{marginTop:'.65rem',fontSize:'.78rem',color:'var(--ink-2)',whiteSpace:'pre-wrap',lineHeight:1.6,maxHeight:120,overflow:'auto'}},selectedApp.description),
                e('button',{className:'btn btn-outline btn-sm',style:{marginTop:'.5rem'},onClick:()=>setSelectedApp(null)},e('i',{className:'fas fa-times'}),' Скрий')
            )
        ),
        !rankLoading&&selectedComp&&belowThreshold.length>0&&e('div',{className:'card',style:{padding:'1.1rem',background:'var(--err-bg)',border:'1px solid var(--err-border)'}},
            e('div',{className:'card-title',style:{marginBottom:'.65rem'}},e('i',{className:'fas fa-times-circle',style:{color:'var(--err)',marginRight:'.4rem'}}),'Под прага / Отхвърлени'),
            e('div',{style:{display:'flex',flexDirection:'column',gap:'.3rem'}},
                belowThreshold.map((a,i)=>e('div',{key:a.id||i,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'.35rem .5rem',borderBottom:'1px solid var(--err-border)',fontSize:'.8rem'}},
                    e('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,marginRight:'.5rem'}},a.title||a.id),
                    e('span',{style:{fontWeight:700,flexShrink:0}},(a.score||'0')+' т.')
                ))
            )
        ),
        !rankLoading&&selectedComp&&applications.length===0&&e('div',{className:'empty-state'},e('i',{className:'fas fa-inbox',style:{fontSize:'2rem',display:'block',marginBottom:'.75rem'}}),e('p',null,'Няма проектни предложения за избрания конкурс.')),
        // ── Competition financial forecast ──
        !rankLoading&&selectedComp&&scored.length>0&&(()=>{
            const totalBudget=scored.reduce((s,a)=>s+Number(a.budget||0),0);
            if(!totalBudget)return null;
            const byType={};
            scored.forEach(a=>{if(a.projectCode){byType[a.projectCode]=(byType[a.projectCode]||0)+Number(a.budget||0);}});
            const approved=scored.filter(a=>['approved_for_funding','approved','contracted'].includes(a.status)).length;
            return e('div',{className:'card',style:{padding:'1.25rem'}},
                e('div',{className:'card-header',style:{marginBottom:'.85rem'}},
                    e('div',{className:'card-title'},e('i',{className:'fas fa-coins',style:{color:'var(--gold)',marginRight:'.4rem'}}),'Финансова прогноза'),
                    e('span',{style:{fontSize:'.78rem',color:'var(--ink-4)'}},scored.length,' проекта за финансиране')
                ),
                e('div',{className:'proj-kpi-strip',style:{marginBottom:'1rem'}},
                    e('div',{className:'proj-kpi-card'},e('div',{className:'kpi-val',style:{color:'var(--gold)',fontSize:'.85rem'}},(totalBudget/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'),e('div',{className:'kpi-lbl'},'Общ бюджет')),
                    e('div',{className:'proj-kpi-card'},e('div',{className:'kpi-val',style:{color:'var(--ok)'}},approved),e('div',{className:'kpi-lbl'},'Одобрени')),
                    e('div',{className:'proj-kpi-card'},e('div',{className:'kpi-val',style:{color:'var(--ink)'}},((totalBudget/Math.max(1,scored.length))/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'),e('div',{className:'kpi-lbl'},'Средно на проект'))
                ),
                Object.keys(byType).length>1&&e('div',null,
                    e('div',{className:'detail-label',style:{marginBottom:'.5rem'}},'Разпределение по тип проект'),
                    e('div',{style:{display:'flex',flexDirection:'column',gap:'.35rem'}},
                        Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([type,bgt])=>e('div',{key:type,style:{display:'flex',alignItems:'center',gap:'.5rem',fontSize:'.8rem'}},
                            e('span',{className:'type-tag',style:{fontSize:'.65rem',flexShrink:0,minWidth:40}},type),
                            e('div',{style:{flex:1,height:6,background:'var(--bg)',borderRadius:3,overflow:'hidden'}},
                                e('div',{style:{height:'100%',borderRadius:3,background:'var(--gold)',width:Math.round(bgt/totalBudget*100)+'%'}})
                            ),
                            e('span',{style:{minWidth:95,textAlign:'right',fontWeight:700,fontFamily:'var(--font-display)',fontSize:'.75rem'}},(bgt/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €')
                        ))
                    )
                )
            );
        })()
    );
};

// ─── Upcoming Events Panel (UC-22 calendar feed) ──────────────────
const renderEvents=()=>{
    const now=Date.now();
    const horizonMs=eventsHorizonDays*86400000;
    const cutoff=now+horizonMs;
    // Filter to upcoming OR recently overdue (last 30 days)
    const overdueWindow=now-30*86400000;
    let items=(eventsList||[]).filter(ev=>{
        if(!ev||!ev.date)return false;
        const t=new Date(ev.date).getTime();
        if(isNaN(t))return false;
        if(eventsTypeFilter!=='all'&&ev.type!==eventsTypeFilter)return false;
        return t>=overdueWindow&&t<=cutoff;
    });
    // Sort: overdue first, then ascending by date
    items.sort((a,b)=>{
        const ta=new Date(a.date).getTime();const tb=new Date(b.date).getTime();
        const ao=ta<now,bo=tb<now;
        if(ao&&!bo)return -1;if(!ao&&bo)return 1;
        return ta-tb;
    });
    // Group by bucket: overdue / today / this week / this month / later
    const buckets={overdue:[],today:[],week:[],month:[],later:[]};
    const startToday=new Date();startToday.setHours(0,0,0,0);
    const startTomorrow=startToday.getTime()+86400000;
    const endOfWeek=startToday.getTime()+7*86400000;
    const endOfMonth=startToday.getTime()+30*86400000;
    items.forEach(ev=>{
        const t=new Date(ev.date).getTime();
        if(t<startToday.getTime())buckets.overdue.push(ev);
        else if(t<startTomorrow)buckets.today.push(ev);
        else if(t<endOfWeek)buckets.week.push(ev);
        else if(t<endOfMonth)buckets.month.push(ev);
        else buckets.later.push(ev);
    });
    const typeColor=t=>({deadline:'var(--err)',created:'var(--ok)',submission:'var(--gold)',report_deadline:'var(--warn)',overdue:'var(--err)'}[t]||'var(--ink-4)');
    const typeIcon=t=>({deadline:'fa-flag-checkered',created:'fa-bullhorn',submission:'fa-paper-plane',report_deadline:'fa-file-invoice',overdue:'fa-exclamation-triangle'}[t]||'fa-calendar');
    const typeLabel=t=>({deadline:'Краен срок конкурс',created:'Обявен конкурс',submission:'Подадено заявление',report_deadline:'Срок за отчет',overdue:'Просрочен отчет'}[t]||t);
    const allTypes=Array.from(new Set((eventsList||[]).map(ev=>ev.type))).filter(Boolean);
    const renderRow=ev=>{
        const t=new Date(ev.date).getTime();
        const overdue=t<now;
        const days=Math.round((t-now)/86400000);
        return e('div',{key:ev.id,className:'mc-action-item',style:{borderLeft:'3px solid '+typeColor(ev.type)}},
            e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap'}},
                e('i',{className:'fas '+typeIcon(ev.type),style:{color:typeColor(ev.type),fontSize:'.85rem'}}),
                e('span',{style:{fontWeight:600,fontSize:'.82rem',flex:1,minWidth:0}},ev.title||'—'),
                e('span',{style:{fontSize:'.7rem',color:typeColor(ev.type),fontWeight:600,whiteSpace:'nowrap'}},
                    overdue?('Просрочен с '+Math.abs(days)+' дни'):(days===0?'Днес':days===1?'Утре':('След '+days+' дни'))
                )
            ),
            ev.description&&e('div',{style:{fontSize:'.72rem',color:'var(--ink-3)',marginTop:'.2rem',whiteSpace:'pre-wrap'}},String(ev.description).slice(0,180)),
            e('div',{style:{display:'flex',gap:'.55rem',marginTop:'.3rem',fontSize:'.68rem',color:'var(--ink-4)'}},
                e('span',null,e('i',{className:'fas fa-tag',style:{marginRight:'.25rem'}}),typeLabel(ev.type)),
                e('span',null,e('i',{className:'fas fa-calendar',style:{marginRight:'.25rem'}}),fmtDate(ev.date))
            )
        );
    };
    const Bucket=(title,arr,icon,color)=>arr.length===0?null:e('div',{className:'card',style:{marginBottom:'.85rem'}},
        e('div',{className:'card-header'},
            e('h4',{className:'card-title',style:{display:'flex',alignItems:'center',gap:'.4rem'}},
                e('i',{className:'fas '+icon,style:{color:color}}),' ',title,
                e('span',{className:'count-chip',style:{marginLeft:'.4rem'}},arr.length)
            )
        ),
        e('div',{className:'card-body',style:{padding:'.6rem'}},
            e('div',{style:{display:'flex',flexDirection:'column',gap:'.4rem'}},arr.map(renderRow))
        )
    );
    if(eventsLoading)return e('div',{className:'card card-loading',style:{padding:'1.1rem',position:'relative'}},
        e('div',{className:'loading-strip active'}),
        [85,60,90,70].map((w,i)=>e('div',{key:i,className:'skeleton skeleton-line',style:{width:w+'%',height:'.85rem',marginBottom:'.6rem'}}))
    );
    if(eventsError)return e('div',{className:'card',style:{padding:'1.5rem'}},
        e('div',{style:{color:'var(--err)',fontSize:'.85rem'}},e('i',{className:'fas fa-exclamation-triangle',style:{marginRight:'.4rem'}}),eventsError),
        e('button',{className:'btn btn-outline btn-sm',style:{marginTop:'.75rem'},onClick:()=>loadEvents({forceRefresh:true})},'Опитай отново')
    );
    const total=items.length;
    return e('div',null,
        e('div',{className:'card',style:{marginBottom:'1rem'}},
            e('div',{className:'card-header',style:{display:'flex',alignItems:'center',gap:'.6rem',flexWrap:'wrap'}},
                e('h3',{className:'card-title'},e('i',{className:'fas fa-calendar-day',style:{color:'var(--primary)',marginRight:'.4rem'}}),'Предстоящи събития'),
                e('span',{className:'count-chip'},total),
                e('div',{style:{marginLeft:'auto',display:'flex',alignItems:'center',gap:'.45rem',flexWrap:'wrap'}},
                    e('label',{style:{fontSize:'.74rem',color:'var(--ink-3)'}},'Хоризонт:'),
                    e('select',{className:'form-select',style:{fontSize:'.78rem',minWidth:120},value:eventsHorizonDays,onChange:ev=>setEventsHorizonDays(Number(ev.target.value)||60)},
                        [14,30,60,90,180,365].map(d=>e('option',{key:d,value:d},d+' дни'))
                    ),
                    allTypes.length>1&&e('select',{className:'form-select',style:{fontSize:'.78rem',minWidth:140},value:eventsTypeFilter,onChange:ev=>setEventsTypeFilter(ev.target.value)},
                        e('option',{value:'all'},'— всички типове —'),
                        allTypes.map(t=>e('option',{key:t,value:t},typeLabel(t)))
                    ),
                    e('button',{className:'btn btn-outline btn-sm'+(eventsLoading?' btn-refresh-spinning':''),onClick:()=>loadEvents({forceRefresh:true}),disabled:eventsLoading},
                        e('i',{className:'fas fa-sync-alt'}),' Опресни')
                )
            ),
            total===0&&e('div',{className:'card-body'},e('div',{className:'empty-state'},
                e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-calendar-check'})),
                e('h4',null,'Няма предстоящи събития'),
                e('p',null,'В избрания хоризонт от ',eventsHorizonDays,' дни няма крайни срокове, обявени конкурси или отчетни задачи.')
            ))
        ),
        Bucket('Просрочени',buckets.overdue,'fa-exclamation-triangle','var(--err)'),
        Bucket('Днес',buckets.today,'fa-bolt','var(--gold)'),
        Bucket('Тази седмица',buckets.week,'fa-calendar-week','var(--warn)'),
        Bucket('Този месец',buckets.month,'fa-calendar-alt','var(--info)'),
        Bucket('По-късно',buckets.later,'fa-hourglass-half','var(--ink-4)')
    );
};

// ─── Projects List Panel ──────────────────────────────────────────
const renderProjects=()=>{
    // Cold-load: canonical card-loading wrapper + loading-strip + skeleton lines
    // (matches Отчети по проекти) instead of the lone fa-spinner.
    if(projLoading)return e('div',{className:'card card-loading',style:{padding:'1.1rem',position:'relative'}},
        e('div',{className:'loading-strip active'}),
        [85,60,90,70].map((w,i)=>e('div',{key:i,className:'skeleton skeleton-line',style:{width:w+'%',height:'.85rem',marginBottom:'.6rem'}}))
    );
    if(projError)return e('div',{className:'card',style:{padding:'1.5rem'}},e('div',{style:{color:'var(--err)',fontSize:'.85rem'}},e('i',{className:'fas fa-exclamation-triangle',style:{marginRight:'.4rem'}}),projError),e('button',{className:'btn btn-outline btn-sm',style:{marginTop:'.75rem'},onClick:loadProjects},'Опитай отново'));
    if(selectedProject)return renderProjectDetail();
    return e('div',null,
        e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.85rem',flexWrap:'wrap',gap:'.5rem'}},
            e('div',{style:{fontWeight:700,fontSize:'.9rem'}},e('i',{className:'fas fa-flask',style:{marginRight:'.4rem',color:'var(--red)'}}),isAdmin?'Всички проекти':'Моите проекти'),
            e('button',{className:'btn btn-outline btn-sm',onClick:loadProjects},e('i',{className:'fas fa-sync-alt'}))
        ),
        // ── Filter / search bar ──
        projects.length>0&&e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',marginBottom:'.75rem',alignItems:'center'}},
            e('div',{style:{position:'relative',flex:'1 1 220px',minWidth:200}},
                e('i',{className:'fas fa-search',style:{position:'absolute',left:'.7rem',top:'50%',transform:'translateY(-50%)',color:'var(--ink-4)',fontSize:'.75rem',pointerEvents:'none'}}),
                e('input',{type:'search',className:'form-input',placeholder:'Търси по заглавие, ръководител, код, направление…',value:projSearch,onChange:ev=>setProjSearch(ev.target.value),style:{paddingLeft:'2rem',fontSize:'.78rem'}})
            ),
            e('select',{className:'form-select',value:projPhaseFilter,onChange:ev=>setProjPhaseFilter(ev.target.value),style:{minWidth:180,fontSize:'.78rem'}},
                e('option',{value:''},'— Всички фази —'),
                BPMN_PHASES.filter(p=>['execution','reporting','closing','contracting','approval'].includes(p.id)).map(p=>e('option',{key:p.id,value:p.id},p.label))
            ),
            (projSearch||projPhaseFilter)&&e('button',{className:'btn btn-outline btn-sm',onClick:()=>{setProjSearch('');setProjPhaseFilter('')},title:'Изчисти'},e('i',{className:'fas fa-times'})),
            e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginLeft:'auto'}},filteredProjects.length,' / ',projects.length)
        ),
        projects.length>0&&(()=>{
            const totalBudget=projects.reduce((s,pr)=>s+Number(pr.budget||0),0);
            const active=projects.filter(pr=>pr.status==='active'||pr.status==='in_execution').length;
            const finishing=projects.filter(pr=>pr.status==='final_reporting').length;
            const closed=projects.filter(pr=>pr.status==='closed'||pr.status==='closed_with_sanction').length;
            return e('div',{className:'proj-kpi-strip'},
                e('div',{className:'proj-kpi-card'},e('div',{className:'kpi-val',style:{color:'var(--ink)'}},projects.length),e('div',{className:'kpi-lbl'},'Всички')),
                e('div',{className:'proj-kpi-card'},e('div',{className:'kpi-val',style:{color:'var(--ok)'}},active),e('div',{className:'kpi-lbl'},'Активни')),
                e('div',{className:'proj-kpi-card'},e('div',{className:'kpi-val',style:{color:'var(--warn)'}},finishing),e('div',{className:'kpi-lbl'},'Приключващи')),
                e('div',{className:'proj-kpi-card'},e('div',{className:'kpi-val',style:{color:'var(--ink-4)'}},closed),e('div',{className:'kpi-lbl'},'Закрити')),
                totalBudget>0&&e('div',{className:'proj-kpi-card'},e('div',{className:'kpi-val',style:{color:'var(--gold)',fontSize:'.8rem'}},(totalBudget/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'),e('div',{className:'kpi-lbl'},'Общ бюджет'))
            );
        })(),
        projects.length===0
            ?e('div',{className:'card',style:{padding:'2rem',textAlign:'center',color:'var(--ink-4)',fontSize:'.88rem'}},e('i',{className:'fas fa-inbox',style:{fontSize:'2rem',display:'block',marginBottom:'.75rem'}}),isAdmin?'Няма активни проекти.':'Нямате активни проекти.')
            :filteredProjects.length===0
            ?e('div',{className:'card',style:{padding:'1.5rem',textAlign:'center',color:'var(--ink-4)',fontSize:'.82rem'}},e('i',{className:'fas fa-filter',style:{marginRight:'.4rem'}}),'Няма проекти, отговарящи на филтъра.')
            :e('div',{style:{display:'grid',gap:'.85rem'}},
                filteredProjects.map(p=>{const ph=getLifecyclePhase(p.status);return e('div',{key:p.id,className:'card dash-proj-card',style:{borderLeft:'3px solid '+(PROJ_STATUS_COLOR[p.status]||'var(--border)')},onClick:()=>{setSelectedProjectObj(null);loadProjectDetail(p.id).then(()=>setProjDetailTab('overview'))}},
                    e('div',{className:'dash-proj-item-row'},
                        e('div',{style:{flex:1,minWidth:0}},
                            e('div',{style:{fontWeight:700,fontSize:'.88rem',marginBottom:'.3rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},p.title),
                            e('div',{className:'dash-proj-meta'},
                                p.projectCode&&e('span',{className:'type-tag',style:{fontSize:'.65rem'}},p.projectCode),
                                p.direction&&e('span',null,e('i',{className:'fas fa-compass',style:{marginRight:'.2rem'}}),(function(){var dirs=getAreas(p.direction||'');return dirs.length>0?dirs.join(', '):p.direction;})()),
                                (p.leaderName||p.leaderEmail)&&e('span',null,e('i',{className:'fas fa-user',style:{marginRight:'.2rem'}}),p.leaderName||p.leaderEmail),
                                p.year&&e('span',null,e('i',{className:'fas fa-calendar',style:{marginRight:'.2rem'}}),p.year),
                                e('span',{style:{color:ph.color}},e('i',{className:'fas '+ph.icon,style:{marginRight:'.2rem'}}),ph.label)
                            )
                        ),
                        e('div',{className:'dash-proj-right'},
                            e('div',{className:'dash-pill',style:{background:PROJ_STATUS_COLOR[p.status]||'var(--ink-4)',whiteSpace:'nowrap'}},STATUS_LABELS[p.status]||p.status),
                            p.budget&&e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)'}},(Number(p.budget)/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2}),' €')
                        )
                    )
                )})
            )
    );
};

// ─── Main render ──────────────────────────────────────────────────
return e('div',{className:'board-view'},
    e('div',{className:'page-top'},
        e('div',{className:'page-top-left'},
            e('h2',null,e('i',{className:'fas fa-trophy',style:{marginRight:'.55rem',color:'var(--red)'}}),'Конкурси и табло'),
            e('p',null,'Център за управление · Конкурси · Проекти · Класиране')
        ),
        e('div',{className:'page-top-actions'},
            mainTab!=='competitions'&&isPrivileged&&competitions.length>0&&e('select',{
                className:'form-select',
                style:{minWidth:160,maxWidth:260,fontSize:'.78rem'},
                value:selectedComp,
                onChange:ev=>{const v=ev.target.value;setSelectedComp(v);setRankResult(null);if(v)loadApplicationsForComp(v);}
            },
                e('option',{value:''},'— Всички конкурси —'),
                competitions.map(c=>e('option',{key:c.id,value:c.id},c.name||c.id))
            ),
            mainTab!=='competitions'&&e('button',{className:'btn btn-outline btn-icon'+((workflowLoading||bgActivity)?' btn-refresh-spinning':''),onClick:()=>{loadWorkflowBoard({forceRefresh:true});if(mainTab==='projects')loadProjects();},title:'Опресни',disabled:workflowLoading},
                (workflowLoading||bgActivity)?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-sync-alt'})
            )
        )
    ),
    e('div',{className:'board-subnav',role:'tablist','aria-label':'Раздели на таблото'},
        MAIN_TABS.map(t=>{
            const count=t.id==='overview'?(workflowStats?.total||0)
                :t.id==='ranking'?(selectedComp&&applications.length>0?applications.length:0)
                :t.id==='projects'?projects.length
                :t.id==='competitions'?(competitions.length||0)
                :0;
            return e('button',{key:t.id,role:'tab','aria-selected':mainTab===t.id,className:'board-subnav-tab '+(mainTab===t.id?'active':''),onClick:()=>{setMainTab(t.id);if(t.id==='projects'&&!projects.length)loadProjects();}},
                e('i',{className:'fas '+t.icon,'aria-hidden':'true'}),
                e('span',null,t.label),
                count>0&&e('span',{className:'board-subnav-count'},count)
            );
        })
    ),
    mainTab==='competitions'&&(isAdmin
        ?(_CompetitionView?e(_CompetitionView,{isAdmin,initialCompId,onApply,userEmail:userEmail||user?.email}):null)
        :(_ContestBoardView?e(_ContestBoardView,{user,isAdmin,onApply}):null)
    ),
    mainTab==='overview'&&renderOverview(),
    mainTab==='ranking'&&isPrivileged&&renderRanking(),
    mainTab==='projects'&&renderProjects(),
    mainTab==='events'&&renderEvents(),
    confirmModal&&e(ConfirmModal,{
        message:confirmModal.message,
        confirmLabel:confirmModal.confirmLabel,
        dangerous:confirmModal.dangerous,
        onConfirm:confirmModal.onConfirm,
        onCancel:()=>setConfirmModal(null)
    }),
    deadlineNotifyOpen&&isAdmin&&e(DeadlineNotifyModal,{
        onClose:()=>setDeadlineNotifyOpen(false),
        onSent:()=>{loadWorkflowBoard({forceRefresh:true});}
    })
);
};

