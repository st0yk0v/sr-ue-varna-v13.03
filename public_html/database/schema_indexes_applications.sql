-- ══════════════════════════════════════════════════════════════════════════════
--  UEV-ERP — Performance indexes for `applications` (proposals list view)
--  v3.39.2-perf  •  idempotent • safe to run repeatedly on the live DB
--
--  WHY THIS FILE EXISTS
--  ────────────────────
--  The proposals table is sorted by `created DESC` on every list load
--  (handleGetForms / sqlGetMyForms / _fallbackGetForms). The v18 migration
--  accidentally built its ordering indexes on a column named `created_at`,
--  which does NOT exist on `applications` (the real column is `created`).
--  Those ALTERs failed, so MySQL fell back to a filesort on every page —
--  the perceived "slow loading of application proposals".
--
--  This script (re)creates the correct indexes using CREATE INDEX IF NOT EXISTS
--  so it is safe to run on the production Hostinger DB at any time, even if some
--  indexes already exist.
-- ══════════════════════════════════════════════════════════════════════════════

-- Standalone sort key: covers admin "all proposals" ORDER BY created DESC
CREATE INDEX IF NOT EXISTS `idx_app_created`
  ON `applications` (`created` DESC);

-- Applicant "Моите проектни предложения": WHERE user_email=? ORDER BY created DESC
CREATE INDEX IF NOT EXISTS `idx_app_user_created`
  ON `applications` (`user_email`, `created` DESC);

-- Status-filtered lists: WHERE status=? ORDER BY created DESC
CREATE INDEX IF NOT EXISTS `idx_app_status_created`
  ON `applications` (`status`, `created` DESC);

-- Competition-filtered lists: WHERE competition_id=? ORDER BY created DESC
CREATE INDEX IF NOT EXISTS `idx_app_comp_created`
  ON `applications` (`competition_id`, `created` DESC);

-- Common filter combos (no filesort, index-only range scan)
CREATE INDEX IF NOT EXISTS `idx_app_user_status`
  ON `applications` (`user_email`, `status`);

CREATE INDEX IF NOT EXISTS `idx_app_comp_type_status`
  ON `applications` (`competition_id`, `project_type`, `status`);

CREATE INDEX IF NOT EXISTS `idx_app_project_type`
  ON `applications` (`project_type`);

-- ══════════════════════════════════════════════════════════════════════════════
--  documents — library / per-user doc lookups
--  handleListMyDocuments filters on user_email and on form_id ∈ (applications
--  by user_email). Without these indexes the correlated subquery scans the whole
--  documents table on every "Моите документи" open.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS `idx_docs_user_email`
  ON `documents` (`user_email`);

CREATE INDEX IF NOT EXISTS `idx_docs_form_id`
  ON `documents` (`form_id`);

CREATE INDEX IF NOT EXISTS `idx_docs_appid_email`
  ON `documents` (`application_id`, `user_email`);

CREATE INDEX IF NOT EXISTS `idx_docs_status_group`
  ON `documents` (`status_group`);

-- ══════════════════════════════════════════════════════════════════════════════
--  Verify (optional): confirm the indexes now exist
--    SHOW INDEX FROM `applications` WHERE Key_name LIKE 'idx_app%';
-- ══════════════════════════════════════════════════════════════════════════════
