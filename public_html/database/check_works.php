<?php
require_once __DIR__ . '/config.php';

echo "=== scientific_works count ===\n";
$r = dbFetchAll("SELECT COUNT(*) as cnt FROM scientific_works");
echo json_encode($r) . "\n";

echo "\n=== Per-email counts ===\n";
$r = dbFetchAll("SELECT author_email, COUNT(*) as cnt FROM scientific_works GROUP BY author_email ORDER BY cnt DESC");
echo json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";

echo "\n=== Sample works ===\n";
$r = dbFetchAll("SELECT id, author_email, title, source, year FROM scientific_works ORDER BY id DESC LIMIT 10");
echo json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";