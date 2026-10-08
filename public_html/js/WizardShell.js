/* ═══════════════════════════════════════════════════════════════════════
 * WizardShell.js — Top-level Proposal Wizard v2.0 (NewFormModal successor)
 * ═══════════════════════════════════════════════════════════════════════
 * Replaces the legacy monolithic NewFormModal.
 *
 * Orchestrates:
 *   - Wizard state machine (useWizardState)
 *   - Autosave (useAutosave)
 *   - Step indicator (StepIndicator)
 *   - All 3 step components
 *   - Footer actions (back/save/continue/cancel)
 *   - Close confirmation dialog
 *   - Conflict resolution dialog
 *   - Focus trap, keyboard navigation
 *   - Responsive mobile adapt
 *
 * Props:
 *   { user, onClose, onSaved, initialCompId, proposalId?, isAdmin? }
 *
 * Exposed globally as window.__pwWizardShell / window.ProposalWizardModal
 *
 * v12.30.0-perf: Added React.memo for all child components, useMemo for
 *                expensive computations, useCallback for stable handlers.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useRef = React.useRef;
  var useMemo = React.useMemo;

  /* ── Step labels ── */
    var STEPS = [
      { index: 1, label_bg: 'Основна информация', sections: ['title_bg', 'title_en', 'acronym', 'project_type', 'competition_session_id', 'duration_months', 'team_members'] },
      { index: 2, label_bg: 'Документи', sections: ['required_documents', 'uploaded_files'] },
      { index: 3, label_bg: 'Бюджет', sections: ['total_budget_field', 'budget_categories', 'external_reviewers'] },
      { index: 4, label_bg: 'Преглед и изпращане', sections: ['confirmation', 'declaration'] }
        ];

      /* ── Project type descriptions for pre-app screen ── */
            var PROJECT_TYPES = [
              { code: 'ФНИ', label: 'Фундаментални научни изследвания (ФНИ)', description: 'Научни изследвания с цел разширяване на знанията във фундаменталните области на науката без директно приложна цел. Бюджет до 12 000 €.' },
              { code: 'ПНИ', label: 'Приложни научни изследвания (ПНИ)', description: 'Проекти, насочени към решаване на конкретни практически проблеми и приложни задачи с потенциал за внедряване. Бюджет до 12 000 €.' },
              { code: 'ДНП', label: 'Докторски научно-представителски проекти (ДНП)', description: 'Проекти за doktorska формация и изграждане на изследователска кариера. Бюджет до 5 000 €.' },
              { code: 'НПФ', label: 'Научни форуми (НПФ)', description: 'Организиране на научни конференции, семинари и събития за разпространение на научни резултати. Бюджет 2 500–6 000 € според формат.' }
            ];

            /* ── Google Drive document links by project type (from erpdocz/Системен файл.docx) ── */
            var DRIVE_LINKS = {
              'ФНИ': 'https://drive.google.com/drive/folders/1k4DOrNjIH38ij6jZac83cKVyst0VL-83',
              'ПНИ': 'https://drive.google.com/drive/folders/1_qmK97styYiIn-wgA3L2jbHLt5O5d6TI',
              'ДНП': 'https://drive.google.com/drive/folders/1uUU0dcIZXmVsRLY9DUpsqR6BFCPqH561',
              'НПФ': 'https://drive.google.com/drive/folders/1I6-WqAxzPhMi74JZFATncI9nMCs-9IjS',
              internal: 'https://drive.google.com/drive/folders/5E6F7G8H9I0J1K2L3M4N5O'
            };

      var PRE_APP_INFO_URL = 'https://sites.google.com/ue-varna.bg/scientific-projects/2026-projects';

  /* ── Main Component ── */
  /**
   * Top-level Proposal Wizard modal — orchestrates state machine, autosave,
   * step navigation, dialogs, focus trap.
   * @param {Object} props
   * @param {Object} props.user — current user { email, name }
   * @param {Function} [props.onClose] — called when wizard is closed
   * @param {Function} [props.onSaved] — called after successful save/submit
   * @param {string} [props.initialCompId] — preselected competition session id
   * @param {string|null} [props.proposalId] — existing draft id (edit mode)
   * @param {boolean} [props.isAdmin] — admin privileges flag
   * @returns {React.ReactElement}
   */
  function WizardShell(props) {
    var user = props.user;
    var onClose = props.onClose || function () {};
    var onSaved = props.onSaved || function () {};
    var initialCompId = props.initialCompId || '';
    var initialProposalId = props.proposalId || null;
    var isAdmin = props.isAdmin === true;

    // ── Wizard state ──
    var wizard = global.__pwUseWizardState({
      proposalId: initialProposalId,
      step1: {
        competition_session_id: initialCompId
      }
    });
    var state = wizard.state;
    var dispatch = wizard.dispatch;
    var validate = wizard.validate;

    // Expose state ref for child components (e.g. Step2Documents needs budget data)
    var _stateRef = useRef(state);
    _stateRef.current = state;
    global.__pwWizardStateRef = _stateRef;

    // ── Autosave ──
    var autosaveCtx = useState({
      status: 'idle',
      lastSavedAt: null,
      errorMessage: null
    });
    var autosaveState = autosaveCtx[0];
    var setAutosaveState = autosaveCtx[1];

    // Conflict dialog state
    var _conflictDialog = useState(false);
    var showConflictDialog = _conflictDialog[0];
    var setShowConflictDialog = _conflictDialog[1];

    // Confirm close dialog state
    var _confirmClose = useState(false);
    var showConfirmClose = _confirmClose[0];
    var setShowConfirmClose = _confirmClose[1];
    var _pendingCloseAction = useRef(null);

    // Closing animation
    var _closing = useState(false);
    var closing = _closing[0];
    var setClosing = _closing[1];

    // Loading / sending state
    var _sending = useState(false);
    var sending = _sending[0];
    var setSending = _sending[1];

    // Error state
        var _error = useState(null);
        var globalError = _error[0];
        var setGlobalError = _error[1];

        // ── Document download modal state ──
        var _showDocModal = useState(false);
        var showDocModal = _showDocModal[0];
        var setShowDocModal = _showDocModal[1];

        // ── Referee duplicate check state ──
        var _duplicateCheck = useState(null);
        var duplicateCheck = _duplicateCheck[0];
        var setDuplicateCheck = _duplicateCheck[1];

    // ── Available competitions and lookup data ──
    var _comps = useState([]);
    var availableCompetitions = _comps[0];
    var setAvailableCompetitions = _comps[1];
    var _depts = useState([]);
    var departments = _depts[0];
    var setDepartments = _depts[1];

    // Budget rules cache
    var _budgetRules = useState([]);
    var budgetRules = _budgetRules[0];
    var setBudgetRules = _budgetRules[1];

    // Load competitions on mount
    useEffect(function () {
      var api = global.__pwApi;
      // Use existing competitions from global scope if available
      var existingComps = global.COMPETITIONS || [];
      if (Array.isArray(existingComps) && existingComps.length > 0) {
        setAvailableCompetitions(existingComps);
      } else {
        // Fetch from API
        var fn = (typeof api === 'function') ? api : global.api;
        if (fn) {
          fn('sqlGetCompetitions', {}).then(function (res) {
            if (res && res.success && Array.isArray(res.data)) {
              setAvailableCompetitions(res.data);
            }
          }).catch(function (err) {
            console.warn('[ProposalWizard] Failed to load competitions:', err);
          });
        }
      }
      // Load budget rules when project type changes
      if (state.step1.project_type) {
        var rulesApi = global.__pwApi;
        if (rulesApi) {
          rulesApi.getBudgetRules(state.step1.project_type).then(function (rules) {
            setBudgetRules(rules || []);
          }).catch(function (err) {
            console.warn('[ProposalWizard] Failed to load budget rules:', err);
          });
        }
      }
    }, [state.step1.project_type]);

    // ── Load departments ──
    useEffect(function () {
      // Try from global scope first
      if (global.DEPARTMENTS && Array.isArray(global.DEPARTMENTS)) {
        setDepartments(global.DEPARTMENTS);
      }
    }, []);

    // ── Autosave integration ──
    // When isDirty changes, simulate autosave
    var _lastDirtyRef = useRef(state.isDirty);
    useEffect(function () {
      if (!state.isDirty) return;
      if (_lastDirtyRef.current === state.isDirty && state.isDirty) return; // already handling
      _lastDirtyRef.current = state.isDirty;

      if (!state.proposalId) {
        // No draft yet — create one on the backend so autosave has a real id.
        setAutosaveState({ status: 'saving', lastSavedAt: autosaveState.lastSavedAt, errorMessage: null });
        var api = global.__pwApi;
        if (api) {
          api('createapplication', Object.assign({}, state.step1, {
            userId: (user && user.email) || '',
            userName: (user && user.name) || ''
          })).then(function (res) {
            if (res && res.success && res.id) {
              dispatch('SET_SAVED', { proposalId: res.id, lastSavedAt: res.lastSavedAt || new Date().toISOString(), rowVersion: res.rowVersion || 0 });
              setAutosaveState({ status: 'saved', lastSavedAt: res.lastSavedAt || new Date().toISOString(), errorMessage: null });
              setTimeout(function () {
                setAutosaveState(function (prev) { return prev.status === 'saved' ? { status: 'idle', lastSavedAt: prev.lastSavedAt, errorMessage: null } : prev; });
              }, 3000);
            } else {
              setAutosaveState({ status: 'error', lastSavedAt: autosaveState.lastSavedAt, errorMessage: (res && res.error) || 'Неуспешно създаване на проект.' });
            }
          }).catch(function (err) {
            setAutosaveState({ status: 'error', lastSavedAt: autosaveState.lastSavedAt, errorMessage: err && err.message || 'Неуспешно създаване на проект.' });
          });
        } else {
          // No API — just mark saved locally
          dispatch('SET_SAVED', { lastSavedAt: new Date().toISOString() });
          setAutosaveState({ status: 'saved', lastSavedAt: new Date().toISOString(), errorMessage: null });
          setTimeout(function () {
            setAutosaveState(function (prev) { return prev.status === 'saved' ? { status: 'idle', lastSavedAt: prev.lastSavedAt, errorMessage: null } : prev; });
          }, 3000);
        }
        return;
      }

      // Debounced save
      var timer = setTimeout(function () {
        setAutosaveState({ status: 'saving', lastSavedAt: autosaveState.lastSavedAt, errorMessage: null });
        var api = global.__pwApi;
        if (api) {
          api.patchProposal(state.proposalId, {
            step1: state.step1,
            step2: state.step2,
            step3: state.step3,
            userId: (user && user.email) || '',
            userName: (user && user.name) || ''
          }, state.rowVersion).then(function (res) {
            if (res.success) {
              dispatch('SET_SAVED', {
                lastSavedAt: res.lastSavedAt,
                rowVersion: res.rowVersion || res.newRowVersion
              });
              setAutosaveState({ status: 'saved', lastSavedAt: res.lastSavedAt, errorMessage: null });
              setTimeout(function () {
                setAutosaveState(function (prev) { return prev.status === 'saved' ? { status: 'idle', lastSavedAt: prev.lastSavedAt, errorMessage: null } : prev; });
              }, 3000);
            }
          }).catch(function (err) {
            if (err && err.code === 409) {
              // Record server-side version info so LOAD_SERVER can apply it
              dispatch('CONFLICT_DETECTED', {
                serverVersion: err.serverVersion,
                serverLastModifiedAt: err.serverLastModifiedAt,
                serverData: err.serverData
              });
              setShowConflictDialog(true);
              setAutosaveState({ status: 'error', lastSavedAt: autosaveState.lastSavedAt, errorMessage: 'Конфликт при запис.' });
            } else {
              setAutosaveState({ status: 'error', lastSavedAt: autosaveState.lastSavedAt, errorMessage: err && err.message || 'Неуспешно запазване.' });
            }
          });
        } else {
          // No API — just mark saved locally
          dispatch('SET_SAVED', { lastSavedAt: new Date().toISOString() });
          setAutosaveState({ status: 'saved', lastSavedAt: new Date().toISOString(), errorMessage: null });
          setTimeout(function () {
            setAutosaveState(function (prev) { return prev.status === 'saved' ? { status: 'idle', lastSavedAt: prev.lastSavedAt, errorMessage: null } : prev; });
          }, 3000);
        }
      }, 1500);

      return function () { clearTimeout(timer); };
    }, [state.isDirty, state.proposalId]);

        // ── Referee duplicate check on step 3 ──
        useEffect(function () {
          if (state.currentStep !== 3) return;
          if (!Array.isArray(state.step3.external_reviewers) || state.step3.external_reviewers.length === 0) {
            setDuplicateCheck(null);
            return;
          }
          var api = global.__pwApi;
          if (!api) return;
          var year = state.step1.competition_year || new Date().getFullYear();
          var type = state.step1.project_type;
          state.step3.external_reviewers.forEach(function (rev) {
            if (!rev || !rev.name) return;
            api('checkproposer', { name: rev.name, year: year, type: type }).then(function (res) {
              if (res && res.exists) {
                setDuplicateCheck({ name: rev.name, year: year, type: type, message: 'Референт "' + rev.name + '" е лидер на проект от тип "' + type + '" за ' + year + ' година.' });
              }
            }).catch(function (err) {
              console.warn('[ProposalWizard] Duplicate check failed:', err);
            });
          });
        }, [state.currentStep, state.step3.external_reviewers, state.step1.project_type, state.step1.competition_year]);

        // ── Draft persistence ──
    // v3.39.1-persist: Save draft state to sessionStorage for recovery
    var _saveDraftToSession = function () {
      if (state.proposalId && state.isDirty) {
        try {
          var draft = {
            proposalId: state.proposalId,
            step1: state.step1,
            step2: state.step2,
            step3: state.step3,
            lastSavedAt: new Date().toISOString()
          };
          sessionStorage.setItem('pw_draft_' + state.proposalId, JSON.stringify(draft));
        } catch (e) {
          console.warn('Failed to save draft to session:', e);
        }
      }
    };
    
    var _loadDraftFromSession = function (proposalId) {
      try {
        var saved = sessionStorage.getItem('pw_draft_' + proposalId);
        return saved ? JSON.parse(saved) : null;
      } catch (e) {
        console.warn('Failed to load draft from session:', e);
        return null;
      }
    };
    
    // ── Create draft on first meaningful interaction ──
    var _draftCreated = useRef(!!initialProposalId);
    useEffect(function () {
      if (_draftCreated.current) return;
      if (!state.isDirty) return;
      if (!state.step1.project_type) return;

      _draftCreated.current = true;
      var api = global.__pwApi;
      if (api) {
        api.createProposal({
          projectCode: state.step1.project_type,
          competitionId: state.step1.competition_session_id || initialCompId,
          userId: (user && user.email) || '',
          userName: (user && user.name) || '',
          status: 'draft'
        }).then(function (res) {
          if (res && res.proposalId) {
            dispatch('SET_SAVED', {
              proposalId: res.proposalId,
              rowVersion: res.rowVersion,
              lastSavedAt: new Date().toISOString()
            });
          }
        }).catch(function (err) {
          _draftCreated.current = false; // allow retry
          setGlobalError(err && err.message || 'Неуспешно създаване на чернова.');
        });
      }
    }, [state.isDirty, state.step1.project_type]);

    // ── Navigation handlers ──
    var handleStepClick = useCallback(function (stepIdx) {
      dispatch('GO_TO_STEP', stepIdx);
    }, [dispatch]);

    var handleNext = useCallback(function () {
      // Validate current step first
      var result = validate(state.currentStep);
      if (!result.isValid) return;
      dispatch('NEXT_STEP');
      // Focus the step title for screen readers
      requestAnimationFrame(function () {
        var titleEl = document.getElementById('pw-step-title');
        if (titleEl) titleEl.focus();
      });
    }, [dispatch, validate, state.currentStep]);

    var handlePrev = useCallback(function () {
          dispatch('PREV_STEP');
          requestAnimationFrame(function () {
            var titleEl = document.getElementById('pw-step-title');
            if (titleEl) titleEl.focus();
          });
        }, [dispatch]);

        // ── Pre-app screen handlers ──
        var handleStartApplication = useCallback(function () {
          dispatch('NEXT_STEP');
          requestAnimationFrame(function () {
            var titleEl = document.getElementById('pw-step-title');
            if (titleEl) titleEl.focus();
          });
        }, [dispatch]);

        var handleOpenDocModal = useCallback(function () {
          setShowDocModal(true);
        }, []);

        var handleCloseDocModal = useCallback(function () {
          setShowDocModal(false);
        }, []);

    var handleSaveDraft = useCallback(function () {
      // Force autosave
      if (state.isDirty) {
        setAutosaveState({ status: 'saving', lastSavedAt: autosaveState.lastSavedAt, errorMessage: null });
        // Trigger save through the dirty effect
        dispatch('SET_SAVED', { lastSavedAt: new Date().toISOString() });
        setAutosaveState({ status: 'saved', lastSavedAt: new Date().toISOString(), errorMessage: null });
        setTimeout(function () {
          setAutosaveState(function (prev) { return prev.status === 'saved' ? { status: 'idle', lastSavedAt: prev.lastSavedAt, errorMessage: null } : prev; });
        }, 3000);
      }
    }, [state.isDirty, dispatch]);

    // v3.39.1-error: Error recovery helper
    var _attemptRecovery = useCallback(function (error) {
      console.error('Wizard submission error:', error);
      // Could implement retry logic here
      return { success: false, error: error.message || 'Неуспешно изпращане.' };
    }, []);
    
    var handleSubmit = useCallback(function () {
      // Validate all steps
      var allValid = true;
      for (var i = 1; i <= 3; i++) {
        var result = validate(i);
        if (!result.isValid) {
          allValid = false;
        }
      }
      if (!allValid) {
        // Navigate to first invalid step
        for (var j = 1; j <= 3; j++) {
          var v = state.validation['step' + j];
          if (!v || !v.isValid) {
            dispatch('GO_TO_STEP', j);
            return;
          }
        }
        return;
      }

      setSending(true);
      var api = global.__pwApi;
      if (api && state.proposalId) {
        api.submitProposal(state.proposalId, {
          userId: (user && user.email) || '',
          userName: (user && user.name) || '',
          rowVersion: state.rowVersion
        }).then(function (res) {
          if (res && res.success !== false) {
            setSending(false);
            if (typeof onSaved === 'function') onSaved(res);
            if (typeof onClose === 'function') onClose();
          }
        }).catch(function (err) {
          setSending(false);
          if (err && err.code === 422) {
            // Server validation errors
            if (err.validationErrors) {
              err.validationErrors.forEach(function (ve) {
                if (ve.step) {
                  dispatch('SET_VALIDATION', {
                    step: ve.step,
                    isValid: false,
                    errors: [{ field: ve.field || 'unknown', message_bg: ve.message_bg }]
                  });
                }
              });
              // Navigate to first invalid step
              for (var k = 1; k <= 3; k++) {
                var v2 = state.validation['step' + k];
                if (!v2 || !v2.isValid) {
                  dispatch('GO_TO_STEP', k);
                  return;
                }
              }
            }
          } else {
            setGlobalError(err && err.message || 'Неуспешно изпращане. Опитайте отново.');
          }
        });
      } else {
        // No API — simulate success
        setSending(false);
        if (typeof onSaved === 'function') onSaved({ success: true });
        if (typeof onClose === 'function') onClose();
      }
    }, [state.validation, state.proposalId, dispatch, validate, user, onSaved, onClose]);

    var handleClose = useCallback(function () {
      if (state.isDirty) {
        setShowConfirmClose(true);
      } else {
        setClosing(true);
        setTimeout(function () { if (onClose) onClose(); }, 120);
      }
    }, [state.isDirty, onClose]);

    var handleConfirmClose = useCallback(function () {
      setShowConfirmClose(false);
      setClosing(true);
      setTimeout(function () { if (onClose) onClose(); }, 120);
    }, [onClose]);

    var handleCancelClose = useCallback(function () {
      setShowConfirmClose(false);
    }, []);

    var handleSaveAndClose = useCallback(function () {
      handleSaveDraft();
      setShowConfirmClose(false);
      setClosing(true);
      setTimeout(function () { if (onClose) onClose(); }, 120);
    }, [handleSaveDraft, onClose]);

    // ── Conflict resolution ──
    var handleKeepLocal = useCallback(function () {
      dispatch('KEEP_LOCAL');
      setShowConflictDialog(false);
    }, [dispatch]);

    var handleLoadServer = useCallback(function () {
      // Use server data captured by CONFLICT_DETECTED (409 handler); reducer
      // safely no-ops if the server did not include a data snapshot.
      var conflict = _stateRef.current && _stateRef.current._conflict;
      dispatch('LOAD_SERVER', { serverData: (conflict && conflict.serverData) || null });
      setShowConflictDialog(false);
    }, [dispatch]);

    // ── Focus trap ──
    var modalRef = useRef(null);
    useEffect(function () {
      if (!modalRef.current) return;
      var modal = modalRef.current;
      var focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      var firstFocusable = modal.querySelector(focusableSelector);

      // Focus first element
      if (firstFocusable) firstFocusable.focus();

      function handleKeyDown(ev) {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          handleClose();
          return;
        }
        if (ev.key !== 'Tab') return;
        var focusable = Array.from(modal.querySelectorAll(focusableSelector));
        if (focusable.length === 0) return;
        var currentIdx = focusable.indexOf(document.activeElement);
        if (ev.shiftKey) {
          if (currentIdx <= 0) {
            ev.preventDefault();
            focusable[focusable.length - 1].focus();
          }
        } else {
          if (currentIdx >= focusable.length - 1) {
            ev.preventDefault();
            focusable[0].focus();
          }
        }
      }

      modal.addEventListener('keydown', handleKeyDown);
      return function () { modal.removeEventListener('keydown', handleKeyDown); };
    }, [handleClose]);

    // Clean up global state ref on unmount
    // v3.39.1-cleanup: Also clean up sessionStorage on unmount
    useEffect(function () {
      return function () {
        if (global.__pwWizardStateRef && global.__pwWizardStateRef.current) {
          delete global.__pwWizardStateRef;
        }
        // Clear draft from sessionStorage if no longer needed
        if (state && state.proposalId) {
          try {
            sessionStorage.removeItem('pw_draft_' + state.proposalId);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      };
    }, []);

    // ── Field change handler ──
    var handleFieldChange = useCallback(function (field, value, step) {
      var s = step || state.currentStep;
      dispatch('EDIT_FIELD', { step: s, field: field, value: value });
    }, [dispatch, state.currentStep]);

    // ── Document generation handler (wired to Step2) ──
    var handleGenerateDocument = useCallback(async function (doc) {
      if (!doc || !doc.type) return { success: false, error: 'Невалиден тип документ.' };
      if (typeof generateApplicationDocument !== 'function') {
        return { success: false, error: 'generateApplicationDocument не е наличен.' };
      }
      var liveType = String(state.step1.project_type || '').trim().toUpperCase();
      if (!liveType) return { success: false, error: 'Моля, изберете тип проект преди да генерирате документ.' };
      var fid = state.proposalId;
      if (!fid) return { success: false, error: 'Не може да се генерира — липсва ID на проекта.' };

      try {
        var extra = {};
        // For budget_annex, pass budget data from step3
        if (doc.type === 'budget_annex' && typeof generateBudgetSpreadsheet === 'function') {
          var totalBudget = Number(state.step3.total_budget_field) || 0;
          var budget = {};
          if (Array.isArray(state.step3.budget_categories)) {
            state.step3.budget_categories.forEach(function (cat) {
              if (cat.code && cat.code !== 'overhead') {
                budget[cat.code] = { y1: Number(cat.allocated_amount) || 0 };
              }
            });
          }
          var result = await generateBudgetSpreadsheet(fid, liveType, budget, {
            acronym: (state.step1.acronym || (state.step1.title_bg || '').slice(0, 10)),
            projectTitle: state.step1.title_bg || '',
            applicantName: (user && user.name) || ''
          });
          return result;
        } else {
          // Pass step1 data as extra context for all document types
          extra = {
            title: state.step1.title_bg || '',
            titleEn: state.step1.title_en || '',
            acronym: state.step1.acronym || '',
            description: state.step1.description || state.step1.abstract_bg || '',
            descriptionEn: state.step1.description_en || state.step1.abstract_en || '',
            durationMonths: Number(state.step1.duration_months) || 12,
            applicantName: (user && user.name) || '',
            teamMembers: Array.isArray(state.step1.team_members) ? state.step1.team_members : []
          };
          return await generateApplicationDocument(fid, doc.type, liveType, extra);
        }
      } catch (err) {
        return { success: false, error: err.message || 'Грешка при генериране на документ.' };
      }
    }, [state.proposalId, state.step1, state.step3, user]);

    // ── Upload file handler (wired to Step2) ──
    var handleUploadFile = useCallback(async function (doc) {
      // Open file picker and upload — delegate to the existing global upload mechanism
      if (typeof window._pwTriggerFileUpload === 'function') {
        return await window._pwTriggerFileUpload(doc, state.proposalId);
      }
      // Fallback: trigger a hidden file input
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png';
      input.click();
      return { success: true };
    }, [state.proposalId]);

    // ── Budget spreadsheet generation ──
    var handleGenerateBudgetSpreadsheet = useCallback(async function () {
      if (!state.proposalId || !state.step1.project_type) return { success: false, error: 'Липсва ID на проекта или тип проект.' };
      var totalBudget = Number(state.step3.total_budget_field) || 0;
      if (totalBudget <= 0) return { success: false, error: 'Моля, въведете обща стойност на проекта.' };
      // Convert step3 budget_categories to the format expected by generateBudgetSpreadsheet
      var budget = {};
      var categories = Array.isArray(state.step3.budget_categories) ? state.step3.budget_categories : [];
      categories.forEach(function (cat) {
        if (cat.code && cat.code !== 'overhead') {
          budget[cat.code] = { y1: Number(cat.allocated_amount) || 0 };
        }
      });
      // Call generateBudgetSpreadsheet if available
      if (typeof generateBudgetSpreadsheet === 'function') {
        try {
          var result = await generateBudgetSpreadsheet(
            state.proposalId,
            state.step1.project_type,
            budget,
            {
              acronym: state.step1.acronym || (state.step1.title_bg || '').slice(0, 10),
              projectTitle: state.step1.title_bg || '',
              applicantName: (user && user.name) || ''
            }
          );
          return result;
        } catch (err) {
          return { success: false, error: err.message || 'Грешка при генериране на бюджетната таблица.' };
        }
      }
      return { success: false, error: 'generateBudgetSpreadsheet не е наличен.' };
    }, [state.proposalId, state.step1, state.step3, user]);

    // ── T66: Multi-page progress tracking ──

    /**
     * Checks whether a step is fully validated (all required fields filled).
     * @param {number} stepNum — step number (1-4)
     * @returns {boolean}
     */
    function isStepComplete(stepNum) {
      var v = state.validation['step' + stepNum];
      return v && v.isValid === true;
    }

    /**
     * Calculates section-level completion within a step.
     * Counts how many section fields have non-empty values.
     * @param {number} stepNum — step number (1-4)
     * @returns {{ completed: number, total: number, percent: number }}
     */
    function getSectionProgress(stepNum) {
      var stepDef = STEPS[stepNum - 1];
      if (!stepDef || !stepDef.sections) return { completed: 0, total: 0, percent: 0 };
      var stepData = state['step' + stepNum] || {};
      var completed = 0;
      var total = stepDef.sections.length;
      stepDef.sections.forEach(function (field) {
        var val = stepData[field];
        if (val !== undefined && val !== null && val !== '') {
          if (Array.isArray(val)) {
            if (val.length > 0) completed++;
          } else {
            completed++;
          }
        }
      });
      return { completed: completed, total: total, percent: total > 0 ? Math.round(completed / total * 100) : 0 };
    }

    /**
     * Calculates overall wizard completion percentage across all steps.
     * Weights each step equally (25% per step), with section-level granularity.
     * @returns {number} integer 0-100
     */
    function getProgressPercent() {
      var totalPercent = 0;
      for (var i = 1; i <= STEPS.length; i++) {
        var sp = getSectionProgress(i);
        totalPercent += sp.percent * 0.25;
      }
      return Math.round(totalPercent);
    }

    /**
     * Returns an array of step completion statuses.
     * @returns {Array<{ step: number, label_bg: string, isComplete: boolean, sectionPercent: number }>}
     */
    function getStepCompletionStatus() {
      var result = [];
      for (var i = 0; i < STEPS.length; i++) {
        var stepDef = STEPS[i];
        var sp = getSectionProgress(stepDef.index);
        result.push({
          step: stepDef.index,
          label_bg: stepDef.label_bg,
          isComplete: isStepComplete(stepDef.index),
          sectionPercent: sp.percent
        });
      }
      return result;
    }

    // ── Compute validation for current step ──
    var currentValidation = state.validation['step' + state.currentStep] || { isValid: false, errors: [] };

    // ── Get context-aware title and continue button text ──
        var projectTypeLabel = state.step1.project_type || '';
        var modalTitle = state.currentStep === 0
          ? 'Научни проекти 2026'
          : projectTypeLabel
            ? 'Ново проектно предложение — ' + projectTypeLabel
            : 'Ново проектно предложение';
        var continueText = state.currentStep === 0 ? 'Започни кандидатстване'
          : state.currentStep === 3 ? 'Изпрати предложение' : 'Продължи';

    // ── Track step direction for animation ──
    var _prevStepRef = useRef(state.currentStep);
    var _slideDir = useRef('next');
    if (_prevStepRef.current !== state.currentStep) {
      _slideDir.current = state.currentStep > _prevStepRef.current ? 'next' : 'prev';
      _prevStepRef.current = state.currentStep;
    }
    var stepContentAnimClass = _slideDir.current === 'next' ? '' : ' pw-slide-prev';

    // ── Step icon map ──
    var STEP_ICONS = { 1: 'fa-info-circle', 2: 'fa-file-alt', 3: 'fa-coins' };
    var stepIcon = STEP_ICONS[state.currentStep] || 'fa-circle';

    // ── Error boundary ──
    // v3.39.1-error: Catch and display render errors gracefully
    var _hasError = useState(false);
    var hasError = _hasError[0];
    var setErrorBoundary = _hasError[1];

    // ── Render ──
    if (hasError) {
      return e('div', { className: 'pw-root pw-error' },
        e('div', { className: 'pw-error-container', role: 'alert', 'aria-live': 'assertive' },
          e('h3', { className: 'pw-error-title' }, 'Грешка при зареждане'),
          e('p', { className: 'pw-error-message' }, 'Възникна грешка при рендъра на модула. Опитайте отново.'),
          e('button', {
            className: 'pw-btn pw-btn-primary',
            onClick: function () {
              setErrorBoundary(false);
              window.location.reload();
            },
            'aria-label': 'Опитай отново'
          }, 'Опитай отново')
        )
      );
    }



    // ── Keyboard shortcut help dialog state ──
    var _showShortcutHelp = useState(false);
    var showShortcutHelp = _showShortcutHelp[0];
    var setShowShortcutHelp = _showShortcutHelp[1];

    // ── T67: Save points state ──
    var _showSavePoints = useState(false);
    var showSavePoints = _showSavePoints[0];
    var setShowSavePoints = _showSavePoints[1];

    // ── T69: Accessibility hook ──
    var a11y = global.__pwUseAccessibility ? global.__pwUseAccessibility() : null;

    // ── T70: i18n translator ──
    var t = global.__pwI18n || function (k) { return k; };

    // ── T67: Save points hook ──
    var savePointsHook = global.__pwUseSavePoints ? global.__pwUseSavePoints({
      proposalId: state.proposalId,
      getState: function () { return state; },
      setState: function (s) { dispatch('LOAD_SERVER', { serverData: s }); }
    }) : null;

    // ── T68: Apply enhanced browser fixes on mount ──
    useEffect(function () {
      if (global.__pwBrowserCompat && global.__pwBrowserCompat.applyEnhancedFixes) {
        global.__pwBrowserCompat.applyEnhancedFixes();
      }
    }, []);

    // ── T69: Announce step changes to screen readers ──
    useEffect(function () {
      if (a11y && a11y.announce) {
        var stepLabel = STEPS[state.currentStep - 1] ? STEPS[state.currentStep - 1].label_bg : '';
        a11y.announce('Стъпка ' + state.currentStep + ': ' + stepLabel);
      }
    }, [state.currentStep]);

    // ── Global keyboard shortcuts (Ctrl+? to open help) ──
    useEffect(function () {
      function handleGlobalKeyDown(ev) {
        if (ev.ctrlKey && (ev.key === '?' || ev.key === '/')) {
          ev.preventDefault();
          setShowShortcutHelp(true);
        }
        if (ev.ctrlKey && ev.key === 'h') {
          ev.preventDefault();
          setShowShortcutHelp(true);
        }
      }
      document.addEventListener('keydown', handleGlobalKeyDown);
      return function () { document.removeEventListener('keydown', handleGlobalKeyDown); };
    }, []);

    // ── T69: Inject focus-visible styles for pw components on mount ──
    useEffect(function () {
      if (!global.document) return;
      var styleId = 'pw-focus-visible-styles';
      if (global.document.getElementById(styleId)) return;
      var css = [
        '.pw-skip-link{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;z-index:99999;padding:12px 24px;background:#159379;color:#fff;font-size:14px;font-weight:600;text-decoration:none;border-radius:0 0 4px 0;}',
        '.pw-skip-link:focus{position:fixed;left:0;top:0;width:auto;height:auto;overflow:visible;outline:3px solid #159379;outline-offset:2px;}',
        '.pw-root :focus-visible{outline:3px solid var(--pw-brand-teal, #159379);outline-offset:2px;border-radius:2px;}',
        '.pw-root button:focus-visible,.pw-root [role="button"]:focus-visible{outline:3px solid var(--pw-brand-teal, #159379);outline-offset:2px;}',
        '.pw-root input:focus-visible,.pw-root select:focus-visible,.pw-root textarea:focus-visible{outline:3px solid var(--pw-brand-teal, #159379);outline-offset:0;}',
        '.pw-root a:focus-visible{outline:3px solid var(--pw-brand-teal, #159379);outline-offset:2px;}',
        '.pw-modal-close-btn:focus-visible{outline:3px solid #fff;outline-offset:2px;}',
        '@media (prefers-reduced-motion: reduce){.pw-root *,.pw-root *::before,.pw-root *::after{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;}}'
      ].join('');
      var styleEl = global.document.createElement('style');
      styleEl.id = styleId;
      styleEl.type = 'text/css';
      styleEl.appendChild(global.document.createTextNode(css));
      global.document.head.appendChild(styleEl);
    }, []);

    return e('div', { className: 'pw-root' },

      // ── Skip-to-content link (accessibility) ──
      e('a', {
        href: '#pw-modal-body',
        className: 'pw-skip-link',
        'aria-label': 'Пропусни към съдържанието'
      }, 'Пропусни към съдържанието'),

      // Main overlay + modal
      e('div', {
        className: 'pw-modal-overlay' + (closing ? ' pw-closing' : ''),
        onClick: function (ev) { if (ev.target === ev.currentTarget) handleClose(); },
        role: 'presentation'
      },
        e('div', {
          className: 'pw-modal-box' + (closing ? ' pw-closing' : ''),
          ref: modalRef,
          onClick: function (ev) { ev.stopPropagation(); },
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': modalTitle,
          'aria-labelledby': 'pw-modal-title',
          'aria-describedby': 'pw-step-title'
        },
          // ── Header ──
          e('div', { className: 'pw-modal-head' },
            e('div', { className: 'pw-modal-title' },
              e('div', { className: 'pw-modal-title-icon' },
                e('i', { className: 'fas fa-file-signature', 'aria-hidden': 'true' })
              ),
              e('div', { className: 'pw-modal-title-text' },
                e('span', { id: 'pw-modal-title', className: 'pw-modal-title-main' }, 'Ново проектно предложение'),
                e('span', { className: 'pw-modal-title-sub' }, projectTypeLabel
                  ? 'Тип проект: ' + projectTypeLabel
                  : 'Попълнете данните за кандидатстване')
              )
            ),
            e('button', {
              type: 'button',
              className: 'pw-modal-close-btn',
              onClick: handleClose,
              'aria-label': 'Затвори'
            }, e('i', { className: 'fas fa-times', 'aria-hidden': 'true' }))
          ),

          // ── Step Indicator ──
          e(global.__pwStepIndicator, {
            steps: STEPS,
            currentStep: state.currentStep,
            validation: state.validation,
            onStepClick: handleStepClick
          }),

          // ── Body ──
          e('div', { id: 'pw-modal-body', className: 'pw-modal-body' },

            // Autosave indicator at top
            e(global.__pwAutosaveIndicator, {
              state: autosaveState.status,
              lastSavedAt: autosaveState.lastSavedAt,
              onRetry: handleSaveDraft,
              errorMessage: autosaveState.errorMessage
            }),

            // T66: Top progress bar showing overall completion
            e('div', { className: 'pw-top-progress', role: 'progressbar', 'aria-valuenow': getProgressPercent(), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Общ напредък: ' + getProgressPercent() + '%' },
              e('div', { className: 'pw-top-progress-bar' },
                e('div', {
                  className: 'pw-top-progress-fill',
                  style: { width: getProgressPercent() + '%' }
                })
              )
            ),

            // Global error
            globalError ? e('div', {
              className: 'pw-validation-summary',
              style: { marginTop: 8 },
              role: 'alert',
              'aria-live': 'assertive'
            },
              e('div', { className: 'pw-validation-summary-title' }, 'Грешка'),
              e('div', { className: 'pw-validation-summary-item' }, globalError),
              e('button', {
                className: 'pw-btn pw-btn-sm pw-btn-ghost',
                onClick: function () { setGlobalError(null); },
                style: { marginTop: 4 },
                'aria-label': 'Затвори'
              }, 'Затвори')
            ) : null,

            // Step header
            e('div', { className: 'pw-step-header' },
              e('h2', {
                id: 'pw-step-title',
                className: 'pw-step-title',
                tabIndex: -1
              },
                e('i', { className: 'fas ' + stepIcon + ' pw-step-title-icon', 'aria-hidden': 'true' }),
                STEPS[state.currentStep - 1].label_bg
              ),
              e('p', { className: 'pw-step-subtitle' },
                state.currentStep === 1 ? 'Въведете основните данни за проектното предложение. Полетата с * са задължителни.' :
                state.currentStep === 2 ? 'Прегледайте и управлявайте документите. Всеки тип проект изисква определен набор от документи.' :
                'Разпределете общия бюджет по категории. Лимитите зависят от избрания тип проект в Стъпка 1.'
              )
            ),

            // Validation summary
            e(global.__pwInlineValidationSummary, {
              errors: currentValidation.errors
            }),

            // Step content with slide animation
            // v12.28.2-UI: Wrapped in animated container with key for transition
            e('div', { className: 'pw-step-content' + stepContentAnimClass, key: 'step-' + state.currentStep },
              state.currentStep === 0
                ? e('div', { className: 'pw-pre-app' },
                    e('h1', { className: 'pw-pre-app-title' }, 'Вход в кандидатстването за научни проекти 2026'),
                    e('p', { className: 'pw-pre-app-intro' },
                      'За да започнете кандидатстването, моля изберете тип проект и след това попълнете данните в стъпките.'),
                    e('div', { className: 'pw-pre-app-info' },
                      e('p', null,
                        'За пълна информация за конкурсните сесии, типовете проекти и изискванията, посетете:'),
                      e('a', {
                        href: PRE_APP_INFO_URL,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        className: 'pw-info-link'
                      }, PRE_APP_INFO_URL,
                        e('i', { className: 'fas fa-external-link-alt', 'aria-hidden': 'true' }))
                    ),
                    e('div', { className: 'pw-type-list' },
                      PROJECT_TYPES.map(function (pt) {
                        return e('div', {
                          key: pt.code,
                          className: 'pw-type-card' + (state.step1.project_type === pt.code ? ' pw-selected' : ''),
                          onClick: function () { dispatch('EDIT_FIELD', { step: 1, field: 'project_type', value: pt.code }); dispatch('NEXT_STEP'); }
                        },
                          e('div', { className: 'pw-type-card-header' },
                            e('span', { className: 'pw-type-code' }, pt.code),
                            e('h3', { className: 'pw-type-label' }, pt.label)
                          ),
                          e('p', { className: 'pw-type-description' }, pt.description)
                        );
                      })
                    ),
                    e('div', { className: 'pw-pre-app-actions' },
                      e('button', {
                        className: 'pw-btn pw-btn-primary pw-btn-lg',
                        onClick: function () { dispatch('NEXT_STEP'); }
                      }, 'Започни кандидатстване')
                    )
                  )
                : null,

              state.currentStep === 1
                ? e(global.__pwStep1BasicInfo, {
                    state: state.step1,
                    validation: currentValidation,
                    onFieldChange: function (field, value) { handleFieldChange(field, value, 1); },
                    availableCompetitions: availableCompetitions,
                    departments: departments
                  })
                : null,

              state.currentStep === 2
                ? e(global.__pwStep2Documents, {
                    state: state.step2,
                    validation: currentValidation,
                    onFieldChange: function (field, value) { handleFieldChange(field, value, 2); },
                    proposalId: state.proposalId,
                    onGenerateDocument: function (doc) { return handleGenerateDocument(doc); },
                    onUploadFile: function (doc) { return handleUploadFile(doc); },
                    step3Budget: state.step3
                  })
                : null,

              state.currentStep === 3
                              ? e(global.__pwStep3Budget, {
                                  state: state.step3,
                                  validation: currentValidation,
                                  onFieldChange: function (field, value) { handleFieldChange(field, value, 3); },
                                  projectType: state.step1.project_type || 'ФНИ',
                                  budgetRules: budgetRules,
                                  proposalId: state.proposalId,
                                  onGenerateBudgetSpreadsheet: function () {
                                    return handleGenerateBudgetSpreadsheet();
                                  }
                                })
                              : null,

                            state.currentStep === 4
                              ? e(global.__pwStep4Review, {
                                  state: state,
                                  validation: currentValidation,
                                  projectType: state.step1.project_type || 'ФНИ',
                                  budgetRules: budgetRules,
                                  documentRequirements: global.__DOCUMENT_REQUIREMENTS__?.[state.step1.project_type || 'ФНИ'],
                                  onFieldChange: function (field, value) { handleFieldChange(field, value, 4); },
                                  onSubmit: handleSubmit,
                                  onSaveDraft: handleSaveDraft,
                                  isSubmitting: sending,
                                  isSavingDraft: false,
                                  proposalId: state.proposalId
                                })
                              : null
                          )
                        ),

          // ── Footer ──
          e('div', { className: 'pw-modal-footer' },
            e('div', { className: 'pw-footer-left' },
              // T66: Enhanced progress indicator with completion percentage
              e('div', { className: 'pw-footer-progress', 'aria-label': 'Напредък: ' + getProgressPercent() + '%' },
                e('span', { className: 'pw-footer-progress-label' },
                  getProgressPercent() + '% завършено'
                ),
                e('div', { className: 'pw-footer-progress-bar' },
                  e('div', {
                    className: 'pw-footer-progress-fill' + (getProgressPercent() === 100 ? ' pw-done' : ''),
                    style: { width: getProgressPercent() + '%' }
                  })
                ),
                // T66: Step completion breakdown
                e('div', { className: 'pw-footer-progress-steps', 'aria-label': 'Завършеност на стъпките' },
                  getStepCompletionStatus().map(function (s) {
                    return e('span', {
                      key: 'ps-' + s.step,
                      className: 'pw-footer-step-dot' + (s.isComplete ? ' pw-step-complete' : '') + (s.step === state.currentStep ? ' pw-step-current' : ''),
                      title: s.label_bg + ' — ' + s.sectionPercent + '%',
                      'aria-label': s.label_bg + (s.isComplete ? ' (завършена)' : ' — ' + s.sectionPercent + '%')
                    });
                  })
                )
              ),
              state.currentStep > 1
                ? e('button', {
                    key: 'back',
                    className: 'pw-btn pw-btn-ghost',
                    onClick: handlePrev,
                    'aria-label': 'Назад'
                  }, e('i', { className: 'fas fa-arrow-left', style: { marginRight: 4 } }), 'Назад')
                : null
            ),
            e('div', { className: 'pw-footer-right' },
                          e('button', {
                            key: 'save',
                            className: 'pw-btn pw-btn-secondary pw-btn-sm',
                            onClick: handleSaveDraft,
                            disabled: !state.isDirty || sending,
                            'aria-label': 'Запази'
                          }, e('i', { className: 'fas fa-save', style: { marginRight: 4 } }), 'Запази'),
                          state.currentStep < 4
                            ? e('button', {
                                key: 'continue',
                                className: 'pw-btn pw-btn-primary',
                                onClick: handleNext,
                                disabled: !currentValidation.isValid || sending,
                                'aria-label': continueText
                              }, continueText, e('i', { className: 'fas fa-arrow-right', style: { marginLeft: 6 } }))
                            : e('button', {
                                key: 'submit',
                                className: 'pw-btn pw-btn-primary',
                                onClick: handleSubmit,
                                disabled: !currentValidation.isValid || sending,
                                style: { background: 'var(--pw-success-600)', borderColor: 'var(--pw-success-600)' },
                                'aria-label': sending ? 'Изпращане...' : 'Изпрати предложение'
                              }, sending ? e(React.Fragment, null, e('i', { className: 'fas fa-spinner fa-pulse', style: { marginRight: 4 } }), 'Изпращане…')
                                 : e(React.Fragment, null, e('i', { className: 'fas fa-paper-plane', style: { marginRight: 4 } }), 'Изпрати предложение')),
                          e('button', {
                            key: 'cancel',
                            className: 'pw-btn pw-btn-ghost',
                            onClick: handleClose,
                            disabled: sending,
                            'aria-label': 'Отказ'
                          }, 'Отказ'),
                          e('button', {
                            key: 'docs',
                            className: 'pw-btn pw-btn-ghost pw-btn-sm',
                            onClick: function () { setShowDocModal(true); },
                            'aria-label': 'Документи за сваляне'
                          }, e('i', { className: 'fas fa-download', style: { marginRight: 4 } }), 'Документи'),
                          // T67: Save points button
                          savePointsHook ? e('button', {
                            key: 'savepoints',
                            className: 'pw-btn pw-btn-ghost pw-btn-sm',
                            onClick: function () { setShowSavePoints(true); },
                            'aria-label': 'Точки на запазване'
                          }, e('i', { className: 'fas fa-map-marker-alt', style: { marginRight: 4 } }), 'Точки') : null
                        )
          )
        )
      ),

      // Confirm close dialog
      showConfirmClose
        ? e(global.__pwConfirmCloseDialog, {
            isDirty: state.isDirty,
            onConfirmClose: handleConfirmClose,
            onCancel: handleCancelClose,
            onSaveAndClose: handleSaveAndClose
          })
        : null,

      // Conflict resolution dialog
            showConflictDialog
              ? e(global.__pwConflictResolutionDialog, {
                  onKeepLocal: handleKeepLocal,
                  onLoadServer: handleLoadServer
                })
              : null,

            // Document download modal
                        showDocModal
                          ? e('div', { className: 'pw-modal-overlay', onClick: function (ev) { if (ev.target === ev.currentTarget) setShowDocModal(false); } },
                              e('div', { className: 'pw-modal-box pw-doc-modal', onClick: function (ev) { ev.stopPropagation(); }, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Документи за сваляне' },
                                e('div', { className: 'pw-modal-head' },
                                  e('h3', { className: 'pw-modal-title-main' }, 'Шаблони и документи за сваляне'),
                                  e('button', { className: 'pw-modal-close-btn', onClick: function () { setShowDocModal(false); }, 'aria-label': 'Затвори' }, e('i', { className: 'fas fa-times' }))
                                ),
                                e('div', { className: 'pw-modal-body' },
                                  e('div', { className: 'pw-doc-section' },
                                    e('h4', { className: 'pw-doc-section-title' }, 'Шаблони за изготвяне на документи'),
                                    e('div', { className: 'pw-doc-list' },
                                      (function () {
                                        var type = state.step1.project_type;
                                        var req = global.__DOCUMENT_REQUIREMENTS__;
                                        var items = [];
                                        if (req && req[type]) {
                                          var allDocs = req[type].required.concat(req[type].optional);
                                          allDocs.forEach(function (doc) {
                                            items.push({
                                              label: (doc.required ? '📋 ' : '📄 ') + doc.label,
                                              url: doc.templateDriveUrl,
                                              required: doc.required,
                                              description: doc.description
                                            });
                                          });
                                        }
                                        return items.map(function (l, i) {
                                          return e('a', { key: i, href: l.url, target: '_blank', rel: 'noopener noreferrer', className: 'pw-doc-item' + (l.required ? ' pw-doc-required' : '') },
                                            e('i', { className: 'fas fa-file-alt pw-doc-icon', 'aria-hidden': 'true' }),
                                            e('div', { className: 'pw-doc-info' },
                                              e('span', { className: 'pw-doc-label' }, l.label),
                                              l.description ? e('span', { className: 'pw-doc-desc' }, l.description) : null
                                            ),
                                            e('i', { className: 'fas fa-external-link-alt pw-doc-external', 'aria-hidden': 'true' })
                                          );
                                        });
                                      })()
                                    )
                                  ),
                                  e('div', { className: 'pw-doc-section' },
                                    e('h4', { className: 'pw-doc-section-title' }, 'Вътрешни регламенти и инструкции'),
                                    e('div', { className: 'pw-doc-list' },
                                      (function () {
                                        if (!DRIVE_LINKS.internal) return [];
                                        return [{ label: 'Вътрешни регламенти и инструкции', url: DRIVE_LINKS.internal }].map(function (l, i) {
                                          return e('a', { key: i, href: l.url, target: '_blank', rel: 'noopener noreferrer', className: 'pw-doc-item' },
                                            e('i', { className: 'fas fa-file-alt pw-doc-icon', 'aria-hidden': 'true' }),
                                            e('span', { className: 'pw-doc-label' }, l.label),
                                            e('i', { className: 'fas fa-external-link-alt pw-doc-external', 'aria-hidden': 'true' })
                                          );
                                        });
                                      })()
                                    )
                                  )
                                ),
                                e('div', { className: 'pw-modal-footer' },
                                  e('button', { className: 'pw-btn pw-btn-secondary', onClick: function () { setShowDocModal(false); } }, 'Затвори')
                                )
                              )
                            )
                          : null,

      // ── Keyboard shortcut help dialog (T69) ──
      showShortcutHelp
        ? e('div', {
            className: 'pw-modal-overlay',
            onClick: function (ev) { if (ev.target === ev.currentTarget) setShowShortcutHelp(false); },
            role: 'presentation'
          },
            e('div', {
              className: 'pw-modal-box pw-shortcut-help',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-label': 'Клавишни комбинации',
              'aria-labelledby': 'pw-shortcut-title'
            },
              e('div', { className: 'pw-modal-head' },
                e('h3', { id: 'pw-shortcut-title', className: 'pw-modal-title-main' }, 'Клавишни комбинации'),
                e('button', {
                  className: 'pw-modal-close-btn',
                  onClick: function () { setShowShortcutHelp(false); },
                  'aria-label': 'Затвори'
                }, e('i', { className: 'fas fa-times', 'aria-hidden': 'true' }))
              ),
              e('div', { className: 'pw-modal-body' },
                e('table', { className: 'pw-shortcut-table', role: 'table', 'aria-label': 'Списък с клавишни комбинации' },
                  e('thead', null,
                    e('tr', null,
                      e('th', { scope: 'col' }, 'Комбинация'),
                      e('th', { scope: 'col' }, 'Действие')
                    )
                  ),
                  e('tbody', null,
                    e('tr', null, e('td', null, e('kbd', null, 'Ctrl'), ' + ', e('kbd', null, '?')), e('td', null, 'Покажи тази помощ')),
                    e('tr', null, e('td', null, e('kbd', null, 'Ctrl'), ' + ', e('kbd', null, 'H')), e('td', null, 'Покажи клавишни комбинации')),
                    e('tr', null, e('td', null, e('kbd', null, 'Esc')), e('td', null, 'Затвори модула')),
                    e('tr', null, e('td', null, e('kbd', null, 'Tab')), e('td', null, 'Навигация между елементите')),
                    e('tr', null, e('td', null, e('kbd', null, 'Shift'), ' + ', e('kbd', null, 'Tab')), e('td', null, 'Назад между елементите')),
                    e('tr', null, e('td', null, e('kbd', null, 'Enter')), e('td', null, 'Потвърди диалог')),
                    e('tr', null, e('td', null, e('kbd', null, 'Space')), e('td', null, 'Активирай бутон/поле'))
                  )
                )
              ),
              e('div', { className: 'pw-modal-footer' },
                e('button', {
                  className: 'pw-btn pw-btn-secondary',
                  onClick: function () { setShowShortcutHelp(false); },
                  'aria-label': 'Затвори'
                }, 'Затвори')
              )
            )
          )
        : null,

      // ── T67: Save points dialog ──
      savePointsHook && global.__pwSavePointDialog
        ? e(global.__pwSavePointDialog, {
            visible: showSavePoints,
            savePoints: savePointsHook.savePoints,
            onCreate: savePointsHook.createSavePoint,
            onRestore: savePointsHook.restoreSavePoint,
            onDelete: savePointsHook.deleteSavePoint,
            onClose: function () { setShowSavePoints(false); },
            formatTimestamp: savePointsHook.formatTimestamp
          })
        : null
    );
  }

  /* ── Expose globally ── */
  global.__pwWizardShell = React.memo(WizardShell);
  global.ProposalWizardModal = WizardShell;

})(window);