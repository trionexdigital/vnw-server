# Cashfree sandbox setup

The application now uses Cashfree for regular checkout, pre-book payments and approved pre-book refunds. The supplied CSV credentials are installed in the backend `.env`, which is ignored by Git. The frontend receives only a short-lived checkout session and the environment; it never receives the App ID or Secret Key. Sandbox is selected. No live payments were made.

## 1. Apply the database change manually

Stop the API, back up the `vipnumberworld` database, then open `database/migrations/20261001_payment_history_checkout_sqlyog.sql` in SQLyog and execute the complete script against that database. This upgrade includes Cashfree, checkout billing columns and payment history. The older Cashfree-only script does not include the billing repair or payment history.

If the earlier storefront changes have not been applied, use the updated `database/migrations/20260930_all_storefront_changes_sqlyog.sql` instead: it includes those changes, Cashfree and the payment-history upgrade at the end. You do not need to run both. No migration runs automatically. See `PAYMENT_HISTORY_SETUP.md` for verification and the admin analysis screen.

The migration renames provider-specific fields without deleting historical orders, payments or refunds. Existing gateway references are marked `LEGACY`; the old provider remains only in migration compatibility checks. Historical payments cannot be refunded through Cashfree and need review through their original provider.

## 2. Cashfree dashboard: keep Test Environment selected

