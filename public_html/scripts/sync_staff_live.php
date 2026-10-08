<?php
/**
 * Sync pasted staff list to live DB
 * Run on live server
 */
require_once '/home/u129919172/domains/sr-ue-varna.com/public_html/database/config.php';

$content = file_get_contents('php://stdin');
$lines = explode("\n", $content);

$staff = [];
$current = [];

foreach ($lines as $line) {
    $line = trim($line);
    if (empty($line)) continue;
    
    if (preg_match('/^(Facebook|X|LinkedIn|Instagram|Youtube|ИУ|бул\.|Прием|Бакалавър|Магистър|Доктор|Продължащо|Информация|Докторантско|НИИ|Бизнес|Тренинги|Уъркшопи|Конференция|Полезно|Допълнителна|Често|Новини|Контакти|За контакти|scientific\.projects|0882|©|Декларация|Предложения|Карта|Отчетност|Календар)/u', $line)) {
        continue;
    }
    
    $current[] = $line;
    
    if (filter_var($line, FILTER_VALIDATE_EMAIL) && str_contains($line, 'ue-varna.bg')) {
        if (count($current) >= 2) {
            $name = $current[0];
            $email = $line;
            if (!str_contains($email, 'students.ue-varna.bg')) {
                $staff[] = ['name' => $name, 'email' => $email];
            }
        }
        $current = [];
    }
}

echo "Parsed " . count($staff) . " staff members\n";

// Use config's getDB() function
$db = getDB();
$inserted = 0;
$updated = 0;
$skipped = 0;

foreach ($staff as $member) {
    $name = $member['name'];
    $email = $member['email'];
    
    try {
        // Check if exists
        $stmt = $db->prepare('SELECT email FROM user_scientific_profile WHERE email = ?');
        $stmt->execute([$email]);
        
        if ($stmt->fetch()) {
            // Update name
            $upd = $db->prepare('UPDATE user_scientific_profile SET full_name = ? WHERE email = ?');
            $upd->execute([$name, $email]);
            $updated++;
        } else {
            // Insert
            $ins = $db->prepare('INSERT INTO user_scientific_profile (email, full_name, created) VALUES (?, ?, NOW())');
            $ins->execute([$email, $name]);
            $inserted++;
        }
    } catch (PDOException $e) {
        echo "Error for $email: " . $e->getMessage() . "\n";
        $skipped++;
    }
}

echo "Results:\n";
echo "  Inserted: $inserted\n";
echo "  Updated: $updated\n";
echo "  Errors: $skipped\n";

// Verify
$count = $db->query('SELECT COUNT(*) FROM user_scientific_profile')->fetchColumn();
echo "  Total in DB: $count\n";
