<?php
/**
 * sar34_seed_sql.php — Seed SAR34 reference data to live Hostinger DB.
 * Uses ACTUAL live column names. Idempotent: INSERT IGNORE, safe to re-run.
 * Now with proper PDO prepared statements for all inserts including project_templates.
 */
require_once __DIR__ . '/database/config.php';
require_once __DIR__ . '/database/sql_service.php';

$pass = $fail = 0;
function ok($m){global $pass; $pass++; echo "  [OK]   $m\n";}
function bad($m){global $fail; $fail++; echo "  [FAIL] $m\n";}

echo "╔══════════════════════════════════════════════════════════════════╗\n";
echo "║  SAR34 Data Seed — Live Hostinger DB  (sr-ue-varna.com)        ║\n";
echo "╚══════════════════════════════════════════════════════════════════╝\n\n";

$db = getDB();

// ── 1. cost_groups (live columns: group_code, label_bg, label_en, sort_order) ──
echo "── 1. Seed cost_groups ──\n";
$existing = $db->query("SELECT group_code FROM cost_groups")->fetchAll(PDO::FETCH_COLUMN);
$sar34CG = [
    ['assets','Дълготрайни активи','Assets',1],
    ['salaries','Заплати/възнаграждения','Salaries',2],
    ['external_services','Външни услуги','External Services',3],
    ['literature','Литература','Literature',4],
    ['travel','Пътувания','Travel',5],
    ['publications','Публикации','Publications',6],
    ['reviews','Рецензиране','Reviews',7],
    ['consumables','Консумативи','Consumables',8],
    ['other','Други','Other',9],
];
$ins = 0;
foreach ($sar34CG as $g) {
    if (in_array($g[0], $existing)) continue;
    try { $db->prepare("INSERT IGNORE INTO cost_groups (group_code,label_bg,label_en,sort_order) VALUES (?,?,?,?)")->execute($g); $ins++; }
    catch (Throwable $e) { bad("  {$g[0]}: " . $e->getMessage()); }
}
ok("cost_groups: $ins seeded (live had " . count($existing) . ")\n");

// ── 2. deliverable_types (live columns: type_code, label_bg, label_en, sort_order) ──
echo "\n── 2. Seed deliverable_types ──\n";
$existing = $db->query("SELECT type_code FROM deliverable_types")->fetchAll(PDO::FETCH_COLUMN);
$sar34DT = [
    ['publication_scopus','Публикация Scopus','Scopus Publication',1],
    ['publication_wos','Публикация Web of Science','WoS Publication',2],
    ['publication_other','Друга публикация','Other Publication',3],
    ['monograph','Монография','Monograph',4],
    ['trl_product','TRL продукт','TRL Product',5],
    ['international_proposal','Международно предложение','International Proposal',6],
    ['conference','Конференция','Conference',7],
    ['patent','Патент','Patent',8],
    ['prototype','Прототип','Prototype',9],
    ['dataset','Набор от данни','Dataset',10],
    ['software','Софтуер','Software',11],
    ['other','Други','Other',12],
];
$ins = 0;
foreach ($sar34DT as $d) {
    if (in_array($d[0], $existing)) continue;
    try { $db->prepare("INSERT IGNORE INTO deliverable_types (type_code,label_bg,label_en,sort_order) VALUES (?,?,?,?)")->execute($d); $ins++; }
    catch (Throwable $e) { bad("  {$d[0]}: " . $e->getMessage()); }
}
ok("deliverable_types: $ins seeded (live had " . count($existing) . ")\n");

// ── 3. data_version entries ──
echo "\n── 3. Seed data_version entries ──\n";
$existing = $db->query("SELECT table_name FROM data_version")->fetchAll(PDO::FETCH_COLUMN);
$sar34DV = ['library_folders','application_documents','collaborators','work_programs','trl_records','support_letters','self_assessments'];
$ins = 0;
foreach ($sar34DV as $t) {
    if (in_array($t, $existing)) continue;
    try { $db->prepare("INSERT IGNORE INTO data_version (table_name,version,updated_at) VALUES (?,0,NOW())")->execute([$t]); $ins++; }
    catch (Throwable $e) { bad("  $t: " . $e->getMessage()); }
}
ok("data_version: $ins seeded (live had " . count($existing) . ")\n");