1. Sign in to the [Cashfree Merchant Dashboard](https://merchant.cashfree.com/) and open **Payment Gateway**.
2. Keep **Test Environment** selected, as shown in your screenshot. Do not choose **Switch to Prod**.
3. Open **Developers → API Keys**. Your existing test App ID/Secret Key pair is already saved locally, so you do not need to generate another pair.
4. If you regenerate the keys later, replace `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` in the backend `.env` and restart the API. The same secret verifies webhook signatures; there is no separate webhook secret in this integration.

Official reference: [API authentication](https://www.cashfree.com/docs/api-reference/authentication).

## 3. Prepare the website and public callback addresses

The local frontend address is currently `http://localhost:5173`. Cashfree cannot deliver webhooks to your computer's localhost. For a complete sandbox test, use a public HTTPS staging website/API or HTTPS tunnels to the frontend on port 5173 and API on port 3002. Keep both available throughout the test.

Change only these URL values in backend `.env`, using your actual public addresses:

```dotenv
CASHFREE_ENV=sandbox
CASHFREE_RETURN_BASE_URL=https://your-store-test-domain
CASHFREE_WEBHOOK_URL=https://your-api-test-domain/vipnumberworld/payments/cashfree/webhook
```

The return URL is built by the backend as `https://your-store-test-domain/payments/return?order_id=<local-order-id>`. Do not put the webhook address in the return-base setting. Set `VITE_API_BASE_URL=https://your-api-test-domain/vipnumberworld/` in the frontend environment to reach the same test API; restart the frontend/rebuild it after changing this public URL. Never put payment keys in frontend environment variables. Configure your hosting to serve the app for `/payments/return` so refresh/deep links work. Restart the API after changing its `.env`.

For hosted checkout, open **Payment Gateway → Developers → Whitelisting → Add New → Website URL** and enter the actual frontend website origin, then **Proceed → Confirm & Proceed**. Follow the dashboard's approval status. Cashfree's production whitelisting guidance requires HTTPS, no custom port, visible contact information, terms, refund policy and INR product pricing; it does not accept test domains for production approval. Keep this integration in sandbox. If whitelisting is unavailable in your test account, use Cashfree support's approved sandbox origin rather than treating localhost as an approved production site.

Official references: [Website whitelisting](https://www.cashfree.com/docs/payments/online/go-live/whitelist), [Hosted web checkout](https://www.cashfree.com/docs/payments/online/web/redirect), [Testing webhooks with a local tunnel](https://www.cashfree.com/docs/payments/online/webhooks/overview).

## 4. Cashfree dashboard: add the webhook

1. Open **Payment Gateway → Developers → Webhooks**.
2. Choose **Add Webhook Endpoint**.
3. Enter exactly `https://your-api-test-domain/vipnumberworld/payments/cashfree/webhook`.
4. Choose webhook version **2025-01-01** to match this integration.
5. Select **Test**. The updated API must be running with the test secret. Then select **Next**.
6. Select **Success Payment**, **Failed Payment**, **User Dropped Payment**, and **Refund**.
7. Select **Add Webhook**. Use webhook logs to inspect deliveries and resend failed notifications after fixing connectivity.

Cashfree supports HTTP/HTTPS callback endpoints in sandbox; this integration uses public HTTPS for its configured callback. Signature verification is mandatory: missing or invalid signatures return 401. Processing failures return 503 so Cashfree can retry; processed events return 200. A signed dashboard test referencing an unknown test order is acknowledged without changing inventory.

Official references: [Dashboard webhook steps](https://www.cashfree.com/docs/payments/online/webhooks/configure), [Signature verification](https://www.cashfree.com/docs/payments/online/webhooks/signature-verification), [Refund event payload](https://www.cashfree.com/docs/api-reference/payments/latest/refunds/webhooks).

## 5. Run the sandbox checkout test

1. Restart the updated backend and frontend after applying SQL and configuring URLs. Ensure your test user has a valid phone number in their profile.
2. Choose an available number, review the GST/coupon/offer-price billing, and select the payment button. Cashfree hosted checkout should open in sandbox mode.
3. Use Cashfree's sandbox test UPI ID `testsuccess@gocash` for success and `testfailure@gocash` for failure. Use only the test credentials from [Cashfree sandbox test data](https://www.cashfree.com/docs/payments/online/resources/sandbox-environment); do not use real payment details.
4. After returning, the app checks payment directly with Cashfree. An order is completed only when Cashfree reports a paid order and a successful matching INR payment. Check your account and Cashfree dashboard for the confirmed order. If your login expires during checkout, sign in again; the payment-return address is preserved.
5. Repeat with a failed payment or close checkout. The order stays pending so you can retry the same session using **Continue payment** on the return screen. The unpaid reservation expires after 20 minutes. New Cashfree sessions require more than 15 minutes remaining, so the API blocks session creation when less than 16 minutes remain; an existing active session can still be resumed.
6. Test pre-book payment, request a refund within the existing policy, then approve it in **Admin → Pre-books**. A pending refund has **Check status**. Timeouts retain the same refund reference and idempotency key. Only Cashfree's confirmed refund success marks the booking refunded.
7. Resend a payment webhook from Cashfree logs: it must not fulfil inventory or issue a refund twice. Also verify failed attempts do not cancel a subsequently paid order.

Cashfree requires expiry **more than 15 minutes** ahead; this was verified against the sandbox API. The 20-minute reservation is shared with the provider expiry. A payment received after inventory has been released is recorded as **REVIEW** and alerts the customer/admin; it cannot sell inventory already assigned to another customer. Admin should reconcile such payments and, if needed, issue a refund from Cashfree's dashboard.

## Verification completed here

- Both TypeScript checks and builds passed, along with 22 backend tests, 8 UI tests and 5 browser tests. Browser checks cover regular/pre-book sandbox checkout, desktop/mobile payment return, resuming an unpaid session, and logging back in after checkout session expiry. These tests do not apply SQL or charge payments.
- The supplied credentials were accepted by the sandbox API.
- A separate ₹100 sandbox test order was created, fetched, and retried with the same idempotency key; the same gateway order was returned, a checkout session was present, and no payment was attempted. It does not exist in the application database and expires automatically.
- Full application payment/refund settlement testing remains dependent on your manual SQL migration and public callback/website configuration.

## Implementation endpoints

Authenticated API endpoints:

- `POST /vipnumberworld/payments/cashfree/create-order` with `{ "order_id": 123 }`.
- `POST /vipnumberworld/payments/cashfree/verify` with `{ "order_id": 123 }`.

Cashfree callback:

- `POST /vipnumberworld/payments/cashfree/webhook` with Cashfree's original JSON body, `x-webhook-signature` and `x-webhook-timestamp` headers.

The backend computes the amount from the stored billing snapshot, checks ownership and environment, matches currency/reference/amount, verifies the raw-body HMAC with constant-time comparison, and uses row locks plus a unique payment-attempt index for repeated confirmations. Axios exceptions containing credential headers are sanitized before leaving the gateway client. The old provider's endpoints, SDK, browser script, environment keys and active UI references are removed.

Do not switch to production for these tests. A later production rollout needs approved domains/account activation, production credentials, separately configured production webhooks and new production orders. Sandbox and production records are intentionally separated.
