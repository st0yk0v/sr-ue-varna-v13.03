<?php
/**
 * Staff Publications API — ORCID + Scopus integration
 * Fetches scientific publications for a staff member using:
 * - ORCID Public API (keyless, free): https://pub.orcid.org/v3.0/
 * - Scopus Search API (needs API key): https://api.elsevier.com/content/search/scopus
 *
 * POST { action: 'fetchstaffpublications', email, name? }
 * Returns: { success, summary: { orcid, total, scopusAuthorId, hIndex }, publications: [...] }
 */

// Ensure veda_handlers.php is loaded (provides _vedaLookupByEmail, _vedaOrc, etc.)
if (!function_exists('_vedaLookupByEmail')) {
    require_once __DIR__ . '/veda_handlers.php';
}

// ── DB helper ─────────────────────────────────────────────────────────────
function _staffPdo(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

// ── Get or create staff ORCID record ──────────────────────────────────────
function _vedaGetOrCreateStaff(string $email): ?array {
    try {
        $pdo = _staffPdo();
        $st = $pdo->prepare('SELECT email, orcid_id, full_name, synced_at, work_count FROM staff_orcid WHERE email = ?');
        $st->execute([$email]);
        $row = $st->fetch();
        if ($row) return $row;
        return ['email' => $email, 'orcid_id' => null, 'full_name' => null, 'synced_at' => null, 'work_count' => 0];
    } catch (Throwable $e) {
        return null;
    }
}

// ── Save staff ORCID ──────────────────────────────────────────────────────
function handleSaveStaffOrCreate(array $params): array {
    $email = strtolower(trim($params['email'] ?? ''));
    $orcid = trim($params['orcid'] ?? '');
    $name = trim($params['name'] ?? '');
    if ($email === '') return ['success' => false, 'error' => 'Missing email'];
    if ($orcid === '') return ['success' => false, 'error' => 'Missing ORCID ID'];

    // Validate ORCID format
    if (!preg_match('/^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/i', $orcid)) {
        return ['success' => false, 'error' => 'Invalid ORCID format (expected: 0000-0000-0000-0000)'];
    }

    try {
        $pdo = _staffPdo();
        $st = $pdo->prepare('INSERT INTO staff_orcid (email, orcid_id, full_name, synced_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE orcid_id = VALUES(orcid_id), full_name = VALUES(full_name), synced_at = VALUES(synced_at)');
        $st->execute([$email, $orcid, $name]);
        return ['success' => true, 'email' => $email, 'orcid_id' => $orcid];
    } catch (Throwable $e) {
        return ['success' => false, 'error' => 'DB error: ' . $e->getMessage()];
    }
}

// ── Get staff ORCID ───────────────────────────────────────────────────────
function handleGetStaffOrCreate(array $params): array {
    $email = strtolower(trim($params['email'] ?? ''));
    if ($email === '') return ['success' => false, 'error' => 'Missing email'];

    $staff = _vedaGetOrCreateStaff($email);
    if (!$staff) return ['success' => false, 'error' => 'DB error'];

    return ['success' => true, 'staff' => $staff];
}

// ── Main handler ─────────────────────────────────────────────────────────
function handleFetchStaffPublications(array $b): array {
    $email = strtolower(trim($b['email'] ?? ''));
    $name = trim($b['name'] ?? '');
    if ($email === '' && $name === '') return ['success' => false, 'error' => 'Missing email or name'];

    $cfg = _vedaLoadConfig();
    $scopusKey = $cfg['scopusApiKey'] ?? '';
    $orcid = null;
    $publications = [];
    $scopusAuthorId = null;
    $hIndex = null;
    $summary = [];

    // ── Step 0: Check staff_orcid table for stored ORCID ──
    if ($email !== '') {
        $staff = _vedaGetOrCreateStaff($email);
        if ($staff && !empty($staff['orcid_id'])) {
            $orcid = $staff['orcid_id'];
        }
    }

    // ── Step 1: Resolve ORCID from email (if not already found) ──
    if (!$orcid && $email !== '') {
        $lookup = _vedaLookupByEmail($email);
        if ($lookup['ok'] && !empty($lookup['results'])) {
            $best = $lookup['results'][0];
            $orcid = $best['orcid'] ?? null;
            if (!$name && !empty($best['name'])) $name = $best['name'];
        }
    }

    // ── Step 2: If no ORCID from email, search by name ──
    if (!$orcid && $name !== '') {
        $search = _vedaOrcidSearch($name);
        if ($search['ok'] && !empty($search['results'])) {
            $best = $search['results'][0];
            $orcid = $best['orcid'] ?? null;
        }
    }

    // ── Step 3: Fetch ORCID record (works, employments, education) ──
    if ($orcid) {
        $rec = _vedaOrc($orcid);
        if ($rec['ok']) {
            $norm = _vedaNormalizeOrcId($rec['record']);
            foreach ($norm['publications'] as $pub) {
                $publications[] = [
                    'title'    => $pub['title'] ?? '',
                    'type'     => $pub['type'] ?? '',
                    'journal'  => $pub['journal'] ?? '',
                    'year'     => $pub['year'] ?? null,
                    'doi'      => $pub['doi'] ?? '',
                    'url'      => $pub['url'] ?? '',
                    'source'   => 'orcid',
                    'citedBy'  => $pub['citedBy'] ?? null,
                ];
            }
            $summary['orcid'] = $orcid;
            $summary['employments'] = count($norm['employments'] ?? []);
            $summary['education'] = count($norm['education'] ?? []);
        }
    }

    // ── Step 4: Fetch Scopus data (if API key configured) ──
    if ($scopusKey !== '' && $name !== '') {
        $scopusSearch = _vedaScopusAuthorSearch($name, $scopusKey);
        if ($scopusSearch['ok'] && !empty($scopusSearch['results'])) {
            $best = $scopusSearch['results'][0];
            $scopusAuthorId = $best['scopusAuthorId'] ?? null;
            $summary['scopusAuthorId'] = $scopusAuthorId;

            // Fetch metrics (h-index, citations)
            if ($scopusAuthorId) {
                $metrics = _vedaScopusMetrics($scopusAuthorId, $scopusKey);
                if ($metrics['ok']) {
                    $hIndex = $metrics['metrics']['hIndex'] ?? null;
                    $summary['hIndex'] = $hIndex;
                    $summary['citationCount'] = $metrics['metrics']['citationCount'] ?? null;
                    $summary['documentCount'] = $metrics['metrics']['documentCount'] ?? null;
                }

                // Fetch Scopus works
                $scopusWorks = _vedaScopusWorks($scopusAuthorId, $scopusKey);
                if ($scopusWorks['ok']) {
                    foreach ($scopusWorks['publications'] as $pub) {
                        // Deduplicate by DOI
                        $doi = $pub['doi'] ?? '';
                        $dup = false;
                        foreach ($publications as $existing) {
                            if ($doi && $existing['doi'] === $doi) { $dup = true; break; }
                        }
                        if (!$dup) {
                            $publications[] = [
                                'title'    => $pub['title'] ?? '',
                                'type'     => $pub['type'] ?? '',
                                'journal'  => $pub['journal'] ?? '',
                                'year'     => $pub['year'] ?? null,
                                'doi'      => $doi,
                                'url'      => $pub['url'] ?? '',
                                'source'   => 'scopus',
                                'citedBy'  => $pub['citedBy'] ?? null,
                                'authors'  => $pub['authors'] ?? '',
                            ];
                        }
                    }
                }
            }
        }
    }

    // ── Step 5: Sort by year desc ──
    usort($publications, function ($a, $b) {
        return ($b['year'] ?? 0) - ($a['year'] ?? 0);
    });

    $summary['total'] = count($publications);
    $summary['orcid'] = $orcid;
    $summary['scopusConfigured'] = ($scopusKey !== '');

    return [
        'success' => true,
        'summary' => $summary,
        'publications' => array_values($publications),
        'count' => count($publications),
    ];
}
