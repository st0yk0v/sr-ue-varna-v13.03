/* ═══════════════════════════════════════════════════════════════════════
 * SavePointDialog.js — UI for managing named save points (T67)
 * ═══════════════════════════════════════════════════════════════════════
 * Modal dialog that lists existing save points, allows creating new
 * ones, restoring, and deleting. Fully accessible with keyboard nav.
 *
 * Props:
 *   { visible, savePoints, onCreate, onRestore, onDelete, onClose, formatTimestamp }
 *
 * Булgarian UI strings throughout.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  /**
   * SavePointDialog component.
   * @param {Object} props
   * @param {boolean} props.visible — whether dialog is shown
   * @param {Array<{id:string,name:string,timestamp:number}>} props.savePoints
   * @param {Function} props.onCreate — (name: string) => void
   * @param {Function} props.onRestore — (id: string) => void
   * @param {Function} props.onDelete — (id: string) => void
   * @param {Function} props.onClose — () => void
   * @param {Function} props.formatTimestamp — (ts: number) => string
   * @returns {React.ReactElement|null}
   */
  function SavePointDialog(props) {
    var visible = props.visible;
    var savePoints = props.savePoints || [];
    var onCreate = props.onCreate;
    var onRestore = props.onRestore;
    var onDelete = props.onDelete;
    var onClose = props.onClose;
    var formatTimestamp = props.formatTimestamp || function (ts) { return String(ts); };

    var [newName, setNewName] = useState('');
    var [confirmDeleteId, setConfirmDeleteId] = useState(null);
    var inputRef = useRef(null);

    // Reset state when dialog opens
    useEffect(function () {
      if (visible) {
        setNewName('');
        setConfirmDeleteId(null);
        // Focus the input after mount
        setTimeout(function () {
          if (inputRef.current) inputRef.current.focus();
        }, 100);
      }
    }, [visible]);

    if (!visible) return null;

    /**
     * Handle create save point action.
     */
    function handleCreate() {
      var trimmed = newName.trim();
      if (!trimmed) return;
      onCreate(trimmed);
      setNewName('');
      if (inputRef.current) inputRef.current.focus();
    }

    /**
     * Handle keyboard in the new-name input.
     */
    function handleKeyDown(ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        handleCreate();
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onClose();
      }
    }

    /**
     * Handle click outside to close.
     */
    function handleOverlayClick(ev) {
      if (ev.target === ev.currentTarget) onClose();
    }

    return e('div', {
      className: 'pw-modal-overlay',
      onClick: handleOverlayClick,
      role: 'presentation'
    },
      e('div', {
        className: 'pw-modal-box pw-savepoint-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Точки на запазване',
        'aria-labelledby': 'pw-savepoint-title'
      },
        // Header
        e('div', { className: 'pw-modal-head' },
          e('h3', { id: 'pw-savepoint-title', className: 'pw-modal-title-main' },
            'Точки на запазване'
          ),
          e('button', {
            className: 'pw-modal-close-btn',
            onClick: onClose,
            'aria-label': 'Затвори'
          }, e('i', { className: 'fas fa-times', 'aria-hidden': 'true' }))
        ),

        // Body
        e('div', { className: 'pw-modal-body' },
          // Create new save point
          e('div', { className: 'pw-savepoint-create' },
            e('label', { htmlFor: 'pw-savepoint-input', className: 'pw-savepoint-label' },
              'Създай нова точка на запазване:'
            ),
            e('div', { className: 'pw-savepoint-input-row' },
              e('input', {
                id: 'pw-savepoint-input',
                ref: inputRef,
                type: 'text',
                className: 'pw-savepoint-input',
                placeholder: 'напр. "Преди бюджетна ревизия"',
                value: newName,
                onChange: function (ev) { setNewName(ev.target.value); },
                onKeyDown: handleKeyDown,
                maxLength: 80,
                'aria-label': 'Име на точката на запазване'
              }),
              e('button', {
                className: 'pw-btn pw-btn-primary pw-btn-sm',
                onClick: handleCreate,
                disabled: !newName.trim(),
                'aria-label': 'Създай'
              }, 'Създай')
            )
          ),

          // Existing save points list
          e('div', { className: 'pw-savepoint-list', role: 'list', 'aria-label': 'Съхранени точки' },
            savePoints.length === 0
              ? e('p', { className: 'pw-savepoint-empty' },
                  'Няма съхранени точки. Създайте първата като въведете име и натиснете "Създай".'
                )
              : savePoints.slice().reverse().map(function (point) {
                  var isConfirming = confirmDeleteId === point.id;
                  return e('div', {
                    key: point.id,
                    className: 'pw-savepoint-item',
                    role: 'listitem'
                  },
                    e('div', { className: 'pw-savepoint-info' },
                      e('span', { className: 'pw-savepoint-name' }, point.name),
                      e('span', { className: 'pw-savepoint-time' }, formatTimestamp(point.timestamp))
                    ),
                    e('div', { className: 'pw-savepoint-actions' },
                      e('button', {
                        className: 'pw-btn pw-btn-ghost pw-btn-sm',
                        onClick: function () { onRestore(point.id); },
                        'aria-label': 'Възстанови "' + point.name + '"'
                      }, e('i', { className: 'fas fa-undo', 'aria-hidden': 'true' }), ' Възстанови'),
                      isConfirming
                        ? e('span', { className: 'pw-savepoint-confirm' },
                            e('button', {
                              className: 'pw-btn pw-btn-danger pw-btn-sm',
                              onClick: function () { onDelete(point.id); setConfirmDeleteId(null); },
                              'aria-label': 'Потвърди изтриване'
                            }, 'Изтрий'),
                            e('button', {
                              className: 'pw-btn pw-btn-ghost pw-btn-sm',
                              onClick: function () { setConfirmDeleteId(null); },
                              'aria-label': 'Отказ'
                            }, 'Отказ')
                          )
                        : e('button', {
                            className: 'pw-btn pw-btn-ghost pw-btn-sm pw-savepoint-delete',
                            onClick: function () { setConfirmDeleteId(point.id); },
                            'aria-label': 'Изтрий "' + point.name + '"'
                          }, e('i', { className: 'fas fa-trash', 'aria-hidden': 'true' }))
                    )
                  );
                })
          )
        ),

        // Footer
        e('div', { className: 'pw-modal-footer' },
          e('button', {
            className: 'pw-btn pw-btn-secondary',
            onClick: onClose,
            'aria-label': 'Затвори'
          }, 'Затвори')
        )
      )
    );
  }

  global.__pwSavePointDialog = React.memo(SavePointDialog);

})(typeof window !== 'undefined' ? window : this);
