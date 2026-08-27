-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `corporate_packs` (
  `pack_id` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(96) NOT NULL,
  `pack_type` enum('SERIES','MIXED','SIMILAR_START','SIMILAR_END','SIMILAR_BOTH') NOT NULL,
  `description` varchar(320) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pack_id`), KEY `pack_published_order` (`is_active`,
  `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
