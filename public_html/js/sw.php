<?php
/**
 * Service Worker proxy — bypasses Hostinger hcdn CDN cache for sw.js
 * 
 * The CDN caches sw.js?v=13.0.2 with immutable + 1-year TTL and ignores
 * server file updates. PHP responses are NOT cached by the CDN (FilesMatch
 * .php → no-store, no-cache), so this proxy serves the current sw.js content
 * directly, bypassing the stale CDN cache.
 * 
 * Usage: register navigator.serviceWorker.register('sw.php?v=13.0.2', ...)
 */
$file = __DIR__ . '/sw.js';
if (!file_exists($file)) { http_response_code(404); exit; }

// Read and serve with correct headers
$content = file_get_contents($file);
$etag = '"' . md5($content) . '-' . filesize($file) . '";

// PHP responses are no-store (CDN won't cache), but browser can cache
header('Content-Type: application/javascript');
header('Content-Length: ' . strlen($content));
header('ETag: ' . $etag);
header('Cache-Control: public, max-age=604800, must-revalidate');
header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 604800) . ' GMT');

// Support conditional requests (304 Not Modified)
if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    exit;
}

echo $content;
