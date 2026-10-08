<?php
/**
 * Open-Source Publications Aggregator
 *
 * Also defines handleSyncAllOpenPublications() — syncs open-source
 * publications for all active staff/reviewer profiles.
 * Called by scripts/sync_open_pubs_cli.php (CLI, no HTTP timeout).
 * 
 * Fetches scientific works from FREE, PUBLIC, OPEN-SOURCE APIs only:
 * - ORCID Public API (keyless): https://pub.orcid.org/v3.0/
 * - CrossRef API (free, open): https://api.crossref.org/
 * - Semantic Scholar API (free, open): api.semanticscholar.org
 * - OpenAlex API (free, open): api.openalex.org
 * - DBLP API (free, open): dblp.org/search/publ/api
 * - Google Scholar (public web scraping)
 * 
 * POST { action: 'fetchopenpublications', email, name?, orcid?, maxResults? }
 * Returns: { success, data: { identity, metrics, publications[], sources } }
 */

if (!function_exists('_vedaHttp')) {
    require_once __DIR__ . '/veda_handlers.php';
}

// ── EXACT author name matching ─────────────────────────────────────────
// Returns true only if BOTH first AND last name of the query match an author
// entry with high precision. Prevents "Yonko Stoykov" matching "Yonko Stoynov"
// or "Yoncho Toykov".
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
        
        // Exact full name check first
        if (mb_strtolower($authName) === mb_strtolower($qFirst . ' ' . $qLast)) return true;
        
        // Split author name into parts and check BOTH first and last match
        $authParts = explode(' ', preg_replace('/\s+/', ' ', $authName));
        if (count($authParts) >= 2) {
            $aFirst = mb_strtolower($authParts[0]);
            $aLast = mb_strtolower(end($authParts));
            
            // Both first AND last must match tightly (not fuzzy)
            if ($qFirst !== '' && $aFirst !== $qFirst) continue;
            if ($qLast !== '' && $aLast !== $qLast) continue;
            
            return true;
        } else {
            // Single name — check exact
            if ($qFirst !== '' && mb_strtolower($authName) === $qFirst) return true;
        }
    }
    
    return false;
}

// ── CrossRef: fetch works by DOI or author name ──────────────────────────
function _openCrossrefWorks(string $query, int $max = 50): array {
    if ($query === []) return [];
    $url = 'https://api.crossref.org/works?query.author=' . urlencode($query) . '&rows=' . min($max, 50) . '&sort=relevance&order=desc';
    $r = _vedaHttpRetry('GET', $url, ['Accept' => 'application/json', 'User-Agent' => 'UEV-ERP-OpenPubs/1.0 (mailto:admin@ue-varna.bg)']);
    if (!$r['ok'] || $r['status'] !== 200) return [];
    $data = _vedaDecode($r['body']);
    if (!$data || empty($data['message']['items'])) return [];
    $out = [];
    $nameParts = _exactNameParts($query);
    foreach ($data['message']['items'] as $item) {
        $doi = $item['DOI'] ?? '';
        $authors = [];
        foreach ($item['author'] ?? [] as $a) {
            $nm = trim(($a['given'] ?? '') . ' ' . ($a['family'] ?? ''));
            if ($nm) $authors[] = $nm;
        }
        if (!_exactAuthorMatch($nameParts, $authors)) continue;
        $year = null;
        if (!empty($item['published']['date-parts'][0][0])) $year = (int)$item['published']['date-parts'][0][0];
        elseif (!empty($item['issued']['date-parts'][0][0])) $year = (int)$item['issued']['date-parts'][0][0];
        $journal = $item['container-title'][0] ?? ($item['publisher'] ?? '');
        $out[] = [
            'title'   => $item['title'][0] ?? '',
            'type'    => $item['type'] ?? 'article',
            'journal' => is_array($journal) ? ($journal[0] ?? '') : $journal,
            'year'    => $year,
            'doi'     => $doi,
            'url'     => $doi ? 'https://doi.org/' . $doi : ($item['URL'] ?? ''),
            'citedBy' => isset($item['is-referenced-by-count']) ? (int)$item['is-referenced-by-count'] : null,
            'authors' => implode(', ', $authors),
            'source'  => 'crossref',
        ];
    }
    return $out;
}

