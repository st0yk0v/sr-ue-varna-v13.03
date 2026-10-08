<?php
// ── PUBLIC CONFIG loader for webroot legacy api.php ──────────────────────────
// Loads database/.env or sibling .env so getenv()/putenv() resolve DB_*.
// Falls back to direct constants for Hostinger shared hosting where .env may
// live in public_html/.env or public/database/.env.
if (!defined('DB_HOST')) {
    $envCandidates = [
        __DIR__ . '/.env',
        __DIR__ . '/database/.env',
        dirname(__DIR__) . '/.env',
    ];
    foreach ($envCandidates as $candidate) {
        if (is_file($candidate) && is_readable($candidate)) {
            $lines = file($candidate, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($lines) {
                foreach ($lines as $line) {
                    if (strpos($line, '#') === 0) continue;
                    $parts = explode('=', $line, 2);
                    if (count($parts) === 2) {
                        $k = trim($parts[0]);
                        $v = trim($parts[1]);
                        if ($k !== '' && !isset($_ENV[$k]) && getenv($k) === false) {
                            putenv("$k=$v");
                            $_ENV[$k] = $v;
                            $_SERVER[$k] = $v;
                        }
                    }
                }
            }
            break;
        }
    }

    if (!defined('DB_HOST'))    define('DB_HOST',    getenv('DB_HOST')    ?: 'localhost');
    if (!defined('DB_PORT'))    define('DB_PORT',    getenv('DB_PORT')    ?: '3306');
    if (!defined('DB_NAME'))    define('DB_NAME',    getenv('DB_NAME')    ?: '');
    if (!defined('DB_USER'))    define('DB_USER',    getenv('DB_USER')    ?: '');
    if (!defined('DB_PASS'))    define('DB_PASS',    getenv('DB_PASS')    ?: '');
    if (!defined('DB_CHARSET')) define('DB_CHARSET', getenv('DB_CHARSET') ?: 'utf8mb4');
    if (!defined('DB_SSL'))     define('DB_SSL',     getenv('DB_SSL')     === '1');
    if (!defined('DB_SSL_CA'))  define('DB_SSL_CA',  getenv('DB_SSL_CA')  ?: '');
    if (!defined('DB_SSL_CERT'))define('DB_SSL_CERT',getenv('DB_SSL_CERT')?: '');
    if (!defined('DB_SSL_KEY')) define('DB_SSL_KEY', getenv('DB_SSL_KEY') ?: '');
    if (!defined('APP_ENV'))    define('APP_ENV',    getenv('APP_ENV')    ?: 'production');
    if (!defined('APP_DEBUG'))  define('APP_DEBUG',  getenv('APP_DEBUG')  === 'true' || getenv('APP_DEBUG') === '1');
}

// ── Load database/config.php which defines getDB(), dbFetchAll(), dbFetchOne(), etc. ──
// public/api.php requires only this config.php, but the DB functions live in
// database/config.php. Without this require, handlePing() calls getDB() which
// doesn't exist → fatal → caught by try/catch → db.healthy=false.
if (file_exists(__DIR__ . '/database/config.php')) {
    require_once __DIR__ . '/database/config.php';
}

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    PDO::ATTR_STRINGIFY_FETCHES  => false,
    PDO::ATTR_TIMEOUT            => 5,
];
if (defined('PDO::MYSQL_ATTR_CONNECT_TIMEOUT')) {
    $options[constant('PDO::MYSQL_ATTR_CONNECT_TIMEOUT')] = 5;
}
if (defined('PDO::MYSQL_ATTR_SSL_CA') && DB_SSL && DB_SSL_CA) {
    $options[PDO::MYSQL_ATTR_SSL_CA]   = DB_SSL_CA;
    $options[PDO::MYSQL_ATTR_SSL_CERT] = DB_SSL_CERT ?: null;
    $options[PDO::MYSQL_ATTR_SSL_KEY]  = DB_SSL_KEY ?: null;
}
$dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=%s',
    DB_HOST, DB_PORT, DB_NAME, DB_CHARSET
);
$lastErr = null;
for ($i = 0; $i < 3; $i++) {
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        break;
    } catch (PDOException $e) {
        $lastErr = $e;
        if ($i < 2) usleep(150000 * ($i + 1));
    }
}
if ($pdo === null) {
    if ($lastErr) {
        // Sanitize: never expose DB credentials or host in error messages.
        // Log the real error server-side only.
        error_log('[UEV-ERP] DB connection failed: ' . $lastErr->getMessage());
        throw new RuntimeException('Неуспешна връзка с базата данни. Моля, проверете конфигурацията.');
    }
    throw new RuntimeException('Неуспешна връзка с базата данни (retry изчерпан).');
}
try {
    $pdo->exec("SET SESSION sql_mode='STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'");
    $pdo->exec('SET SESSION wait_timeout=28800');
    $pdo->exec('SET SESSION interactive_timeout=28800');
    $pdo->exec('SET SESSION net_read_timeout=30');
    $pdo->exec('SET SESSION net_write_timeout=30');
} catch (\Throwable $_) {}

// ── Version stamp (must match version.json, __ERP_BUILD, sw.js BUILD, index.html ?v=) ──
if (!defined('APP_VERSION')) {
    define('APP_VERSION', '13.01.0');
}

// Return PDO instance for direct inclusion (legacy api.php pattern)
return $pdo;