<?php
/**
 * doc-stream.php — Server-Sent Events endpoint for real-time collaborative editing.
 * Streams document operations, cursor positions, and presence events to connected clients.
 *
 * Usage: GET doc-stream.php?doc_id=X&user_email=Y&user_name=Z
 *
 * Events emitted:
 *   - ops:         new document operations (insert, delete, format, etc.)
 *   - cursors:     cursor positions of active users
 *   - presence:    user joined/left editing session
 *   - state:       current document state (sent on connect)
 */

session_start();
header('Content-Type: text/event-stream');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Connection: keep-alive');
header('X-Accel-Buffering: no'); // Disable nginx buffering

// CORS headers for SSE
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Credentials: true');

@ini_set('output_buffering', 'off');
@ini_set('zlib.output_compression', false);
@ini_set('implicit_flush', true);
ob_implicit_flush(true);

// Disable session locking for SSE (prevents blocking)
session_write_close();

$docId = isset($_GET['doc_id']) ? preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['doc_id']) : '';
$userEmail = isset($_GET['user_email']) ? strtolower(trim($_GET['user_email'])) : '';
$userName = isset($_GET['user_name']) ? trim($_GET['user_name']) : $userEmail;

if (empty($docId) || empty($userEmail)) {
    echo "event: error\ndata: " . json_encode(['error' => 'Missing doc_id or user_email']) . "\n\n";
    exit;
}

// DB connection
require_once __DIR__ . '/db.php';

/**
 * Clean up stale sessions (inactive > 30 seconds).
 */
function cleanupStaleSessions($pdo, $docId) {
    $stmt = $pdo->prepare("DELETE FROM doc_stream_sessions WHERE doc_id = ? AND last_seen < DATE_SUB(NOW(), INTERVAL 30 SECOND)");
    $stmt->execute([$docId]);
}

/**
 * Register or update the editing session.
 */
function registerSession($pdo, $docId, $userEmail, $userName) {
    $colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
    $color = $colors[crc32($userEmail . $docId) % count($colors)];

    $stmt = $pdo->prepare("
        INSERT INTO doc_stream_sessions (doc_id, user_email, user_name, cursor_position, last_seen, color)
        VALUES (?, ?, ?, 0, NOW(), ?)
        ON DUPLICATE KEY UPDATE user_name = VALUES(user_name), last_seen = NOW()
    ");
    $stmt->execute([$docId, $userEmail, $userName, $color]);

    return $color;
}

/**
 * Get current document state.
 */
function getDocState($pdo, $docId) {
    $stmt = $pdo->prepare("SELECT content_html, last_version FROM doc_stream_docs WHERE doc_id = ?");
    $stmt->execute([$docId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: ['content_html' => '', 'last_version' => 0];
}

/**
 * Get active sessions (cursors).
 */
function getActiveSessions($pdo, $docId, $excludeEmail) {
    $stmt = $pdo->prepare("SELECT user_email, user_name, cursor_position, color FROM doc_stream_sessions WHERE doc_id = ? AND user_email != ? AND last_seen > DATE_SUB(NOW(), INTERVAL 30 SECOND) ORDER BY last_seen DESC");
    $stmt->execute([$docId, $excludeEmail]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Get operations since a specific version.
 */
function getOpsSince($pdo, $docId, $sinceVersion) {
    $stmt = $pdo->prepare("SELECT id, user_email, op_type, op_data, version, created_at FROM doc_stream_ops WHERE doc_id = ? AND version > ? ORDER BY version ASC");
    $stmt->execute([$docId, $sinceVersion]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

/**
 * Send SSE event.
 */
function sendEvent($event, $data) {
    echo "event: {$event}\n";
    echo "data: " . json_encode($data, JSON_UNESCAPED_UNICODE) . "\n\n";
    if (ob_get_level()) {
        ob_end_flush();
    }
    flush();
}

// Register session
$myColor = registerSession($pdo, $docId, $userEmail, $userName);
cleanupStaleSessions($pdo, $docId);

// Send initial state
$state = getDocState($pdo, $docId);
sendEvent('state', [
    'content_html' => $state['content_html'],
    'last_version' => (int)$state['last_version'],
    'my_color' => $myColor,
    'doc_id' => $docId,
    'user_email' => $userEmail
]);

// Send presence announcement
sendEvent('presence', [
    'user_email' => $userEmail,
    'user_name' => $userName,
    'color' => $myColor,
    'action' => 'join'
]);

$lastKnownVersion = (int)$state['last_version'];
$lastCursorBroadcast = 0;
$heartbeatInterval = 10;
$lastHeartbeat = time();

// Main SSE loop
while (true) {
    // Check for client disconnect
    if (connection_aborted()) {
        break;
    }

    // Update last_seen (heartbeat)
    $stmt = $pdo->prepare("UPDATE doc_stream_sessions SET last_seen = NOW() WHERE doc_id = ? AND user_email = ?");
    $stmt->execute([$docId, $userEmail]);

    // Clean up stale sessions
    cleanupStaleSessions($pdo, $docId);

    // Check for new operations
    $ops = getOpsSince($pdo, $docId, $lastKnownVersion);
    if (!empty($ops)) {
        foreach ($ops as $op) {
            $lastKnownVersion = max($lastKnownVersion, (int)$op['version']);
        }
        sendEvent('ops', $ops);
    }

    // Broadcast cursors and presence every 2 seconds
    if (time() - $lastCursorBroadcast >= 2) {
        $sessions = getActiveSessions($pdo, $docId, $userEmail);
        sendEvent('cursors', $sessions);
        $lastCursorBroadcast = time();
    }

    // Send periodic heartbeat
    if (time() - $lastHeartbeat >= $heartbeatInterval) {
        sendEvent('heartbeat', ['time' => time()]);
        $lastHeartbeat = time();
    }

    // Sleep for 2 seconds before next poll
    sleep(2);
}
