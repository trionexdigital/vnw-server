-- VIP Number World: consolidated SQLyog migration through 2026-09-30.
-- Execute this single file in SQLyog against vipnumberworld, during a maintenance window.
-- Take a verified database backup first. This script does not delete source inventory,
-- orders, users, or payments. It does not insert demo numbers.
-- Safe to rerun: existing tables/columns/indexes are guarded. Do not run the older API
-- against these category tables during the classifier v4 backfill.
-- Pagination itself is implemented by parameterized COUNT/LIMIT/OFFSET queries in the API;
-- this migration supplies the matching schema and lookup/sort indexes.

-- Prior SQLyog visibility, private-link, supplier-ledger, RTP/RTA and discount migration.
-- VIP Number World: visibility, private links, and dealer purchase management
-- SQLyog Community compatible standalone migration (no SOURCE commands).
-- Target database: vipnumberworld
--
-- This migration preserves existing rows and backfills existing inventory to ONLINE.
-- It may be rerun after an interrupted attempt: columns, indexes, and foreign keys
-- added to existing tables are guarded through information_schema checks.

USE `vipnumberworld`;
SET NAMES utf8mb4;
-- Supporting content and upload schemas, included here for older installations.
-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `trusted_clients` (
  `client_id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(96) NOT NULL,
  `website_url` varchar(512) DEFAULT NULL,
  `alt_text` varchar(160) DEFAULT NULL,
  `logo_mime` varchar(32) DEFAULT NULL,
  `logo_data` longblob,
  `logo_sha256` char(64) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_id`), KEY `trusted_client_published_order` (`is_active`,
  `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `notifications` (
  `notification_id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `sender_id` int unsigned NOT NULL DEFAULT '0',
  `type` varchar(32) NOT NULL DEFAULT 'info',
  `title` varchar(160) NOT NULL,
  `message` varchar(1024) NOT NULL,
  `is_read` varchar(8) NOT NULL DEFAULT 'false',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`notification_id`), KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `carousel_projects` (
  `carousel_id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL DEFAULT 'Untitled carousel',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_published` tinyint(1) NOT NULL DEFAULT '0',
  `draft_revision` int unsigned NOT NULL DEFAULT '1',
  `draft_desktop` longtext,
  `draft_mobile` longtext,
  `draft_desktop_preview_id` int unsigned DEFAULT NULL,
  `draft_mobile_preview_id` int unsigned DEFAULT NULL,
  `published_revision` int unsigned DEFAULT NULL,
  `published_desktop` longtext,
  `published_mobile` longtext,
  `published_desktop_preview_id` int unsigned DEFAULT NULL,
  `published_mobile_preview_id` int unsigned DEFAULT NULL,
  `transition_style` varchar(24) NOT NULL DEFAULT 'fade',
  `autoplay_seconds` tinyint unsigned NOT NULL DEFAULT '6',
  `created_by` int unsigned NOT NULL,
  `updated_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `published_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`carousel_id`), KEY `published_order` (`is_published`,
  `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `carousel_assets` (
  `asset_id` int unsigned NOT NULL AUTO_INCREMENT,
  `carousel_id` int unsigned NOT NULL,
  `purpose` enum('source','sticker','preview-desktop','preview-mobile') NOT NULL DEFAULT 'source',
  `original_name` varchar(180) NOT NULL,
  `mime_type` varchar(64) NOT NULL,
  `byte_size` int unsigned NOT NULL,
  `width` int unsigned NOT NULL,
  `height` int unsigned NOT NULL,
  `content_sha256` char(64) NOT NULL,
  `content` longblob NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`asset_id`), KEY `project_assets` (`carousel_id`,
  `purpose`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `homepage_premium_numbers` (
  `homepage_premium_id` int unsigned NOT NULL AUTO_INCREMENT,
  `number_id` int unsigned NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`homepage_premium_id`), UNIQUE KEY `homepage_premium_number` (`number_id`),
  KEY `homepage_premium_order` (`is_active`,
  `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `deal_of_day_numbers` (
  `deal_id` int unsigned NOT NULL AUTO_INCREMENT,
  `number_id` int unsigned NOT NULL,
  `hero_label` varchar(64) DEFAULT NULL,
  `hero_description` varchar(160) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`deal_id`),
  UNIQUE KEY `deal_number_unique` (`number_id`),
  KEY `deal_published_order` (`is_active`,
  `sort_order`),
  CONSTRAINT `fk_deal_of_day_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `faqs` (
  `faq_id` int unsigned NOT NULL AUTO_INCREMENT,
  `category` varchar(64) NOT NULL,
  `question` varchar(255) NOT NULL,
  `answer` text NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`faq_id`), KEY `faq_published_order` (`is_active`,
  `sort_order`)
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


-- Profile images must be persisted without truncation. No stored image is removed.
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auth_user' AND COLUMN_NAME='logo')=0,
  'ALTER TABLE auth_user ADD COLUMN logo LONGTEXT',
  IF((SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='auth_user' AND COLUMN_NAME='logo')<>'longtext',
     'ALTER TABLE auth_user MODIFY COLUMN logo LONGTEXT',
     'SELECT ''auth_user.logo already supports uploaded images'' AS migration_note')
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- Duplicate protection is also enforced at write time, including concurrent imports.
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='number_value' AND NON_UNIQUE=0)=0,
  'ALTER TABLE vip_numbers ADD UNIQUE KEY uq_vnw_number_value (number_value)',
  'SELECT ''Unique mobile-number constraint already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='rtp_status')=0,
  'ALTER TABLE vip_numbers ADD COLUMN rtp_status ENUM(''RTP'',''NON_RTP'',''RTA'') NOT NULL DEFAULT ''RTA''',
  'SELECT ''vip_numbers.rtp_status exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='rtp_available_at')=0,
  'ALTER TABLE vip_numbers ADD COLUMN rtp_available_at DATETIME DEFAULT NULL',
  'SELECT ''vip_numbers.rtp_available_at exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='notifications' AND INDEX_NAME='ix_vnw_notifications_recent')=0,
  'ALTER TABLE notifications ADD INDEX ix_vnw_notifications_recent (user_id,created_at,notification_id)',
  'SELECT ''Recent-notification index exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- Imports use signed, short-lived API analysis tickets; no import staging table is required.
-- Carousel image files stay intact. Upload a new portrait mobile image in the editor
-- to replace a previous landscape mobile image; SQL never crops or rewrites image blobs.


-- ---------------------------------------------------------------------------
-- 1. Add Online/Offline visibility to the existing catalog.
-- ---------------------------------------------------------------------------

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_numbers'
     AND COLUMN_NAME = 'visibility_type') = 0,
  'ALTER TABLE `vip_numbers` ADD COLUMN `visibility_type` enum(''ONLINE'',''OFFLINE'') NOT NULL DEFAULT ''ONLINE'' AFTER `status`',
  'SELECT ''vip_numbers.visibility_type already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_numbers'
     AND INDEX_NAME = 'visibility_type') = 0,
  'ALTER TABLE `vip_numbers` ADD KEY `visibility_type` (`visibility_type`)',
  'SELECT ''vip_numbers.visibility_type index already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- ---------------------------------------------------------------------------
-- 2. Private number collections.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `number_private_links` (
  `private_link_id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`private_link_id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `private_link_status` (`revoked_at`,`expires_at`),
  KEY `created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `number_private_link_items` (
  `private_link_id` int unsigned NOT NULL,
  `number_id` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`private_link_id`,`number_id`),
  KEY `number_id` (`number_id`),
  CONSTRAINT `fk_private_link_items_link`
    FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_private_link_items_number`
    FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 3. External supplier and dealer-purchase ledger tables.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `external_dealers` (
  `external_dealer_id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(128) DEFAULT NULL,
  `notes` text,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`external_dealer_id`),
  UNIQUE KEY `external_dealer_name` (`name`),
  KEY `external_dealer_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dealer_purchase_numbers` (
  `dealer_purchase_id` int unsigned NOT NULL AUTO_INCREMENT,
  `number_id` int unsigned NOT NULL,
  `external_dealer_id` int unsigned NOT NULL,
  `purchase_price` decimal(18,2) NOT NULL,
  `intended_sale_price` decimal(18,2) NOT NULL,
  `state` enum('INVENTORY','SOLD','DELETED') NOT NULL DEFAULT 'INVENTORY',
  `actual_sale_price` decimal(18,2) DEFAULT NULL,
  `sold_at` datetime DEFAULT NULL,
  `sold_order_item_id` int unsigned DEFAULT NULL,
  `deleted_reason` varchar(500) DEFAULT NULL,
  `deleted_at` datetime DEFAULT NULL,
  `deleted_by` int unsigned DEFAULT NULL,
  `state_before_delete` enum('INVENTORY','SOLD') DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dealer_purchase_id`),
  UNIQUE KEY `dealer_purchase_number` (`number_id`),
  KEY `dealer_purchase_supplier_state` (`external_dealer_id`,`state`),
  KEY `sold_order_item_id` (`sold_order_item_id`),
  CONSTRAINT `fk_dealer_purchase_number`
    FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`),
  CONSTRAINT `fk_dealer_purchase_supplier`
    FOREIGN KEY (`external_dealer_id`) REFERENCES `external_dealers` (`external_dealer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dealer_purchase_payments` (
  `dealer_payment_id` int unsigned NOT NULL AUTO_INCREMENT,
  `external_dealer_id` int unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_method` varchar(40) DEFAULT NULL,
  `reference_no` varchar(100) DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `paid_at` datetime NOT NULL,
  `status` enum('POSTED','VOIDED') NOT NULL DEFAULT 'POSTED',
  `void_reason` varchar(500) DEFAULT NULL,
  `voided_at` datetime DEFAULT NULL,
  `voided_by` int unsigned DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`dealer_payment_id`),
  KEY `dealer_payment_supplier_status` (`external_dealer_id`,`status`),
  CONSTRAINT `fk_dealer_payment_supplier`
    FOREIGN KEY (`external_dealer_id`) REFERENCES `external_dealers` (`external_dealer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dealer_purchase_events` (
  `dealer_event_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dealer_purchase_id` int unsigned DEFAULT NULL,
  `dealer_payment_id` int unsigned DEFAULT NULL,
  `external_dealer_id` int unsigned NOT NULL,
  `event_type` enum('CREATED','SOLD','SALE_REVERSED','DELETED','RESTORED','PAYMENT_POSTED','PAYMENT_VOIDED') NOT NULL,
  `details` json DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`dealer_event_id`),
  KEY `dealer_event_purchase` (`dealer_purchase_id`,`created_at`),
  KEY `dealer_event_payment` (`dealer_payment_id`),
  KEY `dealer_event_supplier` (`external_dealer_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 4. Preserve validated private-link access through carts, wishlists and orders.
-- ---------------------------------------------------------------------------

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart_items'
     AND COLUMN_NAME = 'private_link_id') = 0,
  'ALTER TABLE `cart_items` ADD COLUMN `private_link_id` int unsigned DEFAULT NULL AFTER `number_id`',
  'SELECT ''cart_items.private_link_id already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cart_items'
     AND INDEX_NAME = 'private_link_id') = 0,
  'ALTER TABLE `cart_items` ADD KEY `private_link_id` (`private_link_id`)',
  'SELECT ''cart_items.private_link_id index already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'cart_items'
     AND CONSTRAINT_NAME = 'fk_cart_item_private_link') = 0,
  'ALTER TABLE `cart_items` ADD CONSTRAINT `fk_cart_item_private_link` FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`) ON DELETE SET NULL',
  'SELECT ''cart_items private-link foreign key already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wishlist'
     AND COLUMN_NAME = 'private_link_id') = 0,
  'ALTER TABLE `wishlist` ADD COLUMN `private_link_id` int unsigned DEFAULT NULL AFTER `number_id`',
  'SELECT ''wishlist.private_link_id already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wishlist'
     AND INDEX_NAME = 'private_link_id') = 0,
  'ALTER TABLE `wishlist` ADD KEY `private_link_id` (`private_link_id`)',
  'SELECT ''wishlist.private_link_id index already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'wishlist'
     AND CONSTRAINT_NAME = 'fk_wishlist_private_link') = 0,
  'ALTER TABLE `wishlist` ADD CONSTRAINT `fk_wishlist_private_link` FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`) ON DELETE SET NULL',
  'SELECT ''wishlist private-link foreign key already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items'
     AND COLUMN_NAME = 'private_link_id') = 0,
  'ALTER TABLE `order_items` ADD COLUMN `private_link_id` int unsigned DEFAULT NULL AFTER `number_id`',
  'SELECT ''order_items.private_link_id already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items'
     AND INDEX_NAME = 'private_link_id') = 0,
  'ALTER TABLE `order_items` ADD KEY `private_link_id` (`private_link_id`)',
  'SELECT ''order_items.private_link_id index already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items'
     AND CONSTRAINT_NAME = 'fk_order_item_private_link') = 0,
  'ALTER TABLE `order_items` ADD CONSTRAINT `fk_order_item_private_link` FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`) ON DELETE SET NULL',
  'SELECT ''order_items private-link foreign key already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- ---------------------------------------------------------------------------
