/* ═══════════════════════════════════════════════════════════════════════
 * Step2RefereeCheck.js — Referee duplicate check component (Step 2)
 * ═══════════════════════════════════════════════════════════════════════
 * Embedded in Step 2 Documents (after document list, before navigation).
 * Checks each external reviewer for duplicate proposer status via
 * api('checkproposer', { leaderName, competitionYear, projectType }).
 *
 * Props:
 *   { referees: Array<{name, degree, organization, email, phone}>,
 *     competitionYear: number,
 *     projectType: string,
 *     onDuplicatesExist: (hasDuplicates: boolean) => void }
 *
 * Statuses per referee: 'pending' | 'checking' | 'ok' | 'duplicate'
 *
 * v1.0.0: Initial implementation.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;

  // ── Status labels (Bulgarian) ──
  var STATUS_LABELS = {
    pending: 'Очаква проверка',
    checking: 'Проверка...',
    ok: 'Без дублиране',
    duplicate: 'Открито дублиране'
  };

  // ── Status icons ──
  var STATUS_ICONS = {
    pending: '⏳',
    checking: '🔄',
    ok: '✓',
    duplicate: '⚠'
  };

  /**
   * Step2RefereeCheck — Lists entered referees and checks each for duplicate
   * proposer status against the checkproposer API.
   *
   * Prevents form submission when duplicates exist by calling
   * onDuplicatesExist(true) whenever any referee has status 'duplicate'.
   *
   * @param {Object} props
   * @param {Array<{name:string}>} props.referees — external reviewers from step3
   * @param {number} props.competitionYear — from step1.competition_year
   * @param {string} props.projectType — from step1.project_type (ФНИ|ПНИ|ДНП|НПФ)
   * @param {Function} [props.onDuplicatesExist] — callback(hasDuplicates)
   * @returns {React.ReactElement|null}
   */
  function Step2RefereeCheck(props) {
    var referees = props.referees || [];
    var competitionYear = props.competitionYear || new Date().getFullYear();
    var projectType = props.projectType || '';
    var onDuplicatesExist = props.onDuplicatesExist || function () {};

    // ── Per-referee check state ──
    // Map keyed by referee index: { status, result, loading }
    var _checkState = useState({});
    var checkState = _checkState[0];
    var setCheckState = _checkState[1];

    /**
     * Check a single referee for duplicate proposer status.
     * @param {number} idx — index in referees array
     * @param {Object} referee — { name, degree, organization, email, phone }
     */
    var checkReferee = useCallback(function (idx, referee) {
      if (!referee || !referee.name) return;

      // Mark as checking
      setCheckState(function (prev) {
        var next = {};
        Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
        next[idx] = { status: 'checking', result: null, loading: true };
        return next;
      });

      // Use checkProposer from __pwApi if available, else fall back to raw api()
      var apiPromise;
      if (global.__pwApi && typeof global.__pwApi.checkProposer === 'function') {
        apiPromise = global.__pwApi.checkProposer(referee.name, competitionYear, projectType);
      } else {
        // Fallback: call the raw api() with the action name
        var rawApi = (typeof api === 'function') ? api : (typeof window.api === 'function' ? window.api : null);
        if (!rawApi) {
          setCheckState(function (prev) {
            var next = {};
            Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
            next[idx] = { status: 'pending', result: null, loading: false, error: 'API не е налично' };
            return next;
          });
          return;
        }
        apiPromise = rawApi('checkproposer', {
          leaderName: referee.name,
          competitionYear: competitionYear,
          projectType: projectType
        });
      }

      apiPromise.then(function (res) {
        if (res && res.exists) {
          setCheckState(function (prev) {
            var next = {};
            Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
            next[idx] = { status: 'duplicate', result: res, loading: false };
            return next;
          });
        } else {
          setCheckState(function (prev) {
            var next = {};
            Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
            next[idx] = { status: 'ok', result: res || { exists: false }, loading: false };
            return next;
          });
        }
      }).catch(function (err) {
        console.warn('[Step2RefereeCheck] Check failed for referee ' + referee.name + ':', err);
        setCheckState(function (prev) {
          var next = {};
          Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
          next[idx] = { status: 'pending', result: null, loading: false, error: (err && err.message) || 'Грешка при проверка' };
          return next;
        });
      });
    }, [competitionYear, projectType]);

    // ── Auto-check referees on mount / when list changes ──
    useEffect(function () {
      if (!Array.isArray(referees) || referees.length === 0) return;
      // Only check referees that have no state yet (avoid redundant calls)
      var stateSnapshot = checkState;
      referees.forEach(function (ref, idx) {
        if (!stateSnapshot[idx] && ref && ref.name) {
          checkReferee(idx, ref);
        }
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [referees]);

    // ── Notify parent when duplicate count changes ──
    useEffect(function () {
      var dupCount = 0;
      Object.keys(checkState).forEach(function (k) {
        if (checkState[k] && checkState[k].status === 'duplicate') {
          dupCount++;
        }
      });
      onDuplicatesExist(dupCount > 0);
    }, [checkState, onDuplicatesExist]);

    // ── Early return: no referees ──
    if (!Array.isArray(referees) || referees.length === 0) {
      return null;
    }

    // ── Compute summary counts ──
    var totalCount = referees.length;
    var checkedCount = 0;
    var duplicateCount = 0;
    Object.keys(checkState).forEach(function (k) {
      var cs = checkState[k];
      if (cs && (cs.status === 'ok' || cs.status === 'duplicate')) {
        checkedCount++;
      }
      if (cs && cs.status === 'duplicate') {
        duplicateCount++;
      }
    });

    var hasDuplicates = duplicateCount > 0;

    // ── Render a single referee row ──
    function renderRefereeRow(referee, idx) {
      var cs = checkState[idx] || { status: 'pending', result: null, loading: false };
      var status = cs.status;
      var isLoading = cs.loading === true;
      var isDuplicate = status === 'duplicate';
      var statusLabel = STATUS_LABELS[status] || status;
      var statusIcon = STATUS_ICONS[status] || '';

      var existingProject = (isDuplicate && cs.result && cs.result.existingProject) || null;
      var duplicateMessage = (isDuplicate && cs.result && cs.result.message) || '';

      return e('div', {
        key: idx,
        className: 'pw-referee-row pw-referee-status-' + status,
        role: 'listitem',
        style: {
          padding: '10px 12px',
          marginBottom: 8,
          border: '1px solid ' + (isDuplicate ? 'var(--pw-error-300)' : 'var(--pw-neutral-200)'),
          borderRadius: 6,
          backgroundColor: isDuplicate ? 'var(--pw-error-50)' : 'var(--pw-neutral-50)'
        }
      },
        // Status indicator + name
        e('div', { className: 'pw-referee-main', style: { display: 'flex', alignItems: 'center', marginBottom: 6 } },
          e('span', {
            className: 'pw-referee-status-icon',
            'aria-hidden': 'true',
            style: { marginRight: 8, fontSize: 14 }
          }, statusIcon),
          e('span', { className: 'pw-referee-name', style: { fontWeight: 500, marginRight: 6 } },
            referee.name || 'Без име'
          ),
          referee.degree ? e('span', {
            className: 'pw-referee-degree',
            style: { fontSize: 12, color: 'var(--pw-neutral-500)', marginRight: 6 }
          }, '(' + referee.degree + ')') : null,
          referee.organization ? e('span', {
            className: 'pw-referee-org',
            style: { fontSize: 12, color: 'var(--pw-neutral-500)' }
          }, referee.organization) : null
        ),

        // Bottom row: status badge + Check Again button
        e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
          e('span', {
            className: 'pw-referee-status-badge pw-referee-badge-' + status,
            role: 'status',
            'aria-label': statusLabel,
            style: {
              display: 'inline-block',
              padding: '2px 8px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              backgroundColor: isDuplicate ? 'var(--pw-error-100)' : (status === 'ok' ? 'var(--pw-success-100)' : 'var(--pw-neutral-100)'),
              color: isDuplicate ? 'var(--pw-error-700)' : (status === 'ok' ? 'var(--pw-success-700)' : 'var(--pw-neutral-600)')
            }
          }, statusLabel),
          e('button', {
            className: 'pw-btn pw-btn-sm pw-btn-outline-clay',
            onClick: function () { checkReferee(idx, referee); },
            disabled: isLoading,
            style: { fontSize: 12, padding: '2px 10px' },
            'aria-label': 'Провери отново ' + (referee.name || '')
          }, isLoading ? 'Проверка...' : 'Провери отново')
        ),

        // Duplicate warning panel
        isDuplicate ? e('div', {
          className: 'pw-referee-duplicate-warning',
          role: 'alert',
          'aria-live': 'assertive',
          style: {
            marginTop: 8,
            padding: '8px 12px',
            backgroundColor: 'var(--pw-error-50)',
            border: '1px solid var(--pw-error-200)',
            borderRadius: 4,
            fontSize: 13
          }
        },
          e('div', { className: 'pw-referee-dup-title', style: { fontWeight: 600, color: 'var(--pw-error-700)', marginBottom: 4 } },
            '⚠ Открито е дублиране!'
          ),
          duplicateMessage ? e('div', { className: 'pw-referee-dup-msg', style: { marginBottom: 6 } }, duplicateMessage) : null,
          existingProject ? e('div', { className: 'pw-referee-dup-details', style: { fontSize: 12 } },
            e('div', null,
              e('strong', null, 'Съществуващ проект: '),
              existingProject.title || '—'
            ),
            e('div', null,
              e('strong', null, 'Статус: '),
              existingProject.status || '—'
            ),
            e('div', null,
              e('strong', null, 'Тип: '),
              existingProject.projectType || '—'
            )
          ) : null
        ) : null
      );
    }

    // ── Main render ──
    return e('div', { className: 'pw-referee-check', style: { marginTop: 24, marginBottom: 16 } },
      // Section header
      e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 } },
        e('h3', {
          className: 'pw-referee-check-title',
          style: { fontSize: 16, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center' }
        },
          e('i', { className: 'fas fa-user-check', style: { marginRight: 8 }, 'aria-hidden': 'true' }),
          'Проверка за дублиране на рецензенти'
        ),
        hasDuplicates ? e('span', {
          role: 'alert',
          style: { color: 'var(--pw-error-600)', fontWeight: 600, fontSize: 13 }
        }, '⚠ ' + duplicateCount + ' дублиране(я)') : null
      ),

      // Description
      e('p', {
        style: { fontSize: 13, color: 'var(--pw-neutral-500)', marginBottom: 12 }
      }, 'Проверява се всеки рецензент дали е лидер на друг проект от същия тип и година. Ако е така, подаването ще бъде блокирано.'),

      // Summary line
      e('div', {
        'aria-live': 'polite',
        style: {
          padding: '8px 12px',
          backgroundColor: hasDuplicates ? 'var(--pw-error-50)' : 'var(--pw-neutral-50)',
          borderRadius: 6,
          marginBottom: 12,
          fontSize: 13,
          fontWeight: hasDuplicates ? 600 : 400,
          color: hasDuplicates ? 'var(--pw-error-700)' : 'var(--pw-neutral-700)'
        }
      }, checkedCount + ' от ' + totalCount + ' рецензенти проверени, ' + duplicateCount + ' дублирания открити'),

      // Referee list
      e('div', { className: 'pw-referee-list', role: 'list', 'aria-label': 'Списък на рецензентите' },
        referees.map(function (ref, idx) {
          if (!ref) return null;
          return renderRefereeRow(ref, idx);
        })
      ),

      // Block message if duplicates exist
      hasDuplicates ? e('div', {
        role: 'alert',
        style: {
          marginTop: 12,
          padding: '10px 14px',
          backgroundColor: 'var(--pw-error-50)',
          border: '1px solid var(--pw-error-200)',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--pw-error-700)',
          display: 'flex',
          alignItems: 'center'
        }
      },
        e('i', { className: 'fas fa-ban', style: { marginRight: 8, fontSize: 16 }, 'aria-hidden': 'true' }),
        e('span', null,
          'Подаването е блокирано поради дублиране на рецензенти. Моля, премахнете или заменете рецензента преди да продължите.'
        )
      ) : null
    );
  }

  /* ── Expose globally ── */
  global.__pwStep2RefereeCheck = React.memo(Step2RefereeCheck);

})(window);