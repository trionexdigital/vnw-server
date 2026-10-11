-- Consolidated SQL for all requested corporate, delivery, dealer, Recycle and translation changes.
-- Run against the existing application database after the baseline/payment migrations.
-- Re-runnable; contains no demo data and does not delete existing inventory.

-- VIP Number World: corporate packs, delivery cities and dealer-account integration.
-- Run this whole file in SQLyog against the existing application database before restarting the API.
-- Back up the database first and pause API writes during migration. Re-runnable.
-- Corporate packs come from live inventory: no copied numbers or fixed-price pack records are needed.
-- Layout, mobile navigation and theme changes need no database data changes.
USE `vipnumberworld`;
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `delivery_cities` (
  `city_id` int unsigned NOT NULL AUTO_INCREMENT,
  `city_name` varchar(96) NOT NULL,
  `state_name` varchar(96) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_highlighted` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`city_id`),
  UNIQUE KEY `delivery_city_state` (`city_name`,`state_name`),
  KEY `delivery_city_display` (`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_dealers' AND COLUMN_NAME='dealer_user_id')=0,
  'ALTER TABLE external_dealers ADD COLUMN dealer_user_id INT UNSIGNED NULL AFTER external_dealer_id', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Names are display labels, not unique identities. Multiple dealer users can share a name.
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_dealers' AND INDEX_NAME='external_dealer_name' AND NON_UNIQUE=0)>0,
  'ALTER TABLE external_dealers DROP INDEX external_dealer_name', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_dealers' AND INDEX_NAME='external_dealer_name')=0,
  'ALTER TABLE external_dealers ADD INDEX external_dealer_name (name)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='external_dealers' AND INDEX_NAME='external_dealer_user')=0,
  'ALTER TABLE external_dealers ADD UNIQUE KEY external_dealer_user (dealer_user_id)', 'SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Link only unambiguous contact matches. Never infer an identity from a business/name label.
-- Keep all unmatched suppliers and all their payments, events and number references intact.
DROP TEMPORARY TABLE IF EXISTS vnw_dealer_candidates;
CREATE TEMPORARY TABLE vnw_dealer_candidates AS
SELECT d.external_dealer_id,u.user_id FROM external_dealers d JOIN auth_user u
 ON u.role='DEALER' AND ((NULLIF(TRIM(d.email),'') IS NOT NULL AND LOWER(TRIM(d.email))=LOWER(TRIM(u.email)))
 OR (NULLIF(TRIM(d.phone),'') IS NOT NULL AND TRIM(d.phone)=TRIM(u.phone)))
WHERE d.dealer_user_id IS NULL AND NOT EXISTS (SELECT 1 FROM external_dealers linked WHERE linked.dealer_user_id=u.user_id);
DROP TEMPORARY TABLE IF EXISTS vnw_dealer_unique_supplier;
CREATE TEMPORARY TABLE vnw_dealer_unique_supplier AS SELECT external_dealer_id,MIN(user_id) AS user_id FROM vnw_dealer_candidates GROUP BY external_dealer_id HAVING COUNT(*)=1;
DROP TEMPORARY TABLE IF EXISTS vnw_dealer_unique_user;
CREATE TEMPORARY TABLE vnw_dealer_unique_user AS SELECT user_id FROM vnw_dealer_candidates GROUP BY user_id HAVING COUNT(*)=1;
UPDATE external_dealers d JOIN vnw_dealer_unique_supplier s ON s.external_dealer_id=d.external_dealer_id
 JOIN vnw_dealer_unique_user u ON u.user_id=s.user_id SET d.dealer_user_id=s.user_id;
DROP TEMPORARY TABLE vnw_dealer_candidates;
DROP TEMPORARY TABLE vnw_dealer_unique_supplier;
DROP TEMPORARY TABLE vnw_dealer_unique_user;

INSERT INTO dealer_profiles (dealer_id,kyc_status)
 SELECT u.user_id,'PENDING' FROM auth_user u LEFT JOIN dealer_profiles p ON p.dealer_id=u.user_id WHERE u.role='DEALER' AND p.dealer_id IS NULL;
INSERT INTO external_dealers (dealer_user_id,name,phone,email,created_by)
 SELECT u.user_id,u.full_name,u.phone,u.email,0 FROM auth_user u LEFT JOIN external_dealers d ON d.dealer_user_id=u.user_id WHERE u.role='DEALER' AND d.external_dealer_id IS NULL;

CREATE TABLE IF NOT EXISTS schema_migrations (
 migration_key varchar(128) NOT NULL PRIMARY KEY, classifier_version smallint unsigned NULL, details text,
 applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO schema_migrations (migration_key,details) VALUES ('20261011_corporate_delivery_dealer_ui','Delivery-city management; suppliers linked to dealer accounts; live corporate packs up to 200 numbers.')
 ON DUPLICATE KEY UPDATE details=VALUES(details);

-- Review these preserved historical suppliers in Dealer Management and link them to actual accounts.
SELECT external_dealer_id,name,email,phone FROM external_dealers WHERE dealer_user_id IS NULL ORDER BY name,external_dealer_id;
-- No cities are seeded: configure confirmed service areas in Admin > Home Delivery Cities.


-- VIP Number World: inventory Recycle and 12-language public translation.
-- Run after the previous migrations, before deploying this API. Re-runnable.
-- Back up the database and pause inventory writes during migration.
-- Sidebar/family selection changes do not require data changes.
USE vipnumberworld;
SET NAMES utf8mb4;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='deleted_at')=0,'ALTER TABLE vip_numbers ADD COLUMN deleted_at DATETIME NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='deleted_by')=0,'ALTER TABLE vip_numbers ADD COLUMN deleted_by INT UNSIGNED NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='status_before_delete')=0,'ALTER TABLE vip_numbers ADD COLUMN status_before_delete VARCHAR(24) NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='stock_before_delete')=0,'ALTER TABLE vip_numbers ADD COLUMN stock_before_delete INT NULL','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND INDEX_NAME='inventory_recycled')=0,'ALTER TABLE vip_numbers ADD INDEX inventory_recycled (deleted_at,number_id)','SELECT 1');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Audit snapshots survive permanent deletion; deliberately no foreign key to inventory.
CREATE TABLE IF NOT EXISTS number_recycle_events (
 event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 number_id INT UNSIGNED NOT NULL,
 number_value VARCHAR(20) NOT NULL,
 action ENUM('RECYCLED','RESTORED','PERMANENTLY_DELETED') NOT NULL,
 actor_id INT UNSIGNED NOT NULL,
 snapshot JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(event_id), KEY recycle_number(number_id), KEY recycle_actor(actor_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Only public source text is cached. No credentials or visitor form values.
CREATE TABLE IF NOT EXISTS translation_cache (
 source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 language VARCHAR(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 source_text MEDIUMTEXT NOT NULL,
 translated_text MEDIUMTEXT NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(language,source_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `migration_key` varchar(128) NOT NULL,
  `classifier_version` smallint unsigned DEFAULT NULL,
  `details` text,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`migration_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations (migration_key,details) VALUES ('20261012_recycle_languages','Soft-delete inventory with audited restore/purge and cached public translation in 12 languages.') ON DUPLICATE KEY UPDATE details=VALUES(details);
