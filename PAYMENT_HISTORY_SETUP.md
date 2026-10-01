# Checkout repair and payment history

The checkout error occurred because `orders` was missing the billing snapshot columns, including `mrp_total`. The older Cashfree-only upgrade did not add those columns. The new upgrade includes the gateway changes, missing billing columns, payment metadata and an append-only event ledger.

## Run manually in SQLyog

1. Pause the backend API and take a backup of `vipnumberworld`.
2. Open `database/migrations/20261001_payment_history_checkout_sqlyog.sql` in SQLyog against the existing `vipnumberworld` database.
3. Execute **the entire file**, not just the selected statement. It creates missing financial tables and conditionally adds columns/indexes. Existing order totals and gateway references are preserved. You can run the file again safely.
4. Check the final result: `orders` must contain `mrp_total`, `offer_savings`, `taxable_amount`, `gst_percent`, `gst_amount`, and `payment_events` must be present. Resolve any SQL errors before restarting.
5. Restart the updated backend and refresh the frontend. Retry checkout with an available number. If an old unpaid reservation exists, resume it or let its 20-minute hold expire before creating another checkout.
6. Sign in as an ADMIN and open **Payments** in the sidebar (`/admin/payments`). Sandbox and production are separate selections. This screen is also protected by a server-side database role check; employees and other roles cannot access the data or reconciliation endpoint.

This file is prepared for manual execution only. No migration was executed against your live database during implementation. A full payment against the updated database must be checked after you apply it.

## What is retained

- `orders`: immutable checkout billing snapshot (MRP, offers, coupon, taxable amount, GST rate/amount and total), customer snapshot, reservation expiry, provider/environment, gateway order/payment references and the server-only checkout session required for resuming payment.
- `order_items`: purchased numbers and line prices, seller commissions and fulfilment state.
- `payments`: each gateway attempt, amount/currency, method, state, gateway times, bank reference, gateway message and sanitized payment metadata. Retries update the same unique attempt; they never create a second financial record for the same gateway payment ID.
- `prebookings` and `prebook_refund_requests`: booking lifecycle, refund reasons/amounts, admin review, attempts, merchant refund IDs, gateway results and completion dates.
- `payment_events`: checkout creation, reservation expiry/release, payment session setup/errors, gateway request intent and sanitized results/errors, verification requests/errors, attempt status changes, paid orders, inventory review, admin order changes, refund requests/reviews/status/completion, pre-book fulfilment and webhook deliveries with signature verification outcomes. Request/response and webhook processing steps share a trace ID. Business events are deduplicated; repeated webhook deliveries remain visible.
- Existing wallet, referral and supplier accounting records remain in their own tables.

Gateway intent is persisted before an outbound request. Business events use the same transaction as the corresponding order/refund mutation. Signed webhooks are checked against Cashfree's API; browser status claims cannot mark orders paid. Failed attempts retain the reservation for retry. A late successful payment whose inventory hold was released is flagged for admin review.

Gateway metadata is redacted before storage: API secrets/authorization headers, webhook signatures, payment sessions, CVV, PIN, OTP and payment authentication tokens are excluded. Card/account/UPI identifiers are masked. Full financial secrets should never be stored as payment history. The checkout session remains only in the server's order table and is excluded from the admin history response.

## Reading the analysis

Captured and refunded totals use the recorded payment/refund rows. Captured includes verified payments awaiting inventory review. Net captured is captured less completed refunds; it is not a bank settlement or a total after gateway fees. Date filters select **orders created** in an inclusive IST date range; the amounts belong to that order cohort. Daily bars show the latest 30 dates with matching orders. Payment history pages back through all stored events.

The migration adds a labelled snapshot for existing orders. It does not invent earlier webhook/API history or recalculate previous charged totals. Historical orders without recorded tax breakdowns display their original payable total and a missing-breakdown note. Cashfree attempts on existing Cashfree orders can be refreshed using **Check Cashfree** while the API is configured for that order's environment. Existing gateway API requests made before this upgrade cannot be reconstructed.

Continue using the signed public webhook setup in `CASHFREE_SANDBOX_SETUP.md`. Payment success/failure/drop and refund notifications must reach the backend for history to update even when a buyer closes the browser. Fees, settlements, chargebacks and unrelated dashboard-side refunds are not imported by this checkout integration; the admin totals explicitly exclude settlement accounting.
