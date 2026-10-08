<?php
/**
 * Real ORCID Data Importer
 * Imports verified ORCID records for UE-Varna researchers
 * Cleans false positives from email-as-query fallback
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'import_bistra_orcid':
        importBistraOrcID();
        break;
    case 'clean_false_positives':
        cleanFalsePositives();
        break;
    case 'verify_real_data':
        verifyRealData();
        break;
    case 'search_orcid_for_all':
        searchOrcIDForAll();
        break;
    default:
        echo json_encode(['error' => 'Unknown action', 'available' => ['import_bistra_orcid', 'clean_false_positives', 'verify_real_data', 'search_orcid_for_all']]);
}

/**
 * Import Bistra Vassileva's real ORCID record (0000-0002-5976-6807)
 * 29 verified works from ORCID Public API
 */
function importBistraOrcID(): void {
    $orcid = '0000-0002-5976-6807';
    $email = 'bistravas@ue-varna.bg';
    
    global $pdo;
    
    // Fetch from ORCID API
    $url = "https://pub.orcid.org/v3.0/$orcid/works";
    $ch = curl_init();
    curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_TIMEOUT => 30,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        echo json_encode(['error' => "ORCID API returned HTTP $httpCode"]);
        return;
    }
    
    $data = json_decode($response, true);
    if (empty($data['group'])) {
        echo json_encode(['error' => 'No works found']);
        return;
    }
    
    $pdo->beginTransaction();
    
    try {
        // Update profile with real ORCID
        $stmt = $pdo->prepare("UPDATE user_scientific_profile SET orcid_id = ?, last_synced = NOW() WHERE email = ?");
        $stmt->execute([$orcid, $email]);
        
        // Delete old ORCID-sourced works (keep manual ones)
        $stmt = $pdo->prepare("DELETE FROM scientific_works WHERE author_email = ? AND source = 'orcid'");
        $stmt->execute([$email]);
        
        $imported = 0;
        
        foreach ($data['group'] as $group) {
            foreach ($group['work-summary'] as $work) {
                $title = $work['title']['title']['value'] ?? '';
                if (empty($title)) continue;
                
                $year = null;
                if (isset($work['publication-date']['year']['value'])) {
                    $year = (int) $work['publication-date']['year']['value'];
                }
                
                $doi = '';
                if (isset($work['external-ids']['external-id'])) {
                    foreach ($work['external-ids']['external-id'] as $eid) {
                        if ($eid['external-id-type'] === 'doi') {
                            $doi = $eid['external-id-value'];
                            break;
                        }
                    }
                }
                
                $type = $work['type'] ?? 'unknown';
                $journal = $work['journal-title']['value'] ?? '';
                
                $stmt = $pdo->prepare("INSERT INTO scientific_works (author_email, title, year, doi, type, journal, source, created) VALUES (?, ?, ?, ?, ?, ?, 'orcid', NOW())");
                $stmt->execute([$email, $title, $year, $doi, $type, $journal]);
                $imported++;
            }
        }
        
        // Update work count
        $stmt = $pdo->prepare("UPDATE user_scientific_profile SET work_count = ? WHERE email = ?");
        $stmt->execute([$imported, $email]);
        
        $pdo->commit();
        
        echo json_encode([
            'success' => true,
            'orcid' => $orcid,
            'email' => $email,
            'imported' => $imported,
            'message' => "Импортирани $imported реални публикации от ORCID за Bistra Vassileva"
        ], JSON_UNESCAPED_UNICODE);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['error' => $e->getMessage()]);
    }
}

/**
 * Clean false positives from email-as-query fallback
 * Deletes ORCID-sourced works for profiles with no name (false positives)
 */
function cleanFalsePositives(): void {
    global $pdo;
    
    $stmt = $pdo->query("SELECT email, full_name FROM user_scientific_profile");
    $profiles = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $cleaned = 0;
    
    foreach ($profiles as $p) {
        if (empty($p['full_name'])) {
            $del = $pdo->prepare("DELETE FROM scientific_works WHERE author_email = ? AND source = 'orcid'");
            $del->execute([$p['email']]);
            $cleaned += $del->rowCount();
        }
    }
    
    echo json_encode([
        'success' => true,
        'cleaned' => $cleaned,
        'message' => "Почистени $cleaned фалшиви записа от email-as-query"
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * Verify real data status
 */
function verifyRealData(): void {
    global $pdo;
    
    $stmt = $pdo->query("
        SELECT 
            usp.email,
            usp.full_name,
            usp.orcid_id,
            usp.work_count,
            usp.last_synced,
            COUNT(sw.id) as actual_works,
            GROUP_CONCAT(DISTINCT sw.source) as sources
        FROM user_scientific_profile usp
        LEFT JOIN scientific_works sw ON sw.author_email = usp.email
        GROUP BY usp.email
        ORDER BY usp.email
    ");
    
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'researchers' => $results
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}

/**
 * Search ORCID for all researchers with names
 */
function searchOrcIDForAll(): void {
    global $pdo;
    
    $stmt = $pdo->query("SELECT email, full_name FROM user_scientific_profile WHERE full_name <> '' AND orcid_id IS NULL");
    $researchers = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $results = [];
    
    foreach ($researchers as $r) {
        $parts = explode(' ', trim($r['full_name']), 2);
        $given = $parts[0] ?? '';
        $family = $parts[1] ?? '';
        
        $query = "family-name:$family+AND+given-names:$given";
        $url = "https://pub.orcid.org/v3.0/search/?q=" . urlencode($query);
        
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
            CURLOPT_TIMEOUT => 30,
        ]);
        $response = curl_exec($ch);
        curl_close($ch);
        
        $data = json_decode($response, true);
        $orcids = [];
        
        if (!empty($data['result'])) {
            foreach (array_slice($data['result'], 0, 5) as $res) {
                $orcids[] = $res['orcid-identifier']['path'] ?? '';
            }
        }
        
        $results[] = [
            'email' => $r['email'],
            'name' => $r['full_name'],
            'found_orcids' => $orcids
        ];
    }
    
    echo json_encode([
        'success' => true,
        'results' => $results
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}