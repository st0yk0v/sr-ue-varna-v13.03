<?php
// T81/T82: Migration 004 — Performance indexes for common query patterns
// Adds indexes that optimize slow queries identified in T83 analysis.
// Idempotent: uses CREATE INDEX IF NOT EXISTS (MySQL 8.0.29+).

return "
-- ══════════════════════════════════════════════════════════════════════════════
--  Migration 004: Performance indexes
--  T82: Index Optimization — adds missing indexes for hot query paths
-- ══════════════════════════════════════════════════════════════════════════════

-- applications: composite index for admin list with status filter + sort
CREATE INDEX IF NOT EXISTS `idx_app_status_created`
  ON `applications` (`status`, `created` DESC);

-- applications: index for competition lookups with project type
CREATE INDEX IF NOT EXISTS `idx_app_comp_type`
  ON `applications` (`competition_id`, `project_type`);

-- documents: index for origin-based filtering (library cleanup queries)
CREATE INDEX IF NOT EXISTS `idx_docs_origin_created`
  ON `documents` (`origin`, `created_at` DESC);

-- documents: index for md5_hash lookups (duplicate detection)
CREATE INDEX IF NOT EXISTS `idx_docs_md5`
  ON `documents` (`md5_hash`);

-- audit_log: index for recent audit entries by actor
CREATE INDEX IF NOT EXISTS `idx_audit_actor_created`
  ON `audit_log` (`actor`, `created` DESC);

-- data_version: index for version lookups by table
CREATE INDEX IF NOT EXISTS `idx_dv_table`
  ON `data_version` (`table_name`);

-- webhooks: index for active webhook lookups
CREATE INDEX IF NOT EXISTS `idx_webhooks_active`
  ON `webhooks` (`active`, `email`);
";
