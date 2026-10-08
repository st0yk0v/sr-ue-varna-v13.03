/* ═══════════════════════════════════════════════════════════════════════
 * types.js — Type definitions and factory functions for Proposal Wizard v2.0
 * ═══════════════════════════════════════════════════════════════════════
 * Zero-runtime type definitions (JSDoc-annotated) for the proposal wizard
 * state machine. Provides factory functions for initial state creation
 * and type guard helpers.
 *
 * Exposed globally as window.__pwTypes.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /**
   * @typedef {Object} TeamMember
   * @property {string} member_id
   * @property {string} role_bg
   * @property {number} workload_percent
   * @property {string} [name]
   * @property {string} [email]
   */

  /**
   * @typedef {Object} Step1State
   * @property {string} project_type
   * @property {string} competition_session_id
   * @property {string} title_bg
   * @property {string} title_en
   * @property {string} abstract_bg
   * @property {string} abstract_en
   * @property {string[]} keywords
   * @property {number} duration_months
   * @property {string} department_id
   * @property {string} faculty_id
   * @property {string} principal_investigator_id
   * @property {string} acronym
   * @property {string} description
   * @property {string} description_en
   * @property {string} area
   * @property {string} professionalField
   * @property {TeamMember[]} team_members
   */

  /**
   * @typedef {Object} ProposalDocument
   * @property {string} id
   * @property {string} type
   * @property {string} name_bg
   * @property {boolean} required
   * @property {'missing'|'draft_needed'|'generated'|'uploaded'|'error'} status
   * @property {string} [source]
   * @property {string} [drive_file_id]
   * @property {string} [download_url]
   * @property {string} [last_modified]
   * @property {string} [error_message]
   * @property {string} [_previewUrl]
   * @property {string} [_previewError]
   */

  /**
   * @typedef {Object} Step2State
   * @property {ProposalDocument[]} documents
   */

  /**
   * @typedef {Object} BudgetCategory
   * @property {string} code
   * @property {number} allocated_amount
   * @property {number} [cap_percent]
   * @property {string} [name_bg]
   */

  /**
   * @typedef {Object} Step3State
   * @property {number} total_budget_field
   * @property {BudgetCategory[]} budget_categories
   * @property {string} [currency]
   * @property {number} [eur_total]
   */

  /**
   * @typedef {Object} ValidationResult
   * @property {boolean} isValid
   * @property {Array<{field: string, message_bg: string}>} errors
   */

  /**
   * @typedef {Object} ConflictInfo
   * @property {number} serverVersion
   * @property {string} serverLastModifiedAt
   * @property {Object|null} serverData
   */

  /**
   * @typedef {Object} WizardState
   * @property {number} currentStep
   * @property {Step1State} step1
   * @property {Step2State} step2
   * @property {Step3State} step3
   * @property {boolean} isDirty
   * @property {string|null} proposalId
   * @property {number} rowVersion
   * @property {string|null} lastSavedAt
   * @property {Object.<string, ValidationResult>} validation
   * @property {ConflictInfo|null} _conflict
   */

  // ── Factory functions ────────────────────────────────────────────────

  /**
   * Create an empty team member.
   * @param {Partial<TeamMember>} [overrides]
   * @returns {TeamMember}
   */
  function createEmptyTeamMember(overrides) {
    return Object.assign({
      member_id: '',
      role_bg: 'Изследовател',
      workload_percent: 100,
      name: '',
      email: ''
    }, overrides || {});
  }

  /**
   * Create initial Step1 state.
   * @param {Partial<Step1State>} [overrides]
   * @returns {Step1State}
   */
  function createInitialStep1(overrides) {
    return Object.assign({
      project_type: '',
      competition_session_id: '',
      title_bg: '',
      title_en: '',
      abstract_bg: '',
      abstract_en: '',
      keywords: [],
      duration_months: 12,
      department_id: '',
      faculty_id: '',
      principal_investigator_id: '',
      acronym: '',
      description: '',
      description_en: '',
      area: '',
      professionalField: '',
      team_members: []
    }, overrides || {});
  }

  /**
   * Create an empty proposal document.
   * @param {string} type
   * @param {string} name_bg
   * @param {boolean} [required]
   * @param {string} [source]
   * @returns {ProposalDocument}
   */
  function createEmptyDocument(type, name_bg, required, source) {
    return {
      id: type,
      type: type,
      name_bg: name_bg || type,
      required: !!required,
      status: 'missing',
      source: source || 'template_generated'
    };
  }

  /**
   * Create initial Step2 state with default documents.
   * @param {Partial<Step2State>} [overrides]
   * @returns {Step2State}
   */
  function createInitialStep2(overrides) {
    var DEFAULT_DOCS = [
      { type: 'fni_form',                 name_bg: 'ФНИ - Формуляр',                        required: true,  source: 'template_generated' },
      { type: 'budget_annex',             name_bg: 'Бюджетно приложение',                     required: true,  source: 'template_generated' },
      { type: 'cv_pi',                    name_bg: 'CV на ръководителя',                      required: true,  source: 'user_upload' },
      { type: 'cv_team',                  name_bg: 'CV на екипа',                             required: false, source: 'user_upload' },
      { type: 'ethics_approval',          name_bg: 'Декларация за етично съответствие',       required: false, source: 'template_generated' },
      { type: 'institutional_declaration',name_bg: 'Институционална декларация',              required: true,  source: 'template_generated' },
      { type: 'letters_of_support',       name_bg: 'Писма за подкрепа/партньорство',          required: false, source: 'user_upload' }
    ];
    var documents = DEFAULT_DOCS.map(function (d) {
      return createEmptyDocument(d.type, d.name_bg, d.required, d.source);
    });
    return Object.assign({
      documents: documents
    }, overrides || {});
  }

  /**
   * Create an empty budget category.
   * @param {string} code
   * @param {number} [allocated_amount]
   * @returns {BudgetCategory}
   */
  function createEmptyBudgetCategory(code, allocated_amount) {
    return {
      code: code,
      allocated_amount: allocated_amount || 0
    };
  }

  /**
   * Create initial Step3 state with default budget categories.
   * @param {Partial<Step3State>} [overrides]
   * @returns {Step3State}
   */
  function createInitialStep3(overrides) {
    var DEFAULT_CATEGORIES = ['personnel', 'equipment', 'materials', 'travel', 'publications', 'overhead'];
    var budget_categories = DEFAULT_CATEGORIES.map(function (code) {
      return createEmptyBudgetCategory(code, 0);
    });
    return Object.assign({
      total_budget_field: 0,
      budget_categories: budget_categories,
      currency: 'BGN',
      eur_total: 0
    }, overrides || {});
  }

  /**
   * Create the full initial wizard state.
   * @param {Partial<WizardState>} [overrides]
   * @returns {WizardState}
   */
  function createInitialState(overrides) {
    return Object.assign({
      currentStep: 1,
      step1: createInitialStep1(),
      step2: createInitialStep2(),
      step3: createInitialStep3(),
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
    }, overrides || {});
  }

  // ── Type guards ──────────────────────────────────────────────────────

  /**
   * Check if a value is a valid ProposalDocument.
   * @param {*} value
   * @returns {boolean}
   */
  function isProposalDocument(value) {
    return value != null && typeof value === 'object' &&
      typeof value.type === 'string' && typeof value.name_bg === 'string' &&
      typeof value.status === 'string';
  }

  /**
   * Check if a value is a valid TeamMember.
   * @param {*} value
   * @returns {boolean}
   */
  function isTeamMember(value) {
    return value != null && typeof value === 'object' &&
      typeof value.member_id === 'string' && typeof value.role_bg === 'string';
  }

  /**
   * Check if a value is a valid BudgetCategory.
   * @param {*} value
   * @returns {boolean}
   */
  function isBudgetCategory(value) {
    return value != null && typeof value === 'object' &&
      typeof value.code === 'string' && typeof value.allocated_amount === 'number';
  }

  // ── Expose globally ──────────────────────────────────────────────────
  global.__pwTypes = {
    createInitialState: createInitialState,
    createInitialStep1: createInitialStep1,
    createInitialStep2: createInitialStep2,
    createInitialStep3: createInitialStep3,
    createEmptyDocument: createEmptyDocument,
    createEmptyTeamMember: createEmptyTeamMember,
    createEmptyBudgetCategory: createEmptyBudgetCategory,
    isProposalDocument: isProposalDocument,
    isTeamMember: isTeamMember,
    isBudgetCategory: isBudgetCategory
  };

})(window);
