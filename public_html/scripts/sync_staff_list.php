<?php
/**
 * Parse pasted staff content and sync to DB
 */
$content = file_get_contents(__DIR__ . '/../attachments/pasted_content_2026-09-16_06-40-23-495_66066c.txt');
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
foreach ($staff as $i => $s) {
    echo ($i+1) . ". " . $s['name'] . " | " . $s['email'] . "\n";
}

// Sync to DB
require_once __DIR__ . '/config.php';

$pdo = getDB();
$inserted = 0;
$skipped = 0;

foreach ($staff as $member) {
    $name = $member['name'];
    $email = $member['email'];
    
    // Check if exists
    $stmt = $pdo->prepare('SELECT email FROM user_scientific_profile WHERE email = ?');
    $stmt->execute([$email]);
    
    if ($stmt->fetch()) {
        // Update name
        $upd = $pdo->prepare('UPDATE user_scientific_profile SET full_name = ? WHERE email = ?');
        $upd->execute([$name, $email]);
        $skipped++;
    } else {
        // Insert
        $ins = $pdo->prepare('INSERT INTO user_scientific_profile (email, full_name, created) VALUES (?, ?, NOW())');
        $ins->execute([$email, $name]);
        $inserted++;
    }
}

echo "\nSynced: $inserted new, $skipped existing\n";
