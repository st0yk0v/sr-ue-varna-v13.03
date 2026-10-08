-- ============================================================
-- Proposal Wizard Tables — Self-healing schema
-- ============================================================
-- All tables: InnoDB + utf8mb4
-- Foreign keys cascade on submission deletion.
-- ============================================================

CREATE TABLE IF NOT EXISTS `wizard_submissions` (
    `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_email`       VARCHAR(255)    NOT NULL,
    `project_type`     VARCHAR(100)    NOT NULL,
    `current_step`     TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `status`           ENUM('draft','in_progress','review','submitted','rejected') NOT NULL DEFAULT 'draft',
    `created_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `submitted_at`     TIMESTAMP       NULL     DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_ws_user_email`     (`user_email`),
    KEY `idx_ws_status`         (`status`),
    KEY `idx_ws_current_step`   (`current_step`),
    KEY `idx_ws_project_type`   (`project_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `wizard_documents` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `submission_id` BIGINT UNSIGNED NOT NULL,
    `doc_type`      VARCHAR(100)    NOT NULL,
    `status`        ENUM('pending','uploaded','processing','approved','rejected') NOT NULL DEFAULT 'pending',
    `drive_file_id` VARCHAR(512)    NULL     DEFAULT NULL,
    `download_url`  TEXT            NULL     DEFAULT NULL,
    `uploaded_at`   TIMESTAMP       NULL     DEFAULT NULL,
    `last_modified` TIMESTAMP       NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_wd_submission`  (`submission_id`),
    KEY `idx_wd_doc_type`    (`doc_type`),
    KEY `idx_wd_status`      (`status`),
    CONSTRAINT `fk_wd_submission`
        FOREIGN KEY (`submission_id`) REFERENCES `wizard_submissions` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `wizard_budgets` (
    `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `submission_id`    BIGINT UNSIGNED NOT NULL,
    `category_key`     VARCHAR(100)         NOT NULL,
    `allocated_amount` DECIMAL(15,2)        NOT NULL DEFAULT 0.00,
    `cap_percent`      DECIMAL(5,2)         NOT NULL DEFAULT 0.00,
    `is_over_cap`      TINYINT(1)           NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_wb_submission`    (`submission_id`),
    KEY `idx_wb_category_key`  (`category_key`),
    KEY `idx_wb_over_cap`      (`is_over_cap`),
    CONSTRAINT `fk_wb_submission`
        FOREIGN KEY (`submission_id`) REFERENCES `wizard_submissions` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `wizard_referees` (
    `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `submission_id`  BIGINT UNSIGNED NOT NULL,
    `name`           VARCHAR(255)    NOT NULL,
    `academic_title` VARCHAR(100)    NULL     DEFAULT NULL,
    `organization`   VARCHAR(255)    NULL     DEFAULT NULL,
    `email`          VARCHAR(255)    NOT NULL,
    `phone`          VARCHAR(50)     NULL     DEFAULT NULL,
    `is_duplicate`   TINYINT(1)      NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_wr_submission` (`submission_id`),
    KEY `idx_wr_email`      (`email`),
    KEY `idx_wr_duplicate`  (`is_duplicate`),
    CONSTRAINT `fk_wr_submission`
        FOREIGN KEY (`submission_id`) REFERENCES `wizard_submissions` (`id`)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;