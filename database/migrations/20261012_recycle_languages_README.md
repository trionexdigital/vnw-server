# Custom languages and inventory Recycle

The language system is owned by this application. It uses checked-in translation catalogs and administrator-managed translations in MySQL. There is no external translator, translation credential, automatic machine translation, or per-character charge. Visitors' text, form values and identity details are never sent to a translation provider.

## Install

For all requested marketplace, dealer, delivery, Recycle and language changes, run `20261012_all_requested_changes_sqlyog.sql` after the existing baseline/payment migrations. It is self-contained and re-runnable. If the earlier requested changes are already installed, run **only** `20261013_storefront_languages_sqlyog.sql` with the application database selected. Deploy the updated API and UI together. No live database migration was executed during implementation.

The new migration creates `language_sources` and `language_translations`, registers the source-text manifest, and seeds locally authored common interface translations. `INSERT IGNORE` preserves existing administrator edits on repeated runs. It neither deletes inventory nor changes users. Fresh installations can use `database/schema/apply_all.sql`, which includes the language seed migration. An old deployment's unused translation cache may remain in its database; the application no longer reads or writes it. No destructive cache cleanup is required.

## Visitor language selection

The first visit offers English, Hindi, Marathi, Hinglish, Gujarati, Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam and Odia. `vnw_language` remembers the choice; the language-name button reopens the chooser. A supported `?lang=ml` selects Malayalam while preserving other query parameters. Admin, dealer and employee consoles remain in English. Store pages, customer account pages, authentication, legal pages, dialogs, labels, accessible descriptions and later-loaded content share the same catalog resolver. Image artwork remains unchanged.

Local packs contain navigation, shopping and account controls, home sections, journey descriptions, search controls and policy headings in all 11 translated languages. **The bundled catalogs still have coverage gaps, including long legal paragraphs.** All discovered public source strings are registered for editing. Missing copy retains English and is counted in the admin editor. Fully translating each screen requires supplying and publishing its remaining translations. New editorial content also needs an administrator-provided translation. Hinglish is authored directly, rather than mechanically romanized from another service.

The JSX adapter renders translated strings through React, including motion components, links, Radix dialogs/selects, and portals. It never mutates text nodes or replaces children after React commits. Native `tr` and `option` identity is retained for the responsive table and select adapters. Browser automatic translation is disabled to prevent competing DOM rewrites. Locale changes do not remount account routes, clear search drafts or refetch an unchanged inventory filter. Header geometry and drawer breakpoints are identical across languages.

The local packs work while the app API is temporarily unavailable. Published edits are fetched only from the application's `/site/languages/catalog` endpoint using a language code and the application's normal API authorization header. No rendered fragments or user values are uploaded. Switching languages, loading the page again, or returning focus to the window refreshes published edits. Numbers, prices, emails, form values and elements marked `translate="no"` or `data-private` retain their original content.

## Admin workflow

Open **Admin → Languages** (`/admin/languages`). Choose the target language, search by English copy or page, or filter missing translations. The counters show registered sources, published translations, missing translations and unpublished drafts.

1. Edit a source string and save its translation as a draft. The storefront continues showing its previous published translation.
2. Use **Refresh storefront content** after editing FAQs, banners, delivery descriptions, lucky picks or public inventory title labels. Offline and recycled inventory labels are excluded. Use **Add text** for other dynamic content or named templates.
3. Review drafts, then **Publish drafts** and confirm. Concurrent changes invalidate the publication version and require a reload. Individual edits also check their revision to prevent overwriting another editor.
4. Export a language JSON file to translate offline, then import it into the same target language. Import previews the entries and requires confirmation. Imports save drafts without publishing and are transactional: any validation failure rolls back the import. Duplicate normalized sources, unsupported locales and incorrect placeholders are rejected.

The export format is:

```json
{
  "format": "vnw-language-v1",
  "language": "hi",
  "entries": [
    { "source": "Home", "translation": "होम" },
    { "source": "{count} numbers", "translation": "{count} नंबर" }
  ]
}
```

Keep named placeholders exactly unchanged, including their occurrence count. Named templates match numeric values automatically. Use `t(source, values)` or `LanguageText` for category names and other variable text; values are interpolated after translation. Literal markup is displayed as text. Entries accept up to 32,000 characters; imports accept up to 5,000 entries and 2,000,000 total text characters. An empty draft removes a published override on publication; a bundled translation or English source is used instead. English is the original source and is edited in the underlying content screen or application source.

Every management endpoint is behind the existing database-verified ADMIN guard. The endpoints are `/admin/languages/list`, `/save`, `/import`, `/export`, `/publish` and `/sync-content`. The previous fragment-translation endpoint has been removed.

## Maintaining bundled catalogs

Read `vnw-ui/LANGUAGE_RULES.md` before changing public copy. Root `AGENTS.md` also links these rules for future work. Edit `vnw-ui/src/shared/language/catalog.tsv` for common copy and `storefront.tsv` for page copy. Columns are English followed by Hindi, Marathi, Hinglish, Gujarati, Bengali, Punjabi, Tamil, Telugu, Kannada, Malayalam and Odia. From `vnw-ui`, run:

```powershell
node scripts/build-language-manifest.mjs
node scripts/build-language-catalogs.mjs
node scripts/audit-language-catalogs.mjs
```

These scripts regenerate the public source manifest, per-language JSON packs, backend baseline catalog, standalone language migration and combined migration. Both repository folders must be present. Regenerate after changing English public copy, review the resulting source manifest, then deploy the generated artifacts. Applying the updated seed migration registers new strings without replacing existing translations.

## Inventory workflow

Admin → Numbers → **Delete** accepts up to 1,000 comma/newline-separated numbers. Validate reports invalid entries, duplicates, missing numbers, existing recycled numbers, protected reservations/pre-books and the eligible list. Confirmation moves eligible numbers into Recycle and retains their previous status/stock. A changed inventory invalidates the validation token.

**Recycle** opens `/admin/numbers/recycle` with the shared table and server pagination. Select rows individually, select the current page or deselect all. Restore returns previous status/stock. Permanent deletion is available only in Recycle and needs confirmation. Numbers linked to orders, pre-books or dealer purchases cannot be purged; audit snapshots survive removal.

## Verification

TypeScript builds, unit checks and browser checks cover the custom catalogs, all language choices, private data preservation, lazy content, offline behavior, draft/publication workflow, stale revisions, transactional imports, responsive cards, sidebar interactions and inventory Recycle. API responses in browser tests and database calls in service tests are mocked; deployment database execution still needs verification. Browser evidence is saved under `output/verification-custom-languages*` in the workspace.
