-- Schema only. This file intentionally contains no seed data.
CREATE TABLE IF NOT EXISTS `role_default_permissions` (
  `role` enum('ADMIN','USER','DEALER','EMPLOYEE','SYSTEM') NOT NULL,
  `perm_key` varchar(64) NOT NULL,
  PRIMARY KEY (`role`,
  `perm_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
