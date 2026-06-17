# patchright-difz

Drop-in Patchright wrapper. Handles Cloudflare Turnstile automatically and moves the mouse like a real person.

> **⚠️ Authorized Use Only**
> This package is designed for **legitimate automated testing, security research, and authorized penetration testing** of systems you own or have explicit permission to test. Bypassing Cloudflare Turnstile without authorization may violate the [Computer Fraud and Abuse Act](https://en.wikipedia.org/wiki/Computer_Fraud_and_Abuse_Act) and Cloudflare's Terms of Service. You are solely responsible for complying with all applicable laws and obtaining proper authorization before use.

## Install

```bash
npm install patchright-difz
```

## Basic Usage

```ts
import { chromium } from "patchright-difz";

const browser = await chromium.launch({
  headless: false,
  channel: "chrome",
  turnstile: true, // auto-solve turnstile widgets on all pages
});

const page = await browser.newPage();
await page.goto("https://example.com");
// Turnstile widgets are solved automatically as they appear
```

Persistent context works too:

```ts
const context = await chromium.launchPersistentContext("./profile", {
  headless: false,
  channel: "chrome",
  viewport: null,
  turnstile: true,
});
```

All evaluate calls run in the main world by default so your data extraction scripts work normally. If you need the isolated world, pass `true` as `isolatedContext`.

Headless mode automatically patches the user agent so it doesn't say `HeadlessChrome`. Set `PATCHRIGHT_DIFZ_HEADLESS_USER_AGENT=0` to disable.

## Turnstile Config

```ts
turnstile: {
  intervalMs: 500,       // how often to check for new widgets
  foreground: true,      // bring tab to front before clicking
  clickCooldownMs: 5000, // wait between retries
  logger: console.error, // see what's happening
}
```

### Multi-Widget Support

The solver handles **any number of Turnstile widgets** on the same page, even
if they appear one-by-one over time (e.g., after form submissions or dynamic
content loads). It uses a **persistent watcher** that:

1. **Scans the DOM** for Turnstile widgets (iframes, empty 300px divs,
   `cf-turnstile-response` inputs)
2. **Clicks each unchecked widget** using realistic mouse movements
3. **Tracks token count** to avoid re-clicking already-solved widgets
4. **Continues watching** until the page closes — new widgets are detected
   and solved automatically via `MutationObserver`, history events, and
   periodic polling

This means you don't need to call anything manually for multi-step flows:

```ts
await page.goto("https://example.com/form");
// Widget 1 appears → auto-clicked ✓

await page.fill("#field", "value");
await page.click("#next-step");
// Widget 2 appears after navigation → auto-clicked ✓

await page.click("#submit");
// Widget 3 appears on submit → auto-clicked ✓
```

### Counting Tokens

If you need to check how many widgets have been solved:

```ts
import { countTurnstileTokens } from "patchright-difz";

const count = await countTurnstileTokens(page);
console.log(`${count} Turnstile widgets solved`);
```

This counts every unique `cf-turnstile-response` value in the DOM, so each
solved widget contributes 1 to the count.

### Managed Challenge Detection

Cloudflare managed challenge pages ("Just a moment...") are detected via
URL parameters (`__cf_chl_rt_tk`) and page content. When a challenge is
detected, the solver:

1. Tries to click any Turnstile checkbox on the challenge page itself
2. Polls for the `cf_clearance` cookie (up to 45s)
3. Monitors URL/title changes that signal challenge resolution
4. Resumes normal widget scanning once the challenge passes

No CDP (Chrome DevTools Protocol) sessions are created for monitoring —
the solver uses cookie polling and DOM checks to avoid detectable signals.

## Real Cursor

Every page gets `page.realCursor` and `page.realClick`. The cursor follows Bézier curves with hand tremor, wind drift, micro-corrections, and overshoot on long moves. Click timing uses Gaussian distribution instead of uniform random.

```ts
await page.realClick?.("#submit");

const cursor = page.realCursor!;
await cursor.click("#submit");
await cursor.click({ x: 640, y: 360 });
await cursor.doubleClick(".item");
await cursor.move("#menu");
await cursor.moveTo({ x: 100, y: 200 });
await cursor.moveBy({ x: 50, y: -20 });
await cursor.scroll("#feed", { deltaY: 600, steps: 8 });
await cursor.drag("#handle", "#dropzone");
await cursor.hover("#tooltip", { duration: 800 });
await cursor.mouseDown();
await cursor.mouseUp();
```

### Move Options

| Option | Default | What it does |
|---|---|---|
| `moveSpeed` | `1.0` | Speed multiplier |
| `jitter` | `1.5` | Hand tremor (px) |
| `windStrength` | `0.25` | Lateral drift |
| `microCorrections` | `true` | Sub-pixel nudges on arrival |
| `overshootThreshold` | `500` | Overshoot distance (px) |
| `paddingPercentage` | `20` | Edge padding for click point |

### Click Options

| Option | Default | What it does |
|---|---|---|
| `button` | `"left"` | Mouse button |
| `clickCount` | `1` | Number of clicks |
| `hesitate` | `0` | Pre-click pause with tremor (ms) |
| `delay` | ~85ms | Hold time between down/up |

### Scroll / Drag / Hover

```ts
await cursor.scroll("#feed", { deltaY: 600, steps: 8, easing: "ease-out" });
await cursor.drag(".card", ".trash", { dragDelay: 100 });
await cursor.hover("nav a", { duration: 600 });
```

### Debug Overlay

```ts
import { installMouseHelper } from "patchright-difz";
await installMouseHelper(page); // shows a dot following the cursor
```

## Stealth & Anti-Detection

The browser is patched against common automation fingerprinting checks:

| Signal | Protection |
|--------|-----------|
| `navigator.webdriver` | Hidden via `Navigator.prototype` getter — returns `undefined`, `"webdriver" in navigator` → `false` |
| `window.chrome` | Full emulation: `runtime.connect/sendMessage/onMessage`, `csi()`, `loadTimes()` with realistic timing |
| WebGL vendor/renderer | Spoofed to `"Google Inc. (Intel)"` / `"Intel Iris OpenGL Engine"` |
| `WEBGL_debug_renderer_info` | Extension kept accessible (not nulled) — only blocked in cross-origin iframes on real browsers |
| Canvas fingerprint | 2-3% subtle pixel perturbation per `toDataURL()` call |
| AudioContext fingerprint | Subtle channel noise on oscillator connect (1% chance) |
| Launch args | No `--disable-web-security`, `--no-sandbox`, or `--disable-gpu` — real browser defaults |

## Cloudflare Helpers

```ts
import {
  hasTurnstile,
  isTurnstileSolved,
  countTurnstileTokens,
  isCloudflareManagedChallenge,
  getCloudflareData,
} from "patchright-difz";

await hasTurnstile({ page });
await isTurnstileSolved({ page });
await countTurnstileTokens(page);
await isCloudflareManagedChallenge({ page });

const data = await getCloudflareData({ page });
// data.sitekeys, data.cloudflareCookies, etc.

> **Note:** Turnstile token values and `cf_clearance` cookie values are
> automatically stripped from responses. This is intentional to prevent
> abuse and satisfy supply-chain security requirements.
```

## Cleanup

```ts
import { clearBrowserArtifacts, clearSessionArtifacts } from "patchright-difz";

await clearSessionArtifacts({ context }); // cookies, storage, headers
await clearBrowserArtifacts({ context, page }); // + cache, service workers
```

## Alias

```bash
npm install patchright@npm:patchright-difz
```

Then just `import { chromium } from "patchright"`.
