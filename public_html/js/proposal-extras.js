/* ════════════════════════════════════════════════════════════════════════
 *  proposal-extras.js
 *  ----------------------------------------------------------------------
 *  Three reusable React components that close the BPMN dataflow gaps for
 *  UC-06 (detailed budget at proposal stage), UC-07 (team composition with
 *  cross-project validation), and UC-29-31 (expense request / approval /
 *  posting workflow).
 *
 *  Globals exposed:
 *    window.TeamMembersEditor({ value, onChange, leaderEmail, leaderName,
 *                                projectCode, competitionId, formId, user })
 *    window.BudgetEditor({ value, onChange, durationMonths, startYear,
 *                          totalBudget, onTotalChange, projectCode })
 *    window.M_ExpensesView({ user, isAdmin, userRole })
 *
 *  No external CSS — uses existing project tokens (var(--ink), var(--primary),
 *  var(--surface), var(--border), .card, .btn, .form-field, etc.).
 * ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  // ── Safe guard: React must be available AND we must be able to call it ──
  var _React, _e, _useState, _useEffect, _useMemo, _useCallback, _Fragment;
  try {
    if (typeof React === 'undefined') return;
    _React = React;
    _e = React.createElement;
    _useState = React.useState;
    _useEffect = React.useEffect;
    _useMemo = React.useMemo;
    _useCallback = React.useCallback;
    _Fragment = React.Fragment;
    // Verify we can actually call createElement (catches CSP/iframe sandbox blocks)
    _e('div', null);
  } catch (_) { return; }
  var e = _e;
  var useState = _useState;
  var useEffect = _useEffect;
  var useMemo = _useMemo;
  var useCallback = _useCallback;
  var Fragment = _Fragment;

  /* ── lookups ─────────────────────────────────────────────────────────── */
  var COST_GROUPS = [
    { id: 'salaries',          bg: 'Възнаграждения',           section: 'remuneration' },
    { id: 'external_services', bg: 'Външни услуги',            section: 'services' },
    { id: 'assets',            bg: 'Дълготрайни активи',       section: 'assets' },
    { id: 'consumables',       bg: 'Консумативи',               section: 'materials' },
    { id: 'literature',        bg: 'Литература',                section: 'materials' },
    { id: 'travel',            bg: 'Командировки',              section: 'services' },
    { id: 'publications',      bg: 'Публикации',                section: 'services' },
    { id: 'reviews',           bg: 'Рецензии',                  section: 'remuneration' },
    { id: 'other',             bg: 'Други',                     section: 'other' }
  ];
  var COST_GROUP_LABEL = {};
  COST_GROUPS.forEach(function (g) { COST_GROUP_LABEL[g.id] = g.bg; });

  /* ── Budget rule definitions per project type, shown in the rules panel ── */
  var BUDGET_RULES_BY_TYPE = {
    'ФНИ': [
      // ════════════════════════════════════════════════════════════════
      //  ФНИ — ПЪЛНА ПРАВИЛНИКОВА РАМКА (2026 г.)
      //  All caps enforced as hard validation in validateBudgetForType()
      // ════════════════════════════════════════════════════════════════
      // ── Раздел 1: РАЗХОДИ ЗА ПРИДОБИВАНЕ НА ДМА И НДМА ──
      //  Категория 1.1 — Компютърна техника и хардуер
      { group: 'assets',  id: 'assets', label: 'Компютърна техника и хардуер (1.1)',
        limit: 'Само типове/бройки, които не са налични в ИУ-Варна', severity: 'info' },
      //  Категория 1.2 — Софтуер / специализирани програми
      { group: 'assets',  id: 'assets', label: 'Софтуер / специализирани програми (1.2)',
        limit: 'Само типове/бройки, които не са налични в ИУ-Варна', severity: 'info' },

      // ── Раздел 2: МАТЕРИАЛИ ──
      //  Категория 2.1 — Специализирана научна литература
      { group: 'materials', id: 'literature', label: 'Специализирана научна литература (2.1)',
        limit: '≤ 10% от договора (първите 12 месеца)', severity: 'high' },
      //  Категория 2.2 — Информационни бази данни / абонаменти
      { group: 'materials', id: 'literature', label: 'Информационни бази данни / абонаменти (2.2)',
        limit: '≤ 40% от договора', severity: 'high' },
      //  Категория 2.3 — Канцеларски материали
      { group: 'materials', id: 'consumables', label: 'Канцеларски материали (2.3)',
        limit: '≤ 5% от бюджета', severity: 'high' },

      // ── Раздел 3: ВЪЗНАГРАЖДЕНИЯ ──
      //  Правило 3.1 — Възнаграждения на екипа (общо)
      { group: 'remuneration', id: 'salaries', label: 'Възнаграждения на екипа — общо (3.1) — с докторанти/млади учени',
        limit: '≤ 35% от стойността на договора годишно', severity: 'high' },
      { group: 'remuneration', id: 'salaries', label: 'Възнаграждения на екипа — общо (3.1) — без докторанти/млади учени',
        limit: '≤ 10% от стойността на договора годишно', severity: 'high' },
      //  Субравило 3.1.1 — Докторанти и млади учени
      { group: 'remuneration', id: 'salaries', label: 'Докторанти и млади учени (3.1.1): минимален дял',
        limit: '≥ 30% от общите възнаграждения (3.1)', severity: 'warn' },
      //  Субравило 3.1.3 — Външни членове
      { group: 'remuneration', id: 'salaries', label: 'Външни членове — извън ИУ-Варна (3.1.3): максимален дял',
        limit: '≤ 20% от общите възнаграждения (3.1)', severity: 'warn' },
      //  Правило 3.2 — Рецензент на монография
      { group: 'remuneration', id: 'reviews', label: 'Рецензент на монография (3.2)',
        limit: '≤ 250 € общо (или ≤ 100 € на рецензия)', severity: 'high' },
      //  Правило 3.3 — Рецензент на проект
      { group: 'remuneration', id: 'reviews', label: 'Рецензент на проект (3.3)',
        limit: '≤ 60 € (планиран само през последната година)', severity: 'high' },
      //  Правило 3.4 — Рецензент на годишен отчет
      { group: 'remuneration', id: 'reviews', label: 'Рецензент на годишен отчет (3.4)',
        limit: '≤ 25 € на брой отчет', severity: 'high' },

      // ── Раздел 4: УСЛУГИ ──
      //  Категория 4.1 — Компютърен набор и размножаване
      { group: 'services', id: 'external_services', label: 'Компютърен набор и размножаване (4.1)',
        limit: '≤ 5% от бюджета', severity: 'high' },
      //  Категория 4.2 — Превод
      { group: 'services', id: 'external_services', label: 'Превод на специализирана литература / публикации (4.2)',
        limit: 'без лимит', severity: 'info' },
      //  Категория 4.3 — Външни услуги
      { group: 'services', id: 'external_services', label: 'Външни услуги (4.3)',
        limit: '≤ 25% от бюджета', severity: 'high' },
      //  Категория 4.4.1 — Командировки в страната
      { group: 'services', id: 'travel', label: 'Командировки в страната + такси (4.4.1)',
        limit: '≤ 10% от бюджета (при наличие на научна публикация)', severity: 'high' },
      //  Категория 4.4.2 — Командировки в чужбина
      { group: 'services', id: 'travel', label: 'Командировки в чужбина + такси (4.4.2)',
        limit: '≤ 20% от бюджета (при наличие на научна публикация)', severity: 'high' },
      //  Категория 4.4.3 — Такси за публикуване
      { group: 'services', id: 'publications', label: 'Такси за публикуване Scopus / WoS (4.4.3)',
        limit: 'Принадлежност (Affiliation) ИУ-Варна', severity: 'info' },
      //  Категория 4.5 — Публикуване на монографичен труд
      { group: 'services', id: 'publications', label: 'Публикуване на монографичен труд (4.5)',
        limit: 'Без лимит (изд. „Наука и икономика")', severity: 'info' },
      //  Категория 4.6 — Емпирично изследване и апробиране
      { group: 'services', id: 'other', label: 'Емпирично изследване и апробиране (4.6)',
        limit: '≤ 20% от бюджета', severity: 'high' },
      //  Категория 4.7 — Регистрация на полезен модел
      { group: 'services', id: 'other', label: 'Регистрация на полезен модел (4.7)',
        limit: 'без лимит', severity: 'info' },

      // ── СПЕЦИФИЧНИ ПРАВИЛА ──
      { group: 'special', id: 'special', label: 'M1 (декември) — без разходи',
        limit: 'ЗАДЪЛЖИТЕЛНО: не се допускат разходи през първия месец', severity: 'high' },
      { group: 'special', id: 'special', label: 'Максимален бюджет за целия срок',
        limit: '≤ 12 000 €', severity: 'high' },
      { group: 'special', id: 'special', label: 'Самооценка (50%+1)',
        limit: '≥ 51 т. от 100 т.', severity: 'high' }
    ],
    'ПНИ': [
      // ── РАЗХОДИ ЗА ПРИДОБИВАНЕ НА ДМА И НДМА (Assets) ──
      { group: 'assets',       id: 'assets',        label: 'Компютърна техника и хардуер (1.1)', limit: 'само типове/бройки, които не са налични в ИУ-Варна', severity: 'info' },
      { group: 'assets',       id: 'assets',        label: 'Софтуер / специализирани програми (1.2)', limit: 'само типове/бройки, които не са налични в ИУ-Варна', severity: 'info' },
      // ── РАЗХОДИ ЗА МАТЕРИАЛИ (Materials) ──
      { group: 'materials',    id: 'literature',    label: 'Специализирана научна литература (2.1)', limit: '≤ 10% (първите 12 месеца)', severity: 'high' },
      { group: 'materials',    id: 'literature',    label: 'Информационни бази данни / абонаменти (2.2)', limit: '≤ 40% от бюджета', severity: 'high' },
      { group: 'materials',    id: 'consumables',   label: 'Канцеларски материали (2.3)', limit: '≤ 5% от бюджета', severity: 'high' },
      // ── РАЗХОДИ ЗА ВЪЗНАГРАЖДЕНИЯ (Remuneration) ──
      { group: 'remuneration', id: 'salaries',      label: 'Възнаграждения на екипа — общо (3.1) с докторанти/млади учени', limit: '≤ 35% от стойността на договора годишно', severity: 'high' },
      { group: 'remuneration', id: 'salaries',      label: 'Възнаграждения на екипа — общо (3.1) без докторанти/млади учени', limit: '≤ 10% от стойността на договора годишно', severity: 'high' },
      { group: 'remuneration', id: 'salaries',      label: 'Докторанти и млади учени (3.1.1)', limit: '≥ 30% от общите възнаграждения (3.1)', severity: 'high' },
      { group: 'remuneration', id: 'salaries',      label: 'Външни членове — извън ИУ-Варна (3.1.3)', limit: '≤ 20% от общите възнаграждения (3.1)', severity: 'high' },
      { group: 'remuneration', id: 'reviews',       label: 'Рецензент на проект (3.2)', limit: '≤ 60 € (планиран само през последната година)', severity: 'high' },
      { group: 'remuneration', id: 'reviews',       label: 'Рецензент на годишен отчет (3.3)', limit: '≤ 25 € на отчет', severity: 'high' },
      // ── РАЗХОДИ ЗА УСЛУГИ (Services) ──
      { group: 'services',     id: 'external_services', label: 'Компютърен набор и размножаване (4.1)', limit: '≤ 5% от бюджета', severity: 'high' },
      { group: 'services',     id: 'external_services', label: 'Превод на специализирана литература / публикации (4.2)', limit: 'без лимит', severity: 'info' },
      { group: 'services',     id: 'external_services', label: 'Външни услуги (4.3)', limit: '≤ 20% от бюджета (ПНИ лимит)', severity: 'high' },
      { group: 'services',     id: 'travel',        label: 'Командировки в страната + такси (4.4.1)', limit: '≤ 10% от бюджета (при наличие на научна публикация)', severity: 'high' },
      { group: 'services',     id: 'travel',        label: 'Командировки в чужбина + такси (4.4.2)', limit: '≤ 15% от бюджета (ПНИ лимит)', severity: 'high' },
      { group: 'services',     id: 'publications',  label: 'Такси за участие в конференции / изложения (4.4.3)', limit: 'без лимит', severity: 'info' },
      { group: 'services',     id: 'publications',  label: 'Такси за публикуване (Scopus / WoS) (4.4.4)', limit: 'Принадлежност (Affiliation) UE-Varna', severity: 'info' },
      { group: 'other',        id: 'other',         label: 'Емпирично изследване и апробиране (4.5)', limit: '≤ 25% от бюджета (ПНИ лимит)', severity: 'high' },
      { group: 'other',        id: 'other',         label: 'Регистрация на полезен модел (4.6)', limit: 'без лимит', severity: 'info' },
      // ── СПЕЦИФИЧНИ (Special) ──
      { group: 'special',      id: 'special',       label: 'M1 (Декември) — без разходи', limit: 'ЗАДЪЛЖИТЕЛНО: не се допускат разходи през първия месец', severity: 'high' },
      { group: 'special',      id: 'special',       label: 'Максимален бюджет за целия срок', limit: '≤ 12 000 €', severity: 'high' },
      { group: 'special',      id: 'special',       label: 'TRL изискване', limit: '≥ 4 (Technology Readiness Level)', severity: 'high' },
      { group: 'special',      id: 'special',       label: 'Самооценка', limit: '≥ 51 точки (50%+1)', severity: 'high' },
      // ═══ v9.37.0-regulatory: Reference rates (from ВАЖНО Актуална инфо за бюджета.docx) ═══
      { group: 'special',      id: 'special',       label: '📖 Монография (референтна цена 2026)', limit: '≈ 935 € за 20 бр. (диапазон 1000–1200 €)', severity: 'info' },
      { group: 'special',      id: 'special',       label: '🎤 Такси за конференции Scopus/WoS', limit: '300–700 € (проверете конкретната конференция)', severity: 'info' },
      { group: 'special',      id: 'special',       label: '✈️ Командировки (референтно)', limit: 'Транспорт + хотел + дневни (Наредба за командировки) + мед. застраховка', severity: 'info' }
    ],
    'ДНП': [
      // ── РАЗХОДИ ЗА МАТЕРИАЛИ (Materials) ──
      { group: 'materials',    id: 'literature',    label: 'Специализирана научна литература (1.1)', limit: 'без лимит', severity: 'info' },
      { group: 'materials',    id: 'literature',    label: 'Данни и информационни бази / абонаменти (1.2)', limit: 'без лимит', severity: 'info' },
      { group: 'materials',    id: 'consumables',   label: 'Канцеларски материали (1.3)', limit: '≤ 10% от бюджета (ДНП лимит — не 5% като ФНИ/ПНИ)', severity: 'high' },
      // ── РАЗХОДИ ЗА ВЪЗНАГРАЖДЕНИЯ (Remuneration) ──
      { group: 'remuneration', id: 'salaries',      label: 'Възнаграждения на екип (2.1)', limit: 'НЕ СЕ ДОПУСКАТ — ДНП не финансира заплати', severity: 'high' },
      { group: 'remuneration', id: 'reviews',       label: 'Рецензент на проект (2.2)', limit: '≤ 60 € (само последна година)', severity: 'high' },
      { group: 'remuneration', id: 'reviews',       label: 'Рецензент на годишен отчет (2.3)', limit: '≤ 25 € на отчет', severity: 'high' },
      // ── РАЗХОДИ ЗА УСЛУГИ (Services) ──
      { group: 'services',     id: 'external_services', label: 'Научна и стилова редакция, копирни услуги (3.1)', limit: 'без лимит', severity: 'info' },
      { group: 'services',     id: 'external_services', label: 'Оформление, подвързване и отпечатване на дисертационен труд (3.2)', limit: 'без лимит', severity: 'info' },
      { group: 'services',     id: 'external_services', label: 'Превод на публикации (3.3)', limit: 'без лимит', severity: 'info' },
      { group: 'services',     id: 'travel',        label: 'Командировки, свързани с изследването (3.4)', limit: 'без лимит (достатъчно за поне 2 в страната)', severity: 'info' },
      { group: 'services',     id: 'publications',  label: 'Такси за участие в конференции (3.5)', limit: 'без лимит', severity: 'info' },
      { group: 'services',     id: 'publications',  label: 'Такси за публикуване — Scopus / WoS (3.6)', limit: 'Принадлежност (Affiliation) UE-Varna', severity: 'info' },
      { group: 'services',     id: 'publications',  label: 'Такси за публикуване — отворен достъп, вторични бази (3.7)', limit: 'без лимит', severity: 'info' },
      // ── ВЪНШНИ УСЛУГИ (Без лимит, но с препоръка) ──
      { group: 'services',     id: 'external_services', label: 'Външни услуги — общо', limit: '≤ 30% от бюджета (препоръчително)', severity: 'warn' },
      // ── СПЕЦИФИЧНИ (Special) ──
      { group: 'special',      id: 'special',       label: 'Максимален бюджет за целия срок', limit: '≤ 5 000 €', severity: 'high' },
      { group: 'special',      id: 'special',       label: 'Срок на изпълнение', limit: '12 месеца (една година)', severity: 'high' },
      { group: 'special',      id: 'special',       label: 'Самооценка', limit: '≥ 51 точки (50%+1)', severity: 'high' }
    ],
    'НПФ': [
      // ── НПФ БЮДЖЕТНИ НИВА (Tiered Max Budget per regulation) ──
      { group: 'special',      id: 'special',       label: 'Катедрен форум — максимален бюджет', limit: '≤ 3 000 € (Конкурсна сесия 2026)', severity: 'high' },
      { group: 'special',      id: 'special',       label: 'Кръгла маса — максимален бюджет', limit: '≤ 2 500 € (Конкурсна сесия 2026)', severity: 'high' },
      { group: 'special',      id: 'special',       label: 'Университетски/национален форум — максимален бюджет', limit: '≤ 6 000 € (Конкурсна сесия 2026)', severity: 'high' },
      // ── ВИЗУАЛНА ИДЕНТИЧНОСТ (Visual Identity) ──
      { group: 'services',     id: 'external_services', label: 'Визуална идентичност на събитието (уеб, лого, брандинг)', limit: '≤ 15% от бюджета', severity: 'high' },
      { group: 'services',     id: 'external_services', label: 'Копиране / отпечатване на материали за форума', limit: 'вкл. в ≤ 15%', severity: 'info' },
      // ── ПОРТФОЛИО НА СЪБИТИЕТО (Event Portfolio) ──
      { group: 'other',        id: 'other',         label: 'Портфолио (папки, баджове, тефтери, химикали, сертификати)', limit: '≤ 30 лв/участник + ≤ 30% от бюджета', severity: 'high' },
      { group: 'other',        id: 'other',         label: 'Дизайн и отпечатване на покани, програми, плакати', limit: 'вкл. в портфолио ≤ 30%', severity: 'info' },
      // ── ГОСТ-ЛЕКТОР (Guest Lecturer) ──
      { group: 'remuneration', id: 'salaries',      label: 'Външен гост-лектор (keynote speaker / panelist)', limit: '≤ 1 000 лв (≈ 511 €)', severity: 'high' },
      // ── ТЕХНИЧЕСКО ОБСЛУЖВАНЕ (Technical Services) ──
      { group: 'services',     id: 'external_services', label: 'Техническо обслужване (озвучаване, видеозаснемане, превод)', limit: '≤ 15% от бюджета', severity: 'high' },
      { group: 'services',     id: 'external_services', label: 'Наем на зали и конферентно оборудване', limit: 'вкл. в ≤ 15%', severity: 'info' },
      // ── РЕКЛАМА И МЕДИИ (Advertising & Media) ──
      { group: 'other',        id: 'other',         label: 'Разпространение, реклама и медийно отразяване', limit: 'без лимит', severity: 'info' },
      // ── ПУБЛИКУВАНЕ НА СБОРНИК (Proceedings Publishing) ──
      { group: 'services',     id: 'publications',  label: 'Публикуване на сборник с доклади (книжно тяло)', limit: 'само в изд. „Наука и икономика"', severity: 'warn' },
      { group: 'services',     id: 'publications',  label: 'Дигитален вариант на сборник с доклади', limit: 'само в изд. „Наука и икономика"', severity: 'info' },
      { group: 'services',     id: 'publications',  label: 'Издаване на сборник — минимум 5 бр. на хартия', limit: 'ЗАДЪЛЖИТЕЛНО за университетско ниво', severity: 'high' },
      // ── DOI ИДЕНТИФИКАТОРИ (DOI Fees) ──
      { group: 'other',        id: 'other',         label: 'DOI идентификатори (2 лв/DOI + такса)', limit: '0-20 бр.=20 лв, 21-40=50 лв, 41-60=80 лв, >60=150 лв', severity: 'info' },
      // ── МЕТАДАННИ В БАЗИ ДАННИ (Metadata in Databases) ──
      { group: 'other',        id: 'other',         label: 'Метаданни в CEEOL, RePEC, DOAJ и др.', limit: '≤ 50 лв / база данни', severity: 'info' },
      { group: 'other',        id: 'other',         label: 'Метаданни в Български портал за отворена наука (BPOS)', limit: '≤ 50 лв / 20 публикации', severity: 'info' },
      // ── РЕЦЕНЗЕНТ (Reviewer) ──
      { group: 'remuneration', id: 'reviews',       label: 'Рецензент на форума (1 рецензент, назначен от ректора)', limit: '≤ 100 лв (≈ 51 €)', severity: 'high' },
      // ── ПРОДЪЛЖИТЕЛНОСТ ──
      { group: 'special',      id: 'special',       label: 'Срок на форума', limit: '1-3 месеца', severity: 'high' }
    ]
  };

  var SECTION_LABELS = {
    assets:       { icon: 'fa-server',        label: 'Дълготрайни активи',     color: 'var(--info)' },
    materials:    { icon: 'fa-cubes',          label: 'Материали',              color: 'var(--primary)' },
    remuneration: { icon: 'fa-user-tie',       label: 'Възнаграждения',         color: 'var(--gold)' },
    services:     { icon: 'fa-concierge-bell', label: 'Услуги',                 color: 'var(--ok)' },
    special:      { icon: 'fa-gavel',          label: 'Специфични правила',     color: 'var(--red)' },
    other:        { icon: 'fa-ellipsis-h',     label: 'Други',                  color: 'var(--ink-3)' }
  };

  var MEMBER_ROLES = [
    { id: 'leader',    bg: 'Ръководител' },
    { id: 'member',    bg: 'Член на екипа' },
    { id: 'young',     bg: 'Млад учен (до 35 г.)' },
    { id: 'doctoral',  bg: 'Докторант' },
    { id: 'external',  bg: 'Външен сътрудник' }
  ];

  function _api() {
    return (typeof api === 'function') ? api
         : (global.api || function () { return Promise.resolve({ success: false, error: 'api unavailable' }); });
  }
  function _toast(msg, type) { try { if (typeof toast === 'function') toast(msg, type || 'info'); } catch (_) {} }
  function _isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim()); }
  /* Display amounts in EUR (stored as BGN internally). Fixed rate 1 EUR = 1.95583 BGN. */
  var _EUR_BGN = (typeof EUR_BGN !== 'undefined') ? EUR_BGN : 1.95583;
  function _bgn(n) { var v = (Number(n) || 0) / _EUR_BGN; return v.toLocaleString('bg-BG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }

  /* ════════════════════════════════════════════════════════════════════
   *  BudgetCell — single editable budget amount (EUR display / BGN stored)
   *  v9.69.x fix (#8/#9): own local text state so typing works. The previous
   *  inline input derived its value from stored BGN → EUR → .toFixed(2) on
   *  every render, which reset the caret after the first digit, reformatted
   *  "5" → "5.00" (so further digits/deletes were lost) and broke the spinner
   *  on an empty cell. Local state shows exactly what the user types while
   *  focused, commits upward on every change, and normalises to 2 decimals
   *  only on blur (re-syncing from the committed/clamped stored value).
   * ════════════════════════════════════════════════════════════════════ */
  function BudgetCell(props) {
    var useRef = React.useRef;
    var eb = Number(props.eurBgn) || _EUR_BGN;
    var stored = Number(props.bgnStored) || 0;
    var storedEur = stored ? stored / eb : 0;
    var focusedRef = useRef(false);
    var st = useState(stored ? storedEur.toFixed(2) : '');
    var txt = st[0], setTxt = st[1];
    useEffect(function () {
      if (focusedRef.current) return;
      var cur = parseFloat(String(txt).replace(',', '.'));
      if (isNaN(cur)) cur = 0;
      if (Math.abs(cur - storedEur) > 0.005) {
        setTxt(stored ? storedEur.toFixed(2) : '');
      }
    }, [stored]); // eslint-disable-line react-hooks/exhaustive-deps
    function handleChange(ev) {
      var raw = ev.target.value;
      setTxt(raw);
      var num = parseFloat(String(raw).replace(',', '.'));
      if (isNaN(num)) num = 0;
      props.onCommit(num * eb);
    }
    function handleBlur(ev) {
      focusedRef.current = false;
      var extEur = (Number(props.bgnStored) || 0) / eb;
      setTxt(extEur > 0 ? extEur.toFixed(2) : '');
      if (typeof props.onBlur === 'function') props.onBlur(ev);
    }
    function handleFocus(ev) {
      focusedRef.current = true;
      if (typeof props.onFocus === 'function') props.onFocus(ev);
    }
    return e('input', {
      type: 'number', min: 0, step: '0.01', value: txt,
      disabled: props.disabled, readOnly: props.readOnly,
      onChange: props.readOnly ? null : handleChange,
      onFocus: handleFocus,
      onBlur: handleBlur,
      title: props.title,
      style: props.style,
      inputMode: 'decimal'
    });
  }

  /* ════════════════════════════════════════════════════════════════════
   *  TeamMembersEditor (UC-07)
   * ════════════════════════════════════════════════════════════════════ */
  function TeamMembersEditor(props) {
    var value        = Array.isArray(props.value) ? props.value : [];
    var onChange     = typeof props.onChange === 'function' ? props.onChange : function () {};
    var leaderEmail  = String(props.leaderEmail || '').toLowerCase().trim();
    var leaderName   = String(props.leaderName  || '');
    var projectCode  = String(props.projectCode  || '');
    var competitionId= String(props.competitionId|| '');
    var formId       = String(props.formId       || '');

    var s0 = useState({ name: '', email: '', role: 'member', internal: true, youngScientist: false, doctoral: false });
    var draft = s0[0]; var setDraft = s0[1];
    var c0 = useState({ checking: false, issues: [] });
    var check = c0[0]; var setCheck = c0[1];
    var j0 = useState(null); var justAddedIdx = j0[0]; var setJustAddedIdx = j0[1];
    var a0 = useState(false); var addedFeedback = a0[0]; var setAddedFeedback = a0[1];

    var memberEmails = useMemo(function () {
      return value.map(function (m) { return String(m.email || '').toLowerCase().trim(); }).filter(Boolean);
    }, [value]);

    /* Clear just-added highlight after animation */
    useEffect(function () {
      if (justAddedIdx !== null) {
        var t = setTimeout(function () { setJustAddedIdx(null); }, 1500);
        return function () { clearTimeout(t); };
      }
    }, [justAddedIdx]);

    /* Debounced cross-project eligibility check (R.7 / R.8) */
    useEffect(function () {
      if (!projectCode || !leaderEmail) return;
      if (projectCode !== 'ФНИ' && projectCode !== 'ПНИ') return;
      var cancelled = false;
      var t = setTimeout(function () {
        setCheck(function (p) { return Object.assign({}, p, { checking: true }); });
        _api()('checkeligibility', {
          leaderEmail: leaderEmail,
          memberEmails: memberEmails,
          projectCode: projectCode,
          competitionId: competitionId,
          formId: formId,
          userId: leaderEmail
        }).then(function (r) {
          if (cancelled) return;
          setCheck({ checking: false, issues: (r && r.issues) || [] });
        }).catch(function () { if (!cancelled) setCheck({ checking: false, issues: [] }); });
      }, 600);
      return function () { cancelled = true; clearTimeout(t); };
    }, [leaderEmail, projectCode, competitionId, formId, memberEmails.join('|')]);

    var addMember = function () {
      var em = String(draft.email || '').toLowerCase().trim();
      if (!_isEmail(em)) { _toast('Невалиден имейл', 'error'); return; }
      if (em === leaderEmail) { _toast('Ръководителят се добавя автоматично', 'warn'); return; }
      if (memberEmails.indexOf(em) >= 0) { _toast('Този член вече е добавен', 'warn'); return; }
      if (!String(draft.name || '').trim()) { _toast('Въведете име', 'error'); return; }
      var next = value.concat([{
        name: draft.name.trim(), email: em, role: draft.role,
        internal: !!draft.internal, youngScientist: !!draft.youngScientist, doctoral: !!draft.doctoral
      }]);
      onChange(next);
      setJustAddedIdx(value.length);
      setAddedFeedback(true);
      setTimeout(function () { setAddedFeedback(false); }, 1200);
      setDraft({ name: '', email: '', role: 'member', internal: true, youngScientist: false, doctoral: false });
    };
    var removeMember = function (idx) {
      var next = value.slice(); next.splice(idx, 1); onChange(next);
    };
    var updateMember = function (idx, patch) {
      var next = value.slice(); next[idx] = Object.assign({}, next[idx], patch); onChange(next);
    };

    var leaderIssues = (check.issues || []).filter(function (i) { return !i.member; });
    var memberIssueByEmail = {};
    (check.issues || []).forEach(function (i) { if (i.member) memberIssueByEmail[String(i.member).toLowerCase()] = i; });

    return e('div', { className: 'card', style: { marginBottom: '.85rem' } },
      e('div', { className: 'card-header' },
        e('div', { className: 'card-title' },
          e('i', { className: 'fas fa-users', style: { marginRight: '.4rem', color: 'var(--primary)' } }),
          'Екип на проекта'),
        e('span', { style: { fontSize: '.7rem', color: 'var(--ink-3)' } },
          (value.length + 1) + (value.length === 0 ? ' член' : ' члена'))
      ),
      e('div', { className: 'card-body' },
        /* Leader row */
        e('div', { style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '.5rem .7rem', marginBottom: '.5rem' } },
          e('div', { style: { fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--ink-3)', letterSpacing: '.04em', marginBottom: '.2rem' } },
            'Ръководител'),
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' } },
            e('strong', null, leaderName || leaderEmail || '—'),
            leaderEmail && e('span', { style: { fontSize: '.74rem', color: 'var(--ink-3)' } }, leaderEmail),
            check.checking && e('span', { style: { fontSize: '.72rem', color: 'var(--ink-3)' } },
              e('i', { className: 'fas fa-spinner fa-spin' }), ' проверка R.7/R.8…')
          )
        ),
        /* Members table */
        value.length > 0 && e('div', { style: { overflowX: 'auto', marginBottom: '.6rem' } },
          e('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' } },
            e('thead', null,
              e('tr', { style: { background: 'var(--surface)' } },
                e('th', { style: { padding: '.4rem .5rem', textAlign: 'left', fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--ink-3)' } }, 'Име'),
                e('th', { style: { padding: '.4rem .5rem', textAlign: 'left', fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--ink-3)' } }, 'Имейл'),
                e('th', { style: { padding: '.4rem .5rem', textAlign: 'left', fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--ink-3)' } }, 'Роля'),
                e('th', { style: { padding: '.4rem .5rem' } }))),
            e('tbody', null, value.map(function (m, idx) {
              var iss = memberIssueByEmail[String(m.email || '').toLowerCase()];
              var isJustAdded = idx === justAddedIdx;
              return e('tr', { key: idx, style: { borderTop: '1px solid var(--border)', background: isJustAdded ? 'var(--ok-bg)' : 'transparent', transition: 'background .8s ease' } },
                e('td', { style: { padding: '.4rem .5rem' } }, m.name),
                e('td', { style: { padding: '.4rem .5rem', color: 'var(--ink-3)' } },
                  m.email),
                e('td', { style: { padding: '.4rem .5rem' } },
                  e('select', { value: m.role || 'member', onChange: function (ev) { updateMember(idx, { role: ev.target.value }); },
                    style: { padding: '.2rem .35rem', fontSize: '.74rem', border: '1px solid var(--border)', borderRadius: 4 } },
                    MEMBER_ROLES.filter(function (r) { return r.id !== 'leader'; })
                      .map(function (r) { return e('option', { key: r.id, value: r.id }, r.bg); }))),
                e('td', { style: { padding: '.4rem .5rem', textAlign: 'right' } },
                  e('button', { type: 'button', className: 'btn btn-ghost btn-sm',
                    title: 'Премахни', onClick: function () { removeMember(idx); } },
                    e('i', { className: 'fas fa-times' })))
              );
            }))
          )
        ),
        /* Add-member row */
        e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'end' } },
          e('div', { style: { flex: '1 1 130px', minWidth: 110 } },
            e('label', { style: { fontSize: '.7rem', color: 'var(--ink-3)' } }, 'Име'),
            e('input', { value: draft.name, onChange: function (ev) { setDraft(Object.assign({}, draft, { name: ev.target.value })); },
              placeholder: 'Иван Иванов',
              style: { width: '100%', padding: '.35rem .55rem', fontSize: '.8rem', border: '1px solid var(--border)', borderRadius: 4 } })),
          e('div', { style: { flex: '1 1 150px', minWidth: 130 } },
            e('label', { style: { fontSize: '.7rem', color: 'var(--ink-3)' } }, 'Имейл'),
            e('input', { type: 'email', value: draft.email, onChange: function (ev) { setDraft(Object.assign({}, draft, { email: ev.target.value })); },
              placeholder: 'i.ivanov@ue-varna.bg',
              style: { width: '100%', padding: '.35rem .55rem', fontSize: '.8rem', border: '1px solid var(--border)', borderRadius: 4 } })),
          e('div', { style: { flex: '1 1 120px', minWidth: 100 } },
            e('label', { style: { fontSize: '.7rem', color: 'var(--ink-3)' } }, 'Роля'),
            e('select', { value: draft.role, onChange: function (ev) { setDraft(Object.assign({}, draft, { role: ev.target.value })); },
              style: { width: '100%', padding: '.35rem .55rem', fontSize: '.8rem', border: '1px solid var(--border)', borderRadius: 4 } },
              MEMBER_ROLES.filter(function (r) { return r.id !== 'leader'; })
                .map(function (r) { return e('option', { key: r.id, value: r.id }, r.bg); }))),
          e('label', { title: 'Вътрешен', style: { fontSize: '.72rem', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', transition: 'transform .15s ease', userSelect: 'none', flex: '0 0 auto' } },
            e('input', { type: 'checkbox', checked: draft.internal, onChange: function (ev) { setDraft(Object.assign({}, draft, { internal: ev.target.checked })); }, style: { cursor: 'pointer', accentColor: draft.internal ? 'var(--primary)' : 'var(--ink-4)' } })),
          e('label', { title: 'Млад учен (до 35 г.)', style: { fontSize: '.72rem', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', transition: 'transform .15s ease', userSelect: 'none', flex: '0 0 auto' } },
            e('input', { type: 'checkbox', checked: draft.youngScientist, onChange: function (ev) { setDraft(Object.assign({}, draft, { youngScientist: ev.target.checked })); }, style: { cursor: 'pointer', accentColor: draft.youngScientist ? 'var(--ok)' : 'var(--ink-4)' } })),
          e('label', { title: 'Докторант', style: { fontSize: '.72rem', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', transition: 'transform .15s ease', userSelect: 'none', flex: '0 0 auto' } },
            e('input', { type: 'checkbox', checked: draft.doctoral, onChange: function (ev) { setDraft(Object.assign({}, draft, { doctoral: ev.target.checked })); }, style: { cursor: 'pointer', accentColor: draft.doctoral ? 'var(--gold)' : 'var(--ink-4)' } })),
          e('button', { type: 'button', className: 'btn btn-primary btn-sm', onClick: addMember,
            style: { whiteSpace: 'nowrap', transition: 'all .2s ease', flex: '0 0 auto' } },
            addedFeedback ? e(Fragment, null, e('i', { className: 'fas fa-check', style: { animation: 'popIn .3s ease' } }), ' Добавен')
                          : e(Fragment, null, e('i', { className: 'fas fa-plus' }), ' Добави'))
        ),
        e('div', { style: { fontSize: '.7rem', color: 'var(--ink-4)', marginTop: '.5rem' } },
          'R.7: ръководителят може да води само 1 активен проект във ФНИ/ПНИ. ',
          'R.8: член може да участва в най-много 2 активни проекта.'),
        e('div', { style: { fontSize: '.7rem', color: 'var(--ink-3)', marginTop: '.3rem', fontStyle: 'italic', lineHeight: 1.45 } },
          (typeof YOUNG_SCIENTIST_DEFINITION !== 'undefined' ? YOUNG_SCIENTIST_DEFINITION : '„Млад учен" — лице до 10 г. след магистърска степен.'))
      )
    );
  }

  /* ════════════════════════════════════════════════════════════════════
   *  BudgetEditor (UC-06) — v6.9.0 Modern UX
   *  ==================================================================
   *  FEATURES:
   *    • Sectioned view (Assets / Materials / Remuneration / Services)
   *      mirroring the regulatory budget template (dataflow.md §2).
   *    • Per-category percentage limits shown as progress bars with
   *      color-coded warnings (green=ok, yellow=approaching, red=over).
   *    • Live rules panel for the selected project type — every rule
   *      from dataflow.md §2 is displayed with limit and severity.
   *    • Yearly + Monthly toggle (M1–M36) with smooth transition.
   *    • Total summary bar with max-budget comparison.
   *    • All validation is re-executed on the backend at submitForm.
   * ════════════════════════════════════════════════════════════════════ */
  function BudgetEditor(props) {
    // ── budgetViolations passed for inline enforcement (see repo memory) ──
    var budgetViolations = Array.isArray(props.budgetViolations) ? props.budgetViolations : [];
    var value      = (props.value && typeof props.value === 'object' && !Array.isArray(props.value)) ? props.value : {};
    var onChange   = typeof props.onChange === 'function' ? props.onChange : function () {};
    var readOnly   = !!props.readOnly;
    var months     = Math.max(1, Math.min(60, Number(props.durationMonths) || 12));
    var startYear  = Number(props.startYear) || (new Date()).getFullYear();
    var nYears     = Math.max(1, Math.ceil(months / 12));
    var years      = []; for (var y = 0; y < nYears; y++) years.push(String(startYear + y));
    var projectCode = String(props.projectCode || '').trim().toUpperCase();
    // ── Budget rule violations from parent (reactive, from _computeBudgetViolations) ──
    var budgetViolations = Array.isArray(props.budgetViolations) ? props.budgetViolations : [];

    /* ── Filter cost groups per project-type budget structure ── */
    var activeGroups = COST_GROUPS;
    if (projectCode && typeof PROJECT_TYPES !== 'undefined') {
      var pt = PROJECT_TYPES.find(function (p) { return p.value === projectCode; });
      // v9.37.0-regulatory: use budgetCategories (detailed, per regulation) with
      // fallback to legacy budgetStructure for backward compatibility
      var categorySource = (pt && Array.isArray(pt.budgetCategories) && pt.budgetCategories.length)
        ? pt.budgetCategories
        : (pt && Array.isArray(pt.budgetStructure) ? pt.budgetStructure : null);
      if (categorySource) {
        var allowedIds = categorySource;
        activeGroups = COST_GROUPS.filter(function (g) { return allowedIds.indexOf(g.id) !== -1; });
      }
    }
    var hasSalaries = activeGroups.some(function (g) { return g.id === 'salaries'; });

    var showMonthly = value && value._monthlyMode;
    var maxBudget   = Number(props.totalBudget) || 0;
    var rules       = BUDGET_RULES_BY_TYPE[projectCode] || [];

    // Monthly labels
    var monthLabels = [];
    for (var m = 1; m <= Math.min(months, 36); m++) monthLabels.push('M' + m);

    // Section ordering for display
    var SECTION_ORDER = ['assets', 'materials', 'remuneration', 'services', 'other'];

    /* ── Cell helpers ── */
    // Compute the grand total EXCLUDING the cell being edited, so we know
    // how much budget room remains for this specific cell.
    var _grandExcluding = function (group, year, isMonthly, monthKey) {
      var total = 0;
      Object.keys(value || {}).forEach(function (gid) {
        if (gid === '_monthlyMode' || gid === '_monthly') return;
        if (isMonthly) {
          // For monthly mode, compute from _monthly sub-object
          return; // monthly mode is computed separately below
        }
        var byYear = value[gid] || {};
        Object.keys(byYear).forEach(function (yr) {
          if (gid === group && yr === year) return; // skip the cell being edited
          total += Number(byYear[yr]) || 0;
        });
      });
      // Include monthly mode contributions (excluding the edited cell)
      var mData = (value._monthly) || {};
      Object.keys(mData).forEach(function (mgid) {
        var mbyPeriod = mData[mgid] || {};
        Object.keys(mbyPeriod).forEach(function (mk) {
          if (isMonthly && mgid === group && mk === monthKey) return; // skip edited cell
          total += Number(mbyPeriod[mk]) || 0;
        });
      });
      return total;
    };
    var _maxBudgetBGN = maxBudget * _EUR_BGN;
    var setCell = function (group, year, bgnValue) {
      var n = Number(String(bgnValue).replace(',', '.')) || 0;
      // v9.37.0-regulatory: minimum threshold — values below 1 BGN are treated as 0
      if (n > 0 && n < 1) n = 0;
      // ── ENFORCE max budget: clamp the new value so grand total never exceeds the limit ──
      if (_maxBudgetBGN > 0) {
        var existingExcluding = _grandExcluding(group, year, false, null);
        var maxAllowed = _maxBudgetBGN - existingExcluding;
        if (n > maxAllowed) n = Math.max(0, maxAllowed);
      }
      var nextGroup = Object.assign({}, value[group] || {});
      if (n > 0) nextGroup[year] = n; else delete nextGroup[year];
      var next = Object.assign({}, value);
      if (Object.keys(nextGroup).length) next[group] = nextGroup; else delete next[group];
      onChange(next);
    };
    var setMonthlyCell = function (group, monthKey, bgnValue) {
      var n = Number(String(bgnValue).replace(',', '.')) || 0;
      // v9.37.0-regulatory: minimum threshold — values below 1 BGN are treated as 0
      if (n > 0 && n < 1) n = 0;
      // ── ENFORCE max budget: clamp the new value so grand total never exceeds the limit ──
      if (_maxBudgetBGN > 0) {
        var existingExcluding = _grandExcluding(group, monthKey, true, monthKey);
        var maxAllowed = _maxBudgetBGN - existingExcluding;
        if (n > maxAllowed) n = Math.max(0, maxAllowed);
      }
      var monthly = value._monthly || {};
      var nextGroup = Object.assign({}, monthly[group] || {});
      if (n > 0) nextGroup[monthKey] = n; else delete nextGroup[monthKey];
      var nextMonthly = Object.assign({}, monthly);
      if (Object.keys(nextGroup).length) nextMonthly[group] = nextGroup; else delete nextMonthly[group];
      var next = Object.assign({}, value);
      next._monthly = nextMonthly;
      onChange(next);
    };
    var toggleMonthly = function () {
      var next = Object.assign({}, value);
      next._monthlyMode = !next._monthlyMode;
      if (next._monthlyMode && !next._monthly) next._monthly = {};
      onChange(next);
    };

    /* ── Compute totals ── */
    var rowTotals = {}, yearTotals = {}, grand = 0;
    activeGroups.forEach(function (g) { rowTotals[g.id] = 0; });
    years.forEach(function (yr) { yearTotals[yr] = 0; });
    Object.keys(value || {}).forEach(function (gid) {
      if (gid === '_monthlyMode' || gid === '_monthly') return;
      var byYear = value[gid] || {};
      Object.keys(byYear).forEach(function (yr) {
        var v = Number(byYear[yr]) || 0;
        rowTotals[gid] = (rowTotals[gid] || 0) + v;
        yearTotals[yr] = (yearTotals[yr] || 0) + v;
        grand += v;
      });
    });

    /* ── Per-section percentage computation ── */
    var pctOfTotal = function (amount) { return grand > 0 ? (amount / grand) * 100 : 0; };
    var pctWarnColor = function (pct, maxPct) {
      if (maxPct <= 0) return 'var(--ink-3)';
      var ratio = pct / maxPct;
      if (ratio >= 1.0) return 'var(--err)';
      if (ratio >= 0.85) return 'var(--warn)';
      return 'var(--ok)';
    };
    var pctBarColor = function (pct, maxPct) {
      if (maxPct <= 0) return 'var(--border)';
      var ratio = pct / maxPct;
      if (ratio >= 1.0) return 'var(--err)';
      if (ratio >= 0.85) return 'var(--warn)';
      return 'var(--ok)';
    };

    // 20% external_services rule
    var sal = rowTotals.salaries || 0;
    var ext = rowTotals.external_services || 0;
    var extCap = sal * 0.20;
    var extOver = ext > extCap + 0.005;
    var extPct = sal > 0 ? (ext / sal) * 100 : 0;

    /* ── Build section data ── */
    var sectionData = {};
    SECTION_ORDER.forEach(function (sec) {
      var groups = activeGroups.filter(function (g) { return g.section === sec; });
      var secTotal = 0;
      var secItems = groups.map(function (g) {
        var amt = rowTotals[g.id] || 0;
        secTotal += amt;
        return { id: g.id, label: g.bg, amount: amt, pct: pctOfTotal(amt) };
      });
      sectionData[sec] = { total: secTotal, items: secItems };
    });

    /* ── Render section input row ── */
    var renderRow = function (g, isMonthly) {
      var rt = rowTotals[g.id] || 0;
      var pct = pctOfTotal(rt);
      var limit = rules.filter(function(r) { return r.group === g.section || r.group === g.id; });
      var maxPct = 0;
      limit.forEach(function(l) {
        var m = parseFloat(l.limit);
        if (!isNaN(m) && l.limit.indexOf('%') > 0 && m > maxPct) maxPct = m;
      });
      // ── Match budget violations to this cost group for inline enforcement ──
      var rowViolations = budgetViolations.filter(function(v) { return v.group === g.id; });
      var hasHighViol = rowViolations.some(function(v) { return v.severity === 'high'; });
      var hasWarnViol = rowViolations.some(function(v) { return v.severity === 'warn'; });
      var rowViolStyle = hasHighViol ? { borderLeft:'3px solid var(--err)', background:'var(--err-fog, rgba(139,21,21,.03))' }
        : hasWarnViol ? { borderLeft:'3px solid var(--warn)', background:'var(--warn-bg)' } : {};
      var warnColor = hasHighViol ? 'var(--err)' : hasWarnViol ? 'var(--warn)' : pctWarnColor(pct, maxPct);
      var barColor  = hasHighViol ? 'var(--err)' : hasWarnViol ? 'var(--warn)' : pctBarColor(pct, maxPct);

      return e('tr', { key: g.id, style: Object.assign({ borderTop: '1px solid var(--border)', transition: 'background .2s' }, rowViolStyle),
        onMouseEnter: function(e) { e.currentTarget.style.background = hasHighViol ? 'rgba(139,21,21,.05)' : 'var(--surface)'; },
        onMouseLeave: function(e) { e.currentTarget.style.background = hasHighViol ? 'var(--err-fog, rgba(139,21,21,.03))' : ''; } },
        /* Name + rule badge */
        e('td', { style: { padding: '.35rem .55rem', position: 'relative' } },
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap' } },
            e('span', { style: { fontWeight: 500, fontSize: '.8rem', color: (g.id === 'external_services' && extOver) || hasHighViol ? 'var(--err)' : hasWarnViol ? 'var(--warn)' : 'var(--ink)' } }, g.bg),
            rowViolations.length > 0 && e('span', {
              style: {
                fontSize: '.58rem', fontWeight: 700, padding: '.08rem .4rem', borderRadius: 10,
                background: hasHighViol ? 'var(--err-bg)' : 'var(--warn-bg)',
                color: hasHighViol ? 'var(--err)' : 'var(--warn)',
                border: '1px solid ' + (hasHighViol ? 'var(--err)' : 'var(--warn)'), whiteSpace: 'nowrap', cursor: 'help'
              },
              title: rowViolations.map(function(v) { return v.message; }).join(' | ')
            }, '⚠ ' + (hasHighViol ? 'Нарушение' : 'Предупреждение')),
            maxPct > 0 && e('span', {
              style: {
                fontSize: '.6rem', fontWeight: 700, padding: '.1rem .4rem', borderRadius: 10,
                background: barColor === 'var(--err)' ? 'var(--err-bg)' : barColor === 'var(--warn)' ? 'var(--warn-bg)' : 'var(--ok-bg)',
                color: barColor, border: '1px solid ' + barColor, whiteSpace: 'nowrap'
              }
            }, '≤ ' + maxPct + '%'),
            // Percentage bar
            maxPct > 0 && e('div', { style: { width: 50, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 } },
              e('div', { style: { height: '100%', width: Math.min(pct / maxPct * 100, 100) + '%', background: barColor, borderRadius: 2, transition: 'width .3s ease' } })
            )
          ),
          /* Percentage text */
          maxPct > 0 && e('div', { style: { fontSize: '.64rem', color: warnColor, marginTop: '.1rem' } },
            pct.toFixed(1) + '% от бюджета (макс. ' + maxPct + '%)')
        ),
        /* Yearly/monthly inputs */
        (isMonthly ? monthLabels : years).map(function (period) {
          var stored;
          if (isMonthly) {
            var mData = (value._monthly && value._monthly[g.id]) || {};
            stored = Number(mData[period] || 0);
          } else {
            stored = Number(((value[g.id] || {})[period]) || 0);
          }
          return e('td', { key: period, style: { padding: '.2rem .3rem', textAlign: 'right' } },
            e(BudgetCell, {
              bgnStored: stored,
              eurBgn: _EUR_BGN,
              disabled: readOnly, readOnly: readOnly,
              onCommit: function (bgn) {
                if (isMonthly) setMonthlyCell(g.id, period, bgn);
                else setCell(g.id, period, bgn);
              },
              title: (isMonthly ? period : period) + ' · €' + (readOnly ? ' (само за преглед)' : ' (мин. 0.51 €)'),
              style: {
                width: isMonthly ? 50 : 90, padding: '.2rem .35rem', fontSize: isMonthly ? '.65rem' : '.76rem',
                border: '1px solid var(--border)', borderRadius: 4, textAlign: 'right',
                background: readOnly ? 'var(--surface)' : 'var(--bg)', transition: 'border-color .2s, box-shadow .2s',
                outline: 'none', cursor: readOnly ? 'default' : 'text'
              },
              onFocus: readOnly ? null : function(ev) { ev.target.style.borderColor = 'var(--primary)'; ev.target.style.boxShadow = '0 0 0 2px var(--primary-dim)'; },
              onBlur: readOnly ? null : function(ev) { ev.target.style.borderColor = 'var(--border)'; ev.target.style.boxShadow = 'none'; }
            })
          );
        }),
        /* Row total */
        e('td', { style: { padding: '.35rem .55rem', textAlign: 'right', fontWeight: 600, fontSize: '.78rem', color: warnColor } },
          _bgn(rt))
      );
    };

    /* ── Render a section header ── */
    var renderSection = function (sec) {
      var info = SECTION_LABELS[sec] || { icon: 'fa-circle', label: sec, color: 'var(--ink-3)' };
      var secData = sectionData[sec] || { total: 0, items: [] };
      if (secData.items.length === 0) return null;
      // Check section-level rules
      var secRules = rules.filter(function(r) { return r.group === sec; });

      return e(Fragment, { key: sec },
        /* Section header row */
        e('tr', { style: { background: 'var(--surface)', borderBottom: '2px solid ' + info.color } },
          e('td', { colSpan: (showMonthly ? monthLabels.length : years.length) + 2, style: { padding: '.45rem .55rem' } },
            e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' } },
              e('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontWeight: 700, fontSize: '.82rem', color: info.color } },
                e('i', { className: 'fas ' + info.icon, style: { fontSize: '.7rem' } }),
                info.label),
              secRules.length > 0 && e('span', { style: { fontSize: '.7rem', color: 'var(--ink-3)', fontStyle: 'italic' } },
                secRules.map(function(r) { return r.label + ' ' + r.limit; }).join(' · ')),
              e('span', { style: { marginLeft: 'auto', fontWeight: 600, fontSize: '.78rem', color: 'var(--ink)' } },
                'Общо: ', _bgn(secData.total))
            )
          )
        ),
        /* Section rows */
        secData.items.map(function(item) {
          var g = activeGroups.find(function(cg) { return cg.id === item.id; });
          return g ? renderRow(g, showMonthly) : null;
        })
      );
    };

    /* ── Rules panel component ── */
    var renderRulesPanel = function () {
      if (!projectCode || rules.length === 0) return null;
      var groupedRules = {};
      rules.forEach(function(r) {
        if (!groupedRules[r.group]) groupedRules[r.group] = [];
        groupedRules[r.group].push(r);
      });

      return e('div', { style: { marginTop: '1rem', padding: '.75rem .85rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' } },
        e('div', { style: { display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.5rem', fontWeight: 700, fontSize: '.78rem', color: 'var(--ink)' } },
          e('i', { className: 'fas fa-book-open', style: { color: 'var(--primary)', fontSize: '.7rem' } }),
          'Приложими правила за ', projectCode),
        Object.keys(groupedRules).map(function (sec) {
          var secInfo = SECTION_LABELS[sec] || { icon: 'fa-circle', label: sec, color: 'var(--ink-3)' };
          return e('div', { key: sec, style: { marginBottom: '.35rem' } },
            e('div', { style: { display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.7rem', fontWeight: 600, color: secInfo.color, marginBottom: '.15rem' } },
              e('i', { className: 'fas ' + secInfo.icon, style: { fontSize: '.6rem' } }),
              secInfo.label),
            groupedRules[sec].map(function(rule, ri) {
              var sevColor = rule.severity === 'high' ? 'var(--err)' : rule.severity === 'warn' ? 'var(--warn)' : rule.severity === 'ok' ? 'var(--ok)' : 'var(--info)';
              return e('div', { key: ri, style: { display: 'flex', alignItems: 'center', gap: '.35rem', padding: '.15rem .3rem .15rem 1.2rem', fontSize: '.72rem', color: 'var(--ink-2)' } },
                e('i', { className: 'fas fa-circle', style: { fontSize: '.35rem', color: sevColor, flexShrink: 0 } }),
                e('span', { style: { flex: 1 } }, rule.label),
                e('span', { style: { fontWeight: 600, color: sevColor, whiteSpace: 'nowrap' } }, rule.limit)
              );
            })
          );
        })
      );
    };

    /* ── Main render ── */
    var budgetPct = maxBudget > 0 ? (grand / (maxBudget * _EUR_BGN)) * 100 : 0;
    var budgetOver = maxBudget > 0 && grand > maxBudget * _EUR_BGN + 0.005;
    var budgetNearLimit = !budgetOver && maxBudget > 0 && budgetPct >= 85;
    var remainingBGN = _maxBudgetBGN - grand;
    var remainingEUR = maxBudget > 0 ? (remainingBGN / _EUR_BGN) : 0;

    /* ── Section colours (palette matching the reference UI) ── */
    var SECTION_COLORS = {
      assets:       '#20c997',  // teal
      materials:    '#4263eb',  // blue
      remuneration: '#f59f00',  // amber
      services:     '#e64980',  // pink
      other:        '#ae3ec9'   // violet
    };
    /* Per-section totals as EUR for the donut */
    var sectionEUR = {};
    var grandEUR = grand / _EUR_BGN;
    SECTION_ORDER.forEach(function(sec) {
      var secDat = sectionData[sec] || { total: 0 };
      sectionEUR[sec] = secDat.total / _EUR_BGN;
    });

    /* ── SVG Donut chart (pure React, no lib) ── */
    var DonutChart = function() {
      var R = 68, cx = 84, cy = 84, stroke = 22;
      var circumference = 2 * Math.PI * R;
      var segments = [];
      var offset = 0;
      /* rotate to start at top (-90 deg = -circumference/4 offset) */
      var startOffset = circumference * 0.25;
      var total = grandEUR;
      if (total <= 0) {
        /* empty ring */
        return e('svg', { width: 168, height: 168, viewBox: '0 0 168 168', style: { display: 'block' } },
          e('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: 'var(--border)', strokeWidth: stroke }),
          e('text', { x: cx, y: cy - 8, textAnchor: 'middle', fontSize: 11, fill: 'var(--ink-4)', fontFamily: 'inherit' }, 'Не е'),
          e('text', { x: cx, y: cy + 6, textAnchor: 'middle', fontSize: 11, fill: 'var(--ink-4)', fontFamily: 'inherit' }, 'попълнен'),
          e('text', { x: cx, y: cy + 20, textAnchor: 'middle', fontSize: 10, fill: 'var(--ink-4)', fontFamily: 'inherit' }, 'бюджет')
        );
      }
      SECTION_ORDER.forEach(function(sec) {
        var v = sectionEUR[sec] || 0;
        if (v <= 0) return;
        var pct = v / total;
        var dash = pct * circumference;
        segments.push({ sec: sec, dash: dash, offset: startOffset + (circumference - offset * circumference / total) });
        /* Accumulate offset in original units */
        offset += v;
      });
      /* re-compute using cumulative arc */
      var cum = 0;
      var arcs = SECTION_ORDER.map(function(sec) {
        var v = sectionEUR[sec] || 0;
        if (v <= 0) return null;
        var pct = v / total;
        var dash = pct * circumference;
        var gap  = circumference - dash;
        var ao   = -(cum / total) * circumference + startOffset;
        cum += v;
        return e('circle', {
          key: sec,
          cx: cx, cy: cy, r: R,
          fill: 'none',
          stroke: SECTION_COLORS[sec] || '#888',
          strokeWidth: stroke,
          strokeDasharray: dash + ' ' + gap,
          strokeDashoffset: ao,
          style: { transition: 'stroke-dasharray .5s ease' }
        });
      }).filter(Boolean);

      var totalStr = grandEUR.toLocaleString('bg-BG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
      var maxStr   = maxBudget > 0 ? maxBudget.toLocaleString('bg-BG', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : null;

      return e('svg', { width: 168, height: 168, viewBox: '0 0 168 168', style: { display: 'block', flexShrink: 0, filter: budgetOver ? 'drop-shadow(0 0 6px rgba(220,38,38,.45))' : 'none' } },
        /* background ring */
        e('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: 'var(--border)', strokeWidth: stroke }),
        arcs,
        /* center text */
        e('text', { x: cx, y: cy - 16, textAnchor: 'middle', fontSize: 9, fill: 'var(--ink-4)', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '.5' }, 'БЮДЖЕТ'),
        e('text', { x: cx, y: cy + 3, textAnchor: 'middle', fontSize: grandEUR >= 10000 ? 14 : 16, fontWeight: '800', fill: budgetOver ? '#c0392b' : budgetNearLimit ? '#e67e22' : 'var(--ink)', fontFamily: 'inherit' },
          totalStr + ' €'),
        maxStr && e('text', { x: cx, y: cy + 18, textAnchor: 'middle', fontSize: 9, fill: 'var(--ink-4)', fontFamily: 'inherit' }, 'от ' + maxStr + ' €'),
        /* progress arc label */
        maxBudget > 0 && e('text', { x: cx, y: cy + 32, textAnchor: 'middle', fontSize: 9, fontWeight: '700',
          fill: budgetOver ? '#c0392b' : budgetPct >= 85 ? '#e67e22' : '#20c997', fontFamily: 'inherit' },
          budgetPct.toFixed(0) + '%')
      );
    };

    /* ── Summary KPI cards (bottom row, like "Mortgage estimates") ── */
    var KpiCard = function(props) {
      return e('div', { style: { flex: '1 1 120px', minWidth: 100, padding: '.6rem .8rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: '.15rem', position: 'relative', overflow: 'hidden' } },
        props.accent && e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: props.accent, borderRadius: '10px 10px 0 0' } }),
        e('div', { style: { fontSize: '.62rem', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 } }, props.label),
        e('div', { style: { fontSize: props.large ? '1.15rem' : '.95rem', fontWeight: 800, color: props.valueColor || 'var(--ink)', fontFamily: "'Merriweather',Georgia,serif", lineHeight: 1.1 } }, props.value),
        props.sub && e('div', { style: { fontSize: '.65rem', color: 'var(--ink-3)', marginTop: '.05rem' } }, props.sub)
      );
    };

    /* Per-year breakdown chips */
    var yearBreakdowns = years.map(function(yr) {
      var yrEUR = (yearTotals[yr] || 0) / _EUR_BGN;
      return { yr: yr, eur: yrEUR };
    });

    return e('div', { className: 'card', style: { marginBottom: '.85rem', overflow: 'hidden' } },
      /* ── OVER-LIMIT TOP BANNER ── */
      budgetOver && e('div', { style: { padding: '.55rem 1rem', background: 'linear-gradient(90deg,#fff0f0,#ffe4e4)', borderBottom: '2px solid var(--err)', display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' } },
        e('i', { className: 'fas fa-ban', style: { color: 'var(--err)', fontSize: '1rem', flexShrink: 0 } }),
        e('div', { style: { flex: 1, minWidth: 0 } },
          e('span', { style: { fontWeight: 700, fontSize: '.82rem', color: 'var(--err)' } },
            'Надвишен лимит за ' + projectCode + ' — ' + _bgn(grand) + ' > ' + _bgn(_maxBudgetBGN)),
          e('span', { style: { fontSize: '.72rem', color: '#c0392b', marginLeft: '.5rem' } },
            'Намалете с ' + _bgn(grand - _maxBudgetBGN)))
      ),

      /* ══════════════════════════════════════════════════════
         TOP SECTION: Donut + Legend  (inspired by goal summary)
         ══════════════════════════════════════════════════════ */
      e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1rem .75rem 1rem', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,var(--bg) 60%,var(--surface))' } },

        /* Left: Donut */
        e('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.35rem', flexShrink: 0 } },
          e(DonutChart),
          e('div', { style: { fontSize: '.63rem', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center' } },
            projectCode ? projectCode + ' · Бюджет' : 'Бюджет')
        ),

        /* Right: legend + remaining meter */
        e('div', { style: { flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: '.3rem' } },

          /* Header row */
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.1rem', flexWrap: 'wrap' } },
            e('span', { style: { fontWeight: 800, fontSize: '.95rem', color: 'var(--ink)' } }, 'Разпределение на бюджета'),
            maxBudget > 0 && e('span', { style: { fontSize: '.7rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '.1rem .55rem', color: 'var(--ink-3)', fontWeight: 600 } },
              'Макс. ' + maxBudget.toLocaleString('bg-BG') + ' €'),
            e('button', { type: 'button', title: showMonthly ? 'Превключи към годишна' : 'Превключи към месечна',
              disabled: readOnly,
              onClick: toggleMonthly,
              style: { marginLeft: 'auto', fontSize: '.65rem', padding: '.2rem .55rem', background: showMonthly ? 'var(--primary)' : 'var(--surface)', color: showMonthly ? '#fff' : 'var(--ink-3)', border: '1px solid ' + (showMonthly ? 'var(--primary)' : 'var(--border)'), borderRadius: 20, cursor: readOnly ? 'default' : 'pointer', transition: 'all .2s', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '.25rem' } },
              e('i', { className: 'fas fa-calendar-alt' }), showMonthly ? ' Месечна' : ' Годишна')
          ),

          /* Section legend rows */
          SECTION_ORDER.filter(function(sec) {
            return (sectionData[sec] || {total:0}).total > 0 || activeGroups.some(function(g){return g.section===sec;});
          }).map(function(sec, si) {
            var col = SECTION_COLORS[sec] || '#888';
            var info = SECTION_LABELS[sec] || { icon: 'fa-circle', label: sec };
            var secDat = sectionData[sec] || { total: 0 };
            var secPct = grandEUR > 0 ? (secDat.total / grand * 100) : 0;
            var secEUR = secDat.total / _EUR_BGN;
            /* violations for this section */
            var secViolations = budgetViolations.filter(function(v) {
              var g = activeGroups.find(function(cg){ return cg.id === v.group; });
              return g && g.section === sec;
            });
            var hasHighSec = secViolations.some(function(v){ return v.severity==='high'; });
            return e('div', { key: sec, style: { display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.25rem 0', borderBottom: si < SECTION_ORDER.length - 2 ? '1px solid var(--border)' : 'none' } },
              /* color dot */
              e('span', { style: { width: 11, height: 11, borderRadius: '50%', background: col, flexShrink: 0, boxShadow: '0 0 0 2px ' + col + '33' } }),
              /* label */
              e('span', { style: { fontSize: '.78rem', color: 'var(--ink-2)', flex: 1 } },
                e('i', { className: 'fas ' + info.icon, style: { fontSize: '.62rem', marginRight: '.3rem', color: col } }),
                info.label),
              /* violation badge */
              hasHighSec && e('i', { className: 'fas fa-exclamation-triangle', title: secViolations.map(function(v){return v.message;}).join('\n'), style: { fontSize: '.68rem', color: 'var(--err)', cursor: 'help' } }),
              /* percent bar */
              e('div', { style: { width: 56, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 } },
                e('div', { style: { height: '100%', width: Math.min(secPct, 100) + '%', background: hasHighSec ? 'var(--err)' : col, borderRadius: 3, transition: 'width .4s ease' } })
              ),
              /* EUR amount */
              e('span', { style: { fontSize: '.8rem', fontWeight: 700, color: hasHighSec ? 'var(--err)' : 'var(--ink)', minWidth: 72, textAlign: 'right', fontFamily: "'Merriweather',Georgia,serif" } },
                secEUR > 0 ? secEUR.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €' : '—')
            );
          }),

          /* ── Remaining progress bar ── */
          maxBudget > 0 && e('div', { style: { marginTop: '.4rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '.4rem .6rem' } },
            e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem', gap: '.4rem', flexWrap: 'wrap' } },
              e('span', { style: { fontSize: '.63rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-4)', fontWeight: 600 } }, 'Усвоен бюджет'),
              e('span', { style: { fontSize: '.72rem', fontWeight: 700, color: budgetOver ? 'var(--err)' : budgetPct >= 85 ? 'var(--warn)' : 'var(--ok)' } },
                budgetPct.toFixed(1) + '%')
            ),
            e('div', { style: { height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' } },
              e('div', { style: { height: '100%', width: Math.min(budgetPct, 100) + '%', borderRadius: 4,
                background: budgetOver ? 'linear-gradient(90deg,#e74c3c,#c0392b)' : budgetPct >= 85 ? 'linear-gradient(90deg,#f39c12,#e67e22)' : 'linear-gradient(90deg,#1abc9c,#20c997)',
                transition: 'width .5s ease, background .4s' } })
            ),
            e('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: '.2rem' } },
              e('span', { style: { fontSize: '.62rem', color: 'var(--ink-4)' } },
                grandEUR.toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' €  изразходвано'),
              !budgetOver && e('span', { style: { fontSize: '.62rem', color: 'var(--ok)', fontWeight: 600 } },
                'Остават ' + remainingEUR.toFixed(0) + ' €')
            )
          )
        )
      ),

      /* ══════════════════════════════════════════════════════
         KPI CARDS ROW  (like "Your Mortgage Estimates")
         ══════════════════════════════════════════════════════ */
      e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '.5rem', padding: '.65rem .9rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)' } },
        e(KpiCard, { label: 'Общо бюджет', value: grandEUR > 0 ? grandEUR.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €' : '0.00 €',
          sub: grand > 0 ? (grand/1).toFixed(0) + ' лв.' : null,
          accent: budgetOver ? 'var(--err)' : budgetPct >= 85 ? 'var(--warn)' : '#20c997', large: true,
          valueColor: budgetOver ? 'var(--err)' : budgetPct >= 85 ? 'var(--warn)' : 'var(--ink)' }),
        maxBudget > 0 && e(KpiCard, { label: 'Максимум', value: maxBudget.toLocaleString('bg-BG',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' €',
          sub: (_maxBudgetBGN).toFixed(0) + ' лв.', accent: '#4263eb' }),
        maxBudget > 0 && e(KpiCard, { label: 'Оставащ', value: !budgetOver ? Math.max(0,remainingEUR).toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €' : '–' + Math.abs(remainingEUR).toFixed(2) + ' €',
          sub: budgetOver ? 'Над лимита!' : budgetPct >= 85 ? 'Близо до лимита' : 'В рамките',
          accent: budgetOver ? 'var(--err)' : budgetPct >= 85 ? 'var(--warn)' : '#20c997',
          valueColor: budgetOver ? 'var(--err)' : budgetPct >= 85 ? 'var(--warn)' : 'var(--ok)' }),
        /* Per-year chips */
        yearBreakdowns.length > 0 && e('div', { style: { flex: '1 1 160px', minWidth: 140, padding: '.6rem .8rem', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, position: 'relative', overflow: 'hidden' } },
          e('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#f59f00', borderRadius: '10px 10px 0 0' } }),
          e('div', { style: { fontSize: '.62rem', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600, marginBottom: '.25rem' } }, 'По години'),
          e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '.3rem' } },
            yearBreakdowns.map(function(yd) {
              return e('span', { key: yd.yr, style: { fontSize: '.7rem', fontWeight: 700, padding: '.1rem .45rem', borderRadius: 12, background: yd.eur > 0 ? 'var(--primary-dim)' : 'var(--surface)', color: yd.eur > 0 ? 'var(--primary)' : 'var(--ink-4)', border: '1px solid ' + (yd.eur > 0 ? 'var(--primary)' : 'var(--border)') } },
                yd.yr + ': ' + (yd.eur > 0 ? yd.eur.toFixed(0) + ' €' : '—'));
            })
          )
        )
      ),

      /* ══════════════════════════════════════════════════════
         INPUT SECTION — card-based, one card per section
         ══════════════════════════════════════════════════════ */
      e('div', { className: 'card-body', style: { padding: '.65rem .75rem', display: 'flex', flexDirection: 'column', gap: '.5rem' } },

        SECTION_ORDER.map(function(sec) {
          var info = SECTION_LABELS[sec] || { icon: 'fa-circle', label: sec, color: 'var(--ink-3)' };
          var col  = SECTION_COLORS[sec] || '#888';
          var secGroups = activeGroups.filter(function(g) { return g.section === sec; });
          if (!secGroups.length) return null;
          var secDat = sectionData[sec] || { total: 0 };
          var secEUR = secDat.total / _EUR_BGN;
          var secPct = grandEUR > 0 ? (secDat.total / grand * 100) : 0;

          return e('div', { key: sec, style: { border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', transition: 'box-shadow .2s' } },

            /* Section header */
            e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.45rem .75rem', background: col + '14', borderBottom: '1px solid ' + col + '33', cursor: 'default' } },
              e('span', { style: { width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 } }),
              e('span', { style: { fontWeight: 700, fontSize: '.8rem', color: col } },
                e('i', { className: 'fas ' + info.icon, style: { marginRight: '.35rem', fontSize: '.7rem' } }),
                info.label),
              e('div', { style: { flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', maxWidth: 80 } },
                e('div', { style: { height: '100%', width: Math.min(secPct, 100) + '%', background: col, borderRadius: 2, transition: 'width .4s ease' } })
              ),
              e('span', { style: { fontSize: '.75rem', fontWeight: 700, color: secEUR > 0 ? col : 'var(--ink-4)', marginLeft: 'auto', minWidth: 80, textAlign: 'right', fontFamily: "'Merriweather',Georgia,serif" } },
                secEUR > 0 ? secEUR.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €' : '—')
            ),

            /* Section rows — one per cost group */
            e('div', { style: { background: 'var(--bg)' } },
              secGroups.map(function(g, gi) {
                var rt = rowTotals[g.id] || 0;
                var rtEUR = rt / _EUR_BGN;
                var pct = grandEUR > 0 ? (rt / grand * 100) : 0;
                /* Violations */
                var rowViol = budgetViolations.filter(function(v){ return v.group === g.id; });
                var hasHigh = rowViol.some(function(v){ return v.severity==='high'; });
                var hasWarn = rowViol.some(function(v){ return v.severity==='warn'; });
                /* Limit from rules */
                var ruleLimits = rules.filter(function(r){ return r.id === g.id || r.group === sec; });
                var maxPct = 0;
                ruleLimits.forEach(function(l){ var m=parseFloat(l.limit); if(!isNaN(m)&&l.limit.indexOf('%')>0&&m>maxPct)maxPct=m; });
                var barCol = hasHigh ? 'var(--err)' : hasWarn ? 'var(--warn)' : rt > 0 ? col : 'var(--border)';

                return e('div', { key: g.id,
                  style: {
                    padding: '.4rem .75rem',
                    borderBottom: gi < secGroups.length - 1 ? '1px solid var(--border)' : 'none',
                    background: hasHigh ? 'rgba(220,38,38,.03)' : hasWarn ? 'rgba(234,179,8,.03)' : 'transparent',
                    transition: 'background .2s'
                  }
                },
                  /* Row label + badge */
                  e('div', { style: { display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.3rem', flexWrap: 'wrap' } },
                    e('span', { style: { fontSize: '.78rem', fontWeight: 500, color: hasHigh ? 'var(--err)' : hasWarn ? 'var(--warn)' : 'var(--ink)', flex: 1 } }, g.bg),
                    rowViol.length > 0 && e('span', {
                      style: { fontSize: '.58rem', fontWeight: 700, padding: '.06rem .4rem', borderRadius: 10,
                        background: hasHigh ? 'var(--err-bg)' : 'var(--warn-bg)',
                        color: hasHigh ? 'var(--err)' : 'var(--warn)',
                        border: '1px solid ' + (hasHigh ? 'var(--err)' : 'var(--warn)'), cursor: 'help' },
                      title: rowViol.map(function(v){return v.message;}).join('\n')
                    }, e('i',{className:'fas fa-exclamation-triangle',style:{marginRight:'.2rem'}}), hasHigh ? 'Нарушение' : 'Предупреждение'),
                    maxPct > 0 && e('span', { style: { fontSize: '.58rem', fontWeight: 600, padding: '.06rem .35rem', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-4)' } }, '≤ ' + maxPct + '%')
                  ),
                  /* Inputs row */
                  e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center' } },
                    /* Year inputs */
                    (showMonthly ? monthLabels : years).map(function(period) {
                      var stored;
                      if (showMonthly) {
                        var mData = (value._monthly && value._monthly[g.id]) || {};
                        stored = Number(mData[period] || 0);
                      } else {
                        stored = Number(((value[g.id] || {})[period]) || 0);
                      }
                      return e('div', { key: period, style: { display: 'flex', flexDirection: 'column', gap: '.12rem', flex: showMonthly ? '1 1 52px' : '1 1 100px', minWidth: showMonthly ? 50 : 90 } },
                        e('label', { style: { fontSize: '.58rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' } }, period),
                        e('div', { style: { position: 'relative', display: 'flex', alignItems: 'center' } },
                          e(BudgetCell, {
                            bgnStored: stored, eurBgn: _EUR_BGN,
                            disabled: readOnly, readOnly: readOnly,
                            onCommit: function(bgn) {
                              if (showMonthly) setMonthlyCell(g.id, period, bgn);
                              else setCell(g.id, period, bgn);
                            },
                            title: period + ' · EUR',
                            style: {
                              width: '100%', padding: '.3rem .5rem .3rem 1.6rem',
                              fontSize: showMonthly ? '.68rem' : '.78rem',
                              border: '1px solid ' + (hasHigh ? 'var(--err)' : 'var(--border)'),
                              borderRadius: 6, background: readOnly ? 'var(--surface)' : 'var(--bg)',
                              outline: 'none', transition: 'border-color .2s, box-shadow .2s',
                              cursor: readOnly ? 'default' : 'text', boxSizing: 'border-box'
                            },
                            onFocus: readOnly ? null : function(ev){ ev.target.style.borderColor=col; ev.target.style.boxShadow='0 0 0 2px '+col+'33'; },
                            onBlur:  readOnly ? null : function(ev){ ev.target.style.borderColor=hasHigh?'var(--err)':'var(--border)'; ev.target.style.boxShadow='none'; }
                          }),
                          e('span', { style: { position: 'absolute', left: '.45rem', fontSize: '.65rem', fontWeight: 700, color: 'var(--ink-4)', pointerEvents: 'none' } }, '€')
                        )
                      );
                    }),
                    /* Row total chip */
                    e('div', { style: { display: 'flex', flexDirection: 'column', gap: '.12rem', flex: '0 0 auto', minWidth: 80, alignItems: 'flex-end', justifyContent: 'flex-end' } },
                      e('label', { style: { fontSize: '.58rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase' } }, 'Общо'),
                      e('span', { style: { fontSize: '.82rem', fontWeight: 800, color: hasHigh ? 'var(--err)' : hasWarn ? 'var(--warn)' : rt > 0 ? col : 'var(--ink-4)', fontFamily: "'Merriweather',Georgia,serif", whiteSpace: 'nowrap' } },
                        rtEUR > 0 ? rtEUR.toLocaleString('bg-BG',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €' : '—')
                    )
                  ),
                  /* Mini percentage bar */
                  rt > 0 && e('div', { style: { marginTop: '.3rem', display: 'flex', alignItems: 'center', gap: '.4rem' } },
                    e('div', { style: { flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' } },
                      e('div', { style: { height: '100%', width: Math.min(maxPct > 0 ? (pct/maxPct*100) : (pct>0?5:0), 100) + '%', background: barCol, borderRadius: 2, transition: 'width .4s' } })
                    ),
                    maxPct > 0 && e('span', { style: { fontSize: '.6rem', color: barCol === 'var(--err)' ? 'var(--err)' : 'var(--ink-4)', fontWeight: 600, whiteSpace: 'nowrap' } },
                      pct.toFixed(1) + '% / ' + maxPct + '%')
                  )
                );
              })
            )
          );
        }),

        /* ── Violation summary banner ── */
        (function(){
          var _hasHigh=budgetViolations.some(function(v){return v.severity==='high';});
          var _hc=0,_wc=0;
          budgetViolations.forEach(function(v){ if(v.severity==='high')_hc++;else if(v.severity==='warn')_wc++; });
          if(!budgetViolations.length)return null;
          return e('div', { style: { padding: '.55rem .8rem', background: _hasHigh ? 'var(--err-bg)' : 'var(--warn-bg)', border: '1px solid ' + (_hasHigh ? 'var(--err-border)' : 'var(--warn-border)'), borderRadius: 8, display:'flex',alignItems:'flex-start',gap:'.5rem',fontSize:'.74rem', marginTop:'.25rem' } },
            e('i', { className: 'fas fa-' + (_hasHigh ? 'ban' : 'exclamation-triangle'), style: { color: _hasHigh ? 'var(--err)' : 'var(--warn)', fontSize: '.9rem', flexShrink: 0, marginTop: '.05rem' } }),
            e('div', { style: { flex: 1, minWidth: 0 } },
              e('div', { style: { fontWeight: 700, color: _hasHigh ? 'var(--err)' : 'var(--warn)', marginBottom: '.2rem' } },
                _hc > 0 ? _hc + ' нарушени' + (_hc===1?'е':'я') + ' на бюджетните правила' + (_wc>0?' + '+_wc+' предупреждени'+(_wc===1?'е':'я'):'') : _wc + ' предупреждени' + (_wc===1?'е':'я')),
              e('div', null, budgetViolations.map(function(v,vi) {
                return e('div', { key: vi, style: { fontSize: '.68rem', color: v.severity==='high'?'var(--err)':'var(--warn)', padding: '.05rem 0', display:'flex',alignItems:'flex-start',gap:'.3rem' } },
                  e('i', { className: 'fas fa-circle', style: { fontSize: '.3rem', marginTop: '.35rem', flexShrink: 0 } }),
                  v.message);
              }))
            )
          );
        })(),

        /* ── All-clear banner ── */
        !budgetViolations.length && grand > 0 && rules.length > 0 && e('div', { style: { padding: '.5rem .8rem', background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', borderRadius: 8, display:'flex',alignItems:'center',gap:'.4rem', fontSize:'.74rem', color:'var(--ok)', marginTop:'.25rem' } },
          e('i', { className: 'fas fa-check-circle', style: { fontSize: '.85rem', flexShrink: 0 } }),
          e('span', null, 'Бюджетът отговаря на всички изисквания за ', e('strong', null, projectCode), '.')),

        /* ── Rules panel (collapsible) ── */
        renderRulesPanel()
      )
    );
  }

  /* ════════════════════════════════════════════════════════════════════
   *  M_ExpensesView (UC-29 / UC-30 / UC-31)
   * ════════════════════════════════════════════════════════════════════ */
  function NewExpenseModal(props) {
    var projects = Array.isArray(props.projects) ? props.projects : [];
    var onClose  = props.onClose || function () {};
    var onSaved  = props.onSaved || function () {};
    var defaultProjId = props.defaultProjectId || (projects[0] && projects[0].id) || '';

    // Reuse the same modal-close hook + portal that NewFormModal uses for
    // identical look/feel (animated overlay close, ESC handling, scroll lock).
    var hasShell = (typeof useModalClose === 'function') && (typeof _portal === 'function');
    var mc = hasShell ? useModalClose(onClose) : null;
    var nxClosing = hasShell ? mc.closing : false;
    var nxClose   = hasShell ? mc.close   : onClose;

    var s0 = useState({
      projectId: defaultProjId, costGroup: 'consumables', amount: '',
      description: '', budgetLine: '', date: new Date().toISOString().substring(0, 10),
      year: String((new Date()).getFullYear()), notes: ''
    });
    var f = s0[0]; var setF = s0[1];
    var b0 = useState(false); var busy = b0[0]; var setBusy = b0[1];
    var er0 = useState({});  var errors = er0[0]; var setErrors = er0[1];

    var ErrMsg = function (p) {
      return errors[p.field] ? e('div', { className: 'field-error' },
        e('i', { className: 'fas fa-exclamation-circle' }), ' ', errors[p.field]) : null;
    };

    var submit = function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      var er = {};
      if (!f.projectId)  er.projectId  = 'Изберете проект';
      var amt = Number(f.amount);
      if (!(amt > 0))    er.amount     = 'Невалидна сума';
      if (!f.description.trim()) er.description = 'Въведете описание';
      setErrors(er);
      if (Object.keys(er).length) { _toast('Моля попълнете задължителните полета.', 'warn'); return; }
      setBusy(true);
      _api()('createexpense', {
        projectId: f.projectId, costGroup: f.costGroup, amount: amt,
        description: f.description.trim(), budgetLine: f.budgetLine.trim(),
        date: f.date, year: f.year, notes: f.notes.trim()
      }).then(function (r) {
        if (r && r.success) {
          _toast('Заявката за разход е изпратена за одобрение.', 'success');
          onSaved();
          if (hasShell) nxClose(); else onClose();
        } else {
          _toast((r && r.error) || 'Грешка', 'error');
        }
      }).catch(function (err) { _toast(err.message || String(err), 'error'); })
        .finally(function () { setBusy(false); });
    };

    var setField = function (k, v) {
      setF(function (prev) { return Object.assign({}, prev, _kv(k, v)); });
      if (errors[k]) setErrors(function (prev) { var n = Object.assign({}, prev); delete n[k]; return n; });
    };

    var head = e('div', { className: 'modal-head' },
      e('h3', null, e('i', { className: 'fas fa-receipt' }), ' Нова заявка за разход'),
      e('button', { type: 'button', className: 'close-btn', 'aria-label': 'Затвори', onClick: hasShell ? nxClose : onClose },
        e('i', { className: 'fas fa-times' }))
    );
    var form = e('form', { className: 'modal-form', onSubmit: submit },
      e('div', { className: 'modal-body' },
          e('div', { className: 'form-layout-grid' },
            e('div', { className: 'form-field span2 ' + (errors.projectId ? 'error' : '') },
              e('label', null, 'Проект *'),
              e('select', { value: f.projectId, onChange: function (ev) { setField('projectId', ev.target.value); }, required: true },
                e('option', { value: '', disabled: true }, '— изберете —'),
                projects.map(function (p) { return e('option', { key: p.id, value: p.id }, (p.title || p.id) + ' (' + (p.projectCode || '?') + ')'); })),
              e(ErrMsg, { field: 'projectId' })),
            e('div', { className: 'form-field' },
              e('label', null, 'Разходна група *'),
              e('select', { value: f.costGroup, onChange: function (ev) { setField('costGroup', ev.target.value); }, required: true },
                COST_GROUPS.map(function (g) { return e('option', { key: g.id, value: g.id }, g.bg); }))),
            e('div', { className: 'form-field ' + (errors.amount ? 'error' : '') },
              e('label', null, 'Сума (€) *'),
              e('input', { type: 'number', min: 0.01, step: '0.01', value: f.amount,
                onChange: function (ev) { setField('amount', ev.target.value); }, required: true,
                placeholder: '0.00' }),
              e(ErrMsg, { field: 'amount' })),
            e('div', { className: 'form-field' },
              e('label', null, 'Дата'),
              e('input', { type: 'date', value: f.date, onChange: function (ev) { setField('date', ev.target.value); } })),
            e('div', { className: 'form-field' },
              e('label', null, 'Бюджетна година'),
              e('input', { value: f.year, onChange: function (ev) { setField('year', ev.target.value); }, placeholder: '2026' })),
            e('div', { className: 'form-field span2' },
              e('label', null, 'Бюджетен ред'),
              e('input', { value: f.budgetLine, onChange: function (ev) { setField('budgetLine', ev.target.value); },
                placeholder: 'напр. 0102 / Възнаграждения' })),
            e('div', { className: 'form-field span2 ' + (errors.description ? 'error' : '') },
              e('label', null, 'Описание *'),
              e('textarea', { rows: 3, value: f.description, required: true,
                onChange: function (ev) { setField('description', ev.target.value); },
                placeholder: 'Какво се закупува / за какво е разходът' }),
              e(ErrMsg, { field: 'description' })),
            e('div', { className: 'form-field span2' },
              e('label', null, 'Бележки'),
              e('textarea', { rows: 2, value: f.notes,
                onChange: function (ev) { setField('notes', ev.target.value); },
                placeholder: 'Опционално — допълнителни уточнения' }))
          )
        ),
        e('div', { className: 'modal-footer' },
          e('button', { type: 'button', className: 'btn btn-outline', onClick: hasShell ? nxClose : onClose, disabled: busy }, 'Отказ'),
          e('button', { type: 'submit', className: 'btn btn-primary', disabled: busy },
            busy ? e('i', { className: 'fas fa-spinner spin' }) : e('i', { className: 'fas fa-paper-plane' }),
            ' Подай за одобрение'))
    );

    if (hasShell) {
      return _portal(e('div', {
          className: 'modal-overlay' + (nxClosing ? ' modal-closing' : ''),
          onClick: nxClose, role: 'dialog', 'aria-modal': 'true'
        },
        e('div', {
          className: 'modal-box form-modal modal-form' + (nxClosing ? ' modal-closing' : ''),
          onClick: function (ev) { ev.stopPropagation(); }
        }, head, form)
      ));
    }
    // Fallback (proposal-extras loaded before components.js — older order)
    return e('div', { className: 'modal-overlay', onClick: onClose, role: 'dialog', 'aria-modal': 'true' },
      e('div', { className: 'modal-box form-modal modal-form', onClick: function (ev) { ev.stopPropagation(); } }, head, form)
    );
  }

  function _kv(k, v) { var o = {}; o[k] = v; return o; }

  function StatusPill(props) {
    var s = String(props.status || '').toLowerCase();
    var map = {
      pending:  { bg: 'var(--warn-bg)', fg: 'var(--warn)', label: 'Заявен' },
      approved: { bg: 'var(--ok-bg)',   fg: 'var(--ok)',   label: 'Одобрен' },
      rejected: { bg: 'var(--err-bg)',  fg: 'var(--err)',  label: 'Отхвърлен' },
      posted:   { bg: 'var(--info-bg)', fg: 'var(--info)', label: 'Осчетоводен' }
    };
    var v = map[s] || { bg: 'var(--surface)', fg: 'var(--ink-3)', label: s || '—' };
    return e('span', { style: { background: v.bg, color: v.fg, padding: '.15rem .55rem', borderRadius: 12, fontSize: '.7rem', fontWeight: 600 } }, v.label);
  }

  function M_ExpensesView(props) {
    var user    = props.user || {};
    var isAdmin = !!props.isAdmin;
    var role    = String(props.userRole || '').toLowerCase();
    var canApprove = isAdmin || role === 'financial' || role === 'ckk';

    var p0 = useState([]);            var projects = p0[0]; var setProjects = p0[1];
    var pid0 = useState('');          var pid = pid0[0]; var setPid = pid0[1];
    var st0 = useState('');           var statusFilter = st0[0]; var setStatusFilter = st0[1];
    var ex0 = useState({ list: [], summary: null }); var exData = ex0[0]; var setExData = ex0[1];
    var l0  = useState(true);         var loading = l0[0]; var setLoading = l0[1];
    var err0 = useState('');          var error = err0[0]; var setError = err0[1];
    var nm0 = useState(false);        var showNew = nm0[0]; var setShowNew = nm0[1];

    /* Load projects (once) */
    useEffect(function () {
      var alive = true;
      _api()('getprojects', { userId: user.email || '' }).then(function (r) {
        if (!alive) return;
        var list = (r && r.success && Array.isArray(r.projects)) ? r.projects : [];
        setProjects(list);
        if (list.length && !pid) setPid(list[0].id);
      }).catch(function () {});
      return function () { alive = false; };
    }, []); // eslint-disable-line

    /* Load expenses on project / filter / refresh */
    var refresh = useCallback(function () {
      setLoading(true); setError('');
      _api()('getexpenses', { projectId: pid, status: statusFilter, forceRefresh: true })
        .then(function (r) {
          if (r && r.success) {
            setExData({ list: r.expenses || [], summary: r.summary || null });
          } else { setError((r && r.error) || 'Неуспешно зареждане'); }
        })
        .catch(function (e) { setError(e.message || String(e)); })
        .finally(function () { setLoading(false); });
    }, [pid, statusFilter]);

    useEffect(function () { if (pid) refresh(); }, [pid, statusFilter, refresh]);

    var act = function (id, decision) {
      if (decision === 'rejected' && !window.confirm('Отхвърли заявката?')) return;
      _api()('approveexpense', { expenseId: id, decision: decision })
        .then(function (r) {
          if (r && r.success) {
            _toast(decision === 'approved' ? 'Разходът е одобрен.' : 'Разходът е отхвърлен.', 'success');
            refresh();
          } else { _toast((r && r.error) || 'Грешка', 'error'); }
        });
    };

    var pendingCount = (exData.list || []).filter(function (x) { return String(x.status).toLowerCase() === 'pending'; }).length;

    /* ── Budget execution per cost group (approved expenses only) ── */
    var budgetByGroup = {};
    (exData.list || []).filter(function (x) {
      return String(x.status || '').toLowerCase() === 'approved';
    }).forEach(function (x) {
      var g = x.costGroup || 'other';
      budgetByGroup[g] = (budgetByGroup[g] || 0) + (Number(x.amount) || 0);
    });
    var totalApproved = Object.keys(budgetByGroup).reduce(function (a, k) { return a + budgetByGroup[k]; }, 0);
    var execChartGroups = COST_GROUPS.filter(function (g) { return (budgetByGroup[g.id] || 0) > 0; });

    /* Task 22: resolve the currently-selected project for the supplementary sections */
    var _selProject = projects.filter(function (p) { return p.id === pid; })[0] || null;
    var _selProjectType = _selProject ? String(_selProject.projectCode || _selProject.projectType || '').toUpperCase() : '';
    var _selEmail = _selProject ? String(_selProject.ownerEmail || _selProject.userEmail || _selProject.applicantEmail || _selProject.email || '') : '';

    /* Notify finance module of badge counts */
    useEffect(function () {
      try {
        window.dispatchEvent(new CustomEvent('erp:financeCount', {
          detail: { key: 'expenses', total: (exData.list || []).length, pending: pendingCount }
        }));
      } catch (_) {}
    }, [exData.list && exData.list.length, pendingCount]);

    return e('div', null,
      /* Toolbar */
      e('div', { className: 'card', style: { marginBottom: '.7rem' } },
        e('div', { className: 'card-body', style: { display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' } },
          e('label', { style: { fontSize: '.78rem' } },
            'Проект: ',
            e('select', { value: pid, onChange: function (ev) { setPid(ev.target.value); },
              style: { padding: '.3rem .5rem', fontSize: '.8rem', border: '1px solid var(--border)', borderRadius: 4 } },
              projects.length === 0 && e('option', { value: '' }, 'Няма достъпни проекти'),
              projects.map(function (p) { return e('option', { key: p.id, value: p.id }, (p.title || p.id) + ' · ' + (p.projectCode || '?')); }))),
          e('label', { style: { fontSize: '.78rem' } },
            'Статус: ',
            e('select', { value: statusFilter, onChange: function (ev) { setStatusFilter(ev.target.value); },
              style: { padding: '.3rem .5rem', fontSize: '.8rem', border: '1px solid var(--border)', borderRadius: 4 } },
              e('option', { value: '' }, 'Всички'),
              e('option', { value: 'pending' },  'Заявени'),
              e('option', { value: 'approved' }, 'Одобрени'),
              e('option', { value: 'rejected' }, 'Отхвърлени'))),
          e('span', { style: { flex: 1 } }),
          projects.length > 0 && e('button', { className: 'btn btn-primary btn-sm', onClick: function () { setShowNew(true); } },
            e('i', { className: 'fas fa-plus' }), ' Нова заявка'),
          e('button', { className: 'btn btn-outline btn-sm', onClick: refresh },
            e('i', { className: 'fas fa-rotate' }))
        )
      ),

      /* Summary */
      exData.summary && e('div', { className: 'card', style: { marginBottom: '.7rem' } },
        e('div', { className: 'card-body', style: { display: 'flex', gap: '1rem', flexWrap: 'wrap' } },
          e('div', null,
            e('div', { style: { fontSize: '.7rem', color: 'var(--ink-3)' } }, 'Общо'),
            e('div', { style: { fontSize: '1.05rem', fontWeight: 700 } }, _bgn(exData.summary.total))),
          Object.keys(exData.summary.byStatus || {}).map(function (s) {
            return e('div', { key: s },
              e('div', { style: { fontSize: '.7rem', color: 'var(--ink-3)' } },
                s === 'pending' ? 'Заявени' : s === 'approved' ? 'Одобрени' : s === 'rejected' ? 'Отхвърлени' : s),
              e('div', { style: { fontWeight: 600 } }, _bgn(exData.summary.byStatus[s])));
          })
        )
      ),

      /* Budget execution chart — approved expenses breakdown */
      !loading && !error && totalApproved > 0 && e('div', { className: 'card budget-exec-card', style: { marginBottom: '.7rem' } },
        e('div', { className: 'card-header' },
          e('h3', { className: 'card-title' },
            e('i', { className: 'fas fa-chart-bar', style: { marginRight: '.4rem', color: 'var(--info)' } }),
            'Усвояване по разходни групи'),
          e('span', { style: { fontSize: '.78rem', color: 'var(--ink-3)' } }, 'Одобрени разходи: ', e('strong', null, _bgn(totalApproved)))
        ),
        e('div', { className: 'card-body' },
          execChartGroups.map(function (g) {
            var amt = budgetByGroup[g.id] || 0;
            var pct = totalApproved > 0 ? Math.round(amt / totalApproved * 100) : 0;
            var barColor = pct >= 40 ? 'var(--err)' : pct >= 20 ? 'var(--warn)' : 'var(--ok)';
            return e('div', { key: g.id, style: { marginBottom: '.6rem' } },
              e('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', marginBottom: '.2rem' } },
                e('span', { style: { color: 'var(--ink-2)' } }, g.bg),
                e('span', { style: { fontWeight: 600, color: barColor } }, _bgn(amt), ' (', pct, '%)')),
              e('div', { style: { height: 7, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' } },
                e('div', { style: { height: '100%', width: pct + '%', background: barColor, borderRadius: 4, transition: 'width .35s ease' } })
              )
            );
          })
        )
      ),

      loading && e('div', { className: 'card', style: { padding: '1.4rem', textAlign: 'center', color: 'var(--ink-3)' } },
        e('i', { className: 'fas fa-spinner fa-spin' }), ' Зареждане…'),
      error && e('div', { style: { padding: '.7rem .9rem', background: 'var(--err-bg)', border: '1px solid var(--err-border)', color: 'var(--err)', borderRadius: 4 } },
        e('i', { className: 'fas fa-triangle-exclamation' }), ' ', error),

      !loading && !error && e('div', { className: 'card', style: { overflowX: 'auto' } },
        e('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' } },
          e('thead', null, e('tr', { style: { background: 'var(--surface)' } },
            ['Дата', 'Описание', 'Група', 'Сума', 'Заявител', 'Статус', 'Действия'].map(function (h, i) {
              return e('th', { key: i, style: { padding: '.45rem .6rem', textAlign: 'left', fontSize: '.7rem', textTransform: 'uppercase', color: 'var(--ink-3)' } }, h);
            }))),
          e('tbody', null,
            (exData.list || []).length === 0 && e('tr', null,
              e('td', { colSpan: 7, style: { padding: '1.4rem', textAlign: 'center', color: 'var(--ink-3)' } },
                'Няма заявки за избрания проект.')),
            (exData.list || []).map(function (ex) {
              var st = String(ex.status || '').toLowerCase();
              return e('tr', { key: ex.id, style: { borderTop: '1px solid var(--border)' } },
                e('td', { style: { padding: '.4rem .6rem', whiteSpace: 'nowrap' } }, String(ex.date || '').substring(0, 10)),
                e('td', { style: { padding: '.4rem .6rem' } }, ex.description, ex.budgetLine ? e('div', { style: { fontSize: '.7rem', color: 'var(--ink-3)' } }, ex.budgetLine) : null),
                e('td', { style: { padding: '.4rem .6rem' } }, COST_GROUP_LABEL[ex.costGroup] || ex.costGroup),
                e('td', { style: { padding: '.4rem .6rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 } }, _bgn(ex.amount)),
                e('td', { style: { padding: '.4rem .6rem', color: 'var(--ink-3)', fontSize: '.74rem' } }, ex.requestedBy),
                e('td', { style: { padding: '.4rem .6rem' } }, e(StatusPill, { status: ex.status })),
                e('td', { style: { padding: '.4rem .6rem', whiteSpace: 'nowrap' } },
                  canApprove && st === 'pending' ? e(Fragment, null,
                    e('button', { className: 'btn btn-success btn-sm', style: { marginRight: '.3rem' },
                      onClick: function () { act(ex.id, 'approved'); } },
                      e('i', { className: 'fas fa-check' }), ' Одобри'),
                    e('button', { className: 'btn btn-danger btn-sm',
                      onClick: function () { act(ex.id, 'rejected'); } },
                      e('i', { className: 'fas fa-times' }), ' Отхвърли')
                  ) : null)
              );
            })
          )
        )
      ),

      showNew && e(NewExpenseModal, {
        projects: projects, defaultProjectId: pid,
        onClose: function () { setShowNew(false); },
        onSaved: refresh
      }),
      /* Task 22 — Supplementary proposal sections (self-assessment / TRL / work program / support letters) */
      pid && e(SelfAssessmentSection, { proposalId: pid, projectType: _selProjectType, applicantEmail: _selEmail, disabled: !canApprove })
    );
  }

  /* ════════════════════════════════════════════════════════════════════
   *  computeBudgetTotalEUR — Compute grand total EUR from budget object
   *  ==================================================================
   *  Handles nested budget structure { group: { year: bgn }, ... }
   *  Returns 0 if budget is empty or malformed.
   * ════════════════════════════════════════════════════════════════════ */
  function computeBudgetTotalEUR(budget) {
    if (!budget || typeof budget !== 'object') return 0;
    var _eur = (typeof EUR_BGN !== 'undefined') ? EUR_BGN : 1.95583;
    var totalBGN = 0;
    Object.keys(budget).forEach(function (gid) {
      if (gid === '_monthlyMode' || gid === '_monthly') return;
      var byYear = budget[gid] || {};
      if (byYear && typeof byYear === 'object' && !Array.isArray(byYear)) {
        Object.keys(byYear).forEach(function (yr) { totalBGN += Number(byYear[yr]) || 0; });
      } else {
        totalBGN += Number(byYear) || 0;
      }
    });
    // Include monthly-mode values
    var mData = budget._monthly;
    if (mData && typeof mData === 'object') {
      Object.keys(mData).forEach(function (mgid) {
        var mByPeriod = mData[mgid] || {};
        if (mByPeriod && typeof mByPeriod === 'object') {
          Object.keys(mByPeriod).forEach(function (period) { totalBGN += Number(mByPeriod[period]) || 0; });
        }
      });
    }
    return totalBGN / _eur;
  }

  /* ════════════════════════════════════════════════════════════════════
   *  validateBudgetForType — Hard budget rule enforcement
   *  ==================================================================
   *  Validates a budget object against the percentage caps and absolute
   *  limits defined for the given project type. Returns an array of
   *  violation objects { message, severity, group }.
   *
   *  USAGE:
   *    var violations = validateBudgetForType(budget, projectCode, {
   *      teamMembers: teamMembers,
   *      durationMonths: months
   *    });
   *    if (violations.some(function(v) { return v.severity === 'high'; })) {
   *      // block submission
   *    }
   *
   *  Budget object shape: { costGroupId: { year: amountBGN }, ... }
   *  All amounts in BGN; results displayed in EUR.
   * ════════════════════════════════════════════════════════════════════ */
  function validateBudgetForType(budget, projectCode, opts) {
    opts = opts || {};
    var violations = [];
    var _eur = (typeof EUR_BGN !== 'undefined') ? EUR_BGN : 1.95583;
    var pc = String(projectCode || '').toUpperCase().trim();
    var pt = (typeof PROJECT_TYPES !== 'undefined' && Array.isArray(PROJECT_TYPES))
      ? PROJECT_TYPES.find(function(p) { return p.value === pc; }) : null;
    var maxBudgetEUR = pt ? pt.maxBudget : 0;

    if (!budget || typeof budget !== 'object') return violations;

    // Aggregate totals per cost group
    var totals = {};
    var grandBGN = 0;
    ['salaries','external_services','assets','consumables','literature','travel','publications','reviews','other'].forEach(function(gid) { totals[gid] = 0; });
    Object.keys(budget).forEach(function(gid) {
      if (gid === '_monthlyMode' || gid === '_monthly') return;
      var byYear = budget[gid] || {};
      Object.keys(byYear).forEach(function(yr) {
        var v = Number(byYear[yr]) || 0;
        totals[gid] = (totals[gid] || 0) + v;
        grandBGN += v;
      });
    });
    // Include monthly-mode
    var mData = budget._monthly;
    if (mData && typeof mData === 'object') {
      Object.keys(mData).forEach(function(mgid) {
        var mByPeriod = mData[mgid] || {};
        if (mByPeriod && typeof mByPeriod === 'object') {
          Object.keys(mByPeriod).forEach(function(period) {
            var v = Number(mByPeriod[period]) || 0;
            totals[mgid] = (totals[mgid] || 0) + v;
            grandBGN += v;
          });
        }
      });
    }

    var grandEUR = grandBGN / _eur;
    var pctOf = function(amt) { return grandBGN > 0 ? (amt / grandBGN) * 100 : 0; };

    var sal = totals.salaries || 0;
    var ext = totals.external_services || 0;
    var lit = totals.literature || 0;
    var cons = totals.consumables || 0;
    var trav = totals.travel || 0;
    var rev = totals.reviews || 0;
    var pub = totals.publications || 0;
    var ass = totals.assets || 0;
    var oth = totals.other || 0;
    var months = Math.max(1, Math.min(60, Number(opts.durationMonths) || 12));
    var nYears = Math.max(1, Math.ceil(months / 12));
    var teamMembers = Array.isArray(opts.teamMembers) ? opts.teamMembers : [];
    var hasDocYoung = teamMembers.some(function(m) {
      return m.role === 'young' || m.role === 'doctoral' || m.youngScientist || m.doctoral;
    });

    // ═══════════════════════════════════════════════════════════════════
    //  ФНИ — ПЪЛНА ВАЛИДАЦИЯ НА БЮДЖЕТНИТЕ ПРАВИЛА
    //  Пер правилник 2026 г.
    // ═══════════════════════════════════════════════════════════════════
    if (pc === 'ФНИ') {
      // ── Общ лимит: maxBudget (12 000 €) ──
      if (maxBudgetEUR > 0 && grandEUR > maxBudgetEUR + 0.005) {
        violations.push({ message: 'Общият бюджет (' + grandEUR.toFixed(0) + ' €) надвишава максимума за ФНИ (' + maxBudgetEUR + ' €). Намалете разходите с ' + (grandEUR - maxBudgetEUR).toFixed(0) + ' €.', severity: 'high', group: 'total' });
      }

      // ── Раздел 2: МАТЕРИАЛИ ──
      // 2.1 Специализирана научна литература ≤ 10%
      if (grandBGN > 0 && pctOf(lit) > 10) {
        violations.push({ message: 'Специализирана научна литература (т. 2.1): ' + pctOf(lit).toFixed(1) + '% от бюджета надвишава лимита от 10%.', severity: 'high', group: 'literature' });
      }
      // 2.3 Канцеларски материали ≤ 5%
      if (grandBGN > 0 && pctOf(cons) > 5) {
        violations.push({ message: 'Канцеларски материали (т. 2.3): ' + pctOf(cons).toFixed(1) + '% от бюджета надвишава лимита от 5%.', severity: 'high', group: 'consumables' });
      }

      // ── Раздел 3: ВЪЗНАГРАЖДЕНИЯ ──
      // 3.1 Възнаграждения на екипа
      var salCap = hasDocYoung ? 35 : 10;
      if (grandBGN > 0 && pctOf(sal) > salCap) {
        violations.push({ message: 'Възнаграждения на екипа (т. 3.1): ' + pctOf(sal).toFixed(1) + '% от бюджета надвишава ' + salCap + '%' + (hasDocYoung ? ' (с докторанти/млади учени)' : ' (без докторанти/млади учени)') + '.', severity: 'high', group: 'salaries' });
      }
      // 3.2–3.4 Рецензии (общо: монография ≤250€ + проект ≤60€ + отчети ≤25€×N)
      var maxRevEUR = 250 + 60 + (25 * nYears);
      var revEUR = rev / _eur;
      if (revEUR > maxRevEUR + 0.005) {
        violations.push({ message: 'Рецензии (т. 3.2–3.4): ' + revEUR.toFixed(0) + ' € надвишават ' + maxRevEUR.toFixed(0) + ' € (250 € монография + 60 € проект + ' + (25 * nYears) + ' € за ' + nYears + ' г. отчети).', severity: 'high', group: 'reviews' });
      }

      // ── Раздел 4: УСЛУГИ ──
      // 4.1 Компютърен набор ≤ 5% (предполага се част от external_services)
      // 4.3 Външни услуги ≤ 25%
      if (grandBGN > 0 && pctOf(ext) > 25) {
        violations.push({ message: 'Външни услуги (т. 4.1–4.3): ' + pctOf(ext).toFixed(1) + '% от бюджета надвишава 25%.', severity: 'high', group: 'external_services' });
      }
      // 4.4.2 Командировки — общото на командировки ≤ 20% (допускаме горната граница)
      if (grandBGN > 0 && pctOf(trav) > 20) {
        violations.push({ message: 'Командировки (т. 4.4): ' + pctOf(trav).toFixed(1) + '% от бюджета надвишава 20% (максималната граница за чужбина).', severity: 'high', group: 'travel' });
      }
      // 4.6 Емпирични изследвания ≤ 20%
      if (grandBGN > 0 && pctOf(oth) > 20) {
        violations.push({ message: 'Емпирични изследвания / други (т. 4.6): ' + pctOf(oth).toFixed(1) + '% от бюджета надвишава 20%.', severity: 'high', group: 'other' });
      }
    }

    // ═══ ПНИ BUDGET RULES ═══
    if (pc === 'ПНИ') {
      if (maxBudgetEUR > 0 && grandEUR > maxBudgetEUR + 0.005) {
        violations.push({ message: 'Общият бюджет (' + grandEUR.toFixed(0) + ' €) надвишава максимума за ПНИ (' + maxBudgetEUR + ' €).', severity: 'high', group: 'total' });
      }
      if (grandBGN > 0 && pctOf(lit) > 10) {
        violations.push({ message: 'Литература: ' + pctOf(lit).toFixed(1) + '% надвишава 10% (т. 2.1).', severity: 'high', group: 'literature' });
      }
      if (grandBGN > 0 && pctOf(cons) > 5) {
        violations.push({ message: 'Канцеларски материали: ' + pctOf(cons).toFixed(1) + '% надвишава 5% (т. 2.3).', severity: 'high', group: 'consumables' });
      }
      var salCapP = hasDocYoung ? 35 : 10;
      if (grandBGN > 0 && pctOf(sal) > salCapP) {
        violations.push({ message: 'Възнаграждения: ' + pctOf(sal).toFixed(1) + '% надвишава ' + salCapP + '%' + (hasDocYoung ? ' (с докторанти/млади учени)' : ' (без докторанти/млади учени)') + ' (т. 3.1).', severity: 'high', group: 'salaries' });
      }
      if (grandBGN > 0 && pctOf(ext) > 20) {
        violations.push({ message: 'Външни услуги: ' + pctOf(ext).toFixed(1) + '% надвишава 20% (ПНИ лимит, т. 4.3).', severity: 'high', group: 'external_services' });
      }
      if (grandBGN > 0 && pctOf(trav) > 15) {
        violations.push({ message: 'Командировки: ' + pctOf(trav).toFixed(1) + '% надвишава 15% (ПНИ лимит, т. 4.4.2).', severity: 'high', group: 'travel' });
      }
      if (grandBGN > 0 && pctOf(oth) > 25) {
        violations.push({ message: 'Други: ' + pctOf(oth).toFixed(1) + '% надвишава 25% (ПНИ лимит, т. 4.5).', severity: 'high', group: 'other' });
      }
      var maxRevEURp = 60 + (25 * nYears);
      var revEURp = rev / _eur;
      if (revEURp > maxRevEURp + 0.005) {
        violations.push({ message: 'Рецензии: ' + revEURp.toFixed(0) + ' € надвишават ' + maxRevEURp.toFixed(0) + ' € (60 € проект + ' + (25 * nYears) + ' € отчети).', severity: 'high', group: 'reviews' });
      }
    }

    // ═══ ДНП BUDGET RULES ═══
    if (pc === 'ДНП') {
      if (maxBudgetEUR > 0 && grandEUR > maxBudgetEUR + 0.005) {
        violations.push({ message: 'Общият бюджет (' + grandEUR.toFixed(0) + ' €) надвишава максимума за ДНП (' + maxBudgetEUR + ' €).', severity: 'high', group: 'total' });
      }
      if (grandBGN > 0 && pctOf(cons) > 10) {
        violations.push({ message: 'Канцеларски материали: ' + pctOf(cons).toFixed(1) + '% надвишава 10% (ДНП лимит).', severity: 'high', group: 'consumables' });
      }
      if (sal > 0.005) {
        violations.push({ message: 'Възнаграждения на екипа (' + (sal / _eur).toFixed(0) + ' €) не се допускат за ДНП проекти. Премахнете всички суми от раздел "Възнаграждения".', severity: 'high', group: 'salaries' });
      }
      var maxRevEURd = 60 + (25 * nYears);
      var revEURd = rev / _eur;
      if (revEURd > maxRevEURd + 0.005) {
        violations.push({ message: 'Рецензии: ' + revEURd.toFixed(0) + ' € надвишават ' + maxRevEURd.toFixed(0) + ' € (60 € проект + ' + (25 * nYears) + ' € отчети).', severity: 'high', group: 'reviews' });
      }
    }

    // ═══ НПФ BUDGET RULES ═══
    if (pc === 'НПФ') {
      if (maxBudgetEUR > 0 && grandEUR > maxBudgetEUR + 0.005) {
        violations.push({ message: 'Общият бюджет (' + grandEUR.toFixed(0) + ' €) надвишава максимума за НПФ (' + maxBudgetEUR + ' € ≈ 10 000 лв).', severity: 'high', group: 'total' });
      }
      if (grandBGN > 0 && pctOf(ext) > 15) {
        violations.push({ message: 'Външни услуги / визуална идентичност: ' + pctOf(ext).toFixed(1) + '% надвишава 15% (НПФ лимит).', severity: 'high', group: 'external_services' });
      }
      if (grandBGN > 0 && pctOf(oth) > 30) {
        violations.push({ message: 'Портфолио / други: ' + pctOf(oth).toFixed(1) + '% надвишава 30% (НПФ лимит).', severity: 'high', group: 'other' });
      }
      var revNPFEUR = rev / _eur;
      if (revNPFEUR > 51 + 0.005) {
        violations.push({ message: 'Рецензии: ' + revNPFEUR.toFixed(0) + ' € надвишават 100 лв (≈ 51 €).', severity: 'high', group: 'reviews' });
      }
    }

    return violations;
  }

  // Export to global scope for components.js to use
  window.validateBudgetForType = validateBudgetForType;
  window.computeBudgetTotalEUR = computeBudgetTotalEUR;
  window.BUDGET_RULES_BY_TYPE = BUDGET_RULES_BY_TYPE;

  /* ════════════════════════════════════════════════════════════════════
   *  DocumentPreviewModal — visual preview of attached documents
   *  in proposal forms. Renders the document inline in a modal using
   *  getdocumentcontent, then delegates to the same viewer logic as
   *  the main DocumentPreviewModal (iframe / text / UevDocRender).
   * ════════════════════════════════════════════════════════════════════ */
  function DocPreviewModal(props) {
    var doc = props.doc;
    var onClose = typeof props.onClose === 'function' ? props.onClose : function() {};
    var _id = doc && (doc.driveId || doc.fileId || doc.id || '');
    var _name = doc && (doc.name || 'Документ');
    var _mime = doc && (doc.mimeType || doc.mime_type || '');
    var _isGoogle = /google\.(document|spreadsheet|presentation|drawing|form)/i.test(_mime);
    var _editUrl = doc && (doc.googleDocEditLink || doc.editLink || doc.webViewLink || '');
    var _previewUrl = doc && (doc.previewLink || doc.preview_link || '');
    var [viewMode, setViewMode] = useState(_isGoogle ? 'iframe' : 'text');
    var [loading, setLoading] = useState(true);
    var [content, setContent] = useState('');
    var [err, setErr] = useState('');

    useEffect(function () {
      if (!_id) { setLoading(false); return; }
      setLoading(true); setErr(''); setContent('');
      _api()('getdocumentcontent', { docId: _id }).then(function (res) {
        if (!res || !res.success) { setErr(res && res.error ? res.error : 'Грешка при зареждане'); setLoading(false); return; }
        setContent(res.content || ''); setLoading(false);
      }).catch(function () { setErr('Мрежова грешка'); setLoading(false); });
    }, [_id]);

    var _iframeUrl = viewMode === 'iframe' && (_editUrl || _previewUrl) ? (_editUrl || _previewUrl) : '';
    var hasContent = content && content.trim().length > 0;
    var isHtml = hasContent && /<\/?[a-z][\s\S]*>/i.test(content);

    return e(_portal, {},
      e('div', { className: 'modal-overlay', onClick: onClose, role: 'dialog', 'aria-modal': 'true', 'aria-label': _name },
        e('div', { className: 'modal-box modal-form', onClick: function (ev) { ev.stopPropagation(); }, style: { maxWidth: '900px', width: '92%' } },
          e('div', { className: 'modal-head' },
            e('h3', { style: { fontSize: '.92rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }, title: _name }, _name),
            e('button', { className: 'close-btn', onClick: onClose, 'aria-label': 'Затвори' }, e('i', { className: 'fas fa-times' }))
          ),
          e('div', { className: 'modal-body', style: { display: 'flex', flexDirection: 'column', maxHeight: '72vh', overflow: 'auto' } },
            loading ? e('div', { style: { flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '.75rem', padding: '2rem 0' } },
              e('i', { className: 'fas fa-spinner fa-spin', style: { fontSize: '1.6rem', color: 'var(--ink-4)' } }),
              e('span', { style: { fontSize: '.82rem', color: 'var(--ink-3)' } }, 'Зареждане на документа…')
            ) : err ? e('div', { style: { padding: '1rem', textAlign: 'center', color: 'var(--err)' } },
              e('i', { className: 'fas fa-exclamation-triangle', style: { fontSize: '1.2rem', marginBottom: '.5rem', display: 'block' } }),
              err,
              e('button', { className: 'btn btn-outline btn-sm', style: { marginTop: '.5rem' }, onClick: function () { setLoading(true); setErr(''); } }, 'Опитай отново')
            ) : _iframeUrl ? e('div', { style: { flex: '1 1 auto', minHeight: '50vh', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', overflow: 'hidden', background: 'var(--surface)' } },
              e('iframe', { src: _iframeUrl, style: { border: 'none', width: '100%', height: '100%', minHeight: '50vh' }, title: _name, allow: 'autoplay; fullscreen; picture-in-picture' })
            ) : isHtml ? e('div', { style: { padding: '1rem', overflow: 'auto', background: 'var(--surface)' }, dangerouslySetInnerHTML: { __html: content } })
            : hasContent ? e('div', { className: 'doc-preview-text', style: { fontSize: '.82rem', lineHeight: 1.7, padding: '1rem', background: 'var(--surface)', maxHeight: '60vh', overflow: 'auto' } },
              e('pre', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit', fontSize: 'inherit', margin: 0, color: 'var(--ink)' }, textContent: content })
            ) : e('div', { className: 'empty-state', style: { padding: '2rem', textAlign: 'center' } },
              e('div', { className: 'empty-state-icon' }, e('i', { className: 'fas fa-file-alt', style: { color: 'var(--ink-4)' } })),
              e('p', { style: { color: 'var(--ink-3)' } }, 'Няма съдържание за преглед')
            ),
            e('div', { style: { display: 'flex', gap: '.5rem', marginTop: '.5rem', justifyContent: 'flex-end' } },
              _editUrl && e('button', { className: 'btn btn-outline btn-sm', onClick: function () { window.open(_editUrl, '_blank'); } }, e('i', { className: 'fas fa-edit' }), ' Отвори за редакция'),
              _iframeUrl && e('button', { className: 'btn btn-outline btn-sm', onClick: function () { setViewMode(viewMode === 'iframe' ? 'text' : 'iframe'); } }, e('i', { className: 'fas fa-eye' }), viewMode === 'iframe' ? ' Текст' : ' Уеб'),
              e('button', { className: 'btn btn-primary btn-sm', onClick: onClose }, 'Затвори')
            )
          )
        )
      )
    );
  }
  global.DocPreviewModal    = DocPreviewModal;

  /* ════════════════════════════════════════════════════════════════════
   *  DocumentTemplatesViewer — Google-styled modal for template
   *  documents stored in the DB, grouped by document type (mime/type).
   *  Uses getdocumenttemplates(grouped=true) for the type-batched view
   *  and getdocumentcontent (b64) for inline rendering via UEVDocViewer.
   * ════════════════════════════════════════════════════════════════════ */
  function DocumentTemplatesViewer(props) {
    var projectType = String(props.projectType || '').toUpperCase();
    var onClose = typeof props.onClose === 'function' ? props.onClose : function() {};
    var _api2 = _api;
    var _toast2 = _toast;
    var _activeType = useState('');
    var activeType = _activeType[0]; var setActiveType = _activeType[1];
    var _templates = useState([]);
    var templates = _templates[0]; var setTemplates = _templates[1];
    var _grouped = useState({});
    var grouped = _grouped[0]; var setGrouped = _grouped[1];
    var _loading = useState(true);
    var loading = _loading[0]; var setLoading = _loading[1];
    var _error = useState('');
    var error = _error[0]; var setError = _error[1];
    var _preview = useState(null);
    var previewDoc = _preview[0]; var setPreviewDoc = _preview[1];
    var _previewLoading = useState(false);
    var previewLoading = _previewLoading[0]; var setPreviewLoading = _previewLoading[1];
    var _previewError = useState('');
    var previewError = _previewError[0]; var setPreviewError = _previewError[1];

    useEffect(function () {
      setLoading(true); setError(''); setTemplates([]); setGrouped({});
      _api2()('getdocumenttemplates', { projectType: projectType, withResolution: true }).then(function (res) {
        if (!res || !res.success) { setError(res && res.error ? res.error : 'Грешка при зареждане'); setLoading(false); return; }
        setTemplates(res.templates || []);
        setGrouped(res.grouped || {});
        var keys = Object.keys(res.grouped || {});
        setActiveType(keys.length > 0 ? keys[0] : '');
        setLoading(false);
      }).catch(function () { setError('Мрежова грешка'); setLoading(false); });
    }, [projectType]);

    var openTemplate = function (tpl) {
      setPreviewLoading(true); setPreviewError(''); setPreviewDoc(null);
      _api2()('getdocumentcontent', { docId: tpl.id || tpl.drive_file_id || '' }).then(function (res) {
        if (!res || !res.success) { setPreviewError(res && res.error ? res.error : 'Грешка'); setPreviewLoading(false); return; }
        setPreviewDoc(Object.assign({}, tpl, { content: res.content || '', b64: res.b64 || null, mimeType: res.mimeType || tpl.mime_type || '' }));
        setPreviewLoading(false);
      }).catch(function () { setPreviewError('Мрежова грешка'); setPreviewLoading(false); });
    };

    var _mime = previewDoc && (previewDoc.mimeType || previewDoc.mime_type || '');
    var _isGoogle = /google\.(document|spreadsheet|presentation|drawing|form)/i.test(_mime);
    var _previewUrl = previewDoc && (previewDoc.previewLink || previewDoc.preview_link || previewDoc.editLink || previewDoc.googleDocEditLink || '');

    return e(_portal, {},
      e('div', { className: 'modal-overlay', onClick: onClose, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Шаблони на документи' },
        e('div', { className: 'modal-box modal-form', onClick: function (ev) { ev.stopPropagation(); }, style: { maxWidth: '960px', width: '94%' } },
          e('div', { className: 'modal-head' },
            e('h3', { style: { fontSize: '.92rem', margin: 0 } }, 'Шаблони на документи' + (projectType ? ' — ' + projectType : '')),
            e('button', { className: 'close-btn', onClick: onClose, 'aria-label': 'Затвори' }, e('i', { className: 'fas fa-times' }))
          ),
          e('div', { className: 'modal-body', style: { display: 'flex', flexDirection: 'column', maxHeight: '72vh', overflow: 'hidden' } },
            loading ? e('div', { style: { flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '.75rem' } },
              e('i', { className: 'fas fa-spinner fa-spin', style: { fontSize: '1.6rem', color: 'var(--ink-4)' } }),
              e('span', { style: { fontSize: '.82rem', color: 'var(--ink-3)' } }, 'Зареждане на шаблоните…')
            ) : error ? e('div', { style: { padding: '1rem', textAlign: 'center', color: 'var(--err)' } },
              e('i', { className: 'fas fa-exclamation-triangle', style: { fontSize: '1.2rem', marginBottom: '.5rem', display: 'block' } }),
              error,
              e('button', { className: 'btn btn-outline btn-sm', style: { marginTop: '.5rem' }, onClick: function () { setLoading(true); setError(''); } }, 'Опитай отново')
            ) : e('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', overflow: 'hidden' } },
              /* Preview panel */
              previewDoc ? e('div', { style: { borderBottom: '1px solid var(--border)', padding: '.5rem .75rem', display: 'flex', gap: '.5rem', alignItems: 'center', flexShrink: 0 } },
                e('button', { className: 'btn btn-ghost btn-xs', onClick: function () { setPreviewDoc(null); } }, e('i', { className: 'fas fa-arrow-left' }), ' Назад'),
                e('span', { style: { fontWeight: 600, fontSize: '.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: previewDoc.name }, previewDoc.name),
                e('span', { style: { fontSize: '.7rem', color: 'var(--ink-4)' } }, (previewDoc.mimeType || previewDoc.mime_type || '').replace(/^application\//, '').replace(/^text\//, ''))
              ) : null,
              /* Content area */
              previewDoc ? e('div', { style: { flex: '1 1 auto', overflow: 'auto', background: 'var(--surface)', borderRadius: 'var(--r-sm)', margin: '.5rem' } },
                previewLoading ? e('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' } },
                  e('i', { className: 'fas fa-spinner fa-spin' })
                ) : previewError ? e('div', { style: { padding: '1rem', color: 'var(--err)', textAlign: 'center' } }, previewError)
                : _isGoogle && _previewUrl ? e('iframe', { src: _previewUrl, style: { border: 'none', width: '100%', height: '100%', minHeight: '40vh' }, title: previewDoc.name, allow: 'autoplay; fullscreen; picture-in-picture' })
                : (previewDoc.b64 || previewDoc.content) ? e('div', { ref: function (el) { if (el && typeof window.UEVDocViewer !== 'undefined') { window.UEVDocViewer.render(el, { mime: _mime, b64: previewDoc.b64 || null, text: previewDoc.content || null, name: previewDoc.name }); } }, style: { minHeight: '40vh' } })
                : e('div', { style: { padding: '1rem', color: 'var(--ink-4)', textAlign: 'center' } }, 'Няма съдържание за преглед')
              ) : e('div', { style: { flex: '1 1 auto', overflow: 'auto', padding: '.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '.5rem' } },
                /* Type tabs */
                Object.keys(grouped).length > 1 ? e('div', { style: { gridColumn: '1 / -1', display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginBottom: '.25rem' } },
                  Object.entries(grouped).map(function (entry) {
                    var type = entry[0], docs = entry[1];
                    return e('button', { key: type, className: activeType === type ? 'btn btn-primary btn-xs' : 'btn btn-outline btn-xs', onClick: function () { setActiveType(type); } }, type + ' (' + docs.length + ')');
                  })
                ) : null,
                /* Template cards */
                (activeType && grouped[activeType] ? grouped[activeType] : templates).map(function (tpl) {
                  var _id = tpl.id || tpl.drive_file_id || '';
                  var _name = tpl.name || tpl.doc_type || 'Без име';
                  var _desc = tpl.description || tpl.label || '';
                  return e('div', { key: _id, className: 'doc-template-card', onClick: function () { openTemplate(tpl); }, style: { border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '.65rem', cursor: 'pointer', background: 'var(--surface)', transition: 'box-shadow .15s', minHeight: '80px', display: 'flex', flexDirection: 'column', gap: '.25rem' } },
                    e('div', { style: { display: 'flex', alignItems: 'center', gap: '.4rem' } },
                      e('i', { className: 'fas fa-file-alt', style: { color: 'var(--brand-teal)', fontSize: '.85rem' } }),
                      e('span', { style: { fontWeight: 600, fontSize: '.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: _name }, _name)
                    ),
                    _desc ? e('div', { style: { fontSize: '.72rem', color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: _desc }, _desc) : null,
                    e('div', { style: { marginTop: 'auto', fontSize: '.68rem', color: 'var(--ink-5)' } }, (tpl.mime_type || tpl.mimeType || '').replace(/^application\//, '').replace(/^text\//, '') || (tpl.doc_type || ''))
                  );
                })
              )
            ),
            /* Footer */
            e('div', { style: { display: 'flex', justifyContent: 'flex-end', padding: '.5rem .75rem', borderTop: '1px solid var(--border)' } },
              e('button', { className: 'btn btn-primary btn-sm', onClick: onClose }, 'Затвори')
            )
          )
        )
      )
    );
  }

  /* ── exports ────────────────────────────────────────── */
  global.TeamMembersEditor   = TeamMembersEditor;
  global.BudgetEditor       = BudgetEditor;
  global.M_ExpensesView     = M_ExpensesView;
  global.COST_GROUPS        = COST_GROUPS;
  global.MEMBER_ROLES       = MEMBER_ROLES;
  global.BUDGET_RULES_BY_TYPE = BUDGET_RULES_BY_TYPE;
  global.validateBudgetForType = validateBudgetForType;
  global.computeBudgetTotalEUR = computeBudgetTotalEUR;
  global.DocPreviewModal    = DocPreviewModal;
  global.DocumentTemplatesViewer = DocumentTemplatesViewer;
  global.ReportVisualizer    = ReportVisualizer;

  /* ════════════════════════════════════════════════════════════════════════
   *  SelfAssessmentForm (v6.8.0)
   *  Self-assessment scoring for ФНИ/ПНИ/ДНП proposals.
   *  Calls saveSelfAssessment / getSelfAssessment endpoints.
   * ════════════════════════════════════════════════════════════════════════ */
  var SELF_ASSESSMENT_SCHEMAS = {
    'ФНИ': [
      { id: 'publications',     label: 'Публикации (Scopus/WoS)',          max: 30 },
      { id: 'habilitated',      label: 'Хабилитирани лица в екипа',        max: 20 },
      { id: 'prior_projects',   label: 'Участия в предходни проекти',      max: 15 },
      { id: 'expertise',        label: 'Експертиза и квалификация',        max: 15 },
      { id: 'priority_match',   label: 'Съответствие с приоритети',        max: 10 },
      { id: 'international',    label: 'Международно сътрудничество',      max: 10 }
    ],
    'ПНИ': [
      { id: 'publications_patents', label: 'Публикации и патенти',         max: 25 },
      { id: 'habilitated',          label: 'Хабилитирани лица',            max: 15 },
      { id: 'prior_projects',       label: 'Участия в проекти',            max: 15 },
      { id: 'expertise',            label: 'Експертиза',                   max: 10 },
      { id: 'support_letters',      label: 'Писма за подкрепа',            max: 10 },
      { id: 'priority_match',       label: 'Съответствие с приоритети',    max: 10 }
    ],
    'ДНП': [
      { id: 'doctorant_publications', label: 'Публикации на докторанта',   max: 25 },
      { id: 'prior_projects',        label: 'Участие в проекти',           max: 20 },
      { id: 'supervisor',            label: 'Научен ръководител (хабилит.)',max: 20 },
      { id: 'topic_match',           label: 'Съответствие с темата',       max: 15 },
      { id: 'expertise',             label: 'Експертиза',                  max: 10 },
      { id: 'international',         label: 'Международна активност',      max: 10 }
    ]
  };

  function SelfAssessmentForm(props) {
    var projectType = String(props.projectType || '').toUpperCase();
    var proposalId = String(props.proposalId || '').trim();
    var applicantEmail = String(props.applicantEmail || '').trim();
    var disabled = !!props.disabled;
    var schema = SELF_ASSESSMENT_SCHEMAS[projectType] || [];
    var s = props.scores || {};
    var onScoresChange = typeof props.onScoresChange === 'function' ? props.onScoresChange : function() {};

    var total = 0;
    var maxTotal = 0;
    schema.forEach(function(cat) {
      var val = Math.min(Number(s[cat.id]) || 0, cat.max);
      total += val;
      maxTotal += cat.max;
    });
    var threshold = Math.floor(maxTotal * 0.5) + 1;
    var met = total >= threshold;

    return e('div', { style: { marginTop: '.75rem' } },
      e('div', { style: { fontWeight: 700, fontSize: '.93rem', marginBottom: '.4rem' } },
        e('i', { className: 'fas fa-star', style: {marginRight:'.35rem',color:'var(--gold)'} }), 'Самооценка'),
      e('p', { style: { fontSize: '.78rem', color: 'var(--ink-3)', marginBottom: '.6rem' } },
        'Попълнете точките за всяка категория. Минимален праг за допускане: ', e('strong', null, threshold), ' точки (50%+1).'),
      schema.map(function(cat) {
        var val = Math.min(Number(s[cat.id]) || 0, cat.max);
        return e('div', { key: cat.id, style: { display: 'grid', gridTemplateColumns: '1fr 80px', gap: '.4rem', alignItems: 'center', marginBottom: '.3rem' } },
          e('label', { style: { fontSize: '.8rem', color: 'var(--ink-2)' } }, cat.label, ' (макс. ', cat.max, ')'),
          e('input', {
            type: 'number', min: 0, max: cat.max, step: 1,
            value: String(s[cat.id] || ''),
            disabled: disabled,
            style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.8rem', textAlign: 'center', width: '100%' },
            onChange: function(ev) {
              var nv = {};
              nv[cat.id] = Math.min(Math.max(Number(ev.target.value) || 0, 0), cat.max);
              onScoresChange(Object.assign({}, s, nv));
            }
          })
        );
      }),
      e('div', { style: { marginTop: '.6rem', padding: '.5rem .7rem', background: met ? 'var(--ok-bg)' : 'var(--warn-bg)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '.5rem' } },
        e('i', { className: 'fas ' + (met ? 'fa-check-circle' : 'fa-circle-exclamation'), style: { color: met ? 'var(--ok)' : 'var(--warn)', flexShrink: 0 } }),
        e('span', { style: { fontSize: '.83rem', fontWeight: 600, color: met ? 'var(--ok)' : 'var(--warn)' } },
          total, ' / ', maxTotal, ' точки (изискват се ', threshold, ') — ',
          met ? 'ПРАГЪТ Е ДОСТИГНАТ' : 'НЕ ДОСТИГА ПРАГА'))
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  CollaboratorsEditor (v6.8.0)
   *  Student collaborators for ФНИ (max 3).
   * ════════════════════════════════════════════════════════════════════════ */
  function CollaboratorsEditor(props) {
    var value = Array.isArray(props.value) ? props.value : [];
    var onChange = typeof props.onChange === 'function' ? props.onChange : function() {};
    var max = Number(props.max) || 3;
    var disabled = !!props.disabled;

    var addEmpty = function() {
      if (value.length >= max) { try { toast('Максимум ' + max + ' сътрудници', 'warn'); } catch(_) {} return; }
      onChange(value.concat([{ studentName: '', course: '', facultyNumber: '', role: '' }]));
    };
    var remove = function(idx) {
      var nv = value.slice();
      nv.splice(idx, 1);
      onChange(nv);
    };
    var update = function(idx, field, val) {
      var nv = value.slice();
      nv[idx] = Object.assign({}, nv[idx], _kv(field, val));
      onChange(nv);
    };

    return e('div', { style: { marginTop: '.75rem' } },
      e('div', { style: { fontWeight: 700, fontSize: '.93rem', marginBottom: '.4rem' } },
        e('i', { className: 'fas fa-user-graduate', style: {marginRight:'.35rem',color:'var(--primary)'} }), 'Сътрудници-студенти'),
      value.map(function(c, idx) {
        return e('div', { key: idx, style: { display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr auto', gap: '.3rem', alignItems: 'center', marginBottom: '.35rem' } },
          e('input', { value: c.studentName || '', placeholder: 'Три имена', disabled: disabled,
            onChange: function(ev) { update(idx, 'studentName', ev.target.value); },
            style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.78rem' } }),
          e('input', { value: c.course || '', placeholder: 'Специалност/курс', disabled: disabled,
            onChange: function(ev) { update(idx, 'course', ev.target.value); },
            style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.78rem' } }),
          e('input', { value: c.facultyNumber || '', placeholder: 'Факултетен №', disabled: disabled,
            onChange: function(ev) { update(idx, 'facultyNumber', ev.target.value); },
            style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.78rem' } }),
          !disabled && e('button', {
            style: { background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', padding: '.2rem' },
            onClick: function() { remove(idx); },
            title: 'Премахни'
          }, e('i', { className: 'fas fa-times' }))
        );
      }),
      !disabled && e('button', { className: 'btn btn-ghost btn-xs', onClick: addEmpty, style: { marginTop: '.3rem' } },
        e('i', { className: 'fas fa-plus' }), ' Добави сътрудник'),
      value.length > 0 && e('div', { style: { fontSize: '.72rem', color: 'var(--ink-4)', marginTop: '.2rem' } },
        value.length, ' / ', max, ' сътрудника')
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  WorkProgramEditor (v6.8.0)
   *  Structured activities table for project proposals.
   * ════════════════════════════════════════════════════════════════════════ */
  function WorkProgramEditor(props) {
    var value = Array.isArray(props.value) ? props.value : [];
    var onChange = typeof props.onChange === 'function' ? props.onChange : function() {};
    var disabled = !!props.disabled;

    var addRow = function() {
      onChange(value.concat([{ description: '', method: '', result: '', startMonth: 1, durationMonths: 1 }]));
    };
    var removeRow = function(idx) {
      var nv = value.slice();
      nv.splice(idx, 1);
      onChange(nv);
    };
    var updateRow = function(idx, field, val) {
      var nv = value.slice();
      nv[idx] = Object.assign({}, nv[idx], _kv(field, val));
      onChange(nv);
    };

    return e('div', { style: { marginTop: '.75rem' } },
      e('div', { style: { fontWeight: 700, fontSize: '.93rem', marginBottom: '.4rem' } },
        e('i', { className: 'fas fa-table', style: {marginRight:'.35rem',color:'var(--primary)'} }), 'Работна програма'),
      e('p', { style: { fontSize: '.78rem', color: 'var(--ink-3)', marginBottom: '.4rem' } },
        'Таблично описание на дейностите — описание, начин на изпълнение, резултат, начален месец и продължителност.'),
      value.map(function(row, idx) {
        return e('div', { key: idx, style: { padding: '.4rem', marginBottom: '.4rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4 } },
          e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem', marginBottom: '.3rem' } },
            e('input', { value: row.description || '', placeholder: 'Описание на дейността', disabled: disabled,
              onChange: function(ev) { updateRow(idx, 'description', ev.target.value); },
              style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.78rem' } }),
            e('input', { value: row.method || '', placeholder: 'Начин на изпълнение', disabled: disabled,
              onChange: function(ev) { updateRow(idx, 'method', ev.target.value); },
              style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.78rem' } })
          ),
          e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 80px 80px auto', gap: '.3rem', alignItems: 'center' } },
            e('input', { value: row.result || '', placeholder: 'Очакван резултат', disabled: disabled,
              onChange: function(ev) { updateRow(idx, 'result', ev.target.value); },
              style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.78rem' } }),
            e('select', { value: String(row.startMonth || 1), disabled: disabled,
              onChange: function(ev) { updateRow(idx, 'startMonth', Number(ev.target.value) || 1); },
              style: { padding: '.25rem .3rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.72rem' } },
              [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24].map(function(m) {
                return e('option', { key: m, value: String(m) }, 'M' + m);
              })),
            e('select', { value: String(row.durationMonths || 1), disabled: disabled,
              onChange: function(ev) { updateRow(idx, 'durationMonths', Number(ev.target.value) || 1); },
              style: { padding: '.25rem .3rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.72rem' } },
              [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m) {
                return e('option', { key: m, value: String(m) }, m + ' мес.');
              })),
            !disabled && e('button', {
              style: { background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', padding: '.2rem' },
              onClick: function() { removeRow(idx); },
              title: 'Премахни'
            }, e('i', { className: 'fas fa-trash' }))
          )
        );
      }),
      !disabled && e('button', { className: 'btn btn-ghost btn-xs', onClick: addRow },
        e('i', { className: 'fas fa-plus' }), ' Добави дейност')
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  SupportLettersUpload (v6.8.0)
   *  Upload support letters for ПНИ projects (max 2).
   * ════════════════════════════════════════════════════════════════════════ */
  function SupportLettersUpload(props) {
    var value = Array.isArray(props.value) ? props.value : [];
    var onChange = typeof props.onChange === 'function' ? props.onChange : function() {};
    var disabled = !!props.disabled;
    var max = 2;

    var addEmpty = function() {
      if (value.length >= max) { try { toast('Максимум ' + max + ' писма', 'warn'); } catch(_) {} return; }
      onChange(value.concat([{ organizationName: '', organizationType: 'bulgarian', fileId: '', fileName: '', description: '' }]));
    };
    var remove = function(idx) {
      var nv = value.slice();
      nv.splice(idx, 1);
      onChange(nv);
    };
    var update = function(idx, field, val) {
      var nv = value.slice();
      nv[idx] = Object.assign({}, nv[idx], _kv(field, val));
      onChange(nv);
    };

    var handleFile = function(idx, file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        update(idx, 'fileId', ev.target.result);
        update(idx, 'fileName', file.name);
      };
      reader.readAsDataURL(file);
    };

    return e('div', { style: { marginTop: '.75rem' } },
      e('div', { style: { fontWeight: 700, fontSize: '.93rem', marginBottom: '.4rem' } },
        e('i', { className: 'fas fa-envelope', style: {marginRight:'.35rem',color:'var(--ok)'} }), 'Писма за подкрепа'),
      e('p', { style: { fontSize: '.78rem', color: 'var(--ink-3)', marginBottom: '.4rem' } },
        'Приложете до 2 писма за подкрепа от бизнес/научни организации (за ПНИ проекти).'),
      value.map(function(l, idx) {
        var _hasFile = !!l.fileId;
        return e('div', { key: idx, style: { padding: '.4rem', marginBottom: '.35rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4 } },
          e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.3rem', marginBottom: '.3rem' } },
            e('input', { value: l.organizationName || '', placeholder: 'Име на организацията', disabled: disabled,
              onChange: function(ev) { update(idx, 'organizationName', ev.target.value); },
              style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.78rem' } }),
            e('select', { value: l.organizationType || 'bulgarian', disabled: disabled,
              onChange: function(ev) { update(idx, 'organizationType', ev.target.value); },
              style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.78rem' } },
              e('option', { value: 'bulgarian' }, 'Българска организация'),
              e('option', { value: 'foreign' }, 'Чуждестранна организация'))
          ),
          e('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '.3rem', alignItems: 'center' } },
            e('input', { value: l.description || '', placeholder: 'Описание на писмото', disabled: disabled,
              onChange: function(ev) { update(idx, 'description', ev.target.value); },
              style: { padding: '.25rem .4rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.78rem' } }),
            e('div', { style: { display: 'flex', gap: '.25rem', alignItems: 'center' } },
              _hasFile && e('button', { type: 'button', className: 'btn btn-outline btn-xs', title: 'Преглед на файла', onClick: function () { if (typeof DocPreviewModal === 'function' && typeof setPreviewDoc === 'function') setPreviewDoc({ id: l.fileId, name: l.fileName || l.organizationName || 'Писмо', mimeType: 'application/pdf', previewLink: l.fileId }); } }, e('i', { className: 'fas fa-eye' })),
              !disabled && e('button', {
                style: { background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer', padding: '.2rem' },
                onClick: function() { remove(idx); }, title: 'Премахни'
              }, e('i', { className: 'fas fa-times' }))
            )
          )
        );
      }),
      !disabled && e('button', { className: 'btn btn-ghost btn-xs', onClick: addEmpty, style: { marginTop: '.2rem' } },
        e('i', { className: 'fas fa-plus' }), ' Добави писмо'),
      value.length > 0 && e('div', { style: { fontSize: '.72rem', color: 'var(--ink-4)', marginTop: '.2rem' } },
        value.length, ' / ', max, ' писма')
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  SelfAssessmentSection (Task 22)
   *  Composes the four already-built sub-forms (SelfAssessmentForm,
   *  a TRL selector, WorkProgramEditor, SupportLettersUpload) and wires each
   *  to its backend handler (get/save SelfAssessment, TRL, WorkProgram,
   *  SupportLetters). Self-contained & controlled — owns all state.
   * ════════════════════════════════════════════════════════════════════════ */
  function SelfAssessmentSection(props) {
    var proposalId = String(props.proposalId || '').trim();
    var projectType = String(props.projectType || '').toUpperCase();
    var applicantEmail = String(props.applicantEmail || '').trim();
    var disabled = !!props.disabled;

    var sa = _useState(null); var scores = sa[0]; var setScores = sa[1];
    var trl = _useState(''); var trlLevel = trl[0]; var setTrlLevel = trl[1];
    var trlDesc = _useState(''); var setTrlDesc = trlDesc[1];
    var wp = _useState([]); var workProgram = wp[0]; var setWorkProgram = wp[1];
    var sl = _useState([]); var supportLetters = sl[0]; var setSupportLetters = sl[1];
    var loadState = _useState('idle'); var loading = loadState[0]; var setLoading = loadState[1];
    var saving = _useState(''); var savingKey = saving[0]; var setSaving = saving[1];
    var msg = _useState(''); var message = msg[0]; var setMessage = msg[1];

    var _apiFn = _api();

    _useEffect(function () {
      if (!proposalId) { setLoading(false); return; }
      setLoading(true); setMessage('');
      Promise.all([
        _apiFn('getSelfAssessment', { proposalId: proposalId, projectType: projectType, email: applicantEmail }),
        _apiFn('getTRL', { proposalId: proposalId }),
        _apiFn('getWorkProgram', { proposalId: proposalId }),
        _apiFn('getSupportLetters', { proposalId: proposalId })
      ]).then(function (res) {
        var r = res || [];
        if (r[0] && r[0].success && r[0].found) setScores(r[0].scores || {}); else setScores({});
        if (r[1] && r[1].success && r[1].found) { setTrlLevel(String(r[1].trlLevel || r[1].trl || '')); setTrlDesc(r[1].description || ''); }
        if (r[2] && r[2].success) setWorkProgram(Array.isArray(r[2].activities) ? r[2].activities : []);
        if (r[3] && r[3].success) setSupportLetters(Array.isArray(r[3].letters) ? r[3].letters : []);
        setLoading(false);
      }).catch(function () { setMessage('Грешка при зареждане на секциите.'); setLoading(false); });
    }, [proposalId, projectType, applicantEmail]);

    var _save = function (key, action, payload) {
      if (!proposalId || disabled) return Promise.resolve(false);
      setSaving(key); setMessage('');
      return _apiFn(action, Object.assign({ proposalId: proposalId, email: applicantEmail }, payload))
        .then(function (r) { if (!r || !r.success) setMessage((r && r.error) || 'Неуспешен запис.'); return !!(r && r.success); })
        .catch(function () { setMessage('Мрежова грешка при запис.'); return false; })
        .then(function (ok) { setSaving(''); return ok; });
    };

    var _onScores = function (s) { setScores(s); _save('sa', 'saveSelfAssessment', { projectType: projectType, scores: s }); };
    var _onTrl = function (lvl) { setTrlLevel(lvl); if (lvl) _save('trl', 'saveTRL', { trlLevel: Number(lvl), description: trlDesc }); };
    var _onTrlDesc = function (v) { setTrlDesc(v); if (trlLevel) _save('trl', 'saveTRL', { trlLevel: Number(trlLevel), description: v }); };
    var _onWorkProgram = function (v) { setWorkProgram(v); _save('wp', 'saveWorkProgram', { activities: v }); };
    var _onSupportLetters = function (v) { setSupportLetters(v); _save('sl', 'saveSupportLetters', { letters: v }); };

    if (!proposalId) {
      return e('div', { className: 'card', style: { padding: '.9rem', color: 'var(--ink-3)', fontSize: '.8rem' } },
        e('i', { className: 'fas fa-info-circle' }), ' Изберете проект, за да видите допълнителните секции (самооценка, TRL, работна програма, писма за подкрепа).');
    }

    return e('div', { className: 'card', style: { marginBottom: '.7rem' } },
      e('div', { className: 'card-header' },
        e('h3', { className: 'card-title' }, e('i', { className: 'fas fa-layer-group', style: { marginRight: '.4rem', color: 'var(--primary)' } }), 'Допълнителни секции към проекта'),
        loading && e('span', { style: { fontSize: '.74rem', color: 'var(--ink-3)' } }, e('i', { className: 'fas fa-spinner fa-spin' }), ' зареждане…')),
      e('div', { className: 'card-body' },
        message && e('div', { style: { fontSize: '.74rem', color: 'var(--ink-2)', marginBottom: '.5rem', padding: '.35rem .5rem', background: 'var(--surface-2)', borderRadius: 4 } }, message),
        e('div', { style: { borderBottom: '1px solid var(--border)', paddingBottom: '.6rem', marginBottom: '.6rem' } },
          e(SelfAssessmentForm, { projectType: projectType, proposalId: proposalId, applicantEmail: applicantEmail, disabled: disabled, scores: scores || {}, onScoresChange: _onScores })),
        e('div', { style: { borderBottom: '1px solid var(--border)', paddingBottom: '.6rem', marginBottom: '.6rem' } },
          e('div', { style: { fontWeight: 700, fontSize: '.93rem', marginBottom: '.4rem' } }, e('i', { className: 'fas fa-signal', style: { marginRight: '.35rem', color: 'var(--info)' } }), 'TRL (ниво на технологична готовност)'),
          e('div', { style: { display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' } },
            e('select', { value: trlLevel || '', disabled: disabled, onChange: function (ev) { _onTrl(ev.target.value); }, style: { padding: '.3rem .45rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.8rem' } },
              e('option', { value: '' }, '— избери ниво —'),
              [1,2,3,4,5,6,7,8,9].map(function (n) { return e('option', { key: n, value: String(n) }, 'TRL ' + n); })),
            e('input', { value: trlDesc || '', placeholder: 'Описание / доказателства', disabled: disabled,
              onChange: function (ev) { _onTrlDesc(ev.target.value); },
              style: { flex: 1, minWidth: 180, padding: '.3rem .45rem', border: '1px solid var(--border)', borderRadius: 4, fontSize: '.8rem' } }),
            savingKey === 'trl' && e('i', { className: 'fas fa-spinner fa-spin', style: { color: 'var(--ink-3)' } }))),
        e('div', { style: { borderBottom: '1px solid var(--border)', paddingBottom: '.6rem', marginBottom: '.6rem' } },
          e(WorkProgramEditor, { value: workProgram, onChange: _onWorkProgram, disabled: disabled })),
        e('div', null,
          e(SupportLettersUpload, { value: supportLetters, onChange: _onSupportLetters, disabled: disabled }))
      )
    );
  }

  /* ── exports v6.8.0 ──────────────────────────────────────────── */
    global.SelfAssessmentForm   = SelfAssessmentForm;
    global.CollaboratorsEditor  = CollaboratorsEditor;
    global.WorkProgramEditor    = WorkProgramEditor;
    global.SupportLettersUpload = SupportLettersUpload;
    global.SelfAssessmentSection = SelfAssessmentSection;

    /* ════════════════════════════════════════════════════════════════════
     *  ReportVisualizer — Google-styled visualization for project reports.
     *  Renders a KPI bar-chart summary of all reports for a proposal,
     *  with progress bars, status badges, and deadline indicators.
     *  Feeds the same _api() as the rest of proposal-extras.
     * ════════════════════════════════════════════════════════════════════ */
    function ReportVisualizer(props) {
      var projectId = String(props.projectId || props.id || '');
      var onClose = typeof props.onClose === 'function' ? props.onClose : function() {};
      var _api2 = _api;
      var _toast2 = _toast;
      var _reports = useState([]);
      var reports = _reports[0]; var setReports = _reports[1];
      var _loading = useState(true);
      var loading = _loading[0]; var setLoading = _loading[1];
      var _error = useState('');
      var error = _error[0]; var setError = _error[1];

      useEffect(function () {
        if (!projectId) { setLoading(false); return; }
        setLoading(true); setError(''); setReports([]);
        _api2()('getreports', { projectId: projectId }).then(function (res) {
          if (!res || !res.success) { setError(res && res.error ? res.error : 'Грешка'); setLoading(false); return; }
          setReports(res.reports || []);
          setLoading(false);
        }).catch(function () { setError('Мрежова грешка'); setLoading(false); });
      }, [projectId]);

      var statusColor = function (s) {
        var map = { submitted: 'var(--ok)', accepted: 'var(--ok)', reviewed: 'var(--gold)', approved: 'var(--ok)', rejected: 'var(--err)', pending: 'var(--ink-4)', overdue: 'var(--err)' };
        return map[s] || 'var(--ink-4)';
      };

      var progressColor = function (p) {
        var n = Number(p) || 0;
        if (n >= 75) return 'var(--ok)';
        if (n >= 40) return 'var(--warn)';
        return 'var(--err)';
      };

      return e(_portal, {},
        e('div', { className: 'modal-overlay', onClick: onClose, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Визуализация на отчети' },
          e('div', { className: 'modal-box modal-form', onClick: function (ev) { ev.stopPropagation(); }, style: { maxWidth: '780px', width: '92%' } },
            e('div', { className: 'modal-head' },
              e('h3', { style: { fontSize: '.92rem', margin: 0 } }, 'Визуализация на отчети' + (projectId ? ' — ' + projectId : '')),
              e('button', { className: 'close-btn', onClick: onClose, 'aria-label': 'Затвори' }, e('i', { className: 'fas fa-times' }))
            ),
            e('div', { className: 'modal-body', style: { display: 'flex', flexDirection: 'column', maxHeight: '72vh', overflow: 'hidden' } },
              loading ? e('div', { style: { flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '.75rem' } },
                e('i', { className: 'fas fa-spinner fa-spin', style: { fontSize: '1.6rem', color: 'var(--ink-4)' } }),
                e('span', { style: { fontSize: '.82rem', color: 'var(--ink-3)' } }, 'Зареждане на отчети…')
              ) : error ? e('div', { style: { padding: '1rem', textAlign: 'center', color: 'var(--err)' } },
                e('i', { className: 'fas fa-exclamation-triangle', style: { fontSize: '1.2rem', marginBottom: '.5rem', display: 'block' } }),
                error,
                e('button', { className: 'btn btn-outline btn-sm', style: { marginTop: '.5rem' }, onClick: function () { setLoading(true); setError(''); } }, 'Опитай отново')
              ) : reports.length === 0 ? e('div', { className: 'empty-state', style: { padding: '2rem', textAlign: 'center' } },
                e('div', { className: 'empty-state-icon' }, e('i', { className: 'fas fa-file-alt', style: { color: 'var(--ink-4)' } })),
                e('p', { style: { color: 'var(--ink-3)' } }, 'Няма отчети за този проект'))
                : (
                  e('div', { style: { display: 'flex', gap: '.75rem', marginBottom: '1rem', flexWrap: 'wrap' } },
                    e('div', { style: { flex: '1 1 140px', padding: '.6rem .75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' } },
                      e('div', { style: { fontSize: '.68rem', color: 'var(--ink-4)' } }, 'Общо отчети'),
                      e('div', { style: { fontSize: '1.5rem', fontWeight: 700 } }, reports.length)
                    ),
                    e('div', { style: { flex: '1 1 140px', padding: '.6rem .75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' } },
                      e('div', { style: { fontSize: '.68rem', color: 'var(--ink-4)' } }, 'Одобрени'),
                      e('div', { style: { fontSize: '1.5rem', fontWeight: 700, color: 'var(--ok)' } }, reports.filter(function (r) { return r.status === 'accepted' || r.status === 'approved'; }).length)
                    ),
                    e('div', { style: { flex: '1 1 140px', padding: '.6rem .75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' } },
                      e('div', { style: { fontSize: '.68rem', color: 'var(--ink-4)' } }, 'Просрочени'),
                      e('div', { style: { fontSize: '1.5rem', fontWeight: 700, color: 'var(--err)' } }, reports.filter(function (r) { return r.status === 'overdue'; }).length)
                    ),
                    e('div', { style: { flex: '1 1 140px', padding: '.6rem .75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' } },
                      e('div', { style: { fontSize: '.68rem', color: 'var(--ink-4)' } }, 'Среден напредък'),
                      e('div', { style: { fontSize: '1.5rem', fontWeight: 700, color: 'var(--brand-teal)' } }, Math.round(reports.reduce(function (s, r) { return s + (Number(r.progress) || 0); }, 0) / Math.max(1, reports.length)) + '%')
                    )
                  ),
                  e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '.6rem', overflow: 'auto', flex: '1 1 auto' } },
                    reports.map(function (r, idx) {
                      var _prog = Math.min(100, Math.max(0, Number(r.progress) || 0));
                      var _pc = progressColor(r.progress);
                      return e('div', { key: r.id || idx, className: 'report-viz-card', style: { border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '.65rem', background: 'var(--surface)', borderLeft: '4px solid ' + statusColor(r.status) } },
                        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.3rem' } },
                          e('span', { style: { fontWeight: 600, fontSize: '.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }, title: r.title || 'Без заглавие' }, r.title || 'Без заглавие'),
                          e('span', { style: { fontSize: '.64rem', padding: '.12rem .45rem', background: statusColor(r.status) + '22', color: statusColor(r.status), fontWeight: 700, borderRadius: 'var(--r-pill)', whiteSpace: 'nowrap' } }, r.status || '—')
                        ),
                        e('div', { style: { fontSize: '.7rem', color: 'var(--ink-4)', marginBottom: '.3rem' } },
                          'Дедлайн: ', new Date(r.deadline || Date.now()).toLocaleDateString('bg-BG'),
                          r.createdAt ? ' · Създаден: ' + new Date(r.createdAt).toLocaleDateString('bg-BG') : ''
                        ),
                        e('div', { style: { display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.72rem' } },
                          e('span', { style: { flex: '1' } }, 'Напредък'),
                          e('span', { style: { fontWeight: 700, color: _pc } }, _prog + '%')
                        ),
                        e('div', { style: { height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden', marginTop: '.25rem' } },
                          e('div', { style: { height: '100%', width: _prog + '%', background: _pc, borderRadius: '3px' } })
                        )
                      );
                    })
                  )
                ),
              e('div', { style: { display: 'flex', justifyContent: 'flex-end', padding: '.5rem .75rem', borderTop: '1px solid var(--border)' } },
                e('button', { className: 'btn btn-primary btn-sm', onClick: onClose }, 'Затвори')
              )
            )
          )
        )
      );
    }

    /* ── exports ──────────────────────────────────────────────────────────── */
    global.TeamMembersEditor     = TeamMembersEditor;
    global.BudgetEditor         = BudgetEditor;
    global.M_ExpensesView       = M_ExpensesView;
    global.COST_GROUPS          = COST_GROUPS;
    global.MEMBER_ROLES         = MEMBER_ROLES;
    global.BUDGET_RULES_BY_TYPE = BUDGET_RULES_BY_TYPE;
    global.validateBudgetForType    = validateBudgetForType;
    global.computeBudgetTotalEUR    = computeBudgetTotalEUR;
    global.DocPreviewModal          = DocPreviewModal;
    global.DocumentTemplatesViewer  = DocumentTemplatesViewer;
    global.ReportVisualizer         = ReportVisualizer;

    /* ════════════════════════════════════════════════════════════════════
     *  GoogleDocEditorModal — Google Docs-styled inline document editor.
     *  Replaces the native browser file picker with a modal where users can
     *  create a document directly and save it to MySQL (documents table).
     *  Props: formId, projectType, userEmail, onClose, onSaved
     *  Saves via the savedocumentcontent handler (upserts into `documents`;
     *  inserts when the doc is new) and attaches the created document to the
     *  form via attachdocumenttoform so it appears in the form's docs list.
     *  Google Docs blue theme (#1a73e8) + clean white paper editor area.
     * ════════════════════════════════════════════════════════════════════ */
    var GoogleDocEditorModal = function (props) {
      var _formId = String(props.formId || '');
      var _userEmail = String(props.userEmail || '');
      var _onClose = typeof props.onClose === 'function' ? props.onClose : function () {};
      var _onSaved = typeof props.onSaved === 'function' ? props.onSaved : function () {};
      var _title = useState('Нов документ');
      var title = _title[0]; var setTitle = _title[1];
      var _content = useState('');
      var content = _content[0]; var setContent = _content[1];
      var _saving = useState(false);
      var saving = _saving[0]; var setSaving = _saving[1];
      var _error = useState('');
      var error = _error[0]; var setError = _error[1];

      // ERP-owned synthetic id (up_ prefix) — same convention as uploadmydocument.
      // Real Drive ids are never available for newly typed docs, so the document
      // is visualised/edited via the ERP's own content copy (savedocumentcontent).
      function _newDocId() {
        return 'up_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      }

      function handleSave() {
        if (!String(title).trim()) { setError('Заглавието не може да бъде празно'); return; }
        if (!String(content).trim()) { setError('Съдържанието не може да бъде празно'); return; }
        setSaving(true); setError('');
        var docId = _newDocId();
        var docName = String(title).trim();
        _api()('savedocumentcontent', {
          docId: docId,
          content: content,
          name: docName,
          mimeType: 'text/plain',
          formId: _formId,
          userId: _userEmail
        }).then(function (res) {
          if (!res || !res.success) {
            setError((res && res.error) || 'Грешка при запазване');
            return;
          }
          // Attach the freshly created document to the form so it appears in the
          // form's document list immediately (best-effort).
          var attachP = Promise.resolve();
          if (_formId) {
            attachP = _api()('attachdocumenttoform', {
              formId: _formId,
              docId: docId,
              docMeta: { name: docName, mimeType: 'text/plain', _generated: true }
            }).catch(function () { /* best-effort attach */ });
          }
          return attachP.then(function () {
            _onSaved({ id: docId, name: docName, title: docName, content: content, mimeType: 'text/plain', origin: 'generated', _generated: true });
          });
        }).catch(function () {
          setError('Мрежова грешка при запазване');
        }).finally(function () {
          setSaving(false);
        });
      }

      return e(_portal, {},
        e('div', { className: 'modal-overlay', onClick: _onClose, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Google Docs стил редактор' },
          e('div', { className: 'modal-box modal-form', onClick: function (ev) { ev.stopPropagation(); }, style: { maxWidth: '820px', width: '94%' } },
            e('div', { className: 'modal-head', style: { borderBottom: '1px solid #dadce0' } },
              e('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem' } },
                e('div', { style: { width: '32px', height: '32px', background: '#1a73e8', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '.72rem' } }, 'GD'),
                e('span', { style: { fontWeight: 600, fontSize: '.88rem', color: '#202124' } }, 'Google Docs — Редактор')
              ),
              e('button', { className: 'close-btn', onClick: _onClose, 'aria-label': 'Затвори' }, e('i', { className: 'fas fa-times' }))
            ),
            e('div', { className: 'modal-body', style: { padding: 0, display: 'flex', flexDirection: 'column', maxHeight: '72vh' } },
              e('div', { style: { padding: '.6rem .75rem', borderBottom: '1px solid #dadce0', display: 'flex', gap: '.5rem', alignItems: 'center' } },
                e('input', { type: 'text', value: title, onChange: function (ev) { setTitle(ev.target.value); }, placeholder: 'Въведете заглавие…', style: { flex: '1', border: '1px solid transparent', borderBottom: '1px solid #dadce0', padding: '.3rem .5rem', fontSize: '.82rem', outline: 'none', background: 'transparent' }, onFocus: function (ev) { ev.target.style.borderBottomColor = '#1a73e8'; }, onBlur: function (ev) { ev.target.style.borderBottomColor = '#dadce0'; } }),
                e('div', { style: { display: 'flex', gap: '.4rem', alignItems: 'center' } },
                  saving && e('span', { style: { fontSize: '.68rem', color: 'var(--ink-4)' } }, 'Запазване…'),
                  e('button', { className: 'btn btn-google btn-sm', onClick: handleSave, disabled: saving, style: { background: '#1a73e8', color: '#fff', border: 'none' } }, e('i', { className: 'fas fa-check' }), ' Запази'),
                  e('button', { className: 'btn btn-outline btn-sm', onClick: _onClose }, 'Затвори')
                )
              ),
              error ? e('div', { style: { padding: '.4rem .75rem', background: '#fce8e6', color: '#c5221f', fontSize: '.78rem' } }, e('i', { className: 'fas fa-exclamation-circle' }), ' ', error) : null,
              e('div', { style: { flex: '1 1 auto', overflow: 'hidden', display: 'flex' } },
                e('textarea', { value: content, onChange: function (ev) { setContent(ev.target.value); }, placeholder: 'Започнете да пишете документа тук…', style: { flex: '1', border: 'none', padding: '.75rem 1rem', fontSize: '.85rem', fontFamily: '"Google Sans", "Noto Sans", sans-serif', resize: 'none', outline: 'none', lineHeight: '1.6', color: '#202124', background: 'var(--surface)' } }))
            )
          )
        )
      );
    };

    /* ── exports v6.8.0 ──────────────────────────────────────────── */
    global.CollaboratorsEditor  = CollaboratorsEditor;
    global.WorkProgramEditor    = WorkProgramEditor;
    global.SupportLettersUpload = SupportLettersUpload;
    global.GoogleDocEditorModal = GoogleDocEditorModal;
  })(typeof window !== 'undefined' ? window : this);
