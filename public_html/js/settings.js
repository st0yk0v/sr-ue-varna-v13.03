/* ─── Shared activity-log humanizers ─────────────────────────────────────
 * Used by every audit/dnevnik view (admin NotificationLogPanel,
 * MyActivityLogPanel, and any future surface that lists TransactionLog
 * rows). Keeps a single source of truth for action / entity / detail-key
 * translations so the user sees consistent Bulgarian labels across the app. */
var LOG_ACTION_LABELS = {
    SEND_OTP: 'Изпратен код за вход',
    LOGIN: 'Вход в системата',
    LOGIN_ADMIN: 'Вход (администратор)',
    LOGIN_RECTOR: 'Вход (ректор)',
    LOGIN_2FA: 'OTP верификация',
    LOGOUT: 'Изход от системата',
    SUBMIT_FORM: 'Подадено заявление',
    EDIT_FORM: 'Редактирано заявление',
    CREATE_FORM: 'Създадено заявление',
    DELETE_FORM: 'Изтрито заявление',
    SUBMIT_REVIEW: 'Подадена рецензия',
    DECLINE_REVIEW: 'Отказана рецензия',
    ASSIGN_REVIEWERS: 'Назначени рецензенти',
    ADD_REVIEWER: 'Добавен рецензент',
    REMOVE_REVIEWER: 'Премахнат рецензент',
    PROPOSE_REVIEWERS: 'Предложени рецензенти (ЦКК)',
    CONFIRM_REVIEWERS: 'Потвърдени рецензенти (Ректор)',
    EVALUATE_PROJECT: 'Оценен проект',
    SIGN_CONTRACT: 'Подписан договор',
    ARCHIVE_CONTRACT: 'Архивиран договор',
    CREATE_CONTRACT: 'Създаден договор',
    CREATE_EXPENSE: 'Подаден разход',
    APPROVE_EXPENSE: 'Одобрен разход',
    REJECT_EXPENSE: 'Отказан разход',
    POST_EXPENSE: 'Осчетоводен разход',
    ADD_DELIVERABLE: 'Добавен резултат',
    UPDATE_DELIVERABLE: 'Обновен резултат',
    SUBMIT_REPORT: 'Подаден отчет',
    APPROVE_REPORT: 'Одобрен отчет',
    RETURN_REPORT: 'Върнат отчет',
    SUBMIT_MON_REPORT: 'Подаден МОН отчет',
    EDIT_MON_REPORT: 'Редактиран МОН отчет',
    FINALIZE_MON_REPORT: 'Финализиран МОН отчет',
    ACK_MON_REPORT: 'Потвърден МОН отчет',
    REJECT_MON_REPORT: 'Отхвърлен МОН отчет',
    ADD_SANCTION: 'Наложена санкция',
    LIFT_SANCTION: 'Отменена санкция',
    CONFIRM_LIBRARY: 'Потвърден библиотечен депозит',
    ADD_LIBRARY_DEPOSIT: 'Добавен библиотечен депозит',
    TRANSITION_PROJECT: 'Промяна статус на проект',
    CREATE_COMPETITION: 'Създаден конкурс',
    EDIT_COMPETITION: 'Редактиран конкурс',
    CLOSE_COMPETITION: 'Затворен конкурс',
    PUBLISH_RESULTS: 'Публикувани резултати',
    REDACT: 'Редактиран файл',
    REDACT_FILE: 'Редактиран файл',
    UPDATE_BUDGET: 'Обновен бюджет',
    SEND_NOTIFICATION: 'Изпратено известие',
    SEND_EMAIL: 'Изпратен имейл',
    NIGHTLY_BACKUP: 'Нощен архив',
    AUTO_REPORT_OVERDUE: 'Автоматично — просрочен отчет',
    SYNC_SHEETS: 'Синхронизация на таблици',
    GDPR_ACCESS: 'GDPR — достъп',
    GDPR_RECTIFY: 'GDPR — корекция',
    GDPR_ERASURE: 'GDPR — анонимизация',
    GDPR_EXPORT: 'GDPR — експорт',
    AUTO_THRESHOLD: 'Автоматична проверка на праг (50%+1)',
    REPLACE_REVIEWER: 'Преназначаване на рецензент',
    CONSENT_REVIEW: 'Приета покана за рецензия',
    DECLINE_INVITATION: 'Отказана покана за рецензия',
    DECLINE_REVIEW: 'Отказана рецензия',
    // v6.8+ — допълнителни действия от TransactionLog
    SAVE_SECRET: 'Запазен секрет',
    RESUBMIT_FORM: 'Повторно подадено заявление',
    UPLOAD_FILE: 'Качен файл',
    DELETE_FILE: 'Изтрит файл',
    BULK_DELETE_REVIEWERS: 'Масово изтрити рецензенти',
    BULK_UPDATE_STATUS: 'Масова промяна на статус',
    COMPLIANCE_CHECK: 'Проверка за съответствие',
    AC_ACCEPT_CONTEST_RESULTS: 'Приети резултати от конкурс (АС)',
    UPDATE_BUDGET_EXEC: 'Обновено изпълнение на бюджет',
    ASSIGN_FINAL_REVIEWER: 'Назначен финален рецензент',
    SUBMIT_FINAL_REVIEW: 'Подадена финална рецензия',
    ACCEPT_FINAL_REPORT: 'Приет финален отчет',
    CREATE_MON_REPORT: 'Създаден МОН отчет',
    REFRESH_MON_DATA: 'Обновени данни на МОН отчет',
    ARCHIVE_MON_REPORT: 'Архивиран МОН отчет',
    CANCEL_MON_REPORT: 'Отказан МОН отчет',
    CLEANUP_MON_DUPLICATES: 'Почистени дубликати (МОН)',
    AC_APPROVE_COMPETITION: 'Одобрен конкурс (АС)',
    RECTOR_ORDER_COMPETITION: 'Ректорска заповед за конкурс',
    REJECT_REVIEWER_PROPOSAL: 'Отхвърлено предложение за рецензенти',
    CONFIRM_REVIEWER_PROPOSAL: 'Потвърдено предложение за рецензенти',
    GDPR_AUTO_ANONYMISE: 'GDPR — автоматична анонимизация',
};
var LOG_ACTION_PREFIX_FALLBACK = {
    SEND_:    'Известие / съобщение',
    SIGN_:    'Подписване',
    CREATE_:  'Създаване',
    APPROVE_: 'Одобрение',
    REJECT_:  'Отказ',
    ASSIGN_:  'Назначаване',
    SUBMIT_:  'Подаване',
    EDIT_:    'Редакция',
    UPDATE_:  'Обновяване',
    DELETE_:  'Изтриване',
    GDPR_:    'GDPR действие',
    AC_:      'Действие на АС',
    RECTOR_:  'Ректорско действие',
    ARCHIVE_: 'Архивиране',
    CANCEL_:  'Отказ',
    CLEANUP_: 'Почистване',
    CONFIRM_: 'Потвърждение',
    REFRESH_: 'Обновяване',
    BULK_:    'Масова операция',
};
var friendlyLogAction = (action) => {
    if (!action) return '—';
    if (LOG_ACTION_LABELS[action]) return LOG_ACTION_LABELS[action];
    const upper = String(action).toUpperCase();
    // Prefix-based fallback: known specific prefix → known generic Bulgarian phrase
    const prefKeys = Object.keys(LOG_ACTION_PREFIX_FALLBACK);
    for (let i = 0; i < prefKeys.length; i++) {
        if (upper.indexOf(prefKeys[i]) === 0) return LOG_ACTION_PREFIX_FALLBACK[prefKeys[i]];
    }
    // Last-resort: humanize SCREAMING_SNAKE → Sentence case
    return upper.charAt(0) + upper.slice(1).toLowerCase().replace(/_/g, ' ');
};

var LOG_ENTITY_LABELS = {
    Reviewer: 'Рецензент',
    Application: 'Заявление',
    Form: 'Заявление',
    Competition: 'Конкурс',
    Project: 'Проект',
    Contract: 'Договор',
    Expense: 'Разход',
    Deliverable: 'Резултат',
    Report: 'Отчет',
    MonReport: 'МОН отчет',
    LibraryDeposit: 'Библиотечен депозит',
    Sanction: 'Санкция',
    User: 'Потребител',
    File: 'Файл',
    Document: 'Документ',
    Notification: 'Известие',
    Backup: 'Архив',
    System: 'Система',
    system: 'Система',
    admin: 'Администратор',
    applicant: 'Кандидат',
    secret: 'Секрет',
    Audit: 'Одит',
    signature: 'Подписване',
    default: 'По подразбиране',
    'new-application': 'Ново заявление',
};
var friendlyLogEntity = (en) => LOG_ENTITY_LABELS[en] || en || '';

var LOG_DETAIL_KEY_LABELS = {
    email: 'Имейл',
    emails: 'Имейли',
    competitionId: 'Конкурс',
    competition: 'Конкурс',
    formId: 'Заявление',
    form: 'Заявление',
    applicationId: 'Заявление',
    projectId: 'Проект',
    project: 'Проект',
    projectCode: 'Код на проект',
    reportId: 'Отчет',
    contractId: 'Договор',
    expenseId: 'Разход',
    depositId: 'Депозит',
    reviewers: 'Рецензенти',
    reviewer: 'Рецензент',
    hasReview: 'Има рецензия',
    hasConsent: 'Декларирано съгласие',
    recommendation: 'Препоръка',
    score: 'Оценка',
    total: 'Общо',
    status: 'Статус',
    oldStatus: 'Стар статус',
    newStatus: 'Нов статус',
    reason: 'Причина',
    note: 'Бележка',
    notes: 'Бележки',
    amount: 'Сума',
    currency: 'Валута',
    fileName: 'Файл',
    fileId: 'Файл (Drive)',
    title: 'Заглавие',
    name: 'Име',
    type: 'Тип',
    kind: 'Вид',
    action: 'Действие',
    ip: 'IP адрес',
    userAgent: 'Браузър',
    deviceId: 'Устройство',
    otp: 'Код',
    method: 'Метод',
    consent: 'Съгласие',
    signed: 'Подписан',
    ts: 'Време',
    timestamp: 'Време',
    subject: 'Тема',
    body: 'Съдържание',
    to: 'До',
    from: 'От',
    cc: 'Копие',
    count: 'Брой',
    role: 'Роля',
    sanctionType: 'Вид санкция',
    // v6.8+ — допълнителни ключове от детайли
    ref: 'Референция',
    ok: 'Успешно',
    deleted: 'Изтрити',
    ids: 'Идентификатори',
    filesAdded: 'Добавени файлове',
    docsChanged: 'Променени документи',
    signatureHash: 'Хеш на подпис',
    signatureWarnings: 'Предупреждения',
    copiesProvided: 'Предоставени копия',
    electronicCopy: 'Електронно копие',
    electronicCopyProvided: 'Ел. копие',
    kept: 'Запазени',
    moved: 'Преместени',
    trashed: 'Изтрити',
    decision: 'Решение',
    proposalId: 'Предложение',
    orderNumber: 'Номер на заповед',
    orderDate: 'Дата на заповед',
    assignSuccess: 'Назначени',
    finalReviewers: 'Финални рецензенти',
    avgScore: 'Средна оценка',
    threshold: 'Праг',
    year: 'Година',
    period: 'Период',
    reportType: 'Тип отчет',
    deferred: 'Отложени',
    evaluation: 'Оценка',
    reviewerId: 'Рецензент',
    costGroup: 'Разходна група',
    folderId: 'Папка',
    archivedFileId: 'Архивиран файл',
    archivedName: 'Име на архив',
    maxScore: 'Макс. оценка',
    totalScore: 'Общо точки',
    oldEmail: 'Стар имейл',
    newEmail: 'Нов имейл',
    ministryRef: 'Реф. на министерство',
    subjects: 'Субекти',
    rows: 'Редове',
    totalRows: 'Общо редове',
    pdfId: 'PDF',
    xlsxId: 'Excel',
    consentDate: 'Дата на съгласие',
    coiDeclared: 'Конфликт на интереси',
    delta: 'Промяна',
    oldValue: 'Стара стойност',
    newValue: 'Нова стойност',
};
var friendlyLogKey = (k) => LOG_DETAIL_KEY_LABELS[k] || k;
var fmtLogVal = (v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Да' : 'Не';
    if (Array.isArray(v)) return v.length ? v.map(fmtLogVal).join(', ') : '—';
    if (typeof v === 'object') {
        try { return JSON.stringify(v); } catch (_) { return String(v); }
    }
    return String(v);
};
/** Render TransactionLog `details` (string|object) as a 2-col key:value grid
 *  when JSON-parseable; otherwise return the raw text untouched (so even
 *  truncated server payloads still surface every byte of information). */
var renderLogDetails = (raw) => {
    if (raw === null || raw === undefined || raw === '') return '—';
    let obj = null;
    if (typeof raw === 'object') {
        obj = raw;
    } else {
        const text = String(raw);
        if (text.charAt(0) === '{' || text.charAt(0) === '[') {
            try { obj = JSON.parse(text); } catch (_) { obj = null; }
        }
        if (!obj) return text;
    }
    const entries = Array.isArray(obj)
        ? obj.map((v, i) => [String(i + 1), v])
        : Object.keys(obj).map(k => [k, obj[k]]);
    if (!entries.length) return '—';
    return e('div', { style:{ display:'grid', gridTemplateColumns:'auto 1fr', columnGap:'.5rem', rowGap:'.15rem' } },
        entries.map((kv, i) => e(Fragment, { key: i },
            e('span', { style:{ color:'var(--ink-4)', fontSize:'.7rem' } }, friendlyLogKey(kv[0]) + ':'),
            e('span', { style:{ color:'var(--ink-2)', fontSize:'.74rem', wordBreak:'break-word' } }, fmtLogVal(kv[1]))
        ))
    );
};
var fmtLogTs = (ts) => {
    try { return (typeof fmtDateTime==='function')?fmtDateTime(ts):new Date(ts).toLocaleString('bg-BG'); }
    catch (_) { return String(ts || '').substring(0, 19).replace('T', ' '); }
};

