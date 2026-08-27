-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `corporate_pack_items` (
  `pack_item_id` int unsigned NOT NULL AUTO_INCREMENT,
  `pack_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`pack_item_id`),
  UNIQUE KEY `pack_number_unique` (`pack_id`,
  `number_id`),
  KEY `corporate_pack_item_number` (`number_id`),
  CONSTRAINT `fk_corporate_pack_item_pack` FOREIGN KEY (`pack_id`) REFERENCES `corporate_packs` (`pack_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_corporate_pack_item_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
