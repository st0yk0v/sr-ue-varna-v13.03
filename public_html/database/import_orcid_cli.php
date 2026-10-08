<?php
/**
 * CLI: Import real ORCID data for UE-Varna researchers
 * Usage: php import_orcid_cli.php <admin_email>
 */
require_once __DIR__ . '/config.php';

$adminEmail = $argv[1] ?? 'admin@ue-varna.bg';

echo "=== Real ORCID Data Importer ===\n";
echo "Auth: $adminEmail\n\n";

$pdo = getDB();

if (!isAdminUser($adminEmail)) {
    echo "ERROR: Not an admin user\n";
    exit(1);
}

$orcid = '0000-0002-5976-6807';
$email = 'bistravas@ue-varna.bg';

echo "--- Importing ORCID $orcid for Bistra Vassileva ($email) ---\n";

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
    echo "ERROR: ORCID API returned HTTP $httpCode\n";
    exit(1);
}

$data = json_decode($response, true);
if (empty($data['group'])) {
    echo "ERROR: No works found\n";
    exit(1);
}

try {
    $stmt = $pdo->prepare("UPDATE user_scientific_profile SET orcid = ?, last_synced = NOW() WHERE email = ?");
    $stmt->execute([$orcid, $email]);
    echo "Updated profile with ORCID: $orcid\n";
    
    $stmt = $pdo->prepare("DELETE FROM scientific_works WHERE author_email = ? AND source = 'orcid'");
    $stmt->execute([$email]);
    echo "Cleared old ORCID works\n";
    
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
            $url = '';
            if (isset($work['external-ids']['external-id'])) {
                foreach ($work['external-ids']['external-id'] as $eid) {
                    if ($eid['external-id-type'] === 'doi') {
                        $doi = $eid['external-id-value'];
                        $url = 'https://doi.org/' . $doi;
                        break;
                    }
                }
            }
            
            $journal = $work['journal-title']['value'] ?? '';
            $id = bin2hex(random_bytes(16));
            
            $stmt = $pdo->prepare("INSERT INTO scientific_works (id, author_email, title, year, doi, url, publication, source, created) VALUES (?, ?, ?, ?, ?, ?, ?, 'orcid', NOW())");
            $stmt->execute([$id, $email, $title, $year, $doi, $url, $journal]);
            $imported++;
        }
    }
    
    $stmt = $pdo->prepare("UPDATE user_scientific_profile SET work_count = ? WHERE email = ?");
    $stmt->execute([$imported, $email]);
    
    echo "\n=== SUCCESS ===\n";
    echo "Imported $imported real publications from ORCID for Bistra Vassileva\n";
    
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}

echo "\n--- Cleaning false positives ---\n";
$stmt = $pdo->query("SELECT email FROM user_scientific_profile WHERE full_name = '' OR full_name IS NULL");
$emptyNameEmails = $stmt->fetchAll(PDO::FETCH_COLUMN);

$cleaned = 0;
foreach ($emptyNameEmails as $e) {
    $del = $pdo->prepare("DELETE FROM scientific_works WHERE author_email = ? AND source = 'orcid'");
    $del->execute([$e]);
    $cleaned += $del->rowCount();
    if ($del->rowCount() > 0) {
        echo "Cleaned {$del->rowCount()} false positives from $e\n";
    }
}
echo "Total cleaned: $cleaned\n";

echo "\n=== Final Status ===\n";
$stmt = $pdo->query("SELECT usp.email, usp.full_name, usp.orcid, usp.work_count, COUNT(sw.id) as actual FROM user_scientific_profile usp LEFT JOIN scientific_works sw ON sw.author_email = usp.email GROUP BY usp.email ORDER BY usp.email");
$results = $stmt->fetchAll(PDO::FETCH_ASSOC);

foreach ($results as $r) {
    $orcidStr = $r['orcid'] ? "ORCID: {$r['orcid']}" : "No ORCID";
    echo "{$r['email']} | {$r['full_name']} | $orcidStr | DB: {$r['actual']} works (profile: {$r['work_count']})\n";
}