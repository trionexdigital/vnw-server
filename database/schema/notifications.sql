-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `notifications` (
  `notification_id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `sender_id` int unsigned NOT NULL DEFAULT '0',
  `type` varchar(32) NOT NULL DEFAULT 'info',
  `title` varchar(160) NOT NULL,
  `message` varchar(1024) NOT NULL,
  `is_read` varchar(8) NOT NULL DEFAULT 'false',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`), KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
