<?php
/**
 * UEV-ERP Database Configuration — Restored (2026-08-27)
 * Full config with .env loader, PDO connection, query helpers, logging.
 *
 * DB and GAS credentials: hardcoded for production (Hostinger .env loading is unreliable).
 */

// ── Load .env file if present (best-effort) ──────────────────────────────
$envFile = __DIR__ . '/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $key = trim($parts[0]);
            $val = trim($parts[1]);
            if ((str_starts_with($val, '"') && str_ends_with($val, '"')) ||
                (str_starts_with($val, "'") && str_ends_with($val, "'"))) {
                $val = substr($val, 1, -1);
            }
            putenv("$key=$val");
            $_ENV[$key] = $val;
            $_SERVER[$key] = $val;
        }
    }
}
if (!function_exists('_uev_env')) {
function _uev_env(string $k, $default = '') {
    $v = getenv($k);
    if ($v !== false && $v !== '') return $v;
    if (isset($_ENV[$k]) && $_ENV[$k] !== '') return $_ENV[$k];
    if (isset($_SERVER[$k]) && $_SERVER[$k] !== '') return $_SERVER[$k];
    return $default;
}
}

// ── Timezone ──────────────────────────────────────────────────────────────
date_default_timezone_set('Europe/Sofia');

// ── Database credentials ──────────────────────────────────────────────────
define('DB_HOST',    _uev_env('DB_HOST')    ?: 'srv1701.hstgr.io');
define('DB_PORT',    _uev_env('DB_PORT')    ?: '3306');
define('DB_NAME',    _uev_env('DB_NAME')    ?: 'u129919172_db1');
define('DB_USER',    _uev_env('DB_USER')    ?: 'u129919172_dbadm');
define('DB_PASS',    _uev_env('DB_PASS')    ?: 'Joni9966y!yyz');
define('DB_CHARSET', _uev_env('DB_CHARSET') ?: 'utf8mb4');
define('DB_SSL',      getenv('DB_SSL')      === '1');
define('DB_SSL_CA',   getenv('DB_SSL_CA')   ?: '');
define('DB_SSL_CERT', getenv('DB_SSL_CERT') ?: '');
define('DB_SSL_KEY',  getenv('DB_SSL_KEY')  ?: '');

// ── Application ───────────────────────────────────────────────────────────
define('APP_ENV',  _uev_env('APP_ENV')  ?: 'production');
define('APP_DEBUG', getenv('APP_DEBUG') === 'true' || getenv('APP_DEBUG') === '1');
define('APP_VERSION', _uev_env('APP_VERSION') ?: '12.54.50');

// ── GAS Backend (reverse-sync) ────────────────────────────────────────────
define('GAS_REAL_URL', _uev_env('GAS_REAL_URL') ?: 'https://script.google.com/macros/s/AKfycbzD2M-Z7Z8jtWzPuvPv1EKpHBVtXUHRbvzO48/exec');
define('GAS_SYNC_ENABLED', getenv('GAS_SYNC_ENABLED') !== '0' && GAS_REAL_URL !== '');

// ── Upload ────────────────────────────────────────────────────────────────
define('UPLOAD_MAX_SIZE', intval(getenv('UPLOAD_MAX_SIZE') ?: 50 * 1024 * 1024));

// ── Admin credentials (optional) ──────────────────────────────────────────
define('ADMIN_USERNAME',     getenv('ADMIN_USERNAME')     ?: '');
define('ADMIN_PASSWORD',     getenv('ADMIN_PASSWORD')     ?: '');
define('RECADMIN_USERNAME',  getenv('RECADMIN_USERNAME')  ?: '');
define('RECADMIN_PASSWORD',  getenv('RECADMIN_PASSWORD')  ?: '');

// ── Application deadline ──────────────────────────────────────────────────
define('APP_OPEN_DATE',  '2026-05-26');
define('APP_DEADLINE',   '2027-06-30');
define('APP_DEADLINE_TS', strtotime('2027-06-30 23:59:59'));

