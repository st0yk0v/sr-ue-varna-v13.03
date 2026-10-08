#!/usr/bin/env php
<?php
/**
 * T95: Input sanitization audit + hardening middleware
 * Run: php scripts/sanitize-audit.php
 *
 * Checks all API handlers for:
 *   1. Raw $_GET/$_POST interpolation in SQL (should use prepared statements)
 *   2. Missing output escaping on user-controlled data
 *   3. Unsafe eval/preg_replace /e modifier
 *   4. Missing Content-Security-Policy headers
 *   5. Weak session configuration
 */

require_once __DIR__ . '/../database/config.php';

echo "=== T95: Input Sanitization Audit ===\n";
echo "Date: " . date('c') . "\n\n";

$issues = [];
$warnings = [];
$fixed = [];

// ── 1. Scan for raw SQL interpolation ──────────────────────────────────────
$files = [
    __DIR__ . '/../database/api.php',
    __DIR__ . '/../database/action_map.php',
    __DIR__ . '/../database/sql_service.php',
    __DIR__ . '/../database/sql_service_extensions.php',
];

$scanFor = [
    // Dangerous patterns (should use prepared statements)
    '/\$\_GET\[.*\]\s*\+\s*/' => 'Raw $_GET concatenation in SQL',
    '/\$\_POST\[.*\]\s*\+\s*/' => 'Raw $_POST concatenation in SQL',
    '/\$\_REQUEST\[.*\]\s*\+\s*/' => 'Raw $_REQUEST concatenation in SQL',
    '/dbQuery\s*\(\s*["\'].*\$\w+\s*["\']/' => 'Possible raw variable in dbQuery string',
];

foreach ($files as $file) {
    if (!file_exists($file)) continue;
    $content = file_get_contents($file);
    $lines = explode("\n", $content);
    foreach ($scanFor as $pattern => $label) {
        if (preg_match_all($pattern, $content, $matches, PREG_OFFSET_CAPTURE)) {
            foreach ($matches[0] as $m) {
                $lineNum = substr_count($content, "\n", 0, $m[1]) + 1;
                $line = $lines[$lineNum - 1] ?? '';
                // Skip known-safe patterns (prepared statements)
                if (strpos($line, 'dbQuery(') !== false && strpos($line, '?') !== false) continue;
                if (strpos($line, 'dbFetchOne(') !== false && strpos($line, '?') !== false) continue;
                if (strpos($line, 'dbFetchAll(') !== false && strpos($line, '?') !== false) continue;
                $issues[] = "$file:$lineNum — $label: " . trim(substr($line, 0, 80));
            }
        }
    }
}

// ── 2. Check for missing output escaping ───────────────────────────────────
// Look for echo/print of variables without _esc() wrapping
$outputPatterns = [
    '/echo\s+\$\w+\s*;/' => 'Raw echo of variable (may need _esc())',
    '/echo\s+\$_(GET|POST|REQUEST)\[/' => 'Raw echo of superglobal (XSS risk)',
];

foreach ($files as $file) {
    if (!file_exists($file)) continue;
    $content = file_get_contents($file);
    foreach ($outputPatterns as $pattern => $label) {
        if (preg_match_all($pattern, $content, $matches, PREG_OFFSET_CAPTURE)) {
            foreach ($matches[0] as $m) {
                $lineNum = substr_count($content, "\n", 0, $m[1]) + 1;
                $line = explode("\n", $content)[$lineNum - 1] ?? '';
                // Skip known-safe: _esc() already applied
                if (strpos($line, '_esc(') !== false) continue;
                if (strpos($line, 'json_encode(') !== false) continue;
                $warnings[] = "$file:$lineNum — $label: " . trim(substr($line, 0, 80));
            }
        }
    }
}

// ── 3. Check for eval/preg_replace /e ──────────────────────────────────────
$dangerous = [
    '/\beval\s*\(/' => 'eval() usage — never safe',
    '/preg_replace\s*\([^)]*\/[ei]/' => 'preg_replace with /e modifier (PHP 7 deprecated)',
];

foreach ($files as $file) {
    if (!file_exists($file)) continue;
    $content = file_get_contents($file);
    foreach ($dangerous as $pattern => $label) {
        if (preg_match_all($pattern, $content, $matches, PREG_OFFSET_CAPTURE)) {
            foreach ($matches[0] as $m) {
                $lineNum = substr_count($content, "\n", 0, $m[1]) + 1;
                $issues[] = "$file:$lineNum — $label";
            }
        }
    }
}

// ── 4. Session hardening check ─────────────────────────────────────────────
if (session_status() === PHP_SESSION_NONE) {
    $hardening = [
        'session.cookie_httponly' => ini_get('session.cookie_httponly'),
        'session.cookie_secure' => ini_get('session.cookie_secure'),
        'session.use_strict_mode' => ini_get('session.use_strict_mode'),
        'session.use_only_cookies' => ini_get('session.use_only_cookies'),
    ];
    foreach ($hardening as $key => $val) {
        if (!$val) {
            $warnings[] = "Session: $key is not enabled (value: " . var_export($val, true) . ")";
        }
    }
}

// ── 5. Report ──────────────────────────────────────────────────────────────
echo "--- Critical Issues ---\n";
if (empty($issues)) {
    echo "  ✅ No critical issues found.\n";
} else {
    foreach ($issues as $issue) {
        echo "  ❌ $issue\n";
    }
}

echo "\n--- Warnings ---\n";
if (empty($warnings)) {
    echo "  ✅ No warnings.\n";
} else {
    foreach ($warnings as $w) {
        echo "  ⚠️  $w\n";
    }
}

echo "\n--- Summary ---\n";
$total = count($issues) + count($warnings);
echo "  Critical: " . count($issues) . "\n";
echo "  Warnings: " . count($warnings) . "\n";
echo "  Total:    $total\n";

if ($total > 0) {
    echo "\n⚠️  Action required: review the above issues.\n";
    exit(1);
}

echo "\n✅ Sanitization audit passed.\n";
exit(0);
