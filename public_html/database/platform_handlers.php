<?php
/**
 * platform_handlers.php — EPIC-C Platform/API surface (T16, T17, T19, T20).
 *
 * Self-contained handlers, loaded by database/api.php via a guarded
 * require_once. No shared-file edits. Uses the same helpers as api.php
 * (getDB / dbQuery / dbFetchOne / dbFetchAll), so it must be required AFTER
 * those are defined (api.php requires it near the other *_handlers files).
 *
 * Conventions (mirror api.php):
 *   - every handler: function handleXxx(array $b): array
 *   - returns ['success'=>true, ...]; failures carry 'success'=>false + 'error'
 *   - idempotent CREATE TABLE IF NOT EXISTS for any new table
 *   - UI strings (if any) in Bulgarian
 */

if (!function_exists('ensurePlatformTables')) {
    function ensurePlatformTables(): void {
        try {
            $db = getDB();
            $db->exec("CREATE TABLE IF NOT EXISTS `webhook_deliveries` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `subscription_id` VARCHAR(191) NOT NULL DEFAULT '',
                `event` VARCHAR(80) NOT NULL DEFAULT '',
                `payload_hash` CHAR(64) NOT NULL DEFAULT '',
                `status` ENUM('pending','success','failed','dead') NOT NULL DEFAULT 'pending',
                `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
                `last_error` VARCHAR(512) NOT NULL DEFAULT '',
                `next_retry_at` INT UNSIGNED NOT NULL DEFAULT 0,
                `created_at` INT UNSIGNED NOT NULL DEFAULT 0,
                `updated_at` INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (`id`),
                KEY `idx_wd_status` (`status`,`next_retry_at`),
                KEY `idx_wd_sub` (`subscription_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            $db->exec("CREATE TABLE IF NOT EXISTS `api_keys` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `label` VARCHAR(120) NOT NULL DEFAULT '',
                `key_prefix` CHAR(8) NOT NULL DEFAULT '',
                `key_hash` CHAR(64) NOT NULL DEFAULT '',
                `scopes` VARCHAR(255) NOT NULL DEFAULT '',
                `owner_email` VARCHAR(191) NOT NULL DEFAULT '',
                `revoked` TINYINT(1) NOT NULL DEFAULT 0,
                `created_at` INT UNSIGNED NOT NULL DEFAULT 0,
                `last_used_at` INT UNSIGNED NOT NULL DEFAULT 0,
                `expires_at` INT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (`id`),
                KEY `idx_ak_owner` (`owner_email`),
                KEY `idx_ak_prefix` (`key_prefix`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (Throwable $e) { /* getDB() unavailable */ }
    }
}

// ── T22: password reset tokens table ─────────────────────────────────────────
// One-shot tokens for self-service password reset. Added here so the
// auth_handlers.php dependency is satisfied on every dispatch.
if (!function_exists('ensurePasswordResetTable')) {
    function ensurePasswordResetTable(): void {
        try {
            $db = getDB();
            $db->exec("CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `email` VARCHAR(255) NOT NULL,
                `token_hash` CHAR(64) NOT NULL,
                `used` TINYINT(1) NOT NULL DEFAULT 0,
                `expires_at` INT UNSIGNED NOT NULL DEFAULT 0,
                `created_at` INT UNSIGNED NOT NULL DEFAULT 0,
                `used_at` INT UNSIGNED NOT NULL DEFAULT 0,
                KEY `idx_prt_email` (`email`),
                KEY `idx_prt_hash` (`token_hash`),
                KEY `idx_prt_expires` (`expires_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (Throwable $e) { /* getDB() unavailable */ }
    }
}

// ── Shared helper functions used by api.php handlers ──────────────────────────
if (!function_exists('_hexToken')) {
    function _hexToken(int $length = 16): string {
        return bin2hex(random_bytes($length));
    }
}

if (!function_exists('err')) {
    function err(string $message): array {
        return ['success' => false, 'error' => $message];
    }
}

if (!function_exists('_getAuthEmail')) {
    function _getAuthEmail(array $b): string {
        $email = '';
        foreach (['email', 'userEmail', 'userId', 'ownerEmail'] as $k) {
            if (!empty($b[$k]) && is_string($b[$k])) { $email = strtolower(trim($b[$k])); break; }
        }
        return $email;
    }
}

if (!function_exists('_isAdmin')) {
    function _isAdmin(string $email): bool {
        if ($email === '') return false;
        if (function_exists('isAdminUser')) return isAdminUser($email);
        return false;
    }
}

// ── T19: rate-limit response headers (X-RateLimit*) ──────────────────────
// Companion to api.php's rateLimitCheck(). Returns the header map so the
// integrator can emit it from the dispatcher without touching rateLimitCheck()
// internals. Call AFTER rateLimitCheck() has recorded the hit.
if (!function_exists('rateLimitHeaders')) {
    function rateLimitHeaders(string $action): array {
        $limit = 120;
        $window = 60;
        try {
            $ip = $_SERVER["REMOTE_ADDR"] ?? "0.0.0.0";
            if (!empty($_SERVER["HTTP_X_FORWARDED_FOR"])) {
                $fwd = explode(",", $_SERVER["HTTP_X_FORWARDED_FOR"]);
                $ip = trim($fwd[0]);
            }
            $bucket = "rl:" . $ip . ":" . $action;
            $now = time();
            $row = dbFetchOne("SELECT hits, window_start FROM rate_limits WHERE bucket=?", [$bucket]);
            $remaining = $limit;
            $reset = $now + $window;
            if ($row) {
                $elapsed = $now - (int)$row["window_start"];
                $remaining = max(0, $limit - (int)$row["hits"]);
                $reset = (int)$row["window_start"] + $window;
                if ($elapsed >= $window) { $remaining = $limit; $reset = $now + $window; }
            }
            return [
                "X-RateLimit-Limit"     => (string)$limit,
                "X-RateLimit-Remaining" => (string)$remaining,
                "X-RateLimit-Reset"     => (string)$reset,
            ];
        } catch (Throwable $e) {
            return [];
        }
    }
}

// ── T17: webhook delivery log + history endpoint ──────────────────────────
if (!function_exists('handleGetWebhookDeliveries')) {
    function handleGetWebhookDeliveries(array $b): array {
        ensurePlatformTables();
        $sub = trim((string)($b['subscriptionId'] ?? ''));
        $status = trim((string)($b['status'] ?? ''));
        $limit = min(200, max(1, (int)($b['limit'] ?? 50)));
        $where = [];
        $params = [];
        if ($sub !== '') { $where[] = "subscription_id = ?"; $params[] = $sub; }
        if ($status !== '' && in_array($status, ['pending','success','failed','dead'], true)) {
            $where[] = "status = ?"; $params[] = $status;
        }
        $sql = "SELECT id, subscription_id, event, status, attempts, last_error, created_at, updated_at
                FROM webhook_deliveries";
        if ($where) $sql .= " WHERE " . implode(" AND ", $where);
        $sql .= " ORDER BY id DESC LIMIT ?";
        $params[] = $limit;
        $rows = dbFetchAll($sql, $params);
        return ['success' => true, 'deliveries' => $rows, 'count' => count($rows)];
    }
}

// ── T16: dispatch a webhook with exponential backoff retry ────────────────
// Records each attempt in webhook_deliveries; retries up to $maxAttempts with
// exponential backoff (base 2s). Fails open: if HTTP is unavailable, logs the
// attempt and returns a recorded-pending result rather than throwing.
if (!function_exists('handleDispatchWebhook')) {
    function handleDispatchWebhook(array $b): array {
        ensurePlatformTables();
        $sub = trim((string)($b['subscriptionId'] ?? $b['url'] ?? ''));
        $event = trim((string)($b['event'] ?? 'generic'));
        $payload = $b['payload'] ?? [];
        if ($sub === '') return ['success' => false, 'error' => 'missing subscriptionId/url'];
        $payloadJson = json_encode($payload);
        $hash = hash('sha256', $payloadJson);

        $maxAttempts = (int)($b['maxAttempts'] ?? 5);
        $maxAttempts = min(8, max(1, $maxAttempts));
        $baseDelay = 2;

        $db = getDB();
        dbQuery("INSERT INTO webhook_deliveries
            (subscription_id, event, payload_hash, status, attempts, created_at, updated_at)
            VALUES (?,?,?, 'pending', 0, ?, ?)",
            [$sub, $event, $hash, time(), time()]);
        $deliveryId = $db->lastInsertId();

        $lastError = '';
        $status = 'pending';
        for ($attempt = 1; $attempt <= $maxAttempts; $attempt++) {
            try {
                $ctx = stream_context_create(['http' => [
                    'method'  => 'POST',
                    'header'  => "Content-Type: application/json\r\n",
                    'content' => $payloadJson,
                    'timeout' => 10,
                    'ignore_errors' => true,
                ]]);
                $resp = @file_get_contents($sub, false, $ctx);
                if ($resp !== false) {
                    $status = 'success';
                    dbQuery("UPDATE webhook_deliveries SET status='success', attempts=?, updated_at=? WHERE id=?",
                        [$attempt, time(), $deliveryId]);
                    return ['success' => true, 'deliveryId' => $deliveryId, 'attempts' => $attempt, 'status' => 'success'];
                }
                $lastError = 'empty response';
            } catch (Throwable $e) {
                $lastError = $e->getMessage();
            }
            // exponential backoff before next attempt (skip sleep on final)
            if ($attempt < $maxAttempts) {
                $delay = $baseDelay * (2 ** ($attempt - 1));
                $next = time() + $delay;
                dbQuery("UPDATE webhook_deliveries SET attempts=?, last_error=?, next_retry_at=?, updated_at=? WHERE id=?",
                    [$attempt, $lastError, $next, time(), $deliveryId]);
                usleep(min(2000000, $delay * 1000000));
            }
        }
        $status = ($attempt = $maxAttempts && $lastError !== '') ? 'failed' : 'failed';
        dbQuery("UPDATE webhook_deliveries SET status='failed', attempts=?, last_error=?, updated_at=? WHERE id=?",
            [$maxAttempts, $lastError, time(), $deliveryId]);
        return ['success' => false, 'deliveryId' => $deliveryId, 'attempts' => $maxAttempts, 'status' => 'failed', 'error' => $lastError];
    }
}

// ── T20: scoped API-key management for service accounts ───────────────────
// Never returns the plaintext key after creation. Stores only a prefix (for
// display) + sha256 hash (for verification).
if (!function_exists('handleCreateApiKey')) {
    function handleCreateApiKey(array $b): array {
        ensurePlatformTables();
        $label = trim((string)($b['label'] ?? ''));
        $owner = trim((string)($b['ownerEmail'] ?? $b['email'] ?? ''));
        $scopes = trim((string)($b['scopes'] ?? 'read'));
        if ($label === '' || $owner === '') return ['success' => false, 'error' => 'missing label/ownerEmail'];
        // authorization: only admins may mint keys (reuse existing isAdminUser)
        if (!function_exists('isAdminUser') || !isAdminUser($owner)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        $raw = 'uev_' . bin2hex(random_bytes(24));
        $prefix = substr($raw, 0, 8);
        $hash = hash('sha256', $raw);
        $expires = !empty($b['expiresAt']) ? (int)$b['expiresAt'] : 0;
        $db = getDB();
        dbQuery("INSERT INTO api_keys (label, key_prefix, key_hash, scopes, owner_email, created_at, expires_at)
            VALUES (?,?,?,?,?,?,?)",
            [$label, $prefix, $hash, $scopes, $owner, time(), $expires]);
        // ONLY time the plaintext is returned — caller must store it now.
        return ['success' => true, 'key' => $raw, 'prefix' => $prefix, 'scopes' => $scopes, 'expiresAt' => $expires];
    }
}

if (!function_exists('handleListApiKeys')) {
    function handleListApiKeys(array $b): array {
        ensurePlatformTables();
        $owner = trim((string)($b['ownerEmail'] ?? $b['email'] ?? ''));
        if ($owner === '') return ['success' => false, 'error' => 'missing ownerEmail'];
        $rows = dbFetchAll("SELECT id, label, key_prefix, scopes, owner_email, revoked, created_at, last_used_at, expires_at
                            FROM api_keys WHERE owner_email=? ORDER BY id DESC", [$owner]);
        return ['success' => true, 'keys' => $rows];
    }
}

if (!function_exists('handleRevokeApiKey')) {
    function handleRevokeApiKey(array $b): array {
        ensurePlatformTables();
        $id = (int)($b['id'] ?? 0);
        $owner = trim((string)($b['ownerEmail'] ?? $b['email'] ?? ''));
        if ($id < 1) return ['success' => false, 'error' => 'missing id'];
        $db = getDB();
        dbQuery("UPDATE api_keys SET revoked=1, updated_at=? WHERE id=? AND owner_email=?", [time(), $id, $owner]);
        return ['success' => true, 'revoked' => $id];
    }
}

// ── T20: API key rotation (revoke + mint in one atom) ────────────────────────
// Revokes the old key and returns a freshly minted plaintext. Caller must store
// the new plaintext immediately — it is never returned again.
if (!function_exists('handleRotateApiKey')) {
    function handleRotateApiKey(array $b): array {
        ensurePlatformTables();
        $id = (int)($b['id'] ?? 0);
        $owner = trim((string)($b['ownerEmail'] ?? $b['email'] ?? ''));
        if ($id < 1) return ['success' => false, 'error' => 'missing id'];
        if ($owner === '') return ['success' => false, 'error' => 'missing ownerEmail'];
        if (!function_exists('isAdminUser') || !isAdminUser($owner)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        $db = getDB();
        $existing = dbFetchOne("SELECT id, label, scopes, revoked, expires_at FROM api_keys WHERE id=? AND owner_email=?", [$id, $owner]);
        if (!$existing) return ['success' => false, 'error' => 'key_not_found'];
        // Revoke the old one.
        dbQuery("UPDATE api_keys SET revoked=1, updated_at=? WHERE id=?", [time(), $id]);
        // Mint a fresh key with the same label + scopes, linked to this owner.
        $raw = 'uev_' . bin2hex(random_bytes(24));
        $prefix = substr($raw, 0, 8);
        $hash = hash('sha256', $raw);
        $expires = !empty($b['expiresAt']) ? (int)$b['expiresAt'] : ($existing['expires_at'] ?: 0);
        dbQuery("INSERT INTO api_keys (label, key_prefix, key_hash, scopes, owner_email, created_at, expires_at)
            VALUES (?,?,?,?,?, UNIX_TIMESTAMP(), ?)",
            [$existing['label'], $prefix, $hash, $existing['scopes'], $owner, $expires]);
        return ['success' => true,
            'oldId' => $id,
            'key' => $raw,
            'prefix' => $prefix,
            'scopes' => $existing['scopes'],
            'expiresAt' => $expires];
    }
}
