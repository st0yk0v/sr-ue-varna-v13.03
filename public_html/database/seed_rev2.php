<?php
require __DIR__ . '/config.php';
$db = getDB();
$db->exec("INSERT INTO reviewers (id,email,name,competition,consent,status,created) VALUES ('rev001','yonko.yotov@unwe.bg','Yonko Yotov','','pending','active',NOW())");
echo "Reviewers: " . $db->query("SELECT COUNT(*) FROM reviewers")->fetchColumn() . "\n";
foreach ($db->query("SELECT id,email,name FROM reviewers") as $r) {
    echo "  {$r['id']} | {$r['email']} | {$r['name']}\n";
}
