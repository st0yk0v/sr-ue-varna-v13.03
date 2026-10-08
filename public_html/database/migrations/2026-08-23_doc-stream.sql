-- ============================================================
-- Real-Time Collaborative Document Streaming Schema
-- Engine: InnoDB, Charset: utf8mb4
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1. doc_stream_docs — snapshot of each document's content
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `doc_stream_docs` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `doc_id` VARCHAR(64) NOT NULL,
    `content_html` LONGTEXT NULL COMMENT 'Full HTML snapshot of the document content',
    `last_version` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Highest op version applied',
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_doc_id` (`doc_id`),
    KEY `idx_last_version` (`last_version`),
    KEY `idx_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='Latest snapshot of document content for streaming';

-- ------------------------------------------------------------
-- 2. doc_stream_sessions — active editing sessions (live cursors)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `doc_stream_sessions` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `doc_id` VARCHAR(64) NOT NULL,
    `user_email` VARCHAR(255) NOT NULL,
    `user_name` VARCHAR(150) NULL,
    `cursor_position` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Cursor offset within the document',
    `last_seen` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `color` CHAR(7) NULL COMMENT 'Hex color for cursor highlight (e.g. #3B82F6)',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uniq_doc_user` (`doc_id`, `user_email`),
    KEY `idx_doc_id` (`doc_id`),
    KEY `idx_last_seen` (`last_seen`),
    CONSTRAINT `fk_session_doc_id`
        FOREIGN KEY (`doc_id`) REFERENCES `doc_stream_docs` (`doc_id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='Active collaborative editing sessions with live cursor info';

-- ------------------------------------------------------------
-- 3. doc_stream_ops — append-only operation log (OT / CRDT input)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `doc_stream_ops` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `doc_id` VARCHAR(64) NOT NULL,
    `user_email` VARCHAR(255) NOT NULL,
    `op_type` ENUM('insert','delete','retain','format','replace') NOT NULL DEFAULT 'insert',
    `op_data` JSON NOT NULL COMMENT 'Operation payload (position, text, attributes, etc.)',
    `version` INT UNSIGNED NOT NULL COMMENT 'Document version this op applies to',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_doc_version` (`doc_id`, `version`),
    KEY `idx_user_email` (`user_email`),
    KEY `idx_created_at` (`created_at`),
    CONSTRAINT `fk_op_doc_id`
        FOREIGN KEY (`doc_id`) REFERENCES `doc_stream_docs` (`doc_id`)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    COMMENT='Append-only log of all collaborative operations';

SET FOREIGN_KEY_CHECKS = 1;