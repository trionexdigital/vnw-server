-- Schema only. Raw bearer tokens are never stored; only SHA-256 hashes are persisted.
CREATE TABLE IF NOT EXISTS `number_private_links` (
  `private_link_id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`private_link_id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `private_link_status` (`revoked_at`,`expires_at`),
  KEY `created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
