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

const FALLBACK_SELECTORS = ["iframe", "div", "button", '[role="checkbox"]'];
const FALLBACK_LIMIT = 80;
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
  const xOffset = box.width > 80 ? 30 : box.width / 2;

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

function looksLikeTurnstileBox(box: BoundingBox): boolean {
  return box.width >= 260 && box.width <= 340 && box.height >= 35 && box.height <= 90;
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

    if (box && looksLikeTurnstileBox(box) && (await clickBox(page, box))) {
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

async function clickTurnstileFallback(page: Page): Promise<boolean> {
  const candidates: BoundingBox[] = [];

  for (const selector of FALLBACK_SELECTORS) {
    const locator = page.locator(selector);
    const count = Math.min(
      await locator.count().catch(() => 0),
      FALLBACK_LIMIT,
    );

    for (let index = 0; index < count; index++) {
      const box = await locator
        .nth(index)
        .boundingBox({ timeout: 250 })
        .catch(() => null);

      if (box && looksLikeTurnstileBox(box)) {
        candidates.push(box);
      }
    }
  }

  candidates.sort((left, right) => {
    const leftScore = Math.abs(left.width - 300) + Math.abs(left.height - 65);
    const rightScore = Math.abs(right.width - 300) + Math.abs(right.height - 65);

    return leftScore - rightScore;
  });

  for (const box of candidates) {
    if (await clickBox(page, box).catch(() => false)) return true;
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

      if (await clickTurnstileFallback(page)) {
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
