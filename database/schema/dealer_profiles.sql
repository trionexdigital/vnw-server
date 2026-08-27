-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `dealer_profiles` (
  `dealer_id` int unsigned NOT NULL,
  `business_name` varchar(128) DEFAULT NULL,
  `gst_no` varchar(32) DEFAULT NULL,
  `payout_method` varchar(32) DEFAULT NULL,
  `payout_details` longtext,
  `commission_pct` decimal(6,2) NOT NULL DEFAULT '10.00',
  `kyc_status` enum('PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`dealer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
