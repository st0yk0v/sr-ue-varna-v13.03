<?php
require __DIR__ . '/config.php';
$db = getDB();
// Add a test reviewer with a real ORCID
$stmt = $db->prepare("INSERT IGNORE INTO reviewers (id, email, name, competition, consent, status, created) VALUES (?, ?, ?, ?, ?, ?, NOW())");
$stmt->execute(['rev_test_001', 'test.reviewer@unwe.bg', 'Test Reviewer', '', 'pending', 'active']);
echo "Reviewers: " . $db->query("SELECT COUNT(*) FROM reviewers")->fetchColumn() . "\n";
foreach ($db->query("SELECT id, email, name FROM reviewers LIMIT 5") as $r) {
    echo "  {$r['id']} | {$r['email']} | {$r['name']}\n";
}
