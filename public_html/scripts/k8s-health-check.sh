#!/bin/sh
# T149: Kubernetes-ready health check endpoint
# Usage: curl http://your-pod-ip/healthz (liveness) or /ready (readiness)
#
# These PHP scripts are mounted into the container at /var/www/uev-erp/health/
# and serve as Kubernetes liveness/readiness probes.
#
# Liveness probe: Is the PHP process alive and responding?
# Readiness probe: Can the app serve traffic? (DB + GAS tunnel healthy)
#
# Kubernetes deployment snippet:
#
#   livenessProbe:
#     httpGet:
#       path: /healthz
#       port: 80
#     initialDelaySeconds: 5
#     periodSeconds: 10
#     timeoutSeconds: 3
#     failureThreshold: 3
#
#   readinessProbe:
#     httpGet:
#       path: /ready
#       port: 80
#     initialDelaySeconds: 10
#     periodSeconds: 5
#     timeoutSeconds: 3
#     failureThreshold: 3
#
# To use without Docker/K8s, these work as standalone PHP files:

cat > /tmp/healthz.php << 'PHPEOF'
<?php
// T149: K8s liveness probe — minimal response, no DB dependency
header('Content-Type: application/json');
echo json_encode(['status' => 'alive', 'version' => defined('APP_VERSION') ? APP_VERSION : 'unknown', 'timestamp' => time()]);
PHPEOF

cat > /tmp/ready.php << 'PHPEOF'
<?php
// T149: K8s readiness probe — DB + GAS tunnel check
if (!defined('APP_VERSION')) {
    require_once __DIR__ . '/../database/config.php';
}
try {
    $db = getDB();
    $db->query('SELECT 1');
    $dbOk = true;
} catch (Throwable $_) {
    $dbOk = false;
}

// GAS tunnel check (lightweight)
$tunnelOk = false;
if (defined('GAS_REAL_URL') && GAS_REAL_URL !== '') {
    try {
        $ctx = stream_context_create(['http' => ['timeout' => 3, 'ignore_errors' => true]]);
        $res = @file_get_contents(GAS_REAL_URL . '?gas_tunnel_ping=1', false, $ctx);
        if ($res !== false) {
            $d = json_decode($res, true);
            $tunnelOk = ($d && ($d['ok'] ?? $d['success'] ?? false));
        }
    } catch (Throwable $_) {}
}

$ready = $dbOk; // DB is the minimum requirement; GAS is nice-to-have
$status = $ready ? 'ready' : 'not_ready';
http_response_code($ready ? 200 : 503);
header('Content-Type: application/json');
echo json_encode([
    'status' => $status,
    'version' => APP_VERSION,
    'timestamp' => time(),
    'checks' => [
        'database' => $dbOk ? 'ok' : 'failing',
        'gas_tunnel' => $tunnelOk ? 'ok' : 'degraded'
    ]
]);
PHPEOF

echo "T149: Health check scripts generated."
echo "  Liveness:  /tmp/healthz.php  (copy to /var/www/uev-erp/health/healthz.php)"
echo "  Readiness: /tmp/ready.php    (copy to /var/www/uev-erp/health/ready.php)"
echo ""
echo "K8s deployment snippet:"
echo "  livenessProbe:"
echo "    httpGet:"
echo "      path: /healthz"
echo "      port: 80"
echo "    initialDelaySeconds: 5"
echo "    periodSeconds: 10"
echo ""
echo "  readinessProbe:"
echo "    httpGet:"
echo "      path: /ready"
echo "      port: 80"
echo "    initialDelaySeconds: 10"
echo "    periodSeconds: 5"
