-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `faqs` (
  `faq_id` int unsigned NOT NULL AUTO_INCREMENT,
  `category` varchar(64) NOT NULL,
  `question` varchar(255) NOT NULL,
  `answer` text NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`faq_id`), KEY `faq_published_order` (`is_active`,
  `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
