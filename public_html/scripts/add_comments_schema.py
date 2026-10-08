#!/usr/bin/env python3
"""Add document_comments table to schema creation in api.php"""
f='database/api.php'
s=open(f,encoding='utf-8',newline='').read()

old = '''        "CREATE TABLE IF NOT EXISTS `scientific_works` (
          `id` VARCHAR(64) NOT NULL PRIMARY KEY,
          `author_email` VARCHAR(255) NOT NULL DEFAULT '',
          `title` VARCHAR(500) NOT NULL DEFAULT '',
          `authors` VARCHAR(500) NOT NULL DEFAULT '',
          `publication` VARCHAR(255) NOT NULL DEFAULT '',
          `year` INT NULL,
          `doi` VARCHAR(255) NOT NULL DEFAULT '',
          `url` VARCHAR(500) NOT NULL DEFAULT '',
          `cited_by` INT NULL,
          `source` VARCHAR(32) NOT NULL DEFAULT 'orcid',
          `created` DATETIME NULL,
          KEY `idx_sw_author_email` (`author_email`),
          KEY `idx_sw_doi` (`doi`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];'''

new = '''        "CREATE TABLE IF NOT EXISTS `scientific_works` (
          `id` VARCHAR(64) NOT NULL PRIMARY KEY,
          `author_email` VARCHAR(255) NOT NULL DEFAULT '',
          `title` VARCHAR(500) NOT NULL DEFAULT '',
          `authors` VARCHAR(500) NOT NULL DEFAULT '',
          `publication` VARCHAR(255) NOT NULL DEFAULT '',
          `year` INT NULL,
          `doi` VARCHAR(255) NOT NULL DEFAULT '',
          `url` VARCHAR(500) NOT NULL DEFAULT '',
          `cited_by` INT NULL,
          `source` VARCHAR(32) NOT NULL DEFAULT 'orcid',
          `created` DATETIME NULL,
          KEY `idx_sw_author_email` (`author_email`),
          KEY `idx_sw_doi` (`doi`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

        "CREATE TABLE IF NOT EXISTS `document_comments` (
          `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          `doc_id` VARCHAR(128) NOT NULL DEFAULT '',
          `author` VARCHAR(255) NOT NULL DEFAULT '',
          `text` TEXT NOT NULL,
          `created_at` DATETIME NULL,
          KEY `idx_dc_doc_id` (`doc_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    ];'''

if old in s:
    s = s.replace(old, new, 1)
    print("OK: Added document_comments to schema creation")
else:
    print("NOT FOUND")
    exit(1)

open(f,'w',encoding='utf-8',newline='').write(s)
