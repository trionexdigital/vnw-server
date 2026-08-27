-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `wallet_transactions` (
  `txn_id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `direction` enum('CREDIT','DEBIT') NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `balance_after` decimal(18,2) NOT NULL DEFAULT '0.00',
  `source` enum('SALE','SELL_PAYOUT','WITHDRAWAL','WITHDRAWAL_REVERSAL','REFERRAL','ADJUSTMENT') NOT NULL DEFAULT 'ADJUSTMENT',
  `reference_type` varchar(32) DEFAULT NULL,
  `reference_id` int unsigned DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`txn_id`), KEY `user_id` (`user_id`),
  UNIQUE KEY `uniq_source_ref` (`source`,
  `reference_type`,
  `reference_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