// ── CrossRef: enrich a single DOI with metadata ──────────────────────────
function _openCrossrefDoi(string $doi): ?array {
    $url = 'https://api.crossref.org/works/' . urlencode($doi);
    $r = _vedaHttpRetry('GET', $url, ['Accept' => 'application/json', 'User-Agent' => 'UEV-ERP-OpenPubs/1.0 (mailto:admin@ue-varna.bg)']);
    if (!$r['ok'] || $r['status'] !== 200) return null;
    $data = _vedaDecode($r['body']);
    if (!$data || empty($data['message'])) return null;
    $item = $data['message'];
    $authors = [];
    foreach ($item['author'] ?? [] as $a) {
        $nm = trim(($a['given'] ?? '') . ' ' . ($a['family'] ?? ''));
        if ($nm) $authors[] = $nm;
    }
    $year = null;
    if (!empty($item['published']['date-parts'][0][0])) $year = (int)$item['published']['date-parts'][0][0];
    return [
        'title'   => $item['title'][0] ?? '',
        'type'    => $item['type'] ?? 'article',
        'journal' => $item['container-title'][0] ?? ($item['publisher'] ?? ''),
        'year'    => $year,
        'doi'     => $doi,
        'url'     => 'https://doi.org/' . $doi,
        'citedBy' => isset($item['is-referenced-by-count']) ? (int)$item['is-referenced-by-count'] : null,
        'authors' => implode(', ', $authors),
        'source'  => 'crossref',
    ];
}

// ── Semantic Scholar: search by author name ──────────────────────────────
function _openSemanticScholar(string $query, int $max = 50): array {
    if ($query === '') return [];
    $url = 'https://api.semanticscholar.org/graph/v1/paper/search?query=' . urlencode($query) . '&limit=' . min($max, 50) . '&fields=title,year,authors,externalIds,citationCount,venue,abstract,url,publicationDate';
    $r = _vedaHttpRetry('GET', $url, ['Accept' => 'application/json']);
    if (!$r['ok'] || $r['status'] !== 200) return [];
    $data = _vedaDecode($r['body']);
    if (!$data || empty($data['data'])) return [];
    $out = [];
    $nameParts = _exactNameParts($query);
    foreach ($data['data'] as $p) {
        $doi = $p['externalIds']['DOI'] ?? '';
        $authors = [];
        foreach ($p['authors'] ?? [] as $a) {
            if (!empty($a['name'])) $authors[] = $a['name'];
        }
        if (!_exactAuthorMatch($nameParts, $authors)) continue;
        $out[] = [
            'title'   => $p['title'] ?? '',
            'type'    => 'article',
            'journal' => $p['venue'] ?? '',
            'year'    => $p['year'] ?? null,
            'doi'     => $doi,
            'url'     => $doi ? 'https://doi.org/' . $doi : ($p['url'] ?? ''),
            'citedBy' => $p['citationCount'] ?? null,
            'authors' => implode(', ', $authors),
            'source'  => 'semanticscholar',
            'abstract'=> $p['abstract'] ?? null,
        ];
    }
    return $out;
}

// ── OpenAlex: search by author name ──────────────────────────────────────
function _openAlexWorks(string $query, int $max = 50): array {
    if ($query === '') return [];
    $url = 'https://api.openalex.org/works?search=' . urlencode($query) . '&per-page=' . min($max, 50) . '&sort=cited_by_count:desc';
    $r = _vedaHttpRetry('GET', $url, ['Accept' => 'application/json', 'User-Agent' => 'UEV-ERP-OpenPubs/1.0']);
    if (!$r['ok'] || $r['status'] !== 200) return [];
    $data = _vedaDecode($r['body']);
    if (!$data || empty($data['results'])) return [];
    $out = [];
    $nameParts = _exactNameParts($query);
    foreach ($data['results'] as $w) {
        $doi = $w['doi'] ?? '';
        if ($doi) $doi = str_replace('https://doi.org/', '', $doi);
        $authors = [];
        foreach ($w['authorships'] ?? [] as $a) {
            if (!empty($a['author']['display_name'])) $authors[] = $a['author']['display_name'];
        }
        if (!_exactAuthorMatch($nameParts, $authors)) continue;
        $year = null;
        if (!empty($w['publication_year'])) $year = (int)$w['publication_year'];
        $journal = $w['primary_location']['source']['display_name'] ?? '';
        $out[] = [
            'title'   => $w['title'] ?? ($w['display_name'] ?? ''),
            'type'    => $w['type'] ?? 'article',
            'journal' => $journal,
            'year'    => $year,
            'doi'     => $doi,
            'url'     => $doi ? 'https://doi.org/' . $doi : ($w['doi'] ?? ''),
            'citedBy' => $w['cited_by_count'] ?? null,
            'authors' => implode(', ', $authors),
            'source'  => 'openalex',
        ];
    }
    return $out;
}