-- 5. Backfill existing inventory and report the installed objects.
-- ---------------------------------------------------------------------------

UPDATE `vip_numbers`
SET `visibility_type` = 'ONLINE'
WHERE `visibility_type` IS NULL;

SELECT 'VIP Number World migration completed' AS migration_status;

SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'number_private_links',
    'number_private_link_items',
    'external_dealers',
    'dealer_purchase_numbers',
    'dealer_purchase_payments',
    'dealer_purchase_events'
  )
ORDER BY TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'vip_numbers' AND COLUMN_NAME = 'visibility_type')
    OR (TABLE_NAME IN ('cart_items','wishlist','order_items') AND COLUMN_NAME = 'private_link_id')
  )
ORDER BY TABLE_NAME, COLUMN_NAME;

-- Current readiness model: preserve RTP/NON-RTP and add distinct RTA.
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='rtp_status'
     AND COLUMN_TYPE='enum(''RTP'',''NON_RTP'',''RTA'')' AND COLUMN_DEFAULT='RTA') = 0,
  'ALTER TABLE `vip_numbers` MODIFY COLUMN `rtp_status` enum(''RTP'',''NON_RTP'',''RTA'') NOT NULL DEFAULT ''RTA''',
  'SELECT ''vip_numbers.rtp_status already supports RTP, NON-RTP and RTA'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

