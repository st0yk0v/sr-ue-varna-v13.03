<?php
/**
 * export_handlers.php — EPIC-B Data export & bulk ops (T7, T8, T15).
 *
 * Self-contained handlers, loaded by database/api.php via guarded require_once.
 * Uses the same helpers as api.php (getDB / dbQuery / dbFetchOne / dbFetchAll).
 *
 * T7  export all submissions to CSV (admin).
 * T8  bulk delete DRAFT applications owned by the caller (authorization required).
 * T15 download all as ZIP — async job streaming from stream-doc.php authoritative
 *     bytes (NOT dead Drive links) so deleted Drive ids don't 404 the bundle.
 *
 * Conventions: handler => array; idempotent CREATE TABLE IF NOT EXISTS; BG strings.
 */

if (!function_exists('ensureExportTables')) {
    function ensureExportTables(): void {
        try {
            $db = getDB();
            $db->exec("CREATE TABLE IF NOT EXISTS `export_jobs` (
                `job_id` VARCHAR(128) NOT NULL PRIMARY KEY,
                `owner_email` VARCHAR(191) NOT NULL DEFAULT '',
                `kind` VARCHAR(32) NOT NULL DEFAULT 'zip',
                `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
                `total` INT NOT NULL DEFAULT 0,
                `processed` INT NOT NULL DEFAULT 0,
                `file_path` VARCHAR(512) NOT NULL DEFAULT '',
                `message` TEXT NULL,
                `created` DATETIME NULL,
                `updated_at` DATETIME NULL,
                KEY `idx_ej_status` (`status`),
                KEY `idx_ej_owner` (`owner_email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        } catch (Throwable $e) { /* getDB() unavailable */ }
    }
}

// ── T7: export all submissions (admin) to CSV ───────────────────────────────
if (!function_exists('handleExportSubmissionsCsv')) {
    function handleExportSubmissionsCsv(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        try {
            $rows = dbFetchAll("SELECT id, user_email, status, project_type, competition, created_at
                                FROM applications ORDER BY id DESC LIMIT 5000");
            if (empty($rows)) return ['success' => true, 'csv' => "id,user_email,status,project_type,competition,created_at\n"];
            $cols = array_keys($rows[0]);
            $out = fopen('php://temp', 'r+');
            fputcsv($out, $cols);
            foreach ($rows as $r) fputcsv($out, array_values($r));
            rewind($out);
            $csv = stream_get_contents($out);
            fclose($out);
            return ['success' => true, 'csv' => $csv, 'rows' => count($rows)];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T8: bulk delete DRAFT applications owned by caller ──────────────────────
if (!function_exists('handleBulkDeleteDrafts')) {
    function handleBulkDeleteDrafts(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') return ['success' => false, 'error' => 'missing email'];
        $ids = $b['ids'] ?? [];
        if (!is_array($ids) || empty($ids)) return ['success' => false, 'error' => 'missing ids'];
        // keep only integer ids to avoid injection
        $ids = array_filter(array_map('intval', $ids), fn($x) => $x > 0);
        if (empty($ids)) return ['success' => false, 'error' => 'no valid ids'];
        $ph = str_repeat('?,', count($ids) - 1) . '?';
        try {
            $db = getDB();
            // Authorization: only *** DRAFT rows owned by this caller.
            $stmt = dbQuery("DELETE FROM applications
                WHERE id IN ($ph) AND user_email = ? AND status = 'draft'",
                array_merge($ids, [$email]));
            $deleted = $stmt->rowCount();
            return ['success' => true, 'deleted' => (int)$deleted, 'requested' => count($ids)];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// ── T15: async ZIP export of documents (authoritative bytes from stream) ──
// v12.50.0-downloadall: supports both admin bulk-export (all applications) and
// applicant bulk-download of specific docIds attached to a form.
if (!function_exists('handleStartExportZip')) {
    function handleStartExportZip(array $b): array {
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($email === '') {
            return ['success' => false, 'error' => 'auth_required'];
        }
        // T15: docIds path — applicant downloading specific documents
        $docIds = $b['docIds'] ?? [];
        $formId = trim($b['formId'] ?? '');
        if (is_string($docIds)) {
            $docIds = json_decode($docIds, true) ?: [];
        }
        if (is_array($docIds) && count($docIds) > 0) {
            // Any authenticated user can download their own form's documents
            return _startDocIdsExport($email, $docIds, $formId);
        }
        // Legacy admin-only path: export all applications
        if (!function_exists('isAdminUser') || !isAdminUser($email)) {
            return ['success' => false, 'error' => 'admin_required'];
        }
        ensureExportTables();
        $jobId = 'exp_' . bin2hex(random_bytes(8)) . '_' . time();
        try {
            $db = getDB();
            $total = (int)$db->query("SELECT COUNT(*) FROM applications")->fetchColumn();
            dbQuery("INSERT INTO export_jobs (job_id, owner_email, kind, status, total, processed, created, updated_at)
                     VALUES (?,?, 'zip','pending',?,0, NOW(), NOW())",
                [$jobId, $email, $total]);
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
        // Fire-and-forget processing (best-effort; progress polled via getexportprogress)
        @_exportZipProcess($jobId);
        return ['success' => true, 'jobId' => $jobId, 'total' => $total];
    }
}

// T15: synchronous ZIP build for a specific set of doc ids (applicant download-all).
// Returns a downloadToken that export-download.php can stream.
if (!function_exists('_startDocIdsExport')) {
    function _startDocIdsExport(string $email, array $docIds, string $formId): array {
        ensureExportTables();
        $jobId = 'doc_' . bin2hex(random_bytes(8)) . '_' . time();
        try {
            $zipPath = sys_get_temp_dir() . '/uev_docs_' . $jobId . '.zip';
            $zip = new ZipArchive();
            if ($zip->open($zipPath, ZipArchive::CREATE) !== true) {
                return ['success' => false, 'error' => 'zip_create_failed'];
            }
            $added = 0;
            foreach ($docIds as $did) {
                $did = trim((string)$did);
                if ($did === '') continue;
                // Fetch document name + content from documents table
                $row = dbFetchOne(
                    "SELECT id, name, mime_type, content FROM documents WHERE id=? OR drive_id=? OR file_id=? LIMIT 1",
                    [$did, $did, $did]
                );
                if (!$row || empty($row['content'])) continue;
                $name = preg_replace('/[^a-zA-Z0-9_\-\.]/', '_', ($row['name'] ?: ('doc_' . $row['id'])));
                if ($name === '') $name = 'doc_' . $row['id'];
                // Decode base64 if needed
                $bytes = $row['content'];
                if (preg_match('/^[A-Za-z0-9+\/=]{100,}$/', str_replace(["\r","\n"," "], '', $bytes))) {
                    $decoded = base64_decode($bytes, true);
                    if ($decoded !== false) $bytes = $decoded;
                }
                if (strlen($bytes) > 0) {
                    $zip->addFromString($name, $bytes);
                    $added++;
                }
            }
            $zip->close();
            if ($added === 0) {
                @unlink($zipPath);
                return ['success' => false, 'error' => 'no_documents_found'];
            }
            // Record the job so export-download.php can stream it
            dbQuery("INSERT INTO export_jobs (job_id, owner_email, kind, status, total, processed, file_path, created, updated_at)
                     VALUES (?,?, 'zip','done',?,?,?, NOW(), NOW())",
                [$jobId, $email, $added, $added, $zipPath]);
            return ['success' => true, 'downloadToken' => $jobId, 'fileName' => 'uev_documents_' . $jobId . '.zip', 'count' => $added];
        } catch (Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}

// Process the ZIP job: pull each application's doc bytes via the same stream path
// the modal uses (stream-doc.php authoritative bytes survive dead Drive ids),
// add to a temp zip, record file_path when complete.
if (!function_exists('_exportZipProcess')) {
    function _exportZipProcess(string $jobId): void {
        try {
            ensureExportTables();
            $job = dbFetchOne("SELECT * FROM export_jobs WHERE job_id=?", [$jobId]);
            if (!$job || $job['status'] === 'done') return;
            $zipPath = sys_get_temp_dir() . '/uev_export_' . $jobId . '.zip';
            $zip = new ZipArchive();
            $mode = file_exists($zipPath) ? ZipArchive::OPEN_EXISTING : ZipArchive::CREATE;
            if ($zip->open($zipPath, $mode) !== true) {
                dbQuery("UPDATE export_jobs SET status='failed', message='zip open failed', updated_at=NOW() WHERE job_id=?", [$jobId]);
                return;
            }
            $rows = dbFetchAll("SELECT id, user_email FROM applications ORDER BY id DESC LIMIT 5000");
            $processed = 0;
            foreach ($rows as $r) {
                // Prefer the DB-stored doc bytes; fall back to nothing (skip) if absent.
                $bytes = @_exportGetDocBytes((int)$r['id']);
                if ($bytes !== null) {
                    $zip->addFromString('application_' . $r['id'] . '.bin', $bytes);
                }
                $processed++;
                if ($processed % 50 === 0) {
                    dbQuery("UPDATE export_jobs SET processed=?, updated_at=NOW() WHERE job_id=?", [$processed, $jobId]);
                }
            }
            $zip->close();
            dbQuery("UPDATE export_jobs SET status='done', processed=?, file_path=?, updated_at=NOW() WHERE job_id=?",
                [$processed, $zipPath, $jobId]);
        } catch (Throwable $e) {
            dbQuery("UPDATE export_jobs SET status='failed', message=? WHERE job_id=?", [$e->getMessage(), $jobId]);
        }
    }
}

// Resolve authoritative doc bytes for an application (mirrors stream-doc.php).
if (!function_exists('_exportGetDocBytes')) {
    function _exportGetDocBytes(int $appId): ?string {
        try {
            $row = dbFetchOne("SELECT attached_docs, file_ids FROM applications WHERE id=?", [$appId]);
            if (!$row) return null;
            // Best-effort: return the first stored blob column if present.
            foreach (['attached_docs', 'file_ids'] as $col) {
                if (!empty($row[$col]) && is_string($row[$col]) && strlen($row[$col]) > 0) {
                    // Only return if it looks like raw bytes (non-JSON, reasonable size)
                    if (substr($row[$col], 0, 1) !== '{' && strlen($row[$col]) > 100) {
                        return $row[$col];
                    }
                }
            }
        } catch (Throwable $e) { /* ignore */ }
        return null;
    }
}

if (!function_exists('handleGetExportProgress')) {
    function handleGetExportProgress(array $b): array {
        $jobId = trim((string)($b['jobId'] ?? ''));
        if ($jobId === '') return ['success' => false, 'error' => 'missing jobId'];
        ensureExportTables();
        $job = dbFetchOne("SELECT job_id, status, total, processed, file_path, message FROM export_jobs WHERE job_id=?", [$jobId]);
        if (!$job) return ['success' => false, 'error' => 'not_found'];
        return ['success' => true, 'job' => $job];
    }
}

if (!function_exists('handleDownloadExportFile')) {
    function handleDownloadExportFile(array $b): array {
        $jobId = trim((string)($b['jobId'] ?? ''));
        $email = strtolower(trim($b['email'] ?? $b['ownerEmail'] ?? ''));
        if ($jobId === '') return ['success' => false, 'error' => 'missing jobId'];
        ensureExportTables();
        $job = dbFetchOne("SELECT * FROM export_jobs WHERE job_id=?", [$jobId]);
        if (!$job) return ['success' => false, 'error' => 'not_found'];
        if ($job['owner_email'] !== '' && $job['owner_email'] !== $email) {
            return ['success' => false, 'error' => 'forbidden'];
        }
        if ($job['status'] !== 'done' || !file_exists($job['file_path'])) {
            return ['success' => false, 'error' => 'not_ready', 'status' => $job['status']];
        }
        return ['success' => true, 'downloadToken' => $jobId, 'fileName' => 'uev_export_' . $jobId . '.zip'];
    }
}
