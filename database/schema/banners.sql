-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `banners` (
  `banner_id` int unsigned NOT NULL AUTO_INCREMENT,
  `eyebrow` varchar(96) DEFAULT NULL,
  `title` varchar(160) DEFAULT NULL,
  `subtitle` varchar(255) DEFAULT NULL,
  `image` longtext,
  `cta_text` varchar(64) DEFAULT NULL,
  `cta_link` varchar(255) DEFAULT NULL,
  `content_x` tinyint unsigned NOT NULL DEFAULT '25',
  `content_y` tinyint unsigned NOT NULL DEFAULT '62',
  `content_width` tinyint unsigned NOT NULL DEFAULT '34',
  `content_rotation` smallint NOT NULL DEFAULT '0',
  `content_style` varchar(16) NOT NULL DEFAULT 'light',
  `text_align` varchar(8) NOT NULL DEFAULT 'left',
  `font_style` varchar(12) NOT NULL DEFAULT 'serif',
  `title_size` varchar(8) NOT NULL DEFAULT 'medium',
  `overlay_style` varchar(12) NOT NULL DEFAULT 'soft',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`banner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
