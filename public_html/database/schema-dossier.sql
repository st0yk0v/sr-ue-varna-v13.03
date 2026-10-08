-- UEV-ERP dossier / supplementary-sections schema
-- Tasks 21 (DocComments) & 22 (Self-Assessment / TRL / Work Program / Support Letters)
-- Idempotent. Safe to run repeatedly; handlers also self-create these via
-- ensureDossierTables() so the live feature works without a manual step.
-- Charset must match the rest of the schema (utf8mb4).

CREATE TABLE IF NOT EXISTS `document_comments` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `doc_id` VARCHAR(128) NOT NULL DEFAULT '',
  `author` VARCHAR(255) NOT NULL DEFAULT '',
  `text` TEXT NOT NULL,
  `created_at` DATETIME NULL,
  KEY `idx_dc_doc_id` (`doc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `self_assessments` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
  `project_type` VARCHAR(32) NOT NULL DEFAULT '',
  `applicant_email` VARCHAR(255) NOT NULL DEFAULT '',
  `scores` JSON NULL,
  `total_points` INT NOT NULL DEFAULT 0,
  `max_points` INT NOT NULL DEFAULT 100,
  `threshold_met` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  KEY `idx_sa_proposal` (`proposal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trl_records` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
  `trl_level` TINYINT NOT NULL DEFAULT 0,
  `description` TEXT NULL,
  `current_evidence` TEXT NULL,
  `target_trl` TINYINT NOT NULL DEFAULT 0,
  `created_at` DATETIME NULL,
  `updated_at` DATETIME NULL,
  KEY `idx_trl_proposal` (`proposal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `work_programs` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
  `activity_order` INT NOT NULL DEFAULT 0,
  `description` TEXT NULL,
  `method` TEXT NULL,
  `expected_result` TEXT NULL,
  `start_month` INT NULL,
  `duration_months` INT NULL,
  `created_at` DATETIME NULL,
  KEY `idx_wp_proposal` (`proposal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `support_letters` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
  `author_name` VARCHAR(255) NOT NULL DEFAULT '',
  `author_position` VARCHAR(255) NOT NULL DEFAULT '',
  `author_affiliation` VARCHAR(255) NOT NULL DEFAULT '',
  `author_email` VARCHAR(255) NOT NULL DEFAULT '',
  `content` TEXT NULL,
  `file_id` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME NULL,
  KEY `idx_sl_proposal` (`proposal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `collaborators` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `proposal_id` VARCHAR(128) NOT NULL DEFAULT '',
  `email` VARCHAR(255) NOT NULL DEFAULT '',
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `position` VARCHAR(255) NOT NULL DEFAULT '',
  `faculty` VARCHAR(255) NOT NULL DEFAULT '',
  `specialty` VARCHAR(255) NOT NULL DEFAULT '',
  `created_at` DATETIME NULL,
  KEY `idx_col_proposal` (`proposal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
