#!/usr/bin/env php
<?php
/**
 * UEV-ERP Comprehensive Publications Knowledge Base Builder
 * 
 * Fetches publications for all staff members from multiple sources
 * with pagination, ORCID resolution, and full metadata enrichment.
 *
 * Sources:
 *   - ORCID (for members with ORCID iD)
 *   - CrossRef (paginated, up to 200 per member)
 *   - OpenAlex (paginated, up to 200 per member)
 *   - Semantic Scholar (paginated, up to 100 per member)
 *   - DBLP (up to 100 per member)
 *   - ORCID auto-resolution via email/name search
 *
 * Usage: php /path/to/build_knowledge_base.php
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(0);

require_once '/home/u129919172/domains/sr-ue-varna.com/public_html/database/config.php';

$db = getDB();

echo "========================================\n";
echo "  UEV-ERP Knowledge Base Builder v3\n";
echo "  " . date('Y-m-d H:i:s') . "\n";
echo "========================================\n\n";

// Stats
$totalStaff = $db->query("SELECT COUNT(*) FROM user_scientific_profile WHERE email != ''")->fetchColumn();
$withORCID = $db->query("SELECT COUNT(*) FROM user_scientific_profile WHERE orcid IS NOT NULL AND orcid != ''")->fetchColumn();
$totalWorks = $db->query("SELECT COUNT(*) FROM scientific_works")->fetchColumn();

// Add knowledge_base table
try {
    $db->exec("CREATE TABLE IF NOT EXISTS `knowledge_base` (
        `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        `staff_email` VARCHAR(255) NOT NULL,
        `title` TEXT NULL,
        `authors` TEXT NULL,
        `journal` TEXT NULL,
        `year` INT NULL,
        `doi` VARCHAR(255) NULL,
        `url` TEXT NULL,
        `abstract` TEXT NULL,
        `keywords` TEXT NULL,
        `citations` INT DEFAULT 0,
        `source` VARCHAR(32) NULL,
        `verified` TINYINT(1) DEFAULT 0,
        `created` DATETIME NULL,
        KEY `idx_kb_email` (`staff_email`),
        KEY `idx_kb_doi` (`doi`),
        KEY `idx_kb_year` (`year`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    echo "knowledge_base table ready\n";
} catch (PDOException $e) {
    echo "KB table: " . $e->getMessage() . "\n";
}

echo "Total staff: $totalStaff\n";
echo "With ORCID: $withORCID\n";
echo "Total works: $totalWorks\n\n";

// Get all staff
$staff = $db->query("SELECT email, full_name, orcid FROM user_scientific_profile WHERE email != '' ORDER BY email ASC")->fetchAll(PDO::FETCH_ASSOC);

$grandTotalPubs = 0;
$grandNew = 0;
$grandUpdated = 0;
$sourceStats = [];
$orcidResolved = 0;

foreach ($staff as $i => $member) {
    $num = $i + 1;
    $email = $member['email'];
    $name = $member['full_name'];
    $orcid = $member['orcid'];
    
    echo "[$num/$totalStaff] $name ($email)\n";
    
    $allPubs = [];
    
    // 1. Auto-resolve ORCID if missing
    if (empty($orcid)) {
        echo "  Resolving ORCID... ";
        $resolved = resolveORCID($email, $name);
        if ($resolved) {
            $orcid = $resolved;
            $upd = $db->prepare("UPDATE user_scientific_profile SET orcid = ? WHERE email = ?");
            $upd->execute([$orcid, $email]);
            $orcidResolved++;
            echo "$orcid\n";
        } else {
            echo "not found\n";
        }
    }
    
    // 2. ORCID (if available)
    if (!empty($orcid) && preg_match('/^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/i', $orcid)) {
        echo "  ORCID... ";
        $orcidPubs = fetchORCID($orcid);
        foreach ($orcidPubs as $p) {
            $key = makeKey($p, $email);
            $allPubs[$key] = array_merge($p, ['source' => 'orcid']);
        }
        echo count($orcidPubs) . " works\n";
        $sourceStats['orcid'] = ($sourceStats['orcid'] ?? 0) + count($orcidPubs);
        usleep(1100000); // ORCID rate limit: 1 req/sec
    }
    
    // 3. CrossRef (paginated)
    if (!empty($name)) {
        echo "  CrossRef... ";
        $crPubs = fetchCrossRefPaginated($name, 200);
        $new = 0;
        foreach ($crPubs as $p) {
            $key = makeKey($p, $email);
            if (!isset($allPubs[$key])) {
                $allPubs[$key] = array_merge($p, ['source' => 'crossref']);
                $new++;
            }
        }
        echo count($crPubs) . " found, $new new\n";
        $sourceStats['crossref'] = ($sourceStats['crossref'] ?? 0) + count($crPubs);
        usleep(1000000);
    }
    
    // 4. OpenAlex (paginated)
    if (!empty($name)) {
        echo "  OpenAlex... ";
        $oaPubs = fetchOpenAlexPaginated($name, 200);
        $new = 0;
        foreach ($oaPubs as $p) {
            $key = makeKey($p, $email);
            if (!isset($allPubs[$key])) {
                $allPubs[$key] = array_merge($p, ['source' => 'openalex']);
                $new++;
            }
        }
        echo count($oaPubs) . " found, $new new\n";
        $sourceStats['openalex'] = ($sourceStats['openalex'] ?? 0) + count($oaPubs);
        usleep(1000000);
    }
    
    // 5. Semantic Scholar
    if (!empty($name)) {
        echo "  Semantic Scholar... ";
        $ssPubs = fetchSemanticScholar($name);
        $new = 0;
        foreach ($ssPubs as $p) {
            $key = makeKey($p, $email);
            if (!isset($allPubs[$key])) {
                $allPubs[$key] = array_merge($p, ['source' => 'semanticscholar']);
                $new++;
            }
        }
        echo count($ssPubs) . " found, $new new\n";
        $sourceStats['semanticscholar'] = ($sourceStats['semanticscholar'] ?? 0) + count($ssPubs);
        usleep(1000000);
    }
    
    // 6. DBLP (good for CS)
    if (!empty($name)) {
        echo "  DBLP... ";
        $dblpPubs = fetchDBLP($name);
        $new = 0;
        foreach ($dblpPubs as $p) {
            $key = makeKey($p, $email);
            if (!isset($allPubs[$key])) {
                $allPubs[$key] = array_merge($p, ['source' => 'dblp']);
                $new++;
            }
        }
        echo count($dblpPubs) . " found, $new new\n";
        $sourceStats['dblp'] = ($sourceStats['dblp'] ?? 0) + count($dblpPubs);
        usleep(1000000);
    }
    
    $publications = array_values($allPubs);
    $grandTotalPubs += count($publications);
    
    // Store
    $stored = 0;
    $upd = 0;
    foreach ($publications as $pub) {
        $id = 'sw_' . md5($email . ($pub['doi'] ?: $pub['title']));
        $existing = $db->prepare("SELECT id FROM scientific_works WHERE id = ?");
        $existing->execute([$id]);
        
        $title = mb_substr($pub['title'] ?? '', 0, 1000);
        $journal = mb_substr($pub['journal'] ?? '', 0, 1000);
        $doi = mb_substr($pub['doi'] ?? '', 0, 255);
        $url = mb_substr($pub['url'] ?? '', 0, 2000);
        $source = mb_substr($pub['source'] ?? '', 0, 32);
        $year = isset($pub['year']) ? intval($pub['year']) : null;
        
        if ($existing->fetch()) {
            $u = $db->prepare("UPDATE scientific_works SET title = ?, publication = ?, year = ?, doi = ?, url = ?, source = ?, cited_by = ? WHERE id = ?");
            $u->execute([$title, $journal, $year, $doi, $url, $source, $pub['cited_by'] ?? null, $id]);
            $upd++;
        } else {
            $in = $db->prepare("INSERT INTO scientific_works (id, author_email, title, authors, publication, year, doi, url, source, cited_by, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
            $in->execute([$id, $email, $title, $name, $journal, $year, $doi, $url, $source, $pub['cited_by'] ?? null]);
            $stored++;
        }
    }
    
    $db->prepare("UPDATE user_scientific_profile SET work_count = ?, last_synced = NOW() WHERE email = ?")->execute([count($publications), $email]);
    
    // Also populate knowledge_base table (deduped by DOI)
    foreach ($publications as $pub) {
        if (empty($pub['doi'])) continue; // Only store DOI-tagged works in KB
        $kbId = 'kb_' . md5($email . $pub['doi']);
        $kbCheck = $db->prepare("SELECT id FROM knowledge_base WHERE id = ?");
        $kbCheck->execute([$kbId]);
        if (!$kbCheck->fetch()) {
            $kbIns = $db->prepare("INSERT INTO knowledge_base (id, staff_email, title, authors, journal, year, doi, url, citations, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())");
            $kbIns->execute([
                $kbId, $email,
                mb_substr($pub['title'] ?? '', 0, 1000),
                $name,
                mb_substr($pub['journal'] ?? '', 0, 1000),
                isset($pub['year']) ? intval($pub['year']) : null,
                mb_substr($pub['doi'] ?? '', 0, 255),
                mb_substr($pub['url'] ?? '', 0, 2000),
                $pub['cited_by'] ?? 0,
                $pub['source'] ?? ''
            ]);
        }
    }
    
    echo "  Stored: $stored new, $upd updated (total: " . count($publications) . ")\n";
    $grandNew += $stored;
    $grandUpdated += $upd;
    
    if ($num < $totalStaff) {
        echo "\n";
    }
}

echo "\n========================================\n";
echo "  KNOWLEDGE BASE BUILD COMPLETE\n";
echo "========================================\n";
echo "Publications found: $grandTotalPubs\n";
echo "New works: $grandNew\n";
echo "Updated: $grandUpdated\n";
echo "ORCID resolved: $orcidResolved\n";
echo "\nSource breakdown:\n";
foreach ($sourceStats as $src => $cnt) {
    echo "  $src: $cnt\n";
}

echo "\n--- TOP 20 ---\n";
$top = $db->query("SELECT email, full_name, work_count FROM user_scientific_profile WHERE work_count > 0 ORDER BY work_count DESC LIMIT 20");
foreach ($top as $row) {
    echo "  " . str_pad($row['email'], 35) . " | " . str_pad($row['full_name'] ?? '', 25) . " | " . $row['work_count'] . "\n";
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────────────────────────────────────

function makeKey($pub, $email) {
    $doi = $pub['doi'] ?? '';
    $title = $pub['title'] ?? '';
    return ($doi ? 'doi_' . md5($doi) : 'ti_' . mb_substr(md5($title), 0, 16)) . '|' . $email;
}

function httpGet($url) {
    $ctx = stream_context_create([
        'http' => [
            'method' => 'GET',
            'header' => "Accept: application/json\r\nUser-Agent: UEV-ERP-KnowledgeBase/3.0\r\n",
            'timeout' => 30,
            'ignore_errors' => true,
        ],
    ]);
    $resp = @file_get_contents($url, false, $ctx);
    $code = 0;
    if (isset($http_response_header)) {
        foreach ($http_response_header as $h) {
            if (preg_match('/HTTP\/\d\.\d\s+(\d+)/', $h, $m)) { $code = (int)$m[1]; break; }
        }
    }
    return ['code' => $code, 'body' => $resp];
}

function resolveORCID($email, $name) {
    // Try email first
    $url = 'https://pub.orcid.org/v3.0/search/?q=email:' . urlencode($email);
    $r = httpGet($url);
    if ($r['code'] === 200) {
        $data = json_decode($r['body'], true);
        $result = $data['result'][0]['orcid-identifier']['path'] ?? null;
        if ($result) return $result;
    }
    // Try name
    $nameParts = explode(' ', $name);
    if (count($nameParts) >= 2) {
        $url = 'https://pub.orcid.org/v3.0/search/?q=family-name:' . urlencode(end($nameParts)) . '+AND+given-names:' . urlencode($nameParts[0]);
        $r = httpGet($url);
        if ($r['code'] === 200) {
            $data = json_decode($r['body'], true);
            $result = $data['result'][0]['orcid-identifier']['path'] ?? null;
            if ($result) return $result;
        }
    }
    return null;
}

function fetchORCID($orcid) {
    $url = 'https://pub.orcid.org/v3.0/' . urlencode($orcid) . '/record';
    $r = httpGet($url);
    if ($r['code'] !== 200) return [];
    
    $rec = json_decode($r['body'], true);
    if (!$rec || !is_array($rec)) return [];
    
    $pubs = [];
    $groups = $rec['activities-summary']['works']['group'] ?? [];
    if (!is_array($groups)) return [];
    
    foreach ($groups as $g) {
        if (!is_array($g)) continue;
        $summaries = $g['work-summary'] ?? [];
        if (!is_array($summaries)) continue;
        
        foreach ($summaries as $w) {
            if (!is_array($w)) continue;
            
            // Null-safe title extraction
            $title = '';
            if (isset($w['title']) && is_array($w['title'])) {
                if (isset($w['title']['title']) && is_array($w['title']['title'])) {
                    $title = $w['title']['title']['value'] ?? '';
                }
            }
            if (!$title || !is_string($title)) continue;
            
            $doi = '';
            $extIds = $w['external-ids']['external-id'] ?? [];
            if (is_array($extIds)) {
                foreach ($extIds as $e) {
                    if (is_array($e) && (($e['external-id-type'] ?? '') === 'doi')) {
                        $doi = $e['external-id-value'] ?? '';
                        break;
                    }
                }
            }
            
            $journal = '';
            $jt = $w['journal-title']['value'] ?? '';
            if (is_string($jt)) $journal = $jt;
            
            $year = null;
            $yd = $w['publication-date']['year']['value'] ?? null;
            if ($yd) $year = (int)$yd;
            
            $pubs[] = [
                'title' => $title,
                'journal' => $journal,
                'year' => $year,
                'doi' => $doi,
                'url' => $doi ? "https://doi.org/$doi" : '',
                'cited_by' => null,
            ];
        }
    }
    return $pubs;
}

function fetchCrossRef($name, $rows = 100) {
    $url = 'https://api.crossref.org/works?query.author=' . urlencode($name) . '&rows=' . $rows . '&sort=relevance&select=DOI,title,author,container-title,issued,published-print,published-online,URL,type';
    $r = httpGet($url);
    if ($r['code'] !== 200) return [];
    
    $data = json_decode($r['body'], true);
    $pubs = [];
    
    foreach ($data['message']['items'] ?? [] as $item) {
        $title = $item['title'][0] ?? '';
        if (!$title) continue;
        
        $doi = $item['DOI'] ?? '';
        $year = $item['published-print']['date-parts'][0][0] ?? ($item['published-online']['date-parts'][0][0] ?? ($item['issued']['date-parts'][0][0] ?? null));
        
        // Author match
        $match = false;
        foreach ($item['author'] ?? [] as $a) {
            $given = strtolower($a['given'] ?? '');
            $family = strtolower($a['family'] ?? '');
            $lowerName = strtolower($name);
            if (str_contains($given, explode(' ', $lowerName)[0] ?? '') || str_contains($family, explode(' ', $lowerName)[0] ?? '')) {
                $match = true; break;
            }
        }
        if (!$match) continue;
        
        $pubs[] = [
            'title' => $title,
            'journal' => $item['container-title'][0] ?? '',
            'year' => $year ? (int)$year : null,
            'doi' => $doi,
            'url' => $doi ? "https://doi.org/$doi" : '',
            'cited_by' => null,
        ];
    }
    return $pubs;
}

function fetchCrossRefPaginated($name, $max = 200) {
    $allPubs = [];
    $offset = 0;
    $perPage = 50;
    
    while ($offset < $max) {
        $url = 'https://api.crossref.org/works?query.author=' . urlencode($name) . '&rows=' . $perPage . '&offset=' . $offset . '&sort=relevance';
        $r = httpGet($url);
        if ($r['code'] !== 200) break;
        
        $data = json_decode($r['body'], true);
        $items = $data['message']['items'] ?? [];
        
        if (empty($items)) break;
        
        foreach ($items as $item) {
            $title = $item['title'][0] ?? '';
            if (!$title) continue;
            $doi = $item['DOI'] ?? '';
            $year = $item['published-print']['date-parts'][0][0] ?? ($item['published-online']['date-parts'][0][0] ?? ($item['issued']['date-parts'][0][0] ?? null));
            $allPubs[] = [
                'title' => $title,
                'journal' => $item['container-title'][0] ?? '',
                'year' => $year ? (int)$year : null,
                'doi' => $doi,
                'url' => $doi ? "https://doi.org/$doi" : '',
                'cited_by' => null,
            ];
        }
        
        $offset += $perPage;
        usleep(500000);
    }
    return $allPubs;
}

function fetchOpenAlexPaginated($name, $max = 200) {
    $allPubs = [];
    $page = 1;
    $perPage = 50;
    
    while (($page - 1) * $perPage < $max) {
        $url = 'https://api.openalex.org/works?search=' . urlencode($name) . '&per-page=' . $perPage . '&page=' . $page;
        $r = httpGet($url);
        if ($r['code'] !== 200) break;
        
        $data = json_decode($r['body'], true);
        $results = $data['results'] ?? [];
        
        if (empty($results)) break;
        
        foreach ($results as $w) {
            $title = $w['title'] ?? $w['display_name'] ?? '';
            if (!$title) continue;
            $doi = $w['doi'] ?? '';
            if ($doi) $doi = str_replace('https://doi.org/', '', $doi);
            $year = $w['publication_year'] ?? null;
            $allPubs[] = [
                'title' => $title,
                'journal' => $w['primary_location']['source']['display_name'] ?? '',
                'year' => $year ? (int)$year : null,
                'doi' => $doi,
                'url' => $doi ? "https://doi.org/$doi" : '',
                'cited_by' => $w['cited_by_count'] ?? null,
            ];
        }
        
        $page++;
        usleep(500000);
    }
    return $allPubs;
}

function fetchSemanticScholar($name) {
    $url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' . urlencode($name) . '&limit=50&fields=title,year,authors,externalIds,venue,citationCount';
    $r = httpGet($url);
    if ($r['code'] !== 200) return [];
    
    $data = json_decode($r['body'], true);
    $pubs = [];
    
    foreach ($data['data'] ?? [] as $p) {
        $title = $p['title'] ?? '';
        if (!$title) continue;
        $doi = $p['externalIds']['DOI'] ?? '';
        $pubs[] = [
            'title' => $title,
            'journal' => $p['venue'] ?? '',
            'year' => $p['year'] ? (int)$p['year'] : null,
            'doi' => $doi,
            'url' => $doi ? "https://doi.org/$doi" : '',
            'cited_by' => $p['citationCount'] ?? null,
        ];
    }
    return $pubs;
}

function fetchDBLP($name) {
    $url = 'https://dblp.org/search/publ/api?q=' . urlencode($name) . '&h=50&f=0&c=4&format=json';
    $r = httpGet($url);
    if ($r['code'] !== 200) return [];
    
    $data = json_decode($r['body'], true);
    $pubs = [];
    
    $hits = $data['result']['hits']['hit'] ?? [];
    foreach ($hits as $hit) {
        $info = $hit['info'] ?? [];
        $title = $info['title'] ?? '';
        if (!$title) continue;
        $year = $info['year'] ?? null;
        $doi = $info['doi'] ?? '';
        $pubs[] = [
            'title' => $title,
            'journal' => $info['venue'] ?? $info['journal'] ?? '',
            'year' => $year ? (int)$year : null,
            'doi' => $doi,
            'url' => $doi ? "https://doi.org/$doi" : '',
            'cited_by' => null,
        ];
    }
    return $pubs;
}