// ── 4. library_folders from documents ──
echo "\n── 4. Seed library_folders ──\n";
$folderRows = $db->query("SELECT DISTINCT folder_name FROM documents WHERE origin='library' AND folder_name != 'T' ORDER BY folder_name")->fetchAll(PDO::FETCH_COLUMN);
echo "  Found " . count($folderRows) . " unique library folder names\n";
$ins = 0;
$existing = $db->query("SELECT name FROM library_folders")->fetchAll(PDO::FETCH_COLUMN);
// Delete stale "T" test folders
$db->exec("DELETE FROM library_folders WHERE name='T'");
foreach ($folderRows as $fn) {
    if (in_array($fn, $existing)) { $existing[] = $fn; continue; }
    $id = 'lib_' . preg_replace('/[^a-zA-Z0-9а-яА-Я]/u', '_', substr($fn, 0, 40));
    try { $db->prepare("INSERT IGNORE INTO library_folders (id,name,description,parent_id,sort_order,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,NOW(),NOW())")->execute([$id,$fn,'','NULL',0,1]); $ins++; $existing[] = $fn; }
    catch (Throwable $e) { bad("  $fn: " . $e->getMessage()); }
}
$total = $db->query("SELECT COUNT(*) FROM library_folders")->fetchColumn();
ok("library_folders: $ins new seeded. Total: $total\n");

// ── 5. project_templates schema fix + seed budget templates ──
echo "\n── 5. Fix project_templates schema + seed budget templates ──\n";
$ptCols = $db->query("SHOW COLUMNS FROM project_templates")->fetchAll(PDO::FETCH_COLUMN);
$hasPT = in_array('project_type', $ptCols);
$hasDT = in_array('doc_type', $ptCols);
$hasDID = in_array('drive_id', $ptCols);
echo "  Current columns: " . implode(', ', $ptCols) . "\n";
if (!$hasPT || !$hasDT || !$hasDID) {
    echo "  Altering project_templates schema to match SAR34...\n";
    $alters = [];
    if (!$hasPT) $alters[] = "ADD COLUMN project_type VARCHAR(16) DEFAULT NULL AFTER name";
    if (!$hasDT) $alters[] = "ADD COLUMN doc_type VARCHAR(32) DEFAULT 'budget' AFTER project_type";
    if (!$hasDID) $alters[] = "ADD COLUMN drive_id VARCHAR(128) DEFAULT NULL AFTER doc_type";
    $alters[] = "ADD COLUMN gid VARCHAR(32) DEFAULT NULL AFTER drive_id";
    $alters[] = "ADD COLUMN label VARCHAR(255) DEFAULT '' AFTER gid";
    $alters[] = "ADD COLUMN static_path VARCHAR(255) DEFAULT NULL AFTER label";
    $alters[] = "ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER static_path";
    // Skip created_at/updated_at — they already exist (live table has them)
    $alters[] = "ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP AFTER is_active";
    $alters[] = "ADD COLUMN updated_at DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP AFTER created_at";
    $okA = 0;
    $skipped = 0;
    foreach ($alters as $a) {
        // Check if column already exists before attempting ALTER
        $colName = preg_replace('/ADD COLUMN (\w+)/', '$1', $a);
        if (in_array($colName, $ptCols)) {
            $skipped++;
            echo "    ⊖ " . substr($a, 0, 55) . "... [already exists]\n";
            continue;
        }
        try { $db->exec("ALTER TABLE project_templates $a"); $okA++; echo "    + " . substr($a, 0, 55) . "...\n"; }
        catch (Throwable $e) { bad("    ALTER failed: " . substr($a, 0, 55) . " — " . $e->getMessage()); }
        // Re-read columns after each successful ALTER for next check
        $ptCols = $db->query("SHOW COLUMNS FROM project_templates")->fetchAll(PDO::FETCH_COLUMN);
    }
    ok("Altered $okA/" . count($alters) . " columns ($skipped skipped — already present)");
}

// Seed the 4 budget templates — use prepared statement with PDO
$sar34Tpl = [
    ['ФНИ','1MCGrMcU82NY_yDqjXxyOxFS5Uwz9Xz5j8zUZYSfrUqQ','893829297','Бюджетна таблица — ФНИ'],
    ['ПНИ','1HqdUGvRobKSIkVajBEeN_OzLDq7kfZpaVWbc1qG3Xwc','403420795','Бюджетна таблица — ПНИ'],
    ['ДНП','1JZljcUkQz5-2lQfDXHM69ehmPaV8XD9a714v1voImy4','683768571','Бюджетна таблица — ДНП'],
    ['НПФ','1LhGG2IFoWhw3VuxwML7J7S5jLEnPApukmvUB9kC5Fbs','1015761759','Бюджетна таблица — НПФ'],
];
$ins = 0;
$stmtTpl = $db->prepare("INSERT IGNORE INTO project_templates (code,name,project_type,doc_type,drive_id,gid,label,is_active,created_at,updated_at)
                         VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())");
foreach ($sar34Tpl as $t) {
    $code = $t[0] . '-budget';
    $label = $t[3];
    $exists = $db->prepare("SELECT 1 FROM project_templates WHERE code=?");
    $exists->execute([$code]);
    if ($exists->fetchColumn()) continue;
    try {
        $stmtTpl->execute([$code, $label, $t[0], 'budget', $t[1], $t[2], $label, 1]);
        $ins++;
    } catch (Throwable $e) { bad("  {$t[0]}: " . $e->getMessage()); }
}
$total = $db->query("SELECT COUNT(*) FROM project_templates")->fetchColumn();
ok("project_templates: $ins seeded. Total: $total\n");

