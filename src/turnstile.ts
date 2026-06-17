import type { BrowserContext, ElementHandle, Locator, Page } from "patchright";
import { installRealCursor } from "./cursor.js";

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TurnstileOption = boolean | TurnstileAutoOptions;

export type TurnstileAutoOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  selectors?: string[];
  maxCandidatesPerSelector?: number;
  foreground?: boolean;
  clickDelayMs?: number;
  mouseMoveSteps?: number;
  waitAfterClickMs?: number;
  clickCooldownMs?: number;
  maxClickCooldownMs?: number;
  logger?: (message: string) => void;
  /** When false (default), token values and clearance cookies are excluded from getCloudflareData responses */
  collectSensitiveData?: boolean;
};

export type CheckTurnstileOptions = {
  page: Page;
  timeoutMs?: number;
  selectors?: string[];
  maxCandidatesPerSelector?: number;
  foreground?: boolean;
  clickDelayMs?: number;
  mouseMoveSteps?: number;
  waitAfterClickMs?: number;
  clickCooldownMs?: number;
  maxClickCooldownMs?: number;
};

export type HasTurnstileOptions = {
  page: Page;
  selectors?: string[];
  maxCandidatesPerSelector?: number;
  includeFallback?: boolean;
};

export type IsTurnstileSolvedOptions = {
  page?: Page;
  context?: BrowserContext;
  urls?: string | string[];
  minTokenLength?: number;
};

export type IsCloudflareManagedChallengeOptions = {
  page: Page;
};

export type CloudflareDataOptions = {
  page?: Page;
  context?: BrowserContext;
  urls?: string | string[];
  minTokenLength?: number;
  timeoutMs?: number;
  /** When false (default), token values and clearance cookies are excluded from responses */
  collectSensitiveData?: boolean;
};

type BrowserCookie = Awaited<ReturnType<BrowserContext["cookies"]>>[number];

export type CloudflareCookie = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
};

export type TurnstileResponseData = {
  source: "field" | "attribute";
  value: string;
};

export type TurnstileWidgetData = {
  sitekey?: string;
  action?: string;
  cData?: string;
  callback?: string;
  theme?: string;
  size?: string;
  language?: string;
};

export type CloudflareFieldData = {
  name?: string;
  value: string;
};

export type CloudflareStorageEntry = {
  key: string;
  value: string;
};

export type CloudflareData = {
  url: string;
  userAgent: string;
  documentCookieNames: string[];
  cookies: CloudflareCookie[];
  cloudflareCookies: CloudflareCookie[];
  clearanceCookie: string;
  turnstile: {
    present: boolean;
    solved: boolean;
    responses: TurnstileResponseData[];
    tokens: string[];
    sitekeys: string[];
    widgets: TurnstileWidgetData[];
    iframes: string[];
    scripts: string[];
  };
  challenge: {
    cleared: boolean;
    managed: boolean;
    fields: CloudflareFieldData[];
    rayIds: string[];
    options: unknown;
  };
  storage: {
    local: CloudflareStorageEntry[];
    session: CloudflareStorageEntry[];
  };
};

const OPTIONAL_TURNSTILE_RESPONSE_SELECTORS = [
  '[name="cf-turnstile-response"]',
  'input[name="cf-turnstile-response"]',
  'textarea[name="cf-turnstile-response"]',
  'input[name="turnstile-response"]',
  'textarea[name="turnstile-response"]',
  'input[name="turnstile-token"]',
  'textarea[name="turnstile-token"]',
  "[data-cf-turnstile-response]",
  "[data-turnstile-response]",
  "[data-turnstile-token]",
];

const DEFAULT_TURNSTILE_SELECTORS = [
  'iframe[src*="challenges.cloudflare.com"]',
  'iframe[title*="Cloudflare"]',
  'iframe[title*="challenge"]',
  ".cf-turnstile",
  "[data-sitekey]",
  ...OPTIONAL_TURNSTILE_RESPONSE_SELECTORS,
];

const TURNSTILE_RESPONSE_SELECTORS = OPTIONAL_TURNSTILE_RESPONSE_SELECTORS;

const CLOUDFLARE_FIELD_SELECTOR =
  'input[name*="cf-" i], input[name*="cf_" i], input[name*="turnstile" i], ' +
  'textarea[name*="cf-" i], textarea[name*="cf_" i], textarea[name*="turnstile" i], ' +
  "[data-ray], [data-cf-ray], [data-sitekey], [data-cf-turnstile-response]";

const FALLBACK_SELECTORS = ["iframe", "div", "button", '[role="checkbox"]'];
const FALLBACK_LIMIT = 80;
const DEFAULT_TOKEN_MIN_LENGTH = 20;

type ClickBehaviorOptions = {
  foreground: boolean;
  clickDelayMs: number;
  mouseMoveSteps: number;
  waitAfterClickMs: number;
};

const DEFAULT_CLICK_BEHAVIOR: ClickBehaviorOptions = {
  foreground: true,
  clickDelayMs: 35,
  mouseMoveSteps: 8,
  waitAfterClickMs: 100,
};

type NormalizedTurnstileOptions = Required<
  Omit<TurnstileAutoOptions, "logger">
> &
  Pick<TurnstileAutoOptions, "logger">;

type DisposableLike = {
  dispose: () => Promise<void> | void;
};

type PageWatch = {
  cleanup: () => void;
  refs: number;
};

type SolveTurnstileResult = {
  clicked: boolean;
  status: "clicked" | "managed-challenge" | "solved" | "not-found";
};

const watchedPages = new WeakMap<Page, PageWatch>();

function normalizeOptions(
  option: TurnstileOption | undefined,
): NormalizedTurnstileOptions {
  const options = typeof option === "object" ? option : {};

  return {
    timeoutMs: options.timeoutMs ?? 3000,
    intervalMs: options.intervalMs ?? 500,
    selectors: options.selectors ?? DEFAULT_TURNSTILE_SELECTORS,
    maxCandidatesPerSelector: options.maxCandidatesPerSelector ?? 5,
    foreground: options.foreground ?? DEFAULT_CLICK_BEHAVIOR.foreground,
    clickDelayMs: options.clickDelayMs ?? DEFAULT_CLICK_BEHAVIOR.clickDelayMs,
    mouseMoveSteps:
      options.mouseMoveSteps ?? DEFAULT_CLICK_BEHAVIOR.mouseMoveSteps,
    waitAfterClickMs:
      options.waitAfterClickMs ?? DEFAULT_CLICK_BEHAVIOR.waitAfterClickMs,
    clickCooldownMs: options.clickCooldownMs ?? 5000,
    maxClickCooldownMs: options.maxClickCooldownMs ?? 45000,
    collectSensitiveData: options.collectSensitiveData ?? false,
    logger: options.logger,
  };
}

