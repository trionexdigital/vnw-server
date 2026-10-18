-- VIP Number World: inventory Recycle. Language management has its own migration.
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

-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `migration_key` varchar(128) NOT NULL,
  `classifier_version` smallint unsigned DEFAULT NULL,
  `details` text,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`migration_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations (migration_key,details) VALUES ('20261012_recycle_languages','Soft-delete inventory with audited restore/purge.') ON DUPLICATE KEY UPDATE details=VALUES(details);
