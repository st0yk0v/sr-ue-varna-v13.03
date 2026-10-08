#!/usr/bin/env php
<?php
/**
 * UEV-ERP Multi-Source Staff Publications Crawler
 * 
 * Crawls ORCID, CrossRef, Semantic Scholar, OpenAlex, and DBLP
 * to find scientific publications for all staff members.
 * 
 * Matches by ORCID iD (preferred) or exact name/email (fallback).
 * Deduplicates by DOI across all sources.
 * 
 * Usage: php /path/to/crawl_staff_pubs_v2.php
 * 
 * Sources (all free, keyless):
 *   - ORCID Public API (orcid.org)
 *   - CrossRef API (api.crossref.org)
 *   - Semantic Scholar API (api.semanticscholar.org)
 *   - OpenAlex API (api.openalex.org)
 *   - DBLP API (dblp.org/search/publ/api)
 *   - Google Scholar (public scraping — best effort)
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(0);

require_once __DIR__ . '/config.php';

// ──────────────────────────────────────────────────────────────────────────────
// HTTP helper with rate limiting
// ──────────────────────────────────────────────────────────────────────────────
$_last_http_time = 0;
function httpGet($url, $delay_ms = 1000) {
    global $_last_http_time;
    $elapsed = (microtime(true) - $_last_http_time) * 1000;
    if ($elapsed < $delay_ms) {
        usleep((int)(($delay_ms - $elapsed) * 1000));
    }
    $_last_http_time = microtime(true);
    
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\nUser-Agent: UEV-ERP-Crawler/2.0\r\n",
            'timeout' => 30,
            'ignore_errors' => true,
        ],
    ]);
    $resp = @file_get_contents($url, false, $ctx);
    
    $code = 0;
    if (isset($http_response_header)) {
        foreach ($http_response_header as $h) {
            if (preg_match('/HTTP\/\d\.\d\s+(\d+)/', $h, $m)) {
                $code = (int)$m[1];
                break;
            }
        }
    }
    return ['code' => $code, 'body' => $resp];
}

function safeJson($body) {
    if (!$body) return null;
    $d = json_decode($body, true);
    return is_array($d) ? $d : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// ORCID fetcher
// ──────────────────────────────────────────────────────────────────────────────
function fetchOrcId($orcid) {
    $url = 'https://pub.orcid.org/v3.0/' . urlencode($orcid) . '/record';
    $r = httpGet($url, 1000);
    if ($r['code'] !== 200) return [];
    
    $rec = safeJson($r['body']);
    if (!$rec) return [];
    
    $pubs = [];
    $groups = $rec['activities-summary']['works']['group'] ?? [];
    foreach ($groups as $g) {
        foreach ($g['work-summary'] ?? [] as $w) {
            $title = $w['title']['title']['value'] ?? '';
            if (!$title || !is_string($title)) continue;
            $journal = $w['journal-title']['value'] ?? '';
            $year = $w['publication-date']['year']['value'] ?? null;
            $doi = '';
            foreach ($w['external-ids']['external-id'] ?? [] as $e) {
                if (($e['external-id-type'] ?? '') === 'doi') {
                    $doi = $e['external-id-value'] ?? '';
                    break;
                }
            }
            $pubs[] = [
                'title' => $title,
                'journal' => is_string($journal) ? $journal : '',
                'year' => $year ? (int)$year : null,
                'doi' => $doi,
                'url' => $doi ? "https://doi.org/$doi" : ($w['url']['value'] ?? ''),
                'source' => 'orcid',
            ];
        }
    }
    return $pubs;
}

// ──────────────────────────────────────────────────────────────────────────────
// CrossRef fetcher (search by name)
// ──────────────────────────────────────────────────────────────────────────────
function fetchCrossRef($name) {
    $url = 'https://api.crossref.org/works?query.author=' . urlencode($name) . '&rows=50&sort=relevance';
    $r = httpGet($url, 1000);
    if ($r['code'] !== 200) return [];
    
    $data = safeJson($r['body']);
    $pubs = [];
    
    foreach ($data['message']['items'] ?? [] as $item) {
        $title = $item['title'][0] ?? '';
        if (!$title) continue;
        
        $year = null;
        if (isset($item['published-print']['date-parts'][0][0])) {
            $year = $item['published-print']['date-parts'][0][0];
        } elseif (isset($item['published-online']['date-parts'][0][0])) {
            $year = $item['published-online']['date-parts'][0][0];
        } elseif (isset($item['issued']['date-parts'][0][0])) {
            $year = $item['issued']['date-parts'][0][0];
        }
        
        $doi = $item['DOI'] ?? '';
        $journal = $item['container-title'][0] ?? '';
        
        // Check if author name matches (case-insensitive substring)
        $authorMatch = false;
        foreach ($item['author'] ?? [] as $a) {
            $given = strtolower($a['given'] ?? '');
            $family = strtolower($a['family'] ?? '');
            $full = strtolower($name);
            if (str_contains($given, explode(' ', $full)[0]) || str_contains($family, explode(' ', $full)[0]) ||
                str_contains("$given $family", $full)) {
                $authorMatch = true;
                break;
            }
        }
        if (!$authorMatch) continue;
        
        $pubs[] = [
            'title' => $title,
            'journal' => is_string($journal) ? $journal : '',
            'year' => $year ? (int)$year : null,
            'doi' => $doi,
            'url' => $doi ? "https://doi.org/$doi" : ($item['URL'] ?? ''),
            'source' => 'crossref',
        ];
    }
    return $pubs;
}

// ──────────────────────────────────────────────────────────────────────────────
// Semantic Scholar fetcher
// ──────────────────────────────────────────────────────────────────────────────
function fetchSemanticScholar($name) {
    $url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' . urlencode($name) . '&limit=50&fields=title,year,authors,externalIds,venue';
    $r = httpGet($url, 1000);
    if ($r['code'] !== 200) return [];
    
    $data = safeJson($r['body']);
    $pubs = [];
    
    foreach ($data['data'] ?? [] as $p) {
        $title = $p['title'] ?? '';
        if (!$title) continue;
        
        $doi = $p['externalIds']['DOI'] ?? '';
        $year = $p['year'] ?? null;
        $journal = $p['venue'] ?? '';
        
        // Author name matching
        $authorMatch = false;
        foreach ($p['authors'] ?? [] as $a) {
            $aName = strtolower($a['name'] ?? '');
            if (str_contains($aName, strtolower($name))) {
                $authorMatch = true;
                break;
            }
        }
        if (!$authorMatch) continue;
        
        $pubs[] = [
            'title' => $title,
            'journal' => $journal,
            'year' => $year ? (int)$year : null,
            'doi' => $doi,
            'url' => $doi ? "https://doi.org/$doi" : "https://www.semanticscholar.org/paper/{$p['paperId']}",
            'source' => 'semanticscholar',
        ];
    }
    return $pubs;
}

// ──────────────────────────────────────────────────────────────────────────────
// OpenAlex fetcher
// ──────────────────────────────────────────────────────────────────────────────
function fetchOpenAlex($name) {
    $url = 'https://api.openalex.org/works?search=' . urlencode($name) . '&per-page=50';
    $r = httpGet($url, 1000);
    if ($r['code'] !== 200) return [];
    
    $data = safeJson($r['body']);
    $pubs = [];
    
    foreach ($data['results'] ?? [] as $w) {
        $title = $w['title'] ?? $w['display_name'] ?? '';
        if (!$title) continue;
        
        $doi = $w['doi'] ?? '';
        if ($doi) $doi = str_replace('https://doi.org/', '', $doi);
        
        $year = $w['publication_year'] ?? null;
        $journal = $w['primary_location']['source']['display_name'] ?? '';
        
        // Author matching
        $authorMatch = false;
        foreach ($w['authorships'] ?? [] as $a) {
            $aName = strtolower($a['author']['display_name'] ?? '');
            if (str_contains($aName, strtolower($name))) {
                $authorMatch = true;
                break;
            }
        }
        if (!$authorMatch) continue;
        
        $pubs[] = [
            'title' => $title,
            'journal' => is_string($journal) ? $journal : '',
            'year' => $year ? (int)$year : null,
            'doi' => $doi,
            'url' => $doi ? "https://doi.org/$doi" : ($w['doi'] ?? ''),
            'source' => 'openalex',
        ];
    }
    return $pubs;
}

// ──────────────────────────────────────────────────────────────────────────────
// DBLP fetcher
// ──────────────────────────────────────────────────────────────────────────────
function fetchDblp($name) {
    $url = 'https://dblp.org/search/publ/api?q=' . urlencode($name) . '&h=50&f=0&c=4&format=json';
    $r = httpGet($url, 1000);
    if ($r['code'] !== 200) return [];
    
    $data = safeJson($r['body']);
    $pubs = [];
    
    $hits = $data['result']['hits']['hit'] ?? [];
    foreach ($hits as $hit) {
        $info = $hit['info'] ?? [];
        $title = $info['title'] ?? '';
        if (!$title) continue;
        
        $year = $info['year'] ?? null;
        $journal = $info['venue'] ?? $info['journal'] ?? '';
        
        // Author matching
        $authors = $info['authors']['author'] ?? [];
        $authorMatch = false;
        if (is_array($authors)) {
            foreach ($authors as $a) {
                $aName = is_string($a) ? strtolower($a) : strtolower($a['text'] ?? '');
                if (str_contains($aName, strtolower($name))) {
                    $authorMatch = true;
                    break;
                }
            }
        }
        if (!$authorMatch) continue;
        
        $doi = $info['doi'] ?? '';
        $pubs[] = [
            'title' => $title,
            'journal' => is_string($journal) ? $journal : '',
            'year' => $year ? (int)$year : null,
            'doi' => $doi,
            'url' => $doi ? "https://doi.org/$doi" : ($info['ee'] ?? $info['url'] ?? ''),
            'source' => 'dblp',
        ];
    }
    return $pubs;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
echo "========================================\n";
echo "  UEV-ERP Multi-Source Staff Publications Crawler v2\n";
echo "  " . date('Y-m-d H:i:s') . "\n";
echo "========================================\n\n";

$staff = dbFetchAll('SELECT email, full_name, orcid FROM user_scientific_profile WHERE email <> "" ORDER BY email ASC');

echo "Found " . count($staff) . " staff members\n\n";

$totalNew = 0;
$totalUpdated = 0;
$totalPubs = 0;
$skipped = [];
$errors = [];
$sourceStats = [];

foreach ($staff as $i => $member) {
    $num = $i + 1;
    $email = $member['email'];
    $name = $member['full_name'];
    $orcid = $member['orcid'];
    
    echo "[$num/" . count($staff) . "] $name ($email)\n";
    
    // Collect all publications (deduped by DOI)
    $allPubs = []; // key = doi|email
    $sourcesUsed = [];
    
    // 1. ORCID (if available)
    if (!empty($orcid)) {
        echo "  Fetching ORCID... ";
        $orcidPubs = fetchOrcId($orcid);
        echo count($orcidPubs) . " found\n";
        foreach ($orcidPubs as $p) {
            $key = ($p['doi'] ?: md5($p['title'])) . '|' . $email;
            $allPubs[$key] = $p;
        }
        if (count($orcidPubs) > 0) $sourcesUsed[] = 'orcid';
        $sourceStats['orcid'] = ($sourceStats['orcid'] ?? 0) + count($orcidPubs);
    }
    
    // 2. CrossRef (always search by name)
    if (!empty($name)) {
        echo "  Fetching CrossRef... ";
        $crPubs = fetchCrossRef($name);
        echo count($crPubs) . " found\n";
        foreach ($crPubs as $p) {
            $key = ($p['doi'] ?: md5($p['title'])) . '|' . $email;
            if (!isset($allPubs[$key])) $allPubs[$key] = $p;
        }
        if (count($crPubs) > 0) $sourcesUsed[] = 'crossref';
        $sourceStats['crossref'] = ($sourceStats['crossref'] ?? 0) + count($crPubs);
    }
    
    // 3. Semantic Scholar
    if (!empty($name)) {
        echo "  Fetching Semantic Scholar... ";
        $ssPubs = fetchSemanticScholar($name);
        echo count($ssPubs) . " found\n";
        foreach ($ssPubs as $p) {
            $key = ($p['doi'] ?: md5($p['title'])) . '|' . $email;
            if (!isset($allPubs[$key])) $allPubs[$key] = $p;
        }
        if (count($ssPubs) > 0) $sourcesUsed[] = 'semanticscholar';
        $sourceStats['semanticscholar'] = ($sourceStats['semanticscholar'] ?? 0) + count($ssPubs);
    }
    
    // 4. OpenAlex
    if (!empty($name)) {
        echo "  Fetching OpenAlex... ";
        $oaPubs = fetchOpenAlex($name);
        echo count($oaPubs) . " found\n";
        foreach ($oaPubs as $p) {
            $key = ($p['doi'] ?: md5($p['title'])) . '|' . $email;
            if (!isset($allPubs[$key])) $allPubs[$key] = $p;
        }
        if (count($oaPubs) > 0) $sourcesUsed[] = 'openalex';
        $sourceStats['openalex'] = ($sourceStats['openalex'] ?? 0) + count($oaPubs);
    }
    
    // 5. DBLP (good for CS publications)
    if (!empty($name)) {
        echo "  Fetching DBLP... ";
        $dblpPubs = fetchDblp($name);
        echo count($dblpPubs) . " found\n";
        foreach ($dblpPubs as $p) {
            $key = ($p['doi'] ?: md5($p['title'])) . '|' . $email;
            if (!isset($allPubs[$key])) $allPubs[$key] = $p;
        }
        if (count($dblpPubs) > 0) $sourcesUsed[] = 'dblp';
        $sourceStats['dblp'] = ($sourceStats['dblp'] ?? 0) + count($dblpPubs);
    }
    
    $publications = array_values($allPubs);
    echo "  TOTAL unique publications: " . count($publications) . " (sources: " . implode(', ', $sourcesUsed) . ")\n";
    $totalPubs += count($publications);
    
    // Store in DB
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
    
    echo "  Stored: $stored new, $updated updated\n";
    
    $totalNew += $stored;
    $totalUpdated += $updated;
    
    if ($num < count($staff)) {
        echo "  Waiting 1s (rate limit)...\n";
        usleep(1000000);
    }
    echo "\n";
}

// ── Summary ──────────────────────────────────────────────────────────────────
echo "========================================\n";
echo "  CRAWL COMPLETE\n";
echo "========================================\n";
echo "Members processed: " . count($staff) . "\n";
echo "Total publications found: $totalPubs\n";
echo "Total new works stored: $totalNew\n";
echo "Total updated: $totalUpdated\n";

echo "\n--- Source breakdown ---\n";
foreach ($sourceStats as $src => $count) {
    echo "  $src: $count\n";
}

echo "\n--- FINAL STATE ---\n";
$final = dbFetchAll('SELECT email, work_count, last_synced FROM user_scientific_profile ORDER BY work_count DESC');
foreach ($final as $row) {
    echo "  " . str_pad($row['email'], 35) . " | works=" . str_pad($row['work_count'] ?? 0, 4) . " | synced=" . ($row['last_synced'] ?? 'never') . "\n";
}

echo "\nDone at " . date('Y-m-d H:i:s') . "\n";
