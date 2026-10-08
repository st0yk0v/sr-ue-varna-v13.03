/* ═══════════════════════════════════════════════════════════════════════
 * step1.schema.js — Zod-like validation schema for Step 1 fields
 * ═══════════════════════════════════════════════════════════════════════
 * Mirrors step_1_basic_info.fields from spec.
 * Used by step1.validation.js for field-level rules.
 * ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /**
   * Field definitions mirroring the spec step_1_basic_info.fields.
   * Each field has: id, label_bg, type, required, validation rules.
   */
  var STEP1_FIELDS = [
      {
        id: 'competition_session_id',
        label_bg: 'Конкурсна сесия',
        type: 'select_dependent_on(project_type)',
        required: true,
        help_bg: 'Списъкът се обновява спрямо избрания тип проект и текущо активните сесии.',
        validation: {
          rule: 'required, must belong to selected project_type',
          error_bg: 'Моля изберете конкурсна сесия.'
        }
      },
      {
        id: 'project_type',
        label_bg: 'Тип проект',
        type: 'select',
        required: true,
        options_bg: ['ФНИ', 'ПНИ', 'ДНП', 'НПФ'],
        help_bg: 'Изборът определя наличните конкурсни сесии, бюджетни правила и изискваните документи в следващите стъпки.',
        validation: {
          rule: 'enum required',
          error_bg: 'Моля изберете тип проект.'
        }
      },
      {
        id: 'priority_area',
        label_bg: 'Приоритетна област',
        type: 'select',
        required: true,
        options_bg: ['Глобални пазари и инвестиции', 'Индустрия 5.0', 'Зелена икономика', 'Дигитална трансформация', 'Управление на данни', 'Регионални стратегии'],
        help_bg: 'Изберете приоритетна област, към която се отнася проектът.',
        validation: {
          rule: 'enum required',
          error_bg: 'Моля изберете приоритетна област.'
        }
      },
      {
        id: 'professional_field',
        label_bg: 'Професионално поле',
        type: 'select',
        required: true,
        options_bg: ['3.7 Администрация', '3.8 Икономика', '3.9 Туризъм', '4.6 Информатика'],
        help_bg: 'Изберете професионално поле според класификацията на НАОА.',
        validation: {
          rule: 'enum required',
          error_bg: 'Моля изберете професионално поле.'
        }
      },
      {
        id: 'title_bg',
        label_bg: 'Заглавие на проекта (БГ)',
        type: 'text',
        required: true,
        max_length: 250,
        validation: {
          rule: 'required, 5-250 chars',
          error_bg: 'Заглавието трябва да е между 5 и 250 символа.'
        }
      },
      {
        id: 'title_en',
        label_bg: 'Заглавие на проекта (EN)',
        type: 'text',
        required: false,
        max_length: 250,
        validation: {
          rule: 'optional, max 250 chars',
          error_bg: 'Заглавието на английски не може да надвишава 250 символа.'
        }
      },
      {
        id: 'scientific_title',
        label_bg: 'Научно заглавие',
        type: 'text',
        required: false,
        max_length: 300,
        min_length: 10,
        help_bg: 'Научното заглавие трябва да бъде ясно, кратко и да отразява съдържанието на изследването. Формат: без специални символи, само букви, цифри, интервали и тирета.',
        validation: {
          rule: 'optional, 10-300 chars, scientific format',
          pattern: '^[a-zA-Z\u0400-\u04FF0-9\s\-.,;:()]+$',
          error_bg: 'Научното заглавие трябва да е между 10 и 300 символа и да съдържа само букви, цифри, интервали и разрешени пунктуационни знаци.'
        }
      },
      {
        id: 'acronym',
        label_bg: 'Акроним',
        type: 'text',
        required: true,
        max_length: 10,
        validation: {
          rule: 'required, 1-10 latin chars',
          error_bg: 'Акронимът трябва да е между 1 и 10 латински символа.',
          pattern: '^[a-zA-Z]{1,10}$'
        }
      },
      {
        id: 'duration_months',
        label_bg: 'Срок на изпълнение',
        type: 'number',
        required: true,
        min: 6,
        max: 36,
        help_bg: 'Месеци за изпълнение на проекта.',
        validation: {
          rule: 'required, integer 6-36',
          error_bg: 'Срокът на изпълнение трябва да е между 6 и 36 месеца.'
        }
      },
      {
        id: 'description_bg',
        label_bg: 'Описание',
        type: 'textarea',
        required: true,
        min_length: 200,
        max_length: 2000,
        help_bg: 'Кратко описание на целите, методологията и очаквания резултат от проекта.',
        validation: {
          rule: 'required, 200-2000 chars',
          error_bg: 'Описанието трябва да е между 200 и 2000 символа.'
        }
      },
      {
        id: 'description_en',
        label_bg: 'Описание (EN)',
        type: 'textarea',
        required: true,
        max_words: 200,
        help_bg: 'Описание на английски език (максимум 200 думи).',
        validation: {
          rule: 'required, max 200 words',
          error_bg: 'Описанието на английски не може да надвишава 200 думи.'
        }
      },
      {
        id: 'goals',
        label_bg: 'Цели',
        type: 'textarea',
        required: true,
        min_length: 50,
        max_length: 1000,
        help_bg: 'Основни цели на проекта.',
        validation: {
          rule: 'required, 50-1000 chars',
          error_bg: 'Целите трябва да са между 50 и 1000 символа.'
        }
      },
    {
      id: 'department_id',
      label_bg: 'Катедра',
      type: 'select',
      required: true,
      validation: {
        rule: 'required',
        error_bg: 'Моля изберете катедра.'
      }
    },
    {
      id: 'faculty_id',
      label_bg: 'Факултет',
      type: 'select_derived_from(department_id)',
      required: true,
      editable: false,
      validation: {
        rule: 'derived, read-only',
        error_bg: null
      }
    },
    {
      id: 'principal_investigator_id',
      label_bg: 'Ръководител на проекта',
      type: 'user_search_select',
      required: true,
      help_bg: 'Търсене по име или служебен имейл в системата.',
      validation: {
        rule: 'required, must be active user',
        error_bg: 'Моля изберете ръководител на проекта.'
      }
    }
  ];

  /**
   * Team member sub-field definitions.
   */
  var TEAM_MEMBER_FIELDS = [
    {
      id: 'member_id',
      type: 'user_search_select',
      required: true,
      validation: {
        rule: 'required, unique within team_members',
        error_bg: 'Всеки член на екипа трябва да е избран еднократно.'
      }
    },
    {
      id: 'role_bg',
      type: 'select',
      options_bg: ['Изследовател', 'Докторант', 'Технически сътрудник'],
      required: true,
      validation: {
        rule: 'required enum',
        error_bg: 'Моля изберете роля за члена на екипа.'
      }
    },
    {
      id: 'workload_percent',
      type: 'number',
      min: 5,
      max: 100,
      required: true,
      validation: {
        rule: 'required, 5-100',
        error_bg: 'Натовареността трябва да е между 5% и 100%.'
      }
    }
  ];

  /* ── Expose globally ── */
  global.__pwStep1Schema = {
    fields: STEP1_FIELDS,
    teamMemberFields: TEAM_MEMBER_FIELDS
  };

})(window);
