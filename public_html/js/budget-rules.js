/**
 * budget-rules.js — Per-project-type budget category caps for the Proposal Wizard
 * Generated from erpdocz source documents (2026 competition session)
 * This file is loaded by Step3Budget.js
 */

  window.__BUDGET_RULES__ = {
  "ФНИ": {
    "totalCapEUR": 12000,
    "currency": "EUR",
    "categories": [
      {
        "key": "personnel",
        "label": "Възнаграждения (научен екип, експерти, административен персонал)",
        "maxPercent": 40,
        "description": "Заплати, граждански договори, авторски хонорари за научен екип"
      },
      {
        "key": "equipment",
        "label": "Придобиване на ДМА и НДМА (компютърна техника, хардуер, софтуер, лабораторно оборудване)",
        "maxPercent": 30,
        "description": "На база на заявка и обосновка от ръководителя на екипа"
      },
      {
        "key": "materials",
        "label": "Разходи за материали и канцеларски доставки",
        "maxPercent": 10,
        "description": "Разходи за закупуване на материали за изследването"
      },
      {
        "key": "travel_domestic",
        "label": "Командировки в страната за участие в научни прояви",
        "maxPercent": 10,
        "description": "Съгласно Наредба за командировки в страната"
      },
      {
        "key": "travel_international",
        "label": "Командировки в чужбина за участие в научни прояви",
        "maxPercent": 20,
        "description": "Съгласно Наредба за служебни командировки и специализации в чужбина"
      },
      {
        "key": "publications",
        "label": "Такси за публикуване (Scopus/Web of Science, монографии)",
        "maxPercent": 10,
        "description": "Публикации с афилиация University of Economics - Varna"
      },
      {
        "key": "empirical",
        "label": "Разходи за провеждане на емпирично изследване",
        "maxPercent": 20,
        "description": "Средства за респонденти, фокус групи, апробиране"
      },
      {
        "key": "external_reviewers",
        "label": "Възнаграждения на външни рецензенти",
        "maxPercent": 5,
        "description": "Два рецензента, зададени с предварително съгласие за 10 дни, срещу възнаграждение по заповед на ректора"
      },
      {
        "key": "overhead",
        "label": "Общи разходи (overhead) — до 25% от стойността на договора",
        "maxPercent": 10,
        "description": "Административни разходи, не директно атрибутирани на дейности"
      }
    ]
  },
  "ПНИ": {
    "totalCapEUR": 12000,
    "currency": "EUR",
    "categories": [
      {
        "key": "personnel",
        "label": "Възнаграждения (научен екип, експерти, административен персонал)",
        "maxPercent": 35,
        "description": "Заплати, граждански договори, възнаграждения за експерти"
      },
      {
        "key": "equipment",
        "label": "Придобиване на ДМА и НДМА (компютърна техника, хардуер, софтуер)",
        "maxPercent": 25,
        "description": "На база на заявка и обосновка от ръководителя на екипа"
      },
      {
        "key": "materials",
        "label": "Разходи за материали и канцеларски доставки",
        "maxPercent": 10,
        "description": "Разходи за закупуване на материали за изследването"
      },
      {
        "key": "travel_domestic",
        "label": "Командировки в страната за участие в научни прояви",
        "maxPercent": 10,
        "description": "Съгласно Наредба за командировки в страната"
      },
      {
        "key": "travel_international",
        "label": "Командировки в чужбина за участие в научни прояви",
        "maxPercent": 15,
        "description": "Съгласно Наредба за служебни командировки и специализации в чужбина"
      },
      {
        "key": "publications",
        "label": "Такси за публикуване в издания (Scopus/Web of Science)",
        "maxPercent": 10,
        "description": "Публикации с афилиация Икономически университет – Варна"
      },
      {
        "key": "conferences",
        "label": "Такси за участие в конференции, изложения, специализирани събития",
        "maxPercent": 5,
        "description": "Панаири, уъркшопове и др."
      },
      {
        "key": "empirical",
        "label": "Разходи за провеждане на емпирично изследване и апробиране",
        "maxPercent": 25,
        "description": "Включва апробиране на резултатите"
      },
      {
        "key": "utility_model",
        "label": "Разходи за регистрация на полезен модел",
        "maxPercent": 5,
        "description": "Патентни такси и свързани разходи"
      },
      {
        "key": "external_reviewers",
        "label": "Възнаграждения на външни рецензенти",
        "maxPercent": 5,
        "description": "Два рецензента с предварително съгласие"
      },
      {
        "key": "overhead",
        "label": "Общи разходи (overhead)",
        "maxPercent": 10,
        "description": "Административни разходи"
      }
    ]
  },
  "ДНП": {
    "totalCapEUR": 5000,
    "currency": "EUR",
    "categories": [
      {
        "key": "literature",
        "label": "Закупуване на специализирана научна литература",
        "maxPercent": 15,
        "description": "Книги, статии, електронни ресурси за дисертацията"
      },
      {
        "key": "data",
        "label": "Закупуване на данни и информационни масиви / абониране за електронни ресурси",
        "maxPercent": 15,
        "description": "Бази данни, статистически пакети, специализиран софтуер"
      },
      {
        "key": "materials",
        "label": "Канцеларски материали",
        "maxPercent": 10,
        "description": "Основни канцеларски разходи"
      },
      {
        "key": "travel",
        "label": "Командировки, свързани с изследването",
        "maxPercent": 15,
        "description": "Пътувания за събиране на данни, консултации"
      },
      {
        "key": "reviewers_annual",
        "label": "Възнаграждение за рецензиране на годишен отчет",
        "fixedEUR": 25,
        "description": "Годишно, в т.ч. осигурителни вноски"
      },
      {
        "key": "reviewers_final",
        "label": "Възнаграждения на рецензенти (финален етап)",
        "fixedEUR": 60,
        "description": "В последната година на изпълнение, с граждански договор, по заповед на ректора"
      },
      {
        "key": "editing",
        "label": "Научна и стилова редакция, копирни услуги",
        "maxPercent": 10,
        "description": "Редакция на дисертацията и публикации"
      },
      {
        "key": "printing",
        "label": "Оформление, подвързване и отпечатване на дисертационен труд",
        "maxPercent": 10,
        "description": "Печат на завършената дисертация"
      },
      {
        "key": "translation",
        "label": "Превод на публикации, резултат от изследването",
        "maxPercent": 10,
        "description": "Превод на статии за публикуване"
      },
      {
        "key": "conferences",
        "label": "Такси за участие в конференции",
        "maxPercent": 10,
        "description": "Участие с доклади от дисертацията"
      },
      {
        "key": "publications_oa",
        "label": "Такси за публикуване в списания с отворен достъп (вторични бази)",
        "maxPercent": 10,
        "description": "CEEOL, RePEC, ERIH+, DOAJ и др."
      },
      {
        "key": "publications_scopus",
        "label": "Такси за публикуване в Scopus/Web of Science (афилиация ИУ-Варна)",
        "maxPercent": 15,
        "description": "Основни публикации от дисертацията"
      }
    ]
  },
  "НПФ": {
    "totalCapEUR": {
      "round_table": 2500,
      "scientific_event": 6000,
      "department_event": 3000
    },
    "currency": "EUR",
    "categories": [
      {
        "key": "visual_identity",
        "label": "Визуална идентичност на събитието (уеб сайт, лого, брандинг)",
        "maxPercent": 15,
        "description": "До 15% от стойността на договора"
      },
      {
        "key": "print_proceedings",
        "label": "Издаване на събиране с доклади (печат/подвързване)",
        "maxPercent": 20,
        "description": "Предпечат, дизайн, графично оформление, стилова редакция, отпечатване, подвързване"
      },
      {
        "key": "digital_proceedings",
        "label": "Дигитален вариант на събиране с доклади",
        "maxPercent": 15,
        "description": "Дизайн, графично оформление, стилова редакция"
      },
      {
        "key": "doi",
        "label": "Идентификатор на цифров обект (DOI)",
        "description": "1 евро за всеки DOI + възнаграждение (0-20: 15€, 21-40: 30€, 41-60: 45€, 60+: 100€)",
        "variable": true
      },
      {
        "key": "metadata_databases",
        "label": "Създаване на метаданни в бази данни (CEEOL, RePEC, ERIH+, DOAJ)",
        "fixedEUR": 50,
        "description": "На база данни"
      },
      {
        "key": "metadata_bpos",
        "label": "Създаване на метаданни в Българския портал за отворена наука (BPOS)",
        "fixedEUR": 50,
        "description": "За 20 публикации"
      },
      {
        "key": "reviewers",
        "label": "Възнаграждение на рецензенти",
        "fixedEUR": 51.13,
        "description": "До 51.13 евро в т.ч. осигурителни вноски, на един рецензент, по заповед на ректора"
      }
    ]
  }
};

