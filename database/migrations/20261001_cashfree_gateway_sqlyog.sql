-- VIP Number World: Cashfree sandbox integration (2026-10-01).
-- Run manually in SQLyog AFTER the consolidated 20260930 migration.
-- Stop the API during migration and back up the database. No source financial rows are deleted.
-- Historical gateway references are preserved under generic names and marked LEGACY.
USE `vipnumberworld`;
SET NAMES utf8mb4;

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

