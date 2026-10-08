/* v12.49.37: StatsRow removed per user request */

/* ─── DEFENSIVE FALLBACK STUBS for shared components ───
 * forms-admin.js may be loaded standalone in some build configurations
 * (e.g. dynamic imports). These stubs prevent ReferenceError if window
 * exports from components.js are not yet available. */
if(typeof window!=='undefined'&&!window.Badge){
  window.Badge=function _BadgeFallback(props){return React.createElement('span',{className:'badge '+(props&&props.status||'draft')},String((props&&props.status)||''));};
}
if(typeof window!=='undefined'&&!window.ApplicantCell){
  window.ApplicantCell=function _ApplicantCellFallback(props){return React.createElement('div',{},(props&&props.name)||'');};
}
if(typeof window!=='undefined'&&!window.ActionDropdown){
  window.ActionDropdown=function _ActionDropdownFallback(props){var items=(props&&props.items)||[];return React.createElement('span',null,'⋮');};
}
if(typeof window!=='undefined'&&!window.ConfirmModal){
  window.ConfirmModal=function _ConfirmModalFallback(props){return React.createElement('div',null,props&&props.message||'');};
}
if(typeof window!=='undefined'&&!window.ReturnCommentModal){
  window.ReturnCommentModal=function _ReturnCommentModalFallback(){return React.createElement('div',null);};
}
if(typeof window!=='undefined'&&!window.OtpVerifyModal){
  window.OtpVerifyModal=function _OtpVerifyModalFallback(){return React.createElement('div',null);};
}
if(typeof window!=='undefined'&&!window.SignatureModal){
  window.SignatureModal=function _SignatureModalFallback(){return React.createElement('div',null);};
}
if(typeof window!=='undefined'&&!window.useModalClose){
  window.useModalClose=function _useModalCloseFallback(onCancel){return{closing:false,close:function(){if(onCancel)onCancel();}};};
}
if(typeof window!=='undefined'&&!window._portal){
  window._portal=function _portalFallback(el){return el;};
}

/* ─── APPLICANT VIEW ─── */
var ApplicantView=({user,forms,loading,onRefresh,allDocuments,applyCompId,onApplyDone,competitions:propCompetitions,onPatchForms})=>{
const[modal,setModal]=useState(null);const[confirm,setConfirm]=useState(null);const[sending,setSending]=useState(null);const[statusFilter,setStatusFilter]=useState(()=>{try{return sessionStorage.getItem('erp:applicant:statusFilter')||'all'}catch(_){return'all'}});
useEffect(()=>{try{sessionStorage.setItem('erp:applicant:statusFilter',statusFilter)}catch(_){}},[statusFilter]);
// Use prop competitions when available (React-state tracked); fall back to global
const competitionsList=Array.isArray(propCompetitions)&&propCompetitions.length>0?propCompetitions:COMPETITIONS;
// O(1) competition name lookup (replaces O(n) .find() per table row)
const compNameMap=useMemo(()=>{var m={};competitionsList.forEach(function(c){if(c&&c.id)m[c.id]=c.name||'—'});return m;},[competitionsList]);
useEffect(()=>{if(applyCompId){setModal({type:'new',compId:applyCompId});onApplyDone&&onApplyDone()}},[applyCompId]);
const myForms=useMemo(()=>{const userEmail=String(user?.email||'').toLowerCase();return userEmail?forms.filter(f=>getEmail(f).toLowerCase()===userEmail):[];},[forms,user?.email]);
const filtered=useMemo(()=>statusFilter==='all'?myForms:myForms.filter(f=>getStatus(f)===statusFilter),[myForms,statusFilter]);
const counts=useMemo(()=>{const c={all:myForms.length};myForms.forEach(f=>{const s=getStatus(f);c[s]=(c[s]||0)+1});return c},[myForms]);
// v15.0.0-perf: Pre-compute document lookup map for O(1) attached doc resolution
// instead of O(n) .find() per table row per render.
const docLookupMap=useMemo(()=>{
    if(!Array.isArray(allDocuments))return{};
    const m={};
    for(let i=0;i<allDocuments.length;i++){
        const d=allDocuments[i];
        if(d&&d.id)m[d.id]=d;
    }
    return m;
},[allDocuments]);

// v15.0.0-perf: Memoize the resolved attached docs for each form to avoid
// re-scanning allDocuments on every render. Only recomputes when forms or
// allDocuments change.
const formsDocInfo=useMemo(()=>{
    const m=new Map();
    myForms.forEach(function(f){
        const id=f.id||'';
        if(!id)return;
        const aDocs=getAttachedDocs(f);
        const fIds=getFileIds(f);
        const total=aDocs.length+fIds.length;
        // Resolve docs through lookup map (O(1) each)
        const resolved=aDocs.slice(0,2).map(function(ad){
            const r=docLookupMap[ad.id]||ad;
            return{id:ad.id,name:r.name||'Документ',icon:'fa-file-alt',isDoc:true};
        });
        const fileChips=fIds.slice(0,Math.max(0,2-resolved.length)).map(function(fi){
            return{id:fi.fileId||fi.name||'',name:fi.name||'Файл',icon:'fa-paperclip',isDoc:false};
        });
        m.set(id,{total,chips:resolved.concat(fileChips),hasMore:total>2});
    });
    return m;
},[myForms,docLookupMap]);

// v15.0.0-perf: Pre-compute phase info for every form status to avoid
// getLifecyclePhase() call per row per render.
const formPhaseMap=useMemo(()=>{
    const m=new Map();
    myForms.forEach(function(f){
        const s=getStatus(f);
        if(!m.has(s)){
            try{m.set(s,getLifecyclePhase(s));}catch(_){m.set(s,{label:'—',color:'var(--ink-5)',icon:'fa-circle',step:0});}
        }
    });
    return m;
},[myForms]);
const handleCloseModal=useCallback(()=>setModal(null),[]);
const submitForm=useCallback(id=>{setSending(id);toast('Изпращане на проектно предложение…','info',2000);const _origStatus=getStatus((forms||[]).find(f=>getId(f)===id)||{});if(onPatchForms)onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status:'submitted'}:f));api('submitForm',{id,userName:user?.name||'',userId:user?.email||'',email:user?.email||''}).then(res=>{if(res&&res.require2fa){
    // Revert optimistic patch — submission is paused awaiting OTP
    if(onPatchForms)onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status:_origStatus}:f));
    const tf=res.twoFactor||{};const otpEmail=tf.email||user?.email||'';
    if(res.message)toast(res.message,'info',4000);
    setOtpCtx({
        formId:id,
        email:otpEmail,
        message:res.message||'',
        cooldown:Number(tf.cooldown||30),
        origStatus:_origStatus
    });
    return}
const cn=res.competitionName||'';toast('Проектното предложение е изпратено'+(cn?' за конкурс „'+cn+'"':'')+'.'+(res.emailSent?' Ще получите потвърждение по имейл.':''),'success');if('emailSent' in res&&!res.emailSent)toast('Имейл потвърждението не беше изпратено. Проверете ErrorLog за подробности.','warn',6000);onRefresh({silent:true})}).catch(err=>{if(onPatchForms)onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status:_origStatus}:f));toast(err.message,'error')}).finally(()=>setSending(null))},[onRefresh,user,forms,onPatchForms]);

// 2FA verification context — set by submitForm when backend returns require2fa
// ── v8.0.0.77: OTP persisted to sessionStorage so it survives UI refreshes,
//    accidental modal dismissals, and draft saves. TTL = 5 min from creation.
const OTP_STORAGE_KEY='erp:otp:submit';
const[otpCtx,_setOtpCtx]=useState(()=>{
  try{var raw=sessionStorage.getItem(OTP_STORAGE_KEY);if(!raw)return null;var p=JSON.parse(raw);if(!p||!p.formId)return null;var age=Date.now()-p._ts;if(age>5*60*1000){sessionStorage.removeItem(OTP_STORAGE_KEY);return null}return p;}catch(_){return null;}
});
const setOtpCtx=useCallback(function(val){
  _setOtpCtx(val);
  try{
    if(val){sessionStorage.setItem(OTP_STORAGE_KEY,JSON.stringify(Object.assign({},val,{_ts:Date.now()})));}
    else{sessionStorage.removeItem(OTP_STORAGE_KEY);}
  }catch(_){}
},[]);
// ── Cleanup expired OTP context on mount if any other user ──
useEffect(()=>{
  var em=String(user?.email||'').toLowerCase();
  if(otpCtx&&em&&String(otpCtx.email||'').toLowerCase()!==em){
    // OTP was for a different user — discard
    setOtpCtx(null);
  }
},[]);

// Delete draft (applicant's own only, server enforces ownership + status guard)
// ── v8.1.0: also cleans the per-user localStorage draft so the applicant
//    doesn't get a stale "Възстановена незавършена чернова" toast after
//    deleting their draft; and cleans the per-form autosave key.
const deleteDraft=useCallback(id=>{
    setSending(id);
    // Optimistic: remove from list immediately
    if(onPatchForms)onPatchForms(prev=>prev.filter(f=>getId(f)!==id));
    // Clean localStorage draft keys (per-user draft + any per-form backup)
    try {
      var userKey='erp:newform:draft:'+(user?.email||'_anon');
      localStorage.removeItem(userKey);
      var formKey='erp:draft:'+id+':'+(user?.email||'_anon');
      localStorage.removeItem(formKey);
    } catch(_){}
    api('deleteForm',{id,userId:user?.email||'',email:user?.email||''})
        .then(res=>{
            if(res&&res.success){
                toast('Черновата е изтрита.'+(res.folderCleaned?' Папката с файлове също е изчистена.':''),'success');
                onRefresh({silent:true});
            }else{
                toast((res&&res.error)||'Грешка при изтриване','error');
                onRefresh({silent:true});
            }
        })
        .catch(err=>{
            toast(err.message||'Грешка при изтриване','error');
            onRefresh({silent:true});
        })
        .finally(()=>setSending(null));
},[user,onPatchForms,onRefresh]);

const verifyOtpAndSubmit=useCallback(async code=>{
    if(!otpCtx)return{success:false,error:'Няма активен контекст.'};
    const id=otpCtx.formId;
    setSending(id);
    if(onPatchForms)onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status:'submitted'}:f));
    try{
        const res=await api('submitForm',{id,userName:user?.name||'',userId:user?.email||'',email:user?.email||'',otpCode:code});
        if(res&&res.require2fa){
            // OTP rejected — keep modal open
            if(onPatchForms)onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status:otpCtx.origStatus}:f));
            return{success:false,error:res.otpError||res.error||'Грешен код.'};
        }
        if(res&&res.success===false){
            if(onPatchForms)onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status:otpCtx.origStatus}:f));
            toast(res.error||'Грешка при изпращане','error');
            return{success:false,error:res.error||'Грешка'};
        }
        const cn=res.competitionName||'';
        toast('Проектното предложение е изпратено'+(cn?' за конкурс „'+cn+'"':'')+'.'+(res.emailSent?' Ще получите потвърждение по имейл.':''),'success');
        onRefresh({silent:true});
        setOtpCtx(null);
        return{success:true};
    }catch(err){
        if(onPatchForms)onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status:otpCtx.origStatus}:f));
        return{success:false,error:err.message||'Грешка при комуникация.'};
    }finally{setSending(null)}
},[otpCtx,user,onRefresh,onPatchForms]);
const resendOtp=useCallback(async()=>{
    if(!otpCtx)return{error:'Няма активен контекст.'};
    try{
        const r=await api('initiate2fa',{scope:'submitform',email:otpCtx.email,ref:otpCtx.formId});
        if(r&&r.success){
            if(r.throttled)return{message:'Има активен код. Опитайте отново след '+(r.cooldown||30)+' сек.'};
            return{message:'Изпратен е нов код на '+otpCtx.email+'.'};
        }
        return{error:(r&&r.error)||'Неуспешно изпращане.'};
    }catch(err){return{error:err.message||'Неуспешно изпращане.'}}
},[otpCtx]);
const cancelOtp=useCallback(()=>{
    if(otpCtx&&onPatchForms){const id=otpCtx.formId;const orig=otpCtx.origStatus;onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status:orig}:f))}
    setOtpCtx(null);
    toast('Изпращането е отказано.','info',2500);
},[otpCtx,onPatchForms]);

