<?php
require_once __DIR__ . '/config.php';
header('Content-Type: application/json');

try {
    $db = getDB();
    
    // Check all relevant tables
    $tables = [];
    
    // reviewers table
    $r = @dbFetchAll('SELECT * FROM reviewers LIMIT 5');
    $tables['reviewers_sample'] = $r;
    $tables['reviewers_count'] = (int)(@dbFetchOne('SELECT COUNT(*) as c FROM reviewers')['c'] ?? 0);
    
    // user_scientific_profile table
    $p = @dbFetchAll('SELECT email, full_name, orcid, work_count, last_synced FROM user_scientific_profile LIMIT 10');
    $tables['profiles_sample'] = $p;
    $tables['profiles_count'] = (int)(@dbFetchOne('SELECT COUNT(*) as c FROM user_scientific_profile')['c'] ?? 0);
    
    // scientific_works table
    $w = @dbFetchAll('SELECT author_email, COUNT(*) as cnt FROM scientific_works GROUP BY author_email LIMIT 10');
    $tables['works_by_email'] = $w;
    $tables['works_count'] = (int)(@dbFetchOne('SELECT COUNT(*) as c FROM scientific_works')['c'] ?? 0);
    
    echo json_encode($tables, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    
} catch (Exception $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
