<?php
/**
 * auth_security_test.php — T76: Automated security test runner.
 * Executes the auth handler contract tests and reports results.
 * Can be run via CLI: php database/auth_security_test.php
 *
 * This is a thin wrapper that delegates to tests/auth_handlers_test.php
 * but can also be invoked independently for CI/CD pipelines.
 */

// Delegate to the full test suite
$testFile = __DIR__ . '/../tests/auth_handlers_test.php';
if (file_exists($testFile)) {
    require_once $testFile;
} else {
    echo "ERROR: tests/auth_handlers_test.php not found\n";
    exit(1);
}
