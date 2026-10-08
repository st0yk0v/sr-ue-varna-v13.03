/* ═══════════════════════════════════════════════════════════════════════
 * useWizardState.js — Centralized wizard state machine hook
 * ═══════════════════════════════════════════════════════════════════════
 * Implements the state_management contract from spec v2.0.0:
 *   - Single source of truth for all 3 steps
 *   - Explicit transitions (no hidden automation)
 *   - Per-step validation on navigation
 *   - Dirty tracking for close confirmation
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   const wizard = useWizardState(initialData);
 *   wizard.dispatch('EDIT_FIELD', { step: 1, field: 'title_bg', value: '...' });
 *   wizard.dispatch('NEXT_STEP');  // only if validation passes
 *   wizard.dispatch('SAVE_DRAFT_EXPLICIT');
 *   wizard.state.currentStep  // 1|2|3
 *   wizard.state.validation.step1.isValid
 */

(function (global) {
  'use strict';

  var useState     = React.useState;
  var useCallback  = React.useCallback;
  var useRef       = React.useRef;

  /**
   * Budget rules for НПФ (Научно-изследователска програма) — max BGN per category.
   * From budget_rules table.
   */
  var BUDGET_RULES_NPF = {
    personnel: { max: 80000, message_bg: 'Максималният бюджет за персонал е 80 000 лв.' },
    equipment: { max: 150000, message_bg: 'Максималният бюджет за оборудване е 150 000 лв.' },
    travel: { max: 20000, message_bg: 'Максималният бюджет за пътувания е 20 000 лв.' },
    services: { max: 30000, message_bg: 'Максималният бюджет за външни услуги е 30 000 лв.' },
    other: { max: 10000, message_bg: 'Максималният бюджет за други разходи е 10 000 лв.' }
  };

  /**
   * Count words in a text (split by whitespace, ignore empty strings).
   * Supports Cyrillic and Latin scripts.
   */
  function _countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    var trimmed = text.trim();
    if (trimmed === '') return 0;
    return trimmed.split(/\s+/).length;
  }

  /**
   * Validate Latin-only characters (a-z, A-Z) and max length.
   */
  function _isLatinOnly(text) {
    if (!text || typeof text !== 'string') return true;
    return /^[a-zA-Z]*$/.test(text);
  }

  /**
   * Creates the initial wizard state.
   * @param {Object} [initial] — partial state to merge (e.g. loaded from server)
   * @returns {Object} — full WizardState shape
   */
  function _createInitialState(initial) {
    var def = {
      proposalId: null,
      currentStep: 1,
      isDirty: false,
      lastSavedAt: null,
      rowVersion: 0,
      step1: {
        project_type: '',
        competition_session_id: '',
        priority_area: '',
        professional_field: '',
        title_bg: '',
        title_en: '',
        acronym: '',
        abstract_bg: '',
        description_en: '',
        goals: '',
        duration_months: 12,
        department_id: '',
        faculty_id: '',
        principal_investigator_id: '',
        team_members: []
      },
      step2: {
        documents: []
      },
      step3: {
        total_budget_field: 0,
        budget_categories: [],
        external_reviewers: []
      },
      validation: {
        step1: { isValid: false, errors: [] },
        step2: { isValid: false, errors: [] },
        step3: { isValid: false, errors: [] }
      }
    };
    return _deepMerge(def, initial || {});
  }

  /**
   * Deep-merge two plain objects (arrays replaced, not merged).
   */
  function _deepMerge(target, source) {
    if (!source || typeof source !== 'object') return target;
    var result = Array.isArray(target) ? target.slice() : Object.assign({}, target);
    Object.keys(source).forEach(function (key) {
      var tv = result[key];
      var sv = source[key];
      if (sv !== null && typeof sv === 'object' && !Array.isArray(sv) &&
          tv !== null && typeof tv === 'object' && !Array.isArray(tv)) {
        result[key] = _deepMerge(tv, sv);
      } else {
        result[key] = sv;
      }
    });
    return result;
  }

  /**
   * Per-step validation logic.
   * @param {number} step — 1|2|3
   * @param {Object} state — full wizard state
   * @returns {{isValid: boolean, errors: Array<{field:string, message_bg:string}>}}
   */
  function _validateStep(step, state) {
    var errors = [];

    if (step === 1) {
      var s1 = state.step1;
      // project_type
      if (!s1.project_type) {
        errors.push({ field: 'project_type', message_bg: 'Моля изберете тип проект.' });
      }
      // competition_session_id
      if (!s1.competition_session_id) {
        errors.push({ field: 'competition_session_id', message_bg: 'Моля изберете конкурсна сесия.' });
      }
      // priority_area (required)
      if (!s1.priority_area) {
        errors.push({ field: 'priority_area', message_bg: 'Моля изберете приоритетна област.' });
      }
      // professional_field (required)
      if (!s1.professional_field) {
        errors.push({ field: 'professional_field', message_bg: 'Моля изберете професионална област.' });
      }
      // title_bg
      var titleLen = (s1.title_bg || '').trim().length;
      if (titleLen < 5 || titleLen > 250) {
        errors.push({ field: 'title_bg', message_bg: 'Заглавието трябва да е между 5 и 250 символа.' });
      }
      // title_en (optional, max 250)
      if ((s1.title_en || '').length > 250) {
        errors.push({ field: 'title_en', message_bg: 'Заглавието на английски не може да надвишава 250 символа.' });
      }
      // acronym (max 10 chars, latin only)
      var acronym = s1.acronym || '';
      if (acronym.length > 10) {
        errors.push({ field: 'acronym', message_bg: 'Акронимът не може да надвишава 10 символа.' });
      }
      if (!_isLatinOnly(acronym)) {
        errors.push({ field: 'acronym', message_bg: 'Акронимът трябва да съдържа само латински букви.' });
      }
      // abstract_bg (max 200 words)
      var abstractWords = _countWords(s1.abstract_bg);
      if (abstractWords > 200) {
        errors.push({ field: 'abstract_bg', message_bg: 'Резюмето не може да надвишава 200 думи.' });
      }
      // description_en (optional, max 200 words)
      var descWords = _countWords(s1.description_en);
      if (descWords > 200) {
        errors.push({ field: 'description_en', message_bg: 'Описанието на английски не може да надвишава 200 думи.' });
      }
      // goals (required, 50-2000 chars)
      var goalsLen = (s1.goals || '').trim().length;
      if (goalsLen < 50 || goalsLen > 2000) {
        errors.push({ field: 'goals', message_bg: 'Целите трябва да са между 50 и 2000 символа.' });
      }
      // duration_months
      var dur = Number(s1.duration_months);
      if (isNaN(dur) || dur < 6 || dur > 36 || !Number.isInteger(dur)) {
        errors.push({ field: 'duration_months', message_bg: 'Продължителността трябва да е между 6 и 36 месеца.' });
      }
      // department_id
      if (!s1.department_id) {
        errors.push({ field: 'department_id', message_bg: 'Моля изберете катедра.' });
      }
      // faculty_id
      if (!s1.faculty_id) {
        errors.push({ field: 'faculty_id', message_bg: 'Моля изберете факултет.' });
      }
      // principal_investigator_id
      if (!s1.principal_investigator_id) {
        errors.push({ field: 'principal_investigator_id', message_bg: 'Моля изберете ръководител на проекта.' });
      }
      // team_members validation (each row)
      if (Array.isArray(s1.team_members)) {
        var seenMembers = {};
        s1.team_members.forEach(function (m, idx) {
          if (!m.member_id) {
            errors.push({ field: 'team_members[' + idx + '].member_id', message_bg: 'Всеки член на екипа трябва да е избран.' });
          } else if (seenMembers[m.member_id]) {
            errors.push({ field: 'team_members', message_bg: 'Всеки член на екипа трябва да е избран еднократно.' });
          }
          seenMembers[m.member_id] = true;
          if (!m.role_bg) {
            errors.push({ field: 'team_members[' + idx + '].role_bg', message_bg: 'Моля изберете роля за члена на екипа.' });
          }
          var wp = Number(m.workload_percent);
          if (isNaN(wp) || wp < 5 || wp > 100) {
            errors.push({ field: 'team_members[' + idx + '].workload_percent', message_bg: 'Натовареността трябва да е между 5% и 100%.' });
          }
        });
      }
    }

    if (step === 2) {
          var docs = state.step2.documents;
          if (Array.isArray(docs)) {
            var missingRequired = docs.filter(function (d) {
              return d.required && d.status !== 'generated' && d.status !== 'uploaded';
            });
            if (missingRequired.length > 0) {
              var names = missingRequired.map(function (d) { return d.name_bg || d.type; }).join(', ');
              errors.push({ field: 'documents', message_bg: 'Липсват задължителни документи: ' + names + '.' });
            }
          }
          // Check for referee duplicates (blocked by Step2RefereeCheck component)
          if (typeof window !== 'undefined' && window.__pwRefereeDuplicates === true) {
            errors.push({ field: 'referee_duplicates', message_bg: 'Подаването е блокирано: открити са дублирани рецензенти. Моля, премахнете или заменете рецензента преди да продължите.' });
          }
        }

    if (step === 3) {
      var s3 = state.step3;
      // total_budget_field required and positive
      if (!s3.total_budget_field || Number(s3.total_budget_field) <= 0) {
        errors.push({ field: 'total_budget_field', message_bg: 'Моля въведете обща стойност на проекта.' });
      }
      // budget_categories validation
      if (Array.isArray(s3.budget_categories)) {
        var totalAllocated = 0;
        s3.budget_categories.forEach(function (cat) {
          var amt = Number(cat.allocated_amount) || 0;
          totalAllocated += amt;
          // НПФ budget per-category cap check
          if (cat.type && BUDGET_RULES_NPF[cat.type]) {
            var rule = BUDGET_RULES_NPF[cat.type];
            if (amt > rule.max) {
              errors.push({ field: 'budget_categories.' + cat.type, message_bg: rule.message_bg });
            }
          }
        });
        if (totalAllocated > Number(s3.total_budget_field)) {
          errors.push({ field: 'budget_categories', message_bg: 'Разпределената сума надвишава общата стойност на проекта.' });
        }
      }
      // external_reviewers: exactly 2, each with name, degree, organization, email, phone
      var reviewers = s3.external_reviewers;
      if (!Array.isArray(reviewers) || reviewers.length !== 2) {
        errors.push({ field: 'external_reviewers', message_bg: 'Трябват точно 2 външни рецензента.' });
      } else {
        reviewers.forEach(function (r, idx) {
          var prefix = 'external_reviewers[' + idx + ']';
          if (!r.name || !r.name.trim()) {
            errors.push({ field: prefix + '.name', message_bg: 'Името на рецензента е задължително.' });
          }
          if (!r.degree || !r.degree.trim()) {
            errors.push({ field: prefix + '.degree', message_bg: 'Научната степен на рецензента е задължителна.' });
          }
          if (!r.organization || !r.organization.trim()) {
            errors.push({ field: prefix + '.organization', message_bg: 'Организацията на рецензента е задължителна.' });
          }
          if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
            errors.push({ field: prefix + '.email', message_bg: 'Невалиден имейл адрес на рецензента.' });
          }
          if (!r.phone || !r.phone.trim()) {
            errors.push({ field: prefix + '.phone', message_bg: 'Телефонът на рецензента е задължителен.' });
          }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Main wizard state machine hook.
   * @param {Object} [initialState] — preloaded state for edit mode
   * @returns {{ state: Object, dispatch: Function, validate: Function }}
   */
  function useWizardState(initialState) {
    var init = _createInitialState(initialState);
    var _state = useState(init);
    var state = _state[0];
    var setState = _state[1];

    // Refs for closure-safe access to latest state in async operations
    var stateRef = useRef(state);
    stateRef.current = state;

    /**
     * Dispatch a state transition.
     * @param {string} action — one of transitions[] from spec
     * @param {Object} [payload]
     */
    var dispatch = useCallback(function (action, payload) {
      var current = stateRef.current;

      switch (action) {

        case 'OPEN_WIZARD':
          // Handled externally — set initial state
          break;

        case 'EDIT_FIELD':
          if (!payload || !payload.step || !payload.field) break;
          var stepKey = 'step' + payload.step;
          var newStep = _deepMerge(current[stepKey], {});
          _setNestedField(newStep, payload.field, payload.value);
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next[stepKey] = newStep;
            next.isDirty = true;
            // Re-validate current step
            next.validation['step' + next.currentStep] = _validateStep(next.currentStep, next);
            return next;
          });
          break;

        case 'SET_STEP_DATA':
          // Bulk-set all data for a step (e.g. server load)
          if (!payload || !payload.step) break;
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next['step' + payload.step] = _deepMerge(next['step' + payload.step], payload.data || {});
            // Re-validate
            next.validation['step' + payload.step] = _validateStep(payload.step, next);
            return next;
          });
          break;

        case 'SET_VALIDATION':
          // Override validation for a step (from server-side errors on submit)
          if (!payload || !payload.step) break;
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next.validation['step' + payload.step] = {
              isValid: payload.isValid !== false,
              errors: Array.isArray(payload.errors) ? payload.errors : []
            };
            return next;
          });
          break;

        case 'NEXT_STEP':
          if (current.currentStep >= 3) break;
          // Guard: only proceed if current step is valid
          var curVal = current.validation['step' + current.currentStep];
          if (!curVal || !curVal.isValid) break;
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next.currentStep = (next.currentStep + 1);
            // Validate the new step
            next.validation['step' + next.currentStep] = _validateStep(next.currentStep, next);
            return next;
          });
          break;

        case 'PREV_STEP':
          if (current.currentStep <= 1) break;
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next.currentStep = (next.currentStep - 1);
            // Re-validate the step we're navigating back to
            next.validation['step' + next.currentStep] = _validateStep(next.currentStep, next);
            return next;
          });
          break;

        case 'GO_TO_STEP':
          // Explicit step click from step indicator
          var targetStep = Number(payload) || 1;
          if (targetStep < 1 || targetStep > 3) break;
          if (targetStep > current.currentStep + 1) break; // can't skip ahead
          // Going forward requires all previous steps valid
          var canGo = true;
          for (var s = 1; s < targetStep; s++) {
            if (!current.validation['step' + s] || !current.validation['step' + s].isValid) {
              canGo = false;
              break;
            }
          }
          if (!canGo) break;
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next.currentStep = targetStep;
            next.validation['step' + targetStep] = _validateStep(targetStep, next);
            return next;
          });
          break;

        case 'SET_SAVED':
          // Mark state as saved after successful server persist
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next.isDirty = false;
            next.lastSavedAt = (payload && payload.lastSavedAt) || new Date().toISOString();
            next.rowVersion = (payload && payload.rowVersion) || next.rowVersion;
            next.proposalId = (payload && payload.proposalId) || next.proposalId;
            return next;
          });
          break;

        case 'SET_DIRTY':
          // Explicit dirty override (e.g. after document upload completes)
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next.isDirty = true;
            return next;
          });
          break;

        case 'CONFLICT_DETECTED':
          // 409 handler — stores server version info for conflict dialog
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next._conflict = {
              serverVersion: (payload && payload.serverVersion) || 0,
              serverLastModifiedAt: (payload && payload.serverLastModifiedAt) || null,
              serverData: (payload && payload.serverData) || null
            };
            return next;
          });
          break;

        case 'KEEP_LOCAL':
          // User chose to keep their local version — overwrite server
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            delete next._conflict;
            return next;
          });
          break;

        case 'LOAD_SERVER':
          // User chose server version — replace state with server data
          if (!payload || !payload.serverData) break;
          setState(function (prev) {
            var next = _deepMerge(prev, payload.serverData);
            next._conflict = undefined;
            next.isDirty = false;
            // Re-validate all steps
            for (var i = 1; i <= 3; i++) {
              next.validation['step' + i] = _validateStep(i, next);
            }
            return next;
          });
          break;

        case 'RESET_DIRTY':
          setState(function (prev) {
            var next = _deepMerge(prev, {});
            next.isDirty = false;
            return next;
          });
          break;

        case 'RESET':
          setState(_createInitialState(initialState));
          break;

        default:
          break;
      }
    }, [initialState]);

    /**
     * Manually trigger validation for a step.
     * @param {number} step
     * @returns {{isValid: boolean, errors: Array}}
     */
    var validate = useCallback(function (step) {
      var st = step || stateRef.current.currentStep;
      var result = _validateStep(st, stateRef.current);
      setState(function (prev) {
        var next = _deepMerge(prev, {});
        next.validation['step' + st] = result;
        return next;
      });
      return result;
    }, []);

    /**
     * Recalculate validation for current step (useful after external changes).
     */
    var revalidate = useCallback(function () {
      var current = stateRef.current;
      var result = _validateStep(current.currentStep, current);
      setState(function (prev) {
        var next = _deepMerge(prev, {});
        next.validation['step' + current.currentStep] = result;
        return next;
      });
      return result;
    }, []);

    return {
      state: state,
      dispatch: dispatch,
      validate: validate,
      revalidate: revalidate,
      /** Ref holding the latest state — closure-safe for async consumers (e.g. useAutosave). */
      stateRef: stateRef
    };
  }

  /**
   * Set a nested field value in an object using dot notation.
   * Supports array indices: 'team_members[0].member_id'
   */
  function _setNestedField(obj, path, value) {
    var parts = path.split('.');
    var current = obj;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var arrMatch = part.match(/^(\w+)\[(\d+)\]$/);
      if (arrMatch) {
        var arrKey = arrMatch[1];
        var arrIdx = parseInt(arrMatch[2], 10);
        if (i === parts.length - 1) {
          current[arrKey][arrIdx] = value;
        } else {
          if (!current[arrKey]) current[arrKey] = [];
          if (!current[arrKey][arrIdx]) current[arrKey][arrIdx] = {};
          current = current[arrKey][arrIdx];
        }
      } else {
        if (i === parts.length - 1) {
          current[part] = value;
        } else {
          if (!current[part] || typeof current[part] !== 'object') current[part] = {};
          current = current[part];
        }
      }
    }
  }

  /* ── Expose globally ── */
  global.__pwUseWizardState = useWizardState;
  global.__pwValidateStep = _validateStep;
  global.__pwDeepMerge = _deepMerge;
  global.__pwBudgetRulesNPF = BUDGET_RULES_NPF;

})(window);