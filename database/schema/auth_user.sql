-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `auth_user` (
  `user_id` int unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(128) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `password` varchar(512) NOT NULL,
  `role` enum('ADMIN','USER','DEALER','EMPLOYEE','SYSTEM') NOT NULL DEFAULT 'USER',
  `full_name` varchar(96) NOT NULL,
  `address` varchar(1048) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  `logo` longtext,
  `referral_code` varchar(16) DEFAULT NULL,
  `referred_by` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `phone` (`phone`),
  UNIQUE KEY `referral_code` (`referral_code`),
  KEY `referred_by` (`referred_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