INSERT INTO `env` (`key_id`,`value`)
SELECT 'GLOBAL_NUMBER_DISCOUNT_PERCENT', CAST(COALESCE((
  SELECT ranked.discount_pct FROM (
    SELECT discount_pct, COUNT(*) AS usage_count FROM vip_numbers
    WHERE discount_pct BETWEEN 0 AND 99 GROUP BY discount_pct
    ORDER BY usage_count DESC, discount_pct DESC LIMIT 1
  ) ranked
), 0) AS CHAR)
ON DUPLICATE KEY UPDATE `key_id`=VALUES(`key_id`);


-- Category index table for installations that predate automatic categories.
-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `vip_number_categories` (
  `number_id` int unsigned NOT NULL,
  `category_slug` varchar(64) NOT NULL,
  `classifier_version` smallint unsigned NOT NULL,
  `matched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`number_id`,
  `category_slug`),
  KEY `category_lookup` (`category_slug`,
  `number_id`),
  KEY `classifier_version` (`classifier_version`),
  CONSTRAINT `fk_vip_number_categories_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Multi-category taxonomy migration.
-- Run in SQLyog against vipnumberworld before deploying classifier v4 if this schema change has not already been applied.
-- Take a database backup first. Stop older API writers while running the backfill.
-- Existing vip_numbers and their existing category rows are preserved until backfill.
SET @category_exclusive_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_number_categories'
    AND INDEX_NAME = 'number_category_exclusive'
);
SET @category_index_ddl := IF(
  @category_exclusive_exists > 0,
  'ALTER TABLE `vip_number_categories` DROP INDEX `number_category_exclusive`',
  'SELECT 1'
);
PREPARE category_index_statement FROM @category_index_ddl;
EXECUTE category_index_statement;
DEALLOCATE PREPARE category_index_statement;

