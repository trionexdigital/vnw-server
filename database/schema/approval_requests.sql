-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `approval_requests` (
  `approval_id` int unsigned NOT NULL AUTO_INCREMENT,
  `requested_by` int unsigned NOT NULL,
  `action_key` varchar(64) NOT NULL,
  `summary` varchar(255) NOT NULL,
  `payload` longtext,
  `status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` int unsigned DEFAULT NULL,
  `review_note` varchar(512) DEFAULT NULL,
  `result` longtext,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`approval_id`), KEY `requested_by` (`requested_by`), KEY `status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
