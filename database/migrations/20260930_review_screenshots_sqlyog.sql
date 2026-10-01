-- Run manually in SQLyog against the VIP Number World database.
-- Additive migration: keeps existing reviews, carousel projects and private links intact.
CREATE TABLE IF NOT EXISTS review_screenshots (
  screenshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  alt_text VARCHAR(180) NOT NULL DEFAULT 'Google review screenshot',
  image_mime VARCHAR(32) NOT NULL,
  image_sha256 CHAR(64) NOT NULL,
  image_data LONGBLOB NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (screenshot_id),
  KEY idx_review_screenshots_public (is_active, sort_order, screenshot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