// ── Sanction check (UC-40: 3-year block) ──
const[sanctionInfo,setSanctionInfo]=useState(null);
useEffect(()=>{
    if(!user?.email)return;
    api('checksanctions',{userEmail:user.email})
        .then(r=>{if(r)setSanctionInfo(r);})
        .catch(()=>{});
},[user?.email]);
const isSanctioned=!!sanctionInfo?.hasSanction;

const activeContests=useMemo(()=>competitionsList.filter(c=>{const s=String(c.status||'').toLowerCase();return s!=='archived'&&s!=='closed'}),[competitionsList]);
const userName=String(user?.name||'').split(' ')[0]||'Потребител';

return e('div',null,
    e('div',{className:'page-top'},e('div',{className:'page-top-left'},e('h2',null,'Добре дошли, '+userName+'!'),e('p',null,'Управление на вашите научни проекти')),e('div',{className:'page-top-actions'},
        e('button',{className:'btn btn-primary',disabled:isSanctioned,title:isSanctioned?'Активна санкция — не можете да подавате нови предложения':'',onClick:()=>!isSanctioned&&setModal({type:'new'})},e('i',{className:'fas fa-plus'}),' Ново предложение'),
        e(RefreshButton,{loading,onClick:onRefresh})
    )),
    isSanctioned&&e('div',{className:'sanction-banner'},
        e('i',{className:'fas fa-ban',style:{fontSize:'1.1rem',flexShrink:0}}),
        e('div',null,
            e('strong',null,'Активна санкция — '),
            sanctionInfo.reason||'Нямате право да подавате нови предложения в момента.',
            sanctionInfo.until&&e('span',{style:{display:'block',marginTop:'.2rem',fontSize:'.8rem',opacity:.8}},
                e('i',{className:'fas fa-clock',style:{marginRight:'.3rem'}}),'Блокиране до: ',fmtDate(sanctionInfo.until))
        )
    ),
    activeContests.length>0&&e('div',{className:'card',style:{marginBottom:'1.25rem'}},
        e('div',{className:'card-header'},e('div',{style:{display:'flex',alignItems:'center',gap:'.55rem'}},e('h3',{className:'card-title'},e('i',{className:'fas fa-trophy',style:{color:'var(--gold)',marginRight:'.4rem'}}),'Активни конкурси'),e('span',{className:'count-chip'},activeContests.length))),
        e('div',{className:'card-body',style:{padding:'.75rem'}},
            // ── Info banner: reminder to review general competition info before applying ──
            e('div',{style:{padding:'.65rem .85rem',marginBottom:'.75rem',background:'#f0f4ff',border:'1px solid #c5d5f7',borderRadius:6,fontSize:'.78rem',color:'#2c5282',lineHeight:1.6,display:'flex',alignItems:'flex-start',gap:'.5rem'}},
                e('i',{className:'fas fa-info-circle',style:{color:'#3b82f6',fontSize:'.95rem',flexShrink:0,marginTop:'.1rem'}}),
                e('div',null,
                    e('div',{style:{fontWeight:700,marginBottom:'.2rem'}},'Преди да кандидатствате'),
                    e('div',null,'Моля, запознайте се с общата информация за конкурсната сесия 2026 на сайта на Конкурсна сесия 2026: ',
                        e('a',{href:'https://sites.google.com/ue-varna.bg/scientific-projects/2026-projects',target:'_blank',rel:'noopener noreferrer',style:{color:'#3b82f6',fontWeight:600,textDecoration:'underline'}},'https://sites.google.com/ue-varna.bg/scientific-projects/2026-projects')),
                    e('div',{style:{marginTop:'.3rem'}},'В зависимост от вида на проектното предложение, което ще подавате, можете предварително да изтеглите формулярите от секция „Документи".')
                )
            ),
            e('div',{className:'document-grid'},activeContests.map(c=>
            e('div',{key:c.id,className:'doc-card',style:{borderTop:'2px solid var(--ok)'}},
                e('div',{className:'doc-header'},
                    e('div',{className:'doc-icon-wrap',style:{background:'var(--ok-bg)',color:'var(--ok)',border:'1px solid var(--ok-border)'}},e('i',{className:'fas fa-trophy'})),
                    e('div',{style:{flex:1,minWidth:0}},
                        e('div',{className:'doc-title'},c.name||'—'),
                        c.deadline&&e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginTop:'.1rem',display:'flex',alignItems:'center',gap:'.3rem'}},e('i',{className:'fas fa-clock',style:{fontSize:'.62rem'}}),fmtDate(c.deadline||c.dateEnd))
                    )
                ),
                c.description&&e('p',{style:{fontSize:'.76rem',color:'var(--ink-3)',lineHeight:'1.5',marginBottom:'.55rem',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden'}},c.description),
                e('div',{className:'doc-meta'},
                    e('span',{className:'badge '+(String(c.status||'').toLowerCase()==='active'?'approved':'draft')},String(c.status||'active')),
                    e('button',{className:'btn btn-primary btn-sm',onClick:()=>setModal({type:'new',compId:c.id}),style:{marginLeft:'auto'}},e('i',{className:'fas fa-paper-plane'}),' Кандидатствай')
                )
            )
        )))
    ),

    filtered.length===0
        ?e('div',{className:'card-body'},e('div',{className:'empty-state'},e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-inbox'})),e('h4',null,'Нямате проектни предложения'),e('p',null,'Натиснете „Ново предложение" за да започнете.')))
        :e('div',{className:'table-wrap'},e('table',null,
            e('thead',null,e('tr',null,e('th',null,'Заглавие'),e('th',null,''),e('th',null,'Тип'),e('th',null,'Конкурс'),e('th',null,'Статус'),e('th',null,'Етап'),e('th',null,'Оценка'),e('th',null,'Прикачени'),e('th',null,'Дата'))),
            e('tbody',null,filtered.map(f=>{
            const id=getId(f),status=getStatus(f),comp=compNameMap[getCompetitionId(f)]||'—';
            // v15.0.0-perf: Use pre-computed phase from formPhaseMap
            const phase=formPhaseMap.get(status)||{label:'—',color:'var(--ink-5)',icon:'fa-circle',step:0};
            const isCorrectionRow=(status==='returned'||status==='needs_correction');
            const rcInfo=isCorrectionRow?parseReturnComment(getReturnComment(f)):null;
            // v15.0.0-perf: Use pre-computed doc info from formsDocInfo
            const docInfo=formsDocInfo.get(id)||{total:0,chips:[],hasMore:false};
            // v15.0.0-perf: Pre-compute score display to avoid IIFE per render
            const sc=Number(f.score||0);
            const rk=Number(f.rank||0);
            const hasScore=sc>0;
            const isInReview=status==='in_review'||status==='reviewer_assignment'||status==='reviewer_invited'||status==='reviewer_accepted';
            return e('tr',{key:id,className:'applicant-row'+(isCorrectionRow?' correction-row':''),title:isCorrectionRow?'Натиснете за да коригирате заявлението':'',style:{cursor:'pointer'},onClick:ev=>{if(ev.target.closest('.action-menu,.btn-ghost,.file-chip,[type=button]'))return;isCorrectionRow?setModal({type:'correction',form:f}):setModal({type:'view',form:f})}},
                e('td',{'data-label':'Заглавие'},e('div',{style:{display:'flex',flexDirection:'column',gap:'.15rem'}},e('span',{style:{fontWeight:600}},getTitle(f).slice(0,52)||'—'),isCorrectionRow&&rcInfo&&!rcInfo.expired&&rcInfo.daysLeft!=null&&e('span',{style:{fontSize:'.66rem',color:rcInfo.daysLeft<=2?'var(--err)':'var(--warn)',fontWeight:600,display:'inline-flex',alignItems:'center',gap:'.2rem'}},e('i',{className:'fas fa-clock',style:{fontSize:'.58rem'}}),rcInfo.daysLeft===0?'Последен ден!':rcInfo.daysLeft+' дни за корекция'),isCorrectionRow&&rcInfo&&rcInfo.expired&&e('span',{style:{fontSize:'.66rem',color:'var(--err)',fontWeight:600}},e('i',{className:'fas fa-ban',style:{fontSize:'.58rem',marginRight:'.2rem'}}),'Срокът изтече'))),
                e('span',{style:{fontWeight:600,display:'none'}},getTitle(f).slice(0,52)||'—'),
                e('td',{'data-label':'Действия'},e(ActionDropdown,{items:[
                    {label:'Преглед',action:()=>setModal({type:'view',form:f})},
                    status==='draft'&&{label:'Редактирай',action:()=>setModal({type:'edit',form:f})},
                    status==='draft'&&{label:'Редактирай бюджет',action:()=>setModal({type:'view',form:f,initialTab:'budget'})},
                    isCorrectionRow&&{label:'Коригирай и подай',action:()=>setModal({type:'correction',form:f})},
                    status==='draft'&&{label:'Изпрати',action:()=>setConfirm({message:'Изпратете проектното предложение за преглед?',onConfirm:()=>{setConfirm(null);submitForm(id)}})},
                    status==='draft'&&{label:'Изтрий черновата',danger:true,action:()=>setConfirm({message:'Сигурни ли сте, че искате да изтриете тази чернова? Действието е необратимо.',confirmLabel:'Изтрий',dangerous:true,onConfirm:()=>{setConfirm(null);deleteDraft(id)}})},
                ].filter(Boolean)})),
                e('td',{'data-label':'Тип'},e('span',{className:'type-tag'},getProjectType(f)||'—')),
                e('td',{'data-label':'Конкурс'},e('span',{className:'comp-tag'},comp.slice(0,32))),
                e('td',{'data-label':'Статус'},
                    e(Badge,{status}),
                    typeof ERP_WORKFLOW!=='undefined'&&ERP_WORKFLOW.WorkflowChip&&e('span',{style:{display:'block',marginTop:'.3rem'}},
                        e(ERP_WORKFLOW.WorkflowChip,{state:status,kind:'proposal'})
                    )
                ),
                e('td',{'data-label':'Етап'},e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem'}},e('span',{style:{display:'inline-flex',alignItems:'center',gap:'.3rem',fontSize:'.72rem',color:phase.color,fontWeight:600}},e('i',{className:'fas '+phase.icon,style:{fontSize:'.62rem'}}),phase.label),phase.step>0&&e('span',{style:{fontSize:'.62rem',color:'var(--ink-5)',fontWeight:400}},'('+phase.step+'/'+BPMN_TOTAL_PHASES+')'))),
                e('td',{'data-label':'Оценка'},(function(){
                    if(hasScore){
                        var grade=sc>=80?'high':sc>=50?'medium':'low';
                        var color=grade==='high'?'var(--ok)':grade==='medium'?'var(--gold)':'var(--err)';
                        return e('span',{className:'mono',style:{display:'inline-flex',alignItems:'center',gap:'.3rem',fontSize:'.78rem',fontWeight:700,color:color},title:'Оценка: '+sc+' т.'+(rk>0?' · Класиране: #'+rk:'')},
                            e('i',{className:'fas fa-star',style:{fontSize:'.62rem'}}),
                            sc+' т.',
                            rk>0&&e('span',{style:{fontSize:'.66rem',color:'var(--ink-4)',fontWeight:600,marginLeft:'.15rem'}},'#'+rk)
                        );
                    }
                    if(isInReview){
                        return e('span',{style:{fontSize:'.7rem',color:'var(--review)',fontWeight:600,display:'inline-flex',alignItems:'center',gap:'.25rem'}},e('i',{className:'fas fa-hourglass-half',style:{fontSize:'.6rem'}}),'в преглед');
                    }
                    return e('span',{style:{fontSize:'.72rem',color:'var(--ink-5)'}},'—');
                })()),
                e('td',{'data-label':'Прикачени'},(function(){
                    if(docInfo.total===0)return e('span',{style:{fontSize:'.72rem',color:'var(--ink-5)'}},'—');
                    const chips=docInfo.chips.map(function(c,i){
                        return e('span',{key:(c.isDoc?'a':'f')+i,className:'file-chip',style:{cursor:'pointer',fontSize:'.66rem',padding:'.12rem .4rem',...(c.isDoc?{borderColor:'var(--warn-border)',background:'var(--gold-glow)'}:{})},title:c.name,onClick:ev=>{ev.stopPropagation();setModal({type:'view',form:f})}},
                            e('i',{className:'fas '+c.icon,style:{fontSize:'.6rem',color:c.isDoc?'var(--gold)':'var(--ink-4)'}}),
                            e('span',{style:{maxWidth:90,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},c.name.slice(0,18))
                        );
                    });
                    if(docInfo.hasMore){
                        chips.push(e('span',{key:'more',style:{cursor:'pointer',fontSize:'.66rem',color:'var(--ink-4)',fontWeight:600,padding:'.12rem .35rem',whiteSpace:'nowrap'},title:'Виж всички '+docInfo.total+' прикачени',onClick:ev=>{ev.stopPropagation();setModal({type:'view',form:f})}},'+',docInfo.total-chips.length));
                    }
                    return e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.2rem',alignItems:'center'}},chips);
                })()),
                e('td',{'data-label':'Дата',className:'mono'},(function(){var d=getLastActivityDate(f);return d?fmtDateTime(d):'—'})())
            );
            }))
        ))
    ,
    modal?.type==='new'&&typeof NewFormModal!=='undefined'&&e(NewFormModal,{user,onClose:handleCloseModal,onSaved:onRefresh,allDocuments,initialCompId:modal.compId||'',isAdmin:false}),

    modal?.type==='view'&&e(ViewModal,{form:(forms.find(f=>getId(f)===getId(modal.form))||modal.form),onClose:handleCloseModal,isAdmin:false,onStatusChange:()=>{},allDocuments,onRefresh,user,initialTab:modal.initialTab||undefined}),
    modal?.type==='edit'&&e(EditFormModal,{form:modal.form,user,onClose:handleCloseModal,onSaved:onRefresh,allDocuments,isAdmin:false}),
    // UC-12/UC-13: correction flow — opens for 'returned' / 'needs_correction' status
    modal?.type==='correction'&&e(CorrectionFormModal,{form:(forms.find(f=>getId(f)===getId(modal.form))||modal.form),user,onClose:handleCloseModal,onSaved:onRefresh,onSubmitCorrection:submitForm,allDocuments}),
    confirm&&e(ConfirmModal,{...confirm,onCancel:()=>setConfirm(null)}),
    otpCtx&&e(OtpVerifyModal,{
        email:otpCtx.email,
        initialMessage:otpCtx.message,
        initialCooldown:otpCtx.cooldown,
        onVerify:verifyOtpAndSubmit,
        onResend:resendOtp,
        onCancel:cancelOtp,
        title:'Потвърждение за подаване'
    })
);
};

/* ─── EXPORT AUDIT PANEL ─── */
/* Inline panel — does NOT wrap itself in modal-overlay.
   Use directly inside an existing modal body to avoid nested overlays. */
var ExportAuditPanel=({onClose,competitions,onExported})=>{
const[exporting,setExporting]=useState(false);
const[statusFilter,setStatusFilter]=useState('all');
const[competitionId,setCompetitionId]=useState('');
const[dateFrom,setDateFrom]=useState('');
const[dateTo,setDateTo]=useState('');
const[result,setResult]=useState(null);
const[showConfirm,setShowConfirm]=useState(null); // 'json' | 'csv' | null
const[exportMode,setExportMode]=useState(''); // 'json' | 'csv'

const handleExportJSON=async()=>{
    setExporting(true);setResult(null);setShowConfirm(null);setExportMode('json');
    try{
    const filters={};
    if(statusFilter!=='all')filters.statusFilter=statusFilter;
    if(competitionId)filters.competitionId=competitionId;
    if(dateFrom)filters.dateFrom=new Date(dateFrom).toISOString();
    if(dateTo){const d=new Date(dateTo);d.setHours(23,59,59,999);filters.dateTo=d.toISOString()}
    const exportInfo=await exportAuditJSON(filters,{clearAfterExport:true});
    setResult({...(exportInfo.summary||{}),cleanup:exportInfo.cleanup||null});
    toast(exportInfo.cleanup?'JSON файлът е изтеглен и старите данни са почистени':'JSON файлът е изтеглен успешно','success');
    if(typeof onExported==='function')await Promise.resolve(onExported());
    }catch(err){toast('Грешка при експорт: '+err.message,'error')}finally{setExporting(false);setExportMode('')}
};

const handleExportCSV=async()=>{
    setExporting(true);setResult(null);setShowConfirm(null);setExportMode('csv');
    try{
    var csvInfo=await exportAllDataCSV();
    setResult({
        total:csvInfo.totalRows||0,
        sheets:csvInfo.summary||{},
        exportedAt:csvInfo.exportedAt||''
    });
    var sheetNames=Object.keys(csvInfo.summary||{});
    if(sheetNames.length){
        var sheetList=sheetNames.map(function(k){return k+': '+csvInfo.summary[k]}).join(', ');
        toast('CSV файлът е изтеглен успешно. Таблици: '+sheetList,'success');
    }else{
        toast('CSV файлът е изтеглен успешно.','success');
    }
    if(typeof onExported==='function')await Promise.resolve(onExported());
    }catch(err){toast('Грешка при CSV експорт: '+(err.message||String(err)),'error')}finally{setExporting(false);setExportMode('')}
};

const confirmExport=function(mode){
    setShowConfirm(mode);
};

const statuses=[{v:'all',l:'Всички'},{v:'draft',l:'Чернови'},{v:'submitted',l:'Изпратени'},{v:'approved',l:'Одобрени'},{v:'rejected',l:'Отхвърлени'},{v:'returned',l:'Върнати'}];

return e('div',{className:'export-audit-panel'},
    // ── Confirm modal ──
    showConfirm&&e('div',{className:'modal-overlay soft',onClick:function(){setShowConfirm(null);},style:{position:'fixed',inset:0,zIndex:12000}},
        e('div',{className:'modal-box narrow',onClick:function(ev){ev.stopPropagation();},style:{maxWidth:460}},
            e('div',{className:'modal-head'},
                e('h3',null,e('i',{className:'fas fa-file-export',style:{color:'var(--gold)'}}),
                    showConfirm==='csv'?' Потвърди CSV експорт':' Потвърди JSON експорт'),
                e('button',{className:'close-btn',onClick:function(){setShowConfirm(null);}},e('i',{className:'fas fa-times'}))
            ),
            e('div',{className:'modal-body',style:{padding:'1rem 1.25rem'}},
                showConfirm==='csv'
                    ? e('div',null,
                        e('p',{style:{fontSize:'.85rem',color:'var(--ink)',lineHeight:1.6,marginBottom:'.75rem'}},
                            e('i',{className:'fas fa-info-circle',style:{color:'var(--info)',marginRight:'.4rem'}}),
                            'Ще бъде генериран пълен CSV архив на ВСИЧКИ таблици в системата — ',e('strong',null,'Applications, Competitions, Reviewers, Projects, Reports, ChangeRequests, Sanctions, UserPreferences'),' и други.'),
                        e('p',{style:{fontSize:'.8rem',color:'var(--ink-3)',lineHeight:1.6,marginBottom:'.75rem'}},
                            'Файлът е във формат ',e('strong',null,'RFC 4180 CSV с BOM (UTF-8)'),', съвместим с ',e('strong',null,'PostgreSQL COPY, Supabase Table Import'),' и Microsoft Excel.'),
                        e('div',{style:{display:'flex',gap:'.5rem',marginTop:'1rem'}},
                            e('button',{className:'btn btn-outline',onClick:function(){setShowConfirm(null);},style:{flex:1}},'Отказ'),
                            e('button',{className:'btn btn-primary',onClick:handleExportCSV,style:{flex:2,justifyContent:'center'}},
                                e('i',{className:'fas fa-file-csv',style:{marginRight:'.35rem'}}),' Изтегли CSV')
                        )
                    )
                    : e('div',null,
                        e('p',{style:{fontSize:'.85rem',color:'var(--ink)',lineHeight:1.6,marginBottom:'.75rem'}},
                            e('i',{className:'fas fa-info-circle',style:{color:'var(--info)',marginRight:'.4rem'}}),
                            'Ще бъде генериран структуриран JSON архив с пълна одитна следа.'),
                        e('p',{style:{fontSize:'.8rem',color:'var(--err)',lineHeight:1.6,marginBottom:'.75rem',background:'var(--err-bg)',padding:'.5rem .7rem',borderRadius:'var(--r-xs)',border:'1px solid var(--err-border)'}},
                            e('i',{className:'fas fa-triangle-exclamation',style:{marginRight:'.35rem'}}),'ВНИМАНИЕ: Експортът с почистване ще ИЗТРИЕ старите записи.'),
                        e('div',{style:{display:'flex',gap:'.5rem',marginTop:'1rem'}},
                            e('button',{className:'btn btn-outline',onClick:function(){setShowConfirm(null);},style:{flex:1}},'Отказ'),
                            e('button',{className:'btn btn-primary',onClick:handleExportJSON,style:{flex:2,justifyContent:'center'}},
                                e('i',{className:'fas fa-file-code',style:{marginRight:'.35rem'}}),' Изтегли JSON')
                        )
                    )
            )
        )
    ),
    e('div',{style:{background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-sm)',padding:'.75rem 1rem',marginBottom:'1.1rem',fontSize:'.78rem',color:'var(--info)',display:'flex',alignItems:'flex-start',gap:'.5rem'}},
    e('i',{className:'fas fa-info-circle',style:{marginTop:'.1rem',flexShrink:0}}),
    e('span',null,'Генерира структуриран JSON архив с пълна одитна следа и след това почиства  стари записи (вкл. проектите за МОН отчетите и техните разходи, отчети, deliverables, библиотечни депозити и заявки за промяна). Подписите се отбелязват като наличие (boolean), без base64 данни.')
    ),
    e('div',{className:'form-field'},
    e('label',null,'Статус'),
    e('select',{value:statusFilter,onChange:ev=>setStatusFilter(ev.target.value)},
        statuses.map(s=>e('option',{key:s.v,value:s.v},s.l))
    )
    ),
    e('div',{className:'form-field'},
    e('label',null,'Конкурсна сесия'),
    e('select',{value:competitionId,onChange:ev=>setCompetitionId(ev.target.value)},
        e('option',{value:''},'— Всички —'),
        competitions.map(c=>e('option',{key:c.id,value:c.id},c.name))
    )
    ),
    e('div',{className:'export-date-row'},
    e('div',{className:'form-field'},
        e('label',null,'От дата'),
        e('input',{type:'date',value:dateFrom,onChange:ev=>setDateFrom(ev.target.value)})
    ),
    e('div',{className:'form-field'},
        e('label',null,'До дата'),
        e('input',{type:'date',value:dateTo,onChange:ev=>setDateTo(ev.target.value)})
    )
    ),
    result&&e('div',{style:{background:'var(--ok-bg)',border:'1px solid var(--ok-border)',borderRadius:'var(--r-sm)',padding:'.85rem 1rem',marginTop:'.4rem',marginBottom:'.8rem',fontSize:'.8rem',color:'var(--ok)'}},
    e('div',{style:{fontWeight:700,marginBottom:'.35rem',display:'flex',alignItems:'center',gap:'.35rem'}},e('i',{className:'fas fa-check-circle'}),' Експортът е готов'),
    exportMode==='csv'
        ? e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.5rem .9rem',fontSize:'.74rem'}},
            e('span',null,'Общо редове: ',e('strong',null,result.total||0)),
            e('span',null,'Таблици: ',e('strong',null,result.sheets?Object.keys(result.sheets).length:0)),
            result.sheets&&Object.keys(result.sheets).map(function(k){
                return e('span',{key:k,style:{fontSize:'.7rem',color:'var(--ok)'}},k+': ',e('strong',null,result.sheets[k]));
            })
        )
        : e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.5rem .9rem',fontSize:'.74rem'}},
            e('span',null,'Общо: ',e('strong',null,result.total||0)),
            e('span',null,'Одобрени: ',e('strong',null,result.approved||0)),
            e('span',null,'В ОЦЕНКА: ',e('strong',null,result.submitted||0)),
            e('span',null,'Чернови: ',e('strong',null,result.draft||0)),
            e('span',null,'Върнати: ',e('strong',null,result.returned||0)),
            e('span',null,'Отхвърлени: ',e('strong',null,result.rejected||0))
        ),
    result.cleanup&&e('div',{style:{marginTop:'.55rem',fontSize:'.73rem',color:'var(--ok)',display:'flex',flexWrap:'wrap',gap:'.5rem .9rem'}},
        e('span',null,'Почистени предложения: ',e('strong',null,result.cleanup.applicationsCleared||0)),
        e('span',null,'Почистени рецензенти: ',e('strong',null,result.cleanup.reviewersCleared||0)),
        e('span',null,'Премахнати mock конкурси: ',e('strong',null,result.cleanup.competitionsRemoved||0)),
        e('span',null,'Премахнати orphan проекти: ',e('strong',null,result.cleanup.projectsRemoved||0)),
        e('span',null,'Каскадни записи (отчети/разходи/deliverables/библиотека/CR): ',e('strong',null,
          (result.cleanup.reportsRemoved||0)+(result.cleanup.expensesRemoved||0)+(result.cleanup.deliverablesRemoved||0)+(result.cleanup.libraryRemoved||0)+(result.cleanup.changeRequestsRemoved||0)
        ))
    )
    ),
    e('div',{className:'export-audit-actions',style:{display:'flex',gap:'.5rem',flexWrap:'wrap'}},
    onClose&&e('button',{className:'btn btn-outline',onClick:onClose,style:{flex:'0 0 auto'}},'Назад'),
    e('button',{className:'btn btn-primary',onClick:function(){confirmExport('json');},disabled:exporting,style:{flex:'1 1 auto',justifyContent:'center'}},
        exporting&&exportMode==='json'?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-download'}),
        exporting&&exportMode==='json'?' Генериране...':' Изтегли JSON'
    ),
    e('button',{className:'btn',onClick:function(){confirmExport('csv');},disabled:exporting,
        style:{flex:'1 1 auto',justifyContent:'center',background:'var(--ok)',color:'#fff',border:'none',borderRadius:'var(--r-sm)',padding:'.55rem 1rem',fontWeight:600,cursor:exporting?'wait':'pointer'}},
        exporting&&exportMode==='csv'?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-file-csv'}),
        exporting&&exportMode==='csv'?' Генериране...':' Експорт CSV'
    )
    )
);
};

/* ─── EXPORT AUDIT MODAL ─── */
/* Standalone modal wrapper around ExportAuditPanel. */
var ExportAuditModal=({onClose,competitions,onExported})=>{
const{closing:eaClosing,close:eaClose}=useModalClose(onClose);
return _portal(e('div',{className:'modal-overlay soft'+(eaClosing?' modal-closing':''),onClick:eaClose},
    e('div',{className:'modal-box narrow'+(eaClosing?' modal-closing':''),onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head'},
        e('h3',null,e('i',{className:'fas fa-file-export',style:{color:'var(--gold)'}}),' Експорт на данни'),
        e('button',{className:'close-btn',onClick:eaClose},e('i',{className:'fas fa-times'}))
    ),
    e('div',{className:'modal-body'},
        e(ExportAuditPanel,{competitions,onExported,onClose:null})
    )
    )
));
};

/* ─── ASSIGN REVIEWERS MODAL ─── */
var AssignReviewersModal=({form,onClose,onAssigned})=>{
const{closing:arClosing,close:arClose}=useModalClose(onClose);
const formId=getId(form);
const competitionId=form.competitionId||form.competition||'';
const projectTitle=getTitle(form)||'—';
const[poolReviewers,setPoolReviewers]=useState([]);
const[loadingPool,setLoadingPool]=useState(true);
const[selected,setSelected]=useState([]);
const[manualEmail,setManualEmail]=useState('');
const[manualName,setManualName]=useState('');

useEffect(()=>{
    let cancelled=false;
    setLoadingPool(true);
    api('getreviewers',{...(_adminCreds||{}),competitionId,forceRefresh:true}).then(res=>{
        if(cancelled)return;
        const revs=res.success&&Array.isArray(res.reviewers)?res.reviewers:[];
        // Show pool reviewers (no formId or with this formId) + those with status pending/consented
        const pool=revs.filter(r=>{
            const fid=String(r.formId||'').trim();
            return !fid||fid===formId;
        });
        setPoolReviewers(pool);
        // Pre-select those already assigned to this form
        const preSelected=pool.filter(r=>String(r.formId||'').trim()===formId).map(r=>r.email);
        setSelected(preSelected);
    }).catch(err=>{toast('Грешка при зареждане на рецензенти: '+err.message,'error')}).finally(()=>{if(!cancelled)setLoadingPool(false)});
    return()=>{cancelled=true};
},[competitionId,formId]);

const toggleReviewer=useCallback(email=>{
    setSelected(prev=>prev.includes(email)?prev.filter(e2=>e2!==email):[...prev,email]);
},[]);

const handleAddManual=useCallback(()=>{
    const em=manualEmail.trim().toLowerCase();
    if(!em)return;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)){toast('Невалиден имейл адрес','error');return}
    const inPool=poolReviewers.find(r=>r.email.toLowerCase()===em);
    if(inPool){
        if(!selected.includes(em))setSelected(prev=>[...prev,em]);
        setManualEmail('');setManualName('');
        return;
    }
    const nv=validateFullName(manualName);
    if(!nv.ok){toast(nv.error,'error');return}
    setPoolReviewers(prev=>[...prev,{id:'manual_'+Date.now(),email:em,name:nv.name,status:'new',competitionId,formId:'',notes:''}]);
    setSelected(prev=>[...prev,em]);
    setManualEmail('');setManualName('');
},[manualEmail,manualName,poolReviewers,selected,competitionId]);

const handleAssign=useCallback(()=>{
    if(!selected.length){toast('Изберете поне един рецензент','error');return}
    // Build name map for any reviewers we added manually (not yet in DB).
    const reviewerNames={};
    for(const em of selected){
        const r=poolReviewers.find(x=>x.email.toLowerCase()===em.toLowerCase());
        if(r&&r.name)reviewerNames[em.toLowerCase()]=r.name;
    }
    const cntSel=selected.length;
    // Optimistic close: dismiss modal immediately, fire request in background.
    onClose();
    toast('Назначаване на '+cntSel+' рецензент'+(cntSel>1?'и':'')+'…','info',2200);
    api('assignreviewers',{...(_adminCreds||{}),formId,reviewers:selected,reviewerNames}).then(res=>{
        if(res&&res.success){
            const cnt=(res.reviewers&&res.reviewers.length)||cntSel;
            const emailCnt=res.reviewerEmailCount||0;
            toast('Назначени '+cnt+' рецензент'+((cnt>1)?'и':'')+'.'+(emailCnt?' Изпратени '+emailCnt+' имейл уведомлени'+(emailCnt>1?'я':'')+'.':''),'success');
            invalidateApiCache(['getreviewers','getreviewerforms','getforms']);
            for(const _a of['getreviewers','getreviewerforms','getforms'])_emitCacheChange(_a);
            if(onAssigned)onAssigned({forceRefresh:true,silent:true});
        }else{toast((res&&res.error)||'Грешка при назначаване','error',6000)}
    }).catch(err=>{toast(err.message,'error',6000)});
},[selected,formId,onClose,onAssigned,poolReviewers]);

const compName=COMPETITIONS.find(c=>c.id===competitionId)?.name||competitionId||'(без конкурс)';

return _portal(e('div',{className:'modal-overlay'+(arClosing?' modal-closing':''),onClick:arClose,role:'dialog','aria-modal':'true'},
    e('div',{className:'modal-box wide'+(arClosing?' modal-closing':''),onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head'},
        e('h3',null,e('i',{className:'fas fa-user-check'}),' Назначи рецензенти'),
        e('button',{className:'close-btn',onClick:arClose,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
    ),
    e('div',{className:'modal-body'},
        e('div',{style:{marginBottom:'1rem',padding:'.7rem .9rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-xs)',fontSize:'.8rem',color:'var(--info)'}},
        e('div',null,e('i',{className:'fas fa-file-alt',style:{marginRight:'.35rem'}}),e('strong',null,'Проект: '),projectTitle.length>60?projectTitle.slice(0,60)+'…':projectTitle),
        e('div',{style:{marginTop:'.25rem'}},e('i',{className:'fas fa-trophy',style:{marginRight:'.35rem'}}),e('strong',null,'Конкурс: '),compName)
        ),

        e('div',{style:{marginBottom:'.8rem'}},
        e('label',{style:{fontWeight:600,fontSize:'.82rem',marginBottom:'.4rem',display:'block'}},'Рецензенти от пула за конкурса'),
        loadingPool?e('div',{style:{textAlign:'center',padding:'1.5rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-spinner fa-spin',style:{marginRight:'.4rem'}}),' Зареждане…'):
        poolReviewers.length===0?e('div',{style:{padding:'.8rem',fontSize:'.8rem',color:'var(--ink-4)',background:'var(--surface)',borderRadius:'var(--r-xs)',textAlign:'center'}},'Няма налични рецензенти в пула. Добавете ръчно по-долу или добавете в раздел „Рецензенти".'):
        e('div',{style:{maxHeight:'240px',overflow:'auto',border:'1px solid var(--border)',borderRadius:'var(--r-xs)'}},
            poolReviewers.map(r=>{
            const isChecked=selected.includes(r.email);
            const isAlreadyAssigned=String(r.formId||'').trim()===formId&&r.status!=='new';
            const sBadge=r.status==='consented'?'approved':r.status==='reviewed'?'submitted':r.status==='inactive'?'rejected':'draft';
            return e('label',{key:r.id||r.email,style:{display:'flex',alignItems:'center',gap:'.6rem',padding:'.55rem .75rem',borderBottom:'1px solid var(--border)',cursor:'pointer',background:isChecked?'var(--red-fog)':'transparent',transition:'background .15s'}},
                e('input',{type:'checkbox',checked:isChecked,onChange:()=>toggleReviewer(r.email),style:{flexShrink:0,accentColor:'var(--primary)'}}),
                e('div',{style:{flex:1,minWidth:0}},
                e('div',{style:{fontWeight:600,fontSize:'.82rem'}},r.name||r.email),
                e('div',{style:{fontSize:'.74rem',color:'var(--ink-4)'}},r.email)
                ),
                e('span',{className:'badge '+sBadge,style:{fontSize:'.66rem'}},reviewerStatusLabel(r.status)),
                isAlreadyAssigned&&e('span',{style:{fontSize:'.66rem',color:'var(--gold)',fontWeight:600}},'вече назначен')
            )})
        )
        ),

        e('div',{style:{borderTop:'1px solid var(--border)',paddingTop:'.8rem',marginTop:'.4rem'}},
        e('label',{style:{fontWeight:600,fontSize:'.82rem',marginBottom:'.4rem',display:'block'}},'Добави нов рецензент ръчно'),
        e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',alignItems:'center'}},
            e('input',{type:'text',placeholder:'Име и фамилия *',value:manualName,onChange:ev=>setManualName(ev.target.value),onKeyDown:ev=>{if(ev.key==='Enter'){ev.preventDefault();handleAddManual()}},style:{flex:'1 1 180px',minWidth:'160px'}}),
            e('input',{type:'email',placeholder:'email@example.com *',value:manualEmail,onChange:ev=>setManualEmail(ev.target.value),onKeyDown:ev=>{if(ev.key==='Enter'){ev.preventDefault();handleAddManual()}},style:{flex:'1 1 200px',minWidth:'180px'}}),
            e('button',{className:'btn btn-outline btn-sm',onClick:handleAddManual,disabled:!manualEmail.trim()||!manualName.trim(),type:'button'},e('i',{className:'fas fa-plus',style:{marginRight:'.2rem'}}),'Добави')
        ),
        e('div',{style:{fontSize:'.7rem',color:'var(--ink-4)',marginTop:'.3rem'}},e('i',{className:'fas fa-info-circle',style:{marginRight:'.3rem'}}),'Име и фамилия са задължителни.')
        ),

        selected.length>0&&e('div',{style:{marginTop:'.8rem',padding:'.5rem .7rem',background:'var(--ok-bg)',border:'1px solid var(--ok-border)',borderRadius:'var(--r-xs)',fontSize:'.78rem',color:'var(--ok)'}},
        e('i',{className:'fas fa-check-circle',style:{marginRight:'.35rem'}}),
        'Избрани: ',e('strong',null,selected.length),' рецензент'+(selected.length>1?'и':'')
        )
    ),
    e('div',{className:'modal-footer'},
        e('button',{className:'btn btn-outline',onClick:arClose},'Отказ'),
        e('button',{className:'btn btn-primary',onClick:handleAssign,disabled:!selected.length},
        e('i',{className:'fas fa-user-check',style:{marginRight:'.3rem'}}),
        'Назначи '+selected.length+' рецензент'+(selected.length>1?'и':''))
    )
    )
));
};

/* ─── ADMIN REVIEW MODAL (BPMN 3 — Административна проверка) ───
 * Interactive review interface with eligibility checklist, team validation,
 * budget check, and visual decision buttons. Replaces the bare status-change
 * dropdown for `submitted` proposals with a structured audit step.
 *
 * v6.9.0: Extended to 8+ criteria per official "Формуляр за проверка на
 * административно съответствие и допустимост". Added: maxPagesOk,
 * applicationsComplete, budgetCategoryLimits, selfAssessmentPassed. */
var AdminReviewModal=({form,onClose,onDecision})=>{
  const{closing,close}=useModalClose(onClose);
  const[checklist,setChecklist]=useState({
    adminComplete:false,leaderEligible:false,teamValid:false,
    budgetRealistic:false,docsAttached:false,
    // v6.9.0 — additional criteria
    maxPagesOk:false,applicationsComplete:false,
    budgetCategoryLimits:false,selfAssessmentPassed:false
  });
  const[comment,setComment]=useState('');
  const[busy,setBusy]=useState(false);
  const[decision,setDecision]=useState(null);
  const[activeTab,setActiveTab]=useState('info');
  const[eligData,setEligData]=useState(null); // {checking,issues:[],checked:false}

  const id=getId(form),title=getTitle(form),status=getStatus(form);
  const applicant=getName(form)||'—',email=getEmail(form)||'—';
  const projType=getProjectType(form)||'—',area=getArea(form)||'',areas=getAreas(form);
  const desc=getDescription(form)||'';
  const attachedDocs=getAttachedDocs(form);const fileIds=getFileIds(form);
  const totalFiles=(Array.isArray(attachedDocs)?attachedDocs.length:0)+(Array.isArray(fileIds)?fileIds.length:0);

  // ── Auto-fetch eligibility check on mount ──
  useEffect(()=>{
    let cancelled=false;
    setEligData({checking:true,issues:[],checked:false});
    const competitionId=form.competitionId||form.competition||'';
    // Fetch self-assessment status
    let selfAssessPassed=false;
    api('getselfassessment',{proposalId:id}).then(saRes=>{
      selfAssessPassed=!!(saRes?.success&&saRes?.assessment?.thresholdMet);
    }).catch(()=>{});
    api('checkeligibility',{
      leaderEmail:email,memberEmails:[],projectCode:projType,
      competitionId:competitionId,formId:id,userId:email,
      proposalPriority:form.area||''
    }).then(r=>{
      if(cancelled)return;
      const issues=Array.isArray(r?.issues)?r.issues:[];
      const hasLeaderIssue=issues.some(i=>!i.member&&(i.code==='DUPLICATE_LEADER'||i.code==='SANCTION'||i.code==='LEADER_QUALIFICATION'||i.code==='DIRECTION_SANCTION'));
      const hasMemberIssue=issues.some(i=>i.member);
      const hasPriorityIssue=issues.some(i=>i.code==='PRIORITY_MISMATCH');
      const hasSelfAssessIssue=issues.some(i=>i.code==='SELF_ASSESSMENT_FAILED'||i.code==='SELF_ASSESSMENT_MISSING');
      setEligData({checking:false,checked:true,issues,hasLeaderIssue,hasMemberIssue,hasPriorityIssue,hasSelfAssessIssue});
      // Auto-check items that pass validation
      setChecklist(prev=>({
        adminComplete:!!title&&!!projType&&!!area,
        leaderEligible:!hasLeaderIssue&&!!applicant&&applicant!=='—',
        teamValid:!hasMemberIssue,
        budgetRealistic:prev.budgetRealistic,
        docsAttached:totalFiles>0,
        maxPagesOk:prev.maxPagesOk,
        applicationsComplete:prev.applicationsComplete,
        budgetCategoryLimits:prev.budgetCategoryLimits,
        selfAssessmentPassed:selfAssessPassed||!hasSelfAssessIssue
      }));
    }).catch(()=>{if(!cancelled)setEligData({checking:false,checked:true,issues:[],error:true})});
    return()=>{cancelled=true};
  },[]);

  // ── Auto-check budget compliance using reactive validation ──
  useEffect(()=>{
    try {
      if(typeof _computeBudgetViolations==='function'){
        var budgetData = form?.budgetBreakdown || form?.budget || {};
        var pc = String(form?.projectCode||'').toUpperCase();
        var violations = _computeBudgetViolations(budgetData, pc, Number(form?.durationMonths)||12, Array.isArray(form?.teamMembers)?form.teamMembers:[]);
        var hasBudget = Object.keys(budgetData).filter(function(k){return k!=='_monthlyMode'&&k!=='_monthly';}).length > 0;
        var blockers = violations.filter(function(v){return v.severity==='high';});
        setChecklist(function(prev){
          var next = Object.assign({}, prev);
          // Budget is realistic if it has data and no total-budget violations
          if(hasBudget && !violations.some(function(v){return v.group==='total'&&v.severity==='high';})){
            next.budgetRealistic = true;
          }
          // Budget category limits passed if no high-severity violations at all
          if(hasBudget && blockers.length === 0){
            next.budgetCategoryLimits = true;
          }
          return next;
        });
      }
    } catch(e) {}
  }, [form?.budgetBreakdown, form?.budget, form?.projectCode, form?.durationMonths, form?.teamMembers]);

  const allChecked=checklist.adminComplete&&checklist.leaderEligible&&checklist.teamValid&&checklist.budgetRealistic&&checklist.docsAttached&&checklist.maxPagesOk&&checklist.applicationsComplete&&checklist.budgetCategoryLimits&&checklist.selfAssessmentPassed;
  const someChecked=Object.values(checklist).some(v=>v);

  const toggleCheck=key=>setChecklist(prev=>({...prev,[key]:!prev[key]}));

  const handleDecision=async(dec)=>{
    setDecision(dec);setBusy(true);
    try{
      let targetStatus,reason=comment.trim()||null;
      if(dec==='eligible')targetStatus='admin_passed';
      else if(dec==='returned')targetStatus='returned';
      else targetStatus='rejected';
      await onDecision(id,targetStatus,reason);
      close();
    }catch(_){setBusy(false);setDecision(null)}
  };

  const checkItem=(key,icon,label,desc)=>{
    const v=checklist[key];
    return e('label',{key,style:{display:'flex',alignItems:'flex-start',gap:'.65rem',padding:'.65rem .85rem',border:'1px solid '+(v?'var(--ok-border)':'var(--border)'),borderRadius:'var(--r-sm)',background:v?'var(--ok-bg)':'var(--surface)',cursor:'pointer',transition:'all .18s ease',userSelect:'none'}},
      e('input',{type:'checkbox',checked:v,onChange:()=>toggleCheck(key),style:{marginTop:'.15rem',flexShrink:0,accentColor:'var(--ok)'}}),
      e('div',{style:{flex:1,minWidth:0}},
        e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',marginBottom:'.12rem'}},
          e('i',{className:'fas '+icon,style:{fontSize:'.7rem',color:v?'var(--ok)':'var(--ink-4)',transition:'color .2s'}}),
          e('span',{style:{fontWeight:600,fontSize:'.84rem',color:v?'var(--ok)':'var(--ink-2)'}},label),
          v&&e('i',{className:'fas fa-check-circle',style:{fontSize:'.7rem',color:'var(--ok)',marginLeft:'auto'}})
        ),
        e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',lineHeight:1.5}},desc)
      )
    );
  };

  const tabs=[
    {id:'info',label:'Информация',icon:'fa-info-circle'},
    {id:'team',label:'Екип',icon:'fa-users'},
    {id:'budget',label:'Бюджет',icon:'fa-coins'},
    {id:'files',label:'Файлове',icon:'fa-paperclip'}
  ];

  return _portal(e('div',{className:'modal-overlay'+(closing?' modal-closing':''),onClick:busy?undefined:close,role:'dialog','aria-modal':'true','aria-label':'Административна проверка'},
    e('div',{className:'modal-box wide modal-form'+(closing?' modal-closing':''),onClick:ev=>ev.stopPropagation(),style:{maxWidth:'720px',width:'95vw'}},
      /* ── Header ── */
      e('div',{className:'modal-head',style:{borderBottom:'2px solid var(--primary)',flexShrink:0}},
        e('div',null,
          e('h3',null,e('i',{className:'fas fa-user-shield',style:{color:'var(--primary)',marginRight:'.45rem'}}),'Административна проверка'),
          e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginTop:'.15rem',display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap'}},
            e('span',null,e('i',{className:'fas fa-file-alt',style:{marginRight:'.25rem'}}),'#',id),
            e('span',{style:{fontWeight:600,color:'var(--ink-2)',maxWidth:'300px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},title.slice(0,80)),
            e('span',null,e('i',{className:'fas fa-user',style:{marginRight:'.25rem'}}),applicant)
          )
        ),
        e('button',{className:'close-btn',onClick:close,disabled:busy,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
      ),
      /* ── Body ── */
      e('div',{className:'modal-body',style:{maxHeight:'60vh',overflowY:'auto',padding:'1rem 1.25rem'}},
        /* Status bar */
        e('div',{style:{display:'flex',gap:'.6rem',flexWrap:'wrap',marginBottom:'.85rem',padding:'.55rem .8rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',alignItems:'center'}},
          e('span',{className:'badge '+status},statusLabel(status)),
          e('span',{className:'type-tag'},projType),
          areas.length>0&&e('span',{style:{display:'flex',flexWrap:'wrap',gap:'.25rem'}},areas.map(function(a){return e('span',{key:a,className:'comp-tag'},a);})),
          e('span',{style:{marginLeft:'auto',fontSize:'.7rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-clock',style:{marginRight:'.25rem'}}),'Подадена: ',fmtDate(form.submitted||form.created))
        ),
        /* Sub-tabs */
        e('div',{className:'fd-tabs',style:{marginBottom:'.75rem',display:'flex',gap:'.2rem'}},
          tabs.map(t=>e('button',{key:t.id,type:'button',className:'fd-tab'+(activeTab===t.id?' active':''),role:'tab','aria-selected':activeTab===t.id,onClick:()=>setActiveTab(t.id),style:{fontSize:'.78rem',padding:'.4rem .75rem'}},
            e('i',{className:'fas '+t.icon,style:{marginRight:'.3rem'}}),t.label))
        ),
        /* Tab: Info */
        activeTab==='info'&&e('div',{style:{display:'grid',gap:'.75rem'}},
          e('div',{className:'detail-grid'},
            e('div',null,e('div',{className:'detail-label'},'Заглавие'),e('div',{className:'detail-val'},title||'—')),
            e('div',null,e('div',{className:'detail-label'},'Тип'),e('div',{className:'detail-val'},projType)),
            e('div',null,e('div',{className:'detail-label'},'Кандидат'),e('div',{className:'detail-val'},applicant,' · ',email)),
            e('div',null,e('div',{className:'detail-label'},'Област'),e('div',{className:'detail-val'},areas.length>0?e(Fragment,null,areas.map(function(a){return e('span',{key:a,className:'area-chip',style:{display:'inline-block',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill)',padding:'.08rem .5rem',fontSize:'.72rem',marginRight:'.25rem',marginBottom:'.15rem'}},a);})):'—'))
          ),
          desc&&e('div',null,
            e('div',{className:'detail-label',style:{marginBottom:'.3rem'}},'Описание'),
            e('div',{style:{padding:'.65rem .8rem',background:'var(--bg)',borderRadius:'var(--r-xs)',fontSize:'.8rem',color:'var(--ink-2)',lineHeight:1.6,maxHeight:'140px',overflowY:'auto',whiteSpace:'pre-wrap'}},desc)
          )
        ),
        /* Tab: Team */
        activeTab==='team'&&e('div',null,
          e('div',{style:{fontSize:'.78rem',color:'var(--ink-3)',marginBottom:'.5rem',display:'flex',alignItems:'center',gap:'.35rem'}},
            e('i',{className:'fas fa-info-circle',style:{color:'var(--info)'}}),
            'Проверете състава на екипа за съответствие с правила R.7 и R.8.'
          ),
          e(FormDetail,{form,allDocuments:[],isAdmin:true,competitions:(typeof COMPETITIONS!=='undefined'?COMPETITIONS:[]),user:{email:form?.userEmail||form?.email||'',name:form?.userName||form?.name||''}})
        ),
        /* Tab: Budget */
        activeTab==='budget'&&e('div',null,
          e('div',{style:{fontSize:'.78rem',color:'var(--ink-3)',marginBottom:'.5rem',display:'flex',alignItems:'center',gap:'.35rem'}},
            e('i',{className:'fas fa-info-circle',style:{color:'var(--info)'}}),
            'Прегледайте бюджета за реалистичност и съответствие с допустимите разходни групи.'
          ),
          e(FormDetail,{form,allDocuments:[],isAdmin:true,competitions:(typeof COMPETITIONS!=='undefined'?COMPETITIONS:[]),user:{email:form?.userEmail||form?.email||'',name:form?.userName||form?.name||''}})
        ),
        /* Tab: Files */
        activeTab==='files'&&e('div',null,
          totalFiles===0
            ?e('div',{className:'empty-state',style:{padding:'1.5rem'}},e('i',{className:'fas fa-paperclip',style:{fontSize:'1.5rem',color:'var(--ink-5)'}}),e('div',{style:{marginTop:'.5rem',color:'var(--ink-4)'}},'Няма прикачени файлове.'))
            :e('div',{style:{fontSize:'.78rem',color:'var(--ink-2)'}},
              e('i',{className:'fas fa-check-circle',style:{color:'var(--ok)',marginRight:'.3rem'}}),
              'Прикачени са ',e('strong',null,totalFiles),' файла. Прегледайте ги в „Преглед".'
            )
        ),
        /* ── Compliance Checklist ── */
        e('div',{style:{marginTop:'1rem',borderTop:'2px solid var(--primary)',paddingTop:'.85rem'}},
          e('div',{style:{fontSize:'.74rem',fontWeight:700,color:'var(--primary)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.55rem',display:'flex',alignItems:'center',gap:'.35rem'}},
            e('i',{className:'fas fa-clipboard-check'}),'Проверка за съответствие',
            eligData?.checking&&e('span',{style:{fontSize:'.65rem',color:'var(--ink-4)',fontWeight:400,marginLeft:'.4rem'}},e('i',{className:'fas fa-spinner fa-spin'}),' проверка…'),
            eligData?.checked&&!eligData?.error&&e('span',{style:{fontSize:'.65rem',color:'var(--ok)',fontWeight:600,marginLeft:'.4rem'}},e('i',{className:'fas fa-check-circle'}),' проверена')
          ),
          e('div',{style:{display:'grid',gap:'.35rem'}},
            checkItem('adminComplete','fa-file-lines','Административни данни','Заглавие, тип, област, описание — всички задължителни полета са попълнени.'+(title?'':' \u26a0 Липсва заглавие')),
            checkItem('leaderEligible','fa-user-tie','Ръководител отговаря на изискванията',(eligData?.hasLeaderIssue?'\u274c ':'')+'Преподавател от ИУ–Варна с PhD и компетентност, или доцент/професор. Проверка за активни санкции (R.7).'+(eligData?.hasLeaderIssue?' Открит проблем: '+(eligData.issues.filter(function(i){return !i.member}).map(function(i){return i.message||i.code}).join('; ')||'Нарушение'):'')),
            checkItem('teamValid','fa-people-group','Екипът не нарушава R.7 / R.8',(eligData?.hasMemberIssue?'\u274c ':'')+'Ръководител: ≤1 активен проект ФНИ/ПНИ. Членове: ≤2 активни проекта. Проверка по данни от сключени договори.'+(eligData?.hasMemberIssue?' Открит проблем: '+(eligData.issues.filter(function(i){return i.member}).map(function(i){return i.message||i.code}).join('; ')||'Нарушение'):'')),
            checkItem('budgetRealistic','fa-coins','Бюджетът е реалистичен','Разходните групи съответстват на дейностите. Външни услуги ≤20% от възнагражденията. Общата сума е в рамките на конкурса.'),
            checkItem('docsAttached','fa-paperclip','Прикачени са необходимите документи','Работна програма, план-сметка, автобиография на ръководителя, декларации — според изискванията на конкурса.'+(totalFiles===0?' \u26a0 Няма прикачени файлове':'')),
            // v6.9.0 — Additional criteria
            checkItem('maxPagesOk','fa-file-lines','Ограничение на страниците (макс. 15)','Формулярът не надвишава 15 страници (Приложение 1 от Правилника). Ако е по-дълъг, преценете дали съдържанието го оправдава.'),
            checkItem('applicationsComplete','fa-list-check','Всички задължителни приложения са приложени','Приложение 1 (Екип), Приложение 2 (Бюджет), Приложение 3 (Сътрудници-студенти за ФНИ), автобиография на ръководителя, декларации за съгласие.'),
            checkItem('budgetCategoryLimits','fa-chart-pie','Бюджетът спазва лимитите по разходни категории','Проверка на процентите: литература ≤10%, канцеларски ≤5%, възнаграждения ≤35%, външни услуги ≤20-25%, командировки ≤10-20% според типа проект.'),
            checkItem('selfAssessmentPassed','fa-star','Самооценката покрива минималния праг',(eligData?.hasSelfAssessIssue?'\u274c ':'')+'За ФНИ/ПНИ/ДНП се изискват минимум 51 точки от 100 (50%+1). Необходимост от допускане до рецензиране.'+(eligData?.hasSelfAssessIssue?' Самооценката не покрива прага.':''))
          )
        )
      ),
      /* ── Comment field ── */
      e('div',{style:{padding:'0.5rem 1.25rem 0.25rem',flexShrink:0}},
        e('label',{style:{fontSize:'.74rem',fontWeight:600,color:'var(--ink-2)',display:'block',marginBottom:'.25rem'}},
          e('i',{className:'fas fa-comment-alt',style:{marginRight:'.3rem',color:'var(--ink-4)'}}),'Коментар / Забележки',!comment.trim()&&e('span',{style:{fontSize:'.62rem',color:'var(--warn)',marginLeft:'.4rem',fontWeight:400}},'(задължителен при връщане за корекция)')),
        e('textarea',{className:'form-input',rows:3,value:comment,onChange:ev=>setComment(ev.target.value),placeholder:'При връщане за корекция — опишете установените несъответствия и необходимите промени…',disabled:busy,style:{resize:'vertical',fontSize:'.82rem',width:'100%',minHeight:'60px'}})
      ),
      /* ── Footer with decision buttons ── */
      e('div',{className:'modal-footer',style:{justifyContent:'space-between',flexWrap:'wrap',gap:'.5rem',padding:'0.75rem 1.25rem 1rem',flexShrink:0}},
        e('button',{className:'btn btn-outline',onClick:close,disabled:busy,style:{flexShrink:0}},'Отказ'),
        e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',flex:'1',justifyContent:'flex-end'}},
          e('button',{className:'btn btn-danger',onClick:()=>handleDecision('ineligible'),disabled:busy||!someChecked,title:'Проектното предложение не отговаря на изискванията и се отхвърля.',style:{whiteSpace:'nowrap'}},
            busy&&decision==='ineligible'?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-ban'}),' Недопустимо'),
          e('button',{className:'btn',onClick:()=>handleDecision('returned'),disabled:busy||!comment.trim(),title:!comment.trim()?'Необходим е коментар при връщане за корекция':'Връща предложението за корекция (5 работни дни).',style:{background:'var(--warn)',color:'#fff',borderColor:'var(--warn)',whiteSpace:'nowrap'}},
            busy&&decision==='returned'?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-undo'}),' Върни за корекция'),
          e('button',{className:'btn',onClick:()=>handleDecision('eligible'),disabled:busy||!allChecked,title:!allChecked?'Всички точки от проверката трябва да бъдат отметнати.':'Потвърждава административната допустимост и преминава към рецензиране.',style:{background:'var(--ok)',color:'#fff',borderColor:'var(--ok)',whiteSpace:'nowrap'}},
            busy&&decision==='eligible'?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-check'}),' Допустимо')
        )
      )
    )
  ));
};

/* ─── SHEET PREVIEW MODAL (Google Sheets seamless iframe) ─── */
const SHEET_PREVIEW_URL='https://docs.google.com/spreadsheets/u/0/d/19JCKdXhC9Rl3hpSdndzfFwZ6kh7M1BU-mmTBxqEajXQ/preview/sheet?gid=1015761759';
var SheetPreviewModal=({onClose})=>{
  const{closing,close}=useModalClose(onClose);
  const overlayHandlers=_useOverlayClickGuard?_useOverlayClickGuard(close,true):{onClick:ev=>{if(ev.target===ev.currentTarget)close();}};
  return _portal(e('div',{className:'modal-overlay doc-viewer-overlay'+(closing?' closing':''),...overlayHandlers,role:'dialog','aria-modal':'true','aria-label':'Документи – преглед'},
    e('div',{className:'modal-box fullscreen'+(closing?' closing':''),onClick:ev=>ev.stopPropagation()},
      e('div',{className:'modal-head'},
        e('div',{style:{display:'flex',alignItems:'center',gap:'.6rem',minWidth:0,flex:'1 1 auto',overflow:'hidden'}},
          e('i',{className:'fas fa-table',style:{fontSize:'1.1rem',color:'var(--primary)',flexShrink:0}}),
          e('div',{style:{minWidth:0,flex:'1 1 0%'}},
            e('h3',{style:{fontSize:'.95rem',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},'Документи'),
            e('div',{style:{fontSize:'.64rem',color:'var(--ink-4)',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},'Преглед на електронна таблица')
          )
        ),
        e('div',{className:'doc-viewer-actions',style:{display:'flex',gap:'.35rem',flexShrink:0,alignItems:'center'}},
          e('a',{href:SHEET_PREVIEW_URL,target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline btn-sm',title:'Отвори в нов прозорец'},e('i',{className:'fas fa-external-link-alt'}),' Отвори'),
          e('button',{className:'close-btn',onClick:close,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
        )
      ),
      e('div',{className:'modal-body',style:{display:'flex',flexDirection:'column',padding:0}},
        e('iframe',{id:'pageswitcher-content',frameBorder:'0',marginHeight:'0',marginWidth:'0',src:SHEET_PREVIEW_URL,style:{display:'block',width:'100%',height:'100%',border:'none',flex:'1 1 auto',minHeight:0,background:'#fff'},title:'Документи – преглед',allowFullScreen:true})
      )
    )
  ));
};

/* ─── ADMIN VIEW ─── */
var AdminView=({forms,loading,onRefresh,allDocuments,onPatchForms,isAdmin,user})=>{
const[search,setSearch]=useState('');const deferredSearch=useDeferredValue(search);const[statusFilter,setStatusFilter]=useState('all');const[modal,setModal]=useState(null);const[confirm,setConfirm]=useState(null);const[returnModal,setReturnModal]=useState(null);const[signatureModal,setSignatureModal]=useState(null);const[assignModal,setAssignModal]=useState(null);const[reviewModal,setReviewModal]=useState(null);const[sortCol,setSortCol]=useState('date');const[sortDir,setSortDir]=useState('desc');const[sheetPreview,setSheetPreview]=useState(false);
// Keep a stable ref to the latest forms so useCallbacks below don't need forms in their dep arrays
const formsRef=useRef(forms);useEffect(()=>{formsRef.current=forms},[forms]);

const handleSort=useCallback(col=>{if(sortCol===col)setSortDir(prev=>prev==='asc'?'desc':'asc');else{setSortCol(col);setSortDir('asc')}},[sortCol]);
const handleCloseModal=useCallback(()=>setModal(null),[]);

const[aTab,setATab]=useState('proposals');
const[auditEntries,setAuditEntries]=useState([]);
const[auditLoading,setAuditLoading]=useState(false);
const[auditError,setAuditError]=useState('');
const[auditSearch,setAuditSearch]=useState('');
const[auditAction,setAuditAction]=useState('all');
const[AUDIT_PAGE_SIZE]=useState(50);
const auditFiltered=useMemo(function(){
  var q=String(auditSearch||'').trim().toLowerCase();
  var list=auditEntries;
  if(auditAction!=='all'){list=list.filter(function(e){return String((e&&e.action)||'').toLowerCase()===auditAction.toLowerCase()});}
  if(q){list=list.filter(function(e){return ['action','actor','target_type','target_id','details'].some(function(k){return String(e&&e[k]||'').toLowerCase().indexOf(q)>=0})});}
  list.sort(function(a,b){var va=a&&a.created||'';var vb=b&&b.created||'';return String(va).localeCompare(String(vb),'bg')});
  return list.slice(0,AUDIT_PAGE_SIZE);
},[auditEntries,auditSearch,auditAction]);
const loadAudit=useCallback(function(){
  setAuditLoading(true);setAuditError('');
  var payload={...(_adminCreds||{}),limit:500};
  try{
    api('getauditlog',payload).then(function(res){
      if(!res||res.success===false){setAuditError((res&&res.error)||'Грешка при зареждане.')}
      else{setAuditEntries(Array.isArray(res.entries)?res.entries:[])}
    }).catch(function(err){setAuditError((err&&err.message)||'Сървърна грешка')});
  }catch(err){setAuditError((err&&err.message)||'Сървърна грешка')}
  setAuditLoading(false);
},[]);
const exportAuditCsv=useCallback(function(){
  var rows=auditEntries;
  var header=['Време','Действие','Изпълнител','Цел','ID цел','Детайли'];
  var lines=[header.join(';')];
  rows.forEach(function(r){lines.push([fmtDateTime&&(r&&r.created)?fmtDateTime(r.created):(r&&r.created)||'',r&&r.action||'',r&&r.actor||'',r&&r.target_type||'',r&&r.target_id||'',String((r&&r.details)||'').replace(/;/g,',')].join(';'))});
  var csv=lines.map(function(r){return r.split(';').map(function(c){return '"'+String(c==null?'':c).replace(/"/g,'""')+'"'}).join(';')}).join('\r\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download='audit-'+Date.now()+'.csv';a.click();URL.revokeObjectURL(url);
},[auditEntries]);
const _auditCell=function(lbl,val,klass){return e('td',{key:lbl,'data-label':lbl,className:klass||null},val)};
const renderAuditRow=function(r,i){
  return e('tr',{key:(r&&r.created||i)+'/'+(r&&r.action||'')},
    _auditCell('Време',(r&&r.created)&&(typeof fmtDateTime==='function'?fmtDateTime(r.created):String(r.created))||'—','mono'),
    _auditCell('Действие',(r&&r.action||'—').replace('_',' ')),
    _auditCell('Изпълнител',r&&r.actor||'—'),
    _auditCell('Цел',r&&r.target_type||'—'),
    _auditCell('ID цел',r&&r.target_id||'—','mono'),
    _auditCell('Детайли',e('span',{style:{fontSize:'.72rem',color:'var(--ink-3)'}},r&&r.details&&String(r.details).length>96?String(r.details).slice(0,96)+'…':(r&&r.details||'—'))));
};
const renderAudit=function(){
  return e('div',null,
    e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.85rem',flexWrap:'wrap',gap:'.6rem'}},
      e('div',{style:{display:'flex',gap:'.5rem',alignItems:'center'}},
        e('input',{className:'input',type:'search',placeholder:'Търсене в аудита…',value:auditSearch,style:{maxWidth:300},onChange:function(ev){setAuditSearch(ev.target.value)}}),
        e('select',{className:'input',value:auditAction,onChange:function(ev){setAuditAction(ev.target.value)}},
          e('option',{value:'all'},'Все действия'),
          e('option',{value:'status_changed'},'Смяна на статус'),
          e('option',{value:'create_form'},'Създаване на формуляр'),
          e('option',{value:'delete_document'},'Изтриване'),
          e('option',{value:'admin_login'},'Вход в администрация')
        )
      ),
      e('div',{style:{display:'flex',gap:'.4rem'}},
        e('button',{className:'btn btn-outline btn-sm',onClick:function(){loadAudit()},disabled:auditLoading},e('i',{className:'fas fa-rotate'+(auditLoading?' fa-spin':'')}),' Обнови'),
        e('button',{className:'btn btn-outline btn-sm',onClick:function(){exportAuditCsv()},disabled:!auditEntries.length||auditLoading},e('i',{className:'fas fa-file-csv'}),' Експорт CSV')
      )
    ,
    auditError?e('div',{style:{background:'var(--err-bg)',border:'1px solid var(--err-border)',padding:'.75rem',borderRadius:'var(--r-sm)',color:'var(--err)',marginBottom:'.85rem'}},[e('i',{className:'fas fa-exclamation-triangle'},' '),auditError]):null,
    !auditLoading&&auditEntries.length===0&&!auditError?e('div',{className:'card-body'},e('div',{className:'empty-state'},e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-clipboard-medical'})),e('h4',null,'Няма записи в аудита'),e('p',null,'Аудитът се попълва автоматически при администраторски действия.'))):null,
    e('div',{className:'table-wrap'},
      e('table',{className:'data-table'},
        e('thead',null,e('tr',null,['Време','Действие','Изпълнител','Цел','ID цел','Детайли'].map(function(h){return e('th',{key:h},h)}))),
        e('tbody',null,auditLoading?e('tr',{key:'loading'},e('td',{colSpan:6,style:{padding:'2rem',textAlign:'center'}},'Зареждане…')):auditFiltered.map(renderAuditRow))
      )
    )
  ));
};

const filtered=useMemo(()=>{let list=[...forms];if(statusFilter!=='all')list=list.filter(f=>getStatus(f)===statusFilter);if(deferredSearch.trim()){const q=deferredSearch.toLowerCase();list=list.filter(f=>getTitle(f).toLowerCase().includes(q)||getName(f).toLowerCase().includes(q)||getEmail(f).toLowerCase().includes(q)||(getId(f)||'').toLowerCase().includes(q))}list.sort((a,b)=>{let va,vb;if(sortCol==='name'){va=getName(a);vb=getName(b)}else if(sortCol==='status'){va=getStatus(a);vb=getStatus(b)}else if(sortCol==='title'){va=getTitle(a);vb=getTitle(b)}else{va=a.submitted||a.created||'';vb=b.submitted||b.created||''}const cmp=String(va).localeCompare(String(vb),'bg');return sortDir==='asc'?cmp:-cmp});return list},[forms,statusFilter,deferredSearch,sortCol,sortDir]);
const counts=useMemo(()=>{const c={all:forms.length};forms.forEach(f=>{const s=getStatus(f);c[s]=(c[s]||0)+1});return c},[forms]);
const changeStatus=useCallback((id,status,comment=null,sigData=null)=>{
    const payload={...(_adminCreds||{}),id,status,comment,isAdmin:true};
    if(sigData){payload.signature=sigData}
    toast('Промяна на статус на „'+STATUS_LABELS[status]+'"…','info',2000);
    const _origStatus=getStatus((formsRef.current||[]).find(f2=>getId(f2)===id)||{});
    if(onPatchForms)onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status}:f));
    api('updateStatus',payload).then(res=>{var msg='Статусът е сменен на „'+STATUS_LABELS[status]+'".';if(res.emailSent){msg+=' Кандидатът е уведомен по имейл.'}toast(msg,'success');if('emailSent' in res&&!res.emailSent){var reason=res.emailReason||'Проверете ErrorLog за подробности.';toast('Имейл известието до кандидата не беше изпратено. '+reason,'warn',8000);}onRefresh({silent:true})}).catch(err=>{if(onPatchForms)onPatchForms(prev=>prev.map(f=>getId(f)===id?{...f,status:_origStatus}:f));toast(err.message,'error')});
},[onRefresh,onPatchForms]);
const handleStatusChange=useCallback((id,status)=>{if(status==='returned'){setReturnModal({id})}else if(status==='in_review'){const f=forms.find(f2=>getId(f2)===id);if(f)setAssignModal({form:f});else toast('Формулярът не е намерен','error')}else if(status==='approved'||status==='contracted'||status==='approved_for_funding'||status==='contract_signed'){setSignatureModal({id,status})}else{setConfirm({message:'Промяна на статус на „'+STATUS_LABELS[status]+'"?',confirmLabel:'Промени',onConfirm:()=>{setConfirm(null);changeStatus(id,status)}})}},[ changeStatus,forms]);
const thCls=col=>sortCol===col?(sortDir==='asc'?'sort-asc':'sort-desc'):'';

return e('div',null,
    e('div',{className:'page-top'},
      e('div',{className:'page-top-left'},
        e('h2',null,'Администрация'),
        e('p',null,'Преглед и управление на всички проектни предложения')
      ),
      e('div',{className:'page-top-actions'},
        e('div',{style:{display:'flex',gap:'.25rem',marginRight:'.5rem',background:'var(--bg-2,#eceef6)',borderRadius:'var(--r-sm)',padding:'.15rem'}},[{k:'proposals',l:'Всички предложения'},{k:'wizard',l:'Нов формуляр (v2)'},{k:'audit',l:'Аудит'}].map(function(t){
          return e('button',{key:t.k,onClick:function(){setATab(t.k);if(t.k==='audit'&&!auditEntries.length&&!auditLoading)loadAudit()},style:{padding:'.35rem .8rem',borderRadius:'var(--r-sm)',border:'none',background:aTab===t.k?'var(--primary)':'transparent',color:aTab===t.k?'#fff':'var(--ink-2)',fontSize:'.78rem',fontWeight:aTab===t.k?700:500,cursor:'pointer',transition:'all .15s'},onMouseDown:function(ev){if(ev.button!==0)setATab(t.k)}},e('span',null,t.l));
        })),
        e('div',{className:'search-wrap'},e('i',{className:'fas fa-search'}),e('input',{className:'search-input',placeholder:'Търсете...',value:search,onChange:ev=>setSearch(ev.target.value)})),e(RefreshButton,{loading,onClick:onRefresh})),
        e('button',{type:'button',className:'btn btn-outline btn-sm',style:{marginLeft:'.4rem'},onClick:function(){setSheetPreview(true)}},e('i',{className:'fas fa-table'}),' Документи')
      )
    ),

        aTab==='wizard' ? (global.__pwWizardAdminDashboard
            ? e(global.__pwWizardAdminDashboard,{user:props.user,onClose:function(){}})
            : e('div',{className:'card'},e('div',{className:'card-body'},e('div',{className:'empty-state'},e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-spinner fa-spin'})),e('h4',null,'Зареждане на административен панел за новия формуляр...'),e('p',null,'Моля изчакайте...')))))
        : aTab==='audit'
            ? renderAudit()
            : e('div',{className:'card'+(loading?' card-loading':''),style:{position:'relative'}},
                e('div',{className:'loading-strip'+(loading?' active':'')}),
                e('div',{className:'card-header'},e('div',{style:{display:'flex',alignItems:'center',gap:'.55rem'}},e('h3',{className:'card-title'},'Всички проектни предложения'),e('span',{className:'count-chip'},filtered.length))),
                filtered.length===0
                    ?e('div',{className:'card-body'},e('div',{className:'empty-state'},e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-inbox'})),e('h4',null,'Няма проектни предложения'),e('p',null,'Опитайте различни критерии.')))
                    :e('div',{className:'table-wrap'},e('table',null,
                        e('thead',null,e('tr',null,e('th',{className:thCls('name'),onClick:()=>handleSort('name')},'Кандидат'),e('th',{className:thCls('title'),onClick:()=>handleSort('title')},'Заглавие'),e('th',null,'Тип'),e('th',{className:thCls('status'),onClick:()=>handleSort('status')},'Статус'),e('th',{className:thCls('date'),onClick:()=>handleSort('date')},'Дата'),e('th',null,'Действия'))),
e('tbody',null,filtered.map(f=>{
  const id=getId(f),status=getStatus(f);
  return e('tr',{key:id},
    e('td',{'data-label':'Кандидат'},e(ApplicantCell,{name:getName(f),email:getEmail(f)})),
    e('td',{'data-label':'Заглавие'},e('span',{style:{fontWeight:600,fontSize:'.83rem'}},getTitle(f).slice(0,46)||'—')),
    e('td',{'data-label':'Тип'},e('span',{className:'type-tag'},getProjectType(f)||'—')),
    e('td',{'data-label':'Статус'},e(Badge,{status})),
    e('td',{'data-label':'Дата',className:'mono'},(function(){var d=getLastActivityDate(f);return d?fmtDateTime(d):'—';})()),
    e('td',{'data-label':''},e(ActionDropdown,{items:[
      {label:'Преглед',action:()=>setModal({type:'view',form:f})},
      status==='submitted'&&{separator:true},
      status==='submitted'&&{label:'Административна проверка',icon:'fa-user-shield',action:()=>setReviewModal({form:f})},
      status==='submitted'&&{label:'Бързо: Допустимо',action:()=>handleStatusChange(id,'admin_passed')},
      status==='submitted'&&{label:'Бързо: Върни',action:()=>handleStatusChange(id,'returned')},
      status==='admin_passed'&&{separator:true},
      status==='admin_passed'&&{label:'Изпрати за рецензиране',action:()=>handleStatusChange(id,'in_review')},
      status==='admin_passed'&&{label:'Върни',action:()=>handleStatusChange(id,'returned')},
      (status==='reviewed'||status==='scored')&&{separator:true},
      (status==='reviewed'||status==='scored')&&{label:'Одобри за финансиране',action:()=>handleStatusChange(id,'approved_for_funding')},
      (status==='reviewed'||status==='scored')&&{label:'Отхвърли',action:()=>handleStatusChange(id,'rejected'),danger:true},
      (status==='ranked'||status==='approved_for_funding'||status==='approved')&&{separator:true},
      (status==='ranked'||status==='approved_for_funding'||status==='approved')&&{label:'Сключи договор',action:()=>handleStatusChange(id,'contracted')}
    ].filter(Boolean)}))
  );
})),
  ),
            ),
    modal?.type==='view'&&e(ViewModal,{form:(forms.find(f=>getId(f)===getId(modal.form))||modal.form),onClose:handleCloseModal,isAdmin:true,onStatusChange:handleStatusChange,allDocuments,onRefresh}),
    reviewModal&&e(AdminReviewModal,{form:reviewModal.form,onClose:()=>setReviewModal(null),onDecision:(id,status,comment)=>changeStatus(id,status,comment)}),
    confirm&&e(ConfirmModal,{...confirm,onCancel:()=>setConfirm(null)}),
    returnModal&&e(ReturnCommentModal,{onCancel:()=>setReturnModal(null),onConfirm:comment=>{setReturnModal(null);setModal(null);changeStatus(returnModal.id,'returned',comment)}}),
    signatureModal&&e(SignatureModal,{title:'Подпис при административно одобрение',message:'Подпишете за административно одобрение.',documentInfo:{title:'Одобрение – '+signatureModal.id,formId:signatureModal.id},onConfirm:sig=>{setSignatureModal(null);setModal(null);changeStatus(signatureModal.id,signatureModal.status,null,sig)},onCancel:()=>setSignatureModal(null)}),
    assignModal&&e(AssignReviewersModal,{form:assignModal.form,onClose:()=>setAssignModal(null),onAssigned:opts=>{setAssignModal(null);setModal(null);onRefresh(opts||{forceRefresh:true,silent:true})}}),
    sheetPreview&&e(SheetPreviewModal,{onClose:()=>setSheetPreview(false)})
);
};

// Expose views to window for _lazyView resolution
try{if(typeof window!=='undefined'){window.ApplicantView=ApplicantView;window.AdminView=AdminView;}}catch(_){}

