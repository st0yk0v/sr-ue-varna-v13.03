#!/usr/bin/env php
<?php
/**
 * Full Staff Sync + Crawl for UEV-ERP
 * 
 * 1. Parses pasted content with ~258 staff members
 * 2. Syncs to user_scientific_profile
 * 3. Crawls ORCID, CrossRef, OpenAlex for publications
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);
set_time_limit(0);

require_once '/home/u129919172/domains/sr-ue-varna.com/public_html/database/config.php';

// Read from file argument or stdin
if (isset($argv[1]) && file_exists($argv[1])) {
    $content = file_get_contents($argv[1]);
} else {
    $content = file_get_contents('php://stdin');
}
$lines = explode("\n", $content);

$staff = [];

$footer_re = '/^(Facebook|X|LinkedIn|Instagram|Youtube|ИУ|бул\.|Прием|Бакалавър|Магистър|Доктор|Продължащо|Информация|Докторантско|НИИ|Бизнес|Тренинги|Уъркшопи|Конференция|Полезно|Допълнителна|Често|Новини|Контакти|За контакти|scientific\.projects|0882|©|Декларация|Предложения|Карта|Отчетност|Календар)/u';
$phone_re = '/^[\d\+\s\-]+$/';

$clean_lines = [];
foreach ($lines as $line) {
    $line = trim($line);
    if (empty($line)) continue;
    if (preg_match($footer_re, $line)) continue;
    if (preg_match($phone_re, $line)) continue;
    $clean_lines[] = $line;
}

// Find email lines, walk back 5 lines for name
// Format: Name(1), Title(2), Faculty(3), Department(4), Office(5), Email(6)
for ($i = 0; $i < count($clean_lines); $i++) {
    if (!preg_match('/^[\w\.\-]+@ue-varna\.bg$/', $clean_lines[$i])) continue;
    
    $email = $clean_lines[$i];
    if ($i < 5) continue;
    
    $name = $clean_lines[$i - 5];
    $title = $clean_lines[$i - 4] ?? '';
    $faculty = $clean_lines[$i - 3] ?? '';
    $department = $clean_lines[$i - 2] ?? '';
    $office = $clean_lines[$i - 1] ?? '';
    
    // Clean title prefixes from name
    $name = preg_replace('/^(чл\.\s*кор\.\s*проф\.\s*д\.?и\.?н?\.|ст\.\s*пр\.\s*д-р|ст\.\s*пр\.\s*д\.?\s*р\.\s*|ст\.\s*пр\.\s*х\.\s*|ст\.\s*пр\.\s*)/iu', '', $name);
    $name = trim($name);
    
    // Skip if name looks like a title
    if (preg_match('/^(проф\.|доц\.|гл\.\s*ас\.|х\.\s*доц\.|х\.\s*ас\.|ас\.|х\.\s*ст\.\s*пр\.|ст\.\s*пр\.)/u', $name)) {
        if ($i >= 6) {
            $name = $clean_lines[$i - 6];
            $name = preg_replace('/^(чл\.\s*кор\.\s*проф\.\s*д\.?и\.?н?\.|ст\.\s*пр\.\s*)/iu', '', $name);
            $name = trim($name);
        }
    }
    
    // Clean department (remove "Катедра: " prefix)
    $department = preg_replace('/^Катедра:\s*/u', '', $department);
    // Clean office (remove "Кабинет: " prefix)
    $office = preg_replace('/^Кабинет:\s*/u', '', $office);
    
    if ($name && strlen($name) > 3 && !preg_match('/^\d+$/', $name) && !preg_match('/^(проф\.|доц\.|гл\.\s*ас\.)/u', $name)) {
        $staff[] = [
            'name' => $name,
            'email' => $email,
            'title' => $title,
            'faculty' => $faculty,
            'department' => $department,
            'office' => $office,
        ];
    }
}

echo "Parsed " . count($staff) . " staff members\n";

// Sync to DB
$db = getDB();
$inserted = 0;
$updated = 0;

