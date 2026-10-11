# Recycle, language selection and sidebar update

For one file covering both sets of requested changes, run `20261012_all_requested_changes_sqlyog.sql` against the application database after the existing baseline/payment migrations. It combines the corporate/delivery/dealer migration and this Recycle/language migration. If the corporate/delivery/dealer update is already installed, you can instead run only `20261012_recycle_languages_sqlyog.sql`. The SQL is re-runnable. Back up the database and pause inventory writes while applying it. Deploy the API and UI together after the migration; older database schemas do not support the new inventory queries. No live database changes have been made by this task.

The migration adds four inventory deletion fields, an index, durable translation caching, and independent recycle audit snapshots. It does not delete or recycle existing numbers. Fresh installations use the updated `database/schema/apply_all.sql` and schema files.

## Configure translation

Enable Google Cloud Translation in a billed Google Cloud project, create an API key, restrict it to the Cloud Translation API and the API server's outbound IP where practical, and set these **backend-only** environment variables:

```dotenv
GOOGLE_TRANSLATE_API_KEY=your_key_here
GOOGLE_TRANSLATE_DAILY_CHAR_LIMIT=1000000
```

Restart the API after changing its environment. Never put this key in a `VITE_` variable, frontend file, SQL, or chat. The service uses [Google Cloud Translation Basic v2](https://docs.cloud.google.com/translate/docs/basic/translating-text), with English as the source. Google configuration and a real provider response still require verification with your key; automated tests mock the provider.

English, Hindi, Marathi, Hinglish, Gujarati, Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam and Odia are offered on the first visit. The choice is remembered in `vnw_language` and can be changed with the globe button. `?lang=ml`, for example, selects Malayalam without clearing other query parameters. Every public route, lazy content, legal paragraphs, dialogs, text labels and accessible labels use the selected language. Admin, employee and dealer consoles retain English. Text embedded in image assets and the official logo remains part of the original artwork.

Hinglish uses Google Hindi translation followed by local phonetic romanization and common interface phrase overrides. It is romanized Hindi; it does not use Google's Advanced romanization endpoint, which requires a different authentication setup. Machine translated legal/content text should be reviewed before relying on its wording.

The key travels only from the API server to Google. Requests accept at most 40 fragments / 12,000 characters; each fragment is bounded to 3,000 characters. Per-process limits allow 60 requests / 100,000 uncached characters per client per minute and the configured number of uncached characters per UTC day. Configure Google project quotas too, especially with multiple API processes, where in-memory limits are separate. Database caching prevents billing again for unchanged text/locale pairs. Visitors see a retry/English fallback if translation is unavailable. Private identity elements and form values are excluded; telecom numbers, prices, readiness codes, emails and URLs are preserved.

## Inventory workflow

From Admin → Numbers, **Delete** accepts up to 1,000 numbers separated by commas or newlines. Validate reports invalid entries, duplicates, missing numbers, already recycled numbers, protected reservations/pre-books, and the exact eligible list. Confirmation moves only eligible numbers to Recycle, removes their shopping references and preserves the previous status/stock. A changed inventory invalidates the validation token and requires another validation.

**Recycle** opens `/admin/numbers/recycle`. It uses the same table and server pagination as inventory. Select rows individually, select the current page, or deselect all. Restore returns the previous status and stock. Permanent deletion requires another confirmation and is available only in Recycle. Numbers referenced by orders, pre-books or dealer purchases cannot be permanently purged; their purchase history and links remain intact. Audit snapshots survive permanent removal. Seller removal endpoints also recycle instead of physically deleting inventory.

The admin sidebar no longer recreates its navigation components on toggle. Its portaled left drawer manages scrolling and focus. Family pack selection circles are 22px with 12px check icons, and the per-number VIP label has been removed.

## Verification

Backend and UI TypeScript builds, unit/regression tests and browser checks cover validation, transactions, stale inputs, restoration, history protection, all 12 language choices, private values, lazy translations, responsive cards, and repeated sidebar open/close. Browser screenshots and logs are under the workspace `output/verification-20261012-final` directory. Google responses and actual SQL execution against your deployment database have not been exercised.
