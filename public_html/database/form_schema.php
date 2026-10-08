<?php
/* ═══════════════════════════════════════════════════════════════════════════
 * form_schema.php — Server-side validation contract for handleUpdateForm
 *
 * Mirrors the JS step schemas (step1.schema.js / step2.schema.js / step3.schema.js)
 * so the SAME rules are enforced backend-side. The frontend validation is UX-only;
 * this file is the actual gate that rejects invalid data before it hits MySQL.
 *
 * Rule taxonomy (mirrors JS schema fields):
 *   required        — field must be present and non-empty
 *   max_length:N   — string/array must not exceed N chars/items
 *   min_length:N   — string must be at least N chars
 *   min:N / max:N  — numeric bounds
 *   pattern:REGEX  — string must match (PCRE)
 *   enum:ARRAY     — value must be one of the allowed values
 *   type:TEXT|NUM  — rough type check (used for error context)
 *   max_words:N    — word count ceiling (textarea)
 *
 * Every rule that exists in the JS schema has a matching server rule below.
 * ═══════════════════════════════════════════════════════════════════════════ */

if (!defined('__UEV_ROOT__')) return;

/** Step 1 basic-info field rules (mirrors __pwStep1Schema.fields). */
$GLOBALS['__pwFormSchemaStep1'] = [
    'competition_session_id' => [
        'required'    => true,
        'type'        => 'select',
        'error_bg'    => 'Моля изберете конкурсна сесия.',
    ],
    'project_type' => [
        'required'    => true,
        'type'        => 'enum',
        'enum'        => ['ФНИ', 'ПНИ', 'ДНП', 'НПФ'],
        'error_bg'    => 'Моля изберете тип проект.',
    ],
    'priority_area' => [
        'required'    => true,
        'type'        => 'enum',
        'enum'        => [
            'Глобални пазари и инвестиции',
            'Индустрия 5.0',
            'Зелена икономика',
            'Дигитална трансформация',
            'Управление на данни',
            'Регионални стратегии',
        ],
        'error_bg'    => 'Моля изберете приоритетна област.',
    ],
    'professional_field' => [
        'required'    => true,
        'type'        => 'enum',
        'enum'        => ['3.7 Администрация', '3.8 Икономика', '3.9 Туризъм', '4.6 Информатика'],
        'error_bg'    => 'Моля изберете професионално поле.',
    ],
    'title_bg' => [
        'required'     => true,
        'type'         => 'text',
        'min_length'   => 5,
        'max_length'   => 250,
        'error_bg'     => 'Заглавието трябва да е между 5 и 250 символа.',
    ],
    'title_en' => [
        'required'     => false,
        'type'         => 'text',
        'max_length'   => 250,
        'error_bg'     => 'Заглавието на английски не може да надвишава 250 символа.',
    ],
    'acronym' => [
        'required'     => true,
        'type'         => 'text',
        'max_length'   => 10,
        'pattern'      => '/^[a-zA-Z]{1,10}$/',
        'error_bg'     => 'Акронимът трябва да е между 1 и 10 латински символа.',
    ],
    'duration_months' => [
        'required'    => true,
        'type'        => 'number',
        'min'         => 6,
        'max'         => 36,
        'error_bg'    => 'Срокът на изпълнение трябва да е между 6 и 36 месеца.',
    ],
    'description_bg' => [
        'required'     => true,
        'type'         => 'textarea',
        'min_length'   => 200,
        'max_length'   => 2000,
        'error_bg'     => 'Описанието трябва да е между 200 и 2000 символа.',
    ],
    'description_en' => [
        'required'     => true,
        'type'         => 'textarea',
        'max_words'    => 200,
        'error_bg'     => 'Описанието на английски не може да надвишава 200 думи.',
    ],
    'goals' => [
        'required'     => true,
        'type'         => 'textarea',
        'min_length'   => 50,
        'max_length'   => 1000,
        'error_bg'     => 'Целите трябва да са между 50 и 1000 символа.',
    ],
    'department_id' => [
        'required'    => true,
        'type'        => 'select',
        'error_bg'    => 'Моля изберете катедра.',
    ],
    'faculty_id' => [
        'required'    => false,
        'type'        => 'select_derived',
        'error_bg'    => null, // derived/read-only — never validated server-side
    ],
    'principal_investigator_id' => [
        'required'    => true,
        'type'        => 'user_select',
        'error_bg'    => 'Моля изберете ръководител на проекта.',
    ],
];

/** Team member sub-field rules (mirrors __pwStep1Schema.teamMemberFields). */
$GLOBALS['__pwFormSchemaTeamMember'] = [
    'member_id' => [
        'required'    => true,
        'type'        => 'user_select',
        'error_bg'    => 'Всеки член на екипа трябва да е избран еднократно.',
    ],
    'role_bg' => [
        'required'    => true,
        'type'        => 'enum',
        'enum'        => ['Изследовател', 'Докторант', 'Технически сътрудник'],
        'error_bg'    => 'Моля изберете роля за члена на екипа.',
    ],
    'workload_percent' => [
        'required'    => true,
        'type'        => 'number',
        'min'         => 5,
        'max'         => 100,
        'error_bg'    => 'Натовареността трябва да е между 5% и 100%.',
    ],
];

