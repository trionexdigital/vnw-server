# PIN-based RTA discovery deployment

1. With the application database selected, run `20261018_rta_location_sqlyog.sql` in SQLyog before deploying the API and UI. The script is safe to rerun; it does not change existing numbers, stock, prices, orders or readiness. New installations include the tables through `schema/apply_all.sql`.
2. Apply the regenerated `20261013_storefront_languages_sqlyog.sql` to register the new source messages and bundled translations. Existing administrator translations remain intact. Bundled local packs also include the new translations.
3. Deploy the updated server and UI together. Existing RTA numbers without serviceable PIN assignments remain available through **Show all numbers**, but do not match a visitor's PIN. Edit these numbers in Numbers Inventory to assign service areas. CSV/XLSX imports and exports use `serviceable_pin_codes`, with semicolon-separated PINs such as `400001;400002`.

## GPS configuration

`NOMINATIM_BASE_URL` defaults to `https://nominatim.openstreetmap.org`; `NOMINATIM_USER_AGENT` defaults to `VIPNumberWorld/1.0 (https://vipnumberworld.com)`. Keep an identifying application URL/contact in this header. Set these server environment values and restart the API to switch to another compatible Nominatim host without rebuilding the application.

The public service has limited donated capacity: use it only for moderate, user-triggered lookups, with an absolute application-wide maximum of one upstream request per second. Do not add background lookups, autocomplete or bulk geocoding. Review the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). The implementation uses an atomic MySQL throttle shared by all API processes (1.1 seconds between request reservations), hashed rounded-coordinate cache keys, 24-hour successful results, five-minute no-PIN results and no automatic retries. All replicas must use the same application database. The location popup displays OpenStreetMap attribution and explains that approximate coordinates are sent to OpenStreetMap.

GPS requires HTTPS, except on localhost. Visitors confirm detected PINs before saving and can always enter them manually. Service unavailability, a busy throttle, missing postcode or non-Indian result leaves the previous saved PIN unchanged. Coordinates are not recorded in customer profiles or application logs.

## Browsing behavior and checks

The device stores `vnw_pin_code` and `vnw_location_prompt_seen` in local storage. The current tab stores `vnw_show_all_rta` in session storage. These preferences do not modify account or checkout addresses. A changed PIN clears the show-all override and resets RTA pagination.

Check `/` and `/shop?rtp_status=RTA` with a matching PIN, a nonmatching PIN, no PIN and the explicit show-all override. Ordinary catalog, featured, deal, pack, preview and similar-number discovery excludes RTA. Details, cart, saved selections, orders and authorized inventory remain usable.

Automated verification:

```powershell
# vnw-server
node node_modules/typescript/bin/tsc --build
node --test dist/server/pixels/api/numbers/rtaDiscovery.test.js dist/server/pixels/api/site/locationPincode.test.js
# vnw-ui
node node_modules/vitest/vitest.mjs run test/LocationProvider.test.tsx
node scripts/run-e2e.mjs e2e/rta-location.spec.ts --output=../output/rta-location-verified
```

GPS tests mock the upstream provider. Production database migration and real-device GPS checks are deployment checks, separate from the mocked browser/API suite.
