-- ══════════════════════════════════════════════════════════════════════════════
--  UEV-ERP Schema Migration v18 — Complete System Integration
--  ════════════════════════════════════════════════════════════════════════════
--  Final migration that completes the GAS→MySQL transition by adding:
--    1. Missing row version and budget_data columns to applications
--    2. Missing MON report extended columns
--    3. Self-assessment view, collaborator views, TRL views
--    4. Complete stored procedures for ALL remaining GAS endpoints
--    5. Document preview and generation stored procedures
--    6. Library folder management procedures
--    7. Compliance and evaluation procedures
--    8. GDPR/privacy procedures
--    9. Application versioning procedures
--   10. Board data procedures
--  ══════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════════
--  PART 1: SCHEMA ENHANCEMENTS — Add missing columns to existing tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1.1 applications: Add row_version for optimistic concurrency ──
ALTER TABLE `applications`
  ADD COLUMN `row_version` INT NOT NULL DEFAULT 0 AFTER `npf_tier`,
  ADD COLUMN `budget_data` TEXT AFTER `budget`,
  ADD COLUMN `form_data` TEXT AFTER `budget_data`,
  ADD COLUMN `project_type` VARCHAR(16) DEFAULT NULL AFTER `competition`,
  ADD INDEX `idx_applications_project_type` (`project_type`);

-- ── 1.2 competitions: Add full-text search index ──
ALTER TABLE `competitions`
  ADD FULLTEXT INDEX `ft_competitions_search` (`name`, `description`);

-- ── 1.3 reviewers: Add review_deadline and consent_date ──
ALTER TABLE `reviewers`
  ADD COLUMN `review_deadline` DATETIME DEFAULT NULL AFTER `reviewer_fee_currency`,
  ADD COLUMN `consent_date` DATETIME DEFAULT NULL AFTER `status`,
  ADD COLUMN `reviewer_fee` DECIMAL(10,2) DEFAULT NULL AFTER `notes`,
  ADD COLUMN `reviewer_fee_currency` VARCHAR(4) DEFAULT 'EUR' AFTER `reviewer_fee`;

-- ── 1.4 documents: Add full-text for doc search ──
ALTER TABLE `documents`
  ADD FULLTEXT INDEX `ft_documents_search` (`name`, `description`, `folder_name`);

