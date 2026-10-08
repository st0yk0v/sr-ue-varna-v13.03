<?php
/**
 * auth_handlers.php — T22 password reset + T23 session history.
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
 *   - UI strings in Bulgarian
 */

// ── T23: session history for security audit ─────────────────────────────────
// Returns the caller's active+recent sessions (24h window) for review/revocation.
if (!function_exists('handleGetSessionHistory')) {
    function handleGetSessionHistory(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        try {
            $rows = dbFetchAll(
                "SELECT id, user_email, user_name, role, is_admin, ip_address, user_agent,
                        created_at, last_active, expires_at
                 FROM sessions
                 WHERE user_email = ?
                 ORDER BY last_active DESC, created_at DESC
                 LIMIT 100",
                [$email]);
            $items = array_map(function ($r) {
                $ts = strtotime($r['last_active'] ?? $r['created_at'] ?? '');
                $age = $ts ? (time() - $ts) : 0;
                return [
                    'id'          => substr($r['id'], 0, 12) . '…',
                    'ip'          => $r['ip_address'] ?? '',
                    'userAgent'   => $r['user_agent'] ?? '',
                    'createdAt'   => $r['created_at'] ?? '',
                    'lastActive'  => $r['last_active'] ?? '',
                    'expiresAt'   => $r['expires_at'] ?? '',
                    'isCurrent'   => !empty($r['id']) && $r['role'] !== null,
                    'age'         => $age > 0 ? $age : 0,
                    'ageLabel'    => $age < 60          ? ' няколко секунди назад'
                                    : ($age < 3600       ? round($age / 60)    . ' мин след казане'
                                    : ($age < 86400      ? round($age / 3600)  . ' часа след казане'
                                    : round($age / 86400) . ' дни след казане')),
                ];
            }, $rows);
            return ['success' => true, 'sessions' => $items, 'count' => count($items)];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T22: password reset / admin password management ──────────────────────────
// T22a: self-service password-reset REQUEST (send reset token via email).
//        Requires the user's email; emits a one-shot reset link path (no email
//        sending here — the client/handler that calls this is responsible for
//        delivery, e.g. GAS or a queued email). Returns the token hash for the
//        caller to store in the reset_tokens table.
if (!function_exists('handleRequestPasswordReset')) {
    function handleRequestPasswordReset(array $b): array {
        $email = strtolower(trim($b['email'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        try {
            $db = getDB();
            $token = bin2hex(random_bytes(32));
            $hash  = hash('sha256', $token);
            $now   = time();
            // Invalidate any prior unclaimed token for this email, then insert fresh.
            dbQuery("DELETE FROM password_reset_tokens WHERE email = ? AND used = 0", [$email]);
            dbQuery("INSERT INTO password_reset_tokens (email, token_hash, expires_at, created_at)
                     VALUES (?, ?, ?, ?)",
                [$email, $hash, $now + 900, $now]);  // 15-min window
            // Return the raw token ONLY to the caller (who delivers it, e.g. via email).
            return ['success' => true, 'resetToken' => $token, 'resetTokenHash' => $hash,
                    'expiresIn' => 900, 'email' => $email];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T22b: consume a reset token + set a new password (admin self-service).
// The caller supplies the token *verbatim* (the one from handleRequestPasswordReset)
// plus the new password. We match the hash, enforce expiry, then clear the token.
if (!function_exists('handleResetPassword')) {
    function handleResetPassword(array $b): array {
        $token    = trim($b['resetToken'] ?? '');
        $newPw    = $b['newPassword'] ?? '';
        $owner    = trim((string)($b['ownerEmail'] ?? $b['email'] ?? ''));
        if ($token === '')  return ['success' => false, 'error' => 'missing resetToken'];
        if ($newPw   === '') return ['success' => false, 'error' => 'missing newPassword'];
        if ($owner === '')  return ['success' => false, 'error' => 'missing ownerEmail'];
        if (!function_exists('isAdminUser') || !isAdminUser($owner)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        if (strlen($newPw) < 8) return ['success' => false, 'error' => 'Password must be at least 8 characters'];
        $tokenHash = hash('sha256', $token);
        try {
            $db = getDB();
            $row = dbFetchOne(
                "SELECT id, email, expires_at FROM password_reset_tokens
                 WHERE token_hash = ? AND email = ? AND used = 0
                 AND expires_at > ?",
                [$tokenHash, $owner, time()]);
            if (!$row) return ['success' => false, 'error' => 'Invalid or expired reset token'];
            // Mark token used (one-shot).
            dbQuery("UPDATE password_reset_tokens SET used = 1, used_at = ? WHERE id = ?", [time(), $row['id']]);
            // Update admin_emails password (bcrypt — MD5 was weak; no verification path used it, hardened regardless).
            dbQuery("UPDATE admin_emails SET password_hash = ?, updated_at = ? WHERE email = ?",
                [password_hash($newPw, PASSWORD_DEFAULT), time(), $owner]);
            return ['success' => true, 'email' => $owner, 'rotated' => true];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T71: Login Analytics ─────────────────────────────────────────────────────
// Record a login attempt (success or failure) for pattern analysis.
if (!function_exists('handleRecordLoginAttempt')) {
    function handleRecordLoginAttempt(array $b): array {
        $email = strtolower(trim($b['email'] ?? ''));
        $ip    = trim($b['ipAddress'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        $ua    = substr(trim($b['userAgent'] ?? $_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500);
        $ok    = !empty($b['success']) ? 1 : 0;
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        try {
            $db = getDB();
            dbQuery("INSERT INTO login_analytics (email, ip_address, user_agent, success) VALUES (?, ?, ?, ?)",
                [$email, $ip, $ua, $ok]);
            return ['success' => true, 'recorded' => true];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T71b: Get login analytics — failed attempts per hour, top IPs, suspicious activity.
if (!function_exists('handleGetLoginAnalytics')) {
    function handleGetLoginAnalytics(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            $db = getDB();
            $since = date('Y-m-d H:i:s', time() - 86400); // 24h window
            // Failed attempts per hour (SQLite-compatible: strftime instead of HOUR)
            $hourly = dbFetchAll(
                "SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hr, COUNT(*) AS cnt
                 FROM login_analytics
                 WHERE success = 0 AND created_at >= ?
                 GROUP BY strftime('%H', created_at) ORDER BY hr",
                [$since]);
            // Top IPs by failed attempts
            $topIps = dbFetchAll(
                "SELECT ip_address, COUNT(*) AS fails
                 FROM login_analytics
                 WHERE success = 0 AND created_at >= ?
                 GROUP BY ip_address ORDER BY fails DESC LIMIT 10",
                [$since]);
            // Suspicious: IPs with > 10 fails in 24h
            $suspicious = dbFetchAll(
                "SELECT ip_address, COUNT(*) AS fails, MIN(created_at) AS first_attempt
                 FROM login_analytics
                 WHERE success = 0 AND created_at >= ?
                 GROUP BY ip_address HAVING fails > 10 ORDER BY fails DESC",
                [$since]);
            // Total stats
            $totalFails = dbFetchOne("SELECT COUNT(*) AS n FROM login_analytics WHERE success = 0 AND created_at >= ?", [$since]);
            $totalOk    = dbFetchOne("SELECT COUNT(*) AS n FROM login_analytics WHERE success = 1 AND created_at >= ?", [$since]);
            return [
                'success'      => true,
                'hourly'       => $hourly,
                'topIps'       => $topIps,
                'suspicious'   => $suspicious,
                'totalFails'   => (int)($totalFails['n'] ?? 0),
                'totalSuccess' => (int)($totalOk['n'] ?? 0),
                'window'       => '24h',
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T72: Session Management ──────────────────────────────────────────────────
// List all active sessions for the caller (admin view).
if (!function_exists('handleGetSessionList')) {
    function handleGetSessionList(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        try {
            $rows = dbFetchAll(
                "SELECT id, user_email, ip_address, user_agent, created_at, last_active, expires_at, is_admin
                 FROM sessions
                 WHERE user_email = ? AND (expires_at IS NULL OR expires_at > NOW())
                 ORDER BY last_active DESC LIMIT 50",
                [$email]);
            $sessions = array_map(function ($r) {
                return [
                    'id'         => $r['id'],
                    'ip'         => $r['ip_address'] ?? '',
                    'userAgent'  => $r['user_agent'] ?? '',
                    'createdAt'  => $r['created_at'] ?? '',
                    'lastActive' => $r['last_active'] ?? '',
                    'expiresAt'  => $r['expires_at'] ?? '',
                    'isAdmin'    => (int)($r['is_admin'] ?? 0),
                ];
            }, $rows);
            return ['success' => true, 'sessions' => $sessions, 'count' => count($sessions)];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T72b: Revoke a specific session by id.
if (!function_exists('handleRevokeSession')) {
    function handleRevokeSession(array $b): array {
        $email    = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        $sid      = trim($b['sessionId'] ?? '');
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        if ($sid === '')   return ['success' => false, 'error' => 'missing sessionId'];
        try {
            $db = getDB();
            // Only revoke own sessions (or admin can revoke any).
            $where  = "id = ? AND user_email = ?";
            $params = [$sid, $email];
            if (function_exists('isAdminUser') && isAdminUser($email)) {
                $where = "id = ?"; // admin can revoke any session
                $params = [$sid];
            }
            dbQuery("DELETE FROM sessions WHERE $where", $params);
            return ['success' => true, 'revoked' => true, 'sessionId' => $sid];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T73: MFA Setup ───────────────────────────────────────────────────────────
// Generate a TOTP secret for the user. Returns secret + otpauth URI for QR.
if (!function_exists('handleSetupMfa')) {
    function handleSetupMfa(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            // Generate base32 secret (160-bit = 32 chars base32)
            $base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
            $secret = '';
            for ($i = 0; $i < 32; $i++) {
                $secret .= $base32[random_int(0, 31)];
            }
            // Store secret (not yet enabled — pending verification)
            dbQuery("UPDATE admin_emails SET mfa_secret = ? WHERE email = ?", [$secret, $email]);
            $uri = "otpauth://totp/UEV-ERP:" . urlencode($email)
                 . "?secret=" . $secret . "&issuer=UEV-ERP&algorithm=SHA1&digits=6&period=30";
            return ['success' => true, 'secret' => $secret, 'otpauthUri' => $uri, 'email' => $email];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T73b: Verify a TOTP code and enable MFA.
if (!function_exists('handleVerifyMfaSetup')) {
    function _totpVerify(string $secret, string $code, int $drift = 1): bool {
        $base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        // Decode base32 secret
        $binary = '';
        $secret = str_replace('=', '', strtoupper($secret));
        for ($i = 0; $i < strlen($secret); $i++) {
            $pos = strpos($base32, $secret[$i]);
            if ($pos === false) return false;
            $binary .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
        }
        $key = '';
        for ($i = 0; $i < strlen($binary); $i += 8) {
            $byte = substr($binary, $i, 8);
            if (strlen($byte) < 8) $byte = str_pad($byte, 8, '0');
            $key .= chr(bindec($byte));
        }
        $timeStep = floor(time() / 30);
        for ($d = -$drift; $d <= $drift; $d++) {
            $counter = pack('N*', 0) . pack('N*', $timeStep + $d);
            $hash = hash_hmac('sha1', $counter, $key, true);
            $offset = ord($hash[19]) & 0x0F;
            $truncated = (ord($hash[$offset]) & 0x7F) << 24
                       | (ord($hash[$offset + 1]) & 0xFF) << 16
                       | (ord($hash[$offset + 2]) & 0xFF) << 8
                       | (ord($hash[$offset + 3]) & 0xFF);
            $expected = str_pad((string)($truncated % 1000000), 6, '0', STR_PAD_LEFT);
            if (hash_equals($expected, $code)) return true;
        }
        return false;
    }

    function handleVerifyMfaSetup(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        $code  = trim($b['code'] ?? '');
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        if ($code === '')  return ['success' => false, 'error' => 'missing code'];
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            $row = dbFetchOne("SELECT mfa_secret FROM admin_emails WHERE email = ?", [$email]);
            if (!$row || empty($row['mfa_secret'])) {
                return ['success' => false, 'error' => 'MFA not set up. Call setupMfa first.'];
            }
            if (_totpVerify($row['mfa_secret'], $code)) {
                dbQuery("UPDATE admin_emails SET mfa_enabled = 1 WHERE email = ?", [$email]);
                return ['success' => true, 'enabled' => true, 'email' => $email];
            }
            return ['success' => false, 'error' => 'Невалиден код. Опитайте отново.'];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T73c: Disable MFA for the account.
if (!function_exists('handleDisableMfa')) {
    function handleDisableMfa(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            dbQuery("UPDATE admin_emails SET mfa_enabled = 0, mfa_secret = NULL WHERE email = ?", [$email]);
            return ['success' => true, 'disabled' => true, 'email' => $email];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T75: Account Lockout ─────────────────────────────────────────────────────
// Check if an account/IP is currently locked out.
if (!function_exists('handleCheckAccountLockout')) {
    function handleCheckAccountLockout(array $b): array {
        $email = strtolower(trim($b['email'] ?? ''));
        $ip    = trim($b['ipAddress'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        try {
            $db = getDB();
            // Check email lockout
            $lock = dbFetchOne(
                "SELECT id, email, ip_address, locked_until, reason, locked_by
                 FROM account_lockouts
                 WHERE is_active = 1 AND locked_until > NOW()
                 AND (email = ? OR ip_address = ?)
                 ORDER BY locked_until DESC LIMIT 1",
                [$email, $ip]);
            if ($lock) {
                $remaining = strtotime($lock['locked_until']) - time();
                return [
                    'success'        => true,
                    'locked'         => true,
                    'lockedUntil'    => $lock['locked_until'],
                    'remainingSecs'  => max(0, $remaining),
                    'reason'         => $lock['reason'],
                    'lockedBy'       => $lock['locked_by'],
                ];
            }
            return ['success' => true, 'locked' => false];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T75b: Lock an account (automatic after brute-force or manual by admin).
if (!function_exists('handleLockAccount')) {
    function handleLockAccount(array $b): array {
        $email    = strtolower(trim($b['email'] ?? ''));
        $ip       = trim($b['ipAddress'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        $duration = (int)($b['duration'] ?? 1800); // default 30 min
        $reason   = trim($b['reason'] ?? 'brute_force');
        $by       = trim($b['lockedBy'] ?? 'system');
        if ($email === '' && $ip === '') return ['success' => false, 'error' => 'missing email or ip'];
        // If called by non-admin, only allow automatic (system) locks
        if ($by !== 'system' && (!function_exists('isAdminUser') || !isAdminUser($by))) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            $db = getDB();
            $until = date('Y-m-d H:i:s', time() + $duration);
            dbQuery(
                "INSERT INTO account_lockouts (email, ip_address, locked_until, reason, locked_by, is_active)
                 VALUES (?, ?, ?, ?, ?, 1)",
                [$email ?: '', $ip, $until, $reason, $by]);
            return ['success' => true, 'locked' => true, 'lockedUntil' => $until, 'duration' => $duration];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T75c: Unlock an account (admin only).
if (!function_exists('handleUnlockAccount')) {
    function handleUnlockAccount(array $b): array {
        $email = strtolower(trim($b['email'] ?? ''));
        $ip    = trim($b['ipAddress'] ?? '');
        $by    = trim($b['ownerEmail'] ?? $b['email'] ?? '');
        if (!function_exists('isAdminUser') || !isAdminUser($by)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            $db = getDB();
            $where  = "is_active = 1";
            $params = [];
            if ($email !== '') { $where .= " AND email = ?"; $params[] = $email; }
            if ($ip !== '')    { $where .= " AND ip_address = ?"; $params[] = $ip; }
            dbQuery("UPDATE account_lockouts SET is_active = 0 WHERE $where", $params);
            return ['success' => true, 'unlocked' => true];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T22c: admin changes another user's password (privileged). Requires isAdminUser.
if (!function_exists('handleAdminSetPassword')) {
    function handleAdminSetPassword(array $b): array {
        $targetEmail = strtolower(trim($b['email'] ?? $b['targetEmail'] ?? ''));
        $newPw       = $b['newPassword'] ?? '';
        $owner       = trim((string)($b['ownerEmail'] ?? $b['email'] ?? ''));
        if ($targetEmail === '') return ['success' => false, 'error' => 'missing email'];
        if ($newPw === '')       return ['success' => false, 'error' => 'missing newPassword'];
        if ($owner === '')       return ['success' => false, 'error' => 'missing ownerEmail'];
        if (!function_exists('isAdminUser') || !isAdminUser($owner)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        if (strlen($newPw) < 8) return ['success' => false, 'error' => 'Password must be at least 8 characters'];
        try {
            $db = getDB();
            // Verify target exists in admin_emails.
            $adm = dbFetchOne("SELECT id FROM admin_emails WHERE email = ?", [$targetEmail]);
            if (!$adm) return ['success' => false, 'error' => 'User not found in admin list'];
            dbQuery("UPDATE admin_emails SET password_hash = ?, updated_at = ? WHERE email = ?",
                [password_hash($newPw, PASSWORD_DEFAULT), time(), $targetEmail]);
            return ['success' => true, 'email' => $targetEmail, 'rotated' => true];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T73: MFA (TOTP) setup ───────────────────────────────────────────────────
// Generates a base32 TOTP secret and returns the otpauth URI for QR code rendering.
if (!function_exists('handleSetupMfa')) {
    function handleSetupMfa(array $b): array {
        $owner = strtolower(trim($b['ownerEmail'] ?? $b['email'] ?? ''));
        if ($owner === '') return ['success' => false, 'error' => 'missing email'];
        if (!function_exists('isAdminUser') || !isAdminUser($owner)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            // Generate random 160-bit secret, base32-encoded (32 chars).
            $base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
            $secret = '';
            for ($i = 0; $i < 32; $i++) {
                $secret .= $base32[random_int(0, 31)];
            }
            // Store the secret (unconfirmed — only enabled after verification).
            dbQuery("UPDATE admin_emails SET mfa_secret = ?, updated_at = ? WHERE email = ?",
                [$secret, time(), $owner]);
            // Build otpauth URI for QR code.
            $issuer = 'UEV-ERP';
            $label = rawurlencode($issuer . ':' . $owner);
            $otpauth = 'otpauth://totp/' . $label
                . '?secret=' . $secret
                . '&issuer=' . rawurlencode($issuer)
                . '&algorithm=SHA1&digits=6&period=30';
            return ['success' => true, 'secret' => $secret, 'otpauth_uri' => $otpauth];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T73: Verify a TOTP code against the stored secret and enable MFA.
if (!function_exists('handleVerifyMfaSetup')) {
    function handleVerifyMfaSetup(array $b): array {
        $owner = strtolower(trim($b['ownerEmail'] ?? $b['email'] ?? ''));
        $code  = trim($b['code'] ?? '');
        if ($owner === '') return ['success' => false, 'error' => 'missing email'];
        if ($code === '')  return ['success' => false, 'error' => 'missing code'];
        if (!function_exists('isAdminUser') || !isAdminUser($owner)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            $row = dbFetchOne("SELECT mfa_secret FROM admin_emails WHERE email = ?", [$owner]);
            if (!$row || empty($row['mfa_secret'])) {
                return ['success' => false, 'error' => 'MFA not initiated — call setupmfa first'];
            }
            $secret = $row['mfa_secret'];
            // Verify TOTP: check current, previous, and next window (±30s drift).
            $valid = false;
            for ($offset = -1; $offset <= 1; $offset++) {
                $expected = _totp($secret, floor(time() / 30) + $offset);
                if (hash_equals($expected, $code)) {
                    $valid = true;
                    break;
                }
            }
            if (!$valid) return ['success' => false, 'error' => 'Invalid verification code'];
            // Enable MFA.
            dbQuery("UPDATE admin_emails SET mfa_enabled = 1, updated_at = ? WHERE email = ?",
                [time(), $owner]);
            return ['success' => true, 'email' => $owner, 'mfa_enabled' => true];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T73: Disable MFA — requires current password verification.
if (!function_exists('handleDisableMfa')) {
    function handleDisableMfa(array $b): array {
        $owner = strtolower(trim($b['ownerEmail'] ?? $b['email'] ?? ''));
        $pw    = $b['password'] ?? '';
        if ($owner === '') return ['success' => false, 'error' => 'missing email'];
        if ($pw === '')    return ['success' => false, 'error' => 'missing password'];
        if (!function_exists('isAdminUser') || !isAdminUser($owner)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            $row = dbFetchOne("SELECT password_hash FROM admin_emails WHERE email = ?", [$owner]);
            if (!$row || !password_verify($pw, ($row['password_hash'] ?? ''))) {
                return ['success' => false, 'error' => 'Invalid password'];
            }
            dbQuery("UPDATE admin_emails SET mfa_secret = NULL, mfa_enabled = 0, updated_at = ? WHERE email = ?",
                [time(), $owner]);
            return ['success' => true, 'email' => $owner, 'mfa_enabled' => false];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── TOTP helper (RFC 6238, SHA1, 6-digit, 30s step) ─────────────────────────
if (!function_exists('_totp')) {
    function _totp(string $base32Secret, int $counter): string {
        $base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secret = strtoupper($base32Secret);
        $binary = '';
        for ($i = 0; $i < strlen($secret); $i++) {
            $pos = strpos($base32, $secret[$i]);
            if ($pos === false) continue;
            $binary .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
        }
        $bytes = '';
        for ($i = 0; $i < strlen($binary); $i += 8) {
            $bytes .= chr(bindec(str_pad(substr($binary, $i, 8), 8, '0', STR_PAD_RIGHT)));
        }
        // Pack counter as 64-bit big-endian.
        $counterBytes = pack('N*', 0, $counter);
        $hash = hash_hmac('sha1', $counterBytes, $bytes, true);
        $offset = ord($hash[19]) & 0x0F;
        $code = (
            ((ord($hash[$offset]) & 0x7F) << 24) |
            ((ord($hash[$offset + 1]) & 0xFF) << 16) |
            ((ord($hash[$offset + 2]) & 0xFF) << 8) |
            (ord($hash[$offset + 3]) & 0xFF)
        ) % 1000000;
        return str_pad((string)$code, 6, '0', STR_PAD_LEFT);
    }
}

// ── T71: Login Analytics ─────────────────────────────────────────────────────
// Records every login attempt (success or failure) for security auditing.
if (!function_exists('handleRecordLoginAttempt')) {
    function handleRecordLoginAttempt(array $b): array {
        $email     = strtolower(trim($b['email'] ?? ''));
        $ip        = trim($b['ip'] ?? $b['ip_address'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        $userAgent = trim($b['user_agent'] ?? $b['userAgent'] ?? $_SERVER['HTTP_USER_AGENT'] ?? '');
        $success   = !empty($b['success']) ? 1 : 0;
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        try {
            $db = getDB();
            dbQuery(
                "INSERT INTO login_analytics (email, ip_address, user_agent, success, created_at)
                 VALUES (?, ?, ?, ?, NOW())",
                [$email, $ip, $userAgent, $success]
            );
            return ['success' => true, 'recorded' => true];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T71b: returns login pattern data — failed attempts per hour, top IPs, recent suspicious activity (last 24h).
if (!function_exists('handleGetLoginAnalytics')) {
    function handleGetLoginAnalytics(array $b): array {
        $email = strtolower(trim($b['email'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        try {
            $db = getDB();
            // Failed attempts per hour (last 24h) for this email.
            $perHour = dbFetchAll(
                "SELECT HOUR(created_at) AS hr, COUNT(*) AS cnt
                 FROM login_analytics
                 WHERE email = ? AND success = 0
                   AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                 GROUP BY HOUR(created_at)
                 ORDER BY hr ASC",
                [$email]
            );
            // Top IPs by failed attempt count (last 24h).
            $topIps = dbFetchAll(
                "SELECT ip_address, COUNT(*) AS fails
                 FROM login_analytics
                 WHERE email = ? AND success = 0
                   AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
                 GROUP BY ip_address
                 ORDER BY fails DESC
                 LIMIT 10",
                [$email]
            );
            // Recent suspicious activity: any IP with > 5 failed attempts in last 15 min.
            $suspicious = dbFetchAll(
                "SELECT ip_address, COUNT(*) AS fails, MAX(created_at) AS last_attempt
                 FROM login_analytics
                 WHERE email = ? AND success = 0
                   AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                 GROUP BY ip_address
                 HAVING fails >= 5
                 ORDER BY fails DESC
                 LIMIT 10",
                [$email]
            );
            return [
                'success'            => true,
                'failedPerHour'      => $perHour,
                'topIps'             => $topIps,
                'suspiciousActivity' => $suspicious,
                'suspiciousCount'    => count($suspicious),
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T75: Account Lockout ─────────────────────────────────────────────────────
// Checks if an email/IP is currently locked out.
if (!function_exists('handleCheckAccountLockout')) {
    function handleCheckAccountLockout(array $b): array {
        $email = strtolower(trim($b['email'] ?? ''));
        $ip    = trim($b['ip'] ?? $b['ip_address'] ?? '');
        if ($email === '' && $ip === '') return ['success' => false, 'error' => 'missing email or ip'];
        try {
            $db = getDB();
            // Find active lockout for email or IP.
            $lockout = null;
            if ($email !== '') {
                $lockout = dbFetchOne(
                    "SELECT id, email, ip_address, locked_at, locked_until, reason, locked_by
                     FROM account_lockouts
                     WHERE email = ? AND is_active = 1 AND locked_until > NOW()
                     ORDER BY locked_until DESC
                     LIMIT 1",
                    [$email]
                );
            }
            if (!$lockout && $ip !== '') {
                $lockout = dbFetchOne(
                    "SELECT id, email, ip_address, locked_at, locked_until, reason, locked_by
                     FROM account_lockouts
                     WHERE ip_address = ? AND is_active = 1 AND locked_until > NOW()
                     ORDER BY locked_until DESC
                     LIMIT 1",
                    [$ip]
                );
            }
            if (!$lockout) {
                return ['success' => true, 'locked' => false, 'remainingSeconds' => 0];
            }
            $remaining = max(0, strtotime($lockout['locked_until']) - time());
            return [
                'success'          => true,
                'locked'           => true,
                'lockedUntil'      => $lockout['locked_until'],
                'remainingSeconds' => $remaining,
                'reason'           => $lockout['reason'] ?? '',
                'lockedBy'         => $lockout['locked_by'] ?? 'system',
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T75b: locks an account for a specified duration (admin or automatic).
// Requires isAdminUser OR automatic (internal call with is_auto flag).
if (!function_exists('handleLockAccount')) {
    function handleLockAccount(array $b): array {
        $email    = strtolower(trim($b['email'] ?? ''));
        $ip       = trim($b['ip'] ?? $b['ip_address'] ?? '');
        $duration = intval($b['duration'] ?? 1800); // default 30 min
        $reason   = trim($b['reason'] ?? 'brute_force');
        $isAuto   = !empty($b['is_auto']);
        $owner    = trim((string)($b['ownerEmail'] ?? $b['lockedBy'] ?? ''));
        if ($email === '' && $ip === '') return ['success' => false, 'error' => 'missing email or ip'];
        // Admin-only unless automatic (internal system call).
        if (!$isAuto) {
            if ($owner === '') return ['success' => false, 'error' => 'missing ownerEmail'];
            if (!function_exists('isAdminUser') || !isAdminUser($owner)) {
                return ['success' => false, 'error' => 'admin_required'];
            }
        }
        try {
            $db = getDB();
            $lockedAt   = date('Y-m-d H:i:s');
            $lockedUntil = date('Y-m-d H:i:s', time() + $duration);
            $lockedBy   = $isAuto ? 'system' : $owner;
            // Deactivate any prior active lockouts for this email/IP.
            if ($email !== '') {
                dbQuery("UPDATE account_lockouts SET is_active = 0 WHERE email = ? AND is_active = 1", [$email]);
            }
            if ($ip !== '') {
                dbQuery("UPDATE account_lockouts SET is_active = 0 WHERE ip_address = ? AND is_active = 1", [$ip]);
            }
            dbQuery(
                "INSERT INTO account_lockouts (email, ip_address, locked_at, locked_until, reason, locked_by, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, 1)",
                [$email ?: null, $ip ?: null, $lockedAt, $lockedUntil, $reason, $lockedBy]
            );
            return [
                'success'     => true,
                'locked'      => true,
                'lockedUntil' => $lockedUntil,
                'reason'      => $reason,
                'lockedBy'    => $lockedBy,
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T75c: manually unlock an account. Requires isAdminUser.
if (!function_exists('handleUnlockAccount')) {
    function handleUnlockAccount(array $b): array {
        $email = strtolower(trim($b['email'] ?? ''));
        $ip    = trim($b['ip'] ?? $b['ip_address'] ?? '');
        $owner = trim((string)($b['ownerEmail'] ?? $b['lockedBy'] ?? ''));
        if ($email === '' && $ip === '') return ['success' => false, 'error' => 'missing email or ip'];
        if ($owner === '') return ['success' => false, 'error' => 'missing ownerEmail'];
        if (!function_exists('isAdminUser') || !isAdminUser($owner)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            $db = getDB();
            $unlocked = 0;
            if ($email !== '') {
                dbQuery("UPDATE account_lockouts SET is_active = 0 WHERE email = ? AND is_active = 1", [$email]);
                $unlocked = $db->lastInsertId() ? 1 : 1; // mark as affected
            }
            if ($ip !== '') {
                dbQuery("UPDATE account_lockouts SET is_active = 0 WHERE ip_address = ? AND is_active = 1", [$ip]);
            }
            return ['success' => true, 'unlocked' => true, 'by' => $owner];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T73/T74: MFA (Multi-Factor Authentication) ─────────────────────────────
// T73a: Generate a new MFA secret + provisioning URI for QR code setup.
if (!function_exists('handleSetupMfa')) {
    function handleSetupMfa(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            // Generate a random 16-char base32 secret (TOTP-compatible).
            $base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
            $secret = '';
            for ($i = 0; $i < 16; $i++) {
                $secret .= $base32Chars[random_int(0, 31)];
            }
            $issuer = 'UEV-ERP';
            $label = $issuer . ':' . $email;
            $provisioningUri = 'otpauth://totp/' . rawurlencode($label)
                . '?secret=' . $secret
                . '&issuer=' . rawurlencode($issuer)
                . '&algorithm=SHA1&digits=6&period=30';
            // Store secret temporarily (confirmed on verify).
            dbQuery("UPDATE admin_emails SET mfa_secret = ? WHERE email = ?", [$secret, $email]);
            return [
                'success'         => true,
                'secret'          => $secret,
                'provisioningUri' => $provisioningUri,
                'issuer'          => $issuer,
                'label'           => $label,
            ];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T73b: Verify an MFA setup by validating the first TOTP code.
if (!function_exists('handleVerifyMfaSetup')) {
    function handleVerifyMfaSetup(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        $code  = trim($b['code'] ?? '');
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        if ($code === '' || strlen($code) !== 6 || !ctype_digit($code)) {
            return ['success' => false, 'error' => 'invalid code format'];
        }
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            $adm = dbFetchOne("SELECT mfa_secret FROM admin_emails WHERE email = ?", [$email]);
            if (!$adm || empty($adm['mfa_secret'])) {
                return ['success' => false, 'error' => 'no MFA setup in progress'];
            }
            $secret = $adm['mfa_secret'];
            // Validate TOTP code (current window ±1 for clock skew).
            $valid = false;
            $timeStep = floor(time() / 30);
            for ($offset = -1; $offset <= 1; $offset++) {
                $expected = _totp($secret, $timeStep + $offset);
                if (hash_equals($expected, $code)) {
                    $valid = true;
                    break;
                }
            }
            if (!$valid) {
                return ['success' => false, 'error' => 'invalid code'];
            }
            // Mark MFA as enabled (mfa_secret stays as the active secret).
            dbQuery("UPDATE admin_emails SET mfa_enabled = 1 WHERE email = ?", [$email]);
            return ['success' => true, 'verified' => true, 'message' => 'MFA е активирано успешно'];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// T74: Disable MFA for the current user.
if (!function_exists('handleDisableMfa')) {
    function handleDisableMfa(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            dbQuery("UPDATE admin_emails SET mfa_secret = NULL, mfa_enabled = 0 WHERE email = ?", [$email]);
            return ['success' => true, 'disabled' => true, 'message' => 'MFA е деактивирано'];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── TOTP helper ─────────────────────────────────────────────────────────────
// RFC 6238 TOTP implementation (SHA1, 6 digits, 30s window).
if (!function_exists('_totp')) {
    function _totp(string $secret, int $timeStep): string {
        $base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        $secretBin = '';
        $s = strtoupper($secret);
        for ($i = 0; $i < strlen($s); $i++) {
            $idx = strpos($base32Chars, $s[$i]);
            if ($idx === false) continue;
            $secretBin .= str_pad(decbin($idx), 5, '0', STR_PAD_LEFT);
        }
        $packedSecret = '';
        $chunks = str_split($secretBin, 8);
        foreach ($chunks as $chunk) {
            $packedSecret .= chr(bindec(str_pad($chunk, 8, '0', STR_PAD_RIGHT)));
        }
        $time = pack('N*', 0) . pack('N*', $timeStep);
        $hash = hash_hmac('sha1', $time, $packedSecret, true);
        $offset = ord($hash[19]) & 0x0F;
        $code = (
            ((ord($hash[$offset]) & 0x7F) << 24) |
            ((ord($hash[$offset + 1]) & 0xFF) << 16) |
            ((ord($hash[$offset + 2]) & 0xFF) << 8) |
            (ord($hash[$offset + 3]) & 0xFF)
        ) % 1000000;
        return str_pad((string)$code, 6, '0', STR_PAD_LEFT);
    }
}

// ── T75 helper: brute-force detection + auto-lock ───────────────────────────
// Called internally after recording a failed attempt. Applies lockout policy:
//   5+ fails in 15 min → lock 30 min; 10+ fails in 15 min → lock 2h.
if (!function_exists('checkBruteForceAndLock')) {
    function checkBruteForceAndLock(string $email, string $ip): void {
        if ($email === '' && $ip === '') return;
        try {
            $db = getDB();
            $emailFilter = $email !== '' ? "email = ?" : "0";
            $params = $email !== '' ? [$email] : [];
            $recentFails = dbFetchOne(
                "SELECT COUNT(*) AS cnt FROM login_analytics
                 WHERE {$emailFilter} AND success = 0
                   AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)",
                $params
            );
            $failCount = (int)($recentFails['cnt'] ?? 0);
            if ($failCount >= 10) {
                handleLockAccount(['email' => $email, 'ip' => $ip, 'duration' => 7200, 'reason' => 'brute_force_10', 'is_auto' => true]);
            } elseif ($failCount >= 5) {
                handleLockAccount(['email' => $email, 'ip' => $ip, 'duration' => 1800, 'reason' => 'brute_force_5', 'is_auto' => true]);
            }
        } catch (Throwable $e) { /* ignore */ }
    }
}