function toCookieData(cookie: BrowserCookie): CloudflareCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    expires: cookie.expires,
  };
}

function clickOptionsFromCheckOptions({
  foreground = DEFAULT_CLICK_BEHAVIOR.foreground,
  clickDelayMs = DEFAULT_CLICK_BEHAVIOR.clickDelayMs,
  mouseMoveSteps = DEFAULT_CLICK_BEHAVIOR.mouseMoveSteps,
  waitAfterClickMs = DEFAULT_CLICK_BEHAVIOR.waitAfterClickMs,
}: Partial<ClickBehaviorOptions>): ClickBehaviorOptions {
  return {
    foreground,
    clickDelayMs,
    mouseMoveSteps,
    waitAfterClickMs,
  };
}

async function preparePageForClick(
  page: Page,
  options: ClickBehaviorOptions,
): Promise<void> {
  // Removed bringToFront() and window.focus() — these are suspicious
  // automation signals. Real users don't explicitly call window.focus().
  if (!options.foreground) return;
  await page.waitForTimeout(Math.round(20 + Math.random() * 40)).catch(() => undefined);
}

// ── Wander patterns ──────────────────────────────────────────────────
type WanderPattern = "scan" | "zigzag" | "explore" | "direct";

function pickWander(attempt: number): WanderPattern {
  const patterns: WanderPattern[] = ["scan", "zigzag", "explore", "direct"];
  return patterns[attempt % patterns.length];
}

async function wanderBeforeClick(
  cursor: import("./cursor.js").RealCursor,
  page: Page,
  target: { x: number; y: number },
  pattern: WanderPattern,
): Promise<void> {
  if (pattern === "direct") {
    // Little to no wander — short thinking pause
    await page.waitForTimeout(Math.round(40 + Math.random() * 80)).catch(() => undefined);
    return;
  }

  if (pattern === "scan") {
    // Horizontal scanning — looks like reading the page
    const startX = target.x + (Math.random() - 0.5) * 180;
    const startY = target.y - 30 - Math.random() * 50;
    const midX = target.x + (Math.random() - 0.5) * 140;
    const midY = target.y + (Math.random() - 0.5) * 20;

    await cursor.move({ x: startX, y: startY }, { moveSpeed: 0.5 + Math.random() * 0.4 }).catch(() => undefined);
    await page.waitForTimeout(Math.round(40 + Math.random() * 100)).catch(() => undefined);
    await cursor.move({ x: midX, y: midY }, { moveSpeed: 0.6 + Math.random() * 0.5 }).catch(() => undefined);
    await page.waitForTimeout(Math.round(30 + Math.random() * 60)).catch(() => undefined);
    return;
  }

  if (pattern === "zigzag") {
    // Zigzag approach — mouse moves in a sawtooth pattern toward target
    const steps = 2 + Math.floor(Math.random() * 3);
    let cx = target.x + (Math.random() - 0.5) * 100;
    let cy = target.y - 40 - Math.random() * 40;
    for (let i = 0; i < steps; i++) {
      const nx = cx + (target.x - cx) * 0.5 + (Math.random() - 0.5) * 60;
      const ny = cy + (target.y - cy) * 0.5 + (Math.random() - 0.5) * 40;
      await cursor.move({ x: nx, y: ny }, { moveSpeed: 0.6 + Math.random() * 0.4 }).catch(() => undefined);
      await page.waitForTimeout(Math.round(20 + Math.random() * 50)).catch(() => undefined);
      cx = nx; cy = ny;
    }
    return;
  }

  // "explore" — meander around the area like searching for the checkbox
  const points = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < points; i++) {
    const wx = target.x + (Math.random() - 0.5) * 140;
    const wy = target.y + (Math.random() - 0.5) * 100;
    await cursor.move({ x: wx, y: wy }, { moveSpeed: 0.4 + Math.random() * 0.6 }).catch(() => undefined);
    await page.waitForTimeout(Math.round(40 + Math.random() * 120)).catch(() => undefined);
  }
}

async function clickBox(
  page: Page,
  box: BoundingBox,
  options: ClickBehaviorOptions,
  attempt = 0,
): Promise<boolean> {
  if (box.width <= 0 || box.height <= 0) return false;

  const style = pickClickStyle();
  const point = getClickPoint(box, style);
  await preparePageForClick(page, options);
  const cursor = installRealCursor(page);

  // Pre-click wander
  const wander = pickWander(attempt);
  await wanderBeforeClick(cursor, page, point, wander);

  // Thinking delay
  const thinkMs = Math.round(20 + Math.random() * 100 + attempt * 15);
  await page.waitForTimeout(thinkMs).catch(() => undefined);

  const steps = Math.max(2, options.mouseMoveSteps + Math.round((Math.random() - 0.5) * 6));

  await cursor.click(point, {
    moveSpeed: Math.max(1, steps),
    overshootThreshold: Math.round(380 + Math.random() * 100),
    hesitate: Math.round(10 + Math.random() * 60 + attempt * 5),
    waitForClick: options.clickDelayMs + Math.round((Math.random() - 0.5) * 20),
  });

  if (options.waitAfterClickMs > 0) {
    const jitteredWait = Math.round(
      options.waitAfterClickMs * (0.5 + Math.random() * 0.8) + attempt * 30,
    );
    await page.waitForTimeout(jitteredWait).catch(() => undefined);
  }

  return true;
}

// ── Verification helper (shared after any click attempt) ─────────────
async function verifyClickSolved(page: Page): Promise<SolveTurnstileResult> {
  const verified = await isTurnstileSolved({ page }).catch(() => false);
  if (!verified) {
    await page.waitForTimeout(400).catch(() => undefined);
    const rechecked = await isTurnstileSolved({ page }).catch(() => false);
    if (rechecked) return { clicked: true, status: "solved" };
  } else {
    return { clicked: true, status: "solved" };
  }
  return { clicked: true, status: "clicked" };
}

// ── Reference-style Turnstile checkbox detection ─────────────────────
// Based on puppeteer-real-browser's approach:
// Scans empty 300px-wide divs (the invisible clickable widget area)
// and clicks at x+30 (precise checkbox position).

type CheckboxCandidate = {
  x: number;
  y: number;
  width: number;
  height: number;
};

