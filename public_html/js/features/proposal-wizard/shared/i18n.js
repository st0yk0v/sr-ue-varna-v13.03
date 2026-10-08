/* ═══════════════════════════════════════════════════════════════════════
 * i18n.js — Localization / internationalization for Proposal Wizard (T70)
 * ═══════════════════════════════════════════════════════════════════════
 * Provides a lightweight i18n system with Bulgarian (bg) as the primary
 * locale and English (en) as a fallback. Supports interpolation via
 * {{placeholder}} syntax and pluralization.
 *
 * Usage:
 *   var t = createI18n('bg');
 *   t('wizard.title');  // => 'Ново проектно предложение'
 *   t('wizard.steps.remaining', { count: 3 });  // => 'Остават 3 стъпки'
 *
 * Exposed globally as window.__pwI18n / window.createI18n
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /**
   * Translation dictionaries.
   */
  var DICT = {
    bg: {
      // Wizard shell
      'wizard.title': 'Ново проектно предложение',
      'wizard.subtitle': 'Попълнете данните за кандидатстване',
      'wizard.project_type_label': 'Тип проект: {{type}}',
      'wizard.skip_to_content': 'Пропусни към съдържанието',

      // Steps
      'wizard.step1.label': 'Основна информация',
      'wizard.step2.label': 'Документи',
      'wizard.step3.label': 'Бюджет',
      'wizard.step4.label': 'Преглед и изпращане',

      // Buttons
      'wizard.btn.continue': 'Продължи',
      'wizard.btn.back': 'Назад',
      'wizard.btn.save': 'Запази',
      'wizard.btn.cancel': 'Отказ',
      'wizard.btn.submit': 'Изпрати предложение',
      'wizard.btn.sending': 'Изпращане…',
      'wizard.btn.documents': 'Документи',
      'wizard.btn.start': 'Започни кандидатстване',

      // Progress
      'wizard.progress.percent': '{{percent}}% завършено',
      'wizard.progress.step': 'Стъпка {{current}} от {{total}}',
      'wizard.steps_remaining': 'Остават {{count}} стъпки',
      'wizard.steps_remaining_one': 'Остава {{count}} стъпка',
      'wizard.steps_remaining_many': 'Остават {{count}} стъпки',

      // Autosave
      'wizard.autosave.idle': '',
      'wizard.autosave.saving': 'Запазване…',
      'wizard.autosave.saved': 'Запазено в {{time}}',
      'wizard.autosave.error': 'Грешка при запазване',
      'wizard.autosave.retry': 'Опитай отново',

      // Confirm close
      'wizard.close.title': 'Имате незапазени промени',
      'wizard.close.message': 'Сигурни ли сте, че искате да затворите? Незапазените промени ще бъдат загубени.',
      'wizard.close.confirm': 'Затвори без запазване',
      'wizard.close.save_and_close': 'Запази и затвори',
      'wizard.close.cancel': 'Отказ',

      // Conflict
      'wizard.conflict.title': 'Конфликт при запис',
      'wizard.conflict.message': 'Документът е бил модифициран от друг потребител. Коя версия искате да запазите?',
      'wizard.conflict.keep_local': 'Запази моята версия',
      'wizard.conflict.load_server': 'Зареди сървърната версия',

      // Save points (T67)
      'wizard.savepoint.title': 'Точки на запазване',
      'wizard.savepoint.create_label': 'Създай нова точка на запазване:',
      'wizard.savepoint.placeholder': 'напр. "Преди бюджетна ревизия"',
      'wizard.savepoint.create': 'Създай',
      'wizard.savepoint.empty': 'Няма съхранени точки. Създайте първата като въведете име и натиснете "Създай".',
      'wizard.savepoint.restore': 'Възстанови',
      'wizard.savepoint.delete': 'Изтрий',
      'wizard.savepoint.confirm_delete': 'Сигурни ли сте?',
      'wizard.savepoint.manage': 'Управление на точки',

      // Validation messages
      'validation.required': 'Това поле е задължително.',
      'validation.min_length': 'Минимум {{min}} символа.',
      'validation.max_length': 'Максимум {{max}} символа.',
      'validation.invalid_email': 'Невалиден имейл адрес.',
      'validation.range': 'Стойността трябва да е между {{min}} и {{max}}.',

      // Keyboard shortcuts (T69)
      'wizard.shortcuts.title': 'Клавишни комбинации',
      'wizard.shortcuts.close': 'Затвори',
      'wizard.shortcuts.table': 'Списък с клавишни комбинации',
      'wizard.shortcut.ctrl_help': 'Покажи тази помощ',
      'wizard.shortcut.ctrl_h': 'Покажи клавишни комбинации',
      'wizard.shortcut.escape': 'Затвори модула',
      'wizard.shortcut.tab': 'Навигация между елементите',
      'wizard.shortcut.shift_tab': 'Назад между елементите',
      'wizard.shortcut.enter': 'Потвърди диалог',
      'wizard.shortcut.space': 'Активирай бутон/поле',

      // Accessibility (T69)
      'a11y.step_complete': '(завършена)',
      'a11y.step_current': '(текуща)',
      'a11y.required_field': 'задължително поле',
      'a11y.error_field': 'поле с грешка',
      'a11y.loading': 'Зареждане…',
      'a11y.close_dialog': 'Затвори диалога',
      'a11y.open_menu': 'Отвори меню',
      'a11y.close_menu': 'Затвори меню',

      // Error messages
      'error.general': 'Възникна грешка. Опитайте отново.',
      'error.network': 'Мрежова грешка. Проверете връзката.',
      'error.server': 'Грешка на сървъра. Опитайте по-късно.',
      'error.not_found': 'Ресурсът не е намерен.',
      'error.unauthorized': 'Нямате достъп до този ресурс.'
    },

    en: {
      // Wizard shell
      'wizard.title': 'New Project Proposal',
      'wizard.subtitle': 'Fill in the application details',
      'wizard.project_type_label': 'Project type: {{type}}',
      'wizard.skip_to_content': 'Skip to content',

      // Steps
      'wizard.step1.label': 'Basic Information',
      'wizard.step2.label': 'Documents',
      'wizard.step3.label': 'Budget',
      'wizard.step4.label': 'Review & Submit',

      // Buttons
      'wizard.btn.continue': 'Continue',
      'wizard.btn.back': 'Back',
      'wizard.btn.save': 'Save',
      'wizard.btn.cancel': 'Cancel',
      'wizard.btn.submit': 'Submit Proposal',
      'wizard.btn.sending': 'Submitting…',
      'wizard.btn.documents': 'Documents',
      'wizard.btn.start': 'Start Application',

      // Progress
      'wizard.progress.percent': '{{percent}}% complete',
      'wizard.progress.step': 'Step {{current}} of {{total}}',
      'wizard.steps_remaining': '{{count}} steps remaining',
      'wizard.steps_remaining_one': '{{count}} step remaining',
      'wizard.steps_remaining_many': '{{count}} steps remaining',

      // Autosave
      'wizard.autosave.idle': '',
      'wizard.autosave.saving': 'Saving…',
      'wizard.autosave.saved': 'Saved at {{time}}',
      'wizard.autosave.error': 'Save error',
      'wizard.autosave.retry': 'Retry',

      // Confirm close
      'wizard.close.title': 'You have unsaved changes',
      'wizard.close.message': 'Are you sure you want to close? Unsaved changes will be lost.',
      'wizard.close.confirm': 'Close without saving',
      'wizard.close.save_and_close': 'Save and close',
      'wizard.close.cancel': 'Cancel',

      // Conflict
      'wizard.conflict.title': 'Save Conflict',
      'wizard.conflict.message': 'The document has been modified by another user. Which version do you want to keep?',
      'wizard.conflict.keep_local': 'Keep my version',
      'wizard.conflict.load_server': 'Load server version',

      // Save points (T67)
      'wizard.savepoint.title': 'Save Points',
      'wizard.savepoint.create_label': 'Create new save point:',
      'wizard.savepoint.placeholder': 'e.g. "Before budget revision"',
      'wizard.savepoint.create': 'Create',
      'wizard.savepoint.empty': 'No saved points. Create the first one by entering a name and clicking "Create".',
      'wizard.savepoint.restore': 'Restore',
      'wizard.savepoint.delete': 'Delete',
      'wizard.savepoint.confirm_delete': 'Are you sure?',
      'wizard.savepoint.manage': 'Manage points',

      // Validation messages
      'validation.required': 'This field is required.',
      'validation.min_length': 'Minimum {{min}} characters.',
      'validation.max_length': 'Maximum {{max}} characters.',
      'validation.invalid_email': 'Invalid email address.',
      'validation.range': 'Value must be between {{min}} and {{max}}.',

      // Keyboard shortcuts (T69)
      'wizard.shortcuts.title': 'Keyboard Shortcuts',
      'wizard.shortcuts.close': 'Close',
      'wizard.shortcuts.table': 'Keyboard shortcut list',
      'wizard.shortcut.ctrl_help': 'Show this help',
      'wizard.shortcut.ctrl_h': 'Show keyboard shortcuts',
      'wizard.shortcut.escape': 'Close dialog',
      'wizard.shortcut.tab': 'Navigate between elements',
      'wizard.shortcut.shift_tab': 'Navigate backwards',
      'wizard.shortcut.enter': 'Confirm dialog',
      'wizard.shortcut.space': 'Activate button/field',

      // Accessibility (T69)
      'a11y.step_complete': '(complete)',
      'a11y.step_current': '(current)',
      'a11y.required_field': 'required field',
      'a11y.error_field': 'field with error',
      'a11y.loading': 'Loading…',
      'a11y.close_dialog': 'Close dialog',
      'a11y.open_menu': 'Open menu',
      'a11y.close_menu': 'Close menu',

      // Error messages
      'error.general': 'An error occurred. Please try again.',
      'error.network': 'Network error. Check your connection.',
      'error.server': 'Server error. Try again later.',
      'error.not_found': 'Resource not found.',
      'error.unauthorized': 'You do not have access to this resource.'
    }
  };

  /**
   * Simple pluralization helper for Bulgarian.
   * Bulgarian plural rules: 1 → one, 2-4 → few, 5+ → many (simplified)
   * @param {number} n
   * @returns {'one'|'few'|'many'}
   */
  function bgPlural(n) {
    if (n === 1) return 'one';
    return 'many';
  }

  /**
   * Simple pluralization helper for English.
   * @param {number} n
   * @returns {'one'|'many'}
   */
  function enPlural(n) {
    if (n === 1) return 'one';
    return 'many';
  }

  var PLURAL_FNS = {
    bg: bgPlural,
    en: enPlural
  };

  /**
   * Interpolate {{placeholders}} in a string with values from params.
   * @param {string} str
   * @param {Object} params
   * @returns {string}
   */
  function interpolate(str, params) {
    if (!params || typeof params !== 'object') return str;
    return str.replace(/\{\{(\w+)\}\}/g, function (match, key) {
      return params[key] !== undefined ? String(params[key]) : match;
    });
  }

  /**
   * Create an i18n translator function for the given locale.
   * @param {string} [locale='bg'] — locale code ('bg' or 'en')
   * @returns {Function} translator function: (key, params?) => string
   */
  function createI18n(locale) {
    var loc = locale || 'bg';
    var dict = DICT[loc] || DICT.bg;
    var fallbackDict = DICT.bg;
    var pluralFn = PLURAL_FNS[loc] || PLURAL_FNS.bg;

    /**
     * Translate a key with optional interpolation params.
     * Supports pluralization via params.count — looks for key_one, key_many, key_few.
     * @param {string} key — dot-separated translation key
     * @param {Object} [params] — interpolation values
     * @returns {string}
     */
    function t(key, params) {
      var result;

      // Pluralization: if params.count is a number, try suffixed key
      if (params && typeof params.count === 'number') {
        var form = pluralFn(params.count);
        var pluralKey = key + '_' + form;
        if (dict[pluralKey] !== undefined) {
          result = dict[pluralKey];
        } else if (dict[key] !== undefined) {
          result = dict[key];
        }
      }

      // Standard lookup
      if (result === undefined) {
        result = dict[key];
      }

      // Fallback to Bulgarian
      if (result === undefined && loc !== 'bg') {
        result = fallbackDict[key];
      }

      // Final fallback: return the key itself
      if (result === undefined) return key;

      return interpolate(result, params);
    }

    /**
     * Get the current locale.
     * @returns {string}
     */
    t.getLocale = function () { return loc; };

    /**
     * Change the locale (returns a new translator).
     * @param {string} newLocale
     * @returns {Function}
     */
    t.setLocale = function (newLocale) { return createI18n(newLocale); };

    return t;
  }

  // Expose globally
  global.__pwI18n = createI18n('bg');
  global.createI18n = createI18n;
  global.__pwDict = DICT;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
