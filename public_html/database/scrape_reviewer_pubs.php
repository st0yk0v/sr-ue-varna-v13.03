<?php
/**
 * Fetch real publications for all reviewers from live API.
 * Run via HTTP: /database/scrape_reviewer_pubs.php?secret=scrape2026
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

$secret = $_GET['secret'] ?? '';
if ($secret !== 'scrape2026') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit;
}

set_time_limit(300);
ini_set('memory_limit', '256M');

try {
    $db = getDB();
    
    // Get all reviewers with emails
    $reviewers = @dbFetchAll('SELECT DISTINCT email, name, competition FROM reviewers WHERE email <> "" AND email IS NOT NULL ORDER BY name ASC') ?: [];
    
    if (empty($reviewers)) {
        echo json_encode(['success' => true, 'message' => 'No reviewers found', 'synced' => 0]);
        exit;
    }
    
    $results = [];
    $totalAdded = 0;
    $totalSkipped = 0;
    $totalFailed = 0;
    
    foreach ($reviewers as $rev) {
        $email = $rev['email'];
        $name = $rev['name'];
        
        if (empty($email) || empty($name)) continue;
        
        $result = ['email' => $email, 'name' => $name];
        
        try {
            // Fetch from ORCID, CrossRef, OpenAlex, Semantic Scholar, DBLP
            $pubs = fetchAllPublications($name, $email);
            
            $added = 0;
            $skipped = 0;
            
            foreach ($pubs as $pub) {
                if (empty($pub['title'])) continue;
                
                // Check for existing by DOI or title+year
                $existing = null;
                if (!empty($pub['doi'])) {
                    $existing = @dbFetchOne('SELECT id FROM scientific_works WHERE doi = ? AND author_email = ?', [$pub['doi'], $email]);
                }
                if (!$existing) {
                    $existing = @dbFetchOne('SELECT id FROM scientific_works WHERE title = ? AND author_email = ? AND year = ?', [$pub['title'], $email, $pub['year'] ?? 0]);
                }
                
                if ($existing) {
                    $skipped++;
                    continue;
                }
                
                // Insert new work
                $id = 'pub_' . bin2hex(random_bytes(8));
                @dbQuery(
                    'INSERT INTO scientific_works (id, author_email, title, authors, publication, year, doi, url, cited_by, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                    [
                        $id,
                        $email,
                        mb_substr($pub['title'], 0, 500),
                        mb_substr($pub['authors'] ?? '', 0, 500),
                        mb_substr($pub['journal'] ?? '', 0, 300),
                        $pub['year'] ?? null,
                        mb_substr($pub['doi'] ?? '', 0, 200),
                        mb_substr($pub['url'] ?? '', 0, 500),
                        $pub['citedBy'] ?? 0,
                        mb_substr($pub['source'] ?? 'scrape', 0, 50)
                    ]
                );
                $added++;
            }
            
            $result['added'] = $added;
            $result['skipped'] = $skipped;
            $result['status'] = 'ok';
            $totalAdded += $added;
            $totalSkipped += $skipped;
            
        } catch (Exception $e) {
            $result['status'] = 'error';
            $result['error'] = $e->getMessage();
            $totalFailed++;
        }
        
        $results[] = $result;
        
        // Rate limit between reviewers
        usleep(200000); // 0.2s
    }
    
    // Update user_scientific_profile
    foreach ($reviewers as $rev) {
        $count = (int) (@dbFetchOne('SELECT COUNT(*) as c FROM scientific_works WHERE author_email = ?', [$rev['email']])['c'] ?? 0);
        @dbQuery(
            'UPDATE user_scientific_profile SET work_count = ?, last_synced = NOW() WHERE email = ?',
            [$count, $rev['email']]
        );
    }
    
    echo json_encode([
        'success' => true,
        'reviewers_count' => count($reviewers),
        'total_added' => $totalAdded,
        'total_skipped' => $totalSkipped,
        'total_failed' => $totalFailed,
        'results' => $results
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

/**
 * Fetch publications from multiple sources
 */
function fetchAllPublications(string $name, string $email): array {
    $all = [];
    
    // ORCID
    $orcidPubs = fetchFromORCID($name);
    foreach ($orcidPubs as $p) {
        $p['source'] = 'orcid';
        $all[] = $p;
    }
    
    // CrossRef
    $crPubs = fetchFromCrossRef($name);
    foreach ($crPubs as $p) {
        $p['source'] = 'crossref';
        $all[] = $p;
    }
    
    // OpenAlex
    $oaPubs = fetchFromOpenAlex($name);
    foreach ($oaPubs as $p) {
        $p['source'] = 'openalex';
        $all[] = $p;
    }
    
    // Semantic Scholar
    $ssPubs = fetchFromSemanticScholar($name);
    foreach ($ssPubs as $p) {
        $p['source'] = 'semanticscholar';
        $all[] = $p;
    }
    
    // DBLP
    $dblpPubs = fetchFromDBLP($name);
    foreach ($dblpPubs as $p) {
        $p['source'] = 'dblp';
        $all[] = $p;
    }
    
    return $all;
}

