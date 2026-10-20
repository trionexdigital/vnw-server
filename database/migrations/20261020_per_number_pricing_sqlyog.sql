-- Run once before deploying the per-number pricing API. Safe to run again.
-- Existing prices and order/payment snapshots are deliberately left untouched.
SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='base_price')=0,
  'ALTER TABLE vip_numbers ADD COLUMN base_price DECIMAL(18,2) DEFAULT NULL', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='additional_discount_pct')=0,
  'ALTER TABLE vip_numbers ADD COLUMN additional_discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;

ALTER TABLE vip_numbers MODIFY COLUMN discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00;
DELETE FROM env WHERE key_id='GLOBAL_NUMBER_DISCOUNT_PERCENT';
