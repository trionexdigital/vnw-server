-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `permissions` (
  `perm_key` varchar(64) NOT NULL,
  `module` enum('USER','DEALER','MANAGE') NOT NULL DEFAULT 'USER',
  `label` varchar(96) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`perm_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
