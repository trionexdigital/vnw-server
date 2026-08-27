-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `prebookings` (
  `prebook_id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `status` enum('PENDING_PAYMENT','BOOKED','READY','CANCEL_REQUESTED','REFUND_PENDING','REFUNDED','FULFILLED','FAILED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  `rtp_available_at_snapshot` datetime NOT NULL,
  `hold_expires_at` datetime NOT NULL,
  `paid_at` datetime DEFAULT NULL,
  `cancellation_deadline` datetime DEFAULT NULL,
  `fulfilled_at` datetime DEFAULT NULL,
  `refunded_at` datetime DEFAULT NULL,
  `issue_note` varchar(1000) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`prebook_id`), UNIQUE KEY `prebook_order_unique` (`order_id`),
  KEY `prebook_user` (`user_id`,
  `created_at`), KEY `prebook_number_state` (`number_id`,
  `status`),
  KEY `prebook_due` (`status`,
  `rtp_available_at_snapshot`), KEY `prebook_hold` (`status`,
  `hold_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
