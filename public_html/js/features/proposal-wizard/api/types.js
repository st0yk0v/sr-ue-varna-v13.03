/* ═══════════════════════════════════════════════════════════════════════
 * types.js — Shared data models for Proposal Wizard v2.0
 * ═══════════════════════════════════════════════════════════════════════
 * These are JSDoc type definitions / factory functions.
 * No runtime exports — pure contracts for the wizard components.
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid
 * @property {Array<{field:string, message_bg:string}>} errors
 */

/**
 * Creates an empty ValidationResult.
 * @returns {ValidationResult}
 */
function createEmptyValidation() {
  return { isValid: false, errors: [] };
}

/**
 * Marks a validation result as valid (no errors).
 * @returns {ValidationResult}
 */
function createValidValidation() {
  return { isValid: true, errors: [] };
}

/**
 * @typedef {'missing'|'draft_needed'|'generated'|'uploaded'|'error'} DocumentStatus
 */

/**
 * @typedef {'template_generated'|'user_upload'|'drive_linked'} DocumentSource
 */

/**
 * @typedef {Object} ProposalDocument
 * @property {string} id
 * @property {string} type  — one of document_types[].type from spec
 * @property {string} name_bg
 * @property {boolean} required
 * @property {DocumentStatus} status
 * @property {DocumentSource} source
 * @property {string|null} drive_file_id
 * @property {string|null} download_url
 * @property {string|null} last_modified  — ISO8601
 * @property {string|null} error_message
 */

/**
 * Creates a new ProposalDocument with default "missing" status.
 * @param {Object} opts
 * @returns {ProposalDocument}
 */
function createProposalDocument(opts) {
  return {
    id: opts.id || '',
    type: opts.type || '',
    name_bg: opts.name_bg || '',
    required: opts.required !== false,
    status: opts.status || 'missing',
    source: opts.source || 'user_upload',
    drive_file_id: opts.drive_file_id || null,
    download_url: opts.download_url || null,
    last_modified: opts.last_modified || null,
    error_message: opts.error_message || null
  };
}

/**
 * @typedef {Object} BudgetCategory
 * @property {string} code
 * @property {number} allocated_amount
 */

/**
 * @typedef {Object} Step1State
 * @property {string} project_type
 * @property {string} competition_session_id
 * @property {string} title_bg
 * @property {string} title_en
 * @property {string} abstract_bg
 * @property {string[]} keywords
 * @property {number} duration_months
 * @property {string} department_id
 * @property {string} faculty_id
 * @property {string} principal_investigator_id
 * @property {Array<{member_id:string, role_bg:string, workload_percent:number}>} team_members
 */

/** @returns {Step1State} */
function createDefaultStep1State() {
  return {
    project_type: '',
    competition_session_id: '',
    title_bg: '',
    title_en: '',
    abstract_bg: '',
    keywords: [],
    duration_months: 12,
    department_id: '',
    faculty_id: '',
    principal_investigator_id: '',
    team_members: []
  };
}

/**
 * @typedef {Object} Step2State
 * @property {ProposalDocument[]} documents
 */

/** @returns {Step2State} */
function createDefaultStep2State() {
  return { documents: [] };
}

/**
 * @typedef {Object} Step3State
 * @property {number} total_budget_field
 * @property {BudgetCategory[]} budget_categories
 */

/** @returns {Step3State} */
function createDefaultStep3State() {
  return {
    total_budget_field: 0,
    budget_categories: []
  };
}

/**
 * @typedef {Object} WizardState
 * @property {string|null} proposalId
 * @property {1|2|3} currentStep
 * @property {boolean} isDirty
 * @property {string|null} lastSavedAt
 * @property {number} rowVersion
 * @property {Step1State} step1
 * @property {Step2State} step2
 * @property {Step3State} step3
 * @property {{step1: ValidationResult, step2: ValidationResult, step3: ValidationResult}} validation
 */

/**
 * Creates a pristine/empty WizardState.
 * @param {Object} [overrides]
 * @returns {WizardState}
 */
function createDefaultWizardState(overrides) {
  return Object.assign({
    proposalId: null,
    currentStep: 1,
    isDirty: false,
    lastSavedAt: null,
    rowVersion: 0,
    step1: createDefaultStep1State(),
    step2: createDefaultStep2State(),
    step3: createDefaultStep3State(),
    validation: {
      step1: createEmptyValidation(),
      step2: createEmptyValidation(),
      step3: createEmptyValidation()
    }
  }, overrides || {});
}

/**
 * Maps legacy GAS column names to new field ids (spec legacy_field_mapping).
 * This is a design-time reference — not used at runtime.
 */
var LEGACY_FIELD_MAPPING = {
  step1: [
    { gas_column: 'Тип на проекта', new_field: 'project_type' },
    { gas_column: 'Конкурсна сесия', new_field: 'competition_session_id' },
    { gas_column: 'Заглавие', new_field: 'title_bg' },
    { gas_column: 'Резюме', new_field: 'abstract_bg' },
    { gas_column: 'Ключови думи', new_field: 'keywords' },
    { gas_column: 'Продължителност (месеци)', new_field: 'duration_months' },
    { gas_column: 'Катедра', new_field: 'department_id' },
    { gas_column: 'Факултет', new_field: 'faculty_id' },
    { gas_column: 'Ръководител', new_field: 'principal_investigator_id' },
    { gas_column: 'Екип', new_field: 'team_members' }
  ],
  step2: [
    { gas_column: 'ФНИ Формуляр URL', new_field: 'documents[type=fni_form].drive_file_id' },
    { gas_column: 'Бюджетно приложение URL', new_field: 'documents[type=budget_annex].drive_file_id' },
    { gas_column: 'CV URL', new_field: 'documents[type=cv_pi].drive_file_id' },
    { gas_column: 'Статус документи', new_field: 'documents[].status' }
  ],
  step3: [
    { gas_column: 'Обща сума', new_field: 'total_budget_field' },
    { gas_column: 'Възнаграждения', new_field: 'budget_categories[code=personnel].allocated_amount' },
    { gas_column: 'Оборудване', new_field: 'budget_categories[code=equipment].allocated_amount' },
    { gas_column: 'Материали', new_field: 'budget_categories[code=materials].allocated_amount' },
    { gas_column: 'Командировки', new_field: 'budget_categories[code=travel].allocated_amount' }
  ]
};

/* ── Expose factories globally (consistent with existing codebase pattern) ── */
window.__pwTypes = {
  createEmptyValidation: createEmptyValidation,
  createValidValidation: createValidValidation,
  createProposalDocument: createProposalDocument,
  createDefaultStep1State: createDefaultStep1State,
  createDefaultStep2State: createDefaultStep2State,
  createDefaultStep3State: createDefaultStep3State,
  createDefaultWizardState: createDefaultWizardState,
  LEGACY_FIELD_MAPPING: LEGACY_FIELD_MAPPING
};
