/* ═══════════════════════════════════════════════════════════════════════
 * ConfirmCloseDialog.js — Dirty-state close confirmation
 * ═══════════════════════════════════════════════════════════════════════
 * Props: { isDirty: boolean, onConfirmClose: Function, onCancel: Function,
 *          onSaveAndClose?: Function }
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  /**
   * Modal asking the user to confirm closing the wizard with unsaved changes.
   * @param {Object} props
   * @param {boolean} props.isDirty — whether there are unsaved changes
   * @param {Function} props.onConfirmClose — discard changes and close
   * @param {Function} props.onCancel — dismiss the dialog and stay
   * @param {Function} props.onSaveAndClose — save draft then close
   * @returns {React.ReactElement}
   */
  function ConfirmCloseDialog(props) {
    var isDirty = props.isDirty;
    var onConfirmClose = props.onConfirmClose;
    var onCancel = props.onCancel;
    var onSaveAndClose = props.onSaveAndClose;

    // Focus trap: focus first actionable button on mount
    // v3.39.1-a11y: Enhanced focus management
    var firstBtnRef = useRef(null);
    var dialogRef = useRef(null);
    
    useEffect(function () {
      if (firstBtnRef.current) {
        firstBtnRef.current.focus();
      }
      // Trap focus within dialog
      if (dialogRef.current) {
        var focusableElements = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        var firstFocusable = focusableElements[0];
        var lastFocusable = focusableElements[focusableElements.length - 1];
        
        function handleTabKey(e) {
          if (e.key === 'Tab') {
            if (e.shiftKey) {
              if (document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable.focus();
              }
            } else {
              if (document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable.focus();
              }
            }
          }
        }
        
        dialogRef.current.addEventListener('keydown', handleTabKey);
        return function () {
          dialogRef.current.removeEventListener('keydown', handleTabKey);
        };
      }
    }, []);

    // ESC to cancel
    useEffect(function () {
      function handleKey(ev) {
        if (ev.key === 'Escape' && onCancel) onCancel();
      }
      document.addEventListener('keydown', handleKey);
      return function () { document.removeEventListener('keydown', handleKey); };
    }, [onCancel]);

    if (!isDirty) {
      // No changes — close immediately
      if (onConfirmClose) onConfirmClose();
      return null;
    }

    // v3.39.1-a11y: Use alertdialog for destructive action confirmation
    return e('div', {
      className: 'pw-confirm-close-overlay',
      onClick: function (ev) { if (ev.target === ev.currentTarget && onCancel) onCancel(); },
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-labelledby': 'pw-confirm-close-title',
      'aria-describedby': 'pw-confirm-close-body'
    },
      e('div', { className: 'pw-confirm-close-dialog', ref: dialogRef, onClick: function (ev) { ev.stopPropagation(); } },
        e('h3', { id: 'pw-confirm-close-title', className: 'pw-confirm-close-title' },
          'Има незапазени промени'
        ),
        e('div', { className: 'pw-confirm-close-body' },
          'Ако затворите сега, последните промени може да не бъдат запазени. Искате ли да запазите чернова преди затваряне?'
        ),
        e('div', { className: 'pw-confirm-close-actions' },
          onSaveAndClose ? e('button', {
            key: 'save',
            className: 'pw-btn pw-btn-primary',
            onClick: onSaveAndClose,
            ref: firstBtnRef
          }, 'Запази и затвори') : null,
          e('button', {
            key: 'discard',
            className: 'pw-btn pw-btn-ghost',
            onClick: onConfirmClose
          }, 'Затвори без запазване'),
          e('button', {
            key: 'cancel',
            className: 'pw-btn pw-btn-secondary',
            onClick: onCancel
          }, 'Отказ')
        )
      )
    );
  }

  global.__pwConfirmCloseDialog = React.memo(ConfirmCloseDialog);

})(window);
