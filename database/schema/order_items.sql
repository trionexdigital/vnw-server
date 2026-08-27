-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `order_items` (
  `order_item_id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `seller_id` int unsigned NOT NULL,
  `display_number` varchar(30) DEFAULT NULL,
  `price` decimal(18,2) NOT NULL DEFAULT '0.00',
  `commission_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `item_status` enum('PENDING','PAID','TRANSFERRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  PRIMARY KEY (`order_item_id`), KEY `order_id` (`order_id`),
  KEY `number_id` (`number_id`), KEY `seller_id` (`seller_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
