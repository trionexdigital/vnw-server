-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `coupons` (
  `coupon_id` int unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `type` enum('PERCENT','FLAT') NOT NULL DEFAULT 'PERCENT',
  `value` decimal(18,2) NOT NULL DEFAULT '0.00',
  `min_order` decimal(18,2) NOT NULL DEFAULT '0.00',
  `max_discount` decimal(18,2) DEFAULT NULL,
  `usage_limit` int DEFAULT NULL,
  `used_count` int NOT NULL DEFAULT '0',
  `expires_at` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`coupon_id`), UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
