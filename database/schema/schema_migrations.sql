-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `migration_key` varchar(128) NOT NULL,
  `classifier_version` smallint unsigned DEFAULT NULL,
  `details` text,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`migration_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
