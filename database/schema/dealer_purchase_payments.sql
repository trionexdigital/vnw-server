-- Schema only. Corrections are represented by voiding a payment, never by editing its amount.
CREATE TABLE IF NOT EXISTS `dealer_purchase_payments` (
  `dealer_payment_id` int unsigned NOT NULL AUTO_INCREMENT,
  `external_dealer_id` int unsigned NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `payment_method` varchar(40) DEFAULT NULL,
  `reference_no` varchar(100) DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `paid_at` datetime NOT NULL,
  `status` enum('POSTED','VOIDED') NOT NULL DEFAULT 'POSTED',
  `void_reason` varchar(500) DEFAULT NULL,
  `voided_at` datetime DEFAULT NULL,
  `voided_by` int unsigned DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`dealer_payment_id`),
  KEY `dealer_payment_supplier_status` (`external_dealer_id`,`status`),
  CONSTRAINT `fk_dealer_payment_supplier` FOREIGN KEY (`external_dealer_id`) REFERENCES `external_dealers` (`external_dealer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