// ── DBLP: search for CS publications ─────────────────────────────────────
function _openDblpSearch(string $query, int $max = 30): array {
    if ($query === '') return [];
    $url = 'https://dblp.org/search/publ/api?q=' . urlencode($query) . '&h=' . min($max, 30) . '&f=0&c=50&format=json';
    $r = _vedaHttpRetry('GET', $url, ['Accept' => 'application/json']);
    if (!$r['ok'] || $r['status'] !== 200) return [];
    $data = _vedaDecode($r['body']);
    if (!$data || empty($data['result']['hits']['hit'])) return [];
    $out = [];
    $nameParts = _exactNameParts($query);
    foreach ($data['result']['hits']['hit'] as $hit) {
        $info = $hit['info'] ?? [];
        $doi = $info['doi'] ?? '';
        $authors = [];
        $a = $info['authors']['author'] ?? [];
        if (isset($a['text'])) $authors[] = $a['text'];
        elseif (is_array($a)) {
            foreach ($a as $auth) {
                $nm = is_array($auth) ? ($auth['text'] ?? '') : $auth;
                if ($nm) $authors[] = $nm;
            }
        }
        if (!_exactAuthorMatch($nameParts, $authors)) continue;
        $year = isset($info['year']) ? (int)$info['year'] : null;
        $venue = $info['venue'] ?? ($info['journal'] ?? '');
        $out[] = [
            'title'   => $info['title'] ?? '',
            'type'    => $info['type'] ?? 'article',
            'journal' => is_array($venue) ? implode(', ', $venue) : $venue,
            'year'    => $year,
            'doi'     => $doi,
            'url'     => $doi ? 'https://doi.org/' . $doi : ($info['url'] ?? ''),
            'citedBy' => null,
            'authors' => implode(', ', $authors),
            'source'  => 'dblp',
        ];
    }
    return $out;
}

// ── Google Scholar: public web scraping ───────────────────────────────────
function _openGoogleScholar(string $query, int $max = 20): array {
    if ($query === '') return [];
    $url = 'https://scholar.google.com/scholar?q=' . urlencode($query) . '&hl=en&as_sdt=0%2C5&num=' . min($max, 20);
    $r = _vedaHttpRetry('GET', $url, [
        'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept' => 'text/html,application/xhtml+xml',
    ]);
    if (!$r['ok'] || empty($r['body'])) return [];
    $html = $r['body'];
    $out = [];
    if (preg_match_all('/<div class="gs_r gs_or gs_scl".*?<h3 class="gs_rt".*?<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>.*?<\/h3>.*?<div class="gs_a">(.*?)<\/div>.*?<div class="gs_fl">(.*?)<\/div>.*?<\/div>/si', $html, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $m) {
            $year = null;
            if (preg_match('/\b(19|20)\d{2}\b/', $m[3], $ym)) $year = (int)$ym[0];
            $citedBy = null;
            if (preg_match('/Cited by (\d+)/i', $m[4], $cm)) $citedBy = (int)$cm[0];
            $journal = '';
            if (preg_match('/\d{4}\s*-\s*(.+?)\s*-\s*(Google Scholar|scholar\.google)/i', $m[3], $jm)) $journal = trim($jm[1], " \t\n\r\0\x0B,-");
            $out[] = [
                'title'   => strip_tags($m[2]),
                'type'    => 'article',
                'journal' => $journal,
                'year'    => $year,
                'doi'     => '',
                'url'     => $m[1],
                'citedBy' => $citedBy,
                'authors' => '',
                'source'  => 'scholar',
            ];
        }
    }
    return $out;
}