/* ─── Notification & Audit Log panel (admin) ─── */
var NotificationLogPanel = ({ isAdmin, user }) => {
    const myEmail = String(user?.email || '').toLowerCase().trim();
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [entries, setEntries] = useState([]);
    const [kindPrefix, setKindPrefix] = useState('');
    const [entityId, setEntityId]     = useState('');
    const [actor, setActor]           = useState('');
    const [days, setDays]             = useState(30);

    const doLoad = useCallback(async (kp, eid, act, d) => {
        setLoading(true); setError('');
        try {
            const sinceIso = d > 0 ? new Date(Date.now() - d*24*60*60*1000).toISOString() : '';
            const r = await api('getnotificationlog', {
                kindPrefix: kp || '',
                entityId: (eid||'').trim(),
                actor: (act||'').trim(),
                since: sinceIso,
                limit: 400
            });
            if (r && r.success) setEntries(r.entries || []);
            else setError((r && r.error) || 'Неуспешно зареждане');
        } catch (ex) { setError(ex.message || String(ex)); }
        finally { setLoading(false); }
    }, []);

    const load = useCallback(() => doLoad(kindPrefix, entityId, actor, days),
        [doLoad, kindPrefix, entityId, actor, days]);

    useEffect(() => { doLoad('', '', '', 30); }, [doLoad]);

    const filterMyself = useCallback(() => {
        setActor(myEmail);
        doLoad(kindPrefix, entityId, myEmail, days);
    }, [myEmail, kindPrefix, entityId, days, doLoad]);

    const clearAll = useCallback(() => {
        setKindPrefix(''); setEntityId(''); setActor(''); setDays(30);
        doLoad('', '', '', 30);
    }, [doLoad]);

    return e('div', null,
        e('div', { style:{ marginBottom:'1rem' } },
            e('h3', { style:{ fontFamily:'var(--font-display)', fontSize:'1.05rem', fontWeight:700, color:'var(--ink)', marginBottom:'.25rem' } },
                e('i', { className:'fas fa-clipboard-list', style:{ marginRight:'.4rem', color:'var(--primary)' } }), 'Системен дневник'),
            e('p', { style:{ fontSize:'.8rem', color:'var(--ink-3)', lineHeight:1.6 } },
                'Пълен системен дневник — входове, изходи, имейли, подписвания, финансови мутации, рецензии, промени на статуси и всички административни действия. Служи като доказателство по ЗЕДЕУУ. Използвайте бутона „Мои действия" за бърз филтър по вашия акаунт.')
        ),
        e('div', { className:'card', style:{ marginBottom:'.75rem' } },
            e('div', { className:'card-body' },
                e('div', { style:{ display:'grid', gridTemplateColumns:'1.3fr 1fr 1fr 0.8fr', gap:'.5rem', marginBottom:'.5rem' } },
                    e('div', null,
                        e('label', { style:{ fontSize:'.7rem', color:'var(--ink-3)', display:'block', marginBottom:'.2rem' } }, 'Категория'),
                        e('select', { value: kindPrefix, onChange: ev => setKindPrefix(ev.target.value),
                            style:{ width:'100%', padding:'.35rem .55rem', border:'1px solid var(--border)', borderRadius:6, fontSize:'.82rem' } },
                            e('option', { value:'' },         'Всички'),
                            e('option', { value:'LOGIN' },    'Влизания / LOGIN'),
                            e('option', { value:'LOGOUT' },   'Изходи / LOGOUT'),
                            e('option', { value:'SEND_' },    'Уведомления / SEND_'),
                            e('option', { value:'SIGN_' },    'Подписване / SIGN_'),
                            e('option', { value:'CREATE_' },  'Създаване / CREATE_'),
                            e('option', { value:'APPROVE_' }, 'Одобрения / APPROVE_'),
                            e('option', { value:'ASSIGN_' },  'Назначения / ASSIGN_'),
                            e('option', { value:'SUBMIT_' },  'Подавания / SUBMIT_'),
                            e('option', { value:'UPDATE_BUDGET_' }, 'Бюджет'),
                            e('option', { value:'ADD_SANCTION' },   'Санкции'),
                            e('option', { value:'GDPR_' },    'GDPR'),
                            e('option', { value:'NIGHTLY_BACKUP' }, 'Бъкапи'),
                            e('option', { value:'AUTO_REPORT_OVERDUE' }, 'Просрочени отчети')
                        )
                    ),
                    e('div', null,
                        e('label', { style:{ fontSize:'.7rem', color:'var(--ink-3)', display:'block', marginBottom:'.2rem' } }, 'ID на запис'),
                        e('input', { value: entityId, onChange: ev => setEntityId(ev.target.value),
                            placeholder: 'напр. APP-123 / EXP-7',
                            style:{ width:'100%', padding:'.35rem .55rem', border:'1px solid var(--border)', borderRadius:6, fontSize:'.82rem' } })
                    ),
                    e('div', null,
                        e('label', { style:{ fontSize:'.7rem', color:'var(--ink-3)', display:'block', marginBottom:'.2rem' } }, 'Потребител'),
                        e('input', { value: actor, onChange: ev => setActor(ev.target.value),
                            placeholder: 'имейл / част от име',
                            style:{ width:'100%', padding:'.35rem .55rem', border:'1px solid var(--border)', borderRadius:6, fontSize:'.82rem' } })
                    ),
                    e('div', null,
                        e('label', { style:{ fontSize:'.7rem', color:'var(--ink-3)', display:'block', marginBottom:'.2rem' } }, 'Период'),
                        e('select', { value: days, onChange: ev => setDays(Number(ev.target.value)||30),
                            style:{ width:'100%', padding:'.35rem .55rem', border:'1px solid var(--border)', borderRadius:6, fontSize:'.82rem' } },
                            e('option', { value:7 },   'Последните 7 дни'),
                            e('option', { value:30 },  'Последните 30 дни'),
                            e('option', { value:90 },  'Последните 3 месеца'),
                            e('option', { value:365 }, 'Последната година'),
                            e('option', { value:0 },   'Всички записи')
                        )
                    )
                ),
                e('div', { style:{ display:'flex', gap:'.4rem', flexWrap:'wrap' } },
                    e('button', { className:'btn btn-primary btn-sm', onClick: load, disabled: loading },
                        e('i', { className:'fas fa-search' }), ' Търси'),
                    myEmail && e('button', { className:'btn btn-outline btn-sm', onClick: filterMyself, title:'Покажи само моите действия' },
                        e('i', { className:'fas fa-user' }), ' Мои действия'),
                    e('button', { className:'btn btn-outline btn-sm', onClick: clearAll },
                        e('i', { className:'fas fa-times' }), ' Изчисти')
                )
            )
        ),
        loading && e('div', { style:{ padding:'1rem', textAlign:'center', color:'var(--ink-4)' } },
            e('i', { className:'fas fa-spinner fa-spin' }), ' Зареждане…'),
        error && e('div', { style:{ padding:'.6rem .85rem', background:'var(--err-bg)', border:'1px solid var(--err-border)', borderRadius:'var(--r-sm)', fontSize:'.8rem', color:'var(--err)' } },
            e('i', { className:'fas fa-triangle-exclamation' }), ' ', error),
        !loading && !error && entries.length === 0 && e('div', { className:'empty-state', style:{ padding:'1.4rem' } },
            e('div', { className:'empty-state-icon' }, e('i', { className:'fas fa-inbox' })),
            e('div', null, 'Няма записи за избраните критерии.')),
        !loading && !error && entries.length > 0 && e('div', { className:'card', style:{ overflow:'auto', maxHeight:460 } },
            e('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'.78rem' } },
                e('thead', null, e('tr', { style:{ background:'var(--surface)', position:'sticky', top:0 } },
                    e('th', { style:{ padding:'.45rem .6rem', textAlign:'left' } }, 'Време'),
                    e('th', { style:{ padding:'.45rem .6rem', textAlign:'left' } }, 'Действие'),
                    e('th', { style:{ padding:'.45rem .6rem', textAlign:'left' } }, 'Свързано'),
                    e('th', { style:{ padding:'.45rem .6rem', textAlign:'left' } }, 'Детайли'),
                    e('th', { style:{ padding:'.45rem .6rem', textAlign:'left' } }, 'Потребител'))),
                e('tbody', null, entries.map((row, idx) => {
                    const friendlyA = friendlyLogAction(row.action);
                    const showRaw   = friendlyA !== row.action;
                    const friendlyE = friendlyLogEntity(row.entity);
                    const isLogin   = String(row.action||'').toUpperCase().indexOf('LOGIN') === 0 || row.action === 'LOGOUT';
                    const isMyRow   = myEmail && String(row.user||'').toLowerCase().indexOf(myEmail) !== -1;
                    return e('tr', { key: idx, style:{ borderTop:'1px solid var(--border)', background: isMyRow ? 'var(--primary-bg,#f5f8ff)' : '' } },
                        e('td', { style:{ padding:'.4rem .6rem', whiteSpace:'nowrap', color:'var(--ink-3)', fontSize:'.74rem' } }, fmtLogTs(row.timestamp)),
                        e('td', { style:{ padding:'.4rem .6rem' } },
                            e('div', { style:{ fontWeight:600, color: isLogin ? 'var(--ok)' : 'var(--ink)' } }, friendlyA),
                            showRaw && e('div', { style:{ fontFamily:'monospace', fontSize:'.66rem', color:'var(--ink-4)' } }, row.action)
                        ),
                        e('td', { style:{ padding:'.4rem .6rem', fontSize:'.74rem', color:'var(--ink-2)' } },
                            row.entityId
                                ? e('div', null,
                                    friendlyE && e('div', { style:{ fontWeight:600 } }, friendlyE),
                                    e('div', { style:{ fontFamily:'monospace', fontSize:'.68rem', color:'var(--ink-4)' } }, row.entityId)
                                  )
                                : (friendlyE || '—')
                        ),
                        e('td', { style:{ padding:'.4rem .6rem', maxWidth:340 }, title: row.details || '' },
                            renderLogDetails(row.details)
                        ),
                        e('td', { style:{ padding:'.4rem .6rem', fontSize:'.74rem', wordBreak:'break-word' } },
                            e('span', { style:{ color: isMyRow ? 'var(--primary)' : 'var(--ink-3)', fontWeight: isMyRow ? 700 : 400 } }, row.user || '—')
                        )
                    );
                }))
            )
        ),
        !loading && !error && entries.length > 0 && e('div', { style:{ padding:'.5rem .25rem', fontSize:'.72rem', color:'var(--ink-4)' } },
            e('i', { className:'fas fa-info-circle' }), ' Показани са ', e('strong', null, entries.length), ' записа. Редовете с вашия имейл са маркирани в синьо.')
    );
};

/* ─── My Activity Log panel (applicant / reviewer self-view) ───────────
 * Per-user view onto TransactionLog. Backend filters rows where my email
 * appears in any audited column (entity, entityId, user, details JSON).
 * Read-only; details are clipped server-side to 240 chars to avoid
 * leaking other users' PII that may have travelled inside a payload.
 *
 * v5.9.47: Now explicitly sends userEmail to the backend so login events
 * (LOGIN, LOGIN_ADMIN, LOGIN_RECTOR, LOGIN_2FA, LOGOUT) are correctly
 * attributed to the Google-authenticated account. Login rows show IP,
 * browser, and device when available in the details column. ─────────── */
