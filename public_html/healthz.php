<?php
/**
 * T77: Staging health check endpoint.
 * Returns JSON health status for Docker HEALTHCHECK and monitoring.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$health = [
    'status'    => 'ok',
    'env'       => 'staging',
    'version'   => 'unknown',
    'timestamp' => date('c'),
    'checks'    => [],
];

// Version
$vf = __DIR__ . '/version.json';
if (file_exists($vf)) {
    $v = json_decode(file_get_contents($vf), true);
    $health['version'] = $v['version'] ?? 'unknown';
}

// DB connectivity
try {
    require_once __DIR__ . '/database/config.php';
    $db = getDB();
    $db->query('SELECT 1');
    $health['checks']['db'] = 'ok';
} catch (Throwable $e) {
    $health['checks']['db'] = 'fail: ' . $e->getMessage();
    $health['status'] = 'degraded';
}

// OPcache
$health['checks']['opcache'] = function_exists('opcache_get_status') ? 'available' : 'unavailable';

// Session table
try {
    $db->query('SELECT 1 FROM sessions LIMIT 1');
    $health['checks']['sessions_table'] = 'ok';
} catch (Throwable $e) {
    $health['checks']['sessions_table'] = 'missing';
}

$code = $health['status'] === 'ok' ? 200 : 503;
http_response_code($code);
echo json_encode($health, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