async function findTurnstileCheckboxes(page: Page): Promise<CheckboxCandidate[]> {
  return page
    .evaluate(() => {
      const results: CheckboxCandidate[] = [];

      // Pass 1: Strict — zero margin + padding, no children, 290-310px wide
      document.querySelectorAll("div").forEach((item) => {
        try {
          const rect = item.getBoundingClientRect();
          const style = window.getComputedStyle(item);
          if (
            style.margin === "0px" &&
            style.padding === "0px" &&
            rect.width > 290 &&
            rect.width <= 310 &&
            !item.querySelector("*")
          ) {
            results.push({
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            });
          }
        } catch (_e) {}
      });

      // Pass 2: Lenient — just width + empty
      if (results.length === 0) {
        document.querySelectorAll("div").forEach((item) => {
          try {
            const rect = item.getBoundingClientRect();
            if (
              rect.width > 290 &&
              rect.width <= 310 &&
              !item.querySelector("*")
            ) {
              results.push({
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              });
            }
          } catch (_e) {}
        });
      }

      return results;
    })
    .catch(() => []);
}

async function clickTurnstileCheckboxDiv(
  page: Page,
  checkbox: CheckboxCandidate,
  options: ClickBehaviorOptions,
): Promise<boolean> {
  if (checkbox.width <= 0 || checkbox.height <= 0) return false;

  const clickX = checkbox.x + 30; // +30px from left edge = checkbox position
  const clickY = checkbox.y + checkbox.height / 2;

  await preparePageForClick(page, options);
  const cursor = installRealCursor(page);

  await cursor
    .move({ x: clickX, y: clickY }, { moveSpeed: 1.0 + Math.random() * 0.4 })
    .catch(() => undefined);
  await page.waitForTimeout(Math.round(20 + Math.random() * 60)).catch(() => undefined);

  await cursor
    .click(
      { x: clickX, y: clickY },
      {
        hesitate: Math.round(10 + Math.random() * 40),
        waitForClick: options.clickDelayMs + Math.round(Math.random() * 20),
      },
    )
    .catch(() => {});

  if (options.waitAfterClickMs > 0) {
    await page
      .waitForTimeout(
        Math.round(options.waitAfterClickMs * (0.5 + Math.random() * 0.5)),
      )
      .catch(() => undefined);
  }

  return true;
}

async function clickTurnstileCheckboxesByDiv(
  page: Page,
  options: ClickBehaviorOptions,
): Promise<boolean> {
  const checkboxes = await findTurnstileCheckboxes(page);
  if (checkboxes.length === 0) return false;

  for (const checkbox of checkboxes) {
    if (await clickTurnstileCheckboxDiv(page, checkbox, options).catch(() => false)) {
      return true;
    }
  }
  return false;
}

// ── Response-input parent click ────────────────────────────────────
// Find [name="cf-turnstile-response"] hidden inputs and click their parent.
async function clickParentOfTurnstileResponse(
  page: Page,
  options: ClickBehaviorOptions,
): Promise<boolean> {
  const elements = await page.$$('[name="cf-turnstile-response"]').catch(() => []);
  if (elements.length === 0) return false;

  for (const element of elements) {
    try {
      const parentHandle = await element.evaluateHandle((el) => el.parentElement);
      const parentEl = parentHandle.asElement();
      if (!parentEl) { parentHandle.dispose().catch(() => {}); continue; }

      const box = await parentEl.boundingBox();
      parentHandle.dispose().catch(() => {});
      if (!box || box.width <= 0 || box.height <= 0) continue;

      // Click at x+30 — the checkbox is precisely 30px from the left edge
      const clickX = box.x + 30;
      const clickY = box.y + box.height / 2;

      await preparePageForClick(page, options);
      const cursor = installRealCursor(page);
      await cursor
        .move({ x: clickX, y: clickY }, { moveSpeed: 1.0 + Math.random() * 0.4 })
        .catch(() => undefined);
      await page.waitForTimeout(Math.round(20 + Math.random() * 60)).catch(() => undefined);
      await cursor
        .click(
          { x: clickX, y: clickY },
          {
            hesitate: Math.round(10 + Math.random() * 40),
            waitForClick: options.clickDelayMs + Math.round(Math.random() * 20),
          },
        )
        .catch(() => {});

      if (options.waitAfterClickMs > 0) {
        await page
          .waitForTimeout(
            Math.round(options.waitAfterClickMs * (0.5 + Math.random() * 0.5)),
          )
          .catch(() => undefined);
      }

      return true;
    } catch (_e) {
      continue;
    } finally {
      await element.dispose().catch(() => undefined);
    }
  }

  return false;
}

const TURNSTILE_SIZE_PATTERNS = [
  // Standard widget (visible checkbox)
  { minW: 260, maxW: 340, minH: 35, maxH: 90 },
  // Compact / floating widget
  { minW: 130, maxW: 200, minH: 100, maxH: 160 },
  // Inline / button-style
  { minW: 40, maxW: 120, minH: 20, maxH: 40 },
  // Large / banner-style challenge
  { minW: 340, maxW: 600, minH: 90, maxH: 200 },
] as const;

function looksLikeTurnstileBox(box: BoundingBox): boolean {
  return TURNSTILE_SIZE_PATTERNS.some(
    (p) => box.width >= p.minW && box.width <= p.maxW && box.height >= p.minH && box.height <= p.maxH,
  );
}

type ClickPointStyle = "left" | "center" | "right" | "random";

function pickClickStyle(): ClickPointStyle {
  const r = Math.random();
  if (r < 0.35) return "left";
  if (r < 0.6) return "center";
  if (r < 0.82) return "right";
  return "random";
}

