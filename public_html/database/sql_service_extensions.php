<?php
/**
 * SQL Service Layer extensions — T49/T52/T72/T80/T129/T139/T140 support
 * v12.51.3 additions: email_templates, user_preferences, webhooks tables
 * and supporting SQL functions.
 */

// ══════════════════════════════════════════════════════════════════════════════
// T49: Email notification templates — schema + query
// ══════════════════════════════════════════════════════════════════════════════

function _ensureEmailTemplatesTable(): void {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS email_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        lang VARCHAR(5) NOT NULL DEFAULT 'bg',
        subject TEXT NOT NULL DEFAULT '',
        body LONGTEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_template_name_lang (name, lang),
        KEY idx_template_lang (lang)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function sqlGetEmailTemplates(): array {
    try {
        _ensureEmailTemplatesTable();
        return dbFetchAll("SELECT id, name, lang, subject, body, created_at, updated_at FROM email_templates ORDER BY name, lang");
    } catch (Throwable $e) {
        logError('sqlGetEmailTemplates: ' . $e->getMessage());
        return [];
    }
}

function sqlSaveEmailTemplate(string $name, string $lang, string $subject, string $body, ?int $id = null): array {
    try {
        _ensureEmailTemplatesTable();
        if ($id) {
            dbQuery("UPDATE email_templates SET name=?, lang=?, subject=?, body=?, updated_at=NOW() WHERE id=?", [$name, $lang, $subject, $body, $id]);
            return dbFetchOne("SELECT id, name, lang, subject, body, created_at, updated_at FROM email_templates WHERE id=?", [$id]);
        }
        dbQuery("INSERT INTO email_templates (name, lang, subject, body, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())", [$name, $lang, $subject, $body]);
        $newId = (int)getDB()->lastInsertId();
        return dbFetchOne("SELECT id, name, lang, subject, body, created_at, updated_at FROM email_templates WHERE id=?", [$newId]);
    } catch (Throwable $e) {
        logError('sqlSaveEmailTemplate: ' . $e->getMessage());
        return [];
    }
}

function sqlDeleteEmailTemplate(int $id): bool {
    try {
        _ensureEmailTemplatesTable();
        dbQuery("DELETE FROM email_templates WHERE id=?", [$id]);
        return true;
    } catch (Throwable $e) {
        logError('sqlDeleteEmailTemplate: ' . $e->getMessage());
        return false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// T52: User notification preferences — schema + query
// ══════════════════════════════════════════════════════════════════════════════

function _ensureUserPreferencesTable(): void {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS user_preferences (
        email VARCHAR(255) NOT NULL PRIMARY KEY,
        prefs_json JSON NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function sqlGetUserPreferences(string $email): array {
    try {
        _ensureUserPreferencesTable();
        $p = dbFetchOne("SELECT prefs_json FROM user_preferences WHERE email=?", [$email]);
        return $p ? (json_decode($p['prefs_json'] ?? '{}', true) ?: []) : [];
    } catch (Throwable $e) {
        logError('sqlGetUserPreferences: ' . $e->getMessage());
        return [];
    }
}

function sqlSaveUserPreferences(string $email, array $prefs): bool {
    try {
        _ensureUserPreferencesTable();
        $json = json_encode($prefs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        dbQuery("INSERT INTO user_preferences (email, prefs_json, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE prefs_json=?, updated_at=NOW()", [$email, $json, $json]);
        return true;
    } catch (Throwable $e) {
        logError('sqlSaveUserPreferences: ' . $e->getMessage());
        return false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// T72: Session management — schema already exists (sessions table)
// ══════════════════════════════════════════════════════════════════════════════

function sqlGetUserSessions(string $email): array {
    try {
        $rows = dbFetchAll("SELECT id, ip_address, user_agent, created_at, last_active, expires_at FROM sessions WHERE user_email=? AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY last_active DESC", [$email]);
        $list = [];
        $curSid = session_id() ?: '';
        foreach ($rows as $r) {
            $age = time() - strtotime($r['created_at'] ?? '');
            $list[] = [
                'session_id' => $r['id'],
                'ip_address' => $r['ip_address'],
                'user_agent' => $r['user_agent'],
                'created_at' => $r['created_at'],
                'last_active' => $r['last_active'],
                'age_minutes' => round($age / 60),
                'current' => ($r['id'] === $curSid),
                'device' => _detectDevice($r['user_agent'] ?? '')
            ];
        }
        return $list;
    } catch (Throwable $e) {
        logError('sqlGetUserSessions: ' . $e->getMessage());
        return [];
    }
}

function sqlRevokeSession(string $email, string $sessionId): bool {
    try {
        $cur = session_id() ?: '';
        if ($sessionId === $cur) return false;
        dbQuery("DELETE FROM sessions WHERE id=? AND user_email=?", [$sessionId, $email]);
        return true;
    } catch (Throwable $e) {
        logError('sqlRevokeSession: ' . $e->getMessage());
        return false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// T139: Webhooks — schema + query
// ══════════════════════════════════════════════════════════════════════════════

function _ensureWebhooksTable(): void {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS webhooks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        url VARCHAR(512) NOT NULL,
        events_json JSON NOT NULL DEFAULT '[]',
        secret VARCHAR(64) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_webhook_email (email),
        KEY idx_webhook_active (active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function sqlGetWebhooks(string $email): array {
    try {
        _ensureWebhooksTable();
        $rows = dbFetchAll("SELECT id, url, events_json, active, created_at, updated_at FROM webhooks WHERE email=? ORDER BY created_at DESC", [$email]);
        $list = [];
        foreach ($rows as $r) {
            $list[] = [
                'webhook_id' => $r['id'],
                'url' => $r['url'],
                'events' => json_decode($r['events_json'] ?? '[]', true),
                'active' => (bool)$r['active'],
                'created_at' => $r['created_at'],
                'updated_at' => $r['updated_at']
            ];
        }
        return $list;
    } catch (Throwable $e) {
        logError('sqlGetWebhooks: ' . $e->getMessage());
        return [];
    }
}

function sqlSaveWebhook(string $email, string $url, array $events, string $secret): array {
    try {
        _ensureWebhooksTable();
        dbQuery("INSERT INTO webhooks (email, url, events_json, secret, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW()) ON DUPLICATE KEY UPDATE url=?, events_json=?, secret=?, active=1, updated_at=NOW()", [$email, $url, json_encode($events), $secret, $url, json_encode($events), $secret]);
        $id = (int)getDB()->lastInsertId();
        return ['webhook_id' => $id, 'url' => $url, 'events' => $events, 'secret' => $secret];
    } catch (Throwable $e) {
        logError('sqlSaveWebhook: ' . $e->getMessage());
        return [];
    }
}

function sqlDeleteWebhook(string $email, int $id): bool {
    try {
        _ensureWebhooksTable();
        dbQuery("DELETE FROM webhooks WHERE id=? AND email=?", [$id, $email]);
        return true;
    } catch (Throwable $e) {
        logError('sqlDeleteWebhook: ' . $e->getMessage());
        return false;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// T140: GraphQL helpers
// ══════════════════════════════════════════════════════════════════════════════

function _gqlExtractFields(string $query): array {
    $fields = [];
    if (preg_match_all('/([a-zA-Z_][a-zA-Z0-9_]*)\s*:/i', $query, $m)) {
        $fields = $m[1];
    }
    return $fields;
}

// ══════════════════════════════════════════════════════════════════════════════
// T113: English error message translations
// ══════════════════════════════════════════════════════════════════════════════

function _e(string $key, array $vars = []): string {
    // Returns English version of a Bulgarian error/key for i18n consistency
    static $enMap = [
        'Моля, въведете валиден имейл' => 'Please enter a valid email',
        'Имейлът вече е регистриран' => 'Email already registered',
        'Невалиден имейл' => 'Invalid email',
        'Грешка при връзката с базата данни' => 'Database connection error',
        'Неочаквана грешка' => 'Unexpected error',
        'Достъп забранен' => 'Access denied',
        'Невалидно токен' => 'Invalid token',
        'Срокът истече' => 'Session expiring',
        'Сесията истекла' => 'Session expired',
        'Трябва да влезете' => 'You must log in',
        'Файлът е прекалено голям' => 'File too large',
        'Невалиден формат на файл' => 'Invalid file format',
        'Заявката не е намерена' => 'Request not found',
        'Невалидни данни' => 'Invalid data',
        'Задължително поле' => 'Required field',
        'Успешно' => 'Success',
        'Грешка' => 'Error',
        'Изтрито' => 'Deleted',
        'Актуализирано' => 'Updated',
        'Създадено' => 'Created',
    ];
    $msg = $enMap[$key] ?? $key;
    if (!empty($vars)) {
        $msg = vsprintf($msg, $vars);
    }
    return $msg;
}
