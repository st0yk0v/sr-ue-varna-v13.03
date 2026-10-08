/* ═══════════════════════════════════════════════════════════════════════
 * DocStreamEditor.js — Rich text collaborative editor (Google Docs-style)
 * ═══════════════════════════════════════════════════════════════════════
 * Props: { docId, userEmail, userName, initialContent, onClose, onSave }
 *
 * Features:
 *   - Real-time collaborative editing via SSE
 *   - Rich text formatting (bold, italic, underline, headings, lists)
 *   - Image insertion (URL or file upload)
 *   - Table insertion
 *   - Remote cursor presence display
 *   - Connection status indicator
 *   - Keyboard shortcuts (Ctrl+B/I/U/Z/Y/S)
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useCallback = React.useCallback;
  var useMemo = React.useMemo;

  var useDocStream = global.__useDocStream || window.__useDocStream;

  /**
   * Detect if the current device is mobile (small screen or touch-capable).
   * @returns {boolean} true if mobile device detected
   */
  function detectMobile() {
    if (typeof window === 'undefined') return false;
    var hasTouchScreen = 'ontouchstart' in window || (navigator.maxTouchPoints > 0);
    var isNarrow = window.innerWidth < 768;
    return hasTouchScreen || isNarrow;
  }

  /**
   * Trigger haptic feedback if available on the device.
   * @param {number} [duration=10] vibration duration in ms
   */
  function hapticFeedback(duration) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(duration || 10);
      } catch (_) { /* ignore unsupported vibration */ }
    }
  }

  /**
   * Check if viewport meta tag allows user scaling (for pinch-to-zoom).
   * @returns {boolean} true if user scaling is enabled
   */
  function isViewportScalable() {
    if (typeof document === 'undefined') return false;
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return true; // no meta tag means default (scalable)
    var content = meta.getAttribute('content') || '';
    return content.indexOf('user-scalable=no') === -1 && content.indexOf('maximum-scale=1') === -1;
  }

  /**
   * Toolbar button component.
   * @param {Object} props
   * @param {string} props.icon - FontAwesome icon class
   * @param {string} [props.label] - Text label
   * @param {string} props.title - Tooltip text
   * @param {Function} props.onClick - Click handler
   * @param {boolean} [props.active] - Active state
   * @param {boolean} [props.disabled] - Disabled state
   * @param {boolean} [props.isMobile] - Render larger touch target (min 44x44px)
   */
  function ToolbarButton(props) {
    return e('button', {
      type: 'button',
      className: 'ds-toolbar-btn' + (props.active ? ' active' : '') + (props.disabled ? ' disabled' : '') + (props.isMobile ? ' ds-toolbar-btn-touch' : ''),
      onClick: props.disabled ? undefined : props.onClick,
      title: props.title,
      'aria-label': props.title,
      disabled: props.disabled
    },
      props.icon ? e('i', { className: props.icon }) : null,
      props.label ? ' ' + props.label : null
    );
  }

  /**
   * Toolbar separator.
   */
  function ToolbarSeparator() {
    return e('div', { className: 'ds-toolbar-sep' });
  }

  /**
   * User avatar with online indicator.
   */
  function UserAvatar(props) {
    var user = props.user;
    var initials = (user.name || user.email).slice(0, 2).toUpperCase();
    return e('div', {
      className: 'ds-user-avatar',
      style: { backgroundColor: user.color },
      title: (user.name || user.email) + (props.isConnected ? ' (online)' : ' (offline)')
    }, initials);
  }

  /**
   * Main DocStreamEditor component.
   */
  function DocStreamEditor(props) {
    var docId = props.docId;
    var userEmail = props.userEmail;
    var userName = props.userName || userEmail;
    var initialContent = props.initialContent || '';
    var onClose = props.onClose || function () {};
    var onSave = props.onSave || function () {};

    var editorRef = useRef(null);
    var fileInputRef = useRef(null);
    var touchStartRef = useRef(null);
    var touchMoveRef = useRef(null);
    var pinchStartRef = useRef(null);
    var [showImageDialog, setShowImageDialog] = useState(false);
    var [imageUrl, setImageUrl] = useState('');
    var [showTableGrid, setShowTableGrid] = useState(false);
    var [tableRows, setTableRows] = useState(3);
    var [tableCols, setTableCols] = useState(3);
    var [showUrlInput, setShowUrlInput] = useState(false);
    var [isMobile, setIsMobile] = useState(function () { return detectMobile(); });
    var [showFabMenu, setShowFabMenu] = useState(false);
    var [textZoom, setTextZoom] = useState(100);
    var [fabPosition, setFabPosition] = useState({ x: -1, y: -1 });

    var stream = useDocStream({
      docId: docId,
      userEmail: userEmail,
      userName: userName,
      initialContent: initialContent,
      debounceMs: 300
    });

    var content = stream.content;
    var cursors = stream.cursors;
    var isConnected = stream.isConnected;
    var connectedUsers = stream.connectedUsers;
    var sendOp = stream.sendOp;
    var connectionStatus = stream.connectionStatus;

    /**
     * Get current cursor position in the editor.
     */
    var getCursorPosition = useCallback(function () {
      var sel = window.getSelection();
      if (!sel.rangeCount) return 0;
      var range = sel.getRangeAt(0);
      var preRange = range.cloneRange();
      preRange.selectNodeContents(editorRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      return preRange.toString().length;
    }, []);

    /**
     * Get selected text range.
     */
    var getSelectionRange = useCallback(function () {
      var sel = window.getSelection();
      if (!sel.rangeCount) return null;
      var range = sel.getRangeAt(0);
      return {
        start: range.startOffset,
        end: range.endOffset,
        text: range.toString()
      };
    }, []);

    /**
     * Apply formatting command.
     */
    var applyFormat = useCallback(function (tag) {
      document.execCommand(tag, false, null);
    }, []);

    /**
     * Handle content changes from the contentEditable div.
     */
    var handleInput = useCallback(function () {
      var html = editorRef.current.innerHTML;
      var pos = getCursorPosition();
      // Send as insert_text or format op based on change
      sendOp('insert_text', { position: pos, text: '', length: 0 });
    }, [sendOp, getCursorPosition]);

    /**
     * Handle keyboard shortcuts.
     */
    var handleKeyDown = useCallback(function (ev) {
      if (ev.ctrlKey || ev.metaKey) {
        switch (ev.key.toLowerCase()) {
          case 'b':
            ev.preventDefault();
            document.execCommand('bold', false, null);
            sendOp('format', { start: 0, end: 0, format: 'bold' });
            break;
          case 'i':
            ev.preventDefault();
            document.execCommand('italic', false, null);
            sendOp('format', { start: 0, end: 0, format: 'italic' });
            break;
          case 'u':
            ev.preventDefault();
            document.execCommand('underline', false, null);
            sendOp('format', { start: 0, end: 0, format: 'underline' });
            break;
          case 'z':
            ev.preventDefault();
            sendOp('undo', {});
            break;
          case 'y':
            ev.preventDefault();
            sendOp('redo', {});
            break;
          case 's':
            ev.preventDefault();
            onSave(stream.content);
            break;
        }
      }
    }, [sendOp, onSave, stream.content]);

    /**
     * Insert image at cursor position.
     */
    var insertImage = useCallback(function (url, alt) {
      var pos = getCursorPosition();
      sendOp('insert_image', { position: pos, src: url, alt: alt || 'Image' });
      setShowImageDialog(false);
      setImageUrl('');
    }, [sendOp, getCursorPosition]);

    /**
     * Insert table at cursor position.
     */
    var insertTable = useCallback(function (rows, cols) {
      var pos = getCursorPosition();
      sendOp('insert_table', { position: pos, rows: rows, cols: cols });
      setShowTableGrid(false);
    }, [sendOp, getCursorPosition]);

    /**
     * Insert list at cursor position.
     */
    var insertList = useCallback(function (type) {
      var pos = getCursorPosition();
      sendOp('insert_list', { position: pos, type: type });
    }, [sendOp, getCursorPosition]);

    /**
     * Handle screen resize — adapt layout for mobile/desktop transitions.
     */
    var onScreenResize = useCallback(function () {
      var mobile = detectMobile();
      setIsMobile(mobile);
      if (!mobile) {
        setShowFabMenu(false);
      }
    }, []);

    /**
     * Handle touch start — record initial touch position for swipe detection.
     */
    var touchStart = useCallback(function (ev) {
      if (ev.touches.length === 1) {
        touchStartRef.current = {
          x: ev.touches[0].clientX,
          y: ev.touches[0].clientY,
          time: Date.now()
        };
        touchMoveRef.current = null;
      } else if (ev.touches.length === 2) {
        // Pinch start: record distance between two fingers
        var dx = ev.touches[0].clientX - ev.touches[1].clientX;
        var dy = ev.touches[0].clientY - ev.touches[1].clientY;
        pinchStartRef.current = Math.sqrt(dx * dx + dy * dy);
      }
    }, []);

    /**
     * Handle touch move — track movement for swipe and pinch gestures.
     */
    var touchMove = useCallback(function (ev) {
      if (ev.touches.length === 1 && touchStartRef.current) {
        touchMoveRef.current = {
          x: ev.touches[0].clientX,
          y: ev.touches[0].clientY
        };
      } else if (ev.touches.length === 2 && pinchStartRef.current) {
        // Pinch-to-zoom: adjust text size
        var dx = ev.touches[0].clientX - ev.touches[1].clientX;
        var dy = ev.touches[0].clientY - ev.touches[1].clientY;
        var currentDist = Math.sqrt(dx * dx + dy * dy);
        var scale = currentDist / pinchStartRef.current;
        var newZoom = Math.max(50, Math.min(200, Math.round(100 * scale)));
        setTextZoom(newZoom);
        if (editorRef.current) {
          editorRef.current.style.fontSize = newZoom + '%';
        }
        pinchStartRef.current = currentDist;
      }
    }, []);

    /**
     * Handle touch end — detect swipe gestures for undo/redo.
     */
    var touchEnd = useCallback(function (ev) {
      if (!touchStartRef.current) return;
      var start = touchStartRef.current;
      var end = touchMoveRef.current || { x: start.x, y: start.y };
      var dx = end.x - start.x;
      var dy = end.y - start.y;
      var absDx = Math.abs(dx);
      var absDy = Math.abs(dy);
      var elapsed = Date.now() - start.time;

      // Swipe threshold: 80px horizontal, less than 500ms, mostly horizontal
      if (absDx > 80 && absDx > absDy * 2 && elapsed < 500) {
        if (dx < 0) {
          // Swipe left → undo
          hapticFeedback(15);
          sendOp('undo', {});
        } else {
          // Swipe right → redo
          hapticFeedback(15);
          sendOp('redo', {});
        }
      }
      touchStartRef.current = null;
      touchMoveRef.current = null;
      pinchStartRef.current = null;
    }, [sendOp]);

    /**
     * Toggle the floating action button menu on mobile.
     */
    var toggleFabMenu = useCallback(function () {
      hapticFeedback(5);
      setShowFabMenu(function (prev) { return !prev; });
    }, []);

    /**
     * Handle FAB action — execute command and close menu.
     */
    var handleFabAction = useCallback(function (action) {
      hapticFeedback(10);
      setShowFabMenu(false);
      action();
    }, []);

    /**
     * Screen resize and viewport awareness effect.
     */
    useEffect(function () {
      if (typeof window === 'undefined') return;
      window.addEventListener('resize', onScreenResize);
      window.addEventListener('orientationchange', onScreenResize);
      return function () {
        window.removeEventListener('resize', onScreenResize);
        window.removeEventListener('orientationchange', onScreenResize);
      };
    }, [onScreenResize]);

    /**
     * Sync content from stream to editor.
     */
    useEffect(function () {
      if (editorRef.current && content !== editorRef.current.innerHTML) {
        var sel = window.getSelection();
        var range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
        editorRef.current.innerHTML = content;
        // Restore cursor position
        if (range) {
          try {
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (_) {}
        }
      }
    }, [content]);


    // ── Render ──
    return e('div', { className: 'ds-editor-overlay' },
      e('div', { className: 'ds-editor-container' + (isMobile ? ' ds-editor-mobile' : '') },
        // ── Header ──
        e('div', { className: 'ds-editor-header' },
          e('div', { className: 'ds-editor-title' },
            e('i', { className: 'fas fa-file-edit' }),
            ' Съвместен редактор'
          ),
          e('div', { className: 'ds-editor-users' },
            connectedUsers.map(function (user, idx) {
              return e(UserAvatar, { key: idx, user: user, isConnected: true });
            }),
            e('div', { className: 'ds-connection-status', title: connectionStatus },
              e('span', { className: 'ds-status-dot ' + (isConnected ? 'connected' : 'disconnected') }),
              isConnected ? ' Свързан' : ' Няма връзка'
            )
          ),
          e('button', { className: 'ds-close-btn', onClick: onClose, title: 'Затвори' },
            e('i', { className: 'fas fa-times' })
          )
        ),

        // ── Toolbar ──
        e('div', { className: 'ds-toolbar' + (isMobile ? ' ds-toolbar-mobile' : '') },
          // Undo/Redo
          e(ToolbarButton, { icon: 'fas fa-undo', title: 'Отмяна (Ctrl+Z)', onClick: function () { sendOp('undo', {}); } }),
          e(ToolbarButton, { icon: 'fas fa-redo', title: 'Връщане (Ctrl+Y)', onClick: function () { sendOp('redo', {}); } }),
          e(ToolbarSeparator, null),

          // Text formatting
          e(ToolbarButton, { icon: 'fas fa-bold', title: 'Удебелен (Ctrl+B)', onClick: function () { document.execCommand('bold', false, null); sendOp('format', { start: 0, end: 0, format: 'bold' }); } }),
          e(ToolbarButton, { icon: 'fas fa-italic', title: 'Курсив (Ctrl+I)', onClick: function () { document.execCommand('italic', false, null); sendOp('format', { start: 0, end: 0, format: 'italic' }); } }),
          e(ToolbarButton, { icon: 'fas fa-underline', title: 'Подчертан (Ctrl+U)', onClick: function () { document.execCommand('underline', false, null); sendOp('format', { start: 0, end: 0, format: 'underline' }); } }),
          e(ToolbarButton, { icon: 'fas fa-strikethrough', title: 'Зачертан', onClick: function () { document.execCommand('strikeThrough', false, null); sendOp('format', { start: 0, end: 0, format: 'strikethrough' }); } }),
          e(ToolbarSeparator, null),

          // Headings
          e(ToolbarButton, { label: 'H1', title: 'Заглавие 1', onClick: function () { document.execCommand('formatBlock', false, 'h1'); sendOp('format', { start: 0, end: 0, format: 'heading1' }); } }),
          e(ToolbarButton, { label: 'H2', title: 'Заглавие 2', onClick: function () { document.execCommand('formatBlock', false, 'h2'); sendOp('format', { start: 0, end: 0, format: 'heading2' }); } }),
          e(ToolbarButton, { label: 'H3', title: 'Заглавие 3', onClick: function () { document.execCommand('formatBlock', false, 'h3'); sendOp('format', { start: 0, end: 0, format: 'heading3' }); } }),
          e(ToolbarButton, { label: 'P', title: 'Параграф', onClick: function () { document.execCommand('formatBlock', false, 'p'); sendOp('format', { start: 0, end: 0, format: 'normal' }); } }),
          e(ToolbarSeparator, null),

          // Lists
          e(ToolbarButton, { icon: 'fas fa-list-ul', title: 'Символен списък', onClick: function () { insertList('ul'); } }),
          e(ToolbarButton, { icon: 'fas fa-list-ol', title: 'Номериран списък', onClick: function () { insertList('ol'); } }),
          e(ToolbarSeparator, null),

          // Insert image
          e(ToolbarButton, { icon: 'fas fa-image', title: 'Вмъкни изображение', onClick: function () { setShowImageDialog(true); } }),
          // Insert table
          e(ToolbarButton, { icon: 'fas fa-table', title: 'Вмъкни таблица', onClick: function () { setShowTableGrid(true); } }),
          e(ToolbarSeparator, null),

          // Save
          e(ToolbarButton, { icon: 'fas fa-save', title: 'Запази (Ctrl+S)', onClick: function () { onSave(stream.content); } })
        ),

        // ── Editor area ──
        e('div', { className: 'ds-editor-body' },
          e('div', {
            ref: editorRef,
            className: 'ds-editable',
            contentEditable: true,
            suppressContentEditableWarning: true,
            onInput: handleInput,
            onKeyDown: handleKeyDown,
            onTouchStart: touchStart,
            onTouchMove: touchMove,
            onTouchEnd: touchEnd,
            style: isMobile ? { fontSize: textZoom + '%' } : {},
            dangerouslySetInnerHTML: { __html: content }
          }),

          // Remote cursors overlay
          cursors.map(function (cursor, idx) {
            return e('div', {
              key: idx,
              className: 'ds-remote-cursor',
              style: {
                left: (cursor.cursor_position * 8) + 'px',
                top: (Math.floor(cursor.cursor_position / 80) * 24) + 'px',
                backgroundColor: cursor.color
              },
              title: cursor.user_name + ' (' + cursor.user_email + ')'
            },
              e('div', { className: 'ds-cursor-label', style: { backgroundColor: cursor.color } }, cursor.user_name || cursor.user_email)
            );
          })
        ),

        // ── Image dialog ──
        showImageDialog && e('div', { className: 'ds-dialog-overlay', onClick: function () { setShowImageDialog(false); } },
          e('div', { className: 'ds-dialog', onClick: function (ev) { ev.stopPropagation(); } },
            e('h4', null, 'Вмъкни изображение'),
            e('div', { className: 'ds-dialog-field' },
              e('label', null, 'URL на изображение:'),
              e('input', {
                type: 'text',
                placeholder: 'https://example.com/image.jpg',
                value: imageUrl,
                onChange: function (ev) { setImageUrl(ev.target.value); }
              })
            ),
            e('div', { className: 'ds-dialog-actions' },
              e('button', { className: 'btn btn-outline', onClick: function () { setShowImageDialog(false); } }, 'Отказ'),
              e('button', {
                className: 'btn btn-primary',
                onClick: function () { insertImage(imageUrl, 'Inserted image'); },
                disabled: !imageUrl
              }, 'Вмъкни')
            )
          )
        ),

        // ── Table grid dialog ──
        showTableGrid && e('div', { className: 'ds-dialog-overlay', onClick: function () { setShowTableGrid(false); } },
          e('div', { className: 'ds-dialog', onClick: function (ev) { ev.stopPropagation(); } },
            e('h4', null, 'Вмъкни таблица'),
            e('div', { className: 'ds-table-grid' },
              Array.from({ length: 10 }, function (_, r) {
                return e('div', { key: r, className: 'ds-table-row' },
                  Array.from({ length: 10 }, function (_, c) {
                    return e('div', {
                      key: c,
                      className: 'ds-table-cell' + (r < tableRows && c < tableCols ? ' selected' : ''),
                      onMouseEnter: function () { setTableRows(r + 1); setTableCols(c + 1); },
                      onClick: function () { insertTable(r + 1, c + 1); }
                    });
                  })
                );
              })
            ),
            e('div', { className: 'ds-dialog-info' }, tableRows + ' x ' + tableCols),
            e('div', { className: 'ds-dialog-actions' },
              e('button', { className: 'btn btn-outline', onClick: function () { setShowTableGrid(false); } }, 'Отказ')
            )
          )
        ),

        // ── Footer ──
        e('div', { className: 'ds-editor-footer' },
          e('span', { className: 'ds-footer-info' }, connectedUsers.length + ' активни потребителя'),
          e('span', { className: 'ds-footer-info' }, stream.content.length + ' символа')
        ),

        // ── Mobile FAB (floating action button) ──
        isMobile && e('div', { className: 'ds-fab-overlay' },
          e('button', {
            className: 'ds-fab-toggle',
            onClick: toggleFabMenu,
            title: 'Меню',
            'aria-label': 'Меню за мобилни действия'
          }, e('i', { className: showFabMenu ? 'fas fa-times' : 'fas fa-ellipsis-v' })),
          showFabMenu && e('div', { className: 'ds-fab-menu' },
            e('button', {
              className: 'ds-fab-item',
              onClick: function () { handleFabAction(function () { sendOp('undo', {}); }); },
              title: 'Отмяна'
            }, e('i', { className: 'fas fa-undo' }), ' Отмяна'),
            e('button', {
              className: 'ds-fab-item',
              onClick: function () { handleFabAction(function () { sendOp('redo', {}); }); },
              title: 'Връщане'
            }, e('i', { className: 'fas fa-redo' }), ' Връщане'),
            e('button', {
              className: 'ds-fab-item',
              onClick: function () { handleFabAction(function () { document.execCommand('bold', false, null); sendOp('format', { start: 0, end: 0, format: 'bold' }); }); },
              title: 'Удебелен'
            }, e('i', { className: 'fas fa-bold' }), ' Удебелен'),
            e('button', {
              className: 'ds-fab-item',
              onClick: function () { handleFabAction(function () { document.execCommand('italic', false, null); sendOp('format', { start: 0, end: 0, format: 'italic' }); }); },
              title: 'Курсив'
            }, e('i', { className: 'fas fa-italic' }), ' Курсив'),
            e('button', {
              className: 'ds-fab-item',
              onClick: function () { handleFabAction(function () { setShowImageDialog(true); }); },
              title: 'Изображение'
            }, e('i', { className: 'fas fa-image' }), ' Изображение'),
            e('button', {
              className: 'ds-fab-item',
              onClick: function () { handleFabAction(function () { onSave(stream.content); }); },
              title: 'Запази'
            }, e('i', { className: 'fas fa-save' }), ' Запази')
          )
        )
      )
    );
  }

  // Expose globally
  global.__DocStreamEditor = DocStreamEditor;
  if (typeof window !== 'undefined') {
    window.__DocStreamEditor = DocStreamEditor;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