// ── Deadline gate ─────────────────────────────────────────────────────────
function checkSubmissionDeadline(): ?array {
    $now = time();
    $open = strtotime(APP_OPEN_DATE . ' 00:00:00');
    $close = APP_DEADLINE_TS;
    if ($now < $open) {
        return ['success' => false, 'error' => 'Прозорецът за кандидатстване все още не е отворен. Отваряне: ' . APP_OPEN_DATE];
    }
    if ($now > $close) {
        return ['success' => false, 'error' => 'Прозорецът за кандидатстване приключи на ' . APP_DEADLINE . '. Подаването на нови предложения е невъзможно.'];
    }
    return null;
}

// ── Setup check ────────────────────────────────────────────────────────────
if (empty(DB_HOST) || empty(DB_NAME) || empty(DB_USER) || empty(DB_PASS)) {
    $missing = [];
    if (empty(DB_HOST)) $missing[] = 'DB_HOST';
    if (empty(DB_NAME)) $missing[] = 'DB_NAME';
    if (empty(DB_USER)) $missing[] = 'DB_USER';
    if (empty(DB_PASS)) $missing[] = 'DB_PASS';
    $msg = 'Database not configured. Missing: ' . implode(', ', $missing)
         . '. Set DB_HOST/DB_NAME/DB_USER/DB_PASS in database/.env';
    if (PHP_SAPI === 'cli') { fwrite(STDERR, $msg . "\n"); exit(1); }
    http_response_code(500);
    echo json_encode(['success'=>false, 'error'=>$msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PDO CONNECTION — singleton with automatic reconnection
// ══════════════════════════════════════════════════════════════════════════════

function getDB(): PDO {
    static $pdo = null;
    static $attempts = 0;
    static $_lastHealthy = 0;
    $now = time();

    if ($pdo !== null && $_lastHealthy > 0 && ($now - $_lastHealthy) < 2) {
        return $pdo;
    }

    if ($pdo !== null) {
        try {
            $pdo->query('SELECT 1');
            $attempts = 0;
            $_lastHealthy = $now;
            return $pdo;
        } catch (PDOException $e) {
            $pdo = null;
            logError('getDB: reconnecting after lost connection - ' . $e->getMessage());
            if ($attempts > 3) throw $e;
        }
    }

    $attempts++;

    $dsn = sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=%s',
        DB_HOST, DB_PORT, DB_NAME, DB_CHARSET
    );

    $attrBuffered = defined('Pdo\\Mysql::ATTR_USE_BUFFERED_QUERY')
        ? constant('Pdo\\Mysql::ATTR_USE_BUFFERED_QUERY')
        : (defined('PDO::MYSQL_ATTR_USE_BUFFERED_QUERY') ? PDO::MYSQL_ATTR_USE_BUFFERED_QUERY : 1000);
    $attrInitCmd  = defined('Pdo\\Mysql::ATTR_INIT_COMMAND')
        ? constant('Pdo\\Mysql::ATTR_INIT_COMMAND')
        : (defined('PDO::MYSQL_ATTR_INIT_COMMAND') ? PDO::MYSQL_ATTR_INIT_COMMAND : 1002);

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_STRINGIFY_FETCHES  => false,
        PDO::ATTR_TIMEOUT            => 5,
        PDO::ATTR_PERSISTENT         => (APP_ENV === 'production'),
        $attrBuffered => true,
        $attrInitCmd  => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
    ];
    if (defined('PDO::MYSQL_ATTR_CONNECT_TIMEOUT')) {
        $options[constant('PDO::MYSQL_ATTR_CONNECT_TIMEOUT')] = 5;
    }

    $lastErr = null;
    for ($i = 0; $i < 3; $i++) {
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
            $lastHealthy = time();
            $attempts = 0;
            break;
        } catch (PDOException $e) {
            $lastErr = $e;
            if ($i < 2) usleep(150000 * ($i + 1));
        }
    }
    if ($pdo === null) {
        if ($lastErr) throw $lastErr;
        throw new \RuntimeException('Неуспешна връзка с базата данни (retry изчерпан).');
    }

    if (DB_SSL) {
        $options[\PDO::Mysql::ATTR_SSL_CA]   = DB_SSL_CA;
        $options[\PDO::Mysql::ATTR_SSL_CERT] = DB_SSL_CERT;
        $options[\PDO::Mysql::ATTR_SSL_KEY]  = DB_SSL_KEY;
    }

    if (empty(DB_NAME) || empty(DB_USER)) {
        throw new \RuntimeException(
            'Database not configured. Missing: DB_NAME, DB_USER, DB_PASS.'
        );
    }
    if ($pdo === null) {
        throw new \RuntimeException('Неуспешна връзка с базата данни.');
    }

    try {
        $pdo->exec("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'");
        $pdo->exec('SET SESSION wait_timeout = 28800');
        $pdo->exec('SET SESSION interactive_timeout = 28800');
        $pdo->exec('SET SESSION net_read_timeout = 30');
        $pdo->exec('SET SESSION net_write_timeout = 30');
        try {
            $_tz = new DateTimeZone('Europe/Sofia');
            $_now = new DateTime('now', $_tz);
            $_offSec = $_tz->getOffset($_now);
            $_offH = intdiv($_offSec, 3600);
            $_offM = (int) (abs($_offSec) % 3600 / 60);
            $pdo->exec("SET SESSION time_zone = '" . sprintf('%+03d:%02d', $_offH, $_offM) . "'");
        } catch (\Throwable $_) { /* Non-fatal */ }
        if (APP_ENV === 'production') {
            $pdo->exec('SET SESSION innodb_flush_log_at_trx_commit = 2');
        }
    } catch (\Throwable $_) { /* Non-fatal — proceed with defaults */ }

    return $pdo;
}

