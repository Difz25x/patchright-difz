# Stealth & Turnstile Anti-Detection Overhaul

**Date:** 2026-06-17
**Author:** Difz25x
**Status:** Approved Design

## Problem Statement

`patchright-difz` is detected by Cloudflare Turnstile's managed challenges at
`turnstile.zeroclover.io/token`. The checkbox fails to click, and the browser
is flagged as automated. Two root causes:

1. **Launch args & stealth script** leak automation signals that Cloudflare
   actively checks (especially `--disable-web-security`).
2. **Turnstile detection strategy** has too much overhead and wrong priorities.

## Scope

Three files changed, one file created:

| File | Change |
|------|--------|
| `src/stealth.ts` | Clean launch args, rewrite stealth script |
| `src/turnstile.ts` | Reorganize click priority, remove heavy guards |
| `docs/superpowers/specs/2026-06-17-stealth-turnstile-design.md` | This spec |

No new dependencies. No breaking API changes.

---

## 1. Launch Args — Remove Red Flags

### Current

```ts
export const STEALTH_LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-web-security",      // ❌ BOT MAGNET
  "--no-sandbox",                // ❌ AUTOMATION INDICATOR
  "--disable-gpu",               // ❌ AUTOMATION INDICATOR
];
```

### New

```ts
export const STEALTH_LAUNCH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  // --disable-web-security  removed — no real browser has this
  // --no-sandbox            removed — real browsers always sandbox
  // --disable-gpu           removed — real browsers use GPU
];
```

Users who need these (Docker, CI) can pass them manually via
`chromium.launch({args: [...]})`.

---

## 2. Stealth Script — Navigator & Chrome Runtime

### 2a. `navigator.webdriver` — Proxy Hiding

**Current:** `delete` + `defineProperty` — property descriptor still differs
from real browser (real browser has no `webdriver` property at all).

**New:** Proxy `navigator.__proto__` so that:

- `navigator.webdriver` → `undefined`
- `'webdriver' in navigator` → `false`
- `Object.getOwnPropertyDescriptor(navigator, 'webdriver')` → `undefined`

Indistinguishable from a real browser.

### 2b. `window.chrome` — Complete Emulation

**Current:** Partial `chrome` object — `chrome.runtime.connect` returns a
static object, hardcoded extension ID.

**New:** Full emulation matching real Chrome behavior:

| Property | Emulation |
|----------|-----------|
| `chrome.runtime.connect` | Returns `{onMessage, postMessage, disconnect}` |
| `chrome.runtime.sendMessage` | No-op function |
| `chrome.runtime.onMessage` | Event with `addListener`/`removeListener` |
| `chrome.runtime.onConnect` | Event with `addListener`/`removeListener` |
| `chrome.csi()` | Returns `{onloadT, startE, ...}` |
| `chrome.loadTimes()` | Returns detailed nav timing |
| `chrome.app` | `{isInstalled: false}` |

### 2c. WebGL — Smart Spoof

**Current:** Returns `null` for `WEBGL_debug_renderer_info` extension —
suspicious (real browsers only block this in cross-origin iframes).

**New:** Keep extension accessible, spoof return values:

- `UNMASKED_VENDOR_WEBGL` (37445) → `"Google Inc. (Intel)"`
- `UNMASKED_RENDERER_WEBGL` (37446) → `"Intel Iris OpenGL Engine"`
- Add subtle float noise (~0.0001) to
  `getParameter(FRAGMENT_SHADER_DERIVATIVE_HINT)`

### 2d. Canvas / Audio Noise

- Canvas `toDataURL`: 2-3% subtle pixel perturbation (up from ~1%)
- AudioContext: keep existing subtle channel noise

### 2e. What Stays Unchanged

- Languages (`["en-US", "en"]`)
- PluginArray / MimeTypeArray emulation
- Hardware concurrency (random 4-8)
- Platform normalization
- Connection (4g)
- Screen color/pixel depth
- Permissions API overrides

---

