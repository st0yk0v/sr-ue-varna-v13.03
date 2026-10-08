/* ═══════════════════════════════════════════════════════════════════════
 * StatusBadge.js — Reusable status badge component
 * ═══════════════════════════════════════════════════════════════════════
 * Props: { status: string, label_bg?: string }
 * Variants: missing, draft, generated, uploaded, error, in_progress
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;

  var STATUS_LABELS = {
    missing: 'Липсва',
    draft_needed: 'Изисква довършване',
    draft: 'Чернова',
    generated: 'Генериран',
    uploaded: 'Качен',
    error: 'Грешка',
    in_progress: 'В обработка'
  };

  /**
   * Colored status badge for document/proposal states.
   * @param {Object} props
   * @param {string} [props.status='missing'] — status key (missing|draft_needed|generated|uploaded|error|...)
   * @param {string} [props.label_bg] — optional label override (Bulgarian)
   * @returns {React.ReactElement}
   */
  function StatusBadge(props) {
    var status = props.status || 'missing';
    var label = props.label_bg || STATUS_LABELS[status] || status;
    var className = 'pw-status-badge pw-status-' + status;

    return e('span', { className: className },
      e('span', { 'aria-hidden': 'true' }, _getIcon(status)),
      ' ',
      label
    );
  }

  function _getIcon(status) {
    var icons = {
      missing: '●',
      draft_needed: '◎',
      draft: '◷',
      generated: '✓',
      uploaded: '↑',
      error: '✕',
      in_progress: '○'
    };
    return icons[status] || '●';
  }

  global.__pwStatusBadge = React.memo(StatusBadge);

})(window);
