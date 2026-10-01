-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `payments` (
  `payment_id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned DEFAULT NULL,
  `payment_provider` varchar(16) DEFAULT NULL,
  `gateway_environment` varchar(16) DEFAULT NULL,
  `gateway_order_id` varchar(64) DEFAULT NULL,
  `gateway_payment_id` varchar(64) DEFAULT NULL,
  `amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `currency` varchar(8) NOT NULL DEFAULT 'INR',
  `status` varchar(32) DEFAULT NULL,
  `method` varchar(32) DEFAULT NULL,
  `raw_payload` longtext,
  `payment_time` datetime DEFAULT NULL,
  `payment_completion_time` datetime DEFAULT NULL,
  `bank_reference` varchar(128) DEFAULT NULL,
  `payment_message` varchar(512) DEFAULT NULL,
  `payment_details` longtext,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`), KEY `order_id` (`order_id`), UNIQUE KEY `cashfree_payment_unique` (`payment_provider`,`gateway_environment`,`gateway_payment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
