<?php
/**
 * ORCID OAuth Callback Handler
 * This page receives the ORCID callback, exchanges the code, and posts the result to the parent window.
 */

// Bootstrap the API
require_once __DIR__ . '/api.php';

// Handle the callback
$code = $_GET['code'] ?? '';
$state = $_GET['state'] ?? '';
$error = $_GET['error'] ?? '';
$errorDescription = $_GET['error_description'] ?? '';

if ($error) {
    echo '<html><body><script>
        window.opener.postMessage({ type: "orcid_callback", success: false, error: "' . addslashes($error . ': ' . $errorDescription) . '" }, "*");
        window.close();
    </script></body></html>';
    exit;
}

if (empty($code)) {
    echo '<html><body><script>
        window.opener.postMessage({ type: "orcid_callback", success: false, error: "Missing authorization code" }, "*");
        window.close();
    </script></body></html>';
    exit;
}

// Call the backend to exchange the code
$result = handleOrcIDCallback(['code' => $code, 'state' => $state]);

if ($result['success']) {
    echo '<html><body><script>
        window.opener.postMessage({ type: "orcid_callback", success: true, orcid: "' . addslashes($result['orcid']) . '", name: "' . addslashes($result['name'] ?? '') . '" }, "*");
        window.close();
    </script></body></html>';
} else {
    echo '<html><body><script>
        window.opener.postMessage({ type: "orcid_callback", success: false, error: "' . addslashes($result['error']) . '" }, "*");
        window.close();
    </script></body></html>';
}