// ══════════════════════════════════════════════════════════════════════════════
//  QUERY HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function dbQuery(string $sql, array $params = []): PDOStatement {
    $stmt = getDB()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function dbFetchAllCachedPerRequest(string $sql, array $params = [], int $ttlMs = 3000): array {
    $ck = 'fa:' . md5($sql . serialize($params));
    global $_PER_REQUEST_CACHE;
    if (!isset($_PER_REQUEST_CACHE)) $_PER_REQUEST_CACHE = [];
    $now = microtime(true) * 1000;
    if (isset($_PER_REQUEST_CACHE[$ck]) && ($now - $_PER_REQUEST_CACHE[$ck]['ts']) < $ttlMs) {
        return $_PER_REQUEST_CACHE[$ck]['rows'];
    }
    $rows = dbFetchAll($sql, $params);
    $_PER_REQUEST_CACHE[$ck] = ['ts' => $now, 'rows' => $rows];
    return $rows;
}

function dbFetchAll(string $sql, array $params = []): array {
    return dbQuery($sql, $params)->fetchAll();
}

function dbFetchOne(string $sql, array $params = []): ?array {
    $row = dbQuery($sql, $params)->fetch();
    return $row ?: null;
}

/**
 * isAdminUser — authoritative admin check shared by privileged handlers
 * (export_handlers, platform_handlers, auth_handlers). Checks the `admin_emails`
 * table (the same source resolveRole() consults). Returns false on missing/invalid
 * email or if the table is absent (incomplete migration) — never throws.
 * NOTE: several handlers guard this with function_exists(); once defined, the
 * admin gates actually ENFORCE instead of silently passing for everyone.
 */
function isAdminUser(string $email): bool {
    $email = strtolower(trim($email));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) return false;
    try {
        $row = dbFetchOne('SELECT email FROM admin_emails WHERE email = ?', [$email]);
        if ($row) return true;
    } catch (Throwable $e) { /* table may not exist on incomplete migrations */ }
    // v20.0.0: also honour a session-derived admin role via the auth context.
    if (isset($GLOBALS['_AUTH_CTX']) && ($GLOBALS['_AUTH_CTX']['role'] ?? '') === 'admin') return true;
    return false;
}

function dbInsert(string $sql, array $params = []): string {
    $db = getDB();
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $db->lastInsertId();
}

function _camelToSnake(string $input): string {
    return strtolower(preg_replace('/(?<!^)[A-Z]/', '_$0', $input));
}

function insertArray(string $table, array $data): void {
    $allowed = getTableColumns($table);
    $fields = [];
    $params = [];
    foreach ($data as $k => $v) {
        $key = $k;
        if (!in_array($key, $allowed)) $key = _camelToSnake($k);
        if (!in_array($key, $allowed)) $key = str_replace('-', '_', $k);
        if (in_array($key, $allowed)) {
            $fields[] = "`$key`";
            $params[] = is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v;
        }
    }
    if (empty($fields)) return;
    $phs = implode(',', array_fill(0, count($fields), '?'));
    dbQuery("INSERT INTO `$table` (" . implode(',', $fields) . ") VALUES ($phs)", $params);
}

