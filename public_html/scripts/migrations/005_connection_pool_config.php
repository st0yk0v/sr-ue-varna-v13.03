<?php
// T81/T84: Migration 005 — system_config table for connection pool settings
// Stores runtime configuration values including DB pool parameters.

return "CREATE TABLE IF NOT EXISTS system_config (
    `key` VARCHAR(100) NOT NULL PRIMARY KEY COMMENT 'Config key',
    `value` TEXT NOT NULL DEFAULT '' COMMENT 'Config value (JSON or scalar)',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_config_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Runtime system configuration (T84 connection pool, T85 read replica)'";
