-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `wishlist` (
  `wishlist_id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `private_link_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`wishlist_id`), UNIQUE KEY `user_number` (`user_id`,
  `number_id`),
  KEY `number_id` (`number_id`), KEY `private_link_id` (`private_link_id`),
  CONSTRAINT `fk_wishlist_private_link` FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
