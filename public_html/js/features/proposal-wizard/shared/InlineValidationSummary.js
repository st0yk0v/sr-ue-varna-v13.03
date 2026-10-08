/* ═══════════════════════════════════════════════════════════════════════
 * InlineValidationSummary.js — Validation error summary panel
 * ═══════════════════════════════════════════════════════════════════════
 * Props: { errors: Array<{field: string, message_bg: string}> }
 * Shows a red summary box when there are errors.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;

  /**
   * Inline list of validation errors for the current step.
   * @param {Object} props
   * @param {Array<{field:string, message_bg:string}>} props.errors — validation errors to render
   * @returns {React.ReactElement|null}
   */
  function InlineValidationSummary(props) {
    var errors = props.errors;

    if (!errors || !Array.isArray(errors) || errors.length === 0) {
      return null;
    }

    return e('div', {
      className: 'pw-validation-summary',
      role: 'alert',
      'aria-live': 'assertive'
    },
      e('div', { className: 'pw-validation-summary-title' },
        errors.length === 1
          ? '1 грешка във формуляра'
          : errors.length + ' грешки във формуляра'
      ),
      errors.map(function (err, idx) {
        return e('div', {
          key: idx,
          className: 'pw-validation-summary-item'
        }, err.message_bg);
      })
    );
  }

  global.__pwInlineValidationSummary = React.memo(InlineValidationSummary);

})(window);
