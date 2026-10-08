/* ─── COMPETITION FORM COMPONENT ─── */
var CALL_TYPE_OPTIONS=[{v:'',l:'— изберете —'},{v:'open',l:'Открит'},{v:'target',l:'Целеви'},{v:'special',l:'Специален'},{v:'internal',l:'Вътрешен'},{v:'international',l:'Международен'}];
// Pre-built lookup map from CALL_TYPE_OPTIONS (avoids recreating inline per row)
var CALL_TYPE_MAP={};
CALL_TYPE_OPTIONS.forEach(function(o){if(o.v)CALL_TYPE_MAP[o.v]=o.l;});
var CompetitionForm=({initialData,onSubmit,isLoading,submitRef,hideButton})=>{
const[form,setForm]=useState({mode:'create',name:'',deadline:'',description:'',status:'active',callType:'',year:String(new Date().getFullYear()),openDate:'',directions:'',evalCriteria:'',budgetByDirection:'',templates:'',...initialData});
const[errors,setErrors]=useState({});
// Stable refs so the parent can call validateAndSubmit without a render-lag race.
// Unlike the previous useEffect-sync pattern (which always read one render behind),
// these are written synchronously during render — always current by the time the
// parent calls submitRef.current() in an event handler.
const formRef=useRef(form);formRef.current=form;
const onSubmitRef=useRef(onSubmit);onSubmitRef.current=onSubmit;
const handleChange=useCallback(ev=>{const{name,value}=ev.target;setForm(p=>({...p,[name]:value}));if(errors[name])setErrors(p=>{const n={...p};delete n[name];return n})},[errors]);
const validateAndSubmit=useCallback(()=>{
    const f=formRef.current;
    const errs={};
    if(!f.name||!f.name.trim())errs.name='Име е задължително';
    if(!f.deadline)errs.deadline='Крайна дата е задължителна';
    else{const now=new Date();now.setHours(0,0,0,0);const dlDate=new Date(f.deadline+'T00:00:00');if(isNaN(dlDate.getTime()))errs.deadline='Невалидна дата';else if(dlDate<now&&f.mode==='create')errs.deadline='Крайната дата трябва да е днес или в бъдещето'}
    setErrors(errs);
    if(Object.keys(errs).length===0&&onSubmitRef.current){onSubmitRef.current({name:f.name.trim(),deadline:f.deadline,description:(f.description||'').trim(),status:f.status,callType:f.callType||'',year:f.year||'',openDate:f.openDate||'',directions:(f.directions||'').trim(),evalCriteria:(f.evalCriteria||'').trim(),budgetByDirection:(f.budgetByDirection||'').trim(),templates:(f.templates||'').trim(),...(f.id?{id:f.id}:{})})}
},[]);
useEffect(()=>{if(submitRef)submitRef.current=validateAndSubmit},[submitRef,validateAndSubmit]);
return e('div',null,
    e('div',{className:'form-section'},
    e('div',{className:'form-section-title'},e('i',{className:'fas fa-trophy'}),'\u00a0Основна информация'),
    e('div',{className:'form-field'+(errors.name?' error':'')},
        e('label',null,'Наименование на конкурса'),
        e('input',{type:'text',name:'name',value:form.name,onChange:handleChange,placeholder:'Наименование на конкурса',disabled:isLoading,autoFocus:form.mode==='create',style:{fontSize:'.95rem',padding:'.75rem 1.05rem'}}),
        errors.name&&e('div',{className:'field-error'},e('i',{className:'fas fa-exclamation-circle'}),' ',errors.name)
    ),
    e('div',{className:'form-layout-grid'},
        e('div',{className:'form-field'},
        e('label',null,'Вид конкурс'),
        e('select',{name:'callType',value:form.callType||'',onChange:handleChange,disabled:isLoading},
            CALL_TYPE_OPTIONS.map(o=>e('option',{key:o.v,value:o.v},o.l))
        )
        ),
        e('div',{className:'form-field'},
        e('label',null,'Година'),
        e('input',{type:'number',name:'year',value:form.year||'',onChange:handleChange,min:'2000',max:'2100',placeholder:String(new Date().getFullYear()),disabled:isLoading})
        )
    )
    ),
    e('div',{className:'form-section'},
    e('div',{className:'form-section-title'},e('i',{className:'fas fa-calendar-alt'}),'\u00a0Срокове'),
    e('div',{className:'form-layout-grid'},
        e('div',{className:'form-field'},
        e('label',null,'Дата на обявяване'),
        e('input',{type:'date',name:'openDate',value:form.openDate||'',onChange:handleChange,disabled:isLoading})
        ),
        e('div',{className:'form-field'+(errors.deadline?' error':'')},
        e('label',null,'Краен срок за кандидатстване'),
        e('input',{type:'date',name:'deadline',value:form.deadline,onChange:handleChange,disabled:isLoading}),
        errors.deadline&&e('div',{className:'field-error'},e('i',{className:'fas fa-exclamation-circle'}),' ',errors.deadline)
        )
    )
    ),
    e('div',{className:'form-section'},
    e('div',{className:'form-section-title'},e('i',{className:'fas fa-align-left'}),'\u00a0Описание и приоритети'),
    e('div',{className:'form-field'},
        e('label',null,'Описание'),
        e('textarea',{name:'description',value:form.description||'',onChange:handleChange,placeholder:'Описание на конкурса (по избор)',disabled:isLoading,rows:4})
    ),
    e('div',{className:'form-field'},
        e('label',null,'Приоритетни направления',e('span',{style:{fontWeight:'normal',color:'var(--ink-4)',marginLeft:'.4rem',fontSize:'.75rem'}},'(разделете с точка и запетая)')),
        e('textarea',{name:'directions',value:form.directions||'',onChange:handleChange,placeholder:'напр. ИКТ; Биомедицина; Енергетика',disabled:isLoading,rows:3})
    )
    ),
    e('div',{className:'form-section'},
    e('div',{className:'form-section-title'},e('i',{className:'fas fa-clipboard-check'}),'\u00a0Оценяване и финансиране'),
    e('div',{className:'form-field'},
        e('label',null,'Критерии за оценяване'),
        e('textarea',{name:'evalCriteria',value:form.evalCriteria||'',onChange:handleChange,placeholder:'Опишете критериите за оценка',disabled:isLoading,rows:4})
    ),
    e('div',{className:'form-layout-grid'},
        e('div',{className:'form-field'},
        e('label',null,'Бюджет по направления',e('span',{style:{fontWeight:'normal',color:'var(--ink-4)',marginLeft:'.4rem',fontSize:'.75rem'}},'(€, по направление)')),
        e('textarea',{name:'budgetByDirection',value:form.budgetByDirection||'',onChange:handleChange,placeholder:'напр. ИКТ: 50000; Биомедицина: 80000',disabled:isLoading,rows:3})
        ),
        e('div',{className:'form-field'},
        e('label',null,'Шаблони / необходими документи'),
        e('textarea',{name:'templates',value:form.templates||'',onChange:handleChange,placeholder:'Списък на изискваните шаблони или документи',disabled:isLoading,rows:3})
        )
    )
    ),
    form.mode==='edit'&&e('div',{className:'form-section'},
    e('div',{className:'form-section-title'},e('i',{className:'fas fa-tag'}),'\u00a0Статус на конкурса'),
    e('div',{className:'form-field',style:{maxWidth:'320px'}},
        e('label',null,'Статус'),
        e('select',{name:'status',value:form.status,onChange:handleChange,disabled:isLoading},
        e('option',{value:'active'},'Активен'),
        e('option',{value:'closed'},'Затворен'),
        e('option',{value:'results_published'},'Публикуван'),
        e('option',{value:'draft'},'Чернова'),
        e('option',{value:'archived'},'Архивиран')
        )
    )
    ),
    !hideButton&&e('div',{style:{display:'flex',gap:'.6rem',marginTop:'1.3rem'}},
    e('button',{className:'btn btn-primary',onClick:validateAndSubmit,disabled:isLoading,style:{flex:1}},isLoading?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-check'}),' Запази')
    )
);
};

/* ─── CREATE COMPETITION MODAL ─── */
var CreateCompetitionModal=({onClose,onSuccess,isAdmin})=>{
const{closing:ccClosing,close:ccClose}=useModalClose(onClose);
const formSubmitRef=useRef(null);
// Synchronous ref writes during render — no one-render lag from useEffect
const onCloseRef=useRef(onClose);onCloseRef.current=onClose;
const onSuccessRef=useRef(onSuccess);onSuccessRef.current=onSuccess;
const handleCreate=useCallback((data)=>{
    onCloseRef.current&&onCloseRef.current();
    toast('Създаване на конкурс…','info',2000);
    const payload={...(_adminCreds||{}),name:data.name,deadline:data.deadline,description:data.description,status:data.status||'active',callType:data.callType||'',year:data.year||'',openDate:data.openDate||'',directions:data.directions||'',evalCriteria:data.evalCriteria||'',budgetByDirection:data.budgetByDirection||'',templates:data.templates||'',isAdmin:true};
    createCompetitionWithFallback(payload).then(res=>{
    if(res.success){
        toast('Конкурсът „'+data.name+'" е създаден успешно.','success',4000);
        clearApiCache();
        try{onSuccessRef.current&&onSuccessRef.current(res.data)}catch(_){}
    }else{toast(res.error||'Грешка при създаване','error')}
    }).catch(err=>toast(err.message||'Сървърна грешка','error'));
},[]);
const triggerSubmit=useCallback(()=>{if(formSubmitRef.current)formSubmitRef.current()},[]);
return _portal(e('div',{className:'modal-overlay'+(ccClosing?' modal-closing':''),onClick:ccClose,role:'dialog','aria-modal':'true'},
    e('div',{className:'modal-box form-modal modal-form'+(ccClosing?' modal-closing':''),onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head'},e('h3',null,e('i',{className:'fas fa-plus-circle'}),' Създай нов конкурс'),e('button',{type:'button',className:'close-btn',onClick:ccClose},e('i',{className:'fas fa-times'}))),
        e('div',{className:'modal-body'},
            e(CompetitionForm,{initialData:{mode:'create'},onSubmit:handleCreate,isLoading:false,submitRef:formSubmitRef,hideButton:true})
        ),
        e('div',{className:'modal-footer'},
            e('button',{type:'button',className:'btn btn-outline',onClick:ccClose},'Отказ'),
            e('button',{type:'button',className:'btn btn-primary',onClick:triggerSubmit},e('i',{className:'fas fa-plus'}),' Създай конкурс')
        )
    )
));
};

/* ─── EDIT COMPETITION MODAL ─── */
var EditCompetitionModal=({competition,onClose,onSuccess})=>{
const{closing:ecClosing,close:ecClose}=useModalClose(onClose);
const[isLoading,setIsLoading]=useState(false);
const[error,setError]=useState('');
const formSubmitRef=useRef(null);
const mountedRef=useRef(true);
const onCloseRef=useRef(onClose);onCloseRef.current=onClose;
const onSuccessRef=useRef(onSuccess);onSuccessRef.current=onSuccess;
const compRef=useRef(competition);compRef.current=competition;
useEffect(()=>()=>{mountedRef.current=false},[]);
const handleEdit=useCallback(async(data)=>{
    const payload={...(_adminCreds||{}),id:compRef.current.id,name:data.name,deadline:data.deadline,description:data.description,status:data.status,callType:data.callType||'',year:data.year||'',openDate:data.openDate||'',directions:data.directions||'',evalCriteria:data.evalCriteria||'',budgetByDirection:data.budgetByDirection||'',templates:data.templates||'',isAdmin:true};
    onCloseRef.current&&onCloseRef.current();
    toast('Обновяване на конкурс…','info',2000);
    api('editcompetition',payload).then(res=>{
        if(res.success){
            toast('Конкурсът е обновен успешно.','success',3000);
            clearApiCache();
            try{onSuccessRef.current&&onSuccessRef.current(res.data)}catch(_){}
        }else{toast(res.error||'Грешка при обновяване','error')}
    }).catch(err=>toast(err.message||'Сървърна грешка','error'));
},[]);
const triggerSubmit=useCallback(()=>{if(formSubmitRef.current)formSubmitRef.current()},[]);
return _portal(e('div',{className:'modal-overlay'+(ecClosing?' modal-closing':''),onClick:isLoading?undefined:ecClose,role:'dialog','aria-modal':'true'},
    e('div',{className:'modal-box form-modal modal-form'+(ecClosing?' modal-closing':''),onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head'},e('h3',null,e('i',{className:'fas fa-edit'}),' Редактирай конкурс'),e('button',{type:'button',className:'close-btn',onClick:isLoading?undefined:ecClose,disabled:isLoading},e('i',{className:'fas fa-times'}))),
        e('div',{className:'modal-body'},
            error&&e('div',{style:{background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',padding:'.7rem',marginBottom:'.85rem',fontSize:'.78rem',color:'var(--err)',display:'flex',alignItems:'center',gap:'.4rem'}},e('i',{className:'fas fa-exclamation-triangle'}),' ',error),
            e(CompetitionForm,{initialData:{mode:'edit',id:competition.id,name:competition.name,deadline:competition.deadline||competition.dateEnd,description:competition.description||'',status:competition.status||'active',callType:competition.callType||'',year:competition.year||'',openDate:competition.openDate||'',directions:competition.directions||'',evalCriteria:competition.evalCriteria||'',budgetByDirection:competition.budgetByDirection||'',templates:competition.templates||''},onSubmit:handleEdit,isLoading,submitRef:formSubmitRef,hideButton:true})
        ),
        e('div',{className:'modal-footer'},
            e('button',{type:'button',className:'btn btn-outline',onClick:ecClose,disabled:isLoading},'Отказ'),
            e('button',{type:'button',className:'btn btn-primary',onClick:triggerSubmit,disabled:isLoading},isLoading?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-check'}),' Запази промените')
        )
    )
));
};

/* ─── COMPETITION MANAGEMENT PANEL (Admin) ─── */
var CompetitionManagementPanel=({competitions,onRefresh,isLoading,onOpenCompetition,onPatchCompetitions})=>{
const[showCreateModal,setShowCreateModal]=useState(false);
const[showEditModal,setShowEditModal]=useState(false);
const[selectedComp,setSelectedComp]=useState(null);
const[searchTerm,setSearchTerm]=useState('');
const deferredSearch=useDeferredValue(searchTerm);
const[statusFilter,setStatusFilter]=useState('all');
const[deleteConfirm,setDeleteConfirm]=useState(null);
const[checkingCompliance,setCheckingCompliance]=useState(false);

const handleFullComplianceCheck=async()=>{
    setCheckingCompliance(true);
    try{
        const res=await api('performfullcompliancecheck',{...(_adminCreds||{}),isAdmin:true});
        if(res.success){
            const findings=res.findings||res.results||[];
            toast('Пълна регулаторна проверка приключи: '+findings.length+' находки.','info',6000);
        }else{toast(res.error||'Грешка при пълна проверка','error')}
    }catch(err){toast(err.message,'error')}finally{setCheckingCompliance(false)}
};

const filtered=useMemo(()=>{
    let list=[...competitions];
    if(statusFilter!=='all')list=list.filter(c=>c.status===statusFilter);
    const q=deferredSearch.trim().toLowerCase();
    if(q)list=list.filter(c=>c.name.toLowerCase().includes(q)||(c.description||'').toLowerCase().includes(q));
    return list.sort((a,b)=>new Date(b.created||0)-new Date(a.created||0));
},[competitions,statusFilter,deferredSearch]);

const handleArchive=async(comp)=>{
    // Optimistic: mark archived immediately; rollback on failure
    if(onPatchCompetitions)onPatchCompetitions(prev=>prev.map(c=>c.id===comp.id?{...c,status:'archived'}:c));
    setDeleteConfirm(null);
    try{
    const res=await api('archivecompetition',{...(_adminCreds||{}),id:comp.id,isAdmin:true});
    if(res.success){
        toast('Конкурсът е архивиран.','success');
        onRefresh();
    }else{
        if(onPatchCompetitions)onPatchCompetitions(prev=>prev.map(c=>c.id===comp.id?{...c,status:comp.status}:c));
        toast(res.error||'Грешка при архивиране','error');
    }
    }catch(err){
    if(onPatchCompetitions)onPatchCompetitions(prev=>prev.map(c=>c.id===comp.id?{...c,status:comp.status}:c));
    toast(err.message,'error');
    }
};
var _STATUS_BADGE_CLASS={active:'badge submitted',closed:'badge draft',results_approved_by_ac:'badge admin_passed',results_published:'badge reviewed',archived:'badge returned'};
var _STATUS_LABEL={active:'Активен',closed:'Затворен',results_approved_by_ac:'Прието от АС',results_published:'Публикуван',archived:'Архивиран',draft:'Чернова'};
const statusBadgeClass=status=>_STATUS_BADGE_CLASS[status]||'badge';
const statusLabel=status=>_STATUS_LABEL[status]||status;

return e('div',null,
    e('div',{className:'page-top',style:{marginBottom:'1.5rem'}},
    e('div',{className:'page-top-left'},
        e('h2',null,'Управление на конкурси'),
        e('p',null,'Създаване, редактиране и администриране на конкурсни сесии')
    ),
    e('div',{className:'page-top-actions'},
        e('div',{className:'search-wrap'},e('i',{className:'fas fa-search'}),e('input',{className:'search-input',placeholder:'Търсете конкурси...',value:searchTerm,onChange:ev=>setSearchTerm(ev.target.value)})),
        e('div',{className:'filter-bar'},
                [{v:'all',l:'Всички'},{v:'active',l:'Активни'},{v:'closed',l:'Затворени'},{v:'results_published',l:'Публикувани'},{v:'draft',l:'Чернови'},{v:'archived',l:'Архивирани'}].map(opt=>e('button',{type:'button',key:opt.v,className:'chip'+(statusFilter===opt.v?' active':''),onClick:()=>setStatusFilter(opt.v)},opt.l))
                ),
                e(RefreshButton,{loading:isLoading,onClick:onRefresh}),
                e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:handleFullComplianceCheck,disabled:checkingCompliance,title:'Пълна регулаторна проверка на всички конкурси и предложения'},
                    checkingCompliance?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-shield-check',style:{color:'var(--gold)'}}),' Пълен одит'),
                e('button',{type:'button',className:'btn btn-primary',onClick:()=>setShowCreateModal(true)},e('i',{className:'fas fa-plus'}),' Нов конкурс')
    )
    ),
    filtered.length===0
    ?e('div',{className:'card'},
        e('div',{className:'card-body'},
        e('div',{className:'empty-state'},
            e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-inbox'})),
            e('h4',null,'Няма конкурси'),
            e('p',null,searchTerm||statusFilter!=='all'?'Коригирайте критериите за търсене.':'Щракнете на \"Нов конкурс\" за да създадете един.')
        )
        )
        )
    :e('div',{className:'card'},
        e('div',{className:'card-header'},
        e('h3',{className:'card-title'},e('i',{className:'fas fa-trophy',style:{color:'var(--gold)',marginRight:'.45rem'}}),'Конкурси'),
        e('span',{className:'count-chip'},filtered.length+(competitions.length!==filtered.length?' / '+competitions.length:''))
        ),
        e('div',{className:'table-wrap'},
        e('table',null,
            e('thead',null,e('tr',null,
            e('th',null,'Конкурс'),
            e('th',null,'Вид'),
            e('th',null,'Период'),
            e('th',null,'Статус'),
            e('th',{style:{textAlign:'right'}},'Действия')
            )),
            e('tbody',null,filtered.map(comp=>{
            const dlRaw=comp.deadline||comp.dateEnd||'';
            const dlParsed=dlRaw?new Date(/^\d{4}-\d{2}-\d{2}$/.test(dlRaw)?dlRaw+'T00:00:00':dlRaw):null;
            const daysLeft=dlParsed&&!isNaN(dlParsed.getTime())?Math.ceil((dlParsed-new Date())/86400000):null;
            const dlUrgency=daysLeft===null?'':daysLeft<=0?'expired':daysLeft<=7?'urgent':daysLeft<=30?'soon':'ok';
            return e('tr',{key:comp.id},
                e('td',{'data-label':'Конкурс'},
                e('div',{style:{fontWeight:700,color:'var(--ink)',marginBottom:'.15rem'}},comp.name),
                comp.year&&e('span',{className:'type-tag',style:{fontSize:'.63rem'}},comp.year)
                ),
                e('td',{'data-label':'Вид'},comp.callType?e('span',{className:'type-tag'},CALL_TYPE_MAP[comp.callType]||comp.callType):e('span',{style:{color:'var(--ink-5)'}},'—')),
                e('td',{'data-label':'Период'},
                e('div',{className:'comp-period-cell'},
                    comp.openDate&&e('div',{className:'comp-date-row comp-date-open'},e('i',{className:'fas fa-calendar-check'}),fmtDate(comp.openDate)),
                    e('div',{className:'comp-date-row comp-date-deadline'+(dlUrgency?' '+dlUrgency:'')},
                    e('i',{className:'fas fa-calendar-times'}),fmtDate(dlRaw||'—'),
                    daysLeft!==null&&comp.status==='active'&&e('span',{className:'days-badge '+dlUrgency},daysLeft<=0?'Изтекъл':daysLeft+' дни')
                    )
                )
                ),
                e('td',{'data-label':'Статус'},e('span',{className:statusBadgeClass(comp.status)},statusLabel(comp.status))),
                e('td',null,e(ActionDropdown,{items:[
                    {label:'Отвори',action:()=>onOpenCompetition&&onOpenCompetition(comp)},
                    {label:'Редактирай',action:()=>{setSelectedComp(comp);setShowEditModal(true)}},
                    // ── BPMN Process 1 (Gap Closure 2026-05-04) ──
                    (comp.status==='configured'||comp.status==='draft')&&{
                        label:'🏛 Одобрение от АС',
                        action:()=>{
                            const minutes=window.prompt('Линк към протокол на Академичния съвет (по желание):','')||'';
                            if(minutes===null) return;
                            api('approvecompetitionbyac',{...(_adminCreds||{}),competitionId:comp.id,minutesUrl:minutes.trim()}).then(res=>{
                                if(res&&res.success){toast('Конкурсът е одобрен от Академичния съвет.','success');clearApiCache();onRefresh()}
                                else toast((res&&res.error)||'Грешка при одобрение','error');
                            }).catch(err=>toast(err.message||'Сървърна грешка','error'));
                        }
                    },
                    comp.status==='approved_by_ac'&&{
                        label:'📜 Издай заповед на Ректора',
                        action:()=>{
                            const num=window.prompt('Номер на заповедта на Ректора:','');
                            if(num===null||!String(num).trim()){toast('Номерът е задължителен.','warn');return;}
                            const dt=window.prompt('Дата на заповедта (YYYY-MM-DD):',new Date().toISOString().slice(0,10))||'';
                            api('issuerectororder',{...(_adminCreds||{}),competitionId:comp.id,orderNumber:String(num).trim(),orderDate:dt.trim()}).then(res=>{
                                if(res&&res.success){toast('Заповедта е регистрирана. Конкурсът е отворен.','success');clearApiCache();onRefresh()}
                                else toast((res&&res.error)||'Грешка','error');
                            }).catch(err=>toast(err.message||'Сървърна грешка','error'));
                        }
                    },
                    comp.status!=='archived'&&{separator:true},
                    comp.status!=='archived'&&{label:'Архивирай',action:()=>setDeleteConfirm(comp),danger:true},
                ].filter(Boolean)}))
            );
            }))
        )
        )
    ),
    showCreateModal&&e(CreateCompetitionModal,{onClose:()=>setShowCreateModal(false),onSuccess:()=>onRefresh(),isAdmin:true}),
    selectedComp&&showEditModal&&e(EditCompetitionModal,{competition:selectedComp,onClose:()=>{setShowEditModal(false);setSelectedComp(null)},onSuccess:()=>onRefresh()}),
    deleteConfirm&&e(ConfirmModal,{
        message:'Сигурни ли сте, че искате да архивирате конкурса "'+deleteConfirm.name+'"? Ще можете да го възстановите по-късно.',
        confirmLabel:e(Fragment,null,e('i',{className:'fas fa-archive'}),' Архивирай'),
        dangerous:true,
        onConfirm:()=>handleArchive(deleteConfirm),
        onCancel:()=>setDeleteConfirm(null)
    })
);
};

/* ─── COMPETITION VIEW ─── */
/* ── v12.32.35-templates: Admin Competition Template Library (real component —
      hooks must NOT run inside a conditional IIFE; Rules of Hooks) ── */
var CompetitionTemplateLibrary=({userEmail})=>{
      const _TEMPLATES_FOLDERS=[
        '1 ФНИ','2 ПНИ','3 ДНП','4 НПФ','5 Вътрешнонормативни документи','10 Бюджет','20 Предложения от ChatGPT','Библиотека'
      ];
      const _projTypeByFolder=f=>{
        if(/ФНИ/.test(f))return 'ФНИ';
        if(/ПНИ/.test(f))return 'ПНИ';
        if(/ДНП/.test(f))return 'ДНП';
        if(/НПФ/.test(f))return 'НПФ';
        if(/Бюджет/.test(f))return 'Бюджет';
        if(/нормативни/.test(f))return 'Нормативни';
        if(/ChatGPT/.test(f))return 'Предложения';
        return 'Библиотека';
      };
      const [tmplLoading,setTmplLoading]=useState(true);
      const [tmplDocs,setTmplDocs]=useState([]);
      const [tmplGrouped,setTmplGrouped]=useState({});
      const [activeFolder,setActiveFolder]=useState(_TEMPLATES_FOLDERS[0]);
      const [previewDoc,setPreviewDoc]=useState(null);
      const [uploading,setUploading]=useState(false);
      const [copiedNote,setCopiedNote]=useState('');
      const fileRef=useRef(null);
      const _allDocsRef=useRef([]);
      const _loadTmpl=useCallback(async()=>{
        setTmplLoading(true);
        try{
          const res=await api('listdocuments',{...(_adminCreds||{}),isAdmin:true});
          const docs=(res&&res.success&&(res.documents||res.data||[]))||[];
          _allDocsRef.current=docs;
          const grouped={};
          _TEMPLATES_FOLDERS.forEach(f=>{grouped[f]=[];});
          grouped['Библиотека']=grouped['Библиотека']||[];
          docs.forEach(d=>{
            const folder=d.folder_name||d.folderName||'Библиотека';
            if(!grouped[folder])grouped[folder]=[];
            (grouped[folder]||grouped['Библиотека']).push(d);
          });
          setTmplDocs(docs);
          setTmplGrouped(grouped);
        }catch(_){}finally{setTmplLoading(false);}
      },[]);
      useEffect(()=>{_loadTmpl();},[_loadTmpl]);
      const _driveTemplatesUrl='https://drive.google.com/drive/folders/1La1-EBnM2Tej6QqkDxQp1u4MF82ycd3K';
      const _openPreview=d=>{ setPreviewDoc(d); };
      const _createCopy=async(d)=>{
        setCopiedNote('');
        try{
          const res=await api('copydocforuser',{...(_adminCreds||{}),docId:d.id,userId:userEmail||(_adminCreds&&_adminCreds.username)||'',email:userEmail||(_adminCreds&&_adminCreds.username)||'',isAdmin:false});
          if(res&&res.success){
            setCopiedNote('Създадена е Ваша копия на „'+(d.name||'документ')+'“. Отворете я от „Моите документи“, за да я редактирате.');
            const f=res.file||{};
            setPreviewDoc({...d,id:f.id,driveId:f.driveId,previewLink:f.previewLink,content:f.content,hasContent:f.hasContent,name:f.name||d.name,fromCopy:true,copyId:f.id});
          }else{
            setCopiedNote(res&&res.error?('Грешка: '+res.error):'Неуспешно създаване на копие.');
          }
        }catch(err){setCopiedNote('Грешка: '+err.message);}
      };
      const _onUpload=async(ev)=>{
        const files=Array.from(ev.target.files||[]);
        if(!files.length)return;
        setUploading(true);
        try{
          const payload=files.map(f=>new Promise(resolve=>{
            const r=new FileReader();
            r.onload=()=>resolve({name:f.name,type:f.type,size:f.size,content:(r.result||'').split(',')[1]||''});
            r.readAsDataURL(f);
          }));
          const arr=await Promise.all(payload);
          const res=await api('uploadlibraryfile',{...(_adminCreds||{}),files:arr,folderName:activeFolder,isAdmin:true});
          if(res&&res.success){toast('Качени '+(res.files||[]).length+' шаблона.','success');_loadTmpl();}
          else toast(res&&res.error||'Качването не успя','error');
        }catch(err){toast(err.message,'error');}finally{setUploading(false);if(fileRef.current)fileRef.current.value='';}
      };
      const _docsForFolder=tmplGrouped[activeFolder]||[];
      const _projType=_projTypeByFolder(activeFolder);
      return e('div',{className:'card',style:{marginBottom:'1rem'}},
        e('div',{className:'card-header'},
          e('h3',{className:'card-title'},e('i',{className:'fas fa-layer-group',style:{color:'var(--primary)',marginRight:'.4rem'}}),'Шаблони на конкурса'),
          e('a',{href:_driveTemplatesUrl,target:'_blank',rel:'noopener',className:'btn btn-outline btn-sm',style:{marginLeft:'auto'}},e('i',{className:'fas fa-external-link-alt'}),' Оригинали в Drive')
        ),
        e('div',{className:'card-body'},
          tmplLoading?e('div',{style:{padding:'1rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-spinner spin'}),' Зареждане на шаблони…'):
          e(Fragment,null,
            e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',marginBottom:'.75rem'}},
              _TEMPLATES_FOLDERS.map(f=>e('button',{key:f,className:'btn btn-sm '+(f===activeFolder?'btn-primary':'btn-outline'),onClick:()=>setActiveFolder(f),style:{fontSize:'.72rem'}},
                f+' ('+((tmplGrouped[f]||[]).length)+')'))
            ),
            copiedNote&&e('div',{style:{fontSize:'.78rem',color:'var(--ok)',background:'var(--ok-bg)',border:'1px solid var(--ok-border)',padding:'.5rem .7rem',borderRadius:'var(--r-xs)',marginBottom:'.6rem'}},copiedNote),
            e('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'.6rem'}},
              _docsForFolder.length===0&&e('div',{style:{color:'var(--ink-4)',fontSize:'.82rem',padding:'.5rem'}},'Няма шаблони в тази група.'),
              _docsForFolder.map(d=>e('div',{key:d.id,className:'doc-tmpl-card',style:{border:'1px solid var(--border)',borderRadius:'var(--r-sm)',padding:'.7rem',background:'var(--surface)'}},
                e('div',{style:{fontWeight:600,fontSize:'.82rem',marginBottom:'.35rem',wordBreak:'break-word'}},e('i',{className:'fas fa-file-alt',style:{marginRight:'.35rem',color:'var(--ink-4)'}}),d.name||'документ'),
                e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginBottom:'.5rem'}},(d.mime_type||d.mimeType||'').split('/').pop()+' · '+(d.size?(typeof fmtBytes==='function'?fmtBytes(d.size):String(d.size)+' B'):'')),
                e('div',{style:{display:'flex',gap:'.35rem',flexWrap:'wrap'}},
                  e('button',{className:'btn btn-outline btn-sm',style:{fontSize:'.7rem'},onClick:()=>_openPreview(d)},e('i',{className:'fas fa-eye'}),' Преглед'),
                  e('button',{className:'btn btn-primary btn-sm',style:{fontSize:'.7rem'},onClick:()=>_createCopy(d)},e('i',{className:'fas fa-copy'}),' Създай копие')
                )
              ))
            ),
            e('div',{style:{marginTop:'.8rem',paddingTop:'.7rem',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'.6rem',flexWrap:'wrap'}},
              e('span',{style:{fontSize:'.75rem',color:'var(--ink-3)'}},'Качване на нов шаблон в „'+activeFolder+'“:'),
              e('button',{className:'btn btn-outline btn-sm',style:{fontSize:'.74rem'},onClick:()=>fileRef.current&&fileRef.current.click(),disabled:uploading},uploading?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-upload'}),' Качи файл'),
              e('input',{ref:fileRef,type:'file',multiple:true,style:{display:'none'},onChange:_onUpload})
            )
          )
        ),
        previewDoc&&typeof DocumentPreviewModal!=='undefined'&&e(DocumentPreviewModal,{doc:previewDoc,onClose:()=>setPreviewDoc(null),allowCopy:false,userEmail:userEmail})
      );
};
if(typeof window!=='undefined')window.CompetitionTemplateLibrary=CompetitionTemplateLibrary;

var CompetitionView=({isAdmin,initialCompId,onApply,userEmail})=>{
const[viewMode,setViewMode]=useState(isAdmin?'manage':'workflow');
// ── INSTANT PAINT: seed from COMPETITIONS global (populated at boot via SSR/prefetch/cache)
// so the management table renders immediately — no loading spinner on first open.
// Background refresh still runs and updates in-place when fresh data arrives.
const[competitions,setCompetitionsState]=useState(()=>{
    const seed=typeof COMPETITIONS!=='undefined'&&Array.isArray(COMPETITIONS)?[...COMPETITIONS]:[];
    return seed.map(c=>({id:c.id||'',name:c.name||'',dateEnd:c.dateEnd||c.deadline||'',deadline:c.deadline||c.dateEnd||'',status:c.status||'',created:c.created||'',description:c.description||'',folderId:c.folderId||'',callType:c.callType||'',year:c.year||'',openDate:c.openDate||'',directions:c.directions||'',evalCriteria:c.evalCriteria||'',budgetByDirection:c.budgetByDirection||'',templates:c.templates||''}));
});
const[competitionsLoading,setCompetitionsLoading]=useState(false); // start NOT loading — instant paint from seed above
const[selectedCompetition,setSelectedCompetition]=useState(initialCompId||'');
const[applications,setApplications]=useState([]);
const[appCounts,setAppCounts]=useState({total:0,draft:0,submitted:0,admin_passed:0,in_review:0,reviewed:0,approved:0,rejected:0,returned:0,contracted:0});
const[appsLoading,setAppsLoading]=useState(false);
const[showComplianceModal,setShowComplianceModal]=useState(false);
const[complianceData,setComplianceData]=useState([]);
const[checkingCompliance,setCheckingCompliance]=useState(false);
const[showAssignModal,setShowAssignModal]=useState(false);
const[assignData,setAssignData]=useState({formId:'',reviewers:[],manualEmail:''});
const[assignStep,setAssignStep]=useState(1); // 1=Избери проект, 2=Избери рецензенти, 3=Потвърди
const[assignSearch,setAssignSearch]=useState(''); // search/filter for reviewer pool
const[assigning,setAssigning]=useState(false);
const[showEvaluateModal,setShowEvaluateModal]=useState(false);
const[evaluateData,setEvaluateData]=useState([]);
const[evalScores,setEvalScores]=useState({});
const[evalExpanded,setEvalExpanded]=useState({});
const[evaluating,setEvaluating]=useState(false);
const[reviewerPool,setReviewerPool]=useState([]);
const[showContractModal,setShowContractModal]=useState(false);
const[contractData,setContractData]=useState([]);
const[generating,setGenerating]=useState(false);
const[passLoading,setPassLoading]=useState(false);
const[showCorrectionsModal,setShowCorrectionsModal]=useState(false);
const[publishingResults,setPublishingResults]=useState(false);
// ── Per-app inline transition state ──
// Tracks formIds whose status mutation is in-flight so the row buttons can show
// a spinner and lock to prevent double-submits. The reasonPrompt holds the
// state for the inline mini-modal that captures a free-text reason for
// transitions which require justification (return for correction, rejection).
const[txInFlight,setTxInFlight]=useState({}); // { [formId]: targetStatus }
const[reasonPrompt,setReasonPrompt]=useState(null); // { formId, target, label, color, icon, placeholder }
const[reasonText,setReasonText]=useState('');
const compSigRef=useRef('');
// Tracks whether the admin panel endpoint already populated competitions/applications/reviewers
// so subsequent individual loads can skip redundant renders.
const _panelLoadedRef=useRef(false);

/* ── Per-modal exit-animation closing flags ─────────────────────────────────
 *  Each inline modal gets its own closing flag so the slide-out animation plays
 *  before the modal unmounts. Pattern mirrors useModalClose without ESC binding. */
const[complianceClosing,setComplianceClosing]=useState(false);
const[assignClosing,setAssignClosing]=useState(false);
const[evaluateClosing,setEvaluateClosing]=useState(false);
const[contractClosing,setContractClosing]=useState(false);
const[correctionsClosing,setCorrectionsClosing]=useState(false);
const closeComplianceModal=useCallback(()=>{setComplianceClosing(true);setTimeout(()=>{setShowComplianceModal(false);setComplianceClosing(false)},180)},[]);
const closeAssignModal=useCallback(()=>{setAssignClosing(true);setTimeout(()=>{setShowAssignModal(false);setAssignClosing(false);setAssignStep(1);setAssignSearch('');setAssignData({formId:'',reviewers:[],manualEmail:''})},180)},[]);
const closeEvaluateModal=useCallback(()=>{setEvaluateClosing(true);setTimeout(()=>{setShowEvaluateModal(false);setEvaluateClosing(false)},180)},[]);
const closeContractModal=useCallback(()=>{setContractClosing(true);setTimeout(()=>{setShowContractModal(false);setContractClosing(false)},180)},[]);
const closeCorrectionsModal=useCallback(()=>{setCorrectionsClosing(true);setTimeout(()=>{setShowCorrectionsModal(false);setCorrectionsClosing(false)},180)},[]);

const loadApplications=useCallback(async(compId,forceRefresh=false)=>{
    const cid=compId||selectedCompetition;
    if(!cid)return;
    setAppsLoading(true);
    try{
    const payload={competitionId:cid,isAdmin:!!isAdmin,userId:userEmail||'',forceRefresh:!!forceRefresh};
    if(isAdmin&&_adminCreds)Object.assign(payload,_adminCreds);
    const res=await api('getapplicationsbycompetition',payload);
    if(res.success){
        setApplications(Array.isArray(res.applications)?res.applications:[]);
        setAppCounts(res.counts||{total:0});
    }else{setApplications([]);setAppCounts({total:0})}
    }catch(_){setApplications([]);setAppCounts({total:0})}finally{setAppsLoading(false)}
},[selectedCompetition,isAdmin,userEmail]);

// Stable ref so loadCompetitions reads the current competition without depending on it.
// Written synchronously during render — no one-render-lag from useEffect.
const selectedCompRef=useRef(selectedCompetition);selectedCompRef.current=selectedCompetition;

const[competitionsError,setCompetitionsError]=useState(null);

const loadCompetitions=useCallback(async(opts={})=>{
    // ── Skip when panel already populated everything (instant paint via COMPETITIONS seed) ──
    // Only the panel endpoint (getcompetitionpanel) carries the full competition shape
    // (callType, year, openDate, directions, evalCriteria, budgetByDirection, templates).
    // Individual getcompetitions responses omit those fields, so letting loadCompetitions
    // overwrite the panel-seeded state would SHRINK the objects and cause the table to
    // lose call-type/year/period columns. The panel always fires first (one-shot effect),
    // and when it succeeds the individual load is pure waste.
    if(_panelLoadedRef.current&&!opts.forceRefresh)return;
    // Also skip if we already have seeded data and the cache is still fresh
    if(!opts.forceRefresh&&compSigRef.current&&isCacheFresh(isAdmin?'getcompetitions':'getpubliccompetitions'))return;
    const authPayload={isAdmin:!!isAdmin,userId:(userEmail||'')};
    if(isAdmin&&_adminCreds)Object.assign(authPayload,_adminCreds);
    const silent=!!opts.silent;
    try{
    if(!silent)setCompetitionsLoading(true);
    setCompetitionsError(null);
    const comps=await refreshCompetitions(authPayload,{forceRefresh:!!opts.forceRefresh});
    const sig=competitionListSignature(comps);
    if(sig!==compSigRef.current){compSigRef.current=sig;setCompetitionsState([...comps])}
    const cur=selectedCompRef.current;
    if(comps.length>0&&!cur){setSelectedCompetition(comps[0].id)}
    else if(comps.length>0&&!comps.find(c=>c.id===cur)){setSelectedCompetition(comps[0].id)}
    }catch(err){
    setCompetitionsError(err.message||'Грешка при зареждане на конкурси');
    if(window.DEV_MODE)void 0;
    }finally{if(!silent)setCompetitionsLoading(false)}
},[isAdmin,userEmail]);
useEffect(()=>{loadCompetitions()},[loadCompetitions]);
// v12.17.3: react to real-time DB change events from version poller
useEffect(()=>{
    var handler=function(){loadCompetitions({silent:true,forceRefresh:true}).catch(()=>{});};
    window.addEventListener('erp:data-changed',handler);
    return()=>window.removeEventListener('erp:data-changed',handler);
},[loadCompetitions]);
// Background refresh handled by App — only do lightweight silent refresh when stale
useEffect(()=>{
    const pollMs=isAdmin?UI_REFRESH_INTERVALS.adminCompetitions:UI_REFRESH_INTERVALS.userCompetitions;
    const id=setInterval(()=>{if(isPageVisible()&&!_panelLoadedRef.current)loadCompetitions({silent:true}).catch(err=>console.warn('[bg-refresh:loadComps-poll]',err&&err.message||err))},pollMs);
    return()=>clearInterval(id);
},[loadCompetitions,isAdmin]);
useEffect(()=>{if(selectedCompetition&&!_panelLoadedRef.current)loadApplications(selectedCompetition)},[selectedCompetition,loadApplications]);
useEffect(()=>{if(initialCompId&&initialCompId!==selectedCompetition)setSelectedCompetition(initialCompId)},[initialCompId,selectedCompetition]);

// ── Admin fast-path: load competitions + applications + reviewer pool in ONE
// round-trip via getCompetitionPanel so the view paints fully on the first render
// without 3 sequential cold-start GAS executions.
const loadCompetitionPanel=useCallback(async(competitionId)=>{
    if(!isAdmin)return;
    const authPayload={isAdmin:true,userId:(userEmail||''),...(_adminCreds||{})};
    // Consume the admin-reviewers prefetch if it was fired during login.
    const prefetchedRevP=consumePrefetch('reviewers');
    // Consume competition panel prefetch if fired by tab-hover (app.js prefetchTab).
    const prefetchedPanelP=consumePrefetch('competitionPanel');
    try{
        const[panelRes,prefetchedRev,prefetchedPanel]=await Promise.all([
            // If we already have the panel response from hover-prefetch, use it;
            // otherwise fire the API call now.
            prefetchedPanelP||api('getcompetitionpanel',{...authPayload,competitionId:competitionId||''}),
            prefetchedRevP,
            Promise.resolve(null) // placeholder — keep the destructure stable
        ]);
        // Use whichever panel response resolved (prefetched or fresh)
        const panel=prefetchedPanel||panelRes;
        if(!panel||!panel.success)return;
        _panelLoadedRef.current=true;
        // Populate competitions
        const compsRes=panel.competitions;
        if(compsRes&&compsRes.success){
            const mapped=(compsRes.competitions||[]).map(c=>({id:c.id||'',name:c.name||'',dateEnd:c.dateEnd||c.deadline||'',deadline:c.deadline||c.dateEnd||'',status:c.status||'',created:c.created||'',description:c.description||'',folderId:c.folderId||'',callType:c.callType||'',year:c.year||'',openDate:c.openDate||'',directions:c.directions||'',evalCriteria:c.evalCriteria||'',budgetByDirection:c.budgetByDirection||'',templates:c.templates||''}));
            const sig=competitionListSignature(mapped);
            if(sig!==compSigRef.current){compSigRef.current=sig;setCompetitionsState([...mapped]);}
            if(!selectedCompRef.current&&mapped.length>0)setSelectedCompetition(mapped[0].id);
            setCompetitionsLoading(false);
        }
        // Populate applications for the selected competition
        const appsRes=panel.applications;
        if(appsRes&&appsRes.success){
            setApplications(Array.isArray(appsRes.applications)?appsRes.applications:[]);
            setAppCounts(appsRes.counts||{total:0});
        }
        // Populate reviewer pool (prefer prefetched if available)
        const rvSrc=prefetchedRev||panel.reviewers;
        if(rvSrc){
            const rvList=rvSrc&&rvSrc.reviewers?rvSrc.reviewers:(Array.isArray(rvSrc)?rvSrc:[]);
            if(rvList.length>0)setReviewerPool(rvList);
        }
    }catch(err){
        // Panel failed — the individual loadCompetitions/loadApplications effects
        // will still fire as fallback. No action needed here.
        if(window.DEV_MODE)console.warn('[CompetitionPanel]',err&&err.message||err);
    }
},[isAdmin,userEmail]);
// Fire once on mount (admin only) — before the individual effects so the panel
// data populates the view first.
const _panelFiredRef=useRef(false);
useEffect(()=>{
    if(isAdmin&&!_panelFiredRef.current){_panelFiredRef.current=true;loadCompetitionPanel(initialCompId||'');}
},[]);// eslint-disable-line react-hooks/exhaustive-deps

const selectedComp=competitions.find(c=>c.id===selectedCompetition);
const submittedApps=useMemo(()=>applications.filter(a=>{const s=getStatus(a);return s!=='draft'}),[applications]);
const passedApps=useMemo(()=>applications.filter(a=>getStatus(a)==='admin_passed'),[applications]);
const approvedApps=useMemo(()=>applications.filter(a=>getStatus(a)==='approved'),[applications]);

const handleCheckCompliance=async()=>{
    if(!selectedComp)return;
    setCheckingCompliance(true);
    try{
    const formIds=submittedApps.map(a=>getId(a)).filter(Boolean);
    if(!formIds.length){toast('Няма подадени заявления за проверка','info');setCheckingCompliance(false);return}
    const res=await api('batchcheckcompliance',{...(_adminCreds||{}),formIds,isAdmin:true});
    if(res.success){
        const results=(res.results||[]).map(r=>{
        const app=applications.find(a=>getId(a)===r.formId);
        return{...r,title:app?getTitle(app):'Проект '+r.formId,applicant:app?getName(app):''};
        });
        setComplianceData(results);
        setShowComplianceModal(true);
    }else{toast(res.error||'Грешка при проверка','error')}
    }catch(err){toast(err.message,'error')}finally{setCheckingCompliance(false)}
};

const handleBatchPassCompliant=async(formIds)=>{
    if(!formIds||!formIds.length)return;
    setPassLoading(true);
    try{
    const results=await Promise.all(formIds.map(fid=>api('updateStatus',{...(_adminCreds||{}),id:fid,status:'admin_passed',isAdmin:true}).catch(()=>({success:false}))));
    const ok=results.filter(r=>r&&r.success).length;
    toast('Допуснати '+ok+' / '+formIds.length+' заявления.','success');
    setShowComplianceModal(false);
    loadApplications(null,true);
    }catch(err){toast(err.message,'error')}finally{setPassLoading(false)}
};

const handlePublishResults=async()=>{
    if(!selectedComp)return;
    setPublishingResults(true);
    const c=selectedComp;
    const payload={...(_adminCreds||{}),id:c.id,name:c.name,deadline:c.deadline||c.dateEnd||'',description:c.description||'',status:'results_published',callType:c.callType||'',year:c.year||'',openDate:c.openDate||'',directions:c.directions||'',evalCriteria:c.evalCriteria||'',budgetByDirection:c.budgetByDirection||'',templates:c.templates||'',isAdmin:true};
    const origStatus=c.status;
    setCompetitionsState(prev=>prev.map(comp=>comp.id===c.id?{...comp,status:'results_published'}:comp));
    api('editcompetition',payload).then(res=>{
    if(res.success){toast('Резултатите са публикувани успешно.','success',5000,{action:typeof copyPublicResultsLink==='function'?copyPublicResultsLink:null,actionLabel:'Копирай публичен линк'});loadCompetitions({silent:true,forceRefresh:true});}
    else{setCompetitionsState(prev=>prev.map(comp=>comp.id===c.id?{...comp,status:origStatus}:comp));toast(res.error||'Грешка при публикуване','error');}
    }).catch(err=>{setCompetitionsState(prev=>prev.map(comp=>comp.id===c.id?{...comp,status:origStatus}:comp));toast(err.message,'error')}).finally(()=>setPublishingResults(false));
};

// UC-22 — Academic Council ratifies contest results before public broadcast.
const handleACAcceptResults=async()=>{
    if(!selectedComp)return;
    const decisionRef=window.prompt('Номер на решение / протокол на АС (по желание):','')||'';
    if(decisionRef===null)return;
    setPublishingResults(true);
    const c=selectedComp;
    const origStatus=c.status;
    setCompetitionsState(prev=>prev.map(comp=>comp.id===c.id?{...comp,status:'results_approved_by_ac'}:comp));
    try{
      const res=await api('acceptcontestresultsbyac',{...(_adminCreds||{}),competitionId:c.id,decisionRef:decisionRef.trim(),isAdmin:true});
      if(res&&res.success){toast('Резултатите са приети от АС. Можете да публикувате.','success');loadCompetitions({silent:true,forceRefresh:true});}
      else{setCompetitionsState(prev=>prev.map(comp=>comp.id===c.id?{...comp,status:origStatus}:comp));toast((res&&res.error)||'Грешка при отбелязване на решение на АС','error');}
    }catch(err){setCompetitionsState(prev=>prev.map(comp=>comp.id===c.id?{...comp,status:origStatus}:comp));toast(err.message,'error');}
    finally{setPublishingResults(false);}
};

const handleAssignReviewers=async()=>{
    if(!assignData.formId||!assignData.reviewers.length)return;
    // Extract emails and build a name map from the mixed array (strings + {email,name} objects)
    const emails=[];const reviewerNames={};
    assignData.reviewers.forEach(r=>{
        if(typeof r==='string'){const e=r.trim().toLowerCase();if(e){emails.push(e);if(!reviewerNames[e])reviewerNames[e]=''}}
        else if(r&&r.email){const e=String(r.email).trim().toLowerCase();if(e){emails.push(e);if(r.name&&!reviewerNames[e])reviewerNames[e]=String(r.name).trim()}}
    });
    if(!emails.length)return;
    const payload={...(_adminCreds||{}),formId:assignData.formId,reviewers:emails,reviewerNames:reviewerNames,isAdmin:true};
    // Optimistic: close modal immediately, reset state
    setAssignClosing(true);
    setTimeout(()=>{setShowAssignModal(false);setAssignClosing(false);setAssignStep(1);setAssignSearch('');setAssignData({formId:'',reviewers:[],manualEmail:''})},180);
    toast('Назначаване на рецензенти…','info',2000);
    api('assignreviewers',payload).then(res=>{
        if(res.success){
            toast((res.message||'Рецензентите са назначени ('+(res.reviewers||[]).length+'). Имейл уведомления са изпратени.'),'success');
            loadApplications(null,true);
        }else{toast(res.error||'Грешка','error')}
    }).catch(err=>toast(err.message,'error'));
};

const loadReviewerPool=useCallback(async()=>{
    try{
    const payload={...(_adminCreds||{}),isAdmin:true};
    if(selectedComp?.id)payload.competitionId=selectedComp.id;
    const res=await api('getreviewers',payload);
    if(res.success&&Array.isArray(res.reviewers))setReviewerPool(res.reviewers);
    }catch(_){}
},[selectedComp]);
useEffect(()=>{if(isAdmin&&selectedComp)loadReviewerPool()},[isAdmin,selectedComp,loadReviewerPool]);

const handleLoadEvaluateData=async()=>{
    if(!selectedComp)return;
    setEvaluating(true);
    try{
    const res=await api('batchevaluate',{...(_adminCreds||{}),competitionId:selectedComp.id,isAdmin:true});
    if(res.success){
        const items=res.results||[];
        setEvaluateData(items);
        const scores={};const expanded={};
        items.forEach((it,idx)=>{
            const existingEval=it.evaluation||{};
            const existingScores=existingEval.scores||{};
            scores[it.formId]={
                status:existingEval.status||it.currentStatus||'approved',
                comment:existingEval.comment||'',
                scores:{...existingScores}
            };
            if(idx===0)expanded[it.formId]=true;
        });
        setEvalScores(scores);
        setEvalExpanded(expanded);
        setShowEvaluateModal(true);
        if(!items.length)toast('Няма подадени проекти за оценка','info');
    }else{toast(res.error||'Грешка','error')}
    }catch(err){toast(err.message,'error')}finally{setEvaluating(false)}
};

const handleEvaluateSingle=async(formId)=>{
    const score=evalScores[formId];
    if(!score)return;
    const totalScore=calcRubricTotal(score.scores);
    setEvaluateData(prev=>prev.filter(p=>p.formId!==formId));
    toast('Оценяване…','info',2000);
    api('evaluateproject',{...(_adminCreds||{}),formId,status:score.status,evaluation:{
        comment:score.comment,
        date:new Date().toISOString(),
        scores:score.scores||{},
        totalScore:totalScore,
        maxScore:EVAL_MAX_SCORE,
        rubricVersion:'1.0'
    },isAdmin:true}).then(res=>{
        if(res.success){
            toast(res.message||('Проектът е оценен: '+totalScore+'/'+EVAL_MAX_SCORE+' т.'),'success');
            loadApplications(null,true);
        }else{toast(res.error||'Грешка','error');setEvaluateData(prev=>[...prev,{formId}])}
    }).catch(err=>{toast(err.message,'error');setEvaluateData(prev=>[...prev,{formId}])});
};

const handleGenerateContracts=async()=>{
    if(!selectedComp)return;
    setGenerating(true);
    try{
    const res=await api('batchgeneratecontracts',{...(_adminCreds||{}),competitionId:selectedComp.id,isAdmin:true});
    if(res.success){
        setContractData(res.results||[]);
        setShowContractModal(true);
        if(!(res.results||[]).length)toast('Няма одобрени проекти за договори','info');
        else{toast('Генерирани '+(res.results||[]).length+' договора','success');loadApplications(null,true)}
    }else{toast(res.error||'Грешка','error')}
    }catch(err){toast(err.message,'error')}finally{setGenerating(false)}
};

// ── Universal per-application status transition ─────────────────────────────
// Optimistically patches the local applications array, fires `updateStatus`
// (the canonical backend endpoint already used by handleBatchPassCompliant),
// rolls back on failure and shows a toast. `extra` is merged into the request
// body so callers can attach things like a free-text reason.
const transitionApp=useCallback(async(formId,targetStatus,extra)=>{
    if(!formId||!targetStatus)return;
    setTxInFlight(p=>({...p,[formId]:targetStatus}));
    const prevApps=applications;
    setApplications(prev=>prev.map(a=>getId(a)===formId?{...a,status:targetStatus,Status:targetStatus}:a));
    try{
        const res=await api('updateStatus',Object.assign({},_adminCreds||{},{id:formId,status:targetStatus,isAdmin:true},extra||{}));
        if(res&&res.success){
            toast(res.message||('Статус: '+(statusLabel(targetStatus)||targetStatus)),'success');
            // Reconcile with server (counts, derived fields) without blocking UI.
            loadApplications(null,true);
        }else{
            setApplications(prevApps);
            toast((res&&res.error)||'Грешка при промяна на статус','error');
        }
    }catch(err){
        setApplications(prevApps);
        toast(err.message||String(err),'error');
    }finally{
        setTxInFlight(p=>{const n={...p};delete n[formId];return n;});
    }
},[applications,loadApplications]);

// Open the reason mini-modal for transitions that need justification.
const promptReason=(formId,target,label,color,icon,placeholder)=>{
    setReasonText('');
    setReasonPrompt({formId,target,label,color,icon,placeholder:placeholder||'Опишете накратко основанието…'});
};

// ── Per-application action descriptors ──────────────────────────────────────
// Returns context-aware action buttons for one row, driven strictly by the
// proposal state machine in workflow.js. Each entry is rendered as a small
// button in the row's "Действия" column. `needsReason:true` opens the inline
// reason modal; otherwise the transition fires immediately.
const _appActionsFor=(app)=>{
    const st=getStatus(app);
    const fid=getId(app);
    const acts=[];
    // Process 3 — administrative review
    if(st==='submitted'||st==='admin_review'||st==='under_administrative_review'){
        acts.push({k:'admin_passed', label:'Допусни',          icon:'fa-check',          kind:'success'});
        acts.push({k:'returned',     label:'Върни за корекция',icon:'fa-undo',           kind:'warning', needsReason:true, placeholder:'Какво трябва да се коригира?'});
        acts.push({k:'ineligible',   label:'Недопустимо',      icon:'fa-ban',            kind:'danger',  needsReason:true, placeholder:'Основание за недопустимост'});
    }
    // Process 3 — corrections cycle
    else if(st==='returned'||st==='needs_correction'){
        // Wait for applicant; admin can still override.
        acts.push({k:'admin_passed', label:'Маркирай като коригирано',icon:'fa-check', kind:'success'});
        acts.push({k:'ineligible',   label:'Недопустимо',      icon:'fa-ban',            kind:'danger',  needsReason:true, placeholder:'Защо проектът остава недопустим?'});
    }
    else if(st==='resubmitted'){
        acts.push({k:'admin_passed', label:'Допусни',          icon:'fa-check',          kind:'success'});
        acts.push({k:'returned',     label:'Върни отново',      icon:'fa-undo',           kind:'warning', needsReason:true});
    }
    // Process 4 — reviewer two-step (CKK proposes → Rector confirms)
    else if(st==='admin_passed'||st==='eligible'){
        // CKK / NIDD: propose reviewers (backend auto-routes to proposeReviewers for CKK).
        acts.push({k:'__assign__',   label:'Предложи рецензенти',icon:'fa-user-plus',    kind:'primary'});
        acts.push({k:'returned',     label:'Върни',             icon:'fa-undo',           kind:'outline', needsReason:true});
    }
    else if(st==='reviewer_proposal'){
        // Rector: review the CKK proposal and confirm or replace it.
        acts.push({k:'__assign__',   label:'Утвърди рецензенти',icon:'fa-stamp',         kind:'success'});
    }
    else if(st==='reviewer_assignment'||st==='in_review'||st==='reviewer_assigned'||st==='reviewer_invited'||st==='reviewer_accepted'){
        acts.push({k:'__assign__',   label:'Доназначи',         icon:'fa-user-plus',      kind:'outline'});
    }
    // Process 5 — scoring & ranking
    else if(st==='reviewed'||st==='scored'||st==='ranked'||st==='above_threshold'){
        acts.push({k:'__evaluate__', label:'Оцени',             icon:'fa-clipboard-check',kind:'primary'});
        acts.push({k:'rejected',     label:'Отхвърли',          icon:'fa-times',          kind:'danger',  needsReason:true, placeholder:'Основание за отхвърляне'});
    }
    // Process 5/6 — AC ratification + funding
    else if(st==='approved_for_funding'||st==='proposed_for_funding'){
        acts.push({k:'approved_by_ac',label:'Утвърди (АС)',     icon:'fa-check-double',   kind:'success'});
        acts.push({k:'rejected',     label:'Отхвърли',          icon:'fa-times',          kind:'danger',  needsReason:true, placeholder:'Мотиви за отхвърляне от АС'});
    }
    // Process 6 — contracting
    else if(st==='approved'||st==='approved_by_ac'||st==='published'||st==='contract_preparation'){
        acts.push({k:'__contract__', label:'Договор',           icon:'fa-file-signature', kind:'primary'});
    }
    // Terminal / read-only states
    return {actions:acts, fid:fid, status:st};
};

// Click router for the per-row buttons.
const handleAppAction=(app,action)=>{
    const fid=getId(app);
    if(!fid)return;
    if(action.k==='__assign__'){
        setAssignData(p=>({...p,formId:fid,reviewers:[]}));
        setAssignStep(1);setAssignSearch('');
        // Pre-load reviewer pool if not yet loaded
        if(!reviewerPool.length)loadReviewerPool();
        setShowAssignModal(true);
        return;
    }
    if(action.k==='__evaluate__'){
        // Reuse the batch-evaluate panel; the row for this app will be expanded by default.
        handleLoadEvaluateData();
        return;
    }
    if(action.k==='__contract__'){
        // Generate contracts for the whole competition (current backend is batch-only).
        handleGenerateContracts();
        return;
    }
    if(action.needsReason){
        promptReason(fid,action.k,action.label,action.kind,action.icon,action.placeholder);
        return;
    }
    transitionApp(fid,action.k);
};

// Submit handler for the inline reason modal.
const submitReason=()=>{
    if(!reasonPrompt)return;
    const txt=(reasonText||'').trim();
    if(!txt){toast('Моля, въведете кратко основание.','warn');return;}
    const{formId,target}=reasonPrompt;
    setReasonPrompt(null);
    transitionApp(formId,target,{reason:txt,note:txt});
};

const COMP_PHASES=[
    {id:'open',label:'Откриване',icon:'fa-flag',color:'var(--ink-4)',desc:'Конфигуриране на конкурса и публикуване за кандидатстване',statuses:[],getStatus:()=>selectedComp?'done':'pending'},
    {id:'intake',label:'Прием',icon:'fa-inbox',color:'var(--info)',desc:'Подаване на проектни предложения в рамките на конкурса',statuses:['draft','submitted'],getStatus:()=>appCounts.submitted>0||appCounts.total>0?'active':'pending',action:!isAdmin&&onApply?{label:'Подай предложение',handler:()=>onApply(selectedCompetition)}:null},
    {id:'screening',label:'Административна проверка',icon:'fa-user-shield',color:'var(--primary)',desc:'Проверка за допустимост и административно съответствие',statuses:['admin_review','admin_passed','eligible','ineligible'],getStatus:()=>(appCounts.admin_passed||0)>0?'active':'pending',action:isAdmin?{label:'Провери ('+submittedApps.length+')',handler:handleCheckCompliance,loading:checkingCompliance}:null},
    {id:'corrections',label:'Корекции',icon:'fa-pen-to-square',color:'var(--warn)',desc:'5 работни дни за отстраняване на установени несъответствия',statuses:['returned','needs_correction','resubmitted'],getStatus:()=>appCounts.returned>0?'active':'pending',action:isAdmin&&(appCounts.returned||0)>0?{label:'Върнати ('+(appCounts.returned||0)+')',handler:()=>setShowCorrectionsModal(true)}:null},
    {id:'review',label:'Рецензиране',icon:'fa-users',color:'var(--review)',desc:'Назначаване на рецензенти и 10-дневен срок за рецензия',statuses:['reviewer_assignment','in_review','reviewed'],getStatus:()=>appCounts.in_review>0?'active':'pending',action:isAdmin?{label:'Назначи рецензенти',handler:()=>{setAssignData({formId:'',reviewers:[],manualEmail:''});setAssignStep(1);setAssignSearch('');if(!reviewerPool.length)loadReviewerPool();setShowAssignModal(true)}}:null},
    {id:'scoring',label:'Оценка и класиране',icon:'fa-sort-amount-down',color:'var(--gold)',desc:'Оценяване по критерии от ЦКК и класиране по низходящ ред',statuses:['scored','ranked','rejected'],getStatus:()=>(appCounts.approved||0)+(appCounts.rejected||0)>0?'active':'pending',action:isAdmin?{label:'Оцени проекти',handler:handleLoadEvaluateData,loading:evaluating}:null},
    {id:'approval',label:'Одобрение',icon:'fa-check-double',color:'var(--ok)',desc:'Решение на Академичния съвет за финансиране на одобрените проекти',statuses:['approved_for_funding','approved'],getStatus:()=>appCounts.approved>0?'done':'pending',action:isAdmin&&approvedApps.length>0&&selectedComp?.status!=='results_published'?(selectedComp?.status==='results_approved_by_ac'?{label:'Публикувай резултати',handler:handlePublishResults,loading:publishingResults}:{label:'Прието от АС',handler:handleACAcceptResults,loading:publishingResults}):null},
    {id:'contracting',label:'Договаряне',icon:'fa-file-signature',color:'var(--teal)',desc:'Генериране и подписване на договори в 10-дневен срок',statuses:['contracting','contract_signed','contracted'],getStatus:()=>appCounts.contracted>0?'done':'pending',action:isAdmin?{label:'Договори ('+approvedApps.length+')',handler:handleGenerateContracts,loading:generating}:null}
];
const[expandedPhase,setExpandedPhase]=useState(null);
const[showPhasePanel,setShowPhasePanel]=useState(true);

// Admin: show management panel first
if(isAdmin&&viewMode==='manage'){
    const patchCompetitions=patchFn=>setCompetitionsState(prev=>patchFn(prev));
    return e(CompetitionManagementPanel,{competitions,onRefresh:()=>loadCompetitions({forceRefresh:true}),isLoading:competitionsLoading,onOpenCompetition:comp=>{if(comp&&comp.id)setSelectedCompetition(comp.id);setViewMode('workflow')},onPatchCompetitions:patchCompetitions});
}

return e('div',null,
    competitionsError&&e('div',{style:{background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',padding:'.7rem 1rem',marginBottom:'1rem',fontSize:'.8rem',color:'var(--err)',display:'flex',alignItems:'center',gap:'.5rem'}},e('i',{className:'fas fa-exclamation-triangle'}),competitionsError,e('button',{className:'btn btn-outline btn-sm',style:{marginLeft:'auto'},onClick:()=>loadCompetitions({forceRefresh:true})},'\u041e\u043f\u0438\u0442\u0430\u0439')),
    isAdmin&&e('div',{style:{display:'flex',gap:'.5rem',marginBottom:'1rem'}},
    e('button',{className:'btn btn-outline '+(viewMode==='manage'?'active':''),onClick:()=>setViewMode('manage')},e('i',{className:'fas fa-cog'}),' Управление'),
    e('button',{className:'btn btn-outline '+(viewMode==='workflow'?'active':''),onClick:()=>setViewMode('workflow')},e('i',{className:'fas fa-tasks'}),' Процес')
    ),
    e('div',{className:'page-top'},
    e('div',{className:'page-top-left'},
        e('h2',null,'Процес на конкурса'),
        e('p',null,'Етапи на конкурсната процедура за научни проекти')
    ),
    e('div',{className:'page-top-actions'},
                                    e('label',null,'Изберете конкурс: '),
                                    competitionsLoading
                                        ?e('span',{style:{fontSize:'.8rem',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.35rem'}},e('i',{className:'fas fa-spinner spin'}),' Зареждане на конкурси...')
                                        :competitions.length===0
                                        ?e('span',{style:{fontSize:'.8rem',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.35rem'}},isAdmin?'Няма конкурси – създайте нов':'Няма активни конкурси')
                                        :e('select',{value:selectedCompetition,onChange:ev=>setSelectedCompetition(ev.target.value)},competitions.map(c=>e('option',{key:c.id,value:c.id},c.name))),
                                    e('button',{className:'btn btn-outline btn-icon',title:'Опресни конкурсите',onClick:()=>{loadCompetitions({forceRefresh:true});if(selectedCompetition)loadApplications(selectedCompetition,true)},disabled:competitionsLoading||appsLoading},competitionsLoading?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-sync-alt'})),
                                    isAdmin&&e('button',{className:'btn btn-outline btn-icon',style:{marginLeft:'.25rem'},onClick:()=>setViewMode('manage'),title:'Управление на конкурси'},e('i',{className:'fas fa-cog'}))
    )
    ),
    // ── Competition summary cards — canonical loading-strip on background refresh ──
    selectedComp&&e('div',{className:'card'+(appsLoading?' card-loading':''),style:{marginBottom:'1rem',position:'relative'}},
    e('div',{className:'loading-strip'+(appsLoading?' active':'')}),
    e('div',{className:'card-header'},
        e('h3',{className:'card-title'},'Обобщение: '+selectedComp.name),
        selectedComp.deadline&&e('span',{style:{fontSize:'.8rem',color:'var(--ink-4)',marginLeft:'1rem'}},e('i',{className:'far fa-calendar'}),' Краен срок: '+fmtDate(selectedComp.deadline))
    ),
    e('div',{className:'card-body'},e('div',{className:'comp-summary-grid'},
        appsLoading?e('div',{style:{padding:'1rem',color:'var(--ink-4)',gridColumn:'1/-1'}},e('i',{className:'fas fa-spinner spin'}),' Зареждане...'):
        [
        {label:'Общо',val:appCounts.total,color:'var(--ink)'},
        {label:'Подадени',val:appCounts.submitted||0,color:'var(--primary)'},
        {label:'Допуснати',val:appCounts.admin_passed||0,color:'var(--ok)'},
        {label:'Върнати',val:appCounts.returned||0,color:'var(--warn)'},
        {label:'При рецензенти',val:appCounts.in_review||0,color:'#6366f1'},
        {label:'Одобрени',val:appCounts.approved||0,color:'var(--ok)'},
        {label:'Отхвърлени',val:appCounts.rejected||0,color:'var(--err)'},
        {label:'Договори',val:appCounts.contracted||0,color:'#159379'}
        ].map(s=>e('div',{key:s.label,className:'comp-summary-stat'},
        e('div',{style:{fontSize:'1.5rem',fontWeight:700,color:s.color}},s.val),
        e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginTop:'.2rem'}},s.label)
        ))
    ))
    ),
    // ── Financial summary for this competition ──
    selectedComp&&(()=>{
        const totalBudget=applications.reduce((s,a)=>s+Number(a.budget||a.Budget||0),0);
        const approvedBudget=applications.filter(a=>['approved_for_funding','approved','contracted'].includes(getStatus(a))).reduce((s,a)=>s+Number(a.budget||a.Budget||0),0);
        const budgetDirections=selectedComp.budgetByDirection;
        if(!totalBudget&&!budgetDirections)return null;
        return e('div',{className:'card',style:{marginBottom:'1rem'}},
            e('div',{className:'card-header'},e('h3',{className:'card-title'},e('i',{className:'fas fa-coins',style:{color:'var(--gold)',marginRight:'.4rem'}}),'Финансов преглед')),
            e('div',{className:'card-body'},
                e('div',{className:'proj-kpi-strip'},
                    totalBudget>0&&e('div',{className:'proj-kpi-card'},
                        e('div',{className:'kpi-val',style:{color:'var(--ink)',fontSize:'.85rem'}},(totalBudget/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'),
                        e('div',{className:'kpi-lbl'},'Заявен бюджет')
                    ),
                    approvedBudget>0&&e('div',{className:'proj-kpi-card'},
                        e('div',{className:'kpi-val',style:{color:'var(--ok)',fontSize:'.85rem'}},(approvedBudget/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'),
                        e('div',{className:'kpi-lbl'},'Одобрен бюджет')
                    ),
                    totalBudget>0&&applications.length>0&&e('div',{className:'proj-kpi-card'},
                        e('div',{className:'kpi-val',style:{color:'var(--info)',fontSize:'.8rem'}},((totalBudget/applications.length)/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'),
                        e('div',{className:'kpi-lbl'},'Средно на проект')
                    ),
                    totalBudget>0&&approvedBudget>0&&e('div',{className:'proj-kpi-card'},
                        e('div',{style:{display:'flex',flexDirection:'column',gap:'.25rem'}},
                            e('div',{className:'kpi-val',style:{color:'var(--gold)'}},Math.round(approvedBudget/totalBudget*100)+'%'),
                            e('div',{className:'fin-bar'},e('div',{className:'fin-bar-fill',style:{width:Math.round(approvedBudget/totalBudget*100)+'%',background:'var(--ok)'}}))
                        ),
                        e('div',{className:'kpi-lbl'},'Усвояване')
                    )
                ),
                budgetDirections&&e('div',{style:{marginTop:'.75rem',padding:'.65rem .85rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-xs)',fontSize:'.78rem',color:'var(--ink-3)',whiteSpace:'pre-wrap',lineHeight:1.6}},
                    e('div',{className:'detail-label',style:{marginBottom:'.35rem'}},'Бюджет по направления'),
                    budgetDirections
                )
            )
        );
    })(),
    // ── v12.32.35-templates: Admin Competition Template Library ──
    selectedComp&&isAdmin&&e(CompetitionTemplateLibrary,{userEmail:userEmail}),
    // ── Competition process phase grid ──
    selectedComp&&(()=>{
        const totalApps=Math.max(1,applications.length);
        const lanes=COMP_PHASES.filter(p=>p.id!=='open').map(phase=>{
            const phaseApps=applications.filter(a=>phase.statuses.includes(getStatus(a)));
            // Per-status breakdown for the chip strip, ordered as declared in the phase.
            const breakdown=phase.statuses.map(s=>({status:s,count:applications.filter(a=>getStatus(a)===s).length})).filter(x=>x.count>0);
            return {...phase,count:phaseApps.length,items:phaseApps,breakdown:breakdown,pct:Math.round(phaseApps.length/totalApps*100)};
        });
        const maxCnt=Math.max(1,...lanes.map(l=>l.count));
        return e(Fragment,null,
            e('div',{className:'card comp-proc-card',style:{marginBottom:'1rem'}},
                e('div',{className:'comp-proc-header'},
                    e('div',{className:'comp-proc-header-left'},
                        e('i',{className:'fas fa-diagram-project',style:{color:'var(--red)',marginRight:'.4rem'}}),
                        e('span',null,'ПРОЦЕС НА КОНКУРСА')
                    ),
                    appsLoading&&e('i',{className:'fas fa-spinner spin',style:{fontSize:'.75rem',color:'var(--ink-4)',marginRight:'.5rem'}}),
                    e('button',{className:'btn btn-outline btn-sm comp-proc-toggle',onClick:()=>setShowPhasePanel(v=>!v)},
                        showPhasePanel?e(Fragment,null,e('i',{className:'fas fa-times'}),' Скрий'):e(Fragment,null,e('i',{className:'fas fa-chevron-down'}),' Покажи')
                    )
                ),
                showPhasePanel&&e('div',{className:'comp-phase-grid'},
                    lanes.map(lane=>{
                        const isExp=expandedPhase===lane.id;
                        const pct=Math.max(2,lane.pct||0); // floor so an empty lane still shows the rail
                        return e('div',{key:lane.id,className:'comp-phase-card'+(isExp?' active':''),onClick:()=>setExpandedPhase(isExp?null:lane.id),title:lane.desc+(lane.count?(' — '+lane.pct+'% от общо '+applications.length):'')},
                            e('div',{className:'comp-phase-card-icon',style:{background:lane.color}},e('i',{className:'fas '+lane.icon})),
                            e('div',{className:'comp-phase-card-count',style:{color:lane.count>0?lane.color:'var(--ink)'}},lane.count),
                            e('div',{className:'comp-phase-card-label'},lane.label),
                            // Per-status mini chips (counts only, colored swatch by phase)
                            lane.breakdown.length>0&&e('div',{className:'comp-phase-mini-chips',style:{display:'flex',gap:'.2rem',flexWrap:'wrap',justifyContent:'center',marginTop:'.3rem'}},
                                lane.breakdown.slice(0,4).map(b=>e('span',{key:b.status,title:statusLabel(b.status)+': '+b.count,style:{display:'inline-flex',alignItems:'center',gap:'.15rem',fontSize:'.6rem',padding:'.1rem .35rem',borderRadius:'999px',background:lane.color+'1a',color:lane.color,border:'1px solid '+lane.color+'33',fontWeight:600}},b.count))
                            ),
                            // Mini progress bar (% of all apps in this phase)
                            applications.length>0&&e('div',{className:'comp-phase-progress',style:{marginTop:'.4rem',height:3,borderRadius:2,background:'var(--bg)',overflow:'hidden'},title:lane.pct+'% от общо '+applications.length},
                                e('div',{style:{width:pct+'%',height:'100%',background:lane.count>0?lane.color:'var(--ink-5)',transition:'width .25s ease'}})
                            ),
                            isExp&&e('div',{className:'comp-phase-card-bar',style:{background:lane.color}})
                        );
                    })
                )
            ),
            expandedPhase&&!appsLoading&&(()=>{
                const lane=lanes.find(l=>l.id===expandedPhase);
                if(!lane)return null;
                return e('div',{className:'card wf-lane-detail',style:{marginBottom:'1rem'}},
                    e('div',{className:'wf-lane-header',style:{borderLeftColor:lane.color}},
                        e('div',{className:'wf-lane-title-row'},
                            e('i',{className:'fas '+lane.icon,style:{color:lane.color}}),
                            e('h3',null,lane.label),
                            e('span',{className:'count-chip'},lane.count),
                            lane.action&&e('button',{className:'btn btn-primary btn-sm',style:{marginLeft:'auto'},onClick:lane.action.handler,disabled:lane.action.loading},
                                lane.action.loading?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-bolt'}),' ',lane.action.label
                            )
                        ),
                        e('p',{className:'wf-lane-desc'},lane.desc),
                        e('div',{className:'wf-lane-chips'},
                            lane.statuses.map(s=>(appCounts[s]||0)>0?e('span',{key:s,className:'wf-status-chip'},statusLabel(s),e('strong',null,' '+(appCounts[s]||0))):null)
                        )
                    ),
                    lane.items.length>0
                        ?e('div',{className:'wf-lane-table-wrap'},
                            e('table',{className:'wf-lane-table'},
                                e('thead',null,e('tr',null,
                                    e('th',null,'\u041f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435'),
                                    e('th',null,'\u041a\u0430\u043d\u0434\u0438\u0434\u0430\u0442'),
                                    e('th',null,'\u0421\u0442\u0430\u0442\u0443\u0441'),
                                    e('th',null,'\u0414\u0430\u0442\u0430'),
                                    isAdmin&&e('th',{style:{textAlign:'right'}},'\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044f')
                                )),
                                e('tbody',null,lane.items.slice(0,20).map((app,i)=>{
                                    const fid=getId(app);
                                    const inFlight=txInFlight[fid];
                                    const meta=isAdmin?_appActionsFor(app):null;
                                    return e('tr',{key:fid||i},
                                        e('td',null,
                                            e('div',{className:'wf-item-title'},(fid||'').toUpperCase().slice(0,10)||getTitle(app)),
                                            app.projectCode&&e('span',{className:'type-tag',style:{fontSize:'.6rem',marginTop:'.15rem'}},app.projectCode)
                                        ),
                                        e('td',null,getName(app)),
                                        e('td',null,e('span',{className:'badge',style:{background:lane.color+'1a',color:lane.color,border:'1px solid '+lane.color+'33'}},statusLabel(getStatus(app)))),
                                        e('td',null,fmtDate(app.submitted||app.created||'')),
                                        isAdmin&&e('td',{style:{textAlign:'right',whiteSpace:'nowrap'}},
                                            inFlight
                                                ?e('span',{style:{fontSize:'.72rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-spinner spin'}),' Прилагане…')
                                                :(meta&&meta.actions.length>0
                                                    ?e('div',{style:{display:'inline-flex',gap:'.3rem',flexWrap:'wrap',justifyContent:'flex-end'}},
                                                        meta.actions.map((a,ai)=>e('button',{
                                                            key:ai,
                                                            className:'btn btn-'+(a.kind||'outline')+' btn-sm',
                                                            style:{padding:'.25rem .5rem',fontSize:'.72rem'},
                                                            title:a.label,
                                                            onClick:(ev)=>{ev.stopPropagation();handleAppAction(app,a);}
                                                        },e('i',{className:'fas '+a.icon}),' ',a.label))
                                                    )
                                                    :e('span',{style:{fontSize:'.7rem',color:'var(--ink-5)'}},'\u2014'))
                                        )
                                    );
                                }))
                            ),
                            lane.items.length>20&&e('div',{style:{padding:'.6rem 1rem',fontSize:'.75rem',color:'var(--ink-4)',textAlign:'center'}},'\u2026 \u0438 \u043e\u0449\u0435 '+(lane.items.length-20)+' \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f')
                        )
                        :e('div',{className:'wf-lane-empty'},e('i',{className:'fas fa-inbox'}),e('p',null,'\u041d\u044f\u043c\u0430 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f \u0432 \u0442\u0430\u0437\u0438 \u0444\u0430\u0437\u0430.')),
                    e('button',{className:'btn btn-outline btn-sm wf-lane-close-btn',onClick:()=>setExpandedPhase(null)},e('i',{className:'fas fa-chevron-up'}),'\u00a0\u0421\u043a\u0440\u0438\u0439')
                );
            })()
        );
    })(),
    showComplianceModal&&_portal(e('div',{className:'modal-overlay'+(complianceClosing?' closing':''),onClick:closeComplianceModal},
    e('div',{className:'modal-box wide'+(complianceClosing?' closing':''),onClick:ev=>ev.stopPropagation()},
        e('div',{className:'modal-head'},e('h3',null,e('i',{className:'fas fa-check-circle'}),' Проверка за съответствие'),e('button',{className:'close-btn',onClick:closeComplianceModal},e('i',{className:'fas fa-times'}))),
        e('div',{className:'modal-body'},
        complianceData.length>0?e('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}},
            e('thead',null,e('tr',{style:{borderBottom:'2px solid var(--border)',background:'var(--surface)'}},
            e('th',{style:{padding:'.6rem',textAlign:'left'}},'Проект'),
            e('th',{style:{padding:'.6rem',textAlign:'left'}},'Заявител'),
            e('th',{style:{padding:'.6rem',textAlign:'center'}},'Резултат'),
            e('th',{style:{padding:'.6rem',textAlign:'left'}},'Забележки'),
            e('th',{style:{padding:'.6rem',textAlign:'center'}},'Действие')
            )),
            e('tbody',null,complianceData.map((item,idx)=>e('tr',{key:idx,style:{borderBottom:'1px solid var(--border)',background:idx%2===0?'var(--white)':'var(--surface)'}},
            e('td',{style:{padding:'.6rem'}},item.title||item.formId),
            e('td',{style:{padding:'.6rem'}},item.applicant||'—'),
            e('td',{style:{padding:'.6rem',textAlign:'center'}},
                e('span',{style:{padding:'.2rem .5rem',borderRadius:'var(--r-pill)',fontSize:'.75rem',background:item.compliant?'var(--ok-bg)':'var(--err-bg)',color:item.compliant?'var(--ok)':'var(--err)'}},item.compliant?'Съответства':'Несъответствие')
            ),
            e('td',{style:{padding:'.6rem'}},(item.issues||[]).join('; ')||'OK'),
            e('td',{style:{padding:'.6rem',textAlign:'center'}},
                item.compliant&&e('button',{className:'btn btn-primary btn-sm',disabled:passLoading,
                    onClick:()=>handleBatchPassCompliant([item.formId])},
                    passLoading?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-check'}),' Допусни'))
            )))
        ):e('p',null,'Няма данни за проверка')
        ),
        e('div',{className:'modal-footer'},
            e('button',{className:'btn btn-outline',onClick:closeComplianceModal},'Затвори'),
            complianceData.filter(r=>r.compliant).length>0&&e('button',{className:'btn btn-primary',disabled:passLoading,
                onClick:()=>handleBatchPassCompliant(complianceData.filter(r=>r.compliant).map(r=>r.formId))},
                passLoading?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-check-double'}),
                ' Допусни всички съответстващи (',complianceData.filter(r=>r.compliant).length,')')
        )
    )
    )),
    showAssignModal&&_portal(e('div',{className:'modal-overlay'+(assignClosing?' closing':''),onClick:closeAssignModal},
    e('div',{className:'modal-box wide assign-wizard'+(assignClosing?' closing':''),onClick:ev=>ev.stopPropagation(),role:'dialog','aria-modal':'true','aria-label':'Назначаване на рецензенти — стъпка '+assignStep+' от 3'},
        e('div',{className:'modal-head',style:{borderBottom:'none',paddingBottom:'.5rem'}},
            e('div',{style:{display:'flex',alignItems:'center',gap:'.55rem'}},
                e('h3',{style:{margin:0}},e('i',{className:'fas fa-user-plus',style:{color:'var(--primary)'}}),' Назначи рецензенти'),
                assignData.formId&&(()=>{
                    const selApp=applications.find(a=>getId(a)===assignData.formId);
                    if(!selApp)return null;
                    return e('span',{style:{fontSize:'.72rem',color:'var(--ink-4)',background:'var(--surface)',padding:'.15rem .55rem',borderRadius:'var(--r-pill)',maxWidth:'320px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},getTitle(selApp));
                })()
            ),
            e('button',{className:'close-btn',onClick:closeAssignModal,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
        ),
        // ── Step indicator ──────────────────────────────────────────
        e('div',{className:'assign-stepper',role:'navigation','aria-label':'Стъпки за назначаване'},
            [{num:1,label:'Избери проект',icon:'fa-file-alt'},{num:2,label:'Избери рецензенти',icon:'fa-users'},{num:3,label:'Потвърди',icon:'fa-check-circle'}].map(s=>e('div',{key:s.num,className:'assign-step'+(assignStep===s.num?' active':'')+(assignStep>s.num?' done':'')},
                e('div',{className:'assign-step-num'},assignStep>s.num?e('i',{className:'fas fa-check'}):e('i',{className:'fas '+s.icon})),
                e('span',{className:'assign-step-label'},s.label)
            ))
        ),
        e('div',{className:'modal-body',style:{minHeight:'280px'}},
        // ═══════════════════════════════════════════════════════════════
        // STEP 1 — Избери проект
        // ═══════════════════════════════════════════════════════════════
        assignStep===1&&e('div',{className:'assign-step-body'},
            e('div',{className:'form-field'},
                e('label',null,e('i',{className:'fas fa-search',style:{marginRight:'.3rem'}}),'Избери заявление за рецензиране'),
                e('p',{style:{fontSize:'.72rem',color:'var(--ink-4)',margin:'.2rem 0 .5rem'}},'Ще назначите рецензенти към избрания проект. Показват се допуснати и подадени заявления.'),
                e('div',{className:'assign-app-list'},
                    (()=>{
                        const apps=passedApps.concat(submittedApps).filter((a,i,arr)=>arr.findIndex(b=>getId(b)===getId(a))===i);
                        if(!apps.length)return e('div',{className:'empty-state',style:{padding:'1.5rem'}},e('i',{className:'fas fa-inbox',style:{fontSize:'1.4rem',color:'var(--ink-4)'}}),e('p',null,'Няма заявления за рецензиране.'));
                        return apps.map(a=>{
                            const fid=getId(a);const isSel=assignData.formId===fid;
                            return e('div',{key:fid,className:'assign-app-card'+(isSel?' selected':''),onClick:()=>setAssignData(p=>({...p,formId:isSel?'':fid})),tabIndex:0,role:'option','aria-selected':isSel,onKeyDown:ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();setAssignData(p=>({...p,formId:isSel?'':fid}))}}},
                                e('div',{className:'assign-app-card-left'},
                                    e('div',{className:'assign-app-card-check'},isSel?e('i',{className:'fas fa-check-circle',style:{color:'var(--primary)'}}):e('i',{className:'far fa-circle'})),
                                    e('div',{className:'assign-app-card-info'},
                                        e('div',{className:'assign-app-card-title'},getTitle(a)),
                                        e('div',{className:'assign-app-card-meta'},
                                            e('span',null,e('i',{className:'fas fa-user'}),' ',getName(a)),
                                            e('span',null,e('i',{className:'fas fa-tag'}),' ',statusLabel(getStatus(a))),
                                            a.budget||a.Budget?e('span',null,e('i',{className:'fas fa-coins'}),' ',((Number(a.budget||a.Budget||0))/EUR_BGN).toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0}),' €'):null
                                        )
                                    )
                                ),
                                e('div',{className:'assign-app-card-arrow'},e('i',{className:'fas fa-chevron-right'}))
                            );
                        });
                    })()
                )
            )
        ),
        // ═══════════════════════════════════════════════════════════════
        // STEP 2 — Избери рецензенти
        // ═══════════════════════════════════════════════════════════════
        assignStep===2&&e('div',{className:'assign-step-body'},
            // ── Project context banner ──
            (()=>{const selApp=applications.find(a=>getId(a)===assignData.formId);if(!selApp)return null;return e('div',{className:'assign-context-banner'},
                e('i',{className:'fas fa-file-alt',style:{color:'var(--primary)'}}),
                e('div',null,e('strong',null,getTitle(selApp)),e('span',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginLeft:'.4rem'}},'— '+getName(selApp)))
            );})(),

            // ── Reviewer pool section ──
            e('div',{className:'assign-section-header'},
                e('span',null,e('i',{className:'fas fa-users'}),' Пул рецензенти'),
                reviewerPool.length>0&&e('span',{className:'count-chip',style:{marginLeft:'.4rem'}},reviewerPool.filter(r=>r.status!=='inactive').length,' налични')
            ),
            reviewerPool.length>0
            ?e(Fragment,null,
                // ── Search/filter ──
                e('div',{className:'search-wrap',style:{marginBottom:'.65rem'}},
                    e('i',{className:'fas fa-search'}),
                    e('input',{className:'search-input',placeholder:'Филтрирай по име или имейл…',value:assignSearch,onChange:ev=>setAssignSearch(ev.target.value)})
                ),
                e('div',{className:'reviewer-pool-grid'},
                (()=>{
                    const q=assignSearch.trim().toLowerCase();
                    const filtered=reviewerPool.filter(r=>r.status!=='inactive'&&(!q||(r.name||'').toLowerCase().includes(q)||(r.email||'').toLowerCase().includes(q)));
                    if(!filtered.length)return e('div',{style:{gridColumn:'1/-1',padding:'1rem',textAlign:'center',color:'var(--ink-4)',fontSize:'.8rem'}},q?'Няма резултати за „'+assignSearch+'".':'Няма налични рецензенти.');
                    return filtered.map(r=>{
                        const isSelected=assignData.reviewers.some(sel=>(typeof sel==='string'?sel:sel.email)===r.email);
                        const sBadge=r.status==='consented'?'consented':r.status==='reviewed'?'reviewed':'pending';
                        return e('div',{key:r.id||r.email,className:'reviewer-pool-item'+(isSelected?' selected':''),onClick:()=>{
                            setAssignData(p=>{
                                const emails=p.reviewers.map(x=>typeof x==='string'?x:x.email);
                                if(emails.includes(r.email))return{...p,reviewers:p.reviewers.filter(x=>(typeof x==='string'?x:x.email)!==r.email)};
                                return{...p,reviewers:[...p.reviewers,{email:r.email,name:r.name}]};
                            });
                        },tabIndex:0,role:'checkbox','aria-checked':isSelected,onKeyDown:ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();setAssignData(p=>{const emails=p.reviewers.map(x=>typeof x==='string'?x:x.email);if(emails.includes(r.email))return{...p,reviewers:p.reviewers.filter(x=>(typeof x==='string'?x:x.email)!==r.email)};return{...p,reviewers:[...p.reviewers,{email:r.email,name:r.name}]};})}}},
                            e('div',{className:'rp-check'},e('i',{className:'fas fa-check'})),
                            e('div',{className:'rp-info'},
                                e('div',{className:'rp-name'},r.name||r.email),
                                e('div',{className:'rp-email'},r.email),
                                r.reviewerFee>0&&e('div',{style:{fontSize:'.62rem',color:'var(--gold)',marginTop:'.1rem',display:'flex',alignItems:'center',gap:'.2rem'}},e('i',{className:'fas fa-coins',style:{fontSize:'.55rem'}}),r.reviewerFee,' ',r.reviewerFeeCurrency||'EUR')
                            ),
                            e('span',{className:'reviewer-chip '+sBadge,style:{marginLeft:'auto'}},e('i',{className:'fas '+(sBadge==='reviewed'?'fa-check-double':sBadge==='consented'?'fa-handshake':'fa-clock')}),reviewerStatusLabel(r.status))
                        );
                    });
                })()
                )
            )
            :e('div',{className:'empty-state',style:{padding:'1.2rem',border:'1px dashed var(--border)',borderRadius:'var(--r-sm)'}},
                e('i',{className:'fas fa-spinner spin',style:{fontSize:'1.2rem',color:'var(--ink-4)'}}),
                e('p',{style:{margin:'.4rem 0 0',fontSize:'.78rem'}},'Зареждане на пул рецензенти…'),
                e('button',{className:'btn btn-outline btn-sm',style:{marginTop:'.5rem'},onClick:()=>loadReviewerPool()},e('i',{className:'fas fa-sync-alt'}),' Презареди')
            ),

            // ── Manual add ──
            e('div',{className:'assign-divider'}),
            e('div',{className:'assign-section-header'},e('span',null,e('i',{className:'fas fa-envelope'}),' Добави ръчно по имейл')),
            e('div',{style:{display:'flex',gap:'.5rem',alignItems:'flex-end'}},
                e('div',{className:'form-field',style:{flex:1,marginBottom:0}},
                    e('input',{type:'email',value:assignData.manualEmail||'',onChange:ev=>setAssignData(p=>({...p,manualEmail:ev.target.value})),placeholder:'reviewer@ue-varna.bg',onKeyDown:ev=>{
                        if(ev.key==='Enter'){ev.preventDefault();const em=(assignData.manualEmail||'').trim();if(em&&em.includes('@')&&!assignData.reviewers.some(r=>(typeof r==='string'?r:r.email)===em)){setAssignData(p=>({...p,reviewers:[...p.reviewers,em],manualEmail:''}))}}
                    }})
                ),
                e('button',{className:'btn btn-outline btn-sm',type:'button',disabled:!(assignData.manualEmail||'').trim().includes('@'),onClick:()=>{const em=(assignData.manualEmail||'').trim();if(em&&em.includes('@')&&!assignData.reviewers.some(r=>(typeof r==='string'?r:r.email)===em)){setAssignData(p=>({...p,reviewers:[...p.reviewers,em],manualEmail:''}))}}},e('i',{className:'fas fa-plus'}),' Добави')
            ),

            // ── Selected reviewers chips ──
            assignData.reviewers.length>0&&e('div',{style:{marginTop:'.85rem'}},
                e('div',{className:'assign-section-header',style:{marginBottom:'.35rem'}},e('span',null,e('i',{className:'fas fa-check-circle',style:{color:'var(--ok)'}}),' Избрани рецензенти'),e('span',{className:'count-chip',style:{marginLeft:'.4rem',background:'var(--ok)'}},assignData.reviewers.length)),
                e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.35rem'}},
                    assignData.reviewers.map((r,i)=>{
                        const email=typeof r==='string'?r:r.email;const name=typeof r==='string'?null:r.name;
                        return e('span',{key:email+i,className:'reviewer-chip selected-chip',style:{paddingRight:'.3rem',background:'var(--ok-bg)',border:'1px solid var(--ok-border)',cursor:'default'}},
                            e('i',{className:'fas fa-user',style:{fontSize:'.55rem',color:'var(--ok)'}}),
                            name?name+' ('+email+')':email,
                            e('button',{'aria-label':'Премахни '+email,style:{background:'none',border:'none',cursor:'pointer',color:'var(--err)',padding:'0 .25rem',fontSize:'.82rem',lineHeight:1,display:'inline-flex',alignItems:'center'},onClick:()=>setAssignData(p=>({...p,reviewers:p.reviewers.filter((_,j)=>j!==i)}))},'✕')
                        );
                    })
                )
            )
        ),
        // ═══════════════════════════════════════════════════════════════
        // STEP 3 — Потвърди
        // ═══════════════════════════════════════════════════════════════
        assignStep===3&&e('div',{className:'assign-step-body'},
            e('div',{className:'assign-confirm-card'},
                e('div',{className:'assign-confirm-header'},
                    e('i',{className:'fas fa-clipboard-check',style:{color:'var(--primary)',fontSize:'1.2rem'}}),
                    e('h4',{style:{margin:0}},'Потвърждение за назначаване')
                ),
                e('div',{className:'assign-confirm-section'},
                    e('div',{className:'assign-confirm-label'},e('i',{className:'fas fa-file-alt'}),' Проект'),
                    (()=>{const selApp=applications.find(a=>getId(a)===assignData.formId);if(!selApp)return e('div',{style:{color:'var(--err)'}},'Не е избран проект');return e('div',{className:'assign-confirm-value'},
                        e('strong',null,getTitle(selApp)),
                        e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginTop:'.15rem'}},getName(selApp),' · ',statusLabel(getStatus(selApp)))
                    );})()
                ),
                e('div',{className:'assign-confirm-section'},
                    e('div',{className:'assign-confirm-label'},e('i',{className:'fas fa-users'}),' Рецензенти (',assignData.reviewers.length,')'),
                    !assignData.reviewers.length?e('div',{style:{color:'var(--err)'}},'Не са избрани рецензенти'):
                    e('div',{style:{display:'flex',flexDirection:'column',gap:'.25rem'}},
                        assignData.reviewers.map((r,i)=>{
                            const email=typeof r==='string'?r:r.email;const name=typeof r==='string'?email:r.name;
                            return e('div',{key:email+i,style:{fontSize:'.8rem',display:'flex',alignItems:'center',gap:'.4rem'}},
                                e('i',{className:'fas fa-user',style:{color:'var(--primary)',fontSize:'.6rem'}}),
                                e('span',null,name===email?email:(name||email)+' ('+email+')')
                            );
                        })
                    )
                ),
                e('div',{className:'assign-confirm-section'},
                    e('div',{className:'assign-confirm-label'},e('i',{className:'fas fa-info-circle'}),' След потвърждение'),
                    e('ul',{style:{margin:'.3rem 0 0 1.2rem',fontSize:'.74rem',color:'var(--ink-3)',lineHeight:1.7}},
                        e('li',null,'Рецензентите ще получат имейл с покана за рецензия'),
                        e('li',null,'Срокът за рецензия е 10 работни дни от датата на съгласие'),
                        (()=>{
                            const selApp=applications.find(a=>getId(a)===assignData.formId);
                            const pType=selApp?String(selApp.projectCode||selApp.ProjectCode||'').toUpperCase().trim():'';
                            const fee=getReviewerFeeForType(pType);
                            if(fee)return e('li',null,'Рецензентско възнаграждение: ',e('strong',null,fee.amount,' ',fee.currency),' (',fee.label,')');
                            return e('li',null,'Рецензентско възнаграждение: до 60 € (съгл. Правилник чл.17)');
                        })()
                    )
                )
            )
        )
        ),
        // ── Footer: navigation buttons ──────────────────────────────
        e('div',{className:'modal-footer',style:{justifyContent:'space-between'}},
            e('div',null,
                assignStep>1&&e('button',{className:'btn btn-outline',onClick:()=>setAssignStep(s=>s-1),disabled:assigning},e('i',{className:'fas fa-arrow-left'}),' Назад')
            ),
            e('div',{style:{display:'flex',gap:'.5rem'}},
                e('button',{className:'btn btn-outline',onClick:closeAssignModal,disabled:assigning},'Отказ'),
                assignStep<3
                    ?e('button',{className:'btn btn-primary',onClick:()=>setAssignStep(s=>s+1),disabled:assignStep===1?!assignData.formId:!assignData.reviewers.length},
                        e('i',{className:'fas fa-arrow-right'}),' Напред',
                        assignStep===2&&assignData.reviewers.length>0?e('span',{style:{marginLeft:'.3rem',opacity:.7}},'('+assignData.reviewers.length+')'):null
                    )
                    :e('button',{className:'btn btn-primary',disabled:assigning||!assignData.formId||!assignData.reviewers.length,onClick:handleAssignReviewers},
                        assigning?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-user-plus'}),
                        ' Потвърди назначаване (',assignData.reviewers.length,')'
                    )
            )
        )
    )
    )),
    showEvaluateModal&&_portal(e('div',{className:'modal-overlay'+(evaluateClosing?' closing':''),onClick:closeEvaluateModal},
    e('div',{className:'modal-box fullscreen'+(evaluateClosing?' closing':''),onClick:ev=>ev.stopPropagation()},
        e('div',{className:'modal-head'},
            e('h3',null,e('i',{className:'fas fa-star'}),' Оценка и класиране на проекти'),
            e('div',{style:{display:'flex',alignItems:'center',gap:'.75rem'}},
                evaluateData.length>0&&e('span',{style:{fontSize:'.78rem',color:'var(--ink-4)'}},evaluateData.length+' проект'+(evaluateData.length===1?'':'а')+' за оценка'),
                e('button',{className:'close-btn',onClick:closeEvaluateModal},e('i',{className:'fas fa-times'}))
            )
        ),
        e('div',{className:'modal-body'},
        evaluateData.length>0?e('div',null,

        e('div',{style:{background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-sm)',padding:'.75rem 1rem',marginBottom:'1.25rem',fontSize:'.78rem',color:'var(--info)',display:'flex',alignItems:'flex-start',gap:'.45rem'}},
            e('i',{className:'fas fa-info-circle',style:{marginTop:'.1rem',flexShrink:0}}),
            e('div',null,
                e('strong',null,'Критерии по скалата за оценка: '),
                'Научна стойност (30 т.) · Приложимост (25 т.) · Екип (20 т.) · Бюджет (15 т.) · Резултати (10 т.) = макс. ',e('strong',null,'100 т.')
            )
        ),

        evaluateData.map((item,idx)=>{
            const sc=evalScores[item.formId]||{status:'approved',comment:'',scores:{}};
            const isExpanded=!!evalExpanded[item.formId];
            const totalScore=calcRubricTotal(sc.scores);
            const pct=Math.round(totalScore/EVAL_MAX_SCORE*100);
            const grade=scoreGrade(totalScore);
            const reviewers=item.reviewers||[];

            return e('div',{key:item.formId,className:'eval-project-card'+(isExpanded?' expanded':'')},
                e('div',{className:'eval-project-head',onClick:()=>setEvalExpanded(p=>({...p,[item.formId]:!p[item.formId]}))},
                    e('i',{className:'fas fa-chevron-right chevron'}),
                    e('div',{className:'eval-project-info'},
                        e('div',{className:'eval-project-title'},item.title||'Проект '+item.formId),
                        e('div',{className:'eval-project-meta'},
                            e('span',null,e('i',{className:'fas fa-user'}),' ',item.applicant||'—'),
                            item.projectType&&e('span',null,e('i',{className:'fas fa-tag'}),' ',item.projectType),
                            e('span',null,e('i',{className:'fas fa-signal'}),' ',statusLabel(item.currentStatus||'submitted'))
                        )
                    ),
                    e('div',{style:{display:'flex',alignItems:'center',gap:'.75rem',flexShrink:0}},
                        e('div',{style:{textAlign:'right'}},
                            e('div',{style:{fontFamily:'var(--font-display)',fontSize:'1.2rem',fontWeight:700,color:totalScore>0?'var(--red)':'var(--ink-5)'}},totalScore>0?totalScore:'—'),
                            e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)'}},'/'+EVAL_MAX_SCORE+' т.')
                        ),
                        totalScore>0&&e('div',{style:{width:'48px',height:'48px',borderRadius:'50%',background:'conic-gradient(var(--'+(grade==='high'?'ok':grade==='medium'?'gold':'err')+') '+pct+'%,var(--bg-2) 0)',display:'flex',alignItems:'center',justifyContent:'center'}},
                            e('div',{style:{width:'36px',height:'36px',borderRadius:'50%',background:'var(--white)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.62rem',fontWeight:700,color:'var(--ink-3)'}},pct+'%')
                        ),
                        e('span',{className:'badge '+(sc.status==='approved'?'approved':sc.status==='rejected'?'rejected':'draft')},sc.status==='approved'?'Одобрен':sc.status==='rejected'?'Отхвърлен':'—')
                    )
                ),

                isExpanded&&e('div',{className:'eval-project-body'},

                    reviewers.length>0&&e('div',{style:{marginBottom:'1rem'}},
                        e('div',{style:{fontSize:'.68rem',fontWeight:700,color:'var(--ink-4)',letterSpacing:'.06em',textTransform:'uppercase',marginBottom:'.45rem'}},'Рецензенти (',reviewers.length,'):'),
                        e('div',{style:{display:'grid',gap:'.4rem'}},
                        reviewers.map((rev,ri)=>{
                            const isObj=typeof rev==='object';
                            const rStatus=isObj?(rev.status||'pending'):'pending';
                            const rName=isObj?(rev.name||rev.email||'Рецензент'):rev;
                            const rScore=isObj?rev.score:null;
                            let rParsed=null;
                            if(isObj&&rev.review){try{const p=JSON.parse(rev.review);if(p&&typeof p==='object')rParsed=p}catch(_){}}
                            const rHasRubric=rParsed&&rParsed.scores&&Object.keys(rParsed.scores).length>0;
                            const rTotal=rHasRubric?calcRubricTotal(rParsed.scores):(Number(rScore)||0);
                            const rGrade=scoreGrade(rTotal);
                            const statusColors={reviewed:'var(--ok)',submitted:'var(--ok)',consented:'var(--gold)',declined:'var(--err)',pending:'var(--ink-4)',assigned:'var(--info)'};
                            return e('div',{key:ri,style:{background:'var(--white)',border:'1px solid var(--border)',borderRadius:'var(--r-xs)',overflow:'hidden'}},
                                e('div',{style:{display:'flex',alignItems:'center',gap:'.45rem',padding:'.45rem .7rem'}},
                                    e('i',{className:'fas '+(rStatus==='reviewed'||rStatus==='submitted'?'fa-check-double':rStatus==='consented'?'fa-handshake':rStatus==='declined'?'fa-times':'fa-clock'),style:{fontSize:'.6rem',color:statusColors[rStatus]||'var(--ink-4)'}}),
                                    e('span',{style:{fontWeight:600,fontSize:'.76rem',flex:1}},rName),
                                    rParsed&&rParsed.recommendation&&e('span',{style:{fontSize:'.6rem',fontWeight:700,padding:'.12rem .35rem',borderRadius:'var(--r-pill)',background:rParsed.recommendation==='approve'?'var(--ok-bg)':'var(--err-bg)',color:rParsed.recommendation==='approve'?'var(--ok)':'var(--err)'}},rParsed.recommendation==='approve'?'Одобрявам':'Не одобрявам'),
                                    rTotal>0&&e('span',{style:{fontSize:'.72rem',fontWeight:700,color:rGrade==='high'?'var(--ok)':rGrade==='medium'?'var(--warn)':'var(--err)'}},rTotal,' т.'),
                                    rStatus==='declined'&&e('span',{style:{fontSize:'.6rem',fontWeight:700,color:'var(--err)',padding:'.12rem .35rem',background:'var(--err-bg)',borderRadius:'var(--r-pill)'}},'Отказана')
                                ),
                                rHasRubric&&e('div',{style:{padding:'.35rem .7rem .5rem',borderTop:'1px solid var(--border)',display:'grid',gap:'.2rem'}},
                                    EVAL_RUBRIC.map(function(cat){
                                        var cs=cat.subcriteria.reduce(function(s,sub){return s+(Number(rParsed.scores[sub.id])||0)},0);
                                        var cp=cat.maxTotal>0?Math.round(cs/cat.maxTotal*100):0;
                                        return e('div',{key:cat.id,style:{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.68rem'}},
                                            e('div',{style:{flex:1,color:'var(--ink-3)'}},cat.label),
                                            e('div',{style:{width:55,height:4,borderRadius:2,background:'var(--bg)',overflow:'hidden'}},
                                                e('div',{style:{width:cp+'%',height:'100%',borderRadius:2,background:cp>=80?'var(--ok)':cp>=50?'var(--warn)':'var(--err)'}})
                                            ),
                                            e('div',{style:{width:36,textAlign:'right',fontWeight:700,fontSize:'.62rem',color:cp>=80?'var(--ok)':cp>=50?'var(--warn)':'var(--err)'}},cs,'/',cat.maxTotal)
                                        )
                                    }),
                                    rParsed.comment&&e('div',{style:{marginTop:'.2rem',fontSize:'.68rem',color:'var(--ink-3)',fontStyle:'italic',borderLeft:'2px solid var(--border)',paddingLeft:'.4rem'}},rParsed.comment.length>120?rParsed.comment.slice(0,120)+'…':rParsed.comment)
                                ),
                                rParsed&&rParsed.decline&&e('div',{style:{padding:'.3rem .7rem',background:'var(--err-bg)',fontSize:'.68rem',color:'var(--err)',borderTop:'1px solid var(--err-border)'}},
                                    'Отказана',rParsed.reason&&e('span',{style:{color:'var(--ink-3)',marginLeft:'.25rem'}},'— ',rParsed.reason)
                                )
                            )
                        })
                        )
                    ),

                    e('div',{className:'rubric-grid'},
                        EVAL_RUBRIC.map(cat=>{
                            const catTotal=cat.subcriteria.reduce((s,sub)=>s+(Number(sc.scores[sub.id])||0),0);
                            return e('div',{key:cat.id,className:'rubric-category'},
                                e('div',{className:'rubric-category-head'},
                                    e('div',{className:'rubric-category-name'},cat.label),
                                    e('span',{className:'rubric-category-max'},catTotal+' / '+cat.maxTotal)
                                ),
                                e('div',{className:'rubric-subcriteria'},
                                    cat.subcriteria.map(sub=>{
                                        const val=sc.scores[sub.id]||'';
                                        const numVal=Number(val)||0;
                                        const isOverMax=numVal>sub.max;
                                        return e('div',{key:sub.id,className:'rubric-subcriterion'},
                                            e('span',{className:'rubric-sub-label'},sub.label),
                                            e('input',{type:'number',className:'rubric-score-input'+(isOverMax?' over-max':''),min:0,max:sub.max,value:val,placeholder:'0',
                                                onChange:ev=>{
                                                    let v=ev.target.value;
                                                    if(v!==''){v=Math.max(0,Math.min(sub.max,parseInt(v)||0))}
                                                    setEvalScores(p=>({...p,[item.formId]:{...p[item.formId],scores:{...(p[item.formId]?.scores||{}),[sub.id]:v}}}));
                                                }
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
                        e('div',{className:'eval-total-score'},totalScore,e('span',{className:'of-max'},' / '+EVAL_MAX_SCORE+' т.'))
                    ),

                    e('div',{className:'eval-decision-row'},
                        e('span',{style:{fontSize:'.72rem',fontWeight:700,color:'var(--ink-3)',marginRight:'.25rem'}},'Решение:'),
                        e('button',{type:'button',className:'eval-decision-btn approve'+(sc.status==='approved'?' selected':''),onClick:()=>setEvalScores(p=>({...p,[item.formId]:{...p[item.formId],status:'approved'}}))},e('i',{className:'fas fa-check-circle'}),' Одобрен'),
                        e('button',{type:'button',className:'eval-decision-btn reject'+(sc.status==='rejected'?' selected':''),onClick:()=>setEvalScores(p=>({...p,[item.formId]:{...p[item.formId],status:'rejected'}}))},e('i',{className:'fas fa-times-circle'}),' Отхвърлен')
                    ),

                    e('div',{className:'eval-comment-box'},
                        e('label',null,'Коментар / мотиви на комисията'),
                        e('textarea',{value:sc.comment||'',onChange:ev=>{const v=ev.target.value;setEvalScores(p=>({...p,[item.formId]:{...p[item.formId],comment:v}}))},placeholder:'Мотиви за решението, препоръки, забележки…'})
                    ),

                    e('div',{className:'eval-actions'},
                        e('button',{className:'btn btn-primary',disabled:!sc.status,onClick:()=>handleEvaluateSingle(item.formId)},e('i',{className:'fas fa-save'}),' Запиши оценка (',totalScore,' т.)')
                    )
                )
            )
        })

        ):e('div',{className:'empty-state'},e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-clipboard-check'})),e('h4',null,'Няма проекти за оценка'),e('p',null,'Проекти със статус подадени, допуснати, при рецензенти или рецензирани ще се появят тук.'))
        ),
        e('div',{className:'modal-footer'},e('button',{className:'btn btn-outline',onClick:closeEvaluateModal},'Затвори'))
    )
    )),
    showContractModal&&_portal(e('div',{className:'modal-overlay'+(contractClosing?' closing':''),onClick:closeContractModal},
    e('div',{className:'modal-box wide'+(contractClosing?' closing':''),onClick:ev=>ev.stopPropagation()},
        e('div',{className:'modal-head'},e('h3',null,e('i',{className:'fas fa-file-contract'}),' Генерирани договори'),e('button',{className:'close-btn',onClick:closeContractModal},e('i',{className:'fas fa-times'}))),
        e('div',{className:'modal-body'},
        contractData.length>0?e('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}},
            e('thead',null,e('tr',{style:{borderBottom:'2px solid var(--border)',background:'var(--surface)'}},
            e('th',{style:{padding:'.6rem',textAlign:'left'}},'Проект'),
            e('th',{style:{padding:'.6rem',textAlign:'center'}},'Статус'),
            e('th',{style:{padding:'.6rem',textAlign:'center'}},'Действие')
            )),
            e('tbody',null,contractData.map((item,idx)=>e('tr',{key:idx,style:{borderBottom:'1px solid var(--border)'}},
            e('td',{style:{padding:'.6rem'}},item.formId),
            e('td',{style:{padding:'.6rem',textAlign:'center'}},
                e('span',{style:{padding:'.2rem .5rem',borderRadius:'var(--r-pill)',fontSize:'.75rem',background:item.success?'var(--ok-bg)':'var(--err-bg)',color:item.success?'var(--ok)':'var(--err)'}},item.success?'Генериран':'Грешка')
            ),
            e('td',{style:{padding:'.6rem',textAlign:'center'}},
                item.link?e('a',{href:item.link,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm'},e('i',{className:'fas fa-external-link-alt'}),' Отвори'):e('span',{style:{color:'var(--ink-4)'}},'—')
            )
            )))
        ):e('p',{style:{color:'var(--ink-4)',textAlign:'center'}},'Няма генерирани договори. Първо одобрете проекти в стъпка 6.')
        ),
        e('div',{className:'modal-footer'},e('button',{className:'btn btn-outline',onClick:closeContractModal},'Затвори'))
    )
    )),
    showCorrectionsModal&&_portal(e('div',{className:'modal-overlay'+(correctionsClosing?' closing':''),onClick:closeCorrectionsModal},
    e('div',{className:'modal-box wide'+(correctionsClosing?' closing':''),onClick:ev=>ev.stopPropagation()},
        e('div',{className:'modal-head'},e('h3',null,e('i',{className:'fas fa-pen-to-square'}),' Върнати за корекции'),e('button',{className:'close-btn',onClick:closeCorrectionsModal},e('i',{className:'fas fa-times'}))),
        e('div',{className:'modal-body'},
        (()=>{
            const corrApps=applications.filter(a=>['returned','needs_correction','resubmitted'].includes(getStatus(a)));
            if(!corrApps.length)return e('div',{className:'empty-state'},e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-check-circle'})),e('h4',null,'Няма върнати заявления'),e('p',null,'Всички коригирани заявления са обработени.'));
            return e('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'.85rem'}},
                e('thead',null,e('tr',{style:{borderBottom:'2px solid var(--border)',background:'var(--surface)'}},
                e('th',{style:{padding:'.6rem',textAlign:'left'}},'Проект'),
                e('th',{style:{padding:'.6rem',textAlign:'left'}},'Заявител'),
                e('th',{style:{padding:'.6rem',textAlign:'center'}},'Статус'),
                e('th',{style:{padding:'.6rem',textAlign:'center'}},'Действие')
                )),
                e('tbody',null,corrApps.map((app,idx)=>{
                const st=getStatus(app);
                return e('tr',{key:getId(app)||idx,style:{borderBottom:'1px solid var(--border)',background:idx%2===0?'var(--white)':'var(--surface)'}},
                    e('td',{style:{padding:'.6rem'}},e('div',{style:{fontWeight:600}},getTitle(app))),
                    e('td',{style:{padding:'.6rem'}},getName(app)),
                    e('td',{style:{padding:'.6rem',textAlign:'center'}},e('span',{className:'badge '+(st==='resubmitted'?'submitted':'returned')},statusLabel(st))),
                    e('td',{style:{padding:'.6rem',textAlign:'center'}},
                    st==='resubmitted'?e('button',{className:'btn btn-primary btn-sm',
                        onClick:()=>{const fid=getId(app);api('updateStatus',{...(_adminCreds||{}),id:fid,status:'admin_passed',isAdmin:true}).then(res=>{if(res.success){toast('Допуснато след корекция.','success');loadApplications(null,true);}else toast(res.error||'Грешка','error')}).catch(err=>toast(err.message,'error'))}
                    },e('i',{className:'fas fa-check'}),' Допусни'):
                    e('span',{style:{fontSize:'.72rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-hourglass-half'}),' ',st==='returned'?'Чака корекция':'В процес')
                    )
                )}))
            );
        })()
        ),
        e('div',{className:'modal-footer'},e('button',{className:'btn btn-outline',onClick:closeCorrectionsModal},'Затвори'))
    )
    )),
    // ── Inline reason mini-modal (return-for-correction / reject / etc.) ─────
    reasonPrompt&&_portal(e('div',{className:'modal-overlay',onClick:()=>setReasonPrompt(null)},
        e('div',{className:'modal-box',style:{maxWidth:'480px'},onClick:ev=>ev.stopPropagation()},
            e('div',{className:'modal-head'},
                e('h3',null,e('i',{className:'fas '+(reasonPrompt.icon||'fa-comment-dots')}),' ',reasonPrompt.label||'Основание'),
                e('button',{className:'close-btn',onClick:()=>setReasonPrompt(null)},e('i',{className:'fas fa-times'}))
            ),
            e('div',{className:'modal-body'},
                e('p',{style:{marginTop:0,fontSize:'.78rem',color:'var(--ink-3)'}},
                    'Заявление ',e('strong',null,(reasonPrompt.formId||'').toUpperCase().slice(0,10)),
                    '. Основанието ще бъде записано в одитния журнал и видимо за кандидата.'
                ),
                e('textarea',{
                    autoFocus:true,
                    value:reasonText,
                    onChange:ev=>setReasonText(ev.target.value),
                    placeholder:reasonPrompt.placeholder||'Опишете накратко основанието…',
                    rows:5,
                    style:{width:'100%',padding:'.6rem',border:'1px solid var(--border)',borderRadius:'var(--r-md)',fontFamily:'inherit',fontSize:'.85rem',resize:'vertical'},
                    onKeyDown:ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key==='Enter')submitReason();}
                }),
                e('div',{style:{marginTop:'.4rem',fontSize:'.7rem',color:'var(--ink-5)'}},'Подсказка: Ctrl+Enter за изпращане.')
            ),
            e('div',{className:'modal-footer'},
                e('button',{className:'btn btn-outline',onClick:()=>setReasonPrompt(null)},'Отказ'),
                e('button',{className:'btn btn-'+(reasonPrompt.color||'primary'),onClick:submitReason,disabled:!(reasonText||'').trim()},
                    e('i',{className:'fas '+(reasonPrompt.icon||'fa-check')}),' Потвърди'
                )
            )
        )
    ))
);
};
// ============================================================
// ContestBoardView — Applicant-facing contest board
// Shows active contests, days remaining, and apply buttons
// ============================================================
var ContestBoardView=({user,isAdmin,onApply})=>{
const _CB_CACHE_KEY='erp:contestBoard:'+(user?.email||'anon');
const _CB_FRESH_MS=60000; // skip mount-time network fetch when cache younger than this
const _readBoardCache=()=>{try{const raw=sessionStorage.getItem(_CB_CACHE_KEY);if(!raw)return null;const p=JSON.parse(raw);return p&&Array.isArray(p.board)?p:null}catch(_){return null}};
const _cachedEntry=_readBoardCache();
const[board,setBoard]=useState(_cachedEntry?_cachedEntry.board:[]);const[loading,setLoading]=useState(!_cachedEntry);const[error,setError]=useState('');
const[filter,setFilter]=useState('all'); // all | open | applied | closed

const loadBoard=useCallback(async(forceRefresh=false)=>{
    const cached=_readBoardCache();
    if(!cached)setLoading(true);
    setError('');
    try{
        const res=await api('getContestBoard',{userId:user?.email||'',email:user?.email||'',forceRefresh:!!forceRefresh});
        if(res.success){
            const list=Array.isArray(res.board)?res.board:[];
            setBoard(list);
            try{sessionStorage.setItem(_CB_CACHE_KEY,JSON.stringify({board:list,ts:Date.now()}))}catch(_){}
        }else{setError(res.error||'Грешка при зареждане');}
    }catch(err){setError('Мрежова грешка: '+err.message)}finally{setLoading(false)}
},[user?.email]);

useEffect(()=>{
    // SWR: if we have a fresh cache (<60s), skip mount-time refetch — polling will refresh later.
    const cached=_readBoardCache();
    if(cached&&cached.ts&&(Date.now()-cached.ts)<_CB_FRESH_MS)return;
    loadBoard(false);
},[loadBoard]);

/* Live polling for contest board */
useEffect(()=>{
    const pollMs=Math.max(UI_REFRESH_INTERVALS.userCompetitions||45000,45000);
    let lastWake=0;
    const tick=()=>{if(isPageVisible())loadBoard(false).catch(()=>{})};
    const id=setInterval(tick,pollMs);
    const onWake=()=>{
        if(!isPageVisible())return;
        const now=Date.now();
        if(now-lastWake<10000)return; // throttle focus+visibilitychange double-fire
        lastWake=now;
        loadBoard(false).catch(()=>{}); // hit backend cache on wake
    };
    window.addEventListener('focus',onWake);
    document.addEventListener('visibilitychange',onWake);
    return()=>{clearInterval(id);window.removeEventListener('focus',onWake);document.removeEventListener('visibilitychange',onWake)};
},[loadBoard]);

const boardCounts=useMemo(()=>board.reduce((acc,contest)=>{
    acc.all++;
    if(contest.canApply)acc.open++;
    else acc.closed++;
    if(contest.myApplications&&contest.myApplications.length>0)acc.applied++;
    return acc;
},{all:0,open:0,applied:0,closed:0}),[board]);

const filtered=useMemo(()=>{
    if(filter==='all')return board;
    if(filter==='open')return board.filter(c=>c.canApply);
    if(filter==='applied')return board.filter(c=>c.myApplications&&c.myApplications.length>0);
    if(filter==='closed')return board.filter(c=>!c.canApply);
    return board;
},[board,filter]);

const statusColor=(s)=>{
    if(s==='draft')return 'var(--info)';if(s==='submitted')return 'var(--warn)';
    if(s==='approved')return 'var(--ok)';if(s==='rejected')return 'var(--err)';
    if(s==='returned')return 'var(--warn)';return 'var(--ink-4)';
};

return e(Fragment,null,
    e('div',{className:'page-top'},
        e('div',{className:'page-top-left'},
            e('h2',null,e('i',{className:'fas fa-bullhorn',style:{color:'var(--red)',marginRight:'.5rem'}}),'Табло за конкурси'),
            e('p',null,'Разгледайте активните конкурси и кандидатствайте директно')
        ),
        e('div',{className:'page-top-actions'},
            e('button',{className:'btn btn-outline btn-sm',onClick:()=>loadBoard(true),disabled:loading},e('i',{className:'fas fa-sync-alt'+(loading?' spin':'')}),loading?' Зареждане…':' Обнови')
        )
    ),
    // Filter chips
    e('div',{className:'filter-bar',style:{marginBottom:'1.2rem'}},
        [{id:'all',label:'Всички',count:boardCounts.all},
         {id:'open',label:'Отворени',count:boardCounts.open},
         {id:'applied',label:'Моите',count:boardCounts.applied},
         {id:'closed',label:'Затворени',count:boardCounts.closed}
        ].map(f=>e('button',{key:f.id,className:'chip'+(filter===f.id?' active':''),onClick:()=>setFilter(f.id)},f.label,' ',e('span',{className:'count-chip'},f.count)))
    ),
    error&&e('div',{style:{background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',padding:'.75rem 1rem',marginBottom:'1rem',fontSize:'.82rem',color:'var(--err)'}},e('i',{className:'fas fa-exclamation-circle'}),' ',error),
    // ── Info banner: reminder to review general competition info before applying ──
    !loading&&board.length>0&&e('div',{style:{padding:'.65rem .85rem',marginBottom:'1rem',background:'#f0f4ff',border:'1px solid #c5d5f7',borderRadius:6,fontSize:'.78rem',color:'#2c5282',lineHeight:1.6,display:'flex',alignItems:'flex-start',gap:'.5rem'}},
        e('i',{className:'fas fa-info-circle',style:{color:'#3b82f6',fontSize:'.95rem',flexShrink:0,marginTop:'.1rem'}}),
        e('div',null,
            e('div',{style:{fontWeight:700,marginBottom:'.2rem'}},'Преди да кандидатствате'),
            e('div',null,'Моля, запознайте се с общата информация за конкурсната сесия 2026 на сайта на Конкурсна сесия 2026: ',
                e('a',{href:'https://sites.google.com/ue-varna.bg/scientific-projects/2026-projects',target:'_blank',rel:'noopener noreferrer',style:{color:'#3b82f6',fontWeight:600,textDecoration:'underline'}},'https://sites.google.com/ue-varna.bg/scientific-projects/2026-projects')),
            e('div',{style:{marginTop:'.3rem'}},'В зависимост от вида на проектното предложение, което ще подавате, можете предварително да изтеглите формулярите от секция „Документи".')
        )
    ),
    // Background-refresh hint: thin animated strip above the grid when reloading
    // an already-populated board (cold load uses the skeleton grid below).
    loading&&board.length>0&&e('div',{style:{position:'relative',height:'2px',marginBottom:'.4rem'}},e('div',{className:'loading-strip active'})),
    loading&&board.length===0?e('div',{className:'document-grid'},Array.from({length:6}).map((_,i)=>e('div',{key:i,className:'doc-card cb-skeleton','aria-hidden':true},
        e('div',{className:'doc-header'},e('div',{className:'cb-skel-icon'}),e('div',{style:{flex:1}},e('div',{className:'cb-skel-line w70'}),e('div',{className:'cb-skel-line w40',style:{marginTop:6}}))),
        e('div',{className:'cb-skel-line w90',style:{marginTop:14}}),
        e('div',{className:'cb-skel-line w80',style:{marginTop:8}}),
        e('div',{className:'cb-skel-line w60',style:{marginTop:8}}),
        e('div',{className:'cb-skel-btn',style:{marginTop:14}})
    ))):
    filtered.length===0?e('div',{className:'empty-state'},e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-bullhorn'})),e('h4',null,'Няма конкурси'),e('p',null,'В момента няма налични конкурси за показване.')):
    e('div',{className:'document-grid'},filtered.map(contest=>
        e('div',{key:contest.id,className:'doc-card',style:{borderTopColor:contest.canApply?'var(--ok)':'var(--border-2)'}},
            e('div',{className:'doc-header'},
                e('div',{className:'doc-icon-wrap',style:{background:contest.canApply?'var(--ok-bg)':'var(--bg)',color:contest.canApply?'var(--ok)':'var(--ink-4)',border:'1px solid '+(contest.canApply?'var(--ok-border)':'var(--border)')}},
                    e('i',{className:'fas fa-trophy'})
                ),
                e('div',{style:{flex:1,minWidth:0}},
                    e('div',{className:'doc-title'},contest.name),
                    e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.15rem'}},contest.id)
                )
            ),
            // Deadline + days remaining
            contest.deadline&&e('div',{className:'contest-deadline-row'},
                e('i',{className:'fas fa-clock'}),
                e('span',null,'Краен срок: ',
                    e('strong',null,fmtDate(contest.deadline))),
                contest.daysRemaining!=null&&!isNaN(contest.daysRemaining)&&e('span',{className:'days-badge '+(contest.daysRemaining<=0?'expired':contest.daysRemaining<=3?'urgent':contest.daysRemaining<=7?'urgent':contest.daysRemaining<=30?'soon':'ok')},
                    contest.daysRemaining<=0?'Изтекъл':contest.daysRemaining===0?'Днес':contest.daysRemaining+' дни')
            ),
            // Description
            contest.description&&e('p',{style:{fontSize:'.78rem',color:'var(--ink-3)',lineHeight:'1.55',marginBottom:'.65rem',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}},contest.description),
            // Stats row
            e('div',{className:'doc-meta',style:{marginBottom:'.65rem'}},
                e('span',{className:'doc-size'},e('i',{className:'fas fa-users'}),' ',contest.applicantCount,' заявления'),
                e('span',{className:'doc-type-badge',style:{
                    background:contest.status==='results_published'?'var(--info-bg)':contest.canApply?'var(--ok-bg)':'var(--bg)',
                    color:contest.status==='results_published'?'var(--info)':contest.canApply?'var(--ok)':'var(--ink-4)',
                    borderColor:contest.status==='results_published'?'var(--info-border)':contest.canApply?'var(--ok-border)':'var(--border)'}},
                    contest.status==='results_published'?'Публикуван':contest.canApply?'Отворен':'Затворен')
            ),
            // My applications for this contest
            contest.myApplications&&contest.myApplications.length>0&&e('div',{style:{borderTop:'1px solid var(--border)',paddingTop:'.55rem',marginBottom:'.55rem'}},
                e('div',{style:{fontSize:'.64rem',fontWeight:700,color:'var(--ink-4)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:'.35rem'}},'Моите заявления'),
                contest.myApplications.map(app=>
                    e('div',{key:app.id,style:{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.73rem',padding:'.18rem 0'}},
                        e('span',{style:{width:6,height:6,borderRadius:'50%',background:statusColor(app.status),flexShrink:0}}),
                        e('span',{style:{color:'var(--ink-2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},app.title||app.id),
                        e('span',{className:'badge '+(app.status==='approved'?'approved':(app.status==='submitted'?'submitted':(app.status==='rejected'?'rejected':(app.status==='returned'?'returned':'draft')))),style:{fontSize:'.58rem'}},
                            (STATUS_LABELS[app.status]||app.status))
                    )
                )
            ),
            // Apply button
            contest.canApply&&e('button',{className:'btn btn-primary btn-sm',style:{width:'100%',justifyContent:'center',marginTop:'.3rem'},
                onClick:()=>{if(onApply)onApply(contest.id);}
            },e('i',{className:'fas fa-paper-plane'}),' Кандидатствай')
        )
    ))
);
};
var CalendarView=({onViewCompetition,onApply,isAdmin,userEmail,competitions:propCompetitions})=>{
const _CAL_CACHE_KEY='erp:calEvents:'+(isAdmin?'a':'p')+':'+(userEmail||'anon');
const _readCalCache=()=>{try{const raw=sessionStorage.getItem(_CAL_CACHE_KEY);if(!raw)return null;const p=JSON.parse(raw);return Array.isArray(p?.events)?p.events:null}catch(_){return null}};
// ── Phase 5: synchronous fallback from propCompetitions for instant first paint ──
// Calendar previously sat on a 2s spinner waiting for getcalendarevents even
// though the parent App already has competitions in memory. Build a minimal
// event list from props on the very first render so the grid is interactive
// immediately; the richer API events upgrade in the background.
const _buildPropFallback=(comps)=>{
    const list=Array.isArray(comps)?comps:[];
    const evts=[];
    list.forEach(c=>{
    if(!c||!c.id)return;
    const dl=c.dateEnd||c.deadline||'';
    if(dl)evts.push({id:'comp_deadline_'+c.id,competitionId:c.id,title:'Краен срок: '+c.name,description:c.description||'',date:dl,type:'deadline',status:c.status||'active',color:'#7B1B1B'});
    const cr=c.created||'';
    if(cr)evts.push({id:'comp_created_'+c.id,competitionId:c.id,title:'Обявен конкурс: '+c.name,description:c.description||'',date:cr,type:'created',status:c.status||'active',color:'#1A5C38'});
    });
    return evts;
};
const _initialEvents=_readCalCache()||_buildPropFallback(propCompetitions||COMPETITIONS);
const[currentDate,setCurrentDate]=useState(()=>new Date());const[selectedDate,setSelectedDate]=useState(null);const[events,setEvents]=useState(_initialEvents);
// Loading spinner appears ONLY when we have absolutely nothing to show.
const[loading,setLoading]=useState(_initialEvents.length===0);
const[expandedEvent,setExpandedEvent]=useState(null);
const year=currentDate.getFullYear();const month=currentDate.getMonth();
const daysInMonth=new Date(year,month+1,0).getDate();const firstDayOfMonth=new Date(year,month,1).getDay();
const startDayIndex=firstDayOfMonth===0?6:firstDayOfMonth-1;
const monthNames=['Януари','Февруари','Март','Април','Май','Юни','Юли','Август','Септември','Октомври','Ноември','Декември'];
const dayNames=['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];

const buildFallbackEvents=useCallback(comps=>{
const list=Array.isArray(comps)?comps:[];
const evts=[];
list.forEach(c=>{
const dl=c.dateEnd||c.deadline||'';
if(dl){evts.push({id:'comp_deadline_'+c.id,competitionId:c.id,title:'Краен срок: '+c.name,description:c.description||'',date:dl,type:'deadline',status:c.status||'active',color:'#7B1B1B'})}
const cr=c.created||'';
if(cr){evts.push({id:'comp_created_'+c.id,competitionId:c.id,title:'Обявен конкурс: '+c.name,description:c.description||'',date:cr,type:'created',status:c.status||'active',color:'#1A5C38'})}
});
return evts;
},[]);
const loadEvents=useCallback(async(forceRefresh=false)=>{
    // Always build local "Обявен конкурс" (created) timeline events from competitions —
    // backend getcalendarevents historically returns only deadlines/submissions, so we
    // merge created-events client-side to guarantee they appear in the общ преглед.
    const _localCreated=()=>{
        const comps=Array.isArray(propCompetitions)&&propCompetitions.length?propCompetitions:COMPETITIONS;
        return (comps||[]).filter(c=>c.created).map(c=>({id:'comp_created_'+c.id,competitionId:c.id,title:'Обявен конкурс: '+(c.name||c.id),description:c.description||'',date:c.created,type:'created',status:c.status||'active',color:'#1A5C38'}));
    };
    const _mergeWithCreated=(apiEvts)=>{
        const seen=new Set((apiEvts||[]).map(e=>e&&e.id).filter(Boolean));
        const created=_localCreated().filter(e=>!seen.has(e.id));
        return (apiEvts||[]).concat(created);
    };
    try{
    const payload={isAdmin:!!isAdmin,userId:(userEmail||''),forceRefresh:!!forceRefresh};
    if(isAdmin&&_adminCreds)Object.assign(payload,_adminCreds);
    const res=await api('getcalendarevents',payload);
    const evts=_mergeWithCreated((res.data?.events||res.events)||[]);
    if(evts.length>0){
        setEvents(prev=>eventsSignature(prev)===eventsSignature(evts)?prev:evts);
        try{sessionStorage.setItem(_CAL_CACHE_KEY,JSON.stringify({events:evts,ts:Date.now()}))}catch(_){}
        setLoading(false);return
    }
    }catch(_){
    }
    try{
    const authPayload={isAdmin:!!isAdmin,userId:(userEmail||'')};
    if(isAdmin&&_adminCreds)Object.assign(authPayload,_adminCreds);
    const comps=await refreshCompetitions(authPayload,{forceRefresh:!!forceRefresh});
    const nextEvents=buildFallbackEvents(comps);
    if(nextEvents.length>0){setEvents(prev=>eventsSignature(prev)===eventsSignature(nextEvents)?prev:nextEvents);setLoading(false);return}
    }catch(_){}
    const propEvents=buildFallbackEvents(propCompetitions||COMPETITIONS);
    setEvents(prev=>eventsSignature(prev)===eventsSignature(propEvents)?prev:propEvents);
    setLoading(false);
},[isAdmin,userEmail,buildFallbackEvents,propCompetitions]);
useEffect(()=>{if(events.length===0&&!_readCalCache())setLoading(true);loadEvents(false)},[loadEvents]);
useEffect(()=>{
    // When App-level competitions update, immediately refresh displayed events
    if(propCompetitions&&propCompetitions.length>0){
    const propEvts=buildFallbackEvents(propCompetitions);
    setEvents(prev=>{
        if(prev.length>0&&prev[0]&&(prev[0].id?!prev[0].id.startsWith('comp_'):!!prev[0].competitionId))return prev; // Keep richer API events
        return eventsSignature(prev)===eventsSignature(propEvts)?prev:propEvts;
    });
    }
},[propCompetitions,buildFallbackEvents]);
useEffect(()=>{
    const pollMs=isAdmin?UI_REFRESH_INTERVALS.adminCalendar:UI_REFRESH_INTERVALS.userCalendar;
    const tick=()=>{if(!isPageVisible())return;loadEvents().catch(()=>{})};
    const id=setInterval(tick,pollMs);
    const onWake=()=>{if(isPageVisible())loadEvents(true).catch(()=>{})};
    window.addEventListener('focus',onWake);
    document.addEventListener('visibilitychange',onWake);
    return()=>{clearInterval(id);window.removeEventListener('focus',onWake);document.removeEventListener('visibilitychange',onWake)}
},[loadEvents,isAdmin]);

const handlePrevMonth=()=>setCurrentDate(new Date(year,month-1,1));
const handleNextMonth=()=>setCurrentDate(new Date(year,month+1,1));
const handleToday=()=>{setCurrentDate(new Date());setSelectedDate(null)};

const parseDateString=useCallback(ds=>{const d=new Date(ds);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`},[]);
const eventMap=useMemo(()=>{const map={};events.forEach(evt=>{const k=parseDateString(evt.date);if(!map[k])map[k]=[];map[k].push(evt)});return map},[events,parseDateString]);

const typeLabels={deadline:'Краен срок',submission:'Подадено заявление',created:'Обявен конкурс'};
const typeIcons={deadline:'fa-flag-checkered',submission:'fa-paper-plane',created:'fa-bullhorn'};
const typeColors={deadline:'var(--red)',submission:'var(--gold)',created:'var(--ok)'};

const renderGrid=()=>{
    const cells=[];
    for(let i=0;i<7;i++)cells.push(e('div',{key:`dh-${i}`,className:'calendar-day-header'},dayNames[i]));
    for(let i=0;i<startDayIndex;i++)cells.push(e('div',{key:`emp-${i}`,className:'calendar-day empty'}));
    const today=new Date();const todayKey=`${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    for(let d=1;d<=daysInMonth;d++){
    const dateKey=`${year}-${month}-${d}`;const evts=eventMap[dateKey]||[];
    const isToday=todayKey===dateKey;const hasEvent=evts.length>0;const isSelected=selectedDate===dateKey;
    cells.push(e('div',{key:`d-${d}`,className:`calendar-day ${hasEvent?'has-event':''} ${isToday?'today':''} ${isSelected?'selected':''}`,onClick:()=>{setSelectedDate(isSelected?null:dateKey);setExpandedEvent(null)}},e('div',{className:'calendar-date'},d),hasEvent&&e('div',{className:'calendar-event-dot',style:{background:evts[0].color||'var(--red)'}})));
    }
    return cells;
};

const selectedEvents=useMemo(()=>selectedDate?(eventMap[selectedDate]||[]):[],[selectedDate,eventMap]);
const todayStartTs=useMemo(()=>{const d=new Date();d.setHours(0,0,0,0);return d.getTime()},[]);
// Общ преглед / таймлайн: ВСИЧКИ събития (минали обявявания + предстоящи срокове + подадени)
// Сортирани хронологично (descending — най-нови най-горе), с „today" маркер между минали и предстоящи.
const timelineEvents=useMemo(()=>events.slice().sort((a,b)=>new Date(b.date)-new Date(a.date)),[events]);
const displayEvents=selectedDate?selectedEvents:timelineEvents;

const renderEventCard=(evt)=>{
    const isExpanded=expandedEvent===evt.id;
    const hasComp=!!evt.competitionId;
    const evtColor=typeColors[evt.type]||'var(--warn)';
    return e('div',{key:evt.id,style:{border:'1px solid var(--border)',borderRadius:'var(--r-sm)',background:'var(--surface)',overflow:'hidden',borderLeft:'3px solid '+(evt.color||evtColor),transition:'all .16s'}},
    e('div',{style:{padding:'.75rem 1rem',cursor:'pointer',display:'flex',alignItems:'flex-start',gap:'.65rem'},onClick:()=>setExpandedEvent(isExpanded?null:evt.id)},
        e('div',{style:{flexShrink:0,width:32,height:32,borderRadius:'var(--r-xs)',background:evt.color||evtColor,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'.7rem'}},
        e('i',{className:'fas '+(typeIcons[evt.type]||'fa-calendar')})
        ),
        e('div',{style:{flex:1,minWidth:0}},
        e('div',{style:{fontSize:'.85rem',fontWeight:600,color:'var(--ink)',marginBottom:'.15rem',lineHeight:1.35}},evt.title),
        e('div',{style:{display:'flex',alignItems:'center',gap:'.6rem',flexWrap:'wrap'}},
            e('span',{style:{fontSize:'.72rem',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.25rem'}},e('i',{className:'far fa-calendar-alt'}),fmtDate(evt.date)),
            e('span',{style:{fontSize:'.62rem',fontWeight:700,padding:'.12rem .4rem',borderRadius:'var(--r-pill)',background:evt.color?evt.color+'1a':'var(--warn-bg)',color:evt.color||'var(--warn)',letterSpacing:'.04em',textTransform:'uppercase'}},typeLabels[evt.type]||'Събитие')
        )
        ),
        e('i',{className:'fas fa-chevron-'+(isExpanded?'up':'down'),style:{color:'var(--ink-4)',fontSize:'.7rem',flexShrink:0,marginTop:'.3rem'}})
    ),
    isExpanded&&e('div',{style:{padding:'0 1rem .85rem 1rem',borderTop:'1px solid var(--border)'}},
        evt.description&&e('p',{style:{fontSize:'.8rem',color:'var(--ink-3)',lineHeight:1.55,margin:'.65rem 0',whiteSpace:'pre-wrap'}},evt.description),
        evt.status&&e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',marginBottom:'.6rem'}},e('i',{className:'fas fa-info-circle',style:{marginRight:'.3rem'}}),'Статус: ',e('strong',null,evt.status==='active'?'Активен':'Приключил')),
        hasComp&&e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',marginTop:'.5rem'}},
        e('button',{className:'btn btn-outline btn-sm',onClick:ev=>{ev.stopPropagation();onViewCompetition&&onViewCompetition(evt.competitionId)}},e('i',{className:'fas fa-trophy'}),' Виж конкурса'),
        !isAdmin&&evt.type!=='submission'&&e('button',{className:'btn btn-primary btn-sm',onClick:ev=>{ev.stopPropagation();onApply&&onApply(evt.competitionId)}},e('i',{className:'fas fa-paper-plane'}),' Кандидатствай')
        )
    )
    );
};

return e('div',null,
    e('div',{className:'page-top'},
    e('div',{className:'page-top-left'},
        e('h2',null,'Календар'),
        e('p',null,'Конкурсни сесии, крайни срокове и подадени заявления')
    )
    ),
    e('div',{className:'calendar-layout'},
    e('div',{className:'card'},
        e('div',{className:'card-header calendar-header'},
        e('button',{className:'btn btn-outline btn-icon',onClick:handlePrevMonth,title:'Предишен месец'},e('i',{className:'fas fa-chevron-left'})),
        e('h3',{className:'card-title',style:{cursor:'pointer',userSelect:'none'},onClick:handleToday,title:'Към днешна дата'},`${monthNames[month]} ${year}`),
        e('button',{className:'btn btn-outline btn-icon',onClick:handleNextMonth,title:'Следващ месец'},e('i',{className:'fas fa-chevron-right'}))
        ),
        e('div',{className:'card-body'},loading?e('div',{style:{textAlign:'center',padding:'2rem'}},e('i',{className:'fas fa-spinner spin',style:{fontSize:'2rem',color:'var(--ink-4)'}}),e('div',{style:{marginTop:'1rem',color:'var(--ink-4)'}},'Зареждане…')):e('div',{className:'calendar-grid'},renderGrid()))
    ),
    e('div',{className:'card'},
        e('div',{className:'card-header'},e('h3',{className:'card-title'},
            e('i',{className:'fas '+(selectedDate?'fa-calendar-day':'fa-stream'),style:{marginRight:'.4rem',color:'var(--primary)'}}),
            selectedDate?`Събития за ${selectedDate.split('-')[2]} ${monthNames[selectedDate.split('-')[1]].toLowerCase()}`:'Общ преглед',
            !selectedDate&&displayEvents.length>0&&e('span',{className:'count-chip',style:{marginLeft:'.5rem'}},displayEvents.length)
        )),
        e('div',{className:'card-body',style:{display:'flex',flexDirection:'column',gap:'.65rem'}},
        displayEvents.length===0
            ?e('div',{className:'empty-state',style:{padding:'2rem 1rem'}},e('i',{className:'far fa-calendar-times',style:{fontSize:'1.8rem',color:'var(--ink-4)',marginBottom:'.5rem'}}),e('p',null,selectedDate?'Няма събития за тази дата.':'Няма събития.'))
            :(()=>{
                if(selectedDate)return displayEvents.map(evt=>renderEventCard(evt));
                // Timeline: insert a "Днес" separator between future (above) and past (below)
                var nodes=[];var insertedToday=false;
                displayEvents.forEach(function(evt){
                    var ts=new Date(evt.date).getTime();
                    if(!insertedToday&&ts<todayStartTs){
                        nodes.push(e('div',{key:'__today_sep',style:{display:'flex',alignItems:'center',gap:'.55rem',margin:'.35rem 0',padding:'.3rem .6rem',background:'linear-gradient(90deg,rgba(21,147,121,.12),rgba(21,147,121,0))',borderLeft:'3px solid var(--primary)',borderRadius:'var(--r-xs)'}},
                            e('i',{className:'fas fa-circle-dot','aria-hidden':'true',style:{color:'var(--primary)',fontSize:'.7rem'}}),
                            e('span',{style:{fontSize:'.72rem',fontWeight:700,color:'var(--primary)',textTransform:'uppercase',letterSpacing:'.05em'}},'Днес'),
                            e('span',{style:{fontSize:'.7rem',color:'var(--ink-4)'}},'— минали събития ↓')
                        ));
                        insertedToday=true;
                    }
                    nodes.push(renderEventCard(evt));
                });
                return nodes;
            })()
        )
    )
    )
);
};

/* ─── LOGIN ─── */
var LoginScreen=({onLogin})=>{
const[error,setError]=useState('');const[loadingAdmin,setLoadingAdmin]=useState(false);const[loadingGoogle,setLoadingGoogle]=useState(false);const[googleReady,setGoogleReady]=useState(false);const[showPassword,setShowPassword]=useState(false);const[blockedAccount,setBlockedAccount]=useState(null);const googleInit=useRef(false);const gSigninRef=useRef(null);
const[connectEmail,setConnectEmail]=useState('');const[connectLoading,setConnectLoading]=useState(false);const[connectError,setConnectError]=useState('');const[showConnectModal,setShowConnectModal]=useState(false);const[connectOrcId,setConnectOrcId]=useState('');

// v12.54.12-gauth-persist: restore a persisted Google session on mount so the
// user does not have to re-click the Google button after every page reload.
// Reads the stored session blob (localStorage/sessionStorage/cookie/window.name)
// and, if a valid Google email is present, re-validates it against the backend
// and silently re-logs the user in.
useEffect(()=>{
  let _cancelled=false;
  var _sess=_readSession_();
  if(_sess&&_sess.user&&_sess.user.email&&_sess.user.email.indexOf('@')>0){
    setLoadingGoogle(true);
    api('checkadmin',{email:_sess.user.email}).then(function(r){
      if(_cancelled)return;
      if(r&&r.success){
        onLogin({name:_sess.user.name||'',email:_sess.user.email,picture:_sess.user.picture||''},!!r.isAdmin,r.viewRole||(r.role||(r.isAdmin?ROLE_ADMIN:ROLE_APPLICANT)));
      }
    }).catch(function(){}).finally(function(){if(!_cancelled)setLoadingGoogle(false)});
  }
  return function(){_cancelled=true};
},[]);

const handleAdmin=async ev=>{
    ev.preventDefault();const fd=new FormData(ev.target);
    const username=String(fd.get('username')||'').trim();
    const password=String(fd.get('password')||'');
    setError('');setLoadingAdmin(true);
    try{
    const res=await api('adminlogin',{username:username,password:password});
    if(res.success){
      if(res.isAdmin){saveAdminSession({username:username});}else{clearAdminSession();}
      onLogin(res.user,res.isAdmin,res.role||ROLE_ADMIN);
    }else{setError(res.error||'Грешка при вход.')}
    }catch(err){
    setError(err.message||'Грешка при комуникация със сървъра.')
    }finally{setLoadingAdmin(false)}
};

// ORCID OAuth login flow
const handleOrcIDLogin = useCallback(function() {
  setError('');
  setLoadingGoogle(true);
  api('orcid_auth_url', {}).then(function(res) {
    if (!res || !res.success || !res.url) {
      setError((res && res.error) || 'Не може да се генерира URL за ORCID вход.');
      setLoadingGoogle(false);
      return;
    }
    var popup = window.open(res.url, 'orcid_login', 'width=600,height=700,scrollbars=yes,resizable=yes');
    if (!popup) {
      setError('Моля, разрешете изкачащите прозорци за ORCID вход.');
      setLoadingGoogle(false);
      return;
    }
    var onMessage = function(ev) {
      if (!ev.data || ev.data.type !== 'orcid_callback') return;
      window.removeEventListener('message', onMessage);
      popup.close();
      if (ev.data.success) {
              api('orcid_login_resolve', {}).then(function(loginRes) {
                setLoadingGoogle(false);
                if (loginRes && loginRes.success) {
                  if (loginRes.needsConnection) {
                    setConnectOrcId(loginRes.orcid||'');
                    setShowConnectModal(true);
                    setConnectEmail('');
                    setConnectError('');
                    setLoadingGoogle(false);
                    return;
                  }
                  api('checkadmin', { email: loginRes.email }).then(function(adminRes) {
                    onLogin(
                      { name: loginRes.name || '', email: loginRes.email, picture: '', orcid: loginRes.orcid || '' },
                      !!(adminRes && adminRes.isAdmin),
                      (adminRes && adminRes.viewRole) || (adminRes && adminRes.role) || (adminRes && adminRes.isAdmin ? ROLE_ADMIN : ROLE_APPLICANT)
                    );
                  }).catch(function() {
                    onLogin({ name: loginRes.name || '', email: loginRes.email, picture: '', orcid: loginRes.orcid || '' }, false, ROLE_APPLICANT);
                  });
                } else {
                  setError((loginRes && loginRes.error) || 'Не може да се влезе с ORCID.');
                }
              }).catch(function() {
                setLoadingGoogle(false);
                setError('Грешка при връзка със сървъра.');
              });
            } else {
              setLoadingGoogle(false);
              setError(ev.data.error || 'ORCID входът беше отказан.');
            }
    };
    window.addEventListener('message', onMessage);
    var pollTimer = setInterval(function() {
      if (popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener('message', onMessage);
        setLoadingGoogle(false);
      }
    }, 500);
  }).catch(function() {
    setLoadingGoogle(false);
    setError('Грешка при връзка със сървъра.');
  });
}, [onLogin]);

useEffect(()=>{
  // Revoke any cached Google session for the rejected email and disable
  // auto-select so the next click opens the account chooser instead of
  // silently re-submitting the same disallowed credential.
  const _revokeGoogle=email=>{
    try{window.google?.accounts?.id?.disableAutoSelect()}catch(_){}
    if(email){try{window.google?.accounts?.id?.revoke(email,()=>{})}catch(_){}}
  };

  // v12.54.18: Global GIS error shield — catches /gsi/transform errors that
  // propagate before initGSI's try-catch can handle them.
  if(!window._gisErrorShieldInstalled){
    window._gisErrorShieldInstalled=true;
    window.addEventListener('error',function(ev){
      var msg=((ev&&ev.message)||'').toLowerCase();
      if(msg.indexOf('gsi')>=0||msg.indexOf('accounts.google')>=0||
         msg.indexOf('transform')>=0||msg.indexOf('credential')>=0||
         msg.indexOf('fedcm')>=0||msg.indexOf('identity')>=0){
        if(ev.preventDefault) ev.preventDefault();
        return false;
      }
    });
    window.addEventListener('unhandledrejection',function(ev){
      var reason=(ev&&ev.reason&&(ev.reason.message||ev.reason.toString()))||'';
      var msg=String(reason).toLowerCase();
      if(msg.indexOf('gsi')>=0||msg.indexOf('accounts.google')>=0||
         msg.indexOf('transform')>=0||msg.indexOf('credential')>=0||
         msg.indexOf('fedcm')>=0){
        if(ev.preventDefault) ev.preventDefault();
      }
    });
  }

  let _gsiFallbackTimer = null;
  const initGSI=()=>{
    if(!window.google?.accounts?.id||googleInit.current)return;
    googleInit.current=true;

    window.handleGoogleCredential=async credential=>{
      try{
        setLoadingGoogle(true);setError('');setBlockedAccount(null);
        const _b64u=credential.credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
        const _padded=_b64u+'='.repeat((4-_b64u.length%4)%4);
        const _bytes=Uint8Array.from(atob(_padded),c=>c.charCodeAt(0));
        const payload=JSON.parse(new TextDecoder().decode(_bytes));
        const _email=String(payload.email||'').toLowerCase().trim();

        let _verifiedEmail=_email;
        let _verifiedName=String(payload.name||'');
        let _verifiedPicture=String(payload.picture||'');
        try{
          if(typeof Veda==='object' && typeof Veda.getGoogleAuthUserEmail==='function'){
            const _r=await Veda.getGoogleAuthUserEmail(credential.credential);
            if(_r && _r.ok){
              _verifiedEmail=(_r.data&&_r.data.email)?_r.data.email:_verifiedEmail;
              _verifiedName=(_r.data&&_r.data.name)?_r.data.name:_verifiedName;
              _verifiedPicture=(_r.data&&_r.data.picture)?_r.data.picture:_verifiedPicture;
            }
          }
        }catch(_){ /* non-fatal */ }

        if(!_verifiedEmail||(typeof isAllowedSignInEmail==='function'&&!isAllowedSignInEmail(_verifiedEmail))){
          setLoadingGoogle(false);
          setBlockedAccount({email:_verifiedEmail||'(unknown)'});
          _revokeGoogle(_verifiedEmail);
          return;
        }

        try{
          const _authOv=document.getElementById('auth-transition');
          if(_authOv){_authOv.classList.add('active');_authOv.classList.remove('fade-out');}
        }catch(_){ /* non-fatal */ }

        const user={name:_verifiedName,email:_verifiedEmail,picture:_verifiedPicture};
        let admin=false;let role=ROLE_APPLICANT;
        try{
          const r=await api('checkadmin',{email:_verifiedEmail});
          if(r.success){
            admin=!!r.isAdmin;
            role=r.viewRole||(r.role||(admin?ROLE_ADMIN:ROLE_APPLICANT));
          }else if(r.code==='DOMAIN_NOT_ALLOWED'){
            setLoadingGoogle(false);
            setBlockedAccount({email:_verifiedEmail,serverMessage:r.error||''});
            _revokeGoogle(_verifiedEmail);
            try{
              const _authOv2=document.getElementById('auth-transition');
              if(_authOv2){_authOv2.classList.remove('active','fade-out');}
            }catch(_){}
            return;
          }
        }catch(_){}
        onLogin(user,admin,role);
      }catch{
        setLoadingGoogle(false);
        setError('Грешка при Google вход. / Google sign-in error.');
        try{
          const _authOv3=document.getElementById('auth-transition');
          if(_authOv3){_authOv3.classList.remove('active','fade-out');}
        }catch(_){}
      }
    };

    // v12.54.22: Reverted to legacy popup flow for reliability.
    // v12.54.24: Removed hd restriction — it hid subdomain accounts (e.g.
    // @students.ue-varna.bg) from the 1-click picker. Backend handles
    // domain filtering via isAllowedSignInEmail() after sign-in.
    var gisConfig = {
      client_id:GOOGLE_CLIENT_ID,
      callback:cred=>window.handleGoogleCredential(cred),
      ux_mode:'popup',
      auto_select:true,
      itp_support:true
    };

    // v12.54.18: Wrap initialize + renderButton in try-catch to prevent
    // blank page when /gsi/transform is blocked by ad-blocker/ITP.
    try{
      window.google.accounts.id.initialize(gisConfig);
    }catch(_){
      setError('Google входът не се зареди. Проверете интернет/забавнения.');
      if(gSigninRef.current){
        gSigninRef.current.innerHTML='';
        const btn=document.createElement('button');
        btn.type='button';btn.className='btn btn-secondary';
        btn.style.cssText='width:100%;justify-content:center;padding:.68rem';
        btn.innerHTML='<i class="fas fa-redo-alt"></i> Опитай отново';
        btn.addEventListener('click',function(){setError('');googleInit.current=false;initGSI();});
        gSigninRef.current.appendChild(btn);
      }
      return;
    }

    const container=gSigninRef.current;
    if(container){
      try{
        window.google.accounts.id.renderButton(container,{
          type:'standard',
          size:'large',
          theme:'outline',
          shape:'rectangular',
          text:'continue_with',
          locale:'bg',
          width:container.clientWidth||300
        });
      }catch(_){
        setError('Google входът не се зареди. Проверете интернет/забавнения.');
        return;
      }
      // Help popup-mode credential flows target the current host reliably.
      try{
        gisConfig.prompt_parent_id=container.id||container;
      }catch(_){}
    }
    setGoogleReady(true);

    // v12.54.25: Legacy 1-click flow — no prompt() One-Tap overlay.
    // Rely on auto_select: button click → auto-return credential if single session.
  };

  if(window._gsiReady){initGSI()}
  else{window.addEventListener('gsi-ready',initGSI,{once:true})}
  let _gsiPollTimer=setInterval(function(){
    if(window.google && window.google.accounts && window.google.accounts.id){
      clearInterval(_gsiPollTimer);
      if(!googleReady){
        try{ initGSI(); }catch(_){}
      }
    }
  },500);
  // v12.54.12-gauth-persist: elongate the fallback timeout 10x (10s → 100s) so the
  // "Google входът се забавя" error does not appear prematurely. Combined with
  // the persistent session restore below, users stay signed in across reloads.
  let _gsiFallback=setTimeout(function(){
    if(window.google && window.google.accounts && window.google.accounts.id){
      try{
        initGSI();
        if(googleReady){ return; }
      }catch(_){ /* fall through */ }
    }
    if(!googleReady){
      try{
        if(gSigninRef.current){
          gSigninRef.current.innerHTML='';
          const btn=document.createElement('button');
          btn.type='button';
          btn.className='btn btn-secondary';
          btn.style.cssText='width:100%;justify-content:center;padding:.68rem';
          btn.setAttribute('aria-label','Опитай отново Google вход');
          btn.title='Опитай отново Google вход';
          btn.innerHTML='<i class="fas fa-redo-alt" aria-hidden="true"></i> Опитай отново';
          btn.addEventListener('click',function(){
            setError('');
            googleInit.current=false;
            initGSI();
          });
          gSigninRef.current.appendChild(btn);
        }
      }catch(_){}
      try{window.google?.accounts?.id?.disableAutoSelect()}catch(_){}
      setError('Google входът не се зареди. Проверете интернет/забавнения, изчистете кеша на сайта и опитайте отново.');
    }
  },100000);

  return()=>{
    window.removeEventListener('gsi-ready',initGSI);
    clearInterval(_gsiPollTimer);
    clearTimeout(_gsiFallback);
    if(gSigninRef.current){gSigninRef.current.innerHTML=''}
  };
},[onLogin]);

const submitConnect=()=>{
  if(!connectEmail||connectEmail.indexOf('@')===-1){
    setConnectError('Моля, въведете валиден имейл адрес.');
    return;
  }
  setConnectLoading(true);
  setConnectError('');
  api('orcid_connect_account',{email:connectEmail,orcid:connectOrcId}).then(function(res){
    setConnectLoading(false);
    if(res&&res.success){
      setShowConnectModal(false);
      api('checkadmin',{email:connectEmail}).then(function(adminRes){
        onLogin(
          {name:res.name||'',email:connectEmail,picture:'',orcid:connectOrcId},
          !!(adminRes&&adminRes.isAdmin),
          (adminRes&&adminRes.viewRole)||(adminRes&&adminRes.role)||(adminRes&&adminRes.isAdmin?ROLE_ADMIN:ROLE_APPLICANT)
        );
      }).catch(function(){
        onLogin({name:res.name||'',email:connectEmail,picture:'',orcid:connectOrcId},false,ROLE_APPLICANT);
      });
    }else{
      setConnectError((res&&res.error)||'Не може да се свърже акаунтът.');
    }
  }).catch(function(){
    setConnectLoading(false);
    setConnectError('Грешка при връзка със сървъра.');
  });
};

return e('div',{className:'login-wrap'},
  e('img',{className:'login-watermark',src:LOGO_URL,alt:'','aria-hidden':'true'}),
  e('div',{className:'login-card',style:{position:'relative',overflow:'hidden'}},
    (loadingGoogle||loadingAdmin)&&e('div',{className:'login-loading-overlay'},
      e('div',{className:'login-loading-spinner'}),
      e('div',{className:'login-loading-text'},'Вход...')
    ),
    e('div',{className:'login-logo-wrap'},
      e('a',{href:'https://ue-varna.bg',target:'_blank',rel:'noopener',title:'ue-varna.bg','aria-label':'Икономически университет – Варна'},
        e('img',{className:'login-logo',src:UEV_LOGO_URL,alt:'ИУ Варна',onError:ev=>{ev.target.style.display='none'}})
      ),
      e('div',{className:'login-logo-divider'}),
      e('a',{href:'https://scienceandresearch.ue-varna.bg/',target:'_blank',rel:'noopener',title:'Science & Research','aria-label':'Научноизследователска дейност'},
        e('img',{className:'login-science-logo',src:LOGO_URL,alt:'НИИ',onError:ev=>{ev.target.style.display='none'}})
      )
    ),
    e('div',{className:'login-title',translate:'no'},e('span',{className:'i18n-bg'},'Икономически университет – Варна'),e('span',{className:'i18n-en'},'University of Economics – Varna')),
    e('div',{className:'login-sub'},
      e('span',{className:'i18n-bg',translate:'no'},'Научноизследователска дейност'),
      e('span',{className:'i18n-en'},'Science and Research')
    ),

    // ── Bilingual rejection card: shown when a non-institutional Google
    //    account tried to sign in. Replaces the inline form so the user
    //    cannot accidentally retry without explicitly dismissing it. ──
    blockedAccount?e('div',{className:'login-blocked','role':'alert','aria-live':'assertive'},
      e('div',{className:'login-blocked-icon'},e('i',{className:'fas fa-shield-halved','aria-hidden':'true'})),
      e('div',{className:'login-blocked-title i18n-bg',translate:'no'},'Поверително — Свържете се с Икономически Университет — Варна'),
      e('div',{className:'login-blocked-title i18n-en'},'Restricted — Please contact the University of Economics — Varna'),
      e('div',{className:'login-blocked-title-en i18n-bg'},'Restricted — Please contact the University of Economics — Varna'),
      e('div',{className:'login-blocked-body'},
        e('p',{className:'i18n-bg',translate:'no'},'Достъпът до системата е разрешен само за институционални акаунти ',e('strong',null,'@ue-varna.bg'),'. Вашият акаунт ',e('code',null,blockedAccount.email),' не е оторизиран.'),
        e('p',{className:'i18n-en'},'Access to this system is restricted to institutional ',e('strong',null,'@ue-varna.bg'),' accounts. Your account ',e('code',null,blockedAccount.email),' is not authorised.')
      ),
      e('div',{className:'login-blocked-contact'},
        e('a',{href:'mailto:info@ue-varna.bg',className:'login-blocked-link'},
          e('i',{className:'fas fa-envelope','aria-hidden':'true'}),' info@ue-varna.bg'),
        e('a',{href:'https://ue-varna.bg',target:'_blank',rel:'noopener noreferrer',className:'login-blocked-link'},
          e('i',{className:'fas fa-globe','aria-hidden':'true'}),' ue-varna.bg')
      ),
      e('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setBlockedAccount(null);setError('')},style:{width:'100%',justifyContent:'center',marginTop:'1rem'}},
        e('i',{className:'fas fa-arrow-left'}),' ',
        e('span',{className:'i18n-bg',translate:'no'},'Опитайте с друг акаунт'),
        e('span',{className:'i18n-en'},'Try another account')
      )
    ):e(Fragment,null,
      e('form',{onSubmit:handleAdmin},
        e('div',{className:'form-field'},
          e('label',null,'Потребителско име'),
          e('input',{name:'username',autoComplete:'username',placeholder:'Въведете потребителско име'})
        ),
        e('div',{className:'form-field'},
          e('label',null,'Парола'),
          e('div',{className:'pwd-wrap',style:{position:'relative'}},
            e('input',{name:'password',type:showPassword?'text':'password',autoComplete:'current-password',placeholder:'••••••••',style:{paddingRight:'2.4rem',width:'100%'}}),
            e('button',{type:'button',onClick:()=>setShowPassword(v=>!v),'aria-label':showPassword?'Скрий паролата':'Покажи паролата',title:showPassword?'Скрий паролата':'Покажи паролата',tabIndex:-1,style:{position:'absolute',right:'.4rem',top:'50%',transform:'translateY(-50%)',background:'transparent',border:'none',cursor:'pointer',color:'var(--ink-3)',padding:'.3rem .45rem',borderRadius:'var(--r-xs)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.95rem',lineHeight:1}},
              e('i',{className:showPassword?'fas fa-eye-slash':'fas fa-eye','aria-hidden':'true'})
            )
          )
        ),
        error&&e('div',{style:{fontSize:'.78rem',color:'var(--err)',background:'var(--err-bg)',border:'1px solid var(--err-border)',padding:'.5rem .85rem',borderRadius:'var(--r-xs)',marginBottom:'.85rem',display:'flex',alignItems:'center',gap:'.4rem'}},
          e('i',{className:'fas fa-exclamation-circle'}),error
        ),
        e('button',{type:'submit',className:'btn btn-primary',disabled:loadingAdmin,style:{width:'100%',justifyContent:'center',padding:'.68rem'}},
          loadingAdmin?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-sign-in-alt'}),
          loadingAdmin?' Зареждане...':' Вход'
        )
      ),
      e('div',{className:'login-divider'},'или влезте с'),
      e('div',{className:'google-signin-wrap'},e('div',{ref:gSigninRef})),
      
      e('div',{style:{marginTop:'.9rem',textAlign:'center'}},
        e('button',{type:'button',className:'btn btn-orcid',onClick:handleOrcIDLogin,disabled:loadingGoogle,style:{width:'100%',justifyContent:'center',padding:'.68rem',background:'#a6ce39',color:'#fff',border:'none',borderRadius:'var(--r-sm)',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:'.5rem'}},
          e('i',{className:'fab fa-orcid'}),' Вход с ORCID'
        )
      )
    ),
    e('div',{className:'login-version',style:{textAlign:'center',marginTop:'1.2rem',fontSize:'.6rem',color:'var(--ink-4)',letterSpacing:'.04em'}},
      'v'+window.__ERP_BUILD
    )
  ),
  showConnectModal&&_portal(e('div',{className:'overlay',style:{zIndex:1001},onClick:(function(ev){
    if(ev.target===ev.currentTarget){
      setShowConnectModal(false);
      setConnectError('');
    }
    })},
    e('div',{className:'modal orcid-connect-modal','aria-modal':'true','aria-labelledby':'orcid-connect-title',style:{maxWidth:'420px'}},
      e('button',{className:'modal-close',onClick:()=>{setShowConnectModal(false);setConnectError('')},'aria-label':'Затвори'},
        e('i',{className:'fas fa-times'})
      ),
      e('div',{className:'orcid-icon-large'},e('i',{className:'fab fa-orcid'})),
      e('div',{className:'orcid-title',id:'orcid-connect-title'},'Свържете профилите си'),
      e('div',{className:'orcid-subtitle'},
        e('span',null,'Влязохте успешно с ORCID: '),
        e('strong',null,connectOrcId),
        e('span',null,'. За да влезете, моля въведете Вашия институционален имейл (@ue-varna.bg).')
      ),
      connectError&&e('div',{className:'orcid-error'},
        e('i',{className:'fas fa-exclamation-circle'}),connectError
      ),
      e('div',{className:'orcid-input-group'},
        e('label',{htmlFor:'connect-email'},'Институционален имейл'),
        e('input',{
          id:'connect-email',
          type:'email',
          value:connectEmail,
          placeholder:'ime@ue-varna.bg',
          onChange:function(ev){setConnectEmail(ev.target.value);setConnectError('')},
          onKeyDown:function(ev){if(ev.key==='Enter'){ev.preventDefault();submitConnect()}},
          disabled:connectLoading
        })
      ),
      e('button',{className:'orcid-btn-connect',onClick:submitConnect,disabled:connectLoading},
        connectLoading?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fab fa-orcid'}),
        connectLoading?' Свързване...':' Свържи и влез'
      ),
      e('button',{className:'orcid-btn-skip',onClick:()=>{setShowConnectModal(false);setConnectError('')},disabled:connectLoading},
        'Пропусни'
      )
    )
  ))
);
};

// Expose views to window for _lazyView resolution
try{if(typeof window!=='undefined'){window.LoginScreen=LoginScreen;window.CompetitionView=CompetitionView;window.ContestBoardView=ContestBoardView;window.CalendarView=CalendarView;}}catch(_){}

/* ─── ERROR BOUNDARY ─── */
/* ErrorBoundary is now defined in config.js to ensure early availability */

// ── SettingsView: Deployment Configuration Panel ────────────
// Admin-only panel for QES / Cloud KMS deployment config
