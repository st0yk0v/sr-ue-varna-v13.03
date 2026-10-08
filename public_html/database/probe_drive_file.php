<?php
/**
 * probe_drive_file.php — pure, bootstrap-free Drive-file existence probe.
 *
 * Extracted from database/api.php (handleDriveFileMeta / dead-page fix, 12.49.90)
 * so it can be unit-tested without loading the api.php HTTP bootstrap. Single
 * source of truth: api.php requires this file; tests require it directly.
 *
 * v12.49.89-deadpagefix: A trashed/deleted Drive file renders Google's own
 * cross-origin "file deleted" dead page inside the preview iframe — JS can
 * never read/intercept it (no onError, no CSP violation, load fires "ok").
 * The authoritative trashed check lives in GAS (DriveApp.isTrashed()), but the
 * live GAS driveFileMeta handler is unreliable (occasionally throws →
 * "Invalid JSON response"), so we probe Google server-side instead: a
 * non-existent / trashed file returns HTTP 404 on its /preview URL (verified),
 * while a live file returns 200* (200 or a redirect resolving to 200). This runs
 * from PHP/Hostinger (no Drive API needed). Timeout-bounded so a slow Google
 * response never stalls the request.
 *
 * @param string $driveId
 * @return bool|null  true=exists, false=deleted/missing, null=probe failed (treat as exists)
 */
function probeDriveFileExists(string $driveId): ?bool {
    if (!preg_match('/^[A-Za-z0-9_-]{25,}$/', $driveId)) return null;
    $url = 'https://drive.google.com/file/d/' . $driveId . '/preview';
    $ctx = stream_context_create([
        'http' => [
            'method'          => 'GET',
            'header'          => "User-Agent: UEV-ERP-HealthCheck/1.0\r\n",
            'timeout'         => 6,
            'ignore_errors'   => true,
            'follow_location' => true,
            'max_redirects'   => 3,
        ],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $hdrs = @get_headers($url, 1, $ctx);
    if ($hdrs === false) return null; // probe failed → don't hide a possibly-fine file
    $status = 0;
    // get_headers() puts the status line at index 0, or named "0" if redirects merged
    $statusLine = is_array($hdrs) ? ($hdrs[0] ?? reset($hdrs)) : '';
    if (is_array($statusLine)) $statusLine = $statusLine[0] ?? '';
    if (preg_match('#HTTP/\S+\s+(\d{3})#i', (string)$statusLine, $m)) $status = (int)$m[1];
    // 404 = file gone (deleted/trashed/missing). 200/3xx = live. Anything else = inconclusive.
    if ($status === 404) return false;
    if ($status >= 200 && $status < 400) return true;
    return null;
}
