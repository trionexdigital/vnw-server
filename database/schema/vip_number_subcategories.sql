-- Derived category/subcategory memberships. A subcategory ID can belong to multiple parents.
CREATE TABLE IF NOT EXISTS `vip_number_subcategories` (
  `number_id` int unsigned NOT NULL,
  `category_id` int unsigned NOT NULL,
  `subcategory_id` int unsigned NOT NULL,
  `classifier_version` smallint unsigned NOT NULL,
  `matched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`number_id`, `category_id`, `subcategory_id`),
  KEY `subcategory_lookup` (`category_id`, `subcategory_id`, `number_id`),
  KEY `classifier_version` (`classifier_version`),
  CONSTRAINT `fk_vip_number_subcategories_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
