# VIP Number World database schema

This directory contains one schema-only SQL file for each application table. No file contains seed data. The application does not create, alter, migrate, or seed tables during startup.

For a new empty database, run `mysql --database=<database_name> < apply_all.sql` from this directory, then apply the consolidated SQLyog migration below for its paging indexes. For an existing production database, `CREATE TABLE IF NOT EXISTS` deliberately preserves existing tables and rows.

Table order is recorded in `apply_all.sql`.

For the Corporate Numbers screen, admin-managed home delivery cities, and dealer-account ledger links, run `../migrations/20261011_corporate_delivery_dealer_ui_sqlyog.sql` before deploying the updated API. See `../migrations/20261011_storefront_upgrade_README.md` for configuration and preserved historical-supplier linking.

For the checkout `mrp_total` repair and complete application payment history, run `../migrations/20261001_payment_history_checkout_sqlyog.sql` manually in SQLyog. It includes the Cashfree upgrade, billing snapshots, attempt metadata and `payment_events`. See `../../PAYMENT_HISTORY_SETUP.md`. The consolidated storefront script below includes this upgrade as well.

For an existing SQLyog-managed installation, run `../migrations/20260930_all_storefront_changes_sqlyog.sql` as a single script after taking a database backup. It consolidates the earlier visibility, private-link, supplier-ledger, RTP/RTA, discount, and multi-category schema changes with guarded indexes for paged listings. Existing source inventory and transactional rows are preserved; the script contains no demo seed. The older individual migrations remain for reference and do not need to be run separately when using the consolidated script.
The same consolidated script also creates the review-screenshot table and an index for the paged generic Offline catalog. It is safe to rerun. Do not run the separate `20260930_review_screenshots_sqlyog.sql` if you use the consolidated script.

Pagination is implemented by the API's bounded `COUNT` plus `LIMIT`/`OFFSET` queries; the SQL migration provides schema and indexes, not application pagination logic. The internal-app category classifier (31 categories and 200 category/subcategory assignments) still needs its data backfill after the SQL script: stop older API writers, run `npm run build` and `node dist/scripts/backfillInternalCategories.js` with the server's normal database environment, and deploy the updated API and UI only after the v4 count check succeeds. This rebuilds derived category indexes without deleting inventory; a subcategory match also indexes its parent.

For inventory Recycle and the 12-language public store, run `../migrations/20261012_recycle_languages_sqlyog.sql` before deploying the updated API. See `../migrations/20261012_recycle_languages_README.md` for the backend-only Google key configuration and history protection.