// ── 6. Seed library documents from seed-local-docs.json ──
echo "\n── 6. Seed library documents from seed-local-docs.json ──\n";
$seedFile = __DIR__ . '/seed-local-docs.json';
if (!file_exists($seedFile)) {
    $remote = '/home/u129919172/domains/sr-ue-varna.com/public_html/seed-local-docs.json';
    if (file_exists($remote)) { $seedFile = $remote; echo "  Using seed from server\n"; }
}
if (!file_exists($seedFile)) {
    bad("seed-local-docs.json not found — skipping document seed");
} else {
    $j = json_decode(file_get_contents($seedFile), true);
    $docs = $j['documents'] ?? [];
    $count = is_array($docs) ? count($docs) : 0;
    echo "  Seed: {$j['count']} documents (generated {$j['generated']}), $count in array\n";
    if ($count > 0) {
        $ins = $dup = 0; $errs = [];
        $stmt = $db->prepare("INSERT INTO documents (id,name,mime_type,size,folder_name,origin,content,created,modified) VALUES (?,?,?,?,?,?,?,?,?)");
        $stmt2 = $db->prepare("INSERT IGNORE INTO documents (id,name,mime_type,size,folder_name,origin,content,created,modified) VALUES (?,?,?,?,?,?,?,?,?)");
        foreach ($docs as $d) {
            $id = $d['id'] ?? null;
            if (!$id) continue;
            $exists = $db->prepare("SELECT 1 FROM documents WHERE id=?");
            $exists->execute([$id]);
            if ($exists->fetchColumn()) { $dup++; continue; }
            $content = $d['contentBytes'] ?? $d['content'] ?? null;
            if ($content && preg_match('/^[A-Za-z0-9+\/=]+$/', $content)) {
                $content = base64_decode($content, true);
                if ($content === false) { $errs[] = "$id: base64 failed"; continue; }
            }
            $name      = $d['name'] ?? '';
            $mimeType  = $d['mime_type'] ?? 'application/octet-stream';
            $size      = (int)($d['size'] ?? 0);
            $folder    = $d['folder_name'] ?? '';
            $origin    = $d['origin'] ?? 'library';
            $created   = $d['created'] ?? date('Y-m-d H:i:s');
            $modified  = $d['modified'] ?? $created;
            try {
                $stmt->execute([$id,$name,$mimeType,$size,$folder,$origin,$content,$created,$modified]);
                $ins++;
            } catch (Throwable $e) {
                try {
                    $stmt2->execute([$id,$name,$mimeType,$size,$folder,$origin,$content,$created,$modified]);
                    $ins++;
                } catch (Throwable $e2) { $errs[] = "$id: " . substr($e2->getMessage(),0,80); }
            }
            if ($ins % 10 === 0) echo "    ...seeded $ins / $count\n";
        }
        foreach ($errs as $e) bad("  $e");
        $total = $db->query("SELECT COUNT(*) FROM documents")->fetchColumn();
        ok("Seeded $ins new documents ($dup already existed). Live total: $total");
    } else {
        ok("No documents in seed file — skipping");
    }
}

// ── 7. Verify admin email ──
echo "\n── 7. Verify admin email 107477@students.ue-varna.bg ──\n";
$a = $db->query("SELECT * FROM admin_emails WHERE email='107477@students.ue-varna.bg'")->fetch(PDO::FETCH_ASSOC);
if ($a) { ok("107477@students.ue-varna.bg = {$a['role']} (added {$a['added_at']})"); }
else {
    try { $db->exec("INSERT INTO admin_emails (email,role,name,added_at) VALUES ('107477@students.ue-varna.bg','admin','yoni',NOW())"); ok("Added as admin"); }
    catch (Throwable $e) { bad("  Failed: " . $e->getMessage()); }
}

// ── 8. FINAL INVENTORY ──
echo "\n── 8. Final live data inventory ──\n";
$tnames = ['applications','documents','competitions','projects',
    'library_folders','library_deposits','collaborators',
    'work_programs','support_letters','trl_records','self_assessments',
    'reviews','messages','notifications','project_templates',
    'cost_groups','deliverable_types','data_version','admin_emails',
    'sessions','document_comments','doc_stream_docs','veda_email_cache'];
foreach ($tnames as $t) {
    $c = $db->query("SELECT COUNT(*) FROM `$t`")->fetchColumn();
    echo "  " . ($c>0?'●':'○') . "  $t: $c\n";
}

echo "\n╔══════════════════════════════════════════════════════════════════╗\n";
echo "║  RESULT: $pass applied, $fail failed                              ║\n";
echo "╚══════════════════════════════════════════════════════════════════╝\n";
echo $fail ? "\n[WARN] $fail issue(s) above.\n" : "\n[PASS] SAR34 data seeding complete.\n";
unlink(__FILE__);
