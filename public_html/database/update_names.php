<?php
require_once __DIR__ . '/config.php';

echo "Connected to DB: " . DB_NAME . "\n";

$names = [
    'bistravas@ue-varna.bg' => 'Bistra Vasileva',
    'yonistoykov@ue-varna.bg' => 'Yonko Stoykov',
    '107477@students.ue-varna.bg' => '',
    'test@test.bg' => '',
    'test@ue-varna.bg' => '',
];

foreach ($names as $email => $name) {
    if ($name === '') continue;
    try {
        $st = dbQuery("UPDATE user_scientific_profile SET full_name = ? WHERE email = ?", [$name, $email]);
        echo "Updated $email -> $name: OK\n";
    } catch (Throwable $e) {
        echo "Error updating $email: " . $e->getMessage() . "\n";
    }
}

echo "\nVerification:\n";
try {
    $r = dbFetchAll("SELECT email, full_name FROM user_scientific_profile WHERE email <> ''");
    echo json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n";
}