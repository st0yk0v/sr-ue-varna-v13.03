<?php
/**
 * T80: Health Check Endpoint for UEV-ERP
 * Standalone health check file — accessible at /health.php
 * Returns JSON with system status for load balancers, K8s probes, monitoring.
 *
 * Usage:
 *   curl https://sr-ue-varna.com/health.php
 *   curl https://sr-ue-varna.com/health.php?full  (includes system metrics)
 *
 * Response codes:
 *   200: healthy or degraded (still serving)
 *   503: unhealthy (DB down, critical failures)
 */

// Minimal bootstrap — don't pull in the full api.php stack
$envFile = __DIR__ . '/database/.env';
if (file_exists($envFile)) {
    $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $key = trim($parts[0]);
            $val = trim($parts[1]);
            if (!isset($_ENV[$key]) && getenv($key) === false) {
                putenv("$key=$val");
                $_ENV[$key] = $val;
            }
        }
    }
}

define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_NAME', getenv('DB_NAME') ?: '');
define('DB_USER', getenv('DB_USER') ?: '');
define('DB_PASS', getenv('DB_PASS') ?: '');
define('DB_CHARSET', getenv('DB_CHARSET') ?: 'utf8mb4');
define('APP_VERSION', '13.01.0');

$isFull = isset($_GET['full']) || (($_GET['detail'] ?? '') === 'full');
$checks = [];
$overallStatus = 'healthy';

// ── Database check ────────────────────────────────────────────────────────────
$dbOk = false;
$dbLatency = 0;
$dbError = '';
try {
    $start = microtime(true);
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', DB_HOST, DB_PORT, DB_NAME, DB_CHARSET);
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->query('SELECT 1');
    $dbLatency = round((microtime(true) - $start) * 1000);
    $dbOk = true;
} catch (Throwable $e) {
    $dbError = $e->getMessage();
}
$checks['database'] = [
    'status' => $dbOk ? 'ok' : 'fail',
    'latency_ms' => $dbLatency,
    'host' => DB_HOST,
];
if (!$dbOk) {
    $overallStatus = 'unhealthy';
} elseif ($dbLatency > 500) {
    $overallStatus = 'degraded';
}

// ── Disk space check ──────────────────────────────────────────────────────────
$diskFree = @disk_free_space(__DIR__);
$diskTotal = @disk_total_space(__DIR__);
if ($diskTotal > 0) {
    $diskPct = round((1 - $diskFree / $diskTotal) * 100, 1);
    $diskStatus = $diskPct < 85 ? 'ok' : ($diskPct < 95 ? 'warning' : 'critical');
    $checks['disk'] = [
        'status' => $diskStatus,
        'percent_used' => $diskPct,
        'free_bytes' => $diskFree,
    ];
    if ($diskStatus === 'critical') {
        $overallStatus = 'degraded';
    }
}

// ── PHP memory check ──────────────────────────────────────────────────────────
$memUsage = memory_get_usage(true);
$memLimit = ini_get('memory_limit');
$memLimitBytes = return_bytes($memLimit);
if ($memLimitBytes > 0) {
    $memPct = round($memUsage / $memLimitBytes * 100, 1);
    $checks['memory'] = [
        'status' => $memPct < 80 ? 'ok' : ($memPct < 95 ? 'warning' : 'critical'),
        'usage_bytes' => $memUsage,
        'limit_bytes' => $memLimitBytes,
        'percent' => $memPct,
    ];
}

// ── Full detail: system metrics (Linux only) ──────────────────────────────────
if ($isFull && PHP_OS_FAMILY === 'Linux') {
    $cpuLoad = 0;
    if (@file_exists('/proc/loadavg')) {
        $la = @file_get_contents('/proc/loadavg');
        if ($la && preg_match('/(\d+\.\d+)/', $la, $m)) {
            $cpuLoad = floatval($m[1]);
        }
    }
    $checks['system'] = [
        'cpu_load' => $cpuLoad,
        'php_version' => PHP_VERSION,
        'os' => PHP_OS,
        'sapi' => PHP_SAPI,
    ];
}

// ── Build response ────────────────────────────────────────────────────────────
$response = [
    'status' => $overallStatus,
    'version' => APP_VERSION,
    'timestamp' => time(),
    'server_time' => date('c'),
    'checks' => $checks,
];

$httpCode = ($overallStatus === 'unhealthy') ? 503 : 200;
http_response_code($httpCode);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

/**
 * Parse PHP ini byte notation (128M, 1G, etc.) to bytes.
 */
function return_bytes(string $val): int {
    $val = trim($val);
    if ($val === '-1' || $val === '') return 0;
    $last = strtolower($val[strlen($val) - 1]);
    $num = (int) $val;
    switch ($last) {
        case 'g': $num *= 1024;
        case 'm': $num *= 1024;
        case 'k': $num *= 1024;
    }
    return $num;
}
