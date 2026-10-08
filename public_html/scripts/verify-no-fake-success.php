<?php
/**
 * Guard: catch handlers that launder a FAILED call into a success response.
 *
 * Motivating bug (fixed): handleReplaceReviewer did
 *
 *     if ($r['success']) return $r;          // sqlReplaceReviewer
 *     return handleStub('replaceReviewer');  // <- success:true, nothing written
 *
 * so when the replace_reviewer stored procedure was absent the admin UI showed
 * a reviewer swap that never touched the database. Silent data loss WITH
 * positive confirmation is the worst failure shape in this codebase, and the
 * pattern is easy to reintroduce.
 *
 * Two checks:
 *   1. handleStub() must not return success => true.
 *   2. No `if ($x['success']) return $x;` followed by a fallback that reports
 *      success anyway (the laundering shape).
 *
 * Deliberately NOT flagged: read handlers that return success:true with an
 * empty list, and mutators with per-step try/catch + real counters
 * (handleRepairAllSheets). Those are correct.
 *
 * Usage: php scripts/verify-no-fake-success.php
 * Exit 0 = clean, 1 = suspect handler found.
 */

$root = dirname(__DIR__);
$files = ['database/api.php', 'database/sql_service.php', 'database/_v18_handlers.php'];
$problems = [];
$scanned = 0;

foreach ($files as $rel) {
    $path = $root . '/' . $rel;
    if (!is_file($path)) continue;
    $src = file_get_contents($path);
    $scanned++;

    // ── Check 1: handleStub must fail closed ──
    if (preg_match('/function\s+handleStub\s*\([^)]*\)\s*:\s*array\s*\{(.*?)\n\}/s', $src, $m)) {
        if (preg_match("/'success'\s*=>\s*true/", $m[1])) {
            $problems[] = "$rel: handleStub() returns success=>true — a stubbed action must never "
                        . "report success (see replaceReviewer regression).";
        }
    }

    // ── Check 2: the laundering shape ──
    // `if ($r['success']) return $r;` means the false branch falls through to
    // whatever follows. If what follows reports success, the failure is lost.
    $re = "/if\s*\(\s*\\\$(\w+)\[\s*'success'\s*\]\s*\)\s*return\s+\\\$\\1\s*;/";
    if (preg_match_all($re, $src, $ms, PREG_OFFSET_CAPTURE | PREG_SET_ORDER)) {
        foreach ($ms as $set) {
            $off  = $set[0][1];
            $line = substr_count(substr($src, 0, $off), "\n") + 1;
            $tail = substr($src, $off + strlen($set[0][0]), 400);
            // Cut at the end of the enclosing function so we don't read the next one.
            $stop = strpos($tail, "\nfunction ");
            if ($stop !== false) $tail = substr($tail, 0, $stop);
            $reportsSuccess = preg_match("/'success'\s*=>\s*true/", $tail)
                           || preg_match('/handleStub\s*\(/', $tail);
            if ($reportsSuccess) {
                $problems[] = "$rel:$line: a failed result falls through to a response that reports "
                            . "success (laundering). Return the real verdict or add a genuine fallback.";
            }
        }
    }
}

if ($scanned === 0) {
    echo "FAKE-SUCCESS: no backend files found to scan\n";
    exit(1);
}

// ── Negative control: prove the detector can actually fail ──
$probe = <<<'PHP'
function handleProbe(array $b): array {
    $r = sqlSomething();
    if ($r['success']) return $r;
    return ['success' => true, 'message' => 'pretended'];
}
PHP;
$ncRe = "/if\s*\(\s*\\\$(\w+)\[\s*'success'\s*\]\s*\)\s*return\s+\\\$\\1\s*;/";
$ncCaught = false;
if (preg_match($ncRe, $probe, $m, PREG_OFFSET_CAPTURE)) {
    $tail = substr($probe, $m[0][1] + strlen($m[0][0]));
    $ncCaught = (bool)preg_match("/'success'\s*=>\s*true/", $tail);
}
if (!$ncCaught) {
    echo "FAKE-SUCCESS FAIL: negative control did not trigger — the detector is broken.\n";
    exit(1);
}
echo "Negative control PASS: synthetic laundering handler correctly flagged.\n";

if ($problems) {
    echo "\n=== FAKE-SUCCESS PROBLEMS (" . count($problems) . ") ===\n";
    foreach ($problems as $p) echo "  $p\n";
    exit(1);
}

echo "FAKE-SUCCESS OK: no laundered failures in $scanned backend file(s).\n";
exit(0);
