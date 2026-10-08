<?php
require_once __DIR__ . '/config.php';

echo "=== scientific_works author_email counts ===\n";
$r = dbFetchAll("SELECT author_email, COUNT(*) as cnt FROM scientific_works GROUP BY author_email ORDER BY cnt DESC");
echo json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";

echo "\n=== user_scientific_profile work_count vs actual ===\n";
$profiles = dbFetchAll("SELECT email, work_count FROM user_scientific_profile WHERE email <> ''");
foreach ($profiles as $p) {
    $actual = dbFetchAll("SELECT COUNT(*) as cnt FROM scientific_works WHERE author_email=?", [$p['email']]);
    echo $p['email'] . ": profile=" . $p['work_count'] . ", actual=" . ($actual[0]['cnt'] ?? 0) . "\n";
}