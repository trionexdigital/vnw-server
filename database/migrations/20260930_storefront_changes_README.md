# Manual SQLyog migration and application update

Run `20260930_all_storefront_changes_sqlyog.sql` in SQLyog against the existing `vipnumberworld` database. It includes supporting carousel, trusted-client, review, notification, Lucky Pick, homepage curation and pre-book tables, profile image storage, stock visibility, supplier ledger, readiness, pricing, taxonomy and pagination indexes. It preserves inventory and image files and checks existing objects before adding them.

The SQL file includes the existing classifier backfill instructions. Complete that backfill against the same database before starting the updated API if this installation has not yet moved to classifier v4. No migration has been executed as part of these changes.

Deploy the updated API and UI together. Existing carousel files remain intact. Upload a new mobile image in the editor to replace an old landscape image with the 640 × 800 portrait format. Desktop uploads use 1200 × 420. SQL does not crop existing image blobs.

## Number import and export

Download the Excel template from Numbers → Import. Fill the first Numbers sheet and upload CSV or XLSX. Required headers are `number` and `mrp`; the Instructions sheet describes optional fields. The limit is 5,000 entries and 10 MB per upload. Add Numbers also accepts commas and new lines with shared field values.

Analysis and validation run in the API. It checks canonical Indian mobile numbers, existing inventory, repeats within the upload, prices, stock, labels, statuses, visibility, readiness and future pre-book dates. All occurrences of a repeated number are rejected. Formulas and unsupported columns are rejected. Categories, numerology and discounted prices are calculated by the server.

Accepted entries receive a signed ticket, bound to the administrator and expiring after 30 minutes. Import accepts only that ticket, checks values again, and writes within a database transaction. The unique number constraint rejects concurrent duplicates; other accepted rows are imported and final rejections are reported. Export respects the selected status and visibility and reads server LIMIT/OFFSET pages of 1,000.

## Checkout GST

The consolidated SQL also adds billing snapshot columns to orders and an admin-only `GST_PERCENT` setting, initially 0. Existing rates and historical charged totals are preserved when the SQL is run again. Set the desired rate in Admin → Settings after applying the migration. The API calculates GST on offer prices after coupon discounts, rounds monetary values to two decimals, and stores the rate and breakdown on regular and pre-book orders. Cashfree uses the stored order total; refunds use the amount actually paid. Quotes never reserve stock. Regular checkout validates coupons on the server; pre-book coupons remain unavailable.

Updated on 2026-10-01: this consolidated file now includes the Cashfree migration at the end. If all prior changes have already been applied, run only `20261001_cashfree_gateway_sqlyog.sql`. Both are manual SQLyog scripts. Historical payment references are preserved as LEGACY; existing payments are never charged again. See the repository `CASHFREE_SANDBOX_SETUP.md` for configuration.

## Images and notifications

The carousel editor now allows dragging and zooming inside fixed landscape and portrait crop frames before upload. A crop can be adjusted before publishing. Public headers, account headers, the sidebar and mobile account navigation use the stored profile photo and normalized account name.

Profile crops are uploaded through the authenticated API and persisted in `auth_user.logo`. Public trusted-client images have an explicit cross-origin image policy, narrowly scoped GET authentication bypasses, and versioned URLs after logo changes. Upload formats are checked before saving.

Successful admin mutations create notifications for active administrators and employees, plus the acting administrator. Existing order, listing and account notifications continue to reach affected customers. Failed changes, reads, validation and zero-row imports do not produce activity notifications. Staff activity details are not broadcast to every customer.