function fetchFromORCID(string $name): array {
    $results = [];
    $url = 'https://pub.orcid.org/v3.0/search/?q=' . urlencode($name) . '&rows=50';
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_TIMEOUT => 15,
        CURLOPT_FOLLOWLOCATION => true,
    ]);
    $body = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200 || empty($body)) return [];
    
    $data = json_decode($body, true);
    if (empty($data['result'])) return [];
    
    foreach ($data['result'] as $item) {
        $orcidUri = $item['orcid-identifier']['uri'] ?? '';
        $orcidId = $item['orcid-identifier']['path'] ?? '';
        
        // Get full record
        if ($orcidId) {
            $recordUrl = "https://pub.orcid.org/v3.0/$orcidId/works";
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $recordUrl,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
                CURLOPT_TIMEOUT => 15,
            ]);
            $recordBody = curl_exec($ch);
            curl_close($ch);
            
            $record = json_decode($recordBody, true);
            if (!empty($record['group'])) {
                foreach ($record['group'] as $group) {
                    $summaries = $group['work-summary'] ?? [];
                    foreach ($summaries as $ws) {
                        $title = $ws['title']['title']['value'] ?? '';
                        if (!$title) continue;
                        
                        $pubDate = $ws['publication-date'] ?? null;
                        $year = null;
                        if ($pubDate && !empty($pubDate['year'])) {
                            $year = (int)$pubDate['year']['value'];
                        }
                        
                        $doi = '';
                        foreach ($ws['external-ids']['external-id'] ?? [] as $ext) {
                            if ($ext['external-id-type'] === 'doi') {
                                $doi = $ext['external-id-value'] ?? '';
                                break;
                            }
                        }
                        
                        $journal = $ws['journal-title']['value'] ?? '';
                        $type = $ws['type'] ?? 'article';
                        
                        $results[] = [
                            'title' => $title,
                            'authors' => $name,
                            'year' => $year,
                            'doi' => $doi,
                            'url' => $doi ? "https://doi.org/$doi" : '',
                            'journal' => $journal,
                            'citedBy' => null,
                            'type' => $type
                        ];
                    }
                }
            }
        }
    }
    
    return $results;
}

function fetchFromCrossRef(string $name): array {
    $url = 'https://api.crossref.org/works?query.author=' . urlencode($name) . '&rows=30&sort=relevance';
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['User-Agent: UEV-ERP-Scraper/1.0 (mailto:admin@ue-varna.bg)'],
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    
    $data = json_decode($body, true);
    if (empty($data['message']['items'])) return [];
    
    $results = [];
    $nameLower = mb_strtolower($name);
    
    foreach ($data['message']['items'] as $item) {
        $authors = [];
        foreach ($item['author'] ?? [] as $a) {
            $nm = trim(($a['given'] ?? '') . ' ' . ($a['family'] ?? ''));
            if ($nm) $authors[] = $nm;
        }
        
        // Verify name matches
        $matched = false;
        foreach ($authors as $authName) {
            similar_text($nameLower, mb_strtolower($authName), $pct);
            if ($pct > 65) { $matched = true; break; }
        }
        if (!$matched) continue;
        
        $doi = $item['DOI'] ?? '';
        $year = null;
        if (!empty($item['published']['date-parts'][0][0])) $year = (int)$item['published']['date-parts'][0][0];
        
        $results[] = [
            'title' => $item['title'][0] ?? '',
            'authors' => implode(', ', $authors),
            'year' => $year,
            'doi' => $doi,
            'url' => $doi ? "https://doi.org/$doi" : '',
            'journal' => $item['container-title'][0] ?? '',
            'citedBy' => $item['is-referenced-by-count'] ?? null,
        ];
    }
    
    return $results;
}

