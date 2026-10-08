<?php
/**
 * CLI: Configure ORCID API Client
 * Usage: php configure_orcid_client.php
 * 
 * Interactive script to set up ORCID OAuth credentials.
 * Can also be used non-interactively with arguments:
 *   php configure_orcid_client.php --client-id=APP-XXXX --client-secret=XXXX [--sandbox]
 */

require_once __DIR__ . '/config.php';

echo "=== ORCID API Client Configuration ===\n\n";

// Parse arguments
$options = getopt('', ['client-id:', 'client-secret:', 'sandbox', 'help']);

if (isset($options['help'])) {
    echo "Usage:\n";
    echo "  php configure_orcid_client.php\n";
    echo "  php configure_orcid_client.php --client-id=APP-XXXX --client-secret=XXXX [--sandbox]\n\n";
    echo "Options:\n";
    echo "  --client-id       ORCID OAuth Client ID\n";
    echo "  --client-secret   ORCID OAuth Client Secret\n";
    echo "  --sandbox         Use ORCID sandbox (for testing)\n";
    echo "  --help            Show this help\n\n";
    echo "To register an ORCID API client:\n";
    echo "  1. Go to https://orcid.org/developer-tools (or https://sandbox.orcid.org/developer-tools)\n";
    echo "  2. Click 'Register for the ORCID Public API'\n";
    echo "  3. Fill in: Name = 'UEV-ERP Scientific Publications'\n";
    echo "  4. Redirect URI = https://sr-ue-varna.com/database/api.php?action=orcid_callback\n";
    echo "  5. Copy Client ID and Client Secret\n\n";
    exit(0);
}

// Get current config
$configFile = __DIR__ . '/veda_config.json';
$currentConfig = [];
if (file_exists($configFile)) {
    $currentConfig = json_decode(file_get_contents($configFile), true) ?: [];
}

$clientId = $options['client-id'] ?? null;
$clientSecret = $options['client-secret'] ?? null;
$sandbox = isset($options['sandbox']);

// Interactive mode
if ($clientId === null) {
    echo "Current configuration:\n";
    echo "  Client ID: " . (!empty($currentConfig['orcidClientId']) ? 'SET (' . substr($currentConfig['orcidClientId'], 0, 8) . '...)' : 'NOT SET') . "\n";
    echo "  Client Secret: " . (!empty($currentConfig['orcidClientSecret']) ? 'SET' : 'NOT SET') . "\n";
    echo "  Sandbox: " . (!empty($currentConfig['orcidSandbox']) ? 'YES' : 'NO') . "\n\n";

    echo "Register an ORCID API client at:\n";
    echo "  https://orcid.org/developer-tools\n\n";
    echo "Use these settings:\n";
    echo "  Application name: UEV-ERP Scientific Publications\n";
    echo "  Redirect URI: https://sr-ue-varna.com/database/api.php?action=orcid_callback\n\n";

    echo "Enter Client ID (or press Enter to skip): ";
    $clientId = trim(fgets(STDIN));
    
    if ($clientId !== '') {
        echo "Enter Client Secret: ";
        $clientSecret = trim(fgets(STDIN));
        
        echo "Use sandbox mode? (y/N): ";
        $sandbox = strtolower(trim(fgets(STDIN))) === 'y';
    }
}

if ($clientId === null || $clientId === '') {
    echo "\nNo changes made.\n";
    exit(0);
}

// Update config
$currentConfig['orcidClientId'] = $clientId;
if ($clientSecret !== null && $clientSecret !== '') {
    $currentConfig['orcidClientSecret'] = $clientSecret;
}
$currentConfig['orcidSandbox'] = $sandbox ? '1' : '';
$currentConfig['orcidRedirectUri'] = 'https://sr-ue-varna.com/database/api.php?action=orcid_callback';

// Save config
$json = json_encode($currentConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
if (file_put_contents($configFile, $json) === false) {
    echo "ERROR: Failed to save configuration.\n";
    exit(1);
}

echo "\n=== Configuration Saved ===\n";
echo "  Client ID: $clientId\n";
echo "  Client Secret: " . ($clientSecret ? 'SET' : 'NOT SET') . "\n";
echo "  Sandbox: " . ($sandbox ? 'YES' : 'NO') . "\n";
echo "  Redirect URI: " . $currentConfig['orcidRedirectUri'] . "\n\n";

echo "Test the connection with:\n";
echo "  php -r 'require \"orcid_oauth.php\"; print_r(handleGetOrcIDAuthUrl([]));'\n\n";

echo "Done!\n";