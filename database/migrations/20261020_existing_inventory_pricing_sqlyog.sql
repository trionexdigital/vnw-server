-- Existing inventory pricing rollout. Execute the WHOLE file in SQLyog against the application database.
-- Standalone and rerunnable: includes the additive schema migration and retires the old Settings key.
-- Requires CREATE ROUTINE permission. Uses exact DECIMAL arithmetic, never FLOAT/DOUBLE.
-- Scope: all current online/offline catalog listings, including reserved/pending/inactive listings.
-- Sold and recycled numbers, orders, payment snapshots, GST, coupons and supplier ledgers are untouched.
-- Original base = saved base_price, or the existing MRP when base_price is NULL.
-- Example: an unconverted MRP of 5500 becomes base 5500, listed 6875, final 6531.25 (no extra discount).
-- A rerun always uses the saved base and never adds commission/discounts a second time.

SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='base_price')=0,
  'ALTER TABLE vip_numbers ADD COLUMN base_price DECIMAL(18,2) DEFAULT NULL', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;
SET @vnw_sql = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='vip_numbers' AND COLUMN_NAME='additional_discount_pct')=0,
  'ALTER TABLE vip_numbers ADD COLUMN additional_discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00', 'SELECT 1');
PREPARE vnw_stmt FROM @vnw_sql;
EXECUTE vnw_stmt;
DEALLOCATE PREPARE vnw_stmt;
ALTER TABLE vip_numbers MODIFY COLUMN discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0.00;
DELETE FROM env WHERE key_id='GLOBAL_NUMBER_DISCOUNT_PERCENT';

