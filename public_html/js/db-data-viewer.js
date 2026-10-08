/**
 * Database Data Viewer — Admin-only comprehensive data browser (v12.50)
 * Displays ALL database tables and their data in a tabbed interface.
 * Uses direct SQL queries with role=admin bypass for broken store procedures.
 */

(function () {
  'use strict';

  var API_BASE = window._PHP_API_URL || 'https://sr-ue-varna.com/database/api.php';

  // ── Tab definitions ──────────────────────────────────────────────
  var TABS = [
    { id: 'dashboard',    label: 'Dashboard',     icon: 'fa-chart-bar' },
    { id: 'applications', label: 'Предложения',   icon: 'fa-file-alt' },
    { id: 'projects',     label: 'Проекти',       icon: 'fa-folder-open' },
    { id: 'competitions', label: 'Конкурси',      icon: 'fa-trophy' },
    { id: 'reviewers',    label: 'Рецензенти',    icon: 'fa-user-tie' },
    { id: 'documents',    label: 'Документи',     icon: 'fa-file-pdf' },
    { id: 'users',        label: 'Потребители',   icon: 'fa-users' },
    { id: 'audit',        label: 'Аудит-лог',     icon: 'fa-clipboard-list' },
    { id: 'config',       label: 'Конфиг',        icon: 'fa-cog' },
    { id: 'raw',          label: 'RAW SQL',       icon: 'fa-terminal' },
  ];

  // ── State ────────────────────────────────────────────────────────
  var state = {
    activeTab: 'dashboard',
    loading: true,
    data: {},
    error: null,
    dbStatus: null,
    refreshKey: 0,
  };

  // ── Helpers ──────────────────────────────────────────────────────
  function notify(msg, type) {
    try {
      if (window.toast) return window.toast(msg, type || 'info', 3000);
    } catch (e) {}
  }

  function pluralize(count, singular) {
    if (count === 1) return singular;
    return singular + 's';
  }

  // ── Fetch helpers ────────────────────────────────────────────────
  function post(action, body) {
    state.loading = true;
    state.error = null;
    state.refreshKey++;
    return fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, body || {})),
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).catch(function (e) {
      state.error = e.message;
      state.loading = false;
      throw e;
    }).then(function (data) {
      state.loading = false;
      state.data[state.activeTab] = data;
      return data;
    });
  }

  function fetchDbStatus() {
    return post('ping').then(function (data) {
      state.dbStatus = data;
      return data;
    }).catch(function () {
      state.dbStatus = { db: { healthy: false } };
    });
  }

  // ── Direct SQL fallback for forms (bypasses broken stored procedures) ──
  function loadApplications() {
    // Use role=admin with lean=false to force full SQL path
    return post('getforms', { role: 'admin', limit: 200, lean: false })
      .then(function (data) { return data; })
      .catch(function () {
        // Ultimate fallback: direct POST with raw SQL via stored procedure bypass
        return post('sqlgetforms', { role: 'admin', limit: 200 });
      });
  }

  function loadProjects() {
    return post('getprojects', { role: 'admin', limit: 200 })
      .then(function (data) { return data; })
      .catch(function () {
        return post('sqlgetprojects', { role: 'admin', limit: 200 });
      });
  }

  function loadCompetitions() {
    return post('getcompetitions', { role: 'admin' })
      .then(function (data) { return data; });
  }

  function loadReviewers() {
    return post('getreviewers')
      .then(function (data) { return data; });
  }

  function loadDocuments() {
    return post('getdocuments', { role: 'admin', limit: 200 })
      .then(function (data) { return data; })
      .catch(function () {
        return post('sqlgetdocuments', { role: 'admin', limit: 200 });
      });
  }

  function loadUsers() {
    // Get unique users from applications + reviewers
    return Promise.all([
      post('getforms', { role: 'admin', limit: 500, lean: false }),
      post('getreviewers'),
    ]).then(function (results) {
      var users = {};
      var forms = (results[0].forms && results[0].forms) ? results[0].forms : [];
      if (!forms || forms.length === 0) {
        // Try direct SQL fallback
        try {
          var resp = fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sqlgetforms', role: 'admin', limit: 500 })
          }).then(function (r) { return r.json(); }).catch(function () { return { forms: [] }; });
          forms = resp.forms || [];
          if (forms && forms.length > 0) {
            forms.forEach(function (f) {
              var email = f.userEmail || f.user_email || '';
              if (email && !users[email]) {
                users[email] = { email: email, name: f.userName || f.user_name || '', role: 'applicant', formCount: 0, lastForm: f };
              }
              if (users[email]) users[email].formCount++;
            });
          }
        } catch (e) {}
      } else {
        forms.forEach(function (f) {
          var email = f.userEmail || f.user_email || '';
          if (email && !users[email]) {
            users[email] = { email: email, name: f.userName || f.user_name || '', role: 'applicant', formCount: 0, lastForm: f };
          }
          if (users[email]) users[email].formCount++;
        });
      }
      var reviewers = (results[1].reviewers || []);
      reviewers.forEach(function (r) {
        var email = r.email || r.reviewer_email || '';
        if (email && !users[email]) {
          users[email] = { email: email, name: r.name || r.reviewer_name || '', role: 'reviewer', formCount: 0, lastForm: null };
        }
        if (users[email]) users[email].role = 'reviewer';
      });
      return { users: Object.values(users), total: Object.keys(users).length };
    });
  }

  function loadAuditLog() {
    return post('getauditlog', { limit: 200 })
      .then(function (data) { return data; })
      .catch(function () {
        return post('sqlgetauditlog', { limit: 200 });
      });
  }

  function loadConfig() {
    return post('getinitialdata', { role: 'admin', lean: true })
      .then(function (data) {
        return {
          systemConfig: data.systemConfig || {},
          projectTypes: data.projectTypes || [],
          applicationStatuses: data.applicationStatuses || [],
          dataVersion: data.dataVersion || {},
        };
      });
  }

  function loadDashboard() {
    return Promise.all([
      post('getsystemhealth'),
      post('getinitialdata', { role: 'admin', lean: true }),
      post('getcompetitions', { role: 'admin' }),
      post('getforms', { role: 'admin', limit: 500, lean: false }),
      post('getprojects', { role: 'admin', limit: 200 }),
      post('getreviewers'),
      post('gettablestatus'),
    ]).then(function (results) {
      return {
        health: results[0],
        initial: results[1],
        competitions: results[2],
        forms: results[3],
        projects: results[4],
        reviewers: results[5],
        tables: results[6],
      };
    }).catch(function (e) {
      // Fallback: load what we can from individual endpoints
      return Promise.all([
        post('getsystemhealth'),
        post('gettablestatus'),
      ]).then(function (r) {
        return {
          health: r[0],
          tables: r[1],
          competitions: { competitions: [] },
          forms: { forms: [], total: 0 },
          projects: { projects: [], total: 0 },
          reviewers: { reviewers: [] },
        };
      });
    });
  }

  // ── Rendering ────────────────────────────────────────────────────
  function render() {
    var container = document.getElementById('db-data-viewer');
    if (!container) return;

    var dbStatus = state.dbStatus;
    var dbHealthy = dbStatus && dbStatus.db && dbStatus.db.healthy;

    container.innerHTML =
      '<div class="db-viewer">'
      + '<div class="db-viewer-header">'
      + '<h2>📊 База данни — преглед</h2>'
      + '<div class="db-status-badge">'
      + '<span class="db-status-indicator ' + (dbHealthy ? 'ok' : 'err') + '"></span>'
      + '<span>'
      + (dbStatus && dbStatus.db ? (dbHealthy ? 'Свързано с ' + dbStatus.db.host : 'Връзката е прекъсната') : 'Не е определно')
      + '</span>'
      + (dbStatus && dbStatus.db ? '<span class="db-name">(' + dbStatus.db.name + ')</span>' : '')
      + (dbStatus && dbStatus.db ? '<span class="db-latency">⏱ ' + dbStatus.db.latency_ms + 'ms</span>' : '')
      + '</div>'
      + '<div class="db-viewer-actions">'
      + '<button class="btn btn-primary btn-sm" onclick="DBDataViewer.refresh()">🔄 Обновить</button>'
      + '<button class="btn btn-outline btn-sm" onclick="DBDataViewer.exportJSON()">📥 JSON</button>'
      + '</div>'
      + '</div>'

      + '<div class="db-tabs">'
      + TABS.map(function (tab) {
        var isActive = tab.id === state.activeTab;
        var count = getTabCount(tab.id);
        return '<button class="db-tab ' + (isActive ? 'active' : '') + '" data-tab="' + tab.id + '" onclick="DBDataViewer.switchTab(\'' + tab.id + '\')">'
          + '<i class="fas ' + tab.icon + '"></i> ' + tab.label
          + (count > 0 ? ' <span class="db-tab-count">' + count + '</span>' : '')
          + '</button>';
      }).join('')
      + '</div>'

      + '<div class="db-viewer-content">'
      + (state.loading ? '<div class="db-loading"><i class="fas fa-spinner fa-spin"></i> Зареждане…</div>' : '')
      + (state.error ? '<div class="db-error"><i class="fas fa-exclamation-triangle"></i> ' + escapeHtml(state.error) + '</div>' : '')
      + renderActiveTab()
      + '</div>'

      + '<div class="db-raw-panel" id="db-raw-panel" style="display:none">'
      + '<div class="db-raw-header" onclick="DBDataViewer.toggleRaw()">'
      + '<i class="fas fa-terminal"></i> SQL Заявки'
      + '<i class="fas fa-chevron-down"></i>'
      + '</div>'
      + '<div class="db-raw-body">'
      + '<textarea id="db-raw-sql" class="db-raw-input" rows="4" placeholder="SELECT * FROM applications LIMIT 10">SELECT id, user_email, user_name, competition, project_type, title, status, created FROM applications ORDER BY created DESC LIMIT 10</textarea>'
      + '<button class="btn btn-primary btn-sm" onclick="DBDataViewer.runQuery()">▶ Изпълнить</button>'
      + '<button class="btn btn-outline btn-sm" onclick="DBDataViewer.clearQuery()">🗑 Изчисти</button>'
      + '<div id="db-raw-results"></div>'
      + '</div>'
      + '</div>'

      + '</div>';

    // Bind raw panel toggle
    var rawPanel = document.getElementById('db-raw-panel');
    if (rawPanel) {
      rawPanel.querySelector('.db-raw-header').addEventListener('click', function () {
        rawPanel.style.display = rawPanel.style.display === 'none' ? 'block' : 'none';
      });
    }
  }

  function getTabCount(tabId) {
    if (state.data.dashboard) {
      var d = state.data.dashboard;
      if (tabId === 'applications') return (d.forms && d.forms.total) ? d.forms.total : 0;
      if (tabId === 'projects') return (d.projects && d.projects.total) ? d.projects.total : 0;
      if (tabId === 'competitions') return (d.competitions && d.competitions.total) ? d.competitions.total : 0;
      if (tabId === 'reviewers') return (d.reviewers && d.reviewers.total) ? d.reviewers.total : 0;
    }
    if (tabId === 'applications' && state.data.applications) {
      return (state.data.applications.total) ? state.data.applications.total : (state.data.applications.forms ? state.data.applications.forms.length : 0);
    }
    if (tabId === 'projects' && state.data.projects) {
      return (state.data.projects.total) ? state.data.projects.total : (state.data.projects.projects ? state.data.projects.projects.length : 0);
    }
    if (tabId === 'documents' && state.data.documents) {
      return state.data.documents.total || state.data.documents.data ? state.data.documents.data.length : 0;
    }
    if (tabId === 'users' && state.data.users) {
      return state.data.users.total || state.data.users.users ? state.data.users.users.length : 0;
    }
    return 0;
  }

  function renderActiveTab() {
    var tab = state.activeTab;
    if (state.loading) return '';

    try {
      switch (tab) {
        case 'dashboard': return renderDashboard();
        case 'applications': return renderApplications();
        case 'projects': return renderProjects();
        case 'competitions': return renderCompetitions();
        case 'reviewers': return renderReviewers();
        case 'documents': return renderDocuments();
        case 'users': return renderUsers();
        case 'audit': return renderAudit();
        case 'config': return renderConfig();
        case 'raw': return '<div class="db-raw-hint">Използвайте долната SQL панел за директни заявки.</div>';
        default: return '<div class="db-empty">Неподдържан раздел.</div>';
      }
    } catch (e) {
      return '<div class="db-error"><i class="fas fa-bug"></i> Грешка при рендиране: ' + escapeHtml(e.message) + '</div>';
    }
  }

  // ── Dashboard ────────────────────────────────────────────────────
  function renderDashboard() {
    var d = state.data.dashboard;
    if (!d) return '<div class="db-empty">Няма данни.</div>';

    var h = d.health;
    var comps = d.competitions;
    var forms = d.forms;
    var projs = d.projects;
    var revs = d.reviewers;
    var tables = d.tables;

    var healthOk = h && h.success && h.db && h.db.healthy;
    var totalApps = h && h.total_applications ? h.total_applications : (forms && forms.total ? forms.total : 0);
    var totalComps = h && h.total_competitions ? h.total_competitions : (comps && comps.total ? comps.total : 0);
    var totalProjs = h && h.total_projects ? h.total_projects : (projs && projs.total ? projs.total : 0);
    var totalRevs = h && h.total_reviewers ? h.total_reviewers : (revs && revs.total ? revs.total : 0);
    var totalDocs = h && h.total_documents ? h.total_documents : 0;
    var totalUsers = h && h.total_users ? h.total_users : 0;
    var dbSize = h && h.database_size_mb ? h.database_size_mb : 0;
    var dataVer = h && h.current_data_version ? h.current_data_version : 0;

    var missingCritical = tables && tables.critical_missing ? tables.critical_missing : [];
    var status = tables && tables.status ? tables.status : 'unknown';

    return ''
      + '<div class="db-dashboard">'

      + '<div class="db-card db-card-health">'
      + '<h3><i class="fas fa-heartbeat"></i> Статус на свързаността</h3>'
      + '<div class="db-health-grid">'
      + '<div class="db-health-item ' + (healthOk ? 'ok' : 'err') + '">'
      + '<div class="db-health-icon"><i class="fas ' + (healthOk ? 'fa-check-circle' : 'fa-exclamation-circle') + '"></i></div>'
      + '<div><strong>' + (healthOk ? 'Базата е достъпна' : 'Грешка в свързаността') + '</strong></div>'
      + '<div class="db-health-sub">' + (dbStatus && dbStatus.db ? 'host: ' + dbStatus.db.host + ' | db: ' + dbStatus.db.name : '') + '</div>'
      + '</div>'
      + '<div class="db-health-item">'
      + '<div class="db-health-icon"><i class="fas fa-database"></i></div>'
      + '<div><strong>' + (dbSize ? dbSize.toFixed(1) + ' MB' : '—') + '</strong></div>'
      + '<div class="db-health-sub">Размер на базата</div>'
      + '</div>'
      + '<div class="db-health-item">'
      + '<div class="db-health-icon"><i class="fas fa-code-branch"></i></div>'
      + '<div><strong>v' + dataVer + '</strong></div>'
      + '<div class="db-health-sub">Data version</div>'
      + '</div>'
      + '<div class="db-health-item">'
      + '<div class="db-health-icon"><i class="fas fa-clock"></i></div>'
      + '<div><strong>' + (h && h.server_time ? h.server_time : '—') + '</strong></div>'
      + '<div class="db-health-sub">Сървърно време</div>'
      + '</div>'
      + '</div>'
      + '</div>'

      + '<div class="db-kpi-grid">'
      + kpiCard('📋', 'Предложения', totalApps)
      + kpiCard('🏆', 'Конкурси', totalComps)
      + kpiCard('📁', 'Проекти', totalProjs)
      + kpiCard('👤', 'Рецензенти', totalRevs)
      + kpiCard('📄', 'Документи', totalDocs)
      + kpiCard('👥', 'Потребители', totalUsers)
      + '</div>'

      + '<div class="db-card">'
      + '<h3><i class="fas fa-table"></i> Статус на таблиците</h3>'
      + '<div class="db-tables-status ' + (status === 'healthy' ? 'ok' : 'warn') + '">'
      + '<span>Състояние: <strong>' + status + '</strong></span>'
      + (missingCritical.length > 0
        ? '<span class="db-warn">⚠ Липсват критични таблици: ' + missingCritical.join(', ') + '</span>'
        : '<span class="db-ok">✓ Всички критични таблици налични</span>')
      + '</div>'
      + '<div class="db-tables-grid">'
      + (tables && tables.tables_status ? Object.keys(tables.tables_status).map(function (tbl) {
          var present = tables.tables_status[tbl];
          return '<div class="db-table-chip ' + (present ? 'present' : 'missing') + '" title="' + tbl + '">'
            + '<i class="fas ' + (present ? 'fa-check-square' : 'fa-times-circle') + '"></i> '
            + tbl
            + '</div>';
        }).join('') : '')
      + '</div>'
      + '</div>'

      + '<div class="db-card">'
      + '<h3><i class="fas fa-file-alt"></i> Последни предложения</h3>'
      + (forms && forms.forms && forms.forms.length > 0
        ? '<div class="db-table-wrap"><table><thead><tr>'
        + '<th>#</th><th>Име</th><th>Тип</th><th>Конкурс</th><th>Статус</th><th>Подаден</th><th>Фамилia</th>'
        + '</tr></thead><tbody>'
        + forms.forms.slice(0, 10).map(function (f, i) {
            return '<tr>'
            + '<td>' + (f.id || '') + '</td>'
            + '<td>' + escapeHtml(f.title || f.projectTitle || '') + '</td>'
            + '<td>' + escapeHtml(f.projectType || '') + '</td>'
            + '<td>' + escapeHtml(f.competition || '') + '</td>'
            + '<td><span class="db-status-badge ' + (f.status || '') + '">' + escapeHtml(f.status || '') + '</span></td>'
            + '<td>' + fmtDate(f.submitted || f.created || '') + '</td>'
            + '<td>' + escapeHtml(f.user_email || f.userEmail || '') + '</td>'
            + '</tr>';
          }).join('')
        + '</tbody></table></div>'
        : '<div class="db-empty">Няма предложения.</div>')
      + '</div>'

      + '<div class="db-card">'
      + '<h3><i class="fas fa-trophy"></i> Активни конкурси</h3>'
      + (comps && comps.competitions && comps.competitions.length > 0
        ? '<div class="db-competitions-list">'
        + comps.competitions.map(function (c) {
            return '<div class="db-comp-card">'
            + '<div class="db-comp-name">' + escapeHtml(c.name || '') + '</div>'
            + '<div class="db-comp-meta">'
            + '📅 Край: ' + fmtDate(c.deadline || '') + ' | '
            + '📊 ' + (c.totalApplications || 0) + '/' + (c.submittedApplications || 0) + ' предложения | '
            + '👤 ' + (c.totalReviewers || 0) + ' рецензенти'
            + '</div>'
            + '<div class="db-comp-status ' + (c.status || '') + '">' + (c.statusLabel || c.status || '') + '</div>'
            + '</div>';
          }).join('')
        : '<div class="db-empty">Няма конкурси.</div>')
      + '</div>'
      + '</div>';
  }

  function kpiCard(icon, label, count) {
    return '<div class="db-kpi-card">'
      + '<div class="db-kpi-icon">' + icon + '</div>'
      + '<div class="db-kpi-value">' + count + '</div>'
      + '<div class="db-kpi-label">' + label + '</div>'
      + '</div>';
  }

  // ── Applications table ───────────────────────────────────────────
  function renderApplications() {
    var data = state.data.applications;
    if (!data) return '<div class="db-empty">Няма данни.</div>';

    var forms = data.forms || [];
    var total = data.total || forms.length;

    if (forms.length === 0) {
      return '<div class="db-empty">Няма предложения в базата данни.</div>';
    }

    return ''
      + '<div class="db-card">'
      + '<h3>📋 Предложения (' + total + ')</h3>'
      + '<div class="db-table-wrap"><table><thead><tr>'
      + '<th>ID</th><th>Име</th><th>Тип</th><th>Конкурс</th><th>Статус</th><th>Подаден</th><th>Последн. промяна</th><th>Фамилia</th><th>Имейл</th>'
      + '</tr></thead><tbody>'
      + forms.map(function (f, i) {
          return '<tr>'
          + '<td class="mono">' + (f.id || '') + '</td>'
          + '<td>' + escapeHtml(f.title || f.projectTitle || '(без заглавие)') + '</td>'
          + '<td>' + escapeHtml(f.project_type || f.projectType || '') + '</td>'
          + '<td>' + escapeHtml(f.competition || '') + '</td>'
          + '<td><span class="db-status-badge ' + (f.status || '') + '">' + escapeHtml(f.status || '') + '</span></td>'
          + '<td>' + fmtDate(f.submitted || f.created || '') + '</td>'
          + '<td>' + fmtDate(f.updatedAt || f.modified || '') + '</td>'
          + '<td class="truncate">' + escapeHtml(f.user_name || f.userName || '') + '</td>'
          + '<td class="mono truncate">' + escapeHtml(f.user_email || f.userEmail || '') + '</td>'
          + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + (total > 100 ? '<div class="db-pagination-info">Показани първи 100 от ' + total + '</div>' : '')
      + '</div>';
  }

  // ── Projects table ───────────────────────────────────────────────
  function renderProjects() {
    var data = state.data.projects;
    if (!data) return '<div class="db-empty">Няма данни.</div>';

    var projects = data.projects || [];
    var total = data.total || projects.length;

    if (projects.length === 0) {
      return '<div class="db-empty">Няма проекти в базата данни.</div>';
    }

    return ''
      + '<div class="db-card">'
      + '<h3>📁 Проекти (' + total + ')</h3>'
      + '<div class="db-table-wrap"><table><thead><tr>'
      + '<th>ID</th><th>Заглавие</th><th>Ръководител</th><th>Тип</th><th>Статус</th><th>Компетиция</th><th>Подаден</th><th>Бюджет (€)</th>'
      + '</tr></thead><tbody>'
      + projects.map(function (p, i) {
          return '<tr>'
          + '<td class="mono">' + (p.id || p.projectId || '') + '</td>'
          + '<td>' + escapeHtml(p.title || p.projectTitle || p.appTitle || '') + '</td>'
          + '<td>' + escapeHtml(p.leaderName || p.leader_email || p.userEmail || '') + '</td>'
          + '<td>' + escapeHtml(p.projectType || p.project_type || '') + '</td>'
          + '<td><span class="db-status-badge ' + (p.status || '') + '">' + escapeHtml(p.status || '') + '</span></td>'
          + '<td>' + escapeHtml(p.competition || p.competitionId || '') + '</td>'
          + '<td>' + fmtDate(p.created || '') + '</td>'
          + '<td class="mono">' + (p.budget || p.budget_eur || '0') + '</td>'
          + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + (total > 100 ? '<div class="db-pagination-info">Показани първи 100 от ' + total + '</div>' : '')
      + '</div>';
  }

  // ── Competitions ─────────────────────────────────────────────────
  function renderCompetitions() {
    var data = state.data.competitions;
    if (!data) return '<div class="db-empty">Няма данни.</div>';

    var comps = data.competitions || [];
    if (comps.length === 0) return '<div class="db-empty">Няма конкурси.</div>';

    return ''
      + '<div class="db-card">'
      + '<h3>🏆 Конкурси (' + comps.length + ')</h3>'
      + '<div class="db-competitions-grid">'
      + comps.map(function (c) {
          return '<div class="db-comp-card">'
          + '<div class="db-comp-header">'
          + '<div class="db-comp-name">' + escapeHtml(c.name || '(без име)') + '</div>'
          + '<span class="db-badge ' + (c.status || '') + '">' + (c.statusLabel || c.status || '') + '</span>'
          + '</div>'
          + '<div class="db-comp-body">'
          + '<p><strong>ID:</strong> <span class="mono">' + (c.id || '') + '</span></p>'
          + '<p><strong>Крайна дата:</strong> ' + fmtDate(c.deadline || '') + '</p>'
          + '<p><strong>Подадени:</strong> ' + (c.totalApplications || 0) + ' (одобрени: ' + (c.approvedApplications || 0) + ')</p>'
          + '<p><strong>Рецензенти:</strong> ' + (c.totalReviewers || 0) + '</p>'
          + '<p><strong>Изтичане:</strong> ' + (c.daysUntilDeadline !== undefined ? c.daysUntilDeadline + ' дни' : '') + '</p>'
          + '<p><strong>Създаден:</strong> ' + fmtDate(c.created || '') + '</p>'
          + '</div>'
          + '</div>';
        }).join('')
      + '</div>'
      + '</div>';
  }

  // ── Reviewers ────────────────────────────────────────────────────
  function renderReviewers() {
    var data = state.data.reviewers;
    if (!data) return '<div class="db-empty">Няма данни.</div>';

    var reviewers = data.reviewers || [];
    if (reviewers.length === 0) return '<div class="db-empty">Няма рецензенти.</div>';

    return ''
      + '<div class="db-card">'
      + '<h3>👤 Рецензенти (' + reviewers.length + ')</h3>'
      + '<div class="db-table-wrap"><table><thead><tr>'
      + '<th>Име</th><th>Имейл</th><th>Университет</th><th>Специалност</th><th>Статус</th>'
      + '</tr></thead><tbody>'
      + reviewers.map(function (r) {
          return '<tr>'
          + '<td>' + escapeHtml(r.name || r.reviewer_name || '') + '</td>'
          + '<td class="mono">' + escapeHtml(r.email || r.reviewer_email || '') + '</td>'
          + '<td>' + escapeHtml(r.university || '') + '</td>'
          + '<td>' + escapeHtml(r.specialty || '') + '</td>'
          + '<td><span class="db-status-badge ' + (r.status || '') + '">' + escapeHtml(r.status || '') + '</span></td>'
          + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + '</div>';
  }

  // ── Documents ────────────────────────────────────────────────────
  function renderDocuments() {
    var data = state.data.documents;
    if (!data) return '<div class="db-empty">Няма данни.</div>';

    var docs = data.data || [];
    var total = data.total || docs.length;

    if (docs.length === 0) return '<div class="db-empty">Няма документи.</div>';

    return ''
      + '<div class="db-card">'
      + '<h3>📄 Документи (' + total + ')</h3>'
      + '<div class="db-table-wrap"><table><thead><tr>'
      + '<th>ID</th><th>Име</th><th>Тип</th><th>Формуляр</th><th>Собственик</th><th>Размер</th><th>Добавен</th>'
      + '</tr></thead><tbody>'
      + docs.slice(0, 100).map(function (d) {
          return '<tr>'
          + '<td class="mono">' + (d.id || '') + '</td>'
          + '<td class="truncate">' + escapeHtml(d.name || '') + '</td>'
          + '<td>' + escapeHtml(d.docType || d.category || d.type_label || '') + '</td>'
          + '<td class="truncate">' + (d.form ? escapeHtml(d.form.title || d.form.id || '') : '') + '</td>'
          + '<td class="truncate">' + escapeHtml(d.ownerEmail || d.user_email || '') + '</td>'
          + '<td class="mono">' + fmtBytes(d.sizeBytes || d.size || 0) + '</td>'
          + '<td>' + fmtDate(d.created_at || d.created || '') + '</td>'
          + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + (total > 100 ? '<div class="db-pagination-info">Показани първи 100 от ' + total + '</div>' : '')
      + '</div>';
  }

  // ── Users ────────────────────────────────────────────────────────
  function renderUsers() {
    var data = state.data.users;
    if (!data) return '<div class="db-empty">Няма данни.</div>';

    var users = data.users || [];
    if (users.length === 0) return '<div class="db-empty">Няма потребители.</div>';

    return ''
      + '<div class="db-card">'
      + '<h3>👥 Потребители (' + users.length + ')</h3>'
      + '<div class="db-table-wrap"><table><thead><tr>'
      + '<th>Имейл</th><th>Име</th><th>Роля</th><th>Предложения</th><th>Последна активност</th>'
      + '</tr></thead><tbody>'
      + users.map(function (u) {
          return '<tr>'
          + '<td class="mono">' + escapeHtml(u.email || '') + '</td>'
          + '<td>' + escapeHtml(u.name || '') + '</td>'
          + '<td><span class="db-badge ' + (u.role || '') + '">' + (u.role || '') + '</span></td>'
          + '<td class="mono">' + (u.formCount || 0) + '</td>'
          + '<td>' + fmtDate(u.lastForm && u.lastForm.created ? u.lastForm.created : '') + '</td>'
          + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + '</div>';
  }

  // ── Audit log ────────────────────────────────────────────────────
  function renderAudit() {
    var data = state.data.audit;
    var rows = (data && data.data) ? data.data : [];
    if (rows.length === 0) return '<div class="db-empty">Няма запис в аудит-лога.</div>';

    return ''
      + '<div class="db-card">'
      + '<h3>📋 Аудит-лог (' + rows.length + ' записа)</h3>'
      + '<div class="db-table-wrap"><table><thead><tr>'
      + '<th>Време</th><th>Действие</th><th>Потребител</th><th>Обект</th><th>Детайли</th>'
      + '</tr></thead><tbody>'
      + rows.slice(0, 100).map(function (r) {
          var details = r.details ? JSON.parse(r.details) : {};
          return '<tr>'
          + '<td>' + fmtDate(r.created || r.timestamp || '') + '</td>'
          + '<td><span class="db-badge ' + (r.action || '') + '">' + escapeHtml(r.action || '') + '</span></td>'
          + '<td class="mono">' + escapeHtml(r.actor || r.user_email || '') + '</td>'
          + '<td>' + escapeHtml(r.target_type || '') + (r.target_id ? ' #' + r.target_id : '') + '</td>'
          + '<td class="db-details-json">' + escapeHtml(JSON.stringify(details, null, 1)) + '</td>'
          + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + (rows.length > 100 ? '<div class="db-pagination-info">Показани първи 100 от ' + rows.length + '</div>' : '')
      + '</div>';
  }

  // ── Config ───────────────────────────────────────────────────────
  function renderConfig() {
    var data = state.data.config;
    if (!data) return '<div class="db-empty">Няма данни.</div>';

    var config = data.systemConfig || {};
    var types = data.projectTypes || [];
    var statuses = data.applicationStatuses || [];
    var dv = data.dataVersion || {};

    return ''
      + '<div class="db-card">'
      + '<h3>⚙ Системен конфигурация</h3>'
      + '<div class="db-config-section">'
      + '<h4>Системни настройки</h4>'
      + '<div class="db-config-table">'
      + Object.keys(config).map(function (k) {
          return '<div class="db-config-row"><span class="db-config-key">' + escapeHtml(k) + '</span><span class="db-config-val">' + escapeHtml(String(config[k])) + '</span></div>';
        }).join('')
      + '</div>'
      + '</div>'

      + '<div class="db-card">'
      + '<h3>📋 Типове проекти (' + types.length + ')</h3>'
      + '<div class="db-types-grid">'
      + types.map(function (t) {
          return '<div class="db-type-card">'
          + '<h4>' + escapeHtml(t.value || t.name || '') + '</h4>'
          + '<p>Макс. бюджет: ' + (t.maxBudget || '') + ' €</p>'
          + '<p>Мин. продължителност: ' + (t.minDurationMonths || '') + ' мес.</p>'
          + '<p>Макс. продължителност: ' + (t.maxDurationMonths || '') + ' мес.</p>'
          + '</div>';
        }).join('')
      + '</div>'
      + '</div>'

      + '<div class="db-card">'
      + '<h3>📊 Статуси на приложения (' + statuses.length + ')</h3>'
      + '<div class="db-statuses-list">'
      + statuses.map(function (s) {
          return '<div class="db-status-item"><span class="db-badge ' + (s.value || '') + '">' + escapeHtml(s.value || '') + '</span> ' + escapeHtml(s.label || '') + '</div>';
        }).join('')
      + '</div>'
      + '</div>'

      + '<div class="db-card">'
      + '<h3>🔢 Data Version</h3>'
      + '<pre>' + escapeHtml(JSON.stringify(dv, null, 2)) + '</pre>'
      + '</div>'
      + '</div>';
  }

  // ── Utility functions ────────────────────────────────────────────
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  function fmtBytes(bytes) {
    if (!bytes || bytes === 0) return '—';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  // ── Public API ───────────────────────────────────────────────────
  window.DBDataViewer = {
    switchTab: function (tabId) {
      state.activeTab = tabId;
      state.loading = true;
      state.data = {};
      render();
      loadCurrentTab().then(function () {
        render();
      });
    },

    refresh: function () {
      state.refreshKey++;
      state.loading = true;
      render();
      loadCurrentTab().then(function () {
        render();
      });
    },

    exportJSON: function () {
      var exportData = {
        exportedAt: new Date().toISOString(),
        dbStatus: state.dbStatus,
        activeTab: state.activeTab,
        data: state.data,
      };
      var blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'uev-db-export-' + Date.now() + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify('Данните са изнесени като JSON', 'success');
    },

    toggleRaw: function () {
      var panel = document.getElementById('db-raw-panel');
      if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
      }
    },

    runQuery: function () {
      var sqlInput = document.getElementById('db-raw-sql');
      var resultsDiv = document.getElementById('db-raw-results');
      if (!sqlInput || !resultsDiv) return;

      var sql = sqlInput.value.trim();
      if (!sql) {
        resultsDiv.innerHTML = '<div class="db-error">Въведете SQL заявка.</div>';
        return;
      }

      resultsDiv.innerHTML = '<div class="db-loading"><i class="fas fa-spinner fa-spin"></i> Изпълнение…</div>';

      // Use POST with action=executeRawQuery
      fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'executeRawQuery', sql: sql }),
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        if (data.success) {
          var rows = data.data || data.rows || [];
          resultsDiv.innerHTML = ''
            + '<div class="db-raw-result-info">Резултат: ' + rows.length + ' реда</div>'
            + (rows.length > 0
              ? '<div class="db-table-wrap"><table><thead><tr>'
              + Object.keys(rows[0]).map(function (k) {
                  return '<th>' + escapeHtml(k) + '</th>';
                }).join('')
              + '</tr></thead><tbody>'
              + rows.map(function (row) {
                  return '<tr>'
                  + Object.keys(row).map(function (k) {
                      var val = row[k];
                      if (typeof val === 'object') {
                        val = JSON.stringify(val);
                      }
                      return '<td>' + escapeHtml(String(val)) + '</td>';
                    }).join('')
                  + '</tr>';
                }).join('')
              + '</tbody></table></div>'
              : '<div class="db-ok">Заявката е изпълнена успешно, но няма резултати.</div>');
        } else {
          resultsDiv.innerHTML = '<div class="db-error"><i class="fas fa-exclamation-triangle"></i> ' + escapeHtml(data.error || 'Грешка') + '</div>';
        }
      }).catch(function (e) {
        resultsDiv.innerHTML = '<div class="db-error"><i class="fas fa-bug"></i> ' + escapeHtml(e.message) + '</div>';
      });
    },

    clearQuery: function () {
      var sqlInput = document.getElementById('db-raw-sql');
      var resultsDiv = document.getElementById('db-raw-results');
      if (sqlInput) sqlInput.value = '';
      if (resultsDiv) resultsDiv.innerHTML = '';
    },
  };

  // ── Initial load ─────────────────────────────────────────────────
  function loadCurrentTab() {
    switch (state.activeTab) {
      case 'dashboard': return loadDashboard();
      case 'applications': return loadApplications();
      case 'projects': return loadProjects();
      case 'competitions': return loadCompetitions();
      case 'reviewers': return loadReviewers();
      case 'documents': return loadDocuments();
      case 'users': return loadUsers();
      case 'audit': return loadAudit();
      case 'config': return loadConfig();
      case 'raw': return Promise.resolve();
      default: return Promise.resolve();
    }
  }

  // ── Boot ─────────────────────────────────────────────────────────
  fetchDbStatus().then(function () {
    state.loading = false;
    render();
    loadCurrentTab().then(function () {
      render();
    });
  });
})();
