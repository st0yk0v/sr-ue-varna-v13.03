<?php
/**
 * ORCID OAuth 2.0 / OpenID Connect Integration
 * 
 * Allows Google Auth users to connect their ORCID account via OAuth.
 * Flow: Generate auth URL → ORCID login → Callback → Exchange code → Get ORCID iD → Save to staff_orcid
 * 
 * Actions:
 * - orcid_auth_url   { } → returns authorization URL
 * - orcid_callback   { code } → exchanges code for token, saves ORCID iD
 * - orcid_disconnect { email } → removes ORCID connection
 */

if (!function_exists('_vedaHttpRetry')) {
    require_once __DIR__ . '/veda_handlers.php';
}

// ── ORCID OAuth Configuration ──────────────────────────────────────────────
// Public API (no key needed for reading), but OAuth requires a registered app.
// For development, we use the ORCID Public API sandbox.
// Register at: https://orcid.org/developer-tools

function _orcidOAuthConfig(): array {
    $cfg = _vedaLoadConfig();
    return [
        'client_id'     => $cfg['orcidClientId']     ?? '',
        'client_secret' => $cfg['orcidClientSecret'] ?? '',
        'sandbox'       => !empty($cfg['orcidSandbox']), // default: use sandbox for safety
        'redirect_uri'  => ($cfg['orcidRedirectUri'] ?? '') ?: _orcidDefaultRedirectUri(),
        'scopes'        => '/authenticate', // Public API client only supports /authenticate
    ];
}

function _orcidDefaultRedirectUri(): string {
    // Auto-detect the redirect URI based on the current host
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'sr-ue-varna.com';
    return $scheme . '://' . $host . '/database/api.php?action=orcid_callback';
}

function _orcidApiBase(bool $sandbox): string {
    return $sandbox ? 'https://sandbox.orcid.org' : 'https://orcid.org';
}

function _orcidApiV3Base(bool $sandbox): string {
    return $sandbox ? 'https://pub.sandbox.orcid.org/v3.0' : 'https://pub.orcid.org/v3.0';
}