function getTableColumns(string $table): array {
    static $cache = [];
    if (!isset($cache[$table])) {
        $cache[$table] = array_column(dbFetchAll("SHOW COLUMNS FROM `$table`"), 'Field');
    }
    return $cache[$table];
}

function clearQueryCache(string $table = ''): void {
    global $_PER_REQUEST_CACHE;
    if ($table) {
        if (isset($_PER_REQUEST_CACHE) && is_array($_PER_REQUEST_CACHE)) {
            $tableLower = strtolower($table);
            foreach ($_PER_REQUEST_CACHE as $key => $val) {
                if (stripos($key, $tableLower) !== false || stripos($key, '`' . $tableLower . '`') !== false) {
                    unset($_PER_REQUEST_CACHE[$key]);
                }
            }
        }
        $GLOBALS['_table_cols_cache'] ??= [];
        unset($GLOBALS['_table_cols_cache'][$table]);
    } else {
        $_PER_REQUEST_CACHE = [];
        $GLOBALS['_table_cols_cache'] = [];
    }
    _bustFetchAllCached($table);
    if ($table) bumpDataVersion($table);
    if (isset($GLOBALS['_DV_CACHE_REF'])) {
        $GLOBALS['_DV_CACHE_REF'] = null;
        $GLOBALS['_DV_CACHE_TS_REF'] = 0;
    }
}

function bumpDataVersion(string $tableName): void {
    try {
        dbQuery(
            'INSERT INTO data_version (table_name, version, updated_at)
             VALUES (?, 1, NOW())
             ON DUPLICATE KEY UPDATE version = version + 1, updated_at = NOW()',
            [$tableName]
        );
    } catch (Throwable $e) {
        logError("bumpDataVersion($tableName): " . $e->getMessage());
    }
}

