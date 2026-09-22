-- Schema only. Suppliers here are independent from registered marketplace dealer accounts.
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