function getClickPoint(box: BoundingBox, style?: ClickPointStyle): { x: number; y: number } {
  const s = style ?? pickClickStyle();

  let xRatio: number;
  switch (s) {
    case "left":   xRatio = 0.15 + Math.random() * 0.2; break;
    case "center": xRatio = 0.35 + Math.random() * 0.3; break;
    case "right":  xRatio = 0.65 + Math.random() * 0.2; break;
    case "random": xRatio = Math.random(); break;
  }

  const xBase = box.width * xRatio;
  const yBase = box.height * (0.25 + Math.random() * 0.5);
  const xNoise = (Math.random() - 0.5) * Math.min(10, box.width * 0.08);
  const yNoise = (Math.random() - 0.5) * Math.min(8, box.height * 0.1);

  return {
    x: box.x + Math.max(1, xBase + xNoise),
    y: box.y + Math.max(1, yBase + yNoise),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isCloudflareCookie(cookie: BrowserCookie): boolean {
  return /^(?:__cf|_cf|cf_)/i.test(cookie.name);
}

function normalizeCookieUrls(
  urls: string | string[] | undefined,
): string[] | undefined {
  if (!urls) return undefined;
  return Array.isArray(urls) ? urls : [urls];
}

function isOptionalResponseSelector(selector: string): boolean {
  return OPTIONAL_TURNSTILE_RESPONSE_SELECTORS.includes(selector);
}

function scheduleSoon(callback: () => void, delayMs = 75): () => void {
  const timeout = setTimeout(callback, delayMs);

  return () => clearTimeout(timeout);
}

async function clickLocatorBox(
  page: Page,
  locator: Locator,
  options: ClickBehaviorOptions,
  attempt = 0,
): Promise<boolean> {
  const box = await locator.boundingBox({ timeout: 1000 }).catch(() => null);

  if (!box) return false;

  const style = pickClickStyle();
  const point = getClickPoint(box, style);
  await preparePageForClick(page, options);
  const cursor = installRealCursor(page);

  // Pre-click wander
  const wander = pickWander(attempt);
  await wanderBeforeClick(cursor, page, point, wander);

  // Thinking delay
  const thinkMs = Math.round(20 + Math.random() * 100 + attempt * 15);
  await page.waitForTimeout(thinkMs).catch(() => undefined);

  const steps = Math.max(2, options.mouseMoveSteps + Math.round((Math.random() - 0.5) * 6));

  const clickedByCursor = await cursor
    .click(point, {
      moveSpeed: Math.max(1, steps),
      overshootThreshold: Math.round(380 + Math.random() * 100),
      hesitate: Math.round(10 + Math.random() * 60 + attempt * 5),
      waitForClick: options.clickDelayMs + Math.round((Math.random() - 0.5) * 20),
    })
    .then(() => true)
    .catch(() => false);

  if (clickedByCursor) {
    if (options.waitAfterClickMs > 0) {
      const jitteredWait = Math.round(
        options.waitAfterClickMs * (0.5 + Math.random() * 0.8) + attempt * 30,
      );
      await page.waitForTimeout(jitteredWait).catch(() => undefined);
    }
    return true;
  }

  // Fallback — force click via patchright if cursor click failed
  return locator
    .click({
      force: true,
      timeout: 1000,
      delay: options.clickDelayMs + Math.round(Math.random() * 20),
      steps: Math.max(2, options.mouseMoveSteps),
      position: {
        x: Math.max(1, point.x - box.x),
        y: Math.max(1, point.y - box.y),
      },
    })
    .then(() => true)
    .catch(() => false);
}

async function clickElementOrParentBox(
  page: Page,
  element: ElementHandle<Element>,
  options: ClickBehaviorOptions,
  attempt = 0,
): Promise<boolean> {
  let current: ElementHandle<Element> | null = element;

  for (let depth = 0; depth < 8 && current; depth++) {
    const box = await current.boundingBox().catch(() => null);

    if (box && looksLikeTurnstileBox(box)) {
      if (await clickBox(page, box, options, attempt)) {
        return true;
      }
    }

    const parentHandle = await current
      .evaluateHandle((el) => {
        const root = el.getRootNode();

        if (el.parentElement) return el.parentElement;
        if (root instanceof ShadowRoot) return root.host;

        return null;
      })
      .catch(() => null);

    current = parentHandle?.asElement() as ElementHandle<Element> | null;
  }

  return false;
}

// Selector tiers for prioritized scanning — most specific/indicative first
function buildSelectorTiers(selectors: string[]): [string[], string[]] {
  const high: string[] = [];
  const normal: string[] = [];
  for (const sel of selectors) {
    if (isOptionalResponseSelector(sel)) continue;
    // Iframe selectors are most specific — try them first
    if (sel.includes("iframe") || sel.includes("frame")) {
      high.push(sel);
    } else {
      normal.push(sel);
    }
  }
  // Shuffle within each tier for anti-detection
  const shuffleArray = (arr: string[]): string[] =>
    [...arr].sort(() => Math.random() - 0.5);
  return [shuffleArray(high), shuffleArray(normal)];
}

async function tryClickSelector(
  page: Page,
  selector: string,
  index: number,
  options: ClickBehaviorOptions,
  attempt: number,
): Promise<boolean> {
  const locator = page.locator(selector);
  const target = locator.nth(index);

  if (await clickLocatorBox(page, target, options, attempt).catch(() => false)) {
    return true;
  }

  const element = await target
    .elementHandle({ timeout: 800 })
    .catch(() => null);

  if (element) {
    try {
      return await clickElementOrParentBox(
        page,
        element as ElementHandle<Element>,
        options,
        attempt,
      ).catch(() => false);
    } finally {
      await element.dispose().catch(() => undefined);
    }
  }

  return false;
}

async function clickTurnstileLocators(
  page: Page,
  selectors: string[],
  maxCandidatesPerSelector: number,
  options: ClickBehaviorOptions,
  attempt = 0,
): Promise<boolean> {
  const [highPriority, normalPriority] = buildSelectorTiers(selectors);

  // Try high-priority (iframe) selectors first — they're most specific
  for (const selector of highPriority) {
    const count = await page.locator(selector).count().catch(() => 0);
    for (let i = 0; i < Math.min(count, maxCandidatesPerSelector); i++) {
      if (await tryClickSelector(page, selector, i, options, attempt)) return true;
    }
  }

  // Then try normal-priority selectors
  for (const selector of normalPriority) {
    const count = await page.locator(selector).count().catch(() => 0);
    // Batch count() for many candidates
    const limit = Math.min(count, maxCandidatesPerSelector);
    if (limit === 0) continue;

    for (let i = 0; i < limit; i++) {
      if (await tryClickSelector(page, selector, i, options, attempt)) return true;
    }
  }

  return false;
}

async function hasTurnstileLocators(
  page: Page,
  selectors: string[],
  maxCandidatesPerSelector: number,
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;

    if (!isOptionalResponseSelector(selector)) return true;

    const checks = Array.from(
      { length: Math.min(count, maxCandidatesPerSelector) },
      (_, i) => locator.nth(i).boundingBox({ timeout: 250 }).catch(() => null),
    );
    const boxes = await Promise.all(checks);
    if (boxes.some((box) => box && looksLikeTurnstileBox(box))) return true;
  }

  return false;
}

async function hasTurnstileFallback(page: Page): Promise<boolean> {
  // Fast check: look for empty 300px-wide Turnstile widget divs
  const checkboxes = await findTurnstileCheckboxes(page).catch(() => []);
  if (checkboxes.length > 0) return true;

  for (const selector of FALLBACK_SELECTORS) {
    const locator = page.locator(selector);
    const count = Math.min(
      await locator.count().catch(() => 0),
      FALLBACK_LIMIT,
    );

    const boxes = await Promise.all(
      Array.from({ length: count }, (_value, index) =>
        locator
          .nth(index)
          .boundingBox({ timeout: 250 })
          .catch(() => null),
      ),
    );

    if (boxes.some((box) => box && looksLikeTurnstileBox(box))) return true;
  }

  return false;
}

async function isManagedChallengePage(page: Page): Promise<boolean> {
  // Quick URL check — Cloudflare challenge pages always have these params
  const url = page.url();
  if (url.includes("__cf_chl_rt_tk") || url.includes("challenge-platform")) {
    return true;
  }

  return page
    .evaluate(() => {
      const title = document.title || "";
      const bodyText = document.body?.innerText?.slice(0, 5000) || "";
      const locationText = location.href || "";
      const text = `${title}\n${bodyText}\n${locationText}`;

      return (
        /just a moment|security verification|checking your browser/i.test(
          text,
        ) &&
        /cloudflare|verify you are not a bot|malicious bots|ray id/i.test(text)
      );
    })
    .catch(() => false);
}

async function clickTurnstileFallback(
  page: Page,
  options: ClickBehaviorOptions,
  attempt = 0,
): Promise<boolean> {
  const candidates: BoundingBox[] = [];

  for (const selector of FALLBACK_SELECTORS) {
    const locator = page.locator(selector);
    const count = Math.min(
      await locator.count().catch(() => 0),
      FALLBACK_LIMIT,
    );

    const boxes = await Promise.all(
      Array.from({ length: count }, (_value, index) =>
        locator
          .nth(index)
          .boundingBox({ timeout: 250 })
          .catch(() => null),
      ),
    );

    for (const box of boxes) {
      if (box && looksLikeTurnstileBox(box)) candidates.push(box);
    }
  }

  candidates.sort((left, right) => {
    const leftScore = Math.abs(left.width - 300) + Math.abs(left.height - 65);
    const rightScore =
      Math.abs(right.width - 300) + Math.abs(right.height - 65);

    return leftScore - rightScore;
  });

  for (const box of candidates) {
    if (await clickBox(page, box, options, attempt).catch(() => false)) return true;
  }

  return false;
}

async function getCloudflarePageData(
  page: Page,
  minTokenLength = DEFAULT_TOKEN_MIN_LENGTH,
): Promise<
  Omit<
    CloudflareData,
    "cookies" | "cloudflareCookies" | "clearanceCookie"
  >
> {
  return page.evaluate(
    ({ responseSelectors, cloudflareFieldSelector, minTokenLength }) => {
      type ResponseData = TurnstileResponseData;
      type WidgetData = TurnstileWidgetData;
      type FieldData = CloudflareFieldData;
      type StorageEntry = CloudflareStorageEntry;

      const responseData: ResponseData[] = [];
      const widgets: WidgetData[] = [];
      const fields: FieldData[] = [];
      const iframeSources: string[] = [];
      const scriptSources: string[] = [];
      const sitekeys: string[] = [];
      const rayIds: string[] = [];

      const pushUnique = (
        target: string[],
        value: string | null | undefined,
      ): void => {
        if (value && !target.includes(value)) target.push(value);
      };

      const valueFor = (element: Element): string => {
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
        ) {
          return element.value;
        }

        return (
          element.getAttribute("value") ??
          element.getAttribute("data-cf-turnstile-response") ??
          element.getAttribute("data-turnstile-response") ??
          element.getAttribute("data-turnstile-token") ??
          ""
        );
      };

      const addResponse = (
        element: Element,
        source: ResponseData["source"],
      ): void => {
        const value = valueFor(element).trim();
        if (!value) return;

        const entry = {
          source,
          value,
        };

        if (!responseData.some((existing) => existing.value === entry.value)) {
          responseData.push(entry);
        }
      };

      for (const selector of responseSelectors) {
        try {
          document
            .querySelectorAll(selector)
            .forEach((element) =>
              addResponse(
                element,
                element.hasAttribute("data-cf-turnstile-response") ||
                  element.hasAttribute("data-turnstile-response") ||
                  element.hasAttribute("data-turnstile-token")
                  ? "attribute"
                  : "field",
              ),
            );
        } catch (_error) {}
      }

      document
        .querySelectorAll("[data-sitekey], .cf-turnstile")
        .forEach((element) => {
          const sitekey = element.getAttribute("data-sitekey") ?? undefined;
          const widget = {
            sitekey,
            action: element.getAttribute("data-action") ?? undefined,
            cData: element.getAttribute("data-cdata") ?? undefined,
            callback: element.getAttribute("data-callback") ?? undefined,
            theme: element.getAttribute("data-theme") ?? undefined,
            size: element.getAttribute("data-size") ?? undefined,
            language: element.getAttribute("data-language") ?? undefined,
          };

          widgets.push(widget);
          pushUnique(sitekeys, sitekey);
        });

      document.querySelectorAll("iframe").forEach((iframe) => {
        const src = iframe.getAttribute("src");
        if (!src || !/cloudflare|turnstile|challenge/i.test(src)) return;

        pushUnique(iframeSources, src);

        try {
          const parsed = new URL(src, location.href);
          pushUnique(sitekeys, parsed.searchParams.get("sitekey"));
          pushUnique(sitekeys, parsed.searchParams.get("siteKey"));
          pushUnique(sitekeys, parsed.searchParams.get("k"));
        } catch (_error) {}
      });

      document.querySelectorAll("script[src]").forEach((script) => {
        const src = script.getAttribute("src");
        if (src && /cloudflare|turnstile|challenge-platform/i.test(src)) {
          pushUnique(scriptSources, src);
        }
      });

      try {
        document
          .querySelectorAll(cloudflareFieldSelector)
          .forEach((element) => {
            const value = valueFor(element).trim();
            const name = element.getAttribute("name") ?? undefined;
            const rayId =
              element.getAttribute("data-ray") ??
              element.getAttribute("data-cf-ray");

            pushUnique(rayIds, rayId);

            if (!value) return;

            fields.push({
              name,
              value,
            });
          });
      } catch (_error) {}

      const collectStorage = (storage: Storage): StorageEntry[] => {
        const entries: StorageEntry[] = [];

        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (
            !key ||
            !/cloudflare|turnstile|cf[_-]|cfchl|cf_chl|challenge/i.test(key)
          ) {
            continue;
          }

          entries.push({
            key,
            value: storage.getItem(key) ?? "",
          });
        }

        return entries;
      };

      const safeCollectStorage = (
        getStorage: () => Storage,
      ): StorageEntry[] => {
        try {
          return collectStorage(getStorage());
        } catch (_error) {
          return [];
        }
      };

      const safeDocumentCookieNames = (): string[] => {
        try {
          return document.cookie
            .split(";")
            .map((part) => part.trim().split("=")[0])
            .filter(Boolean);
        } catch (_error) {
          return [];
        }
      };

      const challengeOptions = null;
      const managedChallengeText = `${document.title || ""}\n${
        document.body?.innerText?.slice(0, 5000) ?? ""
      }\n${location.href}`;
      const managedChallenge = Boolean(
        /just a moment|security verification|checking your browser/i.test(
          managedChallengeText,
        ) &&
        /cloudflare|verify you are not a bot|malicious bots|ray id/i.test(
          managedChallengeText,
        ),
      );

      const tokens = responseData
        .map((response) => response.value)
        .filter((value) => value.length >= minTokenLength);
      const present =
        responseData.length > 0 ||
        widgets.length > 0 ||
        sitekeys.length > 0 ||
        iframeSources.some((src) => /turnstile/i.test(src));

      return {
        url: location.href,
        userAgent: navigator.userAgent,
        documentCookieNames: safeDocumentCookieNames(),
        turnstile: {
          present,
          solved: tokens.length > 0,
          responses: responseData,
          tokens,
          sitekeys,
          widgets,
          iframes: iframeSources,
          scripts: scriptSources,
        },
        challenge: {
          cleared: false,
          managed: managedChallenge,
          fields,
          rayIds,
          options: challengeOptions,
        },
        storage: {
          local: safeCollectStorage(() => localStorage),
          session: safeCollectStorage(() => sessionStorage),
        },
      };
    },
    {
      responseSelectors: TURNSTILE_RESPONSE_SELECTORS,
      cloudflareFieldSelector: CLOUDFLARE_FIELD_SELECTOR,
      minTokenLength,
    },
  );
}

