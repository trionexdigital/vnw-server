-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `cart_items` (
  `cart_item_id` int unsigned NOT NULL AUTO_INCREMENT,
  `cart_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `added_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`cart_item_id`), UNIQUE KEY `cart_number` (`cart_id`,
  `number_id`),
  KEY `number_id` (`number_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
