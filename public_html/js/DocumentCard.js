/* ═══════════════════════════════════════════════════════════════════════
 * DocumentCard.js — Document status card for Step 2
 * ═══════════════════════════════════════════════════════════════════════
 * Props: {
 *   document: ProposalDocument,
 *   onPrimaryAction: Function,
 *   onSecondaryAction: Function,
 *   expanded: boolean,
 *   onToggleExpand: Function
 * }
 * No auto-loaded iframe — explicit preview only.
 * Status-appropriate action buttons per spec status_actions.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;

  // Icons by document type (simple Unicode/emoji — real Tabler icons would be used in production)
  var TYPE_ICONS = {
    fni_form: '📋',
    budget_annex: '💰',
    cv_pi: '👤',
    cv_team: '👥',
    ethics_approval: '⚖️',
    institutional_declaration: '🏛️',
    letters_of_support: '🤝'
  };

  var DEFAULT_ICON = '📄';

  // Status action config per spec
  var STATUS_ACTIONS = {
    missing: {
      primary_bg: 'Създай от шаблон',
      secondary_bg: 'Качи файл'
    },
    draft_needed: {
      primary_bg: 'Продължи попълването'
    },
    generated: {
      primary_bg: 'Преглед',
      secondary_bg: 'Отвори в Drive'
    },
    uploaded: {
      primary_bg: 'Преглед',
      secondary_bg: 'Замени файл'
    },
    error: {
      primary_bg: 'Генерирай отново',
      secondary_bg: 'Качи ръчно'
    }
  };

  /**
   * Card presenting one proposal document with status and actions.
   * @param {Object} props
   * @param {Object} props.document — ProposalDocument { type, name_bg, status, required, ... }
   * @param {boolean} [props.expanded] — whether the card details are expanded
   * @param {Function} [props.onToggleExpand] — expand/collapse toggle
   * @param {Function} [props.onPrimaryAction] — generate/upload action
   * @param {Function} [props.onSecondaryAction] — preview/regenerate action
   * @returns {React.ReactElement}
   */
  function DocumentCard(props) {
    var doc = props.document || {};
    var onPrimaryAction = props.onPrimaryAction;
    var onSecondaryAction = props.onSecondaryAction;
    var expanded = props.expanded;
    var onToggleExpand = props.onToggleExpand;

    var status = doc.status || 'missing';
    var icon = TYPE_ICONS[doc.type] || DEFAULT_ICON;
    var actions = STATUS_ACTIONS[status] || STATUS_ACTIONS.missing;

    // Format last modified
    var lastMod = '';
    if (doc.last_modified) {
      try {
        var d = new Date(doc.last_modified);
        lastMod = d.toLocaleDateString('bg-BG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } catch (_) {
        lastMod = doc.last_modified;
      }
    }

    // Status badge label
    var statusLabels = {
      missing: 'Липсва',
      draft_needed: 'Изисква довършване',
      generated: 'Генериран',
      uploaded: 'Качен',
      error: 'Грешка'
    };

    return e('div', {
          className: 'pw-doc-card' + (expanded ? ' pw-doc-card-expanded' : ''),
          role: 'listitem',
          tabIndex: 0,
          onKeyDown: function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              if (onPrimaryAction) onPrimaryAction(doc);
            }
          },
          'aria-label': (doc.name_bg || doc.type || 'Документ') + ' — статус: ' + (statusLabels[status] || status)
        },
          e('div', { className: 'pw-doc-icon', 'aria-hidden': 'true' }, icon),
          e('div', { className: 'pw-doc-info' },
            e('div', { className: 'pw-doc-name' },
              doc.name_bg || doc.type || 'Документ',
              e('span', { className: 'pw-status-badge pw-status-' + status, role: 'status' },
                statusLabels[status] || status
              ),
              doc.required ? e('span', { style: { color: 'var(--pw-error-600)', fontSize: 12, fontWeight: 400 }, 'aria-hidden': 'true' }, '*') : null
            ),
            lastMod ? e('div', { className: 'pw-doc-meta' }, 'Последна промяна: ' + lastMod) : null,
            status === 'error' && doc.error_message
              ? e('div', { className: 'pw-doc-meta', style: { color: 'var(--pw-error-600)' }, role: 'alert', 'aria-live': 'assertive' }, doc.error_message)
              : null
          ),
          e('div', { className: 'pw-doc-actions' },
            actions.primary_bg ? e('button', {
              key: 'primary',
              className: 'pw-btn pw-btn-sm pw-btn-primary',
              onClick: function () { if (onPrimaryAction) onPrimaryAction(doc); },
              'aria-label': actions.primary_bg
            }, actions.primary_bg) : null,
            actions.secondary_bg ? e('button', {
              key: 'secondary',
              className: 'pw-btn pw-btn-sm pw-btn-outline-clay',
              onClick: function () { if (onSecondaryAction) onSecondaryAction(doc); },
              'aria-label': actions.secondary_bg
            }, actions.secondary_bg) : null
          )
        );
  }

  global.__pwDocumentCard = React.memo(DocumentCard);

})(window);
