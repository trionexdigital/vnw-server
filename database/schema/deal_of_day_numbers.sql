-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `deal_of_day_numbers` (
  `deal_id` int unsigned NOT NULL AUTO_INCREMENT,
  `number_id` int unsigned NOT NULL,
  `hero_label` varchar(64) DEFAULT NULL,
  `hero_description` varchar(160) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`deal_id`),
  UNIQUE KEY `deal_number_unique` (`number_id`),
  KEY `deal_published_order` (`is_active`,
  `sort_order`),
  CONSTRAINT `fk_deal_of_day_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
