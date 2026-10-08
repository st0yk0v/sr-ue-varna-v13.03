/* ============================================================================
 * library-deposits.js — UC-41 Library Deposit Tracker
 *
 * Records monographs/articles/proceedings that the project must deposit at the
 * University Library within 1 month after publication (Правилник чл. 22).
 *
 * Refactored to use the same primitives as the proposals/settings modules:
 *   • Flat globals (no IIFE; hooks via top-level destructuring from config.js)
 *   • Native ModalShell so the modals get portal, ESC, focus trap, exit
 *     animation and overlay-drag-safe close — identical UX to the
 *     "Ново предложение" / "Моят акаунт" modals.
 *   • Standard .form-input / .form-select / .btn / .modal-footer styling
 * ============================================================================ */

/* ─── Constants ─────────────────────────────────────────────────────────── */
var LIB_STATUS = {
  pending:   { label:'Очаква',     bg:'#FFF8E1', fg:'#A06A00', icon:'fa-hourglass-half' },
  partial:   { label:'Частично',   bg:'#FFE9D6', fg:'#9C4400', icon:'fa-circle-half-stroke' },
  confirmed: { label:'Потвърдено', bg:'#E5F4EE', fg:'#0F7E66', icon:'fa-circle-check' },
  overdue:   { label:'Просрочено', bg:'#FCE5E5', fg:'#7B0000', icon:'fa-triangle-exclamation' }
};
var LIB_TYPE_LABEL = {
  monograph:'Монография', article:'Статия', proceedings:'Сборник',
  textbook:'Учебник', other:'Друго'
};

var _libFmtDate = (v) => {
  if (!v) return '—';
  try { return (typeof window.formatBgDate === 'function') ? window.formatBgDate(v) : new Date(v).toLocaleDateString('bg-BG'); }
  catch (_) { return String(v); }
};

var _libApi = () => (typeof api === 'function') ? api : (window.api || null);
var _libToast = (msg, kind) => {
  if (typeof toast === 'function') return toast(msg, kind || 'info');
  if (typeof window.toast === 'function') return window.toast(msg, kind || 'info');
};

