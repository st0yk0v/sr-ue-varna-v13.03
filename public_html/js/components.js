/* ─── SHARED COMPONENTS ─── */

// v12.32.23-memofix: Global React aliases — React is loaded as UMD global via CDN.
var e = React.createElement;
var useState = React.useState;
var useMemo = React.useMemo;
var useRef = React.useRef;
var useEffect = React.useEffect;
var useCallback = React.useCallback;
var memo = React.memo;
var Fragment = React.Fragment;

/* Global modal stack — tracks open modal IDs in mount order.
 * Only the topmost modal responds to ESC. Prevents cascade-close when
 * two modals are open simultaneously (e.g. picker → preview). */
var _modalStack=[];

// ── Attached-doc serializer: preserves ALL fields the edit modal needs ──
// v12.27.1-perf: Added missing fields (webViewLink, isGoogleDoc, size,
// isCopyable, typeLabel, editUrl, editLink) that were silently dropped,
// causing degraded UX on round-trip (broken preview links, missing icons).
function _serializeDoc(d){return{
  id:d.id,name:d.name,folderName:d.folderName||d.folder_name||'',
  driveId:d.driveId||d.drive_id||'',fileId:d.fileId||d.file_id||'',
  mimeType:d.mimeType||d.mime_type||'',previewLink:d.previewLink||d.preview_link||'',
  downloadUrl:d.downloadUrl||d.download_url||'',googleDocEditLink:d.googleDocEditLink||d.google_doc_edit_link||'',
  content:d.content||'',_generated:!!d._generated,
  docType:d.docType||'',_budget:!!d._budget,
  webViewLink:d.webViewLink||d.web_view_link||d.previewLink||d.preview_link||'',  // v12.27.1: preserve for driveOpenUrl()
  isGoogleDoc:!!(d.isGoogleDoc||(d.mimeType||d.mime_type||'').match(/google\.(document|spreadsheet|presentation)/)),
  size:d.size||d.sizeBytes||0,
  isCopyable:d.isCopyable,
  typeLabel:d.typeLabel||d.type_label||'',
  editUrl:d.editUrl||d.editLink||d.edit_link||'',
  editLink:d.editLink||d.edit_url||d.editUrl||d.edit_link||''
};}
// v12.48.8-ux: Shorten opaque Drive file ids in the modal header "Тип · път"
// label. ERP ids (F22CE7478, up_…) stay verbatim; raw 33-char Google Drive
// ids become "1A2b3C…Xz" so end users don't see a wall of hash.
function _shortDocId(id){
  id=String(id||'');
  if(id.length<=12)return id;
  return id.slice(0,6)+'…'+id.slice(-2);
}

// ── v12.30.2-editinmodal: Robust Drive file-ID extraction ──
// Library/reference docs often arrive WITHOUT a clean `driveId` (their id is a
// synthetic key like 'fnisections35'), but they DO carry the real 28-char Drive
// file ID inside googleDocEditLink / previewLink / webViewLink / id. Without
// extracting it, both doc modals compute editEmbedUrl='' and the modal can only
// show the "open in new tab" gateway instead of opening the document inline in
// EDIT mode. This helper recovers the Drive ID from any of those fields.
function _driveIdFromDoc(d){
  if(!d)return null;
  // v3.39.4-snakefix: Also check snake_case keys from PHP API
  // v12.37.2-yai: Mirror yai.free.bg — recover the Drive file id from ANY
  // link the doc carries (driveId, edit/preview/webView links, id, AND
  // downloadUrl/openLink which often hold Google's uc?export=download&id=<FID>
  // or /d/<FID> form). Without this, .docx/.xlsx stored in Drive but exposed
  // only via a downloadUrl dead-end in the "не може да се визуализира" panel
  // instead of embedding Drive's native /preview viewer.
  var cand=[];
  cand.push(d.driveId||d.drive_id||'');
  cand.push(d.googleDocEditLink||d.google_doc_edit_link||'');
  cand.push(d.previewLink||d.preview_link||'');
  cand.push(d.webViewLink||d.web_view_link||'');
  cand.push(d.downloadUrl||d.download_url||'');
  cand.push(d.openLink||d.open_link||'');
  cand.push(d.id||'');
  cand.push(d.editUrl||d.editLink||d.edit_link||'');
  var re=/\/d\/([A-Za-z0-9_-]{25,})/;
  var reUc=/[?&]id=([A-Za-z0-9_-]{25,})/;
  for(var i=0;i<cand.length;i++){
    var v=String(cand[i]||'').trim();
    if(!v)continue;
    // Direct clean ID
    if(/^[A-Za-z0-9_-]{25,}$/.test(v)&&!/^(s_|doc_|up_|f_|copied_)/.test(v))return v;
    // URL containing /d/<ID>/
    var m=v.match(re);
    if(m&&m[1])return m[1];
    // Google download/uc link: uc?export=download&id=<FID>
    var mu=v.match(reUc);
    if(mu&&mu[1])return mu[1];
  }
  return null;
}

/** Portal helper — guarantees the overlay/sheet escapes ANY ancestor
 *  stacking context (transform/filter/will-change/contain/sticky+z-index)
 *  by rendering directly under <body>. Falls back to inline render if
 *  ReactDOM.createPortal is unavailable (very old build). */
var _portal=(node)=>{
  if(typeof document==='undefined')return node;
  if(typeof ReactDOM==='undefined'||typeof ReactDOM.createPortal!=='function')return node;
  return ReactDOM.createPortal(node,document.body);
};


/** Reusable hook for smooth modal close animation.
 *  Usage: const{closing,close,closeWith}=useModalClose(onClose);
 *  - close()       → animates out then calls onClose
 *  - closeWith(cb) → animates out then calls cb (for confirm/cancel split)
 *  - ESC only fires when this modal is on top of the stack. */
var useModalClose=(onClose,duration=150)=>{
  const[closing,setClosing]=useState(false);
  const idRef=useRef(null);
  if(!idRef.current)idRef.current={}; // stable identity object as stack key
  const closingRef=useRef(false);
  const closeWith=useCallback((cb)=>{
    if(closingRef.current)return;
    closingRef.current=true;
    setClosing(true);
    setTimeout(()=>{closingRef.current=false;if(cb)cb()},duration);
  },[duration]);
  const close=useCallback(()=>closeWith(onClose),[closeWith,onClose]);
  // ── Optimistic close ───────────────────────────────────────────────
  // Pattern: fire the network action in the background AND animate the
  // modal out immediately. The user gets sub-100ms perceived latency
  // (the overlay is already fading by the time the API even leaves
  // the device). On failure, a toast surfaces the error so the user
  // can retry. The asyncFn promise is awaited but its result is NOT
  // bubbled — call sites that need the result should use close() +
  // setLoading instead.
  // Usage:
  //   <button onClick={()=>closeOptimistic(()=>api('saveX',payload))}>
  //   <button onClick={()=>closeOptimistic(()=>api('saveX',payload),{
  //       successMsg:'Записано', errorMsg:'Грешка при запис',
  //       onSuccess:res=>refreshList(), onError:err=>console.warn(err)
  //   })}>
  const closeOptimistic=useCallback((asyncFn,opts)=>{
    if(closingRef.current)return Promise.resolve(null);
    var o=opts||{};
    closingRef.current=true;setClosing(true);
    // Animate-out runs in parallel with the network call.
    setTimeout(()=>{closingRef.current=false;if(typeof onClose==='function')onClose();},duration);
    var p;
    try{p=asyncFn();}catch(syncErr){p=Promise.reject(syncErr);}
    if(!p||typeof p.then!=='function')p=Promise.resolve(p);
    return p.then(function(res){
      if(res&&res.success===false){
        var msg=o.errorMsg||(res.error||'Действието не успя.');
        if(typeof toast==='function')toast(msg,'error');
        if(typeof o.onError==='function')o.onError(res);
        return res;
      }
      if(o.successMsg&&typeof toast==='function')toast(o.successMsg,'success',2200);
      if(typeof o.onSuccess==='function')o.onSuccess(res);
      return res;
    },function(err){
      if(typeof toast==='function')toast(o.errorMsg||(err&&err.message)||'Грешка при свързване.','error');
      if(typeof o.onError==='function')o.onError(err);
      return null;
    });
  },[onClose,duration]);
  useEffect(()=>{
    const id=idRef.current;
    _modalStack.push(id);
    if(typeof document!=='undefined'&&document.body&&_modalStack.length===1){
      const inIframe=document.documentElement.classList.contains('in-iframe');
      const sy=window.scrollY||window.pageYOffset||0;
      const sw=window.innerWidth-document.documentElement.clientWidth;
      // In iframe mode the scroller is <html>, NOT <body>. The position:fixed
      // trick would break layout there — overflow:hidden on the modal-open
      // class is sufficient to lock scroll inside the iframe.
      if(!inIframe){
        document.body.dataset.lockedScroll=String(sy);
        document.body.style.top=(-sy)+'px';
      }
      if(sw>0)document.body.style.paddingRight=sw+'px';
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
    }
    const h=ev=>{
      if(ev.key==='Escape'&&_modalStack[_modalStack.length-1]===id)close();
    };
    document.addEventListener('keydown',h);
    return()=>{
      document.removeEventListener('keydown',h);
      const idx=_modalStack.lastIndexOf(id);
      if(idx!==-1)_modalStack.splice(idx,1);
      if(_modalStack.length===0&&typeof document!=='undefined'&&document.body){
        const sy=parseInt(document.body.dataset.lockedScroll||'0',10)||0;
        const hadLock=document.body.dataset.lockedScroll!=null;
        document.body.classList.remove('modal-open');
        document.documentElement.classList.remove('modal-open');
        document.body.style.top='';
        document.body.style.paddingRight='';
        delete document.body.dataset.lockedScroll;
        if(hadLock)window.scrollTo(0,sy);
        // Notify any pending toast.afterClose() listeners — used to chain
        // success notifications immediately after the modal disappears so
        // the action feels instant and continuous.
        try{window.dispatchEvent(new CustomEvent('erp-modal-closed'));}catch(_){}
      }
    };
  },[close]);
  return{closing,close,closeWith,closeOptimistic};
};


/** ── Self-healing scroll-lock watchdog ──────────────────────────────────
 *  If a modal mounts but its cleanup is lost (component throws, ancestor
 *  unmounts during a transition, hot-reload, etc.) the body can be left
 *  with `modal-open` + `data-locked-scroll`, freezing scroll on mobile.
 *  Implemented as a MutationObserver on body[class] (no polling timer):
 *  whenever the modal-open class flips on, we check on the next macrotask
 *  whether the lock is genuinely backed by a live overlay, and if not we
 *  forcibly clear it. Zero idle CPU cost. */
if(typeof window!=='undefined'&&typeof MutationObserver!=='undefined'&&!window.__erpScrollLockWatchdog){
  window.__erpScrollLockWatchdog=true;
  const recover=()=>{
    try{
      const b=document.body;if(!b)return;
      if(!b.classList.contains('modal-open'))return;
      if(_modalStack.length>0)return; // legitimate active modal
      if(document.querySelector('.modal-overlay,.detail-sheet,.modal-box'))return;
      const sy=parseInt(b.dataset.lockedScroll||'0',10)||0;
      b.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
      b.style.top='';b.style.paddingRight='';
      delete b.dataset.lockedScroll;
      if(sy)window.scrollTo(0,sy);
      try{console.warn('[scroll-lock] auto-recovered orphaned lock')}catch(_){}
    }catch(_){}
  };
  const arm=()=>{
    if(!document.body)return;
    new MutationObserver(()=>{
      // Defer to next tick so the modal mount finishes first; an orphan
      // lock is one where the class is set but no overlay exists.
      setTimeout(recover,0);
    }).observe(document.body,{attributes:true,attributeFilter:['class']});
    // One-shot recovery on script load in case a prior session crashed mid-modal.
    setTimeout(recover,0);
  };
  if(document.body)arm();else document.addEventListener('DOMContentLoaded',arm,{once:true});
}

/** Stable id generator for `aria-labelledby` (no React 18 useId dependency required) */
var _modalIdCounter=0;
var _useModalId=()=>{const r=useRef(null);if(!r.current)r.current='m'+(++_modalIdCounter)+'-'+Date.now().toString(36);return r.current};

/** Overlay-click guard that prevents accidental close when a drag-select inside the
 *  modal body releases over the overlay (common bug: select text → cursor exits → mouseup → close).
 *  Only closes when BOTH mousedown AND mouseup happened directly on the overlay element. */
var _useOverlayClickGuard=(close,enabled)=>{
  const downRef=useRef(false);
  return useMemo(()=>{
    if(!enabled)return{};
    return{
      onMouseDown:ev=>{downRef.current=(ev.target===ev.currentTarget)},
      onMouseUp:ev=>{const ok=downRef.current&&ev.target===ev.currentTarget;downRef.current=false;if(ok)close();},
      onTouchStart:ev=>{downRef.current=(ev.target===ev.currentTarget)},
    };
  },[close,enabled]);
};

/** Focus trap + return-focus on close. Auto-focuses the first interactive element
 *  in the modal box on mount; on unmount returns focus to whatever element opened the modal. */
var _useModalFocus=(boxRef)=>{
  useEffect(()=>{
    const box=boxRef.current;if(!box)return;
    const prev=document.activeElement;
    // Defer to next frame so the box is mounted + animations settled enough for focus()
    const raf=requestAnimationFrame(()=>{
      const focusables=box.querySelectorAll('a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])');
      // Prefer first non-close-btn control; fall back to box itself
      let target=null;
      for(const el of focusables){if(!el.classList.contains('close-btn')){target=el;break}}
      if(!target)target=focusables[0]||box;
      try{target.focus({preventScroll:true})}catch(_){try{target.focus()}catch(__){}}
    });
    const trap=ev=>{
      if(ev.key!=='Tab')return;
      const list=box.querySelectorAll('a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if(!list.length)return;
      const first=list[0],last=list[list.length-1];
      if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus()}
      else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus()}
    };
    box.addEventListener('keydown',trap);
    return()=>{
      cancelAnimationFrame(raf);
      box.removeEventListener('keydown',trap);
      // Return focus only if the previous element is still in the DOM and focusable
      if(prev&&typeof prev.focus==='function'&&document.contains(prev)){
        try{prev.focus({preventScroll:true})}catch(_){}
      }
    };
  },[boxRef]);
};

/** Unified modal shell. Renders overlay+box+head+footer scaffold so callers only supply body content.
 *  Props: { open, onClose, title, icon, size ('narrow'|'default'|'wide'|'form-modal'|'fullscreen'), children, footer, dismissable=true, extraClass }
 *  Returns null when open=false. Handles ESC, overlay-click (drag-safe), exit animation, focus trap.  */
var ModalShell=({open=true,onClose,title,icon,size='default',children,footer,dismissable=true,extraClass=''})=>{
  if(!open)return null;
  const{closing,close}=useModalClose(onClose||(()=>{}));
  const titleId=_useModalId();
  const boxRef=useRef(null);
  _useModalFocus(boxRef);
  const overlayHandlers=_useOverlayClickGuard(close,!!dismissable);
  const sizeCls=size==='default'?'':size;
  const labelledBy=title?titleId:undefined;
  return _portal(e('div',{className:'modal-overlay'+(closing?' closing':''),...overlayHandlers,role:'dialog','aria-modal':'true','aria-labelledby':labelledBy,'aria-label':title?undefined:'Диалог'},
    e('div',{ref:boxRef,className:('modal-box '+sizeCls+(extraClass?' '+extraClass:'')+(closing?' closing':'')).trim(),tabIndex:-1,onClick:ev=>ev.stopPropagation()},
      (title||dismissable)&&e('div',{className:'modal-head'},
        e('h3',{id:labelledBy},icon&&e('i',{className:icon}),title?(typeof title==='string'||typeof title==='number'?' '+title:e(Fragment,null,' ',title)):''),
        dismissable&&e('button',{type:'button',className:'close-btn',onClick:close,'aria-label':'Затвори (Esc)',title:'Затвори (Esc)'},e('i',{className:'fas fa-times'}))
      ),
      e('div',{className:'modal-body'},children),
      footer&&e('div',{className:'modal-footer'},footer)
    )
  ));
};

/* ─── MULTI-SELECT CHECKBOX DROPDOWN ──────────────────────────────────────
 *  Replaces a plain <select> for multi-value fields like "Приоритетно
 *  направление". Renders a clickable trigger that opens a popover with
 *  checkboxes. Keyboard-accessible (Escape closes, arrows navigate).
 *  Props:
 *    options     : Array<string> — list of selectable values
 *    value       : Array<string> — currently selected values
 *    onChange    : (next:Array<string>) => void
 *    placeholder : string — shown when nothing is selected
 *    name        : string — optional, for error association
 *    disabled    : boolean
 *    maxHeight   : string — CSS max-height for the dropdown list
 * ────────────────────────────────────────────────────────────────────────── */
var MultiSelect=memo(({options=[],value=[],onChange,placeholder='— изберете —',name,disabled=false,maxHeight='260px'})=>{
  const[open,setOpen]=useState(false);
  const ref=useRef(null);
  const btnRef=useRef(null);
  const selected=Array.isArray(value)?value:[];
  // ── Normalize options to {value,label} objects (backward compat with plain strings) ──
  const _normOpts=useMemo(function(){
    return options.map(function(o){return(typeof o==='object'&&o!==null)?{value:String(o.value||o.label||''),label:String(o.label||o.value||o||'')}:{value:String(o||''),label:String(o||'')};});
  },[options]);
  // Quick value→label lookup
  const _lookup=useMemo(function(){
    var m={};_normOpts.forEach(function(o){m[o.value]=o.label;});return m;
  },[_normOpts]);
  // Close on outside click
  useEffect(()=>{
    if(!open)return;
    const h=ev=>{if(ref.current&&!ref.current.contains(ev.target))setOpen(false);};
    const k=ev=>{if(ev.key==='Escape'){setOpen(false);btnRef.current&&btnRef.current.focus();}};
    document.addEventListener('mousedown',h);
    document.addEventListener('keydown',k);
    return()=>{document.removeEventListener('mousedown',h);document.removeEventListener('keydown',k);};
  },[open]);
  const toggle=useCallback((optValue)=>{
    var next;
    if(selected.includes(optValue)){
      next=selected.filter(function(v){return v!==optValue;});
    }else{
      next=selected.concat([optValue]);
    }
    if(onChange)onChange(next);
  },[selected,onChange]);
  const selCount=selected.length;
  var display=placeholder;
  if(selCount===1)display=_lookup[selected[0]]||selected[0];
  else if(selCount>1)display=selCount+' направления избрани';
  var displayClass='ms-trigger-text';
  if(selCount===0)displayClass+=' is-placeholder';
  else if(selCount>1)displayClass+=' is-count';
  return e('div',{ref,className:'multi-select'+(open?' is-open':'')+(disabled?' is-disabled':''),style:{position:'relative'}},
    e('button',{ref:btnRef,type:'button',className:'multi-select-trigger',disabled:disabled,onClick:function(){setOpen(function(p){return!p;});},onKeyDown:function(ev){if(ev.key==='ArrowDown'||ev.key==='Enter'||ev.key===' '){ev.preventDefault();setOpen(true);}},'aria-haspopup':'listbox','aria-expanded':open},
      e('span',{className:displayClass},display),
      e('i',{className:'fas fa-chevron-down ms-arrow','aria-hidden':'true'})
    ),
    open&&e('div',{className:'multi-select-drop',style:{maxHeight:maxHeight},role:'listbox','aria-label':placeholder},
      // ── Quick actions ──
      _normOpts.length>6&&e('div',{className:'ms-actions'},
        e('button',{type:'button',className:'ms-action-btn',onClick:function(){if(onChange)onChange(_normOpts.map(function(o){return o.value;}));}},e('i',{className:'fas fa-check-square',style:{marginRight:'.2rem'}}),'Всички'),
        e('button',{type:'button',className:'ms-action-btn',onClick:function(){if(onChange)onChange([]);}},e('i',{className:'fas fa-square',style:{marginRight:'.2rem'}}),'Никоя')
      ),
      _normOpts.map(function(opt){
        var checked=selected.includes(opt.value);
        return e('div',{key:opt.value,className:'ms-option'+(checked?' is-checked':''),role:'option','aria-selected':checked,onClick:function(){toggle(opt.value);}},
          e('span',{className:'ms-check'},checked?e('i',{className:'fas fa-check-square'}):e('i',{className:'far fa-square'})),
          e('span',{className:'ms-label'},opt.label)
        );
      })
    ),
    name&&e('input',{type:'hidden',name:name,value:selected.join(';;')})
  );
});
var Badge=memo(({status})=>e('span',{className:`badge ${status||'draft'}`},statusLabel(status)));
var ApplicantCell=memo(({name,email})=>e('div',{className:'applicant-cell'},e('div',{className:'applicant-avatar'},initials(name)),e('div',null,e('div',{className:'td-name'},name||'—'),e('div',{className:'td-email'},email||'—'))));

/* ─── CONFIRM MODAL ─── */
/** Confirmation dialog modal with optional danger styling. */
var ConfirmModal=memo(({message,onConfirm,onCancel,confirmLabel='Потвърди',dangerous=false})=>{
  const{closing,closeWith}=useModalClose(onCancel);
  return _portal(e('div',{className:'modal-overlay soft'+(closing?' closing':''),onClick:()=>closeWith(onCancel),role:'dialog','aria-modal':'true','aria-label':'Потвърждение'},
    e('div',{className:'modal-box narrow'+(closing?' closing':''),onClick:ev=>ev.stopPropagation()},
      e('div',{className:'modal-head'},e('h3',null,e('i',{className:'fas fa-question-circle'}),' Потвърждение'),e('button',{className:'close-btn',onClick:()=>closeWith(onCancel),'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))),
      e('div',{className:'modal-body'},e('p',{style:{fontSize:'.88rem',color:'var(--ink-2)',lineHeight:1.65}},message)),
      e('div',{className:'modal-footer'},
        e('button',{className:'btn btn-outline',onClick:()=>closeWith(onCancel)},'Отказ'),
        e('button',{className:`btn ${dangerous?'btn-danger':'btn-primary'}`,onClick:()=>closeWith(onConfirm)},confirmLabel)
      )
    )
  ));
});

/** Return comment modal for admin rejection with reason. */
var ReturnCommentModal=memo(({onConfirm,onCancel})=>{
  const[comment,setComment]=useState('');
  const{closing,closeWith}=useModalClose(onCancel);
  return _portal(e('div',{className:'modal-overlay soft'+(closing?' closing':''),onClick:()=>closeWith(onCancel),role:'dialog','aria-modal':'true','aria-label':'Причина за връщане'},
    e('div',{className:'modal-box narrow'+(closing?' closing':''),onClick:ev=>ev.stopPropagation()},
      e('div',{className:'modal-head'},e('h3',null,e('i',{className:'fas fa-undo',style:{color:'var(--err)'}}),' Причина за връщане'),e('button',{className:'close-btn',onClick:()=>closeWith(onCancel),'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))),
      e('div',{className:'modal-body'},
        e('p',{style:{fontSize:'.83rem',color:'var(--ink-3)',marginBottom:'.9rem'}},'Посочете причина за връщане.'),
        e('textarea',{className:'return-textarea',value:comment,onChange:ev=>setComment(ev.target.value),placeholder:'Опишете причината...'})
      ),
      e('div',{className:'modal-footer'},
        e('button',{className:'btn btn-outline',onClick:()=>closeWith(onCancel)},'Отказ'),
        e('button',{className:'btn btn-danger',disabled:!comment.trim(),onClick:()=>closeWith(()=>onConfirm(comment.trim()))},e('i',{className:'fas fa-undo'}),' Потвърди')
      )
    )
  ));
});
/* ─── SKELETON SHELL (v8.1.0-ui) ───────────────────────────────────
 * Reusable loading placeholder for view-level content.
 * Props:
 *   lines  — number of shimmer lines (default 5)
 *   intent — 'card' | 'list' | 'detail' | 'dashboard' (default 'card')
 *   className — additional CSS class
 */
/** Loading placeholder shell with shimmer animation. */
var SkeletonShell=memo(({lines=5,intent='card',className=''})=>{
  if(intent==='dashboard'){
    return e('div',{className:'skel-dashboard '+className},
      e('div',{className:'skel skel-line w60',style:{height:'1.2rem',marginBottom:'.8rem'}}),
      e('div',{className:'stats-row'},[1,2,3].map(i=>e('div',{key:i,className:'skel',style:{flex:'1 1 180px',height:'80px'}}))),
      e('div',{style:{display:'flex',gap:'1rem',marginTop:'1rem',flexWrap:'wrap'}},
        e('div',{className:'skel',style:{flex:'2 1 400px',height:'200px'}}),
        e('div',{className:'skel',style:{flex:'1 1 220px',height:'200px'}})
      )
    );
  }
  if(intent==='list'){
    return e('div',{className:'skel-list '+className},Array.from({length:lines},(_,i)=>
      e('div',{key:i,className:'skel-row',style:{display:'flex',gap:'.6rem',alignItems:'center',padding:'.6rem 0',borderBottom:i<lines-1?'1px solid var(--border)':'none'}},
        e('div',{className:'skel skel-icon',style:{width:'32px',height:'32px'}}),
        e('div',{style:{flex:1}},
          e('div',{className:'skel skel-line w70'}),
          e('div',{className:'skel skel-line w40',style:{height:'8px'}})
        )
      )
    ));
  }
  if(intent==='detail'){
    return e('div',{className:'skel-detail '+className},
      e('div',{className:'skel skel-line w50',style:{height:'1.5rem',marginBottom:'1rem'}}),
      ...Array.from({length:lines},(_,i)=>e('div',{key:i,className:'skel skel-line w'+(90-i*10)},null))
    );
  }
  return e('div',{className:'skel-card '+className,style:{padding:'1rem',borderRadius:'var(--r)',background:'var(--surface)',boxShadow:'var(--shadow-xs)'}},
    e('div',{className:'skel skel-line w40',style:{height:'1rem',marginBottom:'.7rem'}}),
    ...Array.from({length:lines},(_,i)=>e('div',{key:i,className:'skel skel-line w'+(85-i*7)},null)),
    e('div',{style:{display:'flex',gap:'.5rem',marginTop:'.8rem'}},
      e('div',{className:'skel skel-btn',style:{width:'60px'}}),
      e('div',{className:'skel skel-btn',style:{width:'80px'}})
    )
  );
});
/* ─── GOOGLE-STYLE 2FA EMAIL VERIFICATION MODAL ───
 *  Shown when the backend returns { require2fa: true } on an action
 *  (e.g. submitForm) or when the user is about to sign a document.
 *  The applicant always receives a 6-digit code by email shaped
 *  exactly like Google's standard SMS:
 *      "G-123456 is your Google verification code."
 *  Props:
 *    email          – recipient address shown in the UI
 *    initialMessage – server message about code dispatch
 *    initialCooldown– seconds until resend allowed (default 30)
 *    onVerify(code) – async; should perform the gated action with the code.
 *                     Return true / { success:true } on success → modal closes.
 *                     Return { error } / throw to keep modal open and show error.
 *    onResend()     – async; should re-trigger the code issue (returns server msg).
 *    onCancel()     – user closed without verifying.
 */
/** Two-factor OTP email verification modal. */
var OtpVerifyModal=memo(({email,initialMessage,initialCooldown=30,onVerify,onResend,onCancel,title='Потвърждение в две стъпки'})=>{
  const{closing,closeWith}=useModalClose(onCancel);
  const[code,setCode]=useState('');
  const[busy,setBusy]=useState(false);
  const[resending,setResending]=useState(false);
  const[err,setErr]=useState('');
  const[info,setInfo]=useState(initialMessage||'');
  const[cooldown,setCooldown]=useState(Number(initialCooldown)||0);
  const inputRef=useRef(null);
  const mountedRef=useRef(true);
  useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false};},[]);
  useEffect(()=>{const t=setTimeout(()=>{try{inputRef.current&&inputRef.current.focus()}catch(_){}},80);return()=>clearTimeout(t)},[]);
  useEffect(()=>{if(cooldown<=0)return;const t=setInterval(()=>setCooldown(c=>c<=1?0:c-1),1000);return()=>clearInterval(t)},[cooldown]);
  const safeSet=(fn)=>{if(mountedRef.current)fn()};
  const cancel=()=>{if(busy)return;closeWith(onCancel)};
  const handleSubmit=async ev=>{
    if(ev&&ev.preventDefault)ev.preventDefault();
    if(busy)return;
    const clean=String(code||'').replace(/[^0-9]/g,'');
    if(clean.length!==6){setErr('Кодът трябва да е 6 цифри.');return}
    setErr('');setBusy(true);
    let ok=false,errMsg='';
    try{
      const r=await onVerify(clean);
      if(r===true||(r&&r.success===true)){ok=true}
      else if(r&&r.error){errMsg=r.error}
      else if(r&&r.success===false){errMsg=r.error||'Грешен код.'}
    }catch(ex){errMsg=(ex&&ex.message)||'Грешен код.'}
    if(ok){
      // Parent will unmount us; just close gracefully (safeSet guards stale state).
      safeSet(()=>setBusy(false));
      closeWith(()=>{});
      return;
    }
    safeSet(()=>{setErr(errMsg||'Грешен код.');setBusy(false)});
  };
  const handleResend=async()=>{
    if(cooldown>0||resending||busy)return;
    setResending(true);setErr('');
    try{
      const r=await onResend();
      if(r&&r.error){safeSet(()=>setErr(r.error))}
      else{safeSet(()=>{setInfo((r&&r.message)||'Изпратен е нов код.');setCooldown(Number(r&&r.cooldown?r.cooldown:30));setCode('')})}
    }catch(ex){safeSet(()=>setErr((ex&&ex.message)||'Неуспешно повторно изпращане.'))}
    finally{safeSet(()=>setResending(false))}
  };
  const maskedEmail=(()=>{const s=String(email||'');const at=s.indexOf('@');if(at<2)return s;return s.charAt(0)+'•••'+s.charAt(at-1)+s.substr(at)})();
  return _portal(e('div',{className:'modal-overlay soft'+(closing?' closing':''),onClick:cancel,role:'dialog','aria-modal':'true','aria-label':title},
    e('div',{className:'modal-box narrow'+(closing?' closing':''),onClick:ev=>ev.stopPropagation()},
      e('div',{className:'modal-head'},
        e('h3',null,e('i',{className:'fas fa-shield-halved',style:{color:'var(--primary)'}}),' ',title),
        e('button',{className:'close-btn',onClick:cancel,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
      ),
      e('form',{onSubmit:handleSubmit},
        e('div',{className:'modal-body',style:{display:'flex',flexDirection:'column',gap:'.85rem'}},
          e('p',{style:{fontSize:'.85rem',color:'var(--ink-2)',lineHeight:1.6,margin:0}},
            'Изпратихме 6-цифрен код за потвърждение на ',
            e('strong',null,maskedEmail||'имейла Ви'),
            '. Въведете го по-долу, за да продължите.'
          ),
          e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',padding:'.55rem .7rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-xs)',fontSize:'.74rem',color:'var(--info)'}},
            e('i',{className:'fab fa-google'}),
            e('span',null,'Форматът е „G-123456 is your Google verification code." — където 123456 е вашият код за верификация.')
          ),
          e('div',{className:'form-field',style:{margin:0}},
            e('label',null,'Код за потвърждение'),
            e('p',{style:{fontSize:'.78rem',color:'var(--ink-3)',margin:'0 0 .4rem',lineHeight:1.4}},'Въведете получения 6-цифрен код и натиснете „Потвърди".'),
            e('input',{
              ref:inputRef,
              value:code,
              onChange:ev=>{const v=String(ev.target.value||'').replace(/[^0-9]/g,'').slice(0,6);setCode(v);if(err)setErr('');if(v.length===6&&!busy){var s=setTimeout(()=>{try{inputRef.current&&inputRef.current.form&&inputRef.current.form.requestSubmit()}catch(_){}},50);return()=>clearTimeout(s)}},
              inputMode:'numeric',
              autoComplete:'one-time-code',
              pattern:'[0-9]*',
              maxLength:6,
              placeholder:'123456',
              disabled:busy,
              style:{letterSpacing:'.5rem',fontSize:'1.25rem',textAlign:'center',fontFamily:'Consolas,Menlo,monospace',fontWeight:700}
            })
          ),
          err&&e('div',{role:'alert',style:{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.78rem',color:'var(--err)',background:'var(--err-bg)',border:'1px solid var(--err-border)',padding:'.5rem .7rem',borderRadius:'var(--r-xs)'}},
            e('i',{className:'fas fa-exclamation-circle'}),err
          ),
          !err&&info&&e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.74rem',color:'var(--ink-3)'}},
            e('i',{className:'fas fa-info-circle'}),info
          ),
          e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'.76rem',color:'var(--ink-3)'}},
            e('span',null,'Кодът важи 5 минути.'),
            e('button',{type:'button',className:'btn btn-ghost btn-sm',disabled:cooldown>0||resending||busy,onClick:handleResend},
              resending?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-paper-plane'}),
              ' ',cooldown>0?`Нов код (${cooldown}s)`:'Изпрати нов код'
            )
          )
        ),
        e('div',{className:'modal-footer'},
          e('button',{type:'button',className:'btn btn-outline',disabled:busy,onClick:cancel},'Отказ'),
          e('button',{type:'submit',className:'btn btn-primary',disabled:busy||code.length!==6},
            busy?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-check'}),
            ' ',busy?'Потвърждаване...':'Потвърди'
          )
        )
      )
    )
  ));
});

/* ─── 2FA ENROLLMENT WIZARD (DISABLED) ───
 *  TOTP / Authenticator-app enrollment has been removed per product policy.
 *  Email-based 2FA ("G-XXXXXX is your Google verification code") is the only
 *  supported method and is always-on for sensitive actions. This stub remains
 *  so older imports/JSX references don't crash the bundle.
 */
var TwoFactorEnrollmentWizard=({onClose})=>{
  const{closing,close}=useModalClose(onClose||(()=>{}));
  return _portal(e('div',{className:'modal-overlay soft'+(closing?' closing':''),onClick:close,role:'dialog','aria-modal':'true'},
    e('div',{className:'modal-box narrow'+(closing?' closing':''),onClick:ev=>ev.stopPropagation()},
      e('div',{className:'modal-head'},
        e('h3',null,e('i',{className:'fas fa-shield-halved',style:{color:'var(--primary)'}}),' Двуфакторно удостоверяване'),
        e('button',{className:'close-btn',onClick:close,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
      ),
      e('div',{className:'modal-body',style:{display:'flex',flexDirection:'column',gap:'.85rem'}},
        e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',padding:'.55rem .7rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-xs)',fontSize:'.82rem',color:'var(--info)'}},
          e('i',{className:'fab fa-google'}),
          e('span',null,'Двуфакторното удостоверяване е активно автоматично — кодове във формата „G-123456 is your Google verification code." се изпращат на регистрирания Ви имейл при изпращане на заявка или подписване.')
        ),
        e('p',{style:{margin:0,fontSize:'.82rem',color:'var(--ink-3)',lineHeight:1.6}},'Не се изисква инсталиране на отделно приложение.')
      ),
      e('div',{className:'modal-footer'},
        e('button',{type:'button',className:'btn btn-primary',onClick:close},'Разбрах')
      )
    )
  ));
};

/* ─── DOCUMENT PREVIEW MODAL ─── */
var isTemplateDoc=doc=>{if(doc&&doc.isCopyable===true)return true;if(doc&&doc.isCopyable===false)return false;const fn=(doc.folderName||'').toLowerCase();const nm=(doc.name||'').toLowerCase();var _fid=doc.driveId||doc.id||'';var _hasRealId=_fid&&!/^(s_|doc_|up_|f_|copied_)/.test(_fid);if(_hasRealId&&fn!=='шаблони')return false;return fn==='шаблони'||nm.includes('образец')||nm.includes('декларация')||nm.includes('шаблон')||nm.includes('форма')};
/* Proxy download — fetches file bytes through the GAS backend and triggers a
   local download. Bypasses drive.google.com/uc?export=download (which redirects
   to drive.usercontent.google.com and returns HTTP 500 for script-owned binary
   files the end-user's browser session can't read directly). */
var _proxyDownload=(fileId,name,formId,retries=2)=>{
    if(!fileId)return Promise.resolve(false);
    if(String(fileId).startsWith('s')){
      // Synthetic prefix — file is not in Drive, can't proxy-download
      toast('Този файл не е наличен за изтегляне от Google Drive.','warn',4000);
      return Promise.resolve(false);
    }
    const _dl=toast('Изтегляне…','info',120000);
    const _kill=()=>{try{if(_dl&&typeof _dl.dismiss==='function')_dl.dismiss()}catch(_){}};
    var _sid=(window.STATE&&window.STATE.sessionId)||(window.__SESSION_ID)||'';
        const attempt=(n)=>{
          return api('downloadDocument',{docId:fileId,formId:formId||'',userId:_sid}).then(r=>{
        _kill();
        if(!r||r.success===false){
          if(n<retries){return new Promise(function(r){setTimeout(function(){attempt(n+1).then(r).catch(r);},1000*Math.pow(2,n));});}
          toast((r&&r.error)||'Неуспешно изтегляне','error');return false
        }
        if(r.kind==='url'&&r.url){
          // v12.12.0: use window.open directly to avoid popup blockers
          window.open(r.url,'_blank','noopener,noreferrer');
          toast('Документът е отворен','success');return true
        }
        if(r.kind==='blob'&&r.b64){
          try{
            const bin=atob(r.b64),len=bin.length,bytes=new Uint8Array(len);
            for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i);
            const blob=new Blob([bytes],{type:r.mimeType||'application/octet-stream'});
            const url=URL.createObjectURL(blob);const a=document.createElement('a');
            a.href=url;a.download=r.name||name||'document';
            document.body.appendChild(a);a.click();document.body.removeChild(a);
            setTimeout(function(){URL.revokeObjectURL(url);},4000);
            toast('Документът е изтеглен','success');return true
          }catch(e){_kill();toast('Грешка при декодиране на файла.','error');return false}
        }
        if(n<retries){return new Promise(function(r){setTimeout(function(){attempt(n+1).then(r).catch(r);},1000*Math.pow(2,n));});}
        return false;
      }).catch(function(err){
        _kill();
        if(n<retries&&err.message&&!err.message.includes('HTTP')){
          return new Promise(function(r){setTimeout(function(){attempt(n+1).then(r).catch(r);},1000*Math.pow(2,n));});}
        toast((err&&err.message)||'Неуспешно изтегляне','error');return false
      });
    };
    return attempt(0);
};
var driveEmbedUrl=doc=>{
    // v12.55.0-yai: Match yai.free.bg architecture — use /u/0 account scoping
    // and sheet-level embedding (gid) for spreadsheets. URL format:
    //   docs.google.com/spreadsheets/u/0/d/{id}/preview/sheet?gid={gid}
    //   docs.google.com/document/d/{id}/preview?rm=minimal
    if(doc.previewLink) return doc.previewLink;
    var _id=doc.driveId||doc.id||'';
    var fid=_id&&_id.length>=25&&!/^(s_|doc_|up_|f_|copied_)/.test(_id)?_id:null;
    if(!fid)return null;
    var mime=(doc.mimeType||'').toLowerCase();
    // Spreadsheets: include sheet-level gid when available (yai.free.bg pattern)
    if(mime.indexOf('google-apps.spreadsheet')>=0) {
      var sheetGid=doc.sheetGid||doc.sheetId||doc.gid||'';
      var url='https://docs.google.com/spreadsheets/u/0/d/'+encodeURIComponent(fid)+'/preview';
      if(sheetGid) url+='/sheet?gid='+encodeURIComponent(sheetGid);
      return url;
    }
    if(mime.indexOf('google-apps.document')>=0) return 'https://docs.google.com/document/d/'+encodeURIComponent(fid)+'/preview?rm=minimal';
    if(mime.indexOf('google-apps.presentation')>=0) return 'https://docs.google.com/presentation/d/'+encodeURIComponent(fid)+'/preview?rm=minimal';
    if(mime.indexOf('google-apps.drawing')>=0) return 'https://docs.google.com/drawings/d/'+encodeURIComponent(fid)+'/preview?rm=minimal';
    // Fallback to generic Drive preview for binary files (PDF, Word, images, etc.)
    return 'https://drive.google.com/file/d/'+encodeURIComponent(fid)+'/preview';
};
// ── Drive open-link fallback for documents without a real Drive file ID ──
// When a doc has an ID but it's a synthetic prefix (up_, s_, etc.), we can
// still try to open it if there's a previewLink or webViewLink from the backend.
var driveOpenUrl=doc=>{
  // v18.0.2: Prefer backend previewLink first (hardened, no /view pivot)
  var url=doc.previewLink||doc.webViewLink||'';
  if(url)return url;
  // v12.37.4-yai: Mirror yai.free.bg — recover the Drive file id from EVERY
  // link the doc carries (driveId, id, previewLink, webViewLink, downloadUrl,
  // openLink) via _driveIdFromDoc(), exactly like the inline embed does. This
  // guarantees the "Отвори в Google Drive" (edit) action is ALWAYS available
  // for any Drive-backed document, including .docx/.xlsx whose id only lives
  // in downloadUrl. Without this, those docs had no open/edit target.
  var fid=_driveIdFromDoc(doc)||'';
  // v12.27.0-404fix: Also reject short IDs (< 25 chars) — real Drive file IDs
  // are always 28+ characters, while docType IDs like 'fnisections35' are short.
  if(fid&&fid.length>=25&&!/^(s_|doc_|up_|f_|copied_)/.test(fid)){
    // v12.30.1-fix: Use MIME-aware URLs (drive.google.com/view fails for Google Docs)
    var mime=(doc.mimeType||'').toLowerCase();
    if(mime.indexOf('google-apps.document')>=0) return 'https://docs.google.com/document/d/'+encodeURIComponent(fid)+'/edit';
    if(mime.indexOf('google-apps.spreadsheet')>=0) return 'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(fid)+'/edit';
    if(mime.indexOf('google-apps.presentation')>=0) return 'https://docs.google.com/presentation/d/'+encodeURIComponent(fid)+'/edit';
    // Native Office / PDF / image files: open the Drive file viewer (the
    // same surface yai.free.bg's embedUrl targets).
    return 'https://drive.google.com/file/d/'+encodeURIComponent(fid)+'/view';
  }
  return null;
};
// v12.32.43-docfix: Same-origin streaming URL for a document. When the doc
// carries a REAL Drive file ID (28+ char, not a synthetic prefix), prefer the
// local /database/stream-doc.php endpoint — it resolves bytes from MySQL → GAS
// → Drive and self-heals, so a broken/stale Drive previewLink can never show
// the applicant Google's "файлът не съществува" 404. Returns null when there's
// no usable id or the endpoint is disabled (window.__UEV_STREAM_DOC === '').
var streamDocUrl=doc=>{
  // @url: format — direct URL for inline iframe streaming
  if(doc&&doc.url&&typeof doc.url==='string'&&doc.url.length>10) return doc.url;
  var base=window.__UEV_STREAM_DOC;
  if(!base)return null;
  var fid=doc.driveId||doc.drive_id||doc.id||'';
  if(fid&&fid.length>=25&&!/^(s_|doc_|up_|f_|copied_)/.test(fid)){
    var _u=base+(base.indexOf('?')>=0?'&':'?')+'id='+encodeURIComponent(fid);
    // v12.47.8-streamauth: stream-doc.php requires a session token (?token= or
    // X-Session-ID). Without it the endpoint 401s and the System view is dead,
    // forcing users onto the (possibly stale/deleted) Google Drive embed. Append
    // the live session id so MySQL-backed bytes render reliably.
    var _sid=(window.STATE&&window.STATE.sessionId)||(window.__SESSION_ID)||'';
    if(_sid){ _u+='&token='+encodeURIComponent(_sid); }
    return _u;
  }
  return null;
};
// v12.39.15-errorboundary: document-preview error boundary (Bulgarian fallback).
// Wraps DocumentPreviewModal body so malformed bytes / render crashes show a
// friendly message instead of an uncaught white-screen. Retry clears the error.
class DocumentPreviewErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={hasError:false,errMsg:'',errStack:''};}
  static getDerivedStateFromError(err){return {hasError:true,errMsg:(err&&err.message)||'Неизвестна грешка',errStack:(err&&err.stack)||''};}
  componentDidCatch(err,info){
    try{
      console.error('DocumentPreviewModal render error:',err,info);
      this.setState({errMsg:(err&&err.message)||this.state.errMsg,errStack:(err&&err.stack)||(info&&info.componentStack)||''});
    }catch(_){}
  }
  render(){
    if(this.state.hasError){
      var _retry=()=>this.setState({hasError:false,errMsg:'',errStack:''});
      var _msg=this.state.errMsg||'Неизвестна грешка';
      return e('div',{className:'empty-state',style:{flex:'1 1 0%',display:'flex',flexDirection:'column',justifyContent:'center',padding:'1.5rem',textAlign:'center'}},
        e('div',{className:'empty-state-icon',style:{fontSize:'2.5rem',color:'var(--warn)',marginBottom:'.75rem'}},e('i',{className:'fas fa-exclamation-triangle'})),
        e('h4',{style:{color:'var(--ink)',marginBottom:'.5rem'}},'Визуализацията на документа се провали'),
        e('p',{style:{color:'var(--ink-3)',marginBottom:'.5rem',fontSize:'.85rem',lineHeight:1.55}},'Документът не може да бъде показан в момента. Моля, опитайте да го отворите в Google Drive или да го изтеглите.'),
        e('p',{style:{color:'var(--err)',marginBottom:'1rem',fontSize:'.8rem',lineHeight:1.45,wordBreak:'break-word'}},_msg),
        e('details',{style:{maxWidth:'100%',textAlign:'left',marginBottom:'1rem',fontSize:'.72rem',color:'var(--ink-3)'}},
          e('summary',{style:{cursor:'pointer'}},'Технически детайли'),
          e('pre',{style:{whiteSpace:'pre-wrap',wordBreak:'break-word',maxHeight:140,overflow:'auto',background:'rgba(0,0,0,.04)',padding:'.5rem',borderRadius:4,marginTop:'.4rem'}},(this.state.errStack||'—'))
        ),
        e('div',{style:{display:'flex',gap:'.5rem',justifyContent:'center',flexWrap:'wrap'}},
          e('button',{className:'btn btn-outline',onClick:_retry},e('i',{className:'fas fa-redo'}),' Опитай отново'),
          e('button',{className:'btn btn-primary',onClick:function(){try{window.open(window._dpDriveFid?'https://drive.google.com/file/d/'+window._dpDriveFid+'/view':'#','_blank','noopener,noreferrer')}catch(_){}}},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive')
        )
      );
    }
    return this.props.children;
  }
}
var DocumentPreviewModal=memo(({doc,onClose,onAttach,showAttach=false,onCopyAttach,formId,isAdmin=false,onEdit,onDelete,userEmail='',isOwner=false,docList,docIndex=0,onNavigate})=>{
const{closing:dpClosing,close:dpClose}=useModalClose(onClose);
/* Backdrop-tap close: standard UX affordance on touch — without it the only
   escape route is the close button (top-right), which is unreachable when the
   slice-anchor JS has compressed the modal head. */
// v12.49.19-responsive: responsive modal height that adapts to document content
const [modalHeight, setModalHeight] = useState(() => {
  if (typeof window!=='undefined'){
    const maxH = window.innerHeight * 0.9;
    return Math.max(400, Math.min(maxH, 700));
  }
  return 700;
});

const dpOverlayHandlers=_useOverlayClickGuard(dpClose,true);
// v12.51.9-tdzfix: declare driveGone state BEFORE its first synchronous read
// (line ~882 uses `!driveGone` during render). A `const` declared later in the
// component body would throw "Cannot access 'driveGone' before initialization"
// (TDZ). Declare it here, up front; the later duplicate const is removed.
const[driveGone,setDriveGone]=useState(false); // deleted/trashed Drive file
const[driveGoneChecking,setDriveGoneChecking]=useState(false);
// v3.39.4-snakefix: Normalise snake_case from PHP API to camelCase
if(doc){
  if(doc.drive_id && !doc.driveId) doc.driveId = doc.drive_id;
  if(doc.mime_type && !doc.mimeType) doc.mimeType = doc.mime_type;
  if(doc.preview_link && !doc.previewLink) doc.previewLink = doc.preview_link;
  if(doc.web_view_link && !doc.webViewLink) doc.webViewLink = doc.web_view_link;
  if(doc.google_doc_edit_link && !doc.googleDocEditLink) doc.googleDocEditLink = doc.google_doc_edit_link;
  if(doc.edit_link && !doc.editLink) doc.editLink = doc.edit_link;
  if(doc.download_url && !doc.downloadUrl) doc.downloadUrl = doc.download_url;
  if(doc.folder_name && !doc.folderName) doc.folderName = doc.folder_name;
  if(doc.file_id && !doc.fileId) doc.fileId = doc.file_id;
  if(doc.type_label && !doc.typeLabel) doc.typeLabel = doc.type_label;
}
const vis=getDocVisuals(doc);
const[_docContent,setDocContent]=useState('');
const[_docContentLoading,setDocContentLoading]=useState(false);
// v12.54.54-uev: Autosave state (legacy yai.free.bg iframe approach)
const[autosaveEnabled,setAutosaveEnabled]=useState(true);
const[syncingToErp,setSyncingToErp]=useState(false);
const[lastSyncedAt,setLastSyncedAt]=useState(null);
const autosaveTimerRef=useRef(null);
// v12.51.1-docload: treat server-fetched content (_docContent) as renderable too,
// so the preview modal shows the document body instead of the spinner.
const hasContent=!!((doc.content||_docContent)&&String(doc.content||_docContent).trim());
// v12.32.35-fullviz: doc.content may hold RAW base64 bytes (library seeds, copied
// templates) — detect binary/complex types and treat them as full-visual, not text.
const _contentMime=String(doc.mimeType||doc.mime_type||'').toLowerCase();
const _contentIsBytes=/^application\/pdf$|wordprocessingml|spreadsheetml|excel|^image\//.test(_contentMime);
const _contentIsB64=hasContent&&/^[A-Za-z0-9+/=]{200,}$/.test((doc.content||_docContent).replace(/\s/g,''));
const _useFullVizFromContent=hasContent&&_contentIsBytes&&_contentIsB64;
const embedUrl=driveEmbedUrl(doc);
// Use backend previewLink when available (hardened, no /view pivot);
// v12.32.43-docfix: prefer the same-origin stream endpoint (MySQL→GAS→Drive,
// self-healing) over a possibly-stale Drive previewLink so applicants never
// hit Google's "файлът не съществува" 404. Falls back to Drive embed/link.
const iframeUrl=streamDocUrl(doc)||doc.previewLink||embedUrl||'';
// ── Open-link: prefer the REAL Drive link for the external "Отвори в Google
// Drive" button (so it opens the source file), but fall back to the same-origin
// stream when no Drive link exists. Note: intentionally does NOT chain embedUrl
// here so the button label stays truthful. ──
const openLink=doc.previewLink||doc.webViewLink||driveOpenUrl(doc)||streamDocUrl(doc)||'';
// ── Edit link (only for Google Docs, used only by the iframe embed) ──
const fid=doc.driveId;
const isGoogleDocType=doc.isGoogleDoc||!!(doc.mimeType||'').match(/google\.(document|spreadsheet|presentation|drawing|form)/i);
// Build the editable embed URL for switching to edit mode directly in this modal.
// v12.30.2-editinmodal: recover the Drive ID from links for library/reference
// docs (they often carry only a synthetic id but the real file ID is inside
// googleDocEditLink/previewLink/webViewLink).
const _edDriveFid=_driveIdFromDoc(doc);
const editEmbedUrl=_edDriveFid&&isGoogleDocType
  ? (doc.googleDocEditLink||('https://docs.google.com/document/d/'+encodeURIComponent(_edDriveFid)+'/edit?usp=drivesdk'))
  : '';
// v12.30.2-editembed: Google's editable embed REQUIRES ?usp=drivesdk (not the
// read-only ?usp=embed used for previews). The legacy ?usp=embed param makes
// the /edit endpoint refuse framing, so "edit" mode silently fell back to an
// error. Mirror the InlineDocEditorModal convention (?usp=drivesdk) so the
// owner actually gets an inline editable Google Docs surface.
// directEditUrl: the non-embed real editor — used as a fallback CTA when
// Google blocks the iframe via X-Frame-Options (CSP). Always works in a tab.
const directEditUrl=_edDriveFid&&isGoogleDocType
  ? (doc.googleDocEditLink||('https://docs.google.com/document/d/'+encodeURIComponent(_edDriveFid)+'/edit'))
  : '';
// v12.37.1-yai: Mirror yai.free.bg — embed Google's /preview
// DIRECTLY in the modal iframe (no CSP-bypass proxy / stream-doc round-trip).
// Google explicitly allows framing the /preview endpoint (only /edit is
// blocked by frame-ancestors), so a direct embed is the simplest, lowest-
// latency path and matches the production yai viewer 1:1.
var _dpDriveFid = _edDriveFid || fid || '';
// Keep the proxy base available ONLY as a last-resort fallback (used if the
// direct embed fails and the caller chooses to retry via proxy). It is no
// longer on the hot path — yai-style direct embed wins.
var _dpProxyBase = String(window.__UEV_PROXY_DOC || '')
  ? window.__UEV_PROXY_DOC.replace(/\?.*$/, '')
  : ((window._PHP_API_URL || (typeof _PHP_API_URL !== 'undefined' ? _PHP_API_URL : ''))
    ? String(window._PHP_API_URL || _PHP_API_URL).replace(/\/[^/]+\.php$/, '/proxy-doc.php')
    : 'database/proxy-doc.php');
var _dpShouldProxy = _dpDriveFid && _dpDriveFid.length >= 25;
var _dpProxiedPreviewUrl = _dpShouldProxy
    ? _dpProxyBase + '?driveId=' + encodeURIComponent(_dpDriveFid) + '&type=' + (isGoogleDocType && !(doc.mimeType||'').match(/sheet/i) ? 'doc' : 'sheet')
    : '';
var _dpProxiedEditUrl = _dpShouldProxy && editEmbedUrl
    ? _dpProxyBase + '?driveId=' + encodeURIComponent(_dpDriveFid) + '&type=' + (isGoogleDocType && !(doc.mimeType||'').match(/sheet/i) ? 'doc' : 'sheet') + '&edit=1'
    : '';
// DIRECT Google /preview embed (yai.free.bg pattern) — MIME-aware URL logic
// v12.49.86-deadpagefix: a trashed/deleted Drive file yields a Google /preview
// URL that renders Google's own "file deleted" dead page inside the iframe — JS
// can NEVER read/intercept cross-origin iframe content, so the user dead-ends on
// Google's page. Gate all Google-embed URLs on !driveGone so a deleted file
// renders our clean missing-doc state instead. (GAS getDocumentVisuals + PHP
// handleGetDocumentVisuals both now return a deleted:true signal; this gate
// also covers the drivefilemeta preflight at L1158 which sets driveGone.)
var _dpDirectEmbed = '';
if (_dpDriveFid && _dpDriveFid.length >= 25 && !driveGone) {
  var _dm = String(doc.mimeType || doc.mime_type || '').toLowerCase();
  if (_dm.indexOf('google-apps.document') >= 0) {
    _dpDirectEmbed = 'https://docs.google.com/document/d/' + encodeURIComponent(_dpDriveFid) + '/preview?rm=minimal';
  } else if (_dm.indexOf('google-apps.spreadsheet') >= 0) {
    _dpDirectEmbed = 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(_dpDriveFid) + '/preview?rm=minimal';
  } else if (_dm.indexOf('google-apps.presentation') >= 0) {
    _dpDirectEmbed = 'https://docs.google.com/presentation/d/' + encodeURIComponent(_dpDriveFid) + '/preview?rm=minimal';
  } else if (_dm.indexOf('google-apps.drawing') >= 0) {
    _dpDirectEmbed = 'https://docs.google.com/drawings/d/' + encodeURIComponent(_dpDriveFid) + '/preview?rm=minimal';
  } else {
    _dpDirectEmbed = 'https://drive.google.com/file/d/' + encodeURIComponent(_dpDriveFid) + '/preview?rm=minimal';
  }
}
// yai.free.bg: the iframe source is the DIRECT Google embed for anything that
// has a real Drive file id; otherwise fall back to the backend stream/preview
// URL. The proxy (_dpProxiedPreviewUrl) is intentionally NOT used on the hot
// path — Google /preview frames fine without it.
var _dpEffectivePreviewUrl = _dpDirectEmbed
    ? _dpDirectEmbed
    : (iframeUrl || '');
// v12.38.2-edit: native edit uses the REAL Google /edit URL (opens the Google
// editor — in-modal if Google permits, otherwise the existing CSP-block handler
// falls back to opening it in a new tab). The proxy ?edit=1 HTML-export path is
// deliberately NOT used here: it dumps the doc's bytes as a raw string instead
// of showing the native Google editor, which is the broken behaviour we removed.
var _dpEffectiveEditUrl = (editEmbedUrl && /^https:\/\/(docs|drive|accounts)\.google\.com/i.test(editEmbedUrl))
    ? editEmbedUrl
    : (_dpProxiedEditUrl || '');
// v12.47.5-gnative: scope-safe Google-native control links for THIS modal.
// These were originally declared only in InlineDocEditorModal (var gNative at
// 1760 / _gnOpen), so the "Отделяне" (detach) button at ~1356 threw
// "gNative is not defined" and the preview modal crashed. Re-derive them here
// against DocumentPreviewModal's OWN vars (_dpDriveFid, isGoogleDocType) - DO NOT
// reference _driveFid/isGoogleDoc/isGoogleSheet (those belong to the other modal).
var _dpGnBase = (_dpDriveFid && _dpDriveFid.length >= 25 && /(google-apps\.(document|spreadsheet|presentation|drawing|form)|google\.(document|spreadsheet|presentation|drawing|form))/i.test(doc.mimeType || doc.mime_type || ''))
  ? (/(sheet|spreadsheet)/i.test(doc.mimeType || doc.mime_type || '') ? 'https://docs.google.com/spreadsheets/d/' : 'https://docs.google.com/document/d/') + encodeURIComponent(_dpDriveFid)
  : '';
var gNative = _dpGnBase ? {
  comment: _dpGnBase + '/edit?usp=drivesdk#heading=h.comments',
  suggest: _dpGnBase + '/edit?usp=drivesdk&mode=suggesting',
  history: _dpGnBase + '/revisions',
  copy:    _dpGnBase + '/copy',
  print:   _dpGnBase + '/export?format=pdf'
} : null;
var _gnOpen = function(url){ if(url) window.open(url, '_blank', 'noopener,noreferrer'); };

/* ─── openDocInNewTab ─── (ported from reference documents.js, Google-Docs-style)
 * Stream a document into a clean new browser tab WITHOUT a modal/iframe:
 *   - Drive docs      → webViewLink/previewLink (open native)
 *   - downloadUrl     → open raw file
 *   - text/HTML content → render as a styled HTML blob (exactly how Google
 *     renders plain docs) so the user gets a readable page instead of a .txt
 *     download. HTML is sanitized (no <script>, no inline event handlers) so
 *     the blob can never execute attacker content. Falls back to a raw .txt
 *     blob if sanitization strips everything. */
function openDocInNewTab(doc){
  if(!doc)return;
  if(doc.webViewLink){ window.open(doc.webViewLink,'_blank','noopener,noreferrer'); return; }
  if(doc.previewLink){ window.open(doc.previewLink,'_blank','noopener,noreferrer'); return; }
  if(doc.downloadUrl){ window.open(doc.downloadUrl,'_blank','noopener,noreferrer'); return; }
  if(doc.content || doc.text){
    var _raw = String(doc.content || doc.text || '');
    var _name = String(doc.name || 'Документ').replace(/[<>&\"']/g, function(c){ return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]; });
    var _safe = _raw
      .replace(/<\s*script[\s\S]*?<\/script>/gi,'')
      .replace(/<\s*style[\s\S]*?<\/style>/gi,'')
      .replace(/\son\w+\s*=\s*"[^"]*"/gi,'')
      .replace(/\son\w+\s*=\s*'[^']*'/gi,'')
      .replace(/[<>&]/g, function(c){ return ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c]; });
    var _isHtml = /<(p|div|h[1-6]|br|ul|ol|li|table|bold|b|i|span|a|img)\b/i.test(_raw);
    var _body = _isHtml ? _safe : '<pre>'+_safe+'</pre>';
    var _html =
      '<!doctype html><html lang="bg"><head><meta charset="utf-8"><title>'+_name+'</title>'
      +'<meta name="viewport" content="width=device-width,initial-scale=1">'
      +'<style>body{margin:0;background:#f2f2f2;font-family:"Open Sans",system-ui,sans-serif;color:#1a1a1a;line-height:1.7}'
      +'header{background:#233874;color:#fff;padding:1rem 1.5rem;font-family:Merriweather,Georgia,serif;box-shadow:0 2px 8px rgba(0,0,0,.15);position:sticky;top:0;z-index:10}'
      +'header h1{margin:0;font-size:1.05rem;font-weight:700}'
      +'main{max-width:880px;margin:1.5rem auto;background:#fff;padding:2rem 2.4rem;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.06);border-top:3px solid #233874}'
      +'pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:.92rem;margin:0}'
      +'a{color:#1a73e8}@media(max-width:640px){main{margin:.5rem;padding:1.2rem}}</style></head>'
      +'<body><header><h1>'+_name+'</h1></header><main>'+_body+'</main></body></html>';
    var _blob = new Blob([_html],{type:'text/html;charset=utf-8'});
    var _url = URL.createObjectURL(_blob);
    var _win = window.open(_url,'_blank','noopener,noreferrer');
    setTimeout(function(){ URL.revokeObjectURL(_url); }, 60000);
    if(!_win && typeof toast==='function') toast('Отварянето е блокирано от браузъра. Разрешете изскачащи прозорци.','error');
    return;
  }
  if(typeof toast==='function') toast('Документът няма съдържание за визуализация','warn');
}
try{ window.UEV_openDocInNewTab = openDocInNewTab; }catch(_){}


// Initial iframe source: Google-native docs go straight to the direct Google
// preview (no stream-doc page chrome inside the modal); everything else keeps
// the same-origin stream endpoint (native PDF/image/office rendering with
// self-healing bytes from MySQL → GAS → Drive).
var _dpIframeSrc = _dpDirectEmbed || _dpEffectivePreviewUrl;

// v12.51.3-docfix: _sdBase must always resolve to the real stream-doc.php
// endpoint, regardless of what _PHP_API_URL is set to. In Laravel mode
// hostinger-config-laravel.js sets _PHP_API_URL='/api' (no .php suffix) so
// the old regex fallback produced a broken relative path. Use the same
// absolute base that streamDocUrl() already uses — __UEV_STREAM_DOC — which
// config.js sets to '/database/stream-doc.php' and is never overwritten.
var _sdBase = String(window.__UEV_STREAM_DOC || '')
  ? window.__UEV_STREAM_DOC.replace(/\?.*$/, '')
  : (window._PHP_API_URL && /\.php$/.test(String(window._PHP_API_URL))
    ? String(window._PHP_API_URL).replace(/\/[^/]+\.php$/, '/stream-doc.php')
    : 'database/stream-doc.php');
var _sdKey=doc.id||doc.driveId||'';
// v12.49.66-previewfix: the System (same-origin stream) view MUST carry the
// session token, else stream-doc.php 401s and the System view is dead — forcing
// users onto the (possibly stale/deleted) Google Drive embed. Mirror streamDocUrl().
var _sdUrl=_sdKey?_sdBase+'?id='+encodeURIComponent(_sdKey):'';
if(_sdUrl){
  var _sdSid=(window.STATE&&window.STATE.sessionId)||(window.__SESSION_ID)||'';
  if(_sdSid){ _sdUrl+='&token='+encodeURIComponent(_sdSid); }
}

const hasWebView=!!openLink;
const hasDownload=!!doc.downloadUrl;
// v12.37.3-forcedrive: prefer the native Google embed whenever a Drive id
// is recoverable (yai.free.bg parity). DB-stream stays as fallback only.
const canEmbed=!!(_dpDirectEmbed||_dpEffectivePreviewUrl);
const isTemplate=isTemplateDoc(doc);
// ── Owner / edit-by-default logic ─────────────────────────────────────────
// If the signed-in Google user is the document owner (applicant rank), open
// the modal straight in EDIT mode (instead of read-only view) when a Google
// Docs edit embed is available. Resolves the current user from the explicit
// `userEmail` prop, falling back to the global _currentUserEmail set at login.
// Ownership is taken from `isOwner` prop (caller knows the source, e.g. the
// user's own "Моите документи" list) or from a matching owner email on `doc`.
const _dpCurrentEmail=(function(){var _e=userEmail||(typeof _currentUserEmail!=='undefined'?_currentUserEmail:'');return String(_e||'').toLowerCase();})();
const _dpOwnerEmail=String((doc&&(doc.ownerEmail||doc.userEmail||doc.applicantEmail||doc.createdBy||''))||'').toLowerCase();
const _dpIsOwner=!!isOwner||(!!_dpCurrentEmail&&!!_dpOwnerEmail&&_dpCurrentEmail===_dpOwnerEmail);
// Default to edit mode for the owner when an editable Google Docs embed exists.
// Google blocks framing Drive previews with CSP, so edit mode (which uses the
// /edit?usp=drivesdk URL) is the only in-modal editable surface for owners.
const _dpStartEdit=!!_dpEffectiveEditUrl && _dpIsOwner && !isAdmin;
const[viewMode,setViewMode]=useState('iframe');
const[editMode,setEditMode]=useState(_dpStartEdit);
const[copying,setCopying]=useState(false);
const[deletingP,setDeletingP]=useState(false);
const[iframeLoading,setIframeLoading]=useState(true);
const[iframeError,setIframeError]=useState(false);
// v12.51.9-tdzfix: driveGone/driveGoneChecking are now declared up front (before
// their first synchronous read at ~882), so they are NOT redeclared here.
// v12.32.34-docviz: DB-served visualization fallback. When Google blocks/errors
// the embed, fetch the document bytes via downloadDocument (MySQL content →
// GAS/Drive fallback with DB caching) and render INLINE: pdf/images via blob
// URL, text/html via the ERP renderer. The modal never dead-ends on Google.
const[dbViz,setDbViz]=useState(null); // {kind:'pdf'|'img'|'text'|'html'|'exturl'|'none'|'full', url?, text?, mime?, b64?, payload?}
const[dbVizLoading,setDbVizLoading]=useState(false);
// v12.51.1-docload: hydrate the document body so the preview actually RENDERS
// text/HTML content instead of hanging on the "Зареждане на документа…" spinner.
// The documents list often passes summary objects without `content`; fetch it
// on open (mirrors the editor modal getdocumentcontent path).
useEffect(function(){
  if(!doc)return;
  if(doc.content&&doc.content.trim()){setDocContent(doc.content);return;}
  var _cid=doc.id||doc.driveId||doc.fileId||'';
  if(!_cid)return;
  setDocContentLoading(true);
  api('getdocumentcontent',{docId:_cid}).then(function(r){
    if(r&&r.success&&r.content){setDocContent(r.content);}
  }).catch(function(){}).finally(function(){setDocContentLoading(false);});
},[doc&&(doc.id||doc.driveId||doc.fileId),doc&&doc.content]);

const[fullVizBusy,setFullVizBusy]=useState(false);
const[fullVizFailed,setFullVizFailed]=useState(false);
// v12.32.44-streamfix: the stream endpoint answered with JSON/404 ("No
// streamable content") — never leave the iframe showing raw JSON. streamBroken
// records the failure; showInlineEdit opens the Google-styled view/edit editor
// (InlineDocEditorModal inline mode) inside THIS modal instead.
const[streamBroken,setStreamBroken]=useState(false);
const[showInlineEdit,setShowInlineEdit]=useState(false);
// v12.51.6-gdocsdefault: DEFAULT to the Google Drive /preview embed for ALL
// documents (user request: "a google doc visualization to appear for all
// documents" instead of the System/stream view). The "Система" segmented
// control remains as a manual fallback for docs whose Drive id is stale/deleted
// (Google shows its own dead page, and the user can switch to the self-healing
// same-origin stream). When no Google Drive id exists at all, the
// activeIframeUrl chain still falls back to stream-doc.php, so binaries and
// ERP-stored docs keep rendering.
// v12.51.6-selfhosted: default to the self-hosted viewer (UEVDocViewer /
// stream-doc.php) for ALL documents. The Google Drive /preview embed remains
// available as a one-click toggle for users who prefer it. Self-hosted is
// primary because it works without Google framing dependencies, survives
// stale/deleted Drive ids, and renders real bytes (PDF/DOCX/XLSX) client-side.
// v12.51.12-gnative: native Google /preview is now the DEFAULT for Drive-backed
// docs (systemView flips back to the ERP same-origin stream). forceDrive is gone.
// driveEmbedStatus tracks the native iframe's load/error so we can show a spinner
// and a graceful CSP/network fallback instead of a blank frame.
const[systemView,setSystemView]=useState(false);
const[driveEmbedStatus,setDriveEmbedStatus]=useState('loading'); // 'loading' | 'ready' | 'error'
// v12.49.44-docstream: toggle for the real-time collaborative editor overlay.
const[docStreamOpen,setDocStreamOpen]=useState(false);
// T10: aria-live status string announced to screen readers on state changes
const[_dpAriaStatus,setDpAriaStatus]=useState('');
const fullVizRef=useRef(null);
// D10 — document version history panel
const [docVersions, setDocVersions] = useState([]);
const [docVersionsOpen, setDocVersionsOpen] = useState(false);
const [docVersionsLoading, setDocVersionsLoading] = useState(false);
// Task 21 — document comments panel
const [docCommentsOpen, setDocCommentsOpen] = useState(false);
// v12.51.6-sidebar: document info + annotations sidebar
const [docSidebarOpen, setDocSidebarOpen] = useState(false);
const [annotations, setAnnotations] = useState([]);
const [annotationsLoading, setAnnotationsLoading] = useState(false);
const _docAnnoKey = doc.id || doc.driveId || doc.fileId || '';
const _loadAnnotations = useCallback(function(){
  if(!_docAnnoKey||typeof window==='undefined'||!window.UEVDocViewer) return;
  setAnnotationsLoading(true);
  try{ var a=window.UEVDocViewer.annotations.get(_docAnnoKey); setAnnotations(Array.isArray(a)?a:[]); }catch(_){ setAnnotations([]); }
  setAnnotationsLoading(false);
},[_docAnnoKey]);
useEffect(function(){ if(docSidebarOpen) _loadAnnotations(); },[docSidebarOpen,_loadAnnotations]);
const _addAnnotation = useCallback(function(){
  if(!_docAnnoKey||typeof window==='undefined'||!window.UEVDocViewer) return;
  var txt=window.prompt('Нова анотация:');
  if(!txt||!txt.trim()) return;
  try{ window.UEVDocViewer.annotations.add(_docAnnoKey,{text:txt.trim()}); _loadAnnotations(); }catch(_){}
},[_docAnnoKey,_loadAnnotations]);
const _removeAnnotation = useCallback(function(aid){
  if(!_docAnnoKey||typeof window==='undefined'||!window.UEVDocViewer) return;
  try{ window.UEVDocViewer.annotations.remove(_docAnnoKey,aid); _loadAnnotations(); }catch(_){}
},[_docAnnoKey,_loadAnnotations]);
const _loadDocVersions = useCallback(function(){
  if (docVersionsLoading) return;
  setDocVersionsLoading(true);
  var _did = doc.driveId || doc.id || doc.fileId || '';
  api('getdocversions', { docId: doc.id || _did, driveId: _did }).then(function(r){
    if (r && r.success && Array.isArray(r.versions)) setDocVersions(r.versions);
    else setDocVersions([]);
  }).catch(function(){ setDocVersions([]); }).finally(function(){ setDocVersionsLoading(false); });
}, [doc, docVersionsLoading]);
// v12.49.18-docnav: in-modal document navigation. When the caller passes a
// `docList` (array of docs) + `docIndex`, the modal renders prev/next
// controls and supports ArrowLeft/ArrowRight so users browse documents
// without closing the modal. Falls back to hidden when no list is supplied.
const _docNavList = Array.isArray(docList) ? docList : null;
const _docNavPos = _docNavList ? Math.max(0, Math.min(docIndex||0, _docNavList.length-1)) : 0;
const _docNavHasPrev = !!_docNavList && _docNavPos > 0;
const _docNavHasNext = !!_docNavList && _docNavPos < _docNavList.length-1;
const _goToDoc = useCallback(function(delta){
  if(!_docNavList || typeof onNavigate !== 'function') return;
  var next = _docNavPos + delta;
  if(next < 0 || next >= _docNavList.length) return;
  var d = _docNavList[next];
  if(!d) return;
  // Reset per-document view state so the next doc opens cleanly in the parent.
  setSystemView(false);
  setDriveEmbedStatus('loading');
  setDbViz(null);
  setIframeError(false);
  setIframeLoading(true);
  setDriveGone(false);
  onNavigate(d, next, _docNavList);
},[_docNavList,_docNavPos,onNavigate]);
useEffect(function(){
  if(!_docNavList) return;
  var _onKey=function(ev){
    if(ev.key==='ArrowLeft'){ if(_docNavHasPrev){ ev.preventDefault(); _goToDoc(-1); } }
    else if(ev.key==='ArrowRight'){ if(_docNavHasNext){ ev.preventDefault(); _goToDoc(1); } }
  };
  if(typeof window!=='undefined'){ window.addEventListener('keydown',_onKey); }
  return function(){ if(typeof window!=='undefined'){ window.removeEventListener('keydown',_onKey); } };
},[_docNavList,_docNavHasPrev,_docNavHasNext,_goToDoc]);
// v12.48.3: native viewer URL for large files (defined before _fullViz to avoid TDZ)
var _nativeViewUrl = (window.UEVDocViewer && window.UEVDocViewer.nativeViewerUrl) ? window.UEVDocViewer.nativeViewerUrl(doc.downloadUrl || null) : null;
// v12.32.35-fullviz: render REAL file bytes (Word/Excel/PDF/Image) with full
// visual fidelity via UEVDocViewer (mammoth/SheetJS/pdf.js) — not text-only.
const _fullViz=useCallback(function(payload){
  if(typeof window.UEVDocViewer==='undefined'||!fullVizRef.current){setFullVizFailed(true);return Promise.resolve(false);}
  setFullVizBusy(true);setFullVizFailed(false);
  // v12.48.3: if the system render fails for a large file, offer native view
  var _fallback=function(){
    setFullVizBusy(false);
    setFullVizFailed(true);
  };
  return window.UEVDocViewer.render(fullVizRef.current,Object.assign({},payload,{onNativeFallback:_fallback})).then(function(ok){
    setFullVizBusy(false);
    if(!ok)setFullVizFailed(true);
    return ok;
  }).catch(function(){setFullVizBusy(false);setFullVizFailed(true);return false;});
},[doc.downloadUrl]);
// v12.32.36-fullviz-fix: rendering must be EFFECT-driven. The old code called
// _fullViz() right after setDbViz(), but the ref container only mounts on the
// NEXT render — fullVizRef.current was null and the visual never appeared
// ("документът не се зарежда"). This effect fires after the container exists.
const _fullVizDoneRef=useRef('');
useEffect(function(){
  if(dbViz&&dbViz.kind==='full'&&dbViz.b64&&fullVizRef.current){
    var key=(dbViz.mime||'')+':'+(dbViz.b64.length)+':'+(dbViz.name||'');
    if(_fullVizDoneRef.current===key)return;
    _fullVizDoneRef.current=key;
    _fullViz({mime:dbViz.mime,b64:dbViz.b64,name:dbViz.name||doc.name});
  }
},[dbViz,_fullViz,doc]);
// v12.32.37-ux: retry hook — clears the dedup key and re-runs the render.
const _fullVizRetry=useCallback(function(){
  _fullVizDoneRef.current='';
  setFullVizFailed(false);
  if(dbViz&&dbViz.kind==='full'&&dbViz.b64)setDbViz(Object.assign({},dbViz));
},[dbViz]);
// v12.34.0-gdrive-embed: when the full-visual (UEVDocViewer) render FAILS for a
// document that has a real Drive file id, fall back to the Google Drive INLINE
// preview (/preview iframe) so the document is still VISIBLE inside
// the modal instead of a dead-end "не можа да се визуализира в панела" error.
// This is exactly the вграден преглед в Google Drive the ERP view modal needs.
// Keeps "Опитай отново" + "Отвори в Google Drive" below the embed as fallback.
const _dpDriveEmbedFallback = (_dpDriveFid && _dpDriveFid.length>=25) ? (_dpProxiedPreviewUrl||_dpDirectEmbed||'') : '';
// v12.35.0-driveembed: canonical inline Drive embed URL. Prefers the RAW
// Google /preview endpoint (Google explicitly allows framing /preview — only
// /edit is blocked by frame-ancestors), and keeps the CSP-bypass proxy as the
// secondary path. This is the "вграден преглед в Google Drive" surface.
// v12.49.86-deadpagefix: gate on !driveGone — a trashed/deleted Drive file's
// /preview URL renders Google's own dead-page which JS can never read, so we
// must keep the embed empty until the modal can show our missing-doc state.
const _dpDriveInlineEmbed = (_dpDriveFid && _dpDriveFid.length>=25 && !driveGone) ? _dpDirectEmbed : '';
const canDriveEmbed = !!_dpDriveInlineEmbed;
// v12.51.12-gnative: native embed with load/error handling.
// Google's own preview page renders the toolbar; we keep our chrome shell and
// a graceful spinner/error fallback if framing is blocked (CSP / X-Frame-Options)
// or the network hiccups — better than a blank frame.
// v12.51.12-gnative: native embed with load/error handling.
// Google's own preview page renders the toolbar; we keep our chrome shell and
// a graceful spinner/error fallback if framing is blocked (CSP / X-Frame-Options)
// or the network hiccups — better than a blank frame.
// v12.51.15-gnative-edit: the iframe source MUST follow edit mode. The owner
// gets Google's native /edit?usp=drivesdk surface (a real, in-iframe editable
// Google Docs editor) when editMode is on; everyone else gets the read-only
// /preview. Previously this render ALWAYS used _dpDriveInlineEmbed (/preview),
// so the "Редактирай" toggle silently did nothing.
const _dpDriveEmbedSrc = (editMode && _dpEffectiveEditUrl)
  ? _dpEffectiveEditUrl
  : _dpDriveInlineEmbed;
const renderDriveEmbed=function(extraFooter=true){
  if(!_dpDriveEmbedSrc){
    // Defensive: nothing to embed. Offer the system fallback / open-in-Drive.
    return e('div',{style:{position:'absolute',inset:0,zIndex:3,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(241,243,244,.92)',flexDirection:'column',gap:'.6rem',padding:'1rem',textAlign:'center'}},
      e('i',{className:'fas fa-exclamation-circle',style:{fontSize:'1.8rem',color:'var(--warn)'}}),
      e('span',{style:{fontSize:'.82rem',color:'var(--ink-2)',maxWidth:340}},'Документът няма наличен вграден преглед.'),
      e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center',marginTop:'.3rem'}},
        e('button',{className:'btn btn-outline',onClick:function(){setSystemView(true);}},e('i',{className:'fas fa-database'}),' Визуализирай в системата'),
        openLink&&e('button',{className:'btn btn-success',onClick:function(){window.open(openLink,'_blank','noopener,noreferrer');}},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive')
      )
    );
  }
  return e('div',{style:{position:'absolute',inset:0,zIndex:3,display:'flex',flexDirection:'column',background:'var(--surface)',overflow:'hidden'}},
    e('div',{className:'doc-zoom-wrap gdoc-embed-scroll',style:{flex:'1 1 auto',minHeight:0,display:'flex',overflow:'auto',WebkitOverflowScrolling:'touch',position:'relative'}},
      driveEmbedStatus==='loading'&&e('div',{style:{position:'absolute',inset:0,zIndex:2,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.75rem'}},
        e('i',{className:'fas fa-spinner fa-spin',style:{fontSize:'2rem',color:'var(--ink-4)'}}),
        e('span',{style:{fontSize:'.82rem',color:'var(--ink-3)'}},'Зареждане на прегледа от Google…')
      ),
      driveEmbedStatus==='error'&&e('div',{style:{position:'absolute',inset:0,zIndex:2,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(241,243,244,.94)',flexDirection:'column',gap:'.6rem',padding:'1rem',textAlign:'center'}},
        e('i',{className:'fas fa-ban',style:{fontSize:'1.8rem',color:'var(--warn)'}}),
        e('span',{style:{fontSize:'.82rem',color:'var(--ink-2)',maxWidth:340}},
          editMode
            ? 'Редакторът на Google не може да се вгради тук (Google блокира вграждането в iframe). Отворете документа за редакция в нов раздел.'
            : 'Прегледът не може да се вгради тук (Google блокира вграждането или липсва мрежа).'),
        e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center',marginTop:'.3rem'}},
          editMode&&directEditUrl&&e('button',{className:'btn btn-primary',onClick:function(){window.open(directEditUrl,'_blank','noopener,noreferrer');}},e('i',{className:'fas fa-edit'}),' Отвори за редакция'),
          e('button',{className:'btn btn-success',onClick:function(){window.open(openLink||_dpDriveInlineEmbed,'_blank','noopener,noreferrer');}},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive'),
          e('button',{className:'btn btn-outline',onClick:function(){setSystemView(true);}},e('i',{className:'fas fa-database'}),' Визуализирай в системата')
        )
      ),
      e('iframe',{
        src:_dpDriveEmbedSrc,
        className:'doc-preview-frame',
        style:{border:'none',width:'100%',height:'100%',background:'var(--surface)',visibility:driveEmbedStatus==='ready'?'visible':'hidden'},
        title:doc.name||(editMode?'Редактиране':'Преглед'),
        allow:'autoplay; fullscreen; picture-in-picture; clipboard-write; camera; microphone; display-capture',
        referrerPolicy:'no-referrer-when-downgrade',
        sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',
        onLoad:function(){setDriveEmbedStatus('ready');},
        onError:function(){setDriveEmbedStatus('error');}
      })
    ),
    e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center',padding:'.5rem',borderTop:'1px solid #e8eaed',background:'#fafbfc',alignItems:'center'}},
      e('button',{className:'btn btn-outline btn-sm',onClick:function(){setDriveEmbedStatus('loading');_fullVizRetry();setSystemView(true);}},e('i',{className:'fas fa-redo'}),' Визуализирай в системата'),
      openLink&&e('button',{className:'btn btn-success btn-sm',onClick:function(){window.open(openLink,'_blank','noopener,noreferrer');}},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive'),
      e('button',{className:'doc-zoom-btn',onClick:zoomOut,disabled:zoom<=ZOOM_MIN+0.001,title:'Намали (−)'},e('i',{className:'fas fa-search-minus'})),
      e('button',{className:'doc-zoom-btn doc-zoom-pct',onClick:zoomReset,title:'Възстанови мащаба'},zoomPct+'%'),
      e('button',{className:'doc-zoom-btn',onClick:zoomIn,disabled:zoom>=ZOOM_MAX-0.001,title:'Увеличи (+)'},e('i',{className:'fas fa-search-plus'})),
      e('button',{className:'doc-zoom-btn'+(viewFit==='width'?' active':''),onClick:handleFitWidth,title:'По ширина'},e('i',{className:'fas fa-arrows-alt-h'})),
      e('button',{className:'doc-zoom-btn'+(viewFit==='page'?' active':''),onClick:handleFitPage,title:'По страница'},e('i',{className:'fas fa-file'})),
      e('button',{className:'doc-zoom-btn'+(viewFit==='free'?' active':''),onClick:handleFitFree,title:'Свободен мащаб'},e('i',{className:'fas fa-expand-arrows-alt'})),
      e('button',{className:'doc-zoom-btn',onClick:handleScrollUp,title:'Нагоре'},e('i',{className:'fas fa-arrow-up'})),
      e('button',{className:'doc-zoom-btn',onClick:handleScrollTop,title:'От начало'},e('i',{className:'fas fa-angle-double-up'})),
      e('button',{className:'doc-zoom-btn',onClick:handleScrollDown,title:'Надолу'},e('i',{className:'fas fa-arrow-down'})),
      extraFooter!==false&&e('button',{className:'doc-zoom-btn',onClick:function(){setDriveEmbedStatus('loading');setSystemView(true);_fullVizRetry();},title:'Визуализация от системата'},e('i',{className:'fas fa-database'}),' Система'),
      // v12.54.54-uev: Autosave toggle + indicator
      e('button',{className:'doc-zoom-btn'+(autosaveEnabled?' active':''),onClick:function(){setAutosaveEnabled(!autosaveEnabled);},title:autosaveEnabled?'Автоматично записване ВКЛ':'Автоматично записване ИЗКЛ','aria-label':'Автозапис'},syncingToErp?e('i',{className:'fas fa-sync spin'}):e('i',{className:autosaveEnabled?'fas fa-cloud-upload-alt':'fas fa-ban'}),lastSyncedAt?e('span',{style:{fontSize:'.55rem'}},Math.round((Date.now()-lastSyncedAt)/1000)+'с'):null)
    )
  );
};
// v13.01.0-gdrive-stream: Google Drive iframe stream with /preview?rm=minimal.
// Streams the document inside the modal using Google's minimal-preview endpoint,
// giving a Google-styled full-control view for every Drive-hosted document.
// The rm=minimal param strips Google's chrome chrome for a clean ERP modal shell.
const renderDriveStream=function(){
  var _streamFid=_dpDriveFid||'';
  if(!_streamFid||_streamFid.length<25)return null;
  var _streamUrl='https://drive.google.com/file/d/'+encodeURIComponent(_streamFid)+'/preview?rm=minimal';
  return e('div',{style:{position:'absolute',inset:0,zIndex:3,display:'flex',flexDirection:'column',background:'var(--surface)',overflow:'hidden'}},
    e('div',{className:'doc-zoom-wrap gdoc-embed-scroll',style:{flex:'1 1 auto',minHeight:0,display:'flex',overflow:'auto',WebkitOverflowScrolling:'touch',position:'relative'}},
      e('iframe',{
        src:_streamUrl,
        className:'doc-preview-frame',
        style:{border:'none',width:'100%',height:'100%',background:'var(--surface)',visibility:'visible'},
        title:doc.name||'Google Drive preview',
        allow:'autoplay; fullscreen; picture-in-picture; clipboard-write; camera; microphone; display-capture',
        referrerPolicy:'no-referrer-when-downgrade',
        sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',
        onLoad:function(){setDriveEmbedStatus('ready');},
        onError:function(){setDriveEmbedStatus('error');}
      })
    ),
    e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center',padding:'.5rem',borderTop:'1px solid #e8eaed',background:'#fafbfc',alignItems:'center'}},
      e('button',{className:'btn btn-outline btn-sm',onClick:function(){setDriveEmbedStatus('loading');_fullVizRetry();setSystemView(true);}},e('i',{className:'fas fa-redo'}),' Презареди'),
      openLink&&e('button',{className:'btn btn-success btn-sm',onClick:function(){window.open(openLink,'_blank','noopener,noreferrer');}},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Drive'),
      e('button',{className:'doc-zoom-btn',onClick:zoomOut,disabled:zoom<=ZOOM_MIN+0.001,title:'Намали (−)'},e('i',{className:'fas fa-search-minus'})),
      e('button',{className:'doc-zoom-btn doc-zoom-pct',onClick:zoomReset,title:'Възстанови мащаба'},zoomPct+'%'),
      e('button',{className:'doc-zoom-btn',onClick:zoomIn,disabled:zoom>=ZOOM_MAX-0.001,title:'Увеличи (+)'},e('i',{className:'fas fa-search-plus'})),
      e('button',{className:'doc-zoom-btn'+(viewFit==='width'?' active':''),onClick:handleFitWidth,title:'По ширина'},e('i',{className:'fas fa-arrows-alt-h'})),
      e('button',{className:'doc-zoom-btn'+(viewFit==='page'?' active':''),onClick:handleFitPage,title:'По страница'},e('i',{className:'fas fa-file'})),
      e('button',{className:'doc-zoom-btn'+(viewFit==='free'?' active':''),onClick:handleFitFree,title:'Свободен мащаб'},e('i',{className:'fas fa-expand-arrows-alt'})),
      e('button',{className:'doc-zoom-btn',onClick:handleScrollUp,title:'Нагоре'},e('i',{className:'fas fa-arrow-up'})),
      e('button',{className:'doc-zoom-btn',onClick:handleScrollTop,title:'От начало'},e('i',{className:'fas fa-angle-double-up'})),
      e('button',{className:'doc-zoom-btn',onClick:handleScrollDown,title:'Надолу'},e('i',{className:'fas fa-arrow-down'})),
      extraFooter!==false&&e('button',{className:'doc-zoom-btn',onClick:function(){setDriveEmbedStatus('loading');setSystemView(true);_fullVizRetry();},title:'Визуализация от системата'},e('i',{className:'fas fa-database'}),' Система'),
      e('button',{className:'doc-zoom-btn'+(autosaveEnabled?' active':''),onClick:function(){setAutosaveEnabled(!autosaveEnabled);},title:autosaveEnabled?'Автоматично записване ВКЛ':'Автоматично записване ИЗКЛ','aria-label':'Автозапис'},syncingToErp?e('i',{className:'fas fa-sync spin'}):e('i',{className:autosaveEnabled?'fas fa-cloud-upload-alt':'fas fa-ban'}),lastSyncedAt?e('span',{style:{fontSize:'.55rem'}},Math.round((Date.now()-lastSyncedAt)/1000)+'с'):null)
    )
  );
};
const renderFullVizFailed=function(){
  if(_dpDriveEmbedFallback){return renderDriveEmbed();}
  // Stream document inline in modal iframe — document shows behind controls
  var _streamFid=_dpDriveFid||'';
  var _src=doc.url||openLink||doc.downloadUrl||doc.webContentLink||doc.previewLink||'';
  var _fid=_streamFid.length>=25?_streamFid:'';
  var _driveUrl=_fid?'https://drive.google.com/file/d/'+encodeURIComponent(_fid)+'/preview?rm=minimal':'';
  // No direct URL — try constructing from doc metadata (driveId/fileId)
  var _driveId=doc.driveId||'';
  var _fileId=doc.fileId||'';
  var _metaUrl=_driveId.length>=25?'https://drive.google.com/file/d/'+encodeURIComponent(_driveId)+'/preview?rm=minimal':_fileId.length>=25?'https://drive.google.com/file/d/'+encodeURIComponent(_fileId)+'/preview?rm=minimal':'';
  var _iframeSrc=_driveUrl||_src||_metaUrl;
  if(_iframeSrc){
    return e('div',{style:{position:'absolute',inset:0,zIndex:3,display:'flex',flexDirection:'column',background:'var(--surface)',overflow:'hidden'}},
      e('div',{className:'doc-zoom-wrap gdoc-embed-scroll',style:{flex:'1 1 auto',minHeight:0,display:'flex',overflow:'auto',WebkitOverflowScrolling:'touch',position:'relative'}},
        e('iframe',{src:_iframeSrc,className:'doc-preview-frame',style:{border:'none',width:'100%',height:'100%',background:'var(--surface)',visibility:'visible'},title:doc&&doc.name?doc.name:'Документ',allow:'autoplay; fullscreen; picture-in-picture; clipboard-write; camera; microphone; display-capture',referrerPolicy:'no-referrer-when-downgrade',sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',onLoad:function(){setDriveEmbedStatus('ready');},onError:function(){setDriveEmbedStatus('error');}})),
      e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center',padding:'.5rem',borderTop:'1px solid #e8eaed',background:'#fafbfc',alignItems:'center'}},
        e('button',{className:'btn btn-outline btn-sm',onClick:function(){setDriveEmbedStatus('loading');_fullVizRetry();setSystemView(true);}},e('i',{className:'fas fa-redo'}),' Презареди'),
        openLink&&e('button',{className:'btn btn-success btn-sm',onClick:function(){window.open(openLink,'_blank','noopener,noreferrer');}},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Drive'),
        doc&&(doc.downloadUrl||doc.webContentLink)?e('a',{href:doc.downloadUrl||doc.webContentLink,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm',style:{marginTop:'.3rem'}},e('i',{className:'fas fa-download'}),' Изтегли документ'):null,
        e('button',{className:'doc-zoom-btn',onClick:zoomOut,disabled:zoom<=ZOOM_MIN+0.001,title:'Намали (−)'},e('i',{className:'fas fa-search-minus'})),
        e('button',{className:'doc-zoom-btn doc-zoom-pct',onClick:zoomReset,title:'Възстанови мащаба'},zoomPct+'%'),
        e('button',{className:'doc-zoom-btn',onClick:zoomIn,disabled:zoom>=ZOOM_MAX-0.001,title:'Увеличи (+)'},e('i',{className:'fas fa-search-plus'})),
        e('button',{className:'doc-zoom-btn'+(viewFit==='width'?' active':''),onClick:handleFitWidth,title:'По ширина'},e('i',{className:'fas fa-arrows-alt-h'})),
        e('button',{className:'doc-zoom-btn'+(viewFit==='page'?' active':''),onClick:handleFitPage,title:'По страница'},e('i',{className:'fas fa-file'})),
        e('button',{className:'doc-zoom-btn'+(viewFit==='free'?' active':''),onClick:handleFitFree,title:'Свободен мащаб'},e('i',{className:'fas fa-expand-arrows-alt'})),
        e('button',{className:'doc-zoom-btn',onClick:handleScrollUp,title:'Нагоре'},e('i',{className:'fas fa-arrow-up'})),
        e('button',{className:'doc-zoom-btn',onClick:handleScrollTop,title:'От начало'},e('i',{className:'fas fa-angle-double-up'})),
        e('button',{className:'doc-zoom-btn',onClick:handleScrollDown,title:'Надолу'},e('i',{className:'fas fa-arrow-down'})),
        extraFooter!==false&&e('button',{className:'doc-zoom-btn',onClick:function(){setDriveEmbedStatus('loading');setSystemView(true);_fullVizRetry();}},e('i',{className:'fas fa-database'}),' Система'),
        e('button',{className:'doc-zoom-btn'+(autosaveEnabled?' active':''),onClick:function(){setAutosaveEnabled(!autosaveEnabled);},title:autosaveEnabled?'Автоматично записване ВКЛ':'Автоматично записване ИЗКЛ','aria-label':'Автозапис'},syncingToErp?e('i',{className:'fas fa-sync spin'}):e('i',{className:autosaveEnabled?'fas fa-cloud-upload-alt':'fas fa-ban'}),lastSyncedAt?e('span',{style:{fontSize:'.55rem'}},Math.round((Date.now()-lastSyncedAt)/1000)+'с'):null))
    );
  }
  // No URL available — show minimal inline state, no blocking overlay
  return e('div',{style:{position:'absolute',inset:0,zIndex:3,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'var(--surface)',gap:'.6rem',padding:'1rem',textAlign:'center'}},e('i',{className:'fas fa-file-alt',style:{fontSize:'2rem',color:'var(--ink-3)'}}),e('span',{style:{fontSize:'.82rem',color:'var(--ink-2)',maxWidth:340}},'Няма наличен преглед за този документ.'),doc&&(doc.downloadUrl||doc.webContentLink)?e('a',{href:doc.downloadUrl||doc.webContentLink,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm',style:{marginTop:'.3rem'}},e('i',{className:'fas fa-download'}),' Изтегли документ'):null);
};
const _dbVizTriedRef=useRef(false);
// v12.32.37-ux: reset ALL viz state when the modal switches documents —
// without this, opening doc B after doc A kept A's render/dead-end state.
useEffect(function(){
  _dbVizTriedRef.current=false;
  _fullVizDoneRef.current='';
  setDbViz(null);setDbVizLoading(false);setFullVizBusy(false);setFullVizFailed(false);
  setShowInlineEdit(false);setStreamBroken(false);setSystemView(false);setDriveEmbedStatus('loading');
  if(fullVizRef.current)fullVizRef.current.innerHTML='';
},[doc&&(doc.id||doc.driveId||doc.name)]);
// v12.47.0-drivegone: preflight the Drive file via drivefilemeta so a deleted
// file shows our own styled "removed" panel instead of framing Google's
// cross-origin error page. SCOPE-SAFE: only references _dpDriveFid / doc /
// setters (all defined here). The earlier version wrongly used isGoogleDoc /
// isGoogleSheet / hasEmbed which only exist in InlineDocEditorModal → crash.
// v12.49.78-watchdog: GAS can be momentarily unreachable (deploy, quota, 30s
// timeout). Cap the preflight so driveGoneChecking never wedges the UI and a
// stalled call can't leave the modal in a half-checked state. A definitive
// exists:false still flips driveGone; anything else is treated as "unknown"
// (driveGone stays false → the live Google/Drive embed is attempted as the
// last resort, exactly as before the watchdog).
useEffect(function(){
  var fid=_dpDriveFid||(doc&&doc.driveId)||'';
  if(!fid||!/^[A-Za-z0-9_-]{25,}$/.test(fid)){setDriveGone(false);setDriveGoneChecking(false);return;}
  setDriveGoneChecking(true);
  var _to=setTimeout(function(){setDriveGoneChecking(false);},12000);
  api('drivefilemeta',{driveId:fid}).then(function(res){
    if(res&&res.success&&res.exists===false){setDriveGone(true);setDpAriaStatus('Документът е премахнат или недостъпен');}else{setDriveGone(false);}
  }).catch(function(){
      // GAS returned HTML or network error — treat as transient, don't flip driveGone
      // but set a flag so we don't trust Google iframe
      setDriveGone(false);
      _dpDriveMetaFailed = true;
    }).finally(function(){clearTimeout(_to);setDriveGoneChecking(false);});
    return function(){clearTimeout(_to);};
  },[_dpDriveFid,doc&&doc.driveId,doc&&doc.id]);
// v12.32.38-stream: DB-FIRST preflight. Google's "Sorry, the file you have
// requested does not exist" page is a SUCCESSFUL iframe load (load event
// fires, error never does) — iframeError never trips and the user dead-ends
// on Google's 404. So we HEAD our own stream endpoint up front: when the ERP
// DB can serve the bytes, we render same-origin (native PDF viewer / <img> /
// full-visual office render) and never even ask Google.
useEffect(function(){
  var alive=true;
  if(!_sdUrl)return;
  /* v12.36.3-docmime: ALWAYS check the stream endpoint preflight, even for
     Google-native docs. Google previews can return 410/404 (deleted doc, lost
     access), but the ERP often has cached PDF bytes in MySQL. The preflight
     discovers cached bytes so they render natively instead of a broken iframe.
     Google embed is still preferred when both are available (the _dpIframeSrc
     for Google-native docs stays as _dpDirectEmbed; dbViz is only a fallback.
     Gate removed: was `if(isGoogleDocType&&!_useFullVizFromContent)return;` */
  fetch(_sdUrl,{method:'HEAD'}).then(function(res){
    if(!alive)return;
    var m=String(res.headers.get('Content-Type')||'').toLowerCase();
    // v12.32.44-streamfix: endpoint answered with 404/JSON (e.g. "No streamable
    // content for this document"). Never leave the iframe showing raw JSON —
    // mark the stream broken, pull the ERP content copy via the DB fallback and
    // let the Google-styled view/edit editor take over inside this modal.
    if(!res.ok||m.indexOf('application/json')===0){
      // v12.32.44-googleembed: with a real Drive id the stream page embeds the
      // Google preview INLINE — leave the iframe to show that visual window.
      // v12.49.66-previewfix: but if the stream itself FAILED (401 no/!valid
      // token, or no cached bytes), do NOT dead-end on a raw error page — fall
      // back to the reliable Google embed instead.
      if(_dpDriveFid){ setForceDrive(true); return; }
      setStreamBroken(true);
      setIframeError(true);
      _dbVizFetch(); // sets _dbVizTriedRef internally — do NOT set it here
      return;
    }
    if(m.indexOf('application/pdf')===0){
      _dbVizTriedRef.current=true;
      setDbViz({kind:'pdf',url:_sdUrl,mime:m});
    }else if(/^image\//.test(m)){
      _dbVizTriedRef.current=true;
      setDbViz({kind:'img',url:_sdUrl,mime:m});
    }else if(/wordprocessingml|msword|spreadsheetml|ms-excel/.test(m)){
      _dbVizFetch(); // office bytes → b64 fetch feeds mammoth/SheetJS full-visual
    }else if(m.indexOf('text/html')===0){
      // v12.32.X: stream-doc.php serves a Google Docs EMBED page (iframe of
      // docs.google.com/d/<id>/preview) for Drive-only docs with no cached
      // bytes. Render it directly in the modal iframe so the user sees the
      // full Google-styled document (seals, photos, formatting) — not a
      // dead-end empty state. This is the replacement for the broken view.
      _dbVizTriedRef.current=true;
      setDbViz({kind:'htmlframe',url:_sdUrl,mime:'text/html'});
    }
  }).catch(function(){/* endpoint unreachable → treat as stream failure (skip when a Drive preview is embedded) */if(!_dpDriveFid){setStreamBroken(true);setIframeError(true);_dbVizFetch();}});
  return function(){alive=false;};
},[_sdUrl,isGoogleDocType,_useFullVizFromContent,doc&&(doc.id||doc.driveId||doc.name)]);
// v12.49.19-iframewatch: cross-origin Google preview iframes sometimes never
// fire onLoad (CSP / sandboxed), leaving the "Зареждане..." spinner spinning
// forever even though the document rendered fine inside. After 4s of loading
// with no error, assume success and dismiss the spinner so content shows.
// v12.54.40-cspfix: also flip driveEmbedStatus to 'error' so the fallback
// panel (Open in Google Drive / Visualize in system) appears when Google
// blocks iframe framing via X-Frame-Options/CSP ("docs.google.com refused
// to connect"). Without this, the spinner spins forever and the user never
// sees the fallback buttons.
useEffect(function(){
  if(!iframeLoading)return;
  var t=setTimeout(function(){setIframeLoading(false);setDriveEmbedStatus('error');},4000);
  return function(){clearTimeout(t);};
},[iframeLoading,doc&&(doc.id||doc.driveId||doc.name)]);
// v12.32.44-streamfix: when the stream endpoint failed, open the Google-styled
// view/edit editor (InlineDocEditorModal, inline mode) inside THIS modal so the
// user can SEE and EDIT the document instead of staring at a raw JSON error.
useEffect(function(){
  if(!streamBroken||showInlineEdit)return;
  // Only auto-open when the DB fallback also has nothing renderable.
  if(dbViz&&dbViz.kind&&dbViz.kind!=='none')return;
  // v12.32.44-googleembed: docs with a real Drive id get the Google preview
  // embedded inline in the stream page — the editor overlay is for ERP-owned
  // docs only (no Drive preview to show).
  if(_dpDriveFid)return;
  var _eid=doc&&(doc.id||doc.driveId||doc.fileId);
  if(_eid&&!isTemplate)setShowInlineEdit(true);
},[streamBroken,showInlineEdit,dbViz,doc,isTemplate,_dpDriveFid]);
// v12.32.44-streamfix: the stream error page posts uev:stream-fail — react by
// swapping in the Google view modal (robust trigger alongside text sniffing).
useEffect(function(){
  var onMsg=function(ev){
    if(!ev||!ev.data||ev.data.type!=='uev:stream-fail')return;
    var _did=ev.data.id||'';
    var _docKey=doc&&(doc.id||doc.driveId||doc.fileId||'');
    if(_did&&_docKey&&String(_did)!==String(_docKey))return; // another doc's iframe
    // v12.32.44-googleembed: the stream page embedded the Google preview inline
    // — keep that visual window in the iframe, do NOT swap to the editor.
    if(ev.data.embedded===true){setIframeError(false);return;}
    setStreamBroken(true);
    setIframeError(true);
    _dbVizFetch();
  };
  window.addEventListener('message',onMsg);
  return function(){window.removeEventListener('message',onMsg);};
},[doc&&(doc.id||doc.driveId||doc.fileId)]);
const _dbVizFetch=useCallback(function(){
    if(_dbVizTriedRef.current||dbVizLoading)return;
    _dbVizTriedRef.current=true;
    var _docKey=doc.id||doc.driveId||'';
    if(!_docKey){setDbViz({kind:'none'});return;}
    setDbVizLoading(true);
    var _sid=(window.STATE&&window.STATE.sessionId)||(window.__SESSION_ID)||'';
    var params={docId:_docKey,formId:formId||'',name:doc.name||'',userId:_sid};
    api('downloadDocument',params).then(function(r){
        if(!r||!r.success){setDbViz({kind:'none'});return;}
        if(r.kind==='blob'&&r.b64){
            var mime=String(r.mimeType||'application/octet-stream').toLowerCase();
            try{
                // v12.32.39-universal: resolve the render kind from mime AND
                // filename (kindFor handles octet-stream via extension) so no
                // renderable file ever falls through to the dead-end card.
                var _kf=(window.UEVDocViewer&&window.UEVDocViewer.kindFor)?window.UEVDocViewer.kindFor(mime,r.name||doc.name||''):'';
                if(_kf==='pdf'||_kf==='docx'||_kf==='xlsx'||_kf==='img'||mime==='application/pdf'||/wordprocessingml|word/.test(mime)||/spreadsheetml|excel/.test(mime)||/^image\//.test(mime)){
                    setDbViz({kind:'full',mime:mime,b64:r.b64,name:r.name||doc.name,source:r.source});
                    return;
                }
                // Text-ish payloads render directly (HTML via UevDocRender).
                if(_kf==='html'||_kf==='text'||/^text\/|json|xml|html/.test(mime)){
                    var txt;
                    try{txt=decodeURIComponent(escape(atob(r.b64)));}catch(_d){txt=atob(r.b64);}
                    setDbViz({kind:(/html/.test(mime)||uevIsHtml(txt))?'html':'text',text:txt,mime:mime});
                    return;
                }
                // v12.36.3-googleviz: Google-native documents (Docs/Sheets/Slides/
                // Drawings) must render via the inline Google Drive preview, not as
                // raw text. Their MIME (application/vnd.google-apps.*) doesn't match
                // any text/html condition, causing the stored content to display as a
                // garbled blob of characters ("large set of string letters").
                // Redirect to the canonical Drive embed which Google allows framing.
                if(/google-apps\.(document|spreadsheet|presentation|drawing)/.test(mime)){
                    var _gUrl = (_dpDriveInlineEmbed || _dpProxiedPreviewUrl || _dpDirectEmbed);
                    if(_gUrl){
                        setDbViz({kind:'htmlframe',url:_gUrl,mime:'text/html'});
                    } else {
                        // No Drive embed available — render via UEVDocViewer (full-viz)
                        setDbViz({kind:'full',mime:mime,b64:r.b64,name:r.name||doc.name,source:r.source});
                    }
                    return;
                }
                var bin=atob(r.b64),len=bin.length,bytes=new Uint8Array(len);
                for(var i=0;i<len;i++)bytes[i]=bin.charCodeAt(i);
                var url=URL.createObjectURL(new Blob([bytes],{type:mime}));
                if(mime==='application/pdf'){setDbViz({kind:'pdf',url:url,mime:mime});return;}
                if(/^image\//.test(mime)){setDbViz({kind:'img',url:url,mime:mime});return;}
                setDbViz({kind:'none',url:url,mime:mime,name:r.name||doc.name});
            }catch(_e){setDbViz({kind:'none'});}
            return;
        }
        if(r.kind==='url'&&r.url){setDbViz({kind:'exturl',url:r.url});return;}
        setDbViz({kind:'none'});
    }).catch(function(){setDbViz({kind:'none'});}).finally(function(){setDbVizLoading(false);});
},[doc,formId,dbVizLoading]);
// Auto-trigger the DB fallback the moment the Google embed fails, and also
// when there is nothing embeddable at all (no iframe URL, no inline content).
useEffect(function(){
    if(iframeError||(!canEmbed&&!hasContent))_dbVizFetch();
},[iframeError,canEmbed,hasContent,_dbVizFetch]);
useEffect(function(){return function(){if(dbViz&&dbViz.url){try{URL.revokeObjectURL(dbViz.url);}catch(_){}}};},[dbViz]);
// v12.32.35-fullviz: when doc.content itself carries raw bytes (library templates /
// copied docs), render full-visual directly (same path as the DB fallback).
useEffect(function(){
  if(_useFullVizFromContent){
    setDbViz({kind:'full',mime:_contentMime,b64:(doc.content||_docContent),name:doc.name});
  }
},[_useFullVizFromContent,doc,doc.content,_contentMime]);
const iframeRef=useRef(null);
/* If the embed fails (iframe 404 / unreachable), auto-switch to text/empty
   after 12 s so the user isn't stuck staring at Google's 404 page. */
useEffect(function(){
    if(viewMode!=='iframe'||!iframeRef.current)return;
    setIframeLoading(true);setIframeError(false);
    // v12.27.1-perf: Reduced from 12s — if Google Drive blocks embedding via
    // X-Frame-Options, the iframe never fires load/error; 6s is enough to show
    // a fallback message instead of staring at a spinner.
    // v3.39.5-proxy: Use longer timeout (12s) for proxied Google Docs (first fetch may be slow)
    // v12.32.47-viewmodal: also use 12s when the src is a DIRECT Google /preview
    // embed (first cold load of the Google editor/preview can be slow).
    // v12.49.25-editfix: Google Docs /edit URLs are blocked by X-Frame-Options
    // inside the sandboxed iframe — the iframe NEVER fires load/error, so the
    // only thing that dismisses "Зареждане на редактора…" is this timeout.
    // The CSP block is instantaneous; 3s is enough to reach the error fallback
    // (which shows "Отвори за редакция" → opens native editor in a new tab).
    var _dpTimeout = activeIframeUrl && /^https:\/\/(docs|drive|accounts)\.google\.com/i.test(activeIframeUrl) ? 3000 : 6000;
    var timeout=setTimeout(function(){setIframeLoading(false);setIframeError(true);},_dpTimeout);
    // v12.32.44-streamfix: stream-doc.php is SAME-ORIGIN, so on load we can
    // inspect the rendered body. If it's a stream error page (raw JSON
    // {"success":false,...} or the styled "Документът е недостъпен" HTML),
    // never leave it visible — flip to the DB fallback + Google-styled editor.
    var onLoad=function(){
      setIframeLoading(false);
      clearTimeout(timeout);
      try{
        if(iframeRef.current&&iframeRef.current.contentDocument){
          var _txt=(iframeRef.current.contentDocument.body&&iframeRef.current.contentDocument.body.textContent)||'';
          var _src=String(iframeRef.current.getAttribute('src')||'');
          if(/stream-doc\.php/.test(_src)&&/(недостъпен|stream-fail-marker-uev|stream-embed-marker-uev|"success":false|"error")/.test(_txt)){
            // v12.32.44-googleembed: the stream page embedded the Google preview
            // inline (visual window) — keep it; only fail over when NOT embedded.
            if(/stream-embed-marker-uev/.test(_txt)){setIframeError(false);return;}
            setIframeError(true);
            setStreamBroken(true);
            _dbVizFetch();
            return;
          }
        }
      }catch(_){}
      setIframeError(false);
    };
    var onErr=function(){setIframeLoading(false);setIframeError(true);clearTimeout(timeout);};
    var el=iframeRef.current;
    el.addEventListener('load',onLoad);
    el.addEventListener('error',onErr);
    return function(){el.removeEventListener('load',onLoad);el.removeEventListener('error',onErr);clearTimeout(timeout);};
},[viewMode,iframeUrl]);
// v12.54.54-uev: Autosave timer — syncs Google Docs content back to ERP every 30s (legacy yai.free.bg approach)
useEffect(function(){
  if(!autosaveEnabled||viewMode!=='iframe'||!iframeRef.current)return;
  autosaveTimerRef.current=setInterval(function(){
    try{
      if(iframeRef.current&&iframeRef.current.contentDocument){
        var body=iframeRef.current.contentDocument.body;
        if(body){
          var content=body.innerText||body.textContent||'';
          setSyncingToErp(true);
          fetch('database/api.php',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              action:'syncdocumentfromdrive',
              docId:doc.id||'',
              content:content,
              timestamp:Date.now()
            })
          }).then(function(r){return r.json()}).then(function(d){
            if(d.success){setLastSyncedAt(Date.now());}
            setSyncingToErp(false);
          }).catch(function(){setSyncingToErp(false);});
        }
      }
    }catch(_){setSyncingToErp(false);}
  },30000);
  return function(){if(autosaveTimerRef.current){clearInterval(autosaveTimerRef.current);}};
},[autosaveEnabled,viewMode,doc.id]);
const handleDelete=useCallback(()=>{
    if(deletingP||typeof onDelete!=='function')return;
    const name=doc.name||'документа';
    if(typeof window!=='undefined'&&window.confirm&&!window.confirm('Сигурни ли сте, че искате да изтриете "'+name+'"?\n\nТова действие ще премахне файла от заявката.'))return;
    setDeletingP(true);
    try{
        const res=onDelete(doc);
        if(res&&typeof res.then==='function'){
            res.then(()=>{setDeletingP(false);dpClose();}).catch(err=>{setDeletingP(false);toast((err&&err.message)||'Грешка при изтриване','error');});
        }else{
            setDeletingP(false);dpClose();
        }
    }catch(err){setDeletingP(false);toast((err&&err.message)||'Грешка при изтриване','error');}
},[doc,onDelete,dpClose,deletingP]);
/* Custom zoom — Google Drive's mobile embed strips its native +/- toolbar
   that desktop users get, so we provide CSS transform-based zoom that works
   for both the iframe preview and the inline text preview. */
const[zoom,setZoom]=useState(1);
const ZOOM_MIN=0.5,ZOOM_MAX=2.5,ZOOM_STEP=0.25;
const zoomIn =useCallback(()=>setZoom(z=>Math.min(ZOOM_MAX,+(z+ZOOM_STEP).toFixed(2))),[]);
const zoomOut=useCallback(()=>setZoom(z=>Math.max(ZOOM_MIN,+(z-ZOOM_STEP).toFixed(2))),[]);
const zoomReset=useCallback(()=>setZoom(1),[]);
const zoomPct=Math.round(zoom*100);
// v12.49.13-viewfit: fit-to-width / fit-to-page / free zoom modes.
const[viewFit,setViewFit]=useState('free');
const FIT_WIDTH='width';
const FIT_PAGE='page';
const handleFitWidth=useCallback(function(){
  setViewFit(FIT_WIDTH);
  setZoom(1);
},[]);
const handleFitPage=useCallback(function(){
  setViewFit(FIT_PAGE);
  setZoom(1);
},[]);
const handleFitFree=useCallback(function(){
  setViewFit('free');
  setZoom(1);
},[]);
// v12.51.23-T13: toggle the browser Fullscreen API on the modal box so the
// document preview can escape the OS window (Ctrl+F / toolbar button). Falls
// back silently if the API is unavailable (older browsers / iframe restrictions).
const modalBoxRef=useRef(null);
const toggleFullscreen=useCallback(function(){
  try{
    var el=modalBoxRef.current;
    if(!el)return;
    if(!document.fullscreenElement){ if(el.requestFullscreen){el.requestFullscreen();} }
    else{ if(document.exitFullscreen){document.exitFullscreen();} }
  }catch(_){/* fullscreen unsupported — no-op */}
},[]);
// v12.49.13-scroll: scroll controls for preview container.
// Target the actual scrollable zoom wrapper, not the modal body, so they
// work regardless of layout/zoom state.
const handleScrollTop=useCallback(function(){
  var el=document.querySelector('.doc-viewer-overlay .doc-zoom-wrap');
  if(el) el.scrollTop=0;
},[]);
const handleScrollDown=useCallback(function(){
  var el=document.querySelector('.doc-viewer-overlay .doc-zoom-wrap');
  if(el) el.scrollTop=(el.scrollTop||0)+400;
},[]);
const handleScrollUp=useCallback(function(){
  var el=document.querySelector('.doc-viewer-overlay .doc-zoom-wrap');
  if(el) el.scrollTop=Math.max(0,(el.scrollTop||0)-400);
},[]);
// v12.49.13-editmode: Google-native edit/suggest/open controller.
const _canSuggest=!!(_dpGnBase && (_dpIsOwner || isAdmin));
const _canEdit=_dpIsOwner && !!_dpEffectiveEditUrl;
// v12.54.15-cleanup: handleEditDoc removed (dead code — handleToggleEdit is used instead)
const handleSuggestDoc=useCallback(function(){
  if(!_dpGnBase) return;
  window.open(_dpGnBase + '/edit?usp=drivesdk&mode=suggesting','_blank','noopener,noreferrer');
},[_dpGnBase]);
const handleOpenInGoogle=useCallback(function(){
  var url=openLink||_dpDirectEmbed||(_dpGnBase?_dpGnBase+'/edit':'')||'';
  if(url) window.open(url,'_blank','noopener,noreferrer');
},[openLink,_dpDirectEmbed,_dpGnBase]);
// v12.32.15-docrender: for HTML docs, toggle between the rich Google-Docs-styled
// visual render (images/seals visible) and the raw source text.
// v12.54.15-cleanup: showRawText removed (dead state — raw text view never implemented)
const[toolbarDock,setToolbarDock]=useState('bottom');
const toggleToolbarDock=useCallback(function(){ setToolbarDock(function(prev){ return prev==='bottom'?'header':'bottom'; }); },[]);
// v12.49.91-t13: document preview keyboard shortcuts when modal is open.
// v12.50.0-t13arrow: Arrow Left/Right navigate between docs when docList is provided.
useEffect(function(){
  var onKey=function(ev){
    var inModal=!!document.querySelector('.doc-viewer-overlay .modal-box');
    if(!inModal) return;
    if((ev.ctrlKey||ev.metaKey)&&!ev.shiftKey&&!ev.altKey){
      if(ev.key==='='||ev.key==='+'){ ev.preventDefault(); zoomIn(); }
      else if(ev.key==='-'){ ev.preventDefault(); zoomOut(); }
      else if(ev.key==='0'){ ev.preventDefault(); zoomReset(); }
      else if(ev.key==='p'||ev.key==='P'){ ev.preventDefault(); try{document.body.classList.add('printing');setTimeout(function(){window.print();document.body.classList.remove('printing')},100)}catch(_){} }
      else if(ev.key==='f'||ev.key==='F'){ ev.preventDefault(); toggleFullscreen(); }
    }
    // T13: Arrow key document navigation (no modifier, docList present)
    if(!ev.ctrlKey&&!ev.metaKey&&!ev.altKey&&!ev.shiftKey){
      if(ev.key==='ArrowRight'&&_docNavHasNext){ ev.preventDefault(); _goToDoc(1); }
      else if(ev.key==='ArrowLeft'&&_docNavHasPrev){ ev.preventDefault(); _goToDoc(-1); }
    }
    if(ev.key==='Escape'){
      var stack=(window._modalStack&&Array.isArray(window._modalStack))?window._modalStack:[];
      if(stack[stack.length-1]==='doc-preview-modal'){
        ev.preventDefault();
        dpClose();
      }
    }
  };
  window.addEventListener('keydown',onKey);
  return function(){ window.removeEventListener('keydown',onKey); };
},[zoomIn,zoomOut,zoomReset,dpClose,toggleFullscreen,_goToDoc,_docNavHasPrev,_docNavHasNext]);

// v12.50.0-T14/T125: swipe nav + pinch-zoom for mobile document preview.
// Swipe (1 finger, horizontal) moves between docs in a docList; pinch (2 fingers)
// adjusts the existing `zoom` state. Scope-safe: only references _goToDoc +
// _docNav* + setZoom (all defined here).
useEffect(function(){
  var _sx=0,_sy=0,_st=0,_active=false;
  var _pinch0=0,_pinching=false;
  var _dist=function(ev){ var a=ev.touches[0],b=ev.touches[1]; return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); };
  var onStart=function(ev){
    if(ev.touches&&ev.touches.length>=2){ _pinching=true; _pinch0=_dist(ev); return; }
    var t=ev.touches&&ev.touches[0]; if(!t)return; _sx=t.clientX; _sy=t.clientY; _st=ev.timeStamp||Date.now(); _active=true;
  };
  var onMove=function(ev){
    if(_pinching&&ev.touches&&ev.touches.length>=2&&typeof setZoom==='function'){
      ev.preventDefault();
      var d=_dist(ev); if(_pinch0>0){ var f=d/_pinch0; setZoom(function(z){ return Math.max(0.5,Math.min(2.5,z*f)); }); _pinch0=d; }
    }
  };
  var onEnd=function(ev){
    if(_pinching){ _pinching=false; _pinch0=0; return; }
    if(!_active) return; _active=false;
    var t=ev.changedTouches&&ev.changedTouches[0]; if(!t) return;
    var dx=t.clientX-_sx, dy=t.clientY-_sy, dt=(ev.timeStamp||Date.now())-_st;
    if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.4 && dt<800){
      if(dx<0 && _docNavHasNext){ _goToDoc(1); }
      else if(dx>0 && _docNavHasPrev){ _goToDoc(-1); }
    }
  };
  var body=document.querySelector('.doc-viewer-overlay .modal-body');
  if(body&&body.addEventListener){
    body.addEventListener('touchstart',onStart,{passive:true});
    body.addEventListener('touchmove',onMove,{passive:false});
    body.addEventListener('touchend',onEnd,{passive:true});
  }
  return function(){ if(body&&body.removeEventListener){ body.removeEventListener('touchstart',onStart); body.removeEventListener('touchmove',onMove); body.removeEventListener('touchend',onEnd); } };
},[_goToDoc,_docNavList,_docNavHasPrev,_docNavHasNext,setZoom]);


const handleCopyAttach=useCallback(()=>{
    if(!onCopyAttach||!formId)return;
    // v12.31.1-fix: recover the canonical Drive ID from ANY field (driveId /
    // edit-link / preview-link / id) instead of only driveId||id — library docs
    // carry a synthetic id but a real Drive ID inside their links.
    const docId=(typeof _driveIdFromDoc==='function'?_driveIdFromDoc(doc):null)||((function(){var _id=doc.driveId||doc.id||'';return _id&&!/^(s_|doc_|up_|f_|copied_)/.test(_id)?_id:null;})());
    if(!docId){toast('Този документ няма Drive версия за копиране','error');return}
    setCopying(true);
    onCopyAttach(docId,formId,doc).finally(()=>setCopying(false));
},[doc,onCopyAttach,formId]);

// ── Toggle between preview and edit mode (inline editor) ──
// v12.51.15-gnative-edit: the OLD toggle only ever LEFT edit mode — it never
// called setEditMode(true) when turning edit ON, so the Google /edit embed was
// unreachable from the preview modal. Now: entering edit forces the iframe view
// and flips editMode(true) (so renderDriveEmbed shows the owner's native /edit
// surface); leaving edit flips it false (read-only /preview).
const handleToggleEdit=useCallback(function(){
  if(!editMode){
    if(_dpEffectiveEditUrl){
      setViewMode('iframe');
      setSystemView(false); // ensure the Google edit surface (not System view) renders
      setEditMode(true);
      setIframeLoading(true);
      setIframeError(false);
    }
  }else{
    setEditMode(false);
    setIframeLoading(true);
    setIframeError(false);
  }
},[editMode,_dpEffectiveEditUrl,viewMode]);
// ── Robust edit entry: if Google blocks the inline /edit embed via
//    X-Frame-Options, open the real editor in a new tab (still works, autosaves
//    to Drive). v12.30.2-editembed.
const handleEditInTab=useCallback(function(){
  // v12.38.0-sec: never leak window.opener to Google (tab-nabbing) — open with
  // noopener,noreferrer so the new Drive tab cannot manipulate the opener.
  if(directEditUrl){window.open(directEditUrl,'_blank','noopener,noreferrer');}
},[directEditUrl]);
// v12.37.5-yai: dedicated DOWNLOAD handler — separate from visualize.
// Clicking a document opens the native viewer (forceDrive); downloading
// is ONLY ever triggered by this standalone button, never on open. yai's
// model: click = preview, download = explicit action button.
const handleDownload=useCallback(function(){
  var _fid=doc.driveId||doc.fileId||doc.id||'';
  if(_fid&&!/^(s_|doc_|up_|f_|copied_)/.test(_fid)&&typeof window._proxyDownload==='function'){
    window._proxyDownload(_fid,doc.name||'document','');return;
  }
  if(doc.downloadUrl){window.open(doc.downloadUrl,'_blank','noopener,noreferrer');return;}
  if(hasContent){var _b=new Blob([(doc.content||_docContent)],{type:'text/plain;charset=utf-8'});var _u=URL.createObjectURL(_b);var _a=document.createElement('a');_a.href=_u;_a.download=doc.name||'document';_a.rel='noopener';document.body.appendChild(_a);_a.click();_a.remove();}
  if(typeof toast==='function')toast('Файлът не е достъпен за изтегляне','warn');
},[doc,hasContent]);
// ── T15: Download All (bulk zip when docList has >1 doc) ──
// v12.50.0-downloadall: fires the existing export-zip pipeline with every doc
// id in docList so the applicant gets a single ZIP with all attached files.
const handleDownloadAll=useCallback(function(){
  if(!Array.isArray(docList)||docList.length<=1){
    if(typeof toast==='function')toast('Няма повече документи за изтегляне','info',2500);
    return;
  }
  var _ids=docList.map(function(d){return d.id||d.driveId||d.fileId||'';}).filter(Boolean);
  if(_ids.length<=1){
    if(typeof toast==='function')toast('Само един документ е достъпен — използвайте „Изтегли\"','info',2500);
    return;
  }
  if(typeof toast==='function')toast('Подготовка на ZIP с '+_ids.length+' документа…','info',3000);
  if(typeof api==='function'){
    api('startexportzip',{docIds:_ids,formId:(formId||'')}).then(function(res){
      if(res&&res.success&&res.downloadToken){
        if(typeof toast==='function')toast('Архивът е готов','success',2500);
        window.open('database/export-download.php?token='+encodeURIComponent(res.downloadToken),'_self');
      }else{
        if(typeof toast==='function')toast((res&&res.error)||'Неуспешна подготовка на архива','error');
      }
    }).catch(function(err){if(typeof toast==='function')toast('Грешка: '+(err&&err.message||'неуспешно'),'error');});
  }else{
    if(typeof toast==='function')toast('Функцията за изтегляне не е достъпна','error');
  }
},[docList,formId]);
// ── Native viewer (Google Docs Viewer) for large files ──
// (moved earlier to avoid TDZ — this is now just the derived UI flags)
const _showNativeBtn = !!(_nativeViewUrl || doc.downloadUrl);
const _isLarge = window.UEVDocViewer && window.UEVDocViewer.isLargeFile ? window.UEVDocViewer.isLargeFile(doc.size) : false;
const handleNativeView = useCallback(function(){
  if(_nativeViewUrl){ window.open(_nativeViewUrl,'_blank','noopener,noreferrer'); }
  else if(doc.downloadUrl){ window.open(doc.downloadUrl,'_blank','noopener,noreferrer'); }
  else if(typeof toast==='function') toast('Няма достъпен адрес за преглед','warn');
},[_nativeViewUrl]);
// Expose handleEditInTab on the toggle button when framing is known-blocked.
const _editBlocked = editMode && iframeError;

// The effective iframe URL — switches between preview and edit URLs, and
// between the System (same-origin stream) and Google Drive sources.
// v12.49.66-previewfix: HONOUR the Система/Google segmented control. Previously
// the iframe always framed Google's /preview (via _dpDirectEmbed in the src
// fallback chain), so the "Система" button was dead and stale/deleted Drive
// ids 404'd on Google. Now: default (Система, systemView=false) => the
// self-healing same-origin stream; only when the user opts into Google
// (systemView=true) do we frame the Google /preview embed.
// NOTE: forceDrive was removed in 12.51.12-gnative; systemView is its successor.
const activeIframeUrl = editMode && _dpEffectiveEditUrl
  ? _dpEffectiveEditUrl
  : (systemView && _dpDirectEmbed ? _dpDirectEmbed
     : (function(){
         var _su = streamDocUrl(doc) || _sdUrl;
         // v12.49.66-previewfix: a System URL WITHOUT a session token is
         // guaranteed to 401 on stream-doc.php. If a Google embed exists,
         // prefer it so the preview always renders something useful.
         var _suHasToken = /[?&]token=/.test(_su||'');
         if(_su && (_suHasToken || !_dpDriveFid)) return _su;
         return _dpDirectEmbed || _su || '';
       })());

return e(Fragment, null, _portal(e('div',{className:'modal-overlay doc-viewer-overlay'+(dpClosing?' closing':''),...dpOverlayHandlers,role:'dialog','aria-modal':'true','aria-label':doc.name||'Преглед на документ'},
    e('div',{ref:modalBoxRef,className:'modal-box fullscreen'+(dpClosing?' closing':''),onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head'},
        e('div',{style:{display:'flex',alignItems:'center',gap:'.75rem',minWidth:0,flex:'1 1 auto',overflow:'hidden'}},
        e('div',{className:'doc-icon-wrap '+vis.cssClass,style:{width:48,height:48,borderRadius:10,fontSize:'1.1rem',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:vis.iconColor+'14',color:vis.iconColor}},e('i',{className:'fas '+vis.icon})),
        e('div',{style:{minWidth:0,flex:'1 1 0%'}},
            e('h3',{style:{fontSize:'1rem',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontWeight:700}},doc.name||'Документ'),
        )
        ),
        e('div',{className:'doc-viewer-actions',style:{display:'flex',gap:'.5rem',flexShrink:0,alignItems:'center'}},
        // v12.51.11-gnative: For Drive-backed docs we now embed Google's native
        // /preview surface, which renders its OWN toolbar (zoom, fit, print,
        // download, open-in-Drive). The custom control groups (view-source toggle,
        // Web/Text mode, zoom/fit, print/fullscreen/edit/download, versions/
        // comments/info) are therefore removed for that path to avoid a redundant,
        // divergent UI. We keep only ERP-specific actions Google cannot perform:
        // real-time collaborative edit (DocStream), attach-to-application, and the
        // template "create copy & attach" action. A small badge labels the native
        // surface so users know they're in Google's viewer.
        canDriveEmbed&&e('span',{className:'doc-src-badge',title:'Вграден преглед в Google Drive',style:{display:'inline-flex',alignItems:'center',gap:'.3rem',fontSize:'.72rem',color:'#1a73e8',background:'#e8f0fe',borderRadius:'999px',padding:'.18rem .55rem',fontWeight:600}},e('i',{className:'fab fa-google-drive'}),' Google'),
                _dpDriveFid&&_dpDriveFid.length>=25&&e('span',{className:'doc-src-badge',title:'Google Drive stream /preview?rm=minimal',style:{display:'inline-flex',alignItems:'center',gap:'.3rem',fontSize:'.72rem',color:'#34a853',background:'#e6f4ea',borderRadius:'999px',padding:'.18rem .55rem',fontWeight:600}},e('i',{className:'fas fa-play-circle'}),' Стрим'),
                // v12.51.11-gnative: toggle between native Google /preview and the ERP
        // same-origin stream. Native is the default; this is the only way back
        // to System when the user has switched.
        canDriveEmbed&&e('button',{type:'button',className:'doc-viewer-seg-btn'+(systemView?' active':''),onClick:function(){setSystemView(function(p){return !p;});},title:systemView?'Нативен преглед в Google Drive':'Визуализирай в системата','aria-label':systemView?'Нативен преглед':'Визуализирай в системата'},e('i',{className:systemView?'fab fa-google-drive':'fas fa-database'}),systemView?' Нативен':' Система'),
        // v12.51.15-gnative-edit: Google-native VIEW/EDIT toggle for the owner.
        // Honors _canEdit (owner + real /edit?usp=drivesdk url). Entering edit
        // flips editMode so renderDriveEmbed frames the native Google editor;
        // leaving edit falls back to the read-only /preview. Non-owners never see it.
        _canEdit&&e('button',{type:'button',className:'doc-viewer-seg-btn'+(editMode?' active':''),onClick:handleToggleEdit,title:editMode?'Превключи към преглед':'Редактирай в Google','aria-label':editMode?'Преглед':'Редактирай'},e('i',{className:editMode?'fas fa-eye':'fas fa-edit'}),editMode?' Преглед':' Редактирай'),
        // v12.51.16-gnative: Google-native direct controls for the fullscreen modal.
        // The inline editor (InlineDocEditorModal) already exposes these; the fullscreen
        // DocumentPreviewModal defined _dpGnBase/_gnOpen/_canSuggest but never rendered them,
        // so owners of a Drive doc had no in-modal way to open/suggest/comment/version/copy/PDF.
        // Gated on _dpGnBase (real Drive id) — non-Drive docs (ERP/stream) skip them.
        _dpGnBase&&e('div',{className:'gnative-group',role:'group','aria-label':'Google контроли'},
          e('button',{type:'button',className:'gnative-btn',onClick:handleOpenInGoogle,title:'Отвори в Google Drive','aria-label':'Отвори в Google Drive'},e('i',{className:'fab fa-google-drive'})),
          _canSuggest&&e('button',{type:'button',className:'gnative-btn',onClick:handleSuggestDoc,title:'Режим „Предлагане“ (проследени промени)','aria-label':'Режим Предлагане'},e('i',{className:'fas fa-pen-nib'})),
          e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.comment);},title:'Коментари в Google','aria-label':'Коментари в Google'},e('i',{className:'fas fa-comment-dots'})),
          e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.history);},title:'История на версиите','aria-label':'История на версиите'},e('i',{className:'fas fa-clock-rotate-left'})),
          e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.copy);},title:'Създай копие в Google Drive','aria-label':'Създай копие'},e('i',{className:'fas fa-copy'})),
          e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.print);},title:'Изтегли като PDF','aria-label':'Изтегли като PDF'},e('i',{className:'fas fa-file-pdf'}))
        ),
        // ERP-only collaborative real-time editor (DocStream) — not a Google surface.
        e('button',{type:'button',className:'doc-viewer-seg-btn'+(docStreamOpen?' active':''),onClick:function(){setDocStreamOpen(function(p){return !p;});},title:'Съвместно редактиране в реално време','aria-label':'Съвместно редактиране'},e('i',{className:'fas fa-users'}),' Съвместно'),
        // Template "create copy & attach" — ERP action only.
        isTemplate&&onCopyAttach&&formId&&e('button',{className:'btn btn-success',onClick:handleCopyAttach,disabled:copying},copying?e(Fragment,null,e('i',{className:'fas fa-spinner spin'}),' Копиране…'):e(Fragment,null,e('i',{className:'fas fa-copy'}),' Създай копие и прикачи')),
        // v12.51.23-T13: fullscreen toggle (browser Fullscreen API) — mirrors Ctrl+F.
        e('button',{type:'button',className:'doc-viewer-seg-btn',onClick:toggleFullscreen,title:'Пълен екран (Ctrl+F)','aria-label':'Пълен екран'},e('i',{className:'fas fa-expand'}),' Пълен екран'),
        // ── Close (single, right-aligned) ──
        e('button',{className:'close-btn',onClick:dpClose,'aria-label':'Затвори',title:'Затвори (Esc)'},e('i',{className:'fas fa-times','aria-hidden':'true'}))
        )
    ),
    // T10: aria-live region — screen readers announce doc load/error state changes
    e('div',{className:'sr-only',role:'status','aria-live':'polite','aria-atomic':'true'},_dpAriaStatus||''),
    e('div',{className:'modal-body',style:{display:'flex',flexDirection:'column'}},
      // v12.48.3: large-file warning — mammoth chokes on big .docx; offer native view up-front
      _isLarge&&e('div',{className:'doc-native-warn',style:{display:'flex',alignItems:'center',gap:'.6rem',padding:'.6rem .85rem',background:'var(--warn-bg,#fff8e1)',border:'1px solid var(--warn-border,#f0d878)',borderRadius:'var(--r-sm)',marginBottom:'.75rem',fontSize:'.78rem',color:'var(--ink-2)'}},
        e('i',{className:'fas fa-exclamation-triangle',style:{color:'var(--warn,#d97706)',flexShrink:0}}),
        e('div',{style:{flex:1,lineHeight:1.45}},'Този документ е голям и може да се визуализира бавно или не напълно в системния преглед.'),
        _showNativeBtn&&e('button',{type:'button',className:'btn btn-sm btn-warning',onClick:handleNativeView,style:{flexShrink:0,whiteSpace:'nowrap'},'aria-label':'Нативен преглед на документа',title:'Нативен преглед'},e('i',{className:'fab fa-google'}),' Нативен преглед')
      ),
      e(DocumentPreviewErrorBoundary,null,
        // v12.39.13-seedlings: clean 3-way render matching seedlings/yai.
        // 1) canEmbed -> Google /preview iframe (full formatting).
        // 2) hasContent -> text preview.
        // 3) else -> empty state with open/download CTAs.
        // v12.39.14-vizfix: restore the COMPLETE render path. dbViz kinds
        // (full/pdf/img/html/htmlframe/text/exturl) each get a real branch so
        // backend-resolved bytes always render, and fullVizRef is mounted so
        // the useEffect-driven UEVDocViewer.render() call has a target node.
        canDriveEmbed && !systemView
                ?renderDriveEmbed()
                :_dpDriveFid&&_dpDriveFid.length>=25&&systemView
                  ?renderDriveStream()
                  :dbViz&&dbViz.kind==='full'
          ?fullVizFailed
            ?renderFullVizFailed()
            :e('div',{ref:fullVizRef,style:{flex:'1 1 auto',minHeight:0}})
          :dbViz&&dbViz.kind==='pdf'
            ?e('iframe',{src:dbViz.url,className:'doc-preview-frame',style:{flex:'1 1 auto',minHeight:0,border:'none',width:'100%',height:'100%'},title:doc.name})
            :dbViz&&dbViz.kind==='img'
              ?e('div',{style:{flex:'1 1 auto',minHeight:0,display:'flex',alignItems:'center',justifyContent:'center',overflow:'auto'}},
                e('img',{src:dbViz.url,alt:doc.name,style:{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}))
              :dbViz&&dbViz.kind==='htmlframe'
                ?e('iframe',{src:dbViz.url,className:'doc-preview-frame',style:{flex:'1 1 auto',minHeight:0,border:'none',width:'100%',height:'100%'},title:doc.name})
                :dbViz&&dbViz.kind==='text'
                  ?e('pre',{className:'uev-text-render',style:{flex:'1 1 auto',margin:0,padding:'1rem',whiteSpace:'pre-wrap',wordBreak:'break-word',overflow:'auto'}},dbViz.text)
                  :dbViz&&dbViz.kind==='html'
                    ?e('div',{style:{flex:'1 1 auto',minHeight:0,overflow:'auto',padding:'.75rem',background:'#f1f3f4',display:'flex',justifyContent:'center'}},
                      UevDocRender(dbViz.text))
                    :dbViz&&dbViz.kind==='exturl'
                      ?e('iframe',{src:dbViz.url,className:'doc-preview-frame',style:{flex:'1 1 auto',minHeight:0,border:'none',width:'100%',height:'100%'},title:doc.name})
                      :viewMode==='iframe'
                        ?e('div',{className:'doc-zoom-wrap',style:{flex:'1 1 auto',minHeight:0,display:'flex',overflow:zoom>1?'auto':'hidden',WebkitOverflowScrolling:'touch'}},
                            iframeLoading&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.75rem'}},
                                e('i',{className:'fas fa-spinner fa-spin',style:{fontSize:'2rem',color:'var(--ink-4)'}}),
                                e('span',{style:{fontSize:'.82rem',color:'var(--ink-3)'}},'Зареждане на документа…')
                            ),
// v12.32.50-docscroll: floating scroll controls overlay for iframe content
                                                  e('iframe',{ref:iframeRef,src:activeIframeUrl||_dpDriveInlineEmbed||iframeUrl,className:'doc-preview-frame',style:{border:'none',borderRadius:0,
                              // v12.51.18-viewfit: honour the fit-to-width / fit-to-page / free
                              // modes (handleFitWidth/Page/Free set viewFit). Previously viewFit was
                              // set but never read, so the buttons were no-ops. width => fill width,
                              // auto height (scroll vertically); page => contain to viewport height;
                              // free => keep the zoom transform (manual zoom in/out buttons).
                              width:(viewFit==='width'?'100%':(viewFit==='page'?'100%':'100%')),
                              height:(viewFit==='width'?'auto':(viewFit==='page'?'100%':(zoom>1?(100/zoom)+'%':'100%'))),
                              maxHeight:(viewFit==='width'?'none':'100%'),
                              transform:(viewFit==='free'&&zoom>1)?'scale('+zoom+')':'none',
                              transformOrigin:'0 0',
                              display:iframeLoading?'none':'block',flex:(viewFit==='width'?'none':'1 1 auto'),minHeight:0,background:'var(--surface)'},title:doc.name||'Preview',loading:'lazy',referrerPolicy:'no-referrer-when-downgrade',sandbox:'allow-scripts allow-same-origin allow-popups allow-forms allow-downloads',allow:'autoplay; fullscreen; picture-in-picture'}),
                                                  e('div',{className:'doc-scroll-overlay',style:{position:'absolute',inset:0,pointerEvents:'none',display:'flex',flexDirection:'column',justifyContent:'space-between',padding:'.5rem'}},
                                                      e('div',{className:'doc-scroll-dock top',style:{display:'flex',gap:'.3rem',pointerEvents:'auto',alignItems:'flex-start'}},
                                                          e('button',{className:'btn btn-ghost btn-sm doc-scroll-btn',title:'Нагоре (PgUp / Alt+↑)',onClick:function(ev){ev.stopPropagation();iframeRef.current&&iframeRef.current.contentWindow&&iframeRef.current.contentWindow.scrollBy({top:-200,behavior:'smooth'})}},e('i',{className:'fas fa-chevron-up'})),
                                                          e('button',{className:'btn btn-ghost btn-sm doc-scroll-btn',title:'Надолу (PgDn / Alt+↓)',onClick:function(ev){ev.stopPropagation();iframeRef.current&&iframeRef.current.contentWindow&&iframeRef.current.contentWindow.scrollBy({top:200,behavior:'smooth'})}},e('i',{className:'fas fa-chevron-down'}))
                                                      ),
                                                      e('div',{className:'doc-scroll-dock bottom',style:{display:'flex',gap:'.3rem',pointerEvents:'auto',alignItems:'flex-end',justifyContent:'flex-end'}},
                                                          e('button',{className:'btn btn-ghost btn-sm doc-scroll-btn',title:'Към началото (Home)',onClick:function(ev){ev.stopPropagation();iframeRef.current&&iframeRef.current.contentWindow&&iframeRef.current.contentWindow.scrollTo({top:0,behavior:'smooth'})}},e('i',{className:'fas fa-angle-double-up'})),
                                                          e('button',{className:'btn btn-ghost btn-sm doc-scroll-btn',title:'Към края (End)',onClick:function(ev){ev.stopPropagation();iframeRef.current&&iframeRef.current.contentWindow&&iframeRef.current.contentWindow.scrollTo({top:999999,behavior:'smooth'})}},e('i',{className:'fas fa-angle-double-down'}))
                                                      )
                                                  )
                                                )
                        :hasContent
                          ?(function(){var _vis=typeof getDocVisuals==='function'?getDocVisuals(doc):{};var _mime=(doc.mimeType||'').toLowerCase();var _isAudio=_vis.cssClass==='audio'||_mime.includes('audio/')||_mime.includes('mp3')||_mime.includes('wav')||_mime.includes('ogg')||_mime.includes('m4a')||_mime.includes('flac');var _isVideo=_vis.cssClass==='video'||_mime.includes('video/')||_mime.includes('mp4')||_mime.includes('webm')||_mime.includes('mov')||_mime.includes('avi');if(_isAudio){var _src=doc.downloadUrl||doc.previewLink||doc.webViewLink||doc.openLink||'';return e('div',{className:'doc-audio-player',style:{flex:'1 1 auto',minHeight:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem'}},e('audio',{controls:true,style:{width:'100%',maxWidth:700,height:60},src:_src,preload:'metadata'}),!_src&&e('div',{style:{color:'var(--ink-4)',textAlign:'center',marginTop:'.5rem'}},e('i',{className:'fas fa-exclamation-triangle'}),' Няма аудио източник за преглед'))}if(_isVideo){var _src=doc.downloadUrl||doc.previewLink||doc.webViewLink||doc.openLink||'';return e('div',{className:'doc-video-player',style:{flex:'1 1 auto',minHeight:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem'}},e('video',{controls:true,style:{width:'100%',maxWidth:900,maxHeight:'80vh'},src:_src,preload:'metadata'}),!_src&&e('div',{style:{color:'var(--ink-4)',textAlign:'center',marginTop:'.5rem'}},e('i',{className:'fas fa-exclamation-triangle'}),' Няма видео източник за преглед'))}return e('div',{className:'doc-preview-text',style:{flex:'1 1 0%',overflow:'auto',fontSize:(0.88*zoom)+'rem',lineHeight:1.65,maxHeight:0}},_docContent||doc.content)})()
                          :e('div',{className:'empty-state',style:{flex:'1 1 0%',display:'flex',flexDirection:'column',justifyContent:'center',padding:'1.5rem'}},
                              e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-file-circle-exclamation'})),
                              e('h4',{style:{margin:'.75rem 0 .4rem'}},'Документът няма визуализация'),
                              e('p',{style:{maxWidth:360,textAlign:'center',lineHeight:1.55,margin:'0 auto 1.2rem'}},!!openLink
                                ? 'Документът е в Google Drive, но видеото не може да се вгради. Използвайте бутона по-долу да го отворите в нов раздел.'
                                : 'За този документ липсва файл или връзка за визуализация. Моля, качете файла или добавете Drive връзка.'),
                              e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center'}},
                                  openLink&&e('button',{className:'btn btn-outline',onClick:()=>window.open(openLink,'_blank','noopener,noreferrer')},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive'),
                                  !openLink&&e('span',{style:{fontSize:'.72rem',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.3rem'}},e('i',{className:'fas fa-info-circle'}),' Само метаданни')
                              ))
                          )
    ),

    e('div',{className:'modal-footer'+(toolbarDock==='header'?' docked-top':''),style:toolbarDock==='header'?{order:-1,borderTop:'none',borderBottom:'1px solid var(--border)'}:null},
      e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap'}},
          (hasDownload||hasContent)&&e('button',{className:'btn btn-outline',onClick:handleDownload},e('i',{className:'fas fa-download'}),' Изтегли'),
          // T15: Download All — bulk zip when docList has multiple docs
          Array.isArray(docList)&&docList.length>1&&e('button',{className:'btn btn-outline',onClick:handleDownloadAll,title:'Изтегли всички документи като ZIP','aria-label':'Изтегли всички документи'},e('i',{className:'fas fa-file-archive'}),' Изтегли всички ('+docList.length+')'),
          _isLarge&&_showNativeBtn&&e('button',{className:'btn btn-warning',onClick:handleNativeView},e('i',{className:'fab fa-google'}),' Нативен преглед'),
          openLink&&e('a',{href:openLink,target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline'},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive'),
          // v12.51.17-docdelete: wire the already-defined handleDelete (confirm +
          // onDelete) to a real button. Previously the modal defined handleDelete
          // but rendered NO delete action, so owners could not remove a doc from
          // the application via the viewer. Gated on the onDelete prop.
          onDelete&&e('button',{className:'btn btn-danger btn-sm',onClick:handleDelete,disabled:deletingP,title:'Изтрий документа','aria-label':'Изтрий документа'},deletingP?e(Fragment,null,e('i',{className:'fas fa-spinner spin'}),' Изтриване…'):e(Fragment,null,e('i',{className:'fas fa-trash'}),' Изтрий'))
      ),
      e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',alignItems:'center'}},
          e('span',{className:'doc-page-indicator',title:'Страница','aria-label':'Страница 1 от 1'},'Страница 1 / 1'),
          // v12.51.18-dock: wire the already-defined toolbarDock toggle. Previously
          // toggleToolbarDock/toolbarDock existed but had no UI — the footer was
          // always pinned to the bottom. Now owners can dock it to the header.
          e('button',{type:'button',className:'doc-viewer-seg-btn'+(toolbarDock==='header'?' active':''),onClick:toggleToolbarDock,title:toolbarDock==='header'?'Закачи лентата долу':'Закачи лентата горе','aria-label':'Премести лентата'},e('i',{className:'fas fa-bars'}),toolbarDock==='header'?' Долу':' Горе'),
          isTemplate&&onCopyAttach&&formId&&e('button',{className:'btn btn-success',onClick:handleCopyAttach,disabled:copying},copying?e(Fragment,null,e('i',{className:'fas fa-spinner spin'}),' Копиране…'):e(Fragment,null,e('i',{className:'fas fa-copy'}),' Създай копие и прикачи')),
          showAttach&&e('button',{className:'btn btn-gold',onClick:function(){onAttach(doc);dpClose();}},e('i',{className:'fas fa-link'}),' Прикачи към заявка')
      )
    )
    )
  )),
  // D10 — document version history panel (sibling of the modal, rendered when open)
  docVersionsOpen && e('div',{className:'doc-versions-panel',role:'region','aria-label':'История на версиите',style:{margin:'0 1rem 1rem',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',background:'var(--surface-2)',padding:'.6rem .85rem',maxHeight:'30vh',overflowY:'auto'}},
    e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.4rem'}},
      e('i',{className:'fas fa-history',style:{color:'var(--ink-3)'}}),
      e('strong',{style:{fontSize:'.78rem'}},'История на версиите'),
      docVersionsLoading && e('span',{style:{fontSize:'.7rem',color:'var(--ink-4)'}},'зареждане…'),
      e('button',{className:'btn btn-ghost btn-sm',style:{marginLeft:'auto',lineHeight:1},onClick:function(){setDocVersionsOpen(false);}},'×')
    ),
    docVersions.length===0 && !docVersionsLoading && e('p',{style:{fontSize:'.74rem',color:'var(--ink-4)',margin:0}},'Няма записана история на версиите.'),
    docVersions.map(function(v,vi){
      var _isLast = vi===docVersions.length-1;
      return e('div',{key:(v.id||vi),style:{display:'flex',gap:'.6rem',padding:'.35rem 0',borderBottom:_isLast?'none':'1px solid var(--border)',fontSize:'.74rem',position:'relative'}},
        e('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',flexShrink:0,width:'14px'}},
          e('span',{style:{width:'9px',height:'9px',borderRadius:'50%',background:_isLast?'var(--brand-teal)':'var(--border-2)',border:'2px solid '+( _isLast?'var(--brand-teal)':'var(--bg-2)'),marginTop:'.15rem',flexShrink:0}}),
          !_isLast && e('span',{style:{flex:'1 1 auto',width:'2px',background:'var(--border)',marginTop:'2px'}})
        ),
        e('div',{style:{flex:'1 1 auto',minWidth:0}},
          e('div',{style:{fontWeight:600,color:'var(--ink)'}},v.note||('Версия '+(docVersions.length-vi))),
          e('div',{style:{color:'var(--ink-4)',fontSize:'.7rem'}},(v.created?String(v.created):'—')+(v.user_email?(' — '+v.user_email):''))
        )
      );
    })
  ),
  // Task 21 — document comments panel (sibling of the modal, rendered when open)
  docCommentsOpen && doc && e(DocCommentsPanel, { docId: (doc.id || doc.driveId || doc.fileId || ''), userEmail: userEmail || (typeof _currentUserEmail!=='undefined'?_currentUserEmail:''), onClose: function(){ setDocCommentsOpen(false); } }),
  showInlineEdit&&e(InlineDocEditorModal,{doc:doc,onClose:function(){setShowInlineEdit(false)},onSaved:function(updatedDoc){setShowInlineEdit(false)},formId:formId,inline:true,defaultEditMode:true}),
  // v12.49.44-docstream: real-time collaborative rich-text editor overlay.
  // Mounted when the user toggles "Съвместно редактиране" in the toolbar.
  // DocStreamEditor is a self-contained global (js/features/doc-stream/DocStreamEditor.js),
  // reached only here so it never interferes with the normal preview path.
  docStreamOpen && doc && (function(){
    var _dsId = (doc.id || doc.driveId || doc.fileId || '');
    if(!_dsId) return null;
    var _dsUser = userEmail || (typeof _currentUserEmail!=='undefined'?_currentUserEmail:'');
    var _DSEditor = (typeof DocStreamEditor!=='undefined')?DocStreamEditor:((typeof window!=='undefined'&&window.DocStreamEditor)||null);
    if(!_DSEditor) return null;
    return e(_DSEditor,{
      docId: _dsId,
      userEmail: _dsUser,
      userName: (_dsUser||'').split('@')[0],
      initialContent: '',
      onClose: function(){ setDocStreamOpen(false); },
      onSave: function(/*html*/){ /* persisted server-side via doc-stream-op.php */ }
    });
  })(),
  // v12.51.6-sidebar: slide-out document info + annotations panel
  docSidebarOpen && doc && e('div',{className:'doc-sidebar-overlay',onClick:function(){setDocSidebarOpen(false);}},
    e('div',{className:'doc-sidebar',onClick:function(ev){ev.stopPropagation();},role:'dialog','aria-label':'Информация и анотации за документа','aria-modal':'true'},
      e('div',{className:'doc-sidebar-head'},
        e('strong',{className:'doc-sidebar-title'},'Документ'),
        e('button',{className:'close-btn',onClick:function(){setDocSidebarOpen(false);},'aria-label':'Затвори панела'},e('i',{className:'fas fa-times'}))
      ),
      e('div',{className:'doc-sidebar-body'},
        e('div',{className:'doc-sidebar-section'},
          e('div',{className:'doc-sidebar-label'},'Метаданни'),
          e('dl',{className:'doc-meta-list'},
            e('dt',null,'Име'),e('dd',null,doc.name||'—'),
            e('dt',null,'Тип'),e('dd',null,doc.mimeType||vis.label||'—'),
            doc.size&&e(Fragment,null,e('dt',null,'Размер'),e('dd',null,(function(){var s=Number(doc.size)||0;if(s>1048576)return(s/1048576).toFixed(1)+' MB';if(s>1024)return(s/1024).toFixed(0)+' KB';return s+' B';})())),
            doc.ownerEmail&&e(Fragment,null,e('dt',null,'Собственик'),e('dd',null,doc.ownerEmail)),
            doc.created&&e(Fragment,null,e('dt',null,'Създаден'),e('dd',null,String(doc.created))),
            doc.modified&&e(Fragment,null,e('dt',null,'Променен'),e('dd',null,String(doc.modified)))
          )
        ),
        e('div',{className:'doc-sidebar-section'},
          e('div',{className:'doc-sidebar-label'},e('span',null,'Анотации'),' ',e('button',{className:'btn btn-ghost btn-sm',onClick:_addAnnotation,title:'Добави анотация','aria-label':'Добави анотация'},e('i',{className:'fas fa-plus'}))),
          annotationsLoading&&e('div',{className:'doc-sidebar-empty'},'Зареждане…'),
          !annotationsLoading&&annotations.length===0&&e('div',{className:'doc-sidebar-empty'},'Няма анотации. Добавете първата, за да маркирате важно съдържание.'),
          e('div',{className:'doc-annotation-list'},
            annotations.map(function(a){
              return e('div',{key:a.id,className:'doc-annotation'},
                e('div',{className:'doc-annotation-text'},a.text),
                e('div',{className:'doc-annotation-meta'},a.created?new Date(a.created).toLocaleString('bg-BG'):''),
                e('button',{className:'doc-annotation-del',onClick:function(){_removeAnnotation(a.id);},'aria-label':'Премахни анотацията',title:'Премахни'},e('i',{className:'fas fa-trash'}))
              );
            })
          )
        )
      )
    )
  )
);
});

/* ─── INLINE DOCUMENT EDITOR / VIEWER MODAL ───
 *  A unified document handler that can both preview AND edit documents
 *  directly inside the ERP UI. Supports:
 *    - Google Docs / Sheets (embedded iframe editing when allowed)
 *    - Text-content files (inline textarea editor)
 *    - Any file with a Drive ID (preview + open in Drive / download)
 *    - Uploaded files without Drive ID (metadata + download)
 *
 *  Props: { doc, onClose, onSaved, formId }
 *    doc: { id, name, mimeType, content, previewLink, googleDocEditLink, downloadUrl, folderName }
 *    onSaved: called after the user clicks "Запази" (re-attaches doc) */
// v12.32.9-visualizer: render ERP document HTML (which may embed <img> seals,
// official photos, tables) as a Google-Docs-styled page inside the modal so
// visual elements are visible. Sanitize to block script/iframe/handlers while
// keeping structural + image tags.
function uevIsHtml(s){
  return typeof s==='string'&&/<\s*(p|br|div|span|img|table|tbody|thead|tr|td|th|ul|ol|li|h[1-6]|b|i|strong|em|a|font|section|figure|figcaption)[^>]*>/i.test(s);
}
function uevSanitizeHtml(html){
  if(typeof html!=='string'||!html) return '';
  return html
    .replace(/<\s*(script|iframe|object|embed|applet|link|meta|style|svg|math|base|form)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi,'')
    .replace(/<\s*(script|iframe|object|embed|applet|link|meta|style|svg|math|base|form)[^>]*\/?>/gi,'')
    .replace(/\s(on\w+)\s*=\s*"[^"]*"/gi,'')
    .replace(/\s(on\w+)\s*=\s*'[^']*'/gi,'')
    .replace(/\s(on\w+)\s*=\s*[^\s>]+/gi,'')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi,'$1=$2#blocked$2')
    .replace(/(src)\s*=\s*("|')(?!https?:|data:image\/|\/|#)[^"']*\2/gi,'$1=$2#blocked$2');
}
// v12.32.15-docrender: self-contained Google-Docs-styled page renderer for
// ERP document HTML. Inlines its own scoped CSS (.uev-doc-render) so the rich
// visual layout works regardless of the live all.min.css build state. Renders
// embedded <img> seals / official photos / tables with Google-Docs fidelity.
var _UEV_DOC_RENDER_CSS=
  '.uev-doc-render{background:#fff;color:#202124;font-family:Georgia,"Times New Roman",serif;'+
  'font-size:15px;line-height:1.7;padding:48px 56px;max-width:820px;margin:0 auto;'+
  'box-shadow:0 1px 3px rgba(60,64,67,.3);border-radius:2px;min-height:100%;word-wrap:break-word;overflow-wrap:break-word;}'+
  '.uev-doc-render :where(h1,h2,h3,h4){font-family:"Roboto","Segoe UI",Arial,sans-serif;color:#1a237e;line-height:1.25;margin:1.1em 0 .5em;font-weight:700;}'+
  '.uev-doc-render h1{font-size:1.7em;text-align:center;}.uev-doc-render h2{font-size:1.4em;}.uev-doc-render h3{font-size:1.18em;}'+
  '.uev-doc-render p{margin:.6em 0;}.uev-doc-render a{color:#1565c0;text-decoration:underline;}'+
  '.uev-doc-render img{max-width:100%;height:auto;display:block;margin:1em auto;border:1px solid #e0e0e0;border-radius:4px;padding:6px;background:#fafafa;}'+
  '.uev-doc-render table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.92em;}'+
  '.uev-doc-render td,.uev-doc-render th{border:1px solid #bdbdbd;padding:6px 10px;text-align:left;vertical-align:top;}'+
  '.uev-doc-render th{background:#e8eaf6;font-weight:700;}.uev-doc-render ul,.uev-doc-render ol{margin:.6em 0;padding-left:1.6em;}'+
  '.uev-doc-render li{margin:.25em 0;}.uev-doc-render hr{border:none;border-top:1px solid #cfcfcf;margin:1.2em 0;}'+
  '.uev-doc-render blockquote{margin:1em 0;padding:.4em 1em;border-left:3px solid #c5cae9;color:#444;background:#f5f5f8;}';
// v12.32.15-a11y+perf: lazy-load images inside the doc renderer and expose a
// stable accessibility contract. Wrapped in memo to avoid re-sanitising
// unchanged HTML across modal re-renders (scroll / zoom / overlay clicks).
var UevDocRender=memo(function UevDocRender(_html){
  var _sanitized=uevSanitizeHtml(_html);
  // v12.35.0-imgfix: the callback previously read `_m[2]` where `_m` is the
  // MATCHED STRING, not the match array — `_m[2]` evaluated to the single
  // character 'm', so every <img> was rewritten with its src/alt/width DROPPED
  // and images silently vanished from rendered ERP documents. Capture groups
  // must be received as named callback parameters.
  var _lazyHtml=_sanitized.replace(/<img(\s*)([^>]*?)\s*\/?>/gi,function(_full,_ws,_attrs){
    _attrs=_attrs||'';
    if(/loading\s*=/i.test(_attrs))return _full;
    var _sep=_attrs?' ':'';
    return '<img'+_sep+_attrs+' loading="lazy" decoding="async" style="max-width:100%;height:auto;display:block;margin:.6rem auto;border:1px solid #e8ecf1;padding:4px;background:#fff;border-radius:2px">';
  });
  return e(Fragment,null,
    e('style',{dangerouslySetInnerHTML:{__html:_UEV_DOC_RENDER_CSS}}),
    e('div',{className:'uev-doc-render',role:'document','aria-label':'Съдържание на документа',dangerouslySetInnerHTML:{__html:_lazyHtml}})
  );
});

var InlineDocEditorModal=memo(({doc,onClose,onSaved,formId,inline,defaultEditMode})=>{
// v12.32.7-tdzfix: safeClose is defined further down (it needs textContent/dirty/etc).
// Passing it directly to useModalClose here throws a temporal-dead-zone ReferenceError
// ("Cannot access 'safeClose' before initialization"). Route through a ref instead so
// useModalClose gets a stable wrapper that dispatches to safeClose at call-time.
const safeCloseRef=useRef(null);
const{closing:ieClosing,close:ieClose}=useModalClose(function(){var f=safeCloseRef.current;if(typeof f==='function'){f();}else if(typeof onClose==='function'){onClose();}});
const ieOverlayHandlers=_useOverlayClickGuard(ieClose,true);
const[saving,setSaving]=useState(false);
const[iframeLoading,setIframeLoading]=useState(true);
const[iframeError,setIframeError]=useState(false);
const[cspBlocked,setCspBlocked]=useState(false);
// v3.39.13-stable: when the proxy reports no inline ERP copy for a binary office
// file (.docx/.xlsx), override the iframe src with the stable official Google
// Drive /preview (which renders office files inline — only /edit is blocked).
const[drivePreviewOverride,setDrivePreviewOverride]=useState('');
const[retryKey,setRetryKey]=useState(0);
const[driveGone,setDriveGone]=useState(false); // deleted/trashed Drive file
const[driveGoneChecking,setDriveGoneChecking]=useState(false);
// v12.47.0-drivegone: preflight the Drive file via drivefilemeta so a deleted
// file shows our own styled "removed" panel instead of framing Google's
// cross-origin error page (which JS can't read from inside the iframe).
// v12.49.78-watchdog: cap the preflight (GAS may be briefly unreachable) so it
// can never wedge driveGoneChecking; a definitive exists:false still flips
// driveGone, everything else is treated as "unknown" (driveGone=false).
useEffect(function(){
  var fid=_driveIdFromDoc?(_driveIdFromDoc(doc)||(doc&&doc.driveId)||''):(doc&&doc.driveId)||'';
  if(!fid||!/^[a-zA-Z0-9_-]{10,}$/.test(fid)){setDriveGone(false);setDriveGoneChecking(false);return;}
  if(!(isGoogleDoc||isGoogleSheet||hasEmbed)){setDriveGone(false);setDriveGoneChecking(false);return;}
  setDriveGoneChecking(true);
  var _to=setTimeout(function(){setDriveGoneChecking(false);},12000);
  api('drivefilemeta',{driveId:fid}).then(function(res){
    if(res&&res.success&&res.exists===false){setDriveGone(true);setDpAriaStatus('Документът е премахнат или недостъпен');}else{setDriveGone(false);}
  }).catch(function(){
      // GAS returned HTML or network error — treat as transient, don't flip driveGone
      // but set a flag so we don't trust Google iframe
      setDriveGone(false);
      _driveMetaFailed = true;
    }).finally(function(){clearTimeout(_to);setDriveGoneChecking(false);});
    return function(){clearTimeout(_to);};
  },[doc&&doc.driveId,doc&&doc.id,isGoogleDoc,isGoogleSheet,hasEmbed]);
const[textContent,setTextContent]=useState('');
// v12.32.15-docview: when the modal can't embed (no iframe) and isn't a
// text-editable doc, fetch + render the document's stored HTML directly in
// the modal (via getdocumentcontent) so the user SEES the document — not just
// a "download / open in Drive" prompt.
const[renderedHtml,setRenderedHtml]=useState((doc&&doc.content)||'');
const[renderedLoading,setRenderedLoading]=useState(false);
useEffect(function(){
  if((isTextLike&&docContent)||isGoogleDoc||isGoogleSheet||hasEmbed)return;
  var _id=doc&&doc.id;
  if(!_id)return;
  if(renderedHtml)return;
  setRenderedLoading(true);
  api('getdocumentcontent',{docId:_id}).then(function(res){
    if(res&&res.success&&res.content)setRenderedHtml(res.content);
  }).catch(function(){}).finally(function(){setRenderedLoading(false);});
},[doc&&doc.id,isTextLike,docContent,isGoogleDoc,isGoogleSheet,hasEmbed,renderedHtml]);
// v12.32.39-universal: FULL-VISUAL rendering in the editor modal too. For any
// doc with bytes reachable via downloadDocument (DB → GAS → drive-direct),
// render Word/Excel/PDF/images with real visual fidelity via UEVDocViewer —
// this removes the "Прегледът не е наличен"/"Документът е готов" dead ends.
const[ieFullViz,setIeFullViz]=useState(null); // {mime,b64,name}
const[ieFullVizBusy,setIeFullVizBusy]=useState(false);
const[ieFullVizFailed,setIeFullVizFailed]=useState(false);
const ieFullVizRef=useRef(null);
const _ieFullVizTriedRef=useRef(false);
const _ieFullVizDoneRef=useRef('');
// v12.32.48-ux: manual retry for the full-visual render (user-initiated).
const[ieFullVizRetryKey,setIeFullVizRetryKey]=useState(0);
useEffect(function(){
  if(isGoogleDoc||isGoogleSheet)return;          // Google-native → embed/edit flows
  if(isTextLike&&docContent)return;              // text editor handles it
  if(_ieFullVizTriedRef.current)return;
  var _key=(doc&&(doc.id||doc.driveId))||'';
  if(!_key)return;
  _ieFullVizTriedRef.current=true;
  var _sid=(window.STATE&&window.STATE.sessionId)||(window.__SESSION_ID)||'';
  api('downloadDocument',{docId:_key,formId:formId||'',name:(doc&&doc.name)||'',userId:_sid}).then(function(r){
    if(!r||!r.success||r.kind!=='blob'||!r.b64)return;
    var mime=String(r.mimeType||'application/octet-stream').toLowerCase();
    var _kf=(window.UEVDocViewer&&window.UEVDocViewer.kindFor)?window.UEVDocViewer.kindFor(mime,r.name||(doc&&doc.name)||''):'';
    if(_kf==='pdf'||_kf==='docx'||_kf==='xlsx'||_kf==='img'){
      setIeFullViz({mime:mime,b64:r.b64,name:r.name||(doc&&doc.name)||''});
    }
  }).catch(function(){});
},[doc&&(doc.id||doc.driveId),isGoogleDoc,isGoogleSheet,isTextLike,docContent,formId,ieFullVizRetryKey]);
useEffect(function(){
  if(ieFullViz&&ieFullViz.b64&&ieFullVizRef.current&&typeof window.UEVDocViewer!=='undefined'){
    var key=(ieFullViz.mime||'')+':'+ieFullViz.b64.length;
    if(_ieFullVizDoneRef.current===key)return;
    _ieFullVizDoneRef.current=key;
    setIeFullVizBusy(true);setIeFullVizFailed(false);
    window.UEVDocViewer.render(ieFullVizRef.current,{mime:ieFullViz.mime,b64:ieFullViz.b64,name:ieFullViz.name}).then(function(ok){
      setIeFullVizBusy(false);if(!ok)setIeFullVizFailed(true);
    }).catch(function(){setIeFullVizBusy(false);setIeFullVizFailed(true);});
  }
},[ieFullViz]);
const[dirty,setDirty]=useState(false); // user has unsaved edits — forces save-on-close
const realOnClose=onClose;
// v3.39.10-inline-edit: open TEXT documents directly in the inline editor
// so the empty "Документът е готов" space becomes a live editable textarea.
const[useTextEditor,setUseTextEditor]=useState(function(){
  var _m=(doc&&doc.mimeType||'').toLowerCase();
  var _n=(doc&&doc.name||'').toLowerCase();
  var isPlain=/text\/plain/.test(_m)||_n.endsWith('.txt')||_n.endsWith('.csv')||_n.endsWith('.md');
  // v12.38.1-bin: never open a binary office/PDF file (base64 in content) in the
  // raw text editor — route it to the native Drive /preview or DB full-viz instead.
  return isPlain && !_contentIsBinary;
});
const[loadingErp,setLoadingErp]=useState(false);
// v3.39.4-editux: Start in EDIT mode by default for "Редактирай" flow.
// Google CSP blocks framing regardless — the CSP fallback shows "Отвори в нов раздел".
// defaultEditMode prop allows callers (FormDetail edit button) to request edit-first UX.
const[editMode,setEditMode]=useState(defaultEditMode===true);
const iframeRef=useRef(null);
const _retryCountRef=useRef(0);
const _cspDetectedRef=useRef(false);
const _ieNestedTimerRef=useRef(null);

// v3.39.4-snakefix: Normalise snake_case from PHP to camelCase that the rest of
// this component expects. The PHP API returns snake_case column names (drive_id,
// preview_link, mime_type, web_view_link, google_doc_edit_link, etc.) but this
// component reads doc.driveId, doc.previewLink, etc. Mirror once here.
if(doc){
  if(doc.drive_id && !doc.driveId) doc.driveId = doc.drive_id;
  if(doc.mime_type && !doc.mimeType) doc.mimeType = doc.mime_type;
  if(doc.preview_link && !doc.previewLink) doc.previewLink = doc.preview_link;
  if(doc.web_view_link && !doc.webViewLink) doc.webViewLink = doc.web_view_link;
  if(doc.google_doc_edit_link && !doc.googleDocEditLink) doc.googleDocEditLink = doc.google_doc_edit_link;
  if(doc.edit_link && !doc.editLink) doc.editLink = doc.edit_link;
  if(doc.download_url && !doc.downloadUrl) doc.downloadUrl = doc.download_url;
  if(doc.folder_name && !doc.folderName) doc.folderName = doc.folder_name;
  if(doc.file_id && !doc.fileId) doc.fileId = doc.file_id;
  if(doc.type_label && !doc.typeLabel) doc.typeLabel = doc.type_label;
  if(doc.template_source_id && !doc.templateSourceId) doc.templateSourceId = doc.template_source_id;
}

// ── Detect document type ──
var docMime=(doc&&doc.mimeType)||'';
var docName=(doc&&doc.name)||'';
var docContent=(doc&&doc.content)||'';
// v12.38.1-bin: a binary office/PDF file (docx/xlsx/pptx/pdf) that happens to
// carry its bytes in doc.content (base64) must NOT be treated as text-like. The
// old `isTextLike = ... || !!docContent.trim()` made a binary .docx "look"
// text-like and dumped its raw base64 into the textarea (screenshot-1 bug).
// Detect the ZIP/PDF magic signature at the head of doc.content and flag binary.
function _uevLooksBinaryContent(s){
  if(typeof s!=='string'||s.length<7)return false;
  var h=s.replace(/[\r\n\t ]/g,'').slice(0,12);
  return /^UEsDB/i.test(h)     // ZIP (.docx/.xlsx/.pptx — base64 "UEsDBBQ")
      || /^PK\x03\x04/i.test(h) // raw ZIP magic
      || /^JVBERI/i.test(h)     // PDF ("%PDF-1.")
      || /^0M8R/i.test(h);      // legacy OLE2 (.doc/.xls)
}
// v12.47.4-bin: a binary OFFICE/PDF container (docx/xlsx/pptx/doc/xls/pdf) is
// NEVER valid ERP plain-text content, even when doc.content is empty at init
// (it gets fetched lazily and would then be dumped into the textarea — the
// reported "Base64 blob in editor" defect). Treat these mime/name types as
// binary unconditionally so every text-mode gate below rejects them.
// v12.47.5-fix: assign docMimeLc/docNameLc BEFORE the isBinaryOffice gate.
// The old order read docMimeLc.includes(...) at render time while those vars
// were still var-hoisted undefined -> "Cannot read properties of undefined
// (reading 'includes')" on EVERY document open (the reported modal crash).
var docMimeLc=docMime.toLowerCase();
var docNameLc=docName.toLowerCase();
var isBinaryOffice=/\.(docx?|xlsx?|pptx?|pdf)$/i.test(docNameLc)||docMimeLc.includes('officedocument')||docMimeLc.includes('ms-excel')||docMimeLc.includes('ms-word')||docMimeLc.includes('ms-powerpoint')||docMimeLc.includes('pdf');
var _contentIsBinary=_uevLooksBinaryContent(docContent)||isBinaryOffice;
var isGoogleDoc=docMimeLc.includes('google')||/\.google\.com/.test(docMime)||!!(doc&&doc.googleDocEditLink);
var isGoogleSheet=docMimeLc.includes('sheets')||docMimeLc.includes('spreadsheet');
var isPdf=docMimeLc.includes('pdf')||docNameLc.endsWith('.pdf');
var isImage=docMimeLc.includes('image')||/\.(png|jpg|jpeg|gif|webp)$/i.test(docNameLc);
var isOffice=/\.(docx?|xlsx?|pptx?)$/i.test(docNameLc)||docMimeLc.includes('officedocument')||docMimeLc.includes('ms-excel')||docMimeLc.includes('ms-word')||docMimeLc.includes('ms-powerpoint');
var isTextLike=docMimeLc.includes('text')||docMimeLc.includes('plain')||docNameLc.endsWith('.txt')||docNameLc.endsWith('.csv')||(!!docContent&&docContent.trim()&&!_contentIsBinary);
// ── O(1) doc meta lookup (replaces chained if-else) ──
var _DOC_META={
  googleSheet:{icon:'fa-file-excel', color:'#0f9d58', label:'Google Sheets'},
  pdf:        {icon:'fa-file-pdf',   color:'#b30b00', label:'PDF'},
  image:      {icon:'fa-file-image', color:'#c77d2e', label:'Изображение'},
  textLike:   {icon:'fa-file-alt',   color:'#636363', label:'Текст'},
  googleDoc:  {icon:'fa-file-word',  color:'#2b579a', label:'Google Docs'},
  fallback:   {icon:'fa-file-word',  color:'#2b579a', label:'Документ'}
};
var _docTypeKey=isGoogleSheet?'googleSheet':isPdf?'pdf':isImage?'image':isTextLike?'textLike':isGoogleDoc?'googleDoc':'fallback';
var _docMeta=_DOC_META[_docTypeKey];
// Extract a usable Drive file ID (skip synthetic prefixes like s_, up_, doc_, f_, copied_)
var _rawId=doc.driveId||doc.id||'';
// v12.30.2-editinmodal: recover the real Drive file ID from links too (library
// reference docs often carry only a synthetic id, but the file ID lives inside
// googleDocEditLink/previewLink/webViewLink).
// v3.39.6-driveid: Validate Drive ID — real IDs are 25+ chars, only A-Za-z0-9_-,
// no synthetic prefixes (s_, doc_, up_, f_, copied_). Function declaration is
// hoisted so it's safe to use before any var/const assignments.
function _isValidDriveId(id){
  return typeof id === 'string' && id.length >= 25 && /^[A-Za-z0-9_-]+$/.test(id) &&
    !/^(s_|doc_|up_|f_|copied_)/.test(id);
}
var _driveFid=_driveIdFromDoc(doc)||_rawId;
// Clear _driveFid if it's not a valid Drive ID (prevents sending synthetic
// IDs like "up_..." or "tpl_fni" to the proxy).
// v3.39.7-erpfix: guard against missing helper (stale bundles) — fall back to
// a permissive check so we never throw "_isValidDriveId is not a function".
var _isValidDriveIdFn = (typeof _isValidDriveId === 'function') ? _isValidDriveId :
  function(id){ return typeof id==='string' && id.length>=25 && /^[A-Za-z0-9_-]+$/.test(id) && !/^(s_|doc_|up_|f_|copied_)/.test(id); };
if(!_isValidDriveIdFn(_driveFid)) _driveFid='';

// ── Compute embed/edit URLs ──
// EDIT mode: Full Google Docs/Sheets editor embedded via /edit?usp=drivesdk
//   (shows the FULL Google toolbar including menus, formatting,
//   comments, and share button). When X-Frame-Options blocks the embed, we
//   gracefully fall back to error state with a prominent "Отвори за редакция" CTA.
// PREVIEW mode: Minimal Drive viewer (/preview) — read-only.
var embedEditUrl='';
var embedViewUrl='';
var directEditUrl='';
if(_driveFid){
  var encId=encodeURIComponent(_driveFid);
  if(doc.googleDocEditLink){
    embedEditUrl=doc.googleDocEditLink;
    directEditUrl=doc.googleDocEditLink;
    embedViewUrl=doc.googleDocEditLink.replace(/\/edit/,'/preview').replace(/[?&]usp=[^&]*/,'')+'';
  } else if(isGoogleSheet){
    embedEditUrl='https://docs.google.com/spreadsheets/d/'+encId+'/edit?usp=drivesdk';
    embedViewUrl='https://docs.google.com/spreadsheets/d/'+encId+'/preview';
    directEditUrl='https://docs.google.com/spreadsheets/d/'+encId+'/edit';
  } else if(isGoogleDoc){
    embedEditUrl='https://docs.google.com/document/d/'+encId+'/edit?usp=drivesdk';
    embedViewUrl='https://docs.google.com/document/d/'+encId+'/preview';
    directEditUrl='https://docs.google.com/document/d/'+encId+'/edit';
  } else if(isPdf||isImage){
    embedEditUrl='https://drive.google.com/file/d/'+encId+'/preview';
    embedViewUrl='https://drive.google.com/file/d/'+encId+'/preview';
    directEditUrl='https://drive.google.com/file/d/'+encId+'/view';
  } else if(isOffice){
    // v12.37.7-yai: Office files (.docx/.xlsx/.pptx) embed the NATIVE Google
    // Drive viewer (/preview) in view mode — same as yai.free.bg.
    // Without this branch, Office docs fell to the blank 'Документ' placeholder.
    embedEditUrl='https://drive.google.com/file/d/'+encId+'/preview';
    embedViewUrl='https://drive.google.com/file/d/'+encId+'/preview';
    directEditUrl='https://drive.google.com/file/d/'+encId+'/view';
  }
}
// _isGoogleUrl: detects whether the computed embed target is a Google host.
// NOTE: historically Google's CSP (frame-ancestors) blocked ALL Drive/Docs
// framing, so the iframe was skipped entirely. As of v12.30.2-editinmodal we
// now ATTEMPT the inline /edit?usp=drivesdk embed and rely on the
// securitypolicyviolation + 6s-timeout handlers to fall back gracefully when
// framing is blocked. _isGoogleUrl is retained for diagnostics only.
var _isGoogleUrl=embedEditUrl&&/^https:\/\/(docs|drive|accounts)\.google\.com/.test(embedEditUrl);
// v12.30.2-editinmodal: Do NOT pre-reject Google URLs. An inline /edit?usp=drivesdk
// embed IS attempted; if Google's CSP (frame-ancestors) blocks framing, the
// existing securitypolicyviolation + 6s-timeout handlers flip to the fallback
// "Отвори за редакция" state. This is what makes "open the doc inline in edit
// mode" actually work for Google Docs instead of always falling back to a tab.
// v12.49.86-deadpagefix: a trashed/deleted Drive file has no usable Google
// embed — the iframe would render Google's own dead page which JS can never
// read. Gate hasEmbed on !driveGone so the render tree falls through to the
// existing "Документът е премахнат" card (L2530) instead of the iframe.
var hasEmbed=!!embedEditUrl && !driveGone;
var canEditInline=!!_driveFid||isGoogleDoc||isGoogleSheet||(isTextLike&&docContent);
var canOpenExternal=!!directEditUrl;

// ── v12.47.0-gnative: Google-native document controls ──────────────────────
// Deep links into Google's OWN dialogs for the embedded file, so an applicant
// drives comment / suggest / version-history / print / copy from inside the
// ERP modal instead of hunting through Drive. Docs & Sheets only — Google
// offers no such endpoints for PDFs, images or raw Office files.
var _gnBase=(_driveFid&&(isGoogleDoc||isGoogleSheet))
  ? (isGoogleSheet?'https://docs.google.com/spreadsheets/d/':'https://docs.google.com/document/d/')+encodeURIComponent(_driveFid)
  : '';
var gNative=_gnBase?{
  // ?disco=… opens Google's comment sidebar; mode=suggesting = tracked changes.
  comment:_gnBase+'/edit?usp=drivesdk#heading=h.comments',
  suggest:_gnBase+'/edit?usp=drivesdk&mode=suggesting',
  history:_gnBase+'/revisions',
  copy:_gnBase+'/copy',
  print:_gnBase+'/export?format=pdf'
}:null;
var _gnOpen=function(url){ if(url) window.open(url,'_blank','noopener,noreferrer'); };
// v3.39.6-erpcontent: stable ERP doc id for copy-based inline edit. _driveFid is
// the real Drive file id (25+ chars) — but the ERP-copied docs carry up_/copied_
// ids in attachedDocs. Prefer doc.fileId/doc.id so we address the ERP copy.
var _erpId = doc.fileId || doc.id || _driveFid;
// v3.39.11-officetext: Broaden in-system edit to ANY ERP-owned document
// id (incl. plain ids like "F6AC69C46" from the screenshot) — not just
// up_/copied_ prefixes. We only exclude system rows (s_/doc_/f_) and raw
// 25+ char Google Drive file ids (those are never writeable to documents.content
// under that key). This makes the "Редактирай в системата" textarea editor
// + savedocumentcontent path available for every doc the ERP actually owns.
var _isSysRow = !!(_erpId && /^(s_|doc_|f_|library_)/.test(_erpId));
var _isDriveIdOnly = _isValidDriveIdFn(_erpId);
var _canEditErp = !!(_erpId && !_isSysRow && !_isDriveIdOnly && !_contentIsBinary);
// v20.0.0-noautocsp: Removed auto-open — Google Docs blocking CSP is handled
// via user-initiated button in the UI instead of forcing a new tab.

// ── Initialize text content for text editor mode ──
useEffect(function(){
  if(isTextLike&&docContent&&!iframeRef.current){
    setTextContent(docContent);
    setUseTextEditor(true);
  }
},[]);

// ── Iframe source: EDIT mode uses the full editor URL; PREVIEW mode uses the view URL ──
// v12.32.30-docview: VIEW mode embeds the OFFICIAL Google Drive preview
// (drive.google.com/file/d/{id}/preview) DIRECTLY. This is the
// Google-supported, secure, read-only viewer — Google explicitly allows
// framing of /preview (only /edit is CSP-blocked). No proxy/CSP-bypass needed.
// The server-side proxy (proxy-doc.php) is reserved for ERP-content rendering
// and edit mode, where Google blocks framing.
var _rawEmbedUrl = editMode ? embedEditUrl : embedViewUrl;
var _proxyBase = String(window.__UEV_PROXY_DOC || '')
  ? window.__UEV_PROXY_DOC.replace(/\?.*$/, '')
  : ((window._PHP_API_URL || (typeof _PHP_API_URL !== 'undefined' ? _PHP_API_URL : ''))
    ? String(window._PHP_API_URL || _PHP_API_URL).replace(/\/[^/]+\.php$/, '/proxy-doc.php')
    : 'database/proxy-doc.php');
// Official view-only Google preview is used when we have a real Drive file id
// and we are NOT editing and NOT rendering ERP's own stored content.
var _useOfficialPreview = (!editMode && !!_driveFid && !erpEmbedSrc && !driveGone);
// Only proxy Google URLs for edit mode / ERP content (where framing is blocked).
var _isProxied = !_useOfficialPreview && !!(_rawEmbedUrl && /^https:\/\/(docs|drive|accounts)\.google\.com/i.test(_rawEmbedUrl));
var iframeSrc = drivePreviewOverride
    ? drivePreviewOverride
    : (_useOfficialPreview
        // v12.51.13-gnative: MIME-aware official preview. Native Google
        // Docs/Sheets/Slides/Drawings render more reliably from their
        // type-specific docs.google.com/{type}/d/{id}/preview URL than the
        // generic drive.google.com/file/d/{id}/preview (which is what the
        // preview modal was 404-ing on for native files). Parity with
        // DocumentPreviewModal's _dpDirectEmbed.
        ? (isGoogleSheet
            ? 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(_driveFid) + '/preview'
            : isGoogleDoc
              ? 'https://docs.google.com/document/d/' + encodeURIComponent(_driveFid) + '/preview'
              : (/drawing|presentation/.test((doc&&(doc.mimeType||doc.mime_type||''))||'')
                  ? 'https://docs.google.com/' + (/presentation/.test((doc&&(doc.mimeType||doc.mime_type||''))||'')?'presentation':'drawings') + '/d/' + encodeURIComponent(_driveFid) + '/preview'
                  : 'https://drive.google.com/file/d/' + encodeURIComponent(_driveFid) + '/preview'))
        : (_isProxied
            ? _proxyBase + '?driveId=' + encodeURIComponent(_driveFid) + '&type=' + (isGoogleSheet ? 'sheet' : 'doc') + (editMode ? '&edit=1' : '') +
              // v3.39.6-erpcontent: prefer the ERP's own stored copy (?erp=1) for the
              // inline view, so what the user sees is the same copy they can edit/save.
              ((_erpId && /^(up_|copied_)/.test(_erpId)) ? '&erp=1' : '')
            : _rawEmbedUrl));

// v3.39.6-erpcontent: when there is no Google embed URL (hasEmbed=false) but the
// doc is an ERP-copied doc (up_/copied_), build a same-origin proxy URL (?erp=1)
// that renders the ERP's own stored content INSIDE the modal — this is the
// "edit embedded modal" path, replacing the dead-end "Документът е готов /
// изтеглете или отворете в Drive" message for attached Drive templates.
// Pass both the synthetic ERP id (driveId) and the real Drive id (fid) so the
// proxy can fall back to a Google export of the template if no ERP copy exists.
var erpEmbedSrc = (!hasEmbed && _canEditErp)
    ? _proxyBase + '?erp=1&driveId=' + encodeURIComponent(_erpId) + '&fid=' + encodeURIComponent(_driveFid) + '&type=' + (isGoogleSheet ? 'sheet' : 'doc')
    : '';

// ── CSP violation detection ──
// Google Docs/Drive sends 'frame-ancestors' CSP that blocks framing on any
// site except drive.google.com. Standard iframe error events don't fire for
// CSP violations — we must listen for SecurityPolicyViolationEvent.
// v3.39.5-proxy: When using the proxy (_isProxied), CSP doesn't apply —
// the response comes from our own domain. Skip CSP detection entirely.
useEffect(function(){
  if(!hasEmbed||useTextEditor||_isProxied||_useOfficialPreview)return;
  var onCsp=function(ev){
    if(!ev||!ev.blockedURI)return;
    // Only handle violations for our embed URLs (Google Drive/Docs)
    if(ev.blockedURI.indexOf('google')>=0||ev.blockedURI.indexOf('drive')>=0||
       ev.blockedURI.indexOf('docs')>=0||ev.blockedURI.indexOf('accounts')>=0){
      _cspDetectedRef.current=true;
      setCspBlocked(true);
      setIframeLoading(false);
      setIframeError(true);
    }
  };
  document.addEventListener('securitypolicyviolation',onCsp);
  return function(){document.removeEventListener('securitypolicyviolation',onCsp);};
},[hasEmbed,useTextEditor]);

// ── Fast CSP check: if contentWindow is null right after setting src, CSP blocked us ──
// v3.39.5-proxy: Skip for proxied URLs (same-origin, no CSP).
useEffect(function(){
  if(!hasEmbed||!iframeRef.current||useTextEditor||cspBlocked||_isProxied||_useOfficialPreview)return;
  // Check contentWindow synchronously after src is set — if null, CSP blocked
  var fastCheck=setTimeout(function(){
    if(!iframeRef.current)return;
    try{
      if(iframeRef.current.contentWindow===null&&!_cspDetectedRef.current){
        _cspDetectedRef.current=true;
        setCspBlocked(true);
        setIframeLoading(false);
        setIframeError(true);
      }
    }catch(_){
      if(!_cspDetectedRef.current){
        _cspDetectedRef.current=true;
        setCspBlocked(true);
        setIframeLoading(false);
        setIframeError(true);
      }
    }
  },300);
  return function(){clearTimeout(fastCheck);};
},[hasEmbed,iframeSrc,useTextEditor,cspBlocked]);

// ── Track iframe load with error recovery & auto-retry ──
// v3.39.5-proxy: For proxied URLs (same-origin, no CSP) use longer timeout (12s)
// because the proxy may need 5-15s to fetch the Google Doc export on first call.
// For direct Google URLs (unlikely now) use 4s — CSP blocks immediately.
// When CSP is detected, auto-open in new tab as fallback.
var _iframeTimeout = _isProxied ? 12000 : (_useOfficialPreview ? 8000 : 4000);
useEffect(function(){
  if(!hasEmbed||!iframeRef.current||useTextEditor||cspBlocked)return;
  setIframeLoading(true);
  setIframeError(false);
  var timeout=setTimeout(function(){
    setIframeLoading(false);
    setIframeError(true);
    // CSP violations don't always fire securitypolicyviolation, so also check
    // for fast failure: if the iframe contentWindow is inaccessible, it's CSP
    if(!_cspDetectedRef.current){
      try{
        if(iframeRef.current&&iframeRef.current.contentWindow===null){
          _cspDetectedRef.current=true;
          setCspBlocked(true);
        }
      }catch(_){_cspDetectedRef.current=true;setCspBlocked(true);}
    }
    // v12.32.48-ux: no auto-retry loop — show the actionable error state and
    // let the user retry manually ("Опитай отново") or open in a new tab.
  },_iframeTimeout);
  var onLoad=function(){setIframeLoading(false);clearTimeout(timeout);_retryCountRef.current=0;};
  var onError=function(){setIframeLoading(false);setIframeError(true);clearTimeout(timeout);};
  var el=iframeRef.current;
  el.addEventListener('load',onLoad);
  el.addEventListener('error',onError);
  return function(){el.removeEventListener('load',onLoad);el.removeEventListener('error',onError);clearTimeout(timeout);if(_ieNestedTimerRef.current){clearTimeout(_ieNestedTimerRef.current);_ieNestedTimerRef.current=null;}};
},[hasEmbed,iframeSrc,retryKey,useTextEditor,editMode,cspBlocked]);

// ── v3.39.11-officetext: Auto-open the in-system editor for ERP-owned
// docs that have NO usable Google embed (office/pdf templates). Previously
// these dead-ended on the "Прегледът не е наличен" card. Now we load
// the ERP's own content copy (or the proxy-extracted text) straight into the
// editable textarea, so the modal VISUALISES + EDITS the document.
useEffect(function(){
  if(!_canEditErp)return;
  if(hasEmbed)return;                 // real Google embed available — use it
  if(useTextEditor)return;           // already in text mode
  // v12.46.0-fix: never auto-open binary content (Base64 strings from .docx/.xlsx)
  // in the text editor — that dumps a huge unreadable string. Instead, let the
  // fallback renderer (UEVDocViewer / "Open in Drive") handle it.
  if(_contentIsBinary){
    setEditMode(false);
    setUseTextEditor(false);
    setIframeLoading(false);
    setIframeError(false);
    return;
  }
  if(doc.content&&doc.content.trim()){ // ERP copy present — show it immediately
    setTextContent(doc.content);
    setUseTextEditor(true);
    setEditMode(true);
    setIframeLoading(false);
    setIframeError(false);
    return;
  }
  // No local copy: pull from the proxy (?erp=1, which extracts office text
  // when no stored copy exists) exactly like the manual "Редактирай в системата".
  handleLoadErpContent();
},[_canEditErp,hasEmbed,useTextEditor,doc.content,handleLoadErpContent]);
var handleToggleMode=useCallback(function(){
  if(editMode){
    // Switching from edit → preview
    setEditMode(false);
    setIframeLoading(true);
    setIframeError(false);
    _retryCountRef.current=0;
    setRetryKey(0);
  } else {
    // Switching from preview → edit
    // v12.54.15-fix: Google blocks /edit framing, so for Google docs we open
    // the native Google editor in a new tab instead of framing the proxy
    // (which only serves read-only content). ERP-content docs use the textarea.
    if(_driveFid && isGoogleDoc && !isGoogleSheet && embedEditUrl && /^https:\/\/(docs|drive|accounts)\.google\.com/i.test(embedEditUrl)){
      window.open(embedEditUrl,'_blank','noopener,noreferrer');
      return;
    }
    if(_driveFid && isGoogleSheet && embedEditUrl && /^https:\/\/(docs|drive|accounts)\.google\.com/i.test(embedEditUrl)){
      window.open(embedEditUrl,'_blank','noopener,noreferrer');
      return;
    }
    setEditMode(true);
    setIframeLoading(true);
    setIframeError(false);
    _retryCountRef.current=0;
    setRetryKey(0);
  }
},[editMode]);

// ── Text editor: save content ──
var handleTextSave=useCallback(function(){
  if(_canEditErp){handleErpSave();return;}
  if(!onSaved||!formId||!doc.id)return;
  setSaving(true);
  var updatedDoc=Object.assign({},doc,{content:textContent,_textEdited:true});
  Promise.resolve(onSaved(updatedDoc))
    .then(function(){_dirtyRef.current=false;setDirty(false);ieClose();try{window._refreshAllDocuments&&window._refreshAllDocuments(true);}catch(_){}})
    .catch(function(err){toast(err.message||'Грешка при запис','error');setSaving(false);});
},[onSaved,formId,doc,textContent,ieClose]);

// ── "Запази" handler — saves metadata & refreshes parent ──
const handleSave=useCallback(function(){
  if(useTextEditor || _docTypeKey==='textLike' || isTextLike){handleTextSave();return;}
  if(useTextEditor && _canEditErp){handleErpSave();return;}
  setSaving(true);
  var p=Promise.resolve();
  if(onSaved&&formId&&doc.id){
    // v10.0.0-edit-ux: Pass the FULL doc (with all metadata) to onSaved,
    // so the parent can update its state without losing driveId/googleDocEditLink/etc.
    p=Promise.resolve(onSaved(_serializeDoc(doc)));
  }
  p.then(function(){ieClose();try{window._refreshAllDocuments&&window._refreshAllDocuments(true);}catch(_){}})
    .catch(function(err){toast(err.message||'Грешка при запис','error');setSaving(false);});
},[onSaved,formId,doc,ieClose,useTextEditor,handleTextSave]);

// ── Keyboard shortcut: Ctrl+S / Cmd+S to save ──
useEffect(function(){
  var handler=function(ev){
    if((ev.ctrlKey||ev.metaKey)&&ev.key==='s'){
      ev.preventDefault();
      if(!saving)handleSave();
    }
  };
  window.addEventListener('keydown',handler);
  return function(){window.removeEventListener('keydown',handler);};
},[handleSave,saving]);

const handleClose=useCallback(function(){var f=safeCloseRef.current;if(typeof f==='function')f();},[]);

// dirty ref (sync, read in safeClose without stale closure)
var _dirtyRef=useRef(false);

// ── v3.39.6-erpcontent: Inline edit of the ERP's own content copy ──
// Google blocks /edit framing, so true Google editing in-modal is impossible.
// Workaround: edit the ERP's authoritative copy (documents.content) — the same
// copy the proxy serves for inline visualisation (?erp=1). This gives real
// "edit inside the modal" without fighting Google CSP.
var handleLoadErpContent=useCallback(function(){
  if(!_erpId)return; // v3.39.11: any ERP-owned id (plain up_/copied_/F6AC69C46) — not just up_/copied_
  // v12.47.4-bin: binary OFFICE/PDF containers are NEVER plain-text-editable,
  // even if doc.content is empty at init (the proxy would return the base64
  // docx bytes and the editor would dump it). Fall back to the official
  // Google Drive /preview, which renders .docx/.xlsx inline.
  if(_contentIsBinary||isBinaryOffice){
    if(_driveFid){
      var preview='https://drive.google.com/file/d/'+encodeURIComponent(_driveFid)+'/preview';
      setDrivePreviewOverride(preview);
      setUseTextEditor(false);
      setEditMode(false);
    }
    setIframeLoading(false);
    setLoadingErp(false);
    return;
  }
  setLoadingErp(true);
  var p = doc.content && doc.content.trim()
    ? Promise.resolve(doc.content)
    : fetch(_proxyBase + '?erp=1&driveId=' + encodeURIComponent(_erpId) + (_driveFid?('&fid='+encodeURIComponent(_driveFid)):''))
        // v3.39.13-stable: the proxy returns clean plain text (Docs txt / Sheets
        // csv) or a JSON no-content signal (binary office files with no inline
        // copy). Detect the JSON signal and do NOT dump it into the textarea —
        // instead fall back to the official Google Drive /preview, which renders
        // .docx/.xlsx inline fine (only /edit is CSP-blocked).
        .then(function(r){
          var ct = r.headers.get('Content-Type') || '';
          if (r.headers.get('X-Erp-NoContent') === '1' || /application\/json/i.test(ct)) {
            return r.json().then(function(j){
              if (j && j.hasContent === false) return {__noContent:true, driveId: j.driveId || _driveFid};
              return {__text: ''};
            }).catch(function(){ return {__noContent:true, driveId:_driveFid}; });
          }
          return r.text().then(function(t){ return {__text: t || ''}; });
        })
        .then(function(res){
          if (res && res.__noContent) {
            // No inline ERP copy (binary office file). Use the stable official
            // Drive preview iframe instead of a broken/junk text editor.
            if (res.driveId) {
              var preview = 'https://drive.google.com/file/d/' + encodeURIComponent(res.driveId) + '/preview';
              setDrivePreviewOverride(preview);  // stable official Drive preview for office files
              setUseTextEditor(false);
              setEditMode(false);
              setIframeError(false);
              setCspBlocked(false);
            }
            setIframeLoading(false);
            setLoadingErp(false);
            return;
          }
          return res.__text || '';
        })
        .catch(function(){return doc.content||'';});
  p.then(function(txt){
    if (txt === undefined) return; // no-content branch already handled above
    setTextContent(txt||'');
    setUseTextEditor(true);
    setIframeLoading(false);
    setIframeError(false);
    setCspBlocked(false);
    setEditMode(true);
  }).finally(function(){setLoadingErp(false);});
},[_erpId,_driveFid,doc.content]);

// ── v3.39.6-erpcontent: Persist edited ERP copy to MySQL via savedocumentcontent ──
var handleErpSave=useCallback(function(){
  if(!_erpId)return; // v3.39.11: any ERP-owned id, not just up_/copied_
  setSaving(true);
  return api('savedocumentcontent',{
      docId:_erpId, formId:formId, content:textContent,
      name:doc.name||'Document', mimeType:doc.mimeType||'text/plain',
      userId:doc.userEmail||''
    })
    .then(function(){
      _dirtyRef.current=false; setDirty(false);
      try{document.dispatchEvent(new CustomEvent('erp:doc-content-saved',{detail:{id:_erpId}}));}catch(_){}
      try{window._refreshAllDocuments&&window._refreshAllDocuments(true);}catch(_){}
      ieClose();
      if(typeof onSaved==='function') onSaved(Object.assign({},doc,{content:textContent,_textEdited:true}));
      toast('Промените са запазени в системата.','success');
    })
    .catch(function(err){toast(err&&err.message?err.message:'Грешка при запис','error');setSaving(false);});
},[_erpId,formId,textContent,doc,ieClose]);

// ── v12.47.0-autosave: silent debounced autosave (applicant side) ──────────
// Google's own editors autosave; the ERP textarea path must match that so an
// applicant never loses work and never has to hunt for "Запази". Fires 1.5s
// after typing stops, POSTs the SAME savedocumentcontent action as the manual
// save, but NEVER closes the modal and NEVER toasts (silent-UX rule). The
// manual button and save-on-close remain as the explicit/last-resort paths.
const[autosaveState,setAutosaveState]=useState('');   // ''|'saving'|'saved'|'error'
const _autosaveTimer=useRef(null);
const _autosaveInFlight=useRef(false);
const _autosaveLast=useRef('');
const autosaveNow=useCallback(function(){
  if(!_erpId||!_canEditErp||_autosaveInFlight.current)return;
  if(textContent===undefined||textContent===_autosaveLast.current)return;
  var _snapshot=textContent;
  _autosaveInFlight.current=true;
  setAutosaveState('saving');
  api('savedocumentcontent',{docId:_erpId,formId:formId,content:_snapshot,
      name:doc.name||'Document',mimeType:doc.mimeType||'text/plain',
      userId:doc.userEmail||''})
    .then(function(){
      _autosaveLast.current=_snapshot;
      // Only clear the dirty flag when no further keystrokes landed mid-flight,
      // otherwise save-on-close would drop the newest edit.
      if(_snapshot===textContent){_dirtyRef.current=false;setDirty(false);}
      setAutosaveState('saved');
      try{document.dispatchEvent(new CustomEvent('erp:doc-content-saved',{detail:{id:_erpId,autosave:true}}));}catch(_){}
    })
    .catch(function(){setAutosaveState('error');})
    .finally(function(){_autosaveInFlight.current=false;});
},[_erpId,_canEditErp,formId,textContent,doc]);
useEffect(function(){
  if(!dirty||!_canEditErp||!useTextEditor)return;
  if(_autosaveTimer.current)clearTimeout(_autosaveTimer.current);
  _autosaveTimer.current=setTimeout(autosaveNow,1500);
  return function(){if(_autosaveTimer.current)clearTimeout(_autosaveTimer.current);};
},[dirty,textContent,_canEditErp,useTextEditor,autosaveNow]);
// Flush on tab-hide / unload so a closed laptop never loses the last edit.
useEffect(function(){
  if(!_canEditErp)return;
  var flush=function(){if(_dirtyRef.current)autosaveNow();};
  document.addEventListener('visibilitychange',flush);
  window.addEventListener('pagehide',flush);
  return function(){
    document.removeEventListener('visibilitychange',flush);
    window.removeEventListener('pagehide',flush);
  };
},[_canEditErp,autosaveNow]);
const autosaveLabel=autosaveState==='saving'?'Записване…'
  :autosaveState==='saved'?'Запазено автоматично'
  :autosaveState==='error'?'Неуспешен автозапис — ще опитаме отново':'';

// ── v3.39.12-saveonclose: NEVER lose the user's edit ──
// Closing the modal (X, Esc, overlay click) while there are unsaved edits must
// flush the save FIRST, then close. This fixes the bug where an applicant edits
// a document, then quickly closes the modal and the document is lost.
const safeClose=useCallback(function(){
  var flush=function(){ if(typeof realOnClose==='function') realOnClose(); };
  if(dirty && _canEditErp && textContent!==undefined){
    setSaving(true);
    api('savedocumentcontent',{docId:_erpId,formId:formId,content:textContent,
        name:doc.name||'Document',mimeType:doc.mimeType||'text/plain',userId:doc.userEmail||''})
      .then(function(){
        _dirtyRef.current=false; setDirty(false);
        try{document.dispatchEvent(new CustomEvent('erp:doc-content-saved',{detail:{id:_erpId}}));}catch(_){}
        try{window._refreshAllDocuments&&window._refreshAllDocuments(true);}catch(_){}
        if(typeof onSaved==='function') onSaved(Object.assign({},doc,{content:textContent,_textEdited:true}));
        flush();
      })
      .catch(function(err){ toast(err&&err.message?err.message:'Грешка при запис','error'); setSaving(false); }); // keep modal open on error
    return;
  }
  if(dirty && !_canEditErp && useTextEditor && onSaved && formId && doc.id){
    setSaving(true);
    Promise.resolve(onSaved(Object.assign({},doc,{content:textContent,_textEdited:true})))
      .then(function(){ _dirtyRef.current=false; setDirty(false); try{window._refreshAllDocuments&&window._refreshAllDocuments(true);}catch(_){} flush(); })
      .catch(function(err){ toast(err&&err.message?err.message:'Грешка при запис','error'); setSaving(false); });
    return;
  }
  flush();
},[_erpId,formId,textContent,doc,onSaved,dirty,useTextEditor,realOnClose]);
// v12.32.7-tdzfix: keep the ref pointed at the latest safeClose so the
// useModalClose wrapper (declared above) always calls the current closure.
safeCloseRef.current=safeClose;


// ── Inline mode: render editor body directly (no portal, no overlay) ──

// ── Switch between iframe and text editor modes ──
var switchToTextEditor=useCallback(function(){
  if(isTextLike&&docContent){
    setTextContent(docContent);
    setUseTextEditor(true);
    setIframeLoading(false);
    setIframeError(false);
  }
},[isTextLike,docContent]);

// ── Inline mode: render editor body directly (no portal, no overlay) ──

// ── Document icon, color and capabilities (from lookup map) ──
var docIcon=_docMeta.icon;
var docIconColor=_docMeta.color;
var docTypeLabel=_docMeta.label;
var docCanEditLabel=editMode?'Редактиране':'Преглед';
var docTitle=docName||'Документ';

// ── Inline mode: render editor body directly (no portal, no overlay) ──
if(inline){
  return e('div',{className:'inline-doc-editor',style:{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'#f8f9fa'}},
    // ── Compact inline toolbar ──
    e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',padding:'.35rem .75rem',background:'var(--surface)',borderBottom:'1px solid var(--border)',flexShrink:0,flexWrap:'wrap'}},
      e('span',{style:{fontSize:'.72rem',fontWeight:600,color:'var(--ink)',display:'flex',alignItems:'center',gap:'.3rem',flex:'1 1 auto',minWidth:0}},
        e('i',{className:'fas '+docIcon,style:{fontSize:'.65rem',color:docIconColor}}),
        e('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},docTitle)
      ),
      (isGoogleDoc||isGoogleSheet)&&hasEmbed&&e('button',{type:'button',className:'btn '+(editMode?'btn-success':'btn-primary')+' btn-sm',onClick:handleToggleMode,style:{fontSize:'.65rem',padding:'.1rem .45rem',fontWeight:600}},
        editMode?e(Fragment,null,e('i',{className:'fas fa-eye'}),' Преглед'):e(Fragment,null,e('i',{className:'fas fa-edit'}),' Редактирай')
      ),
      canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline btn-sm',style:{fontSize:'.65rem',padding:'.1rem .45rem'}},e('i',{className:'fas fa-external-link-alt'}),' Drive'),
      // ── v12.47.0-gnative: Google's own controls for the embedded document ──
      gNative&&e('div',{className:'gnative-group',role:'group','aria-label':'Google контроли'},
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.comment)},title:'Коментари в Google','aria-label':'Коментари в Google'},e('i',{className:'fas fa-comment-dots'})),
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.suggest)},title:'Режим „Предлагане“ (проследени промени)','aria-label':'Режим Предлагане'},e('i',{className:'fas fa-pen-nib'})),
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.history)},title:'История на версиите','aria-label':'История на версиите'},e('i',{className:'fas fa-clock-rotate-left'})),
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.copy)},title:'Създай копие в Google Drive','aria-label':'Създай копие'},e('i',{className:'fas fa-copy'})),
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.print)},title:'Изтегли като PDF','aria-label':'Изтегли като PDF'},e('i',{className:'fas fa-file-pdf'}))
      ),
      // v12.32.48-nodownload: no download button in the inline editor toolbar
      isTextLike&&e('button',{type:'button',className:'btn '+(useTextEditor?'btn-primary':'btn-outline')+' btn-sm',onClick:function(){setUseTextEditor(!useTextEditor);},title:useTextEditor?'Преглед (визуализатор)':'Редактирай като текст',style:{fontSize:'.65rem',padding:'.1rem .45rem',fontWeight:600}},useTextEditor?e(Fragment,null,e('i',{className:'fas fa-eye'}),' Преглед'):e(Fragment,null,e('i',{className:'fas fa-edit'}),' Текст'))
    ),
    // ── Body (same as full modal body) ──
    e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',position:'relative',minHeight:0}},
      useTextEditor
      ? e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',padding:'.75rem',gap:'.5rem',overflow:'auto'}},
          e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.3rem',padding:'.3rem .55rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:4}},
            e('i',{className:'fas fa-info-circle',style:{fontSize:'.55rem',color:'var(--info)'}}),
            e('span',null,'Редактирайте съдържанието. Промените се запазват автоматично.'),
            autosaveLabel
              ? e('span',{className:'uev-autosave '+autosaveState,style:{marginLeft:'auto',fontSize:'.55rem',fontWeight:600}},autosaveLabel)
              : e('kbd',{style:{fontSize:'.55rem',padding:'.1rem .3rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:3,fontWeight:600,marginLeft:'auto'}},'Ctrl+S')
          ),
          e('textarea',{value:textContent,onChange:function(ev){setTextContent(ev.target.value);_dirtyRef.current=true;setDirty(true);},
            style:{flex:'1 1 0%',width:'100%',border:'1px solid var(--border)',borderRadius:4,padding:'.55rem .65rem',fontSize:'.78rem',fontFamily:'Consolas,Menlo,monospace',lineHeight:1.6,resize:'none',background:'var(--surface)',minHeight:150,outline:'none'},
            placeholder:'Съдържанието...'})
        )
      : driveGone
      ? e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.5rem',padding:'1.5rem',textAlign:'center'}},
          e('div',{style:{width:48,height:48,borderRadius:'50%',background:'var(--warn-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',color:'var(--warn)'}},e('i',{className:'fas fa-trash-alt'})),
          e('h4',{style:{margin:'0',fontSize:'.95rem',color:'var(--ink)'}},'Документът е премахнат'),
          e('p',{style:{margin:0,fontSize:'.74rem',color:'var(--ink-3)',maxWidth:340}},
            'Файлът в Google Диск, към който сочи този документ, е изтрит или преместен от собственика. Съдържанието не може да се зареди тук.'),
          canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline btn-sm',style:{marginTop:'.3rem'}},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Диск')
        )
      : hasEmbed
      ? e(Fragment,null,
          iframeLoading&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.6rem',padding:'1.5rem'}},
            e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem'}},e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'1rem',color:'var(--primary)'}}),e('span',{style:{fontSize:'.8rem',color:'var(--ink-2)',fontWeight:600}},'Зареждане…')),
            retryKey>0&&e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){setRetryKey(function(k){return k+1;});setIframeLoading(true);setIframeError(false);_retryCountRef.current=0;}},e('i',{className:'fas fa-redo'}),' Опитай отново')
          ),
          iframeError&&!iframeLoading&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.4rem',padding:'1.5rem'}},
            e('div',{style:{width:44,height:44,borderRadius:'50%',background:'var(--warn-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem',color:'var(--warn)'}},e('i',{className:'fas fa-exclamation-triangle'})),
            e('h4',{style:{margin:0,fontSize:'.9rem',color:'var(--ink)'}},'Не може да се зареди'),
            e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',justifyContent:'center'}},
              e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){setRetryKey(function(k){return k+1;});setIframeLoading(true);setIframeError(false);_retryCountRef.current=0;}},e('i',{className:'fas fa-redo'}),' Опитай отново'),
              canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm'},e('i',{className:'fas fa-external-link-alt'}),' Отвори')
            )
          ),
          !iframeError&&!useTextEditor&&e('iframe',{ref:iframeRef,key:retryKey,src:iframeSrc,
            style:{border:'none',flex:'1 1 0%',minHeight:0,background:'var(--surface)',display:iframeLoading?'none':'block'},
            title:docTitle,
            sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation allow-popups-to-escape-sandbox',
            allow:'autoplay; clipboard-write; camera; microphone; display-capture'})
        )
      : e(Fragment,null,
          (function(){
            var _fallbackUrl=doc.previewLink||doc.webViewLink||'';
            // v12.30.2-modalux: Google/Drive-hosted fallback URLs are CSP-blocked
            // and never fire onError, so the iframe hangs forever. Skip the doomed
            // embed and route to an actionable "Отвори" state (parity with
            // InlineDocEditorModal).
            if(_fallbackUrl&&/^https:\/\/(docs|drive|accounts)\.google\.com/i.test(_fallbackUrl)){
              return e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',padding:'1.5rem',gap:'.5rem'}},
                e('div',{style:{width:48,height:48,borderRadius:'50%',background:docIconColor+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',color:docIconColor}},e('i',{className:'fas '+docIcon})),
                e('h4',{style:{margin:0,fontSize:'.85rem',color:'var(--ink)'}},isGoogleDoc||isGoogleSheet?'Google '+(isGoogleSheet?'Sheets':'Docs'):'Документ'),
                e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',justifyContent:'center'}},
                  e('a',{href:_fallbackUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm'},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive'),
                  canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline btn-sm'},e('i',{className:'fas fa-edit'}),' Отвори за редакция')
                )
              );
            }
            if(_fallbackUrl){
              return e('iframe',{src:_fallbackUrl,
                style:{border:'none',flex:'1 1 0%',minHeight:0,background:'var(--surface)'},
                title:docTitle,
                sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation allow-popups-to-escape-sandbox',
                allow:'autoplay; clipboard-write; camera; microphone; display-capture'});
            }
            if(isTextLike&&docContent){
              if(uevIsHtml(docContent)){
                // v12.32.15-docrender: reuse the self-contained Google-Docs-styled
                // visualizer (images/seals/tables visible, XSS-sanitized).
                return e('div',{style:{flex:'1 1 0%',overflow:'auto',padding:'.75rem',background:'#f1f3f4',display:'flex',justifyContent:'center'}},
                  UevDocRender(docContent)
                );
              }
              return e('div',{style:{flex:'1 1 0%',overflow:'auto',padding:'.75rem',background:'var(--surface)'}},
                e('pre',{style:{whiteSpace:'pre-wrap',wordWrap:'break-word',fontFamily:'Consolas,Menlo,monospace',fontSize:'.78rem',lineHeight:1.6,margin:0,color:'var(--ink)'}},docContent)
              );
            }
            if(isImage&&doc.downloadUrl){
              return e('div',{style:{flex:'1 1 0%',display:'flex',alignItems:'center',justifyContent:'center',padding:'.75rem',background:'#f5f5f5'}},
                e('img',{src:doc.downloadUrl,alt:docName,
                  style:{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:4},
                  onError:function(ev){ev.target.style.display='none';}})
              );
            }
            // v3.39.10-inline-edit: text docs get a live inline textarea here too
            if(_docTypeKey==='textLike' || isTextLike){
              if(!textContent && docContent){setTextContent(docContent);}
              return e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',padding:'.75rem',gap:'.5rem',overflow:'auto',background:'#f8f9fa'}},
                e('textarea',{value:textContent,onChange:function(ev){setTextContent(ev.target.value);_dirtyRef.current=true;setDirty(true);},
                  style:{flex:'1 1 0%',width:'100%',border:'1px solid var(--border)',borderRadius:4,padding:'.55rem .65rem',fontSize:'.78rem',fontFamily:'Consolas,Menlo,monospace',lineHeight:1.6,resize:'none',background:'var(--surface)',minHeight:150,outline:'none'},
                  placeholder:'Съдържанието на документа...'})
              );
            }
            return e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',padding:'1.5rem',gap:'.5rem'}},
              e('div',{style:{width:48,height:48,borderRadius:'50%',background:docIconColor+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',color:docIconColor}},e('i',{className:'fas '+docIcon})),
              e('h4',{style:{margin:0,fontSize:'.85rem',color:'var(--ink)'}},isGoogleDoc||isGoogleSheet?'Google '+(isGoogleSheet?'Sheets':'Docs'):'Документ'),
              canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm'},e('i',{className:'fas fa-external-link-alt'}),' Отвори за редакция')
            );
          })()
        )
    ),
    // ── Compact inline footer ──
    e('div',{style:{display:'flex',gap:'.4rem',padding:'.35rem .75rem',background:'var(--surface)',borderTop:'1px solid var(--border)',flexShrink:0,alignItems:'center'}},
      e('span',{style:{fontSize:'.62rem',color: dirty?'var(--warn)':'var(--ink-4)',flex:'1 1 auto',display:'flex',alignItems:'center',gap:'.25rem'}},
        dirty&&e('span',{style:{width:6,height:6,borderRadius:'50%',background:'var(--warn)',display:'inline-block'}}),
        dirty?'Незапазени промени':(cspBlocked?'Google блокира вградения преглед. Използвайте „Отвори“, за да отворите документа.':(editMode?(isGoogleDoc||isGoogleSheet?'Google '+(isGoogleSheet?'Sheets':'Docs')+' — авто-запаз':'Преглед'):'Режим преглед'))
      ),
      e('button',{className:'btn btn-primary btn-sm',onClick:handleSave,disabled:saving,style:{fontSize:'.7rem',padding:'.18rem .7rem',fontWeight:600}},
        saving?e(Fragment,null,e('i',{className:'fas fa-spinner fa-spin',style:{marginRight:'.2rem'}}),' Запазване…'):e(Fragment,null,e('i',{className:'fas fa-save',style:{marginRight:'.2rem'}}),' Запази')
      )
    )
  );
}

return _portal(e('div',{className:'modal-overlay doc-viewer-overlay'+(ieClosing?' closing':''),...ieOverlayHandlers,role:'dialog','aria-modal':'true','aria-label':docTitle},
  e('div',{className:'modal-box fullscreen'+(ieClosing?' closing':''),onClick:function(ev){ev.stopPropagation();}},
  // ── HEADER ──
  e('div',{className:'modal-head',style:{display:'flex',alignItems:'center',gap:'.6rem',flexWrap:'wrap'}},
    e('div',{style:{display:'flex',alignItems:'center',gap:'.6rem',minWidth:0,flex:'1 1 auto',overflow:'hidden'}},
      e('div',{style:{width:36,height:36,borderRadius:8,background:docIconColor+'18',color:docIconColor,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'1rem'}},
        e('i',{className:'fas '+docIcon})
      ),
      e('div',{style:{minWidth:0}},
        e('h3',{style:{fontSize:'.95rem',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},docTitle),
      )
    ),
    e('div',{className:'doc-viewer-actions',style:{display:'flex',gap:'.35rem',flexShrink:0,alignItems:'center'}},
      // ── MODE TOGGLE: Preview ↔ Edit (only for Google Docs/Sheets) ──
      (isGoogleDoc||isGoogleSheet)&&hasEmbed&&e('button',{type:'button',className:'btn '+(editMode?'btn-success':'btn-primary')+' btn-sm',onClick:handleToggleMode,title:editMode?'Превключи към преглед':'Превключи към редакция',style:{fontSize:'.72rem',fontWeight:600,display:'flex',alignItems:'center',gap:'.25rem'}},
        editMode?e(Fragment,null,e('i',{className:'fas fa-eye'}),' Преглед'):e(Fragment,null,e('i',{className:'fas fa-edit'}),' Редактирай')
      ),
      // ── External edit link (always available for Google Docs) ──
      canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline btn-sm',title:'Отвори за редакция в Google Drive (нов раздел)',style:{fontSize:'.72rem'}},e('i',{className:'fas fa-external-link-alt',style:{fontSize:'.6rem'}}),' Google Drive'),
      // ── v12.47.0-gnative: Google's own controls (Docs/Sheets only) ──
      gNative&&e('div',{className:'gnative-group',role:'group','aria-label':'Google контроли'},
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.comment)},title:'Коментари в Google','aria-label':'Коментари в Google'},e('i',{className:'fas fa-comment-dots'})),
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.suggest)},title:'Режим „Предлагане“ (проследени промени)','aria-label':'Режим Предлагане'},e('i',{className:'fas fa-pen-nib'})),
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.history)},title:'История на версиите','aria-label':'История на версиите'},e('i',{className:'fas fa-clock-rotate-left'})),
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.copy)},title:'Създай копие в Google Drive','aria-label':'Създай копие'},e('i',{className:'fas fa-copy'})),
        e('button',{type:'button',className:'gnative-btn',onClick:function(){_gnOpen(gNative.print)},title:'Изтегли като PDF','aria-label':'Изтегли като PDF'},e('i',{className:'fas fa-file-pdf'}))
      ),
      // v12.38.2-edit: "Редактирай в системата" ERP-textarea button removed —
      // editing now uses the native Google editor (Редактирай / Отвори за
      // редакция), never a raw string dump. handleLoadErpContent is retained
      // only for genuine plain-text ERP docs.
      // v12.32.48-nodownload: remove the explicit download button from the
      // toolbar — visualization is the primary action; users open in Drive.
      isTextLike&&e('button',{type:'button',className:'btn '+(useTextEditor?'btn-primary':'btn-outline')+' btn-sm',onClick:function(){setUseTextEditor(!useTextEditor);},title:useTextEditor?'Преглед (визуализатор)':'Редактирай като текст',style:{fontSize:'.72rem',display:'flex',alignItems:'center',gap:'.25rem'}},useTextEditor?e(Fragment,null,e('i',{className:'fas fa-eye',style:{fontSize:'.6rem'}}),' Преглед'):e(Fragment,null,e('i',{className:'fas fa-edit',style:{fontSize:'.6rem'}}),' Текст')),
      // v12.47.0-gnative: Detach (Отделяне) — pop out to Google Drive standalone.
      gNative&&e('button',{type:'button',className:'gnative-btn',title:'Отделяне (отвори в собствен прозорец)',onClick:function(){if(gNative.copy)window.open(gNative.copy,'_blank','noopener,noreferrer');}},e('i',{className:'fas fa-external-link-square-alt'}),' Отделяне'),
      // ── Close ──
      e('button',{className:'close-btn',onClick:handleClose,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
    )
  ),
  // ── BODY ──
  e('div',{className:'modal-body',style:{display:'flex',flexDirection:'column',padding:0,position:'relative',background:'#f8f9fa'}},
    // ── Text editor mode ──
    useTextEditor && !_contentIsBinary && !isBinaryOffice
    ? e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',padding:'1rem',gap:'.5rem',overflow:'auto'}},
        e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.35rem',padding:'.35rem .6rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:6,flexWrap:'wrap'}},
          e('i',{className:'fas fa-info-circle',style:{fontSize:'.6rem',color:'var(--info)'}}),
          e('span',null,'Редактирайте съдържанието на документа в полето по-долу. Промените се запазват автоматично.'),
          autosaveLabel
            ? e('span',{className:'uev-autosave '+autosaveState,style:{marginLeft:'auto',fontSize:'.6rem',fontWeight:600}},autosaveLabel)
            : e('kbd',{style:{fontSize:'.6rem',padding:'.12rem .35rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:4,fontWeight:600,marginLeft:'auto'}},'Ctrl+S за запис')
        ),
        e('textarea',{value:textContent,onChange:function(ev){setTextContent(ev.target.value);_dirtyRef.current=true;setDirty(true);},
          style:{flex:'1 1 0%',width:'100%',border:'1px solid var(--border)',borderRadius:6,padding:'.65rem .75rem',fontSize:'.82rem',fontFamily:'Consolas,Menlo,monospace',lineHeight:1.6,resize:'none',background:'var(--surface)',minHeight:200,outline:'none'},
          placeholder:'Съдържанието на документа...'})
      )
    // ── Embed mode (iframe) ──
    : driveGone
    ? e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.5rem',padding:'1.5rem',textAlign:'center'}},
        e('div',{style:{width:48,height:48,borderRadius:'50%',background:'var(--warn-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',color:'var(--warn)'}},e('i',{className:'fas fa-trash-alt'})),
        e('h4',{style:{margin:'0',fontSize:'.95rem',color:'var(--ink)'}},'Документът е премахнат'),
        e('p',{style:{margin:0,fontSize:'.74rem',color:'var(--ink-3)',maxWidth:340}},
          'Файлът в Google Диск, към който сочи този документ, е изтрит или преместен от собственика. Съдържанието не може да се зареди тук.'),
        canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline btn-sm',style:{marginTop:'.3rem'}},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Диск')
      )
    : hasEmbed
    ? e(Fragment,null,
        // Loading overlay
        iframeLoading&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'1rem',padding:'2rem'}},
          e('div',{style:{width:56,height:56,borderRadius:14,background:'linear-gradient(90deg,var(--bg-2) 0%,var(--surface) 50%,var(--bg-2) 100%)',backgroundSize:'200% 100%',animation:'cbShimmer 1.4s linear infinite',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.6rem',color:'var(--ink-4)'}},e('i',{className:'fas '+docIcon})),
          e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem'}},e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'1.1rem',color:'var(--primary)'}}),e('span',{style:{fontSize:'.9rem',color:'var(--ink-2)',fontWeight:600}},editMode?(isGoogleDoc||isGoogleSheet?'Зареждане на редактора…':'Зареждане на документа…'):'Зареждане на прегледа…')),
          e('span',{style:{fontSize:'.68rem',color:'var(--ink-5)',textAlign:'center',maxWidth:340,lineHeight:1.4}},'Това може да отнеме няколко секунди при първо отваряне.'),
          e('div',{style:{width:160,maxWidth:'60%',height:3,background:'var(--bg-2)',borderRadius:3,overflow:'hidden'}},e('div',{style:{width:'40%',height:'100%',background:'var(--primary)',borderRadius:3,animation:'ie-loading-bar 1.8s ease-in-out infinite'}})),
          retryKey>0&&e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){setRetryKey(function(k){return k+1;});setIframeLoading(true);setIframeError(false);_retryCountRef.current=0;},style:{marginTop:'.15rem'}},e('i',{className:'fas fa-redo'}),' Опитай отново'),
          isTextLike&&docContent&&!retryKey&&e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:switchToTextEditor,style:{marginTop:'.05rem'}},e('i',{className:'fas fa-file-alt'}),' Редактирай като текст')
        ),
        // Error state — CSP blocked or iframe failed
        iframeError&&!iframeLoading&&e(Fragment,null,
          (function(){
            // v12.32.48-ux: NO automatic new-tab/download on CSP block. The
            // fire-and-forget window.open(directEditUrl) popped a new tab (or a
            // download for binary docs) the instant the modal opened — users
            // experienced it as an automatic download. Opening a document is
            // now 100% user-initiated via the "Отвори за редакция" button.
            return e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.5rem',padding:'2rem'}},
              e('div',{style:{width:56,height:56,borderRadius:'50%',background:'var(--warn-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem',color:'var(--warn)'}},e('i',{className:'fas '+(cspBlocked?'fa-lock':'fa-exclamation-triangle')})),
              e('h4',{style:{margin:'.25rem 0 0',fontSize:'1rem',color:'var(--ink)'}},cspBlocked?'Google блокира вградения преглед':'Документът не може да се зареди'),
              e('p',{style:{fontSize:'.78rem',color:'var(--ink-3)',textAlign:'center',maxWidth:380,lineHeight:1.5,margin:'.2rem 0'}},cspBlocked
                ?'Google Drive/Docs не позволява вграждане в панела поради защитна политика. Използвайте бутона по-долу, за да отворите документа.'
                :(isGoogleDoc||isGoogleSheet?'Google '+(isGoogleSheet?'Sheets':'Docs')+' блокира вградения редактор.':'Файлът не може да бъде показан в панела.')),
              e('div',{style:{display:'flex',gap:'.5rem',marginTop:'.25rem',flexWrap:'wrap',justifyContent:'center'}},
                !cspBlocked&&e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){setCspBlocked(false);handleToggleMode();setRetryKey(function(k){return k+1;});setIframeLoading(true);setIframeError(false);_retryCountRef.current=0;}},e('i',{className:'fas fa-redo'}),' Опитай отново'),
                canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary'},e('i',{className:'fas fa-external-link-alt'}),' Отвори за редакция'),
                isTextLike&&docContent&&e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:switchToTextEditor},e('i',{className:'fas fa-file-alt'}),' Редактирай като текст')
              )
            );
          })()
        ),
        // Iframe (only rendered when NOT CSP-blocked)
        !iframeError&&!useTextEditor&&!cspBlocked&&e('iframe',{ref:iframeRef,key:retryKey,src:iframeSrc,
          style:{border:'none',flex:'1 1 0%',minHeight:0,background:'var(--surface)',borderRadius:0,display:iframeLoading?'none':'block'},
          title:docTitle,
          sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation allow-popups-to-escape-sandbox',
          allow:'autoplay; clipboard-write; camera; microphone; display-capture'})
      )
    // ── No embed URL — try fallback preview (previewLink, webViewLink, image inline, text) ──
    : e(Fragment,null,
        // Fallback iframe for docs with a previewLink / webViewLink
        (function(){
          // v12.32.39-universal: byte-level full-visual render (Word/Excel/PDF/
          // image via UEVDocViewer) — replaces every dead-end card whenever the
          // backend can produce bytes (DB → GAS → drive-direct).
          if(ieFullViz&&!editMode&&!useTextEditor){
            return e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',position:'relative',minHeight:0,overflow:'auto',background:'#f1f3f4',padding:'.75rem'}},
              ieFullVizBusy&&e('div',{style:{position:'absolute',inset:0,zIndex:2,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(241,243,244,.85)',flexDirection:'column',gap:'.5rem'}},
                e('i',{className:'fas fa-spinner fa-spin',style:{fontSize:'1.8rem',color:'var(--ink-4)'}}),
                e('span',{style:{fontSize:'.8rem',color:'var(--ink-3)'}},'Визуализация на документа…')),
              e('div',{ref:ieFullVizRef,className:'uev-viewer',style:{textAlign:'left'}}),
              ieFullVizFailed&&!ieFullVizBusy&&(
                // v12.49.86-deadpagefix: gate Google embed on !driveGone — a
                // trashed/deleted Drive file's /preview renders Google's own dead
                // page which JS can never read, so keep it empty when gone.
                (_driveFid&&_driveFid.length>=25&&!driveGone)
                ?e('div',{style:{position:'absolute',inset:0,zIndex:3,display:'flex',flexDirection:'column',background:'var(--surface)',overflow:'hidden'}},
                  e('div',{style:{flex:'1 1 auto',minHeight:0}},
                    e('iframe',{src:(isGoogleSheet
                        ? 'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(_driveFid)+'/preview'
                        : isGoogleDoc
                          ? 'https://docs.google.com/document/d/'+encodeURIComponent(_driveFid)+'/preview'
                          : /drawing|presentation/.test((doc&&(doc.mimeType||doc.mime_type||''))||'')
                            ? 'https://docs.google.com/'+(/presentation/.test((doc&&(doc.mimeType||doc.mime_type||''))||'')?'presentation':'drawings')+'/d/'+encodeURIComponent(_driveFid)+'/preview'
                            : 'https://drive.google.com/file/d/'+encodeURIComponent(_driveFid)+'/preview'),className:'doc-preview-frame',style:{border:'none',width:'100%',height:'100%',background:'var(--surface)'},title:(doc&&doc.name)||'Преглед',allow:'autoplay; fullscreen; picture-in-picture'})),
                  e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center',padding:'.5rem',borderTop:'1px solid #e8eaed',background:'#fafbfc'}},
                    e('button',{className:'btn btn-outline btn-sm',onClick:function(){_ieFullVizTriedRef.current=false;_ieFullVizDoneRef.current='';setIeFullViz(null);setIeFullVizFailed(false);setIeFullVizRetryKey(function(k){return k+1;});}},e('i',{className:'fas fa-redo'}),' Визуализирай в системата'),
                    openLink&&e('button',{className:'btn btn-success btn-sm',onClick:()=>window.open(openLink,'_blank','noopener,noreferrer')},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive')))
                                    :e('div',{style:{position:'absolute',inset:0,zIndex:3,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(241,243,244,.92)',flexDirection:'column',gap:'.6rem',padding:'1rem',textAlign:'center'}},
                                                    e('i',{className:'fas fa-exclamation-circle',style:{fontSize:'1.8rem',color:'var(--warn)'}}),
                                e('span',{style:{fontSize:'.82rem',color:'var(--ink-2)',maxWidth:340}},'Няма наличен преглед за този документ.'),
                                doc&&(doc.downloadUrl||doc.webContentLink)?e('a',{href:doc.downloadUrl||doc.webContentLink,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm',style:{marginTop:'.3rem'}},e('i',{className:'fas fa-download'}),' Изтегли документ'):null,
                                // v12.32.48-ux: auto-open in same tab instead of dead-end error
                                openLink&&e('button',{className:'btn btn-success',onClick:function(){window.location.href=openLink;}},e('i',{className:'fas fa-external-link-alt'}),' Преглед в Drive'),
                                e('button',{className:'btn btn-outline',onClick:function(){_ieFullVizTriedRef.current=false;_ieFullVizDoneRef.current='';setIeFullViz(null);setIeFullVizFailed(false);setIeFullVizRetryKey(function(k){return k+1;});}},e('i',{className:'fas fa-redo'}),' Опитай отново')
                ))
            );
          }
          // v12.30.2-editembed: Google Docs/Sheets cannot be framed (CSP blocks
          // drive.google.com framing). The legacy previewLink/webViewLink point
          // at the same CSP-blocked Google host, so embedding them hangs forever
          // on "Зареждане на прегледа…". For Google files, skip the doomed iframe
          // and go straight to the "Отвори за редакция" action (works in a tab,
          // autosaves to Drive). For non-Google files the previewLink iframe is
          // still attempted, but with load/error handlers so it never hangs.
          if(isGoogleDoc||isGoogleSheet){
            return e('div',{className:'empty-state',style:{flex:'1 1 0%',display:'flex',flexDirection:'column',justifyContent:'center',padding:'2rem'}},
              e('div',{style:{width:64,height:64,borderRadius:'50%',background:docIconColor+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.6rem',color:docIconColor,margin:'0 auto .75rem'}},e('i',{className:'fas '+docIcon})),
              e('h4',{style:{margin:0,fontSize:'1rem',color:'var(--ink)'}},'Google '+(isGoogleSheet?'Sheets':'Docs')+' документ'),
              e('p',{style:{fontSize:'.78rem',color:'var(--ink-3)',textAlign:'center',maxWidth:380,lineHeight:1.5,margin:'.4rem 0 .75rem'}},'Отворете документа в Google '+(isGoogleSheet?'Sheets':'Docs')+' за да го редактирате и попълните.'),
              e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center'}},
                canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary',style:{fontSize:'.82rem'}},e('i',{className:'fas fa-external-link-alt'}),' Отвори за редакция')
              )
            );
          }
          var _fallbackUrl=doc.previewLink||doc.webViewLink||'';
          // v12.30.2-editembed: Google/Drive-hosted fallback URLs are ALSO
          // CSP-blocked and never fire onError, so the iframe hangs forever on
          // "Зареждане на прегледа…" (same as the isGoogleDoc branch above).
          // Detect any Google host and skip the doomed embed; route the user to
          // an actionable state with "Отвори" / "Изтегли" instead.
          if(_fallbackUrl&&/^https:\/\/(docs|drive|accounts)\.google\.com/i.test(_fallbackUrl)){
            return e('div',{className:'empty-state',style:{flex:'1 1 0%',display:'flex',flexDirection:'column',justifyContent:'center',padding:'2rem'}},
              e('div',{style:{width:64,height:64,borderRadius:'50%',background:docIconColor+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.6rem',color:docIconColor,margin:'0 auto .75rem'}},e('i',{className:'fas '+docIcon})),
              e('h4',{style:{margin:0,fontSize:'1rem',color:'var(--ink)'}},docTypeLabel||'Документ'),
              e('p',{style:{fontSize:'.78rem',color:'var(--ink-3)',textAlign:'center',maxWidth:380,lineHeight:1.5,margin:'.4rem 0 .75rem'}},'Документът се отваря в Google Drive (преглед/редакция в нов раздел).'),
              e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center'}},
                _fallbackUrl&&e('a',{href:_fallbackUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary',style:{fontSize:'.82rem'}},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive'),
                canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline',style:{fontSize:'.82rem'}},e('i',{className:'fas fa-edit'}),' Отвори за редакция')
              )
            );
          }
          if(_fallbackUrl){
            var _fbErr=iframeError&&!iframeLoading;
            if(_fbErr){
              return e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.5rem',padding:'2rem'}},
                e('div',{style:{width:48,height:48,borderRadius:'50%',background:'var(--warn-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem',color:'var(--warn)'}},e('i',{className:'fas fa-exclamation-triangle'})),
                e('h4',{style:{margin:0,fontSize:'.9rem',color:'var(--ink)'}},'Не може да се зареди'),
                e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',justifyContent:'center'}},
                  e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){setIframeError(false);setIframeLoading(true);}},e('i',{className:'fas fa-redo'}),' Опитай отново'),
                  canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm'},e('i',{className:'fas fa-external-link-alt'}),' Отвори')
                )
              );
            }
            return e(Fragment,null,
              iframeLoading&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'1rem',padding:'2rem'}},
                e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem'}},e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'1.1rem',color:'var(--primary)'}}),e('span',{style:{fontSize:'.9rem',color:'var(--ink-2)',fontWeight:600}},'Зареждане на прегледа…'))
              ),
              e('iframe',{src:_fallbackUrl,
                style:{border:'none',flex:'1 1 0%',minHeight:0,background:'var(--surface)',borderRadius:0,display:iframeLoading?'none':'block'},
                title:docTitle,
                onLoad:function(){setIframeLoading(false);setIframeError(false);},
                onError:function(){setIframeLoading(false);setIframeError(true);},
                sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation allow-popups-to-escape-sandbox',
                allow:'autoplay; clipboard-write; camera; microphone; display-capture'})
            );
          }
          // Image with downloadUrl — render inline
          if(isImage&&doc.downloadUrl){
            return e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'1rem',overflow:'auto',background:'#f5f5f5'}},
              e('img',{src:doc.downloadUrl,alt:docName,
                style:{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:4,boxShadow:'0 2px 12px rgba(0,0,0,.1)'},
                onError:function(ev){ev.target.style.display='none';}})
            );
          }
          // Text content — render inline (Google-Docs-styled visualizer for HTML)
          if(isTextLike&&docContent){
            if(uevIsHtml(docContent)){
              // v12.32.15-docrender: reuse the self-contained Google-Docs-styled
              // visualizer (images/seals/tables visible, XSS-sanitized).
              return e('div',{style:{flex:'1 1 0%',overflow:'auto',padding:'1rem',background:'#f1f3f4',display:'flex',justifyContent:'center'}},
                UevDocRender(docContent)
              );
            }
            return e('div',{style:{flex:'1 1 0%',overflow:'auto',padding:'1rem',background:'var(--surface)'}},
              e('pre',{style:{whiteSpace:'pre-wrap',wordWrap:'break-word',fontFamily:'Consolas,Menlo,monospace',fontSize:'.82rem',lineHeight:1.6,margin:0,color:'var(--ink)'}},docContent)
            );
          }
          // No preview possible — show actions
          // v3.39.6-erpcontent / v3.39.7-erpfix: render the inline edit-embedded
          // modal for ERP-copied docs via the same-origin proxy (?erp=1). The
          // proxy serves the ERP's own stored copy, or falls back to a Google
          // export of the template using the real Drive id (fid). This replaces
          // the dead-end "download / open in Drive" message.
          // v3.39.8-proxyfallback: For ANY document with a Drive file reference
          // (library template, uploaded, or copied), try the proxy. This catches
          // cases where hasEmbed is false but _driveFid/doc.driveId/doc.id exists.
          if(_proxyBase && (_driveFid || doc.driveId || _rawId || doc.id)){
            var _fbDriveId = _driveFid || doc.driveId || (_isValidDriveId(doc.id) ? doc.id : '');
            if(_fbDriveId && _isValidDriveId(_fbDriveId)){
              var _fbProxyUrl = _proxyBase + '?driveId=' + encodeURIComponent(_fbDriveId) +
                '&type=' + (isGoogleSheet ? 'sheet' : 'doc') + (editMode ? '&edit=1' : '');
              return e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',position:'relative',minHeight:0}},
                iframeLoading&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'1rem',padding:'2rem'}},
                  e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem'}},e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'1.1rem',color:'var(--primary)'}}),e('span',{style:{fontSize:'.9rem',color:'var(--ink-2)',fontWeight:600}},'Зареждане на документа…'))
                ),
                iframeError&&!iframeLoading&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.5rem',padding:'2rem'}},
                  e('div',{style:{width:56,height:56,borderRadius:'50%',background:'var(--warn-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem',color:'var(--warn)'}},e('i',{className:'fas fa-exclamation-triangle'})),
                  e('h4',{style:{margin:'.25rem 0 0',fontSize:'1rem',color:'var(--ink)'}},'Документът не може да се зареди'),
                  e('div',{style:{display:'flex',gap:'.5rem',marginTop:'.25rem',flexWrap:'wrap',justifyContent:'center'}},
                    e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){setIframeError(false);setIframeLoading(true);setRetryKey(function(k){return k+1;});_retryCountRef.current=0;}},e('i',{className:'fas fa-redo'}),' Опитай отново'),
                    canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm'},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive')
                  )
                ),
                !iframeError&&e('iframe',{ref:iframeRef,key:retryKey,src:_fbProxyUrl,
                  style:{border:'none',flex:'1 1 0%',minHeight:0,background:'var(--surface)',display:iframeLoading?'none':'block'},
                  title:docTitle,
                  onLoad:function(){setIframeLoading(false);setIframeError(false);},
                  onError:function(){setIframeLoading(false);setIframeError(true);},
                  sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation allow-popups-to-escape-sandbox',
                  allow:'autoplay; clipboard-write; camera; microphone; display-capture'})
              );
            }
          }
          if(erpEmbedSrc){
            return e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',position:'relative',minHeight:0}},
              iframeLoading&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'1rem',padding:'2rem'}},
                e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem'}},e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'1.1rem',color:'var(--primary)'}}),e('span',{style:{fontSize:'.9rem',color:'var(--ink-2)',fontWeight:600}},'Зареждане на документа…'))
              ),
              iframeError&&!iframeLoading&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.5rem',padding:'2rem'}},
                e('div',{style:{width:56,height:56,borderRadius:'50%',background:'var(--warn-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem',color:'var(--warn)'}},e('i',{className:'fas fa-exclamation-triangle'})),
                e('h4',{style:{margin:'.25rem 0 0',fontSize:'1rem',color:'var(--ink)'}},'Документът не може да се зареди'),
                e('div',{style:{display:'flex',gap:'.5rem',marginTop:'.25rem',flexWrap:'wrap',justifyContent:'center'}},
                  e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){setIframeError(false);setIframeLoading(true);setRetryKey(function(k){return k+1;});_retryCountRef.current=0;}},e('i',{className:'fas fa-redo'}),' Опитай отново'),
                  canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm'},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google Drive')
                )
              ),
              !iframeError&&e('iframe',{ref:iframeRef,key:retryKey,src:erpEmbedSrc,
                style:{border:'none',flex:'1 1 0%',minHeight:0,background:'var(--surface)',display:iframeLoading?'none':'block'},
                title:docTitle,
                onLoad:function(){setIframeLoading(false);setIframeError(false);},
                onError:function(){setIframeLoading(false);setIframeError(true);},
                sandbox:'allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation-by-user-activation allow-popups-to-escape-sandbox',
                allow:'autoplay; clipboard-write; camera; microphone; display-capture'})
            );
          }
          // v3.39.10-inline-edit: for TEXT documents, replace the dead-end
          // "Документът е готов" with a LIVE inline editable textarea in this
          // empty space, so the user can type/edit the document directly.
          if(_docTypeKey==='textLike' || isTextLike){
            if(!textContent && docContent){setTextContent(docContent);}
            return e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',padding:'1rem',gap:'.5rem',overflow:'auto',background:'#f8f9fa'}},
              e('div',{style:{fontSize:'.72rem',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.35rem',padding:'.35rem .6rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:6,flexWrap:'wrap'}},
                e('i',{className:'fas fa-info-circle',style:{fontSize:'.6rem',color:'var(--info)'}}),
                e('span',null,'Редактирайте съдържанието на документа в полето по-долу. Промените се запазват автоматично.'),
                autosaveLabel
                  ? e('span',{className:'uev-autosave '+autosaveState,style:{marginLeft:'auto',fontSize:'.6rem',fontWeight:600}},autosaveLabel)
                  : e('kbd',{style:{fontSize:'.6rem',padding:'.12rem .35rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:4,fontWeight:600,marginLeft:'auto'}},'Ctrl+S за запис')
              ),
              e('textarea',{value:textContent,onChange:function(ev){setTextContent(ev.target.value);_dirtyRef.current=true;setDirty(true);},
                style:{flex:'1 1 0%',width:'100%',border:'1px solid var(--border)',borderRadius:6,padding:'.65rem .75rem',fontSize:'.82rem',fontFamily:'Consolas,Menlo,monospace',lineHeight:1.6,resize:'none',background:'var(--surface)',minHeight:220,outline:'none'},
                placeholder:'Въведете съдържанието на документа...'})
            );
          }
          // v12.32.15-docview: render the document DIRECTLY in the modal instead
          // of a dead-end "download / open in Drive" prompt. If we have stored
          // HTML/content, show it via the rich Google-Docs-styled visualizer;
          // otherwise keep the lightweight fallback + external links.
          if(renderedHtml){
            var _html=renderedHtml;
            // v12.46.0-fix: never dump binary (Base64) content as plain text —
            // show actionable "Open in Drive" state instead.
            if(_uevLooksBinaryContent(_html)&&_html.length>200){
              return e('div',{className:'empty-state',style:{flex:'1 1 0%',display:'flex',flexDirection:'column',justifyContent:'center',padding:'2rem'}},
                e('div',{style:{width:64,height:64,borderRadius:'50%',background:docIconColor+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.6rem',color:docIconColor,margin:'0 auto .75rem'}},e('i',{className:'fas '+docIcon})),
                e('h4',{style:{margin:0,fontSize:'1rem',color:'var(--ink)'}},'Документът е готов'),
                e('p',{style:{fontSize:'.78rem',color:'var(--ink-3)',textAlign:'center',maxWidth:380,lineHeight:1.5,margin:'.4rem 0 .75rem'}},
                  'Този документ е бинарен файл (Office/PDF). Използвайте бутона „Отвори за редакция\", за да го отворите в Google Drive.'),
                e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center'}},
                  canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary',style:{fontSize:'.82rem'}},e('i',{className:'fas fa-external-link-alt'}),' Отвори за редакция')
                )
              );
            }
            return e('div',{style:{flex:'1 1 0%',display:'flex',flexDirection:'column',minHeight:0}},
              e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',padding:'.4rem .6rem',fontSize:'.7rem',color:'var(--ink-4)',background:'#f1f3f4',borderBottom:'1px solid var(--border)'}},
                e('i',{className:'fas fa-file-alt'}),
                e('span',null,'Документът е зареден директно в прегледа'),
                e('span',{style:{marginLeft:'auto',display:'flex',gap:'.35rem'}},
                  canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline btn-xs',style:{fontSize:'.62rem'}},e('i',{className:'fas fa-external-link-alt'}),' Drive'),
                  
                )
              ),
              e('div',{style:{flex:'1 1 0%',overflow:'auto',padding:'.75rem',background:'#f1f3f4',display:'flex',justifyContent:'center'}},
                uevIsHtml(_html)?UevDocRender(_html):e('div',{className:'uev-doc-render',style:{whiteSpace:'pre-wrap',wordBreak:'break-word'}},_html)
              )
            );
          }
          return e('div',{className:'empty-state',style:{flex:'1 1 0%',display:'flex',flexDirection:'column',justifyContent:'center',padding:'2rem'}},
            renderedLoading&&e('div',{style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'.5rem'}},e('i',{className:'fa-spinner fa-spin',style:{fontSize:'1.6rem',color:'var(--ink-4)'}}),e('span',{style:{fontSize:'.8rem',color:'var(--ink-3)'}},'Зареждане на документа…')),
            !renderedLoading&&e(Fragment,null,
              e('div',{style:{width:64,height:64,borderRadius:'50%',background:docIconColor+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.6rem',color:docIconColor,margin:'0 auto .75rem'}},e('i',{className:'fas '+docIcon})),
              e('h4',{style:{margin:0,fontSize:'1rem',color:'var(--ink)'}},isGoogleDoc||isGoogleSheet?'Google '+(isGoogleSheet?'Sheets':'Docs')+' документ':'Документът е готов'),
              e('p',{style:{fontSize:'.78rem',color:'var(--ink-3)',textAlign:'center',maxWidth:380,lineHeight:1.5,margin:'.4rem 0 .75rem'}},
                isGoogleDoc||isGoogleSheet
                  ? 'Отворете документа в Google '+(isGoogleSheet?'Sheets':'Docs')+' за да го редактирате и попълните.'
                  : (_driveFid
                      ? 'Изтеглете файла или го отворете в Google Drive.'
                      : 'Този документ няма Drive връзка за преглед в системата. Използвайте бутона „Изтегли" по-долу, за да го отворите локално.')),
              e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap',justifyContent:'center'}},
                canOpenExternal&&e('a',{href:directEditUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary',style:{fontSize:'.82rem'}},e('i',{className:'fas fa-external-link-alt'}),' Отвори за редакция'),
                isTextLike&&docContent&&e('button',{type:'button',className:'btn btn-outline',onClick:switchToTextEditor},e('i',{className:'fas fa-file-alt'}),' Редактирай като текст')
              )
            )
          );
        })()
      )
  ),
  // ── FOOTER ──
  e('div',{className:'modal-footer',style:{display:'flex',gap:'.5rem',flexWrap:'wrap',alignItems:'center'}},
    // v12.47.0-gnative: page indicator (single-doc embed → "Страница 1 / 1"),
    e('span',{className:'doc-page-indicator',title:'Страница','aria-label':'Страница 1 от 1'},'Страница 1 / 1'),
    // Left side: status / info text
    e('span',{style:{fontSize:'.7rem',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.25rem',flex:'1 1 auto',minWidth:0,flexWrap:'wrap'}},
      e('i',{className:'fas fa-info-circle',style:{color:'var(--info)',fontSize:'.6rem',flexShrink:0}}),
      (function(){
        if(cspBlocked)return e(Fragment,null,'Google блокира вградения преглед. Използвайте „Отвори за редакция“, за да отворите документа.');
        if(useTextEditor)return e(Fragment,null,'Редактирайте текста и натиснете ',e('strong',null,'"Запази"'),' или ',e('kbd',{style:{fontSize:'.58rem',padding:'.08rem .28rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:3,fontWeight:600,margin:'0 .15rem'}},'Ctrl+S'),'.');
        if(editMode){
          if(isGoogleDoc||isGoogleSheet)return e(Fragment,null,'Google '+(isGoogleSheet?'Sheets':'Docs')+' се запазва автоматично. Натиснете ',e('strong',null,'"Запази"'),' когато сте готови.');
          return e(Fragment,null,'Прегледайте файла. Натиснете ',e('strong',null,'"Запази"'),' за да потвърдите.');
        }
        return e(Fragment,null,cspBlocked?'Google блокира вградения преглед.':'Режим ',cspBlocked?null:e('strong',null,'"Преглед"'),cspBlocked?' Отворено в нов раздел.':' — само за четене. Превключете към "Редактирай" за промени.');
      })()
    ),
    // Right side: action buttons
    e('div',{style:{display:'flex',gap:'.4rem',flexShrink:0}},
      e('button',{className:'btn btn-outline btn-sm',onClick:ieClose,disabled:saving,style:{fontSize:'.78rem',minWidth:80}},'Затвори'),
      e('button',{className:'btn btn-primary btn-sm',onClick:handleSave,disabled:saving,style:{fontSize:'.78rem',minWidth:100,fontWeight:600}},
        saving?e(Fragment,null,e('i',{className:'fas fa-spinner fa-spin',style:{marginRight:'.25rem'}}),' Запазване…'):e(Fragment,null,e('i',{className:'fas fa-save',style:{marginRight:'.25rem'}}),' Запази')
      )
    )
  )
  )
));
});


/* ─── DOCUMENT PICKER ─── */
var DocumentPickerModal=memo(({documents,onConfirm,onCancel,alreadyAttached=[],onCopyAttach,formId,competitionId,projectType,userEmail=''})=>{
// v12.27.1-perf: Track local attached state — prevents stale closure bug where
// removing a second already-attached doc re-attaches the first one via the old
// `alreadyAttached` prop. Initialized from prop, updated on each local removal.
var _localAttached=useState(function(){return alreadyAttached.slice();});
var localAttached=_localAttached[0];var setLocalAttached=_localAttached[1];
// Sync localAttached when alreadyAttached prop changes (e.g., server sync)
useEffect(function(){setLocalAttached(alreadyAttached.slice());},[alreadyAttached]);
const{closing:pickerClosing,close:pickerClose}=useModalClose(onCancel);
const[selected,setSelected]=useState(()=>new Set(alreadyAttached.map(d=>d.id)));
const[search,setSearch]=useState('');
const[viewMode,setViewMode]=useState(()=>{try{return localStorage.getItem('erp:picker:view')||'card'}catch(_){return'card'}});
const[previewDoc,setPreviewDoc]=useState(null);
// ── Source: 'library' (official docs) | 'mydocs' (personal copies) ──
const[source,setSource]=useState('library');
const[myDocs,setMyDocs]=useState([]);
const[myDocsLoading,setMyDocsLoading]=useState(false);
// Defer search filtering so typing stays responsive on large libraries (~hundreds of docs)
const deferredSearch=useDeferredValue(search);

// Load personal documents when switching to 'mydocs' source
useEffect(()=>{
  if(source!=='mydocs'||myDocs.length>0)return;
  setMyDocsLoading(true);
  Promise.resolve().then(function(){
    if(typeof listMyDocuments==='function')return listMyDocuments();
    return api('listmydocuments',{});
  }).then(function(res){
    setMyDocs(Array.isArray(res.documents||(res.data&&res.data.documents))?(res.documents||res.data.documents):[]);
  }).catch(function(){}).finally(function(){setMyDocsLoading(false)});
},[source,myDocs.length]);

const setView=m=>{setViewMode(m);try{localStorage.setItem('erp:picker:view',m)}catch(_){}};

const activeDocuments = source==='mydocs' ? myDocs : documents;

const filtered=useMemo(()=>{
    // Filter by competitionId when provided (library source only)
    let list=activeDocuments;
    if(source==='library'&&competitionId){
        list=list.filter(d=>!d.competitionId||d.competitionId===competitionId||(d.folderName||'').toLowerCase().startsWith(String(competitionId).toLowerCase()));
    }
    // ── projectType: SOFT preference, NEVER a hard exclude ──
    // Library docs are categorised by document TYPE (see getDocCategory in
    // config.js), not by the applicant's project code, so a hard projectType
    // filter previously hid EVERY official doc and blocked attachment. We now
    // only use projectType to sort matching docs to the top; every library
    // doc remains attachable. (v12.30.2-libfix)
    let _ptMatch=null;
    if(source==='library'&&projectType){
        var pt=String(projectType).toUpperCase().trim();
        _ptMatch=function(d){
            var cat=(typeof getDocCategory==='function')?getDocCategory(d):(d.folderName||'');
            return cat===pt||(d.folderName||'').toUpperCase().trim()===pt||(d.name||'').toUpperCase().indexOf(pt)>=0;
        };
    }
    if(deferredSearch.trim()){
        const q=deferredSearch.toLowerCase();
        list=list.filter(d=>(d.name||'').toLowerCase().includes(q)||(d.folderName||'').toLowerCase().includes(q));
    }
    // Sort: projectType matches first, then natural name order.
    var out=list.slice().sort((a,b)=>{
        if(_ptMatch){
            var ma=_ptMatch(a)?1:0,mb=_ptMatch(b)?1:0;
            if(ma!==mb)return mb-ma;
        }
        try{return naturalCmp(a.name||'',b.name||'')}catch(_){return(a.name||'').localeCompare(b.name||'','bg')}
    });
    return out;
},[activeDocuments,deferredSearch,competitionId,source,projectType]);

const toggle=id=>setSelected(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next});
// v12.32.41-picker: select-all / clear-all for the current filtered list —
// lets applicants attach every library doc in one tap instead of one-by-one.
const allFilteredIds=()=>filtered.map(d=>d.id);
const selectAllFiltered=()=>setSelected(prev=>{const next=new Set(prev);allFilteredIds().forEach(id=>next.add(id));return next});
const clearAllFiltered=()=>setSelected(prev=>{const next=new Set(prev);allFilteredIds().forEach(id=>next.delete(id));return next});
const allFilteredSelected=filtered.length>0&&filtered.every(d=>selected.has(d.id));
// v12.27.1-perf: Memoize to avoid re-filtering entire document list on every render
const selectedDocs=useMemo(function(){return activeDocuments.filter(function(d){return selected.has(d.id);});},[activeDocuments,selected]);

const renderListView=()=>e('table',{className:'doc-picker-list-table'},
    e('thead',null,e('tr',null,
        e('th',{style:{width:28},title:'Избери всички',onClick:function(ev){ev.stopPropagation();allFilteredSelected?clearAllFiltered():selectAllFiltered();}},
            e('input',{type:'checkbox',checked:allFilteredSelected,onChange:function(){allFilteredSelected?clearAllFiltered():selectAllFiltered();},onClick:ev=>ev.stopPropagation()})
        ),
        e('th',null,'Документ'),
        e('th',null,'Тип'),
        e('th',null,'Категория'),
        e('th',{style:{width:44}})
    )),
    e('tbody',null,filtered.map(d=>{
        // v12.27.1-perf: Defensive guard — prevent crash if getDocVisuals not loaded yet
        const vis=(typeof getDocVisuals==='function')?getDocVisuals(d):{icon:'fa-file',label:'Документ',cssClass:''};
        const isSel=selected.has(d.id);
        const _cat=(typeof getDocCategory==='function')?getDocCategory(d):(d.folderName||'');
        return e('tr',{key:d.id,className:'dpl-row'+(isSel?' selected':''),onClick:()=>toggle(d.id)},
            e('td',null,e('div',{className:'dpi-check',style:{width:20,height:20}},isSel&&e('i',{className:'fas fa-check'}))),
            e('td',null,e('div',{className:'dpi-name'},d.name||'Без име')),
            e('td',null,e('div',{className:'doc-icon-wrap '+vis.cssClass,style:{width:22,height:22,fontSize:'.65rem',display:'inline-flex',alignItems:'center',justifyContent:'center',borderRadius:4}},e('i',{className:'fas '+vis.icon}))),
            e('td',null,e('span',{style:{fontSize:'.72rem',color:'var(--ink-3)'}},_cat)),
            e('td',{onClick:ev=>ev.stopPropagation()},e('button',{className:'btn btn-outline btn-icon doc-action-btn',title:'Преглед',style:{minWidth:40,minHeight:40},onClick:()=>setPreviewDoc(d)},e('i',{className:'fas fa-eye'})))
        );
    }))
);

const renderCardView=()=>e('div',{className:'doc-picker-grid'},
    filtered.map(d=>{
        // v12.27.1-perf: Defensive guard — prevent crash if getDocVisuals not loaded yet
        const vis=(typeof getDocVisuals==='function')?getDocVisuals(d):{icon:'fa-file',label:'Документ',cssClass:''};
        const isSel=selected.has(d.id);
        const _cat=(typeof getDocCategory==='function')?getDocCategory(d):(d.folderName||'');
        return e('div',{key:d.id,className:'doc-picker-item'+(isSel?' selected':''),onClick:()=>toggle(d.id)},
            e('div',{className:'dpi-check'},isSel&&e('i',{className:'fas fa-check'})),
            e('div',{className:'doc-icon-wrap '+vis.cssClass,style:{width:26,height:26,fontSize:'.7rem',flexShrink:0}},e('i',{className:'fas '+vis.icon})),
            e('div',{style:{flex:1,minWidth:0}},
                e('div',{className:'dpi-name'},d.name||'Без име'),
                e('div',{style:{fontSize:'.58rem',color:'var(--ink-4)',marginTop:1}},_cat)
            ),
            e('button',{className:'btn btn-outline btn-icon doc-action-btn',style:{minWidth:40,minHeight:40,flexShrink:0},title:'Преглед',onClick:ev=>{ev.stopPropagation();setPreviewDoc(d)}},e('i',{className:'fas fa-eye',style:{fontSize:'.62rem'}})),
            isTemplateDoc(d)&&e('span',{style:{fontSize:'.52rem',color:'var(--gold)',fontWeight:700,letterSpacing:'.04em'},title:'Шаблон – може да се копира'},'📝')
        );
    })
);

return e(Fragment,null,
    _portal(e('div',{className:'modal-overlay'+(pickerClosing?' modal-closing':''),onClick:pickerClose},
    e('div',{className:'modal-box wide'+(pickerClosing?' modal-closing':''),onClick:ev=>ev.stopPropagation()},
        e('div',{className:'modal-head'},
        e('div',null,
          e('h3',null,e('i',{className:'fas fa-folder-open'}),' Прикачи документ'),
          e('div',{style:{display:'flex',gap:'.3rem',marginTop:'.4rem'}},
            e('button',{className:'btn btn-sm '+(source==='library'?'btn-primary':'btn-outline'),onClick:()=>setSource('library'),style:{fontSize:'.72rem',padding:'.2rem .6rem'}},e('i',{className:'fas fa-book'}),' Библиотека'),
            e('button',{className:'btn btn-sm '+(source==='mydocs'?'btn-primary':'btn-outline'),onClick:()=>setSource('mydocs'),style:{fontSize:'.72rem',padding:'.2rem .6rem'}},e('i',{className:'fas fa-user-folder'}),' Моите документи')
          )
        ),
        e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem'}},
            e('div',{className:'view-toggle-btns'},
                e('button',{className:'btn btn-icon'+(viewMode==='card'?' btn-primary':' btn-outline'),title:'Карти',style:{minWidth:36,minHeight:36},onClick:()=>setView('card')},e('i',{className:'fas fa-th'})),
                e('button',{className:'btn btn-icon'+(viewMode==='list'?' btn-primary':' btn-outline'),title:'Списък',style:{minWidth:36,minHeight:36},onClick:()=>setView('list')},e('i',{className:'fas fa-list'}))
            ),
            e('button',{className:'close-btn',onClick:pickerClose},e('i',{className:'fas fa-times'}))
        )
        ),
        e('div',{className:'modal-body'},
        e('div',{style:{position:'relative',marginBottom:'.7rem'}},
            e('i',{className:'fas fa-search',style:{position:'absolute',left:'.82rem',top:'50%',transform:'translateY(-50%)',color:'var(--ink-4)',fontSize:'.76rem',pointerEvents:'none'}}),
            e('input',{className:'doc-picker-search',placeholder:'Търсете документ по име...',value:search,onChange:ev=>setSearch(ev.target.value),style:{paddingLeft:'2.2rem'}})
        ),
        selected.size>0&&e('div',{style:{marginBottom:'.8rem'}},
            e('div',{style:{fontSize:'.67rem',fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-4)',marginBottom:'.4rem'}},'Избрани (',selected.size,'):'),
            e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.2rem'}},
            selectedDocs.map(d=>e('span',{key:d.id,className:'attached-doc-chip'},
                e('i',{className:'fas fa-file',style:{fontSize:'.62rem'}}),(d.name||'').slice(0,30),
                // v12.27.1-perf: Use localAttached state (functional updater) instead
                // of alreadyAttached prop to avoid stale closure on multi-remove.
                e('button',{className:'remove-attached',onClick:function(){
                  toggle(d.id);
                  setLocalAttached(function(prev){
                    var next=prev.filter(function(x){return x.id!==d.id;});
                    if(formId){
                      mutateApi('updateForm',{id:formId,updates:{attachedDocs:next.map(function(dd){return _serializeDoc(dd);})}},{invalidates:['getforms','getinitialdata']}).catch(function(){});
                    }
                    return next;
                  });
                },type:'button'},'✕')
            ))
            )
        ),
        filtered.length===0
            ?e('div',{className:'empty-state',style:{padding:'2rem'}},
                source==='mydocs'&&myDocsLoading?e(Fragment,null,e('i',{className:'fas fa-spinner spin',style:{fontSize:'1.5rem',color:'var(--ink-4)'}}),e('p',null,'Зареждане на личните документи...'))
                :source==='mydocs'?e('p',null,'Нямате лични документи. Копирайте шаблони от секция „Библиотека" или ги качете от секция „Моите документи".')
                :e('p',null,'Няма намерени документи.'))
            :viewMode==='list'?renderListView():renderCardView()
        ),
        e('div',{className:'modal-footer'},
        e('button',{className:'btn btn-outline',onClick:pickerClose},'Отказ'),
        e('button',{className:'btn btn-primary',onClick:function(){onConfirm(selectedDocs.map(function(d){return _serializeDoc(d);}));}},e('i',{className:'fas fa-link'}),' Прикачи',selected.size>0?' ('+selected.size+')':'')
        )
    )
    )),
    previewDoc&&e(DocumentPreviewModal,{doc:previewDoc,onClose:()=>setPreviewDoc(null),showAttach:false,onCopyAttach,formId,userEmail:userEmail,isOwner:source==='mydocs',onEdit:function(doc){setPreviewDoc(null);setEditingDoc(doc);}})
);
});

/* ─── SIGNATURE PAD ─── */
var SignaturePad=({onSave,width=500,height=200})=>{
const canvasRef=useRef(null);const drawing=useRef(false);const[ctx,setCtx]=useState(null);
useEffect(()=>{const canvas=canvasRef.current;if(!canvas)return;const context=canvas.getContext('2d');context.lineWidth=2;context.lineCap='round';context.strokeStyle='#1A1A1A';setCtx(context);context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height)},[]);
const getCoords=ev=>{const canvas=canvasRef.current;const rect=canvas.getBoundingClientRect();const sx=canvas.width/rect.width;const sy=canvas.height/rect.height;let cx,cy;if(ev.touches){cx=ev.touches[0].clientX;cy=ev.touches[0].clientY;ev.preventDefault()}else{cx=ev.clientX;cy=ev.clientY}const x=(cx-rect.left)*sx;const y=(cy-rect.top)*sy;return(x>=0&&x<=canvas.width&&y>=0&&y<=canvas.height)?{x,y}:null};
const start=ev=>{drawing.current=true;const c=getCoords(ev);if(c){ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(c.x,c.y);ctx.stroke()}};
const draw=ev=>{if(!drawing.current)return;const c=getCoords(ev);if(c){ctx.lineTo(c.x,c.y);ctx.stroke();ctx.beginPath();ctx.moveTo(c.x,c.y)}};
const stop=()=>{drawing.current=false;ctx.beginPath()};
const clear=()=>{ctx.clearRect(0,0,canvasRef.current.width,canvasRef.current.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvasRef.current.width,canvasRef.current.height)};
return e('div',{className:'signature-container'},e('canvas',{ref:canvasRef,className:'signature-canvas',width,height,style:{width:'100%',height:'auto',maxWidth:'100%'},onMouseDown:start,onMouseMove:draw,onMouseUp:stop,onMouseLeave:stop,onTouchStart:start,onTouchMove:draw,onTouchEnd:stop}),e('div',{className:'signature-actions'},e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:clear},e('i',{className:'fas fa-eraser'}),' Изчисти'),e('button',{type:'button',className:'btn btn-primary btn-sm',onClick:()=>onSave(canvasRef.current.toDataURL('image/png'))},e('i',{className:'fas fa-save'}),' Запази подписа')));
};
var SignatureModal=({onConfirm,onCancel,title='Електронен подпис',message='Подпишете документа на екрана:',documentInfo=null,require2fa=false,userEmail='',otpScope='signature',otpRef=''})=>{
const{closing:sigClosing,close:sigClose}=useModalClose(onCancel);
const[sig,setSig]=useState(null);
const[sub,setSub]=useState(false);
// 2FA phase: 'sign' → user draws signature; 'verify' → user enters email OTP
const[phase,setPhase]=useState('sign');
const[otpCode,setOtpCode]=useState('');
const[otpErr,setOtpErr]=useState('');
const[otpInfo,setOtpInfo]=useState('');
const[otpCooldown,setOtpCooldown]=useState(0);
const[issuing,setIssuing]=useState(false);
const otpInputRef=useRef(null);
const _sigRef=useRef(false); // prevent double-click spam
const mountedRef=useRef(true);
// Reset mountedRef on mount (handles React 18 Strict Mode double-mount)
useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false};},[]);
const safeSet=(fn)=>{if(mountedRef.current)fn()};
useEffect(()=>{if(phase!=='verify')return;const t=setTimeout(()=>{try{otpInputRef.current&&otpInputRef.current.focus()}catch(_){}},80);return()=>clearTimeout(t)},[phase]);
useEffect(()=>{if(otpCooldown<=0)return;const t=setInterval(()=>setOtpCooldown(c=>c<=1?0:c-1),1000);return()=>clearInterval(t)},[otpCooldown]);
const issueOtp=async()=>{
    setIssuing(true);setOtpErr('');
    try{
        const r=await api('initiate2fa',{scope:otpScope,email:userEmail,ref:otpRef});
        if(r&&r.success){
            if(r.throttled){
                safeSet(()=>{setOtpInfo('Има активен код. Опитайте след '+(r.cooldown||30)+' сек.');setOtpCooldown(Number(r.cooldown||30))});
            }else{
                safeSet(()=>{setOtpInfo('Изпратен е 6-цифрен код на '+userEmail+'.');setOtpCooldown(30)});
            }
            return true;
        }
        safeSet(()=>setOtpErr((r&&r.error)||'Неуспешно изпращане на код.'));
        return false;
    }catch(ex){safeSet(()=>setOtpErr(ex.message||'Неуспешно изпращане на код.'));return false}
    finally{safeSet(()=>setIssuing(false))}
};
// Always-available cancel: never blocked by busy state — gives user an escape hatch.
const cancelClose=()=>{sigClose()};
const handleConfirm=async()=>{
    if(_sigRef.current)return;
    if(!sig){toast('Поставете подпис.','warn');return}
    // Branch A — no 2FA required: legacy flow
    if(!require2fa){
        _sigRef.current=true;
        setSub(true);
        try{await onConfirm(sig)}catch(err){toast(err.message,'error')}
        finally{safeSet(()=>{_sigRef.current=false;setSub(false)})}
        return;
    }
    // Branch B — applicant signing: switch to OTP step and dispatch a code
    _sigRef.current=true;
    setSub(true);setOtpErr('');setOtpInfo('');
    const ok=await issueOtp();
    safeSet(()=>{_sigRef.current=false;setSub(false);if(ok)setOtpCode('')});
    if(ok)safeSet(()=>setPhase('verify'));
};
const handleVerify=async ev=>{
    if(ev&&ev.preventDefault)ev.preventDefault();
    if(_sigRef.current)return;
    const clean=String(otpCode||'').replace(/[^0-9]/g,'');
    if(clean.length!==6){setOtpErr('Кодът трябва да е 6 цифри.');return}
    _sigRef.current=true;
    setOtpErr('');setOtpInfo('');setSub(true);
    try{
        // Race with a 25s timeout so the UI never hangs indefinitely
        var timeoutP=new Promise(function(_,reject){setTimeout(function(){reject(new Error('Изтече времето за потвърждение. Опитайте отново.'));},25000);});
        var apiP=api('verify2fa',{scope:otpScope,email:userEmail,ref:otpRef,code:clean});
        const r=await Promise.race([apiP,timeoutP]);
        if(!r||!r.success){
            safeSet(()=>{setOtpErr((r&&r.error)||'Грешен код.');_sigRef.current=false;setSub(false)});
            if(r&&r.expired){safeSet(()=>{setOtpInfo('Кодът е изтекъл. Поискайте нов.');setOtpCode('')});}
            if(r&&r.locked){safeSet(()=>{setOtpInfo('Превишен брой опити. Поискайте нов код.');setOtpCode('')});}
            return;
        }
        // Verified — perform the actual signing action.
        try{await onConfirm(sig)}
        catch(err){toast(err.message||'Грешка при подписване','error');safeSet(()=>{_sigRef.current=false;setSub(false)});return}
        safeSet(()=>{_sigRef.current=false;setSub(false)});
    }catch(ex){safeSet(()=>{setOtpErr(ex.message||'Грешка при проверка.');_sigRef.current=false;setSub(false)})}
};
const handleResend=async()=>{
    if(otpCooldown>0||issuing||sub)return;
    setOtpCode('');
    await issueOtp();
};
const maskedEmail=(()=>{const s=String(userEmail||'');const at=s.indexOf('@');if(at<2)return s;return s.charAt(0)+'•••'+s.charAt(at-1)+s.substr(at)})();
const DocInfoBox=()=>documentInfo?e('div',{className:'ed-doc-info'},e('div',{className:'ed-doc-info-row'},e('i',{className:'fas fa-file-alt'}),'\u00a0',documentInfo.title||'—'),documentInfo.formId?e('div',{className:'ed-doc-info-row sub'},e('i',{className:'fas fa-hashtag'}),'\u00a0ID: ',documentInfo.formId):null):null;
return _portal(e('div',{className:'modal-overlay'+(sigClosing?' modal-closing':''),onClick:cancelClose},
    e('div',{className:'modal-box narrow'+(sigClosing?' modal-closing':''),onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head'},
        e('h3',null,
            phase==='verify'
                ?e(Fragment,null,e('i',{className:'fas fa-shield-halved',style:{color:'var(--primary)'}}),' Потвърждение в две стъпки')
                :e(Fragment,null,e('i',{className:'fas fa-signature'}),' ',title)
        ),
        // Close button is ALWAYS clickable — the user must always have an escape hatch even mid-await.
        e('button',{className:'close-btn',onClick:cancelClose,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
    ),
    phase==='sign'
        ?e('div',{className:'modal-body'},
            e(DocInfoBox,null),
            e('p',{className:'ed-modal-msg'},message),
            e(SignaturePad,{onSave:d=>setSig(d)}),
            sig&&e('div',{className:'ed-signed-hint'},e('i',{className:'fas fa-check-circle'}),' Подписът е готов. Натиснете „Потвърди" за да продължите.'),
            require2fa&&e('div',{style:{marginTop:'.65rem',display:'flex',alignItems:'center',gap:'.5rem',padding:'.55rem .7rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-xs)',fontSize:'.74rem',color:'var(--info)'}},
                e('i',{className:'fas fa-shield-halved'}),
                e('span',null,'След подписване ще получите 6-цифрен код за потвърждение на ',e('strong',null,maskedEmail||'имейла Ви'),' (формат „G-XXXXXX is your Google verification code.").')
            )
        )
        :e('form',{onSubmit:handleVerify},
            e('div',{className:'modal-body',style:{display:'flex',flexDirection:'column',gap:'.85rem'}},
                e(DocInfoBox,null),
                e('p',{style:{fontSize:'.85rem',color:'var(--ink-2)',lineHeight:1.6,margin:0}},
                    'За да потвърдите самоличността си преди подписване, въведете 6-цифрения код, който изпратихме на ',e('strong',null,maskedEmail||'имейла Ви'),'.'
                ),
                e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',padding:'.55rem .7rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-xs)',fontSize:'.74rem',color:'var(--info)'}},
                    e('i',{className:'fab fa-google'}),
                    e('span',null,'„G-123456 is your Google verification code." — където 123456 е вашият код за верификация.')
                ),
                e('div',{className:'form-field',style:{margin:0}},
                    e('label',null,'Код за потвърждение'),
                    e('input',{
                        ref:otpInputRef,
                        value:otpCode,
                        onChange:ev=>{const v=String(ev.target.value||'').replace(/[^0-9]/g,'').slice(0,6);setOtpCode(v);if(otpErr)setOtpErr('')},
                        inputMode:'numeric',autoComplete:'one-time-code',pattern:'[0-9]*',maxLength:6,placeholder:'123456',disabled:sub,
                        style:{letterSpacing:'.5rem',fontSize:'1.25rem',textAlign:'center',fontFamily:'Consolas,Menlo,monospace',fontWeight:700}
                    })
                ),
                otpErr&&e('div',{role:'alert',style:{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.78rem',color:'var(--err)',background:'var(--err-bg)',border:'1px solid var(--err-border)',padding:'.5rem .7rem',borderRadius:'var(--r-xs)'}},
                    e('i',{className:'fas fa-exclamation-circle'}),otpErr
                ),
                !otpErr&&otpInfo&&e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.74rem',color:'var(--ink-3)'}},
                    e('i',{className:'fas fa-info-circle'}),otpInfo
                ),
                e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'.76rem',color:'var(--ink-3)'}},
                    e('span',null,'Кодът важи 5 минути.'),
                    e('button',{type:'button',className:'btn btn-ghost btn-sm',disabled:otpCooldown>0||issuing||sub,onClick:handleResend},
                        issuing?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-paper-plane'}),
                        ' ',otpCooldown>0?`Нов код (${otpCooldown}s)`:'Изпрати нов код'
                    )
                )
            )
        ),
    phase==='sign'
        ?e('div',{className:'modal-footer'},
            e('button',{className:'btn btn-outline',onClick:cancelClose},'Отказ'),
            e('button',{className:'btn btn-primary',onClick:handleConfirm,disabled:!sig||sub},
                sub?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-check'}),
                ' ',require2fa?'Потвърди и продължи':'Потвърди подписа'
            )
        )
        :e('div',{className:'modal-footer'},
            e('button',{className:'btn btn-outline',disabled:sub,onClick:()=>{setPhase('sign');setOtpCode('');setOtpErr('');setOtpInfo('')}},e('i',{className:'fas fa-arrow-left'}),' Назад'),
            e('button',{className:'btn btn-primary',disabled:sub||otpCode.length!==6,onClick:handleVerify},
                sub?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-shield-check'}),
                ' ',sub?'Потвърждаване...':'Потвърди и подпиши'
            )
        )
    )
));
};

/* ─── FORM DETAIL ─── */
var FormDetail=memo(({form,allDocuments=[],competitions,user,isAdmin,initialTab=null,onRefresh})=>{
// ── Optimistic local overlay ──
// FormDetail mutates documents inline (upload/delete/attach/remove). Without a
// local overlay, every action would wait for the parent loadForms round-trip
// before the chip disappeared — sluggish UX. localForm reflects pending state
// instantly; parent refresh syncs the canonical row afterwards.
const[localForm,setLocalForm]=useState(form);
// v12.32.15-attachconfirm: transient confirmation that attached docs were
// durably saved to the backend (the "remember the action" loop). Shows a
// green "✓ запазено към заявката" banner for a few seconds after a successful
// sqlattachdocument, so the applicant sees the system persisted the attachment.
const[attachSavedAt,setAttachSavedAt]=useState(0);
useEffect(()=>{ if(!attachSavedAt)return; const t=setTimeout(()=>setAttachSavedAt(0),4500); return()=>clearTimeout(t); },[attachSavedAt]);
// v12.31.0-attachflicker: Merge optimistic additions instead of replacing
// unconditionally. When the parent refresh returns stale attachedDocs (GAS→
// MySQL async sync hasn't completed), we preserve any docs in localForm that
// the incoming server form doesn't have yet. This prevents the "appear for a
// second then disappear" bug when attaching documents from the library.
useEffect(()=>{
  setLocalForm(prev=>{
    const incomingAttached=getAttachedDocs(form);
    const prevAttached=getAttachedDocs(prev);
    // Fast path: server has at least as many docs as local — no merge needed
    if(prevAttached.length<=incomingAttached.length)return form;
    // Merge: keep incoming server data, add back any optimistic additions
    var merged=incomingAttached.slice();
    var changed=false;
    for(var i=0;i<prevAttached.length;i++){
      var d=prevAttached[i];
      if(!merged.some(function(x){return x.id===d.id||x.driveId===d.driveId;})){
        merged.push(d);
        changed=true;
      }
    }
    return changed?Object.assign({},form,{attachedDocs:merged}):form;
  });
},[form]);
const f=localForm||form;
const files=getFileIds(f),history=getHistory(f),returnComment=getReturnComment(f),status=getStatus(f);
const comps=competitions||COMPETITIONS;
const compName=comps.find(c=>c.id===getCompetitionId(f))?.name||getCompetitionId(f)||'—';
const signature=getSignature(f);
const signatureAdmin=getSignatureAdmin(f);
const attachedDocs=getAttachedDocs(f);
const resolvedAttached=attachedDocs.map(ad=>(allDocuments||[]).find(d=>d.id===ad.id)||ad);
// Ownership check: the logged-in user must be the form creator to edit anything.
const isOwner=!isAdmin&&String(user?.email||'').toLowerCase()===getEmail(f).toLowerCase();
// Docs mgmt: ONLY the applicant (owner) can edit their own attached documents.
// Admins can view but NOT modify — document editing is the applicant's
// responsibility. The edit window is restricted to draft / returned /
// needs_correction statuses; once submitted beyond that point, documents
// are locked even for the owner.
const canEditDocs=isOwner&&['draft','returned','needs_correction'].includes(status);
// v12.31.x-attachrestore: the creator (owner) AND an admin may ATTACH documents
// to an already-created proposal at any status — only the destructive ops
// (remove/delete/inline-edit) stay gated by canEditDocs for compliance.
const canAttachDocs=isOwner||isAdmin;
const[showPicker,setShowPicker]=useState(false);
// v12.34.3: showNewDocModal (GoogleDocEditorModal create-new path) removed — see toolbar button rework.
const[pickerBusy,setPickerBusy]=useState(false);
const[uploadQueue,setUploadQueue]=useState([]); // [{tempId,name,size,progress:0..1}]
const[dragging,setDragging]=useState(false);
const fileInputRef=useRef(null);
const formId=getId(f);
// Only the form owner (applicant) may mutate documents — never admin.
// v12.30.2-attachfix: carry the signed-in user's identity in _creds so that
// backend actions requiring auth (notably copyDocument, which resolves auth
// from the request body) succeed. Previously _creds was {} and copyDocument
// hit GAS with no userId → "Необходима е автентикация" → the library-doc copy
// failed silently and the document was never actually attached.
const _userEmail=String(isAdmin?(form?.userEmail||form?.email||(typeof _currentUserEmail!=='undefined'?_currentUserEmail:'')):user?.email||form?.userEmail||form?.email||(typeof _currentUserEmail!=='undefined'?_currentUserEmail:'')||'').toLowerCase();
// NOTE: isAdmin is intentionally false here. GAS updateForm/copyDocument treat
// the caller as the applicant (owner) and BLOCK admin mutations, so we must not
// forward isAdmin:true (which would make every admin doc-edit fail). The UI
// already gates editability via canEditDocs (owner-only).
const _creds={userId:_userEmail,email:_userEmail};
const _adminFlags={isAdmin:false};
const _actor=String(user?.name||_userEmail||'');
// Build a getforms cache patcher for a given mutation of THIS form.
const _patchForms=mutator=>({action:'getforms',mutator:resp=>{
    if(!resp||!Array.isArray(resp.forms))return resp;
    return{...resp,forms:resp.forms.map(x=>getId(x)===formId?mutator(x):x)};
}});
const _afterMutation=()=>{if(typeof onRefresh==='function')onRefresh({forceRefresh:true,silent:true})};
// Inline file delete (replaces opening EditFormModal just to remove a file)
const handleDeleteFile=useCallback(fileId=>{
    if(!fileId||!formId)return;
    const prev=localForm;
    setLocalForm(p=>({...p,fileIds:getFileIds(p).filter(x=>x.fileId!==fileId)}));
    mutateApi('deleteFile',{..._creds,..._adminFlags,formId,fileId,userName:_actor},{
        patches:[_patchForms(row=>({...row,fileIds:getFileIds(row).filter(x=>x.fileId!==fileId)}))],
        invalidates:['getforms','getinitialdata']
    }).then(()=>{toast('Файлът е изтрит','success');try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}_afterMutation()})
      .catch(err=>{setLocalForm(prev);toast('Грешка при изтриване: '+(err&&err.message||''),'error')});
// eslint-disable-next-line react-hooks/exhaustive-deps
},[formId,localForm,isAdmin]);
// Inline attached-doc remove
const handleRemoveDoc=useCallback(docId=>{
    if(!docId||!formId)return;
    const prev=localForm;
    const next=getAttachedDocs(localForm).filter(d=>d.id!==docId).map(_serializeDoc);
    // Optimistic update: remove from local state immediately so the UI reflects
    // the deletion instantly. The server response must NOT re-introduce the doc.
    setLocalForm(p=>({...p,attachedDocs:next}));
    // v3.39.2-sqlsync: primary write goes straight to MySQL (instant + consistent),
    // independent of the GAS proxy. The SQL handler bumps data_version so the
    // version poller refreshes other tabs/caches immediately.
    api('sqldetachdocument',{formId:formId,documentId:docId,userEmail:_actor})
      .then(res=>{
        // v12.54.14-fix: do NOT overwrite local state with server's attached_docs
        // because the server may still report the deleted document. Instead, keep
        // our optimistic local state (already filtered) and just confirm success.
        toast('Документът е премахнат','success');
        try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}
        _afterMutation();
      })
      .catch(()=>{
        // Fallback to updateForm (docs-only) so the action still lands even if the
        // SQL endpoint is unavailable.
        mutateApi('updateForm',{..._creds,..._adminFlags,id:formId,updates:{attachedDocs:next,userName:_actor}},{
          patches:[_patchForms(row=>({...row,attachedDocs:next}))],
          invalidates:['getforms','getinitialdata']
        }).then(()=>{toast('Документът е премахнат','success');try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}_afterMutation()})
          .catch(err=>{setLocalForm(prev);toast('Грешка при премахване: '+(err&&err.message||''),'error')});
      });
// eslint-disable-next-line react-hooks/exhaustive-deps
},[formId,localForm,isAdmin]);
// Inline upload — sequential to keep payload chunks small & give per-file feedback
const _uploadOne=useCallback(async fileObj=>{
    const tempId='tmp_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);
    setUploadQueue(q=>[...q,{tempId,name:fileObj.name,size:fileObj.size,progress:0.4}]);
    try{
        // v3.39.2-sqlsync: Upload straight to MySQL via the SQL handler (instant +
        // consistent), independent of the GAS proxy. Writes blob to documents + bumps
        // data_version(documents). On success, attach to this form via SQL too.
        const res=await api('uploadmydocument',{userId:_actor,files:[{name:fileObj.name,content:fileObj.content,type:fileObj.type,size:fileObj.size}]});
        if(res&&res.success===false)throw new Error(res.error||'Грешка при качване');
        const uploaded=(res&&res.files&&res.files[0])||null;
        setUploadQueue(q=>q.filter(u=>u.tempId!==tempId));
        if(uploaded&&formId){try{await api('sqlattachdocument',{formId:formId,documentId:uploaded.id,userEmail:_actor});}catch(_){}}
        return res;
    }catch(err){
        setUploadQueue(q=>q.filter(u=>u.tempId!==tempId));
        toast('Грешка при качване „'+fileObj.name+'": '+(err&&err.message||''),'error');
        return false;
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
},[formId,isAdmin]);
const handleUploadFiles=useCallback(async fileList=>{
    const arr=Array.from(fileList||[]);
    if(!arr.length)return;
    const parsed=await Promise.allSettled(arr.map(readFileAsBase64));
    const ok=parsed.filter(r=>r.status==='fulfilled').map(r=>r.value);
    parsed.filter(r=>r.status==='rejected').forEach(r=>toast(r.reason?.message||'Грешка при четене','error'));
    if(!ok.length)return;
    const results=[];
    for(const fo of ok){const r=await _uploadOne(fo);results.push(r);}
    const any=results.some(Boolean);
    if(any){toast(ok.length===1?'Файлът е качен':'Файловете са качени','success');
        // Optimistic localForm update: try to pull fileIds from the last successful response
        try{
            const lastOk=results.filter(Boolean).pop();
            if(lastOk&&Array.isArray(lastOk.fileIds)){
                setLocalForm(p=>({...p,fileIds:lastOk.fileIds}));
            }else if(lastOk&&lastOk.data&&Array.isArray(lastOk.data.fileIds)){
                setLocalForm(p=>({...p,fileIds:lastOk.data.fileIds}));
            }
        }catch(_){}
        // Dispatch forms-changed event so parent views (Преглед) refresh instantly
        try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}
        _afterMutation();
    }
// eslint-disable-next-line react-hooks/exhaustive-deps
},[_uploadOne]);
const onFileInputChange=e2=>{handleUploadFiles(e2.target.files);e2.target.value=''};
const onDrop=e2=>{e2.preventDefault();e2.stopPropagation();setDragging(false);if(canEditDocs)handleUploadFiles(e2.dataTransfer?.files)};
const onDragOver=e2=>{e2.preventDefault();if(canEditDocs)setDragging(true)};
const onDragLeave=e2=>{e2.preventDefault();setDragging(false)};
// Picker → attach (copies metadata reference; backend copies blob to app folder on submit)
const handleAttachDocuments=useCallback(async selectedDocs=>{
    if(!selectedDocs.length){setShowPicker(false);return}
    setShowPicker(false);
    // ── INSTANT optimistic attach: show docs as attached immediately ──
    const current=getAttachedDocs(localForm);
    const optimistic=[...current];
    selectedDocs.forEach(d=>{if(!optimistic.some(x=>x.id===d.id))optimistic.push(_serializeDoc(d));});
    setLocalForm(p=>({...p,attachedDocs:optimistic}));
    toast('Документите са прикачени','success');
    // ── Save original refs to SQL instantly (consistent MySQL store, no GAS dependency) ──
    // Persist each selected doc to applications.attached_docs via the SQL handler
    // so the reference is written the moment the user clicks attach — independent of
    // the GAS proxy being up or down.
    try {
      await Promise.allSettled(selectedDocs.map(function(d){
        return api('sqlattachdocument',{formId:formId,documentId:d.id,userEmail:_actor})
          .then(function(res){
            const srv=res&&res.attached_docs;
            if(srv){try{const arr=typeof srv==='string'?JSON.parse(srv):srv;if(Array.isArray(arr))setLocalForm(p=>({...p,attachedDocs:arr}));}catch(_){}}
            if(res&&res.success)setAttachSavedAt(Date.now());
          }).catch(function(){/* fallback below */});
      }));
    } catch(_){}
    // Fallback: if SQL attach returned nothing usable, also push via updateForm (docs-only).
    try {
      await api('updateForm',{..._creds,..._adminFlags,id:formId,updates:{attachedDocs:optimistic,userName:_actor}});
    } catch(err){ console.warn('Attach SQL-save fallback err:',err&&err.message); }
    // ── Background: copy each doc to app folder, then silently update refs ──
    setPickerBusy(true);
    try{
        // v12.30.1-fix: Track copy failures so we can notify the user
        // v12.31.1-fix: Resolve the REAL Drive file ID from any doc field
        // (driveId / edit-link / preview-link / id) before calling copyDocument.
        // Library & template docs carry a synthetic id (e.g. 'fnisections35')
        // that GAS cannot resolve via DriveApp.getFileById — passing d.id
        // directly is exactly what caused "N документа не можаха да бъдат
        // копирани". _driveIdFromDoc() recovers the canonical 25+ char ID.
        var _copyResults=await Promise.allSettled(selectedDocs.map(function(d){
            var _realId=_driveIdFromDoc(d)||d.driveId||d.id;
            return api('copyDocument',{..._creds,..._adminFlags,docId:_realId,formId:formId})
            .then(function(res){return res&&res.success?res.file:null;});
        }));
        const copyFiles=_copyResults.map(function(r){return r.status==='fulfilled'?r.value:null;});
        let _failedCount=copyFiles.filter(function(cf,i){return !cf && selectedDocs[i];}).length;
        let changed=false;
        const updated=optimistic.slice();
        copyFiles.forEach((cf,i)=>{
            if(cf){
                const idx=updated.findIndex(x=>x.id===selectedDocs[i].id);
                const s=_serializeDoc(cf);
                if(idx>=0){updated[idx]=s;changed=true;}
                else if(!updated.some(x=>x.id===cf.id)){updated.push(s);changed=true;}
            }
        });
        if(changed){
            setLocalForm(p=>({...p,attachedDocs:updated}));
            try { await api('updateForm',{..._creds,..._adminFlags,id:formId,updates:{attachedDocs:updated,userName:_actor}}); } catch(_){}
            for(const d of updated){ try{ await api('sqlattachdocument',{formId:formId,documentId:d.id,userEmail:_actor}); }catch(_){} }
        }
        // Recompute failures AFTER all fallback paths: only warn if a doc
        // is absent from BOTH the copy result AND the attached-docs list.
        _failedCount=selectedDocs.filter(function(sd){
            return sd&&sd.id&&!updated.some(function(u){return u.id===sd.id;});
        }).length;
        if(_failedCount>0){
            var _failedMsg=_failedCount+' документ'+
                (_failedCount===1?' не можа да бъде копиран':'а не можаха да бъдат копирани')+
                '. Те ще бъдат прикачени като препратки и копирани при подаване.';
            console.warn('Attach final failure for '+_failedCount+' doc(s)');
            if(typeof toast==='function') toast(_failedMsg,'warn',6000);
        }
        try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}
        // v12.31.0-attachflicker: Deferred refresh — give the GAS→MySQL async
        // sync time to settle before the parent re-fetches. The optimistic merge
        // in the form-prop effect keeps docs visible during the delay. Without
        // this deferral, the parent loadForms may return stale data if the SQL
        // layer hasn't caught up yet (copyDocument writes via GAS, not PHP/SQL).
        setTimeout(function(){_afterMutation();},3000);
    }catch(err){console.warn('Background copy failed:',err&&err.message);}
    finally{setPickerBusy(false)}
// eslint-disable-next-line react-hooks/exhaustive-deps
},[formId,localForm,isAdmin]);
const handleCopyAttach=useCallback((docId,fId,doc)=>{
    return api('copyDocument',{..._creds,..._adminFlags,docId,formId:fId})
    .then(res=>{
        if(!res||res.success===false)throw new Error((res&&res.error)||'Грешка при копиране');
        const cf=res.file;
        const current=getAttachedDocs(localForm);
        const next=current.some(d=>d.id===cf.id)?current:[...current,_serializeDoc(cf)];
        setLocalForm(p=>({...p,attachedDocs:next}));
        return api('updateForm',{..._creds,..._adminFlags,id:fId,updates:{attachedDocs:next,userName:_actor}});
    })
    .then(()=>{
        // v3.39.2-sqlsync: also persist the copied file ref to MySQL instantly via SQL.
        try { return api('sqlattachdocument',{formId:fId,documentId:cf.id,userEmail:_actor}); } catch(_){ return Promise.resolve(); }
    })
    .then(()=>{toast('Документът е копиран и прикачен','success');try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}_afterMutation()})
    .catch(err=>toast('Грешка: '+(err&&err.message||''),'error'));
// eslint-disable-next-line react-hooks/exhaustive-deps
},[formId,localForm,isAdmin]);
const[previewDoc,setPreviewDoc]=useState(null);
const[editingDoc,setEditingDoc]=useState(null);
// ── Register this component's editor as the global doc editor target ──
useEffect(function(){
  if(typeof window._registerDocEditor==='function')window._registerDocEditor(setEditingDoc);
  return function(){ if(typeof window._unregisterDocEditor==='function')window._unregisterDocEditor(); };
},[]);
const totalDocs=resolvedAttached.length+files.length;
const hasSignatures=!!(signature||signatureAdmin);
const ev=getEvaluation(f);const revs=getReviewers(f);
const hasReview=!!(ev||revs.length>0);
const historyReversed=useMemo(()=>history.length?[...history].reverse():history,[history]);
const[fdTab,setFdTab]=useState(initialTab||(status==='returned'&&totalDocs>0?'docs':'data'));
// Messages state
const[messages,setMessages]=useState([]);const[msgsLoading,setMsgsLoading]=useState(false);const[msgText,setMsgText]=useState('');const[msgSending,setMsgSending]=useState(false);
const[unreadCount,setUnreadCount]=useState(0);
// Budget tab state — MUST be declared here (before any conditional return)
// to keep hook count stable across renders (React error #310).
const rawBudget = form?.budgetBreakdown || form?.budget || {};
const[budget,setBudget]=useState(rawBudget);
const[savingBudget,setSavingBudget]=useState(false);
const[budgetErrors,setBudgetErrors]=useState([]);
// Reset budget state when detail modal opens for a different form
useEffect(function(){
  var raw = form?.budgetBreakdown || form?.budget || {};
  setBudget(raw);
  setBudgetErrors([]);
},[form?.id]);
useEffect(function(){
  var pc = String(form?.projectCode||'').toUpperCase();
  try {
    var _fn = (typeof _computeBudgetViolations==='function') ? _computeBudgetViolations : (typeof window!=='undefined'&&typeof window._computeBudgetViolations==='function' ? window._computeBudgetViolations : null);
    if(_fn){
      var v = _fn(budget, pc, Number(form?.durationMonths)||12, Array.isArray(form?.teamMembers)?form.teamMembers:[]);
      setBudgetErrors(v);
    }
  } catch(e) { /* silently ignore — budget validation is non-critical */ }
},[budget, form?.projectCode, form?.durationMonths, form?.teamMembers]);
// ── Team-change requests tab state (v9.53.0-euronly) ────────────
// MUST be declared before any early-return, before fdTab usage.
// All hooks for this tab are declared unconditionally regardless of
// whether the tab is visible, to satisfy the Rules of Hooks (error #310).
const _canRequestTeamChange = !isAdmin && ['draft','submitted','returned','needs_correction','admin_review','admin_passed'].includes(status) && isOwner;
const _showChangesTab = _canRequestTeamChange || isAdmin;
const[tcRequests,setTcRequests]=useState([]);
const[tcLoading,setTcLoading]=useState(false);
const[tcSubmitting,setTcSubmitting]=useState(false);
// Editor state for new request
const[tcEditMembers,setTcEditMembers]=useState(null); // null = not editing
const[tcEditLeader,setTcEditLeader]=useState(null);   // null = not editing
const[tcDescription,setTcDescription]=useState('');
const[tcMode,setTcMode]=useState('team'); // 'team'|'leader'
const loadTcRequests=useCallback(function(){
  if(!formId)return;setTcLoading(true);
  api('getAppTeamChangeRequests',{formId:formId})
    .then(function(r){setTcRequests(Array.isArray(r.requests)?r.requests:[]);})
    .catch(function(){setTcRequests([]);})
    .finally(function(){setTcLoading(false);});
},[formId]);
useEffect(function(){if(fdTab==='changes')loadTcRequests();},[fdTab,loadTcRequests]);
// ── end team-change state ─────────────────────────────────────────────

const loadMessages=useCallback((silent)=>{
    api('getMessages',{formId}).then(r=>{
        setMessages(Array.isArray(r.messages)?r.messages:[]);
        if(typeof r.unreadCount==='number')setUnreadCount(r.unreadCount);
    }).catch(()=>setMessages([])).finally(()=>{if(!silent)setMsgsLoading(false)});
},[formId]);
useEffect(()=>{if(fdTab==='messages'){loadMessages();api('markMessagesRead',{formId}).catch(()=>{});}},[fdTab,loadMessages,formId]);
// Real-time message polling while Messages tab visible + page focused (12s).
// Also subscribes to the global `erp:messages-changed` event dispatched by the
// data-change stream (app.js handleDataStream) for sub-stream-interval updates.
useEffect(()=>{
    if(fdTab!=='messages'||!formId)return;
    var tid=setInterval(()=>{if(!document.hidden)loadMessages(true)},12000);
    var onChanged=function(){if(!document.hidden)loadMessages(true);};
    try{window.addEventListener('erp:messages-changed',onChanged);}catch(_){}
    return()=>{clearInterval(tid);try{window.removeEventListener('erp:messages-changed',onChanged);}catch(_){}};
},[fdTab,formId,loadMessages]);
const sendMessage=()=>{
    if(!msgText.trim()||msgSending)return;setMsgSending(true);
    api('sendMessage',{formId,message:msgText.trim(),role:isAdmin?'admin':'applicant'})
    .then(()=>{setMsgText('');loadMessages();})
    .catch(err=>toast(err.message||'Грешка при изпращане','error'))
    .finally(()=>setMsgSending(false));
};

return e('div',null,
    returnComment&&status==='returned'&&(()=>{
        const rc=parseReturnComment(returnComment)||{comment:returnComment,deadline:null,deadlineLabel:'',daysLeft:null,expired:false};
        const deadlineColor=rc.expired?'var(--err)':(rc.daysLeft!=null&&rc.daysLeft<=2?'var(--warn)':'var(--ink-3)');
        const daysText=rc.daysLeft==null?'':rc.expired?'Срокът изтече':(rc.daysLeft===1?'Остава 1 ден':'Остават '+rc.daysLeft+' дни');
        return e('div',{className:'return-comment-box'},
            e('strong',null,e('i',{className:'fas fa-exclamation-triangle'}),' Върната за корекция'),
            rc.comment?e('div',{style:{whiteSpace:'pre-wrap',marginTop:'.15rem',color:'var(--ink-2)'}},rc.comment):e('div',{style:{fontStyle:'italic',color:'var(--ink-4)',marginTop:'.15rem'}},'Без допълнителен коментар.'),
            rc.deadline&&e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',marginTop:'.55rem',paddingTop:'.5rem',borderTop:'1px dashed var(--err-border)',fontSize:'.78rem',color:deadlineColor,fontWeight:600}},
                e('i',{className:'fas fa-clock'}),
                'Срок за корекция: ',rc.deadlineLabel,
                daysText&&e('span',{style:{marginLeft:'auto',padding:'.1rem .5rem',background:rc.expired?'var(--err)':(rc.daysLeft!=null&&rc.daysLeft<=2?'var(--warn)':'var(--ink-5)'),color:'#fff',borderRadius:'999px',fontSize:'.7rem',fontWeight:700}},daysText)
            )
        );
    })(),
    (()=>{
        // Single source of truth: map every known status to a step index
        // (0=Чернова, 1=Изпратена, 2=Допустима, 3=Рецензиране, 4=Класиране,
        //  5=Одобрена, 6=Договор). Side branches: returned, rejected.
        // Anything unknown defaults to step 0 so the bar is never blank.
        const STATUS_STEP={
            draft:0,completed:0,
            submitted:1,admin_review:1,resubmitted:1,
            admin_passed:2,eligible:2,
            in_review:3,reviewers_proposed:3,reviewer_assignment:3,
            reviewer_invited:3,reviewer_accepted:3,review_submitted:3,reviewed:3,
            scored:4,ranked:4,proposed_for_funding:4,
            approved_for_funding:5,approved:5,
            contract_draft:6,contract_package_ready:6,contracting:6,
            contract_signed:6,contracted:6,
            // execution onward sits past the proposal lifecycle — pin to last step
            active:6,in_execution:6,progress_updated:6
        };
        const isReturned=status==='returned'||status==='needs_correction';
        const isRejected=status==='rejected'||status==='ineligible';
        const cur=STATUS_STEP[status];
        const curStep=(typeof cur==='number')?cur:0;
        const stepCls=idx=>idx<curStep?'done':(idx===curStep?'current':'');
        const STEPS=[
            {icon:'fa-pen', label:''},
            {icon:'fa-paper-plane',   label:'Изпратена'},
            {icon:'fa-clipboard-check',label:'Допустима'},
            {icon:'fa-user-check',    label:'Рецензиране'},
            {icon:'fa-sort-amount-down',label:'Класиране'},
            {icon:'fa-check-double',  label:'Одобрена'},
            {icon:'fa-file-signature',label:'Договор'}
        ];
        const nodes=[];
        STEPS.forEach((s,idx)=>{
            if(idx>0) nodes.push(e('i',{key:'a'+idx,className:'fas fa-chevron-right fd-status-arrow'}));
            nodes.push(e('span',{key:'s'+idx,className:('fd-status-step '+stepCls(idx)).trim()},
                e('i',{className:'fas '+s.icon}),' ',s.label));
        });
        if(isReturned){
            nodes.push(e('i',{key:'aR',className:'fas fa-chevron-right fd-status-arrow'}));
            nodes.push(e('span',{key:'sR',className:'fd-status-step current fd-status-step-warn'},
                e('i',{className:'fas fa-undo'}),' Върната'));
        }
        if(isRejected){
            nodes.push(e('i',{key:'aX',className:'fas fa-chevron-right fd-status-arrow'}));
            nodes.push(e('span',{key:'sX',className:'fd-status-step current fd-status-step-err'},
                e('i',{className:'fas fa-times-circle'}),' Отхвърлена'));
        }
        return e('div',{className:'fd-status-timeline'},nodes);
    })(),
    e('div',{className:'fd-tabs'},
        e('button',{className:'fd-tab '+(fdTab==='data'?'active':''),onClick:()=>setFdTab('data')},e('i',{className:'fas fa-info-circle'}),' Данни'),
        e('button',{className:'fd-tab '+(fdTab==='docs'?'active':''),onClick:()=>setFdTab('docs')},e('i',{className:'fas fa-folder-open'}),' Документи ',e('span',{className:'fd-tab-badge '+(totalDocs>0?'has-items':'empty')},totalDocs)),
        hasSignatures&&e('button',{className:'fd-tab '+(fdTab==='sign'?'active':''),onClick:()=>setFdTab('sign')},e('i',{className:'fas fa-signature'}),' Подписи'),
        hasReview&&e('button',{className:'fd-tab '+(fdTab==='review'?'active':''),onClick:()=>setFdTab('review')},e('i',{className:'fas fa-star-half-alt'}),' Оценка'),
        history.length>0&&e('button',{className:'fd-tab '+(fdTab==='history'?'active':''),onClick:()=>setFdTab('history')},e('i',{className:'fas fa-history'}),' История ',e('span',{className:'fd-tab-badge '+(history.length>0?'has-items':'empty')},history.length)),
        e('button',{className:'fd-tab '+(fdTab==='messages'?'active':''),onClick:()=>setFdTab('messages')},e('i',{className:'fas fa-comments'}),' Съобщения',unreadCount>0&&e('span',{className:'fd-tab-badge has-items',style:{background:'var(--err)',color:'#fff',marginLeft:'.35rem'}},unreadCount)),
        // ── Budget tab (always visible, shows compliance status) ──
        e('button',{className:'fd-tab '+(fdTab==='budget'?'active':''),onClick:()=>setFdTab('budget')},e('i',{className:'fas fa-coins',style:{color:'var(--gold)'}}),' Бюджет'),
        // ── Changes tab: team/leader change requests (v9.53.0-euronly) ──
        _showChangesTab&&e('button',{className:'fd-tab '+(fdTab==='changes'?'active':''),onClick:()=>setFdTab('changes')},
          e('i',{className:'fas fa-users-cog'}),
          ' Промени',
          tcRequests.filter(function(r){return r.status==='submitted';}).length>0&&
            e('span',{className:'fd-tab-badge has-items',style:{background:'var(--warn)',color:'#fff',marginLeft:'.35rem'}},tcRequests.filter(function(r){return r.status==='submitted';}).length)
        )
    ),
    fdTab==='data'&&e(Fragment,null,
    e('div',{className:'detail-grid'},
    e('div',{className:'detail-item'},e('div',{className:'detail-label'},'ID'),e('div',{className:'detail-val is-mono'},getId(form)||'—')),
    e('div',{className:'detail-item'},e('div',{className:'detail-label'},'Статус'),e('div',{className:'detail-val'},e(Badge,{status}))),
    e('div',{className:'detail-item'},e('div',{className:'detail-label'},'Кандидат'),e('div',{className:'detail-val'},getName(form)||'—')),
    e('div',{className:'detail-item'},e('div',{className:'detail-label'},'Имейл'),e('div',{className:'detail-val is-email'},getEmail(form)||'—')),
    e('div',{className:'detail-item'},e('div',{className:'detail-label'},'Тип проект'),e('div',{className:'detail-val'},getProjectType(form)?e('span',{className:'type-tag'},getProjectType(form)):'—')),
    e('div',{className:'detail-item'},e('div',{className:'detail-label'},'Конкурс'),e('div',{className:'detail-val is-muted'},compName)),
    e('div',{className:'detail-item'},e('div',{className:'detail-label'},'Направление'),e('div',{className:'detail-val is-muted'},(function(){var areas=getAreas(form);if(!areas.length)return'—';return e(Fragment,null,areas.map(function(a){return e('span',{key:a,className:'area-chip',style:{display:'inline-block',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill)',padding:'.08rem .5rem',fontSize:'.72rem',marginRight:'.25rem',marginBottom:'.15rem'}},a);}));})())),
    e('div',{className:'detail-item'},e('div',{className:'detail-label'},'Последна редакция'),e('div',{className:'detail-val'},(function(){var d=getLastActivityDate(form);return d?fmtDateTime(d):'—'})())),
    e('div',{className:'detail-item detail-full'},e('div',{className:'detail-label'},'Наименование'),e('div',{className:'detail-val is-title'},getTitle(form)||'—')),
    e('div',{className:'detail-item detail-full'},e('div',{className:'detail-label'},'Описание'),e('div',{className:'detail-val is-description'},getDescription(form)||'—'))
    )
    ),
    // ── Budget tab: view/edit budget in detail sheet ──
    fdTab==='budget'&&e(Fragment,null,
      (function(){
        var pc = String(form?.projectCode||'').toUpperCase();
        var isEditable = isOwner && (status==='draft'||status==='returned'||status==='needs_correction');
        var budgetBlockers = budgetErrors.filter(function(v){return v.severity==='high';});
        var hasBudget = Object.keys(budget).filter(function(k){return k!=='_monthlyMode'&&k!=='_monthly';}).length > 0;
        var pt = (typeof PROJECT_TYPES!=='undefined')?PROJECT_TYPES.find(function(p){return p.value===pc}):null;
        var maxBudget = pt?pt.maxBudget*((typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583):0;

        var handleBudgetSave = function(){
          if(budgetBlockers.length>0){toast('Коригирайте нарушенията преди запис.','error');return}
          setSavingBudget(true);
          var uName = isAdmin ? 'Администратор' : (user?.name || form?.userName || form?.name || '');
          var uEmail = user?.email || form?.userEmail || form?.email || (typeof _currentUserEmail!=='undefined'?_currentUserEmail:'');
          var payload = {id:getId(form),updates:{budget:budget,userName:uName,userId:uEmail}};
          if(isAdmin&&typeof _adminCreds!=='undefined')Object.assign(payload,_adminCreds);
          api('updateForm',payload)
            .then(function(){toast('Бюджетът е запазен.','success');if(typeof onRefresh==='function')onRefresh({silent:true});})
            .catch(function(err){toast(err.message||'Грешка при запис','error');})
            .finally(function(){setSavingBudget(false);});
        };

        return e('div',null,
          // ── Live calculation summary ──
          (function(){
            var _eur = (typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;
            // Compute grand total from budget (same logic as _computeBudgetViolations)
            var totals = {}, grand = 0;
            ['salaries','external_services','assets','consumables','literature','travel','publications','reviews','other'].forEach(function(gid){totals[gid]=0;});
            Object.keys(budget).forEach(function(gid){if(gid==='_monthlyMode'||gid==='_monthly')return;var byYear=budget[gid]||{};Object.keys(byYear).forEach(function(yr){var v=Number(byYear[yr])||0;totals[gid]=(totals[gid]||0)+v;grand+=v;});});
            // Also include monthly mode values
            var mData = budget._monthly || {};
            Object.keys(mData).forEach(function(mgid){
              var mbyPeriod = mData[mgid] || {};
              Object.keys(mbyPeriod).forEach(function(mk){grand += Number(mbyPeriod[mk])||0;});
            });
            var grandEUR = grand / _eur;
            var maxBGN = maxBudget;
            var maxEUR = maxBGN / _eur;
            var remainingEUR = maxBGN > 0 ? Math.max(0, maxEUR - grandEUR) : 0;
            var pctUsed = maxBGN > 0 ? (grand / maxBGN) * 100 : 0;
            var pctColor = pctUsed > 100 ? 'var(--err)' : pctUsed > 90 ? 'var(--warn)' : pctUsed > 0 ? 'var(--ok)' : 'var(--ink-4)';
            if(!hasBudget && !maxBGN) return null;
            return e('div',{style:{marginBottom:'.75rem',padding:'.65rem .85rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))',gap:'.5rem'}},
              e('div',null,
                e('div',{style:{fontSize:'.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--ink-4)',marginBottom:'.15rem'}},'Общо (€)'),
                e('div',{style:{fontSize:'1rem',fontWeight:800,color:grandEUR>0?'var(--ink)':'var(--ink-4)',fontFamily:'Consolas,Menlo,monospace'}},grandEUR.toFixed(2),' €')
              ),
              maxBGN > 0 ? e('div',null,
                e('div',{style:{fontSize:'.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--ink-4)',marginBottom:'.15rem'}},'Оставащ бюджет'),
                e('div',{style:{fontSize:'.95rem',fontWeight:700,color:remainingEUR>0?'var(--ok)':'var(--err)',fontFamily:'Consolas,Menlo,monospace'}},remainingEUR.toFixed(2),' €')
              ) : null,
              maxBGN > 0 ? e('div',null,
                e('div',{style:{fontSize:'.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--ink-4)',marginBottom:'.15rem'}},'Използвано'),
                e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem'}},
                  e('div',{style:{flex:1,height:8,background:'var(--border)',borderRadius:4,overflow:'hidden'}},
                    e('div',{style:{height:'100%',width:Math.min(pctUsed,100)+'%',background:pctColor,borderRadius:4,transition:'width .35s ease'}})
                  ),
                  e('span',{style:{fontSize:'.8rem',fontWeight:700,color:pctColor,whiteSpace:'nowrap'}},pctUsed.toFixed(1),'%')
                )
              ) : null
            );
          })(),
          e('div',{style:{marginBottom:'.6rem',display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap'}},
            hasBudget
              ?(budgetBlockers.length===0
                ?e('span',{style:{fontSize:'.72rem',background:'var(--ok-bg)',color:'var(--ok)',padding:'.15rem .55rem',borderRadius:10,fontWeight:600}},e('i',{className:'fas fa-check-circle'}),' Бюджетът отговаря на изискванията за '+pc)
                :e('span',{style:{fontSize:'.72rem',background:'var(--err-bg)',color:'var(--err)',padding:'.15rem .55rem',borderRadius:10,fontWeight:600}},e('i',{className:'fas fa-exclamation-triangle'}),' '+budgetBlockers.length+' нарушени'+(budgetBlockers.length===1?'е':'я')+' за '+pc))
              :e('span',{style:{fontSize:'.72rem',color:'var(--ink-4)',fontStyle:'italic'}},'Все още не е попълнен бюджет'),
            maxBudget>0&&e('span',{style:{fontSize:'.68rem',color:'var(--ink-3)',marginLeft:'auto'}},'Максимум: '+(maxBudget/((typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583)).toFixed(0)+' €')
          ),
          budgetErrors.length>0&&e('div',{style:{marginBottom:'.5rem',padding:'.5rem .65rem',background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:6,fontSize:'.72rem'}},
            budgetErrors.map(function(v,i){return e('div',{key:i,style:{padding:'.15rem 0',color:v.severity==='high'?'var(--err)':'var(--warn)',display:'flex',alignItems:'flex-start',gap:'.3rem'}},e('i',{className:'fas fa-circle',style:{fontSize:'.3rem',marginTop:'.35rem',flexShrink:0}}),v.message);})
          ),
          (typeof BudgetEditor==='function')&&e('div',{style:{maxHeight:isEditable?'none':'50vh',overflowY:'auto'}},
            e(BudgetEditor,{value:budget,onChange:isEditable?setBudget:function(){},durationMonths:Number(form?.durationMonths)||12,projectCode:pc,totalBudget:maxBudget,readOnly:!isEditable,budgetViolations:budgetErrors})
          ),
          isEditable&&e('div',{style:{marginTop:'.75rem',display:'flex',alignItems:'center',gap:'.5rem',justifyContent:'flex-end'}},
            e('button',{className:'btn btn-primary',disabled:savingBudget||budgetBlockers.length>0,onClick:handleBudgetSave},
              savingBudget?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-save'}),
              savingBudget?' Запазване...':' Запази бюджет'
            )
          )
        );
      })()
    ),
    fdTab==='sign'&&e(Fragment,null,
    (signature||signatureAdmin)&&e('div',{style:{marginTop:'1rem'}},
    e('div',{className:'section-label'},e('i',{className:'fas fa-signature'}),' Подписи'),
    e('div',{style:{display:'flex',gap:'1.5rem',flexWrap:'wrap',marginTop:'.4rem'}},
        e('div',{style:{display:'flex',flexDirection:'column',gap:'.35rem',minWidth:0}},
        e('div',{style:{fontSize:'.62rem',fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.3rem'}},
            e('i',{className:'fas fa-user',style:{color:'var(--info)'}}),' Подпис на кандидата'
        ),
        signature&&isImageSignature(signature)
            ?e('img',{src:signature,alt:'Подпис кандидат',style:{maxWidth:'220px',maxHeight:'90px',border:'1.5px solid var(--info-border)',borderRadius:'var(--r-xs)',padding:'6px',background:'var(--surface)',boxShadow:'var(--shadow-xs)'}})
            :e('div',{style:{fontSize:'.75rem',color:'var(--ink-4)',fontStyle:'italic',padding:'.4rem .6rem',background:'var(--bg)',borderRadius:'var(--r-xs)',border:'1px dashed var(--border)'}},'Няма подпис')
        ),
        e('div',{style:{display:'flex',flexDirection:'column',gap:'.35rem',minWidth:0}},
        e('div',{style:{fontSize:'.62rem',fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-4)',display:'flex',alignItems:'center',gap:'.3rem'}},
            e('i',{className:'fas fa-user-shield',style:{color:'var(--ok)'}}),' Подпис на администратора'
        ),
        signatureAdmin&&isImageSignature(signatureAdmin)
            ?e('img',{src:signatureAdmin,alt:'Подпис администратор',style:{maxWidth:'220px',maxHeight:'90px',border:'1.5px solid var(--ok-border)',borderRadius:'var(--r-xs)',padding:'6px',background:'var(--surface)',boxShadow:'var(--shadow-xs)'}})
            :e('div',{style:{fontSize:'.75rem',color:'var(--ink-4)',fontStyle:'italic',padding:'.4rem .6rem',background:'var(--bg)',borderRadius:'var(--r-xs)',border:'1px dashed var(--border)'}},'Не е одобрено')
        )
    )
    ),
    !hasSignatures&&e('div',{className:'fd-docs-empty'},e('i',{className:'fas fa-signature'}),e('p',null,'Няма налични подписи за тази заявка.'))
    ),
    fdTab==='docs'&&e(Fragment,null,
    /* ─── Inline doc management toolbar — Google-styled ─── */
    canAttachDocs&&e('div',{className:'fd-docs-toolbar',style:{display:'flex',gap:'.5rem',alignItems:'center',flexWrap:'wrap',marginBottom:'.6rem'}},
        e('button',{className:'btn btn-teal',type:'button',onClick:()=>{if(fileInputRef.current){fileInputRef.current.value='';fileInputRef.current.click();}},disabled:pickerBusy},
            e('i',{className:'fas fa-file-upload'}),' Прикачи файл от устройство'),
        e('button',{className:'btn btn-outline btn-sm',type:'button',onClick:()=>setShowPicker(true),disabled:pickerBusy},
            pickerBusy?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-link'}),' Прикачи формуляр'),
        e('input',{ref:fileInputRef,type:'file',multiple:true,accept:'.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',onChange:onFileInputChange,style:{display:'none'}})
    ),
    canAttachDocs&&e('div',{
        className:'upload-dropzone'+(dragging?' dragover':''),
        style:{marginBottom:'.65rem',padding:'.7rem',fontSize:'.78rem'},
        onDragOver:onDragOver,onDragLeave:onDragLeave,onDrop:onDrop,
        onClick:()=>fileInputRef.current&&fileInputRef.current.click()
    },
        e('i',{className:'fas fa-cloud-upload-alt',style:{fontSize:'1rem',marginRight:'.4rem',color:'var(--ink-4)'}}),
        e('span',null,dragging?'Пуснете файловете тук':'Плъзнете файлове тук или кликнете'),
        e('span',{style:{marginLeft:'.4rem',color:'var(--ink-5)',fontSize:'.7rem'}},'PDF, DOC, XLS, JPG, PNG · ≤10 MB')
    ),
    uploadQueue.length>0&&e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.3rem',marginBottom:'.5rem'}},
        uploadQueue.map(u=>e('span',{key:u.tempId,className:'file-chip',style:{opacity:.7}},
            e('i',{className:'fas fa-spinner spin',style:{fontSize:'.68rem',color:'var(--info)'}}),
            (u.name||'').slice(0,40),' · ',e('span',{style:{color:'var(--ink-4)',fontSize:'.67rem'}},'качване…')
        ))
    ),
    e('div',{className:'fd-docs-card'},
    e('div',{className:'fd-docs-card-head'},e('i',{className:'fas fa-book'}),e('span',null,'Прикачени официални документи'),resolvedAttached.length>0&&e('span',{className:'fd-tab-badge has-items',style:{marginLeft:'auto'}},resolvedAttached.length)),
    attachSavedAt>0&&e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',marginBottom:'.5rem',background:'var(--ok-bg,#e6f4ea)',border:'1px solid var(--ok-border,#34a853)',borderRadius:'var(--r-sm,6px)',padding:'.4rem .6rem',fontSize:'.74rem',color:'var(--ok,#1e7e34)',fontWeight:600}},e('i',{className:'fas fa-check-circle'}),e('span',null,'Запазено към заявката — документите са прикачени в системата')),
    resolvedAttached.length>0?e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.35rem'}},
        resolvedAttached.map((d,i)=>{const vis=getDocVisuals(d);var _id=d.driveId||d.fileId||d.id||'';const dlFid=_id&&!/^(s_|doc_|up_|f_|copied_)/.test(_id)?_id:null;const isGenerated=!!d._generated;const _anyDriveId=dlFid||(d.id&&!/^(s_|doc_|up_|f_|copied_)/.test(d.id)?d.id:null)||(d.fileId&&!/^(s_|doc_|up_|f_|copied_)/.test(d.fileId)?d.fileId:null);return e('span',{key:d.id||i,className:'file-chip',style:{borderColor:'var(--warn-border)',background:'var(--gold-glow)'}},
            e('i',{className:'fas '+vis.icon,style:{fontSize:'.68rem',color:'var(--gold)',cursor:'pointer'},onClick:()=>setPreviewDoc(d)}),
            e('span',{style:{fontWeight:600,cursor:'pointer'},onClick:()=>setPreviewDoc(d)},(d.name||'Документ').slice(0,35)),
            e('i',{className:'fas fa-eye',style:{fontSize:'.6rem',color:'var(--ink-4)',marginLeft:'.2rem',cursor:'pointer'},onClick:()=>setPreviewDoc(d)}),
            // v10.3.0-edit-ux: Clean edit button for draft/returned docs
            _anyDriveId&&canEditDocs&&e('button',{type:'button',className:'btn btn-gold btn-xs',style:{marginLeft:'.25rem',padding:'.12rem .55rem',fontSize:'.68rem',fontWeight:700,lineHeight:1.3},title:'Отвори за редакция в Google Docs',onClick:ev=>{ev.stopPropagation();setEditingDoc(d);}},e('i',{className:'fas fa-edit',style:{marginRight:'.2rem'}}),'Редактирай'),
            dlFid&&e('button',{type:'button',className:'remove-attached',title:'Изтегли',onClick:ev=>{ev.stopPropagation();if(typeof window._proxyDownload==='function')window._proxyDownload(dlFid,d.name,formId)}},e('i',{className:'fas fa-download',style:{fontSize:'.65rem',color:'var(--brand-teal)'}})),
            canEditDocs&&e('button',{type:'button',className:'remove-attached',title:'Премахни',onClick:ev=>{ev.stopPropagation();handleRemoveDoc(d.id)},style:{background:'none',border:'none',color:'var(--err)',cursor:'pointer',marginLeft:'.25rem',padding:0,lineHeight:1,fontSize:'.78rem'}},'✕')
        )})
    ):e('div',{style:{padding:'1rem',textAlign:'center',color:'var(--ink-5)',fontSize:'.8rem'}},e('i',{className:'fas fa-folder-open',style:{display:'block',fontSize:'1.2rem',marginBottom:'.4rem'}}),e('span',null,'Няма прикачени официални документи'))
    ),
    e('div',{className:'fd-docs-card',style:{marginTop:'.65rem'}},
    e('div',{className:'fd-docs-card-head'},e('i',{className:'fas fa-paperclip'}),e('span',null,'Качени файлове'),files.length>0&&e('span',{className:'fd-tab-badge has-items',style:{marginLeft:'auto'}},files.length)),
    files.length>0?e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.35rem'}},files.map((fl,i)=>{
        // Prefer the hardened preview link for in-browser viewing. NEVER point
        // the name link at fl.downloadUrl (drive.usercontent.google.com → HTTP
        // 500 for script-owned binaries). Downloads go through the proxy button.
        const _open=fl.previewLink||(fl.fileId?'https://drive.google.com/file/d/'+encodeURIComponent(fl.fileId)+'/preview':'');
        return e('span',{key:fl.fileId||i,className:'file-chip'},
            e('i',{className:'fas fa-paperclip',style:{fontSize:'.68rem',color:'var(--ink-4)'}}),
            _open?e('a',{href:_open,target:'_blank',rel:'noopener noreferrer'},fl.name||'Файл '+(i+1)):(fl.name||'Файл '+(i+1)),
            fl.size&&e('span',{style:{color:'var(--ink-4)',fontSize:'.67rem'}},' · '+fl.size),
            // Edit button for uploaded files with a Drive fileId — opens InlineDocEditorModal
            canEditDocs&&fl.fileId&&e('button',{type:'button',className:'btn btn-gold btn-xs',style:{marginLeft:'.25rem',padding:'.12rem .55rem',fontSize:'.68rem',fontWeight:700,lineHeight:1.3},title:'Отвори за редакция в Google Workspace',onClick:ev=>{ev.stopPropagation();var _edoc={id:fl.fileId,name:fl.name,mimeType:fl.mimeType||'',previewLink:fl.previewLink||_open,downloadUrl:fl.downloadUrl,folderName:fl.folderName||'',driveId:fl.fileId};setEditingDoc(_edoc);}},e('i',{className:'fas fa-edit',style:{marginRight:'.2rem'}}),'Редактирай'),
            fl.fileId&&e('button',{type:'button',className:'remove-attached',title:'Изтегли файла',onClick:ev=>{ev.stopPropagation();_proxyDownload(fl.fileId,fl.name,formId)},style:{background:'none',border:'none',color:'var(--ink-4)',cursor:'pointer',marginLeft:'.2rem',padding:0,lineHeight:1,fontSize:'.72rem'}},e('i',{className:'fas fa-download'})),
            canEditDocs&&fl.fileId&&e('button',{type:'button',className:'remove-attached',title:'Изтрий файла',onClick:ev=>{ev.stopPropagation();if(typeof window!=='undefined'&&window.confirm&&!window.confirm('Изтриване на „'+(fl.name||'файла')+'"?'))return;handleDeleteFile(fl.fileId)},style:{background:'none',border:'none',color:'var(--err)',cursor:'pointer',marginLeft:'.25rem',padding:0,lineHeight:1,fontSize:'.78rem'}},'✕')
        );
    })):e('div',{style:{padding:'1rem',textAlign:'center',color:'var(--ink-5)',fontSize:'.8rem'}},e('i',{className:'fas fa-cloud-upload-alt',style:{display:'block',fontSize:'1.2rem',marginBottom:'.4rem'}}),e('span',null,'Няма качени файлове'))
    ),
    !canEditDocs&&!canAttachDocs&&totalDocs===0&&e('div',{style:{marginTop:'.75rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-sm)',padding:'.75rem 1rem',fontSize:'.78rem',color:'var(--info)',display:'flex',alignItems:'center',gap:'.5rem'}},e('i',{className:'fas fa-info-circle'}),e('span',null,'Няма документи. Редактирането е възможно само за чернови и върнати заявления.'))
    ),

    fdTab==='review'&&e(Fragment,null,
    /* ─── Evaluation Score Display ─── */
    (()=>{
        if(!ev&&revs.length===0)return null;
        return e('div',{style:{marginTop:'1.25rem'}},
            ev&&e('div',{style:{marginBottom:revs.length?'1rem':'0'}},
                e('div',{className:'section-label'},e('i',{className:'fas fa-star-half-alt',style:{color:'var(--gold)'}}),' Оценка на проекта'),
                e('div',{style:{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'var(--r-sm)',padding:'1rem 1.15rem'}},
                    e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'1rem',marginBottom:'.75rem',flexWrap:'wrap'}},
                        e('div',{style:{display:'flex',alignItems:'center',gap:'.65rem'}},
                            e('div',{style:{width:48,height:48,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:'1.1rem',color:'#fff',background:scoreGrade(ev.totalScore||0)==='high'?'var(--ok)':scoreGrade(ev.totalScore||0)==='medium'?'var(--warn)':'var(--err)'}},ev.totalScore||0),
                            e('div',null,
                                e('div',{style:{fontWeight:700,fontSize:'.88rem'}},ev.status==='approved'?'Одобрен':'Отхвърлен'),
                                e('div',{style:{fontSize:'.7rem',color:'var(--ink-4)'}},ev.totalScore||0,' / ',ev.maxScore||EVAL_MAX_SCORE,' точки')
                            )
                        ),
                        e('div',{style:{display:'flex',gap:'.5rem',alignItems:'center',flexWrap:'wrap'}},
                            ev.evaluator&&e('span',{style:{fontSize:'.7rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-user-shield',style:{marginRight:'.25rem'}}),ev.evaluator),
                            ev.date&&e('span',{style:{fontSize:'.7rem',color:'var(--ink-4)'}},e('i',{className:'far fa-calendar',style:{marginRight:'.25rem'}}),fmtDate(ev.date))
                        )
                    ),
                    ev.scores&&e('div',{style:{display:'grid',gap:'.4rem'}},
                        EVAL_RUBRIC.map(cat=>{
                            const catScore=cat.subcriteria.reduce((s,sub)=>s+(Number(ev.scores[sub.id])||0),0);
                            const pct=cat.maxTotal>0?Math.round(catScore/cat.maxTotal*100):0;
                            return e('div',{key:cat.id,style:{display:'flex',alignItems:'center',gap:'.65rem',fontSize:'.78rem',padding:'.35rem 0'}},
                                e('div',{style:{flex:'1 1 auto',minWidth:0,fontWeight:600,color:'var(--ink-2)'}},cat.label),
                                e('div',{style:{width:90,height:6,borderRadius:3,background:'var(--bg)',overflow:'hidden',flexShrink:0}},
                                    e('div',{style:{width:pct+'%',height:'100%',borderRadius:3,background:pct>=80?'var(--ok)':pct>=50?'var(--warn)':'var(--err)',transition:'width .4s'}})
                                ),
                                e('div',{style:{width:50,textAlign:'right',fontWeight:700,fontSize:'.72rem',color:pct>=80?'var(--ok)':pct>=50?'var(--warn)':'var(--err)',flexShrink:0}},catScore,' / ',cat.maxTotal)
                            );
                        })
                    ),
                    ev.comment&&e('div',{style:{marginTop:'.65rem',padding:'.6rem .8rem',background:'var(--bg)',borderRadius:'var(--r-xs)',fontSize:'.78rem',color:'var(--ink-2)',fontStyle:'italic',borderLeft:'3px solid var(--border-2)'}},e('i',{className:'fas fa-comment-alt',style:{marginRight:'.35rem',color:'var(--ink-4)'}}),' ',ev.comment)
                )
            ),
            revs.length>0&&e('div',null,
                e('div',{className:'section-label'},e('i',{className:'fas fa-user-check',style:{color:'var(--info)'}}),' Рецензенти (',revs.length,')'),
                e('div',{style:{display:'grid',gap:'.5rem'}},
                    revs.map((rv,i)=>{
                        const isStr=typeof rv==='string';
                        const rvEmail=isStr?rv:(rv.email||'');
                        const rvName=isStr?rv:(rv.name||rv.email||'Рецензент');
                        const rvStatus=isStr?'assigned':(rv.status||'assigned');
                        const rvScore=isStr?null:rv.score;
                        const rvReview=isStr?null:rv.review;
                        const statusColors={submitted:'var(--ok)',assigned:'var(--info)',declined:'var(--err)',reviewed:'var(--ok)',consented:'var(--gold)',pending:'var(--ink-4)'};
                        const statusIcons={submitted:'fa-check',assigned:'fa-clock',declined:'fa-times',reviewed:'fa-check-double',consented:'fa-handshake',pending:'fa-hourglass-half'};
                        const statusTexts={submitted:'Подадена',assigned:'Назначен',declined:'Отказана',reviewed:'Рецензирана',consented:'Съгласие',pending:'В очакване'};
                        let parsedReview=null;
                        if(rvReview&&typeof rvReview==='string'){try{const p=JSON.parse(rvReview);if(p&&typeof p==='object')parsedReview=p}catch(_){}}
                        const hasRubric=parsedReview&&parsedReview.scores&&Object.keys(parsedReview.scores).length>0;
                        const rubricTotal=hasRubric?calcRubricTotal(parsedReview.scores):(Number(rvScore)||0);
                        const rubricPct=Math.round(rubricTotal/EVAL_MAX_SCORE*100);
                        const rubricGrade=scoreGrade(rubricTotal);
                        return e('div',{key:rvEmail||i,style:{background:'var(--white)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',overflow:'hidden'}},
                            e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',padding:'.5rem .75rem'}},
                                e('i',{className:'fas '+(statusIcons[rvStatus]||'fa-user'),style:{fontSize:'.65rem',color:statusColors[rvStatus]||'var(--ink-4)'}}),
                                e('span',{style:{fontWeight:600,fontSize:'.78rem',flex:1}},rvName),
                                e('span',{style:{fontSize:'.62rem',fontWeight:700,color:statusColors[rvStatus]||'var(--ink-4)',padding:'.15rem .4rem',background:rvStatus==='reviewed'||rvStatus==='submitted'?'var(--ok-bg)':rvStatus==='declined'?'var(--err-bg)':'var(--bg)',borderRadius:'var(--r-pill)'}},statusTexts[rvStatus]||rvStatus),
                                rubricTotal>0&&e('span',{style:{fontSize:'.72rem',fontWeight:700,color:rubricGrade==='high'?'var(--ok)':rubricGrade==='medium'?'var(--warn)':'var(--err)'}},rubricTotal,' / ',EVAL_MAX_SCORE)
                            ),
                            hasRubric&&e('div',{style:{padding:'0 .75rem .6rem',borderTop:'1px solid var(--border)'}},
                                e('div',{style:{display:'grid',gap:'.3rem',paddingTop:'.5rem'}},
                                    EVAL_RUBRIC.map(function(cat){
                                        var catScore=cat.subcriteria.reduce(function(s,sub){return s+(Number(parsedReview.scores[sub.id])||0)},0);
                                        var pct=cat.maxTotal>0?Math.round(catScore/cat.maxTotal*100):0;
                                        return e('div',{key:cat.id,style:{display:'flex',alignItems:'center',gap:'.5rem',fontSize:'.72rem'}},
                                            e('div',{style:{flex:'1 1 auto',minWidth:0,color:'var(--ink-3)'}},cat.label),
                                            e('div',{style:{width:70,height:5,borderRadius:3,background:'var(--bg)',overflow:'hidden',flexShrink:0}},
                                                e('div',{style:{width:pct+'%',height:'100%',borderRadius:3,background:pct>=80?'var(--ok)':pct>=50?'var(--warn)':'var(--err)'}})
                                            ),
                                            e('div',{style:{width:42,textAlign:'right',fontWeight:700,fontSize:'.66rem',color:pct>=80?'var(--ok)':pct>=50?'var(--warn)':'var(--err)',flexShrink:0}},catScore,'/',cat.maxTotal)
                                        )
                                    })
                                ),
                                parsedReview.recommendation&&e('div',{style:{marginTop:'.4rem',fontSize:'.7rem',fontWeight:700,color:parsedReview.recommendation==='approve'?'var(--ok)':'var(--err)'}},
                                    e('i',{className:'fas '+(parsedReview.recommendation==='approve'?'fa-thumbs-up':'fa-thumbs-down'),style:{marginRight:'.25rem'}}),
                                    parsedReview.recommendation==='approve'?'Одобрявам':'Не одобрявам'
                                ),
                                parsedReview.comment&&e('div',{style:{marginTop:'.35rem',fontSize:'.72rem',color:'var(--ink-3)',fontStyle:'italic',borderLeft:'2px solid var(--border)',paddingLeft:'.5rem'}},parsedReview.comment.length>150?parsedReview.comment.slice(0,150)+'…':parsedReview.comment)
                            ),
                            parsedReview&&parsedReview.decline&&e('div',{style:{padding:'.4rem .75rem',background:'var(--err-bg)',fontSize:'.72rem',color:'var(--err)',borderTop:'1px solid var(--err-border)'}},
                                e('i',{className:'fas fa-ban',style:{marginRight:'.25rem'}}),'Отказана',
                                parsedReview.reason&&e('span',{style:{marginLeft:'.25rem',color:'var(--ink-3)'}},'— ',parsedReview.reason)
                            )
                        );
                    })
                )
            )
        );
    })(),
    !hasReview&&e('div',{className:'fd-docs-empty'},e('i',{className:'fas fa-star-half-alt'}),e('p',null,'Няма налични оценки или рецензии за тази заявка.'))
    ),
    fdTab==='history'&&e(Fragment,null,
    history.length>0?e('div',{style:{marginTop:'1rem'}},e('div',{className:'section-label'},e('i',{className:'fas fa-history'}),' История'),historyReversed.map((h,i)=>e('div',{key:(h.id||(h.date||'')+'|'+(h.action||'')+'|'+i),className:'history-entry'},e('div',{className:'action'},humanizeAction(h.action)),e('div',{className:'meta'},[h.user&&'от '+h.user,h.date&&fmtDateTime(h.date),h.comment&&'„'+humanizeAction(h.comment)+'"'].filter(Boolean).join(' · '))))):e('div',{className:'fd-docs-empty'},e('i',{className:'fas fa-history'}),e('p',null,'Няма записи в историята.'))
    ),
    fdTab==='messages'&&e('div',{style:{display:'flex',flexDirection:'column',gap:'.65rem',marginTop:'.5rem'}},
        msgsLoading
            ?e('div',{style:{textAlign:'center',padding:'1.5rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-spinner fa-spin'}))
            :messages.length===0
                ?e('div',{className:'fd-docs-empty'},e('i',{className:'fas fa-comments'}),e('p',null,'Няма съобщения. Изпратете първото.'))
                :e('div',{style:{display:'flex',flexDirection:'column',gap:'.45rem',maxHeight:'40vh',overflowY:'auto',paddingBottom:'.5rem'}},
                    messages.map((m,i)=>{
                        const own=(isAdmin&&m.role==='admin')||(!isAdmin&&m.role==='applicant');
                        return e('div',{key:m.id||i,className:'chat-bubble '+(own?'own':'other')},
                            e('div',{className:'chat-bubble-content'},m.message),
                            e('div',{className:'chat-bubble-meta'},
                                e('span',null,m.senderEmail||m.role),
                                e('span',null,m.timestamp?fmtDateTime(m.timestamp):'')
                            )
                        );
                    })
                ),
        e('div',{style:{display:'flex',gap:'.5rem',marginTop:'auto'}},
            e('textarea',{className:'form-input',rows:2,value:msgText,onChange:ev=>setMsgText(ev.target.value),placeholder:'Въведете съобщение…',disabled:msgSending,style:{flex:1,resize:'none',fontSize:'.82rem'},onKeyDown:ev=>{if(ev.key==='Enter'&&(ev.ctrlKey||ev.metaKey)){ev.preventDefault();sendMessage()}}}),
            e('button',{className:'btn btn-primary',style:{alignSelf:'flex-end',minWidth:40,minHeight:40},disabled:!msgText.trim()||msgSending,onClick:sendMessage},msgSending?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-paper-plane'}))
        )
    ),
    previewDoc&&e(DocumentPreviewModal,{doc:previewDoc,onClose:()=>setPreviewDoc(null),showAttach:false,isAdmin:isAdmin,isOwner:canEditDocs,onEdit:function(doc){setPreviewDoc(null);setEditingDoc(doc);},onDelete:canEditDocs?function(doc){setPreviewDoc(null);if(doc&&doc.fileId){handleDeleteFile(doc.fileId)}else if(doc&&doc.id){handleRemoveDoc(doc.id)}}:undefined}),
    editingDoc&&typeof InlineDocEditorModal!=='undefined'&&e(InlineDocEditorModal,{doc:editingDoc,formId:formId,defaultEditMode:true,onClose:function(){setEditingDoc(null);},onSaved:function(updatedDoc){if(updatedDoc){setEditingDoc(null);toast('Промените са запазени.','success');_afterMutation();}else{setEditingDoc(null);}}}),
    showPicker&&e(DocumentPickerModal,{documents:allDocuments,alreadyAttached:resolvedAttached,onCancel:()=>setShowPicker(false),onConfirm:handleAttachDocuments,onCopyAttach:handleCopyAttach,formId,competitionId:f?.competitionId||'',projectType:(f?.projectCode||'').toUpperCase(),userEmail:(typeof _currentUserEmail!=='undefined'?_currentUserEmail:'')}),
    // v12.34.3: the old "Нов документ" button opened GoogleDocEditorModal
    // (create-new Google Doc in Drive), which threw React error #31 (an object
    // rendered as a child) and dead-ended. That button is now repurposed to
    // upload a local-device file (see the toolbar). Removed the broken modal
    // render + its dangling state to eliminate the error path entirely.

    fdTab==='changes'&&e(Fragment,null,
      (function(){
        var pendingCount = tcRequests.filter(function(r){return r.status==='submitted';}).length;
        var tcStatusLabel = function(s){return s==='submitted'?'Изчаква одобрение':s==='approved'?'Одобрена':s==='rejected'?'Отхвърлена':'Неизвестно';};
        var tcStatusColor = function(s){return s==='submitted'?'var(--warn)':s==='approved'?'var(--ok)':'var(--err)';};
        var currentTeam = Array.isArray(f.teamMembers) ? f.teamMembers : (typeof f.teamMembers==='string'&&f.teamMembers ? (function(){try{return JSON.parse(f.teamMembers);}catch(_){return [];}}()) : []);
        // Helper to render member fields in editor
        var renderMemberRow = function(m,idx,list,setList){
          return e('div',{key:idx,style:{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:'.35rem',marginBottom:'.3rem',alignItems:'center'}},
            e('input',{className:'form-input form-input-sm',placeholder:'Имена',value:m.name||'',onChange:function(ev){var n=list.slice();n[idx]={...n[idx],name:ev.target.value};setList(n);}}),
            e('input',{className:'form-input form-input-sm',placeholder:'Email',value:m.email||'',onChange:function(ev){var n=list.slice();n[idx]={...n[idx],email:ev.target.value.toLowerCase()};setList(n);}}),
            e('button',{className:'btn btn-danger btn-xs',title:'Премахни',onClick:function(){setList(list.filter(function(_,i){return i!==idx;}));},style:{minWidth:28,padding:'0 .4rem',lineHeight:'1.6'}},e('i',{className:'fas fa-times'}))
          );
        };
        var handleSubmitTeamChange = function(){
          if(tcSubmitting)return;
          var members = tcEditMembers||currentTeam;
          if(!members.length){toast('Екипът не може да бъде празен.','error');return;}
          setTcSubmitting(true);
          api('createAppTeamChangeRequest',{formId:formId,changeType:'app_team_change',newTeamMembers:members,description:tcDescription,userId:user?.email||''})
            .then(function(r){
              if(r&&r.success){toast('Заявката е подадена успешно.','success');setTcEditMembers(null);setTcDescription('');loadTcRequests();}
              else toast(r?.error||'Грешка','error');
            })
            .catch(function(err){toast(err.message||'Грешка','error');})
            .finally(function(){setTcSubmitting(false);});
        };
        var handleSubmitLeaderChange = function(){
          if(tcSubmitting)return;
          var le = tcEditLeader||{email:'',name:''};
          if(!le.email){toast('Въведете имейл на новия ръководител.','error');return;}
          setTcSubmitting(true);
          api('createAppTeamChangeRequest',{formId:formId,changeType:'app_leader_change',newLeaderEmail:le.email,newLeaderName:le.name,description:tcDescription,userId:user?.email||''})
            .then(function(r){
              if(r&&r.success){toast('Заявката е подадена успешно.','success');setTcEditLeader(null);setTcDescription('');loadTcRequests();}
              else toast(r?.error||'Грешка','error');
            })
            .catch(function(err){toast(err.message||'Грешка','error');})
            .finally(function(){setTcSubmitting(false);});
        };
        return e(Fragment,null,
          // Section header
          e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.75rem',flexWrap:'wrap'}},
            e('div',{className:'section-label',style:{flex:1}},e('i',{className:'fas fa-users-cog'}),' Промени в екипа и ръководителя'),
            pendingCount>0&&e('span',{style:{fontSize:'.7rem',background:'var(--warn-bg)',color:'var(--warn)',border:'1px solid var(--warn-border)',borderRadius:10,padding:'.1rem .5rem',fontWeight:600}},pendingCount,' чакат одобрение')
          ),
          // Current team display
          e('div',{style:{marginBottom:'1rem'}},
            e('div',{style:{fontSize:'.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--ink-4)',marginBottom:'.4rem'}},'Текущ екип'),
            currentTeam.length>0
              ?e('div',{style:{display:'flex',flexDirection:'column',gap:'.3rem'}},
                currentTeam.map(function(m,i){
                  return e('div',{key:i,style:{display:'flex',alignItems:'center',gap:'.5rem',padding:'.3rem .55rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:6,fontSize:'.78rem'}},
                    e('i',{className:'fas fa-user',style:{color:'var(--info)',fontSize:'.65rem'}}),
                    e('span',null,m.name||'—'),
                    e('span',{style:{color:'var(--ink-3)',fontSize:'.7rem'}},m.email||''),
                    m.isStudent&&e('span',{style:{fontSize:'.6rem',background:'var(--info-bg)',color:'var(--info)',padding:'.05rem .35rem',borderRadius:8}},m.role||'Докторант/Студент')
                  );
                })
              )
              :e('div',{style:{fontSize:'.78rem',color:'var(--ink-4)',fontStyle:'italic'}},'Няма записани членове на екипа.')
          ),
          // New request form (only for owner in allowed statuses)
          _canRequestTeamChange&&e('div',{style:{marginBottom:'1.25rem',padding:'.75rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8}},
            e('div',{style:{fontSize:'.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--ink-4)',marginBottom:'.5rem'}},'Ново искане за промяна'),
            // Mode toggle
            e('div',{style:{display:'flex',gap:'.4rem',marginBottom:'.6rem'}},
              e('button',{className:'btn btn-sm '+(tcMode==='team'?'btn-primary':'btn-outline'),onClick:function(){setTcMode('team');setTcEditLeader(null);}},e('i',{className:'fas fa-users'}),' Членове на екипа'),
              e('button',{className:'btn btn-sm '+(tcMode==='leader'?'btn-primary':'btn-outline'),onClick:function(){setTcMode('leader');setTcEditMembers(null);}},e('i',{className:'fas fa-user-tie'}),' Ръководител')
            ),
            tcMode==='team'&&e(Fragment,null,
              e('div',{style:{marginBottom:'.4rem'}},
                (tcEditMembers||currentTeam).map(function(m,i){return renderMemberRow(m,i,tcEditMembers||currentTeam,setTcEditMembers);}),
                e('button',{className:'btn btn-outline btn-xs',style:{marginTop:'.2rem'},onClick:function(){
                  var base = tcEditMembers||currentTeam.slice();
                  setTcEditMembers([...base,{name:'',email:'',role:''}]);
                }},e('i',{className:'fas fa-plus'}),' Добави член')
              )
            ),
            tcMode==='leader'&&e(Fragment,null,
              e('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.4rem',marginBottom:'.4rem'}},
                e('input',{className:'form-input form-input-sm',placeholder:'Email на новия ръководител',value:(tcEditLeader||{email:''}).email,onChange:function(ev){setTcEditLeader(function(p){return {...(p||{name:''}),email:ev.target.value.toLowerCase()};});}}),
                e('input',{className:'form-input form-input-sm',placeholder:'Имена на новия ръководител',value:(tcEditLeader||{name:''}).name,onChange:function(ev){setTcEditLeader(function(p){return {...(p||{email:''}),name:ev.target.value};});}})
              )
            ),
            e('input',{className:'form-input form-input-sm',placeholder:'Мотивация (незадължително)',value:tcDescription,onChange:function(ev){setTcDescription(ev.target.value);},style:{width:'100%',marginBottom:'.5rem'}}),
            e('button',{className:'btn btn-primary btn-sm',disabled:tcSubmitting,onClick:tcMode==='team'?handleSubmitTeamChange:handleSubmitLeaderChange},
              tcSubmitting?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-paper-plane'}),
              tcSubmitting?' Изпращане...':(tcMode==='team'?' Заяви промяна в екипа':' Заяви смяна на ръководител')
            )
          ),
          // History of requests
          e('div',null,
            e('div',{style:{fontSize:'.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--ink-4)',marginBottom:'.4rem'}},'История на заявките'),
            tcLoading&&e('div',{style:{textAlign:'center',padding:'1rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-spinner fa-spin'})),
            !tcLoading&&tcRequests.length===0&&e('div',{style:{fontSize:'.78rem',color:'var(--ink-4)',fontStyle:'italic',padding:'.5rem 0'}},'Няма подадени заявки за промени.'),
            !tcLoading&&tcRequests.slice().reverse().map(function(r,i){
              var label = r.changeType==='app_team_change'?'Промяна в екипа':'Смяна на ръководител';
              var newD  = r.newData||{};
              var isPending = r.status==='submitted';
              return e('div',{key:r.id||i,style:{padding:'.6rem .75rem',background:'var(--surface)',border:'1px solid '+(isPending?'var(--warn-border)':'var(--border)'),borderRadius:7,marginBottom:'.4rem',fontSize:'.78rem'}},
                e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap',marginBottom:'.3rem'}},
                  e('span',{style:{fontWeight:700}},label),
                  e('span',{style:{color:tcStatusColor(r.status),fontSize:'.7rem',fontWeight:600,border:'1px solid',borderColor:tcStatusColor(r.status),borderRadius:8,padding:'.05rem .4rem'}},tcStatusLabel(r.status)),
                  e('span',{style:{color:'var(--ink-4)',marginLeft:'auto',fontSize:'.68rem'}},r.requestedAt?(r.requestedAt.substring(0,16).replace('T',' ')):'')
                ),
                r.description&&e('div',{style:{color:'var(--ink-3)',marginBottom:'.25rem',fontStyle:'italic'}},r.description),
                r.changeType==='app_team_change'&&Array.isArray(newD.teamMembers)&&newD.teamMembers.length>0&&
                  e('div',{style:{color:'var(--ink-2)',fontSize:'.7rem'}},e('strong',null,'Нов екип: '),newD.teamMembers.map(function(m){return (m.name||m.email||'—');}).join(', ')),
                r.changeType==='app_leader_change'&&newD.newLeaderEmail&&
                  e('div',{style:{color:'var(--ink-2)',fontSize:'.7rem'}},e('strong',null,'Нов ръководител: '),newD.newLeaderEmail,' ',newD.newLeaderName?('('+newD.newLeaderName+')'):''),
                (r.decision||r.notes)&&e('div',{style:{marginTop:'.25rem',color:r.status==='approved'?'var(--ok)':'var(--err)',fontSize:'.7rem'}},
                  e('i',{className:'fas '+(r.status==='approved'?'fa-check':'fa-times'),style:{marginRight:'.25rem'}}),
                  r.reviewedBy&&(r.reviewedBy+': '),
                  r.notes||r.decision
                ),
                // Admin approve/reject buttons for pending requests
                isAdmin&&isPending&&e('div',{style:{display:'flex',gap:'.4rem',marginTop:'.45rem',paddingTop:'.4rem',borderTop:'1px dashed var(--border)'}},
                  e('button',{className:'btn btn-success btn-xs',disabled:tcSubmitting,onClick:function(){
                    if(!r.id||tcSubmitting)return;
                    setTcSubmitting(true);
                    api('approveChangeRequest',{changeRequestId:r.id,decision:'approved',notes:'Одобрено от администратор',userId:user?.email||''})
                      .then(function(res){
                        if(res&&res.success){toast('Заявката е одобрена.','success');if(typeof onRefresh==='function')onRefresh({forceRefresh:true,silent:true});loadTcRequests();}
                        else toast(res?.error||'Грешка','error');
                      })
                      .catch(function(err){toast(err.message||'Грешка','error');})
                      .finally(function(){setTcSubmitting(false);});
                  }},e('i',{className:'fas fa-check'}),' Одобри'),
                  e('button',{className:'btn btn-danger btn-xs',disabled:tcSubmitting,onClick:function(){
                    if(!r.id||tcSubmitting)return;
                    var notes=window.prompt('Причина за отказ (незадължително):');
                    if(notes===null)return; // cancelled
                    setTcSubmitting(true);
                    api('approveChangeRequest',{changeRequestId:r.id,decision:'rejected',notes:notes||'Отхвърлено от администратор',userId:user?.email||''})
                      .then(function(res){
                        if(res&&res.success){toast('Заявката е отхвърлена.','success');loadTcRequests();}
                        else toast(res?.error||'Грешка','error');
                      })
                      .catch(function(err){toast(err.message||'Грешка','error');})
                      .finally(function(){setTcSubmitting(false);});
                  }},e('i',{className:'fas fa-times'}),' Отхвърли')
                )
              );
            })
          )
        );
      })()
    )
);
});

/* ─── VIEW MODAL ─── */
/* ─── DETAIL SHEET (replaces the legacy ViewModal overlay) ───
 *  Slide-in side panel from the right (mobile: bottom sheet).
 *  Pattern: Linear/Notion/GitHub-issue side-panel.
 *  Keeps the underlying list visible and reachable, no full-page dim.
 *  All document mgmt (upload/attach/delete/remove) now lives inside FormDetail
 *  so applicants can act on attachments inline without a separate uploader modal. */
var ViewModal=({form,onClose,isAdmin,onStatusChange,allDocuments,onRefresh,user,initialTab,onSubmit})=>{
const{closing:vmClosing,close:vmClose}=useModalClose(onClose,200);
const[showEdit,setShowEdit]=useState(false);
const formId=getId(form);
const status=getStatus(form);
// v12.32.30-attach: fetch the AUTHORITATIVE full form (getform = SELECT *) on open
// so the modal always reflects persisted attached_docs/file_ids, independent of
// any stale list cache (data-layer localStorage / lean getForms). Fixes the
// "documents attached but gone after page refresh" client-cache coherence gap.
const[authoritativeForm,setAuthoritativeForm]=useState(null);
useEffect(()=>{
  if(!formId)return;
  let alive=true;
  var _fetchAuthoritative=function(){
    api('getform',{id:formId}).then(function(res){
      if(alive&&res&&res.success&&res.form)setAuthoritativeForm(res.form);
    }).catch(function(){/* keep prop form on failure */});
  };
  _fetchAuthoritative();
  // v12.32.33-realtime: keep the OPEN modal live — re-fetch the authoritative
  // form whenever a local mutation (erp:forms-changed) or a cross-user DB
  // change (erp:data-changed via version poll) lands. Debounced to 600ms.
  var _t=null;
  var _onChanged=function(){if(_t)clearTimeout(_t);_t=setTimeout(_fetchAuthoritative,600);};
  try{window.addEventListener('erp:forms-changed',_onChanged);window.addEventListener('erp:data-changed',_onChanged);}catch(_){}
  return function(){alive=false;if(_t)clearTimeout(_t);try{window.removeEventListener('erp:forms-changed',_onChanged);window.removeEventListener('erp:data-changed',_onChanged);}catch(_){}};
},[formId]);
const effectiveForm=authoritativeForm||form;

// Action buttons depend on current pipeline status. Reuses PROPOSAL_TRANSITIONS contract from gas.js.
const adminActions=isAdmin?(()=>{
    const act=(label,icon,target,kind='primary')=>e('button',{key:label,className:`btn btn-${kind} btn-sm`,onClick:()=>{onStatusChange(formId,target);vmClose()}},e('i',{className:'fas '+icon}),' ',label);
    if(status==='submitted')return[act('Допустимо','fa-clipboard-check','admin_passed','success'),act('Отхвърли','fa-times','rejected','danger'),act('Върни','fa-undo','returned','outline')];
    if(status==='admin_passed')return[act('Изпрати за рецензиране','fa-user-check','in_review','primary'),act('Върни','fa-undo','returned','outline')];
    if(status==='reviewed'||status==='scored')return[e('span',{key:'i',style:{fontSize:'.78rem',color:'var(--ink-3)',padding:'.4rem .6rem'}},e('i',{className:'fas fa-info-circle'}),' Очаква се авт. оценяване и класиране от ЦКК.'),act('Отхвърли','fa-times','rejected','danger')];
    if(status==='ranked')return[act('Предложи за финансиране','fa-hand-holding-usd','proposed_for_funding','success'),act('Отхвърли','fa-times','rejected','danger')];
    if(status==='proposed_for_funding')return[act('Одобри за финансиране (АС)','fa-coins','approved_for_funding','success'),act('Отхвърли','fa-times','rejected','danger')];
    if(status==='approved_for_funding')return[act('Финализирай одобрение (с подпис)','fa-check-double','approved','success'),act('Отхвърли','fa-times','rejected','danger')];
    if(status==='approved')return[act('Започни договаряне','fa-file-signature','contracting','success')];
    if(status==='contracting')return[act('Подпиши договор','fa-signature','contract_signed','success')];
    if(status==='contract_signed')return[act('Финализирай договор и активирай','fa-flag-checkered','contracted','success')];
    return[];
})():[];

return e(Fragment,null,
    _portal(e(Fragment,null,
      e('div',{className:'detail-sheet-scrim'+(vmClosing?' closing':''),onClick:vmClose}),
      e('aside',{className:'detail-sheet'+(vmClosing?' closing':''),role:'complementary','aria-label':'Детайли по предложението'},
        e('header',{className:'detail-sheet-head'},
            e('div',{className:'detail-sheet-title'},
                e('h3',null,e('i',{className:'fas fa-file-alt'}),' ',getTitle(form)||'Проектно предложение'),
                e('div',{className:'detail-sheet-id'},(formId||'').slice(0,16))
            ),
            e('div',{className:'detail-sheet-head-actions'},
                e('button',{className:'close-btn',onClick:vmClose,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
            )
        ),
        e('div',{className:'detail-sheet-body'},e(FormDetail,{form:effectiveForm,allDocuments,competitions:COMPETITIONS,isAdmin,initialTab,onRefresh,user:user||{email:effectiveForm?.userEmail||effectiveForm?.email||'',name:effectiveForm?.userName||effectiveForm?.name||''}})),
        e('footer',{className:'detail-sheet-footer'},
            adminActions,
            !isAdmin&&(status==='draft'||status==='returned')&&String(user?.email||'').toLowerCase()===getEmail(form).toLowerCase()&&e('button',{className:'btn btn-outline btn-sm',onClick:()=>setShowEdit(true),title:'Редактирай проектното предложение'},e('i',{className:'fas fa-pen'}),' Редактирай'),
            !isAdmin&&status==='draft'&&onSubmit&&e('button',{className:'btn btn-primary btn-sm',onClick:()=>onSubmit(formId)},e('i',{className:'fas fa-paper-plane'}),' Изпрати'),
            e('button',{className:'btn btn-outline btn-sm',onClick:vmClose},'Затвори')
        )
      )
    )),
    showEdit&&e(EditFormModal,{form,user,onClose:()=>setShowEdit(false),onSaved:()=>{setShowEdit(false);if(onRefresh)onRefresh({forceRefresh:true,silent:true});},allDocuments,isAdmin:!!isAdmin})
);
};


/* ─── Step 2 Doc Iframe — error-resilient Google Doc embed ───
 *  Wraps a Drive iframe with loading spinner + error recovery.
 *  When Google blocks the embed (X-Frame-Options / permissions),
 *  shows a friendly message with "Отвори в Google" fallback.
 *  This resolves the "За съжаление файлът, който сте заявили,
 *  не съществува" error by giving the user an alternative path. */
var Step2DocIframe=memo(({src,title,altUrl})=>{
const[siLoading,setSiLoading]=useState(true);
const[siError,setSiError]=useState(false);
const siRef=useRef(null);
const siRetryRef=useRef(0);
const _siNestedTimerRef=useRef(null);
/* ── Iframe load tracking with exponential-backoff auto-retry (v12.20.0) ──
   Google Drive blocks cross-origin iframe embeds via X-Frame-Options when
   the file's sharing permission is too restrictive (DOMAIN_WITH_LINK). On
   error we auto-retry twice with 2s/4s backoff — enough time for the Drive
   ACL to propagate after a fresh file copy — then show the user-friendly
   error state with the "Отвори в Google" escape hatch.
   When src is empty we skip loading entirely and show the error state
   immediately — no point spinning on a blank URL. */
useEffect(function(){
  if(!src){setSiLoading(false);setSiError(true);return;}
  if(!siRef.current)return;
  setSiLoading(true);setSiError(false);
  var timeout=setTimeout(function(){
    setSiLoading(false);setSiError(true);
    if(siRetryRef.current<2){
      var backoff=2000*Math.pow(2,siRetryRef.current);
      siRetryRef.current+=1;
      _siNestedTimerRef.current=setTimeout(function(){
        _siNestedTimerRef.current=null;
        setSiLoading(true);setSiError(false);
      },backoff);
    }
  },12000);
  var onLoad=function(){setSiLoading(false);setSiError(false);clearTimeout(timeout);siRetryRef.current=0;};
  var onError=function(){setSiLoading(false);setSiError(true);clearTimeout(timeout);};
  var el=siRef.current;
  el.addEventListener('load',onLoad);
  el.addEventListener('error',onError);
  return function(){el.removeEventListener('load',onLoad);el.removeEventListener('error',onError);clearTimeout(timeout);};
},[src]);
var handleSiRetry=useCallback(function(){setSiLoading(true);setSiError(false);siRetryRef.current+=1;},[]);
return e('div',{style:{flex:1,display:'flex',flexDirection:'column',position:'relative',minHeight:0,overflow:'hidden'}},
  siLoading&&!siError&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',gap:'.5rem'}},
    e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'1rem',color:'var(--primary)'}}),
    e('span',{style:{fontSize:'.78rem',color:'var(--ink-3)',fontWeight:600}},'Зареждане…')
  ),
  siError&&e('div',{style:{position:'absolute',inset:0,zIndex:1,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--surface)',flexDirection:'column',gap:'.5rem',padding:'1.5rem'}},
    e('div',{style:{width:44,height:44,borderRadius:'50%',background:'#fff0e0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem',color:'var(--warn)'}},e('i',{className:'fas fa-exclamation-triangle'})),
    e('h4',{style:{margin:0,fontSize:'.85rem',color:'var(--ink)'}},'Документът не е достъпен'),
    e('p',{style:{fontSize:'.65rem',color:'var(--ink-4)',textAlign:'center',maxWidth:340,lineHeight:1.5,margin:'.2rem 0'}},
      (!src
        ? 'Документът не може да бъде зареден, защото липсва връзка към файла. Опитайте да генерирате документа отново.'
        : 'Google Документът не може да бъде зареден. Това може да се дължи на ограничени права за достъп. Отворете го директно в Google Drive или опитайте отново.')
    ),
    e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',justifyContent:'center'}},
      src&&e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:handleSiRetry},e('i',{className:'fas fa-redo'}),' Опитай отново'),
      altUrl&&e('a',{href:altUrl,target:'_blank',rel:'noopener noreferrer',className:'btn btn-primary btn-sm'},e('i',{className:'fas fa-external-link-alt'}),' Отвори в Google')
    )
  ),
  !siError&&!!src&&e('iframe',{
    ref:siRef,key:siRetryRef.current,
    src:src,
    style:{flex:1,width:'100%',border:'none',display:siLoading?'none':'block',minHeight:0},
    title:title||'Документ',
    allowFullScreen:true
  })
);
});


/* ─── NEW FORM MODAL ─── */
var NewFormModal=memo(({user,onClose,onSaved,allDocuments=[],initialCompId,isAdmin=false})=>{
const{closing:nfClosing,close:nfClose}=useModalClose(onClose);
const[files,setFiles]=useState([]);const[attachedDocs,setAttachedDocs]=useState([]);const[sending,setSending]=useState(false);const[errors,setErrors]=useState({});
// v9.39.0-applicant-aware: leaderYoungScientist / leaderDoctoral persist on the form so the
//   leader's status counts toward the т.3.1.1 ≥30% young-scientist rule AND the 35% salary
//   cap (which is otherwise mis-computed when the leader IS the young scientist).
const[formValues,setFormValues]=useState({competitionId:initialCompId||'',projectType:'',area:'',professionalField:'',title:'',titleEn:'',acronym:'',description:'',descriptionEn:'',objectives:'',expectedResults:'',durationMonths:12,npfTier:'university',leaderYoungScientist:false,leaderDoctoral:false});
// ── Multi-area support (v9.46.0-rules): selectedAreas is the canonical array; formValues.area is the ;;-joined string ──
const[selectedAreas,setSelectedAreas]=useState([]);
// v9.50.0-declaration: задължителна декларация за съгласие с правилниците (per Системен файл.docx)
const[declarationAccepted,setDeclarationAccepted]=useState(false);
const[budgetInputMode,setBudgetInputMode]=useState('slider'); // 'slider' | 'exact'
const handleAreaChange=useCallback(function(nextAreas){
  setSelectedAreas(nextAreas);
  var joined=(Array.isArray(nextAreas)?nextAreas:[]).filter(function(a){return String(a||'').trim();}).join(';;');
  setFormValues(function(p){return Object.assign({},p,{area:joined});});
  if(errors.area)setErrors(function(p){var n=Object.assign({},p);delete n.area;return n;});
},[errors.area]);
// ── Multi-prof-field support: selectedProfFields is the canonical array; formValues.professionalField is the ;;-joined string ──
const[selectedProfFields,setSelectedProfFields]=useState([]);
const handleProfFieldChange=useCallback(function(nextFields){
  setSelectedProfFields(nextFields);
  var joined=(Array.isArray(nextFields)?nextFields:[]).filter(function(a){return String(a||'').trim();}).join(';;');
  setFormValues(function(p){return {...p,professionalField:joined};});
  if(errors.professionalField)setErrors(function(p){var n={...p};delete n.professionalField;return n;});
},[errors.professionalField]);
const[teamMembers,setTeamMembers]=useState([]);
const[budget,setBudget]=useState({});
const[showSignature,setShowSignature]=useState(false);const[showPicker,setShowPicker]=useState(false);
const[previewDoc,setPreviewDoc]=useState(null);
const[editingDoc,setEditingDoc]=useState(null);
// ── Register this component's editor as the global doc editor target ──
useEffect(function(){
  if(typeof window._registerDocEditor==='function')window._registerDocEditor(setEditingDoc);
  return function(){ if(typeof window._unregisterDocEditor==='function')window._unregisterDocEditor(); };
},[]);
const[dragging,setDragging]=useState(false);const nfFileRef=useRef(null);
const _sendingRef=useRef(false);
const _formIdRef=useRef(null);
const _lastValidationErrors=useRef({});
const _wizardStepRef=useRef(1); // tracks wizardStep for closures (avoids stale state)
const[availableCompetitions,setAvailableCompetitions]=useState([]);
const[compsLoading,setCompsLoading]=useState(true);
// ── Wizard step: 1=Обща информация, 2=Формуляр, 3=Бюджет ──
const[wizardStep,setWizardStep]=useState(1);
// v12.17.3: track whether a personal pregen copy is still being created
// and whether we've timed out waiting (so we can fall back to master template)
const[pregenInFlight,setPregenInFlight]=useState(false);
const[pregenTimedOut,setPregenTimedOut]=useState(false);
// v12.18.1: type-specific template docs copied to candidate project folder
const[copiedTypeDocs,setCopiedTypeDocs]=useState([]);
const[copyingTypeDocs,setCopyingTypeDocs]=useState(false);
const[copyTypeDocError,setCopyTypeDocError]=useState('');
const[activeTypeDocIdx,setActiveTypeDocIdx]=useState(0);
// Sync wizardStep to ref for closure safety
useEffect(function(){_wizardStepRef.current=wizardStep;},[wizardStep]);
// v12.12.0: auto-open application form in edit mode on Step 2 entry
var _autoEditOpenedRef=useRef(false);
// v12.17.3: Fetch template IDs dynamically and cache them. Do NOT hardcode.
// The real template IDs live in code.gs and are fetched via getRequiredDocuments.
var _pregeneratedDocsRef=useRef({});
var _pregenStep2Ref=useRef(null);
var _copyTriggeredRef=useRef(''); // v12.18.1: tracks which projectType was copy-triggered
// ── Document generation state ──
const[generatingDoc,setGeneratingDoc]=useState({});
const[genResults,setGenResults]=useState({});
const[deletingAttachedDoc,setDeletingAttachedDoc]=useState(null); // doc id being deleted
const trackGenResult=useCallback(function(docType,result){
  setGenResults(function(prev){return Object.assign({},prev,{[docType]:result});});
},[]);

// v12.17.3: Pre-fetch real template IDs on mount (one-time, cached)
// These are used by Step 2 iframe to load the master template instantly.
useEffect(function(){
  var didCancel=false;
  var _pt=['ФНИ','ПНИ','ДНП','НПФ'];
  // Use the frontend getRequiredDocuments function to fetch template info for all project types
  // This is called ONCE on mount and cached in _pregeneratedDocsRef
  var promises=_pt.map(function(pt){
    try{
      if(typeof getRequiredDocuments==='function'){
        var docs=getRequiredDocuments(pt)||[];
        if(didCancel)return;
        if(Array.isArray(docs)){
          // Cache the docs keyed by project type
          var mapped=docs.map(function(d){return{
            id:d.id||d.docType,fileId:d.fileId||d.driveId||d.id,
            name:d.name||(pt+' - Формуляр'),mimeType:d.mimeType||'application/vnd.google-apps.document',_master:true
          };});
          _pregeneratedDocsRef.current[pt]=mapped;
        }
      }
    }catch(err){
      console.debug('Template fetch error for '+pt+': ',err);
    }
    return null;
  });
},[]);

useEffect(function(){
  if(wizardStep!==2||!attachedDocs||!attachedDocs.length)return;
  // Find first generated doc with a real Drive ID (skip budget sheets)
  var _found=null;
  for(var _i=0;_i<attachedDocs.length;_i++){
    var d=attachedDocs[_i];
    if(d&&d._generated&&d.driveId&&!d._budget){_found=d;break;}
  }
  if(!_found){
    for(var _j=0;_j<attachedDocs.length;_j++){
      var d2=attachedDocs[_j];
      if(d2&&d2.driveId&&!d2._budget){_found=d2;break;}
    }
  }
  if(!_found||!_found.driveId)return;
  // Prevent re-opening the same doc repeatedly
  if(_autoEditOpenedRef.current===_found.id)return;
  _autoEditOpenedRef.current=_found.id;
  // Defer to next frame so the step 2 DOM is painted before the editor replaces it
  var raf=requestAnimationFrame(function(){
    if(typeof setEditingDoc==='function')setEditingDoc(_found);
  });
  return function(){cancelAnimationFrame(raf);};
},[wizardStep,attachedDocs]);
// v12.12.0: also auto-open when generation completes while already on Step 2
useEffect(function(){
  if(wizardStep!==2)return;
  var _hasNewGen=genResults&&Object.keys(genResults).some(function(k){return genResults[k]&&genResults[k].success;});
  if(!_hasNewGen)return;
  // Find the newly generated doc in attachedDocs
  var _found=null;
  for(var _i=0;_i<attachedDocs.length;_i++){
    var d=attachedDocs[_i];
    if(d&&d._generated&&d.driveId&&!d._budget&&d.id!==_autoEditOpenedRef.current){_found=d;break;}
  }
  if(!_found||!_found.driveId)return;
  _autoEditOpenedRef.current=_found.id;
  var raf=requestAnimationFrame(function(){
    if(typeof setEditingDoc==='function')setEditingDoc(_found);
  });
  return function(){cancelAnimationFrame(raf);};
},[wizardStep,genResults,attachedDocs]);
// Reset auto-open gate when leaving step 2 or closing wizard
useEffect(function(){
  if(wizardStep!==2){_autoEditOpenedRef.current=null;_pregenStep2Ref.current=null;}
},[wizardStep]);
// v12.18.1+: copy type-specific templates in the background the moment the candidate
// picks a project type in Step 1 — so docs are ready by the time Step 2 opens.
useEffect(function(){
  var pt=String(formValues.projectType||'').trim().toUpperCase();
  if(!pt)return;
  if(!formValues.competitionId)return; // need competition name for folder path
  if(_copyTriggeredRef.current===pt)return; // already triggered / in-flight
  _copyTriggeredRef.current=pt;
  setCopiedTypeDocs([]);
  setCopyTypeDocError('');
  setActiveTypeDocIdx(0);
  _ensureDraftExists({silent:true}).then(function(result){
      var fid=result&&result.id;
      var err=result&&result.error;
      if(!fid){setCopyTypeDocError(err&&err.message?'Не може да се създаде чернова: '+err.message:'Не може да се създаде чернова. Опитайте отново.');return;}
      var _comp=(availableCompetitions||[]).find(function(c){return c.id===formValues.competitionId;});
    var _compName=_comp?_comp.name:'Конкурсна сесия 2026';
    // ── localStorage fast path: result cached from a previous session ──
    // v2 suffix: entries before this version lacked proper Drive sharing, so ignore them.
    var _lsKey='erp:ctf2:'+fid+':'+pt;
    try{
      var _lsRaw=localStorage.getItem(_lsKey);
      if(_lsRaw){
        var _lsParsed=JSON.parse(_lsRaw);
        if(_lsParsed&&_lsParsed.files&&_lsParsed.files.length&&_lsParsed.ts&&(Date.now()-_lsParsed.ts)<7200000){
          setCopiedTypeDocs(_lsParsed.files);
          setActiveTypeDocIdx(0);
          return; // skip API call entirely
        }
      }
    }catch(_){}
    setCopyingTypeDocs(true);
    // v19.0.0-authfix: Include user email so PHP handler can identify the caller
    var _userEmail2=(typeof _currentUserEmail!=='undefined'&&_currentUserEmail)||'';
    api('copyTypeTemplatesForForm',{formId:fid,projectType:pt,competitionName:_compName,userId:_userEmail2}).then(function(res){
      if(res&&res.success&&res.files&&res.files.length){
        setCopiedTypeDocs(res.files);
        setActiveTypeDocIdx(0);
        setCopyingTypeDocs(false); // v20.0.0-docfix: was missing, causing infinite "copying…" state
        // Cache result locally for 2 h
        try{localStorage.setItem(_lsKey,JSON.stringify({files:res.files,ts:Date.now()}));}catch(_){}
      }else if(res&&!res.success&&res.error&&
               (res.error.indexOf('Unknown action')>=0||res.error.indexOf('unknown action')>=0||
                res.error.indexOf('Dispatch error')>=0)){
        // ── GAS not yet redeployed — use copyDocForUser to copy master templates ──
        // copyDocForUser IS deployed and creates properly shared editable copies.
        var _reg=_pregeneratedDocsRef.current||{};
        var _tpls=_reg[pt]||_reg[pt.toUpperCase()]||[];
        // Hardcoded pregen IDs as last-resort fallback
        var _pregenIds={
          '\u0424\u041d\u0418':'1HLVrLrfRXaQD5wcqJkWTAwbcd1wp0PJeDEn_vgRxmb4',
          '\u041f\u041d\u0418':'1H7CUNufh0KqEVqc3_227umHIvzhLCsQGUaHnFHY2Px0',
          '\u0414\u041d\u041f':'1fJJ20vIQvmiysI-_nPcu5OG_dHCVR-yFF6DgzzUbgx4',
          '\u041d\u041f\u0424':'1NR_I3JiFZGSYLTzJ35NytkDKIjMERe1N20329LNYeJo'
        };
        var _masterIds=[];
        if(_tpls.length){
          _masterIds=_tpls.map(function(t){return{id:t.fileId||t.id,name:t.name||(pt+' Формуляр'),mimeType:t.mimeType||'application/vnd.google-apps.document'};});
        }else{
          var _pid=_pregenIds[pt];
          if(_pid) _masterIds=[{id:_pid,name:pt+' — Формуляр',mimeType:'application/vnd.google-apps.document'}];
        }
        if(_masterIds.length){
          // Use Promise.all to copy ALL master templates in parallel
          var _copyPromises=_masterIds.map(function(mt){
            return api('copyDocForUser',{docId:mt.id,formId:fid})
              .then(function(cr){return cr&&cr.file?{name:mt.name,file:cr.file}:null;})
              .catch(function(){return null;});
          });
          Promise.all(_copyPromises).then(function(results){
            var _copied=results.filter(Boolean).map(function(r){
              var f=r.file;
              var editUrl=f.googleDocEditLink||(f.id?'https://docs.google.com/document/d/'+encodeURIComponent(f.id)+'/edit':'');
              return{id:f.id||r.name,driveId:f.id,name:r.name,
                mimeType:f.mimeType||'application/vnd.google-apps.document',
                editUrl:editUrl,
                previewUrl:f.previewLink||(f.id?'https://docs.google.com/document/d/'+encodeURIComponent(f.id)+'/preview':'')};
            });
            if(_copied.length){
              setCopiedTypeDocs(_copied);
              setActiveTypeDocIdx(0);
              try{localStorage.setItem(_lsKey,JSON.stringify({files:_copied,ts:Date.now()}));}catch(_){}
            }else{
              setCopyTypeDocError('\u041d\u0435 \u0443\u0441\u043f\u044f\u0445\u043c\u0435 \u0434\u0430 \u043a\u043e\u043f\u0438\u0440\u0430\u043c\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0438\u0442\u0435. \u041e\u043f\u0438\u0442\u0430\u0439\u0442\u0435 \u0440\u044a\u0447\u043d\u043e \u043e\u0442 \u00ab\u041f\u0440\u0438\u043a\u0430\u0447\u0438\u00bb.');
              _copyTriggeredRef.current='';
            }
          }).catch(function(){setCopyTypeDocError('\u0413\u0440\u0435\u0448\u043a\u0430 \u043f\u0440\u0438 \u043a\u043e\u043f\u0438\u0440\u0430\u043d\u0435.');_copyTriggeredRef.current='';})
            .finally(function(){setCopyingTypeDocs(false);});
          return;
        }else{
          setCopyTypeDocError('\u041d\u044f\u043c\u0430 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0438 \u0437\u0430 \u043a\u043e\u043f\u0438\u0440\u0430\u043d\u0435.');
          _copyTriggeredRef.current='';
          setCopyingTypeDocs(false);
        }
      }else{
        setCopyTypeDocError((res&&res.error)||'\u041d\u0435\u0443\u0441\u043f\u0435\u0448\u043d\u043e \u043a\u043e\u043f\u0438\u0440\u0430\u043d\u0435 \u043d\u0430 \u0448\u0430\u0431\u043b\u043e\u043d\u0438');
        _copyTriggeredRef.current=''; // allow retry
        setCopyingTypeDocs(false); // v20.0.0-docfix: was missing
      }
    }).catch(function(err){
      // ── v12.20.0: Fallback when backend doesn't have copyTypeTemplatesForForm ──
      // GAS returns "Unknown action", PHP returns "No templates in PHP cache".
      // In both cases we fall back to copyDocForUser with hardcoded pregen IDs.
      var _errMsg=err&&err.message||'';
      if(_errMsg.indexOf('Unknown action')>=0||_errMsg.indexOf('unknown action')>=0||
         _errMsg.indexOf('Dispatch error')>=0||_errMsg.indexOf('No templates')>=0){
        // ── Use copyDocForUser to copy master templates ──
        var _reg=_pregeneratedDocsRef.current||{};
        var _tpls=_reg[pt]||_reg[pt.toUpperCase()]||[];
        var _pregenIds={
          '\u0424\u041d\u0418':'1HLVrLrfRXaQD5wcqJkWTAwbcd1wp0PJeDEn_vgRxmb4',
          '\u041f\u041d\u0418':'1H7CUNufh0KqEVqc3_227umHIvzhLCsQGUaHnFHY2Px0',
          '\u0414\u041d\u041f':'1fJJ20vIQvmiysI-_nPcu5OG_dHCVR-yFF6DgzzUbgx4',
          '\u041d\u041f\u0424':'1NR_I3JiFZGSYLTzJ35NytkDKIjMERe1N20329LNYeJo'
        };
        var _masterIds=[];
        if(_tpls.length){
          _masterIds=_tpls.map(function(t){return{id:t.fileId||t.id,name:t.name||(pt+' \u0424\u043e\u0440\u043c\u0443\u043b\u044f\u0440'),mimeType:t.mimeType||'application/vnd.google-apps.document'};});
        }else{
          var _pid=_pregenIds[pt];
          if(_pid)_masterIds=[{id:_pid,name:pt+' \u2014 \u0424\u043e\u0440\u043c\u0443\u043b\u044f\u0440',mimeType:'application/vnd.google-apps.document'}];
        }
        if(_masterIds.length){
          var _copyPromises=_masterIds.map(function(mt){
            return api('copyDocForUser',{docId:mt.id,formId:fid})
              .then(function(cr){return cr&&cr.file?{name:mt.name,file:cr.file}:null;})
              .catch(function(){return null;});
          });
          Promise.all(_copyPromises).then(function(results){
            var _copied=results.filter(Boolean).map(function(r){
              var f=r.file;
              var editUrl=f.googleDocEditLink||(f.id?'https://docs.google.com/document/d/'+encodeURIComponent(f.id)+'/edit':'');
              return{id:f.id||r.name,driveId:f.id,name:r.name,
                mimeType:f.mimeType||'application/vnd.google-apps.document',
                editUrl:editUrl,
                previewUrl:f.previewLink||(f.id?'https://docs.google.com/document/d/'+encodeURIComponent(f.id)+'/preview':'')};
            });
            if(_copied.length){
              setCopiedTypeDocs(_copied);
              setActiveTypeDocIdx(0);
              try{localStorage.setItem(_lsKey,JSON.stringify({files:_copied,ts:Date.now()}));}catch(_){}
              setCopyingTypeDocs(false);
              return;
            }
          }).catch(function(){}).finally(function(){setCopyingTypeDocs(false);});
          return;
        }
      }
      setCopyTypeDocError(err&&err.message||'\u0413\u0440\u0435\u0448\u043a\u0430 \u043f\u0440\u0438 \u043a\u043e\u043f\u0438\u0440\u0430\u043d\u0435');
      _copyTriggeredRef.current=''; // allow retry
    }).finally(function(){setCopyingTypeDocs(false);});
  }).catch(function(){
    setCopyTypeDocError('Грешка при създаване на чернова.');
    _copyTriggeredRef.current=''; // allow retry
    setCopyingTypeDocs(false); // v20.0.0-docfix: was missing, causing stuck "copying…" state
  });
},[formValues.projectType,formValues.competitionId]);
// ── Template availability map: { docId: { resolved:bool, foundAs:string } } ──
//    Pre-fetched on mount so we can disable "Генерирай" buttons for templates
//    that don't exist in the Drive library, instead of letting users click and
//    receive a post-fact toast. Refreshed when the user (re)opens the wizard.
const[tplAvailability,setTplAvailability]=useState({});
const[tplCheckLoading,setTplCheckLoading]=useState(false);
var _lastTplTypeRef=useRef(null);
useEffect(function(){
    if(typeof getRequiredApplicationTemplates!=='function')return;
    // Re-check when project type changes (different templates per type)
    var currentType=String(formValues.projectType||'').trim().toUpperCase();
    if(currentType&&_lastTplTypeRef.current===currentType&&Object.keys(tplAvailability).length>0)return;
    _lastTplTypeRef.current=currentType;
    var cancelled=false;
    setTplCheckLoading(true);
    getRequiredApplicationTemplates(true).then(function(res){
        if(cancelled||!res||!res.success||!res.templates)return;
        var flat=Object.assign({},tplAvailability); // merge, don't replace
        var pregenRegistry={}; // { type: [{id,fileId,name,mimeType}] }
        Object.keys(res.templates).forEach(function(type){
            var typedDocs=[];
            (res.templates[type]||[]).forEach(function(t){
                flat[type+':'+t.id]={resolved:t.resolved===null?undefined:!!t.resolved,foundAs:t.foundAs||'',name:t.name||'',fileId:t.fileId||''};
                // v10.11.0: Also add an alias entry so frontend doc IDs (e.g. fniteam)
                // that map to backend IDs (e.g. fniteamextra) can be looked up.
                if(typeof window._DOC_TYPE_ALIAS!=='undefined'){
                  var _aliasFor=Object.keys(window._DOC_TYPE_ALIAS).find(function(k){return window._DOC_TYPE_ALIAS[k]===t.id;});
                  if(_aliasFor&&flat[type+':'+_aliasFor]===undefined){
                    flat[type+':'+_aliasFor]=flat[type+':'+t.id];
                  }
                }
                // Collect pre-known template file IDs for instant Step 2 display
                if(t.fileId&&t.resolved){
                  typedDocs.push({
                    id:t.id,
                    fileId:t.fileId,
                    name:t.foundAs||t.name||'',
                    mimeType:t.mime||'application/vnd.google-apps.document',
                    _master:true // marks this as master template (not user copy)
                  });
                }
            });
            if(typedDocs.length) pregenRegistry[type]=typedDocs;
        });
        setTplAvailability(flat);
        // Only set pregenerated ref if ensureUserPregeneratedDocs hasn't already
        // populated it with real user-specific copies for this type
        var _existingReg=_pregeneratedDocsRef.current||{};
        var _hasUserCopies=Object.keys(_existingReg).some(function(k){
          return _existingReg[k]&&_existingReg[k].some(function(d){return d&&!d._master;});
        });
        if(!_hasUserCopies&&Object.keys(pregenRegistry).length){
          _pregeneratedDocsRef.current=pregenRegistry;
        }
    }).catch(function(){/* silent — fall back to optimistic enabled state */})
      .finally(function(){if(!cancelled)setTplCheckLoading(false);});
    return function(){cancelled=true;};
},[formValues.projectType]);

// v12.18.1+: auto-attach copiedTypeDocs to the form the moment they arrive
// so the candidate never needs to manually open the picker for type templates.
var _autoAttachedTypeRef=useRef('');
useEffect(function(){
  var pt=String(formValues.projectType||'').trim().toUpperCase();
  if(!copiedTypeDocs.length||!pt)return;
  var _fid=_formIdRef.current;
  if(!_fid)return;
  if(_autoAttachedTypeRef.current===pt)return; // already done for this type
  _autoAttachedTypeRef.current=pt;
  // Real copies only (not master-template fallbacks — those aren't in candidate folder)
  var newDocs=copiedTypeDocs.filter(function(td){
    return td.editUrl&&!td._masterTemplate;
  }).map(function(td){
    return{id:td.id,driveId:td.id,name:td.name,mimeType:td.mimeType,
      googleDocEditLink:td.editUrl,previewLink:td.previewUrl||'',
      folderName:td.folderName||'',_generated:false,_typeTemplate:true,docType:''};
  });
  if(!newDocs.length)return;
  // Merge with current attachedDocs (closure value is reliable here)
  var merged=attachedDocs.slice();
  newDocs.forEach(function(nd){if(!merged.some(function(d){return d.id===nd.id;}))merged.push(nd);});
  setAttachedDocs(merged);
  // Background save — fire-and-forget
  var _toSave=merged.map(_serializeDoc);
  setTimeout(function(){
    if(!_formIdRef.current)return;
    mutateApi('updateForm',{id:_formIdRef.current,updates:{attachedDocs:_toSave}},
      {invalidates:['getforms','getinitialdata']}).catch(function(){});
  },600);
},[copiedTypeDocs,formValues.projectType]);
// When the user enters Step 2, we already know the template file IDs from the
// getRequiredApplicationTemplates(true) response. Use those IDs to construct
// doc objects IMMEDIATELY — no API call needed. The InlineDocEditorModal will
// show the template doc (view-mode). In the background, the existing auto-
// generation creates user-specific editable copies and the auto-open effect
// swaps to the generated copy when ready.
useEffect(function(){
  if(wizardStep!==2)return;
  if(!formValues.projectType)return;
  var pt=formValues.projectType;
  // Only pre-load once per project type per wizard session
  if(_pregenStep2Ref.current===pt)return;

  // Check if we already have real generated docs for this type
  var hasRealDocs=attachedDocs.some(function(d){return d._generated&&d.docType;});
  if(hasRealDocs)return;

  var reg=_pregeneratedDocsRef.current||{};
  var docsForType=reg[pt]||reg[pt.toUpperCase()]||(function(){
    // Fuzzy match: try normalized key
    var keys=Object.keys(reg);
    for(var _pk=0;_pk<keys.length;_pk++){
      if(keys[_pk].toUpperCase()===pt.toUpperCase())return reg[keys[_pk]];
    }
    return null;
  })();
  if(!docsForType||!docsForType.length)return;

  _pregenStep2Ref.current=pt;

  // Construct pre-generated doc objects from the known template file IDs
  var newDocs=docsForType.map(function(tpl){
    var encId=encodeURIComponent(tpl.fileId);
    var docName=tpl.name||tpl.fileId;
    return {
      id:tpl.fileId,
      driveId:tpl.fileId,
      name:docName,
      mimeType:tpl.mimeType||'application/vnd.google-apps.document',
      googleDocEditLink:'https://docs.google.com/document/d/'+encId+'/edit',
      previewLink:'https://docs.google.com/document/d/'+encId+'/preview',
      _generated:true,   // v12.30.1-fix: true so checkRequiredDocsStatus matches via docType+'_generated'
      _pregenerated:true,
      docType:tpl.id
    };
  });
  if(!newDocs.length)return;

  // Add pre-generated docs to attachedDocs; the existing auto-open effect
  // (watches [wizardStep,attachedDocs]) will pick up the first doc and set editingDoc
  // v12.30.1-fix: Only skip docs that are ALREADY present for the same docType,
  // not ALL pregenerated docs. The old guard (`prev.some(._generated||._pregenerated)`)
  // blocked adding new pregenerated docs when switching project types.
  setAttachedDocs(function(prev){
    var merged = prev.slice();
    newDocs.forEach(function(nd){
      var existing = merged.some(function(d){ return d.docType && d.docType === nd.docType; });
      if(!existing) merged.push(nd);
    });
    return merged;
  });
},[wizardStep,formValues.projectType,attachedDocs]);

// ── Phase 5: draft autosave to localStorage ──
// Survives accidental modal close / browser refresh. Files are NOT persisted
// (binary base64 would blow past localStorage quotas); only the textual
// fields + selected docs/competition are restored. Cleared on successful
// submit, manual discard, or after 7 days idle.
const _DRAFT_KEY='erp:newform:draft:'+(user?.email||'_anon');
const _DRAFT_TTL_MS=7*24*60*60*1000;
const _autoSaveFlashTimerRef=useRef(null);

// Restore on mount (one-shot)
useEffect(()=>{
    try{
    const raw=localStorage.getItem(_DRAFT_KEY);if(!raw)return;
    const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object')return;
    if(typeof parsed.ts==='number'&&(Date.now()-parsed.ts)>_DRAFT_TTL_MS){localStorage.removeItem(_DRAFT_KEY);return;}
    const v=parsed.formValues||{};
    const hasContent=v.title||v.description||v.area||v.projectType||(parsed.attachedDocs&&parsed.attachedDocs.length);
    if(!hasContent)return;
    setFormValues(prev=>({...prev,...v,competitionId:v.competitionId||prev.competitionId}));
    // Restore multi-prof-field selection from the ;;‑joined string
    if(typeof v.professionalField==='string'&&v.professionalField){setSelectedProfFields(getAreas(v.professionalField));}
    if(typeof v.area==='string'&&v.area){setSelectedAreas(v.area.split(';;').filter(Boolean));}
    if(Array.isArray(parsed.teamMembers)&&parsed.teamMembers.length>0)setTeamMembers(parsed.teamMembers);
    if(Array.isArray(parsed.attachedDocs))setAttachedDocs(parsed.attachedDocs);
    toast('Възстановена незавършена чернова.','info',6000,{actionLabel:'Изчисти',action:()=>{
        try{localStorage.removeItem(_DRAFT_KEY)}catch(_){}
        setFormValues({competitionId:initialCompId||'',projectType:'',area:'',professionalField:'',title:'',titleEn:'',acronym:'',description:'',descriptionEn:'',objectives:'',expectedResults:'',durationMonths:12,npfTier:'university'});
        setSelectedProfFields([]);
        setSelectedAreas([]);
        setTeamMembers([]);
        setAttachedDocs([]);
        toast('Черновата е изчистена.','success');
    }});
    }catch(_){/* corrupt JSON — drop silently */try{localStorage.removeItem(_DRAFT_KEY)}catch(_2){}}
// eslint-disable-next-line react-hooks/exhaustive-deps
},[]);

// Debounced autosave on every meaningful change
const[autoSaveFlash,setAutoSaveFlash]=useState(false);
var _autoSaveSkipRef=useRef(true); // skip first trigger (mount/draft restore)
useEffect(()=>{
    const v=formValues;
    const hasContent=v.title||v.description||v.area||v.projectType||attachedDocs.length||teamMembers.length;
    if(!hasContent)return;
    const t=setTimeout(()=>{
    try{localStorage.setItem(_DRAFT_KEY,JSON.stringify({ts:Date.now(),formValues:v,teamMembers:teamMembers,attachedDocs:attachedDocs.map(_serializeDoc)}))}
    catch(_){/* quota exceeded — drop silently */}
    // Flash a subtle save indicator (skip on first auto-save = draft restore)
    if(!_autoSaveSkipRef.current){
      setAutoSaveFlash(true);
      if(_autoSaveFlashTimerRef.current)clearTimeout(_autoSaveFlashTimerRef.current);
      _autoSaveFlashTimerRef.current=setTimeout(function(){setAutoSaveFlash(false);_autoSaveFlashTimerRef.current=null;},1200);
    }
    _autoSaveSkipRef.current=false;
    },600);
    return()=>{clearTimeout(t);if(_autoSaveFlashTimerRef.current){clearTimeout(_autoSaveFlashTimerRef.current);_autoSaveFlashTimerRef.current=null;}};
},[formValues,teamMembers,attachedDocs,_DRAFT_KEY]);

const clearDraft=useCallback(()=>{try{localStorage.removeItem(_DRAFT_KEY)}catch(_){}},[_DRAFT_KEY]);
// v9.54.0-closelock: desktop-only guarded close — prevents accidental modal close when data/draft is present
const nfSafeClose=useCallback(function(){
  nfClose();
},[nfClose]);
// ── Delete draft handler (v12.21.0: optimistic — closes modal instantly) ──
const[deletingDraft,setDeletingDraft]=useState(false);
var _deleteDraftLockRef=useRef(false);
const handleDeleteDraft=useCallback(function(){
  if(deletingDraft||_deleteDraftLockRef.current)return;
  if(typeof window!=='undefined'&&window.confirm&&!window.confirm('Сигурни ли сте, че искате да изтриете тази чернова?\n\nТова действие е необратимо. Всички въведени данни ще бъдат загубени.'))return;
  _deleteDraftLockRef.current=true;
  setDeletingDraft(true);
  var fid=_formIdRef.current;
  if(!fid){toast('Няма запазена чернова за изтриване.','warn');setDeletingDraft(false);_deleteDraftLockRef.current=false;return;}
  // v12.21.0: Optimistic — close modal + clear draft immediately, then confirm with server
  clearDraft();
  nfClose();
  api('deleteform',{id:fid}).then(function(r){
    if(r&&r.success){toast('Черновата е изтрита.','success');try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}}
    else toast((r&&r.error)||'Грешка при изтриване','error');
  }).catch(function(err){toast(err.message||'Грешка','error');}).finally(function(){setDeletingDraft(false);_deleteDraftLockRef.current=false;});
},[deletingDraft,_formIdRef,clearDraft,nfClose]);

// ── v9.39.0-applicant-aware: SERVER-SIDE DEBOUNCED AUTOSAVE ──
// Mirrors the localStorage autosave to the backend draft so a refresh from
// a different device/browser sees the latest state. Only fires when:
//   1. an auto-draft already exists (_formIdRef.current is set), AND
//   2. a meaningful field has changed since last server-side push.
// Deboun500ms (v10.3.0: faster, near-realtime feelrage) to limit GAS quota burn.
// Failures are silent — localStorage remains the source of truth on rollback.
var _serverSyncRef=useRef({lastSig:'',inflight:false});
useEffect(function(){
  if(!_formIdRef.current)return;
  if(!user?.email)return;
  // Build a content signature: only push if it actually changed.
  var sig;
  try{
    sig=JSON.stringify({
      t:formValues.title,te:formValues.titleEn,a:formValues.acronym,
      d:formValues.description,de:formValues.descriptionEn,o:formValues.objectives,
      er:formValues.expectedResults,ar:formValues.area,pf:formValues.professionalField,
      dm:formValues.durationMonths,nt:formValues.npfTier,
      ly:!!formValues.leaderYoungScientist,ld:!!formValues.leaderDoctoral,
      tm:teamMembers.length,bd:Object.keys(budget||{}).length,
      ad:attachedDocs.map(function(d){return d.id+':'+(d._generated?1:0)+':'+String(d.name||'').slice(0,20);}).join('|')
    });
  }catch(_){return;}
  if(sig===_serverSyncRef.current.lastSig)return;
  var handle=setTimeout(function(){
    if(_serverSyncRef.current.inflight)return;
    _serverSyncRef.current.inflight=true;
    var fid=_formIdRef.current;
    if(!fid){_serverSyncRef.current.inflight=false;return;}
    var payload={id:fid,updates:{
      userId:user.email||'',userName:user?.name||'',
      projectCode:formValues.projectType||'',competitionId:formValues.competitionId||'',
      title:String(formValues.title||'').trim(),titleEn:String(formValues.titleEn||'').trim(),
      acronym:String(formValues.acronym||'').trim().toUpperCase(),
      area:formValues.area||'',professionalField:formValues.professionalField||'',
      description:String(formValues.description||'').trim(),
      descriptionEn:String(formValues.descriptionEn||'').trim(),
      objectives:String(formValues.objectives||'').trim(),
      expectedResults:String(formValues.expectedResults||'').trim(),
      durationMonths:Number(formValues.durationMonths)||12,
      npfTier:formValues.npfTier||'university',
      teamMembers:teamMembers,budget:budget,
      attachedDocs:attachedDocs.map(function(d){return _serializeDoc(d);})
    }};
    mutateApi('updateForm',payload,{invalidates:['getforms','getinitialdata']})
      .then(function(){_serverSyncRef.current.lastSig=sig;})
      .catch(function(){/* silent — localStorage covers us */})
      .finally(function(){_serverSyncRef.current.inflight=false;});
 },1500);
  return function(){clearTimeout(handle);};
},[formValues,teamMembers,budget,attachedDocs,user?.email]);

// v9.46.0-rules: Lock ДНП duration to exactly 12 months (фиксиран срок по чл.10 Правилника)
// v9.69.x: also clamp duration into the selected project type's valid range
// (НПФ 1–3 мес.) so the 12-month default does not produce an invalid НПФ срок.
useEffect(function(){
  if(formValues.projectType==='ДНП'){
    if(Number(formValues.durationMonths)!==12){
      setFormValues(function(p){return Object.assign({},p,{durationMonths:12});});
    }
    return;
  }
  var _ptC=PROJECT_TYPES.find(function(p){return p.value===formValues.projectType;});
  if(!_ptC)return;
  var _minC=_ptC.minDurationMonths||12, _maxC=_ptC.maxDurationMonths||36;
  var _dmC=Number(formValues.durationMonths);
  if(isNaN(_dmC)||_dmC<_minC||_dmC>_maxC){
    var _clamped=isNaN(_dmC)?_minC:Math.min(_maxC,Math.max(_minC,_dmC));
    setFormValues(function(p){return Object.assign({},p,{durationMonths:_clamped});});
  }
},[formValues.projectType]); // eslint-disable-line react-hooks/exhaustive-deps

// ── Auto-create server-side draft on modal open (v8.3.0) ──
// Immediately creates a draft in the backend so:
//   1. _formIdRef.current is populated for DocumentPickerModal "Създай копие и прикачи"
//   2. Document generation (generateApplicationDocument) works without first saving
//   3. The applicant's engagement is persisted server-side from moment zero
const _autoDraftedRef=useRef(false);
const _draftPromiseRef=useRef(null);
// ── v8.4.0: on-demand draft creation for instant document-attach saves ──
// Returns the form id (existing or freshly created). Safe to call multiple
// times — only creates when _formIdRef.current is empty AND no draft is in
// flight. Waits for an in-flight auto-draft if one is already running.
//
// v8.6.0 — NO MORE 'TBD' sentinel. Auto-draft is gated on the user having
// chosen a competition AND a projectType so the row written to the sheet
// always has a real, lookup-able projectCode. Generators downstream depend
// on this; the previous 'TBD' placeholder broke template resolution.
const _ensureDraftExists=async function(opts){
  if(_formIdRef.current)return {id:_formIdRef.current,error:null};
  // If auto-draft is already in progress, await it.
  if(_draftPromiseRef.current)return _draftPromiseRef.current;
  // Create a draft on demand.
  var pComp=formValues.competitionId||availableCompetitions[0]?.id||'';
  if(!pComp)return {id:null,error:new Error('Няма избрана конкурсна сесия')};
  var pType=String(formValues.projectType||'').trim().toUpperCase();
  // Hard requirement: a real project type. No silent 'TBD' fallback.
  if(!pType){
    if(opts&&opts.silent!==true)toast('Моля, изберете тип проект преди да продължите.','warn',4000);
    return {id:null,error:new Error('Няма избран тип проект')};
  }
  var draftPayload={form:{
    userId:user?.email||'',userName:user?.name||'',
    status:'draft',competitionId:pComp,
    projectCode:pType,area:'',professionalField:'',title:'.',
    titleEn:'',acronym:'',description:'',descriptionEn:'',
    objectives:'',expectedResults:'',durationMonths:12,npfTier:'university',
    teamMembers:[],budget:{},files:[],attachedDocs:[]
  }};
  var attempt=0;
  var doCreate=function(){attempt++;
    return mutateApi('createForm',draftPayload,{invalidates:['getforms','getinitialdata']})
      .then(function(res){
        if(res&&res.id){_formIdRef.current=res.id;return {id:res.id,error:null};}
        if(attempt<2){console.warn('Draft creation retry '+attempt+'/2');return doCreate();}
        _draftPromiseRef.current=null;
        return {id:null,error:new Error('Сървърът не върна ID на черновата')};
      }).catch(function(err){
        if(attempt<2){console.warn('Draft creation retry '+attempt+'/2:',err&&err.message);return doCreate();}
        _draftPromiseRef.current=null;
        console.warn('Draft creation failed after '+attempt+' attempts:',err&&err.message);
        return {id:null,error:err||new Error('Неуспешно създаване на чернова')};
      });
  };
  var p=doCreate();
  _draftPromiseRef.current=p;
  return p;
};
// v10.9.0 — clear previously auto-generated docs when project type changes
// v12.12.0 — reset auto-draft gate so new docs generate for the new type
var _prevGenType=useRef('');
useEffect(function(){
  var pt=String(formValues.projectType||'').trim().toUpperCase();
  if(!pt||pt===_prevGenType.current)return;
  _prevGenType.current=pt;
  // Clear old generated docs from previous type
  setAttachedDocs(function(prev){return prev.filter(function(d){return !d._generated;});});
  setGenResults({});
  // Reset gates so generation fires for the new type
  _autoDraftedRef.current=false;
  _lastAutoGenType.current='';
  _step2AutoGenTypeRef.current=null;
  // v12.18.1: reset type-doc copy state so fresh copy fires on next Step 2 entry
  _copyTriggeredRef.current='';
  setCopiedTypeDocs([]);
  setCopyingTypeDocs(false);
  setCopyTypeDocError('');
  setActiveTypeDocIdx(0);
},[formValues.projectType]);
// Auto-create server-side draft on modal open (v8.3.0)
// v12.12.0 — instant auto-generation on project type select, no waiting for draft
var _lastAutoGenType=useRef('');
useEffect(function(){
  if(!user?.email)return;
  var pType=String(formValues.projectType||'').trim().toUpperCase();
  if(!pType)return;
  if(_lastAutoGenType.current===pType)return; // already generated for this type
  _lastAutoGenType.current=pType;
  // Generate application form immediately — draft will be created on-demand
  var docs=(typeof getRequiredDocuments==='function')?getRequiredDocuments(pType):[];
  if(!docs.length)return;
  // Mark generating state for visual feedback
  var _genKeys={};
  docs.forEach(function(doc){_genKeys[doc.id]=true;});
  setGeneratingDoc(function(prev){return Object.assign({},prev,_genKeys);});
  // Ensure draft exists (creates if not), then generate all required docs
    _ensureDraftExists({silent:true}).then(function(result){
      var fid=result&&result.id;
      if(!fid||!pType||pType!==String(formValues.projectType||'').trim().toUpperCase())return;
    // Snapshot budget data at generation time
    var _budgetSnapshot=budget;
    docs.forEach(function(doc){
      if(typeof generateApplicationDocument!=='function')return;
      generateApplicationDocument(fid,doc.id,pType,{
        title:formValues.title,titleEn:formValues.titleEn,acronym:formValues.acronym,
        description:formValues.description,descriptionEn:formValues.descriptionEn,
        objectives:formValues.objectives,expectedResults:formValues.expectedResults,
        area:formValues.area,professionalField:formValues.professionalField,
        durationMonths:formValues.durationMonths,applicantName:user&&user.name,
        teamMembers:teamMembers,
        budget:_budgetSnapshot,projectCode:pType
      }).then(function(res){
        if(res&&res.success){
          var gf=res.applicantFile||res.file||{};
          var editLink=res.googleDocEditLink||(gf.id?'https://docs.google.com/document/d/'+encodeURIComponent(gf.id)+'/edit':'');
          var docObj={id:gf.id,driveId:gf.driveId||gf.id,name:gf.name||(doc.label||doc.id),mimeType:gf.mimeType,previewLink:gf.previewLink||(gf.id?'https://docs.google.com/document/d/'+encodeURIComponent(gf.id)+'/preview':''),downloadUrl:gf.downloadUrl,folderName:gf.folderName||'',googleDocEditLink:editLink,_generated:true,docType:doc.id};
          setAttachedDocs(function(prev){
            if(prev.some(function(d){return d.id===gf.id;}))return prev;
            return prev.concat([docObj]);
          });
          setGenResults(function(prev){var n={};n[doc.id]={success:true,file:gf};return Object.assign({},prev,n);});
        }
      }).catch(function(){/* silent */})
        .finally(function(){
          setGeneratingDoc(function(prev){var n=Object.assign({},prev);delete n[doc.id];return n;});
        });
    });
  }).catch(function(){/* draft creation may fail — retry on step 2 entry */});
},[user?.email,formValues.projectType]);

const loadAvailableCompetitions=useCallback(async(forceRefresh=false)=>{
    setCompsLoading(true);
    try{
    let comps=COMPETITIONS;
    if(!comps.length||forceRefresh){
        const authPayload={isAdmin:!!isAdmin,userId:(user?.email||'')};
        if(isAdmin&&_adminCreds)Object.assign(authPayload,_adminCreds);
        comps=await refreshCompetitions(authPayload,{forceRefresh});
    }
    // Show competitions filtered to current session year first, fallback to all active
    var _sessionYear='2026';
    const filtered=Array.isArray(comps)?comps.filter(function(c){
      if(!c.id)return false;
      if(String(c.id).startsWith('DEMO'))return false;
      var cName=String(c.name||c.id||'').toLowerCase();
      return cName.indexOf(_sessionYear)!==-1;
    }):[];
    // If no competitions match the session year, fall back to all available
    // (avoids empty dropdown when competition names don't include the year)
    const normalized=filtered.length>0?filtered:(Array.isArray(comps)?comps.filter(function(c){return c.id&&!String(c.id).startsWith('DEMO');}):[]);
    setAvailableCompetitions(prev=>competitionListSignature(prev)===competitionListSignature(normalized)?prev:[...normalized]);
    setFormValues(prev=>{
        if(prev.competitionId&&normalized.some(c=>c.id===prev.competitionId))return prev;
        const nextId=(initialCompId&&normalized.some(c=>c.id===initialCompId))?initialCompId:(normalized[0]?.id||'');
        return nextId===prev.competitionId?prev:{...prev,competitionId:nextId};
    });
    }catch(_){}finally{setCompsLoading(false)}
},[isAdmin,user?.email,initialCompId]);

useEffect(()=>{loadAvailableCompetitions(COMPETITIONS.length===0)},[loadAvailableCompetitions]);
// Safety timeout: stop loading after 12s so user sees empty dropdown instead of infinite "Зареждане..."
useEffect(()=>{const t=setTimeout(()=>{setCompsLoading(false);},12000);return()=>clearTimeout(t);},[]);

const handleChange=ev=>{const{name,value}=ev.target;setFormValues(p=>({...p,[name]:value}));if(errors[name])setErrors(p=>{const n={...p};delete n[name];return n})};
// Acronym: strip non-Latin-alphanumeric chars, uppercase, cap at 10 — field is self-sanitizing so "невалиден формат" never appears
const handleAcronymChange=ev=>{var clean=String(ev.target.value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,10);setFormValues(p=>({...p,acronym:clean}));if(errors.acronym)setErrors(p=>{var n={...p};delete n.acronym;return n;});};
// ── Auto-acronym (v9.81.0-autoacronym): when the applicant types a Bulgarian
//    title and the acronym field is still empty, auto-generate a Latin acronym
//    from the first letters of each word (Cyrillic→Latin transliteration). ──
var _autoAcronymFiredRef=useRef(false);
useEffect(function(){
  var title=String(formValues.title||'').trim();
  if(!title||_autoAcronymFiredRef.current||(formValues.acronym||'').trim())return;
  // Only auto-fire once per wizard session — if user clears it, don't re-suggest.
  var cyrToLat={А:'A',Б:'B',В:'V',Г:'G',Д:'D',Е:'E',Ж:'J',З:'Z',И:'I',Й:'Y',К:'K',Л:'L',М:'M',Н:'N',О:'O',П:'P',Р:'R',С:'S',Т:'T',У:'U',Ф:'F',Х:'H',Ц:'C',Ч:'CH',Ш:'SH',Щ:'SHT',Ъ:'U',Ь:'',Ю:'YU',Я:'YA'};
  var words=title.split(/\s+/);
  var acronym='';
  for(var i=0;i<words.length&&acronym.length<10;i++){
    var firstChar=words[i].charAt(0).toUpperCase();
    acronym+=(cyrToLat[firstChar]||firstChar);
  }
  if(acronym.length>0){
    _autoAcronymFiredRef.current=true;
    setFormValues(function(p){return Object.assign({},p,{acronym:acronym.slice(0,10).toUpperCase()});});
  }
},[formValues.title]);
// ── FIELD LABEL MAP for descriptive error messages ──
const _FIELD_LABELS={competitionId:'Конкурсна сесия',projectType:'Тип проект',area:'Приоритетно направление',professionalField:'Професионално направление',title:'Наименование на проектното предложение',titleEn:'Наименование на английски език',acronym:'Акроним',description:'Кратко описание',descriptionEn:'Кратко описание на английски език',objectives:'Цел/и на проектното предложение',durationMonths:'Срок на изпълнение',npfTier:'Ниво на форума',declaration:'Декларация за съгласие',teamMembers:'Екип'};

// ── Scroll-to-error helper (v9.80.0-scrollerr): finds the first field with a
//    validation error in the wizard modal, scrolls it into view, and applies a
//    brief red-border pulse for immediate visual feedback. ──
var scrollToErrorField=function(errs){
  var firstErrKey=Object.keys(errs||{}).filter(function(k){return k!=='_ckk';})[0];
  if(!firstErrKey)return;
  // Find the best target element for the error field.
  // Prefer a visible input/select/textarea inside a .form-field.error wrapper.
  var el=document.querySelector('.form-field.error [name="'+firstErrKey+'"]');
  if(!el){
    // Fallback: any element with the matching name (e.g. hidden MultiSelect input)
    el=document.querySelector('[name="'+firstErrKey+'"]');
  }
  if(el){
    // For hidden inputs (MultiSelect), climb to the parent .form-field so
    // scrollIntoView brings the whole widget into view.
    if(el.type==='hidden'){
      var ff=el.closest&&el.closest('.form-field');
      if(ff)el=ff;
    }
    if(typeof el.scrollIntoView==='function'){
      el.scrollIntoView({behavior:'smooth',block:'center'});
    }
    // Focus the interactive element after scroll settles (skip hidden inputs)
    if(typeof el.focus==='function'&&el.type!=='hidden'){
      setTimeout(function(){try{el.focus();}catch(_){}},420);
    }
    // ── Brief extra pulse on the form-field wrapper for strong visual cue ──
    try{
      var wrapper=el.closest&&el.closest('.form-field');
      if(wrapper){
        wrapper.style.transition='box-shadow .15s ease';
        wrapper.style.boxShadow='0 0 0 0px rgba(139,21,21,0)';
        requestAnimationFrame(function(){
          wrapper.style.boxShadow='0 0 0 4px rgba(220,38,38,.5)';
          setTimeout(function(){wrapper.style.boxShadow='0 0 0 4px rgba(139,21,21,.18)';},500);
          setTimeout(function(){wrapper.style.boxShadow='';wrapper.style.transition='';},1200);
        });
      }
    }catch(_){}
  }
};

// ── REAL-TIME BUDGET VALIDATION (v4.6.0) ──
// Runs reactively whenever budget, project type, duration, or team changes.
// This means the submit button auto-enables as soon as the user fixes issues —
// no need to click "Изпрати" first to discover budget problems.
const _computeBudgetViolations=function(bgt,pc,months,members,leaderFlags){
  var violations=[];
  if(!pc||!bgt||typeof bgt!=='object')return violations;
  var _eur=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;
  var pt=PROJECT_TYPES.find(function(p){return p.value===pc;});
  var maxBudgetEUR=pt?pt.maxBudget:0;
  months=Number(months)||12;var nYears=Math.max(1,Math.ceil(months/12));
  var tot={};var grandBGN=0;
  ['salaries','external_services','assets','consumables','literature','travel','publications','reviews','other'].forEach(function(gid){tot[gid]=0;});
  Object.keys(bgt).forEach(function(gid){if(gid==='_monthlyMode'||gid==='_monthly')return;var byYear=bgt[gid]||{};Object.keys(byYear).forEach(function(yr){var v=Number(byYear[yr])||0;tot[gid]=(tot[gid]||0)+v;grandBGN+=v;});});
  // Include monthly mode
  var mData=bgt._monthly;if(mData&&typeof mData==='object'){Object.keys(mData).forEach(function(mgid){var mByPeriod=mData[mgid]||{};if(mByPeriod&&typeof mByPeriod==='object'){Object.keys(mByPeriod).forEach(function(period){var v=Number(mByPeriod[period])||0;tot[mgid]=(tot[mgid]||0)+v;grandBGN+=v;});}});}
  var grandEUR=grandBGN/_eur;var pctOf=function(amt){return grandBGN>0?(amt/grandBGN)*100:0;};
  var sal=tot.salaries||0,ext=tot.external_services||0,lit=tot.literature||0,cons=tot.consumables||0;
  var trav=tot.travel||0,rev=tot.reviews||0,pub=tot.publications||0,ass=tot.assets||0,oth=tot.other||0;
  var membersArr=Array.isArray(members)?members:[];
  // v9.39.0-applicant-aware: leader counts too — the 35% cap applies whenever any
  // doctoral/young scientist is in the team, INCLUDING the leader themselves.
  var leaderIsYoung=!!(leaderFlags&&(leaderFlags.young||leaderFlags.doctoral));
  var hasDocYoung=leaderIsYoung||membersArr.some(function(m){return m.role==='young'||m.role==='doctoral'||m.youngScientist||m.doctoral;});

  // ═══ ФНИ — Пълна валидация (правилник 2026) ═══
  if(pc==='ФНИ'){
    if(maxBudgetEUR>0&&grandEUR>maxBudgetEUR+0.005)
      violations.push({message:'Общият бюджет ('+grandEUR.toFixed(0)+' €) надвишава максимума за ФНИ ('+maxBudgetEUR+' €). Намалете с '+(grandEUR-maxBudgetEUR).toFixed(0)+' €.',severity:'high',group:'total'});
    if(grandBGN>0&&pctOf(lit)>10)
      violations.push({message:'Специализирана научна литература (т. 2.1): '+pctOf(lit).toFixed(1)+'% от бюджета надвишава лимита от 10%.',severity:'high',group:'literature'});
    if(grandBGN>0&&pctOf(cons)>5)
      violations.push({message:'Канцеларски материали (т. 2.3): '+pctOf(cons).toFixed(1)+'% от бюджета надвишава лимита от 5%.',severity:'high',group:'consumables'});
    var salCap=hasDocYoung?35:10;
    if(grandBGN>0&&pctOf(sal)>salCap)
      violations.push({message:'Възнаграждения на екипа (т. 3.1): '+pctOf(sal).toFixed(1)+'% от бюджета надвишава '+salCap+'%'+(hasDocYoung?' (с докторанти/млади учени)':' (без докторанти/млади учени)')+'.',severity:'high',group:'salaries'});
    var maxRevEUR=250+60+(25*nYears);var revEUR=rev/_eur;
    if(revEUR>maxRevEUR+0.005)
      violations.push({message:'Рецензии (т. 3.2–3.4): '+revEUR.toFixed(0)+' € надвишават '+maxRevEUR.toFixed(0)+' € (250 € монография + 60 € проект + '+(25*nYears)+' € за '+nYears+' г. отчети).',severity:'high',group:'reviews'});
    if(grandBGN>0&&pctOf(ext)>25)
      violations.push({message:'Външни услуги (т. 4.1–4.3): '+pctOf(ext).toFixed(1)+'% от бюджета надвишава 25%.',severity:'high',group:'external_services'});
    if(grandBGN>0&&pctOf(trav)>20)
      violations.push({message:'Командировки (т. 4.4): '+pctOf(trav).toFixed(1)+'% от бюджета надвишава 20%.',severity:'high',group:'travel'});
    if(grandBGN>0&&pctOf(oth)>20)
      violations.push({message:'Други / емпирични изследвания (т. 4.6): '+pctOf(oth).toFixed(1)+'% от бюджета надвишава 20%.',severity:'high',group:'other'});
    // v9.37.0-regulatory: M1 zero-expense rule for ФНИ
    if(mData&&typeof mData==='object'){
      var m1Total=0;
      Object.keys(mData).forEach(function(mgid){var m1v=Number((mData[mgid]||{})['M1'])||0;m1Total+=m1v;});
      if(m1Total>0)violations.push({message:'M1 (първи месец, декември): не се допускат разходи през първия месец съгласно правилата за ФНИ.',severity:'high',group:'m1'});
    }
  }

  // ═══ ПНИ BUDGET RULES ═══
  if(pc==='ПНИ'){
    if(maxBudgetEUR>0&&grandEUR>maxBudgetEUR+0.005)violations.push({message:'Общият бюджет ('+grandEUR.toFixed(0)+' €) надвишава максимума за ПНИ ('+maxBudgetEUR+' €).',severity:'high',group:'total'});
    if(grandBGN>0&&pctOf(lit)>10)violations.push({message:'Литература: '+pctOf(lit).toFixed(1)+'% надвишава 10% (т. 2.1).',severity:'high',group:'literature'});
    if(grandBGN>0&&pctOf(cons)>5)violations.push({message:'Канцеларски материали: '+pctOf(cons).toFixed(1)+'% надвишава 5% (т. 2.3).',severity:'high',group:'consumables'});
    var salCapP=hasDocYoung?35:10;
    if(grandBGN>0&&pctOf(sal)>salCapP)violations.push({message:'Възнаграждения: '+pctOf(sal).toFixed(1)+'% надвишава '+salCapP+'%'+(hasDocYoung?' (с докторанти/млади учени)':' (без)')+' (т. 3.1).',severity:'high',group:'salaries'});
    if(grandBGN>0&&pctOf(ext)>20)violations.push({message:'Външни услуги: '+pctOf(ext).toFixed(1)+'% надвишава 20% (ПНИ, т. 4.3).',severity:'high',group:'external_services'});
    if(grandBGN>0&&pctOf(trav)>15)violations.push({message:'Командировки: '+pctOf(trav).toFixed(1)+'% надвишава 15% (ПНИ, т. 4.4.2).',severity:'high',group:'travel'});
    if(grandBGN>0&&pctOf(oth)>25)violations.push({message:'Други: '+pctOf(oth).toFixed(1)+'% надвишава 25% (ПНИ, т. 4.5).',severity:'high',group:'other'});
    var maxRevEURp=60+(25*nYears);var revEURp=rev/_eur;
    if(revEURp>maxRevEURp+0.005)violations.push({message:'Рецензии: '+revEURp.toFixed(0)+' € надвишават '+maxRevEURp.toFixed(0)+' € (60 € проект + '+(25*nYears)+' € отчети).',severity:'high',group:'reviews'});
    // v9.37.0-regulatory: M1 zero-expense rule for ПНИ
    if(mData&&typeof mData==='object'){
      var m1TotalP=0;
      Object.keys(mData).forEach(function(mgid){var m1v=Number((mData[mgid]||{})['M1'])||0;m1TotalP+=m1v;});
      if(m1TotalP>0)violations.push({message:'M1 (първи месец, декември): не се допускат разходи през първия месец съгласно правилата за ПНИ.',severity:'high',group:'m1'});
    }
  }

  // ═══ ДНП BUDGET RULES ═══
  if(pc==='ДНП'){
    if(maxBudgetEUR>0&&grandEUR>maxBudgetEUR+0.005)violations.push({message:'Общият бюджет ('+grandEUR.toFixed(0)+' €) надвишава максимума за ДНП ('+maxBudgetEUR+' €).',severity:'high',group:'total'});
    if(grandBGN>0&&pctOf(cons)>10)violations.push({message:'Канцеларски материали: '+pctOf(cons).toFixed(1)+'% надвишава 10% (ДНП).',severity:'high',group:'consumables'});
    if(sal>0.005)violations.push({message:'Възнаграждения на екипа ('+(sal/_eur).toFixed(0)+' €) не се допускат за ДНП проекти.',severity:'high',group:'salaries'});
    var maxRevEURd=60+(25*nYears);var revEURd=rev/_eur;
    if(revEURd>maxRevEURd+0.005)violations.push({message:'Рецензии: '+revEURd.toFixed(0)+' € надвишават '+maxRevEURd.toFixed(0)+' € (60 € проект + '+(25*nYears)+' € отчети).',severity:'high',group:'reviews'});
  }

  // ═══ НПФ BUDGET RULES ═══
  if(pc==='НПФ'){
    // v9.69.x: cap is the SELECTED tier's max (катедра 3000 / факултет 2500 / университет 6000 €),
    // not the flat top-level НПФ maximum — otherwise lower tiers were allowed too much.
    var _npfTierKey=(leaderFlags&&leaderFlags.npfTier)?String(leaderFlags.npfTier).toLowerCase():'university';
    var _npfTierMaxEUR=(pt&&pt.npfTiers&&pt.npfTiers[_npfTierKey])?(pt.npfTiers[_npfTierKey].maxEUR||maxBudgetEUR):maxBudgetEUR;
    if(_npfTierMaxEUR>0&&grandEUR>_npfTierMaxEUR+0.005)violations.push({message:'Общият бюджет ('+grandEUR.toFixed(0)+' €) надвишава максимума за избраното ниво на форума ('+_npfTierMaxEUR+' €).',severity:'high',group:'total'});
    // v9.37.0-regulatory: НПФ detailed budget rules
    if(grandBGN>0&&pctOf(ext)>15)violations.push({message:'Визуална идентичност и техн. обслужване: '+pctOf(ext).toFixed(1)+'% надвишава 15% (НПФ).',severity:'high',group:'external_services'});
    if(grandBGN>0&&pctOf(oth)>30)violations.push({message:'Портфолио на събитието: '+pctOf(oth).toFixed(1)+'% надвишава 30% (НПФ, макс. ≈ 15 €/участник).',severity:'high',group:'other'});
    // Guest lecturer honorarium ≤ 511 €
    var guestEUR=sal/_eur;
    if(guestEUR>511+0.005)violations.push({message:'Хонорар за гост-лектор: '+guestEUR.toFixed(0)+' € надвишава 511 €.',severity:'high',group:'salaries'});
    // Reviewer ≤ 51 €
    var revNPFEUR=rev/_eur;
    if(revNPFEUR>51+0.005)violations.push({message:'Рецензент: '+revNPFEUR.toFixed(0)+' € надвишава 51 €.',severity:'high',group:'reviews'});
    // Literature/datasets check
    if(grandBGN>0&&pctOf(lit)>10)violations.push({message:'Литература/бази данни: '+pctOf(lit).toFixed(1)+'% надвишава 10% (препоръчително за НПФ).',severity:'warn',group:'literature'});
  }
  // v9.37.0-regulatory: Doctoral/young scientists ≥ 30% of total salaries (ФНИ/ПНИ)
  if((pc==='ФНИ'||pc==='ПНИ')&&sal>0&&hasDocYoung){
    // Informational: the rule requires ≥30% of salary pool for doctoral/young
    // This is enforced via the form's team member role selection
    violations.push({message:'Напомняне: Възнагражденията за докторанти и млади учени трябва да са ≥ 30% от общите възнаграждения (т. 3.1.1).',severity:'info',group:'salaries'});
  }
  // v9.37.0-regulatory: Datasets ≤ 40% (ФНИ/ПНИ, т. 2.2)
  if((pc==='ФНИ'||pc==='ПНИ')&&grandBGN>0&&pctOf(lit)>40){
    violations.push({message:'Информационни бази данни (т. 2.2): '+pctOf(lit).toFixed(1)+'% от бюджета надвишава лимита от 40%.',severity:'high',group:'literature'});
  }
  return violations;
};

// ── Reactive budget validation (useMemo — no extra render cycle) ──
var budgetErrors=useMemo(function(){
  try {
    var pc=String(formValues.projectType||'').toUpperCase();
    if(typeof _computeBudgetViolations==='function'){
      return _computeBudgetViolations(budget,pc,formValues.durationMonths,teamMembers,{young:!!formValues.leaderYoungScientist,doctoral:!!formValues.leaderDoctoral,npfTier:formValues.npfTier});
    }
  } catch(e) {}
  return [];
},[budget,formValues.projectType,formValues.durationMonths,teamMembers,formValues.leaderYoungScientist,formValues.leaderDoctoral,formValues.npfTier]);

// ── Reactive field validation: clears errors as user fills fields ──
// v9.39.1: acronym is OPTIONAL (per §5 rules) — only validate format when non-empty.
// The old special-case `return` inside forEach was also silently skipping the
// error-clear for the FIRST error when acronym was empty, making the error
// message stick around even when the user never touched the field.
useEffect(function(){
  if(!Object.keys(errors).length)return;
  var fixed={};
  var changed=false;
  Object.keys(errors).forEach(function(k){
    var val=formValues[k];
    if(k==='acronym'){
      // Acronym is optional — if empty, the error can clear.
      // If non-empty, only clear when format is valid.
      if(!String(val||'').trim()||!/^[A-Za-z0-9]{1,10}$/.test(String(val).trim()))return;
    } else {
      // All other fields: clear error when filled.
      if(val===undefined||val===null||String(val).trim()==='')return;
    }
    fixed[k]=true;changed=true;
  });
  if(changed){
    setErrors(function(prev){
      var next={};
      Object.keys(prev).forEach(function(k){if(!fixed[k])next[k]=prev[k];});
      return next;
    });
  }
},[formValues]);

// ── One-shot validate (field errors only — budget is reactive) ──
const validate=()=>{const errs={};if(!formValues.competitionId)errs.competitionId='Изберете конкурсна сесия';if(!formValues.projectType)errs.projectType='Изберете тип проект';if(selectedAreas.length===0&&!formValues.area)errs.area='Изберете поне едно приоритетно направление';if(selectedProfFields.length===0)errs.professionalField='Изберете поне едно професионално направление';if(!formValues.title.trim())errs.title='Въведете наименование на проектното предложение';// titleEn is advisory — backend does not hard-block on it; removing frontend block prevents false positives
// v9.50.0-fix: acronym is self-sanitized by handleAcronymChange so format is always valid; skip redundant regex check
var _descWc=(formValues.description||'').trim().split(/\s+/).filter(Boolean).length;if(!formValues.description.trim())errs.description='Въведете кратко описание';else if(_descWc>200)errs.description='Краткото описание трябва да е до 200 думи (текущо: '+_descWc+')';
// descriptionEn and objectives are advisory — backend does not hard-block; only word-count when present
var _descEnWc=(formValues.descriptionEn||'').trim().split(/\s+/).filter(Boolean).length;if(_descEnWc>200)errs.descriptionEn='Краткото описание на английски трябва да е до 200 думи (текущо: '+_descEnWc+')';
if(!formValues.objectives.trim())errs.objectives='Въведете цел/и на проектното предложение';
// v9.37.0-regulatory: Duration enforcement (per project type — НПФ 1–3, ФНИ/ПНИ 12–36, ДНП 12)
(function(){
  var _ptV=PROJECT_TYPES.find(function(p){return p.value===formValues.projectType;});
  var _minV=_ptV&&_ptV.minDurationMonths?_ptV.minDurationMonths:12;
  var _maxV=_ptV&&_ptV.maxDurationMonths?_ptV.maxDurationMonths:36;
  var _dm=Number(formValues.durationMonths);
  if(isNaN(_dm)||_dm<_minV||_dm>_maxV){
    errs.durationMonths=(_minV===_maxV)
      ? ('Срокът трябва да е '+_minV+' месеца съгласно Правилника')
      : ('Срокът трябва да е между '+_minV+' и '+_maxV+' месеца съгласно Правилника');
  }
})();
// v9.37.0-regulatory: Team size enforcement
if((formValues.projectType==='ФНИ'||formValues.projectType==='ПНИ')&&teamMembers.length>5)errs.teamMembers='Максимум 5 члена на екипа (текущо: '+teamMembers.length+')';
// v9.37.0-regulatory: НПФ tier required
if(formValues.projectType==='НПФ'&&!formValues.npfTier)errs.npfTier='Изберете ниво на форума';
// v9.37.0-regulatory: CKK member block — immediate feedback
if(typeof _CKK_SET!=='undefined'?_CKK_SET.has((user?.email||'').toLowerCase()):(typeof CKK_MEMBERS!=='undefined'&&Array.isArray(CKK_MEMBERS)&&CKK_MEMBERS.indexOf((user?.email||'').toLowerCase())!==-1)){
  errs._ckk='Членовете на ЦКК не могат да подават проектни предложения съгласно правилника на конкурсната сесия.';
}
// v9.37.0-regulatory: Student collaborator count enforcement
var studentCount=Array.isArray(teamMembers)?teamMembers.filter(function(m){return m.role==='student'||m.role==='collaborator';}).length:0;
if((formValues.projectType==='ФНИ'||formValues.projectType==='ПНИ')&&studentCount>3)errs.teamMembers='Максимум 3 студенти-сътрудници (текущо: '+studentCount+')';
// v9.50.0-declaration: задължителна декларация за съгласие с правилниците
if(!declarationAccepted)errs.declaration='Моля, маркирайте, че сте запознати с приложимите правилници.';
setErrors(errs);
_lastValidationErrors.current=errs; // store fresh errs so handleSubmit can read them synchronously (avoids stale-closure issue)
var hasBlockers=budgetErrors.some(function(v){return v.severity==='high';});
// ── Submit-time gates (do NOT block draft save) ──
// 1) Budget must be populated with non-zero total.
var budgetKeys=Object.keys(budget||{}).filter(function(k){return k!=='_monthlyMode'&&k!=='_monthly';});
var budgetTotal=0;
try{
  budgetKeys.forEach(function(k){
    var v=budget[k];
    if(v&&typeof v==='object'){Object.keys(v).forEach(function(p){var n=Number(v[p]);if(!isNaN(n))budgetTotal+=n;});}
    else{var n=Number(v);if(!isNaN(n))budgetTotal+=n;}
  });
  // Include monthly-mode data
  var _md=budget._monthly;
  if(_md&&typeof _md==='object'){
    Object.keys(_md).forEach(function(mgid){
      var mp=_md[mgid]||{};
      if(mp&&typeof mp==='object'){Object.keys(mp).forEach(function(period){var n=Number(mp[period])||0;budgetTotal+=n;});}
    });
  }
}catch(_){budgetTotal=0;}
var emptyBudget=budgetKeys.length===0&&(!budget._monthly||Object.keys(budget._monthly).length===0)||budgetTotal<=0;
// 2) All required documents per project type must be attached.
var docsMissing=0;
try{
  if(formValues.projectType&&typeof getRequiredDocuments==='function'){
    var req=getRequiredDocuments(formValues.projectType)||[];
    if(req.length&&typeof checkRequiredDocsStatus==='function'){
      var st=checkRequiredDocsStatus(formValues.projectType,attachedDocs,files)||{total:req.length,fulfilled:0};
      docsMissing=Math.max(0,(st.total||req.length)-(st.fulfilled||0));
    }
  }
}catch(_){docsMissing=0;}
return Object.keys(errs).length===0&&!hasBlockers&&!emptyBudget&&docsMissing===0;};

// ── Wizard navigation helpers (v8.2.0 / v12.10.0 combined docs+files step) ──
const goNext=()=>{if(wizardStep===1){var s1=validateStep1();if(s1.length>0){validate();scrollToErrorField(_lastValidationErrors.current);toast('Попълнете: '+s1.slice(0,3).join(', ')+(s1.length>3?' и още '+(s1.length-3):''),'warn',4000);return;}setWizardStep(2);}else if(wizardStep===2){var s2=validateStep2();if(s2.length>0){toast(s2[0],'warn',5000);return;}setWizardStep(3);}};
const goPrev=()=>{if(wizardStep>1)setWizardStep(wizardStep-1);};
const goToStep=s=>{if(s>=1&&s<=3)setWizardStep(s);};
// v9.50.0-fix: acronym format check removed — handleAcronymChange self-sanitizes to Latin+digits+uppercase, format is always valid
const validateStep1=()=>{var i=[];if(!formValues.competitionId)i.push('Конкурсна сесия');if(!formValues.projectType)i.push('Тип проект');if(selectedAreas.length===0&&!formValues.area)i.push('Приоритетно направление');if(selectedProfFields.length===0)i.push('Професионално направление');if(!formValues.title.trim())i.push('Наименование');if(!formValues.description.trim())i.push('Кратко описание');if(!formValues.objectives.trim())i.push('Цел/и');return i;};
const validateStep2=()=>{
  // v20.0.0-docfix: complete if type templates are copied OR user attached docs manually.
  // Also waits for copyTypeTemplatesForForm and pregen to finish.
  try{
    var _ctd=typeof copiedTypeDocs!=='undefined'?copiedTypeDocs:[];
    var _ctg=typeof copyingTypeDocs!=='undefined'?copyingTypeDocs:false;
    var _cte=typeof copyTypeDocError!=='undefined'?copyTypeDocError:'';
    var _ad=typeof attachedDocs!=='undefined'?attachedDocs:[];
    var _pg=typeof pregenInFlight!=='undefined'?pregenInFlight:false;
    // If user has attached docs (from library, upload, or template copy), step is complete
    if(_ctd.length>0||_ad.length>0)return[];
    if(_pg)return['\u041f\u043e\u0434\u0433\u043e\u0442\u0432\u044f\u043c\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0438\u0442\u0435 \u2014 \u0438\u0437\u0447\u0430\u043a\u0430\u0439\u0442\u0435\u2026'];
    if(_ctg)return['\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0438\u0442\u0435 \u0441\u0435 \u043a\u043e\u043f\u0438\u0440\u0430\u0442 \u2014 \u0438\u0437\u0447\u0430\u043a\u0430\u0439\u0442\u0435\u2026'];
    if(_cte)return['\u0413\u0440\u0435\u0448\u043a\u0430 \u043f\u0440\u0438 \u043a\u043e\u043f\u0438\u0440\u0430\u043d\u0435 \u043d\u0430 \u0448\u0430\u0431\u043b\u043e\u043d\u0438 \u2014 \u043e\u043f\u0438\u0442\u0430\u0439\u0442\u0435 \u043e\u0442\u043d\u043e\u0432\u043e.'];
    if(!formValues.projectType)return['\u0418\u0437\u0431\u0435\u0440\u0435\u0442\u0435 \u0442\u0438\u043f \u043f\u0440\u043e\u0435\u043a\u0442 \u0432 \u0421\u0442\u044a\u043f\u043a\u0430 1.'];
    return['\u0418\u0437\u0447\u0430\u043a\u0430\u0439\u0442\u0435 \u043a\u043e\u043f\u0438\u0440\u0430\u043d\u0435\u0442\u043e \u043d\u0430 \u0448\u0430\u0431\u043b\u043e\u043d\u043d\u0438\u0442\u0435 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0438\u2026'];
  }catch(_){return[];}
};
const validateStep3=()=>{var i=[];var regularKeys=Object.keys(budget).filter(function(k){return k!=='_monthlyMode'&&k!=='_monthly';});var hasMonthly=budget._monthly&&Object.keys(budget._monthly).length>0;var h=regularKeys.length>0||hasMonthly;if(!h){i.push('Попълнете бюджета');return i;}var he=budgetErrors.filter(function(v){return v.severity==='high';});if(he.length>0)i.push('Коригирайте '+he.length+' бюджетн'+(he.length===1?'о нарушение':'и нарушения'));return i;};
const step1Complete=validateStep1().length===0;
const step2Complete=validateStep2().length===0;
const step3Complete=budgetErrors.filter(function(v){return v.severity==='high';}).length===0&&(Object.keys(budget).filter(function(k){return k!=='_monthlyMode'&&k!=='_monthly';}).length>0||(budget._monthly&&Object.keys(budget._monthly).length>0));

// ── Auto-generate documents as soon as project type is selected (v10.3.0-bg-gen) ──
// Previously waited until Step 2 entry; now triggers immediately when the
// applicant picks a project type and a draft exists, so documents are already
// generated and ready for inline editing when the applicant reaches Step 2.
//
// Uses polling (up to 5s) to wait for the auto-draft to be created, then
// generates all missing documents + budget spreadsheet in sequence.
//
// v12.13.0: Also calls ensureUserPregeneratedDocs to INSTANTLY create
// user-specific template copies in the "Моите документи" folder. These
// are real editable copies that the user can open immediately in Step 2
// while the full auto-generation (with placeholder filling) runs in background.
var _earlyGenTypeRef=useRef(null);
var _earlyGenPollRef=useRef(null);
var _pregeneratedApiCalledRef=useRef(null);
useEffect(function(){
  var pt=formValues.projectType;
  if(!pt)return;
  // v10.11.0: reset when project type changes to a different value
  if(_earlyGenTypeRef.current===pt)return;
  _earlyGenTypeRef.current=pt;
  if(_earlyGenPollRef.current){clearTimeout(_earlyGenPollRef.current);_earlyGenPollRef.current=null;}

  // ── v12.13.0: Call ensureUserPregeneratedDocs to create user copies instantly ──
  // This runs BEFORE the formId exists — it only needs projectType.
  // The returned docs are stored in _pregeneratedDocsRef so Phase 4b can
  // display them immediately when the user enters Step 2.
  if(_pregeneratedApiCalledRef.current!==pt&&typeof api==='function'){
    _pregeneratedApiCalledRef.current=pt;
    setPregenInFlight(true);
    // v12.17.3: ref is pre-seeded with builtin IDs at mount — iframe shows instantly.
    // This API call runs SILENTLY in background to create the user's editable copy.
    // When it returns, _pregeneratedDocsRef is updated so next Step 2 entry gets it.
    // v19.0.0-authfix: Include user email so PHP handler can identify the caller
    var _userEmail=(typeof _currentUserEmail!=='undefined'&&_currentUserEmail)||'';
    api('ensureUserPregeneratedDocs',{projectType:pt,userId:_userEmail}).then(function(res){
      setPregenInFlight(false);
      if(res&&res.success&&Array.isArray(res.docs)&&res.docs.length){
        // Store the real user copies (with Drive IDs) — replaces builtin master entries
        var reg={};
        reg[pt]=res.docs.map(function(d){return{
          id:d.docType||d.id||d.fileId,
          fileId:d.fileId||d.driveId||d.id,
          name:d.name,
          mimeType:d.mimeType||'application/vnd.google-apps.document',
          _master:false
        };});
        _pregeneratedDocsRef.current=Object.assign({},_pregeneratedDocsRef.current,reg);
        // If on Step 2, optionally swap to the personal copy
        if(_wizardStepRef.current===2&&res.docs[0]){
          var d=res.docs[0],fid=d.fileId||d.driveId||d.id;
          // v12.30.1-fix: _generated:true so checkRequiredDocsStatus matches via docType+'_generated'
          var personalDoc={id:fid,driveId:fid,name:d.name||(pt+'-Формуляр'),
            mimeType:d.mimeType||'application/vnd.google-apps.document',
            googleDocEditLink:d.googleDocEditLink||d.editLink||('https://docs.google.com/document/d/'+encodeURIComponent(fid)+'/edit'),
            _generated:true,_pregenerated:true,
            docType:d.docType||pt+'_form',origin:'pregen',projectType:pt};
          // v12.30.1-fix: Only skip if the SAME docType already exists, not any pregenerated
          setAttachedDocs(function(prev){
            var clean=prev.filter(function(x){return !x._masterFallback;});
            var already=clean.some(function(x){ return x.docType && x.docType === personalDoc.docType; });
            if(already) return clean;
            return clean.concat([personalDoc]);
          });
        }
      }
    }).catch(function(){setPregenInFlight(false);});
  }

  var cancelled=false;
  var attempts=0;
  var pollTimer=null;
  var doGenerate=function(){
    if(cancelled)return;
    if(!_formIdRef.current){
      if(++attempts<20){pollTimer=setTimeout(doGenerate,300);}
      return;
    }
    // v12.8.0: snapshot all needed state into locals to avoid stale closures
    var _attachedDocsSnapshot=attachedDocs;
    var _filesSnapshot=files;
    var _budgetSnapshot=budget;
    var _generatingDocSnapshot=generatingDoc;
    var _fv=formValues;
    var _user=user;
    var _teamMembers=teamMembers;

    var required=(typeof getRequiredDocuments==='function')?getRequiredDocuments(pt):[];
    if(!required.length)return;
    var status=(typeof checkRequiredDocsStatus==='function')
      ?checkRequiredDocsStatus(pt,_attachedDocsSnapshot,_filesSnapshot)
      :{total:0,fulfilled:0};
    var missing=status.missing||[];
    var missingDocTypes=missing.map(function(m){return m.id;}).filter(Boolean);
    // v10.3.0-bg-gen: Generate ALL documents in parallel, silently in background.
    var _genCount=0;
    var _allPromises=[];
    var _firstGenDoc=null;
    missingDocTypes.forEach(function(dt){
      var liveType=String(pt||'').trim().toUpperCase();
      if(!liveType)return;
      var fid=_formIdRef.current;
      if(!fid||_generatingDocSnapshot[dt])return;
      var p=typeof generateApplicationDocument==='function'
        ? generateApplicationDocument(fid,dt,liveType,{
            title:_fv.title,titleEn:_fv.titleEn,acronym:_fv.acronym,
            description:_fv.description,descriptionEn:_fv.descriptionEn,
            objectives:_fv.objectives,expectedResults:_fv.expectedResults,
            area:_fv.area,professionalField:_fv.professionalField,
            durationMonths:_fv.durationMonths,applicantName:_user&&_user.name,
            teamMembers:_teamMembers
          }).then(function(res){
            if(cancelled)return;
            if(res&&res.success){
              var gf=res.applicantFile||res.file;
              if(gf){
                var el=res.googleDocEditLink||(gf.id?'https://docs.google.com/document/d/'+encodeURIComponent(gf.id)+'/edit':'');
                var dobj={id:gf.id,driveId:gf.driveId||gf.id,name:gf.name,mimeType:gf.mimeType,previewLink:gf.previewLink||(gf.id?'https://docs.google.com/document/d/'+encodeURIComponent(gf.id)+'/preview':''),downloadUrl:gf.downloadUrl,folderName:gf.folderName||'',googleDocEditLink:el,_generated:true,docType:dt};
                setAttachedDocs(function(prev){var _pg=prev.filter(function(d){return!(d._pregenerated&&d.docType===dobj.docType);});if(_pg.some(function(d){return d.id===dobj.id;}))return _pg;return _pg.concat([dobj]);});
                _genCount++;
                if(!_firstGenDoc)_firstGenDoc=dobj;
                try{window.dispatchEvent(new CustomEvent('erp:mydocAdded',{detail:dobj}));}catch(_){}
              }
              try{trackGenResult(dt,{success:true,file:gf||null});}catch(_){}
            }else{
              try{trackGenResult(dt,{success:false,error:(res&&res.error)||'Грешка при генериране'});}catch(_){}
            }
          }).catch(function(err){try{trackGenResult(dt,{success:false,error:err.message||'Грешка при свързване'});}catch(_){}})
        : Promise.resolve();
      _allPromises.push(p);
    });
    // v12.8.0: use locally captured _firstGenDoc instead of scanning stale attachedDocs
    if(_allPromises.length>0){
      Promise.allSettled(_allPromises).then(function(){
        if(cancelled)return;
        if(_genCount>0){
          try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}
          if(_firstGenDoc&&typeof setEditingDoc==='function'){
            try{setEditingDoc(_firstGenDoc);}catch(_){}
            var msg='✅ '+_genCount+' документ'+
              (_genCount===1?' е генериран. Отваряне на редактора…':'а са генерирани. Отваряне на редактора…');
            if(typeof toast==='function')toast(msg,'success',4000);
          } else {
            var msg=_genCount===1?'1 документ е генериран. Отворете „Формуляр" за да го редактирате.'
              :_genCount+' документа са генерирани. Отворете „Формуляр" за да ги редактирате.';
            if(typeof toast==='function')toast('✅ '+msg,'success',6000);
          }
        }
      });
    }
  };
  doGenerate(); // v10.3.0: fire immediately — no delay, docs ready by Step 2
  return function(){cancelled=true;if(pollTimer)clearTimeout(pollTimer);};
},[formValues.projectType,_formIdRef.current]);

// v10.3.0: Auto-generation runs silently in background — no progress modal needed

// ── Fallback: auto-generate on Step 2 entry (v10.11.0-bg-gen) ──
// Re-fires every time step 2 is entered with a project type.
// Guards against duplicate generation inside the loop (alreadyGenerated check).
const _step2AutoGenTypeRef=useRef(null);
useEffect(function(){
  if(wizardStep!==2)return;
  if(!formValues.projectType)return;
  // v10.11.0: track the project type so changing type → re-entering step 2 re-generates
  var pt=formValues.projectType;
  if(_step2AutoGenTypeRef.current===pt)return;
  _step2AutoGenTypeRef.current=pt;
  var cancelled=false;
  // snapshot state to avoid stale closures
  var _pt=formValues.projectType;
  var _docs=attachedDocs;
  var _files=files;
  var _budget=budget;
  var _genDoc=generatingDoc;
  var _fv=formValues;
  var _user=user;
  var _tm=teamMembers;
  var t=setTimeout(function(){
    if(cancelled)return;
    var required=(typeof getRequiredDocuments==='function')?getRequiredDocuments(_pt):[];
    if(!required.length)return;
    var status=(typeof checkRequiredDocsStatus==='function')
      ?checkRequiredDocsStatus(_pt,_docs,_files)
      :{total:0,fulfilled:0};
    var missing=status.missing||[];
    var alreadyGenerated=0;
    for(var _bi=0;_bi<_docs.length;_bi++){if(_docs[_bi]&&_docs[_bi]._generated)alreadyGenerated++;}
    if(alreadyGenerated>=required.length)return;
    var missingDocTypes=missing.map(function(m){return m.id;}).filter(Boolean);
    if(!missingDocTypes.length)return;
    var _genCountFallback=0;
    var _firstDocFallback=null;
    var _allPromises=[];
    missingDocTypes.forEach(function(dt){
      var liveType=String(_pt||'').trim().toUpperCase();
      if(!liveType)return;
      var fid=_formIdRef.current;
      if(!fid||_genDoc[dt])return;
      var p=typeof generateApplicationDocument==='function'
        ? generateApplicationDocument(fid,dt,liveType,{
            title:_fv.title,titleEn:_fv.titleEn,acronym:_fv.acronym,
            description:_fv.description,descriptionEn:_fv.descriptionEn,
            objectives:_fv.objectives,expectedResults:_fv.expectedResults,
            area:_fv.area,professionalField:_fv.professionalField,
            durationMonths:_fv.durationMonths,applicantName:_user&&_user.name,
            teamMembers:_tm
          }).then(function(res){
            if(cancelled)return;
            if(res&&res.success){
              var gf=res.applicantFile||res.file;
              if(gf){
                var el=res.googleDocEditLink||(gf.id?'https://docs.google.com/document/d/'+encodeURIComponent(gf.id)+'/edit':'');
                var dobj={id:gf.id,driveId:gf.driveId||gf.id,name:gf.name,mimeType:gf.mimeType,previewLink:gf.previewLink||(gf.id?'https://docs.google.com/document/d/'+encodeURIComponent(gf.id)+'/preview':''),downloadUrl:gf.downloadUrl,folderName:gf.folderName||'',googleDocEditLink:el,_generated:true,docType:dt};
                setAttachedDocs(function(prev){var _pg=prev.filter(function(d){return!(d._pregenerated&&d.docType===dobj.docType);});if(_pg.some(function(d){return d.id===dobj.id;}))return _pg;return _pg.concat([dobj]);});
                _genCountFallback++;
                if(!_firstDocFallback)_firstDocFallback=dobj;
                try{window.dispatchEvent(new CustomEvent('erp:mydocAdded',{detail:dobj}));}catch(_){}
              }
              try{trackGenResult(dt,{success:true,file:gf||null});}catch(_){}
            }else{
              try{trackGenResult(dt,{success:false,error:(res&&res.error)||'Грешка'});}catch(_){}
            }
          }).catch(function(err){try{trackGenResult(dt,{success:false,error:err.message||'Грешка'});}catch(_){}})
        : Promise.resolve();
      _allPromises.push(p);
    });
    if(_genCountFallback>0&&_allPromises.length>0){
      Promise.allSettled(_allPromises).then(function(){
        if(cancelled)return;
        try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}
        if(_firstDocFallback&&typeof setEditingDoc==='function'){
          try{setEditingDoc(_firstDocFallback);}catch(_){}
          if(typeof toast==='function')toast('✅ '+_genCountFallback+' документ'+
            (_genCountFallback===1?' е генериран. Отваряне на редактора…':'а са генерирани. Отваряне на редактора…'),'success',4000);
        } else {
          if(typeof toast==='function')toast('✅ '+(_genCountFallback===1?'1 документ е генериран. Можете да го редактирате.':_genCountFallback+' документа са генерирани. Можете да ги редактирате.'),'success',6000);
        }
      });
    }
  },300);
  return function(){clearTimeout(t);cancelled=true;};
},[wizardStep,formValues.projectType]);

// ── Auto-advance from step 1 → 2 DISABLED (v9.42.0-manualstep) ──
// The applicant must explicitly click "Напред" to advance — no automatic
// transition, even when all required fields are filled. This gives the
// applicant full control over their pace and prevents accidental jumps.
// (Previously: auto-advanced after 800ms when step1Complete.)
var _autoAdvancedRef=useRef(false);

const handleFiles=async ev=>{const selected=Array.from(ev.target.files||[]);const results=await Promise.allSettled(selected.map(readFileAsBase64));results.filter(r=>r.status==='fulfilled').map(r=>r.value).forEach(f=>setFiles(p=>[...p,f]));results.filter(r=>r.status==='rejected').forEach(r=>toast(r.reason?.message||'Грешка','error'));ev.target.value=''};
const handleDrop=async ev=>{ev.preventDefault();ev.stopPropagation();setDragging(false);const dropped=Array.from(ev.dataTransfer?.files||[]);if(!dropped.length)return;const results=await Promise.allSettled(dropped.map(readFileAsBase64));results.filter(r=>r.status==='fulfilled').map(r=>r.value).forEach(f=>setFiles(p=>[...p,f]));results.filter(r=>r.status==='rejected').forEach(r=>toast(r.reason?.message||'Грешка','error'))};

const doSubmit=async(sigData=null)=>{
    setSending(true);
    try{
    const isDrawSig=!!sigData;
    const payload={form:{userId:user?.email||'',userName:user?.name||'',status:'submitted',competitionId:formValues.competitionId,projectCode:formValues.projectType,area:formValues.area||'',professionalField:formValues.professionalField||'',title:formValues.title.trim(),titleEn:(formValues.titleEn||'').trim(),acronym:(formValues.acronym||'').trim().toUpperCase(),description:formValues.description.trim(),descriptionEn:(formValues.descriptionEn||'').trim(),objectives:(formValues.objectives||'').trim(),expectedResults:(formValues.expectedResults||'').trim(),durationMonths:Number(formValues.durationMonths)||12,npfTier:formValues.npfTier||'university',declarationAccepted:!!declarationAccepted,teamMembers:teamMembers,budget:budget,files,attachedDocs:attachedDocs.map(_serializeDoc),signature:sigData||'',signatureType:'draw'}};
    // ── UX: close modal immediately, optimistically insert a placeholder row,
    //   run the createForm request in the background. Server email is queued
    //   (deferred trigger) so the request returns fast — the optimistic row
    //   is replaced by the authoritative one on the next forms refresh.
    const tmpId='tmp-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
    const nowISO=new Date().toISOString();
    const optimisticForm={
        id:tmpId,status:'submitted',_optimistic:true,
        userEmail:user?.email||'',userName:user?.name||'',
        competitionId:formValues.competitionId,projectCode:formValues.projectType,
        area:formValues.area||'',title:formValues.title.trim(),description:formValues.description.trim(),
        created:nowISO,submitted:nowISO,
        fileIds:files.map(f=>({id:tmpId+':'+f.name,name:f.name})),
        attachedDocs:attachedDocs.map(d=>({id:d.id,name:d.name})),
        history:[{action:'Изпращане в ход…',date:nowISO,user:user?.name||user?.email||''}]
    };
    onClose();
    toast('Заявлението се изпраща…','info',2500);
    try{
        const res=await mutateApi('createForm',payload,{
            patches:[{action:'getforms',mutator:prev=>{
                if(!prev||typeof prev!=='object')return prev;
                const list=Array.isArray(prev.forms)?prev.forms:[];
                return {...prev,forms:[optimisticForm,...list]};
            }}],
            invalidates:['getforms','getinitialdata','getcompetitionsummary']
        });
        clearDraft();
        toast('Проектното предложение е изпратено!'+(res&&res.emailSent?' Ще получите потвърждение по имейл.':''),'success');
        // Background refresh — don't block the UI; mutateApi already cleared the cache.
        Promise.resolve().then(()=>onSaved({forceRefresh:true,silent:true}));
    }catch(err){
        // Rollback already applied by mutateApi on rejection.
        toast(err.message||'Грешка при изпращането','error',6000);
    }
    }catch(err){toast(err.message,'error')}
    finally{_sendingRef.current=false;setSending(false);setShowSignature(false)}
};

const handleSubmit=(ev,asDraft)=>{
    ev.preventDefault();
    if(_sendingRef.current)return; // prevent double-click spam (React batch race)
    if(compsLoading){toast('Зареждане на конкурсите...','info');return}
    if(!availableCompetitions.length){toast('Няма достъпни конкурси за кандидатстване.','warn');return}
    if(!asDraft&&!validate()){
        // ── Build descriptive error toast listing missing fields ──
        // Use _lastValidationErrors.current (freshly written by validate()) to avoid stale-closure on errors state
        var _freshErrs=_lastValidationErrors.current||{};
        var missingFields = Object.keys(_freshErrs).filter(function(k){return k!=='_ckk';}).map(function(k){ return _FIELD_LABELS[k] || k; }).filter(Boolean);
        // v9.37.0-regulatory: CKK block — show specific message
        if(_freshErrs._ckk){
          toast(_freshErrs._ckk,'error',8000);
          setErrors(Object.assign({}, _freshErrs));
          return;
        }
        // ── Detect submit-only gates (budget empty / required docs missing) ──
        var _bkeys=Object.keys(budget||{}).filter(function(k){return k!=='_monthlyMode'&&k!=='_monthly';});
        var _btotal=0;
        try{_bkeys.forEach(function(k){var v=budget[k];if(v&&typeof v==='object'){Object.keys(v).forEach(function(p){var n=Number(v[p]);if(!isNaN(n))_btotal+=n;});}else{var n=Number(v);if(!isNaN(n))_btotal+=n;}});
        // Include monthly-mode data
        var _md=budget._monthly;
        if(_md&&typeof _md==='object'){
          Object.keys(_md).forEach(function(mgid){
            var mp=_md[mgid]||{};
            if(mp&&typeof mp==='object'){Object.keys(mp).forEach(function(period){var n=Number(mp[period])||0;_btotal+=n;});}
          });
        }
        }catch(_){}
        var _emptyBudget=(_bkeys.length===0&&(!budget._monthly||Object.keys(budget._monthly).length===0))||_btotal<=0;
        var _docsMissing=0;
        try{
          if(formValues.projectType&&typeof getRequiredDocuments==='function'){
            var _req=getRequiredDocuments(formValues.projectType)||[];
            if(_req.length&&typeof checkRequiredDocsStatus==='function'){
              var _st=checkRequiredDocsStatus(formValues.projectType,attachedDocs,files)||{total:_req.length,fulfilled:0};
              _docsMissing=Math.max(0,(_st.total||_req.length)-(_st.fulfilled||0));
            }
          }
        }catch(_){}
        var toastMsg = 'Моля, попълнете задължителните полета:';
        if (missingFields.length === 1) {
            toastMsg = 'Липсва: ' + missingFields[0];
        } else if (missingFields.length <= 4) {
            toastMsg = 'Липсват: ' + missingFields.join(', ');
        } else {
            toastMsg = 'Липсват ' + missingFields.length + ' задължителни полета.';
        }
        var hasBudgetIssue=budgetErrors.length>0;
        if (_emptyBudget && missingFields.length === 0) {
            toast('Бюджетът е празен. Попълнете разходните групи преди подаване.','error',6000);
            try{setWizardStep(3);}catch(_){}
        } else if (_docsMissing>0 && missingFields.length === 0 && !hasBudgetIssue) {
            toast('Липсват '+_docsMissing+' задължителн'+(_docsMissing===1?' документ':'и документа')+'. Прикачете ги преди подаване.','error',6000);
            try{setWizardStep(2);}catch(_){}
        } else if (hasBudgetIssue && missingFields.length === 0) {
            toast('Бюджетът не отговаря на изискванията. Коригирайте сумите.','error',6000);
        } else {
            toast(toastMsg, 'error', 6000);
        }
        // ── Scroll to the first error field (v9.80.0-scrollerr) ──
        try { scrollToErrorField(_freshErrs); } catch (_) {}
        // Update errors state again to trigger re-render with highlights
        setErrors(Object.assign({}, _freshErrs));
        return;
    }
    if(asDraft){
    // ── Warn if budget has blockers, but allow draft save ──
    var budgetBlockers=budgetErrors.filter(function(v){return v.severity==='high';});
    if(budgetBlockers.length>0){
      toast('Внимание: Бюджетът има '+budgetBlockers.length+' нарушени'+(budgetBlockers.length===1?'е':'я')+'. Черновата ще бъде запазена, но бюджетът трябва да се коригира преди подаване.','warn',5000);
    }
    _sendingRef.current=true;
    setSending(true);
// v10.3.0: draft status shown in header — no blocking toast00);
    // ── If auto-draft already exists, update it instead of creating a duplicate ──
    if(_formIdRef.current){
      var updatePayload={id:_formIdRef.current,updates:{userId:user?.email||'',userName:user?.name||'',projectCode:formValues.projectType,competitionId:formValues.competitionId,title:formValues.title.trim(),titleEn:(formValues.titleEn||'').trim(),acronym:(formValues.acronym||'').trim().toUpperCase(),area:formValues.area||'',professionalField:formValues.professionalField||'',description:formValues.description.trim(),descriptionEn:(formValues.descriptionEn||'').trim(),objectives:(formValues.objectives||'').trim(),expectedResults:(formValues.expectedResults||'').trim(),durationMonths:Number(formValues.durationMonths)||12,teamMembers:teamMembers,budget:budget,newFiles:files,attachedDocs:attachedDocs.map(_serializeDoc)}};
      onClose();
      mutateApi('updateForm',updatePayload,{
        patches:[{action:'getforms',mutator:prev=>{
          if(!prev||typeof prev!=='object')return prev;
          const list=Array.isArray(prev.forms)?prev.forms:[];
          return {...prev,forms:list.map(f=>getId(f)===_formIdRef.current?{...f,competitionId:formValues.competitionId,title:formValues.title.trim(),area:formValues.area||'',description:formValues.description.trim(),projectCode:formValues.projectType,_optimistic:true}:f)};
        }}],
        invalidates:['getforms','getinitialdata']
      }).then(function(){
        clearDraft();toast('✓','success',1500);
        Promise.resolve().then(function(){onSaved({forceRefresh:true,silent:true})});
      }).catch(function(err){toast(err.message||'Грешка при запазването','error',6000)})
        .finally(function(){_sendingRef.current=false;setSending(false)});
    }else{
    // v9.37.0-regulatory: Create new draft (no auto-draft exists yet)
    const draftPayload={form:{userId:user?.email||'',userName:user?.name||'',status:'draft',competitionId:formValues.competitionId,projectCode:formValues.projectType,area:formValues.area||'',professionalField:formValues.professionalField||'',title:formValues.title.trim(),titleEn:(formValues.titleEn||'').trim(),acronym:(formValues.acronym||'').trim().toUpperCase(),description:formValues.description.trim(),descriptionEn:(formValues.descriptionEn||'').trim(),objectives:(formValues.objectives||'').trim(),expectedResults:(formValues.expectedResults||'').trim(),durationMonths:Number(formValues.durationMonths)||12,npfTier:formValues.npfTier||'university',declarationAccepted:!!declarationAccepted,teamMembers:teamMembers,budget:budget,files,attachedDocs:attachedDocs.map(_serializeDoc)}};
    const tmpId='tmp-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
    const nowISO=new Date().toISOString();
    const optimisticDraft={
        id:tmpId,status:'draft',_optimistic:true,
        userEmail:user?.email||'',userName:user?.name||'',
        competitionId:formValues.competitionId,projectCode:formValues.projectType,
        area:formValues.area||'',title:formValues.title.trim(),description:formValues.description.trim(),
        created:nowISO,submitted:'',
        fileIds:[],attachedDocs:attachedDocs.map(d=>({id:d.id,name:d.name})),history:[]
    };
    onClose();
    mutateApi('createForm',draftPayload,{
        patches:[{action:'getforms',mutator:prev=>{
            if(!prev||typeof prev!=='object')return prev;
            const list=Array.isArray(prev.forms)?prev.forms:[];
            return {...prev,forms:[optimisticDraft,...list]};
        }}],
        invalidates:['getforms','getinitialdata']
    }).then((res)=>{if(res&&res.id)_formIdRef.current=res.id;clearDraft();toast('✓','success',1500);Promise.resolve().then(()=>onSaved({forceRefresh:true,silent:true}))})
      .catch(err=>toast(err.message||'Грешка при запазването','error',6000))
      .finally(()=>{_sendingRef.current=false;setSending(false)});
    }
    }else{
      // Reset sendingRef so doSubmit isn't blocked (SignatureModal has its own _sigRef guard)
      _sendingRef.current=false;
      setShowSignature(true)
    }
};

const ErrMsg=({field})=>errors[field]?e('div',{className:'field-error'},e('i',{className:'fas fa-exclamation-circle'}),' ',errors[field]):null;

if(showSignature)return e(SignatureModal,{title:'Подписване на проектно предложение',message:'Подпишете проектното предложение за да го подадете.',documentInfo:{title:formValues.title||'Проектно предложение'},require2fa:true,userEmail:user?.email||'',otpScope:'signature',otpRef:'new-application',onConfirm:doSubmit,onCancel:()=>setShowSignature(false)});
if(showPicker)return e(DocumentPickerModal,{documents:allDocuments,alreadyAttached:attachedDocs,userEmail:(typeof _currentUserEmail!=='undefined'?_currentUserEmail:''),onCancel:()=>setShowPicker(false),onConfirm:async function(docs){
      setShowPicker(false);
      if(!docs||!docs.length)return;
      // ── Optimistic insert: add the library docs to the UI immediately so the user
      //    sees them in the attached-list without waiting for the server-side copy.
      //    Each placeholder carries `_pendingCopy:true` so it can be upgraded in place
      //    when the copyDocToAppFolder call resolves.
      var optimisticDocs = docs.map(function(d){
        return {id:d.id,name:d.name,previewLink:d.previewLink,downloadUrl:d.downloadUrl,folderName:d.folderName||'',_pendingCopy:true};
      });
      setAttachedDocs(function(prev){
        var merged=[...prev];
        optimisticDocs.forEach(function(cd){if(!merged.some(function(x){return x.id===cd.id;}))merged.push(cd);});
        return merged;
      });
      // ── Now perform the server-side copy in parallel and upgrade entries as they finish.
      var finalDocs = optimisticDocs.slice();
      await Promise.all(docs.map(function(d,idx){
        return (async function(){
          try{
            // v9.39.6-no-edit-admin: copy template to the app folder so the
            // applicant gets an editable copy in their project folder.
            var _fid=_formIdRef.current;
            if(_fid){
              var copyRes=await api('copyDocument',{userId:user&&user.email?user.email:'',email:user&&user.email?user.email:'',docId:d.id,formId:_fid});
              if(copyRes&&copyRes.success&&copyRes.file){
                var upgraded={id:copyRes.file.id,name:copyRes.file.name,previewLink:copyRes.file.previewLink,downloadUrl:copyRes.file.downloadUrl,folderName:copyRes.file.folderName||''};
                finalDocs[idx]=upgraded;
                setAttachedDocs(function(prev){return prev.map(function(x){return x.id===d.id?upgraded:x;});});
                return;
              }
            }
          }catch(_){/* keep optimistic placeholder */}
          // Strip the _pendingCopy flag even when no server upgrade happened
          var keep={id:d.id,name:d.name,previewLink:d.previewLink,downloadUrl:d.downloadUrl,folderName:d.folderName||''};
          finalDocs[idx]=keep;
          setAttachedDocs(function(prev){return prev.map(function(x){return x.id===d.id?keep:x;});});
        })();
      }));
      var nextDocs=[];setAttachedDocs(function(prev){nextDocs=prev;return prev;});
      // ── Instant server-side persist: save the freshly-attached docs immediately.
      //    The user already sees the docs attached; this background call ensures
      //    they survive tab close / crash.
      //    v12.30.1-fix: Use await inside the outer async function so errors are
      //    caught by the main try/catch. The old async IIFE was fire-and-forget.
      //    v8.4.0: if the auto-draft hasn't resolved yet, create one on demand
            //    so the save NEVER silently drops (fixes race window on first load).
            if(nextDocs.length){
              var _result=await _ensureDraftExists().catch(function(){return {id:null,error:null};});
              var _fid=_formIdRef.current||(_result&&_result.id);
              if(_fid){
          var savePayload={id:_fid,updates:{attachedDocs:nextDocs.map(function(d){return _serializeDoc(d);})}};
          // v12.30.1-perf: Only invalidate form caches — getinitialdata triggers
          // a full data refresh (competitions + documents + reviewers) which is
          // unnecessary when just saving attached documents.
          await mutateApi('updateForm',savePayload,{invalidates:['getforms']}).catch(function(err){console.warn('Attach persist err:',err&&err.message);});
        }
      }
    },onCopyAttach:function(docId,fId,docData){
      return api('copyDocument',{userId:user&&user.email?user.email:'',email:user&&user.email?user.email:'',docId:docId||docData?.id,formId:fId||_formIdRef.current||''})
        .then(function(res){
          if(!res||!res.success||!res.file) throw new Error((res&&res.error)||'Грешка при копиране');
          var cf=_serializeDoc(res.file);
          var nextDocs=[];
          setAttachedDocs(function(prev){
            if(prev.some(function(x){return x.id===cf.id;})) return prev;
            var merged=prev.concat([cf]);
            nextDocs=merged;
            return merged;
          });
          var _fid=_formIdRef.current;
          if(_fid&&nextDocs.length){
            var payload={id:_fid,updates:{attachedDocs:nextDocs.map(function(d){return _serializeDoc(d);})}};
            mutateApi('updateForm',payload,{invalidates:['getforms']}).catch(function(){});
          }
          toast('Документът е копиран и прикачен','success');
        }).catch(function(err){toast('Грешка: '+(err&&err.message||''),'error');});
    },formId:_formIdRef.current||'',competitionId:formValues.competitionId,projectType:formValues.projectType});

return _portal(e('div',{className:'modal-overlay'+(nfClosing?' modal-closing':''),onClick:nfSafeClose},
    e('div',{className:'modal-box form-modal modal-form'+(nfClosing?' modal-closing':''),onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head modal-head-wizard'},
    e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'.3rem'}},
        e('h3',null,e('i',{className:'fas fa-plus-circle'}),' Ново проектно предложение'),
        // Draft status indicator in header — non-blocking, always visible
        _formIdRef.current
          ? e('span',{style:{fontSize:'.62rem',fontWeight:700,color:'var(--ok)',background:'var(--ok-bg)',border:'1px solid var(--ok-border)',padding:'.15rem .5rem',borderRadius:'var(--r-pill)',display:'inline-flex',alignItems:'center',gap:'.25rem',whiteSpace:'nowrap'}},
              e('i',{className:'fas fa-check-circle',style:{fontSize:'.55rem'}}),
              sending?'Запазване…':'Чернова'
            )
          : null
      ),
      /* ── Modern stepper (v12.12.0): numbered steps with labels + connector lines ── */
      // v15.1.0-ux: bolder stepper — larger circles, stronger contrast, clearer
      // active-state ring so applicants always know exactly where they are.
      e('div',{className:'wizard-stepper',style:{display:'flex',alignItems:'center',justifyContent:'center',gap:0,flexShrink:0,marginLeft:'auto',maxWidth:'100%',padding:'.3rem .5rem'}},
        [1,2,3].map(function(s){
          var active=s===wizardStep;
          var done=(s===1&&step1Complete)||(s===2&&step2Complete)||(s===3&&step3Complete);
          var canClick=(s===1)||(s===2&&(step1Complete||wizardStep>=2))||(s===3&&(step1Complete||wizardStep>=3));
          var stepLabel=s===1?'Основна информация':s===2?'Документи':'Бюджет';
          var circleBg=done?'var(--ok)':active?'var(--primary)':'var(--surface)';
          var circleColor=done?'#fff':active?'#fff':'var(--ink-4)';
          var circleBorder=done?'var(--ok)':active?'var(--primary)':'var(--border)';
          var labelColor=active?'var(--primary)':done?'var(--ok)':'var(--ink-4)';
          return e(Fragment,{key:s},
            // Connector line before each step (except first)
            s>1&&e('div',{style:{width:28,height:2,background:(s===2?step1Complete:(s===3?step2Complete:false))?'var(--ok)':'var(--border-2)',borderRadius:1,transition:'background .5s ease',flexShrink:0}}),
            e('button',{
              type:'button',
              style:{display:'flex',flexDirection:'column',alignItems:'center',gap:2,background:'none',border:'none',cursor:canClick?'pointer':'default',padding:'2px 4px',opacity:canClick||done?1:0.55,transition:'opacity .3s',flexShrink:0,touchAction:'manipulation'},
              disabled:!canClick,
              onClick:function(){if(canClick)goToStep(s);},
              title:stepLabel,
              'aria-current':active?'step':'false'
            },
              e('div',{style:{width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.78rem',fontWeight:700,color:circleColor,background:circleBg,border:'2px solid '+circleBorder,boxShadow:active?'0 0 0 4px rgba(35,56,116,.12)':'none',transition:'all .35s ease'}},
                done?e('i',{className:'fas fa-check',style:{fontSize:'.65rem'}}):s
              ),
              e('span',{style:{fontSize:'.58rem',fontWeight:active?700:500,color:labelColor,whiteSpace:'nowrap',transition:'color .3s'}},stepLabel)
            )
          );
        })
      ),
      e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem',flexShrink:0}},
        _formIdRef.current&&e('button',{className:'btn btn-outline btn-sm',style:{color:'var(--err)',borderColor:'var(--err-border)',fontSize:'.7rem',padding:'.2rem .55rem'},title:'Изтрий черновата',onClick:handleDeleteDraft,disabled:deletingDraft},deletingDraft?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-trash'})),
        e('button',{className:'close-btn',onClick:nfSafeClose,title:'Затвори'},e('i',{className:'fas fa-times'}))
      )
    ),
    /* ── Progress guidance bar (v12.12.0) ────────────────────────────── */
    e('div',{className:'wizard-progress',style:{padding:'.5rem 1rem',background:'linear-gradient(180deg,var(--surface) 0%,var(--bg) 100%)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'.5rem'}},
      e('div',{style:{width:8,height:8,borderRadius:'50%',flexShrink:0,background:step1Complete&&step2Complete&&step3Complete?'var(--ok)':!step1Complete?'var(--primary)':'var(--gold)',boxShadow:step1Complete&&step2Complete&&step3Complete?'0 0 0 3px rgba(31,92,57,.25)':'0 0 0 3px rgba(35,56,116,.15)',transition:'all .4s ease'}}),
      e('div',{style:{fontSize:'.72rem',color:step1Complete&&step2Complete&&step3Complete?'var(--ok)':'var(--ink-2)',fontWeight:600,transition:'color .3s',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
        !step1Complete?e(Fragment,null,'Стъпка 1: попълнете основната информация за проектното предложение'):
        !step2Complete?e(Fragment,null,'Стъпка 2: ',copyingTypeDocs?'копиране на шаблонни документи за ':copiedTypeDocs.length?'прегледайте копираните документи за ':'подготовка на документи за ',e('strong',null,formValues.projectType||'проекта')):
        !step3Complete?e(Fragment,null,'Стъпка 3: попълнете бюджета по разходни групи'):
        e(Fragment,null,e('i',{className:'fas fa-check-circle',style:{marginRight:'.3rem'}}),'Всички стъпки са изпълнени — изпратете предложението!')
      )
    ),
    e('form',{className:'modal-form',onSubmit:ev=>handleSubmit(ev,false)},
      e('div',{className:'modal-body',style:{overflowY:'auto'}},
        /* ═══ STEP 1 ═══ */
        wizardStep===1&&e('div',{className:'form-layout-grid'},
            // ─── v9.46.0-rules: Application deadline banner ───
            e('div',{className:'form-field span2',style:{gridColumn:'1/-1',padding:'.45rem .75rem',background:'linear-gradient(90deg,var(--surface) 0%,#f4f8ff 100%)',border:'1px solid var(--primary-border,var(--border))',borderLeft:'3px solid var(--primary)',borderRadius:'var(--r-sm)',display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap',marginBottom:'.15rem'}},
              e('i',{className:'fas fa-calendar-check',style:{color:'var(--primary)',fontSize:'.95rem',flexShrink:0}}),
              e('div',{style:{flex:1,minWidth:0}},
                e('div',{style:{fontWeight:700,fontSize:'.77rem',color:'var(--primary)'}},(typeof APPLICATION_OPEN_DATE!=='undefined'?'Конкурсна сесия 2026 — Отворена за подаване':'Конкурсна сесия 2026')),
                e('div',{style:{fontSize:'.65rem',color:'var(--ink-3)',marginTop:'.1rem'}},
                  'Период: '+(typeof APPLICATION_OPEN_DATE!=='undefined'?APPLICATION_OPEN_DATE:'26.05.2026')+' – ',
                  e('strong',{style:{color:'var(--err)',fontWeight:700}},(typeof APPLICATION_DEADLINE_DATE!=='undefined'?APPLICATION_DEADLINE_DATE:'26.06.2026')),
                  ' | Заповед '+(typeof RECTOR_ORDER!=='undefined'?RECTOR_ORDER:'РД-14-92/22.05.2026')
                ),
                e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.08rem'}},
                  e('i',{className:'fas fa-envelope',style:{marginRight:'.2rem'}}),
                  e('a',{href:'mailto:scientific.projects@ue-varna.bg',style:{color:'var(--primary)',textDecoration:'none'}},'scientific.projects@ue-varna.bg'),
                  ' | ',
                  e('i',{className:'fas fa-phone',style:{marginRight:'.2rem'}}),
                  '0882164720'
                )
              ),
              e('div',{style:{display:'flex',gap:'.35rem',flexShrink:0}},
                e('a',{href:(typeof APPLICATION_INFO_URL!=='undefined'?APPLICATION_INFO_URL:'https://sites.google.com/ue-varna.bg/scientific-projects/2026-projects'),target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline btn-sm',style:{fontSize:'.62rem',padding:'.18rem .45rem',whiteSpace:'nowrap'}},e('i',{className:'fas fa-external-link-alt',style:{marginRight:'.2rem'}}),'Правила и изисквания'),
                e('a',{href:'https://docs.google.com/forms/d/e/1FAIpQLSeUiK_RILu-AI7h-XuQoFYSwFJ4-KrLpk4ePN7CfCRunPutag/viewform',target:'_blank',rel:'noopener noreferrer',className:'btn btn-outline btn-sm',style:{fontSize:'.62rem',padding:'.18rem .45rem',whiteSpace:'nowrap'}},e('i',{className:'fas fa-external-link-alt',style:{marginRight:'.2rem'}}),'ЦКК')
              )
            ),
            // ═══════════ APPLICANT IDENTITY CARD (v9.39.0-applicant-aware) ═══════════
            // Surfaces what the system already knows about the signed-in user so the
            // applicant can verify identity and flag personal status (young scientist /
            // doctoral) — these flags propagate into the т.3.1.1 ≥30% rule and the
            // 35% salary-cap rule via _computeBudgetViolations.
            e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.35rem',padding:'.65rem .8rem',background:'linear-gradient(135deg,var(--surface) 0%,var(--bg) 100%)',border:'1px solid var(--primary-border,var(--border))',borderRadius:'var(--r-md,8px)',display:'flex',flexWrap:'wrap',gap:'.6rem',alignItems:'center'}},
              e('div',{style:{width:38,height:38,borderRadius:'50%',background:'var(--primary)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'.95rem',flexShrink:0}},
                (String(user?.name||user?.email||'?').trim().charAt(0)||'?').toUpperCase()
              ),
              e('div',{style:{flex:'1 1 200px',minWidth:0}},
                e('div',{style:{fontWeight:700,fontSize:'.85rem',color:'var(--ink)',display:'flex',alignItems:'center',gap:'.35rem',flexWrap:'wrap'}},
                  user?.name||user?.email||'Анонимен потребител',
                  e('span',{style:{fontSize:'.6rem',background:'var(--ok-bg)',color:'var(--ok)',padding:'.05rem .35rem',borderRadius:8,fontWeight:600},title:'Идентификацията е проверена чрез Google @ue-varna.bg'},
                    e('i',{className:'fas fa-shield-check',style:{marginRight:'.15rem',fontSize:'.55rem'}}),'Проверен')
                ),
                e('div',{style:{fontSize:'.7rem',color:'var(--ink-3)',marginTop:'.1rem'}},
                  e('i',{className:'fas fa-envelope',style:{fontSize:'.6rem',marginRight:'.25rem',color:'var(--ink-4)'}}),
                  user?.email||'—',
                  e('span',{style:{marginLeft:'.5rem',padding:'.04rem .3rem',background:'var(--gold-glow,var(--surface))',border:'1px solid var(--gold-border,var(--border))',borderRadius:4,fontSize:'.6rem',color:'var(--gold,var(--ink-3))',fontWeight:600}},
                    isAdmin?'Администратор':'Кандидат-ръководител'
                  )
                ),
                e('div',{style:{fontSize:'.63rem',color:'var(--ink-4)',marginTop:'.2rem',lineHeight:1.4}},
                  'Вие сте автоматично записан като ',e('strong',null,'ръководител'),' на това проектно предложение. Можете да добавите още членове в раздел „Екип" по-долу.'
                )
              )
            ),
            // ── Екип на проекта (с Моят статус) — на същия ред като ръководителя ──
            e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.35rem',padding:'.65rem .8rem',background:'linear-gradient(135deg,var(--surface) 0%,var(--bg) 100%)',border:'1px solid var(--primary-border,var(--border))',borderRadius:'var(--r-md,8px)',display:'flex',flexWrap:'wrap',gap:'.6rem',alignItems:'flex-start'}},
              e('div',{style:{flex:'1 1 300px',minWidth:0}},
                e('div',{style:{fontWeight:700,fontSize:'.8rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:'.4rem',marginBottom:'.35rem'}},
                  e('i',{className:'fas fa-users',style:{fontSize:'.7rem'}}),'Екип на проекта'),
                (typeof TeamMembersEditor==='function')&&e(TeamMembersEditor,{value:teamMembers,onChange:setTeamMembers,leaderEmail:user?.email||'',leaderName:user?.name||'',projectCode:formValues.projectType,competitionId:formValues.competitionId,formId:''})
              ),
              e('div',{style:{display:'flex',flexDirection:'column',gap:'.15rem',flex:'0 0 auto',minWidth:200,paddingTop:'.2rem'}},
                e('label',{style:{fontSize:'.7rem',color:'var(--ink)',fontWeight:600}},'Моят статус'),
                e('select',{
                  value: formValues.leaderYoungScientist&&formValues.leaderDoctoral?'both':formValues.leaderYoungScientist?'young':formValues.leaderDoctoral?'doctoral':'leader',
                  onChange:function(ev){var v=ev.target.value;setFormValues(function(p){return Object.assign({},p,{leaderYoungScientist:v==='young'||v==='both',leaderDoctoral:v==='doctoral'||v==='both'});});},
                  className:'form-input',
                  style:{fontSize:'.78rem',padding:'.3rem .4rem',minWidth:220},
                  title:'Изберете вашия статус (повлиява бюджетните ограничения)'
                },
                  e('option',{value:'leader'},'Ръководител на проекта'),
                  e('option',{value:'young'},'Млад учен (до 10 г. след магистър)'),
                  e('option',{value:'doctoral'},'Докторант'),
                  e('option',{value:'both'},'Млад учен и докторант')
                ),
                formValues.leaderYoungScientist&&e('div',{style:{fontSize:'.6rem',color:'var(--ok)',display:'flex',alignItems:'center',gap:'.2rem',marginTop:'.1rem'}},
                  e('i',{className:'fas fa-check-circle',style:{fontSize:'.55rem'}}),
                  '≥30% от заплатите за млади учени/докторанти'
                ),
                e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.1rem',lineHeight:1.4}},
                  'Ръководителят е ',e('strong',null,user?.name||'вие'),'. Членовете на екипа се добавят по-горе.'
                )
              )
            ),
            // ═══════════ РАЗДЕЛ 1: Обща информация за проектното предложение ═══════════
            e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.25rem',paddingBottom:'.4rem',borderBottom:'2px solid var(--primary)'}},
                e('div',{style:{fontWeight:700,fontSize:'.85rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:'.4rem'}},
                    e('i',{className:'fas fa-file-alt',style:{fontSize:'.75rem'}}),
                    'Раздел 1. Обща информация за проектното предложение')),
            e('div',{className:'form-field '+(errors.competitionId?'error':'')},e('label',null,'Конкурсна сесия *'),e('select',{name:'competitionId',value:formValues.competitionId,onChange:handleChange,disabled:compsLoading},compsLoading?e('option',{value:''},'Зареждане...'):e('option',{value:'',disabled:true},'— изберете —'),availableCompetitions.map(c=>e('option',{key:c.id,value:c.id},c.name))),e(ErrMsg,{field:'competitionId'})),
            e('div',{className:'form-field '+(errors.projectType?'error':'')},e('label',null,'Тип проект *'),e('select',{name:'projectType',value:formValues.projectType,onChange:handleChange},e('option',{value:'',disabled:true},'— изберете —'),PROJECT_TYPES.map(t=>e('option',{key:t.value,value:t.value},t.label))),e(ErrMsg,{field:'projectType'}),
              // v12.12.0: show generation status when application form is auto-generating
              formValues.projectType&&Object.keys(generatingDoc).length>0&&e('div',{style:{marginTop:'.25rem',padding:'.35rem .55rem',background:'linear-gradient(90deg,var(--info-bg) 0%,var(--surface) 100%)',border:'1px solid var(--info-border)',borderRadius:6,display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.68rem',color:'var(--info)',animation:'fadeEnter .3s ease'}},
                e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'.7rem',flexShrink:0}}),
                e('span',null,'Генериране на формуляр за кандидатстване за ',e('strong',null,formValues.projectType),'…')
              ),
              // v12.18.1+: type-template copy status (inline in Step 1 so user sees progress)
              formValues.projectType&&copyingTypeDocs&&e('div',{style:{marginTop:'.25rem',padding:'.35rem .55rem',background:'linear-gradient(90deg,rgba(255,248,235,.9) 0%,var(--surface) 100%)',border:'1px solid var(--gold-border,#e8c96a)',borderRadius:6,display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.68rem',color:'var(--ink-2)',animation:'fadeEnter .3s ease'}},
                e('i',{className:'fas fa-circle-notch fa-spin',style:{fontSize:'.7rem',flexShrink:0,color:'var(--gold)'}}),
                e('span',null,'Подготовка на шаблонни документи за ',e('strong',null,formValues.projectType),' — ще бъдат готови в Стъпка 2…')
              ),
              formValues.projectType&&!copyingTypeDocs&&copiedTypeDocs.length>0&&e('div',{style:{marginTop:'.25rem',padding:'.3rem .55rem',background:'var(--ok-bg)',border:'1px solid var(--ok-border)',borderRadius:6,display:'flex',alignItems:'center',gap:'.35rem',fontSize:'.66rem',color:'var(--ok)',animation:'fadeEnter .3s ease'}},
                e('i',{className:'fas fa-check-circle',style:{fontSize:'.65rem',flexShrink:0}}),
                e('span',null,copiedTypeDocs.length+' шаблонни документа готови за редактиране в Стъпка 2')
              ),
              // v12.12.0: show success when generation complete
              formValues.projectType&&Object.keys(generatingDoc).length===0&&genResults&&Object.keys(genResults).length>0&&Object.values(genResults).some(function(r){return r&&r.success;})&&e('div',{style:{marginTop:'.25rem',padding:'.3rem .55rem',background:'var(--ok-bg)',border:'1px solid var(--ok-border)',borderRadius:6,display:'flex',alignItems:'center',gap:'.35rem',fontSize:'.66rem',color:'var(--ok)',animation:'fadeEnter .3s ease'}},
                e('i',{className:'fas fa-check-circle',style:{fontSize:'.65rem',flexShrink:0}}),
                e('span',null,'Формулярът е генериран — ще бъде отворен в стъпка 2')
              )),
            // v9.37.0-regulatory: НПФ tier selection — only visible when НПФ is selected
            formValues.projectType==='НПФ'&&e('div',{className:'form-field '+(errors.npfTier?'error':'')},e('label',null,'Ниво на форума *'),e('select',{name:'npfTier',value:formValues.npfTier||'university',onChange:handleChange},e('option',{value:'department'},'Катедрен форум (до 3 000 €)'),e('option',{value:'faculty'},'Кръгла маса (до 2 500 €)'),e('option',{value:'university'},'Университетски/национален форум (до 6 000 €)')),e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.1rem'}},'Определя максималния допустим бюджет на форума'),e(ErrMsg,{field:'npfTier'})),
            // ─── v9.46.0-rules: Project type guidance panel ───
            formValues.projectType&&(function(){
              var _pt=PROJECT_TYPES.find(function(p){return p.value===formValues.projectType;});
              if(!_pt)return null;
              var _isDNP=_pt.value==='ДНП',_isNPF=_pt.value==='НПФ',_isFNI=_pt.value==='ФНИ',_isPNI=_pt.value==='ПНИ';
              var _eurBgn=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;
              var _maxEur=_isNPF?(_pt.npfTiers&&_pt.npfTiers[formValues.npfTier||'university']?(_pt.npfTiers[formValues.npfTier||'university'].maxEUR||0):(_pt.maxBudget||0)):(_pt.maxBudget||0);
              var _items=[
                {icon:'fa-euro-sign',label:'Макс. бюджет',value:_isNPF?Math.round(_maxEur).toLocaleString('bg-BG')+' €':Math.round(_maxEur).toLocaleString('bg-BG')+' €'},
                {icon:'fa-clock',label:'Срок',value:_isDNP?'12 месеца (фиксиран)':(_pt.minDurationMonths||12)+'–'+(_pt.maxDurationMonths||36)+' мес.'},
                (_isFNI||_isPNI)&&{icon:'fa-users',label:'Макс. екип',value:'5 чл. + 3 студенти'},
                (_isFNI||_isPNI)&&{icon:'fa-money-bill-wave',label:'Заплати',value:'до 35% (с млади учени) / до 10%'},
                _isDNP&&{icon:'fa-ban',label:'Заплати',value:'ЗАБРАНЕНИ (чл. 10)'},
                _isPNI&&{icon:'fa-flask',label:'TRL',value:'Задължително ≥ 4'},
                _isFNI&&{icon:'fa-book',label:'Краен резултат',value:'Монография ИЛИ ≥3 Scopus/WoS'},
                _isPNI&&{icon:'fa-microscope',label:'Краен резултат',value:'Продукт TRL≥4'},
                _isDNP&&{icon:'fa-graduation-cap',label:'Краен резултат',value:'Дисертационен труд'},
                _isNPF&&{icon:'fa-calendar-alt',label:'Краен резултат',value:'Проведен научен форум'},
                (_isFNI||_isPNI||_isDNP)&&{icon:'fa-star',label:'Самооценка',value:'Задължителна, мин. 51 т.'},
                (_isFNI||_isPNI)&&{icon:'fa-user-check',label:'Рецензенти (§11)',value:'2 предложени от кандидата'},
                _isDNP&&{icon:'fa-user-graduate',label:'Кандидат',value:'Само докторанти'},
              ].filter(Boolean);
              return e('div',{className:'form-field span2',style:{gridColumn:'1/-1',background:'var(--surface)',border:'1px solid var(--primary-border,var(--border))',borderLeft:'3px solid var(--primary)',borderRadius:'var(--r-sm)',padding:'.45rem .7rem',marginTop:'-.1rem',marginBottom:'.15rem'}},
                e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'.4rem',flexWrap:'wrap',marginBottom:'.3rem'}},
                  e('div',{style:{fontWeight:700,fontSize:'.71rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:'.3rem'}},
                    e('i',{className:'fas fa-info-circle'}),' Параметри за '+_pt.label
                  ),
                  e('a',{href:(typeof APPLICATION_INFO_URL!=='undefined'?APPLICATION_INFO_URL:'https://sites.google.com/ue-varna.bg/scientific-projects/2026-projects'),target:'_blank',rel:'noopener noreferrer',style:{fontSize:'.62rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:'.2rem'}},
                    e('i',{className:'fas fa-external-link-alt'}),' Пълни изисквания')
                ),
                e('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(185px,1fr))',gap:'.18rem .4rem'}},
                  _items.map(function(item,idx){
                    return e('div',{key:idx,style:{display:'flex',alignItems:'flex-start',gap:'.3rem',fontSize:'.67rem',color:'var(--ink-3)'}},
                      e('i',{className:'fas '+item.icon,style:{fontSize:'.57rem',marginTop:'.12rem',color:'var(--ink-4)',flexShrink:0,width:12}}),
                      e('span',null,e('strong',{style:{color:'var(--ink-2)'}},(item.label+': ')),item.value)
                    );
                  })
                )
              );
            })(),
            e('div',{className:'form-field span2 '+(errors.area?'error':'')},e('label',null,'Приоритетно направление *',e('span',{style:{marginLeft:'.4rem',fontSize:'.6rem',fontWeight:400,color:'var(--ink-4)'}},'(може да изберете повече от едно)')),e(MultiSelect,{options:PRIORITY_AREAS.map(function(a){return{value:a,label:a};}),value:selectedAreas,onChange:handleAreaChange,placeholder:'— изберете приоритетно/и направление/я —',name:'area'}),selectedAreas.length>1&&e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.1rem',display:'flex',alignItems:'center',gap:'.2rem'}},e('i',{className:'fas fa-info-circle'}),' При класиране проектът ще бъде разпределен в направлението с най-висок брой точки.'),e(ErrMsg,{field:'area'})),
            e('div',{className:'form-field span2 '+(errors.professionalField?'error':'')},e('label',null,'Професионално направление *'),e(MultiSelect,{options:PROFESSIONAL_FIELDS,value:selectedProfFields,onChange:handleProfFieldChange,placeholder:'— изберете направление/я —',name:'professionalField',disabled:false}),selectedProfFields.length>0&&e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.15rem',display:'flex',flexWrap:'wrap',gap:'.2rem'}},selectedProfFields.map(function(v){var _pf=PROFESSIONAL_FIELDS.find(function(p){return p.value===v;});return e('span',{key:v,style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill)',padding:'.08rem .45rem',fontSize:'.62rem',whiteSpace:'nowrap'}},_pf?_pf.label:v);})),e(ErrMsg,{field:'professionalField'})),
            e('div',{className:'form-field span2 '+(errors.title?'error':'')},e('label',null,'Наименование на проектното предложение *'),e('input',{name:'title',value:formValues.title,onChange:handleChange,placeholder:'Наименование на проекта...'}),e(ErrMsg,{field:'title'})),
            e('div',{className:'form-field span2 '+(errors.titleEn?'error':'')},e('label',null,'Наименование на проектното предложение на английски език *'),e('input',{name:'titleEn',value:formValues.titleEn||'',onChange:handleChange,placeholder:'Project title in English...'}),e(ErrMsg,{field:'titleEn'})),
            e('div',{className:'form-field '+(errors.acronym?'error':'')},e('label',null,'Акроним на проектното предложение'),e('input',{name:'acronym',value:formValues.acronym||'',onChange:handleAcronymChange,placeholder:'Напр. ERP2026',maxLength:10}),e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.1rem'}},'Само латински букви и цифри, макс. 10 символа (незадължително)'),e(ErrMsg,{field:'acronym'})),
            e('div',{className:'form-field '+(errors.durationMonths?'error':'')},e('label',null,'Срок на изпълнение (месеци) *'),
              formValues.projectType==='ДНП'
                ? e('div',null,
                    e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem'}},
                      e('input',{type:'number',value:12,readOnly:true,disabled:true,style:{flex:1,background:'var(--surface)',color:'var(--ink-3)',cursor:'not-allowed'}}),
                      e('span',{style:{fontSize:'.68rem',fontWeight:600,color:'var(--ok)',display:'flex',alignItems:'center',gap:'.2rem'}},e('i',{className:'fas fa-lock'}),' Фиксиран')
                    ),
                    e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.15rem',display:'flex',alignItems:'flex-start',gap:'.2rem'}},
                      e('i',{className:'fas fa-info-circle',style:{color:'var(--info,var(--primary))',flexShrink:0,marginTop:'.05rem'}}),
                      'ДНП проектите имат фиксиран срок от 12 месеца (чл. 10 Правилника).'
                    )
                  )
                : (function(){
                    // v9.69.x: duration bounds derive from the selected project type
                    // (regulation sync) — НПФ 1–3 мес., ФНИ/ПНИ 12–36 мес.
                    var _ptD=PROJECT_TYPES.find(function(p){return p.value===formValues.projectType;});
                    var _minD=_ptD&&_ptD.minDurationMonths?_ptD.minDurationMonths:12;
                    var _maxD=_ptD&&_ptD.maxDurationMonths?_ptD.maxDurationMonths:36;
                    return e('div',null,
                    e('input',{type:'number',min:_minD,max:_maxD,step:1,inputMode:'numeric',pattern:'[0-9]*',name:'durationMonths',value:formValues.durationMonths,onKeyDown:function(ev){var k=ev.key;if(k==='Backspace'||k==='Delete'||k==='Tab'||k==='ArrowLeft'||k==='ArrowRight'||k==='ArrowUp'||k==='ArrowDown'||k==='Home'||k==='End'||(ev.ctrlKey&&(k==='a'||k==='c'||k==='v'||k==='x')))return;if(!/^[0-9]$/.test(k)){ev.preventDefault();}},onPaste:function(ev){var cb=ev.clipboardData||window.clipboardData;if(!cb)return;var pasted=cb.getData('text')||'';if(!/^\d+$/.test(pasted.trim())){ev.preventDefault();}},onChange:function(ev){var raw=String(ev.target.value||'').replace(/[^0-9]/g,'');if(raw===''){handleChange({target:{name:'durationMonths',value:''}});return;}var n=parseInt(raw,10);if(isNaN(n))return;if(n>_maxD)n=_maxD;handleChange({target:{name:'durationMonths',value:String(n)}});},onBlur:function(ev){var raw=String(ev.target.value||'').replace(/[^0-9]/g,'');var n=parseInt(raw,10);if(isNaN(n)||n<_minD)n=_minD;if(n>_maxD)n=_maxD;handleChange({target:{name:'durationMonths',value:String(n)}});},placeholder:_minD+'–'+_maxD,title:'Цяло число от '+_minD+' до '+_maxD+' месеца'}),
                    e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.1rem'}},'От '+_minD+' до '+_maxD+' месеца (цяло число)')
                  );
                  })()
            ,e(ErrMsg,{field:'durationMonths'})),
            e('div',{className:'form-field span2 '+(errors.description?'error':'')},e('label',null,'Кратко описание на проектното предложение *'),e('textarea',{name:'description',value:formValues.description,onChange:handleChange,rows:4,placeholder:'Описание, цели, методология...'}),e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'.1rem'}},e('span',{style:{fontSize:'.62rem',color:'var(--ink-4)'}},'Максимум 200 думи'),(function(){var _wc=(formValues.description||'').trim().split(/\s+/).filter(Boolean).length;return e('span',{style:{fontSize:'.62rem',fontWeight:700,color:_wc>200?'var(--err)':_wc>170?'var(--warn)':'var(--ink-4)'}},_wc+'/200');}())),e(ErrMsg,{field:'description'})),
            e('div',{className:'form-field span2 '+(errors.descriptionEn?'error':'')},e('label',null,'Кратко описание на проектното предложение на английски език',e('span',{style:{marginLeft:'.4rem',fontSize:'.6rem',color:'var(--ink-4)',fontWeight:400,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:4,padding:'.02rem .28rem'}},'по желание')),e('textarea',{name:'descriptionEn',value:formValues.descriptionEn||'',onChange:handleChange,rows:4,placeholder:'Short description in English (optional)...'}),e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'.1rem'}},e('span',{style:{fontSize:'.62rem',color:'var(--ink-4)'}},'По желание — макс. 200 думи'),(function(){var _wc=(formValues.descriptionEn||'').trim().split(/\s+/).filter(Boolean).length;return _wc>0?e('span',{style:{fontSize:'.62rem',fontWeight:700,color:_wc>200?'var(--err)':_wc>170?'var(--warn)':'var(--ink-4)'}},_wc+'/200'):null;}())),e(ErrMsg,{field:'descriptionEn'})),
            e('div',{className:'form-field span2 '+(errors.objectives?'error':'')},e('label',null,'Цел/и на проектното предложение *'),e('textarea',{name:'objectives',value:formValues.objectives,onChange:handleChange,rows:2,placeholder:'Основни цели на проекта...'}),e(ErrMsg,{field:'objectives'})),
            e('div',{className:'form-field span2'},e('label',null,'Очаквани резултати'),e('textarea',{name:'expectedResults',value:formValues.expectedResults,onChange:handleChange,rows:2,placeholder:'Публикации, монографии, патенти...'})),
            // ── Екипът е преместен в горната част до ръководителя (v10.9.0) ──
            // v12.12.0: infomercial removed — definition accessible via external rules link
            // ── Compact CV / file upload ──
            e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginTop:'.15rem',padding:'.4rem .65rem',background:'var(--surface)',border:'1px dashed var(--border)',borderRadius:6}},
                e('label',{style:{fontWeight:600,fontSize:'.7rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:'.3rem',marginBottom:'.25rem'}},
                    e('i',{className:'fas fa-file-pdf',style:{fontSize:'.65rem'}}),
                    'Прикачи CV / Автобиография'),
                e('div',{className:'upload-dropzone'+(dragging?' dragover':''),style:{padding:'.35rem .5rem',minHeight:'unset',borderRadius:4},
                    onDragOver:function(ev){ev.preventDefault();setDragging(true);},
                    onDragLeave:function(ev){ev.preventDefault();setDragging(false);},
                    onDrop:handleDrop,
                    onClick:function(){nfFileRef.current&&nfFileRef.current.click();}
                },
                    e('span',{style:{fontSize:'.65rem'}},dragging?'Пуснете файла тук':'Плъзнете CV тук или ',e('u',{style:{fontSize:'.65rem'}},'изберете файл')),
                    e('span',{className:'upload-dropzone-hint',style:{fontSize:'.55rem'}},'PDF, DOC, DOCX – макс. 10 MB')
                ),
                files.length>0&&e('div',{style:{marginTop:'.3rem',display:'flex',flexWrap:'wrap',gap:'.25rem'}},files.map(function(f,i){return e('span',{key:i,className:'file-chip',style:{fontSize:'.62rem'}},e('i',{className:'fas fa-paperclip'}),f.name,' · ',f.size,e('button',{type:'button',style:{background:'none',border:'none',cursor:'pointer',color:'var(--err)',marginLeft:'.2rem',padding:0,lineHeight:1},onClick:function(){setFiles(function(p){return p.filter(function(_,j){return j!==i;});});}},'✕'));}))
            ),
        ),
        /* ═══ STEP 2: Документи (reformed v12.20.0 — doc management cards) ═══ */
        wizardStep===2&&(editingDoc
          // ── Inline editor mode (document opened for editing) ──
          ? e('div',{className:'form-layout-grid',style:{height:'100%',display:'flex',flexDirection:'column'}},
              e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.25rem',paddingBottom:'.4rem',borderBottom:'2px solid var(--gold)',flexShrink:0}},
                e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap'}},
                  e('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:function(){setEditingDoc(null);},style:{fontSize:'.72rem',padding:'.2rem .5rem'}},
                    e('i',{className:'fas fa-arrow-left',style:{marginRight:'.25rem'}}),'Назад към документите'),
                  e('i',{className:'fas fa-file-edit',style:{color:'var(--gold)',fontSize:'.9rem'}}),
                  e('span',{style:{fontWeight:700,fontSize:'.82rem',color:'var(--primary)'}},editingDoc.name||'Документ')
                )
              ),
              e('div',{style:{flex:1,overflow:'hidden',minHeight:0}},
                e(InlineDocEditorModal,{doc:editingDoc,formId:_formIdRef.current,inline:true,defaultEditMode:true,
                  onClose:function(){setEditingDoc(null);},
                  onSaved:function(updatedDoc){
                    if(updatedDoc){
                      setAttachedDocs(function(prev){
                        var next=prev.map(function(d){return d.id===updatedDoc.id?Object.assign({},d,updatedDoc):d;});
                        var _fid=_formIdRef.current;
                        if(_fid){mutateApi('updateForm',{id:_fid,updates:{attachedDocs:next.map(_serializeDoc)}},{invalidates:['getforms','getinitialdata']}).catch(function(){});}
                        return next;
                      });
                    }
                    setEditingDoc(null);
                  }
                })
              )
            )
          // ── Document management mode ──
          : e('div',{style:{display:'flex',flexDirection:'column',height:'100%',minHeight:0,overflow:'hidden'}},
          // Section header
          e('div',{style:{padding:'.3rem 0',borderBottom:'2px solid var(--primary)',marginBottom:'.35rem',flexShrink:0}},
            e('div',{style:{fontWeight:700,fontSize:'.78rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:'.35rem'}},
              e('i',{className:'fas fa-file-alt',style:{fontSize:'.7rem'}}),
              'Раздел 2. Документи — ',
              e('span',{style:{color:'var(--gold)',fontWeight:800,fontSize:'.8rem',letterSpacing:.5}},formValues.projectType||'…')
            ),
            e('div',{style:{fontSize:'.6rem',color:'var(--ink-4)',marginTop:'.1rem',display:'flex',alignItems:'center',gap:'.4rem'}},
              formValues.projectType
                ? (copyingTypeDocs
                    ? e(Fragment,null,
                        e('i',{className:'fas fa-spinner fa-pulse',style:{color:'var(--primary)',fontSize:'.62rem'}}),
                        e('span',{style:{color:'var(--primary)',fontWeight:600}},'Подготвяне на документи...')
                      )
                    : e(Fragment,null,
                        e('i',{className:'fas fa-check-circle',style:{color:'var(--ok)',fontSize:'.62rem'}}),
                        e('span',null,(attachedDocs.filter(function(d){return!d._budget;}).length||0)+' документа — редакция от картите по-долу')
                      )
                  )
                : e('span',null,'Изберете тип проект в Стъпка 1.')
            )
          ),
          // Document cards area
          e('div',{style:{flex:'1 1 0%',minWidth:0,display:'flex',flexDirection:'column',gap:'.35rem',overflowY:'auto',padding:'.2rem 0'}},
            // ── Error state ──
            copyTypeDocError
              ? e('div',{style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'.75rem',padding:'2rem'}},
                  e('div',{style:{width:48,height:48,borderRadius:'50%',background:'#fff0f0',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',color:'var(--err)'}},
                    e('i',{className:'fas fa-exclamation-triangle'})
                  ),
                  e('div',{style:{fontWeight:600,fontSize:'.78rem',color:'var(--err)'}},'Грешка при копиране'),
                  e('div',{style:{fontSize:'.65rem',color:'var(--ink-3)',textAlign:'center',maxWidth:340,lineHeight:1.5}},copyTypeDocError),
                  e('button',{type:'button',className:'btn btn-outline btn-sm',
                    onClick:function(){
                      var _fid=_formIdRef.current;
                      var _pt=String(formValues.projectType||'').trim().toUpperCase();
                      if(_fid&&_pt){try{localStorage.removeItem('erp:ctf2:'+_fid+':'+_pt);}catch(_){}}
                      _copyTriggeredRef.current='';setCopyTypeDocError('');setCopiedTypeDocs([]);setCopyingTypeDocs(false);
                    }
                  },e('i',{className:'fas fa-redo',style:{marginRight:'.3rem'}}),'Опитай отново')
                )
            : !formValues.projectType
              ? e('div',{style:{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'.5rem',padding:'2rem',color:'var(--ink-4)'}},
                  e('div',{style:{width:48,height:48,borderRadius:'50%',background:'var(--bg-2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',color:'var(--ink-4)'}},e('i',{className:'fas fa-arrow-left'})),
                  e('h4',{style:{fontSize:'.82rem',fontWeight:600,color:'var(--ink-3)',margin:0}},'Изберете тип проект'),
                  e('p',{style:{fontSize:'.65rem',textAlign:'center',maxWidth:320,lineHeight:1.5,margin:0}},'Върнете се на Стъпка 1 и изберете типа на проекта.')
                )
            : e(Fragment,null,
                // ── Generated / Copied document cards ──
                // v15.0.0-perf: Always show cards — even during loading show skeleton
                // cards with the project type name. This eliminates the "Подготовка…"
                // dead-end and gives instant visual feedback.
                (function(){
                  var _allDocs=attachedDocs.filter(function(d){return!d._budget;});
                  // Also include copiedTypeDocs that are not yet in attachedDocs
                  if(copiedTypeDocs.length){
                    copiedTypeDocs.forEach(function(cd){
                      if(!_allDocs.some(function(ad){return ad.id===cd.id||ad.driveId===cd.id;})&&!cd._masterTemplate){
                        _allDocs.push({id:cd.id,driveId:cd.id,name:cd.name,mimeType:cd.mimeType,
                          googleDocEditLink:cd.editUrl,previewLink:cd.previewUrl||'',
                          folderName:cd.folderName||'',_generated:false,_typeTemplate:true,docType:''});
                      }
                    });
                  }
                  // v15.0.0-perf: Show skeleton cards during copying — gives instant
                  // visual feedback instead of a blank loading state.
                  var _showSkeleton=copyingTypeDocs&&!_allDocs.length;
                  var _skeletonCount=3;
                  if(_showSkeleton){
                    return e('div',{style:{display:'flex',flexDirection:'column',gap:'.35rem'}},
                      Array(_skeletonCount).fill(0).map(function(_,i){return e('div',{key:'skel-'+i,style:{display:'flex',alignItems:'center',gap:'.35rem',padding:'.35rem .55rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 1px 3px rgba(0,0,0,.04)',opacity:.6,position:'relative',overflow:'hidden'}},
                        e('div',{style:{width:28,height:28,borderRadius:6,background:'linear-gradient(90deg,var(--bg-2) 0%,var(--surface) 50%,var(--bg-2) 100%)',backgroundSize:'200% 100%',flexShrink:0,animation:'cbShimmer 1.5s ease-in-out infinite'}}),
                        e('div',{style:{flex:1,minWidth:0}},
                          e('div',{style:{height:10,width:'65%',background:'linear-gradient(90deg,var(--bg-2) 0%,var(--surface) 50%,var(--bg-2) 100%)',backgroundSize:'200% 100%',borderRadius:4,marginBottom:'.25rem',animation:'cbShimmer 1.5s ease-in-out infinite'}}),
                          e('div',{style:{height:8,width:'40%',background:'linear-gradient(90deg,var(--bg-2) 0%,var(--surface) 50%,var(--bg-2) 100%)',backgroundSize:'200% 100%',borderRadius:4,animation:'cbShimmer 1.5s ease-in-out infinite'}})
                        ),
                        e('div',{style:{display:'flex',gap:'.25rem',flexShrink:0}},
                          e('div',{style:{height:24,width:60,background:'linear-gradient(90deg,var(--bg-2) 0%,var(--surface) 50%,var(--bg-2) 100%)',backgroundSize:'200% 100%',borderRadius:4,animation:'cbShimmer 1.5s ease-in-out infinite'}}),
                          e('div',{style:{height:24,width:32,background:'linear-gradient(90deg,var(--bg-2) 0%,var(--surface) 50%,var(--bg-2) 100%)',backgroundSize:'200% 100%',borderRadius:4,animation:'cbShimmer 1.5s ease-in-out infinite'}})
                        )
                      )}),
                      e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',marginTop:'.15rem',padding:'.35rem 0',borderTop:'1px dashed var(--border)'}},
                        e('button',{type:'button',className:'btn btn-outline btn-sm',disabled:true,style:{opacity:.6}},e('i',{className:'fas fa-folder-open',style:{fontSize:'.6rem'}}),' От библиотеката'),
                        e('button',{type:'button',className:'btn btn-outline btn-sm',disabled:true,style:{opacity:.6}},e('i',{className:'fas fa-cloud-upload-alt',style:{fontSize:'.6rem'}}),' Качи файл')
                      )
                    );
                  }
                  if(!_allDocs.length){
                    return e('div',{style:{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink-4)'}},
                      e('div',{style:{textAlign:'center',padding:'2rem'}},
                        e('i',{className:'fas fa-folder-open',style:{fontSize:'1.5rem',color:'var(--gold)',marginBottom:'.5rem',display:'block'}}),
                        e('span',{style:{fontSize:'.75rem'}},'Няма прикачени документи'),
                        e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.3rem'}},'Използвайте бутоните отдолу за да прикачите документи от библиотеката.')
                      )
                    );
                  }
                  return e('div',{style:{display:'flex',flexDirection:'column',gap:'.3rem'}},
                    _allDocs.map(function(doc){
                      var _did=doc.driveId||doc.id||'';
                      // v12.27.0-404fix: Also reject short IDs (< 25 chars) — real Drive file IDs
// are always 28+ characters, while docType IDs like 'fnisections35' are short.
var _hasDriveId=_did&&_did.length>=25&&!/^(s_|doc_|up_|f_|copied_)/.test(_did);
                      var vis=(typeof getDocVisuals==='function')?getDocVisuals(doc):{icon:'fa-file',label:'Документ'};
                      var _editUrl=doc.googleDocEditLink||doc.editLink||doc.editUrl||(_hasDriveId?'https://docs.google.com/document/d/'+encodeURIComponent(_did)+'/edit':'');
                      var _previewUrl=doc.previewLink||doc.previewUrl||(_hasDriveId?'https://docs.google.com/document/d/'+encodeURIComponent(_did)+'/preview':'');
                      // v15.0.0-perf: Improved card layout with consistent button sizing
                      return e('div',{key:doc.id||_did,style:{display:'flex',alignItems:'center',gap:'.4rem',padding:'.4rem .6rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,boxShadow:'0 1px 3px rgba(0,0,0,.04)',transition:'all .15s',cursor:'default'}},
                        e('div',{className:'doc-icon-wrap '+vis.cssClass,style:{width:30,height:30,borderRadius:6,fontSize:'.75rem',flexShrink:0}},e('i',{className:'fas '+vis.icon})),
                        e('div',{style:{flex:1,minWidth:0}},
                          e('div',{style:{fontWeight:600,fontSize:'.75rem',color:'var(--ink)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},doc.name||'Документ'),
                          e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.05rem',display:'flex',alignItems:'center',gap:'.3rem'}},
                            e('span',{style:{display:'inline-flex',alignItems:'center',gap:'.2rem'}},
                              e('i',{className:'fas '+(doc._generated?'fa-magic':doc._typeTemplate?'fa-copy':'fa-paperclip'),style:{fontSize:'.5rem'}}),
                              doc._generated?'Автоматично генериран':doc._typeTemplate?'Копиран от шаблон':'Прикачен'
                            ),
                            _hasDriveId&&e('span',{style:{display:'inline-flex',alignItems:'center',gap:'.15rem',color:'var(--ok)',fontSize:'.58rem'}},
                              e('i',{className:'fas fa-check-circle',style:{fontSize:'.5rem'}}),'Готов')
                          )
                        ),
                        e('div',{style:{display:'flex',gap:'.3rem',flexShrink:0,alignItems:'center'}},
                          // v15.0.0-perf: Reordered buttons by frequency of use — Редактирай first, then Преглед, then Премахни
                          _hasDriveId&&_editUrl&&e('button',{type:'button',className:'btn btn-gold btn-xs',style:{fontSize:'.62rem',padding:'.2rem .55rem',fontWeight:700,lineHeight:1.3,whiteSpace:'nowrap',minWidth:0},title:'Редактирай документа',onClick:function(ev){ev.stopPropagation();setEditingDoc(doc);}},
                            e('i',{className:'fas fa-edit',style:{fontSize:'.55rem',marginRight:'.15rem'}}),'Редактирай'),
                          _previewUrl&&e('button',{type:'button',className:'btn btn-outline btn-xs',style:{fontSize:'.6rem',padding:'.2rem .45rem',minWidth:0,minHeight:0,lineHeight:'1.2'},title:'Преглед',onClick:function(ev){ev.stopPropagation();setPreviewDoc(doc);}},
                            e('i',{className:'fas fa-eye',style:{fontSize:'.58rem'}})),
                          _hasDriveId&&e('button',{type:'button',className:'btn btn-outline btn-xs',style:{fontSize:'.6rem',padding:'.2rem .4rem',minWidth:0,minHeight:0,color:'var(--err)',borderColor:'transparent'},title:'Премахни',onClick:function(ev){ev.stopPropagation();setAttachedDocs(function(p){var next=p.filter(function(x){return x.id!==doc.id&&x.driveId!==doc.id;});var _fid=_formIdRef.current;if(_fid){mutateApi('updateForm',{id:_fid,updates:{attachedDocs:next.map(_serializeDoc)}},{invalidates:['getforms','getinitialdata']}).catch(function(){});}return next;});}},
                            e('i',{className:'fas fa-times',style:{fontSize:'.6rem'}}))
                        )
                        );
                      })
                    );
                  })(),
                  // ── Action buttons: pick from library + upload ──
                  e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',marginTop:'.25rem',padding:'.35rem 0',borderTop:'1px dashed var(--border)'}},
                    e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){setShowPicker(true);}},e('i',{className:'fas fa-folder-open',style:{fontSize:'.6rem'}}),' От библиотеката'),
                    e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){nfFileRef.current&&nfFileRef.current.click();}},e('i',{className:'fas fa-cloud-upload-alt',style:{fontSize:'.6rem'}}),' Качи файл')
                  ),
                  // ── Required documents checklist ──
                  formValues.projectType&&(function(){
                    var required=(typeof getRequiredDocuments==='function')?getRequiredDocuments(formValues.projectType):[];
                    if(!required.length)return null;
                    var status=(typeof checkRequiredDocsStatus==='function')
                      ? checkRequiredDocsStatus(formValues.projectType,attachedDocs,[])
                      :{total:required.length,fulfilled:0,missing:required};
                    var allDone=status.fulfilled>=status.total;
                    return e('div',{style:{marginTop:'.45rem',padding:'.45rem .65rem',background:'var(--surface)',border:'1px solid '+(allDone?'var(--ok-border)':'var(--gold-border,var(--border))'),borderRadius:8,borderLeft:'3px solid '+(allDone?'var(--ok)':'var(--gold)')}},
                      e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',marginBottom:'.3rem'}},
                        e('i',{className:'fas '+(allDone?'fa-check-circle':'fa-list'),style:{fontSize:'.65rem',color:allDone?'var(--ok)':'var(--gold)'}}),
                        e('span',{style:{fontWeight:700,fontSize:'.7rem',color:allDone?'var(--ok)':'var(--ink-2)'}},
                          allDone?'Всички задължителни документи са прикачени':'Необходими документи'
                        ),
                        e('span',{style:{marginLeft:'auto',fontSize:'.62rem',color:'var(--ink-4)'}},
                          status.fulfilled+'/'+status.total
                        )
                      ),
                      !allDone&&e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.25rem'}},
                        (status.missing||[]).slice(0,5).map(function(m){
                          return e('span',{key:m.id||m,style:{fontSize:'.62rem',color:'var(--warn)',background:'#fff8e6',padding:'.08rem .45rem',borderRadius:'var(--r-pill)',display:'flex',alignItems:'center',gap:'.2rem'}},
                            e('i',{className:'fas fa-hourglass-half',style:{fontSize:'.5rem'}}),
                            (m.label||m.name||m)
                          );
                        }),
                        (status.missing||[]).length>5&&e('span',{style:{fontSize:'.6rem',color:'var(--ink-4)'}},', +'+(status.missing.length-5)+' още')
                      )
                    );
                  })()
                )
          )
        )),
        wizardStep===3&&(editingDoc
          // ── Inline editor mode — embedded in wizard step 3 ──
          ? e('div',{className:'form-layout-grid',style:{height:'100%',display:'flex',flexDirection:'column'}},
              e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.25rem',paddingBottom:'.4rem',borderBottom:'2px solid var(--gold)',flexShrink:0}},
                e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap'}},
                  e('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:function(){setEditingDoc(null);},style:{fontSize:'.72rem',padding:'.2rem .5rem'}},
                    e('i',{className:'fas fa-arrow-left',style:{marginRight:'.25rem'}}),'Назад към бюджета'),
                  e('i',{className:'fas fa-file-excel',style:{color:'var(--gold)',fontSize:'.9rem'}}),
                  e('span',{style:{fontWeight:700,fontSize:'.82rem',color:'var(--primary)'}},editingDoc.name||'Документ')
                )
              ),
              e('div',{style:{flex:1,overflow:'hidden',minHeight:0}},
                e(InlineDocEditorModal,{doc:editingDoc,formId:_formIdRef.current,inline:true,defaultEditMode:true,
                  onClose:function(){setEditingDoc(null);},
                  onSaved:function(updatedDoc){
                    if(updatedDoc){
                      setAttachedDocs(function(prev){
                        var next=prev.map(function(d){return d.id===updatedDoc.id?Object.assign({},d,updatedDoc):d;});
                        var _fid=_formIdRef.current;
                        if(_fid){mutateApi('updateForm',{id:_fid,updates:{attachedDocs:next.map(_serializeDoc)}},{invalidates:['getforms','getinitialdata']}).catch(function(){});}
                        return next;
                      });
                    }
                    setEditingDoc(null);
                  }
                })
              )
            )
          // ── Budget editor mode ──
          : e('div',{className:'form-layout-grid'},
            // ═══════════ v12.12.0: Modern Budget Dashboard ═══════════
            e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.2rem',paddingBottom:'.5rem',borderBottom:'2px solid var(--gold)'}},
              // Title + status
              e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap',marginBottom:'.6rem'}},
                e('div',{style:{fontWeight:700,fontSize:'.88rem',color:'var(--gold)',display:'flex',alignItems:'center',gap:'.4rem'}},
                  e('i',{className:'fas fa-coins',style:{fontSize:'.78rem'}}),'Раздел 3. Бюджет по разходни групи'),
                (function(){
                  if(!formValues.projectType)return null;
                  var hc=budgetErrors.filter(function(v){return v.severity==='high';}).length;
                  var hasB=Object.keys(budget).filter(function(k){return k!=='_monthlyMode'&&k!=='_monthly';}).length>0;
                  if(!hasB)return e('span',{style:{fontSize:'.62rem',color:'var(--ink-4)',fontStyle:'italic'}},'— попълнете разходите');
                  if(hc===0)return e('span',{style:{fontSize:'.62rem',background:'var(--ok-bg)',color:'var(--ok)',padding:'.12rem .5rem',borderRadius:8,fontWeight:600}},'✓ Бюджетът отговаря на изискванията');
                  return e('span',{style:{fontSize:'.62rem',background:'var(--err-bg)',color:'var(--err)',padding:'.12rem .5rem',borderRadius:8,fontWeight:600}},'✗ '+hc+' нарушени'+(hc===1?'е':'я'));
                })()
              ),
              // ── Live total dashboard card ──
              (function(){
                if(!formValues.projectType)return null;
                var _eur=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;
                var bgt=budget||{};
                var _grand=0,_yearTotals={};
                Object.keys(bgt).forEach(function(gid){
                  if(gid==='_monthlyMode'||gid==='_monthly')return;
                  var byYear=bgt[gid]||{};
                  Object.keys(byYear).forEach(function(yr){var v=Number(byYear[yr])||0;_grand+=v;_yearTotals[yr]=(_yearTotals[yr]||0)+v;});
                });
                var _mData=bgt._monthly;
                if(_mData&&typeof _mData==='object'){
                  Object.keys(_mData).forEach(function(mgid){
                    var mByPeriod=_mData[mgid]||{};
                    if(mByPeriod&&typeof mByPeriod==='object'){
                      Object.keys(mByPeriod).forEach(function(period){var v=Number(mByPeriod[period])||0;_grand+=v;});
                    }
                  });
                }
                var pt=PROJECT_TYPES.find(function(p){return p.value===formValues.projectType});
                if(!pt)return null;
                var _maxBGN=0;
                if(formValues.projectType==='НПФ'&&pt.npfTiers){var tier=pt.npfTiers[formValues.npfTier]||pt.npfTiers.university;_maxBGN=tier.maxEUR*_eur;}else{_maxBGN=pt.maxBudget*_eur;}
                var _grandEUR=_grand/_eur,_maxEUR=_maxBGN/_eur;
                var _pct=_maxBGN>0?Math.min(100,(_grand/_maxBGN)*100):0;
                var _over=_maxBGN>0&&_grand>_maxBGN;
                var _remaining=Math.max(0,_maxBGN-_grand);
                var _hasBudget=_grand>0;
                var _years=Object.keys(_yearTotals).sort();
                var _barColor=_over?'var(--err)':_pct>85?'var(--warn)':_pct>50?'var(--primary)':'var(--ok)';
                return e('div',{style:{display:'flex',flexDirection:'column',gap:'.4rem',padding:'.6rem .8rem',background:'linear-gradient(135deg,var(--surface) 0%,#fdfbf7 100%)',border:'1px solid var(--gold-border,var(--border))',borderRadius:10,boxShadow:'0 2px 8px rgba(0,0,0,.04)'}},
                  // Total row
                  e('div',{style:{display:'flex',alignItems:'baseline',gap:'.6rem',flexWrap:'wrap'}},
                    e('span',{style:{fontSize:'1.4rem',fontWeight:800,color:_over?'var(--err)':_hasBudget?'var(--primary)':'var(--ink-4)',lineHeight:1,transition:'color .3s'}},
                      _hasBudget?_grandEUR.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2}):'0,00'),
                    e('span',{style:{fontSize:'.85rem',fontWeight:700,color:'var(--gold)'}},'€'),
                    _maxBGN>0&&e(Fragment,null,
                      e('span',{style:{fontSize:'.7rem',color:'var(--ink-4)',margin:'0 .1rem'}},'/'),
                      e('span',{style:{fontSize:'.9rem',fontWeight:600,color:'var(--ink-3)'}},_maxEUR.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2}),' € макс.')
                    )
                  ),
                  // Progress bar
                  _maxBGN>0&&e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem'}},
                    e('div',{style:{flex:1,height:8,background:'var(--border)',borderRadius:4,overflow:'hidden'}},
                      e('div',{style:{height:'100%',width:_pct+'%',background:_barColor,borderRadius:4,transition:'width .4s ease'}})
                    ),
                    e('span',{style:{fontSize:'.7rem',fontWeight:700,color:_barColor,minWidth:42,textAlign:'right'}},_pct.toFixed(1)+'%'),
                    _hasBudget&&!_over&&e('span',{style:{fontSize:'.68rem',color:'var(--ok)',fontWeight:600,whiteSpace:'nowrap'}},
                      'остават ',_remaining>0?(_remaining/_eur).toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0}):'0',' €'
                    ),
                    _over&&e('span',{style:{fontSize:'.68rem',color:'var(--err)',fontWeight:600,whiteSpace:'nowrap'}},
                      'надвишава с '+((_grand-_maxBGN)/_eur).toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0})+' €'
                    )
                  ),
                  // Per-year breakdown
                  _hasBudget&&_years.length>0&&e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap',fontSize:'.68rem',color:'var(--ink-4)',paddingTop:'.15rem',borderTop:'1px dashed var(--border)'}},
                    e('i',{className:'fas fa-calendar-alt',style:{fontSize:'.58rem',color:'var(--ink-5)'}}),
                    _years.map(function(yr,idx){
                      var yv=_yearTotals[yr],yvEUR=yv/_eur;
                      var yPct=_grand>0?(yv/_grand)*100:0;
                      return e('span',{key:yr,style:{display:'flex',alignItems:'center',gap:'.2rem',padding:'.1rem .4rem',background:'var(--bg)',borderRadius:4,border:'1px solid var(--border)'}},
                        e('strong',{style:{fontSize:'.68rem',color:'var(--ink-2)'}},yr),
                        e('span',{style:{color:'var(--ink-3)'}},yvEUR.toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0})+' €'),
                        e('span',{style:{fontSize:'.58rem',color:'var(--ink-5)'}},'('+yPct.toFixed(0)+'%)')
                      );
                    })
                  )
                );
              })()
            ),
            // ── Cost group summary cards (preview before BudgetEditor) ──
            (function(){
              if(!formValues.projectType)return null;
              var bgt=budget||{};
              var _eur=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;
              var _groups=[];
              var _totalAll=0;
              Object.keys(bgt).forEach(function(gid){
                if(gid==='_monthlyMode'||gid==='_monthly')return;
                var byYear=bgt[gid]||{};
                var sum=0;Object.keys(byYear).forEach(function(yr){sum+=Number(byYear[yr])||0;});
                if(sum>0){_groups.push({id:gid,sum:sum,label:(typeof COST_GROUP_LABEL!=='undefined'?COST_GROUP_LABEL[gid]:null)||gid});_totalAll+=sum;}
              });
              if(!_groups.length)return null;
              // Sort by amount descending
              _groups.sort(function(a,b){return b.sum-a.sum;});
              var _colors=['var(--primary)','var(--gold)','#159379','#8585bd','var(--info)','var(--ok)','#7A4A00','var(--ink-3)'];
              return e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.2rem'}},
                e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.3rem'}},
                  _groups.map(function(g,idx){
                    var pct=_totalAll>0?((g.sum/_totalAll)*100):0;
                    var barW=Math.max(2,Math.min(100,pct));
                    return e('div',{key:g.id,style:{flex:'1 1 140px',minWidth:120,maxWidth:220,padding:'.35rem .5rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,display:'flex',flexDirection:'column',gap:'.2rem',boxShadow:'0 1px 3px rgba(0,0,0,.03)'}},
                      e('div',{style:{display:'flex',alignItems:'center',gap:'.3rem'}},
                        e('div',{style:{width:8,height:8,borderRadius:2,background:_colors[idx%_colors.length],flexShrink:0}}),
                        e('span',{style:{fontSize:'.65rem',fontWeight:600,color:'var(--ink-2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},g.label)
                      ),
                      e('div',{style:{display:'flex',alignItems:'baseline',gap:'.2rem'}},
                        e('strong',{style:{fontSize:'.82rem',color:'var(--ink)'}},(g.sum/_eur).toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0})),
                        e('span',{style:{fontSize:'.62rem',color:'var(--gold)',fontWeight:600}},'€')
                      ),
                      e('div',{style:{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}},
                        e('div',{style:{height:'100%',width:barW+'%',background:_colors[idx%_colors.length],borderRadius:2,transition:'width .4s ease'}})
                      ),
                      e('span',{style:{fontSize:'.58rem',color:'var(--ink-5)',textAlign:'right'}},pct.toFixed(1)+'%')
                    );
                  })
                )
              );
            })(),
            // ── v12.18.0: Budget Quick Panel — SVG donut chart + per-group sliders/exact inputs ──
            (function(){
              if(!formValues.projectType)return null;
              var _eur=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;
              var bgt=budget||{};
              var _dur=Math.max(1,Number(formValues.durationMonths)||12);
              var _numYears=Math.ceil(_dur/12);
              // Compute year keys (y1, y2, ...)
              var _yearKeys=[];for(var _yi=1;_yi<=_numYears;_yi++)_yearKeys.push('y'+_yi);
              // Derive max budget in BGN
              var pt=PROJECT_TYPES.find(function(p){return p.value===formValues.projectType;});
              var _maxBGN=0;
              if(pt){if(formValues.projectType==='НПФ'&&pt.npfTiers){var _tier=pt.npfTiers[formValues.npfTier]||pt.npfTiers.university;_maxBGN=(_tier.maxEUR||0)*_eur;}else{_maxBGN=(pt.maxBudget||0)*_eur;}}
              // Compute group totals from budget state
              var _LABELS=(typeof COST_GROUP_LABEL!=='undefined')?COST_GROUP_LABEL:{};
              // Standard groups order (shown even if empty — for slider input)
              var _STD=['assets','materials','remuneration','services','travel','other'];
              // Collect all groups: standard first, then any extra in budget
              var _allGids=[].concat(_STD);
              Object.keys(bgt).forEach(function(gid){if(gid!=='_monthlyMode'&&gid!=='_monthly'&&_allGids.indexOf(gid)<0)_allGids.push(gid);});
              // Only keep groups that have a label OR already have budget data
              _allGids=_allGids.filter(function(gid){return _LABELS[gid]||bgt[gid];});
              var _COLORS=['#3b82f6','#f59e0b','#10b981','#8b5cf6','#06b6d4','#f97316','#64748b','#ec4899'];
              // Compute totals per group
              var _groupTotals={};
              _allGids.forEach(function(gid){
                var byYear=bgt[gid]||{};
                var sum=0;Object.keys(byYear).forEach(function(yr){sum+=Number(byYear[yr])||0;});
                _groupTotals[gid]=sum;
              });
              var _grandTotal=Object.keys(_groupTotals).reduce(function(s,k){return s+(_groupTotals[k]||0);},0);
              // ── Helper: update budget for a group given new total BGN ──
              function _setGroupTotal(gid,totalBGN){
                var perYear=_numYears>0?totalBGN/_numYears:totalBGN;
                setBudget(function(prev){
                  var next=Object.assign({},prev);
                  var byYear={};
                  _yearKeys.forEach(function(yk){byYear[yk]=Math.round(perYear*100)/100;});
                  next[gid]=byYear;
                  return next;
                });
              }
              // ── SVG donut chart (stroke-dasharray technique) ──
              var _R=44,_CX=56,_CY=56,_SW=20;
              var _C=2*Math.PI*_R;
              var _grandEUR=_grandTotal/_eur;
              var _segs=[];var _acc=0;
              _allGids.forEach(function(gid,idx){
                var t=_groupTotals[gid]||0;
                if(t<=0)return;
                var pct=_grandTotal>0?t/_grandTotal:0;
                _segs.push({gid:gid,pct:pct,arcLen:pct*_C,offset:_acc*_C,color:_COLORS[idx%_COLORS.length],label:_LABELS[gid]||gid,total:t});
                _acc+=pct;
              });
              var _hasAnyBudget=_grandTotal>0;
              // ── Render ──
              return e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.4rem'}},
                // Mode toggle header
                e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.5rem',flexWrap:'wrap'}},
                  e('span',{style:{fontWeight:700,fontSize:'.75rem',color:'var(--ink-2)',display:'flex',alignItems:'center',gap:'.3rem'}},
                    e('i',{className:'fas fa-chart-pie',style:{color:'var(--primary)',fontSize:'.65rem'}}),'Бюджет по групи'),
                  e('div',{style:{display:'inline-flex',borderRadius:6,overflow:'hidden',border:'1px solid var(--border)',marginLeft:'auto',flexShrink:0}},
                    e('button',{type:'button',onClick:function(){setBudgetInputMode('slider');},
                      style:{padding:'.22rem .65rem',fontSize:'.65rem',fontWeight:600,border:'none',cursor:'pointer',background:budgetInputMode==='slider'?'var(--primary)':'transparent',color:budgetInputMode==='slider'?'#fff':'var(--ink-3)',transition:'all .15s'}},
                      e('i',{className:'fas fa-sliders-h',style:{marginRight:'.25rem'}}),'Слайдер'),
                    e('button',{type:'button',onClick:function(){setBudgetInputMode('exact');},
                      style:{padding:'.22rem .65rem',fontSize:'.65rem',fontWeight:600,border:'none',borderLeft:'1px solid var(--border)',cursor:'pointer',background:budgetInputMode==='exact'?'var(--primary)':'transparent',color:budgetInputMode==='exact'?'#fff':'var(--ink-3)',transition:'all .15s'}},
                      e('i',{className:'fas fa-keyboard',style:{marginRight:'.25rem'}}),'Точни суми')
                  )
                ),
                e('div',{style:{display:'flex',gap:'1rem',alignItems:'flex-start',flexWrap:'wrap'}},
                  // ── SVG Donut chart ──
                  e('div',{style:{flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',gap:'.4rem'}},
                    e('svg',{width:112,height:112,viewBox:'0 0 112 112',style:{display:'block'}},
                      // Background circle
                      e('circle',{cx:_CX,cy:_CY,r:_R,fill:'none',stroke:'var(--border)',strokeWidth:_SW}),
                      // Segments
                      _hasAnyBudget
                        ? _segs.map(function(seg,i){
                            return e('circle',{key:seg.gid,cx:_CX,cy:_CY,r:_R,fill:'none',
                              stroke:seg.color,strokeWidth:_SW,
                              strokeDasharray:seg.arcLen+' '+(_C-seg.arcLen),
                              strokeDashoffset:-seg.offset,
                              transform:'rotate(-90 '+_CX+' '+_CY+')',
                              style:{transition:'stroke-dasharray .4s ease,stroke-dashoffset .4s ease'}});
                          })
                        : e('circle',{cx:_CX,cy:_CY,r:_R,fill:'none',stroke:'var(--border)',strokeWidth:_SW,strokeDasharray:'100 '+(_C-100),transform:'rotate(-90 '+_CX+' '+_CY+')'}),
                      // Center text
                      e('text',{x:_CX,y:_CY-5,textAnchor:'middle',fontSize:'12',fontWeight:'700',fill:'var(--ink)',fontFamily:'inherit'},
                        _hasAnyBudget?Math.round(_grandEUR).toLocaleString('bg-BG'):'—'),
                      e('text',{x:_CX,y:_CY+9,textAnchor:'middle',fontSize:'9',fill:'var(--gold)',fontFamily:'inherit'},
                        _hasAnyBudget?'€':'BGN')
                    ),
                    // Chart legend (compact)
                    _segs.length>0&&e('div',{style:{display:'flex',flexDirection:'column',gap:'.15rem',width:112}},
                      _segs.map(function(seg){
                        return e('div',{key:seg.gid,style:{display:'flex',alignItems:'center',gap:'.25rem',fontSize:'.58rem'}},
                          e('div',{style:{width:8,height:8,borderRadius:2,background:seg.color,flexShrink:0}}),
                          e('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,color:'var(--ink-3)'},title:seg.label},seg.label.slice(0,14)),
                          e('span',{style:{fontWeight:700,color:'var(--ink-2)',flexShrink:0}},(seg.pct*100).toFixed(0)+'%')
                        );
                      })
                    )
                  ),
                  // ── Slider / Exact input rows ──
                  e('div',{style:{flex:'1 1 280px',display:'flex',flexDirection:'column',gap:'.45rem',minWidth:0}},
                    _allGids.map(function(gid,idx){
                      var total=_groupTotals[gid]||0;
                      var totalEUR=total/_eur;
                      var pct=_maxBGN>0?(total/_maxBGN)*100:0;
                      var color=_COLORS[idx%_COLORS.length];
                      var label=_LABELS[gid]||gid;
                      return e('div',{key:gid,style:{display:'flex',flexDirection:'column',gap:'.12rem'}},
                        e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem',minWidth:0}},
                          e('div',{style:{width:10,height:10,borderRadius:3,background:color,flexShrink:0}}),
                          e('span',{style:{fontSize:'.68rem',fontWeight:600,color:'var(--ink-2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},title:label},label),
                          e('span',{style:{fontSize:'.62rem',color:'var(--gold)',fontWeight:700,flexShrink:0,minWidth:72,textAlign:'right'}},
                            total>0?totalEUR.toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0})+' €':'—')
                        ),
                        budgetInputMode==='slider'
                          ? e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem'}},
                              e('input',{type:'range',min:0,max:Math.max(_maxBGN,total)||100000,step:100,
                                value:Math.round(total),
                                onChange:function(ev){_setGroupTotal(gid,Number(ev.target.value));},
                                style:{flex:1,accentColor:color,height:4,cursor:'pointer'}}),
                              e('span',{style:{fontSize:'.6rem',color:'var(--ink-4)',minWidth:46,textAlign:'right',flexShrink:0}},
                                total>0?total.toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0})+' лв':'0 лв')
                            )
                          : e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem'}},
                              e('input',{type:'number',min:0,step:100,
                                value:total>0?Math.round(total):'',
                                placeholder:'BGN',
                                onChange:function(ev){_setGroupTotal(gid,Math.max(0,Number(ev.target.value)||0));},
                                style:{flex:1,border:'1px solid var(--border)',borderRadius:4,padding:'.2rem .4rem',fontSize:'.72rem',minWidth:0,color:'var(--ink)',background:'var(--bg)'}}),
                              e('span',{style:{fontSize:'.62rem',color:'var(--ink-4)',flexShrink:0}},
                                'лв = '+totalEUR.toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0})+' €')
                            )
                      );
                    })
                  )
                )
              );
            })(),
            // ── Budget limits reference (collapsible) ──
            formValues.projectType&&(typeof BUDGET_LIMITS_BY_TYPE!=='undefined')&&BUDGET_LIMITS_BY_TYPE[formValues.projectType]&&
              e('div',{className:'form-field span2',style:{gridColumn:'1/-1'}},
                e('details',{style:{border:'1px solid var(--border)',borderRadius:'var(--r-sm)',overflow:'hidden',marginBottom:'.2rem'}},
                  e('summary',{style:{cursor:'pointer',padding:'.35rem .65rem',background:'var(--surface)',fontWeight:600,fontSize:'.68rem',color:'var(--ink-3)',display:'flex',alignItems:'center',gap:'.3rem',userSelect:'none'}},
                    e('i',{className:'fas fa-table',style:{color:'var(--primary)',fontSize:'.6rem'}}),'Лимити за '+formValues.projectType),
                  e('div',{style:{padding:'.3rem .6rem .4rem',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'.1rem .5rem'}},
                    BUDGET_LIMITS_BY_TYPE[formValues.projectType].map(function(item,idx){
                      return e('div',{key:idx,style:{display:'flex',alignItems:'center',gap:'.3rem',fontSize:'.62rem',padding:'.08rem 0',borderBottom:'1px solid var(--border)'}},
                        e('span',{style:{fontWeight:700,color:item.fixed&&item.fixed.includes('ЗАБРАНЕНИ')?'var(--err)':item.pct===0?'var(--warn)':'var(--primary)',flexShrink:0,minWidth:36,textAlign:'right'}},item.fixed||(item.pct!=null?(item.pct===0?'0 €':'\u2264'+item.pct+'%'):'')),
                        e('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},item.cat)
                      );
                    })
                  )
                )
              ),
            // ── BudgetEditor (main input) ──
            (typeof BudgetEditor==='function')&&e('div',{className:'form-field span2'},e(BudgetEditor,{value:budget,onChange:setBudget,budgetViolations:budgetErrors,durationMonths:Number(formValues.durationMonths)||12,projectCode:formValues.projectType,totalBudget:(()=>{var pt=PROJECT_TYPES.find(function(p){return p.value===formValues.projectType});if(!pt)return 0;var eurBgn=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;if(formValues.projectType==='НПФ'&&pt.npfTiers){var tier=pt.npfTiers[formValues.npfTier]||pt.npfTiers.university;return (tier.maxEUR*eurBgn);}return pt.maxBudget*eurBgn;})()})),
            // ── Budget violations ──
            budgetErrors.length>0&&e('div',{className:'form-field span2'},e('div',{style:{padding:'.5rem .7rem',background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',fontSize:'.72rem'}},e('div',{style:{fontWeight:700,color:'var(--err)',marginBottom:'.3rem',display:'flex',alignItems:'center',gap:'.3rem'}},e('i',{className:'fas fa-exclamation-triangle',style:{fontSize:'.7rem'}}),'Бюджетът не отговаря на изискванията:'),budgetErrors.map(function(v,i){return e('div',{key:i,style:{padding:'.15rem 0 .15rem 1rem',color:v.severity==='high'?'var(--err)':'var(--warn)',fontSize:'.7rem'}},e('i',{className:'fas fa-circle',style:{fontSize:'.3rem',marginRight:'.3rem',verticalAlign:'middle'}}),v.message);}))),
            // ── Attached docs preview (improved chips) ──
            attachedDocs.length>0&&e('div',{className:'form-field span2',style:{gridColumn:'1/-1'}},
              e('div',{style:{fontWeight:700,fontSize:'.75rem',color:'var(--gold)',display:'flex',alignItems:'center',gap:'.35rem',marginBottom:'.3rem'}},
                e('i',{className:'fas fa-paperclip',style:{fontSize:'.65rem'}}),'Прикачени документи ('+(function(){var _s={},_sb=false,_n=0;attachedDocs.forEach(function(d){if(!d)return;var _b=d._budget||d.docType==='budget';if(_b){if(_sb)return;_sb=true;}var _k=(d.id||d.driveId||d.name||'')+'|'+(d.docType||'');if(_s[_k])return;_s[_k]=true;_n++;});return _n;})()+')'),
              e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.25rem'}},
                (function(){
                  // v12.30.0: de-duplicate attached docs — collapse repeated budget/docType
                  // entries (backend + optimistic UI can produce twins) and drop id-dupes.
                  var _seen={},_seenBudget=false,_uniq=[];
                  attachedDocs.forEach(function(d){
                    if(!d)return;
                    var _isB=d._budget||d.docType==='budget';
                    if(_isB){if(_seenBudget)return;_seenBudget=true;}
                    var _k=(d.id||d.driveId||d.name||'')+'|'+(d.docType||'');
                    if(_seen[_k])return;_seen[_k]=true;_uniq.push(d);
                  });
                  return _uniq;
                })().map(function(d){
                  var vis=(typeof getDocVisuals==='function')?getDocVisuals(d):{icon:'fa-file',cssClass:'',label:''};
                  var isBudget=d._budget||d.docType==='budget';
                  return e('span',{key:d.id,className:'budget-doc-chip',style:{display:'inline-flex',alignItems:'center',gap:'.25rem',padding:'.2rem .45rem',background:isBudget?'#f0fdf4':'var(--surface)',border:'1px solid '+(isBudget?'var(--ok-border)':'var(--border)'),borderRadius:6,cursor:'pointer',fontSize:'.65rem',color:'var(--ink-2)',transition:'all .15s',boxShadow:'0 1px 2px rgba(0,0,0,.04)'},title:'Кликни за редакция — '+(d.name||'документ'),onClick:function(ev){ev.stopPropagation();setEditingDoc(d);}},
                    e('i',{className:'fas '+(isBudget?'fa-file-excel':vis.icon),style:{fontSize:'.58rem',color:isBudget?'var(--ok)':'var(--gold)'}}),
                    e('span',{style:{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(d.name||'').slice(0,28)||'Документ'),
                    isBudget&&e('span',{style:{fontSize:'.5rem',color:'var(--ok)',fontWeight:700}},'бюджет'),
                    d._generated&&e('i',{className:'fas fa-edit',style:{fontSize:'.5rem',color:'var(--ink-5)',marginLeft:'.1rem'}})
                  );
                })
              )
            ),
            // ── Declaration of consent (per Системен файл.docx) — в края на стъпка 3 ──
            e('div',{className:'form-field span2 '+(!declarationAccepted&&errors.declaration?'error':''),style:{gridColumn:'1/-1',marginBottom:'.35rem',padding:'.6rem .7rem',background:'var(--surface)',border:'1px solid '+(declarationAccepted?'var(--ok-border)':'var(--border)'),borderRadius:8}},
                e('label',{style:{display:'flex',alignItems:'flex-start',gap:'.55rem',cursor:'pointer',fontSize:'.78rem',lineHeight:1.5,color:'var(--ink-2)'}},
                    e('input',{type:'checkbox',checked:declarationAccepted,onChange:function(ev){setDeclarationAccepted(ev.target.checked);if(errors.declaration)setErrors(function(p){var n=Object.assign({},p);delete n.declaration;return n;});},style:{marginTop:'.15rem',flexShrink:0,width:'1.1rem',height:'1.1rem',accentColor:'var(--primary)'}}),
                    e('div',{style:{overflow:'hidden'}},
                        e('strong',{style:{color:'var(--ink)',fontSize:'.78rem'}},'Запознат(а) съм с приложимите правилници:'),
                        e('ul',{style:{margin:'.3rem 0 0',paddingLeft:'1.2rem',fontSize:'.72rem',color:'var(--ink-3)',wordBreak:'break-word'}},
                            e('li',{style:{marginBottom:'.2rem',lineHeight:1.4}},
                                e('a',{href:'https://drive.google.com/file/d/1kZxU2EadLYYgEmh0g2Ar5IIP3y06nnj-/view',target:'_blank',rel:'noopener noreferrer',onClick:function(ev){ev.stopPropagation();},style:{color:'var(--primary)',textDecoration:'underline',fontWeight:600,wordBreak:'break-word',display:'inline',whiteSpace:'normal'}},
                                    'Правилник за условията и реда за планиране, разпределение и разходване на средства за научна дейност, финансирана целево от държавния бюджет',
                                    e('i',{className:'fas fa-external-link-alt',style:{marginLeft:'.25rem',fontSize:'.6rem',display:'inline'}}))
                            ),
                            e('li',{style:{marginBottom:'.2rem',lineHeight:1.4}},'Правилник за наблюдение и оценка на научноизследователската дейност'),
                            e('li',{style:{lineHeight:1.4}},'Критерии за оценка и класиране на проекти по чл.8 от Наредбата')
                        )
                    )
                ),
                errors.declaration&&e('div',{className:'field-error',style:{marginTop:'.3rem'}},e('i',{className:'fas fa-exclamation-circle'}),' ',errors.declaration)
            )
        )),
      ),
        e('div',{className:'modal-footer',style:{display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap',padding:'.55rem .85rem',background:'var(--surface)',borderTop:'1px solid var(--border)'}},
        // ── Cancel ──
        e('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:nfClose,disabled:sending,style:{fontSize:'.74rem',flex:'0 0 auto',color:'var(--ink-4)'}},'Отказ'),
        e('div',{style:{flex:'1 1 auto',minWidth:'.25rem'}}),
        // ── Back (steps 2,3) ──
        wizardStep>1&&e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:goPrev,disabled:sending,style:{flex:'0 0 auto',fontSize:'.74rem',minWidth:90}},
          e('i',{className:'fas fa-arrow-left',style:{marginRight:'.3rem'}}),'Назад'),
        // ── Save draft (all steps) ──
        e('button',{type:'button',className:'btn btn-outline btn-sm',disabled:sending||!availableCompetitions.length,onClick:function(ev){handleSubmit(ev,true);},title:'Запазва черновата без да я изпраща',style:{flex:'0 0 auto',fontSize:'.74rem',minWidth:90}},
          e('i',{className:'fas fa-save',style:{marginRight:'.3rem'}}),'Запази чернова'),
        // ── Next (steps 1,2) ──
        (wizardStep===1||wizardStep===2)&&e('button',{type:'button',className:'btn btn-primary',onClick:goNext,disabled:sending||!availableCompetitions.length,title:wizardStep===1?(step1Complete?'Готово — продължете към документи':'Попълнете задължителните полета'):wizardStep===2?(step2Complete?'Готово — продължете към бюджет':'Изчакайте копирането на документите'):'',style:{flex:'0 0 auto',fontSize:'.78rem',padding:'.45rem 1.2rem',fontWeight:700,whiteSpace:'nowrap',opacity:(wizardStep===1?step1Complete:step2Complete)?1:0.7,transition:'opacity .3s',minWidth:140}},
          wizardStep===1?e(Fragment,null,'Продължи ',e('i',{className:'fas fa-arrow-right',style:{marginLeft:'.35rem'}})):
          wizardStep===2?e(Fragment,null,'Продължи ',e('i',{className:'fas fa-arrow-right',style:{marginLeft:'.35rem'}})):
          null),
        // ── Step 3: Submit ──
        wizardStep===3&&(function(){
          var _bkeys=Object.keys(budget||{}).filter(function(k){return k!=='_monthlyMode'&&k!=='_monthly';});
          var _btotal=0;
          try{_bkeys.forEach(function(k){var v=budget[k];if(v&&typeof v==='object'){Object.keys(v).forEach(function(p){var n=Number(v[p]);if(!isNaN(n))_btotal+=n;});}else{var n=Number(v);if(!isNaN(n))_btotal+=n;}});
          var _md=budget._monthly;if(_md&&typeof _md==='object'){Object.keys(_md).forEach(function(mgid){var mp=_md[mgid]||{};if(mp&&typeof mp==='object'){Object.keys(mp).forEach(function(period){var n=Number(mp[period])||0;_btotal+=n;});}});}
          }catch(_){}
          var _emptyBudget=(_bkeys.length===0&&(!budget._monthly||Object.keys(budget._monthly).length===0))||_btotal<=0;
          var _budgetTplReq=false,_budgetSheetMissing=false;
          try{var _bt=(typeof getBudgetTemplate==='function')?getBudgetTemplate(formValues.projectType):null;if(_bt){_budgetTplReq=true;_budgetSheetMissing=!attachedDocs.some(function(d){return d&&(d.docType==='budget'||d._budget);});}}catch(_){}
          var _hasHighErrors=budgetErrors.some(function(v){return v.group==='total'&&v.severity==='high';});
          var _hasFieldErrors=Object.keys(errors).length>0;
          var disabled=sending||!availableCompetitions.length||_hasHighErrors||_hasFieldErrors||_emptyBudget||_budgetSheetMissing;
          var allReady=!disabled&&!sending;
          // Error feedback inline
          var _errMsg='';
          if(_hasHighErrors)_errMsg='Коригирайте бюджетните нарушения';
          else if(_hasFieldErrors)_errMsg='Попълнете задължителните полета';
          else if(_emptyBudget)_errMsg='Попълнете бюджета';
          else if(_budgetSheetMissing)_errMsg='Генерирайте бюджетната таблица';
          return e(Fragment,null,
            _errMsg&&e('span',{style:{flex:'1 1 auto',fontSize:'.68rem',color:'var(--err)',display:'flex',alignItems:'center',gap:'.25rem',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},
              e('i',{className:'fas fa-exclamation-circle',style:{flexShrink:0,fontSize:'.6rem'}}),_errMsg),
            e('button',{type:'submit',
              className:'btn '+(allReady?'btn-primary':'btn-outline'),
              disabled:disabled,
              title:allReady?'Изпратете проектното предложение за проверка':_errMsg,
              style:{flex:'0 0 auto',fontSize:'.82rem',padding:'.45rem 1.4rem',fontWeight:700,whiteSpace:'nowrap',opacity:allReady?1:0.65,transition:'opacity .3s',minWidth:160}},
              sending?e(Fragment,null,e('i',{className:'fas fa-spinner fa-spin',style:{marginRight:'.35rem'}}),'Изпращане…'):
              e(Fragment,null,e('i',{className:'fas fa-paper-plane',style:{marginRight:'.35rem'}}),'Изпрати предложение'))
          );
        })()
        )
    )
    ),
    previewDoc&&e(DocumentPreviewModal,{doc:previewDoc,onClose:function(){setPreviewDoc(null);},onEdit:function(doc){setPreviewDoc(null);setEditingDoc(doc);},onDelete:function(doc){setPreviewDoc(null);if(doc&&doc.id){setAttachedDocs(function(p){return p.filter(function(x){return x.id!==doc.id;});});}if(doc&&doc.name&&!doc.id){setFiles(function(p){return p.filter(function(f){return f.name!==doc.name;});});}}}),
    // v12.12.0: inline editor moved INTO step 2 wizard content
    // v10.3.0: Document generation runs fully in background — no progress modal
));
});

/* ─── EDIT FORM MODAL ─── */
var EditFormModal=memo(({form,user,onClose,onSaved,allDocuments=[],isAdmin=false})=>{
const{closing:efClosing,close:efClose}=useModalClose(onClose);
const[newFiles,setNewFiles]=useState([]);const[attachedDocs,setAttachedDocs]=useState(()=>getAttachedDocs(form));const[sending,setSending]=useState(false);const[errors,setErrors]=useState({});
const[formValues,setFormValues]=useState({competitionId:getCompetitionId(form),projectType:String(form?.projectCode||''),npfTier:String(form?.npfTier||'')||'university',selfAssessmentScore:Number(form?.selfAssessmentScore)||0,area:getArea(form),professionalField:String(form?.professionalField||''),title:getTitle(form),titleEn:String(form?.titleEn||''),acronym:String(form?.acronym||''),description:getDescription(form),descriptionEn:String(form?.descriptionEn||''),objectives:String(form?.objectives||''),expectedResults:String(form?.expectedResults||''),durationMonths:Number(form?.durationMonths)||12});
// ── Multi-prof-field support ──
const[selectedProfFieldsEf,setSelectedProfFieldsEf]=useState(function(){return getAreas(form?.professionalField||form);});
const handleProfFieldChangeEf=useCallback(function(nextFields){
  setSelectedProfFieldsEf(nextFields);
  _hasUserEditedRef.current=true;
  var joined=(Array.isArray(nextFields)?nextFields:[]).filter(function(a){return String(a||'').trim();}).join(';;');
  setFormValues(function(p){return {...p,professionalField:joined};});
  if(errors.professionalField)setErrors(function(p){var n={...p};delete n.professionalField;return n;});
},[errors.professionalField]);
const[teamMembers,setTeamMembers]=useState(()=>Array.isArray(form?.teamMembers)?form.teamMembers:[]);
const[budget,setBudget]=useState(()=>{try{var raw=form?.budget||form?.budgetBreakdown||{};if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch(_){raw={}}}return(raw&&typeof raw==='object'&&!Array.isArray(raw))?raw:{};}catch(_){return{};}});
// v12.8.0-fix: compute budgetErrors (missing → caused TypeError: Cannot read 'filter' of undefined)
var budgetErrors=(typeof _computeBudgetViolations==='function')
  ? _computeBudgetViolations(budget,formValues.projectType,formValues.npfTier,formValues.durationMonths,formValues.leaderYoungScientist,formValues.leaderDoctoral,teamMembers)
  : [];
const[showPicker,setShowPicker]=useState(false);
const[previewDoc,setPreviewDoc]=useState(null);
const[editingDoc,setEditingDoc]=useState(null);
// ── Register this component's editor as the global doc editor target ──
useEffect(function(){
  if(typeof window._registerDocEditor==='function')window._registerDocEditor(setEditingDoc);
  return function(){ if(typeof window._unregisterDocEditor==='function')window._unregisterDocEditor(); };
},[]);
const[draggingEf,setDraggingEf]=useState(false);const efFileRef=useRef(null);
const _efSendingRef=useRef(false); // prevent double-click spam
const[availableCompetitions,setAvailableCompetitions]=useState([]);
const[compsLoading,setCompsLoading]=useState(true);
// ── Document generation state (live prefetched documents by project type) ──
const[generatingDoc,setGeneratingDoc]=useState({});
const[genResults,setGenResults]=useState({});
const[deletingAttachedDoc,setDeletingAttachedDoc]=useState(null);
const trackGenResult=useCallback(function(docType,result){
  setGenResults(function(prev){return Object.assign({},prev,{[docType]:result});});
},[]);
// ── Template availability map: { docId: { resolved:bool, foundAs:string } } ──
const[tplAvailability,setTplAvailability]=useState({});
const[tplCheckLoading,setTplCheckLoading]=useState(false);
var _lastTplTypeRef=useRef(null);
// ── v10.3.0-edit-wizard: 3-step wizard for editing ──
const[wizardStep,setWizardStep]=useState(1);
const[budgetInputModeEf,setBudgetInputModeEf]=useState('slider'); // 'slider' | 'exact'
// v12.12.0: auto-open application form in edit mode on Step 2 entry (EditFormModal)
var _autoEditOpenedRefEf=useRef(false);
useEffect(function(){
  if(wizardStep!==2||!attachedDocs||!attachedDocs.length)return;
  var _found=null;
  for(var _i=0;_i<attachedDocs.length;_i++){
    var d=attachedDocs[_i];
    if(d&&d._generated&&d.driveId&&!d._budget){_found=d;break;}
  }
  if(!_found){
    for(var _j=0;_j<attachedDocs.length;_j++){
      var d2=attachedDocs[_j];
      if(d2&&d2.driveId&&!d2._budget){_found=d2;break;}
    }
  }
  if(!_found||!_found.driveId)return;
  if(_autoEditOpenedRefEf.current===_found.id)return;
  _autoEditOpenedRefEf.current=_found.id;
  var raf=requestAnimationFrame(function(){
    if(typeof setEditingDoc==='function')setEditingDoc(_found);
  });
  return function(){cancelAnimationFrame(raf);};
},[wizardStep,attachedDocs]);
// Also auto-open when generation completes while on Step 2
useEffect(function(){
  if(wizardStep!==2)return;
  var _hasNewGen=genResults&&Object.keys(genResults).some(function(k){return genResults[k]&&genResults[k].success;});
  if(!_hasNewGen)return;
  var _found=null;
  for(var _i=0;_i<attachedDocs.length;_i++){
    var d=attachedDocs[_i];
    if(d&&d._generated&&d.driveId&&!d._budget&&d.id!==_autoEditOpenedRefEf.current){_found=d;break;}
  }
  if(!_found||!_found.driveId)return;
  _autoEditOpenedRefEf.current=_found.id;
  var raf=requestAnimationFrame(function(){
    if(typeof setEditingDoc==='function')setEditingDoc(_found);
  });
  return function(){cancelAnimationFrame(raf);};
},[wizardStep,genResults,attachedDocs]);
useEffect(function(){
  if(wizardStep!==2)_autoEditOpenedRefEf.current=null;
},[wizardStep]);
const goNext=function(){
  if(wizardStep===1){
    var s1=[];if(!formValues.area)s1.push('Приоритетно направление');if(!formValues.description.trim())s1.push('Кратко описание');
    if(s1.length){toast('Попълнете: '+s1.join(', '),'warn',4000);return;}
    setWizardStep(2);
  }else if(wizardStep===2){
    setWizardStep(3);
  }
};
const goPrev=function(){if(wizardStep>1)setWizardStep(wizardStep-1);};
const goToStep=function(s){if(s>=1&&s<=3)setWizardStep(s);};
const step1Complete=!!formValues.area&&!!formValues.description.trim();
// ── Step 2 completion: reflects whether required documents for the project type are present ──
const step2Complete=!formValues.projectType||(function(){try{var _req=getRequiredDocuments(formValues.projectType);if(!_req||!_req.length)return true;var _st=checkRequiredDocsStatus(formValues.projectType,attachedDocs,[]);return _st&&_st.fulfilled>=_st.total;}catch(_){return true;}})();
const step3Complete=budgetErrors.length===0||budgetErrors.filter(function(v){return v.severity==='high';}).length===0;

// ── Phase 5: per-form edit autosave to localStorage ──
// Keyed by the form's stable id so concurrent edits of different forms
// don't collide. Restored only if the saved snapshot is newer than the
// server-known modification timestamp (best-effort: relies on form.modified
// or form.updated when present). Cleared on successful save.
const _editKey='erp:editform:draft:'+(getId(form)||'_unknown');
const _EDIT_TTL_MS=7*24*60*60*1000;
const _hasUserEditedRef=useRef(false);

useEffect(()=>{
    try{
    const raw=localStorage.getItem(_editKey);if(!raw)return;
    const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=='object')return;
    if(typeof parsed.ts!=='number'||(Date.now()-parsed.ts)>_EDIT_TTL_MS){localStorage.removeItem(_editKey);return;}
    const v=parsed.formValues||{};
    // Only offer restore if there's an actual diff vs the server-loaded form
    const baseline={competitionId:getCompetitionId(form),area:getArea(form),title:getTitle(form),description:getDescription(form)};
    var same=v.competitionId===baseline.competitionId&&v.area===baseline.area&&v.title===baseline.title&&v.description===baseline.description;
    // Also compare multi-area: form may have same ;;‑joined string but different from baseline
    if(!same&&typeof v.area==='string'&&typeof baseline.area==='string'&&v.area.split(';;').sort().join(',')===baseline.area.split(';;').sort().join(',')){
      same=true; // same areas, possibly different order
    }
    if(same){localStorage.removeItem(_editKey);return;}
    toast('Намерени са незапазени промени по тази форма.','info',8000,{actionLabel:'Възстанови',action:()=>{
        setFormValues(prev=>({...prev,...v}));
        if(typeof v.professionalField==='string'&&v.professionalField)setSelectedProfFieldsEf(getAreas(v.professionalField));
        if(Array.isArray(parsed.attachedDocs))setAttachedDocs(parsed.attachedDocs);
        toast('Промените са възстановени.','success');
    }});
    }catch(_){try{localStorage.removeItem(_editKey)}catch(_2){}}
// eslint-disable-next-line react-hooks/exhaustive-deps
},[]);

// Debounced save — only after the user has actively touched the form
useEffect(()=>{
    if(!_hasUserEditedRef.current)return;
    const t=setTimeout(()=>{
    try{localStorage.setItem(_editKey,JSON.stringify({ts:Date.now(),formValues,attachedDocs:attachedDocs.map(_serializeDoc)}))}
    catch(_){}
    },600);
    return()=>clearTimeout(t);
},[formValues,attachedDocs,_editKey]);

const clearEditDraft=useCallback(()=>{try{localStorage.removeItem(_editKey)}catch(_){}},[_editKey]);

const loadAvailableCompetitions=useCallback(async(forceRefresh=true)=>{
    setCompsLoading(true);
    try{
    const authPayload={isAdmin:!!isAdmin,userId:(user?.email||'')};
    if(isAdmin&&_adminCreds)Object.assign(authPayload,_adminCreds);
    const comps=await refreshCompetitions(authPayload,{forceRefresh:!!forceRefresh});
    const normalized=Array.isArray(comps)?comps.filter(c=>c.id&&!String(c.id).startsWith('DEMO')):[];
    if(formValues.competitionId&&!normalized.some(c=>c.id===formValues.competitionId)){
        normalized.unshift({id:formValues.competitionId,name:'(Текущ конкурс) '+formValues.competitionId,dateEnd:'',deadline:'',status:'',created:'',description:''});
    }
    setAvailableCompetitions(prev=>competitionListSignature(prev)===competitionListSignature(normalized)?prev:normalized);
    }catch(_){}finally{setCompsLoading(false)}
},[isAdmin,user?.email,formValues.competitionId]);

useEffect(()=>{loadAvailableCompetitions(COMPETITIONS.length===0)},[loadAvailableCompetitions]);

// ── Template availability prefetch (live prefetched documents by project type) ──
useEffect(function(){
    if(typeof getRequiredApplicationTemplates!=='function')return;
    var currentType=String(formValues.projectType||'').trim().toUpperCase();
    if(currentType&&_lastTplTypeRef.current===currentType&&Object.keys(tplAvailability).length>0)return;
    _lastTplTypeRef.current=currentType;
    var cancelled=false;
    setTplCheckLoading(true);
    getRequiredApplicationTemplates(true).then(function(res){
        if(cancelled||!res||!res.success||!res.templates)return;
        var flat=Object.assign({},tplAvailability);
        Object.keys(res.templates).forEach(function(type){
            (res.templates[type]||[]).forEach(function(t){
                flat[type+':'+t.id]={resolved:t.resolved===null?undefined:!!t.resolved,foundAs:t.foundAs||'',name:t.name||''};
                // v10.11.0: Also add an alias entry so frontend doc IDs (e.g. fniteam)
                // that map to backend IDs (e.g. fniteamextra) can be looked up.
                if(typeof window._DOC_TYPE_ALIAS!=='undefined'){
                  var _aliasFor=Object.keys(window._DOC_TYPE_ALIAS).find(function(k){return window._DOC_TYPE_ALIAS[k]===t.id;});
                  if(_aliasFor&&flat[type+':'+_aliasFor]===undefined){
                    flat[type+':'+_aliasFor]=flat[type+':'+t.id];
                  }
                }
            });
        });
        setTplAvailability(flat);
    }).catch(function(){})
      .finally(function(){if(!cancelled)setTplCheckLoading(false);});
    return function(){cancelled=true;};
},[formValues.projectType]);

// ── Auto-generate documents when project type changes (edit mode) ──
var _editAutoGenTypeRef=useRef(null);
useEffect(function(){
  var pt=formValues.projectType;
  if(!pt)return;
  // v10.11.0: re-fire when project type changes to a different value
  if(_editAutoGenTypeRef.current===pt)return;
  _editAutoGenTypeRef.current=pt;
  var cancelled=false;
  var doGenerate=function(){
    if(cancelled)return;
    var fid=getId(form);
    if(!fid)return;
    var _docs=attachedDocs;
    var _budget=budget;
    var _genDoc=generatingDoc;
    var _fv=formValues;
    var _user=user;
    var _tm=teamMembers;
    var required=(typeof getRequiredDocuments==='function')?getRequiredDocuments(pt):[];
    if(!required.length)return;
    var status=(typeof checkRequiredDocsStatus==='function')
      ?checkRequiredDocsStatus(pt,_docs,[])
      :{total:0,fulfilled:0};
    var missing=status.missing||[];
    var alreadyGenerated=0;
    for(var _bi=0;_bi<_docs.length;_bi++){if(_docs[_bi]&&_docs[_bi]._generated)alreadyGenerated++;}
    if(alreadyGenerated>=required.length)return;
    var missingDocTypes=missing.map(function(m){return m.id;}).filter(Boolean);
    if(!missingDocTypes.length)return;
    var _genCount=0;
    var _firstDoc=null;
    var budgetTpl=(typeof getBudgetTemplate==='function')?getBudgetTemplate(pt):null;
    var budgetDoc=null;
    if(budgetTpl){
      for(var _bj=0;_bj<_docs.length;_bj++){var _bd2=_docs[_bj];if(_bd2&&(_bd2.docType==='budget'||_bd2._budget||(_bd2._generated&&String(_bd2.name||'').toLowerCase().indexOf('бюджет')!==-1))){budgetDoc=_bd2;break;}}
    }
    var _allPromises=[];
    missingDocTypes.forEach(function(dt){
      var liveType=String(pt||'').trim().toUpperCase();
      if(!liveType)return;
      if(!fid||_genDoc[dt])return;
      var p=typeof generateApplicationDocument==='function'
        ? generateApplicationDocument(fid,dt,liveType,{
            title:_fv.title,titleEn:_fv.titleEn,acronym:_fv.acronym,
            description:_fv.description,descriptionEn:_fv.descriptionEn,
            objectives:_fv.objectives,expectedResults:_fv.expectedResults,
            area:_fv.area,professionalField:_fv.professionalField,
            durationMonths:_fv.durationMonths,applicantName:_user&&_user.name,
            teamMembers:_tm
          }).then(function(res){
            if(cancelled)return;
            if(res&&res.success){
              var gf=res.applicantFile||res.file;
              if(gf){
                var el=res.googleDocEditLink||(gf.id?'https://docs.google.com/document/d/'+encodeURIComponent(gf.id)+'/edit':'');
                var dobj={id:gf.id,driveId:gf.driveId||gf.id,name:gf.name,mimeType:gf.mimeType,previewLink:gf.previewLink,downloadUrl:gf.downloadUrl,folderName:gf.folderName||'',googleDocEditLink:el,_generated:true,docType:dt};
                setAttachedDocs(function(prev){var _pg=prev.filter(function(d){return!(d._pregenerated&&d.docType===dobj.docType);});if(_pg.some(function(d){return d.id===dobj.id;}))return _pg;return _pg.concat([dobj]);});
                _genCount++;
                if(!_firstDoc)_firstDoc=dobj;
                try{window.dispatchEvent(new CustomEvent('erp:mydocAdded',{detail:dobj}));}catch(_){}
              }
              try{trackGenResult(dt,{success:true,file:gf||null});}catch(_){}
            }else{
              try{trackGenResult(dt,{success:false,error:(res&&res.error)||'Грешка при генериране'});}catch(_){}
            }
          }).catch(function(err){try{trackGenResult(dt,{success:false,error:err.message||'Грешка при свързване'});}catch(_){}})
        : Promise.resolve();
      _allPromises.push(p);
    });
    if(budgetTpl&&!budgetDoc&&typeof generateBudgetSpreadsheet==='function'){
      var liveType=String(pt||'').trim().toUpperCase();
      if(liveType){
        var bp=generateBudgetSpreadsheet(fid,liveType,_budget,{
          acronym:_fv.acronym,projectTitle:_fv.title,applicantName:_user&&_user.name
        }).then(function(res){
          if(cancelled)return;
          if(res&&res.success){
            var gf=res.applicantFile||res.file||{};
            var link=res.googleSheetEditLink||res.googleDocEditLink||(gf.id?'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(gf.id)+'/edit':'')||'';
            var _btLabel=(budgetTpl&&budgetTpl.label)||('Бюджетна таблица — '+liveType);
            var dobj={id:gf.id,driveId:gf.driveId||gf.id,name:gf.name||_btLabel,mimeType:gf.mimeType,typeLabel:gf.typeLabel,previewLink:gf.previewLink,downloadUrl:gf.downloadUrl,folderName:gf.folderName||'Моите документи',googleSheetEditLink:link,googleDocEditLink:link,editLink:link,_generated:true,_budget:true,docType:'budget'};
            setAttachedDocs(function(prev){var rest=prev.filter(function(d){return!(d&&(d.docType==='budget'||d._budget));});return rest.concat([dobj]);});
            try{window.dispatchEvent(new CustomEvent('erp:mydocAdded',{detail:dobj}));}catch(_){}
            _genCount++;
            try{trackGenResult('budget',{success:true,file:gf||null});}catch(_){}
          }else{
            try{trackGenResult('budget',{success:false,error:(res&&res.error)||'Грешка при генериране на бюджет'});}catch(_){}
          }
        }).catch(function(err){try{trackGenResult('budget',{success:false,error:err.message||'Грешка при свързване'});}catch(_){}});
        _allPromises.push(bp);
      }
    }
    if(_genCount>0&&_allPromises.length>0){
      Promise.allSettled(_allPromises).then(function(){
        if(cancelled)return;
        try{window.dispatchEvent(new CustomEvent('erp:forms-changed'));}catch(_){}
        if(_firstDoc&&typeof setEditingDoc==='function'){
          try{setEditingDoc(_firstDoc);}catch(_){}
          if(typeof toast==='function')toast('✅ '+_genCount+' документ'+
            (_genCount===1?' е генериран. Отваряне на редактора…':'а са генерирани. Отваряне на редактора…'),'success',4000);
        } else {
          if(typeof toast==='function')toast('✅ '+(_genCount===1?'1 документ е генериран. Можете да го редактирате.':_genCount+' документа са генерирани. Можете да ги редактирате.'),'success',6000);
        }
      });
    }
  };
  doGenerate();
  return function(){cancelled=true;};
},[formValues.projectType]);

const handleChange=ev=>{const{name,value}=ev.target;_hasUserEditedRef.current=true;setFormValues(p=>({...p,[name]:value}));if(errors[name])setErrors(p=>{const n={...p};delete n[name];return n})};
const handleAcronymChange=ev=>{var clean=String(ev.target.value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,10);_hasUserEditedRef.current=true;setFormValues(p=>({...p,acronym:clean}));if(errors.acronym)setErrors(p=>{var n={...p};delete n.acronym;return n;});};
// ── FIELD LABEL MAP for descriptive error messages ──
const _EF_LABELS={competitionId:'Конкурсна сесия',area:'Приоритетно направление',professionalField:'Професионално направление',title:'Наименование',titleEn:'Наименование (EN)',acronym:'Акроним',description:'Кратко описание',descriptionEn:'Кратко описание (EN)',objectives:'Цели',expectedResults:'Очаквани резултати',durationMonths:'Срок (месеци)'};
// ── Reactive budget validation (useMemo — no extra render cycle) ──
var budgetErrors=useMemo(function(){
  try {
    var pc=String(form?.projectCode||'').toUpperCase();
    if(typeof _computeBudgetViolations==='function'){
      return _computeBudgetViolations(budget,pc,formValues.durationMonths,teamMembers,{npfTier:formValues.npfTier});
    }
  } catch(e) {}
  return [];
},[budget,form?.projectCode,formValues.durationMonths,teamMembers,formValues.npfTier]);
// ── Reactive field error clearing ──
useEffect(function(){
  if(!Object.keys(errors).length)return;
  var fixed={},changed=false;
  Object.keys(errors).forEach(function(k){
    var val=formValues[k];
    if(val!==undefined&&val!==null&&String(val).trim()!==''){fixed[k]=true;changed=true;}
  });
  if(changed){setErrors(function(prev){var next={};Object.keys(prev).forEach(function(k){if(!fixed[k])next[k]=prev[k];});return next;});}
},[formValues]);
const validate=()=>{const errs={};if(!formValues.area)errs.area='Приоритетното направление е задължително';if(!formValues.description.trim())errs.description='Описанието е задължително';setErrors(errs);
var hasBlockers=budgetErrors.some(function(v){return v.severity==='high';});
return Object.keys(errs).length===0&&!hasBlockers;};
const handleFiles=async ev=>{const selected=Array.from(ev.target.files||[]);_hasUserEditedRef.current=true;const results=await Promise.allSettled(selected.map(readFileAsBase64));results.filter(r=>r.status==='fulfilled').map(r=>r.value).forEach(f=>setNewFiles(p=>[...p,f]));results.filter(r=>r.status==='rejected').forEach(r=>toast(r.reason?.message||'Грешка','error'));ev.target.value=''};
const handleDropEf=async ev=>{ev.preventDefault();ev.stopPropagation();setDraggingEf(false);_hasUserEditedRef.current=true;const dropped=Array.from(ev.dataTransfer?.files||[]);if(!dropped.length)return;const results=await Promise.allSettled(dropped.map(readFileAsBase64));results.filter(r=>r.status==='fulfilled').map(r=>r.value).forEach(f=>setNewFiles(p=>[...p,f]));results.filter(r=>r.status==='rejected').forEach(r=>toast(r.reason?.message||'Грешка','error'))};

const handleSave=async ev=>{
    ev.preventDefault();if(_efSendingRef.current)return;
    if(!validate()){
        var missingFields=Object.keys(errors).map(function(k){return _EF_LABELS[k]||k;}).filter(Boolean);
        var hasBudgetIssue=budgetErrors.length>0;
        if(hasBudgetIssue&&missingFields.length===0){toast('Бюджетът не отговаря на изискванията. Коригирайте сумите.','error',6000)}
        else{var toastMsg=missingFields.length===1?'Липсва: '+missingFields[0]:missingFields.length<=4?'Липсват: '+missingFields.join(', '):'Липсват '+missingFields.length+' задължителни полета.';toast(toastMsg,'error',6000)}
        return;
    }
    _efSendingRef.current=true;
    setSending(true);
    const id=getId(form);
    const updates={userId:user?.email||'',userName:user?.name||'',projectCode:String(form?.projectCode||'').toUpperCase(),npfTier:String(form?.projectCode||'').toUpperCase()==='НПФ'?(formValues.npfTier||'university'):undefined,competitionId:formValues.competitionId,title:formValues.title.trim(),titleEn:(formValues.titleEn||'').trim(),acronym:(formValues.acronym||'').trim().toUpperCase(),area:formValues.area,professionalField:formValues.professionalField||'',description:formValues.description.trim(),descriptionEn:(formValues.descriptionEn||'').trim(),objectives:(formValues.objectives||'').trim(),expectedResults:(formValues.expectedResults||'').trim(),durationMonths:Number(formValues.durationMonths)||12,teamMembers:teamMembers,budget:budget,newFiles,attachedDocs:attachedDocs.map(_serializeDoc)};
    const payload={id,updates};
    // Optimistic: close modal immediately, patch the cached forms list, then fire write.
    // mutateApi rolls back the patch automatically on error.
    onClose();
    clearEditDraft();
    toast('Промените са запазени.','success');
    const optimisticPatch=prev=>{
        if(!prev||!Array.isArray(prev.forms))return prev;
        return{...prev,forms:prev.forms.map(f=>getId(f)===id
            ?{...f,competitionId:updates.competitionId,title:updates.title,area:updates.area,description:updates.description,_optimistic:true}
            :f)};
    };
    try{
        await mutateApi('updateForm',payload,{
            patches:[{action:'getforms',mutator:optimisticPatch}],
            invalidates:['getforms','getinitialdata','getcompetitionsummary','getapplicationsbycompetition']
        });
        Promise.resolve().then(()=>onSaved({silent:true}));
    }catch(err){
        toast(err.message||'Грешка при обновяване','error',5000);
    }finally{_efSendingRef.current=false;setSending(false)}
};

const ErrMsg=({field})=>errors[field]?e('div',{className:'field-error'},e('i',{className:'fas fa-exclamation-circle'}),' ',errors[field]):null;

if(showPicker)return e(DocumentPickerModal,{documents:allDocuments,alreadyAttached:attachedDocs,userEmail:(typeof _currentUserEmail!=='undefined'?_currentUserEmail:''),onCancel:()=>setShowPicker(false),onConfirm:async function(docs){
      setShowPicker(false);
      if(!docs||!docs.length)return;
      // v12.27.1-perf: Parallelize doc copies with Promise.all (was sequential N× latency).
      var copiedDocs=[];
      var formId3=getId(form);
      if(formId3&&docs.length){
        var copyPromises=docs.map(function(d){
          return api('copyDocument',{userId:user&&user.email?user.email:'',email:user&&user.email?user.email:'',docId:d.id,formId:formId3}).then(function(copyRes){
            if(copyRes&&copyRes.success&&copyRes.file) return _serializeDoc(copyRes.file);
            return _serializeDoc(d);
          }).catch(function(){return _serializeDoc(d);});
        });
        copiedDocs=await Promise.all(copyPromises);
      }else{
        docs.forEach(function(d){copiedDocs.push(_serializeDoc(d));});
      }
      var nextDocs=[];setAttachedDocs(function(prev){var merged=[...prev];copiedDocs.forEach(function(cd){if(!merged.some(function(x){return x.id===cd.id;}))merged.push(cd);});nextDocs=merged;return merged;});
      // ── Instant server-side persist: save the freshly-attached docs immediately.
      var formId3=getId(form);
      if(formId3&&nextDocs.length){
        var savePayload={id:formId3,updates:{attachedDocs:nextDocs.map(function(d){return _serializeDoc(d);})}};
        await mutateApi('updateForm',savePayload,{invalidates:['getforms']}).catch(function(){});
      }
    // v12.30.1-fix: Wire up onCopyAttach so "Създай копие и прикачи" in the
    // preview modal actually copies the doc to the app folder and attaches it.
    },onCopyAttach:function(docId,fId,docData){
      return api('copyDocument',{userId:user&&user.email?user.email:'',email:user&&user.email?user.email:'',docId:docId||docData?.id,formId:fId||getId(form)})
        .then(function(res){
          if(!res||!res.success||!res.file) throw new Error((res&&res.error)||'Грешка при копиране');
          var cf=_serializeDoc(res.file);
          var nextDocs=[];
          setAttachedDocs(function(prev){
            if(prev.some(function(x){return x.id===cf.id;})) return prev;
            var merged=prev.concat([cf]);
            nextDocs=merged;
            return merged;
          });
          var formId3=getId(form);
          if(formId3&&nextDocs.length){
            var payload={id:formId3,updates:{attachedDocs:nextDocs.map(function(d){return _serializeDoc(d);})}};
            mutateApi('updateForm',payload,{invalidates:['getforms']}).catch(function(){});
          }
          toast('Документът е копиран и прикачен','success');
        }).catch(function(err){toast('Грешка: '+(err&&err.message||''),'error');});
    },formId:getId(form),competitionId:formValues.competitionId||form.competitionId||'',projectType:(form?.projectCode||'').toUpperCase()});

return _portal(e('div',{className:'modal-overlay'+(efClosing?' modal-closing':''),onClick:efClose},
    e('form',{className:'modal-box form-modal modal-form'+(efClosing?' modal-closing':''),onSubmit:handleSave,onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head modal-head-wizard'},
      e('h3',null,e('i',{className:'fas fa-edit'}),' Редактиране'),
      // ── Modern stepper (v12.12.0) ──
      e('div',{className:'wizard-stepper',style:{display:'flex',alignItems:'center',justifyContent:'center',gap:0,flexShrink:0,marginLeft:'auto',maxWidth:'100%',padding:'0 .3rem'}},
        [1,2,3].map(function(s){
          var active=s===wizardStep;
          var done=(s===1&&step1Complete)||(s===2&&step2Complete)||(s===3&&step3Complete);
          var label=s===1?'Основни данни':s===2?'Документи':'Бюджет';
          var circleBg=done?'var(--ok)':active?'var(--primary)':'var(--surface)';
          var circleColor=done?'#fff':active?'#fff':'var(--ink-4)';
          var circleBorder=done?'var(--ok)':active?'var(--primary)':'var(--border)';
          var labelColor=active?'var(--primary)':done?'var(--ok)':'var(--ink-4)';
          return e(Fragment,{key:s},
            s>1&&e('div',{style:{width:22,height:2,background:(s===2?step1Complete:(s===3?step2Complete:false))?'var(--ok)':'var(--border-2)',borderRadius:1,transition:'background .5s ease',flexShrink:0}}),
            e('button',{type:'button',style:{display:'flex',flexDirection:'column',alignItems:'center',gap:2,background:'none',border:'none',cursor:'pointer',padding:'2px 4px',flexShrink:0,touchAction:'manipulation'},onClick:function(){goToStep(s);},title:label,'aria-current':active?'step':'false'},
              e('div',{style:{width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.68rem',fontWeight:700,color:circleColor,background:circleBg,border:'2px solid '+circleBorder,boxShadow:active?'0 0 0 3px rgba(35,56,116,.12)':'none',transition:'all .35s ease'}},
                done?e('i',{className:'fas fa-check',style:{fontSize:'.55rem'}}):s
              ),
              e('span',{style:{fontSize:'.52rem',fontWeight:active?700:500,color:labelColor,whiteSpace:'nowrap',transition:'color .3s'}},label)
            )
          );
        })
      ),
      e('button',{type:'button',className:'close-btn',onClick:efClose},e('i',{className:'fas fa-times'}))
    ),
    // ── Guidance bar (v12.12.0) ──
    e('div',{style:{padding:'.45rem .8rem',background:'linear-gradient(180deg,var(--surface) 0%,var(--bg) 100%)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'.4rem'}},
      e('div',{style:{width:7,height:7,borderRadius:'50%',flexShrink:0,background:step1Complete&&step2Complete&&step3Complete?'var(--ok)':!step1Complete?'var(--primary)':'var(--gold)',transition:'all .4s ease'}}),
      e('span',{style:{fontSize:'.68rem',color:step1Complete&&step2Complete&&step3Complete?'var(--ok)':'var(--ink-2)',fontWeight:600}},
        !step1Complete?'Стъпка 1: попълнете основните данни':
        !step2Complete?'Стъпка 2: проверете документите':
        !step3Complete?'Стъпка 3: прегледайте бюджета':
        e(Fragment,null,e('i',{className:'fas fa-check-circle',style:{marginRight:'.25rem'}}),'Готово — запазете промените!')
      )
    ),
    e('div',{className:'modal-body',style:{overflowY:'auto'}},
      // ═══ STEP 1: Основни данни ═══
      wizardStep===1&&e('div',{className:'form-layout-grid'},
        e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.25rem',paddingBottom:'.4rem',borderBottom:'2px solid var(--primary)'}},
          e('div',{style:{fontWeight:700,fontSize:'.85rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:'.4rem'}},
            e('i',{className:'fas fa-file-alt',style:{fontSize:'.75rem'}}),
            'Основни данни за проектното предложение')),
        e('div',{className:'form-field'},e('label',null,'Конкурсна сесия'),e('select',{name:'competitionId',value:formValues.competitionId,onChange:handleChange,disabled:compsLoading},compsLoading?e('option',{value:''},'Зареждане...'):availableCompetitions.map(c=>e('option',{key:c.id,value:c.id},c.name)))),
        e('div',{className:'form-field '+(errors.area?'error':'')},e('label',null,'Приоритетно направление *'),e('select',{name:'area',value:formValues.area,onChange:handleChange},e('option',{value:'',disabled:true},'— изберете —'),PRIORITY_AREAS.map(a=>e('option',{key:a,value:a},a))),e(ErrMsg,{field:'area'})),
        e('div',{className:'form-field span2'},e('label',null,'Професионално направление *'),e(MultiSelect,{options:PROFESSIONAL_FIELDS,value:selectedProfFieldsEf,onChange:handleProfFieldChangeEf,placeholder:'— изберете направление/я —',name:'professionalField',disabled:false}),selectedProfFieldsEf.length>0&&e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.15rem',display:'flex',flexWrap:'wrap',gap:'.2rem'}},selectedProfFieldsEf.map(function(v){var _pf=PROFESSIONAL_FIELDS.find(function(p){return p.value===v;});return e('span',{key:v,style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill)',padding:'.08rem .45rem',fontSize:'.62rem',whiteSpace:'nowrap'}},_pf?_pf.label:v);})),e(ErrMsg,{field:'professionalField'})),
        e('div',{className:'form-field span2'},e('label',null,'Наименование *'),e('input',{name:'title',value:formValues.title,onChange:handleChange})),
        e('div',{className:'form-field span2'},e('label',null,'Наименование (EN)'),e('input',{name:'titleEn',value:formValues.titleEn||'',onChange:handleChange,placeholder:'Project title...'})),
        e('div',{className:'form-field'},e('label',null,'Акроним'),e('input',{name:'acronym',value:formValues.acronym||'',onChange:handleAcronymChange,placeholder:'Напр. ERP2026',maxLength:10})),
        e('div',{className:'form-field'},e('label',null,'Срок (месеци)'),e('input',{type:'number',min:12,max:60,name:'durationMonths',value:formValues.durationMonths,onChange:handleChange})),
        e('div',{className:'form-field span2 '+(errors.description?'error':'')},e('label',null,'Кратко описание *'),e('textarea',{name:'description',value:formValues.description,onChange:handleChange,rows:4}),e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'.1rem'}},e('span',{style:{fontSize:'.62rem',color:'var(--ink-4)'}},'Максимум 200 думи'),(function(){var _wc=(formValues.description||'').trim().split(/\s+/).filter(Boolean).length;return e('span',{style:{fontSize:'.62rem',fontWeight:700,color:_wc>200?'var(--err)':_wc>170?'var(--warn)':'var(--ink-4)'}},_wc+'/200');}())),e(ErrMsg,{field:'description'})),
        e('div',{className:'form-field span2'},e('label',null,'Описание (EN)'),e('textarea',{name:'descriptionEn',value:formValues.descriptionEn||'',onChange:handleChange,rows:4})),
        e('div',{className:'form-field span2'},e('label',null,'Цел/и'),e('textarea',{name:'objectives',value:formValues.objectives,onChange:handleChange,rows:2})),
        e('div',{className:'form-field span2'},e('label',null,'Очаквани резултати'),e('textarea',{name:'expectedResults',value:formValues.expectedResults,onChange:handleChange,rows:2})),
        (typeof TeamMembersEditor==='function')&&e('div',{className:'form-field span2'},e(TeamMembersEditor,{value:teamMembers,onChange:setTeamMembers,leaderEmail:String(form?.userEmail||user?.email||''),leaderName:String(form?.userName||user?.name||''),projectCode:String(form?.projectCode||''),competitionId:formValues.competitionId,formId:String(form?.id||'')}))
      ),
      // ═══ STEP 2: Документи ═══
      wizardStep===2&&(editingDoc
        // ── Inline editor mode ──
        ? e('div',{className:'form-layout-grid',style:{height:'100%',display:'flex',flexDirection:'column'}},
            e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.25rem',paddingBottom:'.4rem',borderBottom:'2px solid var(--gold)',flexShrink:0}},
              e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem'}},
                e('button',{type:'button',className:'btn btn-ghost btn-sm',onClick:function(){setEditingDoc(null);},style:{fontSize:'.72rem',padding:'.2rem .5rem'}},
                  e('i',{className:'fas fa-arrow-left',style:{marginRight:'.25rem'}}),'Назад към документите'),
                e('i',{className:'fas fa-file-edit',style:{color:'var(--gold)',fontSize:'.9rem'}}),
                e('span',{style:{fontWeight:700,fontSize:'.82rem',color:'var(--primary)'}},editingDoc.name||'Документ')
              )
            ),
            e('div',{style:{flex:1,overflow:'hidden',minHeight:0}},
              e(InlineDocEditorModal,{doc:editingDoc,formId:getId(form),inline:true,defaultEditMode:true,
                onClose:function(){setEditingDoc(null);},
                onSaved:function(updatedDoc){
                  if(updatedDoc){
                    setAttachedDocs(function(prev){
                      var next=prev.map(function(d){return d.id===updatedDoc.id?Object.assign({},d,updatedDoc):d;});
                      var _fid=getId(form);
                      if(_fid){mutateApi('updateForm',{id:_fid,updates:{attachedDocs:next.map(_serializeDoc)}},{invalidates:['getforms','getinitialdata']}).catch(function(){});}
                      return next;
                    });
                  }
                  setEditingDoc(null);
                }
              })
            )
          )
        // ── Document checklist mode ──
        : e('div',{className:'form-layout-grid'},
        e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.25rem',paddingBottom:'.4rem',borderBottom:'2px solid var(--primary)'}},
          e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem'}},
            e('div',{style:{fontWeight:700,fontSize:'.85rem',color:'var(--primary)',display:'flex',alignItems:'center',gap:'.4rem'}},
              e('i',{className:'fas fa-paperclip',style:{fontSize:'.75rem'}}),
              'Документи към проектното предложение'),
            attachedDocs.length>0&&e('span',{style:{fontSize:'.65rem',background:'var(--ok-bg)',color:'var(--ok)',padding:'.1rem .5rem',borderRadius:10,fontWeight:600}},attachedDocs.length+' прикачени')
          )
        ),
        // ── Compact doc preview cards ──
        attachedDocs.length>0&&e('div',{className:'form-field span2',style:{gridColumn:'1/-1'}},
          e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.35rem'}},
            attachedDocs.map(function(d){
              var vis=(typeof getDocVisuals==='function')?getDocVisuals(d):{icon:'fa-file',label:'Документ'};
              return e('span',{key:d.id,style:{display:'inline-flex',alignItems:'center',gap:'.3rem',padding:'.3rem .55rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill,6px)',cursor:'pointer',fontSize:'.7rem',color:'var(--ink-2)',transition:'all .15s',boxShadow:'0 1px 3px rgba(0,0,0,.06)'},title:'Редактирай '+(d.name||'документ'),onClick:function(ev){ev.stopPropagation();setEditingDoc(d);}},
                e('i',{className:'fas '+vis.icon,style:{fontSize:'.62rem',color:'var(--gold)'}}),
                e('span',{style:{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(d.name||'').slice(0,30)),
                e('i',{className:'fas fa-edit',style:{fontSize:'.55rem',color:'var(--ink-4)',marginLeft:'.15rem'}})
              );
            })
          )
        ),
        // ── Self-assessment score ───
        e('div',{className:'form-field span2',style:{gridColumn:'1/-1'}},
          e('label',null,e('i',{className:'fas fa-book',style:{marginRight:'.3rem',color:'var(--gold)'}}),'Прикачени документи'),
          e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.3rem',marginBottom:'.5rem'}},
          attachedDocs.length>0?attachedDocs.map(function(d){
            var _did = d.driveId || d.fileId || d.id || '';
            var _canEdit = _did && !/^(s_|doc_|up_|f_|copied_)/.test(_did);
            return e('span',{key:d.id,className:'attached-doc-chip'},
              e('i',{className:'fas fa-file',style:{fontSize:'.62rem'}}),
              (d.name||'').slice(0,28),
              _canEdit&&e('button',{type:'button',style:{background:'none',border:'none',color:'var(--primary)',cursor:'pointer',marginLeft:'.2rem',padding:0,lineHeight:1,fontSize:'.6rem',fontWeight:600},title:'Редактирай',onClick:function(ev){ev.stopPropagation();setEditingDoc(d);}},e('i',{className:'fas fa-edit'})),
              e('button',{className:'remove-attached',type:'button',onClick:function(){setAttachedDocs(function(p){var next=p.filter(function(x){return x.id!==d.id;});var fid=getId(form);if(fid){mutateApi('updateForm',{id:fid,updates:{attachedDocs:next.map(function(dd){return _serializeDoc(dd);})}},{invalidates:['getforms','getinitialdata']}).catch(function(){});}return next;});}},'✕')
            );
          }):e('span',{style:{fontSize:'.75rem',color:'var(--ink-4)',fontStyle:'italic'}},'Няма прикачени документи')
          ),
          e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',marginTop:'.3rem'}},
            e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){setShowPicker(true)}},e('i',{className:'fas fa-folder-open'}),' От библиотеката'),
            e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:function(){efFileRef.current&&efFileRef.current.click()}},e('i',{className:'fas fa-cloud-upload-alt'}),' Качи файл')
          )
        ),
        // ── Uploaded files (new) ──
        newFiles.length>0&&e('div',{className:'form-field span2',style:{gridColumn:'1/-1'}},
          e('label',null,'Новокачени файлове'),
          e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.3rem'}},newFiles.map(function(f,i){return e('span',{key:i,className:'file-chip'},e('i',{className:'fas fa-paperclip'}),f.name,e('button',{type:'button',style:{background:'none',border:'none',cursor:'pointer',color:'var(--err)',marginLeft:'.28rem',padding:0,lineHeight:1},onClick:function(){setNewFiles(function(p){return p.filter(function(_,j){return j!==i;});});}},'✕'));}))
        ),
        // ── Drop zone ──
        e('div',{className:'form-field span2',style:{gridColumn:'1/-1'}},
          e('div',{className:'upload-dropzone'+(draggingEf?' dragover':''),style:{cursor:'pointer'},onDragOver:function(ev){ev.preventDefault();setDraggingEf(true);},onDragLeave:function(ev){ev.preventDefault();setDraggingEf(false);},onDrop:handleDropEf,onClick:function(){efFileRef.current&&efFileRef.current.click();}},
            e('input',{ref:efFileRef,type:'file',multiple:true,accept:'.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',onChange:handleFiles,style:{display:'none'}}),
            e('i',{className:'fas fa-cloud-upload-alt upload-dropzone-icon'}),
            e('span',null,draggingEf?'Пуснете файловете тук':'Плъзнете файлове тук или ',draggingEf?null:e('u',null,'изберете от устройство'))
          )
        ),
        // ═══ НЕОБХОДИМИ ДОКУМЕНТИ ПО ТИП ПРОЕКТ (live prefetched) ═══
        formValues.projectType && (function(){
          var required = (typeof getRequiredDocuments==='function') ? getRequiredDocuments(formValues.projectType) : [];
          if (!required.length) return null;
          var status = (typeof checkRequiredDocsStatus==='function')
              ? checkRequiredDocsStatus(formValues.projectType, attachedDocs, [])
              : { total: required.length, fulfilled: 0, missing: required };
          // ── Budget spreadsheet checklist item ──
          var budgetTpl = (typeof getBudgetTemplate==='function') ? getBudgetTemplate(formValues.projectType) : null;
          var budgetDoc = null;
          if (budgetTpl) {
              for (var _bi=0; _bi<attachedDocs.length; _bi++) {
                  var _bd = attachedDocs[_bi];
                  if (_bd && (_bd.docType==='budget' || _bd._budget)) { budgetDoc = _bd; break; }
              }
          }
          var budgetDone = !!budgetDoc;
          var extraTotal = budgetTpl ? 1 : 0;
          var extraDone = budgetDone ? 1 : 0;
          var dispFulfilled = status.fulfilled + extraDone;
          var dispTotal = status.total + extraTotal;
          var allDone = dispFulfilled >= dispTotal;
          // ── Generate document handler ──
          var handleGenerateDoc = typeof generateApplicationDocument==='function' ? async function(docType,silent){
              if(generatingDoc[docType])return;
              if(!silent&&typeof toast==='function')toast('Генериране на документ…','info',3000);
              var liveType = String(formValues.projectType||'').trim().toUpperCase();
              if(!liveType){toast('Моля, изберете тип проект преди да генерирате документ.','warn',4000);return;}
              var fid = getId(form);
              if(!fid){toast('Не може да се генерира — липсва ID на формуляра.','error',6000);return;}
              setGeneratingDoc(function(p){var n={};n[docType]=true;return n;});
              generateApplicationDocument(fid, docType, liveType, {
                  title: formValues.title, titleEn: formValues.titleEn, acronym: formValues.acronym,
                  description: formValues.description, descriptionEn: formValues.descriptionEn,
                  objectives: formValues.objectives, expectedResults: formValues.expectedResults,
                  area: formValues.area, professionalField: formValues.professionalField,
                  durationMonths: formValues.durationMonths, applicantName: user&&user.name,
                  teamMembers: teamMembers
              }).then(function(res){
                  if(res&&res.success){
                      var generatedFile = res.applicantFile || res.file;
                      var editLink = res.googleDocEditLink || (generatedFile&&generatedFile.id?'https://docs.google.com/document/d/'+encodeURIComponent(generatedFile.id)+'/edit':'');
                      var docObj = {id:generatedFile.id,driveId:generatedFile.driveId||generatedFile.id,name:generatedFile.name,mimeType:generatedFile.mimeType,previewLink:generatedFile.previewLink||(generatedFile.id?'https://docs.google.com/document/d/'+encodeURIComponent(generatedFile.id)+'/preview':''),downloadUrl:generatedFile.downloadUrl,folderName:generatedFile.folderName||'',googleDocEditLink:editLink,_generated:true,docType:docType};
                      if(generatedFile){setAttachedDocs(function(prev){var _pg=prev.filter(function(d){return!(d._pregenerated&&d.docType===docObj.docType);});if(_pg.some(function(d){return d.id===generatedFile.id;}))return _pg;return _pg.concat([docObj]);});}
                      toast('Документът е генериран! Отваряне на редактора…','success',2500);
                      try{if(typeof setEditingDoc==='function')setEditingDoc(docObj);}catch(_){}
                      try{trackGenResult(docType,{success:true,file:generatedFile||null});}catch(_){}
                  } else {
                      var _errMsg=(res&&res.error)||'Грешка при генериране на документа.';
                      if(res&&res.missingTemplate){
                        _errMsg='Шаблонът „'+res.missingTemplate+'“ не е намерен в библиотеката. Свържете се с администратор.';
                      }
                      toast(_errMsg,'error',6000);
                      try{trackGenResult(docType,{success:false,error:_errMsg});}catch(_){}
                  }
              }).catch(function(err){try{trackGenResult(docType,{success:false,error:err.message||'Грешка при свързване'});}catch(_){}toast(err.message||'Грешка при свързване.','error',6000);}).finally(function(){setGeneratingDoc(function(p){var n=Object.assign({},p);delete n[docType];return n;});});
          } : null;
          // ── Unified document generation handler (v10.6.0-unified) ──
          var handleGenerateUnified = typeof generateUnifiedApplicationDocument==='function' ? async function(){
              if(generatingDoc['unified'])return;
              var liveType = String(formValues.projectType||'').trim().toUpperCase();
              if(!liveType){toast('Моля, изберете тип проект преди да генерирате документа.','warn',4000);return;}
              var fid = getId(form);
              if(!fid){toast('Не може да се генерира — липсва ID на формуляра.','error',6000);return;}
              setGeneratingDoc(function(p){var n=Object.assign({},p);n.unified=true;return n;});
              generateUnifiedApplicationDocument(fid, liveType, budget, {
                  title: formValues.title, titleEn: formValues.titleEn, acronym: formValues.acronym,
                  description: formValues.description, descriptionEn: formValues.descriptionEn,
                  objectives: formValues.objectives, expectedResults: formValues.expectedResults,
                  area: formValues.area, professionalField: formValues.professionalField,
                  durationMonths: formValues.durationMonths, applicantName: user&&user.name,
                  teamMembers: teamMembers
              }).then(function(res){
                  if(res&&res.success){
                      var gf = res.applicantFile || res.file || {};
                      var editLink = res.googleDocEditLink || (gf.id?'https://docs.google.com/document/d/'+encodeURIComponent(gf.id)+'/edit':'');
                      var docObj = {id:gf.id,driveId:gf.driveId||gf.id,name:gf.name||'Комплексно заявление',mimeType:gf.mimeType,previewLink:gf.previewLink||(gf.id?'https://docs.google.com/document/d/'+encodeURIComponent(gf.id)+'/preview':''),downloadUrl:gf.downloadUrl,folderName:gf.folderName||'',googleDocEditLink:editLink,_generated:true,docType:'unified',projectCode:liveType,budgetEUR:res.budgetSummary?.totalEUR,budgetBGN:res.budgetSummary?.totalBGN};
                      setAttachedDocs(function(prev){var _pg=prev.filter(function(d){return!(d._pregenerated&&d.docType===docObj.docType);});if(_pg.some(function(d){return d.id===gf.id;}))return _pg;return _pg.concat([docObj]);});
                      toast((res.message||'Комплексното заявление е генерирано!')+' Отваряне на редактора…','success',3000);
                      try{if(typeof setEditingDoc==='function')setEditingDoc(docObj);}catch(_){}
                      try{trackGenResult('unified',{success:true,file:gf||null,budget:res.budgetSummary});}catch(_){}
                  } else {
                      toast((res&&res.error)||'Грешка при генериране на комплексното заявление.','error',6000);
                      try{trackGenResult('unified',{success:false,error:(res&&res.error)||'unknown'});}catch(_){}
                  }
              }).catch(function(err){try{trackGenResult('unified',{success:false,error:err.message||'Грешка при свързване'});}catch(_){}toast(err.message||'Грешка при свързване.','error',6000);}).finally(function(){setGeneratingDoc(function(p){var n=Object.assign({},p);delete n.unified;return n;});});
          } : null;
          // ── Delete attached document handler ──
          var handleDeleteAttachedDoc = async function(docToDelete){
            if(!docToDelete||!docToDelete.id)return;
            var docName = docToDelete.name||'документа';
            if(typeof window!=='undefined'&&window.confirm&&!window.confirm('Сигурни ли сте, че искате да изтриете „'+docName+'"?\n\nДокументът ще бъде премахнат от заявлението и изтрит от Drive. Това действие е необратимо.'))return;
            setDeletingAttachedDoc(docToDelete.id);
            setAttachedDocs(function(prev){return prev.filter(function(d){return d.id!==docToDelete.id;});});
            try {
              var fid = getId(form);
              var delPayload = {docId:docToDelete.id};
              if(fid) delPayload.formId = fid;
              await api("sqldetachdocument",{docId:docToDelete.id, formId:fid||""});
              toast('Документът е изтрит.','success');
            } catch(err){
              toast('Грешка при изтриване: '+(err&&err.message||''),'error');
              setAttachedDocs(function(prev){return prev.concat([docToDelete]);});
            } finally {
              setDeletingAttachedDoc(null);
            }
          };
          // ── Budget spreadsheet generate handler ──
          var handleGenerateBudget = (typeof generateBudgetSpreadsheet==='function' && budgetTpl) ? async function(){
              if(generatingDoc['budget'])return;
              var liveType = String(formValues.projectType||'').trim().toUpperCase();
              if(!liveType){toast('Моля, изберете тип проект преди да генерирате таблицата.','warn',4000);return;}
              var fid = getId(form);
              if(!fid){toast('Не може да се генерира — липсва ID на формуляра.','error',6000);return;}
              setGeneratingDoc(function(p){var n=Object.assign({},p);n.budget=true;return n;});
              generateBudgetSpreadsheet(fid, liveType, budget, {
                  acronym: formValues.acronym,
                  projectTitle: formValues.title,
                  applicantName: user&&user.name
              }).then(function(res){
                  if(res&&res.success){
                      var gf = res.applicantFile || res.file || {};
                      var link = res.googleSheetEditLink || res.googleDocEditLink || (gf.id?'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(gf.id)+'/edit':'') || '';
                      var _budgetName=(budgetTpl&&budgetTpl.label)||('Бюджетна таблица — '+liveType);
                      var docObj = {id:gf.id,driveId:gf.driveId||gf.id,name:gf.name||_budgetName,mimeType:gf.mimeType,typeLabel:gf.typeLabel,previewLink:gf.previewLink,downloadUrl:gf.downloadUrl,folderName:gf.folderName||'Моите документи',googleSheetEditLink:link,googleDocEditLink:link,editLink:link,_generated:true,_budget:true,docType:'budget'};
                      setAttachedDocs(function(prev){var rest=prev.filter(function(d){return!(d&&(d.docType==='budget'||d._budget));});return rest.concat([docObj]);});
                      try{window.dispatchEvent(new CustomEvent('erp:mydocAdded',{detail:docObj}));}catch(_){}
                      toast((res.message||'Бюджетната таблица е готова')+' Отваряне на редактора…','success',2500);
                      try{if(typeof setEditingDoc==='function')setEditingDoc(docObj);}catch(_){}
                      try{trackGenResult('budget',{success:true,file:gf||null});}catch(_){}
                  } else {
                      toast((res&&res.error)||'Грешка при генериране на бюджетната таблица.','error',6000);
                      try{trackGenResult('budget',{success:false,error:(res&&res.error)||'Грешка'});}catch(_){}
                  }
              }).catch(function(err){try{trackGenResult('budget',{success:false,error:err.message||'Грешка'});}catch(_){}toast(err.message||'Грешка при свързване.','error',6000);}).finally(function(){
                  setGeneratingDoc(function(p){var n=Object.assign({},p);delete n.budget;return n;});
              });
          } : null;
          return e('div',{className:'form-field span2',style:{gridColumn:'1/-1',borderTop:'2px solid var(--primary)',paddingTop:'.8rem',marginTop:'.6rem'}},
            e('div',{className:'wizard-docs-checklist',style:{marginTop:'.25rem'}},
              e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'.4rem',marginBottom:'.6rem'}},
                e('div',{style:{fontWeight:700,fontSize:'.8rem',color:allDone?'var(--ok)':'var(--gold)',display:'flex',alignItems:'center',gap:'.35rem'}},
                  e('i',{className:'fas '+(allDone?'fa-check-circle':'fa-clipboard-list'),style:{fontSize:'.78rem'}}),
                  'Необходими документи — '+formValues.projectType),
                e('span',{style:{fontSize:'.65rem',fontWeight:700,padding:'.15rem .55rem',borderRadius:12,background:allDone?'var(--ok-bg)':'var(--warn-bg)',color:allDone?'var(--ok)':'var(--warn)',border:'1px solid '+(allDone?'var(--ok-border)':'var(--warn-border)')}},
                  dispFulfilled+' / '+dispTotal+' готови')
              ),
              !allDone && e('div',{style:{marginBottom:'.6rem',padding:'.5rem .7rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:6,fontSize:'.68rem',color:'var(--info-dark)',display:'flex',alignItems:'flex-start',gap:'.45rem'}},
                e('i',{className:'fas fa-info-circle',style:{fontSize:'.7rem',marginTop:'.05rem',flexShrink:0,color:'var(--info)'}}),
                e('div',null,
                  e('span',{style:{fontWeight:700}},'Стъпки: '),
                  '1. Документите се генерират автоматично → ',
                  '2. Натиснете ',e('strong',{style:{color:'var(--gold)'}},"„Редактирай”"),' за да отворите редактора → ',
                  '3. Върнете се тук и продължете.'
                )
              ),
              // ── Unified document button (v10.6.0-unified) ──
              e('div',{style:{marginBottom:'.5rem',padding:'.5rem .65rem',background:'var(--surface)',border:'2px solid var(--primary)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between',gap:'.5rem',flexWrap:'wrap'}},
                e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem',fontSize:'.7rem',fontWeight:600,color:'var(--primary)'}},
                  e('i',{className:'fas fa-file-alt',style:{fontSize:'.75rem'}}),
                  'Комплексно заявление (унифициран документ)'
                ),
                handleGenerateUnified
                  ? (generatingDoc['unified']
                      ? e('span',{style:{fontSize:'.64rem',color:'var(--primary)',fontWeight:600,display:'inline-flex',alignItems:'center',gap:'.25rem'}},
                          e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'.55rem'}}),
                          'Генериране…')
                      : (attachedDocs.some(function(d){return d._generated&&d.docType==='unified';})
                          ? e('div',{style:{display:'flex',gap:'.25rem',alignItems:'center'}},
                              e('button',{type:'button',className:'btn btn-sm',
                                style:{fontSize:'.68rem',padding:'.28rem .7rem',fontWeight:700,background:'var(--gold)',color:'#fff',border:'none',borderRadius:5,boxShadow:'0 1px 4px rgba(0,0,0,.18)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'.3rem'},
                                title:'Редактирай комплексното заявление',
                                onClick:function(ev){ev.stopPropagation();var _d=attachedDocs.find(function(d){return d._generated&&d.docType==='unified';});if(_d)try{setEditingDoc(_d);}catch(_){}}
                              },
                                e('i',{className:'fas fa-edit',style:{fontSize:'.62rem'}}),
                                'Редактирай'
                              ),
                              e('button',{type:'button',className:'btn btn-sm btn-outline',
                                style:{fontSize:'.62rem',padding:'.18rem .45rem',color:'var(--ink-3)'},
                                title:'Генерирай отново с актуалните данни',
                                disabled:generatingDoc['unified'],
                                onClick:function(ev){ev.stopPropagation();handleGenerateUnified();}
                              },
                                e('i',{className:'fas fa-redo',style:{marginRight:'.2rem'}}),
                                'Обнови'
                              ),
                              e('button',{type:'button',className:'btn btn-sm btn-outline',
                                style:{fontSize:'.62rem',padding:'.18rem .45rem',color:'var(--err)'},
                                title:'Изтрий комплексното заявление',
                                onClick:function(ev){ev.stopPropagation();var _d=attachedDocs.find(function(d){return d._generated&&d.docType==='unified';});if(_d)handleDeleteAttachedDoc(_d);}
                              },
                                e('i',{className:'fas fa-trash',style:{fontSize:'.55rem'}})
                              )
                          )
                          : e('button',{type:'button',className:'btn btn-sm',
                              style:{fontSize:'.68rem',padding:'.28rem .7rem',fontWeight:700,background:'var(--primary)',color:'#fff',border:'none',borderRadius:5,boxShadow:'0 1px 4px rgba(0,0,0,.18)',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'.3rem'},
                              title:'Генерирай комплексно заявление (официален шаблон + бюджет + екип)',
                              disabled:generatingDoc['unified'],
                              onClick:function(ev){ev.stopPropagation();handleGenerateUnified();}
                            },
                              e('i',{className:'fas fa-magic',style:{fontSize:'.62rem'}}),
                              generatingDoc['unified']?'Генериране…':'Генерирай'
                          ))
                  )
                  : null
              ),
              e('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:'.5rem'},role:'list'},
                required.map(function(doc){
                  var isDone = !status.missing.some(function(m){return m.id===doc.id;});
                  var isGenerating = generatingDoc[doc.id];
                  var tplKey = String(formValues.projectType||'').toUpperCase()+':'+doc.id;
                  var tplInfo = tplAvailability[tplKey];
                  // v10.11.0: Fallback to aliased backend key if direct lookup fails
                  if(!tplInfo&&typeof resolveDocTypeAlias==='function'){
                    var _aliasId=resolveDocTypeAlias(doc.id);
                    if(_aliasId!==doc.id)tplInfo=tplAvailability[String(formValues.projectType||'').toUpperCase()+':'+_aliasId];
                  }
                  var tplMissing = tplInfo && tplInfo.resolved===false;
                  var docIdLc = String(doc.id||'').toLowerCase();
                  var tplSlug = String(doc.templateName||'').toLowerCase().replace('.docx','').replace('.xlsx','').slice(0,10);
                  var existingGenerated = null;
                  try {
                    for (var _di=0; _di<attachedDocs.length; _di++) {
                      var _ad = attachedDocs[_di];
                      if (!_ad) continue;
                      var _nm = String(_ad.name||'').toLowerCase();
                      var _match = (_ad._generated && docIdLc && _nm.indexOf(docIdLc+'_')===0)
                                || (docIdLc && _nm.indexOf(docIdLc) >= 0)
                                || (tplSlug && _nm.indexOf(tplSlug) >= 0);
                      if (_match) { existingGenerated = _ad; break; }
                    }
                  } catch(_) {}
                  var hasGenerated = !!existingGenerated;
                  var editLink = existingGenerated && (existingGenerated.googleDocEditLink||existingGenerated.previewLink);
                  var _isEditingThis = editingDoc && editingDoc.id === (existingGenerated||{}).id;
                  return e('div',{
                      key:doc.id,
                      role:'listitem',
                      style:{
                          border:'1px solid '+(isDone?'var(--ok-border)':'var(--border)'),
                          borderRadius:8,
                          padding:'.45rem .6rem',
                          background:isDone?'var(--ok-bg)':'var(--surface)',
                          display:'flex',
                          flexDirection:'column',
                          gap:'.25rem',
                          cursor:hasGenerated?'pointer':'default',
                          transition:'all .2s ease, box-shadow .2s ease',
                          boxShadow:(_isEditingThis?'0 0 0 2px var(--gold)':'none')
                      },
                      onClick:function(ev){if(hasGenerated&&existingGenerated&&!ev.defaultPrevented&&!ev.target.closest('button')){try{setEditingDoc(existingGenerated);}catch(_){}}}
                  },
                    e('div',{style:{display:'flex',alignItems:'flex-start',gap:'.35rem'}},
                      isGenerating
                          ? e('i',{className:'fas fa-spinner fa-spin',style:{color:'var(--gold)',fontSize:'1.05rem',flexShrink:0,marginTop:'.05rem'}})
                          : isDone
                              ? e('i',{className:'fas fa-check-circle',style:{color:'var(--ok)',fontSize:'1.05rem',flexShrink:0,marginTop:'.05rem'}})
                              : e('i',{className:'far fa-circle',style:{color:'var(--ink-4)',fontSize:'1.05rem',flexShrink:0,marginTop:'.05rem'}}),
                      e('div',{style:{flex:1,minWidth:0}},
                        e('div',{style:{fontWeight:700,fontSize:'.76rem',color:isDone?'var(--ok)':'var(--ink)',lineHeight:1.3,display:'flex',alignItems:'center',gap:'.3rem',flexWrap:'wrap'}},
                          doc.label,
                          doc.required&&!isDone && e('span',{style:{color:'var(--err)'}},'*'),
                          tplMissing&&!hasGenerated && e('span',{style:{fontSize:'.57rem',background:'var(--warn-bg)',color:'var(--warn)',padding:'.05rem .3rem',borderRadius:8,fontWeight:600}},
                            e('i',{className:'fas fa-exclamation-triangle',style:{marginRight:'.15rem'}}),'шаблон липсва')
                        ),
                        e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.06rem'}},
                          doc.description,' — ',
                          e('code',{style:{fontSize:'.58rem',background:'var(--bg)',padding:'.02rem .22rem',borderRadius:2}},doc.templateName)
                        )
                      )
                    ),
                    handleGenerateDoc && e('div',{style:{display:'flex',gap:'.25rem',flexWrap:'wrap',alignItems:'center'}},
                      hasGenerated
                          ? e(Fragment,null,
                              e('button',{
                                  type:'button',
                                  className:'btn btn-sm',
                                  style:{fontSize:'.68rem',padding:'.28rem .7rem',fontWeight:700,
                                      background:'var(--gold)',color:'#fff',border:'none',
                                      borderRadius:5,boxShadow:'0 1px 4px rgba(0,0,0,.18)',
                                      cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'.3rem'},
                                  title:'Редактирай документа',
                                  onClick:function(ev){ev.stopPropagation();try{setEditingDoc(existingGenerated);}catch(_){}}
                              },
                                e('i',{className:'fas fa-edit',style:{fontSize:'.62rem'}}),
                                'Редактирай'
                              ),
                              e('button',{
                                  type:'button',
                                  className:'btn btn-sm btn-outline',
                                  style:{fontSize:'.62rem',padding:'.18rem .45rem',color:'var(--ink-3)'},
                                  title:'Генерирай ново копие (презапише старото)',
                                  disabled:isGenerating,
                                  onClick:function(ev){ev.stopPropagation();handleGenerateDoc(doc.id);}
                              },
                                e('i',{className:'fas fa-redo',style:{marginRight:'.2rem'}}),
                                'Отново'
                              ),
                              e('button',{
                                  type:'button',
                                  className:'btn btn-sm btn-outline',
                                  style:{fontSize:'.62rem',padding:'.18rem .45rem',color:'var(--err)',borderColor:'var(--err-border)'},
                                  title:'Изтрий документа от заявлението и Drive',
                                  disabled:deletingAttachedDoc===existingGenerated.id,
                                  onClick:function(ev){ev.stopPropagation();handleDeleteAttachedDoc(existingGenerated);}
                              },
                                deletingAttachedDoc===existingGenerated.id
                                  ? e('i',{className:'fas fa-spinner fa-spin',style:{marginRight:'.2rem'}})
                                  : e('i',{className:'fas fa-trash',style:{marginRight:'.2rem'}}),
                                deletingAttachedDoc===existingGenerated.id?'Изтриване…':'Изтрий'
                              )
                            )
                          : tplMissing
                            ? e('span',{style:{fontSize:'.64rem',color:'var(--warn)',fontWeight:600,display:'inline-flex',alignItems:'center',gap:'.25rem'}},
                                e('i',{className:'fas fa-exclamation-triangle',style:{fontSize:'.55rem'}}),
                                'Шаблонът не е намерен — свържете се с администратор')
                            : isGenerating
                              ? e('span',{style:{fontSize:'.64rem',color:'var(--primary)',fontWeight:600,display:'inline-flex',alignItems:'center',gap:'.25rem'}},
                                  e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'.55rem'}}),
                                  'Автоматично генериране…')
                              : null
                    )
                  );
                }),
                budgetTpl && handleGenerateBudget && (function(){
                  var isGen = !!generatingDoc['budget'];
                  var link = budgetDoc && (budgetDoc.googleSheetEditLink||budgetDoc.googleDocEditLink||budgetDoc.editLink||budgetDoc.previewLink);
                  return e('div',{
                      key:'__budget__',
                      role:'listitem',
                      style:{
                          border:'1px solid '+(budgetDone?'var(--ok-border)':'var(--gold-border)'),
                          borderRadius:8,
                          padding:'.6rem .75rem',
                          background:budgetDone?'var(--ok-bg)':'var(--gold-glow)',
                          display:'flex',flexDirection:'column',gap:'.35rem'
                      }
                  },
                    e('div',{style:{display:'flex',alignItems:'flex-start',gap:'.45rem'}},
                      isGen
                          ? e('i',{className:'fas fa-spinner fa-spin',style:{color:'var(--gold)',fontSize:'1.05rem',flexShrink:0,marginTop:'.05rem'}})
                          : budgetDone
                              ? e('i',{className:'fas fa-check-circle',style:{color:'var(--ok)',fontSize:'1.05rem',flexShrink:0,marginTop:'.05rem'}})
                              : e('i',{className:'far fa-circle',style:{color:'var(--ink-4)',fontSize:'1.05rem',flexShrink:0,marginTop:'.05rem'}}),
                      e('div',{style:{flex:1,minWidth:0}},
                        e('div',{style:{fontWeight:700,fontSize:'.76rem',color:budgetDone?'var(--ok)':'var(--ink)',lineHeight:1.3,display:'flex',alignItems:'center',gap:'.3rem',flexWrap:'wrap'}},
                          e('i',{className:'fas fa-file-excel',style:{color:'var(--ok)',fontSize:'.72rem'}}),
                          'Бюджетна таблица',
                          !budgetDone && e('span',{style:{color:'var(--err)'}},'*')
                        ),
                        e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.06rem'}},
                          'Официалната бюджетна таблица за „'+formValues.projectType+'". Сумите от Раздел 3 (Бюджет) се попълват автоматично. — ',
                          e('code',{style:{fontSize:'.58rem',background:'var(--bg)',padding:'.02rem .22rem',borderRadius:2}},budgetTpl.label||('Бюджет — '+formValues.projectType))
                        )
                      )
                    ),
                    e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',alignItems:'center'}},
                      budgetDone
                          ? e(Fragment,null,
                              e('button',{
                                  type:'button',className:'btn btn-sm',
                                  style:{fontSize:'.68rem',padding:'.28rem .7rem',fontWeight:700,
                                      background:'var(--gold)',color:'#fff',border:'none',
                                      borderRadius:5,boxShadow:'0 1px 4px rgba(0,0,0,.18)',
                                      cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'.3rem'},
                                  title:'Редактирай таблицата',
                                  onClick:function(ev){ev.stopPropagation();try{setEditingDoc(budgetDoc);}catch(_){}}
                              },
                                e('i',{className:'fas fa-edit',style:{fontSize:'.62rem'}}),
                                'Редактирай'
                              ),
                              link && e('a',{
                                  href:link,target:'_blank',rel:'noopener noreferrer',
                                  className:'btn btn-sm btn-outline',
                                  style:{fontSize:'.62rem',padding:'.18rem .45rem',display:'inline-flex',alignItems:'center',gap:'.2rem'},
                                  title:'Отвори за редакция в Google Sheets (нов раздел)'
                              },
                                e('i',{className:'fas fa-external-link-alt',style:{fontSize:'.55rem'}}),
                                'Google Sheets'
                              ),
                              e('button',{
                                  type:'button',className:'btn btn-sm btn-outline',
                                  style:{fontSize:'.62rem',padding:'.18rem .45rem',color:'var(--ink-3)'},
                                  title:'Генерирай ново копие с актуалните суми (презапише старото)',
                                  disabled:isGen,
                                  onClick:function(ev){ev.stopPropagation();handleGenerateBudget();}
                              }, e('i',{className:'fas fa-redo',style:{marginRight:'.2rem'}}),'Обнови сумите'),
                              budgetDoc && e('button',{
                                  type:'button',className:'btn btn-sm btn-outline',
                                  style:{fontSize:'.62rem',padding:'.18rem .45rem',color:'var(--err)',borderColor:'var(--err-border)'},
                                  title:'Изтрий бюджетната таблица от заявлението и Drive',
                                  disabled:deletingAttachedDoc===budgetDoc.id,
                                  onClick:function(ev){ev.stopPropagation();handleDeleteAttachedDoc(budgetDoc);}
                              },
                                deletingAttachedDoc===budgetDoc.id
                                  ? e('i',{className:'fas fa-spinner fa-spin',style:{marginRight:'.2rem'}})
                                  : e('i',{className:'fas fa-trash',style:{marginRight:'.2rem'}}),
                                deletingAttachedDoc===budgetDoc.id?'Изтриване…':'Изтрий'
                              )
                            )
                          : isGen
                            ? e('span',{style:{fontSize:'.64rem',color:'var(--primary)',fontWeight:600,display:'inline-flex',alignItems:'center',gap:'.25rem'}},
                                e('i',{className:'fas fa-spinner fa-pulse',style:{fontSize:'.55rem'}}),
                                'Автоматично генериране…')
                            : null
                    )
                  );
                })()
              )
            )
          );
        })(),
        // ─── Self-assessment score (край на раздел 2 — задължително за ФНИ/ПНИ/ДНП) ───
        (formValues.projectType==='ФНИ'||formValues.projectType==='ПНИ'||formValues.projectType==='ДНП')&&
          e('div',{className:'form-field span2 '+(errors.selfAssessmentScore?'error':''),style:{borderTop:'2px solid var(--gold)',paddingTop:'.7rem',marginTop:'.8rem'}},
            e('label',null,'Самооценка (Self-assessment)',e('span',{style:{marginLeft:'.4rem',fontSize:'.6rem',fontWeight:400,color:'var(--ink-4)',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:4,padding:'.02rem .28rem'}},'мин. 51 точки за допускане')),
            e('div',{style:{display:'flex',alignItems:'center',gap:'.6rem',flexWrap:'wrap'}},
              e('input',{type:'number',min:0,max:100,step:1,name:'selfAssessmentScore',value:formValues.selfAssessmentScore||0,onKeyDown:function(ev){var k=ev.key;if(k==='Backspace'||k==='Delete'||k==='Tab'||k==='ArrowLeft'||k==='ArrowRight'||k==='ArrowUp'||k==='ArrowDown'||k==='Home'||k==='End'||(ev.ctrlKey&&(k==='a'||k==='c'||k==='v'||k==='x')))return;if(!/^[0-9]$/.test(k)){ev.preventDefault();}},onPaste:function(ev){var cb=ev.clipboardData||window.clipboardData;if(!cb)return;var pasted=cb.getData('text')||'';if(!/^\d+$/.test(pasted.trim())){ev.preventDefault();}},onChange:function(ev){var raw=String(ev.target.value||'').replace(/[^0-9]/g,'');if(raw===''){handleChange({target:{name:'selfAssessmentScore',value:''}});return;}var n=parseInt(raw,10);if(isNaN(n))return;if(n>100)n=100;handleChange({target:{name:'selfAssessmentScore',value:String(n)}});},onBlur:function(ev){var raw=String(ev.target.value||'').replace(/[^0-9]/g,'');var n=parseInt(raw,10);if(isNaN(n))n=0;if(n<0)n=0;if(n>100)n=100;handleChange({target:{name:'selfAssessmentScore',value:String(n)}});},style:{width:100},placeholder:'0–100'}),
              Number(formValues.selfAssessmentScore)>0&&e('span',{style:{fontSize:'.72rem',fontWeight:600,color:Number(formValues.selfAssessmentScore)>=51?'var(--ok)':'var(--err)',display:'flex',alignItems:'center',gap:'.2rem'}},
                e('i',{className:Number(formValues.selfAssessmentScore)>=51?'fas fa-check-circle':'fas fa-exclamation-triangle'}),
                Number(formValues.selfAssessmentScore)>=51?' Отговаря на минималния праг (≥51)':' Под минималния праг — ще бъде отхвърлено!'
              )
            ),
            e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.15rem',display:'flex',alignItems:'flex-start',gap:'.2rem',lineHeight:1.4}},
              e('i',{className:'fas fa-info-circle',style:{color:'var(--info,var(--primary))',marginTop:'.05rem',flexShrink:0}}),
              'Самооценката трябва да е ≥ 51 точки (50%+1) за допустимост до рецензиране (Критерии, чл. 9).'
            ),
            e(ErrMsg,{field:'selfAssessmentScore'})
          )
      )),
      // ═══ STEP 3: Бюджет ═══
      wizardStep===3&&e('div',{className:'form-layout-grid'},
        e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.15rem',paddingBottom:'.4rem',borderBottom:'2px solid var(--gold)'}},
          e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap'}},
            e('div',{style:{fontWeight:700,fontSize:'.85rem',color:'var(--gold)',display:'flex',alignItems:'center',gap:'.4rem'}},
              e('i',{className:'fas fa-coins',style:{fontSize:'.75rem'}}),'Бюджет по разходни групи'),
            budgetErrors.filter(function(v){return v.severity==='high';}).length===0
              ?e('span',{style:{fontSize:'.65rem',background:'var(--ok-bg)',color:'var(--ok)',padding:'.1rem .5rem',borderRadius:10,fontWeight:600}},'✓ OK')
              :e('span',{style:{fontSize:'.65rem',background:'var(--err-bg)',color:'var(--err)',padding:'.1rem .5rem',borderRadius:10,fontWeight:600}},'✗ '+budgetErrors.filter(function(v){return v.severity==='high';}).length+' нарушения')
          )
        ),
        // ── v12.18.0: Budget Quick Panel — SVG donut + sliders/exact inputs (EditFormModal) ──
        (function(){
          var _pc=String(form&&form.projectCode||formValues.projectType||'');
          if(!_pc)return null;
          var _eur=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;
          var bgt=budget||{};
          var _dur=Math.max(1,Number(formValues.durationMonths)||12);
          var _numYears=Math.ceil(_dur/12);
          var _yearKeys=[];for(var _yi=1;_yi<=_numYears;_yi++)_yearKeys.push('y'+_yi);
          var pt=PROJECT_TYPES.find(function(p){return p.value===_pc;});
          var _maxBGN=0;
          if(pt){if(_pc==='НПФ'&&pt.npfTiers){var _tier=pt.npfTiers[form&&form.npfTier||formValues.npfTier]||pt.npfTiers.university;_maxBGN=(_tier.maxEUR||0)*_eur;}else{_maxBGN=(pt.maxBudget||0)*_eur;}}
          var _LABELS=(typeof COST_GROUP_LABEL!=='undefined')?COST_GROUP_LABEL:{};
          var _STD=['assets','materials','remuneration','services','travel','other'];
          var _allGids=[].concat(_STD);
          var _s=new Set(_allGids);Object.keys(bgt).forEach(function(gid){if(gid!=='_monthlyMode'&&gid!=='_monthly'&&!_s.has(gid)){_s.add(gid);_allGids.push(gid);}});
          _allGids=_allGids.filter(function(gid){return _LABELS[gid]||bgt[gid];});
          var _COLORS=['#3b82f6','#f59e0b','#10b981','#8b5cf6','#06b6d4','#f97316','#64748b','#ec4899'];
          var _groupTotals={};
          _allGids.forEach(function(gid){var byYear=bgt[gid]||{};var sum=0;Object.keys(byYear).forEach(function(yr){sum+=Number(byYear[yr])||0;});_groupTotals[gid]=sum;});
          var _grandTotal=Object.keys(_groupTotals).reduce(function(s,k){return s+(_groupTotals[k]||0);},0);
          function _setGroupTotal(gid,totalBGN){
            var perYear=_numYears>0?totalBGN/_numYears:totalBGN;
            setBudget(function(prev){var next=Object.assign({},prev);var byYear={};_yearKeys.forEach(function(yk){byYear[yk]=Math.round(perYear*100)/100;});next[gid]=byYear;return next;});
          }
          var _R=44,_CX=56,_CY=56,_SW=20,_C=2*Math.PI*_R;
          var _grandEUR=_grandTotal/_eur;
          var _segs=[];var _acc=0;
          _allGids.forEach(function(gid,idx){
            var t=_groupTotals[gid]||0;if(t<=0)return;
            var pct=_grandTotal>0?t/_grandTotal:0;
            _segs.push({gid:gid,pct:pct,arcLen:pct*_C,offset:_acc*_C,color:_COLORS[idx%_COLORS.length],label:_LABELS[gid]||gid,total:t});
            _acc+=pct;
          });
          var _hasAny=_grandTotal>0;
          return e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.4rem'}},
            e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.5rem',flexWrap:'wrap'}},
              e('span',{style:{fontWeight:700,fontSize:'.75rem',color:'var(--ink-2)',display:'flex',alignItems:'center',gap:'.3rem'}},
                e('i',{className:'fas fa-chart-pie',style:{color:'var(--primary)',fontSize:'.65rem'}}),'Бюджет по групи'),
              e('div',{style:{display:'inline-flex',borderRadius:6,overflow:'hidden',border:'1px solid var(--border)',marginLeft:'auto',flexShrink:0}},
                e('button',{type:'button',onClick:function(){setBudgetInputModeEf('slider');},style:{padding:'.22rem .65rem',fontSize:'.65rem',fontWeight:600,border:'none',cursor:'pointer',background:budgetInputModeEf==='slider'?'var(--primary)':'transparent',color:budgetInputModeEf==='slider'?'#fff':'var(--ink-3)',transition:'all .15s'}},e('i',{className:'fas fa-sliders-h',style:{marginRight:'.25rem'}}),'Слайдер'),
                e('button',{type:'button',onClick:function(){setBudgetInputModeEf('exact');},style:{padding:'.22rem .65rem',fontSize:'.65rem',fontWeight:600,border:'none',borderLeft:'1px solid var(--border)',cursor:'pointer',background:budgetInputModeEf==='exact'?'var(--primary)':'transparent',color:budgetInputModeEf==='exact'?'#fff':'var(--ink-3)',transition:'all .15s'}},e('i',{className:'fas fa-keyboard',style:{marginRight:'.25rem'}}),'Точни суми')
              )
            ),
            e('div',{style:{display:'flex',gap:'1rem',alignItems:'flex-start',flexWrap:'wrap'}},
              e('div',{style:{flexShrink:0,display:'flex',flexDirection:'column',alignItems:'center',gap:'.4rem'}},
                e('svg',{width:112,height:112,viewBox:'0 0 112 112',style:{display:'block'}},
                  e('circle',{cx:_CX,cy:_CY,r:_R,fill:'none',stroke:'var(--border)',strokeWidth:_SW}),
                  _hasAny?_segs.map(function(seg,i){return e('circle',{key:seg.gid,cx:_CX,cy:_CY,r:_R,fill:'none',stroke:seg.color,strokeWidth:_SW,strokeDasharray:seg.arcLen+' '+(_C-seg.arcLen),strokeDashoffset:-seg.offset,transform:'rotate(-90 '+_CX+' '+_CY+')',style:{transition:'stroke-dasharray .4s ease'}});})
                    :e('circle',{cx:_CX,cy:_CY,r:_R,fill:'none',stroke:'var(--border)',strokeWidth:_SW}),
                  e('text',{x:_CX,y:_CY-5,textAnchor:'middle',fontSize:'12',fontWeight:'700',fill:'var(--ink)',fontFamily:'inherit'},_hasAny?Math.round(_grandEUR).toLocaleString('bg-BG'):'—'),
                  e('text',{x:_CX,y:_CY+9,textAnchor:'middle',fontSize:'9',fill:'var(--gold)',fontFamily:'inherit'},_hasAny?'€':'')
                ),
                _segs.length>0&&e('div',{style:{display:'flex',flexDirection:'column',gap:'.15rem',width:112}},
                  _segs.map(function(seg){return e('div',{key:seg.gid,style:{display:'flex',alignItems:'center',gap:'.25rem',fontSize:'.58rem'}},e('div',{style:{width:8,height:8,borderRadius:2,background:seg.color,flexShrink:0}}),e('span',{style:{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,color:'var(--ink-3)'}},seg.label.slice(0,14)),e('span',{style:{fontWeight:700,color:'var(--ink-2)',flexShrink:0}},(seg.pct*100).toFixed(0)+'%'));})
                )
              ),
              e('div',{style:{flex:'1 1 280px',display:'flex',flexDirection:'column',gap:'.45rem',minWidth:0}},
                _allGids.map(function(gid,idx){
                  var total=_groupTotals[gid]||0;
                  var totalEUR=total/_eur;
                  var color=_COLORS[idx%_COLORS.length];
                  var label=_LABELS[gid]||gid;
                  return e('div',{key:gid,style:{display:'flex',flexDirection:'column',gap:'.12rem'}},
                    e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem',minWidth:0}},
                      e('div',{style:{width:10,height:10,borderRadius:3,background:color,flexShrink:0}}),
                      e('span',{style:{fontSize:'.68rem',fontWeight:600,color:'var(--ink-2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'},title:label},label),
                      e('span',{style:{fontSize:'.62rem',color:'var(--gold)',fontWeight:700,flexShrink:0,minWidth:72,textAlign:'right'}},total>0?totalEUR.toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0})+' €':'—')
                    ),
                    budgetInputModeEf==='slider'
                      ? e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem'}},
                          e('input',{type:'range',min:0,max:Math.max(_maxBGN,total)||100000,step:100,value:Math.round(total),onChange:function(ev){_setGroupTotal(gid,Number(ev.target.value));},style:{flex:1,accentColor:color,height:4,cursor:'pointer'}}),
                          e('span',{style:{fontSize:'.6rem',color:'var(--ink-4)',minWidth:46,textAlign:'right',flexShrink:0}},total>0?total.toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0})+' лв':'0 лв'))
                      : e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem'}},
                          e('input',{type:'number',min:0,step:100,value:total>0?Math.round(total):'',placeholder:'BGN',onChange:function(ev){_setGroupTotal(gid,Math.max(0,Number(ev.target.value)||0));},style:{flex:1,border:'1px solid var(--border)',borderRadius:4,padding:'.2rem .4rem',fontSize:'.72rem',minWidth:0,color:'var(--ink)',background:'var(--bg)'}}),
                          e('span',{style:{fontSize:'.62rem',color:'var(--ink-4)',flexShrink:0}},'лв = '+totalEUR.toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0})+' €'))
                  );
                })
              )
            )
          );
        })(),
        (typeof BudgetEditor==='function')&&e('div',{className:'form-field span2'},e(BudgetEditor,{value:budget,onChange:setBudget,budgetViolations:budgetErrors,durationMonths:Number(formValues.durationMonths)||12,projectCode:String(form?.projectCode||''),totalBudget:(function(){var pc=String(form?.projectCode||'');var pt=PROJECT_TYPES.find(function(p){return p.value===pc;});if(!pt)return 0;var eurBgn=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;if(pc==='НПФ'&&pt.npfTiers){var tier=pt.npfTiers[form?.npfTier]||pt.npfTiers.university;return (tier.maxEUR*eurBgn);}return pt.maxBudget*eurBgn;})()})),
        budgetErrors.length>0&&e('div',{className:'form-field span2 budget-errors-anchor'},e('div',{style:{padding:'.6rem .75rem',background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',fontSize:'.78rem'}},e('div',{style:{fontWeight:700,color:'var(--err)',marginBottom:'.35rem',display:'flex',alignItems:'center',gap:'.35rem'}},e('i',{className:'fas fa-triangle-exclamation'}),'Бюджетни нарушения:'),budgetErrors.map(function(v,i){return e('div',{key:i,style:{padding:'.2rem 0 .2rem 1.2rem',color:v.severity==='high'?'var(--err)':'var(--warn)',fontSize:'.76rem',cursor:'pointer'},onClick:function(){setWizardStep(3);}},e('i',{className:'fas fa-circle',style:{fontSize:'.35rem',marginRight:'.35rem',verticalAlign:'middle'}}),v.message);}))),
        // ── Attached documents preview cards (step 3) ──
        attachedDocs.length>0&&e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.25rem'}},
            e('div',{style:{fontWeight:700,fontSize:'.8rem',color:'var(--gold)',display:'flex',alignItems:'center',gap:'.4rem',marginBottom:'.4rem'}},
                e('i',{className:'fas fa-paperclip',style:{fontSize:'.7rem'}}),
                'Прикачени документи ('+attachedDocs.length+')'
            ),
            e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.35rem'}},
                attachedDocs.map(function(d){
                    var vis=(typeof getDocVisuals==='function')?getDocVisuals(d):{icon:'fa-file',label:'Документ'};
                    return e('span',{key:d.id,style:{display:'inline-flex',alignItems:'center',gap:'.3rem',padding:'.25rem .5rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill,6px)',cursor:'pointer',fontSize:'.7rem',color:'var(--ink-2)',transition:'all .15s',boxShadow:'0 1px 3px rgba(0,0,0,.06)'},title:'Редактирай '+(d.name||'документ'),onClick:function(ev){ev.stopPropagation();setEditingDoc(d);}},
                        e('i',{className:'fas '+vis.icon,style:{fontSize:'.62rem',color:'var(--gold)'}}),
                        e('span',{style:{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},(d.name||'').slice(0,30)),
                        e('i',{className:'fas fa-edit',style:{fontSize:'.55rem',color:'var(--ink-4)',marginLeft:'.15rem'}})
                    );
                })
            )
        ),
      ),
      // ═══ STEP 3: Бюджет ═══
      wizardStep<3
        ?e('button',{type:'button',className:'btn btn-primary',onClick:goNext,style:{minWidth:120}},e('i',{className:'fas fa-arrow-right'}),' Напред')
        :e(Fragment,null,
          budgetErrors.some(function(v){return v.group==='total'&&v.severity==='high';})&&e('span',{style:{fontSize:'.74rem',color:'var(--err)',display:'flex',alignItems:'center',gap:'.3rem',padding:'0 .5rem'}},e('i',{className:'fas fa-ban'}),'Бюджетът надвишава максимума'),
          e('button',{type:'submit',className:'btn btn-primary',disabled:sending||budgetErrors.some(function(v){return v.group==='total'&&v.severity==='high';}),style:{minWidth:140}},
            sending?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-save'}),' Запази промени')
        )
    ),
    previewDoc&&_portal(e('div',{className:'modal-overlay',style:{zIndex:10500},onClick:function(){setPreviewDoc(null);}},
      e('div',{className:'modal-box',style:{width:'90vw',maxWidth:900,maxHeight:'90vh',borderRadius:8,overflow:'hidden'},onClick:function(ev){ev.stopPropagation();}},
        e(DocumentPreviewModal,{doc:previewDoc,onClose:function(){setPreviewDoc(null);},onEdit:function(doc){setPreviewDoc(null);setEditingDoc(doc);},onDelete:function(doc){setPreviewDoc(null);if(doc&&doc.id){setAttachedDocs(function(p){return p.filter(function(x){return x.id!==doc.id;});});}if(doc&&doc.name&&!doc.id){setNewFiles(function(p){return p.filter(function(f){return f.name!==doc.name;});});}}})
      )
    )),
    // v12.12.0: inline editor moved INTO step 2 wizard content
  )
));
});

/* ═══════════════════════════════════════════════════════════════════════
 *  Performance: document-checkbox click handler uses a stable ref
 *  to avoid re-creating a new closure on every toggle.
 * ═══════════════════════════════════════════════════════════════════ */

/* ─── CORRECTION FORM MODAL (UC-12 / UC-13) ───────────────────────────────
 *  Opens when applicant clicks a proposal with status 'returned' or
 *  'needs_correction'.  Displays the admin's return reason + deadline at top,
 *  then the full editable form pre-populated with existing data.
 *  "Запази промени" → updateForm (keeps current status, draft-save).
 *  "Коригирай и подай" → updateForm THEN onSubmitCorrection(id) which goes
 *  through the existing submitForm + OTP 2FA flow → sets status 'resubmitted'.
 * ─────────────────────────────────────────────────────────────────────────── */
var CorrectionFormModal=memo(({form,user,onClose,onSaved,onSubmitCorrection,allDocuments=[]})=>{
const{closing:cfClosing,close:cfClose}=useModalClose(onClose);
const[newFiles,setNewFiles]=useState([]);
const[attachedDocs,setAttachedDocs]=useState(()=>getAttachedDocs(form));
const[editingDoc,setEditingDoc]=useState(null);
// ── Register this component's editor as the global doc editor target ──
useEffect(function(){
  if(typeof window._registerDocEditor==='function')window._registerDocEditor(setEditingDoc);
  return function(){ if(typeof window._unregisterDocEditor==='function')window._unregisterDocEditor(); };
},[]);
const[sending,setSending]=useState(false);
const[savingDraft,setSavingDraft]=useState(false);
const[errors,setErrors]=useState({});
// ── v8.0.0.77: Inline 2FA OTP phase persisted to sessionStorage.
//    Survives accidental close, draft save, and page refresh.
//    TTL = 5 min from OTP issuance. ──
const _CF_OTP_KEY = 'erp:otp:correction:' + getId(form);
const[phase,_setPhase]=useState(()=>{
  try{var raw=sessionStorage.getItem(_CF_OTP_KEY);if(!raw)return'edit';var p=JSON.parse(raw);if(!p||!p.phase||p.phase!=='verify')return'edit';if(Date.now()-p._ts>5*60*1000){sessionStorage.removeItem(_CF_OTP_KEY);return'edit';}return'verify';}catch(_){return'edit';}
});
const setPhase=useCallback(function(p){
  _setPhase(p);
  try{
    if(p==='verify'){sessionStorage.setItem(_CF_OTP_KEY,JSON.stringify({phase:'verify',_ts:Date.now()}));}
    else{sessionStorage.removeItem(_CF_OTP_KEY);}
  }catch(_){}
},[_CF_OTP_KEY]);
const[otpCode,setOtpCode]=useState('');
const[otpErr,setOtpErr]=useState('');
const[otpInfo,setOtpInfo]=useState('');
const[otpCooldown,setOtpCooldown]=useState(0);
const[otpIssuing,setOtpIssuing]=useState(false);
const otpInputRef=useRef(null);
const _cfSendingRef=useRef(false); // prevent double-click spam
const[formValues,setFormValues]=useState({
    competitionId:getCompetitionId(form),
    area:getArea(form),
    professionalField:String(form?.professionalField||''),
    title:getTitle(form),
    titleEn:String(form?.titleEn||''),
    acronym:String(form?.acronym||''),
    description:getDescription(form),
    descriptionEn:String(form?.descriptionEn||''),
    objectives:String(form?.objectives||''),
    expectedResults:String(form?.expectedResults||''),
    durationMonths:Number(form?.durationMonths)||12,
    npfTier:String(form?.npfTier||'')||'university'
});
// ── Multi-prof-field support ──
const[selectedProfFieldsCf,setSelectedProfFieldsCf]=useState(function(){return getAreas(form?.professionalField||form);});
const handleProfFieldChangeCf=useCallback(function(nextFields){
  setSelectedProfFieldsCf(nextFields);
  var joined=(Array.isArray(nextFields)?nextFields:[]).filter(function(a){return String(a||'').trim();}).join(';;');
  setFormValues(function(p){return {...p,professionalField:joined};});
  if(errors.professionalField)setErrors(function(p){var n={...p};delete n.professionalField;return n;});
},[errors.professionalField]);
const[teamMembers,setTeamMembers]=useState(()=>Array.isArray(form?.teamMembers)?form.teamMembers:[]);
const[budget,setBudget]=useState(()=>{const raw=form?.budget||form?.budgetBreakdown;return(raw&&typeof raw==='object'&&!Array.isArray(raw))?raw:{}});
const[showPicker,setShowPicker]=useState(false);
const[draggingCf,setDraggingCf]=useState(false);
const cfFileRef=useRef(null);
const[availableCompetitions,setAvailableCompetitions]=useState([]);
const[compsLoading,setCompsLoading]=useState(true);

// Parse the return comment + deadline
const rc=useMemo(()=>parseReturnComment(getReturnComment(form)),[form]);

const loadAvailableCompetitions=useCallback(async()=>{
    setCompsLoading(true);
    try{
    const authPayload={isAdmin:false,userId:(user?.email||'')};
    const comps=await refreshCompetitions(authPayload,{forceRefresh:COMPETITIONS.length===0});
    const normalized=Array.isArray(comps)?comps.filter(c=>c.id&&!String(c.id).startsWith('DEMO')):[];
    if(formValues.competitionId&&!normalized.some(c=>c.id===formValues.competitionId)){
        normalized.unshift({id:formValues.competitionId,name:'(Текущ конкурс) '+formValues.competitionId,dateEnd:'',deadline:'',status:'',created:'',description:''});
    }
    setAvailableCompetitions(normalized);
    }catch(_){}finally{setCompsLoading(false)}
},[user?.email,formValues.competitionId]);

useEffect(()=>{loadAvailableCompetitions();},[loadAvailableCompetitions]);

const handleChange=ev=>{const{name,value}=ev.target;setFormValues(p=>({...p,[name]:value}));if(errors[name])setErrors(p=>{const n={...p};delete n[name];return n})};
const handleAcronymChange=ev=>{var clean=String(ev.target.value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase().slice(0,10);setFormValues(p=>({...p,acronym:clean}));if(errors.acronym)setErrors(p=>{var n={...p};delete n.acronym;return n;});};
// ── FIELD LABEL MAP for descriptive error messages ──
const _CF_LABELS={competitionId:'Конкурсна сесия',area:'Приоритетно направление',professionalField:'Професионално направление',title:'Наименование',titleEn:'Наименование (EN)',acronym:'Акроним',description:'Кратко описание',descriptionEn:'Кратко описание (EN)',objectives:'Цели',expectedResults:'Очаквани резултати',durationMonths:'Срок (месеци)'};
// ── Reactive budget validation (useMemo — no extra render cycle) ──
var budgetErrors=useMemo(function(){
  try {
    var pc=String(form?.projectCode||'').toUpperCase();
    if(typeof _computeBudgetViolations==='function'){
      return _computeBudgetViolations(budget,pc,formValues.durationMonths,teamMembers,{npfTier:formValues.npfTier});
    }
  } catch(e) {}
  return [];
},[budget,form?.projectCode,formValues.durationMonths,teamMembers,formValues.npfTier]);
// ── Reactive field error clearing ──
useEffect(function(){
  if(!Object.keys(errors).length)return;
  var fixed={},changed=false;
  Object.keys(errors).forEach(function(k){
    var val=formValues[k];
    if(val!==undefined&&val!==null&&String(val).trim()!==''){fixed[k]=true;changed=true;}
  });
  if(changed){setErrors(function(prev){var next={};Object.keys(prev).forEach(function(k){if(!fixed[k])next[k]=prev[k];});return next;});}
},[formValues]);
const validate=()=>{const errs={};if(!formValues.area)errs.area='Приоритетното направление е задължително';if(!formValues.description.trim())errs.description='Описанието е задължително';setErrors(errs);
var hasBlockers=budgetErrors.some(function(v){return v.severity==='high';});
return Object.keys(errs).length===0&&!hasBlockers;};
const handleFiles=async ev=>{const sel=Array.from(ev.target.files||[]);const results=await Promise.allSettled(sel.map(readFileAsBase64));results.filter(r=>r.status==='fulfilled').map(r=>r.value).forEach(f=>setNewFiles(p=>[...p,f]));results.filter(r=>r.status==='rejected').forEach(r=>toast(r.reason?.message||'Грешка','error'));ev.target.value=''};
const handleDropCf=async ev=>{ev.preventDefault();ev.stopPropagation();setDraggingCf(false);const dropped=Array.from(ev.dataTransfer?.files||[]);if(!dropped.length)return;const results=await Promise.allSettled(dropped.map(readFileAsBase64));results.filter(r=>r.status==='fulfilled').map(r=>r.value).forEach(f=>setNewFiles(p=>[...p,f]));results.filter(r=>r.status==='rejected').forEach(r=>toast(r.reason?.message||'Грешка','error'))};

const doSaveUpdates=useCallback(async()=>{
    const id=getId(form);
    const updates={userId:user?.email||'',userName:user?.name||'',competitionId:formValues.competitionId,npfTier:String(form?.projectCode||'').toUpperCase()==='НПФ'?(formValues.npfTier||'university'):undefined,title:formValues.title.trim(),titleEn:(formValues.titleEn||'').trim(),acronym:(formValues.acronym||'').trim().toUpperCase(),area:formValues.area,professionalField:formValues.professionalField||'',description:formValues.description.trim(),descriptionEn:(formValues.descriptionEn||'').trim(),objectives:(formValues.objectives||'').trim(),expectedResults:(formValues.expectedResults||'').trim(),durationMonths:Number(formValues.durationMonths)||12,teamMembers,budget,newFiles,attachedDocs:attachedDocs.map(_serializeDoc)};
    const optimisticPatch=prev=>{
        if(!prev||!Array.isArray(prev.forms))return prev;
        return{...prev,forms:prev.forms.map(f2=>getId(f2)===id?{...f2,title:updates.title,area:updates.area,description:updates.description,_optimistic:true}:f2)};
    };
    await mutateApi('updateForm',{id,updates},{
        patches:[{action:'getforms',mutator:optimisticPatch}],
        invalidates:['getforms','getinitialdata','getcompetitionsummary']
    });
},[form,user,formValues,teamMembers,budget,newFiles,attachedDocs]);

const handleSaveDraft=async ev=>{
    ev.preventDefault();if(_cfSendingRef.current)return;
    // ── Draft save is lenient: a draft is by definition incomplete, so we do
    //    NOT require area/description here. Only block on high-severity budget
    //    violations (e.g. total over the project-type max), which would persist
    //    corrupt data. Missing required fields are enforced on final submit. ──
    var budgetBlockers=budgetErrors.filter(function(v){return v.severity==='high';});
    if(budgetBlockers.length){toast(budgetBlockers[0].message||'Бюджетът не отговаря на изискванията. Коригирайте сумите.','error',6000);return}
    _cfSendingRef.current=true;
    setSavingDraft(true);
    onClose();
    toast('Промените са запазени.','success');
    try{await doSaveUpdates();Promise.resolve().then(()=>onSaved({silent:true}));}
    catch(err){toast(err.message||'Грешка при запис','error',5000);}
    finally{_cfSendingRef.current=false;setSavingDraft(false)}
};

const handleSubmitCorrection=async ev=>{
    if(ev&&ev.preventDefault)ev.preventDefault();
    if(_cfSendingRef.current)return;
    if(!validate()){const hasBudgetIssue=budgetErrors.length>0;toast(hasBudgetIssue?'Бюджетът не отговаря на изискванията. Коригирайте сумите.':'Попълнете задължителните полета','error');return}
    if(rc&&rc.expired){toast('Срокът за корекция е изтекъл. Свържете се с администратор.','error',6000);return}
    _cfSendingRef.current=true;
    setSending(true);setOtpErr('');setOtpInfo('');
    // 1. Save edits first
    try{await doSaveUpdates();}
    catch(err){toast('Грешка при запис на промените: '+(err.message||''),'error',5000);_cfSendingRef.current=false;setSending(false);return}
    // 2. Call submitForm — backend may demand 2FA
    try{
        const res=await api('submitForm',{id:getId(form),userName:user?.name||'',userId:user?.email||'',email:user?.email||''});
        if(res&&res.require2fa){
            const tf=res.twoFactor||{};
            setPhase('verify');
            setOtpCooldown(Number(tf.cooldown||30));
            setOtpInfo(res.message||('Изпратен е 6-цифрен код на '+(tf.email||user?.email||'имейла Ви')+'.'));
            _cfSendingRef.current=false;setSending(false);
            setOtpCode(''); // Clear any stale code
            setTimeout(()=>{try{otpInputRef.current&&otpInputRef.current.focus()}catch(_){}},120);
            return;
        }
        if(res&&res.success===false){toast(res.error||'Грешка при изпращане','error',5000);_cfSendingRef.current=false;setSending(false);return}
        // Unexpected response — treat as success if not explicitly failed
        const cn=(res&&res.competitionName)||'';
        toast('Коригираната версия е изпратена'+(cn?' за конкурс „'+cn+'"':'')+'.','success');
        try{onSaved&&onSaved({silent:true})}catch(_){}
        _cfSendingRef.current=false;setSending(false);onClose();
    }catch(err){toast(err.message||'Грешка при изпращане','error',5000);_cfSendingRef.current=false;setSending(false)}
};

const handleVerifyOtp=async ev=>{
    if(ev&&ev.preventDefault)ev.preventDefault();
    if(_cfSendingRef.current)return;
    const clean=String(otpCode||'').replace(/[^0-9]/g,'');
    if(clean.length!==6){setOtpErr('Кодът трябва да е 6 цифри.');return}
    _cfSendingRef.current=true;
    setOtpErr('');setOtpInfo('');setSending(true);
    try{
        // Race with a 10s timeout so the UI never hangs indefinitely
        var timeoutP=new Promise(function(_,reject){setTimeout(function(){reject(new Error('Изтече времето за потвърждение. Опитайте отново.'));},10000);});
        var apiP=api('submitForm',{id:getId(form),userName:user?.name||'',userId:user?.email||'',email:user?.email||'',otpCode:clean});
        const res=await Promise.race([apiP,timeoutP]);
        if(!res){
            setOtpErr('Неполучен отговор от сървъра. Опитайте отново.');
            _cfSendingRef.current=false;setSending(false);return;
        }
        if(res.require2fa){
            setOtpErr(res.otpError||res.error||'Грешен код. Опитайте отново.');
            if(res.expired){setOtpInfo('Кодът е изтекъл. Поискайте нов.');setOtpCode('');}
            if(res.locked){setOtpInfo('Превишен брой опити. Поискайте нов код.');setOtpCode('');}
            _cfSendingRef.current=false;setSending(false);return;
        }
        if(res.success===false){
            setOtpErr(res.error||'Грешка при изпращане');_cfSendingRef.current=false;setSending(false);return;
        }
        const cn=res.competitionName||'';
        toast('Коригираната версия е изпратена'+(cn?' за конкурс „'+cn+'"':'')+'.','success');
        try{onSaved&&onSaved({silent:true})}catch(_){}
        _cfSendingRef.current=false;setSending(false);onClose();
    }catch(err){setOtpErr(err.message||'Грешка при проверка.');_cfSendingRef.current=false;setSending(false)}
};

const handleResendOtp=async()=>{
    if(otpCooldown>0||otpIssuing||sending)return;
    setOtpIssuing(true);setOtpErr('');setOtpCode('');
    try{
        const r=await api('initiate2fa',{scope:'submitform',email:user?.email||'',ref:getId(form)});
        if(r&&r.success){
            if(r.throttled){setOtpInfo('Има активен код. Опитайте след '+(r.cooldown||30)+' сек.');setOtpCooldown(Number(r.cooldown||30));}
            else{setOtpInfo('Изпратен е нов код на '+(user?.email||'имейла Ви')+'.');setOtpCooldown(30);}
        }else{setOtpErr((r&&r.error)||'Неуспешно изпращане на код.')}
    }catch(ex){setOtpErr(ex.message||'Неуспешно изпращане на код.')}
    finally{setOtpIssuing(false)}
};

useEffect(()=>{if(otpCooldown<=0)return;const t=setInterval(()=>setOtpCooldown(c=>c<=1?0:c-1),1000);return()=>clearInterval(t)},[otpCooldown]);

const ErrMsg=({field})=>errors[field]?e('div',{className:'field-error'},e('i',{className:'fas fa-exclamation-circle'}),' ',errors[field]):null;

if(showPicker)return e(DocumentPickerModal,{documents:allDocuments,alreadyAttached:attachedDocs,userEmail:(typeof _currentUserEmail!=='undefined'?_currentUserEmail:''),onCancel:()=>setShowPicker(false),onConfirm:async function(docs){
      setShowPicker(false);
      if(!docs||!docs.length)return;
      // v12.27.1-perf: Parallelize doc copies with Promise.all (was sequential N× latency).
      var copiedDocs=[];
      var fId2=getId(form);
      if(fId2&&docs.length){
        var copyPromises=docs.map(function(d){
          return api('copyDocument',{userId:user&&user.email?user.email:'',email:user&&user.email?user.email:'',docId:d.id,formId:fId2}).then(function(copyRes){
            if(copyRes&&copyRes.success&&copyRes.file) return _serializeDoc(copyRes.file);
            return _serializeDoc(d);
          }).catch(function(){return _serializeDoc(d);});
        });
        copiedDocs=await Promise.all(copyPromises);
      }else{
        docs.forEach(function(d){copiedDocs.push(_serializeDoc(d));});
      }
      var nextDocs=[];setAttachedDocs(function(prev){var merged=[...prev];copiedDocs.forEach(function(cd){if(!merged.some(function(x){return x.id===cd.id;}))merged.push(cd);});nextDocs=merged;return merged;});
      // ── Instant server-side persist: save the freshly-attached docs immediately.
      // v12.30.1-perf: Removed getinitialdata from invalidation (too broad — triggers
      // full data refresh). Only invalidate getforms so the parent re-fetch gets
      // updated attachedDocs without reloading all competitions/documents.
      var formId2=getId(form);
      if(formId2&&nextDocs.length){
        var savePayload={id:formId2,updates:{attachedDocs:nextDocs.map(function(d){return _serializeDoc(d);})}};
        await mutateApi('updateForm',savePayload,{invalidates:['getforms']}).catch(function(){});
      }
    },onCopyAttach:function(docId,fId,docData){
      return api('copyDocument',{userId:user&&user.email?user.email:'',email:user&&user.email?user.email:'',docId:docId||docData?.id,formId:fId||getId(form)})
        .then(function(res){
          if(!res||!res.success||!res.file) throw new Error((res&&res.error)||'Грешка при копиране');
          var cf=_serializeDoc(res.file);
          var nextDocs=[];
          setAttachedDocs(function(prev){
            if(prev.some(function(x){return x.id===cf.id;})) return prev;
            var merged=prev.concat([cf]);
            nextDocs=merged;
            return merged;
          });
          var formId2=getId(form);
          if(formId2&&nextDocs.length){
            var payload={id:formId2,updates:{attachedDocs:nextDocs.map(function(d){return _serializeDoc(d);})}};
            mutateApi('updateForm',payload,{invalidates:['getforms']}).catch(function(){});
          }
          toast('Документът е копиран и прикачен','success');
        }).catch(function(err){toast('Грешка: '+(err&&err.message||''),'error');});
    },formId:getId(form),competitionId:form.competitionId||'',projectType:(form?.projectCode||'').toUpperCase()});

const expired=rc&&rc.expired;
const daysLeft=rc&&rc.daysLeft!=null?rc.daysLeft:null;

return _portal(e('div',{className:'modal-overlay'+(cfClosing?' modal-closing':''),onClick:cfClose},
    e('form',{className:'modal-box form-modal modal-form'+(cfClosing?' modal-closing':''),onSubmit:handleSubmitCorrection,onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head'},
        e('h3',null,e('i',{className:'fas fa-pen-to-square',style:{color:'var(--warn)'}}),' Корекция на предложение'),
        e('button',{type:'button',className:'close-btn',onClick:cfClose},e('i',{className:'fas fa-times'}))
    ),
    e('div',{className:'modal-body'},
        // ── Return reason banner ──────────────────────────────────
        e('div',{className:'correction-banner'+(expired?' correction-banner-expired':'')},
        e('div',{className:'correction-banner-head'},
            e('i',{className:'fas fa-triangle-exclamation',style:{marginRight:'.45rem'}}),
            e('strong',null,expired?'Срокът за корекция е изтекъл!':'Заявлението е върнато за корекция')
        ),
        rc&&rc.comment&&e('div',{className:'correction-banner-comment'},e('i',{className:'fas fa-comment-dots',style:{marginRight:'.35rem',opacity:.7}}),'„',rc.comment,'"'),
        e('div',{className:'correction-banner-meta'},
            rc&&rc.deadlineLabel&&e('span',{className:'correction-deadline-chip'+(expired?' err':'')},
            e('i',{className:'fas fa-clock',style:{marginRight:'.25rem'}}),
            expired?'Изтекъл':'Краен срок: ',rc.deadlineLabel
            ),
            daysLeft!=null&&!expired&&e('span',{className:'correction-days-chip'+(daysLeft<=1?' err':daysLeft<=3?' warn':'')},
            e('i',{className:'fas fa-hourglass-half',style:{marginRight:'.25rem'}}),
            daysLeft===0?'Последен ден!':(daysLeft+' дни остават')
            ),
            expired&&e('span',{className:'correction-deadline-chip err'},
            e('i',{className:'fas fa-ban',style:{marginRight:'.25rem'}}),'Подаването е блокирано — свържете се с НИИ'
            )
        )
        ),
        // ── Editable form fields ───
        phase==='edit'&&e('div',{className:'form-layout-grid'},
        e('div',{className:'form-field'},e('label',null,'Конкурсна сесия'),e('select',{name:'competitionId',value:formValues.competitionId,onChange:handleChange,disabled:compsLoading},compsLoading?e('option',{value:''},'Зареждане...'):availableCompetitions.map(c=>e('option',{key:c.id,value:c.id},c.name)))),
        e('div',{className:'form-field '+(errors.area?'error':'')},e('label',null,'Приоритетно направление *'),e('select',{name:'area',value:formValues.area,onChange:handleChange},e('option',{value:'',disabled:true},'— изберете —'),PRIORITY_AREAS.map(a=>e('option',{key:a,value:a},a))),e(ErrMsg,{field:'area'})),
        e('div',{className:'form-field span2'},e('label',null,'Професионално направление *'),e(MultiSelect,{options:PROFESSIONAL_FIELDS,value:selectedProfFieldsCf,onChange:handleProfFieldChangeCf,placeholder:'— изберете направление/я —',name:'professionalField',disabled:false}),selectedProfFieldsCf.length>0&&e('div',{style:{fontSize:'.62rem',color:'var(--ink-4)',marginTop:'.15rem',display:'flex',flexWrap:'wrap',gap:'.2rem'}},selectedProfFieldsCf.map(function(v){var _pf=PROFESSIONAL_FIELDS.find(function(p){return p.value===v;});return e('span',{key:v,style:{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-pill)',padding:'.08rem .45rem',fontSize:'.62rem',whiteSpace:'nowrap'}},_pf?_pf.label:v);})),e(ErrMsg,{field:'professionalField'})),
        e('div',{className:'form-field span2'},e('label',null,'Наименование на проектното предложение'),e('input',{name:'title',value:formValues.title,onChange:handleChange})),
        e('div',{className:'form-field span2'},e('label',null,'Наименование на проектното предложение на английски език'),e('input',{name:'titleEn',value:formValues.titleEn||'',onChange:handleChange,placeholder:'Project title...'})),
        e('div',{className:'form-field'},e('label',null,'Акроним'),e('input',{name:'acronym',value:formValues.acronym||'',onChange:handleAcronymChange,placeholder:'Напр. ERP2026',maxLength:10})),
        e('div',{className:'form-field'},e('label',null,'Срок на изпълнение (месеци)'),e('input',{type:'number',min:12,max:60,name:'durationMonths',value:formValues.durationMonths,onChange:handleChange})),
        e('div',{className:'form-field span2 '+(errors.description?'error':'')},e('label',null,'Кратко описание на проектното предложение *'),e('textarea',{name:'description',value:formValues.description,onChange:handleChange,rows:4}),e('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'.1rem'}},e('span',{style:{fontSize:'.62rem',color:'var(--ink-4)'}},'Максимум 200 думи'),(function(){var _wc=(formValues.description||'').trim().split(/\s+/).filter(Boolean).length;return e('span',{style:{fontSize:'.62rem',fontWeight:700,color:_wc>200?'var(--err)':_wc>170?'var(--warn)':'var(--ink-4)'}},_wc+'/200');}())),e(ErrMsg,{field:'description'})),
        e('div',{className:'form-field span2'},e('label',null,'Кратко описание на проектното предложение на английски език'),e('textarea',{name:'descriptionEn',value:formValues.descriptionEn||'',onChange:handleChange,rows:4}),(function(){var _wc=(formValues.descriptionEn||'').trim().split(/\s+/).filter(Boolean).length;return _wc>0?e('div',{style:{display:'flex',justifyContent:'flex-end',marginTop:'.1rem'}},e('span',{style:{fontSize:'.62rem',fontWeight:700,color:_wc>200?'var(--err)':_wc>170?'var(--warn)':'var(--ink-4)'}},_wc+'/200')):null;}())),
        e('div',{className:'form-field span2'},e('label',null,'Цел/и на проектното предложение'),e('textarea',{name:'objectives',value:formValues.objectives,onChange:handleChange,rows:2})),
        e('div',{className:'form-field span2'},e('label',null,'Очаквани резултати'),e('textarea',{name:'expectedResults',value:formValues.expectedResults,onChange:handleChange,rows:2})),
        // ── Екип (край на раздел 1) ──
        (typeof TeamMembersEditor==='function')&&e('div',{className:'form-field span2'},e(TeamMembersEditor,{value:teamMembers,onChange:setTeamMembers,leaderEmail:String(form?.userEmail||user?.email||''),leaderName:String(form?.userName||user?.name||''),projectCode:String(form?.projectCode||''),competitionId:formValues.competitionId,formId:String(form?.id||'')})),
        // v12.12.0: infomercial removed
        // ═══════════ РАЗДЕЛ 2: Бюджет ═══════════
        e('div',{className:'form-field span2',style:{gridColumn:'1/-1',marginBottom:'.15rem',paddingBottom:'.4rem',borderBottom:'2px solid var(--gold)'}},
          // ── Title row ──
          e('div',{style:{fontWeight:700,fontSize:'.85rem',color:'var(--gold)',display:'flex',alignItems:'center',gap:'.5rem',flexWrap:'wrap',marginBottom:'.5rem'}},
            e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem'}},
              e('i',{className:'fas fa-coins',style:{fontSize:'.75rem'}}),
              'Раздел 2. Бюджет по разходни групи'),
          ),
          // ── Live real-time total bar (v9.39.2-realtime) ──
          (function(){
            var _eur=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;
            var bgt=budget||{};
            var _grand=0;
            var _yearTotals={};
            Object.keys(bgt).forEach(function(gid){
              if(gid==='_monthlyMode'||gid==='_monthly')return;
              var byYear=bgt[gid]||{};
              Object.keys(byYear).forEach(function(yr){
                var v=Number(byYear[yr])||0;
                _grand+=v;
                _yearTotals[yr]=(_yearTotals[yr]||0)+v;
              });
            });
            var _mData=bgt._monthly;
            if(_mData&&typeof _mData==='object'){
              Object.keys(_mData).forEach(function(mgid){
                var mByPeriod=_mData[mgid]||{};
                if(mByPeriod&&typeof mByPeriod==='object'){
                  Object.keys(mByPeriod).forEach(function(period){
                    var v=Number(mByPeriod[period])||0;
                    _grand+=v;
                    if(period&&String(period).charAt(0)==='M'){
                      var mNum=parseInt(period.slice(1),10);
                      if(mNum>0&&mNum<=60){
                        var yOff=Math.ceil(mNum/12)-1;
                        var sy=String((new Date()).getFullYear()+yOff);
                        _yearTotals[sy]=(_yearTotals[sy]||0)+v;
                      }
                    }
                  });
                }
              });
            }
            var hasBudget=_grand>0;
            var _years=Object.keys(_yearTotals).sort();
            if(!hasBudget)return null;
            return e("div",{style:{display:"flex",flexDirection:"column",gap:".25rem",marginBottom:".25rem"}},
              e("div",{style:{display:"flex",alignItems:"center",gap:".6rem",flexWrap:"wrap",fontSize:".82rem"}},
                e("span",{style:{fontWeight:800,color:"var(--primary)"}},(_grand/_eur).toLocaleString("bg-BG",{minimumFractionDigits:2,maximumFractionDigits:2})+" €"),
                _years.length>0?e("span",{style:{fontSize:".67rem",color:"var(--ink-4)",display:"flex",alignItems:"center",gap:".3rem",flexWrap:"wrap"}},_years.map(function(yr,idx){
                  var yv=_yearTotals[yr]/_eur;
                  return e("span",{key:yr},(idx>0?"· ":"")+yr+": "+yv.toLocaleString("bg-BG",{minimumFractionDigits:2,maximumFractionDigits:2})+" €");
                })):null
              )
            );
          })()
        ),
        // ── Бюджет ──
        (typeof BudgetEditor==='function')&&e('div',{className:'form-field span2'},e(BudgetEditor,{value:budget,onChange:setBudget,budgetViolations:budgetErrors,durationMonths:Number(formValues.durationMonths)||12,projectCode:String(form?.projectCode||''),totalBudget:(()=>{const pc=String(form?.projectCode||'');const pt=PROJECT_TYPES.find(p=>p.value===pc);if(!pt)return 0;var eurBgn=(typeof EUR_BGN!=='undefined')?EUR_BGN:1.95583;if(pc==='НПФ'&&pt.npfTiers){var tier=pt.npfTiers[form?.npfTier]||pt.npfTiers.university;return (tier.maxEUR*eurBgn);}return pt.maxBudget*eurBgn;})()})),
            budgetErrors.length>0&&e('div',{className:'form-field span2'},e('div',{style:{padding:'.6rem .75rem',background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',fontSize:'.78rem'}},e('div',{style:{fontWeight:700,color:'var(--err)',marginBottom:'.35rem',display:'flex',alignItems:'center',gap:'.35rem'}},e('i',{className:'fas fa-triangle-exclamation'}),'Бюджетът не отговаря на изискванията за '+String(form?.projectCode||'').toUpperCase()+':'),budgetErrors.map((v,i)=>e('div',{key:i,style:{padding:'.2rem 0 .2rem 1.2rem',color:v.severity==='high'?'var(--err)':'var(--warn)',fontSize:'.76rem'}},e('i',{className:'fas fa-circle',style:{fontSize:'.35rem',marginRight:'.35rem',verticalAlign:'middle'}}),v.message)))),
        e('div',{className:'form-field span2'},
            e('label',null,e('i',{className:'fas fa-book',style:{marginRight:'.3rem',color:'var(--gold)'}}),'Документи от библиотеката'),
            e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.3rem',marginBottom:'.5rem'}},
            attachedDocs.length>0?attachedDocs.map(d=>{var _id2=d.driveId||d.fileId||d.id||'';var _anyDriveId2=_id2&&!/^(s_|doc_|up_|f_|copied_)/.test(_id2)?_id2:(d.id&&!/^(s_|doc_|up_|f_|copied_)/.test(d.id)?d.id:null)||(d.fileId&&!/^(s_|doc_|up_|f_|copied_)/.test(d.fileId)?d.fileId:null);return e('span',{key:d.id,className:'attached-doc-chip'},e('i',{className:'fas fa-file',style:{fontSize:'.62rem'}}),(d.name||'').slice(0,30),_anyDriveId2&&e('button',{type:'button',style:{background:'none',border:'none',color:'var(--primary)',cursor:'pointer',marginLeft:'.2rem',padding:0,lineHeight:1,fontSize:'.6rem',fontWeight:600},title:'Редактирай документа',onClick:function(ev){ev.stopPropagation();setEditingDoc(d);}},e('i',{className:'fas fa-edit'})),e('button',{className:'remove-attached',type:'button',onClick:function(){setAttachedDocs(function(p){var next=p.filter(function(x){return x.id!==d.id;});var formId=getId(form);if(formId){var savePayload={id:formId,updates:{attachedDocs:next.map(function(dd){return _serializeDoc(dd);})}};mutateApi('updateForm',savePayload,{invalidates:['getforms','getinitialdata']}).catch(function(){});}return next;});}},'✕'))}):e('span',{style:{fontSize:'.75rem',color:'var(--ink-4)',fontStyle:'italic'}},'Няма прикачени')
            ),
            e('button',{type:'button',className:'btn btn-outline btn-sm',onClick:()=>setShowPicker(true)},e('i',{className:'fas fa-folder-open'}),' Избери от библиотеката')
        ),
        e('div',{className:'form-field span2'},e('label',null,'Качи файлове (макс. 10 MB)'),
        e('div',{
          className:'upload-dropzone'+(draggingCf?' dragover':''),
          onDragOver:ev=>{ev.preventDefault();setDraggingCf(true)},
          onDragLeave:ev=>{ev.preventDefault();setDraggingCf(false)},
          onDrop:handleDropCf,
          onClick:()=>cfFileRef.current&&cfFileRef.current.click()
        },
          e('input',{ref:cfFileRef,type:'file',multiple:true,accept:'.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png',onChange:handleFiles,style:{display:'none'}}),
          e('i',{className:'fas fa-cloud-upload-alt upload-dropzone-icon'}),
          e('span',null,draggingCf?'Пуснете файловете тук':'Плъзнете файлове тук или ',draggingCf?null:e('u',null,'изберете от устройство')),
          e('span',{className:'upload-dropzone-hint'},'PDF, DOC, XLS, JPG, PNG – макс. 10 MB')
        ),
        newFiles.length>0&&e('div',{style:{marginTop:'.55rem',display:'flex',flexWrap:'wrap',gap:'.3rem'}},newFiles.map((f,i)=>e('span',{key:i,className:'file-chip'},e('i',{className:'fas fa-paperclip',style:{fontSize:'.68rem',color:'var(--ink-4)'}}),f.name,e('button',{type:'button',style:{background:'none',border:'none',cursor:'pointer',color:'var(--err)',marginLeft:'.28rem',padding:0,lineHeight:1},onClick:()=>setNewFiles(p=>p.filter((_,j)=>j!==i))},'✕'))))
        )
        ),
        // ── 2FA OTP step (UC-13: identity confirmation before resubmission) ──
        phase==='verify'&&e('div',{style:{display:'flex',flexDirection:'column',gap:'.85rem',padding:'.4rem 0'}},
            e('div',{style:{display:'flex',alignItems:'center',gap:'.55rem',padding:'.6rem .8rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-xs)',color:'var(--info)'}},
                e('i',{className:'fas fa-shield-halved',style:{fontSize:'1rem'}}),
                e('div',null,
                    e('div',{style:{fontWeight:600,fontSize:'.84rem'}},'Потвърждение в две стъпки'),
                    e('div',{style:{fontSize:'.74rem',marginTop:'.15rem'}},'Изпратихме 6-цифрен код на ',e('strong',null,user?.email||'имейла Ви'),'. Кодът важи 5 минути.')
                )
            ),
            e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',padding:'.45rem .65rem',background:'var(--bg-2)',border:'1px dashed var(--ink-6)',borderRadius:'var(--r-xs)',fontSize:'.72rem',color:'var(--ink-3)'}},
                e('i',{className:'fab fa-google'}),
                e('span',null,'Имейлът ще е във формат „G-123456 is your Google verification code." — въведете 6-те цифри.')
            ),
            e('div',{className:'form-field',style:{margin:0}},
                e('label',null,'Код за потвърждение'),
                e('input',{
                    ref:otpInputRef,
                    value:otpCode,
                    onChange:ev=>{const v=String(ev.target.value||'').replace(/[^0-9]/g,'').slice(0,6);setOtpCode(v);if(otpErr)setOtpErr('')},
                    inputMode:'numeric',autoComplete:'one-time-code',pattern:'[0-9]*',maxLength:6,placeholder:'123456',disabled:sending,
                    style:{letterSpacing:'.5rem',fontSize:'1.25rem',textAlign:'center',fontFamily:'Consolas,Menlo,monospace',fontWeight:700}
                })
            ),
            otpErr&&e('div',{role:'alert',style:{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.78rem',color:'var(--err)',background:'var(--err-bg)',border:'1px solid var(--err-border)',padding:'.5rem .7rem',borderRadius:'var(--r-xs)'}},
                e('i',{className:'fas fa-exclamation-circle'}),otpErr
            ),
            !otpErr&&otpInfo&&e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',fontSize:'.74rem',color:'var(--ink-3)'}},
                e('i',{className:'fas fa-info-circle'}),otpInfo
            ),
            e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'.76rem',color:'var(--ink-3)'}},
                e('span',null,'Не получавате код? Проверете спам.'),
                e('button',{type:'button',className:'btn btn-ghost btn-sm',disabled:otpCooldown>0||otpIssuing||sending,onClick:handleResendOtp},
                    otpIssuing?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-paper-plane'}),
                    ' ',otpCooldown>0?'Нов код ('+otpCooldown+'s)':'Изпрати нов код'
                )
            )
        )
    ),
    phase==='edit'
    ?e('div',{className:'modal-footer'},
        e('button',{type:'button',className:'btn btn-ghost',onClick:cfClose,disabled:sending||savingDraft},'Отказ'),
        e('div',{style:{flex:1}}),
        e('button',{type:'button',className:'btn btn-outline',disabled:sending||savingDraft,onClick:handleSaveDraft},
        savingDraft?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-save'}),' Запази промени'),
        // ── Submit button: disabled when budget exceeds project-type max ──
        budgetErrors.some(function(v){return v.group==='total'&&v.severity==='high';}) && e('div',{style:{fontSize:'.74rem',color:'var(--err)',display:'flex',alignItems:'center',gap:'.3rem',padding:'0 .5rem'}},
          e('i',{className:'fas fa-ban',style:{flexShrink:0}}),
          'Бюджетът надвишава максимума — намалете разходите.'),
        e('button',{type:'submit',className:'btn btn-primary',disabled:sending||savingDraft||!!expired||budgetErrors.some(function(v){return v.group==='total'&&v.severity==='high';}),title:expired?'Срокът е изтекъл':budgetErrors.some(function(v){return v.group==='total'&&v.severity==='high';})?'Бюджетът надвишава максимума':'Запази и подай коригираната версия',style:{minWidth:180}},
        sending?e('i',{className:'fas fa-spinner spin'}):e('i',{className:'fas fa-paper-plane'}),' Коригирай и подай')
    )
    :e('div',{className:'modal-footer'},
        e('button',{type:'button',className:'btn btn-ghost',disabled:sending,onClick:()=>{setPhase('edit');setOtpCode('');setOtpErr('');setOtpInfo('')}},
            e('i',{className:'fas fa-arrow-left'}),' Назад'),
        e('div',{style:{flex:1}}),
        e('button',{type:'button',className:'btn btn-primary',disabled:sending||otpCode.length!==6,onClick:handleVerifyOtp,style:{minWidth:200}},
            sending?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-shield-halved'}),
            ' ',sending?'Потвърждаване...':'Потвърди и изпрати')
    )
    ),
    editingDoc&&e(InlineDocEditorModal,{doc:editingDoc,formId:getId(form),defaultEditMode:true,onClose:function(){setEditingDoc(null);},onSaved:function(updatedDoc){if(updatedDoc){setEditingDoc(null);toast('Промените са запазени.','success');}else{setEditingDoc(null);}}})
));
});

/* ─── DEADLINE NOTIFY MODAL (admin → applicants) ──────────────────────
 *  Triggered from "Табло › Проектен контрол" by an admin to send batch
 *  email reminders for approaching report deadlines (UC-22 reminder
 *  cadence). Two-phase flow:
 *    1) Preview phase — dryRun call returns the recipient list, admin
 *       picks horizon (days), report types, optional custom note, and
 *       toggles individual recipients off.
 *    2) Send phase — POSTs the selection to senddeadlinereminders;
 *       backend uses notifyApplicant_ + buildNotificationHtml_ so emails
 *       carry the same cid:logoMain branding as the rest of the system.
 * ─────────────────────────────────────────────────────────────────────── */
var DeadlineNotifyModal=({onClose,onSent})=>{
const{closing:dnClosing,close:dnClose}=useModalClose(onClose);
const[horizonDays,setHorizonDays]=useState(7);
const[typeFilter,setTypeFilter]=useState({semiannual:true,annual:true,interim:true,final:true});
const[customNote,setCustomNote]=useState('');
const[loading,setLoading]=useState(false);
const[sending,setSending]=useState(false);
const[result,setResult]=useState(null);
const[error,setError]=useState('');
const[recipients,setRecipients]=useState([]);
const[selected,setSelected]=useState({}); // {projectId+'_'+type+'_'+period: true}

const keyFor=(r)=>String(r.projectId)+'_'+r.type+'_'+r.period;

const loadPreview=useCallback(async()=>{
    setLoading(true);setError('');setResult(null);
    try{
        const types=Object.keys(typeFilter).filter(k=>typeFilter[k]);
        const r=await api('senddeadlinereminders',{dryRun:true,horizonDays,types});
        if(!r||r.success===false){setError((r&&r.error)||'Неуспешно зареждане.');setRecipients([]);return}
        const list=Array.isArray(r.recipients)?r.recipients:[];
        setRecipients(list);
        // Auto-select all by default
        const sel={};list.forEach(it=>{sel[keyFor(it)]=true});
        setSelected(sel);
    }catch(ex){setError(ex.message||'Грешка при зареждане.');setRecipients([])}
    finally{setLoading(false)}
},[horizonDays,typeFilter]);

useEffect(()=>{loadPreview();},[loadPreview]);

const toggleAll=(on)=>{const s={};recipients.forEach(it=>{s[keyFor(it)]=!!on});setSelected(s)};
const toggleOne=(it)=>{const k=keyFor(it);setSelected(p=>({...p,[k]:!p[k]}))};

const selectedCount=recipients.filter(r=>selected[keyFor(r)]&&r.leaderEmail).length;
const noEmailCount=recipients.filter(r=>!r.leaderEmail).length;

const handleSend=async()=>{
    if(selectedCount===0){toast('Изберете поне един получател.','warn');return}
    setSending(true);setError('');
    try{
        const projectIds=Array.from(new Set(recipients.filter(r=>selected[keyFor(r)]).map(r=>r.projectId)));
        const types=Object.keys(typeFilter).filter(k=>typeFilter[k]);
        const r=await api('senddeadlinereminders',{
            horizonDays,projectIds,types,customNote:customNote.trim()
        });
        if(!r||r.success===false){setError((r&&r.error)||'Грешка при изпращане.');setSending(false);return}
        setResult(r);
        toast('Изпратени са '+r.sent+' известия'+(r.failed?' ('+r.failed+' неуспешни)':'')+'.','success',5000);
        try{onSent&&onSent(r)}catch(_){}
    }catch(ex){setError(ex.message||'Грешка при изпращане.')}
    finally{setSending(false)}
};

var typeLabels={semiannual:'Шестмесечен',annual:'Годишен',interim:'Междинен',final:'Окончателен'};

const fmt=(d)=>{try{return (typeof fmtDate==='function')?fmtDate(d):new Date(d).toLocaleDateString('bg-BG')}catch(_){return String(d||'')}};

return _portal(e('div',{className:'modal-overlay'+(dnClosing?' modal-closing':''),onClick:dnClose},
    e('div',{className:'modal-box'+(dnClosing?' modal-closing':''),style:{maxWidth:880},onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head'},
        e('h3',null,e('i',{className:'fas fa-bell',style:{color:'var(--warn)'}}),' Известия за наближаващ административен срок'),
        e('button',{className:'close-btn',onClick:dnClose,'aria-label':'Затвори'},e('i',{className:'fas fa-times'}))
    ),
    e('div',{className:'modal-body',style:{display:'flex',flexDirection:'column',gap:'.85rem'}},
        e('div',{style:{display:'flex',alignItems:'center',gap:'.5rem',padding:'.55rem .75rem',background:'var(--info-bg)',border:'1px solid var(--info-border)',borderRadius:'var(--r-xs)',fontSize:'.78rem',color:'var(--info)'}},
            e('i',{className:'fas fa-info-circle'}),
            e('span',null,'Системата ще изпрати персонализиран имейл до ръководителя на всеки избран проект с детайли за вида отчет, периода и крайния срок.')
        ),
        // ── Filters row ─────────────────────────────────────────
        e('div',{style:{display:'flex',gap:'1rem',flexWrap:'wrap',alignItems:'flex-end'}},
            e('div',{className:'form-field',style:{margin:0,minWidth:140}},
                e('label',null,'Хоризонт (дни)'),
                e('select',{className:'form-select',value:horizonDays,onChange:ev=>setHorizonDays(Number(ev.target.value)||7),disabled:loading||sending},
                    [3,7,14,30,60,90].map(d=>e('option',{key:d,value:d},'≤ '+d+' дни / просрочени'))
                )
            ),
            e('div',{className:'form-field',style:{margin:0,flex:1,minWidth:240}},
                e('label',null,'Видове отчети'),
                e('div',{style:{display:'flex',gap:'.5rem',flexWrap:'wrap'}},
                    Object.keys(typeLabels).map(t=>e('label',{key:t,style:{display:'inline-flex',alignItems:'center',gap:'.3rem',fontSize:'.78rem',cursor:'pointer'}},
                        e('input',{type:'checkbox',checked:!!typeFilter[t],onChange:ev=>setTypeFilter(p=>({...p,[t]:ev.target.checked})),disabled:loading||sending}),
                        typeLabels[t]
                    ))
                )
            ),
            e('button',{className:'btn btn-outline btn-sm',onClick:loadPreview,disabled:loading||sending,title:'Презареди списъка'},
                loading?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-sync-alt'}),' Презареди'
            )
        ),
        // ── Custom note ─────────────────────────────────────────
        e('div',{className:'form-field',style:{margin:0}},
            e('label',null,'Допълнителен коментар (по избор) — добавя се към края на имейла'),
            e('textarea',{value:customNote,onChange:ev=>setCustomNote(String(ev.target.value||'').slice(0,1500)),rows:2,placeholder:'Напр.: Моля, обърнете специално внимание на разбивката по перо „Разходи за командировки\".',disabled:sending,style:{resize:'vertical'}}),
            e('div',{style:{textAlign:'right',fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.15rem'}},customNote.length+' / 1500')
        ),
        // ── Recipients list ─────────────────────────────────────
        e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'.25rem',paddingBottom:'.4rem',borderBottom:'1px solid var(--border)'}},
            e('div',{style:{fontWeight:600,fontSize:'.85rem'}},
                e('i',{className:'fas fa-paper-plane',style:{marginRight:'.4rem',color:'var(--primary)'}}),
                'Получатели ',e('span',{className:'count-chip'},recipients.length)
            ),
            recipients.length>0&&!result&&e('div',{style:{display:'flex',gap:'.4rem'}},
                e('button',{className:'btn btn-ghost btn-sm',onClick:()=>toggleAll(true),disabled:sending},'Избери всички'),
                e('button',{className:'btn btn-ghost btn-sm',onClick:()=>toggleAll(false),disabled:sending},'Отмени всички')
            )
        ),
        loading?e('div',{style:{padding:'1.5rem',textAlign:'center',color:'var(--ink-4)'}},e('i',{className:'fas fa-spinner fa-spin'}),' Зареждане на списъка...')
        :error?e('div',{style:{padding:'.6rem .8rem',background:'var(--err-bg)',border:'1px solid var(--err-border)',color:'var(--err)',borderRadius:'var(--r-xs)',fontSize:'.82rem'}},e('i',{className:'fas fa-exclamation-circle',style:{marginRight:'.4rem'}}),error)
        :recipients.length===0?e('div',{className:'empty-state',style:{padding:'1.5rem'}},
            e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-check-circle'})),
            e('h4',null,'Няма наближаващи срокове'),
            e('p',null,'В избрания хоризонт от ',horizonDays,' дни няма проекти с предстоящи или просрочени отчети.')
        )
        :e('div',{style:{maxHeight:320,overflowY:'auto',border:'1px solid var(--border)',borderRadius:'var(--r-xs)'}},
            e('table',{style:{width:'100%',fontSize:'.78rem',borderCollapse:'collapse'}},
                e('thead',null,e('tr',{style:{background:'var(--bg-2)',position:'sticky',top:0}},
                    e('th',{style:{padding:'.4rem',width:32}},''),
                    e('th',{style:{padding:'.4rem',textAlign:'left'}},'Проект'),
                    e('th',{style:{padding:'.4rem',textAlign:'left'}},'Получател'),
                    e('th',{style:{padding:'.4rem',textAlign:'left'}},'Тип'),
                    e('th',{style:{padding:'.4rem',textAlign:'left'}},'Период'),
                    e('th',{style:{padding:'.4rem',textAlign:'left'}},'Срок'),
                    e('th',{style:{padding:'.4rem',textAlign:'right'}},'Статус')
                )),
                e('tbody',null,recipients.map((it)=>{
                    const k=keyFor(it);const noEmail=!it.leaderEmail;
                    return e('tr',{key:k,style:{borderTop:'1px solid var(--border)',opacity:noEmail?.55:1}},
                        e('td',{style:{padding:'.4rem',textAlign:'center'}},
                            e('input',{type:'checkbox',checked:!!selected[k]&&!noEmail,disabled:noEmail||sending,onChange:()=>toggleOne(it)})
                        ),
                        e('td',{style:{padding:'.4rem'}},e('div',{style:{fontWeight:600,maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},it.projectTitle),e('div',{style:{fontFamily:'monospace',fontSize:'.66rem',color:'var(--ink-4)'}},it.projectId)),
                        e('td',{style:{padding:'.4rem',fontFamily:'monospace',fontSize:'.72rem'}},noEmail?e('span',{style:{color:'var(--err)',fontStyle:'italic'}},'(няма имейл)'):it.leaderEmail),
                        e('td',{style:{padding:'.4rem'}},it.typeLabel||it.type),
                        e('td',{style:{padding:'.4rem'}},it.period),
                        e('td',{style:{padding:'.4rem'}},fmt(it.dueDate)),
                        e('td',{style:{padding:'.4rem',textAlign:'right'}},
                            it.overdue
                                ?e('span',{className:'badge',style:{background:'var(--err-bg)',color:'var(--err)',border:'1px solid var(--err-border)'}},'Просрочен')
                                :e('span',{className:'badge',style:{background:it.daysUntil<=2?'var(--err-bg)':'var(--warn-bg)',color:it.daysUntil<=2?'var(--err)':'var(--warn)',border:'1px solid '+(it.daysUntil<=2?'var(--err-border)':'var(--warn-border)')}},it.daysUntil+' дни')
                        )
                    );
                }))
            )
        ),
        noEmailCount>0&&e('div',{style:{fontSize:'.74rem',color:'var(--warn)'}},
            e('i',{className:'fas fa-exclamation-triangle',style:{marginRight:'.3rem'}}),
            noEmailCount+' проект(и) са без имейл на ръководител и ще бъдат пропуснати.'
        ),
        result&&e('div',{style:{padding:'.7rem .85rem',background:'var(--ok-bg)',border:'1px solid var(--ok-border)',color:'var(--ok)',borderRadius:'var(--r-xs)',fontSize:'.82rem'}},
            e('i',{className:'fas fa-check-circle',style:{marginRight:'.4rem'}}),
            'Изпратени: ',e('strong',null,result.sent),
            result.failed>0&&e('span',null,' · Неуспешни: ',e('strong',{style:{color:'var(--err)'}},result.failed)),
            result.skipped>0&&e('span',null,' · Пропуснати (без имейл): ',e('strong',null,result.skipped))
        )
    ),
    e('div',{className:'modal-footer'},
        e('button',{className:'btn btn-outline',onClick:dnClose,disabled:sending},result?'Затвори':'Отказ'),
        !result&&e('button',{className:'btn btn-primary',onClick:handleSend,disabled:sending||loading||selectedCount===0},
            sending?e('i',{className:'fas fa-spinner fa-spin'}):e('i',{className:'fas fa-paper-plane'}),
            ' ',sending?'Изпращане...':('Изпрати ('+selectedCount+')')
        )
    )
    )
));
};

/* ─── ACTION DROPDOWN ─── */
var ActionDropdown=memo(({items=[],btnClass='btn btn-sm btn-ghost'})=>{
  const[open,setOpen]=useState(false);
  const[pos,setPos]=useState({top:0,left:0});
  const btnRef=useRef(null);
  const menuRef=useRef(null);
  const toggle=useCallback(()=>{
    if(!open&&btnRef.current){
      const r=btnRef.current.getBoundingClientRect();
      setPos({top:r.bottom+4,left:Math.min(r.left,window.innerWidth-180)});
    }
    setOpen(o=>!o);
  },[open]);
  useEffect(()=>{
    if(!open)return;
    const onDown=ev=>{
      if(menuRef.current&&!menuRef.current.contains(ev.target)&&!btnRef.current?.contains(ev.target))setOpen(false);
    };
    const onKey=ev=>{if(ev.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',onDown);
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('pointerdown',onDown);document.removeEventListener('keydown',onKey);};
  },[open]);
  const menu=open?ReactDOM.createPortal(
    e('div',{ref:menuRef,className:'action-menu',style:{top:pos.top,left:pos.left}},
      items.map((it,i)=>it.separator?e('div',{key:i,className:'action-sep'}):e('button',{key:i,className:'action-item'+(it.danger?' danger':''),onClick:()=>{setOpen(false);it.action&&it.action();}},it.label))
    ),document.body
  ):null;
  return e(Fragment,null,
    e('button',{ref:btnRef,className:btnClass,onClick:toggle,title:'Действия'},'⋮'),
    menu
  );
});

/* ─── ROW CONTEXT MENU (v12.34.3) ─────────────────────────────────────────
 * Shared portal that renders a row's action menu at an arbitrary position.
 * Used by the "проектни предложения" tables (AdminView + ApplicantView) so
 * BOTH a right-click on desktop AND the "⋮" button on mobile open the SAME
 * actions menu (with "Преглед" as the first item). Position is computed by the
 * caller: right-click → cursor coords; button → near the trigger. The menu
 * closes on outside pointerdown, Escape, scroll, or item activation.
 *   <RowMenuPortal items={items} pos={pos} onClose={fn} />
 */
var RowMenuPortal=function({items=[],pos,onClose}){
  const menuRef=useRef(null);
  useEffect(function(){
    if(!pos)return;
    const onDown=function(ev){
      if(menuRef.current&&!menuRef.current.contains(ev.target))onClose&&onClose();
    };
    const onKey=function(ev){if(ev.key==='Escape')onClose&&onClose();};
    const onScroll=function(){onClose&&onClose();};
    document.addEventListener('pointerdown',onDown,true);
    document.addEventListener('keydown',onKey);
    window.addEventListener('scroll',onScroll,true);
    return function(){document.removeEventListener('pointerdown',onDown,true);document.removeEventListener('keydown',onKey);window.removeEventListener('scroll',onScroll,true);};
  },[pos,onClose]);
  if(!pos)return null;
  return ReactDOM.createPortal(
    e('div',{ref:menuRef,className:'action-menu row-context-menu',style:{top:pos.top,left:pos.left}},
      items.map(function(it,i){return it.separator?e('div',{key:i,className:'action-sep'}):e('button',{key:i,className:'action-item'+(it.danger?' danger':''),onClick:function(){onClose&&onClose();it.action&&it.action();}},it.icon?e('i',{className:'fas '+it.icon,style:{width:'1.1rem',textAlign:'center'}}):null,it.label);})
    ),document.body
  );
};
if(typeof window!=='undefined'){window.RowMenuPortal=RowMenuPortal;}

/* ─── STATS ROW (removed v12.49.37 per user request) ─── */

/* ─── UEV.confirm() — Promise-based styled confirm (QoL) ───
 * Replaces raw window.confirm() with the existing ConfirmModal so delete /
 * destructive actions get a consistent, accessible, branded dialog instead
 * of a browser-native popup. Returns a Promise<boolean>.
 *   const ok = await UEV.confirm('Сигурни ли сте?', {dangerous:true});
 * Mirrors the imperative shape of the legacy confirm() so call sites convert
 * with a one-line swap (await + boolean check). */
function UEVConfirm(message, opts){
  return new Promise(function(resolve){
    var _o = opts || {};
    if(typeof ConfirmModal==='undefined'){
      // Fallback to native confirm if the modal isn't available (e.g. CSP).
      try { resolve(window.confirm(message)); } catch(_) { resolve(false); }
      return;
    }
    var onConfirm=function(){ resolve(true); };
    var onCancel=function(){ resolve(false); };
    _portal(e(ConfirmModal,{
      message: message,
      confirmLabel: _o.confirmLabel || 'Потвърди',
      dangerous: !!_o.dangerous,
      onConfirm: onConfirm,
      onCancel: onCancel
    }));
  });
}
if(typeof window!=='undefined'){ window.UEVConfirm = UEVConfirm; }

/* ─── GLOBAL EXPOSURE ───────────────────────────────────────────────
 *  Defensive exports for cross-script availability in iframe and
 *  legacy build configurations where module bundling is absent.
 *  Each assignment is wrapped in try/catch so a single failure never
 *  blocks the entire list (e.g., when executed inside a sandboxed
 *  iframe where window is frozen). */
if(typeof window!=='undefined'){
  // v12.32.27: Direct assignment for EVERY shared component/helper. The
  // previous eval()-based loop was fragile — any single eval failure (CSP,
  // strict scope, minifier rename) left window.X undefined, and the
  // `var X = window.X || null` aliases in views-bundle.js then resolved to
  // null, producing React #130 ("Element type is invalid … got: null") when
  // a view like FormDetail (draft detail) tried to render it. Direct
  // assignment is bulletproof and also works under CSP.
  // v12.32.27-tdzfix: every entry is typeof-guarded so a single missing name
  // (e.g. a function-scoped identifier accidentally listed here) can NEVER
  // throw a ReferenceError and kill the whole export block.
  var _exp = {
    _portal:(typeof _portal!=='undefined')?_portal:undefined,
    _proxyDownload:(typeof _proxyDownload!=='undefined')?_proxyDownload:undefined,
    useModalClose:(typeof useModalClose!=='undefined')?useModalClose:undefined,
    ModalShell:(typeof ModalShell!=='undefined')?ModalShell:undefined,
    MultiSelect:(typeof MultiSelect!=='undefined')?MultiSelect:undefined,
    Badge:(typeof Badge!=='undefined')?Badge:undefined,
    ApplicantCell:(typeof ApplicantCell!=='undefined')?ApplicantCell:undefined,
    ConfirmModal:(typeof ConfirmModal!=='undefined')?ConfirmModal:undefined,
    ReturnCommentModal:(typeof ReturnCommentModal!=='undefined')?ReturnCommentModal:undefined,
    SkeletonShell:(typeof SkeletonShell!=='undefined')?SkeletonShell:undefined,
    OtpVerifyModal:(typeof OtpVerifyModal!=='undefined')?OtpVerifyModal:undefined,
    TwoFactorEnrollmentWizard:(typeof TwoFactorEnrollmentWizard!=='undefined')?TwoFactorEnrollmentWizard:undefined,
    SignaturePad:(typeof SignaturePad!=='undefined')?SignaturePad:undefined,
    SignatureModal:(typeof SignatureModal!=='undefined')?SignatureModal:undefined,
    DocumentPreviewModal:(typeof DocumentPreviewModal!=='undefined')?DocumentPreviewModal:undefined,
    InlineDocEditorModal:(typeof InlineDocEditorModal!=='undefined')?InlineDocEditorModal:undefined,
    DocumentPickerModal:(typeof DocumentPickerModal!=='undefined')?DocumentPickerModal:undefined,
    ViewModal:(typeof ViewModal!=='undefined')?ViewModal:undefined,
    FormDetail:(typeof FormDetail!=='undefined')?FormDetail:undefined,
    NewFormModal:(typeof NewFormModal!=='undefined')?NewFormModal:undefined,
    EditFormModal:(typeof EditFormModal!=='undefined')?EditFormModal:undefined,
    CorrectionFormModal:(typeof CorrectionFormModal!=='undefined')?CorrectionFormModal:undefined,
    Step2DocIframe:(typeof Step2DocIframe!=='undefined')?Step2DocIframe:undefined,
    ActionDropdown:(typeof ActionDropdown!=='undefined')?ActionDropdown:undefined,
    RowMenuPortal:(typeof RowMenuPortal!=='undefined')?RowMenuPortal:undefined,
    StatsRow:(typeof StatsRow!=='undefined')?StatsRow:undefined,
    DeadlineNotifyModal:(typeof DeadlineNotifyModal!=='undefined')?DeadlineNotifyModal:undefined,
    AccessibilityStatementModal:(typeof AccessibilityStatementModal!=='undefined')?AccessibilityStatementModal:undefined,
    QAModal:(typeof QAModal!=='undefined')?QAModal:undefined,
    QA_DATA:(typeof QA_DATA!=='undefined')?QA_DATA:undefined,
    typeLabels:(typeof typeLabels!=='undefined')?typeLabels:undefined
  };
  for (var _k in _exp) { try { if(_exp[_k]!==undefined) window[_k] = _exp[_k]; } catch(_){} }
}



/* ============================================================
   Accessibility Statement Modal — EU WAD 2016/2102 + БДС EN 301 549
   Mandated for public sector digital services. WCAG 2.1 AA compliant
   self-disclosure. Triggered from footer link.
   ============================================================ */
var AccessibilityStatementModal=({onClose})=>{
  const{closing,close}=useModalClose(onClose);
  const titleId='a11y-stmt-title';
  return _portal(e('div',{className:'modal-overlay'+(closing?' closing':''),onClick:close,role:'dialog','aria-modal':'true','aria-labelledby':titleId},
    e('div',{className:'modal-box modal-form'+(closing?' closing':''),onClick:ev=>ev.stopPropagation(),style:{maxWidth:760,width:'94vw'}},
      e('div',{className:'modal-head'},
        e('h3',{id:titleId},e('i',{className:'fas fa-universal-access','aria-hidden':'true',style:{marginRight:'.45rem',color:'#5b48d8'}}),'Декларация за достъпност'),
        e('button',{className:'close-btn',onClick:close,'aria-label':'Затвори диалога'},e('i',{className:'fas fa-times','aria-hidden':'true'}))
      ),
      e('div',{className:'modal-body',style:{maxHeight:'70vh',overflowY:'auto',lineHeight:1.6,fontSize:'.85rem'}},
        e('section',null,
          e('h4',{style:{marginTop:0}},'1. Институция и обхват'),
          e('p',null,'Икономически университет – Варна (ЕИК 000083619) се ангажира да осигурява достъпност на своята електронна система за управление на научноизследователската дейност в съответствие със ',e('strong',null,'Закона за електронното управление, Директива (ЕС) 2016/2102 на Европейския парламент и на Съвета и БДС EN 301 549 V3.2.1'),'.'),
          e('p',null,'Тази декларация се отнася до уеб-приложението „ERP Научни проекти" на адрес ',e('em',null,'scienceandresearch.ue-varna.bg'),'.')
        ),
        e('section',null,
          e('h4',null,'2. Статус на съответствие'),
          e('p',null,e('strong',null,'Частично съответствие'),' с ',e('strong',null,'WCAG 2.1, ниво AA'),'. Системата прилага: семантични HTML5 ориентири (header/nav/main/footer), ARIA-атрибути за модални прозорци (role=dialog, aria-modal, aria-labelledby), focus-trap и възстановяване на фокуса, поддръжка на ',e('code',null,'prefers-reduced-motion'),' и ',e('code',null,'prefers-contrast'),', клавишна навигация (Tab, Shift+Tab, Esc, „/" за бързо търсене), линк „Прескочи към съдържанието" (2.4.1), assertive aria-live за критични съобщения, минимални таргети 32px (2.5.5).')
        ),
        e('section',null,
          e('h4',null,'3. Известни ограничения'),
          e('ul',{style:{paddingLeft:'1.2rem'}},
            e('li',null,'Някои сложни визуализации (процесни диаграми, графики) разчитат на цвят за допълнителна информация — алтернативни табличен/текстов изглед се планира.'),
            e('li',null,'PDF-документите, генерирани от системата, се изпращат с вграден текстов слой, но не са таг-нати по PDF/UA. Текущо ограничение на Google Apps Script.'),
            e('li',null,'Някои динамично-добавени бутони с икона разчитат на ',e('code',null,'title'),'-атрибут за screen-reader контекст.')
          )
        ),
        e('section',null,
          e('h4',null,'4. Алтернативни канали'),
          e('p',null,'При невъзможност за работа със системата чрез помощни технологии, моля свържете се с НИИ – ИУ Варна:'),
          e('ul',{style:{paddingLeft:'1.2rem'}},
            e('li',null,'Е-поща: ',e('a',{href:'mailto:nid@ue-varna.bg'},'nid@ue-varna.bg')),
            e('li',null,'Телефон: ',e('a',{href:'tel:+359882164725'},'+359 882 164 725')),
            e('li',null,'Адрес: бул. „Княз Борис I" 77, 9002 Варна')
          )
        ),
        e('section',null,
          e('h4',null,'5. Процедура по прилагане'),
          e('p',null,'Ако не получите задоволителен отговор в срок от 30 дни, можете да подадете жалба до ',e('strong',null,'Държавна агенция „Електронно управление"'),' на адрес ',e('a',{href:'https://e-gov.bg/',target:'_blank',rel:'noopener'},'e-gov.bg'),' или до ',e('strong',null,'Комисията за защита от дискриминация'),'.')
        ),
        e('section',null,
          e('h4',null,'6. Подготовка на декларацията'),
          e('p',{style:{fontSize:'.78rem',color:'var(--ink-4)'}},'Декларацията е изготвена на 04.05.2026 г. чрез самооценка на съответствието съгласно методиката на ДАЕУ. Последна актуализация: 04.05.2026 г.')
        )
      ),
      e('div',{className:'modal-footer'},
        e('button',{className:'btn btn-primary',onClick:close,autoFocus:true},'Затвори')
      )
    )
  ));
};

/* ════════════════════════════════════════════════════════════════════
 *  QAModal — Frequently Asked Questions
 *  ==================================================================
 *  Accordion-style Q&A modal with search, i18n, and animations.
 *  Each question toggles its answer with a slide-down animation.
 *  Data: Q&A pairs in both BG and EN.
 * ════════════════════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════════════════
 *  NotificationBell — in-app notification centre (EPIC: Notification Center)
 *  Bell + unread badge in the topbar; dropdown lists notifications
 *  (getnotifications) with "mark all read" (marknotificationsseen).
 *  Backend: handleGetNotifications / handleMarkNotificationsSeen (api.php).
 */
var NotificationBell = function (props) {
  var userEmail = props.userEmail || '';
  var lang = props.lang === 'en' ? 'en' : 'bg';
  var T = {
    title: lang === 'en' ? 'Notifications' : 'Известия',
    empty: lang === 'en' ? 'No notifications' : 'Няма известия',
    markAll: lang === 'en' ? 'Mark all as read' : 'Маркирай всички като прочетени',
    loading: lang === 'en' ? 'Loading…' : 'Зареждане…',
    error: lang === 'en' ? 'Could not load notifications' : 'Известията не можаха да се заредят'
  };
  var _open = useState(false);
  var open = _open[0]; var setOpen = _open[1];
  var _list = useState([]);
  var list = _list[0]; var setList = _list[1];
  var _unread = useState(typeof props.initialUnread === 'number' ? props.initialUnread : 0);
  var unread = _unread[0]; var setUnread = _unread[1];
  var _loading = useState(false);
  var loading = _loading[0]; var setLoading = _loading[1];
  var _err = useState(false);
  var err = _err[0]; var setErr = _err[1];
  function timeAgo(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return '';
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return lang === 'en' ? 'just now' : 'сега';
    if (s < 3600) { var m = Math.floor(s / 60); return m + (lang === 'en' ? 'm ago' : ' мин'); }
    if (s < 86400) { var h = Math.floor(s / 3600); return h + (lang === 'en' ? 'h ago' : ' ч'); }
    var d = Math.floor(s / 86400); return d + (lang === 'en' ? 'd ago' : ' д');
  }
  function load() {
    if (!userEmail) return;
    setLoading(true); setErr(false);
    api('getnotifications', { email: userEmail }).then(function (r) {
      if (r && r.success) {
        var items = Array.isArray(r.notifications) ? r.notifications : [];
        setList(items);
        setUnread(items.filter(function (n) { return !n.is_read; }).length);
      } else { setErr(true); }
    }).catch(function () { setErr(true); }).then(function () { setLoading(false); });
  }
  useEffect(function () { load(); }, [userEmail]);
  function markAll() {
    if (!userEmail) return;
    api('marknotificationsseen', { email: userEmail }).then(function (r) {
      if (r && r.success) {
        setList(list.map(function (n) { return Object.assign({}, n, { is_read: 1 }); }));
        setUnread(0);
        if (typeof toast === 'function') toast(lang === 'en' ? 'All notifications marked as read' : 'Всички известия са маркирани като прочетени', 'success');
      }
    }).catch(function () {});
  }
  function openItem(n) {
    if (n.link) { try { window.location.href = n.link; } catch (_) {} }
    if (!n.is_read) {
      api('marknotificationsseen', { email: userEmail }).then(function () {
        setUnread(function (u) { return Math.max(0, u - 1); });
        setList(list.map(function (x) { return x.id === n.id ? Object.assign({}, x, { is_read: 1 }) : x; }));
      }).catch(function () {});
    }
    setOpen(false);
  }
  return e('div', { className: 'notif-bell-wrap' },
    e('button', {
      type: 'button', className: 'topbar-link notif-bell-btn',
      'aria-label': T.title + (unread ? ' (' + unread + ')' : ''),
      title: T.title, onClick: function () { setOpen(!open); }
    },
      e('i', { className: 'fas fa-bell' }),
      unread > 0 ? e('span', { className: 'notif-badge', style: { marginLeft: '.25rem', fontSize: '.6rem', padding: '.06rem .36rem', background: 'var(--err)', color: '#fff', borderRadius: '999px', fontWeight: 700, verticalAlign: 'middle' } }, unread > 99 ? '99+' : String(unread)) : null
    ),
    open ? e('div', { className: 'notif-panel-overlay', onClick: function () { setOpen(false); } },
      e('div', { className: 'notif-panel', onClick: function (ev) { ev.stopPropagation(); }, role: 'dialog', 'aria-label': T.title },
        e('div', { className: 'notif-panel-head' },
          e('span', { className: 'notif-panel-title' }, T.title),
          unread > 0 ? e('button', { type: 'button', className: 'notif-markall', onClick: markAll }, T.markAll) : null
        ),
        loading ? e('div', { className: 'notif-empty' }, T.loading)
          : err ? e('div', { className: 'notif-empty', style: { color: 'var(--err)' } }, T.error)
          : (list.length === 0 ? e('div', { className: 'notif-empty' }, T.empty)
            : e('div', { className: 'notif-list' },
                list.map(function (n) {
                  return e('div', {
                    key: n.id, className: 'notif-item' + (n.is_read ? ' read' : ' unread'),
                    onClick: function () { openItem(n); }
                  },
                    e('div', { className: 'notif-item-title' }, n.title || (lang === 'en' ? 'Notification' : 'Известие')),
                    n.body ? e('div', { className: 'notif-item-body' }, n.body) : null,
                    e('div', { className: 'notif-item-time' }, timeAgo(n.created))
                  );
                })
              ))
      )
    ) : null
  );
};
try { window.NotificationBell = NotificationBell; } catch (_) {}
try { window.AccessibilityStatementModal = AccessibilityStatementModal; } catch (_) {}
try { window.QAModal = QAModal; } catch (_) {}
try { _regView('NotificationBell', NotificationBell); } catch (_) {}
try { _regView('AccessibilityStatementModal', AccessibilityStatementModal); } catch (_) {}
try { _regView('QAModal', QAModal); } catch (_) {}

var QA_DATA = [
  { id: 'q01',
    bg_q: 'Какво е UEV-ERP?',
    en_q: 'What is UEV-ERP?',
    bg_a: 'UEV-ERP е браузър-базирана ERP система за управление на пълния жизнен цикъл на научноизследователските проекти в Икономически университет – Варна. Покрива всичко — от обявяване на конкурс и приемане на проектни предложения, през рецензиране и класиране, до подписване на договори, изпълнение, отчитане и архивиране. Данните са в Google Sheets, файловете — в Google Drive.',
    en_a: 'UEV-ERP is a browser-based ERP system for managing the full lifecycle of research projects at the University of Economics – Varna. It covers everything — from competition announcement and proposal intake, through review and ranking, to contract signing, execution, reporting and archiving. Data is stored in Google Sheets, files in Google Drive.' },
  { id: 'q02',
    bg_q: 'Какви типове проекти се поддържат?',
    en_q: 'What project types are supported?',
    bg_a: 'Системата поддържа 4 типа проекти: ФНИ (Фундаментални научни изследвания, до 12 000 €, 12–36 месеца), ПНИ (Приложни научни изследвания, до 12 000 €, 12–36 месеца), ДНП (Докторантски проекти, до 5 000 €, 12 месеца), и НПФ (Научни форуми, катедрено ниво до 3 000 €, кръгла маса до 2 500 €, университетско ниво до 6 000 €, 1–3 месеца). Всеки тип има специфична бюджетна структура и изисквания.',
    en_a: 'The system supports 4 project types: FNI (Fundamental Research, up to €12,000, 12–24 months), PNI (Applied Research, up to €12,000, 12–24 months), DNP (Doctoral Dissertation Support, up to €5,000, 12 months), and NPF (Scientific Forums, up to €5,115, 1–6 months). Each type has a specific budget structure and requirements.' },
  { id: 'q03',
    bg_q: 'Как да подам проектно предложение?',
    en_q: 'How do I submit a project proposal?',
    bg_a: 'Влезте с Google акаунт (@ue-varna.bg), отидете в таб "Предложения" → "Ново предложение". Изберете конкурс, попълнете типа проект, заглавие, описание, екип и бюджет. Можете да запазите чернова или да подадете финално. При подаване се изисква електронен подпис и OTP код от имейл за двуфакторна автентикация.',
    en_a: 'Sign in with your Google account (@ue-varna.bg), go to "Proposals" → "New Proposal". Select a competition, fill in the project type, title, description, team, and budget. You can save a draft or submit final. Submission requires an e-signature and an OTP code from email for two-factor authentication.' },
  { id: 'q04',
    bg_q: 'Какви са бюджетните ограничения?',
    en_q: 'What are the budget limits?',
    bg_a: 'Всеки тип проект има максимален бюджет: ФНИ и ПНИ — до 12 000 €; ДНП — до 5 000 €; НПФ — до 6 000 €. Има и процентни ограничения за отделните разходни групи: литература ≤ 10%, бази данни ≤ 40%, консумативи ≤ 5% (или ≤ 10% за ДНП), възнаграждения ≤ 10% (или ≤ 35% с докторанти/млади учени), външни услуги ≤ 20–25%, командировки в чужбина ≤ 20% (ФНИ) / 15% (ПНИ), емпирично ≤ 20% (ФНИ) / 25% (ПНИ). При избор на тип проект, бюджетният редактор показва само приложимите за този тип разходни групи.',
    en_a: 'Each project type has a maximum budget: FNI and PNI — up to €12,000; DNP — up to €5,000; NPF — up to €5,115. There are also percentage limits per cost group: literature ≤ 10%, consumables ≤ 5% (or ≤ 10% for DNP), salaries ≤ 10% (or ≤ 35% with PhD/young scientists), external services ≤ 20–25%, travel ≤ 15–20%. When selecting a project type, the budget editor shows only the cost groups applicable to that type.' },
  { id: 'q05',
    bg_q: 'Как работи процесът на рецензиране?',
    en_q: 'How does the review process work?',
    bg_a: 'След като предложението премине административна проверка, ЦКК назначава минимум 2-ма рецензенти (вътрешни или външни). Всеки рецензент попълва 100-точкова рубрика по 5 категории: научна стойност, методология, екип, бюджет, осъществимост. Оценките са конфиденциални. Рецензентите могат да запазват чернови локално. След консолидиране на оценките, системата автоматично определя дали проектът е над 50%-ия праг. Срокът за рецензия е 10 дни.',
    en_a: 'After the proposal passes administrative review, CKK assigns at least 2 reviewers (internal or external). Each reviewer completes a 100-point rubric across 5 categories: scientific merit, methodology, team, budget, feasibility. Scores are confidential. Reviewers can save drafts locally. After score consolidation, the system automatically determines if the project exceeds the 50% threshold. The review deadline is 10 days.' },
  { id: 'q06',
    bg_q: 'Как да подпиша договор?',
    en_q: 'How do I sign a contract?',
    bg_a: 'След одобрение от Академичния съвет, системата генерира договор от шаблон. Натиснете "Прегледай и подпиши" в дашборда. Подписването изисква две стъпки: (1) Canvas подпис с мишка или тъчскрийн, и (2) OTP код изпратен на имейла ви. След подписване, договорът автоматично се архивира в Drive папка "Подписани документи".',
    en_a: 'After approval by the Academic Council, the system generates a contract from a template. Click "Review and Sign" in the dashboard. Signing requires two steps: (1) Canvas signature with mouse or touchscreen, and (2) OTP code sent to your email. After signing, the contract is automatically archived in the Drive folder "Signed Documents".' },
  { id: 'q07',
    bg_q: 'Какви са изискванията за проектния екип?',
    en_q: 'What are the team requirements?',
    bg_a: 'Екипът включва ръководител и членове. Ръководителят трябва да е хабилитиран научен ръководител от ИУ-Варна и може да води само 1 активен проект във ФНИ/ПНИ. Членовете могат да участват в до 2 активни проекта. Системата автоматично проверява R.7 (дублиране на ръководител) и R.8 (лимит на участия). Екипът може да включва млади учени (до 35 г.), докторанти и външни сътрудници.',
    en_a: 'The team includes a leader and members. The leader must be a habilitated lecturer from UE-Varna and can lead only 1 active FNI/PNI project. Members can participate in up to 2 active projects. The system automatically checks R.7 (leader duplication) and R.8 (participation limit). The team can include young scientists (under 35), PhD students, and external collaborators.' },
  { id: 'q08',
    bg_q: 'Как да подам отчет по проект?',
    en_q: 'How do I submit a project report?',
    bg_a: 'Отидете в таб "Отчетност" → "Проектни отчети". Формулярите за отчет (междинен / годишен / финален) се появяват автоматично 14 дни преди срока. Попълнете напредъка, прикачете файлове и подайте. Просрочените проекти получават статус report_overdue, който блокира бъдещо кандидатстване. МОН отчетите са в под-таб "МОН отчети" с KPI dashboard.',
    en_a: 'Go to "Reporting" → "Project Reports". Report forms (interim / annual / final) appear automatically 14 days before the deadline. Fill in progress, attach files, and submit. Overdue projects receive report_overdue status, which blocks future applications. MoES reports are in the "MoES Reports" sub-tab with a KPI dashboard.' },
  { id: 'q09',
    bg_q: 'Какви са GDPR правата ми?',
    en_q: 'What are my GDPR rights?',
    bg_a: 'Системата поддържа правата по GDPR: Чл. 15 (достъп до данни) — JSON експорт от Профил → Поверителност; Чл. 16 (корекция) — редакция на лични данни; Чл. 17 (право да бъдеш забравен) — заявка за анонимизация. Всички действия се записват в SHA-256 одитна верига. Автоматична анонимизация на записи > 5 години се изпълнява всяка неделя в 02:00 ч.',
    en_a: 'The system supports GDPR rights: Art. 15 (data access) — JSON export from Profile → Privacy; Art. 16 (rectification) — edit personal data; Art. 17 (right to be forgotten) — anonymization request. All actions are recorded in a SHA-256 audit chain. Automatic anonymization of records > 5 years runs every Sunday at 02:00.' },
  { id: 'q10',
    bg_q: 'Как да се свържа с администратор?',
    en_q: 'How do I contact an administrator?',
    bg_a: 'Можете да се свържете с НИИ – ИУ Варна на: имейл nid@ue-varna.bg, телефон +359 882 164 725, или на адрес: бул. "Княз Борис I" 77, 9002 Варна. За технически проблеми използвайте контактната форма в приложението или пишете на посочения имейл.',
    en_a: 'You can contact NII – UE Varna at: email nid@ue-varna.bg, phone +359 882 164 725, or address: 77 Knyaz Boris I Blvd., 9002 Varna. For technical issues, use the contact form in the application or write to the provided email.' },
  { id: 'q11',
    bg_q: 'Къде мога да видя публичните резултати от конкурси?',
    en_q: 'Where can I see public competition results?',
    bg_a: 'Публичните резултати са достъпни без вход на адрес: scienceandresearch.ue-varna.bg/nauchni-proekti/?public=results. Показват се анонимизирани класирания (тема, тип, направление, оценка, ранг) без лични имена и e-mail адреси, в съответствие с Регламент (ЕС) 2016/679.',
    en_a: 'Public results are available without login at: scienceandresearch.ue-varna.bg/nauchni-proekti/?public=results. Anonymized rankings are shown (topic, type, area, score, rank) without personal names and email addresses, in compliance with Regulation (EU) 2016/679.' },
  { id: 'q12',
    bg_q: 'Как работи двуфакторната автентикация (2FA)?',
    en_q: 'How does two-factor authentication (2FA) work?',
    bg_a: 'За действия с правна тежест (подписване на договор, подаване на предложение) системата изисква OTP код. Кодът (6 цифри, формат G-XXXXXX) се изпраща на имейла ви и е валиден 10 минути. За подписване се комбинира с Canvas подпис. Това отговаря на изискванията на ЗЕДЕУУ (ДВ бр. 34/2001).',
    en_a: 'For legally binding actions (contract signing, proposal submission) the system requires an OTP code. The code (6 digits, format G-XXXXXX) is sent to your email and is valid for 10 minutes. For signing, it is combined with a Canvas signature. This complies with ZEDEUU requirements (SG No. 34/2001).' }
];

// Ensure QA_DATA is exposed AFTER its declaration (it is defined above; the
// consolidated export block runs earlier and would otherwise capture it as
// undefined). QAModal reads window.QA_DATA / QA_DATA at render time.
try { window.QA_DATA = QA_DATA; } catch(_){}

// QA_DATA exported via consolidated global exposure block

function QAModal(_props) {
  if (typeof React === 'undefined') return null;

  var props = _props || {};
  var onClose = typeof props.onClose === 'function' ? props.onClose : function () {};
  var lang = String(props.lang || (typeof localStorage !== 'undefined' ? localStorage.getItem('erp-lang') : '') || 'bg');

  var hasShell = (typeof useModalClose === 'function') && (typeof _portal === 'function');
  var mc = hasShell ? useModalClose(onClose) : null;
  var qClosing = hasShell ? mc.closing : false;
  var qClose = hasShell ? mc.close : onClose;

  var s0 = useState(null); var openId = s0[0]; var setOpenId = s0[1];
  var s1 = useState('');  var search = s1[0]; var setSearch = s1[1];

  var toggleQA = function (id) {
    if (hasShell && qClosing) return;
    setOpenId(function (prev) { return prev === id ? null : id; });
  };

  var qField = lang === 'bg' ? 'bg_q' : 'en_q';
  var aField = lang === 'bg' ? 'bg_a' : 'en_a';

  var filtered = useMemo(function () {
    var qs = QA_DATA.slice();
    if (search.trim()) {
      var s = search.toLowerCase();
      qs = qs.filter(function (item) {
        return (item.bg_q || '').toLowerCase().indexOf(s) !== -1 ||
               (item.en_q || '').toLowerCase().indexOf(s) !== -1 ||
               (item.bg_a || '').toLowerCase().indexOf(s) !== -1 ||
               (item.en_a || '').toLowerCase().indexOf(s) !== -1;
      });
    }
    return qs;
  }, [search, lang]);

  var titleBg = 'Често задавани въпроси';
  var titleEn = 'Frequently Asked Questions';
  var subtitleBg = 'Кликнете върху въпрос за да видите отговора';
  var subtitleEn = 'Click a question to see the answer';
  var searchPlaceholderBg = 'Търсете въпрос…';
  var searchPlaceholderEn = 'Search questions…';
  var noResultsBg = 'Няма намерени резултати.';
  var noResultsEn = 'No results found.';
  var closeBg = 'Затвори';
  var closeEn = 'Close';

  var isBg = lang === 'bg';

  var head = e('div', { className: 'modal-head' },
    e('h3', null, e('i', { className: 'fas fa-circle-question', style: { marginRight: '.4rem', color: 'var(--primary)' } }),
      isBg ? titleBg : titleEn),
    e('button', { type: 'button', className: 'close-btn', 'aria-label': isBg ? closeBg : closeEn, onClick: hasShell ? qClose : onClose },
      e('i', { className: 'fas fa-times' }))
  );

  var body = e('div', { className: 'modal-body', style: { maxHeight: '65vh', overflowY: 'auto', padding: '1rem 1.2rem' } },
    /* Search bar */
    e('div', { style: { marginBottom: '1rem', position: 'relative' } },
      e('i', { className: 'fas fa-search', style: { position: 'absolute', left: '.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)', fontSize: '.82rem' } }),
      e('input', {
        type: 'text',
        value: search,
        placeholder: isBg ? searchPlaceholderBg : searchPlaceholderEn,
        onChange: function (ev) { setSearch(ev.target.value); },
        style: {
          width: '100%', padding: '.6rem .8rem .6rem 2.2rem', fontSize: '.84rem',
          border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--bg)',
          color: 'var(--ink)', outline: 'none', transition: 'border-color .2s, box-shadow .2s'
        },
        onFocus: function (ev) { ev.target.style.borderColor = 'var(--primary)'; ev.target.style.boxShadow = '0 0 0 2px var(--primary-dim)'; },
        onBlur: function (ev) { ev.target.style.borderColor = 'var(--border)'; ev.target.style.boxShadow = 'none'; }
      })
    ),

    /* Subtitle */
    e('p', { style: { fontSize: '.76rem', color: 'var(--ink-4)', marginBottom: '.85rem', fontStyle: 'italic' } },
      isBg ? subtitleBg : subtitleEn),

    /* Q&A list */
    filtered.length === 0
      ? e('div', { style: { textAlign: 'center', padding: '2rem 1rem', color: 'var(--ink-4)' } },
          e('i', { className: 'fas fa-search', style: { fontSize: '2rem', display: 'block', marginBottom: '.5rem', opacity: .4 } }),
          isBg ? noResultsBg : noResultsEn)
      : filtered.map(function (item) {
          var isOpen = openId === item.id;
          var qText = item[qField] || item.bg_q;
          var aText = item[aField] || item.bg_a;
          return e('div', {
            key: item.id,
            style: {
              marginBottom: '.5rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
              background: isOpen ? 'var(--surface)' : 'var(--bg)',
              transition: 'background .25s ease, box-shadow .25s ease',
              boxShadow: isOpen ? '0 2px 8px rgba(0,0,0,.06)' : 'none',
              overflow: 'hidden'
            }
          },
            /* Question row */
            e('button', {
              type: 'button',
              onClick: function () { toggleQA(item.id); },
              style: {
                width: '100%', textAlign: 'left', padding: '.75rem .9rem', fontSize: '.84rem',
                fontWeight: 600, color: isOpen ? 'var(--primary)' : 'var(--ink)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'flex-start', gap: '.5rem',
                transition: 'color .2s ease', lineHeight: 1.4
              },
              onMouseEnter: function (ev) { if (!isOpen) ev.currentTarget.style.color = 'var(--primary)'; },
              onMouseLeave: function (ev) { if (!isOpen) ev.currentTarget.style.color = 'var(--ink)'; },
              'aria-expanded': isOpen
            },
              e('i', {
                className: 'fas fa-' + (isOpen ? 'minus-circle' : 'plus-circle'),
                style: { flexShrink: 0, marginTop: '.1rem', fontSize: '.82rem', color: isOpen ? 'var(--primary)' : 'var(--ink-4)', transition: 'transform .3s ease, color .2s ease' }
              }),
              e('span', null, qText)
            ),
            /* Answer panel — animated height */
            e('div', {
              style: {
                maxHeight: isOpen ? '600px' : '0',
                overflow: 'hidden',
                transition: 'max-height .4s cubic-bezier(.4,0,.2,1), padding .3s ease',
                padding: isOpen ? '0 .9rem .8rem .9rem' : '0 .9rem'
              },
              'aria-hidden': !isOpen
            },
              e('div', {
                style: {
                  padding: '.65rem .7rem', background: 'var(--bg)', borderRadius: 'var(--r-sm)',
                  fontSize: '.76rem', lineHeight: 1.55, color: 'var(--ink-2)',
                  borderLeft: '3px solid var(--primary)', opacity: isOpen ? 1 : 0,
                  transform: isOpen ? 'translateY(0)' : 'translateY(-8px)',
                  transition: 'opacity .3s ease .1s, transform .3s ease .1s'
                }
              }, aText)
            )
          );
        })
  );

  var foot = e('div', { className: 'modal-footer' },
    e('button', { className: 'btn btn-primary', onClick: hasShell ? qClose : onClose, autoFocus: true },
      isBg ? closeBg : closeEn)
  );

  return hasShell ? _portal(
    e('div', { className: 'modal-overlay' + (qClosing ? ' modal-closing' : ''), onClick: hasShell ? qClose : onClose },
      e('div', { className: 'modal-box qa-modal' + (qClosing ? ' modal-closing' : ''), onClick: function (ev) { ev.stopPropagation(); }, style: { maxWidth: '640px' } },
        head, body, foot
      )
    )
  ) : e('div', { className: 'modal-overlay', onClick: onClose },
      e('div', { className: 'modal-box qa-modal', onClick: function (ev) { ev.stopPropagation(); }, style: { maxWidth: '640px' } },
        head, body, foot
      )
    );
}

// QAModal exported via consolidated global exposure block above

/* ═══════════════════════════════════════════════════════════════════════════
 *  DocumentVisualizer — dedicated document visualization element
 *  v3.39.14-docviz: A responsive grid of document cards that render each
 *  document LIVE inside the dashboard, with mode-aware behaviour:
 *    • VIEW  (admins): official Google Drive /preview iframe — read-only,
 *      Google allows /preview framing (only /edit is CSP-blocked), so the
 *      admin sees the actual rendered document (seals/photos/layout) inline.
 *    • EDIT  (applicants): the ERP's own editable copy (documents.content)
 *      loaded via the inline text editor with a Save button — the same
 *      authoritative copy the proxy serves, never fighting Google CSP.
 *  Each card carries a clear mode badge ("Преглед" / "Редакция") so the
 *  viewer and the applicant never confuse read-only vs editable.
 *
 *  This is the stable, CSP-safe replacement for the old dead-end
 *  "Документът е готов" card: it VISUALISES the document inline for both
 *  roles instead of showing a download prompt.
 * ═══════════════════════════════════════════════════════════════════════════ */
var DocumentVisualizer = function (props) {
  var documents = props.documents || [];
  var mode = props.mode === 'edit' ? 'edit' : 'view'; // admin=view, applicant=edit
  var isAdmin = !!props.isAdmin;
  var onRefresh = props.onRefresh;
  var onOpen = props.onOpen;
  var userEmail = props.userEmail || (typeof _currentUserEmail !== 'undefined' ? _currentUserEmail : '');
  var formId = props.formId || '';

  // Resolve a usable Drive file id for the official preview iframe.
  function _fidOf(doc) {
    var id = (typeof _driveIdFromDoc === 'function' ? _driveIdFromDoc(doc) : null) || doc.driveId || doc.id || '';
    if (id && (typeof _isValidDriveId === 'function' ? _isValidDriveId(id) : false)) return id;
    // ERP-owned ids (up_/copied_) have no Drive preview; edit mode still works.
    return '';
  }

  return e('div', { className: 'doc-viz-grid' },
    documents.length === 0
      ? e('div', { className: 'doc-viz-empty', style: { padding: '2rem', textAlign: 'center', color: 'var(--ink-4)' } },
          e('i', { className: 'fas fa-folder-open', style: { fontSize: '2rem', opacity: .4 } }),
          e('p', { style: { marginTop: '.6rem' } }, 'Няма налични документи за преглед.'))
      : documents.map(function (doc, i) {
          return e(DocumentVizCard, {
            key: doc.id || ('dv' + i),
            doc: doc,
            mode: mode,
            isAdmin: isAdmin,
            fid: _fidOf(doc),
            userEmail: userEmail,
            formId: formId,
            onRefresh: onRefresh,
            onOpen: onOpen
          });
        })
  );
};

var DocumentVizCard = function (props) {
  var doc = props.doc;
  var mode = props.mode;
  // v12.37.6-yai: recover the Drive file id from the DOC ITSELF (yai.free.bg
  // parity), not only from props.fid. _driveIdFromDoc scans driveId, id,
  // previewLink, webViewLink, downloadUrl and openLink — so any Drive-backed
  // document (including 'Моите документи' .docx files whose id lives in
  // downloadUrl) embeds the native Google /preview viewer in view
  // mode instead of the blank 'Документ' placeholder. props.fid stays as the
  // final fallback for synthetic-id docs.
  var fid = _driveIdFromDoc(doc) || props.fid || '';
  var isAdmin = props.isAdmin;
  var onOpen = props.onOpen;
  var vis = (typeof getDocVisuals === 'function') ? getDocVisuals(doc) : { icon: 'fa-file', label: 'Документ', cssClass: '' };
  var isTextLike = !!(doc.content && String(doc.content).trim());
  var isOfficeOrPdf = !fid && (doc.name || '').match(/\.(docx?|xlsx?|pdf)$/i);

  var editContentState = useState(isTextLike ? doc.content : '');
  var editContent = editContentState[0]; var setEditContent = editContentState[1];
  var editingState = useState(mode === 'edit');
  var editing = editingState[0]; var setEditing = editingState[1];
  var loadingState = useState(false);
  var loading = loadingState[0]; var setLoading = loadingState[1];
  var savingState = useState(false);
  var saving = savingState[0]; var setSaving = savingState[1];
  var dirtyState = useState(false);
  var dirty = dirtyState[0]; var setDirty = dirtyState[1];
  var iframeErrState = useState(false);
  var iframeError = iframeErrState[0]; var setIframeError = iframeErrState[1];
  var iframeRef = useRef(null);
  var _erpId = doc.fileId || doc.id || fid;
  // v12.32.39-universal: full-visual byte rendering inside the card. Pulls the
  // blob via downloadDocument (DB → GAS → drive-direct) and renders Word/Excel/
  // PDF/images with UEVDocViewer, so the card never dead-ends on Google.
  var fvState = useState(null);
  var fv = fvState[0]; var setFv = fvState[1];
  var fvFailState = useState(false);
  var fvFailed = fvFailState[0]; var setFvFailed = fvFailState[1];
  var fvRef = useRef(null);
  var _fvTriedRef = useRef(false);
  var _fvDoneRef = useRef('');
  useEffect(function () {
    if (mode !== 'view') return;
    if (_fvTriedRef.current) return;
    if (isTextLike) return;
    // Try bytes when: no Drive preview available, OR the Drive iframe errored.
    if (fid && !iframeError) return;
    if (!_erpId) return;
    _fvTriedRef.current = true;
    var _sid=(window.STATE&&window.STATE.sessionId)||(window.__SESSION_ID)||'';
    var p = (typeof api === 'function') ? api('downloadDocument', { docId: _erpId, name: doc.name || '', userId: _sid }) : Promise.resolve(null);
    p.then(function (r) {
      if (!r || !r.success || r.kind !== 'blob' || !r.b64) return;
      var mime = String(r.mimeType || 'application/octet-stream').toLowerCase();
      var kf = (window.UEVDocViewer && window.UEVDocViewer.kindFor) ? window.UEVDocViewer.kindFor(mime, r.name || doc.name || '') : '';
      if (kf === 'pdf' || kf === 'docx' || kf === 'xlsx' || kf === 'img') setFv({ mime: mime, b64: r.b64, name: r.name || doc.name || '' });
    }).catch(function () {});
  }, [mode, fid, iframeError, isTextLike, _erpId]);
  useEffect(function () {
    if (fv && fv.b64 && fvRef.current && typeof window.UEVDocViewer !== 'undefined') {
      var key = (fv.mime || '') + ':' + fv.b64.length;
      if (_fvDoneRef.current === key) return;
      _fvDoneRef.current = key;
      window.UEVDocViewer.render(fvRef.current, { mime: fv.mime, b64: fv.b64, name: fv.name }).then(function (ok) {
        if (!ok) setFvFailed(true);
      }).catch(function () { setFvFailed(true); });
    }
  }, [fv]);

  // VIEW mode: when no Drive preview is available (office/pdf with no fid, or
  // ERP-owned id), load the ERP's own stored content as text so the doc is still
  // VISIBLE inside the card (not a dead-end prompt).
  useEffect(function () {
    if (mode !== 'view') return;
    if (fid) return;                 // official preview iframe handles it
    if (isTextLike) return;          // already have content
    var cancelled = false;
    setLoading(true);
    var p = (typeof api === 'function')
      ? api('getdocumentcontent', { docId: _erpId })
      : Promise.resolve(null);
    p.then(function (res) {
      if (cancelled) return;
      if (res && res.success && res.content) setEditContent(res.content);
    }).catch(function () { /* keep empty — card shows friendly state */ })
      .finally(function () { if (!cancelled) setLoading(false); });
    return function () { cancelled = true; };
  }, [mode, fid, isTextLike, _erpId]);

  function handleSave() {
    if (!_erpId) return;
    setSaving(true);
    var payload = {
      docId: _erpId, formId: props.formId, content: editContent,
      name: doc.name || 'Document', mimeType: doc.mimeType || 'text/plain',
      userId: props.userEmail || ''
    };
    (typeof api === 'function' ? api('savedocumentcontent', payload) : Promise.reject(new Error('api n/a')))
      .then(function () {
        setDirty(false);
        try { window._refreshAllDocuments && window._refreshAllDocuments(true); } catch (_) {}
        if (typeof props.onRefresh === 'function') props.onRefresh(true);
        if (typeof toast === 'function') toast('Промените са запазени в системата.', 'success');
      })
      .catch(function (err) {
        if (typeof toast === 'function') toast((err && err.message) || 'Грешка при запис', 'error');
      })
      .finally(function () { setSaving(false); });
  }

  function handleDownload() {
    if (fid && typeof window._proxyDownload === 'function') { window._proxyDownload(fid, doc.name, ''); return; }
    if (doc.downloadUrl) { window.open(doc.downloadUrl, '_blank', 'noopener,noreferrer'); return; }
    if (isTextLike || editContent) {
      var blob = new Blob([editContent || doc.content], { type: 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a'); a.href = url; a.download = (doc.name || 'document') + '.txt';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } else { if (typeof toast === 'function') toast('Файлът не е достъпен за изтегляне', 'warn'); }
  }

  // v12.35.0-driveembed: MIME-AWARE inline Drive embed. The old code always used
  // drive.google.com/file/d/{id}/preview, which returns Google's "file does not
  // exist" page for Google-NATIVE docs (Docs/Sheets/Slides) — those must use
  // docs.google.com/{document|spreadsheets|presentation}/d/{id}/preview.
  var previewUrl = '';
  if (fid) {
    var _dvm = String(doc.mimeType || doc.mime_type || '').toLowerCase();
    var _eid = encodeURIComponent(fid);
    if (_dvm.indexOf('google-apps.document') >= 0) previewUrl = 'https://docs.google.com/document/d/' + _eid + '/preview';
    else if (_dvm.indexOf('google-apps.spreadsheet') >= 0) previewUrl = 'https://docs.google.com/spreadsheets/d/' + _eid + '/preview';
    else if (_dvm.indexOf('google-apps.presentation') >= 0) previewUrl = 'https://docs.google.com/presentation/d/' + _eid + '/preview';
    else if (_dvm.indexOf('google-apps.drawing') >= 0) previewUrl = 'https://docs.google.com/drawings/d/' + _eid + '/preview';
    else previewUrl = 'https://drive.google.com/file/d/' + _eid + '/preview';
  }
  // When the in-panel byte render failed but a Drive file exists, show the
  // embedded Drive preview rather than a dead-end note.
  var showFv = mode === 'view' && !!fv && !fvFailed;
  var showDriveOnFvFail = mode === 'view' && fvFailed && !!previewUrl;
  var showIframe = (mode === 'view' && !!fid && !iframeError && !showFv) || showDriveOnFvFail;
  var showText = ((mode === 'view' && !fid) || mode === 'edit') && !showFv && !showDriveOnFvFail;

  return e('div', { className: 'doc-viz-card' + (mode === 'edit' ? ' doc-viz-card--edit' : '') },
    e('div', { className: 'doc-viz-card__head' },
      e('div', { className: 'doc-icon-wrap ' + (vis.cssClass || ''), style: { width: 30, height: 30, fontSize: '.8rem' } }, e('i', { className: 'fas ' + (vis.icon || 'fa-file') })),
      e('div', { style: { flex: 1, minWidth: 0 } },
        e('div', { className: 'doc-viz-card__name', title: doc.name || '', style: onOpen ? { cursor: 'pointer' } : undefined, onClick: function () { if (typeof onOpen === 'function') onOpen(doc); } }, doc.name || 'Без име'),
        e('div', { className: 'doc-viz-card__sub' }, vis.label || 'Документ')
      ),
      e('span', {
        className: 'doc-viz-badge ' + (mode === 'edit' ? 'doc-viz-badge--edit' : 'doc-viz-badge--view'),
        title: mode === 'edit' ? 'Режим на редакция (кандидат)' : 'Режим на преглед (администратор)'
      }, mode === 'edit' ? 'Редакция' : 'Преглед')
    ),
    e('div', { className: 'doc-viz-card__body' },
      showFv && e('div', { style: { flex: '1 1 auto', minHeight: 0, overflow: 'auto', background: '#f1f3f4', padding: '.5rem' } },
        e('div', { ref: fvRef, className: 'uev-viewer', style: { textAlign: 'left' } })
      ),
      showIframe
        ? e('iframe', {
            ref: iframeRef, src: previewUrl, title: doc.name || 'Preview',
            className: 'doc-viz-frame',
            onLoad: function () { setIframeError(false); },
            onError: function () { setIframeError(true); },
            allow: 'autoplay; fullscreen; picture-in-picture'
          })
        : showText
          ? e('textarea', {
              className: 'doc-viz-text',
              value: editContent,
              readOnly: mode === 'view',
              placeholder: mode === 'view' ? 'Няма съхранено съдържание за преглед.' : 'Въведете съдържанието на документа…',
              onChange: function (ev) { setEditContent(ev.target.value); setDirty(true); }
            })
          : (showFv ? null : e('div', { className: 'doc-viz-loading' }, e('i', { className: 'fas fa-spinner fa-spin' }), ' Зареждане…')),
      (mode === 'view' && !fid && loading) && e('div', { className: 'doc-viz-loading' }, e('i', { className: 'fas fa-spinner fa-spin' }), ' Зареждане…'),
      (mode === 'view' && !fid && !loading && !editContent && !fv) && e('div', { className: 'doc-viz-nocontent' }, e('i', { className: 'fas fa-info-circle' }), ' Няма вътрешно съдържание — използвайте "Отвори в Drive".')
    ),
    e('div', { className: 'doc-viz-card__foot' },
      onOpen && e('button', { className: 'btn btn-primary btn-sm', onClick: function () { onOpen(doc); } }, e('i', { className: 'fas fa-eye' }), ' Google преглед'),
      mode === 'edit' && e('button', { className: 'btn btn-primary btn-sm', onClick: handleSave, disabled: saving || !dirty },
        e('i', { className: saving ? 'fas fa-spinner fa-spin' : 'fas fa-save' }), ' ' + (saving ? 'Запазване…' : 'Запази')),
      mode === 'view' && e('button', { className: 'btn btn-outline btn-sm', onClick: function () { if (fid) window.open(previewUrl, '_blank', 'noopener,noreferrer'); else if (typeof window._openDocPreview === 'function') window._openDocPreview(doc); else if (doc.previewLink || doc.webViewLink) window.open(doc.previewLink || doc.webViewLink, '_blank', 'noopener,noreferrer'); } },
        e('i', { className: 'fas fa-external-link-alt' }), ' Отвори'),
      e('button', { className: 'btn btn-outline btn-sm', onClick: handleDownload },
        e('i', { className: 'fas fa-download' }), ' Изтегли'),
      isOfficeOrPdf && fid && e('button', { className: 'btn btn-outline btn-sm', onClick: function () { window.open('https://drive.google.com/file/d/' + encodeURIComponent(fid) + '/view', '_blank', 'noopener,noreferrer'); } },
        e('i', { className: 'fas fa-google-drive' }), ' Drive')
    )
  );
};

/* ─── DOCUMENT COMMENTS PANEL (Task 21) ───────────────────────────────────
 * Self-contained panel for the DocumentPreviewModal "Коментари" tab.
 * Lists existing comments (author / text / date) and lets the signed-in user
 * add one. Backend handlers: getdoccomments / adddoccomment (database/api.php).
 * Willing to render even with a synthetic doc id — the backend keys on docId.
 */
var DocCommentsPanel = memo(function (props) {
  var docId = props.docId || '';
  var userEmail = props.userEmail || '';
  var onClose = props.onClose || function () {};

  var _api = (typeof api !== 'undefined') ? api : (typeof window !== 'undefined' ? window.api : null);

  var [comments, setComments] = useState([]);
  var [loading, setLoading] = useState(true);
  var [error, setError] = useState('');
  var [draft, setDraft] = useState('');
  var [posting, setPosting] = useState(false);

  var _fmtDate = function (v) {
    try { return String(v || ''); } catch (_) { return ''; }
  };

  var _load = useCallback(function () {
    if (!_api || !docId) { setLoading(false); return; }
    setLoading(true); setError('');
    Promise.resolve(_api('getdoccomments', { docId: docId }))
      .then(function (r) {
        if (r && r.success && Array.isArray(r.comments)) setComments(r.comments);
        else setComments([]);
      })
      .catch(function (err) { setError((err && err.message) || 'Грешка при зареждане.'); setComments([]); })
    setTimeout(function () { setLoading(false); }, 0);
  }, [_api, docId]);

  useEffect(function () { _load(); }, [_load]);

  var _submit = function () {
    var text = draft.trim();
    if (!text || !_api || !docId || posting) return;
    setPosting(true); setError('');
    Promise.resolve(_api('adddoccomment', { docId: docId, text: text, userEmail: userEmail }))
      .then(function (r) {
        if (r && r.success) { setDraft(''); _load(); }
        else setError((r && r.error) || 'Неуспешен запис.');
      })
      .catch(function (err) { setError((err && err.message) || 'Сървърна грешка.'); })
    setPosting(false);
  };

  if (!docId) {
    return e('div', { className: 'doc-comments-panel', role: 'region', 'aria-label': 'Коментари по документа', style: { margin: '0 1rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', padding: '.85rem' } },
      e('p', { style: { fontSize: '.74rem', color: 'var(--ink-4)', margin: 0 } }, 'Няма избран документ за коментари.'));
  }

  return e('div', { className: 'doc-comments-panel', role: 'region', 'aria-label': 'Коментари по документа', style: { margin: '0 1rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', padding: '.85rem', maxHeight: '34vh', overflowY: 'auto' } },
    e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' } },
      e('i', { className: 'fas fa-comments', style: { color: 'var(--ink-3)' } }),
      e('strong', { style: { fontSize: '.78rem' } }, 'Коментари'),
      e('button', { className: 'btn btn-ghost btn-sm', style: { marginLeft: 'auto', lineHeight: 1 }, onClick: onClose, 'aria-label': 'Затвори коментари', title: 'Затвори' }, '×')
    ),
    loading && e('p', { style: { fontSize: '.74rem', color: 'var(--ink-4)' } }, 'Зареждане…'),
    error && e('div', { style: { fontSize: '.72rem', color: 'var(--err)', marginBottom: '.4rem' } }, e('i', { className: 'fas fa-exclamation-triangle' }), ' ', error),
    !loading && comments.length === 0 && !error && e('p', { style: { fontSize: '.74rem', color: 'var(--ink-4)', margin: 0 } }, 'Все още няма коментари.'),
    comments.map(function (c, i) {
      return e('div', { key: (c.id || i), style: { padding: '.4rem 0', borderBottom: '1px solid var(--border)', fontSize: '.76rem' } },
        e('div', { style: { display: 'flex', gap: '.4rem', alignItems: 'baseline' } },
          e('span', { style: { fontWeight: 600 } }, c.author || 'Анонимен'),
          e('span', { style: { color: 'var(--ink-4)', fontSize: '.68rem', marginLeft: 'auto' } }, _fmtDate(c.created_at || c.created))
        ),
        e('div', { style: { marginTop: '.15rem', lineHeight: 1.45 } }, c.text || '')
      );
    }),
    e('div', { style: { display: 'flex', gap: '.4rem', marginTop: '.6rem', flexWrap: 'wrap' } },
      ['Моля, преформулирайте раздела.', 'Липсва подпис.', 'Нужен е допълнителен документ.', 'Одобрено с забележки.'].map(function (tpl, ti) {
        return e('button', { key: ti, type: 'button', className: 'btn btn-ghost btn-sm', style: { fontSize: '.68rem', padding: '.25rem .5rem' }, onClick: function () { setDraft(tpl); } }, tpl);
      })
    ),
    e('div', { style: { display: 'flex', gap: '.5rem', marginTop: '.6rem' } },
      e('textarea', { className: 'form-input', value: draft, placeholder: 'Добавете коментар…', rows: 2, style: { flex: 1, fontSize: '.76rem', resize: 'vertical' }, onChange: function (ev) { setDraft(ev.target.value); }, onKeyDown: function (ev) { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); _submit(); } } }),
      e('button', { className: 'btn btn-primary btn-sm', disabled: !draft.trim() || posting, onClick: _submit, style: { alignSelf: 'flex-end' } }, e('i', { className: posting ? 'fas fa-spinner fa-spin' : 'fas fa-paper-plane' }), ' Изпрати')
    )
  );
});

