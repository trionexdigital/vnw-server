-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `homepage_premium_numbers` (
  `homepage_premium_id` int unsigned NOT NULL AUTO_INCREMENT,
  `number_id` int unsigned NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`homepage_premium_id`), UNIQUE KEY `homepage_premium_number` (`number_id`),
  KEY `homepage_premium_order` (`is_active`,
  `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
