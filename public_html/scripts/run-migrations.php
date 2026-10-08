<?php
// T81: Database migration runner
// Runs idempotent schema migrations. Safe to run multiple times.
//
// Usage: php scripts/run-migrations.php [--dry-run] [--version VERSION]
//
// Migrations are numbered sequentially. Each migration is a PHP file in
// scripts/migrations/ that returns a SQL string to execute.
//
// Example migration (scripts/migrations/001_email_templates.php):
//   <?php
//   return "CREATE TABLE IF NOT EXISTS email_templates (...);";

require_once __DIR__ . '/../database/config.php';

$DRY_RUN = false;
$TARGET_VERSION = null;
foreach ($argv as $arg) {
    if ($arg === '--dry-run') $DRY_RUN = true;
    if (strpos($arg, '--version=') === 0) $TARGET_VERSION = substr($arg, 10);
}

echo "=== T81: Database Migration Runner ===\n";
echo "Date: " . date('c') . "\n";
echo "Dry run: " . ($DRY_RUN ? 'YES' : 'NO') . "\n";
echo "Target version: " . ($TARGET_VERSION ?? 'latest') . "\n\n";

// Discover migrations
$MIGRATIONS_DIR = __DIR__ . '/migrations';
$migrations = [];
if (is_dir($MIGRATIONS_DIR)) {
    foreach (scandir($MIGRATIONS_DIR) as $file) {
        if (preg_match('/^(\d+)_(.+)\.php$/', $file, $m)) {
            $migrations[] = [
                'version' => (int)$m[1],
                'name' => $m[2],
                'file' => $MIGRATIONS_DIR . '/' . $file,
            ];
        }
    }
}
usort($migrations, fn($a, $b) => $a['version'] <=> $b['version']);

// Load migration history
$history = [];
try {
    dbQuery("CREATE TABLE IF NOT EXISTS migration_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        version INT NOT NULL UNIQUE,
        name VARCHAR(200) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INT,
        dry_run TINYINT(1) DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $rows = dbFetchAll("SELECT version, name, applied_at, execution_time_ms FROM migration_history ORDER BY version");
    foreach ($rows as $r) $history[$r['version']] = true;
} catch (Throwable $e) {
    echo "WARNING: Could not load migration history: {$e->getMessage()}\n";
}

$applied = 0;
$skipped = 0;

foreach ($migrations as $m) {
    // Check if we've reached the target version
    if ($TARGET_VERSION !== null && $m['version'] > (int)$TARGET_VERSION) {
        echo "Skipping {$m['version']}_{$m['name']} (beyond target version)\n";
        $skipped++;
        continue;
    }

    if (isset($history[$m['version']])) {
        echo "✓ {$m['version']}_{$m['name']} — already applied\n";
        $applied++;
        continue;
    }

    echo "→ {$m['version']}_{$m['name']} ... ";

    // Run migration file
    $start = microtime(true);
    $sql = require $m['file'];
    if (!is_string($sql) || trim($sql) === '') {
        echo "EMPTY SQL — skipping\n";
        $skipped++;
        continue;
    }

    if ($DRY_RUN) {
        echo "DRY RUN (would execute " . strlen($sql) . " bytes)\n";
        $skipped++;
        continue;
    }

    try {
        // Split on semicolons for multiple statements
        $statements = array_filter(array_map('trim', explode(';', $sql)));
        foreach ($statements as $stmt) {
            if (trim($stmt) === '') continue;
            dbQuery($stmt);
        }
        $elapsed = round((microtime(true) - $start) * 1000);
        dbQuery("INSERT INTO migration_history (version, name, execution_time_ms) VALUES (?, ?, ?)",
            [$m['version'], $m['name'], $elapsed]);
        echo "OK ({$elapsed}ms)\n";
        $applied++;
    } catch (Throwable $e) {
        echo "FAILED: {$e->getMessage()}\n";
        echo "WARNING: Migration {$m['version']} failed — manual intervention may be required.\n";
    }
}

echo "\n=== Migration Summary ===\n";
echo "  Applied:  $applied\n";
echo "  Skipped:  $skipped\n";
echo "  Total:    " . count($migrations) . "\n";

if ($DRY_RUN) {
    echo "\nThis was a DRY RUN. No changes were made.\n";
    echo "Run without --dry-run to apply migrations.\n";
}
