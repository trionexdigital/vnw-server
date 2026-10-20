-- Standalone Dealer Management, MySQL 5.7+/8.0, InnoDB.
-- Select the existing application database before executing. Safe to rerun.
-- No website inventory, sales, wallet, pricing, or existing dealer data is changed.
CREATE TABLE IF NOT EXISTS dm_config (
  config_key varchar(40) PRIMARY KEY, config_value varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_sequences (
  sequence_key varchar(30) PRIMARY KEY, sequence_value bigint unsigned NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO dm_sequences VALUES ('BASIC',0),('PREMIUM',0),('PAYMENT',0),('WRITE',0);
CREATE TABLE IF NOT EXISTS dm_dealers (
  dealer_id int unsigned AUTO_INCREMENT PRIMARY KEY,
  dealer_code varchar(40) NOT NULL UNIQUE,
  dealer_type enum('BASIC','PREMIUM') NOT NULL,
  name varchar(128) NOT NULL, contact_name varchar(96) NOT NULL,
  phone varchar(20) NOT NULL, email varchar(128) NOT NULL,
  status enum('ACTIVE','BLOCKED') NOT NULL DEFAULT 'ACTIVE',
  linked_user_id int unsigned NULL UNIQUE,
  version int unsigned NOT NULL DEFAULT 1,
  created_by int unsigned NOT NULL, created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  CONSTRAINT dm_dealer_login_fk FOREIGN KEY (linked_user_id) REFERENCES auth_user(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_staff_permissions (
  user_id int unsigned NOT NULL, permission_key varchar(60) NOT NULL,
  granted_by int unsigned NOT NULL, granted_at datetime NOT NULL,
  PRIMARY KEY(user_id,permission_key),
  CONSTRAINT dm_staff_user_fk FOREIGN KEY(user_id) REFERENCES auth_user(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_stock (
  stock_id int unsigned AUTO_INCREMENT PRIMARY KEY, dealer_id int unsigned NOT NULL,
  number_value char(10) NOT NULL,
  dealer_cost decimal(16,2) NOT NULL, selling_price decimal(16,2) NOT NULL,
  readiness enum('RTP','NON_RTP','RTA') NOT NULL, rtp_date date NULL,
  remarks varchar(1000) NOT NULL DEFAULT '',
  digit_total tinyint unsigned NOT NULL, root_sum tinyint unsigned NOT NULL,
  patterns_json longtext NOT NULL,
  state enum('INVENTORY','SOLD','INACTIVE') NOT NULL DEFAULT 'INVENTORY',
  active_number char(10) GENERATED ALWAYS AS (CASE WHEN state <> 'INACTIVE' THEN number_value ELSE NULL END) STORED,
  version int unsigned NOT NULL DEFAULT 1,
  created_by int unsigned NOT NULL, created_at datetime NOT NULL, updated_at datetime NOT NULL,
  UNIQUE KEY dm_active_number(active_number), KEY dm_stock_dealer(dealer_id,state,stock_id),
  CONSTRAINT dm_stock_dealer_fk FOREIGN KEY(dealer_id) REFERENCES dm_dealers(dealer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_sales (
  sale_id int unsigned AUTO_INCREMENT PRIMARY KEY, stock_id int unsigned NOT NULL,
  dealer_id int unsigned NOT NULL, number_value char(10) NOT NULL,
  dealer_cost decimal(16,2) NOT NULL, sale_price decimal(16,2) NOT NULL,
  charges decimal(16,2) NOT NULL DEFAULT 0,
  sale_source enum('ONLINE','OFFLINE') NOT NULL, external_reference varchar(128) NOT NULL DEFAULT '',
  sold_at datetime NOT NULL, status enum('ACTIVE','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  settled_payment_id int unsigned NULL,
  replaces_sale_id int unsigned NULL, version int unsigned NOT NULL DEFAULT 1,
  created_by int unsigned NOT NULL, created_at datetime NOT NULL,
  KEY dm_sales_dealer(dealer_id,status,settled_payment_id), KEY dm_sales_stock(stock_id),
  CONSTRAINT dm_sale_stock_fk FOREIGN KEY(stock_id) REFERENCES dm_stock(stock_id),
  CONSTRAINT dm_sale_dealer_fk FOREIGN KEY(dealer_id) REFERENCES dm_dealers(dealer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_payments (
  payment_id int unsigned AUTO_INCREMENT PRIMARY KEY, payment_code varchar(40) NOT NULL UNIQUE,
  dealer_id int unsigned NOT NULL, gross_amount decimal(16,2) NOT NULL,
  recovery_amount decimal(16,2) NOT NULL, net_amount decimal(16,2) NOT NULL,
  payment_mode enum('UPI','BANK','CASH','OTHER') NOT NULL,
  reference_no varchar(128) NOT NULL DEFAULT '', notes varchar(1000) NOT NULL DEFAULT '',
  paid_at datetime NOT NULL, status enum('POSTED','VOIDED') NOT NULL DEFAULT 'POSTED',
  created_by int unsigned NOT NULL, created_at datetime NOT NULL,
  KEY dm_payment_dealer(dealer_id,paid_at),
  CONSTRAINT dm_payment_dealer_fk FOREIGN KEY(dealer_id) REFERENCES dm_dealers(dealer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_payment_allocations (
  payment_id int unsigned NOT NULL, sale_id int unsigned NOT NULL, amount decimal(16,2) NOT NULL,
  PRIMARY KEY(payment_id,sale_id),
  CONSTRAINT dm_allocation_payment_fk FOREIGN KEY(payment_id) REFERENCES dm_payments(payment_id),
  CONSTRAINT dm_allocation_sale_fk FOREIGN KEY(sale_id) REFERENCES dm_sales(sale_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_adjustments (
  adjustment_id int unsigned AUTO_INCREMENT PRIMARY KEY, dealer_id int unsigned NOT NULL,
  sale_id int unsigned NOT NULL, source_payment_id int unsigned NULL,
  adjustment_type enum('PAYABLE_REVERSAL','RECOVERY') NOT NULL,
  amount decimal(16,2) NOT NULL, reason varchar(1000) NOT NULL,
  created_by int unsigned NOT NULL, created_at datetime NOT NULL,
  KEY dm_adjustment_dealer(dealer_id),
  CONSTRAINT dm_adjustment_sale_fk FOREIGN KEY(sale_id) REFERENCES dm_sales(sale_id),
  CONSTRAINT dm_adjustment_source_fk FOREIGN KEY(source_payment_id) REFERENCES dm_payments(payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_recovery_allocations (
  payment_id int unsigned NOT NULL, adjustment_id int unsigned NOT NULL, amount decimal(16,2) NOT NULL,
  PRIMARY KEY(payment_id,adjustment_id),
  CONSTRAINT dm_recovery_payment_fk FOREIGN KEY(payment_id) REFERENCES dm_payments(payment_id),
  CONSTRAINT dm_recovery_adjustment_fk FOREIGN KEY(adjustment_id) REFERENCES dm_adjustments(adjustment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_audit (
  audit_id bigint unsigned AUTO_INCREMENT PRIMARY KEY,
  entity_type varchar(30) NOT NULL, entity_id int unsigned NOT NULL,
  action varchar(40) NOT NULL, old_json longtext NULL, new_json longtext NULL,
  reason varchar(1000) NOT NULL, actor_id int unsigned NOT NULL, created_at datetime NOT NULL,
  KEY dm_audit_entity(entity_type,entity_id,audit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS dm_operations (
  request_key varchar(80) PRIMARY KEY, actor_id int unsigned NOT NULL,
  request_hash char(64) NOT NULL, response_json longtext NOT NULL, created_at datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Publish readiness only after all module DDL has completed successfully.
INSERT IGNORE INTO dm_config VALUES ('schema_version','1'),('enabled','1');
-- Disable (rollback without deleting records):
-- UPDATE dm_config SET config_value='0' WHERE config_key='enabled';
-- Re-enable after verification:
-- UPDATE dm_config SET config_value='1' WHERE config_key='enabled';
