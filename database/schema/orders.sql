-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `orders` (
  `order_id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_no` varchar(32) NOT NULL,
  `user_id` int unsigned NOT NULL,
  `subtotal` decimal(18,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `total` decimal(18,2) NOT NULL DEFAULT '0.00',
  `status` enum('PENDING','PAID','PROCESSING','COMPLETED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `payment_status` enum('UNPAID','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'UNPAID',
  `order_type` enum('PURCHASE','PREBOOK') NOT NULL DEFAULT 'PURCHASE',
  `payment_expires_at` datetime DEFAULT NULL,
  `coupon_code` varchar(32) DEFAULT NULL,
  `razorpay_order_id` varchar(64) DEFAULT NULL,
  `razorpay_payment_id` varchar(64) DEFAULT NULL,
  `razorpay_signature` varchar(256) DEFAULT NULL,
  `customer_name` varchar(96) DEFAULT NULL,
  `customer_email` varchar(128) DEFAULT NULL,
  `customer_phone` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`), UNIQUE KEY `order_no` (`order_no`),
  KEY `user_id` (`user_id`), KEY `razorpay_order_id` (`razorpay_order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