export async function hasTurnstile({
  page,
  selectors = DEFAULT_TURNSTILE_SELECTORS,
  maxCandidatesPerSelector = 5,
  includeFallback = true,
}: HasTurnstileOptions): Promise<boolean> {
  if (await hasTurnstileLocators(page, selectors, maxCandidatesPerSelector)) {
    return true;
  }

  if (!includeFallback) return false;

  return hasTurnstileFallback(page);
}

export async function isTurnstileSolved({
  page,
  context = page?.context(),
  urls,
  minTokenLength = DEFAULT_TOKEN_MIN_LENGTH,
}: IsTurnstileSolvedOptions): Promise<boolean> {
  // Safe cookie check
  if (context) {
    const rawCookies = await context
      .cookies(normalizeCookieUrls(urls))
      .catch(() => []);
    if (rawCookies.some((cookie) => cookie.name === "cf_clearance")) {
      return true;
    }
  }

  if (!page) return false;

  // Lightweight DOM check without heavy page.evaluate iteration
  const state = await page
    .evaluate((minLen) => {
      const inputs = document.querySelectorAll(
        '[name="cf-turnstile-response"], [name="turnstile-response"], [data-cf-turnstile-response]',
      );
      let tokenFound = false;
      for (const el of inputs) {
        const val =
          (el as HTMLInputElement).value ||
          el.getAttribute("data-cf-turnstile-response") ||
          "";
        if (val.trim().length >= minLen) {
          tokenFound = true;
          break;
        }
      }

      const present =
        document.querySelectorAll(
          '.cf-turnstile, iframe[src*="challenges.cloudflare.com"]',
        ).length > 0;
      return { tokenFound, present };
    }, minTokenLength)
    .catch(() => ({ tokenFound: false, present: false }));

  if (state.present && !state.tokenFound) {
    return false;
  }

  return state.tokenFound;
}

