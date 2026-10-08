/* ═══════════════════════════════════════════════════════════════════════
 * step2.schema.js — Document type definitions for Step 2
 * ═══════════════════════════════════════════════════════════════════════
 * Mirrors spec step_2_documents.document_types.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var DOCUMENT_TYPES = [
    { type: 'fni_form',                 name_bg: 'ФНИ - Формуляр',                        required: true,  source_default: 'template_generated' },
    { type: 'budget_annex',             name_bg: 'Бюджетно приложение',                     required: true,  source_default: 'template_generated' },
    { type: 'cv_pi',                    name_bg: 'CV на ръководителя',                      required: true,  source_default: 'user_upload' },
    { type: 'cv_team',                  name_bg: 'CV на екипа',                             required: false, source_default: 'user_upload' },
    { type: 'ethics_approval',          name_bg: 'Декларация за етично съответствие',       required: false, source_default: 'template_generated' },
    { type: 'institutional_declaration',name_bg: 'Институционална декларация',              required: true,  source_default: 'template_generated' },
    { type: 'letters_of_support',       name_bg: 'Писма за подкрепа/партньорство',          required: false, source_default: 'user_upload' }
  ];

  var STATUS_LABELS = {
    missing: 'Липсва',
    draft_needed: 'Изисква довършване',
    generated: 'Генериран',
    uploaded: 'Качен',
    error: 'Грешка'
  };

  global.__pwStep2Schema = {
    documentTypes: DOCUMENT_TYPES,
    statusLabels: STATUS_LABELS
  };

})(window);
