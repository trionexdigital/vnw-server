-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `testimonials` (
  `testimonial_id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(96) NOT NULL,
  `role` varchar(96) DEFAULT NULL,
  `avatar` longtext,
  `content` varchar(1024) NOT NULL,
  `rating` tinyint NOT NULL DEFAULT '5',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`testimonial_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
