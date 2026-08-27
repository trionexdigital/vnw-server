-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `referral_earnings` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `source_user_id` int unsigned NOT NULL,
  `type` enum('SIGNUP','PURCHASE') NOT NULL DEFAULT 'SIGNUP',
  `amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `order_id` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