var MyActivityLogPanel = ({ user }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [entries, setEntries] = useState([]);
    const [kindPrefix, setKindPrefix] = useState('');
    const [days, setDays]       = useState(30);
    const userEmail = String(user?.email || '').toLowerCase().trim();

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const sinceIso = days > 0
                ? new Date(Date.now() - days*24*60*60*1000).toISOString()
                : '';
            const r = await api('getmyactivitylog', {
                kindPrefix: kindPrefix || '',
                since: sinceIso,
                limit: 300,
                userEmail: userEmail,
                userId: userEmail
            });
            if (r && r.success) setEntries(r.entries || []);
            else setError((r && r.error) || 'Неуспешно зареждане');
        } catch (ex) { setError(ex.message || String(ex)); }
        finally { setLoading(false); }
    }, [kindPrefix, days, userEmail]);
    useEffect(() => { load(); }, [load]);

    // Friendly humanizers are module-level (LOG_*); aliased here so the JSX
    // below stays compact and any future panel can drop in the same names.
    const friendlyLabel  = friendlyLogAction;
    const friendlyEntity = friendlyLogEntity;
    const renderDetails  = renderLogDetails;
    const fmtTs          = fmtLogTs;

    // ── Login-event detail extractor ──────────────────────────────────────
    // When a row's action starts with LOGIN, parse the details JSON for
    // IP, browser, device and render a compact login-info strip instead
    // of the raw key:value grid.
    const renderLoginDetails = (raw) => {
        let obj = null;
        if (typeof raw === 'object') obj = raw;
        else if (typeof raw === 'string' && (raw.charAt(0) === '{' || raw.charAt(0) === '[')) {
            try { obj = JSON.parse(raw); } catch (_) { obj = null; }
        }
        if (!obj) return renderDetails(raw);
        const ip = obj.ip || obj.clientIP || '';
        const ua = obj.userAgent || obj.browser || '';
        const dev = obj.device || '';
        const loc = obj.location || obj.city || '';
        const parts = [];
        if (ip) parts.push(e('span',{key:'ip',style:{display:'inline-flex',alignItems:'center',gap:'.25rem'}},e('i',{className:'fas fa-globe',style:{fontSize:'.58rem',color:'var(--ink-4)'}}),ip));
        if (dev) parts.push(e('span',{key:'dev',style:{marginLeft:'.5rem',display:'inline-flex',alignItems:'center',gap:'.25rem'}},e('i',{className:'fas fa-desktop',style:{fontSize:'.58rem',color:'var(--ink-4)'}}),dev));
        if (ua) parts.push(e('span',{key:'ua',style:{marginLeft:'.5rem',display:'inline-flex',alignItems:'center',gap:'.25rem'}},e('i',{className:'fas fa-window-maximize',style:{fontSize:'.58rem',color:'var(--ink-4)'}}),String(ua).slice(0,40)));
        if (loc) parts.push(e('span',{key:'loc',style:{marginLeft:'.5rem',display:'inline-flex',alignItems:'center',gap:'.25rem'}},e('i',{className:'fas fa-map-marker-alt',style:{fontSize:'.58rem',color:'var(--ink-4)'}}),loc));
        return parts.length > 0 ? e('div',{style:{display:'flex',flexWrap:'wrap',alignItems:'center',gap:'.15rem',fontSize:'.7rem',color:'var(--ink-3)'}},parts) : renderDetails(raw);
    };

    return e('div', null,
        e('div', { style:{ marginBottom:'1rem' } },
            e('h3', { style:{ fontFamily:'var(--font-display)', fontSize:'1.05rem', fontWeight:700, color:'var(--ink)', marginBottom:'.25rem' } },
                e('i', { className:'fas fa-clipboard-list', style:{ marginRight:'.4rem', color:'var(--primary)' } }),
                'Моят дневник на действията'),
            e('p', { style:{ fontSize:'.8rem', color:'var(--ink-3)', lineHeight:1.6 } },
                'Хронология на вашите действия в системата — влизания, подавания, редакции на файлове, рецензии, експорти. Записите се пазят съгласно ЗЕДЕУУ и могат да бъдат експортирани като част от GDPR заявка за достъп.',
                userEmail && e('span',{style:{display:'block',marginTop:'.25rem',color:'var(--ink-4)',fontSize:'.72rem'}},e('i',{className:'fas fa-user',style:{marginRight:'.3rem'}}),'Акаунт: ',e('strong',null,userEmail)))
        ),
        e('div', { className:'card', style:{ marginBottom:'.75rem' } },
            e('div', { className:'card-body', style:{ display:'grid', gridTemplateColumns:'1.4fr 1fr auto', gap:'.5rem', alignItems:'end' } },
                e('div', null,
                    e('label', { style:{ fontSize:'.7rem', color:'var(--ink-3)', display:'block', marginBottom:'.2rem' } }, 'Категория'),
                    e('select', { value: kindPrefix, onChange: ev => setKindPrefix(ev.target.value),
                        style:{ width:'100%', padding:'.35rem .55rem', border:'1px solid var(--border)', borderRadius:6, fontSize:'.82rem' } },
                        e('option', { value:'' },         'Всички действия'),
                        e('option', { value:'LOGIN' },    'Влизания'),
                        e('option', { value:'SUBMIT_' },  'Подавания'),
                        e('option', { value:'EDIT_' },    'Редакции'),
                        e('option', { value:'SIGN_' },    'Подписвания'),
                        e('option', { value:'SEND_' },    'Известия'),
                        e('option', { value:'GDPR_' },    'GDPR действия'),
                        e('option', { value:'REDACT' },   'Файлови операции')
                    )
                ),
                e('div', null,
                    e('label', { style:{ fontSize:'.7rem', color:'var(--ink-3)', display:'block', marginBottom:'.2rem' } }, 'Период'),
                    e('select', { value: days, onChange: ev => setDays(Number(ev.target.value) || 30),
                        style:{ width:'100%', padding:'.35rem .55rem', border:'1px solid var(--border)', borderRadius:6, fontSize:'.82rem' } },
                        e('option', { value:7 },   'Последните 7 дни'),
                        e('option', { value:30 },  'Последните 30 дни'),
                        e('option', { value:90 },  'Последните 3 месеца'),
                        e('option', { value:365 }, 'Последната година'),
                        e('option', { value:0 },   'Всички записи')
                    )
                ),
                e('button', { className:'btn btn-outline btn-sm', onClick: load, disabled: loading },
                    e('i', { className:'fas fa-sync-alt'+(loading?' fa-spin':'') }), ' Опресни')
            )
        ),
        loading && e('div', { style:{ padding:'1rem', textAlign:'center', color:'var(--ink-4)' } },
            e('i', { className:'fas fa-spinner fa-spin' }), ' Зареждане…'),
        error && e('div', { style:{ padding:'.6rem .85rem', background:'var(--err-bg)', border:'1px solid var(--err-border)', borderRadius:'var(--r-sm)', fontSize:'.8rem', color:'var(--err)' } },
            e('i', { className:'fas fa-triangle-exclamation' }), ' ', error),
        !loading && !error && entries.length === 0 && e('div', { className:'empty-state', style:{ padding:'1.4rem' } },
            e('div', { className:'empty-state-icon' }, e('i', { className:'fas fa-inbox' })),
            e('div', null, 'Няма действия в избрания период.')),
        !loading && !error && entries.length > 0 && e('div', { className:'card', style:{ overflow:'auto', maxHeight:460 } },
            e('table', { style:{ width:'100%', borderCollapse:'collapse', fontSize:'.78rem' } },
                e('thead', null, e('tr', { style:{ background:'var(--surface)', position:'sticky', top:0 } },
                    e('th', { style:{ padding:'.45rem .6rem', textAlign:'left' } }, 'Време'),
                    e('th', { style:{ padding:'.45rem .6rem', textAlign:'left' } }, 'Действие'),
                    e('th', { style:{ padding:'.45rem .6rem', textAlign:'left' } }, 'Свързано'),
                    e('th', { style:{ padding:'.45rem .6rem', textAlign:'left' } }, 'Детайли')
                )),
                e('tbody', null, entries.map((row, idx) => {
                    const friendlyA = friendlyLabel(row.action);
                    const showRaw = friendlyA !== row.action;
                    const friendlyE = friendlyEntity(row.entity);
                    const isLogin = String(row.action||'').toUpperCase().indexOf('LOGIN')===0;
                    return e('tr', { key: idx, style:{ borderTop:'1px solid var(--border)' } },
                        e('td', { style:{ padding:'.4rem .6rem', whiteSpace:'nowrap', color:'var(--ink-3)', fontSize:'.74rem' } }, fmtTs(row.timestamp)),
                        e('td', { style:{ padding:'.4rem .6rem' } },
                            e('div', { style:{ fontWeight:600, color: isLogin?'var(--ok)':'var(--ink)' } }, friendlyA),
                            showRaw && e('div', { style:{ fontFamily:'monospace', fontSize:'.66rem', color:'var(--ink-4)' } }, row.action)
                        ),
                        e('td', { style:{ padding:'.4rem .6rem', fontSize:'.74rem', color:'var(--ink-2)' } },
                            row.entityId
                                ? e('div', null,
                                    friendlyE && e('div', { style:{ fontWeight:600 } }, friendlyE),
                                    e('div', { style:{ fontFamily:'monospace', fontSize:'.68rem', color:'var(--ink-4)' } }, row.entityId)
                                )
                                : (friendlyE || '—')
                        ),
                        e('td', { style:{ padding:'.4rem .6rem', maxWidth:340 }, title: row.details || '' },
                            isLogin ? renderLoginDetails(row.details) : renderDetails(row.details)
                        )
                    );
                }))
            )
        ),
        !loading && !error && entries.length > 0 && e('div', { style:{ padding:'.5rem .25rem', fontSize:'.72rem', color:'var(--ink-4)' } },
            e('i', { className:'fas fa-info-circle' }), ' Показани са ', e('strong', null, entries.length), ' записа. За пълен експорт използвайте „Поверителност → Експорт (JSON)".'
        )
    );
};

