-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `prebook_refund_requests` (
  `refund_request_id` int unsigned NOT NULL AUTO_INCREMENT,
  `prebook_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `reason_type` enum('CUSTOMER_CANCELLATION','DELIVERY_ISSUE','UPC_ISSUE','ACTIVATION_ISSUE','NUMBER_UNAVAILABLE') NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','PROCESSING','PROCESSED','FAILED') NOT NULL DEFAULT 'PENDING',
  `status_before_request` enum('BOOKED','READY') NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `customer_note` varchar(1000) DEFAULT NULL,
  `admin_note` varchar(1000) DEFAULT NULL,
  `reviewed_by` int unsigned DEFAULT NULL,
  `razorpay_refund_id` varchar(64) DEFAULT NULL,
  `gateway_status` varchar(32) DEFAULT NULL,
  `gateway_payload` longtext,
  `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` datetime DEFAULT NULL,
  `processed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`refund_request_id`), KEY `prebook_refund_history` (`prebook_id`,
  `status`),
  UNIQUE KEY `razorpay_refund_unique` (`razorpay_refund_id`), KEY `refund_queue` (`status`,
  `requested_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
