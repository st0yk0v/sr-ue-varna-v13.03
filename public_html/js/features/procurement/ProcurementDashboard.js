/* ═══════════════════════════════════════════════════════════════════════
 * ProcurementDashboard.js — Дашборд за управление на обществени поръчки
 * Пазарджишка община · 5 спортни площадки
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useMemo = React.useMemo;

  /* ── Bulgarian UI strings ── */
  var STRINGS = {
    title: 'Управление на обществените поръчки',
    subtitle: 'Пазарджишка община · 5 спортни площадки',
    overview: 'Обобщен преглед',
    positions: 'Позиции',
    status: 'Статус',
    budget: 'Бюджет',
    deadline: 'Срок',
    compliance: 'Съответствие',
    overdue: 'Изтекли срокове',
    penalties: 'Дългове',
    quickLinks: 'Бързи линкове',
    viewDetails: 'Виж подробности',
    manage: 'Управление',
    notStarted: 'Не започнат',
    inProgress: 'В процес',
    completed: 'Завършени',
    overdue: 'Изтекъл',
    allPositions: 'Всички позиции',
    filterByStatus: 'Филтър по статус',
    compliancePercent: 'Процент съответствие',
    totalBudget: 'Общ бюджет',
    totalPenalties: 'Общо дългове',
    activeSupervisions: 'Активни контролни обхождания',
    position: 'Позиция',
    sportType: 'Вид спорт',
    village: 'Село',
    statusDate: 'Статус от',
    documents: 'Документи',
    contract: 'Договор',
    supervision: 'Контролен обход',
    compliance: 'Съответствие',
    payments: 'Плащания',
    schedule: 'Разписание',
    penaltyCalc: 'Калкулатор на дългове',
    insurance: 'Застраховане',
    noData: 'Няма налични данни',
    markAllCompliant: 'Маркираш всичко като съответстващо',
    save: 'Запази',
    cancel: 'Отмени',
    addNote: 'Добави бележка',
    evidence: 'Свидетелство',
    addEvidence: 'Добави свидетельство',
    penaltyWarning: 'Внимание: Има неплатени дългове!',
    overdueWarning: 'Внимание: Изтекли срокове!',
    compliant: 'Съответстващ',
    pending: 'Изчакващ',
    violation: 'Нарушение',
    valid: 'Валидно',
    expired: 'Изтекло',
    expiring: 'Изтича',
    documentsPart1: 'Част 1 — Общо техническо описание',
    documentsPart2: 'Част 2 — Документация за обществена поръчка',
    documentsPart3: 'Част 3 — Проектен план',
    documentsPart4: 'Част 4 — Финансов анализ',
    documentsPart5: 'Част 5 — Спецификация и критерии',
    documentsPart6: 'Част 6 — Планове за управление на риска',
    documentsPart7: 'Част 7 — План за управление на качеството',
    documentsPart8: 'Част 8 — План за комуникации',
    documentsPart9: 'Част 9 — План за мониторинг и оценка',
    documentsPart10: 'Част 10 — Заключителен отчет и сертификат',
    // Compliance regulations
    regZOP: 'ЗОП — Закон за обществените поръчки',
    regZUT: 'ЗУТ — Закон за обществените услуги',
    regZKAIIP: 'ЗКАИИП — Закон за контрола на доходите',
    regNaredba4: 'Наредба №4 — Правилник за приложение на ЗОП',
    regNaredba3: 'Наредба №3/2003 — Наредба за публични поръчки',
    regEUTaxonomy: 'EU Taxonomy 2020/852 — Европейска таксономия',
    regBDS_EN: 'БДС EN стандарти — Български държавни стандарти',
    regAccessibility: 'Достъпност — Изисквания за хора с увреждания',
    regFireSafety: 'Пожарна безопасност',
    regSafetyPlan: 'План за безопасност и здраве',
    regWasteMgmt: 'Управление на отпадъците',
    // Positions data
    positions: [
      { id: 1, village: 'Говедаре', sport: 'Футболно поле', status: 'in_progress', budget: 185000, deadline: '2026-12-15', compliance: 72 },
      { id: 2, village: 'Братница', sport: 'Футболно поле', status: 'in_progress', budget: 162000, deadline: '2026-11-30', compliance: 58 },
      { id: 3, village: 'Главиница', sport: 'Футболно поле', status: 'not_started', budget: 143000, deadline: '2027-01-20', compliance: 35 },
      { id: 4, village: 'Драгор', sport: 'Футболно+баскетболно', status: 'completed', budget: 225000, deadline: '2026-10-31', compliance: 94 },
      { id: 5, village: 'Звоничево', sport: 'Футболно+баскетболно', status: 'overdue', budget: 198000, deadline: '2026-09-15', compliance: 41 }
    ],
    // Compliance data
    complianceItems: [
      { id: 'zop', reg: 'ЗОП — Закон за обществените поръчки', short: 'ЗОП', status: 'compliant', notes: 'Раздел I и III напълно съответстват' },
      { id: 'zut', reg: 'ЗУТ — Закон за обществените услуги', short: 'ЗУТ', status: 'pending', notes: 'Частично — чл. 17-23 в процес' },
      { id: 'zkaiip', reg: 'ЗКАИИП — Закон за контрола на доходите', short: 'ЗКАИИП', status: 'pending', notes: 'Документацията се подготвя' },
      { id: 'n4', reg: 'Наредба №4 — Правилник за приложение на ЗОП', short: 'Наредба №4', status: 'compliant', notes: 'Всички процедури документирани' },
      { id: 'n3', reg: 'Наредба №3/2003 — Наредба за публични поръчки', short: 'Наредба №3/2003', status: 'violation', notes: 'Изпълнителният протокол не е подписан' },
      { id: 'eu', reg: 'EU Taxonomy 2020/852 — Европейска таксономия', short: 'EU Taxonomy', status: 'pending', notes: 'Класификация по околна среда' },
      { id: 'bds', reg: 'БДС EN стандарти — Български държавни стандарти', short: 'БДС EN', status: 'compliant', notes: 'EN 15333 за спортни съоръжения' },
      { id: 'access', reg: 'Достъпност — Изисквания за хора с увреждания', short: 'Достъпност', status: 'pending', notes: 'Пътека към входа' },
      { id: 'fire', reg: 'Пожарна безопасност', short: 'Пожарна без.', status: 'compliant', notes: 'Пожарна сигнализация и изходи' },
      { id: 'safety', reg: 'План за безопасност и здраве', short: 'ПБЗ', status: 'violation', notes: 'Оцетяване за работа на височина' },
      { id: 'waste', reg: 'Управление на отпадъците', short: 'Отпадъци', status: 'pending', notes: 'План за управление на строителни отпадъци' }
    ]
  };

  /* ── Status helper ── */
  function getStatusLabel(status) {
    var map = { not_started: 'Не започнат', in_progress: 'В процес', completed: 'Завършени', overdue: 'Изтекъл' };
    return map[status] || status;
  }

  function formatBGN(val) {
    return val.toLocaleString('bg-BG') + ' лв.';
  }

  function formatDate(d) {
    if (!d) return '—';
    var parts = String(d).split('-');
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }

  function getDeadlineClass(deadline) {
    if (!deadline) return '';
    var d = new Date(deadline + 'T00:00:00');
    var now = new Date();
    var diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'pd-deadline-overdue';
    if (diff < 30) return 'pd-deadline-soon';
    return 'pd-deadline-ok';
  }

  /* ── Summary Card Component ── */
  function SummaryCard(props) {
    var label = props.label;
    var value = props.value;
    var sub = props.sub || '';
    var icon = props.icon || '';
    return e('div', { className: 'pd-summary-card' },
      e('div', { className: 'pd-summary-card-label' }, icon + ' ' + label),
      e('div', { className: 'pd-summary-card-value' }, value),
      sub ? e('div', { className: 'pd-summary-card-label-sub' }, sub) : null
    );
  }

  /* ── Position Card Component ── */
  function PositionCard(props) {
    var pos = props.pos;
    var onClick = props.onClick;
    return e('div', {
      className: 'pd-position-card',
      onClick: function () { onClick && onClick(pos.id); }
    },
      e('div', { className: 'pd-position-card-info' },
        e('div', { className: 'pd-position-card-name' }, pos.village + ' — ' + pos.sport),
        e('div', { className: 'pd-position-card-meta' },
          'Бюджет: ' + formatBGN(pos.budget) + ' · Срок: ' + formatDate(pos.deadline)
        ),
        e('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' } },
          e('span', { className: 'pd-badge pd-badge-' + pos.status }, getStatusLabel(pos.status)),
          e('span', { className: 'pd-deadline ' + getDeadlineClass(pos.deadline) }, formatDate(pos.deadline))
        )
      ),
      e('div', { className: 'pd-position-card-actions' },
        e('div', { className: 'pd-progress-bar', style: { width: '80px' } },
          e('div', { className: 'pd-progress-fill ' + pos.status, style: { width: pos.compliance + '%' } })
        ),
        e('span', { style: { fontSize: '0.75rem', color: 'var(--ink-4)' } }, pos.compliance + '%')
      )
    );
  }

  /* ── Main Dashboard Component ── */
  function ProcurementDashboard(props) {
    var onPositionClick = props.onPositionClick || function () {};
    var onRefresh = props.onRefresh || function () {};

    var _filterState = useState('all');
    var statusFilter = _filterState[0];
    var setStatusFilter = _filterState[1];

    var _selectedPos = useState(null);
    var selectedPos = _selectedPos[0];
    var setSelectedPos = _selectedPos[1];

    // Summary calculations
    var summary = useMemo(function () {
      var positions = STRINGS.positions;
      var totalPositions = positions.length;
      var completed = positions.filter(function (p) { return p.status === 'completed'; }).length;
      var inProgress = positions.filter(function (p) { return p.status === 'in_progress'; }).length;
      var overdue = positions.filter(function (p) { return p.status === 'overdue'; }).length;
      var notStarted = positions.filter(function (p) { return p.status === 'not_started'; }).length;
      var totalBudget = positions.reduce(function (s, p) { return s + p.budget; }, 0);
      var avgCompliance = Math.round(positions.reduce(function (s, p) { return s + p.compliance; }, 0) / totalPositions);
      var totalPenalties = overdue * 1500 + notStarted * 500;

      return { totalPositions: totalPositions, completed: completed, inProgress: inProgress, overdue: overdue, notStarted: notStarted, totalBudget: totalBudget, avgCompliance: avgCompliance, totalPenalties: totalPenalties };
    }, []);

    // Filtered positions
    var filteredPositions = useMemo(function () {
      if (statusFilter === 'all') return STRINGS.positions;
      return STRINGS.positions.filter(function (p) { return p.status === statusFilter; });
    }, [statusFilter]);

    // Quick links
    var quickLinks = [
      { label: 'Документи', icon: 'fa-file-alt', action: function () { onPositionClick && onPositionClick(selectedPos || 1); } },
      { label: 'Договор', icon: 'fa-file-contract', action: function () {} },
      { label: 'Контролен обход', icon: 'fa-clipboard-check', action: function () {} },
      { label: 'Съответствие', icon: 'fa-check-circle', action: function () {} },
      { label: 'Плащания', icon: 'fa-money-bill-wave', action: function () {} }
    ];

    return e('div', { className: 'pd-dashboard' },
      // Page header
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' } },
        e('div', {},
          e('h1', { className: 'pd-page-title' }, STRINGS.title),
          e('p', { className: 'pd-page-subtitle' }, STRINGS.subtitle)
        ),
        e('div', { style: { display: 'flex', gap: '0.5rem' } },
          e('button', { className: 'pd-btn pd-btn-secondary pd-btn-sm', onClick: function () { onRefresh && onRefresh(); } }, '🔄 Обнови'),
          e('button', { className: 'pd-btn pd-btn-primary pd-btn-sm' }, '📊 Изнеси отчет')
        )
      ),

      // Alerts
      summary.overdue > 0 ? e('div', { className: 'pd-alert pd-alert-danger' }, '⚠️ ' + summary.overdue + ' позиция(и) с изтекъл срок — проверете дълговете и ускорете') : null,

      // Summary cards
      e('div', { className: 'pd-summary-grid' },
        e(SummaryCard, { label: 'Общо позиции', value: summary.totalPositions, sub: 'Активни проекти', icon: '🏟️' }),
        e(SummaryCard, { label: 'Завършени', value: summary.completed, sub: summary.completed + '/' + summary.totalPositions + ' завършени', icon: '✅' }),
        e(SummaryCard, { label: 'В процес', value: summary.inProgress, sub: summary.inProgress + ' на път', icon: '⚙️' }),
        e(SummaryCard, { label: 'Изтекъл срок', value: summary.overdue, sub: summary.overdue + ' критични', icon: '⏰' }),
        e(SummaryCard, { label: 'Общ бюджет', value: formatBGN(summary.totalBudget), sub: 'Всички позиции', icon: '💰' }),
        e(SummaryCard, { label: 'Съответствие', value: summary.avgCompliance + '%', sub: 'Средно по позиции', icon: '📋' }),
        e(SummaryCard, { label: 'Дългове', value: formatBGN(summary.totalPenalties), sub: 'Общо неизпълнени', icon: '💸' })
      ),

      // Compliance percentage bar
      e('div', { className: 'pd-compliance-progress' },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
          e('span', { className: 'pd-compliance-percent' }, summary.avgCompliance + '%')
        ),
        e('div', { className: 'pd-progress-bar', style: { flex: 2, height: '12px' } },
          e('div', { className: 'pd-progress-fill completed', style: { width: summary.avgCompliance + '%' } })
        ),
        e('span', { style: { fontSize: '0.75rem', color: 'var(--ink-4)' } }, 'от 100%')
      ),

      // Filter bar
      e('div', { className: 'pd-filter-bar' },
        e('span', { style: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)' } }, 'Филтър:'),
        ['all', 'not_started', 'in_progress', 'completed', 'overdue'].map(function (s) {
          return e('button', {
            key: s,
            className: 'pd-btn pd-btn-sm ' + (statusFilter === s ? 'pd-btn-primary' : 'pd-btn-secondary'),
            onClick: function () { setStatusFilter(s); }
          }, s === 'all' ? 'Всички' : getStatusLabel(s));
        })
      ),

      // Position list
      e('div', { className: 'pd-position-list' },
        filteredPositions.map(function (pos) {
          return e(PositionCard, { key: pos.id, pos: pos, onClick: function (id) { setSelectedPos(id); onPositionClick && onPositionClick(id); } });
        })
      ),

      filteredPositions.length === 0 ? e('div', { className: 'pd-empty' }, e('div', { className: 'pd-empty-icon' }, '📭'), 'Няма позиции със селектирания филтър') : null,

      // Quick links section
      e('div', { style: { marginTop: '1.5rem' } },
        e('div', { className: 'pd-section-header' }, '⚡ Бързи линкове'),
        e('div', { className: 'pd-quick-links' },
          quickLinks.map(function (link, i) {
            return e('button', {
              key: i,
              className: 'pd-quick-link',
              onClick: link.action
            }, link.icon + ' ' + link.label);
          })
        )
      ),

      // Overdue positions warning
      summary.overdue > 0 ? e('div', { className: 'pd-alert pd-alert-warning', style: { marginTop: '1.5rem' } },
        '⚠️ Изтекли срокове: ' +
        STRINGS.positions.filter(function (p) { return p.status === 'overdue'; }).map(function (p) { return p.village; }).join(', ') +
        ' — мериете незабавни действия!'
      ) : null,

      // Selected position detail panel
      selectedPos ? e('div', { className: 'pd-overlay', onClick: function () { setSelectedPos(null); } },
        e('div', { className: 'pd-modal', onClick: function (ev) { ev.stopPropagation(); } },
          e('div', { className: 'pd-modal-head' },
            e('div', { className: 'pd-modal-title' }, 'Детайли: ' + (STRINGS.positions.find(function (p) { return p.id === selectedPos; }) || {}).village || 'Позиция'),
            e('button', { className: 'pd-modal-close', onClick: function () { setSelectedPos(null); } }, '×')
          ),
          e('div', {},
            e('p', { style: { fontSize: '0.85rem', color: 'var(--ink-4)', marginBottom: '1rem' } }, 'Изберете раздел за управление от навигацията.'),
            e('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' } },
              ['documents', 'contract', 'supervision', 'compliance', 'payments', 'schedule'].map(function (tab) {
                return e('button', {
                  key: tab,
                  className: 'pd-btn pd-btn-secondary',
                  onClick: function () {
                    setSelectedPos(null);
                    onPositionClick && onPositionClick(selectedPos);
                  }
                }, tab === 'documents' ? '📄 ' + STRINGS.documents : tab === 'contract' ? '📝 ' + STRINGS.contract : tab === 'supervision' ? '🔍 ' + STRINGS.supervision : tab === 'compliance' ? '✅ ' + STRINGS.compliance : tab === 'payments' ? '💰 ' + STRINGS.payments : '📅 ' + STRINGS.schedule);
              })
            )
          )
        )
      ) : null
    );
  }

  /* ── Register globally ── */
  if (typeof window !== 'undefined') {
    window.ProcurementDashboard = ProcurementDashboard;
  }

})(window);
