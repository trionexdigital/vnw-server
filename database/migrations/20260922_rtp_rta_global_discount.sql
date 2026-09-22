-- Adds the distinct Ready To Activate state and the single store-wide discount.
-- Existing RTP and NON_RTP values are preserved exactly.

ALTER TABLE `vip_numbers`
  MODIFY COLUMN `rtp_status` enum('RTP','NON_RTP','RTA') NOT NULL DEFAULT 'RTA';

-- Start from the most commonly used current discount to minimize price changes.
-- Prices are recalculated only when an administrator saves Settings.
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
