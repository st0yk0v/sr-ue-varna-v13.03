/* ═══════════════════════════════════════════════════════════════════════════
 *  js/processors/validator.js — Client-side Validation Engine (v12.27.0)
 *
 *  Валидация на формите преди изпращане към сървъра.
 *  Имплементира същите правила като backend validator (database/processors/validator.php).
 *
 *  ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var VALID_PROF_FIELDS = ['3.7', '3.8', '3.9', '4.6'];
  var ACCENT_CHARS = 'АаБбВвГгДдЕеЖжЗзИиЙйКкЛлМмНнОоПпРрСсТтУуФфХхЦцЧчШшЩщЪъЬьЮюЯя';

  /**
   * Валидация на цялата форма преди submit
   * @param {Object} formData
   * @param {string} projectType
   * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
   */
  function validateForm(formData, projectType) {
    var errors = [];
    var warnings = [];
    var pt = String(projectType || '').toUpperCase();
    var rules = getProjectTypeRules(pt);

    // 1. Title
    if (!formData.title || String(formData.title).trim() === '') {
      errors.push('Заглавието е задължително.');
    }

    // 2. Description (word count)
    var desc = String(formData.description || '').trim();
    if (!desc) {
      errors.push('Описанието е задължително.');
    } else {
      var words = desc.split(/\s+/).filter(Boolean);
      if (words.length > 200) {
        errors.push('Описанието е твърде дълго (макс. 200 думи, текущо: ' + words.length + ').');
      }
    }

    // 3. Area
    if (!formData.area || String(formData.area).trim() === '') {
      errors.push('Тематичната област е задължителна.');
    }

    // 4. Professional field
    var profField = String(formData.professionalField || '').trim();
    if (!profField) {
      errors.push('Професионалното направление е задължително.');
    } else {
      var parts = profField.split(';;').filter(Boolean);
      for (var pi = 0; pi < parts.length; pi++) {
        if (VALID_PROF_FIELDS.indexOf(parts[pi].trim()) === -1) {
          errors.push('Невалидно професионално направление: ' + parts[pi].trim());
        }
      }
    }

    // 5. Acronym
    var acronym = String(formData.acronym || '').trim();
    if (acronym && !/^[A-Za-z0-9]{1,10}$/.test(acronym)) {
      errors.push('Акронимът трябва да е между 1 и 10 буквено-цифрови символа.');
    }

    // 6. Duration
    var dur = parseInt(formData.durationMonths) || 0;
    if (dur > 0 && rules) {
      if (dur < (rules.minDurationMonths || 12)) {
        errors.push('Минималната продължителност е ' + (rules.minDurationMonths || 12) + ' месеца.');
      }
      if (rules.maxDurationMonths && dur > rules.maxDurationMonths) {
        errors.push('Максималната продължителност е ' + rules.maxDurationMonths + ' месеца.');
      }
    }

    // 7. Budget
    if (rules && rules.maxBudgetEUR) {
      var budgetTotal = computeBudgetTotalEUR(formData.budget);
      if (budgetTotal > rules.maxBudgetEUR) {
        errors.push('Бюджетът надвишава максимума от ' + rules.maxBudgetEUR + ' €.');
      }
    }

    // 8. ДНП: no team remuneration
    if (pt === 'ДНП' && rules && rules.noTeamRemuneration) {
      var budget = formData.budget || {};
      if (budgetHasRemuneration(budget)) {
        errors.push('За ДНП не са позволени разходи за възнаграждения на екипа.');
      }
    }

    // 9. НПФ: tier selection
    if (pt === 'НПФ' && !formData.npfTier) {
      errors.push('Изберете ниво на форума (катедрен/факултетен/университетски).');
    }

    // 10. Self-assessment ≥ 51
    if (rules && rules.requiresSelfAssessment) {
      var score = parseInt(formData.selfAssessmentScore) || 0;
      if (score > 0 && score < 51) {
        errors.push('Минималният резултат за самооценка е 51 точки.');
      }
    }

    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  /**
   * Валидация на име на рецензент/потребител
   * @param {string} raw
   * @returns {{ ok: boolean, error?: string, name?: string }}
   */
  function validateFullName(raw) {
    var v = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!v) return { ok: false, error: 'Името е задължително.' };
    
    var parts = v.split(' ');
    if (parts.length < 2) return { ok: false, error: 'Въведете поне две имена (име и фамилия).' };
    
    var wordRe = /^[A-Za-zА-Яа-яЁёЪъЬьЮюЯяІіЇїЄєҐґ\-'']{2,}$/;
    for (var pi = 0; pi < parts.length; pi++) {
      if (!wordRe.test(parts[pi])) {
        return { ok: false, error: 'Невалиден символ в името: "' + parts[pi] + '".' };
      }
    }
    
    return { ok: true, name: v };
  }

  /**
   * Валидация на email
   * @param {string} email
   * @returns {boolean}
   */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
  }

  // ── Helpers ──

  function getProjectTypeRules(pt) {
    var rules = {
      'ФНИ': { maxBudgetEUR: 12000, minDurationMonths: 12, maxDurationMonths: 36, maxTeamMembers: 5, requiresSelfAssessment: true, noExpensesFirstMonth: true },
      'ПНИ': { maxBudgetEUR: 12000, minDurationMonths: 12, maxDurationMonths: 36, maxTeamMembers: 5, requiresSelfAssessment: true, requiresTRL: true, noExpensesFirstMonth: true },
      'ДНП': { maxBudgetEUR: 5000, minDurationMonths: 12, maxDurationMonths: 12, noTeamRemuneration: true, requiresSelfAssessment: true },
      'НПФ': { maxBudgetEUR: 6000, minDurationMonths: 1, maxDurationMonths: 3, requiresSelfAssessment: false }
    };
    return rules[pt] || null;
  }

  function computeBudgetTotalEUR(budget) {
    if (!budget || typeof budget !== 'object') return 0;
    var total = 0;
    var years = Object.keys(budget);
    for (var yi = 0; yi < years.length; yi++) {
      var groups = budget[years[yi]];
      if (typeof groups === 'object') {
        var groupIds = Object.keys(groups);
        for (var gi = 0; gi < groupIds.length; gi++) {
          total += parseFloat(groups[groupIds[gi]]) || 0;
        }
      }
    }
    return total / 1.95583;
  }

  function budgetHasRemuneration(budget) {
    var remCats = ['remuneration', 'team_remuneration', 'salaries'];
    var years = Object.keys(budget || {});
    for (var yi = 0; yi < years.length; yi++) {
      var groups = budget[years[yi]];
      if (typeof groups === 'object') {
        var groupIds = Object.keys(groups);
        for (var gi = 0; gi < groupIds.length; gi++) {
          if (remCats.indexOf(groupIds[gi]) !== -1 && parseFloat(groups[groupIds[gi]]) > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // ── Export ──
  global.__uevValidate = {
    form: validateForm,
    fullName: validateFullName,
    email: isValidEmail,
    rules: getProjectTypeRules
  };

  // Backward compat with existing utils.js
  global.validateFullName = validateFullName;

})(window);
