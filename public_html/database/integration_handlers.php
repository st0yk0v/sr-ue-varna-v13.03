<?php
/**
 * integration_handlers.php — EPIC-G Integration & External System Connectors (T119, T120).
 *
 * Self-contained handlers, loaded by database/api.php via a guarded
 * require_once. No shared-file edits. Uses the same helpers as api.php
 * (getDB / dbQuery / dbFetchOne / dbFetchAll).
 *
 * T119 — Export Integration: push data to external systems (REST webhook,
 *         CSV drop, JSON sync) with stored endpoint config.
 * T120 — Calendar Integration: create / list / delete calendar events
 *         synced with project milestones and competition deadlines.
 *
 * Conventions (mirror api.php):
 *   - every handler: function handleXxx(array $b): array
 *   - returns ['success'=>true, ...]; failures carry 'success'=>false + 'error'
 *   - idempotent CREATE TABLE IF NOT EXISTS for any new table
 *   - UI strings in Bulgarian
 */

if (!function_exists('ensureIntegrationTables')) {
    function ensureIntegrationTables(): void {
        try {
            $db = getDB();
            $db->exec("CREATE TABLE IF NOT EXISTS `integration_endpoints` (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `label` VARCHAR(191) NOT NULL DEFAULT '',
                `url` VARCHAR(512) NOT NULL DEFAULT '',
                `auth_token` VARCHAR(512) NOT NULL DEFAULT '',
                `kind` ENUM('webhook','csv_drop','json_sync') NOT NULL DEFAULT 'webhook',
                `active` TINYINT(1) NOT NULL DEFAULT 1,
                `owner_email` VARCHAR(191) NOT NULL DEFAULT '',
                `created_at` DATETIME NULL,
                PRIMARY KEY (`id`),
                KEY `idx_ie_owner` (`owner_email`),
                KEY `idx_ie_active` (`active`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $db->exec("CREATE TABLE IF NOT EXISTS `integration_export_log` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `endpoint_id` INT UNSIGNED NOT NULL DEFAULT 0,
                `action` VARCHAR(80) NOT NULL DEFAULT '',
                `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
                `http_code` INT NOT NULL DEFAULT 0,
                `message` VARCHAR(512) NOT NULL DEFAULT '',
                `payload_size` INT UNSIGNED NOT NULL DEFAULT 0,
                `created_at` DATETIME NULL,
                PRIMARY KEY (`id`),
                KEY `idx_iel_endpoint` (`endpoint_id`),
                KEY `iel_created` (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $db->exec("CREATE TABLE IF NOT EXISTS `calendar_events` (
                `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
                `uid` VARCHAR(191) NOT NULL DEFAULT '',
                `title` VARCHAR(255) NOT NULL DEFAULT '',
                `description` TEXT NULL,
                `start_dt` DATETIME NOT NULL,
                `end_dt` DATETIME NULL,
                `all_day` TINYINT(1) NOT NULL DEFAULT 0,
                `source` ENUM('manual','project','competition') NOT NULL DEFAULT 'manual',
                `source_id` VARCHAR(64) NOT NULL DEFAULT '',
                `provider` ENUM('local','google','outlook') NOT NULL DEFAULT 'local',
                `provider_event_id` VARCHAR(255) NOT NULL DEFAULT '',
                `owner_email` VARCHAR(191) NOT NULL DEFAULT '',
                `created_at` DATETIME NULL,
                `updated_at` DATETIME NULL,
                PRIMARY KEY (`id`),
                UNIQUE KEY `uidx_ce_uid` (`uid`),
                KEY `idx_ce_owner` (`owner_email`),
                KEY `idx_ce_range` (`start_dt`,`end_dt`),
                KEY `idx_ce_source` (`source`,`source_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (Throwable $e) { /* getDB() unavailable */ }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// T119 — EXPORT INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

if (!function_exists('handleListIntegrationEndpoints')) {
    function handleListIntegrationEndpoints(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        ensureIntegrationTables();
        try {
            $rows = dbFetchAll("SELECT id, label, url, kind, active, owner_email, created_at
                                FROM integration_endpoints ORDER BY id DESC LIMIT 100");
            foreach ($rows as &$r) {
                $r['has_auth'] = !empty($r['auth_token']);
                unset($r['auth_token']);
            }
            return ['success' => true, 'endpoints' => $rows];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

if (!function_exists('handleSaveIntegrationEndpoint')) {
    function handleSaveIntegrationEndpoint(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        $id = (int)($b['id'] ?? 0);
        $label = trim($b['label'] ?? '');
        $url = trim($b['url'] ?? '');
        $authToken = trim($b['authToken'] ?? '');
        $kind = in_array($b['kind'] ?? '', ['webhook','csv_drop','json_sync']) ? $b['kind'] : 'webhook';
        $active = !empty($b['active']) ? 1 : 0;
        if ($label === '' || $url === '') {
            return ['success' => false, 'error' => 'label and url required'];
        }
        ensureIntegrationTables();
        try {
            $db = getDB();
            if ($id > 0) {
                if ($authToken !== '' && $authToken !== '***') {
                    dbQuery("UPDATE integration_endpoints SET label=?, url=?, auth_token=?, kind=?, active=? WHERE id=?",
                        [$label, $url, $authToken, $kind, $active, $id]);
                } else {
                    dbQuery("UPDATE integration_endpoints SET label=?, url=?, kind=?, active=? WHERE id=?",
                        [$label, $url, $kind, $active, $id]);
                }
                return ['success' => true, 'id' => $id];
            } else {
                dbQuery("INSERT INTO integration_endpoints (label, url, auth_token, kind, active, owner_email, created_at)
                         VALUES (?,?,?,?,?,?,NOW())",
                    [$label, $url, $authToken, $kind, $active, $email]);
                return ['success' => true, 'id' => (int)$db->lastInsertId()];
            }
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

if (!function_exists('handleDeleteIntegrationEndpoint')) {
    function handleDeleteIntegrationEndpoint(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        $id = (int)($b['id'] ?? 0);
        if ($id <= 0) return ['success' => false, 'error' => 'invalid id'];
        ensureIntegrationTables();
        try {
            dbQuery("DELETE FROM integration_endpoints WHERE id=?", [$id]);
            return ['success' => true, 'deleted' => $id];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

if (!function_exists('handlePushToExternal')) {
    function handlePushToExternal(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        $endpointId = (int)($b['endpointId'] ?? 0);
        $table = preg_replace('/[^a-z0-9_]/', '', strtolower($b['table'] ?? 'applications'));
        if ($endpointId <= 0) return ['success' => false, 'error' => 'endpointId required'];
        ensureIntegrationTables();
        try {
            $ep = dbFetchOne("SELECT * FROM integration_endpoints WHERE id=? AND active=1", [$endpointId]);
            if (!$ep) return ['success' => false, 'error' => 'endpoint not found or inactive'];

            $allowedTables = ['applications','competitions','projects','documents'];
            if (!in_array($table, $allowedTables)) {
                return ['success' => false, 'error' => 'table not allowed'];
            }
            $rows = dbFetchAll("SELECT * FROM `$table` ORDER BY id DESC LIMIT 500");
            $payload = json_encode(['table' => $table, 'rows' => $rows, 'exported_at' => date('c')], JSON_UNESCAPED_UNICODE);

            $ch = curl_init($ep['url']);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            $headers = ['Content-Type: application/json; charset=utf-8'];
            if (!empty($ep['auth_token'])) {
                $headers[] = 'Authorization: Bearer ' . $ep['auth_token'];
            }
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            $resp = curl_exec($ch);
            $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            $status = ($httpCode >= 200 && $httpCode < 300) ? 'success' : 'failed';
            $msg = $curlErr ?: "HTTP $httpCode";
            dbQuery("INSERT INTO integration_export_log (endpoint_id, action, status, http_code, message, payload_size, created_at)
                     VALUES (?,?,?,?,?,?,NOW())",
                [$endpointId, "push_$table", $status, $httpCode, $msg, strlen($payload)]);

            return ['success' => $status === 'success', 'httpCode' => $httpCode, 'message' => $msg];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

if (!function_exists('handleListExportLog')) {
    function handleListExportLog(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        ensureIntegrationTables();
        try {
            $rows = dbFetchAll("SELECT * FROM integration_export_log ORDER BY id DESC LIMIT 50");
            return ['success' => true, 'log' => $rows];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// T120 — CALENDAR INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

if (!function_exists('handleListCalendarEvents')) {
    function handleListCalendarEvents(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'email required'];
        $start = $b['start'] ?? date('Y-m-d\TH:i:s', strtotime('-30 days'));
        $end = $b['end'] ?? date('Y-m-d\TH:i:s', strtotime('+90 days'));
        ensureIntegrationTables();
        try {
            $rows = dbFetchAll("SELECT id, uid, title, description, start_dt, end_dt, all_day,
                                       source, source_id, provider, provider_event_id, owner_email
                                FROM calendar_events
                                WHERE owner_email = ? AND start_dt BETWEEN ? AND ?
                                ORDER BY start_dt ASC LIMIT 500",
                [$email, $start, $end]);
            return ['success' => true, 'events' => $rows];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

if (!function_exists('handleCreateCalendarEvent')) {
    function handleCreateCalendarEvent(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'email required'];
        $title = trim($b['title'] ?? '');
        $startDt = $b['startDt'] ?? $b['start_dt'] ?? '';
        if ($title === '' || $startDt === '') {
            return ['success' => false, 'error' => 'title and startDt required'];
        }
        $uid = 'uev-cal-' . bin2hex(random_bytes(8));
        $endDt = $b['endDt'] ?? $b['end_dt'] ?? null;
        $allDay = !empty($b['allDay']) ? 1 : 0;
        $description = $b['description'] ?? null;
        $source = in_array($b['source'] ?? '', ['manual','project','competition']) ? $b['source'] : 'manual';
        $sourceId = (string)($b['sourceId'] ?? '');
        $provider = in_array($b['provider'] ?? '', ['local','google','outlook']) ? $b['provider'] : 'local';
        $providerEventId = (string)($b['providerEventId'] ?? '');

        ensureIntegrationTables();
        try {
            $db = getDB();
            dbQuery("INSERT INTO calendar_events
                     (uid, title, description, start_dt, end_dt, all_day, source, source_id, provider, provider_event_id, owner_email, created_at, updated_at)
                     VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())",
                [$uid, $title, $description, $startDt, $endDt, $allDay, $source, $sourceId, $provider, $providerEventId, $email]);
            return ['success' => true, 'id' => (int)$db->lastInsertId(), 'uid' => $uid];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

if (!function_exists('handleUpdateCalendarEvent')) {
    function handleUpdateCalendarEvent(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'email required'];
        $id = (int)($b['id'] ?? 0);
        if ($id <= 0) return ['success' => false, 'error' => 'id required'];
        ensureIntegrationTables();
        try {
            $ev = dbFetchOne("SELECT id FROM calendar_events WHERE id=? AND owner_email=?", [$id, $email]);
            if (!$ev) return ['success' => false, 'error' => 'not_found_or_forbidden'];

            $fields = [];
            $params = [];
            foreach (['title','description','start_dt','end_dt','provider_event_id'] as $f) {
                if (isset($b[$f])) { $fields[] = "$f=?"; $params[] = $b[$f]; }
            }
            if (isset($b['allDay'])) { $fields[] = "all_day=?"; $params[] = $b['allDay'] ? 1 : 0; }
            if (empty($fields)) return ['success' => false, 'error' => 'nothing to update'];
            $fields[] = "updated_at=NOW()";
            $params[] = $id;
            $params[] = $email;
            dbQuery("UPDATE calendar_events SET " . implode(',', $fields) . " WHERE id=? AND owner_email=?", $params);
            return ['success' => true, 'id' => $id];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

if (!function_exists('handleDeleteCalendarEvent')) {
    function handleDeleteCalendarEvent(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'email required'];
        $id = (int)($b['id'] ?? 0);
        if ($id <= 0) return ['success' => false, 'error' => 'id required'];
        ensureIntegrationTables();
        try {
            dbQuery("DELETE FROM calendar_events WHERE id=? AND owner_email=?", [$id, $email]);
            return ['success' => true, 'deleted' => $id];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

if (!function_exists('handleSyncCalendarFromProjects')) {
    function handleSyncCalendarFromProjects(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'email required'];
        ensureIntegrationTables();
        try {
            $synced = 0;
            $comps = dbFetchAll("SELECT id, title, deadline FROM competitions WHERE deadline IS NOT NULL AND deadline != '' LIMIT 200");
            foreach ($comps as $c) {
                $uid = 'uev-comp-' . $c['id'];
                $existing = dbFetchOne("SELECT id FROM calendar_events WHERE uid=?", [$uid]);
                if (!$existing) {
                    dbQuery("INSERT INTO calendar_events
                             (uid, title, description, start_dt, all_day, source, source_id, owner_email, created_at, updated_at)
                             VALUES (?,?,?,?,1,'competition',?,?,NOW(),NOW())",
                        [$uid, 'Краен срок: ' . $c['title'], 'Конкурс: ' . $c['title'], $c['deadline'], (string)$c['id'], $email]);
                    $synced++;
                }
            }
            return ['success' => true, 'synced' => $synced];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
