-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `user_permissions` (
  `user_id` int unsigned NOT NULL,
  `perm_key` varchar(64) NOT NULL,
  `granted` tinyint(1) NOT NULL DEFAULT '1',
  `granted_by` int unsigned DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,
  `perm_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
