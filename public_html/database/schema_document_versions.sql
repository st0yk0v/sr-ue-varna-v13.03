-- ══════════════════════════════════════════════════════════════════════════════
--  UEV-ERP — document_versions table (D10: Document version history)
--  Idempotent: safe to re-run. Records a row whenever a document's content is
--  saved (savedocumentcontent / uploadmydocument) so the modal can show a
--  timestamped revision list. Mirrors Google Drive's revision history locally
--  because the ERP does not proxy Drive revisions directly.
--  Apply with:  mysql -u <user> -p <db> < schema_document_versions.sql
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `document_versions` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `doc_id`     VARCHAR(128) NOT NULL,
    `drive_id`   VARCHAR(128) DEFAULT NULL,
    `name`       VARCHAR(512) DEFAULT NULL,
    `user_email` VARCHAR(255) DEFAULT NULL,
    `note`       VARCHAR(512) DEFAULT NULL,
    `created`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_docversions_doc` (`doc_id`),
    KEY `idx_docversions_drive` (`drive_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
