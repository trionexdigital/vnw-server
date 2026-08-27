-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `dealer_payouts` (
  `payout_id` int unsigned NOT NULL AUTO_INCREMENT,
  `dealer_id` int unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `status` enum('PENDING','APPROVED','PAID','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reference` varchar(128) DEFAULT NULL,
  `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`payout_id`), KEY `dealer_id` (`dealer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
