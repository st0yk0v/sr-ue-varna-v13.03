/* ═══════════════════════════════════════════════════════════════════════
 * Step4Review.js — Стъпка 4: Преглед и изпращане (Final Review)
 * ═══════════════════════════════════════════════════════════════════════
 * Props:
 *   - state: { step1, step2, step3, referees }
 *   - validation: { errors: [], warnings: [] }
 *   - projectType: string (from step1)
 *   - budgetRules: object (from config)
 *   - documentRequirements: object (from config)
 *   - onFieldChange: (field, value) => void
 *   - onSubmit: () => Promise
 *   - onSaveDraft: () => Promise
 *   - isSubmitting: boolean
 *   - isSavingDraft: boolean
 *   - proposalId: string|null
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var e = React.createElement;
  var useMemo = React.useMemo;
  var useCallback = React.useCallback;

  var PROJECT_TYPE_LABELS = {
    'ФНИ': 'Фундаментални научни изследвания (ФНИ)',
    'ПНИ': 'Приложни научни изследвания (ПНИ)',
    'ДНП': 'Докторски научно-представителски проекти (ДНП)',
    'НПФ': 'Научни форуми (НПФ)'
  };

  function Step4Review(props) {
    var state = props.state || {};
    var validation = props.validation || { errors: [], warnings: [] };
    var projectType = props.projectType || state.step1?.project_type || 'ФНИ';
    var budgetRules = props.budgetRules || global.__BUDGET_RULES__?.[projectType] || {};
    var documentRequirements = props.documentRequirements || global.__DOCUMENT_REQUIREMENTS__?.[projectType] || { required: [], optional: [] };
    var onFieldChange = props.onFieldChange || function () {};
    var onSubmit = props.onSubmit || function () {};
    var onSaveDraft = props.onSaveDraft || function () {};
    var isSubmitting = props.isSubmitting === true;
    var isSavingDraft = props.isSavingDraft === true;
    var proposalId = props.proposalId || state.proposalId || null;

    // ── T4: review comments panel state ──
    var _apiClient = (typeof api !== 'undefined') ? api : (typeof window !== 'undefined' ? window.api : null);
    var _reviewCommentsOpen = useState(false);
    var reviewCommentsOpen = _reviewCommentsOpen[0], setReviewCommentsOpen = _reviewCommentsOpen[1];
    var _reviewComments = useState([]);
    var reviewComments = _reviewComments[0], setReviewComments = _reviewComments[1];
    var _reviewLoading = useState(false);
    var reviewLoading = _reviewLoading[0], setReviewLoading = _reviewLoading[1];
    var _reviewError = useState('');
    var reviewError = _reviewError[0], setReviewError = _reviewError[1];
    var _reviewDraft = useState('');
    var reviewDraft = _reviewDraft[0], setReviewDraft = _reviewDraft[1];
    var _reviewPosting = useState(false);
    var reviewPosting = _reviewPosting[0], setReviewPosting = _reviewPosting[1];

    var _loadReviewComments = useCallback(function () {
      if (!_apiClient || !proposalId) { setReviewLoading(false); return; }
      setReviewLoading(true); setReviewError('');
      Promise.resolve(_apiClient('getreviewcomments', { proposalId: proposalId }))
        .then(function (r) {
          if (r && r.success && Array.isArray(r.comments)) setReviewComments(r.comments);
          else setReviewComments([]);
        })
        .catch(function () { setReviewError('Грешка при зареждане.'); setReviewComments([]); });
      setReviewLoading(false);
    }, [_apiClient, proposalId]);

    var _submitReviewComment = function () {
      var text = (reviewDraft || '').trim();
      if (!text || !_apiClient || !proposalId || reviewPosting) return;
      setReviewPosting(true); setReviewError('');
      Promise.resolve(_apiClient('addreviewcomment', { proposalId: proposalId, text: text }))
        .then(function (r) {
          if (r && r.success) { setReviewDraft(''); _loadReviewComments(); }
          else setReviewError((r && r.error) || 'Неуспешен запис.');
        })
        .catch(function () { setReviewError('Сървърна грешка.'); });
      setReviewPosting(false);
    };

    // ── Derived data ──
    var step1 = state.step1 || {};
    var step2 = state.step2 || { documents: [] };
    var step3 = state.step3 || { categories: {} };
    var referees = state.referees || [];

    // Document status map
    var docMap = useMemo(function () {
      var map = {};
      (step2.documents || []).forEach(function (doc) {
        map[doc.type] = doc;
      });
      return map;
    }, [step2.documents]);

    // Budget calculations
    var budgetTotal = useMemo(function () {
      var total = 0;
      Object.values(step3.categories || {}).forEach(function (cat) {
        if (cat.amount) total += parseFloat(cat.amount) || 0;
      });
      return total;
    }, [step3.categories]);

    var budgetCap = budgetRules.totalCapEUR || 0;

    // Validation
    var errors = validation.errors || [];
    var warnings = validation.warnings || [];

    // Document readiness
    var allDocs = (documentRequirements.required || []).concat(documentRequirements.optional || []);
    var requiredDocs = documentRequirements.required || [];
    var requiredDocsReady = requiredDocs.filter(function (req) {
      var d = docMap[req.id];
      return d && (d.status === 'uploaded' || d.status === 'approved' || d.driveFileId);
    }).length;
    var allDocsReady = allDocs.length > 0 && requiredDocsReady === requiredDocs.length;

    // Readiness score
    var readinessScore = useMemo(function () {
      var score = 0;
      // Step 1 completeness
      if (step1.title && step1.title.trim()) score += 10;
      if (step1.abstract && step1.abstract.trim().split(/\s+/).length >= 50) score += 15;
      if (step1.goals && step1.goals.trim()) score += 10;
      if (step1.keywords && step1.keywords.length >= 3) score += 5;
      if (step1.description_en && step1.description_en.trim().split(/\s+/).length >= 100) score += 10;
      if (step1.priority_area) score += 10;
      if (step1.professional_field) score += 10;
      if (step1.acronym && step1.acronym.trim()) score += 5;
      if (step1.duration_months) score += 5;
      if (step1.team_members && step1.team_members.length >= 1) score += 10;

      // Documents
      if (allDocsReady) score += 20;
      else if (requiredDocsReady > 0) score += 10;

      // Budget
      if (budgetTotal > 0 && budgetTotal <= budgetCap) score += 10;
      else if (budgetTotal > budgetCap) score += 0;

      // Referees
      if (referees && referees.length >= 2) score += 5;
      else if (referees && referees.length >= 1) score += 2;

      return Math.min(100, score);
    }, [step1, step2, step3, referees, allDocsReady, requiredDocsReady, budgetTotal, budgetCap]);

    // Can submit
    var canSubmit = errors.length === 0 && allDocsReady && budgetTotal > 0 && budgetTotal <= budgetCap && referees.length >= 2;

    // ── Render helpers ──
    function renderSection(title, children) {
      return e('div', { className: 'pw-review-section' },
        e('h3', { className: 'pw-review-section-title' }, title),
        e('div', { className: 'pw-review-section-body' }, children)
      );
    }

    function renderInfoRow(label, value) {
      if (!value && value !== 0) return null;
      return e('div', { className: 'pw-review-row' },
        e('span', { className: 'pw-review-label' }, label),
        e('span', { className: 'pw-review-value' }, value)
      );
    }

    function renderDocItem(docReq) {
      var doc = docMap[docReq.id];
      var isReady = doc && (doc.status === 'uploaded' || doc.status === 'approved' || doc.driveFileId);
      return e('div', { key: docReq.id, className: 'pw-review-doc-item' + (isReady ? ' pw-ready' : ' pw-missing') },
        e('span', { className: 'pw-review-doc-status' }, isReady ? '✓' : '✗'),
        e('span', { className: 'pw-review-doc-label' }, docReq.label + (docReq.required ? ' (задължителен)' : '')),
        doc ? e('span', { className: 'pw-review-doc-detail' }, doc.status === 'approved' ? 'Одобрен' : doc.status === 'uploaded' ? 'Качен' : 'Качен') : null
      );
    }

    function renderBudgetCategory(catKey, catData) {
      var rule = budgetRules.categories?.find(function (r) { return r.key === catKey; });
      var cap = rule ? (budgetCap * (rule.capPercent || 0) / 100) : 0;
      var isOver = catData.amount > cap && cap > 0;
      var globalName = global.CATEGORY_NAMES?.[catKey] || catKey;
      return e('div', { key: catKey, className: 'pw-review-budget-row' + (isOver ? ' pw-over-cap' : '') },
        e('span', { className: 'pw-review-budget-label' }, globalName),
        e('span', { className: 'pw-review-budget-amount' },
          (catData.amount || 0).toLocaleString('bg-BG', { minimumFractionDigits: 2 }) + ' €',
          cap > 0 ? ' / ' + cap.toLocaleString('bg-BG', { minimumFractionDigits: 2 }) + ' €' : ''
        ),
        isOver ? e('span', { className: 'pw-review-budget-warning' }, '⚠ Над капа') : null
      );
    }

    function renderReferee(ref) {
      return e('div', { key: ref.id || ref.email, className: 'pw-review-referee' },
        e('div', { className: 'pw-review-referee-name' }, ref.academic_title ? ref.academic_title + ' ' + ref.name : ref.name),
        e('div', { className: 'pw-review-referee-org' }, ref.organization),
        e('div', { className: 'pw-review-referee-contact' },
          ref.email && e('a', { href: 'mailto:' + ref.email }, ref.email),
          ref.phone && e('span', { style: { marginLeft: 12 } }, ref.phone)
        )
      );
    }

    // ── Readiness indicator color ──
    function getReadinessColor(score) {
      if (score <= 40) return 'var(--pw-error-500)';
      if (score <= 60) return 'var(--pw-warning-500)';
      if (score <= 75) return '#f59e0b';
      if (score <= 90) return 'var(--pw-success-500)';
      return '#059669';
    }

    var readinessColor = getReadinessColor(readinessScore);

    // ── Readiness message ──
    var readinessMessage = useMemo(function () {
      if (readinessScore >= 90) return { text: 'Отлична готовност! Вашето предложение е пълно и добре структурирано.', type: 'success' };
      if (readinessScore >= 75) return { text: 'Добра готовност. Прегледайте предупрежденията преди изпращане.', type: 'warning' };
      if (readinessScore >= 50) return { text: 'Средна готовност. Имате непопълнени задължителни полета или документи.', type: 'warning' };
      return { text: 'Ниска готовност. Моля попълнете всички задължителни полета и качете необходимите документи.', type: 'error' };
    }, [readinessScore]);

    // ── Render ──
    return e('div', { className: 'pw-step4-review' },

      // Readiness banner
      e('div', { className: 'pw-readiness-banner', style: { borderLeftColor: readinessColor } },
        e('div', { className: 'pw-readiness-score', style: { color: readinessColor } }, readinessScore + '/100'),
        e('div', { className: 'pw-readiness-info' },
          e('div', { className: 'pw-readiness-label' }, 'Готовност за изпращане'),
          e('div', { className: 'pw-readiness-message pw-readiness-' + readinessMessage.type }, readinessMessage.text)
        ),
        e('div', { className: 'pw-readiness-circle', style: { borderColor: readinessColor } },
          e('svg', { viewBox: '0 0 60 60', width: 60, height: 60 },
            e('circle', {
              cx: 30, cy: 30, r: 26,
              fill: 'none', stroke: 'var(--pw-neutral-200)', strokeWidth: 6
            }),
            e('circle', {
              cx: 30, cy: 30, r: 26,
              fill: 'none', stroke: readinessColor, strokeWidth: 6,
              strokeLinecap: 'round',
              strokeDasharray: (readinessScore / 100 * 2 * Math.PI * 26).toFixed(1) + ' ' + (2 * Math.PI * 26).toFixed(1),
              style: { transform: 'rotate(-90deg)', transformOrigin: '30px 30px' }
            })
          )
        )
      ),

      // Errors panel
      errors.length > 0 && e('div', { className: 'pw-validation-panel pw-errors' },
        e('h4', { className: 'pw-validation-title' }, 'Грешки (блокират изпращането)'),
        e('ul', { className: 'pw-validation-list' },
          errors.map(function (err, i) { return e('li', { key: i }, err); })
        )
      ),

      // Warnings panel
      warnings.length > 0 && e('div', { className: 'pw-validation-panel pw-warnings' },
        e('h4', { className: 'pw-validation-title' }, 'Предупреждения'),
        e('ul', { className: 'pw-validation-list' },
          warnings.map(function (warn, i) { return e('li', { key: i }, warn); })
        )
      ),

      // Step 1 Summary
      renderSection('Стъпка 1: Основна информация', e('div', { className: 'pw-review-grid' },
        renderInfoRow('Тип проект', PROJECT_TYPE_LABELS[projectType] || projectType),
        renderInfoRow('Заглавие (BG)', step1.title),
        renderInfoRow('Заглавие (EN)', step1.title_en),
        renderInfoRow('Акроним', step1.acronym),
        renderInfoRow('Приоритетна област', step1.priority_area),
        renderInfoRow('Професионално направление', step1.professional_field),
        renderInfoRow('Срок на изпълнение', step1.duration_months ? step1.duration_months + ' месеца' : null),
        renderInfoRow('Ключови думи', step1.keywords?.join(', ')),
        renderInfoRow('Ръководител', step1.leader_name),
        renderInfoRow('Имейл ръководител', step1.leader_email),
        renderInfoRow('Учреждение', step1.institution),
        renderInfoRow('Отдел/Катедра', step1.department),
        renderInfoRow('Резюме (BG)', step1.abstract?.substring(0, 200) + (step1.abstract?.length > 200 ? '...' : '')),
        renderInfoRow('Цели', step1.goals?.substring(0, 200) + (step1.goals?.length > 200 ? '...' : '')),
        renderInfoRow('Описание (EN)', step1.description_en?.substring(0, 200) + (step1.description_en?.length > 200 ? '...' : '')),
        renderInfoRow('Членове на екипа', step1.team_members ? step1.team_members.length : 0)
      )),

      // Step 2 Documents
      renderSection('Стъпка 2: Документи', e('div', { className: 'pw-review-doc-list' },
        (documentRequirements.required || []).map(function (req) { return renderDocItem(Object.assign({}, req, { required: true })); }),
        (documentRequirements.optional || []).map(function (req) { return renderDocItem(Object.assign({}, req, { required: false })); })
      )),

      // Step 3 Budget
      renderSection('Стъпка 3: Бюджет', e('div', { className: 'pw-review-budget' },
        e('div', { className: 'pw-review-budget-summary' },
          e('div', { className: 'pw-review-budget-total' },
            e('span', { className: 'pw-review-budget-total-label' }, 'Общ бюджет:'),
            e('span', { className: 'pw-review-budget-total-value' + (budgetTotal > budgetCap ? ' pw-over' : '') },
              budgetTotal.toLocaleString('bg-BG', { minimumFractionDigits: 2 }) + ' €'
            )
          ),
          e('div', { className: 'pw-review-budget-cap' },
            'Кап за ' + projectType + ': ' + budgetCap.toLocaleString('bg-BG') + ' €'
          ),
          budgetTotal > budgetCap && e('div', { className: 'pw-review-budget-error' },
            '⚠ Бюджетът надхвърля допустимия кап с ' + (budgetTotal - budgetCap).toLocaleString('bg-BG', { minimumFractionDigits: 2 }) + ' €'
          )
        ),
        e('div', { className: 'pw-review-budget-breakdown' },
          Object.entries(step3.categories || {}).map(function (_ref) {
            var catKey = _ref[0];
            var catData = _ref[1];
            return renderBudgetCategory(catKey, catData);
          })
        )
      )),

      // Referees
      referees.length > 0 && renderSection('Рецензенти', e('div', { className: 'pw-review-referees' },
        referees.map(renderReferee)
      )),

      // T4: Review comments history panel
      e('div', { className: 'pw-review-comments' },
        reviewCommentsOpen
          ? e('div', { className: 'pw-review-comments-panel', style: { marginTop: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-2)', padding: '.85rem' } },
              e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.5rem' } },
                e('i', { className: 'fas fa-comments', style: { color: 'var(--ink-3)' } }),
                e('strong', { style: { fontSize: '.78rem' } }, 'Коментари'),
                e('button', { className: 'btn btn-ghost btn-sm', style: { marginLeft: 'auto', lineHeight: 1 }, onClick: function () { setReviewCommentsOpen(false); } }, '×')
              ),
              reviewLoading && e('p', { style: { fontSize: '.74rem', color: 'var(--ink-4)' } }, 'Зареждане…'),
              reviewError && e('div', { style: { fontSize: '.72rem', color: 'var(--err)', marginBottom: '.4rem' } }, e('i', { className: 'fas fa-exclamation-triangle' }), ' ', reviewError),
              !reviewLoading && reviewComments.length === 0 && !reviewError && e('p', { style: { fontSize: '.74rem', color: 'var(--ink-4)', margin: 0 } }, 'Все още няма коментари.'),
              reviewComments.map(function (c, i) {
                return e('div', { key: c.id || i, style: { padding: '.4rem 0', borderBottom: '1px solid var(--border)', fontSize: '.76rem' } },
                  e('div', { style: { display: 'flex', gap: '.4rem', alignItems: 'baseline' } },
                    e('span', { style: { fontWeight: 600 } }, c.author_name || 'Анонимен'),
                    e('span', { style: { color: 'var(--ink-4)', fontSize: '.68rem', marginLeft: 'auto' } }, c.created_at || '')
                  ),
                  e('div', { style: { marginTop: '.15rem', lineHeight: 1.45 } }, c.text || '')
                );
              }),
              e('div', { style: { display: 'flex', gap: '.5rem', marginTop: '.6rem' } },
                e('textarea', { className: 'form-input', value: reviewDraft, placeholder: 'Добавете коментар…', rows: 2, style: { flex: 1, fontSize: '.76rem', resize: 'vertical' }, onChange: function (ev) { setReviewDraft(ev.target.value); }, onKeyDown: function (ev) { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); _submitReviewComment(); } } }),
                e('button', { className: 'btn btn-primary btn-sm', disabled: !(reviewDraft || '').trim() || reviewPosting, onClick: _submitReviewComment, style: { alignSelf: 'flex-end' } }, e('i', { className: reviewPosting ? 'fas fa-spinner fa-spin' : 'fas fa-paper-plane' }), ' Изпрати')
              )
            )
          : e('button', { className: 'btn btn-outline', style: { marginTop: '1rem' }, onClick: function () { setReviewCommentsOpen(true); if (!reviewComments.length) _loadReviewComments(); } }, e('i', { className: 'fas fa-comments' }), ' Коментари')
      ),

      // Action buttons
      e('div', { className: 'pw-review-actions' },
        e('button', {
          className: 'pw-btn pw-btn-secondary',
          onClick: onSaveDraft,
          disabled: isSavingDraft || isSubmitting
        }, isSavingDraft ? 'Запазване...' : 'Запази чернова'),
        e('button', {
          className: 'pw-btn pw-btn-primary' + (canSubmit ? '' : ' pw-disabled'),
          onClick: onSubmit,
          disabled: !canSubmit || isSubmitting || isSavingDraft
        }, isSubmitting ? 'Изпращане...' : 'Изпрати предложение')
      )
    );
  }

  global.__pwStep4Review = React.memo(Step4Review);

})(window);