<?php
require_once __DIR__ . '/config.php';

$tables = ['participants', 'reviewers', 'user_scientific_profile', 'scientific_works'];

foreach ($tables as $t) {
    echo "=== $t ===\n";
    try {
        $r = dbFetchAll("SELECT * FROM $t WHERE email <> '' ORDER BY email");
        echo json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
    } catch (Throwable $e) {
        echo "Error: " . $e->getMessage() . "\n";
    }
    echo "\n";
}