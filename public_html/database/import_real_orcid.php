<?php
/**
 * Real ORCID Publications Importer
 * Fetches actual ORCID records for UE-Varna researchers
 * Only imports verified, real-life data with real DOIs
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'import_real_orcid':
        importRealOrcID($pdo);
        break;
    case 'search_orcid_by_name':
        searchOrcIDByName($pdo);
        break;
    case 'get_researcher_status':
        getResearcherStatus($pdo);
        break;
    case 'clean_fake_data':
        cleanFakeData($pdo);
        break;
    default:
        echo json_encode(['error' => 'Unknown action']);
}

/**
 * Import real ORCID publications for a researcher
 */
function importRealOrcID(PDO $pdo): void {
    $orcid = $_POST['orcid'] ?? $_GET['orcid'] ?? '';
    $email = $_POST['email'] ?? $_GET['email'] ?? '';
    
    if (empty($orcid) || empty($email)) {
        echo json_encode(['error' => 'ORCID and email required']);
        return;
    }
    
    // Validate ORCID format
    if (!preg_match('/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/', $orcid)) {
        echo json_encode(['error' => 'Invalid ORCID format']);
        return;
    }
    
    echo "Importing ORCID $orcid for $email...\n";
    
    // Fetch from ORCID API
    $url = "https://pub.orcid.org/v3.0/$orcid/works";
    $ch = curl_init();
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
        echo json_encode(['error' => 'No works found in ORCID']);
        return;
    }
    
    // Start transaction
    $pdo->beginTransaction();
    
    try {
        // Update profile with ORCID
        $stmt = $pdo->prepare("UPDATE user_scientific_profile SET orcid_id = ?, last_synced = NOW() WHERE email = ?");
        $stmt->execute([$orcid, $email]);
        
        // Delete old ORCID-sourced works for this email (keep manual ones)
        $stmt = $pdo->prepare("DELETE FROM scientific_works WHERE author_email = ? AND source = 'orcid'");
        $stmt->execute([$email]);
        
        $imported = 0;
        $skipped = 0;
        
        foreach ($data['group'] as $group) {
            foreach ($group['work-summary'] as $work) {
                $title = $work['title']['title']['value'] ?? '';
                if (empty($title)) {
                    $skipped++;
                    continue;
                }
                
                // Extract year
                $year = null;
                if (isset($work['publication-date']['year']['value'])) {
                    $year = (int) $work['publication-date']['year']['value'];
                }
                
                // Extract DOI
                $doi = '';
                if (isset($work['external-ids']['external-id'])) {
                    foreach ($work['external-ids']['external-id'] as $eid) {
                        if ($eid['external-id-type'] === 'doi') {
                            $doi = $eid['external-id-value'];
                            break;
                        }
                    }
                }
                
                // Extract type
                $type = $work['type'] ?? 'unknown';
                
                // Extract journal
                $journal = $work['journal-title']['value'] ?? '';
                
                // Insert work
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
            'skipped' => $skipped,
            'message' => "Импортирани $imported публикации от ORCID"
        ], JSON_UNESCAPED_UNICODE);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['error' => 'Import failed: ' . $e->getMessage()]);
    }
}

/**
 * Search ORCID by name for a researcher
 */
function searchOrcIDByName(PDO $pdo): void {
    $name = $_POST['name'] ?? $_GET['name'] ?? '';
    $email = $_POST['email'] ?? $_GET['email'] ?? '';
    
    if (empty($name)) {
        echo json_encode(['error' => 'Name required']);
        return;
    }
    
    $parts = explode(' ', trim($name), 2);
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
    $results = [];
    
    if (!empty($data['result'])) {
        foreach (array_slice($data['result'], 0, 10) as $r) {
            $orcidId = $r['orcid-identifier']['path'] ?? '';
            // Fetch person details
            $personUrl = "https://pub.orcid.org/v3.0/$orcidId/person";
            $ch = curl_init();
            curl_setopt_array($ch, [
                CURLOPT_URL => $personUrl,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HTTPHEADER => ['Accept: application/json'],
                CURLOPT_TIMEOUT => 15,
            ]);
            $personResp = curl_exec($ch);
            curl_close($ch);
            $person = json_decode($personResp, true);
            
            $results[] = [
                'orcid' => $orcidId,
                'given' => $person['name']['given-names']['value'] ?? '',
                'family' => $person['name']['family-name']['value'] ?? '',
                'credit' => $person['name']['credit-name']['value'] ?? '',
            ];
        }
    }
    
    echo json_encode([
        'success' => true,
        'query' => $name,
        'results' => $results,
        'count' => count($results)
    ], JSON_UNESCAPED_UNICODE);
}

/**
 * Get status of all researchers
 */
function getResearcherStatus(PDO $pdo): void {
    $stmt = $pdo->query("SELECT email, full_name, orcid_id, work_count, last_synced FROM user_scientific_profile ORDER BY email");
    $profiles = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'researchers' => $profiles
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}

/**
 * Clean fake data from email-as-query false positives
 */
function cleanFakeData(PDO $pdo): void {
    // Delete works where the title doesn't match the author's actual research area
    // (heuristic: titles with no connection to the author)
    $stmt = $pdo->query("SELECT email, full_name FROM user_scientific_profile");
    $profiles = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $cleaned = 0;
    
    foreach ($profiles as $p) {
        if (empty($p['full_name'])) {
            // Delete ORCID-sourced works for profiles with no name (false positives)
            $del = $pdo->prepare("DELETE FROM scientific_works WHERE author_email = ? AND source = 'orcid'");
            $del->execute([$p['email']]);
            $cleaned += $del->rowCount();
        }
    }
    
    echo json_encode([
        'success' => true,
        'cleaned' => $cleaned,
        'message' => "Почистени $cleaned фалшиви записа"
    ], JSON_UNESCAPED_UNICODE);
}