/* ─── My Data Portability Panel (applicant self-export + draft clearing) ─── */
var MyDataPortabilityPanel=({user,email})=>{
    const[busy,setBusy]=useState(false);
    const[cleared,setCleared]=useState(null);
    const[err,setErr]=useState('');
    const em=email||(user&&user.email)||'';

    const handleExport=useCallback(function(clearDrafts){
        if(!em)return;
        if(clearDrafts&&!confirm('Черновите ви ще бъдат скрити от активния изглед (запазени за одит). Продължи?'))return;
        setBusy(true);setErr('');setCleared(null);
        api('exportmydata',{email:em,userId:em,clearDraftsAfterExport:clearDrafts||false}).then(function(r){
            if(r&&r.success){
                var blob=new Blob([JSON.stringify(r.snapshot,null,2)],{type:'application/json'});
                var a=document.createElement('a');
                a.href=URL.createObjectURL(blob);
                a.download='my_data_'+(em||'me')+'_'+Date.now()+'.json';
                a.click();
                setTimeout(function(){URL.revokeObjectURL(a.href);},2000);
                if(clearDrafts&&r.cleared>0)setCleared(r.cleared);
            } else {
                setErr((r&&r.error)||'\u0413\u0440\u0435\u0448\u043a\u0430 \u043f\u0440\u0438 \u0435\u043a\u0441\u043f\u043e\u0440\u0442\u0430.');
            }
        }).catch(function(ex){setErr(ex.message||String(ex));}).finally(function(){setBusy(false);});
    },[em]);

    const handleClearDrafts=useCallback(function(){
        if(!em)return;
        if(!confirm('\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u0442\u0435 \u0432\u0438 \u0449\u0435 \u0431\u044a\u0434\u0430\u0442 \u0441\u043a\u0440\u0438\u0442\u0438 \u043e\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u0438\u044f \u0438\u0437\u0433\u043b\u0435\u0434 (\u0437\u0430\u043f\u0430\u0437\u0435\u043d\u0438 \u0437\u0430 \u043e\u0434\u0438\u0442). \u041f\u0440\u043e\u0434\u044a\u043b\u0436\u0438?'))return;
        setBusy(true);setErr('');setCleared(null);
        api('clearmydrafts',{email:em,userId:em}).then(function(r){
            if(r&&r.success){setCleared(r.cleared||0);}
            else{setErr((r&&r.error)||'\u0413\u0440\u0435\u0448\u043a\u0430.');}
        }).catch(function(ex){setErr(ex.message||String(ex));}).finally(function(){setBusy(false);});
    },[em]);

    return e('div',{className:'card',style:{marginBottom:'.75rem'}},
        e('div',{className:'card-header'},
            e('div',{className:'card-title'},
                e('i',{className:'fas fa-database',style:{marginRight:'.4rem',color:'var(--primary)'}}),
                '\u041c\u043e\u0438\u0442\u0435 \u0434\u0430\u043d\u043d\u0438 (\u043f\u0440\u0435\u043d\u043e\u0441\u0438\u043c\u043e\u0441\u0442)'
            )
        ),
        e('div',{className:'card-body'},
            e('p',{style:{fontSize:'.82rem',color:'var(--ink-3)',marginBottom:'.75rem',lineHeight:1.6}},
                '\u0418\u0437\u0442\u0435\u0433\u043b\u0435\u0442\u0435 \u0432\u0430\u0448\u0438\u0442\u0435 \u0437\u0430\u044f\u0432\u043b\u0435\u043d\u0438\u044f, \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0438 \u0438 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u043a\u0430\u0442\u043e JSON. \u041f\u0440\u0438 \u0436\u0435\u043b\u0430\u043d\u0438\u0435 \u043c\u043e\u0436\u0435\u0442\u0435 \u0435\u0434\u043d\u043e\u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e \u0434\u0430 \u0441\u043a\u0440\u0438\u0435\u0442\u0435 \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u0442\u0435 \u0441\u0438 \u043e\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u0438\u044f \u0438\u0437\u0433\u043b\u0435\u0434 (\u0434\u0430\u043d\u043d\u0438\u0442\u0435 \u043e\u0441\u0442\u0430\u0432\u0430\u0442 \u0437\u0430\u043f\u0430\u0437\u0435\u043d\u0438 \u0437\u0430 \u043e\u0434\u0438\u0442).'
            ),
            e('div',{style:{display:'flex',flexWrap:'wrap',gap:'.5rem'}},
                e('button',{className:'btn btn-secondary btn-sm',disabled:busy,onClick:function(){handleExport(false);}},
                    e('i',{className:'fas fa-download'}),' \u0418\u0437\u0442\u0435\u0433\u043b\u0438 \u0434\u0430\u043d\u043d\u0438\u0442\u0435 \u043c\u0438 (JSON)'
                ),
                e('button',{className:'btn btn-warning btn-sm',disabled:busy,onClick:function(){handleExport(true);}},
                    e('i',{className:'fas fa-file-export'}),' \u0415\u043a\u0441\u043f\u043e\u0440\u0442 + \u0438\u0437\u0447\u0438\u0441\u0442\u0438 \u0447\u0435\u0440\u043d\u043e\u0432\u0438'
                ),
                e('button',{className:'btn btn-danger btn-sm',disabled:busy,onClick:handleClearDrafts},
                    e('i',{className:'fas fa-trash-can'}),' \u0421\u0430\u043c\u043e \u0438\u0437\u0447\u0438\u0441\u0442\u0438 \u0447\u0435\u0440\u043d\u043e\u0432\u0438'
                )
            ),
            busy&&e('div',{style:{marginTop:'.5rem',fontSize:'.8rem',color:'var(--ink-3)'}},e('i',{className:'fas fa-spinner fa-spin'}),' \u041e\u0431\u0440\u0430\u0431\u043e\u0442\u043a\u0430...'),
            err&&e('div',{style:{marginTop:'.5rem',padding:'.5rem .75rem',background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',fontSize:'.8rem',color:'var(--err)'}},e('i',{className:'fas fa-triangle-exclamation'}),' ',err),
            cleared!==null&&e('div',{style:{marginTop:'.5rem',padding:'.5rem .75rem',background:'var(--ok-bg)',border:'1px solid var(--ok-border)',borderRadius:'var(--r-sm)',fontSize:'.8rem',color:'var(--ok)'}},
                e('i',{className:'fas fa-check-circle'}),cleared>0?' '+cleared+' \u0447\u0435\u0440\u043d\u043e\u0432\u0438 \u0441\u0430 \u0441\u043a\u0440\u0438\u0442\u0438 \u043e\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u0438\u044f \u0438\u0437\u0433\u043b\u0435\u0434.':' \u041d\u044f\u043c\u0430 \u0430\u043a\u0442\u0438\u0432\u043d\u0438 \u0447\u0435\u0440\u043d\u043e\u0432\u0438 \u0437\u0430 \u0438\u0437\u0447\u0438\u0441\u0442\u0432\u0430\u043d\u0435.'
            )
        )
    );
};

/* ─── Privacy & GDPR panel (data subject self-service + admin tools) ─── */
var PrivacyGdprPanel=({user,isAdmin})=>{
    const[busy,setBusy]=useState('');
    const[result,setResult]=useState(null);
    const[err,setErr]=useState('');
    const[chain,setChain]=useState(null);
    const C=window.Compliance||null;
    const run=async(label,fn)=>{
        setBusy(label);setErr('');setResult(null);
        try{const r=await fn();if(r&&r.success===false)throw new Error(r.error||'Грешка');setResult(r);}
        catch(ex){setErr(ex.message||String(ex));}
        finally{setBusy('');}
    };
    const downloadExport=async()=>{
        if(!C){setErr('Compliance модулът липсва');return;}
        await run('export',async()=>{
            const r=await C.gdpr.export(user.email);
            if(r&&r.success){
                const blob=new Blob([JSON.stringify(r,null,2)],{type:'application/json'});
                const a=document.createElement('a');a.href=URL.createObjectURL(blob);
                a.download='gdpr_export_'+(user.email||'me')+'_'+Date.now()+'.json';a.click();
                setTimeout(()=>URL.revokeObjectURL(a.href),2000);
            }
            return r;
        });
    };
    return e('div',null,
        e('div',{style:{marginBottom:'1rem'}},
            e('h3',{style:{fontFamily:'var(--font-display)',fontSize:'1.05rem',fontWeight:700,color:'var(--ink)',marginBottom:'.25rem'}},e('i',{className:'fas fa-shield-halved',style:{marginRight:'.4rem',color:'var(--red)'}}),'Поверителност и права на субекта'),
            e('p',{style:{fontSize:'.82rem',color:'var(--ink-3)',lineHeight:1.7}},'Съгласно GDPR (Регламент (ЕС) 2016/679) и ЗЗЛД имате право да: получите достъп до личните си данни, да ги поправите, да заявите изтриване (анонимизация) и да ги получите в преносим формат.')
        ),
        e('div',{className:'card',style:{marginBottom:'.75rem'}},
            e('div',{className:'card-header'},e('div',{className:'card-title'},e('i',{className:'fas fa-circle-info',style:{marginRight:'.4rem',color:'var(--info)'}}),'Контакт с DPO')),
            e('div',{className:'card-body',style:{fontSize:'.85rem',color:'var(--ink-2)',lineHeight:1.7}},
                e('div',null,e('strong',null,'Длъжностно лице по защита на данните: '),e('a',{href:'mailto:dpo@ue-varna.bg'},'dpo@ue-varna.bg')),
                e('div',null,e('strong',null,'Администратор: '),e('span',{className:'i18n-bg',translate:'no'},'Икономически университет – Варна'),e('span',{className:'i18n-en',translate:'no'},'University of Economics – Varna')),
                e('div',{style:{marginTop:'.6rem'}},
                    e('a',{href:'PRIVACY.md',target:'_blank',rel:'noopener',className:'btn btn-ghost btn-sm'},e('i',{className:'fas fa-file-shield'}),' Уведомление за поверителност')
                )
            )
        ),
        e('div',{className:'card',style:{marginBottom:'.75rem'}},
            e('div',{className:'card-header'},e('div',{className:'card-title'},e('i',{className:'fas fa-user-shield',style:{marginRight:'.4rem',color:'var(--ok)'}}),'Моите права')),
            e('div',{className:'card-body',style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'.5rem'}},
                e('button',{className:'btn btn-secondary btn-sm',disabled:!!busy,onClick:()=>run('access',()=>C.gdpr.access(user.email))},e('i',{className:'fas fa-eye'}),' Заяви достъп'),
                e('button',{className:'btn btn-secondary btn-sm',disabled:!!busy,onClick:downloadExport},e('i',{className:'fas fa-file-download'}),' Експорт (JSON)'),
                e('button',{className:'btn btn-warning btn-sm',disabled:!!busy,onClick:()=>{const v=prompt('Кое поле искате да коригирате? (Name / Phone / Address / Affiliation)');if(!v)return;const nv=prompt('Нова стойност за '+v);if(nv==null)return;const patch={};patch[v]=nv;run('rectify',()=>C.gdpr.rectify(user.email,patch));}},e('i',{className:'fas fa-pen-to-square'}),' Поправи'),
                e('button',{className:'btn btn-danger btn-sm',disabled:!!busy||!isAdmin,title:isAdmin?'':'Само DPO/админ',onClick:()=>{const r=prompt('Причина за изтриване (опционално):');if(r==null)return;if(!confirm('Ще бъдете анонимизиран в системата. Продължи?'))return;run('erasure',()=>C.gdpr.erasure(user.email,r));}},e('i',{className:'fas fa-user-slash'}),' Право да бъда забравен')
            )
        ),
        e(MyDataPortabilityPanel,{user,email:user&&user.email}),
        isAdmin&&e('div',{className:'card',style:{marginBottom:'.75rem'}},
            e('div',{className:'card-header'},e('div',{className:'card-title'},e('i',{className:'fas fa-link',style:{marginRight:'.4rem',color:'var(--gold)'}}),'Цялостност на одитната верига')),
            e('div',{className:'card-body',style:{display:'flex',gap:'.5rem',alignItems:'center',flexWrap:'wrap'}},
                e('button',{className:'btn btn-primary btn-sm',disabled:!!busy,onClick:async()=>{setBusy('chain');setErr('');try{const r=await C.audit.verifyChain();setChain(r);}catch(ex){setErr(ex.message);}finally{setBusy('');}}},e('i',{className:'fas fa-shield-check'}),' Валидирай SHA-256 верига'),
                chain&&e('span',{style:{fontSize:'.82rem',color:chain.valid?'var(--ok)':'var(--err)'}},chain.valid?'✔ Веригата е цяла ('+chain.rows+' записа)':'✘ Прекъсване на ред '+chain.brokenAtRow)
            )
        ),
        busy&&e('div',{style:{padding:'.6rem',fontSize:'.8rem',color:'var(--ink-3)'}},e('i',{className:'fas fa-spinner fa-spin'}),' Обработка...'),
        err&&e('div',{style:{padding:'.6rem .85rem',background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',fontSize:'.8rem',color:'var(--err)',marginTop:'.5rem'}},e('i',{className:'fas fa-triangle-exclamation'}),' ',err),
        result&&e('pre',{style:{padding:'.75rem',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r-sm)',fontSize:'.72rem',maxHeight:240,overflow:'auto',marginTop:'.5rem'}},JSON.stringify(result,null,2))
    );
};

/* ─── Profile Panel (user details) ─── */
var ProfilePanel=({user,isAdmin,isReviewer,onClose,logout,showSessionWarn,extendSession,onDismissSessionWarn,sessionCountdown})=>{
    const[loadingPrefs,setLoadingPrefs]=useState(true);
    const[prefs,setPrefs]=useState({});
    const[saving,setSaving]=useState(false);
    const[error,setError]=useState('');
    const email=String(user&&user.email||'').toLowerCase().trim();
    // Load user preferences on mount
    useEffect(function(){
        if(!email){setLoadingPrefs(false);return;}
        setLoadingPrefs(true);setError('');
        api('getuserprefs',{email:email,userId:email}).then(function(r){
            setLoadingPrefs(false);
            if(r&&r.success){setPrefs(r.preferences||{});}
            else if(r&&r.error)setError(r.error);
        }).catch(function(ex){setLoadingPrefs(false);setError('Грешка: '+(ex.message||String(ex)));});
    },[email]);
    const updatePref=useCallback(function(key,value){
        setPrefs(function(prev){var next=Object.assign({},prev);next[key]=value;return next;});
    },[]);
    const savePrefs=useCallback(function(){
        if(!email)return;
        setSaving(true);setError('');
        api('saveuserprefs',{email:email,userId:email,preferences:prefs}).then(function(r){
            setSaving(false);
            if(!r||!r.success){setError((r&&r.error)||'Грешка при записване на настройките.');}
        }).catch(function(ex){setSaving(false);setError('Грешка: '+(ex.message||String(ex)));});
    },[email,prefs]);
    const handleLogout=()=>{onClose();logout();};
    const displayName=prefs.display_name||user.name||'';
    const language=prefs.language||'bg';
    const newsletter=typeof prefs.newsletter==='undefined'?true:prefs.newsletter;
    return e('div',null,
        e('div',{style:{display:'flex',alignItems:'center',gap:'1.25rem',marginBottom:'1.5rem',padding:'1.25rem',background:'var(--surface)',borderRadius:'var(--r)',border:'1px solid var(--border)'}},
            user.picture
                ?e('div',{style:{width:64,height:64,borderRadius:'var(--r-sm)',overflow:'hidden',border:'2px solid var(--red-border)',flexShrink:0}},e('img',{src:user.picture,alt:user.name,style:{width:'100%',height:'100%',objectFit:'cover'}}))
                :e('div',{style:{width:64,height:64,borderRadius:'var(--r-sm)',background:'linear-gradient(135deg,var(--red-dim),rgba(123,27,27,.12))',border:'2px solid var(--red-border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem',fontWeight:700,color:'var(--red)',flexShrink:0}},initials(user.name)),
            e('div',{style:{flex:1,minWidth:0}},
                e('div',{style:{fontSize:'1.1rem',fontWeight:700,color:'var(--ink)',marginBottom:'.15rem'}},user.name||'—'),
                e('div',{style:{fontSize:'.82rem',color:'var(--ink-3)',marginBottom:'.4rem'}},user.email||'—'),
                e('span',{className:'role-badge '+(isAdmin?'admin':'')},isAdmin?'Администратор':isReviewer?'Рецензент':'Кандидат')
            )
        ),
        // ── Editable profile fields (T21: user profile editor) ──────────────────
        e('div',{className:'card',style:{marginTop:'.75rem',padding:0}},
            e('div',{className:'card-header',style:{padding:'.6rem .75rem',borderBottom:'1px solid var(--border)',background:'var(--ink-2)'}},
                e('h4',{style:{fontSize:'.9rem',fontWeight:700,color:'var(--ink)',margin:0}},e('i',{className:'fas fa-pen',style:{marginRight:'.35rem',color:'var(--primary)'}}),'Лични данни и настройки')
            ),
            e('div',{className:'card-body',style:{padding:'.75rem',display:'grid',gap:'.65rem'}},
                // Display name
                e('label',{style:{fontSize:'.82rem',fontWeight:600,color:'var(--ink)'}},'Показвано име',
                    e('input',{type:'text',defaultValue:displayName,onChange:function(ev){updatePref('display_name',ev.target.value);},
                        style:{display:'block',width:'100%',padding:'.45rem .6rem',border:'1px solid var(--border)',borderRadius:6,fontSize:'.85rem',background:'var(--white)',color:'var(--ink)',marginTop:'.3rem'}
                    })
                ),
                // Language
                e('label',{style:{fontSize:'.82rem',fontWeight:600,color:'var(--ink)'}},'Език на интерфейса',
                    e('select',{defaultValue:language,onChange:function(ev){updatePref('language',ev.target.value);},
                        style:{display:'block',width:'100%',padding:'.45rem .6rem',border:'1px solid var(--border)',borderRadius:6,fontSize:'.85rem',background:'var(--white)',color:'var(--ink)',marginTop:'.3rem'}
                    },
                        e('option',{key:'bg',value:'bg'},'Български'),
                        e('option',{key:'en',value:'en'},'English')
                    )
                ),
                // Newsletter
                e('label',{style:{fontSize:'.82rem',fontWeight:600,color:'var(--ink)',display:'flex',alignItems:'center',gap:'.5rem',cursor:'pointer'}},
                    e('input',{type:'checkbox',checked:newsletter,onChange:function(ev){updatePref('newsletter',ev.target.checked);},
                        style:{width:16,height:16,cursor:'pointer'}
                    }),
                    'Получавайте общи известия и новини (по имейл)',
                    e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.15rem'}},'Ако изключите, няма да получавате системни анонсamenti.')
                ),
                // Save button
                e('div',{style:{display:'flex',gap:'.5rem',alignItems:'center',marginTop:'.25rem'}},
                    e('button',{className:'btn btn-primary btn-sm',disabled:saving,onClick:savePrefs},
                        saving?e('i',{className:'fas fa-spinner fa-spin',style:{marginRight:'.3rem'}}):e('i',{className:'fas fa-check',style:{marginRight:'.3rem'}}),
                        saving?'Записва се...':'Запази настройките'
                    ),
                    error&&e('span',{style:{fontSize:'.78rem',color:'var(--err)'}},error)
                )
            )
        ),
        // Read-only identity info (cannot be changed — comes from auth provider)
        e('div',{className:'card',style:{marginTop:'.65rem',padding:'.65rem .75rem',background:'var(--ink-2)',borderRadius:6,fontSize:'.78rem',color:'var(--ink-3)'}},
            e('div',{style:{fontWeight:600,color:'var(--ink)',marginBottom:'.2rem'}},'Идентификационни данни (от Google / администратор)'),
            e('div',{style:{padding:'.2rem 0'}},'Имейл: ',e('strong',null,user.email||'—')),
            e('div',{style:{padding:'.2rem 0'}},'Роля: ',e('strong',null,isAdmin?'Администратор':isReviewer?'Рецензент':'Кандидат'))
        ),
        showSessionWarn&&e('div',{role:'alert',style:{display:'flex',alignItems:'center',gap:'.65rem',padding:'.7rem .95rem',background:'var(--warn-bg)',border:'1px solid var(--warn-border)',borderRadius:'var(--r-sm)',marginTop:'1rem',fontSize:'.82rem',color:'var(--warn)',flexWrap:'wrap'}},
            e('i',{className:'fas fa-clock','aria-hidden':'true'}),
            e('span',{style:{flex:1}},'Сесията ви изтича след ',e('strong',null,(sessionCountdown!=null?Math.floor(sessionCountdown/60)+':'+(sessionCountdown%60<10?'0':'')+sessionCountdown%60:'2:00'),' мин'),'!'),
            e('button',{className:'btn btn-outline btn-sm',style:{color:'var(--warn)',borderColor:'var(--warn-border)'},onClick:()=>{if(extendSession)extendSession()}},
                e('i',{className:'fas fa-redo',style:{marginRight:'.3rem'}}),'Удължи'),
            e('button',{className:'close-btn',style:{width:28,height:28,flexShrink:0},'aria-label':'Затвори',onClick:()=>{if(onDismissSessionWarn)onDismissSessionWarn()}},e('i',{className:'fas fa-times'}))
        ),
        e('div',{style:{borderTop:'1px solid var(--border)',paddingTop:'1rem',marginTop:'1rem'}},
            e('button',{className:'btn btn-danger btn-sm',onClick:handleLogout,style:{width:'100%',justifyContent:'center'}},e('i',{className:'fas fa-sign-out-alt'}),' Изход от профила')
        )
    );
};

/* ─── Settings & Notification Preferences panel (v6.9.0) ───
 *  Features:
 *    • Personal notification toggles for every user based on their role
 *    • Admin master panel: per-role system-wide notification blocks
 *    • Admin personal toggles separate from system controls
 *    • Notification frequency options (instant, daily, weekly)
 *    • Optimized rendering: memo'd rows, stable callbacks, CSS transitions
 *    • Responsive layout: single column on mobile, two-column on desktop
 *    • Auto-save with optimistic UI + error rollback + debounce
 *    • System styles (var(--surface), .card, .card-header, .chip, badges)
 * ──────────────────────────────────────────────────────────────────── */

/* ── All possible notification channels ── */
var ALL_CHANNELS = [
    {key:'email_otp',label:'OTP кодове за вход',desc:'6-цифрени кодове за двуфакторно удостоверяване',critical:true,roles:['applicant','reviewer','admin']},
    {key:'email_status_change',label:'Промяна на статус',desc:'Уведомления при промяна на статуса на заявлението',roles:['applicant','admin']},
    {key:'email_review_invite',label:'Покани за рецензиране',desc:'Когато сте назначени като рецензент',roles:['reviewer','admin']},
    {key:'email_review_reminder',label:'Напомняния за рецензии',desc:'За предстоящи/просрочени рецензии',roles:['reviewer','admin']},
    {key:'email_comment',label:'Коментари и корекции',desc:'Административни коментари и искания за корекция',roles:['applicant','reviewer','admin']},
    {key:'email_contract',label:'Договори и подписване',desc:'Уведомления за договори и подписване',roles:['applicant','admin']},
    {key:'email_report_due',label:'Срокове за отчети',desc:'Напомняния за наближаващи срокове на отчети',roles:['applicant','admin']},
    {key:'email_expense',label:'Разходи и плащания',desc:'Одобрение/отказ на разходни заявки',roles:['applicant','admin']},
    {key:'email_sanction',label:'Санкции',desc:'Уведомления при налагане на санкции',roles:['applicant','reviewer','admin']},
    {key:'email_new_message',label:'Ново съобщение',desc:'Когато получите ново съобщение от администратор',roles:['applicant','reviewer','admin']},
    {key:'email_broadcast',label:'Общи известия',desc:'Системни обявления и новини',roles:['applicant','reviewer','admin']},
    {key:'email_change_request',label:'Заявки за промени',desc:'Уведомления за одобрение/отказ на искания за промяна',roles:['applicant','admin']},
    {key:'inapp_messages',label:'Съобщения (в системата)',desc:'Получавайте съобщения от администратори в интерфейса',roles:['applicant','reviewer','admin']},
    {key:'inapp_alerts',label:'Критични аларми',desc:'Важни предупреждения за статус, срокове и санкции',critical:true,roles:['applicant','reviewer','admin']}
];

var ROLE_GROUPS = [
    {id:'applicant',label:'Кандидат',icon:'fa-user'},
    {id:'reviewer',label:'Рецензент',icon:'fa-star'},
    {id:'admin',label:'Администратор',icon:'fa-shield'}
];

var FREQUENCY_OPTIONS = [
    {value:'instant',label:'Веднага (имейл)'},
    {value:'daily',label:'Дневен дайджест'},
    {value:'weekly',label:'Седмична справка'}
];

/* ── Get channels applicable for a given role ── */
function channelsForRole(roleId, allChannels) {
    return allChannels.filter(function(ch){
        return ch.roles.indexOf(roleId) >= 0;
    });
}

var SettingsPanel=({user,isAdmin,userRole})=>{
    // Build default prefs from ALL_CHANNELS (all true)
    var defaultPrefs = {};
    ALL_CHANNELS.forEach(function(ch){ defaultPrefs[ch.key] = true; });
    defaultPrefs.notification_frequency = 'instant';

    const[personal,setPersonal]=useState(Object.assign({},defaultPrefs));
    // Initialize system defaults so admin panel renders immediately
    var defaultSystem = {};
    ALL_CHANNELS.forEach(function(ch){ defaultSystem[ch.key] = true; });
    const[system,setSystem]=useState(Object.assign({},defaultSystem));
    const[roleOverrides,setRoleOverrides]=useState(function(){
        var ro = {};
        ['applicant','reviewer','admin'].forEach(function(rid){
            ro[rid] = {};
            ALL_CHANNELS.forEach(function(ch){ ro[rid][ch.key] = true; });
        });
        return ro;
    });
    const[selectedRole,setSelectedRole]=useState('applicant');
    const[frequency,setFrequency]=useState('instant');
    const[loading,setLoading]=useState(true);
    // Admin email master switch (DEV_DISABLE_ADMIN_EMAILS ScriptProperty)
    const[adminEmailsEnabled,setAdminEmailsEnabled]=useState(false);
    const[adminEmailsToggling,setAdminEmailsToggling]=useState(false);
    const[toast,setToast]=useState(null);
    const email=(user&&user.email)||'';
    var role=String(userRole||'').toLowerCase();
    // Determine which roles this user sees
    var userRoles = ['applicant'];
    if(role==='reviewer'||role==='applicant_reviewer') userRoles=['applicant','reviewer'];
    if(role==='ckk'||role==='nidd'||role==='rector'||role==='admin') userRoles=['applicant','reviewer','admin'];

    // For admin, first role is selected for the master panel
    var displayRoles = isAdmin ? ['applicant','reviewer','admin'] : userRoles;

    const showToast=useCallback((type,msg)=>{
        setToast({type,msg});
        var t=setTimeout(function(){setToast(null)},2800);
        return function(){clearTimeout(t)};
    },[]);

    // ── Debounced batch-save timer (useRef to persist across renders) ──
    var _batchTimerRef = useRef(null);
    var _savingMapRef = useRef({});

    const scheduleBatchSave = useCallback(function(prefs, isSystem, rolePrefs){
        if (_batchTimerRef.current) clearTimeout(_batchTimerRef.current);
        _batchTimerRef.current = setTimeout(function(){
            _batchTimerRef.current = null;
            var action = isSystem ? 'savesystemnotificationsettings' : 'saveuserpreferences';
            var body = isSystem
                ? { prefs: prefs, userId: email, isAdmin: true, rolePrefs: rolePrefs || undefined }
                : { email: email, prefs: prefs };
            api(action, body).then(function(r){
                if (!r || !r.success) {
                    showToast('error', (r && r.error) || 'Грешка при записване на настройките.');
                }
            }).catch(function(err){
                showToast('error', 'Грешка при записване: ' + (err.message || String(err)));
            });
        }, 350);
    }, [email, showToast]);

    function isSavingKey(key){
        if (loading) return true;
        return _savingMapRef.current[key] === true || _savingMapRef.current['sys:' + key] === true;
    }

    // Load combined settings on mount — update in background, never block
    useEffect(function(){
        if(!email){setLoading(false);return;}
        api('getnotificationsettings',{email,userId:email}).then(function(r){
            if(r&&r.success){
                setPersonal(r.personal||Object.assign({},defaultPrefs));
                if(r.personal&&r.personal.notification_frequency){
                    setFrequency(r.personal.notification_frequency);
                }
                if(r.isAdmin&&r.system){
                    setSystem(r.system);
                    var ro = {};
                    ['applicant','reviewer','admin'].forEach(function(rid){
                        ro[rid] = {};
                        ALL_CHANNELS.forEach(function(ch){
                            // v7.0.0: use per-role overrides if available, else fall back to global flat
                            var roleData = r.systemRoles && r.systemRoles[rid];
                            if (roleData && typeof roleData[ch.key] === 'boolean') {
                                ro[rid][ch.key] = roleData[ch.key];
                            } else {
                                ro[rid][ch.key] = r.system[ch.key] !== false;
                            }
                        });
                    });
                    setRoleOverrides(ro);
                }
                // Admin email kill-switch comes back in the same response
                if(r.isAdmin && typeof r.adminEmailsEnabled === 'boolean'){
                    setAdminEmailsEnabled(r.adminEmailsEnabled);
                }
            }
        }).catch(function(){})
          .finally(function(){ setLoading(false); });
    },[email]);

    // ── Unified toggle: optimistic UI + debounced batch save ──
    // Uses functional state updates to prevent stale-closure overwrites
    // when multiple toggles are clicked in rapid succession.
    const togglePersonal=useCallback(function(key){
        setPersonal(function(prev){
            if(!prev)return prev;
            var updated=Object.assign({},prev,{[key]:!prev[key]});
            _savingMapRef.current[key]=true;
            scheduleBatchSave(updated,false);
            setTimeout(function(){delete _savingMapRef.current[key];},500);
            return updated;
        });
    },[scheduleBatchSave]);

    const toggleSystem=useCallback(function(key){
        setSystem(function(prev){
            if(!prev)return prev;
            var updated=Object.assign({},prev,{[key]:!prev[key]});
            _savingMapRef.current['sys:'+key]=true;
            scheduleBatchSave(updated,true);
            setTimeout(function(){delete _savingMapRef.current['sys:'+key];},500);
            return updated;
        });
    },[scheduleBatchSave]);

    const toggleAdminEmails=useCallback(function(){
        var newVal = !adminEmailsEnabled;
        setAdminEmailsToggling(true);
        api('setdevadminemailsenabled',{email,userId:email,enabled:newVal}).then(function(r){
            if(r&&r.success){
                setAdminEmailsEnabled(newVal);
                showToast('success', r.message || (newVal ? 'Админ имейли включени.' : 'Админ имейли потиснати.'));
            } else {
                showToast('error', (r&&r.error)||'Грешка при промяна на настройката.');
            }
        }).catch(function(err){
            showToast('error', 'Грешка: ' + (err.message||String(err)));
        }).finally(function(){ setAdminEmailsToggling(false); });
    },[email, adminEmailsEnabled, showToast]);

    const toggleRoleChannel=useCallback(function(roleId,key){
        if(!roleOverrides||!roleOverrides[roleId])return;
        var updatedOverrides;
        setRoleOverrides(function(prev){
            if(!prev||!prev[roleId])return prev;
            var current=prev[roleId][key];
            var updatedRole=Object.assign({},prev[roleId],{[key]:!current});
            updatedOverrides=Object.assign({},prev,{[roleId]:updatedRole});
            return updatedOverrides;
        });
        // Save role-specific prefs — does NOT modify the global flat system state
        setSystem(function(prev){
            if(!prev)return prev;
            _savingMapRef.current['role:'+roleId+':'+key]=true;
            // Use current system state as global prefs, and pass roleOverrides as rolePrefs
            // We defer reading updatedOverrides via a ref so the timer closure sees the latest value
            setTimeout(function(){
                setRoleOverrides(function(latestRoles){
                    setSystem(function(latestSystem){
                        scheduleBatchSave(latestSystem, true, latestRoles);
                        return latestSystem;
                    });
                    return latestRoles;
                });
                setTimeout(function(){delete _savingMapRef.current['role:'+roleId+':'+key];},500);
            }, 0);
            return prev; // do NOT change global system state
        });
    },[roleOverrides, scheduleBatchSave]);

    const changeFrequency=useCallback(function(val){
        setFrequency(val);
        setPersonal(function(prev){
            if(!prev)return prev;
            var updated=Object.assign({},prev,{notification_frequency:val});
            scheduleBatchSave(updated,false);
            return updated;
        });
    },[scheduleBatchSave]);

    // Section definitions — memo'd to avoid re-creation
    var sectionDefs=useMemo(function(){return[
        {id:'email_notifications',icon:'fa-envelope',color:'var(--primary)',
         label:'Имейл известия',desc:'Управлявайте какви имейли получавате.',
         keys:[]},
        {id:'inapp_notifications',icon:'fa-bell',color:'var(--gold)',
         label:'Известия в системата',desc:'Настройки за известия в интерфейса.',
         keys:[]},
        {id:'frequency',icon:'fa-clock',color:'var(--info)',
         label:'Честота на известия',desc:'Как искате да получавате известията.',
         keys:[]}
    ]},[]);

    // ── ToggleRow component (memo'd for performance) ──
    var ToggleRow=memo(function(props){
        var item=props.item,onToggle=props.onToggle,isOn=props.isOn,isSaving=props.isSaving;
        // Critical channels (e.g. OTP) are always-on and cannot be disabled.
        var isCritical = !!item.critical;
        var effectiveOn = isCritical ? true : isOn;
        return e('label',{
            title: isCritical ? 'Този канал е задължителен и не може да се изключи' : undefined,
            style:{
                display:'flex',alignItems:'center',gap:'.65rem',
                padding:'.5rem .65rem',borderRadius:'var(--r-xs)',
                cursor:(isSaving||isCritical)?'not-allowed':'pointer',userSelect:'none',
                transition:'background .15s ease,border-color .15s ease',
                border:'1px solid '+(effectiveOn?'var(--ok-border)':'var(--border)'),
                background:effectiveOn?'var(--ok-bg)':'var(--surface)',
                opacity:isSaving?.55:1
            }
        },
            e('input',{type:'checkbox',checked:effectiveOn,disabled:isSaving||isCritical,
                onChange:isCritical?function(){/*always on*/}:onToggle,
                style:{accentColor:'var(--ok)',width:16,height:16,flexShrink:0}
            }),
            e('div',{style:{flex:1,minWidth:0}},
                e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem',flexWrap:'wrap'}},
                    e('span',{style:{fontWeight:600,fontSize:'.8rem',color:'var(--ink)'}},item.label),
                    item.critical&&e('span',{style:{fontSize:'.55rem',fontWeight:700,padding:'.05rem .35rem',borderRadius:6,background:'var(--err-bg)',color:'var(--err)',border:'1px solid var(--err-border)'}},'критично')
                ),
                e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.05rem'}},item.desc)
            ),
            e('div',{
                style:{
                    fontSize:'.62rem',fontWeight:700,padding:'.12rem .4rem',borderRadius:8,
                    background:isOn?'var(--ok-bg)':'var(--surface)',
                    color:isOn?'var(--ok)':'var(--ink-4)',
                    border:'1px solid '+(isOn?'var(--ok)':'var(--border)'),
                    whiteSpace:'nowrap',transition:'all .15s ease',flexShrink:0
                }
            },isOn?'Вкл.':'Изкл.')
        );
    });

    // ── DropdownRow component for frequency ──
    var DropdownRow=memo(function(props){
        var value=props.value,onChange=props.onChange,options=props.options,label=props.label,disabled=props.disabled;
        return e('div',{style:{padding:'.5rem .65rem',display:'flex',alignItems:'center',gap:'.65rem',borderRadius:'var(--r-xs)',border:'1px solid var(--border)',background:'var(--surface)',opacity:disabled?.55:1}},
            e('div',{style:{flex:1,minWidth:0}},
                e('div',{style:{fontWeight:600,fontSize:'.8rem',color:'var(--ink)'}},label||'Честота на известията'),
                e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.05rem'}},'Как искате да получавате известията')
            ),
            e('select',{
                value:value,
                disabled:disabled||false,
                onChange:function(ev){onChange(ev.target.value);},
                style:{
                    padding:'.35rem .55rem',border:'1px solid var(--border)',borderRadius:6,
                    fontSize:'.78rem',background:'var(--white)',color:'var(--ink)',
                    cursor:disabled?'not-allowed':'pointer',minWidth:140
                }
            },
                options.map(function(o){
                    return e('option',{key:o.value,value:o.value},o.label);
                })
            )
        );
    });

    // ── Section renderer ──
    var renderSection=function(sec,prefs,onToggleFunc,overrideChannels){
        if(!prefs)return null;
        var channels=overrideChannels||ALL_CHANNELS;
        // Split channels by email vs inapp
        var emailKeys=channels.filter(function(ch){return ch.key.indexOf('email_')===0;});
        var inappKeys=channels.filter(function(ch){return ch.key.indexOf('inapp_')===0;});

        return e('div',{key:sec.id,className:'card',style:{marginBottom:'.65rem',breakInside:'avoid'}},
            e('div',{className:'card-header',style:{
                borderBottom:'1px solid var(--border)',
                padding:'.5rem .7rem',
                display:'flex',alignItems:'center',gap:'.45rem',flexWrap:'wrap'
            }},
                e('div',{className:'card-title',style:{fontSize:'.85rem',display:'flex',alignItems:'center',gap:'.35rem'}},
                    e('i',{className:'fas '+sec.icon,style:{fontSize:'.75rem',color:sec.color}}),sec.label),
                e('span',{style:{fontSize:'.68rem',color:'var(--ink-4)'}},sec.desc)
            ),
            e('div',{className:'card-body',style:{
                display:'grid',
                gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,280px),1fr))',
                gap:'.35rem',padding:'.55rem .65rem'
            }},
                sec.id==='email_notifications'&&emailKeys.map(function(k){
                    var enabled=prefs[k.key]!==false;
                    var sKey=isSavingKey(k.key);
                    return e(ToggleRow,{
                        key:k.key,item:k,
                        isOn:enabled,isSaving:sKey,
                        onToggle:function(){onToggleFunc(k.key);}
                    });
                }),
                sec.id==='inapp_notifications'&&inappKeys.map(function(k){
                    var enabled=prefs[k.key]!==false;
                    var sKey=isSavingKey(k.key);
                    return e(ToggleRow,{
                        key:k.key,item:k,
                        isOn:enabled,isSaving:sKey,
                        onToggle:function(){onToggleFunc(k.key);}
                    });
                }),
                sec.id==='frequency'&&e(DropdownRow,{
                    value:frequency,onChange:changeFrequency,
                    options:FREQUENCY_OPTIONS,
                    label:'Честота на известията'
                })
            )
        );
    };

    // ── Admin: render role-specific channels in a table grid ──
    var renderRolePanel=function(roleId){
        var channels=channelsForRole(roleId,ALL_CHANNELS);
        var prefs=roleOverrides[roleId]||{};
        return e('div',{key:roleId,style:{marginBottom:'.45rem'}},
            e('div',{style:{display:'flex',alignItems:'center',gap:'.35rem',fontSize:'.8rem',fontWeight:700,color:'var(--ink)',marginBottom:'.3rem',padding:'.25rem .5rem'}},
                e('i',{className:'fas '+(ROLE_GROUPS.find(function(r){return r.id===roleId})||{icon:'fa-user'}).icon,style:{color:'var(--primary)',fontSize:'.7rem'}}),
                (ROLE_GROUPS.find(function(r){return r.id===roleId})||{label:roleId}).label,
                e('span',{style:{fontSize:'.62rem',color:'var(--ink-4)',fontWeight:400,marginLeft:'.3rem'}},'('+channels.length+' канала)')
            ),
            e('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,240px),1fr))',gap:'.25rem'}},
                channels.map(function(ch){
                    var enabled=prefs[ch.key]!==false;
                    var sKey=isSavingKey('role:'+roleId+':'+ch.key);
                    return e(ToggleRow,{
                        key:ch.key,item:ch,
                        isOn:enabled,isSaving:sKey,
                        onToggle:function(){toggleRoleChannel(roleId,ch.key);}
                    });
                })
            )
        );
    };

    // ── Never block rendering — toggles render immediately with defaults ──

    // ── Main render ──
    return e('div',null,
        /* ── Header ── */
        e('div',{style:{marginBottom:'.85rem'}},
            e('h3',{style:{fontFamily:'var(--font-display)',fontSize:'1.05rem',fontWeight:700,color:'var(--ink)',marginBottom:'.2rem'}},
                e('i',{className:'fas fa-sliders',style:{marginRight:'.35rem',color:'var(--primary)'}}),'Настройки и известия',
                loading&&e('span',{style:{fontSize:'.6rem',color:'var(--ink-4)',marginLeft:'.5rem',fontWeight:400}},e('i',{className:'fas fa-spinner fa-spin'}),' зареждане…')),
            e('p',{style:{fontSize:'.78rem',color:'var(--ink-3)',lineHeight:1.5}},
                isAdmin
                    ? 'Като администратор управлявате системните известия за всички роли, както и личните си настройки.'
                    : role.indexOf('reviewer')>=0
                        ? 'Управлявайте как системата комуникира с вас като кандидат и рецензент.'
                        : 'Управлявайте как системата комуникира с вас — по имейл и в интерфейса.')
        ),

        /* ── Toast ── */
        toast&&e('div',{
            style:{
                padding:'.4rem .65rem',marginBottom:'.55rem',borderRadius:4,fontSize:'.76rem',
                background:toast.type==='success'?'var(--ok-bg)':'var(--err-bg)',
                border:'1px solid '+(toast.type==='success'?'var(--ok-border)':'var(--err-border)'),
                color:toast.type==='success'?'var(--ok)':'var(--err)',
                display:'flex',alignItems:'center',gap:'.35rem'
            }
        },e('i',{className:'fas '+(toast.type==='success'?'fa-check-circle':'fa-exclamation-circle')}),toast.msg),

        /* ── Admin: System-wide master panel ── */
        isAdmin&&system&&e('div',null,
            e('div',{style:{display:'flex',alignItems:'center',gap:'.45rem',marginBottom:'.4rem',padding:'.4rem .65rem',background:'var(--warn-bg)',border:'1px solid var(--warn-border)',borderRadius:'var(--r-xs)',fontSize:'.76rem',color:'var(--warn)'}},
                e('i',{className:'fas fa-triangle-exclamation',style:{flexShrink:0,fontSize:'.7rem'}}),
                e('span',null,'Административен панел: промените във всяка роля важат за ВСИЧКИ потребители от тази роля.')
            ),
            /* Admin emails master switch */
            e('div',{className:'card',style:{marginBottom:'.5rem',border:'1px solid '+(adminEmailsEnabled?'var(--ok-border)':'var(--err-border)'),background:adminEmailsEnabled?'var(--ok-bg)':'var(--err-bg)'}},
                e('div',{className:'card-body',style:{display:'flex',alignItems:'center',gap:'.75rem',padding:'.55rem .7rem'}},
                    e('div',{style:{width:36,height:36,borderRadius:10,background:adminEmailsEnabled?'var(--ok)':'var(--err)',color:'var(--white)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'.95rem',flexShrink:0}},
                        e('i',{className:'fas '+(adminEmailsEnabled?'fa-envelope-circle-check':'fa-envelope-open-text')})
                    ),
                    e('div',{style:{flex:1,minWidth:0}},
                        e('div',{style:{fontWeight:700,fontSize:'.85rem',color:'var(--ink)'}},'Адм. имейли: '+(adminEmailsEnabled?'Активни':'Потиснати')),
                        e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginTop:'.05rem'}},'Контролира DEV_DISABLE_ADMIN_EMAILS — изкл. при разработка, вкл. в продукция')
                    ),
                    e('button',{
                        className:'btn btn-sm '+(adminEmailsEnabled?'btn-danger':'btn-ok'),
                        disabled:adminEmailsToggling,
                        onClick:toggleAdminEmails,
                        style:{flexShrink:0,minWidth:80}
                    },adminEmailsToggling?e('i',{className:'fas fa-spinner fa-spin'}):adminEmailsEnabled?'Потисни':'Включи')
                )
            ),
            /* Role selector tabs */
            e('div',{style:{display:'flex',gap:'.25rem',marginBottom:'.5rem',padding:'.2rem',background:'var(--surface)',borderRadius:'var(--r-sm)',border:'1px solid var(--border)'}},
                ROLE_GROUPS.map(function(rg){
                    return e('button',{
                        key:rg.id,
                        className:'chip'+(selectedRole===rg.id?' active':''),
                        onClick:function(){setSelectedRole(rg.id);},
                        style:{flex:1,justifyContent:'center',fontSize:'.72rem'}
                    },e('i',{className:'fas '+rg.icon,style:{marginRight:'.25rem',fontSize:'.65rem'}}),rg.label);
                })
            ),
            /* Per-role toggle panel */
            renderRolePanel(selectedRole),
            e('hr',{style:{margin:'.6rem 0',border:'none',borderTop:'1px solid var(--border)'}})
        ),

        /* ── Personal settings section ── */
        isAdmin
            ? e('div',{style:{marginBottom:'.25rem'}},
                e('div',{style:{fontWeight:700,fontSize:'.88rem',color:'var(--ink)',marginBottom:'.05rem',display:'flex',alignItems:'center',gap:'.35rem'}},
                    e('i',{className:'fas fa-user',style:{color:'var(--primary)',fontSize:'.75rem'}}),'Лични настройки'),
                e('p',{style:{fontSize:'.68rem',color:'var(--ink-4)',marginBottom:'.45rem'}},'Тези настройки важат само за вашия акаунт.'))
            : null,

        /* Personal email toggles */
        personal&&sectionDefs.map(function(sec){
            if(sec.id==='frequency')return null; // rendered separately
            // Filter channels by user's roles for personal view
            var roleFilteredChannels=[];
            displayRoles.forEach(function(rid){
                channelsForRole(rid,ALL_CHANNELS).forEach(function(ch){
                    if(!roleFilteredChannels.find(function(f){return f.key===ch.key;})){
                        roleFilteredChannels.push(ch);
                    }
                });
            });
            return renderSection(sec,personal,togglePersonal,roleFilteredChannels);
        }),

        /* Frequency selector (always visible) */
        personal&&e('div',{className:'card',style:{marginBottom:'.65rem'}},
            e('div',{className:'card-header',style:{borderBottom:'1px solid var(--border)',padding:'.5rem .7rem',display:'flex',alignItems:'center',gap:'.45rem',flexWrap:'wrap'}},
                e('div',{className:'card-title',style:{fontSize:'.85rem',display:'flex',alignItems:'center',gap:'.35rem'}},
                    e('i',{className:'fas fa-clock',style:{fontSize:'.75rem',color:'var(--info)'}}),'Честота на известия'),
                e('span',{style:{fontSize:'.68rem',color:'var(--ink-4)'}},'Как искате да получавате известията')
            ),
            e('div',{className:'card-body',style:{padding:'.55rem .65rem'}},
                e(DropdownRow,{
                    value:frequency,onChange:changeFrequency,
                    options:FREQUENCY_OPTIONS,
                    label:'Честота на известията',
                    disabled:loading
                })
            )
        ),

        /* ── Footer ── */
        personal&&e('div',{style:{fontSize:'.68rem',color:'var(--ink-4)',padding:'.35rem 0 0',textAlign:'center',borderTop:'1px solid var(--border)',marginTop:'.35rem'}},
            e('i',{className:'fas fa-save',style:{marginRight:'.25rem'}}),
            'Промените се записват автоматично при всяко превключване.',
            isAdmin?' Административният панел управлява известията по роли.':'')
    );
};

