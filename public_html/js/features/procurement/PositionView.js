/* ═══════════════════════════════════════════════════════════════════════
 * PositionView.js — Подробен поглед върху конкретна спортна площадка
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useMemo = React.useMemo;
  var useRef = React.useRef;

  /* ── Bulgarian UI strings ── */
  var STR = {
    position: 'Позиция',
    village: 'Село',
    sportType: 'Вид спорт',
    status: 'Статус',
    budget: 'Бюджет',
    deadline: 'Срок',
    compliance: 'Съответствие',
    documents: 'Документи',
    contract: 'Договор',
    supervision: 'Контролен обход',
    complianceTab: 'Съответствие',
    payments: 'Плащания',
    schedule: 'Разписание',
    penaltyCalc: 'Калкулатор на дългове',
    insurance: 'Застраховане',
    // Document checklist
    docChecklist: 'Чеклист на документи',
    part1: 'Част 1 — Общо техническо описание',
    part2: 'Част 2 — Документация за обществена поръчка',
    part3: 'Част 3 — Проектен план',
    part4: 'Част 4 — Финансов анализ',
    part5: 'Част 5 — Спецификация и критерии',
    part6: 'Част 6 — Планове за управление на риска',
    part7: 'Част 7 — План за управление на качеството',
    part8: 'Част 8 — План за комуникации',
    part9: 'Част 9 — План за мониторинг и оценка',
    part10: 'Част 10 — Заключителен отчет и сертификат',
    // Contract
    contractNumber: 'Номер на договор',
    contractDate: 'Дата на договор',
    contractValue: 'Стойност на договора',
    contractParty: 'Страни по договора',
    contractStatus: 'Статус на договора',
    contractSigned: 'Подписан',
    contractPending: 'Чакащ подписване',
    contractDraft: 'Чернова',
    paymentSchedule: 'Разписание на плащанията',
    paymentPeriod: 'Период',
    paymentAmount: 'Сума',
    paymentDate: 'Дата',
    paymentStatus: 'Статус',
    paid: 'Платено',
    pendingPayment: 'Изчакващ',
    overduePayment: 'Изтекъл',
    // Supervision
    supervisionLog: 'Дневник на контролния обход',
    date: 'Дата',
    inspector: 'Инспектор',
    findings: 'Открития',
    actions: 'Действия',
    addEntry: 'Добави запис',
    // Compliance
    complianceStatus: 'Статус на съответствието',
    regulation: 'Регулация',
    compliant: 'Съответстващ',
    pending: 'Изчакващ',
    violation: 'Нарушение',
    markCompliant: 'Маркирай като съответстващ',
    addNote: 'Добави бележка',
    evidence: 'Свидетелство',
    // Penalty
    penaltyCalculator: 'Калкулатор на дългове',
    basePenalty: 'Базов дълг (лв.)',
    daysLate: 'Дни закъснение',
    penaltyRate: 'Дневна ставка (%)',
    calculate: 'Калкулирай',
    totalPenalty: 'Общо дългове',
    // Insurance
    insurancePolicy: 'Застрахователен полис',
    policyNumber: 'Номер на полиса',
    validFrom: 'Валиден от',
    validTo: 'Валиден до',
    insuranceType: 'Вид застраховка',
    insuranceStatus: 'Статус',
    // Schedule
    scheduleTitle: 'Разписание на работите',
    task: 'Задача',
    responsible: 'Отговорен',
    startDate: 'Начало',
    endDate: 'Край',
    // Actions
    save: 'Запази',
    cancel: 'Отмени',
    close: 'Затвори',
    edit: 'Редактирай',
    noData: 'Няма налични данни',
    loading: 'Зареждане...'
  };

  function formatBGN(val) { return val.toLocaleString('bg-BG') + ' лв.'; }
  function formatDate(d) { if (!d) return '—'; var p = String(d).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }

  function getStatusBadge(status) {
    var cls = 'pd-badge pd-badge-' + (status === 'signed' ? 'completed' : status === 'pending' ? 'in_progress' : status === 'overdue' ? 'overdue' : 'not_started');
    return e('span', { className: cls }, status === 'signed' ? 'Подписан' : status === 'pending' ? 'Чакащ подписване' : status === 'overdue' ? 'Изтекъл' : 'Чернова');
  }

  /* ── Document Checklist Component ── */
  function DocumentChecklist(props) {
    var positionId = props.positionId;
    var _checked = useState([]);
    var checked = _checked[0];
    var setChecked = _checked[1];

    var _notes = useState({});
    var notes = _notes[0];
    var setNotes = _notes[1];

    var parts = [
      { id: 'part1', label: STR.part1 },
      { id: 'part2', label: STR.part2 },
      { id: 'part3', label: STR.part3 },
      { id: 'part4', label: STR.part4 },
      { id: 'part5', label: STR.part5 },
      { id: 'part6', label: STR.part6 },
      { id: 'part7', label: STR.part7 },
      { id: 'part8', label: STR.part8 },
      { id: 'part9', label: STR.part9 },
      { id: 'part10', label: STR.part10 }
    ];

    var completed = checked.length;
    var total = parts.length;

    return e('div', {},
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' } },
        e('span', { style: { fontSize: '0.85rem', fontWeight: 600 } }, 'Чеклист: ' + completed + '/' + total + ' части завършени'),
        e('div', { className: 'pd-progress-bar', style: { width: '150px' } },
          e('div', { className: 'pd-progress-fill completed', style: { width: (completed / total * 100) + '%' } })
        )
      ),
      e('div', { className: 'pd-doc-checklist' },
        parts.map(function (part) {
          var isChecked = checked.indexOf(part.id) >= 0;
          return e('div', { key: part.id, className: 'pd-doc-item' },
            e('div', {
              className: 'pd-doc-check' + (isChecked ? ' checked' : ''),
              onClick: function () {
                var next = isChecked ? checked.filter(function (c) { return c !== part.id; }) : checked.concat(part.id);
                setChecked(next);
              }
            }, isChecked ? '✓' : ''),
            e('div', { className: 'pd-doc-info' },
              e('div', { className: 'pd-doc-name' }, part.label),
              notes[part.id] ? e('div', { style: { fontSize: '0.7rem', color: 'var(--ink-4)', marginTop: '0.2rem' } }, '📝 ' + notes[part.id]) : null
            ),
            e('input', {
              type: 'text',
              className: 'pd-notes-field',
              placeholder: 'Бележка...',
              style: { minHeight: '28px', fontSize: '0.7rem', padding: '0.25rem 0.5rem' },
              value: notes[part.id] || '',
              onChange: function (ev) {
                var next = Object.assign({}, notes);
                next[part.id] = ev.target.value;
                setNotes(next);
              }
            })
          );
        })
      )
    );
  }

  /* ── Contract Management Component ── */
  function ContractManagement(props) {
    var _contract = useState({ number: 'ПО-2026-' + (props.positionId || '001'), date: '2026-08-15', value: 0, party: 'Община Пазарджик', status: 'pending' });
    var contract = _contract[0];
    var setContract = _contract[1];

    var _payments = useState([
      { period: 'Аванс', amount: 0, date: '2026-08-15', status: 'pending' },
      { period: 'Месечен 1', amount: 0, date: null, status: 'pending' },
      { period: 'Месечен 2', amount: 0, date: null, status: 'pending' },
      { period: 'Месечен 3', amount: 0, date: null, status: 'pending' }
    ]);
    var payments = _payments[0];
    var setPayments = _payments[1];

    var totalPaid = payments.filter(function (p) { return p.status === 'paid'; }).reduce(function (s, p) { return s + p.amount; }, 0);
    var totalScheduled = payments.reduce(function (s, p) { return s + p.amount; }, 0);

    return e('div', {},
      e('div', { className: 'pd-contract-card' },
        e('div', { className: 'pd-section-header' }, '📝 Договор'),
        e('div', { className: 'pd-grid-2' },
          e('div', { className: 'pd-contract-field' },
            e('div', { className: 'pd-contract-label' }, STR.contractNumber),
            e('div', { className: 'pd-contract-value' }, contract.number)
          ),
          e('div', { className: 'pd-contract-field' },
            e('div', { className: 'pd-contract-label' }, STR.contractDate),
            e('div', { className: 'pd-contract-value' }, formatDate(contract.date))
          ),
          e('div', { className: 'pd-contract-field' },
            e('div', { className: 'pd-contract-label' }, STR.contractValue),
            e('div', { className: 'pd-budget' }, formatBGN(contract.value || 0))
          ),
          e('div', { className: 'pd-contract-field' },
            e('div', { className: 'pd-contract-label' }, STR.contractParty),
            e('div', { className: 'pd-contract-value' }, contract.party)
          ),
          e('div', { className: 'pd-contract-field' },
            e('div', { className: 'pd-contract-label' }, STR.contractStatus),
            getStatusBadge(contract.status)
          )
        )
      ),

      // Payment tracker
      e('div', { style: { marginTop: '1rem' } },
        e('div', { className: 'pd-section-header' }, '💰 Разписание на плащания — ' + formatBGN(totalPaid) + ' платени / ' + formatBGN(totalScheduled) + ' планирани'),
        e('div', { className: 'pd-payment-tracker' },
          payments.map(function (p, i) {
            return e('div', { key: i, className: 'pd-payment-row' },
              e('div', { className: 'pd-payment-info' },
                e('div', { className: 'pd-payment-period' }, p.period),
                e('div', { className: 'pd-payment-detail' }, p.date ? 'Дата: ' + formatDate(p.date) : 'Очакваща дата')
              ),
              e('div', { style: { textAlign: 'right' } },
                e('div', { style: { fontSize: '0.85rem', fontWeight: 600 } }, formatBGN(p.amount)),
                e('span', { className: 'pd-insurance-status ' + (p.status === 'paid' ? 'valid' : p.status === 'overdue' ? 'expired' : 'expiring') }, p.status === 'paid' ? STR.paid : p.status === 'overdue' ? STR.overduePayment : STR.pendingPayment)
              )
            );
          })
        )
      )
    );
  }

  /* ── Supervision Log Component ── */
  function SupervisionLog(props) {
    var _entries = useState([
      { date: '2026-09-01', inspector: 'Инж. Петров А.', findings: 'Проверка на основния терен. Почвата е подходяща за фундамент.', actions: 'Извършен тест на плътност' },
      { date: '2026-08-20', inspector: 'Инж. Ганчева М.', findings: 'Доставката на материала е закъснена с 3 дни.', actions: 'Записана закъснението в протокола' }
    ]);
    var entries = _entries[0];
    var setEntries = _entries[1];

    var _newEntry = useState({ inspector: '', findings: '', actions: '' });
    var newEntry = _newEntry[0];
    var setNewEntry = _newEntry[1];

    var addEntry = function () {
      if (!newEntry.inspector || !newEntry.findings) return;
      var today = new Date().toISOString().split('T')[0];
      setEntries([{ date: today, inspector: newEntry.inspector, findings: newEntry.findings, actions: newEntry.actions || '—' }].concat(entries));
      setNewEntry({ inspector: '', findings: '', actions: '' });
    };

    return e('div', {},
      e('div', { className: 'pd-section-header' }, '🔍 ' + STR.supervisionLog + ' (' + entries.length + ' записа)'),
      e('div', { className: 'pd-supervision-log' },
        entries.map(function (entry, i) {
          return e('div', { key: i, className: 'pd-supervision-entry' },
            e('div', { className: 'pd-supervision-date', style: { minWidth: '80px' } }, formatDate(entry.date)),
            e('div', { style: { flex: 1 } },
              e('div', { style: { fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' } }, '👤 ' + entry.inspector),
              e('div', { style: { fontSize: '0.8rem', color: 'var(--ink)' } }, '📋 ' + entry.findings),
              entry.actions && entry.actions !== '—' ? e('div', { style: { fontSize: '0.75rem', color: 'var(--primary)' } }, '✅ Действие: ' + entry.actions) : null
            )
          );
        }),
        // Add new entry
        e('div', { style: { background: 'var(--card)', borderRadius: '8px', padding: '1rem', border: '1px solid var(--border-soft)' } },
          e('div', { style: { fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem' } }, '➕ Добави нов запис'),
          e('input', { className: 'pd-notes-field', placeholder: 'Инспектор...', value: newEntry.inspector, onChange: function (ev) { var n = Object.assign({}, newEntry); n.inspector = ev.target.value; setNewEntry(n); }, style: { marginBottom: '0.5rem' } }),
          e('textarea', { className: 'pd-notes-field', placeholder: 'Открития...', value: newEntry.findings, onChange: function (ev) { var n = Object.assign({}, newEntry); n.findings = ev.target.value; setNewEntry(n); }, style: { minHeight: '40px', marginBottom: '0.5rem' } }),
          e('div', { style: { display: 'flex', gap: '0.5rem' } },
            e('button', { className: 'pd-btn pd-btn-primary pd-btn-sm', onClick: addEntry }, 'Добави запис')
          )
        )
      )
    );
  }

  /* ── Compliance Tab Component ── */
  function ComplianceTab(props) {
    var _compliant = useState([]);
    var compliant = _compliant[0];
    var setCompliant = _compliant[1];

    var _notes = useState({});
    var notes = _notes[0];
    var setNotes = _notes[1];

    var toggleCompliant = function (regId) {
      var next = compliant.indexOf(regId) >= 0 ? compliant.filter(function (c) { return c !== regId; }) : compliant.concat(regId);
      setCompliant(next);
    };

    return e('div', {},
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' } },
        e('span', { style: { fontSize: '0.85rem', fontWeight: 600 } }, 'Регулации: ' + compliant.length + '/' + (props.regulations ? props.regulations.length : 0) + ' съответстват'),
        e('button', { className: 'pd-btn pd-btn-secondary pd-btn-sm', onClick: function () { setCompliant([]); } }, 'Изчисти всичко')
      ),
      e('div', { className: 'pd-compliance-list' },
        (props.regulations || []).map(function (reg) {
          var isCompliant = compliant.indexOf(reg.id) >= 0;
          return e('div', { key: reg.id, className: 'pd-compliance-item' },
            e('div', { className: 'pd-compliance-icon ' + (isCompliant ? 'compliant' : 'pending'), style: { background: isCompliant ? '#d1fae5' : '#fef3c7', color: isCompliant ? 'var(--ok)' : 'var(--gold)' } }, isCompliant ? '✓' : '○'),
            e('div', { className: 'pd-compliance-info' },
              e('div', { className: 'pd-compliance-title' }, reg.reg),
              e('div', { className: 'pd-compliance-desc' }, reg.short + ' — ' + reg.notes)
            ),
            e('div', { className: 'pd-compliance-actions', style: { display: 'flex', flexDirection: 'column', gap: '0.25rem' } },
              e('button', { className: 'pd-btn pd-btn-sm ' + (isCompliant ? 'pd-btn-secondary' : 'pd-btn-primary', true), onClick: function () { toggleCompliant(reg.id); } }, isCompliant ? 'Снети марка' : 'Маркирай съответстващ'),
              e('input', { className: 'pd-notes-field', placeholder: 'Бележка...', value: notes[reg.id] || '', onChange: function (ev) { var n = Object.assign({}, notes); n[reg.id] = ev.target.value; setNotes(n); }, style: { minHeight: '24px', fontSize: '0.7rem' } })
            )
          );
        })
      )
    );
  }

  /* ── Penalty Calculator Component ── */
  function PenaltyCalculator(props) {
    var _base = useState(0);
    var base = _base[0];
    var setBase = _base[1];

    var _days = useState(0);
    var days = _days[0];
    var setDays = _days[1];

    var _rate = useState(0.05);
    var rate = _rate[0];
    var setRate = _rate[1];

    var totalPenalty = Math.round(base * Math.pow(1 + rate, days) * 100) / 100;

    return e('div', { className: 'pd-penalty-box' },
      e('div', { className: 'pd-penalty-title' }, '📊 Калкулатор на дългове — ' + (props.positionName || 'Позиция')),
      e('div', { className: 'pd-calc-grid' },
        e('div', { className: 'pd-calc-field' },
          e('label', { className: 'pd-calc-label' }, STR.basePenalty),
          e('input', { className: 'pd-calc-input', type: 'number', value: base, onChange: function (ev) { setBase(parseFloat(ev.target.value) || 0); } })
        ),
        e('div', { className: 'pd-calc-field' },
          e('label', { className: 'pd-calc-label' }, STR.daysLate),
          e('input', { className: 'pd-calc-input', type: 'number', value: days, onChange: function (ev) { setDays(parseInt(ev.target.value) || 0); } })
        ),
        e('div', { className: 'pd-calc-field' },
          e('label', { className: 'pd-calc-label' }, STR.penaltyRate + ' (%)'),
          e('input', { className: 'pd-calc-input', type: 'number', step: '0.01', value: rate * 100, onChange: function (ev) { setRate(parseFloat(ev.target.value) / 100 || 0); } })
        ),
        e('div', { className: 'pd-calc-field', style: { display: 'flex', alignItems: 'flex-end' } },
          e('button', { className: 'pd-btn pd-btn-primary', onClick: function () {} }, STR.calculate)
        )
      ),
      totalPenalty > 0 ? e('div', { className: 'pd-penalty-row', style: { borderTop: '2px solid var(--err)', paddingTop: '0.75rem', fontSize: '0.9rem' } },
        e('span', { style: { fontWeight: 700 } }, 'Общо изчислени дългове:'),
        e('span', { className: 'pd-penalty-amount' }, formatBGN(totalPenalty))
      ) : null
    );
  }

  /* ── Insurance Tracker Component ── */
  function InsuranceTracker(props) {
    var _policies = useState([
      { type: 'Отговорност на строител', policy: 'ЗПО-2026-' + (props.positionId || '001'), validFrom: '2026-07-01', validTo: '2027-06-30', status: 'valid' },
      { type: 'Застраховка на имот', policy: 'ЗИ-2026-' + (props.positionId || '001'), validFrom: '2026-06-01', validTo: '2026-11-30', status: 'expiring' },
      { type: 'Гражданска отговорност', policy: 'ГО-2026-' + (props.positionId || '001'), validFrom: '2026-01-01', validTo: '2026-06-30', status: 'expired' }
    ]);
    var policies = _policies[0];
    var setPolicies = _policies[1];

    return e('div', {},
      e('div', { className: 'pd-section-header' }, '🛡️ ' + STR.insurancePolicy + ' (' + policies.length + ')'),
      e('div', {},
        policies.map(function (pol, i) {
          return e('div', { key: i, className: 'pd-insurance-item' },
            e('div', { className: 'pd-insurance-status ' + pol.status }, pol.status === 'valid' ? STR.valid : pol.status === 'expiring' ? STR.expiring : STR.expired),
            e('div', { style: { flex: 1 } },
              e('div', { style: { fontSize: '0.85rem', fontWeight: 600 } }, pol.type),
              e('div', { style: { fontSize: '0.7rem', color: 'var(--ink-4)' } }, pol.policy + ' · ' + formatDate(pol.validFrom) + ' — ' + formatDate(pol.validTo))
            )
          );
        })
      )
    );
  }

  /* ── Schedule Component ── */
  function ScheduleTab(props) {
    var _tasks = useState([
      { task: 'Разчистване на терена', responsible: 'Инж. Петров', startDate: '2026-09-15', endDate: '2026-09-20', status: 'completed' },
      { task: 'Земяни на фундамент', responsible: 'Бригада Стефанов', startDate: '2026-09-21', endDate: '2026-10-10', status: 'in_progress' },
      { task: 'Зареждане на спортна повърхност', responsible: 'Технически екип', startDate: '2026-10-11', endDate: '2026-11-15', status: 'pending' },
      { task: 'Монтаж на ограждения', responsible: 'Бригада Ганчев', startDate: '2026-11-16', endDate: '2026-12-01', status: 'pending' },
      { task: 'Финална инспекция', responsible: 'Комисия по поръчки', startDate: '2026-12-02', endDate: '2026-12-10', status: 'pending' }
    ]);
    var tasks = _tasks[0];
    var setTasks = _tasks[1];

    return e('div', {},
      e('div', { className: 'pd-section-header' }, '📅 ' + STR.scheduleTitle),
      e('div', {},
        tasks.map(function (t, i) {
          return e('div', { key: i, className: 'pd-schedule-item' },
            e('div', { className: 'pd-schedule-date' }, formatDate(t.startDate) + ' — ' + formatDate(t.endDate)),
            e('div', { className: 'pd-schedule-task' }, t.task),
            e('div', { style: { fontSize: '0.75rem', color: 'var(--ink-4)', minWidth: '80px' } }, t.responsible),
            e('span', { className: 'pd-schedule-status pd-badge pd-badge-' + (t.status === 'completed' ? 'completed' : t.status === 'in_progress' ? 'in_progress' : 'not_started') }, t.status === 'completed' ? 'Готово' : t.status === 'in_progress' ? 'В ход' : 'Чакащ')
          );
        })
      )
    );
  }

  /* ── Main Position View Component ── */
  function PositionView(props) {
    var positionId = props.positionId;
    var onBack = props.onBack || function () {};

    var position = (STR.positions || []).find(function (p) { return p.id === positionId; });
    if (!position) {
      return e('div', { className: 'pd-empty' }, e('div', { className: 'pd-empty-icon' }, '🔍'), 'Позиция не намерена');
    }

    var _activeTab = useState('documents');
    var activeTab = _activeTab[0];
    var setActiveTab = _activeTab[1];

    var tabs = [
      { id: 'documents', label: '📄 Документи', icon: 'fa-file-alt' },
      { id: 'contract', label: '📝 Договор', icon: 'fa-file-contract' },
      { id: 'supervision', label: '🔍 Контролен обход', icon: 'fa-clipboard-check' },
      { id: 'compliance', label: '✅ Съответствие', icon: 'fa-check-circle' },
      { id: 'payments', label: '💰 Плащания', icon: 'fa-money-bill-wave' },
      { id: 'schedule', label: '📅 Разписание', icon: 'fa-calendar-alt' },
      { id: 'penalty', label: '💸 Дългове', icon: 'fa-calculator' },
      { id: 'insurance', label: '🛡️ Застраховка', icon: 'fa-shield-alt' }
    ];

    // Compliance regulations for this position
    var positionRegs = (STRINGS ? null : null) || null;
    var regulations = [
      { id: 'zop_' + position.id, reg: 'ЗОП — Закон за обществените поръчки', short: 'ЗОП', status: position.compliance >= 70 ? 'compliant' : 'pending', notes: 'Раздел I напълно' },
      { id: 'zut_' + position.id, reg: 'ЗУТ — Закон за обществените услуги', short: 'ЗУТ', status: 'pending', notes: 'В процес' },
      { id: 'n4_' + position.id, reg: 'Наредба №4', short: 'Наредба №4', status: position.compliance >= 50 ? 'compliant' : 'pending', notes: '' },
      { id: 'eu_' + position.id, reg: 'EU Taxonomy 2020/852', short: 'EU', status: 'pending', notes: '' },
      { id: 'fire_' + position.id, reg: 'Пожарна безопасност', short: 'Пожарна', status: 'compliant', notes: '' },
      { id: 'safety_' + position.id, reg: 'План за безопасност', short: 'ПБЗ', status: 'pending', notes: '' }
    ];

    return e('div', { className: 'pd-dashboard', style: { maxWidth: '1000px' } },
      // Header
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' } },
        e('div', {},
          e('h2', { style: { fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)' } }, '🏟️ ' + position.village + ' — ' + position.sport),
          e('div', { style: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem', alignItems: 'center' } },
            e('span', { className: 'pd-badge pd-badge-' + position.status }, position.status === 'completed' ? 'Завършена' : position.status === 'in_progress' ? 'В процес' : position.status === 'overdue' ? 'Изтекъл' : 'Не започната'),
            e('span', { className: 'pd-deadline ' + getDeadlineClass(position.deadline), style: { fontSize: '0.75rem' } }, 'Срок: ' + formatDate(position.deadline))
          )
        ),
        e('button', { className: 'pd-btn pd-btn-secondary', onClick: onBack }, '← Назад към списъка')
      ),

      // Position info bar
      e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1.5rem' } },
        e('div', { className: 'pd-info-card' },
          e('div', { className: 'pd-info-card-title' }, STR.village),
          e('div', { className: 'pd-info-card-value' }, position.village)
        ),
        e('div', { className: 'pd-info-card' },
          e('div', { className: 'pd-info-card-title' }, STR.budget),
          e('div', { className: 'pd-budget' }, formatBGN(position.budget))
        ),
        e('div', { className: 'pd-info-card' },
          e('div', { className: 'pd-info-card-title' }, STR.compliance),
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
            e('div', { className: 'pd-progress-bar', style: { flex: 1 } },
              e('div', { className: 'pd-progress-fill completed', style: { width: position.compliance + '%' } })
            ),
            e('span', { style: { fontSize: '0.9rem', fontWeight: 700 } }, position.compliance + '%')
          )
        ),
        e('div', { className: 'pd-info-card' },
          e('div', { className: 'pd-info-card-title' }, STR.deadline),
          e('div', { className: 'pd-info-card-value', style: { fontSize: '0.9rem' } }, formatDate(position.deadline))
        )
      ),

      // Penalty calculator
      e(PenaltyCalculator, { positionName: position.village }),

      // Tabs
      e('div', { className: 'pd-tabs' },
        tabs.map(function (tab) {
          return e('div', {
            key: tab.id,
            className: 'pd-tab' + (activeTab === tab.id ? ' active' : ''),
            onClick: function () { setActiveTab(tab.id); }
          }, tab.label);
        })
      ),

      // Tab panels
      e('div', { className: 'pd-tab-panel' + (activeTab === 'documents' ? ' active' : '') },
        e(DocumentChecklist, { positionId: position.id })
      ),
      e('div', { className: 'pd-tab-panel' + (activeTab === 'contract' ? ' active' : '') },
        e(ContractManagement, { positionId: position.id })
      ),
      e('div', { className: 'pd-tab-panel' + (activeTab === 'supervision' ? ' active' : '') },
        e(SupervisionLog, { positionId: position.id })
      ),
      e('div', { className: 'pd-tab-panel' + (activeTab === 'compliance' ? ' active' : '') },
        e(ComplianceTab, { regulations: regulations })
      ),
      e('div', { className: 'pd-tab-panel' + (activeTab === 'payments' ? ' active' : '') },
        e(ContractManagement, { positionId: position.id })
      ),
      e('div', { className: 'pd-tab-panel' + (activeTab === 'schedule' ? ' active' : '') },
        e(ScheduleTab, { positionId: position.id })
      ),
      e('div', { className: 'pd-tab-panel' + (activeTab === 'penalty' ? ' active' : '') },
        e(PenaltyCalculator, { positionName: position.village })
      ),
      e('div', { className: 'pd-tab-panel' + (activeTab === 'insurance' ? ' active' : '') },
        e(InsuranceTracker, { positionId: position.id })
      )
    );
  }

  /* ── Register globally ── */
  if (typeof window !== 'undefined') {
    window.PositionView = PositionView;
  }

})(window);
