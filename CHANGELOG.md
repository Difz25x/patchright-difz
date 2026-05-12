# Changelog

## 0.6.1 - 2026-05-12

- Added a built-in Patchright-compatible real cursor and attached it as `page.realCursor` / `page.realClick`.
- Updated Turnstile clicking to use the built-in real cursor while preserving the existing click-point targeting.
- Removed the Cloudflare-indicator guard before fallback Turnstile box scans.

## 0.6.0 - 2026-05-12

- Added `getCloudflareData({ include })` toggles for cookies, `cf_clearance`, tokens, responses, widgets, iframes, scripts, storage, Ray IDs, challenge fields, challenge options, URL, user agent, and document cookie names.
- Kept Turnstile `sitekeys`, `present`, `solved`, and challenge status fields always available.
- Simplified Cloudflare data output by removing UI-location metadata such as selectors, element IDs, and class names.
- Changed `clearanceCookie` to the `cf_clearance` string value, added `cfClearance` as an alias, and simplified cookie entries to string/number fields.

## 0.5.3 - 2026-05-12

- Added `clearSessionArtifacts` for manual cookies, storage, permission, and extra-header cleanup.
- Added `clearBrowserArtifacts` for session cleanup plus page cache, CDP cache, and service-worker cleanup.
- Exported artifact cleanup option/result types.

## 0.5.2 - 2026-05-12

- Added managed Cloudflare challenge detection for full-page verification screens.
- Paused the Turnstile clicker when a managed challenge is detected instead of fallback-clicking page containers.
- Added `isCloudflareManagedChallenge` and `data.challenge.managed` for diagnostics.

## 0.5.1 - 2026-05-12

- Added Turnstile click cooldown/backoff so the watcher does not repeatedly click while a widget is still processing or reloading.
- Stopped using hidden Turnstile response fields as clickable targets; they remain token/data evidence only.
- Skipped expensive fallback scans on pages without Cloudflare/Turnstile indicators.
- Made page-side watcher signals tolerate exposed functions that return `void`.
- Made Cloudflare data collection tolerate pages where `document.cookie` is blocked.

## 0.5.0 - 2026-05-12

- Changed `checkTurnstile` into a permanent page watcher that returns a cleanup function.
- Updated `installTurnstileAutoSolver` and `turnstile: true` to use the same no-timeout page watcher.
- Added page-side detection signals for DOM mutations, History API URL changes,
  hash/popstate changes, reloads, and load state changes.

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
