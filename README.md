# patchright-difz

Patchright wrapper with an optional Turnstile helper.

## Install

```bash
npm install patchright-difz
```

## Usage

```ts
import { chromium } from "patchright-difz";

const context = await chromium.launchPersistentContext(userDataDir, {
  headless,
  channel,
  viewport: null,
  turnstile: true,
});
```

`page.evaluate`, `frame.evaluate`, locator evaluate helpers, and handle evaluate
helpers default to the page main world in this wrapper. This keeps normal
Playwright-style data extraction working with Patchright. If you need
Patchright's isolated world for a specific call, pass `true` as the
`isolatedContext` argument.

The Turnstile helper uses Patchright locators for fallback detection, so it can
also pick up challenge candidates rendered inside closed shadow roots.
The hidden `cf-turnstile-response` field is only used as optional token/data
evidence; active challenge detection prefers visible widgets, iframes, and
clickable candidates.

When `headless: true` is used without a custom `userAgent`, the wrapper sets a
normal Chrome user agent before the first request. This applies to
`launchPersistentContext`, `browser.newContext`, and `browser.newPage`. Set
`PATCHRIGHT_DIFZ_HEADLESS_USER_AGENT=0` to keep Patchright's default headless
user agent, or set it to a full user-agent string to override the default.

## Human-style cursor

Pages created through this wrapper get a built-in cursor that mimics real mouse
behaviour. Movement follows a cubic Bézier arc with Gaussian hand-tremor noise,
lateral wind drift that self-corrects near the target, micro-corrective
sub-movements on arrival, and directional overshoot on long moves. Click timing
uses natural press-hold durations and, for double-clicks, realistic inter-click
intervals with a small position drift between the two events.

```ts
await page.realClick?.("#submit");
await page.realCursor?.moveTo({ x: 300, y: 240 });
```

The Turnstile helper uses this cursor for mouse movement and click timing while
keeping the existing Turnstile click-point calculation.

### Configuration

```ts
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  channel: "chrome",
  viewport: null,
  turnstile: {
    intervalMs: 750,
    foreground: true,
    clickDelayMs: 35,
    mouseMoveSteps: 8,
    clickCooldownMs: 8000,
    maxClickCooldownMs: 60000,
    logger: console.error,
  },
});
```

### Cursor API

All methods accept a `CursorTarget`, which can be a CSS selector string, a
`{ x, y }` point, a bounding box object, an `ElementHandle`, or a `Locator`.

```ts
const cursor = page.realCursor!;

await cursor.click("#submit");
await cursor.click({ x: 640, y: 360 });
await cursor.click(page.locator("button"), { hesitate: 120 });

await cursor.doubleClick(".item");

await cursor.move("#menu");
await cursor.moveTo({ x: 100, y: 200 });
await cursor.moveBy({ x: 50, y: -20 });

await cursor.scroll("#feed", { deltaY: 600, steps: 8 });
await cursor.scroll("#feed", { deltaY: -300, easing: "ease-out" });

await cursor.drag("#handle", "#dropzone");

await cursor.hover("#tooltip-trigger", { duration: 800 });

const { x, y } = cursor.getLocation();

await cursor.mouseDown();
await cursor.mouseUp();
```

#### `CursorMoveOptions`

| Option | Default | Description |
|---|---|---|
| `moveSpeed` | `1.0` | Speed multiplier. `2.0` = 2× faster, `0.5` = 2× slower. |
| `jitter` | `1.5` | Hand-tremor amplitude in px. `0` = perfectly smooth. |
| `windStrength` | `0.25` | Lateral drift [0–1] that self-corrects near the target. |
| `microCorrections` | `true` | Sub-pixel corrective nudges on arrival. |
| `overshootThreshold` | `500` | Distance in px above which overshoot is applied. |
| `paddingPercentage` | `20` | Padding from element edges when picking a click point. |
| `moveDelay` | `0` | Extra pause after move completes (ms). |
| `randomizeMoveDelay` | `true` | Randomise the post-move delay. |
| `destination` | — | Override click point within the element's bounding box. |
| `waitForSelector` | — | Timeout for selector resolution (ms). |

#### `CursorClickOptions` (extends `CursorMoveOptions`)

| Option | Default | Description |
|---|---|---|
| `button` | `"left"` | `"left"`, `"right"`, or `"middle"`. |
| `clickCount` | `1` | Number of clicks in the sequence. |
| `hesitate` | `0` | Pre-click idle pause with hand-tremor (ms). |
| `delay` / `waitForClick` | random 60–120 ms | Hold duration between mousedown and mouseup. |

#### `CursorScrollOptions`

