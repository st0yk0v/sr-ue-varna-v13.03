<?php
/* UEV-ERP — metrics state writer (Task 20 / E7 monitoring)
 * ---------------------------------------------------------------------------
 * Self-contained atomic writer for database/metrics_state.json.
 *
 * The Prometheus exporter (metrics.php) READS this state file; this file
 * WRITES it. Kept as a separate opt-in include so nothing breaks if it is
 * never called. All failures are swallowed — metrics must never take the app
 * down (best-effort observability only).
 *
 * Metric semantics:
 *   erp_api_latency_seconds     gauge  — rolling 1-minute average latency (s)
 *   erp_api_errors_total        counter — cumulative API errors since reset
 *   erp_doc_preview_loads_total counter — cumulative document preview loads
 *
 * Usage (from any PHP entry that wants to record):
 *   require_once __DIR__ . '/metrics_writer.php';
 *   uev_metric_record('erp_api_errors_total', 1);            // counter +1
 *   uev_metric_record('erp_api_latency_seconds', 0.123, true); // rolling avg
 *   uev_metric_record('erp_doc_preview_loads_total', 1);      // counter +1
 */

if (!function_exists('uev_metric_record')) {

    function uev_metric_state_file() {
        return __DIR__ . '/metrics_state.json';
    }

    /**
     * Record a metric delta.
     * @param string $name    one of the three known metric names
     * @param float  $value   amount to add (counters) or latest sample (latency)
     * @param bool   $isAvg   when true, $value is treated as a fresh latency
     *                        sample and folded into a rolling 1-minute average
     */
    function uev_metric_record($name, $value = 1, $isAvg = false) {
        $allowed = array(
            'erp_api_latency_seconds'     => true,
            'erp_api_errors_total'        => true,
            'erp_doc_preview_loads_total' => true,
        );
        if (!isset($allowed[$name])) return false;
        if (!is_numeric($value)) return false;

        $file = uev_metric_state_file();
        $state = array(
            'erp_api_latency_seconds'     => 0,
            'erp_api_errors_total'        => 0,
            'erp_doc_preview_loads_total' => 0,
            'updated_at'                  => 0,
        );

        if (is_readable($file)) {
            $raw = @file_get_contents($file);
            if ($raw !== false) {
                $dec = @json_decode($raw, true);
                if (is_array($dec)) {
                    foreach ($state as $k => $v) {
                        if (isset($dec[$k]) && is_numeric($dec[$k])) $state[$k] = $dec[$k];
                    }
                }
            }
        }

        if ($isAvg) {
            // Rolling 1-minute average: weight the new sample by recency.
            // Keep a short ring of recent samples in _samples to avoid drift.
            $samples = isset($state['_samples']) && is_array($state['_samples']) ? $state['_samples'] : array();
            $samples[] = floatval($value);
            $now = time();
            // prune samples older than 60s
            $samples = array_filter($samples, function ($s) use ($now) {
                return isset($s['t']) && ($now - $s['t']) <= 60;
            });
            $samples[] = array('t' => $now, 'v' => floatval($value));
            if (count($samples) > 0) {
                $sum = 0;
                foreach ($samples as $s) $sum += $s['v'];
                $state['erp_api_latency_seconds'] = round($sum / count($samples), 4);
            }
            $state['_samples'] = $samples;
        } else {
            $state[$name] = floatval($state[$name]) + floatval($value);
        }

        $state['updated_at'] = time();

        // Atomic write: temp file + rename so a concurrent reader never sees
        // a half-written JSON (rename is atomic on POSIX/Win NTFS).
        $tmp = $file . '.' . getmypid() . '.tmp';
        $ok = @file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_UNICODE));
        if ($ok !== false) {
            @rename($tmp, $file);
        } else {
            @unlink($tmp);
        }
        return true;
    }

    /**
     * Convenience: reset all counters (used by an admin/ops endpoint).
     */
    function uev_metric_reset() {
        $file = uev_metric_state_file();
        $state = array(
            'erp_api_latency_seconds'     => 0,
            'erp_api_errors_total'        => 0,
            'erp_doc_preview_loads_total' => 0,
            'updated_at'                  => time(),
        );
        $tmp = $file . '.reset.tmp';
        if (@file_put_contents($tmp, json_encode($state, JSON_UNESCAPED_UNICODE)) !== false) {
            @rename($tmp, $file);
        }
    }
}
