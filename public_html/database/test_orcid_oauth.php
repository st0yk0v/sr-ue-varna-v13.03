<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/orcid_oauth.php';

echo "=== ORCID OAuth Live Test ===\n\n";

// Test 1: Load config
$config = _orcidOAuthConfig();
echo "Config loaded: " . (empty($config['client_id']) ? 'NOT CONFIGURED' : 'OK') . "\n";

// Test 2: Auth URL generation
$result = handleGetOrcIDAuthUrl([]);
echo "Auth URL: " . ($result['success'] ? 'Generated' : $result['error']) . "\n";

// Test 3: Get status for admin
$result = handleGetOrcIDStatus(['email' => 'admin@ue-varna.bg']);
echo "Status check: " . ($result['success'] ? 'OK' : $result['error']) . "\n";

echo "\n=== Done ===\n";