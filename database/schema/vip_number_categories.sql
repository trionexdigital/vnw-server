-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `vip_number_categories` (
  `number_id` int unsigned NOT NULL,
  `category_slug` varchar(64) NOT NULL,
  `classifier_version` smallint unsigned NOT NULL,
  `matched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`number_id`,
  `category_slug`),
  UNIQUE KEY `number_category_exclusive` (`number_id`),
  KEY `category_lookup` (`category_slug`,
  `number_id`),
  KEY `classifier_version` (`classifier_version`),
  CONSTRAINT `fk_vip_number_categories_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
