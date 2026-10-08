#!/usr/bin/env php
<?php
/**
 * ORCID/Scopus Staff Publications Crawler (v2)
 *
 * Fixed: uses correct ORCID response structure (activities-summary.works.group,
 * not activities-summary.activities:works.group).
 *
 * Usage: upload to server and run: php _crawl_pubs.php
 */
error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(0);

require_once __DIR__ . '/config.php';

echo "========================================\n";
echo "  ORCID/Scopus Staff Publications Crawler v2\n";
echo "  " . date('Y-m-d H:i:s') . "\n";
echo "========================================\n\n";

// ── Get staff members ─────────────────────────────────────────────────────────
$staff = dbFetchAll('SELECT email, full_name, orcid FROM user_scientific_profile WHERE email <> "" ORDER BY email ASC');

echo "Found " . count($staff) . " staff members\n\n";

// ── Fetch publications from ORCID ────────────────────────────────────────────
$totalNew = 0;
$totalUpdated = 0;
$totalPubs = 0;
$skipped = [];
$errors = [];

foreach ($staff as $i => $member) {
    $num = $i + 1;
    $email = $member['email'];
    $name = $member['full_name'];
    $orcid = $member['orcid'];

    echo "[$num/" . count($staff) . "] $name ($email)\n";

    if (empty($orcid)) {
        echo "    SKIP: No ORCID iD\n";
        $skipped[] = "$email (no ORCID)";
        continue;
    }

    if (!preg_match('/^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/i', $orcid)) {
        echo "    SKIP: Invalid ORCID format: $orcid\n";
        $skipped[] = "$email (invalid ORCID)";
        continue;
    }

    echo "    Fetching ORCID record for $orcid...\n";

    $url = 'https://pub.orcid.org/v3.0/' . urlencode($orcid) . '/record';

    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\nUser-Agent: UEV-ERP-Crawler/1.0\r\n",
            'timeout' => 30,
            'ignore_errors' => true,
        ],
    ]);

    $response = @file_get_contents($url, false, $ctx);

    if ($response === false) {
        echo "    ERROR: Failed to fetch ORCID record\n";
        $errors[] = "$email: HTTP request failed";
        continue;
    }

    $httpCode = 0;
    if (isset($http_response_header)) {
        foreach ($http_response_header as $header) {
            if (preg_match('/HTTP\/\d\.\d\s+(\d+)/', $header, $m)) {
                $httpCode = (int)$m[1];
                break;
            }
        }
    }

    if ($httpCode !== 200) {
        echo "    ERROR: ORCID returned HTTP $httpCode\n";
        $errors[] = "$email: ORCID HTTP $httpCode";
        continue;
    }

    $record = json_decode($response, true);

    if (!is_array($record)) {
        echo "    ERROR: Invalid ORCID JSON response\n";
        $errors[] = "$email: Invalid JSON";
        continue;
    }

    // Extract publications from correct path: activities-summary.works.group
    $publications = [];
    $works = $record['activities-summary']['works'] ?? null;
    
    if (!$works || !isset($works['group'])) {
        echo "    No works found in ORCID record\n";
    } else {
        $groups = $works['group'];
        echo "    Found " . count($groups) . " work groups\n";
        
        foreach ($groups as $group) {
            $workSummaries = $group['work-summary'] ?? [];
            foreach ($workSummaries as $work) {
                // Title
                $title = '';
                $workTitle = $work['title']['title']['value'] ?? '';
                if (is_string($workTitle)) {
                    $title = $workTitle;
                } elseif (is_array($workTitle)) {
                    $title = json_encode($workTitle);
                }
                if (empty($title)) continue;

                // Journal
                $journal = $work['journal-title']['value'] ?? '';

                // Year
                $year = null;
                $pubDate = $work['publication-date'] ?? [];
                if (!empty($pubDate)) {
                    $yearStr = $pubDate['year']['value'] ?? '';
                    if ($yearStr) $year = (int)$yearStr;
                }

                // DOI
                $doi = '';
                $externalIds = $work['external-ids']['external-id'] ?? [];
                foreach ($externalIds as $extId) {
                    if (($extId['external-id-type'] ?? '') === 'doi') {
                        $doi = $extId['external-id-value'] ?? '';
                        break;
                    }
                }

                // URL
                $pubUrl = '';
                if ($doi) {
                    $pubUrl = 'https://doi.org/' . $doi;
                } else {
                    $pubUrl = $work['url']['value'] ?? '';
                }

                $publications[] = [
                    'title' => $title,
                    'journal' => $journal,
                    'year' => $year,
                    'doi' => $doi,
                    'url' => $pubUrl,
                    'source' => 'orcid',
                ];
            }
        }
    }

    echo "    Total publications: " . count($publications) . "\n";
    $totalPubs += count($publications);

    // Store in database
    $stored = 0;
    $updated = 0;

    foreach ($publications as $pub) {
        $id = 'sw_' . md5($email . ($pub['doi'] ?: $pub['title']));

        $existing = dbFetchOne('SELECT id FROM scientific_works WHERE id = ?', [$id]);

        if ($existing) {
            dbQuery('UPDATE scientific_works SET title = ?, publication = ?, year = ?, doi = ?, url = ?, source = ? WHERE id = ?', [
                $pub['title'], $pub['journal'], $pub['year'], $pub['doi'], $pub['url'], $pub['source'], $id,
            ]);
            $updated++;
        } else {
            dbQuery('INSERT INTO scientific_works (id, author_email, title, authors, publication, year, doi, url, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())', [
                $id, $email, $pub['title'], $name, $pub['journal'], $pub['year'], $pub['doi'], $pub['url'], $pub['source'],
            ]);
            $stored++;
        }
    }

    dbQuery('UPDATE user_scientific_profile SET work_count = ?, last_synced = NOW() WHERE email = ?', [count($publications), $email]);

    echo "    Stored: $stored new, $updated updated\n";

    $totalNew += $stored;
    $totalUpdated += $updated;

    if ($num < count($staff)) {
        echo "    Waiting 1.2s (rate limit)...\n";
        usleep(1200000);
    }
    echo "\n";
}

// ── Summary ──────────────────────────────────────────────────────────────────
echo "========================================\n";
echo "  CRAWL COMPLETE\n";
echo "========================================\n";
echo "Members processed: " . count($staff) . "\n";
echo "Total publications found: $totalPubs\n";
echo "Total new works: $totalNew\n";
echo "Total updated: $totalUpdated\n";
echo "Skipped: " . count($skipped) . "\n";
echo "Errors: " . count($errors) . "\n";

if (!empty($errors)) {
    echo "\n--- ERRORS ---\n";
    foreach ($errors as $e) echo "  - $e\n";
}

echo "\n--- FINAL STATE ---\n";
$final = dbFetchAll('SELECT email, work_count, last_synced FROM user_scientific_profile ORDER BY work_count DESC');
foreach ($final as $row) {
    echo "  " . str_pad($row['email'], 35) . " | works=" . str_pad($row['work_count'] ?? 0, 4) . " | synced=" . ($row['last_synced'] ?? 'never') . "\n";
}

echo "\nDone at " . date('Y-m-d H:i:s') . "\n";
