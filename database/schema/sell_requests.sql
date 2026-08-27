-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `sell_requests` (
  `request_id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `number_value` varchar(20) NOT NULL,
  `display_number` varchar(30) NOT NULL,
  `operator` varchar(32) DEFAULT NULL,
  `category_id` int unsigned DEFAULT NULL,
  `asking_price` decimal(18,2) NOT NULL DEFAULT '0.00',
  `description` text,
  `contact_phone` varchar(20) DEFAULT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `admin_id` int unsigned DEFAULT NULL,
  `admin_note` varchar(512) DEFAULT NULL,
  `offer_price` decimal(18,2) DEFAULT NULL,
  `number_id` int unsigned DEFAULT NULL,
  `buy_price` decimal(18,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`request_id`), KEY `user_id` (`user_id`), KEY `status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