| Option | Default | Description |
|---|---|---|
| `deltaY` | `300` | Vertical scroll distance in CSS pixels (positive = down). |
| `deltaX` | `0` | Horizontal scroll distance (positive = right). |
| `steps` | `6` | Number of individual wheel events. |
| `stepDelay` | `60` | Base delay between steps (ms). |
| `stepJitter` | `8` | ±variance added to each step size. |
| `easing` | `"ease-in-out"` | `"linear"`, `"ease-in"`, `"ease-out"`, or `"ease-in-out"`. |

#### `CursorDragOptions` (extends `CursorMoveOptions`)

| Option | Default | Description |
|---|---|---|
| `dragDelay` | random 80–160 ms | Pause after mousedown before the drag starts. |
| `releaseDelay` | random 40–110 ms | Pause before releasing at the destination. |

#### `HoverOptions` (extends `CursorMoveOptions`)

| Option | Default | Description |
|---|---|---|
| `duration` | `500` | How long to idle on the element with hand-tremor (ms). |

### Manual cursor creation

```ts
import { createCursor, installMouseHelper } from "patchright-difz";

const cursor = createCursor(page, { x: 0, y: 0 });

await cursor.click("#submit", { moveSpeed: 1.5, hesitate: 80 });
await cursor.scroll("main", { deltaY: 900, steps: 10 });
await cursor.drag(".card", ".trash", { dragDelay: 100 });
await cursor.hover("nav a", { duration: 600 });

await installMouseHelper(page);
```

`installMouseHelper` injects a small dot overlay that tracks the CDP-controlled
cursor position during development. The dot turns blue on left click, red on
right click, and square on middle click.

## Manual usage

```ts
import { chromium, checkTurnstile } from "patchright-difz";

const context = await chromium.launchPersistentContext(".profile", {
  headless: false,
  channel: "chrome",
  viewport: null,
});
const page = await context.newPage();

await page.goto("https://example.com");
const stopWatching = checkTurnstile({ page });

stopWatching();
```

`checkTurnstile` installs a permanent watcher for that page. It reacts to
reloads, frame navigations, History API URL changes, hash/popstate changes, and
DOM mutations. It returns a cleanup function instead of a one-shot boolean.
After a click, the watcher waits before trying again and increases the retry
cooldown while the same page keeps presenting candidates. Hidden response fields
are treated as token/data evidence only, not as clickable targets.

## Turnstile and Cloudflare data helpers

```ts
import {
  getCloudflareData,
  hasTurnstile,
  isCloudflareManagedChallenge,
  isTurnstileSolved,
} from "patchright-difz";

const exists = await hasTurnstile({ page });
const solved = await isTurnstileSolved({ page });
const managedChallenge = await isCloudflareManagedChallenge({ page });
const data = await getCloudflareData({
  page,
  include: {
    cfClearance: true,
    tokens: true,
    responses: true,
    cookies: false,
    storage: false,
  },
});

console.log({
  exists,
  solved,
  managedChallenge,
  cookies: data.cloudflareCookies,
  clearance: data.cfClearance,
  cleared: data.challenge.cleared,
  managed: data.challenge.managed,
  documentCookieNames: data.documentCookieNames,
  tokens: data.turnstile.tokens,
  sitekeys: data.turnstile.sitekeys,
  responses: data.turnstile.responses,
});
```

`getCloudflareData` reads the current browser context cookies plus visible page
data such as Turnstile response fields, widget `sitekey` values, Cloudflare
iframe/script URLs, challenge fields, Ray IDs, and Cloudflare-related
local/session storage keys. Pass `context` and `urls` when you only want cookie
data for specific URLs:

Use `include` to control optional data. `sitekeys`, Turnstile presence/solved
state, and challenge status are always returned. UI-location metadata such as
selectors, element IDs, and class names is not returned.

Full-page Cloudflare managed challenges, such as "Just a moment" or
"Performing security verification", are exposed through
`isCloudflareManagedChallenge({ page })` and `data.challenge.managed`. The
Turnstile clicker pauses on that state instead of clicking page containers.

```ts
const data = await getCloudflareData({
  context,
  urls: ["https://example.com"],
});
```

## Artifact Cleanup

For test isolation, you can manually clear browser/session artifacts without
closing the context:

```ts
import {
  clearBrowserArtifacts,
  clearSessionArtifacts,
} from "patchright-difz";

await clearSessionArtifacts({ context });

await clearBrowserArtifacts({
  context,
  page,
  origins: ["https://example.com"],
});
```

`clearSessionArtifacts` clears cookies, current-page storage, permissions, and
extra HTTP headers by default. `clearBrowserArtifacts` also clears page Cache
Storage, Chromium network cache when CDP is available, and service workers.

## Importing as `patchright`

Package name `patchright-difz` normally imports as `patchright-difz`.
If you want this style:

```ts
import { chromium } from "patchright";
```

install it as an npm alias in your app:

```bash
npm install patchright@npm:patchright-difz
```