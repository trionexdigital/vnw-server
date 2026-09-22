-- Schema only. A private number may be shared by more than one named collection.
CREATE TABLE IF NOT EXISTS `number_private_link_items` (
  `private_link_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`private_link_id`,`number_id`),
  KEY `number_id` (`number_id`),
  CONSTRAINT `fk_private_link_items_link` FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_private_link_items_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
