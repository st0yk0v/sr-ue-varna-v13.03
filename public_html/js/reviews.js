/* ─── MY REVIEWS VIEW (Reviewer Self-Service) ─── */
var MyReviewsView=({user,allDocuments=[]})=>{
const _MR_CACHE_KEY='erp:myReviews:'+(user?.email||'anon');
// Local-only draft store — survives browser restarts so reviewers never lose
// half-typed scores/comments to an accidental refresh or tab close. Keyed per
// reviewer email; each entry is { [formId]: { scores, comment, recommendation, consent } }.
const _DRAFT_KEY='erp:rvDrafts:'+(user?.email||'anon');
const _readMrCache=()=>{try{const raw=sessionStorage.getItem(_MR_CACHE_KEY);if(!raw)return null;const p=JSON.parse(raw);return Array.isArray(p?.assignments)?p:null}catch(_){return null}};
const _loadDrafts=()=>{try{const raw=localStorage.getItem(_DRAFT_KEY);if(!raw)return{};const p=JSON.parse(raw);return(p&&typeof p==='object'&&!Array.isArray(p))?p:{}}catch(_){return{}}};
const _writeDrafts=d=>{try{if(!d||!Object.keys(d).length)localStorage.removeItem(_DRAFT_KEY);else localStorage.setItem(_DRAFT_KEY,JSON.stringify(d))}catch(_){}};
const _cachedMr=_readMrCache();
const[assignments,setAssignments]=useState(_cachedMr?_cachedMr.assignments:[]);
const[loading,setLoading]=useState(!_cachedMr);
const[error,setError]=useState(null);
const[expandedId,setExpandedId]=useState(null);
const[reviewData,setReviewData]=useState(_cachedMr&&_cachedMr.reviewData?_cachedMr.reviewData:{});
const[submitting,setSubmitting]=useState(null);
const[cardTab,setCardTab]=useState({});
const[declineId,setDeclineId]=useState(null);
const[declineReason,setDeclineReason]=useState('');
const[invDeclineId,setInvDeclineId]=useState(null); // separate state for invitation-level decline
const[invDeclineReason,setInvDeclineReason]=useState('');
const[coiAccepted,setCoiAccepted]=useState({});     // per-formId COI declaration checkbox
const[statusFilter,setStatusFilter]=useState('all');
const[draftSavedTs,setDraftSavedTs]=useState(0);
const _draftTimer=useRef(null);
const _flashTimer=useRef(null);

const parseReview=raw=>{if(!raw)return null;if(typeof raw==='object'&&raw.scores)return raw;if(typeof raw==='string'){try{const p=JSON.parse(raw);if(p&&typeof p==='object')return p}catch(_){}}return null};
const _isFinalStatus=st=>st==='reviewed'||st==='submitted'||st==='declined';
const _hasDraftContent=rd=>!!rd&&((rd.comment&&rd.comment.trim())||rd.recommendation||(rd.scores&&Object.values(rd.scores).some(v=>Number(v)>0)));

const loadAssignments=useCallback(async(forceRefresh=false)=>{
    if(!_readMrCache())setLoading(true);
    setError(null);
    try{
        const res=await api('getreviewerforms',{reviewerEmail:user?.email||'',forceRefresh:!!forceRefresh});
        if(res.success){
            const list=(Array.isArray(res.assignments)?res.assignments:[]).filter(a=>a.formId);
            setAssignments(list);
            const drafts=_loadDrafts();
            const rd={};
            list.forEach(a=>{
                const parsed=parseReview(a.review);
                if(parsed&&parsed.scores){
                    rd[a.formId]={scores:parsed.scores,comment:parsed.comment||'',recommendation:parsed.recommendation||'',consent:a.consent||false};
                }else if(a.review){
                    rd[a.formId]={scores:{},comment:String(a.review),recommendation:'',consent:a.consent||false};
                }
                // For pending assignments, overlay any local draft over the server snapshot
                // so a refresh — or polling — never wipes work that hasn't been submitted yet.
                if(!_isFinalStatus(a.reviewStatus||'')&&drafts[a.formId]){
                    rd[a.formId]={scores:{},comment:'',recommendation:'',consent:false,...(rd[a.formId]||{}),...drafts[a.formId]};
                }
            });
            // Merge: server wins for finalized reviews; for pending entries already in state,
            // never replace local in-progress edits unless they came from a draft (drafts[fid]).
            setReviewData(prev=>{
                const next={...prev};
                list.forEach(a=>{
                    const fid=a.formId;
                    const isFinal=_isFinalStatus(a.reviewStatus||'');
                    if(isFinal){if(rd[fid])next[fid]=rd[fid];return}
                    if(!prev[fid]){if(rd[fid])next[fid]=rd[fid];return}
                    if(drafts[fid]){next[fid]={...prev[fid],...drafts[fid]};return}
                    // else: keep prev[fid] — local in-progress edit not yet flushed to draft store
                });
                try{sessionStorage.setItem(_MR_CACHE_KEY,JSON.stringify({assignments:list,reviewData:next,ts:Date.now()}))}catch(_){}
                return next;
            });
        }else{setError(res.error||'Грешка при зареждане')}
    }catch(err){setError(err.message)}finally{setLoading(false)}
},[user]);

/* Debounced local draft autosave — fires ~650ms after the reviewer stops
   typing/clicking. Stores only assignments still pending review; finalized
   ones are pruned. Flashes a tiny "Saved locally" indicator. */
useEffect(()=>{
    if(_draftTimer.current)clearTimeout(_draftTimer.current);
    _draftTimer.current=setTimeout(()=>{
        // Skip when tab is hidden — no UX benefit and wastes CPU/storage writes
        if(typeof document!=='undefined'&&document.hidden)return;
        const drafts={};let anyContent=false;
        assignments.forEach(a=>{
            if(_isFinalStatus(a.reviewStatus||''))return;
            const rd=reviewData[a.formId];
            if(_hasDraftContent(rd)){
                drafts[a.formId]={scores:rd.scores||{},comment:rd.comment||'',recommendation:rd.recommendation||'',consent:!!rd.consent};
                anyContent=true;
            }
        });
        _writeDrafts(drafts);
        if(anyContent){
            setDraftSavedTs(Date.now());
            if(_flashTimer.current)clearTimeout(_flashTimer.current);
            _flashTimer.current=setTimeout(()=>setDraftSavedTs(0),1800);
        }
    },650);
    return()=>{if(_draftTimer.current)clearTimeout(_draftTimer.current)};
},[reviewData,assignments]);

useEffect(()=>{loadAssignments()},[loadAssignments]);

/* Live polling for reviewer assignments */
useEffect(()=>{
    const pollMs=Math.max(UI_REFRESH_INTERVALS.userStream||20000,30000);
    let lastWake=0;
    const tick=()=>{if(isPageVisible()&&!submitting)loadAssignments().catch(()=>{})};
    const id=setInterval(tick,pollMs);
    const onWake=()=>{
        if(!isPageVisible())return;
        const now=Date.now();
        if(now-lastWake<10000)return; // throttle focus+visibilitychange double-fire
        lastWake=now;
        loadAssignments().catch(()=>{});
    };
    window.addEventListener('focus',onWake);
    document.addEventListener('visibilitychange',onWake);
    return()=>{clearInterval(id);window.removeEventListener('focus',onWake);document.removeEventListener('visibilitychange',onWake)};
},[loadAssignments,submitting]);

const getRd=fid=>reviewData[fid]||{scores:{},comment:'',recommendation:'',consent:false};
const getTotal=fid=>calcRubricTotal(getRd(fid).scores);
const getTab=fid=>{if(cardTab[fid])return cardTab[fid];const a=assignments.find(x=>x.formId===fid);const st=a?.reviewStatus||'';return(st==='declined'||st==='replaced')?'info':'score'};

const updateScore=(fid,subId,val)=>{
    setReviewData(p=>({...p,[fid]:{...(p[fid]||{scores:{},comment:'',recommendation:'',consent:false}),scores:{...(p[fid]?.scores||{}),[subId]:val}}}));
};
const updateField=(fid,field,val)=>{
    setReviewData(p=>({...p,[fid]:{...(p[fid]||{scores:{},comment:'',recommendation:'',consent:false}),[field]:val}}));
};

const handleSubmitReview=async(fid)=>{
    if(!fid){toast('Липсва идентификатор на заявлението (formId). Моля, опреснете страницата.','error');return}
    // FIXED: double-submit guard — prevent concurrent API calls on rapid clicks
    if(submitting===fid)return;
    const rd=getRd(fid);const total=calcRubricTotal(rd.scores);
    if(total===0){toast('Моля, попълнете оценката по критериите','error');return}
    // FIXED: enforce minimum 20-character comment as indicated in the UI
    if(!rd.comment||!rd.comment.trim()||rd.comment.trim().length<20){toast('Моля, напишете коментар/рецензия (минимум 20 символа)','error');return}
    if(!rd.recommendation){toast('Моля, изберете препоръка (одобрявам/не одобрявам)','error');return}
    if(!rd.consent){toast('Моля, потвърдете съгласието си за подаване','error');return}
    setSubmitting(fid);
    // Optimistic: collapse card immediately for responsive UX
    setExpandedId(null);
    try{
        const payload=JSON.stringify({scores:rd.scores,comment:rd.comment,recommendation:rd.recommendation});
        const res=await api('submitreview',{reviewerEmail:user?.email||'',formId:fid,review:payload,score:total,consent:rd.consent});
        if(res.success){
            toast('Рецензията е изпратена успешно','success');
            // Optimistic local state update — mark as reviewed immediately
            setAssignments(prev=>prev.map(a=>a.formId===fid?{...a,reviewStatus:'reviewed',score:String(total),review:payload,submitted:new Date().toISOString()}:a));
            // Drop the local draft — the review is now committed.
            const _d=_loadDrafts();if(_d[fid]){delete _d[fid];_writeDrafts(_d)}
            // Background refresh for server truth
            loadAssignments(true).catch(()=>{});
        } else{toast(res.error||'Грешка при изпращане','error');setExpandedId(fid)}
    }catch(err){toast(err.message,'error');setExpandedId(fid)}finally{setSubmitting(null)}
};

const handleDecline=async(fid)=>{
    if(!fid){toast('Липсва идентификатор на заявлението (formId). Моля, опреснете страницата.','error');return}
    // FIXED: double-submit guard
    if(submitting===fid)return;
    // FIXED: require minimum 10-character reason as indicated in the UI placeholder
    if(!declineReason.trim()||declineReason.trim().length<10){toast('Моля, посочете причина за отказ (минимум 10 символа)','error');return}
    setSubmitting(fid);
    // Optimistic: collapse card immediately
    setExpandedId(null);setDeclineId(null);setDeclineReason('');
    try{
        const res=await api('submitreview',{reviewerEmail:user?.email||'',formId:fid,review:JSON.stringify({decline:true,reason:declineReason}),score:0,consent:false,decline:true});
        if(res.success){
            toast('Рецензията е отказана','info');
            setAssignments(prev=>prev.map(a=>a.formId===fid?{...a,reviewStatus:'declined'}:a));
            const _d=_loadDrafts();if(_d[fid]){delete _d[fid];_writeDrafts(_d)}
            loadAssignments(true).catch(()=>{});
        } else{toast(res.error||'Грешка','error')}
    }catch(err){toast(err.message,'error')}finally{setSubmitting(null)}
};

/* ─── BPMN 20 — Accept the invitation (consent). Starts the 10-day clock. ─── */
const handleConsent=async(fid)=>{
    if(!fid)return;
    if(submitting===fid)return;
    const coiDeclared=!!(coiAccepted[fid]);
    setSubmitting(fid);
    try{
        const res=await api('consenttoreview',{reviewerEmail:user?.email||'',formId:fid,coiDeclared});
        if(res.success){
            toast('Поканата е приета. Срокът за рецензия е 10 дни.','success');
            setAssignments(prev=>prev.map(a=>a.formId===fid?{...a,reviewStatus:'consented',consent:true,consentDate:res.consentDate,coiDeclared:!!coiDeclared}:a));
            setCardTab(p=>({...p,[fid]:'score'}));
            setExpandedId(fid); // keep card open, navigate to scoring tab
            loadAssignments(true).catch(()=>{});
        }else{toast(res.error||'Грешка при потвърждаване','error')}
    }catch(err){toast(err.message,'error')}finally{setSubmitting(null)}
};

/* ─── BPMN 20 (alt) — Decline BEFORE consent. ─── */
const handleDeclineInvitation=async(fid)=>{
    if(!fid)return;
    if(submitting===fid)return;
    if(!invDeclineReason.trim()||invDeclineReason.trim().length<10){toast('Моля, посочете причина (мин. 10 символа)','error');return}
    setSubmitting(fid);
    setExpandedId(null);setInvDeclineId(null);
    const reason=invDeclineReason;setInvDeclineReason('');
    try{
        const res=await api('declineinvitation',{reviewerEmail:user?.email||'',formId:fid,reason});
        if(res.success){
            toast('Поканата е отказана.','info');
            setAssignments(prev=>prev.map(a=>a.formId===fid?{...a,reviewStatus:'declined'}:a));
            loadAssignments(true).catch(()=>{});
        }else{toast(res.error||'Грешка','error')}
    }catch(err){toast(err.message,'error')}finally{setSubmitting(null)}
};

// Memoize derived counts so they don't re-iterate the full assignments list
// on every keystroke / score change while a card is expanded.
// invitedCount  = BPMN 19-20: invitation sent, awaiting reviewer's consent
// inReviewCount = BPMN 22:    consented and currently reviewing (10-day clock running)
// pendingCount  = invitedCount + inReviewCount (anything not finished)
const invitedCount=useMemo(()=>assignments.filter(a=>{const s=a.reviewStatus||'';return s==='pending'||s==='assigned'||!s}).length,[assignments]);
const inReviewCount=useMemo(()=>assignments.filter(a=>(a.reviewStatus||'')==='consented').length,[assignments]);
const pendingCount=invitedCount+inReviewCount;
const submittedCount=useMemo(()=>assignments.filter(a=>{const s=a.reviewStatus||'';return s==='reviewed'||s==='submitted'}).length,[assignments]);
const declinedCount=useMemo(()=>assignments.filter(a=>{const s=a.reviewStatus||'';return s==='declined'||s==='replaced'}).length,[assignments]);

// Publish the live pending count so the App-level nav badge stays in sync
// with mutations that happen inside this view (consent, submit, decline)
// without forcing the App's own probe to re-run.
useEffect(()=>{
    try{window.dispatchEvent(new CustomEvent('erp:reviewerPendingCount',{detail:{pending:pendingCount,total:assignments.length}}));}catch(_){}
},[pendingCount,assignments.length]);

/* ---- render: rubric scoring grid (reusable for edit & read-only) ---- */
const renderRubricGrid=(fid,readOnly,savedScores)=>{
    const scores=readOnly?(savedScores||{}):(getRd(fid).scores||{});
    const total=calcRubricTotal(scores);const pct=Math.round(total/EVAL_MAX_SCORE*100);const grade=scoreGrade(total);
    return e('div',null,
        e('div',{className:'rubric-grid'},
            EVAL_RUBRIC.map(cat=>{
                const catTotal=cat.subcriteria.reduce((s,sub)=>s+(Number(scores[sub.id])||0),0);
                return e('div',{key:cat.id,className:'rubric-category'},
                    e('div',{className:'rubric-category-head'},
                        e('div',{className:'rubric-category-name'},cat.label),
                        e('span',{className:'rubric-category-max'},catTotal+' / '+cat.maxTotal)
                    ),
                    e('div',{className:'rubric-subcriteria'},
                        cat.subcriteria.map(sub=>{
                            const val=scores[sub.id]||'';const numVal=Number(val)||0;
                            return e('div',{key:sub.id,className:'rubric-subcriterion'},
                                e('span',{className:'rubric-sub-label'},sub.label),
                                readOnly
                                    ?e('span',{style:{fontWeight:700,fontSize:'.88rem',color:numVal>0?'var(--ink)':'var(--ink-5)',minWidth:'42px',textAlign:'center'}},numVal||'—')
                                    :e('input',{type:'number',className:'rubric-score-input'+(numVal>sub.max?' over-max':''),min:0,max:sub.max,value:val,placeholder:'0',
                                        onChange:ev=>{let v=ev.target.value;if(v!==''){v=Math.max(0,Math.min(sub.max,parseInt(v)||0))}updateScore(fid,sub.id,v)}
                                    }),
                                e('span',{className:'rubric-score-max'},'/ '+sub.max)
                            )
                        })
                    )
                )
            })
        ),
        e('div',{className:'eval-total-bar'},
            e('div',null,
                e('div',{className:'eval-total-label'},'Обща оценка'),
                e('div',{className:'eval-progress-bar',style:{width:'200px',marginTop:'.35rem'}},
                    e('div',{className:'eval-progress-fill '+grade,style:{width:pct+'%'}})
                )
            ),
            e('div',{className:'eval-total-score'},total,e('span',{className:'of-max'},' / '+EVAL_MAX_SCORE+' т.'))
        )
    );
};

/* ---- render: project info panel ---- */
const renderProjectInfo=a=>{
    const p=a.project||{};
    const compName=a.competitionName||COMPETITIONS.find(c=>c.id===a.competitionId)?.name||a.competitionId||'—';
    const teamMembers=Array.isArray(p.teamMembers)?p.teamMembers:[];
    const projectTitle=p.title||a.formTitle||'';
    return e('div',{style:{display:'grid',gap:'.75rem'}},
        /* ── competition name banner ── */
        compName&&compName!=='—'&&e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',padding:'.55rem .85rem',background:'var(--red-fog)',border:'1px solid var(--red-border)',borderRadius:'var(--r-sm)',marginBottom:'.25rem'}},
            e('i',{className:'fas fa-trophy',style:{color:'var(--red)',fontSize:'.78rem'}}),
            e('div',{style:{fontSize:'.8rem',fontWeight:700,color:'var(--ink)'}},compName)
        ),
        e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.6rem .75rem'}},
            projectTitle&&e('div',{style:{gridColumn:'1/-1'}},e('div',{style:{fontSize:'.66rem',fontWeight:700,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.2rem'}},'Заглавие'),e('div',{style:{fontSize:'.84rem',color:'var(--ink)',fontWeight:600}},projectTitle)),
            e('div',null,e('div',{style:{fontSize:'.66rem',fontWeight:700,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.2rem'}},'Кандидат'),e('div',{style:{fontSize:'.84rem',color:'var(--ink)'}},p.applicant||'—')),
            e('div',null,e('div',{style:{fontSize:'.66rem',fontWeight:700,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.2rem'}},'Тип проект'),e('div',{style:{fontSize:'.84rem',color:'var(--ink)'}},p.projectType||'—')),
            e('div',null,e('div',{style:{fontSize:'.66rem',fontWeight:700,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.2rem'}},'Област'),e('div',{style:{fontSize:'.84rem',color:'var(--ink)'}},(function(){var ra=getAreas(p.area||'');if(!ra.length)return'—';return e(Fragment,null,ra.map(function(a){return e('span',{key:a,style:{display:'inline-block',marginRight:'.35rem',marginBottom:'.15rem'}},a);}));})())),
            e('div',null,e('div',{style:{fontSize:'.66rem',fontWeight:700,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.2rem'}},'Статус на проекта'),e('div',{style:{fontSize:'.84rem',color:'var(--ink)'}},statusLabel(p.status))),
            p.submitted&&e('div',null,e('div',{style:{fontSize:'.66rem',fontWeight:700,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.2rem'}},'Подадена на'),e('div',{style:{fontSize:'.84rem',color:'var(--ink)'}},fmtDate(p.submitted))),
            p.created&&e('div',null,e('div',{style:{fontSize:'.66rem',fontWeight:700,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.2rem'}},'Създадена на'),e('div',{style:{fontSize:'.84rem',color:'var(--ink)'}},fmtDate(p.created)))
        ),
        p.description&&e('div',null,
            e('div',{style:{fontSize:'.66rem',fontWeight:700,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.35rem'}},'Описание на проекта'),
            e('div',{style:{fontSize:'.82rem',color:'var(--ink-2)',lineHeight:1.65,padding:'.7rem .85rem',background:'var(--bg)',borderRadius:'var(--r-xs)',borderLeft:'3px solid var(--border-2)',maxHeight:'220px',overflowY:'auto'}},p.description)
        ),
        /* ── team members ── */
        teamMembers.length>0&&e('div',null,
            e('div',{style:{fontSize:'.66rem',fontWeight:700,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'.35rem',display:'flex',alignItems:'center',gap:'.3rem'}},e('i',{className:'fas fa-users',style:{fontSize:'.6rem'}}),' Екип (',teamMembers.length,')'),
            e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.3rem'}},
                teamMembers.map((m,i)=>{
                    const name=typeof m==='string'?m:(m.name||m.email||'Член '+(i+1));
                    const role=typeof m==='object'?(m.role||''):'';
                    return e('span',{key:i,style:{display:'inline-flex',alignItems:'center',gap:'.3rem',padding:'.25rem .6rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill)',fontSize:'.74rem',color:'var(--ink-2)'}},
                        e('i',{className:'fas fa-user',style:{fontSize:'.58rem',color:'var(--ink-5)'}}),name,
                        role&&e('span',{style:{fontSize:'.62rem',color:'var(--ink-4)',fontWeight:600}},'('+role+')')
                    );
                })
            )
        ),
        e('div',{style:{display:'flex',gap:'.75rem',flexWrap:'wrap',fontSize:'.72rem',color:'var(--ink-4)'}},
            a.assigned&&e('span',null,e('i',{className:'fas fa-calendar-plus',style:{marginRight:'.25rem'}}),'Възложена: ',a.assigned),
            a.submitted&&e('span',null,e('i',{className:'fas fa-calendar-check',style:{marginRight:'.25rem'}}),'Рецензия подадена: ',a.submitted)
        )
    );
};

/* ---- render: documents panel for reviewer ---- */
const renderDocumentsPanel=a=>{
    const p=a.project||{};
    const files=Array.isArray(p.fileIds)?p.fileIds:[];
    const attachedDocs=Array.isArray(p.attachedDocs)?p.attachedDocs:[];
    const resolvedAttached=attachedDocs.map(ad=>allDocuments.find(d=>d.id===ad.id)||ad);
    const totalDocs=resolvedAttached.length+files.length;
    const history=Array.isArray(p.history)?p.history:[];

    return e('div',{style:{display:'grid',gap:'.85rem'}},
        /* ── attached official documents ── */
        e('div',{className:'fd-docs-card'},
            e('div',{className:'fd-docs-card-head'},e('i',{className:'fas fa-book'}),e('span',null,'Прикачени официални документи'),resolvedAttached.length>0&&e('span',{className:'fd-tab-badge has-items',style:{marginLeft:'auto'}},resolvedAttached.length)),
            resolvedAttached.length>0
                ?e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.35rem'}},
                    resolvedAttached.map((d,i)=>{
                        const vis=getDocVisuals(d);
                        // Reviewers receive PREVIEW-only access; never construct a /view
                        // URL (it would let the reviewer flip to /edit by editing the
                        // address bar). previewLink is emitted by the backend; keep
                        // downloadUrl only for files in the public-download allowlist.
                        const url=d.previewLink||d.downloadUrl||(d.id?'https://drive.google.com/file/d/'+encodeURIComponent(d.id)+'/preview':'');
                        return e('span',{key:d.id||i,className:'file-chip',style:{cursor:url?'pointer':'default',borderColor:'var(--warn-border)',background:'var(--gold-glow)'}},
                            e('i',{className:'fas '+vis.icon,style:{fontSize:'.68rem',color:'var(--gold)'}}),
                            url?e('a',{href:url,target:'_blank',rel:'noopener',style:{color:'inherit',textDecoration:'none',fontWeight:600}},(d.name||'Документ').slice(0,35)):e('span',{style:{fontWeight:600}},(d.name||'Документ').slice(0,35)),
                            url&&e('i',{className:'fas fa-external-link-alt',style:{fontSize:'.55rem',color:'var(--ink-4)',marginLeft:'.2rem'}})
                        );
                    })
                )
                :e('div',{style:{padding:'.8rem',textAlign:'center',color:'var(--ink-5)',fontSize:'.78rem'}},e('i',{className:'fas fa-folder-open',style:{display:'block',fontSize:'1rem',marginBottom:'.3rem'}}),'Няма прикачени документи')
        ),
        /* ── uploaded files ── */
        e('div',{className:'fd-docs-card'},
            e('div',{className:'fd-docs-card-head'},e('i',{className:'fas fa-paperclip'}),e('span',null,'Качени файлове'),files.length>0&&e('span',{className:'fd-tab-badge has-items',style:{marginLeft:'auto'}},files.length)),
            files.length>0
                ?e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.35rem'}},
                    files.map((f,i)=>{
                        const fObj=typeof f==='string'?{id:f,name:'Файл '+(i+1)}:f;
                        const _fid=fObj.fileId||fObj.id;
                        // Files under evaluation: PREVIEW-only for reviewers. The
                        // backend strips downloadUrl from these records unless the file
                        // is in the public-download folder allowlist.
                        const url=fObj.previewLink||fObj.downloadUrl||(_fid?'https://drive.google.com/file/d/'+encodeURIComponent(_fid)+'/preview':'');
                        return e('span',{key:fObj.id||i,className:'file-chip'},
                            e('i',{className:'fas fa-paperclip',style:{fontSize:'.68rem',color:'var(--ink-4)'}}),
                            url?e('a',{href:url,target:'_blank',rel:'noopener',style:{color:'inherit',textDecoration:'none'}},(fObj.name||'Файл '+(i+1))):e('span',null,fObj.name||'Файл '+(i+1)),
                            fObj.size&&e('span',{style:{color:'var(--ink-4)',fontSize:'.67rem'}},' · '+fObj.size),
                            url&&e('i',{className:'fas fa-external-link-alt',style:{fontSize:'.55rem',color:'var(--ink-4)',marginLeft:'.2rem'}})
                        );
                    })
                )
                :e('div',{style:{padding:'.8rem',textAlign:'center',color:'var(--ink-5)',fontSize:'.78rem'}},e('i',{className:'fas fa-cloud-upload-alt',style:{display:'block',fontSize:'1rem',marginBottom:'.3rem'}}),'Няма качени файлове')
        ),
        totalDocs===0&&e('div',{style:{background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-sm)',padding:'.65rem .9rem',fontSize:'.78rem',color:'var(--info)',display:'flex',alignItems:'center',gap:'.45rem'}},
            e('i',{className:'fas fa-info-circle'}),'Кандидатът не е прикачил документи към предложението.'
        ),
        /* ── history ── */
        history.length>0&&e('div',null,
            e('div',{className:'section-label'},e('i',{className:'fas fa-history'}),' История на проекта'),
            [...history].reverse().slice(0,10).map((h,i)=>e('div',{key:i,className:'history-entry'},
                e('div',{className:'action'},humanizeAction(h.action)),
                e('div',{className:'meta'},[h.user&&'от '+h.user,h.date&&fmtDateTime(h.date),h.comment&&'„'+humanizeAction(h.comment)+'"'].filter(Boolean).join(' · '))
            ))
        )
    );
};

const visibleAssignments=useMemo(()=>statusFilter==='all'?assignments:
    statusFilter==='pending'?assignments.filter(a=>{const s=a.reviewStatus||'';return s==='pending'||s==='consented'||s==='assigned'||!s}):
    statusFilter==='submitted'?assignments.filter(a=>{const s=a.reviewStatus||'';return s==='reviewed'||s==='submitted'}):
    assignments.filter(a=>{const s=a.reviewStatus||'';return s==='declined'||s==='replaced'}),[assignments,statusFilter]);

return e('div',{className:'rv-view'},
    /* ── page header ── */
    e('div',{className:'rv-page-header'},
        e('div',{className:'rv-header-left'},
            e('div',{className:'rv-header-icon'},e('i',{className:'fas fa-clipboard-check'})),
            e('div',null,
                e('h2',{className:'rv-header-title'},
                    'Моите рецензии',
                    pendingCount>0&&e('span',{className:'rv-pending-badge'},pendingCount,' в оценка')
                ),
                e('p',{className:'rv-header-sub'},'Преглед и подаване на рецензии за възложени проекти')
            )
        ),
        e('div',{className:'rv-header-actions'},e(RefreshButton,{loading,onClick:()=>loadAssignments(true)}))
    ),

    /* ── stats row ── */
    e('div',{className:'rv-stats-row'},
        e('div',{className:'rv-stat-card rv-stat-all'+(statusFilter==='all'?' rv-stat-active':''),onClick:()=>{setStatusFilter('all');setExpandedId(null)},role:'button','aria-pressed':statusFilter==='all',style:{cursor:'pointer'}},
            e('div',{className:'rv-stat-icon'},e('i',{className:'fas fa-inbox'})),
            e('div',{className:'rv-stat-num'},assignments.length),
            e('div',{className:'rv-stat-lbl'},'Общо')
        ),
        e('div',{className:'rv-stat-card rv-stat-pending'+(statusFilter==='pending'?' rv-stat-active':''),onClick:()=>{setStatusFilter('pending');setExpandedId(null)},role:'button','aria-pressed':statusFilter==='pending',style:{cursor:'pointer'}},
            e('div',{className:'rv-stat-icon'},e('i',{className:'fas fa-hourglass-half'})),
            e('div',{className:'rv-stat-num'+(pendingCount>0?' active':'')},pendingCount),
            e('div',{className:'rv-stat-lbl'},'В ОЦЕНКА')
        ),
        e('div',{className:'rv-stat-card rv-stat-submitted'+(statusFilter==='submitted'?' rv-stat-active':''),onClick:()=>{setStatusFilter('submitted');setExpandedId(null)},role:'button','aria-pressed':statusFilter==='submitted',style:{cursor:'pointer'}},
            e('div',{className:'rv-stat-icon'},e('i',{className:'fas fa-check-circle'})),
            e('div',{className:'rv-stat-num'+(submittedCount>0?' active':'')},submittedCount),
            e('div',{className:'rv-stat-lbl'},'Подадени')
        ),
        e('div',{className:'rv-stat-card rv-stat-declined'+(statusFilter==='declined'?' rv-stat-active':''),onClick:()=>{setStatusFilter('declined');setExpandedId(null)},role:'button','aria-pressed':statusFilter==='declined',style:{cursor:'pointer'}},
            e('div',{className:'rv-stat-icon'},e('i',{className:'fas fa-times-circle'})),
            e('div',{className:'rv-stat-num'},declinedCount),
            e('div',{className:'rv-stat-lbl'},'Отказани')
        )
    ),

    /* ── error banner ── */
    error&&e('div',{className:'rv-error-bar'},
        e('i',{className:'fas fa-exclamation-circle rv-error-icon'}),
        e('span',null,error),
        e('button',{className:'btn btn-outline btn-sm',style:{marginLeft:'auto'},onClick:()=>loadAssignments(true)},'Опитай отново')
    ),

    /* ── filter strip ── */
    assignments.length>0&&e('div',{className:'rv-filter-strip'},
        [
            ['all','Всички','fa-layer-group',assignments.length,''],
            ['pending','В ОЦЕНКА','fa-hourglass-half',pendingCount,''],
            ['submitted','Подадени','fa-check-circle',submittedCount,''],
            ['declined','Отказани','fa-ban',declinedCount,'Включва заменени назначения'],
        ].map(function(item){
            var key=item[0],label=item[1],icon=item[2],count=item[3],tip=item[4];
            var isActive=statusFilter===key;
            return e('button',{key,className:'rv-filter-pill'+(isActive?' active':'')+' rv-fp-'+key,onClick:function(){setStatusFilter(key);setExpandedId(null)},title:tip||undefined},
                e('i',{className:'fas '+icon}),
                label,
                e('span',{className:'rv-fp-count'},count)
            );
        })
    ),

    /* ── visible count hint ── */
    statusFilter!=='all'&&assignments.length>0&&e('div',{className:'rv-filter-hint'},
        e('i',{className:'fas fa-filter'}),
        ' Показват се ',visibleAssignments.length,' от ',assignments.length,' рецензии'
    ),

    /* ── cards list ── */
    loading&&assignments.length===0?e('div',{className:'content-loaded rv-skeleton-wrap'},e(SkeletonCards,{count:3})):
    visibleAssignments.length===0?e('div',{className:'empty-state'},
        e('div',{className:'empty-state-icon'},
            e('i',{className:statusFilter==='all'?'fas fa-clipboard-list':'fas fa-filter',style:{fontSize:'2rem',color:'var(--border-2)'}})
        ),
        e('h4',null,statusFilter==='all'?'Няма възложени рецензии':'Няма резултати за филтъра'),
        e('p',null,statusFilter==='all'?'В момента нямате проекти за рецензиране. Проверете отново по-късно.':'Опитайте да изберете друг филтър.')
    ):
    e('div',{className:'rv-cards-list view-enter'},
        visibleAssignments.map(a=>{
            const isExpanded=expandedId===a.formId;
            const st=a.reviewStatus||'pending';
            const isSubmitted=st==='reviewed'||st==='submitted';
            const isDeclined=st==='declined';
            const isReplaced=st==='replaced';
            const isPending=!isSubmitted&&!isDeclined&&!isReplaced;
            const isAwaitingConsent=isPending&&st!=='consented';// BPMN 19→20
            const isInReview=isPending&&st==='consented';        // BPMN 22
            const hasProjectData=!!(a.project&&(a.project.title||a.project.applicant));
            const stage=getReviewerStage(a);
            const proj=a.project||{};
            const parsed=parseReview(a.review);
            const savedScores=parsed?.scores||{};
            const savedTotal=parsed?.scores?calcRubricTotal(parsed.scores):(Number(a.score)||0);
            const savedPct=Math.round(savedTotal/EVAL_MAX_SCORE*100);
            const savedGrade=scoreGrade(savedTotal);
            const statusKey=isSubmitted?'submitted':(isDeclined||isReplaced)?'declined':'pending';
            const statusIcon=isSubmitted?'fa-check-circle':isDeclined?'fa-times-circle':isReplaced?'fa-rotate':'fa-hourglass-half';
            const statusText=isSubmitted?'Подадена':isDeclined?'Отказана':isReplaced?'Заменена':'Чакаща';
            const tab=getTab(a.formId);
            const gradeCss=savedGrade==='high'?'ok':savedGrade==='medium'?'gold':'err';
            const tabs=isSubmitted?[['score','Рецензия','fa-star'],['docs','Документи','fa-paperclip'],['info','Информация','fa-info-circle']]:
                (isDeclined||isReplaced)?[['docs','Документи','fa-paperclip'],['info','Информация','fa-info-circle']]:
                isPending?[['score','Оценяване','fa-pen'],['docs','Документи','fa-paperclip'],['info','Информация','fa-info-circle']]:
                [['docs','Документи','fa-paperclip'],['info','Информация','fa-info-circle']];

            return e('div',{key:a.formId,className:'rv-card rv-card-'+statusKey+(isExpanded?' expanded':'')},

                /* ── card header ── */
                e('div',{className:'rv-card-head',onClick:()=>setExpandedId(isExpanded?null:a.formId),role:'button','aria-expanded':isExpanded},
                    e('i',{className:'fas fa-chevron-right rv-chevron'}),

                    /* project title + meta */
                    e('div',{className:'rv-card-info'},
                        e('div',{className:'rv-card-title',title:proj.title||a.formTitle||a.formId},proj.title||a.formTitle||('Проект '+a.formId)),
                        e('div',{className:'rv-card-meta'},
                            (a.competitionName||a.competitionId)&&e('span',{className:'rv-meta-tag rv-meta-comp'},
                                e('i',{className:'fas fa-trophy'}),a.competitionName||a.competitionId
                            ),
                            proj.applicant&&e('span',{className:'rv-meta-tag'},e('i',{className:'fas fa-user'}),proj.applicant),
                            proj.area&&e('span',{className:'rv-meta-tag'},e('i',{className:'fas fa-map-marker-alt'}),(function(){var pa=getAreas(proj.area||'');return pa.length>0?pa.join(', '):proj.area;})()),
                            proj.projectType&&e('span',{className:'rv-meta-tag rv-meta-type'},e('i',{className:'fas fa-layer-group'}),proj.projectType),
                            a.assigned&&e('span',{className:'rv-meta-tag rv-meta-date'},e('i',{className:'fas fa-calendar-alt'}),a.assigned),
                            isPending&&a.assigned&&(()=>{const dl=getReviewDeadline(a);if(!dl||dl.daysLeft===null)return null;const isAwaitingConsent=(a.reviewStatus||'')!=='consented';return e('span',{className:'rv-meta-tag',title:dl.basedOn==='consent'?'Срок: 10 дни от датата на съгласие':isAwaitingConsent?'Часовникът тръгва след приемане на поканата':'',style:{color:dl.isOverdue?'var(--err)':dl.daysLeft<=2?'var(--warn)':'var(--ink-4)',fontWeight:dl.daysLeft<=2?600:400,opacity:isAwaitingConsent?.55:1}},e('i',{className:'fas fa-hourglass-half',style:{fontSize:'.58rem'}}),isAwaitingConsent?'~ '+dl.label:dl.label)})()
                        )
                    ),

                    /* right cluster: ring + badge */
                    e('div',{className:'rv-card-aside'},
                        isSubmitted&&savedTotal>0?e('div',{className:'rv-ring-wrap'},
                            e('svg',{className:'rv-ring-svg',viewBox:'0 0 46 46'},
                                e('circle',{cx:'23',cy:'23',r:'19',fill:'none',stroke:'var(--bg-2)',strokeWidth:'4'}),
                                e('circle',{cx:'23',cy:'23',r:'19',fill:'none',className:'rv-ring-fill rv-ring-'+gradeCss,strokeWidth:'4',strokeLinecap:'round',strokeDasharray:(savedPct*1.194)+' 119.4'})
                            ),
                            e('div',{className:'rv-ring-val rv-ring-val-'+gradeCss},savedTotal)
                        ):
                        isPending?e('div',{className:'rv-pending-ring rv-pending-ring-'+(isAwaitingConsent?'invite':'reviewing')},
                            e('i',{className:'fas '+(isAwaitingConsent?'fa-envelope':'fa-pen')})
                        ):null,
                        e('span',{className:'rv-status-badge rv-status-'+statusKey},
                            e('i',{className:'fas '+statusIcon}),statusText
                        )
                    )
                ),

                /* ── expanded body ── */
                isExpanded&&e('div',{className:'rv-card-body'},

                    /* ─── project-not-found warning ─── */
                    !hasProjectData&&e('div',{className:'rv-no-project'},
                        e('i',{className:'fas fa-exclamation-triangle rv-no-project-icon'}),
                        e('div',null,
                            e('div',{className:'rv-no-project-title'},'Данните за проекта не са заредени'),
                            e('div',{className:'rv-no-project-text'},'ID: ',e('code',{style:{background:'var(--bg-2)',padding:'.1em .35em',borderRadius:'3px',fontSize:'.8em'}},a.formId),'. Свържете се с администратора.')
                        )
                    ),

                /* ─── replaced notice ─── */
                    isReplaced&&e('div',{className:'rv-replaced-notice'},
                        e('i',{className:'fas fa-rotate rv-replaced-icon'}),
                        e('div',null,
                            e('div',{className:'rv-replaced-title'},'Назначението е преразпределено'),
                            e('div',{className:'rv-replaced-text'},'Заменен сте от друг рецензент. Документите остават достъпни за справка.')
                        )
                    ),

                /* ─── BPMN stage timeline (steps 19→20→22→23) ─── */
                    !isReplaced&&e('div',{className:'rv-stage-timeline rv-stage-'+stage.key},
                        [
                            {key:'invited',  label:'Поканен',     icon:'fa-envelope',         step:19},
                            {key:'consented',label:'Приета покана',icon:'fa-handshake',       step:20},
                            {key:'in_review',label:'В процес',    icon:'fa-pen-to-square',    step:22},
                            {key:'submitted',label:'Подадена',    icon:'fa-check-double',     step:23}
                        ].map(function(s,idx){
                            var stageOrder={invited:0,consented:1,in_review:2,submitted:3,declined:1,replaced:1};
                            var curIdx=stageOrder[stage.key]??0;
                            var done=idx<curIdx||(idx===curIdx&&isSubmitted);
                            var active=idx===curIdx&&!isDeclined;
                            return e('div',{key:s.key,className:'rv-stage-node'+(done?' done':'')+(active?' active':'')+(isDeclined&&idx>=1?' aborted':'')},
                                e('div',{className:'rv-stage-bullet'},
                                    e('i',{className:'fas '+(done?'fa-check':isDeclined&&idx>=1?'fa-times':s.icon)})
                                ),
                                e('div',{className:'rv-stage-meta'},
                                    e('div',{className:'rv-stage-step'},'BPMN '+s.step),
                                    e('div',{className:'rv-stage-label'},s.label)
                                ),
                                idx<3&&e('div',{className:'rv-stage-line'+(done?' done':'')})
                            );
                        })
                    ),

                /* ─── INVITATION BANNER (BPMN 20 — shown ONLY when awaiting consent) ─── */
                    isAwaitingConsent&&e('div',{className:'rv-invitation-banner'},
                        e('div',{className:'rv-inv-icon'},e('i',{className:'fas fa-handshake'})),
                        e('div',{className:'rv-inv-body'},
                            e('div',{className:'rv-inv-title'},'Покана за рецензия'),
                            e('div',{className:'rv-inv-text'},
                                'Преди да започнете оценяването, моля потвърдете участието си. ',
                                e('strong',null,'Срокът от 10 дни започва да тече от момента на потвърждение.'),
                                ' Можете да разгледате документите в раздел „Документи" преди решение.'
                            ),
                            e('label',{className:'rv-coi-check-row'},
                                e('input',{type:'checkbox',checked:!!(coiAccepted[a.formId]),
                                    onChange:function(ev){setCoiAccepted(function(p){var o=Object.assign({},p);o[a.formId]=ev.target.checked;return o})}}),
                                e('span',null,'Декларирам, че нямам конфликт на интереси (COI) по отношение на проекта ',
                                    e('sup',{style:{color:'var(--err)',fontWeight:700}},'*')
                                )
                            ),
                            e('div',{className:'rv-inv-actions'},
                                e('button',{className:'btn btn-primary rv-inv-accept',
                                    disabled:submitting===a.formId||!coiAccepted[a.formId],
                                    title:!coiAccepted[a.formId]?'Моля, декларирайте липсата на конфликт на интереси':'',
                                    onClick:function(){handleConsent(a.formId)}},
                                    submitting===a.formId
                                        ?e(Fragment,null,e('i',{className:'fas fa-spinner spin'}),' Потвърждаване…')
                                        :e(Fragment,null,e('i',{className:'fas fa-check'}),' Приемам поканата')
                                ),
                                invDeclineId===a.formId
                                ?e('div',{className:'rv-inv-decline-row'},
                                    e('input',{type:'text',className:'rv-decline-input',value:invDeclineReason,
                                        onChange:function(ev){setInvDeclineReason(ev.target.value)},
                                        placeholder:'Причина за отказ (мин. 10 символа)…',autoFocus:true,
                                        onKeyDown:function(ev){if(ev.key==='Enter')handleDeclineInvitation(a.formId);if(ev.key==='Escape'){setInvDeclineId(null);setInvDeclineReason('')}}}),
                                    e('button',{className:'btn btn-sm rv-decline-confirm',onClick:function(){handleDeclineInvitation(a.formId)},disabled:submitting===a.formId},
                                        submitting===a.formId?e('i',{className:'fas fa-spinner spin'}):'Откажи'),
                                    e('button',{className:'btn btn-outline btn-sm',onClick:function(){setInvDeclineId(null);setInvDeclineReason('')}},'Назад')
                                )
                                :e('button',{className:'btn btn-outline rv-inv-decline',onClick:function(){setInvDeclineId(a.formId)}},
                                    e('i',{className:'fas fa-times'}),' Откажи поканата'
                                )
                            )
                        )
                    ),

                    /* ─── CONSENT CONFIRMED BAR (BPMN 22 — shown after accept, with live deadline) ─── */
                    isInReview&&(()=>{
                        const dl=getReviewDeadline(a);
                        const showRed=dl.isOverdue;
                        const showWarn=!showRed&&dl.daysLeft!=null&&dl.daysLeft<=2;
                        return e('div',{className:'rv-consent-bar'+(showRed?' overdue':'')+(showWarn?' warn':'')},
                            e('i',{className:'fas fa-handshake rv-consent-icon'}),
                            e('div',{className:'rv-consent-text'},
                                e('strong',null,'Поканата е приета.'),
                                ' Срокът за подаване на рецензия е ',
                                e('span',{className:'rv-consent-dl'},dl.label||'10 дни'),
                                a.consentDate&&e('span',{className:'rv-consent-from'},' (от '+fmtDate(a.consentDate)+')')
                            )
                        );
                    })(),

                    /* tab navigation */
                    e('div',{className:'rv-tabs'},
                        tabs.map(function(t){
                            return e('button',{key:t[0],className:'rv-tab'+(tab===t[0]?' active':''),onClick:function(){setCardTab(function(p){var o={};for(var k in p)o[k]=p[k];o[a.formId]=t[0];return o})}},
                                e('i',{className:'fas '+t[2]}),t[1]
                            );
                        })
                    ),

                    /* ─── TAB: INFO ─── */
                    tab==='info'&&e('div',{className:'rv-tab-content'},
                        isDeclined&&parsed?.reason&&e('div',{className:'rv-decline-notice'},
                            e('div',{className:'rv-decline-icon'},e('i',{className:'fas fa-ban'})),
                            e('div',null,
                                e('div',{className:'rv-decline-title'},'Рецензията е отказана'),
                                e('div',{className:'rv-decline-reason'},e('strong',null,'Причина:'),' ',parsed.reason)
                            )
                        ),
                        renderProjectInfo(a)
                    ),

                    /* ─── TAB: DOCUMENTS ─── */
                    tab==='docs'&&e('div',{className:'rv-tab-content'},renderDocumentsPanel(a)),

                    /* ─── TAB: SCORE — PENDING (editable, only when consented) ─── */
                    tab==='score'&&isAwaitingConsent&&e('div',{className:'rv-tab-content'},
                        e('div',{className:'rv-must-consent'},
                            e('i',{className:'fas fa-lock rv-must-consent-icon'}),
                            e('div',null,
                                e('div',{className:'rv-must-consent-title'},'Първо приемете поканата'),
                                e('div',{className:'rv-must-consent-text'},'Достъп до критериите за оценяване и подаване на рецензия се отключва след приемане на поканата (BPMN стъпка 20). Превъртете нагоре за бутоните „Приемам" / „Откажи поканата".')
                            )
                        )
                    ),
                    tab==='score'&&isInReview&&e('div',{className:'rv-tab-content rv-score-tab'},

                        /* live score indicator */
                        e('div',{className:'rv-live-banner'+(getTotal(a.formId)>0?' has-score':'')},
                            e('div',{className:'rv-live-ring-wrap'},
                                e('svg',{className:'rv-live-ring-svg',viewBox:'0 0 54 54'},
                                    e('circle',{cx:'27',cy:'27',r:'22',fill:'none',stroke:'rgba(255,255,255,.15)',strokeWidth:'4'}),
                                    getTotal(a.formId)>0&&e('circle',{cx:'27',cy:'27',r:'22',fill:'none',stroke:'#fff',strokeWidth:'4',strokeLinecap:'round',
                                        strokeDasharray:(Math.round(getTotal(a.formId)/EVAL_MAX_SCORE*100)*1.382)+' 138.2'})
                                ),
                                e('div',{className:'rv-live-ring-val'},getTotal(a.formId)>0?getTotal(a.formId):'—')
                            ),
                            e('div',{className:'rv-live-info'},
                                e('div',{className:'rv-live-label'},'Текуща оценка'),
                                e('div',{className:'rv-live-score'},
                                    getTotal(a.formId)>0?e(Fragment,null,
                                        e('span',{className:'rv-live-num'},getTotal(a.formId)),
                                        e('span',{className:'rv-live-max'},' / ',EVAL_MAX_SCORE,' т.')
                                    ):e('span',{className:'rv-live-empty'},'Попълнете критериите')
                                )
                            ),
                            getTotal(a.formId)>0&&e('div',{className:'rv-live-progress-wrap'},
                                e('div',{className:'rv-live-progress'},
                                    e('div',{className:'rv-live-fill rv-fill-'+scoreGrade(getTotal(a.formId)),style:{width:Math.round(getTotal(a.formId)/EVAL_MAX_SCORE*100)+'%'}})
                                ),
                                e('div',{className:'rv-live-pct'},Math.round(getTotal(a.formId)/EVAL_MAX_SCORE*100),'%')
                            )
                        ),

                        /* rubric grid */
                        renderRubricGrid(a.formId,false,null),

                        /* ─ decision + comment + consent + actions card ─ */
                        e('div',{className:'rv-submission-card'},

                            /* recommendation */
                            e('div',{className:'rv-sub-section'},
                                e('div',{className:'rv-sub-label'},e('i',{className:'fas fa-thumbs-up'}),' Препоръка ',e('sup',{style:{color:'var(--err)'}}, '*')),
                                e('div',{className:'rv-decision-btns'},
                                    e('button',{type:'button',className:'rv-decision-btn rv-decision-approve'+(getRd(a.formId).recommendation==='approve'?' sel':''),onClick:function(){updateField(a.formId,'recommendation','approve')}},
                                        e('i',{className:'fas fa-thumbs-up'}),' Одобрявам'
                                    ),
                                    e('button',{type:'button',className:'rv-decision-btn rv-decision-reject'+(getRd(a.formId).recommendation==='reject'?' sel':''),onClick:function(){updateField(a.formId,'recommendation','reject')}},
                                        e('i',{className:'fas fa-thumbs-down'}),' Не одобрявам'
                                    )
                                )
                            ),

                            /* comment / review text */
                            e('div',{className:'rv-sub-section'},
                                e('div',{className:'rv-sub-label'},
                                    e('i',{className:'fas fa-align-left'}),' Коментар / Рецензия ',
                                    e('sup',{style:{color:'var(--err)'}}, '*')
                                ),
                                e('textarea',{className:'rv-comment-area',value:getRd(a.formId).comment||'',rows:6,
                                    placeholder:'Развийте мотиви, забележки и препоръки към проектното предложение…',
                                    onChange:function(ev){updateField(a.formId,'comment',ev.target.value)}
                                }),
                                e('div',{className:'rv-comment-footer'},
                                    draftSavedTs>0&&e('span',{className:'rv-draft-saved',title:'Черновата е записана локално в браузъра'},
                                        e('i',{className:'fas fa-check-circle'}),' Записана чернова'
                                    ),
                                    e('span',{className:'rv-char-count'+((!getRd(a.formId).comment||getRd(a.formId).comment.length<20)?' warn':'')},
                                        (getRd(a.formId).comment||'').length,' символа',(!getRd(a.formId).comment||getRd(a.formId).comment.length<20)?e('span',{style:{marginLeft:'.35rem',fontSize:'.65rem'}},' (мин. 20)'):'')
                                )
                            ),

                            /* consent + actions */
                            e('div',{className:'rv-sub-footer'},
                                e('label',{className:'rv-consent'},
                                    e('input',{type:'checkbox',className:'rv-consent-check',checked:!!getRd(a.formId).consent,onChange:function(ev){updateField(a.formId,'consent',ev.target.checked)}}),
                                    e('span',{className:'rv-consent-text'},'Потвърждавам верността на оценката и давам съгласие за подаване')
                                ),
                                e('div',{className:'rv-action-row'},
                                    declineId===a.formId
                                    ?e('div',{className:'rv-decline-inline'},
                                        e('input',{type:'text',className:'rv-decline-input',value:declineReason,
                                            onChange:function(ev){setDeclineReason(ev.target.value)},
                                            placeholder:'Причина за отказ…',autoFocus:true,
                                            onKeyDown:function(ev){if(ev.key==='Enter')handleDecline(a.formId);if(ev.key==='Escape'){setDeclineId(null);setDeclineReason('')}}}),
                                        e('button',{className:'btn btn-sm rv-decline-confirm',onClick:function(){handleDecline(a.formId)},disabled:submitting===a.formId},
                                            submitting===a.formId?e('i',{className:'fas fa-spinner spin'}):'Потвърди'
                                        ),
                                        e('button',{className:'btn btn-outline btn-sm',onClick:function(){setDeclineId(null);setDeclineReason('')}},'Отмени')
                                    )
                                    :e('button',{className:'btn btn-outline btn-sm rv-decline-btn',onClick:function(){setDeclineId(a.formId)}},
                                        e('i',{className:'fas fa-ban'}),' Откажи'
                                    ),
                                    e('button',{className:'btn btn-primary rv-submit-btn',onClick:function(){handleSubmitReview(a.formId)},disabled:submitting===a.formId},
                                        submitting===a.formId
                                        ?e(Fragment,null,e('i',{className:'fas fa-spinner spin'}),' Изпращане…')
                                        :e(Fragment,null,e('i',{className:'fas fa-paper-plane'}),' Изпрати рецензия')
                                    )
                                )
                            )
                        )
                    ),

                    /* ─── TAB: SCORE — SUBMITTED (read-only) ─── */
                    tab==='score'&&isSubmitted&&e('div',{className:'rv-tab-content rv-score-tab'},
                        e('div',{className:'rv-submitted-banner rv-submitted-'+gradeCss},
                            e('div',{className:'rv-sub-ring-wrap'},
                                e('svg',{className:'rv-sub-ring-svg',viewBox:'0 0 54 54'},
                                    e('circle',{cx:'27',cy:'27',r:'22',fill:'none',stroke:'rgba(0,0,0,.06)',strokeWidth:'5'}),
                                    e('circle',{cx:'27',cy:'27',r:'22',fill:'none',className:'rv-ring-fill rv-ring-'+gradeCss,strokeWidth:'5',strokeLinecap:'round',strokeDasharray:(savedPct*1.382)+' 138.2'})
                                ),
                                e('div',{className:'rv-sub-ring-val rv-ring-val-'+gradeCss},savedTotal)
                            ),
                            e('div',{className:'rv-sub-score-info'},
                                e('div',{className:'rv-sub-score-label'},'Финална оценка'),
                                e('div',{className:'rv-sub-score-val rv-ring-val-'+gradeCss},
                                    savedTotal,e('span',{className:'rv-sub-score-max'},' / ',EVAL_MAX_SCORE,' т.')
                                ),
                                a.submitted&&e('div',{className:'rv-sub-date'},
                                    e('i',{className:'fas fa-calendar-check'}),fmtDate(a.submitted)
                                )
                            ),
                            parsed?.recommendation&&e('div',{className:'rv-sub-rec rv-rec-'+(parsed.recommendation==='approve'?'ok':'err')},
                                e('i',{className:'fas '+(parsed.recommendation==='approve'?'fa-thumbs-up':'fa-thumbs-down')}),
                                parsed.recommendation==='approve'?'Одобрявам':'Не одобрявам'
                            )
                        ),
                        Object.keys(savedScores).length>0?renderRubricGrid(a.formId,true,savedScores):null,
                        parsed?.comment&&e('div',{className:'rv-comment-card'},
                            e('div',{className:'rv-comment-card-head'},
                                e('i',{className:'fas fa-comment-alt'}),'Рецензия / Коментар'
                            ),
                            e('div',{className:'rv-comment-body'},parsed.comment)
                        )
                    ),

                    /* ─── TAB: SCORE — DECLINED ─── */
                    tab==='score'&&isDeclined&&e('div',{className:'rv-tab-content'},
                        e('div',{className:'rv-decline-full'},
                            e('div',{className:'rv-decline-full-icon'},e('i',{className:'fas fa-ban'})),
                            e('div',{className:'rv-decline-full-body'},
                                e('div',{className:'rv-decline-title'},'Рецензията е отказана'),
                                parsed?.reason
                                    ?e('div',{className:'rv-decline-reason'},e('strong',null,'Причина:'),' ',parsed.reason)
                                    :e('div',{className:'rv-decline-noreason'},'Не е посочена причина.')
                            )
                        )
                    )
                )
            );
        })
    )
);

};

// ============================================================
//  PROJECTS VIEW  — Active project management
// ============================================================
