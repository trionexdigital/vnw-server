-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `reviews` (
  `review_id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `rating` tinyint NOT NULL DEFAULT '5',
  `comment` varchar(1024) DEFAULT NULL,
  `status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'APPROVED',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`review_id`), KEY `number_id` (`number_id`), KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
