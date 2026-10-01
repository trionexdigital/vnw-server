-- COMPLETE checkout repair and payment history upgrade. Run this ENTIRE file manually in SQLyog.
-- Pause the API, back up vipnumberworld, run all statements, then restart the API.
-- Re-runnable. Preserves order totals and references; does not invent missing historical tax breakdowns.
-- VIP Number World: Cashfree sandbox integration (2026-10-01).
-- Includes the Cashfree upgrade; no separate gateway migration is needed.
-- Stop the API during migration and back up the database. No source financial rows are deleted.
-- Historical gateway references are preserved under generic names and marked LEGACY.
USE `vipnumberworld`;
SET NAMES utf8mb4;

-- Create financial tables if absent. Existing tables and rows remain intact.
-- The existing storefront base tables (auth_user, vip_numbers, number_private_links) are prerequisites.
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
  `refund_attempt` int unsigned NOT NULL DEFAULT '0',
  `gateway_refund_id` varchar(64) DEFAULT NULL,
  `gateway_status` varchar(32) DEFAULT NULL,
  `gateway_payload` longtext,
  `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` datetime DEFAULT NULL,
  `processed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`refund_request_id`), KEY `prebook_refund_history` (`prebook_id`,
  `status`),
  UNIQUE KEY `gateway_refund_unique` (`gateway_refund_id`), KEY `refund_queue` (`status`,
  `requested_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `orders` (
  `order_id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_no` varchar(32) NOT NULL,
  `user_id` int unsigned NOT NULL,
  `subtotal` decimal(18,2) NOT NULL DEFAULT '0.00',
  `discount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `total` decimal(18,2) NOT NULL DEFAULT '0.00',
  `mrp_total` decimal(18,2) NOT NULL DEFAULT '0.00',
  `offer_savings` decimal(18,2) NOT NULL DEFAULT '0.00',
  `taxable_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `gst_percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `gst_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `status` enum('PENDING','PAID','PROCESSING','COMPLETED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'PENDING',
  `payment_status` enum('UNPAID','PAID','FAILED','REFUNDED') NOT NULL DEFAULT 'UNPAID',
  `order_type` enum('PURCHASE','PREBOOK') NOT NULL DEFAULT 'PURCHASE',
  `payment_expires_at` datetime DEFAULT NULL,
  `coupon_code` varchar(32) DEFAULT NULL,
  `payment_provider` varchar(16) DEFAULT NULL,
  `gateway_environment` varchar(16) DEFAULT NULL,
  `gateway_order_id` varchar(64) DEFAULT NULL,
  `gateway_payment_id` varchar(64) DEFAULT NULL,
  `gateway_session_id` text,
  `legacy_signature` varchar(256) DEFAULT NULL,
  `customer_name` varchar(96) DEFAULT NULL,
  `customer_email` varchar(128) DEFAULT NULL,
  `customer_phone` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`order_id`), UNIQUE KEY `order_no` (`order_no`),
  KEY `user_id` (`user_id`), UNIQUE KEY `cashfree_order_unique` (`payment_provider`,`gateway_environment`,`gateway_order_id`),
  KEY `ix_vnw_coupon_checkout` (`coupon_code`,`payment_status`,`status`,`payment_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `order_items` (
  `order_item_id` int unsigned NOT NULL AUTO_INCREMENT,
  `order_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `private_link_id` int unsigned DEFAULT NULL,
  `seller_id` int unsigned NOT NULL,
  `display_number` varchar(30) DEFAULT NULL,
  `price` decimal(18,2) NOT NULL DEFAULT '0.00',
  `commission_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
  `item_status` enum('PENDING','PAID','TRANSFERRED','CANCELLED') NOT NULL DEFAULT 'PENDING',
  PRIMARY KEY (`order_item_id`), KEY `order_id` (`order_id`),
  KEY `number_id` (`number_id`), KEY `private_link_id` (`private_link_id`), KEY `seller_id` (`seller_id`),
  CONSTRAINT `fk_order_item_private_link` FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @cf_sql = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='razorpay_order_id') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gateway_order_id'), 'ALTER TABLE `orders` CHANGE COLUMN `razorpay_order_id` `gateway_order_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gateway_order_id'), 'ALTER TABLE `orders` ADD COLUMN `gateway_order_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='razorpay_payment_id') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gateway_payment_id'), 'ALTER TABLE `orders` CHANGE COLUMN `razorpay_payment_id` `gateway_payment_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gateway_payment_id'), 'ALTER TABLE `orders` ADD COLUMN `gateway_payment_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='razorpay_signature') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='legacy_signature'), 'ALTER TABLE `orders` CHANGE COLUMN `razorpay_signature` `legacy_signature` varchar(256) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='legacy_signature'), 'ALTER TABLE `orders` ADD COLUMN `legacy_signature` varchar(256) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='razorpay_order_id') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='gateway_order_id'), 'ALTER TABLE `payments` CHANGE COLUMN `razorpay_order_id` `gateway_order_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='gateway_order_id'), 'ALTER TABLE `payments` ADD COLUMN `gateway_order_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='razorpay_payment_id') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='gateway_payment_id'), 'ALTER TABLE `payments` CHANGE COLUMN `razorpay_payment_id` `gateway_payment_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='gateway_payment_id'), 'ALTER TABLE `payments` ADD COLUMN `gateway_payment_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='prebook_refund_requests' AND COLUMN_NAME='razorpay_refund_id') AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='prebook_refund_requests' AND COLUMN_NAME='gateway_refund_id'), 'ALTER TABLE `prebook_refund_requests` CHANGE COLUMN `razorpay_refund_id` `gateway_refund_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='prebook_refund_requests' AND COLUMN_NAME='gateway_refund_id'), 'ALTER TABLE `prebook_refund_requests` ADD COLUMN `gateway_refund_id` varchar(64) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='payment_provider'), 'ALTER TABLE `orders` ADD COLUMN `payment_provider` varchar(16) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gateway_environment'), 'ALTER TABLE `orders` ADD COLUMN `gateway_environment` varchar(16) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