foreach ($staff as $member) {
    $name = $member['name'];
    $email = $member['email'];
    $title = $member['title'] ?? '';
    $faculty = $member['faculty'] ?? '';
    $department = $member['department'] ?? '';
    $office = $member['office'] ?? '';
    
    try {
        $stmt = $db->prepare('SELECT email FROM user_scientific_profile WHERE email = ?');
        $stmt->execute([$email]);
        
        if ($stmt->fetch()) {
            $upd = $db->prepare('UPDATE user_scientific_profile SET full_name = ?, title = ?, faculty = ?, department = ?, office = ? WHERE email = ?');
            $upd->execute([$name, $title, $faculty, $department, $office, $email]);
            $updated++;
        } else {
            $ins = $db->prepare('INSERT INTO user_scientific_profile (email, full_name, title, faculty, department, office, created) VALUES (?, ?, ?, ?, ?, ?, NOW())');
            $ins->execute([$email, $name, $title, $faculty, $department, $office]);
            $inserted++;
        }
    } catch (PDOException $e) {
        echo "Error for $email: " . $e->getMessage() . "\n";
    }
}

echo "Synced: $inserted new, $updated updated\n";

$count = $db->query('SELECT COUNT(*) FROM user_scientific_profile')->fetchColumn();
echo "Total in DB: $count\n";

// Now crawl publications
echo "\n=== Starting publication crawl ===\n";

$allStaff = $db->query('SELECT email, full_name, orcid FROM user_scientific_profile WHERE email <> "" ORDER BY email ASC')->fetchAll(PDO::FETCH_ASSOC);

$totalNew = 0;
$totalPubs = 0;

