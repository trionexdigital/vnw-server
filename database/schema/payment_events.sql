-- Append-only transaction history. No secrets, full card numbers or session tokens.
CREATE TABLE IF NOT EXISTS `payment_events` (
  `event_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned DEFAULT NULL,
  `actor_user_id` int unsigned DEFAULT NULL,
  `payment_provider` varchar(16) NOT NULL,
  `gateway_environment` varchar(16) NOT NULL,
  `gateway_order_id` varchar(64) DEFAULT NULL,
  `gateway_payment_id` varchar(64) DEFAULT NULL,
  `gateway_refund_id` varchar(64) DEFAULT NULL,
  `event_type` varchar(48) NOT NULL,
  `status` varchar(32) NOT NULL,
  `source` varchar(24) NOT NULL,
  `correlation_id` varchar(36) NOT NULL,
  `dedupe_key` char(64) DEFAULT NULL,
  `details` longtext,
  `created_at` datetime(3) NOT NULL,
  PRIMARY KEY (`event_id`),
  UNIQUE KEY `payment_event_dedupe` (`dedupe_key`),
  KEY `payment_event_order` (`order_id`,`event_id`),
  KEY `payment_event_gateway` (`gateway_environment`,`gateway_order_id`,`event_id`),
  KEY `payment_event_date` (`gateway_environment`,`created_at`),
  KEY `payment_event_correlation` (`correlation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
