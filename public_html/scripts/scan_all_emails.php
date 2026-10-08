<?php
require_once __DIR__ . '/config.php';

echo "=== Scanning all emails across all tables ===\n\n";

$tables = [
    'users' => "SELECT email, name FROM users WHERE email <> ''",
    'reviewers' => "SELECT email, name, competition FROM reviewers WHERE email <> ''",
    'user_scientific_profile' => "SELECT email, full_name, orcid, work_count, last_synced FROM user_scientific_profile WHERE email <> ''",
    'scientific_works' => "SELECT author_email as email, title, source, year FROM scientific_works WHERE author_email <> ''",
];

$allEmails = [];

foreach ($tables as $table => $sql) {
    echo "=== $table ===\n";
    try {
        $r = dbFetchAll($sql);
        if ($r) {
            echo json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
            foreach ($r as $row) {
                $email = $row['email'] ?? '';
                if ($email && !isset($allEmails[$email])) {
                    $allEmails[$email] = [
                        'email' => $email,
                        'sources' => [],
                        'details' => [],
                    ];
                }
                if ($email) {
                    $allEmails[$email]['sources'][] = $table;
                    $allEmails[$email]['details'][] = $row;
                }
            }
        } else {
            echo "No rows\n";
        }
    } catch (Throwable $e) {
        echo "Error: " . $e->getMessage() . "\n";
    }
    echo "\n";
}

echo "=== UNIQUE EMAILS ===\n";
echo json_encode(array_values($allEmails), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";