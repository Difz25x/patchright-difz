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

When `headless: true` is used without a custom `userAgent`, the wrapper sets a
normal Chrome user agent before the first request. This applies to
`launchPersistentContext`, `browser.newContext`, and `browser.newPage`. Set
`PATCHRIGHT_DIFZ_HEADLESS_USER_AGENT=0` to keep Patchright's default headless
user agent, or set it to a full user-agent string to override the default.

You can also configure it:

```ts
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  channel: "chrome",
  viewport: null,
  turnstile: {
    timeoutMs: 5000,
    intervalMs: 2000,
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
await checkTurnstile({ page });
```

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
