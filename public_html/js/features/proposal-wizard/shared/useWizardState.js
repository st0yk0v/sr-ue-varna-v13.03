/* ═══════════════════════════════════════════════════════════════════════
 * useWizardState.js — State machine hook for Proposal Wizard v2.0
 * ═══════════════════════════════════════════════════════════════════════
 * useReducer-based state machine managing the 3-step proposal wizard.
 * Handles:
 *   - Step navigation (GO_TO_STEP, NEXT_STEP, PREV_STEP)
 *   - Field edits (EDIT_FIELD) with dirty tracking
 *   - Save state (SET_SAVED, SET_DIRTY)
 *   - Validation (SET_VALIDATION)
 *   - Conflict detection (CONFLICT_DETECTED, KEEP_LOCAL, LOAD_SERVER)
 *
 * Exposed globally as window.__pwUseWizardState.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var useState = React.useState;
  var useReducer = React.useReducer;
  var useCallback = React.useCallback;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  // ── Action types ─────────────────────────────────────────────────────
  var ACTIONS = {
    EDIT_FIELD: 'EDIT_FIELD',
    GO_TO_STEP: 'GO_TO_STEP',
    NEXT_STEP: 'NEXT_STEP',
    PREV_STEP: 'PREV_STEP',
    SET_SAVED: 'SET_SAVED',
    SET_DIRTY: 'SET_DIRTY',
    SET_VALIDATION: 'SET_VALIDATION',
    CONFLICT_DETECTED: 'CONFLICT_DETECTED',
    KEEP_LOCAL: 'KEEP_LOCAL',
    LOAD_SERVER: 'LOAD_SERVER',
    RESET: 'RESET'
  };

  /**
   * Reducer for the wizard state machine.
   * @param {Object} state — WizardState
   * @param {Object} action — { type, ...payload }
   * @returns {Object} — new WizardState
   */
  function wizardReducer(state, action) {
    switch (action.type) {
      case ACTIONS.EDIT_FIELD: {
        var step = action.step || state.currentStep;
        var stepKey = 'step' + step;
        var stepState = state[stepKey] || {};
        var newStepState = Object.assign({}, stepState, action.changes);
        var newState = Object.assign({}, state);
        newState[stepKey] = newStepState;
        newState.isDirty = true;
        return newState;
      }

      case ACTIONS.GO_TO_STEP: {
        return Object.assign({}, state, { currentStep: action.step });
      }

      case ACTIONS.NEXT_STEP: {
        return Object.assign({}, state, { currentStep: Math.min(state.currentStep + 1, 3) });
      }

      case ACTIONS.PREV_STEP: {
        return Object.assign({}, state, { currentStep: Math.max(state.currentStep - 1, 1) });
      }

      case ACTIONS.SET_SAVED: {
        var savedState = Object.assign({}, state, {
          isDirty: false,
          proposalId: action.proposalId || state.proposalId,
          rowVersion: action.rowVersion != null ? action.rowVersion : state.rowVersion,
          lastSavedAt: action.lastSavedAt || new Date().toISOString()
        });
        if (action.proposalId && !state.proposalId) {
          savedState.isDirty = false;
        }
        return savedState;
      }

      case ACTIONS.SET_DIRTY: {
        return Object.assign({}, state, { isDirty: action.isDirty });
      }

      case ACTIONS.SET_VALIDATION: {
        var valStep = 'step' + action.step;
        var newValidation = Object.assign({}, state.validation);
        newValidation[valStep] = {
          isValid: action.isValid,
          errors: action.errors || []
        };
        return Object.assign({}, state, { validation: newValidation });
      }

      case ACTIONS.CONFLICT_DETECTED: {
        return Object.assign({}, state, {
          _conflict: {
            serverVersion: action.serverVersion || 0,
            serverLastModifiedAt: action.serverLastModifiedAt || null,
            serverData: action.serverData || null
          }
        });
      }

      case ACTIONS.KEEP_LOCAL: {
        return Object.assign({}, state, {
          _conflict: null,
          rowVersion: state._conflict ? state._conflict.serverVersion : state.rowVersion
        });
      }

      case ACTIONS.LOAD_SERVER: {
        var serverData = (state._conflict && state._conflict.serverData) || action.serverData || {};
        var loadedState = Object.assign({}, state);
        if (serverData.step1) loadedState.step1 = Object.assign({}, state.step1, serverData.step1);
        if (serverData.step2) loadedState.step2 = Object.assign({}, state.step2, serverData.step2);
        if (serverData.step3) loadedState.step3 = Object.assign({}, state.step3, serverData.step3);
        if (serverData.currentStep) loadedState.currentStep = serverData.currentStep;
        if (serverData.rowVersion != null) loadedState.rowVersion = serverData.rowVersion;
        loadedState._conflict = null;
        loadedState.isDirty = false;
        loadedState.lastSavedAt = new Date().toISOString();
        return loadedState;
      }

      case ACTIONS.RESET: {
        return action.initialState || state;
      }

      default:
        return state;
    }
  }

  /**
   * Validate a single step's state.
   * @param {number} step — step number (1-3)
   * @param {Object} state — WizardState
   * @returns {{isValid: boolean, errors: Array<{field: string, message_bg: string}>}}
   */
  function validateStep(step, state) {
    var errors = [];

    if (step === 1) {
      var s1 = state.step1 || {};
      if (!s1.project_type) errors.push({ field: 'project_type', message_bg: 'Моля изберете тип проект.' });
      if (!s1.competition_session_id) errors.push({ field: 'competition_session_id', message_bg: 'Моля изберете конкурсна сесия.' });
      if (!s1.title_bg || s1.title_bg.trim().length < 5) errors.push({ field: 'title_bg', message_bg: 'Заглавието трябва да е между 5 и 250 символа.' });
      else {
        // T1 (EPIC-A): scientific-title format guards. Academic titles use Title
        // Case / proper nouns — reject all-lowercase and single-word stubs.
        var _t = s1.title_bg.trim();
        if (_t.length > 250) errors.push({ field: 'title_bg', message_bg: 'Заглавието трябва да е между 5 и 250 символа.' });
        else if (_t.split(/\s+/).filter(Boolean).length < 2) errors.push({ field: 'title_bg', message_bg: 'Заглавието трябва да съдържа поне две думи.' });
        else if (_t === _t.toLowerCase() && /[a-zа-я]/.test(_t)) errors.push({ field: 'title_bg', message_bg: 'Заглавието трябва да започва с главна буква и да използва правилен регистър.' });
      }
      if (!s1.abstract_bg || s1.abstract_bg.trim().length < 200) errors.push({ field: 'abstract_bg', message_bg: 'Резюмето трябва да е между 200 и 2000 символа.' });
      if (!s1.keywords || s1.keywords.length < 3) errors.push({ field: 'keywords', message_bg: 'Моля въведете между 3 и 10 ключови думи.' });
      if (!s1.duration_months || s1.duration_months < 6 || s1.duration_months > 36) errors.push({ field: 'duration_months', message_bg: 'Продължителността трябва да е между 6 и 36 месеца.' });
      if (!s1.department_id) errors.push({ field: 'department_id', message_bg: 'Моля изберете катедра.' });
      if (!s1.principal_investigator_id) errors.push({ field: 'principal_investigator_id', message_bg: 'Моля изберете ръководител на проекта.' });
    }

    if (step === 2) {
      var s2 = state.step2 || {};
      var docs = s2.documents || [];
      var requiredDocs = docs.filter(function (d) { return d.required; });
      var requiredReady = requiredDocs.filter(function (d) {
        return d.status === 'generated' || d.status === 'uploaded';
      });
      if (requiredReady.length < requiredDocs.length) {
        errors.push({
          field: 'documents',
          message_bg: 'Все още има незавършени задължителни документа (' + requiredReady.length + '/' + requiredDocs.length + ').'
        });
      }
    }

    if (step === 3) {
      var s3 = state.step3 || {};
      if (!s3.total_budget_field || s3.total_budget_field <= 0) {
        errors.push({ field: 'total_budget_field', message_bg: 'Моля, въведете обща стойност на проекта.' });
      }
      var totalPct = 0;
      if (Array.isArray(s3.budget_categories)) {
        s3.budget_categories.forEach(function (cat) {
          if (cat.code !== 'overhead') {
            totalPct += Number(cat.cap_percent) || 0;
          }
        });
      }
      // T3 (EPIC-A): per-project-type budget-category caps from __BUDGET_RULES__.
      var _pt = (state.step1 && state.step1.project_type) || '';
      var _rules = (typeof window !== 'undefined' && window.__BUDGET_RULES__) ? window.__BUDGET_RULES__[_pt] : null;
      if (_rules) {
        // Total budget ceiling per project type.
        if (_rules.totalCapEUR && s3.total_budget_field > _rules.totalCapEUR) {
          errors.push({ field: 'total_budget_field', message_bg: 'Общият бюджет за тип „' + _pt + '“ не може да надвишава ' + _rules.totalCapEUR + ' ' + (_rules.currency || 'EUR') + '.' });
        }
        // Per-category percentage caps.
        if (Array.isArray(s3.budget_categories) && Array.isArray(_rules.categories)) {
          s3.budget_categories.forEach(function (cat) {
            if (cat.code === 'overhead') return;
            var _r = _rules.categories.filter(function (c) { return c.key === cat.code; })[0];
            if (_r && typeof _r.maxPercent === 'number') {
              var _pct = Number(cat.cap_percent) || 0;
              if (_pct > _r.maxPercent) {
                errors.push({ field: 'budget_' + cat.code, message_bg: 'Категория „' + (cat.label || cat.code) + '“ не може да надвишава ' + _r.maxPercent + '%.' });
              }
            }
          });
        }
      }
    }

    return { isValid: errors.length === 0, errors: errors };
  }

  /**
   * Hook: useWizardState
   * @param {Object} [initialState] — partial initial state overrides
   * @returns {{state: Object, dispatch: Function, validate: Function, ACTIONS: Object}}
   */
  function useWizardState(initialState) {
    // Use __pwTypes if available for proper initial state creation
    var types = global.__pwTypes || {};
    var initial = types.createInitialState ?
      types.createInitialState(initialState || {}) :
      Object.assign({
        currentStep: 1,
        step1: {},
        step2: { documents: [] },
        step3: { total_budget_field: 0, budget_categories: [] },
        isDirty: false,
        proposalId: null,
        rowVersion: 0,
        lastSavedAt: null,
        validation: {
          step1: { isValid: false, errors: [] },
          step2: { isValid: false, errors: [] },
          step3: { isValid: false, errors: [] }
        },
        _conflict: null
      }, initialState || {});

    var ref = useReducer(wizardReducer, initial);
    var state = ref[0];
    var dispatch = ref[1];

    // ── Dispatch wrapper that adds the action type ─────────────────────
    var dispatchAction = useCallback(function (type, payload) {
      dispatch(Object.assign({ type: type }, payload || {}));
    }, []);

    // ── Validate function ────────────────────────────────────────────────
    var validate = useCallback(function (step) {
      step = step || state.currentStep;
      var result = validateStep(step, state);
      // Auto-update validation state
      dispatchAction(ACTIONS.SET_VALIDATION, {
        step: step,
        isValid: result.isValid,
        errors: result.errors
      });
      return result;
    }, [state, dispatchAction]);

    // ── Convenience dispatchers ─────────────────────────────────────────
    var dispatchers = {
      dispatch: dispatchAction,
      validate: validate,
      ACTIONS: ACTIONS,
      // Convenience methods
      editField: function (step, field, value) {
        dispatchAction(ACTIONS.EDIT_FIELD, {
          step: step,
          changes: (function () {
            var obj = {};
            obj[field] = value;
            return obj;
          })()
        });
      },
      goToStep: function (step) {
        dispatchAction(ACTIONS.GO_TO_STEP, { step: step });
      },
      nextStep: function () {
        dispatchAction(ACTIONS.NEXT_STEP);
      },
      prevStep: function () {
        dispatchAction(ACTIONS.PREV_STEP);
      },
      setSaved: function (payload) {
        dispatchAction(ACTIONS.SET_SAVED, payload);
      },
      setDirty: function (isDirty) {
        dispatchAction(ACTIONS.SET_DIRTY, { isDirty: isDirty });
      },
      setValidation: function (step, isValid, errors) {
        dispatchAction(ACTIONS.SET_VALIDATION, { step: step, isValid: isValid, errors: errors });
      },
      conflictDetected: function (payload) {
        dispatchAction(ACTIONS.CONFLICT_DETECTED, payload);
      },
      keepLocal: function () {
        dispatchAction(ACTIONS.KEEP_LOCAL);
      },
      loadServer: function (payload) {
        dispatchAction(ACTIONS.LOAD_SERVER, payload);
      },
      reset: function (newState) {
        dispatchAction(ACTIONS.RESET, { initialState: newState });
      }
    };

    return dispatchers;
  }

  // ── Expose globally ──────────────────────────────────────────────────
  global.__pwUseWizardState = useWizardState;
  global.__pwWizardActions = ACTIONS;

})(window);
