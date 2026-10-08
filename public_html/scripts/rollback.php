<?php
/**
 * T78: Web-accessible rollback endpoint (admin-authenticated).
 *
 * Accepts a version parameter, validates admin session, triggers rollback
 * by restoring files from the backup directory on the server, and returns
 * JSON status. This is the HTTP wrapper around scripts/rollback.sh.
 *
 * Usage: POST scripts/rollback.php
 *   Content-Type: application/json
 *   Body: {"version":"12.51.1"}
 *
 * Response: {"success":true,"version":"12.51.1","message":"..."}
 *           {"success":false,"error":"..."}
 */

// Bootstrap: load the same config and helpers as api.php
define('UEV_ERP_BOOTSTRAPPED', true);

$dir = __DIR__ . '/../database/';
require_once $dir . 'config.php';
require_once $dir . 'helpers.php';
require_once $dir . 'action_map.php';

header('Content-Type: application/json; charset=utf-8');

// ── Read input ──────────────────────────────────────────────────────────────
$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) $body = $_POST;

$version = trim($body['version'] ?? '');

// ── Validate admin session ──────────────────────────────────────────────────
$adminEmail = '';
if (isset($_COOKIE['uev_admin'])) {
    $adminEmail = strtolower(trim($_COOKIE['uev_admin']));
} elseif (isset($_SESSION['admin_email'])) {
    $adminEmail = strtolower(trim($_SESSION['admin_email']));
}

if ($adminEmail === '') {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Неоторизиран достп. Моля, влезте като администратор.']);
    exit(1);
}

// Verify admin via isAdminUser helper (from config.php)
if (!function_exists('isAdminUser') || !isAdminUser($adminEmail)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Администраторски права са необходими.']);
    exit(1);
}

// ── Validate version parameter ─────────────────────────────────────────────
if ($version === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Липсва параметър "version".']);
    exit(1);
}

// Sanitize version string: only digits, dots, dashes
if (!preg_match('/^[\d.\-a-zA-Z]+$/', $version)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Невалидна версия: разрешени са само цифри, точки и тирета.']);
    exit(1);
}

// ── Check backup exists on server ───────────────────────────────────────────
$backupBase = '/home/u129919172/backups/uev-erp';
$backupPath = $backupBase . '/' . $version;

// Use SSH to verify backup exists (same credentials as deploy)
$sshPass = getenv('SSH_PASS') ?: getenv('K9SSH_PASS') ?: '';
$host = '92.113.18.239';
$port = '65002';
$user = 'u129919172';

if ($sshPass === '') {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'SSH_PASS липсва в средата.']);
    exit(1);
}

// Verify backup directory exists
$checkCmd = sprintf(
    'sshpass -p %s ssh -o StrictHostKeyChecking=no -p %s %s@%s %s',
    escapeshellarg($sshPass),
    escapeshellarg($port),
    escapeshellarg($user),
    escapeshellarg($host),
    escapeshellarg('[ -d ' . escapeshellarg($backupPath) . ' ] && echo EXISTS || echo MISSING')
);
$backupStatus = trim(shell_exec($checkCmd) ?: 'MISSING');

if ($backupStatus !== 'EXISTS') {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Архивът за версия ' . $version . ' не е намерен на сървъра.']);
    exit(1);
}

// ── Trigger rollback ────────────────────────────────────────────────────────
// Pre-rollback backup first
$timestamp = date('Ymd_His');
$preRollbackCmd = sprintf(
    'sshpass -p %s ssh -o StrictHostKeyChecking=no -p %s %s@%s %s',
    escapeshellarg($sshPass),
    escapeshellarg($port),
    escapeshellarg($user),
    escapeshellarg($host),
    escapeshellarg(sprintf(
        'mkdir -p %s/pre-rollback-%s && cd /home/%s/domains/sr-ue-varna.com/public_html && find . -maxdepth 2 -type f \\( -name \'*.php\' -o -name \'*.js\' -o -name \'*.css\' -o -name \'*.json\' -o -name \'*.html\' \\) -exec cp --parents {} %s/pre-rollback-%s/ \\;',
        escapeshellarg($backupBase),
        $timestamp,
        $user,
        escapeshellarg($backupBase),
        $timestamp
    ))
);
@shell_exec($preRollbackCmd);

// Restore from backup
$deployPath = '/home/' . $user . '/domains/sr-ue-varna.com/public_html';
$restoreCmd = sprintf(
    'sshpass -p %s rsync -avz --delete -e %s %s@%s:%s/ %s/ 2>&1 | tail -5',
    escapeshellarg($sshPass),
    escapeshellarg('ssh -p ' . $port . ' -o StrictHostKeyChecking=no'),
    escapeshellarg($user),
    escapeshellarg($host),
    escapeshellarg($backupPath),
    escapeshellarg($deployPath)
);
$restoreOutput = [];
$restoreCode = 0;
exec($restoreCmd, $restoreOutput, $restoreCode);

// Clear OPcache post-restore
$opcacheCmd = sprintf(
    'sshpass -p %s ssh -o StrictHostKeyChecking=no -p %s %s@%s %s',
    escapeshellarg($sshPass),
    escapeshellarg($port),
    escapeshellarg($user),
    escapeshellarg($host),
    escapeshellarg('php -r \'if(function_exists("opcache_reset"))opcache_reset();\' 2>/dev/null')
);
@shell_exec($opcacheCmd);

// ── Return result ───────────────────────────────────────────────────────────
if ($restoreCode === 0) {
    echo json_encode([
        'success'    => true,
        'version'    => $version,
        'message'   => 'Връщането към версия ' . $version . ' е успешно.',
        'preRollbackBackup' => 'pre-rollback-' . $timestamp,
        'restoredBy' => $adminEmail,
        'timestamp'  => date('c'),
    ]);
    exit(0);
} else {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Грешка при връщане към версия ' . $version . '. Код: ' . $restoreCode,
        'output'  => implode("\n", $restoreOutput),
    ]);
    exit(1);
}
