/* ═══════════════════════════════════════════════════════════════════════
 * ComplianceChecker.js — Регулаторен контрол на съответствие
 * Български закони и европейски стандарти
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;
  var useCallback = React.useCallback;

  /* ── Bulgarian UI strings ── */
  var STR = {
    title: 'Контролен лист на съответствие',
    subtitle: 'Регулаторен контрол — Пазарджишка община',
    totalRegulations: 'Общо регулации',
    compliant: 'Съответстват',
    pending: 'Изчакват',
    violations: 'Нарушения',
    complianceScore: 'Процент съответствие',
    position: 'Позиция',
    allPositions: 'Всички позиции',
    regulation: 'Регулация',
    shortDesc: 'Кратко описание',
    status: 'Статус',
    notes: 'Бележки',
    evidence: 'Свидетелство',
    markCompliant: 'Маркирай съответстващ',
    markPending: 'Маркирай изчакващ',
    markViolation: 'Маркирай нарушение',
    addEvidence: 'Добави свидетельство',
    save: 'Запази',
    filterByPosition: 'Филтър по позиция',
    allRegulations: 'Всички регулации',
    // Regulations list
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
    // Positions
    positions: [
      { id: 1, village: 'Говедаре', sport: 'Футболно поле' },
      { id: 2, village: 'Братница', sport: 'Футболно поле' },
      { id: 3, village: 'Главиница', sport: 'Футболно поле' },
      { id: 4, village: 'Драгор', sport: 'Футболно+баскетболно' },
      { id: 5, village: 'Звоничево', sport: 'Футболно+баскетболно' }
    ],
    // Full compliance data
    complianceData: [
      { id: 'zop', reg: 'ЗОП — Закон за обществените поръчки', short: 'ЗОП', desc: 'Закон за обществените поръчки, чл. 1-102', statuses: [1, 4], violations: [5] },
      { id: 'zut', reg: 'ЗУТ — Закон за обществените услуги', short: 'ЗУТ', desc: 'Закон за обществените услуги, чл. 1-72', statuses: [1, 4], violations: [5] },
      { id: 'zkaiip', reg: 'ЗКАИИП — Закон за контрола на доходите', short: 'ЗКАИИП', desc: 'Контрол на доходите по ЗОП', statuses: [1, 4], violations: [5] },
      { id: 'n4', reg: 'Наредба №4 — Правилник', short: 'Наредба №4', desc: 'Правилник за приложение на ЗОП', statuses: [1, 4], violations: [5] },
      { id: 'n3', reg: 'Наредба №3/2003', short: 'Наредба №3/2003', desc: 'Наредба за публични поръчки', statuses: [1, 4], violations: [5] },
      { id: 'eu', reg: 'EU Taxonomy 2020/852', short: 'EU Taxonomy', desc: 'Европейска таксономия за околна среда', statuses: [1, 4], violations: [5] },
      { id: 'bds', reg: 'БДС EN стандарти', short: 'БДС EN', desc: 'Български държавни стандарти EN', statuses: [1, 4], violations: [5] },
      { id: 'access', reg: 'Достъпност', short: 'Достъпност', desc: 'Изисквания за хора с увреждания — БДС EN 301546', statuses: [1, 4], violations: [5] },
      { id: 'fire', reg: 'Пожарна безопасност', short: 'Пожарна', desc: 'Пожарна сигнализация и изходи — БДС', statuses: [1, 4], violations: [5] },
      { id: 'safety', reg: 'План за безопасност и здраве', short: 'ПБЗ', desc: 'План за безопасност и здраве на работното място', statuses: [1, 4], violations: [5] },
      { id: 'waste', reg: 'Управление на отпадъците', short: 'Отпадъци', desc: 'Закон за отпадъците и Наредба за строителни отпадъци', statuses: [1, 4], violations: [5] }
    ]
  };

  var positionNames = { 1: 'Говедаре', 2: 'Братница', 3: 'Главиница', 4: 'Драгор', 5: 'Звоничево' };

  function formatBGN(val) { return val.toLocaleString('bg-BG') + ' лв.'; }

  function getStatusIcon(status) {
    if (status === 'compliant') return '✓';
    if (status === 'violation') return '✗';
    return '○';
  }

  function getStatusClass(status) {
    return status === 'compliant' ? 'pd-compliance-icon compliant' : status === 'violation' ? 'pd-compliance-icon violation' : 'pd-compliance-icon pending';
  }

  /* ── Compliance Item Component ── */
  function ComplianceItem(props) {
    var item = props.item;
    var positionId = props.positionId;
    var onStatusChange = props.onStatusChange;
    var onNoteChange = props.onNoteChange;
    var onEvidenceAdd = props.onEvidenceAdd;

    var _note = useState(item.notes || '');
    var note = _note[0];
    var setNote = _note[1];

    var _evidence = useState([]);
    var evidence = _evidence[0];
    var setEvidence = _evidence[1];

    var _newEvidence = useState('');
    var newEvidence = _newEvidence[0];
    var setNewEvidence = _newEvidence[1];

    var addEvidence = function () {
      if (!newEvidence.trim()) return;
      setEvidence(evidence.concat(newEvidence.trim()));
      setNewEvidence('');
      onEvidenceAdd && onEvidenceAdd(item.id, newEvidence.trim());
    };

    var status = props.status || 'pending';

    return e('div', { className: 'pd-compliance-item' },
      e('div', { className: getStatusClass(status), style: { width: '40px', height: '40px', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        getStatusIcon(status)
      ),
      e('div', { className: 'pd-compliance-info', style: { flex: 2 } },
        e('div', { className: 'pd-compliance-title' }, item.reg),
        e('div', { className: 'pd-compliance-desc' }, item.desc),
        note ? e('div', { style: { fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '0.25rem' } }, '📝 ' + note) : null,
        evidence.length > 0 ? e('div', { style: { fontSize: '0.7rem', color: 'var(--primary)', marginTop: '0.25rem' } }, '📎 ' + evidence.length + ' свидетелства') : null,
        // Note and evidence input
        e('div', { style: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' } },
          e('input', { className: 'pd-notes-field', placeholder: 'Бележка...', value: note, onChange: function (ev) { setNote(ev.target.value); onNoteChange && onNoteChange(item.id, ev.target.value); }, style: { flex: 1, minWidth: '150px', fontSize: '0.75rem' } }),
          e('input', { className: 'pd-notes-field', placeholder: 'Път към свидетельство...', value: newEvidence, onChange: function (ev) { setNewEvidence(ev.target.value); }, style: { flex: 1, minWidth: '150px', fontSize: '0.75rem' } }),
          e('button', { className: 'pd-btn pd-btn-sm pd-btn-secondary', onClick: addEvidence }, '📎')
        )
      ),
      e('div', { className: 'pd-compliance-actions', style: { display: 'flex', flexDirection: 'column', gap: '0.25rem' } },
        e('button', { className: 'pd-btn pd-btn-sm ' + (status === 'compliant' ? 'pd-btn-primary' : 'pd-btn-secondary'), onClick: function () { onStatusChange && onStatusChange(item.id, 'compliant'); } }, '✅ Съответстващ'),
        e('button', { className: 'pd-btn pd-btn-sm ' + (status === 'pending' ? 'pd-btn-primary' : 'pd-btn-secondary'), onClick: function () { onStatusChange && onStatusChange(item.id, 'pending'); } }, '○ Изчакващ'),
        e('button', { className: 'pd-btn pd-btn-sm ' + (status === 'violation' ? 'pd-btn-danger' : 'pd-btn-secondary'), onClick: function () { onStatusChange && onStatusChange(item.id, 'violation'); } }, '✗ Нарушение')
      )
    );
  }

  /* ── Position Compliance Summary Component ── */
  function PositionSummary(props) {
    var pos = props.position;
    var items = props.items;
    var onPositionClick = props.onPositionClick;

    var stats = useMemo(function () {
      var compliant = items.filter(function (i) { return i.status === 'compliant'; }).length;
      var violations = items.filter(function (i) { return i.status === 'violation'; }).length;
      var pending = items.filter(function (i) { return i.status === 'pending'; }).length;
      var score = Math.round(compliant / items.length * 100);
      return { compliant: compliant, violations: violations, pending: pending, score: score };
    }, [items]);

    return e('div', {
      className: 'pd-position-card',
      onClick: function () { onPositionClick && onPositionClick(pos.id); }
    },
      e('div', { className: 'pd-position-card-info' },
        e('div', { className: 'pd-position-card-name' }, pos.village + ' — ' + pos.sport),
        e('div', { style: { display: 'flex', gap: '0.75rem', marginTop: '0.5rem', fontSize: '0.75rem' } },
          e('span', { style: { color: 'var(--ok)' } }, '✓ ' + stats.compliant),
          e('span', { style: { color: 'var(--gold)' } }, '○ ' + stats.pending),
          e('span', { style: { color: 'var(--err)' } }, '✗ ' + stats.violations)
        ),
        e('div', { className: 'pd-progress-bar', style: { width: '100%', height: '8px', marginTop: '0.5rem' } },
          e('div', { className: 'pd-progress-fill ' + (stats.score >= 70 ? 'completed' : stats.score >= 40 ? 'in_progress' : 'overdue'), style: { width: stats.score + '%' } })
        )
      ),
      e('div', { style: { textAlign: 'right' } },
        e('div', { style: { fontSize: '1.2rem', fontWeight: 700, color: stats.score >= 70 ? 'var(--ok)' : stats.score >= 40 ? 'var(--gold)' : 'var(--err)' } }, stats.score + '%'),
        e('div', { style: { fontSize: '0.7rem', color: 'var(--ink-4)' } }, 'съответствие')
      )
    );
  }

  /* ── Penalty Warning Component ── */
  function PenaltyWarning(props) {
    var violations = props.violations || [];
    var penalties = violations.map(function (v) {
      return { position: positionNames[v.positionId] || 'Неизвестно', count: v.count, amount: v.count * 2000 };
    });
    var totalAmount = penalties.reduce(function (s, p) { return s + p.amount; }, 0);

    if (violations.length === 0) return null;

    return e('div', { className: 'pd-alert pd-alert-danger', style: { marginBottom: '1rem' } },
      '⚠️ ' + violations.length + ' регулация с нарушения — потенциални дългове: ' + formatBGN(totalAmount) + '. Мериете незабавни действия!'
    );
  }

  /* ── Main Compliance Checker Component ── */
  function ComplianceChecker(props) {
    var _selectedPos = useState(null);
    var selectedPos = _selectedPos[0];
    var setSelectedPos = _selectedPos[1];

    var _filterPos = useState('all');
    var filterPos = _filterPos[0];
    var setFilterPos = _filterPos[1];

    var _allItems = useState(STR.complianceData.map(function (reg) {
      return {
        id: reg.id,
        reg: reg.reg,
        short: reg.short,
        desc: reg.desc,
        notes: '',
        evidence: [],
        status: reg.violations && reg.violations.indexOf(5) >= 0 ? 'violation' : 'pending'
      };
    }));
    var allItems = _allItems[0];
    var setAllItems = _allItems[1];

    // Update status of a compliance item
    var updateStatus = useCallback(function (itemId, newStatus) {
      setAllItems(function (prev) {
        return prev.map(function (item) {
          if (item.id === itemId) {
            return Object.assign({}, item, { status: newStatus });
          }
          return item;
        });
      });
    }, []);

    var updateNote = useCallback(function (itemId, note) {
      setAllItems(function (prev) {
        return prev.map(function (item) {
          if (item.id === itemId) {
            return Object.assign({}, item, { notes: note });
          }
          return item;
        });
      });
    }, []);

    var updateEvidence = useCallback(function (itemId, evidenceText) {
      setAllItems(function (prev) {
        return prev.map(function (item) {
          if (item.id === itemId) {
            return Object.assign({}, item, { evidence: item.evidence.concat(evidenceText) });
          }
          return item;
        });
      });
    }, []);

    // Filter items by position
    var filteredItems = useMemo(function () {
      if (filterPos === 'all') return allItems;
      var posId = parseInt(filterPos);
      return allItems.map(function (item) {
        // For simplicity, all items apply to all positions
        return item;
      });
    }, [filterPos, allItems]);

    // Mark all as compliant
    var markAllCompliant = function () {
      setAllItems(function (prev) {
        return prev.map(function (item) { return Object.assign({}, item, { status: 'compliant' }); });
      });
    };

    // Summary stats
    var stats = useMemo(function () {
      var compliant = allItems.filter(function (i) { return i.status === 'compliant'; }).length;
      var violations = allItems.filter(function (i) { return i.status === 'violation'; }).length;
      var pending = allItems.filter(function (i) { return i.status === 'pending'; }).length;
      var score = Math.round(compliant / allItems.length * 100);
      return { compliant: compliant, violations: violations, pending: pending, score: score, total: allItems.length };
    }, [allItems]);

    // Items with violations for penalty warning
    var violations = useMemo(function () {
      var v = allItems.filter(function (i) { return i.status === 'violation'; });
      return v.map(function (item) {
        var posIds = [1, 2, 3, 4, 5]; // All positions affected
        return posIds.map(function (posId) { return { positionId: posId, count: 1 }; }).flat();
      }).flat();
    }, [allItems]);

    // Filtered items for selected position
    var positionItems = useMemo(function () {
      if (!selectedPos) return allItems;
      return allItems; // All compliance items apply to all positions in this simplified model
    }, [selectedPos, allItems]);

    return e('div', { className: 'pd-dashboard', style: { maxWidth: '1400px' } },
      // Header
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' } },
        e('div', {},
          e('h1', { className: 'pd-page-title' }, STR.title),
          e('p', { className: 'pd-page-subtitle' }, STR.subtitle)
        ),
        e('div', { style: { display: 'flex', gap: '0.5rem' } },
          e('button', { className: 'pd-btn pd-btn-secondary pd-btn-sm', onClick: markAllCompliant }, '✅ Маркирай всички съответстващи'),
          e('button', { className: 'pd-btn pd-btn-primary pd-btn-sm' }, '📊 Изнеси отчет')
        )
      ),

      // Penalty warning
      e(PenaltyWarning, { violations: violations }),

      // Summary cards
      e('div', { className: 'pd-summary-grid' },
        e('div', { className: 'pd-summary-card' },
          e('div', { className: 'pd-summary-card-label' }, STR.totalRegulations),
          e('div', { className: 'pd-summary-card-value' }, stats.total)
        ),
        e('div', { className: 'pd-summary-card' },
          e('div', { className: 'pd-summary-card-label' }, '✅ Съответстват'),
          e('div', { className: 'pd-summary-card-value', style: { color: 'var(--ok)' } }, stats.compliant)
        ),
        e('div', { className: 'pd-summary-card' },
          e('div', { className: 'pd-summary-card-label' }, '○ Изчакват'),
          e('div', { className: 'pd-summary-card-value', style: { color: 'var(--gold)' } }, stats.pending)
        ),
        e('div', { className: 'pd-summary-card' },
          e('div', { className: 'pd-summary-card-label' }, '✗ Нарушения'),
          e('div', { className: 'pd-summary-card-value', style: { color: 'var(--err)' } }, stats.violations)
        ),
        e('div', { className: 'pd-summary-card' },
          e('div', { className: 'pd-summary-card-label' }, STR.complianceScore),
          e('div', { className: 'pd-summary-card-value', style: { color: stats.score >= 70 ? 'var(--ok)' : stats.score >= 40 ? 'var(--gold)' : 'var(--err)' } }, stats.score + '%')
        )
      ),

      // Compliance progress bar
      e('div', { className: 'pd-compliance-progress', style: { marginBottom: '1.5rem' } },
        e('div', { className: 'pd-progress-bar', style: { flex: 2, height: '14px' } },
          e('div', { className: 'pd-progress-fill completed', style: { width: stats.score + '%' } })
        ),
        e('span', { style: { fontSize: '0.85rem', fontWeight: 700, minWidth: '60px' } }, stats.score + '%')
      ),

      // Filter bar
      e('div', { className: 'pd-filter-bar' },
        e('span', { style: { fontSize: '0.85rem', fontWeight: 600 } }, 'Филтър по позиция:'),
        ['all', '1', '2', '3', '4', '5'].map(function (pos) {
          return e('button', {
            key: pos,
            className: 'pd-btn pd-btn-sm ' + (filterPos === pos ? 'pd-btn-primary' : 'pd-btn-secondary'),
            onClick: function () { setFilterPos(pos); }
          }, pos === 'all' ? 'Всички' : positionNames[pos]);
        })
      ),

      // Position summary cards
      selectedPos ? null : e('div', { style: { marginBottom: '1.5rem' } },
        e('div', { className: 'pd-section-header' }, '📍 Съответствие по позиции'),
        e('div', { className: 'pd-position-list' },
          STR.positions.map(function (pos) {
            return e(PositionSummary, { key: pos.id, position: pos, items: allItems, onPositionClick: function (id) { setSelectedPos(id); } });
          })
        )
      ),

      // Individual position compliance
      selectedPos ? e('div', { style: { marginBottom: '1.5rem' } },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' } },
          e('div', {},
            e('h2', { style: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink)' } }, '🏟️ ' + positionNames[selectedPos] + ' — Регулаторен контрол'),
            e('button', { className: 'pd-btn pd-btn-secondary pd-btn-sm', onClick: function () { setSelectedPos(null); } }, '← Назад към обобщение')
          ),
          e('div', { style: { fontSize: '0.85rem', color: 'var(--ink-4)' } },
            'Избрана позиция: ' + positionNames[selectedPos]
          )
        ),
        e('div', { className: 'pd-compliance-list' },
          allItems.map(function (item) {
            return e(ComplianceItem, {
              key: item.id,
              item: item,
              positionId: selectedPos,
              status: item.status,
              onStatusChange: function (id, status) { updateStatus(id, status); },
              onNoteChange: function (id, note) { updateNote(id, note); },
              onEvidenceAdd: function (id, ev) { updateEvidence(id, ev); }
            });
          })
        )
      ) : null,

      // All positions compliance view
      !selectedPos ? e('div', { className: 'pd-compliance-list' },
        allItems.map(function (item) {
          var hasViolationForSelected = false; // Simplified
          return e(ComplianceItem, {
            key: item.id,
            item: item,
            positionId: null,
            status: item.status,
            onStatusChange: function (id, status) { updateStatus(id, status); },
            onNoteChange: function (id, note) { updateNote(id, note); },
            onEvidenceAdd: function (id, ev) { updateEvidence(id, ev); }
          });
        })
      ) : null
    );
  }

  /* ── Register globally ── */
  if (typeof window !== 'undefined') {
    window.ComplianceChecker = ComplianceChecker;
  }

})(window);
