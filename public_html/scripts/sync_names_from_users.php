<?php
require_once __DIR__ . '/config.php';

echo "=== Syncing names from users table to user_scientific_profile ===\n\n";

// Get all users with names
$users = dbFetchAll("SELECT email, name FROM users WHERE email <> '' AND name <> ''");
echo "Users with names: " . count($users) . "\n";
echo json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n\n";

// Sync names to user_scientific_profile
foreach ($users as $u) {
    $email = $u['email'];
    $name = $u['name'];
    
    // Check if profile exists
    $existing = dbFetchOne("SELECT email, full_name FROM user_scientific_profile WHERE email = ?", [$email]);
    
    if ($existing) {
        if (empty($existing['full_name'])) {
            dbQuery("UPDATE user_scientific_profile SET full_name = ? WHERE email = ?", [$name, $email]);
            echo "Updated $email -> $name\n";
        } else {
            echo "Skipped $email (already has name: {$existing['full_name']})\n";
        }
    } else {
        // Create new profile
        dbQuery("INSERT INTO user_scientific_profile (email, full_name, created) VALUES (?, ?, NOW())", [$email, $name]);
        echo "Created profile for $email -> $name\n";
    }
}

echo "\n=== Verification ===\n";
$r = dbFetchAll("SELECT email, full_name, work_count, last_synced FROM user_scientific_profile WHERE email <> '' ORDER BY email");
echo json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";