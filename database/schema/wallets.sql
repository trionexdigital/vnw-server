-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `wallets` (
  `user_id` int unsigned NOT NULL,
  `balance` decimal(18,2) NOT NULL DEFAULT '0.00',
  `total_credited` decimal(18,2) NOT NULL DEFAULT '0.00',
  `total_debited` decimal(18,2) NOT NULL DEFAULT '0.00',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
