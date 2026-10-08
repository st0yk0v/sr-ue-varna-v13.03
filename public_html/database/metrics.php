<?php
/* UEV-ERP — Prometheus metrics exporter + recorder (Task 20 / E7 monitoring)
 *
 * Scraped at /database/metrics.php by a Prometheus server.
 * Emits exposition-format metrics for API latency, error rate, and document
 * preview loads. Reads an optional JSON stats file written by the app
 * (database/metrics_state.json); if absent, emits zeroed metrics with
 * HELP/TYPE lines so the scrape still succeeds.
 *
 * Task 20: also accepts a write action so the frontend (and ops tooling) can
 * record events without a deploy-gated backend change:
 *   GET/POST /database/metrics.php?record=erp_api_errors_total&delta=1
 *   GET/POST /database/metrics.php?record=erp_api_latency_seconds&latency=0.123
 *   GET/POST /database/metrics.php?record=erp_doc_preview_loads_total
 *   GET/POST /database/metrics.php?reset=1
 * The recorder returns a tiny 200 JSON and exits; the exporter below is only
 * reached on a plain GET (no record/reset param).
 */

// ── Task 20: recorder branch (best-effort, never fatal) ──
if (isset($_GET['record']) || isset($_POST['record']) || isset($_GET['reset']) || isset($_POST['reset'])) {
    require_once __DIR__ . '/metrics_writer.php';
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    if (!empty($_GET['reset']) || !empty($_POST['reset'])) {
        uev_metric_reset();
        echo json_encode(array('ok' => true, 'reset' => true));
        exit;
    }
    $name = isset($_GET['record']) ? $_GET['record'] : (isset($_POST['record']) ? $_POST['record'] : '');
    $delta = isset($_GET['delta']) ? floatval($_GET['delta']) : (isset($_POST['delta']) ? floatval($_POST['delta']) : 1);
    $latency = isset($_GET['latency']) ? floatval($_GET['latency']) : (isset($_POST['latency']) ? floatval($_POST['latency']) : null);
    if ($latency !== null) {
        $ok = uev_metric_record($name, $latency, true);
    } else {
        $ok = uev_metric_record($name, $delta, false);
    }
    echo json_encode(array('ok' => (bool)$ok, 'metric' => $name));
    exit;
}

header('Content-Type: text/plain; version=0.0.4; charset=utf-8');
header('Cache-Control: no-store');

$stateFile = __DIR__ . '/metrics_state.json';
$state = [];
if (is_readable($stateFile)) {
    $raw = @file_get_contents($stateFile);
    if ($raw !== false) {
        $dec = @json_decode($raw, true);
        if (is_array($dec)) {
            $state = $dec;
        }
    }
}

function num($v, $default = 0) {
    return is_numeric($v) ? $v : $default;
}

$apiLatency = num($state['api_latency_seconds'] ?? null, 0);
$apiErrors  = num($state['api_errors_total'] ?? null, 0);
$docPreviews = num($state['doc_preview_loads_total'] ?? null, 0);

function metric_help($name, $type, $help) {
    echo "# HELP $name $help\n";
    echo "# TYPE $name $type\n";
}

metric_help('erp_api_latency_seconds', 'gauge', 'Rolling average API latency in seconds for the UEV-ERP backend.');
echo "erp_api_latency_seconds " . $apiLatency . "\n";

metric_help('erp_api_errors_total', 'counter', 'Total API errors (HTTP 5xx / handler exceptions) since last reset.');
echo "erp_api_errors_total " . $apiErrors . "\n";

metric_help('erp_doc_preview_loads_total', 'counter', 'Total document preview loads served (stream/Drive/proxy).');
echo "erp_doc_preview_loads_total " . $docPreviews . "\n";

metric_help('php_fpm_up', 'gauge', 'Whether the PHP/FPM worker serving this endpoint is alive (1=up).');
echo "php_fpm_up 1\n";
