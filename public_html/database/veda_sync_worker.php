#!/usr/bin/env php
<?php
/**
 * VEDA Sync Worker — auto-syncs scientific papers for staff members
 * Runs via cron every 5 minutes
 * 
 * Usage:
 *   php veda_sync_worker.php                   # sync all stale profiles
 *   php veda_sync_worker.php --email=x@y.z     # sync specific email
 *   php veda_sync_worker.php --max=10          # limit to N syncs
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/veda_handlers.php';

$email = null;
$max = 50;
foreach ($argv ?? [] as $arg) {
    if (preg_match('/^--email=(.+)$/i', $arg, $m)) $email = strtolower(trim($m[1]));
    if (preg_match('/^--max=(\d+)$/', $arg, $m)) $max = (int)$m[1];
}

$now = date('c');
$synced = 0;
$errors = [];

if ($email) {
    // Sync specific email
    echo "[$now] Syncing: $email\n";
    $result = handleVedaAutoSync(['email' => $email, 'name' => '']);
    if ($result['success']) {
        $d = $result['data'];
        echo "  ORCID: " . ($d['orcid'] ?: 'not found') . "\n";
        echo "  Publications: {$d['count']}, Stored: {$d['stored']}\n";
        $synced++;
    } else {
        $errors[] = "$email: " . ($result['error'] ?? 'unknown');
    }
} else {
    // Find stale profiles (not synced in last 24h)
    $stale = dbFetchAll(
        "SELECT email, full_name, orcid FROM user_scientific_profile 
         WHERE last_synced < DATE_SUB(NOW(), INTERVAL 24 HOUR) 
         OR last_synced IS NULL 
         ORDER BY last_synced ASC LIMIT ?",
        [$max]
    );
    
    if (empty($stale)) {
        echo "[$now] No stale profiles to sync.\n";
        exit(0);
    }
    
    echo "[$now] Syncing " . count($stale) . " stale profiles...\n";
    
    foreach ($stale as $profile) {
        $em = $profile['email'];
        $nm = $profile['full_name'] ?? '';
        echo "  Syncing: $em";
        
        $result = handleVedaAutoSync(['email' => $em, 'name' => $nm]);
        
        if ($result['success']) {
            $d = $result['data'];
            echo " → ORCID: " . ($d['orcid'] ?: 'N/A') . ", Pubs: {$d['count']}, New: {$d['stored']}\n";
            $synced++;
        } else {
            echo " → ERROR: " . ($result['error'] ?? 'unknown') . "\n";
            $errors[] = "$em: " . ($result['error'] ?? 'unknown');
        }
        
        // Rate limit: 1.2s between syncs
        usleep(1200000);
    }
}

echo "\n[$now] Done. Synced: $synced, Errors: " . count($errors) . "\n";
if (!empty($errors)) {
    echo "Errors:\n  - " . implode("\n  - ", $errors) . "\n";
}
