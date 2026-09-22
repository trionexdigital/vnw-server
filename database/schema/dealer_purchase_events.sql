-- Schema only. Append-only audit history for dealer inventory and payment lifecycle actions.
CREATE TABLE IF NOT EXISTS `dealer_purchase_events` (
  `dealer_event_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dealer_purchase_id` int unsigned DEFAULT NULL,
  `dealer_payment_id` int unsigned DEFAULT NULL,
  `external_dealer_id` int unsigned NOT NULL,
  `event_type` enum('CREATED','SOLD','SALE_REVERSED','DELETED','RESTORED','PAYMENT_POSTED','PAYMENT_VOIDED') NOT NULL,
  `details` json DEFAULT NULL,
  `created_by` int unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`dealer_event_id`),
  KEY `dealer_event_purchase` (`dealer_purchase_id`,`created_at`),
  KEY `dealer_event_payment` (`dealer_payment_id`),
  KEY `dealer_event_supplier` (`external_dealer_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
