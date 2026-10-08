#!/usr/bin/env python3
"""Add document comments feature: state, button, panel component"""
f='js/components.js'
s=open(f,encoding='utf-8',newline='').read()

# 1. Add state variables
old1 = "const[showInlineEdit,setShowInlineEdit]=useState(false);\r\n// v12.37.3-forcedrive"
new1 = "const[showInlineEdit,setShowInlineEdit]=useState(false);\r\nconst[showComments,setShowComments]=useState(false);\r\n// v12.37.3-forcedrive"
if old1 in s:
    s = s.replace(old1, new1, 1)
    print("Step 1: OK - added showComments state")
else:
    print("Step 1: NOT FOUND")
    exit(1)

# 2. Add comments button in footer
old2 = "          e('button',{className:'btn btn-outline',onClick:dpClose},'Затвори'),\r\n          e('button',{className:'btn btn-primary',onClick:function(){setShowInlineEdit(true)},style:{background:'var(--ok,#1f5c39)',borderColor:'var(--ok,#1f5c39)'}},e('i',{className:'fas fa-edit'}),' Редактирай')"
new2 = "          e('button',{className:'btn btn-outline',onClick:dpClose},'Затвори'),\r\n          e('button',{className:'btn btn-outline',onClick:function(){setShowComments(true)}},e('i',{className:'fas fa-comment'}),' Коментари'),\r\n          e('button',{className:'btn btn-primary',onClick:function(){setShowInlineEdit(true)},style:{background:'var(--ok,#1f5c39)',borderColor:'var(--ok,#1f5c39)'}},e('i',{className:'fas fa-edit'}),' Редактирай')"
if old2 in s:
    s = s.replace(old2, new2, 1)
    print("Step 2: OK - added comments button")
else:
    print("Step 2: NOT FOUND")
    exit(1)

# 3. Add DocCommentsPanel as Fragment child
old3 = "  showInlineEdit&&e(InlineDocEditorModal,{doc:doc,onClose:function(){setShowInlineEdit(false)},onSaved:function(updatedDoc){setShowInlineEdit(false)},formId:formId,inline:true,defaultEditMode:true})\r\n);"
new3 = "  showInlineEdit&&e(InlineDocEditorModal,{doc:doc,onClose:function(){setShowInlineEdit(false)},onSaved:function(updatedDoc){setShowInlineEdit(false)},formId:formId,inline:true,defaultEditMode:true}),\r\n  showComments&&e(DocCommentsPanel,{doc:doc,onClose:function(){setShowComments(false)}})\r\n);"
if old3 in s:
    s = s.replace(old3, new3, 1)
    print("Step 3: OK - added DocCommentsPanel render")
else:
    print("Step 3: NOT FOUND")
    exit(1)

# 4. Add DocCommentsPanel component before InlineDocEditorModal
old4 = "/* ─── INLINE DOCUMENT EDITOR / VIEWER MODAL ───"
new4 = """// ─── DOCUMENT COMMENTS PANEL ───
var DocCommentsPanel=memo(function DocCommentsPanel(props){
  var doc=props.doc;
  var onClose=props.onClose;
  var[comments,setComments]=useState([]);
  var[loading,setLoading]=useState(false);
  var[text,setText]=useState('');
  var[userEmail]=useState(function(){try{return JSON.parse(localStorage.getItem('erp:user')||'{}').email||''}catch(_){return''}});

  useEffect(function(){loadComments()},[]);

  function loadComments(){
    setLoading(true);
    api('getdoccomments',{docId:doc.id||doc.driveId}).then(function(res){
      if(res&&res.success&&Array.isArray(res.comments))setComments(res.comments);
    }).catch(function(){}).finally(function(){setLoading(false)});
  }

  function addComment(){
    if(!text.trim())return;
    var c={text:text.trim(),author:userEmail,date:new Date().toISOString()};
    setComments([].concat(comments,[c]));
    api('adddoccomment',{docId:doc.id||doc.driveId,text:c.text}).catch(function(){});
    setText('');
  }

  return e(Fragment,null,
    e('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',justifyContent:'flex-end'},onClick:onClose},
      e('div',{style:{width:'380px',maxWidth:'100%',height:'100%',background:'var(--surface)',display:'flex',flexDirection:'column'},onClick:function(e){e.stopPropagation()}},
        e('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'1rem',borderBottom:'1px solid var(--border)'}},
          e('h3',{style:{margin:0,fontSize:'.95rem'}},'Коментари'),
          e('button',{className:'close-btn',onClick:onClose},e('i',{className:'fas fa-times'}))
        ),
        e('div',{style:{flex:1,overflowY:'auto',padding:'1rem',display:'flex',flexDirection:'column',gap:'.75rem'}},
          loading&&e('div',{style:{textAlign:'center',padding:'2rem'}},e('i',{className:'fas fa-spinner spin'})),
          !loading&&comments.length===0&&e('div',{style:{textAlign:'center',color:'var(--ink-4)',padding:'2rem',fontSize:'.82rem'}},'Все още няма коментари'),
          comments.map(function(c,i){
            return e('div',{key:i,style:{padding:'.65rem .85rem',background:'var(--bg-2)',borderRadius:'8px'}},
              e('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'.25rem'}},
                e('span',{style:{fontWeight:600,fontSize:'.78rem'}},c.author||'—'),
                e('span',{style:{fontSize:'.68rem',color:'var(--ink-4)'}},c.date?new Date(c.date).toLocaleString('bg-BG'):'')
              ),
              e('div',{style:{fontSize:'.82rem',lineHeight:1.5}},c.text)
            );
          })
        ),
        e('div',{style:{padding:'.75rem 1rem',borderTop:'1px solid var(--border)',display:'flex',gap:'.5rem'}},
          e('input',{type:'text',placeholder:'Добавете коментар...',value:text,onChange:function(e){setText(e.target.value)},onKeyDown:function(e){if(e.key==='Enter')addComment()},style:{flex:1,padding:'.55rem .75rem,border:'1px solid var(--border)',borderRadius:'8px',fontSize:'.82rem',fontFamily:'inherit'}}),
          e('button',{className:'btn btn-primary btn-sm',onClick:addComment},e('i',{className:'fas fa-paper-plane'}))
        )
      )
    )
  );
});



/* ─── INLINE DOCUMENT EDITOR / VIEWER MODAL ───"""
if old4 in s:
    s = s.replace(old4, new4, 1)
    print("Step 4: OK - added DocCommentsPanel component")
else:
    print("Step 4: NOT FOUND")
    exit(1)

open(f,'w',encoding='utf-8',newline='').write(s)
print("OK: All changes applied")
