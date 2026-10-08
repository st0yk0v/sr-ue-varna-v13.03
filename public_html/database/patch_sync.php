<?php
$f = "/home/u129919172/domains/sr-ue-varna.com/public_html/database/open_publications.php";
$c = file_get_contents($f);

$search = "    // Get all reviewers\n    \$reviewers = @dbFetchAll(\"SELECT email, name FROM reviewers WHERE is_active = 1\") ?: [];\n    if (empty(\$reviewers)) {\n        return ['success' => true, 'synced' => 0, 'total' => 0, 'message' => 'No active reviewers found'];\n    }";

$replace = "    // Get all reviewers from user_scientific_profile\n    \$reviewers = @dbFetchAll(\"SELECT email, full_name as name FROM user_scientific_profile WHERE email <> ''\") ?: [];\n    if (empty(\$reviewers)) {\n        return ['success' => true, 'synced' => 0, 'total' => 0, 'message' => 'No active reviewers found'];\n    }";

if (strpos($c, $search) !== false) {
    $c = str_replace($search, $replace, $c);
    file_put_contents($f, $c);
    echo "Patched: OK\n";
} else {
    echo "Search string not found\n";
}
