-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `payments` (
  `payment_id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned DEFAULT NULL,
  `razorpay_order_id` varchar(64) DEFAULT NULL,
  `razorpay_payment_id` varchar(64) DEFAULT NULL,
  `amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `currency` varchar(8) NOT NULL DEFAULT 'INR',
  `status` varchar(32) DEFAULT NULL,
  `method` varchar(32) DEFAULT NULL,
  `raw_payload` longtext,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`payment_id`), KEY `order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
