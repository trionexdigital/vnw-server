-- VIP Number World: visibility, private links, and dealer purchase management
-- SQLyog Community compatible standalone migration (no SOURCE commands).
-- Target database: vipnumberworld
--
-- This migration preserves existing rows and backfills existing inventory to ONLINE.
-- It may be rerun after an interrupted attempt: columns, indexes, and foreign keys
-- added to existing tables are guarded through information_schema checks.

USE `vipnumberworld`;
SET NAMES utf8mb4;

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
