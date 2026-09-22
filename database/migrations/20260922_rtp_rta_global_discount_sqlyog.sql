-- VIP Number World correction: RTP / NON-RTP / RTA and global catalog discount
-- Standalone SQLyog Community script. Safe to run after the 20260922 migration.

USE `vipnumberworld`;
SET NAMES utf8mb4;

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

-- Preserve current pricing until Settings is explicitly saved. The initial
-- store-wide percentage is the most frequently used current catalog discount.
INSERT INTO `env` (`key_id`,`value`)
SELECT 'GLOBAL_NUMBER_DISCOUNT_PERCENT', CAST(COALESCE((
  SELECT ranked.discount_pct
  FROM (
    SELECT discount_pct, COUNT(*) AS usage_count
    FROM vip_numbers
    WHERE discount_pct BETWEEN 0 AND 99
    GROUP BY discount_pct
    ORDER BY usage_count DESC, discount_pct DESC
    LIMIT 1
  ) ranked
), 0) AS CHAR)
ON DUPLICATE KEY UPDATE `key_id`=VALUES(`key_id`);

SELECT 'RTP/RTA and global discount migration completed' AS migration_status;
SELECT COLUMN_NAME,COLUMN_TYPE,COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='rtp_status';
SELECT key_id,value FROM env WHERE key_id='GLOBAL_NUMBER_DISCOUNT_PERCENT';
