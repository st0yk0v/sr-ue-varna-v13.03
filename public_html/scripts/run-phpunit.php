#!/usr/bin/env php
<?php
/**
 * T86: PHPUnit test runner for UEV-ERP backend
 * Run: php scripts/run-phpunit.php
 *
 * Each test runs as a standalone PHP process. We set $_GET['action'] and
 * include api.php — the dispatch code runs the handler, jsonExit() echoes
 * JSON and exits. We capture that stdout and verify success.
 */
define('REPO_DIR', rtrim(dirname(__DIR__), '/\\'));
define('DB_DIR', REPO_DIR . '/database');
define('SCRIPTS_DIR', __DIR__);

$phar = __DIR__ . '/phpunit.phar';
if (file_exists($phar)) { require_once $phar; }

if (!class_exists('PHPUnit\Framework\TestCase')) {
    echo "PHPUnit not available — running minimal tests...\n";
    runMinimalTests();
    exit(0);
}

$filter    = $argv[1] ?? '';
$bootstrap = __DIR__ . '/../database/config.php';
$testDir   = __DIR__ . '/../tests/phpunit/';
$phpunitBin = $phar ? $phar : (__DIR__ . '/../vendor/bin/phpunit');
$args = [$phpunitBin, '--bootstrap', $bootstrap, '--testdox', '-v'];
if ($filter) { $args[] = '--filter=' . escapeshellarg($filter); }
if (is_dir($testDir)) { $args[] = $testDir; }
echo "=== UEV-ERP PHPUnit Suite (T86) ===\n";
echo "PHP version: " . PHP_VERSION . "\n";
echo "Date: " . date('c') . "\n\n";
passthru('php ' . implode(' ', array_map('escapeshellarg', $args)));

function runMinimalTests(): void {
    $phpBin = getenv('PHP_BIN') ?: 'php';
    $tests = [
        'handlePing'            => 'ping',
        'handleGetVersion'      => 'getversion',
    ];
    $passed = 0; $failed = 0;

    foreach ($tests as $name => $action) {
        $tmpFile = SCRIPTS_DIR . "/_test_{$name}.php";
        $code  = "<?php\n";
        $code .= '$_SERVER["REQUEST_METHOD"] = "GET";' . "\n";
        $code .= '$_SERVER["HTTP_HOST"] = "localhost";' . "\n";
        $code .= '$_GET = ["action" => "' . $action . '"];' . "\n";
        $code .= '$_POST = [];' . "\n";
        $code .= "require_once " . var_export(DB_DIR . '/api.php', true) . ";\n";
        $code .= "echo 'UNEXPECTED_REACH';\n";
        file_put_contents($tmpFile, $code);

        $cmdLine = '"' . $phpBin . '" "' . $tmpFile . '"';
        $out = []; $rc = 0;
        exec($cmdLine . ' 2>&1', $out, $rc);
        $line = trim(implode("\n", $out));
        @unlink($tmpFile);

        if (strpos($line, '"success":true') !== false) {
            echo "[PASS] {$name}\n"; $passed++;
        } elseif (strpos($line, 'UNEXPECTED_REACH') !== false) {
            echo "[FAIL] {$name} — dispatch did not exit\n"; $failed++;
        } elseif (strpos($line, '"success":false') !== false) {
            echo "[FAIL] {$name} — {$line}\n"; $failed++;
        } else {
            echo "[FAIL] {$name} — rc={$rc} out={$line}\n"; $failed++;
        }
    }
    echo "\n=== Results: {$passed} passed, {$failed} failed ===\n";
    exit($failed > 0 ? 1 : 0);
}
