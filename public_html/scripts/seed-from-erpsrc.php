<?php
/**
 * seed-from-erpsrc.php — Backfills documents.content from source files.
 * 
 * Scans C:\Users\999\Desktop\ERPDOCS for .docx/.doc/.xlsx/.pdf/.pptx files,
 * matches them to existing DB rows by name, and upserts base64 bytes.
 * 
 * Usage: php scripts/seed-from-erpsrc.php
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

$SRC = 'C:\Users\999\Desktop\ERPDOCS';
if (!is_dir($SRC)) {
    fwrite(STDERR, "Source folder not found: $SRC\n");
    exit(1);
}

require_once __DIR__ . '/../database/config.php';
require_once __DIR__ . '/../database/sql_service.php';

// 1. Get all docs with empty content
$rows = dbFetchAll(
    "SELECT id, name, mime_type, content FROM documents WHERE content IS NULL OR content = ''"
);
echo "DB docs with empty content: " . count($rows) . "\n";

// Build name→row map
$byName = [];
foreach ($rows as $r) {
    $name = trim($r['name']);
    if ($name === '') continue;
    $byName[$name] = $r;
}

// 2. Recursively scan source folder
$exts = ['docx','doc','xlsx','xls','pptx','pdf','txt','csv','md'];
$files = [];
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($SRC));
foreach ($it as $f) {
    if (!$f->isFile()) continue;
    $ext = strtolower(pathinfo($f->getFilename(), PATHINFO_EXTENSION));
    if (!in_array($ext, $exts)) continue;
    $files[] = [
        'path' => $f->getPathname(),
        'name' => pathinfo($f->getFilename(), PATHINFO_BASENAME),
        'size' => $f->getSize(),
    ];
}
echo "Source files found: " . count($files) . "\n";

// 3. Match and upsert
$matched = 0;
$skipped = 0;

foreach ($files as $sf) {
    $name = $sf['name'];
    if (!isset($byName[$name])) {
        echo "  SKIP (no DB match): {$name}\n";
        $skipped++;
        continue;
    }
    
    $row = $byName[$name];
    $id = $row['id'];
    
    // Read file bytes
    $bytes = file_get_contents($sf['path']);
    if ($bytes === false || strlen($bytes) === 0) {
        echo "  SKIP (empty read): {$name}\n";
        $skipped++;
        continue;
    }
    
    $b64 = base64_encode($bytes);
    $size = strlen($bytes);
    
    // Detect mime from extension
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    $mimeMap = [
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc'  => 'application/msword',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls'  => 'application/vnd.ms-excel',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'pdf'  => 'application/pdf',
        'txt'  => 'text/plain',
        'csv'  => 'text/csv',
        'md'   => 'text/markdown',
    ];
    $mime = $mimeMap[$ext] ?? 'application/octet-stream';
    
    // Update existing row
    dbQuery(
        "UPDATE documents SET content=?, size=?, mime_type=?, modified=NOW() WHERE id=?",
        [$b64, $size, $mime, $id]
    );
    
    echo "  OK: {$name} (" . round($size/1024) . "KB) → id={$id}\n";
    $matched++;
}

echo "\n=== Done ===\n";
echo "Matched & seeded: {$matched}\n";
echo "Skipped: {$skipped}\n";
