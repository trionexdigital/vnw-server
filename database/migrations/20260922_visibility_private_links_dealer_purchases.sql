-- Review before applying to an existing database. This script preserves all existing rows.
ALTER TABLE `vip_numbers`
  ADD COLUMN `visibility_type` enum('ONLINE','OFFLINE') NOT NULL DEFAULT 'ONLINE' AFTER `status`,
  ADD KEY `visibility_type` (`visibility_type`);

SOURCE ../schema/number_private_links.sql;
SOURCE ../schema/number_private_link_items.sql;
SOURCE ../schema/external_dealers.sql;
SOURCE ../schema/dealer_purchase_numbers.sql;
SOURCE ../schema/dealer_purchase_payments.sql;
SOURCE ../schema/dealer_purchase_events.sql;

ALTER TABLE `cart_items` ADD COLUMN `private_link_id` int unsigned DEFAULT NULL AFTER `number_id`, ADD KEY `private_link_id` (`private_link_id`), ADD CONSTRAINT `fk_cart_item_private_link` FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`) ON DELETE SET NULL;
ALTER TABLE `wishlist` ADD COLUMN `private_link_id` int unsigned DEFAULT NULL AFTER `number_id`, ADD KEY `private_link_id` (`private_link_id`), ADD CONSTRAINT `fk_wishlist_private_link` FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`) ON DELETE SET NULL;
ALTER TABLE `order_items` ADD COLUMN `private_link_id` int unsigned DEFAULT NULL AFTER `number_id`, ADD KEY `private_link_id` (`private_link_id`), ADD CONSTRAINT `fk_order_item_private_link` FOREIGN KEY (`private_link_id`) REFERENCES `number_private_links` (`private_link_id`) ON DELETE SET NULL;

UPDATE `vip_numbers` SET `visibility_type` = 'ONLINE' WHERE `visibility_type` IS NULL;
