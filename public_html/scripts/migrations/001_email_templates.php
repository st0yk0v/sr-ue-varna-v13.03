<?php
// T81: Migration 001 — email_templates table
// Creates the email notification templates table for T49.

return "CREATE TABLE IF NOT EXISTS email_templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL COMMENT 'Template name (e.g. application_submitted)',
    lang VARCHAR(5) NOT NULL DEFAULT 'bg' COMMENT 'Language code: bg or en',
    subject TEXT NOT NULL DEFAULT '' COMMENT 'Email subject line',
    body LONGTEXT NOT NULL DEFAULT '' COMMENT 'Email body (may contain {placeholders})',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_template_name_lang (name, lang),
    KEY idx_template_lang (lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Email notification templates (T49)'";
