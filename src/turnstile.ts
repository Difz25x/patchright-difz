import type {
  BrowserContext,
  ElementHandle,
  Locator,
  Page,
} from "patchright";
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
  include?: CloudflareDataIncludeOptions;
};

type BrowserCookie = Awaited<
  ReturnType<BrowserContext["cookies"]>
>[number];

export type CloudflareDataIncludeOptions = {
  url?: boolean;
  userAgent?: boolean;
  documentCookieNames?: boolean;
  cookies?: boolean;
  cloudflareCookies?: boolean;
  clearanceCookie?: boolean;
  cfClearance?: boolean;
  tokens?: boolean;
  responses?: boolean;
  widgets?: boolean;
  iframes?: boolean;
  scripts?: boolean;
  challengeFields?: boolean;
  rayIds?: boolean;
  challengeOptions?: boolean;
  storage?: boolean;
};

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
  url?: string;
  userAgent?: string;
  documentCookieNames: string[];
  cookies: CloudflareCookie[];
  cloudflareCookies: CloudflareCookie[];
  clearanceCookie?: string;
  cfClearance?: string;
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
  '[data-ray], [data-cf-ray], [data-sitekey], [data-cf-turnstile-response]';

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
  waitAfterClickMs: 150,
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

type NormalizedCloudflareDataIncludes = Required<
  Omit<CloudflareDataIncludeOptions, "cfClearance">
>;

const watchedPages = new WeakMap<Page, PageWatch>();

const DEFAULT_CLOUDFLARE_DATA_INCLUDES: NormalizedCloudflareDataIncludes = {
  url: true,
  userAgent: true,
  documentCookieNames: true,
  cookies: true,
  cloudflareCookies: true,
  clearanceCookie: true,
  tokens: true,
  responses: true,
  widgets: true,
  iframes: true,
  scripts: true,
  challengeFields: true,
  rayIds: true,
  challengeOptions: true,
  storage: true,
};

function normalizeOptions(
  option: TurnstileOption | undefined,
): NormalizedTurnstileOptions {
  const options = typeof option === "object" ? option : {};

  return {
    timeoutMs: options.timeoutMs ?? 3000,
    intervalMs: options.intervalMs ?? 750,
    selectors: options.selectors ?? DEFAULT_TURNSTILE_SELECTORS,
    maxCandidatesPerSelector: options.maxCandidatesPerSelector ?? 5,
    foreground: options.foreground ?? DEFAULT_CLICK_BEHAVIOR.foreground,
    clickDelayMs: options.clickDelayMs ?? DEFAULT_CLICK_BEHAVIOR.clickDelayMs,
    mouseMoveSteps: options.mouseMoveSteps ?? DEFAULT_CLICK_BEHAVIOR.mouseMoveSteps,
    waitAfterClickMs: options.waitAfterClickMs ?? DEFAULT_CLICK_BEHAVIOR.waitAfterClickMs,
    clickCooldownMs: options.clickCooldownMs ?? 8000,
    maxClickCooldownMs: options.maxClickCooldownMs ?? 60000,
    logger: options.logger,
  };
}