foreach ($allStaff as $i => $member) {
    $num = $i + 1;
    $email = $member['email'];
    $name = $member['full_name'];
    $orcid = $member['orcid'];
    
    echo "[$num/" . count($allStaff) . "] $name ($email)\n";
    
    $allPubs = [];
    
    // ORCID
    if (!empty($orcid) && preg_match('/^\d{4}-\d{4}-\d{4}-\d{3}[0-9X]$/i', $orcid)) {
        echo "  ORCID... ";
        $url = 'https://pub.orcid.org/v3.0/' . urlencode($orcid) . '/record';
        $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => "Accept: application/json\r\n", 'timeout' => 30, 'ignore_errors' => true]]);
        $resp = @file_get_contents($url, false, $ctx);
        if ($resp) {
            $rec = json_decode($resp, true);
            $groups = $rec['activities-summary']['works']['group'] ?? [];
            foreach ($groups as $g) {
                foreach ($g['work-summary'] ?? [] as $w) {
                    $title = $w['title']['title']['value'] ?? '';
                    if (!$title || !is_string($title)) continue;
                    $doi = '';
                    foreach ($w['external-ids']['external-id'] ?? [] as $e) {
                        if (($e['external-id-type'] ?? '') === 'doi') { $doi = $e['external-id-value'] ?? ''; break; }
                    }
                    $key = ($doi ?: md5($title)) . '|' . $email;
                    $allPubs[$key] = ['title' => $title, 'journal' => $w['journal-title']['value'] ?? '', 'year' => ($w['publication-date']['year']['value'] ?? null) ? (int)$w['publication-date']['year']['value'] : null, 'doi' => $doi, 'url' => $doi ? "https://doi.org/$doi" : '', 'source' => 'orcid'];
                }
            }
            echo count($groups) . " groups\n";
        } else {
            echo "failed\n";
        }
        usleep(1000000);
    }
    
    // CrossRef
    if (!empty($name)) {
        echo "  CrossRef... ";
        $url = 'https://api.crossref.org/works?query.author=' . urlencode($name) . '&rows=50';
        $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => "Accept: application/json\r\nUser-Agent: UEV-ERP/1.0\r\n", 'timeout' => 30, 'ignore_errors' => true]]);
        $resp = @file_get_contents($url, false, $ctx);
        if ($resp) {
            $data = json_decode($resp, true);
            $items = $data['message']['items'] ?? [];
            $matched = 0;
            foreach ($items as $item) {
                $title = $item['title'][0] ?? '';
                if (!$title) continue;
                $doi = $item['DOI'] ?? '';
                $year = $item['published-print']['date-parts'][0][0] ?? ($item['published-online']['date-parts'][0][0] ?? null);
                $key = ($doi ?: md5($title)) . '|' . $email;
                if (!isset($allPubs[$key])) {
                    $allPubs[$key] = ['title' => $title, 'journal' => $item['container-title'][0] ?? '', 'year' => $year ? (int)$year : null, 'doi' => $doi, 'url' => $doi ? "https://doi.org/$doi" : '', 'source' => 'crossref'];
                    $matched++;
                }
            }
            echo "$matched matched\n";
        } else {
            echo "failed\n";
        }
        usleep(1000000);
    }
    
    // OpenAlex
    if (!empty($name)) {
        echo "  OpenAlex... ";
        $url = 'https://api.openalex.org/works?search=' . urlencode($name) . '&per-page=50';
        $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => "Accept: application/json\r\nUser-Agent: UEV-ERP/1.0\r\n", 'timeout' => 30, 'ignore_errors' => true]]);
        $resp = @file_get_contents($url, false, $ctx);
        if ($resp) {
            $data = json_decode($resp, true);
            $results = $data['results'] ?? [];
            $matched = 0;
            foreach ($results as $w) {
                $title = $w['title'] ?? $w['display_name'] ?? '';
                if (!$title) continue;
                $doi = $w['doi'] ?? '';
                if ($doi) $doi = str_replace('https://doi.org/', '', $doi);
                $year = $w['publication_year'] ?? null;
                $key = ($doi ?: md5($title)) . '|' . $email;
                if (!isset($allPubs[$key])) {
                    $allPubs[$key] = ['title' => $title, 'journal' => $w['primary_location']['source']['display_name'] ?? '', 'year' => $year ? (int)$year : null, 'doi' => $doi, 'url' => $doi ? "https://doi.org/$doi" : '', 'source' => 'openalex'];
                    $matched++;
                }
            }
            echo "$matched matched\n";
        } else {
            echo "failed\n";
        }
        usleep(1000000);
    }
    
    $publications = array_values($allPubs);
    $totalPubs += count($publications);
    
    // Store
    $stored = 0;
    $upd = 0;
    foreach ($publications as $pub) {
        $id = 'sw_' . md5($email . ($pub['doi'] ?: $pub['title']));
        $existing = $db->prepare('SELECT id FROM scientific_works WHERE id = ?');
        $existing->execute([$id]);
        
        // Truncate to avoid data length errors
        $title = substr($pub['title'] ?? '', 0, 1000);
        $journal = substr($pub['journal'] ?? '', 0, 10000);
        $doi = substr($pub['doi'] ?? '', 0, 255);
        $url = substr($pub['url'] ?? '', 0, 1000);
        $source = substr($pub['source'] ?? '', 0, 32);
        $year = $pub['year'] ? (int)$pub['year'] : null;
        
        if ($existing->fetch()) {
            $u = $db->prepare('UPDATE scientific_works SET title = ?, publication = ?, year = ?, doi = ?, url = ?, source = ? WHERE id = ?');
            $u->execute([$title, $journal, $year, $doi, $url, $source, $id]);
            $upd++;
        } else {
            $in = $db->prepare('INSERT INTO scientific_works (id, author_email, title, authors, publication, year, doi, url, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
            $in->execute([$id, $email, $title, $name, $journal, $year, $doi, $url, $source]);
            $stored++;
        }
    }
    
    $db->prepare('UPDATE user_scientific_profile SET work_count = ?, last_synced = NOW() WHERE email = ?')->execute([count($publications), $email]);
    
    echo "  Stored: $stored new, $upd updated (total: " . count($publications) . ")\n";
    $totalNew += $stored;
    
    if ($num < count($allStaff)) {
        usleep(1000000);
    }
    echo "\n";
}

echo "\n========================================\n";
echo "  FULL SYNC + CRAWL COMPLETE\n";
echo "========================================\n";
echo "Staff: $inserted new, $updated updated\n";
echo "Publications: $totalPubs found, $totalNew new\n";

echo "\n--- FINAL STATE ---\n";
$final = $db->query('SELECT email, work_count FROM user_scientific_profile WHERE work_count > 0 ORDER BY work_count DESC LIMIT 20');
foreach ($final as $row) {
    echo "  " . str_pad($row['email'], 35) . " | works=" . $row['work_count'] . "\n";
}