export async function _getCloudflareDataRaw({
  page,
  context = page?.context(),
  urls,
  minTokenLength = DEFAULT_TOKEN_MIN_LENGTH,
}: CloudflareDataOptions): Promise<CloudflareData> {
  const pageData = page
    ? await getCloudflarePageData(page, minTokenLength)
    : {
        url: "",
        userAgent: "",
        documentCookieNames: [],
        turnstile: {
          present: false,
          solved: false,
          responses: [],
          tokens: [],
          sitekeys: [],
          widgets: [],
          iframes: [],
          scripts: [],
        },
        challenge: {
          cleared: false,
          managed: false,
          fields: [],
          rayIds: [],
          options: null,
        },
        storage: {
          local: [],
          session: [],
        },
      };

  const rawCookies = context
    ? await context.cookies(normalizeCookieUrls(urls)).catch(() => [])
    : [];
  const cloudflareCookieValues = rawCookies.filter(isCloudflareCookie);
  const clearanceCookie = cloudflareCookieValues.find(
    (cookie) => cookie.name === "cf_clearance",
  );
  const cookieSolved = Boolean(clearanceCookie);

  return {
    url: pageData.url || "",
    userAgent: pageData.userAgent || "",
    documentCookieNames: pageData.documentCookieNames,
    cookies: rawCookies.map(toCookieData),
    cloudflareCookies: cloudflareCookieValues.map(toCookieData),
    clearanceCookie: clearanceCookie?.value || "",
    turnstile: {
      ...pageData.turnstile,
      solved: pageData.turnstile.solved,
      responses: pageData.turnstile.responses,
      tokens: unique(pageData.turnstile.tokens),
      sitekeys: unique(pageData.turnstile.sitekeys),
      widgets: pageData.turnstile.widgets,
      iframes: unique(pageData.turnstile.iframes),
      scripts: unique(pageData.turnstile.scripts),
    },
    challenge: {
      ...pageData.challenge,
      cleared: cookieSolved,
      fields: pageData.challenge.fields,
      rayIds: pageData.challenge.rayIds,
      options: pageData.challenge.options,
    },
    storage: pageData.storage,
  };
}