// ── Generate Authorization URL ─────────────────────────────────────────────
function handleGetOrcIDAuthUrl(array $b): array {
    $cfg = _orcidOAuthConfig();
    
    if (empty($cfg['client_id'])) {
        return ['success' => false, 'error' => 'ORCID OAuth not configured. Set orcidClientId in veda_config.json'];
    }
    
    $base = _orcidApiBase($cfg['sandbox']);
    $state = bin2hex(random_bytes(16));
    
    // Store state in session for CSRF protection
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    $_SESSION['orcid_oauth_state'] = $state;
    $_SESSION['orcid_oauth_time'] = time();
    
    // Also store in cookie as fallback (survives cross-domain redirects)
    $cookieName = 'orcid_oauth_state_' . $state;
    setcookie($cookieName, $state, [
        'expires' => time() + 600,
        'path' => '/',
        'domain' => '',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    
    $params = [
        'client_id'     => $cfg['client_id'],
        'response_type' => 'code',
        'scope'         => $cfg['scopes'],
        'redirect_uri'  => $cfg['redirect_uri'],
        'state'         => $state,
        'prompt'        => 'login',
    ];
    
    $url = $base . '/oauth/authorize?' . http_build_query($params);
    
    return ['success' => true, 'url' => $url, 'state' => $state];
}

// ── Handle OAuth Callback ──────────────────────────────────────────────────
function handleOrcIDCallback(array $b): array {
    $cfg = _orcidOAuthConfig();
    
    if (empty($cfg['client_id']) || empty($cfg['client_secret'])) {
        return ['success' => false, 'error' => 'ORCID OAuth not configured'];
    }
    
    $code = trim($b['code'] ?? '');
    $state = trim($b['state'] ?? '');
    
    if (empty($code)) {
        return ['success' => false, 'error' => 'Missing authorization code'];
    }
    
    // Verify state for CSRF protection - check session first, then cookie fallback
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    $storedState = $_SESSION['orcid_oauth_state'] ?? '';
    $storedTime = $_SESSION['orcid_oauth_time'] ?? 0;
    
    // Fallback: check cookie if session state is missing (cross-domain redirect issue)
    if (empty($storedState)) {
        foreach ($_COOKIE as $name => $value) {
            if (str_starts_with($name, 'orcid_oauth_state_')) {
                $storedState = $value;
                $storedTime = time(); // approximate, cookie has its own expiry
                break;
            }
        }
    }
    
    if (empty($storedState) || $storedState !== $state) {
        return ['success' => false, 'error' => 'Invalid state parameter (CSRF protection)'];
    }
    
    // State expires after 10 minutes
    if (time() - $storedTime > 600) {
        unset($_SESSION['orcid_oauth_state'], $_SESSION['orcid_oauth_time']);
        // Also clear cookies
        foreach ($_COOKIE as $name => $value) {
            if (str_starts_with($name, 'orcid_oauth_state_')) {
                setcookie($name, '', time() - 3600, '/', '', true, true);
            }
        }
        return ['success' => false, 'error' => 'Authorization expired. Please try again.'];
    }
    
    // Clear state
    unset($_SESSION['orcid_oauth_state'], $_SESSION['orcid_oauth_time']);
    foreach ($_COOKIE as $name => $value) {
        if (str_starts_with($name, 'orcid_oauth_state_')) {
            setcookie($name, '', time() - 3600, '/', '', true, true);
        }
    }
    
    // Exchange code for token
    $base = _orcidApiBase($cfg['sandbox']);
    $tokenUrl = $base . '/oauth/token';
    
    $postData = [
        'client_id'     => $cfg['client_id'],
        'client_secret' => $cfg['client_secret'],
        'grant_type'    => 'authorization_code',
        'code'          => $code,
        'redirect_uri'  => $cfg['redirect_uri'],
    ];
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $tokenUrl,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query($postData),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
        CURLOPT_TIMEOUT        => 30,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        return ['success' => false, 'error' => 'Token exchange failed (HTTP ' . $httpCode . ')'];
    }
    
    $tokenData = json_decode($response, true);
    if (empty($tokenData['orcid'])) {
        return ['success' => false, 'error' => 'No ORCID iD in token response'];
    }
    
    $orcid = $tokenData['orcid'];
    $accessToken = $tokenData['access_token'] ?? '';
    $refreshToken = $tokenData['refresh_token'] ?? '';
    $expiresIn = $tokenData['expires_in'] ?? 0;
    
    // Get full name from ORCID record
    $fullName = $tokenData['name'] ?? '';
    if (empty($fullName) && !empty($accessToken)) {
        $record = _orcidFetchRecord($orcid, $accessToken, $cfg['sandbox']);
        if ($record['ok']) {
            $fullName = $record['name'] ?? '';
        }
    }
    
    // Store in session for the frontend to pick up
    $_SESSION['orcid_connection'] = [
        'orcid'        => $orcid,
        'name'         => $fullName,
        'access_token' => $accessToken,
        'expires_at'   => time() + $expiresIn,
    ];
    
    return [
        'success' => true,
        'orcid'   => $orcid,
        'name'    => $fullName,
    ];
}

// ── Fetch ORCID Record ─────────────────────────────────────────────────────
function _orcidFetchRecord(string $orcid, string $accessToken, bool $sandbox): array {
    $base = _orcidApiV3Base($sandbox);
    $url = $base . '/' . urlencode($orcid) . '/person';
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json',
            'Authorization: Bearer ' . $accessToken,
        ],
        CURLOPT_TIMEOUT        => 30,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        return ['ok' => false, 'error' => 'HTTP ' . $httpCode];
    }
    
    $data = json_decode($response, true);
    if (empty($data['name'])) {
        return ['ok' => false, 'error' => 'No name in record'];
    }
    
    $given = $data['name']['given-names']['value'] ?? '';
    $family = $data['name']['family-name']['value'] ?? '';
    $credit = $data['name']['credit-name']['value'] ?? '';
    
    return [
        'ok'        => true,
        'name'      => $credit ?: trim($given . ' ' . $family),
        'orcid'     => $orcid,
    ];
}

