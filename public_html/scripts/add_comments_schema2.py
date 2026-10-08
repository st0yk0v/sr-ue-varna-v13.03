#!/usr/bin/env python3
"""Add document_comments table to schema creation in api.php (CRLF-aware)"""
f='database/api.php'
s=open(f,encoding='utf-8',newline='').read()

# Find the end of scientific_works CREATE TABLE using byte search
marker = 'KEY `idx_sw_doi` (`doi`)\r\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",\r\n    ];'
idx = s.find(marker)
if idx < 0:
    print("NOT FOUND")
    exit(1)

# Replace the closing ];\r\n with new table + ];\r\n
old = marker
new = '''KEY `idx_sw_doi` (`doi`)\r\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",\r\n\r\n        "CREATE TABLE IF NOT EXISTS `document_comments` (\r\n          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,\r\n          `doc_id` VARCHAR(128) NOT NULL DEFAULT '',\r\n          `author` VARCHAR(255) NOT NULL DEFAULT '',\r\n          `text` TEXT NOT NULL,\r\n          `created_at` DATETIME NULL,\r\n          KEY `idx_dc_doc_id` (`doc_id`)\r\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",\r\n    ];'''

s = s[:idx] + new + s[idx+len(old):]
print(f"OK: Added document_comments to schema at byte {idx}")

open(f,'w',encoding='utf-8',newline='').write(s)
