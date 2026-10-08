<?php
$content = file_get_contents('C:/Users/stoyk/AppData/Local/hermes/attachments/pasted_content_2026-09-16_06-40-23-495_66066c.txt');
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