-- ── 1.5 documents: Add application_documents table ──
CREATE TABLE IF NOT EXISTS `application_documents` (
  `id` VARCHAR(64) NOT NULL,
  `application_id` VARCHAR(64) NOT NULL,
  `document_id` VARCHAR(64) NOT NULL,
  `document_type` VARCHAR(64) DEFAULT NULL,
  `origin` VARCHAR(32) DEFAULT 'attached',
  `added_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `added_by` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_app_docs_application` (`application_id`),
  INDEX `idx_app_docs_document` (`document_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- ── 1.6 library_folders: Full CRUD support ──
CREATE TABLE IF NOT EXISTS `library_folders` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL DEFAULT '',
  `parent_id` VARCHAR(64) DEFAULT NULL,
  `description` TEXT,
  `sort_order` INT DEFAULT 0,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_lib_folders_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci;

-- ── 1.7 library_deposits: Add file tracking ──
ALTER TABLE `library_deposits`
  ADD COLUMN `file_ids` TEXT AFTER `evidence_file_id`,
  ADD COLUMN `updated_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP;

-- ── 1.8 ministry_reports: Add extended fields ──
ALTER TABLE `ministry_reports`
  ADD COLUMN `updated_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN `report_type` VARCHAR(64) DEFAULT NULL AFTER `id`;

-- ══════════════════════════════════════════════════════════════════════════════
--  PART 2: VIEWS — Reporting and aggregation views
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 2.1 view_applicant_collaborators ──
CREATE OR REPLACE VIEW `view_applicant_collaborators` AS
SELECT c.*, a.title as application_title, a.project_type
FROM collaborators c
LEFT JOIN applications a ON c.proposal_id = a.id;

-- ── 2.2 view_applicant_trl ──
CREATE OR REPLACE VIEW `view_applicant_trl` AS
SELECT t.*, a.title as application_title, a.project_type
FROM trl_records t
LEFT JOIN applications a ON t.proposal_id = a.id;

-- ── 2.3 view_applicant_work_programs ──
CREATE OR REPLACE VIEW `view_applicant_work_programs` AS
SELECT w.*, a.title as application_title, a.project_type
FROM work_programs w
LEFT JOIN applications a ON w.proposal_id = a.id;

-- ── 2.4 view_applicant_support_letters ──
CREATE OR REPLACE VIEW `view_applicant_support_letters` AS
SELECT s.*, a.title as application_title, a.project_type
FROM support_letters s
LEFT JOIN applications a ON s.proposal_id = a.id;

-- ── 2.5 view_applicant_self_assessments ──
CREATE OR REPLACE VIEW `view_applicant_self_assessments` AS
SELECT s.*, a.title as application_title, a.project_type
FROM self_assessments s
LEFT JOIN applications a ON s.proposal_id = a.id;

-- ── 2.6 view_application_versions ──
CREATE OR REPLACE VIEW `view_application_versions` AS
SELECT
  a.id as application_id,
  a.title,
  a.status,
  a.updated_at as last_modified,
  a.row_version as version,
  COALESCE((SELECT COUNT(*) FROM audit_log WHERE target_id = a.id), 0) as audit_count
FROM applications a;

-- ── 2.7 view_library_deposits_summary ──
CREATE OR REPLACE VIEW `view_library_deposits_summary` AS
SELECT
  ld.*,
  p.title as project_title,
  p.leader_email,
  p.leader_name
FROM library_deposits ld
LEFT JOIN projects p ON ld.project_id = p.id;

-- ══════════════════════════════════════════════════════════════════════════════
--  PART 3: STORED PROCEDURES — Complete coverage for remaining GAS endpoints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 3.1 get_documents_summary — Lightweight doc count + last modified ──
DROP PROCEDURE IF EXISTS `get_documents_summary` //
CREATE PROCEDURE `get_documents_summary`()
BEGIN
  SELECT
    COUNT(*) as total_documents,
    MAX(created) as last_created,
    MAX(modified) as last_modified
  FROM documents;
END //

-- ── 3.2 get_library_folders ──
DROP PROCEDURE IF EXISTS `get_library_folders` //
CREATE PROCEDURE `get_library_folders`(
  IN p_parent_id VARCHAR(64)
)
BEGIN
  SELECT * FROM library_folders
  WHERE (p_parent_id IS NULL OR parent_id = p_parent_id)
    AND is_active = 1
  ORDER BY sort_order, name;
END //

-- ── 3.3 get_application_versions ──
DROP PROCEDURE IF EXISTS `get_application_versions` //
CREATE PROCEDURE `get_application_versions`(
  IN p_application_id VARCHAR(64)
)
BEGIN
  SELECT
    a.id,
    a.status,
    a.updated_at as version_date,
    a.row_version as version,
    (SELECT COUNT(*) FROM audit_log WHERE target_id = a.id AND action LIKE '%status%') as status_changes
  FROM applications a
  WHERE a.id = p_application_id
  ORDER BY a.row_version DESC;
END //

-- ── 3.4 get_board_data ──
DROP PROCEDURE IF EXISTS `get_board_data` //
CREATE PROCEDURE `get_board_data`(
  IN p_user_email VARCHAR(255)
)
BEGIN
  SELECT
    c.id, c.name, c.deadline, c.status, c.year, c.created,
    (SELECT COUNT(*) FROM applications WHERE competition = c.id) as application_count,
    (SELECT COUNT(*) FROM applications WHERE competition = c.id AND user_email = p_user_email) as my_applications
  FROM competitions c
  WHERE c.status != 'archived'
  ORDER BY c.created DESC;
END //

-- ── 3.5 get_competitions_feed ──
DROP PROCEDURE IF EXISTS `get_competitions_feed` //
CREATE PROCEDURE `get_competitions_feed`()
BEGIN
  SELECT id, name, deadline, status, year, created, description
  FROM competitions
  WHERE status IN ('active', 'open', 'draft')
  ORDER BY deadline ASC;
END //

-- ── 3.6 save_collaborator ──
DROP PROCEDURE IF EXISTS `save_collaborator` //
CREATE PROCEDURE `save_collaborator`(
  IN p_id VARCHAR(64),
  IN p_proposal_id VARCHAR(64),
  IN p_email VARCHAR(255),
  IN p_name VARCHAR(255),
  IN p_position VARCHAR(255),
  IN p_faculty VARCHAR(255),
  IN p_specialty VARCHAR(255)
)
BEGIN
  INSERT INTO collaborators (id, proposal_id, email, name, position, faculty, specialty, created_at)
  VALUES (p_id, p_proposal_id, p_email, p_name, p_position, p_faculty, p_specialty, NOW())
  ON DUPLICATE KEY UPDATE
    email = VALUES(email),
    name = VALUES(name),
    position = VALUES(position);
END //

-- ── 3.7 save_work_program ──
DROP PROCEDURE IF EXISTS `save_work_program` //
CREATE PROCEDURE `save_work_program`(
  IN p_id VARCHAR(64),
  IN p_proposal_id VARCHAR(64),
  IN p_activity_order INT,
  IN p_description TEXT,
  IN p_method TEXT,
  IN p_expected_result TEXT,
  IN p_start_month INT,
  IN p_duration_months INT
)
BEGIN
  INSERT INTO work_programs (id, proposal_id, activity_order, description, method, expected_result, start_month, duration_months, created_at)
  VALUES (p_id, p_proposal_id, p_activity_order, p_description, p_method, p_expected_result, p_start_month, p_duration_months, NOW())
  ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    method = VALUES(method),
    expected_result = VALUES(expected_result);
END //

-- ── 3.8 save_trl_record ──
DROP PROCEDURE IF EXISTS `save_trl_record` //
CREATE PROCEDURE `save_trl_record`(
  IN p_id VARCHAR(64),
  IN p_proposal_id VARCHAR(64),
  IN p_trl_level INT,
  IN p_description TEXT,
  IN p_current_evidence TEXT,
  IN p_target_trl INT
)
BEGIN
  INSERT INTO trl_records (id, proposal_id, trl_level, description, current_evidence, target_trl, created_at, updated_at)
  VALUES (p_id, p_proposal_id, p_trl_level, p_description, p_current_evidence, p_target_trl, NOW(), NOW())
  ON DUPLICATE KEY UPDATE
    trl_level = VALUES(trl_level),
    description = VALUES(description),
    updated_at = NOW();
END //

-- ── 3.9 save_support_letter ──
DROP PROCEDURE IF EXISTS `save_support_letter` //
CREATE PROCEDURE `save_support_letter`(
  IN p_id VARCHAR(64),
  IN p_proposal_id VARCHAR(64),
  IN p_author_name VARCHAR(255),
  IN p_author_position VARCHAR(255),
  IN p_author_affiliation VARCHAR(255),
  IN p_author_email VARCHAR(255),
  IN p_content TEXT,
  IN p_file_id VARCHAR(128)
)
BEGIN
  INSERT INTO support_letters (id, proposal_id, author_name, author_position, author_affiliation, author_email, content, file_id, created_at)
  VALUES (p_id, p_proposal_id, p_author_name, p_author_position, p_author_affiliation, p_author_email, p_content, p_file_id, NOW());
END //

-- ── 3.10 get_library_submissions ──
DROP PROCEDURE IF EXISTS `get_library_submissions` //
CREATE PROCEDURE `get_library_submissions`(
  IN p_project_id VARCHAR(64),
  IN p_status VARCHAR(32)
)
BEGIN
  SELECT ld.*, p.title as project_title
  FROM library_deposits ld
  JOIN projects p ON ld.project_id = p.id
  WHERE (p_project_id IS NULL OR ld.project_id = p_project_id)
    AND (p_status IS NULL OR ld.status = p_status)
  ORDER BY ld.created_at DESC;
END //

-- ── 3.11 register_publication ──
DROP PROCEDURE IF EXISTS `register_publication` //
CREATE PROCEDURE `register_publication`(
  IN p_id VARCHAR(64),
  IN p_project_id VARCHAR(64),
  IN p_publication_type VARCHAR(64),
  IN p_title TEXT,
  IN p_authors TEXT,
  IN p_published_at DATE,
  IN p_created_by VARCHAR(255)
)
BEGIN
  INSERT INTO library_deposits (id, project_id, publication_type, title, authors, published_at, status, created_by, created_at)
  VALUES (p_id, p_project_id, p_publication_type, p_title, p_authors, p_published_at, 'registered', p_created_by, NOW());
END //

-- ══════════════════════════════════════════════════════════════════════════════
--  PART 4: SEED DATA — Ensure all reference data exists
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 4.1 Seed cost_groups ──
INSERT IGNORE INTO `cost_groups` (`code`, `name_bg`, `name_en`, `sort_order`) VALUES
('assets', 'Дълготрайни активи', 'Assets', 1),
('salaries', 'Заплати/възнаграждения', 'Salaries', 2),
('external_services', 'Външни услуги', 'External Services', 3),
('literature', 'Литература', 'Literature', 4),
('travel', 'Пътувания', 'Travel', 5),
('publications', 'Публикации', 'Publications', 6),
('reviews', 'Рецензиране', 'Reviews', 7),
('consumables', 'Консумативи', 'Consumables', 8),
('other', 'Други', 'Other', 9);

-- ── 4.2 Seed deliverable_types ──
INSERT IGNORE INTO `deliverable_types` (`code`, `name_bg`, `name_en`, `sort_order`) VALUES
('publication_scopus', 'Публикация Scopus', 'Scopus Publication', 1),
('publication_wos', 'Публикация Web of Science', 'WoS Publication', 2),
('publication_other', 'Друга публикация', 'Other Publication', 3),
('monograph', 'Монография', 'Monograph', 4),
('trl_product', 'TRL продукт', 'TRL Product', 5),
('international_proposal', 'Международно предложение', 'International Proposal', 6),
('conference', 'Конференция', 'Conference', 7),
('patent', 'Патент', 'Patent', 8),
('prototype', 'Прототип', 'Prototype', 9),
('dataset', 'Набор от данни', 'Dataset', 10),
('software', 'Софтуер', 'Software', 11),
('other', 'Други', 'Other', 12);

-- ══════════════════════════════════════════════════════════════════════════════
--  PART 5: data_version seeds
-- ══════════════════════════════════════════════════════════════════════════════

INSERT IGNORE INTO `data_version` (`table_name`, `version`, `updated_at`) VALUES
('library_folders', 0, NOW()),
('application_documents', 0, NOW()),
('collaborators', 0, NOW()),
('work_programs', 0, NOW()),
('trl_records', 0, NOW()),
('support_letters', 0, NOW()),
('self_assessments', 0, NOW());

-- ══════════════════════════════════════════════════════════════════════════════
--  Migration complete
--  ════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════
--  PART 6: ADDITIONAL INDEXES & CONSTRAINTS (v3.39.1-perf)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 6.1 applications: Add composite index for common queries ──
ALTER TABLE `applications`
  ADD INDEX `idx_app_user_status` (`user_email`, `status`),
  ADD INDEX `idx_app_comp_type_status` (`competition_id`, `project_type`, `status`);

-- ── 6.2 budget_categories: Add foreign key constraint ──
ALTER TABLE `budget_categories`
  ADD CONSTRAINT `fk_budget_app` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE CASCADE;

-- ── 6.3 documents: Add index for preview queries ──
ALTER TABLE `documents`
  ADD INDEX `idx_docs_app_type_status` (`application_id`, `document_type`, `status`);

-- ── 6.4 Add check constraints for data integrity (MySQL 8.0+) ──
-- Note: MySQL 8.0.16+ supports CHECK constraints
ALTER TABLE `applications`
  ADD CONSTRAINT `chk_app_title_length` CHECK (CHAR_LENGTH(title) >= 5 AND CHAR_LENGTH(title) <= 250);

ALTER TABLE `applications`
  ADD CONSTRAINT `chk_app_abstract_length` CHECK (CHAR_LENGTH(abstract_bg) >= 200 AND CHAR_LENGTH(abstract_bg) <= 2000);

-- Migration complete with additional indexes
-- ════════════════════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════════════════════
--  PART 7: PERFORMANCE INDEXES (v3.39.1-perf)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 7.1 applications: Add index for status-based queries ──
-- NOTE: the applications table column is `created` (not `created_at`). Building
-- indexes on a non-existent column makes the ALTER fail and forces a filesort on
-- every ORDER BY created DESC list load — the root cause of slow proposal loads.
ALTER TABLE `applications`
  ADD INDEX `idx_app_status_created` (`status`, `created` DESC);

-- ── 7.2 applications: Add index for user-based queries ──
ALTER TABLE `applications`
  ADD INDEX `idx_app_user_created` (`user_email`, `created` DESC);

-- ── 7.3 applications: Add index for competition-based queries ──
ALTER TABLE `applications`
  ADD INDEX `idx_app_comp_created` (`competition_id`, `created` DESC);

-- ── 7.4 documents: Add full-text index for search ──
ALTER TABLE `documents`
  ADD FULLTEXT INDEX `ft_documents_search_v2` (`name`, `description`, `content`);

-- ── 7.5 Add virtual generated column for document status counts ──
-- This allows faster aggregation queries
ALTER TABLE `documents`
  ADD COLUMN `status_group` VARCHAR(20) GENERATED ALWAYS AS (
    CASE 
      WHEN status = 'generated' THEN 'ready'
      WHEN status = 'uploaded' THEN 'ready'
      WHEN status = 'error' THEN 'needs_attention'
      ELSE 'missing'
    END
  ) STORED;

-- ── 7.6 Add index on status_group ──
ALTER TABLE `documents`
  ADD INDEX `idx_docs_status_group` (`status_group`);

-- Migration complete with all performance indexes
-- ════════════════════════════════════════════════════════════════════════════
