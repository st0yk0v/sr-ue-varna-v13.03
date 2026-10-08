-- ══════════════════════════════════════════════════════════════════════════════
--  VEDA + Document Admin — schema for document_templates, required_document_templates, project_types
--  These tables power the admin document management panel and VEDA email dossier.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `project_types` (
  `code` VARCHAR(16) NOT NULL PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL DEFAULT '',
  `description` TEXT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created` DATETIME NULL,
  `modified` DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `project_types` (`code`,`name`,`sort_order`) VALUES
  ('ФНИ','Фундаментални научни изследвания',1),
  ('ПНИ','Приложни научни изследвания',2),
  ('ДНП','Докторски научни програми',3),
  ('НПФ','Научно-изследователски проекти — Финансиране',4);

CREATE TABLE IF NOT EXISTS `document_templates` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `project_type` VARCHAR(16) NOT NULL DEFAULT '',
  `doc_type` VARCHAR(64) NOT NULL DEFAULT '',
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `drive_file_id` VARCHAR(128) NOT NULL DEFAULT '',
  `label` VARCHAR(255) NOT NULL DEFAULT '',
  `mime` VARCHAR(128) NOT NULL DEFAULT 'application/vnd.google-apps.document',
  `sort_order` INT NOT NULL DEFAULT 0,
  `output_pdf` TINYINT(1) NOT NULL DEFAULT 0,
  `embed_signature` TINYINT(1) NOT NULL DEFAULT 0,
  `is_budget` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created` DATETIME NULL,
  `modified` DATETIME NULL,
  KEY `idx_dt_project_type` (`project_type`),
  KEY `idx_dt_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `required_document_templates` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `project_type_code` VARCHAR(16) NOT NULL DEFAULT '',
  `doc_key` VARCHAR(64) NOT NULL DEFAULT '',
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  KEY `idx_rdt_project_type` (`project_type_code`),
  KEY `idx_rdt_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scientific_works` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `author_email` VARCHAR(255) NOT NULL DEFAULT '',
  `title` VARCHAR(500) NOT NULL DEFAULT '',
  `authors` VARCHAR(500) NOT NULL DEFAULT '',
  `publication` VARCHAR(255) NOT NULL DEFAULT '',
  `year` INT NULL,
  `doi` VARCHAR(255) NOT NULL DEFAULT '',
  `url` VARCHAR(500) NOT NULL DEFAULT '',
  `cited_by` INT NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'orcid',
  `created` DATETIME NULL,
  KEY `idx_sw_author_email` (`author_email`),
  KEY `idx_sw_doi` (`doi`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_scientific_profile` (
  `email` VARCHAR(255) NOT NULL PRIMARY KEY,
  `orcid` VARCHAR(32) NULL,
  `full_name` VARCHAR(255) NOT NULL DEFAULT '',
  `work_count` INT NOT NULL DEFAULT 0,
  `last_synced` DATETIME NULL,
  `created` DATETIME NULL,
  KEY `idx_usp_orcid` (`orcid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `document_comments` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `doc_id` VARCHAR(128) NOT NULL DEFAULT '',
  `author` VARCHAR(255) NOT NULL DEFAULT '',
  `text` TEXT NOT NULL,
  `created_at` DATETIME NULL,
  KEY `idx_dc_doc_id` (`doc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