/* ─── ADD DEPOSIT MODAL — uses ModalShell ────────────────────────────────── */
var AddLibraryDepositModal = ({ onClose, onSaved, projects = [] }) => {
  const [projectId,       setProjectId]       = useState('');
  const [publicationType, setPublicationType] = useState('monograph');
  const [title,           setTitle]           = useState('');
  const [authors,         setAuthors]         = useState('');
  const [publishedAt,     setPublishedAt]     = useState(() => new Date().toISOString().slice(0, 10));
  const [copiesPromised,  setCopiesPromised]  = useState(3);
  const [electronicCopy,  setElectronicCopy]  = useState(false);
  const [notes,           setNotes]           = useState('');
  const [files,           setFiles]           = useState([]); // [{name,type,size,data}]
  const [reading,         setReading]         = useState(false);
  const [saving,          setSaving]          = useState(false);

  // Auto-derived deadline (1 month after publication, per Правилник чл. 22)
  const derivedDeadline = useMemo(() => {
    if (!publishedAt) return '';
    const d = new Date(publishedAt);
    if (isNaN(d.getTime())) return '';
    d.setMonth(d.getMonth() + 1);
    return _libFmtDate(d.toISOString());
  }, [publishedAt]);

  // Quota invariant: count of files MUST equal copiesPromised, OR
  // electronicCopy is true (then min 1 file is sufficient).
  const requiredCount = electronicCopy ? 1 : Number(copiesPromised || 0);
  const quotaOk       = electronicCopy
    ? files.length >= 1
    : files.length === Number(copiesPromised || 0);

  const onPickFiles = useCallback((evt) => {
    const fl = Array.from(evt.target.files || []);
    if (!fl.length) return;
    setReading(true);
    const reader = (typeof readFileAsBase64 === 'function')
      ? readFileAsBase64
      : (typeof window.readFileAsBase64 === 'function' ? window.readFileAsBase64 : null);
    if (!reader) {
      _libToast('Грешка: липсва четец на файлове.', 'error');
      setReading(false);
      return;
    }
    Promise.all(fl.map(f => reader(f).catch(err => {
      _libToast(err.message || 'Грешка при четене.', 'error');
      return null;
    }))).then(arr => {
      const valid = arr.filter(Boolean);
      setFiles(prev => prev.concat(valid));
      setReading(false);
      // Reset native input so the same file can be re-picked after removal
      try { evt.target.value = ''; } catch (_) {}
    });
  }, []);

  const removeFile = useCallback((idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const save = useCallback(() => {
    if (!projectId)       { _libToast('Изберете проект.', 'warn'); return; }
    if (!title.trim())    { _libToast('Въведете заглавие.', 'warn'); return; }
    if (!quotaOk) {
      _libToast(electronicCopy
        ? 'При електронен екземпляр прикачете поне 1 файл.'
        : 'Броят файлове (' + files.length + ') трябва да съответства на броя обещани екземпляри (' + copiesPromised + ').',
        'warn');
      return;
    }
    const apiFn = _libApi();
    if (!apiFn) { _libToast('Няма връзка със сървъра.', 'error'); return; }
    setSaving(true);
    Promise.resolve(apiFn('addlibrarydeposit', {
      projectId, publicationType,
      title: title.trim(), authors: authors.trim(),
      publishedAt,
      copiesPromised: Number(copiesPromised) || 3,
      electronicCopy: !!electronicCopy,
      notes: notes.trim(),
      files: files.map(f => ({ name:f.name, type:f.type, size:f.size, data:f.data }))
    })).then(res => {
      setSaving(false);
      if (res && res.success) {
        _libToast('Депозитът е регистриран. Срок: ' + _libFmtDate(res.deadline), 'success');
        onSaved && onSaved();
        onClose && onClose();
      } else {
        _libToast((res && res.error) || 'Грешка при запис.', 'error');
      }
    }).catch(err => {
      setSaving(false);
      _libToast('Грешка: ' + (err && err.message), 'error');
    });
  }, [projectId, publicationType, title, authors, publishedAt, copiesPromised, electronicCopy, notes, files, quotaOk, onSaved, onClose]);

  const footer = e(Fragment, null,
    e('button', { type:'button', className:'btn btn-outline', onClick:onClose, disabled:saving }, 'Отказ'),
    e('button', { type:'button', className:'btn btn-primary', onClick:save, disabled:saving || reading || !quotaOk },
      saving ? e('i', { className:'fas fa-spinner fa-spin' }) : e('i', { className:'fas fa-book' }),
      ' Регистрирай депозит'
    )
  );

  return e(ModalShell, {
    open:true, onClose, title:'Регистриране на библиотечен депозит',
    icon:'fas fa-book', size:'wide', footer, dismissable:!saving
  },
    e('div', { className:'detail-grid', style:{ gap:'1rem' } },
      // Row 1: project (full width)
      e('div', { style:{ gridColumn:'1 / -1' } },
        e('label', { className:'detail-label', htmlFor:'lib-proj' }, 'Проект *'),
        e('select', {
          id:'lib-proj', className:'form-select', value:projectId,
          onChange:ev => setProjectId(ev.target.value), disabled:saving
        },
          e('option', { value:'' }, '— Изберете проект —'),
          projects.map(p => e('option', { key:p.id, value:p.id },
            (p.code || p.id) + ' — ' + (p.title || p.name || '')
          ))
        )
      ),
      // Row 2: type + published date
      e('div', null,
        e('label', { className:'detail-label', htmlFor:'lib-type' }, 'Тип публикация'),
        e('select', {
          id:'lib-type', className:'form-select', value:publicationType,
          onChange:ev => setPublicationType(ev.target.value), disabled:saving
        }, Object.keys(LIB_TYPE_LABEL).map(k =>
          e('option', { key:k, value:k }, LIB_TYPE_LABEL[k])
        ))
      ),
      e('div', null,
        e('label', { className:'detail-label', htmlFor:'lib-pub' }, 'Дата на публикуване'),
        e('input', {
          id:'lib-pub', type:'date', className:'form-input', value:publishedAt,
          onChange:ev => setPublishedAt(ev.target.value), disabled:saving
        })
      ),
      // Row 3: title (full width)
      e('div', { style:{ gridColumn:'1 / -1' } },
        e('label', { className:'detail-label', htmlFor:'lib-title' }, 'Заглавие *'),
        e('input', {
          id:'lib-title', type:'text', className:'form-input', value:title,
          onChange:ev => setTitle(ev.target.value), disabled:saving,
          placeholder:'Например: „Иновации в туристическата индустрия"'
        })
      ),
      // Row 4: authors (full width)
      e('div', { style:{ gridColumn:'1 / -1' } },
        e('label', { className:'detail-label', htmlFor:'lib-auth' }, 'Автори'),
        e('input', {
          id:'lib-auth', type:'text', className:'form-input', value:authors,
          onChange:ev => setAuthors(ev.target.value), disabled:saving,
          placeholder:'Иван Иванов, Мария Петрова, …'
        })
      ),
      // Row 5: copies + electronic
      e('div', null,
        e('label', { className:'detail-label', htmlFor:'lib-copies' }, 'Брой обещани екземпляри'),
        e('input', {
          id:'lib-copies', type:'number', min:0, max:50, className:'form-input',
          value:copiesPromised,
          onChange:ev => setCopiesPromised(ev.target.value), disabled:saving
        })
      ),
      e('div', { style:{ display:'flex', alignItems:'flex-end' } },
        e('label', {
          htmlFor:'lib-ec',
          style:{
            display:'flex', alignItems:'center', gap:'.55rem',
            padding:'.6rem .9rem', border:'1.5px solid var(--border)',
            borderRadius:'var(--r-sm)', background:'var(--surface)',
            cursor: saving ? 'not-allowed' : 'pointer', userSelect:'none',
            width:'100%', fontSize:'.84rem', color:'var(--ink-2)'
          }
        },
          e('input', {
            id:'lib-ec', type:'checkbox', checked:electronicCopy,
            onChange:ev => setElectronicCopy(ev.target.checked), disabled:saving
          }),
          e('i', { className:'fas fa-laptop', style:{ color:'var(--brand-teal,#159379)' } }),
          ' Електронен екземпляр (PDF/eBook)'
        )
      ),
      // Row 5b: file uploader (full width) — quota = copiesPromised OR ≥1 if electronic
      e('div', { style:{ gridColumn:'1 / -1' } },
        e('label', { className:'detail-label' },
          'Файлове (екземпляри) ',
          e('span', {
            style:{
              marginLeft:'.4rem',
              padding:'.1rem .5rem', borderRadius:999,
              background: quotaOk ? 'var(--ok-bg,#E5F4EE)' : 'var(--warn-bg,#FFF4DB)',
              color:    quotaOk ? 'var(--ok,#0F7E66)'    : 'var(--warn,#A06A00)',
              fontSize:'.7rem', fontWeight:600
            }
          }, files.length + ' / ' + (electronicCopy ? '≥1' : copiesPromised))
        ),
        e('div', {
          style:{
            border:'1.5px dashed var(--border)', borderRadius:'var(--r-sm)',
            padding:'.7rem .9rem', background:'var(--surface)'
          }
        },
          e('input', {
            type:'file', multiple:true, onChange:onPickFiles,
            disabled: saving || reading,
            style:{ display:'block', width:'100%', fontSize:'.78rem' },
            accept:'.pdf,.epub,.doc,.docx,.djvu,application/pdf,application/epub+zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*'
          }),
          reading && e('div', { style:{ marginTop:'.4rem', fontSize:'.74rem', color:'var(--ink-4)' } },
            e('i', { className:'fas fa-spinner fa-spin' }), ' Зареждане на файлове…'
          ),
          files.length > 0 && e('ul', {
            style:{ margin:'.55rem 0 0', padding:0, listStyle:'none', display:'flex', flexDirection:'column', gap:'.3rem' }
          },
            files.map((f, idx) => e('li', {
              key: idx,
              style:{
                display:'flex', alignItems:'center', gap:'.5rem',
                padding:'.35rem .55rem', background:'var(--surface)',
                border:'1px solid var(--border)', borderRadius:'var(--r-xs,6px)',
                fontSize:'.78rem'
              }
            },
              e('i', { className:'fas fa-file-lines', style:{ color:'var(--brand-navy,#233874)' } }),
              e('span', { style:{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' } }, f.name),
              e('span', { style:{ fontSize:'.7rem', color:'var(--ink-4)' } }, f.size),
              e('button', {
                type:'button',
                onClick:() => removeFile(idx),
                disabled:saving,
                title:'Премахни',
                style:{
                  background:'transparent', border:'none', cursor: saving ? 'not-allowed' : 'pointer',
                  color:'var(--err,#7B0000)', padding:'.2rem .35rem'
                }
              }, e('i', { className:'fas fa-times' }))
            ))
          ),
          e('div', { style:{ marginTop:'.45rem', fontSize:'.7rem', color:'var(--ink-4)', lineHeight:1.5 } },
            electronicCopy
              ? 'Изисква се поне 1 файл (електронен екземпляр).'
              : 'Броят файлове трябва да съответства на броя обещани екземпляри (' + copiesPromised + ').'
          )
        )
      ),
      // Row 6: notes (full width)
      e('div', { style:{ gridColumn:'1 / -1' } },
        e('label', { className:'detail-label', htmlFor:'lib-notes' }, 'Бележки'),
        e('textarea', {
          id:'lib-notes', className:'form-input', rows:3, value:notes,
          onChange:ev => setNotes(ev.target.value), disabled:saving,
          placeholder:'Допълнителни уточнения, ISBN, издателство…'
        })
      ),
      // Inline regulatory hint
      e('div', {
        style:{
          gridColumn:'1 / -1',
          display:'flex', alignItems:'flex-start', gap:'.55rem',
          padding:'.7rem .9rem', borderRadius:'var(--r-sm)',
          background:'var(--info-bg,#eef1fa)', border:'1px solid var(--info-border,#c9d0ea)',
          color:'var(--info,#233874)', fontSize:'.78rem', lineHeight:1.55
        }
      },
        e('i', { className:'fas fa-info-circle', style:{ marginTop:'.15rem' } }),
        e('div', null,
          e('strong', null, 'Правилник чл. 22: '),
          'Срокът за депозит е 1 месец след публикуването. Изискват се минимум 3 хартиени екземпляра ИЛИ електронно копие.',
          derivedDeadline && e('div', { style:{ marginTop:'.25rem', fontWeight:600 } },
            'Изчислен срок: ', derivedDeadline)
        )
      )
    )
  );
};

/* ─── CONFIRM DEPOSIT MODAL — uses ModalShell ────────────────────────────── */
var ConfirmLibraryDepositModal = ({ onClose, onSaved, deposit }) => {
  const [copiesDelivered, setCopiesDelivered] = useState(deposit.copiesDelivered || deposit.copiesPromised || 3);
  const [electronicCopy,  setElectronicCopy]  = useState(!!deposit.electronicCopy);
  const [notes,           setNotes]           = useState(deposit.notes || '');
  const [saving,          setSaving]          = useState(false);

  const promised = Number(deposit.copiesPromised || 3);
  const willMeet = electronicCopy || Number(copiesDelivered) >= Math.max(3, promised);
  const previewStatus = willMeet ? 'confirmed' : (Number(copiesDelivered) > 0 ? 'partial' : 'pending');
  const meta = LIB_STATUS[previewStatus] || LIB_STATUS.pending;

  const save = useCallback(() => {
    const apiFn = _libApi();
    if (!apiFn) { _libToast('Няма връзка със сървъра.', 'error'); return; }
    setSaving(true);
    Promise.resolve(apiFn('confirmlibrarydeposit', {
      id: deposit.id,
      copiesDelivered: Number(copiesDelivered) || 0,
      electronicCopy: !!electronicCopy,
      notes
    })).then(res => {
      setSaving(false);
      if (res && res.success) {
        _libToast('Записано: ' + (LIB_STATUS[res.status] || {}).label, 'success');
        onSaved && onSaved();
        onClose && onClose();
      } else {
        _libToast((res && res.error) || 'Грешка.', 'error');
      }
    }).catch(err => {
      setSaving(false);
      _libToast('Грешка: ' + (err && err.message), 'error');
    });
  }, [copiesDelivered, electronicCopy, notes, deposit.id, onSaved, onClose]);

  const footer = e(Fragment, null,
    e('button', { type:'button', className:'btn btn-outline', onClick:onClose, disabled:saving }, 'Отказ'),
    e('button', { type:'button', className:'btn btn-primary', onClick:save, disabled:saving },
      saving ? e('i', { className:'fas fa-spinner fa-spin' }) : e('i', { className:'fas fa-circle-check' }),
      ' Потвърди'
    )
  );

  return e(ModalShell, {
    open:true, onClose, title:'Потвърждаване на депозит',
    icon:'fas fa-circle-check', size:'default', footer, dismissable:!saving
  },
    // Header card with the publication being confirmed
    e('div', {
      style:{
        padding:'.85rem 1rem', marginBottom:'1rem',
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:'var(--r-sm)'
      }
    },
      e('div', { style:{ fontSize:'.72rem', color:'var(--ink-4)', marginBottom:'.25rem', textTransform:'uppercase', letterSpacing:'.04em' } },
        LIB_TYPE_LABEL[deposit.publicationType] || deposit.publicationType),
      e('div', { style:{ fontSize:'1rem', fontWeight:700, color:'var(--ink)', marginBottom:'.2rem' } }, deposit.title),
      e('div', { style:{ fontSize:'.78rem', color:'var(--ink-3)' } }, deposit.authors || '—'),
      e('div', { style:{ marginTop:'.4rem', fontSize:'.72rem', color:'var(--ink-4)' } },
        'Срок за депозит: ',
        e('strong', { style:{ color: deposit.status === 'overdue' ? 'var(--red,#7B0000)' : 'var(--ink-2)' } },
          _libFmtDate(deposit.deadline))
      )
    ),
    e('div', { className:'detail-grid', style:{ gap:'1rem' } },
      e('div', null,
        e('label', { className:'detail-label', htmlFor:'lib-cd' }, 'Доставени екземпляри'),
        e('input', {
          id:'lib-cd', type:'number', min:0, max:50, className:'form-input',
          value:copiesDelivered,
          onChange:ev => setCopiesDelivered(ev.target.value), disabled:saving
        }),
        e('div', { style:{ fontSize:'.7rem', color:'var(--ink-4)', marginTop:'.25rem' } },
          'Обещани: ', promised)
      ),
      e('div', { style:{ display:'flex', alignItems:'flex-end' } },
        e('label', {
          htmlFor:'lib-ec2',
          style:{
            display:'flex', alignItems:'center', gap:'.55rem',
            padding:'.6rem .9rem', border:'1.5px solid var(--border)',
            borderRadius:'var(--r-sm)', background:'var(--surface)',
            cursor: saving ? 'not-allowed' : 'pointer', userSelect:'none',
            width:'100%', fontSize:'.84rem', color:'var(--ink-2)'
          }
        },
          e('input', {
            id:'lib-ec2', type:'checkbox', checked:electronicCopy,
            onChange:ev => setElectronicCopy(ev.target.checked), disabled:saving
          }),
          e('i', { className:'fas fa-laptop', style:{ color:'var(--brand-teal,#159379)' } }),
          ' Електронен екземпляр получен'
        )
      ),
      e('div', { style:{ gridColumn:'1 / -1' } },
        e('label', { className:'detail-label', htmlFor:'lib-cn' }, 'Бележки'),
        e('textarea', {
          id:'lib-cn', className:'form-input', rows:3, value:notes,
          onChange:ev => setNotes(ev.target.value), disabled:saving
        })
      ),
      // Live status preview
      e('div', {
        style:{
          gridColumn:'1 / -1',
          display:'flex', alignItems:'center', gap:'.6rem',
          padding:'.7rem .9rem', borderRadius:'var(--r-sm)',
          background: meta.bg, color: meta.fg,
          fontSize:'.82rem', fontWeight:600
        }
      },
        e('i', { className:'fas ' + meta.icon }),
        ' Нов статус: ', meta.label,
        previewStatus === 'confirmed' && e('span', { style:{ marginLeft:'auto', fontSize:'.72rem', fontWeight:400 } },
          '✓ Изпълнява изискванията на Правилник чл. 22')
      )
    )
  );
};

/* ─── MAIN VIEW ──────────────────────────────────────────────────────────── */
var LibraryDepositsView = (props) => {
  const isAdmin    = !!props.isAdmin;
  const userRole   = String(props.userRole || '').toLowerCase();
  const canConfirm = isAdmin || userRole === 'library' || userRole === 'nidd';

  const [deposits,       setDeposits]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [filter,         setFilter]         = useState('all');
  const [search,         setSearch]         = useState('');
  const searchDeferred = useDeferredValue(search); // non-blocking list filtering
  const [showAdd,        setShowAdd]        = useState(false);
  const [confirmTarget,  setConfirmTarget]  = useState(null);
  const [projects,       setProjects]       = useState([]);

  const reload = useCallback(() => {
    const apiFn = _libApi();
    if (!apiFn) { setLoading(false); return; }
    setLoading(true);
    Promise.resolve(apiFn('getlibrarydeposits', {})).then(res => {
      setLoading(false);
      if (res && res.success) {
        const arr = Array.isArray(res.deposits) ? res.deposits : [];
        setDeposits(arr);
        try { sessionStorage.setItem('erp:libDeposits', JSON.stringify(arr)); } catch (_) {}
      } else {
        _libToast((res && res.error) || 'Грешка при зареждане.', 'error');
      }
    }).catch(err => {
      setLoading(false);
      _libToast('Грешка: ' + (err && err.message), 'error');
    });
  }, []);

  // SWR: hydrate from sessionStorage, then fetch fresh
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('erp:libDeposits');
      if (cached) {
        const arr = JSON.parse(cached);
        if (Array.isArray(arr)) { setDeposits(arr); setLoading(false); }
      }
    } catch (_) {}
    reload();
    const apiFn = _libApi();
    if (apiFn) {
      Promise.resolve(apiFn('getprojects', {})).then(res => {
        if (res && res.success && Array.isArray(res.projects)) setProjects(res.projects);
      }).catch(() => {});
    }
  }, [reload]);

  const counts = useMemo(() => {
    const c = { all:0, pending:0, partial:0, confirmed:0, overdue:0 };
    deposits.forEach(d => { c.all++; if (c[d.status] != null) c[d.status]++; });
    return c;
  }, [deposits]);

  // Publish counts to module-level Отчетност shell (M_FinanceModule) so it
  // can render the live badge on the sub-tab pill. "pending" = anything not
  // yet confirmed (drives red attention badge).
  useEffect(() => {
    try {
      const pending = (counts.pending||0) + (counts.partial||0) + (counts.overdue||0);
      window.dispatchEvent(new CustomEvent('erp:financeCount', {
        detail: { key:'library', total: counts.all||0, pending }
      }));
    } catch (_) {}
  }, [counts]);

  // Listen for cross-section "open recent" requests targeted at this view.
  useEffect(() => {
    const onOpen = (ev) => {
      const d = (ev && ev.detail) || {};
      if (d.section !== 'library' || !d.id) return;
      const target = deposits.find(x => x.id === d.id);
      if (target) setConfirmTarget(target);
    };
    window.addEventListener('erp:financeOpen', onOpen);
    return () => window.removeEventListener('erp:financeOpen', onOpen);
  }, [deposits]);

  const filtered = useMemo(() => {
    const q = searchDeferred.trim().toLowerCase();
    return deposits.filter(d => {
      if (filter !== 'all' && d.status !== filter) return false;
      if (!q) return true;
      return (String(d.title).toLowerCase().indexOf(q) !== -1)
          || (String(d.authors).toLowerCase().indexOf(q) !== -1)
          || (String(d.projectId).toLowerCase().indexOf(q) !== -1);
    });
  }, [deposits, filter, searchDeferred]);

  const pillBtn = (key, label, color) => {
    const active = filter === key;
    return e('button', {
      key, type:'button', onClick:() => setFilter(key),
      style:{
        padding:'.4rem .8rem',
        border:'1px solid ' + (active ? color : 'var(--border,#ddd)'),
        background: active ? color : '#fff',
        color: active ? '#fff' : 'var(--ink-2,#444)',
        borderRadius:999, fontSize:'.78rem', fontWeight:600, cursor:'pointer',
        display:'inline-flex', alignItems:'center', gap:'.35rem'
      }
    },
      label,
      e('span', {
        style:{
          background: active ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.06)',
          padding:'.05rem .4rem', borderRadius:10, fontSize:'.7rem'
        }
      }, counts[key] || 0)
    );
  };

  return e('div', { style:{ padding:'.4rem 0' } },
    // Header bar
    e('div', {
      style:{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:'1rem', flexWrap:'wrap', gap:'.7rem'
      }
    },
      e('div', null,
        e('h3', { style:{ margin:0, display:'flex', alignItems:'center', gap:'.55rem', color:'var(--gold,#233874)' } },
          e('i', { className:'fas fa-book' }), ' Библиотечни депозити'),
        e('div', { style:{ fontSize:'.74rem', color:'var(--ink-4,#666)', marginTop:'.2rem' } },
          'УЦ-41 · Правилник чл. 22 — депозит до 1 месец след публикуването')
      ),
      e('div', { style:{ display:'flex', gap:'.5rem' } },
        e('button', {
          type:'button', className:'btn btn-outline', onClick:reload, disabled:loading
        },
          e('i', { className:'fas fa-arrows-rotate' + (loading ? ' fa-spin' : '') }),
          ' Презареди'
        ),
        e('button', {
          type:'button', className:'btn btn-primary',
          onClick:() => setShowAdd(true)
        },
          e('i', { className:'fas fa-plus' }), ' Регистрирай депозит'
        )
      )
    ),
    // Filter pills + search
    e('div', {
      style:{ display:'flex', gap:'.4rem', flexWrap:'wrap', marginBottom:'1rem', alignItems:'center' }
    },
      pillBtn('all',       'Всички',     '#233874'),
      pillBtn('pending',   'Очаква',     LIB_STATUS.pending.fg),
      pillBtn('partial',   'Частично',   LIB_STATUS.partial.fg),
      pillBtn('confirmed', 'Потвърдено', LIB_STATUS.confirmed.fg),
      pillBtn('overdue',   'Просрочено', LIB_STATUS.overdue.fg),
      e('input', {
        type:'search', placeholder:'Търсене по заглавие, автор, проект…',
        value:search, onChange:ev => setSearch(ev.target.value),
        className:'form-input',
        style:{ marginLeft:'auto', maxWidth:280, minWidth:200 }
      })
    ),
    // Table — canonical loading pattern: card-loading + loading-strip + skeleton
    // rows on cold load (matches Отчети по проекти); content-loaded fade-in
    // once data arrives. Background refresh shows the strip on top of the table.
    loading && deposits.length === 0
      ? e('div', { className:'card card-loading', style:{ padding:0, position:'relative', overflow:'hidden' } },
          e('div', { className:'loading-strip active' }),
          e('div', { style:{ overflowX:'auto' } },
            e('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'.83rem' } },
              e('thead', { style:{ background:'#f7f7f8' } },
                e('tr', null, ['Статус','Тип','Заглавие','Автори','Проект','Публ.','Срок','Екз.','Действия'].map(h =>
                  e('th', { key:h, style:{ padding:'.65rem .7rem', textAlign:'left', fontSize:'.74rem', textTransform:'uppercase', letterSpacing:'.03em', color:'#555', borderBottom:'1px solid var(--border,#e2e2e2)' } }, h)
                ))),
              e('tbody', null, [0,1,2,3].map(i => e('tr', { key:i, style:{ borderBottom:'1px solid #f0f0f0' } },
                [60,70,90,80,55,70,70,40,50].map((w,j) => e('td', { key:j, style:{ padding:'.55rem .7rem' } },
                  e('div', { className:'skeleton skeleton-line', style:{ width:w+'%', height:'.8rem' } })
                ))
              )))
            )
          )
        )
      : filtered.length === 0
        ? e('div', { className:'empty-state content-loaded', style:{ padding:'2rem', textAlign:'center', color:'#666' } },
            e('div', { className:'empty-state-icon' }, e('i', { className:'fas fa-book' })),
            e('h4', null, 'Няма регистрирани депозити'),
            e('p', null, 'Натиснете „Регистрирай депозит" за да добавите първия.'))
        : e('div', {
            className:'card content-loaded' + (loading ? ' card-loading' : ''),
            style:{ overflowX:'auto', border:'1px solid var(--border,#e2e2e2)', borderRadius:8, background:'var(--surface)', padding:0, position:'relative' }
          },
            loading && e('div', { className:'loading-strip active' }),
            e('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'.83rem' } },
              e('thead', { style:{ background:'#f7f7f8' } },
                e('tr', null,
                  ['Статус','Тип','Заглавие','Автори','Проект','Публ.','Срок','Екз.','Действия'].map(h =>
                    e('th', {
                      key:h,
                      style:{
                        padding:'.65rem .7rem', textAlign:'left', fontWeight:600,
                        fontSize:'.74rem', textTransform:'uppercase', letterSpacing:'.03em',
                        color:'#555', borderBottom:'1px solid var(--border,#e2e2e2)'
                      }
                    }, h)
                  )
                )
              ),
              e('tbody', null, filtered.map(d => {
                const s = LIB_STATUS[d.status] || LIB_STATUS.pending;
                return e('tr', { key:d.id, style:{ borderBottom:'1px solid #f0f0f0' } },
                  e('td', { style:{ padding:'.55rem .7rem' } },
                    e('span', {
                      style:{
                        display:'inline-flex', alignItems:'center', gap:'.3rem',
                        padding:'.2rem .55rem', borderRadius:999,
                        background:s.bg, color:s.fg, fontSize:'.72rem', fontWeight:600
                      }
                    },
                      e('i', { className:'fas ' + s.icon, style:{ fontSize:'.65rem' } }),
                      s.label)
                  ),
                  e('td', { style:{ padding:'.55rem .7rem', fontSize:'.78rem' } },
                    LIB_TYPE_LABEL[d.publicationType] || d.publicationType),
                  e('td', { style:{ padding:'.55rem .7rem', fontWeight:500 } }, d.title),
                  e('td', { style:{ padding:'.55rem .7rem', color:'#555' } }, d.authors || '—'),
                  e('td', { style:{ padding:'.55rem .7rem', color:'#555', fontFamily:'monospace', fontSize:'.75rem' } }, d.projectId),
                  e('td', { style:{ padding:'.55rem .7rem' } }, _libFmtDate(d.publishedAt)),
                  e('td', {
                    style:{
                      padding:'.55rem .7rem',
                      color: d.status === 'overdue' ? '#7B0000' : '#333',
                      fontWeight: d.status === 'overdue' ? 600 : 400
                    }
                  }, _libFmtDate(d.deadline)),
                  e('td', { style:{ padding:'.55rem .7rem', textAlign:'center' } },
                    d.copiesDelivered + '/' + d.copiesPromised,
                    d.electronicCopy && e('i', {
                      className:'fas fa-laptop',
                      title:'Електронен екземпляр',
                      style:{ marginLeft:'.35rem', color:'var(--primary,#159379)' }
                    })
                  ),
                  e('td', { style:{ padding:'.55rem .7rem', whiteSpace:'nowrap' } },
                    canConfirm && d.status !== 'confirmed' && e('button', {
                      type:'button', className:'btn btn-sm btn-primary',
                      onClick:() => setConfirmTarget(d), title:'Потвърди депозит'
                    }, e('i', { className:'fas fa-check' }), ' Потвърди')
                  )
                );
              }))
            )
          ),
    // Modals
    showAdd && e(AddLibraryDepositModal, {
      onClose:() => setShowAdd(false),
      onSaved:reload,
      projects
    }),
    confirmTarget && e(ConfirmLibraryDepositModal, {
      onClose:() => setConfirmTarget(null),
      onSaved:reload,
      deposit:confirmTarget
    })
  );
};

// Expose for app.js memo wrapper
if (typeof window !== 'undefined') window.LibraryDepositsView = LibraryDepositsView;
