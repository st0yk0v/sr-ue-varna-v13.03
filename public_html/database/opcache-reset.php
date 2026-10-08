<?php
/**
 * OPcache reset endpoint (FPM SAPI).
 *
 * The SSH-based `opcache_reset()` in the deploy script cannot run in this
 * environment (port 65002 is blocked), so FPM OPcache keeps serving stale
 * PHP. opcache_reset() alone only clears the calling worker's shared cache,
 * which is unreliable across the FPM worker pool. This endpoint instead
 * INVALIDATES every database/*.php file explicitly via opcache_invalidate(),
 * which forces recompilation on the next request for ALL workers.
 */
$token = getenv('OPCACHE_RESET_TOKEN') ?: 'uev-oplocal-47';
if (($token === '') || ($_GET['token'] ?? '') !== $token) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'forbidden']);
    exit;
}
$results = ['reset' => false, 'invalidated' => []];
if (function_exists('opcache_reset')) {
    $results['reset'] = opcache_reset();
}
if (function_exists('opcache_invalidate')) {
    foreach (glob(__DIR__ . '/*.php') as $f) {
        // force=true: invalidate even if validate_timestamps is off
        if (opcache_invalidate($f, true)) {
            $results['invalidated'][] = basename($f);
        }
    }
}
header('Content-Type: application/json');
echo json_encode($results);
exit;
