/* WizardPublicView.js — Public-facing read-only view for proposal wizard submissions */
(function (global) {
  'use strict';
  var e = React.createElement;
  var useEffect = React.useEffect;
  var useCallback = React.useCallback;

  /* ── Helpers ── */
  function _formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('bg-BG', { year: 'numeric', month: '2-digit', day: '2-digit' });
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
      draft: { label: 'Чернова', cls: 'pw-public-badge pw-public-badge-draft' },
      submitted: { label: 'Изпратена', cls: 'pw-public-badge pw-public-badge-submitted' },
      approved: { label: 'Одобрена', cls: 'pw-public-badge pw-public-badge-approved' },
      rejected: { label: 'Отхвърлена', cls: 'pw-public-badge pw-public-badge-rejected' },
      in_review: { label: 'На разглеждане', cls: 'pw-public-badge pw-public-badge-review' }
    };
    var info = map[status] || { label: status || '—', cls: 'pw-public-badge' };
    return e('span', { className: info.cls }, info.label);
  }

  function _getProjectTypeLabel(type) {
    var map = {
      'ФНИ': 'ФНИ (Фундамени изследвания)',
      'ПНИ': 'ПНИ (Приложни изследвания)',
      'ДНП': 'ДНП (Докторанти/Млади изследователи)',
      'НПФ': 'НПФ (Научни програми/Фондове)'
    };
    return map[type] || type || '—';
  }

  /* ── Section: Header with Status Badge ── */
  function HeaderSection(props) {
    var submission = props.submission;
    return e('header', { className: 'pw-public-header' },
      e('div', { className: 'pw-public-header-top' },
        _getStatusBadge(submission.status),
        e('h1', { className: 'pw-public-title' }, submission.project_title || submission.step1?.project_title || 'Без заглавие'),
        e('div', { className: 'pw-public-meta' },
          e('span', { className: 'pw-public-type' }, _getProjectTypeLabel(submission.project_type || submission.step1?.project_type)),
          submission.competition_year && e('span', { className: 'pw-public-year' }, submission.competition_year || submission.step1?.competition_year)
        )
      ),
      submission.id && e('div', { className: 'pw-public-id' }, 'ID: ', submission.id)
    );
  }

  /* ── Section: Key Info (Leader, Team, Dates) ── */
  function KeyInfoSection(props) {
    var submission = props.submission;
    var step1 = submission.step1 || {};
    var leader = step1.applicant_name || step1.user_name || '—';
    var department = step1.department || '—';
    var competitionSession = step1.competition_session_id || submission.competition_session_id || '—';

    return e('section', { className: 'pw-public-section pw-public-key-info' },
      e('h2', { className: 'pw-public-section-title' }, 'Основна информация'),
      e('dl', { className: 'pw-public-dl' },
        _dlRow('Ръководител', leader),
        _dlRow('Катедра', department),
        _dlRow('Конкурсна сесия', competitionSession),
        _dlRow('Година на конкурс', step1.competition_year || submission.competition_year || '—'),
        _dlRow('Статус', _getStatusBadge(submission.status)),
        _dlRow('Създадена на', _formatDate(submission.created_at || submission.createdAt))
      )
    );
  }

  function _dlRow(label, value) {
    return [
      e('dt', { key: 'label', className: 'pw-public-dt' }, label),
      e('dd', { key: 'value', className: 'pw-public-dd' }, value)
    ];
  }

  /* ── Section: Team Members ── */
  function TeamSection(props) {
    var submission = props.submission;
    var step1 = submission.step1 || {};
    var team = step1.team_members || step1.team || [];

    if (!team || team.length === 0) {
      return e('section', { className: 'pw-public-section pw-public-team' },
        e('h2', { className: 'pw-public-section-title' }, 'Екип'),
        e('p', { className: 'pw-public-empty' }, 'Няма посочени членове на екипа.')
      );
    }

    return e('section', { className: 'pw-public-section pw-public-team' },
      e('h2', { className: 'pw-public-section-title' }, 'Екип (' + team.length + ')'),
      e('ul', { className: 'pw-public-team-list' },
        team.map(function (member, idx) {
          var name = member.name || member.full_name || member.user_name || '—';
          var role = member.role || member.position || 'Член';
          var affiliation = member.affiliation || member.institution || '';
          return e('li', { key: idx, className: 'pw-public-team-item' },
            e('span', { className: 'pw-public-team-name' }, name),
            e('span', { className: 'pw-public-team-role' }, role),
            affiliation && e('span', { className: 'pw-public-team-affiliation' }, affiliation)
          );
        })
      )
    );
  }

  /* ── Section: Abstract ── */
  function AbstractSection(props) {
    var submission = props.submission;
    var step1 = submission.step1 || {};
    var abstractBg = step1.summary_bg || step1.abstract_bg || '';
    var abstractEn = step1.summary_en || step1.abstract_en || '';

    if (!abstractBg && !abstractEn) {
      return e('section', { className: 'pw-public-section pw-public-abstract' },
        e('h2', { className: 'pw-public-section-title' }, 'Резюме'),
        e('p', { className: 'pw-public-empty' }, 'Няма предоставено резюме.')
      );
    }

    return e('section', { className: 'pw-public-section pw-public-abstract' },
      e('h2', { className: 'pw-public-section-title' }, 'Резюме'),
      abstractBg && e('div', { className: 'pw-public-abstract-block' },
        e('h3', { className: 'pw-public-abstract-lang' }, 'Български'),
        e('p', { className: 'pw-public-abstract-text' }, abstractBg)
      ),
      abstractEn && e('div', { className: 'pw-public-abstract-block' },
        e('h3', { className: 'pw-public-abstract-lang' }, 'English'),
        e('p', { className: 'pw-public-abstract-text' }, abstractEn)
      )
    );
  }

  /* ── Section: Budget Summary ── */
  function BudgetSection(props) {
    var submission = props.submission;
    var budget = submission.budget || submission.budget_breakdown || submission.step1?.budget || {};

    if (!budget || Object.keys(budget).length === 0) {
      return e('section', { className: 'pw-public-section pw-public-budget' },
        e('h2', { className: 'pw-public-section-title' }, 'Бюджетно обобщение'),
        e('p', { className: 'pw-public-empty' }, 'Няма бюджетни данни.')
      );
    }

    var total = 0;
    var rows = [];
    var idx = 0;
    for (var key in budget) {
      if (Object.prototype.hasOwnProperty.call(budget, key)) {
        var val = Number(budget[key]) || 0;
        total += val;
        rows.push(e('tr', { key: idx++ },
          e('td', { className: 'pw-public-budget-label' }, key),
          e('td', { className: 'pw-public-budget-value' }, _formatCurrency(val))
        ));
      }
    }

    rows.push(e('tr', { key: 'total', className: 'pw-public-budget-total' },
      e('td', { className: 'pw-public-budget-label' }, 'Общо'),
      e('td', { className: 'pw-public-budget-value' }, _formatCurrency(total))
    ));

    return e('section', { className: 'pw-public-section pw-public-budget' },
      e('h2', { className: 'pw-public-section-title' }, 'Бюджетно обобщение'),
      e('table', { className: 'pw-public-budget-table' },
        e('thead', null,
          e('tr', null,
            e('th', { className: 'pw-public-budget-th' }, 'Статия'),
            e('th', { className: 'pw-public-budget-th' }, 'Стойност')
          )
        ),
        e('tbody', null, rows)
      )
    );
  }

  /* ── Section: Documents ── */
  function DocumentsSection(props) {
    var submission = props.submission;
    var docs = submission.documents || submission.step1?.documents || [];

    if (!docs || docs.length === 0) {
      return e('section', { className: 'pw-public-section pw-public-documents' },
        e('h2', { className: 'pw-public-section-title' }, 'Документи'),
        e('p', { className: 'pw-public-empty' }, 'Няма качени документи.')
      );
    }

    return e('section', { className: 'pw-public-section pw-public-documents' },
      e('h2', { className: 'pw-public-section-title' }, 'Документи (' + docs.length + ')'),
      e('ul', { className: 'pw-public-doc-list' },
        docs.map(function (doc, i) {
          var name = doc.name || doc.filename || ('Документ ' + (i + 1));
          var url = doc.url || doc.download_url || doc.file_url || '';
          var status = doc.status || 'uploaded';
          var statusCls = status === 'approved' ? 'pw-public-doc-approved' :
            status === 'rejected' ? 'pw-public-doc-rejected' : 'pw-public-doc-uploaded';

          return e('li', { key: i, className: 'pw-public-doc-item' },
            e('span', { className: 'pw-public-doc-name' }, name),
            e('span', { className: 'pw-public-doc-status ' + statusCls }, status),
            url && e('a', {
              className: 'pw-public-doc-link',
              href: url,
              target: '_blank',
              rel: 'noopener noreferrer',
              download: name
            }, 'Изтегли')
          );
        })
      )
    );
  }

  /* ── Section: Referees (Names Only) ── */
  function RefereesSection(props) {
    var submission = props.submission;
    var refs = submission.referees || submission.external_reviewers || submission.step1?.referees || [];

    if (!refs || refs.length === 0) {
      return e('section', { className: 'pw-public-section pw-public-referees' },
        e('h2', { className: 'pw-public-section-title' }, 'Рефери'),
        e('p', { className: 'pw-public-empty' }, 'Няма посочени рефери.')
      );
    }

    return e('section', { className: 'pw-public-section pw-public-referees' },
      e('h2', { className: 'pw-public-section-title' }, 'Рефери (' + refs.length + ')'),
      e('ul', { className: 'pw-public-ref-list' },
        refs.map(function (ref, i) {
          var name = ref.name || ref.full_name || '—';
          var affiliation = ref.affiliation || ref.institution || '';
          return e('li', { key: i, className: 'pw-public-ref-item' },
            e('span', { className: 'pw-public-ref-name' }, name),
            affiliation && e('span', { className: 'pw-public-ref-affiliation' }, affiliation)
          );
        })
      )
    );
  }

  /* ── Close Button ── */
  function CloseButton(props) {
    var onClose = props.onClose;
    return e('button', {
      className: 'pw-public-close-btn',
      onClick: onClose,
      'aria-label': 'Затвори'
    }, '×');
  }

  /* ── Print Button ── */
  function PrintButton(props) {
    return e('button', {
      className: 'pw-public-print-btn',
      onClick: function () { window.print(); },
      'aria-label': 'Принтирай'
    }, '🖨 Принтирай');
  }

  /* ── Main Component ── */
  function WizardPublicView(props) {
    props = props || {};
    var submission = props.submission;
    var onClose = props.onClose;

    useEffect(function () {
      function handleEsc(ev) {
        if (ev.key === 'Escape' && onClose) onClose();
      }
      document.addEventListener('keydown', handleEsc);
      return function () { document.removeEventListener('keydown', handleEsc); };
    }, [onClose]);

    if (!submission) {
      return e('div', { className: 'pw-public-container' },
        e('div', { className: 'pw-public-loading' },
          e('div', { className: 'pw-public-spinner' }),
          e('span', null, 'Зареждане...')
        )
      );
    }

    return e('div', { className: 'pw-public-container' },
      e('div', { className: 'pw-public-actions' },
        onClose && e(CloseButton, { onClose: onClose }),
        e(PrintButton, null)
      ),
      e('main', { className: 'pw-public-main' },
        e(HeaderSection, { submission: submission }),
        e(KeyInfoSection, { submission: submission }),
        e(TeamSection, { submission: submission }),
        e(AbstractSection, { submission: submission }),
        e(BudgetSection, { submission: submission }),
        e(DocumentsSection, { submission: submission }),
        e(RefereesSection, { submission: submission })
      ),
      e('footer', { className: 'pw-public-footer' },
        e('p', { className: 'pw-public-footer-text' }, 'Proposal Wizard — Публичен преглед на заявка')
      )
    );
  }

  /* ── Expose globally ── */
  global.__pwWizardPublicView = WizardPublicView;

})(typeof window !== 'undefined' ? window : this);