function fetchFromOpenAlex(string $name): array {
    $url = 'https://api.openalex.org/authors?search=' . urlencode($name) . '&per-page=5';
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    
    $data = json_decode($body, true);
    if (empty($data['results'])) return [];
    
    $results = [];
    $nameLower = mb_strtolower($name);
    
    foreach ($data['results'] as $author) {
        $authorName = $author['display_name'] ?? '';
        similar_text($nameLower, mb_strtolower($authorName), $pct);
        if ($pct < 65) continue;
        
        $authorId = $author['id'] ?? '';
        if (!$authorId) continue;
        
        // Get author's works
        $worksUrl = 'https://api.openalex.org/works?filter=author.id:' . urlencode($authorId) . '&per-page=50';
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $worksUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $worksBody = curl_exec($ch);
        curl_close($ch);
        
        $worksData = json_decode($worksBody, true);
        if (empty($worksData['results'])) continue;
        
        foreach ($worksData['results'] as $w) {
            $doi = $w['doi'] ?? '';
            if ($doi) $doi = str_replace('https://doi.org/', '', $doi);
            
            $results[] = [
                'title' => $w['title'] ?? $w['display_name'] ?? '',
                'authors' => implode(', ', array_map(fn($a) => $a['author']['display_name'] ?? '', array_slice($w['authorships'] ?? [], 0, 5))),
                'year' => $w['publication_year'] ?? null,
                'doi' => $doi,
                'url' => $doi ? "https://doi.org/$doi" : '',
                'journal' => $w['primary_location']['source']['display_name'] ?? '',
                'citedBy' => $w['cited_by_count'] ?? null,
            ];
        }
        
        break; // only process first matching author
    }
    
    return $results;
}

function fetchFromSemanticScholar(string $name): array {
    $url = 'https://api.semanticscholar.org/graph/v1/author/search?query=' . urlencode($name) . '&limit=3&fields=name,externalIds,paperCount';
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    
    $data = json_decode($body, true);
    if (empty($data['data'])) return [];
    
    $results = [];
    $nameLower = mb_strtolower($name);
    
    foreach ($data['data'] as $author) {
        $authorName = $author['name'] ?? '';
        similar_text($nameLower, mb_strtolower($authorName), $pct);
        if ($pct < 65) continue;
        
        $authorId = $author['authorId'] ?? '';
        if (!$authorId) continue;
        
        // Get papers
        $papersUrl = "https://api.semanticscholar.org/graph/v1/author/$authorId/papers?limit=50&fields=title,year,authors,externalIds,citationCount,venue,url";
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $papersUrl,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);
        $papersBody = curl_exec($ch);
        curl_close($ch);
        
        $papersData = json_decode($papersBody, true);
        if (empty($papersData['data'])) continue;
        
        foreach ($papersData['data'] as $paper) {
            $doi = $paper['externalIds']['DOI'] ?? '';
            $results[] = [
                'title' => $paper['title'] ?? '',
                'authors' => implode(', ', array_map(fn($a) => $a['name'] ?? '', $paper['authors'] ?? [])),
                'year' => $paper['year'] ?? null,
                'doi' => $doi,
                'url' => $doi ? "https://doi.org/$doi" : ($paper['url'] ?? ''),
                'journal' => $paper['venue'] ?? '',
                'citedBy' => $paper['citationCount'] ?? null,
            ];
        }
        
        break;
    }
    
    return $results;
}

function fetchFromDBLP(string $name): array {
    $url = 'https://dblp.org/search/publ/api?q=' . urlencode($name) . '&h=30&format=json';
    
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    
    $data = json_decode($body, true);
    if (empty($data['result']['hits']['hit'])) return [];
    
    $results = [];
    $nameLower = mb_strtolower($name);
    
    foreach ($data['result']['hits']['hit'] as $hit) {
        $info = $hit['info'] ?? [];
        
        $authors = [];
        $a = $info['authors']['author'] ?? [];
        if (isset($a['text'])) $authors[] = $a['text'];
        elseif (is_array($a)) {
            foreach ($a as $auth) {
                $nm = is_array($auth) ? ($auth['text'] ?? '') : (is_string($auth) ? $auth : '');
                if ($nm) $authors[] = $nm;
            }
        }
        
        // Verify name matches
        $matched = false;
        foreach ($authors as $authName) {
            similar_text($nameLower, mb_strtolower($authName), $pct);
            if ($pct > 65) { $matched = true; break; }
        }
        if (!$matched) continue;
        
        $doi = $info['doi'] ?? '';
        
        $results[] = [
            'title' => $info['title'] ?? '',
            'authors' => implode(', ', $authors),
            'year' => isset($info['year']) ? (int)$info['year'] : null,
            'doi' => $doi,
            'url' => $doi ? "https://doi.org/$doi" : '',
            'journal' => $info['venue'] ?? ($info['journal'] ?? ''),
            'citedBy' => null,
        ];
    }
    
    return $results;
}
