-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `env` (
  `key_id` varchar(64) NOT NULL,
  `value` text,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
