CREATE TABLE IF NOT EXISTS `delivery_cities` (
  `city_id` int unsigned NOT NULL AUTO_INCREMENT,
  `city_name` varchar(96) NOT NULL,
  `state_name` varchar(96) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_highlighted` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`city_id`),
  UNIQUE KEY `delivery_city_state` (`city_name`,`state_name`),
  KEY `delivery_city_display` (`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
