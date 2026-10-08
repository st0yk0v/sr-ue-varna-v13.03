#!/usr/bin/env php
<?php
/**
 * UEV-ERP Sync Worker — processes sync_queue for PHP → GAS mutations
 * v12.17.3-instant
 *
 * Reads unprocessed rows from sync_queue, POSTs each to the GAS _fullmirror
 * endpoint, marks rows processed=1 on success. Also bumps data_version so the
 * frontend version poller detects changes and auto-refreshes in <15s.
 *
 * USAGE:
 *   php sync_worker.php                   # process queue once and exit
 *   php sync_worker.php --daemon          # loop every 60 seconds
 *   php sync_worker.php --max=50          # process at most 50 rows
 *
 * CRON (recommended — every minute):
 *   * * * * * php /home/u129919172/public_html/sar/database/sync_worker.php
 *
 * This is the ONLY place GAS is ever called from PHP.  No request-path code
 * ever makes a synchronous HTTP call to GAS — they all enqueue via sync_queue.
 */

require_once __DIR__ . '/config.php';

// ── CLI args ────────────────────────────────────────────────────────────────
$isDaemon  = in_array('--daemon', $argv ?? []);
$maxRows   = 50;
foreach ($argv ?? [] as $arg) {
    if (preg_match('/^--max=(\d+)$/', $arg, $m)) $maxRows = (int)$m[1];
}

$loopDelay = 60; // seconds between daemon loops
$maxAttempts = 5; // abandon a row after 5 failed attempts

/**
 * POST a payload to the GAS endpoint and return decoded response.
 */
function postToGAS(string $url, string $payloadJson): array {
    $ctx = stream_context_create([
        'http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json\r\n",
            'content' => $payloadJson,
            'timeout' => 25,
            'ignore_errors' => true
        ]
    ]);
    $response = @file_get_contents($url, false, $ctx);
    if ($response === false) return ['success' => false, 'error' => 'HTTP request failed'];
    $decoded = json_decode($response, true);
    if (!$decoded) return ['success' => false, 'error' => 'Invalid JSON response: ' . substr($response, 0, 200)];
    return $decoded;
}

/**
 * Process a single sync_queue row.
 */
function processRow(array $row): bool {
    $id = $row['id'];
    $action = $row['action'];
    $gasUrl = $row['gas_url'] ?: GAS_REAL_URL;
    $payload = $row['payload'];

    if (!$gasUrl || !$payload) {
        // No target URL or empty payload — mark as done to avoid clogging
        dbQuery('UPDATE sync_queue SET processed=1, processed_at=NOW(), last_error="No GAS URL or empty payload" WHERE id=?', [$id]);
        return true;
    }

    // Attempt the POST
    $result = postToGAS($gasUrl, $payload);
    $attempts = (int)$row['attempts'] + 1;

    if (!empty($result['success'])) {
        dbQuery(
            'UPDATE sync_queue SET processed=1, attempts=?, last_attempt_at=NOW(), processed_at=NOW(), last_error=NULL WHERE id=?',
            [$attempts, $id]
        );
        echo "  [OK]   $action (row $id)\n";
        // v12.17.3: Bump data_version so frontend version poller triggers instant refresh
        try {
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES (?,1,NOW())
                     ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()',
                    [$action]);
            dbQuery('INSERT INTO data_version (table_name, version, updated_at) VALUES ("system",1,NOW())
                     ON DUPLICATE KEY UPDATE version=version+1, updated_at=NOW()');
        } catch (Throwable $_) {}
        return true;
    }

    // Failed — increment attempts, store error
    $errorMsg = substr($result['error'] ?? 'Unknown error', 0, 500);
    dbQuery(
        'UPDATE sync_queue SET attempts=?, last_error=?, last_attempt_at=NOW() WHERE id=?',
        [$attempts, $errorMsg, $id]
    );
    echo "  [FAIL] $action (row $id, attempt $attempts): $errorMsg\n";

    // Abandon after max attempts
    if ($attempts >= 5) {
        dbQuery('UPDATE sync_queue SET processed=1, processed_at=NOW() WHERE id=?', [$id]);
        echo "  [DROP] $action (row $id) — abandoned after $attempts failures\n";
        return false;
    }

    return false;
}

/**
 * Main worker loop — processes one batch of unprocessed rows.
 */
function workerMain(int $maxRows): int {
    $rows = dbFetchAll(
        'SELECT * FROM sync_queue
         WHERE processed = 0
         ORDER BY priority DESC, created_at ASC
         LIMIT ?',
        [$maxRows]
    );

    if (empty($rows)) {
        echo "  [IDLE] No unprocessed rows\n";
        return 0;
    }

    $processed = 0;
    $succeeded = 0;
    $failed = 0;

    echo "  Processing " . count($rows) . " row(s)...\n";
    foreach ($rows as $row) {
        $ok = processRow($row);
        $processed++;
        if ($ok) $succeeded++; else $failed++;
    }

    // ── Auto-cleanup processed rows older than 7 days ──
    // v12.27.1-perf: Prevent sync_queue from growing unbounded.
    try {
        $cleanedStmt = dbQuery('DELETE FROM sync_queue WHERE processed = 1 AND processed_at < DATE_SUB(NOW(), INTERVAL 7 DAY)');
        $cleaned = $cleanedStmt->rowCount();
        if ($cleaned > 0) {
            echo "  [CLEANUP] Removed $cleaned old processed rows\n";
        }
    } catch (Throwable $e) {
        // Non-critical — queue still works, just grows slightly
        echo "  [CLEANUP] Warning: " . $e->getMessage() . "\n";
    }

    echo "  Done: $succeeded succeeded, $failed failed out of $processed processed\n";
    return $processed;
}

// ── Entry point ─────────────────────────────────────────────────────────────

echo "[" . date('Y-m-d H:i:s') . "] UEV-ERP Sync Worker v10.5.0-async\n";
echo "  GAS endpoint: " . (GAS_REAL_URL ?: 'NOT CONFIGURED') . "\n";
if (!GAS_REAL_URL) {
    echo "  ERROR: GAS_REAL_URL is not set in .env or config.php\n";
    exit(1);
}

if ($isDaemon) {
    echo "  Daemon mode: checking every {$loopDelay}s\n";
    while (true) {
        echo "[" . date('Y-m-d H:i:s') . "] Cycle starting...\n";
        workerMain($maxRows);
        sleep($loopDelay);
    }
} else {
    // Single run — used by cron
    $count = workerMain($maxRows);
    exit($count > 0 ? 0 : 0);
}
