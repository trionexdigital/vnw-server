-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `carousel_assets` (
  `asset_id` int unsigned NOT NULL AUTO_INCREMENT,
  `carousel_id` int unsigned NOT NULL,
  `purpose` enum('source','sticker','preview-desktop','preview-mobile') NOT NULL DEFAULT 'source',
  `original_name` varchar(180) NOT NULL,
  `mime_type` varchar(64) NOT NULL,
  `byte_size` int unsigned NOT NULL,
  `width` int unsigned NOT NULL,
  `height` int unsigned NOT NULL,
  `content_sha256` char(64) NOT NULL,
  `content` longblob NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`asset_id`), KEY `project_assets` (`carousel_id`,
  `purpose`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