export async function getCloudflareData(
  options: CloudflareDataOptions,
): Promise<CloudflareData> {
  const { timeoutMs = 7000, page, context = options.page?.context() } = options;

  // Wait until solved (with generous timeout to avoid infinite hang)
  let solved = await isTurnstileSolved(options);
  const solveStart = Date.now();
  const SOLVE_TIMEOUT = 120000; // 2min max wait for initial solve
  while (!solved && Date.now() - solveStart < SOLVE_TIMEOUT) {
    if (page) await page.waitForTimeout(500).catch(() => undefined);
    else await new Promise((r) => setTimeout(r, 500));
    solved = await isTurnstileSolved(options);
  }

  // Start timeout to ensure cookies are fully set before snapshotting
  const start = Date.now();
  let hasClearance = false;
  while (Date.now() - start < timeoutMs) {
    if (context) {
      const cookies = await context
        .cookies(normalizeCookieUrls(options.urls))
        .catch(() => []);
      if (cookies.some((c) => c.name === "cf_clearance")) {
        hasClearance = true;
        break;
      }
    }
    if (page) await page.waitForTimeout(500).catch(() => undefined);
    else await new Promise((r) => setTimeout(r, 500));
  }

  // Take a single snapshot of all data at the end
  const data = await _getCloudflareDataRaw(options);

  // Strip sensitive data unless explicitly requested
  if (!options.collectSensitiveData) {
    data.turnstile.responses = [];
    data.turnstile.tokens = [];
    data.clearanceCookie = "";
    data.cloudflareCookies = data.cloudflareCookies.filter(
      (c) => c.name !== "cf_clearance",
    );
    data.cookies = data.cookies.filter((c) => c.name !== "cf_clearance");
    data.challenge.cleared = false;
  }

  return data;
}

export async function isCloudflareManagedChallenge({
  page,
}: IsCloudflareManagedChallengeOptions): Promise<boolean> {
  // Also check if just resolved via cookie
  const cookies = await page.context().cookies().catch(() => []);
  const hasClearance = cookies.some((c) => c.name === "cf_clearance");
  if (hasClearance) return false;

  return isManagedChallengePage(page);
}

