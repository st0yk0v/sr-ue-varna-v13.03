<?php
require_once __DIR__ . '/config.php';

$r = dbFetchAll("SELECT email, full_name, orcid FROM user_scientific_profile WHERE email <> ''");
echo json_encode($r, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);