/* WizardAdminDashboard.js — Admin Dashboard for Proposal Wizard submissions */
(function (global) {
  'use strict';
  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;
  var useMemo = React.useMemo;

  var STATUS_OPTIONS = [
    { value: '', label: 'Всички' },
    { value: 'draft', label: 'Чернова' },
    { value: 'submitted', label: 'Изпратена' },
    { value: 'approved', label: 'Одобрена' },
    { value: 'rejected', label: 'Отхвърлена' },
    { value: 'in_review', label: 'На разглеждане' }
  ];
  var PROJECT_TYPE_OPTIONS = [
    { value: '', label: 'Всички' },
    { value: 'ФНИ', label: 'ФНИ' },
    { value: 'ПНИ', label: 'ПНИ' },
    { value: 'ДНП', label: 'ДНП' },
    { value: 'НПФ', label: 'НПФ' }
  ];
  var PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

  function _formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('bg-BG', { year: 'numeric', month: '2-digit', day: '2-digit' }) +
        ' ' + d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' });
    } catch (err) { return dateStr; }
  }

  function _formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '—';
    try {
      return Number(amount).toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    } catch (err) { return String(amount); }
  }

  function _getStatusBadge(status) {
    var map = {
      draft: { label: 'Чернова', cls: 'pw-admin-badge pw-admin-badge-draft' },
      submitted: { label: 'Изпратена', cls: 'pw-admin-badge pw-admin-badge-submitted' },
      approved: { label: 'Одобрена', cls: 'pw-admin-badge pw-admin-badge-approved' },
      rejected: { label: 'Отхвърлена', cls: 'pw-admin-badge pw-admin-badge-rejected' },
      in_review: { label: 'На разглеждане', cls: 'pw-admin-badge pw-admin-badge-review' }
    };
    var info = map[status] || { label: status || '—', cls: 'pw-admin-badge' };
    return e('span', { className: info.cls }, info.label);
  }

  function _escapeCSV(val) {
    if (val === null || val === undefined) return '';
    var s = String(val);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function _downloadCSV(filename, csvContent) {
    var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  }

  function StatisticsCards(props) {
    var stats = props.stats || {};
    var cards = [
      { label: 'Общо заявки', value: stats.total || 0, cls: 'pw-admin-stat-card pw-admin-stat-total' },
      { label: 'Чернови', value: (stats.byStatus && stats.byStatus.draft) || 0, cls: 'pw-admin-stat-card pw-admin-stat-draft' },
      { label: 'Изпратени', value: (stats.byStatus && stats.byStatus.submitted) || 0, cls: 'pw-admin-stat-card pw-admin-stat-submitted' },
      { label: 'Одобрени', value: (stats.byStatus && stats.byStatus.approved) || 0, cls: 'pw-admin-stat-card pw-admin-stat-approved' },
      { label: 'Отхвърлени', value: (stats.byStatus && stats.byStatus.rejected) || 0, cls: 'pw-admin-stat-card pw-admin-stat-rejected' }
    ];
    return e('div', { className: 'pw-admin-stats-row' },
      cards.map(function (c, i) {
        return e('div', { key: i, className: c.cls },
          e('div', { className: 'pw-admin-stat-label' }, c.label),
          e('div', { className: 'pw-admin-stat-value' }, c.value));
      }));
  }

  function ProjectTypeStats(props) {
    var stats = props.stats || {};
    var byType = stats.byProjectType || {};
    var types = Object.keys(byType);
    if (types.length === 0) return null;
    return e('div', { className: 'pw-admin-type-stats' },
      e('h4', { className: 'pw-admin-type-stats-title' }, 'По тип проект'),
      e('div', { className: 'pw-admin-type-stats-row' },
        types.map(function (t, i) {
          return e('div', { key: i, className: 'pw-admin-type-stat-item' },
            e('span', { className: 'pw-admin-type-stat-code' }, t),
            e('span', { className: 'pw-admin-type-stat-count' }, byType[t] || 0));
        })));
  }

  function FilterBar(props) {
    var f = props.filters;
    return e('div', { className: 'pw-admin-filter-bar' },
      e('div', { className: 'pw-admin-filter-group' },
        e('label', { className: 'pw-admin-filter-label' }, 'Статус:'),
        e('select', {
          className: 'pw-admin-filter-select',
          value: f.status || '',
          onChange: function (ev) { props.onFilterChange('status', ev.target.value); }
        }, STATUS_OPTIONS.map(function (o, i) { return e('option', { key: i, value: o.value }, o.label); }))),
      e('div', { className: 'pw-admin-filter-group' },
        e('label', { className: 'pw-admin-filter-label' }, 'Тип проект:'),
        e('select', {
          className: 'pw-admin-filter-select',
          value: f.projectType || '',
          onChange: function (ev) { props.onFilterChange('projectType', ev.target.value); }
        }, PROJECT_TYPE_OPTIONS.map(function (o, i) { return e('option', { key: i, value: o.value }, o.label); }))),
      e('div', { className: 'pw-admin-filter-group' },
        e('label', { className: 'pw-admin-filter-label' }, 'От:'),
        e('input', {
          className: 'pw-admin-filter-input', type: 'date',
          value: f.dateFrom || '',
          onChange: function (ev) { props.onFilterChange('dateFrom', ev.target.value); }
        })),
      e('div', { className: 'pw-admin-filter-group' },
        e('label', { className: 'pw-admin-filter-label' }, 'До:'),
        e('input', {
          className: 'pw-admin-filter-input', type: 'date',
          value: f.dateTo || '',
          onChange: function (ev) { props.onFilterChange('dateTo', ev.target.value); }
        })),
      e('div', { className: 'pw-admin-filter-actions' },
        e('button', { className: 'pw-admin-btn pw-admin-btn-primary', onClick: props.onApplyFilters }, 'Приложи'),
        e('button', { className: 'pw-admin-btn pw-admin-btn-secondary', onClick: props.onResetFilters }, 'Изчисти'),
        e('button', { className: 'pw-admin-btn pw-admin-btn-export', onClick: props.onExport, disabled: props.exporting },
          props.exporting ? 'Експортиране...' : 'Експорт CSV')));
  }

  function SubmissionsTable(props) {
    var subs = props.submissions;
    var loading = props.loading;
    var currentPage = props.currentPage;
    var pageSize = props.pageSize;
    var totalCount = props.totalCount;
    var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    var startIdx = (currentPage - 1) * pageSize + 1;
    var endIdx = Math.min(currentPage * pageSize, totalCount);

    function _renderPagination() {
      var pages = [];
      var maxV = 5;
      var sP = Math.max(1, currentPage - Math.floor(maxV / 2));
      var eP = Math.min(totalPages, sP + maxV - 1);
      if (eP - sP + 1 < maxV) sP = Math.max(1, eP - maxV + 1);
      for (var p = sP; p <= eP; p++) pages.push(p);
      return e('div', { className: 'pw-admin-pagination' },
        e('div', { className: 'pw-admin-pagination-info' }, 'Показани ' + startIdx + '–' + endIdx + ' от ' + totalCount),
        e('div', { className: 'pw-admin-pagination-controls' },
          e('button', { className: 'pw-admin-page-btn', disabled: currentPage <= 1, onClick: function () { props.onPageChange(1); } }, '«'),
          e('button', { className: 'pw-admin-page-btn', disabled: currentPage <= 1, onClick: function () { props.onPageChange(currentPage - 1); } }, '‹'),
          pages.map(function (pg) {
            return e('button', { key: pg, className: 'pw-admin-page-btn' + (pg === currentPage ? ' pw-admin-page-active' : ''), onClick: function () { props.onPageChange(pg); } }, pg);
          }),
          e('button', { className: 'pw-admin-page-btn', disabled: currentPage >= totalPages, onClick: function () { props.onPageChange(currentPage + 1); } }, '›'),
          e('button', { className: 'pw-admin-page-btn', disabled: currentPage >= totalPages, onClick: function () { props.onPageChange(totalPages); } }, '»')),
        e('div', { className: 'pw-admin-pagination-size' },
          e('label', null, 'На страница: '),
          e('select', { value: pageSize, onChange: function (ev) { props.onPageSizeChange(parseInt(ev.target.value, 10) || 10); } },
            PAGE_SIZE_OPTIONS.map(function (s) { return e('option', { key: s, value: s }, s); }))));
    }

    if (loading) return e('div', { className: 'pw-admin-table-container' },
      e('div', { className: 'pw-admin-loading' },
        e('div', { className: 'pw-admin-spinner' }),
        e('span', null, 'Зареждане...')));

    if (!subs || subs.length === 0) return e('div', { className: 'pw-admin-table-container' },
      e('div', { className: 'pw-admin-empty-state' },
        e('div', { className: 'pw-admin-empty-icon' }, '📋'),
        e('p', { className: 'pw-admin-empty-text' }, 'Няма намерени заявки.'),
        e('p', { className: 'pw-admin-empty-hint' }, 'Опитайте да промените филтрите.')));

    return e('div', { className: 'pw-admin-table-container' },
      e('table', { className: 'pw-admin-table' },
        e('thead', null,
          e('tr', null,
            e('th', { className: 'pw-admin-th' }, 'ID'),
            e('th', { className: 'pw-admin-th' }, 'Потребител'),
            e('th', { className: 'pw-admin-th' }, 'Тип проект'),
            e('th', { className: 'pw-admin-th' }, 'Статус'),
            e('th', { className: 'pw-admin-th' }, 'Стъпка'),
            e('th', { className: 'pw-admin-th' }, 'Създадена'),
            e('th', { className: 'pw-admin-th' }, 'Документи'),
            e('th', { className: 'pw-admin-th pw-admin-th-numeric' }, 'Бюджет'))),
        e('tbody', null,
          subs.map(function (sub, idx) {
            var dCount = (sub.documents && sub.documents.length) || sub.document_count || 0;
            var dComplete = (sub.documents && sub.documents.filter(function (d) { return d.status === 'approved' || d.status === 'uploaded'; }).length) || sub.documents_complete || 0;
            return e('tr', { key: sub.id || idx, className: 'pw-admin-row', onClick: function () { props.onRowClick(sub); } },
              e('td', { className: 'pw-admin-td pw-admin-td-id' }, sub.id || '—'),
              e('td', { className: 'pw-admin-td' }, sub.user_email || sub.email || '—'),
              e('td', { className: 'pw-admin-td' }, sub.project_type || sub.projectType || '—'),
              e('td', { className: 'pw-admin-td' }, _getStatusBadge(sub.status)),
              e('td', { className: 'pw-admin-td' }, sub.current_step || sub.currentStep || '—'),
              e('td', { className: 'pw-admin-td' }, _formatDate(sub.created_at || sub.createdAt)),
              e('td', { className: 'pw-admin-td' }, dComplete + '/' + dCount),
              e('td', { className: 'pw-admin-td pw-admin-td-numeric' }, _formatCurrency(sub.budget_total || sub.budgetTotal)));
          }))),
      _renderPagination());
  }

  function DetailModal(props) {
    var submission = props.submission;
    var loading = props.loading;
    var onClose = props.onClose;

    useEffect(function () {
      function handleEsc(ev) { if (ev.key === 'Escape') onClose(); }
      document.addEventListener('keydown', handleEsc);
      return function () { document.removeEventListener('keydown', handleEsc); };
    }, [onClose]);

    if (!submission && !loading) return null;

    function _row(label, value) {
      return e('div', { className: 'pw-admin-dl-row' },
        e('dt', { className: 'pw-admin-dt' }, label),
        e('dd', { className: 'pw-admin-dd' }, value != null && value !== '' ? String(value) : '—'));
    }

    function _renderStep1(step1) {
      if (!step1) return e('p', { className: 'pw-admin-empty-text' }, 'Няма данни от стъпка 1.');
      return e('div', { className: 'pw-admin-section' },
        e('h4', { className: 'pw-admin-section-title' }, 'Стъпка 1: Основна информация'),
        e('dl', { className: 'pw-admin-dl' },
          _row('Заглавие', step1.project_title),
          _row('Тип проект', step1.project_type),
          _row('Година на конкурс', step1.competition_year),
          _row('Сесия', step1.competition_session_id),
          _row('Катедра', step1.department),
          _row('Ключови думи', step1.keywords),
          _row('Резюме (БГ)', step1.summary_bg),
          _row('Резюме (EN)', step1.summary_en),
          _row('Име кандидат', step1.user_name || step1.applicant_name)));
    }

    function _renderDocs(docs) {
      if (!docs || docs.length === 0) return e('p', { className: 'pw-admin-empty-text' }, 'Няма качени документи.');
      return e('div', { className: 'pw-admin-section' },
        e('h4', { className: 'pw-admin-section-title' }, 'Документи (' + docs.length + ')'),
        e('ul', { className: 'pw-admin-doc-list' },
          docs.map(function (doc, i) {
            var stCls = doc.status === 'approved' ? 'pw-admin-doc-approved' :
              doc.status === 'rejected' ? 'pw-admin-doc-rejected' :
              doc.status === 'uploaded' ? 'pw-admin-doc-uploaded' : 'pw-admin-doc-pending';
            return e('li', { key: i, className: 'pw-admin-doc-item' },
              e('span', { className: 'pw-admin-doc-name' }, doc.name || doc.filename || ('Документ ' + (i + 1))),
              e('span', { className: 'pw-admin-doc-status ' + stCls }, doc.status || '—'));
          })));
    }

    function _renderBudget(budget) {
      if (!budget) return e('p', { className: 'pw-admin-empty-text' }, 'Няма бюджетни данни.');
      var lines = [];
      var i = 0;
      for (var k in budget) {
        if (Object.prototype.hasOwnProperty.call(budget, k)) {
          lines.push(e('div', { key: i++, className: 'pw-admin-budget-row' },
            e('span', { className: 'pw-admin-budget-label' }, k),
            e('span', { className: 'pw-admin-budget-value' }, _formatCurrency(budget[k]))));
        }
      }
      return e('div', { className: 'pw-admin-section' },
        e('h4', { className: 'pw-admin-section-title' }, 'Бюджет'),
        lines);
    }

    function _renderReferees(refs) {
      if (!refs || refs.length === 0) return e('p', { className: 'pw-admin-empty-text' }, 'Няма рефери.');
      return e('div', { className: 'pw-admin-section' },
        e('h4', { className: 'pw-admin-section-title' }, 'Рефери (' + refs.length + ')'),
        e('ul', { className: 'pw-admin-ref-list' },
          refs.map(function (r, i) {
            return e('li', { key: i, className: 'pw-admin-ref-item' },
              e('span', { className: 'pw-admin-ref-name' }, r.name || '—'),
              e('span', { className: 'pw-admin-ref-affiliation' }, r.affiliation || r.institution || ''),
              e('span', { className: 'pw-admin-ref-email' }, r.email || '—'));
          })));
    }

    return e('div', { className: 'pw-admin-modal-overlay', onClick: onClose },
      e('div', { className: 'pw-admin-modal', onClick: function (ev) { ev.stopPropagation(); } },
        e('div', { className: 'pw-admin-modal-header' },
          e('h3', { className: 'pw-admin-modal-title' },
            'Заявка #' + (submission ? (submission.id || submission.submission_id) : '...')),
          e('button', { className: 'pw-admin-modal-close', onClick: onClose, ariaLabel: 'Затвори' }, '×')),
        e('div', { className: 'pw-admin-modal-body' },
          loading ? e('div', { className: 'pw-admin-loading' },
            e('div', { className: 'pw-admin-spinner' }),
            e('span', null, 'Зареждане...')) :
          e('div', { className: 'pw-admin-detail-content' },
            _renderStep1(submission.step1),
            _renderDocs(submission.documents),
            _renderBudget(submission.budget || submission.budget_breakdown),
            _renderReferees(submission.referees || submission.external_reviewers)))));
  }

  /* ── Main Component ── */
  function WizardAdminDashboard(props) {
    props = props || {};
    var api = global.__pwAdminApi;

    var _submissionsCtx = useState([]);
    var submissions = _submissionsCtx[0];
    var setSubmissions = _submissionsCtx[1];

    var _statsCtx = useState({});
    var stats = _statsCtx[0];
    var setStats = _statsCtx[1];

    var _loadingCtx = useState(false);
    var loading = _loadingCtx[0];
    var setLoading = _loadingCtx[1];

    var _detailLoadingCtx = useState(false);
    var detailLoading = _detailLoadingCtx[0];
    var setDetailLoading = _detailLoadingCtx[1];

    var _errorCtx = useState(null);
    var error = _errorCtx[0];
    var setError = _errorCtx[1];

    var _selectedCtx = useState(null);
    var selectedSubmission = _selectedCtx[0];
    var setSelectedSubmission = _selectedCtx[1];

    var _filtersCtx = useState({
      status: '',
      projectType: '',
      dateFrom: '',
      dateTo: ''
    });
    var filters = _filtersCtx[0];
    var setFilters = _filtersCtx[1];

    var _pendingFiltersCtx = useState({
      status: '',
      projectType: '',
      dateFrom: '',
      dateTo: ''
    });
    var pendingFilters = _pendingFiltersCtx[0];
    var setPendingFilters = _pendingFiltersCtx[1];

    var _pageCtx = useState(1);
    var currentPage = _pageCtx[0];
    var setCurrentPage = _pageCtx[1];

    var _pageSizeCtx = useState(10);
    var pageSize = _pageSizeCtx[0];
    var setPageSize = _pageSizeCtx[1];

    var _totalCountCtx = useState(0);
    var totalCount = _totalCountCtx[0];
    var setTotalCount = _totalCountCtx[1];

    var _exportingCtx = useState(false);
    var exporting = _exportingCtx[0];
    var setExporting = _exportingCtx[1];

    /* ── Fetch submissions ── */
    var fetchSubmissions = useCallback(function () {
      if (!api) {
        setError('__pwAdminApi is not available');
        return;
      }
      setLoading(true);
      setError(null);
      var params = {};
      if (filters.status) params.status = filters.status;
      if (filters.projectType) params.projectType = filters.projectType;
      if (filters.dateFrom || filters.dateTo) {
        params.dateRange = { from: filters.dateFrom || '', to: filters.dateTo || '' };
      }
      params.page = currentPage;
      params.pageSize = pageSize;

      api.getWizardSubmissions(params).then(function (result) {
        if (Array.isArray(result)) {
          setSubmissions(result);
          setTotalCount(result.length);
        } else if (result && result.data) {
          setSubmissions(result.data);
          setTotalCount(result.total || result.data.length);
        } else {
          setSubmissions([]);
          setTotalCount(0);
        }
        setLoading(false);
      }).catch(function (err) {
        setError(err && err.message || 'Грешка при зареждане на заявки.');
        setLoading(false);
        setSubmissions([]);
        setTotalCount(0);
      });
    }, [api, filters, currentPage, pageSize]);

    /* ── Fetch stats ── */
    var fetchStats = useCallback(function () {
      if (!api) return;
      api.getWizardStats().then(function (result) {
        if (result && result.success && result.data) {
          setStats(result.data);
        } else if (result && typeof result === 'object') {
          setStats(result);
        }
      }).catch(function (err) {
        console.warn('[WizardAdminDashboard] Stats load failed:', err);
      });
    }, [api]);

    useEffect(function () {
      fetchStats();
    }, [fetchStats]);

    useEffect(function () {
      fetchSubmissions();
    }, [fetchSubmissions]);

    /* ── Handlers ── */
    var handleFilterChange = useCallback(function (key, value) {
      setPendingFilters(function (prev) {
        var next = Object.assign({}, prev);
        next[key] = value;
        return next;
      });
    }, []);

    var handleApplyFilters = useCallback(function () {
      setFilters(function () { return Object.assign({}, pendingFilters); });
      setCurrentPage(1);
    }, [pendingFilters]);

    var handleResetFilters = useCallback(function () {
      var empty = { status: '', projectType: '', dateFrom: '', dateTo: '' };
      setPendingFilters(empty);
      setFilters(empty);
      setCurrentPage(1);
    }, []);

    var handlePageChange = useCallback(function (page) {
      setCurrentPage(page);
    }, []);

    var handlePageSizeChange = useCallback(function (size) {
      setPageSize(size);
      setCurrentPage(1);
    }, []);

    var handleRowClick = useCallback(function (sub) {
      setSelectedSubmission(sub);
      setDetailLoading(true);
      if (!api) {
        setDetailLoading(false);
        return;
      }
      var id = sub.id || sub.submission_id;
      api.getWizardSubmission(id).then(function (result) {
        if (result && result.success && result.data) {
          setSelectedSubmission(result.data);
        }
        setDetailLoading(false);
      }).catch(function (err) {
        console.warn('[WizardAdminDashboard] Detail load failed:', err);
        setDetailLoading(false);
      });
    }, [api]);

    var handleCloseModal = useCallback(function () {
      setSelectedSubmission(null);
      setDetailLoading(false);
    }, []);

    var handleExport = useCallback(function () {
      if (!api) return;
      setExporting(true);
      var params = {};
      if (filters.status) params.status = filters.status;
      if (filters.projectType) params.projectType = filters.projectType;
      if (filters.dateFrom || filters.dateTo) {
        params.dateRange = { from: filters.dateFrom || '', to: filters.dateTo || '' };
      }

      api.exportWizardSubmissionsCSV(params).then(function (blob) {
        if (blob instanceof Blob) {
          var url = URL.createObjectURL(blob);
          var link = document.createElement('a');
          link.href = url;
          link.download = 'wizard_submissions_' + new Date().toISOString().slice(0, 10) + '.csv';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(function () { URL.revokeObjectURL(url); }, 100);
        } else {
          var csvStr = 'ID,UserEmail,ProjectType,Status,CurrentStep,CreatedAt,Documents,BudgetTotal\n';
          submissions.forEach(function (s) {
            csvStr += [
              _escapeCSV(s.id),
              _escapeCSV(s.user_email || s.email),
              _escapeCSV(s.project_type || s.projectType),
              _escapeCSV(s.status),
              _escapeCSV(s.current_step || s.currentStep),
              _escapeCSV(s.created_at || s.createdAt),
              _escapeCSV(s.document_count || 0),
              _escapeCSV(s.budget_total || s.budgetTotal)
            ].join(',') + '\n';
          });
          _downloadCSV('wizard_submissions_' + new Date().toISOString().slice(0, 10) + '.csv', csvStr);
        }
        setExporting(false);
      }).catch(function (err) {
        console.warn('[WizardAdminDashboard] Export failed, falling back to local:', err);
        var csvStr2 = 'ID,UserEmail,ProjectType,Status,CurrentStep,CreatedAt,Documents,BudgetTotal\n';
        submissions.forEach(function (s) {
          csvStr2 += [
            _escapeCSV(s.id),
            _escapeCSV(s.user_email || s.email),
            _escapeCSV(s.project_type || s.projectType),
            _escapeCSV(s.status),
            _escapeCSV(s.current_step || s.currentStep),
            _escapeCSV(s.created_at || s.createdAt),
            _escapeCSV(s.document_count || 0),
            _escapeCSV(s.budget_total || s.budgetTotal)
          ].join(',') + '\n';
        });
        _downloadCSV('wizard_submissions_' + new Date().toISOString().slice(0, 10) + '.csv', csvStr2);
        setExporting(false);
      });
    }, [api, filters, submissions]);

    /* ── Render ── */
    return e('div', { className: 'pw-admin-dashboard' },
      e('div', { className: 'pw-admin-header' },
        e('h2', { className: 'pw-admin-title' }, 'Административен панел — Заявки за проекти'),
        e('p', { className: 'pw-admin-subtitle' }, 'Преглед и управление на заявки от Proposal Wizard')),
      e('div', { className: 'pw-admin-stats-section' },
        e(StatisticsCards, { stats: stats }),
        e(ProjectTypeStats, { stats: stats })),
      error ? e('div', { className: 'pw-admin-error' }, error) : null,
      e(FilterBar, {
        filters: pendingFilters,
        onFilterChange: handleFilterChange,
        onApplyFilters: handleApplyFilters,
        onResetFilters: handleResetFilters,
        onExport: handleExport,
        exporting: exporting
      }),
      e(SubmissionsTable, {
        submissions: submissions,
        loading: loading,
        onRowClick: handleRowClick,
        currentPage: currentPage,
        pageSize: pageSize,
        totalCount: totalCount,
        onPageChange: handlePageChange,
        onPageSizeChange: handlePageSizeChange
      }),
      e(DetailModal, {
        submission: selectedSubmission,
        loading: detailLoading,
        onClose: handleCloseModal
      })
    );
  }

  /* ── Expose globally ── */
  global.__pwWizardAdminDashboard = WizardAdminDashboard;

})(typeof window !== 'undefined' ? window : this);