-- Permanent recovery snapshot. Reruns preserve the FIRST pre-rollout values for each number.
CREATE TABLE IF NOT EXISTS vnw_inventory_pricing_backup_20261020 (
  number_id INT UNSIGNED NOT NULL PRIMARY KEY,
  base_price_before DECIMAL(18,2) NULL,
  additional_discount_pct_before DECIMAL(5,2) NULL,
  mrp_before DECIMAL(18,2) NOT NULL,
  offer_price_before DECIMAL(18,2) NOT NULL,
  discount_pct_before DECIMAL(5,2) NOT NULL,
  captured_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

DROP PROCEDURE IF EXISTS vnw_apply_inventory_pricing_20261020;
DELIMITER $$
CREATE PROCEDURE vnw_apply_inventory_pricing_20261020()
BEGIN
  DECLARE finished BOOLEAN DEFAULT FALSE;
  DECLARE v_id INT UNSIGNED;
  DECLARE v_old_base DECIMAL(18,2);
  DECLARE v_extra DECIMAL(5,2);
  DECLARE v_old_mrp DECIMAL(18,2);
  DECLARE v_old_offer DECIMAL(18,2);
  DECLARE v_old_discount DECIMAL(5,2);
  DECLARE v_base DECIMAL(18,2);
  DECLARE v_listed DECIMAL(40,12);
  DECLARE v_final DECIMAL(40,12);
  DECLARE v_effective DECIMAL(5,2);
  DECLARE v_changed INT DEFAULT 0;
  DECLARE v_invalid INT DEFAULT 0;
  DECLARE v_error VARCHAR(128);
  DECLARE inventory CURSOR FOR
    SELECT number_id,base_price,additional_discount_pct,mrp,offer_price,discount_pct
    FROM vip_numbers WHERE deleted_at IS NULL AND status<>'SOLD' ORDER BY number_id FOR UPDATE;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET finished = TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS vnw_inventory_pricing_plan;
    RESIGNAL;
  END;

  -- Sanity-check the same examples used by the server calculator before any catalog writes.
  IF ROUND(2500.00 * 1.25, 2) <> 3125.00
     OR ROUND(2500.00 * 1.25 * 0.95, 2) <> 2968.75
     OR ROUND(2500.00 * 1.25 * 0.95 * (1.00 - 10.00 * 0.01), 2) <> 2671.88
     OR ROUND(100.00 - 95.00 * (1.00 - 10.00 * 0.01), 2) <> 14.50 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Pricing formula verification failed.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS vnw_inventory_pricing_plan;
  CREATE TEMPORARY TABLE vnw_inventory_pricing_plan (
    number_id INT UNSIGNED NOT NULL PRIMARY KEY,
    old_base DECIMAL(18,2) NULL, old_extra DECIMAL(5,2) NULL,
    old_mrp DECIMAL(18,2) NOT NULL, old_offer DECIMAL(18,2) NOT NULL, old_discount DECIMAL(5,2) NOT NULL,
    new_base DECIMAL(18,2) NOT NULL, new_extra DECIMAL(5,2) NOT NULL,
    new_mrp DECIMAL(18,2) NOT NULL, new_offer DECIMAL(18,2) NOT NULL, new_discount DECIMAL(5,2) NOT NULL
  ) ENGINE=InnoDB;
  START TRANSACTION;
  OPEN inventory;
  inventory_loop: LOOP
    FETCH inventory INTO v_id,v_old_base,v_extra,v_old_mrp,v_old_offer,v_old_discount;
    IF finished THEN LEAVE inventory_loop; END IF;
    SET v_base = COALESCE(v_old_base,v_old_mrp);
    IF v_base <= 0 OR COALESCE(v_extra,0) < 0 OR COALESCE(v_extra,0) >= 100 THEN
      SET v_error = CONCAT('Invalid base/discount for number_id ',v_id,'. No inventory prices were changed.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_error;
    END IF;
    SET v_listed = v_base * 1.25;
    -- Do NOT use rounded website MRP or a rounded automatic-discount amount as the next input.
    SET v_final = v_base * 1.25 * 0.95 * (1.00 - COALESCE(v_extra,0) * 0.01);
    SET v_effective = ROUND(100.00 - 95.00 * (1.00 - COALESCE(v_extra,0) * 0.01),2);
    IF ROUND(v_listed,2) > 9999999999999999.99 OR ROUND(v_final,2) < 0.01 THEN
      SET v_error = CONCAT('Price overflow/underflow for number_id ',v_id,'. No inventory prices were changed.');
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT=v_error;
    END IF;
    IF NOT (v_old_base <=> v_base) OR NOT (v_extra <=> COALESCE(v_extra,0))
       OR v_old_mrp <> ROUND(v_listed,2) OR v_old_offer <> ROUND(v_final,2) OR v_old_discount <> v_effective THEN
      INSERT INTO vnw_inventory_pricing_plan VALUES
        (v_id,v_old_base,v_extra,v_old_mrp,v_old_offer,v_old_discount,v_base,COALESCE(v_extra,0),ROUND(v_listed,2),ROUND(v_final,2),v_effective);
    END IF;
  END LOOP;
  CLOSE inventory;

  INSERT IGNORE INTO vnw_inventory_pricing_backup_20261020
    (number_id,base_price_before,additional_discount_pct_before,mrp_before,offer_price_before,discount_pct_before)
    SELECT number_id,old_base,old_extra,old_mrp,old_offer,old_discount FROM vnw_inventory_pricing_plan;
  UPDATE vip_numbers n JOIN vnw_inventory_pricing_plan p ON p.number_id=n.number_id
    SET n.base_price=p.new_base,n.additional_discount_pct=p.new_extra,n.mrp=p.new_mrp,
        n.offer_price=p.new_offer,n.discount_pct=p.new_discount,n.updated_at=n.updated_at;
  SELECT COUNT(*) INTO v_invalid FROM vip_numbers n JOIN vnw_inventory_pricing_plan p ON p.number_id=n.number_id
    WHERE NOT (n.base_price <=> p.new_base) OR NOT (n.additional_discount_pct <=> p.new_extra)
       OR NOT (n.mrp <=> p.new_mrp) OR NOT (n.offer_price <=> p.new_offer) OR NOT (n.discount_pct <=> p.new_discount);
  IF v_invalid <> 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Stored price verification failed. All inventory price changes were rolled back.';
  END IF;
  SELECT COUNT(*) INTO v_changed FROM vnw_inventory_pricing_plan;
  COMMIT;
  DROP TEMPORARY TABLE vnw_inventory_pricing_plan;
  SELECT v_changed AS inventory_numbers_repriced, '25% markup + automatic 5% + saved individual additional discount' AS pricing_rule;
END$$
DELIMITER ;
CALL vnw_apply_inventory_pricing_20261020();
DROP PROCEDURE IF EXISTS vnw_apply_inventory_pricing_20261020;

-- Review the persisted prices. A successful rerun reports 0 inventory_numbers_repriced.
SELECT number_id,number_value,base_price,additional_discount_pct,mrp AS website_listed_price,
       offer_price AS customer_price,discount_pct AS effective_discount_pct
FROM vip_numbers WHERE deleted_at IS NULL AND status<>'SOLD' ORDER BY number_id LIMIT 25;
