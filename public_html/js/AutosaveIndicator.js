/* ═══════════════════════════════════════════════════════════════════════
 * AutosaveIndicator.js — Visible save state indicator
 * ═══════════════════════════════════════════════════════════════════════
 * Props: { state: 'idle'|'saving'|'saved'|'error', lastSavedAt?: string,
 *          onRetry?: Function, errorMessage?: string }
 * Always visible text, never hidden or icon-only.
 * Communicates via aria-live="polite" for screen readers.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;

  /**
   * Autosave status pill with aria-live announcements.
   * @param {Object} props
   * @param {'idle'|'saving'|'saved'|'error'} [props.state='idle'] — current autosave status
   * @param {string|null} [props.lastSavedAt] — ISO timestamp of last successful save
   * @param {string|null} [props.errorMessage] — error text shown in 'error' state
   * @param {Function} [props.onRetry] — retry callback for the error state
   * @returns {React.ReactElement}
   */
  function AutosaveIndicator(props) {
    var state = props.state || 'idle';
    var lastSavedAt = props.lastSavedAt;
    var onRetry = props.onRetry;
    var errorMessage = props.errorMessage;

    var className = 'pw-autosave';
    var content = null;

    // v3.39.1-a11y: Added aria-label for screen readers
    if (state === 'saving') {
      className += ' pw-autosave-saving';
      content = e('span', { className: 'pw-autosave-spinner', 'aria-hidden': 'true' },
        e('span', null)
      );
      content = [
        content,
        e('span', { key: 'txt', 'aria-label': 'Състояние: запазване в процес' }, 'Запазване...')
      ];
    } else if (state === 'saved') {
      className += ' pw-autosave-saved';
      var timeStr = '';
      if (lastSavedAt) {
        try {
          var d = new Date(lastSavedAt);
          timeStr = ' в ' + d.getHours().toString().padStart(2, '0') + ':' +
                    d.getMinutes().toString().padStart(2, '0');
        } catch (_) {
          timeStr = '';
        }
      }
      content = e('span', null, 'Запазено' + timeStr);
    } else if (state === 'error') {
      className += ' pw-autosave-error';
      content = [
        e('span', { key: 'err' }, errorMessage || 'Неуспешно запазване — опитайте отново'),
        onRetry ? e('button', {
          key: 'retry',
          className: 'pw-btn pw-btn-sm pw-btn-ghost',
          onClick: onRetry,
          style: { marginLeft: 8, fontSize: 11 }
        }, 'Опитай отново') : null
      ];
    } else {
      // idle — show nothing or last saved
      if (lastSavedAt) {
        try {
          var d2 = new Date(lastSavedAt);
          var timeStr2 = d2.getHours().toString().padStart(2, '0') + ':' +
                         d2.getMinutes().toString().padStart(2, '0');
          content = e('span', null, 'Запазено в ' + timeStr2);
        } catch (_) {}
      }
    }

    return e('div', {
      className: className,
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true'
    }, content);
  }

  global.__pwAutosaveIndicator = React.memo(AutosaveIndicator);

})(window);