async function solveTurnstileOnce(
  options: CheckTurnstileOptions & { attempt?: number },
): Promise<SolveTurnstileResult> {
  const {
    page,
    selectors = DEFAULT_TURNSTILE_SELECTORS,
    maxCandidatesPerSelector = 5,
    foreground = DEFAULT_CLICK_BEHAVIOR.foreground,
    clickDelayMs = DEFAULT_CLICK_BEHAVIOR.clickDelayMs,
    mouseMoveSteps = DEFAULT_CLICK_BEHAVIOR.mouseMoveSteps,
    waitAfterClickMs = DEFAULT_CLICK_BEHAVIOR.waitAfterClickMs,
    attempt = 0,
  } = options;

  const clickOptions = clickOptionsFromCheckOptions({
    foreground,
    clickDelayMs,
    mouseMoveSteps,
    waitAfterClickMs,
  });

  if (await isTurnstileSolved({ page }).catch(() => false)) {
    return { clicked: false, status: "solved" };
  }

  if (await isManagedChallengePage(page)) {
    return { clicked: false, status: "managed-challenge" };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Strategy 1: Parent of [name="cf-turnstile-response"]
  // Fastest path — if the hidden input exists, its parent is the checkbox.
  // Click at x+30 (precise checkbox position, proven by puppeteer-real-browser).
  // ═══════════════════════════════════════════════════════════════════
  if (await clickParentOfTurnstileResponse(page, clickOptions).catch(() => false)) {
    return verifyClickSolved(page);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Strategy 2: Empty 300px div detection (reference approach)
  // ═══════════════════════════════════════════════════════════════════
  if (await clickTurnstileCheckboxesByDiv(page, clickOptions).catch(() => false)) {
    return verifyClickSolved(page);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Strategy 3: Selector-based — iframes, locators, element scanning
  // ═══════════════════════════════════════════════════════════════════
  if (
    await clickTurnstileLocators(
      page,
      selectors,
      maxCandidatesPerSelector,
      clickOptions,
      attempt,
    )
  ) {
    return verifyClickSolved(page);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Strategy 4: Generic fallback — size-matching divs, buttons, iframes
  // ═══════════════════════════════════════════════════════════════════
  if (await clickTurnstileFallback(page, clickOptions, attempt)) {
    return verifyClickSolved(page);
  }

  return { clicked: false, status: "not-found" };
}

async function installPageChangeSignals(
  page: Page,
  schedule: () => void,
): Promise<DisposableLike | undefined> {
  const bindingName = `__patchrightDifzTurnstileSignal_${Math.random()
    .toString(36)
    .slice(2)}`;
  const disposable = await page
    .exposeFunction(bindingName, schedule)
    .catch(() => undefined);
  const installScript = (name: string): void => {
    const target = window as Window & {
      __patchrightDifzTurnstileWatch?: {
        bindingName?: string;
        installed?: boolean;
        notifyTimer?: number;
      };
    };
    const state = target.__patchrightDifzTurnstileWatch ?? {};
    target.__patchrightDifzTurnstileWatch = state;
    state.bindingName = name;

    const notify = (): void => {
      if (state.notifyTimer) window.clearTimeout(state.notifyTimer);

      state.notifyTimer = window.setTimeout(() => {
        const callback = (
          window as unknown as Record<string, (() => Promise<void>) | undefined>
        )[state.bindingName ?? ""];

        try {
          const result = callback?.();

          if (result && typeof result.catch === "function") {
            void result.catch(() => undefined);
          }
        } catch (_error) {}
      }, 75);
    };

    if (state.installed) {
      notify();
      return;
    }

    state.installed = true;

    const patchHistory = (methodName: "pushState" | "replaceState"): void => {
      const original = history[methodName];

      history[methodName] = function patchedHistoryMethod(
        this: History,
        ...args: Parameters<History["pushState"]>
      ) {
        const result = original.apply(this, args);
        notify();

        return result;
      } as History[typeof methodName];
    };

    new MutationObserver(notify).observe(document.documentElement ?? document, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    patchHistory("pushState");
    patchHistory("replaceState");
    window.addEventListener("hashchange", notify, true);
    window.addEventListener("popstate", notify, true);
    document.addEventListener("readystatechange", notify, true);
    document.addEventListener("DOMContentLoaded", notify, true);
    window.addEventListener("load", notify, true);
    notify();
  };

  await page.addInitScript(installScript, bindingName).catch(() => undefined);
  await page.evaluate(installScript, bindingName).catch(() => undefined);

  return disposable;
}

function watchTurnstilePage(
  page: Page,
  options: NormalizedTurnstileOptions,
): () => void {
  const existing = watchedPages.get(page);

  if (existing) {
    existing.refs++;

    return () => {
      const current = watchedPages.get(page);
      if (!current) return;

      current.refs--;
      if (current.refs <= 0) {
        current.cleanup();
        watchedPages.delete(page);
      }
    };
  }

  let closed = false;
  let running = false;
  let pending = false;
  let clickAttempts = 0;
  let nextClickAt = 0;
  let lastManagedChallengeLogAt = 0;
  let cancelScheduledRun: (() => void) | undefined;
  let signalDisposable: DisposableLike | undefined;

  const run = async (): Promise<void> => {
    if (closed) return;

    if (running) {
      pending = true;
      return;
    }

    running = true;
    pending = false;

    try {
      const now = Date.now();

      if (now < nextClickAt) return;

      const result = await solveTurnstileOnce({
        page,
        selectors: options.selectors,
        maxCandidatesPerSelector: options.maxCandidatesPerSelector,
        foreground: options.foreground,
        clickDelayMs: options.clickDelayMs,
        mouseMoveSteps: options.mouseMoveSteps,
        waitAfterClickMs: options.waitAfterClickMs,
        attempt: clickAttempts,
      });

      if (result.status === "managed-challenge") {
        clickAttempts = 0;
        nextClickAt = Date.now() + Math.max(options.intervalMs, 15000);

        if (Date.now() - lastManagedChallengeLogAt > 30000) {
          lastManagedChallengeLogAt = Date.now();
          options.logger?.(
            "cloudflare managed challenge detected; waiting for auto-resolution...",
          );
        }

        // Wait for managed challenge to resolve — cookie-only polling.
        // No CDP session needed; cookies are reliable enough and avoid the
        // detectable CDP session creation.
        const contextForCookies = page.context();
        const pollStart = Date.now();
        const maxWait = 45000;

        for (let i = 0; i < 90; i++) {
          if (closed || page.isClosed()) return;

          // Check 1: cf_clearance cookie appeared
          const cookies = await contextForCookies.cookies().catch(() => []);
          if (cookies.some((c) => c.name === "cf_clearance")) {
            options.logger?.("cf_clearance cookie found — challenge resolved");
            nextClickAt = 0;
            return;
          }

          // Check 2: Page URL/title changed from challenge page
          const url = page.url();
          const title = await page.title().catch(() => "");
          if (
            !/just a moment|performing security|checking your browser/i.test(title) &&
            !/challenge-platform/i.test(url)
          ) {
            options.logger?.("page changed from challenge — resuming");
            nextClickAt = 0;
            return;
          }

          // Check 3: Turnstile elements appeared after challenge
          const hasCfWidgets = await page
            .evaluate(() => {
              const hasIframe = document.querySelector('iframe[src*="challenges.cloudflare.com"]');
              const hasTurnstile = document.querySelector(".cf-turnstile, [data-sitekey]");
              const tokenFields = document.querySelectorAll(
                '[name="cf-turnstile-response"], [name="turnstile-response"]',
              );
              return Boolean(hasIframe || hasTurnstile || tokenFields.length > 0);
            })
            .catch(() => false);
          if (hasCfWidgets) {
            options.logger?.("turnstile elements appeared after challenge — resuming");
            nextClickAt = 0;
            return;
          }

          // Timeout safety
          if (Date.now() - pollStart > maxWait) {
            options.logger?.("managed challenge wait timeout; will retry");
            nextClickAt = Date.now() + 5000;
            return;
          }

          await page.waitForTimeout(600).catch(() => undefined);
        }
        return;
      }

      if (result.status === "solved") {
        clickAttempts = 0;
        nextClickAt = 0;
        return;
      }

      if (result.status === "not-found") {
        // Don't reset attempts on not-found to allow strategy on next check
        nextClickAt = 0;
        return;
      }

      if (result.clicked) {
        clickAttempts++;

        // Exponential backoff with jitter
        const baseCooldown = Math.min(
          options.maxClickCooldownMs,
          options.clickCooldownMs * Math.min(clickAttempts, 6),
        );
        const jitter = 0.75 + Math.random() * 0.5; // ±25% jitter
        const cooldown = Math.round(baseCooldown * jitter);

        nextClickAt = Date.now() + cooldown;
        options.logger?.(
          `turnstile candidate clicked (attempt #${clickAttempts}); next retry in ${cooldown}ms`,
        );
      }
    } catch (error) {
      options.logger?.(error instanceof Error ? error.message : String(error));
    } finally {
      running = false;
      if (pending && !closed) schedule();
    }
  };

  const schedule = (): void => {
    if (closed || cancelScheduledRun) return;

    cancelScheduledRun = scheduleSoon(() => {
      cancelScheduledRun = undefined;
      void run();
    });
  };

  const interval = setInterval(schedule, options.intervalMs);
  const cleanup = (): void => {
    if (closed) return;

    closed = true;
    cancelScheduledRun?.();
    clearInterval(interval);
    page.off("close", cleanup);
    page.off("domcontentloaded", schedule);
    page.off("load", schedule);
    page.off("framenavigated", schedule);
    Promise.resolve(signalDisposable?.dispose()).catch(() => undefined);
  };
  const watch: PageWatch = {
    cleanup,
    refs: 1,
  };

  watchedPages.set(page, watch);
  page.on("close", cleanup);
  page.on("domcontentloaded", schedule);
  page.on("load", schedule);
  page.on("framenavigated", schedule);
  void installPageChangeSignals(page, schedule).then((disposable) => {
    if (closed) {
      Promise.resolve(disposable?.dispose()).catch(() => undefined);
      return;
    }

    signalDisposable = disposable;
  });
  schedule();

  return () => {
    const current = watchedPages.get(page);
    if (!current) return;

    current.refs--;
    if (current.refs <= 0) {
      current.cleanup();
      watchedPages.delete(page);
    }
  };
}

export function checkTurnstile({
  page,
  ...options
}: CheckTurnstileOptions): () => void {
  return watchTurnstilePage(page, normalizeOptions(options));
}

export function installTurnstileAutoSolver(
  context: BrowserContext,
  option: TurnstileOption = true,
): () => void {
  const options = normalizeOptions(option);
  const pageCleanups = new Set<() => void>();

  // Warn about authorized use when auto-solver activates
  const startupMsg =
    "[patchright-difz] Turnstile auto-solver activated. " +
    "Authorized use only — you must have permission to test the target.";
  if (options.logger) {
    options.logger(startupMsg);
  } else if (typeof console !== "undefined") {
    (console.error ?? console.warn)(startupMsg);
  }

  const attachPage = (page: Page): void => {
    const stopWatching = watchTurnstilePage(page, options);
    const cleanup = (): void => {
      page.off("close", cleanup);
      stopWatching();
      pageCleanups.delete(cleanup);
    };

    page.on("close", cleanup);
    pageCleanups.add(cleanup);
  };

  context.pages().forEach(attachPage);
  context.on("page", attachPage);

  return () => {
    context.off("page", attachPage);
    for (const cleanup of pageCleanups) {
      cleanup();
    }
  };
}
