import type {
  BrowserContext,
  ElementHandle,
  Locator,
  Page,
} from "patchright";

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Coordinate = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TurnstileOption = boolean | TurnstileAutoOptions;

export type TurnstileAutoOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  selectors?: string[];
  maxCandidatesPerSelector?: number;
  logger?: (message: string) => void;
};

export type CheckTurnstileOptions = {
  page: Page;
  timeoutMs?: number;
  selectors?: string[];
  maxCandidatesPerSelector?: number;
};

const DEFAULT_TURNSTILE_SELECTORS = [
  '[name="cf-turnstile-response"]',
  'input[name="cf-turnstile-response"]',
  'iframe[src*="challenges.cloudflare.com"]',
  'iframe[title*="Cloudflare"]',
  'iframe[title*="challenge"]',
  ".cf-turnstile",
  "[data-sitekey]",
  "[data-cf-turnstile-response]",
];

const attachedPages = new WeakSet<Page>();

function normalizeOptions(
  option: TurnstileOption | undefined,
): Required<Omit<TurnstileAutoOptions, "logger">> &
  Pick<TurnstileAutoOptions, "logger"> {
  const options = typeof option === "object" ? option : {};

  return {
    timeoutMs: options.timeoutMs ?? 5000,
    intervalMs: options.intervalMs ?? 2000,
    selectors: options.selectors ?? DEFAULT_TURNSTILE_SELECTORS,
    maxCandidatesPerSelector: options.maxCandidatesPerSelector ?? 5,
    logger: options.logger,
  };
}

function getClickPoint(box: BoundingBox): { x: number; y: number } {
  const xOffset = box.width > 60 ? 30 : box.width / 2;

  return {
    x: box.x + xOffset,
    y: box.y + box.height / 2,
  };
}

async function clickBox(page: Page, box: BoundingBox): Promise<boolean> {
  if (box.width <= 0 || box.height <= 0) return false;

  const point = getClickPoint(box);
  await page.mouse.click(point.x, point.y);

  return true;
}

async function clickLocatorBox(page: Page, locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox({ timeout: 1000 }).catch(() => null);

  if (!box) return false;

  return clickBox(page, box);
}

async function clickElementOrParentBox(
  page: Page,
  element: ElementHandle<Element>,
): Promise<boolean> {
  let current: ElementHandle<Element> | null = element;

  for (let depth = 0; depth < 8 && current; depth++) {
    const box = await current.boundingBox().catch(() => null);

    if (box && (await clickBox(page, box))) {
      return true;
    }

    const parentHandle = await current
      .evaluateHandle((el) => el.parentElement)
      .catch(() => null);

    current = parentHandle?.asElement() as ElementHandle<Element> | null;
  }

  return false;
}

async function clickTurnstileLocators(
  page: Page,
  selectors: string[],
  maxCandidatesPerSelector: number,
): Promise<boolean> {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);

    for (let index = 0; index < Math.min(count, maxCandidatesPerSelector); index++) {
      const target = locator.nth(index);

      if (await clickLocatorBox(page, target).catch(() => false)) {
        return true;
      }

      const element = await target.elementHandle({ timeout: 1000 });
      if (
        element &&
        (await clickElementOrParentBox(
          page,
          element as ElementHandle<Element>,
        ).catch(() => false))
      ) {
        return true;
      }
    }
  }

  return false;
}

async function clickTurnstileHeuristic(page: Page): Promise<boolean> {
  const elements: ElementHandle<Element>[] = await page.$$(
    '[name="cf-turnstile-response"]',
  );

  if (elements.length > 0) {
    for (const element of elements) {
      if (await clickElementOrParentBox(page, element).catch(() => false)) {
        return true;
      }
    }

    return false;
  }

  const coordinates: Coordinate[] = await page.evaluate(() => {
    const coords: Coordinate[] = [];

    document.querySelectorAll("div").forEach((item) => {
      try {
        const el = item as HTMLDivElement;
        const rect = el.getBoundingClientRect();
        const css = window.getComputedStyle(el);

        if (
          css.margin === "0px" &&
          css.padding === "0px" &&
          rect.width > 290 &&
          rect.width <= 310 &&
          !el.querySelector("*")
        ) {
          coords.push({
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
          });
        }
      } catch (_err) {}
    });

    if (coords.length <= 0) {
      document.querySelectorAll("div").forEach((item) => {
        try {
          const el = item as HTMLDivElement;
          const rect = el.getBoundingClientRect();

          if (
            rect.width > 290 &&
            rect.width <= 310 &&
            !el.querySelector("*")
          ) {
            coords.push({
              x: rect.x,
              y: rect.y,
              w: rect.width,
              h: rect.height,
            });
          }
        } catch (_err) {}
      });
    }

    return coords;
  });

  for (const item of coordinates) {
    const clicked = await clickBox(page, {
      x: item.x,
      y: item.y,
      width: item.w,
      height: item.h,
    }).catch(() => false);

    if (clicked) return true;
  }

  return false;
}

export async function checkTurnstile({
  page,
  timeoutMs = 5000,
  selectors = DEFAULT_TURNSTILE_SELECTORS,
  maxCandidatesPerSelector = 5,
}: CheckTurnstileOptions): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (
        await clickTurnstileLocators(
          page,
          selectors,
          maxCandidatesPerSelector,
        )
      ) {
        return true;
      }

      if (await clickTurnstileHeuristic(page)) {
        return true;
      }
    } catch (_err) {}

    await page.waitForTimeout(500).catch(() => undefined);
  }

  return false;
}

export function installTurnstileAutoSolver(
  context: BrowserContext,
  option: TurnstileOption = true,
): () => void {
  const options = normalizeOptions(option);

  const attachPage = (page: Page): void => {
    if (attachedPages.has(page)) return;
    attachedPages.add(page);

    let closed = false;
    let running = false;

    const run = async (): Promise<void> => {
      if (closed || running) return;

      running = true;

      try {
        const clicked = await checkTurnstile({
          page,
          timeoutMs: options.timeoutMs,
          selectors: options.selectors,
          maxCandidatesPerSelector: options.maxCandidatesPerSelector,
        });

        if (clicked) {
          options.logger?.("turnstile candidate clicked");
        }
      } catch (error) {
        options.logger?.(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        running = false;
      }
    };

    const interval = setInterval(run, options.intervalMs);
    const cleanup = (): void => {
      closed = true;
      clearInterval(interval);
    };

    page.on("close", cleanup);
    page.on("domcontentloaded", run);
    page.on("load", run);
    page.on("framenavigated", run);

    setTimeout(run, 0);
  };

  context.pages().forEach(attachPage);
  context.on("page", attachPage);

  return () => {
    context.off("page", attachPage);
  };
}