UPDATE `orders` SET payment_provider='LEGACY' WHERE (gateway_order_id IS NOT NULL OR gateway_payment_id IS NOT NULL) AND (payment_provider IS NULL OR payment_provider='');

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='payment_provider'), 'ALTER TABLE `payments` ADD COLUMN `payment_provider` varchar(16) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='gateway_environment'), 'ALTER TABLE `payments` ADD COLUMN `gateway_environment` varchar(16) DEFAULT NULL', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

UPDATE `payments` SET payment_provider='LEGACY' WHERE (gateway_order_id IS NOT NULL OR gateway_payment_id IS NOT NULL) AND (payment_provider IS NULL OR payment_provider='');

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gateway_session_id'), 'ALTER TABLE `orders` ADD COLUMN `gateway_session_id` text', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='prebook_refund_requests' AND COLUMN_NAME='refund_attempt'), 'ALTER TABLE `prebook_refund_requests` ADD COLUMN `refund_attempt` int unsigned NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND INDEX_NAME='razorpay_order_id'), 'ALTER TABLE `orders` DROP INDEX `razorpay_order_id`', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='prebook_refund_requests' AND INDEX_NAME='razorpay_refund_unique'), 'ALTER TABLE `prebook_refund_requests` DROP INDEX `razorpay_refund_unique`', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND INDEX_NAME='cashfree_order_unique'), 'ALTER TABLE `orders` ADD UNIQUE KEY `cashfree_order_unique` (payment_provider,gateway_environment,gateway_order_id)', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND INDEX_NAME='cashfree_payment_unique'), 'ALTER TABLE `payments` ADD UNIQUE KEY `cashfree_payment_unique` (payment_provider,gateway_environment,gateway_payment_id)', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

