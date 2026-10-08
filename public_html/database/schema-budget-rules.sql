-- ══════════════════════════════════════════════════════════════════════════════
--  UEV-ERP — budget_rules table (per-project-type budget category caps)
--  Idempotent: safe to re-run. Stores max percentage / fixed amount caps per
--  budget category for each project type (ФНИ, ПНИ, ДНп, НПФ).
--  Apply with:  mysql -u <user> -p <db> < schema-budget-rules.sql
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `budget_rules` (
    `id`            INT NOT NULL AUTO_INCREMENT,
    `project_type`  VARCHAR(10)  NOT NULL,
    `category_code` VARCHAR(50)  NOT NULL,
    `cap_percent`   DECIMAL(5,2) DEFAULT NULL,
    `cap_amount`    DECIMAL(10,2) DEFAULT NULL,
    `is_required`   TINYINT(1)   DEFAULT 0,
    `sort_order`    INT          DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_type_category` (`project_type`, `category_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ══════════════════════════════════════════════════════════════════════════════
--  ФНИ (Фундаментални изследвания) — max_total 12 000 EUR
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO `budget_rules` (`project_type`, `category_code`, `cap_percent`, `cap_amount`, `sort_order`) VALUES
    ('ФНИ', 'personnel',     35.00, NULL,      10),
    ('ФНИ', 'equipment',     30.00, NULL,      20),
    ('ФНИ', 'materials',     20.00, NULL,      30),
    ('ФНИ', 'travel',        10.00, NULL,      40),
    ('ФНИ', 'publications',  10.00, NULL,      50),
    ('ФНИ', 'services',      25.00, NULL,      60),
    ('ФНИ', 'overhead',      10.00, NULL,      70),
    ('ФНИ', 'max_total',     NULL,  12000.00,  999)
ON DUPLICATE KEY UPDATE `cap_percent`=VALUES(`cap_percent`), `cap_amount`=VALUES(`cap_amount`), `sort_order`=VALUES(`sort_order`);

-- ══════════════════════════════════════════════════════════════════════════════
--  ПНИ (Приложни изследвания) — max_total 12 000 EUR
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO `budget_rules` (`project_type`, `category_code`, `cap_percent`, `cap_amount`, `sort_order`) VALUES
    ('ПНИ', 'personnel',     35.00, NULL,      10),
    ('ПНИ', 'equipment',     25.00, NULL,      20),
    ('ПНИ', 'materials',     15.00, NULL,      30),
    ('ПНИ', 'travel',        10.00, NULL,      40),
    ('ПНИ', 'publications',  10.00, NULL,      50),
    ('ПНИ', 'services',      20.00, NULL,      60),
    ('ПНИ', 'overhead',      10.00, NULL,      70),
    ('ПНИ', 'max_total',     NULL,  12000.00,  999)
ON DUPLICATE KEY UPDATE `cap_percent`=VALUES(`cap_percent`), `cap_amount`=VALUES(`cap_amount`), `sort_order`=VALUES(`sort_order`);

-- ══════════════════════════════════════════════════════════════════════════════
--  ДНп (Докторски научни проекти) — max_total 5 000 EUR
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO `budget_rules` (`project_type`, `category_code`, `cap_percent`, `cap_amount`, `sort_order`) VALUES
    ('ДНп', 'literature',     100.00, NULL,     10),
    ('ДНп', 'data',           40.00,  NULL,     20),
    ('ДНп', 'materials',      10.00,  NULL,     30),
    ('ДНп', 'travel',         100.00, NULL,     40),
    ('ДНп', 'reviewer',       NULL,   60.00,    50),
    ('ДНп', 'report_review',  NULL,   25.00,    60),
    ('ДНп', 'editing',        100.00, NULL,     70),
    ('ДНп', 'printing',       100.00, NULL,     80),
    ('ДНп', 'translation',    100.00, NULL,     90),
    ('ДНп', 'max_total',      NULL,   5000.00,  999)
ON DUPLICATE KEY UPDATE `cap_percent`=VALUES(`cap_percent`), `cap_amount`=VALUES(`cap_amount`), `sort_order`=VALUES(`sort_order`);

-- ══════════════════════════════════════════════════════════════════════════════
--  НПФ (Научно-проектни фондации) — max_total 6 000 BGN
-- ══════════════════════════════════════════════════════════════════════════════
INSERT INTO `budget_rules` (`project_type`, `category_code`, `cap_percent`, `cap_amount`, `sort_order`) VALUES
    ('НПФ', 'visual_identity',  15.00,  NULL,     10),
    ('НПФ', 'portfolio',        30.00,  NULL,     20),
    ('НПФ', 'guest_lecturers',  NULL,   1000.00, 30),
    ('НПФ', 'technical',        15.00,  NULL,     40),
    ('НПФ', 'advertising',      100.00, NULL,     50),
    ('НПФ', 'publication',      100.00, NULL,     60),
    ('НПФ', 'bpos_metadata',    NULL,   50.00,   70),
    ('НПФ', 'reviewer',         NULL,   100.00,  80),
    ('НПФ', 'max_total',        NULL,   6000.00, 999)
ON DUPLICATE KEY UPDATE `cap_percent`=VALUES(`cap_percent`), `cap_amount`=VALUES(`cap_amount`), `sort_order`=VALUES(`sort_order`);