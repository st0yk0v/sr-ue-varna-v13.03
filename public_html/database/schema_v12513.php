<?php
// ── Schema migration: v12.51.3 additions ──────────────────────────────────
// T49: email_templates, T52: user_preferences, T72: sessions, T139: webhooks,
// T140: graphql support, T81: migration_history, T71: failed_logins, T141: transaction_log

function ensureSchemaV12513(): void {
    try {
        $db = getDB();
    } catch (Throwable $e) { return; }

    // T141: Transaction log for activity diary (login events, actions)
    $db->exec("CREATE TABLE IF NOT EXISTS `transaction_log` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `action` VARCHAR(50) NOT NULL,
        `entity` VARCHAR(50) NOT NULL DEFAULT '',
        `entity_id` VARCHAR(100) NOT NULL DEFAULT '',
        `actor` VARCHAR(255) NOT NULL DEFAULT '',
        `details` JSON NULL DEFAULT NULL,
        `created` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_tl_actor` (`actor`),
        KEY `idx_tl_action` (`action`),
        KEY `idx_tl_created` (`created`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // T49: Email notification templates
    $db->exec("CREATE TABLE IF NOT EXISTS `email_templates` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `name` VARCHAR(120) NOT NULL,
        `lang` VARCHAR(5) NOT NULL DEFAULT 'bg',
        `subject` TEXT NOT NULL DEFAULT '',
        `body` LONGTEXT NOT NULL DEFAULT '',
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_template_name_lang` (`name`, `lang`),
        KEY `idx_template_lang` (`lang`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // T52: User notification preferences
    $db->exec("CREATE TABLE IF NOT EXISTS `user_preferences` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `email` VARCHAR(255) NOT NULL,
        `prefs_json` JSON NOT NULL DEFAULT '{}',
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_user_prefs_email` (`email`),
        KEY `idx_user_prefs_email` (`email`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // T71: Failed login tracking
    $db->exec("CREATE TABLE IF NOT EXISTS `failed_logins` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `email` VARCHAR(255) NOT NULL,
        `ip_address` VARCHAR(45) NOT NULL DEFAULT '0.0.0.0',
        `user_agent` VARCHAR(500) NOT NULL DEFAULT '',
        `attempted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_fl_email` (`email`),
        KEY `idx_fl_ip` (`ip_address`),
        KEY `idx_fl_attempts` (`email`, `attempted_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // T72: Sessions table (if not exists — many installs have it)
    $db->exec("CREATE TABLE IF NOT EXISTS `sessions` (
        `id` VARCHAR(128) NOT NULL PRIMARY KEY,
        `user_email` VARCHAR(255) NOT NULL,
        `ip_address` VARCHAR(45) NOT NULL DEFAULT '0.0.0.0',
        `user_agent` VARCHAR(500) NOT NULL DEFAULT '',
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `last_active` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        `expires_at` TIMESTAMP NULL DEFAULT NULL,
        `is_admin` TINYINT(1) NOT NULL DEFAULT 0,
        `data` JSON NULL DEFAULT NULL,
        KEY `idx_sessions_email` (`user_email`),
        KEY `idx_sessions_active` (`user_email`, `expires_at`),
        KEY `idx_sessions_expires` (`expires_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // T139: Webhook registrations
    $db->exec("CREATE TABLE IF NOT EXISTS `webhooks` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `email` VARCHAR(255) NOT NULL,
        `url` VARCHAR(512) NOT NULL,
        `events_json` JSON NOT NULL DEFAULT '[]',
        `secret` VARCHAR(64) NOT NULL,
        `active` TINYINT(1) NOT NULL DEFAULT 1,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY `idx_webhooks_email` (`email`),
        KEY `idx_webhooks_active` (`active`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // T81: Migration history tracking
    $db->exec("CREATE TABLE IF NOT EXISTS `migration_history` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `version` VARCHAR(20) NOT NULL,
        `description` VARCHAR(500) NOT NULL DEFAULT '',
        `applied_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_migration_version` (`version`),
        KEY `idx_migration_applied` (`applied_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // T150: VEDA system prompts per project type
    $db->exec("CREATE TABLE IF NOT EXISTS `veda_prompts` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `project_type` VARCHAR(20) NOT NULL DEFAULT 'ФНИ',
        `mode` VARCHAR(30) NOT NULL DEFAULT 'improve',
        `system_prompt` LONGTEXT NOT NULL DEFAULT '',
        `is_default` TINYINT(1) NOT NULL DEFAULT 1,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_veda_prompt_type_mode` (`project_type`, `mode`),
        KEY `idx_veda_prompt_type` (`project_type`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Seed default prompts if table is empty
    $count = $db->query("SELECT COUNT(*) FROM `veda_prompts`")->fetchColumn();
    if ((int)$count === 0) {
        $seeds = [
            // improve mode — generic (all project types fall back to these)
            ['project_type' => 'ФНИ', 'mode' => 'improve',
             'system_prompt' => "You are VEDA, a senior research-administration assistant. Improve the user's proposal text: fix grammar, sharpen wording, keep the original language and meaning. Return ONLY the improved text."],
            ['project_type' => 'ПНИ', 'mode' => 'improve',
             'system_prompt' => "You are VEDA, a senior research-administration assistant. Improve the user's proposal text: fix grammar, sharpen wording, keep the original language and meaning. Return ONLY the improved text."],
            ['project_type' => 'ДНП', 'mode' => 'improve',
             'system_prompt' => "You are VEDA, a senior research-administration assistant. Improve the user's proposal text: fix grammar, sharpen wording, keep the original language and meaning. Return ONLY the improved text."],
            ['project_type' => 'НПФ', 'mode' => 'improve',
             'system_prompt' => "You are VEDA, a senior research-administration assistant. Improve the user's proposal text: fix grammar, sharpen wording, keep the original language and meaning. Return ONLY the improved text."],
            // draft mode — per project type
            ['project_type' => 'ФНИ', 'mode' => 'draft',
             'system_prompt' => "You are VEDA, a senior research-administration assistant for a Bulgarian university. Draft a clear, formal project-proposal section in Bulgarian based on the user's bullet points. Use academic register."],
            ['project_type' => 'ПНИ', 'mode' => 'draft',
             'system_prompt' => "You are VEDA, a senior research-administration assistant for a Bulgarian university. Draft a clear, formal project-proposal section in Bulgarian based on the user's bullet points. Emphasize applied research and industry collaboration. Use academic register."],
            ['project_type' => 'ДНП', 'mode' => 'draft',
             'system_prompt' => "You are VEDA, a senior research-administration assistant for a Bulgarian university. Draft a clear, formal project-proposal section in Bulgarian based on the user's bullet points. Emphasize interdisciplinary collaboration and societal impact. Use academic register."],
            ['project_type' => 'НПФ', 'mode' => 'draft',
             'system_prompt' => "You are VEDA, a senior research-administration assistant for a Bulgarian university. Draft a clear, formal project-proposal section in Bulgarian based on the user's bullet points. Emphasize student participation and educational outcomes. Use academic register."],
            // translate-bg mode — generic
            ['project_type' => 'ФНИ', 'mode' => 'translate-bg',
             'system_prompt' => "Translate the user's text into fluent Bulgarian (academic register). Preserve meaning exactly."],
            ['project_type' => 'ПНИ', 'mode' => 'translate-bg',
             'system_prompt' => "Translate the user's text into fluent Bulgarian (academic register). Preserve meaning exactly."],
            ['project_type' => 'ДНП', 'mode' => 'translate-bg',
             'system_prompt' => "Translate the user's text into fluent Bulgarian (academic register). Preserve meaning exactly."],
            ['project_type' => 'НПФ', 'mode' => 'translate-bg',
             'system_prompt' => "Translate the user's text into fluent Bulgarian (academic register). Preserve meaning exactly."],
        ];
        $stmt = $db->prepare("INSERT INTO `veda_prompts` (project_type, mode, system_prompt, is_default) VALUES (:pt, :mode, :sp, 1)");
        foreach ($seeds as $s) {
            $stmt->execute([':pt' => $s['project_type'], ':mode' => $s['mode'], ':sp' => $s['system_prompt']]);
        }
    }

    // T71: Login analytics — record every login attempt for pattern analysis
    $db->exec("CREATE TABLE IF NOT EXISTS `login_analytics` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `email` VARCHAR(255) NOT NULL,
        `ip_address` VARCHAR(45) NOT NULL DEFAULT '0.0.0.0',
        `user_agent` VARCHAR(500) NOT NULL DEFAULT '',
        `success` TINYINT(1) NOT NULL DEFAULT 0,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY `idx_la_email` (`email`),
        KEY `idx_la_ip` (`ip_address`),
        KEY `idx_la_created` (`created_at`),
        KEY `idx_la_email_success` (`email`, `success`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // T75: Account lockout — brute-force protection
    $db->exec("CREATE TABLE IF NOT EXISTS `account_lockouts` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `email` VARCHAR(255) NOT NULL,
        `ip_address` VARCHAR(45) NOT NULL DEFAULT '0.0.0.0',
        `locked_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `locked_until` TIMESTAMP NOT NULL,
        `reason` VARCHAR(255) NOT NULL DEFAULT '',
        `locked_by` VARCHAR(255) NOT NULL DEFAULT 'system',
        `is_active` TINYINT(1) NOT NULL DEFAULT 1,
        KEY `idx_al_email` (`email`),
        KEY `idx_al_ip` (`ip_address`),
        KEY `idx_al_active_until` (`is_active`, `locked_until`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // T73: MFA columns for admin_emails
    try {
        $db->exec("ALTER TABLE `admin_emails` ADD COLUMN `mfa_secret` VARCHAR(64) DEFAULT NULL");
    } catch (Throwable $e) { /* column may already exist */ }
    try {
        $db->exec("ALTER TABLE `admin_emails` ADD COLUMN `mfa_enabled` TINYINT(1) NOT NULL DEFAULT 0");
    } catch (Throwable $e) { /* column may already exist */ }

    // T73: MFA columns on admin_emails
    try {
        $cols = $db->query("SHOW COLUMNS FROM `admin_emails` LIKE 'mfa_secret'")->fetch();
        if (!$cols) {
            $db->exec("ALTER TABLE `admin_emails` ADD COLUMN `mfa_secret` VARCHAR(64) DEFAULT NULL");
        }
    } catch (Throwable $e) { /* ignore */ }
    try {
        $cols = $db->query("SHOW COLUMNS FROM `admin_emails` LIKE 'mfa_enabled'")->fetch();
        if (!$cols) {
            $db->exec("ALTER TABLE `admin_emails` ADD COLUMN `mfa_enabled` TINYINT(1) DEFAULT 0");
        }
    } catch (Throwable $e) { /* ignore */ }

    // ORCID + Scopus staff publications
    $db->exec("CREATE TABLE IF NOT EXISTS `staff_orcid` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `email` VARCHAR(255) NOT NULL,
        `orcid_id` VARCHAR(20) NOT NULL,
        `full_name` VARCHAR(255) DEFAULT NULL,
        `synced_at` TIMESTAMP NULL DEFAULT NULL,
        `work_count` INT DEFAULT 0,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `uk_staff_orcid_email` (`email`),
        UNIQUE KEY `uk_staff_orcid_id` (`orcid_id`),
        KEY `idx_staff_orcid_orcid` (`orcid_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // Record this migration
    try {
        $db->exec("INSERT IGNORE INTO `migration_history` (version, description) VALUES ('12.51.3', 'Add email_templates, user_preferences, failed_logins, sessions, webhooks, migration_history, veda_prompts, staff_orcid tables')");
    } catch (Throwable $e) { /* ignore */ }
}
