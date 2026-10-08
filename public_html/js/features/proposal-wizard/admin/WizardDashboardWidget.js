/* WizardDashboardWidget.js — Compact dashboard widget for Proposal Wizard submissions */
(function (global) {
  'use strict';

  var e = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;

  var STATUS_LABELS = {
    draft: 'Чернова',
    submitted: 'Изпратена',
    approved: 'Одобрена',
    rejected: 'Отхвърлена',
    in_review: 'На разглеждане'
  };

  var PROJECT_TYPE_LABELS = {
    'ФНИ': 'ФНИ',
    'ПНИ': 'ПНИ',
    'ДНП': 'ДНП',
    'НПФ': 'НПФ'
  };

  function _formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('bg-BG', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch (err) { return dateStr; }
  }

  function _getStatusBadge(status) {
    var map = {
      draft: { label: 'Чернова', cls: 'pw-widget-badge pw-widget-badge-draft' },
      submitted: { label: 'Изпратена', cls: 'pw-widget-badge pw-widget-badge-submitted' },
      approved: { label: 'Одобрена', cls: 'pw-widget-badge pw-widget-badge-approved' },
      rejected: { label: 'Отхвърлена', cls: 'pw-widget-badge pw-widget-badge-rejected' },
      in_review: { label: 'На разглеждане', cls: 'pw-widget-badge pw-widget-badge-review' }
    };
    var info = map[status] || { label: status || '—', cls: 'pw-widget-badge' };
    return e('span', { className: info.cls }, info.label);
  }

  function _getProjectTypeBadge(type) {
    var label = PROJECT_TYPE_LABELS[type] || type || '—';
    return e('span', { className: 'pw-widget-type-badge' }, label);
  }

  function StatCard(props) {
    return e('div', { className: 'pw-widget-stat-card ' + (props.className || '') },
      e('div', { className: 'pw-widget-stat-icon' }, props.icon),
      e('div', { className: 'pw-widget-stat-content' },
        e('div', { className: 'pw-widget-stat-value' }, props.value),
        e('div', { className: 'pw-widget-stat-label' }, props.label)
      )
    );
  }

  function ProjectTypeStat(props) {
    var type = props.type;
    var count = props.count;
    var label = PROJECT_TYPE_LABELS[type] || type;
    return e('div', { className: 'pw-widget-type-stat' },
      e('span', { className: 'pw-widget-type-code' }, label),
      e('span', { className: 'pw-widget-type-count' }, count)
    );
  }

  function RecentSubmissionsList(props) {
    var submissions = props.submissions || [];
    var onViewAll = props.onViewAll;

    if (!submissions || submissions.length === 0) {
      return e('div', { className: 'pw-widget-empty' },
        e('span', { className: 'pw-widget-empty-icon' }, '📋'),
        e('p', { className: 'pw-widget-empty-text' }, 'Няма намерени заявки'),
        onViewAll && e('button', { className: 'pw-widget-btn pw-widget-btn-secondary', onClick: onViewAll }, 'Вижте всички')
      );
    }

    return e('div', { className: 'pw-widget-recent-list' },
      e('div', { className: 'pw-widget-recent-header' },
        e('h4', { className: 'pw-widget-section-title' }, 'Последни заявки'),
        onViewAll && e('button', { className: 'pw-widget-btn pw-widget-btn-link', onClick: onViewAll }, 'Вижте всички →')
      ),
      e('div', { className: 'pw-widget-recent-items' },
        submissions.slice(0, 5).map(function (sub, idx) {
          var status = sub.status || 'draft';
          var projectType = sub.project_type || sub.projectType || '—';
          var userEmail = sub.user_email || sub.email || '—';
          var createdAt = _formatDate(sub.created_at || sub.createdAt);
          return e('div', { key: sub.id || idx, className: 'pw-widget-recent-item' },
            e('div', { className: 'pw-widget-recent-main' },
              e('div', { className: 'pw-widget-recent-id' }, '#' + (sub.id || sub.submission_id || (idx + 1))),
              e('div', { className: 'pw-widget-recent-meta' },
                e('span', { className: 'pw-widget-recent-user' }, userEmail),
                e('span', { className: 'pw-widget-recent-date' }, createdAt)
              )
            ),
            e('div', { className: 'pw-widget-recent-badges' },
              _getProjectTypeBadge(projectType),
              _getStatusBadge(status)
            )
          );
        })
      )
    );
  }

  function WizardDashboardWidget(props) {
    props = props || {};
    var onViewAll = props.onViewAll;
    var stats = props.stats || {};
    var recentSubmissions = props.recentSubmissions || [];

    var total = stats.total || 0;
    var drafts = (stats.byStatus && stats.byStatus.draft) || 0;
    var submitted = (stats.byStatus && stats.byStatus.submitted) || 0;
    var byType = stats.byProjectType || {};

    return e('div', { className: 'pw-widget-container' },
      e('div', { className: 'pw-widget-header' },
        e('h3', { className: 'pw-widget-title' }, 'Проposal Wizard'),
        onViewAll && e('button', { className: 'pw-widget-btn pw-widget-btn-link pw-widget-view-all', onClick: onViewAll }, 'Вижте всички →')
      ),

      e('div', { className: 'pw-widget-stats-row' },
        e(StatCard, { label: 'Общо заявки', value: total, icon: '📋', className: 'pw-widget-stat-total' }),
        e(StatCard, { label: 'Чернови', value: drafts, icon: '📝', className: 'pw-widget-stat-draft' }),
        e(StatCard, { label: 'Изпратени', value: submitted, icon: '✈️', className: 'pw-widget-stat-submitted' })
      ),

      Object.keys(byType).length > 0 && e('div', { className: 'pw-widget-type-stats' },
        e('h4', { className: 'pw-widget-section-title' }, 'По тип проект'),
        e('div', { className: 'pw-widget-type-stats-row' },
          Object.keys(byType).map(function (t, i) {
            return e(ProjectTypeStat, { key: i, type: t, count: byType[t] });
          })
        )
      ),

      e(RecentSubmissionsList, { submissions: recentSubmissions, onViewAll: onViewAll })
    );
  }

  global.__pwWizardDashboardWidget = WizardDashboardWidget;

})(typeof window !== 'undefined' ? window : global);