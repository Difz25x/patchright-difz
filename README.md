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

Pages created through this wrapper also get a built-in human-style cursor:

```ts
await page.realClick?.("#submit");
await page.realCursor?.moveTo({ x: 300, y: 240 });
```

The Turnstile helper uses this cursor for mouse movement and click timing while
keeping the existing Turnstile click-point calculation.

You can also configure it:

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

Manual usage:

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

// Later, when you no longer want the page watcher:
stopWatching();
```

`checkTurnstile` installs a permanent watcher for that page. It reacts to
reloads, frame navigations, History API URL changes, hash/popstate changes, and
DOM mutations. It returns a cleanup function instead of a one-shot boolean.
After a click, the watcher waits before trying again and increases the retry
cooldown while the same page keeps presenting candidates. Hidden response fields
are treated as token/data evidence only, not as clickable targets.

Turnstile and Cloudflare data helpers:

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

For library publishing, prefer documenting `import { chromium } from "patchright-difz"` because it is clearer and avoids dependency confusion.

## Publish

```bash
npm run publish
```

The command builds, creates a `v<version>` git tag, pushes to GitHub, and lets
the GitHub Actions workflow publish to npm through Trusted Publishing.
