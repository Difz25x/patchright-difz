import type {
  BrowserContext,
  CDPSession,
  Page,
} from "patchright";

type ClearCookiesOptions = Parameters<BrowserContext["clearCookies"]>[0];

export type ClearSessionArtifactsOptions = {
  page?: Page;
  context?: BrowserContext;
  pages?: Page[];
  cookies?: boolean;
  cookieOptions?: ClearCookiesOptions;
  storage?: boolean;
  headers?: boolean;
  permissions?: boolean;
  origins?: string[];
};

export type ClearBrowserArtifactsOptions = ClearSessionArtifactsOptions & {
  cache?: boolean;
  serviceWorkers?: boolean;
};

export type ClearBrowserArtifactsResult = {
  cookies: boolean;
  headers: boolean;
  permissions: boolean;
  storagePages: number;
  cachePages: number;
  serviceWorkerPages: number;
  cdpOrigins: number;
  errors: string[];
};

const DEFAULT_CLEAR_RESULT: ClearBrowserArtifactsResult = {
  cookies: false,
  headers: false,
  permissions: false,
  storagePages: 0,
  cachePages: 0,
  serviceWorkerPages: 0,
  cdpOrigins: 0,
  errors: [],
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function uniquePages(pages: Page[]): Page[] {
  return [...new Set(pages)];
}

function resolveContext(
  context: BrowserContext | undefined,
  page: Page | undefined,
): BrowserContext {
  const resolved = context ?? page?.context();

  if (!resolved) {
    throw new Error("clear artifacts requires a page or browser context");
  }

  return resolved;
}

function pagesForContext({
  context,
  page,
  pages,
}: {
  context: BrowserContext;
  page?: Page;
  pages?: Page[];
}): Page[] {
  return uniquePages([
    ...(pages ?? []),
    ...(page ? [page] : []),
    ...context.pages(),
  ]);
}

async function clearPageStorage(
  page: Page,
  origins: string[] | undefined,
): Promise<boolean> {
  return page
    .evaluate(async (allowedOrigins) => {
      const shouldClear =
        allowedOrigins.length === 0 || allowedOrigins.includes(location.origin);

      if (!shouldClear) return false;

      localStorage.clear();
      sessionStorage.clear();

      if ("databases" in indexedDB && typeof indexedDB.databases === "function") {
        const databases = await indexedDB.databases().catch(() => []);

        await Promise.all(
          databases
            .map((database) => database.name)
            .filter((name): name is string => Boolean(name))
            .map(
              (name) =>
                new Promise<void>((resolve) => {
                  const request = indexedDB.deleteDatabase(name);
                  request.onsuccess = () => resolve();
                  request.onerror = () => resolve();
                  request.onblocked = () => resolve();
                }),
            ),
        );
      }

      return true;
    }, origins ?? [])
    .catch(() => false);
}

async function clearPageCache(page: Page): Promise<boolean> {
  return page
    .evaluate(async () => {
      if (!("caches" in window)) return false;

      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      return true;
    })
    .catch(() => false);
}

async function unregisterServiceWorkers(page: Page): Promise<boolean> {
  return page
    .evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;

      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      return registrations.length > 0;
    })
    .catch(() => false);
}

async function withCDPSession<T>(
  context: BrowserContext,
  pages: Page[],
  callback: (session: CDPSession) => Promise<T>,
): Promise<T | undefined> {
  const page = pages[0];
  if (!page) return undefined;

  const session = await context.newCDPSession(page).catch(() => undefined);
  if (!session) return undefined;

  try {
    return await callback(session);
  } finally {
    await session.detach().catch(() => undefined);
  }
}

async function storageOrigins(
  context: BrowserContext,
  explicitOrigins: string[] | undefined,
): Promise<string[]> {
  if (explicitOrigins) return explicitOrigins;

  const state = await context.storageState({ indexedDB: true }).catch(() => undefined);

  return state?.origins.map((origin) => origin.origin) ?? [];
}

async function clearCdpStorage(
  context: BrowserContext,
  pages: Page[],
  origins: string[] | undefined,
  result: ClearBrowserArtifactsResult,
): Promise<void> {
  const resolvedOrigins = await storageOrigins(context, origins);

  if (resolvedOrigins.length === 0) return;

  await withCDPSession(context, pages, async (session) => {
    for (const origin of resolvedOrigins) {
      try {
        await session.send("Storage.clearDataForOrigin", {
          origin,
          storageTypes: "all",
        });
        result.cdpOrigins++;
      } catch (error) {
        result.errors.push(errorMessage(error));
      }
    }
  });
}

export async function clearSessionArtifacts({
  page,
  context: explicitContext,
  pages: explicitPages,
  cookies = true,
  cookieOptions,
  storage = true,
  headers = true,
  permissions = true,
  origins,
}: ClearSessionArtifactsOptions): Promise<ClearBrowserArtifactsResult> {
  const context = resolveContext(explicitContext, page);
  const pages = pagesForContext({ context, page, pages: explicitPages });
  const result: ClearBrowserArtifactsResult = {
    ...DEFAULT_CLEAR_RESULT,
    errors: [],
  };

  if (cookies) {
    await context
      .clearCookies(cookieOptions)
      .then(() => {
        result.cookies = true;
      })
      .catch((error) => result.errors.push(errorMessage(error)));
  }

  if (headers) {
    await context
      .setExtraHTTPHeaders({})
      .then(() => {
        result.headers = true;
      })
      .catch((error) => result.errors.push(errorMessage(error)));

    await Promise.all(
      pages.map((targetPage) =>
        targetPage.setExtraHTTPHeaders({}).catch((error) => {
          result.errors.push(errorMessage(error));
        }),
      ),
    );
  }

  if (permissions) {
    await context
      .clearPermissions()
      .then(() => {
        result.permissions = true;
      })
      .catch((error) => result.errors.push(errorMessage(error)));
  }

  if (storage) {
    const cleared = await Promise.all(
      pages.map((targetPage) => clearPageStorage(targetPage, origins)),
    );
    result.storagePages = cleared.filter(Boolean).length;

    await clearCdpStorage(context, pages, origins, result);
  }

  return result;
}

export async function clearBrowserArtifacts({
  page,
  context: explicitContext,
  pages: explicitPages,
  cookies = true,
  cookieOptions,
  storage = true,
  headers = true,
  permissions = true,
  origins,
  cache = true,
  serviceWorkers = true,
}: ClearBrowserArtifactsOptions): Promise<ClearBrowserArtifactsResult> {
  const context = resolveContext(explicitContext, page);
  const pages = pagesForContext({ context, page, pages: explicitPages });
  const result = await clearSessionArtifacts({
    page,
    context,
    pages,
    cookies,
    cookieOptions,
    storage,
    headers,
    permissions,
    origins,
  });

  if (cache) {
    const pageCaches = await Promise.all(pages.map(clearPageCache));
    result.cachePages = pageCaches.filter(Boolean).length;

    await withCDPSession(context, pages, async (session) => {
      await session
        .send("Network.clearBrowserCache")
        .catch((error) => result.errors.push(errorMessage(error)));
    });
  }

  if (serviceWorkers) {
    const unregistered = await Promise.all(pages.map(unregisterServiceWorkers));
    result.serviceWorkerPages = unregistered.filter(Boolean).length;
  }

  return result;
}
