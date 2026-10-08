/* ═══════════════════════════════════════════════════════════════════════
 * DocStreamClient.js — React hook for real-time collaborative document editing
 * ═══════════════════════════════════════════════════════════════════════
 * Manages SSE connection, applies remote operations, broadcasts local changes,
 * and tracks cursor positions of connected users.
 *
 * Usage:
 *   const { content, setContent, cursors, isConnected, sendOp } = useDocStream({
 *     docId, userEmail, userName
 *   });
 *
 * Supported op_types: insert_text, delete_text, format, insert_image,
 *                      insert_table, insert_list, undo, redo
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var useCallback = React.useCallback;

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * T63 — Conflict Resolution
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Detect version conflict between local and server versions.
   * @param {number} localVersion — локалната версия на документа
   * @param {number} serverVersion — сървърната версия на документа
   * @returns {boolean} true има конфликт
   */
  function detectConflict(localVersion, serverVersion) {
    return localVersion < serverVersion;
  }

  /**
   * Compute longest common subsequence length for two strings.
   * Опростен diff-match-patch подход за 3-way merge.
   */
  function lcsLength(a, b) {
    var m = a.length;
    var n = b.length;
    if (m === 0 || n === 0) return 0;
    var prev = new Array(n + 1).fill(0);
    var curr = new Array(n + 1).fill(0);
    for (var i = 1; i <= m; i++) {
      for (var j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      var tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[n];
  }

  /**
   * Определя процент на прилика между два низа.
   * @returns {number} между 0 и 1
   */
  function similarity(a, b) {
    if (a.length === 0 && b.length === 0) return 1;
    var maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return lcsLength(a, b) / maxLen;
  }

  /**
   * Опростен 3-way merge — комбинира локалните и сървърните промени
   * спрямо базовия текст. Стратегия 'auto-merge'.
   * @param {string} base — базово съдържание (общата баща версия)
   * @param {string} ours — локалните промени
   * @param {string} theirs — сървърните промени
   * @returns {string} резултат от сливането
   */
  function threeWayMerge(base, ours, theirs) {
    // Ако ours === base, няма локални промени — вземи тяхното
    if (ours === base) return theirs;
    // Ако theirs === base, няма сървърни промени — вземи нашето
    if (theirs === base) return ours;
    // Ако и двата са еднакви, няма конфликт
    if (ours === theirs) return ours;

    // Опростена стратегия: ако промените са достатъчно различни,
    // конкатенирай с разделител за ръчно сливане
    var sim = similarity(ours, theirs);
    if (sim > 0.85) {
      // Висока прилика — вземи по-дългия (по-пълния)
      return ours.length >= theirs.length ? ours : theirs;
    }

    // Ниска прилика — обедини с маркер за ръчно сливане
    return '<<<<<<< локални\n' + ours + '\n=======\n' + theirs + '\n>>>>>>> сървър';
  }

  /**
   * Resolve a conflict using the specified strategy.
   * @param {string} strategy — 'auto-merge' | 'theirs' | 'ours'
   * @param {Object} ctx — контекст за решаване
   * @param {string} ctx.base — базово съдържание
   * @param {string} ctx.ours — локално съдържание
   * @param {string} ctx.theirs — сървърно съдържание
   * @returns {string} решеното съдържание
   */
  function resolveConflict(strategy, ctx) {
    switch (strategy) {
      case 'theirs':
        return ctx.theirs;
      case 'ours':
        return ctx.ours;
      case 'auto-merge':
      default:
        return threeWayMerge(ctx.base, ctx.ours, ctx.theirs);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * T64 — Offline Editing
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Генерира уникален ключ за localStorage за чернова на документ.
   * @param {string} docId
   * @returns {string}
   */
  function draftKey(docId) {
    return 'docstream_draft_' + docId;
  }

  /**
   * Записва локална чернова в localStorage.
   * @param {string} docId
   * @param {string} contentHtml
   */
  function saveLocalDraft(docId, contentHtml) {
    try {
      localStorage.setItem(draftKey(docId), JSON.stringify({
        content: contentHtml,
        timestamp: Date.now()
      }));
    } catch (e) {
      // localStorage пълен или недостъпен — тихо игнорираме
    }
  }

  /**
   * Зарежда локална чернова от localStorage.
   * @param {string} docId
   * @returns {string|null} съдържанието или null
   */
  function loadLocalDraft(docId) {
    try {
      var raw = localStorage.getItem(draftKey(docId));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed.content || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Generate a random color for user cursor.
   */
  function generateColor(email) {
    var colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#16a085'];
    var hash = 0;
    for (var i = 0; i < email.length; i++) {
      hash = ((hash << 5) - hash) + email.charCodeAt(i);
      hash |= 0;
    }
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Apply a single operation to HTML content.
   * Returns new HTML string.
   */
  function applyOpToHtml(html, op) {
    var data = op.op_data;
    switch (op.op_type) {
      case 'insert_text':
        return html.slice(0, data.position) + data.text + html.slice(data.position);
      case 'delete_text':
        return html.slice(0, data.position) + html.slice(data.position + data.length);
      case 'format':
        // Wrap selection in formatting tag
        var before = html.slice(0, data.start);
        var selected = html.slice(data.start, data.end);
        var after = html.slice(data.end);
        var tag = data.format;
        if (tag === 'bold') selected = '<strong>' + selected + '</strong>';
        else if (tag === 'italic') selected = '<em>' + selected + '</em>';
        else if (tag === 'underline') selected = '<u>' + selected + '</u>';
        else if (tag === 'strikethrough') selected = '<s>' + selected + '</s>';
        else if (tag === 'heading1') selected = '<h1>' + selected + '</h1>';
        else if (tag === 'heading2') selected = '<h2>' + selected + '</h2>';
        else if (tag === 'heading3') selected = '<h3>' + selected + '</h3>';
        else if (tag === 'normal') selected = '<p>' + selected + '</p>';
        return before + selected + after;
      case 'insert_image':
        var img = '<img src="' + data.src + '" alt="' + (data.alt || '') + '" style="max-width:100%;' + (data.width ? 'width:' + data.width + 'px;' : '') + (data.height ? 'height:' + data.height + 'px;' : '') + '" />';
        return html.slice(0, data.position) + img + html.slice(data.position);
      case 'insert_table':
        var table = '<table style="border-collapse:collapse;width:100%;margin:1rem 0;">';
        for (var r = 0; r < data.rows; r++) {
          table += '<tr>';
          for (var c = 0; c < data.cols; c++) {
            table += '<td style="border:1px solid #ddd;padding:8px;">&nbsp;</td>';
          }
          table += '</tr>';
        }
        table += '</table>';
        return html.slice(0, data.position) + table + html.slice(data.position);
      case 'insert_list':
        var listTag = data.type === 'ol' ? 'ol' : 'ul';
        var list = '<' + listTag + '><li>Item 1</li><li>Item 2</li><li>Item 3</li></' + listTag + '>';
        return html.slice(0, data.position) + list + html.slice(data.position);
      default:
        return html;
    }
  }

  /**
   * useDocStream hook.
   * @param {Object} opts
   * @param {string} opts.docId — document identifier
   * @param {string} opts.userEmail — current user email
   * @param {string} opts.userName — current user display name
   * @param {string} [opts.initialContent=''] — initial HTML content
   * @param {Function} [opts.onContentChange] — called when content changes
   * @param {Function} [opts.onConflict] — called when conflict detected (params: { localVersion, serverVersion, strategy, resolved })
   * @param {string} [opts.conflictStrategy='auto-merge'] — default conflict resolution strategy
   * @param {number} [opts.debounceMs=300] — debounce for sending ops
   * @returns {{ content, setContent, cursors, isConnected, connectedUsers, sendOp, sendCursor, connectionStatus, conflictLog, isOnline, offlineIndicator, syncPendingOps }}
   */
  function useDocStream(opts) {
    var docId = opts.docId;
    var userEmail = opts.userEmail;
    var userName = opts.userName || userEmail;
    var initialContent = opts.initialContent || '';
    var onContentChange = opts.onContentChange;
    var onConflict = opts.onConflict;
    var conflictStrategy = opts.conflictStrategy || 'auto-merge';
    var debounceMs = opts.debounceMs || 300;

    // T64 — Зареди локална чернова ако съществува
    var savedDraft = (typeof localStorage !== 'undefined') ? loadLocalDraft(docId) : null;

    var [content, setContent] = useState(savedDraft || initialContent);
    var [cursors, setCursors] = useState([]);
    var [isConnected, setIsConnected] = useState(false);
    var [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
    var [connectedUsers, setConnectedUsers] = useState([]);

    // T63 — Conflict resolution state
    var [conflictLog, setConflictLog] = useState([]);

    // T64 — Offline editing state
    var [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    var [offlineIndicator, setOfflineIndicator] = useState(false);
    var offlineQueueRef = useRef([]);
    var syncBackoffRef = useRef(0);
    var syncTimerRef = useRef(null);
    var baseContentRef = useRef(''); // Базово съдържание за 3-way merge

    var eventSourceRef = useRef(null);
    var versionRef = useRef(0);
    var reconnectAttemptsRef = useRef(0);
    var reconnectTimerRef = useRef(null);
    var contentRef = useRef(content);
    var pendingOpsRef = useRef([]);
    var debounceTimerRef = useRef(null);

    // Keep contentRef in sync
    useEffect(function () {
      contentRef.current = content;
      if (onContentChange) onContentChange(content);
    }, [content, onContentChange]);

    /**
     * Connect to SSE endpoint.
     */
    var connect = useCallback(function () {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      setConnectionStatus(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');

      var params = new URLSearchParams({
        doc_id: docId,
        user_email: userEmail,
        user_name: userName
      });

      var es = new EventSource('/database/doc-stream.php?' + params.toString());
      eventSourceRef.current = es;

      es.addEventListener('state', function (e) {
        var data = JSON.parse(e.data);
        if (data.content_html) {
          setContent(data.content_html);
          contentRef.current = data.content_html;
          // T63 — Запази базовото съдържание за 3-way merge
          baseContentRef.current = data.content_html;
        }
        versionRef.current = data.last_version || 0;
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
      });

      es.addEventListener('ops', function (e) {
        var ops = JSON.parse(e.data);
        if (!Array.isArray(ops)) return;
        ops.forEach(function (op) {
          versionRef.current = Math.max(versionRef.current, op.version);
          // Skip own ops (already applied locally)
          if (op.user_email === userEmail) return;
          setContent(function (prev) {
            var next = applyOpToHtml(prev, op);
            contentRef.current = next;
            return next;
          });
        });
      });

      es.addEventListener('cursors', function (e) {
        var sessions = JSON.parse(e.data);
        setCursors(sessions || []);
        setConnectedUsers((sessions || []).map(function (s) {
          return { email: s.user_email, name: s.user_name, color: s.color };
        }));
      });

      es.addEventListener('presence', function (e) {
        var data = JSON.parse(e.data);
        if (data.action === 'join') {
          setConnectedUsers(function (prev) {
            if (prev.some(function (u) { return u.email === data.user_email; })) return prev;
            return prev.concat({ email: data.user_email, name: data.user_name, color: data.color });
          });
        } else if (data.action === 'leave') {
          setConnectedUsers(function (prev) {
            return prev.filter(function (u) { return u.email !== data.user_email; });
          });
          setCursors(function (prev) {
            return prev.filter(function (c) { return c.user_email !== data.user_email; });
          });
        }
      });

      es.addEventListener('error', function () {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        es.close();

        // Exponential backoff reconnect
        var attempts = reconnectAttemptsRef.current;
        var delay = Math.min(1000 * Math.pow(2, attempts), 30000);
        reconnectAttemptsRef.current = attempts + 1;

        reconnectTimerRef.current = setTimeout(function () {
          connect();
        }, delay);
      });

      es.addEventListener('heartbeat', function () {
        // Connection is alive
      });

    }, [docId, userEmail, userName]);

    /**
     * Send an operation to the server.
     * T64 — Ако офлайн, добавя в опашката вместо да изпраща.
     * T63 — При конфликт на версиите, опитва auto-merge.
     */
    var sendOp = useCallback(function (opType, opData) {
      var op = {
        doc_id: docId,
        user_email: userEmail,
        op_type: opType,
        op_data: opData,
        version: versionRef.current
      };

      // T64 — Ако офлайн, добавя в опашката
      if (!isOnline) {
        offlineQueueRef.current.push(op);
        // Запазва локална чернова
        saveLocalDraft(docId, contentRef.current);
        return;
      }

      // Optimistically apply locally
      setContent(function (prev) {
        var next = applyOpToHtml(prev, { op_type: opType, op_data: opData });
        contentRef.current = next;
        return next;
      });

      // Send to server
      fetch('/database/doc-stream-op.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op),
        credentials: 'include'
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res.success) {
          versionRef.current = res.version;
        } else if (res.error === 'Version conflict') {
          // T63 — Опит за auto-merge при конфликт
          var localVer = versionRef.current;
          var serverVer = res.server_version;

          if (detectConflict(localVer, serverVer)) {
            var resolved = resolveConflict(conflictStrategy, {
              base: baseContentRef.current,
              ours: contentRef.current,
              theirs: res.server_content || ''
            });

            // Обновява conflict log
            var entry = {
              timestamp: Date.now(),
              localVersion: localVer,
              serverVersion: serverVer,
              strategy: conflictStrategy,
              resolved: true
            };
            setConflictLog(function (prev) {
              return prev.concat(entry);
            });

            // Приложи решението
            setContent(resolved);
            contentRef.current = resolved;
            versionRef.current = serverVer;

            // Извиква callback ако е предоставен
            if (onConflict) {
              onConflict(entry);
            }
          }
        }
      }).catch(function () {
        // T64 — При грешка в мрежата, добавя в опашката
        offlineQueueRef.current.push(op);
        saveLocalDraft(docId, contentRef.current);
      });

    }, [docId, userEmail, isOnline, conflictStrategy, onConflict]);

    /**
     * Send cursor position update.
     */
    var sendCursor = useCallback(function (position) {
      // Broadcast via custom event (handled by SSE)
      // For now, cursor is sent via presence updates
    }, []);

    /**
     * Debounced send for text input.
     */
    var sendTextOp = useCallback(function (opType, opData) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(function () {
        sendOp(opType, opData);
      }, debounceMs);
    }, [sendOp, debounceMs]);

    /**
     * T64 — Sync queued offline operations when back online.
     * Възпроизвежда всички операции от опашката с exponential backoff.
     */
    var syncPendingOps = useCallback(function () {
      if (offlineQueueRef.current.length === 0) return;

      var queue = offlineQueueRef.current.slice();
      offlineQueueRef.current = [];

      var attempt = 0;
      var maxAttempts = 5;

      function processNext() {
        if (queue.length === 0) {
          syncBackoffRef.current = 0;
          return;
        }
        if (!isOnline) {
          // Отново офлайн — връща в опашката
          offlineQueueRef.current = queue.concat(offlineQueueRef.current);
          return;
        }

        var nextOp = queue.shift();
        fetch('/database/doc-stream-op.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nextOp),
          credentials: 'include'
        }).then(function (r) { return r.json(); }).then(function (res) {
          if (res.success) {
            versionRef.current = res.version;
            attempt = 0; // Успех — нулира backoff
            processNext();
          } else if (res.error === 'Version conflict') {
            // T63 — При sync конфликт, прилагай auto-merge
            var resolved = resolveConflict(conflictStrategy, {
              base: baseContentRef.current,
              ours: contentRef.current,
              theirs: res.server_content || ''
            });
            setContent(resolved);
            contentRef.current = resolved;
            versionRef.current = res.server_version;
            processNext();
          } else {
            // Грешка — retry с backoff
            attempt++;
            if (attempt < maxAttempts) {
              var delay = Math.min(1000 * Math.pow(2, attempt), 30000);
              syncBackoffRef.current = delay;
              syncTimerRef.current = setTimeout(processNext, delay);
            } else {
              // Отказва се — връща в опашката
              offlineQueueRef.current = queue.concat(offlineQueueRef.current);
            }
          }
        }).catch(function () {
          // Мрежова грешка — retry с backoff
          attempt++;
          if (attempt < maxAttempts) {
            var delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            syncBackoffRef.current = delay;
            syncTimerRef.current = setTimeout(processNext, delay);
          } else {
            offlineQueueRef.current = queue.concat(offlineQueueRef.current);
          }
        });
      }

      processNext();
    }, [isOnline, conflictStrategy]);

    // Connect on mount
    useEffect(function () {
      connect();

      // T64 — Следи състоянието на мрежата
      function handleOnline() {
        setIsOnline(true);
        setOfflineIndicator(false);
        // Синхронизира опашката при възстановяване на връзката
        syncPendingOps();
      }

      function handleOffline() {
        setIsOnline(false);
        setOfflineIndicator(true);
        // Запазва текущото съдържание като чернова
        saveLocalDraft(docId, contentRef.current);
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
      }

      return function () {
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
        }
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        if (syncTimerRef.current) {
          clearTimeout(syncTimerRef.current);
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
        }
      };
    }, [connect, syncPendingOps, docId]);

    return {
      content: content,
      setContent: setContent,
      cursors: cursors,
      isConnected: isConnected,
      connectedUsers: connectedUsers,
      sendOp: sendOp,
      sendTextOp: sendTextOp,
      sendCursor: sendCursor,
      connectionStatus: connectionStatus,
      // T63 — Conflict resolution
      conflictLog: conflictLog,
      // T64 — Offline editing
      isOnline: isOnline,
      offlineIndicator: offlineIndicator,
      syncPendingOps: syncPendingOps
    };
  }

  // Expose globally
  global.__useDocStream = useDocStream;
  if (typeof window !== 'undefined') {
    window.__useDocStream = useDocStream;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
