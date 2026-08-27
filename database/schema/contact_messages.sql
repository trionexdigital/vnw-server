-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `contact_messages` (
  `message_id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(96) NOT NULL,
  `email` varchar(128) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `subject` varchar(160) DEFAULT NULL,
  `message` varchar(2048) NOT NULL,
  `number_id` int unsigned DEFAULT NULL,
  `type` varchar(24) NOT NULL DEFAULT 'CONTACT',
  `status` enum('NEW','READ','CLOSED') NOT NULL DEFAULT 'NEW',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