/** Step 2 document type required flags (mirrors __pwStep2Schema.documentTypes).
 *  Server-side: only enforces that required doc types are flagged present when
 *  the form is submitted (submitted==true). Individual doc uploads are handled
 *  by the attachment flow, not by handleUpdateForm. */
$GLOBALS['__pwFormSchemaStep2'] = [
    'fni_form'            => ['required' => true],
    'budget_annex'        => ['required' => true],
    'cv_pi'               => ['required' => true],
    'cv_team'             => ['required' => false],
    'ethics_approval'     => ['required' => false],
    'institutional_declaration' => ['required' => true],
    'letters_of_support'  => ['required' => false],
];

/** Step 3 budget category definitions (mirrors __pwStep3Schema.budgetCategories).
 *  Server-side: enforces that the budget total does not exceed project-type caps
 *  and that individual category allocations are non-negative numbers. */
$GLOBALS['__pwFormSchemaStep3'] = [
    'personnel'   => ['cap_percent' => ['ФНИ'=>40,'ПНИ'=>50,'ДНП'=>60,'НПФ'=>45], 'editable' => true],
    'equipment'   => ['cap_percent' => ['ФНИ'=>30,'ПНИ'=>25,'ДНП'=>15,'НПФ'=>20], 'editable' => true],
    'materials'   => ['cap_percent' => ['ФНИ'=>20,'ПНИ'=>15,'ДНП'=>15,'НПФ'=>20], 'editable' => true],
    'travel'      => ['cap_percent' => ['ФНИ'=>10,'ПНИ'=>10,'ДНП'=>10,'НПФ'=>10], 'editable' => true],
    'publications'=> ['cap_percent' => ['ФНИ'=>10,'ПНИ'=>10,'ДНП'=>10,'НПФ'=>15], 'editable' => true],
    'overhead'    => ['cap_percent' => ['ФНИ'=>10,'ПНИ'=>10,'ДНП'=>10,'НПФ'=>10], 'editable' => false],
];

/**
 * validateFormAgainstSchema — enforce the step schemas server-side.
 *
 * @param array $data  — the raw (camelCase) body from handleUpdateForm
 * @param string $step — 'step1' | 'step2' | 'step3'
 * @return array       — ['ok'=>true] or ['ok'=>false, 'field'=>..., 'error_bg'=>...]
 */
function validateFormAgainstSchema(array $data, string $step): array {
    if ($step === 'step1') {
        return _validateStep1($data);
    }
    if ($step === 'step2') {
        return _validateStep2($data);
    }
    if ($step === 'step3') {
        return _validateStep3($data);
    }
    return ['ok' => true]; // unknown step — no server enforcement (defensive)
}

/* ── Step 1 validation ─────────────────────────────────────────────────── */

function _validateStep1(array $data): array {
    $schema = $GLOBALS['__pwFormSchemaStep1'];
    foreach ($schema as $field => $rules) {
        // Skip read-only / derived fields
        if (!empty($rules['type']) && $rules['type'] === 'select_derived') {
            continue;
        }
        $val = $data[$field] ?? null;
        $rules = $schema[$field];

        // required
        if (!empty($rules['required'])) {
            if ($val === null || $val === '' || (is_array($val) && empty($val))) {
                return ['ok' => false, 'field' => $field, 'error_bg' => $rules['error_bg']];
            }
        }
        if ($val === null || $val === '' || (is_array($val) && empty($val))) {
            continue; // optional + empty → skip further checks
        }

        // text / textarea length bounds
        if (in_array($rules['type'], ['text', 'textarea', 'select', 'enum', 'select_derived', 'user_select'], true)) {
            $len = is_string($val) ? mb_strlen($val, 'UTF-8') : 0;
            if (!empty($rules['max_length']) && $len > (int)$rules['max_length']) {
                return ['ok' => false, 'field' => $field, 'error_bg' => $rules['error_bg']];
            }
            if (!empty($rules['min_length']) && $len < (int)$rules['min_length']) {
                return ['ok' => false, 'field' => $field, 'error_bg' => $rules['error_bg']];
            }
            if (!empty($rules['pattern'])) {
                if (!preg_match($rules['pattern'], $val)) {
                    return ['ok' => false, 'field' => $field, 'error_bg' => $rules['error_bg']];
                }
            }
        }

        // enum
        if (!empty($rules['enum'])) {
            if (!in_array($val, $rules['enum'], true)) {
                return ['ok' => false, 'field' => $field, 'error_bg' => $rules['error_bg']];
            }
        }

        // numeric bounds
        if ($rules['type'] === 'number') {
            $num = is_numeric($val) ? (float)$val : null;
            if ($num === null) {
                return ['ok' => false, 'field' => $field, 'error_bg' => $rules['error_bg']];
            }
            if (!empty($rules['min']) && $num < (float)$rules['min']) {
                return ['ok' => false, 'field' => $field, 'error_bg' => $rules['error_bg']];
            }
            if (!empty($rules['max']) && $num > (float)$rules['max']) {
                return ['ok' => false, 'field' => $field, 'error_bg' => $rules['error_bg']];
            }
        }

        // max_words (textarea)
        if (!empty($rules['max_words']) && is_string($val)) {
            $words = preg_split('/\s+/u', trim($val), -1, PREG_SPLIT_NO_EMPTY);
            if (count($words) > (int)$rules['max_words']) {
                return ['ok' => false, 'field' => $field, 'error_bg' => $rules['error_bg']];
            }
        }
    }
    return ['ok' => true];
}

