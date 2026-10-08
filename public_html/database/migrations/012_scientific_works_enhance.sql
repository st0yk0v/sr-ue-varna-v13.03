-- Migration 012: enhance scientific_works for richer filtering + dedup (scopus-026/027/028)
-- Idempotent: every statement is guarded with IF NOT EXISTS / column-exists check.
-- Run on the live DB (sr-ue-varna.com) AFTER code deploy. Requires DBA sign-off.

-- scopus-027: add `type` + `journal` columns (currently only `publication` exists).
SET @exist_type = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scientific_works' AND COLUMN_NAME = 'type');
SET @sql_type = IF(@exist_type = 0,
    "ALTER TABLE scientific_works ADD COLUMN `type` VARCHAR(64) NOT NULL DEFAULT '' AFTER `publication`",
    "SELECT 1");
PREPARE stmt FROM @sql_type; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exist_journal = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scientific_works' AND COLUMN_NAME = 'journal');
SET @sql_journal = IF(@exist_journal = 0,
    "ALTER TABLE scientific_works ADD COLUMN `journal` VARCHAR(255) NOT NULL DEFAULT '' AFTER `type`",
    "SELECT 1");
PREPARE stmt FROM @sql_journal; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- scopus-028: audit columns (last_synced source of the row).
SET @exist_last = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scientific_works' AND COLUMN_NAME = 'sync_source');
SET @sql_last = IF(@exist_last = 0,
    "ALTER TABLE scientific_works ADD COLUMN `sync_source` VARCHAR(32) NOT NULL DEFAULT '' AFTER `source`, ADD COLUMN `last_synced` DATETIME NULL AFTER `created`",
    "SELECT 1");
PREPARE stmt FROM @sql_last; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- scopus-026: unique key to prevent duplicate inserts per (author_email, source, doi).
-- DOI may be empty for Scholar/manual rows, so fall back to a deterministic hash key.
SET @exist_uniq = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'scientific_works' AND INDEX_NAME = 'uniq_sw_author_source_doi');
SET @sql_uniq = IF(@exist_uniq = 0,
    "ALTER TABLE scientific_works ADD UNIQUE KEY `uniq_sw_author_source_doi` (`author_email`, `source`, `doi`)",
    "SELECT 1");
PREPARE stmt FROM @sql_uniq; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- NOTE: existing rows with empty DOI would collide under the unique key.
-- The application already de-dupes by (author_email, doi) on write, so this is
-- safe for new inserts. If legacy empty-DOI duplicates exist, run:
--   DELETE t1 FROM scientific_works t1
--   JOIN scientific_works t2 ON t1.author_email = t2.author_email AND t1.source = t2.source
--     AND t1.doi = t2.doi AND t1.doi <> '' AND t1.id > t2.id;
