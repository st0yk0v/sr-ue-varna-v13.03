<?php
/**
 * Scrape publications for staff members — EXACT match only.
 * Run via HTTP: /database/scrape_staff_pubs.php?secret=scrape2026
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');

$secret = $_GET['secret'] ?? '';
if ($secret !== 'scrape2026') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit;
}

set_time_limit(600);
ini_set('memory_limit', '256M');

// Exact name matching — must match BOTH first AND last name
function _exactNameParts(string $name): array {
    $name = trim(preg_replace('/\s+/', ' ', $name));
    $parts = explode(' ', $name);
    if (count($parts) >= 2) {
        $first = mb_strtolower($parts[0]);
        $last = mb_strtolower(end($parts));
    } else {
        $first = mb_strtolower($name);
        $last = '';
    }
    return [$first, $last];
}

function _exactAuthorMatch(array $nameParts, array $authors): bool {
    if (empty($authors)) return false;
    [$qFirst, $qLast] = $nameParts;
    
    foreach ($authors as $authName) {
        $authName = trim($authName);
        if ($authName === '') continue;
        
        if (mb_strtolower($authName) === mb_strtolower($qFirst . ' ' . $qLast)) return true;
        
        $authParts = explode(' ', preg_replace('/\s+/', ' ', $authName));
        if (count($authParts) >= 2) {
            $aFirst = mb_strtolower($authParts[0]);
            $aLast = mb_strtolower(end($authParts));
            if ($qFirst !== '' && $aFirst !== $qFirst) continue;
            if ($qLast !== '' && $aLast !== $qLast) continue;
            return true;
        } else {
            if ($qFirst !== '' && mb_strtolower($authName) === $qFirst) return true;
        }
    }
    return false;
}

try {
    $db = getDB();
    
    $mode = (!empty($_GET['email'])) ? 'manual' : 'auto';
    
    if ($mode === 'manual') {
        $email = trim($_GET['email']);
        $name = trim($_GET['name'] ?? '');
        $orcid = trim($_GET['orcid'] ?? '');
        $profiles = [['email' => $email, 'full_name' => $name, 'orcid' => $orcid]];
    } else {
        $profiles = @dbFetchAll('SELECT email, full_name, orcid FROM user_scientific_profile WHERE email <> ""') ?: [];
    }
    
    if (empty($profiles)) {
        echo json_encode(['success' => true, 'message' => 'No profiles found', 'synced' => 0]);
        exit;
    }
    
    $results = [];
    $totalAdded = 0;
    $totalFailed = 0;
    
    foreach ($profiles as $prof) {
        $email = $prof['email'];
        $name = $prof['full_name'] ?? '';
        $orcid = $prof['orcid'] ?? '';
        
        if (empty($name)) {
            $results[] = ['email' => $email, 'status' => 'skip', 'reason' => 'no name'];
            continue;
        }
        
        $result = ['email' => $email, 'name' => $name];
        $nameParts = _exactNameParts($name);
        
        try {
            $pubs = [];
            
            // ORCID (most reliable)
            if ($orcid) {
                $pubs = array_merge($pubs, fetchFromORCID($orcid));
            }
            
            // Name-based searches with exact match
            $pubs = array_merge($pubs, fetchFromCrossRef($name, $nameParts));
            $pubs = array_merge($pubs, fetchFromOpenAlex($name, $nameParts));
            $pubs = array_merge($pubs, fetchFromSemanticScholar($name, $nameParts));
            $pubs = array_merge($pubs, fetchFromDBLP($name, $nameParts));
            
            $added = 0;
            foreach ($pubs as $pub) {
                if (empty($pub['title'])) continue;
                
                // Dedup
                $existing = null;
                if (!empty($pub['doi'])) {
                    $existing = @dbFetchOne('SELECT id FROM scientific_works WHERE doi = ? AND author_email = ?', [$pub['doi'], $email]);
                }
                if (!$existing) {
                    $existing = @dbFetchOne('SELECT id FROM scientific_works WHERE title = ? AND author_email = ?', [$pub['title'], $email]);
                }
                if ($existing) continue;
                
                $id = 'pub_' . bin2hex(random_bytes(8));
                @dbQuery(
                    'INSERT INTO scientific_works (id, author_email, title, authors, publication, year, doi, url, cited_by, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                    [
                        $id, $email,
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
            $result['status'] = 'ok';
            $totalAdded += $added;
            
        } catch (Exception $e) {
            $result['status'] = 'error';
            $result['error'] = $e->getMessage();
            $totalFailed++;
        }
        
        $results[] = $result;
        usleep(300000);
    }
    
    // Update counts
    foreach ($profiles as $prof) {
        $count = (int)(@dbFetchOne('SELECT COUNT(*) as c FROM scientific_works WHERE author_email = ?', [$prof['email']])['c'] ?? 0);
        @dbQuery('UPDATE user_scientific_profile SET work_count = ?, last_synced = NOW() WHERE email = ?', [$count, $prof['email']]);
    }
    
    echo json_encode([
        'success' => true,
        'mode' => $mode,
        'profiles_count' => count($profiles),
        'total_added' => $totalAdded,
        'total_failed' => $totalFailed,
        'results' => $results
    ]);
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

function fetchFromORCID(string $orcidId): array {
    if (!$orcidId) return [];
    $url = "https://pub.orcid.org/v3.0/$orcidId/works";
    $ch = curl_init();
    curl_setopt_array($ch, [CURLOPT_URL => $url, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['Accept: application/json'], CURLOPT_TIMEOUT => 20]);
    $body = curl_exec($ch); curl_close($ch);
    $data = json_decode($body, true);
    if (empty($data['group'])) return [];
    $results = [];
    foreach ($data['group'] as $group) {
        foreach ($group['work-summary'] ?? [] as $ws) {
            $title = $ws['title']['title']['value'] ?? '';
            if (!$title) continue;
            $year = $ws['publication-date']['year']['value'] ?? null;
            $doi = '';
            foreach ($ws['external-ids']['external-id'] ?? [] as $ext) {
                if ($ext['external-id-type'] === 'doi') { $doi = $ext['external-id-value'] ?? ''; break; }
            }
            $results[] = ['title' => $title, 'authors' => '', 'year' => $year ? (int)$year : null, 'doi' => $doi, 'url' => $doi ? "https://doi.org/$doi" : '', 'journal' => $ws['journal-title']['value'] ?? '', 'citedBy' => null, 'source' => 'orcid'];
        }
    }
    return $results;
}

function fetchFromCrossRef(string $name, array $nameParts): array {
    $url = 'https://api.crossref.org/works?query.author=' . urlencode($name) . '&rows=30&sort=relevance';
    $ch = curl_init();
    curl_setopt_array($ch, [CURLOPT_URL => $url, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['User-Agent: UEV-ERP/1.0'], CURLOPT_TIMEOUT => 20]);
    $body = curl_exec($ch); curl_close($ch);
    $data = json_decode($body, true);
    if (empty($data['message']['items'])) return [];
    $results = [];
    foreach ($data['message']['items'] as $item) {
        $authors = [];
        foreach ($item['author'] ?? [] as $a) {
            $nm = trim(($a['given'] ?? '') . ' ' . ($a['family'] ?? ''));
            if ($nm) $authors[] = $nm;
        }
        if (!_exactAuthorMatch($nameParts, $authors)) continue;
        $doi = $item['DOI'] ?? '';
        $year = $item['published']['date-parts'][0][0] ?? null;
        $results[] = ['title' => $item['title'][0] ?? '', 'authors' => implode(', ', $authors), 'year' => $year ? (int)$year : null, 'doi' => $doi, 'url' => $doi ? "https://doi.org/$doi" : '', 'journal' => is_array($item['container-title'][0] ?? '') ? '' : ($item['container-title'][0] ?? ''), 'citedBy' => $item['is-referenced-by-count'] ?? null, 'source' => 'crossref'];
    }
    return $results;
}

function fetchFromOpenAlex(string $name, array $nameParts): array {
    $url = 'https://api.openalex.org/authors?search=' . urlencode($name) . '&per-page=5';
    $ch = curl_init();
    curl_setopt_array($ch, [CURLOPT_URL => $url, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20]);
    $body = curl_exec($ch); curl_close($ch);
    $data = json_decode($body, true);
    if (empty($data['results'])) return [];
    $results = [];
    foreach ($data['results'] as $author) {
        $authorName = $author['display_name'] ?? '';
        if (!_exactAuthorMatch($nameParts, [$authorName])) continue;
        $authorId = str_replace('https://openalex.org/', '', $author['id'] ?? '');
        if (!$authorId) continue;
        $worksUrl = "https://api.openalex.org/works?filter=author.id:$authorId&per-page=50";
        $ch = curl_init();
        curl_setopt_array($ch, [CURLOPT_URL => $worksUrl, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20]);
        $worksBody = curl_exec($ch); curl_close($ch);
        $worksData = json_decode($worksBody, true);
        if (empty($worksData['results'])) continue;
        foreach ($worksData['results'] as $w) {
            $doi = $w['doi'] ?? '';
            if ($doi) $doi = str_replace('https://doi.org/', '', $doi);
            $results[] = ['title' => $w['title'] ?? $w['display_name'] ?? '', 'authors' => implode(', ', array_map(fn($a) => $a['author']['display_name'] ?? '', array_slice($w['authorships'] ?? [], 0, 6))), 'year' => $w['publication_year'] ?? null, 'doi' => $doi, 'url' => $doi ? "https://doi.org/$doi" : '', 'journal' => $w['primary_location']['source']['display_name'] ?? '', 'citedBy' => $w['cited_by_count'] ?? null, 'source' => 'openalex'];
        }
        break;
    }
    return $results;
}

function fetchFromSemanticScholar(string $name, array $nameParts): array {
    $url = 'https://api.semanticscholar.org/graph/v1/author/search?query=' . urlencode($name) . '&limit=3&fields=name';
    $ch = curl_init();
    curl_setopt_array($ch, [CURLOPT_URL => $url, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20]);
    $body = curl_exec($ch); curl_close($ch);
    $data = json_decode($body, true);
    if (empty($data['data'])) return [];
    $results = [];
    foreach ($data['data'] as $author) {
        $authorName = $author['name'] ?? '';
        if (!_exactAuthorMatch($nameParts, [$authorName])) continue;
        $authorId = $author['authorId'] ?? '';
        if (!$authorId) continue;
        $papersUrl = "https://api.semanticscholar.org/graph/v1/author/$authorId/papers?limit=50&fields=title,year,authors,externalIds,citationCount,venue,url";
        $ch = curl_init();
        curl_setopt_array($ch, [CURLOPT_URL => $papersUrl, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20]);
        $papersBody = curl_exec($ch); curl_close($ch);
        $papersData = json_decode($papersBody, true);
        if (empty($papersData['data'])) continue;
        foreach ($papersData['data'] as $paper) {
            $doi = $paper['externalIds']['DOI'] ?? '';
            $results[] = ['title' => $paper['title'] ?? '', 'authors' => implode(', ', array_map(fn($a) => $a['name'] ?? '', $paper['authors'] ?? [])), 'year' => $paper['year'] ?? null, 'doi' => $doi, 'url' => $doi ? "https://doi.org/$doi" : ($paper['url'] ?? ''), 'journal' => $paper['venue'] ?? '', 'citedBy' => $paper['citationCount'] ?? null, 'source' => 'semanticscholar'];
        }
        break;
    }
    return $results;
}

function fetchFromDBLP(string $name, array $nameParts): array {
    $url = 'https://dblp.org/search/publ/api?q=' . urlencode($name) . '&h=30&format=json';
    $ch = curl_init();
    curl_setopt_array($ch, [CURLOPT_URL => $url, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20]);
    $body = curl_exec($ch); curl_close($ch);
    $data = json_decode($body, true);
    if (empty($data['result']['hits']['hit'])) return [];
    $results = [];
    foreach ($data['result']['hits']['hit'] as $hit) {
        $info = $hit['info'] ?? [];
        $authors = [];
        $a = $info['authors']['author'] ?? [];
        if (isset($a['text'])) $authors[] = $a['text'];
        elseif (is_array($a)) { foreach ($a as $auth) { $nm = is_array($auth) ? ($auth['text'] ?? '') : $auth; if ($nm) $authors[] = $nm; } }
        if (!_exactAuthorMatch($nameParts, $authors)) continue;
        $doi = $info['doi'] ?? '';
        $results[] = ['title' => $info['title'] ?? '', 'authors' => implode(', ', $authors), 'year' => isset($info['year']) ? (int)$info['year'] : null, 'doi' => $doi, 'url' => $doi ? "https://doi.org/$doi" : '', 'journal' => is_array($info['venue'] ?? '') ? implode(', ', $info['venue']) : ($info['venue'] ?? ''), 'citedBy' => null, 'source' => 'dblp'];
    }
    return $results;
}
