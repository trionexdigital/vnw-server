Run `20261011_corporate_delivery_dealer_ui_sqlyog.sql` against the existing database before deploying this API. Back up the database and pause API writes while running it. The file is re-runnable and preserves inventory, purchase IDs, payment IDs and audit history.

Corporate Numbers uses `/site/corporate-packs` with `pack_type`, `size`, and optional `category_slug`. Supported sizes are 10, 20, 50, 75, 100, 150 and 200. Complete packs are generated from available public RTP/RTA inventory. Family Packs retain their separate 2–10 size range. The existing transactional `/cart/add-many` supports both.

Configure confirmed service areas in **Admin → Home Delivery Cities**. The admin-only list/save/delete APIs live under `/admin/delivery-cities`; the public `/site/delivery-cities` endpoint returns only active entries in display order. Highlighting is independent of visibility. No unverified cities are seeded.

Dealer accounts are created through **Admin → Dealers → Create Dealer**. Purchase selectors search those actual dealer users by name, email and phone, including a creation link at the bottom of the options. The supplier-only creation endpoint is retired. Supplier ledger records use a unique `dealer_user_id`; names can be duplicated.

The migration links old suppliers only when email/phone uniquely identifies one existing dealer. Unmatched historical suppliers are retained and listed at the end of the SQL output. Use **Admin → Dealers → Link historical suppliers to dealer accounts** to choose the correct dealer. Linking keeps purchase/payment/event IDs and amounts; it combines references in a transaction and archives the old label without deleting history.

Public pages always use the light theme. The saved admin theme remains available in the administrator's profile Appearance settings; no header or public login/register toggle is shown. Layout and navigation changes require no SQL data changes.

Validation: run the backend TypeScript build and `dist/server/pixels/api/site/storefrontUpgrade.test.js` alongside existing marketplace, cart and dealer-purchase tests. Run the frontend build, theme/card tests, and `e2e/storefront-admin-upgrade.spec.ts`. Browser API fixtures isolate visual checks from production data.
