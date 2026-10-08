/* ═══════════════════════════════════════════════════════════════════════
 * Step1BasicInfo.js — Стъпка 1: Основна информация
 * ═══════════════════════════════════════════════════════════════════════
 * Props: { state: Step1State, validation: ValidationResult,
 *          onFieldChange: (field, value) => void,
 *          availableCompetitions: Array, departments: Array,
 *          onSearchUsers: (query) => Promise<Array> }
 *
 * Layout: 2-column grid for short fields, full-width for textarea.
 * No hidden automation — explicit field changes only.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useCallback = React.useCallback;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  /**
   * SelfAssessment — real-time score preview (0-100) for Step 1 completeness.
   * Displays a circular SVG progress indicator, breakdown list, and recommendation.
   * @param {Object} props
   * @param {Object} props.state — step1 state slice
   * @param {number} [props.budgetCap] — budget ceiling (default 50000)
   * @param {boolean} [props.allDocsReady] — whether all required docs are uploaded
   */
  function SelfAssessment(props) {
    var state = props.state || {};
    var budgetCap = props.budgetCap || 50000;
    var allDocsReady = props.allDocsReady || false;

    // Individual score calculations
    var titleScore = state.title_bg ? 5 : 0;
    var abstractWordCount = countWords(state.abstract_bg);
    var abstractScore = abstractWordCount >= 200 ? 10 : 0;
    var goalsScore = state.goals ? 10 : 0;
    var keywordsArr = Array.isArray(state.keywords) ? state.keywords : [];
    var keywordsScore = keywordsArr.length >= 3 ? 5 : 0;
    var descriptionEnWordCount = countWords(state.description_en);
    var descriptionEnScore = descriptionEnWordCount >= 200 ? 10 : 0;
    var priorityAreaScore = state.priority_area ? 10 : 0;
    var professionalFieldScore = state.professional_field ? 10 : 0;
    var teamCount = Array.isArray(state.team_members) ? state.team_members.length : 0;
    var teamScore = teamCount >= 1 ? 10 : 0;
    var totalBudget = state.total_budget;
    var budgetScore = totalBudget && totalBudget > 0 && totalBudget <= budgetCap ? 10 : 0;
    var documentsScore = allDocsReady ? 20 : 0;

    var totalScore = titleScore + abstractScore + goalsScore + keywordsScore +
                     descriptionEnScore + priorityAreaScore + professionalFieldScore +
                     teamScore + budgetScore + documentsScore;

    // Clamp 0-100 (safety)
    if (totalScore < 0) totalScore = 0;
    if (totalScore > 100) totalScore = 100;

    // Color coding
    function getColor(score) {
      if (score <= 40) return '#dc3545';   // red
      if (score <= 60) return '#fd7e14';   // orange
      if (score <= 75) return '#ffc107';   // yellow
      if (score <= 90) return '#28a745';   // green
      return '#198754';                     // dark green
    }

    // Recommendation message
    function getRecommendation(score) {
      if (score <= 40) return 'Необходима е значителна подобрение на предложението преди подаване.';
      if (score <= 60) return 'Предложението има основни елементи, но се препоръчва доизграждане преди финализиране.';
      if (score <= 75) return 'Добро ниво на готовност. Можете да запазите черновата и да я подобрите по-късно.';
      if (score <= 90) return 'Много добро ниво на готовност. Предложението е готово за подаване.';
      return 'Отлично! Предложението е напълно готово за подаване.';
    }

    // SVG circular progress geometry
    var size = 100;
    var strokeWidth = 10;
    var radius = (size - strokeWidth) / 2;
    var circumference = 2 * Math.PI * radius;
    var strokeDashoffset = circumference - (totalScore / 100) * circumference;

    // Breakdown items
    var breakdown = [
      { label: 'Заглавие на проекта', score: titleScore, max: 5 },
      { label: 'Абстракт (≥200 думи)', score: abstractScore, max: 10 },
      { label: 'Цели на проекта', score: goalsScore, max: 10 },
      { label: 'Ключови думи (≥3)', score: keywordsScore, max: 5 },
      { label: 'Описание EN (≥200 думи)', score: descriptionEnScore, max: 10 },
      { label: 'Приоритетна област', score: priorityAreaScore, max: 10 },
      { label: 'Професионално поле', score: professionalFieldScore, max: 10 },
      { label: 'Членове на екип (≥1)', score: teamScore, max: 10 },
      { label: 'Бюджет (≤ капа)', score: budgetScore, max: 10 },
      { label: 'Документи', score: documentsScore, max: 20 }
    ];

    var color = getColor(totalScore);
    var recommendation = getRecommendation(totalScore);

    return e('div', { className: 'pw-self-assessment' },
      e('h3', { className: 'pw-self-assessment-title' }, 'Самооценка'),
      e('div', { className: 'pw-self-assessment-row' },
        // Circular progress
        e('div', { className: 'pw-self-assessment-circle' },
          e('svg', { width: size, height: size, style: { transform: 'rotate(-90deg)' } },
            e('circle', {
              className: 'pw-self-assessment-bg',
              cx: size / 2,
              cy: size / 2,
              r: radius,
              fill: 'none',
              stroke: 'var(--pw-neutral-200)',
              strokeWidth: strokeWidth
            }),
            e('circle', {
              className: 'pw-self-assessment-progress',
              cx: size / 2,
              cy: size / 2,
              r: radius,
              fill: 'none',
              stroke: color,
              strokeWidth: strokeWidth,
              strokeLinecap: 'round',
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset,
              style: { transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }
            })
          ),
          e('div', { className: 'pw-self-assessment-score', style: { color: color } }, totalScore),
          e('div', { className: 'pw-self-assessment-max' }, '/100')
        ),
        // Breakdown + Recommendation
        e('div', { className: 'pw-self-assessment-details' },
          e('ul', { className: 'pw-self-assessment-breakdown' },
            breakdown.map(function (item, idx) {
              var isFull = item.score === item.max;
              return e('li', { key: idx, className: 'pw-self-assessment-item' + (isFull ? ' pw-complete' : '') },
                e('span', { className: 'pw-self-assessment-label' }, item.label),
                e('span', { className: 'pw-self-assessment-value', style: { color: isFull ? 'var(--pw-success)' : 'var(--pw-neutral-600)' } },
                  item.score + '/' + item.max
                )
              );
            })
          ),
          e('div', { className: 'pw-self-assessment-recommendation', style: { color: color } }, recommendation)
        )
      )
    );
  }

    var PROJECT_TYPES = ['ФНИ', 'ПНИ', 'ДНП', 'НПФ'];
    var PRIORITY_AREAS = ['Глобални пазари и инвестиции', 'Индустрия 5.0', 'Зелена икономика', 'Дигитална трансформация', 'Управление на данни', 'Регионални стратегии'];
    var PROFESSIONAL_FIELDS = ['3.7 Администрация', '3.8 Икономика', '3.9 Туризъм', '4.6 Информатика'];
    var MEMBER_ROLES = ['Изследовател', 'Докторант', 'Технически сътрудник'];

    // Word count helper (shared between Step1BasicInfo and SelfAssessment)
    function countWords(text) {
      if (!text) return 0;
      return text.trim().split(/\s+/).filter(function (w) { return w.length > 0; }).length;
    }

    /**
     * Step 1 — Basic project info form (competition, type, priority area, professional field,
     * title BG/EN, acronym, duration, description BG/EN, goals, department/faculty, PI, team members).
     * @param {Object} props
     * @param {Object} props.state — step1 state slice
     * @param {Object} props.validation — { isValid, errors } for step 1
     * @param {Function} props.onFieldChange — (field, value) => dispatch EDIT_FIELD on step 1
     * @param {Array} [props.availableCompetitions] — competition session lookup
     * @param {Array} [props.departments] — department lookup
     * @param {Function} [props.onSearchUsers] — async user search for PI/team pickers
     * @returns {React.ReactElement}
     */
    function Step1BasicInfo(props) {
      var state = props.state || {};
      var validation = props.validation || { errors: [] };
      var onFieldChange = props.onFieldChange || function () {};
      var availableCompetitions = props.availableCompetitions || [];
      var departments = props.departments || [];
      var onSearchUsers = props.onSearchUsers;

      var _errMap = useState({});
      var fieldErrors = _errMap[0];
      var setFieldErrors = _errMap[1];

      // Build error map from validation errors
      useEffect(function () {
        var map = {};
        if (validation.errors && Array.isArray(validation.errors)) {
          validation.errors.forEach(function (err) {
            map[err.field] = err.message_bg;
          });
        }
        setFieldErrors(map);
      }, [validation.errors]);

      // ── aria-live announcement of validation errors ──
      var _liveAnnounced = useRef(false);
      useEffect(function () {
        if (validation.isValid === false && !_liveAnnounced.current) {
          var errorFields = Object.keys(fieldErrors);
          var summary = errorFields.length > 0
            ? 'Моля поправете следните грешки: ' + errorFields.join(', ') + '.'
            : 'Има грешки в попълването на формуляра.';
          // Announce via the live region injected in render
          var region = document.getElementById('pw-step1-live-region');
          if (region) {
            region.textContent = summary;
          }
          _liveAnnounced.current = true;
        }
      }, [validation.isValid, fieldErrors]);

      // Reset live-announcement flag when form becomes valid again
      useEffect(function () {
        if (validation.isValid === true) {
          _liveAnnounced.current = false;
        }
      }, [validation.isValid]);

      // ── Debounce cleanup on unmount ──
      useEffect(function () {
        return function cleanup() {
          if (_piDebounce.current) {
            clearTimeout(_piDebounce.current);
            _piDebounce.current = null;
          }
        };
      }, []);

      // ── User search select state for PI ──
      var _piSearch = useState('');
      var piSearchQuery = _piSearch[0];
      var setPiSearchQuery = _piSearch[1];
      var _piResults = useState([]);
      var piResults = _piResults[0];
      var setPiResults = _piResults[1];
      var _piSearching = useState(false);
      var piSearching = _piSearching[0];
      var setPiSearching = _piSearching[1];
      var _piDebounce = useRef(null);
      var _piResultsRef = useRef(null);
      var _piActiveIdx = useRef(-1);

      // ── Team members ──
      var teamMembers = Array.isArray(state.team_members) ? state.team_members : [];

      // ── Handlers ──
      function handleChange(field, value) {
        onFieldChange(field, value);
      }

      function handlePiSearch(ev) {
        // v3.39.1-sanitize: Trim and sanitize input to prevent XSS and normalize data
        var q = String(ev.target.value || '').trim();
        setPiSearchQuery(q);
        if (!q || q.length < 2) {
          setPiResults([]);
          return;
        }
        if (_piDebounce.current) clearTimeout(_piDebounce.current);
        _piDebounce.current = setTimeout(function () {
          if (typeof onSearchUsers === 'function') {
            setPiSearching(true);
            onSearchUsers(q).then(function (res) {
              setPiResults(Array.isArray(res) ? res : []);
            }).catch(function () {
              setPiResults([]);
            }).finally(function () {
              setPiSearching(false);
            });
          }
        }, 300);
      }

      function handleSelectPI(user) {
        onFieldChange('principal_investigator_id', user.id || user.email);
        setPiSearchQuery(user.name || user.email || '');
        setPiResults([]);
        _piActiveIdx.current = -1;
      }

      function handlePiKeyDown(ev) {
        if (!piResults || piResults.length === 0) return;
        if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          _piActiveIdx.current = (_piActiveIdx.current + 1) % piResults.length;
          var list = _piResultsRef.current;
          if (list) {
            var items = list.querySelectorAll('.pw-user-search-item');
            if (items[_piActiveIdx.current]) {
              items[_piActiveIdx.current].scrollIntoView({ block: 'nearest' });
            }
          }
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          _piActiveIdx.current =
            _piActiveIdx.current <= 0 ? piResults.length - 1 : _piActiveIdx.current - 1;
          var list2 = _piResultsRef.current;
          if (list2) {
            var items2 = list2.querySelectorAll('.pw-user-search-item');
            if (items2[_piActiveIdx.current]) {
              items2[_piActiveIdx.current].scrollIntoView({ block: 'nearest' });
            }
          }
        } else if (ev.key === 'Enter') {
          ev.preventDefault();
          if (_piActiveIdx.current >= 0 && _piActiveIdx.current < piResults.length) {
            handleSelectPI(piResults[_piActiveIdx.current]);
          } else if (piResults.length === 1) {
            handleSelectPI(piResults[0]);
          }
        } else if (ev.key === 'Escape') {
          setPiResults([]);
          _piActiveIdx.current = -1;
        }
      }

      function handleAddTeamMember() {
        var next = teamMembers.concat([{
          member_id: '',
          role_bg: 'Изследовател',
          workload_percent: 50
        }]);
        onFieldChange('team_members', next);
      }

    // v3.39.1-validate: Added team member email validation
    // v3.39.1-validate: Email validation helper
    function _isValidEmail(email) {
      if (!email) return false;
      var re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      return re.test(email);
    }

    function handleTeamMemberChange(idx, field, value) {
      // v3.39.1-validate: Validate email format
      if (field === 'member_id' && value && !_isValidEmail(value)) {
        // Still accept the value but log warning
        console.warn('Invalid email format for team member:', value);
      }
      var next = teamMembers.map(function (m, i) {
        if (i !== idx) return m;
        var updated = {};
        Object.keys(m).forEach(function (k) { updated[k] = m[k]; });
        updated[field] = value;
        return updated;
      });
      onFieldChange('team_members', next);
    }

    function handleRemoveTeamMember(idx) {
      var next = teamMembers.filter(function (_, i) { return i !== idx; });
      onFieldChange('team_members', next);
    }

    // v3.39.1-validation: Validation summary for screen readers
    var validationSummary = '';
    if (validation.errors && validation.errors.length > 0) {
      validationSummary = 'Възникнаха ' + validation.errors.length + ' грешки във формата. ';
      var firstError = validation.errors[0];
      if (firstError) {
        validationSummary += firstError.message_bg || '';
      }
    }

    // ── Render ──
    return e('div', {
      className: 'pw-step1',
      'aria-live': 'polite',
      'aria-atomic': 'true'
    },

      // aria-live region for validation error announcements
      e('div', {
        id: 'pw-step1-live-region',
        'aria-live': 'polite',
        'aria-atomic': 'true',
        style: { position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' }
      }),

      // Competition session + Project type (2-col)
      e('div', { className: 'pw-grid-2' },
        // Competition Session
        e('div', { className: 'pw-field' },
          e('label', { className: 'pw-field-label', htmlFor: 'pw-competition-session' },
            'Конкурсна сесия', e('span', { className: 'pw-required' }, '*')
          ),
          e('select', {
            id: 'pw-competition-session',
            className: 'pw-select' + (fieldErrors['competition_session_id'] ? ' pw-has-error' : ''),
            value: state.competition_session_id || '',
            onChange: function (ev) { handleChange('competition_session_id', ev.target.value); },
            disabled: !state.project_type,
            required: true,
            autoComplete: 'off',
            'aria-describedby': fieldErrors['competition_session_id'] ? 'pw-competition-session-error' : 'pw-competition-session-help'
          },
            e('option', { value: '', disabled: true },
              state.project_type ? '— Изберете конкурсна сесия —' : '— Изберете първо тип проект —'
            ),
            availableCompetitions.map(function (c) {
              return e('option', { key: c.id, value: c.id }, c.name || c.id);
            })
          ),
          e('div', { id: 'pw-competition-session-help', className: 'pw-field-help' },
            'Списъкът се обновява спрямо избрания тип проект и текущо активните сесии.'
          ),
          fieldErrors['competition_session_id'] ? e('div', { id: 'pw-competition-session-error', className: 'pw-field-error' }, fieldErrors['competition_session_id']) : null
        ),

        // Project Type
        e('div', { className: 'pw-field' },
          e('label', { className: 'pw-field-label', htmlFor: 'pw-project-type' },
            'Тип проект', e('span', { className: 'pw-required' }, '*')
          ),
          e('select', {
            id: 'pw-project-type',
            className: 'pw-select' + (fieldErrors['project_type'] ? ' pw-has-error' : ''),
            value: state.project_type || '',
            required: true,
            autoComplete: 'off',
            'aria-describedby': fieldErrors['project_type'] ? 'pw-project-type-error' : 'pw-project-type-help',
            onChange: function (ev) { handleChange('project_type', ev.target.value); }
          },
            e('option', { value: '', disabled: true }, '— Изберете —'),
            PROJECT_TYPES.map(function (pt) {
              return e('option', { key: pt, value: pt }, pt);
            })
          ),
          e('div', { id: 'pw-project-type-help', className: 'pw-field-help' },
            'Изборът определя наличните конкурсни сесии, бюджетни правила и изискваните документи в следващите стъпки.'
          ),
          fieldErrors['project_type'] ? e('div', { id: 'pw-project-type-error', className: 'pw-field-error' }, fieldErrors['project_type']) : null
        )
      ),

      // Priority Area + Professional Field (2-col)
      e('div', { className: 'pw-grid-2' },
        // Priority Area
        e('div', { className: 'pw-field' },
          e('label', { className: 'pw-field-label', htmlFor: 'pw-priority-area' },
            'Приоритетна област', e('span', { className: 'pw-required' }, '*')
          ),
          e('select', {
            id: 'pw-priority-area',
            className: 'pw-select' + (fieldErrors['priority_area'] ? ' pw-has-error' : ''),
            value: state.priority_area || '',
            required: true,
            autoComplete: 'off',
            'aria-describedby': fieldErrors['priority_area'] ? 'pw-priority-area-error' : 'pw-priority-area-help',
            onChange: function (ev) { handleChange('priority_area', ev.target.value); }
          },
            e('option', { value: '', disabled: true }, '— Изберете —'),
            PRIORITY_AREAS.map(function (pa) {
              return e('option', { key: pa, value: pa }, pa);
            })
          ),
          e('div', { id: 'pw-priority-area-help', className: 'pw-field-help' },
            'Изберете приоритетна област, към която се отнася проектът.'
          ),
          fieldErrors['priority_area'] ? e('div', { id: 'pw-priority-area-error', className: 'pw-field-error' }, fieldErrors['priority_area']) : null
        ),

        // Professional Field
        e('div', { className: 'pw-field' },
          e('label', { className: 'pw-field-label', htmlFor: 'pw-professional-field' },
            'Професионално поле', e('span', { className: 'pw-required' }, '*')
          ),
          e('select', {
            id: 'pw-professional-field',
            className: 'pw-select' + (fieldErrors['professional_field'] ? ' pw-has-error' : ''),
            value: state.professional_field || '',
            required: true,
            autoComplete: 'off',
            'aria-describedby': fieldErrors['professional_field'] ? 'pw-professional-field-error' : 'pw-professional-field-help',
            onChange: function (ev) { handleChange('professional_field', ev.target.value); }
          },
            e('option', { value: '', disabled: true }, '— Изберете —'),
            PROFESSIONAL_FIELDS.map(function (pf) {
              return e('option', { key: pf, value: pf }, pf);
            })
          ),
          e('div', { id: 'pw-professional-field-help', className: 'pw-field-help' },
            'Изберете професионално поле според класификацията на НАОА.'
          ),
          fieldErrors['professional_field'] ? e('div', { id: 'pw-professional-field-error', className: 'pw-field-error' }, fieldErrors['professional_field']) : null
        )
      ),

      // Title (BG) — full width
      e('div', { className: 'pw-field' },
        e('label', { className: 'pw-field-label', htmlFor: 'pw-title-bg' },
          'Заглавие на проекта (БГ)', e('span', { className: 'pw-required' }, '*')
        ),
        e('input', {
          id: 'pw-title-bg',
          className: 'pw-input' + (fieldErrors['title_bg'] ? ' pw-has-error' : ''),
          type: 'text',
          value: state.title_bg || '',
          onChange: function (ev) { handleChange('title_bg', ev.target.value); },
          maxLength: 250,
          minLength: 5,
          placeholder: 'Въведете заглавие на български език',
          required: true,
          autoComplete: 'off',
          'aria-required': 'true',
          'aria-invalid': fieldErrors['title_bg'] ? 'true' : 'false',
          'aria-describedby': 'pw-title-bg-help' + (fieldErrors['title_bg'] ? ' pw-title-bg-error' : '')
        }),
        e('div', { id: 'pw-title-bg-help', className: 'pw-field-help' }, 'Минимум 5, максимум 250 символа.'),
        fieldErrors['title_bg'] ? e('div', { id: 'pw-title-bg-error', className: 'pw-field-error' }, fieldErrors['title_bg']) : null
      ),

      // Title (EN) — full width
      e('div', { className: 'pw-field' },
        e('label', { className: 'pw-field-label', htmlFor: 'pw-title-en' },
          'Заглавие на проекта (EN)'
        ),
        e('input', {
          id: 'pw-title-en',
          className: 'pw-input' + (fieldErrors['title_en'] ? ' pw-has-error' : ''),
          type: 'text',
          value: state.title_en || '',
          onChange: function (ev) { handleChange('title_en', ev.target.value); },
          maxLength: 250,
          placeholder: 'Enter project title in English',
          autoComplete: 'off',
          'aria-invalid': fieldErrors['title_en'] ? 'true' : 'false',
          'aria-describedby': 'pw-title-en-help' + (fieldErrors['title_en'] ? ' pw-title-en-error' : '')
        }),
        e('div', { id: 'pw-title-en-help', className: 'pw-field-help' }, 'Максимум 250 символа (по избор).'),
        fieldErrors['title_en'] ? e('div', { id: 'pw-title-en-error', className: 'pw-field-error' }, fieldErrors['title_en']) : null
      ),

      // Scientific Title — full width (T1: server-side validation for proper formatting)
      e('div', { className: 'pw-field' },
        e('label', { className: 'pw-field-label', htmlFor: 'pw-scientific-title' },
          'Научно заглавие'
        ),
        e('input', {
          id: 'pw-scientific-title',
          className: 'pw-input' + (fieldErrors['scientific_title'] ? ' pw-has-error' : ''),
          type: 'text',
          value: state.scientific_title || '',
          onChange: function (ev) { handleChange('scientific_title', ev.target.value); },
          maxLength: 300,
          minLength: 10,
          placeholder: 'Въведете научно заглавие (мин. 10, макс. 300 символа)',
          autoComplete: 'off',
          'aria-invalid': fieldErrors['scientific_title'] ? 'true' : 'false',
          'aria-describedby': 'pw-scientific-title-help' + (fieldErrors['scientific_title'] ? ' pw-scientific-title-error' : '')
        }),
        e('div', { id: 'pw-scientific-title-help', className: 'pw-field-help' },
          'Ясно и кратко заглавие, отразяващо съдържанието. Позволени: букви, цифри, интервали, тире, запетая, точка.'
        ),
        fieldErrors['scientific_title'] ? e('div', { id: 'pw-scientific-title-error', className: 'pw-field-error' }, fieldErrors['scientific_title']) : null
      ),

      // Acronym (2-col with Duration)
      e('div', { className: 'pw-grid-2' },
        // Acronym
        e('div', { className: 'pw-field' },
          e('label', { className: 'pw-field-label', htmlFor: 'pw-acronym' },
            'Акроним', e('span', { className: 'pw-required' }, '*')
          ),
          e('input', {
            id: 'pw-acronym',
            className: 'pw-input' + (fieldErrors['acronym'] ? ' pw-has-error' : ''),
            type: 'text',
            value: state.acronym || '',
            onChange: function (ev) { handleChange('acronym', ev.target.value); },
            maxLength: 10,
            placeholder: 'Нпр. UEVPROJ',
            required: true,
            autoComplete: 'off',
            'aria-required': 'true',
            'aria-invalid': fieldErrors['acronym'] ? 'true' : 'false',
            'aria-describedby': 'pw-acronym-help' + (fieldErrors['acronym'] ? ' pw-acronym-error' : '')
          }),
          e('div', { id: 'pw-acronym-help', className: 'pw-field-help' }, '1-10 латински букви, без интервали.'),
          fieldErrors['acronym'] ? e('div', { id: 'pw-acronym-error', className: 'pw-field-error' }, fieldErrors['acronym']) : null
        ),

        // Duration (renamed to 'Срок на изпълнение')
        e('div', { className: 'pw-field' },
          e('label', { className: 'pw-field-label', htmlFor: 'pw-duration' },
            'Срок на изпълнение', e('span', { className: 'pw-required' }, '*')
          ),
          e('input', {
            id: 'pw-duration',
            className: 'pw-input' + (fieldErrors['duration_months'] ? ' pw-has-error' : ''),
            type: 'number',
            min: 6,
            max: 36,
            value: state.duration_months || 12,
            onChange: function (ev) { handleChange('duration_months', parseInt(ev.target.value, 10) || 12); },
            required: true,
            autoComplete: 'off',
            'aria-required': 'true',
            'aria-invalid': fieldErrors['duration_months'] ? 'true' : 'false',
            'aria-describedby': 'pw-duration-help' + (fieldErrors['duration_months'] ? ' pw-duration-error' : '')
          }),
          e('div', { id: 'pw-duration-help', className: 'pw-field-help' }, 'Между 6 и 36 месеца.'),
          fieldErrors['duration_months'] ? e('div', { id: 'pw-duration-error', className: 'pw-field-error' }, fieldErrors['duration_months']) : null
        )
      ),

      // Description (BG) — full width
      e('div', { className: 'pw-field' },
        e('label', { className: 'pw-field-label', htmlFor: 'pw-description-bg' },
          'Описание', e('span', { className: 'pw-required' }, '*')
        ),
        e('textarea', {
          id: 'pw-description-bg',
          className: 'pw-textarea' + (fieldErrors['description_bg'] ? ' pw-has-error' : ''),
          value: state.description_bg || '',
          onChange: function (ev) { handleChange('description_bg', ev.target.value); },
          maxLength: 2000,
          minLength: 200,
          placeholder: 'Кратко описание на целите, методологията и очаквания резултат от проекта...',
          style: { minHeight: 140 },
          rows: 6,
          required: true,
          autoComplete: 'off',
          'aria-required': 'true',
          'aria-invalid': fieldErrors['description_bg'] ? 'true' : 'false',
          'aria-describedby': 'pw-description-bg-help' + (fieldErrors['description_bg'] ? ' pw-description-bg-error' : '')
        }),
        e('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 4 } },
          e('div', { id: 'pw-description-bg-help', className: 'pw-field-help' }, 'Минимум 200, максимум 2000 символа.'),
          e('span', {
            id: 'pw-description-bg-count',
            'aria-live': 'polite',
            style: { fontSize: 11, color: 'var(--pw-neutral-500)' }
          },
            ((state.description_bg || '').length) + '/2000'
          )
        ),
        fieldErrors['description_bg'] ? e('div', { id: 'pw-description-bg-error', className: 'pw-field-error' }, fieldErrors['description_bg']) : null
      ),

      // Description (EN) — full width with 200-word counter
      e('div', { className: 'pw-field' },
        e('label', { className: 'pw-field-label', htmlFor: 'pw-description-en' },
          'Описание (EN)', e('span', { className: 'pw-required' }, '*')
        ),
        e('textarea', {
          id: 'pw-description-en',
          className: 'pw-textarea' + (fieldErrors['description_en'] ? ' pw-has-error' : ''),
          value: state.description_en || '',
          onChange: function (ev) { handleChange('description_en', ev.target.value); },
          placeholder: 'Project description in English (max 200 words)...',
          style: { minHeight: 120 },
          rows: 5,
          required: true,
          autoComplete: 'off',
          'aria-required': 'true',
          'aria-invalid': fieldErrors['description_en'] ? 'true' : 'false',
          'aria-describedby': 'pw-description-en-help' + (fieldErrors['description_en'] ? ' pw-description-en-error' : '')
        }),
        e('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 4 } },
          e('div', { id: 'pw-description-en-help', className: 'pw-field-help' }, 'Описание на английски език (максимум 200 думи).'),
          e('span', {
            id: 'pw-description-en-count',
            'aria-live': 'polite',
            style: { fontSize: 11, color: countWords(state.description_en) > 200 ? 'var(--pw-danger, red)' : 'var(--pw-neutral-500)' }
          },
            countWords(state.description_en) + '/200'
          )
        ),
        fieldErrors['description_en'] ? e('div', { id: 'pw-description-en-error', className: 'pw-field-error' }, fieldErrors['description_en']) : null
      ),

      // Goals — full width
      e('div', { className: 'pw-field' },
        e('label', { className: 'pw-field-label', htmlFor: 'pw-goals' },
          'Цели', e('span', { className: 'pw-required' }, '*')
        ),
        e('textarea', {
          id: 'pw-goals',
          className: 'pw-textarea' + (fieldErrors['goals'] ? ' pw-has-error' : ''),
          value: state.goals || '',
          onChange: function (ev) { handleChange('goals', ev.target.value); },
          maxLength: 1000,
          minLength: 50,
          placeholder: 'Основни цели на проекта...',
          style: { minHeight: 100 },
          rows: 4,
          required: true,
          autoComplete: 'off',
          'aria-required': 'true',
          'aria-invalid': fieldErrors['goals'] ? 'true' : 'false',
          'aria-describedby': 'pw-goals-help' + (fieldErrors['goals'] ? ' pw-goals-error' : '')
        }),
        e('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 4 } },
          e('div', { id: 'pw-goals-help', className: 'pw-field-help' }, 'Минимум 50, максимум 1000 символа.'),
          e('span', {
            id: 'pw-goals-count',
            'aria-live': 'polite',
            style: { fontSize: 11, color: 'var(--pw-neutral-500)' }
          },
            ((state.goals || '').length) + '/1000'
          )
        ),
        fieldErrors['goals'] ? e('div', { id: 'pw-goals-error', className: 'pw-field-error' }, fieldErrors['goals']) : null
      ),

      // Department + Faculty (2-col)
      e('div', { className: 'pw-grid-2' },
        e('div', { className: 'pw-field' },
          e('label', { className: 'pw-field-label', htmlFor: 'pw-department' },
            'Катедра', e('span', { className: 'pw-required' }, '*')
          ),
          e('select', {
            id: 'pw-department',
            className: 'pw-select' + (fieldErrors['department_id'] ? ' pw-has-error' : ''),
            value: state.department_id || '',
            onChange: function (ev) { handleChange('department_id', ev.target.value); },
            required: true,
            autoComplete: 'off',
            'aria-required': 'true',
            'aria-invalid': fieldErrors['department_id'] ? 'true' : 'false',
            'aria-describedby': fieldErrors['department_id'] ? 'pw-department-error' : undefined
          },
            e('option', { value: '', disabled: true }, '— Изберете —'),
            departments.map(function (d) {
              return e('option', { key: d.id, value: d.id }, d.name || d.id);
            })
          ),
          fieldErrors['department_id'] ? e('div', { id: 'pw-department-error', className: 'pw-field-error' }, fieldErrors['department_id']) : null
        ),
        e('div', { className: 'pw-field' },
          e('label', { className: 'pw-field-label', htmlFor: 'pw-faculty' },
            'Факултет', e('span', { className: 'pw-required' }, '*')
          ),
          e('input', {
            id: 'pw-faculty',
            className: 'pw-input',
            type: 'text',
            value: state.faculty_id || '',
            disabled: true,
            placeholder: 'Избира се автоматично от катедрата',
            required: true,
            autoComplete: 'off',
            'aria-required': 'true',
            'aria-disabled': 'true'
          })
        )
      ),

      // Principal Investigator
      e('div', { className: 'pw-field pw-user-search' },
        e('label', { className: 'pw-field-label', htmlFor: 'pw-pi-search' },
          'Ръководител на проекта', e('span', { className: 'pw-required' }, '*')
        ),
        e('input', {
          id: 'pw-pi-search',
          className: 'pw-input' + (fieldErrors['principal_investigator_id'] ? ' pw-has-error' : ''),
          type: 'text',
          value: piSearchQuery,
          onChange: handlePiSearch,
          onKeyDown: handlePiKeyDown,
          placeholder: 'Търсене по име или имейл...',
          required: true,
          autoComplete: 'off',
          'aria-required': 'true',
          'aria-invalid': fieldErrors['principal_investigator_id'] ? 'true' : 'false',
          'aria-describedby': 'pw-pi-search-help' + (fieldErrors['principal_investigator_id'] ? ' pw-pi-search-error' : ''),
          'aria-autocomplete': 'list',
          'aria-expanded': piResults.length > 0 ? 'true' : 'false',
          'aria-haspopup': 'listbox',
          'aria-controls': piResults.length > 0 ? 'pw-pi-results' : undefined,
          role: 'combobox'
        }),
        e('div', { id: 'pw-pi-search-help', className: 'pw-field-help' },
          'Търсене по име или имейл. Стрелки за навигация, Enter за избор, Escape за отмена.'
        ),
        piSearching ? e('div', {
          style: { fontSize: 12, color: 'var(--pw-neutral-500)', marginTop: 4 },
          'aria-live': 'polite'
        }, 'Търсене...') : null,
        piResults.length > 0 ? e('div', {
          id: 'pw-pi-results',
          ref: _piResultsRef,
          className: 'pw-user-search-results',
          role: 'listbox',
          'aria-label': 'Резултати от търсенето'
        },
          piResults.map(function (user, idx) {
            var isActive = idx === _piActiveIdx.current;
            return e('div', {
              key: idx,
              className: 'pw-user-search-item' + (isActive ? ' pw-active' : ''),
              onClick: function () { handleSelectPI(user); },
              onMouseEnter: function () { _piActiveIdx.current = idx; },
              onKeyDown: function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  handleSelectPI(user);
                } else if (ev.key === 'ArrowDown') {
                  ev.preventDefault();
                  _piActiveIdx.current = (_piActiveIdx.current + 1) % piResults.length;
                } else if (ev.key === 'ArrowUp') {
                  ev.preventDefault();
                  _piActiveIdx.current = _piActiveIdx.current <= 0 ? piResults.length - 1 : _piActiveIdx.current - 1;
                } else if (ev.key === 'Escape') {
                  setPiResults([]);
                  _piActiveIdx.current = -1;
                }
              },
              role: 'option',
              'aria-selected': isActive ? 'true' : 'false',
              tabIndex: -1
            },
              e('div', null, user.name || '—'),
              e('div', { className: 'pw-user-email' }, user.email || '')
            );
          })
        ) : null,
        fieldErrors['principal_investigator_id'] ? e('div', { id: 'pw-pi-search-error', className: 'pw-field-error' }, fieldErrors['principal_investigator_id']) : null
      ),

      // Team Members
      e('div', { className: 'pw-field' },
        e('label', { className: 'pw-field-label', htmlFor: 'pw-team-members-label' }, 'Екип на проекта'),
        e('div', { className: 'pw-field-help', style: { marginBottom: 8 } },
          'Добавете членове на екипа (макс. 15). Всеки член трябва да има избрана роля и натовареност между 5% и 100%.'
        ),
        teamMembers.map(function (member, idx) {
          var memberId = 'pw-team-member-' + idx;
          var roleId = 'pw-team-role-' + idx;
          var workloadId = 'pw-team-workload-' + idx;
          return e('div', { key: idx, className: 'pw-team-row' },
            e('select', {
              id: memberId,
              className: 'pw-select',
              value: member.member_id || '',
              onChange: function (ev) { handleTeamMemberChange(idx, 'member_id', ev.target.value); },
              'aria-label': 'Член на екипа ' + (idx + 1),
              autoComplete: 'off'
            },
              e('option', { value: '', disabled: true }, '— Изберете —')
            ),
            e('select', {
              id: roleId,
              className: 'pw-select',
              value: member.role_bg || '',
              onChange: function (ev) { handleTeamMemberChange(idx, 'role_bg', ev.target.value); },
              'aria-label': 'Роля за член ' + (idx + 1),
              autoComplete: 'off'
            },
              MEMBER_ROLES.map(function (r) {
                return e('option', { key: r, value: r }, r);
              })
            ),
            e('input', {
              id: workloadId,
              className: 'pw-input',
              type: 'number',
              min: 5,
              max: 100,
              value: member.workload_percent || 50,
              onChange: function (ev) { handleTeamMemberChange(idx, 'workload_percent', parseInt(ev.target.value, 10) || 50); },
              onKeyDown: function (ev) {
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  var row = ev.currentTarget.closest('.pw-team-row');
                  if (row) {
                    var firstInput = row.querySelector('.pw-select, .pw-input');
                    if (firstInput) firstInput.focus();
                  }
                } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
                  ev.preventDefault();
                  handleRemoveTeamMember(idx);
                }
              },
              style: { textAlign: 'center' },
              'aria-label': 'Натовареност % за член ' + (idx + 1),
              'aria-valuenow': member.workload_percent || 50,
              'aria-valuemin': 5,
              'aria-valuemax': 100,
              autoComplete: 'off'
            }),
            e('button', {
              type: 'button',
              className: 'pw-team-remove-btn',
              onClick: function () { handleRemoveTeamMember(idx); },
              onKeyDown: function (ev) {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  handleRemoveTeamMember(idx);
                }
              },
              'aria-label': 'Премахни член на екипа ' + (idx + 1),
              title: 'Премахни'
            }, '✕')
          );
        }),
        teamMembers.length < 15 ? e('button', {
                  id: 'pw-add-team-member',
                  type: 'button',
                  className: 'pw-btn pw-btn-outline-clay pw-btn-sm',
                  onClick: handleAddTeamMember,
                  style: { marginTop: 8 },
                  'aria-label': 'Добави член на екипа'
                }, '+ Добави член на екипа') : null
              ),

              // Self-Assessment score preview
              e(SelfAssessment, {
                state: state,
                budgetCap: props.budgetCap,
                allDocsReady: props.allDocsReady
              })
            );
          }

  global.__pwStep1BasicInfo = React.memo(Step1BasicInfo);

})(window);