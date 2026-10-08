<?php
/**
 * seed-from-live.php — Generate seed JSON matching live DB doc IDs.
 * Outputs pure JSON to stdout. Progress goes to stderr.
 * 
 * Usage: php scripts/seed-from-live.php > seed-local-docs.json
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

$SRC = 'C:\Users\999\Desktop\ERPDOCS';
if (!is_dir($SRC)) {
    fwrite(STDERR, "Source folder not found: $SRC\n");
    exit(1);
}

// 1. Fetch all docs from live API
$apiUrl = 'https://sr-ue-varna.com/database/api.php?action=listDocuments&isAdmin=true';
$json = @file_get_contents($apiUrl);
if (!$json) {
    fwrite(STDERR, "Failed to fetch docs from live API\n");
    exit(1);
}
$data = json_decode($json, true);
$docs = $data['documents'] ?: [];
fwrite(STDERR, "Total docs from live: " . count($docs) . "\n");

// Build name→id map from live DB
$liveByName = [];
foreach ($docs as $d) {
    $name = trim($d['name']);
    if ($name === '') continue;
    $liveByName[$name] = $d['id'];
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
    ];
}
fwrite(STDERR, "Source files found: " . count($files) . "\n");

// 3. Match and build seed array
$seeded = [];
$skipped = [];

foreach ($files as $sf) {
    $name = $sf['name'];
    if (!isset($liveByName[$name])) {
        $skipped[] = $name;
        continue;
    }
    
    $bytes = file_get_contents($sf['path']);
    if ($bytes === false || strlen($bytes) === 0) {
        $skipped[] = "$name (empty read)";
        continue;
    }
    
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
    
    $seeded[] = [
        'id'         => $liveByName[$name],
        'name'       => $name,
        'mime_type'  => $mime,
        'size'       => strlen($bytes),
        'folder_name'=> 'Библиотека',
        'origin'     => 'library',
        'content'    => base64_encode($bytes),
    ];
}

fwrite(STDERR, "Matched: " . count($seeded) . "\n");
fwrite(STDERR, "Skipped: " . count($skipped) . "\n");
foreach ($skipped as $s) {
    fwrite(STDERR, "  SKIP: $s\n");
}

// 4. Output JSON (stdout only — pure JSON)
$output = [
    'generated'  => date('c'),
    'source'     => $SRC,
    'count'      => count($seeded),
    'documents'  => $seeded,
];

echo json_encode($output, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
