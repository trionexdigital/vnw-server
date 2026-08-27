-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `trusted_clients` (
  `client_id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(96) NOT NULL,
  `website_url` varchar(512) DEFAULT NULL,
  `alt_text` varchar(160) DEFAULT NULL,
  `logo_mime` varchar(32) DEFAULT NULL,
  `logo_data` longblob,
  `logo_sha256` char(64) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_id`), KEY `trusted_client_published_order` (`is_active`,
  `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