function _bustFetchAllCached(string $table = ''): void {
    if (function_exists('_bustDbFetchAllCached')) {
        _bustDbFetchAllCached($table);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  LOGGING
// ══════════════════════════════════════════════════════════════════════════════

function logError(string $msg): void {
    $file = __DIR__ . '/../storage/logs/php-error.log';
    @file_put_contents($file, date('Y-m-d H:i:s') . ' ' . $msg . "\n", FILE_APPEND);
}

// ══════════════════════════════════════════════════════════════════════════════
// T95: SECURITY — Comprehensive Audit Logging
// ══════════════════════════════════════════════════════════════════════════════
define('AUDIT_LOG_ENABLED', getenv('AUDIT_LOG_ENABLED') !== '0');
define('AUDIT_LOG_SEVERITY_MIN', _uev_env('AUDIT_LOG_SEVERITY_MIN', 'info'));
define('AUDIT_LOG_RETENTION_DAYS', intval(getenv('AUDIT_LOG_RETENTION_DAYS') ?: 365));

// Severity levels for audit log filtering
$_AUDIT_SEVERITY_LEVELS = ['debug' => 0, 'info' => 1, 'warning' => 2, 'error' => 3, 'critical' => 4];

/**
 * Comprehensive audit logging with severity, user agent, session ID, and
 * structured metadata. Writes to the audit_log table (self-healed on first
 * call) and optionally to a file-based fallback if the DB is unavailable.
 *
 * @param string $action      Short action identifier (e.g. 'form.submit', 'admin.login')
 * @param string $actor       Email or identifier of the acting user
 * @param string $targetType  Type of target entity ('form', 'document', 'user', …)
 * @param string $targetId    ID of the target entity
 * @param array  $details     Structured detail payload (arbitrary keys)
 * @param string $severity    One of: debug, info, warning, error, critical
 */
function auditLog(string $action, string $actor, string $targetType = '', string $targetId = '', array $details = [], string $severity = 'info'): void {
    if (!AUDIT_LOG_ENABLED) return;
    // Severity gate: skip entries below the configured minimum
    $minLevel = $_AUDIT_SEVERITY_LEVELS[AUDIT_LOG_SEVERITY_MIN] ?? 1;
    $entryLevel = $_AUDIT_SEVERITY_LEVELS[$severity] ?? 1;
    if ($entryLevel < $minLevel) return;

    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $fwd = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $ip = trim($fwd[0]);
    }
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $sessionId = $_SERVER['HTTP_X_SESSION_ID'] ?? '';
    $requestId = $_SERVER['HTTP_X_REQUEST_ID'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    $uri = $_SERVER['REQUEST_URI'] ?? '';

    // Enrich details with request metadata
    $enrichedDetails = array_merge($details, [
        '_meta' => [
            'severity'    => $severity,
            'ip'          => $ip,
            'user_agent'  => $userAgent,
            'session_id'  => $sessionId,
            'request_id'  => $requestId,
            'method'      => $method,
            'uri'         => $uri,
            'timestamp'   => date('c'),
        ],
    ]);

    try {
        ensureAuditLogTable();
        dbInsert(
            'INSERT INTO audit_log (action, actor, target_type, target_id, details, ip_address, created)
             VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [$action, $actor, $targetType, $targetId,
             json_encode($enrichedDetails, JSON_UNESCAPED_UNICODE),
             $ip]
        );
    } catch (Throwable $e) {
        // File-based fallback so audit entries survive DB outages
        $fallbackFile = __DIR__ . '/../storage/logs/audit-fallback.log';
        $entry = date('Y-m-d H:i:s') . " [$severity] $actor@$ip $action $targetType:$targetId "
               . json_encode($enrichedDetails, JSON_UNESCAPED_UNICODE) . "\n";
        @file_put_contents($fallbackFile, $entry, FILE_APPEND);
        logError("auditLog DB failed, wrote fallback: {$e->getMessage()}");
    }
}

/**
 * Query audit log entries with filtering — used by admin audit UI.
 * Supports filtering by action, actor, severity, date range.
 */
function queryAuditLog(array $filters = [], int $limit = 100, int $offset = 0): array {
    ensureAuditLogTable();
    $sql = 'SELECT * FROM audit_log WHERE 1=1';
    $params = [];
    if (!empty($filters['action'])) {
        $sql .= ' AND action = ?';
        $params[] = $filters['action'];
    }
    if (!empty($filters['actor'])) {
        $sql .= ' AND actor = ?';
        $params[] = $filters['actor'];
    }
    if (!empty($filters['targetType'])) {
        $sql .= ' AND target_type = ?';
        $params[] = $filters['targetType'];
    }
    if (!empty($filters['severity'])) {
        // Severity is inside the JSON details column
        $sql .= ' AND JSON_EXTRACT(details, "$._meta.severity") = ?';
        $params[] = $filters['severity'];
    }
    if (!empty($filters['dateFrom'])) {
        $sql .= ' AND created >= ?';
        $params[] = $filters['dateFrom'];
    }
    if (!empty($filters['dateTo'])) {
        $sql .= ' AND created <= ?';
        $params[] = $filters['dateTo'];
    }
    $sql .= ' ORDER BY created DESC LIMIT ' . max(1, min($limit, 500)) . ' OFFSET ' . max(0, $offset);
    return dbFetchAll($sql, $params);
}

/**
 * Prune audit log entries older than AUDIT_LOG_RETENTION_DAYS.
 * Call periodically (e.g. via admin cleanup handler).
 */
function pruneAuditLog(): int {
    try {
        $row = dbFetchOne('SELECT COUNT(*) as cnt FROM audit_log WHERE created < DATE_SUB(NOW(), INTERVAL ? DAY)', [AUDIT_LOG_RETENTION_DAYS]);
        $before = (int)($row['cnt'] ?? 0);
        dbQuery('DELETE FROM audit_log WHERE created < DATE_SUB(NOW(), INTERVAL ? DAY)', [AUDIT_LOG_RETENTION_DAYS]);
        return $before;
    } catch (Throwable $e) {
        logError("pruneAuditLog: {$e->getMessage()}");
        return 0;
    }
}

function logFailedLogin(string $username): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $file = __DIR__ . '/../storage/logs/failed-logins.log';
    @file_put_contents($file, date('Y-m-d H:i:s') . " $ip $username\n", FILE_APPEND);
}