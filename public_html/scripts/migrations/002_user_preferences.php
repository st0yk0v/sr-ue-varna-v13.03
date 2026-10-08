<?php
// T81: Migration 002 — user_preferences table
// Creates user notification preferences table for T52.

return "CREATE TABLE IF NOT EXISTS user_preferences (
    email VARCHAR(255) NOT NULL PRIMARY KEY COMMENT 'User email (primary key)',
    prefs_json JSON NOT NULL DEFAULT '{}' COMMENT 'JSON object with user preferences',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_user_prefs_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='User notification preferences (T52)'";
