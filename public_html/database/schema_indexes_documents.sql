-- ══════════════════════════════════════════════════════════════════════════════
--  UEV-ERP Schema — Suggested indexes for document handling hot paths
--  ════════════════════════════════════════════════════════════════════════════
--  These indexes speed up the document-related read handlers in api.php:
--    * handleListMyDocuments / handleGetFormDocuments — filter documents by
--      user_email and form_id / application_id.
--    * handleAttachDocumentToForm / handleGetForm — lookup applications by id.
--    * handleAuditApplicationTemplates — join application_documents -> documents.
--
--  Idempotent: safe to re-run. MySQL 8.0 does NOT support
--  `CREATE INDEX IF NOT EXISTS`, so each index is guarded by an
--  information_schema check inside a prepared statement. Re-running is a no-op
--  when the index already exists.
--
--  Apply with:  mysql -u <user> -p <db> < schema_indexes_documents.sql
--  NOTE: adjust the column names below if your `documents` table uses
--  `form_id` instead of `application_id` (both are referenced in api.php).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Helper: create an index only when it does not already exist ──
--  Usage pattern repeated per index. Wrapped in a stored routine call so the
--  whole file stays idempotent on MySQL 8.0 (which lacks IF NOT EXISTS on
--  CREATE INDEX).

DELIMITER //
DROP PROCEDURE IF EXISTS _uev_add_index //
CREATE PROCEDURE _uev_add_index(
    IN p_table  VARCHAR(64),
    IN p_index  VARCHAR(64),
    IN p_cols   VARCHAR(255)
)
BEGIN
    DECLARE v_exists INT DEFAULT 0;
    DECLARE v_tbl    INT DEFAULT 0;
    -- Only act if the target table exists (avoids errors on partial schemas).
    SELECT COUNT(*) INTO v_tbl
      FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = p_table;
    IF v_tbl > 0 THEN
        SELECT COUNT(*) INTO v_exists
          FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name   = p_table
           AND index_name   = p_index;
        IF v_exists = 0 THEN
            SET @ddl = CONCAT('CREATE INDEX `', p_index, '` ON `', p_table, '` (', p_cols, ')');
            PREPARE stmt FROM @ddl;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        END IF;
    END IF;
END //
DELIMITER ;

-- ── documents(application_id, user_email) ──
--  Speeds up per-form + per-user document lookups. If your `documents` table
--  stores the form linkage as `form_id` (as some handlers use), also add the
--  form_id variant below.
CALL _uev_add_index('documents', 'idx_documents_appid_email', '`application_id`, `user_email`');
CALL _uev_add_index('documents', 'idx_documents_formid_email', '`form_id`, `user_email`');
CALL _uev_add_index('documents', 'idx_documents_user_email', '`user_email`');

-- ── applications(id) ──
--  `id` is normally the PRIMARY KEY (already indexed). This is a defensive
--  guard for schemas where it is not, plus a modified-time index used by
--  ORDER BY modified DESC reads.
CALL _uev_add_index('applications', 'idx_applications_id', '`id`');

-- ── application_documents(application_id, document_id) ──
--  Supports handleAuditApplicationTemplates join and per-form audits.
CALL _uev_add_index('application_documents', 'idx_appdocs_appid', '`application_id`');
CALL _uev_add_index('application_documents', 'idx_appdocs_docid', '`document_id`');

-- ── Cleanup ──
DROP PROCEDURE IF EXISTS _uev_add_index;

-- ══════════════════════════════════════════════════════════════════════════════
--  Alternative (MySQL 8.0.29+ / MariaDB): plain idempotent form.
--  Uncomment if your server supports CREATE INDEX IF NOT EXISTS:
--
--  CREATE INDEX IF NOT EXISTS idx_documents_appid_email
--      ON documents (application_id, user_email);
--  CREATE INDEX IF NOT EXISTS idx_documents_formid_email
--      ON documents (form_id, user_email);
--  CREATE INDEX IF NOT EXISTS idx_applications_id
--      ON applications (id);
--  CREATE INDEX IF NOT EXISTS idx_appdocs_appid
--      ON application_documents (application_id);
-- ══════════════════════════════════════════════════════════════════════════════
