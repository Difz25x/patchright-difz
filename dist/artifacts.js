const DEFAULT_CLEAR_RESULT = {
    cookies: false,
    headers: false,
    permissions: false,
    storagePages: 0,
    cachePages: 0,
    serviceWorkerPages: 0,
    cdpOrigins: 0,
    errors: [],
};
const errMsg = (e) => (e instanceof Error ? e.message : String(e));
function resolveContext(context, page) {
    const resolved = context ?? page?.context();
    if (!resolved)
        throw new Error("clear artifacts requires a page or browser context");
    return resolved;
}
function pagesForContext(context, page, extra) {
    return [...new Set([...(extra ?? []), ...(page ? [page] : []), ...context.pages()])];
}
async function clearPageStorage(page, origins) {
    return page
        .evaluate(async (allowedOrigins) => {
        const shouldClear = allowedOrigins.length === 0 || allowedOrigins.includes(location.origin);
        if (!shouldClear)
            return false;
        localStorage.clear();
        sessionStorage.clear();
        if ("databases" in indexedDB && typeof indexedDB.databases === "function") {
            const databases = await indexedDB.databases().catch(() => []);
            await Promise.all(databases
                .map((database) => database.name)
                .filter((name) => Boolean(name))
                .map((name) => new Promise((resolve) => {
                const request = indexedDB.deleteDatabase(name);
                request.onsuccess = () => resolve();
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
            })));
        }
        return true;
    }, origins ?? [])
        .catch(() => false);
}
async function clearPageCache(page) {
    return page
        .evaluate(async () => {
        if (!("caches" in window))
            return false;
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        return true;
    })
        .catch(() => false);
}
async function unregisterServiceWorkers(page) {
    return page
        .evaluate(async () => {
        if (!("serviceWorker" in navigator))
            return false;
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        return registrations.length > 0;
    })
        .catch(() => false);
}
async function withCDPSession(context, pages, callback) {
    const page = pages[0];
    if (!page)
        return undefined;
    const session = await context.newCDPSession(page).catch(() => undefined);
    if (!session)
        return undefined;
    try {
        return await callback(session);
    }
    finally {
        await session.detach().catch(() => undefined);
    }
}
async function storageOrigins(context, explicitOrigins) {
    if (explicitOrigins)
        return explicitOrigins;
    const state = await context.storageState({ indexedDB: true }).catch(() => undefined);
    return state?.origins.map((origin) => origin.origin) ?? [];
}
async function clearCdpStorage(context, pages, origins, result) {
    const resolvedOrigins = await storageOrigins(context, origins);
    if (resolvedOrigins.length === 0)
        return;
    await withCDPSession(context, pages, async (session) => {
        for (const origin of resolvedOrigins) {
            try {
                await session.send("Storage.clearDataForOrigin", { origin, storageTypes: "all" });
                result.cdpOrigins++;
            }
            catch (error) {
                result.errors.push(errMsg(error));
            }
        }
    });
}
export async function clearSessionArtifacts({ page, context: explicitContext, pages: explicitPages, cookies = true, cookieOptions, storage = true, headers = true, permissions = true, origins, }) {
    const context = resolveContext(explicitContext, page);
    const pages = pagesForContext(context, page, explicitPages);
    const result = { ...DEFAULT_CLEAR_RESULT, errors: [] };
    if (cookies) {
        await context.clearCookies(cookieOptions)
            .then(() => { result.cookies = true; })
            .catch((e) => result.errors.push(errMsg(e)));
    }
    if (headers) {
        await context.setExtraHTTPHeaders({})
            .then(() => { result.headers = true; })
            .catch((e) => result.errors.push(errMsg(e)));
        await Promise.all(pages.map((p) => p.setExtraHTTPHeaders({}).catch((e) => result.errors.push(errMsg(e)))));
    }
    if (permissions) {
        await context.clearPermissions()
            .then(() => { result.permissions = true; })
            .catch((e) => result.errors.push(errMsg(e)));
    }
    if (storage) {
        const cleared = await Promise.all(pages.map((p) => clearPageStorage(p, origins)));
        result.storagePages = cleared.filter(Boolean).length;
        await clearCdpStorage(context, pages, origins, result);
    }
    return result;
}
export async function clearBrowserArtifacts({ page, context: explicitContext, pages: explicitPages, cookies = true, cookieOptions, storage = true, headers = true, permissions = true, origins, cache = true, serviceWorkers = true, }) {
    const context = resolveContext(explicitContext, page);
    const pages = pagesForContext(context, page, explicitPages);
    const result = await clearSessionArtifacts({
        page, context, pages, cookies, cookieOptions, storage, headers, permissions, origins,
    });
    if (cache) {
        const pageCaches = await Promise.all(pages.map(clearPageCache));
        result.cachePages = pageCaches.filter(Boolean).length;
        await withCDPSession(context, pages, async (session) => {
            await session.send("Network.clearBrowserCache")
                .catch((e) => result.errors.push(errMsg(e)));
        });
    }
    if (serviceWorkers) {
        const unregistered = await Promise.all(pages.map(unregisterServiceWorkers));
        result.serviceWorkerPages = unregistered.filter(Boolean).length;
    }
    return result;
}
//# sourceMappingURL=artifacts.js.map