## 3. Turnstile Click — New Priority Order

### Current Strategy (too slow, wrong order)

1. Selector-based (try iframes, locators, check frame readiness)
2. Empty 300px div detection
3. Parent of `[name="cf-turnstile-response"]`
4. Generic fallback

### New Strategy (fast path first)

```
Priority 1: [name="cf-turnstile-response"] parent → click x+30
Priority 2: Empty 300×65px div → click x+30
Priority 3: Selector-based iframe/locator → existing logic
Priority 4: Generic fallback → size-matching divs
```

**Key changes from existing code:**

1. **Prioritise `cf-turnstile-response` parent** — most reliable signal.
   Proven by puppeteer-real-browser. Click at `x+30, y+height/2`.
2. **Remove `isTurnstileFrameReady()`** — heavy `waitForSelector` calls with
   600ms/2000ms timeouts delay the click pipeline. Turnstile widgets don't need
   iframe readiness checks for checkbox clicking.
3. **Always use `realCursor.click()`** — the existing cursor (Bezier curves,
   Fitts law, tremor, wind, micro-corrections) is retained as-is. Not replaced
   with `page.mouse.click()`.
4. **Remove `page.bringToFront()` / `window.focus()`** — calling focus is not
   human-like. Let the page stay in whatever state it is.
5. **Coordinates always `x+30`** — the checkbox is exactly 30px from the left
   edge of the widget div.

### Managed Challenge Wait

When a managed challenge page is detected (JS computation challenge):

1. **Poll `cf_clearance` cookie** every 600ms (cookie-only, no CDP session)
2. **Check URL/title change** every 600ms
3. **Timeout** at 45s
4. No CDP `Network.responseReceived` listener — cookie polling is reliable
   enough and avoids the detectable CDP session.

---

## 4. Cursor Behavior — Retained As-Is

The existing `RealCursor` implementation is untouched:

- Bezier curve paths with asymmetric control points
- Fitts law timing (distance-based velocity)
- Tremor (Gaussian jitter on perpendicular axis)
- Wind effect (brownian motion along path)
- Micro-corrections (overshoot + settle)
- Hesitation / idle jitter before clicks
- Sub-pixel click coordinates

These are mature and not the cause of the detection issue. No changes needed.

---

## 5. Files Changed (Detailed)

### `src/stealth.ts`

- Clean `STEALTH_LAUNCH_ARGS` (remove `--disable-web-security`,
  `--no-sandbox`, `--disable-gpu`)
- Rewrite `STEALTH_SCRIPT`:
  - Proxy-based `navigator.webdriver` hiding
  - Complete `window.chrome` runtime emulation
  - WebGL: keep extension, spoof values to Intel
  - Canvas noise: 2-3%
  - Keep all existing patches that are not listed as problems

### `src/turnstile.ts`

- Reorder `solveTurnstileOnce` priority:
  1. Parent of `cf-turnstile-response` (moved up from #3)
  2. Empty 300px div (kept at #2)
  3. Selector-based locators (moved down from #1)
  4. Generic fallback (kept at #4)
- Remove `isTurnstileFrameReady()` and all call sites
- Remove `page.bringToFront()` / `window.focus()` calls
- Remove CDP network monitor setup from `watchTurnstilePage` (managed
  challenge wait uses cookie polling only)
- Simplify click coordinates to `x+30` for checkbox clicks

---

## Non-Goals

- Adding new npm dependencies
- Changing the public API or exports
- Adding external CAPTCHA solving services (NopeCHA, 2captcha, etc.)
- Refactoring cursor.ts, mainWorld.ts, headless.ts, or artifacts.ts
- Changing TypeScript configuration
- Performance optimization of unrelated code

## Side Effects / Migration

- Existing users who relied on `--disable-web-security` or `--no-sandbox`
  auto-injection will need to pass them explicitly in their launch options.
  These flags are still available via `STEALTH_LAUNCH_ARGS` export for
  reference, but no longer auto-injected.