// ═══════════════════════════════════════════════════════════════════════
// T40: Budget Template Library — reusable budget templates
// ═══════════════════════════════════════════════════════════════════════
// Default templates seeded when none exist in the DB. These mirror the
// per-project-type category splits defined in __BUDGET_RULES__ above.

window.__BUDGET_TEMPLATES__ = {
  "ФНИ": [
    {
      id: 'default_fni_balanced',
      name: 'Балансиран бюджет (ФНИ)',
      description: 'Равномерно разпределение по категории',
      isShared: true,
      categories: [
        { code: 'personnel', allocatedPercent: 30 },
        { code: 'equipment', allocatedPercent: 20 },
        { code: 'materials', allocatedPercent: 10 },
        { code: 'travel_domestic', allocatedPercent: 5 },
        { code: 'travel_international', allocatedPercent: 10 },
        { code: 'publications', allocatedPercent: 5 },
        { code: 'empirical', allocatedPercent: 10 },
        { code: 'external_reviewers', allocatedPercent: 5 },
        { code: 'overhead', allocatedPercent: 5 }
      ]
    },
    {
      id: 'default_fni_research',
      name: 'Изследователски фокус (ФНИ)',
      description: 'Акцент върху емпирични изследвания и екип',
      isShared: true,
      categories: [
        { code: 'personnel', allocatedPercent: 35 },
        { code: 'equipment', allocatedPercent: 15 },
        { code: 'materials', allocatedPercent: 5 },
        { code: 'travel_domestic', allocatedPercent: 5 },
        { code: 'travel_international', allocatedPercent: 10 },
        { code: 'publications', allocatedPercent: 5 },
        { code: 'empirical', allocatedPercent: 15 },
        { code: 'external_reviewers', allocatedPercent: 5 },
        { code: 'overhead', allocatedPercent: 5 }
      ]
    }
  ],
  "ПНИ": [
    {
      id: 'default_pni_equipment',
      name: 'Оборудване и технологии (ПНИ)',
      description: 'Акцент върху придобиване на оборудване',
      isShared: true,
      categories: [
        { code: 'personnel', allocatedPercent: 25 },
        { code: 'equipment', allocatedPercent: 30 },
        { code: 'materials', allocatedPercent: 10 },
        { code: 'travel_domestic', allocatedPercent: 5 },
        { code: 'travel_international', allocatedPercent: 5 },
        { code: 'publications', allocatedPercent: 5 },
        { code: 'conferences', allocatedPercent: 5 },
        { code: 'empirical', allocatedPercent: 5 },
        { code: 'utility_model', allocatedPercent: 5 },
        { code: 'overhead', allocatedPercent: 5 }
      ]
    }
  ],
  "ДНП": [
    {
      id: 'default_dnp_dissertation',
      name: 'Дисертационен бюджет (ДНП)',
      description: 'Стандартен бюджет за дисертационен труд',
      isShared: true,
      categories: [
        { code: 'literature', allocatedPercent: 15 },
        { code: 'data', allocatedPercent: 10 },
        { code: 'materials', allocatedPercent: 10 },
        { code: 'travel', allocatedPercent: 10 },
        { code: 'editing', allocatedPercent: 10 },
        { code: 'printing', allocatedPercent: 10 },
        { code: 'translation', allocatedPercent: 5 },
        { code: 'conferences', allocatedPercent: 10 },
        { code: 'publications_oa', allocatedPercent: 5 },
        { code: 'publications_scopus', allocatedPercent: 10 },
        { code: 'overhead', allocatedPercent: 5 }
      ]
    }
  ],
  "НПФ": [
    {
      id: 'default_npf_event',
      name: 'Научно събитие (НПФ)',
      description: 'Бюджет за провеждане на научно събитие',
      isShared: true,
      categories: [
        { code: 'visual_identity', allocatedPercent: 15 },
        { code: 'print_proceedings', allocatedPercent: 20 },
        { code: 'digital_proceedings', allocatedPercent: 15 },
        { code: 'reviewers', allocatedPercent: 10 },
        { code: 'overhead', allocatedPercent: 10 }
      ]
    }
  ]
};

/**
 * T40: Apply a budget template to a given total budget.
 * Returns an array of { code, allocated_amount } ready for Step3Budget.
 */
window.__applyBudgetTemplate__ = function (template, totalBudget) {
  if (!template || !template.categories || !totalBudget) return [];
  return template.categories.map(function (cat) {
    return {
      code: cat.code,
      allocated_amount: Math.round((totalBudget * (cat.allocatedPercent || 0)) / 100 * 100) / 100
    };
  });
};