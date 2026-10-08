-- ══════════════════════════════════════════════════════════════════════════════
--  UEV-ERP Schema Migration — Project Budget Templates (pre-fetched by type)
--  ════════════════════════════════════════════════════════════════════════════
--  Mirrors the client-side PROJECT_BUDGET_TEMPLATES registry (js/config.js) into
--  MySQL so the PHP layer can serve template document metadata WITHOUT calling
--  Google Apps Script. This eliminates the "За съжаление файлът, който сте
--  заявили, не съществува" error by giving the backend an authoritative, always
--  reachable source of valid Drive file IDs (and optional static copies).
--
--  Idempotent: safe to re-run. Uses INSERT ... ON DUPLICATE KEY UPDATE for seeds.
--
--  Apply with:  mysql -u <user> -p <db> < schema_project_templates.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Table: project_templates ──
CREATE TABLE IF NOT EXISTS `project_templates` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_type` VARCHAR(16)  NOT NULL,                 -- ФНИ / ПНИ / ДНП / НПФ
  `doc_type`     VARCHAR(32)  NOT NULL DEFAULT 'budget',-- budget, application, unified, ...
  `drive_id`     VARCHAR(128) NOT NULL,                 -- Google Drive file ID (>=28 chars)
  `gid`          VARCHAR(32)  DEFAULT NULL,             -- Sheet tab gid (spreadsheets)
  `label`        VARCHAR(255) NOT NULL DEFAULT '',      -- Bulgarian UI label
  `static_path`  VARCHAR(255) DEFAULT NULL,             -- optional /uploads/... fallback copy
  `is_active`    TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_templates_type_doc` (`project_type`, `doc_type`),
  INDEX `idx_project_templates_type` (`project_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Seed: the 4 official budget spreadsheet templates (from js/config.js) ──
--  Drive IDs are 44 chars — well above the 28-char validity threshold the PHP
--  layer enforces before returning any document URL to the client.
INSERT INTO `project_templates`
  (`project_type`, `doc_type`, `drive_id`, `gid`, `label`, `static_path`, `is_active`)
VALUES
  ('ФНИ', 'budget', '1MCGrMcU82NY_yDqjXxyOxFS5Uwz9Xz5j8zUZYSfrUqQ', '893829297',  'Бюджетна таблица — ФНИ', NULL, 1),
  ('ПНИ', 'budget', '1HqdUGvRobKSIkVajBEeN_OzLDq7kfZpaVWbc1qG3Xwc', '403420795',  'Бюджетна таблица — ПНИ', NULL, 1),
  ('ДНП', 'budget', '1JZljcUkQz5-2lQfDXHM69ehmPaV8XD9a714v1voImy4', '683768571',  'Бюджетна таблица — ДНП', NULL, 1),
  ('НПФ', 'budget', '1LhGG2IFoWhw3VuxwML7J7S5jLEnPApukmvUB9kC5Fbs', '1015761759', 'Бюджетна таблица — НПФ', NULL, 1)
ON DUPLICATE KEY UPDATE
  `drive_id`   = VALUES(`drive_id`),
  `gid`        = VALUES(`gid`),
  `label`      = VALUES(`label`),
  `is_active`  = VALUES(`is_active`);
