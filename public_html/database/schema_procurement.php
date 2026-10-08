<?php
/**
 * UEV-ERP Procurement Module Schema v12.54.50
 * Pazardzhik Municipality Public Procurement (ЗОП, Ch.XXVI, Art.186+Art.20,al.3,t.2)
 *
 * Tables: procurement_positions, procurement_documents, procurement_contract,
 *         procurement_supervision, procurement_payments, procurement_compliance,
 *         procurement_subcontractors, procurement_schedule
 *
 * Regulatory basis: ЗОП, ЗУТ Art.162/171, EU Taxonomy 2020/852,
 *                   Наредба №4, Наредба №3/2003, ЗКАИИП
 */

function ensureSchemaProcurement(): void {
    $db = getDB();

    // ── Positions (обособени позиции) ──────────────────────────────
    $db->exec("
        CREATE TABLE IF NOT EXISTS `procurement_positions` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `position_number` TINYINT UNSIGNED NOT NULL,
            `village_name` VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `sport_type` VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `status` VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planned',
            `budget_eur` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            `contract_value_eur` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            `start_date` DATE DEFAULT NULL,
            `deadline_date` DATE DEFAULT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uk_position_number` (`position_number`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // ── Documents (документи по проектни части) ────────────────────
    $db->exec("
        CREATE TABLE IF NOT EXISTS `procurement_documents` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `position_id` INT UNSIGNED NOT NULL,
            `project_part` VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `document_type` VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `file_path` VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `paper_copies` TINYINT UNSIGNED NOT NULL DEFAULT 0,
            `electronic_copies` TINYINT UNSIGNED NOT NULL DEFAULT 0,
            `cad4_path` VARCHAR(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `status` VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `fk_position_id` (`position_id`),
            CONSTRAINT `fk_doc_position` FOREIGN KEY (`position_id`) REFERENCES `procurement_positions` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // ── Contract details ───────────────────────────────────────────
    $db->exec("
        CREATE TABLE IF NOT EXISTS `procurement_contract` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `position_id` INT UNSIGNED NOT NULL,
            `contract_value_eur` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            `vat_eur` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            `total_eur` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            `penalty_rate` DECIMAL(5,4) NOT NULL DEFAULT 0.0025,
            `penalty_days` INT UNSIGNED NOT NULL DEFAULT 0,
            `penalty_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            `insurance_valid` BOOLEAN NOT NULL DEFAULT FALSE,
            `insurance_provider` VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `insurance_expiry` DATE DEFAULT NULL,
            `is_conditional` BOOLEAN NOT NULL DEFAULT FALSE,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uk_position_contract` (`position_id`),
            CONSTRAINT `fk_contract_position` FOREIGN KEY (`position_id`) REFERENCES `procurement_positions` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // ── Author's supervision (по ЗУТ Art.162) ────────────────────
    $db->exec("
        CREATE TABLE IF NOT EXISTS `procurement_supervision` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `position_id` INT UNSIGNED NOT NULL,
            `supervision_date` DATE NOT NULL,
            `site_visit_notes` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `acts_signed` BOOLEAN NOT NULL DEFAULT FALSE,
            `protocol_number` VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `status` VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `fk_supervision_position` (`position_id`),
            CONSTRAINT `fk_supervision_position` FOREIGN KEY (`position_id`) REFERENCES `procurement_positions` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // ── Payments (100% upon delivery+acceptance+invoice) ──────────
    $db->exec("
        CREATE TABLE IF NOT EXISTS `procurement_payments` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `position_id` INT UNSIGNED NOT NULL,
            `activity_type` VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `amount_eur` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
            `paid` BOOLEAN NOT NULL DEFAULT FALSE,
            `payment_date` DATE DEFAULT NULL,
            `invoice_number` VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `acceptance_protocol` VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `status` VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `fk_payment_position` (`position_id`),
            CONSTRAINT `fk_payment_position` FOREIGN KEY (`position_id`) REFERENCES `procurement_positions` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // ── Compliance (ЗУТ, EU Taxonomy, БДС EN, Наредба №4/№3) ─────
    $db->exec("
        CREATE TABLE IF NOT EXISTS `procurement_compliance` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `position_id` INT UNSIGNED NOT NULL,
            `regulation_name` VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `compliance_status` VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
            `checked_by` VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `checked_date` DATE DEFAULT NULL,
            `notes` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `fk_compliance_position` (`position_id`),
            CONSTRAINT `fk_compliance_position` FOREIGN KEY (`position_id`) REFERENCES `procurement_positions` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // ── Subcontractors ─────────────────────────────────────────────
    $db->exec("
        CREATE TABLE IF NOT EXISTS `procurement_subcontractors` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `position_id` INT UNSIGNED NOT NULL,
            `subcontractor_name` VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `specialization` VARCHAR(120) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `insurance_valid` BOOLEAN NOT NULL DEFAULT FALSE,
            `role` VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `fk_sub_position` (`position_id`),
            CONSTRAINT `fk_sub_position` FOREIGN KEY (`position_id`) REFERENCES `procurement_positions` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // ── Schedule / Timeline ────────────────────────────────────────
    $db->exec("
        CREATE TABLE IF NOT EXISTS `procurement_schedule` (
            `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `position_id` INT UNSIGNED NOT NULL,
            `task_name` VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
            `start_date` DATE NOT NULL,
            `end_date` DATE NOT NULL,
            `status` VARCHAR(40) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planned',
            `assigned_to` VARCHAR(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `fk_schedule_position` (`position_id`),
            CONSTRAINT `fk_schedule_position` FOREIGN KEY (`position_id`) REFERENCES `procurement_positions` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}
