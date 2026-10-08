<?php
// T81: Migration 003 — webhooks table
// Creates webhook registration table for T139.

return "CREATE TABLE IF NOT EXISTS webhooks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL COMMENT 'User email who registered the webhook',
    url VARCHAR(512) NOT NULL COMMENT 'Webhook endpoint URL',
    events_json JSON NOT NULL DEFAULT '[]' COMMENT 'JSON array of event names to subscribe to',
    secret VARCHAR(64) NOT NULL COMMENT 'Secret key for HMAC signature verification',
    active TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Whether the webhook is active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_webhook_email (email),
    KEY idx_webhook_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Webhook registrations (T139)'";
