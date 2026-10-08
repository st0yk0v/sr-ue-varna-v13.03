/* ═══════════════════════════════════════════════════════════════════════
 * Step3Budget.js — Стъпка 3: Бюджет (v2.0 — Visual Reform)
 * ═══════════════════════════════════════════════════════════════════════
 * Props: { state: Step3State, validation: ValidationResult,
 *          onFieldChange: (field, value) => void,
 *          projectType: string,  // from step1
 *          budgetRules: Array<{code:string, cap_percent:number}>,
 *          proposalId: string,
 *          onGenerateBudgetSpreadsheet: () => Promise }
 *
 * Features:
 *   - SVG donut chart — visual budget distribution by category
 *   - Slider / Exact-amount input modes (toggle)
 *   - Per-category progress bars with cap % usage visualization
 *   - Overhead auto-calculated at 10% of total, displayed read-only
 *   - Real-time cap-violation warnings with coloured indicators
 *   - Running totals footer with remaining / overspent highlight
 *   - Budget auto-sync: triggers spreadsheet generation on data change
 *   - All amounts in BGN (лв.) with EUR conversion display
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useMemo = React.useMemo;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useRef = React.useRef;

  // ── Constants ──
    var EUR_BGN = 1.95583;
    var CATEGORY_COLORS = {
      personnel: '#3b82f6',
      equipment: '#f59e0b',
      materials: '#10b981',
      travel: '#8b5cf6',
      publications: '#06b6d4',
      overhead: '#64748b',
      travel_domestic: '#10b981',
      travel_international: '#8b5cf6',
      conferences: '#f59e0b',
      empirical: '#ec4899',
      utility_model: '#6366f1',
      external_reviewers: '#ef4444',
      literature: '#3b82f6',
      data: '#06b6d4',
      editing: '#8b5cf6',
      printing: '#f59e0b',
      translation: '#10b981',
      publications_oa: '#06b6d4',
      publications_scopus: '#3b82f6',
      reviewers_annual: '#ef4444',
      reviewers_final: '#ef4444',
      visual_identity: '#ec4899',
      print_proceedings: '#f59e0b',
      digital_proceedings: '#8b5cf6',
      doi: '#6366f1',
      metadata_databases: '#10b981',
      metadata_bpos: '#06b6d4',
      reviewers: '#ef4444'
    };
    var CATEGORY_ICONS = {
      personnel: 'fa-users',
      equipment: 'fa-laptop',
      materials: 'fa-boxes',
      travel: 'fa-plane',
      publications: 'fa-scroll',
      overhead: 'fa-cogs',
      travel_domestic: 'fa-bus',
      travel_international: 'fa-plane',
      conferences: 'fa-calendar-alt',
      empirical: 'fa-flask',
      utility_model: 'fa-patent',
      external_reviewers: 'fa-user-check',
      literature: 'fa-book',
      data: 'fa-database',
      editing: 'fa-pen-alt',
      printing: 'fa-print',
      translation: 'fa-language',
      publications_oa: 'fa-globe',
      publications_scopus: 'fa-award',
      reviewers_annual: 'fa-user-check',
      reviewers_final: 'fa-user-check',
      visual_identity: 'fa-palette',
      print_proceedings: 'fa-book-open',
      digital_proceedings: 'fa-file-alt',
      doi: 'fa-link',
      metadata_databases: 'fa-server',
      metadata_bpos: 'fa-globe-europe',
      reviewers: 'fa-user-check'
    };
    var CATEGORY_NAMES = {
      personnel: 'Възнаграждения',
      equipment: 'Оборудване',
      materials: 'Материали и консумативи',
      travel: 'Командировки',
      publications: 'Публикации и разпространение на резултати',
      overhead: 'Административни разходи (overhead)',
      travel_domestic: 'Командировки в страната',
      travel_international: 'Командировки в чужбина',
      conferences: 'Такси за конференции и събития',
      empirical: 'Емпирично изследване',
      utility_model: 'Регистрация на полезен модел',
      external_reviewers: 'Външни рецензенти',
      literature: 'Научна литература',
      data: 'Данни и информационни ресурси',
      editing: 'Научна и стилова редакция',
      printing: 'Печат на дисертация',
      translation: 'Превод на публикации',
      publications_oa: 'Публикации в OA списания',
      publications_scopus: 'Публикации Scopus/WoS',
      reviewers_annual: 'Рецензенти годишен отчет',
      reviewers_final: 'Рецензенти финален етап',
      visual_identity: 'Визуална идентичност',
      print_proceedings: 'Издаване на събирник с доклади',
      digital_proceedings: 'Дигитален вариант на събирник',
      doi: 'DOI идентификатори',
      metadata_databases: 'Метаданни в бази данни',
      metadata_bpos: 'Метаданни в BPOS',
      reviewers: 'Рецензенти'
    };
    var CATEGORY_ORDER = ['personnel', 'equipment', 'materials', 'travel', 'publications', 'overhead',
      'travel_domestic', 'travel_international', 'conferences', 'empirical', 'utility_model', 'external_reviewers',
      'literature', 'data', 'editing', 'printing', 'translation', 'publications_oa', 'publications_scopus',
      'reviewers_annual', 'reviewers_final',
      'visual_identity', 'print_proceedings', 'digital_proceedings', 'doi', 'metadata_databases', 'metadata_bpos', 'reviewers'];

  // v3.39.1-perf: Memoized currency formatter for better performance
  var _formatCache = {};
  function formatBgn(amount) {
    var num = Number(amount) || 0;
    var key = String(num);
    if (_formatCache[key]) return _formatCache[key];
    var formatted = num.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' лв.';
    if (Object.keys(_formatCache).length < 100) { // Limit cache size
      _formatCache[key] = formatted;
    }
    return formatted;
  }

  function formatEur(amount) {
    var num = Number(amount) || 0;
    return num.toLocaleString('bg-BG', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
  }

  function formatPct(pct) {
    return (Number(pct) || 0).toFixed(1) + '%';
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SVG Donut Chart Component
  // ═══════════════════════════════════════════════════════════════════
  function BudgetDonutChart(props) {
    var segments = props.segments || [];
    var grandTotal = props.grandTotal || 0;
    var size = 140;
    var cx = size / 2;
    var cy = size / 2;
    var r = 52;
    var sw = 18;
    var circ = 2 * Math.PI * r;

    // Build a screen-reader-friendly description of the chart
    var chartDesc = 'Разпределение на бюджета: общо ' + formatBgn(grandTotal) + ' (' + formatEur(grandTotal / EUR_BGN) + '). ';
    var visibleSegs = segments.filter(function (s) { return (s.percentOfTotal || 0) > 0; });
    if (visibleSegs.length > 0) {
      chartDesc += 'Категории: ' + visibleSegs.map(function (s) {
        return CATEGORY_NAMES[s.code] || s.code + ' — ' + formatPct(s.percentOfTotal || 0);
      }).join(', ') + '.';
    } else {
      chartDesc += 'Няма разпределени средства.';
    }

    if (grandTotal <= 0) {
      return e('svg', {
        width: size, height: size, viewBox: '0 0 ' + size + ' ' + size,
        style: { display: 'block' },
        role: 'img',
        'aria-label': chartDesc,
        focusable: 'false'
      },
        e('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: 'var(--pw-neutral-200)', strokeWidth: sw }),
        e('text', { x: cx, y: cy - 4, textAnchor: 'middle', fontSize: '14', fontWeight: '700', fill: 'var(--pw-neutral-500)' }, '—'),
        e('text', { x: cx, y: cy + 11, textAnchor: 'middle', fontSize: '10', fill: 'var(--pw-neutral-400)' }, 'лв.')
      );
    }

    var grandEur = grandTotal / EUR_BGN;
    var accPct = 0;
    var arcs = [];
    segments.forEach(function (seg, idx) {
      var pct = seg.percentOfTotal / 100;
      if (pct <= 0) return;
      var arcLen = pct * circ;
      var offset = -accPct * circ;
      arcs.push(
        e('circle', {
          key: seg.code || idx,
          cx: cx, cy: cy, r: r,
          fill: 'none',
          stroke: CATEGORY_COLORS[seg.code] || '#64748b',
          strokeWidth: sw,
          strokeDasharray: arcLen + ' ' + (circ - arcLen),
          strokeDashoffset: offset,
          transform: 'rotate(-90 ' + cx + ' ' + cy + ')',
          style: { transition: 'stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease' }
        })
      );
      accPct += pct;
    });

    return e('svg', {
      width: size, height: size, viewBox: '0 0 ' + size + ' ' + size,
      style: { display: 'block' },
      role: 'img',
      'aria-label': chartDesc,
      focusable: 'false'
    },
      e('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: 'var(--pw-neutral-200)', strokeWidth: sw }),
      arcs,
      e('text', { x: cx, y: cy - 5, textAnchor: 'middle', fontSize: '12', fontWeight: '700', fill: 'var(--pw-navy-700)', fontFamily: 'inherit' },
        Math.round(grandEur).toLocaleString('bg-BG')
      ),
      e('text', { x: cx, y: cy + 9, textAnchor: 'middle', fontSize: '9', fill: 'var(--pw-clay-600)', fontFamily: 'inherit' }, '€')
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Budget Progress Bar Component
  // ═══════════════════════════════════════════════════════════════════
  function BudgetProgressBar(props) {
    var pct = Number(props.percent) || 0;
    var capPct = Number(props.capPercent) || 0;
    var isOver = props.isOver || false;
    var color = props.color || '#3b82f6';
    var barWidth = Math.min(pct, capPct > 0 ? capPct * 1.2 : 100);

    // Build accessible description
    var barLabel = 'Използваност ' + formatPct(pct);
    if (capPct > 0) {
      barLabel += ' от ' + formatPct(capPct) + ' лимит';
    }
    if (isOver) {
      barLabel += '. ВНИМАНИЕ: надвишен лимит';
    }

    return e('div', {
      style: { width: '100%', height: 6, background: 'var(--pw-neutral-100)', borderRadius: 3, overflow: 'hidden', position: 'relative' },
      role: 'img',
      'aria-label': barLabel
    },
      // Background cap line
      capPct > 0 ? e('div', {
        style: {
          position: 'absolute', top: 0, left: Math.min(capPct, 100) + '%',
          width: 2, height: '100%', background: isOver ? 'var(--pw-error-600)' : 'var(--pw-clay-400)',
          zIndex: 2, opacity: 0.7
        }
      }) : null,
      // Fill bar
      e('div', {
        style: {
          width: Math.min(barWidth, 100) + '%',
          height: '100%',
          borderRadius: 3,
          background: isOver ? 'var(--pw-error-600)' : color,
          transition: 'width 0.3s ease',
          opacity: pct > 0 ? 1 : 0.3
        }
      })
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  Main Step3Budget Component
  // ═══════════════════════════════════════════════════════════════════
  /**
   * Step 3 — Budget allocation: total budget, per-category amounts with
   * cap validation, donut chart and progress bars.
   * @param {Object} props
   * @param {Object} props.state — step3 state slice ({ total_budget_field, budget_categories })
   * @param {Object} props.validation — { isValid, errors } for step 3
   * @param {Function} props.onFieldChange — (field, value) → dispatch EDIT_FIELD on step 3
   * @param {string} [props.projectType='ФНИ'] — selected project type from step 1
   * @param {Array<{code:string, cap_percent:number}>} [props.budgetRules] — cap rules by project type
   * @param {string|null} [props.proposalId] — draft id
   * @param {Function} [props.onGenerateBudgetSpreadsheet] — export budget to spreadsheet
   * @returns {React.ReactElement}
   */
  function Step3Budget(props) {
      var state = props.state || {};
      var validation = props.validation || { errors: [] };
      var onFieldChange = props.onFieldChange || function () {};
      var projectType = props.projectType || 'ФНИ';
      var budgetRules = props.budgetRules || [];
      var proposalId = props.proposalId;
      var onGenerateBudgetSpreadsheet = props.onGenerateBudgetSpreadsheet;

      // Load budget rules from config if not provided
      var configRules = useMemo(function () {
        var req = global.__BUDGET_RULES__;
        if (req && req[projectType]) {
          return req[projectType].categories.map(function (cat) {
            return { code: cat.key, cap_percent: cat.maxPercent || 0 };
          });
        }
        return [];
      }, [projectType]);

      // Use config rules if props.budgetRules is empty
      if (!budgetRules || budgetRules.length === 0) {
        budgetRules = configRules;
      }

    // ── Local UI state ──
    var _inputMode = useState('exact'); // 'exact' | 'slider'
    var inputMode = _inputMode[0];
    // ── Raw input strings per category (fixes: can't delete after entering number) ──
    var _rawInputs = useState({});
    var rawInputs = _rawInputs[0];
    var setRawInputs = _rawInputs[1];
    function getRawInput(code) {
      return rawInputs[code] !== undefined ? rawInputs[code] : '';
    }
    function setRawInput(code, value) {
      var next = Object.assign({}, rawInputs);
      next[code] = value;
      setRawInputs(next);
    }
    function clearRawInput(code) {
      var next = Object.assign({}, rawInputs);
      delete next[code];
      setRawInputs(next);
    }
    var setInputMode = _inputMode[1];
    var _syncing = useState(false);
    var syncing = _syncing[0];
    var setSyncing = _syncing[1];
    var _synced = useState(false);
    var synced = _synced[0];
    var setSynced = _synced[1];

    var totalBudget = Number(state.total_budget_field) || 0;
    var categories = Array.isArray(state.budget_categories) ? state.budget_categories : [];
    var prevTotalRef = useRef(totalBudget);
    var prevCatRef = useRef(JSON.stringify(categories));

    // ── Accessibility: refs for focus management ──
    var containerRef = useRef(null);
    var totalInputRef = useRef(null);
    var sliderInputRefs = useRef({});
    var _activeCategory = useState(null);
    var activeCategory = _activeCategory[0];
    var setActiveCategory = _activeCategory[1];
    var _announcement = useState('');
    var announcement = _announcement[0];
    var setAnnouncement = _announcement[1];

    // ── Compute cap amounts from rules ──
        var capMap = useMemo(function () {
          var map = {};
          (budgetRules || []).forEach(function (rule) {
            map[rule.code] = (totalBudget * (rule.cap_percent || 0)) / 100;
          });
          return map;
        }, [budgetRules, totalBudget]);

        // Get total cap for current project type from config
        var totalCapEUR = useMemo(function () {
          var req = global.__BUDGET_RULES__;
          if (req && req[projectType] && typeof req[projectType].totalCapEUR === 'number') {
            return req[projectType].totalCapEUR;
          }
          if (req && req[projectType] && typeof req[projectType].totalCapEUR === 'object') {
            // НПФ has object with different caps - return the highest
            return Math.max(
              req[projectType].totalCapEUR.round_table || 0,
              req[projectType].totalCapEUR.scientific_event || 0,
              req[projectType].totalCapEUR.department_event || 0
            );
          }
          return 12000; // default
        }, [projectType]);

    // ── Compute totals ──
    // v3.39.1-perf: Added memoization dependency on budgetRules for cap calculations
    var totals = useMemo(function () {
      var allocated = 0;
      categories.forEach(function (cat) {
        allocated += Number(cat.allocated_amount) || 0;
      });
      return {
        allocated: allocated,
        remaining: totalBudget - allocated,
        total: totalBudget,
        pctUsed: totalBudget > 0 ? (allocated / totalBudget) * 100 : 0
      };
    }, [categories, totalBudget, budgetRules]);

    // ── Category helpers ──
    function getCategoryData(code) {
      return categories.find(function (c) { return c.code === code; });
    }

    function getCapPercent(code) {
      var rule = (budgetRules || []).find(function (r) { return r.code === code; });
      return rule ? rule.cap_percent : 0;
    }

    function getCapAmount(code) {
      return capMap[code] || 0;
    }

    function getAllocated(code) {
      var cat = getCategoryData(code);
      return cat ? Number(cat.allocated_amount) || 0 : 0;
    }

    function isOverCap(code) {
      var allocated = getAllocated(code);
      var cap = getCapAmount(code);
      return cap > 0 && allocated > cap;
    }

    function getPercentOfTotal(code) {
      if (totalBudget <= 0) return 0;
      return (getAllocated(code) / totalBudget) * 100;
    }

    function getPctOfCap(code) {
      var allocated = getAllocated(code);
      var cap = getCapAmount(code);
      if (cap <= 0) return 0;
      return (allocated / cap) * 100;
    }

    // ── Handlers ──
    // v3.39.1-validate: Added budget validation
    function handleTotalChange(value) {
      var newVal = Math.max(0, parseFloat(value) || 0);
      // Warn if new total is less than already allocated
      if (newVal > 0 && totals.allocated > newVal) {
        setAnnouncement('Внимание: новият общ бюджет е по-малък от вече разпределените суми (' + formatBgn(totals.allocated) + ').');
      }
      onFieldChange('total_budget_field', newVal);
      setAnnouncement('Общ бюджет променен на ' + formatBgn(newVal) + '.');
    }

    function handleCategoryAmountChange(code, value) {
      var newVal = Math.max(0, parseFloat(value) || 0);
      var nextCategories = categories.map(function (cat) {
        if (cat.code === code) {
          return Object.assign({}, cat, { allocated_amount: newVal });
        }
        return cat;
      });
      onFieldChange('budget_categories', nextCategories);

      var catName = CATEGORY_NAMES[code] || code;
      var capPct = getCapPercent(code);
      var capAmt = getCapAmount(code);
      var over = newVal > capAmt && capAmt > 0;
      var msg = catName + ' променен на ' + formatBgn(newVal) + '. ';
      if (capPct > 0) {
        msg += 'Лимит: ' + capPct + '% (' + formatBgn(capAmt) + '). ';
        if (over) msg += 'ВНИМАНИЕ: над лимита!';
      }
      setAnnouncement(msg);
    }

    // ── Keyboard navigation for budget sliders ──
    function handleSliderKeyDown(code, ev) {
      var allocated = getAllocated(code);
      var cap = getCapAmount(code);
      var step = 100;
      var newAmount = allocated;

      if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        newAmount = Math.min(allocated + step, totalBudget);
        handleCategoryAmountChange(code, newAmount);
      } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        newAmount = Math.max(0, allocated - step);
        handleCategoryAmountChange(code, newAmount);
      } else if (ev.key === 'PageUp') {
        ev.preventDefault();
        newAmount = Math.min(allocated + 1000, totalBudget);
        handleCategoryAmountChange(code, newAmount);
      } else if (ev.key === 'PageDown') {
        ev.preventDefault();
        newAmount = Math.max(0, allocated - 1000);
        handleCategoryAmountChange(code, newAmount);
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        handleCategoryAmountChange(code, 0);
      } else if (ev.key === 'End') {
        ev.preventDefault();
        var maxAllowed = cap > 0 ? Math.min(cap, totalBudget) : totalBudget;
        handleCategoryAmountChange(code, maxAllowed);
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        setInputMode('exact');
        setActiveCategory(code);
        var input = sliderInputRefs.current[code];
        if (input) input.focus();
      }
    }

    // ── Keyboard shortcuts for category navigation (1-6 keys) ──
    function handleContainerKeyDown(ev) {
      var key = ev.key;
      var idx = parseInt(key, 10) - 1;
      if (idx >= 0 && idx < CATEGORY_ORDER.length) {
        var code = CATEGORY_ORDER[idx];
        ev.preventDefault();
        setActiveCategory(code);
        var input = sliderInputRefs.current[code];
        if (input) {
          input.focus();
        }
        setAnnouncement('Фокус върху категория: ' + (CATEGORY_NAMES[code] || code) + '. Натиснете Enter за промяна.');
      }
      if (key === 't' || key === 'T') {
        if (ev.target !== totalInputRef.current) {
          ev.preventDefault();
          if (totalInputRef.current) totalInputRef.current.focus();
        }
      }
      if (key === 'm' || key === 'M') {
        ev.preventDefault();
        toggleInputMode();
      }
      if (key === 'c' || key === 'C') {
        ev.preventDefault();
        var summary = 'Разпределено: ' + formatBgn(totals.allocated) + 
                      '. Оставащо: ' + formatBgn(totals.remaining) + 
                      '. От общо: ' + formatBgn(totals.total) + '.';
        setAnnouncement(summary);
      }
      // v3.39.1-keyboard: Added 'r' key for quick reset of current category
      if (key === 'r' || key === 'R') {
        if (activeCategory) {
          ev.preventDefault();
          var cat = getCategoryData(activeCategory);
          if (cat) {
            handleCategoryAmountChange(activeCategory, 0);
            setAnnouncement('Категория ' + (CATEGORY_NAMES[activeCategory] || activeCategory) + ' нулирана.');
          }
        }
      }
      if (key === 'Escape') {
        setActiveCategory(null);
      }
    }

    // ── Input mode toggle with focus management ──
    function toggleInputMode() {
      var newMode = inputMode === 'exact' ? 'slider' : 'exact';
      setInputMode(newMode);
      setAnnouncement('Режим на въвеждане сменен на ' + (newMode === 'slider' ? 'плъзгач' : 'точна стойност') + '.');
      if (newMode === 'slider' && activeCategory) {
        var input = sliderInputRefs.current[activeCategory];
        if (input) input.focus();
      }
    }

    // ── Quick allocation: distribute remaining budget proportionally ──
    function handleQuickAllocate() {
      if (totalBudget <= 0) return;
      var editableCategories = CATEGORY_ORDER.filter(function (c) { return c !== 'overhead'; });
      var totalEditable = editableCategories.length;
      if (totalEditable === 0) return;
      var overheadCapPct = getCapPercent('overhead') || 10;
      var overheadAmount = (totalBudget * overheadCapPct) / 100;
      var remainingForEditable = totalBudget - overheadAmount;
      var baseShare = remainingForEditable / totalEditable;

      var nextCategories = categories.map(function (cat) {
        if (cat.code === 'overhead') {
          return Object.assign({}, cat, { allocated_amount: Math.round(overheadAmount * 100) / 100 });
        }
        return Object.assign({}, cat, { allocated_amount: Math.round(baseShare * 100) / 100 });
      });
      // Ensure all categories exist
      CATEGORY_ORDER.forEach(function (code) {
        if (!nextCategories.some(function (c) { return c.code === code; })) {
          var capPct = getCapPercent(code);
          nextCategories.push({
            code: code,
            allocated_amount: code === 'overhead' ? Math.round(overheadAmount * 100) / 100 : Math.round(baseShare * 100) / 100
          });
        }
      });
      onFieldChange('budget_categories', nextCategories);
    }

    // ── Auto-sync budget spreadsheet when data changes ──
    useEffect(function () {
      var totalChanged = prevTotalRef.current !== totalBudget;
      var catsChanged = prevCatRef.current !== JSON.stringify(categories);
      prevTotalRef.current = totalBudget;
      prevCatRef.current = JSON.stringify(categories);

      if ((totalChanged || catsChanged) && totalBudget > 0 && !synced && !syncing) {
        if (typeof onGenerateBudgetSpreadsheet === 'function') {
          setSyncing(true);
          var timer = setTimeout(function () {
            onGenerateBudgetSpreadsheet().then(function (res) {
              if (res && res.success) { setSynced(true); }
              setSyncing(false);
            }).catch(function () { setSyncing(false); });
          }, 2000);
          return function () { clearTimeout(timer); };
        }
      }
    }, [totalBudget, categories, synced, syncing, onGenerateBudgetSpreadsheet]);

    // ── Cleanup announcement on unmount ──
    useEffect(function () {
      return function cleanup() {
        setAnnouncement('');
      };
    }, []);

    // ── Build category rows ──
    var categoryRows = CATEGORY_ORDER.map(function (code) {
      var capPct = getCapPercent(code);
      var capAmt = getCapAmount(code);
      var allocated = getAllocated(code);
      var pctOfTotal = getPercentOfTotal(code);
      var pctOfCap = getPctOfCap(code);
      var over = isOverCap(code);
      var isOverhead = code === 'overhead';

      return {
        code: code,
        name: CATEGORY_NAMES[code] || code,
        icon: CATEGORY_ICONS[code] || 'fa-file',
        color: CATEGORY_COLORS[code] || '#64748b',
        allocated: allocated,
        capPercent: capPct,
        capAmount: capAmt,
        percentOfTotal: pctOfTotal,
        pctOfCap: pctOfCap,
        isOverCap: over,
        isOverhead: isOverhead,
        autoValue: isOverhead ? capAmt : null
      };
    });

    // ── Cap violations ──
    var capViolations = [];
    categoryRows.forEach(function (row) {
      if (row.isOverCap && !row.isOverhead) {
        capViolations.push({
          code: row.code,
          name: row.name,
          capPercent: row.capPercent,
          capAmount: row.capAmount
        });
      }
    });

    // ── Render ──
    return e('div', { className: 'pw-step3', ref: containerRef, onKeyDown: handleContainerKeyDown, tabIndex: -1 },

      // aria-live region for budget change announcements
      e('div', {
        id: 'pw-budget-live-region',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        style: { position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }
      }, announcement),

      // ═══════════════════════════════════════════════════════════
      // HEADER: Project type badge + budget mode + auto-sync status
      // ═══════════════════════════════════════════════════════════
      e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          e('span', { style: { fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--pw-navy-700)', padding: '3px 10px', borderRadius: 'var(--pw-radius-pill)' }, 'aria-label': 'Тип проект: ' + projectType }, projectType),
          syncing
            ? e('span', { style: { fontSize: 11, color: 'var(--pw-navy-500)', display: 'flex', alignItems: 'center', gap: 4 }, 'aria-live': 'polite' },
                e('i', { className: 'fas fa-spinner fa-pulse', style: { fontSize: 10 } }), 'Синхронизация с таблица…')
            : synced
              ? e('span', { style: { fontSize: 11, color: 'var(--pw-success-600)', display: 'flex', alignItems: 'center', gap: 4 }, 'aria-live': 'polite' },
                  e('i', { className: 'fas fa-check-circle', style: { fontSize: 10 } }), 'Бюджетът е синхронизиран')
              : null
        ),
        // Mode toggle
        e('div', { style: { display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--pw-neutral-200)' } },
          e('button', {
            type: 'button',
            onClick: function () { setInputMode('exact'); },
            'aria-pressed': inputMode === 'exact' ? 'true' : 'false',
            'aria-label': 'Режим: Точни суми (натисни M за превключване)',
            title: 'Натисни M за превключване между плъзгач и точна стойност',
            style: {
              padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none',
              cursor: 'pointer',
              background: inputMode === 'exact' ? 'var(--pw-navy-700)' : 'transparent',
              color: inputMode === 'exact' ? '#fff' : 'var(--pw-neutral-500)',
              transition: 'all 0.15s'
            }
          }, e('i', { className: 'fas fa-keyboard', style: { marginRight: 4 } }), 'Точни суми'),
          e('button', {
            type: 'button',
            onClick: function () { setInputMode('slider'); },
            'aria-pressed': inputMode === 'slider' ? 'true' : 'false',
            'aria-label': 'Режим: Слайдер (натисни M за превключване)',
            title: 'Натисни M за превключване между плъзгач и точна стойност',
            style: {
              padding: '4px 12px', fontSize: 12, fontWeight: 600, border: 'none',
              borderLeft: '1px solid var(--pw-neutral-200)',
              cursor: 'pointer',
              background: inputMode === 'slider' ? 'var(--pw-navy-700)' : 'transparent',
              color: inputMode === 'slider' ? '#fff' : 'var(--pw-neutral-500)',
              transition: 'all 0.15s'
            }
          }, e('i', { className: 'fas fa-sliders-h', style: { marginRight: 4 } }), 'Слайдер')
        )
      ),

      // ═══════════════════════════════════════════════════════════
      // DONUT CHART + TOTAL BUDGET SIDE-BY-SIDE
      // ═══════════════════════════════════════════════════════════
      e('div', { style: { display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 20 } },
        // Donut
        e('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }, 'aria-label': 'Визуализация на разпределението на бюджета' },
          e(BudgetDonutChart, { segments: categoryRows, grandTotal: totals.total }),
          // Legend (small)
          e('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, width: 140 } },
            categoryRows.filter(function (r) { return r.percentOfTotal > 0; }).slice(0, 5).map(function (r) {
              return e('div', { key: r.code, style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }, 'aria-label': r.name + ': ' + r.percentOfTotal.toFixed(0) + '%' },
                e('div', { style: { width: 7, height: 7, borderRadius: 2, background: r.color, flexShrink: 0 } }),
                e('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--pw-neutral-500)' } }, r.name.slice(0, 18)),
                e('span', { style: { fontWeight: 600, color: 'var(--pw-neutral-700)' } }, r.percentOfTotal.toFixed(0) + '%')
              );
            })
          )
        ),

        // Total budget + quick summary
        e('div', { style: { flex: '1 1 260px', minWidth: 220 } },
          // Total budget field
          e('div', { className: 'pw-field', style: { marginBottom: 12 } },
            e('label', { className: 'pw-field-label', htmlFor: 'pw-total-budget' },
              'Обща стойност на проекта', e('span', { className: 'pw-required' }, '*')
            ),
            e('div', { className: 'pw-input-currency' },
              e('input', {
                id: 'pw-total-budget',
                ref: totalInputRef,
                className: 'pw-input',
                type: 'text', inputMode: 'decimal',
                value: getRawInput('__total__') !== '' ? getRawInput('__total__') : (totalBudget || ''),
                onChange: function (ev) {
                  var raw = ev.target.value;
                  if (/^[0-9]*\.?[0-9]*$/.test(raw)) {
                    setRawInput('__total__', raw);
                    var parsed = parseFloat(raw);
                    if (!isNaN(parsed)) {
                      handleTotalChange(parsed);
                    } else if (raw === '' || raw === '.') {
                      handleTotalChange(0);
                    }
                  }
                },
                onBlur: function () {
                  var parsed = parseFloat(getRawInput('__total__'));
                  if (isNaN(parsed) || getRawInput('__total__') === '') {
                    clearRawInput('__total__');
                  } else {
                    setRawInput('__total__', String(parsed));
                  }
                },
                onFocus: function () {
                  if (totalInputRef.current) totalInputRef.current.select();
                },
                placeholder: '0.00',
                'aria-required': 'true',
                'aria-describedby': 'pw-total-budget-help',
                'aria-invalid': validation.errors && validation.errors.some(function (e) { return e.field === 'total_budget_field'; }) ? 'true' : 'false',
                autoComplete: 'off',
                style: { fontWeight: 700, fontSize: 16 }
              })
            ),
            totalBudget > 0 ? e('div', { id: 'pw-total-budget-help', style: { fontSize: 11, color: 'var(--pw-neutral-500)', marginTop: 2 } },
              '≈ ' + formatEur(totalBudget / EUR_BGN)
            ) : null,
            validation.errors && validation.errors.filter(function (e) { return e.field === 'total_budget_field'; }).length > 0
              ? validation.errors.filter(function (e) { return e.field === 'total_budget_field'; }).map(function (err, idx) {
                  return e('div', { key: idx, className: 'pw-field-error' }, err.message_bg);
                })
              : null
          ),

          // Quick summary cards
          e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
            e('div', { style: { padding: '8px 12px', background: 'var(--pw-navy-50)', borderRadius: 'var(--pw-radius-sm)', border: '1px solid var(--pw-navy-100)' }, 'aria-label': 'Разпределено: ' + formatBgn(totals.allocated) + ', ' + formatPct(totals.pctUsed) + ' от бюджета' },
              e('div', { style: { fontSize: 10, color: 'var(--pw-navy-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' } }, 'Разпределено'),
              e('div', { style: { fontSize: 16, fontWeight: 700, color: 'var(--pw-navy-700)', fontVariantNumeric: 'tabular-nums' } }, formatBgn(totals.allocated)),
              e('div', { style: { fontSize: 11, color: 'var(--pw-neutral-500)' } }, formatPct(totals.pctUsed) + ' от бюджета')
            ),
            e('div', { style: { padding: '8px 12px', background: totals.remaining >= 0 ? 'var(--pw-success-100)' : 'var(--pw-error-100)', borderRadius: 'var(--pw-radius-sm)', border: '1px solid ' + (totals.remaining >= 0 ? 'var(--pw-success-100)' : 'var(--pw-error-100)') }, 'aria-label': totals.remaining >= 0 ? 'Оставащо: ' + formatBgn(totals.remaining) : 'Надвишаване: ' + formatBgn(Math.abs(totals.remaining)) },
              e('div', { style: { fontSize: 10, color: totals.remaining >= 0 ? 'var(--pw-success-600)' : 'var(--pw-error-600)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' } }, totals.remaining >= 0 ? 'Остава' : 'Надвишаване'),
              e('div', { style: { fontSize: 16, fontWeight: 700, color: totals.remaining >= 0 ? 'var(--pw-success-600)' : 'var(--pw-error-600)', fontVariantNumeric: 'tabular-nums' } },
                (totals.remaining >= 0 ? '' : '-') + formatBgn(Math.abs(totals.remaining))
              ),
              e('div', { style: { fontSize: 11, color: totals.remaining >= 0 ? 'var(--pw-success-600)' : 'var(--pw-error-600)' } },
                totals.remaining >= 0 ? 'Свободен бюджет' : 'Надвишава с ' + formatPct(Math.abs(100 - totals.pctUsed))
              )
            )
          ),

          // Quick allocate button
          totalBudget > 0 && totals.allocated <= 0 ? e('button', {
            type: 'button',
            className: 'pw-btn pw-btn-sm pw-btn-secondary',
            onClick: handleQuickAllocate,
            'aria-label': 'Разпредели бюджета пропорционално по категории',
            style: { marginTop: 8, width: '100%', justifyContent: 'center' }
          },
            e('i', { className: 'fas fa-magic', style: { fontSize: 11 } }),
            ' Разпредели пропорционално'
          ) : null,

          // ═══════════════════════════════════════════════════════════
          // T40/T41: Budget Template Selector + Live Calculation Summary
          // ═══════════════════════════════════════════════════════════
          (function () {
            var templates = (global.__BUDGET_TEMPLATES__ && global.__BUDGET_TEMPLATES__[projectType]) || [];
            if (templates.length === 0) return null;
            return e('div', { style: { marginTop: 12, padding: '8px 12px', background: 'var(--pw-navy-50)', borderRadius: 'var(--pw-radius-sm)', border: '1px solid var(--pw-navy-100)' } },
              e('div', { style: { fontSize: 10, fontWeight: 600, color: 'var(--pw-navy-500)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 } }, 'Шаблони за бюджет'),
              e('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
                templates.map(function (tpl) {
                  return e('button', {
                    key: tpl.id,
                    type: 'button',
                    className: 'pw-btn pw-btn-sm',
                    title: tpl.description,
                    onClick: function () {
                      if (global.__applyBudgetTemplate__ && onFieldChange) {
                        var cats = global.__applyBudgetTemplate__(tpl, totalBudget);
                        if (cats.length > 0) {
                          onFieldChange('budget_categories', cats);
                          setAnnouncement('Шаблон "' + tpl.name + '" приложен към бюджет от ' + formatBgn(totalBudget) + '.');
                        }
                      }
                    },
                    style: { fontSize: 11, padding: '3px 8px', background: 'var(--pw-surface)', border: '1px solid var(--pw-navy-200)', borderRadius: 4 }
                  }, tpl.name.length > 20 ? tpl.name.slice(0, 18) + '…' : tpl.name);
                })
              )
            );
          })(),

          // T41: Live calculation indicator
          totalBudget > 0 ? e('div', { style: { marginTop: 8, padding: '6px 12px', background: totals.remaining >= 0 ? 'var(--pw-success-100)' : 'var(--pw-error-100)', borderRadius: 'var(--pw-radius-sm)', display: 'flex', alignItems: 'center', gap: 6 }, 'aria-live': 'polite' },
            e('i', { className: 'fas fa-calculator', style: { fontSize: 10, color: totals.remaining >= 0 ? 'var(--pw-success-600)' : 'var(--pw-error-600)' } }),
            e('span', { style: { fontSize: 11, fontWeight: 600, color: totals.remaining >= 0 ? 'var(--pw-success-600)' : 'var(--pw-error-600)' } },
              'Актуално: ' + formatBgn(totals.allocated) + ' разпределено от ' + formatBgn(totalBudget) + ' (' + formatPct(totals.pctUsed) + ')'
            )
          ) : null
        )
      ),

      // ═══════════════════════════════════════════════════════════
      // CATEGORY CARDS
      // ═══════════════════════════════════════════════════════════
      e('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },

        // Header row
        e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 130px 80px 100px', gap: 12, padding: '4px 16px', fontWeight: 600, fontSize: 11, color: 'var(--pw-neutral-500)', textTransform: 'uppercase', letterSpacing: '0.03em' }, role: 'row' },
          e('span', { role: 'columnheader' }, 'Категория разход'),
          e('span', { role: 'columnheader', style: { textAlign: 'right' } }, inputMode === 'slider' ? 'Плъзгач' : 'Сума'),
          e('span', { role: 'columnheader', style: { textAlign: 'right' } }, '% от общо'),
          e('span', { role: 'columnheader' }, 'Лимит')
        ),

        categoryRows.map(function (row) {
          var barColor = row.isOverCap ? 'var(--pw-error-600)' : row.color;
          var cardBorderColor = row.isOverCap ? 'var(--pw-error-600)' : 'var(--pw-neutral-200)';
          var cardBg = row.isOverCap ? 'var(--pw-error-100)' : row.isOverhead ? 'var(--pw-neutral-50)' : 'var(--pw-surface)';

          return e('div', {
            key: row.code,
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 130px 80px 100px',
              gap: 12,
              alignItems: 'center',
              padding: '10px 16px',
              background: cardBg,
              border: '1px solid ' + cardBorderColor,
              borderRadius: 'var(--pw-radius-sm)',
              transition: 'border-color 0.15s ease, background 0.15s ease'
            },
            role: 'row',
            'aria-label': row.name + ': ' + formatBgn(row.allocated) + ' (' + formatPct(row.percentOfTotal) + ')'
          },
            // ── Category name + progress bar ──
            e('div', { style: { minWidth: 0 }, 'aria-label': row.name + (row.isOverCap ? ' — ВНИМАНИЕ: над лимита' : '') },
              e('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
                e('i', { className: 'fas ' + row.icon, style: { color: barColor, fontSize: 12, width: 16, textAlign: 'center' } }),
                e('span', { style: { fontSize: 13, fontWeight: 500, color: row.isOverCap ? 'var(--pw-error-600)' : 'var(--pw-neutral-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, 'aria-label': row.name },
                  row.name
                ),
                row.isOverhead ? e('span', { style: { fontSize: 10, color: 'var(--pw-neutral-500)', background: 'var(--pw-neutral-100)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 } }, 'auto') : null
              ),
              // Progress bar showing cap usage
              e(BudgetProgressBar, {
                percent: row.percentOfTotal,
                capPercent: row.capPercent,
                isOver: row.isOverCap,
                color: barColor
              }),
              // % label under bar
              e('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--pw-neutral-400)', marginTop: 2 } },
                e('span', null, formatPct(row.percentOfTotal)),
                row.capPercent > 0 ? e('span', null, 'лимит ' + row.capPercent + '%') : null
              )
            ),

            // ── Amount input (slider or exact) ──
            row.isOverhead
              ? e('div', { style: { textAlign: 'right', fontSize: 14, fontWeight: 600, color: 'var(--pw-neutral-500)', fontVariantNumeric: 'tabular-nums' }, 'aria-label': row.name + ' автоматична стойност: ' + formatBgn(row.autoValue !== null ? row.autoValue : row.allocated) },
                  row.autoValue !== null ? formatBgn(row.autoValue) : formatBgn(row.allocated)
                )
              : inputMode === 'slider'
                ? e('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                    e('input', {
                      type: 'range',
                      min: 0,
                      max: Math.max(totalBudget, row.allocated) || 100000,
                      step: 10,
                      value: Math.round(row.allocated),
                      onChange: function (ev) { handleCategoryAmountChange(row.code, Number(ev.target.value)); },
                      onKeyDown: function (ev) { handleSliderKeyDown(row.code, ev); },
                      ref: function (el) { sliderInputRefs.current[row.code] = el; },
                      'aria-label': row.name + ' плъзгач: ' + formatBgn(row.allocated) + ' от ' + formatBgn(totalBudget),
                      'aria-valuenow': row.allocated,
                      'aria-valuemin': 0,
                      'aria-valuemax': totalBudget,
                      'aria-valuetext': formatBgn(row.allocated),
                      style: { flex: 1, accentColor: barColor, height: 4, cursor: 'pointer' }
                    }),
                    e('span', { style: { fontSize: 11, color: 'var(--pw-neutral-500)', minWidth: 40, textAlign: 'right', flexShrink: 0 } },
                      Math.round(row.allocated).toLocaleString('bg-BG') + ' лв.'
                    )
                  )
                : e('div', { className: 'pw-input-currency', style: { width: '100%' } },
                    e('input', {
                      className: 'pw-input' + (row.isOverCap ? ' pw-has-error' : ''),
                      type: 'text', inputMode: 'decimal',
                      value: getRawInput(row.code) !== '' ? getRawInput(row.code) : (row.allocated || ''),
                      onChange: function (ev) {
                        var raw = ev.target.value;
                        // Allow empty, digits, and one decimal point
                        if (/^[0-9]*\.?[0-9]*$/.test(raw)) {
                          setRawInput(row.code, raw);
                          var parsed = parseFloat(raw);
                          if (!isNaN(parsed)) {
                            handleCategoryAmountChange(row.code, parsed);
                          } else if (raw === '' || raw === '.') {
                            handleCategoryAmountChange(row.code, 0);
                          }
                        }
                      },
                      onBlur: function () {
                        // On blur, sync the raw input with the parsed value
                        var parsed = parseFloat(getRawInput(row.code));
                        if (isNaN(parsed) || getRawInput(row.code) === '') {
                          clearRawInput(row.code);
                        } else {
                          setRawInput(row.code, String(parsed));
                        }
                      },
                      onFocus: function () {
                        // On focus, select all text for easy editing
                        var input = sliderInputRefs.current[row.code];
                        if (input) input.select();
                      },
                      onKeyDown: function (ev) { handleSliderKeyDown(row.code, ev); },
                      ref: function (el) { sliderInputRefs.current[row.code] = el; },
                      'aria-label': row.name + ' сума: ' + formatBgn(row.allocated),
                      'aria-invalid': row.isOverCap ? 'true' : 'false',
                      'aria-valuenow': row.allocated,
                      'aria-valuemin': 0,
                      'aria-valuemax': totalBudget,
                      'aria-valuetext': formatBgn(row.allocated),
                      autoComplete: 'off',
                      style: { textAlign: 'right', paddingRight: 40, fontWeight: 600 }
                    })
                  ),

            // ── % of total ──
            e('div', { style: { textAlign: 'right', fontSize: 14, fontWeight: 600, color: row.isOverCap ? 'var(--pw-error-600)' : 'var(--pw-neutral-700)', fontVariantNumeric: 'tabular-nums' }, 'aria-label': formatPct(row.percentOfTotal) + ' от общо' },
              formatPct(row.percentOfTotal)
            ),

            // ── Cap badge ──
            e('div', null,
              e('span', {
                style: {
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 10, fontWeight: 600,
                  color: row.isOverCap ? '#fff' : 'var(--pw-neutral-500)',
                  background: row.isOverCap ? 'var(--pw-error-600)' : 'var(--pw-neutral-100)',
                  padding: '2px 8px', borderRadius: 'var(--pw-radius-pill)',
                  whiteSpace: 'nowrap'
                },
                'aria-label': row.isOverCap ? 'ВНИМАНИЕ: над лимита! ' + row.capPercent + '% (' + (row.capAmount > 0 ? formatBgn(row.capAmount) : '—') + ')' : 'Лимит: ' + row.capPercent + '% (' + (row.capAmount > 0 ? formatBgn(row.capAmount) : '—') + ')'
              },
                row.isOverCap ? '⚠ ' : '',
                row.capPercent + '% (' + (row.capAmount > 0 ? formatBgn(row.capAmount) : '—') + ')'
              )
            )
          );
        })
      ),

      // ═══════════════════════════════════════════════════════════
      // CAP VIOLATIONS
      // ═══════════════════════════════════════════════════════════
      capViolations.length > 0
        ? e('div', { className: 'pw-validation-summary', style: { marginTop: 12 }, role: 'alert', 'aria-live': 'assertive' },
            e('div', { className: 'pw-validation-summary-title' }, '⚠ Надвишени бюджетни лимити'),
            capViolations.map(function (v, idx) {
              return e('div', { key: idx, className: 'pw-validation-summary-item' },
                '"' + v.name + '" (' + formatPct(v.capPercent) + ' лимит = ' + formatBgn(v.capAmount) + ') за ' + projectType
              );
            })
          )
        : null,

      // ═══════════════════════════════════════════════════════════
      // RUNNING TOTAL FOOTER
      // ═══════════════════════════════════════════════════════════
      e('div', { style: { marginTop: 16, padding: '12px 16px', background: 'var(--pw-neutral-50)', border: '1px solid var(--pw-neutral-200)', borderRadius: 'var(--pw-radius-sm)' }, role: 'region', 'aria-label': 'Обобщение на бюджета' },
        // Overall budget usage bar
        totalBudget > 0 ? e('div', { style: { marginBottom: 10 } },
          e(BudgetProgressBar, {
            percent: totals.pctUsed,
            capPercent: 100,
            isOver: totals.remaining < 0,
            color: totals.remaining < 0 ? 'var(--pw-error-600)' : 'var(--pw-navy-700)'
          }),
          e('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--pw-neutral-500)', marginTop: 2 } },
            e('span', null, 'Използвано: ' + formatPct(totals.pctUsed)),
            e('span', null, 'Бюджет: ' + formatBgn(totals.total))
          )
        ) : null,

        // Summary items
        e('div', { style: { display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' } },
          e('div', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 } },
            e('span', { style: { color: 'var(--pw-neutral-500)' } }, 'Разпределено:'),
            e('span', { style: { fontWeight: 700, color: 'var(--pw-navy-700)', fontVariantNumeric: 'tabular-nums' }, 'aria-label': 'Разпределено: ' + formatBgn(totals.allocated) }, formatBgn(totals.allocated))
          ),
          e('div', { style: { width: 1, height: 18, background: 'var(--pw-neutral-200)' } }),
          e('div', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 } },
            e('span', { style: { color: 'var(--pw-neutral-500)' } }, totals.remaining >= 0 ? 'Остава:' : 'Надвишаване:'),
            e('span', {
              style: {
                fontWeight: 700,
                color: totals.remaining < 0 ? 'var(--pw-error-600)' : 'var(--pw-success-600)',
                fontVariantNumeric: 'tabular-nums'
              },
              'aria-label': totals.remaining >= 0 ? 'Остава: ' + formatBgn(totals.remaining) : 'Надвишаване: ' + formatBgn(Math.abs(totals.remaining))
            }, (totals.remaining < 0 ? '- ' : '') + formatBgn(Math.abs(totals.remaining)))
          ),
          e('div', { style: { width: 1, height: 18, background: 'var(--pw-neutral-200)' } }),
          e('div', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 } },
            e('span', { style: { color: 'var(--pw-neutral-500)' } }, 'Общ бюджет:'),
            e('span', { style: { fontWeight: 700, color: 'var(--pw-navy-700)', fontVariantNumeric: 'tabular-nums' }, 'aria-label': 'Общ бюджет: ' + formatBgn(totals.total) }, formatBgn(totals.total)),
            e('span', { style: { fontSize: 11, color: 'var(--pw-neutral-500)' } }, '(' + formatEur(totals.total / EUR_BGN) + ')')
          )
        )
      ),

      // Validation error messages
      validation.errors && validation.errors.length > 0
        ? e('div', { className: 'pw-validation-summary', style: { marginTop: 12 }, role: 'alert', 'aria-live': 'assertive' },
            validation.errors.map(function (err, idx) {
              return e('div', { key: idx, className: 'pw-validation-summary-item' }, err.message_bg);
            })
          )
        : null
    );
  }

  global.__pwStep3Budget = React.memo(Step3Budget);

})(window);