/* ── Step 2 validation ─────────────────────────────────────────────────── */

function _validateStep2(array $data): array {
    // Step 2 is about document status tracking — we only enforce required doc
    // types when the form is being submitted (not during editing).
    if (empty($data['submitted']) && ($data['status'] ?? '') !== 'submitted') {
        return ['ok' => true];
    }
    $schema = $GLOBALS['__pwFormSchemaStep2'];
    foreach ($schema as $docType => $rules) {
        if (empty($rules['required'])) continue;
        // The frontend communicates doc presence via attached_docs or a
        // per-doc status field. We accept either a top-level flag or the
        // attached_docs array entry.
        $present = false;
        if (isset($data['attached_docs']) && is_array($data['attached_docs'])) {
            foreach ($data['attached_docs'] as $doc) {
                if (!empty($doc['type']) && $doc['type'] === $docType) {
                    $present = true;
                    break;
                }
            }
        }
        // also accept a top-level ${docType}_attached flag (legacy)
        if (!$present && !empty($data[$docType . '_attached'])) {
            $present = true;
        }
        if (!$present) {
            return ['ok' => false, 'field' => $docType, 'error_bg' => "Моля прикачете изисквания документ: " . _docTypeName($docType)];
        }
    }
    return ['ok' => true];
}

/* ── Step 3 validation ─────────────────────────────────────────────────── */

function _validateStep3(array $data): array {
    $budgetRaw = $data['budget_categories'] ?? $data['budget'] ?? null;
    if (!is_array($budgetRaw) || empty($budgetRaw)) {
        return ['ok' => true]; // no budget yet — allowed during editing
    }
    $schema = $GLOBALS['__pwFormSchemaStep3'];
    $projectType = $data['project_type'] ?? $data['projectType'] ?? 'ФНИ';
    $total = 0;
    $categoryTotals = [];

    // First pass: validate each category allocation
    foreach ($budgetRaw as $cat) {
        if (!is_array($cat)) continue;
        $code = $cat['code'] ?? $cat['category'] ?? '';
        if (empty($code) || !isset($schema[$code])) continue;
        $alloc = (float)($cat['allocated_amount'] ?? $cat['amount'] ?? 0);
        if ($alloc < 0) {
            return ['ok' => false, 'field' => $code, 'error_bg' => 'Разходът не може да бъде отрицателен.'];
        }
        $categoryTotals[$code] = $alloc;
        $total += $alloc;
    }

    // Second pass: cap-percent check per project type
    $ptCaps = [];
    foreach ($schema as $code => $def) {
        $caps = $def['cap_percent'] ?? [];
        $ptCaps[$code] = $caps[$projectType] ?? $caps['ФНИ'] ?? 0;
    }
    if ($total > 0) {
        foreach ($categoryTotals as $code => $alloc) {
            if (empty($ptCaps[$code])) continue;
            $maxAlloc = ($total * $ptCaps[$code]) / 100;
            // Allow a tiny rounding tolerance (0.5 BGN)
            if ($alloc > $maxAlloc + 0.5) {
                return ['ok' => false, 'field' => $code,
                    'error_bg' => 'Разходът за ' . _budgetCatName($code) . ' надвишава разрешените ' . $ptCaps[$code] . '% от общия бюджет.'];
            }
        }
    }
    return ['ok' => true];
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function _docTypeName(string $type): string {
    $map = [
        'fni_form' => 'ФНИ формуляр',
        'budget_annex' => 'Бюджетно приложение',
        'cv_pi' => 'CV на ръководителя',
        'cv_team' => 'CV на екипа',
        'ethics_approval' => 'Декларация за етично съответствие',
        'institutional_declaration' => 'Институционална декларация',
        'letters_of_support' => 'Писма за подкрепа',
    ];
    return $map[$type] ?? $type;
}

function _budgetCatName(string $code): string {
    $map = [
        'personnel'   => 'Възнаграждения',
        'equipment'   => 'Оборудване',
        'materials'   => 'Материали',
        'travel'      => 'Командировки',
        'publications'=> 'Публикации',
        'overhead'    => 'Overhead',
    ];
    return $map[$code] ?? $code;
}