// ── Save ORCID Connection (called by frontend after callback) ──────────────
function handleSaveOrcIDConnection(array $b): array {
    $email = strtolower(trim($b['email'] ?? ''));
    $orcid = trim($b['orcid'] ?? '');
    $name = trim($b['name'] ?? '');
    
    if (empty($email)) {
        return ['success' => false, 'error' => 'Missing email'];
    }
    if (empty($orcid)) {
        return ['success' => false, 'error' => 'Missing ORCID iD'];
    }
    
    // Validate ORCID format
    if (!preg_match('/^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/i', $orcid)) {
        return ['success' => false, 'error' => 'Invalid ORCID format'];
    }
    
    try {
        $pdo = _orcidPdo();
        
        // Check if this ORCID is already linked to another email
        $st = $pdo->prepare('SELECT email FROM staff_orcid WHERE orcid_id = ? AND email != ?');
        $st->execute([$orcid, $email]);
        $existing = $st->fetch();
        
        if ($existing) {
            return ['success' => false, 'error' => 'ORCID ' . $orcid . ' is already linked to ' . $existing['email']];
        }
        
        // Save to staff_orcid
        $st = $pdo->prepare('INSERT INTO staff_orcid (email, orcid_id, full_name, synced_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE orcid_id = VALUES(orcid_id), full_name = VALUES(full_name), synced_at = VALUES(synced_at)');
        $st->execute([$email, $orcid, $name]);
        
        // Sync to user_scientific_profile
        _syncOrcIdToProfile($email, $orcid, $name);
        
        return ['success' => true, 'email' => $email, 'orcid' => $orcid];
        
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'DB error: ' . $e->getMessage()];
    }
}

// ── Disconnect ORCID ───────────────────────────────────────────────────────
function handleDisconnectOrcID(array $b): array {
    $email = strtolower(trim($b['email'] ?? ''));
    if (empty($email)) {
        return ['success' => false, 'error' => 'Missing email'];
    }
    
    try {
        $pdo = _orcidPdo();
        
        // Remove from staff_orcid
        $st = $pdo->prepare('DELETE FROM staff_orcid WHERE email = ?');
        $st->execute([$email]);
        
        // Clear from user_scientific_profile
        $st = $pdo->prepare('UPDATE user_scientific_profile SET orcid = NULL, last_synced = NULL WHERE email = ?');
        $st->execute([$email]);
        
        return ['success' => true, 'email' => $email];
        
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'DB error: ' . $e->getMessage()];
    }
}

// ── Get ORCID Connection Status ────────────────────────────────────────────
function handleGetOrcIDStatus(array $b): array {
    $email = strtolower(trim($b['email'] ?? ''));
    if (empty($email)) {
        return ['success' => false, 'error' => 'Missing email'];
    }
    
    try {
        $pdo = _orcidPdo();
        
        // Check staff_orcid
        $st = $pdo->prepare('SELECT email, orcid_id, full_name, synced_at, work_count FROM staff_orcid WHERE email = ?');
        $st->execute([$email]);
        $staff = $st->fetch();
        
        // Check user_scientific_profile
        $st = $pdo->prepare('SELECT email, orcid, full_name, work_count, last_synced FROM user_scientific_profile WHERE email = ?');
        $st->execute([$email]);
        $profile = $st->fetch();
        
        return [
            'success' => true,
            'connected' => !empty($staff['orcid_id']),
            'orcid' => $staff['orcid_id'] ?? $profile['orcid'] ?? null,
            'name' => $staff['full_name'] ?? $profile['full_name'] ?? null,
            'work_count' => $staff['work_count'] ?? $profile['work_count'] ?? 0,
            'last_synced' => $staff['synced_at'] ?? $profile['last_synced'] ?? null,
        ];
        
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'DB error: ' . $e->getMessage()];
    }
}

// ── Sync ORCID to user_scientific_profile ──────────────────────────────────
function _syncOrcIdToProfile(string $email, string $orcid, string $name): void {
    $pdo = _orcidPdo();
    
    // Check if profile exists
    $st = $pdo->prepare('SELECT email FROM user_scientific_profile WHERE email = ?');
    $st->execute([$email]);
    
    if ($st->fetch()) {
        // Update existing
        $st = $pdo->prepare('UPDATE user_scientific_profile SET orcid = ?, full_name = COALESCE(NULLIF(full_name, ""), ?), last_synced = NOW() WHERE email = ?');
        $st->execute([$orcid, $name, $email]);
    } else {
        // Create new
        $st = $pdo->prepare('INSERT INTO user_scientific_profile (email, orcid, full_name, work_count, last_synced, created) VALUES (?, ?, ?, 0, NOW(), NOW())');
        $st->execute([$email, $orcid, $name]);
    }
}

