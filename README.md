# patchright-difz

Drop-in Patchright wrapper. Handles Cloudflare Turnstile automatically and moves the mouse like a real person.

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
  turnstile: true, // auto-solve turnstile
});

const page = await browser.newPage();
await page.goto("https://example.com");
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
  intervalMs: 500,       // how often to check
  foreground: true,      // bring tab to front before clicking
  clickCooldownMs: 5000, // wait between retries
  logger: console.error, // see what's happening
}
```

The solver detects reloads, navigations, DOM changes — you don't need to call anything manually. It moves the mouse around naturally before clicking, adds random thinking delays, and randomizes the approach angle. Managed challenge pages ("Just a moment...") are detected and skipped.

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

## Cloudflare Helpers

```ts
import {
  hasTurnstile,
  isTurnstileSolved,
  isCloudflareManagedChallenge,
  getCloudflareData,
} from "patchright-difz";

await hasTurnstile({ page });
await isTurnstileSolved({ page });
await isCloudflareManagedChallenge({ page });

const data = await getCloudflareData({ page });
// data.cfClearance, data.turnstile.tokens, data.cloudflareCookies, etc.
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