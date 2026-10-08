<?php
require_once __DIR__ . '/config.php';

echo "=== Data Mismatch Check ===\n\n";

// Check staff_orcid
$r = getDB()->query("SELECT email, orcid_id, full_name, work_count FROM staff_orcid");
echo "staff_orcid:\n";
foreach ($r->fetchAll(PDO::FETCH_ASSOC) as $row) {
    echo "  {$row['email']} | {$row['orcid_id']} | {$row['full_name']} | {$row['work_count']}w\n";
}

// Check user_scientific_profile
$r = getDB()->query("SELECT email, orcid, full_name, work_count FROM user_scientific_profile");
echo "\nuser_scientific_profile:\n";
foreach ($r->fetchAll(PDO::FETCH_ASSOC) as $row) {
    echo "  {$row['email']} | {$row['orcid']} | {$row['full_name']} | {$row['work_count']}w\n";
}

// Find mismatches
echo "\n=== Mismatches ===\n";
$r = getDB()->query("
    SELECT so.email, so.orcid_id as staff_orcid, usp.orcid as profile_orcid, 
           so.full_name as staff_name, usp.full_name as profile_name,
           so.work_count as staff_wc, usp.work_count as profile_wc
    FROM staff_orcid so 
    LEFT JOIN user_scientific_profile usp ON so.email = usp.email
    WHERE so.orcid_id != usp.orcid OR so.full_name != usp.full_name
");
$count = 0;
foreach ($r->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $count++;
    echo "  {$row['email']}: staff={$row['staff_orcid']} vs profile={$row['profile_orcid']}\n";
}
if ($count === 0) echo "  No mismatches found!\n";

// Profiles without staff_orcid
echo "\n=== Profiles without staff_orcid ===\n";
$r = getDB()->query("
    SELECT usp.email, usp.orcid, usp.full_name 
    FROM user_scientific_profile usp 
    LEFT JOIN staff_orcid so ON usp.email = so.email 
    WHERE so.email IS NULL AND usp.orcid IS NOT NULL
");
foreach ($r->fetchAll(PDO::FETCH_ASSOC) as $row) {
    echo "  {$row['email']}: orcid={$row['orcid']} name={$row['full_name']}\n";
}