/* ─── T74: Password strength meter ──────────────────────────────────────────
 * Returns {score:0-4, label, color, tips[]} for a given password string.
 * Criteria: len>=8, len>=12, upper+lower, digit, special char (mapped to 0-4).
 */
var passwordStrength=function(pw){
    if(!pw||typeof pw!=='string')return{score:0,label:'Слаба',color:'var(--err)',tips:['Въведете парола']};
    var pts=0;
    var tips=[];
    if(pw.length>=8)pts++;else tips.push('Минимум 8 символа');
    if(pw.length>=12)pts++;else tips.push('Използвайте поне 12 символа за по-добра защита');
    if(/[a-z]/.test(pw)&&/[A-Z]/.test(pw))pts++;else tips.push('Добавете главни и малки букви');
    if(/\d/.test(pw))pts++;else tips.push('Добавете поне една цифра');
    if(/[^A-Za-z0-9]/.test(pw))pts++;else tips.push('Добавете специален символ (напр. !@#$%)');
    // Map 0-5 points to score 0-4
    var score=pts<=1?0:pts===2?1:pts===3?2:pts===3?2:pts>=4?3:4;
    if(pts>=5)score=4;
    var labels=['Слаба','Средна','Силна','Много силна'];
    var colors=['var(--err)','var(--warn)','#2563eb','var(--ok)'];
    return{score:score,label:labels[score],color:colors[score],tips:tips};
};

