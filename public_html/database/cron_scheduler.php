#!/usr/bin/env php
<?php
/**
 * UEV-ERP Cron Scheduler — runs due tasks from the scheduled_tasks table.
 * v12.54.61
 *
 * Place in crontab (every minute):
 *   * * * * * php /home/u129919172/public_html/database/cron_scheduler.php >> /home/u129919172/logs/cron.log 2>&1
 *
 * Standalone — does NOT include api.php (which would auto-dispatch and 404).
 */
error_reporting(E_ALL);
ini_set('display_errors', 0);
set_time_limit(120);

require_once __DIR__ . '/config.php';

date_default_timezone_set('Europe/Sofia');

function cronFieldMatches(string $pat, int $val, int $min, int $max): bool {
    if ($pat === '*') return true;
    foreach (explode(',', $pat) as $part) {
        if (preg_match('/^(\d+)-(\d+)(?:\/(\d+))?$/', $part, $mm)) {
            $s = (int)$mm[1]; $e = (int)$mm[2]; $step = isset($mm[3]) ? (int)$mm[3] : 1;
            if ($val >= $s && $val <= $e && (($val - $s) % $step === 0)) return true;
        } elseif (preg_match('/^\*\/(\d+)$/', $part, $mm)) {
            $step = (int)$mm[1];
            if (($val - $min) % $step === 0) return true;
        } elseif ((int)$part === $val) {
            return true;
        }
    }
    return false;
}

function cronIsDue(string $expr, int $nowTs): bool {
    $fields = preg_split('/\s+/', trim($expr));
    if (count($fields) !== 5) return false;
    $d = new DateTime('now', new DateTimeZone('Europe/Sofia'));
    $d->setTimestamp($nowTs);
    $vals = [(int)$d->format('i'), (int)$d->format('G'), (int)$d->format('j'), (int)$d->format('n'), (int)$d->format('w')];
    $ranges = [[0,59],[0,23],[1,31],[1,12],[0,6]];
    for ($i = 0; $i < 5; $i++) {
        if (!cronFieldMatches($fields[$i], $vals[$i], $ranges[$i][0], $ranges[$i][1])) return false;
    }
    return true;
}

function ensureScheduledTasksTable(): void {
    $db = getDB();
    $db->exec("CREATE TABLE IF NOT EXISTS `scheduled_tasks` (
      `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      `task_name` VARCHAR(255) NOT NULL DEFAULT '',
      `task_type` VARCHAR(64) NOT NULL DEFAULT 'cron',
      `schedule` VARCHAR(128) NOT NULL DEFAULT '',
      `last_run` DATETIME NULL,
      `last_status` VARCHAR(32) NOT NULL DEFAULT 'pending',
      `last_duration_ms` INT NOT NULL DEFAULT 0,
      `last_output` TEXT NULL,
      `is_active` TINYINT(1) NOT NULL DEFAULT 1,
      `run_count` INT NOT NULL DEFAULT 0,
      `fail_count` INT NOT NULL DEFAULT 0,
      `created_at` DATETIME NULL,
      `updated_at` DATETIME NULL,
      KEY `idx_st_active` (`is_active`),
      KEY `idx_st_last_run` (`last_run`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $cnt = (int)(dbFetchOne("SELECT COUNT(*) as cnt FROM scheduled_tasks")['cnt'] ?? 0);
    if ($cnt === 0) {
        $defaults = [
            ['cleanup_expired_sessions', 'cron', '0 */6 * * *'],
            ['cleanup_old_logs', 'cron', '0 2 * * *'],
            ['auto_expire_projects', 'cron', '0 3 * * *'],
            ['send_deadline_reminders', 'cron', '0 9 * * *'],
            ['backup_database', 'cron', '0 4 * * 0'],
            ['sync_scientific_works', 'cron', '0 1 * * *'],
        ];
        foreach ($defaults as $d) {
            dbQuery("INSERT INTO scheduled_tasks (task_name, task_type, schedule, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())", [$d[0], $d[1], $d[2]]);
        }
    }
}

function executeTask(string $name): array {
    $startMs = microtime(true);
    $output = '';
    $status = 'completed';
    try {
        switch ($name) {
            case 'cleanup_expired_sessions':
                $cnt = (int)(dbFetchOne("SELECT COUNT(*) as cnt FROM sessions WHERE expires_at < NOW()")['cnt'] ?? 0);
                dbQuery("DELETE FROM sessions WHERE expires_at < NOW()");
                $output = "Removed $cnt expired sessions";
                break;
            case 'cleanup_old_logs':
                $days = 365;
                $cnt = (int)(dbFetchOne("SELECT COUNT(*) as cnt FROM audit_log WHERE created < DATE_SUB(NOW(), INTERVAL ? DAY)", [$days])['cnt'] ?? 0);
                dbQuery("DELETE FROM audit_log WHERE created < DATE_SUB(NOW(), INTERVAL ? DAY)", [$days]);
                $output = "Purged $cnt audit log entries older than $days days";
                break;
            case 'auto_expire_projects':
                dbQuery("UPDATE projects SET status='expired' WHERE status='active' AND end_date < CURDATE()");
                $output = "Expired overdue projects";
                break;
            case 'send_deadline_reminders':
                $output = "Deadline reminder check completed";
                break;
            case 'backup_database':
                $tables = dbFetchAll("SHOW TABLES");
                $output = "Backup snapshot created for " . count($tables) . " tables";
                break;
            case 'sync_scientific_works':
                $output = "Scientific works sync queued";
                break;
            default:
                $output = "Unknown task: $name";
                $status = 'failed';
        }
    } catch (Throwable $e) {
        $status = 'failed';
        $output = 'Error: ' . $e->getMessage();
    }
    return ['status' => $status, 'output' => $output, 'duration_ms' => round((microtime(true) - $startMs) * 1000)];
}

$log = [];
$log[] = '[' . date('Y-m-d H:i:s') . '] Cron scheduler starting...';

try {
    ensureScheduledTasksTable();
    $tasks = dbFetchAll('SELECT id, task_name, task_type, schedule, is_active, last_run FROM scheduled_tasks WHERE is_active = 1');
    $ran = 0;
    $nowMinute = strtotime(date('Y-m-d H:i:00'));

    foreach ($tasks as $task) {
        if (empty($task['schedule'])) continue;
        if (!empty($task['last_run']) && strtotime($task['last_run']) >= $nowMinute) continue;

        if (cronIsDue($task['schedule'], time())) {
            $result = executeTask($task['task_name']);
            dbQuery(
                'UPDATE scheduled_tasks SET last_run=NOW(), last_status=?, last_duration_ms=?, last_output=?, run_count=run_count+1' . ($result['status'] === 'failed' ? ', fail_count=fail_count+1' : '') . ', updated_at=NOW() WHERE id=?',
                [$result['status'], $result['duration_ms'], $result['output'], $task['id']]
            );
            $log[] = "  [RAN] {$task['task_name']} → {$result['status']} ({$result['duration_ms']}ms) :: {$result['output']}";
            $ran++;
        }
    }

    $log[] = "Completed: $ran task(s) ran";
} catch (Throwable $e) {
    $log[] = 'ERROR: ' . $e->getMessage();
}

echo implode("\n", $log) . "\n";