SET @cf_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='prebook_refund_requests' AND INDEX_NAME='gateway_refund_unique'), 'ALTER TABLE `prebook_refund_requests` ADD UNIQUE KEY `gateway_refund_unique` (gateway_refund_id)', 'SELECT 1');
PREPARE cf_stmt FROM @cf_sql; EXECUTE cf_stmt; DEALLOCATE PREPARE cf_stmt;

-- Migration complete. Restart the updated API after configuring its server-only .env.


SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='mrp_total'), 'ALTER TABLE orders ADD COLUMN mrp_total decimal(18,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='offer_savings'), 'ALTER TABLE orders ADD COLUMN offer_savings decimal(18,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='taxable_amount'), 'ALTER TABLE orders ADD COLUMN taxable_amount decimal(18,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gst_percent'), 'ALTER TABLE orders ADD COLUMN gst_percent decimal(5,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gst_amount'), 'ALTER TABLE orders ADD COLUMN gst_amount decimal(18,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='coupon_code'), 'ALTER TABLE orders ADD COLUMN coupon_code varchar(32) DEFAULT NULL', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='customer_name'), 'ALTER TABLE orders ADD COLUMN customer_name varchar(96) DEFAULT NULL', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='customer_email'), 'ALTER TABLE orders ADD COLUMN customer_email varchar(128) DEFAULT NULL', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='customer_phone'), 'ALTER TABLE orders ADD COLUMN customer_phone varchar(20) DEFAULT NULL', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='payment_time'), 'ALTER TABLE payments ADD COLUMN payment_time datetime DEFAULT NULL', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='payment_completion_time'), 'ALTER TABLE payments ADD COLUMN payment_completion_time datetime DEFAULT NULL', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='bank_reference'), 'ALTER TABLE payments ADD COLUMN bank_reference varchar(128) DEFAULT NULL', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='payment_message'), 'ALTER TABLE payments ADD COLUMN payment_message varchar(512) DEFAULT NULL', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='payment_details'), 'ALTER TABLE payments ADD COLUMN payment_details longtext', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND COLUMN_NAME='updated_at'), 'ALTER TABLE payments ADD COLUMN updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

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

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND INDEX_NAME='payment_analysis_date'), 'ALTER TABLE orders ADD KEY payment_analysis_date (gateway_environment,created_at,order_id)', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

SET @ph_sql = IF(NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments' AND INDEX_NAME='payment_analysis_date'), 'ALTER TABLE payments ADD KEY payment_analysis_date (gateway_environment,payment_time,payment_id)', 'SELECT 1');
PREPARE ph_stmt FROM @ph_sql; EXECUTE ph_stmt; DEALLOCATE PREPARE ph_stmt;

-- Label historical snapshots without fabricating earlier events or tax breakdowns.
INSERT INTO payment_events (order_id,payment_provider,gateway_environment,gateway_order_id,gateway_payment_id,event_type,status,source,correlation_id,dedupe_key,details,created_at)
SELECT order_id,COALESCE(payment_provider,'LEGACY'),COALESCE(gateway_environment,'legacy'),gateway_order_id,gateway_payment_id,'HISTORICAL_SNAPSHOT',payment_status,'MIGRATION',UUID(),SHA2(CONCAT('historical:',order_id),256),JSON_OBJECT('order_no',order_no,'total',total,'note','Snapshot at migration. Earlier event history and missing billing breakdowns cannot be reconstructed.'),UTC_TIMESTAMP(3) FROM orders
ON DUPLICATE KEY UPDATE event_id=event_id;

-- Verify before restarting the API.
SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='orders' AND COLUMN_NAME IN ('mrp_total','offer_savings','taxable_amount','gst_percent','gst_amount')) OR TABLE_NAME='payment_events') ORDER BY TABLE_NAME,ORDINAL_POSITION;