/* ─── T74: Password strength bar UI component ─────────────────────────────── */
var PasswordStrengthBar=function({password}){
    var info=passwordStrength(password||'');
    var pct=password?(info.score+1)*25:0;
    return e('div',{style:{marginTop:'.35rem'}},
        e('div',{style:{height:5,borderRadius:3,background:'var(--border)',overflow:'hidden'}},
            e('div',{style:{width:pct+'%',height:'100%',background:info.color,transition:'width .25s ease,background .25s ease',borderRadius:3}})
        ),
        password?e('div',{style:{display:'flex',justifyContent:'space-between',marginTop:'.25rem',fontSize:'.72rem'}},
            e('span',{style:{color:info.color,fontWeight:600}},'Сила: '+info.label),
            e('span',{style:{color:'var(--ink-4)'}},(info.score+1)+'/4')
        ):null,
        password&&info.tips.length>0?e('ul',{style:{margin:'.3rem 0 0',paddingLeft:'1.1rem',fontSize:'.7rem',color:'var(--ink-4)',lineHeight:1.5}},
            info.tips.map(function(t,i){return e('li',{key:i},t);})
        ):null
    );
};

/* ─── T73: TOTP MFA setup modal (admin only) ────────────────────────────────
 * Shows QR code (via otpauth URI rendered as inline SVG data) + verification
 * code input. Uses setupmfa / verifymfasetup / disablemfa backend actions.
 */
var MfaSetupModal=({user,isAdmin,onClose})=>{
    var email=String(user&&user.email||'').toLowerCase().trim();
    var[step,setStep]=useState('idle'); // idle|setup|verify|done
    var[secret,setSecret]=useState('');
    var[otpauthUri,setOtpauthUri]=useState('');
    var[code,setCode]=useState('');
    var[busy,setBusy]=useState(false);
    var[err,setErr]=useState('');
    var[okMsg,setOkMsg]=useState('');
    var[showSecret,setShowSecret]=useState(false);

    var startSetup=function(){
        setBusy(true);setErr('');setOkMsg('');setStep('setup');
        api('setupmfa',{ownerEmail:email,email:email,userId:email}).then(function(r){
            setBusy(false);
            if(r&&r.success){setSecret(r.secret||'');setOtpauthUri(r.otpauth_uri||'');setStep('verify');}
            else setErr(r&&r.error?'Грешка: '+r.error:'Неуспешна настройка');
        }).catch(function(ex){setBusy(false);setErr('Грешка: '+(ex.message||String(ex)));});
    };

    var verifyCode=function(){
        if(!code||code.length!==6){setErr('Въведете 6-цифрен код');return;}
        setBusy(true);setErr('');
        api('verifymfasetup',{ownerEmail:email,email:email,userId:email,code:code}).then(function(r){
            setBusy(false);
            if(r&&r.success){setOkMsg('Двуфакторната автентикация е активирана!');setStep('done');}
            else setErr(r&&r.error?'Грешка: '+r.error:'Неуспешно потвърждение');
        }).catch(function(ex){setBusy(false);setErr('Грешка: '+(ex.message||String(ex)));});
    };

    // Build a simple QR-like visual using the otpauth URI (data URI img)
    var qrImg=otpauthUri?e('img',{src:'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data='+encodeURIComponent(otpauthUri),alt:'QR код за MFA',style:{width:180,height:180,borderRadius:8,border:'1px solid var(--border)'}}):null;

    return _portal(e('div',{className:'modal-overlay',onClick:onClose},
        e('div',{className:'modal-box',style:{maxWidth:420},onClick:function(ev){ev.stopPropagation();}},
            e('div',{className:'modal-head'},
                e('h3',null,e('i',{className:'fas fa-shield-halved',style:{marginRight:'.4rem',color:'var(--primary)'}}),'Настройка на двуфакторна автентикация'),
                e('button',{type:'button',className:'close-btn','aria-label':'Затвори',onClick:onClose},e('i',{className:'fas fa-times'}))
            ),
            e('div',{className:'modal-body'},
                err?e('div',{style:{marginBottom:'.75rem',padding:'.6rem .8rem',background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:6,fontSize:'.8rem',color:'var(--err)'}},err):null,
                okMsg?e('div',{style:{marginBottom:'.75rem',padding:'.6rem .8rem',background:'var(--ok-bg)',border:'1px solid var(--ok-border)',borderRadius:6,fontSize:'.8rem',color:'var(--ok)'}},okMsg):null,
                step==='idle'&&e('div',{style:{textAlign:'center',padding:'1rem 0'}},
                    e('p',{style:{fontSize:'.85rem',color:'var(--ink-2)',lineHeight:1.7,marginBottom:'1rem'}},
                        'Двуфакторната автентикация добавя допълнителен слой защита чрез приложение за удостоверяване (Google Authenticator, Authy и др.).'),
                    e('button',{className:'btn btn-primary',onClick:startSetup},'Започни настройка')
                ),
                (step==='setup'||step==='verify')&&e('div',{style:{textAlign:'center'}},
                    e('p',{style:{fontSize:'.85rem',color:'var(--ink-2)',marginBottom:'.75rem'}},
                        e('i',{className:'fas fa-qrcode',style:{marginRight:'.3rem'}}),'Сканирайте с QR код'),
                    qrImg,
                    e('div',{style:{marginTop:'.75rem',fontSize:'.75rem',color:'var(--ink-4)'}},
                        'И въведете ръчно: ',
                        e('button',{type:'button',className:'btn btn-ghost btn-xs',style:{marginLeft:'.3rem'},onClick:function(){setShowSecret(function(v){return !v;});}},showSecret?'Скрий':'Покажи'),
                        showSecret&&e('code',{style:{display:'block',marginTop:'.3rem',padding:'.4rem .6rem',background:'var(--ink-6)',borderRadius:4,fontSize:'.8rem',wordBreak:'break-all',color:'var(--ink-2)'}},secret)
                    ),
                    e('div',{style:{marginTop:'1rem'}},
                        e('label',{style:{display:'block',fontSize:'.8rem',fontWeight:600,color:'var(--ink)',marginBottom:'.3rem'},for:'mfa-code-input'},'Въведете кода за потвърждение'),
                        e('input',{id:'mfa-code-input',type:'text',maxLength:6,placeholder:'000000',value:code,onChange:function(ev){setCode(ev.target.value.replace(/\D/g,''));},style:{width:'100%',padding:'.6rem',textAlign:'center',fontSize:'1.2rem',letterSpacing:'.5rem',border:'1px solid var(--border)',borderRadius:6}})
                    ),
                    e('div',{style:{marginTop:'1rem',display:'flex',gap:'.5rem',justifyContent:'flex-end'}},
                        e('button',{className:'btn btn-outline',onClick:onClose},'Отказ'),
                        e('button',{className:'btn btn-primary',disabled:busy||code.length!==6,onClick:verifyCode},busy?'Проверява...':'Потвърди')
                    )
                ),
                step==='done'&&e('div',{style:{textAlign:'center',padding:'1rem 0'}},
                    e('div',{style:{width:56,height:56,borderRadius:'50%',background:'var(--ok-bg)',color:'var(--ok)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem',margin:'0 auto .75rem'}},
                        e('i',{className:'fas fa-check'})
                    ),
                    e('p',{style:{fontSize:'.9rem',fontWeight:600,color:'var(--ok)'}},'MFA е активно!'),
                    e('p',{style:{fontSize:'.78rem',color:'var(--ink-3)',marginTop:'.3rem'}},'Сега при всяко влизане ще ви се иска код от приложението.')
                )
            )
        )
    ));
};

