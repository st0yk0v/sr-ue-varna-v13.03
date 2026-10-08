-- ═══════════════════════════════════════════════════════════════════════
-- wizard_notifications — Email notifications for Proposal Wizard v2.0
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `wizard_notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `submission_id` BIGINT UNSIGNED NOT NULL,
  `recipient_email` VARCHAR(255) NOT NULL,
  `subject` VARCHAR(500) NOT NULL,
  `body` TEXT NOT NULL,
  `template` VARCHAR(100) DEFAULT 'generic',
  `status` ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `sent_at` DATETIME NULL,
  `error_message` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_submission` (`submission_id`),
  KEY `idx_recipient` (`recipient_email`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_wizard_notifications_submission` FOREIGN KEY (`submission_id`) REFERENCES `wizard_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add index for notification lookups by template
CREATE INDEX `idx_template` ON `wizard_notifications` (`template`);