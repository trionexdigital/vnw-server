-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `wishlist` (
  `wishlist_id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`wishlist_id`), UNIQUE KEY `user_number` (`user_id`,
  `number_id`),
  KEY `number_id` (`number_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