// ── ORCID Public API: fetch works by ORCID iD ───────────────────────────
function _openOrcIdWorks(string $orcidId): array {
    $results = [];
    if ($orcidId === '') return [];
    $url = 'https://pub.orcid.org/v3.0/' . $orcidId . '/works';
    $r = _vedaHttpRetry('GET', $url, ['Accept' => 'application/json']);
    if (!$r['ok'] || $r['status'] !== 200) return [];
    $data = _vedaDecode($r['body']);
    if (empty($data['group'])) return [];
    foreach ($data['group'] as $group) {
        foreach ($group['work-summary'] ?? [] as $ws) {
            $title = $ws['title']['title']['value'] ?? '';
            if (!$title) continue;
            $year = null;
            if (!empty($ws['publication-date']['year']['value'])) $year = (int)$ws['publication-date']['year']['value'];
            $doi = '';
            foreach ($ws['external-ids']['external-id'] ?? [] as $ext) {
                if ($ext['external-id-type'] === 'doi') { $doi = $ext['external-id-value'] ?? ''; break; }
            }
            $results[] = [
                'title'   => $title,
                'type'    => $ws['type'] ?? 'article',
                'journal' => $ws['journal-title']['value'] ?? '',
                'year'    => $year,
                'doi'     => $doi,
                'url'     => $doi ? 'https://doi.org/' . $doi : '',
                'citedBy' => null,
                'authors' => '',
                'source'  => 'orcid',
            ];
        }
    }
    return $results;
}

// ── ORCID search by name ────────────────────────────────────────────────
function _openOrcIdSearch(string $name): array {
    if ($name === '') return [];
    $url = 'https://pub.orcid.org/v3.0/search/?q=' . urlencode($name) . '&rows=20';
    $r = _vedaHttpRetry('GET', $url, ['Accept' => 'application/json']);
    if (!$r['ok'] || $r['status'] !== 200) return [];
    $data = _vedaDecode($r['body']);
    if (empty($data['result'])) return [];
    $results = [];
    $nameParts = _exactNameParts($name);
    foreach ($data['result'] as $item) {
        $orcidId = $item['orcid-identifier']['path'] ?? '';
        if (!$orcidId) continue;
        $works = _openOrcIdWorks($orcidId);
        $results = array_merge($results, $works);
    }
    return $results;
}

// ── Main handler ────────────────────────────────────────────────────────
function handleFetchOpenPublications(array $b): array {
    $email = trim($b['email'] ?? '');
    $name = trim($b['name'] ?? '');
    $orcid = trim($b['orcid'] ?? '');
    $max = min((int)($b['maxResults'] ?? 30), 50);
    
    if ($name === '' && $orcid === '') {
        return ['success' => false, 'error' => 'Name or ORCID required'];
    }
    
    $all = [];
    
    // ORCID first (most reliable — exact identity)
    if ($orcid) {
        $orcidPubs = _openOrcIdWorks($orcid);
        foreach ($orcidPubs as $p) { $p['source'] = 'orcid'; $all[] = $p; }
    }
    
    // Name-based search across sources
    // v12.55.3: DISABLED — name-based search returns publications for ANY person
    // with the same name, causing data mismatch. Only ORCID is authoritative.
    // Users must connect their ORCID to see publications.
    $searchName = '';
    if (!$searchName && $orcid) {
        $identity = _openOrcIdWorks($orcid);
        $searchName = $identity[0]['authors'] ?? '';
    }
    
    if ($searchName && false) {  // v12.55.3: Disabled name-based search
        $crPubs = _openCrossrefWorks($searchName, $max);
        foreach ($crPubs as $p) { $p['source'] = 'crossref'; $all[] = $p; }
        
        $ssPubs = _openSemanticScholar($searchName, $max);
        foreach ($ssPubs as $p) { $p['source'] = 'semanticscholar'; $all[] = $p; }
        
        $oaPubs = _openAlexWorks($searchName, $max);
        foreach ($oaPubs as $p) { $p['source'] = 'openalex'; $all[] = $p; }
        
        $dblpPubs = _openDblpSearch($searchName, $max);
        foreach ($dblpPubs as $p) { $p['source'] = 'dblp'; $all[] = $p; }
    }
    
    // Deduplicate by DOI or title
    $seen = [];
    $deduped = [];
    foreach ($all as $pub) {
        $key = $pub['doi'] ?: mb_strtolower($pub['title']);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $deduped[] = $pub;
    }
    
    return [
        'success' => true,
        'data' => [
            'query' => $searchName,
            'orcid' => $orcid,
            'total' => count($deduped),
            'publications' => array_slice($deduped, 0, $max),
            'sources' => array_unique(array_column($deduped, 'source')),
        ]
    ];
}

/**
 * Sync all open publications for active staff profiles.
 * Body: { authEmail }
 */
function handleSyncAllOpenPublications(array $b): array {
    // v12.55.3: Disabled — name-based sync was causing data mismatch.
    // Only ORCID-verified publications should be synced.
    return ['success' => true, 'synced' => 0, 'message' => 'Name-based sync disabled. Users must connect ORCID.'];
}
