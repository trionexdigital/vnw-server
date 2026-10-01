-- Run in SQLyog against vipnumberworld before deploying classifier v4 if this schema change has not already been applied.
-- Take a database backup first. Stop older API writers while running the backfill.
-- Existing vip_numbers and their existing category rows are preserved until backfill.
SET @category_exclusive_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vip_number_categories'
    AND INDEX_NAME = 'number_category_exclusive'
);
SET @category_index_ddl := IF(
  @category_exclusive_exists > 0,
  'ALTER TABLE `vip_number_categories` DROP INDEX `number_category_exclusive`',
  'SELECT 1'
);
PREPARE category_index_statement FROM @category_index_ddl;
EXECUTE category_index_statement;
DEALLOCATE PREPARE category_index_statement;

CREATE TABLE IF NOT EXISTS `vip_number_subcategories` (
  `number_id` int unsigned NOT NULL,
  `category_id` int unsigned NOT NULL,
  `subcategory_id` int unsigned NOT NULL,
  `classifier_version` smallint unsigned NOT NULL,
  `matched_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`number_id`, `category_id`, `subcategory_id`),
  KEY `subcategory_lookup` (`category_id`, `subcategory_id`, `number_id`),
  KEY `classifier_version` (`classifier_version`),
  CONSTRAINT `fk_vip_number_subcategories_number` FOREIGN KEY (`number_id`) REFERENCES `vip_numbers` (`number_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Then run: npm run build && node dist/scripts/backfillInternalCategories.js
-- Check the reported inventory count before starting the new API server.
