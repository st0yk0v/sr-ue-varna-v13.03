<?php
$f = "/home/u129919172/domains/sr-ue-varna.com/public_html/database/action_map.php";
$c = file_get_contents($f);
$search = "    'rollback'=>'handleRollback',\n];";
$replace = "    'rollback'=>'handleRollback',\n    // Open-Source Publications Aggregator\n    'fetchopenpublications'=>'handleFetchOpenPublications',\n    'syncallopenpublications'=>'handleSyncAllOpenPublications',\n];";
$c = str_replace($search, $replace, $c);
file_put_contents($f, $c);
echo "Patched: " . (strpos($c, "fetchopenpublications") !== false ? "OK" : "FAIL") . "\n";