function normalizeCloudflareDataIncludes(
  include: CloudflareDataIncludeOptions | undefined,
): NormalizedCloudflareDataIncludes {
  return {
    ...DEFAULT_CLOUDFLARE_DATA_INCLUDES,
    ...include,
    clearanceCookie:
      include?.clearanceCookie ??
      include?.cfClearance ??
      DEFAULT_CLOUDFLARE_DATA_INCLUDES.clearanceCookie,
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

function getClickPoint(box: BoundingBox): { x: number; y: number } {
  const xOffset = box.width > 80 ? 30 : box.width / 2;

  return {
    x: box.x + xOffset,
    y: box.y + box.height / 2,
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
  if (!options.foreground) return;

  await page.bringToFront().catch(() => undefined);
  await page
    .evaluate(() => {
      window.focus();
      document.body?.focus?.();
    })
    .catch(() => undefined);
}

async function clickBox(
  page: Page,
  box: BoundingBox,
  options: ClickBehaviorOptions,
): Promise<boolean> {
  if (box.width <= 0 || box.height <= 0) return false;

  const point = getClickPoint(box);
  await preparePageForClick(page, options);
  const cursor = installRealCursor(page);

  await cursor.click(point, {
    moveSpeed: Math.max(1, options.mouseMoveSteps),
    overshootThreshold: 420,
    waitForClick: options.clickDelayMs,
  });

  if (options.waitAfterClickMs > 0) {
    await page.waitForTimeout(options.waitAfterClickMs).catch(() => undefined);
  }

  return true;
}

function looksLikeTurnstileBox(box: BoundingBox): boolean {
  return box.width >= 260 && box.width <= 340 && box.height >= 35 && box.height <= 90;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function isCloudflareCookie(cookie: BrowserCookie): boolean {
  return /^(?:__cf|_cf|cf_)/i.test(cookie.name);
}

function normalizeCookieUrls(urls: string | string[] | undefined): string[] | undefined {
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
): Promise<boolean> {
  const box = await locator.boundingBox({ timeout: 1000 }).catch(() => null);

  if (!box) return false;

  const point = getClickPoint(box);
  await preparePageForClick(page, options);

  const clickedByCursor = await installRealCursor(page)
    .click(point, {
      moveSpeed: Math.max(1, options.mouseMoveSteps),
      overshootThreshold: 420,
      waitForClick: options.clickDelayMs,
    })
    .then(() => true)
    .catch(() => false);

  if (clickedByCursor) {
    if (options.waitAfterClickMs > 0) {
      await page.waitForTimeout(options.waitAfterClickMs).catch(() => undefined);
    }

    return true;
  }

  return locator
    .click({
      force: true,
      timeout: 1000,
      delay: options.clickDelayMs,
      steps: options.mouseMoveSteps,
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
): Promise<boolean> {
  let current: ElementHandle<Element> | null = element;

  for (let depth = 0; depth < 8 && current; depth++) {
    const box = await current.boundingBox().catch(() => null);

    if (box && looksLikeTurnstileBox(box) && (await clickBox(page, box, options))) {
      return true;
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

async function clickTurnstileLocators(
  page: Page,
  selectors: string[],
  maxCandidatesPerSelector: number,
  options: ClickBehaviorOptions,
): Promise<boolean> {
  for (const selector of selectors) {
    if (isOptionalResponseSelector(selector)) continue;

    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < Math.min(count, maxCandidatesPerSelector); index++) {
      const target = locator.nth(index);

      if (await clickLocatorBox(page, target, options).catch(() => false)) {
        return true;
      }

      const element = await target
        .elementHandle({ timeout: 1000 })
        .catch(() => null);

      if (element) {
        try {
          if (
            await clickElementOrParentBox(
              page,
              element as ElementHandle<Element>,
              options,
            ).catch(() => false)
          ) {
            return true;
          }
        } finally {
          await element.dispose().catch(() => undefined);
        }
      }
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

    for (let index = 0; index < Math.min(count, maxCandidatesPerSelector); index++) {
      const target = locator.nth(index);
      const box = await target
        .boundingBox({ timeout: 250 })
        .catch(() => null);

      if (box && looksLikeTurnstileBox(box)) return true;
    }

    if (count > 0 && !isOptionalResponseSelector(selector)) return true;
  }

  return false;
}

async function hasTurnstileFallback(page: Page): Promise<boolean> {
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
  return page
    .evaluate(() => {
      const title = document.title || "";
      const bodyText = document.body?.innerText?.slice(0, 5000) || "";
      const locationText = location.href || "";
      const challengeOptions = (window as Window & { _cf_chl_opt?: unknown })
        ._cf_chl_opt;
      const text = `${title}\n${bodyText}\n${locationText}`;

      return Boolean(
        challengeOptions ||
          (
            /just a moment|security verification|checking your browser/i.test(
              text,
            ) &&
            /cloudflare|verify you are not a bot|malicious bots|ray id/i.test(
              text,
            )
          ),
      );
    })
    .catch(() => false);
}

async function clickTurnstileFallback(
  page: Page,
  options: ClickBehaviorOptions,
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
    const rightScore = Math.abs(right.width - 300) + Math.abs(right.height - 65);

    return leftScore - rightScore;
  });

  for (const box of candidates) {
    if (await clickBox(page, box, options).catch(() => false)) return true;
  }

  return false;
}

async function getCloudflarePageData(
  page: Page,
  minTokenLength = DEFAULT_TOKEN_MIN_LENGTH,
): Promise<
  Omit<CloudflareData, "cookies" | "cloudflareCookies" | "clearanceCookie">
> {
  return page.evaluate(
    ({
      responseSelectors,
      cloudflareFieldSelector,
      minTokenLength,
    }) => {
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

      const pushUnique = (target: string[], value: string | null | undefined): void => {
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

        if (
          !responseData.some(
            (existing) => existing.value === entry.value,
          )
        ) {
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
        document.querySelectorAll(cloudflareFieldSelector).forEach((element) => {
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
          if (!key || !/cloudflare|turnstile|cf[_-]|cfchl|cf_chl|challenge/i.test(key)) {
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

      const challengeOptions = (() => {
        try {
          const value = (window as Window & { _cf_chl_opt?: unknown })._cf_chl_opt;
          return value === undefined
            ? null
            : JSON.parse(JSON.stringify(value)) as unknown;
        } catch (_error) {
          return null;
        }
      })();
      const managedChallengeText = `${document.title || ""}\n${
        document.body?.innerText?.slice(0, 5000) ?? ""
      }\n${location.href}`;
      const managedChallenge = Boolean(
        challengeOptions ||
          (
            /just a moment|security verification|checking your browser/i.test(
              managedChallengeText,
            ) &&
            /cloudflare|verify you are not a bot|malicious bots|ray id/i.test(
              managedChallengeText,
            )
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
  if (
    await hasTurnstileLocators(
      page,
      selectors,
      maxCandidatesPerSelector,
    )
  ) {
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
  const data = await getCloudflareData({
    page,
    context,
    urls,
    minTokenLength,
  });

  return Boolean(data.clearanceCookie) ||
    data.turnstile.tokens.some((token) => token.trim().length >= minTokenLength);
}

export async function getCloudflareData({
  page,
  context = page?.context(),
  urls,
  minTokenLength = DEFAULT_TOKEN_MIN_LENGTH,
  include,
}: CloudflareDataOptions): Promise<CloudflareData> {
  const includes = normalizeCloudflareDataIncludes(include);
  const pageData = page
    ? await getCloudflarePageData(page, minTokenLength)
    : {
        url: undefined,
        userAgent: undefined,
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
  const shouldReadCookies =
    includes.cookies ||
    includes.cloudflareCookies ||
    includes.clearanceCookie;
  const rawCookies = context && shouldReadCookies
    ? await context.cookies(normalizeCookieUrls(urls)).catch(() => [])
    : [];
  const cloudflareCookieValues = rawCookies.filter(isCloudflareCookie);
  const clearanceCookie = cloudflareCookieValues.find(
    (cookie) => cookie.name === "cf_clearance",
  );
  const cookieSolved = Boolean(clearanceCookie);

  return {
    url: includes.url ? pageData.url : undefined,
    userAgent: includes.userAgent ? pageData.userAgent : undefined,
    documentCookieNames: includes.documentCookieNames
      ? pageData.documentCookieNames
      : [],
    cookies: includes.cookies ? rawCookies.map(toCookieData) : [],
    cloudflareCookies: includes.cloudflareCookies
      ? cloudflareCookieValues.map(toCookieData)
      : [],
    clearanceCookie: includes.clearanceCookie
      ? clearanceCookie?.value
      : undefined,
    cfClearance: includes.clearanceCookie ? clearanceCookie?.value : undefined,
    turnstile: {
      ...pageData.turnstile,
      solved: pageData.turnstile.solved,
      responses: includes.responses ? pageData.turnstile.responses : [],
      tokens: includes.tokens ? unique(pageData.turnstile.tokens) : [],
      sitekeys: unique(pageData.turnstile.sitekeys),
      widgets: includes.widgets ? pageData.turnstile.widgets : [],
      iframes: includes.iframes ? unique(pageData.turnstile.iframes) : [],
      scripts: includes.scripts ? unique(pageData.turnstile.scripts) : [],
    },
    challenge: {
      ...pageData.challenge,
      cleared: cookieSolved,
      fields: includes.challengeFields ? pageData.challenge.fields : [],
      rayIds: includes.rayIds ? pageData.challenge.rayIds : [],
      options: includes.challengeOptions ? pageData.challenge.options : null,
    },
    storage: includes.storage
      ? pageData.storage
      : {
          local: [],
          session: [],
        },
  };
}

export async function isCloudflareManagedChallenge({
  page,
}: IsCloudflareManagedChallengeOptions): Promise<boolean> {
  return isManagedChallengePage(page);
}

async function solveTurnstileOnce({
  page,
  selectors = DEFAULT_TURNSTILE_SELECTORS,
  maxCandidatesPerSelector = 5,
  foreground = DEFAULT_CLICK_BEHAVIOR.foreground,
  clickDelayMs = DEFAULT_CLICK_BEHAVIOR.clickDelayMs,
  mouseMoveSteps = DEFAULT_CLICK_BEHAVIOR.mouseMoveSteps,
  waitAfterClickMs = DEFAULT_CLICK_BEHAVIOR.waitAfterClickMs,
}: CheckTurnstileOptions): Promise<SolveTurnstileResult> {
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

  if (
    await clickTurnstileLocators(
      page,
      selectors,
      maxCandidatesPerSelector,
      clickOptions,
    )
  ) {
    return { clicked: true, status: "clicked" };
  }

  if (await clickTurnstileFallback(page, clickOptions)) {
    return { clicked: true, status: "clicked" };
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
      });

      if (result.status === "managed-challenge") {
        clickAttempts = 0;
        nextClickAt = Date.now() + Math.max(options.intervalMs, 5000);

        if (Date.now() - lastManagedChallengeLogAt > 30000) {
          lastManagedChallengeLogAt = Date.now();
          options.logger?.(
            "cloudflare managed challenge detected; turnstile clicker paused",
          );
        }

        return;
      }

      if (result.status === "solved" || result.status === "not-found") {
        clickAttempts = 0;
        nextClickAt = 0;
        return;
      }

      if (result.clicked) {
        clickAttempts++;

        const cooldown = Math.min(
          options.maxClickCooldownMs,
          options.clickCooldownMs * Math.min(clickAttempts, 6),
        );

        nextClickAt = Date.now() + cooldown;
        options.logger?.(
          `turnstile candidate clicked; next retry in ${cooldown}ms`,
        );
      }
    } catch (error) {
      options.logger?.(
        error instanceof Error ? error.message : String(error),
      );
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