/* ─── 2FA Security panel (email-only, always-on) ─── */
var SecurityPanel=({user,isAdmin,onShowMfaSetup})=>{
    const maskedEmail=(()=>{const s=String(user&&user.email||'');const at=s.indexOf('@');if(at<2)return s;return s.charAt(0)+'•••'+s.charAt(at-1)+s.substr(at)})();
    return e('div',null,
        e('div',{style:{marginBottom:'1rem'}},
            e('h3',{style:{fontFamily:'var(--font-display)',fontSize:'1.05rem',fontWeight:700,color:'var(--ink)',marginBottom:'.25rem'}},e('i',{className:'fas fa-shield-halved',style:{marginRight:'.4rem',color:'var(--primary)'}}),'Двуфакторно удостоверяване'),
            e('p',{style:{fontSize:'.82rem',color:'var(--ink-3)',lineHeight:1.7}},'Двуфакторното удостоверяване по имейл е активно за всички чувствителни действия. Не се изисква допълнително приложение.')
        ),
        e('div',{className:'card'},
            e('div',{className:'card-body',style:{display:'flex',alignItems:'center',gap:'.85rem',flexWrap:'wrap'}},
                e('div',{style:{width:44,height:44,borderRadius:12,background:'var(--ok-bg)',color:'var(--ok)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem',flexShrink:0}},
                    e('i',{className:'fas fa-shield-check'})
                ),
                e('div',{style:{flex:1,minWidth:160}},
                    e('div',{style:{fontWeight:700,fontSize:'.92rem',color:'var(--ink)'}},'Защитата е активна'),
                    e('div',{style:{fontSize:'.78rem',color:'var(--ink-3)',marginTop:2}},
                        'Метод: код по имейл',user&&user.email?' · '+maskedEmail:''
                    )
                )
            )
        ),
        // T73: TOTP app-based MFA setup (admin only)
        isAdmin&&e('div',{className:'card',style:{marginTop:'.75rem'}},
            e('div',{className:'card-header'},e('div',{className:'card-title'},
                e('i',{className:'fas fa-mobile-screen',style:{marginRight:'.4rem',color:'var(--info)'}}),
                'TOTP приложение (Google Authenticator / Authy)')),
            e('div',{className:'card-body',style:{fontSize:'.83rem',color:'var(--ink-2)',lineHeight:1.7}},
                e('p',{style:{margin:'0 0 .5rem'}},'Активирайте допълнителна защита чрез приложение за удостоверяване. Кодът се генерира локално на устройството ви.'),
                e('button',{className:'btn btn-primary btn-sm',onClick:function(){if(typeof onShowMfaSetup==='function')onShowMfaSetup();}},
                    e('i',{className:'fas fa-plus',style:{marginRight:'.3rem'}}),'Настройка на TOTP')
            )
        ),
        e('div',{className:'card',style:{marginTop:'.75rem'}},
            e('div',{className:'card-header'},e('div',{className:'card-title'},e('i',{className:'fas fa-circle-info',style:{marginRight:'.4rem',color:'var(--info)'}}),'Как работи')),
            e('div',{className:'card-body',style:{fontSize:'.83rem',color:'var(--ink-2)',lineHeight:1.7}},
                e('ol',{style:{margin:0,paddingLeft:'1.2rem'}},
                    e('li',null,'При изпращане на заявка или подписване на документ ще получите 6-цифрен код на регистрирания имейл.'),
                    e('li',null,'Форматът на съобщението е „G-XXXXXX is your Google verification code." — точно като при Google SMS.'),
                    e('li',null,'Кодът важи 5 минути. Ако не сте го получили, можете да поискате нов от формата за потвърждение.'),
                    e('li',null,'Кодът никога не трябва да се споделя с други лица.')
                )
            )
        ),
        // ── T23: Active sessions list (handlers + table already exist) ──────
        e('div',{className:'card',style:{marginTop:'.75rem'}},
            e('div',{className:'card-header'},e('div',{className:'card-title'},
                e('i',{className:'fas fa-clock',style:{marginRight:'.4rem',color:'var(--brand-navy)'}}),
                'Активни сесии'
            )),
            (function(){
                var email=String(user&&user.email||'').toLowerCase().trim();
                var[loading,setLoading]=useState(true);
                var[sessions,setSessions]=useState([]);
                var[revoking,setRevoking]=useState(null);
                var[error,setError]=useState('');
                var load=useCallback(function(){
                    if(!email){setLoading(false);return;}
                    setLoading(true);setError('');
                    api('getsessionlist',{email:email,userId:email}).then(function(r){
                        setLoading(false);
                        if(r&&r.success){setSessions(r.sessions||[]);setError('');}
                        else{if(r&&r.error)setError(r.error);}
                    }).catch(function(ex){setLoading(false);setError('Грешка при зареждане: '+(ex.message||String(ex)));});
                },[email]);
                useEffect(function(){load();},[load]);
                var revoke=useCallback(function(sid){
                    if(!sid)return;
                    setRevoking(sid);
                    api('revokesession',{session_id:sid,email:email,userId:email}).then(function(r){
                        setRevoking(null);
                        if(r&&r.success){setSessions(function(prev){return prev.filter(function(s){return s.session_id!==sid;});});}
                        else{setError(r&&r.error?'Не може да се отзове сесията: '+r.error:'Грешка при отземане на сесията');}
                    }).catch(function(ex){setRevoking(null);setError('Грешка: '+(ex.message||String(ex)));});
                },[]);
                var fmtDate=function(iso){
                    if(!iso)return'—';
                    var d=new Date(iso);
                    if(isNaN(d.getTime()))return iso;
                    return d.toLocaleString('bg-BG',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
                };
                var deviceLabel=function(dev){
                    if(!dev)return'Непознат устройство';
                    if(dev==='mobile')return'Мобилно устройство';
                    if(dev==='tablet')return'Планшет';
                    return'Настолно устройство';
                };
                if(loading)return e('div',{className:'card-body',padding:'.8rem',color:'var(--ink-3)',fontSize:'.83rem'},'Зареждане на активните сесии...');
                if(error)return e('div',{className:'card-body',padding:'.8rem',color:'var(--err)',fontSize:'.83rem'},error);
                if(!sessions||sessions.length===0)return e('div',{className:'card-body',padding:'.8rem',color:'var(--ink-3)',fontSize:'.83rem'},'Няма открити активни сесии.');
                return e('div',{className:'card-body',style:{fontSize:'.83rem',overflowX:'auto'}},
                    e('table',{className:'data-table',style:{width:'100%',borderCollapse:'collapse',fontSize:'.83rem'}},
                        e('thead',null,
                            e('tr',null,
                                e('th',{style:{textAlign:'left',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,whiteSpace:'nowrap'}},'Устройство'),
                                e('th',{style:{textAlign:'left',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,whiteSpace:'nowrap'}},'IP адрес'),
                                e('th',{style:{textAlign:'left',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,whiteSpace:'nowrap'}},'Създаден'),
                                e('th',{style:{textAlign:'left',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,whiteSpace:'nowrap'}},'Последна активност'),
                                e('th',{style:{textAlign:'center',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,width:'1%'}},'')
                            )
                        ),
                        e('tbody',null,
                            sessions.map(function(s){
                                var isCurrent=s.current;
                                var rowStyle=isCurrent?{background:'var(--ok-bg)',padding:'.3rem .5rem'}:null;
                                return e('tr',{key:s.session_id,style:rowStyle},
                                    e('td',null,deviceLabel(s.device||'')+(isCurrent?' (текуща)':'')),
                                    e('td',null,s.ip_address||'—'),
                                    e('td',{style:{whiteSpace:'nowrap'}},null,fmtDate(s.created_at)),
                                    e('td',{style:{whiteSpace:'nowrap'}},null,fmtDate(s.last_active)),
                                    e('td',{style:{textAlign:'center',whiteSpace:'nowrap'}},null,
                                        isCurrent
                                            ? e('span',{style:{fontSize:'.78rem',color:'var(--ink-3)'}},'—')
                                            : e('button',{className:'btn btn-ghost btn-xs',style:{color:'var(--err)'},disabled:revoking===s.session_id,onClick:function(){revoke(s.session_id);}},
                                                e('i',{className:'fas fa-ban',style:{marginRight:'.25rem'}}),
                                                revoking===s.session_id?'Отзема се...':'Отзове'
                                            )
                                    )
                                );
                            })
                        )
                    )
                );
            })()
        )
    );
};

/* ─── Active sessions list component (T23) — used by SecurityPanel ───────────
 * Extracted so it can also be mounted standalone in the security tab of the
 * ProfileSettingsModal if the UX team prefers a dedicated session-management view.
 */
var SessionListPanel=({user})=>{
    var email=String(user&&user.email||'').toLowerCase().trim();
    var[loading,setLoading]=useState(true);
    var[sessions,setSessions]=useState([]);
    var[revoking,setRevoking]=useState(null);
    var[error,setError]=useState('');
    var load=useCallback(function(){
        if(!email){setLoading(false);return;}
        setLoading(true);setError('');
        api('getsessionlist',{email:email,userId:email}).then(function(r){
            setLoading(false);
            if(r&&r.success){setSessions(r.sessions||[]);setError('');}
            else{if(r&&r.error)setError(r.error);}
        }).catch(function(ex){setLoading(false);setError('Грешка при зареждане: '+(ex.message||String(ex)));});
    },[email]);
    useEffect(function(){load();},[load]);
    var revoke=useCallback(function(sid){
        if(!sid)return;
        setRevoking(sid);
        api('revokesession',{session_id:sid,email:email,userId:email}).then(function(r){
            setRevoking(null);
            if(r&&r.success){setSessions(function(prev){return prev.filter(function(s){return s.session_id!==sid;});});}
            else{setError(r&&r.error?'Не може да се отзове сесията: '+r.error:'Грешка при отземане на сесията');}
        }).catch(function(ex){setRevoking(null);setError('Грешка: '+(ex.message||String(ex)));});
    },[]);
    var fmtDate=function(iso){
        if(!iso)return'—';
        var d=new Date(iso);
        if(isNaN(d.getTime()))return iso;
        return d.toLocaleString('bg-BG',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
    };
    var deviceLabel=function(dev){
        if(!dev)return'Непознат устройство';
        if(dev==='mobile')return'Мобилно устройство';
        if(dev==='tablet')return'Планшет';
        return'Настолно устройство';
    };
    if(loading)return e('div',{style:{padding:'.8rem',color:'var(--ink-3)',fontSize:'.83rem'}},'Зареждане на активните сесии...');
    if(error)return e('div',{style:{padding:'.8rem',color:'var(--err)',fontSize:'.83rem'}},error);
    if(!sessions||sessions.length===0)return e('div',{style:{padding:'.8rem',color:'var(--ink-3)',fontSize:'.83rem'}},'Няма открити активни сесии.');
    return e('div',{style:{fontSize:'.83rem',overflowX:'auto'}},
        e('table',{className:'data-table',style:{width:'100%',borderCollapse:'collapse',fontSize:'.83rem'}},
            e('thead',null,
                e('tr',null,
                    e('th',{style:{textAlign:'left',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,whiteSpace:'nowrap'}},'Устройство'),
                    e('th',{style:{textAlign:'left',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,whiteSpace:'nowrap'}},'IP адрес'),
                    e('th',{style:{textAlign:'left',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,whiteSpace:'nowrap'}},'Създаден'),
                    e('th',{style:{textAlign:'left',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,whiteSpace:'nowrap'}},'Последна активност'),
                    e('th',{style:{textAlign:'center',padding:'.45rem .6rem',borderBottom:'1px solid var(--border)',color:'var(--ink-3)',fontWeight:600,width:'1%'}},'')
                )
            ),
            e('tbody',null,
                sessions.map(function(s){
                    var isCurrent=s.current;
                    var rowStyle=isCurrent?{background:'var(--ok-bg)',padding:'.3rem .5rem'}:null;
                    return e('tr',{key:s.session_id,style:rowStyle},
                        e('td',null,deviceLabel(s.device||'')+(isCurrent?' (текуща)':'')),
                        e('td',null,s.ip_address||'—'),
                        e('td',{style:{whiteSpace:'nowrap'}},null,fmtDate(s.created_at)),
                        e('td',{style:{whiteSpace:'nowrap'}},null,fmtDate(s.last_active)),
                        e('td',{style:{textAlign:'center',whiteSpace:'nowrap'}},null,
                            isCurrent
                                ? e('span',{style:{fontSize:'.78rem',color:'var(--ink-3)'}},'—')
                                : e('button',{className:'btn btn-ghost btn-xs',style:{color:'var(--err)'},disabled:revoking===s.session_id,onClick:function(){revoke(s.session_id);}},
                                    e('i',{className:'fas fa-ban',style:{marginRight:'.25rem'}}),
                                    revoking===s.session_id?'Отзема се...':'Отзове'
                                )
                        )
                    );
                })
            )
        )
    );
};

/* ─── Notifications centre panel (Известия) ────────────────────────────
 * Per-user feed aggregating three event sources:
 *   1. Status changes on the user's applications (server: getmynotifications →
 *      Applications.HISTORY)
 *   2. Messages from the administrator (server: Messages sheet, role=admin)
 *   3. System events / toasts captured client-side (validation blocks,
 *      warnings, confirmations) via the localStorage ring buffer.
 * Read/unread for server items is tracked by a per-user "seen" timestamp
 * (marknotificationsseen); client items by a local "seen" timestamp. */
var NOTIF_CLIENT_SEEN_KEY='__erp_client_notif_seen';

var NotificationsPanel=({user,isAdmin,onUnreadChange})=>{
    const userEmail=String(user?.email||'').toLowerCase().trim();
    const[loading,setLoading]=useState(true);
    const[error,setError]=useState('');
    const[items,setItems]=useState([]);
    const[filter,setFilter]=useState('all');
    const[marking,setMarking]=useState(false);

    const buildItems=useCallback((serverList,seenIso)=>{
        const serverSeenMs=seenIso?(new Date(seenIso).getTime()||0):0;
        let clientSeenMs=0;
        try{clientSeenMs=Number(localStorage.getItem(NOTIF_CLIENT_SEEN_KEY))||0;}catch(_){}
        const server=(serverList||[]).map(n=>{
            const tsMs=new Date(n.timestamp).getTime()||0;
            return Object.assign({},n,{tsMs,read:typeof n.read==='boolean'?n.read:(tsMs<=serverSeenMs)});
        });
        let client=[];
        try{client=(typeof readClientNotifications==='function'?readClientNotifications():[]).map(c=>({
            id:c.id,type:'system',subtype:c.type,text:c.text,timestamp:c.timestamp,
            tsMs:c.ts||(new Date(c.timestamp).getTime()||0),read:(c.ts||0)<=clientSeenMs
        }));}catch(_){client=[];}
        const merged=server.concat(client).sort((a,b)=>(b.tsMs||0)-(a.tsMs||0));
        return merged;
    },[]);

    const load=useCallback(async()=>{
        setLoading(true);setError('');
        try{
            const r=await api('getmynotifications',{userEmail,userId:userEmail,limit:150});
            if(r&&r.success){
                setItems(buildItems(r.notifications||[],r.seenAt));
            }else{
                setItems(buildItems([],null));
                if(r&&r.error)setError(r.error);
            }
        }catch(ex){
            setItems(buildItems([],null));
            setError(ex.message||String(ex));
        }finally{setLoading(false);}
    },[userEmail,buildItems]);

    useEffect(()=>{load();},[load]);
    useEffect(()=>{
        const h=()=>{setItems(prev=>{
            try{
                let clientSeenMs=0;try{clientSeenMs=Number(localStorage.getItem(NOTIF_CLIENT_SEEN_KEY))||0;}catch(_){}
                const server=prev.filter(x=>x.type!=='system');
                const client=(typeof readClientNotifications==='function'?readClientNotifications():[]).map(c=>({
                    id:c.id,type:'system',subtype:c.type,text:c.text,timestamp:c.timestamp,
                    tsMs:c.ts||(new Date(c.timestamp).getTime()||0),read:(c.ts||0)<=clientSeenMs
                }));
                return server.concat(client).sort((a,b)=>(b.tsMs||0)-(a.tsMs||0));
            }catch(_){return prev;}
        });};
        window.addEventListener('erp:notif',h);
        return()=>window.removeEventListener('erp:notif',h);
    },[]);

    const unread=items.filter(x=>!x.read).length;
    useEffect(()=>{if(typeof onUnreadChange==='function')onUnreadChange(unread);},[unread,onUnreadChange]);

    const markAllSeen=useCallback(async()=>{
        setMarking(true);
        try{
            try{localStorage.setItem(NOTIF_CLIENT_SEEN_KEY,String(Date.now()));}catch(_){}
            try{await api('marknotificationsseen',{userEmail,userId:userEmail});}catch(_){}
            setItems(prev=>prev.map(x=>Object.assign({},x,{read:true})));
        }finally{setMarking(false);}
    },[userEmail]);

    const filtered=items.filter(x=>{
        if(filter==='all')return true;
        return x.type===filter;
    });

    const typeMeta=(x)=>{
        if(x.type==='status')return{icon:'fa-flag-checkered',bg:'var(--primary-bg,#eef2ff)',fg:'var(--primary)',label:'Статус'};
        if(x.type==='message')return{icon:'fa-comment-dots',bg:'var(--info-bg,#e6f4f9)',fg:'var(--info,#0b7285)',label:'Съобщение'};
        const st=x.subtype||'info';
        if(st==='error')return{icon:'fa-circle-exclamation',bg:'var(--err-bg)',fg:'var(--err)',label:'Известие'};
        if(st==='warn'||st==='warning')return{icon:'fa-triangle-exclamation',bg:'var(--warn-bg,#fff7e6)',fg:'var(--warn,#b7791f)',label:'Предупреждение'};
        if(st==='success')return{icon:'fa-circle-check',bg:'var(--ok-bg)',fg:'var(--ok)',label:'Успех'};
        return{icon:'fa-circle-info',bg:'var(--surface)',fg:'var(--ink-3)',label:'Известие'};
    };

    const counts={
        all:items.length,
        status:items.filter(x=>x.type==='status').length,
        message:items.filter(x=>x.type==='message').length,
        system:items.filter(x=>x.type==='system').length
    };
    const filterDefs=[
        {id:'all',label:'Всички',icon:'fa-layer-group'},
        {id:'status',label:'Статуси',icon:'fa-flag-checkered'},
        {id:'message',label:'От администратор',icon:'fa-comment-dots'},
        {id:'system',label:'Системни',icon:'fa-bell'}
    ];

    return e('div',null,
        e('div',{style:{marginBottom:'1rem',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'.75rem',flexWrap:'wrap'}},
            e('div',{style:{flex:1,minWidth:200}},
                e('h3',{style:{fontFamily:'var(--font-display)',fontSize:'1.05rem',fontWeight:700,color:'var(--ink)',marginBottom:'.25rem'}},
                    e('i',{className:'fas fa-bell',style:{marginRight:'.4rem',color:'var(--primary)'}}),'Известия',
                    unread>0&&e('span',{style:{marginLeft:'.5rem',display:'inline-flex',alignItems:'center',justifyContent:'center',minWidth:20,height:20,padding:'0 .4rem',borderRadius:999,background:'var(--err)',color:'#fff',fontSize:'.7rem',fontWeight:700,verticalAlign:'middle'}},unread)
                ),
                e('p',{style:{fontSize:'.8rem',color:'var(--ink-3)',lineHeight:1.6}},
                    'Всички събития по вашите заявления — промени на статуса, съобщения от администратора и системни известия на едно място.')
            ),
            e('div',{style:{display:'flex',gap:'.4rem',flexShrink:0}},
                e('button',{className:'btn btn-outline btn-sm',onClick:load,disabled:loading,title:'Опресни'},
                    e('i',{className:'fas fa-sync-alt'+(loading?' fa-spin':'')})),
                unread>0&&e('button',{className:'btn btn-primary btn-sm',onClick:markAllSeen,disabled:marking},
                    e('i',{className:'fas fa-check-double'}),' Маркирай прочетени')
            )
        ),
        e('div',{style:{display:'flex',gap:'.4rem',flexWrap:'wrap',marginBottom:'.85rem'}},
            filterDefs.map(f=>e('button',{key:f.id,onClick:()=>setFilter(f.id),
                className:'chip '+(filter===f.id?'active':''),
                style:{fontSize:'.74rem',padding:'.3rem .6rem'}},
                e('i',{className:'fas '+f.icon,style:{marginRight:'.3rem'}}),f.label,
                e('span',{style:{marginLeft:'.35rem',opacity:.65,fontWeight:600}},counts[f.id]||0)))
        ),
        loading&&e('div',{style:{padding:'1rem',textAlign:'center',color:'var(--ink-4)'}},
            e('i',{className:'fas fa-spinner fa-spin'}),' Зареждане…'),
        error&&!loading&&e('div',{style:{padding:'.6rem .85rem',marginBottom:'.6rem',background:'var(--err-bg)',border:'1px solid var(--err-border)',borderRadius:'var(--r-sm)',fontSize:'.78rem',color:'var(--err)'}},
            e('i',{className:'fas fa-triangle-exclamation'}),' ',error),
        !loading&&filtered.length===0&&e('div',{className:'empty-state',style:{padding:'1.6rem'}},
            e('div',{className:'empty-state-icon'},e('i',{className:'fas fa-bell-slash'})),
            e('div',null,'Няма известия за показване.')),
        !loading&&filtered.length>0&&e('div',{style:{display:'flex',flexDirection:'column',gap:'.5rem'}},
            filtered.map((x,idx)=>{
                const meta=typeMeta(x);
                const statusTxt=x.type==='status'?(typeof humanizeAction==='function'?humanizeAction(x.text):x.text):'';
                return e('div',{key:x.id||idx,
                    style:{display:'flex',gap:'.7rem',alignItems:'flex-start',padding:'.7rem .8rem',
                        border:'1px solid var(--border)',borderRadius:'var(--r-sm,8px)',
                        background:x.read?'var(--bg,#fff)':'var(--primary-bg,#f5f8ff)',
                        borderLeft:'3px solid '+(x.read?'var(--border)':meta.fg)}},
                    e('div',{style:{width:34,height:34,borderRadius:9,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',background:meta.bg,color:meta.fg,fontSize:'.95rem'}},
                        e('i',{className:'fas '+meta.icon})),
                    e('div',{style:{flex:1,minWidth:0}},
                        e('div',{style:{display:'flex',alignItems:'center',gap:'.4rem',flexWrap:'wrap',marginBottom:'.15rem'}},
                            e('span',{style:{fontSize:'.62rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.03em',color:meta.fg,background:meta.bg,padding:'.1rem .4rem',borderRadius:4}},meta.label),
                            x.type==='status'&&x.status&&e('span',{style:{fontSize:'.68rem',fontWeight:600,color:'var(--ink-2)'}},
                                typeof statusLabel==='function'?statusLabel(x.status):x.status),
                            !x.read&&e('span',{style:{width:7,height:7,borderRadius:999,background:'var(--err)',display:'inline-block'}})
                        ),
                        e('div',{style:{fontSize:'.84rem',color:'var(--ink)',lineHeight:1.5,wordBreak:'break-word',whiteSpace:'pre-wrap',fontWeight:x.read?500:600}},
                            x.type==='status'?statusTxt:x.text),
                        x.type==='status'&&x.comment&&e('div',{style:{fontSize:'.76rem',color:'var(--ink-3)',marginTop:'.2rem',fontStyle:'italic'}},'„'+(typeof humanizeAction==='function'?humanizeAction(x.comment):x.comment)+'"'),
                        e('div',{style:{display:'flex',gap:'.6rem',flexWrap:'wrap',marginTop:'.3rem',fontSize:'.68rem',color:'var(--ink-4)'}},
                            x.timestamp&&e('span',null,e('i',{className:'fas fa-clock',style:{marginRight:'.25rem'}}),fmtLogTs(x.timestamp)),
                            x.title&&e('span',{title:x.formId||''},e('i',{className:'fas fa-folder-open',style:{marginRight:'.25rem'}}),String(x.title).slice(0,60)),
                            x.actor&&x.type==='message'&&e('span',null,e('i',{className:'fas fa-user-shield',style:{marginRight:'.25rem'}}),x.actor)
                        )
                    )
                );
            })
        ),
        !loading&&filtered.length>0&&e('div',{style:{padding:'.5rem .25rem',fontSize:'.7rem',color:'var(--ink-4)'}},
            e('i',{className:'fas fa-info-circle'}),' Показани са ',e('strong',null,filtered.length),' известия.')
    );
};

var ProfileSettingsModal=({user,isAdmin,isReviewer,onClose,logout,onRefresh,showSessionWarn,extendSession,onDismissSessionWarn,sessionCountdown,userRole})=>{
const{closing:psClosing,close:psClose}=useModalClose(onClose);
const[section,setSection]=useState('profile');
const[showMfaSetup,setShowMfaSetup]=useState(false);

const menuItems=[
    {id:'profile',label:'Профил',icon:'fa-user'},
    {id:'notif',label:'Известия',icon:'fa-bell'},
    {id:'settings',label:'Настройки',icon:'fa-sliders'},
    {id:'security',label:'Сигурност',icon:'fa-shield-halved'},
    {id:'privacy',label:'Поверителност',icon:'fa-user-shield'},
    ...(isAdmin
        ? [{id:'syslog',label:'Системен дневник',icon:'fa-clipboard-list'}]
        : [{id:'myactivity',label:'Моят дневник',icon:'fa-clipboard-list'}]),
    ...(isAdmin?[{id:'export',label:'Експорт на данни',icon:'fa-file-export'}]:[]),
];

return e(Fragment,null,
_portal(e('div',{className:'modal-overlay'+(psClosing?' modal-closing':''),onClick:psClose},
    e('div',{className:'modal-box has-tabs'+(isAdmin&&section!=='profile'?' wide':'')+(psClosing?' modal-closing':''),onClick:ev=>ev.stopPropagation()},
    e('div',{className:'modal-head'},
        e('h3',null,e('i',{className:'fas fa-user-circle',style:{color:'var(--red)'}}),' Моят акаунт'),
        e('button',{className:'close-btn',onClick:psClose},e('i',{className:'fas fa-times'}))
    ),
    e('div',{className:'modal-tabs'},
        menuItems.map(m=>e('button',{key:m.id,className:'chip '+(section===m.id?'active':''),onClick:()=>setSection(m.id)},e('i',{className:'fas '+m.icon,style:{marginRight:'.3rem'}}),m.label))
    ),
    e('div',{className:'modal-body'},
        section==='profile'&&e(ProfilePanel,{user,isAdmin,isReviewer,onClose,logout,showSessionWarn,extendSession,onDismissSessionWarn,sessionCountdown}),
        section==='notif'&&e(NotificationsPanel,{user,isAdmin}),
        section==='settings'&&e(SettingsPanel,{user,isAdmin,userRole}),
        section==='security'&&e(SecurityPanel,{user,isAdmin,onShowMfaSetup:function(){setShowMfaSetup(true);}}),
        section==='privacy'&&e(PrivacyGdprPanel,{user,isAdmin}),
        section==='myactivity'&&!isAdmin&&e(MyActivityLogPanel,{user}),
        section==='syslog'&&isAdmin&&e(NotificationLogPanel,{isAdmin,user}),
        section==='export'&&isAdmin&&e('div',null,
            e('div',{style:{marginBottom:'1rem'}},
                e('h3',{style:{fontFamily:'var(--font-display)',fontSize:'1.05rem',fontWeight:700,color:'var(--ink)',marginBottom:'.25rem'}},'Експорт на данни'),
                e('p',{style:{fontSize:'.82rem',color:'var(--ink-3)',lineHeight:1.6}},
                    'Генерирайте структуриран JSON архив с одитна следа или изтеглете пълен CSV на всички таблици за импорт в Supabase / PostgreSQL. Изберете желания формат и потвърдете експорта.')
            ),
            e(ExportAuditPanel,{onClose:()=>setSection('profile'),competitions:COMPETITIONS,onExported:onRefresh})
        )
    )
    )
)),
// T73: MFA setup modal (rendered on top of profile modal when active)
isAdmin&&showMfaSetup&&_portal(e(MfaSetupModal,{user,isAdmin,onClose:function(){setShowMfaSetup(false);}}))
);
};
