#!/usr/bin/env php
<?php
/**
 * Staff Publications Sync CLI — crawls ORCID/Scopus for all staff members.
 * Usage: php /path/to/sync_all_staff.php
 * 
 * Runs outside the API dispatch layer (no web request needed).
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(0); // No time limit for long sync

// Load only what we need — NOT api.php (which expects a web request)
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/veda_handlers.php';

echo "========================================\n";
echo "  UEV-ERP Staff Publications Sync\n";
echo "  " . date('Y-m-d H:i:s') . "\n";
echo "========================================\n\n";

// Get all staff members with ORCID
$staff = dbFetchAll('SELECT email, full_name, orcid FROM user_scientific_profile WHERE email <> "" ORDER BY email ASC');

echo "Found " . count($staff) . " staff members\n\n";

$totalSynced = 0;
$totalNewWorks = 0;
$skipped = [];
$errors = [];

foreach ($staff as $i => $member) {
    $num = $i + 1;
    $email = $member['email'];
    $name = $member['full_name'];
    $orcid = $member['orcid'];
    
    echo "[$num/" . count($staff) . "] $name ($email)\n";
    
    if (empty($orcid)) {
        echo "    SKIP: No ORCID iD\n";
        $skipped[] = "$email (no ORCID)";
        continue;
    }
    
    // Call the sync handler directly (bypasses API dispatch)
    $result = handleVedaAutoSync([
        'email' => $email,
        'name'  => $name,
        'orcid' => $orcid,
    ]);
    
    if ($result['success']) {
        $d = $result['data'];
        $count = $d['count'] ?? 0;
        $stored = $d['stored'] ?? 0;
        $orcidOk = $d['orcidOk'] ? 'YES' : 'NO';
        $needsConfig = $d['needs_config'] ? ' [Scopus needs API key]' : '';
        echo "    ORCID: $orcid (resolved: $orcidOk)\n";
        echo "    Publications found: $count | New stored: $stored$needsConfig\n";
        $totalSynced++;
        $totalNewWorks += $stored;
    } else {
        $err = $result['error'] ?? 'unknown';
        echo "    ERROR: $err\n";
        $errors[] = "$email: $err";
    }
    
    // Rate limit: ORCID public API = 1 req/sec
    // Scopus has daily quota, so be gentle
    if ($num < count($staff)) {
        echo "    Waiting 1.2s (rate limit)...\n";
        usleep(1200000);
    }
    echo "\n";
}

// Final summary
echo "========================================\n";
echo "  SYNC COMPLETE\n";
echo "========================================\n";
echo "Members processed: " . count($staff) . "\n";
echo "Successfully synced: $totalSynced\n";
echo "Total new works stored: $totalNewWorks\n";
echo "Skipped (no ORCID): " . count($skipped) . "\n";
echo "Errors: " . count($errors) . "\n";

if (!empty($errors)) {
    echo "\n--- ERRORS ---\n";
    foreach ($errors as $e) echo "  - $e\n";
}

// Final DB state
echo "\n--- FINAL STATE ---\n";
$final = dbFetchAll('SELECT email, work_count, last_synced FROM user_scientific_profile ORDER BY work_count DESC');
foreach ($final as $row) {
    echo "  " . str_pad($row['email'], 35) . " | works=" . str_pad($row['work_count'] ?? 0, 4) . " | synced=" . ($row['last_synced'] ?? 'never') . "\n";
}

echo "\nDone at " . date('Y-m-d H:i:s') . "\n";
