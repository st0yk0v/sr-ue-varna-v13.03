/* ═══════════════════════════════════════════════════════════════════════
 * step3.schema.js — Enhanced Budget category definitions for Step 3
 * ═══════════════════════════════════════════════════════════════════════
 * Mirrors spec step_3_budget.budget_categories.
 * cap_percent_of_total values are PLACEHOLDERS — replace with PROJECT_TYPE_RULES
 * from GS.JS at implementation time.
 *
 * v2.0 additions:
 *   - Icon + color metadata for visual Step 3
 *   - EUR/BGN conversion helpers
 *   - Budget → spreadsheet mapping helpers
 *   - Quick-allocate distribution logic
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var EUR_BGN = 1.95583;

  var BUDGET_CATEGORIES = [
    {
      code: 'personnel',
      name_bg: 'Възнаграждения',
      icon: 'fa-users',
      color: '#3b82f6',
      cap_percent_of_total: { 'ФНИ': 40, 'ПНИ': 50, 'ДНП': 60, 'НПФ': 45 },
      help_bg: 'Включва трудови възнаграждения и осигуровки на екипа по проекта.',
      editable: true,
      spreadsheet_column: 'Възнаграждения'
    },
    {
      code: 'equipment',
      name_bg: 'Оборудване',
      icon: 'fa-laptop',
      color: '#f59e0b',
      cap_percent_of_total: { 'ФНИ': 30, 'ПНИ': 25, 'ДНП': 15, 'НПФ': 20 },
      help_bg: 'Дълготрайни материални активи, необходими пряко за изпълнение на проекта.',
      editable: true,
      spreadsheet_column: 'Оборудване'
    },
    {
      code: 'materials',
      name_bg: 'Материали и консумативи',
      icon: 'fa-boxes',
      color: '#10b981',
      cap_percent_of_total: { 'ФНИ': 20, 'ПНИ': 15, 'ДНП': 15, 'НПФ': 20 },
      help_bg: '',
      editable: true,
      spreadsheet_column: 'Материали'
    },
    {
      code: 'travel',
      name_bg: 'Командировки',
      icon: 'fa-plane',
      color: '#8b5cf6',
      cap_percent_of_total: { 'ФНИ': 10, 'ПНИ': 10, 'ДНП': 10, 'НПФ': 10 },
      help_bg: '',
      editable: true,
      spreadsheet_column: 'Командировки'
    },
    {
      code: 'publications',
      name_bg: 'Публикации и разпространение на резултати',
      icon: 'fa-scroll',
      color: '#06b6d4',
      cap_percent_of_total: { 'ФНИ': 10, 'ПНИ': 10, 'ДНП': 10, 'НПФ': 15 },
      help_bg: '',
      editable: true,
      spreadsheet_column: 'Публикации'
    },
    {
      code: 'overhead',
      name_bg: 'Административни разходи (overhead)',
      icon: 'fa-cogs',
      color: '#64748b',
      cap_percent_of_total: { 'ФНИ': 10, 'ПНИ': 10, 'ДНП': 10, 'НПФ': 10 },
      help_bg: 'Автоматично калкулирано, не се въвежда ръчно от потребителя.',
      editable: false,
      spreadsheet_column: 'Административни'
    }
  ];

  global.__pwStep3Schema = {
    budgetCategories: BUDGET_CATEGORIES,
    EUR_BGN: EUR_BGN,

    /**
     * Get the cap percent for a given category and project type.
     * @param {string} categoryCode
     * @param {string} projectType — ФНИ|ПНИ|ДНП|НПФ
     * @returns {number}
     */
    getCapPercent: function (categoryCode, projectType) {
      for (var i = 0; i < BUDGET_CATEGORIES.length; i++) {
        if (BUDGET_CATEGORIES[i].code === categoryCode) {
          var caps = BUDGET_CATEGORIES[i].cap_percent_of_total;
          return caps[projectType] || caps['ФНИ'] || 0;
        }
      }
      return 0;
    },

    /**
     * Get the color for a category.
     * @param {string} categoryCode
     * @returns {string}
     */
    getColor: function (categoryCode) {
      for (var i = 0; i < BUDGET_CATEGORIES.length; i++) {
        if (BUDGET_CATEGORIES[i].code === categoryCode) {
          return BUDGET_CATEGORIES[i].color || '#64748b';
        }
      }
      return '#64748b';
    },

    /**
     * Get the icon class for a category.
     * @param {string} categoryCode
     * @returns {string}
     */
    getIcon: function (categoryCode) {
      for (var i = 0; i < BUDGET_CATEGORIES.length; i++) {
        if (BUDGET_CATEGORIES[i].code === categoryCode) {
          return BUDGET_CATEGORIES[i].icon || 'fa-file';
        }
      }
      return 'fa-file';
    },

    /**
     * Get all categories with their cap percents resolved for a project type.
     * @param {string} projectType
     * @returns {Array<{code:string, name_bg:string, cap_percent:number, help_bg:string, editable:boolean, icon:string, color:string}>}
     */
    resolveForProjectType: function (projectType) {
      return BUDGET_CATEGORIES.map(function (cat) {
        var caps = cat.cap_percent_of_total;
        return {
          code: cat.code,
          name_bg: cat.name_bg,
          icon: cat.icon || 'fa-file',
          color: cat.color || '#64748b',
          cap_percent: caps[projectType] || caps['ФНИ'] || 0,
          help_bg: cat.help_bg,
          editable: cat.editable
        };
      });
    },

    /**
     * Convert budget_categories array → spreadsheet-friendly format.
     * @param {Array} categories — [{code, allocated_amount}]
     * @param {number} totalBudget
     * @returns {Object} — { categories: [{code, name, amount, pct}], total, eurTotal }
     */
    toSpreadsheetFormat: function (categories, totalBudget) {
      var result = { categories: [], total: 0, eurTotal: 0 };
      if (!Array.isArray(categories)) return result;
      var total = 0;
      result.categories = categories.map(function (cat) {
        var amount = Number(cat.allocated_amount) || 0;
        total += amount;
        var catDef = BUDGET_CATEGORIES.find(function (c) { return c.code === cat.code; }) || {};
        return {
          code: cat.code,
          name: catDef.name_bg || cat.code,
          amount: amount,
          amountEUR: amount / EUR_BGN,
          pct: totalBudget > 0 ? (amount / totalBudget) * 100 : 0
        };
      });
      result.total = total;
      result.eurTotal = total / EUR_BGN;
      return result;
    },

    /**
     * Convert step3 state to the budget object expected by generateBudgetSpreadsheet.
     * @param {Object} step3 — { total_budget_field, budget_categories }
     * @returns {Object} — { groupId: { y1: amount }, ... }
     */
    toBudgetPayload: function (step3) {
      var budget = {};
      var categories = Array.isArray(step3 && step3.budget_categories) ? step3.budget_categories : [];
      categories.forEach(function (cat) {
        if (cat.code && cat.code !== 'overhead') {
          budget[cat.code] = { y1: Number(cat.allocated_amount) || 0 };
        }
      });
      return budget;
    },

    /**
     * Get the max budget for a project type in BGN.
     * @param {string} projectType
     * @param {Object} [projectTypes] — optional PROJECT_TYPES array
     * @returns {number}
     */
    getMaxBudgetBGN: function (projectType, projectTypes) {
      var pts = Array.isArray(projectTypes) ? projectTypes : global.PROJECT_TYPES || [];
      var pt = pts.find(function (p) { return p.value === projectType; });
      if (!pt) return 0;
      if (projectType === 'НПФ' && pt.npfTiers) {
        var tier = pt.npfTiers.university;
        return (tier && tier.maxEUR || 0) * EUR_BGN;
      }
      return (pt.maxBudget || 0) * EUR_BGN;
    }
  };

})(window);
