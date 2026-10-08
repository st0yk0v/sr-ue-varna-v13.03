<?php
/**
 * Service Worker proxy — bypasses Hostinger hcdn CDN cache for sw.js
 *
 * PHP responses are NOT cached by the CDN (FilesMatch .php → no-store),
 * so this proxy serves the current sw.js content directly.
 *
 * Usage: navigator.serviceWorker.register('sw.php?v=13.0.2&_n=...', ...)
 */
$file = __DIR__ . '/sw.js';
if (!file_exists($file)) { http_response_code(404); exit; }

$content = file_get_contents($file);
$size = strlen($content);
$md5 = md5($content);
$etag = '"' . $md5 . '-' . $size . '"';

header('Content-Type: application/javascript');
header('Content-Length: ' . $size);
header('ETag: ' . $etag);
header('Cache-Control: public, max-age=604800, must-revalidate');
header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 604800) . ' GMT');

if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
    http_response_code(304);
    exit;
}

echo $content;
