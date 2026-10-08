/* ═══════════════════════════════════════════════════════════════════════
 * ConflictResolutionDialog.js — 409 conflict resolution UI
 * ═══════════════════════════════════════════════════════════════════════
 * Props: { localVersion: Object, serverVersion: Object,
 *          onKeepLocal: Function, onLoadServer: Function, onViewDiff?: Function }
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  /**
   * 409 conflict resolution modal — lets the user keep their local draft
   * (overwriting the server) or load the server version.
   * @param {Object} props
   * @param {Function} props.onKeepLocal — keep local edits, force-save over server
   * @param {Function} props.onLoadServer — discard local edits, load server data
   * @param {Function} [props.onViewDiff] — optional diff viewer callback
   * @returns {React.ReactElement}
   */
  function ConflictResolutionDialog(props) {
    var onKeepLocal = props.onKeepLocal;
    var onLoadServer = props.onLoadServer;
    var onViewDiff = props.onViewDiff;

    var firstBtnRef = useRef(null);
    useEffect(function () {
      if (firstBtnRef.current) firstBtnRef.current.focus();
    }, []);

    // v3.39.1-a11y: ESC closes dialog (standard behavior)
    useEffect(function () {
      function handleKey(ev) {
        if (ev.key === 'Escape') {
          // ESC closes dialog - standard accessibility pattern
          if (onCancel) onCancel();
        }
      }
      document.addEventListener('keydown', handleKey);
      return function () { document.removeEventListener('keydown', handleKey); };
    }, [onCancel]);

    return e('div', {
      className: 'pw-conflict-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'pw-conflict-title'
    },
      e('div', { className: 'pw-conflict-dialog', onClick: function (ev) { ev.stopPropagation(); } },
        e('h3', { id: 'pw-conflict-title', className: 'pw-conflict-title' },
          'Друга сесия е променила тази чернова'
        ),
        e('div', { className: 'pw-conflict-body' },
          'Сървърът има по-нова версия на тази чернова. Изберете как да продължите:'
        ),
        e('div', { className: 'pw-conflict-actions' },
          onViewDiff ? e('button', {
            key: 'diff',
            className: 'pw-btn pw-btn-secondary',
            onClick: onViewDiff
          }, 'Прегледай разликите') : null,
          e('button', {
            key: 'keep',
            className: 'pw-btn pw-btn-primary',
            onClick: onKeepLocal,
            ref: firstBtnRef
          }, 'Запази моята версия'),
          e('button', {
            key: 'load',
            className: 'pw-btn pw-btn-ghost',
            onClick: onLoadServer
          }, 'Зареди сървърната версия')
        )
      )
    );
  }

  global.__pwConflictResolutionDialog = React.memo(ConflictResolutionDialog);

})(window);
