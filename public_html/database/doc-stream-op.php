<?php
/**
 * doc-stream-op.php — POST endpoint for document operations.
 * Accepts: { doc_id, user_email, op_type, op_data, version }
 * Returns: { success, version }
 */

session_start();
header('Content-Type: application/json');

// CORS — restrict to the app's own origins (no wildcard; prevents cross-origin abuse)
$allowedOrigins = ['https://sr-ue-varna.com', 'https://www.sr-ue-varna.com'];
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($reqOrigin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: ' . $reqOrigin);
    header('Access-Control-Allow-Credentials: true');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Get POST body
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

$docId = isset($data['doc_id']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $data['doc_id']) : '';
$userEmail = isset($data['user_email']) ? strtolower(trim($data['user_email'])) : '';
$opType = isset($data['op_type']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $data['op_type']) : '';
$opData = isset($data['op_data']) ? $data['op_data'] : [];
$clientVersion = isset($data['version']) ? (int)$data['version'] : 0;

if (empty($docId) || empty($userEmail) || empty($opType)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required fields']);
    exit;
}

// DB connection
require_once __DIR__ . '/db.php';

try {
    $pdo->beginTransaction();

    // Get current version
    $stmt = $pdo->prepare("SELECT last_version FROM doc_stream_docs WHERE doc_id = ? FOR UPDATE");
    $stmt->execute([$docId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $currentVersion = $row ? (int)$row['last_version'] : 0;

    // Check version conflict
    if ($clientVersion < $currentVersion) {
        // Client is behind — they need to catch up first
        $pdo->rollBack();
        echo json_encode([
            'success' => false,
            'error' => 'Version conflict',
            'server_version' => $currentVersion,
            'client_version' => $clientVersion
        ]);
        exit;
    }

    // Insert operation
    $newVersion = $currentVersion + 1;
    $stmt = $pdo->prepare("INSERT INTO doc_stream_ops (doc_id, user_email, op_type, op_data, version, created_at) VALUES (?, ?, ?, ?, ?, NOW())");
    $stmt->execute([$docId, $userEmail, $opType, json_encode($opData), $newVersion]);

    // Update doc state
    $stmt = $pdo->prepare("INSERT INTO doc_stream_docs (doc_id, content_html, last_version, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE last_version = VALUES(last_version), updated_at = NOW()");
    $stmt->execute([$docId, '', $newVersion]);

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'version' => $newVersion,
        'doc_id' => $docId
    ]);

} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['error' => 'Server error: ' . $e->getMessage()]);
}
