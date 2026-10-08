#!/usr/bin/env php
/**
 * CLI runner for syncallopenpublications — bypasses HTTP timeout
 * Usage: php sync_open_pubs_cli.php <admin_email>
 */
<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('max_execution_time', 300);
set_time_limit(300);

if (php_sapi_name() !== 'cli') {
    die("CLI only\n");
}

$authEmail = $argv[1] ?? '';
if (!$authEmail) {
    die("Usage: php sync_open_pubs_cli.php <admin_email>\n");
}

require_once __DIR__ . '/../database/config.php';
require_once __DIR__ . '/../database/open_publications.php';

echo "Starting sync for all reviewers...\n";
echo "Auth: $authEmail\n\n";

$result = handleSyncAllOpenPublications([
    'authEmail' => $authEmail,
]);

echo "Result:\n";
echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
