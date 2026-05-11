# Changelog

## 0.4.1 - 2026-05-12

- Improved Turnstile clicking by bringing the page to the foreground before mouse actions and using stepped mouse movement.
- Reduced auto-solver polling latency and fallback scan time.
- Made `cf-turnstile-response` a secondary signal instead of requiring it for active Turnstile detection.
- Allowed `isTurnstileSolved` to use `cf_clearance` cookie data when response fields are not present.

## 0.4.0 - 2026-05-12

- Added `hasTurnstile` to detect whether a page currently contains Turnstile candidates.
- Added `isTurnstileSolved` to check for populated Turnstile response/token fields.
- Added `getCloudflareData` to collect Cloudflare cookies, clearance cookie,
  Turnstile responses/tokens, sitekeys, widget metadata, challenge fields,
  Ray IDs, and Cloudflare-related storage data.

## 0.3.0 - 2026-05-11

- Fixed headless Chrome data extraction by replacing the default `HeadlessChrome` user agent before the first page request.
- Applied the headless user-agent fix to `launchPersistentContext`, `browser.newContext`, and `browser.newPage`.
- Improved Turnstile candidate detection inside closed shadow roots.
- Reworked fallback clicking to use Patchright locators instead of page-side DOM scans.
- Added shadow-host traversal when walking from hidden challenge inputs to clickable parents.
- Changed `npm run publish` into a GitHub release flow that pushes the version tag and lets GitHub Actions publish to npm.

## 0.2.0 - 2026-05-11

- Fixed Patchright data extraction by defaulting evaluate helpers to the page main world.
- Added `installMainWorldEvaluateDefaults` export for explicit patch installation.
- Updated documentation for main-world evaluate behavior.
- Added `npm run publish` release helper.

## 0.1.0 - 2026-05-10

- Initial release.
- Added Patchright Chromium wrapper.
- Added optional Turnstile auto-click helper.
