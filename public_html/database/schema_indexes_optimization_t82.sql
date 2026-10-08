-- ══════════════════════════════════════════════════════════════════════════════
--  UEV-ERP — T82: Index Optimization Analysis & Application
--  v12.54.21  •  idempotent • safe to run on production
--
--  This script:
--    1. Analyzes existing indexes and identifies missing ones
--    2. Applies missing indexes for the hottest query paths
--    3. Reports index usage statistics
--
--  Apply with: mysql -u <user> -p <db> < database/schema_indexes_optimization_t82.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Section 1: Identify missing indexes (diagnostic) ─────────────────────────
-- Run these SELECTs to see what indexes are currently used/missing:

/*
-- Show all indexes on key tables:
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('applications', 'documents', 'audit_log', 'data_version', 'webhooks')
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;

-- Find tables without indexes on foreign-key-like columns:
SELECT DISTINCT TABLE_NAME, COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND COLUMN_NAME IN ('user_email', 'form_id', 'application_id', 'competition_id', 'status', 'origin')
  AND CONCAT(TABLE_NAME, '.', COLUMN_NAME) NOT IN (
    SELECT CONCAT(TABLE_NAME, '.' || COLUMN_NAME)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
  );
*/

-- ── Section 2: Apply missing indexes ─────────────────────────────────────────
-- Each CREATE INDEX is idempotent (IF NOT EXISTS where supported).

-- applications: covers ORDER BY created DESC with status filter
CREATE INDEX IF NOT EXISTS `idx_app_status_created`
  ON `applications` (`status`, `created` DESC);

-- applications: covers WHERE competition_id=? AND project_type=?
CREATE INDEX IF NOT EXISTS `idx_app_comp_type`
  ON `applications` (`competition_id`, `project_type`);

-- documents: covers WHERE origin=? ORDER BY created_at DESC (cleanup queries)
CREATE INDEX IF NOT EXISTS `idx_docs_origin_created`
  ON `documents` (`origin`, `created_at` DESC);

-- documents: covers duplicate-detection WHERE md5_hash=? (admin cleanup)
CREATE INDEX IF NOT EXISTS `idx_docs_md5`
  ON `documents` (`md5_hash`);

-- audit_log: covers WHERE actor=? ORDER BY created DESC (audit views)
CREATE INDEX IF NOT EXISTS `idx_audit_actor_created`
  ON `audit_log` (`actor`, `created` DESC);

-- data_version: covers WHERE table_name=? (polling endpoint)
CREATE INDEX IF NOT EXISTS `idx_dv_table`
  ON `data_version` (`table_name`);

-- webhooks: covers WHERE active=1 AND email=? (webhook dispatch)
CREATE INDEX IF NOT EXISTS `idx_webhooks_active`
  ON `webhooks` (`active`, `email`);

-- ── Section 3: Verify indexes applied ────────────────────────────────────────
/*
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns,
       CARDINALITY, INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND INDEX_name LIKE 'idx_%'
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;
*/