CREATE TABLE IF NOT EXISTS `vip_number_subcategories` (
  `number_id` int unsigned NOT NULL,
  `category_id` int unsigned NOT NULL,
  `subcategory_id` int unsigned NOT NULL,
  `classifier_version` smallint unsigned NOT NULL,
  `matched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`number_id`, `category_id`, `subcategory_id`),
  KEY `subcategory_lookup` (`category_id`, `subcategory_id`, `number_id`),
  KEY `classifier_version` (`classifier_version`),
  CONSTRAINT `fk_vip_number_subcategories_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Then run: npm run build && node dist/scripts/backfillInternalCategories.js
-- Check the reported inventory count before starting the new API server.


-- Paged admin, dealer, employee and storefront list indexes.
-- Each ALTER runs only when its named index is absent. Existing rows are preserved.
-- vip_numbers: ix_vnw_stock_status_visibility_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_numbers' AND INDEX_NAME = 'ix_vnw_stock_status_visibility_newest') = 0,
  'ALTER TABLE `vip_numbers` ADD INDEX `ix_vnw_stock_status_visibility_newest` (`status`,`visibility_type`,`created_at`,`number_id`)',
  'SELECT ''ix_vnw_stock_status_visibility_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- vip_numbers: ix_vnw_stock_seller_status_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_numbers' AND INDEX_NAME = 'ix_vnw_stock_seller_status_newest') = 0,
  'ALTER TABLE `vip_numbers` ADD INDEX `ix_vnw_stock_seller_status_newest` (`seller_id`,`status`,`created_at`,`number_id`)',
  'SELECT ''ix_vnw_stock_seller_status_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- vip_numbers: ix_vnw_stock_rtp_due
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_numbers' AND INDEX_NAME = 'ix_vnw_stock_rtp_due') = 0,
  'ALTER TABLE `vip_numbers` ADD INDEX `ix_vnw_stock_rtp_due` (`rtp_status`,`rtp_available_at`)',
  'SELECT ''ix_vnw_stock_rtp_due already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- orders: ix_vnw_orders_status_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'ix_vnw_orders_status_newest') = 0,
  'ALTER TABLE `orders` ADD INDEX `ix_vnw_orders_status_newest` (`status`,`created_at`,`order_id`)',
  'SELECT ''ix_vnw_orders_status_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- orders: ix_vnw_orders_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND INDEX_NAME = 'ix_vnw_orders_newest') = 0,
  'ALTER TABLE `orders` ADD INDEX `ix_vnw_orders_newest` (`created_at`,`order_id`)',
  'SELECT ''ix_vnw_orders_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- auth_user: ix_vnw_users_role_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_user' AND INDEX_NAME = 'ix_vnw_users_role_newest') = 0,
  'ALTER TABLE `auth_user` ADD INDEX `ix_vnw_users_role_newest` (`role`,`created_at`,`user_id`)',
  'SELECT ''ix_vnw_users_role_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- auth_user: ix_vnw_users_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'auth_user' AND INDEX_NAME = 'ix_vnw_users_newest') = 0,
  'ALTER TABLE `auth_user` ADD INDEX `ix_vnw_users_newest` (`created_at`,`user_id`)',
  'SELECT ''ix_vnw_users_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- dealer_profiles: ix_vnw_dealers_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dealer_profiles' AND INDEX_NAME = 'ix_vnw_dealers_newest') = 0,
  'ALTER TABLE `dealer_profiles` ADD INDEX `ix_vnw_dealers_newest` (`created_at`,`dealer_id`)',
  'SELECT ''ix_vnw_dealers_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- dealer_payouts: ix_vnw_payouts_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dealer_payouts' AND INDEX_NAME = 'ix_vnw_payouts_newest') = 0,
  'ALTER TABLE `dealer_payouts` ADD INDEX `ix_vnw_payouts_newest` (`requested_at`,`payout_id`)',
  'SELECT ''ix_vnw_payouts_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- dealer_payouts: ix_vnw_payouts_dealer_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dealer_payouts' AND INDEX_NAME = 'ix_vnw_payouts_dealer_newest') = 0,
  'ALTER TABLE `dealer_payouts` ADD INDEX `ix_vnw_payouts_dealer_newest` (`dealer_id`,`requested_at`,`payout_id`)',
  'SELECT ''ix_vnw_payouts_dealer_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- reviews: ix_vnw_reviews_status_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'ix_vnw_reviews_status_newest') = 0,
  'ALTER TABLE `reviews` ADD INDEX `ix_vnw_reviews_status_newest` (`status`,`created_at`,`review_id`)',
  'SELECT ''ix_vnw_reviews_status_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- reviews: ix_vnw_reviews_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'reviews' AND INDEX_NAME = 'ix_vnw_reviews_newest') = 0,
  'ALTER TABLE `reviews` ADD INDEX `ix_vnw_reviews_newest` (`created_at`,`review_id`)',
  'SELECT ''ix_vnw_reviews_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- contact_messages: ix_vnw_messages_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contact_messages' AND INDEX_NAME = 'ix_vnw_messages_newest') = 0,
  'ALTER TABLE `contact_messages` ADD INDEX `ix_vnw_messages_newest` (`created_at`,`message_id`)',
  'SELECT ''ix_vnw_messages_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- newsletter_subscribers: ix_vnw_newsletter_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'newsletter_subscribers' AND INDEX_NAME = 'ix_vnw_newsletter_newest') = 0,
  'ALTER TABLE `newsletter_subscribers` ADD INDEX `ix_vnw_newsletter_newest` (`created_at`,`id`)',
  'SELECT ''ix_vnw_newsletter_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- approval_requests: ix_vnw_approvals_status_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'approval_requests' AND INDEX_NAME = 'ix_vnw_approvals_status_newest') = 0,
  'ALTER TABLE `approval_requests` ADD INDEX `ix_vnw_approvals_status_newest` (`status`,`created_at`,`approval_id`)',
  'SELECT ''ix_vnw_approvals_status_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- approval_requests: ix_vnw_approvals_requester_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'approval_requests' AND INDEX_NAME = 'ix_vnw_approvals_requester_newest') = 0,
  'ALTER TABLE `approval_requests` ADD INDEX `ix_vnw_approvals_requester_newest` (`requested_by`,`created_at`,`approval_id`)',
  'SELECT ''ix_vnw_approvals_requester_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- prebookings: ix_vnw_prebooks_status_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prebookings' AND INDEX_NAME = 'ix_vnw_prebooks_status_newest') = 0,
  'ALTER TABLE `prebookings` ADD INDEX `ix_vnw_prebooks_status_newest` (`status`,`created_at`,`prebook_id`)',
  'SELECT ''ix_vnw_prebooks_status_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- prebookings: ix_vnw_prebooks_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prebookings' AND INDEX_NAME = 'ix_vnw_prebooks_newest') = 0,
  'ALTER TABLE `prebookings` ADD INDEX `ix_vnw_prebooks_newest` (`created_at`,`prebook_id`)',
  'SELECT ''ix_vnw_prebooks_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- prebook_refund_requests: ix_vnw_refunds_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'prebook_refund_requests' AND INDEX_NAME = 'ix_vnw_refunds_newest') = 0,
  'ALTER TABLE `prebook_refund_requests` ADD INDEX `ix_vnw_refunds_newest` (`requested_at`,`refund_request_id`)',
  'SELECT ''ix_vnw_refunds_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- sell_requests: ix_vnw_sell_status_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sell_requests' AND INDEX_NAME = 'ix_vnw_sell_status_newest') = 0,
  'ALTER TABLE `sell_requests` ADD INDEX `ix_vnw_sell_status_newest` (`status`,`created_at`,`request_id`)',
  'SELECT ''ix_vnw_sell_status_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- sell_requests: ix_vnw_sell_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sell_requests' AND INDEX_NAME = 'ix_vnw_sell_newest') = 0,
  'ALTER TABLE `sell_requests` ADD INDEX `ix_vnw_sell_newest` (`created_at`,`request_id`)',
  'SELECT ''ix_vnw_sell_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- number_private_links: ix_vnw_private_links_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'number_private_links' AND INDEX_NAME = 'ix_vnw_private_links_newest') = 0,
  'ALTER TABLE `number_private_links` ADD INDEX `ix_vnw_private_links_newest` (`created_at`,`private_link_id`)',
  'SELECT ''ix_vnw_private_links_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- testimonials: ix_vnw_testimonials_published_order
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'testimonials' AND INDEX_NAME = 'ix_vnw_testimonials_published_order') = 0,
  'ALTER TABLE `testimonials` ADD INDEX `ix_vnw_testimonials_published_order` (`is_active`,`sort_order`,`testimonial_id`)',
  'SELECT ''ix_vnw_testimonials_published_order already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- dealer_purchase_numbers: ix_vnw_supplier_inventory_state_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dealer_purchase_numbers' AND INDEX_NAME = 'ix_vnw_supplier_inventory_state_newest') = 0,
  'ALTER TABLE `dealer_purchase_numbers` ADD INDEX `ix_vnw_supplier_inventory_state_newest` (`state`,`created_at`,`dealer_purchase_id`)',
  'SELECT ''ix_vnw_supplier_inventory_state_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- dealer_purchase_numbers: ix_vnw_supplier_inventory_dealer_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dealer_purchase_numbers' AND INDEX_NAME = 'ix_vnw_supplier_inventory_dealer_newest') = 0,
  'ALTER TABLE `dealer_purchase_numbers` ADD INDEX `ix_vnw_supplier_inventory_dealer_newest` (`external_dealer_id`,`state`,`created_at`,`dealer_purchase_id`)',
  'SELECT ''ix_vnw_supplier_inventory_dealer_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- dealer_purchase_payments: ix_vnw_supplier_payments_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dealer_purchase_payments' AND INDEX_NAME = 'ix_vnw_supplier_payments_newest') = 0,
  'ALTER TABLE `dealer_purchase_payments` ADD INDEX `ix_vnw_supplier_payments_newest` (`paid_at`,`dealer_payment_id`)',
  'SELECT ''ix_vnw_supplier_payments_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- dealer_purchase_payments: ix_vnw_supplier_payments_dealer_newest
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dealer_purchase_payments' AND INDEX_NAME = 'ix_vnw_supplier_payments_dealer_newest') = 0,
  'ALTER TABLE `dealer_purchase_payments` ADD INDEX `ix_vnw_supplier_payments_dealer_newest` (`external_dealer_id`,`paid_at`,`dealer_payment_id`)',
  'SELECT ''ix_vnw_supplier_payments_dealer_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- vip_number_categories: ix_vnw_category_version_lookup
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_number_categories' AND INDEX_NAME = 'ix_vnw_category_version_lookup') = 0,
  'ALTER TABLE `vip_number_categories` ADD INDEX `ix_vnw_category_version_lookup` (`category_slug`,`classifier_version`,`number_id`)',
  'SELECT ''ix_vnw_category_version_lookup already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- vip_number_subcategories: ix_vnw_subcategory_version_lookup
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_number_subcategories' AND INDEX_NAME = 'ix_vnw_subcategory_version_lookup') = 0,
  'ALTER TABLE `vip_number_subcategories` ADD INDEX `ix_vnw_subcategory_version_lookup` (`category_id`,`subcategory_id`,`classifier_version`,`number_id`)',
  'SELECT ''ix_vnw_subcategory_version_lookup already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- Generic Offline catalog paging: filters available stock and sorts newest first.