// ── Resolve ORCID Login ──────────────────────────────────────────────────
// After the ORCID callback stores the ORCID iD in session, this handler
// looks up the associated email from staff_orcid and returns login data.
function handleOrcIDLoginResolve(array $b): array {
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }
    
    $conn = $_SESSION['orcid_connection'] ?? null;
    if (empty($conn['orcid'])) {
        return ['success' => false, 'error' => 'No ORCID connection in session'];
    }
    
    $orcid = $conn['orcid'];
    $name = $conn['name'] ?? '';
    
    // Look up email from staff_orcid by ORCID iD
    try {
        $pdo = _orcidPdo();
        $st = $pdo->prepare('SELECT email FROM staff_orcid WHERE orcid_id = ?');
        $st->execute([$orcid]);
        $row = $st->fetch();
        
        if ($row) {
            return [
                'success' => true,
                'email' => $row['email'],
                'name' => $name,
                'orcid' => $orcid,
            ];
        }
        
        // Auto-link: check user_scientific_profile for existing ORCID mapping
        $st = $pdo->prepare('SELECT email FROM user_scientific_profile WHERE orcid = ? AND email != "" LIMIT 1');
        $st->execute([$orcid]);
        $profileRow = $st->fetch();
        
        if ($profileRow) {
            // Auto-link: save to staff_orcid for future logins
            $linkSt = $pdo->prepare('INSERT INTO staff_orcid (email, orcid_id, full_name, synced_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE orcid_id = VALUES(orcid_id), full_name = VALUES(full_name), synced_at = VALUES(synced_at)');
            $linkSt->execute([$profileRow['email'], $orcid, $name]);
            
            return [
                'success' => true,
                'email' => $profileRow['email'],
                'name' => $name,
                'orcid' => $orcid,
            ];
        }
        
        // No linked account found — signal frontend to show connect modal
        return [
            'success' => true,
            'needsConnection' => true,
            'orcid' => $orcid,
            'name' => $name,
            'error' => 'Няма регистриран акаунт, свързан с този ORCID iD. Моля, въведете Вашия институционален имейл, за да свържете профилите си.',
        ];
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'DB error: ' . $e->getMessage()];
    }
}

// ── Connect ORCID to Account (standalone login) ───────────────────────────
function handleOrcIDConnectAccount(array $b): array {
    $email = strtolower(trim($b['email'] ?? ''));
    $orcid = trim($b['orcid'] ?? '');
    $name = trim($b['name'] ?? '');
    
    if (empty($email) || strpos($email, '@') === false) {
        return ['success' => false, 'error' => 'Моля, въведете валиден имейл адрес.'];
    }
    if (empty($orcid)) {
        return ['success' => false, 'error' => 'Липсва ORCID iD. Моля, опитайте отново.'];
    }
    
    // Validate ORCID format
    if (!preg_match('/^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/i', $orcid)) {
        return ['success' => false, 'error' => 'Невалиден формат на ORCID iD.'];
    }
    
    try {
        $pdo = _orcidPdo();
        
        // Check if this ORCID is already linked to another email
        $st = $pdo->prepare('SELECT email FROM staff_orcid WHERE orcid_id = ? AND email != ?');
        $st->execute([$orcid, $email]);
        $existing = $st->fetch();
        
        if ($existing) {
            return ['success' => false, 'error' => 'Този ORCID профил е вече свързан с друг акаунт.'];
        }
        
        // Save to staff_orcid
        $st = $pdo->prepare('INSERT INTO staff_orcid (email, orcid_id, full_name, synced_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE orcid_id = VALUES(orcid_id), full_name = VALUES(full_name), synced_at = VALUES(synced_at)');
        $st->execute([$email, $orcid, $name]);
        
        // Sync to user_scientific_profile
        _syncOrcIdToProfile($email, $orcid, $name);
        
        return ['success' => true, 'email' => $email, 'orcid' => $orcid];
        
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'Грешка при свързване: ' . $e->getMessage()];
    }
}

// ── Get DB helper ─────────────────────────────────────────────────────────
function _orcidPdo(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}