<?php
require __DIR__ . '/../database/config.php';
$db = getDB();

$db->exec("CREATE TABLE IF NOT EXISTS knowledge_base (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    staff_email VARCHAR(255) NOT NULL,
    title TEXT NULL,
    authors TEXT NULL,
    journal TEXT NULL,
    year INT NULL,
    doi VARCHAR(255) NULL,
    url TEXT NULL,
    citations INT DEFAULT 0,
    source VARCHAR(32) NULL,
    created DATETIME NULL,
    KEY idx_kb_email (staff_email),
    KEY idx_kb_doi (doi)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

echo "Table ready\n";

$total = $db->query("SELECT COUNT(*) FROM scientific_works WHERE doi != '' AND doi IS NOT NULL")->fetchColumn();
echo "Total: $total\n";

$inserted = 0;
$batchSize = 50;

for ($offset = 0; $offset < $total; $offset += $batchSize) {
    $rows = $db->prepare("SELECT author_email, title, publication, year, doi, url, source, authors FROM scientific_works WHERE doi != '' AND doi IS NOT NULL LIMIT ? OFFSET ?");
    $rows->execute([$batchSize, $offset]);
    
    $count = 0;
    while ($r = $rows->fetch(PDO::FETCH_ASSOC)) {
        $kbId = 'kb_' . md5($r['author_email'] . $r['doi']);
        
        // Use INSERT IGNORE to skip duplicates
        $in = $db->prepare("INSERT IGNORE INTO knowledge_base (id, staff_email, title, authors, journal, year, doi, url, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
        $in->execute([
            $kbId, $r['author_email'],
            substr($r['title'], 0, 500),
            substr($r['authors'], 0, 200),
            substr($r['publication'], 0, 500),
            $r['year'] ? (int)$r['year'] : null,
            substr($r['doi'], 0, 200),
            substr($r['url'], 0, 500),
            substr($r['source'], 0, 30)
        ]);
        $inserted += $in->rowCount();
        $count++;
    }
    
    if ($offset % 1000 == 0) {
        echo "  $offset / $total (inserted: $inserted)\n";
    }
}

echo "Done! Inserted: $inserted\n";
echo "KB: " . $db->query("SELECT COUNT(*) FROM knowledge_base")->fetchColumn() . "\n";