SET @vnw_sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_numbers' AND INDEX_NAME = 'ix_vnw_stock_status_newest') = 0,
  'ALTER TABLE `vip_numbers` ADD INDEX `ix_vnw_stock_status_newest` (`status`,`created_at`,`number_id`)',
  'SELECT ''ix_vnw_stock_status_newest already exists'' AS migration_note'
);
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

-- Landscape Google-review screenshots on the home page. Existing text reviews remain intact.
CREATE TABLE IF NOT EXISTS `review_screenshots` (
  `screenshot_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `alt_text` VARCHAR(180) NOT NULL DEFAULT 'Google review screenshot',
  `image_mime` VARCHAR(32) NOT NULL,
  `image_sha256` CHAR(64) NOT NULL,
  `image_data` LONGBLOB NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`screenshot_id`),
  KEY `idx_review_screenshots_public` (`is_active`,`sort_order`,`screenshot_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Review row counts and classifier state after the SQL migration.
SELECT COUNT(*) AS inventory_rows FROM vip_numbers;
SELECT COUNT(*) AS category_rows, COUNT(DISTINCT number_id) AS indexed_numbers
  FROM vip_number_categories WHERE classifier_version = 4;
SELECT COUNT(*) AS subcategory_rows, COUNT(DISTINCT number_id) AS indexed_numbers
  FROM vip_number_subcategories WHERE classifier_version = 4;
SELECT TABLE_NAME, INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS indexed_columns
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME LIKE 'ix_vnw_%'
  GROUP BY TABLE_NAME, INDEX_NAME ORDER BY TABLE_NAME, INDEX_NAME;

-- SQL cannot reproduce the full v4 number classifier. After this script, stop old API
-- writers and run the repository backfill against this same database:
-- npm run build
-- node dist/scripts/backfillInternalCategories.js
-- Start the updated API only after that command verifies the inventory count.

-- Checkout billing snapshots; historical charged totals remain unchanged.
SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND INDEX_NAME='ix_vnw_coupon_checkout')=0, 'ALTER TABLE orders ADD INDEX ix_vnw_coupon_checkout (coupon_code,payment_status,status,payment_expires_at)', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql; EXECUTE vnw_stmt; DEALLOCATE PREPARE vnw_stmt;
INSERT INTO env (key_id,value) VALUES ('GST_PERCENT','0') ON DUPLICATE KEY UPDATE key_id=VALUES(key_id);
SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='mrp_total')=0, 'ALTER TABLE orders ADD COLUMN mrp_total DECIMAL(18,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql; EXECUTE vnw_stmt; DEALLOCATE PREPARE vnw_stmt;
SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='offer_savings')=0, 'ALTER TABLE orders ADD COLUMN offer_savings DECIMAL(18,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql; EXECUTE vnw_stmt; DEALLOCATE PREPARE vnw_stmt;
SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='taxable_amount')=0, 'ALTER TABLE orders ADD COLUMN taxable_amount DECIMAL(18,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql; EXECUTE vnw_stmt; DEALLOCATE PREPARE vnw_stmt;
SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gst_percent')=0, 'ALTER TABLE orders ADD COLUMN gst_percent DECIMAL(5,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql; EXECUTE vnw_stmt; DEALLOCATE PREPARE vnw_stmt;
SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='gst_amount')=0, 'ALTER TABLE orders ADD COLUMN gst_amount DECIMAL(18,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql; EXECUTE vnw_stmt; DEALLOCATE PREPARE vnw_stmt;

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

-- 2026-10-01: complete checkout repair and payment history upgrade.
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
